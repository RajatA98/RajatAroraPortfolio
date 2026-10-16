import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { useGSAP } from '@gsap/react';
import type { Stop } from '@/data/stops';
import { formatDates } from './format-dates';
import { shipSizes, shipSprite } from '@/data/ship-size';
import { activeIndexFor, buildRoute } from './route';
import './voyage.css';

// Voyage spike (Phase 1). Two layers:
//  1. The SEMANTIC base layer: an <ol> of every stop, server-rendered by Astro
//     from the props. It is the reduced-motion, JS-off and mobile experience
//     and is never replaced; the animation only sets attributes on it.
//  2. A desktop-only visual layer (chart texture, flat SVG route, the ship as
//     an HTML element outside the SVG), animated by GSAP. GSAP, ScrollTrigger
//     and MotionPathPlugin are imported dynamically inside useGSAP, and only
//     when MOTION_QUERY matches and the visitor has not paused the voyage.
//
// Test hook: `window.__voyage = { active, progress, triggers, mounted }` is
// exposed when the build is not production, OR when the island root carries
// `data-testhook` (the page passes the `data-testhook` prop). That lets the
// e2e suite read it from the preview build of /lab/voyage-spike while the real
// homepage, which will not set the attribute, never exposes it.
//
// Layout contract (see voyage.css): the pinned section's height is reserved
// in CSS under the same media query and the stage is pinned with CSS sticky,
// so mounting never changes the document height and causes zero layout shift.

export const MOTION_QUERY = '(min-width: 1024px) and (prefers-reduced-motion: no-preference)';

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

export interface VoyageSpikeProps {
  stops: readonly Stop[];
  'data-testhook'?: boolean | string;
}

let modules: Promise<[GsapCore, ScrollTriggerStatic]> | null = null;
function loadGsap() {
  modules ??= Promise.all([import('gsap'), import('gsap/ScrollTrigger'), import('gsap/MotionPathPlugin')]).then(
    ([g, st, mp]) => {
      const gsap = (g.gsap ?? g.default) as GsapCore;
      gsap.registerPlugin(st.ScrollTrigger, mp.MotionPathPlugin);
      st.ScrollTrigger.config({ ignoreMobileResize: true });
      return [gsap, st.ScrollTrigger];
    },
  );
  return modules;
}

