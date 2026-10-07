// Types for rocket.json and a hand-written guard that validates it at load time.

export type PartId = string;
export type Vec3 = [number, number, number];

export type FlightPhase =
  | 'idle' | 'countdown' | 'ascent' | 'stage-sep'
  | 'second-stage' | 'fairing-sep' | 'orbit' | 'aborted';

export type PartEventKind = 'separate' | 'jettison' | 'ignite' | 'shutdown';

export interface PartFlightEvent {
  event: PartEventKind;
  t: number;
  velocity?: Vec3;
  spin?: Vec3;
}

export interface Part {
  id: PartId;                      // 'stage1.engines'
  name: string;                    // 'First-stage engine cluster'
  parent: PartId | null;           // tree structure
  stage: 1 | 2 | 'payload';
  meshName: string;                // object name in the Wonderland scene
  explodeOffset: Vec3;
  info: {
    summary: string;
    purpose: string;
    materials?: string[];
    specs?: Record<string, string>; // { Thrust: '7,600 kN' }
    funFact?: string;
  };
  flightEvents?: PartFlightEvent[];
}

/** A timeline marker shown on the scrub bar, with a caption for the panel. */
export interface TimelineEvent {
  t: number;
  phase: Exclude<FlightPhase, 'idle' | 'aborted'>;
  title: string;
  caption: string;
}

export interface Rocket {
  id: string;
  name: string;
  parts: Part[];
  flight: {
    start: number;                 // negative: countdown begins at T-|start|
    end: number;
    events: TimelineEvent[];       // sorted by t
  };
}

export class RocketDataError extends Error {
  override name = 'RocketDataError';
}

const STAGES = new Set<unknown>([1, 2, 'payload']);
const PART_EVENTS = new Set<unknown>(['separate', 'jettison', 'ignite', 'shutdown']);
const TIMELINE_PHASES = new Set<unknown>([
  'countdown', 'ascent', 'stage-sep', 'second-stage', 'fairing-sep', 'orbit',
]);

type Obj = Record<string, unknown>;

function fail(path: string, msg: string): never {
  throw new RocketDataError(`${path}: ${msg}`);
}

function obj(v: unknown, path: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(path, 'expected an object');
  return v as Obj;
}

function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(path, 'expected an array');
  return v;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.trim() === '') fail(path, 'expected a non-empty string');
  return v;
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, 'expected a finite number');
  return v;
}

function vec3(v: unknown, path: string): Vec3 {
  const a = arr(v, path);
  if (a.length !== 3) fail(path, 'expected [x, y, z]');
  return [num(a[0], `${path}[0]`), num(a[1], `${path}[1]`), num(a[2], `${path}[2]`)];
}

function parseInfo(v: unknown, path: string): Part['info'] {
  const o = obj(v, path);
  const info: Part['info'] = {
    summary: str(o.summary, `${path}.summary`),
    purpose: str(o.purpose, `${path}.purpose`),
  };
  if (o.materials !== undefined) {
    info.materials = arr(o.materials, `${path}.materials`).map((m, i) => str(m, `${path}.materials[${i}]`));
  }
  if (o.specs !== undefined) {
    const specs = obj(o.specs, `${path}.specs`);
    info.specs = {};
    for (const [k, val] of Object.entries(specs)) info.specs[k] = str(val, `${path}.specs.${k}`);
  }
  if (o.funFact !== undefined) info.funFact = str(o.funFact, `${path}.funFact`);
  return info;
}

function parseFlightEvent(v: unknown, path: string): PartFlightEvent {
  const o = obj(v, path);
  if (!PART_EVENTS.has(o.event)) fail(`${path}.event`, `unknown event ${JSON.stringify(o.event)}`);
  const ev: PartFlightEvent = { event: o.event as PartEventKind, t: num(o.t, `${path}.t`) };
  if (o.velocity !== undefined) ev.velocity = vec3(o.velocity, `${path}.velocity`);
  if (o.spin !== undefined) ev.spin = vec3(o.spin, `${path}.spin`);
  return ev;
}

