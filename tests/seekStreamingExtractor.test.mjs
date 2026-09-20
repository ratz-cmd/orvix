// Extraction SeekStreaming, exécutée pour de vrai.
//
// `extension/Chrome/extractors.js` est le seul extracteur utilisé à la fois par
// l'extension navigateur ET par le backend Node (`API/Mainapi/routes/
// nativeExtract.js` le charge dans un contexte `vm`). Un membre sans extension
// passe donc par : page Watch → POST /api/extract → `extractSingle('seekstreaming')`.
//
// Ce test charge le vrai fichier dans un bac à sable et rejoue la réponse AES-CBC
// de l'API SeekStream (`/api/v1/video?id=…`) pour vérifier que le flux .m3u8
// ressort bien, sans publicité, et que la meilleure qualité est demandée.
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';

const rootDir = resolve(import.meta.dirname, '..');
const extractorsSource = readFileSync(
  resolve(rootDir, 'extension/Chrome/extractors.js'),
  'utf8',
);

const AES_KEY = 'kiemtienmua911ca';
const AES_IV = '1234567890oiuytr';
const EMBED_URL = 'https://orvix1.embedseek.com/#ug3i';

const encryptPayload = async (value) => {
  const key = await webcrypto.subtle.importKey(
    'raw', new TextEncoder().encode(AES_KEY), { name: 'AES-CBC' }, false, ['encrypt'],
  );
  const encrypted = await webcrypto.subtle.encrypt(
    { name: 'AES-CBC', iv: new TextEncoder().encode(AES_IV) },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Buffer.from(encrypted).toString('hex');
};

/** Charge les extracteurs avec un `fetch` simulé, à la manière de nativeExtract. */
const loadExtractors = ({ respond }) => {
  const requests = [];
  const sandbox = {
    AbortController,
    ArrayBuffer,
    Blob,
    Buffer,
    CustomEvent,
    DOMException,
    Event,
    EventTarget,
    FormData,
    Headers,
    Map,
    Request,
    Response,
    Set,
    TextDecoder,
    TextEncoder,
    URL,
    URLSearchParams,
    Uint8Array,
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    clearInterval: () => {},
    clearTimeout: () => {},
    console: { error() {}, log() {}, warn() {} },
    crypto: webcrypto,
    fetch: async (url, options = {}) => {
      requests.push({ url: String(url), headers: options.headers ?? {} });
      return respond(String(url), options, requests.length);
    },
    setInterval: () => 1,
    setTimeout: () => 1,
    // `nativeExtract.js` expose cet objet : l'extracteur ne doit pas en dépendre.
    chrome: { runtime: { id: 'orvix-test' } },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(extractorsSource, context, { filename: 'extension/Chrome/extractors.js' });
  return { extractors: sandbox.OrvixExtractors, requests };
};

const okResponse = (body) => ({
  ok: true,
  status: 200,
  text: async () => body,
  json: async () => JSON.parse(body),
});

test('SeekStreaming : l’URL d’embed est reconnue par le backend', () => {
  const { extractors } = loadExtractors({ respond: async () => okResponse('') });
  assert.equal(extractors.detectEmbedType(EMBED_URL), 'seekstreaming');
  assert.equal(extractors.detectEmbedType('https://exemple.tld/video/123'), null);
});

test('SeekStreaming : le m3u8 est extrait et les meilleures sources sont ordonnées', async () => {
  const cfNative = 'https://cf-native.embedseek.com/v4/video/ug3i/playlist.m3u8';
  const source = 'https://cdn.embedseek.com/v4/video/ug3i/master.m3u8';
  const encrypted = await encryptPayload({
    cfNative,
    source,
    master: 'https://cdn.embedseek.com/v4/video/ug3i/fallback.m3u8',
  });

  const { extractors, requests } = loadExtractors({
    respond: async () => okResponse(encrypted),
  });

  const result = await extractors.extractSingle('seekstreaming', EMBED_URL);

  assert.equal(result.success, true, JSON.stringify(result));
  assert.equal(result.hlsUrl, cfNative);
  assert.deepEqual(
    JSON.parse(JSON.stringify(result.hlsCandidates)),
    [
      { kind: 'cfNative', url: cfNative },
      { kind: 'source', url: source },
    ],
  );
  assert.equal(result.origin, 'https://orvix1.embedseek.com');
  assert.equal(result.referer, 'https://orvix1.embedseek.com/');

  // Le CDN SeekStream refuse une requête sans Origin/Referer de l'embed :
  // l'extension pose une règle DNR, le backend relaie les mêmes en-têtes.
  const serviceHeaders = await extractors.setupHeadersForService('seekstreaming', cfNative, EMBED_URL);
  assert.deepEqual(JSON.parse(JSON.stringify(serviceHeaders.headers)), {
    Origin: 'https://orvix1.embedseek.com',
    Referer: 'https://orvix1.embedseek.com/',
  });

  // Une seule requête, vers l'API vidéo, en demandant la Full HD.
  assert.equal(requests.length, 1);
  const apiUrl = new URL(requests[0].url);
  assert.equal(apiUrl.pathname, '/api/v1/video');
  assert.equal(apiUrl.searchParams.get('id'), 'ug3i');
  assert.equal(apiUrl.searchParams.get('w'), '1920');
  assert.equal(apiUrl.searchParams.get('h'), '1080');
});

test('SeekStreaming : un embed non reconnu ne déclenche aucune requête réseau', async () => {
  const { extractors, requests } = loadExtractors({
    respond: async () => okResponse(''),
  });

  const result = await extractors.extractSingle('seekstreaming', 'https://exemple.tld/x');

  assert.equal(result.success, false);
  assert.equal(requests.length, 0);
});

test('SeekStreaming : une erreur amont remonte sans casser la lecture', async () => {
  const { extractors } = loadExtractors({
    respond: async () => ({ ok: false, status: 502, text: async () => '', json: async () => ({}) }),
  });

  const result = await extractors.extractSingle('seekstreaming', EMBED_URL);

  assert.equal(result.success, false);
  assert.match(result.error, /502/);
});

test('SeekStreaming : une charge utile illisible est refusée proprement', async () => {
  const { extractors } = loadExtractors({
    respond: async () => okResponse('pas-du-hex-chiffré'),
  });

  const result = await extractors.extractSingle('seekstreaming', EMBED_URL);

  assert.equal(result.success, false);
  assert.ok(typeof result.error === 'string' && result.error.length > 0);
});
