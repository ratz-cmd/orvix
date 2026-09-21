'use strict';
/**
 * Domaines autorisés à appeler l'API (CORS + restriction de domaine).
 *
 * La liste historique est codée en dur dans `middleware/cors.js` et
 * `middleware/security.js` (orvix.*, miroirs partenaires). Conséquence : un
 * déploiement sur un autre domaine — `orvix.fr`, un sous-domaine, une IP de
 * test — voyait le site se charger puis **toutes** les requêtes API refusées,
 * sans message clair côté navigateur.
 *
 * `ORVIX_ALLOWED_ORIGINS` ajoute des domaines sans toucher au code :
 *
 *   ORVIX_ALLOWED_ORIGINS=orvix.fr,www.orvix.fr,api.orvix.fr
 *
 * Règles :
 *   - liste séparée par des virgules, casse ignorée ;
 *   - une entrée simple (`orvix.fr`) couvre le domaine **et ses sous-domaines**,
 *     exactement comme la liste en dur historique (`www.orvix.fr` passe donc) ;
 *   - un point en tête (`.orvix.fr`) rend l'intention explicite, même effet ;
 *   - une entrée avec port se compare à l'hôte complet (`localhost:3000`) ;
 *   - `*` autorise tout le monde (déconseillé hors développement).
 *
 * Les domaines en dur restent valides : cette liste **s'ajoute** à eux.
 */

/** Domaines supplémentaires issus de `ORVIX_ALLOWED_ORIGINS`. */
function getExtraAllowedDomains() {
    const raw = (process.env.ORVIX_ALLOWED_ORIGINS || '').trim();
    if (!raw) return [];

    return raw
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);
}

/** Vrai si `domain` (entrée de liste) correspond à l'hôte/URL fourni. */
function matchesAllowedDomain(urlOrHost, domain) {
    if (!urlOrHost || !domain) return false;

    let hostname = '';
    let host = '';
    try {
        // Accepte une URL complète comme un simple nom d'hôte.
        const parsed = new URL(urlOrHost.includes('://') ? urlOrHost : `https://${urlOrHost}`);
        hostname = parsed.hostname.toLowerCase();
        host = parsed.host.toLowerCase();
    } catch {
        return false;
    }

    const normalizedDomain = String(domain).toLowerCase().replace(/^\./, '');

    if (domain === '*') return true;
    // Entrée avec port : comparaison stricte sur l'hôte complet.
    if (String(domain).includes(':')) return host === String(domain).toLowerCase();
    // Entrée ouverte aux sous-domaines : `.orvix.fr` ou `orvix.fr` matchent
    // `www.orvix.fr` et `orvix.fr`.
    return hostname === normalizedDomain || hostname.endsWith(`.${normalizedDomain}`);
}

/**
 * Vrai si l'origine (ou le referer) fait partie des domaines fournis.
 * @param {string} urlOrHost
 * @param {string[]} domains
 */
function isOriginInAllowedDomains(urlOrHost, domains) {
    if (!urlOrHost) return false;
    return (domains || []).some((domain) => matchesAllowedDomain(urlOrHost, domain));
}

/**
 * Vrai si l'origine est autorisée : domaines en dur **ou** liste d'environnement.
 * @param {string} urlOrHost
 * @param {string[]} staticDomains
 */
function isOriginAllowed(urlOrHost, staticDomains) {
    if (isOriginInAllowedDomains(urlOrHost, staticDomains)) return true;
    return isOriginInAllowedDomains(urlOrHost, getExtraAllowedDomains());
}

module.exports = {
    getExtraAllowedDomains,
    matchesAllowedDomain,
    isOriginInAllowedDomains,
    isOriginAllowed,
};
