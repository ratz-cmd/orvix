// API/Mainapi/utils/vipPayblis.js
'use strict';

const crypto = require('crypto');
const axios = require('axios');

/**
 * PHP-compatible serialize() for objects with string keys and string values.
 * Preserves insertion order. Encodes string lengths in BYTES (UTF-8), not chars.
 *
 * Example: phpSerialize({ a: '1', b: 'éé' })
 *   => 'a:2:{s:1:"a";s:1:"1";s:1:"b";s:4:"éé";}'
 *                                         ^ 4 bytes, not 2 chars
 */
function phpSerialize(obj) {
  if (obj === null || typeof obj !== 'object') {
    throw new TypeError('phpSerialize expects a plain object');
  }
  const entries = Object.entries(obj);
  const parts = [`a:${entries.length}:{`];
  for (const [key, rawValue] of entries) {
    if (typeof key !== 'string') {
      throw new TypeError(`phpSerialize: non-string key "${String(key)}"`);
    }
    const value = String(rawValue ?? '');
    const keyBytes = Buffer.byteLength(key, 'utf8');
    const valueBytes = Buffer.byteLength(value, 'utf8');
    parts.push(`s:${keyBytes}:"${key}";s:${valueBytes}:"${value}";`);
  }
  parts.push('}');
  return parts.join('');
}

/**
 * Encodes the serialized PHP string as base64, matching PHP's
 * base64_encode(serialize($arr)) pipeline.
 */
function encodePayblisToken(payload) {
  const serialized = phpSerialize(payload);
  return Buffer.from(serialized, 'utf8').toString('base64');
}

const PAYBLIS_DEFAULT_DOMAIN = 'pay.payblis.com';
const PAYBLIS_DEFAULT_STORE_NAME = 'Movix';