function parsePart(v: unknown, path: string): Part {
  const o = obj(v, path);
  if (!STAGES.has(o.stage)) fail(`${path}.stage`, 'expected 1, 2 or "payload"');
  if (o.parent !== null && typeof o.parent !== 'string') fail(`${path}.parent`, 'expected a part id or null');
  const part: Part = {
    id: str(o.id, `${path}.id`),
    name: str(o.name, `${path}.name`),
    parent: o.parent,
    stage: o.stage as Part['stage'],
    meshName: str(o.meshName, `${path}.meshName`),
    explodeOffset: vec3(o.explodeOffset, `${path}.explodeOffset`),
    info: parseInfo(o.info, `${path}.info`),
  };
  if (o.flightEvents !== undefined) {
    part.flightEvents = arr(o.flightEvents, `${path}.flightEvents`)
      .map((e, i) => parseFlightEvent(e, `${path}.flightEvents[${i}]`));
  }
  return part;
}

function parseTimelineEvent(v: unknown, path: string): TimelineEvent {
  const o = obj(v, path);
  if (!TIMELINE_PHASES.has(o.phase)) fail(`${path}.phase`, `unknown phase ${JSON.stringify(o.phase)}`);
  return {
    t: num(o.t, `${path}.t`),
    phase: o.phase as TimelineEvent['phase'],
    title: str(o.title, `${path}.title`),
    caption: str(o.caption, `${path}.caption`),
  };
}

/** Validates untrusted JSON and returns a typed Rocket, or throws RocketDataError. */
export function parseRocket(json: unknown): Rocket {
  const o = obj(json, 'rocket');
  const parts = arr(o.parts, 'rocket.parts').map((p, i) => parsePart(p, `rocket.parts[${i}]`));

  const ids = new Set<PartId>();
  const meshes = new Set<string>();
  for (const [i, p] of parts.entries()) {
    if (ids.has(p.id)) fail(`rocket.parts[${i}].id`, `duplicate id "${p.id}"`);
    if (meshes.has(p.meshName)) fail(`rocket.parts[${i}].meshName`, `duplicate meshName "${p.meshName}"`);
    ids.add(p.id);
    meshes.add(p.meshName);
  }
  const byId = new Map(parts.map((p) => [p.id, p]));
  for (const [i, p] of parts.entries()) {
    if (p.parent !== null && !byId.has(p.parent)) {
      fail(`rocket.parts[${i}].parent`, `unknown part "${p.parent}"`);
    }
    // Walk up the tree; revisiting a part means there is a cycle.
    const seen = new Set<PartId>([p.id]);
    for (let a = p.parent; a !== null; a = byId.get(a)?.parent ?? null) {
      if (seen.has(a)) fail(`rocket.parts[${i}].parent`, `cycle through "${a}"`);
      seen.add(a);
    }
  }

  const f = obj(o.flight, 'rocket.flight');
  const start = num(f.start, 'rocket.flight.start');
  const end = num(f.end, 'rocket.flight.end');
  if (end <= start) fail('rocket.flight.end', 'must be after start');
  const events = arr(f.events, 'rocket.flight.events')
    .map((e, i) => parseTimelineEvent(e, `rocket.flight.events[${i}]`));
  for (const [i, e] of events.entries()) {
    if (e.t < start || e.t > end) fail(`rocket.flight.events[${i}].t`, 'outside flight start..end');
    const prev = events[i - 1];
    if (prev && e.t < prev.t) fail(`rocket.flight.events[${i}].t`, 'events must be sorted by t');
  }

  return {
    id: str(o.id, 'rocket.id'),
    name: str(o.name, 'rocket.name'),
    parts,
    flight: { start, end, events },
  };
}

/** Ids of a part's descendants (not including the part itself). */
export function descendantsOf(parts: readonly Part[], id: PartId): PartId[] {
  const out: PartId[] = [];
  const stack = [id];
  while (stack.length > 0) {
    const cur = stack.pop();
    for (const p of parts) {
      if (p.parent === cur) {
        out.push(p.id);
        stack.push(p.id);
      }
    }
  }
  return out;
}

/** Ids of a part's ancestors, nearest first. */
export function ancestorsOf(parts: readonly Part[], id: PartId): PartId[] {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const out: PartId[] = [];
  for (let a = byId.get(id)?.parent ?? null; a !== null; a = byId.get(a)?.parent ?? null) out.push(a);
  return out;
}
