'use strict';
/**
 * nativeExtract.js  –  Moteur d'extraction universel natif (Node.js)
 *
 * Inclut directement la logique des extracteurs de l'extension Chrome/Firefox
 * et de QuickJS WASM au cœur du serveur Node.js.
 *
 * Permet à TOUS les appareils (smartphones iOS/Android, Smart TVs, tablettes,
 * PC sans extension) de profiter du Lecteur Orvix Natif (HLSPlayer - 0 pub)
 * sans nécessiter l'installation d'une extension.
 *
 * Caractéristiques clés :
 * 1. Contournement DNS Cloudflare (1.1.1.1) & Google (8.8.8.8) pour neutraliser
 *    l'empoisonnement DNS des FAI français (Arcom) sur voe.sx, uqload, etc.
 * 2. Headers navigateurs réalistes (User-Agent Chrome moderne).
 * 3. QuickJS WASM pour désobfuscation dynamique (fsvid, vidzy).
 * 4. Relais d'en-têtes léger (/api/extract/stream) pour injecter Referer/Origin
 *    sur mobile/TV quand le CDN de l'hébergeur le requiert.
 */

const express = require('express');
const path    = require('path');
const vm      = require('vm');
const fs      = require('fs');
const dns     = require('node:dns');
const { Agent, setGlobalDispatcher, buildConnector } = require('undici');
const {
    resolveExtractorsPath,
    resolveQuickJsPath,
} = require('../utils/extractorsLocator');
const {
    encodeSignedToken,
    decodeSignedToken,
    signingConfigured,
    isPublicHttpUrl,
} = require('../utils/mediaSigning');
const { rewriteHlsPlaylist } = require('../utils/hlsManifestRewrite');
const {
    acquireStreamSlot,
    relayLimit,
} = require('../utils/relayLimiter');

/** Route servant de contexte à la signature des URLs relayées. */
const RELAY_TOKEN_ROUTE = '/api/extract/stream';

const router = express.Router();

// ────────────────────────────────────────────────────────────────────────────
// 1. Contournement DNS FAI : Quad9 (9.9.9.9) & Cloudflare (1.1.1.1)
// ────────────────────────────────────────────────────────────────────────────

dns.setServers(['9.9.9.9', '149.112.112.112', '1.1.1.1', '1.0.0.1']);

const customLookup = (hostname, opts, cb) => {
    if (typeof opts === 'function') { cb = opts; opts = {}; }
    dns.resolve4(hostname, (err, addrs) => {
        if (err || !addrs || !addrs.length) return cb(err || new Error(`No DNS record for ${hostname}`));
        if (opts && opts.all) {
            cb(null, addrs.map(a => ({ address: a, family: 4 })));
        } else {
            cb(null, addrs[0], 4);
        }
    });
};

try {
    const connector = buildConnector({ lookup: customLookup });
    setGlobalDispatcher(new Agent({ connect: connector }));
} catch (e) {
    console.warn('[nativeExtract] Avertissement init dispatcher undici :', e.message);
}

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ────────────────────────────────────────────────────────────────────────────
// 2. Initialisation & Chargement du Moteur d'Extraction Sandboxé (VM Node)
// ────────────────────────────────────────────────────────────────────────────

let extractors = null;

function loadExtractors() {
    if (extractors) return extractors;

    // La localisation (et le message d'erreur actionnable) vit dans
    // `utils/extractorsLocator.js`, testable sans Express ni undici.
    const extractorsPath = resolveExtractorsPath();
    const quickjsPath    = resolveQuickJsPath();

    const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        atob: (s) => Buffer.from(s, 'base64').toString('binary'),
        btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
        TextDecoder,
        TextEncoder,
        URL,
        URLSearchParams,
        AbortController: globalThis.AbortController,
        AbortSignal: globalThis.AbortSignal,
        Headers: globalThis.Headers,
        Request: globalThis.Request,
        Response: globalThis.Response,
        Buffer,
        crypto: globalThis.crypto,
        chrome: { runtime: { id: 'orvix-server' } },
        fetch: async (url, options = {}) => {
            const headers = {
                'User-Agent': BROWSER_UA,
                'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept': '*/*',
                ...(options.headers || {}),
            };
            return globalThis.fetch(url, { ...options, headers });
        },
    };

    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.self = sandbox;

    const ctx = vm.createContext(sandbox);

    if (quickjsPath) {
        const quickjsCode = fs.readFileSync(quickjsPath, 'utf8');
        vm.runInContext(quickjsCode, ctx);
    } else {
        console.warn('[nativeExtract] Moteur QuickJS absent : fsvid/vidzy seront extraits par regex seulement.');
    }

    const extractorsCode = fs.readFileSync(extractorsPath, 'utf8');
    vm.runInContext(extractorsCode, ctx);

    extractors = sandbox.OrvixExtractors;
    console.log(`[nativeExtract] ✓ Moteur universel chargé (${extractorsPath}) : voe, fsvid, vidzy, vidmoly, sibnet, uqload, veev, doodstream, lulustream, vidara, seekstreaming`);
    return extractors;
}

