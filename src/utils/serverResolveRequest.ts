// src/utils/serverResolveRequest.ts
//
// Config axios commune des appels catalogue en contexte de lecture, pilotée
// par la méthode d'extraction choisie dans les réglages (`extractionPrefs`).
//
// - Méthode « server » AVEC VIP valide : `resolve=1` + clé VIP en header. Le
//   serveur résout lui-même les m3u8 (extraction VIP) et les renvoie dans la
//   réponse.
// - Méthode « extension » / « userscript », OU méthode « server » sans VIP :
//   ni `resolve`, ni clé VIP. Le serveur renvoie les liens embed bruts et
//   l'extraction reste 100 % locale (extension/userscript). Envoyer quand
//   même la clé déclenchait une extraction serveur parasite qui se mélangeait
//   aux résultats de l'extension — d'où des sources tantôt VIP, tantôt
//   extension selon la requête la plus rapide.
//
// La clé VIP reste envoyée partout ailleurs (débridage `/api/media/debrid`,
// resolve MP4 SwiftFlux, proxy PurStream, Live TV…) : ces usages-là ne sont
// pas de l'extraction de sources et ne dépendent pas de la méthode choisie.

import { getVipHeaders, isUserVip } from './vipUtils';
import { getExtractionMethod } from './extractionPrefs';

/**
 * Bridge local (extension ou userscript) déjà injecté ? Les deux canaux
 * posent ces globals à `document_start`, avant que l'app démarre — un test
 * synchrone suffit donc, pas d'attente (voir extractM3u8.ts).
 */
function hasLocalBridge(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as any;
  return Boolean(
    (w.hasOrvixNexusExtractor || w.hasOrvixNexusExtractor || w.hasOrvixExtension || w.hasOrvixExtension) &&
    (w.orvixExtractM3u8 || w.orvixExtractM3u8 || w.orvixExtractAllM3u8 || w.orvixExtractAllM3u8)
  );
}

/**
 * Vrai si l'extraction doit passer par le serveur.
 *
 * - Si un bridge local (extension PC) est présent : l'extraction reste locale
 *   (0 charge serveur, déport client).
 * - Si AUCUN bridge local n'est présent (smartphones iOS/Android, Smart TVs, tablettes,
 *   ou PC sans extension) : l'extraction serveur est TOUJOURS activée pour que
 *   tous les appareils profitent du Lecteur Orvix Natif sans pub !
 * - Si VIP ou méthode 'server' explicite : extraction serveur.
 */
export function usesServerExtraction(): boolean {
  if (typeof window === 'undefined') return true;
  if (!hasLocalBridge()) return true;
  if (isUserVip()) return true;
  return getExtractionMethod() === 'server';
}

export interface ServerResolveRequestConfig {
  params: Record<string, unknown>;
  headers: Record<string, string>;
}

/**
 * Config `{ params, headers }` d'un appel catalogue de lecture.
 *
 * @param extraParams Paramètres propres à l'appel (saison, épisode…), fusionnés
 *                    avec `resolve=1` uniquement en méthode serveur.
 */
export function serverResolveRequest(
  extraParams: Record<string, unknown> = {},
): ServerResolveRequestConfig {
  if (usesServerExtraction()) {
    return { params: { ...extraParams, resolve: 1 }, headers: { ...getVipHeaders() } };
  }
  return { params: { ...extraParams }, headers: {} };
}
