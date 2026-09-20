const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const router = express.Router();
const { getPool } = require('../mysqlPool');
const { verifyTurnstileFromRequest } = require('../utils/turnstile');
const { isAdmin } = require('../middleware/auth');
const { createRedisRateLimitStore } = require('../utils/redisRateLimitStore');

// Whitelist of valid tuto slugs. Must stay in sync with
// src/pages/help/tutoRegistry.tsx TUTO_REGISTRY entries.
const VALID_SLUGS = new Set([
  'ca-marche-plus',
  'dns',
  'changer-lecteur',
  'qualite-video',
  'sous-titres',
  'chromecast',
  'compte',
  'recuperer-compte',
  'lier-compte',
  'profils',
  'watchparty',
  'listes-partagees',
  'installer-pwa',
  'extension',
  'premid',
  'app-mobile',
  'open-source',
  'vip',
  'debrid',
  'telechargement',
  'miroirs',
  'live-tv',
  'extraction',
  'priorite-sources',
  'dernier-lecteur',
  'apparence',
]);

const IP_SALT =
  process.env.TURNSTILE_IP_SALT ||
  process.env.JWT_SECRET ||
  'movix-help-feedback-default-salt';

function hashIp(req) {
  const ip =
    req.headers['cf-connecting-ip'] ||
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.ip ||
    'unknown';
  return crypto.createHash('sha256').update(`${IP_SALT}:${ip}`).digest('hex');
}

const feedbackRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) =>
    req.headers['cf-connecting-ip'] ||
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    ipKeyGenerator(req.ip),
  store: createRedisRateLimitStore({ prefix: 'rate-limit:help-feedback:' }),
  passOnStoreError: true,
  validate: { xForwardedForHeader: false, ip: false },
  message: { error: 'Trop de votes. Réessaie dans quelques minutes.' },
});

/**
 * POST /api/help/feedback
 * body: { slug: string, helpful: boolean, turnstileToken: string }
 *
 * Upserts a vote keyed on (slug, ip_hash) — same user can change their mind
 * but we don't count duplicates.
 */
router.post('/feedback', feedbackRateLimit, async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { slug, helpful, turnstileToken } = body;

    if (typeof slug !== 'string' || !VALID_SLUGS.has(slug)) {
      return res.status(400).json({ error: 'Invalid slug' });
    }
    if (typeof helpful !== 'boolean') {
      return res.status(400).json({ error: 'Invalid helpful value' });
    }
    if (turnstileToken !== undefined && typeof turnstileToken !== 'string') {
      return res.status(400).json({ error: 'Invalid turnstile token' });
    }

    const turnstileCheck = await verifyTurnstileFromRequest(req, turnstileToken);
    if (!turnstileCheck.valid) {
      return res.status(turnstileCheck.status || 403).json({
        error: turnstileCheck.error || 'Turnstile verification failed',
      });
    }

    const ipHash = hashIp(req);
    const userAgent = String(req.headers['user-agent'] || '').slice(0, 255);
    const helpfulInt = helpful ? 1 : 0;

    const pool = getPool();
    await pool.execute(
      `INSERT INTO help_feedback (slug, helpful, ip_hash, user_agent)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE helpful = VALUES(helpful), user_agent = VALUES(user_agent)`,
      [slug, helpfulInt, ipHash, userAgent],
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[helpFeedback] submit error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * GET /api/help/feedback/stats
 * Admin-only. Returns aggregated stats per slug: { slug, up, down, total, ratio }.
 */
router.get('/feedback/stats', isAdmin, async (_req, res) => {
  try {
    const pool = getPool();
    const [rows] = await pool.execute(
      `SELECT
         slug,
         SUM(CASE WHEN helpful = 1 THEN 1 ELSE 0 END) AS up,
         SUM(CASE WHEN helpful = 0 THEN 1 ELSE 0 END) AS down,
         COUNT(*) AS total
       FROM help_feedback
       GROUP BY slug
       ORDER BY total DESC`,
    );

    const stats = rows.map((r) => {
      const up = Number(r.up) || 0;
      const down = Number(r.down) || 0;
      const total = Number(r.total) || 0;
      return {
        slug: r.slug,
        up,
        down,
        total,
        ratio: total > 0 ? up / total : 0,
      };
    });

    return res.json({ stats });
  } catch (err) {
    console.error('[helpFeedback] stats error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
});

module.exports = router;
