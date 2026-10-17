import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Build-Phase 6 (Launch): the crawler files and generated images are served,
// the colophon is a real page, and the enforced Content Security Policy that
// Astro writes into the page (hashed inline scripts and styles) blocks
// nothing the site needs: no violation during load, the voyage, or a copy.

test.describe('launch files [e2e]', () => {
  test('robots.txt, og.png and apple-touch-icon.png are served with the right types', async ({ request }) => {
    const robots = await request.get('/robots.txt');
    expect(robots.status()).toBe(200);
    expect(robots.headers()['content-type']).toContain('text/plain');
    expect(await robots.text()).toContain('sitemap-index.xml');

    const og = await request.get('/og.png');
    expect(og.status()).toBe(200);
    expect(og.headers()['content-type']).toContain('image/png');
    expect((await og.body()).length).toBeGreaterThan(5_000);

    const icon = await request.get('/apple-touch-icon.png');
    expect(icon.status()).toBe(200);
    expect(icon.headers()['content-type']).toContain('image/png');

    const sitemap = await request.get('/sitemap-index.xml');
    expect(sitemap.status()).toBe(200);
  });

  test('the colophon page passes axe and keeps the three actions one click away', async ({ page }) => {
    await page.goto('/colophon');
    await expect(page.locator('h1')).toHaveText('Colophon');
    await expect(page.locator('[data-action-bar]').locator('visible=true').first()).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe('content security policy [e2e]', () => {
  test('the page ships an enforced policy and nothing on it violates the policy', async ({ page }, info) => {
    const violations: string[] = [];
    page.on('console', (m) => {
      if (/content security policy|refused to/i.test(m.text())) violations.push(m.text());
    });
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`);
      });
    });
    await page.goto('/?voyage=debug');
    const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
    expect(policy).toBeTruthy();
    expect(policy).toContain("default-src 'self'");
    expect(policy).not.toContain('unsafe-inline');

    // Exercise every script path: the copy button, and on desktop the voyage.
    await page.locator('#contact').scrollIntoViewIfNeeded();
    await page.locator('button[data-copy]').first().click();
    if (!info.project.name.startsWith('mobile')) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForFunction(() => window.__voyage?.mounted === true, null, { timeout: 15_000 }).catch(() => {});
    }
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(500);
    // The Speed Insights loader is a same-origin script that 404s on a local preview; not a CSP matter.
    expect(violations.filter((v) => !/speed-insights/.test(v))).toEqual([]);
  });
});