function isPayblisEnabled() {
  const raw = String(process.env.VIP_PAYBLIS_ENABLED || '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

function isPayblisSandbox() {
  const raw = String(process.env.VIP_PAYBLIS_SANDBOX || '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

function getPayblisMerchantKey() {
  return String(process.env.VIP_PAYBLIS_MERCHANT_KEY || '').trim();
}

function getPayblisSecretKey() {
  return String(process.env.VIP_PAYBLIS_SECRET_KEY || '').trim();
}

function getPayblisStoreName() {
  return String(process.env.VIP_PAYBLIS_STORE_NAME || PAYBLIS_DEFAULT_STORE_NAME).trim();
}

function getPayblisDomain() {
  return String(process.env.VIP_PAYBLIS_DOMAIN || PAYBLIS_DEFAULT_DOMAIN)
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
}

function getPayblisIpnBaseUrl(context = {}) {
  const envBaseUrl = String(process.env.VIP_PAYBLIS_IPN_BASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  if (envBaseUrl) return envBaseUrl;
  return String(context.callbackBaseUrl || '').trim().replace(/\/+$/, '');
}

function getPayblisFrontendBaseUrl() {
  return String(process.env.FRONTEND_BASE_URL || '').trim().replace(/\/+$/, '');
}

const PAYBLIS_SIGNED_FIELDS = [
  'MerchantKey',
  'sandbox',
  'amount',
  'currency',
  'product_name',
  'method',
  'RefOrder',
  'Customer_Email',
  'Customer_FirstName',
  'Customer_Name',
  'country',
  'userIP',
  'lang',
  'store_name',
  'urlOK',
  'urlKO',
  'ipnURL'
];

function computeSignatureConcatDeclared(payload, secretKey) {
  const data = PAYBLIS_SIGNED_FIELDS
    .map((k) => String(payload[k] ?? ''))
    .join('');
  return crypto.createHmac('sha256', secretKey).update(data, 'utf8').digest('hex');
}

function computeSignatureConcatAlphabetical(payload, secretKey) {
  const data = Object.keys(payload)
    .filter((k) => k !== 'signature')
    .sort((a, b) => a.localeCompare(b))
    .map((k) => `${k}=${String(payload[k] ?? '')}`)
    .join('&');
  return crypto.createHmac('sha256', secretKey).update(data, 'utf8').digest('hex');
}

function computeSignatureOverSerialized(payload, secretKey) {
  const { signature, ...fields } = payload;
  const serialized = phpSerialize(fields);
  return crypto.createHmac('sha256', secretKey).update(serialized, 'utf8').digest('hex');
}

const SIGNATURE_STRATEGIES = {
  concat_declared: computeSignatureConcatDeclared,
  concat_alphabetical: computeSignatureConcatAlphabetical,
  over_serialized: computeSignatureOverSerialized
};

function computePayblisSignature(payload, secretKey, strategyName) {
  const name = strategyName
    || String(process.env.VIP_PAYBLIS_SIGNATURE_STRATEGY || 'concat_declared').trim().toLowerCase();
  const strategy = SIGNATURE_STRATEGIES[name];
  if (!strategy) {
    throw new Error(`Stratégie de signature Payblis inconnue: ${name}`);
  }
  return strategy(payload, secretKey);
}

function verifyPayblisSignature(payload, providedSignature, secretKey, strategyName) {
  if (!providedSignature || typeof providedSignature !== 'string') return false;
  const expected = computePayblisSignature(payload, secretKey, strategyName);
  const providedBuf = Buffer.from(providedSignature, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  if (providedBuf.length !== expectedBuf.length || providedBuf.length === 0) return false;
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Verifies the signature on an incoming Payblis IPN webhook.
 *
 * Payblis signs IPNs using HMAC-SHA256 over the compact JSON body with the
 * `signature` field removed. Verified against live Payblis sandbox on
 * 2026-04-21: a captured IPN with signature `5c1150b9...` matched exactly
 * when the signed payload was `JSON.stringify(body_minus_signature)`.
 *
 * @param {object} parsedBody - the already-parsed IPN JSON object
 * @param {string} providedSignature - the 64-char hex signature provided by Payblis
 * @param {string} secretKey - the merchant Secret Key
 * @returns {boolean} true iff the signature is valid
 */
function verifyPayblisIpnSignature(parsedBody, providedSignature, secretKey) {
  if (!providedSignature || typeof providedSignature !== 'string') return false;
  if (!parsedBody || typeof parsedBody !== 'object') return false;
  const { signature, ...fields } = parsedBody;
  const signedData = JSON.stringify(fields);
  const expected = crypto.createHmac('sha256', secretKey).update(signedData, 'utf8').digest('hex');
  const providedBuf = Buffer.from(providedSignature, 'hex');
  const expectedBuf = Buffer.from(expected, 'hex');
  if (providedBuf.length !== expectedBuf.length || providedBuf.length === 0) return false;
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

function normalizeLang(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'en' ? 'en' : 'fr';
}

function normalizeCountryCode(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : 'FR';
}

function derivePseudo({ auth, payerEmail }) {
  const rawPseudo = auth?.pseudo || auth?.username || auth?.displayName || '';
  const fromPseudo = String(rawPseudo).trim().slice(0, 60);
  if (fromPseudo) return fromPseudo;
  const email = String(payerEmail || auth?.email || '').trim();
  const local = email.split('@')[0] || '';
  const sanitized = local.replace(/[^a-zA-Z0-9_\-.]/g, '').slice(0, 60);
  return sanitized || 'guest';
}

/**
 * Builds the complete payload (including signature) for the Payblis
 * payment_gateway.php endpoint. All values are coerced to strings.
 */
function buildPayblisPayload({
  merchantKey,
  secretKey,
  sandbox,
  amountEur,
  productName,
  refOrder,
  payerEmail,
  customerName,
  countryCode,
  userIp,
  lang,
  storeName,
  urlOK,
  urlKO,
  ipnURL,
  signatureStrategy
}) {
  if (!merchantKey) throw new Error('Payblis MerchantKey manquant');
  if (!secretKey) throw new Error('Payblis Secret Key manquant');
  if (!refOrder) throw new Error('Payblis RefOrder manquant');
  if (!payerEmail) throw new Error('Payblis Customer_Email manquant');
  if (!urlOK || !urlKO || !ipnURL) throw new Error('Payblis URLs manquantes');

  const payload = {
    MerchantKey: merchantKey,
    sandbox: sandbox ? 'true' : 'false',
    amount: Number(amountEur).toFixed(2),
    currency: 'EUR',
    product_name: String(productName || '').slice(0, 120),
    method: '',
    RefOrder: refOrder,
    Customer_Email: payerEmail,
    Customer_FirstName: customerName,
    Customer_Name: customerName,
    country: normalizeCountryCode(countryCode),
    userIP: String(userIp || ''),
    lang: normalizeLang(lang),
    store_name: storeName,
    urlOK,
    urlKO,
    ipnURL
  };
  payload.signature = computePayblisSignature(payload, secretKey, signatureStrategy);
  return payload;
}

function normalizePayblisHost(domain) {
  return (domain || getPayblisDomain())
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '');
}

function buildPayblisCheckoutUrl(payload, domain) {
  const token = encodePayblisToken(payload);
  const host = normalizePayblisHost(domain);
  return `https://${host}/api/payment_gateway.php?token=${token}`;
}

/**
 * Normalises an incoming IPN payload into { normalized, raw }.
 * Accepts JSON objects, form-encoded bodies (already parsed by express),
 * and strips whitespace from string fields.
 */
function normalizeIpnPayload(body) {
  if (!body || typeof body !== 'object') {
    return { normalized: {}, raw: {} };
  }
  const raw = { ...body };
  const normalized = {};
  for (const [k, v] of Object.entries(body)) {
    normalized[k] = typeof v === 'string' ? v.trim() : v;
  }
  return { normalized, raw };
}

function normalizeIpnStatus(value) {
  const upper = String(value || '').trim().toUpperCase();
  if (['SUCCESS', 'PAID', 'COMPLETED'].includes(upper)) return 'success';
  if (['FAILED', 'DECLINED', 'ERROR'].includes(upper)) return 'failed';
  if (['PENDING', 'AWAITING', 'PROCESSING'].includes(upper)) return 'pending';
  return 'unknown';
}

/**
 * Calls GET /api/REST/transaction-status to fetch the latest state for
 * a given RefOrder. Used as a backup poll when the IPN is delayed or lost.
 */
async function fetchPayblisTransactionStatus(refOrder, { merchantKey, domain } = {}) {
  const host = normalizePayblisHost(domain);
  const response = await axios.request({
    method: 'GET',
    url: `https://${host}/api/REST/transaction-status`,
    headers: {
      'X-Merchant-Key': merchantKey || getPayblisMerchantKey(),
      'Content-Type': 'application/json'
    },
    data: { ref_order: refOrder },
    timeout: 20000
  });
  return response.data;
}

module.exports = {
  phpSerialize,
  encodePayblisToken,
  isPayblisEnabled,
  isPayblisSandbox,
  getPayblisMerchantKey,
  getPayblisSecretKey,
  getPayblisStoreName,
  getPayblisDomain,
  getPayblisIpnBaseUrl,
  getPayblisFrontendBaseUrl,
  computePayblisSignature,
  verifyPayblisSignature,
  verifyPayblisIpnSignature,
  SIGNATURE_STRATEGIES,
  PAYBLIS_SIGNED_FIELDS,
  derivePseudo,
  buildPayblisPayload,
  buildPayblisCheckoutUrl,
  normalizeIpnPayload,
  normalizeIpnStatus,
  fetchPayblisTransactionStatus
};
