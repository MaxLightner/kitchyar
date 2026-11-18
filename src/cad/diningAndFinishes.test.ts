import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { continueCabinetRow, previewCabinetRow, startCabinetRow } from './cabinetPlacement';
import { diningLayout, DINING_SEATS } from './diningLayout';
import { buildDining3D } from './dining3d';
import { applyHardwareKindToDoors, canDoorOpenIn3D, computeWallBacksplashSpans, createEmptyBox, createWall } from './doorRules';
import { applyAnimatedDoorProgress, type AnimatedDoorHandle } from './scene3dBuilder';
import { readSurfaceFinish } from './surfaceFinish';

test('dining capacity and geometry agree in plan and 3D', () => {
  const material = new THREE.MeshStandardMaterial();
  for (const seats of DINING_SEATS) {
    const model = buildDining3D(seats, { wood: material, fabric: material });
    const plan = diningLayout(seats);
    assert.equal(plan.chairs.length, seats);
    const chairs = model.children.filter(child => child instanceof THREE.Group);
    assert.equal(chairs.length, seats);
    assert.deepEqual(chairs.map(chair => [chair.position.x, chair.position.z]),
      plan.chairs.map(chair => [chair.x / 100, chair.z / 100]));
    assert.ok(new THREE.Box3().setFromObject(model).max.y > 0.76);
  }
});

test('the lower bifold leaf stays on the upper leaf hinge and both share an animation', () => {
  const box = createEmptyBox('wall', 0, 85);
  box.height = 90;
  box.doors.push({ id: 'fixture-door', kind: 'door', startCm: 0, widthCm: 85, drawerRatios: [] });
  const door = box.doors[0];
  assert.equal(applyHardwareKindToDoors(box, null, 'lift-bifold'), 1);
  assert.equal(door.kind, 'lift');
  const lowerCm = (1 - door.drawerRatios[0]) * box.height;
  assert.ok(Math.abs(lowerCm - 30) < 1e-6);
  assert.ok(canDoorOpenIn3D(box, door));
  for (const normalSign of [1, -1]) {
    const upper = new THREE.Group();
    const lower = new THREE.Group();
    upper.add(lower);
    lower.position.y = -0.35;
    const handle: AnimatedDoorHandle = {
      doorId: door.id, group: upper, lowerLeaf: lower, kind: 'bifold', normalSign,
      baseX: 0, baseY: 2, baseZ: 0, baseRotX: 0, baseRotY: 0, maxAngle: 1.85,
    };
    applyAnimatedDoorProgress(handle, 1);
    assert.ok(normalSign * upper.rotation.x < -1.5);
    assert.ok(normalSign * lower.rotation.x > 2.5);
    assert.ok(normalSign * lower.getWorldPosition(new THREE.Vector3()).z > 0.3);
    assert.equal(lower.parent, upper);
    applyAnimatedDoorProgress(handle, 0);
    assert.ok(Math.abs(upper.rotation.x) < 1e-6 && Math.abs(lower.rotation.x) < 1e-6);
  }
});

test('inside return gets tiles above a neighboring counter, with an opening still clipped', () => {
  const side = createWall('return', 0, 0, 0, 240, -1);
  const back = createWall('back', 0, 0, 300, 0, 1);
  const counter = createEmptyBox('base', 0, 175);
  back.boxes.push(counter);
  let spans = computeWallBacksplashSpans(side, [side, back]);
  assert.equal(spans.length, 1);
  assert.deepEqual([spans[0].startCm, spans[0].endCm], [0, counter.depth + 2]);
  assert.equal(spans[0].botY, counter.elevY + counter.height);

  side.openings = [{ id: 'window', kind: 'window', offsetX: 12, width: 18, elevY: spans[0].botY, height: 80 }];
  spans = computeWallBacksplashSpans(side, [side, back]);
  assert.deepEqual(spans.map(span => [span.startCm, span.endCm]), [[0, 12], [30, counter.depth + 2]]);
  side.flipSide = 1;
  back.flipSide = -1;
  assert.deepEqual(computeWallBacksplashSpans(side, [side, back]), []);
});

test('a third 3D cabinet click extends the committed run without overlap', () => {
  const wall = createWall('straight', 0, 0, 520, 0, 1);
  const project = { walls: [wall], cornerOwners: {} };
  const start = startCabinetRow(project, wall, 80, 'base');
  assert.ok(start);
  const first = previewCabinetRow(project, start, wall.id, 180);
  assert.ok(first.valid);
  for (const piece of first.segments) wall.boxes.push(createEmptyBox('base', piece.startCm, piece.widthCm));
  const draft = continueCabinetRow(start, wall.id, 180, first.segments);
  assert.ok(draft);
  const extension = previewCabinetRow(project, draft, wall.id, 260);
  assert.ok(extension.valid);
  assert.equal(extension.segments[0].startCm, 180);
  assert.equal(extension.segments[0].widthCm, 80);
  assert.equal(previewCabinetRow(project, draft, wall.id, 180).valid, false);
});

test('reflection strength can be independent from matteness', () => {
  const base = { wallHeightCm: 265, baseHeightCm: 90, plinthCm: 10, countertopCm: 4, wallCabElevCm: 145, wallCabHeightCm: 75 };
  const off = readSurfaceFinish({ ...base, countertopReflection: 0, countertopRoughness: 0.6 }, 1);
  const on = readSurfaceFinish({ ...base, countertopReflection: 1, countertopRoughness: 0.6 }, 1);
  assert.equal(off.specularIntensity, 0);
  assert.equal(off.clearcoat, 0);
  assert.equal(off.roughness, on.roughness);
  assert.ok(on.clearcoat > off.clearcoat);
  assert.ok(readSurfaceFinish(base, 3).clearcoat < readSurfaceFinish(base, 0).clearcoat);
});
