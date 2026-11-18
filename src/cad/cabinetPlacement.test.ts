import assert from 'node:assert/strict';
import test from 'node:test';
import { previewCabinetRow, startCabinetRow } from './cabinetPlacement';
import { createWall } from './doorRules';

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
