// Core of the warn-only link checker. Pure functions: HTML in, lists out, and
// a URL checker that only touches the network through an injected `fetch`, so
// tests run offline and the CLI (scripts/link-check.mjs) stays thin.

/** Browser-like User-Agent. Some hosts answer bots with 403 or 999. */
export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

export const DEFAULT_TIMEOUT_MS = 10_000;

// href, src or srcset attribute, double-quoted, single-quoted or bare.
// The lookbehind keeps `data-src` and friends out.
const ATTR_RE = /(?<![\w-])(href|src|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", '#x27': "'" };

function decodeEntities(s) {
  return s.replace(/&(amp|lt|gt|quot|apos|#39|#x27);/gi, (_, e) => ENTITIES[e.toLowerCase()]);
}

/** Every attribute value (srcset split into its URLs), entity-decoded. */
function attributeValues(html) {
  const out = [];
  for (const m of html.matchAll(ATTR_RE)) {
    const name = m[1].toLowerCase();
    const raw = decodeEntities((m[2] ?? m[3] ?? m[4] ?? '').trim());
    if (!raw) continue;
    if (name === 'srcset') {
      for (const part of raw.split(',')) {
        const u = part.trim().split(/\s+/)[0];
        if (u) out.push(u);
      }
    } else out.push(raw);
  }
  return out;
}

/**
 * Unique absolute http(s) URLs in href, src and srcset attributes, in first-seen
 * order. Skips mailto:, tel:, data:, #hash, relative and protocol-relative URLs.
 * @param {string} html
 * @returns {string[]}
 */
export function extractLinks(html) {
  const seen = new Set();
  for (const v of attributeValues(html)) {
    if (/^https?:\/\//i.test(v)) seen.add(v);
  }
  return [...seen];
}

/**
 * Unique same-origin file paths that must exist in the build: root-relative
 * href/src/srcset values whose last segment has a file extension (PDFs,
 * images, stylesheets, fonts, icons). Query strings and hashes are dropped.
 * Page routes such as `/`, `/about` or `/#log` are not files and are skipped.
 * @param {string} html
 * @returns {string[]}
 */
export function extractLocalAssets(html) {
  const seen = new Set();
  for (const v of attributeValues(html)) {
    if (!v.startsWith('/') || v.startsWith('//')) continue;
    const path = v.split(/[?#]/)[0];
    const last = path.split('/').pop() ?? '';
    if (/\.[a-z0-9]+$/i.test(last)) seen.add(path);
  }
  return [...seen];
}

/**
 * Allowed statuses for a URL: the longest matching key in `config.overrides`
 * (exact URL or prefix), else `config.default`, else [200].
 * @param {string} url
 * @param {{ default?: number[], overrides?: Record<string, number[]> }} config
 * @returns {number[]}
 */
export function expectedStatuses(url, config) {
  let best = null;
  for (const [prefix, statuses] of Object.entries(config?.overrides ?? {})) {
    if (url.startsWith(prefix) && (best === null || prefix.length > best[0].length)) best = [prefix, statuses];
  }
  return best ? best[1] : (config?.default ?? [200]);
}

/**
 * True when the URL starts with any `config.ignore` prefix (for example the
 * site's own canonical origin, which is checked as local files instead).
 * @param {string} url
 * @param {{ ignore?: string[] }} config
 */
export function isIgnored(url, config) {
  return (config?.ignore ?? []).some((p) => url.startsWith(p));
}

/** One request with its own timeout. Resolves to a status or rejects. */
async function attempt(url, method, fetchImpl, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method,
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    // Do not download bodies; only the status matters.
    try {
      await res.body?.cancel();
    } catch {
      /* already closed */
    }
    const location = res.headers?.get?.('location') ?? null;
    return { status: res.status, location };
  } catch (err) {
    if (timedOut) throw new Error(`timed out after ${timeoutMs} ms`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function errorMessage(err) {
  const cause = err?.cause?.code ?? err?.cause?.message;
  const msg = err?.message ?? String(err);
  return cause && !msg.includes(cause) ? `${msg} (${cause})` : msg;
}

/**
 * Check one URL. HEAD first; GET when HEAD answers 405 or 403 or throws.
 * Redirects are not followed, so a 302 is reported as 302 (with its
 * `location` when the server sends one).
 * @param {string} url
 * @param {{ fetch: (url: string, init?: any) => Promise<any>, timeoutMs?: number, expected?: number[] }} opts
 * @returns {Promise<{ url: string, status: number | null, ok: boolean, error?: string, location?: string }>}
 */
export async function checkUrl(url, { fetch: fetchImpl, timeoutMs = DEFAULT_TIMEOUT_MS, expected = [200] }) {
  let res = null;
  try {
    res = await attempt(url, 'HEAD', fetchImpl, timeoutMs);
  } catch {
    res = null;
  }
  if (res === null || res.status === 405 || res.status === 403) {
    try {
      res = await attempt(url, 'GET', fetchImpl, timeoutMs);
    } catch (err) {
      return { url, status: null, ok: false, error: errorMessage(err) };
    }
  }
  const out = { url, status: res.status, ok: expected.includes(res.status) };
  if (res.location) out.location = res.location;
  return out;
}

/**
 * Plain-text table plus a final summary line.
 * @param {{ url: string, status: number | null, ok: boolean, error?: string, expected?: number[] }[]} results
 * @param {{ missingAssets?: string[] }} [extra]
 * @returns {string}
 */
export function formatReport(results, { missingAssets = [] } = {}) {
  const rows = [['RESULT', 'STATUS', 'EXPECTED', 'URL']];
  for (const r of results) {
    rows.push([
      r.ok ? 'ok' : 'FAIL',
      r.status === null ? '-' : String(r.status),
      (r.expected ?? []).join(','),
      r.error ? `${r.url}  (${r.error})` : r.location ? `${r.url}  (to ${r.location})` : r.url,
    ]);
  }
  for (const a of missingAssets) rows.push(['MISSING', '-', 'file', a]);
  const widths = [0, 1, 2].map((i) => Math.max(...rows.map((row) => row[i].length)));
  const lines = rows.map((row) =>
    row.map((cell, i) => (i < 3 ? cell.padEnd(widths[i]) : cell)).join('  ').trimEnd(),
  );
  const okCount = results.filter((r) => r.ok).length;
  let summary = `${results.length} links checked: ${okCount} ok, ${results.length - okCount} failed.`;
  if (missingAssets.length) summary += ` ${missingAssets.length} local asset(s) missing.`;
  return [...lines, '', summary].join('\n');
}
