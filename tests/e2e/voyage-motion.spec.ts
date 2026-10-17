import { expect, test, type Page } from '@playwright/test';
import { stops } from '../../src/data/stops';
import { formatDates } from '../../src/components/voyage/format-dates';

// Build-Phase 5: the animated Voyage on the home page, desktop only. Runs
// against the preview build. Assertions target STATE (aria-current, data
// attributes, computed opacity, the window.__voyage hook the island exposes
// when the URL carries ?voyage=debug), never pixels and never fps (fps is the
// perf-trace protocol in docs/ci-gates.md).

const PAGE = '/?voyage=debug';
const ROOT = '[data-voyage-root]';
const LIST = `${ROOT} ol[data-voyage-list]`;
const DESKTOP = { width: 1440, height: 900 };

// window.__voyage is declared by the island (src/components/voyage/Voyage.tsx).
type VoyageHook = NonNullable<Window['__voyage']>;
type Shift = { value: number; hadRecentInput: boolean; inIsland: boolean };

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

/** client:media hydrates at load on desktop; wait for the hook, then the mount. */
async function mounted(page: Page) {
  await page.waitForFunction(() => typeof window.__voyage === 'object');
  await page.waitForFunction(() => window.__voyage?.mounted === true);
}

/** Every stop's place, chapter, role, dates and ship size are readable. */
async function expectListReadable(page: Page) {
  const items = page.locator(`${LIST} > li[data-stop-id]`);
  await expect(items).toHaveCount(stops.length);
  for (const [i, stop] of stops.entries()) {
    const li = items.nth(i);
    await expect(li).toContainText(stop.place);
    await expect(li).toContainText(stop.chapter);
    await expect(li).toContainText(stop.role);
    await expect(li).toContainText(formatDates(stop.dates));
    await expect(li.locator('img[data-ship-badge]')).toHaveAttribute('alt', `${stop.shipSize} ship`);
    await expect(li.locator('[data-stop-place]')).toBeVisible();
  }
}

/** Section bounds in document coordinates: where the pin starts and ends. */
async function pinBounds(page: Page) {
  return page.evaluate((sel) => {
    const r = document.querySelector(sel)!.querySelector('[data-voyage-section]')!.getBoundingClientRect();
    return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY - window.innerHeight };
  }, ROOT);
}

const opacityOf = (page: Page, selector: string) =>
  page.evaluate((sel) => Number(getComputedStyle(document.querySelector(sel)!).opacity), selector);

/**
 * Scroll to `y` and wait until the browser has landed there and ScrollTrigger
 * has had two frames to process the scroll event (its update runs on its own
 * ticker, which lags under CI load; a fixed sleep read stale progress on WebKit).
 */
async function scrollAndSettle(page: Page, y: number) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await page.waitForFunction((yy) => Math.abs(window.scrollY - yy) <= 1, y);
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await page.waitForTimeout(80);
}

