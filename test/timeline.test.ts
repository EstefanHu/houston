import { describe, expect, it } from 'vitest';
import { rocket } from '../js/data/rocket';
import type { Part } from '../js/data/parts';
import { currentEvent, formatMissionTime, isBurning, partPoseAt, phaseAt, stackAltitudeAt } from '../js/motion/timeline';
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
    expect(partPoseAt(s1, 153)).toEqual({ offset: [0, 0, 0], rotation: [0, 0, 0], detached: false });
    const pose = partPoseAt(s1, 163);
    expect(pose.detached).toBe(true);
    expect(pose.offset[1]).toBeCloseTo(-60);
    expect(pose.rotation[0]).toBeCloseTo(2.5);
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

describe('stackAltitudeAt', () => {
  it('stays on the pad during countdown and rises monotonically', () => {
    expect(stackAltitudeAt(-5)).toBe(0);
    expect(stackAltitudeAt(10)).toBeLessThan(stackAltitudeAt(20));
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
