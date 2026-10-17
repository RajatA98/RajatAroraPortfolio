// The only module that touches scroll. One ScrollTrigger from the top of the
// first chapter to the bottom of the last, scrubbed, reporting page progress.
// No pin (the canvas is CSS-fixed), no snapping, no wheel interception.

type GsapCore = typeof import('gsap').gsap;
type ScrollTriggerStatic = typeof import('gsap/ScrollTrigger').ScrollTrigger;

export interface Bounds { start: number; end: number }

export function pageBounds(first: DOMRect, last: DOMRect, scrollY: number, innerHeight: number): Bounds {
  return { start: first.top + scrollY, end: last.bottom + scrollY - innerHeight };
}

export function progressToScrollY(progress: number, b: Bounds): number {
  const p = Math.min(1, Math.max(0, progress));
  return b.start + (b.end - b.start) * p;
}

export interface VoyageTimeline {
  progress(): number;
  scrollTo(progress: number): void;
  refresh(): void;
  kill(): void;
}

export function buildTimeline(
  gsap: GsapCore,
  ScrollTrigger: ScrollTriggerStatic,
  sections: readonly HTMLElement[],
  onUpdate: (progress: number) => void,
  /** The trigger's id, so callers can find this one trigger among others on the page. */
  id: string,
): VoyageTimeline {
  const first = sections[0]!;
  const last = sections[sections.length - 1]!;
  const proxy = { p: 0 };
  let alive = true;
  // The scrubbed tween is what the scene follows: ScrollTrigger's own onUpdate
  // reports raw scroll progress, the tween's reports the 0.6 s smoothed value.
  const tween = gsap.to(proxy, {
    p: 1,
    ease: 'none',
    onUpdate: () => onUpdate(proxy.p),
    scrollTrigger: {
      id,
      trigger: first,
      start: 'top top',
      endTrigger: last,
      end: 'bottom bottom',
      scrub: 0.6,
      invalidateOnRefresh: true,
    },
  });
  const st = tween.scrollTrigger!;
  // A deep link or an early scroll: start the scene where the page already is, once, now.
  tween.progress(st.progress);
  proxy.p = st.progress;
  onUpdate(st.progress);

  return {
    progress: () => (alive ? proxy.p : 0),
    scrollTo(progress) {
      if (!alive) return;
      const y = progressToScrollY(progress, { start: st.start, end: st.end });
      window.scrollTo({ top: Math.ceil(y), behavior: 'smooth' });
    },
    refresh: () => { if (alive) st.refresh(); },
    kill() {
      alive = false;
      st.kill();
      tween.kill();
    },
  };
}
