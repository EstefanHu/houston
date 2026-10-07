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

  home(animate = true): void {
    this.moveTo(this.homeView.position, this.homeView.target, animate);
  }

  /** Frames `box`, keeping the current viewing direction. */
  focus(box: THREE.Box3, animate = true): void {
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const fov = THREE.MathUtils.degToRad(this.viewer.camera.fov);
    const distance = Math.max((sphere.radius / Math.sin(fov / 2)) * 1.3, this.controls.minDistance);
    const dir = this.viewer.camera.position.clone().sub(this.controls.target).normalize();
    this.moveTo(sphere.center.clone().addScaledVector(dir, distance), sphere.center, animate);
  }

  private moveTo(position: THREE.Vector3, target: THREE.Vector3, animate: boolean): void {
    const cam = this.viewer.camera;
    if (!animate || this.reducedMotion()) {
      cam.position.copy(position);
      this.controls.target.copy(target);
      this.controls.update();
      this.viewer.requestRender();
      return;
    }
    const fromPos = cam.position.clone();
    const fromTarget = this.controls.target.clone();
    let elapsed = 0;
    this.viewer.addTicker((dt) => {
      elapsed += dt;
      const k = smoothstep(elapsed / EASE_SECONDS);
      cam.position.lerpVectors(fromPos, position, k);
      this.controls.target.lerpVectors(fromTarget, target, k);
      cam.lookAt(this.controls.target);
      return k < 1;
    });
  }
}
