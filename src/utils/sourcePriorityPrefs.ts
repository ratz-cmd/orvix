// src/utils/sourcePriorityPrefs.ts
import {
  TOP_LEVEL_SOURCE_IDS, BUILTIN_HOSTER_IDS, LANGUAGE_IDS,
  DEPRECATED_SOURCE_IDS, DEPRECATED_HOSTER_IDS, SUPPORTED_SCHEMA_VERSIONS,
  type TopLevelSourceId, type HosterId, type LanguageId,
  type SourcePriorityPrefs, type PriorityCategory,
  type MoviesTvPrefs, type AnimePrefs, type CustomHoster,
} from '../types/sourcePriority';
// Import statique (et non `require`) : `hosterRegistry` ne consomme que
// `../types/sourcePriority`, il n'y a donc aucun cycle d'imports. Le
// `require()` utilisé jusqu'ici par migrateV1toV2 n'existe pas dans le bundle
// navigateur ESM — un client en prefs v1 tombait dans le `catch` de
// getSourcePriorityPrefs et perdait silencieusement toute sa configuration.
import { BUILTIN_HOSTER_PATTERNS } from './hosterRegistry';

const STORAGE_KEY = 'settings_source_priority_prefs';
const CHANGE_EVENT = 'orvix-source-priority-changed';

/**
 * Version du schéma persistée dans localStorage.
 * Incrémenter quand la structure change de façon incompatible ; ajouter un migrator au load.
 *
 * **v1 → v2** (2026-04-24) : `patternOverrides[id]` passe d'une sémantique
 * "append aux built-ins" à une sémantique "replace les built-ins". Le
 * migrator préfixe les built-ins à la liste utilisateur pour préserver
 * le comportement effectif des users qui avaient des patterns perso.
 *
 * **v2 → v3** (2026-05-25) : ordre par défaut des hosters Films/Séries
 * passe `vidzy` avant `uqload` (fstream auto-sélection prio vidzy/VF
 * au lieu de uqload/VOSTFR). Migration n'écrase l'ordre stocké QUE si
 * l'ordre des built-ins matche l'ancien default (= user n'a pas reordré).
 * Les `custom_*` sont préservés à leur position relative.
 *
 * **v3 → v4** (2026-08-31) : `swiftflux` (lecture directe HLS/MP4) remonte
 * juste après `nexus_hls` dans l'ordre par défaut, au lieu de passer après
 * les sources embed (fstream/omega/wiflix/j1f/swiftflow). Migration :
 * repositionnement inconditionnel (source trop récente pour qu'un ordre
 * volontaire existe) — voir migrateV3toV4.
 *
 * **v4 → v5** (2026-09-19) : Priorité française VF absolue. `vidlink`
 * (lecteur tiers anglophone) est relégué en avant-dernière position (fallback
 * juste avant `vostfr`), tandis que `nexus_hls`, `swiftflux`, `frembed`
 * et les flux français prennent la tête de liste.
 */
/**
 * **v7 → v8** (2026-09-20) : Priorité 100% VF (Audio Français Doublé).
 * Les sources françaises (fstream, seekstreaming, wiflix, bravo, darkino, mp4,
 * j1f, swiftflow, viper, coflix, omega, nexus_hls, swiftflux, custom)
 * reprennent la tête absolue. Les lecteurs anglophones/VOSTFR (videasy, peachify,
 * autoembed, etc.) sont relégués en fin de liste en secours.
 *
 * **v8 → v9** (2026-10-19) : Parité Movix. L'ordre par défaut reprend l'épine
 * `DEFAULT_MOVIES_TV_ORDER` du bundle de production Movix
 * (`nexus_hls > swiftflux > bravo > mp4 > darkino > fstream > omega > wiflix >
 * j1f > swiftflow > viper > coflix > custom > vox > kisskh > vostfr`), moins
 * `frembed` (déprécié côté Orvix, aucun chemin de rendu), plus `seekstreaming`
 * inséré après `fstream`. Les hosters built-in adoptent dans le même temps
 * l'ordre `BUILTIN_HOSTER_IDS` de Movix. Les lecteurs anglophones restent en
 * tout dernier recours, derrière les sources sous-titrées français.
 * Migration : l'ordre n'est réécrit que si l'utilisateur ne l'a jamais
 * personnalisé (comparaison avec l'ancien défaut v8), sinon on respecte son
 * classement et on se contente de purger les ids dépréciés.
 */
const SCHEMA_VERSION = 9 as const;
type LegacySourcePriorityPrefs<V extends 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8> = Omit<SourcePriorityPrefs, 'version'> & {
  version: V;
};
type PersistedSourcePriorityPrefs = SourcePriorityPrefs
  | LegacySourcePriorityPrefs<1>
  | LegacySourcePriorityPrefs<2>
  | LegacySourcePriorityPrefs<3>
  | LegacySourcePriorityPrefs<4>
  | LegacySourcePriorityPrefs<5>
  | LegacySourcePriorityPrefs<6>
  | LegacySourcePriorityPrefs<7>
  | LegacySourcePriorityPrefs<8>;

/** Ancien ordre built-in (pré-v3). Sert au comparateur du migrator v2→v3. */
const V2_DEFAULT_BUILTIN_HOSTER_ORDER: readonly string[] = [
  'voe', 'fsvid', 'vidmoly', 'uqload', 'sibnet', 'doodstream',
  'seekstreaming', 'smoothpre', 'minochinos', 'vidzy', 'darkibox',
  'supervideo', 'dropload', 'oneupload',
];

/**
 * Ordre built-in des hosters tel qu'il était en v8 (pré-parité Movix).
 * Sert au comparateur du migrator v8→v9 : on ne réécrit l'ordre d'un
 * utilisateur que s'il ne l'a jamais personnalisé.
 */
const V8_DEFAULT_BUILTIN_HOSTER_ORDER: readonly string[] = [
  'voe', 'fsvid', 'vidmoly', 'uqload', 'sibnet', 'veev', 'doodstream',
  'lulustream', 'vidara', 'seekstreaming', 'smoothpre', 'minochinos',
  'vidzy', 'darkibox', 'supervideo', 'dropload', 'oneupload',
];

/**
 * Ordre par défaut des sources top-level en v8 (pré-parité Movix).
 * Comparateur du migrator v8→v9, même règle que ci-dessus.
 */
const V8_DEFAULT_MOVIES_TV_ORDER: readonly string[] = [
  'fstream', 'seekstreaming', 'wiflix', 'bravo', 'darkino',
  'mp4', 'j1f', 'swiftflow', 'viper', 'coflix', 'omega',
  'nexus_hls', 'swiftflux', 'custom', 'videasy', 'peachify',
  'autoembed', 'embedsu', 'superembed', 'vidsrccc', '111movies',
  'vox', 'kisskh', 'vostfr',
];

