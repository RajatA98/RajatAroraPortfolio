// Link checker tests. No real network: every checkUrl call gets a stub fetch.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  extractLinks,
  extractLocalAssets,
  expectedStatuses,
  isIgnored,
  checkUrl,
  formatReport,
  USER_AGENT,
} from '../../scripts/link-check-lib.mjs';

const ROOT = resolve(__dirname, '../..');

const SAMPLE = `<!doctype html>
<html><head>
  <link rel="canonical" href="https://example.com/">
  <link rel="stylesheet" href="/_astro/site.abc123.css">
  <link rel="preload" href="/_astro/font.woff2" as="font">
  <link rel="icon" href="/favicon.svg">
</head><body>
  <a href="#main">Skip</a>
  <a href="/">Home</a>
  <a href="/#log">Log</a>
  <a href="/about">About</a>
  <a href="mailto:someone@example.com">Mail</a>
  <a href="tel:+15555550100">Call</a>
  <a href="https://github.com/RajatA98">GitHub</a>
  <a href='https://github.com/RajatA98'>GitHub again</a>
  <a href="https://www.linkedin.com/in/someone/">LinkedIn</a>
  <a href="http://insecure.example.org/page?x=1&amp;y=2">Old</a>
  <a href="/RajatArora-Resume.pdf">Resume</a>
  <a href="/RajatArora-Resume.pdf?v=2">Resume again</a>
  <a href="//cdn.example.net/protocol-relative.js">Protocol relative</a>
  <img src="/avatar.svg" alt="">
  <img src="data:image/png;base64,AAAA" alt="">
  <img src="/_astro/hero.123.webp" srcset="/_astro/hero.480.webp 480w, /_astro/hero.960.webp 960w" alt="">
  <img src="https://images.example.com/pic.png" alt="">
</body></html>`;

