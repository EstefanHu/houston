import { rocket } from './data/rocket';
import { formatMissionTime } from './motion/timeline';
import { createReducer, initialState } from './state/reducer';
import { createStore } from './state/store';
import { CameraRig } from './scene/cameraRig';
import { buildPlaceholderRocket } from './scene/placeholderRocket';
import { RocketRig } from './scene/rocketRig';
import { Viewer } from './scene/viewer';
import { mountExplode } from './ui/explode';
import { mountPartsTree } from './ui/partsTree';

declare global {
  interface Window {
    /** Read-only hooks for the Playwright tests in e2e/. Only defined in dev builds. */
    houstonTestHooks?: {
      cameraPosition(): [number, number, number];
      explode(): number;
      part(id: string): { position: [number, number, number]; shown: boolean };
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

  if (import.meta.env.DEV) {
    window.houstonTestHooks = {
      cameraPosition: () => viewer.camera.position.toArray(),
      explode: () => store.get().explode,
      part: (id) => {
        const obj = rig.objects.get(id);
        if (!obj) throw new Error(`Unknown part ${id}`);
        return { position: obj.position.toArray(), shown: rig.isShown(id) };
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
