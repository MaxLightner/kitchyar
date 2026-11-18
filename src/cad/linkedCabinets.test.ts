import assert from 'node:assert/strict';
import test from 'node:test';
import { canDoorOpenIn3D, createEmptyBox, createWall, ensureHorizontalDoorsAboveSink,
  moveApplianceHierarchically, moveBoxHierarchically, resizeUnitDividerWithDoorsSync, setCabinetCrownHeight, syncHoodUnitAboveGas, effectiveHoodKind } from './doorRules';
import { hasWallSegment, snapWallDrawingPoint } from './wallSnap';

function sinkAssembly() {
  const wall = createWall('kitchen', 0, 0, 600, 0, 1, 300);
  const base = createEmptyBox('base', 110, 80);
  const upper = createEmptyBox('wall', 110, 80);
  wall.boxes.push(base, upper);
  const sink = { id: 'sink', kind: 'sink' as const, boxId: base.id, offsetX: 110, width: 80 };
  wall.appliances.push(sink);
  ensureHorizontalDoorsAboveSink(wall, sink.offsetX, sink.width);
  return { wall, base, upper, sink };
}

test('moving the sink or its dedicated cabinet carries the other two parts', () => {
  const { wall, base, upper, sink } = sinkAssembly();
  const door = upper.doors[0];
  assert.ok(door);
  moveApplianceHierarchically(wall, [wall], sink.id, 210, {}, { exact: true });
  assert.deepEqual([sink.offsetX, base.offsetX, upper.offsetX], [210, 210, 210]);
  moveBoxHierarchically(wall, [wall], upper.id, 310, {}, { exact: true });
  assert.deepEqual([sink.offsetX, base.offsetX, upper.offsetX], [310, 310, 310]);
  assert.equal(upper.doors[0].id, door.id);
});

test('moving a sink bay within a run preserves its shelves and the overhead coverage', () => {
  const { wall, base, upper, sink } = sinkAssembly();
  base.width = 260;
  upper.width = 220;
  base.shelves = [{ id: 'shelf', startCm: 0, endCm: 80, yRatio: 0.55 }];
  moveApplianceHierarchically(wall, [wall], sink.id, 370, {}, { exact: true });
  const shift = sink.offsetX - base.offsetX;
  assert.ok(shift > 140 && shift + sink.width <= base.width);
  assert.deepEqual(base.shelves.map(shelf => [shelf.startCm, shelf.endCm]), [[shift, shift + sink.width]]);
  assert.ok(upper.doors.some(door => door.kind === 'lift' && door.startCm === sink.offsetX - upper.offsetX));
});

test('the crown updates uppers, tall cabinets and over-fridge cabinets as a group', () => {
  const wall = createWall('first', 0, 0, 600, 0, 1, 290);
  const second = createWall('second', 0, 0, 0, 360, 1, 280);
  const upper = createEmptyBox('wall', 0, 110);
  const tall = createEmptyBox('tall', 120, 55);
  const fridge = createEmptyBox('fridge', 210, 90);
  const aboveFridge = createEmptyBox('wall-deep', 210, 90);
  aboveFridge.linkedToBoxId = fridge.id;
  aboveFridge.elevY = 180;
  wall.boxes.push(upper, tall);
  second.boxes.push(fridge, aboveFridge);
  assert.equal(setCabinetCrownHeight([wall, second], 260), true);
  assert.deepEqual([upper, tall, aboveFridge].map(box => box.elevY + box.height), [260, 260, 260]);
  assert.equal(setCabinetCrownHeight([wall, second], 281), false);
  assert.deepEqual([upper, tall, aboveFridge].map(box => box.elevY + box.height), [260, 260, 260]);
});

test('a shelf inset from a bay edge follows its unit divider', () => {
  const box = createEmptyBox('base', 0, 200);
  box.unitDividers = [100];
  box.shelves = [{ id: 'shelf', startCm: 20, endCm: 80, yRatio: 0.5 }];
  const result = resizeUnitDividerWithDoorsSync(box, 100, 120);
  assert.equal(result?.seamCm, 120);
  assert.deepEqual(box.shelves.map(shelf => [shelf.startCm, shelf.endCm]), [[24, 96]]);
});

test('a pull-out pantry works before a handle is assigned', () => {
  const box = createEmptyBox('tall', 0, 50);
  assert.equal(canDoorOpenIn3D(box, { id: 'pantry', startCm: 0, widthCm: 50, kind: 'door', drawerRatios: [], hardwareKind: 'pantry-pullout' }), true);
});

test('wall drawing preserves welded endpoints and rejects a reversed duplicate', () => {
  const wall = createWall('first', 0, 0, 240, 20, 1);
  assert.deepEqual(snapWallDrawingPoint({ x: 239, y: 14 }, [wall], { x: 0, y: 0 }), { x: 240, y: 20, corner: true });
  assert.deepEqual(snapWallDrawingPoint({ x: 122, y: 7 }, [], { x: 0, y: 0 }), { x: 120, y: 0, corner: false });
  assert.equal(hasWallSegment([wall], createWall('reverse', 240, 20, 0, 0, 1)), true);
});

test('an integrated hood keeps panels on both levels', () => {
  const wall = createWall('kitchen', 0, 0, 500, 0);
  const lower = createEmptyBox('wall', 100, 80);
  const upper = createEmptyBox('wall-deep', 100, 80);
  upper.elevY = lower.elevY + lower.height;
  wall.boxes.push(lower, upper);
  const gas = { id: 'gas', kind: 'gas' as const, offsetX: 100, width: 80, hoodKind: 'chimney' as 'chimney' | 'hidden' };
  wall.appliances.push(gas);
  assert.equal(effectiveHoodKind(wall, gas), 'hidden');
  syncHoodUnitAboveGas(wall, gas);
  assert.equal(gas.hoodKind, 'hidden');
  assert.ok(lower.doors.some(door => door.widthCm === 80));
  assert.ok(upper.doors.some(door => door.widthCm === 80));
});

test('moving a cabinet on either level keeps an aligned stacked pair together', () => {
  const wall = createWall('kitchen', 0, 0, 500, 0);
  const lower = createEmptyBox('wall', 100, 80);
  const upper = createEmptyBox('wall-deep', 100, 80);
  upper.elevY = lower.elevY + lower.height;
  wall.boxes.push(lower, upper);
  moveBoxHierarchically(wall, [wall], upper.id, 220, {}, { exact: true });
  assert.deepEqual([lower.offsetX, upper.offsetX], [220, 220]);
});
