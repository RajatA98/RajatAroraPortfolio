// Islands: stacked low-poly cones with a sand ring at the waterline, one per
// career stop, the harbour island, and the last island. Heights vary by index
// so the chart reads as a journey, not a row of the same cone.
import { ConeGeometry, Group, Mesh, TorusGeometry } from 'three';
import { toonMaterial, withOutline } from './materials';
import type { SceneContext, SceneModule } from './sea';
import type { Vector3 } from 'three';

function island(ctx: SceneContext, name: string, at: Vector3, scale: number): Group {
  const g = new Group();
  g.name = name;
  g.position.copy(at);
  const sand = withOutline(new Mesh(new TorusGeometry(2.4 * scale, 0.5 * scale, 6, 18), toonMaterial(ctx.tokens.sand, ctx.ramp)), ctx.outline);
  sand.rotation.x = Math.PI / 2;
  sand.position.y = -0.1;
  const tiers = [
    { r: 2.2, h: 1.6, y: 0 },
    { r: 1.4, h: 1.4, y: 1.0 },
    { r: 0.8, h: 1.2, y: 1.9 },
  ];
  g.add(sand);
  for (const t of tiers) {
    const m = withOutline(new Mesh(new ConeGeometry(t.r * scale, t.h * scale, 7), toonMaterial(ctx.tokens.leaf, ctx.ramp)), ctx.outline);
    m.position.y = (t.y + t.h / 2) * scale;
    g.add(m);
  }
  return g;
}

export function buildIslands(ctx: SceneContext): SceneModule {
  const group = new Group();
  ctx.layout.stops.forEach((s, i) => {
    group.add(island(ctx, `island-${s.id}`, s.position, 0.8 + (i % 3) * 0.25));
  });
  const h = ctx.layout.harbour;
  const centre = h.berths[0]!.position.clone().lerp(h.berths[h.berths.length - 1]!.position, 0.5);
  centre.z -= 4;
  group.add(island(ctx, 'island-harbour', centre, 1.6));
  group.add(island(ctx, `island-${ctx.layout.lastIsland.id}`, ctx.layout.lastIsland.position, 1.0));
  return {
    object: group,
    update() {},
    dispose() {
      group.traverse((o) => { if (o instanceof Mesh) { o.geometry.dispose(); (o.material as { dispose(): void }).dispose(); } });
    },
  };
}
