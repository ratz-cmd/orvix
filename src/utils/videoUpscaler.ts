/**
 * Moteur de Super Résolution locale d'Orvix (WebGL 2, repli WebGL 1).
 *
 * Le principe : la vidéo décodée par le navigateur (souvent 1080p) est
 * ré-échantillonnée par le GPU **de l'utilisateur** vers une surface
 * 2560 × 1440, avec accentuation des contours dans la même chaîne. Aucune
 * image ne transite par le serveur : le lecteur ne lui demande que le flux
 * d'origine, et le PC du membre fait le reste.
 *
 * Pipeline (portage GLSL ES 1.00 de AMD FidelityFX Super Resolution 1.0,
 * `ffx_fsr1.h`, licence MIT — AMD) :
 *   1. **EASU** (Edge-Adaptive Spatial Upsampling) : agrandissement à 12 taps
 *      en losange, analyse du gradient directionnel local, filtrage
 *      Lanczos-2 anisotrope orienté le long de l'arête, clamp anti-ringing
 *      sur les 4 plus proches voisins. En mode « Standard » ou quand le
 *      budget GPU est dépassé, on retombe sur le bilinéaire matériel ;
 *   2. **RCAS** (Robust Contrast-Adaptive Sharpening) : accentuation à 5 taps
 *      dont le lobe négatif est borné par la dynamique locale
 *      (`hitMin`/`hitMax`, `FSR_RCAS_LIMIT`), avec atténuation sur le bruit.
 *
 * Le module est volontairement autonome (aucun import React) pour rester
 * testable et réutilisable par l'app mobile (WebView) et le userscript.
 */

import type { UpscaleMode, UpscaleTarget } from './upscalingPolicy';
import { RENDER_BUDGET_MS, RENDER_BUDGET_STRIKES } from './upscalingPolicy';

export interface UpscalerStats {
  /** Images traitées par le GPU depuis l'activation. */
  frames: number;
  /** Temps moyen par image (ms, moyenne glissante). */
  renderMs: number;
  /** Taille de rendu réelle. */
  width: number;
  height: number;
  /** Vrai quand le GPU n'atteint pas le budget et que la cible a été baissée. */
  degraded: boolean;
}

export interface VideoUpscalerOptions {
  mode?: UpscaleMode;
  onStats?: (stats: UpscalerStats) => void;
  onDegrade?: () => void;
  onError?: (message: string) => void;
}

export interface FitOptions {
  /** Reproduit l'`object-fit` de l'élément vidéo. */
  mode: 'contain' | 'cover';
  /** Ratio de boîte imposé (les modes « 16:9 » / « 4:3 » du lecteur). */
  boxAspect?: number;
}

const VERTEX_SHADER = `
attribute vec2 aPosition;
uniform vec2 uQuadScale;
uniform vec2 uQuadOffset;
varying vec2 vUv;
void main() {
  // La texture est retournée à l'échantillonnage : la vidéo arrive dans le
  // sens HTML (origine en haut à gauche).
  vUv = vec2(aPosition.x * 0.5 + 0.5, 0.5 - aPosition.y * 0.5);
  vec2 pos = aPosition * uQuadScale + uQuadOffset;
  gl_Position = vec4(pos, 0.0, 1.0);
}
`;

/**
 * Passe 1 — EASU (Edge-Adaptive Spatial Upsampling), FSR 1.0.
 *
 * Portage fidèle de `FsrEasuF` / `FsrEasuSetF` / `FsrEasuTapF` /
 * `FsrEasuCon` (ffx_fsr1.h, AMD, MIT), adapté à GLSL ES 1.00 :
 *   - pas de `textureGather` (WebGL 1) : les 12 taps sont prélevés par 12
 *     `texture2D` aux centres de texels — équivalent exact du gather ;
 *   - les RCP/RSQ « approximatifs » d'AMD (qui saturent) sont remplacés par
 *     des inverses exacts protégés contre la division par zéro : écart
 *     uniquement numérique, l'algorithme est inchangé ;
 *   - constantes de `FsrEasuCon` réduites au cas plein cadre (viewport =
 *     taille d'entrée) : `pp = vUv * uSourceSize - 0.5`.
 *
 * `uUseBicubic` (nom historique conservé : le test de câblage le verrouille)
 * vaut 1 → EASU, 0 → bilinéaire matériel (mode Standard et repli budget).
 */
