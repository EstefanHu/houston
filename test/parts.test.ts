import { describe, expect, it } from 'vitest';
import rocketJson from '../js/data/rockets/houston-1.json';
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
    ['reserved phase', (j: any) => { j.flight.events[0].phase = 'idle'; }, /reserved/],
    ['missing phase label', (j: any) => { delete j.flight.events[0].phaseLabel; }, /phaseLabel/],
    ['unknown stage', (j: any) => { j.parts[0].stage = 'stage9'; }, /unknown stage "stage9"/],
    ['bad stage colour', (j: any) => { j.stages[0].color = 'blue'; }, /hex colour/],
    ['unknown shape', (j: any) => { j.parts[1].model.shapes[0].type = 'sphere'; }, /unknown shape/],
    ['bad repeat', (j: any) => { j.parts[1].model.shapes[1].repeat.count = 0; }, /repeat\.count/],
    ['unsorted altitude', (j: any) => { j.flight.altitude.reverse(); }, /altitude.*sorted/],
    ['follow unknown part', (j: any) => { j.flight.events[1].follow = 'nope'; }, /follow: unknown part/],
    ['deploy without duration', (j: any) => { j.parts[0].flightEvents.push({ event: 'deploy', t: 1, rotation: [0, 0, 1] }); }, /duration/],
    ['track with one key', (j: any) => { j.parts[0].track = { frame: 'world', keys: [{ t: 1, offset: [0, 0, 0] }] }; }, /at least two keys/],
    ['http source', (j: any) => { j.sources = [{ title: 'x', url: 'http://example.com' }]; }, /https/],
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
