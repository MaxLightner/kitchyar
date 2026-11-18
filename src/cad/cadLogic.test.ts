import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  addShelvesWithMinGap,
  addVerticalDividerWithCenterSnap,
  alignApplianceOnBoxFront,
  applyDoorBrushPreview,
  applyDoorDrawerBand,
  applyDoorStyleToDoors,
  applyFullBoxFrame,
  applyHandlesToBoxDoors,
  applyHardwareKindToDoors,
  autoUnitizeBoxForHandles,
  canDoorOpenIn3D,
  carveBoxesForPlacedBox,
  clampBoxInternalsAfterResize,
  clampShelfRatioWithMinGap,
  computeCabinetSweepRange,
  computeDoorBrushPreview,
  computeWallBacksplashSpans,
  createEmptyBox,
  createWall,
  deleteApplianceHierarchically,
  deleteBoxHierarchically,
  equalizeDoorsInBox,
  equalizeDoorsAndFillGaps,
  equalizeHorizontalInBox,
  equalizeVerticalDoorsInBox,
  compactDisconnectedDoorsInBox,
  alignWallAndBaseDoorSeams,
  eraseDoorWithRule,
  getBoxCarpentryElements,
  getBoxFrameInsets,
  getBoxInteriorHeightCm,
  getBoxSideExposure,
  getDoorsInHorizontalRange,
  getFreeMoveRangeForBox,
  getMaxVerticalDoorCount,
  getUnitsInBox,
  mirrorBoxLayout,
  moveApplianceHierarchically,
  moveBoxHierarchically,
  moveUnitInBoxWithDoorsSync,
  optimizeBoxUnitsSmart,
  optimizeBoxWithAppliances,
  placeApplianceWithCabinetRules,
  placeFrameOnBox,
  placeFridgeOnWall,
  removeUnitDividerWithSync,
  resizeDoorSafely,
  resizeDoorSeamCoupled,
  resizeDrawerUnitWidthCm,
  resizeUnitDividerWithDoorsSync,
  resizeWallCabinetsSynchronized,
  snapFrameWidthCm,
  syncHoodUnitAboveGas,
} from './doorRules';
import { canPlaceHandleInBay } from './handleSpots';
import { createRoomColumn, getWallColumnSpans, updateRoomColumn } from './openingRules';
import {
  APPLIANCE_CONFIGS,
  DRAWER_PATTERNS,
  FRAME_WIDTH_OPTIONS,
  FRIDGE_FRAME_CM,
  MAX_LIFT_DOOR_CM,
  MIN_LIFT_DOOR_CM,
  MIN_PANTRY_CM,
  MIN_SHELF_GAP_CM,
  SINK_MODELS,
  SINK_MODEL_ORDER,
} from './constants';
import {
  createWallOpening,
  findCollidingOpening,
  updateOpeningGeometry,
} from './openingRules';
import {
  analyzeCornerJunction,
  autoOrientWallsOnAdd,
  collectSmartWallNodes,
  computeMultiWallSweep,
  detectCornerJunctions,
  getCornerBlockedZonesForWall,
  getOutsideCornerBridges,
  getPlanPolygonForBox,
  getPlanVisualSpanForBox,
  getWallVectors,
  makeCornerKey,
  moveConnectedWall,
  moveSmartWallNode,
  toggleCornerOwner,
} from './cornerLogic';
import { buildPresetProject } from './presets';
import {
  buildArScannedWall,
  computeScaleFromRealDistanceCm,
  fitCalibrationDragABWithScale,
  fitCalibrationDragB,
  projectArPointOntoWalls,
} from '../ar/arCalibration';
import { FloorScanner } from '../ar/floorScanner';
import { applyKitchenStylePreset, KITCHEN_STYLE_PRESETS } from './stylePresets';
import {
  applyAnimatedDoorProgress,
  buildKitchen3DScene,
  easeInOutSoftClose,
} from './scene3dBuilder';

test('Door Brush obeys 30..60cm rule when placing and splitting doors', () => {
  const box = createEmptyBox('base', 0, 120);

  // Place first door in empty 120cm box -> 60cm door
  const p1 = computeDoorBrushPreview(box, 20, 'vertical', 1, 0, 0, []);
  assert.equal(p1.ok, true);
  assert.equal(p1.items[0].widthCm, 60);
  applyDoorBrushPreview(box, 20, p1);
  assert.equal(box.doors.length, 1);

  // Split 60cm door -> two 30cm doors
  const p2 = computeDoorBrushPreview(box, 25, 'vertical', 1, 0, 0, []);
  assert.equal(p2.ok, true);
  assert.equal(p2.items.length, 2);
  assert.equal(p2.items[0].widthCm, 30);
  applyDoorBrushPreview(box, 25, p2);
  assert.equal(box.doors.length, 2);

  // Fill remaining 60cm -> 60cm, then split it -> 4x30cm doors
  applyDoorBrushPreview(box, 90, computeDoorBrushPreview(box, 90, 'vertical', 1, 0, 0, []));
  applyDoorBrushPreview(box, 90, computeDoorBrushPreview(box, 90, 'vertical', 1, 0, 0, []));
  assert.equal(box.doors.length, 4);

  // Attempting to add a 5th door (<30cm) must fail cleanly
  const p5 = computeDoorBrushPreview(box, 10, 'vertical', 1, 0, 0, []);
  assert.equal(p5.ok, false);
});

test('Horizontal Door Brush creates drawers on base and enforces 1-vs-2 horizontal lift rule on wall', () => {
  const base = createEmptyBox('base', 0, 120);
  const pBase = computeDoorBrushPreview(base, 30, 'horizontal', 1, 2 /* stepped 3 */, 0, []);
  assert.equal(pBase.ok, true);
  assert.equal(pBase.items[0].kind, 'drawer');
  assert.deepEqual(pBase.items[0].drawerRatios, [0.22, 0.54]);

  // Wall-deep box height <= 60cm (45cm) uses 1 horizontal lift door ([])
  const shallowWallCab = createEmptyBox('wall-deep', 0, 120);
  const pShallowWall = computeDoorBrushPreview(shallowWallCab, 30, 'horizontal', 1, 0, 1, []);
  assert.equal(pShallowWall.ok, true);
  assert.equal(pShallowWall.items[0].kind, 'lift');
  assert.deepEqual(pShallowWall.items[0].drawerRatios, []);

  // Standard 75cm wall box (>60cm) automatically splits vertically into 2 horizontal doors ([0.5]) so each <= 60cm
  const stdWallCab = createEmptyBox('wall', 0, 120);
  const pStdWall = computeDoorBrushPreview(stdWallCab, 30, 'horizontal', 1, 0, 1, []);
  assert.equal(pStdWall.ok, true);
  assert.equal(pStdWall.items[0].kind, 'lift');
  assert.deepEqual(pStdWall.items[0].drawerRatios, [0.5]);

  // Extra tall >120cm wall cab splits into 3 horizontal doors ([0.333, 0.667])
  const tallWallCab = createEmptyBox('wall', 0, 120);
  tallWallCab.height = 135;
  const pWall = computeDoorBrushPreview(tallWallCab, 30, 'horizontal', 1, 0, 1, []);
  assert.equal(pWall.ok, true);
  assert.equal(pWall.items[0].kind, 'lift');
  assert.deepEqual(pWall.items[0].drawerRatios, [0.333, 0.667]);

  // Over-fridge wall-deep box <= 60cm uses 1 horizontal door ([])
  const overFridge = createEmptyBox('wall-deep', 0, 100);
  overFridge.height = 45;
  overFridge.linkedToBoxId = 'fridge_1';
  const pFridge = computeDoorBrushPreview(overFridge, 30, 'horizontal', 1, 0, 1, []);
  assert.equal(pFridge.ok, true);
  assert.deepEqual(pFridge.items[0].drawerRatios, []);
});

test('Erase door merges only if combined <= 60cm, otherwise leaves space empty', () => {
  const box = createEmptyBox('base', 0, 120);
  box.doors = [
    { id: 'd1', startCm: 0, widthCm: 30, kind: 'door', drawerRatios: [] },
    { id: 'd2', startCm: 30, widthCm: 30, kind: 'door', drawerRatios: [] },
    { id: 'd3', startCm: 60, widthCm: 50, kind: 'door', drawerRatios: [] },
  ];

  // Deleting d2 merges into d1 (30+30=60 <= 60)
  eraseDoorWithRule(box, 'd2');
  assert.equal(box.doors.length, 2);
  assert.equal(box.doors[0].widthCm, 60);

  // Deleting d3 cannot merge with 60cm d1 (60+50=110 > 60), so leaves empty gap
  eraseDoorWithRule(box, 'd3');
  assert.equal(box.doors.length, 1);
  assert.equal(box.doors[0].widthCm, 60);
});

test('Bidirectional L-corner logic blocks doors in corner zone from BOTH walls without overlap', () => {
  const project = buildPresetProject('L');
  const w1 = project.walls[0];
  const w2 = project.walls[1];

  const junctions = detectCornerJunctions(project.walls, project.cornerOwners);
  assert.equal(junctions.length, 1);

  const zonesW1 = getCornerBlockedZonesForWall(w1, project.walls, project.cornerOwners);
  const zonesW2 = getCornerBlockedZonesForWall(w2, project.walls, project.cornerOwners);

  // Both walls see a blocked lower corner zone of 60cm!
  const w1Lower = zonesW1.find((z) => z.tier === 'lower');
  const w2Lower = zonesW2.find((z) => z.tier === 'lower');
  assert.ok(w1Lower);
  assert.ok(w2Lower);
  assert.equal(w1Lower.depthCm, 60);
  assert.equal(w2Lower.depthCm, 60);
  assert.equal(w1Lower.role, 'blind-behind');
  assert.equal(w2Lower.role, 'side-profile');

  // Cannot place a door inside the 0..60cm blind zone on w1's base box
  const base1 = w1.boxes[0];
  const tryBlind = computeDoorBrushPreview(base1, 25, 'vertical', 1, 0, 0, zonesW1);
  assert.equal(tryBlind.ok, false);

  // Flipping corner owner to w2 swaps the blind/side roles cleanly
  const key = makeCornerKey(w1.id, 'start', w2.id, 'start');
  project.cornerOwners = toggleCornerOwner(project.walls, project.cornerOwners, key);
  const flippedW1 = getCornerBlockedZonesForWall(w1, project.walls, project.cornerOwners);
  const flippedW2 = getCornerBlockedZonesForWall(w2, project.walls, project.cornerOwners);
  assert.equal(flippedW1.find((z) => z.tier === 'lower')?.role, 'side-profile');
  assert.equal(flippedW2.find((z) => z.tier === 'lower')?.role, 'blind-behind');

  // Plan visual span trims non-owner boxes so they never overlap in plan
  const span1 = getPlanVisualSpanForBox(w1.boxes[0], w1, project.walls, project.cornerOwners);
  assert.equal(span1.startCm, 60);
});

test('Sink creates 2-door dedicated unit and Gas creates 3-stepped drawers beneath', () => {
  const w = createWall('دیوار تست', 0, 0, 300, 0);
  const base = createEmptyBox('base', 0, 300);
  w.boxes.push(base);

  const rSink = placeApplianceWithCabinetRules(w, [w], 'sink', base, 20, {});
  assert.equal(rSink.ok, true);
  assert.equal(base.doors.length, 2);
  assert.equal(base.doors[0].widthCm, 45);
  assert.equal(base.doors[1].widthCm, 45);

  const rGas = placeApplianceWithCabinetRules(w, [w], 'gas', base, 140, {});
  assert.equal(rGas.ok, true);
  const gasDrawer = base.doors.find((d) => d.kind === 'drawer');
  assert.ok(gasDrawer);
  assert.equal(gasDrawer.widthCm, 80);
  assert.deepEqual(gasDrawer.drawerRatios, [0.22, 0.54]);
});

test('Resizing box clamps doors and resizing door never overlaps neighbor', () => {
  const box = createEmptyBox('base', 0, 120);
  box.doors = [
    { id: 'd1', startCm: 0, widthCm: 40, kind: 'door', drawerRatios: [] },
    { id: 'd2', startCm: 60, widthCm: 50, kind: 'door', drawerRatios: [] },
  ];

  // Try resizing d1 to 80cm -> clamped to 60cm (neighbor start & MAX_DOOR_CM)
  const clamped = resizeDoorSafely(box, 'd1', 80, []);
  assert.equal(clamped, 60);

  // Shrink box width to 80cm -> d2 is clamped/removed if <30cm
  box.width = 80;
  clampBoxInternalsAfterResize(box);
  assert.equal(box.doors.length, 1);

  // Equalize doors on a 100cm box with two doors
  const box2 = createEmptyBox('base', 0, 100);
  box2.doors = [
    { id: 'a', startCm: 0, widthCm: 40, kind: 'door', drawerRatios: [] },
    { id: 'b', startCm: 40, widthCm: 60, kind: 'door', drawerRatios: [] },
  ];
  const eq = equalizeDoorsInBox(box2, []);
  assert.equal(eq.ok, true);
  assert.equal(box2.doors[0].widthCm, 50);
  assert.equal(box2.doors[1].widthCm, 50);
});

test('Auto-orients RTL 4-wall layout inward and classifies 90°, 135° inside, and 225° outside corners', () => {
  // User draws right-to-left: w1 goes UP, w2 goes LEFT, w3 goes DOWN-LEFT (135°), w4 goes LEFT (225° outer bend)
  const w1 = createWall('دیوار 1', 300, 200, 300, -90, 1);
  const w2 = autoOrientWallsOnAdd([w1], createWall('دیوار 2', 300, -90, -130, -90, 1));
  const walls = [w1, w2];
  const w3 = autoOrientWallsOnAdd(walls, createWall('دیوار 3', -130, -90, -320, 100, 1));
  walls.push(w3);
  const w4 = autoOrientWallsOnAdd(walls, createWall('دیوار 4', -320, 100, -570, 100, 1));
  walls.push(w4);

  // All 4 normals must point into the room interior (w1 left, w2 down, w3 down-right, w4 down)
  assert.ok(getWallVectors(w1).nx < -0.9, 'w1 should face left (interior)');
  assert.ok(getWallVectors(w2).ny > 0.9, 'w2 should face down (interior)');
  assert.ok(getWallVectors(w3).nx > 0.5 && getWallVectors(w3).ny > 0.5, 'w3 should face down-right (interior)');
  assert.ok(getWallVectors(w4).ny > 0.9, 'w4 should face down (interior)');

  const g12 = analyzeCornerJunction(w1, 'end', w2, 'start');
  const g23 = analyzeCornerJunction(w2, 'end', w3, 'start');
  const g34 = analyzeCornerJunction(w3, 'end', w4, 'start');
  assert.equal(g12.kind, 'inside-90');
  assert.equal(g23.kind, 'inside-angled');
  assert.equal(g23.getSetbackCm(60), 25); // 60 / tan(67.5°) ≈ 25cm
  assert.equal(g34.kind, 'outside');
  assert.equal(g34.getSetbackCm(60), 0);
});

