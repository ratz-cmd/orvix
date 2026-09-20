/**
 * Bascule automatique d'un lecteur tiers vers le lecteur Orvix natif.
 *
 * Contexte produit : les embeds publics (SeekStreaming en tête) affichent des
 * publicités, des redirections et une interface anglophone. Orvix sait
 * récupérer le `.m3u8` / `.mp4` sous-jacent — ce hook le fait au moment où le
 * membre choisit la source, puis rend la main à la page Watch pour basculer
 * sur le lecteur natif.
 *
 * Garanties :
 *   - une seule tentative par URL d'embed (pas de tempête de requêtes) ;
 *   - un résultat réussi est mémorisé : si la même source revient (retour
 *     arrière, auto-sélection), on rebascule sans ré-extraire ;
 *   - en cas d'échec, on ne touche à rien : l'iframe d'origine continue ;
 *   - la préférence `orvix_ad_free_autoplay` peut couper le mécanisme, et le
 *     toast de confirmation propose de le faire en un clic.
 */

import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  resolveExtractableHoster,
  tryOnTheFlyExtraction,
  type OnTheFlyExtractResult,
} from '../utils/onTheFlyExtract';
import { isAdFreeAutoPlaybackEnabled, setAdFreeAutoPlaybackEnabled } from '../utils/adFreePlaybackPref';
import { HOSTER_LABELS } from '../utils/hosterRegistry';

export interface ExtractedPlayback {
  /** Flux à lire dans le lecteur Orvix. */
  url: string;
  /** Pistes alternatives (qualités, CDN de secours). */
  candidates: { url: string; label: string }[];
  hoster: string;
  source: 'extension' | 'backend';
}

export interface UseAdFreeAutoExtractionOptions {
  /** URL de l'embed actuellement affiché (iframe), ou `null`. */
  embedUrl: string | null;
  /** Type de lecteur tiers (« seekstreaming », « voe »…), informatif. */
  embedType?: string | null;
  /** Délai maximal accordé à l'extraction avant de rendre la main à l'iframe. */
  timeoutMs?: number;
  /** Appelé quand un flux a été extrait : la page Watch bascule dessus. */
  onExtracted: (playback: ExtractedPlayback) => void;
  /** Faux pour désactiver le hook (ex. mode « lecteur tiers imposé »). */
  enabled?: boolean;
}

/** Libellé lisible d'un hébergeur (« SeekStreaming », « Voe »…). */
function hosterLabel(hoster: string): string {
  const label = (HOSTER_LABELS as Record<string, string | undefined>)[hoster];
  return label ?? (hoster.charAt(0).toUpperCase() + hoster.slice(1));
}

export function useAdFreeAutoExtraction({
  embedUrl,
  embedType,
  timeoutMs = 6000,
  onExtracted,
  enabled = true,
}: UseAdFreeAutoExtractionOptions): void {
  /** Résultats déjà obtenus, indexés par « hébergeur:url ». */
  const cacheRef = useRef(new Map<string, OnTheFlyExtractResult>());
  /** URL déjà tentées (échecs compris) pour ne pas boucler. */
  const attemptedRef = useRef(new Set<string>());
  /** La callback change à chaque render : on la lit via une ref. */
  const onExtractedRef = useRef(onExtracted);
  onExtractedRef.current = onExtracted;

  useEffect(() => {
    if (!enabled) return;
    if (!embedUrl || typeof embedUrl !== 'string') return;
    if (!isAdFreeAutoPlaybackEnabled()) return;

    const hoster = resolveExtractableHoster(embedUrl);
    if (!hoster) return;

    const key = `${hoster}:${embedUrl}`;

    const applyResult = (result: OnTheFlyExtractResult, fromCache: boolean) => {
      if (!result.success || !result.m3u8Url) return;
      const candidates = result.candidates && result.candidates.length > 0
        ? result.candidates
        : [{ url: result.m3u8Url, label: `${hosterLabel(hoster)} · flux direct` }];

      onExtractedRef.current({
        url: result.m3u8Url,
        candidates,
        hoster,
        source: result.source === 'extension' ? 'extension' : 'backend',
      });

      if (!fromCache) {
        toast.success(`Publicités supprimées — lecture via le lecteur Orvix (${hosterLabel(hoster)})`, {
          description: 'Le flux est relu directement, sans iframe ni coupure publicitaire.',
          duration: 6000,
          action: {
            label: 'Revenir au lecteur tiers',
            onClick: () => {
              setAdFreeAutoPlaybackEnabled(false);
              cacheRef.current.delete(key);
              attemptedRef.current.delete(key);
              toast.message('Lecture sans publicité désactivée', {
                description: 'Le lecteur tiers sera affiché à nouveau (réactivable dans les réglages).',
              });
            },
          },
        });
      }
    };

    // Rejouer un résultat déjà obtenu (retour arrière, auto-sélection) sans
    // relancer d'extraction.
    const cached = cacheRef.current.get(key);
    if (cached) {
      applyResult(cached, true);
      return;
    }

    if (attemptedRef.current.has(key)) return;
    attemptedRef.current.add(key);

    let cancelled = false;
    const notice = toast.loading(`Suppression des publicités ${hosterLabel(hoster)}…`, {
      description: 'Extraction du flux direct vers le lecteur Orvix.',
    });

    tryOnTheFlyExtraction(embedUrl, timeoutMs)
      .then((result) => {
        if (cancelled) return;
        toast.dismiss(notice);
        if (!result.success || !result.m3u8Url) {
          // Pas de bruit pour l'utilisateur : l'iframe reste affichée.
          console.warn(`[Orvix] Extraction ${hoster}: échec, lecteur tiers conservé`);
          return;
        }
        cacheRef.current.set(key, result);
        applyResult(result, false);
      })
      .catch((error) => {
        if (cancelled) return;
        toast.dismiss(notice);
        console.warn(`[Orvix] Extraction ${hoster}: erreur`, error);
      });

    return () => {
      cancelled = true;
      toast.dismiss(notice);
    };
    // `embedType` n'est volontairement pas une dépendance de relance : il ne
      // sert qu'au log et change en même temps que `embedUrl`.
  }, [embedUrl, enabled, timeoutMs, embedType]);
}
