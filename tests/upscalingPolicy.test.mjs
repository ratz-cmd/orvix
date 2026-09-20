// Super Résolution 2K locale (VIP).
//
// Ces tests verrouillent les trois promesses du dispositif :
//   1. la cible est bien du 2560 × 1440, calculée uniquement côté client ;
//   2. seuls les VIP sur ordinateur y ont droit (pas les mobiles, pas les
//      sessions sans WebGL, pas le Picture-in-Picture) ;
//   3. le cadrage du canvas reproduit exactement l'`object-fit` du lecteur,
//      sinon l'image sauterait au passage en 2K.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const loadTsModule = (relativePath) => {
  const cache = new Map();
  const load = (absolutePath) => {
    if (cache.has(absolutePath)) return cache.get(absolutePath);
    const source = readFileSync(absolutePath, 'utf8');
    const js = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const mod = { exports: {} };
    cache.set(absolutePath, mod.exports);
    const localRequire = (specifier) => {
      if (!specifier.startsWith('.')) return require(specifier);
      const target = resolve(dirname(absolutePath), specifier);
      for (const candidate of [target, `${target}.ts`, `${target}.tsx`, resolve(target, 'index.ts')]) {
        try {
          return load(candidate);
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
        }
      }
      throw new Error(`Import introuvable depuis ${absolutePath}: ${specifier}`);
    };
    new Function('require', 'module', 'exports', js)(localRequire, mod, mod.exports);
    cache.set(absolutePath, mod.exports);
    return mod.exports;
  };
  return load(resolve(rootDir, relativePath));
};

const policy = loadTsModule('src/utils/upscalingPolicy.ts');
const upscaler = loadTsModule('src/utils/videoUpscaler.ts');

const baseEligibility = {
  mode: 'ultra',
  isVip: true,
  isMobile: false,
  supportsWebGL: true,
};

test('la cible de Super Résolution est le 2K (2560 × 1440), jamais le serveur', () => {
  const target = policy.computeUpscaleTarget(1920, 1080);
  assert.deepEqual({ width: target.width, height: target.height }, { width: 2560, height: 1440 });
  assert.equal(target.upscaled, true);
});

test('le ratio de la source est conservé (pas d’image étirée)', () => {
  // Source 4:3 → la largeur suit la hauteur 1440p.
  const fourThree = policy.computeUpscaleTarget(640, 480);
  assert.equal(fourThree.height, 1440);
  assert.equal(fourThree.width, 1920);

  // Source 21:9 → la largeur est plafonnée à 2560.
  const ultraWide = policy.computeUpscaleTarget(2560, 1080);
  assert.equal(ultraWide.width, 2560);
  assert.equal(ultraWide.height, 1080);
  assert.equal(ultraWide.upscaled, false);
});

test('une source déjà en 2K ou plus n’est jamais réduite par l’upscaler', () => {
  const source4k = policy.computeUpscaleTarget(3840, 2160);
  assert.deepEqual({ ...source4k }, { width: 3840, height: 2160, upscaled: false });

  const source1440 = policy.computeUpscaleTarget(2560, 1440);
  assert.equal(source1440.upscaled, false);
  assert.equal(source1440.width, 2560);
});

test('la taille de rendu ne dépasse jamais l’écran, sauf sur-échantillonnage demandé', () => {
  const target = policy.computeUpscaleTarget(1920, 1080);

  // Petite fenêtre 960 × 540 : inutile de rendre 1440p pour 540 lignes.
  const small = policy.computeRenderSize({
    target, sourceWidth: 1920, sourceHeight: 1080,
    displayWidth: 960, displayHeight: 540, devicePixelRatio: 1,
  });
  assert.ok(small.width <= 1920, `largeur rendue ${small.width}`);
  assert.equal(small.height % 2, 0);

  // Plein écran en mode Ultra : on paie le sur-échantillonnage 2K.
  const fullscreen = policy.computeRenderSize({
    target, sourceWidth: 1920, sourceHeight: 1080,
    displayWidth: 1920, displayHeight: 1080, devicePixelRatio: 1, supersample: true,
  });
  assert.deepEqual(fullscreen, { width: 2560, height: 1440 });
});

test('la taille de rendu ne descend jamais sous la résolution de la source', () => {
  const target = policy.computeUpscaleTarget(1920, 1080);
  const tiny = policy.computeRenderSize({
    target, sourceWidth: 1920, sourceHeight: 1080,
    displayWidth: 320, displayHeight: 180, devicePixelRatio: 1,
  });
  assert.ok(tiny.width >= 1920, `largeur ${tiny.width}`);
  assert.ok(tiny.height >= 1080, `hauteur ${tiny.height}`);
});

