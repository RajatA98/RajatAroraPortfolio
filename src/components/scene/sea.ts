// The sea: one plane, displaced in the vertex shader by two sine fields (a
// long swell along x, a short chop along z), toon-shaded in three bands with a
// hard foam band where the crest is highest. Idle motion comes from the clock.
import { DoubleSide, Mesh, PlaneGeometry, Group } from 'three';
import type { DataTexture, ShaderMaterial, Object3D } from 'three';
import { toonMaterial } from './materials';
import type { SceneTokens } from './tokens';
import type { WorldLayout } from './layout';
import type { SceneState } from './state';

export interface SceneContext { tokens: SceneTokens; ramp: DataTexture; outline: ShaderMaterial; layout: WorldLayout }
export interface Clock { t: number; dt: number }
export interface SceneModule { object: Object3D; update(state: SceneState, clock: Clock): void; dispose(): void }

export const SEA_SEGMENTS = 160;
const SEA_SIZE = 160;

export function buildSea(ctx: SceneContext): SceneModule {
  const geometry = new PlaneGeometry(SEA_SIZE, SEA_SIZE, SEA_SEGMENTS, SEA_SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  const material = toonMaterial(ctx.tokens.sea, ctx.ramp);
  material.side = DoubleSide;
  const time = { value: 0 };
  material.userData.time = time;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vCrest;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         float swell = sin(position.x * 0.18 + uTime * 0.6) * 0.35;
         float chop = sin(position.z * 0.9 + position.x * 0.3 - uTime * 1.4) * 0.12;
         transformed.y += swell + chop;
         vCrest = swell + chop;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCrest;\nuniform vec3 uFoam;')
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
         if (vCrest > 0.36) gl_FragColor.rgb = uFoam;`,
      );
    shader.uniforms.uFoam = { value: material.userData.foam };
  };
  material.userData.foam = material.color.clone().set(ctx.tokens.chart);
  const mesh = new Mesh(geometry, material);
  mesh.name = 'sea';
  mesh.position.y = -0.2;
  const group = new Group();
  group.add(mesh);
  return {
    object: group,
    update(_state, clock) { time.value = clock.t; },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}
