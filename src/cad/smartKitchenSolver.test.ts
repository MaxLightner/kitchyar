import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyBox, createWall } from './doorRules';
import { applySmartKitchenDesign } from './smartKitchenSolver';
import { ProjectState } from './types';

function makeProject(walls = [createWall('دیوار ۱', 0, 0, 300, 0, 1)]): ProjectState {
  return {
    walls,
    cornerOwners: {},
    activeWallId: walls[0]?.id || null,
    activeBoxId: null,
    selectedDoorId: null,
    doorsLocked: false,
    designStyle: 'modern',
    cabinetFinish: 'warm-white',
    backsplashFinish: 'calacatta-marble',
    countertopFinish: 'dark-quartz',
  };
}

test('applySmartKitchenDesign fills empty base + wall boxes with balanced doors, sink/gas bays, and handles', () => {
  const w = createWall('دیوار ۱', 0, 0, 300, 0, 1);
  const base = createEmptyBox('base', 0, 300);
  const wallCab = createEmptyBox('wall', 0, 300);
  w.boxes.push(base, wallCab);
  w.appliances.push(
    { id: 'app_sink', kind: 'sink', boxId: base.id, offsetX: 20, width: 90, sinkModel: 'steel-2' },
    { id: 'app_gas', kind: 'gas', boxId: base.id, offsetX: 160, width: 80, hoodKind: 'chimney' }
  );

  const proj = makeProject([w]);
  const res = applySmartKitchenDesign(proj);

  assert.ok(res.placedDoors >= 4, 'Should create sink double doors, gas drawer, and filler doors');
  assert.ok(res.placedHandles >= 4, 'Should install symmetrical handles');

  const outWall = res.next.walls[0];
  const outBase = outWall.boxes.find((b) => b.type === 'base')!;
  const outUpper = outWall.boxes.find((b) => b.type === 'wall')!;

  // Gas span has drawer
  const gasDrawer = outBase.doors.find((d) => d.kind === 'drawer');
  assert.ok(gasDrawer, 'Gas bay must receive multi-tier drawer unit');
  assert.equal(gasDrawer.startCm, 160);

  // Dead <30cm left sliver (0..20cm) is eliminated by nudging sink flush to 0..90cm
  const outSink = outWall.appliances.find((a) => a.id === 'app_sink')!;
  assert.equal(outSink.offsetX, 0, 'Smart solver nudges sink to eliminate <30cm dead sliver');

  // Sink bay on upper cabinet should have dish-rack lift door, gas chimney span stays empty
  const sinkLift = outUpper.doors.find(
    (d) =>
      d.kind === 'lift' &&
      d.startCm <= outSink.offsetX + 5 &&
      d.startCm + d.widthCm >= outSink.offsetX + outSink.width - 5
  );
  assert.ok(sinkLift, 'Wall cabinet above sink should get dish-rack lift door');

  const overlapsGasHood = outUpper.doors.some(
    (d) => d.startCm + d.widthCm > 162 && d.startCm < 238
  );
  assert.equal(overlapsGasHood, false, 'Chimney hood zone above gas must stay clear of doors');

  // Doors never overlap one another
  const sortedBaseDoors = [...outBase.doors].sort((a, b) => a.startCm - b.startCm);
  for (let i = 1; i < sortedBaseDoors.length; i++) {
    assert.ok(
      sortedBaseDoors[i].startCm >= sortedBaseDoors[i - 1].startCm + sortedBaseDoors[i - 1].widthCm - 0.2,
      'Base doors must not overlap'
    );
  }
});

test('applySmartKitchenDesign respects neoclassic style and corner blocked zones', () => {
  const wA = createWall('دیوار ۱', 0, 0, 240, 0, 1);
  const wB = createWall('دیوار ۲', 240, 0, 240, 220, 1);
  wA.boxes.push(createEmptyBox('base', 0, 240));
  wB.boxes.push(createEmptyBox('base', 62, 158));

  const proj = makeProject([wA, wB]);
  proj.designStyle = 'neoclassic';
  proj.cornerOwners = { corner_1: wA.id };

  const res = applySmartKitchenDesign(proj);
  const allDoors = res.next.walls.flatMap((w) => w.boxes.flatMap((b) => b.doors));
  const allHandles = res.next.walls.flatMap((w) => w.boxes.flatMap((b) => b.handles));

  assert.ok(allDoors.length >= 4);
  assert.ok(allDoors.every((d) => d.doorStyle === 'cnc'), 'Neoclassic smart design uses CNC doors');
  assert.ok(allHandles.every((h) => h.style === 'knob'), 'Neoclassic smart design uses knob handles');
});

