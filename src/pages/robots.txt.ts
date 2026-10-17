import type { APIRoute } from 'astro';

// /robots.txt: everything is crawlable; the sitemap index comes from
// @astrojs/sitemap and lives on the site host from astro.config.mjs.

export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL('sitemap-index.xml', site ?? 'https://rajatarora.com').href;
  const body = `User-agent: *\nAllow: /\n\nSitemap: ${sitemap}\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
