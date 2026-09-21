// Contrat de câblage « lecteurs tiers → lecteur Orvix sans publicité ».
//
// La demande produit : quand un membre choisit un lecteur tiers (SeekStreaming
// et consorts), Orvix doit récupérer le .m3u8/.mp4 sous-jacent et le relire
// dans son propre lecteur — sans publicité, en français, avec l'upscaling 2K
// pour les VIP.
//
// Ce test vérifie que chaque maillon de la chaîne reste branché :
//   page Watch → hook d'auto-extraction → service d'extraction → extracteur
//   SeekStream (activé par défaut) → backend /api/extract.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (relativePath) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('les pages Watch branchent l’auto-extraction vers le lecteur natif', async () => {
  const [movie, tv] = await Promise.all([
    read('src/pages/Watch/WatchMovie.tsx'),
    read('src/pages/Watch/WatchTv.tsx'),
  ]);

  for (const [name, source] of [['WatchMovie', movie], ['WatchTv', tv]]) {
    assert.match(source, /import \{ useAdFreeAutoExtraction \} from '\.\.\/\.\.\/hooks\/useAdFreeAutoExtraction';/, name);
    assert.match(source, /useAdFreeAutoExtraction\(\{/, name);
    assert.match(source, /onExtracted: handleAutoExtractedPlayback/, name);

    // La bascule effective : flux direct dans le lecteur Orvix, iframe retirée.
    const handler = source.slice(
      source.indexOf('const handleAutoExtractedPlayback'),
      source.indexOf('useAdFreeAutoExtraction({'),
    );
    assert.match(handler, /setVideoSource\(playback\.url\)/, name);
    assert.match(handler, /setEmbedUrl\(null\)/, name);
    assert.match(handler, /setEmbedType\(null\)/, name);
    assert.match(handler, /setSelectedSource\('nexus_hls'\)/, name);
    assert.match(handler, /setNexusHlsSources\(prev =>/, name);
  }
});

test('le hook d’auto-extraction garde ses garanties anti-boucle', async () => {
  const hook = await read('src/hooks/useAdFreeAutoExtraction.ts');

  assert.match(hook, /isAdFreeAutoPlaybackEnabled\(\)/);
  assert.match(hook, /attemptedRef\.current\.has\(key\)/);
  assert.match(hook, /cacheRef\.current\.set\(key, result\)/);
  assert.match(hook, /tryOnTheFlyExtraction\(embedUrl, timeoutMs\)/);
  assert.match(hook, /Publicités supprimées/);
  assert.match(hook, /Revenir au lecteur tiers/);
});

test('l’extracteur SeekStreaming n’est plus neutralisé', async () => {
  const [extract, onTheFly] = await Promise.all([
    read('src/utils/extractM3u8.ts'),
    read('src/utils/onTheFlyExtract.ts'),
  ]);

  assert.doesNotMatch(extract, /isSeekStreamingExtractionEnabled = \(\) => false/);
  assert.match(extract, /isSeekStreamingExtractionEnabled = \(\) => isM3u8ExtractorEnabled\('seekstreaming'\)/);
  assert.match(onTheFly, /'seekstreaming',/);
  assert.match(onTheFly, /isSeekStreamingEmbed\(url\) \|\| isSeekStreamingEmbedUrl\(url\)/);
});

test('le backend accepte SeekStreaming sur /api/extract', async () => {
  const [backend, locator] = await Promise.all([
    read('API/Mainapi/routes/nativeExtract.js'),
    read('API/Mainapi/utils/extractorsLocator.js'),
  ]);

  assert.match(backend, /seekstreaming/);
  assert.match(backend, /router\.post\('\/'/);
  assert.match(backend, /ext\.extractSingle\(embedType, url\)/);
  // Le moteur d'extraction vit dans le dépôt web : le localisateur le trouve
  // même quand le backend est déployé à côté du front.
  assert.match(backend, /require\('\.\.\/utils\/extractorsLocator'\)/);
  assert.match(locator, /extension\/Chrome\/extractors\.js/);
});

test('l’extracteur SeekStreaming sait déchiffrer la charge utile de l’API', async () => {
  const source = await read('extension/Chrome/extractors.js');

  assert.match(source, /SEEKSTREAMING_AES_KEY_RAW/);
  assert.match(source, /new URL\('\/api\/v1\/video', parsed\.origin\)/);
  assert.match(source, /w: '1920'/);
  assert.match(source, /h: '1080'/);
  assert.match(source, /seekstreaming: extractSeekStreaming/);
});

test('la bascule distingue lecture directe et relais serveur', async () => {
  const [onTheFly, hook, prefs] = await Promise.all([
    read('src/utils/onTheFlyExtract.ts'),
    read('src/hooks/useAdFreeAutoExtraction.ts'),
    read('src/utils/adFreePlaybackPref.ts'),
  ]);

  // La sonde décide : direct d'abord (aucune bande passante serveur), relais
  // ensuite, et l'échec ne casse rien.
  assert.match(onTheFly, /probeDirectStream\(extraction\.m3u8Url/);
  assert.match(onTheFly, /viaRelay: false,/);
  assert.match(onTheFly, /viaRelay: true,/);
  assert.match(onTheFly, /preferDirect: true/);

  // Le relais reste sous contrôle du membre.
  assert.match(prefs, /isStreamRelayEnabled/);
  assert.match(prefs, /setStreamRelayEnabled/);
  assert.match(hook, /isStreamRelayEnabled\(\)/);
  assert.match(hook, /Autoriser le relais/);
  assert.match(hook, /Couper le relais/);
});
