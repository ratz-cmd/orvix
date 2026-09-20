#!/usr/bin/env node

/**
 * generate-vip-key.js - Registre & Outil CLI Administrateur Orvix VIP
 * 
 * Permet de :
 *  - Générer des clés avec traçabilité (qui a créé la clé, pour quel client, quel montant)
 *  - Consulter la base de données complète des clés avec validité dynamique restante
 *  - Rechercher une clé par client, statut ou identifiant
 *  - Réinitialiser les appareils d'une clé ou la révoquer
 * 
 * Exemples d'utilisation :
 *   npm run vip:generate -- --client "Paul (Discord)" --by "Admin" --price 10
 *   npm run vip:list
 *   npm run vip:db
 *   npm run vip:list -- --search "Paul"
 *   npm run vip:info ORVIX-VIP-XXXX-XXXX-XXXX
 *   npm run vip:revoke ORVIX-VIP-XXXX-XXXX-XXXX
 *   npm run vip:reset ORVIX-VIP-XXXX-XXXX-XXXX
 */

const path = require('path');
const store = require('../utils/vipLicenseStore');

const args = process.argv.slice(2);

function getArgValue(flags) {
  if (!Array.isArray(flags)) flags = [flags];
  for (const flag of flags) {
    const index = args.indexOf(flag);
    if (index !== -1 && index + 1 < args.length) {
      return args[index + 1];
    }
  }
  return null;
}

function hasArg(flags) {
  if (!Array.isArray(flags)) flags = [flags];
  return flags.some(f => args.includes(f));
}

// -------------------------------------------------------------
// AIDE / DOCUMENTATION CLI
// -------------------------------------------------------------
if (hasArg(['--help', '-h'])) {
  console.log(`
👑 \x1b[1m\x1b[34mREGISTRE ET GESTIONNAIRE DE LICENCES VIP ORVIX\x1b[0m

\x1b[1mCommandes d'affichage :\x1b[0m
  npm run vip:list                                Affiche toutes les clés avec validité dynamique
  npm run vip:list -- --search "<nom/cle>"        Filtre par nom de client, créateur ou clé
  npm run vip:list -- --status <statut>           Filtre par statut (active, revoked, expired)
  npm run vip:info <cle>                          Affiche le rapport détaillé d'une clé

\x1b[1mCommandes de création :\x1b[0m
  npm run vip:generate                            Génère une clé 365j par défaut
  npm run vip:generate -- --client "Paul Discord" Spécifie pour qui la clé est créée
  npm run vip:generate -- --by "Moi"              Spécifie qui a créé la clé
  npm run vip:generate -- --price 10              Prix payé (défaut: 10€)
  npm run vip:generate -- --days 365              Durée de validité en jours
  npm run vip:generate -- --devices 2             Nombre max d'appareils simultanés
  npm run vip:generate -- --note "Notes"          Commentaire libre

\x1b[1mCommandes d'administration :\x1b[0m
  npm run vip:reset <cle>                         Réinitialise les appareils liés à la clé
  npm run vip:revoke <cle>                        Révoque immédiatement une clé
`);
  process.exit(0);
}

// Helper pour formater une date
function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch (_) {
    return String(dateStr);
  }
}

function pad(str, len) {
  const s = String(str || '');
  if (s.length >= len) return s.slice(0, len);
  return s + ' '.repeat(len - s.length);
}