/**
 * Épine Movix : `DEFAULT_MOVIES_TV_ORDER` du bundle de production Movix,
 * recopiée telle quelle. Elle sert de référence à la vérification de parité
 * (`tests/sourcePriorityParity.test.mjs`) : notre ordre par défaut doit la
 * contenir comme sous-séquence, dans le même ordre relatif.
 */
export const MOVIX_REFERENCE_MOVIES_TV_ORDER: readonly string[] = [
  'nexus_hls', 'swiftflux', 'bravo', 'mp4', 'darkino', 'fstream', 'omega',
  'wiflix', 'j1f', 'swiftflow', 'viper', 'coflix', 'custom', 'frembed',
  'vox', 'kisskh', 'vostfr',
];

/**
 * Épine Movix pour les hosters : `BUILTIN_HOSTER_IDS` du bundle de production
 * Movix. `BUILTIN_HOSTER_IDS` (src/types/sourcePriority.ts) doit y être égal,
 * élément par élément — vérifié par test.
 */
export const MOVIX_REFERENCE_BUILTIN_HOSTER_IDS: readonly string[] = [
  'voe', 'vidmoly', 'vidzy', 'uqload', 'sibnet', 'veev', 'doodstream',
  'lulustream', 'vidara', 'seekstreaming', 'smoothpre', 'minochinos',
  'darkibox', 'supervideo', 'dropload', 'oneupload', 'fsvid',
];

/**
 * Ordre par défaut des sources top-level pour Films/Séries (v9 — parité Movix).
 *
 *   nexus_hls > swiftflux > bravo > mp4 > darkino > fstream > **seekstreaming** >
 *   omega > wiflix > j1f > swiftflow > viper > coflix > custom >
 *   vox > kisskh > vostfr >
 *   videasy > peachify > autoembed > embedsu > superembed > vidsrccc > 111movies
 *
 * Écarts assumés et documentés vis-à-vis de Movix :
 *   - `frembed` (14e chez Movix) est absent : déprécié côté Orvix depuis la v8,
 *     il n'y a plus aucun chemin de rendu (`applyEmbedConfig` renvoie `false`,
 *     aucune iframe `playerType === 'frembed'`). Le conserver exposerait dans
 *     Réglages une source fantôme qui échoue systématiquement.
 *   - `seekstreaming` est inséré juste après `fstream` : Movix le traite comme
 *     un simple hoster, Orvix en fait aussi une source top-level VF (bouton
 *     « SeekStreaming VF HD »). Sa position préserve l'ordre relatif Movix.
 *   - les 7 lecteurs anglophones ferment la liste, derrière les sources
 *     sous-titrées français (`vox`/`kisskh`/`vostfr`) : dernier recours
 *     automatique, jamais devant une source française.
 */
export const DEFAULT_MOVIES_TV_ORDER: readonly TopLevelSourceId[] = [
  'nexus_hls', 'swiftflux', 'bravo', 'mp4', 'darkino', 'fstream',
  'seekstreaming', 'omega', 'wiflix', 'j1f', 'swiftflow', 'viper',
  'coflix', 'custom', 'vox', 'kisskh', 'vostfr',
  'videasy', 'peachify', 'autoembed', 'embedsu', 'superembed',
  'vidsrccc', '111movies',
];

/**
 * Ordre par défaut des hosters pour la catégorie Animes.
 * Scope volontairement restreint (anime-sama ne renvoie qu'un sous-ensemble) :
 * vidmoly, sibnet, smoothpre, seekstreaming (détection # incluse), minochinos.
 */
const DEFAULT_ANIME_HOSTER_ORDER: readonly HosterId[] = [
  'vidmoly', 'sibnet', 'smoothpre', 'seekstreaming', 'minochinos',
];

/**
 * Sources désactivées par défaut (opt-in explicite dans Réglages › Sources).
 *
 * Historiquement `vidlink`, lecteur tiers anglophone depuis retiré du modèle —
 * d'où l'ancien test figé `id !== 'vidlink'`, devenu une comparaison morte
 * (TS2367) une fois l'id disparu de `TOP_LEVEL_SOURCE_IDS`.
 *
 * La liste est aujourd'hui vide : les lecteurs anglophones restants (videasy,
 * peachify, autoembed, embedsu, superembed, vidsrccc, 111movies) sont gardés en
 * tout dernier recours automatique. C'est leur position en fin de
 * `DEFAULT_MOVIES_TV_ORDER` — derrière les sources sous-titrées français — qui
 * les tient à distance, pas un flag d'activation.
 */
const SOURCES_DISABLED_BY_DEFAULT: readonly string[] = [];

export function buildDefaults(): SourcePriorityPrefs {
  // Safety net : si DEFAULT_MOVIES_TV_ORDER oublie un id présent dans
  // TOP_LEVEL_SOURCE_IDS, on l'append à la fin pour préserver la couverture totale.
  const seen = new Set<TopLevelSourceId>(DEFAULT_MOVIES_TV_ORDER);
  const extras = TOP_LEVEL_SOURCE_IDS.filter((id) => !seen.has(id));
  const sourceOrderIds: TopLevelSourceId[] = [...DEFAULT_MOVIES_TV_ORDER, ...extras];

  const moviesTv: MoviesTvPrefs = {
    sourceOrder: sourceOrderIds.map((id) => ({
      id,
      enabled: !SOURCES_DISABLED_BY_DEFAULT.includes(id),
    })),
    hosterOrder: [...BUILTIN_HOSTER_IDS],
    // Même liste que Anime mais appliquée aux sources films/séries qui ont
    // plusieurs versions (fstream/wiflix/viper). VF + VOSTFR activés par
    // défaut (les autres restent dispo si le backend les renvoie, mais
    // désactivés pour éviter une auto-sélection d'une langue rare).
    languageOrder: LANGUAGE_IDS.map((id) => ({
      id,
      enabled: id === 'vf' || id === 'vostfr',
    })),
    overrides: {},
    pinnedSource: null,
    pinnedHoster: null,
    pinnedLanguage: null,
  };
  const anime: AnimePrefs = {
    languageOrder: LANGUAGE_IDS.map((id) => ({ id, enabled: true })),
    hosterOrder: [...DEFAULT_ANIME_HOSTER_ORDER],
    overrides: {},
    pinnedLanguage: null,
    pinnedHoster: null,
  };
  return {
    version: SCHEMA_VERSION,
    categories: { moviesTv, anime },
    customHosters: [],
    patternOverrides: {},
    updatedAt: Date.now(),
  };
}

export const DEFAULT_SOURCE_PRIORITY_PREFS: SourcePriorityPrefs = buildDefaults();

