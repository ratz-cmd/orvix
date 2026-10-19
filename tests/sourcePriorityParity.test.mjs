// Parité Movix du modèle de lecteurs + cascade de repli.
//
// Ce fichier verrouille trois choses qui ont dérivé par le passé et qui ne
// doivent plus bouger sans décision explicite :
//
//   1. **Parité Movix** — `BUILTIN_HOSTER_IDS` est égal, élément par élément, à
//      la liste du bundle de production Movix ; `DEFAULT_MOVIES_TV_ORDER`
//      contient l'épine Movix comme sous-séquence (même ordre relatif).
//   2. **Détection d'hébergeur** — l'ordre des hosters fixe AUSSI l'ordre de
//      test dans `detectHoster`. Réordonner peut donc changer le hoster
//      détecté pour une URL donnée : chaque domaine connu doit rester
//      rattaché au bon hébergeur, et `veev` doit continuer de gagner sur
//      `doodstream` pour `doods.to`.
//   3. **Cascade VF → VOSTFR → anglophone** — aucune source VF ne doit pouvoir
//      être doublée par un lecteur anglophone, et un lecteur anglophone ne doit
//      jamais passer devant le palier sous-titré français.
//
// Les migrations sont testées sur des prefs persistées réelles (v1 et v8) :
// un client existant ne doit ni perdre sa configuration, ni se voir réimposer
// un ordre qu'il a personnalisé.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Charge un module TS (et ses imports relatifs) en le transpilant à la volée. */
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

const STORAGE_KEY = 'settings_source_priority_prefs';

// --- Environnement navigateur minimal -------------------------------------
// `hosterRegistry` enregistre un écouteur au chargement du module et
// `sourcePriorityPrefs` lit `window.localStorage` : les globaux doivent exister
// AVANT le premier `loadTsModule`.
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => { store.set(key, String(value)); },
  removeItem: (key) => { store.delete(key); },
  clear: () => store.clear(),
  key: (index) => Array.from(store.keys())[index] ?? null,
  get length() { return store.size; },
};
globalThis.window = {
  localStorage: globalThis.localStorage,
  dispatchEvent: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  CustomEvent: class CustomEvent {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
  },
};

const types = loadTsModule('src/types/sourcePriority.ts');
const prefs = loadTsModule('src/utils/sourcePriorityPrefs.ts');
const registry = loadTsModule('src/utils/hosterRegistry.ts');
const autoSelect = loadTsModule('src/utils/sourceAutoSelect.ts');

const {
  TOP_LEVEL_SOURCE_IDS,
  BUILTIN_HOSTER_IDS,
  DEPRECATED_SOURCE_IDS,
} = types;
const {
  DEFAULT_MOVIES_TV_ORDER,
  MOVIX_REFERENCE_MOVIES_TV_ORDER,
  MOVIX_REFERENCE_BUILTIN_HOSTER_IDS,
  buildDefaults,
  getSourcePriorityPrefs,
  setSourcePriorityPrefs,
} = prefs;
const { detectHoster } = registry;
const { pickAutoSelectedSource } = autoSelect;

// --- Listes de référence Movix (bundle de production) ----------------------
// Recopiées ici indépendamment des constantes du dépôt : si quelqu'un modifie
// `MOVIX_REFERENCE_*` en même temps que l'ordre par défaut, le test continue de
// comparer à la source de vérité d'origine.
const MOVIX_HOSTERS = [
  'voe', 'vidmoly', 'vidzy', 'uqload', 'sibnet', 'veev', 'doodstream',
  'lulustream', 'vidara', 'seekstreaming', 'smoothpre', 'minochinos',
  'darkibox', 'supervideo', 'dropload', 'oneupload', 'fsvid',
];
const MOVIX_SOURCES = [
  'nexus_hls', 'swiftflux', 'bravo', 'mp4', 'darkino', 'fstream', 'omega',
  'wiflix', 'j1f', 'swiftflow', 'viper', 'coflix', 'custom', 'frembed',
  'vox', 'kisskh', 'vostfr',
];

