// Extraction à la volée des lecteurs tiers (« sans pub »).
//
// Le service décide, pour une URL d'embed donnée, si Orvix sait récupérer le
// flux direct et donc court-circuiter l'iframe publicitaire. Ces tests
// verrouillent la liste des hébergeurs pris en charge (SeekStreaming inclus),
// la validation des URLs de flux, et le fait qu'un refus ne déclenche aucune
// requête réseau.
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
    // `src/config/runtime.ts` lit `import.meta.env` : hors bundler Vite, on
    // remplace les imports runtime par leurs valeurs de test.
    const source = readFileSync(absolutePath, 'utf8')
      .replace(
        /import\s*\{\s*MAIN_API\s*\}\s*from\s*['"][^'"]*config\/runtime['"];/,
        "const MAIN_API = 'https://api.orvix.test';",
      )
      .replace(/import\.meta\.env/g, '({})');
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

const onTheFly = loadTsModule('src/utils/onTheFlyExtract.ts');
const adFreePref = loadTsModule('src/utils/adFreePlaybackPref.ts');

test('SeekStreaming est reconnu comme hébergeur extractible', () => {
  assert.equal(onTheFly.resolveExtractableHoster('https://orvix1.embedseek.com/#ug3i'), 'seekstreaming');
  assert.equal(onTheFly.resolveExtractableHoster('https://seekstreaming.com/embed-abc'), 'seekstreaming');
  assert.equal(onTheFly.resolveExtractableHoster('https://exemple.tld/embed/abc'), null);
  assert.equal(onTheFly.resolveExtractableHoster(''), null);
});

test('les hébergeurs classiques restent extractibles', () => {
  for (const [url, hoster] of [
    ['https://voe.sx/e/abc123', 'voe'],
    ['https://uqload.com/embed-abc.html', 'uqload'],
    ['https://video.sibnet.ru/shell.php?videoid=1', 'sibnet'],
  ]) {
    assert.equal(onTheFly.resolveExtractableHoster(url), hoster, url);
    assert.equal(onTheFly.isExtractableUrl(url), true, url);
  }
});

test('seules les URLs média saines sont acceptées', () => {
  assert.equal(onTheFly.isValidMediaUrl('https://cdn.tld/master.m3u8'), true);
  assert.equal(onTheFly.isValidMediaUrl('http://cdn.tld/video.mp4'), true);
  assert.equal(onTheFly.isValidMediaUrl('javascript:alert(1)'), false);
  assert.equal(onTheFly.isValidMediaUrl('https://cdn.tld/<script>alert(1)</script>'), false);
  assert.equal(onTheFly.isValidMediaUrl('data:text/html;base64,PHNjcmlwdD4='), false);
  assert.equal(onTheFly.isValidMediaUrl(''), false);
  assert.equal(onTheFly.isValidMediaUrl(null), false);
});

test('les pistes extraites sont nommées en français et déduplicables', () => {
  const first = onTheFly.describeCandidateLabel('seekstreaming', 0);
  const second = onTheFly.describeCandidateLabel('seekstreaming', 1);
  assert.match(first, /SEEKSTREAMING/);
  assert.notEqual(first, second);
});

test('une URL non extractible rend la main sans appel réseau', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error('réseau interdit'); };
  try {
    const result = await onTheFly.tryOnTheFlyExtraction('https://exemple.tld/embed/abc', 50);
    assert.equal(result.success, false);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('la lecture sans pub est active par défaut et désactivable', () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => { store.set(key, String(value)); },
    removeItem: (key) => { store.delete(key); },
    clear: () => store.clear(),
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size; },
  };
  globalThis.window = { dispatchEvent: () => {}, addEventListener: () => {}, removeEventListener: () => {} };

  try {
    assert.equal(adFreePref.isAdFreeAutoPlaybackEnabled(), true);
    adFreePref.setAdFreeAutoPlaybackEnabled(false);
    assert.equal(adFreePref.isAdFreeAutoPlaybackEnabled(), false);
    adFreePref.setAdFreeAutoPlaybackEnabled(true);
    assert.equal(adFreePref.isAdFreeAutoPlaybackEnabled(), true);
  } finally {
    delete globalThis.localStorage;
    delete globalThis.window;
  }
});
