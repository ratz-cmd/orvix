// src/utils/onTheFlyExtract.ts
/**
 * Extraction « à la volée » : quand le membre choisit un lecteur tiers
 * (SeekStreaming, Voe, Uqload…), on récupère directement le fichier
 * `.m3u8` / `.mp4` et on le relit dans le lecteur Orvix natif — sans pub,
 * en français, avec la Super Résolution 2K pour les VIP.
 *
 * Deux chemins, dans cet ordre :
 *   1. l'extension navigateur (ou le userscript) quand elle est installée :
 *      l'extraction se fait dans le navigateur, aucune requête ne part vers
 *      nos serveurs ;
 *   2. le backend natif `POST /api/extract`, qui télécharge ~50 Ko de page
 *      HTML d'embed et renvoie l'URL du flux. Le serveur ne relaye jamais la
 *      vidéo (sauf en-têtes stricts sur mobile/TV, et dans ce cas c'est un
 *      relais d'en-têtes, pas de transcodage).
 *
 * En cas d'échec ou de dépassement du délai, l'appelant garde l'iframe
 * d'origine : c'est un bonus, jamais une régression.
 */

import { detectHoster } from './hosterRegistry';
import { isM3u8ExtractorEnabled, type M3u8ExtractorKey } from './extractionPrefs';
import { getExtractionMethod } from './extractionPrefs';
import {
  callNativeBackendExtract,
  isSeekStreamingEmbed,
  hasNexusExtractors,
} from './extractM3u8';
import { isSeekStreamingEmbedUrl } from './seekStreamingCandidates';
import { probeDirectStream } from './streamProbe';

/** Forme minimale d'un résultat d'extraction renvoyé par l'extension. */
interface HosterExtractionResult {
  success?: boolean;
  m3u8Url?: string;
  hlsUrl?: string;
  hlsCandidates?: unknown;
  headers?: Record<string, string>;
}

/** Pont injecté par l'extension / le userscript dans la page. */
interface ExtractionBridgeWindow {
  orvixExtractM3u8?: (hoster: string, url: string) => Promise<HosterExtractionResult | null>;
  hasOrvixNexusExtractor?: boolean;
  hasOrvixExtension?: boolean;
}

/** Normalise les pistes renvoyées par un extracteur (objet `{url}` ou chaîne). */
function collectCandidates(
  hoster: string,
  raw: unknown,
): { url: string; label: string }[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const candidates = raw
    .map((candidate: unknown, index: number) => {
      const candidateUrl = typeof candidate === 'string'
        ? candidate
        : (candidate as { url?: unknown } | null)?.url;
      if (!isValidMediaUrl(candidateUrl)) return null;
      return { url: candidateUrl, label: describeCandidateLabel(hoster, index) };
    })
    .filter((candidate): candidate is { url: string; label: string } => candidate !== null);
  return candidates.length > 0 ? candidates : undefined;
}

export interface OnTheFlyExtractResult {
  success: boolean;
  m3u8Url?: string;
  /** Autres pistes du même flux (qualités / CDN de secours). */
  candidates?: { url: string; label: string }[];
  hoster?: string;
  headers?: Record<string, string>;
  source?: 'extension' | 'backend';
  /**
   * Vrai quand la lecture passe par le relais d'en-têtes Orvix : le flux est
   * alors relayé par le serveur (bande passante), faute de CORS côté CDN.
   */
  viaRelay?: boolean;
  /**
   * Vrai quand le CDN sait servir le flux directement au navigateur (CORS
   * ouvert, ou en-têtes ajoutés par l'extension). C'est le cas idéal : zéro
   * charge serveur.
   */
  corsOk?: boolean;
  /** Explication courte, affichée dans les journaux et l'overlay. */
  reason?: string;
}