test('applySmartKitchenDesign gracefully handles empty kitchen', () => {
  const res = applySmartKitchenDesign(makeProject([]));
  assert.equal(res.placedDoors, 0);
  assert.equal(res.placedHandles, 0);
});

test('applySmartKitchenDesign splits 75cm lift doors <=60cm, shelves wall/base units cleanly, and keeps upper doors from shrinking', () => {
  const w = createWall('دیوار ۱', 0, 0, 260, 0, 1);
  const base = createEmptyBox('base', 0, 260);
  base.doors = [
    { id: 'b1', startCm: 0, widthCm: 45, kind: 'door', drawerRatios: [] },
    { id: 'b2', startCm: 45, widthCm: 45, kind: 'door', drawerRatios: [] },
    { id: 'b3', startCm: 90, widthCm: 35, kind: 'door', drawerRatios: [] },
    { id: 'b4', startCm: 125, widthCm: 35, kind: 'door', drawerRatios: [] },
    { id: 'b5', startCm: 160, widthCm: 100, kind: 'drawer', drawerRatios: [0.33, 0.67] },
  ];
  const wallCab = createEmptyBox('wall', 0, 260); // 75cm tall
  w.boxes.push(base, wallCab);
  w.appliances.push({ id: 's1', kind: 'sink', boxId: base.id, offsetX: 0, width: 90, sinkModel: 'steel-2' });

  const res = applySmartKitchenDesign(makeProject([w]));
  const outWall = res.next.walls[0];
  const outBase = outWall.boxes.find((b) => b.type === 'base')!;
  const outUpper = outWall.boxes.find((b) => b.type === 'wall')!;

  // Over-sink lift door splits into 2 horizontal leaves (each 37.5cm <= 60cm) + 1 shelf at 0.5
  const sinkLift = outUpper.doors.find((d) => d.kind === 'lift')!;
  assert.ok(sinkLift);
  assert.deepEqual(sinkLift.drawerRatios, [0.5]);
  const liftShelf = outUpper.shelves.find(
    (sh) => sh.startCm <= 2 && sh.endCm >= 88 && Math.abs(sh.yRatio - 0.5) < 0.02
  );
  assert.ok(liftShelf, 'Over-sink lift bay must have a shelf aligned at 0.5 seam');

  // Remaining vertical wall bay [90..260] (170cm) gets 3-4 balanced wide doors (~42.5-56.7cm), NOT chopped to 35cm base seams
  const rightUpperDoors = outUpper.doors.filter((d) => d.startCm >= 89);
  assert.ok(rightUpperDoors.every((d) => d.widthCm >= 40), 'Upper doors must not shrink to 35cm base seams');
  const vertWallShelves = outUpper.shelves.filter((sh) => sh.startCm >= 89);
  assert.equal(vertWallShelves.length, 4, 'Two 75cm vertical wall units should each receive 2 internal shelves');

  // Sink base [0..90] & drawer [160..260] have NO shelves; regular base hinged [90..160] gets 1 middle shelf
  const sinkBaseShelves = outBase.shelves.filter((sh) => sh.startCm < 88);
  assert.equal(sinkBaseShelves.length, 0, 'Under-sink base unit must NOT get internal shelves');
  const drawerShelves = outBase.shelves.filter((sh) => sh.endCm > 162);
  assert.equal(drawerShelves.length, 0, 'Drawer unit must NOT get internal shelves');
  const regBaseShelves = outBase.shelves.filter((sh) => sh.startCm >= 89 && sh.endCm <= 161);
  assert.equal(regBaseShelves.length, 1, 'Regular base hinged unit should get 1 middle shelf');
  assert.ok(Math.abs(regBaseShelves[0].yRatio - 0.5) < 0.02);
});

