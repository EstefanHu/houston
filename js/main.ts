import { rocket } from './data/rocket';
import { formatMissionTime } from './motion/timeline';
import { createReducer, initialState } from './state/reducer';
import { createStore } from './state/store';
import { CameraRig } from './scene/cameraRig';
import { buildPlaceholderRocket } from './scene/placeholderRocket';
import { RocketRig } from './scene/rocketRig';
import { Viewer } from './scene/viewer';

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

const loading = el('[data-loading]');

function startScene(): void {
  const viewer = new Viewer(el('[data-canvas-host]'));
  const rig = new RocketRig(rocket, buildPlaceholderRocket(rocket));
  viewer.scene.add(rig.model);

  const camera = new CameraRig(viewer, () => store.get().reducedMotion);
  camera.setHome(rig.bounds());
  camera.home(false);
  el('[data-home]').addEventListener('click', () => camera.home());

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