test('Multi-wall sweep connects all 4 walls continuously with mitered 135° corners and outside caps', () => {
  const w1 = createWall('دیوار 1', 300, 200, 300, -90, 1);
  const w2 = autoOrientWallsOnAdd([w1], createWall('دیوار 2', 300, -90, -130, -90, 1));
  const walls = [w1, w2];
  const w3 = autoOrientWallsOnAdd(walls, createWall('دیوار 3', -130, -90, -320, 100, 1));
  walls.push(w3);
  const w4 = autoOrientWallsOnAdd(walls, createWall('دیوار 4', -320, 100, -570, 100, 1));
  walls.push(w4);

  // Sweep from w1 (near bottom) all the way to w4 (near far left)
  const sweep = computeMultiWallSweep(walls, w1.id, 40, w4.id, 210, 'base', {}, true);
  assert.equal(sweep.segments.length, 4);

  // Place boxes from sweep
  const owners = { ...sweep.suggestedOwners };
  for (const seg of sweep.segments) {
    const w = walls.find((x) => x.id === seg.wallId)!;
    assert.ok(seg.startCm >= 0 && seg.startCm + seg.widthCm <= w.length);
    w.boxes.push(createEmptyBox('base', seg.startCm, seg.widthCm));
  }

  // Verify w1 owns corner 1-2 so w2 starts at 60cm, while w2-w3 and w3-w4 connect at 0
  assert.equal(sweep.segments[0].startCm + sweep.segments[0].widthCm, w1.length);
  assert.equal(sweep.segments[1].startCm, 60);
  assert.equal(sweep.segments[1].startCm + sweep.segments[1].widthCm, w2.length);
  assert.equal(sweep.segments[2].startCm, 0);
  assert.equal(sweep.segments[2].widthCm, w3.length);
  assert.equal(sweep.segments[3].startCm, 0);

  // Verify w1-w2 (90°), w2-w3 (135°), and w3-w4 (225° outside) ALL meet along a single clean miter line!
  const poly1 = getPlanPolygonForBox(w1.boxes[0], w1, walls, owners);
  const poly2 = getPlanPolygonForBox(w2.boxes[0], w2, walls, owners);
  const poly3 = getPlanPolygonForBox(w3.boxes[0], w3, walls, owners);
  const poly4 = getPlanPolygonForBox(w4.boxes[0], w4, walls, owners);
  assert.ok(Math.hypot(poly1[2].x - poly2[3].x, poly1[2].y - poly2[3].y) <= 1.5, '90° miter matches');
  assert.ok(Math.hypot(poly2[2].x - poly3[3].x, poly2[2].y - poly3[3].y) <= 1.5, '135° miter matches');
  assert.ok(Math.hypot(poly3[2].x - poly4[3].x, poly3[2].y - poly4[3].y) <= 1.5, '225° outside miter matches');

  // No separate bridge polygons needed (zero double seam lines)
  const bridges = getOutsideCornerBridges(walls, owners);
  assert.equal(bridges.length, 0);

  // Single tap near end of w1 must NEVER overhang past wall length
  const tapEnd = computeMultiWallSweep(walls, w1.id, w1.length - 5, w1.id, w1.length - 5, 'base', owners, false);
  assert.equal(tapEnd.segments.length, 1);
  assert.ok(tapEnd.segments[0].startCm + tapEnd.segments[0].widthCm <= w1.length);
});

test('Click-click Door Brush places 60cm doors then shrinks neighbors down to 30cm, refusing <30cm', () => {
  const box = createEmptyBox('base', 0, 100);

  // Click 1 -> 60cm door
  const p1 = computeDoorBrushPreview(box, 10, 'vertical', 1, 0, 0, []);
  assert.equal(p1.ok, true);
  assert.equal(p1.items[0].widthCm, 60);
  applyDoorBrushPreview(box, 10, p1);

  // Click 2 in remaining 40cm -> 40cm door
  const p2 = computeDoorBrushPreview(box, 80, 'vertical', 1, 0, 0, []);
  assert.equal(p2.ok, true);
  assert.equal(p2.items[0].widthCm, 40);
  applyDoorBrushPreview(box, 80, p2);
  assert.deepEqual(box.doors.map((d) => d.widthCm), [60, 40]);

  // Click 3 on 40cm door -> shrinks [60, 40] down to [40, 30, 30]
  const p3 = computeDoorBrushPreview(box, 80, 'vertical', 1, 0, 0, []);
  assert.equal(p3.ok, true);
  applyDoorBrushPreview(box, 80, p3);
  assert.equal(box.doors.length, 3);
  assert.ok(box.doors.every((d) => d.widthCm >= 30));

  // Click 4 -> 4 * 30 = 120 > 100 -> must refuse
  const p4 = computeDoorBrushPreview(box, 80, 'vertical', 1, 0, 0, []);
  assert.equal(p4.ok, false);
});

test('Drawers & horizontal doors auto-create unit dividers; shelves target whole Units and block drawers', () => {
  const box = createEmptyBox('base', 0, 180);
  // Place 60cm door + 60cm door + 60cm drawer
  applyDoorBrushPreview(box, 10, computeDoorBrushPreview(box, 10, 'vertical', 1, 0, 0, []));
  applyDoorBrushPreview(box, 70, computeDoorBrushPreview(box, 70, 'vertical', 1, 0, 0, []));
  applyDoorBrushPreview(box, 150, computeDoorBrushPreview(box, 150, 'horizontal', 1, 1, 0, []));

  // Drawer auto-created a unit divider at 120cm!
  assert.ok(box.unitDividers.includes(120));

  const units = getUnitsInBox(box, []);
  assert.equal(units.length, 2);
  // Unit 1 (0..120) has 2 hinged doors -> valid 120cm unit for shelves spanning across BOTH doors!
  assert.equal(units[0].startCm, 0);
  assert.equal(units[0].endCm, 120);
  assert.equal(units[0].canHaveShelves, true);
  // Unit 2 (120..180) is drawer -> cannot take shelves!
  assert.equal(units[1].hasDrawer, true);
  assert.equal(units[1].canHaveShelves, false);

  // A manually undivided 180cm box with 3 hinged doors must require defining unit divider first
  const boxManual = createEmptyBox('base', 0, 180);
  boxManual.doors = [
    { id: 'md1', startCm: 0, widthCm: 60, kind: 'door', drawerRatios: [] },
    { id: 'md2', startCm: 60, widthCm: 60, kind: 'door', drawerRatios: [] },
    { id: 'md3', startCm: 120, widthCm: 60, kind: 'door', drawerRatios: [] },
  ];
  const undivided = getUnitsInBox(boxManual, []);
  assert.equal(undivided[0].canHaveShelves, false);
  boxManual.unitDividers.push(120);
  const divided = getUnitsInBox(boxManual, []);
  assert.equal(divided.length, 2);
  assert.equal(divided[0].canHaveShelves, true);
  assert.equal(divided[1].canHaveShelves, true);

  // Placing 3 hinged doors keeps run undivided until explicit Smart Unitize
  const box3 = createEmptyBox('base', 0, 180);
  applyDoorBrushPreview(box3, 10, computeDoorBrushPreview(box3, 10, 'vertical', 3, 0, 0, []));
  assert.equal(box3.unitDividers.length, 0);
  optimizeBoxUnitsSmart(box3, null, [], []);
  const autoUnits = getUnitsInBox(box3, []);
  assert.equal(autoUnits.length, 2);
  assert.equal(autoUnits[0].canHaveShelves, true);
  assert.equal(autoUnits[1].canHaveShelves, true);
});

test('Door Brush supports direct targetDoorWidthCm < 60 (e.g. 40cm and 35cm) in empty bays', () => {
  const box = createEmptyBox('base', 0, 120);

  const p40 = computeDoorBrushPreview(box, 10, 'vertical', 1, 0, 0, [], 40);
  assert.equal(p40.ok, true);
  assert.equal(p40.items.length, 1);
  assert.equal(p40.items[0].widthCm, 40);
  applyDoorBrushPreview(box, 10, p40);

  const p35 = computeDoorBrushPreview(box, 55, 'vertical', 1, 0, 0, [], 35);
  assert.equal(p35.ok, true);
  assert.equal(p35.items.length, 1);
  assert.equal(p35.items[0].widthCm, 35);
  applyDoorBrushPreview(box, 55, p35);

  assert.deepEqual(
    box.doors.map((d) => d.widthCm),
    [40, 35]
  );
});

test('Multiple sinks/gases allowed without overlap; dishwasher/washing reserve 60cm bay', () => {
  const w = createWall('دیوار مطبخ و آشپزخانه', 0, 0, 420, 0);
  const base = createEmptyBox('base', 0, 420);
  w.boxes.push(base);

  const sink1 = placeApplianceWithCabinetRules(w, [w], 'sink', base, 0, {});
  assert.equal(sink1.ok, true);

  // Second sink in another spot (e.g., dirty kitchen / island wall) succeeds cleanly
  const sink2 = placeApplianceWithCabinetRules(w, [w], 'sink', base, 200, {});
  assert.equal(sink2.ok, true);
  assert.equal(w.appliances.filter((a) => a.kind === 'sink').length, 2);

  // Dishwasher placed cleanly inside remaining free span creates unit dividers and no doors
  const dw = placeApplianceWithCabinetRules(w, [w], 'dishwasher', base, 100, {});
  assert.equal(dw.ok, true);
  assert.equal(dw.appliance?.width, 60);

  // Clicking outside the sink in remaining 10cm spot where 60cm dishwasher cannot fit fails cleanly
  const smallWall = createWall('دیوار کوچک', 0, 0, 100, 0);
  const smallBase = createEmptyBox('base', 0, 100);
  smallWall.boxes.push(smallBase);
  assert.equal(placeApplianceWithCabinetRules(smallWall, [smallWall], 'sink', smallBase, 0, {}).ok, true);
  const overlapFail = placeApplianceWithCabinetRules(smallWall, [smallWall], 'dishwasher', smallBase, 65, {});
  assert.equal(overlapFail.ok, false);
});

test('Fridge placement supports single (70+10), side-by-side (92+10), twin (120+10) with 5cm frame and aligned upper cabinet', () => {
  const w = createWall('دیوار یخچال', 0, 0, 400, 0);

  const f1 = placeFridgeOnWall(w, [w], 'single', 0, {});
  assert.equal(f1.ok, true);
  const b1 = w.boxes.find((b) => b.id === f1.fridgeId);
  assert.equal(b1?.width, 70 + FRIDGE_FRAME_CM * 2);
  assert.equal(b1?.height, 185 + FRIDGE_FRAME_CM);
  assert.equal(b1?.fridgeModel, 'single');
  assert.equal(b1?.frames?.length, 3);

  const f2 = placeFridgeOnWall(w, [w], 'side-by-side', 85, {});
  assert.equal(f2.ok, true);
  const b2 = w.boxes.find((b) => b.id === f2.fridgeId);
  assert.equal(b2?.width, 92 + FRIDGE_FRAME_CM * 2);

  const f3 = placeFridgeOnWall(w, [w], 'twin', 200, {});
  assert.equal(f3.ok, true);
  const b3 = w.boxes.find((b) => b.id === f3.fridgeId);
  assert.equal(b3?.width, 120 + FRIDGE_FRAME_CM * 2);

  // Each fridge auto-spawns a matching 'wall-deep' lift cabinet above it
  assert.equal(w.boxes.filter((b) => b.type === 'wall-deep').length, 3);

  // Overlapping fridge placement is rejected
  const fOverlap = placeFridgeOnWall(w, [w], 'single', 90, {});
  assert.equal(fOverlap.ok, false);
});

test('Openings (window, room door, column) resize cleanly and detect tier-aware cabinet collisions', () => {
  const w = createWall('دیوار پنجره‌دار', 0, 0, 350, 0);
  const win = createWallOpening('window', 100, w);
  w.openings = [win];

  // Window defaults: width 120, elevY 105, height 120 (105..225)
  // Base cabinet (0..86) passes freely under the high window!
  assert.equal(findCollidingOpening(w, 80, 240, 0, 86), null);

  // Wall cabinet (145..220) collides with the window!
  assert.equal(findCollidingOpening(w, 80, 240, 145, 75)?.id, win.id);

  // Interactive resize clamps cleanly to wall boundaries
  updateOpeningGeometry(win, w, { offsetX: 300, width: 100, elevY: 120, height: 90 });
  assert.equal(win.offsetX, 250); // clamped to 350 - 100
  assert.equal(win.width, 100);
  assert.equal(win.elevY, 120);
  assert.equal(win.height, 90);

  // Room door (elevY=0, height=210) collides with both base & wall cabinets
  const doorOp = createWallOpening('door', 10, w);
  w.openings.push(doorOp);
  assert.equal(findCollidingOpening(w, 0, 120, 0, 86)?.id, doorOp.id);
  assert.equal(findCollidingOpening(w, 0, 120, 145, 75)?.id, doorOp.id);
});

test('Smart wall corner nodes resize connected walls together, clamp boxes, and prevent <40cm collapse', () => {
  const w1 = createWall('دیوار 1 (200)', 0, 0, 200, 0, 1);
  const w2 = createWall('دیوار 2 (200)', 200, 0, 200, 200, 1);
  w1.boxes.push(createEmptyBox('base', 0, 200));

  const nodes = collectSmartWallNodes([w1, w2]);
  const sharedCorner = nodes.find((n) => n.refs.length === 2);
  assert.ok(sharedCorner, 'Expected shared corner node connecting w1 end & w2 start');

  // Drag corner node left by 40cm -> w1 shrinks to 160, w2 tilts diagonally and clamps box cleanly
  const moved = moveSmartWallNode([w1, w2], sharedCorner.refs, 160, 0);
  assert.equal(moved, true);
  assert.equal(w1.length, 160);
  assert.ok(w1.name.includes('(160)'));
  assert.equal(w1.boxes[0].width, 160);

  // Attempting to collapse wall below 40cm must be blocked cleanly
  const collapsed = moveSmartWallNode([w1, w2], sharedCorner.refs, 20, 0);
  assert.equal(collapsed, false);
  assert.equal(w1.length, 160);
});

test('Clicking existing appliance replaces it directly, and optimizeBoxWithAppliances eliminates dead slivers', () => {
  const w = createWall('دیوار آشپزخانه', 0, 0, 250, 0);
  const base = createEmptyBox('base', 0, 250);
  w.boxes.push(base);

  // 1. Place Sink at 20..110, then click Gas right over Sink -> replaces Sink with Gas!
  const rSink = placeApplianceWithCabinetRules(w, [w], 'sink', base, 20, {});
  assert.equal(rSink.ok, true);
  assert.equal(w.appliances.length, 1);

  const rGas = placeApplianceWithCabinetRules(w, [w], 'gas', base, 25, {});
  assert.equal(rGas.ok, true);
  assert.equal(rGas.replaced, true);
  assert.equal(w.appliances.length, 1);
  assert.equal(w.appliances[0].kind, 'gas');
  assert.equal(base.doors.some((d) => d.kind === 'drawer'), true);

  // 2. Place Sink at 0..90 and Dishwasher poorly leaving a <30cm gap, then optimize
  w.appliances = [];
  base.doors = [];
  base.unitDividers = [];
  placeApplianceWithCabinetRules(w, [w], 'sink', base, 0, {});
  // Force an awkward loose dishwasher manually at 110..170 (20cm dead sliver next to sink!)
  w.appliances.push({ id: 'dw1', kind: 'dishwasher', offsetX: 110, width: 60 });
  const opt = optimizeBoxWithAppliances(w, [w], base, {});
  assert.equal(opt.ok, true);
  const dw = w.appliances.find((a) => a.id === 'dw1');
  assert.equal(dw?.offsetX, 91); // retain a 1 cm installation gap at the sink unit
});

test('Fridge auto-carves continuous existing base, wall, and tall cabinets into valid >=30cm remainders', () => {
  const w = createWall('دیوار سراسری', 0, 0, 300, 0);
  w.boxes.push(createEmptyBox('base', 0, 300));
  w.boxes.push(createEmptyBox('wall', 0, 300));

  // Place 90cm side-by-side fridge (92 + 10cm 5cm-frame = 102cm) at 100..202 -> splits 300cm boxes into 0..100 and 202..300!
  const res = placeFridgeOnWall(w, [w], 'side-by-side', 100, {});
  assert.equal(res.ok, true);
  assert.equal(res.carved, true);

  const bases = w.boxes.filter((b) => b.type === 'base').sort((a, b) => a.offsetX - b.offsetX);
  assert.equal(bases.length, 2);
  assert.equal(bases[0].offsetX, 0);
  assert.equal(bases[0].width, 100);
  assert.equal(bases[1].offsetX, 202);
  assert.equal(bases[1].width, 98);

  const wallsCabs = w.boxes.filter((b) => b.type === 'wall').sort((a, b) => a.offsetX - b.offsetX);
  assert.equal(wallsCabs.length, 2);
  assert.ok(w.boxes.some((b) => b.type === 'fridge' && b.width === 102));
});

