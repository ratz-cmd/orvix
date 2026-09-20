/**
 * vipLicenseStore.js - Gestionnaire persistant et sécurisé des licences VIP Orvix
 * 
 * - Stockage autonome SQLite (data/vip_keys.sqlite)
 * - Signatures cryptographiques HMAC-SHA256 pour les tokens de session
 * - Liaison d'empreinte d'appareil (deviceSeed) avec limite (max 2 appareils par défaut)
 * - Requêtes paramétrées 100% sécurisées contre les injections SQL
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config();

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'vip_keys.sqlite');
const db = new Database(DB_PATH);

// Pragma pour performances et intégrité
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// Initialisation et migration sécurisée de la table des licences VIP
db.exec(`
  CREATE TABLE IF NOT EXISTS vip_licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_code TEXT UNIQUE NOT NULL,
    duration_days INTEGER NOT NULL DEFAULT 365,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT NOT NULL DEFAULT 'Admin',
    client_name TEXT NOT NULL DEFAULT 'Non assigné',
    price_eur REAL NOT NULL DEFAULT 10.0,
    activated_at TIMESTAMP DEFAULT NULL,
    expires_at TIMESTAMP DEFAULT NULL,
    devices TEXT NOT NULL DEFAULT '[]',
    max_devices INTEGER NOT NULL DEFAULT 2,
    status TEXT NOT NULL DEFAULT 'active',
    note TEXT DEFAULT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_vip_licenses_key_code ON vip_licenses(key_code);
  CREATE INDEX IF NOT EXISTS idx_vip_licenses_status ON vip_licenses(status);
`);

// Migration automatique non-destructive pour bases existantes
try {
  const tableColumns = db.prepare("PRAGMA table_info(vip_licenses)").all().map(c => c.name);
  if (!tableColumns.includes('created_by')) {
    db.exec("ALTER TABLE vip_licenses ADD COLUMN created_by TEXT NOT NULL DEFAULT 'Admin'");
  }
  if (!tableColumns.includes('client_name')) {
    db.exec("ALTER TABLE vip_licenses ADD COLUMN client_name TEXT NOT NULL DEFAULT 'Non assigné'");
  }
  if (!tableColumns.includes('price_eur')) {
    db.exec("ALTER TABLE vip_licenses ADD COLUMN price_eur REAL NOT NULL DEFAULT 10.0");
  }
  // Remplissage rétroactif des anciennes clés si client_name est vide
  db.exec(`
    UPDATE vip_licenses 
    SET client_name = CASE 
      WHEN note IS NOT NULL AND note != '' THEN note 
      ELSE 'Client Orvix #' || id 
    END 
    WHERE client_name = 'Non assigné' OR client_name IS NULL
  `);
} catch (e) {
  console.error('[vipLicenseStore] Migration warning:', e.message);
}

const SECRET = process.env.JWT_SECRET || 'orvix_vip_cryptographic_secret_key_2026_super_secure';

/**
 * Génère une clé formatée ORVIX-VIP-XXXX-XXXX-XXXX
 */
function generateKeyCode() {
  const bytes = crypto.randomBytes(6).toString('hex').toUpperCase();
  const chunk1 = bytes.slice(0, 4);
  const chunk2 = bytes.slice(4, 8);
  const chunk3 = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `ORVIX-VIP-${chunk1}-${chunk2}-${chunk3}`;
}

/**
 * Signe un payload pour produire un token VIP infalsifiable
 */
function signToken(payload) {
  const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', SECRET).update(b64Payload).digest('base64url');
  return `${b64Payload}.${signature}`;
}

/**
 * Vérifie l'authenticité et la validité d'un token VIP signé
 */