/** Sous-séquence ordonnée : `sub` apparaît dans `full` dans le même ordre relatif. */
const isOrderedSubsequence = (sub, full) => {
  let i = 0;
  for (const item of full) {
    if (i < sub.length && item === sub[i]) i += 1;
  }
  return i === sub.length;
};

// ===========================================================================
// 1. Parité Movix
// ===========================================================================

test('BUILTIN_HOSTER_IDS est exactement la liste Movix (même ordre)', () => {
  assert.deepEqual([...BUILTIN_HOSTER_IDS], MOVIX_HOSTERS);
  // La référence exportée doit rester alignée elle aussi.
  assert.deepEqual([...MOVIX_REFERENCE_BUILTIN_HOSTER_IDS], MOVIX_HOSTERS);
});

test('la référence Movix exportée pour les sources est exacte', () => {
  assert.deepEqual([...MOVIX_REFERENCE_MOVIES_TV_ORDER], MOVIX_SOURCES);
});

test("DEFAULT_MOVIES_TV_ORDER contient l'épine Movix comme sous-séquence", () => {
  // Seul écart autorisé et documenté : `frembed`, déprécié côté Orvix (aucun
  // chemin de rendu). Tout le reste de l'épine doit être présent, dans l'ordre.
  const spine = MOVIX_SOURCES.filter((id) => id !== 'frembed');
  assert.ok(
    isOrderedSubsequence(spine, [...DEFAULT_MOVIES_TV_ORDER]),
    `épine Movix non respectée.\n  attendu (sous-séquence): ${spine.join(' > ')}\n  obtenu: ${DEFAULT_MOVIES_TV_ORDER.join(' > ')}`,
  );
});

test('frembed est le seul écart assumé avec Movix', () => {
  const order = [...DEFAULT_MOVIES_TV_ORDER];
  assert.ok(!order.includes('frembed'), 'frembed est déprécié et ne doit pas réapparaître');
  // Les ids Orvix absents de Movix doivent être explicitement connus.
  const orvixOnly = order.filter((id) => !MOVIX_SOURCES.includes(id));
  assert.deepEqual(
    [...orvixOnly].sort(),
    ['111movies', 'autoembed', 'embedsu', 'peachify', 'seekstreaming', 'superembed', 'videasy', 'vidsrccc'].sort(),
    'un id hors Movix est apparu sans être documenté',
  );
});

test("seekstreaming (VF) passe avant le palier VOSTFR et avant les anglophones", () => {
  const order = [...DEFAULT_MOVIES_TV_ORDER];
  const idxSeek = order.indexOf('seekstreaming');
  const idxVostfr = order.indexOf('vostfr');
  const idxVideasy = order.indexOf('videasy');
  assert.ok(idxSeek > -1 && idxVostfr > -1 && idxVideasy > -1);
  assert.ok(idxSeek < idxVostfr, 'seekstreaming doit précéder vostfr');
  assert.ok(idxVostfr < idxVideasy, 'le palier VOSTFR doit précéder les lecteurs anglophones');
});

test('les lecteurs anglophones ferment la liste par défaut', () => {
  const order = [...DEFAULT_MOVIES_TV_ORDER];
  const anglophones = ['videasy', 'peachify', 'autoembed', 'embedsu', 'superembed', 'vidsrccc', '111movies'];
  const tail = order.slice(order.length - anglophones.length);
  assert.deepEqual(tail.sort(), anglophones.sort(), 'les 7 derniers ids doivent être les lecteurs anglophones');
});

// ===========================================================================
// 2. Détection d'hébergeur
// ===========================================================================

