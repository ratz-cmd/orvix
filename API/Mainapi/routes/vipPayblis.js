// API/Mainapi/routes/vipPayblis.js
const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');

const { getPool } = require('../mysqlPool');
const { createRedisRateLimitStore } = require('../utils/redisRateLimitStore');
const { handlePayblisIpn } = require('../utils/vipDonations');

const router = express.Router();

const getRateLimitKey = (req) => req.headers['cf-connecting-ip']
  || req.headers['x-forwarded-for']?.split(',')[0].trim()
  || ipKeyGenerator(req.ip);

const ipnRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  store: createRedisRateLimitStore({ prefix: 'rate-limit:vip:payblis-ipn:' }),
  passOnStoreError: true,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
  validate: { xForwardedForHeader: false, ip: false },
  message: { success: false, error: 'Too many Payblis IPN calls' }
});

router.post('/vip/payblis/ipn', ipnRateLimit, async (req, res) => {
  const sourceIp = req.headers['cf-connecting-ip']
    || req.headers['x-forwarded-for']?.split(',')[0].trim()
    || req.ip
    || null;
  const publicId = String(req.query?.publicId || req.query?.public_id || req.body?.publicId || '').trim();
  const headerSignature = String(req.headers['x-payblis-signature'] || '').trim() || null;

  try {
    const pool = getPool();
    await handlePayblisIpn(pool, {
      publicId,
      body: req.body || {},
      sourceIp,
      headerSignature
    });
    return res.json({ success: true });
  } catch (error) {
    const statusCode = Number(error?.statusCode) || (error?.message?.startsWith('Signature') ? 401 : 400);
    if (!error?.silent) {
      console.error('VIP Payblis IPN error:', {
        publicId,
        sourceIp,
        status: statusCode,
        message: error.message
      });
    }
    return res.status(statusCode).json({
      success: false,
      error: error.message || 'IPN Payblis rejeté'
    });
  }
});

module.exports = { router };