test('Coupled door seam resize widens one door and shrinks its touching neighbor cleanly', () => {
  const box = createEmptyBox('base', 0, 100);
  box.doors = [
    { id: 'd1', startCm: 0, widthCm: 50, kind: 'door', drawerRatios: [] },
    { id: 'd2', startCm: 50, widthCm: 50, kind: 'door', drawerRatios: [] },
  ];
  box.unitDividers = [50];

  const applied = resizeDoorSeamCoupled(box, 'd1', 8);
  assert.equal(applied, 8);
  assert.equal(box.doors[0].widthCm, 58);
  assert.equal(box.doors[1].startCm, 58);
  assert.equal(box.doors[1].widthCm, 42);
  assert.deepEqual(box.unitDividers, [58]);

  // Respects 60cm/30cm bounds when pushed too far
  const capped = resizeDoorSeamCoupled(box, 'd1', 20);
  assert.equal(capped, 2);
  assert.equal(box.doors[0].widthCm, 60);
  assert.equal(box.doors[1].widthCm, 40);
});

test('Dragging a whole wall keeps connected wall junctions attached (or moves component rigidly)', () => {
  const project = buildPresetProject('L');
  const w1 = project.walls[0];
  const w2 = project.walls[1];
  const origStart = { x: w1.x1Cm, y: w1.y1Cm };
  const origW2End = { x: w2.x2Cm, y: w2.y2Cm };

  // Move w1 by (+30, +20) with junction flexing -> w2's connected endpoint moves with w1!
  const ok = moveConnectedWall(project.walls, w1.id, 30, 20, false);
  assert.equal(ok, true);
  assert.equal(w1.x1Cm, origStart.x + 30);
  assert.equal(w1.y1Cm, origStart.y + 20);
  // Connected junction on w2 follows w1 seamlessly
  assert.equal(Math.hypot(w2.x1Cm - w1.x1Cm, w2.y1Cm - w1.y1Cm) < 0.1, true);
  // Distant endpoint of w2 stayed anchored
  assert.equal(w2.x2Cm, origW2End.x);
  assert.equal(w2.y2Cm, origW2End.y);

  // Move entire connected component rigidly by (+25, -15)
  const w2Before = { x1: w2.x1Cm, y1: w2.y1Cm, x2: w2.x2Cm, y2: w2.y2Cm };
  const okRigid = moveConnectedWall(project.walls, w1.id, 25, -15, true);
  assert.equal(okRigid, true);
  assert.equal(w2.x1Cm, w2Before.x1 + 25);
  assert.equal(w2.x2Cm, w2Before.x2 + 25);
  assert.equal(w2.y2Cm, w2Before.y2 - 15);
});

test('Resizing wall from start keeps stationary cabinets & boxId-linked appliances anchored to end', () => {
  const w = createWall('دیوار تست (300)', 0, 0, 300, 0);
  const box = createEmptyBox('base', 100, 150); // spans 100..250 -> 50cm from wall end!
  w.boxes.push(box);
  const appRes = placeApplianceWithCabinetRules(w, [w], 'sink', box, 120, {});
  assert.equal(appRes.ok, true);
  const appBeforeDistFromEnd = 300 - appRes.appliance!.offsetX;

  // Shrink wall start from x=0 to x=60 -> new length 240; box & sink keep exact distance from wall end!
  const refs = [{ wallId: w.id, end: 'start' as const }];
  const ok = moveSmartWallNode([w], refs, 60, 0);
  assert.equal(ok, true);
  assert.equal(w.length, 240);
  assert.equal(box.offsetX, 40); // 100 - 60 = 40 -> still 50cm from end!
  assert.equal(w.length - w.appliances[0].offsetX, appBeforeDistFromEnd);
});

test('Hierarchical move of base/fridge/closet shifts coupled appliances & over-fridge boxes and respects bounds', () => {
  const w = createWall('دیوار سلسله‌مراتبی', 0, 0, 400, 0);
  const base = createEmptyBox('base', 0, 180);
  w.boxes.push(base);
  placeApplianceWithCabinetRules(w, [w], 'sink', base, 20, {});

  // Add a closet at x=200..300 and verify the base is a barrier while the unconnected wall end is open
  const closet = createEmptyBox('closet', 240, 100);
  w.boxes.push(closet);
  const range = getFreeMoveRangeForBox(w, [w], closet, {});
  assert.equal(range.minX, 180);
  assert.equal(range.maxX, Infinity);

  // Move base by +10 (to 10..190, pushing up to 140 max): attached sink shifts by +10!
  const sinkBefore = w.appliances[0].offsetX;
  const movedBase = moveBoxHierarchically(w, [w], base.id, 10, {});
  assert.ok(movedBase);
  assert.equal(base.offsetX, 10);
  assert.equal(w.appliances[0].offsetX, sinkBefore + 10);

  // Move fridge carries linked wall-deep over-fridge box synchronously
  const w2 = createWall('دیوار یخچال', 0, 0, 300, 0);
  const fRes = placeFridgeOnWall(w2, [w2], 'side-by-side', 20, {});
  assert.equal(fRes.ok, true);
  const fridge = w2.boxes.find((b) => b.id === fRes.fridgeId)!;
  const over = w2.boxes.find((b) => b.type === 'wall-deep')!;
  assert.equal(over.linkedToBoxId, fridge.id);
  moveBoxHierarchically(w2, [w2], fridge.id, 110, {});
  assert.equal(fridge.offsetX, 110);
  assert.equal(over.offsetX, 110);

  // Hierarchical deletion removes linked over-fridge & attached appliances
  deleteBoxHierarchically(w2, fridge.id);
  assert.equal(w2.boxes.length, 0);
  deleteBoxHierarchically(w, base.id);
  assert.equal(w.appliances.length, 0);
});

test('Moving Gas hierarchically carries coupled stepped drawers and unit dividers inside parent box', () => {
  const w = createWall('دیوار گاز', 0, 0, 300, 0);
  const base = createEmptyBox('base', 0, 260);
  w.boxes.push(base);

  const gasRes = placeApplianceWithCabinetRules(w, [w], 'gas', base, 20, {}, 'chimney', {
    customWidth: 80,
  });
  assert.equal(gasRes.ok, true);
  const gas = gasRes.appliance!;
  assert.equal(gas.boxId, base.id);

  const moved = moveApplianceHierarchically(w, [w], gas.id, 120, {});
  assert.ok(moved);
  assert.equal(gas.offsetX, 120);

  const drawer = base.doors.find((d) => d.kind === 'drawer');
  assert.ok(drawer);
  assert.equal(drawer.startCm, 120);
  assert.equal(drawer.widthCm, 80);
  assert.ok(base.unitDividers.includes(120));
  assert.ok(base.unitDividers.includes(200));
});

test('Supports 6 architectural sink models and completely excludes built-in oven doors/appliances', () => {
  assert.deepEqual(SINK_MODEL_ORDER, [
    'steel-2',
    'steel-1',
    'steel-tray-right',
    'steel-tray-left',
    'ceramic-apron',
    'corner-sink',
  ]);
  for (const model of SINK_MODEL_ORDER) {
    assert.ok(SINK_MODELS[model].width >= 60);
  }

  // No 'oven' in APPLIANCE_CONFIGS
  assert.equal('oven' in APPLIANCE_CONFIGS, false);

  // Preset layouts never contain any built-in 'oven' doors
  for (const mode of ['L', 'single', 'U', 'closet'] as const) {
    const preset = buildPresetProject(mode);
    for (const w of preset.walls) {
      for (const b of w.boxes) {
        assert.equal(
          b.doors.some((d) => (d.kind as string) === 'oven'),
          false
        );
      }
    }
  }
});

test('Reversible appliance deletion cleans dedicated doors, handles, orphan dividers & orphan seam frames while keeping shared dividers', () => {
  const w = createWall('دیوار حذف برگشت‌پذیر', 0, 0, 300, 0);
  const base = createEmptyBox('base', 0, 300);
  w.boxes.push(base);

  // Sink at 0..90 (div at 90) and adjacent Dishwasher at 91..151 (divs at 90, 150) and Gas at 180..260 (divs at 180, 260)
  const sRes = placeApplianceWithCabinetRules(w, [w], 'sink', base, 0, {});
  const dRes = placeApplianceWithCabinetRules(w, [w], 'dishwasher', base, 90, {});
  const gRes = placeApplianceWithCabinetRules(w, [w], 'gas', base, 180, {});
  assert.equal(sRes.ok && dRes.ok && gRes.ok, true);

  // Add handles onto sink doors and a seam frame at 180 (shared by gas left edge) and 260 (gas right edge)
  applyHandlesToBoxDoors(base, base.doors.filter((d) => d.kind === 'door').map((d) => d.id), 'simple', 'vertical');
  placeFrameOnBox(base, 'seam', 5, 180);
  placeFrameOnBox(base, 'seam', 5, 260);
  assert.equal(base.handles.length, 2);

  // Delete Gas -> removes stepped drawer, removes div at 180 & 260 AND orphan seam frames at 180 & 260
  deleteApplianceHierarchically(w, gRes.appliance!.id);
  assert.equal(base.doors.some((d) => d.kind === 'drawer'), false);
  assert.equal(base.unitDividers.includes(180), false);
  assert.equal(base.unitDividers.includes(260), false);
  assert.equal(base.frames?.some((f) => f.side === 'seam'), false);

  // Delete Dishwasher at 91..151 -> div at 151 removed, BUT shared div at 90 stays because Sink owns 0..90!
  deleteApplianceHierarchically(w, dRes.appliance!.id);
  assert.equal(base.unitDividers.includes(151), false);
  assert.equal(base.unitDividers.includes(90), true);

  // Delete Sink at 0..90 -> removes under-sink doors, their handles, and now-orphan div at 90
  deleteApplianceHierarchically(w, sRes.appliance!.id);
  assert.equal(base.doors.length, 0);
  assert.equal(base.handles.length, 0);
  assert.equal(base.unitDividers.length, 0);
  assert.equal(w.appliances.length, 0);
});

test('Corner sink requires inside-90 junction and rejects mid-cabinet or straight wall placement', () => {
  // Straight single wall -> rejected
  const straight = createWall('دیوار صاف', 0, 0, 300, 0);
  const straightBase = createEmptyBox('base', 0, 300);
  straight.boxes.push(straightBase);
  const failStraight = placeApplianceWithCabinetRules(straight, [straight], 'sink', straightBase, 10, {}, 'hidden', {
    sinkModel: 'corner-sink',
  });
  assert.equal(failStraight.ok, false);

  // L-shaped kitchen with 90-degree corner at w1.start <-> w2.start
  const project = buildPresetProject('L');
  const w1 = project.walls[0];
  w1.appliances = [];
  const base1 = w1.boxes.find((b) => b.type === 'base')!;

  // Mid-cabinet (>110cm from corner) -> rejected
  const failMid = placeApplianceWithCabinetRules(w1, project.walls, 'sink', base1, 150, project.cornerOwners, 'hidden', {
    sinkModel: 'corner-sink',
  });
  assert.equal(failMid.ok, false);

  // Near inside-90 corner -> succeeds, snaps flush to start=0 with cornerSide='left'
  const okCorner = placeApplianceWithCabinetRules(w1, project.walls, 'sink', base1, 5, project.cornerOwners, 'hidden', {
    sinkModel: 'corner-sink',
  });
  assert.equal(okCorner.ok, true);
  assert.equal(okCorner.appliance?.offsetX, 0);
  assert.equal(okCorner.appliance?.cornerSide, 'left');
});

test('Horizontal wall cabinet doors enforce 50..110cm widths and 1-vs-2 lift rule', () => {
  assert.equal(MIN_LIFT_DOOR_CM, 50);
  assert.equal(MAX_LIFT_DOOR_CM, 110);

  const wallCab = createEmptyBox('wall', 0, 140);
  wallCab.height = 90;
  // Requesting 100cm lift door in 140cm wall box succeeds cleanly (100 <= 110)
  const p100 = computeDoorBrushPreview(wallCab, 20, 'horizontal', 1, 0, 1, [], 100);
  assert.equal(p100.ok, true);
  assert.equal(p100.items[0].widthCm, 100);
  assert.equal(p100.items[0].kind, 'lift');
  assert.deepEqual(p100.items[0].drawerRatios, [0.5]);
  applyDoorBrushPreview(wallCab, 20, p100);

  // Tall (>=80cm) wall cab always uses 2 horizontal doors ([0.5]) regardless of pattern index
  const pRow2 = computeDoorBrushPreview(wallCab, 25, 'horizontal', 1, 0, 0, [], 100);
  assert.equal(pRow2.ok, true);
  assert.equal(pRow2.items.length, 1);
  assert.equal(pRow2.items[0].widthCm, 100);
  assert.deepEqual(pRow2.items[0].drawerRatios, [0.5]);

  // Empty gap of 40cm (<50cm MIN_LIFT_DOOR_CM) rejects lift door cleanly
  const failNarrow = computeDoorBrushPreview(wallCab, 120, 'horizontal', 1, 0, 1, [], 80);
  assert.equal(failNarrow.ok, false);
});

test('Vertical equalization aligns hinged runs (30..60) separately from Horizontal equalization (drawers & 50..110 lifts)', () => {
  const mix = createEmptyBox('base', 0, 210);
  mix.doors = [
    { id: 'd1', startCm: 0, widthCm: 40, kind: 'door', drawerRatios: [] },
    { id: 'd2', startCm: 40, widthCm: 60, kind: 'door', drawerRatios: [] },
    { id: 'dr1', startCm: 100, widthCm: 80, kind: 'drawer', drawerRatios: [0.22, 0.54] },
  ];

  // Vertical equalize turns [40, 60] into [50, 50] while leaving stepped drawer intact
  const vRes = equalizeVerticalDoorsInBox(mix, []);
  assert.equal(vRes.ok, true);
  assert.equal(mix.doors[0].widthCm, 50);
  assert.equal(mix.doors[1].widthCm, 50);
  assert.deepEqual(mix.doors[2].drawerRatios, [0.22, 0.54]);

  // Horizontal equalize converts stepped drawer ratios [0.22, 0.54] into equal 3-row [0.333, 0.667]
  const hRes = equalizeHorizontalInBox(mix);
  assert.equal(hRes.ok, true);
  assert.deepEqual(mix.doors[2].drawerRatios, [0.333, 0.667]);

  // Wall box with unequal lifts [70, 110] -> horizontal equalize aligns them to [90, 90] (in 50..110 range)
  const wallBox = createEmptyBox('wall', 0, 180);
  wallBox.doors = [
    { id: 'l1', startCm: 0, widthCm: 70, kind: 'lift', drawerRatios: [0.5] },
    { id: 'l2', startCm: 70, widthCm: 110, kind: 'lift', drawerRatios: [0.5] },
  ];
  const hwRes = equalizeHorizontalInBox(wallBox);
  assert.equal(hwRes.ok, true);
  assert.equal(wallBox.doors[0].widthCm, 90);
  assert.equal(wallBox.doors[1].widthCm, 90);
});

