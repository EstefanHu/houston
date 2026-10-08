// Types for the rocket data files (js/data/rockets/*.json) and a hand-written guard that
// validates them at load time.

export type PartId = string;
export type Vec3 = [number, number, number];

/** 'idle' and 'aborted' are reserved; any other value is a phase id from the rocket's timeline. */
export type FlightPhase = string;
export const RESERVED_PHASES: ReadonlySet<string> = new Set(['idle', 'aborted']);

export type PartEventKind = 'separate' | 'jettison' | 'ignite' | 'shutdown' | 'deploy';

export interface PartFlightEvent {
  event: PartEventKind;
  t: number;
  /** separate / jettison: constant drift after the event, units/s and rad/s. */
  velocity?: Vec3;
  spin?: Vec3;
  /** deploy: eases over `duration` seconds to `rotation` (euler radians, added to the part's own)
   *  and/or from `scale[0]` to `scale[1]`. Before the event the part sits at the start state. */
  duration?: number;
  rotation?: Vec3;
  scale?: [Vec3, Vec3];
}

/**
 * A keyframed path for a part after it leaves the stack, smoothly interpolated. In the
 * 'stack' frame, offsets are relative to the part's assembled position on the climbing stack.
 * In the 'world' frame they ignore the climb, so the part can fly back to the ground.
 */
export interface PartTrack {
  frame: 'stack' | 'world';
  keys: { t: number; offset: Vec3; rotation?: Vec3 }[];  // sorted by t
}

/** Places copies of a shape around the Y axis: each is pushed out `radius` then rotated. */
export interface Repeat {
  count: number;
  radius: number;
  phase?: number;                  // degrees
}

/** Placeholder geometry. Each shape's origin: cylinder and lathe at the base centre, box at its centre. */
export type Shape =
  | { type: 'cylinder'; rTop: number; rBottom: number; h: number; open?: boolean; segments?: number; at?: Vec3; repeat?: Repeat }
  | { type: 'box'; size: Vec3; at?: Vec3; repeat?: Repeat }
  | { type: 'lathe'; profile: [number, number][]; phiStart?: number; phiLength?: number; segments?: number; at?: Vec3; repeat?: Repeat };

export interface Part {
  id: PartId;                      // 'stage1.engines'
  name: string;                    // 'First-stage engine cluster'
  parent: PartId | null;           // tree structure
  stage: string;                   // a Stage id
  meshName: string;                // object name in the model
  explodeOffset: Vec3;
  info: {
    summary: string;
    purpose: string;
    materials?: string[];
    specs?: Record<string, string>; // { Thrust: '7,600 kN' }
    funFact?: string;
  };
  /** Placeholder geometry: the object's position relative to its parent part, and its shapes. */
  model?: { at: Vec3; shapes: Shape[] };
  flightEvents?: PartFlightEvent[];
  track?: PartTrack;
}

export interface Stage {
  id: string;
  label: string;                   // 'Stage 1'
  color: string;                   // '#8fb3d9', placeholder fill colour
}

/** A timeline marker shown on the scrub bar, with a caption for the panel. */
export interface TimelineEvent {
  t: number;
  phase: FlightPhase;              // free id, not 'idle' or 'aborted'
  phaseLabel: string;              // shown in the status strip: 'Staging'
  title: string;
  caption: string;
  /** From this event on, the chase camera follows this part ('stack' = the whole rocket). */
  follow?: PartId | 'stack';
}

export interface Rocket {
  id: string;
  name: string;
  kind: string;                    // 'Crewed Moon rocket'
  summary: string;
  stages: Stage[];
  parts: Part[];
  flight: {
    start: number;                 // negative: countdown begins at T-|start|
    end: number;
    events: TimelineEvent[];       // sorted by t
    altitude: [number, number][];  // [t, scene units] keyframes, sorted by t
  };
  sources?: { title: string; url: string }[];
}

export class RocketDataError extends Error {
  override name = 'RocketDataError';
}

const PART_EVENTS = new Set<unknown>(['separate', 'jettison', 'ignite', 'shutdown', 'deploy']);

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

function pos(v: unknown, path: string): number {
  const n = num(v, path);
  if (n <= 0) fail(path, 'expected a positive number');
  return n;
}

function vec3(v: unknown, path: string): Vec3 {
  const a = arr(v, path);
  if (a.length !== 3) fail(path, 'expected [x, y, z]');
  return [num(a[0], `${path}[0]`), num(a[1], `${path}[1]`), num(a[2], `${path}[2]`)];
}