test('l’upscaling est réservé aux VIP sur ordinateur avec WebGL', () => {
  assert.equal(policy.isUpscalingActive(baseEligibility), true);

  assert.equal(policy.isUpscalingActive({ ...baseEligibility, isVip: false }), false);
  assert.equal(policy.isUpscalingActive({ ...baseEligibility, isMobile: true }), false);
  assert.equal(policy.isUpscalingActive({ ...baseEligibility, supportsWebGL: false }), false);
  assert.equal(policy.isUpscalingActive({ ...baseEligibility, mode: 'off' }), false);
  assert.equal(policy.isUpscalingActive({ ...baseEligibility, isPipActive: true }), false);
  assert.equal(policy.isUpscalingActive({ ...baseEligibility, isDocumentHidden: true }), false);
});

test('la dégradation automatique se déclenche après une série d’images trop lentes', () => {
  assert.equal(policy.shouldDegradeTarget(4, 100), false);
  assert.equal(policy.shouldDegradeTarget(30, 3), false);
  assert.equal(policy.shouldDegradeTarget(30, policy.RENDER_BUDGET_STRIKES), true);

  const fallback = policy.computeFallbackTarget(1920, 1080);
  assert.equal(fallback.upscaled, false);
  assert.deepEqual({ width: fallback.width, height: fallback.height }, { width: 1920, height: 1080 });
});

test('les libellés français décrivent le vrai pipeline', () => {
  assert.equal(policy.describeUpscaleMode('off').label, 'Désactivé (natif)');
  assert.match(policy.describeUpscaleMode('cas').detail, /2K/);
  assert.match(policy.describeUpscaleMode('ultra').pipeline, /Bicubique/);

  const status = policy.describeUpscaleStatus('ultra', { width: 2560, height: 1440, upscaled: true }, { isVip: true });
  assert.match(status, /2560 × 1440/);
  assert.match(policy.describeUpscaleStatus('ultra', null, { isVip: false }), /VIP/);
});

test('le cadrage du canvas reproduit l’object-fit du lecteur', () => {
  // Vidéo 16:9 dans une boîte 16:9 : aucun ajustement.
  assert.deepEqual(
    upscaler.computeFitGeometry(1920, 1080, 1920, 1080, { mode: 'contain' }),
    { scaleX: 1, scaleY: 1 },
  );

  // Vidéo 4:3 en « contain » : bandes noires à gauche et à droite.
  const contain = upscaler.computeFitGeometry(640, 480, 1920, 1080, { mode: 'contain' });
  assert.equal(contain.scaleX, (4 / 3) / (16 / 9));
  assert.equal(contain.scaleY, 1);

  // La même en « cover » : largeur pleine, débordement vertical.
  const cover = upscaler.computeFitGeometry(640, 480, 1920, 1080, { mode: 'cover' });
  assert.equal(cover.scaleX, 1);
  assert.equal(cover.scaleY, (16 / 9) / (4 / 3));

  // Ratio de boîte imposé (modes 16:9 / 4:3 du lecteur) : une source 16:9
  // affichée en couverture 4:3 déborde sur les côtés.
  const forced = upscaler.computeFitGeometry(1920, 1080, 1920, 1080, { mode: 'cover', boxAspect: 4 / 3 });
  assert.ok(forced.scaleX > 1);
  assert.equal(forced.scaleY, 1);
  // …et l'inverse : une source 4:3 en couverture 16:9 déborde en hauteur.
  const forcedTall = upscaler.computeFitGeometry(640, 480, 1920, 1080, { mode: 'cover', boxAspect: 16 / 9 });
  assert.equal(forcedTall.scaleX, 1);
  assert.ok(forcedTall.scaleY > 1);
});

test('le moteur est inerte hors navigateur au lieu de planter', () => {
  // `isSupported` doit répondre false en Node (pas de `document`).
  assert.equal(upscaler.OrvixVideoUpscaler.isSupported(), false);
  // Une géométrie dégénérée ne produit pas de NaN.
  const degenerate = upscaler.computeFitGeometry(0, 0, 0, 0, { mode: 'contain' });
  assert.ok(Number.isFinite(degenerate.scaleX) && Number.isFinite(degenerate.scaleY));
});
