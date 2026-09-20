'use strict';
/**
 * Localisation du moteur d'extraction (extension/Chrome/extractors.js).
 *
 * Ce fichier vit dans le dépôt web, pas sous `API/` : un déploiement qui ne
 * copie que le dossier du backend laissait l'extraction « à la volée »
 * (SeekStreaming, Voe, Uqload…) silencieusement inutilisable. On essaie donc
 * plusieurs emplacements, on accepte une variable d'environnement explicite,
 * et on rend un message qui dit quoi faire quand rien n'est trouvé.
 */

const fs = require('fs');
const path = require('path');

/** Chemins essayés pour le moteur principal, dans l'ordre de priorité. */
const EXTRACTORS_CANDIDATES = [
    process.env.ORVIX_EXTRACTORS_PATH,
    path.resolve(__dirname, '../../../extension/Chrome/extractors.js'),
    path.resolve(process.cwd(), 'extension/Chrome/extractors.js'),
    path.resolve(process.cwd(), '../extension/Chrome/extractors.js'),
].filter(Boolean);

/** Chemins essayés pour le moteur QuickJS (désobfuscation fsvid/vidzy). */
const QUICKJS_CANDIDATES = [
    process.env.ORVIX_QUICKJS_PATH,
    path.resolve(__dirname, '../../../extension/Chrome/fsvid-vidzy-quickjs.js'),
    path.resolve(process.cwd(), 'extension/Chrome/fsvid-vidzy-quickjs.js'),
    path.resolve(process.cwd(), '../extension/Chrome/fsvid-vidzy-quickjs.js'),
].filter(Boolean);

/** Premier chemin qui existe réellement, ou `null`. */
function firstExistingFile(candidates) {
    return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

/** Chemin du moteur d'extraction, ou une erreur actionnable. */
function resolveExtractorsPath(candidates = EXTRACTORS_CANDIDATES) {
    const found = firstExistingFile(candidates);
    if (found) return found;

    throw new Error(
        'Fichier extractors.js introuvable. Copiez le dossier `extension/` du dépôt à côté '
        + 'de `API/`, ou renseignez ORVIX_EXTRACTORS_PATH=. Chemins essayés : '
        + candidates.join(' | '),
    );
}

/** Chemin du moteur QuickJS, ou `null` (facultatif : repli regex). */
function resolveQuickJsPath(candidates = QUICKJS_CANDIDATES) {
    return firstExistingFile(candidates);
}

module.exports = {
    EXTRACTORS_CANDIDATES,
    QUICKJS_CANDIDATES,
    firstExistingFile,
    resolveExtractorsPath,
    resolveQuickJsPath,
};
