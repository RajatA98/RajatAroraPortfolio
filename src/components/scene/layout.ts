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
