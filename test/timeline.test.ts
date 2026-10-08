import { describe, expect, it } from 'vitest';
import { rocket } from './fixtures';
import type { Part } from '../js/data/parts';
import {
  altitudeAt, currentEvent, followAt, formatMissionTime, interpolate, isBurning, partPoseAt, phaseAt,
} from '../js/motion/timeline';
import { approach, explodeOffsetAt, smoothstep } from '../js/motion/explode';

const part = (id: string): Part => {
  const p = rocket.parts.find((x) => x.id === id);
  if (!p) throw new Error(id);
  return p;
};

describe('phaseAt / currentEvent', () => {
  const f = rocket.flight;
  it.each([
    [-10, 'countdown'], [-0.1, 'countdown'], [0, 'ascent'], [100, 'ascent'],
    [150, 'stage-sep'], [160, 'second-stage'], [200, 'fairing-sep'], [300, 'second-stage'], [510, 'orbit'],
  ])('t=%s is %s', (t, phase) => {
    expect(phaseAt(f, t)).toBe(phase);
  });
  it('returns the latest event at or before t', () => {
    expect(currentEvent(f, 62)?.title).toBe('Max-Q');
    expect(currentEvent(f, 61.9)?.title).toBe('Liftoff');
    expect(currentEvent(f, -20)).toBeNull();
  });
});

describe('formatMissionTime', () => {
  it.each([
    [-10, 'T-00:10'], [-0.5, 'T-00:01'], [0, 'T+00:00'], [62.9, 'T+01:02'], [510, 'T+08:30'],
  ])('%s → %s', (t, label) => expect(formatMissionTime(t)).toBe(label));
});

describe('partPoseAt', () => {
  it('is zero before separation and drifts after', () => {
    const s1 = part('stage1');
    expect(partPoseAt(s1, 153)).toEqual({ offset: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], detached: false, frame: 'stack' });
    const sep = s1.flightEvents?.find((e) => e.event === 'separate');
    const pose = partPoseAt(s1, 163);
    expect(pose.detached).toBe(true);
    expect(pose.offset[1]).toBeCloseTo((sep?.velocity?.[1] ?? 0) * 10);
    expect(pose.rotation[0]).toBeCloseTo((sep?.spin?.[0] ?? 0) * 10);
    expect(pose.offset[1]).toBeLessThan(0); // falls behind the stack
  });
  it('is deterministic, so scrubbing back re-docks', () => {
    const f = part('payload.fairing.left');
    expect(partPoseAt(f, 300)).toEqual(partPoseAt(f, 300));
    expect(partPoseAt(f, 199).detached).toBe(false);
  });
  it('never moves parts without a separation event', () => {
    expect(partPoseAt(part('payload.satellite'), 500).detached).toBe(false);
  });
});

describe('isBurning', () => {
  it('tracks ignite/shutdown windows', () => {
    const e1 = part('stage1.engines');
    expect(isBurning(e1, -4)).toBe(false);
    expect(isBurning(e1, 0)).toBe(true);
    expect(isBurning(e1, 150)).toBe(false);
    const e2 = part('stage2.engine');
    expect(isBurning(e2, 159)).toBe(false);
    expect(isBurning(e2, 400)).toBe(true);
    expect(isBurning(part('payload.satellite'), 10)).toBe(false);
  });
});

describe('interpolate', () => {
  const times = [0, 10, 20, 30];
  it('passes through every key and holds outside them', () => {
    const values = [0, 5, 20, 10];
    times.forEach((t, i) => expect(interpolate(times, values, t)).toBeCloseTo(values[i]!));
    expect(interpolate(times, values, -5)).toBe(0);
    expect(interpolate(times, values, 99)).toBe(10);
  });
  it('never overshoots, so a descent to 0 never goes below ground', () => {
    const values = [0, 100, 100, 0];
    for (let t = 0; t <= 30; t += 0.5) {
      const v = interpolate(times, values, t);
      expect(v).toBeGreaterThanOrEqual(-1e-9); // allow floating-point noise
      expect(v).toBeLessThanOrEqual(100 + 1e-9);
    }
  });
});

