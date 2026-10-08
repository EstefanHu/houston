import * as THREE from 'three';
import type { PartId, Rocket } from '../data/parts';
import { followAt, isBurning } from '../motion/timeline';
import type { RocketStore } from '../state/store';
import type { CameraRig } from './cameraRig';
import type { RocketRig } from './rocketRig';
import { SCHEMATIC } from './viewer';
import type { Viewer } from './viewer';

const SPACE = new THREE.Color(0x02040a);
const SKY = new THREE.Color(SCHEMATIC.background);
/** Altitude (scene units) by which the background has faded fully to space. */
const SPACE_ALTITUDE = 300;

/** An exhaust plume: two additive cones hanging below the engine's origin. */
function makePlume(radius: number): THREE.Group {
  const cone = (r: number, length: number, color: number, opacity: number) => {
    const geo = new THREE.ConeGeometry(r, length, 24, 1, true).rotateX(Math.PI).translate(0, -length / 2, 0);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    return new THREE.Mesh(geo, mat);
  };
  const plume = new THREE.Group();
  plume.name = 'Exhaust';
  plume.add(cone(radius, radius * 6, 0xff8a3d, 0.55), cone(radius * 0.5, radius * 3.5, 0xfff1c4, 0.8));
  plume.visible = false;
  return plume;
}

/**
 * Runs the flight: advances mission time while playing, keeps the camera on the climbing
 * stack, lights the engines' exhaust and fades the sky. Part transforms themselves come from
 * RocketRig, which derives them from mission time.
 */
export class FlightDirector {
  private readonly plumes = new Map<PartId, THREE.Object3D>();
  private readonly lastPoint = new THREE.Vector3();
  private lastFollow: PartId | 'stack' = 'stack';

  constructor(
    private readonly rocket: Rocket,
    private readonly viewer: Viewer,
    private readonly rig: RocketRig,
    private readonly camera: CameraRig,
    private readonly store: RocketStore,
  ) {
    for (const part of rocket.parts) {
      if (!part.flightEvents?.some((e) => e.event === 'ignite')) continue;
      const obj = rig.objects.get(part.id);
      if (!obj) continue;
      const size = rig.partBounds(part.id).getSize(new THREE.Vector3());
      const plume = makePlume(Math.max(size.x, size.z) / 2);
      obj.add(plume);
      this.plumes.set(part.id, plume);
    }
    this.lastPoint.copy(this.chasePoint());

    store.subscribe((s, prev) => {
      const started = prev.flight.phase === 'idle' && s.flight.phase !== 'idle';
      const ended = prev.flight.phase !== 'idle' && s.flight.phase === 'idle';
      if (s.flight.playing && !prev.flight.playing) viewer.addTicker(this.tick);
      if (s.flight.t !== prev.flight.t || s.flight.phase !== prev.flight.phase) this.update(started);
      if (ended) {
        this.lastFollow = 'stack';
        camera.home();
      }
    });

    // Switching tabs pauses the flight rather than letting it run unseen.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') store.dispatch({ type: 'pause' });
    });
  }

  /** Whether a part's exhaust is showing. */
  isExhausting(id: PartId): boolean {
    return this.plumes.get(id)?.visible ?? false;
  }

  private readonly tick = (dt: number): boolean => {
    this.store.dispatch({ type: 'tick', dt });
    if (!this.store.get().reducedMotion) this.flicker();
    return this.store.get().flight.playing;
  };

  /**
   * The point the camera should centre on: what the timeline says to follow (the whole stack
   * by default), in world space. On the pad, that's the default view's target.
   */
  chasePoint(): THREE.Vector3 {
    const { flight } = this.store.get();
    const follow = flight.phase === 'idle' ? 'stack' : followAt(this.rocket.flight, flight.t);
    if (follow !== 'stack') return this.rig.attachedBounds(follow).getCenter(new THREE.Vector3());
    return this.camera.homeTarget().add(new THREE.Vector3(0, this.rig.model.position.y, 0));
  }

  private update(started: boolean): void {
    const { flight } = this.store.get();
    const flying = flight.phase !== 'idle' && flight.phase !== 'aborted';

    // Chase camera. RocketRig has already placed the model for this state, because it
    // subscribed to the store first. Starting (possibly mid-air, when scrubbing from the pad)
    // or switching what to follow re-centres with an ease; otherwise the camera moves with
    // its target, keeping whatever view the user has orbited to.
    const follow = flight.phase === 'idle' ? 'stack' : followAt(this.rocket.flight, flight.t);
    const point = this.chasePoint();
    if (started || follow !== this.lastFollow) this.camera.homeAround(point);
    else if (flight.phase !== 'idle') this.camera.shift(point.clone().sub(this.lastPoint));
    this.lastPoint.copy(point);
    this.lastFollow = follow;

    for (const part of this.rocket.parts) {
      const plume = this.plumes.get(part.id);
      if (plume) plume.visible = flying && isBurning(part, flight.t);
    }

    // The sky darkens with the altitude of whatever the camera is following.
    const altitude = flight.phase === 'idle' ? 0 : Math.max(0, point.y - this.camera.homeTarget().y);
    const k = Math.min(1, altitude / SPACE_ALTITUDE);
    this.viewer.renderer.setClearColor(SKY.clone().lerp(SPACE, k));
    this.viewer.requestRender();
  }

  private flicker(): void {
    for (const plume of this.plumes.values()) {
      if (plume.visible) plume.scale.set(1, 0.9 + Math.random() * 0.2, 1);
    }
  }
}
