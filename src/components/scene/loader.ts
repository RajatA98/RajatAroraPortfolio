// Loads Three.js and GSAP once, after the page is idle. A failed load is
// remembered for the session so the island never retries or loops.
export type LoadDecision = 'load' | 'reuse' | 'static';
export function decideLoad(s: { attempted: boolean; failed: boolean }): LoadDecision {
  if (!s.attempted) return 'load';
  return s.failed ? 'static' : 'reuse';
}

type GsapCore = typeof import('gsap').gsap;
type ScrollTriggerStatic = typeof import('gsap/ScrollTrigger').ScrollTrigger;
export interface SceneLibs { runtime: typeof import('./runtime'); gsap: GsapCore; ScrollTrigger: ScrollTriggerStatic }

let attempted = false;
let failed = false;
let libs: Promise<SceneLibs> | null = null;

export function loadScene(): Promise<SceneLibs> | null {
  const d = decideLoad({ attempted, failed });
  if (d === 'static') return null;
  if (d === 'reuse') return libs;
  attempted = true;
  libs = Promise.all([import('./runtime'), import('gsap'), import('gsap/ScrollTrigger')])
    .then(([runtime, g, st]) => {
      const gsap = (g.gsap ?? g.default) as GsapCore;
      gsap.registerPlugin(st.ScrollTrigger);
      st.ScrollTrigger.config({ ignoreMobileResize: true });
      return { runtime, gsap, ScrollTrigger: st.ScrollTrigger };
    })
    .catch((err: unknown) => { failed = true; throw err; });
  return libs;
}

/** Resolves when the browser is idle, or after `ms`, whichever is first. */
export function whenIdle(ms = 1500): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };
    if ('requestIdleCallback' in window) (window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(finish);
    setTimeout(finish, ms);
  });
}
