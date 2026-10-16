import { defineConfig, devices } from '@playwright/test';

// E2E runs against a local `astro preview` of the built site (Plan: never the
// Vercel URL). `npm run build` must run before `npm run test:e2e`.
// PW_PORT (and ASTRO_OUT_DIR, read by astro.config.mjs) let several local
// runs coexist; CI uses the defaults.
const port = Number(process.env.PW_PORT ?? 4321);

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'on-first-retry',
  },
  webServer: {
    // --ignore-lock: Astro 7 holds a project-wide preview lock in .astro/, which
    // otherwise blocks a second preview (parallel local runs, or a stale lock).
    command: `npx astro preview --port ${port} --host 127.0.0.1 --ignore-lock`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
});
