/**
 * Chain explorer client — replaces BlockCypher for VIP invoice polling.
 * BTC -> mempool.space, LTC -> litecoinspace.org (both ESplora-compatible).
 * Rotates through SOCKS5_PROXIES to multiply per-IP rate-limit headroom.
 */

const axios = require('axios');
const { PROXIES, pickNextSocks5Proxy, getProxyAgent } = require('./proxyManager');

const DEFAULT_BASES = Object.freeze({
  btc: 'https://mempool.space/api',
  ltc: 'https://litecoinspace.org/api'
});

const TIP_HEIGHT_TTL_MS = 30_000;
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 15_000;
const PER_PROXY_MIN_INTERVAL_MS = 1_100;
const RETRY_BACKOFF_MS = 400;

const tipHeightCache = new Map();

function normalizeBase(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function getExplorerBase(coin) {
  if (coin === 'btc') {
    return normalizeBase(process.env.BTC_EXPLORER_API) || DEFAULT_BASES.btc;
  }
  if (coin === 'ltc') {
    return normalizeBase(process.env.LTC_EXPLORER_API) || DEFAULT_BASES.ltc;
  }
  throw new Error(`Coin non supporté: ${coin}`);
}

function shouldRetry(error) {
  if (!error.response) return true;
  const status = error.response.status;
  return status === 429 || (status >= 500 && status < 600);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callExplorer(coin, path, { responseType = 'json' } = {}) {
  const url = `${getExplorerBase(coin)}${path}`;
  let lastError = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    let agent = null;
    let proxyLabel = 'direct';

    if (PROXIES.length > 0) {
      const proxy = await pickNextSocks5Proxy({
        minIntervalMs: PER_PROXY_MIN_INTERVAL_MS,
        waitTimeoutMs: 1_500
      });
      if (proxy) {
        agent = getProxyAgent(proxy);
        proxyLabel = `${proxy.host}:${proxy.port}`;
      }
    }

    console.log(
      `[CHAIN EXPLORER] ${coin.toUpperCase()} ${path} via ${proxyLabel}${attempt > 0 ? ` (retry ${attempt})` : ''}`
    );

    try {
      const response = await axios.get(url, {
        timeout: REQUEST_TIMEOUT_MS,
        responseType,
        httpAgent: agent || undefined,
        httpsAgent: agent || undefined,
        proxy: false,
        validateStatus: (status) => status >= 200 && status < 500
      });

      if (response.status === 404) {
        return response;
      }
      if (response.status >= 400) {
        const error = new Error(`Explorer ${coin.toUpperCase()} ${response.status} via ${proxyLabel}`);
        error.response = response;
        throw error;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS - 1 && shouldRetry(error)) {
        await sleep(RETRY_BACKOFF_MS * (attempt + 1));
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error(`Explorer ${coin.toUpperCase()} indisponible`);
}

async function fetchTipHeight(coin) {
  const cached = tipHeightCache.get(coin);
  if (cached && Date.now() - cached.fetchedAt < TIP_HEIGHT_TTL_MS) {
    return cached.height;
  }

  const response = await callExplorer(coin, '/blocks/tip/height', { responseType: 'text' });
  const height = Number.parseInt(String(response.data).trim(), 10);
  if (!Number.isFinite(height) || height <= 0) {
    throw new Error(`Tip height invalide pour ${coin.toUpperCase()}`);
  }

  tipHeightCache.set(coin, { height, fetchedAt: Date.now() });
  return height;
}

async function fetchAddressTxs(coin, address) {
  const response = await callExplorer(coin, `/address/${encodeURIComponent(address)}/txs`);
  if (response.status === 404) {
    return [];
  }
  return Array.isArray(response.data) ? response.data : [];
}

module.exports = {
  fetchAddressTxs,
  fetchTipHeight,
  getExplorerBase
};
