import * as THREE from 'three';
import type { PartId, Rocket } from '../data/parts';

/**
 * Connects the parts data to the 3D model. For now it maps each part to its object and
 * remembers the assembled transforms; explode, visibility and highlight arrive in M2.
 */
export class RocketRig {
  readonly objects = new Map<PartId, THREE.Object3D>();
  readonly assembled = new Map<PartId, { position: THREE.Vector3; quaternion: THREE.Quaternion }>();

  constructor(rocket: Rocket, readonly model: THREE.Object3D) {
    for (const part of rocket.parts) {
      const obj = model.getObjectByName(part.meshName);
      if (!obj) {
        console.warn(`[houston] No object named "${part.meshName}" for part "${part.id}"`);
        continue;
      }
      this.objects.set(part.id, obj);
      this.assembled.set(part.id, { position: obj.position.clone(), quaternion: obj.quaternion.clone() });
    }
  }

  /** World-space bounds of the whole model, for framing the camera. */
  bounds(): THREE.Box3 {
    return new THREE.Box3().setFromObject(this.model);
  }
}
