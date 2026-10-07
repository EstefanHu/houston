import type { FlightPhase, Rocket } from '../data/parts';
import { formatMissionTime } from '../motion/timeline';
import type { RocketStore } from '../state/store';

const PHASE_LABEL: Record<FlightPhase, string> = {
  idle: 'On pad',
  countdown: 'Countdown',
  ascent: 'Ascent',
  'stage-sep': 'Staging',
  'second-stage': 'Second stage',
  'fairing-sep': 'Fairing sep',
  orbit: 'Orbit',
  aborted: 'Aborted',
};

export interface StatusStripElements {
  vehicle: HTMLElement;
  phase: HTMLElement;
  timer: HTMLElement;
}

/** Vehicle name, flight phase and mission timer in the top strip. */
export function mountStatusStrip(els: StatusStripElements, rocket: Rocket, store: RocketStore): void {
  els.vehicle.textContent = rocket.name;
  const render = (): void => {
    const { phase, t, playing } = store.get().flight;
    const paused = !playing && phase !== 'idle' && phase !== 'aborted' && phase !== 'orbit';
    els.phase.textContent = PHASE_LABEL[phase] + (paused ? ' · Paused' : '');
    els.timer.textContent = formatMissionTime(t);
  };
  render();
  store.subscribe((s, prev) => {
    if (s.flight !== prev.flight) render();
  });
}