const UPSCALE_FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D uTexture;
uniform vec2 uSourceTexel;
uniform vec2 uSourceSize;
uniform float uUseBicubic;
varying vec2 vUv;

// Luma x2 d'AMD (approximation la moins chère possible : 2 FMA).
float easuLuma(vec3 c) {
  return c.b * 0.5 + (c.r * 0.5 + c.g);
}

// FsrEasuSetF : accumule direction + longueur depuis une croix de 5 lumas
//        a
//      b c d
//        e
// pondérée par le poids bilinéaire du quadrant.
void easuSet(inout vec2 dir, inout float len, float w,
             float lA, float lB, float lC, float lD, float lE) {
  float dc = lD - lC;
  float cb = lC - lB;
  float lenX = max(abs(dc), abs(cb));
  lenX = 1.0 / max(lenX, 1e-6);
  float dirX = lD - lB;
  dir.x += dirX * w;
  lenX = clamp(abs(dirX) * lenX, 0.0, 1.0);
  lenX *= lenX;
  len += lenX * w;

  float ec = lE - lC;
  float ca = lC - lA;
  float lenY = max(abs(ec), abs(ca));
  lenY = 1.0 / max(lenY, 1e-6);
  float dirY = lE - lA;
  dir.y += dirY * w;
  lenY = clamp(abs(dirY) * lenY, 0.0, 1.0);
  lenY *= lenY;
  len += lenY * w;
}

// FsrEasuTapF : poids Lanczos-2 anisotrope (approximation sans sin/sqrt).
void easuTap(inout vec3 aC, inout float aW, vec2 off, vec2 dir, vec2 len,
             float lob, float clp, vec3 c) {
  vec2 v;
  v.x = (off.x * dir.x) + (off.y * dir.y);
  v.y = (off.x * (-dir.y)) + (off.y * dir.x);
  v *= len;
  float d2 = v.x * v.x + v.y * v.y;
  d2 = min(d2, clp);
  float wB = (2.0 / 5.0) * d2 - 1.0;
  float wA = lob * d2 - 1.0;
  wB *= wB;
  wA *= wA;
  wB = (25.0 / 16.0) * wB - (25.0 / 16.0 - 1.0);
  float w = wB * wA;
  aC += c * w;
  aW += w;
}

vec3 easuFetch(vec2 base, vec2 off) {
  return texture2D(uTexture, (base + off + 0.5) * uSourceTexel).rgb;
}

