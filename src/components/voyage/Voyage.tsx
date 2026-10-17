import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useGSAP } from '@gsap/react';
import type { Stop } from '@/data/stops';
import { shipSizes, shipSprite, type ShipSize } from '@/data/ship-size';
import { activeIndexFor, buildRoute, pointAt, shipHeading, type Point } from './route';
import './voyage.css';

// The Voyage island (Build-Phase 5). It WRAPS the Phase 4 markup, it does not
// own it: VoyageTimeline.astro renders the still chart and the ordered list of
// stops and passes them in as the `chart` and `list` slots. Astro keeps that
// HTML static (React never reconciles inside a slot), so the semantic nodes
// are never replaced; the animation only sets attributes and inline styles on
// them and reverts both when it unmounts.
//
// Two modes, decided by CSS and one matchMedia condition (MOTION_QUERY):
//  - Base: the chart above the list, exactly as Phase 4 drew them. Mobile,
//    reduced motion, scripting off, or paused. Complete on its own.
//  - Motion (desktop, motion allowed, toggle on): a CSS-sticky stage inside a
//    CSS-reserved 500vh section. The list becomes a side panel; the chart fills
//    the stage; a ship sails the route as you scroll (ScrollTrigger scrub),
//    dwelling at each port, banking with the slope and turning to face its
//    heading; later stops' details are revealed as the ship arrives; the hull
//    swaps size at the two milestones; two planes drift for depth.
//
// The island hydrates with client:media on MOTION_QUERY, so a phone or a
// reduced-motion visitor never downloads React or GSAP. GSAP and ScrollTrigger
// are dynamic imports that run only when the animation is about to build.
//
// Layout contract (see voyage.css): the section height is reserved in CSS, the
// pin is `position: sticky`, and everything that moves uses transform/opacity.
// Mounting changes no box, so it produces zero layout shift.
//
// Test hook: `window.__voyage = { active, progress, triggers, mounted }` is
// exposed in dev builds and when the URL carries `?voyage=debug`.

export const MOTION_QUERY = '(min-width: 1024px) and (prefers-reduced-motion: no-preference)';

/** Share of each leg's scroll spent docked at the port before sailing on. */
const DWELL = 0.22;
/** Maximum bank in degrees as the ship follows a slope. */
const MAX_BANK = 14;
const SHIP_W = 80;
const SHIP_H = 40;
/** ViewBox the chart uses when the SVG does not say (VoyageTimeline draws 1000 x 600). */
const VIEWBOX = { w: 1000, h: 600 };

type GsapCore = typeof import('gsap').gsap;
type ScrollTriggerStatic = typeof import('gsap/ScrollTrigger').ScrollTrigger;

interface VoyageHook {
  readonly active: number;
  readonly progress: number;
  readonly triggers: number;
  readonly mounted: boolean;
}

declare global {
  interface Window {
    __voyage?: VoyageHook;
  }
}

export interface VoyageProps {
  stops: readonly Stop[];
  /** Slot: the still chart (svg[data-voyage-chart]) from VoyageTimeline.astro. */
  chart?: ReactNode;
  /** Slot: the ordered list (ol[data-voyage-list]) from VoyageTimeline.astro. */
  list?: ReactNode;
}

let modules: Promise<[GsapCore, ScrollTriggerStatic]> | null = null;
function loadGsap() {
  modules ??= Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(([g, st]) => {
    const gsap = (g.gsap ?? g.default) as GsapCore;
    gsap.registerPlugin(st.ScrollTrigger);
    st.ScrollTrigger.config({ ignoreMobileResize: true });
    return [gsap, st.ScrollTrigger];
  });
  return modules;
}

