import { expect, test, type Page } from '@playwright/test';
import { stops } from '../../src/data/stops';

// The 3D voyage spike on /. State, never pixels. The hook is exposed with ?voyage=debug.
const PAGE = '/?voyage=debug';
const DESKTOP = { width: 1440, height: 900 };
// window.__scene is declared by the island (src/components/scene/Voyage3D.tsx).
declare global { interface Window { __shifts?: Array<{ value: number; hadRecentInput: boolean; inIsland: boolean }> } }

const isMobile = (name: string) => name.startsWith('mobile');
const hook = (page: Page) => page.evaluate(() => ({ ...window.__scene! }));
async function live(page: Page) {
  await page.waitForFunction(() => window.__scene?.state === 'live' || window.__scene?.state === 'static', null, { timeout: 20_000 });
  const h = await hook(page);
  test.skip(h.state === 'static', 'this machine failed the GPU probe; the 2D page is the correct result here');
}

test.describe('3D voyage, desktop [e2e]', () => {
  test.use({ viewport: DESKTOP });

  test('mounts behind the page with zero layout shift, and the scene follows scroll', async ({ page }, info) => {
    test.skip(isMobile(info.project.name), 'desktop case');
    await page.addInitScript(() => {
      window.__shifts = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean; sources?: Array<{ node?: Node | null }> }>) {
          const inIsland = (e.sources ?? []).some((s) => { const n = s.node; const el = n && (n.nodeType === 1 ? (n as Element) : n.parentElement); return !!el?.closest?.('[data-scene-root]'); });
          window.__shifts!.push({ value: e.value, hadRecentInput: e.hadRecentInput, inIsland });
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(PAGE);
    const heightBefore = await page.evaluate(() => document.documentElement.scrollHeight);
    await live(page);
    await expect(page.locator('canvas[data-scene-canvas]')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('[data-scene-root]')).toHaveAttribute('data-scene-live', '');
    // Nothing between the root background and the page boxes paints over the canvas layer.
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(heightBefore);
    expect((await hook(page)).triggers).toBe(1);

    const samples: number[] = [];
    const total = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    for (let i = 0; i <= 10; i++) {
      await page.evaluate((y) => window.scrollTo(0, y), Math.round((total * i) / 10));
      await page.waitForFunction((yy) => Math.abs(window.scrollY - yy) <= 1, Math.round((total * i) / 10));
      await page.waitForTimeout(900); // scrub 0.6 s settles
      samples.push((await hook(page)).progress);
    }
    for (let i = 1; i < samples.length; i++) expect(samples[i]!).toBeGreaterThanOrEqual(samples[i - 1]!);
    expect(samples.at(-1)!).toBeGreaterThan(0.99);

    const shifts = await page.evaluate(() => window.__shifts!);
    expect(shifts.filter((s) => s.inIsland && !s.hadRecentInput).reduce((a, s) => a + s.value, 0)).toBe(0);
    expect(shifts.filter((s) => !s.hadRecentInput).reduce((a, s) => a + s.value, 0)).toBeLessThan(0.05);
  });

  test('a deep link mounts already at that point of the voyage', async ({ page }, info) => {
    test.skip(isMobile(info.project.name), 'desktop case');
    await page.goto('/?voyage=debug#contact');
    await live(page);
    await expect.poll(async () => (await hook(page)).progress).toBeGreaterThan(0.8);
  });

  test('pause freezes the frame, leaves anchors native, and play resumes without a rebuild', async ({ page }, info) => {
    test.skip(isMobile(info.project.name), 'desktop case');
    await page.goto(PAGE);
    await live(page);
    const pause = page.locator('[data-scene-pause]');
    await expect(pause).toHaveText('Pause the sea');
    await pause.click();
    await expect(pause).toHaveText('Sail on');
    await page.waitForFunction(() => window.__scene?.state === 'paused' && window.__scene.triggers === 0);
    // Spec 3.7: the frozen frame stays; no frames are drawn while paused.
    await expect(page.locator('canvas[data-scene-canvas]')).toHaveCount(1);
    const frames = (await hook(page)).frames;
    await page.waitForTimeout(400);
    expect((await hook(page)).frames).toBe(frames);
    // A visitor is on `/`; drop the debug query so the footer link is a same-document jump, not a reload.
    await page.evaluate(() => history.replaceState(null, '', '/'));
    await page.locator('footer a[href="/#contact"]').click();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#contact');
    await pause.click();
    await page.waitForFunction(() => window.__scene?.state === 'live' && window.__scene.triggers === 1, null, { timeout: 2000 });
    expect((await hook(page)).probes).toBe(1);
    await expect(page.locator('canvas[data-scene-canvas]')).toHaveCount(1);
    await expect.poll(async () => (await hook(page)).frames).toBeGreaterThan(frames);
  });

  test('a failed probe stays 2D with no canvas or button, and is remembered for the session', async ({ page }, info) => {
    test.skip(isMobile(info.project.name), 'desktop case');
    await page.goto('/?voyage=debug&probe=fail');
    await page.waitForFunction(() => window.__scene?.state === 'static' && window.__scene.probes === 1, null, { timeout: 20_000 });
    await expect(page.locator('canvas[data-scene-canvas]')).toHaveCount(0);
    await expect(page.locator('[data-scene-pause]')).toBeHidden();
    const scripts: string[] = [];
    page.on('request', (r) => { if (r.resourceType() === 'script') scripts.push(r.url()); });
    await page.goto(PAGE);
    await page.waitForTimeout(2500);
    expect((await hook(page)).state).toBe('static');
    expect(scripts.filter((u) => /\/scene\.[^/]*\.js$/.test(u))).toEqual([]);
  });

  test('the scrub smooths a jump: the scene trails the scroll, then arrives', async ({ page }, info) => {
    test.skip(isMobile(info.project.name), 'desktop case');
    await page.goto(PAGE);
    await live(page);
    // Two frames after a jump to the end, the smoothed progress is still on its way.
    const early = await page.evaluate(async () => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      for (let i = 0; i < 2; i++) await new Promise((r) => requestAnimationFrame(r));
      return window.__scene!.progress;
    });
    expect(early).toBeLessThan(0.9);
    await expect.poll(async () => (await hook(page)).progress, { timeout: 4000 }).toBeGreaterThan(0.99);
  });

  test('narrowing the window below 1024px tears the scene down cleanly', async ({ page }, info) => {
    test.skip(isMobile(info.project.name), 'desktop case');
    await page.goto(PAGE);
    await live(page);
    const y = await page.evaluate(() => { window.scrollTo(0, 2000); return window.scrollY; });
    await page.setViewportSize({ width: 900, height: 900 });
    await page.waitForFunction(() => window.__scene?.state === 'static' && window.__scene.triggers === 0);
    await expect(page.locator('canvas[data-scene-canvas]')).toHaveCount(0);
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - y)).toBeLessThan(2);
  });

  test('a failed Three.js download leaves the 2D page, once, with no error loop', async ({ page }, info) => {
    test.skip(isMobile(info.project.name), 'desktop case');
    let attempts = 0;
    // Three.js lives in the scene chunk (Rolldown folds a manual chunk's dependencies into it).
    await page.route(/\/_astro\/(three|scene)\.[^/]*\.js$/, (route) => { attempts++; void route.abort(); });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(PAGE);
    await page.waitForFunction(() => window.__scene?.state === 'static', null, { timeout: 20_000 });
    await page.waitForTimeout(1500);
    expect(attempts).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await expect(page.locator('section#voyage li[data-stop-id]')).toHaveCount(stops.length);
  });
});

test.describe('3D voyage, never on a phone or under reduced motion [e2e]', () => {
  test('phone requests no Three.js and has no scene hook', async ({ page }, info) => {
    test.skip(!isMobile(info.project.name), 'mobile case');
    const scripts: string[] = [];
    page.on('request', (r) => { if (r.resourceType() === 'script') scripts.push(r.url()); });
    await page.goto(PAGE);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(600);
    expect(scripts.filter((u) => /three|scene|Voyage3D/i.test(u))).toEqual([]);
    expect(await page.evaluate(() => typeof window.__scene)).toBe('undefined');
  });

  test('desktop with reduced motion never mounts', async ({ browser }, info) => {
    test.skip(isMobile(info.project.name), 'desktop viewport case');
    const ctx = await browser.newContext({ viewport: DESKTOP, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    const scripts: string[] = [];
    page.on('request', (r) => { if (r.resourceType() === 'script') scripts.push(r.url()); });
    await page.goto(PAGE);
    await page.waitForTimeout(800);
    expect(scripts.filter((u) => /three|scene|Voyage3D/i.test(u))).toEqual([]);
    await expect(page.locator('canvas')).toHaveCount(0);
    await ctx.close();
  });
});