test('Variable-width frame tool (3..11cm) attaches to perimeter or full dividers and rejects plinth bottom / mid-bay cuts', () => {
  assert.deepEqual([...FRAME_WIDTH_OPTIONS], [3, 5, 7, 9, 11]);
  assert.equal(snapFrameWidthCm(6.2), 7);
  assert.equal(snapFrameWidthCm(14), 11);

  const wallBox = createEmptyBox('wall', 0, 150); // plinth = 0
  wallBox.unitDividers = [75];
  assert.equal(applyFullBoxFrame(wallBox, 7).ok, true);
  assert.deepEqual(getBoxFrameInsets(wallBox), { left: 7, right: 7, top: 7, bottom: 7 });

  // Seam frame succeeds over existing full divider at 75
  const seamOk = placeFrameOnBox(wallBox, 'seam', 5, 73);
  assert.equal(seamOk.ok, true);
  assert.equal(seamOk.frame?.seamCm, 75);

  // Seam frame in open bay with no divider fails cleanly
  const seamFail = placeFrameOnBox(wallBox, 'seam', 5, 35);
  assert.equal(seamFail.ok, false);

  // Base box has plinth=10 -> bottom frame rejected, while top/left/right surround succeeds
  const base = createEmptyBox('base', 0, 120);
  assert.equal(placeFrameOnBox(base, 'bottom', 5).ok, false);
  assert.equal(applyFullBoxFrame(base, 5).ok, true);
  assert.deepEqual(getBoxFrameInsets(base), { left: 5, right: 5, top: 5, bottom: 0 });
});

test('Batch handle application updates multi-selected hinged doors and drawers consistently', () => {
  const box = createEmptyBox('base', 0, 200);
  box.doors = [
    { id: 'd1', startCm: 0, widthCm: 50, kind: 'door', drawerRatios: [] },
    { id: 'd2', startCm: 50, widthCm: 50, kind: 'door', drawerRatios: [] },
    { id: 'dr1', startCm: 100, widthCm: 80, kind: 'drawer', drawerRatios: [0.333, 0.667] },
  ];

  // Batch apply simple handles to ['d1', 'd2'] first
  const n1 = applyHandlesToBoxDoors(box, ['d1', 'd2'], 'simple', 'vertical', { xRatio: 0.85, yRatio: 0.2 });
  assert.equal(n1, 2);
  assert.equal(box.handles.length, 2);

  // Apply across ALL doors in box (null filter) -> replaces d1/d2 + adds 3 row handles on 3-drawer unit
  const nAll = applyHandlesToBoxDoors(box, null, 'knob', 'horizontal');
  assert.equal(nAll, 5);
  assert.equal(box.handles.filter((h) => h.doorId === 'dr1').length, 3);
});

test('Context-aware framing blocks corner-buried & abutting edges and allows seam frames on any wall cabinet door boundary', () => {
  // Preset 'L': w2.wall2 (32..200) abuts side-profile corner at 32 (left not exposed) and has free right edge at 200 (exposed).
  const project = buildPresetProject('L');
  const w1 = project.walls[0];
  const w2 = project.walls[1];
  const wall2 = w2.boxes.find((b) => b.type === 'wall')!;
  const expWall2 = getBoxSideExposure(wall2, w2, project.walls, project.cornerOwners);
  assert.equal(expWall2.leftExposed, false);
  assert.equal(expWall2.rightExposed, true);

  // Full box frame skips buried left edge and frames free right, top, bottom edges only
  const fullWall2 = applyFullBoxFrame(wall2, 5, expWall2);
  assert.equal(fullWall2.ok, true);
  assert.equal(fullWall2.appliedSides.includes('left'), false);
  assert.equal(fullWall2.appliedSides.includes('right'), true);
  assert.equal(fullWall2.appliedSides.includes('top'), true);
  assert.equal(fullWall2.appliedSides.includes('bottom'), true);

  // Explicit left frame click is blocked with architectural message
  const failLeft = placeFrameOnBox(wall2, 'left', 5, undefined, expWall2);
  assert.equal(failLeft.ok, false);

  // When owner w1's wall cabinet starts at 0..230 (swept into blind corner 0..32 and abutting fridge at 230), BOTH edges are non-exposed!
  const wallLower = w1.boxes.find((b) => b.type === 'wall')!;
  wallLower.offsetX = 0;
  wallLower.width = 230;
  const expLower = getBoxSideExposure(wallLower, w1, project.walls, project.cornerOwners);
  assert.equal(expLower.leftExposed, false);
  assert.equal(expLower.rightExposed, false);

  const fullLower = applyFullBoxFrame(wallLower, 5, expLower);
  assert.equal(fullLower.ok, true);
  assert.deepEqual(fullLower.appliedSides, ['top', 'bottom']);

  // Wall cabinet with 3 contiguous doors (no manual dividers yet) -> seam frame snaps to door seam and registers divider!
  const wc = createEmptyBox('wall', 0, 171);
  wc.doors = [
    { id: 'w1', startCm: 0, widthCm: 57, kind: 'door', drawerRatios: [] },
    { id: 'w2', startCm: 57, widthCm: 57, kind: 'door', drawerRatios: [] },
    { id: 'w3', startCm: 114, widthCm: 57, kind: 'door', drawerRatios: [] },
  ];
  const seamOk = placeFrameOnBox(wc, 'seam', 5, 55);
  assert.equal(seamOk.ok, true);
  assert.equal(seamOk.frame?.seamCm, 57);
  assert.ok(wc.unitDividers.includes(57));

  // Mid-door cut (far from any door seam) still fails cleanly
  const midCut = placeFrameOnBox(wc, 'seam', 5, 28);
  assert.equal(midCut.ok, false);
});

test('Auto-unitizing before handles handles 1/2/3/4/5 doors cleanly and applies paired opposing handles + pantry center', () => {
  // 4 undivided hinged doors -> adds divider at seam 2 (100cm), pairing [0,1] and [2,3]
  const box4 = createEmptyBox('base', 0, 200);
  box4.doors = [
    { id: 'd1', startCm: 0, widthCm: 50, kind: 'door', drawerRatios: [] },
    { id: 'd2', startCm: 50, widthCm: 50, kind: 'door', drawerRatios: [] },
    { id: 'd3', startCm: 100, widthCm: 50, kind: 'door', drawerRatios: [] },
    { id: 'd4', startCm: 150, widthCm: 50, kind: 'door', drawerRatios: [] },
  ];
  const res4 = autoUnitizeBoxForHandles(box4, []);
  assert.deepEqual(res4.addedDividers, [100]);
  assert.equal(res4.pairedUnits, 2);

  // Handles meet face-to-face at each unit's center seam (left door xRatio 0.86, right door xRatio 0.14)
  applyHandlesToBoxDoors(box4, null, 'simple', 'vertical');
  const h1 = box4.handles.find((h) => h.doorId === 'd1')!;
  const h2 = box4.handles.find((h) => h.doorId === 'd2')!;
  const h3 = box4.handles.find((h) => h.doorId === 'd3')!;
  const h4 = box4.handles.find((h) => h.doorId === 'd4')!;
  assert.equal(h1.xRatio, 0.86);
  assert.equal(h2.xRatio, 0.14);
  assert.equal(h3.xRatio, 0.86);
  assert.equal(h4.xRatio, 0.14);
  assert.equal(box4.doors[0].hingeSide, 'left');
  assert.equal(box4.doors[1].hingeSide, 'right');

  // 5 hinged doors -> splits as [2 + 1 + 2] (dividers at 100 and 150)
  const box5 = createEmptyBox('base', 0, 250);
  box5.doors = Array.from({ length: 5 }, (_, i) => ({
    id: `f${i}`,
    startCm: i * 50,
    widthCm: 50,
    kind: 'door' as const,
    drawerRatios: [],
  }));
  const res5 = autoUnitizeBoxForHandles(box5, []);
  assert.deepEqual(res5.addedDividers, [100, 150]);

  // 3 hinged doors -> splits as [2 + 1] (divider at 100), preserving manual divider if already set at 50
  const box3 = createEmptyBox('base', 0, 150);
  box3.doors = [
    { id: 't1', startCm: 0, widthCm: 50, kind: 'door', drawerRatios: [] },
    { id: 't2', startCm: 50, widthCm: 50, kind: 'door', drawerRatios: [] },
    { id: 't3', startCm: 100, widthCm: 50, kind: 'door', drawerRatios: [] },
  ];
  const res3 = autoUnitizeBoxForHandles(box3, []);
  assert.deepEqual(res3.addedDividers, [100]);

  // Pantry pull-out tall door gets vertical centered handle (yRatio = 0.5) and no hingeSide
  const tall = createEmptyBox('tall', 0, 60);
  tall.doors = [{ id: 'p1', startCm: 0, widthCm: 60, kind: 'door', drawerRatios: [] }];
  applyHardwareKindToDoors(tall, ['p1'], 'pantry-pullout');
  autoUnitizeBoxForHandles(tall, []);
  applyHandlesToBoxDoors(tall, ['p1'], 'simple', 'vertical');
  assert.equal(tall.doors[0].hingeSide, undefined);
  assert.equal(tall.handles[0].yRatio, 0.5);
});

test('Coupled seam resize & removeUnitDividerWithSync keep shelves and seam frames synchronized', () => {
  const box = createEmptyBox('base', 0, 120);
  box.doors = [
    { id: 'd1', startCm: 0, widthCm: 40, kind: 'door', drawerRatios: [] },
    { id: 'd2', startCm: 40, widthCm: 40, kind: 'door', drawerRatios: [] },
    { id: 'd3', startCm: 80, widthCm: 40, kind: 'door', drawerRatios: [] },
  ];
  box.unitDividers = [80];
  box.shelves = [{ id: 'sh1', startCm: 0, endCm: 80, yRatio: 0.5 }];
  placeFrameOnBox(box, 'seam', 5, 80);

  // Moving seam between d2 and d3 by +5 shifts divider (80->85), shelf endCm (80->85), and seam frame (80->85)
  const delta = resizeDoorSeamCoupled(box, 'd2', 5);
  assert.equal(delta, 5);
  assert.deepEqual(box.unitDividers, [85]);
  assert.equal(box.shelves[0].endCm, 85);
  assert.equal(box.frames?.[0].seamCm, 85);

  // Deleting divider at 85 removes attached seam frame AND prunes merged 3-door shelf (>2 doors without divider is invalid)
  const rem = removeUnitDividerWithSync(box, 85, []);
  assert.equal(rem.ok, true);
  assert.equal(box.unitDividers.length, 0);
  assert.equal(box.frames?.length, 0);
  assert.equal(box.shelves.length, 0);

  // Merging two 1-door bays into a valid 2-door bay merges shelf cleanly across 0..100
  const box2 = createEmptyBox('base', 0, 100);
  box2.doors = [
    { id: 'a', startCm: 0, widthCm: 50, kind: 'door', drawerRatios: [] },
    { id: 'b', startCm: 50, widthCm: 50, kind: 'door', drawerRatios: [] },
  ];
  box2.unitDividers = [50];
  box2.shelves = [{ id: 's1', startCm: 0, endCm: 50, yRatio: 0.5 }];
  const rem2 = removeUnitDividerWithSync(box2, 50, []);
  assert.equal(rem2.ok, true);
  assert.equal(box2.shelves.length, 1);
  assert.equal(box2.shelves[0].startCm, 0);
  assert.equal(box2.shelves[0].endCm, 100);
});

test('resizeUnitDividerWithDoorsSync & moveUnitInBoxWithDoorsSync preserve all linked doors, styles, handles, shelves, frames, and appliances', () => {
  const wall = createWall('دیوار ۱', 0, 0, 300, 0, 1);
  const box = createEmptyBox('base', 0, 180);
  box.doors = [
    { id: 'u1_d1', startCm: 0, widthCm: 45, kind: 'door', doorStyle: 'cnc', hingeSide: 'left', drawerRatios: [] },
    { id: 'u1_d2', startCm: 45, widthCm: 45, kind: 'door', doorStyle: 'cnc', hingeSide: 'right', drawerRatios: [] },
    { id: 'u2_drw', startCm: 90, widthCm: 90, kind: 'drawer', doorStyle: 'cnc', drawerRatios: [0.22, 0.54] },
  ];
  box.unitDividers = [90];
  box.shelves = [{ id: 'sh_u1', startCm: 0, endCm: 90, yRatio: 0.5 }];
  box.handles = [{ id: 'h1', doorId: 'u1_d1', rowIndex: 0, xRatio: 0.86, yRatio: 0.18, orient: 'vertical', style: 'simple', lengthCm: 16 }];
  placeFrameOnBox(box, 'seam', 5, 90);
  wall.boxes.push(box);

  // Resize divider from 90 -> 100 (left unit 100cm = 2x50cm doors, right unit 80cm drawer)
  const rsz = resizeUnitDividerWithDoorsSync(box, 90, 100, []);
  assert.ok(rsz && rsz.ok);
  assert.equal(rsz!.seamCm, 100);
  assert.deepEqual(box.unitDividers, [100]);
  assert.equal(box.doors[0].widthCm, 50);
  assert.equal(box.doors[1].startCm, 50);
  assert.equal(box.doors[1].widthCm, 50);
  assert.equal(box.doors[1].doorStyle, 'cnc');
  assert.equal(box.doors[1].hingeSide, 'right');
  assert.equal(box.doors[2].startCm, 100);
  assert.equal(box.doors[2].widthCm, 80);
  assert.deepEqual(box.doors[2].drawerRatios, [0.22, 0.54]);
  assert.equal(box.shelves[0].endCm, 100);
  assert.equal(box.frames?.[0].seamCm, 100);
  assert.equal(box.handles[0].doorId, 'u1_d1');

  // Move left unit [0..100] right -> swaps with drawer unit [100..180]
  const mv = moveUnitInBoxWithDoorsSync(wall, box, 0, 100, 'right', []);
  assert.equal(mv.ok, true);
  assert.deepEqual(mv.movedUnit, { startCm: 80, endCm: 180 });
  assert.deepEqual(box.unitDividers, [80]);
  const drw = box.doors.find((d) => d.id === 'u2_drw')!;
  const d1 = box.doors.find((d) => d.id === 'u1_d1')!;
  const d2 = box.doors.find((d) => d.id === 'u1_d2')!;
  assert.equal(drw.startCm, 0);
  assert.equal(drw.widthCm, 80);
  assert.equal(d1.startCm, 80);
  assert.equal(d2.startCm, 130);
  assert.equal(box.shelves[0].startCm, 80);
  assert.equal(box.shelves[0].endCm, 180);
  assert.equal(box.frames?.[0].seamCm, 80);
});

test('resizeWallCabinetsSynchronized updates all wall cabinets, over-fridge wall-deep box, and attached tall cabinets', () => {
  const w1 = createWall('دیوار ۱', 0, 0, 300, 0, 1, 270);
  const w2 = createWall('دیوار ۲', 300, 0, 300, 240, 1, 270);

  const w1Cab = createEmptyBox('wall', 0, 140);
  w1Cab.elevY = 148;
  w1Cab.height = 72; // top = 220

  const fridge = createEmptyBox('fridge', 140, 100); // width 100, height 190
  const overFridge = createEmptyBox('wall-deep', 140, 100);
  overFridge.elevY = 190;
  overFridge.height = 30; // top = 220
  overFridge.linkedToBoxId = fridge.id;

  const tallAttached = createEmptyBox('tall', 240, 60); // touches fridge -> attached to wall run!
  tallAttached.elevY = 0;
  tallAttached.height = 220;

  w1.boxes.push(w1Cab, fridge, overFridge, tallAttached);

  const w2Cab = createEmptyBox('wall', 60, 120);
  w2Cab.elevY = 148;
  w2Cab.height = 72; // top = 220

  // Tall corner cabinet adjacent to w2Cab (touching at offsetX=180)
  const w2Tall = createEmptyBox('tall', 180, 60);
  w2Tall.elevY = 0;
  w2Tall.height = 220;
  w2.boxes.push(w2Cab, w2Tall);

  const walls = [w1, w2];
  // Resize w1Cab from top=220 to top=248 (elevY=148, height=100)
  const ok = resizeWallCabinetsSynchronized(walls, w1.id, w1Cab.id, 148, 100);
  assert.equal(ok, true);
  assert.equal(w1Cab.height, 100);
  assert.equal(w2Cab.height, 100);
  assert.equal(overFridge.elevY + overFridge.height, 248);
  assert.equal(overFridge.height, 58); // 248 - 190
  assert.equal(tallAttached.height, 248);
  assert.equal(w2Tall.height, 248);
});