test.describe('desktop: the ship sails the stops [e2e]', () => {
  test.use({ viewport: DESKTOP });

  test('scrolls through every stop in order, pinned, with zero shift from the island', async ({ page }, info) => {
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

    await page.goto(PAGE);
    const docHeightBefore = await page.evaluate(() => document.documentElement.scrollHeight);
    await mounted(page);
    expect((await hook(page)).triggers).toBeGreaterThan(0);
    // The reserved CSS height means mounting never changes the document height.
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(docHeightBefore);

    // The first stop's details are visible from the start; the last stop's are not yet.
    const lastId = stops.at(-1)!.id;
    expect(await opacityOf(page, `${LIST} > li[data-stop-id="${stops[0]!.id}"] [data-stop-detail]`)).toBe(1);
    expect(await opacityOf(page, `${LIST} > li[data-stop-id="${lastId}"] [data-stop-detail]`)).toBe(0);
    expect(await opacityOf(page, `${LIST} > li[data-stop-id="${lastId}"] [data-stop-detail]:last-child`)).toBe(0);

    const { top, bottom } = await pinBounds(page);
    const stickyTop = await page.evaluate(
      (sel) => parseFloat(getComputedStyle(document.querySelector(sel)!.querySelector('.voyage__stage')!).top) || 0,
      ROOT,
    );

    const steps = 27;
    const progress: number[] = [];
    const actives: number[] = [];
    for (let i = 0; i <= steps + 1; i++) {
      const y = Math.round(top + ((bottom - top) * Math.min(i, steps)) / steps) + (i > steps ? 40 : 0);
      await scrollAndSettle(page, y);
      const v = await hook(page);
      progress.push(v.progress);
      actives.push(v.active);
      if (i > 0 && i < steps) {
        // Pinned: the stage holds just under the header through the section.
        const stageTop = await page.evaluate(
          (sel) => document.querySelector(sel)!.querySelector('.voyage__stage')!.getBoundingClientRect().top,
          ROOT,
        );
        expect(Math.abs(stageTop - stickyTop), `stage pinned at step ${i}`).toBeLessThanOrEqual(1);
      }
      const current = page.locator(`${LIST} > li[aria-current="step"]`);
      await expect(current).toHaveCount(1);
      await expect(current).toHaveAttribute('data-stop-id', stops[v.active]!.id);
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

    // Arrived: the last stop's details are revealed and the ship is at its largest.
    await page.waitForTimeout(800); // let the scrub settle
    expect(await opacityOf(page, `${LIST} > li[data-stop-id="${lastId}"] [data-stop-detail]:last-child`)).toBe(1);
    expect(await opacityOf(page, `${ROOT} img[data-ship-sprite="${stops.at(-1)!.shipSize}"]`)).toBe(1);
    expect(await opacityOf(page, `${ROOT} img[data-ship-sprite="${stops[0]!.shipSize}"]`)).toBe(0);

    const shifts = await page.evaluate(() => window.__shifts!);
    const islandShift = shifts.filter((s) => s.inIsland && !s.hadRecentInput).reduce((a, s) => a + s.value, 0);
    const cls = shifts.filter((s) => !s.hadRecentInput).reduce((a, s) => a + s.value, 0);
    expect(islandShift).toBe(0);
    expect(cls).toBeLessThan(0.05);
  });

  test('pause tears everything down and leaves the complete list; play rebuilds', async ({ page }, info) => {
    test.skip(isMobileProject(info.project.name), 'desktop case');
    await page.goto(PAGE);
    await mounted(page);
    const { top, bottom } = await pinBounds(page);
    await scrollAndSettle(page, Math.round(top + (bottom - top) * 0.5));

    const toggle = page.locator('[data-voyage-toggle]');
    await expect(toggle).toHaveText('Pause the voyage');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveText('Play the voyage');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await page.waitForFunction(() => window.__voyage?.triggers === 0 && window.__voyage.mounted === false);
    await expect(page.locator(`${ROOT} [aria-current="step"]`)).toHaveCount(0);
    await expect(page.locator('.pin-spacer')).toHaveCount(0);
    await expect(page.locator(ROOT)).toHaveAttribute('data-motion', 'off');
    // Paused: the section collapsed, and the voyage was brought back into view rather than left behind.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const r = document.querySelector('[data-voyage-root]')!.getBoundingClientRect();
          return r.top >= 0 && r.top < window.innerHeight;
        }),
      )
      .toBe(true);
    // Paused: the inline styles the animation added are gone, every detail reads at full opacity.
    for (const stop of stops) {
      expect(await opacityOf(page, `${LIST} > li[data-stop-id="${stop.id}"] [data-stop-detail]:last-child`)).toBe(1);
    }
    await expectListReadable(page);

    await toggle.click();
    await page.waitForFunction(() => window.__voyage?.mounted === true && window.__voyage.triggers > 0);
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator(ROOT)).toHaveAttribute('data-motion', 'on');
  });

  test('a stop link sails the voyage to that stop instead of jumping', async ({ page }, info) => {
    test.skip(isMobileProject(info.project.name), 'desktop case');
    await page.goto(PAGE);
    await mounted(page);
    const { top } = await pinBounds(page);
    await scrollAndSettle(page, top);
    const target = stops[5]!;
    await page.locator(`${LIST} > li[data-stop-id="${target.id}"] a[data-stop-place]`).click();
    await expect.poll(async () => (await hook(page)).active).toBe(5);
    await expect(page.locator(`${LIST} > li[aria-current="step"]`)).toHaveAttribute('data-stop-id', target.id);
    // Not a hash jump: the URL fragment is untouched.
    expect(new URL(page.url()).hash).toBe('');
  });

  test('Tab reaches the toggle, then each stop in order', async ({ page, browserName }, info) => {
    test.skip(isMobileProject(info.project.name), 'desktop keyboard case');
    await page.goto(PAGE);
    await mounted(page);
    await page.locator('[data-voyage-toggle]').focus();
    // WebKit only tabs to links/buttons with Safari's "Press Tab to highlight
    // each item" setting, which Playwright exposes as Alt+Tab.
    const tabKey = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
    const seen: string[] = ['toggle'];
    for (let i = 0; i < stops.length; i++) {
      await page.keyboard.press(tabKey);
      const id = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        const li = el?.closest('li[data-stop-id]');
        return li ? `stop:${li.getAttribute('data-stop-id')}` : (el?.tagName ?? '');
      });
      seen.push(id);
    }
    expect(seen).toEqual(['toggle', ...stops.map((s) => `stop:${s.id}`)]);
  });
});

test.describe('never on a phone, never under reduced motion [e2e]', () => {
  test('phone: no React, no GSAP, no island hydration; the list is the whole voyage', async ({ page }, info) => {
    test.skip(!isMobileProject(info.project.name), 'mobile project case');
    const scripts: string[] = [];
    page.on('request', (r) => {
      if (r.resourceType() === 'script') scripts.push(r.url());
    });
    await page.goto(PAGE);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(600);
    expect(scripts.filter((u) => /gsap|react|Voyage/i.test(u))).toEqual([]);
    expect(await page.evaluate(() => typeof window.__voyage)).toBe('undefined');
    await expect(page.locator(`${ROOT} [aria-current="step"]`)).toHaveCount(0);
    await expect(page.locator('[data-voyage-toggle]')).toBeHidden();
    await expectListReadable(page);
  });

  test('desktop with reduced motion: nothing mounts, the static chart and list stand', async ({ browser }, info) => {
    test.skip(isMobileProject(info.project.name), 'desktop viewport case');
    const ctx = await browser.newContext({ viewport: DESKTOP, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const scripts: string[] = [];
    page.on('request', (r) => {
      if (r.resourceType() === 'script') scripts.push(r.url());
    });
    await page.goto(PAGE);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(600);
    expect(scripts.filter((u) => /gsap|react|Voyage/i.test(u))).toEqual([]);
    expect(await page.evaluate(() => typeof window.__voyage)).toBe('undefined');
    await expect(page.locator(`${ROOT} svg[data-voyage-chart]`)).toBeVisible();
    await expect(page.locator('[data-voyage-toggle]')).toBeHidden();
    await expectListReadable(page);
    await ctx.close();
  });
});
