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
