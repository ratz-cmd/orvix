#!/usr/bin/env node

/**
 * vip-menu.js - Panneau de Contrôle Interactif Numéroté Orvix VIP
 * 
 * Permet d'administrer l'ensemble du système VIP Orvix simplement
 * en tapant des numéros (1, 2, 3...) dans le terminal.
 * 
 * Fonctionne :
 * - En local sur votre machine
 * - Sur votre serveur VPS / Cloud (en connexion SSH)
 */

const readline = require('readline');
const path = require('path');
const store = require('../utils/vipLicenseStore');
const http = require('http');

// Configuration du readline
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let isClosing = false;
rl.on('close', () => {
  if (!isClosing) {
    isClosing = true;
    console.log('\n\x1b[33m👋 Panneau d\'administration Orvix fermé. À bientôt !\x1b[0m\n');
    process.exit(0);
  }
});

// Promesse utilitaire pour poser une question dans le terminal
function ask(questionText, defaultValue = '') {
  return new Promise((resolve) => {
    if (rl.closed || isClosing) return resolve(defaultValue);
    try {
      rl.question(questionText, (answer) => {
        const trimmed = (answer || '').trim();
        resolve(trimmed === '' ? defaultValue : trimmed);
      });
    } catch (_) {
      resolve(defaultValue);
    }
  });
}

// Pause jusqu'à appui sur Entrée
function waitEnter() {
  return new Promise((resolve) => {
    if (rl.closed || isClosing) return resolve();
    try {
      rl.question('\n\x1b[36m👉 Appuyez sur Entrée pour revenir au menu...\x1b[0m', () => {
        resolve();
      });
    } catch (_) {
      resolve();
    }
  });
}

// Nettoyage de l'écran terminal
function clearScreen() {
  process.stdout.write('\x1b[2J\x1b[0;0H');
}

// Formatage des dates
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

// Gestion propre de Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n\x1b[33m👋 Fermeture du panneau VIP Orvix. À bientôt !\x1b[0m\x1b[?25h\n');
  process.exit(0);
});

// -------------------------------------------------------------
// ACTIONS DU MENU
// -------------------------------------------------------------

// [1] Afficher toutes les clés
async function showAllKeys() {
  clearScreen();
  console.log('\n📊 \x1b[1m\x1b[34mREGISTRE DES CLÉS VIP ORVIX (Base SQLite)\x1b[0m');
  console.log('═'.repeat(120));

  const keys = store.listLicenseKeys({ limit: 100 });
  const stats = store.getDatabaseStats();

  console.log('┌───────────────────────────┬──────────────────────┬─────────────┬──────────────────┬─────────────────────────────┬─────────┬───────────┐');
  console.log('│ Clé VIP                   │ Pour qui (Client)    │ Créé par    │ Créé le          │ Validité Restante           │ Prix    │ Appareils │');
  console.log('├───────────────────────────┼──────────────────────┼─────────────┼──────────────────┼─────────────────────────────┼─────────┼───────────┤');

  if (keys.length === 0) {
    console.log('│ ' + pad('Aucune clé trouvée dans la base.', 119) + ' │');
  } else {
    keys.forEach((k) => {
      const cKey = pad(k.key_code, 25);
      const cClient = pad(k.client_name, 20);
      const cBy = pad(k.created_by, 11);
      const cDate = pad(formatDate(k.created_at).slice(0, 16), 16);

      let valText = k.validity.remainingText;
      if (k.validity.statusCode === 'active') valText = `🟢 ${valText}`;
      else if (k.validity.statusCode === 'pending') valText = `⏳ ${valText}`;
      else if (k.validity.statusCode === 'revoked') valText = `🔴 ${valText}`;
      else valText = `⚪ ${valText}`;

      const cVal = pad(valText, 27);
      const cPrice = pad(`${(k.price_eur || 10).toFixed(2)}€`, 7);
      const cDev = pad(`${k.devicesCount}/${k.max_devices}`, 9);

      console.log(`│ ${cKey} │ ${cClient} │ ${cBy} │ ${cDate} │ ${cVal} │ ${cPrice} │ ${cDev} │`);
    });
  }

  console.log('└───────────────────────────┴──────────────────────┴─────────────┴──────────────────┴─────────────────────────────┴─────────┴───────────┘');
  console.log(`\x1b[1m📈 RÉSUMÉ :\x1b[0m Total: \x1b[1m${stats.totalKeys}\x1b[0m clé(s) | 🟢 Actives: \x1b[32m${stats.activeCount}\x1b[0m | ⏳ En attente: \x1b[33m${stats.pendingCount}\x1b[0m | ⚪ Expirées: ${stats.expiredCount} | 🔴 Révoquées: \x1b[31m${stats.revokedCount}\x1b[0m | 💰 CA: \x1b[32m${stats.totalRevenueEur} €\x1b[0m`);

  await waitEnter();
}

