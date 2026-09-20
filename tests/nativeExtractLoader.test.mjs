// Le backend sait-il encore charger le moteur d'extraction ?
//
// `API/Mainapi/routes/nativeExtract.js` va chercher `extension/Chrome/
// extractors.js`, qui vit dans le dépôt web et non sous `API/`. Un déploiement
// partiel (backend seul) rendait l'extraction muette, sans message clair : ces
// tests vérifient que le module trouve bien le fichier depuis le dépôt,
// qu'il expose les entrées attendues, et que l'absence du dossier produit un
// message actionnable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Module from 'node:module';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const routePath = resolve(rootDir, 'API/Mainapi/routes/nativeExtract.js');
const locatorPath = resolve(rootDir, 'API/Mainapi/utils/extractorsLocator.js');

/** Charge nativeExtract avec des stubs pour ses dépendances lourdes. */
const loadRoute = () => {
  const originalLoad = Module._load;
  // `express.Router()` renvoie une fonction middleware : on imite cette forme.
  const router = () => {};
  router.post = () => {};
  router.get = () => {};
  router.use = () => {};

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'express') return { Router: () => router };
    if (request === 'undici') {
      return { Agent: class {}, setGlobalDispatcher: () => {}, buildConnector: (options) => options };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[routePath];
    delete require.cache[locatorPath];
    return require(routePath);
  } finally {
    Module._load = originalLoad;
  }
};

test('nativeExtract expose les entrées attendues', () => {
  const route = loadRoute();
  assert.equal(typeof route, 'function', 'le routeur Express est exporté');
  assert.equal(typeof route.loadExtractors, 'function');
  assert.equal(typeof route.extractNativeEmbed, 'function');
});

test('le moteur d’extraction est trouvé depuis le dépôt', () => {
  const route = loadRoute();
  const extractors = route.loadExtractors();

  assert.ok(extractors, 'moteur chargé');
  assert.equal(typeof extractors.extractSingle, 'function');
  assert.equal(typeof extractors.detectEmbedType, 'function');
  assert.equal(extractors.detectEmbedType('https://orvix1.embedseek.com/#ug3i'), 'seekstreaming');
  assert.ok(extractors.EXTRACT_FN.seekstreaming, 'extracteur SeekStreaming présent');
});

test('un déploiement sans dossier extension donne un message actionnable', () => {
  const locator = require(locatorPath);

  assert.throws(
    () => locator.resolveExtractorsPath(['/inexistant/extractors.js', '/autre/chemin.js']),
    (error) => {
      assert.match(error.message, /extractors\.js introuvable/);
      assert.match(error.message, /ORVIX_EXTRACTORS_PATH/);
      assert.match(error.message, /Chemins essayés/);
      return true;
    },
  );

  // Le localisateur du dépôt, lui, trouve bien le fichier.
  assert.match(locator.resolveExtractorsPath(), /extension\/Chrome\/extractors\.js$/);
  assert.equal(locator.firstExistingFile(['/inexistant.js']), null);
});

test('les emplacements essayés couvrent le dépôt, le cwd et l’environnement', () => {
  const route = readFileSync(routePath, 'utf8');
  const locator = readFileSync(locatorPath, 'utf8');

  assert.match(route, /require\('\.\.\/utils\/extractorsLocator'\)/);
  assert.match(locator, /ORVIX_EXTRACTORS_PATH/);
  assert.match(locator, /process\.cwd\(\)/);
  assert.match(locator, /'\.\.\/\.\.\/\.\.\/extension\/Chrome\/extractors\.js'/);
});