function verifyToken(token, deviceSeed = null) {
  if (!token || typeof token !== 'string') {
    return { valid: false, reason: 'missing_token' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, reason: 'malformed_token' };
  }

  const [b64Payload, receivedSig] = parts;
  const expectedSig = crypto.createHmac('sha256', SECRET).update(b64Payload).digest('base64url');

  // Vérification de signature en temps constant (anti-timing attack)
  try {
    const isSignatureValid = crypto.timingSafeEqual(
      Buffer.from(receivedSig),
      Buffer.from(expectedSig)
    );
    if (!isSignatureValid) {
      return { valid: false, reason: 'invalid_signature' };
    }
  } catch (_) {
    return { valid: false, reason: 'invalid_signature' };
  }

  // Décodage du payload
  let payload;
  try {
    payload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf8'));
  } catch (_) {
    return { valid: false, reason: 'invalid_payload' };
  }

  // Vérification de la date d'expiration
  if (!payload.exp || Date.now() > payload.exp) {
    return { valid: false, reason: 'token_expired', payload };
  }

  // Vérification de l'empreinte d'appareil si fournie
  if (deviceSeed && payload.deviceSeed && payload.deviceSeed !== deviceSeed) {
    return { valid: false, reason: 'device_mismatch', payload };
  }

  // Vérification en base que la clé n'a pas été révoquée
  try {
    const row = db.prepare('SELECT status, expires_at FROM vip_licenses WHERE key_code = ?').get(payload.key);
    if (!row || row.status !== 'active') {
      return { valid: false, reason: row ? `key_${row.status}` : 'key_not_found', payload };
    }

    if (row.expires_at) {
      const dbExpires = new Date(row.expires_at).getTime();
      if (Date.now() > dbExpires) {
        return { valid: false, reason: 'key_expired', payload };
      }
    }
  } catch (e) {
    console.error('[vipLicenseStore] DB check error in verifyToken:', e);
    // En cas d'erreur de lecture DB temporaire, la signature cryptographique fait foi
  }

  return {
    valid: true,
    payload,
    expiresAt: new Date(payload.exp).toISOString(),
    remainingDays: Math.max(0, Math.ceil((payload.exp - Date.now()) / (24 * 60 * 60 * 1000))),
  };
}

/**
 * Calcule dynamiquement la validité restante d'une clé VIP
 */
