import { describe, expect, it } from 'vitest';
import { renderAstro } from '../helpers/container';
import IndexPage from '../../src/pages/index.astro';
import { SCENE_QUERY } from '../../src/components/scene/mount';
import { decideLoad } from '../../src/components/scene/loader';

describe('Voyage3D on the home page [unit]', () => {
  it('mounts once, with client:media on the scene query, and renders no canvas on the server', async () => {
    const html = await renderAstro(IndexPage);
    const islands = html.match(/<astro-island\b[^>]*component-url="[^"]*Voyage3D[^"]*"[^>]*>/g) ?? [];
    expect(islands).toHaveLength(1);
    const decoded = islands[0]!.replace(/&quot;/g, '"');
    expect(decoded).toMatch(/\bclient="media"/);
    expect(decoded).toContain(SCENE_QUERY);
    expect(html).not.toContain('<canvas');
    expect(html).toMatch(/<div\b[^>]*data-scene-root/);
  });

  it('every chapter section carries data-scene-chapter in page order', async () => {
    const html = await renderAstro(IndexPage);
    const ids = [...html.matchAll(/data-scene-chapter="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(['hero', 'log', 'voyage', 'about', 'contact']);
  });
});

describe('loader decisions [unit]', () => {
  it('loads once and never retries after a failure', () => {
    expect(decideLoad({ attempted: false, failed: false })).toBe('load');
    expect(decideLoad({ attempted: true, failed: true })).toBe('static');
    expect(decideLoad({ attempted: true, failed: false })).toBe('reuse');
  });
});
