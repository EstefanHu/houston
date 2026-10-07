import type { Action } from './actions';
import type { Reducer, RocketState } from './reducer';

export type Listener = (s: RocketState, prev: RocketState) => void;

export interface RocketStore {
  get(): RocketState;
  subscribe(fn: Listener): () => void;
  dispatch(action: Action): void;
}

export function createStore(initial: RocketState, reduce: Reducer): RocketStore {
  let state = initial;
  const listeners = new Set<Listener>();
  let dispatching = false;
  const queue: Action[] = [];

  return {
    get: () => state,

    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    dispatch(action) {
      // A listener may dispatch (e.g. the scene reacting to a selection). Queue it so
      // every listener sees each state transition in order.
      queue.push(action);
      if (dispatching) return;
      dispatching = true;
      try {
        for (let a = queue.shift(); a !== undefined; a = queue.shift()) {
          const prev = state;
          state = reduce(prev, a);
          if (state !== prev) for (const fn of [...listeners]) fn(state, prev);
        }
      } finally {
        dispatching = false;
        queue.length = 0;
      }
    },
  };
}