const HOSTER_URLS = [
  ['https://voe.sx/e/abc123', 'voe'],
  ['https://voe-unblock.com/e/abc', 'voe'],
  ['https://vidmoly.to/embed-abc123.html', 'vidmoly'],
  ['https://ansembed.net/embed-abc.html', 'vidmoly'],
  ['https://vidzy.co/embed/abc', 'vidzy'],
  ['https://uqload.is/embed-abc.html', 'uqload'],
  ['https://uqload.cx/embed-abc.html', 'uqload'],
  ['https://sibnet.ru/shell.php?videoid=123', 'sibnet'],
  ['https://veev.to/e/abc', 'veev'],
  // Veev partage `doods.to` avec la nébuleuse DoodStream mais parle un autre
  // protocole : la précédence veev > doodstream est vitale ici.
  ['https://doods.to/e/abc', 'veev'],
  ['https://doodstream.com/e/abc', 'doodstream'],
  ['https://d0000d.com/e/abc', 'doodstream'],
  ['https://d000d.com/e/abc', 'doodstream'],
  ['https://lulustream.com/embed-abc.html', 'lulustream'],
  ['https://vidara.to/embed-abc', 'vidara'],
  // Domaines SeekStreaming cités dans le cahier des charges.
  ['https://seekstreaming.net/embed/abc', 'seekstreaming'],
  ['https://embedseek.com/#h6j8', 'seekstreaming'],
  ['https://orvix1.embedseek.com/#h6j8', 'seekstreaming'],
  ['https://technicalcatalog.com/abc', 'seekstreaming'],
  ['https://seeks.cloud/abc', 'seekstreaming'],
  ['https://servicecatalog.xyz/abc', 'seekstreaming'],
  ['https://smoothpre.com/embed-abc', 'smoothpre'],
  ['https://minochinos.pro/embed-abc', 'minochinos'],
  ['https://darkibox.com/embed-abc', 'darkibox'],
  ['https://supervideo.tv/embed-abc', 'supervideo'],
  ['https://dropload.io/embed-abc', 'dropload'],
  ['https://oneupload.to/embed-abc', 'oneupload'],
  ['https://fsvid.net/embed-abc', 'fsvid'],
];

test('chaque domaine connu est rattaché au bon hébergeur', () => {
  const failures = [];
  for (const [url, expected] of HOSTER_URLS) {
    const got = detectHoster(url, {});
    if (got !== expected) failures.push(`${url} → attendu ${expected}, obtenu ${got}`);
  }
  assert.deepEqual(failures, []);
});

test("l'ordre des hosters place veev avant doodstream", () => {
  const ids = [...BUILTIN_HOSTER_IDS];
  assert.ok(ids.indexOf('veev') < ids.indexOf('doodstream'));
});

test('une URL inconnue ne retourne aucun hébergeur', () => {
  assert.equal(detectHoster('https://exemple-inconnu.tld/e/abc', {}), null);
  assert.equal(detectHoster('', {}), null);
});

test('les 17 hosters Movix ont tous des motifs et un libellé', () => {
  for (const id of MOVIX_HOSTERS) {
    assert.ok(
      Array.isArray(registry.BUILTIN_HOSTER_PATTERNS[id]) && registry.BUILTIN_HOSTER_PATTERNS[id].length > 0,
      `${id} n'a aucun motif de détection`,
    );
    assert.ok(registry.HOSTER_LABELS[id], `${id} n'a aucun libellé UI`);
  }
});

// ===========================================================================
// 3. Valeurs par défaut
// ===========================================================================

test('buildDefaults couvre tous les ids top-level, sans id déprécié', () => {
  const def = buildDefaults();
  const ids = def.categories.moviesTv.sourceOrder.map((e) => e.id);
  for (const id of TOP_LEVEL_SOURCE_IDS) {
    assert.ok(ids.includes(id), `id manquant dans l'ordre par défaut : ${id}`);
  }
  for (const id of DEPRECATED_SOURCE_IDS) {
    assert.ok(!ids.includes(id), `id déprécié présent dans l'ordre par défaut : ${id}`);
  }
});

test("buildDefaults suit DEFAULT_MOVIES_TV_ORDER et active toutes les sources", () => {
  const def = buildDefaults();
  const entries = def.categories.moviesTv.sourceOrder;
  const head = entries.slice(0, DEFAULT_MOVIES_TV_ORDER.length).map((e) => e.id);
  assert.deepEqual(head, [...DEFAULT_MOVIES_TV_ORDER]);
  for (const entry of entries) {
    assert.equal(entry.enabled, true, `${entry.id} devrait être activé par défaut`);
  }
});