vec3 sampleEasu(vec2 uv) {
  // Position dans l'espace pixel d'entrée (constantes FsrEasuCon réduites).
  vec2 pp = uv * uSourceSize - 0.5;
  vec2 fp = floor(pp);
  pp -= fp;

  // 12 taps en losange :
  //    b c
  //  e f g h
  //  i j k l
  //    n o
  vec3 bC = easuFetch(fp, vec2( 0.0, -1.0));
  vec3 cC = easuFetch(fp, vec2( 1.0, -1.0));
  vec3 eC = easuFetch(fp, vec2(-1.0,  0.0));
  vec3 fC = easuFetch(fp, vec2( 0.0,  0.0));
  vec3 gC = easuFetch(fp, vec2( 1.0,  0.0));
  vec3 hC = easuFetch(fp, vec2( 2.0,  0.0));
  vec3 iC = easuFetch(fp, vec2(-1.0,  1.0));
  vec3 jC = easuFetch(fp, vec2( 0.0,  1.0));
  vec3 kC = easuFetch(fp, vec2( 1.0,  1.0));
  vec3 lC = easuFetch(fp, vec2( 2.0,  1.0));
  vec3 nC = easuFetch(fp, vec2( 0.0,  2.0));
  vec3 oC = easuFetch(fp, vec2( 1.0,  2.0));

  float bL = easuLuma(bC);
  float cL = easuLuma(cC);
  float eL = easuLuma(eC);
  float fL = easuLuma(fC);
  float gL = easuLuma(gC);
  float hL = easuLuma(hC);
  float iL = easuLuma(iC);
  float jL = easuLuma(jC);
  float kL = easuLuma(kC);
  float lL = easuLuma(lC);
  float nL = easuLuma(nC);
  float oL = easuLuma(oC);

  // Direction + longueur : 4 croix pondérées par les poids bilinéaires.
  vec2 dir = vec2(0.0);
  float len = 0.0;
  easuSet(dir, len, (1.0 - pp.x) * (1.0 - pp.y), bL, eL, fL, gL, jL);
  easuSet(dir, len, pp.x * (1.0 - pp.y),         cL, fL, gL, hL, kL);
  easuSet(dir, len, (1.0 - pp.x) * pp.y,         fL, iL, jL, kL, nL);
  easuSet(dir, len, pp.x * pp.y,                 gL, jL, kL, lL, oL);

  // Normalisation (nettoyage près de zéro, comme la référence).
  vec2 dir2 = dir * dir;
  float dirR = dir2.x + dir2.y;
  bool zro = dirR < (1.0 / 32768.0);
  dirR = inversesqrt(max(dirR, 1e-12));
  dirR = zro ? 1.0 : dirR;
  dir.x = zro ? 1.0 : dir.x;
  dir *= dirR;

  // Mise en forme de la longueur + étirement du noyau le long de l'arête.
  len = len * 0.5;
  len *= len;
  float stretch = (dir.x * dir.x + dir.y * dir.y)
    / max(max(abs(dir.x), abs(dir.y)), 1e-6);
  vec2 len2 = vec2(1.0 + (stretch - 1.0) * len, 1.0 - 0.5 * len);
  float lob = 0.5 + ((1.0 / 4.0 - 0.04) - 0.5) * len;
  float clp = 1.0 / lob;

  // Accumulation des 12 taps + min/max des 4 plus proches (anti-ringing).
  vec3 min4 = min(min(fC, gC), min(jC, kC));
  vec3 max4 = max(max(fC, gC), max(jC, kC));
  vec3 aC = vec3(0.0);
  float aW = 0.0;
  easuTap(aC, aW, vec2( 0.0, -1.0) - pp, dir, len2, lob, clp, bC);
  easuTap(aC, aW, vec2( 1.0, -1.0) - pp, dir, len2, lob, clp, cC);
  easuTap(aC, aW, vec2(-1.0,  1.0) - pp, dir, len2, lob, clp, iC);
  easuTap(aC, aW, vec2( 0.0,  1.0) - pp, dir, len2, lob, clp, jC);
  easuTap(aC, aW, vec2( 0.0,  0.0) - pp, dir, len2, lob, clp, fC);
  easuTap(aC, aW, vec2(-1.0,  0.0) - pp, dir, len2, lob, clp, eC);
  easuTap(aC, aW, vec2( 1.0,  1.0) - pp, dir, len2, lob, clp, kC);
  easuTap(aC, aW, vec2( 2.0,  1.0) - pp, dir, len2, lob, clp, lC);
  easuTap(aC, aW, vec2( 2.0,  0.0) - pp, dir, len2, lob, clp, hC);
  easuTap(aC, aW, vec2( 1.0,  0.0) - pp, dir, len2, lob, clp, gC);
  easuTap(aC, aW, vec2( 1.0,  2.0) - pp, dir, len2, lob, clp, oC);
  easuTap(aC, aW, vec2( 0.0,  2.0) - pp, dir, len2, lob, clp, nC);

  // Normalisation + suppression du ringing.
  return min(max4, max(min4, aC / aW));
}

