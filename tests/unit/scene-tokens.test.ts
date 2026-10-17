import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readSceneTokens, SCENE_TOKEN_NAMES } from '../../src/components/scene/tokens';

const css = readFileSync(fileURLToPath(new URL('../../src/styles/tokens.css', import.meta.url)), 'utf8');

describe('scene tokens [unit]', () => {
  it('every scene token is declared once in tokens.css as a hex colour', () => {
    for (const name of SCENE_TOKEN_NAMES) {
      const matches = css.match(new RegExp(`${name}:\\s*#[0-9a-fA-F]{6};`, 'g')) ?? [];
      expect(matches, name).toHaveLength(1);
    }
  });

  it('reads the tokens through a getter and trims whitespace', () => {
    const values: Record<string, string> = {
      '--ink': ' #0E1B2B ', '--chart': '#F4F6F3', '--sea': '#1B6F8A', '--sea-deep': '#124E63', '--sea-light': '#4FA3BD',
      '--sun': '#F2A93B', '--sky-dawn': '#F7D6A8', '--sky-day': '#BFE3EE', '--sky-late': '#F3B98C', '--sand': '#E9D9B0',
      '--leaf': '#4F8A5B', '--leaf-deep': '#2F5E3B', '--timber': '#9C6B3C', '--timber-deep': '#6B4426', '--fog': '#D5DBD7', '--signal': '#C7302B',
    };
    const t = readSceneTokens((n) => values[n] ?? '');
    expect(t.ink).toBe('#0E1B2B');
    expect(t.seaDeep).toBe('#124E63');
    expect(t.timberDeep).toBe('#6B4426');
  });

  it('falls back to the documented default when a token is missing', () => {
    const t = readSceneTokens(() => '');
    expect(t.sea).toBe('#1B6F8A');
    expect(t.skyDawn).toBe('#F7D6A8');
  });
});