// [2] Créer une nouvelle clé guidée
async function createNewKeyInteractive() {
  clearScreen();
  console.log('\n➕ \x1b[1m\x1b[32mCRÉATION D\'UNE NOUVELLE CLÉ VIP ORVIX\x1b[0m');
  console.log('─────────────────────────────────────────────────────────────');
  console.log('Remplissez les champs ci-dessous (ou tapez Entrée pour la valeur par défaut) :\n');

  const clientName = await ask('👤 Pour qui est cette clé (ex: Discord @Paul, Marc) [Client Orvix] : ', 'Client Orvix');
  const createdBy = await ask('✍️  Créé par qui [Admin] : ', 'Admin');

  let priceEur = 10.0;
  const rawPrice = await ask('💶 Montant payé en € [10] : ', '10');
  const parsedPrice = parseFloat(rawPrice);
  if (!isNaN(parsedPrice) && parsedPrice >= 0) {
    priceEur = parsedPrice;
  }

  let durationDays = 365;
  const rawDays = await ask('📅 Durée de validité en jours [365] : ', '365');
  const parsedDays = parseInt(rawDays, 10);
  if (!isNaN(parsedDays) && parsedDays > 0) {
    durationDays = parsedDays;
  }

  let maxDevices = 2;
  const rawDevices = await ask('📱 Nombre max d\'appareils simultanés [2] : ', '2');
  const parsedDevices = parseInt(rawDevices, 10);
  if (!isNaN(parsedDevices) && parsedDevices > 0) {
    maxDevices = parsedDevices;
  }

  const note = `Vente VIP (${priceEur}€) - ${clientName}`;

  const license = store.createLicenseKey({
    durationDays,
    clientName,
    createdBy,
    priceEur,
    maxDevices,
    note,
  });

  console.log(`
╔═════════════════════════════════════════════════════════════════════════════╗
║                   👑 NOUVELLE CLÉ VIP ORVIX CRÉÉE AVEC SUCCÈS !             ║
╠═════════════════════════════════════════════════════════════════════════════╣
║                                                                             ║
║   Clé VIP :           \x1b[33m\x1b[1m${license.keyCode}\x1b[0m
║   Pour qui (Client) : \x1b[36m\x1b[1m${license.clientName}\x1b[0m
║   Créé par :          \x1b[1m${license.createdBy}\x1b[0m
║   Prix encaissé :     \x1b[32m\x1b[1m${license.priceEur.toFixed(2)} €\x1b[0m
║   Validité :          \x1b[32m${license.durationDays} jours (1 an)\x1b[0m (commence dès la première utilisation)
║   Appareils max :     \x1b[35m${license.maxDevices} appareils simultanés\x1b[0m
║   Statut initial :    \x1b[33m⏳ En attente d'activation sur le site\x1b[0m
║                                                                             ║
╚═════════════════════════════════════════════════════════════════════════════╝

💬 \x1b[1m\x1b[32mMESSAGE PRÊT À ENVOYER AU CLIENT (Copier/Coller sur Discord / Telegram) :\x1b[0m
─────────────────────────────────────────────────────────────────────────────
Bonjour ${license.clientName} ! 👋
Merci pour ton paiement de ${license.priceEur.toFixed(2)}€.

Voici ta clé d'accès VIP Orvix valable 1 an :
👉 **${license.keyCode}**

Pour l'activer en 5 secondes :
1. Rends-toi sur le site Orvix (section VIP ou /vip)
2. Colle ta clé dans le champ prévu
3. Clique sur "Activer mon accès VIP"

Dès cet instant, toutes les publicités disparaissent sur tes films et séries ! 🎉
Bon visionnage sur Orvix !
─────────────────────────────────────────────────────────────────────────────
`);

  await waitEnter();
}

