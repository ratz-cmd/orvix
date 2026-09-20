/**
 * vipUtils.ts - Service centralisé et cryptographiquement sécurisé de licence VIP Orvix
 * 
 * Sécurité anti-contournement :
 * 1. Exige un token cryptographique HMAC-SHA256 délivré par le serveur (`orvix_vip_token`)
 * 2. Un simple `localStorage.setItem('is_vip', 'true')` dans la console ne suffit PAS :
 *    l'absence de token signé révoque immédiatement le faux statut VIP.
 * 3. Liaison d'empreinte d'appareil anonyme (`orvix_device_seed`).
 * 4. Contrôle périodique avec le serveur /api/vip/verify.
 */

const MAIN_API = import.meta.env.VITE_MAIN_API || 'http://localhost:25565';

// Intervalle de vérification : toutes les 10 minutes
const VIP_CHECK_INTERVAL = 10 * 60 * 1000;

// Cache local pour éviter de spammer le serveur
let lastCheckTime = 0;
let lastCheckResult: boolean | null = null;
let checkInProgress: Promise<boolean> | null = null;

/**
 * Récupère ou initialise un identifiant d'appareil anonyme persistant
 */
export function getDeviceSeed(): string {
  try {
    let seed = localStorage.getItem('orvix_device_seed');
    if (!seed || seed.trim() === '') {
      seed = 'dev_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now().toString(36);
      localStorage.setItem('orvix_device_seed', seed);
    }
    return seed;
  } catch {
    return 'dev_fallback_' + Date.now();
  }
}

/**
 * Récupère le token cryptographique VIP stocké
 */
export function getVipToken(): string | null {
  try {
    return localStorage.getItem('orvix_vip_token') || null;
  } catch {
    return null;
  }
}

/**
 * Récupère la clé d'accès brute
 */
export function getAccessKey(): string | null {
  try {
    return localStorage.getItem('access_code') || null;
  } catch {
    return null;
  }
}

/**
 * Active une clé de licence VIP auprès du backend Orvix
 */
export async function activateVipKey(keyCode: string): Promise<{
  success: boolean;
  message: string;
  expiresAt?: string;
  remainingDays?: number;
}> {
  if (!keyCode || keyCode.trim() === '') {
    return {
      success: false,
      message: 'Veuillez renseigner une clé VIP valide',
    };
  }

  try {
    const deviceSeed = getDeviceSeed();
    const response = await fetch(`${MAIN_API}/api/vip/activate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        key: keyCode.trim().toUpperCase(),
        deviceSeed,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      return {
        success: false,
        message: data.error || "Impossible d'activer la clé VIP",
      };
    }

    // Sauvegarde sécurisée du token signé et des métadonnées
    localStorage.setItem('orvix_vip_token', data.token);
    localStorage.setItem('access_code', data.key);
    if (data.expiresAt) {
      localStorage.setItem('access_code_expires', data.expiresAt);
    }
    localStorage.setItem('is_vip', 'true');

    lastCheckTime = Date.now();
    lastCheckResult = true;

    // Notifier tous les contextes et composants réactifs
    window.dispatchEvent(new Event('storage'));
    window.dispatchEvent(new CustomEvent('vipStatusChanged', { detail: { vip: true } }));

    return {
      success: true,
      message: data.message || 'Licence VIP activée avec succès !',
      expiresAt: data.expiresAt,
      remainingDays: data.remainingDays,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || 'Erreur réseau lors de la communication avec le serveur Orvix',
    };
  }
}

/**
 * Vérifie côté serveur si le token VIP est authentique et valide.
 * Cache le résultat pendant 10 minutes.
 */
export async function checkVipStatus(force = false): Promise<boolean> {
  const token = getVipToken();

  // Aucun token cryptographique = PAS VIP (anti-console bypass)
  if (!token) {
    if (localStorage.getItem('is_vip') === 'true') {
      revokeVipStatus();
    }
    return false;
  }

  // Vérification de la date d'expiration locale
  const expires = localStorage.getItem('access_code_expires');
  if (expires && expires !== 'never') {
    const expDate = new Date(expires);
    if (!isNaN(expDate.getTime()) && Date.now() > expDate.getTime()) {
      revokeVipStatus();
      return false;
    }
  }

  // Vérifier le cache en mémoire (sauf si forcé)
  const now = Date.now();
  if (!force && lastCheckResult !== null && (now - lastCheckTime < VIP_CHECK_INTERVAL)) {
    return lastCheckResult;
  }

  // Éviter les requêtes concurrentes simultanées
  if (checkInProgress) {
    return checkInProgress;
  }

  checkInProgress = _performTokenCheck(token);
  try {
    const result = await checkInProgress;
    return result;
  } finally {
    checkInProgress = null;
  }
}

/**
 * Requête de validation cryptographique vers /api/vip/verify
 */
async function _performTokenCheck(token: string): Promise<boolean> {
  try {
    const deviceSeed = getDeviceSeed();
    const response = await fetch(`${MAIN_API}/api/vip/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token,
        deviceSeed,
      }),
    });

    if (!response.ok) {
      console.warn('[VIP] Erreur de vérification serveur, conservation temporaire du statut');
      return lastCheckResult ?? (localStorage.getItem('is_vip') === 'true');
    }

    const data = await response.json();
    const isValid = data.success === true && data.valid === true;

    lastCheckTime = Date.now();
    lastCheckResult = isValid;

    if (isValid) {
      if (data.expiresAt) {
        localStorage.setItem('access_code_expires', data.expiresAt);
      }
      if (localStorage.getItem('is_vip') !== 'true') {
        localStorage.setItem('is_vip', 'true');
        window.dispatchEvent(new Event('storage'));
        window.dispatchEvent(new CustomEvent('vipStatusChanged', { detail: { vip: true } }));
      }
      return true;
    } else {
      console.warn('[VIP] Token VIP rejeté par le serveur:', data.reason || 'invalide');
      revokeVipStatus();
      return false;
    }
  } catch (error) {
    console.warn('[VIP] Erreur réseau lors de la vérification:', error);
    return lastCheckResult ?? (localStorage.getItem('is_vip') === 'true');
  }
}

