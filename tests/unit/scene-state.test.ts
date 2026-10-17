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

  it('sails from the harbour mouth through About and is moored at the last island through Contact', () => {
    expect(routeTAt(span('about').p0, w)).toBeCloseTo(w.harbour.t1, 6);
    expect(routeTAt(span('contact').p0, w)).toBe(1);
    expect(routeTAt(span('contact').p0 + 0.05, w)).toBe(1);
  });
});

describe('sceneStateAt [unit]', () => {
  it('starts with the dinghy at the origin facing the second stop, dawn sky', () => {
    const s = sceneStateAt(0, w);
    expect(s.hull).toBe(0);
    expect(s.activeChapter).toBe('hero');
    expect(s.activeStop).toBe(stops[0]!.id);
    expect(s.shipPosition.distanceTo(w.stops[0]!.position)).toBeLessThan(0.01);
    expect(s.skyMix).toBe(0);
    expect(s.sunAngle).toBe(0);
    const toNext = w.stops[1]!.position.clone().sub(w.stops[0]!.position);
    expect(Math.cos(s.shipHeading) * toNext.x + Math.sin(s.shipHeading) * toNext.z).toBeGreaterThan(0);
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
