#!/usr/bin/env node

/**
 * Orvix - Script de Provisionnement Automatique du Serveur Discord
 * Utilise l'API REST Discord v10 native (fetch sans dépendance externe).
 * 
 * Usage:
 *   node scripts/setup-discord.mjs
 * ou avec variables d'environnement :
 *   DISCORD_BOT_TOKEN="xxx" DISCORD_GUILD_ID="yyy" node scripts/setup-discord.mjs
 */

import readline from 'node:readline';

const API_BASE = 'https://discord.com/api/v10';

// Couleurs en hex entier pour Discord
const COLORS = {
  BLUE_ELECTRIC: 0x2563EB,
  CYAN: 0x38BDF8,
  GOLD_VIP: 0xF59E0B,
  DARK_BLUE: 0x3B82F6,
};

// Bits de permissions Discord
const PERMS = {
  VIEW_CHANNEL: 1n << 10n,     // 1024n
  SEND_MESSAGES: 1n << 11n,    // 2048n
};

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => rl.question(query, (ans) => {
    rl.close();
    resolve(ans.trim());
  }));
}

async function discordFetch(endpoint, token, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    Authorization: `Bot ${token}`,
    'Content-Type': 'application/json',
    ...options.headers,
  };

  while (true) {
    const res = await fetch(url, { ...options, headers });

    // Gestion du Rate-Limit Discord (429)
    if (res.status === 429) {
      const data = await res.json().catch(() => ({ retry_after: 2 }));
      const delay = Math.ceil((data.retry_after || 2) * 1000) + 200;
      console.log(`⏳ Rate-limit Discord atteint. Pause de ${delay / 1000}s...`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Erreur Discord API [${res.status} ${res.statusText}] sur ${endpoint}: ${errText}`);
    }

    // Petite pause de sécurité entre requêtes (250ms) pour ne pas heurter les rate-limits
    await new Promise((r) => setTimeout(r, 250));

    if (res.status === 204) return null;
    return res.json();
  }
}

async function main() {
  console.log('\n======================================================');
  console.log('⚡ ORVIX - CONFIGURATEUR AUTOMATIQUE DE SERVEUR DISCORD');
  console.log('======================================================\n');

  let token = process.env.DISCORD_BOT_TOKEN;
  let guildId = process.env.DISCORD_GUILD_ID;

  if (!token) {
    token = await askQuestion('👉 Entrez votre DISCORD_BOT_TOKEN : ');
  }
  if (!guildId) {
    guildId = await askQuestion('👉 Entrez votre DISCORD_GUILD_ID (ID du serveur) : ');
  }

  if (!token || !guildId) {
    console.error('❌ Le Token du bot et l\'ID du serveur sont obligatoires.');
    process.exit(1);
  }

  console.log('\n🔍 Vérification des accès au serveur...');
  const me = await discordFetch('/users/@me', token);
  const guild = await discordFetch(`/guilds/${guildId}`, token);
  console.log(`✅ Connecté en tant que "${me.username}" sur : "${guild.name}"\n`);

  // 1. Récupération des rôles existants
  console.log('📋 [1/5] Gestion des Rôles...');
  const existingRoles = await discordFetch(`/guilds/${guildId}/roles`, token);
  const roleMap = new Map(existingRoles.map(r => [r.name, r]));
  const everyoneRole = existingRoles.find(r => r.name === '@everyone');

  async function getOrCreateRole(name, color, hoist = true) {
    if (roleMap.has(name)) {
      console.log(`   ↪ Rôle déjà existant : ${name}`);
      return roleMap.get(name);
    }
    console.log(`   ➕ Création du rôle : ${name}`);
    const newRole = await discordFetch(`/guilds/${guildId}/roles`, token, {
      method: 'POST',
      body: JSON.stringify({ name, color, hoist, mentionable: true }),
    });
    roleMap.set(name, newRole);
    return newRole;
  }

  const roleAdmin = await getOrCreateRole('👑 Fondateur / Admin', COLORS.BLUE_ELECTRIC, true);
  const roleMod = await getOrCreateRole('🛡️ Modérateur', COLORS.CYAN, true);
  const roleVip = await getOrCreateRole('💎 Membre VIP', COLORS.GOLD_VIP, true);
  const roleMembre = await getOrCreateRole('🍿 Membre', COLORS.DARK_BLUE, false);

  // 2. Récupération des salons existants
  console.log('\n📁 [2/5] Gestion des Catégories & Salons...');
  const existingChannels = await discordFetch(`/guilds/${guildId}/channels`, token);
  const channelMap = new Map(existingChannels.map(c => [c.name, c]));

  async function getOrCreateCategory(name, permissionOverwrites = []) {
    if (channelMap.has(name) && channelMap.get(name).type === 4) {
      console.log(`   ↪ Catégorie déjà existante : ${name}`);
      return channelMap.get(name);
    }
    console.log(`   📁 Création catégorie : ${name}`);
    const cat = await discordFetch(`/guilds/${guildId}/channels`, token, {
      method: 'POST',
      body: JSON.stringify({
        name,
        type: 4, // GUILD_CATEGORY
        permission_overwrites: permissionOverwrites,
      }),
    });
    channelMap.set(name, cat);
    return cat;
  }

  async function getOrCreateChannel(name, type, parentId, permissionOverwrites = []) {
    if (channelMap.has(name)) {
      console.log(`   ↪ Salon déjà existant : #${name}`);
      return channelMap.get(name);
    }
    console.log(`   #️⃣ Création salon : #${name}`);
    const payload = {
      name,
      type, // 0 = text, 2 = voice
      parent_id: parentId,
    };
    if (permissionOverwrites && permissionOverwrites.length > 0) {
      payload.permission_overwrites = permissionOverwrites;
    }
    const ch = await discordFetch(`/guilds/${guildId}/channels`, token, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    channelMap.set(name, ch);
    return ch;
  }

  // --- Catégorie 1 : INFORMATIONS ---
  const catInfos = await getOrCreateCategory('📌 INFORMATIONS');
  const readOnlyPerms = [
    {
      id: everyoneRole.id,
      type: 0, // Role
      allow: PERMS.VIEW_CHANNEL.toString(),
      deny: PERMS.SEND_MESSAGES.toString(),
    },
  ];

  const chReglement = await getOrCreateChannel('📜・règlement', 0, catInfos.id, readOnlyPerms);
  const chAnnonces = await getOrCreateChannel('📢・annonces', 0, catInfos.id, readOnlyPerms);
  const chLiens = await getOrCreateChannel('🌐・liens-officiels', 0, catInfos.id, readOnlyPerms);

  // --- Catégorie 2 : ESPACE VIP (10€/AN) ---
  const catVip = await getOrCreateCategory('💎 ESPACE VIP (10€/AN)');
  const chObtenirVip = await getOrCreateChannel('💎・obtenir-vip', 0, catVip.id, readOnlyPerms);
  const chOuvrirTicket = await getOrCreateChannel('🎫・ouvrir-ticket', 0, catVip.id, readOnlyPerms);
  const chAvis = await getOrCreateChannel('⭐・avis-clients', 0, catVip.id);

  // --- Catégorie 3 : COMMUNAUTÉ ---
  const catCommu = await getOrCreateCategory('🎬 COMMUNAUTÉ');
  await getOrCreateChannel('💬・général', 0, catCommu.id);
  await getOrCreateChannel('🍿・demandes-films', 0, catCommu.id);
  await getOrCreateChannel('💡・suggestions-bugs', 0, catCommu.id);
  await getOrCreateChannel('🔊・salon-vocal', 2, catCommu.id);

  // --- Catégorie 4 : CLUB PRIVÉ VIP ---
  const vipCategoryPerms = [
    {
      id: everyoneRole.id,
      type: 0,
      allow: '0',
      deny: PERMS.VIEW_CHANNEL.toString(), // Caché pour @everyone
    },
    {
      id: roleVip.id,
      type: 0,
      allow: (PERMS.VIEW_CHANNEL | PERMS.SEND_MESSAGES).toString(), // Visible et ouvert pour @VIP
      deny: '0',
    },
  ];

  const catClubVip = await getOrCreateCategory('👑 CLUB PRIVÉ VIP', vipCategoryPerms);
  await getOrCreateChannel('🥂・vip-lounge', 0, catClubVip.id);
  await getOrCreateChannel('💎・vip-vocal', 2, catClubVip.id);

  // 3. Envoi des messages modèles
  console.log('\n📝 [3/5] Publication des messages modèles...');

  async function sendMessageWithBotOverwrite(channelId, content) {
    const messages = await discordFetch(`/channels/${channelId}/messages?limit=1`, token);
    if (messages && messages.length > 0) {
      console.log(`   ↪ Salon déjà alimenté, message préservé.`);
      return;
    }
    // Donner la permission temporaire au bot pour poster dans les salons en lecture seule
    await discordFetch(`/channels/${channelId}/permissions/${me.id}`, token, {
      method: 'PUT',
      body: JSON.stringify({ type: 1, allow: PERMS.SEND_MESSAGES.toString(), deny: '0' }),
    }).catch(() => {});

    console.log(`   ✉️ Envoi du message officiel...`);
    await discordFetch(`/channels/${channelId}/messages`, token, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  // Publication des 3 messages officiels
  await sendMessageWithBotOverwrite(chReglement.id, `# 📜 RÈGLEMENT OFFICIEL DU SERVEUR ORVIX

Bienvenue sur le serveur officiel d'**Orvix** ! Afin de maintenir une communauté agréable et respectueuse, merci de respecter ces quelques règles simples :

1. 🤝 **Respect & Courtoisie** : Aucun propos haineux, raciste, insultant ou toxique ne sera toléré.
2. 🚫 **Pas de Publicité ni d'Autopromo** : Tout partage de lien externe, serveur Discord ou contenu publicitaire sans autorisation sera sanctionné par un bannissement immédiat.
3. 🔒 **Sécurité Anti-Arnaque (Règle d'or)** : L'administration d'Orvix ne vous enverra **JAMAIS** de message privé en premier pour vous vendre quoi que ce soit. Toutes les transactions de clés VIP se déroulent **exclusivement via le salon <#${chOuvrirTicket.id}>**.
4. 🍿 **Demandes de Contenus** : Merci d'utiliser le salon <#${chAvis.id}> pour vos requêtes et d'éviter de spammer l'équipe en messages privés.

*En restant sur ce serveur, vous acceptez pleinement ce règlement.*`);

  await sendMessageWithBotOverwrite(chLiens.id, `# 🌐 LIENS OFFICIELS ORVIX

Conservez ce salon en favori pour toujours retrouver l'accès officiel au site :

- 🎬 **Site Web Officiel** : *[En cours de déploiement Serv00]*
- 💬 **Discord Officiel** : https://discord.gg/vjt4PRAMBR
- 👑 **Page d'Activation VIP** : */vip sur le site web*

⚠️ *Attention aux faux sites : nous ne vous demanderons jamais votre mot de passe personnel.*`);

  await sendMessageWithBotOverwrite(chObtenirVip.id, `# 👑 DEVENEZ MEMBRE VIP ORVIX — 10€ / AN

Rejoignez le club privilégié d'Orvix et profitez de l'expérience cinéma ultime sans aucune contrainte !

---

### ✨ Vos Avantages Exclusifs :
- 🚫 **Zéro Publicité** : Aucune popup, aucune bannière, pas de redirection. Lecture 100% instantanée.
- ⚡ **Lecteur Débridé Haute Vitesse** : Accès direct aux flux haute définition 1080p et 4K sans aucun buffering.
- 📱 **Multi-Écrans (2 Appareils)** : Utilisez votre clé simultanément sur votre PC, TV, tablette ou smartphone.
- 👑 **Rôle Exclusif <@&${roleVip.id}>** : Accès au salon privé et priorité maximale sur vos demandes de films et séries.
- 🛡️ **Clé Cryptographique Personnelle** : Licences valables 365 jours complets avec support VIP garanti.

---

### 💳 Comment commander votre clé VIP ?
1. Rendez-vous dans le salon <#${chOuvrirTicket.id}>.
2. Cliquez sur le bouton de commande de ticket.
3. Un salon privé secret s'ouvre avec l'administrateur.
4. Effectuez votre règlement (PayPal, Crypto, etc.) et recevez immédiatement votre code sous le format \`ORVIX-VIP-XXXX-XXXX-XXXX\` !`);

  // 4. Nettoyage des salons par défaut si présents
  console.log('\n🧹 [4/5] Nettoyage des salons résiduels par défaut...');
  const refreshedChannels = await discordFetch(`/guilds/${guildId}/channels`, token);
  for (const ch of refreshedChannels) {
    if (ch.name === 'Salons textuels' || ch.name === 'Salons vocaux' || (ch.name === 'général' && !ch.name.includes('💬'))) {
      console.log(`   🗑️ Suppression de l'ancien salon : "${ch.name}"`);
      await discordFetch(`/channels/${ch.id}`, token, { method: 'DELETE' }).catch(() => {});
    }
  }

  console.log('\n======================================================');
  console.log('🎉 FÉLICITATIONS ! VOTRE SERVEUR DISCORD EST 100% PRÊT !');
  console.log('======================================================');
  console.log('👉 Rôles créés et hiérarchisés');
  console.log('👉 Catégories et salons créés avec permissions étanches');
  console.log('👉 Messages de bienvenue et d\'achat VIP publiés');
  console.log('\nIl ne vous reste plus qu\'à inviter Ticket Tool sur tickettool.xyz pour activer le bouton dans #🎫・ouvrir-ticket !\n');
}

main().catch((err) => {
  console.error('\n❌ Erreur fatale lors du provisionnement Discord :', err.message);
  process.exit(1);
});
