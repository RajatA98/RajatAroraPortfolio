import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe("Captain's Log on / [e2e]", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('#log exists and holds at least one entry article', async ({ page }) => {
    const log = page.locator('section#log');
    await expect(log).toHaveCount(1);
    expect(await log.locator('article[id^="log-"]').count()).toBeGreaterThanOrEqual(1);
  });

  test('every table-of-contents link points at an entry on the page', async ({ page }) => {
    const hrefs = await page.locator('#log nav a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    expect(hrefs.length).toBeGreaterThanOrEqual(1);
    for (const href of hrefs) {
      await expect(page.locator(`article${href}`)).toHaveCount(1);
    }
  });

  test('no horizontal scroll at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => {
      const el = document.scrollingElement ?? document.documentElement;
      return el.scrollWidth - window.innerWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('every link inside #log is at least 44px tall', async ({ page }) => {
    const links = page.locator('#log a');
    const n = await links.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const box = await links.nth(i).boundingBox();
      expect(box, `link ${i}`).not.toBeNull();
      expect(box!.height, `link ${i}`).toBeGreaterThanOrEqual(44);
    }
  });

  test('/#log scrolls the section top into the viewport', async ({ page }) => {
    await page.goto('/#log');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const top = document.getElementById('log')!.getBoundingClientRect().top;
          return top >= 0 && top < window.innerHeight;
        }),
      )
      .toBe(true);
  });

  test('the three-action bar is in view while scrolled to #log', async ({ page }) => {
    // Below 768px the fixed bottom bar is in view; from 768px the header band
    // is sticky. Either way the three actions stay one click away at the Log.
    await page.goto('/#log');
    await expect
      .poll(() => page.evaluate(() => document.getElementById('log')!.getBoundingClientRect().top < window.innerHeight))
      .toBe(true);
    const visibleBars = page.locator('[data-action-bar]').locator('visible=true');
    let inView = false;
    for (let i = 0; i < (await visibleBars.count()); i++) {
      const bar = visibleBars.nth(i);
      const box = await bar.boundingBox();
      const vh = page.viewportSize()!.height;
      if (box && box.y + box.height > 0 && box.y < vh) {
        for (const action of ['resume', 'linkedin', 'github']) {
          await expect(bar.locator(`[data-action="${action}"]`)).toBeInViewport();
        }
        inView = true;
        break;
      }
    }
    expect(inView, 'a three-action bar is in the viewport at #log').toBe(true);
  });

  test('axe finds no WCAG 2 A/AA violations', async ({ page }) => {
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });
});
