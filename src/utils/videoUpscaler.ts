/**
 * Moteur de Super Résolution locale d'Orvix (WebGL 2, repli WebGL 1).
 *
 * Le principe : la vidéo décodée par le navigateur (souvent 1080p) est
 * ré-échantillonnée par le GPU **de l'utilisateur** vers une surface
 * 2560 × 1440, avec accentuation des contours dans la même chaîne. Aucune
 * image ne transite par le serveur : le lecteur ne lui demande que le flux
 * d'origine, et le PC du membre fait le reste.
 *
 * Pipeline :
 *   1. passe d'agrandissement → bilinéaire matériel (mode « Standard ») ou
 *      bicubique Catmull-Rom 4 taps via filtrage matériel (mode « Ultra »),
 *      rendue dans une cible au ratio exact de la source ;
 *   2. passe d'accentuation adaptative (inspirée RCAS) → canvas affiché.
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
 * Passe 1 — agrandissement.
 * `uUseBicubic` = 0 : bilinéaire matériel ; 1 : bicubique Catmull-Rom
 * (4 prélèvements seulement, les moyennes étant déléguées au filtrage
 * bilinéaire du GPU — le compromis classique qualité/coût).
 */
const UPSCALE_FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D uTexture;
uniform vec2 uSourceTexel;
uniform float uUseBicubic;
varying vec2 vUv;

vec4 cubic(float v) {
  vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
  vec4 s = n * n * n;
  float x = s.x;
  float y = s.y - 4.0 * s.x;
  float z = s.z - 4.0 * s.y + 6.0 * s.x;
  float w = 6.0 - x - y - z;
  return vec4(x, y, z, w) * (1.0 / 6.0);
}

vec4 sampleBicubic(vec2 uv) {
  vec2 texSize = 1.0 / uSourceTexel;
  vec2 position = uv * texSize - 0.5;
  vec2 fraction = fract(position);
  position -= fraction;

  vec4 xWeights = cubic(fraction.x);
  vec4 yWeights = cubic(fraction.y);
  vec4 corners = position.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 sums = vec4(xWeights.xz + xWeights.yw, yWeights.xz + yWeights.yw);
  vec4 offset = corners + vec4(xWeights.yw, yWeights.yw) / sums;
  offset *= uSourceTexel.xxyy;

  vec4 sample0 = texture2D(uTexture, offset.xz);
  vec4 sample1 = texture2D(uTexture, offset.yz);
  vec4 sample2 = texture2D(uTexture, offset.xw);
  vec4 sample3 = texture2D(uTexture, offset.yw);
  float sx = sums.x / (sums.x + sums.y);
  float sy = sums.z / (sums.z + sums.y);
  return mix(mix(sample3, sample2, sx), mix(sample1, sample0, sx), sy);
}

void main() {
  vec2 uv = clamp(vUv, vec2(0.0), vec2(1.0));
  if (uUseBicubic > 0.5) {
    gl_FragColor = sampleBicubic(uv);
  } else {
    gl_FragColor = texture2D(uTexture, uv);
  }
}
`;

/**
 * Passe 2 — accentuation adaptative (inspirée de RCAS/FidelityFX).
 * Le gain de netteté est borné par le contraste local : pas de halos sur les
 * aplats, pas de bruit amplifié dans les zones granuleuses.
 */
const SHARPEN_FRAGMENT_SHADER = `
precision highp float;
uniform sampler2D uTexture;
uniform vec2 uTexel;
uniform float uSharpness;
varying vec2 vUv;

void main() {
  vec3 center = texture2D(uTexture, vUv).rgb;
  if (uSharpness <= 0.0001) {
    gl_FragColor = vec4(center, 1.0);
    return;
  }

  vec3 north = texture2D(uTexture, vUv + vec2(0.0, uTexel.y)).rgb;
  vec3 south = texture2D(uTexture, vUv - vec2(0.0, uTexel.y)).rgb;
  vec3 west  = texture2D(uTexture, vUv - vec2(uTexel.x, 0.0)).rgb;
  vec3 east  = texture2D(uTexture, vUv + vec2(uTexel.x, 0.0)).rgb;

  vec3 neighbourMin = min(min(north, south), min(west, east));
  vec3 neighbourMax = max(max(north, south), max(west, east));
  vec3 blur = (north + south + west + east) * 0.25;
  vec3 detail = center - blur;

  float localContrast = max(
    max(neighbourMax.r - neighbourMin.r, neighbourMax.g - neighbourMin.g),
    neighbourMax.b - neighbourMin.b
  );
  float attenuation = clamp(1.0 - localContrast * 1.35, 0.15, 1.0);
  vec3 sharpened = center + detail * (uSharpness * attenuation);

  gl_FragColor = vec4(clamp(sharpened, neighbourMin, neighbourMax), 1.0);
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

  /** Change le mode de traitement ('cas' = standard, 'ultra' = bicubique). */
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

  /** Force de l'accentuation selon le mode (0 = agrandissement seul). */
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
    gl.uniform1f(this.upscaleProgram.uniforms.uUseBicubic, this.mode === 'ultra' ? 1 : 0);
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