function isValidPrefs(obj: unknown): obj is PersistedSourcePriorityPrefs {
  if (!obj || typeof obj !== 'object') return false;
  const p = obj as Partial<Omit<SourcePriorityPrefs, 'version'>> & { version?: unknown };
  // Liste dérivée de SUPPORTED_SCHEMA_VERSIONS : ajouter un schéma ne demande
  // plus de retoucher ce test (l'ancienne énumération manuelle s'arrêtait à 8
  // et aurait fait rejeter — donc réinitialiser — toutes les prefs v9).
  const versionOk = typeof p.version === 'number'
    && (SUPPORTED_SCHEMA_VERSIONS as readonly number[]).includes(p.version);
  return versionOk
    && !!p.categories
    && !!p.categories.moviesTv
    && !!p.categories.anime
    && Array.isArray(p.categories.moviesTv.sourceOrder)
    && Array.isArray(p.categories.anime.languageOrder);
}

/**
 * Migration v1 → v2 : `patternOverrides[id]` était en append-mode (les
 * built-ins + l'append formaient la liste effective). En v2 on passe en
 * replace-mode (les patterns listés = liste effective). On préfixe donc
 * les built-ins pour que l'utilisateur retrouve son comportement.
 *
 * `BUILTIN_HOSTER_PATTERNS` vient d'un import statique en tête de module : le
 * cycle d'imports redouté n'existe pas, `hosterRegistry` ne consomme que
 * `../types/sourcePriority` et n'appelle jamais ce module. L'ancien
 * `require('./hosterRegistry')` levait `require is not defined` dans le bundle
 * navigateur ESM, et le `catch` de `getSourcePriorityPrefs` réduisait alors
 * silencieusement les prefs v1 aux valeurs par défaut.
 */
function migrateV1toV2(
  parsed: LegacySourcePriorityPrefs<1>,
): LegacySourcePriorityPrefs<2> {
  const migratedOverrides: SourcePriorityPrefs['patternOverrides'] = {};
  for (const [id, userPatterns] of Object.entries(parsed.patternOverrides ?? {})) {
    if (!userPatterns || userPatterns.length === 0) continue;
    const key = id as keyof typeof BUILTIN_HOSTER_PATTERNS;
    const builtin = BUILTIN_HOSTER_PATTERNS[key] ?? [];
    // Préfixe built-ins puis user patterns, déduplication au passage
    const seen = new Set<string>();
    const combined: string[] = [];
    for (const p of [...builtin, ...userPatterns]) {
      if (seen.has(p)) continue;
      seen.add(p);
      combined.push(p);
    }
    migratedOverrides[key] = combined;
  }

  return {
    ...parsed,
    version: 2,
    patternOverrides: migratedOverrides,
  };
}

/**
 * Migration v2 → v3 : nouvel ordre default pour moviesTv hosters (vidzy avant
 * uqload). Si l'utilisateur n'a JAMAIS reordré ses built-ins (sa liste de
 * built-ins, dans l'ordre, == V2_DEFAULT_BUILTIN_HOSTER_ORDER), on remplace
 * par le nouveau default — les `custom_*` sont préservés et rappendés. Sinon
 * on garde son ordre tel quel.
 */
function migrateV2toV3(
  parsed: LegacySourcePriorityPrefs<2>,
): LegacySourcePriorityPrefs<3> {
  const userOrder = parsed.categories.moviesTv.hosterOrder;
  const builtinsSet = new Set<string>(V2_DEFAULT_BUILTIN_HOSTER_ORDER);
  const builtinsInUserOrder = userOrder.filter((id) => builtinsSet.has(id));
  const customsInUserOrder = userOrder.filter((id) => !builtinsSet.has(id));

  const isUntouched = builtinsInUserOrder.length === V2_DEFAULT_BUILTIN_HOSTER_ORDER.length
    && builtinsInUserOrder.every((id, i) => id === V2_DEFAULT_BUILTIN_HOSTER_ORDER[i]);

  if (!isUntouched) {
    return { ...parsed, version: 3 };
  }

  return {
    ...parsed,
    version: 3,
    categories: {
      ...parsed.categories,
      moviesTv: {
        ...parsed.categories.moviesTv,
        hosterOrder: [...BUILTIN_HOSTER_IDS, ...customsInUserOrder],
      },
    },
  };
}

/**
 * Migration v3 → v4 : swiftflux (lecture directe) remonte juste après nexus_hls
 * au lieu de passer derrière les sources embed (fstream/omega/wiflix/j1f/
 * swiftflow). Repositionnement inconditionnel : swiftflux venait d'être ajouté
 * au moment de cette migration, donc aucun utilisateur ne l'avait classé
 * volontairement — soit il était à sa position par défaut, soit absent des
 * prefs persistées (mergeWithDefaults l'appendait alors en FIN de liste, donc
 * derrière tous les embeds). On l'insère s'il manque, en préservant son flag
 * `enabled` s'il existait. Un utilisateur qui le redescend ensuite persiste en
 * v4 → plus jamais retouché.
 */
function migrateV3toV4(
  parsed: LegacySourcePriorityPrefs<3>,
): SourcePriorityPrefs {
  const order = parsed.categories.moviesTv.sourceOrder;
  const idx = order.findIndex((e) => e.id === 'swiftflux');

  const entry = idx !== -1
    ? order[idx]
    : { id: 'swiftflux' as TopLevelSourceId, enabled: true };
  const without = idx !== -1 ? order.filter((_, i) => i !== idx) : order;
  const nexusIdx = without.findIndex((e) => e.id === 'nexus_hls');
  // nexus_hls absent (prefs corrompues) → tête de liste, même intention.
  const insertAt = nexusIdx === -1 ? 0 : nexusIdx + 1;
  const sourceOrder = [
    ...without.slice(0, insertAt), entry, ...without.slice(insertAt),
  ];

  return {
    ...parsed,
    version: 4,
    categories: {
      ...parsed.categories,
      moviesTv: { ...parsed.categories.moviesTv, sourceOrder },
    },
  };
}

/**
 * Migration v4 → v5 (2026-09-19) : Priorité française absolue (VF).
 * Relégation inconditionnelle de `vidlink` (lecteur tiers anglophone) en
 * fin de liste, juste avant `vostfr` (ou en queue si vostfr absent).
 * Les sources directes HLS et francophones (nexus_hls, swiftflux, frembed, etc.)
 * reprennent la priorité.
 */
