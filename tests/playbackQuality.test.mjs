// Politique de qualité du lecteur Orvix.
//
// Le module et son voisin `hlsQuality` sont en TypeScript et sans dépendance
// DOM : on les transpile ici à la volée (même approche que
// `tests/httpCache.test.mjs`) plutôt que de tirer la chaîne Vite dans le test.
//
// Ce qui est verrouillé ici, c'est la promesse produit : jamais de 240p/340p
// quand une meilleure piste existe, plafond 1440p pour les VIP, et un
// avertissement français quand la source entière est pourrie.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Charge un module TS du dépôt en résolvant récursivement ses imports relatifs. */
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
      const candidates = [target, `${target}.ts`, `${target}.tsx`, resolve(target, 'index.ts')];
      for (const candidate of candidates) {
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

const quality = loadTsModule('src/utils/playbackQuality.ts');
const hlsQuality = loadTsModule('src/utils/hlsQuality.ts');

const levels = (...heights) => heights.map((height) => ({
  height,
  width: Math.round((height * 16) / 9),
  bitrate: height * 1000,
}));

/**
 * `selectLevel*` renvoie l'index du niveau **d'origine** (celui attendu par
 * hls.js), pas la position dans la liste triée : on relit la hauteur par là.
 */
const pickedHeight = (options, selectedIndex) => (
  options.find((option) => option.index === selectedIndex)?.height ?? null
);

test('une hauteur de qualité est extraite de tous les formats de libellé', () => {
  assert.equal(quality.normalizeQualityHeight('1080p'), 1080);
  assert.equal(quality.normalizeQualityHeight('360p'), 360);
  assert.equal(quality.normalizeQualityHeight('1920x1080'), 1080);
  assert.equal(quality.normalizeQualityHeight('2560 × 1440'), 1440);
  assert.equal(quality.normalizeQualityHeight(720), 720);
  assert.equal(quality.normalizeQualityHeight('FULL HD'), 1080);
  assert.equal(quality.normalizeQualityHeight('2K'), 1440);
  assert.equal(quality.normalizeQualityHeight('4K UHD'), 2160);
  assert.equal(quality.normalizeQualityHeight('340'), 340);
  assert.equal(quality.normalizeQualityHeight('qualité inconnue'), 0);
  assert.equal(quality.normalizeQualityHeight(null), 0);
});

test('les gammes de qualité sont libellées en français', () => {
  assert.equal(quality.qualityTier(240), 'sd');
  assert.equal(quality.qualityTier(480), 'sd');
  assert.equal(quality.qualityTier(720), 'hd');
  assert.equal(quality.qualityTier(1080), 'fullhd');
  assert.equal(quality.qualityTier(1440), 'qhd');
  assert.equal(quality.qualityTier(2160), 'uhd');
  assert.equal(quality.qualityTierLabelFr('qhd'), '2K (1440p)');
  assert.equal(quality.qualityTierLabelFr('fullhd'), 'Full HD (1080p)');
});

test('le plafond de qualité est de 1440p pour les VIP, 1080p sinon', () => {
  assert.equal(quality.getPlaybackTargetHeight(true), 1440);
  assert.equal(quality.getPlaybackTargetHeight(false), 1080);
  assert.equal(quality.UPSCALE_TARGET_WIDTH, 2560);
  assert.equal(quality.UPSCALE_TARGET_HEIGHT, 1440);
});

test('le lecteur ne se cale jamais sur une piste basse quand une meilleure existe', () => {
  const policy = quality.buildQualityPolicy(false);

  // Manifeste complet : on vise la meilleure piste sous le plafond.
  const full = hlsQuality.buildHlsQualityOptions(levels(1080, 720, 480, 340));
  assert.equal(pickedHeight(full, quality.selectLevelUnderPolicy(full, policy)), 1080);

  // Sans Full HD disponible, on prend le 720p, jamais le 340p.
  const mid = hlsQuality.buildHlsQualityOptions(levels(720, 480, 340));
  assert.equal(pickedHeight(mid, quality.selectLevelUnderPolicy(mid, policy)), 720);

  // Un lecteur qui démarre sur « 720p, 480p, 340p » doit ignorer le 340p.
  const lowFirst = hlsQuality.buildHlsQualityOptions(levels(340, 480, 720));
  assert.equal(pickedHeight(lowFirst, quality.selectLevelUnderPolicy(lowFirst, policy)), 720);
});

test('les VIP visent 1440p quand le flux le propose', () => {
  const options = hlsQuality.buildHlsQualityOptions(levels(1440, 1080, 720));
  const vip = quality.buildQualityPolicy(true);
  const standard = quality.buildQualityPolicy(false);

  assert.equal(pickedHeight(options, quality.selectLevelUnderPolicy(options, vip)), 1440);
  assert.equal(pickedHeight(options, quality.selectLevelUnderPolicy(options, standard)), 1080);
});

test('un choix explicite de l’utilisateur reste prioritaire, plancher compris', () => {
  const options = hlsQuality.buildHlsQualityOptions(levels(1080, 720, 480, 340));
  const explicit = quality.buildQualityPolicy(false, 480);
  assert.equal(pickedHeight(options, quality.selectLevelUnderPolicy(options, explicit)), 480);

  const explicitLow = quality.buildQualityPolicy(false, 340);
  assert.equal(pickedHeight(options, quality.selectLevelUnderPolicy(options, explicitLow)), 340);
});

test('une source intégralement pourrie reste jouable mais déclenche un avertissement français', () => {
  const policy = quality.buildQualityPolicy(false);
  const description = quality.describeQualitySelection(levels(340, 240), policy);

  assert.equal(description.bestHeight, 340);
  assert.equal(description.isLowQuality, true);
  assert.equal(description.effectiveHeight, 340);
  assert.match(description.notice, /340p/);
  assert.match(description.notice, /autre source/);

  const good = quality.describeQualitySelection(levels(1080, 720), policy);
  assert.equal(good.isLowQuality, false);
  assert.equal(good.notice, null);
  assert.equal(good.tierLabel, 'Full HD (1080p)');
});

test('le plancher de débit ABR bloque la descente sous 480p', () => {
  const options = hlsQuality.buildHlsQualityOptions(levels(1080, 720, 480, 340, 240));
  const floor = hlsQuality.computeMinAutoBitrate(options, quality.MINIMUM_ACCEPTABLE_HEIGHT);

  const lowestPlayable = Math.max(
    ...options.filter((option) => option.height >= quality.MINIMUM_ACCEPTABLE_HEIGHT)
      .map((option) => option.bitrate),
  );
  const highestForbidden = Math.max(
    ...options.filter((option) => option.height < quality.MINIMUM_ACCEPTABLE_HEIGHT)
      .map((option) => option.bitrate),
  );

  assert.ok(floor > highestForbidden, 'le plancher dépasse toutes les pistes interdites');
  assert.ok(floor <= lowestPlayable, 'le plancher reste sous la piste la plus légère autorisée');
});

test('le plancher de débit reste nul quand il n’y a rien à bloquer', () => {
  const onlyGood = hlsQuality.buildHlsQualityOptions(levels(1080, 720));
  assert.equal(hlsQuality.computeMinAutoBitrate(onlyGood, 480), 0);

  const allLow = hlsQuality.buildHlsQualityOptions(levels(360, 240));
  assert.equal(hlsQuality.computeMinAutoBitrate(allLow, 480), 0);
});

test('le classement des libellés préfère la meilleure qualité connue', () => {
  assert.ok(quality.rankQualityLabel('1080p') > quality.rankQualityLabel('720p'));
  assert.ok(quality.rankQualityLabel('720p') > quality.rankQualityLabel('360p'));
  assert.ok(quality.rankQualityLabel('360p') > quality.rankQualityLabel(null));
  assert.equal(quality.pickBestQualityLabel(['340p', '1080p', 'HD']), '1080p');
  assert.equal(quality.pickBestQualityLabel([]), null);
});
