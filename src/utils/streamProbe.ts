/**
 * Sonde de lecture directe d'un flux extrait.
 *
 * Avant de basculer un membre sur le lecteur Orvix, on vérifie que le
 * navigateur pourra réellement lire le flux **sans passer par le serveur** :
 * hls.js et la balise `<video>` exigent le CORS, et beaucoup de CDN
 * d'hébergeurs ne l'autorisent pas (ils attendent un Referer précis).
 *
 * La sonde ne télécharge que les premiers kilo-octets (`Range`) et coupe le
 * flux tout de suite : coût négligeable, et elle évite deux échecs coûteux —
 * une lecture qui ne démarre jamais, ou un relais serveur inutile.
 */

export type ProbedStreamKind = 'hls' | 'file' | null;

export interface StreamProbeResult {
  /** Le navigateur peut lire ce flux directement. */
  ok: boolean;
  /** Nature du flux reconnue dans les premiers octets. */
  kind: ProbedStreamKind;
  status?: number;
  /** Message court, utilisé dans les journaux et l'overlay de diagnostic. */
  reason: string;
}

export interface StreamProbeOptions {
  timeoutMs?: number;
  /** Octets demandés au CDN (le serveur peut les ignorer). */
  rangeBytes?: number;
}

const HTML_MARKERS = [
  '<!doctype html',
  '<html',
  '<head',
  '<body',
  '<?xml',
];

/**
 * Reconnaît la nature d'un flux d'après ses premiers octets.
 *
 * - `#EXTM3U` → playlist HLS ;
 * - page HTML / JSON / XML → ce n'est pas un média (souvent un portail captif,
 *   une page anti-bot ou un message d'erreur de l'hébergeur) ;
 * - le reste → fichier progressif (mp4, webm, mkv…).
 */
export function classifyStreamBytes(header: string): ProbedStreamKind {
  if (!header) return null;
  const head = header.slice(0, 4096).trimStart();

  if (head.startsWith('#EXTM3U')) return 'hls';

  const lowered = head.toLowerCase();
  if (HTML_MARKERS.some((marker) => lowered.startsWith(marker))) return null;
  // Réponse JSON (API d'hébergeur renvoyée par erreur à la place du média).
  if (lowered.startsWith('{') || lowered.startsWith('[')) return null;

  return 'file';
}

/** Message français expliquant pourquoi la lecture directe est écartée. */
export function describeProbeFailure(result: StreamProbeResult): string {
  if (result.ok) return 'Lecture directe disponible';
  if (result.status === 403) return 'CDN fermé hors de son lecteur (403)';
  if (result.status === 404) return 'Flux introuvable sur le CDN (404)';
  if (result.kind === null && result.status && result.status >= 200 && result.status < 300) {
    return "Le CDN renvoie une page au lieu du flux";
  }
  if (result.reason) return result.reason;
  return 'Lecture directe impossible depuis le navigateur';
}

/** Lit au plus `maxBytes` du corps, puis annule le reste du transfert. */
async function readHead(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    return text.slice(0, maxBytes);
  }

  const decoder = new TextDecoder('utf-8', { fatal: false });
  let text = '';
  try {
    while (text.length < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) text += decoder.decode(value, { stream: true });
    }
  } finally {
    // Indispensable : sans annulation, un CDN qui ignore `Range` ferait
    // télécharger tout le fichier jusqu'à la fin de la vidéo.
    await reader.cancel().catch(() => {});
  }
  return text;
}

/**
 * Teste la lecture directe d'un flux depuis le navigateur.
 *
 * Un succès signifie deux choses à la fois : le CDN répond, et il autorise le
 * CORS (sinon la requête `fetch` échouerait sans réponse lisible).
 */
export async function probeDirectStream(
  url: string,
  options: StreamProbeOptions = {},
): Promise<StreamProbeResult> {
  const { timeoutMs = 4000, rangeBytes = 4096 } = options;

  if (!url || typeof url !== 'string') {
    return { ok: false, kind: null, reason: 'URL absente' };
  }
  if (typeof fetch !== 'function') {
    return { ok: false, kind: null, reason: 'Navigateur sans fetch' };
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'follow',
      headers: { Range: `bytes=0-${rangeBytes - 1}` },
      signal: controller?.signal,
    });

    if (!response.ok && response.status !== 206) {
      return {
        ok: false,
        kind: null,
        status: response.status,
        reason: `CDN HTTP ${response.status}`,
      };
    }

    const head = await readHead(response, rangeBytes);
    const kind = classifyStreamBytes(head);

    if (kind === null) {
      return {
        ok: false,
        kind: null,
        status: response.status,
        reason: "Le CDN renvoie une page au lieu du flux",
      };
    }

    return {
      ok: true,
      kind,
      status: response.status,
      reason: `Lecture directe (${kind === 'hls' ? 'HLS' : 'fichier'})`,
    };
  } catch (error) {
    const aborted = (error as { name?: string } | null)?.name === 'AbortError';
    return {
      ok: false,
      kind: null,
      reason: aborted ? 'CDN trop lent à répondre' : 'CORS refusé par le CDN',
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
