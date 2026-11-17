import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyBox } from './doorRules';
import { applyHandleAtSpot, computeDoorHandleSpots } from './handleSpots';

test('computeDoorHandleSpots produces 6 vertical spots for hinged doors and row spots for drawers', () => {
  const box = createEmptyBox('base', 0, 120);
  box.doors = [
    { id: 'd_hinge', kind: 'door', startCm: 0, widthCm: 60, drawerRatios: [] },
    { id: 'd_drawer', kind: 'drawer', startCm: 60, widthCm: 60, drawerRatios: [0.3, 0.65] },
  ];

  const hingeSpots = computeDoorHandleSpots(box, box.doors[0], 'vertical');
  assert.equal(hingeSpots.length, 6);
  assert.ok(hingeSpots.some((s) => s.xRatio === 0.86 && s.yRatio === 0.18));
  assert.ok(hingeSpots.some((s) => s.xRatio === 0.14 && s.yRatio === 0.82));

  const drawerSpots = computeDoorHandleSpots(box, box.doors[1], 'horizontal');
  assert.equal(drawerSpots.length, 12); // 3 rows * 4 candidate spots
  assert.equal(new Set(drawerSpots.map((s) => s.rowIndex)).size, 3);
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