test('computeWallBacksplashSpans handles wall cabinets, chimney hoods, windows, and tall/door obstructions', () => {
  const wall = createWall('دیوار ۱', 0, 0, 420, 0, 1, 270);
  // Base 0..240 (elevY=0, height=86 => top 86)
  const base1 = createEmptyBox('base', 0, 240);
  // Base 300..420 (after tall 240..300)
  const tall = createEmptyBox('tall', 240, 60);
  const base2 = createEmptyBox('base', 300, 120);

  // Wall cab 0..140 at elevY=145
  const wallCab = createEmptyBox('wall', 0, 140);
  wallCab.elevY = 145;
  wallCab.height = 75;

  // Chimney gas at 140..220 (elevates backsplash to >=156)
  wall.appliances.push({
    id: 'gas_1',
    kind: 'gas',
    offsetX: 140,
    width: 80,
    elevY: 86,
    hoodKind: 'chimney',
    model: '5-burner',
  } as any);

  // Window over base2 at 320..380, elevY=110 (caps backsplash topY=110)
  wall.openings = [createWallOpening('window', 320, wall, { width: 60, elevY: 110, height: 100 })];

  wall.boxes.push(base1, tall, base2, wallCab);

  const spans = computeWallBacksplashSpans(wall);
  // Span 1: 0..140 up to wallCab.elevY=145
  const s1 = spans.find((s) => s.startCm === 0 && s.endCm === 140);
  assert.ok(s1, 'Expected wall-cab span 0..140');
  assert.equal(s1!.botY, 86);
  assert.equal(s1!.topY, 145);

  // Span 2: chimney zone 140..220 reaches >= 156
  const s2 = spans.find((s) => s.startCm === 140 && s.endCm === 220);
  assert.ok(s2, 'Expected chimney hood span 140..220');
  assert.ok(s2!.topY >= 156);

  // Tall zone 240..300 excluded
  assert.equal(
    spans.some((s) => s.startCm >= 240 && s.endCm <= 300),
    false,
    'Tall cabinet zone should not have backsplash'
  );

  // Window zone 320..380 capped at 110
  const sWin = spans.find((s) => s.startCm === 320 && s.endCm === 380);
  assert.ok(sWin, 'Expected under-window backsplash span 320..380');
  assert.equal(sWin!.topY, 110);
});

test('Placing sink auto-converts covering wall cabinet bay to horizontal lift doors & default hood is chimney', () => {
  const w = createWall('دیوار سینک', 0, 0, 300, 0);
  const base = createEmptyBox('base', 0, 260);
  const upper = createEmptyBox('wall', 0, 200);
  upper.doors = [
    { id: 'u1', startCm: 0, widthCm: 50, kind: 'door', drawerRatios: [] },
    { id: 'u2', startCm: 50, widthCm: 50, kind: 'door', drawerRatios: [] },
    { id: 'u3', startCm: 100, widthCm: 50, kind: 'door', drawerRatios: [] },
  ];
  w.boxes.push(base, upper);

  const sinkRes = placeApplianceWithCabinetRules(w, [w], 'sink', base, 50, {});
  assert.equal(sinkRes.ok, true);

  // Wall cabinet above [50..140] must now contain a 90cm horizontal lift door!
  const liftOverSink = upper.doors.find((d) => d.kind === 'lift');
  assert.ok(liftOverSink, 'Expected horizontal lift door above placed sink');
  assert.equal(liftOverSink!.startCm, 50);
  assert.equal(liftOverSink!.widthCm, 90);

  // Placing gas without explicit hood argument defaults to exposed chimney hood
  const gasRes = placeApplianceWithCabinetRules(w, [w], 'gas', base, 160, {});
  assert.equal(gasRes.ok, true);
  assert.equal(gasRes.appliance?.hoodKind, 'chimney');
});

test('L and U presets unify upper cabinet crown height across all walls & over-fridge and default chimney hood', () => {
  for (const mode of ['L', 'U'] as const) {
    const p = buildPresetProject(mode);
    const allWallTops = p.walls.flatMap((w) =>
      w.boxes
        .filter((b) => b.type === 'wall-deep' || b.type === 'tall')
        .map((b) => b.elevY + b.height)
    );
    assert.ok(allWallTops.length >= 2);
    for (const top of allWallTops) {
      assert.equal(top, 235, `Expected unified 235cm crown height in ${mode} preset`);
    }
    const gas = p.walls.flatMap((w) => w.appliances).find((a) => a.kind === 'gas');
    assert.equal(gas?.hoodKind, 'chimney');
  }
});

test('AR calibration math, real-distance scaling, and floor wall-scanning integrate with CAD walls cleanly', () => {
  const a = { x: 0, z: 0 };
  const b = { x: 2, z: 0 };
  const sol = fitCalibrationDragB(a, b, { x: 1, z: 1 }, { x: 1, z: 3 }, 1);
  assert.ok(sol);
  assert.ok(Math.abs(sol!.b.x - 2) < 0.01);

  const scale = computeScaleFromRealDistanceCm({ x: 0, z: 0 }, { x: 2, z: 0 }, 250);
  assert.equal(scale, 1.25);

  const w1 = buildArScannedWall([], { x: 0, z: 0 }, { x: 3, z: 0 }, 265);
  assert.equal(w1.length, 300);
  const w2 = buildArScannedWall([w1], { x: 0, z: 0.05 }, { x: 0, z: 2.0 }, 265);
  assert.equal(w2.x1Cm, 0);
  assert.equal(w2.y1Cm, 0);

  const proj = projectArPointOntoWalls({ x: 1.5, z: 0.25 }, [w1, w2]);
  assert.ok(proj);
  assert.equal(proj!.wall.id, w1.id);
  assert.equal(proj!.offsetCm, 150);
});

test('Applying kitchen style preset updates finishes, CNC door style, and hood preference cleanly', () => {
  const baseProj = buildPresetProject('L');
  const res = applyKitchenStylePreset(baseProj, 'reference-classic');
  assert.ok(res);
  assert.equal(res!.next.designStyle, 'neoclassic');
  assert.equal(res!.next.cabinetFinish, 'greige');
  const firstDoor = res!.next.walls[0].boxes[0].doors[0];
  assert.equal(firstDoor.doorStyle, 'cnc');
});

test('Placing, moving, and deleting Gas synchronizes dedicated hood unit dividers and doors on wall cabinets', () => {
  const wall = createWall('دیوار گاز', 0, 0, 290, 0);
  const base = createEmptyBox('base', 0, 290);
  const upper = createEmptyBox('wall', 0, 290);
  upper.doors = [
    { id: 'w1', startCm: 0, widthCm: 60, kind: 'door', drawerRatios: [] },
    { id: 'w2', startCm: 60, widthCm: 60, kind: 'door', drawerRatios: [] },
    { id: 'w3', startCm: 120, widthCm: 60, kind: 'door', drawerRatios: [] },
    { id: 'w4', startCm: 180, widthCm: 55, kind: 'door', drawerRatios: [] },
    { id: 'w5', startCm: 235, widthCm: 55, kind: 'door', drawerRatios: [] },
  ];
  wall.boxes.push(base, upper);

  // Place 80cm Gas at 140..220 with exposed chimney hood
  const res = placeApplianceWithCabinetRules(wall, [wall], 'gas', base, 140, {}, 'chimney', {
    customWidth: 80,
  });
  assert.equal(res.ok, true);
  const gas = res.appliance!;

  // Overhead wall cabinet must have flush hood unit dividers at 140 & 220 and zero doors crossing [140..220]
  assert.ok(upper.unitDividers.includes(140));
  assert.ok(upper.unitDividers.includes(220));
  assert.equal(
    upper.doors.some((d) => d.startCm + d.widthCm > 140.5 && d.startCm < 219.5),
    false,
    'No wall cabinet door may overlap an exposed chimney hood bay'
  );

  // Switch hood to hidden -> adds a matching 80cm horizontal lift door inside [140..220]
  gas.hoodKind = 'hidden';
  syncHoodUnitAboveGas(wall, gas);
  const liftHoodDoor = upper.doors.find((d) => d.startCm === 140 && d.widthCm === 80);
  assert.ok(liftHoodDoor && liftHoodDoor.kind === 'lift');

  // Move Gas to 100..180 -> old 140/220 hood dividers & door move cleanly to 100/180
  moveApplianceHierarchically(wall, [wall], gas.id, 100, {}, { exact: true });
  assert.equal(gas.offsetX, 100);
  assert.ok(upper.unitDividers.includes(100));
  assert.ok(upper.unitDividers.includes(180));
  assert.equal(upper.unitDividers.includes(220), false);
  const movedLift = upper.doors.find((d) => d.startCm === 100 && d.widthCm === 80 && d.kind === 'lift');
  assert.ok(movedLift, 'Hidden hood lift door should follow moved gas');

  // Delete Gas -> removes hood unit dividers & hood door
  deleteApplianceHierarchically(wall, gas.id);
  assert.equal(upper.unitDividers.includes(100), false);
  assert.equal(upper.unitDividers.includes(180), false);
});

test('equalizeVerticalDoorsInBox shifts gas + hood cleanly to balance uneven left/right bays (e.g. 42.5 vs 32.5 -> 37.5)', () => {
  // Perpendicular wall owns corner 0..60 on base wall -> 60cm blind corner zone
  const wA = createWall('دیوار کنج', 0, 200, 0, 0);
  const wA_base = createEmptyBox('base', 0, 200);
  wA.boxes.push(wA_base);

  const wB = createWall('دیوار اصلی', 0, 0, 290, 0);
  const base = createEmptyBox('base', 0, 290);
  const upper = createEmptyBox('wall', 0, 290);
  wB.boxes.push(base, upper);

  // Corner key for intersection at (0, 0) belongs to wA -> 60cm blind zone on left of wB
  const cornerOwners = { '0,0': wA.id };

  // Place doors: [60 blind], [60..102.5 = 42.5], [102.5..145 = 42.5], [145..225 gas 80], [225..257.5 = 32.5], [257.5..290 = 32.5]
  const resGas = placeApplianceWithCabinetRules(wB, [wA, wB], 'gas', base, 145, cornerOwners, 'chimney', {
    customWidth: 80,
  });
  assert.equal(resGas.ok, true);
  base.doors = [
    { id: 'dL1', startCm: 60, widthCm: 42.5, kind: 'door', drawerRatios: [] },
    { id: 'dL2', startCm: 102.5, widthCm: 42.5, kind: 'door', drawerRatios: [] },
    ...base.doors,
    { id: 'dR1', startCm: 225, widthCm: 32.5, kind: 'door', drawerRatios: [] },
    { id: 'dR2', startCm: 257.5, widthCm: 32.5, kind: 'door', drawerRatios: [] },
  ];

  const blocked = getCornerBlockedZonesForWall(wB, [wA, wB], cornerOwners);
  const eq = equalizeVerticalDoorsInBox(base, blocked, wB, [wA, wB], cornerOwners);
  assert.equal(eq.ok, true);

  // Gas shifts from 145 to 135 (with its drawer + overhead hood dividers!), making all 4 side doors 37.5cm!
  assert.equal(resGas.appliance!.offsetX, 135);
  assert.ok(upper.unitDividers.includes(135));
  assert.ok(upper.unitDividers.includes(215));
  const verticalDoors = base.doors.filter((d) => d.kind === 'door').sort((a, b) => a.startCm - b.startCm);
  assert.equal(verticalDoors.length, 4);
  for (const d of verticalDoors) {
    assert.equal(d.widthCm, 37.5);
  }
});

test('alignApplianceOnBoxFront centers gas on visible usable front (excluding 60cm blind corner) & refits doors', () => {
  const wA = createWall('دیوار کنج', 0, 200, 0, 0);
  wA.boxes.push(createEmptyBox('base', 0, 200));

  const wB = createWall('دیوار فرانت', 0, 0, 290, 0);
  const base = createEmptyBox('base', 0, 290);
  const upper = createEmptyBox('wall', 0, 290);
  wB.boxes.push(base, upper);

  const cornerOwners = { '0,0': wA.id };

  const resGas = placeApplianceWithCabinetRules(wB, [wA, wB], 'gas', base, 180, cornerOwners, 'chimney', {
    customWidth: 80,
  });
  assert.equal(resGas.ok, true);
  base.doors = [
    { id: 'l1', startCm: 60, widthCm: 60, kind: 'door', drawerRatios: [] },
    { id: 'l2', startCm: 120, widthCm: 60, kind: 'door', drawerRatios: [] },
    ...base.doors,
    { id: 'r1', startCm: 260, widthCm: 30, kind: 'door', drawerRatios: [] },
  ];

  // Usable front of 290cm box excluding 60cm blind zone is [60..290] (width 230cm).
  // Center for 80cm gas = 60 + (230 - 80)/2 = 135 -> left bay [60..135] (75cm -> 2x37.5), right bay [215..290] (75cm -> 2x37.5)!
  const alignRes = alignApplianceOnBoxFront(wB, [wA, wB], resGas.appliance!.id, 'center', cornerOwners);
  assert.equal(alignRes.ok, true);
  assert.equal(resGas.appliance!.offsetX, 135);
  assert.ok(upper.unitDividers.includes(135));
  assert.ok(upper.unitDividers.includes(215));
});

test('mirrorBoxLayout respects blind corner zones, keeps gas attached to drawer, and never leaks doors into corner', () => {
  const wA = createWall('دیوار کنج', 0, 200, 0, 0);
  wA.boxes.push(createEmptyBox('base', 0, 200));

  const wB = createWall('دیوار اصلی', 0, 0, 290, 0);
  const base = createEmptyBox('base', 0, 290);
  const upper = createEmptyBox('wall', 0, 290);
  wB.boxes.push(base, upper);

  const cornerOwners = { '0,0': wA.id };
  const gasRes = placeApplianceWithCabinetRules(wB, [wA, wB], 'gas', base, 175, cornerOwners, 'chimney', {
    customWidth: 80,
  });
  assert.equal(gasRes.ok, true);
  base.doors = [
    { id: 'd1', startCm: 60, widthCm: 57.5, kind: 'door', drawerRatios: [] },
    { id: 'd2', startCm: 117.5, widthCm: 57.5, kind: 'door', drawerRatios: [] },
    ...base.doors,
    { id: 'd3', startCm: 255, widthCm: 35, kind: 'door', drawerRatios: [] },
  ];

  // Mirror inside usable front [60..290] (center = 175)
  mirrorBoxLayout(base, wB, [wA, wB], cornerOwners);

  // No door may enter [0..60] blind corner!
  assert.equal(base.doors.some((d) => d.startCm < 59.9), false);

  // Mirrored 80cm gas moved from [175..255] to [95..175], AND its coupled drawer followed to startCm = 95!
  assert.equal(gasRes.appliance!.offsetX, 95);
  const drawer = base.doors.find((d) => d.kind === 'drawer');
  assert.ok(drawer);
  assert.equal(drawer!.startCm, 95);
  assert.equal(drawer!.widthCm, 80);
});