function pair(v: unknown, path: string): [number, number] {
  const a = arr(v, path);
  if (a.length !== 2) fail(path, 'expected [a, b]');
  return [num(a[0], `${path}[0]`), num(a[1], `${path}[1]`)];
}

function sortedBy<T extends { t: number } | [number, number]>(items: T[], path: string): T[] {
  const tOf = (x: T) => (Array.isArray(x) ? x[0] : x.t);
  for (let i = 1; i < items.length; i++) {
    if (tOf(items[i]!) < tOf(items[i - 1]!)) fail(`${path}[${i}]`, 'must be sorted by time');
  }
  return items;
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
  if (o.duration !== undefined) ev.duration = pos(o.duration, `${path}.duration`);
  if (o.rotation !== undefined) ev.rotation = vec3(o.rotation, `${path}.rotation`);
  if (o.scale !== undefined) {
    const s = arr(o.scale, `${path}.scale`);
    if (s.length !== 2) fail(`${path}.scale`, 'expected [from, to]');
    ev.scale = [vec3(s[0], `${path}.scale[0]`), vec3(s[1], `${path}.scale[1]`)];
  }
  if (ev.event === 'deploy') {
    if (ev.duration === undefined) fail(`${path}.duration`, 'deploy needs a duration');
    if (!ev.rotation && !ev.scale) fail(path, 'deploy needs a rotation and/or scale');
  }
  return ev;
}

function parseTrack(v: unknown, path: string): PartTrack {
  const o = obj(v, path);
  if (o.frame !== 'stack' && o.frame !== 'world') fail(`${path}.frame`, 'expected "stack" or "world"');
  const keys = arr(o.keys, `${path}.keys`).map((k, i) => {
    const ko = obj(k, `${path}.keys[${i}]`);
    const key: PartTrack['keys'][number] = { t: num(ko.t, `${path}.keys[${i}].t`), offset: vec3(ko.offset, `${path}.keys[${i}].offset`) };
    if (ko.rotation !== undefined) key.rotation = vec3(ko.rotation, `${path}.keys[${i}].rotation`);
    return key;
  });
  if (keys.length < 2) fail(`${path}.keys`, 'expected at least two keys');
  return { frame: o.frame, keys: sortedBy(keys, `${path}.keys`) };
}

function parseRepeat(v: unknown, path: string): Repeat {
  const o = obj(v, path);
  const count = num(o.count, `${path}.count`);
  if (!Number.isInteger(count) || count < 1) fail(`${path}.count`, 'expected a whole number ≥ 1');
  const r: Repeat = { count, radius: num(o.radius, `${path}.radius`) };
  if (o.phase !== undefined) r.phase = num(o.phase, `${path}.phase`);
  return r;
}

function parseShape(v: unknown, path: string): Shape {
  const o = obj(v, path);
  const common = {
    ...(o.at !== undefined ? { at: vec3(o.at, `${path}.at`) } : {}),
    ...(o.repeat !== undefined ? { repeat: parseRepeat(o.repeat, `${path}.repeat`) } : {}),
  };
  const segments = o.segments !== undefined ? { segments: pos(o.segments, `${path}.segments`) } : {};
  switch (o.type) {
    case 'cylinder':
      return {
        type: 'cylinder',
        rTop: num(o.rTop, `${path}.rTop`),
        rBottom: num(o.rBottom, `${path}.rBottom`),
        h: pos(o.h, `${path}.h`),
        ...(o.open !== undefined ? { open: o.open === true } : {}),
        ...segments,
        ...common,
      };
    case 'box':
      return { type: 'box', size: vec3(o.size, `${path}.size`), ...common };
    case 'lathe': {
      const profile = arr(o.profile, `${path}.profile`).map((p, i) => pair(p, `${path}.profile[${i}]`));
      if (profile.length < 2) fail(`${path}.profile`, 'expected at least two points');
      return {
        type: 'lathe',
        profile,
        ...(o.phiStart !== undefined ? { phiStart: num(o.phiStart, `${path}.phiStart`) } : {}),
        ...(o.phiLength !== undefined ? { phiLength: num(o.phiLength, `${path}.phiLength`) } : {}),
        ...segments,
        ...common,
      };
    }
    default:
      return fail(`${path}.type`, `unknown shape ${JSON.stringify(o.type)}`);
  }
}

