/**
 * ipHashSalt.js — Sel partagé pour pseudonymiser les adresses IP.
 *
 * Plusieurs modules hachent des IP pour de la détection d'abus (dons récurrents,
 * limitation de débit des feedbacks). Ces hashs ne sont utiles que s'ils sont
 * COMPARABLES d'un démarrage à l'autre : le sel doit donc venir de la
 * configuration, pas d'une constante du dépôt.
 *
 * C'est la raison d'être de ce module : les deux appelants utilisaient un repli
 * en dur (`'orvix-vip-ip'`, `'orvix-help-feedback-default-salt'`) présent dans
 * un dépôt public. Avec un sel connu, un hash d'IP ne protège plus rien :
 * l'espace IPv4 se parcourt en force brute en quelques minutes.
 *
 * Repli : un sel aléatoire par processus. Il préserve la cohérence des hashs
 * pendant la vie du worker (suffisant pour les tests et les contextes non
 * configurés) mais il n'est PAS stable après redémarrage — d'où l'alerte.
 * En pratique ce cas ne se produit pas : JWT_SECRET est obligatoire pour
 * démarrer l'API, et TURNSTILE_IP_SALT est documenté dans .env.example.
 */

const crypto = require('crypto');

let fallbackSalt = null;
let warned = false;

function getIpHashSalt() {
  const configured = (
    process.env.TURNSTILE_IP_SALT ||
    process.env.JWT_SECRET ||
    ''
  ).trim();

  if (configured) return configured;

  if (!fallbackSalt) {
    fallbackSalt = crypto.randomBytes(32).toString('hex');
  }
  if (!warned) {
    warned = true;
    console.warn(
      "[ipHashSalt] Ni TURNSTILE_IP_SALT ni JWT_SECRET ne sont configurés : " +
        "sel aléatoire par processus. Les hashs d'IP ne seront pas comparables " +
        'après un redémarrage.',
    );
  }
  return fallbackSalt;
}

module.exports = { getIpHashSalt };
