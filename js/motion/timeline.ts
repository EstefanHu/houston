// Pure flight-timeline math. Every output is a function of `t` alone, so scrubbing is
// deterministic: moving `t` backwards re-docks separated stages.

import type { FlightPhase, Part, Rocket, TimelineEvent, Vec3 } from '../data/parts';

/** Phase of the flight at time `t`, clamped to the timeline's range. */
export function phaseAt(flight: Rocket['flight'], t: number): Exclude<FlightPhase, 'idle' | 'aborted'> {
  return currentEvent(flight, t)?.phase ?? 'countdown';
}

/** The most recent timeline event at or before `t`, or null before the first one. */
export function currentEvent(flight: Rocket['flight'], t: number): TimelineEvent | null {
  let current: TimelineEvent | null = null;
  for (const e of flight.events) {
    if (e.t > t) break;
    current = e;
  }
  return current;
}

/** Mission-timer label, e.g. `T-00:10`, `T+08:30`. Whole seconds, rounded toward the count. */
export function formatMissionTime(t: number): string {
  const sign = t < 0 ? '-' : '+';
  const secs = t < 0 ? Math.ceil(-t) : Math.floor(t);
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  return `T${sign}${mm}:${ss}`;
}

export interface PartPose {
  offset: Vec3;                    // added to the part's assembled position, local units
  rotation: Vec3;                  // euler radians, added to the assembled rotation
  detached: boolean;
}

const ZERO: Vec3 = [0, 0, 0];

/**
 * Pose of a part relative to the stack at time `t`. A part drifts away with constant
 * velocity and spin after its `separate`/`jettison` event; before it, the pose is zero.
 */
export function partPoseAt(part: Part, t: number): PartPose {
  const ev = part.flightEvents?.find((e) => e.event === 'separate' || e.event === 'jettison');
  if (!ev || t <= ev.t) return { offset: ZERO, rotation: ZERO, detached: false };
  const dt = t - ev.t;
  const v = ev.velocity ?? ZERO;
  const w = ev.spin ?? ZERO;
  return {
    offset: [v[0] * dt, v[1] * dt, v[2] * dt],
    rotation: [w[0] * dt, w[1] * dt, w[2] * dt],
    detached: true,
  };
}

/** Whether a part's engine is burning at `t` (between its `ignite` and `shutdown` events). */
export function isBurning(part: Part, t: number): boolean {
  const ignite = part.flightEvents?.find((e) => e.event === 'ignite');
  if (!ignite || t < ignite.t) return false;
  const shutdown = part.flightEvents?.find((e) => e.event === 'shutdown');
  return !shutdown || t < shutdown.t;
}

/**
 * Illustrative altitude of the stack in scene units. It is not physical: it starts slowly
 * and accelerates, which reads as a launch on screen.
 */
export function stackAltitudeAt(t: number, accel = 0.02): number {
  return t <= 0 ? 0 : 0.5 * accel * t * t;
}
