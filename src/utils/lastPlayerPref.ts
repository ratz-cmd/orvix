// src/utils/lastPlayerPref.ts
//
// Persistance de la préférence "se souvenir du dernier lecteur choisi".
// Quand activée, le dernier `TopLevelSourceId` sélectionné manuellement par
// l'utilisateur prend priorité sur l'ordre des sources lors du chargement
// d'un nouveau film/épisode — *si* ce lecteur est disponible. Sinon on
// retombe sur le système de priorité existant.
//
// Storage : 2 clés localStorage indépendantes (toggle + valeur).
import { TOP_LEVEL_SOURCE_IDS, type TopLevelSourceId } from '../types/sourcePriority';

// Préfixe `player` → match la règle de sync serveur (`SYNCABLE_PREFIXES` dans
// API/Mainapi/utils/syncPolicy.js). Les anciens noms `orvix_remember_last_player`
// / `orvix_last_player` étaient silencieusement filtrés par le client.
const TOGGLE_KEY = 'playerRememberLast';
const VALUE_KEY = 'playerLastId';
const CHANGE_EVENT = 'orvix-last-player-changed';
const LEGACY_CHANGE_EVENT = 'orvix-last-player-changed';

const VALID_IDS = new Set<string>(TOP_LEVEL_SOURCE_IDS);

/** Toggle on/off — défaut false (opt-in). */
export function getRememberLastPlayer(): boolean {
  try {
    return localStorage.getItem(TOGGLE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setRememberLastPlayer(enabled: boolean): void {
  try {
    localStorage.setItem(TOGGLE_KEY, String(enabled));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    /* noop */
  }
}

/**
 * Renvoie le dernier `TopLevelSourceId` enregistré, ou null si rien n'est
 * sauvé OU si la valeur n'est plus un id valide (ex: id retiré dans une
 * version future). Robuste à la désérialisation.
 */
export function getLastPlayer(): TopLevelSourceId | null {
  try {
    const v = localStorage.getItem(VALUE_KEY);
    if (!v) return null;
    return VALID_IDS.has(v) ? (v as TopLevelSourceId) : null;
  } catch {
    return null;
  }
}

/**
 * Enregistre l'id si c'est un `TopLevelSourceId` valide. No-op sinon (laisse
 * le caller relayer n'importe quel string sans craindre de polluer le storage).
 */
export function setLastPlayer(id: string): void {
  if (!id || !VALID_IDS.has(id)) return;
  try {
    localStorage.setItem(VALUE_KEY, id);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  } catch {
    /* noop */
  }
}

/** S'abonne aux changements (toggle ou valeur). Renvoie un unsubscriber. */
export function subscribeToLastPlayerChanges(cb: () => void): () => void {
  const handler = () => cb();
  const storageHandler = (e: StorageEvent) => {
    if (e.key === TOGGLE_KEY || e.key === VALUE_KEY) cb();
  };
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener(LEGACY_CHANGE_EVENT, handler);
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener(LEGACY_CHANGE_EVENT, handler);
    window.removeEventListener('storage', storageHandler);
  };
}
