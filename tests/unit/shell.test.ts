import { describe, expect, it } from 'vitest';
import { renderAstro } from '../helpers/container';
import IndexPage from '../../src/pages/index.astro';
import NotFoundPage from '../../src/pages/404.astro';
import BaseLayout from '../../src/layouts/BaseLayout.astro';

const RESUME = '/RajatArora-Resume.pdf';
const LINKEDIN = 'https://www.linkedin.com/in/rajata98';
const GITHUB = 'https://github.com/RajatA98';

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('shell [unit]', () => {
  it('home page carries the three actions in at least two action bars', async () => {
    const html = await renderAstro(IndexPage);
    expect(html).toContain(`href="${RESUME}"`);
    expect(html).toContain(`href="${LINKEDIN}"`);
    expect(html).toContain(`href="${GITHUB}"`);
    expect(count(html, 'data-action-bar')).toBeGreaterThanOrEqual(2);
    for (const action of ['resume', 'linkedin', 'github']) {
      expect(count(html, `data-action="${action}"`)).toBeGreaterThanOrEqual(2);
    }
  });

  it('the bottom bar is labelled "Quick actions"', async () => {
    const html = await renderAstro(IndexPage);
    expect(html).toContain('aria-label="Quick actions"');
  });

  it('the skip link is the first link in the body', async () => {
    const html = await renderAstro(IndexPage);
    const body = html.slice(html.indexOf('<body'));
    const firstHref = body.match(/<a\b[^>]*href="([^"]+)"/);
    expect(firstHref?.[1]).toBe('#main');
    expect(html).toMatch(/<main[^>]*id="main"/);
  });

  it('404 links home and to the log', async () => {
    const html = await renderAstro(NotFoundPage, {
      request: new Request('https://rajatarora.com/404'),
    });
    expect(html).toMatch(/<a\b[^>]*href="\/"/);
    expect(html).toMatch(/<a\b[^>]*href="\/#log"/);
  });

  it('BaseLayout adds robots noindex only when asked', async () => {
    const withNoindex = await renderAstro(BaseLayout, { props: { title: 'Lab', noindex: true } });
    const without = await renderAstro(BaseLayout, { props: { title: 'Home' } });
    expect(withNoindex).toMatch(/<meta name="robots" content="noindex/);
    expect(without).not.toContain('name="robots"');
  });

  it('BaseLayout sets title, canonical, favicon and preloads exactly one font', async () => {
    const html = await renderAstro(BaseLayout, { props: { title: 'Home' } });
    expect(html).toContain('<title>Home</title>');
    expect(html).toContain('<link rel="canonical" href="https://rajatarora.com/"');
    expect(html).toContain('href="/favicon.svg"');
    const preloads = html.match(/<link\b[^>]*rel="preload"[^>]*as="font"[^>]*>/g) ?? [];
    expect(preloads).toHaveLength(1);
    expect(preloads[0]).toContain('crossorigin');
    expect(preloads[0]).toContain('.woff2');
  });

  it('the hero avatar reserves its space and is fetched first', async () => {
    const html = await renderAstro(IndexPage);
    const img = html.match(/<img\b[^>]*alt="Rajat Arora"[^>]*>/)?.[0] ?? '';
    expect(img).not.toBe('');
    expect(img).toMatch(/\bwidth="\d+"/);
    expect(img).toMatch(/\bheight="\d+"/);
    expect(img).toContain('fetchpriority="high"');
  });

  it('home copy follows the copy rules', async () => {
    const html = await renderAstro(IndexPage);
    const text = html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<[^>]+>/g, ' ');
    expect(text).toContain('I build AI products that work in production, and I prove it.');
    expect(text).not.toMatch(/—/); // no em dash
    expect(text).not.toMatch(/→/); // no arrow
    expect(text).not.toMatch(/\bjust\b/i);
  });
});
