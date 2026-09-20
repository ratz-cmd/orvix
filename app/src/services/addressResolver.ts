import { UPDATE_CHECK, FALLBACK_CONFIG } from '../config';

export type AddressConfig = {
  primaryUrl: string;
  mirrors: string[];
  githubUrl: string;
  telegramUrl: string;
};

type RawMirror = { url?: unknown };
type RawAddressJson = {
  primary?: { url?: unknown };
  active?: unknown[];
  github?: unknown;
  telegram?: unknown;
};

const HOSTNAME_RE =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
  } finally {
    clearTimeout(timer);
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isValidHostname(host: string): boolean {
  if (!HOSTNAME_RE.test(host)) return false;
  if (host === 'rentry.co') return false;
  if (host.endsWith('.rentry.co')) return false;
  return true;
}

// Replicates the SW's parseConfig (public/sw.js) — supports two formats:
// - JSON: {"mirrors": ["host", ...]}
// - HTML: rendered rentry page; extract <a href> hosts inside the first <article>
function parseRentry(text: string): string | null {
  // Try JSON first.
  try {
    const parsed = JSON.parse(text) as { mirrors?: unknown };
    if (Array.isArray(parsed.mirrors)) {
      for (const m of parsed.mirrors) {
        if (typeof m === 'string') {
          const host = m.trim().toLowerCase();
          if (isValidHostname(host)) return host;
        }
      }
      return null;
    }
  } catch {
    // Fall through to HTML parsing.
  }

  // HTML path: scope to the first <article> if present.
  const articleMatch = text.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  const scope = articleMatch ? articleMatch[1] : text;
  const hrefRe = /href=["']https?:\/\/([^/"'\s?#]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = hrefRe.exec(scope)) !== null) {
    const host = match[1].trim().toLowerCase();
    if (isValidHostname(host)) return host;
  }
  return null;
}

function normalizeAddressJson(raw: RawAddressJson): AddressConfig | null {
  const primaryUrl = raw.primary?.url;
  if (!isString(primaryUrl)) return null;
  if (!isString(raw.github)) return null;
  if (!isString(raw.telegram)) return null;

  const active = Array.isArray(raw.active) ? raw.active : [];
  const mirrors: string[] = [];
  for (const m of active) {
    const url = (m as RawMirror)?.url;
    if (isString(url) && url !== primaryUrl) {
      mirrors.push(url);
    }
  }

  return {
    primaryUrl,
    mirrors,
    githubUrl: raw.github,
    telegramUrl: raw.telegram,
  };
}

const HARDCODED_FALLBACK: AddressConfig = {
  primaryUrl: FALLBACK_CONFIG.PRIMARY_URL,
  mirrors: [],
  githubUrl: FALLBACK_CONFIG.GITHUB_URL,
  telegramUrl: FALLBACK_CONFIG.TELEGRAM_URL,
};

export async function resolveAddressConfig(): Promise<AddressConfig> {
  // Step 1: discover the resolver host via rentry.
  let resolverHost: string;
  try {
    const res = await fetchWithTimeout(
      `${UPDATE_CHECK.RENTRY_URL}?_=${Date.now()}`,
      UPDATE_CHECK.TIMEOUT_MS,
    );
    if (!res.ok) throw new Error(`rentry status ${res.status}`);
    const text = await res.text();
    const host = parseRentry(text);
    if (!host) throw new Error('rentry: no valid hostname');
    resolverHost = host;
  } catch (err) {
    console.warn('[addressResolver] rentry fetch failed', err);
    return HARDCODED_FALLBACK;
  }

  // Step 2: fetch /address.json on the discovered host.
  try {
    const res = await fetchWithTimeout(
      `https://${resolverHost}/address.json?_=${Date.now()}`,
      UPDATE_CHECK.TIMEOUT_MS,
    );
    if (!res.ok) throw new Error(`address.json status ${res.status}`);
    const json = (await res.json()) as RawAddressJson;
    const normalized = normalizeAddressJson(json);
    if (!normalized) throw new Error('address.json: invalid shape');
    return normalized;
  } catch (err) {
    console.warn('[addressResolver] address.json fetch failed', err);
    return HARDCODED_FALLBACK;
  }
}
