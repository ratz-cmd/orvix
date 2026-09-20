/**
 * Politique de qualité de lecture du lecteur Orvix.
 *
 * Objectif produit : ne jamais laisser le lecteur se caler sur une qualité
 * indigne (les flux « 340p » ou « 360p » des petits hébergeurs) quand une
 * piste meilleure existe dans le manifeste, et pousser la meilleure piste
 * disponible jusqu'à 1440p (2K) pour les membres VIP.
 *
 * Le module est volontairement pur (aucun accès DOM / localStorage) afin
 * d'être testable en Node et réutilisable par le web, l'app mobile et le
 * userscript.
 */

import {
  buildHlsQualityOptions,
  selectLevelForPreference,
  type HlsLevelLike,
  type HlsQualityOption,
  type HlsQualityPreference,
} from './hlsQuality';

/** Sous ce seuil, l'image n'est plus considérée comme regardable. */
export const MINIMUM_ACCEPTABLE_HEIGHT = 480;

/** Seuil « qualité correcte » visé par défaut quand le manifeste le propose. */
export const COMFORTABLE_HEIGHT = 720;

/** Plafond des comptes standards : la 1080p reste la cible Full HD. */
export const STANDARD_TARGET_HEIGHT = 1080;

/** Plafond des membres VIP : 2K / 1440p (2560 × 1440). */
export const VIP_TARGET_HEIGHT = 1440;

export const UPSCALE_TARGET_WIDTH = 2560;
export const UPSCALE_TARGET_HEIGHT = 1440;

export type QualityTier = 'sd' | 'hd' | 'fullhd' | 'qhd' | 'uhd';

export interface QualityPolicy {
  /**
   * Préférence utilisateur : `'auto'` (le lecteur choisit la meilleure piste
   * sous le plafond) ou une hauteur explicite demandée dans le menu.
   */
  preference: HlsQualityPreference;
  /** Plafond de sélection (1080p standard, 1440p VIP). */
  targetHeight: number;
  /** Plancher de sélection : en dessous, la piste n'est prise qu'en secours. */
  minHeight: number;
}

export interface QualitySelectionDescription {
  /** Toutes les hauteurs présentes dans le manifeste, décroissantes. */
  availableHeights: number[];
  /** Meilleure hauteur réellement disponible dans le flux. */
  bestHeight: number;
  /** Hauteur de la piste effectivement choisie. */
  effectiveHeight: number;
  tier: QualityTier | null;
  tierLabel: string | null;
  /** Vrai quand même la meilleure piste est sous le seuil regardable. */
  isLowQuality: boolean;
  /** Message français prêt à afficher, ou `null` si la source est correcte. */
  notice: string | null;
}

/** Extrait une hauteur exploitable d'un nombre, d'un libellé ou d'une dimension. */
export function normalizeQualityHeight(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
  }
  if (typeof value !== 'string') return 0;

  const dimensions = value.match(/(\d{3,4})\s*[x×*]\s*(\d{3,4})/i);
  if (dimensions) {
    const height = Number(dimensions[2]);
    if (Number.isFinite(height) && height > 0) return Math.round(height);
  }

  const labelled = value.match(/(\d{3,4})\s*p\b/i) ?? value.match(/(\d{3,4})\s*i\b/i);
  if (labelled) {
    const height = Number(labelled[1]);
    if (Number.isFinite(height) && height > 0) return Math.round(height);
  }

  const bare = value.trim().match(/^(\d{3,4})$/);
  if (bare) {
    const height = Number(bare[1]);
    if (Number.isFinite(height) && height > 0) return Math.round(height);
  }

  const aliases: Array<[RegExp, number]> = [
    [/\b(4k|uhd|2160)\b/i, 2160],
    [/\b(2k|qhd|1440)\b/i, 1440],
    [/\b(full\s*hd|fhd|1080)\b/i, 1080],
    [/\b(hd\s*ready|720)\b/i, 720],
    [/\b(hd)\b/i, 720],
    [/\b(sd|ld|low)\b/i, 480],
  ];
  for (const [pattern, height] of aliases) {
    if (pattern.test(value)) return height;
  }
  return 0;
}

/** Classe une hauteur dans une gamme lisible. */
export function qualityTier(height: number): QualityTier {
  if (height >= 2160) return 'uhd';
  if (height >= 1440) return 'qhd';
  if (height >= 1080) return 'fullhd';
  if (height >= 720) return 'hd';
  return 'sd';
}

/** Libellé français d'une gamme de qualité. */
export function qualityTierLabelFr(tier: QualityTier): string {
  switch (tier) {
    case 'uhd': return '4K (2160p)';
    case 'qhd': return '2K (1440p)';
    case 'fullhd': return 'Full HD (1080p)';
    case 'hd': return 'HD (720p)';
    default: return 'SD';
  }
}

