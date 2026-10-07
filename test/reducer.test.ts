import { describe, expect, it, vi } from 'vitest';
import { rocket } from '../js/data/rocket';
import { createReducer, initialState, visibilityOf } from '../js/state/reducer';
import type { RocketState } from '../js/state/reducer';
import type { Action } from '../js/state/actions';
import { createStore } from '../js/state/store';
import type { Listener } from '../js/state/store';

const reduce = createReducer(rocket);
const run = (...actions: Action[]): RocketState => actions.reduce(reduce, initialState(rocket));
const hidden = (s: RocketState) => [...s.hidden].sort();

describe('explode', () => {
  it('clamps and ignores junk', () => {
    expect(run({ type: 'setExplode', value: 2 }).explode).toBe(1);
    expect(run({ type: 'setExplode', value: -1 }).explode).toBe(0);
    expect(run({ type: 'setExplode', value: Number.NaN }).explode).toBe(0);
  });
  it('resets', () => {
    expect(run({ type: 'setExplode', value: 0.7 }, { type: 'resetExplode' }).explode).toBe(0);
  });
  it('is locked while a flight is active', () => {
    const s = run({ type: 'launch' }, { type: 'setExplode', value: 0.5 });
    expect(s.explode).toBe(0);
  });
  it('returns the same state when nothing changes', () => {
    const s = run();
    expect(reduce(s, { type: 'setExplode', value: 0 })).toBe(s);
    expect(reduce(s, { type: 'showAll' })).toBe(s);
    expect(reduce(s, { type: 'tick', dt: 1 })).toBe(s);
  });
});

describe('visibility', () => {
  it('cascades hiding to children and shows a parent as mixed', () => {
    const s = run({ type: 'setVisible', id: 'payload', visible: false });
    expect(hidden(s)).toEqual(['payload', 'payload.fairing.left', 'payload.fairing.right', 'payload.satellite']);
    const s2 = reduce(s, { type: 'setVisible', id: 'payload.satellite', visible: true });
    expect(hidden(s2)).toEqual(['payload.fairing.left', 'payload.fairing.right']);
    expect(visibilityOf(rocket.parts, s2.hidden, 'payload')).toBe('mixed');
    expect(visibilityOf(rocket.parts, s2.hidden, 'payload.fairing.left')).toBe('hidden');
    expect(visibilityOf(rocket.parts, s2.hidden, 'stage1')).toBe('visible');
  });
  it('ignores unknown ids', () => {
    const s = run();
    expect(reduce(s, { type: 'setVisible', id: 'nope', visible: false })).toBe(s);
    expect(reduce(s, { type: 'isolate', id: 'nope' })).toBe(s);
    expect(reduce(s, { type: 'select', id: 'nope' })).toBe(s);
  });
  it('clears the selection when the selected part is hidden', () => {
    const s = run({ type: 'select', id: 'stage1.fins' }, { type: 'setVisible', id: 'stage1', visible: false });
    expect(s.selected).toBeNull();
  });
});

describe('isolate', () => {
  it('hides everything except the part, its descendants and ancestors', () => {
    const s = run({ type: 'isolate', id: 'stage2' });
    expect(s.isolated).toBe('stage2');
    for (const id of ['stage2', 'stage2.engine', 'stage2.tanks', 'stage2.avionics']) expect(s.hidden.has(id)).toBe(false);
    expect(s.hidden.has('stage1')).toBe(true);
    expect(s.hidden.has('payload.satellite')).toBe(true);
    expect(visibilityOf(rocket.parts, run({ type: 'isolate', id: 'stage1.fins' }).hidden, 'stage1')).toBe('mixed');
  });
  it('isolating the same part again restores the previous visibility', () => {
    const before = run({ type: 'setVisible', id: 'stage1.fins', visible: false });
    const s = [{ type: 'isolate', id: 'payload' }, { type: 'isolate', id: 'stage2' }, { type: 'isolate', id: 'stage2' }]
      .reduce((st, a) => reduce(st, a as Action), before);
    expect(hidden(s)).toEqual(['stage1.fins']);
    expect(s.isolated).toBeNull();
  });
  it('show all clears isolation', () => {
    const s = run({ type: 'isolate', id: 'stage2' }, { type: 'showAll' });
    expect(s.hidden.size).toBe(0);
    expect(s.isolated).toBeNull();
  });
});

