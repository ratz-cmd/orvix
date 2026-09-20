#!/usr/bin/env bash

# =============================================================
# vip.sh - Lanceur Rapide du Panneau d'Administration VIP Orvix
# =============================================================
# Usage :
#   ./vip.sh
#   bash vip.sh
# 
# Fonctionne aussi bien sur votre machine locale qu'en direct sur un
# serveur VPS hébergé en production (via connexion SSH).
# =============================================================

# Se positionner toujours dans le dossier racine du projet
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
cd "$PROJECT_DIR" || exit 1

# Vérification de la présence de Node.js
if ! command -v node >/dev/null 2>&1; then
    echo "❌ Erreur : Node.js n'est pas détecté sur cette machine."
    echo "Veuillez installer Node.js pour exécuter le panneau d'administration."
    exit 1
fi

# Lancement du menu interactif
exec node API/Mainapi/scripts/vip-menu.js