describe('altitudeAt', () => {
  it('stays on the pad during countdown and rises monotonically', () => {
    expect(altitudeAt(rocket.flight, -5)).toBe(0);
    expect(altitudeAt(rocket.flight, 10)).toBeLessThan(altitudeAt(rocket.flight, 20));
  });
  it('matches the keys exactly', () => {
    expect(altitudeAt(rocket.flight, 300)).toBeCloseTo(900);
  });
});

describe('followAt', () => {
  const flight = {
    ...rocket.flight,
    events: [
      { t: 0, phase: 'a', phaseLabel: 'A', title: 'A', caption: 'a' },
      { t: 10, phase: 'b', phaseLabel: 'B', title: 'B', caption: 'b', follow: 'stage1' },
      { t: 20, phase: 'c', phaseLabel: 'C', title: 'C', caption: 'c' },
      { t: 30, phase: 'd', phaseLabel: 'D', title: 'D', caption: 'd', follow: 'stack' },
    ],
  };
  it('defaults to the stack and sticks until changed', () => {
    expect(followAt(flight, 5)).toBe('stack');
    expect(followAt(flight, 15)).toBe('stage1');
    expect(followAt(flight, 25)).toBe('stage1');
    expect(followAt(flight, 35)).toBe('stack');
  });
});

describe('tracks and deploys', () => {
  const base: Part = { ...part('stage1'), flightEvents: [] };

  it('a track moves the part along its keys and reports its frame', () => {
    const p: Part = {
      ...base,
      track: { frame: 'world', keys: [{ t: 100, offset: [0, 50, 0] }, { t: 200, offset: [0, 0, 0], rotation: [0, 0, 1] }] },
    };
    expect(partPoseAt(p, 99).detached).toBe(false);
    const mid = partPoseAt(p, 150);
    expect(mid).toMatchObject({ detached: true, frame: 'world' });
    expect(mid.offset[1]).toBeGreaterThan(0);
    expect(mid.offset[1]).toBeLessThan(50);
    expect(partPoseAt(p, 250)).toMatchObject({ offset: [0, 0, 0], rotation: [0, 0, 1] });
  });

  it('a deploy eases rotation and scale in over its duration', () => {
    const p: Part = {
      ...base,
      flightEvents: [{ event: 'deploy', t: 10, duration: 4, rotation: [1, 0, 0], scale: [[0, 0, 0], [2, 2, 2]] }],
    };
    expect(partPoseAt(p, -Infinity)).toMatchObject({ rotation: [0, 0, 0], scale: [0, 0, 0] }); // stowed on the pad
    expect(partPoseAt(p, 12).rotation[0]).toBeCloseTo(0.5);
    expect(partPoseAt(p, 20)).toMatchObject({ rotation: [1, 0, 0], scale: [2, 2, 2], detached: false });
  });

  it('isBurning handles several burns', () => {
    const p: Part = {
      ...base,
      flightEvents: [
        { event: 'shutdown', t: 20 }, { event: 'ignite', t: 0 },   // order in the data doesn't matter
        { event: 'ignite', t: 50 }, { event: 'shutdown', t: 60 },
      ],
    };
    expect([-1, 10, 30, 55, 70].map((t) => isBurning(p, t))).toEqual([false, true, false, true, false]);
  });
});

describe('explode math', () => {
  it('smoothstep is clamped and eased', () => {
    expect(smoothstep(-1)).toBe(0);
    expect(smoothstep(0.5)).toBe(0.5);
    expect(smoothstep(2)).toBe(1);
    expect(smoothstep(0.1)).toBeLessThan(0.1);
  });
  it('scales the offset', () => {
    expect(explodeOffsetAt(part('stage1'), 0).every((v) => v === 0)).toBe(true); // -0 is fine
    expect(explodeOffsetAt(part('stage1'), 1)).toEqual([0, -6, 0]);
  });
  it('approach converges and snaps to the target', () => {
    let x = 0;
    for (let i = 0; i < 120; i++) x = approach(x, 1, 1 / 60);
    expect(x).toBe(1);
    expect(approach(0, 1, 0.01, 0)).toBe(1);
  });
});