export default function VoyageSpike({ stops, 'data-testhook': testhook }: VoyageSpikeProps) {
  const root = useRef<HTMLElement>(null);
  const section = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const texture = useRef<HTMLDivElement>(null);
  const waves = useRef<HTMLDivElement>(null);
  const path = useRef<SVGPathElement>(null);
  const ship = useRef<HTMLDivElement>(null);

  const [hydrated, setHydrated] = useState(false);
  const [canAnimate, setCanAnimate] = useState(false);
  const [motionEnabled, setMotionEnabled] = useState(true);

  // Live state read by the test hook; mutated without re-rendering React.
  const live = useRef({ active: -1, progress: 0, mounted: false, st: null as ScrollTriggerStatic | null, trigger: null as { start: number; end: number } | null });

  const route = useMemo(() => {
    const pts = stops.map((s, i) => s.map ?? { x: 100 + (800 * i) / Math.max(1, stops.length - 1), y: 300 });
    const r = buildRoute(pts);
    return { d: r.d, points: pts, progress: stops.map((s, i) => s.pathProgress ?? r.progress[i] ?? 0) };
  }, [stops]);

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
    if (import.meta.env.PROD && !root.current?.hasAttribute('data-testhook')) return;
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
  // (The stacked sprite <img>s are loading="lazy", so they never load while
  // the visual layer is display:none on mobile or under reduced motion.)
  useEffect(() => {
    if (!canAnimate) return;
    for (const size of shipSizes) {
      const img = new Image();
      img.src = shipSprite[size];
    }
  }, [canAnimate]);

  useGSAP(
    () => {
      if (!motionEnabled || !canAnimate) return;
      let cancelled = false;
      let revertMM: (() => void) | null = null;

      void loadGsap().then(([gsap, ScrollTrigger]) => {
        if (cancelled || !section.current || !stage.current || !path.current || !ship.current) return;
        const l = live.current;
        l.st = ScrollTrigger;
        const mm = gsap.matchMedia();
        revertMM = () => mm.revert();

        mm.add(MOTION_QUERY, () => {
          const sec = section.current!;
          const items = Array.from(root.current!.querySelectorAll<HTMLLIElement>('li[data-stop-id]'));
          const sprites = Array.from(ship.current!.querySelectorAll<HTMLElement>('[data-ship-sprite]'));
          let shownSize = '';

          const showSize = (size: string, instant = false) => {
            if (size === shownSize) return;
            shownSize = size;
            gsap.to(sprites, {
              opacity: (_i: number, el: HTMLElement) => (el.dataset.shipSprite === size ? 1 : 0),
              duration: instant ? 0 : 0.35,
              ease: 'power2.out',
              overwrite: true,
            });
          };

          const setActive = (idx: number) => {
            if (idx === l.active) return;
            l.active = idx;
            items.forEach((li, i) => (i === idx ? li.setAttribute('aria-current', 'step') : li.removeAttribute('aria-current')));
            const stop = stops[Math.max(0, idx)];
            if (stop) showSize(stop.shipSize);
          };

          showSize(stops[0]?.shipSize ?? 'small', true);

          // The pin itself is CSS `position: sticky` on the stage inside the
          // 500vh section reserved in voyage.css. A ScrollTrigger `pin` was
          // measured first: it flips the stage to position:fixed one frame
          // after the browser scrolls, which Chrome records as layout shift
          // (0.43 at pin start, 1.0 at pin end per scroll-through). Sticky is
          // composited by the browser, adds no pin-spacer, and never shifts.
          // ScrollTrigger only drives the scrub.
          const tl = gsap.timeline({
            defaults: { ease: 'none' },
            scrollTrigger: {
              trigger: sec,
              start: 'top top',
              end: 'bottom bottom',
              scrub: 0.6,
              invalidateOnRefresh: true,
              onUpdate: (self) => {
                l.progress = self.progress;
                setActive(activeIndexFor(self.progress, route.progress));
              },
              onRefresh: (self) => {
                l.trigger = { start: self.start, end: self.end };
              },
            },
          });

          tl.to(
            ship.current!,
            {
              motionPath: { path: path.current!, align: path.current!, alignOrigin: [0.5, 0.5], autoRotate: true },
              duration: 1,
            },
            0,
          );
          if (texture.current) tl.fromTo(texture.current, { yPercent: 0 }, { yPercent: -4, duration: 1 }, 0);
          if (waves.current) tl.fromTo(waves.current, { yPercent: 0, xPercent: 0 }, { yPercent: -10, xPercent: -3, duration: 1 }, 0);

          const st = tl.scrollTrigger!;
          l.trigger = { start: st.start, end: st.end };
          l.progress = st.progress;
          setActive(activeIndexFor(st.progress, route.progress));
          l.mounted = true;

          return () => {
            l.mounted = false;
            l.active = -1;
            l.progress = 0;
            l.trigger = null;
            items.forEach((li) => li.removeAttribute('aria-current'));
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

  const animating = () => motionEnabled && canAnimate && live.current.mounted && live.current.trigger;

  // Keyboard and click: in motion mode, a stop link scrolls the voyage to that
  // stop instead of jumping. Without motion it is a plain in-page link.
  const goTo = (i: number, e?: MouseEvent) => {
    const t = animating();
    if (!t) return;
    e?.preventDefault();
    const y = t.start + (t.end - t.start) * (route.progress[i] ?? 0);
    if (Math.abs(window.scrollY - y) > 2) window.scrollTo(0, Math.ceil(y));
  };

  return (
    <section
      ref={root}
      className="voyage"
      aria-labelledby="voyage-title"
      data-voyage-root=""
      data-testhook={testhook ? '' : undefined}
      data-motion={motionEnabled ? 'on' : 'off'}
      data-hydrated={hydrated ? '' : undefined}
    >
      <div className="voyage__section" data-voyage-section="" ref={section}>
        <div className="voyage__stage" ref={stage}>
          <div className="voyage__visual" aria-hidden="true">
            <div className="voyage__plane voyage__plane--texture" ref={texture} />
            <div className="voyage__plane voyage__plane--waves" ref={waves} />
            <div className="voyage__map">
              <svg className="voyage__route" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid meet" focusable="false">
                <path ref={path} d={route.d} className="voyage__route-line" />
                {route.points.map((p, i) =>
                  i === route.points.length - 1 ? (
                    <g key={stops[i]!.id} className="voyage__island">
                      <circle cx={p.x} cy={p.y} r="12" />
                      <circle cx={p.x} cy={p.y - 26} r="6" className="voyage__sun" />
                    </g>
                  ) : (
                    <circle key={stops[i]!.id} cx={p.x} cy={p.y} r="6" className="voyage__port" />
                  ),
                )}
              </svg>
              <div className="voyage__ship" ref={ship}>
                {shipSizes.map((size) => (
                  <img
                    key={size}
                    src={shipSprite[size]}
                    alt=""
                    width={96}
                    height={48}
                    loading="lazy"
                    decoding="async"
                    data-ship-sprite={size}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="voyage__panel">
            <h2 id="voyage-title" className="voyage__title">
              The Voyage
            </h2>
            <button
              type="button"
              className="voyage__toggle"
              data-voyage-toggle=""
              aria-pressed={!motionEnabled}
              onClick={() => setMotionEnabled((v) => !v)}
            >
              {motionEnabled ? 'Pause the voyage' : 'Play the voyage'}
            </button>
            <ol className="voyage__list" data-voyage-list="">
              {stops.map((stop, i) => (
                <li key={stop.id} id={`stop-${stop.id}`} className="voyage__stop" data-stop-id={stop.id}>
                  <span className="voyage__badge">
                    <img
                      src={shipSprite[stop.shipSize]}
                      alt={`${stop.shipSize} ship`}
                      width={48}
                      height={24}
                      loading="lazy"
                      decoding="async"
                      data-ship-badge=""
                    />
                  </span>
                  <div className="voyage__stop-text">
                    <h3 className="voyage__place">
                      <a href={`#stop-${stop.id}`} data-stop-place="" onClick={(e) => goTo(i, e)} onFocus={() => goTo(i)}>
                        {stop.place}
                      </a>
                    </h3>
                    <p className="voyage__chapter">{stop.chapter}</p>
                    <p className="voyage__role">{stop.role}</p>
                    <p className="voyage__dates">{formatDates(stop.dates)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
