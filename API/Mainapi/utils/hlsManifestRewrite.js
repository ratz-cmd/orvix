'use strict';
/**
 * Réécriture des playlists HLS pour le relais d'en-têtes.
 *
 * Pourquoi c'est indispensable : relayer le manifeste ne suffit pas. Un
 * `master.m3u8` renvoie des URI *absolues* vers le CDN de l'hébergeur ; si ce
 * CDN n'autorise pas le CORS (cas des hébergeurs qui vérifient Referer/Origin),
 * hls.js lit le manifeste puis échoue au premier segment — l'image ne démarre
 * jamais. On réécrit donc chaque URI de la playlist vers le relais, ce qui
 * donne au navigateur une chaîne entièrement relayée et lisible.
 *
 * Le module est pur (aucun accès réseau / Express) pour être testable seul.
 */

/** Balises dont l'attribut `URI="…"` désigne un média à relayer. */
const URI_ATTRIBUTE_TAGS = [
    '#EXT-X-KEY',
    '#EXT-X-SESSION-KEY',
    '#EXT-X-MAP',
    '#EXT-X-MEDIA',
    '#EXT-X-PART',
    '#EXT-X-PRELOAD-HINT',
    '#EXT-X-RENDITION-REPORT',
    '#EXT-X-I-FRAME-STREAM-INF',
];

/** Vrai si le corps ressemble à une playlist HLS (master ou média). */
function isHlsPlaylist(body) {
    return typeof body === 'string' && body.trimStart().startsWith('#EXTM3U');
}

/** Vrai si la playlist référence d'autres playlists (donc un master). */
function isMasterPlaylist(body) {
    return isHlsPlaylist(body) && body.includes('#EXT-X-STREAM-INF');
}

/**
 * Reconstruit une URI absolue à partir de la playlist d'origine.
 * Retourne `null` pour les schémas non relayables (`data:`, `skd:`…).
 */
function resolvePlaylistUri(uri, baseUrl) {
    if (typeof uri !== 'string' || !uri.trim()) return null;
    const trimmed = uri.trim();
    if (/^(?:data|blob|skd|urn):/i.test(trimmed)) return null;

    try {
        return new URL(trimmed, baseUrl).href;
    } catch {
        return null;
    }
}

/**
 * Réécrit une playlist HLS.
 *
 * @param {string}   body          Contenu de la playlist.
 * @param {string}   baseUrl       URL effective du manifeste (après redirections).
 * @param {function} buildProxyUrl (absoluteUrl) => URL relayée.
 * @returns {string} Playlist réécrite (inchangée si non reconnue).
 */
function rewriteHlsPlaylist(body, baseUrl, buildProxyUrl) {
    if (!isHlsPlaylist(body)) return body;

    const lines = body.split(/\r?\n/);
    const out = [];

    for (const line of lines) {
        const trimmed = line.trim();

        if (!trimmed) {
            out.push(line);
            continue;
        }

        // Balise avec attribut URI="…"
        if (trimmed.startsWith('#')) {
            const tag = URI_ATTRIBUTE_TAGS.find((candidate) => trimmed.startsWith(candidate));
            if (!tag) {
                out.push(line);
                continue;
            }

            const rewritten = line.replace(
                /URI="([^"]*)"/i,
                (match, uri) => {
                    const absolute = resolvePlaylistUri(uri, baseUrl);
                    if (!absolute) return match;
                    return `URI="${buildProxyUrl(absolute)}"`;
                },
            );
            out.push(rewritten);
            continue;
        }

        // Ligne d'URI nue : segment ou playlist enfant.
        const absolute = resolvePlaylistUri(trimmed, baseUrl);
        out.push(absolute ? buildProxyUrl(absolute) : line);
    }

    return out.join('\n');
}

module.exports = {
    URI_ATTRIBUTE_TAGS,
    isHlsPlaylist,
    isMasterPlaylist,
    resolvePlaylistUri,
    rewriteHlsPlaylist,
};
