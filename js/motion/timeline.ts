// Pure flight-timeline math. Every output is a function of `t` alone, so scrubbing is
// deterministic: moving `t` backwards re-docks separated stages.

import type { FlightPhase, Part, PartId, Rocket, TimelineEvent, Vec3 } from '../data/parts';
import { smoothstep } from './explode';

/** Phase of the flight at time `t`, clamped to the timeline's range. */
export function phaseAt(flight: Rocket['flight'], t: number): FlightPhase {
  return currentEvent(flight, t)?.phase ?? flight.events[0]?.phase ?? 'countdown';
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

/** What the chase camera follows at `t`: the latest event's `follow`, or the whole stack. */
export function followAt(flight: Rocket['flight'], t: number): PartId | 'stack' {
  let follow: PartId | 'stack' = 'stack';
  for (const e of flight.events) {
    if (e.t > t) break;
    if (e.follow !== undefined) follow = e.follow;
  }
  return follow;
}

/** Mission-timer label, e.g. `T-00:10`, `T+08:30`. Whole seconds, rounded toward the count. */
export function formatMissionTime(t: number): string {
  const sign = t < 0 ? '-' : '+';
  const secs = t < 0 ? Math.ceil(-t) : Math.floor(t);
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  return `T${sign}${mm}:${ss}`;
}

/**
 * Smooth interpolation through keyframes (monotone cubic, Fritsch–Carlson). It passes
 * through every key and never overshoots between them, so a path that descends to the
 * ground doesn't dip below it. Holds the first/last value outside the keys.
 */
export function interpolate(times: readonly number[], values: readonly number[], t: number): number {
  const n = times.length;
  if (n === 0) return 0;
  if (t <= times[0]!) return values[0]!;
  if (t >= times[n - 1]!) return values[n - 1]!;

  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = times[i + 1]! - times[i]!;
    slope.push(dx === 0 ? 0 : (values[i + 1]! - values[i]!) / dx);
  }
  const m: number[] = [slope[0]!];
  for (let i = 1; i < n - 1; i++) {
    const a = slope[i - 1]!;
    const b = slope[i]!;
    m.push(a * b <= 0 ? 0 : (a + b) / 2);
  }
  m.push(slope[n - 2]!);
  for (let i = 0; i < n - 1; i++) {
    const d = slope[i]!;
    if (d === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / d;
    const b = m[i + 1]! / d;
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * a * d;
      m[i + 1] = tau * b * d;
    }
  }

  let k = 0;
  while (t > times[k + 1]!) k++;
  const h = times[k + 1]! - times[k]!;
  if (h === 0) return values[k + 1]!;
  const u = (t - times[k]!) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * values[k]! + (u3 - 2 * u2 + u) * h * m[k]!
    + (-2 * u3 + 3 * u2) * values[k + 1]! + (u3 - u2) * h * m[k + 1]!;
}

/** Altitude of the stack in scene units at `t`, from the rocket's altitude keyframes. */
export function altitudeAt(flight: Rocket['flight'], t: number): number {
  return interpolate(flight.altitude.map((k) => k[0]), flight.altitude.map((k) => k[1]), t);
}

export interface PartPose {
  offset: Vec3;                    // added to the part's assembled position, local units
  rotation: Vec3;                  // euler radians, applied after the assembled rotation
  scale: Vec3;                     // multiplies the part's scale (deploying parachutes etc.)
  detached: boolean;               // has left the stack
  frame: 'stack' | 'world';        // 'world': offset ignores the stack's climb
}

const ZERO: Vec3 = [0, 0, 0];
const ONE: Vec3 = [1, 1, 1];

/**
 * Pose of a part at time `t`, relative to its place on the stack. Pass `-Infinity` for the
 * pre-launch state (e.g. landing legs stowed).
 * - A `track` moves the part along keyframes once the first key is reached.
 * - Otherwise a `separate`/`jettison` event makes it drift with constant velocity and spin.
 * - `deploy` events ease extra rotation and/or scale in over their duration.
 */
export function partPoseAt(part: Part, t: number): PartPose {
  let offset = ZERO;
  let rotation = ZERO;
  let detached = false;
  let frame: PartPose['frame'] = 'stack';

  const track = part.track;
  if (track && t >= track.keys[0]!.t) {
    const keys = track.keys;
    const times = keys.map((k) => k.t);
    const axis = (pick: (k: (typeof keys)[number]) => number) => interpolate(times, keys.map(pick), t);
    offset = [axis((k) => k.offset[0]), axis((k) => k.offset[1]), axis((k) => k.offset[2])];
    rotation = [axis((k) => k.rotation?.[0] ?? 0), axis((k) => k.rotation?.[1] ?? 0), axis((k) => k.rotation?.[2] ?? 0)];
    detached = true;
    frame = track.frame;
  } else {
    const ev = part.flightEvents?.find((e) => e.event === 'separate' || e.event === 'jettison');
    if (ev && t > ev.t) {
      const dt = t - ev.t;
      const v = ev.velocity ?? ZERO;
      const w = ev.spin ?? ZERO;
      offset = [v[0] * dt, v[1] * dt, v[2] * dt];
      rotation = [w[0] * dt, w[1] * dt, w[2] * dt];
      detached = true;
    }
  }

  let scale = ONE;
  for (const ev of part.flightEvents ?? []) {
    if (ev.event !== 'deploy') continue;
    const k = t <= ev.t ? 0 : smoothstep((t - ev.t) / (ev.duration ?? 1));
    if (ev.rotation) {
      const r = ev.rotation;
      rotation = [rotation[0] + r[0] * k, rotation[1] + r[1] * k, rotation[2] + r[2] * k];
    }
    if (ev.scale) {
      const [from, to] = ev.scale;
      scale = [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, from[2] + (to[2] - from[2]) * k];
    }
  }

  return { offset, rotation, scale, detached, frame };
}

/** Whether a part's engine is burning at `t`. Handles several ignite/shutdown pairs. */
export function isBurning(part: Part, t: number): boolean {
  let burning = false;
  const events = (part.flightEvents ?? [])
    .filter((e) => e.event === 'ignite' || e.event === 'shutdown')
    .sort((a, b) => a.t - b.t);
  for (const e of events) {
    if (e.t > t) break;
    burning = e.event === 'ignite';
  }
  return burning;
}
