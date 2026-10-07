import type { Part, Vec3 } from '../data/parts';

export function smoothstep(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}

/** Offset from the assembled position at explode factor 0..1, eased with smoothstep. */
export function explodeOffsetAt(part: Part, factor: number): Vec3 {
  const k = smoothstep(factor);
  const [x, y, z] = part.explodeOffset;
  return [x * k, y * k, z * k];
}

/**
 * Exponential smoothing toward a target, frame-rate independent. Used to make slider
 * drags feel fluid: `current = approach(current, target, dt)` each frame.
 */
export function approach(current: number, target: number, dt: number, halfLife = 0.08): number {
  if (halfLife <= 0) return target;
  const next = target + (current - target) * Math.pow(0.5, dt / halfLife);
  return Math.abs(next - target) < 1e-4 ? target : next;
}