/** Hauteur maximale visée selon le statut du compte. */
export function getPlaybackTargetHeight(isVip: boolean): number {
  return isVip ? VIP_TARGET_HEIGHT : STANDARD_TARGET_HEIGHT;
}

/** Vrai quand l'image est sous le seuil regardable (360p, 340p…). */
export function isLowQualityHeight(height: number): boolean {
  return height > 0 && height < MINIMUM_ACCEPTABLE_HEIGHT;
}

/**
 * Construit la politique appliquée au lecteur pour un utilisateur donné.
 * La préférence explicite de l'utilisateur reste prioritaire sur le plafond.
 */
export function buildQualityPolicy(
  isVip: boolean,
  preference: HlsQualityPreference = 'auto',
): QualityPolicy {
  return {
    preference,
    targetHeight: getPlaybackTargetHeight(isVip),
    minHeight: MINIMUM_ACCEPTABLE_HEIGHT,
  };
}

/**
 * Choisit l'index de piste à charger.
 *
 * Ordre de décision :
 *  1. préférence explicite de l'utilisateur (bornée par le plafond du compte) ;
 *  2. meilleure piste **sous le plafond et au-dessus du plancher** ;
 *  3. à défaut, meilleure piste disponible (une source 360p reste jouable,
 *     mais elle est signalée par `describeQualitySelection`).
 */
export function selectLevelUnderPolicy(
  options: HlsQualityOption[],
  policy: QualityPolicy,
): number {
  return selectLevelForPreference(
    options,
    policy.preference,
    policy.targetHeight,
    policy.minHeight,
  );
}

/** Décrit ce que la source propose réellement, pour l'affichage et les alertes. */
export function describeQualitySelection(
  levels: HlsLevelLike[],
  policy: QualityPolicy,
): QualitySelectionDescription {
  const options = buildHlsQualityOptions(levels);
  const availableHeights = options.map(option => option.height);
  const bestHeight = availableHeights.length > 0 ? Math.max(...availableHeights) : 0;
  const levelIndex = selectLevelUnderPolicy(options, policy);
  const selected = options.find(option => option.index === levelIndex);
  const effectiveHeight = selected?.height ?? bestHeight;
  const tier = bestHeight > 0 ? qualityTier(bestHeight) : null;

  return {
    availableHeights,
    bestHeight,
    effectiveHeight,
    tier,
    tierLabel: tier ? qualityTierLabelFr(tier) : null,
    isLowQuality: isLowQualityHeight(bestHeight),
    notice: buildQualityNotice(bestHeight, availableHeights),
  };
}

/** Message français expliquant une source de qualité insuffisante. */
export function buildQualityNotice(
  bestHeight: number,
  availableHeights: readonly number[] = [],
): string | null {
  if (bestHeight <= 0) return null;
  if (!isLowQualityHeight(bestHeight)) return null;

  const alternatives = availableHeights.filter(height => height > bestHeight);
  const base = `Cette source plafonne à ${bestHeight}p : l'image sera floue, même agrandie.`;
  return alternatives.length > 0
    ? `${base} Choisissez une piste supérieure (${alternatives.join(', ')}p) ou une autre source.`
    : `${base} Essayez une autre source pour obtenir une vraie HD.`;
}

/**
 * Score de tri d'un libellé de qualité (badges des listes de sources).
 * Plus le score est haut, meilleure est la source ; une source inconnue reste
 * devant une source explicitement basse qualité.
 */
export function rankQualityLabel(label: string | null | undefined): number {
  if (!label) return 0;
  const height = normalizeQualityHeight(label);
  if (height <= 0) return 1;
  if (isLowQualityHeight(height)) return 2;
  return 10 + height;
}

/** Meilleur libellé parmi une liste, selon `rankQualityLabel`. */
export function pickBestQualityLabel(
  labels: ReadonlyArray<string | null | undefined>,
): string | null {
  let best: string | null = null;
  let bestRank = -1;
  for (const label of labels) {
    if (!label) continue;
    const rank = rankQualityLabel(label);
    if (rank > bestRank) {
      bestRank = rank;
      best = label;
    }
  }
  return best;
}

/** Résumé court en français pour l'overlay du lecteur (« 1080p », « 2K – upscale VIP »). */
export function describePlaybackBadge(
  effectiveHeight: number,
  options: { upscaled?: boolean } = {},
): string | null {
  if (effectiveHeight <= 0) return null;
  const label = `${effectiveHeight}p`;
  if (!options.upscaled) return label;
  return `${label} → 2K VIP`;
}
