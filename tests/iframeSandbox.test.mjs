// Contrat anti-pub des iframes tierces.
//
// Le lecteur natif (M3U8) n'exécute aucun code tiers : zéro pub par
// construction. Les lecteurs de catalogues non extractibles passent par des
// `<iframe>` cross-origin, dont le vecteur publicitaire le plus agressif
// est le popup / la redirection d'onglet au clic. L'attribut `sandbox` sans
// `allow-popups` (ni `allow-top-navigation`) bloque ce vecteur navigateur.
//
// Ces tests lisent la source (comme `hlsPlayerUpscaleWiring.test.mjs`)
// plutôt que de monter les pages : ils verrouillent le fait que TOUTE iframe
// de lecture reste sandboxée.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const WATCH_PAGES = ['src/pages/Watch/WatchMovie.tsx', 'src/pages/Watch/WatchTv.tsx'];

/** Extrait l'ouverture de chaque balise `<iframe>` (jusqu'au `>` fermant). */
const extractIframeTags = (source) => {
  const tags = [];
  const re = /<iframe\b/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    let i = match.index;
    let depth = 0;
    let quote = null;
    while (i < source.length) {
      const c = source[i];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'" || c === '`') {
        quote = c;
      } else if (c === '{') {
        depth += 1;
      } else if (c === '}') {
        depth -= 1;
      } else if (c === '>' && depth <= 0) {
        break;
      }
      i += 1;
    }
    tags.push(source.slice(match.index, i + 1));
  }
  return tags;
};

for (const page of WATCH_PAGES) {
  test(`${page} : toutes les iframes de lecture sont sandboxées anti-popup`, () => {
    const source = readFileSync(resolve(rootDir, page), 'utf8');
    const tags = extractIframeTags(source);
    assert.ok(tags.length > 0, `aucune iframe trouvée dans ${page}`);

    for (const tag of tags) {
      const sandbox = tag.match(/sandbox="([^"]*)"/);
      assert.ok(sandbox, `iframe sans attribut sandbox dans ${page} : ${tag.slice(0, 120)}…`);
      const tokens = sandbox[1].split(/\s+/);
      // Le lecteur tiers a besoin de scripts (et de son origine pour ses
      // cookies/stockage) — mais jamais des popups ni de la navigation top.
      assert.ok(tokens.includes('allow-scripts'), `allow-scripts manquant dans ${page}`);
      assert.ok(tokens.includes('allow-same-origin'), `allow-same-origin manquant dans ${page}`);
      assert.ok(!tokens.includes('allow-popups'), `allow-popups ne doit JAMAIS être présent (${page})`);
      assert.ok(!tokens.includes('allow-popups-to-escape-sandbox'), `allow-popups-to-escape-sandbox interdit (${page})`);
      assert.ok(!tokens.includes('allow-top-navigation'), `allow-top-navigation interdit (${page})`);
      assert.ok(!tokens.includes('allow-modals'), `allow-modals interdit (${page})`);
    }
  });
}

test('aucune URL de lecteur non-VF ne subsiste dans les pages de visionnage', () => {
  // v10 (anglophone) + v11 (sous-titré) : les seuls `player.videasy.net`
  // restants doivent être les branches mortes `case 'vostfr'`/`case 'videasy'`
  // d'`applyEmbedConfig` (inaccessibles depuis le modèle). On verrouille ici
  // l'essentiel : plus aucun CHARGEMENT automatique (setEmbedUrl avec une URL
  // de lecteur anglophone ou sous-titré) hors des branches `case`.
  for (const page of WATCH_PAGES) {
    const source = readFileSync(resolve(rootDir, page), 'utf8');
    const autoLoads = source.match(/setEmbedUrl\(`https:\/\/player\.videasy\.net/g) ?? [];
    assert.equal(
      autoLoads.length,
      0,
      `${page} charge encore automatiquement un lecteur Videasy (${autoLoads.length} occurrence(s))`,
    );
  }
});
