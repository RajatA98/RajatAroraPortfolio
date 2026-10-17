import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { renderAstro } from '../helpers/container';
import IndexPage from '../../src/pages/index.astro';
import NotFoundPage from '../../src/pages/404.astro';
import ColophonPage from '../../src/pages/colophon.astro';
import SiteFooter from '../../src/components/SiteFooter.astro';
import { GET as robots } from '../../src/pages/robots.txt';
import { GET as ogImage } from '../../src/pages/og.png';
import { GET as touchIcon } from '../../src/pages/apple-touch-icon.png';
import { renderOgCard } from '../../src/og/card';
import { contact } from '../../src/data/site';
import { findCopyViolations, stripTags } from '../../src/lib/copy-rules';
import astroConfig from '../../astro.config.mjs';

// Build-Phase 6 (Launch): link previews, structured data, crawler files,
// the colophon, and the enforced Content Security Policy. Everything that
// names the host derives from `site` in astro.config.mjs, so the domain
// cutover is a one-line change.

const SITE = 'https://rajatarora.com';
const head = (html: string) => html.slice(0, html.indexOf('<body'));
const meta = (html: string, attr: string, key: string) =>
  html.match(new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`))?.[1] ??
  html.match(new RegExp(`<meta\\s+content="([^"]*)"\\s+${attr}="${key}"`))?.[1];

async function endpoint(handler: (ctx: never) => Promise<Response> | Response, pathname: string) {
  const site = new URL(SITE);
  const url = new URL(pathname, site);
  // The endpoints only read `site` and `url` from the context.
  return handler({ site, url, request: new Request(url) } as never);
}

describe('link preview and structured data [unit]', () => {
  it('the home page carries Open Graph and Twitter card tags with an absolute image URL', async () => {
    const html = head(await renderAstro(IndexPage));
    expect(meta(html, 'property', 'og:type')).toBe('website');
    expect(meta(html, 'property', 'og:title')).toContain('Rajat Arora');
    expect(meta(html, 'property', 'og:description')).toBeTruthy();
    expect(meta(html, 'property', 'og:url')).toBe(`${SITE}/`);
    expect(meta(html, 'property', 'og:image')).toBe(`${SITE}/og.png`);
    expect(meta(html, 'property', 'og:image:width')).toBe('1200');
    expect(meta(html, 'property', 'og:image:height')).toBe('630');
    expect(meta(html, 'property', 'og:image:alt')).toBeTruthy();
    expect(meta(html, 'name', 'twitter:card')).toBe('summary_large_image');
    expect(meta(html, 'name', 'twitter:image')).toBe(`${SITE}/og.png`);
    expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png"');
  });

  it('the home page has a Person record with email and profiles, never a telephone', async () => {
    const html = await renderAstro(IndexPage);
    const json = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    expect(json, 'JSON-LD present').toBeTruthy();
    const data = JSON.parse(json!) as Record<string, unknown>;
    expect(data['@type']).toBe('Person');
    expect(data.name).toBe('Rajat Arora');
    expect(data.url).toBe(`${SITE}/`);
    expect(data.email).toContain(contact.email.display);
    expect(data.sameAs).toEqual(expect.arrayContaining(['https://www.linkedin.com/in/rajata98', 'https://github.com/RajatA98']));
    expect(JSON.stringify(data)).not.toMatch(/telephone/i);
    expect(JSON.stringify(data)).not.toContain('7328741211');
    expect(JSON.stringify(data)).not.toContain(contact.phone.display);
  });

  it('the 404 page has no Person record and no Open Graph image of its own', async () => {
    const html = await renderAstro(NotFoundPage, { request: new Request(`${SITE}/404`) });
    expect(html).not.toContain('application/ld+json');
    expect(head(html)).toContain('name="robots" content="noindex');
  });
});

