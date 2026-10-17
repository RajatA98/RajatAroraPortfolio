// The gate the island must pass before the canvas is shown, and the probe that
// measures whether this machine can hold the frame bar. Pure: the island
// supplies the environment and the frame ticker.

export const SCENE_QUERY = '(min-width: 1024px) and (prefers-reduced-motion: no-preference)';

/** The id of the one ScrollTrigger the scene timeline creates. */
export const SCENE_TRIGGER_ID = 'scene-voyage';

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
  /** Wall-clock cap from the first frame: a weak machine is judged on what it drew by then. */
  maxMs?: number;
  /** Schedules `cb` for the next frame with a timestamp in ms (requestAnimationFrame in the browser). */
  tick: (cb: (now: number) => void) => void;
  /** Renders one frame of the scene at its idle state. */
  render: () => void;
  /** Checked before every frame; true stops the probe at once and reports a failure. */
  aborted?: () => boolean;
}

/**
 * Renders up to `frames` frames, or for `maxMs`, and reports the median fps
 * between frames (the gap before the first frame, which includes shader
 * compile time, is never measured).
 */
export function probe({ frames = 60, minFps = 50, maxMs = 1500, tick, render, aborted }: ProbeOptions): Promise<{ medianFps: number; pass: boolean }> {
  return new Promise((resolve) => {
    const times: number[] = [];
    let first: number | null = null;
    let last: number | null = null;
    let count = 0;
    const step = (now: number) => {
      if (aborted?.()) {
        resolve({ medianFps: medianFps(times), pass: false });
        return;
      }
      render();
      count++;
      if (last !== null) times.push(now - last);
      last = now;
      first ??= now;
      if (count >= frames || now - first >= maxMs) {
        const fps = medianFps(times);
        resolve({ medianFps: fps, pass: fps >= minFps });
        return;
      }
      tick(step);
    };
    tick(step);
  });
}

type SessionStore = { getItem(key: string): string | null; setItem(key: string, value: string): void };
const PROBE_KEY = 'scene-probe';

/** True when this tab already failed the probe; storage that throws counts as "no". */
export function probeFailedBefore(storage: SessionStore): boolean {
  try { return storage.getItem(PROBE_KEY) === 'fail'; } catch { return false; }
}

export function rememberProbeFail(storage: SessionStore): void {
  try { storage.setItem(PROBE_KEY, 'fail'); } catch { /* private mode or blocked storage: the probe simply runs again next time */ }
}

/** Test switch: `?voyage=debug&probe=pass|fail` forces the probe's verdict. */
export function probeOverride(search: string): 'pass' | 'fail' | null {
  const q = new URLSearchParams(search);
  if (q.get('voyage') !== 'debug') return null;
  const v = q.get('probe');
  return v === 'pass' || v === 'fail' ? v : null;
}