describe('extractLinks', () => {
  const links = extractLinks(SAMPLE);

  it('returns unique absolute http(s) URLs from href and src', () => {
    expect(links).toEqual([
      'https://example.com/',
      'https://github.com/RajatA98',
      'https://www.linkedin.com/in/someone/',
      'http://insecure.example.org/page?x=1&y=2',
      'https://images.example.com/pic.png',
    ]);
  });

  it('ignores mailto, tel, hash, relative, protocol-relative and data URLs', () => {
    for (const l of links) expect(l).toMatch(/^https?:\/\//);
    expect(links.some((l) => l.startsWith('mailto:') || l.startsWith('tel:') || l.startsWith('data:'))).toBe(false);
  });

  it('returns an empty list for HTML with no links', () => {
    expect(extractLinks('<p>nothing</p>')).toEqual([]);
  });
});

describe('extractLocalAssets', () => {
  const assets = extractLocalAssets(SAMPLE);

  it('includes the PDF href once, without query string', () => {
    expect(assets.filter((a) => a === '/RajatArora-Resume.pdf')).toHaveLength(1);
  });

  it('includes image src and srcset paths, stylesheets, fonts and icons', () => {
    expect(assets).toEqual(
      expect.arrayContaining([
        '/avatar.svg',
        '/_astro/hero.123.webp',
        '/_astro/hero.480.webp',
        '/_astro/hero.960.webp',
        '/_astro/site.abc123.css',
        '/_astro/font.woff2',
        '/favicon.svg',
      ]),
    );
  });

  it('skips page routes, hashes, external and data URLs', () => {
    for (const bad of ['/', '/#log', '/about', '#main']) expect(assets).not.toContain(bad);
    expect(assets.some((a) => a.startsWith('http') || a.startsWith('data:') || a.startsWith('//'))).toBe(false);
  });
});

describe('expectedStatuses', () => {
  const config = {
    default: [200],
    overrides: {
      'https://github.com/': [200],
      'https://github.com/RajatA98/special': [200, 301],
      'https://www.linkedin.com/': [200, 999],
      'https://app.example.run.app': [200, 302, 303],
    },
  };

  it('falls back to the default list', () => {
    expect(expectedStatuses('https://unknown.example.com/x', config)).toEqual([200]);
  });

  it('matches a prefix override', () => {
    expect(expectedStatuses('https://www.linkedin.com/in/someone/', config)).toEqual([200, 999]);
  });

  it('matches an exact URL override', () => {
    expect(expectedStatuses('https://app.example.run.app', config)).toEqual([200, 302, 303]);
  });

  it('picks the longest matching prefix', () => {
    expect(expectedStatuses('https://github.com/RajatA98/special-repo', config)).toEqual([200, 301]);
    expect(expectedStatuses('https://github.com/RajatA98/other', config)).toEqual([200]);
  });

  it('defaults to [200] when the config has no default', () => {
    expect(expectedStatuses('https://x.example.com', {})).toEqual([200]);
  });

  it('the committed link-check.json parses and covers the known hosts', () => {
    const real = JSON.parse(readFileSync(resolve(ROOT, 'link-check.json'), 'utf8'));
    expect(real.default).toEqual([200]);
    expect(expectedStatuses('https://www.linkedin.com/in/rajata98/', real)).toContain(999);
    expect(expectedStatuses('https://portfolio-agent-git-756982711593.us-central1.run.app', real)).toContain(302);
  });
});

describe('isIgnored', () => {
  it('matches ignore prefixes', () => {
    const config = { ignore: ['https://rajatarora.com'] };
    expect(isIgnored('https://rajatarora.com/', config)).toBe(true);
    expect(isIgnored('https://github.com/', config)).toBe(false);
    expect(isIgnored('https://github.com/', {})).toBe(false);
  });
});

type Call = { url: string; method: string; redirect?: string; ua?: string; hasSignal: boolean };

/** Stub fetch that records calls and answers from a per-method table. */
function stubFetch(answers: Record<string, number | Error | 'hang'>) {
  const calls: Call[] = [];
  const fetch = (url: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const headers = new Headers(init.headers);
    calls.push({
      url,
      method,
      redirect: init.redirect,
      ua: headers.get('user-agent') ?? undefined,
      hasSignal: !!init.signal,
    });
    const a = answers[method];
    if (a instanceof Error) return Promise.reject(a);
    if (a === 'hang') {
      return new Promise<Response>((_, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      });
    }
    return Promise.resolve(new Response(null, { status: a ?? 200 }));
  };
  return { fetch, calls };
}

describe('checkUrl', () => {
  const url = 'https://example.com/page';

  it('uses HEAD with manual redirects and a browser-like User-Agent', async () => {
    const { fetch, calls } = stubFetch({ HEAD: 200 });
    const r = await checkUrl(url, { fetch, expected: [200] });
    expect(r).toEqual({ url, status: 200, ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'HEAD', redirect: 'manual', hasSignal: true });
    expect(calls[0].ua).toBe(USER_AGENT);
    expect(USER_AGENT).toMatch(/Mozilla\/5\.0/);
  });

  it('falls back to GET when HEAD returns 405', async () => {
    const { fetch, calls } = stubFetch({ HEAD: 405, GET: 200 });
    const r = await checkUrl(url, { fetch, expected: [200] });
    expect(calls.map((c) => c.method)).toEqual(['HEAD', 'GET']);
    expect(calls[1].redirect).toBe('manual');
    expect(r).toMatchObject({ status: 200, ok: true });
  });

  it('falls back to GET when HEAD returns 403', async () => {
    const { fetch, calls } = stubFetch({ HEAD: 403, GET: 200 });
    const r = await checkUrl(url, { fetch, expected: [200] });
    expect(calls.map((c) => c.method)).toEqual(['HEAD', 'GET']);
    expect(r.status).toBe(200);
  });

  it('falls back to GET when HEAD throws', async () => {
    const { fetch, calls } = stubFetch({ HEAD: new TypeError('fetch failed'), GET: 200 });
    const r = await checkUrl(url, { fetch, expected: [200] });
    expect(calls.map((c) => c.method)).toEqual(['HEAD', 'GET']);
    expect(r.ok).toBe(true);
  });

  it('reports a 302 as the observed status, not the redirect target', async () => {
    const { fetch } = stubFetch({ HEAD: 302 });
    expect(await checkUrl(url, { fetch, expected: [200] })).toEqual({ url, status: 302, ok: false });
    expect(await checkUrl(url, { fetch, expected: [200, 302] })).toEqual({ url, status: 302, ok: true });
  });

  it('records the Location header of a redirect and shows it in the report', async () => {
    const fetch = () =>
      Promise.resolve(new Response(null, { status: 301, headers: { location: 'https://example.com/moved' } }));
    const r = await checkUrl(url, { fetch, expected: [200] });
    expect(r).toEqual({ url, status: 301, ok: false, location: 'https://example.com/moved' });
    expect(formatReport([{ ...r, expected: [200] }])).toContain('(to https://example.com/moved)');
  });

  it('defaults expected to [200]', async () => {
    const { fetch } = stubFetch({ HEAD: 404 });
    expect(await checkUrl(url, { fetch })).toMatchObject({ status: 404, ok: false });
  });

  it('a timeout produces ok: false with an error', async () => {
    const { fetch } = stubFetch({ HEAD: 'hang', GET: 'hang' });
    const r = await checkUrl(url, { fetch, timeoutMs: 20, expected: [200] });
    expect(r.ok).toBe(false);
    expect(r.status).toBeNull();
    expect(r.error).toMatch(/timed out after 20 ms/);
  });

  it('a network error on both attempts produces ok: false with the message', async () => {
    const { fetch } = stubFetch({ HEAD: new TypeError('fetch failed'), GET: new TypeError('getaddrinfo ENOTFOUND') });
    const r = await checkUrl(url, { fetch, expected: [200] });
    expect(r).toMatchObject({ url, status: null, ok: false });
    expect(r.error).toMatch(/ENOTFOUND/);
  });
});

describe('formatReport', () => {
  const results = [
    { url: 'https://a.example.com', status: 200, ok: true, expected: [200] },
    { url: 'https://b.example.com', status: 302, ok: false, expected: [200] },
    { url: 'https://c.example.com', status: null, ok: false, error: 'timed out after 10000 ms', expected: [200] },
    { url: 'https://d.example.com', status: 999, ok: true, expected: [200, 999] },
  ];

  it('prints one row per result and a summary line with counts', () => {
    const out = formatReport(results);
    const lines = out.split('\n');
    for (const r of results) expect(out).toContain(r.url);
    expect(out).toContain('timed out after 10000 ms');
    expect(out).toContain('200,999');
    expect(lines[lines.length - 1]).toBe('4 links checked: 2 ok, 2 failed.');
  });

  it('includes missing local assets in the table and the summary', () => {
    const out = formatReport(results.slice(0, 1), { missingAssets: ['/RajatArora-Resume.pdf'] });
    expect(out).toContain('/RajatArora-Resume.pdf');
    expect(out).toMatch(/MISSING/);
    expect(out.split('\n').at(-1)).toBe('1 links checked: 1 ok, 0 failed. 1 local asset(s) missing.');
  });

  it('handles an empty run', () => {
    expect(formatReport([]).split('\n').at(-1)).toBe('0 links checked: 0 ok, 0 failed.');
  });
});
