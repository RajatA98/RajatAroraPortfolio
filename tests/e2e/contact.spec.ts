import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const EMAIL = 'rajat1998@gmail.com';
const PHONE = '732-874-1211';

test.describe('contact on / [e2e]', () => {
  test('#contact is visible after navigating to /#contact', async ({ page }) => {
    await page.goto('/#contact');
    await expect(page.locator('#contact')).toBeVisible();
    await expect(page.locator('#contact')).toBeInViewport();
  });

  test('email and phone links have the exact hrefs', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('#contact');
    await expect(section.getByRole('link', { name: EMAIL })).toHaveAttribute('href', `mailto:${EMAIL}`);
    await expect(section.getByRole('link', { name: PHONE })).toHaveAttribute('href', 'tel:+17328741211');
  });

  test('at 390px: no horizontal scroll, every control in #contact is at least 44px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const overflow = await page.evaluate(() => {
      const el = document.scrollingElement ?? document.documentElement;
      return el.scrollWidth - window.innerWidth;
    });
    expect(overflow).toBeLessThanOrEqual(0);
    const controls = page.locator('#contact').locator('a, button').locator('visible=true');
    const n = await controls.count();
    expect(n).toBeGreaterThanOrEqual(5);
    for (let i = 0; i < n; i++) {
      const box = await controls.nth(i).boundingBox();
      expect(box, `control ${i}`).not.toBeNull();
      expect(box!.height, `control ${i} height`).toBeGreaterThanOrEqual(44);
      expect(box!.width, `control ${i} width`).toBeGreaterThanOrEqual(44);
    }
  });

  test('Tab from the email link reaches its copy button', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Safari only tabs to links and buttons with Option+Tab by default');
    await page.goto('/');
    await page.locator('#contact').getByRole('link', { name: EMAIL }).focus();
    await page.keyboard.press('Tab');
    const label = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    expect(label).toBe('Copy email address');
  });

  test('copying the email works, or falls back to selecting it', async ({ page, context, browserName }, info) => {
    const strict = info.project.name === 'chromium';
    if (browserName === 'chromium') {
      await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    }
    await page.goto('/');
    const button = page.getByRole('button', { name: 'Copy email address' });
    const status = page.locator('#contact [data-copy-status]');
    await expect(button).toBeVisible();
    await button.click();

    if (strict) {
      await expect(status).toContainText('Copied');
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      expect(copied).toBe(EMAIL);
      return;
    }

    await expect(status).toHaveText(/Copied|Select and copy/);
    const text = (await status.textContent()) ?? '';
    if (/Select and copy/.test(text)) {
      const selected = await page.evaluate(() => window.getSelection()?.toString());
      expect(selected).toBe(EMAIL);
    }
  });

  test('axe finds no WCAG 2 A/AA violations on /', async ({ page }) => {
    await page.goto('/');
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });
});