function migrateV4toV5(
  parsed: LegacySourcePriorityPrefs<4>,
): SourcePriorityPrefs {
  try {
    const moviesTv = parsed.categories?.moviesTv;
    if (!moviesTv || !Array.isArray(moviesTv.sourceOrder)) {
      return { ...parsed, version: 5 } as SourcePriorityPrefs;
    }
    const order = moviesTv.sourceOrder;
    // Comparaison sur la forme string : `vidlink` a quitté `TopLevelSourceId`,
    // mais les prefs v4 persistées en contiennent encore la trace brute. La
    // garde doit rester fonctionnelle sur ces données — seul le typage de
    // l'union est devenu trop étroit (TS2367).
    const vidlinkIdx = order.findIndex((e) => String(e?.id) === 'vidlink');

    let sourceOrder = order;
    if (vidlinkIdx !== -1) {
      const vidlinkEntry = order[vidlinkIdx];
      const withoutVidlink = order.filter((_, i) => i !== vidlinkIdx);
      const vostfrIdx = withoutVidlink.findIndex((e) => String(e?.id) === 'vostfr');
      const insertAt = vostfrIdx === -1 ? withoutVidlink.length : vostfrIdx;
      sourceOrder = [
        ...withoutVidlink.slice(0, insertAt),
        vidlinkEntry,
        ...withoutVidlink.slice(insertAt),
      ];
    }

    return {
      ...parsed,
      version: 5,
      categories: {
        ...parsed.categories,
        moviesTv: { ...moviesTv, sourceOrder },
      },
    };
  } catch (err) {
    console.error('[sourcePriorityPrefs] Error during migrateV4toV5:', err);
    return { ...parsed, version: 5 } as SourcePriorityPrefs;
  }
}

/**
 * Migration v5 → v6 (2026-09-19) : Désactivation de `vidlink` pour tous les
 * utilisateurs existants. Vidlink est un lecteur tiers anglophone avec pubs —
 * il ne doit plus être auto-sélectionné. L'utilisateur peut le réactiver
 * manuellement dans les Réglages > Sources si souhaité.
 */
function migrateV5toV6(
  parsed: LegacySourcePriorityPrefs<5>,
): SourcePriorityPrefs {
  try {
    const moviesTv = parsed.categories?.moviesTv;
    if (!moviesTv || !Array.isArray(moviesTv.sourceOrder)) {
      return { ...parsed, version: 6 } as SourcePriorityPrefs;
    }
    // Désactiver vidlink dans la liste existante de l'utilisateur.
    // Comparaison sur la forme string, même raison que migrateV4toV5 : l'id a
    // quitté l'union `TopLevelSourceId` mais survit dans les prefs v5.
    const sourceOrder = moviesTv.sourceOrder.map((entry) =>
      String(entry?.id) === 'vidlink' ? { ...entry, enabled: false } : entry
    );
    return {
      ...parsed,
      version: 6,
      categories: {
        ...parsed.categories,
        moviesTv: { ...moviesTv, sourceOrder },
      },
    };
  } catch (err) {
    console.error('[sourcePriorityPrefs] Error during migrateV5toV6:', err);
    return { ...parsed, version: 6 } as SourcePriorityPrefs;
  }
}

/**
 * Migration v6 → v7 (2026-09-20) : Rétablissement des lecteurs 1080p VF.
 * Videasy (1080p VF) et Frembed (1080p VF) prennent la tête absolue.
 * nexus_hls est relégué vers la fin de liste.
 */
function migrateV6toV7(
  parsed: LegacySourcePriorityPrefs<6>,
): SourcePriorityPrefs {
  try {
    const moviesTv = parsed.categories?.moviesTv;
    if (!moviesTv || !Array.isArray(moviesTv.sourceOrder)) {
      return { ...parsed, version: 7 } as SourcePriorityPrefs;
    }
    const order = moviesTv.sourceOrder;
    // Retirer videasy et nexus_hls pour les repositionner
    const withoutSpecial = order.filter((e) => e?.id !== 'videasy' && e?.id !== 'nexus_hls');
    const videasyEntry = order.find((e) => e?.id === 'videasy') || { id: 'videasy' as TopLevelSourceId, enabled: true };
    const nexusEntry = order.find((e) => e?.id === 'nexus_hls') || { id: 'nexus_hls' as TopLevelSourceId, enabled: true };

    // Insérer videasy tout en tête
    // Insérer nexus_hls vers le bas (avant custom / vox / kisskh / vostfr)
    const lowerIdx = withoutSpecial.findIndex((e) => ['vox', 'kisskh', 'custom', 'vostfr'].includes(e?.id));
    const insertNexusAt = lowerIdx === -1 ? withoutSpecial.length : lowerIdx;

    const sourceOrder = [
      videasyEntry,
      ...withoutSpecial.slice(0, insertNexusAt),
      nexusEntry,
      ...withoutSpecial.slice(insertNexusAt),
    ];

    return {
      ...parsed,
      version: 7,
      categories: {
        ...parsed.categories,
        moviesTv: { ...moviesTv, sourceOrder },
      },
    };
  } catch (err) {
    console.error('[sourcePriorityPrefs] Error during migrateV6toV7:', err);
    return { ...parsed, version: 7 } as SourcePriorityPrefs;
  }
}

/**
 * Migration v7 → v8 (2026-09-20) : Priorité 100% VF (Audio Français Doublé).
 * Les sources françaises (fstream, seekstreaming, wiflix, bravo, darkino, mp4,
 * j1f, swiftflow, viper, coflix, omega, nexus_hls, swiftflux, custom)
 * reprennent la tête absolue. Les lecteurs anglophones/VOSTFR (videasy, peachify,
 * autoembed, etc.) sont relégués en fin de liste en secours.
 * Élimination définitive de toute mention de frembed.
 */
function migrateV7toV8(
  parsed: LegacySourcePriorityPrefs<7>,
): SourcePriorityPrefs {
  try {
    const moviesTv = parsed.categories?.moviesTv;
    if (!moviesTv || !Array.isArray(moviesTv.sourceOrder)) {
      return { ...parsed, version: 8 } as SourcePriorityPrefs;
    }
    const order = moviesTv.sourceOrder.filter((e) => (e?.id as string) !== 'frembed');

    const vfSourceIds = new Set<string>([
      'fstream', 'seekstreaming', 'wiflix', 'bravo', 'darkino',
      'mp4', 'j1f', 'swiftflow', 'viper', 'coflix', 'omega',
      'nexus_hls', 'swiftflux', 'custom',
    ]);

    const vfEntries = order.filter((e) => vfSourceIds.has(e?.id));
    const nonVfEntries = order.filter((e) => !vfSourceIds.has(e?.id));

    const desiredVfOrder: TopLevelSourceId[] = [
      'fstream', 'seekstreaming', 'wiflix', 'bravo', 'darkino',
      'mp4', 'j1f', 'swiftflow', 'viper', 'coflix', 'omega',
      'nexus_hls', 'swiftflux', 'custom',
    ];

    const sortedVfEntries: Array<{ id: TopLevelSourceId; enabled: boolean }> = [];
    for (const id of desiredVfOrder) {
      const existing = vfEntries.find((e) => e.id === id);
      if (existing) {
        sortedVfEntries.push(existing);
      } else {
        sortedVfEntries.push({ id, enabled: true });
      }
    }

    const sourceOrder = [...sortedVfEntries, ...nonVfEntries];

    return {
      ...parsed,
      version: 8,
      categories: {
        ...parsed.categories,
        moviesTv: { ...moviesTv, sourceOrder },
      },
    };
  } catch (err) {
    console.error('[sourcePriorityPrefs] Error during migrateV7toV8:', err);
    return { ...parsed, version: 8 } as SourcePriorityPrefs;
  }
}