function computeValidity(row) {
  const now = Date.now();
  const isRevoked = row.status === 'revoked';

  if (isRevoked) {
    return {
      statusBadge: '🔴 RÉVOQUÉ',
      statusCode: 'revoked',
      remainingText: 'Révoquée par admin',
      remainingDays: 0,
      remainingHours: 0,
      isActive: false,
    };
  }

  // Clé pas encore activée par le client
  if (!row.activated_at || !row.expires_at) {
    return {
      statusBadge: '⏳ EN ATTENTE',
      statusCode: 'pending',
      remainingText: `Non activée (${row.duration_days} jours)`,
      remainingDays: row.duration_days,
      remainingHours: row.duration_days * 24,
      isActive: true,
    };
  }

  const expiresTime = new Date(row.expires_at).getTime();
  if (now > expiresTime) {
    return {
      statusBadge: '⚪ EXPIRÉ',
      statusCode: 'expired',
      remainingText: 'Licence expirée',
      remainingDays: 0,
      remainingHours: 0,
      isActive: false,
    };
  }

  const diffMs = expiresTime - now;
  const remainingDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const remainingHours = Math.floor((diffMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

  let timeString = '';
  if (remainingDays > 0) {
    timeString = `${remainingDays}j ${remainingHours}h restantes`;
  } else {
    const remainingMinutes = Math.floor((diffMs % (60 * 60 * 1000)) / (60 * 1000));
    timeString = `${remainingHours}h ${remainingMinutes}m restantes`;
  }

  return {
    statusBadge: '🟢 ACTIF',
    statusCode: 'active',
    remainingText: timeString,
    remainingDays,
    remainingHours,
    isActive: true,
  };
}

/**
 * Crée une nouvelle licence VIP (appelée par l'admin)
 */
function createLicenseKey({
  durationDays = 365,
  clientName = 'Non assigné',
  createdBy = 'Admin',
  priceEur = 10.0,
  note = null,
  maxDevices = 2,
} = {}) {
  const validDays = Math.max(1, parseInt(durationDays, 10) || 365);
  const validDevices = Math.max(1, parseInt(maxDevices, 10) || 2);
  const validPrice = Math.max(0, parseFloat(priceEur) || 10.0);
  const cleanClient = String(clientName || 'Non assigné').trim();
  const cleanCreatedBy = String(createdBy || 'Admin').trim();
  const cleanNote = note ? String(note).trim() : null;

  const keyCode = generateKeyCode();
  const stmt = db.prepare(`
    INSERT INTO vip_licenses (key_code, duration_days, client_name, created_by, price_eur, max_devices, note, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
  `);
  stmt.run(keyCode, validDays, cleanClient, cleanCreatedBy, validPrice, validDevices, cleanNote);

  return {
    keyCode,
    durationDays: validDays,
    clientName: cleanClient,
    createdBy: cleanCreatedBy,
    priceEur: validPrice,
    maxDevices: validDevices,
    note: cleanNote,
    status: 'active',
    createdAt: new Date().toISOString(),
  };
}

/**
 * Active une clé VIP pour un appareil donné
 */
function activateLicenseKey({ keyCode, deviceSeed }) {
  if (!keyCode || typeof keyCode !== 'string') {
    throw new Error('Code de licence VIP requis');
  }
  if (!deviceSeed || typeof deviceSeed !== 'string') {
    throw new Error('Identifiant d\'appareil (deviceSeed) requis');
  }

  const cleanKey = keyCode.trim().toUpperCase();
  const cleanSeed = deviceSeed.trim();

  const row = db.prepare('SELECT * FROM vip_licenses WHERE key_code = ?').get(cleanKey);
  if (!row) {
    throw new Error('Clé VIP introuvable ou invalide');
  }

  if (row.status === 'revoked') {
    throw new Error('Cette clé VIP a été révoquée par l\'administrateur');
  }

  let devices = [];
  try {
    devices = JSON.parse(row.devices || '[]');
  } catch (_) {
    devices = [];
  }

  const now = new Date();
  let expiresAt;

  // Première activation : on démarre le compte à rebours
  if (!row.activated_at) {
    expiresAt = new Date(now.getTime() + row.duration_days * 24 * 60 * 60 * 1000);
    devices.push(cleanSeed);

    db.prepare(`
      UPDATE vip_licenses
      SET activated_at = ?, expires_at = ?, devices = ?
      WHERE id = ?
    `).run(now.toISOString(), expiresAt.toISOString(), JSON.stringify(devices), row.id);
  } else {
    // Clé déjà activée auparavant
    expiresAt = new Date(row.expires_at);
    if (now.getTime() > expiresAt.getTime()) {
      db.prepare("UPDATE vip_licenses SET status = 'expired' WHERE id = ?").run(row.id);
      throw new Error('Cette clé VIP a expiré');
    }

    // Si cet appareil a déjà activé la clé, on autorise sans consommer de slot supplémentaire
    if (!devices.includes(cleanSeed)) {
      if (devices.length >= row.max_devices) {
        throw new Error(`Limite d'appareils atteinte pour cette clé (maximum ${row.max_devices} appareils). Contactez le support pour réinitialiser.`);
      }
      devices.push(cleanSeed);
      db.prepare('UPDATE vip_licenses SET devices = ? WHERE id = ?').run(JSON.stringify(devices), row.id);
    }
  }

  // Délivrance du token cryptographique infalsifiable
  const payload = {
    key: cleanKey,
    deviceSeed: cleanSeed,
    exp: expiresAt.getTime(),
    iat: now.getTime(),
    isVip: true,
  };

  const token = signToken(payload);
  const remainingDays = Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));

  return {
    success: true,
    key: cleanKey,
    token,
    expiresAt: expiresAt.toISOString(),
    remainingDays,
    devicesCount: devices.length,
    maxDevices: row.max_devices,
  };
}

/**
 * Réinitialise les appareils associés à une clé
 */
function resetLicenseDevices(keyCode) {
  const cleanKey = keyCode.trim().toUpperCase();
  const res = db.prepare("UPDATE vip_licenses SET devices = '[]' WHERE key_code = ?").run(cleanKey);
  return res.changes > 0;
}