test('Dragging Gas dynamically resizes adjacent doors while keeping coupled hood and drawers synchronized', () => {
  const wall = createWall('دیوار گاز', 0, 0, 260, 0);
  const base = createEmptyBox('base', 0, 260);
  const upper = createEmptyBox('wall', 0, 260);
  wall.boxes.push(base, upper);

  const gasRes = placeApplianceWithCabinetRules(wall, [wall], 'gas', base, 90, {}, 'chimney', {
    customWidth: 80,
  });
  assert.equal(gasRes.ok, true);
  base.doors = [
    { id: 'l1', startCm: 0, widthCm: 45, kind: 'door', drawerRatios: [] },
    { id: 'l2', startCm: 45, widthCm: 45, kind: 'door', drawerRatios: [] },
    ...base.doors,
    { id: 'r1', startCm: 170, widthCm: 45, kind: 'door', drawerRatios: [] },
    { id: 'r2', startCm: 215, widthCm: 45, kind: 'door', drawerRatios: [] },
  ];

  // Drag gas +20cm right (from 90 to 110) with refitAdjacentDoors: true
  moveApplianceHierarchically(wall, [wall], gasRes.appliance!.id, 110, {}, {
    exact: true,
    refitAdjacentDoors: true,
  });

  assert.equal(gasRes.appliance!.offsetX, 110);
  const gasDrawer = base.doors.find((d) => d.kind === 'drawer');
  assert.equal(gasDrawer?.startCm, 110);
  assert.ok(upper.unitDividers.includes(110));
  assert.ok(upper.unitDividers.includes(190));

  // Left doors expanded from 90cm bay to 110cm bay (2x55cm), right doors shrunk from 90cm to 70cm (2x35cm)
  const leftDoors = base.doors.filter((d) => d.kind === 'door' && d.startCm < 110).sort((a, b) => a.startCm - b.startCm);
  const rightDoors = base.doors.filter((d) => d.kind === 'door' && d.startCm >= 190).sort((a, b) => a.startCm - b.startCm);
  assert.equal(leftDoors.length, 2);
  assert.equal(leftDoors[0].widthCm, 55);
  assert.equal(leftDoors[1].widthCm, 55);
  assert.equal(rightDoors.length, 2);
  assert.equal(rightDoors[0].widthCm, 35);
  assert.equal(rightDoors[1].widthCm, 35);
});

test('Sink couples with over-sink Dish-Rack wall bay during move and delete, and wall-deep upper tier uses vertical doors', () => {
  const proj = buildPresetProject('L');
  const w1 = proj.walls[0];
  const wallDeepBoxes = proj.walls.flatMap((w) =>
    w.boxes.filter((b) => b.type === 'wall-deep' && !b.linkedToBoxId)
  );
  assert.ok(wallDeepBoxes.length >= 1);
  for (const wd of wallDeepBoxes) {
    assert.ok(wd.doors.every((d) => d.kind === 'door'), 'wall-deep top tier must use vertical doors');
  }

  const sink = w1.appliances.find((a) => a.kind === 'sink');
  const upperWall = w1.boxes.find((b) => b.type === 'wall' && !b.linkedToBoxId);
  assert.ok(sink && upperWall);

  const origSinkX = sink!.offsetX;
  const origLift = upperWall!.doors.find(
    (d) => d.kind === 'lift' && Math.abs(d.startCm - (origSinkX - upperWall!.offsetX)) < 3
  );
  assert.ok(origLift, 'Sink should have coupled over-sink dish-rack lift door');

  // Remove gas so sink has open run to shift +15cm cleanly along wall & upper dish-rack cabinet
  const gas = w1.appliances.find((a) => a.kind === 'gas');
  if (gas) deleteApplianceHierarchically(w1, gas.id);

  // Move sink cleanly +15cm -> coupled over-sink dish-rack lift door shifts synchronously
  const mv = moveApplianceHierarchically(w1, proj.walls, sink!.id, origSinkX + 15, proj.cornerOwners, {
    exact: true,
    refitAdjacentDoors: true,
  });
  assert.ok(mv);
  assert.equal(mv!.offsetX, origSinkX + 15);
  const movedLift = upperWall!.doors.find(
    (d) => d.kind === 'lift' && Math.abs(d.startCm - (sink!.offsetX - upperWall!.offsetX)) < 2
  );
  assert.ok(movedLift, 'Over-sink dish-rack bay should move with sink');

  // Delete sink cleanly -> dish-rack bay converts back to regular vertical upper doors
  deleteApplianceHierarchically(w1, sink!.id);
  const remainingLiftAtSink = upperWall!.doors.find(
    (d) => d.kind === 'lift' && Math.abs(d.startCm - (sink!.offsetX - upperWall!.offsetX)) < 2
  );
  assert.equal(Boolean(remainingLiftAtSink), false);
});

test('applyDoorDrawerBand and getDoorsInHorizontalRange apply and clear drawer strips across swept hinged doors', () => {
  const box = createEmptyBox('base', 0, 180);
  box.doors = [
    { id: 'd1', startCm: 0, widthCm: 45, kind: 'door', drawerRatios: [] },
    { id: 'd2', startCm: 45, widthCm: 45, kind: 'door', drawerRatios: [] },
    { id: 'dr', startCm: 90, widthCm: 50, kind: 'drawer', drawerRatios: [0.5] },
    { id: 'd3', startCm: 140, widthCm: 40, kind: 'door', drawerRatios: [] },
  ];

  // Sweeping from 10cm to 150cm grabs vertical doors d1, d2, d3 and skips drawer 'dr'
  const sweptIds = getDoorsInHorizontalRange(box, 10, 150).map((d) => d.id);
  assert.deepEqual(sweptIds, ['d1', 'd2', 'd3']);

  const count = applyDoorDrawerBand(box, sweptIds, { position: 'top', ratio: 0.26 });
  assert.equal(count, 3);
  assert.deepEqual(box.doors[0].drawerRatios, []);
  assert.deepEqual(box.doors[0].drawerBand, { position: 'top', ratio: 0.26 });
  assert.equal(box.doors[2].drawerBand, undefined);

  // Clear drawer band
  applyDoorDrawerBand(box, ['d1', 'd2'], null);
  assert.equal(box.doors[0].drawerBand, undefined);
  assert.equal(box.doors[1].drawerBand, undefined);
  assert.deepEqual(box.doors[3].drawerBand, { position: 'top', ratio: 0.26 });
});

test('All 9 style JSON files exist on disk, validate, and apply two-tone finishes via applyKitchenStylePreset', () => {
  assert.equal(KITCHEN_STYLE_PRESETS.length, 9);
  for (const preset of KITCHEN_STYLE_PRESETS) {
    const jsonPath = path.resolve(process.cwd(), 'public', 'assets', 'styles', `${preset.id}.json`);
    assert.equal(fs.existsSync(jsonPath), true, `Missing JSON preset file: ${jsonPath}`);
    const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    assert.equal(parsed.id, preset.id);
    assert.ok(parsed.cabinetFinish);
    assert.ok(parsed.countertopFinish);
    assert.ok(parsed.backsplashFinish);
    assert.ok(['hidden', 'chimney'].includes(parsed.defaultHoodKind));

    const baseProj = buildPresetProject('L');
    const applied = applyKitchenStylePreset(baseProj, parsed);
    assert.ok(applied);
    assert.equal(applied!.next.cabinetFinish, parsed.cabinetFinish);
    if (parsed.wallDeepCabinetFinish) {
      const wd = applied!.next.walls.flatMap((w) => w.boxes).find((b) => b.type === 'wall-deep');
      assert.equal(wd?.finish, parsed.wallDeepCabinetFinish);
    }
  }
});

test('Two-tier stacked upper cabinets clamp the middle seam to the smaller lower tier', () => {
  const w = createWall('دیوار دو طبقه', 0, 0, 260, 0, 1, 270);
  const lowerWall = createEmptyBox('wall', 0, 200);
  lowerWall.elevY = 145;
  lowerWall.height = 55; // [145..200]
  const upperDeep = createEmptyBox('wall-deep', 0, 200);
  upperDeep.elevY = 200;
  upperDeep.height = 40; // [200..240]
  w.boxes.push(lowerWall, upperDeep);

  // Move middle seam down by dragging bottom edge of wall-deep to 185 (crown stays at 240)
  const okDown = resizeWallCabinetsSynchronized([w], w.id, upperDeep.id, 185, 55);
  assert.equal(okDown, true);
  assert.equal(upperDeep.elevY, 176);
  assert.equal(upperDeep.height, 64);
  assert.equal(lowerWall.elevY, 145);
  assert.equal(lowerWall.height, 31);

  // Move middle seam up by dragging top edge of lower wall to 210 (crown of wall-deep stays at 240)
  const okUp = resizeWallCabinetsSynchronized([w], w.id, lowerWall.id, 145, 65);
  assert.equal(okUp, true);
  assert.equal(lowerWall.height, 31);
  assert.equal(upperDeep.elevY, 176);
  assert.equal(upperDeep.elevY + upperDeep.height, 240);
});

test('Hood unit trims straddling upper doors/shelves and creates dedicated lift door for hidden hood', () => {
  const wall = createWall('دیوار هود', 0, 0, 240, 0);
  const base = createEmptyBox('base', 0, 240);
  const upper = createEmptyBox('wall', 0, 240);
  upper.doors = [
    { id: 'd1', startCm: 0, widthCm: 80, kind: 'door', drawerRatios: [] },
    { id: 'd2', startCm: 80, widthCm: 80, kind: 'door', drawerRatios: [] },
    { id: 'd3', startCm: 160, widthCm: 80, kind: 'door', drawerRatios: [] },
  ];
  upper.shelves = [{ id: 'sh1', startCm: 80, endCm: 160, yRatio: 0.5 }];
  wall.boxes.push(base, upper);

  // Straddle gas at [60..140] across d1 and d2 with hidden hood
  const res = placeApplianceWithCabinetRules(wall, [wall], 'gas', base, 60, {}, 'hidden', {
    customWidth: 80,
  });
  assert.equal(res.ok, true);
  assert.ok(upper.unitDividers.includes(60));
  assert.ok(upper.unitDividers.includes(140));

  // Hidden hood bay [60..140] has its own dedicated lift door
  const hoodDoor = upper.doors.find(
    (d) => Math.abs(d.startCm - 60) < 0.5 && Math.abs(d.widthCm - 80) < 0.5
  );
  assert.ok(hoodDoor && hoodDoor.kind === 'lift');
  // No non-hood door may cross into [60..140]
  assert.equal(
    upper.doors.some(
      (d) => d.id !== hoodDoor!.id && d.startCm + d.widthCm > 60.5 && d.startCm < 139.5
    ),
    false
  );
  // Internal shelf crossing hood bay was pruned
  assert.equal(upper.shelves.some((sh) => sh.endCm > 60.5 && sh.startCm < 139.5), false);
});

test('Tall cabinet automatically carves overlapping base and wall cabinets on place and drag', () => {
  const wall = createWall('دیوار قدی', 0, 0, 300, 0);
  const base = createEmptyBox('base', 0, 240);
  const upper = createEmptyBox('wall', 0, 240);
  wall.boxes.push(base, upper);

  // Place 60cm tall cabinet in middle [90..150] -> splits base & wall into left [0..90] and right [150..240]
  const tall = createEmptyBox('tall', 90, 60);
  wall.boxes.push(tall);
  carveBoxesForPlacedBox(wall, tall);

  const bases = wall.boxes.filter((b) => b.type === 'base').sort((a, b) => a.offsetX - b.offsetX);
  assert.equal(bases.length, 2);
  assert.equal(bases[0].offsetX, 0);
  assert.equal(bases[0].width, 90);
  assert.equal(bases[1].offsetX, 150);
  assert.equal(bases[1].width, 90);

  const walls = wall.boxes.filter((b) => b.type === 'wall').sort((a, b) => a.offsetX - b.offsetX);
  assert.equal(walls.length, 2);
  assert.equal(walls[0].width, 90);
  assert.equal(walls[1].offsetX, 150);

  // Dragging tall to [200..260] carves the remaining right base [150..240] down to [150..200]
  const mv = moveBoxHierarchically(wall, [wall], tall.id, 200, {});
  assert.ok(mv);
  assert.equal(tall.offsetX, 200);
  const overlappedAfterMove = wall.boxes.some(
    (b) => b.id !== tall.id && b.offsetX + b.width > 200.5 && b.offsetX < 259.5
  );
  assert.equal(overlappedAfterMove, false);
});

test('Shelves enforce MIN_SHELF_GAP_CM = 25cm on multi-shelf, click, and drag', () => {
  assert.equal(MIN_SHELF_GAP_CM, 25);
  const wallCab = createEmptyBox('wall', 0, 80); // default wall box height = 75cm, plinth=0, counter=0
  assert.equal(getBoxInteriorHeightCm(wallCab), 75);

  // Adding 3 shelves in 75cm height gives step = 75/4 = 18.75cm < 25cm -> rejected!
  const failThree = addShelvesWithMinGap(wallCab, 0, 80, 3);
  assert.equal(failThree.ok, false);

  // In a tall cabinet bay: 1st shelf at 0.5, adding 2nd shelf close to 0.5 clamps >= 25cm away
  const tallCab = createEmptyBox('tall', 0, 60);
  const ok1 = addShelvesWithMinGap(tallCab, 0, 60, 1, 0.5);
  assert.equal(ok1.ok, true);
  const ok2 = addShelvesWithMinGap(tallCab, 0, 60, 1, 0.52);
  assert.equal(ok2.ok, true);
  assert.equal(tallCab.shelves.length, 2);
  const gapCm = Math.abs(tallCab.shelves[1].yRatio - tallCab.shelves[0].yRatio) * getBoxInteriorHeightCm(tallCab);
  assert.ok(gapCm >= 24.9, `Expected >= 25cm shelf gap, got ${gapCm}`);

  // Dragging shelf 2 toward shelf 1 never goes closer than 25cm
  const sh2 = tallCab.shelves[1];
  const dragged = clampShelfRatioWithMinGap(tallCab, 0.5, 0, 60, sh2.id);
  const dragGapCm = Math.abs(dragged.ratio - tallCab.shelves[0].yRatio) * getBoxInteriorHeightCm(tallCab);
  assert.ok(dragGapCm >= 24.9, `Expected >= 25cm drag gap, got ${dragGapCm}`);
});

test('Soft-close easing curve smoothly drives hinged, lift, and drawer transforms', () => {
  assert.equal(easeInOutSoftClose(0), 0);
  assert.equal(easeInOutSoftClose(0.5), 0.5);
  assert.equal(easeInOutSoftClose(1), 1);
  assert.ok(easeInOutSoftClose(0.1) < 0.05, 'Start of motion must ease-in gently');
  assert.ok(easeInOutSoftClose(0.9) > 0.95, 'End of motion must ease-out gently (soft close)');

  const grp = new THREE.Group();
  const handle = {
    doorId: 'd_test',
    group: grp,
    kind: 'hinge-left' as const,
    normalSign: 1,
    baseX: 0.2,
    baseY: 0.4,
    baseZ: 0.3,
    baseRotX: 0,
    baseRotY: 0,
    maxAngle: 1.4,
  };
  applyAnimatedDoorProgress(handle, 0.5);
  assert.ok(Math.abs(grp.rotation.y - -0.7) < 0.001);

  const drawerGrp = new THREE.Group();
  applyAnimatedDoorProgress(
    {
      doorId: 'dr_test',
      group: drawerGrp,
      kind: 'drawer',
      normalSign: 1,
      baseX: 0,
      baseY: 0.3,
      baseZ: 0.5,
      baseRotX: 0,
      baseRotY: 0,
      maxSlide: 0.36,
    },
    1
  );
  assert.ok(Math.abs(drawerGrp.position.z - 0.86) < 0.001);
});











