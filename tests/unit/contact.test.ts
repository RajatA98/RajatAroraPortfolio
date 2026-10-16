import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderAstro } from '../helpers/container';
import Contact from '../../src/components/Contact.astro';
import About from '../../src/components/About.astro';
import SiteFooter from '../../src/components/SiteFooter.astro';
import IndexPage from '../../src/pages/index.astro';
import { contact } from '../../src/data/site';
import { findCopyViolations, stripTags } from '../../src/lib/copy-rules';

const LINKEDIN = 'https://www.linkedin.com/in/rajata98';
const GITHUB = 'https://github.com/RajatA98';

function anchorFor(html: string, href: string): string {
  const escaped = href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.match(new RegExp(`<a\\b[^>]*href="${escaped}"[^>]*>`))?.[0] ?? '';
}

describe('contact [unit]', () => {
  it('renders the email and phone as real mailto: and tel: links with the display values', async () => {
    const html = await renderAstro(Contact);
    expect(html).toContain('href="mailto:rajat1998@gmail.com"');
    expect(html).toContain('href="tel:+17328741211"');
    expect(html).toMatch(/<a\b[^>]*href="mailto:rajat1998@gmail\.com"[^>]*>\s*rajat1998@gmail\.com\s*<\/a>/);
    expect(html).toMatch(/<a\b[^>]*href="tel:\+17328741211"[^>]*>\s*732-874-1211\s*<\/a>/);
    expect(html).not.toMatch(/user-select:\s*none/);
  });

  it('has a copy button for each, with an accessible label, hidden until the script runs', async () => {
    const html = await renderAstro(Contact);
    const buttons = html.match(/<button\b[^>]*data-copy[^>]*>/g) ?? [];
    expect(buttons).toHaveLength(2);
    for (const b of buttons) {
      expect(b).toContain('type="button"');
      expect(b).toMatch(/\bhidden\b/);
    }
    expect(html).toMatch(/<button\b[^>]*aria-label="Copy email address"/);
    expect(html).toMatch(/<button\b[^>]*aria-label="Copy phone number"/);
    expect(html).toContain(`data-copy="${contact.email.display}"`);
    expect(html).toContain(`data-copy="${contact.phone.display}"`);
  });

  it('has a polite live region for copy feedback', async () => {
    const html = await renderAstro(Contact);
    expect(html).toMatch(/<[a-z]+\b[^>]*aria-live="polite"[^>]*data-copy-status/);
  });

  it('shows the CTA line', async () => {
    const html = await renderAstro(Contact);
    expect(stripTags(html)).toContain(contact.ctaLine);
  });

  it('links LinkedIn and GitHub off-site with rel="noopener" and a new-tab hint', async () => {
    const html = await renderAstro(Contact);
    for (const href of [LINKEDIN, GITHUB]) {
      const a = anchorFor(html, href);
      expect(a, href).not.toBe('');
      expect(a).toContain('rel="noopener"');
      expect(a).toContain('target="_blank"');
    }
    expect(html).toContain('(opens in a new tab)');
  });

  it('never puts the phone number in the head of the home page', async () => {
    const html = await renderAstro(IndexPage);
    const head = html.slice(0, html.indexOf('<body'));
    expect(html.indexOf('<body')).toBeGreaterThan(0);
    expect(head).not.toContain(contact.phone.display);
    expect(head).not.toContain('7328741211');
    // and it is on the page, in the body
    expect(html.slice(html.indexOf('<body'))).toContain(contact.phone.display);
  });

  it('the footer does not repeat a CTA line and links to #contact', async () => {
    const html = await renderAstro(SiteFooter);
    // "/#contact", so the link also works from the 404 page.
    expect(html).toMatch(/<a\b[^>]*href="\/#contact"/);
    expect(stripTags(html)).not.toContain('could be your team');
    expect(html).toContain('aria-label="Quick actions"');
  });

  it('the résumé is cached briefly and never immutable', () => {
    const path = fileURLToPath(new URL('../../vercel.json', import.meta.url));
    const config = JSON.parse(readFileSync(path, 'utf8')) as {
      headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }>;
    };
    const rule = config.headers.find((h) => h.source === '/RajatArora-Resume.pdf');
    expect(rule).toBeDefined();
    const cc = rule!.headers.find((h) => h.key.toLowerCase() === 'cache-control');
    expect(cc?.value).toBe('public, max-age=300, must-revalidate');
    expect(cc?.value).not.toContain('immutable');
  });
});

describe('about [unit]', () => {
  it('is a short human stub that mentions triathlon', async () => {
    const html = await renderAstro(About);
    const text = stripTags(html).replace(/\s+/g, ' ').trim();
    expect(text.toLowerCase()).toContain('triathlon');
    expect(html).toContain('id="about"');
    const sentences = text.replace(/^About\s*/, '').split(/(?<=[.!?])\s+/).filter(Boolean);
    expect(sentences.length).toBeGreaterThanOrEqual(2);
    expect(sentences.length).toBeLessThanOrEqual(4);
  });
});

describe('copy rules for contact and about [unit]', () => {
  it('Contact, About and the footer pass the copy rules', async () => {
    for (const c of [Contact, About, SiteFooter]) {
      const html = await renderAstro(c);
      expect(findCopyViolations(stripTags(html))).toEqual([]);
    }
  });
});
