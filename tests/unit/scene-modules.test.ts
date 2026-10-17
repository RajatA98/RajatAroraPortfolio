import { Mesh, MeshToonMaterial, PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';
import { worldLayout } from '../../src/components/scene/layout';
import { sceneStateAt } from '../../src/components/scene/state';
import { outlineMaterial, toonRamp } from '../../src/components/scene/materials';
import { readSceneTokens } from '../../src/components/scene/tokens';
import { buildSea, SEA_SEGMENTS } from '../../src/components/scene/sea';
import { buildShip, HULL_LENGTHS } from '../../src/components/scene/ships';
import { buildIslands } from '../../src/components/scene/islands';
import { buildSky } from '../../src/components/scene/sky';
import { buildCamera } from '../../src/components/scene/camera';
import { stops } from '../../src/data/stops';

const tokens = readSceneTokens(() => '');
const layout = worldLayout(stops, [{ id: 'a', classified: false }, { id: 'b', classified: true }]);
const ctx = { tokens, ramp: toonRamp(), outline: outlineMaterial(tokens.ink), layout };
const clock = { t: 1, dt: 1 / 60 };

describe('scene modules [unit]', () => {
  it('sea is a displaced plane large enough to hold the whole route, animated by the clock', () => {
    const sea = buildSea(ctx);
    expect(SEA_SEGMENTS).toBe(160);
    const mesh = sea.object.getObjectByName('sea') as Mesh;
    expect(mesh).toBeDefined();
    const before = (mesh.material as MeshToonMaterial).userData.time.value;
    sea.update(sceneStateAt(0, layout), { t: 2, dt: 1 / 60 });
    expect((mesh.material as MeshToonMaterial).userData.time.value).toBeGreaterThan(before);
    sea.dispose();
  });

  it('ship follows the state: position on the route, heading, hull by index, swap lifts it', () => {
    const ship = buildShip(ctx);
    expect(HULL_LENGTHS).toEqual([3, 5, 8]);
    const s0 = sceneStateAt(0, layout);
    ship.update(s0, clock);
    // On the route horizontally; vertically only the idle bob (at most 0.06) moves it.
    expect(Math.hypot(ship.object.position.x - s0.shipPosition.x, ship.object.position.z - s0.shipPosition.z)).toBeLessThan(0.01);
    expect(Math.abs(ship.object.position.y - s0.shipPosition.y)).toBeLessThanOrEqual(0.061);
    const hulls = [0, 1, 2].map((i) => ship.object.getObjectByName(`hull-${i}`)!);
    expect(hulls[0]!.visible).toBe(true);
    expect(hulls[1]!.visible).toBe(false);
    ship.update({ ...s0, hull: 2, swapPhase: 0.5 }, clock);
    expect(hulls[2]!.visible).toBe(true);
    expect(hulls[0]!.visible).toBe(false);
    expect(ship.object.position.y).toBeGreaterThan(0.5); // lifted at the peak of a swap
    ship.dispose();
  });

  it('islands: one per career stop plus the harbour and the last island, at their positions', () => {
    const islands = buildIslands(ctx);
    const named = layout.stops.map((s) => islands.object.getObjectByName(`island-${s.id}`));
    for (const [i, n] of named.entries()) {
      expect(n, layout.stops[i]!.id).toBeDefined();
      expect(n!.position.distanceTo(layout.stops[i]!.position)).toBeLessThan(0.01);
    }
    expect(islands.object.getObjectByName('island-harbour')).toBeDefined();
    expect(islands.object.getObjectByName(`island-${layout.lastIsland.id}`)).toBeDefined();
    islands.dispose();
  });

  it('sky mixes with progress and moves the sun on its arc', () => {
    const sky = buildSky(ctx);
    sky.update(sceneStateAt(0, layout), clock);
    const sun = sky.object.getObjectByName('sun')!;
    const x0 = sun.position.x;
    sky.update(sceneStateAt(1, layout), clock);
    expect(sun.position.x).not.toBeCloseTo(x0, 1);
    sky.dispose();
  });

  it('camera sits on the state position and looks at the state target', () => {
    const { camera, update } = buildCamera(16 / 9);
    expect(camera).toBeInstanceOf(PerspectiveCamera);
    expect(camera.fov).toBe(42);
    const s = sceneStateAt(0.5, layout);
    update(s);
    expect(camera.position.distanceTo(s.cameraPosition)).toBeLessThan(0.01);
  });
});