test('Moving a gas-bearing base cabinet preserves the overhead hood coupling', () => {
  const wall = createWall('دیوار تست گاز', 0, 0, 500, 0);
  const base = createEmptyBox('base', 0, 240);
  const overhead = createEmptyBox('wall', 0, 500);
  wall.boxes.push(base, overhead);
  const placed = placeApplianceWithCabinetRules(
    wall, [wall], 'gas', base, 100, {}, 'hidden', { customWidth: 80 }
  );
  assert.equal(placed.ok, true);
  assert.ok(overhead.doors.some((d) => d.kind === 'lift' && Math.abs(d.startCm - 100) <= 0.5));
  const moved = moveBoxHierarchically(wall, [wall], base.id, 40, {});
  assert.ok(moved);
  assert.equal(base.offsetX, 40);
  assert.equal(placed.appliance!.offsetX, 140);
  assert.ok(overhead.unitDividers.includes(140));
  assert.ok(overhead.unitDividers.includes(220));
  assert.ok(overhead.doors.some((d) => d.kind === 'lift' && Math.abs(d.startCm - 140) <= 0.5));
  assert.equal(overhead.unitDividers.includes(100), false);
});

test('Cabinet magnetic snap aligns a base cabinet to an upper cabinet on the same wall', () => {
  const wall = createWall('دیوار تست اسنپ', 0, 0, 400, 0);
  const base = createEmptyBox('base', 0, 100);
  const upper = createEmptyBox('wall', 160, 70);
  wall.boxes.push(base, upper);
  const res = moveBoxHierarchically(wall, [wall], base.id, 158, {});
  assert.ok(res);
  assert.equal(base.offsetX, 160);
  assert.equal(upper.offsetX, 160);
});

test('equalizeDoorsAndFillGaps averages selected/uneven doors and fills empty gaps uniformly', () => {
  const wall = createWall('دیوار هم‌اندازه', 0, 0, 300, 0);
  const base = createEmptyBox('base', 0, 180);
  base.doors = [
    { id: 'd1', startCm: 0, widthCm: 35, kind: 'door', drawerRatios: [] },
    { id: 'd2', startCm: 80, widthCm: 50, kind: 'door', drawerRatios: [] },
  ];
  base.handles = [{ id: 'h1', doorId: 'd1', style: 'simple', orient: 'vertical', lengthCm: 16, xRatio: 0.86, yRatio: 0.5, rowIndex: 0 }];
  wall.boxes.push(base);

  const res = equalizeDoorsAndFillGaps(base, [], wall, [wall], {}, 'd1');
  assert.equal(res.ok, true);
  assert.equal(base.doors.length, 4);
  const totalW = base.doors.reduce((s, d) => s + d.widthCm, 0);
  assert.equal(totalW, 180);
  assert.ok(base.doors.every((d) => Math.abs(d.widthCm - 45) <= 0.1));
  assert.equal(base.handles.length, 4);
});

test('compactDisconnectedDoorsInBox packs scattered doors and shifts appliances to close <30cm slivers', () => {
  const wall = createWall('دیوار جمع‌کردن', 0, 0, 300, 0);
  const base = createEmptyBox('base', 0, 180);
  wall.boxes.push(base);
  const gasRes = placeApplianceWithCabinetRules(wall, [wall], 'gas', base, 20, {}, 'hidden', { customWidth: 80 });
  assert.equal(gasRes.ok, true);
  // Move doors away leaving a scattered 15cm gap
  base.doors.push(
    { id: 'sd1', startCm: 115, widthCm: 40, kind: 'door', drawerRatios: [] },
  );

  const res = compactDisconnectedDoorsInBox(base, [], wall, [wall], {});
  assert.equal(res.ok, true);
  // Gas left 20cm dead sliver at 0..20 -> should slide flush to 0..80, freeing 80..180 = 100cm, and sd1 packs cleanly!
  assert.equal(gasRes.appliance!.offsetX, 0);
  const hinged = base.doors.filter((d) => d.kind === 'door');
  assert.equal(hinged.length, 1);
  assert.equal(hinged[0].startCm, 80);
});

test('alignWallAndBaseDoorSeams matches upper vertical door seams to lower seams while skipping gas/sink bays', () => {
  const wall = createWall('دیوار بالا پایین', 0, 0, 240, 0);
  const base = createEmptyBox('base', 0, 180);
  base.doors = [
    { id: 'bd1', startCm: 0, widthCm: 45, kind: 'door', drawerRatios: [] },
    { id: 'bd2', startCm: 45, widthCm: 45, kind: 'door', drawerRatios: [] },
  ];
  const wallBox = createEmptyBox('wall', 0, 180);
  wallBox.doors = [
    { id: 'wd1', startCm: 0, widthCm: 60, kind: 'door', drawerRatios: [] },
    { id: 'wd2', startCm: 60, widthCm: 30, kind: 'door', drawerRatios: [] },
  ];
  wall.boxes.push(base, wallBox);

  const res = alignWallAndBaseDoorSeams(wall, [wall], {});
  assert.equal(res.ok, true);
  assert.equal(wallBox.doors[0].widthCm, 45);
  assert.equal(wallBox.doors[1].widthCm, 45);
});

test('fitCalibrationDragABWithScale anchors point A while rotating and uniformly scaling the entire kitchen scene via point B', () => {
  const a = { x: -1, z: 0 };
  const b = { x: 1, z: 0 }; // 2m model span along +X
  const anchorA = { x: 0.5, z: -1.0 };
  // Move target B to 3m along +Z (rotated -90deg & 1.5x uniform scale!)
  const targetB = { x: 0.5, z: 2.0 };
  const sol = fitCalibrationDragABWithScale(a, b, anchorA, targetB);
  assert.ok(sol);
  assert.equal(sol!.scale, 1.5);
  const c = Math.cos(sol!.yaw);
  const s = Math.sin(sol!.yaw);
  const mapPt = (p: { x: number; z: number }) => ({
    x: sol!.x + sol!.scale * (p.x * c + p.z * s),
    z: sol!.z + sol!.scale * (-p.x * s + p.z * c),
  });
  const mappedA = mapPt(a);
  const mappedB = mapPt(b);
  assert.ok(Math.hypot(mappedA.x - anchorA.x, mappedA.z - anchorA.z) < 0.005);
  assert.ok(Math.hypot(mappedB.x - targetB.x, mappedB.z - targetB.z) < 0.005);
});

test('FloorScanner requires three distinct spatial hits, matching Chido (not repeated frames)', () => {
  const makeHit = (x: number, y: number, z: number): XRHitTestResult => {
    const m = new THREE.Matrix4().makeTranslation(x, y, z);
    return {
      getPose: () => ({ transform: { matrix: m.elements } }),
    } as unknown as XRHitTestResult;
  };
  const space = {} as XRReferenceSpace;
  const viewer = new THREE.Vector3(0, 1.5, 0);

  // 1) Multi-ray scan becomes ready on the very first frame (zero clicks!)
  const scannerMulti = new FloorScanner();
  scannerMulti.update(
    [makeHit(0, 0, -1)],
    [makeHit(0.35, 0.002, -1), makeHit(-0.35, -0.002, -1.2)],
    space,
    viewer,
    100
  );
  assert.equal(scannerMulti.ready, true);

  // 2) One repeated hit never certifies a floor, even over multiple frames.
  const scannerSingle = new FloorScanner();
  for (let i = 0; i < 10; i++) {
    scannerSingle.update([makeHit(0, 0, -1)], [], space, viewer, 200 + i * 33);
  }
  assert.equal(scannerSingle.ready, false);
});

test('Drawer patterns include single top/bottom drawer + door and leave uncovered cabinet space empty', () => {
  const topIdx = DRAWER_PATTERNS.findIndex((p) => p.id === '1top');
  const botIdx = DRAWER_PATTERNS.findIndex((p) => p.id === '1bot');
  assert.ok(topIdx >= 0 && botIdx >= 0);

  const box = createEmptyBox('base', 0, 180);
  const pTop = computeDoorBrushPreview(box, 15, 'horizontal', 1, topIdx, 0, [], 60);
  assert.equal(pTop.ok, true);
  assert.equal(pTop.items.length, 1);
  assert.equal(pTop.items[0].kind, 'door');
  assert.equal(pTop.items[0].widthCm, 60);
  assert.deepEqual(pTop.items[0].drawerBand, { position: 'top', ratio: 0.26 });

  applyDoorBrushPreview(box, 15, pTop);
  assert.equal(box.doors.length, 1);
  assert.deepEqual(box.doors[0].drawerBand, { position: 'top', ratio: 0.26 });
  // Remainder (60..180) remains genuinely empty
  assert.equal(box.doors[0].startCm + box.doors[0].widthCm, 60);

  // Applying 1bot replaces drawerBand on existing door cleanly
  const pBot = computeDoorBrushPreview(box, 25, 'horizontal', 1, botIdx, 0, [], 60);
  assert.equal(pBot.ok, true);
  applyDoorBrushPreview(box, 25, pBot);
  assert.equal(box.doors[0].kind, 'door');
  assert.deepEqual(box.doors[0].drawerBand, { position: 'bottom', ratio: 0.26 });
});

test('Placing hinged doors defers unitDividers until optimizeBoxUnitsSmart creates paired units (2->1, 4->2, 5->3, 6->3)', () => {
  const b2 = createEmptyBox('base', 0, 120);
  applyDoorBrushPreview(b2, 10, computeDoorBrushPreview(b2, 10, 'vertical', 2, 0, 0, [], 60));
  assert.equal(b2.unitDividers.length, 0);
  optimizeBoxUnitsSmart(b2, null, [], []);
  assert.equal(getUnitsInBox(b2, []).length, 1);
  assert.equal(b2.unitDividers.length, 0);

  const b4 = createEmptyBox('base', 0, 240);
  applyDoorBrushPreview(b4, 10, computeDoorBrushPreview(b4, 10, 'vertical', 4, 0, 0, [], 60));
  assert.equal(b4.unitDividers.length, 0);
  optimizeBoxUnitsSmart(b4, null, [], []);
  assert.equal(getUnitsInBox(b4, []).length, 2);
  assert.deepEqual(b4.unitDividers, [120]);

  const b5 = createEmptyBox('base', 0, 300);
  applyDoorBrushPreview(b5, 10, computeDoorBrushPreview(b5, 10, 'vertical', 5, 0, 0, [], 60));
  assert.equal(b5.unitDividers.length, 0);
  optimizeBoxUnitsSmart(b5, null, [], []);
  assert.equal(getUnitsInBox(b5, []).length, 3);
  assert.equal(b5.unitDividers.length, 2);

  const b6 = createEmptyBox('base', 0, 360);
  applyDoorBrushPreview(b6, 10, computeDoorBrushPreview(b6, 10, 'vertical', 6, 0, 0, [], 60));
  assert.equal(b6.unitDividers.length, 0);
  optimizeBoxUnitsSmart(b6, null, [], []);
  assert.equal(getUnitsInBox(b6, []).length, 3);
  assert.deepEqual(b6.unitDividers, [120, 240]);

  // Partial 2-door placement inside wider 240cm box leaves remaining 120..240cm empty
  const partial = createEmptyBox('base', 0, 240);
  applyDoorBrushPreview(partial, 10, computeDoorBrushPreview(partial, 10, 'vertical', 2, 0, 0, [], 60));
  assert.deepEqual(partial.doors.map((d) => d.widthCm), [60, 60]);
  assert.equal(partial.doors[1].startCm + partial.doors[1].widthCm, 120);
});

test('canDoorOpenIn3D locks doors, drawers, and lifts closed until a handle is placed', () => {
  const box = createEmptyBox('base', 0, 120);
  box.doors = [
    { id: 'd1', startCm: 0, widthCm: 60, kind: 'door', drawerRatios: [], drawerBand: { position: 'top', ratio: 0.26 } },
    { id: 'd2', startCm: 60, widthCm: 60, kind: 'drawer', drawerRatios: [0.333, 0.667] },
  ];

  // Neither door nor drawer rows can open without handles
  assert.equal(canDoorOpenIn3D(box, box.doors[0]), false);
  assert.equal(canDoorOpenIn3D(box, box.doors[1], 0), false);
  assert.equal(canDoorOpenIn3D(box, box.doors[1], 1), false);

  // Add handle to d1 and only row 1 of drawer d2
  box.handles.push(
    { id: 'h1', doorId: 'd1', rowIndex: 0, xRatio: 0.86, yRatio: 0.18, orient: 'vertical', style: 'simple', lengthCm: 16 },
    { id: 'h2', doorId: 'd2', rowIndex: 1, xRatio: 0.5, yRatio: 0.5, orient: 'horizontal', style: 'simple', lengthCm: 16 }
  );
  assert.equal(canDoorOpenIn3D(box, box.doors[0]), true);
  assert.equal(canDoorOpenIn3D(box, box.doors[1], 0), false);
  assert.equal(canDoorOpenIn3D(box, box.doors[1], 1), true);
});

test('computeCabinetSweepRange supports forward/backward two-click sweep with 5cm snap and 30cm minimum', () => {
  assert.deepEqual(computeCabinetSweepRange(22, 163, 340, 30), { offsetX: 20, width: 145 });
  assert.deepEqual(computeCabinetSweepRange(200, 81, 340, 30), { offsetX: 80, width: 120 });
  assert.deepEqual(computeCabinetSweepRange(100, 105, 340, 30), { offsetX: 100, width: 30 });
  assert.deepEqual(computeCabinetSweepRange(335, 340, 340, 30), { offsetX: 310, width: 30 });
});

test('Dynamic vertical door count allows up to 7 doors on a 250cm box (min 35cm each)', () => {
  assert.equal(getMaxVerticalDoorCount(250), 7);
  const box = createEmptyBox('base', 0, 250);
  const prev = computeDoorBrushPreview(box, 10, 'vertical', 7, 0, 0, [], 60);
  assert.equal(prev.ok, true);
  assert.equal(prev.items.length, 7);
  for (const item of prev.items) {
    assert.ok(item.widthCm >= 35, `Expected width >= 35cm, got ${item.widthCm}`);
  }
});

test('resizeDrawerUnitWidthCm clamps stack between 40..110cm and syncs neighboring doors & dividers', () => {
  const box = createEmptyBox('base', 0, 200);
  box.doors = [
    { id: 'dL', startCm: 0, widthCm: 60, kind: 'door', drawerRatios: [] },
    { id: 'drw', startCm: 60, widthCm: 80, kind: 'drawer', drawerRatios: [0.25, 0.58] },
    { id: 'dR', startCm: 140, widthCm: 60, kind: 'door', drawerRatios: [] },
  ];
  box.unitDividers = [60, 140];

  const r1 = resizeDrawerUnitWidthCm(box, 'drw', 'right', 100, []);
  assert.equal(r1.ok, true);
  assert.equal(r1.widthCm, 100);
  assert.equal(box.doors[1].widthCm, 100);
  assert.equal(box.doors[2].startCm, 160);
  assert.equal(box.doors[2].widthCm, 40);
  assert.ok(box.unitDividers.includes(160));

  const rMax = resizeDrawerUnitWidthCm(box, 'drw', 'left', 130, []);
  assert.equal(rMax.ok, true);
  assert.ok(box.doors[1].widthCm <= 110 && box.doors[1].widthCm >= 40);
});

