import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { APIRoute } from 'astro';
import sharp from 'sharp';

// /apple-touch-icon.png: the route-mark favicon rasterised to 180 x 180 at
// build time, so iOS home-screen bookmarks get the same mark as the tab.
// The SVG is drawn at 32 units; the density makes sharp rasterise it crisp
// at the target size instead of upscaling a 32px bitmap.

const SIZE = 180;

export const GET: APIRoute = async () => {
  const svg = await readFile(resolve(process.cwd(), 'public/favicon.svg'));
  const png = await sharp(svg, { density: Math.ceil((72 * SIZE) / 32) })
    .resize(SIZE, SIZE)
    .png()
    .toBuffer();
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