/**
 * Hébergeurs dont on sait extraire le flux. SeekStreaming en fait partie :
 * son API `/api/v1/video` renvoie un JSON chiffré AES-CBC contenant les
 * pistes directes, ce qui évite l'embed public et ses publicités.
 */
const EXTRACTABLE_HOSTERS = new Set<string>([
  'seekstreaming',
  'voe',
  'uqload',
  'vidzy',
  'vidmoly',
  'fsvid',
  'sibnet',
  'doodstream',
  'lulustream',
  'veev',
  'vidara',
]);

/**
 * Valide qu'une URL de flux est saine (http/https) et exempte de tout code
 * d'injection (la valeur finit dans un `src` de balise média).
 */
export function isValidMediaUrl(url: unknown): url is string {
  if (typeof url !== 'string' || !url.trim()) return false;
  const trimmed = url.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false;
  if (/<script|javascript:|<html|<iframe/i.test(trimmed)) return false;
  return true;
}

/**
 * Vérifie de manière synchrone si une URL est extractible : hébergeur connu
 * **et** extracteur activé dans les réglages du membre.
 */
export function isExtractableUrl(url: string): boolean {
  if (!url) return false;
  const hoster = resolveExtractableHoster(url);
  if (!hoster) return false;
  return isM3u8ExtractorEnabled(hoster as M3u8ExtractorKey);
}

/** Identifie l'hébergeur extractible d'une URL, ou `null`. */
export function resolveExtractableHoster(url: string): string | null {
  if (!url) return null;
  if (isSeekStreamingEmbed(url) || isSeekStreamingEmbedUrl(url)) return 'seekstreaming';
  const hoster = detectHoster(url);
  return hoster && EXTRACTABLE_HOSTERS.has(hoster) ? hoster : null;
}

/** Libellé français de la piste affichée dans la liste des sources Orvix. */
export function describeCandidateLabel(
  hoster: string,
  index: number,
  fallbackLabel = 'flux direct',
): string {
  return index === 0
    ? `${hoster.toUpperCase()} · ${fallbackLabel}`
    : `${hoster.toUpperCase()} · piste ${index + 1}`;
}

/**
 * Tente d'extraire le flux M3U8/MP4 avec un délai strict.
 *
 * Priorité 1 : extension Orvix (extraction locale, aucun appel serveur).
 * Priorité 2 : backend natif `/api/extract`.
 *
 * Si l'extraction réussit, l'appelant peut basculer immédiatement sur le
 * lecteur Orvix natif (0 pub).
 */
