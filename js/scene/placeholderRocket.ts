// A stand-in rocket built from primitives until a real GLB exists. It follows the same
// contract as the model will (docs §5): one object per part, named by `meshName`, origin at
// the attach point, hierarchy mirroring the parts tree. Units are scene units, Y up.

import * as THREE from 'three';
import type { Part, Rocket } from '../data/parts';

const R = 0.6;      // body radius
const SEGMENTS = 48;

const STAGE_COLOR: Record<Part['stage'], number> = {
  1: 0x8fb3d9,
  2: 0xa9c4e0,
  payload: 0xc7d8ea,
};
const EDGE_COLOR = 0xe6f0ff;

/** Builds the geometry for one part, positioned relative to the part's own origin. */
type Builder = () => THREE.BufferGeometry[];

const cylinder = (rTop: number, rBottom: number, h: number, y: number, open = false): THREE.BufferGeometry =>
  new THREE.CylinderGeometry(rTop, rBottom, h, SEGMENTS, 1, open).translate(0, y + h / 2, 0);

function fairingHalf(side: 'left' | 'right'): THREE.BufferGeometry {
  // Cylinder section then an ogive nose, revolved through half a turn.
  const profile: THREE.Vector2[] = [new THREE.Vector2(R, 0), new THREE.Vector2(R, 1.4)];
  for (let i = 1; i <= 12; i++) {
    const k = i / 12;
    profile.push(new THREE.Vector2(R * Math.cos((k * Math.PI) / 2), 1.4 + 1.6 * Math.sin((k * Math.PI) / 2)));
  }
  // Lathe x = sin(phi)·r, so phi in [π, 2π] is the -x half.
  return new THREE.LatheGeometry(profile, SEGMENTS / 2, side === 'left' ? Math.PI : 0, Math.PI);
}

/** Local origin (relative to the parent part) and geometry for each meshName. */
const LAYOUT: Record<string, { at: [number, number, number]; build: Builder }> = {
  Stage1: { at: [0, 0, 0], build: () => [] },
  Stage1_Engines: {
    at: [0, 0, 0],
    build: () => {
      const bells: THREE.BufferGeometry[] = [cylinder(0.07, 0.13, 0.5, 0, true)];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        bells.push(cylinder(0.07, 0.13, 0.5, 0, true).translate(Math.cos(a) * 0.38, 0, Math.sin(a) * 0.38));
      }
      bells.push(cylinder(R, R, 0.15, 0.5)); // thrust plate
      return bells;
    },
  },
  Stage1_FuelTank: { at: [0, 0.65, 0], build: () => [cylinder(R, R, 3.0, 0)] },
  Stage1_LoxTank: { at: [0, 3.65, 0], build: () => [cylinder(R, R, 3.4, 0)] },
  Stage1_Fins: {
    at: [0, 0.65, 0],
    build: () => [0, 1, 2, 3].map((i) =>
      new THREE.BoxGeometry(0.04, 1.0, 0.45)
        .translate(0, 0.5, R + 0.2)
        .rotateY((i * Math.PI) / 2 + Math.PI / 4)),
  },
  Stage1_Interstage: { at: [0, 7.05, 0], build: () => [cylinder(R, R, 1.2, 0, true)] },

  Stage2: { at: [0, 7.25, 0], build: () => [] },
  Stage2_Engine: { at: [0, 0, 0], build: () => [cylinder(0.14, 0.42, 0.9, 0, true)] },
  Stage2_Tanks: { at: [0, 0.95, 0], build: () => [cylinder(R, R, 2.4, 0)] },
  Stage2_Avionics: { at: [0, 3.35, 0], build: () => [cylinder(R, R, 0.4, 0)] },

  Payload: { at: [0, 11.0, 0], build: () => [] },
  Payload_FairingLeft: { at: [0, 0, 0], build: () => [fairingHalf('left')] },
  Payload_FairingRight: { at: [0, 0, 0], build: () => [fairingHalf('right')] },
  Payload_Satellite: {
    at: [0, 0.15, 0],
    build: () => [
      new THREE.BoxGeometry(0.55, 1.0, 0.55).translate(0, 0.5, 0),
      new THREE.CylinderGeometry(0.2, 0.05, 0.25, 24).translate(0, 1.15, 0), // antenna dish
    ],
  },
};

function partObject(part: Part): THREE.Object3D {
  const layout = LAYOUT[part.meshName];
  const obj = new THREE.Group();
  obj.name = part.meshName;
  if (!layout) return obj;
  obj.position.set(...layout.at);

  const fill = new THREE.MeshStandardMaterial({
    color: STAGE_COLOR[part.stage],
    roughness: 0.75,
    metalness: 0.1,
    flatShading: true,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
  });
  const edges = new THREE.LineBasicMaterial({ color: EDGE_COLOR, transparent: true, opacity: 0.55 });
  for (const geo of layout.build()) {
    const mesh = new THREE.Mesh(geo, fill);
    mesh.userData.partId = part.id;
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), edges);
    outline.userData.partId = part.id;
    obj.add(mesh, outline);
  }
  return obj;
}

/** Builds the placeholder model: a root group whose descendants are named by meshName. */
export function buildPlaceholderRocket(rocket: Rocket): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Rocket';
  const objects = new Map<string, THREE.Object3D>();
  for (const part of rocket.parts) objects.set(part.id, partObject(part));
  for (const part of rocket.parts) {
    const obj = objects.get(part.id);
    const parent = part.parent === null ? root : objects.get(part.parent);
    if (obj && parent) parent.add(obj);
  }
  return root;
}