test('buildDefaults reprend BUILTIN_HOSTER_IDS pour les hosters Films/Séries', () => {
  const def = buildDefaults();
  assert.deepEqual(def.categories.moviesTv.hosterOrder, [...BUILTIN_HOSTER_IDS]);
});

// ===========================================================================
// 4. Migrations
// ===========================================================================

/** Prefs v8 « jamais personnalisées » : exactement les anciens défauts. */
const V8_DEFAULT_SOURCES = [
  'fstream', 'seekstreaming', 'wiflix', 'bravo', 'darkino', 'mp4', 'j1f',
  'swiftflow', 'viper', 'coflix', 'omega', 'nexus_hls', 'swiftflux', 'custom',
  'videasy', 'peachify', 'autoembed', 'embedsu', 'superembed', 'vidsrccc',
  '111movies', 'vox', 'kisskh', 'vostfr',
];
const V8_DEFAULT_HOSTERS = [
  'voe', 'fsvid', 'vidmoly', 'uqload', 'sibnet', 'veev', 'doodstream',
  'lulustream', 'vidara', 'seekstreaming', 'smoothpre', 'minochinos', 'vidzy',
  'darkibox', 'supervideo', 'dropload', 'oneupload',
];

const makeV8Prefs = ({ sourceOrder, hosterOrder, enabledOverrides = {} }) => ({
  version: 8,
  categories: {
    moviesTv: {
      sourceOrder: sourceOrder.map((id) => ({
        id,
        enabled: id in enabledOverrides ? enabledOverrides[id] : true,
      })),
      hosterOrder: [...hosterOrder],
      languageOrder: [
        { id: 'vf', enabled: true },
        { id: 'vostfr', enabled: true },
      ],
      overrides: {},
      pinnedSource: null,
      pinnedHoster: null,
      pinnedLanguage: null,
    },
    anime: {
      languageOrder: [{ id: 'vf', enabled: true }],
      hosterOrder: ['vidmoly', 'sibnet'],
      overrides: {},
      pinnedLanguage: null,
      pinnedHoster: null,
    },
  },
  customHosters: [],
  patternOverrides: {},
  updatedAt: Date.now(),
});

const loadPrefsFromStorage = (obj) => {
  store.clear();
  store.set(STORAGE_KEY, JSON.stringify(obj));
  return getSourcePriorityPrefs();
};

test('v9 : des prefs v8 non personnalisées adoptent la parité Movix', () => {
  const result = loadPrefsFromStorage(makeV8Prefs({
    sourceOrder: V8_DEFAULT_SOURCES,
    hosterOrder: V8_DEFAULT_HOSTERS,
  }));

  assert.equal(result.version, 9);
  const ids = result.categories.moviesTv.sourceOrder.map((e) => e.id);
  assert.deepEqual(ids.slice(0, DEFAULT_MOVIES_TV_ORDER.length), [...DEFAULT_MOVIES_TV_ORDER]);
  assert.deepEqual(
    result.categories.moviesTv.hosterOrder.slice(0, BUILTIN_HOSTER_IDS.length),
    [...BUILTIN_HOSTER_IDS],
  );
});

test("v9 : un ordre source personnalisé par l'utilisateur est préservé", () => {
  const customOrder = ['wiflix', 'fstream', 'nexus_hls', 'viper', 'custom'];
  const result = loadPrefsFromStorage(makeV8Prefs({
    sourceOrder: customOrder,
    hosterOrder: V8_DEFAULT_HOSTERS,
  }));

  const ids = result.categories.moviesTv.sourceOrder.map((e) => e.id);
  // Les 5 premiers restent ceux de l'utilisateur, dans son ordre.
  assert.deepEqual(ids.slice(0, customOrder.length), customOrder);
  // Les ids manquants sont appendus (forward-compat), pas insérés devant.
  for (const id of DEFAULT_MOVIES_TV_ORDER) {
    assert.ok(ids.includes(id), `id par défaut manquant après merge : ${id}`);
  }
});

