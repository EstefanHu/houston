// Builds the rocket's placeholder 3D model from the shapes in its data file: one object per
// part, named by `meshName`, positioned relative to its parent part, nested like the parts
// tree (docs §5). A real GLB model would follow the same contract.

import * as THREE from 'three';
import type { Part, Rocket, Shape } from '../data/parts';

const SEGMENTS = 48;
const EDGE_COLOR = 0xe6f0ff;
const deg = THREE.MathUtils.degToRad;

/** Geometry for one shape, before `at` and `repeat` are applied. */
function baseGeometry(shape: Shape): THREE.BufferGeometry {
  switch (shape.type) {
    case 'cylinder':
      // Origin at the base centre.
      return new THREE.CylinderGeometry(shape.rTop, shape.rBottom, shape.h, shape.segments ?? SEGMENTS, 1, shape.open ?? false)
        .translate(0, shape.h / 2, 0);
    case 'box':
      return new THREE.BoxGeometry(...shape.size);
    case 'lathe':
      // Lathe x = sin(phi)·r, so phi 180–360° is the -x half.
      return new THREE.LatheGeometry(
        shape.profile.map(([r, y]) => new THREE.Vector2(r, y)),
        shape.segments ?? SEGMENTS,
        deg(shape.phiStart ?? 0),
        deg(shape.phiLength ?? 360),
      );
  }
}

/** All geometries for a shape: offset by `at`, then copied around the Y axis by `repeat`. */
function shapeGeometries(shape: Shape): THREE.BufferGeometry[] {
  const at = shape.at ?? [0, 0, 0];
  const placed = () => baseGeometry(shape).translate(...at);
  const r = shape.repeat;
  if (!r) return [placed()];
  return Array.from({ length: r.count }, (_, i) =>
    placed().translate(0, 0, r.radius).rotateY(deg(r.phase ?? 0) + (i / r.count) * Math.PI * 2));
}

function partObject(part: Part, color: string): THREE.Object3D {
  const obj = new THREE.Group();
  obj.name = part.meshName;
  if (!part.model) return obj;
  obj.position.set(...part.model.at);

  const fill = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.75,
    metalness: 0.1,
    flatShading: true,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
  });
  const edges = new THREE.LineBasicMaterial({ color: EDGE_COLOR, transparent: true, opacity: 0.55 });
  for (const geo of part.model.shapes.flatMap(shapeGeometries)) {
    const mesh = new THREE.Mesh(geo, fill);
    mesh.userData.partId = part.id;
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), edges);
    outline.userData.partId = part.id;
    obj.add(mesh, outline);
  }
  return obj;
}

/** Builds the model: a root group whose descendants are named by meshName. */
export function buildModel(rocket: Rocket): THREE.Group {
  const root = new THREE.Group();
  root.name = 'Rocket';
  const colors = new Map(rocket.stages.map((s) => [s.id, s.color]));
  const objects = new Map<string, THREE.Object3D>();
  for (const part of rocket.parts) objects.set(part.id, partObject(part, colors.get(part.stage) ?? '#a9c4e0'));
  for (const part of rocket.parts) {
    const obj = objects.get(part.id);
    const parent = part.parent === null ? root : objects.get(part.parent);
    if (obj && parent) parent.add(obj);
  }
  return root;
}
