// Contrat du relais de flux `/api/extract/stream`.
//
// C'est le maillon qui décide si un flux sans CORS peut malgré tout être lu
// dans le lecteur Orvix. Trois garanties sont verrouillées ici :
//   1. la playlist est réécrite pour que les *segments* passent aussi par le
//      relais (sinon hls.js lirait le manifeste puis échouerait au premier
//      segment — c'est exactement le symptôme « le lecteur bloque ») ;
//   2. l'endpoint n'est pas un proxy ouvert : jeton signé obligatoire dès que
//      la signature est configurée, et garde anti-SSRF dans tous les cas ;
//   3. un plafond de flux simultanés empêche une petite instance d'être
//      saturée.
import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const rootDir = resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);

const rewritePath = resolve(rootDir, 'API/Mainapi/utils/hlsManifestRewrite.js');
const limiterPath = resolve(rootDir, 'API/Mainapi/utils/relayLimiter.js');
const routePath = resolve(rootDir, 'API/Mainapi/routes/nativeExtract.js');

const { rewriteHlsPlaylist, isHlsPlaylist, isMasterPlaylist } = require(rewritePath);

const proxy = (absoluteUrl) => `/api/extract/stream?t=${encodeURIComponent(absoluteUrl)}`;

test('les URI de segments sont réécrites vers le relais', () => {
  const base = 'https://cdn.embedseek.com/v4/video/ug3i/master.m3u8';
  const manifest = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-TARGETDURATION:6',
    '#EXTINF:6.0,',
    'seg-1.ts',
    '#EXTINF:6.0,',
    'https://cdn.embedseek.com/v4/video/ug3i/seg-2.ts?token=abc',
    '',
  ].join('\n');

  const rewritten = rewriteHlsPlaylist(manifest, base, proxy);
  const lines = rewritten.split('\n').filter((line) => line && !line.startsWith('#'));

  assert.equal(lines[0], proxy('https://cdn.embedseek.com/v4/video/ug3i/seg-1.ts'));
  assert.equal(lines[1], proxy('https://cdn.embedseek.com/v4/video/ug3i/seg-2.ts?token=abc'));
  // Les balises non concernées sont intactes.
  assert.match(rewritten, /#EXT-X-TARGETDURATION:6/);
});

test('un master voit ses playlists enfants relayées à leur tour', () => {
  const base = 'https://cdn.embedseek.com/v4/video/ug3i/master.m3u8';
  const master = [
    '#EXTM3U',
    '#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080',
    '1080p/index.m3u8',
    '#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720',
    '../720p/index.m3u8',
  ].join('\n');

  assert.equal(isHlsPlaylist(master), true);
  assert.equal(isMasterPlaylist(master), true);

  const rewritten = rewriteHlsPlaylist(master, base, proxy);
  assert.match(rewritten, new RegExp(encodeURIComponent('https://cdn.embedseek.com/v4/video/ug3i/1080p/index.m3u8')));
  // Les chemins relatifs sont résolus par rapport à la playlist d'origine.
  assert.match(rewritten, new RegExp(encodeURIComponent('https://cdn.embedseek.com/v4/video/720p/index.m3u8')));
});

test('les clés de chiffrement et maps sont relayées aussi', () => {
  const base = 'https://cdn.embedseek.com/v4/video/ug3i/index.m3u8';
  const manifest = [
    '#EXTM3U',
    '#EXT-X-KEY:METHOD=AES-128,URI="key.bin",IV=0x1234',
    '#EXT-X-MAP:URI="https://cdn.embedseek.com/v4/video/ug3i/init.mp4"',
    '#EXTINF:6.0,',
    'seg-1.ts',
  ].join('\n');

  const rewritten = rewriteHlsPlaylist(manifest, base, proxy);
  assert.match(rewritten, new RegExp(`URI="${proxy('https://cdn.embedseek.com/v4/video/ug3i/key.bin').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  assert.match(rewritten, new RegExp(encodeURIComponent('https://cdn.embedseek.com/v4/video/ug3i/init.mp4')));
});

test('une playlist non-HLS est laissée intacte', () => {
  const binary = 'ftypmp42...octets binaires...';
  assert.equal(isHlsPlaylist(binary), false);
  assert.equal(rewriteHlsPlaylist(binary, 'https://cdn.tld/video.mp4', proxy), binary);
});

test('le plafond de flux simultanés refuse proprement au-delà de la limite', () => {
  const limiter = require(limiterPath);
  limiter.resetStreamSlots();

  const slots = [];
  // On réserve autant de places que la limite courante le permet.
  for (let index = 0; index < limiter.relayLimit(); index += 1) {
    const slot = limiter.acquireStreamSlot();
    assert.ok(slot, `place ${index + 1} accordée`);
    slots.push(slot);
  }

  assert.equal(limiter.activeStreams(), limiter.relayLimit());
  assert.equal(limiter.acquireStreamSlot(), null, 'refus au-delà du plafond');
  assert.equal(limiter.canAcceptStream(), false);

  // Une place libérée redonne accès au relais, et une libération double ne
  // décrémente qu'une fois (les réponses HTTP envoient close ET finish).
  const first = slots[0];
  first();
  first();
  assert.equal(limiter.activeStreams(), limiter.relayLimit() - 1);
  assert.ok(limiter.acquireStreamSlot());

  limiter.resetStreamSlots();
  assert.equal(limiter.activeStreams(), 0);
});

test('le relais exige un jeton signé dès que la signature est configurée', () => {
  const source = require('node:fs').readFileSync(routePath, 'utf8');

  assert.match(source, /encodeSignedToken\(/);
  assert.match(source, /decodeSignedToken\(RELAY_TOKEN_ROUTE, t\)/);
  assert.match(source, /if \(signingConfigured\(\)\) \{/);
  assert.match(source, /Jeton de relais requis/);
  // Garde anti-SSRF sur la cible, quel que soit le chemin d'entrée.
  assert.match(source, /isPublicHttpUrl\(targetUrl\)/);
  // Réécriture des playlists et plafond de charge.
  assert.match(source, /rewriteHlsPlaylist\(/);
  assert.match(source, /acquireStreamSlot\(\)/);
});