// [3] Rechercher ou inspecter une clé
async function searchOrInspectKey() {
  clearScreen();
  console.log('\n🔍 \x1b[1m\x1b[36mRECHERCHER OU INSPECTER UNE CLÉ VIP\x1b[0m');
  console.log('─────────────────────────────────────────────────────────────\n');

  const query = await ask('Entrez un pseudo client, un créateur ou un morceau de clé : ');
  if (!query) {
    console.log('\x1b[33mAucune recherche effectuée.\x1b[0m');
    await waitEnter();
    return;
  }

  const results = store.listLicenseKeys({ limit: 50, search: query });
  if (results.length === 0) {
    console.log(`\n❌ Aucun résultat trouvé pour "${query}".\n`);
    await waitEnter();
    return;
  }

  console.log(`\nTrouvé ${results.length} résultat(s) :\n`);
  results.forEach((k, idx) => {
    let devices = [];
    try { devices = JSON.parse(k.devices || '[]'); } catch (_) {}

    console.log(`[${idx + 1}] \x1b[33m\x1b[1m${k.key_code}\x1b[0m | Client: \x1b[36m${k.client_name}\x1b[0m | Statut: ${k.validity.statusBadge} (${k.validity.remainingText}) | Appareils: ${devices.length}/${k.max_devices} | Créé le: ${formatDate(k.created_at)}`);
  });

  const detailChoice = await ask('\nTapez le numéro d\'une clé pour voir sa fiche complète (ou Entrée pour quitter) : ');
  const num = parseInt(detailChoice, 10);
  if (!isNaN(num) && num >= 1 && num <= results.length) {
    const selected = results[num - 1];
    let devList = [];
    try { devList = JSON.parse(selected.devices || '[]'); } catch (_) {}

    clearScreen();
    console.log(`
╔═════════════════════════════════════════════════════════════════════════════╗
║                   🔍 FICHE DÉTAILLÉE DE LA CLÉ VIP ORVIX                    ║
╠═════════════════════════════════════════════════════════════════════════════╣
║ Clé VIP :            \x1b[33m\x1b[1m${pad(selected.key_code, 53)}\x1b[0m║
║ Client (Pour qui) :  \x1b[36m${pad(selected.client_name, 53)}\x1b[0m║
║ Créé par :           ${pad(selected.created_by, 53)}║
║ Prix payé :          ${pad(`${(selected.price_eur || 10).toFixed(2)} €`, 53)}║
║ Statut actuel :      ${pad(`${selected.validity.statusBadge} (${selected.validity.remainingText})`, 53)}║
║ Date de création :   ${pad(formatDate(selected.created_at), 53)}║
║ Date d'activation :  ${pad(formatDate(selected.activated_at), 53)}║
║ Date d'expiration :  ${pad(formatDate(selected.expires_at), 53)}║
║ Durée initiale :     ${pad(`${selected.duration_days} jours (1 an)`, 53)}║
║ Appareils actifs :   ${pad(`${devList.length} / ${selected.max_devices} appareil(s)`, 53)}║
║ Empreintes :         ${pad(devList.length > 0 ? devList.join(', ') : 'Aucun appareil connecté', 53)}║
║ Note :               ${pad(selected.note || 'Aucune note', 53)}║
╚═════════════════════════════════════════════════════════════════════════════╝
`);
  }

  await waitEnter();
}

// [4] Réinitialiser les appareils
async function resetDevicesInteractive() {
  clearScreen();
  console.log('\n🔄 \x1b[1m\x1b[35mRÉINITIALISATION DES APPAREILS D\'UNE CLÉ (DÉPANNAGE)\x1b[0m');
  console.log('─────────────────────────────────────────────────────────────');
  console.log('Utile quand un client a changé d\'appareil ou dépassé la limite autorisée.\n');

  const keyInput = await ask('Entrez la clé VIP (ex: ORVIX-VIP-XXXX-XXXX-XXXX) : ');
  if (!keyInput) {
    await waitEnter();
    return;
  }

  const cleanKey = keyInput.trim().toUpperCase();
  const ok = store.resetLicenseDevices(cleanKey);
  if (ok) {
    console.log(`\n\x1b[32m✅ Succès !\x1b[0m Les appareils liés à la clé \x1b[1m${cleanKey}\x1b[0m ont été effacés. Le client peut se reconnecter immédiatement.`);
  } else {
    console.log(`\n\x1b[31m❌ Clé introuvable.\x1b[0m Vérifiez l'orthographe de la clé.`);
  }

  await waitEnter();
}

// [5] Révoquer une clé
async function revokeKeyInteractive() {
  clearScreen();
  console.log('\n🛑 \x1b[1m\x1b[31mRÉVOCATION D\'UNE CLÉ VIP (BANNISSEMENT ACCÈS)\x1b[0m');
  console.log('─────────────────────────────────────────────────────────────\n');

  const keyInput = await ask('Entrez la clé VIP à révoquer : ');
  if (!keyInput) {
    await waitEnter();
    return;
  }

  const cleanKey = keyInput.trim().toUpperCase();
  const keyInfo = store.getLicenseKey(cleanKey);
  if (!keyInfo) {
    console.log(`\n\x1b[31m❌ Clé introuvable.\x1b[0m`);
    await waitEnter();
    return;
  }

  console.log(`\nClé trouvée : \x1b[33m${cleanKey}\x1b[0m (Client: \x1b[36m${keyInfo.client_name}\x1b[0m)`);
  const confirm = await ask('\x1b[31m⚠️ Êtes-vous certain de vouloir révoquer cette clé ? (o/N) : \x1b[0m');

  if (confirm.toLowerCase() === 'o' || confirm.toLowerCase() === 'oui') {
    store.revokeLicenseKey(cleanKey, 'révocation_manuelle_admin');
    console.log(`\n\x1b[32m✅ La clé ${cleanKey} a été immédiatement RÉVOQUÉE !\x1b[0m L'accès VIP est coupé.`);
  } else {
    console.log('\nOpération annulée.');
  }

  await waitEnter();
}

