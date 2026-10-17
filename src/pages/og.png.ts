import type { APIRoute } from 'astro';
import { Resvg } from '@resvg/resvg-js';
import { OG_WIDTH, renderOgCard } from '../og/card';

// /og.png: the link-preview card, rendered once at build time (static output)
// from the same site data the page uses. Referenced by the og:image and
// twitter:image tags in BaseLayout. The host comes from `site` in
// astro.config.mjs, so the domain cutover is one line.

export const GET: APIRoute = async ({ site }) => {
  const host = (site ?? new URL('https://rajatarora.com')).host;
  const { svg } = await renderOgCard({ host });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } }).render().asPng();
  return new Response(new Uint8Array(png), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400' },
  });
};