export default function Voyage({ stops, chart, list }: VoyageProps) {
  const root = useRef<HTMLDivElement>(null);
  const section = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const visual = useRef<HTMLDivElement>(null);
  const texture = useRef<HTMLDivElement>(null);
  const waves = useRef<HTMLDivElement>(null);
  const ship = useRef<HTMLDivElement>(null);
  const hull = useRef<HTMLDivElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const counter = useRef<HTMLParagraphElement>(null);

  const [hydrated, setHydrated] = useState(false);
  const [canAnimate, setCanAnimate] = useState(false);
  const [motionEnabled, setMotionEnabled] = useState(true);

  // Live state read by the test hook and the link handler; mutated without re-rendering React.
  const live = useRef({
    active: -1,
    progress: 0,
    mounted: false,
    st: null as ScrollTriggerStatic | null,
    trigger: null as { start: number; end: number } | null,
  });

  // The animation needs every stop charted and at least one leg to sail.
  const charted = stops.length >= 2 && stops.every((s) => s.map !== null);
  const geometry = useMemo(() => {
    if (!charted) return null;
    const points = stops.map((s) => s.map as Point);
    const route = buildRoute(points);
    return {
      route,
      /** Arc-length position of each stop along the drawn route. */
      arc: stops.map((s, i) => s.pathProgress ?? route.progress[i] ?? 0),
      /** Scroll share of each stop: every leg gets the same scroll distance. */
      times: stops.map((_, i) => i / (stops.length - 1)),
    };
  }, [stops, charted]);

  // Pausing collapses the reserved section and playing re-expands it, which
  // would otherwise leave the visitor somewhere else on the page. Bring the
  // voyage back into view on every toggle (never on the first render).
  const toggled = useRef(false);
  useLayoutEffect(() => {
    if (!toggled.current) {
      toggled.current = true;
      return;
    }
    root.current?.scrollIntoView({ block: 'start' });
  }, [motionEnabled]);

  // Hydration flag + the single media condition, tracked live.
  useEffect(() => {
    setHydrated(true);
    const mq = window.matchMedia(MOTION_QUERY);
    const sync = () => setCanAnimate(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  // Test hook (see header comment).
  useEffect(() => {
    const debug = import.meta.env.DEV || new URLSearchParams(window.location.search).get('voyage') === 'debug';
    if (!debug) return;
    const l = live.current;
    window.__voyage = {
      get active() {
        return l.active;
      },
      get progress() {
        return l.progress;
      },
      get triggers() {
        return l.st ? l.st.getAll().length : 0;
      },
      get mounted() {
        return l.mounted;
      },
    };
    return () => {
      delete window.__voyage;
    };
  }, []);

  // Sprites are preloaded by the island itself, only when it will animate.
  // (The sprite <img>s are loading="lazy" and display:none outside motion
  // mode, so they never load on a phone or under reduced motion.)
  useEffect(() => {
    if (!canAnimate || !charted) return;
    for (const size of shipSizes) {
      const img = new Image();
      img.src = shipSprite[size];
    }
  }, [canAnimate, charted]);

  useGSAP(
    () => {
      if (!geometry || !motionEnabled || !canAnimate) return;
      let cancelled = false;
      let revertMM: (() => void) | null = null;

      void loadGsap().then(([gsap, ScrollTrigger]) => {
        if (cancelled) return;
        const rootEl = root.current;
        const sec = section.current;
        const stageEl = stage.current;
        const visualEl = visual.current;
        const shipEl = ship.current;
        const hullEl = hull.current;
        const logEl = log.current;
        if (!rootEl || !sec || !stageEl || !visualEl || !shipEl || !hullEl || !logEl) return;
        const svg = rootEl.querySelector<SVGSVGElement>('svg[data-voyage-chart]');
        const ol = rootEl.querySelector<HTMLOListElement>('ol[data-voyage-list]');
        const items = Array.from(rootEl.querySelectorAll<HTMLLIElement>('ol[data-voyage-list] > li[data-stop-id]'));
        // The Phase 4 markup is the contract; if it is not there, do nothing rather than guess.
        if (!svg || !ol || items.length !== stops.length) return;

        const l = live.current;
        l.st = ScrollTrigger;
        const mm = gsap.matchMedia();
        revertMM = () => mm.revert();

        mm.add(MOTION_QUERY, (context) => {
          const { route, arc, times } = geometry;
          const sprites = Array.from(hullEl.querySelectorAll<HTMLImageElement>('img[data-ship-sprite]'));
          const spriteOf = (size: ShipSize) => sprites.filter((s) => s.dataset.shipSprite === size);
          const counterEl = counter.current;

          // --- Geometry: viewBox units -> pixels inside the visual layer, measured on refresh only.
          const vb = svg.viewBox.baseVal;
          const vw = vb && vb.width > 0 ? vb.width : VIEWBOX.w;
          const vh = vb && vb.height > 0 ? vb.height : VIEWBOX.h;
          let geo = { scale: 1, ox: 0, oy: 0 };
          let logMetrics = { tops: [] as number[], heights: [] as number[], view: 0, total: 0 };
          const measure = () => {
            const v = visualEl.getBoundingClientRect();
            const s = svg.getBoundingClientRect();
            const scale = Math.min(s.width / vw, s.height / vh) || 1;
            geo = {
              scale,
              ox: s.left - v.left + (s.width - vw * scale) / 2,
              oy: s.top - v.top + (s.height - vh * scale) / 2,
            };
            logMetrics = {
              tops: items.map((li) => li.offsetTop),
              heights: items.map((li) => li.offsetHeight),
              view: logEl.clientHeight,
              total: ol.scrollHeight,
            };
          };
          const stickyTop = () => parseFloat(getComputedStyle(stageEl).top) || 0;

          // --- The ship: position + bank on the outer element, facing on the hull.
          const setShip = gsap.quickSetter(shipEl, 'css') as (vars: Record<string, number>) => void;
          const proxy = { p: arc[0] ?? 0 };
          let facing = 0;
          const place = () => {
            const pt = pointAt(route, proxy.p);
            const h = shipHeading(pt.angle, MAX_BANK);
            setShip({
              x: geo.ox + pt.x * geo.scale - SHIP_W / 2,
              y: geo.oy + pt.y * geo.scale - SHIP_H / 2,
              rotation: h.rotation,
            });
            if (h.facing !== facing) {
              const first = facing === 0;
              facing = h.facing;
              context.add(() => {
                if (first) gsap.set(hullEl, { scaleX: h.facing });
                else gsap.to(hullEl, { scaleX: h.facing, duration: 0.25, ease: 'power2.inOut', overwrite: 'auto' });
              });
            }
          };

          // --- The log panel follows the active stop (transform only).
          const follow = (i: number) => {
            const { tops, heights, view, total } = logMetrics;
            if (total <= view || tops[i] === undefined) return;
            const target = tops[i]! + (heights[i] ?? 0) / 2 - view / 2;
            const y = -Math.max(0, Math.min(total - view, target));
            context.add(() => {
              gsap.to(ol, { y, duration: 0.5, ease: 'power2.out', overwrite: 'auto' });
            });
          };

          const setActive = (idx: number) => {
            const i = Math.max(0, Math.min(stops.length - 1, idx));
            if (i === l.active) return;
            l.active = i;
            items.forEach((li, k) => (k === i ? li.setAttribute('aria-current', 'step') : li.removeAttribute('aria-current')));
            if (counterEl) counterEl.textContent = `Stop ${i + 1} of ${stops.length}`;
            follow(i);
          };

          // Initial sprite: the first stop's size; the others wait for their milestone.
          gsap.set(sprites, { opacity: (_i: number, el: HTMLImageElement) => (el.dataset.shipSprite === stops[0]!.shipSize ? 1 : 0) });

          // --- The scrubbed timeline. One unit of time per leg; the section's
          // scroll is divided evenly between legs. The pin itself is CSS sticky
          // in the CSS-reserved section (a ScrollTrigger `pin` measured real
          // layout shift in the Phase 1 spike); ScrollTrigger only drives the scrub.
          const legs = stops.length - 1;
          const tl = gsap.timeline({
            defaults: { ease: 'none' },
            onUpdate: place,
            scrollTrigger: {
              trigger: sec,
              start: () => `top ${stickyTop()}px`,
              end: 'bottom bottom',
              scrub: 0.6,
              invalidateOnRefresh: true,
              onRefresh: (self) => {
                measure();
                l.trigger = { start: self.start, end: self.end };
                place();
              },
              onUpdate: (self) => {
                l.progress = self.progress;
                setActive(activeIndexFor(self.progress, times));
              },
            },
          });

          for (let i = 0; i < legs; i++) {
            // Dwell at the port, then sail with per-leg easing: slow out of port, slow into the next.
            tl.to(proxy, { p: arc[i + 1]!, duration: 1 - DWELL, ease: 'power1.inOut' }, i + DWELL);
          }

          items.forEach((li, i) => {
            if (i === 0) return;
            const stop = stops[i]!;
            const prev = stops[i - 1]!;
            // Staged reveal on arrival: chapter, then role, then dates. The
            // hidden state is set up front (a staggered fromTo only pre-renders
            // its first target) and reverted with the context on pause.
            const details = li.querySelectorAll<HTMLElement>('[data-stop-detail]');
            if (details.length) {
              gsap.set(details, { opacity: 0, y: 6 });
              tl.to(details, { opacity: 1, y: 0, duration: 0.14, stagger: 0.04, ease: 'power2.out' }, i - 0.05);
            }
            // Size swap at a milestone: cross-fade the sprites and let the hull pop once.
            if (stop.sizeSwap && stop.shipSize !== prev.shipSize) {
              tl.to(spriteOf(prev.shipSize), { opacity: 0, duration: 0.1 }, i - 0.05);
              tl.to(spriteOf(stop.shipSize), { opacity: 1, duration: 0.1 }, i - 0.05);
              tl.fromTo(sprites, { scale: 1 }, { scale: 1.16, duration: 0.08, yoyo: true, repeat: 1, ease: 'power2.inOut' }, i - 0.1);
            }
          });

          // Two planes of depth, the whole way (ease none: tied to scroll, not time).
          if (texture.current) tl.fromTo(texture.current, { yPercent: 0 }, { yPercent: -4, duration: legs }, 0);
          if (waves.current) tl.fromTo(waves.current, { yPercent: 0, xPercent: 0 }, { yPercent: -10, xPercent: -3, duration: legs }, 0);

          // Stop links: in motion mode they sail the voyage to that stop instead of jumping.
          const onLink = (e: Event) => {
            const a = (e.target as Element | null)?.closest?.('a[data-stop-place]');
            const li = a?.closest('li[data-stop-id]');
            const i = li ? items.indexOf(li as HTMLLIElement) : -1;
            const t = l.trigger;
            if (i < 0 || !t || !l.mounted) return;
            if (e.type === 'click') e.preventDefault();
            const y = t.start + (t.end - t.start) * (times[i] ?? 0);
            if (Math.abs(window.scrollY - y) > 2) window.scrollTo(0, Math.ceil(y));
          };
          rootEl.addEventListener('click', onLink);
          rootEl.addEventListener('focusin', onLink);

          const st = tl.scrollTrigger!;
          measure();
          l.trigger = { start: st.start, end: st.end };
          l.progress = st.progress;
          place();
          setActive(activeIndexFor(st.progress, times));
          l.mounted = true;
          rootEl.setAttribute('data-mounted', '');

          return () => {
            rootEl.removeEventListener('click', onLink);
            rootEl.removeEventListener('focusin', onLink);
            rootEl.removeAttribute('data-mounted');
            l.mounted = false;
            l.active = -1;
            l.progress = 0;
            l.trigger = null;
            items.forEach((li) => li.removeAttribute('aria-current'));
            if (counterEl) counterEl.textContent = `Stop 1 of ${stops.length}`;
            // quickSetter writes are not tweens, so the context cannot revert them.
            shipEl.style.transform = '';
          };
        });
      });

      return () => {
        cancelled = true;
        revertMM?.();
        revertMM = null;
      };
    },
    { dependencies: [motionEnabled, canAnimate], scope: root, revertOnUpdate: true },
  );

  // No geometry to sail: stay in base mode for good (CSS keys off data-motion).
  const motion = geometry ? (motionEnabled ? 'on' : 'off') : 'off';

  return (
    <div
      ref={root}
      className="voyage"
      data-voyage-root=""
      data-motion={motion}
      data-hydrated={hydrated ? '' : undefined}
    >
      <div className="voyage__section" data-voyage-section="" ref={section}>
        <div className="voyage__stage" ref={stage}>
          <div className="voyage__visual" ref={visual}>
            <div className="voyage__plane voyage__plane--texture" ref={texture} aria-hidden="true" />
            <div className="voyage__plane voyage__plane--waves" ref={waves} aria-hidden="true" />
            {chart}
            <div className="voyage__ship" ref={ship} aria-hidden="true">
              <div className="voyage__hull" ref={hull}>
                {shipSizes.map((size) => (
                  <img
                    key={size}
                    src={shipSprite[size]}
                    alt=""
                    width={SHIP_W}
                    height={SHIP_H}
                    loading="lazy"
                    decoding="async"
                    data-ship-sprite={size}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="voyage__panel">
            {geometry && (
              <div className="voyage__controls">
                <button
                  type="button"
                  className="voyage__toggle"
                  data-voyage-toggle=""
                  aria-pressed={!motionEnabled}
                  onClick={() => setMotionEnabled((v) => !v)}
                >
                  {motionEnabled ? 'Pause the voyage' : 'Play the voyage'}
                </button>
                <p className="voyage__counter" ref={counter} data-voyage-counter="" aria-hidden="true">
                  Stop 1 of {stops.length}
                </p>
              </div>
            )}
            <div className="voyage__log" ref={log}>
              {list}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
