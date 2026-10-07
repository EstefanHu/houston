import { describe, expect, it } from 'vitest';
import rocketJson from '../js/data/rocket.json';
import { RocketDataError, ancestorsOf, descendantsOf, parseRocket } from '../js/data/parts';

const clone = (): any => structuredClone(rocketJson);

describe('parseRocket', () => {
  it('accepts the shipped rocket.json', () => {
    const r = parseRocket(rocketJson);
    expect(r.parts.length).toBeGreaterThan(0);
    for (const p of r.parts) expect(p.info.summary).not.toBe('');
  });

  it.each([
    ['missing name', (j: any) => { delete j.parts[0].name; }, /parts\[0\]\.name/],
    ['bad stage', (j: any) => { j.parts[0].stage = 3; }, /parts\[0\]\.stage/],
    ['short offset', (j: any) => { j.parts[0].explodeOffset = [0, 1]; }, /explodeOffset/],
    ['NaN offset', (j: any) => { j.parts[0].explodeOffset = [0, null, 0]; }, /explodeOffset\[1\]/],
    ['duplicate id', (j: any) => { j.parts[1].id = j.parts[0].id; }, /duplicate id/],
    ['duplicate mesh', (j: any) => { j.parts[1].meshName = j.parts[0].meshName; }, /duplicate meshName/],
    ['unknown parent', (j: any) => { j.parts[1].parent = 'nope'; }, /unknown part "nope"/],
    ['cycle', (j: any) => { j.parts[0].parent = 'stage1.engines'; }, /cycle/],
    ['bad event', (j: any) => { j.parts[0].flightEvents[0].event = 'explode'; }, /unknown event/],
    ['bad spec value', (j: any) => { j.parts[0].info.specs.Height = 42; }, /specs\.Height/],
    ['unsorted timeline', (j: any) => { j.flight.events.reverse(); }, /sorted/],
    ['event out of range', (j: any) => { j.flight.events[0].t = -99; }, /outside/],
    ['bad phase', (j: any) => { j.flight.events[0].phase = 'idle'; }, /unknown phase/],
  ])('rejects %s', (_label, mutate, message) => {
    const j = clone();
    mutate(j);
    expect(() => parseRocket(j)).toThrow(RocketDataError);
    expect(() => parseRocket(j)).toThrow(message);
  });

  it('allows a part with no optional info', () => {
    const j = clone();
    j.parts[0].info = { summary: 's', purpose: 'p' };
    expect(parseRocket(j).parts[0]?.info).toEqual({ summary: 's', purpose: 'p' });
  });
});

describe('tree helpers', () => {
  const { parts } = parseRocket(rocketJson);
  it('finds descendants', () => {
    expect(descendantsOf(parts, 'payload').sort()).toEqual(
      ['payload.fairing.left', 'payload.fairing.right', 'payload.satellite'],
    );
    expect(descendantsOf(parts, 'payload.satellite')).toEqual([]);
  });
  it('finds ancestors', () => {
    expect(ancestorsOf(parts, 'stage1.engines')).toEqual(['stage1']);
    expect(ancestorsOf(parts, 'stage1')).toEqual([]);
  });
});
