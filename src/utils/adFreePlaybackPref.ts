/**
 * Préférence « lecture sans publicité automatique ».
 *
 * Quand elle est active (défaut), Orvix tente d'extraire le flux direct des
 * lecteurs tiers (SeekStreaming, Voe, Uqload…) dès qu'ils sont sélectionnés,
 * et bascule sur le lecteur Orvix natif : 0 publicité, interface française,
 * Super Résolution 2K pour les VIP.
 *
 * Désactiver la préférence remet l'iframe d'origine : c'est le filet de
 * sécurité si un hébergeur change de protection du jour au lendemain.
 */

const STORAGE_KEY = 'orvix_ad_free_autoplay';
export const AD_FREE_PLAYBACK_EVENT = 'orvix-ad-free-playback-changed';

/** La préférence est active par défaut : c'est l'intérêt du membre. */
export function isAdFreeAutoPlaybackEnabled(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return true;
    return raw !== '0' && raw !== 'false';
  } catch {
    return true;
  }
}

export function setAdFreeAutoPlaybackEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    window.dispatchEvent(new CustomEvent(AD_FREE_PLAYBACK_EVENT, { detail: { enabled } }));
  } catch {
    // Stockage indisponible (navigation privée) : la session reste sur le défaut.
  }
}

export function subscribeToAdFreePlaybackChanges(
  listener: (enabled: boolean) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ enabled?: boolean }>).detail;
    listener(detail?.enabled ?? isAdFreeAutoPlaybackEnabled());
  };
  window.addEventListener(AD_FREE_PLAYBACK_EVENT, handler);
  return () => window.removeEventListener(AD_FREE_PLAYBACK_EVENT, handler);
}
