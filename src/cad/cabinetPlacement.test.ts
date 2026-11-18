import assert from 'node:assert/strict';
import test from 'node:test';
import { previewCabinetRow, startCabinetRow } from './cabinetPlacement';
import { createEmptyBox, createWall, moveBoxHierarchically, placeFridgeOnWall } from './doorRules';

test('confirming a cabinet row at its initial target preserves exactly the visible starter', () => {
  const wall = createWall('main', 0, 0, 350, 0, 1);
  const project = { walls: [wall], cornerOwners: {} };
  const first = startCabinetRow(project, wall, 150, 'base');
  assert.ok(first);
  assert.deepEqual(first.starter, { wallId: wall.id, startCm: 120, widthCm: 60 });
  assert.deepEqual(previewCabinetRow(project, first, wall.id, 150).segments, [first.starter]);
  assert.deepEqual(previewCabinetRow(project, first, wall.id, 280).segments, [
    { wallId: wall.id, startCm: 120, widthCm: 160 },
  ]);
  assert.deepEqual(previewCabinetRow(project, first, wall.id, 40).segments, [
    { wallId: wall.id, startCm: 40, widthCm: 140 },
  ]);
  assert.equal(wall.boxes.length, 0);
});

test('a cabinet row uses the original run around a connected corner and rejects an unrelated wall', () => {
  const firstWall = createWall('main', 0, 0, 350, 0, 1);
  const corner = createWall('corner', 350, 0, 350, 280, 1);
  const other = createWall('other', 0, 900, 250, 900, 1);
  const project = { walls: [firstWall, corner, other], cornerOwners: {} };
  const first = startCabinetRow(project, firstWall, 150, 'base');
  assert.ok(first);
  const valid = previewCabinetRow(project, first, corner.id, 180);
  assert.equal(valid.valid, true);
  assert.ok(valid.segments.some(segment => segment.wallId === firstWall.id && segment.startCm === 120));
  assert.ok(valid.segments.some(segment => segment.wallId === corner.id));
  assert.equal(previewCabinetRow(project, first, other.id, 150).valid, false);
});

test('a cabinet row can extend past either open end of its wall', () => {
  const wall = createWall('main', 0, 0, 300, 0);
  const project = { walls: [wall], cornerOwners: {} };
  const starter = startCabinetRow(project, wall, 150, 'base');
  assert.ok(starter);
  assert.deepEqual(previewCabinetRow(project, starter, wall.id, 410).segments,
    [{ wallId: wall.id, startCm: 120, widthCm: 290 }]);
  assert.deepEqual(previewCabinetRow(project, starter, wall.id, -60).segments,
    [{ wallId: wall.id, startCm: -60, widthCm: 240 }]);
});

test('moving the fridge or its attached cabinet moves both and respects cabinet collisions', () => {
  const wall = createWall('main', 0, 0, 300, 0);
  const placed = placeFridgeOnWall(wall, [wall], 'side-by-side', 30, {});
  assert.ok(placed.ok);
  const fridge = wall.boxes.find(box => box.id === placed.fridgeId)!;
  const above = wall.boxes.find(box => box.linkedToBoxId === fridge.id)!;
  moveBoxHierarchically(wall, [wall], above.id, -65, {});
  assert.deepEqual([fridge.offsetX, above.offsetX], [-65, -65]);
  moveBoxHierarchically(wall, [wall], fridge.id, 385, {});
  assert.deepEqual([fridge.offsetX, above.offsetX], [385, 385]);
  wall.boxes.push(createEmptyBox('base', 250, 100));
  moveBoxHierarchically(wall, [wall], fridge.id, 300, {});
  assert.deepEqual([fridge.offsetX, above.offsetX], [350, 350]);
});
