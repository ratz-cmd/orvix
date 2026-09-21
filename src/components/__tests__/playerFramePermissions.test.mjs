// Permissions des cadres de lecture (web + app mobile).
//
// Le symptôme à ne jamais réintroduire : « le lecteur se charge mais la
// diffusion reste bloquée ». Il arrive quand on enferme le lecteur tiers dans
// un bac à sable (`sandbox="allow-scripts allow-same-origin"`) ou qu'on oublie
// les autorisations `autoplay` / `encrypted-media` / `fullscreen`. Sans
// `allow-popups`, les lecteurs qui ouvrent une fenêtre pour démarrer ou pour
// l'étape anti-bot restent muets ; sans `encrypted-media`, les flux DRM ne
// démarrent pas.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const rootDir = resolve(import.meta.dirname, '../../..');
const srcDir = resolve(rootDir, 'src');

const walk = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      files.push(...await walk(full));
    } else if (/\.tsx$/.test(entry.name)) {
      // Seuls les fichiers JSX portent des iframes réelles : un `.ts` qui
      // contient « <iframe » est un filtre anti-injection, pas un cadre.
      files.push(full);
    }
  }
  return files;
};

test('aucun cadre de lecture du site n’est mis en bac à sable', async () => {
  const files = await walk(srcDir);
  const offenders = [];

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    // On cherche l'attribut JSX/HTML `sandbox=` d'une iframe, pas le mot
    // « sandbox » d'un commentaire ou d'un identifiant de test.
    if (/\bsandbox\s*=\s*["'{]/.test(source) || /\bsandbox=\{/.test(source)) {
      offenders.push(file.replace(`${rootDir}/`, ''));
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `Attribut sandbox détecté (il coupe la diffusion) : ${offenders.join(', ')}`,
  );
});

/**
 * Cadres volontairement hors règle, avec leur raison. Toute nouvelle entrée
 * ici doit être justifiée en commentaire — c'est ce qui évite qu'un lecteur
 * finisse sans `autoplay` par simple oubli.
 */
const IFRAME_EXCEPTIONS = new Map([
  [
    'src/pages/WrappedPage.tsx',
    "bande-annonce YouTube décorative en fond de diapositive (pointer-events: none, fs=0) : elle n'a pas à passer en plein écran",
  ],
]);

test('chaque iframe de lecteur déclare les autorisations nécessaires', async () => {
  const files = await walk(srcDir);
  const missing = [];

  for (const file of files) {
    const relative = file.replace(`${rootDir}/`, '');
    const source = await readFile(file, 'utf8');
    if (!/<iframe\b/.test(source)) continue;
    if (IFRAME_EXCEPTIONS.has(relative)) continue;

    // Toutes les iframes du site sont des lecteurs tiers, une bande-annonce
    // YouTube ou la page admin : elles doivent pouvoir démarrer seules et
    // passer en plein écran.
    if (!/allowFullScreen/.test(source)) {
      missing.push(`${relative} : allowFullScreen absent`);
    }

    const allowAttributes = source.match(/allow="([^"]*)"/g) ?? [];
    const declaresAutoplay = allowAttributes.some((value) => value.includes('autoplay'));
    const allFramesCovered = (source.match(/<iframe\b/g) ?? []).length <= allowAttributes.length;
    if (!declaresAutoplay || !allFramesCovered) {
      missing.push(`${relative} : attribut allow incomplet (${allowAttributes.length} pour ${(source.match(/<iframe\b/g) ?? []).length} iframe(s))`);
    }
  }

  assert.deepEqual(missing, [], missing.join(' | '));
});

test('le lecteur Orvix natif ne restreint pas le média', async () => {
  const player = await readFile(resolve(srcDir, 'components/HLSPlayer.tsx'), 'utf8');

  // Le canvas de Super Résolution superposé ne doit pas intercepter les clics.
  assert.match(player, /data-testid="orvix-upscale-canvas"[\s\S]{0,300}pointer-events-none/);
  // La vidéo reste montée (audio, sous-titres, cast) même quand l'upscaler
  // prend l'affichage : on ne remplace pas la source par un canvas muet.
  assert.match(player, /video\.style\.visibility = 'hidden'/);
});

test('la WebView mobile reste configurée pour la lecture', async () => {
  const webview = await readFile(resolve(rootDir, 'app/src/components/WebViewBrowser.tsx'), 'utf8');

  assert.match(webview, /mediaPlaybackRequiresUserAction=\{false\}/);
  assert.match(webview, /allowsInlineMediaPlayback=\{true\}/);
  assert.match(webview, /domStorageEnabled=\{true\}/);
  assert.match(webview, /thirdPartyCookiesEnabled=\{true\}/);
  assert.match(webview, /mixedContentMode="always"/);
  assert.match(webview, /setSupportMultipleWindows=\{true\}/);
});
