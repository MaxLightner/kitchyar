import assert from 'node:assert/strict';
import test from 'node:test';
import { applyHandlesToBoxDoors, canDoorOpenIn3D, createEmptyBox, createWall } from './doorRules';
import { applyFrontCut, findFrontCut } from './frontCut';
import { fitHandleLengthCm } from './handleGeometry';
import { applyKitchenStylePreset } from './stylePresets';
import type { ProjectState } from './types';

function cabinet() {
  const wall = createWall('wall', 0, 0, 400, 0, 1);
  const box = createEmptyBox('tall', 20, 90);
  box.width = 90;
  box.height = 220;
  box.plinth = 0;
  box.countertopCm = 0;
  box.doors = [{ id: 'initial', kind: 'door', startCm: 0, widthCm: 90, drawerRatios: [] }];
  wall.boxes.push(box);
  return { wall, box };
}

test('the division pencil snaps to thirds and installs a full-height vertical seam', () => {
  const { wall, box } = cabinet();
  const cut = findFrontCut(wall, box, 'vertical', 52, 106);
  assert.ok(cut && cut.snapped);
  assert.equal(cut.at, 50);
  assert.deepEqual([cut.y1, cut.y2], [0, 220]);
  applyFrontCut(box, cut);
  assert.deepEqual(box.doors.map(door => [door.startCm, door.widthCm]), [[0, 30], [30, 60]]);
  assert.deepEqual(box.unitDividers, [30]);
});

test('horizontal cuts align to base height and the bottom of upper cabinets', () => {
  const { wall, box } = cabinet();
  const base = createEmptyBox('base', 110, 60);
  base.height = 90;
  const upper = createEmptyBox('wall', 110, 60);
  upper.elevY = 145;
  wall.boxes.push(base, upper);
  applyHandlesToBoxDoors(box, null, 'long-bar', 'vertical');
  const cut = findFrontCut(wall, box, 'horizontal', 70, 92);
  assert.ok(cut && cut.snapped);
  assert.deepEqual([cut.x1, cut.x2, cut.at], [20, 110, 90]);
  applyFrontCut(box, cut);
  const topCut = findFrontCut(wall, box, 'horizontal', 70, 143);
  assert.ok(topCut && topCut.snapped);
  assert.equal(topCut.at, 145);
  applyFrontCut(box, topCut);
  assert.equal(box.doors[0].drawerRatios.length, 2);
  assert.ok(box.doors[0].frontCutHinges);
  assert.equal(box.handles.length, 3);
});

test('the 40 cm option fits a tall pantry and the handleless finish still opens', () => {
  const { box } = cabinet();
  const door = box.doors[0];
  door.hardwareKind = 'pantry-pullout';
  applyHandlesToBoxDoors(box, null, 'long-bar', 'vertical');
  const handle = box.handles[0];
  assert.equal(handle.lengthCm, 40);
  assert.equal(fitHandleLengthCm(handle.style, handle.orient, handle.lengthCm, 24, 210, handle.xRatio, handle.yRatio), 40);
  applyHandlesToBoxDoors(box, null, 'handleless', 'vertical');
  assert.equal(door.hardwareKind, 'pantry-pullout');
  assert.equal(box.handles[0].lengthCm, 0);
  assert.equal(canDoorOpenIn3D(box, door), true);
});

test('the style gallery applies sheen and handles with cabinet model transfer off', () => {
  const { wall, box } = cabinet();
  box.doors[0].doorStyle = 'cnc';
  const project: ProjectState = { walls: [wall], cornerOwners: {}, activeWallId: wall.id,
    activeBoxId: box.id, selectedDoorId: null, doorsLocked: false };
  const result = applyKitchenStylePreset(project, 'modern-oak', false);
  assert.ok(result);
  assert.equal(result.next.walls[0].boxes[0].doors[0].doorStyle, 'cnc');
  assert.equal(result.next.walls[0].boxes[0].handles[0].style, 'f-profile');
  assert.equal(result.next.settings?.cabinetRoughness, 0.56);
  assert.equal(result.next.settings?.countertopRoughness, 0.26);
  assert.equal(result.next.settings?.backsplashRoughness, 0.53);
});
