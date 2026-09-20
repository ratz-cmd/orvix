import { useState, useEffect, useCallback, useRef } from 'react';

export type AvailabilityStatus = 'idle' | 'checking' | 'available' | 'unavailable' | 'unknown';

export interface SourceAvailabilityState {
  [sourceId: string]: {
    status: AvailabilityStatus;
    checkedAt: number;
  };
}

const CACHE_KEY_PREFIX = 'orvix_src_avail_';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes de cache local navigateur

/**
 * Hook client-side pour sonder la disponibilité des lecteurs vidéo
 * 100% exécuté par le navigateur de l'utilisateur (zéro charge serveur).
 */
export function useClientSourceAvailability(mediaType: 'movie' | 'tv', tmdbId?: string | number, season?: number, episode?: number) {
  const [availability, setAvailability] = useState<SourceAvailabilityState>({});
  const inFlightRef = useRef<Set<string>>(new Set());

  const cacheKey = `${CACHE_KEY_PREFIX}${mediaType}_${tmdbId}${season ? `_s${season}` : ''}${episode ? `_e${episode}` : ''}`;

  // Charger le cache depuis sessionStorage au montage
  useEffect(() => {
    if (!tmdbId) return;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as SourceAvailabilityState;
        const now = Date.now();
        const validEntries: SourceAvailabilityState = {};
        for (const [key, val] of Object.entries(parsed)) {
          if (now - val.checkedAt < CACHE_TTL_MS) {
            validEntries[key] = val;
          }
        }
        setAvailability(validEntries);
      }
    } catch {
      // Ignorer les erreurs de sessionStorage
    }
  }, [cacheKey, tmdbId]);

  // Sauvegarder dans sessionStorage à chaque mise à jour
  const updateAvailability = useCallback((sourceId: string, status: AvailabilityStatus) => {
    setAvailability(prev => {
      const updated = {
        ...prev,
        [sourceId]: { status, checkedAt: Date.now() }
      };
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(updated));
      } catch {
        // Ignorer si quota plein
      }
      return updated;
    });
  }, [cacheKey]);

  /**
   * Sonde une source d'embed ou HLS directement depuis le navigateur.
   * Utilise fetch HEAD/GET avec un timeout strict pour ne jamais ralentir l'interface.
   */
  const probeSource = useCallback(async (sourceId: string, url: string) => {
    if (!url || url === '#' || inFlightRef.current.has(sourceId)) return;
    if (availability[sourceId]?.status === 'available' || availability[sourceId]?.status === 'unavailable') return;

    inFlightRef.current.add(sourceId);
    updateAvailability(sourceId, 'checking');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2500); // Timeout max 2.5s

      // Pour Frembed ou APIs connues
      if (url.includes('frembed.surf/api/') || url.includes('peachify.top') || url.includes('autoembed.cc')) {
        const res = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
          mode: 'no-cors' // Permet d'éviter les blocages CORS tout en vérifiant la résolution DNS/HTTP
        });
        clearTimeout(timeoutId);
        // Si la réponse opaque est reçue sans exception réseau, le serveur répond
        updateAvailability(sourceId, res.type === 'opaque' || res.ok ? 'available' : 'unknown');
      } else {
        // Sonde réseau légère standard
        await fetch(url, {
          method: 'HEAD',
          signal: controller.signal,
          mode: 'no-cors'
        });
        clearTimeout(timeoutId);
        updateAvailability(sourceId, 'available');
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        updateAvailability(sourceId, 'unknown');
      } else {
        // En cas d'erreur réseau stricte
        updateAvailability(sourceId, 'unknown');
      }
    } finally {
      inFlightRef.current.delete(sourceId);
    }
  }, [availability, updateAvailability]);

  /**
   * Marquer manuellement un lecteur comme indisponible (ex: iframe erreur)
   */
  const markAsUnavailable = useCallback((sourceId: string) => {
    updateAvailability(sourceId, 'unavailable');
  }, [updateAvailability]);

  /**
   * Marquer manuellement un lecteur comme fonctionnel
   */
  const markAsAvailable = useCallback((sourceId: string) => {
    updateAvailability(sourceId, 'available');
  }, [updateAvailability]);

  return {
    availability,
    probeSource,
    markAsAvailable,
    markAsUnavailable
  };
}
