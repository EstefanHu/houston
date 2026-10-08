import * as THREE from 'three';
import { descendantsOf } from '../data/parts';
import type { PartId, Rocket } from '../data/parts';
import { approach, explodeOffsetAt } from '../motion/explode';
import { altitudeAt, partPoseAt } from '../motion/timeline';
import type { RocketStore } from '../state/store';
import type { Viewer } from './viewer';

const HIGHLIGHT = 0xffb347;

type Renderable = THREE.Mesh | THREE.Line | THREE.Points;

const isRenderable = (o: THREE.Object3D): boolean =>
  (o as THREE.Mesh).isMesh === true || (o as THREE.Line).isLine === true || (o as THREE.Points).isPoints === true;

/**
 * Connects the store to the 3D model: places parts (explode offset plus flight pose), shows
 * or hides them, and highlights the selection. Part objects are nested like the parts tree, so a part's "own" geometry is
 * everything under it that doesn't belong to a child part; that is what visibility toggles.
 */
export class RocketRig {
  readonly objects = new Map<PartId, THREE.Object3D>();
  private readonly assembled = new Map<PartId, { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }>();
  private readonly own = new Map<PartId, THREE.Object3D[]>();
  private readonly ownerOf = new Map<THREE.Object3D, PartId>();
  /** Original materials of currently highlighted objects, restored on deselect. */
  private readonly originals = new Map<Renderable, Renderable['material']>();
  private readonly highlightCache = new WeakMap<THREE.Material, THREE.Material>();
  private readonly settleListeners = new Set<(explode: number) => void>();
  /** Parts currently separated from the stack (as of the last applyTransforms). */
  private readonly detached = new Set<PartId>();
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
      this.assembled.set(part.id, { position: obj.position.clone(), quaternion: obj.quaternion.clone(), scale: obj.scale.clone() });
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
      for (const o of own) this.ownerOf.set(o, id);
    }

    const s = store.get();
    this.shownExplode = s.explode;
    this.applyTransforms();
    this.applyVisibility(s.hidden);
    this.applySelection(s.selected);

    store.subscribe((next, prev) => {
      if (next.hidden !== prev.hidden) {
        this.applyVisibility(next.hidden);
        viewer.requestRender();
      }
      if (next.explode !== prev.explode) this.animateExplode();
      if (next.flight.t !== prev.flight.t || next.flight.phase !== prev.flight.phase) {
        this.applyTransforms();
        viewer.requestRender();
      }
      if (next.selected !== prev.selected) {
        this.applySelection(next.selected);
        viewer.requestRender();
      }
    });
  }

  /** Called with the explode factor whenever the explode motion comes to rest. */
  onSettle(fn: (explode: number) => void): () => void {
    this.settleListeners.add(fn);
    return () => this.settleListeners.delete(fn);
  }

  /**
   * World-space bounds of the whole model (hidden parts included), for framing the camera.
   * Only part geometry counts, not extras such as exhaust plumes attached to parts.
   */
  bounds(): THREE.Box3 {
    return this.boundsOf(this.rocket.parts.map((p) => p.id));
  }

  /** World-space bounds of a part and its sub-parts. */
  partBounds(id: PartId): THREE.Box3 {
    return this.boundsOf([id, ...descendantsOf(this.rocket.parts, id)]);
  }

  /**
   * Bounds for the chase camera to centre on: the part and the sub-parts still attached to
   * it. A jettisoned nose cone drifting away shouldn't drag the camera with it.
   */
  attachedBounds(id: PartId): THREE.Box3 {
    const parentOf = new Map(this.rocket.parts.map((p) => [p.id, p.parent]));
    const attached = (d: PartId): boolean => {
      for (let a: PartId | null = d; a !== null && a !== id; a = parentOf.get(a) ?? null) {
        if (this.detached.has(a)) return false;
      }
      return true;
    };
    return this.boundsOf([id, ...descendantsOf(this.rocket.parts, id).filter(attached)]);
  }

  private boundsOf(ids: PartId[]): THREE.Box3 {
    this.model.updateMatrixWorld(true);
    const box = new THREE.Box3();
    for (const id of ids) for (const o of this.own.get(id) ?? []) box.expandByObject(o);
    return box;
  }

  /** Whether any of a part's own geometry is showing. */
  isShown(id: PartId): boolean {
    return this.own.get(id)?.some((o) => o.visible) ?? false;
  }

  /** Whether the part or any of its sub-parts is showing. */
  isSubtreeShown(id: PartId): boolean {
    return [id, ...descendantsOf(this.rocket.parts, id)].some((p) => this.isShown(p));
  }

  /** Whether the part's geometry is drawn with the highlight. */
  isHighlighted(id: PartId): boolean {
    return this.own.get(id)?.some((o) => this.originals.has(o as Renderable)) ?? false;
  }

  /** Visible meshes that can be clicked. */
  pickables(): THREE.Object3D[] {
    return [...this.ownerOf.keys()].filter((o) => (o as THREE.Mesh).isMesh === true && o.visible);
  }

  /** The part an object belongs to. */
  partOf(object: THREE.Object3D): PartId | null {
    return this.ownerOf.get(object) ?? null;
  }

  private animateExplode(): void {
    if (this.store.get().reducedMotion) {
      this.shownExplode = this.store.get().explode;
      this.applyTransforms();
      this.viewer.requestRender();
      this.emitSettle();
      return;
    }
    this.viewer.addTicker(this.tick);
  }

  private readonly tick = (dt: number): boolean => {
    const target = this.store.get().explode;
    this.shownExplode = approach(this.shownExplode, target, dt);
    this.applyTransforms();
    const done = this.shownExplode === target;
    if (done) this.emitSettle();
    return !done;
  };

  private emitSettle(): void {
    for (const fn of this.settleListeners) fn(this.shownExplode);
  }

  /**
   * Places every part: assembled transform + explode offset + flight pose. In flight the
   * whole model climbs to the stack altitude; on the pad it is lifted just enough that
   * parts exploding downward don't sink through the floor grid.
   */
  private applyTransforms(): void {
    const { flight } = this.store.get();
    const inFlight = flight.phase !== 'idle';
    const altitude = inFlight ? altitudeAt(this.rocket.flight, flight.t) : 0;
    const extra = new THREE.Quaternion();
    const euler = new THREE.Euler();
    this.detached.clear();
    for (const part of this.rocket.parts) {
      const obj = this.objects.get(part.id);
      const base = this.assembled.get(part.id);
      if (!obj || !base) continue;
      const [x, y, z] = explodeOffsetAt(part, this.shownExplode);
      // On the pad, poses are the pre-launch state (legs stowed, parachutes packed).
      const pose = partPoseAt(part, inFlight ? flight.t : -Infinity);
      // World-frame tracks are relative to the pad, so take the stack's climb back out.
      // (This assumes the part's parents are still riding the stack.)
      const lift = pose.frame === 'world' ? altitude : 0;
      if (pose.detached) this.detached.add(part.id);
      obj.position.set(
        base.position.x + x + pose.offset[0],
        base.position.y + y + pose.offset[1] - lift,
        base.position.z + z + pose.offset[2],
      );
      obj.quaternion.copy(base.quaternion).multiply(extra.setFromEuler(euler.set(...pose.rotation)));
      obj.scale.set(base.scale.x * pose.scale[0], base.scale.y * pose.scale[1], base.scale.z * pose.scale[2]);
    }
    if (inFlight) {
      this.model.position.y = altitude;
    } else {
      this.model.position.y = 0;
      this.model.position.y = Math.max(0, -this.bounds().min.y);
    }
  }

  // Selecting a stage highlights its components too.
  private applySelection(selected: PartId | null): void {
    for (const [o, material] of this.originals) o.material = material;
    this.originals.clear();
    if (selected === null) return;
    for (const id of [selected, ...descendantsOf(this.rocket.parts, selected)]) {
      for (const o of this.own.get(id) ?? []) {
        const r = o as Renderable;
        this.originals.set(r, r.material);
        r.material = Array.isArray(r.material) ? r.material.map((m) => this.highlighted(m)) : this.highlighted(r.material);
      }
    }
  }

  private highlighted(material: THREE.Material): THREE.Material {
    let h = this.highlightCache.get(material);
    if (!h) {
      h = material.clone();
      if (h instanceof THREE.MeshStandardMaterial) {
        h.color.lerp(new THREE.Color(HIGHLIGHT), 0.65);
        h.emissive.set(HIGHLIGHT);
        h.emissiveIntensity = 0.25;
      } else if (h instanceof THREE.LineBasicMaterial) {
        h.color.set(HIGHLIGHT);
        h.opacity = 1;
      }
      this.highlightCache.set(material, h);
    }
    return h;
  }

  // Hidden parts keep moving with the explode, so they reappear in the right place.
  private applyVisibility(hidden: ReadonlySet<PartId>): void {
    for (const [id, objs] of this.own) {
      const visible = !hidden.has(id);
      for (const o of objs) o.visible = visible;
    }
  }
}
