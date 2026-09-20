// src/utils/onTheFlyExtract.ts
/**
 * Service d'extraction HLS à la volée pour basculer dynamiquement vers le
 * Lecteur Orvix Natif (HLSPlayer - 0 pub - Super Résolution VIP) lors de la
 * sélection ou du chargement de n'importe quel hébergeur supporté.
 */

import { detectHoster } from './hosterRegistry';
import { callNativeBackendExtract, isSeekStreamingEmbed, hasNexusExtractors } from './extractM3u8';

export interface OnTheFlyExtractResult {
  success: boolean;
  m3u8Url?: string;
  hoster?: string;
  headers?: Record<string, string>;
  source?: 'extension' | 'backend';
}

const EXTRACTABLE_HOSTERS = new Set([
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
 * Valide qu'une URL de flux est saine (http/https) et exempte de tout code d'injection
 */
export function isValidMediaUrl(url: unknown): url is string {
  if (typeof url !== 'string' || !url.trim()) return false;
  const trimmed = url.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return false;
  // Sécurité anti-XSS et injection
  if (/<script|javascript:|<html|<iframe/i.test(trimmed)) return false;
  return true;
}

/**
 * Vérifie de manière synchrone si une URL appartient à un hébergeur extractible.
 * SeekStreaming est exclu pour rester un lecteur normal autonome au premier plan.
 */
export function isExtractableUrl(url: string): boolean {
  if (!url) return false;
  if (isSeekStreamingEmbed(url)) return false;
  const hoster = detectHoster(url);
  return Boolean(hoster && EXTRACTABLE_HOSTERS.has(hoster));
}

/**
 * Tente d'extraire le flux M3U8/MP4 direct à la volée avec timeout strict.
 * Priorité 1: Extension Orvix/Orvix (qui gère l'extraction locale et les règles DNR d'en-têtes réseau)
 * Priorité 2: Backend natif /api/extract
 * Si l'extraction réussit, le lecteur Orvix natif prend le relais immédiatement (0 pub).
 * Si l'extraction échoue ou dépasse le délai, retourne success: false pour permettre
 * un repli propre vers l'iframe sécurisée sans bloquer l'utilisateur.
 */
export async function tryOnTheFlyExtraction(
  url: string,
  timeoutMs = 4500
): Promise<OnTheFlyExtractResult> {
  if (!url || typeof url !== 'string') {
    return { success: false };
  }

  // SeekStreaming est un lecteur normal dédié, pas d'auto-extraction
  if (isSeekStreamingEmbed(url)) {
    return { success: false };
  }

  const hoster = detectHoster(url);
  if (!hoster || !EXTRACTABLE_HOSTERS.has(hoster)) {
    return { success: false };
  }

  try {
    const doExtract = async (): Promise<{ m3u8Url: string; headers?: Record<string, string>; source: 'extension' | 'backend' } | null> => {
      // 1. Tenter l'extension navigateur d'abord si elle est présente
      if (hasNexusExtractors()) {
        const w = typeof window !== 'undefined' ? (window as any) : null;
        const extractFn = w?.orvixExtractM3u8 || w?.orvixExtractM3u8;
        if (extractFn) {
          try {
            console.log(`[ON-THE-FLY] Appel extension pour ${hoster}: ${url}`);
            const extResult = await extractFn(hoster, url);
            const extractedUrl = extResult?.m3u8Url || extResult?.hlsUrl;
            if (extResult?.success && extractedUrl && isValidMediaUrl(extractedUrl)) {
              console.log(`[ON-THE-FLY] ✓ Succès extension pour ${hoster}`);
              return {
                m3u8Url: extractedUrl,
                headers: extResult.headers,
                source: 'extension',
              };
            }
          } catch (extErr) {
            console.warn(`[ON-THE-FLY] Échec extension (${hoster}), repli backend:`, extErr);
          }
        }
      }

      // 2. Repli vers le backend natif (/api/extract)
      try {
        const backendResult = await callNativeBackendExtract(hoster, url);
        const extractedUrl = backendResult?.m3u8Url || backendResult?.hlsUrl;
        if (backendResult?.success && extractedUrl && isValidMediaUrl(extractedUrl)) {
          console.log(`[ON-THE-FLY] ✓ Succès backend natif pour ${hoster}`);
          return {
            m3u8Url: extractedUrl,
            headers: backendResult.headers,
            source: 'backend',
          };
        }
      } catch (backendErr) {
        console.warn(`[ON-THE-FLY] Échec backend (${hoster}):`, backendErr);
      }

      return null;
    };

    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), timeoutMs)
    );

    const result = await Promise.race([doExtract(), timeoutPromise]);
    if (result && result.m3u8Url && isValidMediaUrl(result.m3u8Url)) {
      console.log(`[ON-THE-FLY] ✨ Flux extrait (${result.source}) pour ${hoster}: ${result.m3u8Url.slice(0, 80)}...`);
      return {
        success: true,
        m3u8Url: result.m3u8Url,
        hoster,
        headers: result.headers,
        source: result.source,
      };
    }
  } catch (err) {
    console.warn(`[ON-THE-FLY] Échec extraction globale (${hoster}):`, err);
  }

  return { success: false };
}