test("v9 : un ordre hoster personnalisé est préservé, customs compris", () => {
  const customHosters = ['uqload', 'voe', 'custom_monhote', 'vidmoly'];
  const result = loadPrefsFromStorage(makeV8Prefs({
    sourceOrder: V8_DEFAULT_SOURCES,
    hosterOrder: customHosters,
  }));

  assert.deepEqual(result.categories.moviesTv.hosterOrder.slice(0, customHosters.length), customHosters);
});

test("v9 : un flag enabled=false choisi par l'utilisateur survit à la migration", () => {
  // La migration réordonne, elle ne doit pas réactiver ce que l'utilisateur a
  // volontairement éteint.
  const result = loadPrefsFromStorage(makeV8Prefs({
    sourceOrder: V8_DEFAULT_SOURCES,
    hosterOrder: V8_DEFAULT_HOSTERS,
    enabledOverrides: { wiflix: false, videasy: false },
  }));

  const byId = new Map(result.categories.moviesTv.sourceOrder.map((e) => [e.id, e.enabled]));
  assert.equal(byId.get('wiflix'), false, 'wiflix désactivé par l\'utilisateur a été réactivé');
  assert.equal(byId.get('videasy'), false, 'videasy désactivé par l\'utilisateur a été réactivé');
  // Une source non touchée reste activée.
  assert.equal(byId.get('fstream'), true);
  // L'ordre par défaut est bien appliqué malgré les flags.
  const ids = result.categories.moviesTv.sourceOrder.map((e) => e.id);
  assert.deepEqual(ids.slice(0, DEFAULT_MOVIES_TV_ORDER.length), [...DEFAULT_MOVIES_TV_ORDER]);
});

test('v9 : les ids dépréciés sont purgés des prefs persistées', () => {
  const result = loadPrefsFromStorage(makeV8Prefs({
    sourceOrder: ['frembed', 'nexus_file', 'fstream', 'vidlink', 'wiflix'],
    hosterOrder: V8_DEFAULT_HOSTERS,
  }));

  const ids = result.categories.moviesTv.sourceOrder.map((e) => e.id);
  for (const deprecated of DEPRECATED_SOURCE_IDS) {
    assert.ok(!ids.includes(deprecated), `id déprécié non purgé : ${deprecated}`);
  }
  assert.ok(ids.includes('fstream') && ids.includes('wiflix'));
});

test('v1 : la migration patternOverrides ne lève plus (require → import)', () => {
  // Avant correction, migrateV1toV2 appelait `require('./hosterRegistry')`,
  // inexistant dans un bundle ESM : le catch de getSourcePriorityPrefs avalait
  // l'erreur et l'utilisateur perdait TOUTE sa configuration.
  const v1 = {
    version: 1,
    categories: {
      moviesTv: {
        sourceOrder: [{ id: 'fstream', enabled: true }],
        hosterOrder: ['voe', 'uqload'],
        overrides: {},
        pinnedSource: null,
        pinnedHoster: null,
      },
      anime: {
        languageOrder: [{ id: 'vf', enabled: true }],
        hosterOrder: ['vidmoly'],
        overrides: {},
        pinnedLanguage: null,
        pinnedHoster: null,
      },
    },
    customHosters: [],
    // Override utilisateur sur voe : la migration v1→v2 doit préfixer les
    // motifs built-in pour préserver le comportement effectif.
    patternOverrides: { voe: ['mon-nouveau-domaine-voe'] },
    updatedAt: Date.now(),
  };

  const result = loadPrefsFromStorage(v1);

  assert.equal(result.version, 9);
  const voePatterns = result.patternOverrides.voe;
  assert.ok(Array.isArray(voePatterns), 'les patternOverrides voe ont été perdus');
  assert.ok(
    voePatterns.includes('mon-nouveau-domaine-voe'),
    "le motif utilisateur a disparu — la migration v1→v2 n'a pas tourné",
  );
  assert.ok(
    voePatterns.some((p) => String(p).includes('voe')),
    'les motifs built-in voe devraient préfixer la liste utilisateur',
  );
});