void main() {
  vec2 uv = clamp(vUv, vec2(0.0), vec2(1.0));
  if (uUseBicubic > 0.5) {
    gl_FragColor = vec4(sampleEasu(uv), 1.0);
  } else {
    gl_FragColor = texture2D(uTexture, uv);
  }
}
`;

/**
 * Passe 2 — RCAS (Robust Contrast-Adaptive Sharpening), FSR 1.0.
 *
 * Portage fidèle de `FsrRcasF` / `FsrRcasCon` (ffx_fsr1.h, AMD, MIT) :
 *   - 5 taps en croix (b, d, e, f, h) ;
 *   - détection de bruit `nz` (variante `FSR_RCAS_DENOISE` activée, comme
 *     dans les intégrations de référence) : le lobe est atténué là où le
 *     centre s'écarte de la moyenne de l'anneau sans dynamique locale —
 *     signature du bruit vidéo, qui ne doit pas être amplifié ;
 *   - limiteurs `hitMin`/`hitMax` calculés par canal depuis le min/max de
 *     l'anneau : le lobe négatif ne peut jamais pousser un canal hors de
 *     [min, max] local → pas de halos sur les aplats ;
 *   - lobe borné à `-FSR_RCAS_LIMIT` (= 0.25 − 1/16), puis multiplié par
 *     `uSharpness` qui joue le rôle de `exp2(-stops)` de `FsrRcasCon`
 *     (le JS fournit déjà une intensité linéaire 0..1, pas des stops).
 * Adaptations GLSL ES 1.00 : inverses exacts protégés au lieu des RCP
 * approximatifs saturants d'AMD (écart uniquement numérique).
 */
const SHARPEN_FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D uTexture;
uniform vec2 uTexel;
uniform float uSharpness;
varying vec2 vUv;

// FSR_RCAS_LIMIT (ffx_fsr1.h) : excursion maximale du lobe négatif.
const float RCAS_LIMIT = 0.25 - (1.0 / 16.0);

float rcasLuma(vec3 c) {
  return c.b * 0.5 + (c.r * 0.5 + c.g);
}

void main() {
  //    b
  //  d e f
  //    h
  vec3 b = texture2D(uTexture, vUv + vec2(0.0, -uTexel.y)).rgb;
  vec3 d = texture2D(uTexture, vUv + vec2(-uTexel.x, 0.0)).rgb;
  vec3 e = texture2D(uTexture, vUv).rgb;
  vec3 f = texture2D(uTexture, vUv + vec2(uTexel.x, 0.0)).rgb;
  vec3 h = texture2D(uTexture, vUv + vec2(0.0, uTexel.y)).rgb;

  if (uSharpness <= 0.0001) {
    gl_FragColor = vec4(e, 1.0);
    return;
  }

  float bL = rcasLuma(b);
  float dL = rcasLuma(d);
  float eL = rcasLuma(e);
  float fL = rcasLuma(f);
  float hL = rcasLuma(h);

  // Détection de bruit (FSR_RCAS_DENOISE).
  float nz = 0.25 * bL + 0.25 * dL + 0.25 * fL + 0.25 * hL - eL;
  float rangeMax = max(max(bL, dL), max(max(eL, fL), hL));
  float rangeMin = min(min(bL, dL), min(min(eL, fL), hL));
  nz = clamp(abs(nz) / max(rangeMax - rangeMin, 1e-6), 0.0, 1.0);
  nz = -0.5 * nz + 1.0;

  // Min / max de l'anneau (sans le centre), par canal.
  vec3 mn4 = min(min(b, d), min(f, h));
  vec3 mx4 = max(max(b, d), max(f, h));

  // Limiteurs : peakC = (1, -4) dans la référence.
  vec3 hitMin = min(mn4, e) / max(4.0 * mx4, vec3(1e-6));
  vec3 hitMax = (1.0 - max(mx4, e)) / max(4.0 * mn4 - 4.0, vec3(1e-6));
  vec3 lobeRGB = max(-hitMin, hitMax);
  float lobe = max(-RCAS_LIMIT, min(max(max(lobeRGB.r, lobeRGB.g), lobeRGB.b), 0.0))
    * uSharpness;

  // Suppression du bruit, puis résolution du noyau à 5 taps.
  lobe *= nz;
  float rcpL = 1.0 / (4.0 * lobe + 1.0);
  vec3 pix = (lobe * b + lobe * d + lobe * h + lobe * f + e) * rcpL;
  gl_FragColor = vec4(pix, 1.0);
}
`;

interface ProgramBundle {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation | null>;
  positionAttribute: number;
}

