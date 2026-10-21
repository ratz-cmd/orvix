// src/types/sourcePriority.ts

/**
 * Versions de schéma acceptées au chargement. `SCHEMA_VERSION`
 * (src/utils/sourcePriorityPrefs.ts) doit toujours être le dernier élément :
 * c'est la version écrite dans localStorage, les autres ne servent qu'aux
 * migrators. L'ancienne déclaration figée à `4 | 5 | 6` faisait échouer le
 * contrôle de types dès la v7/v8.
 */
export const SUPPORTED_SCHEMA_VERSIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export type SourcePrioritySchemaVersion = typeof SUPPORTED_SCHEMA_VERSIONS[number];

/**
 * Ensemble des ids top-level valides pour Films/Séries.
 *
 * **L'ordre n'est PAS la priorité par défaut** : celle-ci vit dans
 * `DEFAULT_MOVIES_TV_ORDER` (src/utils/sourcePriorityPrefs.ts). Cet ordre-ci
 * suit la même épine pour rester lisible, mais seul l'ensemble compte —
 * `buildDefaults()` s'en sert pour détecter les ids absents de l'ordre par
 * défaut et les rappender.
 *
 * Épine = liste Movix (`nexus_hls … vostfr`), moins `frembed` (déprécié côté
 * Orvix, aucun chemin de rendu), plus `seekstreaming` (source VF propre à
 * Orvix, insérée après `fstream`).
 *
 * **100 % français (schéma v10)** : les 7 lecteurs anglophones (`videasy`,
 * `peachify`, `autoembed`, `embedsu`, `superembed`, `vidsrccc`, `111movies`)
 * ont été retirés du modèle — voir `DEPRECATED_SOURCE_IDS`. `vostfr` reste
 * seul en fin de liste comme filet de sécurité quand aucun audio français
 * n'existe.
 */
export const TOP_LEVEL_SOURCE_IDS = [
  'nexus_hls', 'swiftflux', 'bravo', 'mp4', 'darkino', 'fstream',
  'seekstreaming', 'omega', 'wiflix', 'j1f', 'swiftflow', 'viper',
  'coflix', 'custom', 'vox', 'kisskh', 'vostfr',
] as const;
export type TopLevelSourceId = typeof TOP_LEVEL_SOURCE_IDS[number];

/**
 * Lecteurs anglophones retirés du modèle au schéma v10.
 *
 * Ils ne sont plus ni auto-sélectionnables, ni épinglables, ni listés dans
 * Réglages. `mergeWithDefaults` les purge des préférences persistées et
 * `migrateV9toV10` les retire explicitement du `localStorage` existant.
 */
export const ANGLOPHONE_SOURCE_IDS = [
  'videasy', 'peachify', 'autoembed', 'embedsu', 'superembed', 'vidsrccc', '111movies',
] as const;
export type AnglophoneSourceId = typeof ANGLOPHONE_SOURCE_IDS[number];

/**
 * Ids historiques retirés de l'UI de priorité.
 * mergeWithDefaults les strip des prefs persistées (cleanup migration).
 */
export const DEPRECATED_SOURCE_IDS = [
  'frembed', 'vidlink', 'nexus_file', 'rivestream_hls', 'rivestream',
  ...ANGLOPHONE_SOURCE_IDS,
] as const;
export const DEPRECATED_HOSTER_IDS = [] as const;

/**
 * Ids retirés du modèle de priorité mais encore traités par les pages de
 * visionnage.
 *
 * `pickAutoSelectedSource` ne peut plus les renvoyer (ils ne sont ni dans
 * `TOP_LEVEL_SOURCE_IDS` ni dans l'ordre par défaut), donc ils ne participent
 * plus à la cascade automatique. Leurs branches subsistent dans
 * `applyEmbedConfig`, d'où cet élargissement de signature : sans lui le
 * compilateur rejette `case 'nexus_file'` / `case 'videasy'` (TS2678) alors
 * que du code legacy peut encore les émettre.
 *
 * Pour les lecteurs anglophones, ces branches sont du code mort volontairement
 * conservé : les supprimer d'un bloc dans deux fichiers de ~200 Ko ferait
 * prendre un risque de régression disproportionné par rapport au gain, et le
 * modèle (seule source de vérité de l'auto-sélection) ne peut plus les
 * atteindre.
 */
