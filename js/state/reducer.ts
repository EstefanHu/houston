import { ancestorsOf, descendantsOf } from '../data/parts';
import type { FlightPhase, Part, PartId, Rocket } from '../data/parts';
import { phaseAt } from '../motion/timeline';
import type { Action, Speed } from './actions';

export interface RocketState {
  explode: number;                 // 0..1
  hidden: ReadonlySet<PartId>;
  isolated: PartId | null;
  /** Visibility to restore when the isolated part is isolated again. */
  hiddenBeforeIsolate: ReadonlySet<PartId> | null;
  selected: PartId | null;
  flight: {
    phase: FlightPhase;
    t: number;                     // seconds, negative during countdown
    playing: boolean;
    speed: Speed;
  };
  reducedMotion: boolean;
}

export type Reducer = (state: RocketState, action: Action) => RocketState;

const EMPTY: ReadonlySet<PartId> = new Set();

export function initialState(rocket: Rocket, reducedMotion = false): RocketState {
  return {
    explode: 0,
    hidden: EMPTY,
    isolated: null,
    hiddenBeforeIsolate: null,
    selected: null,
    flight: { phase: 'idle', t: rocket.flight.start, playing: false, speed: 1 },
    reducedMotion,
  };
}

/** Checkbox state for a tree row: a parent is `mixed` when its subtree is partly hidden. */
export function visibilityOf(
  parts: readonly Part[],
  hidden: ReadonlySet<PartId>,
  id: PartId,
): 'visible' | 'hidden' | 'mixed' {
  const subtree = [id, ...descendantsOf(parts, id)];
  const hiddenCount = subtree.filter((p) => hidden.has(p)).length;
  if (hiddenCount === 0) return 'visible';
  return hiddenCount === subtree.length ? 'hidden' : 'mixed';
}

/** Whether the flight owns the part transforms, which locks the explode slider. */
export function flightActive(state: RocketState): boolean {
  return state.flight.phase !== 'idle';
}

function setsEqual(a: ReadonlySet<PartId>, b: ReadonlySet<PartId>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/**
 * Builds the pure reducer for a rocket. Returns the same state object when an action
 * changes nothing, so subscribers can skip work.
 */
export function createReducer(rocket: Rocket): Reducer {
  const { parts, flight: timeline } = rocket;
  const ids = new Set(parts.map((p) => p.id));

  // Clears the selection if the selected part just became hidden.
  function withHidden(state: RocketState, hidden: ReadonlySet<PartId>, patch: Partial<RocketState> = {}): RocketState {
    const sameHidden = setsEqual(hidden, state.hidden);
    const next = { ...state, ...patch, hidden: sameHidden ? state.hidden : hidden };
    if (next.selected !== null && next.hidden.has(next.selected)) next.selected = null;
    const changed = !sameHidden || (Object.keys(patch) as (keyof RocketState)[]).some((k) => patch[k] !== state[k]);
    return changed ? next : state;
  }

  // Starting or scrubbing into a flight shows everything and collapses the explode.
  function enterFlight(state: RocketState): RocketState {
    return { ...state, explode: 0, hidden: EMPTY, isolated: null, hiddenBeforeIsolate: null };
  }

  function clampT(t: number): number {
    return Math.min(timeline.end, Math.max(timeline.start, t));
  }

  function withTime(state: RocketState, t: number, playing: boolean): RocketState {
    const ct = clampT(t);
    const atEnd = ct >= timeline.end;
    const f = { ...state.flight, t: ct, phase: phaseAt(timeline, ct), playing: playing && !atEnd };
    const same = f.t === state.flight.t && f.phase === state.flight.phase && f.playing === state.flight.playing;
    return same ? state : { ...state, flight: f };
  }

  return function reduce(state, action) {
    switch (action.type) {
      case 'setExplode': {
        if (flightActive(state) || !Number.isFinite(action.value)) return state;
        const value = Math.min(1, Math.max(0, action.value));
        return value === state.explode ? state : { ...state, explode: value };
      }
      case 'resetExplode':
        if (flightActive(state) || state.explode === 0) return state;
        return { ...state, explode: 0 };

      case 'setVisible': {
        if (!ids.has(action.id)) return state;
        const hidden = new Set(state.hidden);
        const subtree = [action.id, ...descendantsOf(parts, action.id)];
        if (action.visible) {
          // Showing a child also un-hides its ancestors so the tree stays consistent.
          for (const id of [...subtree, ...ancestorsOf(parts, action.id)]) hidden.delete(id);
        } else {
          for (const id of subtree) hidden.add(id);
        }
        return withHidden(state, hidden, { isolated: null, hiddenBeforeIsolate: null });
      }

      case 'isolate': {
        if (!ids.has(action.id)) return state;
        if (state.isolated === action.id) {
          return withHidden(state, state.hiddenBeforeIsolate ?? EMPTY, { isolated: null, hiddenBeforeIsolate: null });
        }
        const keep = new Set([action.id, ...descendantsOf(parts, action.id), ...ancestorsOf(parts, action.id)]);
        // Ancestors are kept so their tree rows show as mixed rather than hidden.
        const hidden = new Set(parts.filter((p) => !keep.has(p.id)).map((p) => p.id));
        return withHidden(state, hidden, {
          isolated: action.id,
          hiddenBeforeIsolate: state.isolated === null ? state.hidden : state.hiddenBeforeIsolate,
        });
      }

      case 'showAll':
        return withHidden(state, EMPTY, { isolated: null, hiddenBeforeIsolate: null });

      case 'select': {
        if (action.id !== null && !ids.has(action.id)) return state;
        return action.id === state.selected ? state : { ...state, selected: action.id };
      }

      case 'launch': {
        if (state.flight.phase !== 'idle') return state;
        return withTime(enterFlight(state), timeline.start, true);
      }
      case 'pause':
        return state.flight.playing ? { ...state, flight: { ...state.flight, playing: false } } : state;
      case 'resume': {
        const { phase, t, playing } = state.flight;
        if (playing || phase === 'idle' || phase === 'aborted' || t >= timeline.end) return state;
        return { ...state, flight: { ...state.flight, playing: true } };
      }
      case 'setSpeed':
        return action.speed === state.flight.speed ? state : { ...state, flight: { ...state.flight, speed: action.speed } };

      case 'scrub': {
        if (!Number.isFinite(action.t) || state.flight.phase === 'aborted') return state;
        const base = state.flight.phase === 'idle' ? enterFlight(state) : state;
        return withTime(base, action.t, state.flight.playing);
      }
      case 'tick': {
        if (!state.flight.playing || !(action.dt > 0)) return state;
        return withTime(state, state.flight.t + action.dt * state.flight.speed, true);
      }

      case 'abort': {
        const { phase } = state.flight;
        if (phase === 'idle' || phase === 'aborted') return state;
        return { ...state, flight: { ...state.flight, phase: 'aborted', playing: false } };
      }
      case 'resetFlight':
        if (state.flight.phase === 'idle') return state;
        return { ...state, flight: { ...state.flight, phase: 'idle', t: timeline.start, playing: false } };

      case 'setReducedMotion':
        return action.value === state.reducedMotion ? state : { ...state, reducedMotion: action.value };
    }
  };
}