const buildProgram = (
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string,
): ProgramBundle | null => {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  const vertexShader = compile(gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compile(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertexShader || !fragmentShader) {
    if (vertexShader) gl.deleteShader(vertexShader);
    if (fragmentShader) gl.deleteShader(fragmentShader);
    return null;
  }

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }

  const uniforms: Record<string, WebGLUniformLocation | null> = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  for (let index = 0; index < count; index += 1) {
    const info = gl.getActiveUniform(program, index);
    if (!info) continue;
    uniforms[info.name] = gl.getUniformLocation(program, info.name);
  }

  return {
    program,
    uniforms,
    positionAttribute: gl.getAttribLocation(program, 'aPosition'),
  };
};

/**
 * Facteurs appliqués au quad final pour retrouver le cadrage du lecteur.
 *
 * - `contain` : l'image entière tient dans la boîte (bandes noires autour) ;
 * - `cover`   : la boîte est entièrement couverte (bords de l'image rognés).
 *
 * Fonction pure : c'est elle qui garantit que le canvas 2K se superpose
 * exactement à ce que la balise `<video>` aurait affiché.
 */
export function computeFitGeometry(
  sourceWidth: number,
  sourceHeight: number,
  boxWidth: number,
  boxHeight: number,
  fit: FitOptions,
): { scaleX: number; scaleY: number } {
  const safeSourceWidth = sourceWidth > 0 ? sourceWidth : 16;
  const safeSourceHeight = sourceHeight > 0 ? sourceHeight : 9;
  const sourceAspect = safeSourceWidth / safeSourceHeight;
  const boxAspect = fit.boxAspect && fit.boxAspect > 0
    ? fit.boxAspect
    : (boxWidth > 0 && boxHeight > 0 ? boxWidth / boxHeight : sourceAspect);

  if (fit.mode === 'cover') {
    return sourceAspect >= boxAspect
      ? { scaleX: sourceAspect / boxAspect, scaleY: 1 }
      : { scaleX: 1, scaleY: boxAspect / sourceAspect };
  }

  return sourceAspect >= boxAspect
    ? { scaleX: 1, scaleY: boxAspect / sourceAspect }
    : { scaleX: sourceAspect / boxAspect, scaleY: 1 };
}

export class OrvixVideoUpscaler {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext;
  private readonly upscaleProgram: ProgramBundle;
  private readonly sharpenProgram: ProgramBundle;
  private readonly quadBuffer: WebGLBuffer;
  private readonly videoTexture: WebGLTexture;
  private readonly sceneTexture: WebGLTexture;
  private readonly sceneFramebuffer: WebGLFramebuffer;

  private mode: UpscaleMode;
  private fit: FitOptions = { mode: 'contain' };
  private target: UpscaleTarget = { width: 2560, height: 1440, upscaled: true };
  private renderWidth = 2560;
  private renderHeight = 1440;
  private sourceWidth = 1920;
  private sourceHeight = 1080;
  private disposed = false;

  private frames = 0;
  private averageRenderMs = 0;
  private strikes = 0;
  private degraded = false;

  private readonly options: VideoUpscalerOptions;

  /** Test de disponibilité, sans laisser de contexte derrière soi. */
  static isSupported(): boolean {
    if (typeof document === 'undefined') return false;
    try {
      const probe = document.createElement('canvas');
      const context = (probe.getContext('webgl2') || probe.getContext('webgl')) as WebGLRenderingContext | null;
      if (!context) return false;
      context.getExtension('WEBGL_lose_context')?.loseContext();
      return true;
    } catch {
      return false;
    }
  }