/**
 * Migration v8 → v9 (2026-10-19) : parité Movix.
 *
 * Deux listes sont réalignées sur le bundle de production Movix :
 *   - `sourceOrder`  → épine Movix (`nexus_hls … vostfr`), moins `frembed`,
 *     plus `seekstreaming` après `fstream` ;
 *   - `hosterOrder`  → `BUILTIN_HOSTER_IDS` Movix (même ensemble d'ids, ordre
 *     canonique : `vidzy` remonte en 3e position, `fsvid` passe en dernier).
 *
 * Règle de respect du choix utilisateur, identique à migrateV2toV3 : on ne
 * réécrit une liste que si l'utilisateur ne l'a JAMAIS personnalisée (sa liste
 * équivaut élément par élément à l'ancien défaut v8). Un ordre volontaire est
 * conservé tel quel ; `mergeWithDefaults` se charge ensuite de purger les ids
 * dépréciés et d'appendre les nouveaux. Les hosters `custom_*` sont préservés à
 * leur position relative en fin de liste dans les deux cas.
 */
function migrateV8toV9(
  parsed: LegacySourcePriorityPrefs<8>,
): SourcePriorityPrefs {
  try {
    const moviesTv = parsed.categories?.moviesTv;
    if (!moviesTv || !Array.isArray(moviesTv.sourceOrder)) {
      return { ...parsed, version: 9 };
    }

    // --- sourceOrder : réécriture seulement si jamais personnalisé ---
    const orderIds = moviesTv.sourceOrder
      .map((e) => e?.id)
      .filter((id): id is TopLevelSourceId => typeof id === 'string');
    const sourcesUntouched = orderIds.length === V8_DEFAULT_MOVIES_TV_ORDER.length
      && orderIds.every((id, i) => id === V8_DEFAULT_MOVIES_TV_ORDER[i]);

    let sourceOrder = moviesTv.sourceOrder;
    if (sourcesUntouched) {
      // On conserve les flags `enabled` existants : un utilisateur qui avait
      // désactivé une source garde son choix, seul le rang change.
      const enabledById = new Map<string, boolean>(
        moviesTv.sourceOrder.map((e) => [String(e?.id), e?.enabled !== false]),
      );
      sourceOrder = DEFAULT_MOVIES_TV_ORDER.map((id) => ({
        id,
        enabled: enabledById.get(id) ?? !SOURCES_DISABLED_BY_DEFAULT.includes(id),
      }));
    }

    // --- hosterOrder : même règle, customs préservés ---
    const hosterOrder = Array.isArray(moviesTv.hosterOrder) ? moviesTv.hosterOrder : [];
    const v8Builtins = new Set<string>(V8_DEFAULT_BUILTIN_HOSTER_ORDER);
    const builtinsInUserOrder = hosterOrder.filter((id) => v8Builtins.has(id));
    const customsInUserOrder = hosterOrder.filter((id) => !v8Builtins.has(id));
    const hostersUntouched = builtinsInUserOrder.length === V8_DEFAULT_BUILTIN_HOSTER_ORDER.length
      && builtinsInUserOrder.every((id, i) => id === V8_DEFAULT_BUILTIN_HOSTER_ORDER[i]);
    const nextHosterOrder: HosterId[] = hostersUntouched
      ? [...BUILTIN_HOSTER_IDS, ...customsInUserOrder]
      : hosterOrder;

    return {
      ...parsed,
      version: 9,
      categories: {
        ...parsed.categories,
        moviesTv: { ...moviesTv, sourceOrder, hosterOrder: nextHosterOrder },
      },
    };
  } catch (err) {
    console.error('[sourcePriorityPrefs] Error during migrateV8toV9:', err);
    return { ...parsed, version: 9 };
  }
}


/** Merge parsed prefs with defaults (forward-compat pour nouveaux ids + purge deprecated). */
function mergeWithDefaults(parsed: PersistedSourcePriorityPrefs): SourcePriorityPrefs {
  const defaults = buildDefaults();

  const deprecatedSources = new Set<string>(DEPRECATED_SOURCE_IDS);
  const deprecatedHosters = new Set<string>(DEPRECATED_HOSTER_IDS);

  // Merge sourceOrder: keep user order, append missing default ids, strip deprecated.
  const mergeOrderedToggle = <T extends string>(
    userList: Array<{ id: T; enabled: boolean }>,
    defaultList: Array<{ id: T; enabled: boolean }>,
    deprecated?: Set<string>,
  ) => {
    const filtered = deprecated
      ? userList.filter((e) => !deprecated.has(e.id))
      : userList;
    const seen = new Set(filtered.map((e) => e.id));
    const extras = defaultList.filter((e) => !seen.has(e.id));
    return [...filtered, ...extras];
  };
  const mergeOrderedList = <T extends string>(
    userList: T[],
    defaultList: T[],
    deprecated?: Set<string>,
  ) => {
    const filtered = deprecated
      ? userList.filter((id) => !deprecated.has(id))
      : userList;
    const seen = new Set(filtered);
    const extras = defaultList.filter((id) => !seen.has(id));
    return [...filtered, ...extras];
  };

  // Purge overrides pointing at deprecated ids.
  const purgeOverrides = <K extends string>(
    overrides: Partial<Record<K, HosterId[]>> | undefined,
  ): Partial<Record<K, HosterId[]>> => {
    if (!overrides) return {};
    const next: Partial<Record<K, HosterId[]>> = {};
    for (const [key, value] of Object.entries(overrides) as Array<[K, HosterId[] | undefined]>) {
      if (!value) continue;
      const cleaned = value.filter((id) => !deprecatedHosters.has(id));
      if (cleaned.length > 0) next[key] = cleaned;
    }
    return next;
  };

  // Purge pinned pointing at a deprecated id (pin orphelin → null).
  const purgePinSource = <T extends string>(
    pin: { id: T; snapshot: Array<{ id: T; enabled: boolean }> } | null,
  ) => (pin && deprecatedSources.has(pin.id) ? null : pin);
  const purgePinHoster = <T extends string>(
    pin: { id: T; snapshot: Array<{ id: T; enabled: boolean }> } | null,
  ) => (pin && deprecatedHosters.has(pin.id) ? null : pin);

  return {
    version: SCHEMA_VERSION,
    categories: {
      moviesTv: {
        sourceOrder: mergeOrderedToggle(
          parsed.categories.moviesTv.sourceOrder,
          defaults.categories.moviesTv.sourceOrder,
          deprecatedSources,
        ),
        hosterOrder: mergeOrderedList(
          parsed.categories.moviesTv.hosterOrder,
          defaults.categories.moviesTv.hosterOrder,
          deprecatedHosters,
        ),
        // languageOrder : fallback sur defaults si absent (pre-v3 users).
        // mergeOrderedToggle append les ids manquants à la fin.
        languageOrder: mergeOrderedToggle(
          parsed.categories.moviesTv.languageOrder ?? defaults.categories.moviesTv.languageOrder,
          defaults.categories.moviesTv.languageOrder,
        ),
        overrides: purgeOverrides<TopLevelSourceId>(parsed.categories.moviesTv.overrides),
        pinnedSource: purgePinSource(parsed.categories.moviesTv.pinnedSource ?? null),
        pinnedHoster: purgePinHoster(parsed.categories.moviesTv.pinnedHoster ?? null),
        pinnedLanguage: parsed.categories.moviesTv.pinnedLanguage ?? null,
      },
      anime: {
        languageOrder: mergeOrderedToggle(
          parsed.categories.anime.languageOrder,
          defaults.categories.anime.languageOrder,
        ),
        hosterOrder: mergeOrderedList(
          parsed.categories.anime.hosterOrder,
          defaults.categories.anime.hosterOrder,
          deprecatedHosters,
        ),
        overrides: purgeOverrides<LanguageId>(parsed.categories.anime.overrides),
        pinnedLanguage: parsed.categories.anime.pinnedLanguage ?? null,
        pinnedHoster: purgePinHoster(parsed.categories.anime.pinnedHoster ?? null),
      },
    },
    customHosters: parsed.customHosters ?? [],
    patternOverrides: parsed.patternOverrides ?? {},
    updatedAt: parsed.updatedAt ?? Date.now(),
  };
}