test('des prefs corrompues retombent sur les défauts sans lever', () => {
  store.clear();
  store.set(STORAGE_KEY, '{ pas du JSON');
  assert.deepEqual(
    getSourcePriorityPrefs().categories.moviesTv.sourceOrder.map((e) => e.id).slice(0, 3),
    [...DEFAULT_MOVIES_TV_ORDER].slice(0, 3),
  );

  store.clear();
  store.set(STORAGE_KEY, JSON.stringify({ version: 99, categories: {} }));
  assert.equal(getSourcePriorityPrefs().version, 9);
});

// ===========================================================================
// 5. Cascade de sélection automatique
// ===========================================================================

const availabilityFrom = (idsWithData) =>
  [...DEFAULT_MOVIES_TV_ORDER].map((id) => ({ id, hasData: idsWithData.includes(id) }));

test('une source VF disponible bat toujours un lecteur anglophone', () => {
  store.clear();
  setSourcePriorityPrefs(buildDefaults());
  const pick = pickAutoSelectedSource(availabilityFrom(['fstream', 'videasy', 'vostfr']));
  assert.equal(pick, 'fstream');
});

test('le palier VOSTFR passe avant les lecteurs anglophones', () => {
  store.clear();
  setSourcePriorityPrefs(buildDefaults());
  const pick = pickAutoSelectedSource(availabilityFrom(['vostfr', 'videasy', 'peachify']));
  assert.equal(pick, 'vostfr');
});

test('un lecteur anglophone reste sélectionnable en dernier recours', () => {
  store.clear();
  setSourcePriorityPrefs(buildDefaults());
  const pick = pickAutoSelectedSource(availabilityFrom(['videasy', 'peachify']));
  assert.equal(pick, 'videasy');
});

test("l'ordre par défaut est respecté à la tête (nexus_hls puis swiftflux)", () => {
  store.clear();
  setSourcePriorityPrefs(buildDefaults());
  assert.equal(
    pickAutoSelectedSource(availabilityFrom(['nexus_hls', 'fstream', 'wiflix'])),
    'nexus_hls',
  );
  assert.equal(
    pickAutoSelectedSource(availabilityFrom(['swiftflux', 'fstream', 'wiflix'])),
    'swiftflux',
  );
});

test('une source désactivée par l\'utilisateur est ignorée', () => {
  const def = buildDefaults();
  def.categories.moviesTv.sourceOrder = def.categories.moviesTv.sourceOrder.map((e) =>
    e.id === 'nexus_hls' ? { ...e, enabled: false } : e);
  store.clear();
  setSourcePriorityPrefs(def);

  assert.equal(
    pickAutoSelectedSource(availabilityFrom(['nexus_hls', 'fstream'])),
    'fstream',
    'nexus_hls désactivé ne doit pas être sélectionné',
  );
});

test('aucune source disponible ne renvoie null (pas de sélection fantôme)', () => {
  store.clear();
  setSourcePriorityPrefs(buildDefaults());
  assert.equal(pickAutoSelectedSource(availabilityFrom([])), null);
});

test('un id déprécié ne peut pas reprendre la main via le dernier lecteur', () => {
  store.clear();
  setSourcePriorityPrefs(buildDefaults());
  globalThis.localStorage.setItem('playerRememberLast', 'true');
  globalThis.localStorage.setItem('playerLastId', 'frembed');
  try {
    // `frembed` n'est pas dans l'ordre par défaut : même mémorisé, il ne doit
    // pas être renvoyé. La cascade retombe sur une source courante.
    const pick = pickAutoSelectedSource([
      { id: 'fstream', hasData: true },
    ]);
    assert.equal(pick, 'fstream');
  } finally {
    globalThis.localStorage.removeItem('playerRememberLast');
    globalThis.localStorage.removeItem('playerLastId');
  }
});