describe('crawler files and generated images [unit]', () => {
  it('robots.txt allows everything and points at the sitemap on the site host', async () => {
    const res = await endpoint(robots, '/robots.txt');
    expect(res.headers.get('content-type')).toContain('text/plain');
    const body = await res.text();
    expect(body).toMatch(/User-agent: \*\s*\nAllow: \//);
    expect(body).toContain(`Sitemap: ${SITE}/sitemap-index.xml`);
    expect(body).not.toMatch(/Disallow: \/\s*$/m);
  });

  it('og.png is a 1200 x 630 PNG rendered at build time', async () => {
    const res = await endpoint(ogImage, '/og.png');
    expect(res.headers.get('content-type')).toBe('image/png');
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    const info = await sharp(buf).metadata();
    expect([info.width, info.height]).toEqual([1200, 630]);
    expect(buf.length).toBeLessThan(300_000);
  });

  it('the card names the site host it is built for, and never the phone number', async () => {
    const { svg } = await renderOgCard({ host: 'example.test' });
    expect(svg).toMatch(/^<svg/);
    // satori draws text as paths, so the check is on the inputs it was given.
    const { text } = await renderOgCard({ host: 'example.test' });
    expect(text).toContain('Rajat Arora');
    expect(text).toContain('example.test');
    expect(text).not.toContain(contact.phone.display);
  });

  it('apple-touch-icon.png is a 180 x 180 PNG made from the favicon', async () => {
    const res = await endpoint(touchIcon, '/apple-touch-icon.png');
    expect(res.headers.get('content-type')).toBe('image/png');
    const info = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect([info.width, info.height]).toEqual([180, 180]);
  });
});

describe('colophon [unit]', () => {
  it('states the licenses, the AI-art disclosure, the privacy line and the source repo', async () => {
    const html = await renderAstro(ColophonPage, { request: new Request(`${SITE}/colophon`) });
    expect(html).toMatch(/<h1\b[^>]*>Colophon<\/h1>/);
    const text = stripTags(html).replace(/\s+/g, ' ');
    expect(text).toContain('SIL Open Font License');
    expect(text).toContain('GSAP');
    expect(text).toMatch(/no cookies/i);
    expect(text).toMatch(/Speed Insights/);
    expect(text).toMatch(/AI-assisted/);
    expect(text).toMatch(/no franchise assets/i);
    expect(html).toContain('href="https://github.com/RajatA98/RajatAroraPortfolio"');
    expect(findCopyViolations(text)).toEqual([]);
  });

  it('is linked from the footer and indexable', async () => {
    const footer = await renderAstro(SiteFooter);
    expect(footer).toMatch(/<a\b[^>]*href="\/colophon"/);
    const html = await renderAstro(ColophonPage, { request: new Request(`${SITE}/colophon`) });
    expect(head(html)).not.toContain('name="robots"');
    expect(head(html)).toContain(`<link rel="canonical" href="${SITE}/colophon"`);
  });
});

describe('content security policy [unit]', () => {
  it('Astro hashes its inline scripts and styles into an enforced policy', () => {
    const csp = (astroConfig as { security?: { csp?: unknown } }).security?.csp;
    expect(csp).toBeTruthy();
    expect(typeof csp).toBe('object');
    const c = csp as { directives?: string[]; scriptDirective?: { resources?: string[] } };
    expect(c.directives?.join(' ')).toContain("default-src 'self'");
    expect(c.directives?.join(' ')).toContain("object-src 'none'");
    expect(c.scriptDirective?.resources ?? []).not.toContain("'unsafe-inline'");
  });

  it('the header policy is enforced (not report-only) and carries what a meta tag cannot', () => {
    const path = fileURLToPath(new URL('../../vercel.json', import.meta.url));
    const config = JSON.parse(readFileSync(path, 'utf8')) as {
      headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
    };
    const all = config.headers.find((h) => h.source === '/(.*)')!.headers;
    expect(all.find((h) => h.key === 'Content-Security-Policy-Report-Only')).toBeUndefined();
    const csp = all.find((h) => h.key === 'Content-Security-Policy');
    expect(csp?.value).toContain("frame-ancestors 'none'");
    expect(csp?.value).not.toContain('unsafe-inline');
  });
});
