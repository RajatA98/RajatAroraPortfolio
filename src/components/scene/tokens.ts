// The scene reads its colours from the CSS custom properties at mount, so the
// stylesheet stays the single source of truth for CSS and WebGL alike.

export interface SceneTokens {
  ink: string; chart: string; sea: string; seaDeep: string; seaLight: string; sun: string;
  skyDawn: string; skyDay: string; skyLate: string; sand: string; leaf: string; leafDeep: string;
  timber: string; timberDeep: string; fog: string; signal: string;
}

const MAP: Record<keyof SceneTokens, [name: string, fallback: string]> = {
  ink: ['--ink', '#0E1B2B'], chart: ['--chart', '#F4F6F3'], sea: ['--sea', '#1B6F8A'],
  seaDeep: ['--sea-deep', '#124E63'], seaLight: ['--sea-light', '#4FA3BD'], sun: ['--sun', '#F2A93B'],
  skyDawn: ['--sky-dawn', '#F7D6A8'], skyDay: ['--sky-day', '#BFE3EE'], skyLate: ['--sky-late', '#F3B98C'],
  sand: ['--sand', '#E9D9B0'], leaf: ['--leaf', '#4F8A5B'], leafDeep: ['--leaf-deep', '#2F5E3B'],
  timber: ['--timber', '#9C6B3C'], timberDeep: ['--timber-deep', '#6B4426'], fog: ['--fog', '#D5DBD7'], signal: ['--signal', '#C7302B'],
};

export const SCENE_TOKEN_NAMES: readonly string[] = Object.values(MAP).map(([name]) => name);

/** `get` is typically `(n) => getComputedStyle(document.documentElement).getPropertyValue(n)`. */
export function readSceneTokens(get: (name: string) => string): SceneTokens {
  const out = {} as SceneTokens;
  for (const key of Object.keys(MAP) as (keyof SceneTokens)[]) {
    const [name, fallback] = MAP[key];
    const v = get(name).trim();
    out[key] = /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
  }
  return out;
}
