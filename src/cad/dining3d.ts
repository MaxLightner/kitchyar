import * as THREE from 'three';
import { diningLayout } from './diningLayout';
import type { DiningSeats, FloorFurnitureKind } from './types';

function roundedSlab(width: number, depth: number, height: number, radius: number) {
  const w = width / 2;
  const d = depth / 2;
  const r = Math.min(radius, w, d);
  const shape = new THREE.Shape();
  shape.moveTo(-w + r, -d);
  shape.lineTo(w - r, -d);
  shape.quadraticCurveTo(w, -d, w, -d + r);
  shape.lineTo(w, d - r);
  shape.quadraticCurveTo(w, d, w - r, d);
  shape.lineTo(-w + r, d);
  shape.quadraticCurveTo(-w, d, -w, d - r);
  shape.lineTo(-w, -d + r);
  shape.quadraticCurveTo(-w, -d, -w + r, -d);
  const bevel = Math.min(0.007, height / 4);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height - 2 * bevel, steps: 1, curveSegments: 7,
    bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -height / 2 + bevel, 0);
  return geometry;
}

export function createDiningMaterials(onReady?: () => void) {
  const map = new THREE.TextureLoader().load(import.meta.env.BASE_URL + 'assets/materials/cabinet-oak.webp', () => onReady?.());
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  const wood = new THREE.MeshPhysicalMaterial({ color: 0xd8b18d, map, roughness: 0.35, clearcoat: 0.23 });
  const grain = new Uint8Array(64 * 64);
  let state = 11;
  for (let i = 0; i < grain.length; i++) {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    grain[i] = 96 + (state >>> 28) * 8;
  }
  const weave = new THREE.DataTexture(grain, 64, 64, THREE.RedFormat);
  weave.wrapS = weave.wrapT = THREE.RepeatWrapping;
  weave.repeat.set(5, 5);
  weave.generateMipmaps = true;
  weave.minFilter = THREE.LinearMipmapLinearFilter;
  weave.magFilter = THREE.LinearFilter;
  weave.needsUpdate = true;
  const fabric = new THREE.MeshPhysicalMaterial({
    color: 0x8b9584, roughness: 0.72, sheen: 0.53, sheenColor: new THREE.Color(0xd8d4bc),
    bumpMap: weave, bumpScale: 0.0015,
  });
  return { wood, fabric };
}

export function buildDiningFootprint3D(seats: DiningSeats, kind: FloorFurnitureKind = 'dining', shape: 'round' | 'rect' = 'rect') {
  if (kind === 'tv') {
    const ghost = new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.48, depthWrite: false });
    return buildTelevisionSet3D(ghost, ghost, ghost);
  }
  const layout = diningLayout(seats, shape);
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.5, depthWrite: false });
  const surface = new THREE.Mesh(layout.round
    ? new THREE.CylinderGeometry(layout.width / 200, layout.width / 200, 0.025, 40)
    : roundedSlab(layout.width / 100, layout.depth / 100, 0.026, 0.19), material);
  surface.position.y = 0.76;
  group.add(surface);
  const chair = roundedSlab(0.44, 0.42, 0.03, 0.08);
  for (const spec of layout.chairs) {
    const seat = new THREE.Mesh(chair, material);
    seat.position.set(spec.x / 100, 0.46, spec.z / 100);
    seat.rotation.y = spec.yaw;
    group.add(seat);
  }
  return group;
}

export function buildDining3D(
  seats: DiningSeats,
  materials: { wood: THREE.Material; fabric: THREE.Material },
  shape: 'round' | 'rect' = 'rect',
) {
  const group = new THREE.Group();
  const design = diningLayout(seats, shape);
  const w = design.width / 100;
  const d = design.depth / 100;
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Group, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const leg = (geometry: THREE.BufferGeometry, parent: THREE.Group, x: number, y: number, z: number) => {
    const mesh = add(geometry, materials.wood, parent, x, y, z);
    mesh.rotation.x = -Math.sign(z) * 0.085;
    mesh.rotation.z = Math.sign(x) * 0.085;
  };

  add(design.round ? new THREE.CylinderGeometry(w / 2, w / 2 - 0.008, 0.038, 48)
    : roundedSlab(w, d, 0.037, 0.19), materials.wood, group, 0, 0.746, 0);
  const tableBase = roundedSlab(w - 0.23, d - 0.24, 0.055, 0.12);
  add(tableBase, materials.wood, group, 0, 0.704, 0);
  const tableLeg = new THREE.CylinderGeometry(0.031, 0.020, 0.69, 14);
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) leg(tableLeg, group, x * (w / 2 - (design.round ? 0.17 : 0.22)), 0.346, z * (d / 2 - 0.19));
  }

  const seat = roundedSlab(0.46, 0.44, 0.065, 0.09);
  const seatFrame = roundedSlab(0.41, 0.39, 0.032, 0.07);
  const back = roundedSlab(0.45, 0.27, 0.048, 0.09);
  const chairLeg = new THREE.CylinderGeometry(0.017, 0.012, 0.41, 12);
  const backSupport = new THREE.CylinderGeometry(0.012, 0.015, 0.31, 12);
  for (const spec of design.chairs) {
    const chair = new THREE.Group();
    chair.position.set(spec.x / 100, 0, spec.z / 100);
    chair.rotation.y = spec.yaw;
    add(seatFrame, materials.wood, chair, 0, 0.410, 0);
    add(seat, materials.fabric, chair, 0, 0.451, 0);
    add(back, materials.fabric, chair, 0, 0.695, -0.20).rotation.x = Math.PI / 2 - 0.12;
    for (const x of [-1, 1]) {
      add(backSupport, materials.wood, chair, x * 0.15, 0.557, -0.172).rotation.x = -0.14;
      for (const z of [-1, 1]) leg(chairLeg, chair, x * 0.16, 0.205, z * 0.15);
    }
    group.add(chair);
  }
  return group;
}

export const TV_SET_WIDTH_CM = 180;
export const TV_SET_DEPTH_CM = 42;

export function buildTelevisionSet3D(wood: THREE.Material, trim: THREE.Material, screen: THREE.Material) {
  const group = new THREE.Group();
  const add = (width: number, height: number, depth: number, x: number, y: number, z: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  };
  const width = TV_SET_WIDTH_CM / 100, depth = TV_SET_DEPTH_CM / 100;
  add(width, 0.31, depth - 0.02, 0, 0.245, -0.01, wood);
  for (const x of [-0.72, 0.72]) add(0.035, 0.09, depth - 0.09, x, 0.045, 0, trim);
  for (const x of [-0.598, 0, 0.598]) add(0.59, 0.272, 0.018, x, 0.245, depth / 2 - 0.007, wood);
  for (const x of [-0.43, 0.43]) add(0.028, 0.065, 0.22, x, 0.432, 0, trim);
  add(1.34, 0.762, 0.045, 0, 0.843, -0.035, trim);
  add(1.314, 0.735, 0.003, 0, 0.85, -0.011, screen);
  return group;
}
