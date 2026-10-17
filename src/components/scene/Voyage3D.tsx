import { useEffect, useRef, useState } from 'react';
import type { Stop } from '@/data/stops';
import type { WorldLayout } from './layout';
import { canMount, probe, probeFailedBefore, probeOverride, rememberProbeFail, SCENE_QUERY, SCENE_TRIGGER_ID } from './mount';
import { loadScene, whenIdle } from './loader';
import type { VoyageTimeline } from './timeline';
import type { SceneModule } from './sea';

// The 3D voyage island (ARCHITECTURE.md §2, §5). Mounted once from the home
// page with client:media on SCENE_QUERY, so phones never load it. States:
// static -> loading -> probing -> live <-> paused, and back to static on a
// narrower viewport, reduced motion, a failed load or a failed probe (which is
// remembered for the tab). Pause keeps the frozen frame (spec §3.7): it stops
// the render loop and the scroll trigger, and Play restarts both. The canvas
// is fixed, aria-hidden and pointer-events: none; the HTML page is never
// changed by this component beyond attributes on its own root.

export type SceneRunState = 'static' | 'loading' | 'probing' | 'live' | 'paused';
interface SceneHook {
  readonly state: SceneRunState; readonly progress: number; readonly triggers: number; readonly mounted: boolean;
  /** Frames drawn so far, and probes run: test-only counters. */
  readonly frames: number; readonly probes: number;
}
declare global { interface Window { __scene?: SceneHook } }

export interface Voyage3DProps { stops: readonly Stop[]; berths: readonly { id: string; classified: boolean }[] }

/** WebGL2 support, checked once per page with a context that is released straight away. */
let webgl2Support: boolean | null = null;
function hasWebgl2(): boolean {
  if (webgl2Support === null) {
    const gl = document.createElement('canvas').getContext('webgl2');
    webgl2Support = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }
  return webgl2Support;
}

interface Controls { pause(): void; resume(): void }

