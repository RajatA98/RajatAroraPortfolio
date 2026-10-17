import { describe, expect, it } from 'vitest';
import { canMount, medianFps, probe, probeFailedBefore, probeOverride, rememberProbeFail, SCENE_QUERY } from '../../src/components/scene/mount';

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

describe('probe limits and memory [unit]', () => {
  it('gives up after maxMs on a slow machine, well before 60 frames', async () => {
    let now = 0;
    let renders = 0;
    const tick = (cb: (now: number) => void) => { now += 100; setTimeout(() => cb(now), 0); };
    const r = await probe({ frames: 60, minFps: 50, maxMs: 1000, tick, render: () => renders++ });
    expect(r.pass).toBe(false);
    expect(renders).toBeLessThanOrEqual(11);
  });

  it('stops rendering once aborted and reports a failure', async () => {
    let now = 0;
    let renders = 0;
    const tick = (cb: (now: number) => void) => { now += 16.7; setTimeout(() => cb(now), 0); };
    const r = await probe({ frames: 60, tick, render: () => renders++, aborted: () => renders >= 5 });
    expect(r.pass).toBe(false);
    expect(renders).toBe(5);
  });

  it('remembers a failed probe for the session and survives a storage that throws', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(probeFailedBefore(storage)).toBe(false);
    rememberProbeFail(storage);
    expect(probeFailedBefore(storage)).toBe(true);
    const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(probeFailedBefore(broken)).toBe(false);
    expect(() => rememberProbeFail(broken)).not.toThrow();
  });

  it('honours a forced probe result only behind the debug query', () => {
    expect(probeOverride('?voyage=debug&probe=fail')).toBe('fail');
    expect(probeOverride('?voyage=debug&probe=pass')).toBe('pass');
    expect(probeOverride('?probe=fail')).toBeNull();
    expect(probeOverride('?voyage=debug')).toBeNull();
  });
});