/**
 * Révoque l'ensemble du statut VIP local
 */
export function revokeVipStatus(): void {
  try {
    localStorage.removeItem('is_vip');
    localStorage.removeItem('access_code');
    localStorage.removeItem('access_code_expires');
    localStorage.removeItem('orvix_vip_token');
  } catch {}

  lastCheckResult = false;
  lastCheckTime = Date.now();

  window.dispatchEvent(new Event('storage'));
  window.dispatchEvent(new CustomEvent('vipStatusChanged', { detail: { vip: false } }));
}

/**
 * Vérifie si l'utilisateur est VIP de façon synchrone et sécurisée.
 * Détecte les tentatives de contournement par console F12.
 */
export function isUserVip(): boolean {
  // SÉCURITÉ ANTI-CONSOLE :
  // Si quelqu'un met `localStorage.setItem('is_vip', 'true')` dans la console
  // sans posséder de token HMAC serveur valide, on refuse et on révoque !
  const token = getVipToken();
  if (!token) {
    if (localStorage.getItem('is_vip') === 'true') {
      revokeVipStatus();
    }
    return false;
  }

  // Vérifier l'expiration locale
  const expires = localStorage.getItem('access_code_expires');
  if (expires && expires !== 'never') {
    const expDate = new Date(expires);
    if (!isNaN(expDate.getTime()) && Date.now() > expDate.getTime()) {
      revokeVipStatus();
      return false;
    }
  }

  // Lancer une vérification serveur en arrière-plan si le cache est expiré
  const now = Date.now();
  if (now - lastCheckTime > VIP_CHECK_INTERVAL) {
    checkVipStatus().catch(() => {});
  }

  return true;
}

/**
 * Récupère les détails formatés de l'accès VIP actuel
 */
export function getVipDetails(): {
  isVip: boolean;
  expiresAt: string | null;
  remainingDays: number | null;
  key: string | null;
} {
  const vip = isUserVip();
  if (!vip) {
    return {
      isVip: false,
      expiresAt: null,
      remainingDays: null,
      key: null,
    };
  }

  const key = getAccessKey();
  const expires = localStorage.getItem('access_code_expires');
  let remainingDays: number | null = null;

  if (expires && expires !== 'never') {
    const expDate = new Date(expires);
    if (!isNaN(expDate.getTime())) {
      remainingDays = Math.max(0, Math.ceil((expDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
    }
  }

  return {
    isVip: true,
    expiresAt: expires,
    remainingDays,
    key,
  };
}

/**
 * Retourne les headers VIP pour les requêtes API
 */
export function getVipHeaders(): Record<string, string> {
  const token = getVipToken();
  const deviceSeed = getDeviceSeed();
  const headers: Record<string, string> = {};

  if (token) {
    headers['x-vip-token'] = token;
    headers['x-device-seed'] = deviceSeed;
  }
  const key = getAccessKey();
  if (key) {
    headers['x-access-key'] = key;
  }

  return headers;
}

/**
 * Démarre la vérification automatique périodique du VIP
 */
let intervalId: ReturnType<typeof setInterval> | null = null;

export function startVipVerification(): void {
  if (getVipToken()) {
    checkVipStatus(true).catch(() => {});
  }

  if (intervalId) clearInterval(intervalId);

  intervalId = setInterval(() => {
    if (getVipToken()) {
      checkVipStatus().catch(() => {});
    }
  }, VIP_CHECK_INTERVAL);
}

export function stopVipVerification(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
