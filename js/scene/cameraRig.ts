import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { smoothstep } from '../motion/explode';
import type { Viewer } from './viewer';

const HOME_DIRECTION = new THREE.Vector3(1, 0.35, 1.25).normalize();
const EASE_SECONDS = 0.6;

/** Orbit/zoom/pan with damping, plus home() and focus(box) camera moves. */
export class CameraRig {
  readonly controls: OrbitControls;
  private dragging = false;
  /** The camera move in progress, if any. A new move replaces it; shift() moves it along. */
  private ease: { fromPos: THREE.Vector3; toPos: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3 } | null = null;
  private homeView = { position: new THREE.Vector3(), target: new THREE.Vector3() };

  constructor(
    private readonly viewer: Viewer,
    private readonly reducedMotion: () => boolean,
  ) {
    const c = new OrbitControls(viewer.camera, viewer.renderer.domElement);
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    c.screenSpacePanning = true;
    c.maxPolarAngle = Math.PI * 0.95;
    c.addEventListener('start', () => {
      this.dragging = true;
      viewer.addTicker(this.tick);
    });
    c.addEventListener('end', () => (this.dragging = false));
    c.addEventListener('change', () => viewer.requestRender());
    this.controls = c;
  }

  // Keeps rendering while the user drags and until damping settles.
  private readonly tick = (): boolean => this.controls.update() || this.dragging;

  /** Computes the default view that frames `box`, and clamps zoom around it. */
  setHome(box: THREE.Box3): void {
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const fov = THREE.MathUtils.degToRad(this.viewer.camera.fov);
    const distance = (sphere.radius / Math.sin(fov / 2)) * 1.1;
    this.homeView = {
      target: sphere.center.clone(),
      position: sphere.center.clone().addScaledVector(HOME_DIRECTION, distance),
    };
    // Zoom stops before the camera can enter the model, and before it gets lost.
    this.controls.minDistance = sphere.radius * 0.35;
    this.controls.maxDistance = distance * 3;
  }

  /** Returns to the default view. */
  home(animate = true): void {
    this.homeAround(this.homeView.target, animate);
  }

  /** The default view's direction and distance, centred on `target` (e.g. a rocket in flight). */
  homeAround(target: THREE.Vector3, animate = true): void {
    const offset = this.homeView.position.clone().sub(this.homeView.target);
    this.moveTo(target.clone().add(offset), target.clone(), animate);
  }

  /** The point the default view looks at. */
  homeTarget(): THREE.Vector3 {
    return this.homeView.target.clone();
  }

  /** Moves camera and orbit target together, keeping the view: used to follow the rocket. */
  shift(delta: THREE.Vector3): void {
    if (delta.lengthSq() === 0) return;
    this.viewer.camera.position.add(delta);
    this.controls.target.add(delta);
    // Keep an ease in progress heading for the moved target, or it would undo the shift.
    if (this.ease) for (const v of Object.values(this.ease)) v.add(delta);
    this.viewer.requestRender();
  }

  /** Frames `box`, keeping the current viewing direction. */
  focus(box: THREE.Box3, animate = true): void {
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const fov = THREE.MathUtils.degToRad(this.viewer.camera.fov);
    const distance = Math.max((sphere.radius / Math.sin(fov / 2)) * 1.3, this.controls.minDistance);
    const dir = this.viewer.camera.position.clone().sub(this.controls.target).normalize();
    this.moveTo(sphere.center.clone().addScaledVector(dir, distance), sphere.center, animate);
  }

  /**
   * Drops any orbit/zoom/pan the damping is still gliding through. Otherwise it would be
   * applied on top of a programmatic camera move, which then misses its target.
   */
  private settle(): void {
    const saved = this.viewer.camera.position.clone();
    const savedTarget = this.controls.target.clone();
    this.controls.enableDamping = false;
    this.controls.update(); // consumes the pending deltas
    this.controls.enableDamping = true;
    this.viewer.camera.position.copy(saved);
    this.controls.target.copy(savedTarget);
  }

  private moveTo(position: THREE.Vector3, target: THREE.Vector3, animate: boolean): void {
    this.settle();
    const cam = this.viewer.camera;
    this.ease = null;
    if (!animate || this.reducedMotion()) {
      cam.position.copy(position);
      this.controls.target.copy(target);
      this.controls.update();
      this.viewer.requestRender();
      return;
    }
    const ease = {
      fromPos: cam.position.clone(),
      toPos: position.clone(),
      fromTarget: this.controls.target.clone(),
      toTarget: target.clone(),
    };
    this.ease = ease;
    let elapsed = 0;
    this.viewer.addTicker((dt) => {
      if (this.ease !== ease) return false; // replaced by a newer move
      elapsed += dt;
      const k = smoothstep(elapsed / EASE_SECONDS);
      cam.position.lerpVectors(ease.fromPos, ease.toPos, k);
      this.controls.target.lerpVectors(ease.fromTarget, ease.toTarget, k);
      cam.lookAt(this.controls.target);
      if (k >= 1) this.ease = null;
      return k < 1;
    });
  }
}
