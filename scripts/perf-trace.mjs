#!/usr/bin/env node
// Phase 1 go/no-go protocol, Chrome half: record a performance trace of one
// full scroll-through of the Voyage pinned section under 4x CPU throttling,
// driven by smooth mouse-wheel input over about 6 seconds.
//
// Usage:
//   node scripts/perf-trace.mjs [url] [out.json]
//   VOYAGE_URL=http://127.0.0.1:4322/lab/voyage-spike node scripts/perf-trace.mjs
// Defaults: url = $VOYAGE_URL or http://127.0.0.1:4321/lab/voyage-spike,
//           out = factory/artifacts/qa/traces/voyage-spike.trace.json
// Needs a running `astro preview` of a build. Summarize the result with
//   node scripts/fps-from-trace.mjs <out.json>
// Safari has no equivalent automation; the owner runs that half by hand in
// Web Inspector's Timelines tab.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? process.env.VOYAGE_URL ?? 'http://127.0.0.1:4321/lab/voyage-spike';
const out = resolve(process.argv[3] ?? process.env.VOYAGE_TRACE ?? 'factory/artifacts/qa/traces/voyage-spike.trace.json');
const SCROLL_MS = 6000;
const CATEGORIES = ['devtools.timeline', 'disabled-by-default-devtools.timeline.frame'].join(',');

// `channel: 'chromium'` runs full Chrome in new headless mode (a real
// compositor and GPU process), closer to a desktop visit than headless-shell.
const browser = await chromium.launch({ channel: 'chromium' }).catch(() => chromium.launch());
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

await page.goto(url, { waitUntil: 'load' });
await page.locator('[data-voyage-root]').scrollIntoViewIfNeeded();
await page
  .waitForFunction(() => window.__voyage?.mounted === true, null, { timeout: 15_000 })
  .catch(() => {
    throw new Error('Voyage animation never mounted (needs a desktop viewport, motion allowed, data-testhook on the island).');
  });

const { top, bottom } = await page.evaluate(() => {
  const r = document.querySelector('[data-voyage-section]').getBoundingClientRect();
  return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY - window.innerHeight };
});
// Start a little above the pin and finish a little past it.
await page.evaluate((y) => window.scrollTo(0, y), Math.max(0, top - 200));
await page.mouse.move(1000, 450);
await page.waitForTimeout(500);

const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await cdp.send('Tracing.start', { categories: CATEGORIES, transferMode: 'ReturnAsStream' });
await page.waitForTimeout(300);

// Window markers for fps-from-trace.mjs (TimeStamp events in devtools.timeline).
await page.evaluate(() => console.timeStamp('voyage-scroll-start'));
const distance = bottom - top + 400;
const t0 = Date.now();
// Smooth wheel scroll generated inside the browser (one wheel step per
// vsync, the same input source Chrome's smoothness benchmarks use). Driving
// page.mouse.wheel from Node instead starves the page of input under 4x
// throttling (round-trips land at ~20 Hz), which reads as dropped frames
// that are really frames nobody asked for.
await cdp.send('Input.synthesizeScrollGesture', {
  x: 1000,
  y: 450,
  yDistance: -distance,
  speed: Math.round(distance / (SCROLL_MS / 1000)),
  gestureSourceType: 'mouse',
  preventFling: true,
});
const scrolled = distance;
await page.waitForTimeout(800); // let the scrub settle
await page.evaluate(() => console.timeStamp('voyage-scroll-end'));
await page.waitForTimeout(200);

const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
await cdp.send('Tracing.end');
const { stream } = await done;
let json = '';
for (;;) {
  const chunk = await cdp.send('IO.read', { handle: stream });
  json += chunk.base64Encoded ? Buffer.from(chunk.data, 'base64').toString('utf8') : chunk.data;
  if (chunk.eof) break;
}
await cdp.send('IO.close', { handle: stream });
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

const final = await page.evaluate(() => ({ progress: window.__voyage?.progress, active: window.__voyage?.active }));
await browser.close();

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, json);
console.log(`trace written: ${out} (${(json.length / 1024).toFixed(0)} KB); scrolled ${scrolled}px in ${Date.now() - t0}ms; final progress ${final.progress?.toFixed(3)}, active stop ${final.active}`);
