import { expect, test, type Page } from '@playwright/test';
import { stops } from '../../src/data/stops';

// Phase 1 GSAP spike, /lab/voyage-spike. Runs against the preview build.
// Assertions target state (aria-current, data attributes, the window.__voyage
// test hook that the island exposes because the page sets data-testhook on
// the island root). Never pixels, never fps (fps is the perf-trace protocol).

const URL = '/lab/voyage-spike';
const ROOT = '[data-voyage-root]';
const DESKTOP = { width: 1440, height: 900 };

type VoyageHook = { active: number; progress: number; triggers: number; mounted: boolean };
type Shift = { value: number; hadRecentInput: boolean; inIsland: boolean };

// window.__voyage is declared by the island (src/components/voyage/VoyageSpike.tsx).
declare global {
  interface Window {
    __shifts?: Shift[];
  }
}

const isMobileProject = (name: string) => name.startsWith('mobile');

async function hook(page: Page): Promise<VoyageHook> {
  return page.evaluate(() => {
    const v = window.__voyage!;
    return { active: v.active, progress: v.progress, triggers: v.triggers, mounted: v.mounted };
  });
}

/** Bring the island into view so client:visible hydrates it, then wait for the hook. */
async function hydrate(page: Page) {
  await page.locator(ROOT).scrollIntoViewIfNeeded();
  await page.waitForFunction(() => typeof window.__voyage === 'object');
}

/** Every stop's place, role, dates and ship size must be readable as plain text. */
async function expectListReadable(page: Page) {
  const items = page.locator(`${ROOT} ol[data-voyage-list] > li`);
  await expect(items).toHaveCount(stops.length);
  for (const [i, stop] of stops.entries()) {
    const li = items.nth(i);
    await expect(li).toContainText(stop.place);
    await expect(li).toContainText(stop.chapter);
    await expect(li).toContainText(stop.role);
    if (stop.dates.start === null && stop.dates.end === null) {
      await expect(li).toContainText('dates to come');
    }
    const badge = li.locator('img[data-ship-badge]');
    await expect(badge).toHaveAttribute('alt', `${stop.shipSize} ship`);
    await expect(li.locator('[data-stop-place]')).toBeVisible();
  }
}

test.describe('reduced motion and JS off: the static list is the whole experience', () => {
  test.use({ viewport: DESKTOP, reducedMotion: 'reduce' });

  test('reduced motion: list complete, animation never mounts', async ({ page }, info) => {
    test.skip(isMobileProject(info.project.name), 'desktop viewport case');
    await page.goto(URL);
    await hydrate(page);
    await expectListReadable(page);
    await page.waitForTimeout(500);
    const v = await hook(page);
    expect(v.mounted).toBe(false);
    expect(v.triggers).toBe(0);
    await expect(page.locator(`${ROOT} [aria-current="step"]`)).toHaveCount(0);
  });

  test('JS disabled: list complete', async ({ browser }, info) => {
    test.skip(isMobileProject(info.project.name), 'desktop viewport case');
    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: DESKTOP });
    const page = await ctx.newPage();
    await page.goto(URL);
    await expectListReadable(page);
    await ctx.close();
  });
});

