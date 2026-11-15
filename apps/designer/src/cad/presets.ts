import { DEFAULT_PROJECT_SETTINGS, FRIDGE_FRAME_CM, FRIDGE_MODELS } from './constants';
import { makeCornerKey } from './cornerLogic';
import { createEmptyBox, createWall, syncHoodUnitAboveGas, uid } from './doorRules';
import { ProjectState } from './types';

export type PresetMode = 'single' | 'L' | 'U' | 'closet';

export function buildPresetProject(mode: PresetMode): ProjectState {
  if (mode === 'closet') {
    const w1 = createWall('دیوار کمد (300)', -150, -70, 150, -70, 1);
    const closet = createEmptyBox('closet', 0, 300);
    closet.doors = [
      { id: uid('door'), startCm: 0, widthCm: 50, kind: 'rail', drawerRatios: [] },
      { id: uid('door'), startCm: 50, widthCm: 50, kind: 'rail', drawerRatios: [] },
      { id: uid('door'), startCm: 100, widthCm: 50, kind: 'drawer', drawerRatios: [0.25, 0.5, 0.75] },
      { id: uid('door'), startCm: 150, widthCm: 50, kind: 'drawer', drawerRatios: [0.25, 0.5, 0.75] },
      { id: uid('door'), startCm: 200, widthCm: 50, kind: 'door', drawerRatios: [] },
      { id: uid('door'), startCm: 250, widthCm: 50, kind: 'door', drawerRatios: [] },
    ];
    closet.unitDividers = [100, 200];
    closet.shelves = [
      { id: uid('sh'), startCm: 0, endCm: 100, yRatio: 0.22 },
      { id: uid('sh'), startCm: 200, endCm: 300, yRatio: 0.22 },
      { id: uid('sh'), startCm: 200, endCm: 300, yRatio: 0.48 },
      { id: uid('sh'), startCm: 200, endCm: 300, yRatio: 0.74 },
    ];
    w1.boxes.push(closet);

    return {
      walls: [w1],
      cornerOwners: {},
      activeWallId: w1.id,
      activeBoxId: closet.id,
      selectedDoorId: closet.doors[0].id,
      selectedOpeningId: null,
      selectedApplianceId: null,
      selectedShelfId: null,
      selectedHandleId: null,
      selectedFrameId: null,
      doorsLocked: false,
      settings: { ...DEFAULT_PROJECT_SETTINGS },
    };
  }

  const w1 = createWall('دیوار اصلی (340)', -170, -90, 170, -90, 1);

  const base1 = createEmptyBox('base', 0, 230);
  if (mode === 'single') {
    base1.doors = [
      { id: uid('door'), startCm: 0, widthCm: 45, kind: 'door', drawerRatios: [] },
      { id: uid('door'), startCm: 45, widthCm: 45, kind: 'door', drawerRatios: [] },
      { id: uid('door'), startCm: 90, widthCm: 80, kind: 'drawer', drawerRatios: [0.22, 0.54] },
      { id: uid('door'), startCm: 170, widthCm: 30, kind: 'door', drawerRatios: [] },
      { id: uid('door'), startCm: 200, widthCm: 30, kind: 'door', drawerRatios: [] },
    ];
    base1.unitDividers = [90, 170];
  } else {
    base1.doors = [
      { id: uid('door'), startCm: 60, widthCm: 45, kind: 'door', drawerRatios: [] },
      { id: uid('door'), startCm: 105, widthCm: 45, kind: 'door', drawerRatios: [] },
      { id: uid('door'), startCm: 150, widthCm: 80, kind: 'drawer', drawerRatios: [0.22, 0.54] },
    ];
    base1.unitDividers = [60, 150];
  }

  // Two-tier wall cabinets aligned cleanly to 235cm top; horizontal lift doors sit directly above sink,
  // while leaving the stove bay open for the default exposed chimney hood!
  const wallLower =
    mode === 'single'
      ? createEmptyBox('wall', 0, 90, { twoDepthWallLower: true })
      : createEmptyBox('wall', 32, 118, { twoDepthWallLower: true });
  wallLower.doors =
    mode === 'single'
      ? [{ id: uid('door'), startCm: 0, widthCm: 90, kind: 'lift', drawerRatios: [] }]
      : [{ id: uid('door'), startCm: 28, widthCm: 90, kind: 'lift', drawerRatios: [] }];
  if (mode !== 'single') wallLower.unitDividers = [28];

  const wallUpper =
    mode === 'single'
      ? createEmptyBox('wall-deep', 0, 90)
      : createEmptyBox('wall-deep', 60, 90);
  wallUpper.doors = [
    { id: uid('door'), startCm: 0, widthCm: 45, kind: 'door', drawerRatios: [], hingeSide: 'left' },
    { id: uid('door'), startCm: 45, widthCm: 45, kind: 'door', drawerRatios: [], hingeSide: 'right' },
  ];

  const fridgeW = FRIDGE_MODELS['side-by-side'].width + FRIDGE_FRAME_CM * 2;
  const fridgeOffset = 230;
  const fridge = createEmptyBox('fridge', fridgeOffset, fridgeW, {
    hasFridgeFrame: true,
    fridgeModel: 'side-by-side',
  });
  const overFridge = createEmptyBox('wall-deep', fridgeOffset, fridgeW);
  overFridge.name = 'بالای یخچال';
  overFridge.elevY = fridge.height;
  overFridge.height = 45; // 190 + 45 = 235cm exact crown match!
  overFridge.linkedToBoxId = fridge.id;
  overFridge.doors = [{ id: uid('door'), startCm: 0, widthCm: fridgeW, kind: 'lift', drawerRatios: [] }];

  w1.boxes.push(base1, wallLower, wallUpper, fridge, overFridge);

  if (mode === 'single') {
    const wallRightLower = createEmptyBox('wall', 170, 60, { twoDepthWallLower: true });
    wallRightLower.doors = [
      { id: uid('door'), startCm: 0, widthCm: 30, kind: 'door', drawerRatios: [] },
      { id: uid('door'), startCm: 30, widthCm: 30, kind: 'door', drawerRatios: [] },
    ];
    const wallRightUpper = createEmptyBox('wall-deep', 170, 60);
    wallRightUpper.doors = [
      { id: uid('door'), startCm: 0, widthCm: 30, kind: 'door', drawerRatios: [], hingeSide: 'left' },
      { id: uid('door'), startCm: 30, widthCm: 30, kind: 'door', drawerRatios: [], hingeSide: 'right' },
    ];
    w1.boxes.push(wallRightLower, wallRightUpper);
    w1.appliances.push(
      { id: uid('app'), kind: 'sink', boxId: base1.id, offsetX: 0, width: 90, sinkModel: 'steel-2' },
      { id: uid('app'), kind: 'gas', boxId: base1.id, offsetX: 90, width: 80, hoodKind: 'chimney' }
    );
  } else {
    w1.appliances.push(
      { id: uid('app'), kind: 'sink', boxId: base1.id, offsetX: 60, width: 90, sinkModel: 'steel-2' },
      { id: uid('app'), kind: 'gas', boxId: base1.id, offsetX: 150, width: 80, hoodKind: 'chimney' }
    );
  }

  for (const app of w1.appliances) {
    if (app.kind === 'gas') syncHoodUnitAboveGas(w1, app);
  }

  const walls = [w1];
  const cornerOwners: Record<string, string> = {};

  if (mode === 'L' || mode === 'U') {
    const w2 = createWall('دیوار کنج چپ (200)', -170, -90, -170, 110, -1);
    const key12 = makeCornerKey(w1.id, 'start', w2.id, 'start');
    cornerOwners[key12] = w1.id;

    const base2 = createEmptyBox('base', 60, 140);
    base2.doors = [
      { id: uid('door'), startCm: 0, widthCm: 46.6, kind: 'door', drawerRatios: [] },
      { id: uid('door'), startCm: 46.6, widthCm: 46.6, kind: 'door', drawerRatios: [] },
      { id: uid('door'), startCm: 93.2, widthCm: 46.8, kind: 'door', drawerRatios: [] },
    ];
    base2.unitDividers = [46.6, 93.2];

    const wall2 = createEmptyBox('wall', 32, 168, { twoDepthWallLower: true });
    wall2.doors = [
      { id: uid('door'), startCm: 0, widthCm: 56, kind: 'door', drawerRatios: [] },
      { id: uid('door'), startCm: 56, widthCm: 56, kind: 'door', drawerRatios: [] },
      { id: uid('door'), startCm: 112, widthCm: 56, kind: 'door', drawerRatios: [] },
    ];

    const wall2Upper = createEmptyBox('wall-deep', 60, 140);
    wall2Upper.doors = [
      { id: uid('door'), startCm: 0, widthCm: 35, kind: 'door', drawerRatios: [], hingeSide: 'left' },
      { id: uid('door'), startCm: 35, widthCm: 35, kind: 'door', drawerRatios: [], hingeSide: 'right' },
      { id: uid('door'), startCm: 70, widthCm: 35, kind: 'door', drawerRatios: [], hingeSide: 'left' },
      { id: uid('door'), startCm: 105, widthCm: 35, kind: 'door', drawerRatios: [], hingeSide: 'right' },
    ];
    wall2Upper.unitDividers = [70];

    w2.boxes.push(base2, wall2, wall2Upper);
    walls.push(w2);
  }

  if (mode === 'U') {
    w1.boxes = w1.boxes.filter((b) => b.id !== fridge.id && b.id !== overFridge.id);
    base1.width = 280;
    base1.doors.push({ id: uid('door'), startCm: 230, widthCm: 50, kind: 'door', drawerRatios: [] });

    const w3 = createWall('دیوار راست (200)', 170, -90, 170, 110, 1);
    const key13 = makeCornerKey(w1.id, 'end', w3.id, 'start');
    cornerOwners[key13] = w1.id;

    const tall3 = createEmptyBox('tall', 60, 120);
    tall3.height = 235; // Matches 235cm unified crown height!
    tall3.doors = [
      { id: uid('door'), startCm: 0, widthCm: 60, kind: 'door', drawerRatios: [] },
      { id: uid('door'), startCm: 60, widthCm: 60, kind: 'door', drawerRatios: [] },
    ];
    tall3.unitDividers = [60];
    w3.boxes.push(tall3);
    walls.push(w3);
  }

  return {
    walls,
    cornerOwners,
    activeWallId: w1.id,
    activeBoxId: base1.id,
    selectedDoorId: base1.doors[0]?.id ?? null,
    selectedOpeningId: null,
    selectedApplianceId: null,
    selectedShelfId: null,
    selectedHandleId: null,
    selectedFrameId: null,
    doorsLocked: false,
    settings: { ...DEFAULT_PROJECT_SETTINGS },
  };
}