export function getSourcePriorityPrefs(): SourcePriorityPrefs {
  try {
    if (typeof window === 'undefined') return buildDefaults();
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return buildDefaults();
    const parsed = JSON.parse(raw);
    if (!isValidPrefs(parsed)) return buildDefaults();
    // Chaîne de migrations. Chaque étape reçoit un cast explicite : depuis que
    // `SourcePriorityPrefs.version` couvre tout `SUPPORTED_SCHEMA_VERSIONS`
    // (1…9), le rétrécissement par discriminant ne suffit plus à isoler la
    // version legacy attendue — `SourcePriorityPrefs` admet lui aussi ces
    // valeurs. Le cast est la convention déjà en place pour v5→v6 et suivantes.
    // Migration v1 → v2 (patternOverrides : append → replace)
    const v2 = parsed.version === 1
      ? migrateV1toV2(parsed as LegacySourcePriorityPrefs<1>)
      : parsed;
    // Migration v2 → v3 (default hoster order : vidzy avant uqload)
    const v3 = v2.version === 2
      ? migrateV2toV3(v2 as LegacySourcePriorityPrefs<2>)
      : v2;
    // Migration v3 → v4 (swiftflux promu juste après nexus_hls)
    const v4 = v3.version === 3
      ? migrateV3toV4(v3 as LegacySourcePriorityPrefs<3>)
      : v3;
    // Migration v4 → v5 (vidlink relégué en fin de liste, sources VF en tête)
    const v5 = v4.version === 4
      ? migrateV4toV5(v4 as LegacySourcePriorityPrefs<4>)
      : v4;
    // Migration v5 → v6 (vidlink désactivé — plus jamais auto-sélectionné)
    const v6 = v5.version === 5
      ? migrateV5toV6(v5 as LegacySourcePriorityPrefs<5>)
      : v5;
    // Migration v6 → v7 (videasy/frembed 1080p VF en tête, fin du forçage HLS)
    const v7 = v6.version === 6
      ? migrateV6toV7(v6 as LegacySourcePriorityPrefs<6>)
      : v6;
    // Migration v7 → v8 (priorité 100% VF audio français doublé, zéro frembed)
    const v8 = v7.version === 7
      ? migrateV7toV8(v7 as LegacySourcePriorityPrefs<7>)
      : v7;
    // Migration v8 → v9 (parité Movix : épine des sources + ordre des hosters)
    const v9 = v8.version === 8
      ? migrateV8toV9(v8 as LegacySourcePriorityPrefs<8>)
      : v8;
    return mergeWithDefaults(v9);
  } catch {
    return buildDefaults();
  }
}

export function setSourcePriorityPrefs(next: SourcePriorityPrefs): void {
  if (typeof window === 'undefined') return;
  const toStore: SourcePriorityPrefs = { ...next, version: SCHEMA_VERSION, updatedAt: Date.now() };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    window.dispatchEvent(new CustomEvent<SourcePriorityPrefs>(CHANGE_EVENT, { detail: toStore }));
  } catch (e) {
    console.warn('[sourcePriorityPrefs] setSourcePriorityPrefs failed', e);
  }
}

export function resetSourcePriorityPrefs(): void {
  if (typeof window === 'undefined') return;
  setSourcePriorityPrefs(buildDefaults());
}

export function subscribeToPriorityChanges(cb: (prefs: SourcePriorityPrefs) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<SourcePriorityPrefs>).detail;
    cb(detail || getSourcePriorityPrefs());
  };
  const storageHandler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb(getSourcePriorityPrefs());
  };
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener('storage', storageHandler);
  };
}

/** Push prefs au bridge postMessage extension. No-op si extension absente. */
export async function pushPriorityToExtension(prefs?: SourcePriorityPrefs): Promise<void> {
  const payload = prefs ?? getSourcePriorityPrefs();
  try {
    const { isExtensionAvailable, fetchFromExtension } = await import('./extensionProxy');
    if (!isExtensionAvailable()) return;
    await fetchFromExtension('SET_SOURCE_PRIORITY', { prefs: payload });
  } catch (e) {
    // Extension sans handler → warning silencieux
    console.debug('[sourcePriorityPrefs] push to extension failed (non-fatal):', e);
  }
}

// ===== Helpers ergonomiques =====

export function updateCategory<C extends PriorityCategory>(
  category: C,
  updater: (cat: SourcePriorityPrefs['categories'][C]) => SourcePriorityPrefs['categories'][C],
): void {
  const prefs = getSourcePriorityPrefs();
  const nextCat = updater(prefs.categories[category]);
  setSourcePriorityPrefs({
    ...prefs,
    categories: { ...prefs.categories, [category]: nextCat },
  });
}