// [6] Vérification de l'état des serveurs
function checkPort(port, name) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1500 }, (res) => {
      resolve({ name, port, status: '🟢 En ligne', code: res.statusCode });
    });
    req.on('error', () => {
      resolve({ name, port, status: '🔴 Inaccessible', code: null });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ name, port, status: '⏳ Timeout', code: null });
    });
  });
}

async function checkServersStatus() {
  clearScreen();
  console.log('\n🌐 \x1b[1m\x1b[34mVÉRIFICATION DE L\'ÉTAT DES SERVEURS ORVIX\x1b[0m');
  console.log('─────────────────────────────────────────────────────────────\n');

  console.log('Test des ports en cours...');
  const [frontend, backend] = await Promise.all([
    checkPort(3000, 'Frontend Orvix (Vite)'),
    checkPort(25565, 'API Backend Orvix (Mainapi)'),
  ]);

  console.log('\nRésultats :');
  console.log(` - ${frontend.name} (Port ${frontend.port}) : ${frontend.status}`);
  console.log(` - ${backend.name} (Port ${backend.port}) : ${backend.status}`);

  console.log('\n📌 Info environnement :');
  console.log(` - Mode : ${process.env.NODE_ENV || 'development'}`);
  console.log(` - Base de données SQLite : API/Mainapi/data/vip_keys.sqlite`);

  await waitEnter();
}

// -------------------------------------------------------------
// BOUCLE PRINCIPALE DU MENU INTERACTIF
// -------------------------------------------------------------
async function main() {
  let running = true;

  while (running) {
    clearScreen();
    console.log(`
╔═════════════════════════════════════════════════════════════════════╗
║                   👑 ORVIX - GESTIONNAIRE VIP                       ║
║              Panneau d'Administration Numéroté Terminal             ║
╚═════════════════════════════════════════════════════════════════════╝

  \x1b[36m[1]\x1b[0m 📋 \x1b[1mAfficher toutes les clés VIP\x1b[0m (Tableau, validité restante & CA)
  \x1b[32m[2]\x1b[0m ➕ \x1b[1mCréer une nouvelle clé VIP\x1b[0m (Nom du client, prix, message auto)
  \x1b[34m[3]\x1b[0m 🔍 \x1b[1mRechercher ou inspecter une clé\x1b[0m (Fiche détaillée d'un client)
  \x1b[35m[4]\x1b[0m 🔄 \x1b[1mRéinitialiser les appareils d'une clé\x1b[0m (Dépannage client)
  \x1b[31m[5]\x1b[0m 🛑 \x1b[1mRévoquer une clé VIP\x1b[0m (Bannir l'accès immédiatement)
  \x1b[33m[6]\x1b[0m 🌐 \x1b[1mVérifier l'état des serveurs\x1b[0m (Frontend 3000 & Backend 25565)
  \x1b[90m[0]\x1b[0m 🚪 \x1b[1mQuitter\x1b[0m

───────────────────────────────────────────────────────────────────────`);

    if (rl.closed || isClosing) break;
    const choice = await ask('👉 \x1b[1mEntrez un numéro [0-6] puis appuyez sur Entrée : \x1b[0m');
    if (rl.closed || isClosing) break;

    switch (choice) {
      case '1':
        await showAllKeys();
        break;
      case '2':
        await createNewKeyInteractive();
        break;
      case '3':
        await searchOrInspectKey();
        break;
      case '4':
        await resetDevicesInteractive();
        break;
      case '5':
        await revokeKeyInteractive();
        break;
      case '6':
        await checkServersStatus();
        break;
      case '0':
      case 'q':
      case 'quit':
      case 'exit':
        running = false;
        clearScreen();
        console.log('\n\x1b[33m👋 Panneau d\'administration Orvix fermé. À bientôt !\x1b[0m\n');
        process.exit(0);
        break;
      default:
        console.log('\n\x1b[31m⚠️ Choix non reconnu. Veuillez taper un chiffre entre 0 et 6.\x1b[0m');
        await new Promise((r) => setTimeout(r, 1200));
        break;
    }
  }
}

main().catch((err) => {
  console.error('\nErreur inattendue:', err);
  process.exit(1);
});