export async function tryOnTheFlyExtraction(
  url: string,
  timeoutMs = 6000,
): Promise<OnTheFlyExtractResult> {
  if (!url || typeof url !== 'string') return { success: false };

  const hoster = resolveExtractableHoster(url);
  if (!hoster) return { success: false };
  if (!isM3u8ExtractorEnabled(hoster as M3u8ExtractorKey)) return { success: false };

  const extractionMethod = getExtractionMethod();

  const fromExtension = async (): Promise<{
    m3u8Url: string;
    candidates?: { url: string; label: string }[];
    headers?: Record<string, string>;
  } | null> => {
    if (extractionMethod === 'server') return null;
    if (!hasNexusExtractors()) return null;
    const w = typeof window !== 'undefined'
      ? (window as unknown as ExtractionBridgeWindow)
      : null;
    const extractFn = w?.orvixExtractM3u8;
    if (typeof extractFn !== 'function') return null;

    try {
      const result = await extractFn(hoster, url);
      const extractedUrl = result?.m3u8Url || result?.hlsUrl;
      if (!result?.success || !isValidMediaUrl(extractedUrl)) return null;

      return {
        m3u8Url: extractedUrl,
        candidates: collectCandidates(hoster, result.hlsCandidates),
        headers: result.headers,
      };
    } catch (error) {
      console.warn(`[ON-THE-FLY] Échec extension (${hoster}), repli backend :`, error);
      return null;
    }
  };

  const fromBackend = async (): Promise<{
    m3u8Url: string;
    relayUrl?: string;
    candidates?: { url: string; label: string }[];
    headers?: Record<string, string>;
  } | null> => {
    if (extractionMethod === 'extension' || extractionMethod === 'userscript') {
      // L'utilisateur a explicitement choisi une extraction locale : on ne
      // sollicite pas le serveur pour lui.
      return null;
    }
    try {
      // `preferDirect` : on veut l'URL du CDN, pas déjà l'URL de relais. Le
      // choix final (direct / relais / iframe) revient à `tryOnTheFlyExtraction`.
      const result = await callNativeBackendExtract(hoster, url, { preferDirect: true });
      const extractedUrl = result?.m3u8Url || result?.hlsUrl;
      if (!result?.success || !isValidMediaUrl(extractedUrl)) return null;

      const relayUrl = typeof result.streamUrl === 'string'
        && isValidMediaUrl(result.streamUrl)
        && result.streamUrl !== extractedUrl
        ? result.streamUrl
        : undefined;

      return {
        m3u8Url: extractedUrl,
        relayUrl,
        candidates: collectCandidates(hoster, result.hlsCandidates),
        headers: result.headers,
      };
    } catch (error) {
      console.warn(`[ON-THE-FLY] Échec backend (${hoster}) :`, error);
      return null;
    }
  };

  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));

  /**
   * Décide quoi jouer, dans cet ordre :
   *   1. **direct** si le CDN autorise la lecture depuis le navigateur (CORS
   *      ouvert, ou en-têtes posés par l'extension) — zéro charge serveur ;
   *   2. **relais** quand il existe et que le direct est impossible ;
   *   3. **direct quand même** en dernier recours : l'extension peut encore
   *      débloquer la requête au moment de la lecture.
   */
  const decidePlayback = async (
    hoster: string,
    extraction: {
      m3u8Url: string;
      relayUrl?: string;
      candidates?: { url: string; label: string }[];
      headers?: Record<string, string>;
    },
    source: 'extension' | 'backend',
  ): Promise<OnTheFlyExtractResult> => {
    const probe = await probeDirectStream(extraction.m3u8Url, { timeoutMs: 4000 });

    if (probe.ok) {
      console.log(`[ON-THE-FLY] ✓ Lecture directe (${hoster}) — aucun relais serveur`);
      return {
        success: true,
        m3u8Url: extraction.m3u8Url,
        candidates: extraction.candidates,
        headers: extraction.headers,
        hoster,
        source,
        corsOk: true,
        viaRelay: false,
        reason: probe.reason,
      };
    }

    if (extraction.relayUrl) {
      console.log(`[ON-THE-FLY] ↻ Relais Orvix pour ${hoster} (${probe.reason})`);
      return {
        success: true,
        m3u8Url: extraction.relayUrl,
        candidates: extraction.candidates,
        headers: extraction.headers,
        hoster,
        source,
        corsOk: false,
        viaRelay: true,
        reason: probe.reason,
      };
    }

    console.warn(`[ON-THE-FLY] ⚠ ${hoster} : ${probe.reason}, lecture directe tentée sans relais`);
    return {
      success: true,
      m3u8Url: extraction.m3u8Url,
      candidates: extraction.candidates,
      headers: extraction.headers,
      hoster,
      source,
      corsOk: false,
      viaRelay: false,
      reason: probe.reason,
    };
  };

  try {
    const extensionResult = await Promise.race([fromExtension(), timeout]);
    if (extensionResult) {
      return await decidePlayback(hoster, extensionResult, 'extension');
    }

    const backendResult = await Promise.race([fromBackend(), timeout]);
    if (backendResult) {
      return await decidePlayback(hoster, backendResult, 'backend');
    }
  } catch (error) {
    console.warn(`[ON-THE-FLY] Échec global (${hoster}) :`, error);
  }

  return { success: false };
}