describe('flight', () => {
  it('launch resets explode and visibility and starts the countdown', () => {
    const s = run({ type: 'setExplode', value: 1 }, { type: 'isolate', id: 'stage2' }, { type: 'launch' });
    expect(s.explode).toBe(0);
    expect(s.hidden.size).toBe(0);
    expect(s.isolated).toBeNull();
    expect(s.flight).toMatchObject({ phase: 'countdown', t: -10, playing: true });
  });
  it('tick advances by dt × speed and updates the phase', () => {
    const s = run({ type: 'launch' }, { type: 'setSpeed', speed: 4 }, { type: 'tick', dt: 5 });
    expect(s.flight.t).toBe(10);
    expect(s.flight.phase).toBe('ascent');
  });
  it('stops playing at the end of the timeline', () => {
    const s = run({ type: 'launch' }, { type: 'tick', dt: 10_000 });
    expect(s.flight).toMatchObject({ t: 510, phase: 'orbit', playing: false });
    expect(reduce(s, { type: 'resume' })).toBe(s);
  });
  it('pause and resume', () => {
    const p = run({ type: 'launch' }, { type: 'pause' });
    expect(p.flight.playing).toBe(false);
    expect(reduce(p, { type: 'tick', dt: 1 })).toBe(p);
    expect(reduce(p, { type: 'resume' }).flight.playing).toBe(true);
  });
  it('scrubbing is clamped and can go backwards', () => {
    const fwd = run({ type: 'launch' }, { type: 'pause' }, { type: 'scrub', t: 205 });
    expect(fwd.flight.phase).toBe('fairing-sep');
    const back = reduce(fwd, { type: 'scrub', t: 100 });
    expect(back.flight).toMatchObject({ t: 100, phase: 'ascent', playing: false });
    expect(reduce(back, { type: 'scrub', t: 9999 }).flight.t).toBe(510);
  });
  it('scrubbing from idle enters the flight paused', () => {
    const s = run({ type: 'setExplode', value: 1 }, { type: 'scrub', t: 60 });
    expect(s.explode).toBe(0);
    expect(s.flight).toMatchObject({ phase: 'ascent', playing: false });
  });
  it('abort freezes the flight, reset returns to idle', () => {
    const a = run({ type: 'launch' }, { type: 'tick', dt: 20 }, { type: 'abort' });
    expect(a.flight).toMatchObject({ phase: 'aborted', playing: false });
    expect(reduce(a, { type: 'resume' })).toBe(a);
    expect(reduce(a, { type: 'scrub', t: 50 })).toBe(a);
    const r = reduce(a, { type: 'resetFlight' });
    expect(r.flight).toMatchObject({ phase: 'idle', t: -10, playing: false });
    expect(reduce(r, { type: 'setExplode', value: 0.5 }).explode).toBe(0.5);
  });
});

describe('store', () => {
  it('notifies only on change, with prev state', () => {
    const store = createStore(initialState(rocket), reduce);
    const fn = vi.fn<Listener>();
    const off = store.subscribe(fn);
    store.dispatch({ type: 'select', id: 'stage2' });
    store.dispatch({ type: 'select', id: 'stage2' });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0]?.[1].selected).toBeNull();
    off();
    store.dispatch({ type: 'select', id: null });
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('queues dispatches made from inside a listener', () => {
    const store = createStore(initialState(rocket), reduce);
    const seen: (string | null)[] = [];
    store.subscribe((s) => {
      seen.push(s.selected);
      if (s.selected === 'stage1') store.dispatch({ type: 'select', id: 'stage2' });
    });
    store.subscribe((s) => seen.push(`b:${s.selected}`));
    store.dispatch({ type: 'select', id: 'stage1' });
    expect(seen).toEqual(['stage1', 'b:stage1', 'stage2', 'b:stage2']);
    expect(store.get().selected).toBe('stage2');
  });
});
