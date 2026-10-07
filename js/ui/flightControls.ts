import type { Rocket } from '../data/parts';
import { currentEvent, formatMissionTime } from '../motion/timeline';
import type { Speed } from '../state/actions';
import type { RocketState } from '../state/reducer';
import type { RocketStore } from '../state/store';

export interface FlightElements {
  primary: HTMLButtonElement;       // Launch / Pause / Resume
  stop: HTMLButtonElement;          // Abort / Reset
  speeds: HTMLInputElement[];       // radio buttons, value 1 | 2 | 4
  scrub: HTMLInputElement;
  markers: HTMLElement;
  eventTitle: HTMLElement;
  caption: HTMLElement;
  note: HTMLElement;
  events: HTMLOListElement;
}

const IDLE_CAPTION = 'Ready on the pad. Press Launch to start the countdown.';
const ABORT_CAPTION = 'Flight aborted. Press Reset to return to the pad.';

/** Wires the flight panel: transport buttons, speed, scrub bar, captions and the event list. */
export function mountFlightControls(els: FlightElements, rocket: Rocket, store: RocketStore): void {
  const { flight: timeline } = rocket;
  const span = timeline.end - timeline.start;
  const finished = (s: RocketState) => s.flight.t >= timeline.end;

  // Transport
  els.primary.addEventListener('click', () => {
    const { phase, playing } = store.get().flight;
    if (phase === 'idle') store.dispatch({ type: 'launch' });
    else store.dispatch({ type: playing ? 'pause' : 'resume' });
  });
  els.stop.addEventListener('click', () => {
    const s = store.get();
    store.dispatch({ type: s.flight.phase === 'aborted' || finished(s) ? 'resetFlight' : 'abort' });
  });
  for (const radio of els.speeds) {
    radio.addEventListener('change', () => {
      if (radio.checked) store.dispatch({ type: 'setSpeed', speed: Number(radio.value) as Speed });
    });
  }

  // Scrub bar. Dragging pauses playback and resumes it afterwards, so the clock doesn't fight
  // the user's hand.
  els.scrub.min = String(timeline.start);
  els.scrub.max = String(timeline.end);
  els.scrub.step = '1';
  let resumeAfterScrub = false;
  els.scrub.addEventListener('pointerdown', () => {
    resumeAfterScrub = store.get().flight.playing;
    if (resumeAfterScrub) store.dispatch({ type: 'pause' });
  });
  const endScrub = () => {
    if (resumeAfterScrub) store.dispatch({ type: 'resume' });
    resumeAfterScrub = false;
  };
  els.scrub.addEventListener('pointerup', endScrub);
  els.scrub.addEventListener('pointercancel', endScrub);
  els.scrub.addEventListener('input', () => store.dispatch({ type: 'scrub', t: els.scrub.valueAsNumber }));

  // Event markers on the bar (visual only) and the event list (clickable, for everyone).
  const items = timeline.events.map((e) => {
    const marker = document.createElement('span');
    marker.className = 'flight__marker';
    marker.style.left = `${((e.t - timeline.start) / span) * 100}%`;
    marker.title = e.title;
    els.markers.append(marker);

    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'flight__event-button';
    const time = document.createElement('span');
    time.className = 'flight__event-time';
    time.textContent = formatMissionTime(e.t);
    const title = document.createElement('span');
    title.textContent = e.title;
    button.append(time, title);
    button.addEventListener('click', () => store.dispatch({ type: 'scrub', t: e.t }));
    li.append(button);
    els.events.append(li);
    return { event: e, button };
  });

  let shownCaption = '';
  const render = (): void => {
    const s = store.get();
    const { phase, playing, t, speed } = s.flight;
    const idle = phase === 'idle';
    const aborted = phase === 'aborted';
    const done = finished(s);

    els.primary.textContent = idle ? 'Launch' : playing ? 'Pause' : 'Resume';
    els.primary.disabled = aborted || (!idle && done);
    els.stop.textContent = aborted || done ? 'Reset' : 'Abort';
    els.stop.disabled = idle;
    for (const radio of els.speeds) radio.checked = Number(radio.value) === speed;

    const current = idle ? null : currentEvent(timeline, t);
    if (els.scrub.valueAsNumber !== t) els.scrub.value = String(t);
    els.scrub.disabled = aborted;
    els.scrub.setAttribute('aria-valuetext', `${formatMissionTime(t)}${current ? `, ${current.title}` : ''}`);

    // Only touch the caption (an aria-live region) when it changes, so screen readers
    // announce each event once rather than on every clock tick.
    const title = aborted ? 'Aborted' : current?.title ?? 'On the pad';
    const caption = aborted ? ABORT_CAPTION : current?.caption ?? IDLE_CAPTION;
    if (caption !== shownCaption) {
      els.eventTitle.textContent = title;
      els.caption.textContent = caption;
      shownCaption = caption;
    }

    for (const { event, button } of items) {
      if (current === event) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    }
    if (idle) els.note.hidden = true;
  };

  render();
  store.subscribe((s, prev) => {
    // Tell the user when launching undid their explode or visibility changes.
    if (prev.flight.phase === 'idle' && s.flight.phase !== 'idle' &&
        (prev.explode > 0 || prev.hidden.size > 0)) {
      els.note.textContent = 'The rocket was reassembled and all parts shown for the flight.';
      els.note.hidden = false;
    }
    if (s.flight !== prev.flight) render();
  });
}
