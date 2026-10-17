// Sky dome (gradient by progress), the sun disc on its arc, and nothing else
// for the spike. Clouds and gulls arrive in plan 3.
import { CircleGeometry, Group, Mesh, MeshBasicMaterial, SphereGeometry, Color } from 'three';
import { skyMaterial } from './materials';
import type { ShaderMaterial } from 'three';
import type { SceneContext, SceneModule } from './sea';

export function buildSky(ctx: SceneContext): SceneModule {
  const group = new Group();
  const dome = new Mesh(new SphereGeometry(400, 24, 12), skyMaterial(ctx.tokens));
  dome.name = 'sky';
  const sun = new Mesh(new CircleGeometry(9, 24), new MeshBasicMaterial({ color: new Color(ctx.tokens.sun) }));
  sun.name = 'sun';
  group.add(dome, sun);
  return {
    object: group,
    update(state) {
      (dome.material as ShaderMaterial).uniforms.mix!.value = state.skyMix;
      // Arc from low-left (east, behind the start) to low-right, peaking at midday.
      const a = state.sunAngle;
      sun.position.set(Math.cos(a) * 220, Math.sin(a) * 140 + 20, -260);
      sun.lookAt(state.cameraPosition);
      dome.position.copy(state.cameraPosition);
    },
    dispose() {
      dome.geometry.dispose(); (dome.material as { dispose(): void }).dispose();
      sun.geometry.dispose(); (sun.material as { dispose(): void }).dispose();
    },
  };
}
