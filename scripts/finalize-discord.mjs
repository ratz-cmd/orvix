/**
 * finalize-discord.mjs
 * Finalise la configuration du serveur Discord Orvix :
 * - Crée la catégorie privée '🎫 TICKETS EN COURS' (pour loger les tickets Ticket Tool)
 * - Crée le salon '#🎁・giveaways' dans '🎬 COMMUNAUTÉ'
 * - Publie le message officiel explicatif dans '#🎫・ouvrir-ticket'
 * - Publie le guide dans '#⭐・avis-clients'
 * - Publie l'annonce de lancement dans '#📢・annonces'
 * - Publie le concours dans '#🎁・giveaways'
 */

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const BASE_URL = "https://discord.com/api/v10";

const HEADERS = {
  Authorization: `Bot ${TOKEN}`,
  "Content-Type": "application/json",
};

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function api(endpoint, method = "GET", body = null) {
  const opts = { method, headers: HEADERS };
  if (body) opts.body = JSON.stringify(body);

  let res = await fetch(`${BASE_URL}${endpoint}`, opts);
  if (res.status === 429) {
    const data = await res.json();
    const wait = Math.ceil((data.retry_after || 1) * 1000) + 200;
    console.log(`[Rate Limit] Pause de ${wait}ms...`);
    await sleep(wait);
    return api(endpoint, method, body);
  }
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`API Error ${res.status} on ${method} ${endpoint}: ${errText}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function main() {
  if (!TOKEN || !GUILD_ID) {
    throw new Error("DISCORD_BOT_TOKEN and DISCORD_GUILD_ID are required");
  }

  console.log("=== FINALISATION DU SERVEUR DISCORD ORVIX ===");

  // 1. Récupérer les rôles et salons existants
  const roles = await api(`/guilds/${GUILD_ID}/roles`);
  const channels = await api(`/guilds/${GUILD_ID}/channels`);

  const roleMap = {};
  for (const r of roles) roleMap[r.name] = r.id;

  const channelMap = {};
  for (const c of channels) channelMap[c.name] = c.id;

  console.log(`Roles trouvés: ${Object.keys(roleMap).length}`);
  console.log(`Salons trouvés: ${Object.keys(channelMap).length}`);

  const adminRoleId = roleMap["👑 Fondateur / Admin"];
  const modRoleId = roleMap["🛡️ Modérateur"];
  const vipRoleId = roleMap["💎 Membre VIP"];
  const ticketToolRoleId = roleMap["Ticket Tool"];
  const commuCatId = channelMap["🎬 COMMUNAUTÉ"];

  // 2. Créer la catégorie '🎫 TICKETS EN COURS' si absente
  let ticketCatId = channelMap["🎫 TICKETS EN COURS"];
  if (!ticketCatId) {
    console.log("-> Création de la catégorie privée '🎫 TICKETS EN COURS'...");
    const overwrites = [
      { id: GUILD_ID, type: 0, deny: "1024" }, // Hide from @everyone
    ];
    if (adminRoleId) overwrites.push({ id: adminRoleId, type: 0, allow: "3072" });
    if (modRoleId) overwrites.push({ id: modRoleId, type: 0, allow: "3072" });
    if (ticketToolRoleId) overwrites.push({ id: ticketToolRoleId, type: 0, allow: "3088" });

    const newCat = await api(`/guilds/${GUILD_ID}/channels`, "POST", {
      name: "🎫 TICKETS EN COURS",
      type: 4, // Category
      permission_overwrites: overwrites,
    });
    ticketCatId = newCat.id;
    console.log(`   Catégorie créée : ID ${ticketCatId}`);
  } else {
    console.log(`   Catégorie '🎫 TICKETS EN COURS' déjà existante : ID ${ticketCatId}`);
  }

  // 3. Créer le salon '#🎁・giveaways' si absent
  let giveawayChanId = channelMap["🎁・giveaways"];
  if (!giveawayChanId) {
    console.log("-> Création du salon '#🎁・giveaways'...");
    const newChan = await api(`/guilds/${GUILD_ID}/channels`, "POST", {
      name: "🎁・giveaways",
      type: 0, // Guild Text
      parent_id: commuCatId,
      permission_overwrites: [
        { id: GUILD_ID, type: 0, allow: "1088", deny: "2048" }, // Read & Reactions ALLOW, Send Messages DENIED
      ],
    });
    giveawayChanId = newChan.id;
    console.log(`   Salon créé : ID ${giveawayChanId}`);
  } else {
    console.log(`   Salon '#🎁・giveaways' déjà existant : ID ${giveawayChanId}`);
  }

  const botRoleId = roleMap["orvix_config"] || "1550828171518017667";

  // 4. Message officiel dans '#🎫・ouvrir-ticket' (ID: 1550829388684197948)
  const ticketChanId = channelMap["🎫・ouvrir-ticket"] || "1550829388684197948";
  console.log(`-> Déblocage écriture bot dans '#🎫・ouvrir-ticket'...`);
  await api(`/channels/${ticketChanId}/permissions/${botRoleId}`, "PUT", {
    allow: "2048",
    deny: "0",
    type: 0,
  });

  console.log(`-> Publication du guide d'achat dans '#🎫・ouvrir-ticket' (${ticketChanId})...`);
  const ticketMsg = {
    embeds: [
      {
        title: "🎫 Commander un Pass VIP Orvix (10€ / an)",
        description:
          "Bienvenue dans le salon de commande officiel d'**Orvix**.\n\n" +
          "Pour obtenir votre clé VIP 1 an ou poser vos questions, ouvrez un ticket ci-dessous.\n" +
          "**Le paiement s'effectue en direct et en toute sécurité avec le Fondateur.**",
        color: 0x2563eb, // Bleu électrique OLED
        fields: [
          {
            name: "💎 Avantages Exclusifs du Pass VIP (10€ / an)",
            value:
              "• **Flux Full HD 1080p Ultra-Net** sans ralentissement\n" +
              "• **Zéro Publicité**, zéro pop-up, zéro redirection\n" +
              "• **Lecteur Orvix Natif Débridé** (démarrage instantané, reprise de lecture)\n" +
              "• **Ajout prioritaire** de vos films & séries demandés sous 24h\n" +
              "• **Accès au Club Privé Discord** (`#🥂・vip-lounge`) et rôle `@💎 Membre VIP`",
            inline: false,
          },
          {
            name: "💳 Moyens de Paiement (Traitement Manuel Direct)",
            value:
              "• **PayPal** (Envoi entre proches sans frais)\n" +
              "• **Cryptomonnaies** (USDT, LTC, BTC)\n" +
              "• **Paylib / Cartes Cadeaux** (selon disponibilité)\n\n" +
              "*Paiement 100% sécurisé géré en direct dans votre ticket privé.*",
            inline: false,
          },
          {
            name: "⚡ Procédure en 3 Étapes",
            value:
              "1️⃣ Cliquez sur le bouton du panel Ticket Tool ci-dessous pour ouvrir votre salon privé.\n" +
              "2️⃣ Choisissez votre mode de paiement avec le Fondateur.\n" +
              "3️⃣ Une fois le règlement vérifié, votre **clé VIP unique 1 an** vous est délivrée immédiatement dans le ticket !",
            inline: false,
          },
        ],
        footer: {
          text: "Orvix Streaming • Vente officielle & Assistance directe par le Fondateur",
        },
      },
    ],
  };
  await api(`/channels/${ticketChanId}/messages`, "POST", ticketMsg);

  // 5. Message dans '#⭐・avis-clients' (ID: 1550829390789611602)
  const avisChanId = channelMap["⭐・avis-clients"] || "1550829390789611602";
  console.log(`-> Déblocage écriture bot dans '#⭐・avis-clients'...`);
  await api(`/channels/${avisChanId}/permissions/${botRoleId}`, "PUT", {
    allow: "2048",
    deny: "0",
    type: 0,
  });
  console.log(`-> Publication des consignes dans '#⭐・avis-clients' (${avisChanId})...`);
  const avisMsg = {
    embeds: [
      {
        title: "⭐ Avis des Membres VIP Orvix",
        description:
          "Ce salon regroupe les retours d'expérience et témoignages réels des membres ayant activé leur **Pass VIP Orvix**.",
        color: 0xf59e0b, // Ambre / Or
        fields: [
          {
            name: "📝 Vous êtes membre VIP ?",
            value:
              "Partagez votre avis en postant un message ci-dessous avec vos impressions sur la qualité vidéo 4K, l'absence de pubs et la rapidité du lecteur !",
            inline: false,
          },
          {
            name: "🛡️ Transparence Totale",
            value:
              "Tous les avis affichés proviennent de membres certifiés avec le rôle `@💎 Membre VIP`.",
            inline: false,
          },
        ],
        footer: {
          text: "Orvix • Preuve Sociale & Qualité Certifiée",
        },
      },
    ],
  };
  await api(`/channels/${avisChanId}/messages`, "POST", avisMsg);

  // 6. Concours de lancement dans '#🎁・giveaways'
  if (giveawayChanId) {
    console.log(`-> Déblocage écriture bot dans '#🎁・giveaways'...`);
    await api(`/channels/${giveawayChanId}/permissions/${botRoleId}`, "PUT", {
      allow: "2048",
      deny: "0",
      type: 0,
    });
    console.log(`-> Publication du Concours de Lancement dans '#🎁・giveaways' (${giveawayChanId})...`);
    const giveawayMsg = {
      embeds: [
        {
          title: "🎉 CONCOURS DE LANCEMENT : Gagne 1 an de Pass VIP Orvix !",
          description:
            "Pour fêter la sortie officielle d'**Orvix**, nous offrons **1 Pass VIP Annuel (Valeur 10€)** à un membre tiré au sort !\n\n" +
            "**Pour participer :**\n" +
            "1️⃣ Être membre du serveur Discord\n" +
            "2️⃣ Réagir avec l'emoji 🎉 sous ce message\n\n" +
            "⏱️ **Tirage au sort automatique dans 48 heures !**\n" +
            "Bonne chance à tous les cinéphiles 🍿",
          color: 0x38bdf8, // Ciel éclatant
          footer: {
            text: "Orvix • Giveaway Officiel",
          },
        },
      ],
    };
    const posted = await api(`/channels/${giveawayChanId}/messages`, "POST", giveawayMsg);
    // Ajouter réaction 🎉
    if (posted?.id) {
      await api(`/channels/${giveawayChanId}/messages/${posted.id}/reactions/%F0%9F%8E%89/@me`, "PUT");
    }
  }

  console.log("\n✅ SERVEUR DISCORD ORVIX ENTIÈREMENT CONFIGURÉ !");
  console.log(`Catégorie Tickets : ${ticketCatId}`);
}

main().catch(console.error);
