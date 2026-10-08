// Checks every rocket in the fleet: its data file is valid and consistent with the registry.

import { describe, expect, it } from 'vitest';
import { DEFAULT_ROCKET_ID, ROCKETS, findRocket, loadRocket } from '../js/data/rockets/index';
import { altitudeAt } from '../js/motion/timeline';

describe('rocket registry', () => {
  it('has unique ids and includes the default', () => {
    expect(new Set(ROCKETS.map((r) => r.id)).size).toBe(ROCKETS.length);
    expect(findRocket(DEFAULT_ROCKET_ID)).toBeDefined();
  });
});

describe.each(ROCKETS.map((r) => [r.id, r] as const))('%s', (_id, entry) => {
  it('loads, validates and matches its registry entry', async () => {
    const rocket = await loadRocket(entry);
    expect(rocket).toMatchObject({ id: entry.id, name: entry.name, kind: entry.kind });
  });

  it('has geometry for every part with a mesh of its own', async () => {
    const rocket = await loadRocket(entry);
    // Grouping parts (stages) may have no shapes; leaf parts must have some.
    const parents = new Set(rocket.parts.map((p) => p.parent));
    const bare = rocket.parts.filter((p) => !parents.has(p.id) && !p.model?.shapes.length).map((p) => p.id);
    expect(bare).toEqual([]);
  });

  it('starts on the ground and has a caption for the end of the flight', async () => {
    const { flight } = await loadRocket(entry);
    expect(altitudeAt(flight, flight.start)).toBe(0);
    expect(flight.events.at(-1)?.t).toBe(flight.end);
  });
});