// -------------------------------------------------------------
// MODE FICHE DÉTAILLÉE : --info <cle>
// -------------------------------------------------------------
const infoKey = getArgValue(['--info', '-i']) || (args[0] && args[0].startsWith('ORVIX-VIP-') && args[0]);
if (infoKey && (args.includes('--info') || (!args.includes('--list') && !args.includes('--revoke') && !args.includes('--reset-devices')))) {
  const keyData = store.getLicenseKey(infoKey);
  if (!keyData) {
    console.log(`\n❌ Clé VIP "${infoKey}" introuvable dans la base de données.\n`);
    process.exit(1);
  }

  console.log(`
╔═════════════════════════════════════════════════════════════════════════════╗
║                   🔍 FICHE DÉTAILLÉE DE LA CLÉ VIP ORVIX                    ║
╠═════════════════════════════════════════════════════════════════════════════╣
║ Clé VIP :            \x1b[33m\x1b[1m${pad(keyData.key_code, 53)}\x1b[0m║
║ Client (Pour qui) :  \x1b[36m${pad(keyData.client_name, 53)}\x1b[0m║
║ Créé par :           ${pad(keyData.created_by, 53)}║
║ Prix payé :          ${pad(`${(keyData.price_eur || 10).toFixed(2)} €`, 53)}║
║ Statut actuel :      ${pad(`${keyData.validity.statusBadge} (${keyData.validity.remainingText})`, 53)}║
║ Date de création :   ${pad(formatDate(keyData.created_at), 53)}║
║ Date d'activation :  ${pad(formatDate(keyData.activated_at), 53)}║
║ Date d'expiration :  ${pad(formatDate(keyData.expires_at), 53)}║
║ Durée initiale :     ${pad(`${keyData.duration_days} jours (1 an)`, 53)}║
║ Appareils actifs :   ${pad(`${keyData.devicesCount} / ${keyData.max_devices} appareil(s)`, 53)}║
║ Empreintes :         ${pad(keyData.devicesList.length > 0 ? keyData.devicesList.join(', ') : 'Aucun appareil connecté', 53)}║
║ Note :               ${pad(keyData.note || 'Aucune note', 53)}║
╚═════════════════════════════════════════════════════════════════════════════╝
`);
  process.exit(0);
}

// -------------------------------------------------------------
// MODE LISTING / BASE DE DONNÉES : --list ou --db
// -------------------------------------------------------------
if (hasArg(['--list', '--db', '-l'])) {
  const search = getArgValue(['--search', '-s']);
  const statusFilter = getArgValue(['--status']);

  const keys = store.listLicenseKeys({ limit: 200, search, status: statusFilter });
  const stats = store.getDatabaseStats();

  console.log('\n📊 \x1b[1m\x1b[34mREGISTRE DES CLÉS VIP ORVIX (Base SQLite : API/Mainapi/data/vip_keys.sqlite)\x1b[0m');
  if (search) console.log(`🔎 Filtre actif : "${search}"`);
  if (statusFilter) console.log(`🏷️ Statut filtré : "${statusFilter}"`);

  console.log('┌───────────────────────────┬──────────────────────┬─────────────┬──────────────────┬─────────────────────────────┬─────────┬───────────┐');
  console.log('│ Clé VIP                   │ Pour qui (Client)    │ Créé par    │ Créé le          │ Validité Restante           │ Prix    │ Appareils │');
  console.log('├───────────────────────────┼──────────────────────┼─────────────┼──────────────────┼─────────────────────────────┼─────────┼───────────┤');

  if (keys.length === 0) {
    console.log('│ ' + pad('Aucune clé trouvée.', 119) + ' │');
  } else {
    keys.forEach((k) => {
      const cKey = pad(k.key_code, 25);
      const cClient = pad(k.client_name, 20);
      const cBy = pad(k.created_by, 11);
      const cDate = pad(formatDate(k.created_at).slice(0, 16), 16);
      
      let validityDisplay = k.validity.remainingText;
      if (k.validity.statusCode === 'active') {
        validityDisplay = `🟢 ${validityDisplay}`;
      } else if (k.validity.statusCode === 'pending') {
        validityDisplay = `⏳ ${validityDisplay}`;
      } else if (k.validity.statusCode === 'revoked') {
        validityDisplay = `🔴 ${validityDisplay}`;
      } else {
        validityDisplay = `⚪ ${validityDisplay}`;
      }
      const cValidity = pad(validityDisplay, 27);
      const cPrice = pad(`${(k.price_eur || 10).toFixed(2)}€`, 7);
      const cDev = pad(`${k.devicesCount}/${k.max_devices}`, 9);

      console.log(`│ ${cKey} │ ${cClient} │ ${cBy} │ ${cDate} │ ${cValidity} │ ${cPrice} │ ${cDev} │`);
    });
  }

  console.log('└───────────────────────────┴──────────────────────┴─────────────┴──────────────────┴─────────────────────────────┴─────────┴───────────┘');
  console.log(`📈 \x1b[1mRÉSUMÉ :\x1b[0m Total : \x1b[1m${stats.totalKeys}\x1b[0m clé(s) | 🟢 Actives : \x1b[32m${stats.activeCount}\x1b[0m | ⏳ En attente : \x1b[33m${stats.pendingCount}\x1b[0m | ⚪ Expirées : ${stats.expiredCount} | 🔴 Révoquées : \x1b[31m${stats.revokedCount}\x1b[0m | 💰 Chiffre d'affaires : \x1b[32m${stats.totalRevenueEur} €\x1b[0m\n`);
  process.exit(0);
}