export type LegacySelectableSourceId =
  | 'nexus_file' | 'frembed'
  | AnglophoneSourceId;
export type AutoSelectSourceId = TopLevelSourceId | LegacySelectableSourceId;

/**
 * Hosters built-in connus. Les custom hosters utilisent des ids prefixés `custom_`.
 *
 * **Parité Movix** : cet ordre est aligné sur `BUILTIN_HOSTER_IDS` du bundle de
 * production Movix. Même ensemble d'ids, ordre canonique commun.
 *
 * **L'ordre compte deux fois** : il fixe l'ordre de priorité par défaut ET
 * l'ordre de test dans `detectHoster`. Deux contraintes de précédence en
 * découlent et sont vérifiées par `tests/sourcePriorityParity.test.mjs` :
 *   - `veev` AVANT `doodstream`, dont les patterns couvrent aussi `doods.to` ;
 *   - `vidzy` AVANT `fsvid` n'est pas requis (motifs disjoints), mais `fsvid`
 *     reste en dernier comme chez Movix sans shadowing constaté.
 */
export const BUILTIN_HOSTER_IDS = [
  'voe', 'vidmoly', 'vidzy', 'uqload', 'sibnet', 'veev', 'doodstream',
  'lulustream', 'vidara',
  'seekstreaming', 'smoothpre', 'minochinos', 'darkibox',
  'supervideo', 'dropload', 'oneupload', 'fsvid',
] as const;
export type BuiltinHosterId = typeof BUILTIN_HOSTER_IDS[number];
export type HosterId = BuiltinHosterId | string; // string = custom_...

/** Langues supportées par les animes (anime-sama). */
export const LANGUAGE_IDS = ['vf', 'vostfr', 'vj', 'va', 'vkr', 'vcn'] as const;
export type LanguageId = typeof LANGUAGE_IDS[number] | string;

export interface PinSnapshot<T extends string> {
  id: T;
  snapshot: Array<{ id: T; enabled: boolean }>;
}

export interface MoviesTvPrefs {
  sourceOrder: Array<{ id: TopLevelSourceId; enabled: boolean }>;
  hosterOrder: HosterId[];
  /**
   * Préférence de langue pour les sources qui en proposent plusieurs versions
   * (FStream, Lynx/wiflix, Viper). Appliquée comme tri PRIMAIRE avant
   * l'ordre des hosters, quand les items exposent un champ `language` ou
   * `category`. Si la source n'expose pas de langue, ce tri est no-op.
   */
  languageOrder: Array<{ id: LanguageId; enabled: boolean }>;
  overrides: Partial<Record<TopLevelSourceId, HosterId[]>>;
  pinnedSource: PinSnapshot<TopLevelSourceId> | null;
  pinnedHoster: PinSnapshot<HosterId> | null;
  pinnedLanguage: PinSnapshot<LanguageId> | null;
}

export interface AnimePrefs {
  languageOrder: Array<{ id: LanguageId; enabled: boolean }>;
  hosterOrder: HosterId[];
  overrides: Partial<Record<LanguageId, HosterId[]>>;
  pinnedLanguage: PinSnapshot<LanguageId> | null;
  pinnedHoster: PinSnapshot<HosterId> | null;
}

export interface CustomHoster {
  id: string;       // ex: "custom_myhost"
  name: string;
  patterns: string[]; // regex strings
}

export interface SourcePriorityPrefs {
  version: SourcePrioritySchemaVersion;
  categories: {
    moviesTv: MoviesTvPrefs;
    anime: AnimePrefs;
  };
  customHosters: CustomHoster[];
  patternOverrides: Partial<Record<BuiltinHosterId, string[]>>;
  updatedAt: number;
}

export type PriorityCategory = 'moviesTv' | 'anime';
