import * as THREE from 'three';
import type { PartId, Rocket } from '../data/parts';
import { approach, explodeOffsetAt } from '../motion/explode';
import type { RocketStore } from '../state/store';
import type { Viewer } from './viewer';

const isRenderable = (o: THREE.Object3D): boolean =>
  (o as THREE.Mesh).isMesh === true || (o as THREE.Line).isLine === true || (o as THREE.Points).isPoints === true;

/**
 * Connects the store to the 3D model: moves parts to their exploded positions and shows or
 * hides them. Part objects are nested like the parts tree, so a part's "own" geometry is
 * everything under it that doesn't belong to a child part; that is what visibility toggles.
 */
export class RocketRig {
  readonly objects = new Map<PartId, THREE.Object3D>();
  private readonly assembled = new Map<PartId, THREE.Vector3>();
  private readonly own = new Map<PartId, THREE.Object3D[]>();
  private readonly settleListeners = new Set<(explode: number) => void>();
  /** The explode factor currently on screen; eases toward the store's value. */
  private shownExplode: number;

  constructor(
    private readonly rocket: Rocket,
    readonly model: THREE.Object3D,
    private readonly viewer: Viewer,
    private readonly store: RocketStore,
  ) {
    for (const part of rocket.parts) {
      const obj = model.getObjectByName(part.meshName);
      if (!obj) {
        console.warn(`[houston] No object named "${part.meshName}" for part "${part.id}"`);
        continue;
      }
      this.objects.set(part.id, obj);
      this.assembled.set(part.id, obj.position.clone());
    }

    const partObjects = new Set(this.objects.values());
    for (const [id, obj] of this.objects) {
      const own: THREE.Object3D[] = [];
      const visit = (node: THREE.Object3D): void => {
        for (const child of node.children) {
          if (partObjects.has(child)) continue; // a child part manages its own geometry
          if (isRenderable(child)) own.push(child);
          visit(child);
        }
      };
      visit(obj);
      this.own.set(id, own);
    }

    const s = store.get();
    this.shownExplode = s.explode;
    this.applyExplode();
    this.applyVisibility(s.hidden);

    store.subscribe((next, prev) => {
      if (next.hidden !== prev.hidden) {
        this.applyVisibility(next.hidden);
        viewer.requestRender();
      }
      if (next.explode !== prev.explode) this.animateExplode();
    });
  }

  /** Called with the explode factor whenever the explode motion comes to rest. */
  onSettle(fn: (explode: number) => void): () => void {
    this.settleListeners.add(fn);
    return () => this.settleListeners.delete(fn);
  }

  /** World-space bounds of the whole model (hidden parts included), for framing the camera. */
  bounds(): THREE.Box3 {
    this.model.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(this.model);
  }

  /** Whether any of a part's own geometry is showing. */
  isShown(id: PartId): boolean {
    return this.own.get(id)?.some((o) => o.visible) ?? false;
  }

  private animateExplode(): void {
    if (this.store.get().reducedMotion) {
      this.shownExplode = this.store.get().explode;
      this.applyExplode();
      this.viewer.requestRender();
      this.emitSettle();
      return;
    }
    this.viewer.addTicker(this.tick);
  }

  private readonly tick = (dt: number): boolean => {
    const target = this.store.get().explode;
    this.shownExplode = approach(this.shownExplode, target, dt);
    this.applyExplode();
    const done = this.shownExplode === target;
    if (done) this.emitSettle();
    return !done;
  };

  private emitSettle(): void {
    for (const fn of this.settleListeners) fn(this.shownExplode);
  }

  private applyExplode(): void {
    for (const part of this.rocket.parts) {
      const obj = this.objects.get(part.id);
      const base = this.assembled.get(part.id);
      if (!obj || !base) continue;
      const [x, y, z] = explodeOffsetAt(part, this.shownExplode);
      obj.position.set(base.x + x, base.y + y, base.z + z);
    }
    // Parts that explode downward would sink through the floor grid; lift the whole model
    // so its lowest point stays on the floor.
    this.model.position.y = 0;
    this.model.position.y = Math.max(0, -this.bounds().min.y);
  }

  // Hidden parts keep moving with the explode, so they reappear in the right place.
  private applyVisibility(hidden: ReadonlySet<PartId>): void {
    for (const [id, objs] of this.own) {
      const visible = !hidden.has(id);
      for (const o of objs) o.visible = visible;
    }
  }
}
