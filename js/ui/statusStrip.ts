import type { Rocket } from '../data/parts';
import { currentEvent, formatMissionTime } from '../motion/timeline';
import type { RocketStore } from '../state/store';

export interface StatusStripElements {
  phase: HTMLElement;
  timer: HTMLElement;
}

/** Flight phase and mission timer in the top strip. (The rocket picker is mounted separately.) */
export function mountStatusStrip(els: StatusStripElements, rocket: Rocket, store: RocketStore): void {
  const render = (): void => {
    const { phase, t, playing } = store.get().flight;
    const label = phase === 'idle' ? 'On pad'
      : phase === 'aborted' ? 'Aborted'
      : currentEvent(rocket.flight, t)?.phaseLabel ?? '';
    const paused = !playing && phase !== 'idle' && phase !== 'aborted' && t < rocket.flight.end;
    els.phase.textContent = label + (paused ? ' · Paused' : '');
    els.timer.textContent = formatMissionTime(t);
  };
  render();
  store.subscribe((s, prev) => {
    if (s.flight !== prev.flight) render();
  });
}
