// Route geometry for the Voyage chart: a smooth, low-node curve through the
// stop coordinates (Catmull-Rom converted to one cubic Bezier per leg), plus
// where each stop sits along it (0..1, by arc length). Pure and DOM-free, so
// the server render and the client animation agree on the same numbers.

export interface Point {
  x: number;
  y: number;
}

export interface Route {
  /** SVG path data, one `C` segment per leg. */
  d: string;
  /** Arc-length progress (0..1) of each input point along `d`. */
  progress: number[];
}

type Cubic = [Point, Point, Point, Point];

const round = (n: number) => Math.round(n * 10) / 10;

function legs(points: readonly Point[], tension = 0.5): Cubic[] {
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

function cubicLength([a, b, c, d]: Cubic, samples = 48): number {
  let len = 0;
  let prev = a;
  for (let s = 1; s <= samples; s++) {
    const t = s / samples;
    const mt = 1 - t;
    const p = {
      x: mt * mt * mt * a.x + 3 * mt * mt * t * b.x + 3 * mt * t * t * c.x + t * t * t * d.x,
      y: mt * mt * mt * a.y + 3 * mt * mt * t * b.y + 3 * mt * t * t * c.y + t * t * t * d.y,
    };
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return len;
}

export function buildRoute(points: readonly Point[]): Route {
  if (points.length === 0) return { d: '', progress: [] };
  if (points.length === 1) return { d: `M${points[0]!.x} ${points[0]!.y}`, progress: [0] };
  const segs = legs(points);
  const lengths = segs.map((s) => cubicLength(s));
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
    segs.map(([, b, c, e]) => `C${round(b.x)} ${round(b.y)} ${round(c.x)} ${round(c.y)} ${round(e.x)} ${round(e.y)}`).join('');
  return { d, progress };
}

/** Index of the last stop whose progress has been reached (-1 before the first). */
export function activeIndexFor(progress: number, stopProgress: readonly number[]): number {
  let idx = -1;
  for (let i = 0; i < stopProgress.length; i++) {
    if (progress + 1e-4 >= stopProgress[i]!) idx = i;
  }
  return idx;
}
