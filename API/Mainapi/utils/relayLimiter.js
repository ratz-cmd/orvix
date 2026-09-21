'use strict';
/**
 * Garde-fou de charge du relais de flux (`/api/extract/stream`).
 *
 * Le site doit tenir sur une petite instance. Un relais de flux consomme de la
 * bande passante pendant toute la durée de la lecture : sans plafond, quelques
 * dizaines de spectateurs saturent la sortie réseau et *tout* le monde perd la
 * lecture. On limite donc le nombre de flux simultanés ; au-delà, l'endpoint
 * répond 503 et le client garde le lecteur tiers (dégradation propre plutôt
 * que panne générale).
 *
 * `ORVIX_RELAY_MAX_STREAMS` : nombre de flux simultanés (défaut 8, 0 = illimité).
 */

const DEFAULT_MAX_STREAMS = 8;

function parseLimit(raw) {
    const parsed = Number.parseInt(String(raw ?? '').trim(), 10);
    if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_MAX_STREAMS;
    return parsed;
}

const MAX_STREAMS = parseLimit(process.env.ORVIX_RELAY_MAX_STREAMS);

let active = 0;

/** Limite courante (0 = illimité). */
function relayLimit() {
    return MAX_STREAMS;
}

/** Nombre de flux relayés en cours. */
function activeStreams() {
    return active;
}

/** Vrai si un nouveau flux peut démarrer. */
function canAcceptStream() {
    if (MAX_STREAMS === 0) return true;
    return active < MAX_STREAMS;
}

/**
 * Réserve une place de relais.
 * @returns {function|null} Fonction de libération, ou `null` si le plafond est atteint.
 */
function acquireStreamSlot() {
    if (!canAcceptStream()) return null;
    active += 1;

    let released = false;
    return () => {
        if (released) return;
        released = true;
        active = Math.max(0, active - 1);
    };
}

/** Réinitialise le compteur (tests). */
function resetStreamSlots() {
    active = 0;
}

module.exports = {
    DEFAULT_MAX_STREAMS,
    relayLimit,
    activeStreams,
    canAcceptStream,
    acquireStreamSlot,
    resetStreamSlots,
};