test('canPlaceHandleInBay blocks handle placement on multi-door undivided bays and push-to-open opens without handle', () => {
  const box = createEmptyBox('base', 0, 180);
  box.doors = [
    { id: 'a1', startCm: 0, widthCm: 60, kind: 'door', drawerRatios: [] },
    { id: 'a2', startCm: 60, widthCm: 60, kind: 'door', drawerRatios: [] },
    { id: 'a3', startCm: 120, widthCm: 60, kind: 'door', drawerRatios: [] },
  ];
  assert.equal(canPlaceHandleInBay(box, box.doors[0], []).ok, false);
  assert.equal(canPlaceHandleInBay(box, box.doors[0], []).reason, 'اول یونیت رو مشخص کن');

  box.unitDividers = [120];
  assert.equal(canPlaceHandleInBay(box, box.doors[0], []).ok, true);

  applyHardwareKindToDoors(box, ['a1'], 'push-to-open');
  assert.equal(box.doors[0].hardwareKind, 'push-to-open');
  assert.equal(canDoorOpenIn3D(box, box.doors[0]), true);
});

test('addVerticalDividerWithCenterSnap snaps within center tolerance and RoomColumn supports 1cm depth step', () => {
  const box = createEmptyBox('base', 0, 100);
  const vRes = addVerticalDividerWithCenterSnap(box, 0, 100, 0.47);
  assert.equal(vRes.ok, true);
  assert.equal(vRes.snappedCenter, true);
  assert.equal(vRes.xRatio, 0.5);
  assert.equal(box.shelves[0].orient, 'vertical');

  const wall = createWall('دیوار ۱', 0, 0, 300, 0, 1);
  const col = createRoomColumn(120, 18, 265, { widthCm: 40, depthCm: 35 });
  updateRoomColumn(col, { depthCm: 37 }, 265);
  assert.equal(col.depthCm, 37);
  const spans = getWallColumnSpans(wall, [col]);
  assert.equal(spans.length, 1);
  assert.equal(spans[0].startCm, 100);
  assert.equal(spans[0].endCm, 140);
});

test('Criterion 1: Placing gas or sink after doors eliminates <30cm holes via snap/stretch/pantry', () => {
  const wall = createWall('دیوار ۱', 0, 0, 300, 0, 1);
  const box = createEmptyBox('base', 0, 300);
  wall.boxes.push(box);
  applyDoorBrushPreview(box, 10, computeDoorBrushPreview(box, 10, 'vertical', 5, 0, 0, [], 60));
  assert.equal(box.doors.length, 5);

  // Place 90cm gas slightly off-seam so naive overlap would create a <30cm sliver
  const res = placeApplianceWithCabinetRules(wall, [wall], 'gas', box, 73, {}, 'chimney', {
    customWidth: 90,
  });
  assert.equal(res.ok, true);
  assert.equal(wall.appliances.length, 1);
  const gas = wall.appliances[0];

  // Verify no <30cm dead gap exists on either side of gas
  const sorted = [...box.doors].sort((a, b) => a.startCm - b.startCm);
  let cursor = 0;
  for (const d of sorted) {
    const gap = d.startCm - cursor;
    assert.ok(
      gap < 0.5 || gap >= 30 || Math.abs(cursor - gas.offsetX) < 1,
      `Unexpected hole [${cursor}..${d.startCm}]`
    );
    cursor = d.startCm + d.widthCm;
  }
  assert.ok(
    box.width - cursor < 0.5 || box.width - cursor >= 30,
    `Unexpected trailing hole [${cursor}..${box.width}]`
  );
  // Every non-pantry door stays >= 30cm and any pantry beside gas stays >= MIN_PANTRY_CM (15cm)
  for (const d of sorted) {
    if (d.hardwareKind === 'pantry-pullout') {
      assert.ok(d.widthCm >= MIN_PANTRY_CM);
    } else {
      assert.ok(d.widthCm >= 30, `Door too narrow: ${d.widthCm}`);
    }
  }
});

test('Criterion 2: Placing fridge over doored base box strips orphaned dividers and rebalances flush to cut edge', () => {
  const wall = createWall('دیوار ۱', 0, 0, 360, 0, 1);
  const base = createEmptyBox('base', 0, 360);
  wall.boxes.push(base);
  applyDoorBrushPreview(base, 10, computeDoorBrushPreview(base, 10, 'vertical', 6, 0, 0, [], 60));
  // Add dividers close to the upcoming fridge cut edge (135..235)
  base.unitDividers = [120, 240];

  const fRes = placeFridgeOnWall(wall, [wall], 'side-by-side', 132, {}, true);
  assert.equal(fRes.ok, true);
  const fridge = wall.boxes.find((b) => b.type === 'fridge');
  assert.ok(fridge);

  const leftBox = wall.boxes.find((b) => b.type === 'base' && b.offsetX < fridge.offsetX);
  const rightBox = wall.boxes.find((b) => b.type === 'base' && b.offsetX >= fridge.offsetX + fridge.width);
  assert.ok(leftBox && rightBox);

  // Left & right carved boxes must have balanced doors flush to box edges with no <30cm gap or orphaned <25cm dividers
  for (const sideBox of [leftBox, rightBox]) {
    for (const div of sideBox.unitDividers) {
      assert.ok(div >= 25 && sideBox.width - div >= 25, `Orphaned divider ${div} in box width ${sideBox.width}`);
    }
    const sorted = [...sideBox.doors].sort((a, b) => a.startCm - b.startCm);
    if (sorted.length > 0) {
      assert.ok(sorted[0].startCm < 0.6, `Left gap in carved box: ${sorted[0].startCm}`);
      const endX = sorted[sorted.length - 1].startCm + sorted[sorted.length - 1].widthCm;
      assert.ok(sideBox.width - endX < 0.6, `Right gap in carved box: ${sideBox.width - endX}`);
    }
  }
});

test('Criterion 3: Seam click inserts into open gap and multi-door brush shrinks tight neighbors or explains minimum width', () => {
  // Seam click near open 45cm gap on right of [0..60] door inserts into gap instead of halving [0..60]
  const gapBox = createEmptyBox('base', 0, 105);
  gapBox.doors = [{ id: 'd0', startCm: 0, widthCm: 60, kind: 'door', drawerRatios: [] }];
  const seamPrev = computeDoorBrushPreview(gapBox, 57, 'vertical', 1, 0, 0, [], 60);
  assert.equal(seamPrev.ok, true);
  assert.equal(seamPrev.items.length, 1);
  assert.ok(Math.abs(seamPrev.items[0].startCm - 60) < 0.5);
  assert.ok(Math.abs(seamPrev.items[0].widthCm - 45) < 0.5);
  applyDoorBrushPreview(gapBox, 57, seamPrev);
  assert.deepEqual(gapBox.doors.map((d) => Math.round(d.widthCm)), [60, 45]);

  // Multi-door shrink: 100cm bay with one 60cm door + 40cm gap -> placing 3 doors shrinks bay cleanly to 3 doors >= 30cm
  const tightBox = createEmptyBox('base', 0, 100);
  tightBox.doors = [{ id: 't0', startCm: 0, widthCm: 60, kind: 'door', drawerRatios: [] }];
  const multiPrev = computeDoorBrushPreview(tightBox, 20, 'vertical', 3, 0, 0, [], 60);
  assert.equal(multiPrev.ok, true);
  applyDoorBrushPreview(tightBox, 20, multiPrev);
  assert.equal(tightBox.doors.length, 3);
  for (const d of tightBox.doors) assert.ok(d.widthCm >= 30);

  // Impossible 4 doors in 100cm bay returns explicit minimum error message
  const failPrev = computeDoorBrushPreview(tightBox, 50, 'vertical', 4, 0, 0, [], 60);
  assert.equal(failPrev.ok, false);
  assert.ok(failPrev.reason?.includes('برای 4 درب، عرض درب یا دهانه باید حداقل 120cm باشد'));
});

test('Criterion 4: optimizeBoxUnitsSmart handles pantry beside gas/fridge, 2-door pairs, 3-door option, and ergonomic hinges', () => {
  const wall = createWall('دیوار ۱', 0, 0, 300, 0, 1);
  const box = createEmptyBox('base', 0, 275);
  box.doors = [
    { id: 'd_wall', startCm: 0, widthCm: 45, kind: 'door', drawerRatios: [] },
    { id: 'd_pantry', startCm: 45, widthCm: 20, kind: 'door', drawerRatios: [] },
    { id: 'd_gas', startCm: 65, widthCm: 90, kind: 'drawer', drawerRatios: [0.33, 0.67] },
    { id: 'd_a', startCm: 155, widthCm: 40, kind: 'door', drawerRatios: [] },
    { id: 'd_b', startCm: 195, widthCm: 40, kind: 'door', drawerRatios: [] },
    { id: 'd_c', startCm: 235, widthCm: 40, kind: 'door', drawerRatios: [] },
  ];
  wall.boxes.push(box);
  wall.appliances.push({ id: 'g1', kind: 'gas', offsetX: 65, width: 90 });

  // 1) Default (allowThreeDoorUnit: false): converts 20cm & gas-side 40cm into pantry-pullout + splits 2+1
  optimizeBoxUnitsSmart(box, wall, [wall], [], { allowThreeDoorUnit: false });
  const pantry = box.doors.find((d) => d.id === 'd_pantry')!;
  assert.equal(pantry.hardwareKind, 'pantry-pullout');
  assert.equal(pantry.hingeSide, undefined);
  const gasSideDoor = box.doors.find((d) => d.id === 'd_a')!;
  assert.equal(gasSideDoor.hardwareKind, 'pantry-pullout');
  assert.equal(box.doors.find((d) => d.id === 'd_b')!.hingeSide, 'left');
  assert.equal(box.doors.find((d) => d.id === 'd_c')!.hingeSide, 'right');
  // Pantry gets centered vertical handle on auto handle placement
  applyHandlesToBoxDoors(box, ['d_pantry'], 'simple', 'horizontal', undefined, []);
  const pHandle = box.handles.find((h) => h.doorId === 'd_pantry')!;
  assert.equal(pHandle.orient, 'vertical');
  assert.equal(pHandle.xRatio, 0.5);
  assert.equal(pHandle.yRatio, 0.5);
  // Wall-adjacent single door hinges toward wall (left)
  assert.equal(box.doors.find((d) => d.id === 'd_wall')!.hingeSide, 'left');

  // 2) allowThreeDoorUnit: true keeps [pantry + pair] in one undivided 3-door unit (no divider between d_a and d_b)
  optimizeBoxUnitsSmart(box, wall, [wall], [], { allowThreeDoorUnit: true });
  assert.ok(!box.unitDividers.some((u) => Math.abs(u - 195) < 1));
  const units = getUnitsInBox(box, []);
  const threeUnit = units.find((u) => Math.abs(u.startCm - 155) < 1);
  assert.ok(threeUnit && threeUnit.hingedCount === 3 && threeUnit.canHaveShelves === true);
});

test('Criterion 5: buildKitchen3DScene generates 3D drawer resize handles and door seam handles in select mode', () => {
  const wall = createWall('دیوار ۱', 0, 0, 220, 0, 1);
  const box = createEmptyBox('base', 0, 200);
  box.doors = [
    { id: 'l1', startCm: 0, widthCm: 60, kind: 'door', drawerRatios: [] },
    { id: 'dr1', startCm: 60, widthCm: 80, kind: 'drawer', drawerRatios: [0.33, 0.67] },
    { id: 'r1', startCm: 140, widthCm: 30, kind: 'door', drawerRatios: [] },
    { id: 'r2', startCm: 170, widthCm: 30, kind: 'door', drawerRatios: [] },
  ];
  box.unitDividers = [60, 140];
  wall.boxes.push(box);

  const proj = {
    version: 1,
    walls: [wall],
    cornerOwners: {},
    activeWallId: wall.id,
    activeBoxId: box.id,
    selectedDoorId: 'dr1',
    selectedOpeningId: null,
    selectedApplianceId: null,
    doorsHidden: false,
    doorsLocked: false,
    designStyle: 'modern' as const,
  };

  const prevDoc = (globalThis as { document?: unknown }).document;
  const fakeGrad = { addColorStop() {} };
  const fakeCtx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    createLinearGradient: () => fakeGrad,
    createRadialGradient: () => fakeGrad,
    fillRect() {},
    strokeRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    bezierCurveTo() {},
    stroke() {},
    createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {},
  };
  (globalThis as { document?: unknown }).document = {
    createElement: () => ({
      width: 256,
      height: 256,
      getContext: () => fakeCtx,
    }),
  };

  try {
    const built = buildKitchen3DScene(proj, { doorOpenProgress: 0, tool: 'select' });
    const kinds = built.interactables.map((m) => (m.userData as { kind?: string })?.kind);
    assert.equal(kinds.filter((k) => k === 'drawer-resize-handle').length, 2);
    assert.ok(kinds.filter((k) => k === 'door-seam-handle').length >= 1);
  } finally {
    if (prevDoc === undefined) delete (globalThis as { document?: unknown }).document;
    else (globalThis as { document?: unknown }).document = prevDoc;
  }
});

test('getBoxCarpentryElements generates 5cm corner filler, drawer side stiles, outer stiles, and base-only top rails without blocking double-door centers', () => {
  const wall = createWall('دیوار کنج', 0, 0, 300, 0, 1);
  const base = createEmptyBox('base', 0, 240);
  base.doors = [
    { id: 'd1', startCm: 60, widthCm: 45, kind: 'door', hingeSide: 'left', drawerRatios: [] },
    { id: 'd2', startCm: 105, widthCm: 45, kind: 'door', hingeSide: 'right', drawerRatios: [] },
    { id: 'dr', startCm: 150, widthCm: 90, kind: 'drawer', drawerRatios: [0.33, 0.67] },
  ];
  base.unitDividers = [60, 150];
  wall.boxes.push(base);

  const cornerBlocked = [
    {
      startCm: 0,
      endCm: 60,
      depthCm: 60,
      tier: 'lower' as const,
      role: 'blind-behind' as const,
      otherWallName: 'دیوار ۲',
      cornerKey: 'c1',
    },
  ];
  const els = getBoxCarpentryElements(base, wall, cornerBlocked, []);

  // Corner filler closes the 5cm trimmed gap right at 60..65cm
  const filler = els.find((e) => e.kind === 'corner-filler');
  assert.ok(filler && filler.startCm === 60 && filler.widthCm === 5);

  // Drawer unit [150..240] gets 5cm side stiles on both edges and NO top rail
  const drawerLeftStile = els.find((e) => e.kind === 'side-stile' && Math.abs(e.startCm - 150) < 0.1);
  const drawerRightStile = els.find((e) => e.kind === 'side-stile' && Math.abs(e.startCm - 235) < 0.1);
  assert.ok(drawerLeftStile && drawerLeftStile.widthCm === 5);
  assert.ok(drawerRightStile && drawerRightStile.widthCm === 5);

  // NO center stile between paired symmetric doors at seam 105cm
  const centerStile = els.find((e) => e.kind !== 'top-rail' && e.startCm < 105 && e.startCm + e.widthCm > 105);
  assert.equal(centerStile, undefined);

  // Base hinged unit [60..150] gets top rail (trimmed past corner-filler 65..150), drawer unit [150..240] gets NONE
  const topRails = els.filter((e) => e.kind === 'top-rail');
  assert.equal(topRails.length, 1);
  assert.ok(topRails[0].startCm >= 65 && topRails[0].startCm + topRails[0].widthCm <= 150);

  // Wall box never gets top-rail
  const wallBox = createEmptyBox('wall', 60, 120);
  wallBox.doors = [
    { id: 'w1', startCm: 0, widthCm: 60, kind: 'door', drawerRatios: [] },
    { id: 'w2', startCm: 60, widthCm: 60, kind: 'door', drawerRatios: [] },
  ];
  const wallEls = getBoxCarpentryElements(wallBox, wall, [], []);
  assert.equal(wallEls.some((e) => e.kind === 'top-rail'), false);
});

