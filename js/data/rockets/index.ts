// The rocket fleet. Each data file is loaded only when that rocket is chosen, so adding
// rockets doesn't slow down the first page load. Name and kind are repeated here for the
// picker; a unit test checks they match the data files.

import { parseRocket } from '../parts';
import type { Rocket } from '../parts';

export interface RocketEntry {
  id: string;
  name: string;
  kind: string;
  load: () => Promise<unknown>;
}

export const ROCKETS: readonly RocketEntry[] = [
  { id: 'houston-1', name: 'Houston-1', kind: 'Generic satellite launcher', load: () => import('./houston-1.json') },
  { id: 'saturn-v', name: 'Saturn V', kind: 'Crewed Moon rocket', load: () => import('./saturn-v.json') },
  { id: 'falcon-9', name: 'Falcon 9', kind: 'Reusable booster', load: () => import('./falcon-9.json') },
  { id: 'falcon-heavy', name: 'Falcon Heavy', kind: 'Heavy-lift, side boosters', load: () => import('./falcon-heavy.json') },
  { id: 'black-brant-ix', name: 'Black Brant IX', kind: 'Sounding rocket', load: () => import('./black-brant-ix.json') },
];

export const DEFAULT_ROCKET_ID = 'houston-1';

export function findRocket(id: string | null): RocketEntry | undefined {
  return ROCKETS.find((r) => r.id === id);
}

/** Loads and validates a rocket's data file. Throws RocketDataError if it's malformed. */
export async function loadRocket(entry: RocketEntry): Promise<Rocket> {
  const mod = await entry.load();
  return parseRocket((mod as { default?: unknown }).default ?? mod);
}
