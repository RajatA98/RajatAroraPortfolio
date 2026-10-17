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
