import { describe, expect, it } from 'vitest';
import { renderAstro } from '../helpers/container';
import VoyageTimeline from '../../src/components/voyage/VoyageTimeline.astro';
import IndexPage from '../../src/pages/index.astro';
import { stops, type Stop } from '../../src/data/stops';
import { formatDates } from '../../src/components/voyage/format-dates';
import { findCopyViolations, stripTags } from '../../src/lib/copy-rules';

// Build-Phase 4: the static Voyage is the reduced-motion / JS-off / mobile
// experience and the markup the Phase 5 island will enhance in place. These
// tests pin the semantic contract: an <ol data-voyage-list> of
// <li data-stop-id> items in voyage order, each with place, chapter, role,
// dates and a labelled ship-size badge; milestone markers at the size swaps.

function render(list: readonly Stop[] = stops) {
  return renderAstro(VoyageTimeline, { props: { stops: list } });
}

/** The <li data-stop-id> blocks, in document order. */
function items(html: string): string[] {
  return html.match(/<li\b[^>]*data-stop-id="[^"]+"[\s\S]*?<\/li>/g) ?? [];
}

/** Readable text with the entities Astro escapes ("L&amp;T") decoded back. */
function text(html: string): string {
  return stripTags(html).replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
}

const synthetic: Stop[] = [
  {
    id: 'alpha',
    place: 'Alpha, AA',
    chapter: 'First chapter',
    role: 'First role',
    dates: { start: null, end: null },
    shipSize: 'small',
    milestone: null,
    map: { x: 100, y: 100 },
    pathProgress: null,
    sizeSwap: false,
  },
  {
    id: 'beta',
    place: 'Beta, BB',
    chapter: 'Second chapter',
    role: 'Second role',
    dates: { start: '2016-08', end: '2020-05' },
    shipSize: 'medium',
    milestone: 'graduation',
    map: { x: 300, y: 200 },
    pathProgress: null,
    sizeSwap: true,
  },
  {
    id: 'gamma',
    place: 'Gamma, CC',
    chapter: 'Third chapter',
    role: 'Third role',
    dates: { start: '2024-01', end: 'present' },
    shipSize: 'large',
    milestone: 'turning-point',
    map: null,
    pathProgress: null,
    sizeSwap: true,
  },
];

