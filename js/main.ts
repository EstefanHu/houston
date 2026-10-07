import { Vector3 } from 'three';
import { rocket } from './data/rocket';
import { createReducer, flightActive, initialState } from './state/reducer';
import { createStore } from './state/store';
import { CameraRig } from './scene/cameraRig';
import { buildPlaceholderRocket } from './scene/placeholderRocket';
import { FlightDirector } from './scene/flightDirector';
import { attachPicker } from './scene/picker';
import { RocketRig } from './scene/rocketRig';
import { Viewer } from './scene/viewer';
import { mountExplode } from './ui/explode';
import { mountFlightControls } from './ui/flightControls';
import { mountInfoCard } from './ui/infoCard';
import { mountPanel } from './ui/panel';
import { mountPartsTree } from './ui/partsTree';
import { mountStatusStrip } from './ui/statusStrip';

declare global {
  interface Window {
    /** Read-only hooks for the Playwright tests in e2e/. Only defined in dev builds. */
    houstonTestHooks?: {
      cameraPosition(): [number, number, number];
      explode(): number;
      part(id: string): { position: [number, number, number]; shown: boolean; highlighted: boolean };
      selected(): string | null;
      /** Where a part's centre is on screen, in CSS pixels, for clicking it. */
      screenPoint(id: string): { x: number; y: number };
      flight(): { t: number; phase: string; playing: boolean; speed: number };
      exhaust(id: string): boolean;
      frames(): number;
    };
  }
}

function el<T extends HTMLElement>(selector: string): T {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing element ${selector}`);
  return found;
}

const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const store = createStore(initialState(rocket, motionQuery.matches), createReducer(rocket));
motionQuery.addEventListener('change', (e) => store.dispatch({ type: 'setReducedMotion', value: e.matches }));

const panel = mountPanel({
  panel: el('[data-panel]'),
  header: el('[data-panel-header]'),
  toggle: el('[data-panel-toggle]'),
  toggleLabel: el('[data-panel-toggle-label]'),
  body: el('[data-panel-body]'),
});
store.subscribe((s, prev) => {
  if (s.selected !== null && s.selected !== prev.selected) panel.makeRoomForCard();
});

mountStatusStrip({
  vehicle: el('[data-vehicle-name]'),
  phase: el('[data-mission-phase]'),
  timer: el('[data-mission-timer]'),
}, rocket, store);
mountFlightControls({
  primary: el('[data-flight-primary]'),
  stop: el('[data-flight-stop]'),
  speeds: [...document.querySelectorAll<HTMLInputElement>('[data-flight-speed]')],
  scrub: el('[data-flight-scrub]'),
  markers: el('[data-flight-markers]'),
  eventTitle: el('[data-flight-event]'),
  caption: el('[data-flight-caption]'),
  note: el('[data-flight-note]'),
  events: el('[data-flight-events]'),
}, rocket, store);

mountExplode({
  slider: el('[data-explode-slider]'),
  value: el('[data-explode-value]'),
  reset: el('[data-explode-reset]'),
  note: el('[data-explode-note]'),
}, store);
mountPartsTree(el('[data-parts-tree]'), el('[data-show-all]'), rocket, store);
mountInfoCard({
  card: el('[data-info-card]'),
  stage: el('[data-info-stage]'),
  title: el('[data-info-title]'),
  body: el('[data-info-body]'),
  close: el('[data-info-close]'),
  status: el('[data-selection-status]'),
}, rocket, store);

const loading = el('[data-loading]');

function startScene(): void {
  const viewer = new Viewer(el('[data-canvas-host]'));
  panel.onInset((px) => viewer.setBottomInset(px));
  const rig = new RocketRig(rocket, buildPlaceholderRocket(rocket), viewer, store);
  viewer.scene.add(rig.model);

  const camera = new CameraRig(viewer, () => store.get().reducedMotion);
  camera.setHome(rig.bounds());
  camera.home(false);
  // In flight, "home" is the default view around wherever the rocket has climbed to.
  el('[data-home]').addEventListener('click', () => camera.home(true, rig.model.position.clone().setX(0).setZ(0)));

  // Re-frame when the rocket has grown or shrunk a lot, so exploded parts stay in view.
  let framedExplode = store.get().explode;
  rig.onSettle((explode) => {
    if (flightActive(store.get())) framedExplode = explode; // the chase camera is in charge
    if (Math.abs(explode - framedExplode) < 0.35) return;
    framedExplode = explode;
    camera.focus(rig.bounds());
  });

  attachPicker(viewer, rig, (id) => store.dispatch({ type: 'select', id }));
  const flight = new FlightDirector(rocket, viewer, rig, camera, store);

  // Frame the selected part, unless it's hidden (then only its info card shows) or a flight
  // is running (the chase camera is in charge).
  store.subscribe((s, prev) => {
    if (s.selected === prev.selected || s.selected === null || flightActive(s)) return;
    if (rig.isSubtreeShown(s.selected)) camera.focus(rig.partBounds(s.selected));
  });

  if (import.meta.env.DEV) {
    window.houstonTestHooks = {
      cameraPosition: () => viewer.camera.position.toArray(),
      explode: () => store.get().explode,
      part: (id) => {
        const obj = rig.objects.get(id);
        if (!obj) throw new Error(`Unknown part ${id}`);
        return { position: obj.position.toArray(), shown: rig.isShown(id), highlighted: rig.isHighlighted(id) };
      },
      selected: () => store.get().selected,
      flight: () => ({ ...store.get().flight }),
      exhaust: (id) => flight.isExhausting(id),
      frames: () => viewer.frames,
      screenPoint: (id) => {
        const p = rig.partBounds(id).getCenter(new Vector3()).project(viewer.camera);
        const rect = viewer.renderer.domElement.getBoundingClientRect();
        return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height };
      },
    };
  }

  void viewer.rendered().then(() => loading.classList.add('loading--done'));
}

try {
  startScene();
} catch (err) {
  console.error(err);
  loading.hidden = true;
  el('[data-home]').hidden = true;
  el('[data-webgl-notice]').hidden = false;
}
