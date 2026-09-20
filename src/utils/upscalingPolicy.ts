/**
 * Politique de Super Résolution « 2K » d'Orvix.
 *
 * Contrainte produit : tout l'agrandissement se fait **sur la machine du
 * membre** (GPU du navigateur), jamais sur le serveur — le site doit rester
 * hébergeable sur une petite instance. Le serveur se contente de servir le
 * flux original (souvent 1080p) ; c'est le navigateur qui reconstruit une
 * image 2560 × 1440 par shader, réservée aux comptes VIP.
 *
 * Ce module ne contient que des décisions pures (éligibilité, taille cible,
 * libellés) : le moteur WebGL vit dans `videoUpscaler.ts`.
 */

import { UPSCALE_TARGET_HEIGHT, UPSCALE_TARGET_WIDTH } from './playbackQuality';

export type UpscaleMode = 'off' | 'cas' | 'ultra';

/** Budget de rendu par image avant dégradation automatique (ms). */
export const RENDER_BUDGET_MS = 11;

/** Nombre d'images consécutives hors budget avant de baisser la cible. */
export const RENDER_BUDGET_STRIKES = 24;

export interface UpscaleEligibilityInput {
  mode: UpscaleMode;
  /** Le membre a un accès VIP actif (jeton ou code). */
  isVip: boolean;
  /** Mobile / tablette : pas de budget GPU, on laisse le décodage natif. */
  isMobile: boolean;
  /** Contexte WebGL obtenu avec succès dans ce navigateur. */
  supportsWebGL: boolean;
  /** Lecture en Picture-in-Picture : le canvas n'est plus la surface visible. */
  isPipActive?: boolean;
  /** Onglet en arrière-plan : inutile de brûler du GPU. */
  isDocumentHidden?: boolean;
}

export interface UpscaleTarget {
  width: number;
  height: number;
  /** Vrai quand la cible est réellement plus grande que la source. */
  upscaled: boolean;
}

export interface UpscaleModeDescription {
  /** Libellé court affiché dans le lecteur. */
  label: string;
  /** Sous-titre explicatif (français). */
  detail: string;
  /** Nom du pipeline de shaders utilisé. */
  pipeline: string;
  /** Taille de sortie visée. */
  output: string;
}

/** L'upscaling ne s'active que pour un VIP sur ordinateur, WebGL disponible. */
export function isUpscalingActive(input: UpscaleEligibilityInput): boolean {
  if (input.mode === 'off') return false;
  if (!input.isVip) return false;
  if (input.isMobile) return false;
  if (!input.supportsWebGL) return false;
  if (input.isPipActive) return false;
  if (input.isDocumentHidden) return false;
  return true;
}

/**
 * Taille de rendu visée : 2560 × 1440 au maximum, en conservant le ratio de
 * la source. Une source déjà en 1440p (ou au-delà) n'est pas réduite.
 */
export function computeUpscaleTarget(
  sourceWidth: number,
  sourceHeight: number,
): UpscaleTarget {
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
    return { width: UPSCALE_TARGET_WIDTH, height: UPSCALE_TARGET_HEIGHT, upscaled: true };
  }

  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = UPSCALE_TARGET_WIDTH / UPSCALE_TARGET_HEIGHT;

  let width = sourceAspect >= targetAspect
    ? UPSCALE_TARGET_WIDTH
    : Math.round(UPSCALE_TARGET_HEIGHT * sourceAspect);
  let height = sourceAspect >= targetAspect
    ? Math.round(UPSCALE_TARGET_WIDTH / sourceAspect)
    : UPSCALE_TARGET_HEIGHT;

  // Ne jamais agrandir au-delà du nécessaire : une source 4K reste en 4K.
  if (sourceWidth >= width && sourceHeight >= height) {
    return {
      width: Math.round(sourceWidth),
      height: Math.round(sourceHeight),
      upscaled: false,
    };
  }

  // Toujours un multiple pair : les filtres GPU et l'encodage préfèrent ça.
  width = Math.max(2, Math.round(width / 2) * 2);
  height = Math.max(2, Math.round(height / 2) * 2);
  return { width, height, upscaled: true };
}

