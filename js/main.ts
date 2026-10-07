import { Vector3 } from 'three';
import { rocket } from './data/rocket';
import { formatMissionTime } from './motion/timeline';
import { createReducer, initialState } from './state/reducer';
import { createStore } from './state/store';
import { CameraRig } from './scene/cameraRig';
import { buildPlaceholderRocket } from './scene/placeholderRocket';
import { attachPicker } from './scene/picker';
import { RocketRig } from './scene/rocketRig';
import { Viewer } from './scene/viewer';
import { mountExplode } from './ui/explode';
import { mountInfoCard } from './ui/infoCard';
import { mountPartsTree } from './ui/partsTree';

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

el('[data-vehicle-name]').textContent = rocket.name;
const timer = el('[data-mission-timer]');
const renderTimer = () => (timer.textContent = formatMissionTime(store.get().flight.t));
renderTimer();
store.subscribe((s, prev) => {
  if (s.flight.t !== prev.flight.t) renderTimer();
});

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
  const rig = new RocketRig(rocket, buildPlaceholderRocket(rocket), viewer, store);
  viewer.scene.add(rig.model);

  const camera = new CameraRig(viewer, () => store.get().reducedMotion);
  camera.setHome(rig.bounds());
  camera.home(false);
  el('[data-home]').addEventListener('click', () => camera.home());

  // Re-frame when the rocket has grown or shrunk a lot, so exploded parts stay in view.
  let framedExplode = store.get().explode;
  rig.onSettle((explode) => {
    if (Math.abs(explode - framedExplode) < 0.35) return;
    framedExplode = explode;
    camera.focus(rig.bounds());
  });

  attachPicker(viewer, rig, (id) => store.dispatch({ type: 'select', id }));
  // Frame the selected part, unless it's hidden (then only its info card shows).
  store.subscribe((s, prev) => {
    if (s.selected === prev.selected || s.selected === null) return;
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