  constructor(canvas: HTMLCanvasElement, options: VideoUpscalerOptions = {}) {
    this.canvas = canvas;
    this.options = options;
    this.mode = options.mode ?? 'cas';

    const attributes: WebGLContextAttributes = {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    };
    const context = (
      canvas.getContext('webgl2', attributes) || canvas.getContext('webgl', attributes)
    ) as WebGLRenderingContext | null;
    if (!context) throw new Error('Super Résolution : aucun contexte WebGL disponible');
    this.gl = context;

    const upscaleProgram = buildProgram(this.gl, VERTEX_SHADER, UPSCALE_FRAGMENT_SHADER);
    const sharpenProgram = buildProgram(this.gl, VERTEX_SHADER, SHARPEN_FRAGMENT_SHADER);
    if (!upscaleProgram || !sharpenProgram) {
      throw new Error('Super Résolution : compilation des shaders refusée par le GPU');
    }
    this.upscaleProgram = upscaleProgram;
    this.sharpenProgram = sharpenProgram;

    const quadBuffer = this.gl.createBuffer();
    const videoTexture = this.gl.createTexture();
    const sceneTexture = this.gl.createTexture();
    const sceneFramebuffer = this.gl.createFramebuffer();
    if (!quadBuffer || !videoTexture || !sceneTexture || !sceneFramebuffer) {
      throw new Error('Super Résolution : ressources GPU indisponibles');
    }
    this.quadBuffer = quadBuffer;
    this.videoTexture = videoTexture;
    this.sceneTexture = sceneTexture;
    this.sceneFramebuffer = sceneFramebuffer;

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
    this.gl.bufferData(
      this.gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      this.gl.STATIC_DRAW,
    );

    this.configureTexture(this.videoTexture, false);
    this.configureTexture(this.sceneTexture, true);
    this.applyRenderSize(this.renderWidth, this.renderHeight);
  }

