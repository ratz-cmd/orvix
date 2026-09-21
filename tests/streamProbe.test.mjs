// Sonde de lecture directe.
//
// Elle répond à une seule question : « le navigateur du membre peut-il lire ce
// flux sans passer par le serveur ? ». Un faux « oui » donne une lecture qui ne
// démarre jamais ; un faux « non » fait payer inutilement de la bande passante
// au site. Les deux cas sont testés ici.
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

const probeModule = loadTsModule('src/utils/streamProbe.ts');
const { classifyStreamBytes, probeDirectStream, describeProbeFailure } = probeModule;

/** Réponse `fetch` simulée, avec un corps découpé en morceaux. */
const makeResponse = ({ status = 200, chunks = [], onCancel }) => {
  let index = 0;
  return {
    ok: status >= 200 && status < 300,
    status,
    url: 'https://cdn.exemple.tld/video/index.m3u8',
    body: {
      getReader: () => ({
        read: async () => {
          if (index >= chunks.length) return { done: true, value: undefined };
          const value = new TextEncoder().encode(chunks[index]);
          index += 1;
          return { done: false, value };
        },
        cancel: async () => { onCancel?.(); },
      }),
    },
    text: async () => chunks.join(''),
  };
};

const withFetch = async (implementation, run) => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return implementation(String(url), options);
  };
  try {
    return { result: await run(), calls };
  } finally {
    globalThis.fetch = original;
  }
};

test('la nature du flux est reconnue à partir des premiers octets', () => {
  assert.equal(classifyStreamBytes('#EXTM3U\n#EXT-X-VERSION:3\n'), 'hls');
  assert.equal(classifyStreamBytes('  \n #EXTM3U\n'), 'hls');
  assert.equal(classifyStreamBytes('\u0000\u0000\u0000\u0018ftypmp42'), 'file');
  assert.equal(classifyStreamBytes('RIFF....WEBPVP8 '), 'file');
  assert.equal(classifyStreamBytes('<!DOCTYPE html><html><body>Veuillez désactiver…'), null);
  assert.equal(classifyStreamBytes('<html lang="fr">'), null);
  assert.equal(classifyStreamBytes('{"error":"not allowed"}'), null);
  assert.equal(classifyStreamBytes(''), null);
});

test('un flux HLS lisible est détecté sans télécharger la vidéo', async () => {
  const { result, calls } = await withFetch(
    () => makeResponse({ status: 206, chunks: ['#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=5000000\n'] }),
    () => probeDirectStream('https://cdn.exemple.tld/video/index.m3u8'),
  );

  assert.equal(result.ok, true);
  assert.equal(result.kind, 'hls');
  // Une seule requête, avec `Range` : la sonde ne demande que quelques octets.
  assert.equal(calls.length, 1);
  assert.match(calls[0].options.headers.Range, /^bytes=0-\d+$/);
  assert.equal(calls[0].options.credentials, 'omit');
  assert.equal(calls[0].options.mode, 'cors');
});

test('la lecture du corps est coupée dès les premiers kilo-octets', async () => {
  let cancelled = false;
  const chunks = Array.from({ length: 200 }, () => 'A'.repeat(4096));

  await withFetch(
    () => makeResponse({ chunks, onCancel: () => { cancelled = true; } }),
    () => probeDirectStream('https://cdn.exemple.tld/gros-fichier.mp4', { rangeBytes: 4096 }),
  );

  assert.equal(cancelled, true, 'le transfert doit être annulé après l’entête');
});

test('une page HTML à la place du flux ne passe pas pour un média', async () => {
  const { result } = await withFetch(
    () => makeResponse({ chunks: ['<!DOCTYPE html><html>Accès refusé</html>'] }),
    () => probeDirectStream('https://cdn.exemple.tld/video/index.m3u8'),
  );

  assert.equal(result.ok, false);
  assert.match(result.reason, /page au lieu du flux/);
  assert.match(describeProbeFailure(result), /page/);
});

test('un CDN qui refuse le CORS est signalé comme tel', async () => {
  const { result } = await withFetch(
    () => { throw new TypeError('Failed to fetch'); },
    () => probeDirectStream('https://cdn.exemple.tld/video/index.m3u8'),
  );

  assert.equal(result.ok, false);
  assert.match(result.reason, /CORS/);
});

test('un CDN trop lent est abandonné au lieu de bloquer la bascule', async () => {
  const { result } = await withFetch(
    // Le CDN ne répond jamais : seule l'annulation par `AbortController` peut
    // sortir la sonde de son attente.
    (_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }),
    () => probeDirectStream('https://cdn.exemple.tld/video/index.m3u8', { timeoutMs: 60 }),
  );

  assert.equal(result.ok, false);
  assert.match(result.reason, /lent/);
});

test('un refus HTTP du CDN est remonté avec son code', async () => {
  const { result } = await withFetch(
    () => makeResponse({ status: 403, chunks: ['Forbidden'] }),
    () => probeDirectStream('https://cdn.exemple.tld/video/index.m3u8'),
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.match(describeProbeFailure(result), /403/);
});

test('une URL absente ne déclenche aucune requête', async () => {
  const { result, calls } = await withFetch(
    () => makeResponse({}),
    () => probeDirectStream(''),
  );

  assert.equal(result.ok, false);
  assert.equal(calls.length, 0);
});
