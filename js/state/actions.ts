import type { PartId } from '../data/parts';

export type Speed = 1 | 2 | 4;

export type Action =
  | { type: 'setExplode'; value: number }
  | { type: 'resetExplode' }
  | { type: 'setVisible'; id: PartId; visible: boolean }  // cascades to descendants
  | { type: 'isolate'; id: PartId }                       // again on the same part restores
  | { type: 'showAll' }
  | { type: 'select'; id: PartId | null }
  | { type: 'launch' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'setSpeed'; speed: Speed }
  | { type: 'scrub'; t: number }
  | { type: 'tick'; dt: number }                           // seconds of wall time
  | { type: 'abort' }
  | { type: 'resetFlight' }
  | { type: 'setReducedMotion'; value: boolean };