try {
    loadExtractors();
} catch (e) {
    console.error('[nativeExtract] Échec init extracteurs :', e.message);
}

if (!signingConfigured()) {
    console.warn(
        '[nativeExtract] MEDIA_SIGNING_SECRET absent : les URLs du relais de flux '
        + 'voyagent en clair (proxy ouvert). Renseignez ce secret en production.',
    );
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Protection SSRF : Whitelist des domaines autorisés
// ────────────────────────────────────────────────────────────────────────────

const ALLOWED_HOST_PATTERNS = [
    /^(?:[\w-]+\.)?voe\.[a-z]{2,24}$/i,
    /^(?:[\w-]+\.)?vidzy\.[a-z]{2,24}$/i,
    /^(?:[\w-]+\.)?fs(?:vid|mirror\d*)\.[a-z]{2,24}$/i,
    /^(?:[\w-]+\.)?(?:vidmoly|ansembed)\.[a-z]{2,24}$/i,
    /^(?:[\w-]+\.)?uqload\.[a-z]{2,24}$/i,
    /^video\.sibnet\.ru$/i,
    /^(?:[\w-]+\.)?(?:dood|d0000d|d000d|d0o0d|do0od|doodstream|doodster|dooodster|dooood|doodcdn|myvidplay|dsvplay|doply|playmogo|ds2play|ds2video|dood2|all3do|do7go|vidply|vide0|vvide0|d-s)\.[a-z]{2,24}$/i,
    /^(?:[\w-]+\.)?(?:lulustream|luluvdo|luluvdoo|luluvid|lulu|streamhihi|d00ds|cdn1)\.[a-z]{2,24}$/i,
    /^(?:[\w-]+\.)?(?:veev|poophq|doods)\.[a-z]{2,24}$/i,
    /^(?:[\w-]+\.)?vidara\.[a-z]{2,24}$/i,
    /^(?:[\w-]+\.)?(?:embed4me|seekstreaming|seekstream|embedseek|seekplayer|seeks|seekplays|servicecatalog|technicalcatalog)\.[a-z]{2,24}$/i,
];

function isAllowedUrl(rawUrl) {
    let parsed;
    try { parsed = new URL(String(rawUrl || '').trim()); } catch { return false; }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;

    const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
    if (
        /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?)/.test(host) ||
        host === 'localhost'
    ) return false;

    if (ALLOWED_HOST_PATTERNS.some(p => p.test(host))) return true;

    try {
        const loadedExt = loadExtractors();
        if (loadedExt && typeof loadedExt.detectEmbedType === 'function' && loadedExt.detectEmbedType(rawUrl)) {
            return true;
        }
    } catch (_) {}

    return false;
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Normalisation unifiée des flux & Génération de streamUrl de repli
// ────────────────────────────────────────────────────────────────────────────

/**
 * Construit l'URL de relais d'un flux.
 *
 * La cible et le Referer voyagent dans un jeton signé : sans lui, l'endpoint
 * serait un proxy ouvert (n'importe qui pourrait faire télécharger n'importe
 * quelle URL par le serveur, en-têtes compris). La signature n'est utilisée
 * que si `MEDIA_SIGNING_SECRET` est configuré ; sinon on retombe sur les
 * paramètres en clair pour ne pas casser les installations de développement,
 * et un avertissement est journalisé au démarrage.
 */
function buildRelayUrl(rawUrl, referer, origin) {
    if (signingConfigured()) {
        const token = encodeSignedToken(
            RELAY_TOKEN_ROUTE,
            JSON.stringify({ u: rawUrl, r: referer, o: origin || null }),
        );
        return `/api/extract/stream?t=${encodeURIComponent(token)}`;
    }

    const params = new URLSearchParams({ url: rawUrl });
    if (referer) params.set('referer', referer);
    if (origin) params.set('origin', origin);
    return `/api/extract/stream?${params.toString()}`;
}

function normalizeResult(result, embedUrl) {
    if (!result || !result.success) return null;

    const rawUrl = result.hlsUrl || result.m3u8Url || result.mp4Url || result.directUrl
                 || (Array.isArray(result.hlsCandidates) && result.hlsCandidates[0]?.url)
                 || null;

    if (!rawUrl) return null;

    const hoster = result.source || (extractors?.detectEmbedType ? extractors.detectEmbedType(embedUrl) : null);

    // Les hébergeurs comme Sibnet bloquent si Referer absent. Sur mobile/TV sans DNR,
    // on fournit streamUrl qui relaie les headers nécessaires.
    const needsRelay = Boolean(result.headers || result.referer || hoster === 'sibnet');
    const referer = result.referer || (needsRelay ? embedUrl : null);

    let streamUrl = null;
    if (needsRelay && referer) {
        streamUrl = buildRelayUrl(rawUrl, referer, result.origin || null);
    }

    return {
        success   : true,
        m3u8Url   : rawUrl,
        streamUrl : streamUrl || rawUrl,
        hoster    : hoster || 'direct',
        fromCache : Boolean(result.fromCache),
        headers   : result.headers || (referer ? { Referer: referer } : null),
        origin    : result.origin  || null,
        referer   : referer,
    };
}

/**
 * Fonction interne utilisable directement par d'autres modules (ex: embedExtraction.js)
 * sans passer par un appel HTTP externe.
 */
async function extractNativeEmbed(embedUrl) {
    if (!embedUrl || !isAllowedUrl(embedUrl)) return null;
    const ext = loadExtractors();
    const embedType = ext.detectEmbedType(embedUrl);
    if (!embedType || !ext.EXTRACT_FN[embedType]) return null;

    try {
        const raw = await ext.extractSingle(embedType, embedUrl);
        return normalizeResult(raw, embedUrl);
    } catch (e) {
        console.warn(`[nativeExtract] Échec extraction interne (${embedType}) :`, e.message);
        return null;
    }
}

// ────────────────────────────────────────────────────────────────────────────
// 5. Routes Express
// ────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/extract
 * Point d'entrée pour la résolution à la volée de tout embed vers flux M3U8/MP4
 */
router.post('/', async (req, res) => {
    const { type, url } = req.body || {};

    if (!url || typeof url !== 'string') {
        return res.status(400).json({ success: false, error: 'Paramètre `url` manquant' });
    }
    if (!isAllowedUrl(url)) {
        return res.status(403).json({ success: false, error: 'Hébergeur non autorisé' });
    }

    let ext;
    try {
        ext = loadExtractors();
    } catch (e) {
        return res.status(503).json({ success: false, error: 'Extracteurs indisponibles' });
    }

    const embedType = type || ext.detectEmbedType(url);
    if (!embedType || !ext.EXTRACT_FN[embedType]) {
        return res.status(422).json({ success: false, error: `Type d'hébergeur non reconnu : ${embedType || 'inconnu'}` });
    }

    try {
        const raw = await ext.extractSingle(embedType, url);
        const normalized = normalizeResult(raw, url);

        if (!normalized) {
            console.warn(`[nativeExtract] Extraction échouée (${embedType}) :`, raw?.error);
            return res.status(502).json({
                success : false,
                error   : raw?.error || 'Extraction échouée',
                type    : embedType,
            });
        }

        console.log(`[nativeExtract] ✓ ${embedType} résolu → ${normalized.m3u8Url.slice(0, 80)}…`);
        return res.json(normalized);

    } catch (err) {
        console.error(`[nativeExtract] Erreur inattendue (${embedType}) :`, err.message);
        return res.status(502).json({ success: false, error: err.message });
    }
});

/**
 * GET /api/extract/stream
 * Relais de flux ultra-léger pour smartphones iOS/Android et Smart TVs
 * injectant les headers Referer/Origin requis pour les hébergeurs stricts.
 */
/**
 * Résout la cible du relais.
 *
 * Deux formes acceptées :
 *   - `?t=<jeton signé>` (production) : la cible et les en-têtes viennent du
 *     jeton, le client ne peut pas les forger ;
 *   - `?url=…&referer=…` (développement sans `MEDIA_SIGNING_SECRET`) : toléré
 *     uniquement quand la signature n'est pas configurée, et seulement pour
 *     une URL http(s) publique.
 *
 * Dans les deux cas la cible passe le garde anti-SSRF : le relais ne doit pas
 * pouvoir viser le réseau interne.
 */
function resolveRelayTarget(req) {
    const { t, url, referer, origin } = req.query;

    if (t && typeof t === 'string') {
        const decoded = decodeSignedToken(RELAY_TOKEN_ROUTE, t);
        if (!decoded) return { error: 403, message: 'Jeton de relais invalide ou expiré' };

        let payload;
        try { payload = JSON.parse(decoded); } catch { payload = null; }
        if (!payload || typeof payload.u !== 'string') {
            return { error: 403, message: 'Jeton de relais illisible' };
        }
        return { url: payload.u, referer: payload.r || null, origin: payload.o || null };
    }

    if (signingConfigured()) {
        // Production : les URLs en clair sont refusées pour ne pas rouvrir un proxy ouvert.
        return { error: 403, message: 'Jeton de relais requis' };
    }

    if (!url || typeof url !== 'string') {
        return { error: 400, message: 'Paramètre url manquant' };
    }
    return {
        url,
        referer: typeof referer === 'string' ? referer : null,
        origin: typeof origin === 'string' ? origin : null,
    };
}

/** En-têtes de réponse communs au relais (le lecteur est sur une autre origine). */
function setRelayCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');
}

