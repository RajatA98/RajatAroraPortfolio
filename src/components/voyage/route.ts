// Route geometry for the Voyage chart: a smooth, low-node curve through the
// stop coordinates (Catmull-Rom converted to one cubic Bezier per leg), plus
// where each stop sits along it (0..1, by arc length), plus a point-and-heading
// lookup for the ship. Pure and DOM-free, so the server render and the client
// animation agree on the same numbers and the animation never measures the
// SVG path per frame.

export interface Point {
  x: number;
  y: number;
}

export interface Route {
  /** SVG path data, one `C` segment per leg. */
  d: string;
  /** Arc-length progress (0..1) of each input point along `d`. */
  progress: number[];
  /** Total arc length in viewBox units. */
  total: number;
  /** @internal cubic legs, their lengths and per-leg cumulative sample tables. */
  legs: Cubic[];
  lengths: number[];
  tables: number[][];
}

export interface RoutePoint extends Point {
  /** Heading in radians, screen coordinates (y grows downward): 0 is east, PI/2 is south. */
  angle: number;
}

export interface Heading {
  /** 1 when the hull faces right, -1 when it is mirrored to face left. */
  facing: 1 | -1;
  /** Bank in degrees, clamped; positive tips the bow down the chart. */
  rotation: number;
}

type Cubic = [Point, Point, Point, Point];

const SAMPLES = 48;
const round = (n: number) => Math.round(n * 10) / 10;

function legsOf(points: readonly Point[], tension = 0.5): Cubic[] {
  const out: Cubic[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    const k = tension / 3;
    out.push([
      p1,
      { x: p1.x + (p2.x - p0.x) * k, y: p1.y + (p2.y - p0.y) * k },
      { x: p2.x - (p3.x - p1.x) * k, y: p2.y - (p3.y - p1.y) * k },
      p2,
    ]);
  }
  return out;
}

function evaluate([a, b, c, d]: Cubic, t: number): Point {
  const mt = 1 - t;
  return {
    x: mt * mt * mt * a.x + 3 * mt * mt * t * b.x + 3 * mt * t * t * c.x + t * t * t * d.x,
    y: mt * mt * mt * a.y + 3 * mt * mt * t * b.y + 3 * mt * t * t * c.y + t * t * t * d.y,
  };
}

function tangent([a, b, c, d]: Cubic, t: number): Point {
  const mt = 1 - t;
  return {
    x: 3 * mt * mt * (b.x - a.x) + 6 * mt * t * (c.x - b.x) + 3 * t * t * (d.x - c.x),
    y: 3 * mt * mt * (b.y - a.y) + 6 * mt * t * (c.y - b.y) + 3 * t * t * (d.y - c.y),
  };
}

/** Cumulative arc length at each of SAMPLES+1 evenly spaced t values (index 0 is 0). */
function sampleTable(leg: Cubic): number[] {
  const table = [0];
  let prev = leg[0];
  for (let s = 1; s <= SAMPLES; s++) {
    const p = evaluate(leg, s / SAMPLES);
    table.push(table[s - 1]! + Math.hypot(p.x - prev.x, p.y - prev.y));
    prev = p;
  }
  return table;
}

export function buildRoute(points: readonly Point[]): Route {
  if (points.length === 0) return { d: '', progress: [], total: 0, legs: [], lengths: [], tables: [] };
  if (points.length === 1) {
    const p = points[0]!;
    return { d: `M${p.x} ${p.y}`, progress: [0], total: 0, legs: [], lengths: [], tables: [] };
  }
  const legs = legsOf(points);
  const tables = legs.map(sampleTable);
  const lengths = tables.map((t) => t[SAMPLES]!);
  const total = lengths.reduce((a, b) => a + b, 0) || 1;
  const progress = [0];
  let acc = 0;
  for (const l of lengths) {
    acc += l;
    progress.push(Math.min(1, acc / total));
  }
  const first = points[0]!;
  const d =
    `M${round(first.x)} ${round(first.y)}` +
    legs.map(([, b, c, e]) => `C${round(b.x)} ${round(b.y)} ${round(c.x)} ${round(c.y)} ${round(e.x)} ${round(e.y)}`).join('');
  return { d, progress, total, legs, lengths, tables };
}

/** The point on the route at arc-length `progress` (clamped to 0..1) and the heading there. */
export function pointAt(route: Route, progress: number): RoutePoint {
  const { legs, lengths, tables, total } = route;
  if (legs.length === 0) {
    const m = route.d.match(/^M(-?[\d.]+) (-?[\d.]+)/);
    return { x: m ? Number(m[1]) : 0, y: m ? Number(m[2]) : 0, angle: 0 };
  }
  const target = Math.min(1, Math.max(0, progress)) * total;
  let i = 0;
  let before = 0;
  while (i < legs.length - 1 && before + lengths[i]! < target) {
    before += lengths[i]!;
    i++;
  }
  const local = Math.min(lengths[i]!, Math.max(0, target - before));
  const table = tables[i]!;
  let j = 0;
  while (j < SAMPLES - 1 && table[j + 1]! < local) j++;
  const span = table[j + 1]! - table[j]!;
  const t = (j + (span > 0 ? (local - table[j]!) / span : 0)) / SAMPLES;
  const leg = legs[i]!;
  const p = evaluate(leg, t);
  let d = tangent(leg, t);
  if (Math.abs(d.x) + Math.abs(d.y) < 1e-9) {
    // Degenerate tangent (coincident control points): fall back to the chord.
    d = { x: leg[3].x - leg[0].x, y: leg[3].y - leg[0].y };
  }
  return { x: p.x, y: p.y, angle: Math.atan2(d.y, d.x) };
}

/**
 * How the ship sprite should sit for a heading: mirrored when sailing west
 * (never upside down), and banked with the slope up to `maxBank` degrees.
 */
export function shipHeading(angle: number, maxBank: number): Heading {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const facing: 1 | -1 = cos < 0 ? -1 : 1;
  const pitch = (Math.atan2(sin, Math.abs(cos)) * 180) / Math.PI;
  const bank = Math.max(-maxBank, Math.min(maxBank, facing * pitch));
  // Round away the floating-point dust so "due east" is exactly 0.
  const rotation = Math.abs(bank) < 1e-9 ? 0 : bank;
  return { facing, rotation };
}

/** Index of the last stop whose progress has been reached (-1 before the first). */
export function activeIndexFor(progress: number, stopProgress: readonly number[]): number {
  let idx = -1;
  for (let i = 0; i < stopProgress.length; i++) {
    if (progress + 1e-4 >= stopProgress[i]!) idx = i;
  }
  return idx;
}