// -------------------------------------------------------------
// MODE RÉINITIALISATION APPAREILS : --reset-devices <cle>
// -------------------------------------------------------------
const resetKey = getArgValue(['--reset-devices', '--reset']);
if (resetKey) {
  const ok = store.resetLicenseDevices(resetKey);
  if (ok) {
    console.log(`\n✅ Les appareils associés à la clé \x1b[1m${resetKey}\x1b[0m ont été réinitialisés avec succès ! Le client peut se reconnecter.\n`);
  } else {
    console.log(`\n❌ Impossible de trouver la clé ${resetKey}.\n`);
  }
  process.exit(0);
}

// -------------------------------------------------------------
// MODE RÉVOCATION : --revoke <cle>
// -------------------------------------------------------------
const revokeKey = getArgValue(['--revoke']);
if (revokeKey) {
  const ok = store.revokeLicenseKey(revokeKey, 'admin_cli');
  if (ok) {
    console.log(`\n🛑 La clé \x1b[1m${revokeKey}\x1b[0m a été immédiatement RÉVOQUÉE ! L'accès VIP est coupé pour tous ses appareils.\n`);
  } else {
    console.log(`\n❌ Impossible de trouver la clé ${revokeKey}.\n`);
  }
  process.exit(0);
}

// -------------------------------------------------------------
// MODE CRÉATION DE CLÉ PAR DÉFAUT
// -------------------------------------------------------------
const clientName = getArgValue(['--client', '-c']) || 'Client Orvix';
const createdBy = getArgValue(['--by', '-b']) || 'Admin';
const priceEur = parseFloat(getArgValue(['--price', '-p']) || '10.0');
const days = parseInt(getArgValue(['--days', '-d']) || '365', 10);
const note = getArgValue(['--note', '-n']) || `Vente VIP 1 an (${priceEur}€)`;
const maxDevices = parseInt(getArgValue(['--devices']) || '2', 10);

const license = store.createLicenseKey({
  durationDays: days,
  clientName,
  createdBy,
  priceEur,
  note,
  maxDevices,
});

console.log(`
╔═════════════════════════════════════════════════════════════════════════════╗
║                   👑 NOUVELLE CLÉ VIP ORVIX ENREGISTRÉE                     ║
╠═════════════════════════════════════════════════════════════════════════════╣
║                                                                             ║
║   Clé VIP :           \x1b[33m\x1b[1m${license.keyCode}\x1b[0m
║   Pour qui (Client) : \x1b[36m\x1b[1m${license.clientName}\x1b[0m
║   Créé par :          \x1b[1m${license.createdBy}\x1b[0m
║   Montant encaissé :  \x1b[32m\x1b[1m${license.priceEur.toFixed(2)} €\x1b[0m
║   Durée de validité : \x1b[32m${license.durationDays} jours (1 an)\x1b[0m (démarre au premier usage)
║   Appareils max :     \x1b[35m${license.maxDevices} appareils simultanés\x1b[0m
║   Statut initial :    \x1b[33m⏳ En attente d'activation\x1b[0m
║   Date création :     ${formatDate(license.createdAt)}
║                                                                             ║
╚═════════════════════════════════════════════════════════════════════════════╝

💬 \x1b[1m\x1b[32mMESSAGE PRÊT À COPIER / COLLER POUR LE CLIENT (Discord / Telegram) :\x1b[0m
─────────────────────────────────────────────────────────────────────────────
Bonjour ${license.clientName} ! 👋
Merci pour ton paiement de ${license.priceEur.toFixed(2)}€.

Voici ta clé d'accès VIP Orvix valable 1 an :
👉 **${license.keyCode}**

Pour l'activer en 5 secondes :
1. Rends-toi sur : https://orvix.fr/vip (ou sur le site Orvix)
2. Colle ta clé VIP dans le champ prévu
3. Clique sur "Activer mon accès VIP"

Dès cet instant, toutes les publicités disparaissent sur tes films et séries ! 🎉
Bon visionnage sur Orvix !
─────────────────────────────────────────────────────────────────────────────

📌 \x1b[1mAstuce :\x1b[0m Tape \x1b[34mnpm run vip:list\x1b[0m à tout moment pour voir le tableau complet de toutes tes clés.
`);
