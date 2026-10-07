import * as THREE from 'three';
import type { PartId } from '../data/parts';
import type { RocketRig } from './rocketRig';
import type { Viewer } from './viewer';

/** Pointer movement (px) beyond which a press counts as a drag (orbit), not a click. */
const CLICK_SLOP = 5;

/**
 * Turns clicks on the canvas into part selections. A click on empty space reports null.
 * Presses that turn into drags are ignored, so orbiting never changes the selection.
 */
export function attachPicker(viewer: Viewer, rig: RocketRig, onPick: (id: PartId | null) => void): void {
  const canvas = viewer.renderer.domElement;
  const raycaster = new THREE.Raycaster();
  let press: { x: number; y: number; id: number } | null = null;

  // The part under a point in client (CSS pixel) coordinates, if any.
  const pick = (clientX: number, clientY: number): PartId | null => {
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(ndc, viewer.camera);
    const [hit] = raycaster.intersectObjects(rig.pickables(), false);
    return hit ? rig.partOf(hit.object) : null;
  };

  canvas.addEventListener('pointerdown', (e) => {
    press = e.button === 0 && e.isPrimary ? { x: e.clientX, y: e.clientY, id: e.pointerId } : null;
  });
  canvas.addEventListener('pointerup', (e) => {
    const p = press;
    press = null;
    if (!p || p.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > CLICK_SLOP) return;
    onPick(pick(e.clientX, e.clientY));
  });
  // Hover feedback for mice: a pointer cursor over clickable parts.
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || e.buttons !== 0) return;
    canvas.style.cursor = pick(e.clientX, e.clientY) ? 'pointer' : '';
  });
}
