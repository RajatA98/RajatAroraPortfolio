import { describe, expect, it } from 'vitest';
import { stops, StopSchema, StopsSchema, type Stop } from '@/data/stops';
import { shipSizeFor, shipSizes } from '@/data/ship-size';

const base: Stop = {
  id: 'test-stop',
  place: 'Somewhere, TX',
  chapter: 'A chapter',
  role: 'A role',
  dates: { start: null, end: null },
  shipSize: 'small',
  milestone: null,
  map: null,
  pathProgress: null,
  sizeSwap: false,
};

describe('stop schema', () => {
  it('validates every real stop', () => {
    for (const stop of stops) {
      const result = StopSchema.safeParse(stop);
      expect(result.success, `${stop.id}: ${JSON.stringify(result.error?.issues)}`).toBe(true);
    }
    expect(StopsSchema.safeParse(stops).success).toBe(true);
  });

  it('accepts a minimal stop with all Phase 5 fields null', () => {
    expect(StopSchema.safeParse(base).success).toBe(true);
  });

  it('accepts real dates and "present"', () => {
    expect(StopSchema.safeParse({ ...base, dates: { start: '2016-08', end: '2020-05' } }).success).toBe(true);
    expect(StopSchema.safeParse({ ...base, dates: { start: '2024-01', end: 'present' } }).success).toBe(true);
  });

  it('rejects bad stops', () => {
    const bad: unknown[] = [
      { ...base, id: 'Not A Slug' },
      { ...base, place: '' },
      { ...base, shipSize: 'huge' },
      { ...base, milestone: 'storm' },
      { ...base, dates: { start: '2016', end: null } },
      { ...base, dates: { start: null, end: '2020-13' } },
      { ...base, map: { x: 1200, y: 10 } },
      { ...base, map: { x: 10 } },
      { ...base, pathProgress: 1.5 },
      { ...base, sizeSwap: 'yes' },
      (() => {
        const { sizeSwap: _drop, ...rest } = base;
        return rest;
      })(),
    ];
    for (const stop of bad) {
      expect(StopSchema.safeParse(stop).success, JSON.stringify(stop)).toBe(false);
    }
  });
});

describe('real stop list', () => {
  it('has 9 stops in the voyage order, ending at the next island', () => {
    expect(stops).toHaveLength(9);
    expect(stops.map((s) => s.place)).toEqual([
      'Edison, NJ',
      'Metuchen, NJ',
      'West Lafayette, IN',
      'Edison, NJ',
      'Dallas, TX',
      'Austin, TX',
      'Austin, TX',
      'Austin, TX',
      'The next island',
    ]);
    expect(stops[2]?.role).toMatch(/Purdue/);
    expect(stops[3]?.role).toMatch(/Infosys/);
    expect(stops[4]?.role).toMatch(/L&T/);
    expect(stops[5]?.role).toMatch(/BAE/);
    expect(stops[6]?.role).toMatch(/Gauntlet/);
  });

  it('has unique slug ids', () => {
    const ids = stops.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('marks exactly one graduation and one turning point, graduation first', () => {
    const grad = stops.findIndex((s) => s.milestone === 'graduation');
    const turn = stops.findIndex((s) => s.milestone === 'turning-point');
    expect(stops.filter((s) => s.milestone === 'graduation')).toHaveLength(1);
    expect(stops.filter((s) => s.milestone === 'turning-point')).toHaveLength(1);
    expect(grad).toBeGreaterThan(0);
    expect(turn).toBeGreaterThan(grad);
  });

  it('keeps map coordinates inside the 0-1000 viewBox when present', () => {
    for (const s of stops) {
      if (!s.map) continue;
      expect(s.map.x).toBeGreaterThanOrEqual(0);
      expect(s.map.x).toBeLessThanOrEqual(1000);
      expect(s.map.y).toBeGreaterThanOrEqual(0);
      expect(s.map.y).toBeLessThanOrEqual(1000);
    }
  });
});

describe('ship size logic', () => {
  const grad = stops.findIndex((s) => s.milestone === 'graduation');
  const turn = stops.findIndex((s) => s.milestone === 'turning-point');

  it('only uses the three neutral size names', () => {
    expect(shipSizes).toEqual(['small', 'medium', 'large']);
  });

  it('is small before graduation', () => {
    for (let i = 0; i < grad; i++) expect(shipSizeFor(i, stops)).toBe('small');
  });

  it('becomes medium at the first post-graduation stop', () => {
    expect(shipSizeFor(grad, stops)).toBe('medium');
    for (let i = grad; i < turn; i++) expect(shipSizeFor(i, stops)).toBe('medium');
  });

  it('becomes large at the turning point and stays large after', () => {
    for (let i = turn; i < stops.length; i++) expect(shipSizeFor(i, stops)).toBe('large');
  });

  it('agrees with every stop\'s declared shipSize', () => {
    stops.forEach((s, i) => expect(s.shipSize, s.id).toBe(shipSizeFor(i, stops)));
  });

  it('flags a size swap exactly where the size changes', () => {
    stops.forEach((s, i) => {
      const changed = i > 0 && shipSizeFor(i, stops) !== shipSizeFor(i - 1, stops);
      expect(s.sizeSwap, s.id).toBe(changed);
    });
  });

  it('works on synthetic lists and rejects out-of-range indexes', () => {
    const list: Stop[] = [
      { ...base, id: 'a' },
      { ...base, id: 'b', milestone: 'turning-point' },
    ];
    expect(shipSizeFor(0, list)).toBe('small');
    expect(shipSizeFor(1, list)).toBe('large');
    expect(() => shipSizeFor(2, list)).toThrow();
    expect(() => shipSizeFor(-1, list)).toThrow();
  });
});