/**
 * Révoque une clé
 */
function revokeLicenseKey(keyCode, reason = 'admin_revoke') {
  const cleanKey = keyCode.trim().toUpperCase();
  const res = db.prepare("UPDATE vip_licenses SET status = 'revoked', note = note || ' [Revoked: ' || ? || ']' WHERE key_code = ?").run(reason, cleanKey);
  return res.changes > 0;
}

/**
 * Récupère une clé par son code
 */
function getLicenseKey(keyCode) {
  const cleanKey = keyCode.trim().toUpperCase();
  const row = db.prepare('SELECT * FROM vip_licenses WHERE key_code = ?').get(cleanKey);
  if (!row) return null;

  const validity = computeValidity(row);
  let devices = [];
  try {
    devices = JSON.parse(row.devices || '[]');
  } catch (_) {}

  return {
    ...row,
    validity,
    devicesList: devices,
    devicesCount: devices.length,
  };
}

/**
 * Liste toutes les clés VIP avec calcul dynamique de validité restante
 */
function listLicenseKeys(options = 100) {
  let limit = 100;
  let search = null;
  let statusFilter = null;

  if (typeof options === 'number') {
    limit = options;
  } else if (typeof options === 'object' && options !== null) {
    limit = options.limit || 100;
    search = options.search || null;
    statusFilter = options.status || null;
  }

  let sql = 'SELECT * FROM vip_licenses WHERE 1=1';
  const params = [];

  if (search) {
    sql += ' AND (key_code LIKE ? OR client_name LIKE ? OR created_by LIKE ? OR note LIKE ?)';
    const query = `%${search}%`;
    params.push(query, query, query, query);
  }

  if (statusFilter) {
    sql += ' AND status = ?';
    params.push(statusFilter);
  }

  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params);

  return rows.map((row) => {
    const validity = computeValidity(row);
    let devices = [];
    try {
      devices = JSON.parse(row.devices || '[]');
    } catch (_) {}

    return {
      ...row,
      validity,
      devicesCount: devices.length,
    };
  });
}

/**
 * Récupère les statistiques globales des licences VIP
 */
function getDatabaseStats() {
  const allKeys = db.prepare('SELECT * FROM vip_licenses').all();
  let totalRevenue = 0;
  let activeCount = 0;
  let pendingCount = 0;
  let revokedCount = 0;
  let expiredCount = 0;

  allKeys.forEach((k) => {
    totalRevenue += (k.price_eur || 10.0);
    const v = computeValidity(k);
    if (v.statusCode === 'active') activeCount++;
    else if (v.statusCode === 'pending') pendingCount++;
    else if (v.statusCode === 'revoked') revokedCount++;
    else if (v.statusCode === 'expired') expiredCount++;
  });

  return {
    totalKeys: allKeys.length,
    activeCount,
    pendingCount,
    revokedCount,
    expiredCount,
    totalRevenueEur: totalRevenue.toFixed(2),
  };
}

/**
 * Supprime toutes les clés VIP (avec sauvegarde automatique préventive)
 */
function clearAllLicenseKeys({ makeBackup = true } = {}) {
  const backupsDir = path.join(DATA_DIR, 'backups');
  if (makeBackup) {
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }
    const backupPath = path.join(backupsDir, `vip_keys_backup_${Date.now()}.sqlite`);
    fs.copyFileSync(DB_PATH, backupPath);
  }

  const countBefore = db.prepare('SELECT count(*) as count FROM vip_licenses').get().count;
  db.prepare('DELETE FROM vip_licenses').run();
  try {
    db.prepare("DELETE FROM sqlite_sequence WHERE name = 'vip_licenses'").run();
  } catch (_) {}
  db.exec('VACUUM');

  return { deleted: countBefore };
}

module.exports = {
  createLicenseKey,
  activateLicenseKey,
  verifyToken,
  resetLicenseDevices,
  revokeLicenseKey,
  getLicenseKey,
  listLicenseKeys,
  getDatabaseStats,
  computeValidity,
  clearAllLicenseKeys,
};
