import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

type Entry = { name: string; path: string | string[]; limit: string; gzip?: boolean };
const config = JSON.parse(readFileSync(fileURLToPath(new URL('../../.size-limit.json', import.meta.url)), 'utf8')) as Entry[];
const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8')) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};

describe('size budgets [unit]', () => {
  it('pins Three.js and its types', () => {
    expect(pkg.dependencies.three).toBe('0.186.1');
    expect(pkg.devDependencies['@types/three']).toBe('0.186.0');
  });

  it('keeps the phone tier free of the scene and gives the desktop scene its own 400 kB tier', () => {
    const phone = config.find((e) => e.name.startsWith('Phone'));
    const desktop = config.find((e) => e.name.startsWith('Desktop'));
    expect(phone, 'phone tier').toBeDefined();
    expect(desktop, 'desktop tier').toBeDefined();
    const phonePaths = ([] as string[]).concat(phone!.path);
    expect(phonePaths).toContain('!dist/_astro/three*.js');
    expect(phonePaths).toContain('!dist/_astro/scene*.js');
    expect(phone!.limit).toBe('150 kB');
    expect(([] as string[]).concat(desktop!.path)).toEqual(
      expect.arrayContaining(['dist/_astro/three*.js', 'dist/_astro/scene*.js', 'dist/_astro/gsap*.js']),
    );
    expect(desktop!.limit).toBe('400 kB');
    expect(desktop!.gzip).toBe(true);
  });
});
