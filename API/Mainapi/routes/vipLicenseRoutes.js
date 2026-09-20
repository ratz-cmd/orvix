const express = require('express');
const router = express.Router();
const store = require('../utils/vipLicenseStore');

// Simple in-memory rate limiter for key activation to protect against brute-force
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 10;

function activationRateLimit(req, res, next) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress || '127.0.0.1';
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }

  entry.count++;
  rateLimitMap.set(ip, entry);

  if (entry.count > MAX_ATTEMPTS) {
    const waitMins = Math.ceil((entry.resetAt - now) / 60000);
    return res.status(429).json({
      success: false,
      error: `Trop de tentatives. Veuillez patienter ${waitMins} minute(s) avant de réessayer.`,
    });
  }

  next();
}

/**
 * POST /api/vip/activate
 * Active une clé de licence VIP pour un appareil donné
 */
router.post('/activate', activationRateLimit, (req, res) => {
  try {
    const { key, deviceSeed } = req.body;

    if (!key || typeof key !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Veuillez entrer une clé de licence VIP valide',
      });
    }

    if (!deviceSeed || typeof deviceSeed !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Identifiant d\'appareil manquant',
      });
    }

    const result = store.activateLicenseKey({
      keyCode: key.trim(),
      deviceSeed: deviceSeed.trim(),
    });

    return res.json({
      success: true,
      message: 'Licence VIP activée avec succès !',
      key: result.key,
      token: result.token,
      expiresAt: result.expiresAt,
      remainingDays: result.remainingDays,
      devicesCount: result.devicesCount,
      maxDevices: result.maxDevices,
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message || 'Erreur lors de l\'activation de la clé VIP',
    });
  }
});

/**
 * POST /api/vip/verify
 * Vérifie l'authenticité d'un token VIP
 */
router.post('/verify', (req, res) => {
  try {
    const { token, deviceSeed } = req.body;

    if (!token) {
      return res.json({ success: true, valid: false, reason: 'no_token' });
    }

    const check = store.verifyToken(token, deviceSeed);
    if (!check.valid) {
      return res.json({
        success: true,
        valid: false,
        reason: check.reason,
      });
    }

    return res.json({
      success: true,
      valid: true,
      expiresAt: check.expiresAt,
      remainingDays: check.remainingDays,
      key: check.payload.key,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Erreur lors de la vérification du token VIP',
    });
  }
});

/**
 * GET /api/vip/status
 * Récupère le statut VIP depuis les headers
 */
router.get('/status', (req, res) => {
  try {
    const token = req.headers['x-vip-token'];
    const deviceSeed = req.headers['x-device-seed'];

    if (!token) {
      return res.json({ isVip: false, reason: 'no_token' });
    }

    const check = store.verifyToken(token, deviceSeed);
    return res.json({
      isVip: check.valid,
      expiresAt: check.expiresAt || null,
      remainingDays: check.remainingDays || null,
      reason: check.reason || null,
    });
  } catch (error) {
    return res.status(500).json({ isVip: false, error: error.message });
  }
});

/**
 * GET /api/vip/admin/licenses
 * Endpoint d'administration pour consulter le registre et les statistiques
 */
router.get('/admin/licenses', (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'] || req.query.admin_key;
    const expectedKey = process.env.ADMIN_SECRET || process.env.JWT_SECRET || 'orvix_vip_admin_secret_2026';

    // Sécurité basique pour l'accès externe
    if (adminKey !== expectedKey && process.env.NODE_ENV === 'production') {
      return res.status(403).json({ success: false, error: 'Accès administrateur non autorisé' });
    }

    const { search, status, limit } = req.query;
    const licenses = store.listLicenseKeys({
      limit: parseInt(limit, 10) || 100,
      search: search || null,
      status: status || null,
    });
    const stats = store.getDatabaseStats();

    return res.json({
      success: true,
      stats,
      count: licenses.length,
      licenses,
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
