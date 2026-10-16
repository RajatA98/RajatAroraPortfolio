import { expect, test, type Page } from '@playwright/test';

const EMAIL = 'rajat1998@gmail.com';
const PHONE = '732-874-1211';

async function heroGeometry(page: Page) {
  const avatar = await page.locator('.hero .avatar').boundingBox();
  const h1 = await page.locator('.hero h1').boundingBox();
  return { avatar: avatar!, h1Y: h1!.y };
}

test.describe('error states [e2e]', () => {
  for (const [width, size] of [
    [390, 160],
    [1280, 240],
  ] as const) {
    test(`a failed avatar keeps its ${size}px box at ${width}px and nothing shifts`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      const normal = await heroGeometry(page);

      await page.route('**/avatar-placeholder.svg', (r) => r.abort());
      await page.reload();
      const broken = await heroGeometry(page);
      const loaded = await page
        .locator('.hero .avatar')
        .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
      expect(loaded).toBe(false);

      expect(broken.avatar.width).toBeCloseTo(size, 0);
      expect(broken.avatar.height).toBeCloseTo(size, 0);
      expect(broken.h1Y).toBeCloseTo(normal.h1Y, 0);
    });
  }

  test('an unknown path renders the 404 and "Read the log" reaches #log', async ({ page }) => {
    await page.goto('/no-such-page');
    await expect(page.getByRole('heading', { level: 1, name: 'Off the chart' })).toBeVisible();
    await page.getByRole('link', { name: 'Read the log' }).click();
    await expect(page).toHaveURL(/\/#log$/);
    await expect(page.locator('#log')).toHaveCount(1);
  });

  test('without JavaScript the copy buttons stay hidden and the values and links remain', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/#contact');
    const section = page.locator('#contact');
    await expect(section.locator('button[data-copy]')).toHaveCount(2);
    for (const b of await section.locator('button[data-copy]').all()) {
      await expect(b).toBeHidden();
    }
    await expect(section.getByText(EMAIL)).toBeVisible();
    await expect(section.getByText(PHONE)).toBeVisible();
    await expect(section.locator(`a[href="mailto:${EMAIL}"]`)).toHaveCount(1);
    await expect(section.locator('a[href="tel:+17328741211"]')).toHaveCount(1);
    await context.close();
  });
});
