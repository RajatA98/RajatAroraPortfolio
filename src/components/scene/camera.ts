// The chase camera: position and look-at come straight from the state; a
// small lean follows scroll velocity (added in plan 2).
import { PerspectiveCamera } from 'three';
import type { SceneState } from './state';

export function buildCamera(aspect: number): { camera: PerspectiveCamera; update(state: SceneState): void } {
  const camera = new PerspectiveCamera(42, aspect, 0.5, 900);
  return {
    camera,
    update(state) {
      camera.position.copy(state.cameraPosition);
      camera.lookAt(state.cameraLookAt);
    },
  };
}
