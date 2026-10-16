import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Paths that must render the full shell. `/404` is the built 404.html; the
// unknown path checks that preview falls back to the same page.
const PATHS = ['/', '/404', '/no-such-page'];
const ACTIONS = ['resume', 'linkedin', 'github'] as const;

async function visibleActionBar(page: Page) {
  const bars = page.locator('[data-action-bar]');
  await expect(bars.first()).toBeVisible();
  return bars.locator('visible=true').first();
}

for (const path of PATHS) {
  test.describe(`shell on ${path} [e2e]`, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(path);
    });

    test('no horizontal scroll at 390px', async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const overflow = await page.evaluate(() => {
        const el = document.scrollingElement ?? document.documentElement;
        return el.scrollWidth - window.innerWidth;
      });
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test('three-action bar is visible without a click and every target is at least 44px', async ({ page }) => {
      const bar = await visibleActionBar(page);
      for (const action of ACTIONS) {
        await expect(bar.locator(`[data-action="${action}"]`)).toBeVisible();
      }
      const visibleBars = page.locator('[data-action-bar]').locator('visible=true');
      const n = await visibleBars.count();
      for (let i = 0; i < n; i++) {
        const links = visibleBars.nth(i).locator('a');
        const count = await links.count();
        for (let j = 0; j < count; j++) {
          const box = await links.nth(j).boundingBox();
          expect(box, `link ${j} in bar ${i}`).not.toBeNull();
          expect(box!.height).toBeGreaterThanOrEqual(44);
          expect(box!.width).toBeGreaterThanOrEqual(44);
        }
      }
    });

    test('mobile bottom bar shows only below 768px', async ({ page }) => {
      const dock = page.locator('[data-action-bar][aria-label="Quick actions"]');
      await page.setViewportSize({ width: 390, height: 844 });
      // WebKit can report the old viewport for a moment after the resize.
      await expect.poll(() => page.evaluate(() => window.innerHeight)).toBe(844);
      await expect(dock).toBeVisible();
      const box = await dock.boundingBox();
      expect(box!.y + box!.height).toBeCloseTo(844, 0);
      await page.setViewportSize({ width: 1024, height: 800 });
      await expect(dock).toBeHidden();
    });

    test('Tab reaches the skip link first, then the three actions', async ({ page, browserName }) => {
      test.skip(browserName === 'webkit', 'Safari only tabs to links with Option+Tab by default');
      const order: Array<string | null> = [];
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('Tab');
        order.push(
          await page.evaluate(() => {
            const el = document.activeElement as HTMLElement | null;
            return el?.dataset.action ?? el?.getAttribute('href') ?? null;
          }),
        );
      }
      expect(order).toEqual(['#main', ...ACTIONS]);
    });

    test('axe finds no WCAG 2 A/AA violations', async ({ page }) => {
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations).toEqual([]);
    });
  });
}