// ===========================================================================
// 6. Miroir frontend ↔ backend
// ===========================================================================
// `API/Mainapi/utils/embedExtraction.js` se déclare « miroir de
// src/utils/hosterRegistry.ts ». Une liste qui dérive d'un côté produit un
// symptôme précis : le frontend classe un lien dans un hébergeur, le backend ne
// le reconnaît pas et ne l'extrait jamais — le lecteur VF reste en échec alors
// que tout semble correctement configuré. C'est exactement ce qui était arrivé
// à `seekstreaming.net` / `seekstream.to`.
//
// Le backend ne couvre que les hébergeurs dont il possède un extracteur : la
// comparaison porte donc sur SON périmètre, pas sur la liste complète.
const backend = require(resolve(rootDir, 'API/Mainapi/utils/embedExtraction.js'));

test('les motifs backend sont identiques au frontend sur son périmètre', () => {
  const drifts = [];
  for (const [hoster, patterns] of Object.entries(backend.HOSTER_PATTERNS)) {
    const frontend = registry.BUILTIN_HOSTER_PATTERNS[hoster];
    if (!frontend) {
      drifts.push(`${hoster} : présent côté backend, inconnu côté frontend`);
      continue;
    }
    if (JSON.stringify([...patterns]) !== JSON.stringify([...frontend])) {
      drifts.push(
        `${hoster} :\n      frontend = ${JSON.stringify(frontend)}\n      backend  = ${JSON.stringify(patterns)}`,
      );
    }
  }
  assert.deepEqual(drifts, []);
});

test('backend et frontend détectent le même hébergeur pour une même URL', () => {
  const disagreements = [];
  for (const [url, expectedFrontend] of HOSTER_URLS) {
    const gotBackend = backend.detectHoster(url);
    // Hors périmètre backend (aucun extracteur) : non comparable.
    if (!(expectedFrontend in backend.HOSTER_PATTERNS)) continue;
    if (gotBackend !== expectedFrontend) {
      disagreements.push(`${url} → frontend ${expectedFrontend}, backend ${gotBackend}`);
    }
  }
  assert.deepEqual(disagreements, []);
});

test('tous les domaines SeekStreaming sont résolus des deux côtés', () => {
  // Garde-fou de régression sur la dérive corrigée : ces familles de domaines
  // doivent être reconnues par le frontend ET par le backend.
  const seekUrls = [
    'https://seekstreaming.net/embed/abc123',
    'https://seekstream.to/e/abc',
    'https://embedseek.com/#h6j8',
    'https://orvix1.embedseek.com/#h6j8',
    'https://embed4me.xyz/abc',
    'https://servicecatalog.xyz/abc',
    'https://technicalcatalog.com/abc',
    'https://seekplayer.net/abc',
    'https://seeks.cloud/abc',
    'https://seekplays.net/abc',
  ];
  const failures = [];
  for (const url of seekUrls) {
    const fe = detectHoster(url, {});
    const be = backend.detectHoster(url);
    if (fe !== 'seekstreaming' || be !== 'seekstreaming') {
      failures.push(`${url} → frontend ${fe}, backend ${be}`);
    }
  }
  assert.deepEqual(failures, []);
});

test('le périmètre de détection backend correspond aux hébergeurs extractibles', () => {
  // Le backend ne doit détecter que les hébergeurs pour lesquels il possède un
  // extracteur (`EXTRACTORS`, non exporté) : un hébergeur détecté sans
  // extracteur serait résolu en `null`, donc un lecteur en échec silencieux.
  // La liste attendue est celle des clés d'EXTRACTORS dans le module.
  const expected = [
    'voe', 'vidmoly', 'uqload', 'sibnet', 'veev', 'doodstream',
    'lulustream', 'vidara', 'seekstreaming', 'vidzy', 'fsvid',
  ];
  assert.deepEqual(
    Object.keys(backend.HOSTER_PATTERNS).slice().sort(),
    expected.slice().sort(),
    'le périmètre de détection backend a changé : vérifier que chaque hébergeur '
    + 'ajouté possède bien un extracteur dans EXTRACTORS',
  );
});