// ===== Pin helpers =====
// Milestone 4 — boutons pin cross-UI (player, Settings).
//
// Modèle : chaque pin stocke un `PinSnapshot` = { id, snapshot: ordre_pré_pin }.
// - pin d'un item inactif : promeut l'item à l'index 0, snapshot figé.
// - unpin : restaure le snapshot intégralement, `pinned = null`.
// - pin d'un autre item alors qu'un pin existe : on NE restaure PAS le précédent
//   snapshot (l'ordre actuel — post-lift du précédent pin — devient le nouveau
//   snapshot). Ça évite de "revenir en arrière" visuellement à chaque changement
//   de pin et préserve la dernière expérience utilisateur en cas d'unpin final.
// - drag manuel : `clearPinOnDrag` purge juste le flag `pinned`, l'ordre est
//   la vérité et ne doit pas être écrasé par un restore.

/**
 * Épingle une source top-level (Films/Séries) à la position 0.
 * Snapshot de l'ordre actuel stocké pour restore à l'unpin. Si un autre pin
 * est actif, le snapshot précédent est remplacé (pas de restore cascade).
 */
export function pinSource(id: TopLevelSourceId): void {
  updateCategory('moviesTv', (cat) => {
    const currentOrder = cat.sourceOrder;
    const target = currentOrder.find((e) => e.id === id);
    if (!target) return cat;
    const rest = currentOrder.filter((e) => e.id !== id);
    return {
      ...cat,
      sourceOrder: [target, ...rest],
      pinnedSource: { id, snapshot: currentOrder },
    };
  });
}

/** Retire le pin source actif et restaure l'ordre pré-pin. No-op sans pin. */
export function unpinSource(): void {
  updateCategory('moviesTv', (cat) => {
    if (!cat.pinnedSource) return cat;
    return { ...cat, sourceOrder: cat.pinnedSource.snapshot, pinnedSource: null };
  });
}

/** Épingle une langue d'anime à la position 0. */
export function pinLanguage(id: LanguageId): void {
  updateCategory('anime', (cat) => {
    const target = cat.languageOrder.find((e) => e.id === id);
    if (!target) return cat;
    const rest = cat.languageOrder.filter((e) => e.id !== id);
    return {
      ...cat,
      languageOrder: [target, ...rest],
      pinnedLanguage: { id, snapshot: cat.languageOrder },
    };
  });
}

/** Retire le pin langue actif et restaure l'ordre pré-pin. No-op sans pin. */
export function unpinLanguage(): void {
  updateCategory('anime', (cat) => {
    if (!cat.pinnedLanguage) return cat;
    return {
      ...cat,
      languageOrder: cat.pinnedLanguage.snapshot,
      pinnedLanguage: null,
    };
  });
}

/**
 * Épingle une langue à la position 0 dans MoviesTv. Utile pour forcer
 * VOSTFR en tête sans toucher aux autres langues.
 */
export function pinMovieLanguage(id: LanguageId): void {
  updateCategory('moviesTv', (cat) => {
    const target = cat.languageOrder.find((e) => e.id === id);
    if (!target) return cat;
    const rest = cat.languageOrder.filter((e) => e.id !== id);
    return {
      ...cat,
      languageOrder: [target, ...rest],
      pinnedLanguage: { id, snapshot: cat.languageOrder },
    };
  });
}

/** Retire le pin langue films/séries et restaure l'ordre pré-pin. No-op sans pin. */
export function unpinMovieLanguage(): void {
  updateCategory('moviesTv', (cat) => {
    if (!cat.pinnedLanguage) return cat;
    return {
      ...cat,
      languageOrder: cat.pinnedLanguage.snapshot,
      pinnedLanguage: null,
    };
  });
}

/**
 * Épingle un hoster à la position 0 dans la catégorie spécifiée.
 * Note : `hosterOrder` est un tableau d'ids (pas de enabled/disabled géré ici),
 * le snapshot les wrap en `{ id, enabled: true }` pour matcher `PinSnapshot<HosterId>`.
 */
export function pinHoster(category: PriorityCategory, id: HosterId): void {
  updateCategory(category, (cat) => {
    const list = cat.hosterOrder;
    if (!list.includes(id)) return cat;
    const snapshot = list.map((h) => ({ id: h, enabled: true }));
    return {
      ...cat,
      hosterOrder: [id, ...list.filter((h) => h !== id)],
      pinnedHoster: { id, snapshot },
    } as typeof cat;
  });
}

/** Retire le pin hoster actif et restaure l'ordre pré-pin. No-op sans pin. */
export function unpinHoster(category: PriorityCategory): void {
  updateCategory(category, (cat) => {
    if (!cat.pinnedHoster) return cat;
    return {
      ...cat,
      hosterOrder: cat.pinnedHoster.snapshot.map((e) => e.id),
      pinnedHoster: null,
    } as typeof cat;
  });
}

/**
 * Utilisé par l'UI drag : quand l'utilisateur drag, on lève juste le flag pin
 * (le drag est la vérité, on ne restaure PAS le snapshot). No-op s'il n'y a
 * pas de pin actif du kind demandé.
 */
export function clearPinOnDrag(
  category: PriorityCategory,
  kind: 'source' | 'language' | 'hoster',
): void {
  updateCategory(category, (cat) => {
    if (kind === 'source' && 'pinnedSource' in cat && cat.pinnedSource) {
      return { ...cat, pinnedSource: null };
    }
    if (kind === 'language' && 'pinnedLanguage' in cat && cat.pinnedLanguage) {
      return { ...cat, pinnedLanguage: null };
    }
    if (kind === 'hoster' && cat.pinnedHoster) {
      return { ...cat, pinnedHoster: null };
    }
    return cat;
  });
}

// ===== Reset helpers (Milestone 8) =====
//
// Chaque reset par section retourne le snapshot pré-reset pour permettre un
// undo via le toast Sonner "Annuler" côté UI. Les restore helpers associés
// remplacent simplement la catégorie entière (ou le couple customHosters +
// patternOverrides pour le cas custom).
//
// Choix design — reset hosters avec custom_* préservés :
// Le plan propose `hosterOrder: def.hosterOrder` (BUILTIN_HOSTER_IDS only), ce
// qui retirerait les custom_* de la liste (ils resteraient dans
// `customHosters` mais disparaîtraient de l'ordre, donc invisibles dans le
// panel). Moins disruptif : remettre les built-ins dans leur ordre default
// puis append les custom_* existants à la fin dans leur ordre relatif actuel.
// L'utilisateur peut ensuite les draguer où il veut. Undo restore intégralement.

