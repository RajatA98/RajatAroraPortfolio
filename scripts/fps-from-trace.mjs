#!/usr/bin/env node
// Summarize a Voyage scroll-through trace (from scripts/perf-trace.mjs, or a
// trace saved from the DevTools Performance panel) into the Phase 1 go/no-go
// numbers. Exits 1 when the bar is missed: median < 50 fps or any frame > 32 ms.
//
// Usage: node scripts/fps-from-trace.mjs [trace.json]
//        (default factory/artifacts/qa/traces/voyage-spike.trace.json)
//
// Which events, and why:
//  - Window: between the `TimeStamp` events "voyage-scroll-start" and
//    "voyage-scroll-end" (console.timeStamp markers perf-trace.mjs adds). For a
//    DevTools-saved trace without markers, the window is first to last
//    `BeginFrame`. Either way the window then opens at the first wheel
//    `EventDispatch`, so pre-input idle vsyncs are not counted.
//  - Frame duration: the interval between consecutive `DrawFrame` events
//    (category disabled-by-default-devtools.timeline.frame) on the page's
//    compositor thread, i.e. the time between two frames actually drawn. The
//    thread is the pid/tid with the most `DrawFrame` events in the window.
//    A long interval during a continuous scroll is a frame the user waited for.
//  - Also reported (not gated): `DroppedFrame` count, and the longest main-thread
//    `AnimationFrame` (devtools.timeline), which shows whether the main thread
//    or the compositor is the bottleneck.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = resolve(process.argv[2] ?? 'factory/artifacts/qa/traces/voyage-spike.trace.json');
const raw = JSON.parse(readFileSync(file, 'utf8'));
const events = Array.isArray(raw) ? raw : raw.traceEvents;
if (!Array.isArray(events)) {
  console.error(`No traceEvents in ${file}`);
  process.exit(2);
}

const MIN_MEDIAN_FPS = 50;
const MAX_FRAME_MS = 32;

const marker = (name) => events.find((e) => e.name === 'TimeStamp' && (e.args?.data?.message ?? e.args?.data?.name) === name)?.ts;
let start = marker('voyage-scroll-start');
let end = marker('voyage-scroll-end');
if (start === undefined || end === undefined) {
  const begins = events.filter((e) => e.name === 'BeginFrame').map((e) => e.ts);
  start = Math.min(...begins);
  end = Math.max(...begins);
}
// Open the window at the first wheel input, so the idle vsyncs before the
// gesture starts are not counted as slow scroll frames.
const firstWheel = events
  .filter((e) => e.name === 'EventDispatch' && e.args?.data?.type === 'wheel' && e.ts >= start && e.ts <= end)
  .reduce((m, e) => Math.min(m, e.ts), Infinity);
if (Number.isFinite(firstWheel)) start = firstWheel;

const draws = events.filter((e) => e.name === 'DrawFrame' && e.ts >= start && e.ts <= end);
const byThread = new Map();
for (const e of draws) {
  const k = `${e.pid}:${e.tid}`;
  byThread.set(k, [...(byThread.get(k) ?? []), e.ts]);
}
const [thread, stamps] = [...byThread.entries()].sort((a, b) => b[1].length - a[1].length)[0] ?? [null, []];
stamps.sort((a, b) => a - b);
if (stamps.length < 2) {
  console.error('Fewer than two DrawFrame events in the window; was the trace recorded with disabled-by-default-devtools.timeline.frame?');
  process.exit(2);
}

const frames = [];
for (let i = 1; i < stamps.length; i++) frames.push((stamps[i] - stamps[i - 1]) / 1000);
const sorted = [...frames].sort((a, b) => a - b);
const pct = (p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
const medianMs = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
const medianFps = 1000 / medianMs;
const p95 = pct(95);
const max = sorted.at(-1);
const slow = frames.filter((f) => f > MAX_FRAME_MS).length;
const dropped = events.filter((e) => e.name === 'DroppedFrame' && e.ts >= start && e.ts <= end).length;
// AnimationFrame is recorded as async begin/end pairs (ph s/f or b/e) keyed by id.
const openFrames = new Map();
const mainFrames = [];
for (const e of events) {
  if (e.name !== 'AnimationFrame' || e.ts < start || e.ts > end) continue;
  const key = `${e.pid}:${e.id ?? e.id2?.local}`;
  if (e.ph === 's' || e.ph === 'b') openFrames.set(key, e.ts);
  else if ((e.ph === 'f' || e.ph === 'e') && openFrames.has(key)) {
    mainFrames.push((e.ts - openFrames.get(key)) / 1000);
    openFrames.delete(key);
  } else if (e.ph === 'X') mainFrames.push(e.dur / 1000);
}
const mainMax = mainFrames.length ? Math.max(...mainFrames) : null;

const windowMs = (end - start) / 1000;
console.log(`trace          ${file}`);
console.log(`window         ${windowMs.toFixed(0)} ms, ${frames.length} frame intervals (DrawFrame on ${thread})`);
console.log(`median fps     ${medianFps.toFixed(1)}  (median frame ${medianMs.toFixed(2)} ms)`);
console.log(`p95 frame      ${p95.toFixed(2)} ms`);
console.log(`max frame      ${max.toFixed(2)} ms`);
console.log(`frames > ${MAX_FRAME_MS} ms  ${slow}`);
console.log(`dropped frames ${dropped} (DroppedFrame events, informational)`);
if (mainMax !== null) console.log(`main-thread    longest AnimationFrame ${mainMax.toFixed(2)} ms (informational)`);

const pass = medianFps >= MIN_MEDIAN_FPS && slow === 0;
console.log(pass ? 'RESULT         GO' : `RESULT         NO-GO (need median >= ${MIN_MEDIAN_FPS} fps and 0 frames > ${MAX_FRAME_MS} ms)`);
process.exit(pass ? 0 : 1);
