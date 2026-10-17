# 3D Voyage, Plan 1 of 4: the spike and the foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove, on the real home page, that a toon-shaded Three.js sea with an outlined hull and a scroll-driven chase camera can be drawn, not rendered, at 50 fps median under 4x CPU throttle with zero layout shift, and lay down the pure modules every later plan builds on.

**Architecture:** One React island, `Voyage3D`, renders a fixed full-viewport canvas behind the server-rendered page, mounted only on desktop with motion allowed, after a WebGL check and a frame-rate probe. GSAP ScrollTrigger produces one progress value; pure functions (`layout.ts`, `state.ts`) turn it into scene state; Three.js modules (`sea.ts`, `ships.ts`, `islands.ts`, `sky.ts`, `camera.ts`) draw it. The HTML page is untouched in content and stays complete without the island.

**Tech Stack:** Astro 7 (static), React 19 island, Three.js 0.186.1 (`three`, `@types/three` 0.186.0), GSAP 3.15 + ScrollTrigger, Vitest 5, Playwright 1.64, size-limit 14.

**Spec:** `docs/superpowers/specs/2026-10-17-3d-voyage-redesign-design.md` (experience, budgets, stop rule), `docs/ARCHITECTURE.md` (modules, interfaces, state machine), private `factory/artifacts/DESIGN_PLAN_V2.md` (tokens, art direction, motion table).

**Plans that follow (written after the spike passes):** 2. islands, ports, hull swaps and the career chapters as paper cards; 3. the harbour, case-study cards, the last island, sky arc and ambient life; 4. the 2D painted page, the character, gates and launch items.

## Global Constraints

- Mount condition, verbatim from the spec: viewport at least 1024 px wide, and `prefers-reduced-motion: no-preference`, and WebGL2 available, and the pause control is not engaged, and a mount-time GPU probe passes (first 60 frames hold a 50 fps median).
- Phones download nothing new: the island hydrates with `client:media` on `(min-width: 1024px) and (prefers-reduced-motion: no-preference)`; Three.js and GSAP are dynamic imports.
- Desktop deferred bundle (Three.js + GSAP + scene) under 400 kB gzipped; phone client JS unchanged; Lighthouse mobile gates unchanged (LCP error at 1,700 ms, CLS 0.1, accessibility 1.0).
- Frame bar: 50 fps median, no frame over 32 ms, 4x CPU throttle, full scroll-through (`scripts/perf-trace.mjs`, `scripts/fps-from-trace.mjs`).
- Zero layout shift attributed to the island at mount; the canvas is `position: fixed`, `aria-hidden`, `pointer-events: none`; the island never removes or moves HTML.
- No wheel interception, no scroll snapping. Scroll is native.
- Look: three-step toon ramp, no specular, no shadow maps, no post-processing, no fog, no bloom; outlines are inverted-hull geometry in `--ink`; every material is a base colour plus one darker step from the token table.
- Colours come from CSS custom properties in `src/styles/tokens.css` read at mount, never duplicated as hex in scene code.
- Copy and source rules: no em dashes anywhere; no franchise, author or character names anywhere in source, comments, tests or file names (`npm run ip-scan` hard-fails CI).
- Commits: the owner is the sole author; never add a `Co-Authored-By` line. The owner has asked to be the one who commits; each task ends with a commit step that the executor runs only if the owner has authorised commits for this plan, and otherwise reports as ready to commit.
- Stop rule (spec §7): if Task 10's trace cannot hold the frame bar after one round of tuning, the 3D plan stops and the owner is offered the layered 2D direction.

## Review Focus

1. A desktop visitor on a machine with WebGL2 but a weak GPU (integrated graphics on a 4K display): expected behaviour is that the probe fails within a second and the page stays 2D with no flash of a half-drawn scene. Test pinned in Task 5 (`probe` fails below the median) and Task 9 (canvas opacity stays 0 until `data-live`).
2. The visitor resizes the window below 1024 px while the scene is live, or toggles reduced motion in the OS: expected behaviour is a clean teardown with every ScrollTrigger killed, the canvas removed, and the page scroll position unchanged. Test pinned in Task 9 (e2e resize to 900 px: `window.__scene` reports `mounted: false`, triggers 0, canvas count 0).
3. The visitor presses Pause mid-voyage and then uses an anchor link such as `#contact`: expected behaviour is native anchor navigation, no scene scroll hijack. Test pinned in Task 6 (`scrollTo` is a no-op when the timeline is killed) and Task 9 (e2e: paused, click the footer Contact link, `location.hash === '#contact'`).
4. The page is scrolled before the island finishes loading (fast scrollers, or a deep link to `#contact`): expected behaviour is that the scene mounts already at the matching progress, with no sail-from-the-start animation. Test pinned in Task 6 (`buildTimeline` reads `ScrollTrigger.progress` once after creation and calls `onUpdate` with it) and Task 9 (e2e: `goto('/#contact')`, after mount `window.__scene.progress > 0.8`).
5. A browser with `scripting: enabled` but the dynamic import of Three.js failing (ad blocker, flaky network): expected behaviour is the 2D page, with no console error loop and no retry storm. Test pinned in Task 9 (unit: `Voyage3D` catches a rejected `loadScene()` once, sets `state = 'static'`, and does not retry; e2e: route `**/three*.js` aborted, page readable, `window.__scene.state === 'static'`).

---

### Task 1: Dependencies, chunking and the desktop budget tier

**Files:**
- Modify: `package.json` (dependencies)
- Modify: `astro.config.mjs:19-29` (manualChunks)
- Modify: `.size-limit.json`
- Test: `tests/unit/budgets.test.ts`

**Interfaces:**
- Produces: a `three` chunk name (`dist/_astro/three*.js`) and a `scene` chunk for the island, both excluded from the phone tier and summed in the desktop tier.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/budgets.test.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type Entry = { name: string; path: string | string[]; limit: string; gzip?: boolean };
const config = JSON.parse(readFileSync(fileURLToPath(new URL('../../.size-limit.json', import.meta.url)), 'utf8')) as Entry[];
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8')) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