/** Helper interne : ordre hoster default (built-ins) + custom_* actuels en queue. */
function rebuildHosterOrderPreservingCustoms(current: HosterId[]): HosterId[] {
  const defaultBuiltins = [...BUILTIN_HOSTER_IDS] as HosterId[];
  const currentCustoms = current.filter((id) => !(BUILTIN_HOSTER_IDS as readonly string[]).includes(id));
  return [...defaultBuiltins, ...currentCustoms];
}

/** Reset des sources Films/Séries (sourceOrder + pinnedSource). Retourne le snapshot. */
export function resetMoviesTvSources(): MoviesTvPrefs {
  const snapshot = getSourcePriorityPrefs().categories.moviesTv;
  const def = buildDefaults().categories.moviesTv;
  updateCategory('moviesTv', () => ({
    ...snapshot,
    sourceOrder: def.sourceOrder,
    pinnedSource: null,
  }));
  return snapshot;
}

/** Reset de l'ordre des hosters Films/Séries (conserve les custom_*). Retourne le snapshot. */
export function resetMoviesTvHosters(): MoviesTvPrefs {
  const snapshot = getSourcePriorityPrefs().categories.moviesTv;
  updateCategory('moviesTv', (cat) => ({
    ...cat,
    hosterOrder: rebuildHosterOrderPreservingCustoms(cat.hosterOrder),
    pinnedHoster: null,
  }));
  return snapshot;
}

/** Reset des overrides par source Films/Séries. Retourne le snapshot. */
export function resetMoviesTvOverrides(): MoviesTvPrefs {
  const snapshot = getSourcePriorityPrefs().categories.moviesTv;
  updateCategory('moviesTv', (cat) => ({ ...cat, overrides: {} }));
  return snapshot;
}

/** Reset des langues Animes (languageOrder + pinnedLanguage). Retourne le snapshot. */
export function resetAnimeLanguages(): AnimePrefs {
  const snapshot = getSourcePriorityPrefs().categories.anime;
  const def = buildDefaults().categories.anime;
  updateCategory('anime', () => ({
    ...snapshot,
    languageOrder: def.languageOrder,
    pinnedLanguage: null,
  }));
  return snapshot;
}

/** Reset de l'ordre des hosters Animes (conserve les custom_*). Retourne le snapshot. */
export function resetAnimeHosters(): AnimePrefs {
  const snapshot = getSourcePriorityPrefs().categories.anime;
  updateCategory('anime', (cat) => ({
    ...cat,
    hosterOrder: rebuildHosterOrderPreservingCustoms(cat.hosterOrder),
    pinnedHoster: null,
  }));
  return snapshot;
}

/** Reset des overrides par langue Animes. Retourne le snapshot. */
export function resetAnimeOverrides(): AnimePrefs {
  const snapshot = getSourcePriorityPrefs().categories.anime;
  updateCategory('anime', (cat) => ({ ...cat, overrides: {} }));
  return snapshot;
}

/**
 * Reset des hosters personnalisés et des patternOverrides.
 * Vide `customHosters` + `patternOverrides` et strip les ids `custom_*` de
 * `hosterOrder` des 2 catégories (sinon ils resteraient "fantômes" dans
 * l'ordre, pointant vers un hoster inexistant).
 *
 * Retourne les infos nécessaires au restore (customHosters + patternOverrides
 * pré-reset). Note : le restore NE restaure PAS les ids `custom_*` strippés
 * dans `hosterOrder` — l'utilisateur retrouve les hosters mais peut devoir
 * les ré-ordonner. Trade-off acceptable pour simplifier le restore et éviter
 * une dépendance sur snapshot complet des catégories.
 */
export function resetCustomHostersAndPatterns(): {
  customHosters: CustomHoster[];
  patternOverrides: SourcePriorityPrefs['patternOverrides'];
} {
  const prefs = getSourcePriorityPrefs();
  const snapshot = {
    customHosters: prefs.customHosters,
    patternOverrides: prefs.patternOverrides,
  };
  setSourcePriorityPrefs({
    ...prefs,
    customHosters: [],
    patternOverrides: {},
    categories: {
      moviesTv: {
        ...prefs.categories.moviesTv,
        hosterOrder: prefs.categories.moviesTv.hosterOrder.filter(
          (id) => !id.startsWith('custom_'),
        ),
        pinnedHoster: prefs.categories.moviesTv.pinnedHoster?.id.startsWith('custom_')
          ? null
          : prefs.categories.moviesTv.pinnedHoster,
      },
      anime: {
        ...prefs.categories.anime,
        hosterOrder: prefs.categories.anime.hosterOrder.filter(
          (id) => !id.startsWith('custom_'),
        ),
        pinnedHoster: prefs.categories.anime.pinnedHoster?.id.startsWith('custom_')
          ? null
          : prefs.categories.anime.pinnedHoster,
      },
    },
  });
  return snapshot;
}

/** Restore intégral de la catégorie moviesTv (pour undo toast). */
export function restoreMoviesTv(snapshot: MoviesTvPrefs): void {
  updateCategory('moviesTv', () => snapshot);
}

/** Restore intégral de la catégorie anime (pour undo toast). */
export function restoreAnime(snapshot: AnimePrefs): void {
  updateCategory('anime', () => snapshot);
}

/**
 * Restore customHosters + patternOverrides (pour undo toast).
 * Note : `hosterOrder` des catégories n'est PAS restauré — si l'utilisateur
 * veut retrouver les custom_* dans l'ordre, il doit les ré-ajouter via drag
 * ou accepter leur nouvelle position par défaut. Choix documenté dans
 * `resetCustomHostersAndPatterns`.
 */
export function restoreCustomHostersAndPatterns(
  snapshot: { customHosters: CustomHoster[]; patternOverrides: SourcePriorityPrefs['patternOverrides'] },
): void {
  const prefs = getSourcePriorityPrefs();
  // Ré-append les custom_* à la fin de hosterOrder pour qu'ils soient visibles.
  const restoredCustomIds = snapshot.customHosters.map((c) => c.id);
  const moviesTvOrder = [
    ...prefs.categories.moviesTv.hosterOrder.filter((id) => !restoredCustomIds.includes(id)),
    ...restoredCustomIds.filter((id) => !prefs.categories.moviesTv.hosterOrder.includes(id)),
  ];
  const animeOrder = [
    ...prefs.categories.anime.hosterOrder.filter((id) => !restoredCustomIds.includes(id)),
    ...restoredCustomIds.filter((id) => !prefs.categories.anime.hosterOrder.includes(id)),
  ];
  setSourcePriorityPrefs({
    ...prefs,
    customHosters: snapshot.customHosters,
    patternOverrides: snapshot.patternOverrides,
    categories: {
      moviesTv: { ...prefs.categories.moviesTv, hosterOrder: moviesTvOrder },
      anime: { ...prefs.categories.anime, hosterOrder: animeOrder },
    },
  });
}
