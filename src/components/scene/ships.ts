// Three hulls from one generator: a tapered box hull (timber, one darker face
// via the toon ramp), a mast and a sail. The ship module holds all three and
// shows the one the state names; a swap lifts the ship and crosses over at
// the top of the lift.
import { BoxGeometry, BufferGeometry, CylinderGeometry, Float32BufferAttribute, Group, Mesh, PlaneGeometry } from 'three';
import { toonMaterial, withOutline } from './materials';
import type { SceneContext, SceneModule } from './sea';

export const HULL_LENGTHS = [3, 5, 8] as const;

function hullGeometry(length: number): BufferGeometry {
  // A hull: a box whose bow (x = -length/2, the ship faces west) narrows to a point.
  const w = length * 0.38;
  const h = length * 0.22;
  const geo = new BoxGeometry(length, h, w, 2, 1, 1);
  const pos = geo.attributes.position as Float32BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    if (x < -length * 0.25) pos.setZ(i, pos.getZ(i) * 0.35); // pinch the bow
    if (pos.getY(i) < 0) pos.setZ(i, pos.getZ(i) * 0.7);      // narrower below the waterline
  }
  geo.computeVertexNormals();
  return geo;
}

function hull(ctx: SceneContext, index: 0 | 1 | 2): Group {
  const length = HULL_LENGTHS[index];
  const timber = toonMaterial(ctx.tokens.timber, ctx.ramp);
  const body = withOutline(new Mesh(hullGeometry(length), timber), ctx.outline);
  const mastH = length * 0.9;
  const mast = withOutline(new Mesh(new CylinderGeometry(0.06, 0.08, mastH, 6), toonMaterial(ctx.tokens.timberDeep, ctx.ramp)), ctx.outline);
  mast.position.set(0, mastH / 2, 0);
  const sail = withOutline(new Mesh(new PlaneGeometry(length * 0.55, mastH * 0.6), toonMaterial(ctx.tokens.chart, ctx.ramp)), ctx.outline);
  sail.position.set(-length * 0.1, mastH * 0.55, 0);
  const g = new Group();
  g.name = `hull-${index}`;
  g.add(body, mast, sail);
  return g;
}

export function buildShip(ctx: SceneContext): SceneModule {
  const ship = new Group();
  ship.name = 'ship';
  const hulls = [hull(ctx, 0), hull(ctx, 1), hull(ctx, 2)];
  hulls.forEach((h, i) => { h.visible = i === 0; ship.add(h); });
  return {
    object: ship,
    update(state, clock) {
      ship.position.copy(state.shipPosition);
      ship.rotation.y = -state.shipHeading + Math.PI; // the hull geometry faces -x; heading 0 is +x
      // Lift and drop at a swap (a sine bump), plus a gentle idle bob.
      const lift = state.swapPhase > 0 ? Math.sin(state.swapPhase * Math.PI) * 1.2 : 0;
      ship.position.y += lift + Math.sin(clock.t * 1.3) * 0.06;
      ship.rotation.z = Math.sin(clock.t * 0.9) * 0.02;
      hulls.forEach((h, i) => { h.visible = i === state.hull; });
    },
    dispose() {
      ship.traverse((o) => { if (o instanceof Mesh) { o.geometry.dispose(); (o.material as { dispose(): void }).dispose(); } });
    },
  };
}