/** Faut-il baisser la cible après une série d'images trop lentes ? */
export function shouldDegradeTarget(
  averageRenderMs: number,
  strikes: number,
): boolean {
  return averageRenderMs > RENDER_BUDGET_MS && strikes >= RENDER_BUDGET_STRIKES;
}

/** Cible de repli quand le GPU ne suit pas : la résolution de la source. */
export function computeFallbackTarget(
  sourceWidth: number,
  sourceHeight: number,
): UpscaleTarget {
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
    return { width: 1920, height: 1080, upscaled: false };
  }
  return {
    width: Math.max(2, Math.round(sourceWidth / 2) * 2),
    height: Math.max(2, Math.round(sourceHeight / 2) * 2),
    upscaled: false,
  };
}

/** Libellés français des trois modes du lecteur. */
export function describeUpscaleMode(mode: UpscaleMode): UpscaleModeDescription {
  switch (mode) {
    case 'cas':
      return {
        label: 'Standard (1440p)',
        detail: 'Agrandissement GPU 1080p → 2K avec netteté adaptative CAS.',
        pipeline: 'Bilinéaire GPU + CAS',
        output: '2560 × 1440',
      };
    case 'ultra':
      return {
        label: 'Ultra 2K (cinéma)',
        detail: 'Agrandissement bicubique + accentuation RCAS renforcée, réservé aux VIP.',
        pipeline: 'Bicubique Catmull-Rom + RCAS',
        output: '2560 × 1440',
      };
    default:
      return {
        label: 'Désactivé (natif)',
        detail: 'La source est affichée telle quelle, sans traitement GPU.',
        pipeline: 'Aucun',
        output: 'Source',
      };
  }
}

export interface RenderSizeInput {
  target: UpscaleTarget;
  sourceWidth: number;
  sourceHeight: number;
  /** Taille CSS de la boîte vidéo (le conteneur du lecteur). */
  displayWidth: number;
  displayHeight: number;
  devicePixelRatio?: number;
  /**
   * Rendu au-delà de la taille d'affichage (sur-échantillonnage) : le
   * downscale final du navigateur lisse l'image, au prix du GPU. Réservé au
   * mode Ultra en plein écran.
   */
  supersample?: boolean;
}

/**
 * Taille de rendu réelle du canvas.
 *
 * On ne rend jamais plus de pixels que l'écran ne peut en montrer, sinon le
 * GPU chauffe pour un détail invisible — sauf en sur-échantillonnage
 * volontaire, et jamais moins que la résolution de la source (ce serait une
 * perte sèche).
 */
export function computeRenderSize(input: RenderSizeInput): { width: number; height: number } {
  const dpr = Math.min(Math.max(input.devicePixelRatio ?? 1, 1), 2);
  let width = input.target.width;
  let height = input.target.height;

  if (!input.supersample) {
    const displayWidth = Math.max(1, input.displayWidth * dpr);
    const displayHeight = Math.max(1, input.displayHeight * dpr);
    const shrink = Math.min(1, displayWidth / width, displayHeight / height);
    if (shrink < 1) {
      width = Math.floor(width * shrink);
      height = Math.floor(height * shrink);
    }
  }

  if (width < input.sourceWidth || height < input.sourceHeight) {
    const aspect = input.sourceWidth / input.sourceHeight;
    width = Math.max(width, input.sourceWidth);
    height = Math.max(height, Math.round(width / aspect));
  }

  return {
    width: Math.max(2, Math.round(width / 2) * 2),
    height: Math.max(2, Math.round(height / 2) * 2),
  };
}

/** Phrase affichée dans l'overlay technique du lecteur. */
export function describeUpscaleStatus(
  mode: UpscaleMode,
  target: UpscaleTarget | null,
  options: { degraded?: boolean; isVip?: boolean } = {},
): string {
  if (mode === 'off') return 'Super Résolution désactivée';
  if (!options.isVip) return 'Super Résolution réservée aux membres VIP';
  if (!target) return 'Super Résolution en attente du flux';
  if (options.degraded) return `Super Résolution adaptée au GPU (${target.width} × ${target.height})`;
  if (!target.upscaled) return 'Source déjà en 2K ou plus : accentuation seule';
  return `Super Résolution locale ${target.width} × ${target.height}`;
}