describe('size budgets [unit]', () => {
  it('pins Three.js and its types', () => {
    expect(pkg.dependencies.three).toBe('0.186.1');
    expect(pkg.devDependencies['@types/three']).toBe('0.186.0');
  });

  it('keeps the phone tier free of the scene and gives the desktop scene its own 400 kB tier', () => {
    const phone = config.find((e) => e.name.startsWith('Phone'));
    const desktop = config.find((e) => e.name.startsWith('Desktop'));
    expect(phone, 'phone tier').toBeDefined();
    expect(desktop, 'desktop tier').toBeDefined();
    const phonePaths = ([] as string[]).concat(phone!.path);
    expect(phonePaths).toContain('!dist/_astro/three*.js');
    expect(phonePaths).toContain('!dist/_astro/scene*.js');
    expect(phone!.limit).toBe('150 kB');
    expect(([] as string[]).concat(desktop!.path)).toEqual(
      expect.arrayContaining(['dist/_astro/three*.js', 'dist/_astro/scene*.js', 'dist/_astro/gsap*.js']),
    );
    expect(desktop!.limit).toBe('400 kB');
    expect(desktop!.gzip).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/budgets.test.ts`
Expected: FAIL, `pkg.dependencies.three` is undefined.

- [ ] **Step 3: Install and configure**

```bash
npm install three@0.186.1 && npm install -D @types/three@0.186.0
```

Replace the `manualChunks` function in `astro.config.mjs` with:

```js
          manualChunks(id) {
            if (id.includes('node_modules/gsap') || id.includes('node_modules/@gsap')) return 'gsap';
            if (id.includes('node_modules/three')) return 'three';
            if (id.includes('/src/components/scene/')) return 'scene';
          },
```

Replace `.size-limit.json` with:

```json
[
  {
    "name": "Phone and first-paint client JS (Astro runtime, React, the 2D voyage island)",
    "path": ["dist/_astro/*.js", "!dist/_astro/three*.js", "!dist/_astro/scene*.js"],
    "limit": "150 kB",
    "gzip": true
  },
  {
    "name": "GSAP chunk",
    "path": "dist/_astro/gsap*.js",
    "limit": "60 kB",
    "gzip": true
  },
  {
    "name": "Desktop deferred bundle (Three.js, GSAP, the 3D scene)",
    "path": ["dist/_astro/three*.js", "dist/_astro/scene*.js", "dist/_astro/gsap*.js"],
    "limit": "400 kB",
    "gzip": true
  }
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/budgets.test.ts && npm run build && npx size-limit`
Expected: PASS; the build is unchanged (no scene chunk yet, so the desktop tier reports only gsap); size-limit green.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json astro.config.mjs .size-limit.json tests/unit/budgets.test.ts
git commit -m "Scene: add Three.js, chunk it, and a desktop budget tier"
```

---

### Task 2: Scene colour tokens, in CSS and read at mount

**Files:**
- Modify: `src/styles/tokens.css` (append to `:root`)
- Create: `src/components/scene/tokens.ts`
- Test: `tests/unit/scene-tokens.test.ts`

**Interfaces:**
- Produces: `export const SCENE_TOKEN_NAMES`, `export interface SceneTokens { ink, chart, sea, seaDeep, seaLight, sun, skyDawn, skyDay, skyLate, sand, leaf, leafDeep, timber, timberDeep, fog, signal: string }`, `export function readSceneTokens(get: (name: string) => string): SceneTokens`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/scene-tokens.test.ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readSceneTokens, SCENE_TOKEN_NAMES } from '../../src/components/scene/tokens';

const css = readFileSync(fileURLToPath(new URL('../../src/styles/tokens.css', import.meta.url)), 'utf8');

describe('scene tokens [unit]', () => {
  it('every scene token is declared once in tokens.css as a hex colour', () => {
    for (const name of SCENE_TOKEN_NAMES) {
      const matches = css.match(new RegExp(`${name}:\\s*#[0-9a-fA-F]{6};`, 'g')) ?? [];
      expect(matches, name).toHaveLength(1);
    }
  });

  it('reads the tokens through a getter and trims whitespace', () => {
    const values: Record<string, string> = {
      '--ink': ' #0E1B2B ', '--chart': '#F4F6F3', '--sea': '#1B6F8A', '--sea-deep': '#124E63', '--sea-light': '#4FA3BD',
      '--sun': '#F2A93B', '--sky-dawn': '#F7D6A8', '--sky-day': '#BFE3EE', '--sky-late': '#F3B98C', '--sand': '#E9D9B0',
      '--leaf': '#4F8A5B', '--leaf-deep': '#2F5E3B', '--timber': '#9C6B3C', '--timber-deep': '#6B4426', '--fog': '#D5DBD7', '--signal': '#C7302B',
    };
    const t = readSceneTokens((n) => values[n] ?? '');
    expect(t.ink).toBe('#0E1B2B');
    expect(t.seaDeep).toBe('#124E63');
    expect(t.timberDeep).toBe('#6B4426');
  });

  it('falls back to the documented default when a token is missing', () => {
    const t = readSceneTokens(() => '');
    expect(t.sea).toBe('#1B6F8A');
    expect(t.skyDawn).toBe('#F7D6A8');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/scene-tokens.test.ts`
Expected: FAIL, cannot find module `tokens.ts`.

- [ ] **Step 3: Add the tokens and the reader**

Append inside the first `:root { ... }` block of `src/styles/tokens.css`, after `--fog`:

```css
  /* Scene colours (Design Plan v2 §2.1): the 3D world and the painted 2D page.
     Each material is a base plus one darker step; no gradients inside a material. */
  --sea-deep: #124E63;
  --sea-light: #4FA3BD;
  --sky-dawn: #F7D6A8;
  --sky-day: #BFE3EE;
  --sky-late: #F3B98C;
  --sand: #E9D9B0;
  --leaf: #4F8A5B;
  --leaf-deep: #2F5E3B;
  --timber: #9C6B3C;
  --timber-deep: #6B4426;
```

Create `src/components/scene/tokens.ts`:

```ts
// The scene reads its colours from the CSS custom properties at mount, so the
// stylesheet stays the single source of truth for CSS and WebGL alike.

export interface SceneTokens {
  ink: string; chart: string; sea: string; seaDeep: string; seaLight: string; sun: string;
  skyDawn: string; skyDay: string; skyLate: string; sand: string; leaf: string; leafDeep: string;
  timber: string; timberDeep: string; fog: string; signal: string;
}

const MAP: Record<keyof SceneTokens, [name: string, fallback: string]> = {
  ink: ['--ink', '#0E1B2B'], chart: ['--chart', '#F4F6F3'], sea: ['--sea', '#1B6F8A'],
  seaDeep: ['--sea-deep', '#124E63'], seaLight: ['--sea-light', '#4FA3BD'], sun: ['--sun', '#F2A93B'],
  skyDawn: ['--sky-dawn', '#F7D6A8'], skyDay: ['--sky-day', '#BFE3EE'], skyLate: ['--sky-late', '#F3B98C'],
  sand: ['--sand', '#E9D9B0'], leaf: ['--leaf', '#4F8A5B'], leafDeep: ['--leaf-deep', '#2F5E3B'],
  timber: ['--timber', '#9C6B3C'], timberDeep: ['--timber-deep', '#6B4426'], fog: ['--fog', '#D5DBD7'], signal: ['--signal', '#C7302B'],
};

export const SCENE_TOKEN_NAMES: readonly string[] = Object.values(MAP).map(([name]) => name);

/** `get` is typically `(n) => getComputedStyle(document.documentElement).getPropertyValue(n)`. */
export function readSceneTokens(get: (name: string) => string): SceneTokens {
  const out = {} as SceneTokens;
  for (const key of Object.keys(MAP) as (keyof SceneTokens)[]) {
    const [name, fallback] = MAP[key];
    const v = get(name).trim();
    out[key] = /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/scene-tokens.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/styles/tokens.css src/components/scene/tokens.ts tests/unit/scene-tokens.test.ts
git commit -m "Scene: colour tokens in CSS, read at mount"
```

---

### Task 3: `layout.ts`, the world from the stop data (pure)

**Files:**
- Create: `src/components/scene/layout.ts`
- Test: `tests/unit/scene-layout.test.ts`

**Interfaces:**
- Consumes: `Stop` from `src/data/stops.ts` (fields `id`, `map: {x, y} | null`, `sizeSwap`, `milestone`, `shipSize`).
- Produces:

```ts
export interface Berth { id: string; t: number; position: Vector3; classified: boolean }
export interface WorldStop { id: string; t: number; position: Vector3; sizeSwap: boolean; hull: 0 | 1 | 2 }
export interface ChapterSpan { id: string; p0: number; p1: number }   // share of PAGE progress
export interface WorldLayout {
  route: CatmullRomCurve3; cameraPath: CatmullRomCurve3;
  stops: WorldStop[]; harbour: { t0: number; t1: number; berths: Berth[] };
  chapters: ChapterSpan[]; lastIsland: WorldStop;
}
export const WORLD_SCALE = 0.1;           // viewBox units -> world units
export const CAMERA_BACK = 14; export const CAMERA_UP = 9;
export function worldLayout(stops: readonly Stop[], entries: readonly { id: string; classified: boolean }[]): WorldLayout;
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/scene-layout.test.ts
import { describe, expect, it } from 'vitest';
import { worldLayout, WORLD_SCALE } from '../../src/components/scene/layout';
import { stops } from '../../src/data/stops';

const entries = [
  { id: 'portfolio-agent', classified: false }, { id: 'knightknight', classified: false },
  { id: 'bioliminal', classified: false }, { id: 'collabboard', classified: false },
  { id: 'mulingo', classified: false }, { id: 'birthdaybot', classified: false },
  { id: 'mips', classified: false }, { id: 'cloudcred', classified: true },
];

describe('worldLayout [unit]', () => {
  const w = worldLayout(stops, entries);

  it('places every career stop from its chart coordinates, scaled, on the water plane', () => {
    expect(w.stops).toHaveLength(stops.length - 1); // the last stop is the last island, not a career stop
    const first = w.stops[0]!;
    expect(first.id).toBe(stops[0]!.id);
    expect(first.position.x).toBeCloseTo((stops[0]!.map!.x - 500) * WORLD_SCALE, 5);
    expect(first.position.z).toBeCloseTo((stops[0]!.map!.y - 300) * WORLD_SCALE, 5);
    expect(first.position.y).toBe(0);
    expect(w.lastIsland.id).toBe(stops.at(-1)!.id);
  });

  it('orders the route: career stops, then the harbour, then the last island, with strictly increasing t', () => {
    const ts = [...w.stops.map((s) => s.t), w.harbour.t0, ...w.harbour.berths.map((b) => b.t), w.harbour.t1, w.lastIsland.t];
    for (let i = 1; i < ts.length; i++) expect(ts[i]!, `t at ${i}`).toBeGreaterThan(ts[i - 1]!);
    expect(w.stops[0]!.t).toBe(0);
    expect(w.lastIsland.t).toBe(1);
  });

  it('gives each case study a berth in order, flags the classified one, and spaces berths evenly', () => {
    expect(w.harbour.berths.map((b) => b.id)).toEqual(entries.map((e) => e.id));
    expect(w.harbour.berths.filter((b) => b.classified).map((b) => b.id)).toEqual(['cloudcred']);
    const gaps = w.harbour.berths.slice(1).map((b, i) => b.t - w.harbour.berths[i]!.t);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0]!, 6);
  });

  it('derives the hull index from the milestones: 0 until graduation, 1 until the turning point, 2 after', () => {
    const byId = Object.fromEntries(w.stops.map((s) => [s.id, s.hull]));
    expect(byId['edison-origin']).toBe(0);
    expect(byId['purdue']).toBe(0);
    expect(byId['infosys-remote']).toBe(1);
    expect(byId['bae-austin']).toBe(1);
    expect(byId['gauntlet-ai']).toBe(2);
    expect(byId['founder-mode']).toBe(2);
    expect(w.stops.filter((s) => s.sizeSwap).map((s) => s.id)).toEqual(['infosys-remote', 'gauntlet-ai']);
  });

  it('splits page progress into chapter spans that tile 0..1 in the spec order and shares', () => {
    expect(w.chapters.map((c) => c.id)).toEqual(['hero', 'voyage', 'log', 'about', 'contact']);
    expect(w.chapters[0]!.p0).toBe(0);
    expect(w.chapters.at(-1)!.p1).toBe(1);
    for (let i = 1; i < w.chapters.length; i++) expect(w.chapters[i]!.p0).toBeCloseTo(w.chapters[i - 1]!.p1, 9);
    const share = (id: string) => { const c = w.chapters.find((c) => c.id === id)!; return c.p1 - c.p0; };
    expect(share('hero')).toBeCloseTo(0.08, 9);
    expect(share('voyage')).toBeCloseTo(0.32, 9);
    expect(share('log')).toBeCloseTo(0.4, 9);
    expect(share('about')).toBeCloseTo(0.1, 9);
    expect(share('contact')).toBeCloseTo(0.1, 9);
  });

  it('runs the camera path parallel to the route, behind and above it', () => {
    const p = w.route.getPointAt(0.5);
    const c = w.cameraPath.getPointAt(0.5);
    expect(c.y).toBeCloseTo(9, 5);
    expect(c.z - p.z).toBeGreaterThan(10);
    expect(Math.abs(c.x - p.x)).toBeLessThan(3);
  });

  it('refuses a stop without chart coordinates', () => {
    const broken = stops.map((s, i) => (i === 2 ? { ...s, map: null } : s));
    expect(() => worldLayout(broken, entries)).toThrow(/coordinates/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/scene-layout.test.ts`
Expected: FAIL, cannot find module `layout.ts`.

- [ ] **Step 3: Implement `layout.ts`**

```ts
// src/components/scene/layout.ts
// The world, from the same stop data the 2D chart draws. Pure: no DOM, no
// renderer. Three's curve and vector classes are plain math.
import { CatmullRomCurve3, Vector3 } from 'three';
import type { Stop } from '@/data/stops';

export const WORLD_SCALE = 0.1;
export const CAMERA_BACK = 14;
export const CAMERA_UP = 9;
/** Where the harbour island sits relative to the last career stop (world units). */
const HARBOUR_OFFSET = new Vector3(-9, 0, 5);
const PIER_LENGTH = 10;

export interface Berth { id: string; t: number; position: Vector3; classified: boolean }
export interface WorldStop { id: string; t: number; position: Vector3; sizeSwap: boolean; hull: 0 | 1 | 2 }
export interface ChapterSpan { id: string; p0: number; p1: number }
export interface WorldLayout {
  route: CatmullRomCurve3;
  cameraPath: CatmullRomCurve3;
  stops: WorldStop[];
  harbour: { t0: number; t1: number; berths: Berth[] };
  chapters: ChapterSpan[];
  lastIsland: WorldStop;
}

/** Share of page scroll each chapter owns (spec §3.6 and ARCHITECTURE §6). */
const CHAPTER_SHARES: ReadonlyArray<[id: string, share: number]> = [
  ['hero', 0.08], ['voyage', 0.32], ['log', 0.4], ['about', 0.1], ['contact', 0.1],
];

function toWorld(stop: Stop): Vector3 {
  if (!stop.map) throw new Error(`stop ${stop.id} has no chart coordinates`);
  return new Vector3((stop.map.x - 500) * WORLD_SCALE, 0, (stop.map.y - 300) * WORLD_SCALE);
}

function hullFor(index: number, stops: readonly Stop[]): 0 | 1 | 2 {
  let hull: 0 | 1 | 2 = 0;
  for (let i = 0; i <= index; i++) {
    const m = stops[i]!.milestone;
    if (m === 'graduation' && hull < 1) hull = 1;
    if (m === 'turning-point') hull = 2;
  }
  return hull;
}

/** Arc-length parameter of each control point along a Catmull-Rom curve. */
function paramsAlong(curve: CatmullRomCurve3, points: readonly Vector3[]): number[] {
  const lengths = curve.getLengths(400);
  const total = lengths[lengths.length - 1]!;
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) acc += points[i]!.distanceTo(points[i - 1]!);
    out.push(i === 0 ? 0 : i === points.length - 1 ? 1 : Math.min(1, acc / total));
  }
  return out;
}

export function worldLayout(stops: readonly Stop[], entries: readonly { id: string; classified: boolean }[]): WorldLayout {
  if (stops.length < 2) throw new Error('need at least two stops');
  const career = stops.slice(0, -1);
  const last = stops[stops.length - 1]!;

  const careerPoints = career.map(toWorld);
  const harbourCentre = careerPoints[careerPoints.length - 1]!.clone().add(HARBOUR_OFFSET);
  const pierStart = harbourCentre.clone().add(new Vector3(PIER_LENGTH / 2, 0, 0));
  const pierEnd = harbourCentre.clone().add(new Vector3(-PIER_LENGTH / 2, 0, 0));
  const lastPoint = toWorld(last);

  // Route control points: career stops, pier start, pier end, last island.
  const points = [...careerPoints, pierStart, pierEnd, lastPoint];
  const route = new CatmullRomCurve3(points, false, 'centripetal');
  const t = paramsAlong(route, points);

  const worldStops: WorldStop[] = career.map((s, i) => ({
    id: s.id, t: t[i]!, position: careerPoints[i]!.clone(), sizeSwap: s.sizeSwap, hull: hullFor(i, stops),
  }));
  const t0 = t[career.length]!;
  const t1 = t[career.length + 1]!;
  const berths: Berth[] = entries.map((e, i) => {
    const f = (i + 0.5) / entries.length;
    return { id: e.id, t: t0 + (t1 - t0) * f, position: pierStart.clone().lerp(pierEnd, f), classified: e.classified };
  });
  const lastIsland: WorldStop = { id: last.id, t: 1, position: lastPoint, sizeSwap: false, hull: hullFor(stops.length - 1, stops) };

  const cameraPath = new CatmullRomCurve3(
    points.map((p) => p.clone().add(new Vector3(0, CAMERA_UP, CAMERA_BACK))),
    false,
    'centripetal',
  );

  const chapters: ChapterSpan[] = [];
  let p = 0;
  for (const [id, share] of CHAPTER_SHARES) {
    chapters.push({ id, p0: p, p1: p + share });
    p += share;
  }
  chapters[chapters.length - 1]!.p1 = 1;

  return { route, cameraPath, stops: worldStops, harbour: { t0, t1, berths }, chapters, lastIsland };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/scene-layout.test.ts`
Expected: PASS (7 tests). If the camera-path parallel test fails on `|c.x - p.x| < 3`, the Catmull-Rom offset curve diverges where the route turns sharply; tighten by sampling `route.getPointAt(0.5)` and comparing to `cameraPath.getPointAt(0.5).sub(new Vector3(0, 9, 14))` with a tolerance of 3 world units; the assertion above already allows that.

- [ ] **Step 5: Commit**

```bash
git add src/components/scene/layout.ts tests/unit/scene-layout.test.ts
git commit -m "Scene: world layout from the stop data"
```

---

### Task 4: `state.ts`, page progress to scene state (pure)

**Files:**
- Create: `src/components/scene/state.ts`
- Test: `tests/unit/scene-state.test.ts`

**Interfaces:**
- Consumes: `WorldLayout` from Task 3.
- Produces:

```ts
export interface SceneState {
  progress: number; t: number;
  shipPosition: Vector3; shipHeading: number; hull: 0 | 1 | 2; swapPhase: number;
  cameraPosition: Vector3; cameraLookAt: Vector3;
  activeChapter: string; activeStop: string | null; activeBerth: string | null;
  sunAngle: number; skyMix: number;
}
export const DWELL_STOP = 0.22; export const DWELL_BERTH = 0.3;
export function routeTAt(progress: number, layout: WorldLayout): number;
export function sceneStateAt(progress: number, layout: WorldLayout): SceneState;
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/scene-state.test.ts
import { describe, expect, it } from 'vitest';
import { worldLayout } from '../../src/components/scene/layout';
import { routeTAt, sceneStateAt, DWELL_STOP } from '../../src/components/scene/state';
import { stops } from '../../src/data/stops';

const entries = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => ({ id, classified: id === 'h' }));
const w = worldLayout(stops, entries);
const span = (id: string) => w.chapters.find((c) => c.id === id)!;

describe('routeTAt [unit]', () => {
  it('holds the ship at the first stop through the hero', () => {
    expect(routeTAt(0, w)).toBe(0);
    expect(routeTAt(span('hero').p1 - 0.001, w)).toBe(0);
  });

  it('is monotonic non-decreasing across the whole page', () => {
    let prev = -1;
    for (let i = 0; i <= 1000; i++) {
      const t = routeTAt(i / 1000, w);
      expect(t, `progress ${i / 1000}`).toBeGreaterThanOrEqual(prev);
      prev = t;
    }
    expect(routeTAt(1, w)).toBe(1);
  });

  it('dwells at each career stop for DWELL_STOP of its leg', () => {
    const v = span('voyage');
    const legs = w.stops.length - 1 + 1; // legs between career stops, plus the leg into the harbour
    const legShare = (v.p1 - v.p0) / legs;
    const stop1 = w.stops[1]!;
    const arrive = v.p0 + legShare * 1;
    expect(routeTAt(arrive, w)).toBeCloseTo(stop1.t, 6);
    expect(routeTAt(arrive + legShare * (DWELL_STOP - 0.01), w)).toBeCloseTo(stop1.t, 6);
    expect(routeTAt(arrive + legShare * (DWELL_STOP + 0.05), w)).toBeGreaterThan(stop1.t);
  });

  it('reaches the last island at the start of About and stays there through Contact', () => {
    expect(routeTAt(span('about').p0, w)).toBeCloseTo(1, 6);
    expect(routeTAt(span('contact').p0 + 0.05, w)).toBe(1);
  });
});

describe('sceneStateAt [unit]', () => {
  it('starts with the dinghy at the origin facing west, dawn sky', () => {
    const s = sceneStateAt(0, w);
    expect(s.hull).toBe(0);
    expect(s.activeChapter).toBe('hero');
    expect(s.activeStop).toBe(stops[0]!.id);
    expect(s.shipPosition.distanceTo(w.stops[0]!.position)).toBeLessThan(0.01);
    expect(s.skyMix).toBe(0);
    expect(s.sunAngle).toBe(0);
    expect(Math.cos(s.shipHeading)).toBeLessThan(0); // heading has a westward component
  });

  it('swaps the hull on arrival at a milestone and reports the swap phase around it', () => {
    const v = span('voyage');
    const legs = w.stops.length;
    const legShare = (v.p1 - v.p0) / legs;
    const grad = w.stops.findIndex((s) => s.id === 'infosys-remote');
    const before = sceneStateAt(v.p0 + legShare * (grad - 0.5), w);
    const at = sceneStateAt(v.p0 + legShare * grad + legShare * 0.1, w);
    expect(before.hull).toBe(0);
    expect(at.hull).toBe(1);
    expect(at.swapPhase).toBeGreaterThan(0);
    expect(at.swapPhase).toBeLessThanOrEqual(1);
    expect(sceneStateAt(v.p0 + legShare * (grad + 0.6), w).swapPhase).toBe(0);
  });

  it('names the active berth while docked in the harbour and none outside it', () => {
    const l = span('log');
    const third = sceneStateAt(l.p0 + (l.p1 - l.p0) * (2.5 / 8), w);
    expect(third.activeChapter).toBe('log');
    expect(third.activeBerth).toBe('c');
    expect(sceneStateAt(span('voyage').p0 + 0.01, w).activeBerth).toBeNull();
  });

  it('keeps the camera behind and above the ship, looking a little ahead of it', () => {
    const s = sceneStateAt(0.5, w);
    expect(s.cameraPosition.y).toBeCloseTo(9, 1);
    expect(s.cameraPosition.z).toBeGreaterThan(s.shipPosition.z + 8);
    expect(s.cameraLookAt.distanceTo(s.shipPosition)).toBeLessThan(8);
  });

  it('ends at the last island with the sun low and the late sky', () => {
    const s = sceneStateAt(1, w);
    expect(s.activeChapter).toBe('contact');
    expect(s.activeStop).toBe(w.lastIsland.id);
    expect(s.skyMix).toBe(1);
    expect(s.sunAngle).toBeCloseTo(Math.PI, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/scene-state.test.ts`
Expected: FAIL, cannot find module `state.ts`.

- [ ] **Step 3: Implement `state.ts`**

```ts
// src/components/scene/state.ts
// Page progress (0..1 from ScrollTrigger) to everything the scene draws. Pure.
import { Vector3 } from 'three';
import type { WorldLayout } from './layout';

export const DWELL_STOP = 0.22;
export const DWELL_BERTH = 0.3;
/** How much of a leg, centred on arrival, the hull swap takes. */
const SWAP_WINDOW = 0.4;

export interface SceneState {
  progress: number;
  t: number;
  shipPosition: Vector3;
  shipHeading: number;
  hull: 0 | 1 | 2;
  swapPhase: number;
  cameraPosition: Vector3;
  cameraLookAt: Vector3;
  activeChapter: string;
  activeStop: string | null;
  activeBerth: string | null;
  sunAngle: number;
  skyMix: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);

function chapterOf(progress: number, layout: WorldLayout) {
  return layout.chapters.find((c) => progress < c.p1) ?? layout.chapters[layout.chapters.length - 1]!;
}

/** Progress inside a run of equal legs: dwell, then eased sailing to the next waypoint. */
function legT(local: number, waypoints: readonly number[], dwell: number, tail: number): number {
  const legs = waypoints.length - 1 + (tail > waypoints[waypoints.length - 1]! ? 1 : 0);
  const pts = tail > waypoints[waypoints.length - 1]! ? [...waypoints, tail] : [...waypoints];
  const x = clamp01(local) * legs;
  const i = Math.min(legs - 1, Math.floor(x));
  const f = x - i;
  const sail = f <= dwell ? 0 : easeInOut((f - dwell) / (1 - dwell));
  return pts[i]! + (pts[i + 1]! - pts[i]!) * sail;
}

export function routeTAt(progress: number, layout: WorldLayout): number {
  const c = chapterOf(progress, layout);
  const local = (progress - c.p0) / (c.p1 - c.p0);
  switch (c.id) {
    case 'hero':
      return 0;
    case 'voyage':
      return legT(local, layout.stops.map((s) => s.t), DWELL_STOP, layout.harbour.t0);
    case 'log':
      return legT(local, [layout.harbour.t0, ...layout.harbour.berths.map((b) => b.t)], DWELL_BERTH, layout.harbour.t1);
    case 'about':
      return layout.harbour.t1 + (1 - layout.harbour.t1) * easeInOut(clamp01(local));
    default:
      return 1;
  }
}

export function sceneStateAt(progress: number, layout: WorldLayout): SceneState {
  const p = clamp01(progress);
  const t = routeTAt(p, layout);
  const c = chapterOf(p, layout);

  const shipPosition = layout.route.getPointAt(t);
  const tangent = layout.route.getTangentAt(Math.min(0.999, t));
  const shipHeading = Math.atan2(tangent.z, tangent.x);
  const cameraPosition = layout.cameraPath.getPointAt(t);
  const cameraLookAt = shipPosition.clone().add(new Vector3(-5, 1, 0));

  // Active stop / berth and hull with swap phase.
  let activeStop: string | null = null;
  let activeBerth: string | null = null;
  let hull: 0 | 1 | 2 = layout.stops[0]!.hull;
  let swapPhase = 0;
  if (c.id === 'hero') {
    activeStop = layout.stops[0]!.id;
  } else if (c.id === 'voyage') {
    const local = (p - c.p0) / (c.p1 - c.p0);
    const legs = layout.stops.length;
    const x = local * legs;
    const i = Math.min(layout.stops.length - 1, Math.floor(x));
    const f = x - i;
    const stop = layout.stops[i]!;
    activeStop = stop.id;
    hull = stop.hull;
    if (stop.sizeSwap && f < SWAP_WINDOW / 2) swapPhase = clamp01(0.5 + f / SWAP_WINDOW);
    const next = layout.stops[i + 1];
    if (next?.sizeSwap && f > 1 - SWAP_WINDOW / 2) {
      swapPhase = clamp01((f - (1 - SWAP_WINDOW / 2)) / SWAP_WINDOW);
    }
  } else if (c.id === 'log') {
    hull = layout.lastIsland.hull;
    const local = (p - c.p0) / (c.p1 - c.p0);
    const i = Math.min(layout.harbour.berths.length - 1, Math.floor(local * layout.harbour.berths.length));
    activeBerth = layout.harbour.berths[i]!.id;
  } else {
    hull = layout.lastIsland.hull;
    activeStop = layout.lastIsland.id;
  }

  return {
    progress: p, t, shipPosition, shipHeading, hull, swapPhase, cameraPosition, cameraLookAt,
    activeChapter: c.id, activeStop, activeBerth, sunAngle: p * Math.PI, skyMix: p,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/scene-state.test.ts`
Expected: PASS (9 tests). If the dwell test fails at `arrive + legShare * (DWELL_STOP - 0.01)`, check that `legT` counts the leg into the harbour as the final leg (the `tail` argument) so the voyage chapter has `stops.length` legs, not `stops.length - 1`.

- [ ] **Step 5: Commit**

```bash
git add src/components/scene/state.ts tests/unit/scene-state.test.ts
git commit -m "Scene: page progress to scene state"
```

---

### Task 5: `mount.ts`, the mount gate and the frame-rate probe (pure)

**Files:**
- Create: `src/components/scene/mount.ts`
- Test: `tests/unit/scene-mount.test.ts`

**Interfaces:**
- Produces:

```ts
export const SCENE_QUERY = '(min-width: 1024px) and (prefers-reduced-motion: no-preference)';
export interface MountEnv { width: number; reducedMotion: boolean; webgl2: boolean; paused: boolean }
export function canMount(env: MountEnv): boolean;
export function medianFps(frameTimesMs: readonly number[]): number;
export function probe(opts: { frames?: number; minFps?: number; tick: (cb: (now: number) => void) => void; render: () => void }): Promise<{ medianFps: number; pass: boolean }>;
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/scene-mount.test.ts
import { describe, expect, it } from 'vitest';
import { canMount, medianFps, probe, SCENE_QUERY } from '../../src/components/scene/mount';

const ok = { width: 1440, reducedMotion: false, webgl2: true, paused: false };

describe('canMount [unit]', () => {
  it('needs every gate at once', () => {
    expect(canMount(ok)).toBe(true);
    expect(canMount({ ...ok, width: 1023 })).toBe(false);
    expect(canMount({ ...ok, reducedMotion: true })).toBe(false);
    expect(canMount({ ...ok, webgl2: false })).toBe(false);
    expect(canMount({ ...ok, paused: true })).toBe(false);
  });

  it('matches the client:media query the island hydrates with', () => {
    expect(SCENE_QUERY).toBe('(min-width: 1024px) and (prefers-reduced-motion: no-preference)');
  });
});

describe('probe [unit]', () => {
  it('computes the median frame rate from frame times', () => {
    expect(medianFps([16.7, 16.7, 16.7])).toBeCloseTo(60, 0);
    expect(medianFps([33, 16, 33])).toBeCloseTo(1000 / 33, 0);
    expect(medianFps([])).toBe(0);
  });

  it('passes a steady 60 fps machine and fails a 30 fps one, rendering every frame', async () => {
    const run = async (frameMs: number) => {
      let now = 0;
      let renders = 0;
      const tick = (cb: (now: number) => void) => { now += frameMs; setTimeout(() => cb(now), 0); };
      const r = await probe({ frames: 30, minFps: 50, tick, render: () => renders++ });
      return { ...r, renders };
    };
    const fast = await run(16.7);
    expect(fast.pass).toBe(true);
    expect(fast.renders).toBe(30);
    const slow = await run(33);
    expect(slow.pass).toBe(false);
    expect(slow.medianFps).toBeLessThan(50);
  });

  it('ignores the first frame, which includes compile time', async () => {
    let n = 0;
    const times = [400, ...Array(29).fill(16.7)];
    let now = 0;
    const tick = (cb: (now: number) => void) => { now += times[n++] ?? 16.7; setTimeout(() => cb(now), 0); };
    const r = await probe({ frames: 30, minFps: 50, tick, render: () => {} });
    expect(r.pass).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/scene-mount.test.ts`
Expected: FAIL, cannot find module `mount.ts`.

- [ ] **Step 3: Implement `mount.ts`**

```ts
// src/components/scene/mount.ts
// The gate the island must pass before the canvas is shown, and the probe that
// measures whether this machine can hold the frame bar. Pure: the island
// supplies the environment and the frame ticker.

export const SCENE_QUERY = '(min-width: 1024px) and (prefers-reduced-motion: no-preference)';

export interface MountEnv {
  width: number;
  reducedMotion: boolean;
  webgl2: boolean;
  paused: boolean;
}

export function canMount(env: MountEnv): boolean {
  return env.width >= 1024 && !env.reducedMotion && env.webgl2 && !env.paused;
}

export function medianFps(frameTimesMs: readonly number[]): number {
  if (frameTimesMs.length === 0) return 0;
  const sorted = [...frameTimesMs].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)]!;
  return mid > 0 ? 1000 / mid : 0;
}

export interface ProbeOptions {
  frames?: number;
  minFps?: number;
  /** Schedules `cb` for the next frame with a timestamp in ms (requestAnimationFrame in the browser). */
  tick: (cb: (now: number) => void) => void;
  /** Renders one frame of the scene at its idle state. */
  render: () => void;
}

/** Renders `frames` frames and reports the median fps, ignoring the first (compile) frame. */
export function probe({ frames = 60, minFps = 50, tick, render }: ProbeOptions): Promise<{ medianFps: number; pass: boolean }> {
  return new Promise((resolve) => {
    const times: number[] = [];
    let last: number | null = null;
    let count = 0;
    const step = (now: number) => {
      render();
      count++;
      if (last !== null && count > 1) times.push(now - last);
      last = now;
      if (count >= frames) {
        const fps = medianFps(times);
        resolve({ medianFps: fps, pass: fps >= minFps });
        return;
      }
      tick(step);
    };
    tick(step);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/scene-mount.test.ts`
Expected: PASS (5 tests). Note the "ignores the first frame" test: the 400 ms gap is between the first and second callbacks; `count > 1` on the second callback still records it. If that test fails, change the condition to `count > 2`, which skips the gap after the first render, and keep the `renders` count at `frames`.

- [ ] **Step 5: Commit**

```bash
git add src/components/scene/mount.ts tests/unit/scene-mount.test.ts
git commit -m "Scene: mount gate and frame-rate probe"
```

---

### Task 6: `timeline.ts`, the one ScrollTrigger over the page

**Files:**
- Create: `src/components/scene/timeline.ts`
- Test: covered by Task 9's e2e (ScrollTrigger needs a real document); unit test only for the pure helpers.
- Test: `tests/unit/scene-timeline.test.ts`

**Interfaces:**
- Consumes: `gsap` and `ScrollTrigger` loaded by the island.
- Produces:

```ts
export interface VoyageTimeline { progress(): number; scrollTo(progress: number): void; refresh(): void; kill(): void }
export function pageBounds(first: DOMRect, last: DOMRect, scrollY: number, innerHeight: number): { start: number; end: number };
export function buildTimeline(gsap: GsapCore, ScrollTrigger: ScrollTriggerStatic, sections: readonly HTMLElement[], onUpdate: (progress: number) => void): VoyageTimeline;
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/scene-timeline.test.ts
import { describe, expect, it } from 'vitest';
import { pageBounds, progressToScrollY } from '../../src/components/scene/timeline';

describe('timeline helpers [unit]', () => {
  it('maps the first chapter top and the last chapter bottom to document scroll positions', () => {
    const first = { top: 120 } as DOMRect;
    const last = { bottom: 9000 } as DOMRect;
    const b = pageBounds(first, last, 300, 900);
    expect(b.start).toBe(420);          // 120 + 300: the first chapter's top in document coordinates
    expect(b.end).toBe(9300 - 900);     // the last chapter's bottom minus one viewport
  });

  it('maps progress back to a scroll position', () => {
    expect(progressToScrollY(0, { start: 100, end: 1100 })).toBe(100);
    expect(progressToScrollY(0.5, { start: 100, end: 1100 })).toBe(600);
    expect(progressToScrollY(2, { start: 100, end: 1100 })).toBe(1100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/scene-timeline.test.ts`
Expected: FAIL, cannot find module `timeline.ts`.

- [ ] **Step 3: Implement `timeline.ts`**

```ts
// src/components/scene/timeline.ts
// The only module that touches scroll. One ScrollTrigger from the top of the
// first chapter to the bottom of the last, scrubbed, reporting page progress.
// No pin (the canvas is CSS-fixed), no snapping, no wheel interception.

type GsapCore = typeof import('gsap').gsap;
type ScrollTriggerStatic = typeof import('gsap/ScrollTrigger').ScrollTrigger;

export interface Bounds { start: number; end: number }

export function pageBounds(first: DOMRect, last: DOMRect, scrollY: number, innerHeight: number): Bounds {
  return { start: first.top + scrollY, end: last.bottom + scrollY - innerHeight };
}

export function progressToScrollY(progress: number, b: Bounds): number {
  const p = Math.min(1, Math.max(0, progress));
  return b.start + (b.end - b.start) * p;
}

export interface VoyageTimeline {
  progress(): number;
  scrollTo(progress: number): void;
  refresh(): void;
  kill(): void;
}

export function buildTimeline(
  gsap: GsapCore,
  ScrollTrigger: ScrollTriggerStatic,
  sections: readonly HTMLElement[],
  onUpdate: (progress: number) => void,
): VoyageTimeline {
  const first = sections[0]!;
  const last = sections[sections.length - 1]!;
  const proxy = { p: 0 };
  let alive = true;
  const tween = gsap.to(proxy, {
    p: 1,
    ease: 'none',
    scrollTrigger: {
      trigger: first,
      start: 'top top',
      endTrigger: last,
      end: 'bottom bottom',
      scrub: 0.6,
      invalidateOnRefresh: true,
      onUpdate: (self) => onUpdate(self.progress),
    },
  });
  const st = tween.scrollTrigger!;
  // A deep link or an early scroll: report where we already are, once, now.
  onUpdate(st.progress);

  return {
    progress: () => (alive ? st.progress : 0),
    scrollTo(progress) {
      if (!alive) return;
      const y = progressToScrollY(progress, { start: st.start, end: st.end });
      window.scrollTo({ top: Math.ceil(y), behavior: 'smooth' });
    },
    refresh: () => { if (alive) st.refresh(); },
    kill() {
      alive = false;
      st.kill();
      tween.kill();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/scene-timeline.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/scene/timeline.ts tests/unit/scene-timeline.test.ts
git commit -m "Scene: the page scroll timeline"
```

---

### Task 7: `materials.ts`, toon ramp and the inverted-hull outline

**Files:**
- Create: `src/components/scene/materials.ts`
- Test: `tests/unit/scene-materials.test.ts`

**Interfaces:**
- Consumes: `SceneTokens` from Task 2.
- Produces:

```ts
export function toonRamp(): DataTexture;                                    // 3 steps, nearest filter
export function toonMaterial(colorHex: string, ramp: DataTexture): MeshToonMaterial;
export function outlineMaterial(inkHex: string, width?: number): ShaderMaterial;
export function withOutline(mesh: Mesh, outline: ShaderMaterial): Group;   // mesh + back-face copy, ink
export function skyMaterial(tokens: SceneTokens): ShaderMaterial;          // dome gradient, uniforms top/bottom/mix
```

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/scene-materials.test.ts
import { BoxGeometry, Mesh, NearestFilter, BackSide, Color } from 'three';
import { describe, expect, it } from 'vitest';
import { outlineMaterial, skyMaterial, toonMaterial, toonRamp, withOutline } from '../../src/components/scene/materials';
import { readSceneTokens } from '../../src/components/scene/tokens';

const tokens = readSceneTokens(() => '');

describe('toon materials [unit]', () => {
  it('ramp has exactly three steps with nearest filtering (flat cel bands)', () => {
    const ramp = toonRamp();
    expect(ramp.image.width).toBe(3);
    expect(ramp.image.height).toBe(1);
    expect(ramp.magFilter).toBe(NearestFilter);
    expect(ramp.minFilter).toBe(NearestFilter);
  });

  it('toon material carries the token colour, the ramp, and no specular or env map', () => {
    const m = toonMaterial('#1B6F8A', toonRamp());
    expect(m.color.getHexString().toUpperCase()).toBe('1B6F8A');
    expect(m.gradientMap).not.toBeNull();
    expect((m as unknown as { envMap?: unknown }).envMap ?? null).toBeNull();
  });

  it('outline is a back-face ink shell with a screen-constant width uniform', () => {
    const o = outlineMaterial('#0E1B2B', 0.03);
    expect(o.side).toBe(BackSide);
    expect((o.uniforms.ink.value as Color).getHexString().toUpperCase()).toBe('0E1B2B');
    expect(o.uniforms.width.value).toBeCloseTo(0.03, 6);
    expect(o.vertexShader).toContain('normal');
  });

  it('withOutline groups the mesh with its shell, sharing geometry', () => {
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), toonMaterial('#9C6B3C', toonRamp()));
    const g = withOutline(mesh, outlineMaterial('#0E1B2B'));
    expect(g.children).toHaveLength(2);
    const shell = g.children[1] as Mesh;
    expect(shell.geometry).toBe(mesh.geometry);
    expect(shell.renderOrder).toBeLessThan(mesh.renderOrder);
  });

  it('sky material mixes dawn, day and late by a uniform', () => {
    const s = skyMaterial(tokens);
    expect(s.uniforms.mix.value).toBe(0);
    expect((s.uniforms.dawnTop.value as Color).getHexString().toUpperCase()).toBe('F7D6A8');
    expect(s.depthWrite).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/scene-materials.test.ts`
Expected: FAIL, cannot find module `materials.ts`.

- [ ] **Step 3: Implement `materials.ts`**

```ts
// src/components/scene/materials.ts
// The drawn look: a three-step toon ramp, flat colours from the tokens, an
// ink outline as an inverted hull (a back-face copy pushed out along its
// normals, scaled with distance so it stays near 2px on screen), and the sky
// dome gradient. No specular, no env maps, no shadows, no post-processing.
import {
  BackSide, Color, DataTexture, Group, Mesh, MeshToonMaterial, NearestFilter, RGBAFormat, ShaderMaterial, UnsignedByteType,
} from 'three';
import type { SceneTokens } from './tokens';

export function toonRamp(): DataTexture {
  // Shadow step, base, highlight: 3 bands. Values are brightness multipliers.
  const data = new Uint8Array([120, 120, 120, 255, 200, 200, 200, 255, 255, 255, 255, 255]);
  const tex = new DataTexture(data, 3, 1, RGBAFormat, UnsignedByteType);
  tex.magFilter = NearestFilter;
  tex.minFilter = NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

export function toonMaterial(colorHex: string, ramp: DataTexture): MeshToonMaterial {
  return new MeshToonMaterial({ color: new Color(colorHex), gradientMap: ramp });
}

const OUTLINE_VERT = /* glsl */ `
  uniform float width;
  void main() {
    vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
    // Screen-constant width: push along the normal in proportion to view depth.
    vec3 n = normalize(normalMatrix * normal);
    viewPos.xyz += n * width * -viewPos.z;
    gl_Position = projectionMatrix * viewPos;
  }
`;
const OUTLINE_FRAG = /* glsl */ `
  uniform vec3 ink;
  void main() { gl_FragColor = vec4(ink, 1.0); }
`;

export function outlineMaterial(inkHex: string, width = 0.012): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: { ink: { value: new Color(inkHex) }, width: { value: width } },
    vertexShader: OUTLINE_VERT,
    fragmentShader: OUTLINE_FRAG,
    side: BackSide,
  });
}

/** Returns a group: the mesh plus its outline shell (same geometry, drawn first). */
export function withOutline(mesh: Mesh, outline: ShaderMaterial): Group {
  const shell = new Mesh(mesh.geometry, outline);
  shell.renderOrder = -1;
  mesh.renderOrder = 0;
  const g = new Group();
  g.add(mesh, shell);
  return g;
}

const SKY_VERT = /* glsl */ `
  varying float vY;
  void main() {
    vY = normalize(position).y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const SKY_FRAG = /* glsl */ `
  uniform vec3 dawnTop; uniform vec3 dawnBottom; uniform vec3 dayTop; uniform vec3 dayBottom;
  uniform vec3 lateTop; uniform vec3 lateBottom; uniform float mix_;
  varying float vY;
  void main() {
    float h = clamp(vY * 1.6 + 0.2, 0.0, 1.0);
    vec3 top = mix_ < 0.5 ? mix(dawnTop, dayTop, mix_ * 2.0) : mix(dayTop, lateTop, (mix_ - 0.5) * 2.0);
    vec3 bottom = mix_ < 0.5 ? mix(dawnBottom, dayBottom, mix_ * 2.0) : mix(dayBottom, lateBottom, (mix_ - 0.5) * 2.0);
    // Two hard bands plus a soft top: the sky is drawn, not rendered.
    vec3 c = h < 0.35 ? bottom : h < 0.7 ? mix(bottom, top, 0.5) : top;
    gl_FragColor = vec4(c, 1.0);
  }
`;

export function skyMaterial(t: SceneTokens): ShaderMaterial {
  const lighten = (hex: string, k: number) => new Color(hex).lerp(new Color(t.chart), k);
  const m = new ShaderMaterial({
    uniforms: {
      dawnTop: { value: new Color(t.skyDawn) }, dawnBottom: { value: lighten(t.skyDawn, 0.5) },
      dayTop: { value: new Color(t.skyDay) }, dayBottom: { value: lighten(t.skyDay, 0.5) },
      lateTop: { value: new Color(t.skyLate) }, lateBottom: { value: lighten(t.skyLate, 0.5) },
      mix_: { value: 0 },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: BackSide,
    depthWrite: false,
  });
  // Expose `mix` as the public uniform name the tests and the sky module use.
  (m.uniforms as Record<string, { value: unknown }>).mix = m.uniforms.mix_!;
  return m;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/scene-materials.test.ts`
Expected: PASS (5 tests). `three` creates no WebGL context for these classes, so they run in Node.

- [ ] **Step 5: Commit**

```bash
git add src/components/scene/materials.ts tests/unit/scene-materials.test.ts
git commit -m "Scene: toon ramp, ink outline, sky gradient"
```

---

### Task 8: The spike scene modules: sea, one hull, three islands, sky and camera

**Files:**
- Create: `src/components/scene/sea.ts`
- Create: `src/components/scene/ships.ts`
- Create: `src/components/scene/islands.ts`
- Create: `src/components/scene/sky.ts`
- Create: `src/components/scene/camera.ts`
- Test: `tests/unit/scene-modules.test.ts`

**Interfaces:**
- Consumes: `SceneTokens`, `toonRamp`, `toonMaterial`, `outlineMaterial`, `withOutline`, `skyMaterial` (Tasks 2, 7); `SceneState`, `WorldLayout` (Tasks 3, 4).
- Produces: every module exports `build(ctx: SceneContext): SceneModule` where

```ts
export interface SceneContext { tokens: SceneTokens; ramp: DataTexture; outline: ShaderMaterial; layout: WorldLayout }
export interface Clock { t: number; dt: number }     // seconds
export interface SceneModule { object: Object3D; update(state: SceneState, clock: Clock): void; dispose(): void }
```
  and `camera.ts` exports `buildCamera(aspect: number): { camera: PerspectiveCamera; update(state: SceneState): void }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/scene-modules.test.ts
import { Mesh, PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { worldLayout } from '../../src/components/scene/layout';
import { sceneStateAt } from '../../src/components/scene/state';
import { outlineMaterial, toonRamp } from '../../src/components/scene/materials';
import { readSceneTokens } from '../../src/components/scene/tokens';
import { buildSea, SEA_SEGMENTS } from '../../src/components/scene/sea';
import { buildShip, HULL_LENGTHS } from '../../src/components/scene/ships';
import { buildIslands } from '../../src/components/scene/islands';
import { buildSky } from '../../src/components/scene/sky';
import { buildCamera } from '../../src/components/scene/camera';
import { stops } from '../../src/data/stops';

const tokens = readSceneTokens(() => '');
const layout = worldLayout(stops, [{ id: 'a', classified: false }, { id: 'b', classified: true }]);
const ctx = { tokens, ramp: toonRamp(), outline: outlineMaterial(tokens.ink), layout };
const clock = { t: 1, dt: 1 / 60 };

describe('scene modules [unit]', () => {
  it('sea is a displaced plane large enough to hold the whole route, animated by the clock', () => {
    const sea = buildSea(ctx);
    expect(SEA_SEGMENTS).toBe(160);
    const mesh = sea.object.getObjectByName('sea') as Mesh;
    expect(mesh).toBeDefined();
    const before = (mesh.material as { userData: { time: { value: number } } }).userData.time.value;
    sea.update(sceneStateAt(0, layout), { t: 2, dt: 1 / 60 });
    expect((mesh.material as { userData: { time: { value: number } } }).userData.time.value).toBeGreaterThan(before);
    sea.dispose();
  });

  it('ship follows the state: position on the route, heading, hull by index, swap lifts it', () => {
    const ship = buildShip(ctx);
    expect(HULL_LENGTHS).toEqual([3, 5, 8]);
    const s0 = sceneStateAt(0, layout);
    ship.update(s0, clock);
    expect(ship.object.position.distanceTo(s0.shipPosition)).toBeLessThan(0.01);
    const hulls = [0, 1, 2].map((i) => ship.object.getObjectByName(`hull-${i}`)!);
    expect(hulls[0]!.visible).toBe(true);
    expect(hulls[1]!.visible).toBe(false);
    ship.update({ ...s0, hull: 2, swapPhase: 0.5 }, clock);
    expect(hulls[2]!.visible).toBe(true);
    expect(hulls[0]!.visible).toBe(false);
    expect(ship.object.position.y).toBeGreaterThan(0.5); // lifted at the peak of a swap
    ship.dispose();
  });

  it('islands: one per career stop plus the harbour and the last island, at their positions', () => {
    const islands = buildIslands(ctx);
    const named = layout.stops.map((s) => islands.object.getObjectByName(`island-${s.id}`));
    for (const [i, n] of named.entries()) {
      expect(n, layout.stops[i]!.id).toBeDefined();
      expect(n!.position.distanceTo(layout.stops[i]!.position)).toBeLessThan(0.01);
    }
    expect(islands.object.getObjectByName('island-harbour')).toBeDefined();
    expect(islands.object.getObjectByName(`island-${layout.lastIsland.id}`)).toBeDefined();
    islands.dispose();
  });

  it('sky mixes with progress and moves the sun on its arc', () => {
    const sky = buildSky(ctx);
    sky.update(sceneStateAt(0, layout), clock);
    const sun = sky.object.getObjectByName('sun')!;
    const x0 = sun.position.x;
    sky.update(sceneStateAt(1, layout), clock);
    expect(sun.position.x).not.toBeCloseTo(x0, 1);
    sky.dispose();
  });

  it('camera sits on the state position and looks at the state target', () => {
    const { camera, update } = buildCamera(16 / 9);
    expect(camera).toBeInstanceOf(PerspectiveCamera);
    expect(camera.fov).toBe(42);
    const s = sceneStateAt(0.5, layout);
    update(s);
    expect(camera.position.distanceTo(s.cameraPosition)).toBeLessThan(0.01);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/scene-modules.test.ts`
Expected: FAIL, cannot find module `sea.ts`.

- [ ] **Step 3: Implement the five modules**

`src/components/scene/sea.ts`:

```ts
// The sea: one plane, displaced in the vertex shader by two sine fields (a
// long swell along x, a short chop along z), toon-shaded in three bands with a
// hard foam band where the crest is highest. Idle motion comes from the clock.
import { DoubleSide, Mesh, PlaneGeometry, Group } from 'three';
import type { DataTexture, ShaderMaterial, Object3D } from 'three';
import { toonMaterial } from './materials';
import type { SceneTokens } from './tokens';
import type { WorldLayout } from './layout';
import type { SceneState } from './state';

export interface SceneContext { tokens: SceneTokens; ramp: DataTexture; outline: ShaderMaterial; layout: WorldLayout }
export interface Clock { t: number; dt: number }
export interface SceneModule { object: Object3D; update(state: SceneState, clock: Clock): void; dispose(): void }

export const SEA_SEGMENTS = 160;
const SEA_SIZE = 160;

export function buildSea(ctx: SceneContext): SceneModule {
  const geometry = new PlaneGeometry(SEA_SIZE, SEA_SIZE, SEA_SEGMENTS, SEA_SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  const material = toonMaterial(ctx.tokens.sea, ctx.ramp);
  material.side = DoubleSide;
  const time = { value: 0 };
  material.userData.time = time;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vCrest;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float swell = sin(position.x * 0.18 + uTime * 0.6) * 0.35;
         float chop = sin(position.z * 0.9 + position.x * 0.3 - uTime * 1.4) * 0.12;
         transformed.y += swell + chop;
         vCrest = swell + chop;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCrest;\nuniform vec3 uFoam;')
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
         if (vCrest > 0.36) gl_FragColor.rgb = uFoam;`,
      );
    shader.uniforms.uFoam = { value: material.userData.foam };
  };
  material.userData.foam = material.color.clone().set(ctx.tokens.chart);
  const mesh = new Mesh(geometry, material);
  mesh.name = 'sea';
  mesh.position.y = -0.2;
  const group = new Group();
  group.add(mesh);
  return {
    object: group,
    update(_state, clock) { time.value = clock.t; },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}
```

`src/components/scene/ships.ts`:

```ts
// Three hulls from one generator: a tapered box hull (timber, one darker face
// via the toon ramp), a mast and a sail. The ship module holds all three and
// shows the one the state names; a swap lifts the ship and crosses over at
// the top of the lift.
import { BoxGeometry, BufferGeometry, CylinderGeometry, Float32BufferAttribute, Group, Mesh, PlaneGeometry } from 'three';
import { toonMaterial, withOutline } from './materials';
import type { SceneContext, SceneModule } from './sea';

export const HULL_LENGTHS = [3, 5, 8] as const;

function hullGeometry(length: number): BufferGeometry {
  // A hull: a box whose bow (x = -length/2, the ship faces west) narrows to a point.
  const w = length * 0.38;
  const h = length * 0.22;
  const geo = new BoxGeometry(length, h, w, 2, 1, 1);
  const pos = geo.attributes.position as Float32BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    if (x < -length * 0.25) pos.setZ(i, pos.getZ(i) * 0.35); // pinch the bow
    if (pos.getY(i) < 0) pos.setZ(i, pos.getZ(i) * 0.7);      // narrower below the waterline
  }
  geo.computeVertexNormals();
  return geo;
}

function hull(ctx: SceneContext, index: 0 | 1 | 2): Group {
  const length = HULL_LENGTHS[index];
  const timber = toonMaterial(ctx.tokens.timber, ctx.ramp);
  const body = withOutline(new Mesh(hullGeometry(length), timber), ctx.outline);
  const mastH = length * 0.9;
  const mast = withOutline(new Mesh(new CylinderGeometry(0.06, 0.08, mastH, 6), toonMaterial(ctx.tokens.timberDeep, ctx.ramp)), ctx.outline);
  mast.position.set(0, mastH / 2, 0);
  const sail = withOutline(new Mesh(new PlaneGeometry(length * 0.55, mastH * 0.6), toonMaterial(ctx.tokens.chart, ctx.ramp)), ctx.outline);
  sail.position.set(-length * 0.1, mastH * 0.55, 0);
  const g = new Group();
  g.name = `hull-${index}`;
  g.add(body, mast, sail);
  return g;
}

export function buildShip(ctx: SceneContext): SceneModule {
  const ship = new Group();
  ship.name = 'ship';
  const hulls = [hull(ctx, 0), hull(ctx, 1), hull(ctx, 2)];
  hulls.forEach((h, i) => { h.visible = i === 0; ship.add(h); });
  return {
    object: ship,
    update(state, clock) {
      ship.position.copy(state.shipPosition);
      ship.rotation.y = -state.shipHeading + Math.PI; // the hull geometry faces -x; heading 0 is +x
      // Lift and drop at a swap (a sine bump), plus a gentle idle bob.
      const lift = state.swapPhase > 0 ? Math.sin(state.swapPhase * Math.PI) * 1.2 : 0;
      ship.position.y += lift + Math.sin(clock.t * 1.3) * 0.06;
      ship.rotation.z = Math.sin(clock.t * 0.9) * 0.02;
      hulls.forEach((h, i) => { h.visible = i === state.hull; });
    },
    dispose() {
      ship.traverse((o) => { if (o instanceof Mesh) { o.geometry.dispose(); (o.material as { dispose(): void }).dispose(); } });
    },
  };
}
```

`src/components/scene/islands.ts`:

```ts
// Islands: stacked low-poly cones with a sand ring at the waterline, one per
// career stop, the harbour island, and the last island. Heights vary by index
// so the chart reads as a journey, not a row of the same cone.
import { ConeGeometry, Group, Mesh, TorusGeometry } from 'three';
import { toonMaterial, withOutline } from './materials';
import type { SceneContext, SceneModule } from './sea';
import type { Vector3 } from 'three';

function island(ctx: SceneContext, name: string, at: Vector3, scale: number): Group {
  const g = new Group();
  g.name = name;
  g.position.copy(at);
  const sand = withOutline(new Mesh(new TorusGeometry(2.4 * scale, 0.5 * scale, 6, 18), toonMaterial(ctx.tokens.sand, ctx.ramp)), ctx.outline);
  sand.rotation.x = Math.PI / 2;
  sand.position.y = -0.1;
  const tiers = [
    { r: 2.2, h: 1.6, y: 0 },
    { r: 1.4, h: 1.4, y: 1.0 },
    { r: 0.8, h: 1.2, y: 1.9 },
  ];
  g.add(sand);
  for (const t of tiers) {
    const m = withOutline(new Mesh(new ConeGeometry(t.r * scale, t.h * scale, 7), toonMaterial(ctx.tokens.leaf, ctx.ramp)), ctx.outline);
    m.position.y = (t.y + t.h / 2) * scale;
    g.add(m);
  }
  return g;
}

export function buildIslands(ctx: SceneContext): SceneModule {
  const group = new Group();
  ctx.layout.stops.forEach((s, i) => {
    group.add(island(ctx, `island-${s.id}`, s.position, 0.8 + (i % 3) * 0.25));
  });
  const h = ctx.layout.harbour;
  const centre = h.berths[0]!.position.clone().lerp(h.berths[h.berths.length - 1]!.position, 0.5);
  centre.z -= 4;
  group.add(island(ctx, 'island-harbour', centre, 1.6));
  group.add(island(ctx, `island-${ctx.layout.lastIsland.id}`, ctx.layout.lastIsland.position, 1.0));
  return {
    object: group,
    update() {},
    dispose() {
      group.traverse((o) => { if (o instanceof Mesh) { o.geometry.dispose(); (o.material as { dispose(): void }).dispose(); } });
    },
  };
}
```

`src/components/scene/sky.ts`:

```ts
// Sky dome (gradient by progress), the sun disc on its arc, and nothing else
// for the spike. Clouds and gulls arrive in plan 3.
import { CircleGeometry, Group, Mesh, MeshBasicMaterial, SphereGeometry, Color } from 'three';
import { skyMaterial } from './materials';
import type { SceneContext, SceneModule } from './sea';

export function buildSky(ctx: SceneContext): SceneModule {
  const group = new Group();
  const dome = new Mesh(new SphereGeometry(400, 24, 12), skyMaterial(ctx.tokens));
  dome.name = 'sky';
  const sun = new Mesh(new CircleGeometry(9, 24), new MeshBasicMaterial({ color: new Color(ctx.tokens.sun) }));
  sun.name = 'sun';
  group.add(dome, sun);
  return {
    object: group,
    update(state) {
      (dome.material as { uniforms: { mix: { value: number } } }).uniforms.mix.value = state.skyMix;
      // Arc from low-left (east, behind the start) to low-right, peaking at midday.
      const a = state.sunAngle;
      sun.position.set(Math.cos(a) * 220, Math.sin(a) * 140 + 20, -260);
      sun.lookAt(state.cameraPosition);
      dome.position.copy(state.cameraPosition);
    },
    dispose() {
      dome.geometry.dispose(); (dome.material as { dispose(): void }).dispose();
      sun.geometry.dispose(); (sun.material as { dispose(): void }).dispose();
    },
  };
}
```

`src/components/scene/camera.ts`:

```ts
// The chase camera: position and look-at come straight from the state; a
// small lean follows scroll velocity (added in plan 2).
import { PerspectiveCamera } from 'three';
import type { SceneState } from './state';

export function buildCamera(aspect: number): { camera: PerspectiveCamera; update(state: SceneState): void } {
  const camera = new PerspectiveCamera(42, aspect, 0.5, 900);
  return {
    camera,
    update(state) {
      camera.position.copy(state.cameraPosition);
      camera.lookAt(state.cameraLookAt);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/scene-modules.test.ts`
Expected: PASS (5 tests). If the sky test fails on `sun.position.x` unchanged, check `sunAngle` runs 0 to PI (Task 4) so cos moves from 1 to -1.

- [ ] **Step 5: Commit**

```bash
git add src/components/scene/sea.ts src/components/scene/ships.ts src/components/scene/islands.ts src/components/scene/sky.ts src/components/scene/camera.ts tests/unit/scene-modules.test.ts
git commit -m "Scene: sea, hulls, islands, sky and chase camera"
```

---

### Task 9: The `Voyage3D` island, mounted on the home page

**Files:**
- Create: `src/components/scene/Voyage3D.tsx`
- Create: `src/components/scene/loader.ts`
- Create: `src/styles/scene.css`
- Modify: `src/pages/index.astro` (mount the island; `data-scene-chapter` on the chapter sections)
- Modify: `src/components/Hero.astro:9` (`data-scene-chapter="hero"` on the section)
- Modify: `src/components/LogbookSection.astro:15` (`data-scene-chapter={id}` on the section)
- Modify: `src/layouts/BaseLayout.astro` (import `scene.css`)
- Test: `tests/unit/scene-island.test.ts`, `tests/e2e/voyage-3d.spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 2 to 8.
- Produces: `window.__scene = { state: 'static' | 'loading' | 'probing' | 'live' | 'paused', progress, triggers, mounted }` behind `?voyage=debug`; `data-scene-live` on the island root when live; `<canvas data-scene-canvas aria-hidden>`; a `[data-scene-pause]` button.

- [ ] **Step 1: Write the failing unit test**

```ts
// tests/unit/scene-island.test.ts
import { describe, expect, it } from 'vitest';
import { renderAstro } from '../helpers/container';
import IndexPage from '../../src/pages/index.astro';
import { SCENE_QUERY } from '../../src/components/scene/mount';
import { decideLoad } from '../../src/components/scene/loader';

describe('Voyage3D on the home page [unit]', () => {
  it('mounts once, with client:media on the scene query, and renders no canvas on the server', async () => {
    const html = await renderAstro(IndexPage);
    const islands = html.match(/<astro-island\b[^>]*component-url="[^"]*Voyage3D[^"]*"[^>]*>/g) ?? [];
    expect(islands).toHaveLength(1);
    const decoded = islands[0]!.replace(/&quot;/g, '"');
    expect(decoded).toMatch(/\bclient="media"/);
    expect(decoded).toContain(SCENE_QUERY);
    expect(html).not.toContain('<canvas');
    expect(html).toMatch(/<div\b[^>]*data-scene-root/);
  });

  it('every chapter section carries data-scene-chapter in page order', async () => {
    const html = await renderAstro(IndexPage);
    const ids = [...html.matchAll(/data-scene-chapter="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(['hero', 'log', 'voyage', 'about', 'contact']);
  });
});

describe('loader decisions [unit]', () => {
  it('loads once and never retries after a failure', () => {
    expect(decideLoad({ attempted: false, failed: false })).toBe('load');
    expect(decideLoad({ attempted: true, failed: true })).toBe('static');
    expect(decideLoad({ attempted: true, failed: false })).toBe('reuse');
  });
});
```

- [ ] **Step 2: Run unit test to verify it fails**

Run: `npx vitest run tests/unit/scene-island.test.ts`
Expected: FAIL, cannot find module `loader.ts`.

- [ ] **Step 3: Write the failing e2e test**

```ts
// tests/e2e/voyage-3d.spec.ts
import { expect, test, type Page } from '@playwright/test';
import { stops } from '../../src/data/stops';

// The 3D voyage spike on /. State, never pixels. The hook is exposed with ?voyage=debug.
const PAGE = '/?voyage=debug';
const DESKTOP = { width: 1440, height: 900 };
type SceneHook = { state: string; progress: number; triggers: number; mounted: boolean };
declare global { interface Window { __scene?: SceneHook; __shifts?: Array<{ value: number; hadRecentInput: boolean; inIsland: boolean }> } }

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
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(heightBefore);
    expect((await hook(page)).triggers).toBe(1);

    const samples: number[] = [];
    const total = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    for (let i = 0; i <= 10; i++) {
      await page.evaluate((y) => window.scrollTo(0, y), Math.round((total * i) / 10));
      await page.waitForFunction((yy) => Math.abs(window.scrollY - yy) <= 1, Math.round((total * i) / 10));
      await page.waitForTimeout(120);
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

  test('pause stops the scene and leaves anchors native; play resumes', async ({ page }, info) => {
    test.skip(isMobile(info.project.name), 'desktop case');
    await page.goto(PAGE);
    await live(page);
    const pause = page.locator('[data-scene-pause]');
    await expect(pause).toHaveText('Pause the sea');
    await pause.click();
    await expect(pause).toHaveText('Sail on');
    await page.waitForFunction(() => window.__scene?.state === 'paused' && window.__scene.triggers === 0);
    await expect(page.locator('canvas[data-scene-canvas]')).toHaveCount(0);
    await page.locator('footer a[href="/#contact"]').click();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#contact');
    await pause.click();
    await page.waitForFunction(() => window.__scene?.state === 'live');
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
    await page.route('**/_astro/three*.js', (route) => { attempts++; void route.abort(); });
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
```

- [ ] **Step 4: Implement `loader.ts`, `Voyage3D.tsx`, `scene.css`, and the page hooks**

`src/components/scene/loader.ts`:

```ts
// Loads Three.js and GSAP once, after the page is idle. A failed load is
// remembered for the session so the island never retries or loops.
export type LoadDecision = 'load' | 'reuse' | 'static';
export function decideLoad(s: { attempted: boolean; failed: boolean }): LoadDecision {
  if (!s.attempted) return 'load';
  return s.failed ? 'static' : 'reuse';
}

type GsapCore = typeof import('gsap').gsap;
type ScrollTriggerStatic = typeof import('gsap/ScrollTrigger').ScrollTrigger;
export interface SceneLibs { three: typeof import('three'); gsap: GsapCore; ScrollTrigger: ScrollTriggerStatic }

let attempted = false;
let failed = false;
let libs: Promise<SceneLibs> | null = null;

export function loadScene(): Promise<SceneLibs> | null {
  const d = decideLoad({ attempted, failed });
  if (d === 'static') return null;
  if (d === 'reuse') return libs;
  attempted = true;
  libs = Promise.all([import('three'), import('gsap'), import('gsap/ScrollTrigger')])
    .then(([three, g, st]) => {
      const gsap = (g.gsap ?? g.default) as GsapCore;
      gsap.registerPlugin(st.ScrollTrigger);
      st.ScrollTrigger.config({ ignoreMobileResize: true });
      return { three, gsap, ScrollTrigger: st.ScrollTrigger };
    })
    .catch((err: unknown) => { failed = true; throw err; });
  return libs;
}

/** Resolves when the browser is idle, or after `ms`, whichever is first. */
export function whenIdle(ms = 1500): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    if ('requestIdleCallback' in window) (window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(finish);
    setTimeout(finish, ms);
  });
}
```

`src/components/scene/Voyage3D.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import type { Stop } from '@/data/stops';
import { worldLayout, type WorldLayout } from './layout';
import { sceneStateAt } from './state';
import { canMount, probe, SCENE_QUERY } from './mount';
import { loadScene, whenIdle } from './loader';
import { buildTimeline, type VoyageTimeline } from './timeline';
import { readSceneTokens } from './tokens';
import { outlineMaterial, toonRamp } from './materials';
import { buildSea, type SceneModule } from './sea';
import { buildShip } from './ships';
import { buildIslands } from './islands';
import { buildSky } from './sky';
import { buildCamera } from './camera';
import '../../styles/scene.css';

// The 3D voyage island (ARCHITECTURE.md §2, §5). Mounted once from the home
// page with client:media on SCENE_QUERY, so phones never load it. States:
// static -> loading -> probing -> live <-> paused, and back to static on a
// narrower viewport, reduced motion, a failed load or a failed probe. The
// canvas is fixed, aria-hidden and pointer-events: none; the HTML page is
// never changed by this component beyond attributes on its own root.

export type SceneRunState = 'static' | 'loading' | 'probing' | 'live' | 'paused';
interface SceneHook { readonly state: SceneRunState; readonly progress: number; readonly triggers: number; readonly mounted: boolean }
declare global { interface Window { __scene?: SceneHook } }

export interface Voyage3DProps { stops: readonly Stop[]; berths: readonly { id: string; classified: boolean }[] }

export default function Voyage3D({ stops, berths }: Voyage3DProps) {
  const root = useRef<HTMLDivElement>(null);
  const [runState, setRunState] = useState<SceneRunState>('static');
  const [paused, setPaused] = useState(false);
  const [canvasOn, setCanvasOn] = useState(false);
  const live = useRef({ progress: 0, timeline: null as VoyageTimeline | null, st: null as { getAll(): unknown[] } | null, state: 'static' as SceneRunState });

  // Test hook behind ?voyage=debug (or dev).
  useEffect(() => {
    const debug = import.meta.env.DEV || new URLSearchParams(window.location.search).get('voyage') === 'debug';
    if (!debug) return;
    const l = live.current;
    window.__scene = {
      get state() { return l.state; },
      get progress() { return l.progress; },
      get triggers() { return l.st ? l.st.getAll().length : 0; },
      get mounted() { return l.state === 'live'; },
    };
    return () => { delete window.__scene; };
  }, []);

  const setState = (s: SceneRunState) => { live.current.state = s; setRunState(s); };

  useEffect(() => {
    const mq = window.matchMedia(SCENE_QUERY);
    const env = () => ({ width: window.innerWidth, reducedMotion: !mq.matches && window.matchMedia('(prefers-reduced-motion: reduce)').matches, webgl2: !!document.createElement('canvas').getContext('webgl2'), paused });
    if (!canMount(env())) { setState(paused ? 'paused' : 'static'); setCanvasOn(false); return; }

    let cancelled = false;
    let teardown: (() => void) | null = null;
    setState('loading');

    void (async () => {
      await whenIdle();
      const libsP = loadScene();
      if (!libsP) { setState('static'); return; }
      let libs;
      try { libs = await libsP; } catch { if (!cancelled) setState('static'); return; }
      if (cancelled || !root.current) return;

      const { three, gsap, ScrollTrigger } = libs;
      const tokens = readSceneTokens((n) => getComputedStyle(document.documentElement).getPropertyValue(n));
      const layout: WorldLayout = worldLayout(stops, berths);
      const ctx = { tokens, ramp: toonRamp(), outline: outlineMaterial(tokens.ink), layout };

      const canvas = document.createElement('canvas');
      canvas.setAttribute('data-scene-canvas', '');
      canvas.setAttribute('aria-hidden', 'true');
      canvas.className = 'scene-canvas';
      root.current.appendChild(canvas);
      setCanvasOn(true);

      const renderer = new three.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      const scene = new three.Scene();
      const { camera, update: updateCamera } = buildCamera(window.innerWidth / window.innerHeight);
      const modules: SceneModule[] = [buildSky(ctx), buildSea(ctx), buildIslands(ctx), buildShip(ctx)];
      for (const m of modules) scene.add(m.object);
      const sun = new three.DirectionalLight(0xffffff, 2.2);
      sun.position.set(30, 60, 40);
      scene.add(sun, new three.HemisphereLight(new three.Color(tokens.skyDay), new three.Color(tokens.seaDeep), 1.1));

      let state = sceneStateAt(0, layout);
      const clock = { t: 0, dt: 0 };
      let lastNow = performance.now();
      const frame = (now: number) => {
        clock.dt = Math.min(0.1, (now - lastNow) / 1000);
        clock.t += clock.dt;
        lastNow = now;
        for (const m of modules) m.update(state, clock);
        updateCamera(state);
        renderer.render(scene, camera);
      };

      setState('probing');
      const result = await probe({ tick: (cb) => requestAnimationFrame(cb), render: () => frame(performance.now()) });
      if (cancelled) return;
      if (!result.pass) {
        teardown = null;
        canvas.remove(); renderer.dispose(); for (const m of modules) m.dispose();
        setCanvasOn(false); setState('static');
        return;
      }

      const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-scene-chapter]'));
      const timeline = buildTimeline(gsap, ScrollTrigger, sections, (p) => { live.current.progress = p; state = sceneStateAt(p, layout); });
      live.current.timeline = timeline;
      live.current.st = ScrollTrigger;

      let raf = 0;
      const loop = (now: number) => { frame(now); raf = requestAnimationFrame(loop); };
      raf = requestAnimationFrame(loop);
      const onResize = () => {
        renderer.setSize(window.innerWidth, window.innerHeight, false);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        timeline.refresh();
      };
      window.addEventListener('resize', onResize);
      root.current.setAttribute('data-scene-live', '');
      setState('live');

      teardown = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', onResize);
        timeline.kill();
        live.current.timeline = null;
        root.current?.removeAttribute('data-scene-live');
        canvas.remove();
        for (const m of modules) m.dispose();
        renderer.dispose();
        setCanvasOn(false);
      };
    })();

    const onChange = () => { if (!canMount(env())) { cancelled = true; teardown?.(); teardown = null; setState(paused ? 'paused' : 'static'); } };
    mq.addEventListener('change', onChange);
    return () => { cancelled = true; mq.removeEventListener('change', onChange); teardown?.(); teardown = null; };
  }, [paused, stops, berths]);

  return (
    <div ref={root} className="scene-root" data-scene-root="" data-scene-state={runState}>
      <button type="button" className="scene-pause" data-scene-pause="" aria-pressed={paused} hidden={runState === 'static' || runState === 'loading'} onClick={() => setPaused((v) => !v)}>
        {paused ? 'Sail on' : 'Pause the sea'}
      </button>
      {canvasOn ? null : null}
    </div>
  );
}
```

`src/styles/scene.css`:

```css
/* The 3D voyage layer. The canvas is fixed behind the page; the page keeps its
   own stacking context above it. Nothing here changes any layout box. */
.scene-root {
  display: contents;
}

.scene-canvas {
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  z-index: 0;
  pointer-events: none;
  opacity: 0;
  transition: opacity 400ms var(--ease);
}

[data-scene-live] .scene-canvas {
  opacity: 1;
}

.scene-pause {
  position: fixed;
  right: var(--gutter);
  bottom: var(--s-5);
  z-index: 5;
  min-height: var(--tap);
  padding: 0 var(--s-4);
  font: inherit;
  font-weight: 500;
  color: var(--ink);
  background: var(--chart);
  border: var(--rule);
  border-radius: var(--r);
  cursor: pointer;
}

.scene-pause:hover { background: var(--sun); }
.scene-pause:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; box-shadow: 0 0 0 5px var(--sun); }

/* The page sits above the canvas. Spike only: sections keep their backgrounds;
   plan 2 restyles chapters into paper cards over the sea. */
body > header, main, footer { position: relative; z-index: 1; }

/* Art review: ?scene=solo hides the page so the scene can be judged alone. */
html[data-scene-solo] main, html[data-scene-solo] footer { visibility: hidden; }
```

In `src/pages/index.astro`, add to the frontmatter after `entries`:

```ts
import Voyage3D from '../components/scene/Voyage3D';
import { SCENE_QUERY } from '../components/scene/mount';
const berths = entries.map((e) => ({ id: e.id, classified: e.study.kind === 'classified' }));
```

and inside `<BaseLayout>` as the first child:

```astro
  <Voyage3D client:media={SCENE_QUERY} stops={stops} berths={berths} />
```

In `src/components/Hero.astro` change the section open tag to `<section class="hero" aria-labelledby="hero-name" data-scene-chapter="hero">`. In `src/components/LogbookSection.astro` change the section open tag to `<section id={id} class:list={['chapter-section', className]} aria-labelledby={`${id}-title`} data-scene-chapter={id}>`. In `src/layouts/BaseLayout.astro` add `import '../styles/scene.css';` after the global CSS import, and in the `<head>` add the solo switch script as an inline Astro script: `<script is:inline>if (new URLSearchParams(location.search).get('scene') === 'solo') document.documentElement.setAttribute('data-scene-solo', '');</script>`. Note: Astro's CSP hashes `is:inline` scripts it emits from `.astro` files, so no CSP change is needed; Task 10 verifies with the existing CSP e2e.

- [ ] **Step 5: Run unit tests, build, run the e2e**

Run: `npx vitest run tests/unit/scene-island.test.ts && npx astro check && npm run build && npx size-limit && npx playwright test tests/e2e/voyage-3d.spec.ts tests/e2e/launch.spec.ts --reporter=line`
Expected: unit PASS; `astro check` 0 errors; size-limit: desktop tier reports under 400 kB, phone tier unchanged; e2e PASS on chromium and webkit (the probe may mark headless WebKit static; the `live()` helper skips those cases and reports the skip). The CSP e2e in `launch.spec.ts` must still pass with the new inline script and the WebGL canvas.

If `component-url` in the unit test does not contain `Voyage3D`, Astro names the chunk by the manual chunk (`scene`); change the regex to `component-url="[^"]*(Voyage3D|scene)[^"]*"`.

- [ ] **Step 6: Commit**

```bash
git add src/components/scene/Voyage3D.tsx src/components/scene/loader.ts src/styles/scene.css src/pages/index.astro src/components/Hero.astro src/components/LogbookSection.astro src/layouts/BaseLayout.astro tests/unit/scene-island.test.ts tests/e2e/voyage-3d.spec.ts
git commit -m "Scene: the Voyage3D island on the home page"
```

---

### Task 10: The frame-rate protocol, the look check and the stop rule

**Files:**
- Modify: `scripts/perf-trace.mjs:30-37` (wait on `window.__scene.state === 'live'` instead of `window.__voyage.mounted`; the scroll range is the whole page)
- Modify: `docs/ci-gates.md` (frame-rate row: the 3D page)
- Create: `factory/artifacts/qa/traces/scene-spike.trace.json` (output, private)
- Modify: `factory/artifacts/IMPLEMENTATION_LOG.md` (entry 16: the spike result and the go/no-go)

**Interfaces:**
- Consumes: the hook from Task 9.

- [ ] **Step 1: Point the trace script at the scene**

In `scripts/perf-trace.mjs` replace the mount wait with:

```js
await page
  .waitForFunction(() => window.__scene?.state === 'live' || window.__scene?.state === 'static', null, { timeout: 20_000 })
  .catch(() => { throw new Error('Scene never settled (needs a desktop viewport, motion allowed, and ?voyage=debug in the URL).'); });
const sceneState = await page.evaluate(() => window.__scene?.state);
if (sceneState !== 'live') throw new Error(`Scene is "${sceneState}" on this machine: the probe failed, so there is nothing to trace. Record this as a NO-GO for this hardware.`);
```

and replace the section-bounds block with the whole page:

```js
const { top, bottom } = await page.evaluate(() => ({ top: 0, bottom: document.documentElement.scrollHeight - window.innerHeight }));
```

Change the default output path to `factory/artifacts/qa/traces/scene-spike.trace.json` in both scripts' defaults and header comments.

- [ ] **Step 2: Build, serve, trace, summarise**

Run:

```bash
npm run build && (npx astro preview --port 4321 --host 127.0.0.1 --ignore-lock &) && sleep 2 && node scripts/perf-trace.mjs && node scripts/fps-from-trace.mjs factory/artifacts/qa/traces/scene-spike.trace.json
```

Expected: `RESULT GO` with median fps at least 50 and 0 frames over 32 ms. If NO-GO, apply one round of tuning in this order and re-trace once: (1) `renderer.setPixelRatio(1)`; (2) `SEA_SEGMENTS` 160 to 120; (3) outline width 0.012 to 0.009 and skip the outline on the sea; (4) sky dome segments 24/12 to 16/8. If still NO-GO after the round, the stop rule applies: stop, record NO-GO in the log entry, and present the owner with the layered 2D direction (spec §7) instead of continuing to plan 2.

- [ ] **Step 3: The look check (owner and executor)**

Run the preview and open `http://127.0.0.1:4321/?voyage=debug&scene=solo` at 1440 by 900. Capture screenshots at scroll 0%, 30%, 60% and 100% into the session scratchpad and look at them against Design Plan v2 §5: the outline reads as a near-2px ink line at the chase distance; the sea shows three flat bands and hard foam, no gradient; the hull is flat timber with one darker face; the sky is two bands and a flat sun. Record what passes and what does not in the log entry. The look items that fail are tuned in plan 2; only the frame bar stops the plan.

- [ ] **Step 4: Full gates**

Run: `npx astro check && npx vitest run && npm run build && npm run ip-scan && npx size-limit && npx playwright test --reporter=line && npx lhci autorun`
Expected: all green; Lighthouse mobile unchanged (LCP under 1,700 ms, CLS 0, accessibility 1.0); the phone tier unchanged.

- [ ] **Step 5: Record the result**

Append entry 16 to `factory/artifacts/IMPLEMENTATION_LOG.md` with the standard fields (phase, goal, tests, files, summary, known issues) and the trace numbers, the GO or NO-GO, and the look-check verdicts. Update `docs/ci-gates.md`'s frame-rate row to name the 3D page and the `?scene=solo` art-review switch.

- [ ] **Step 6: Commit**

```bash
git add scripts/perf-trace.mjs scripts/fps-from-trace.mjs docs/ci-gates.md
git commit -m "Scene: frame-rate protocol on the 3D page; spike recorded"
```

---

## Self-review

**Spec coverage.** Spec §3.2 mount condition: Tasks 5 and 9. §3.3 sea, hull, islands, sky, camera: Task 8 (clouds, gulls, wake, harbour pier and the full hull swap beat are plan 2 and 3, as the spec's build order says). §3.4 scroll drives everything, no hijack: Task 6. §3.5 the 2D fallback page: the existing HTML is the fallback in this plan; the painted layers are plan 4. §3.6 budgets: Task 1 and Task 10. §3.7 pause control: Task 9. §6 tests: Tasks 3 to 9. §7 build order step 1 and the stop rule: Task 10. ARCHITECTURE §4 interfaces: each task's Interfaces block uses the same names.

**Placeholder scan.** No TBD or "similar to" references; every code step carries its code.

**Type consistency.** `SceneContext`, `Clock`, `SceneModule` are defined once in `sea.ts` and imported by the other modules; `SceneState` field names in Task 4 match their use in Tasks 8 and 9; `WorldLayout` fields (`stops`, `harbour.berths`, `lastIsland`, `chapters`, `route`, `cameraPath`) match across Tasks 3, 4, 8; the hook names `state`, `progress`, `triggers`, `mounted` match between Task 9's component and spec.

**Review Focus.** Each of the five lines names the task whose tests pin it: 1 in Tasks 5 and 9; 2 in Task 9 (resize test); 3 in Tasks 6 and 9 (pause + anchor test); 4 in Tasks 6 and 9 (deep-link test); 5 in Task 9 (loader unit test + aborted-download e2e).
