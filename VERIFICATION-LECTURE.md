# Vérifier la lecture — protocole en 10 minutes

Ce document sert à contrôler, sur votre machine, ce qui a été mis en place pour
la lecture. Chaque étape dit **quoi faire**, **ce qu'on doit voir**, et **quoi
faire si ça ne se produit pas**.

---

## 0. Préparer le site en local

```bash
npm install
cp .env.example .env          # puis renseigner VITE_SITE_URL et VITE_MAIN_API
npm run dev                   # http://localhost:5173
```

Le backend (`API/Mainapi`) doit tourner pour l'extraction sans extension :

```bash
cd API/Mainapi && npm install && npm start
```

> Sans backend ni extension, la bascule « sans publicité » ne peut pas extraire
> le flux : le lecteur tiers reste affiché. C'est le comportement prévu, pas une
> panne.

---

## 1. La qualité ne tombe plus en 340p

1. Ouvrir un film, choisir une source HLS (Vidmoly, Voe, Darkino…).
2. Laisser le lecteur démarrer.
3. Ouvrir le menu **Qualité** du lecteur.

**Attendu** : la qualité affichée est 720p ou 1080p quand la source les propose
— jamais 240p/340p — et le menu liste les pistes réellement présentes.

**Si la source entière est de mauvaise qualité** : un bandeau ambre apparaît en
haut du lecteur (« Qualité limitée par la source ») avec le plafond constaté.
C'est le signal qu'il faut choisir une autre source : le lecteur ne peut pas
inventer des pixels absents.

*Astuce* : dans la console du navigateur, `window.__orvixUpscale` (voir § 2)
n'existe qu'après activation de la Super Résolution — utile pour distinguer les
deux mécanismes.

---

## 2. Super Résolution 2K (VIP, PC)

**Prérequis** : un accès VIP actif sur ce navigateur, et un ordinateur (le
traitement est refusé sur mobile, où il n'y a pas de budget GPU).

1. Ouvrir **Réglages du lecteur › Super Résolution (PC)**.
2. Choisir **Standard (1440p + netteté CAS)**.
3. Lancer une vidéo 1080p.

**Attendu** :
- un badge ambre **« 2K VIP »** apparaît en haut à droite du lecteur ;
- l'image est plus nette qu'en mode « Désactivé » (basculer plusieurs fois pour
  comparer) ;
- dans les informations du lecteur, la ligne Super Résolution indique
  `2560 × 1440` (ou la taille réellement rendue si votre écran est plus petit).

**Comment vérifier que ça tourne sur VOTRE PC et pas sur le serveur** :

1. Ouvrir l'onglet **Réseau** des outils développeur, filtrer sur `m3u8`.
2. Vous ne devez voir que les segments venant du CDN de l'hébergeur ou de
   `api.orvix.fr/api/extract/stream` — **jamais** de trafic vidéo vers un
   service de transcodage.
3. Côté serveur, la charge CPU doit rester plate pendant la lecture.

**Si l'image saccade** : le lecteur baisse automatiquement la cible et affiche
un message (« GPU un peu juste… »). L'image redevient nette, sans surcoût : rien
à faire.

**Si votre navigateur n'a pas de WebGL** (vieux matériel, accélération
désactivée) : le lecteur retombe sur l'ancien filtre de netteté et le signale.

---

## 3. SeekStream (et autres lecteurs tiers) sans publicité

1. Ouvrir un film qui expose une source **SeekStreaming** (ou Voe, Uqload,
   Vidmoly, Sibnet, Doodstream, LuluStream, Veev, Vidara).
2. La sélectionner.

**Attendu** :
- un message « Suppression des publicités SeekStreaming… » ;
- puis un toast vert **« Publicités supprimées — lecture via le lecteur Orvix »**
  et une lecture **dans le lecteur Orvix**, sans iframe, sans publicité ;
- les autres pistes du flux apparaissent comme sources supplémentaires dans le
  menu des sources.

**Si le CDN refuse le CORS** : le toast précise « via le relais sécurisé
d'Orvix ». La lecture fonctionne, mais elle consomme la bande passante de votre
serveur. Le bouton **« Couper le relais »** du toast (ou la préférence
`orvix_stream_relay`) force le retour au lecteur tiers pour ces sources.

**Si l'extraction échoue** : rien ne se casse — le lecteur tiers reste affiché.
Le diagnostic est dans la console : `[ON-THE-FLY] …` avec la raison exacte
(CORS refusé, 403, timeout, hébergeur non reconnu).

---

## 4. Réglages serveur à connaître

| Variable | Rôle | Défaut |
| --- | --- | --- |
| `MEDIA_SIGNING_SECRET` | signe les URLs de relais (obligatoire en production : sinon l'endpoint est un proxy ouvert, un avertissement est journalisé au démarrage) | vide |
| `ORVIX_RELAY_MAX_STREAMS` | nombre de flux relayés simultanément ; au-delà, réponse 503 et le client garde le lecteur tiers | 8 |
| `ORVIX_EXTRACTORS_PATH` | emplacement de `extension/Chrome/extractors.js` si le backend est déployé sans le dépôt web | détecté automatiquement |

**Recommandation** : publier `extension/` à côté de `API/` dans le déploiement,
sinon l'extraction « sans publicité » est silencieusement indisponible pour les
visiteurs sans extension.

---

## 5. Ce qui reste à valider par vous

- Le rendu du mode Ultra sur un vrai écran 1440p/4K (le ressenti de netteté
  dépend du contenu et de l'écran : la force d'accentuation est réglable).
- Le comportement sur un épisode de série enchaîné (bascule d'épisode pendant
  la Super Résolution).
- La charge réelle de votre instance pendant 3-4 lectures simultanées
  (le plafond `ORVIX_RELAY_MAX_STREAMS` est le bouton de réglage).