describe('VoyageTimeline [unit]', () => {
  it('is chapter 3 at the #voyage anchor with a labelled heading', async () => {
    const html = await render();
    expect(html).toMatch(/<section\b[^>]*id="voyage"/);
    expect(html).toMatch(/<section\b[^>]*aria-labelledby="voyage-title"/);
    expect(html).toMatch(/<h2\b[^>]*id="voyage-title"[^>]*>The Voyage<\/h2>/);
    expect(html).toMatch(/<span\b[^>]*class="chapter"[^>]*>3<\/span>/);
  });

  it('renders one ordered list with every stop in voyage order', async () => {
    const html = await render();
    expect(html.match(/<ol\b[^>]*data-voyage-list/g)).toHaveLength(1);
    const ids = [...html.matchAll(/<li\b[^>]*data-stop-id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(stops.map((s) => s.id));
    const anchors = [...html.matchAll(/<li\b[^>]*\bid="stop-([^"]+)"/g)].map((m) => m[1]);
    expect(anchors).toEqual(stops.map((s) => s.id));
  });

  it('every stop shows place, chapter, role and formatted dates', async () => {
    const html = await render();
    const lis = items(html);
    expect(lis).toHaveLength(stops.length);
    stops.forEach((stop, i) => {
      const t = text(lis[i]!);
      expect(t, stop.id).toContain(stop.place);
      expect(t, stop.id).toContain(stop.chapter);
      expect(t, stop.id).toContain(stop.role);
      expect(t, stop.id).toContain(formatDates(stop.dates));
    });
  });

  it('renders "dates to come" for unknown dates and a range otherwise', async () => {
    const html = await render(synthetic);
    const [a, b, c] = items(html);
    expect(stripTags(a!)).toContain('dates to come');
    expect(stripTags(b!)).toContain('Aug 2016 to May 2020');
    expect(stripTags(c!)).toContain('Jan 2024 to present');
    expect(stripTags(b!)).not.toContain('dates to come');
  });

  it('badge is a sized, lazy image whose alt names only the size', async () => {
    const html = await render();
    const lis = items(html);
    stops.forEach((stop, i) => {
      const img = lis[i]!.match(/<img\b[^>]*data-ship-badge[^>]*>/)?.[0] ?? '';
      expect(img, stop.id).not.toBe('');
      expect(img).toContain(`alt="${stop.shipSize} ship"`);
      expect(img).toContain(`src="/voyage/ship-${stop.shipSize[0]}.svg"`);
      expect(img).toMatch(/\bwidth="\d+"/);
      expect(img).toMatch(/\bheight="\d+"/);
      expect(img).toContain('loading="lazy"');
      expect(img).toContain('decoding="async"');
    });
  });

  it('marks a milestone only at the two size swaps, naming the milestone', async () => {
    const html = await render(synthetic);
    const [a, b, c] = items(html);
    expect(a).not.toContain('data-milestone');
    expect(b).toMatch(/data-milestone="graduation"/);
    expect(stripTags(b!)).toContain('Graduation');
    expect(c).toMatch(/data-milestone="turning-point"/);
    expect(stripTags(c!)).toContain('The turning point');
  });

  it('each stop has a focusable place link to its own anchor', async () => {
    const html = await render();
    const lis = items(html);
    stops.forEach((stop, i) => {
      expect(lis[i], stop.id).toMatch(new RegExp(`<a\\b[^>]*href="#stop-${stop.id}"[^>]*data-stop-place`));
    });
  });

  it('draws the route as a decorative static chart, never a pannable map', async () => {
    const html = await render();
    const svg = html.match(/<svg\b[^>]*data-voyage-chart[\s\S]*?<\/svg>/)?.[0] ?? '';
    expect(svg).not.toBe('');
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toMatch(/<path\b[^>]*\bd="M[\d.]+ [\d.]+C/);
    const dots = svg.match(/<circle\b/g) ?? [];
    expect(dots.length).toBeGreaterThanOrEqual(stops.filter((s) => s.map).length);
  });

  it('skips the chart when no stop has coordinates', async () => {
    const html = await render(synthetic.map((s) => ({ ...s, map: null })));
    expect(html).not.toContain('data-voyage-chart');
  });

  it('names ships by size only and passes the copy rules', async () => {
    // Franchise ship names are caught by the IP-denylist scan over this file
    // and the build; here, every badge alt must be exactly a size word.
    const html = await render();
    const badgeAlts = [...html.matchAll(/<img\b[^>]*>/g)]
      .map((m) => m[0])
      .filter((img) => img.includes('data-ship-badge'))
      .map((img) => img.match(/\balt="([^"]*)"/)?.[1]);
    expect(badgeAlts).toHaveLength(stops.length);
    for (const alt of badgeAlts) expect(alt).toMatch(/^(small|medium|large) ship$/);
    expect(findCopyViolations(stripTags(html))).toEqual([]);
  });

  it('adds no inline script of its own; Astro’s island plumbing is the only client code', async () => {
    const html = await render();
    const scripts = html.match(/<script\b[\s\S]*?<\/script>/g) ?? [];
    for (const s of scripts) expect(s).toMatch(/astro-island|astro:/);
    expect(html).not.toMatch(/<script\b[^>]*>[^<]*voyage/i);
  });
});

describe('The desktop island around the timeline [unit]', () => {
  // Build-Phase 5: the island WRAPS the Phase 4 chart and list as slots. It
  // hydrates only under the desktop motion media query (client:media), so a
  // phone or a reduced-motion visitor never downloads React or GSAP.
  it('hydrates only under the desktop motion media query', async () => {
    const html = await render();
    const island = html.match(/<astro-island\b[^>]*>/)?.[0] ?? '';
    expect(island).not.toBe('');
    expect(island).toMatch(/\bclient="media"/);
    const decoded = island.replace(/&quot;/g, '"').replace(/&#34;/g, '"');
    expect(decoded).toContain('(min-width: 1024px)');
    expect(decoded).toContain('(prefers-reduced-motion: no-preference)');
    expect(html.match(/<astro-island\b/g)).toHaveLength(1);
  });

  it('keeps the chart and the list inside the island, chart first', async () => {
    const html = await render();
    const islandStart = html.search(/<astro-island\b/);
    const islandEnd = html.indexOf('</astro-island>');
    const chartAt = html.search(/<svg\b[^>]*data-voyage-chart/);
    const listAt = html.search(/<ol\b[^>]*data-voyage-list/);
    expect(chartAt).toBeGreaterThan(islandStart);
    expect(listAt).toBeGreaterThan(chartAt);
    expect(listAt).toBeLessThan(islandEnd);
  });

  it('marks chapter, role and dates on every stop as details for the staged reveal', async () => {
    const html = await render();
    for (const li of items(html)) {
      expect(li.match(/data-stop-detail/g)).toHaveLength(3);
    }
  });

  it('server-renders the pause toggle unpressed and the ship sprites with empty alt', async () => {
    const html = await render();
    const toggle = html.match(/<button\b[^>]*data-voyage-toggle[^>]*>[\s\S]*?<\/button>/)?.[0] ?? '';
    expect(toggle).not.toBe('');
    expect(toggle).toContain('aria-pressed="false"');
    expect(stripTags(toggle).trim()).toBe('Pause the voyage');
    const sprites = [...html.matchAll(/<img\b[^>]*data-ship-sprite[^>]*>/g)].map((m) => m[0]);
    expect(sprites).toHaveLength(3);
    for (const img of sprites) {
      expect(img).toContain('alt=""');
      expect(img).toContain('loading="lazy"');
    }
    // Sprites are decorative; the badges in the list remain the labelled ones.
    expect(html.match(/data-ship-badge/g)).toHaveLength(stops.length);
  });

  it('the island root is a div, so the chapter section still closes the markup', async () => {
    const html = await render();
    expect(html).toMatch(/<div\b[^>]*data-voyage-root[^>]*data-motion="on"/);
    expect(html.match(/<section\b/g)).toHaveLength(1);
  });
});

describe('The Voyage on the home page [unit]', () => {
  it('sits between the Log and About, and renumbers the chapters after it', async () => {
    const html = await renderAstro(IndexPage);
    const at = (id: string) => html.search(new RegExp(`<section\\b[^>]*id="${id}"`));
    expect(at('log')).toBeGreaterThan(0);
    expect(at('voyage')).toBeGreaterThan(at('log'));
    expect(at('about')).toBeGreaterThan(at('voyage'));
    expect(at('contact')).toBeGreaterThan(at('about'));

    const chapterOf = (id: string) => {
      const start = at(id);
      const section = html.slice(start, html.indexOf('</section>', start));
      return section.match(/<span\b[^>]*class="chapter"[^>]*>(\d+)<\/span>/)?.[1];
    };
    expect(chapterOf('log')).toBe('2');
    expect(chapterOf('voyage')).toBe('3');
    expect(chapterOf('about')).toBe('4');
    expect(chapterOf('contact')).toBe('5');
  });

  it('renders every real stop inside #voyage', async () => {
    const html = await renderAstro(IndexPage);
    const start = html.search(/<section\b[^>]*id="voyage"/);
    const section = html.slice(start, html.indexOf('</section>', start));
    const ids = [...section.matchAll(/<li\b[^>]*data-stop-id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(stops.map((s) => s.id));
  });
});