test.describe('mobile: list only', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('island never mounts the animation, no horizontal scroll, toggle hidden or >= 44px', async ({ page }, info) => {
    test.skip(!isMobileProject(info.project.name), 'mobile project case');
    await page.goto(URL);
    await hydrate(page);
    await expectListReadable(page);
    // Scroll the whole page; nothing should mount.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(600);
    const v = await hook(page);
    expect(v.mounted).toBe(false);
    expect(v.triggers).toBe(0);
    const toggle = page.locator('[data-voyage-toggle]');
    if (await toggle.isVisible()) {
      const box = (await toggle.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('desktop: pinned scrub', () => {
  test.use({ viewport: DESKTOP });

  test('scrolls forward through stops, zero mount shift, toggle tears down and rebuilds', async ({ page }, info) => {
    test.skip(isMobileProject(info.project.name), 'desktop case');

    // Registered before any page script, so it sees the island mount.
    await page.addInitScript(() => {
      window.__shifts = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as Array<{
          value: number;
          hadRecentInput: boolean;
          sources?: Array<{ node?: Node | null }>;
        }>) {
          const inIsland = (e.sources ?? []).some((s) => {
            const n = s.node;
            const el = n && (n.nodeType === 1 ? (n as Element) : n.parentElement);
            return !!el?.closest?.('[data-voyage-root]');
          });
          window.__shifts!.push({ value: e.value, hadRecentInput: e.hadRecentInput, inIsland });
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });

    await page.goto(URL);
    const docHeightBefore = await page.evaluate(() => document.documentElement.scrollHeight);
    await hydrate(page);
    await page.waitForFunction(() => window.__voyage?.mounted === true);
    expect((await hook(page)).triggers).toBeGreaterThan(0);
    // The pin-spacer must not change document height (height is reserved in CSS).
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(docHeightBefore);

    const { top, bottom } = await page.evaluate((sel) => {
      const r = document.querySelector(sel)!.querySelector('[data-voyage-section]')!.getBoundingClientRect();
      return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY - window.innerHeight };
    }, ROOT);

    const steps = 24;
    const progress: number[] = [];
    const actives: number[] = [];
    for (let i = 0; i <= steps + 1; i++) {
      const y = Math.round(top + ((bottom - top) * Math.min(i, steps)) / steps) + (i > steps ? 40 : 0);
      await page.evaluate((yy) => window.scrollTo(0, yy), y);
      await page.waitForTimeout(120);
      const v = await hook(page);
      progress.push(v.progress);
      actives.push(v.active);
      if (i > 0 && i < steps) {
        // Pinned: the stage holds the top of the viewport through the section.
        const stageTop = await page.evaluate(
          (sel) => document.querySelector(sel)!.querySelector('.voyage__stage')!.getBoundingClientRect().top,
          ROOT,
        );
        expect(Math.abs(stageTop), `stage pinned at step ${i}`).toBeLessThanOrEqual(1);
      }
      if (v.active >= 0) {
        const current = page.locator(`${ROOT} ol[data-voyage-list] > li[aria-current="step"]`);
        await expect(current).toHaveCount(1);
        await expect(current).toHaveAttribute('data-stop-id', stops[v.active]!.id);
      }
    }

    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]!, `progress step ${i}`).toBeGreaterThanOrEqual(progress[i - 1]!);
      expect(actives[i]!, `active step ${i}`).toBeGreaterThanOrEqual(actives[i - 1]!);
    }
    expect(progress.at(-1)!).toBeGreaterThan(0.99);
    expect(actives[0]).toBe(0);
    expect(actives.at(-1)).toBe(stops.length - 1);
    expect(new Set(actives).size).toBe(stops.length); // every stop became active on the way
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(docHeightBefore);

    const shifts = await page.evaluate(() => window.__shifts!);
    const islandShift = shifts.filter((s) => s.inIsland && !s.hadRecentInput).reduce((a, s) => a + s.value, 0);
    const cls = shifts.filter((s) => !s.hadRecentInput).reduce((a, s) => a + s.value, 0);
    expect(islandShift).toBe(0);
    expect(cls).toBeLessThan(0.05);

    // Toggle off: everything torn down, list still readable.
    const toggle = page.locator('[data-voyage-toggle]');
    await expect(toggle).toHaveText('Pause the voyage');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveText('Play the voyage');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await page.waitForFunction(() => window.__voyage?.triggers === 0 && window.__voyage.mounted === false);
    await expect(page.locator(`${ROOT} [aria-current="step"]`)).toHaveCount(0);
    await expect(page.locator('.pin-spacer')).toHaveCount(0);
    await expectListReadable(page);

    // Toggle on: rebuilt.
    await toggle.click();
    await page.waitForFunction(() => window.__voyage?.mounted === true && window.__voyage.triggers > 0);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('keyboard', () => {
  test.use({ viewport: DESKTOP });

  test('Tab reaches the toggle, then each stop in order', async ({ page, browserName }, info) => {
    test.skip(isMobileProject(info.project.name), 'desktop keyboard case');
    await page.goto(URL);
    await hydrate(page);
    await page.waitForFunction(() => window.__voyage?.mounted === true);
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      (document.activeElement as HTMLElement | null)?.blur();
    });

    // WebKit only tabs to links/buttons with Safari's "Press Tab to highlight
    // each item" setting, which Playwright exposes as Alt+Tab.
    const tabKey = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    const seen: string[] = [];
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press(tabKey);
      const id = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return '';
        if (el.hasAttribute('data-voyage-toggle')) return 'toggle';
        const li = el.closest('li[data-stop-id]');
        return li ? `stop:${li.getAttribute('data-stop-id')}` : '';
      });
      if (id && !seen.includes(id)) seen.push(id);
      if (seen.length === stops.length + 1) break;
    }
    expect(seen).toEqual(['toggle', ...stops.map((s) => `stop:${s.id}`)]);
  });
});
