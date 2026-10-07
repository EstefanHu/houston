import { flightActive } from '../state/reducer';
import type { RocketStore } from '../state/store';

export interface ExplodeElements {
  slider: HTMLInputElement;
  value: HTMLOutputElement;
  reset: HTMLButtonElement;
  note: HTMLElement;
}

const percent = (v: number) => `${Math.round(v * 100)}%`;

/** Wires the explode slider and Reset button to the store. */
export function mountExplode(els: ExplodeElements, store: RocketStore): void {
  els.slider.addEventListener('input', () => {
    store.dispatch({ type: 'setExplode', value: els.slider.valueAsNumber });
  });
  els.reset.addEventListener('click', () => store.dispatch({ type: 'resetExplode' }));

  const render = (): void => {
    const s = store.get();
    const locked = flightActive(s);
    // Don't rewrite the value mid-drag unless it actually differs (e.g. after Reset).
    if (els.slider.valueAsNumber !== s.explode) els.slider.value = String(s.explode);
    els.slider.setAttribute('aria-valuetext', `${percent(s.explode)} separated`);
    els.value.textContent = percent(s.explode);
    els.slider.disabled = locked;
    els.reset.disabled = locked || s.explode === 0;
    els.note.hidden = !locked;
  };

  render();
  store.subscribe((s, prev) => {
    if (s.explode !== prev.explode || s.flight.phase !== prev.flight.phase) render();
  });
}
