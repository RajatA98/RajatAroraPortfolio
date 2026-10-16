import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { stops } from '../../src/data/stops';
import { formatDates } from '../../src/components/voyage/format-dates';

// Build-Phase 4: the static Voyage on the home page. It must be complete on
// its own under reduced motion, with JavaScript off, and on a phone. No
// animation is involved here; the desktop island is Phase 5.

const SECTION = 'section#voyage';
const LIST = `${SECTION} ol[data-voyage-list]`;

/** Every stop's place, chapter, role, dates and ship size are readable. */
async function expectTimelineReadable(page: Page) {
  const items = page.locator(`${LIST} > li[data-stop-id]`);
  await expect(items).toHaveCount(stops.length);
  for (const [i, stop] of stops.entries()) {
    const li = items.nth(i);
    await expect(li).toHaveAttribute('data-stop-id', stop.id);
    await expect(li).toContainText(stop.place);
    await expect(li).toContainText(stop.chapter);
    await expect(li).toContainText(stop.role);
    await expect(li).toContainText(formatDates(stop.dates));
    await expect(li.locator('img[data-ship-badge]')).toHaveAttribute('alt', `${stop.shipSize} ship`);
    await expect(li.locator('[data-stop-place]')).toBeVisible();
  }
}

test.describe('The Voyage on / [e2e]', () => {
  test('is chapter 3 between the Log and About', async ({ page }) => {
    await page.goto('/');
    const order = await page.evaluate(() =>
      ['log', 'voyage', 'about', 'contact'].map((id) => document.getElementById(id)!.getBoundingClientRect().top),
    );
    expect(order[0]).toBeLessThan(order[1]!);
    expect(order[1]).toBeLessThan(order[2]!);
    expect(order[2]).toBeLessThan(order[3]!);
    await expect(page.locator(`${SECTION} h2#voyage-title`)).toHaveText('The Voyage');
  });

  test('reduced motion: every stop is readable as plain text', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('/#voyage');
    await expectTimelineReadable(page);
    await ctx.close();
  });

  test('JavaScript off: the complete timeline is still there', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('/#voyage');
    await expectTimelineReadable(page);
    await expect(page.locator(`${SECTION} [data-milestone]`)).toHaveCount(2);
    await ctx.close();
  });

  test('Tab moves through the stops in voyage order', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Safari only tabs to links and buttons with Option+Tab by default');
    await page.goto('/#voyage');
    const first = page.locator(`${LIST} > li`).first().locator('[data-stop-place]');
    await first.focus();
    await expect(first).toBeFocused();
    for (let i = 1; i < stops.length; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => document.activeElement?.getAttribute('href'));
      expect(focused, `tab ${i}`).toBe(`#stop-${stops[i]!.id}`);
    }
  });

  test('390px: no horizontal scroll and every stop link is at least 44px tall', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/#voyage');
    const overflow = await page.evaluate(() => {
      const el = document.scrollingElement ?? document.documentElement;
      return el.scrollWidth - window.innerWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);
    const links = page.locator(`${SECTION} a`);
    const n = await links.count();
    expect(n).toBeGreaterThanOrEqual(stops.length);
    for (let i = 0; i < n; i++) {
      const box = await links.nth(i).boundingBox();
      expect(box, `link ${i}`).not.toBeNull();
      expect(box!.height, `link ${i}`).toBeGreaterThanOrEqual(44);
    }
  });

  test('/#voyage scrolls the chapter into view with the action bar still reachable', async ({ page }) => {
    await page.goto('/#voyage');
    await expect
      .poll(() =>
        page.evaluate(() => {
          const top = document.getElementById('voyage')!.getBoundingClientRect().top;
          return top >= 0 && top < window.innerHeight;
        }),
      )
      .toBe(true);
    const visibleBars = page.locator('[data-action-bar]').locator('visible=true');
    let inView = false;
    for (let i = 0; i < (await visibleBars.count()); i++) {
      const box = await visibleBars.nth(i).boundingBox();
      const vh = page.viewportSize()!.height;
      if (box && box.y + box.height > 0 && box.y < vh) inView = true;
    }
    expect(inView).toBe(true);
  });

  test('axe finds no WCAG 2 A/AA violations', async ({ page }) => {
    await page.goto('/#voyage');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });
});
