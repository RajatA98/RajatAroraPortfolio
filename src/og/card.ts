import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import satori from 'satori';
import { location, name, valueLine } from '../data/site';

// The Open Graph card (Build-Phase 6), rendered at build time by
// src/pages/og.png.ts. It is the log-book page in miniature: a chart-coloured
// field inside a 4px ink frame, the ruled margin with the chapter mark, the
// name in the display face, the value line, a status line, the route mark,
// and the host the build is for. No phone number, ever. The avatar slot is
// empty until the avatar track lands (then it sits top-right of the page).
//
// Fonts: two static TTF instances of Archivo cut from the same OFL source as
// the site's web fonts (see LICENSES.md). satori cannot read WOFF2. They are
// read relative to the project root because Astro bundles this module into a
// temporary server build at `astro build` time, where import.meta.url would
// not point back at src/.

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const INK = '#0E1B2B';
const CHART = '#F4F6F3';
const INK_60 = '#48525D';
const SUN = '#F2A93B';

const statusLine = `AI Engineer, ${location}, available now.`;

export interface OgCardInput {
  /** The host the card names in its corner, e.g. "rajatarora.com". */
  host: string;
}

export interface OgCard {
  svg: string;
  /** Every string drawn on the card, for tests (satori draws text as paths). */
  text: string[];
}

type Node = { type: string; props: Record<string, unknown> };
const h = (type: string, props: Record<string, unknown>, ...children: unknown[]): Node => ({
  type,
  props: { ...props, children: children.length === 1 ? children[0] : children },
});

let fonts: Promise<{ display: Buffer; body: Buffer }> | null = null;
function loadFonts() {
  fonts ??= Promise.all([
    readFile(resolve(process.cwd(), 'src/og/fonts/archivo-expanded-800.ttf')),
    readFile(resolve(process.cwd(), 'src/og/fonts/archivo-500.ttf')),
  ]).then(([display, body]) => ({ display, body }));
  return fonts;
}

function routeMark(width: number): Node {
  const scale = width / 240;
  return h(
    'svg',
    { viewBox: '0 0 240 72', width, height: Math.round(72 * scale), fill: 'none' },
    h('path', {
      d: 'M2 66 C 46 66, 62 46, 104 46 S 168 30, 205 33',
      stroke: INK,
      strokeWidth: 2.5,
      strokeLinecap: 'round',
      strokeDasharray: '7 6',
    }),
    h('circle', { cx: 220, cy: 34, r: 12, stroke: INK, strokeWidth: 2.5 }),
    h('circle', { cx: 220, cy: 9, r: 6, fill: SUN }),
  );
}

export async function renderOgCard({ host }: OgCardInput): Promise<OgCard> {
  const { display, body } = await loadFonts();
  const text = [name, valueLine, statusLine, host];

  const tree = h(
    'div',
    {
      style: {
        width: OG_WIDTH,
        height: OG_HEIGHT,
        display: 'flex',
        background: CHART,
        padding: 28,
        fontFamily: 'Archivo',
        color: INK,
      },
    },
    h(
      'div',
      {
        style: {
          flex: 1,
          display: 'flex',
          border: `4px solid ${INK}`,
          borderRadius: 4,
        },
      },
      // The ruled margin with the chapter mark.
      h(
        'div',
        {
          style: {
            width: 128,
            display: 'flex',
            justifyContent: 'flex-end',
            paddingTop: 56,
            paddingRight: 28,
            borderRight: `3px solid ${INK}`,
            fontFamily: 'Archivo Expanded',
            fontWeight: 800,
            fontSize: 44,
            lineHeight: 1,
          },
        },
        '1',
      ),
      // The page.
      h(
        'div',
        {
          style: {
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '56px 64px 44px 64px',
          },
        },
        h(
          'div',
          { style: { display: 'flex', flexDirection: 'column' } },
          h(
            'div',
            {
              style: {
                fontFamily: 'Archivo Expanded',
                fontWeight: 800,
                fontSize: 82,
                lineHeight: 1.02,
                letterSpacing: '-0.02em',
              },
            },
            name,
          ),
          h('div', { style: { marginTop: 36, fontSize: 38, lineHeight: 1.25, maxWidth: 860 } }, valueLine),
          h('div', { style: { marginTop: 18, fontSize: 28, lineHeight: 1.3, color: INK_60 } }, statusLine),
        ),
        h(
          'div',
          { style: { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' } },
          routeMark(260),
          h('div', { style: { fontSize: 26, color: INK_60 } }, host),
        ),
      ),
    ),
  );

  const svg = await satori(tree as never, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: [
      { name: 'Archivo Expanded', data: display, weight: 800, style: 'normal' },
      { name: 'Archivo', data: body, weight: 500, style: 'normal' },
    ],
  });
  return { svg, text };
}