router.get('/stream', async (req, res) => {
    const resolved = resolveRelayTarget(req);
    if (resolved.error) {
        setRelayCorsHeaders(res);
        return res.status(resolved.error).json({ success: false, error: resolved.message });
    }

    const { url: targetUrl, referer, origin } = resolved;

    if (!isPublicHttpUrl(targetUrl)) {
        setRelayCorsHeaders(res);
        return res.status(400).json({ success: false, error: 'URL de flux non autorisée' });
    }

    // Plafond de charge : mieux vaut refuser proprement (le client garde son
    // lecteur tiers) que saturer la sortie réseau de l'instance.
    const releaseSlot = acquireStreamSlot();
    if (!releaseSlot) {
        console.warn(`[nativeExtract] Relais saturé (${relayLimit()} flux simultanés) — demande refusée`);
        setRelayCorsHeaders(res);
        return res.status(503).json({
            success: false,
            error: 'Relais de flux momentanément saturé',
            retryAfter: 5,
        });
    }

    const headers = {
        'User-Agent': BROWSER_UA,
        'Accept': '*/*',
    };
    if (referer) headers['Referer'] = String(referer);
    if (origin)  headers['Origin']  = String(origin);

    let released = false;
    const releaseOnce = () => {
        if (released) return;
        released = true;
        releaseSlot();
    };
    res.on('close', releaseOnce);
    res.on('finish', releaseOnce);

    try {
        const upstream = await fetch(targetUrl, { headers });
        const contentType = upstream.headers.get('content-type') || '';
        const looksLikePlaylist = /\.m3u8(?:$|\?)/i.test(targetUrl)
            || /mpegurl/i.test(contentType);

        setRelayCorsHeaders(res);

        if (req.method === 'HEAD') {
            res.status(upstream.status);
            if (contentType) res.setHeader('Content-Type', contentType);
            releaseOnce();
            return res.end();
        }

        // Playlist HLS : on la relit pour réécrire chaque URI vers le relais.
        // Sans cette réécriture, hls.js lit le manifeste puis va chercher les
        // segments directement sur le CDN, où le CORS (ou le Referer) le
        // refuse : la lecture ne démarre jamais.
        if (looksLikePlaylist && upstream.ok) {
            const body = await upstream.text();
            const rewritten = rewriteHlsPlaylist(
                body,
                upstream.url || targetUrl,
                (absoluteUrl) => buildRelayUrl(absoluteUrl, referer, origin),
            );
            res.status(upstream.status);
            res.setHeader('Content-Type', contentType || 'application/vnd.apple.mpegurl');
            releaseOnce();
            return res.send(rewritten);
        }

        res.status(upstream.status);

        if (contentType) res.setHeader('Content-Type', contentType);

        const contentLength = upstream.headers.get('content-length');
        if (contentLength) res.setHeader('Content-Length', contentLength);

        const contentRange = upstream.headers.get('content-range');
        if (contentRange) res.setHeader('Content-Range', contentRange);

        if (!upstream.body) {
            releaseOnce();
            return res.end();
        }

        const { Readable } = require('stream');
        const stream = Readable.fromWeb(upstream.body);
        stream.on('error', (error) => {
            console.error('[nativeExtract] Relais interrompu :', error.message);
            releaseOnce();
            res.destroy();
        });
        res.on('close', releaseOnce);
        stream.pipe(res);

    } catch (e) {
        console.error('[nativeExtract] Erreur stream relay :', e.message);
        releaseOnce();
        if (!res.headersSent) {
            setRelayCorsHeaders(res);
            return res.status(502).json({ success: false, error: 'Erreur stream relay' });
        }
        res.end();
    }
});

module.exports = router;
module.exports.loadExtractors = loadExtractors;
module.exports.extractNativeEmbed = extractNativeEmbed;