  private configureTexture(texture: WebGLTexture, withStorage: boolean) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    if (withStorage) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
  }

  /** Change le mode de traitement ('cas' = bilinéaire + RCAS, 'ultra' = EASU + RCAS). */
  setMode(mode: UpscaleMode) {
    this.mode = mode;
  }

  /** Reproduit le cadrage du `<video>` (contain/cover, ratio forcé éventuel). */
  setFit(fit: FitOptions) {
    this.fit = fit;
  }

  /** Définit la cible d'agrandissement et la surface de rendu réelle. */
  configure(target: UpscaleTarget, renderSize: { width: number; height: number }) {
    this.target = target;
    this.applyRenderSize(renderSize.width, renderSize.height);
  }

  /** Cible demandée (2560 × 1440 au maximum, ratio de la source conservé). */
  getTarget(): UpscaleTarget {
    return { ...this.target };
  }

  /** Taille réellement rendue par le GPU. */
  getRenderSize() {
    return { width: this.renderWidth, height: this.renderHeight };
  }

  getStats(): UpscalerStats {
    return {
      frames: this.frames,
      renderMs: this.averageRenderMs,
      width: this.renderWidth,
      height: this.renderHeight,
      degraded: this.degraded,
    };
  }

  private applyRenderSize(width: number, height: number) {
    const safeWidth = Math.max(2, Math.round(width));
    const safeHeight = Math.max(2, Math.round(height));
    this.renderWidth = safeWidth;
    this.renderHeight = safeHeight;
    if (this.canvas.width !== safeWidth) this.canvas.width = safeWidth;
    if (this.canvas.height !== safeHeight) this.canvas.height = safeHeight;

    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, safeWidth, safeHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFramebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.sceneTexture, 0,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Intensité RCAS selon le mode (multiplicateur du lobe, rôle de
   * `exp2(-stops)` chez AMD ; 0 = agrandissement seul).
   */
  private sharpenStrength(): number {
    if (this.mode === 'ultra') return 0.55;
    if (this.mode === 'cas') return 0.35;
    return 0;
  }

  private bindQuad(program: ProgramBundle) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    if (program.positionAttribute >= 0) {
      gl.enableVertexAttribArray(program.positionAttribute);
      gl.vertexAttribPointer(program.positionAttribute, 2, gl.FLOAT, false, 0, 0);
    }
  }

  /**
   * Rend une image de la vidéo. Retourne `false` quand l'image est ignorée
   * (vidéo non prête, contexte perdu, instance libérée).
   */
  renderFrame(video: HTMLVideoElement): boolean {
    if (this.disposed) return false;
    const gl = this.gl;
    if (gl.isContextLost()) return false;
    if (!video || video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) {
      return false;
    }

    const started = typeof performance !== 'undefined' ? performance.now() : 0;
    this.sourceWidth = video.videoWidth;
    this.sourceHeight = video.videoHeight;
    const geometry = this.computeGeometry();

    // ── Passe 1 : agrandissement vers la scène interne ──────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFramebuffer);
    gl.viewport(0, 0, this.renderWidth, this.renderHeight);
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
    // Une source vidéo change de dimensions en cours de route (changement de
    // qualité) : `texImage2D` réaligne la texture à chaque image.
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    gl.useProgram(this.upscaleProgram.program);
    this.bindQuad(this.upscaleProgram);
    gl.uniform2f(this.upscaleProgram.uniforms.uQuadScale, 1, 1);
    gl.uniform2f(this.upscaleProgram.uniforms.uQuadOffset, 0, 0);
    gl.uniform2f(
      this.upscaleProgram.uniforms.uSourceTexel,
      1 / this.sourceWidth,
      1 / this.sourceHeight,
    );
    gl.uniform2f(
      this.upscaleProgram.uniforms.uSourceSize,
      this.sourceWidth,
      this.sourceHeight,
    );
    // 1 = EASU (mode Ultra), 0 = bilinéaire. Quand le budget GPU de 11 ms a
    // été dépassé durablement (`degraded`), on replie automatiquement sur le
    // bilinéaire : mieux vaut une image un peu plus douce qu'une lecture
    // qui perd des images.
    const useEasu = this.mode === 'ultra' && !this.degraded;
    gl.uniform1f(this.upscaleProgram.uniforms.uUseBicubic, useEasu ? 1 : 0);
    gl.uniform1i(this.upscaleProgram.uniforms.uTexture, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // ── Passe 2 : accentuation + cadrage vers le canvas ─────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.renderWidth, this.renderHeight);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture);
    gl.useProgram(this.sharpenProgram.program);
    this.bindQuad(this.sharpenProgram);
    gl.uniform2f(this.sharpenProgram.uniforms.uQuadScale, geometry.scaleX, geometry.scaleY);
    gl.uniform2f(this.sharpenProgram.uniforms.uQuadOffset, 0, 0);
    gl.uniform2f(
      this.sharpenProgram.uniforms.uTexel,
      1 / this.renderWidth,
      1 / this.renderHeight,
    );
    gl.uniform1f(this.sharpenProgram.uniforms.uSharpness, this.sharpenStrength());
    gl.uniform1i(this.sharpenProgram.uniforms.uTexture, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // ── Statistiques et dégradation automatique ─────────────────────────────
    this.frames += 1;
    if (started) {
      const elapsed = performance.now() - started;
      this.averageRenderMs = this.averageRenderMs === 0
        ? elapsed
        : this.averageRenderMs * 0.9 + elapsed * 0.1;
      if (this.averageRenderMs > RENDER_BUDGET_MS) {
        this.strikes += 1;
        if (this.strikes === RENDER_BUDGET_STRIKES && !this.degraded) {
          this.degraded = true;
          this.options.onDegrade?.();
        }
      } else {
        this.strikes = 0;
      }
    }
    this.options.onStats?.(this.getStats());

    return true;
  }

  /**
   * Facteurs appliqués au quad final pour retrouver le cadrage du lecteur.
   * `contain` : l'image entière tient dans la boîte (bandes noires).
   * `cover`   : la boîte est entièrement couverte (bords rognés).
   */
  computeGeometry(): { scaleX: number; scaleY: number } {
    return computeFitGeometry(
      this.sourceWidth,
      this.sourceHeight,
      this.renderWidth,
      this.renderHeight,
      this.fit,
    );
  }

  /** Libère toutes les ressources GPU. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const gl = this.gl;
    try {
      gl.deleteBuffer(this.quadBuffer);
      gl.deleteTexture(this.videoTexture);
      gl.deleteTexture(this.sceneTexture);
      gl.deleteFramebuffer(this.sceneFramebuffer);
      gl.deleteProgram(this.upscaleProgram.program);
      gl.deleteProgram(this.sharpenProgram.program);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    } catch (error) {
      this.options.onError?.(error instanceof Error ? error.message : String(error));
    }
  }
}