function parsePart(v: unknown, path: string, stageIds: ReadonlySet<string>): Part {
  const o = obj(v, path);
  const stage = str(o.stage, `${path}.stage`);
  if (!stageIds.has(stage)) fail(`${path}.stage`, `unknown stage "${stage}"`);
  if (o.parent !== null && typeof o.parent !== 'string') fail(`${path}.parent`, 'expected a part id or null');
  const part: Part = {
    id: str(o.id, `${path}.id`),
    name: str(o.name, `${path}.name`),
    parent: o.parent,
    stage,
    meshName: str(o.meshName, `${path}.meshName`),
    explodeOffset: vec3(o.explodeOffset, `${path}.explodeOffset`),
    info: parseInfo(o.info, `${path}.info`),
  };
  if (o.model !== undefined) {
    const m = obj(o.model, `${path}.model`);
    part.model = {
      at: vec3(m.at, `${path}.model.at`),
      shapes: arr(m.shapes, `${path}.model.shapes`).map((s, i) => parseShape(s, `${path}.model.shapes[${i}]`)),
    };
  }
  if (o.flightEvents !== undefined) {
    part.flightEvents = arr(o.flightEvents, `${path}.flightEvents`)
      .map((e, i) => parseFlightEvent(e, `${path}.flightEvents[${i}]`));
  }
  if (o.track !== undefined) part.track = parseTrack(o.track, `${path}.track`);
  return part;
}

function parseStage(v: unknown, path: string): Stage {
  const o = obj(v, path);
  const color = str(o.color, `${path}.color`);
  if (!/^#[0-9a-f]{6}$/i.test(color)) fail(`${path}.color`, 'expected a hex colour like "#8fb3d9"');
  return { id: str(o.id, `${path}.id`), label: str(o.label, `${path}.label`), color };
}

function parseTimelineEvent(v: unknown, path: string): TimelineEvent {
  const o = obj(v, path);
  const phase = str(o.phase, `${path}.phase`);
  if (RESERVED_PHASES.has(phase)) fail(`${path}.phase`, `"${phase}" is reserved`);
  const ev: TimelineEvent = {
    t: num(o.t, `${path}.t`),
    phase,
    phaseLabel: str(o.phaseLabel, `${path}.phaseLabel`),
    title: str(o.title, `${path}.title`),
    caption: str(o.caption, `${path}.caption`),
  };
  if (o.follow !== undefined) ev.follow = str(o.follow, `${path}.follow`);
  return ev;
}

/** Validates untrusted JSON and returns a typed Rocket, or throws RocketDataError. */
export function parseRocket(json: unknown): Rocket {
  const o = obj(json, 'rocket');

  const stages = arr(o.stages, 'rocket.stages').map((s, i) => parseStage(s, `rocket.stages[${i}]`));
  const stageIds = new Set(stages.map((s) => s.id));
  if (stageIds.size !== stages.length) fail('rocket.stages', 'duplicate stage id');

  const parts = arr(o.parts, 'rocket.parts').map((p, i) => parsePart(p, `rocket.parts[${i}]`, stageIds));

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
  const events = sortedBy(
    arr(f.events, 'rocket.flight.events').map((e, i) => parseTimelineEvent(e, `rocket.flight.events[${i}]`)),
    'rocket.flight.events',
  );
  for (const [i, e] of events.entries()) {
    if (e.t < start || e.t > end) fail(`rocket.flight.events[${i}].t`, 'outside flight start..end');
    if (e.follow !== undefined && e.follow !== 'stack' && !byId.has(e.follow)) {
      fail(`rocket.flight.events[${i}].follow`, `unknown part "${e.follow}"`);
    }
  }
  const altitude = sortedBy(
    arr(f.altitude, 'rocket.flight.altitude').map((k, i) => pair(k, `rocket.flight.altitude[${i}]`)),
    'rocket.flight.altitude',
  );
  if (altitude.length < 2) fail('rocket.flight.altitude', 'expected at least two keys');

  const rocket: Rocket = {
    id: str(o.id, 'rocket.id'),
    name: str(o.name, 'rocket.name'),
    kind: str(o.kind, 'rocket.kind'),
    summary: str(o.summary, 'rocket.summary'),
    stages,
    parts,
    flight: { start, end, events, altitude },
  };
  if (o.sources !== undefined) {
    rocket.sources = arr(o.sources, 'rocket.sources').map((s, i) => {
      const so = obj(s, `rocket.sources[${i}]`);
      const url = str(so.url, `rocket.sources[${i}].url`);
      if (!/^https:\/\//.test(url)) fail(`rocket.sources[${i}].url`, 'expected an https:// URL');
      return { title: str(so.title, `rocket.sources[${i}].title`), url };
    });
  }
  return rocket;
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
