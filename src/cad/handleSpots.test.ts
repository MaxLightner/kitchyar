import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyBox } from './doorRules';
import { applyHandleAtSpot, computeDoorHandleSpots } from './handleSpots';

test('position candidates depend on cabinet ergonomics and stay shared across handle orientations', () => {
  const leaf = { id: 'leaf', kind: 'door' as const, startCm: 0, widthCm: 60, drawerRatios: [] };
  const base = createEmptyBox('base', 0, 60);
  const overhead = createEmptyBox('wall', 0, 60);
  const baseSpots = computeDoorHandleSpots(base, leaf);
  const overheadSpots = computeDoorHandleSpots(overhead, leaf);
  assert.equal(baseSpots.length, 3);
  assert.equal(overheadSpots.length, 3);
  assert.ok(baseSpots.every(spot => spot.yRatio === 0.18));
  assert.ok(overheadSpots.every(spot => spot.yRatio === 0.82));
  assert.deepEqual(baseSpots.map(spot => spot.xRatio), overheadSpots.map(spot => spot.xRatio));

  const drawers = computeDoorHandleSpots(base, { ...leaf, kind: 'drawer', drawerRatios: [0.3, 0.65] });
  assert.equal(drawers.length, 9);
  assert.deepEqual([...new Set(drawers.map(spot => spot.rowIndex))], [0, 1, 2]);
});

test('applyHandleAtSpot sets hingeSide based on clicked horizontal edge and replaces row handle', () => {
  const box = createEmptyBox('base', 0, 90);
  box.doors = [
    { id: 'd1', kind: 'door', startCm: 0, widthCm: 45, drawerRatios: [] },
    { id: 'd2', kind: 'door', startCm: 45, widthCm: 45, drawerRatios: [] },
  ];

  const r1 = applyHandleAtSpot(box, 'd1', 0, 0.86, 0.18, 'simple', 'vertical');
  assert.equal(r1.ok, true);
  assert.equal(box.doors[0].hingeSide, 'left');
  assert.equal(box.handles.length, 1);

  // Clicking opposite edge replaces previous handle on same door/row and updates hingeSide
  const r2 = applyHandleAtSpot(box, 'd1', 0, 0.14, 0.18, 'knob', 'horizontal');
  assert.equal(r2.ok, true);
  assert.equal(box.doors[0].hingeSide, 'right');
  assert.equal(box.handles.length, 1);
  assert.equal(box.handles[0].style, 'knob');
});

test('the same installation point accepts either handle orientation', () => {
  const box = createEmptyBox('base', 0, 60);
  box.doors = [{ id: 'door', kind: 'door', startCm: 0, widthCm: 60, drawerRatios: [] }];
  const spot = computeDoorHandleSpots(box, box.doors[0])[0];
  for (const orient of ['horizontal', 'vertical'] as const) {
    const result = applyHandleAtSpot(box, spot.doorId, spot.rowIndex, spot.xRatio, spot.yRatio, 'simple', orient);
    assert.equal(result.ok, true);
    assert.equal(box.handles.length, 1);
    assert.equal(box.handles[0].xRatio, spot.xRatio);
    assert.equal(box.handles[0].yRatio, spot.yRatio);
    assert.equal(box.handles[0].orient, orient);
  }
});