export default function Voyage3D({ stops, berths }: Voyage3DProps) {
  const root = useRef<HTMLDivElement>(null);
  const [runState, setRunState] = useState<SceneRunState>('static');
  const [paused, setPaused] = useState(false);
  const controls = useRef<Controls | null>(null);
  const live = useRef({ progress: 0, frames: 0, probes: 0, st: null as { getAll(): unknown[] } | null, state: 'static' as SceneRunState });

  // Test hook behind ?voyage=debug (or dev).
  useEffect(() => {
    const debug = import.meta.env.DEV || new URLSearchParams(window.location.search).get('voyage') === 'debug';
    if (!debug) return;
    const l = live.current;
    window.__scene = {
      get state() { return l.state; },
      get progress() { return l.progress; },
      // Only this island's trigger: the 2D voyage island has its own.
      get triggers() { return l.st ? l.st.getAll().filter((s) => (s as { vars: { id?: string } }).vars.id === SCENE_TRIGGER_ID).length : 0; },
      get mounted() { return l.state === 'live'; },
      get frames() { return l.frames; },
      get probes() { return l.probes; },
    };
    return () => { delete window.__scene; };
  }, []);

  const setState = (s: SceneRunState) => { live.current.state = s; setRunState(s); };

  useEffect(() => {
    const mq = window.matchMedia(SCENE_QUERY);
    const env = () => ({ width: window.innerWidth, reducedMotion: !mq.matches && window.matchMedia('(prefers-reduced-motion: reduce)').matches, webgl2: hasWebgl2(), paused: false });
    if (!canMount(env()) || probeFailedBefore(window.sessionStorage)) { setState('static'); return; }

    let cancelled = false;
    // Owns every resource created so far; set as soon as the first one exists,
    // so a cancel at any await releases them.
    let dispose: (() => void) | null = null;
    const stop = () => {
      cancelled = true;
      controls.current = null;
      dispose?.();
      dispose = null;
      setPaused(false);
      setState('static');
    };
    setState('loading');

    void (async () => {
      await whenIdle();
      if (cancelled) return;
      const libsP = loadScene();
      if (!libsP) { stop(); return; }
      let libs;
      try { libs = await libsP; } catch { if (!cancelled) stop(); return; }
      if (cancelled || !root.current) return;

      const { runtime, gsap, ScrollTrigger } = libs;
      const { three, worldLayout, sceneStateAt, buildTimeline, readSceneTokens, outlineMaterial, toonRamp, buildSea, buildShip, buildIslands, buildSky, buildCamera } = runtime;
      const tokens = readSceneTokens((n) => getComputedStyle(document.documentElement).getPropertyValue(n));
      const layout: WorldLayout = worldLayout(stops, berths);
      const ctx = { tokens, ramp: toonRamp(), outline: outlineMaterial(tokens.ink), layout };

      const canvas = document.createElement('canvas');
      canvas.setAttribute('data-scene-canvas', '');
      canvas.setAttribute('aria-hidden', 'true');
      canvas.className = 'scene-canvas';
      root.current.appendChild(canvas);
      const renderer = new three.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
      const modules: SceneModule[] = [];
      let raf = 0;
      let timeline: VoyageTimeline | null = null;
      const onResize = () => {
        renderer.setSize(window.innerWidth, window.innerHeight, false);
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
      };
      dispose = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', onResize);
        timeline?.kill();
        timeline = null;
        root.current?.removeAttribute('data-scene-live');
        canvas.remove();
        for (const m of modules) m.dispose();
        ctx.ramp.dispose();
        ctx.outline.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
      };

      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      window.addEventListener('resize', onResize);
      const scene = new three.Scene();
      const { camera, update: updateCamera } = buildCamera(window.innerWidth / window.innerHeight);
      modules.push(buildSky(ctx), buildSea(ctx), buildIslands(ctx), buildShip(ctx));
      for (const m of modules) scene.add(m.object);
      const sun = new three.DirectionalLight(0xffffff, 2.2);
      sun.position.set(30, 60, 40);
      scene.add(sun, new three.HemisphereLight(new three.Color(tokens.skyDay), new three.Color(tokens.seaDeep), 1.1));

      let state = sceneStateAt(0, layout);
      const clock = { t: 0, dt: 0 };
      let lastNow = performance.now();
      const frame = (now: number) => {
        clock.dt = Math.min(0.1, (now - lastNow) / 1000);
        clock.t += clock.dt;
        lastNow = now;
        for (const m of modules) m.update(state, clock);
        updateCamera(state);
        renderer.render(scene, camera);
        live.current.frames++;
      };

      setState('probing');
      live.current.probes++;
      const measured = await probe({ tick: (cb) => requestAnimationFrame(cb), render: () => frame(performance.now()), aborted: () => cancelled });
      if (cancelled) return;
      const forced = probeOverride(window.location.search);
      if (forced === 'fail' || (forced !== 'pass' && !measured.pass)) {
        rememberProbeFail(window.sessionStorage);
        stop();
        return;
      }

      live.current.st = ScrollTrigger;
      const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-scene-chapter]'));
      const start = () => {
        timeline = buildTimeline(gsap, ScrollTrigger, sections, (p) => { live.current.progress = p; state = sceneStateAt(p, layout); }, SCENE_TRIGGER_ID);
        lastNow = performance.now();
        const loop = (now: number) => { frame(now); raf = requestAnimationFrame(loop); };
        raf = requestAnimationFrame(loop);
        setState('live');
      };
      controls.current = {
        // The frame on screen stays; nothing draws and nothing follows scroll.
        pause() { cancelAnimationFrame(raf); timeline?.kill(); timeline = null; setState('paused'); },
        resume() { if (!timeline) start(); },
      };
      start();
      root.current?.setAttribute('data-scene-live', '');
    })();

    const onChange = () => { if (!canMount(env())) stop(); };
    mq.addEventListener('change', onChange);
    return () => { mq.removeEventListener('change', onChange); cancelled = true; controls.current = null; dispose?.(); dispose = null; };
  }, [stops, berths]);

  const toggle = () => {
    const c = controls.current;
    if (!c) return;
    if (paused) c.resume(); else c.pause();
    setPaused(!paused);
  };

  return (
    <div ref={root} className="scene-root" data-scene-root="" data-scene-state={runState}>
      <button type="button" className="scene-pause" data-scene-pause="" aria-pressed={paused} hidden={runState !== 'live' && runState !== 'paused'} onClick={toggle}>
        {paused ? 'Sail on' : 'Pause the sea'}
      </button>
    </div>
  );
}
