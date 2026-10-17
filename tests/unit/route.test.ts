import { describe, expect, it } from 'vitest';
import { activeIndexFor, buildRoute, pointAt, shipHeading, type Point } from '../../src/components/voyage/route';
import { stops } from '../../src/data/stops';

// Build-Phase 5: the ship's position and pose along the route are pure math,
// shared by the server render and the client animation. These tests pin the
// geometry so the animation never has to measure the SVG per frame.

const deg = (rad: number) => (rad * 180) / Math.PI;

describe('pointAt [unit]', () => {
  it('lands on every stop at that stop’s arc-length progress', () => {
    const points = stops.map((s) => s.map!) as Point[];
    const route = buildRoute(points);
    route.progress.forEach((p, i) => {
      const pt = pointAt(route, p);
      expect(Math.hypot(pt.x - points[i]!.x, pt.y - points[i]!.y), `stop ${i}`).toBeLessThan(0.5);
    });
  });

  it('walks a straight line at constant speed and reports its heading', () => {
    const route = buildRoute([
      { x: 0, y: 100 },
      { x: 500, y: 100 },
      { x: 1000, y: 100 },
    ]);
    const mid = pointAt(route, 0.5);
    expect(mid.x).toBeCloseTo(500, 0);
    expect(mid.y).toBeCloseTo(100, 0);
    expect(Math.abs(deg(mid.angle))).toBeLessThan(0.5);
    const quarter = pointAt(route, 0.25);
    expect(quarter.x).toBeCloseTo(250, 0);
  });

  it('heads left (angle near 180 degrees) on a right-to-left line', () => {
    const route = buildRoute([
      { x: 900, y: 300 },
      { x: 100, y: 300 },
    ]);
    const pt = pointAt(route, 0.5);
    expect(Math.abs(Math.abs(deg(pt.angle)) - 180)).toBeLessThan(0.5);
  });

  it('clamps progress to the route ends', () => {
    const route = buildRoute([
      { x: 10, y: 20 },
      { x: 110, y: 220 },
    ]);
    const a = pointAt(route, -1);
    const b = pointAt(route, 2);
    expect([a.x, a.y]).toEqual([10, 20]);
    expect(b.x).toBeCloseTo(110, 5);
    expect(b.y).toBeCloseTo(220, 5);
  });

  it('is monotonic along the real route', () => {
    const route = buildRoute(stops.map((s) => s.map!) as Point[]);
    let prev = pointAt(route, 0);
    let travelled = 0;
    for (let i = 1; i <= 200; i++) {
      const pt = pointAt(route, i / 200);
      travelled += Math.hypot(pt.x - prev.x, pt.y - prev.y);
      prev = pt;
    }
    // The sampled path length matches the route's own measurement closely.
    expect(travelled).toBeGreaterThan(route.total * 0.99);
    expect(travelled).toBeLessThan(route.total * 1.01);
  });
});

describe('shipHeading [unit]', () => {
  it('faces right with no bank when sailing due east', () => {
    expect(shipHeading(0, 14)).toEqual({ facing: 1, rotation: 0 });
  });

  it('faces left with no bank when sailing due west', () => {
    expect(shipHeading(Math.PI, 14)).toEqual({ facing: -1, rotation: 0 });
  });

  it('banks with the slope, clamped to the maximum', () => {
    expect(shipHeading((5 * Math.PI) / 180, 14).rotation).toBeCloseTo(5, 5);
    expect(shipHeading((-5 * Math.PI) / 180, 14).rotation).toBeCloseTo(-5, 5);
    expect(shipHeading((40 * Math.PI) / 180, 14).rotation).toBe(14);
    expect(shipHeading((-40 * Math.PI) / 180, 14).rotation).toBe(-14);
  });

  it('mirrors the bank when the hull is flipped to face left', () => {
    // Heading 170 degrees: moving left and slightly down the chart (y grows downward).
    const h = shipHeading((170 * Math.PI) / 180, 14);
    expect(h.facing).toBe(-1);
    expect(h.rotation).toBeCloseTo(-10, 5);
    // Heading 100 degrees: nearly straight down, still facing left, bank clamped.
    expect(shipHeading((100 * Math.PI) / 180, 14)).toEqual({ facing: -1, rotation: -14 });
  });
});

describe('activeIndexFor [unit]', () => {
  it('splits the scroll evenly between stops', () => {
    const times = [0, 0.25, 0.5, 0.75, 1];
    expect(activeIndexFor(0, times)).toBe(0);
    expect(activeIndexFor(0.24, times)).toBe(0);
    expect(activeIndexFor(0.25, times)).toBe(1);
    expect(activeIndexFor(0.99, times)).toBe(3);
    expect(activeIndexFor(1, times)).toBe(4);
  });
});
