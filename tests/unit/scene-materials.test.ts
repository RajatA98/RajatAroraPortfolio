import { BoxGeometry, Mesh, NearestFilter, BackSide, Color } from 'three';
import { describe, expect, it } from 'vitest';
import { outlineMaterial, skyMaterial, toonMaterial, toonRamp, withOutline } from '../../src/components/scene/materials';
import { readSceneTokens } from '../../src/components/scene/tokens';

const tokens = readSceneTokens(() => '');

describe('toon materials [unit]', () => {
  it('ramp has exactly three steps with nearest filtering (flat cel bands)', () => {
    const ramp = toonRamp();
    expect(ramp.image.width).toBe(3);
    expect(ramp.image.height).toBe(1);
    expect(ramp.magFilter).toBe(NearestFilter);
    expect(ramp.minFilter).toBe(NearestFilter);
  });

  it('toon material carries the token colour, the ramp, and no specular or env map', () => {
    const m = toonMaterial('#1B6F8A', toonRamp());
    expect(m.color.getHexString().toUpperCase()).toBe('1B6F8A');
    expect(m.gradientMap).not.toBeNull();
    expect((m as unknown as { envMap?: unknown }).envMap ?? null).toBeNull();
  });

  it('outline is a back-face ink shell with a screen-constant width uniform', () => {
    const o = outlineMaterial('#0E1B2B', 0.03);
    expect(o.side).toBe(BackSide);
    expect((o.uniforms.ink.value as Color).getHexString().toUpperCase()).toBe('0E1B2B');
    expect(o.uniforms.width.value).toBeCloseTo(0.03, 6);
    expect(o.vertexShader).toContain('normal');
  });

  it('withOutline groups the mesh with its shell, sharing geometry', () => {
    const mesh = new Mesh(new BoxGeometry(1, 1, 1), toonMaterial('#9C6B3C', toonRamp()));
    const g = withOutline(mesh, outlineMaterial('#0E1B2B'));
    expect(g.children).toHaveLength(2);
    const shell = g.children[1] as Mesh;
    expect(shell.geometry).toBe(mesh.geometry);
    expect(shell.renderOrder).toBeLessThan(mesh.renderOrder);
  });

  it('sky material mixes dawn, day and late by a uniform', () => {
    const s = skyMaterial(tokens);
    expect(s.uniforms.mix.value).toBe(0);
    expect((s.uniforms.dawnTop.value as Color).getHexString().toUpperCase()).toBe('F7D6A8');
    expect(s.depthWrite).toBe(false);
  });
});
