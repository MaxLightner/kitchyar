import { MAX_DOOR_CM, MAX_LIFT_DOOR_CM, MIN_DOOR_CM, MIN_LIFT_DOOR_CM } from './constants';
import { getCornerBlockedZonesForWall } from './cornerLogic';
import {
  autoUnitizeBoxForHandles,
  clearHoodUnitForGas,
  compactDisconnectedDoorsInBox,
  ensureHorizontalDoorsAboveSink,
  findParentBoxForAppliance,
  getBoxUsableFrontSpan,
  getWallHorizontalDrawerRatios,
  moveApplianceHierarchically,
  optimizeBoxWithAppliances,
  populateSmartShelvesForBox,
  stripInvalidColumnAndCornerDividers,
  syncHoodUnitAboveGas,
  uid,
} from './doorRules';
import { getWallColumnSpans } from './openingRules';
import {
  BlockedZone,
  CabinetBox,
  DoorStyle,
  HandleStyle,
  ProjectState,
  RoomColumn,
  Wall,
} from './types';

export interface SmartDesignResult {
  next: ProjectState;
  changed: boolean;
  firstWallId?: string;
  firstBoxId?: string;
  changedBoxes: number;
  placedDoors: number;
  placedHandles: number;
  syncedAppliances: number;
  summary: string;
}

interface Interval {
  startCm: number;
  endCm: number;
}

function subtractIntervals(baseStart: number, baseEnd: number, subtract: Interval[]): Interval[] {
  let spans: Interval[] = [{ startCm: +baseStart.toFixed(1), endCm: +baseEnd.toFixed(1) }];
  const sorted = [...subtract]
    .filter((i) => i.endCm > i.startCm + 0.5)
    .sort((a, b) => a.startCm - b.startCm);

  for (const sub of sorted) {
    const next: Interval[] = [];
    for (const sp of spans) {
      if (sub.endCm <= sp.startCm + 0.5 || sub.startCm >= sp.endCm - 0.5) {
        next.push(sp);
      } else {
        if (sub.startCm - sp.startCm >= 1) {
          next.push({ startCm: sp.startCm, endCm: +sub.startCm.toFixed(1) });
        }
        if (sp.endCm - sub.endCm >= 1) {
          next.push({ startCm: +sub.endCm.toFixed(1), endCm: sp.endCm });
        }
      }
    }
    spans = next;
  }
  return spans;
}

function chooseBalancedDoorCount(widthCm: number, minDoor: number, maxDoor: number): number {
  const minCount = Math.max(1, Math.ceil((widthCm - 0.1) / maxDoor));
  const maxCount = Math.max(1, Math.floor((widthCm + 0.1) / minDoor));
  const clampedMin = Math.min(minCount, maxCount);
  const clampedMax = Math.max(minCount, maxCount);
  const target = Math.max(1, Math.round(widthCm / 45));
  return Math.max(clampedMin, Math.min(clampedMax, target));
}

function addUnitDividerIfInterior(box: CabinetBox, posCm: number): void {
  const rounded = +posCm.toFixed(1);
  if (rounded <= 2 || rounded >= box.width - 2) return;
  if (!box.unitDividers.some((u) => Math.abs(u - rounded) < 1.5)) {
    box.unitDividers.push(rounded);
  }
}

function populateVerticalDoorsInSpan(
  box: CabinetBox,
  startCm: number,
  endCm: number,
  doorStyle: DoorStyle
): number {
  const spanW = +(endCm - startCm).toFixed(1);
  if (spanW < MIN_DOOR_CM - 0.1) return 0;

  const count = chooseBalancedDoorCount(spanW, MIN_DOOR_CM, MAX_DOOR_CM);
  const eachW = +(spanW / count).toFixed(1);
  let cur = startCm;
  let added = 0;

  for (let i = 0; i < count; i++) {
    const w = i === count - 1 ? +(endCm - cur).toFixed(1) : eachW;
    const hingeSide: 'left' | 'right' =
      count === 2
        ? i === 0
          ? 'left'
          : 'right'
        : i % 2 === 0
        ? 'left'
        : 'right';

    box.doors.push({
      id: uid('door'),
      startCm: +cur.toFixed(1),
      widthCm: w,
      kind: 'door',
      doorStyle,
      hingeSide,
      drawerRatios: [],
    });
    cur += w;
    added++;
  }
  return added;
}

function collectBlockedIntervalsForBox(
  box: CabinetBox,
  wall: Wall,
  blockedZones: BlockedZone[],
  columns: RoomColumn[] = []
): Interval[] {
  const usable = getBoxUsableFrontSpan(box, blockedZones);
  const blocked: Interval[] = [];

  if (usable.startCm > 0.5) blocked.push({ startCm: 0, endCm: usable.startCm });
  if (usable.endCm < box.width - 0.5) blocked.push({ startCm: usable.endCm, endCm: box.width });

  for (const cs of getWallColumnSpans(wall, columns)) {
    const vOverlap = box.elevY < cs.elevY + cs.height - 1 && box.elevY + box.height > cs.elevY + 1;
    if (!vOverlap) continue;
    const ls = Math.max(0, +(cs.startCm - box.offsetX).toFixed(1));
    const le = Math.min(box.width, +(cs.endCm - box.offsetX).toFixed(1));
    if (le - ls > 1) blocked.push({ startCm: ls, endCm: le });
  }

  for (const d of box.doors) {
    blocked.push({ startCm: d.startCm, endCm: +(d.startCm + d.widthCm).toFixed(1) });
  }

  // Reserve base dishwasher / washing spaces and upper chimney hood bays
  if (box.type === 'base') {
    for (const app of wall.appliances) {
      if (app.kind !== 'dishwasher' && app.kind !== 'washing') continue;
      const ls = Math.max(0, +(app.offsetX - box.offsetX).toFixed(1));
      const le = Math.min(box.width, +(app.offsetX + app.width - box.offsetX).toFixed(1));
      if (le - ls > 2) blocked.push({ startCm: ls, endCm: le });
    }
  } else if (box.type === 'wall' || box.type === 'wall-deep') {
    for (const app of wall.appliances) {
      if (app.kind !== 'gas' || app.hoodKind === 'hidden') continue;
      const ls = Math.max(0, +(app.offsetX - box.offsetX).toFixed(1));
      const le = Math.min(box.width, +(app.offsetX + app.width - box.offsetX).toFixed(1));
      if (le - ls > 2) blocked.push({ startCm: ls, endCm: le });
    }
  }

  return blocked;
}

function ensureApplianceSpanReady(
  box: CabinetBox,
  wall: Wall,
  blockedZones: BlockedZone[],
  doorStyle: DoorStyle,
  defaultHoodKind: 'hidden' | 'chimney'
): { doorsAdded: number; syncedCount: number } {
  let doorsAdded = 0;
  let syncedCount = 0;

  if (box.type === 'base') {
    const usable = getBoxUsableFrontSpan(box, blockedZones);
    const boxApps = wall.appliances
      .filter((app) => {
        const parent = findParentBoxForAppliance(wall, app);
        return parent?.id === box.id;
      })
      .sort((a, b) => a.offsetX - b.offsetX);

    for (const app of boxApps) {
      if (app.kind !== 'sink' && app.kind !== 'gas') continue;

      // Clamp appliance cleanly inside usable box span outside blocked corners
      const minX = box.offsetX + usable.startCm;
      const maxX = Math.max(minX, box.offsetX + usable.endCm - app.width);
      const clampedX = Math.max(minX, Math.min(maxX, app.offsetX));
      if (Math.abs(clampedX - app.offsetX) > 0.5) {
        if (app.kind === 'gas') {
          clearHoodUnitForGas(wall, app.offsetX, app.offsetX + app.width, app.id);
        }
        app.offsetX = +clampedX.toFixed(1);
        syncedCount++;
      }
      app.boxId = box.id;

      const ls = Math.max(0, +(app.offsetX - box.offsetX).toFixed(1));
      const le = Math.min(box.width, +(ls + app.width).toFixed(1));
      const spanW = +(le - ls).toFixed(1);
      if (spanW < 30) continue;

      // Clear any stale interior dividers inside this appliance's footprint
      box.unitDividers = box.unitDividers.filter((u) => u <= ls + 1.5 || u >= le - 1.5);
      addUnitDividerIfInterior(box, ls);
      addUnitDividerIfInterior(box, le);

      const hasDoorsOverAppliance = box.doors.some(
        (d) => !(d.startCm + d.widthCm <= ls + 2 || d.startCm >= le - 2)
      );

      if (!hasDoorsOverAppliance) {
        if (app.kind === 'gas') {
          box.doors.push({
            id: uid('door'),
            startCm: ls,
            widthCm: spanW,
            kind: 'drawer',
            doorStyle,
            drawerRatios: [0.22, 0.54],
          });
          doorsAdded++;
        } else if (app.kind === 'sink') {
          doorsAdded += populateVerticalDoorsInSpan(box, ls, le, doorStyle);
        }
      }

      if (app.kind === 'gas') {
        if (!app.hoodKind) app.hoodKind = defaultHoodKind;
        clearHoodUnitForGas(wall, app.offsetX, app.offsetX + app.width, app.id);
        syncHoodUnitAboveGas(wall, app);
        syncedCount++;
      } else if (app.kind === 'sink') {
        const rackUpdated = ensureHorizontalDoorsAboveSink(wall, app.offsetX, app.width);
        if (rackUpdated > 0) syncedCount += rackUpdated;
      }
    }
  }

  return { doorsAdded, syncedCount };
}

function installMissingSmartHandles(
  box: CabinetBox,
  defaultStyle: HandleStyle
): number {
  if (box.type === 'fridge') return 0;
  const isWall = box.type === 'wall' || box.type === 'wall-deep';
  let added = 0;

  for (const door of box.doors) {
    if (door.kind === 'fridge' || door.kind === 'open' || door.kind === 'rail') continue;

    if (door.kind === 'drawer' || (door.kind === 'lift' && door.drawerRatios.length > 0)) {
      const rowCount = door.drawerRatios.length + 1;
      for (let r = 0; r < rowCount; r++) {
        const exists = box.handles.some((h) => h.doorId === door.id && (h.rowIndex ?? 0) === r);
        if (exists) continue;
        box.handles.push({
          id: uid('hnd'),
          doorId: door.id,
          rowIndex: r,
          xRatio: 0.5,
          yRatio: door.kind === 'lift' ? 0.78 : 0.5,
          orient: 'horizontal',
          style: defaultStyle,
          lengthCm: 16,
        });
        added++;
      }
      continue;
    }

    if (door.kind === 'lift') {
      const exists = box.handles.some((h) => h.doorId === door.id);
      if (exists) continue;
      box.handles.push({
        id: uid('hnd'),
        doorId: door.id,
        rowIndex: 0,
        xRatio: 0.5,
        yRatio: 0.86,
        orient: 'horizontal',
        style: defaultStyle,
        lengthCm: 16,
      });
      added++;
      continue;
    }

    const exists = box.handles.some((h) => h.doorId === door.id);
    if (exists) continue;
    const isPantry = door.hardwareKind === 'pantry-pullout';
    const xRatio = isPantry ? 0.5 : door.hingeSide === 'right' ? 0.14 : 0.86;
    const yRatio = isPantry ? 0.5 : isWall ? 0.82 : 0.18;
    box.handles.push({
      id: uid('hnd'),
      doorId: door.id,
      rowIndex: 0,
      xRatio,
      yRatio,
      orient: 'vertical',
      style: defaultStyle,
      lengthCm: 16,
    });
    added++;
  }

  return added;
}

/**
 * Automatically lays out balanced doors, drawers, dish-racks, chimney hoods,
 * unit dividers, and symmetrical handles across the entire kitchen while
 * preserving corner clearances and existing walls/openings/appliances.
 */
export function applySmartKitchenDesign(project: ProjectState): SmartDesignResult {
  const next: ProjectState = JSON.parse(JSON.stringify(project));
  if (!next.walls.length) {
    return {
      next,
      changed: false,
      changedBoxes: 0,
      placedDoors: 0,
      placedHandles: 0,
      syncedAppliances: 0,
      summary: 'ابتدا دیوار و کابینت‌ها را رسم کنید تا طراحی هوشمند اجرا شود',
    };
  }

  const totalBoxes = next.walls.reduce(
    (sum, w) => sum + w.boxes.filter((b) => b.type !== 'fridge').length,
    0
  );
  if (totalBoxes === 0) {
    return {
      next,
      changed: false,
      changedBoxes: 0,
      placedDoors: 0,
      placedHandles: 0,
      syncedAppliances: 0,
      summary: 'ابتدا باکس کابینت بکشید تا درب‌گذاری هوشمند انجام شود',
    };
  }

  const designStyle = next.designStyle || 'modern';
  const targetDoorStyle: DoorStyle = designStyle === 'neoclassic' ? 'cnc' : 'flat';
  const targetHandleStyle: HandleStyle = designStyle === 'neoclassic' ? 'knob' : 'simple';
  const defaultHoodKind = next.settings?.defaultHoodKind || 'chimney';

  let changedBoxes = 0;
  let placedDoors = 0;
  let placedHandles = 0;
  let syncedAppliances = 0;

  const columns = next.columns || [];

  for (const wall of next.walls) {
    const blockedZones = getCornerBlockedZonesForWall(wall, next.walls, next.cornerOwners);

    // 1) Optimize loose dishwasher/washing positions AND nudge gas/sink to eliminate dead <30cm slivers
    for (const box of wall.boxes) {
      if (box.type !== 'base') continue;
      const opt = optimizeBoxWithAppliances(wall, next.walls, box, next.cornerOwners);
      if (opt.ok) syncedAppliances++;

      // Nudge gas/sink by a few cm if an unusable <30cm sliver sits on either side
      const usableBox = getBoxUsableFrontSpan(box, blockedZones);
      const boxApps = wall.appliances
        .filter((a) => (a.kind === 'gas' || a.kind === 'sink') && findParentBoxForAppliance(wall, a)?.id === box.id)
        .sort((a, b) => a.offsetX - b.offsetX);
      for (const app of boxApps) {
        const minGlobal = +(box.offsetX + usableBox.startCm).toFixed(1);
        const maxGlobal = +(box.offsetX + usableBox.endCm - app.width).toFixed(1);
        const leftGap = +(app.offsetX - minGlobal).toFixed(1);
        const rightGap = +(maxGlobal - app.offsetX).toFixed(1);
        if (leftGap > 0.5 && leftGap < MIN_DOOR_CM && (maxGlobal - minGlobal === 0 || maxGlobal - minGlobal >= MIN_DOOR_CM)) {
          if (moveApplianceHierarchically(wall, next.walls, app.id, minGlobal, next.cornerOwners, { exact: true })) {
            syncedAppliances++;
          }
        } else if (rightGap > 0.5 && rightGap < MIN_DOOR_CM && (maxGlobal - minGlobal === 0 || maxGlobal - minGlobal >= MIN_DOOR_CM)) {
          if (moveApplianceHierarchically(wall, next.walls, app.id, maxGlobal, next.cornerOwners, { exact: true })) {
            syncedAppliances++;
          }
        }
      }
    }

    // 2) Ensure sink & gas spans, drawers under gas, chimney/hidden hood bays, and over-sink dish racks
    for (const box of wall.boxes) {
      if (box.type === 'fridge') continue;
      const prevDoors = box.doors.length;
      const res = ensureApplianceSpanReady(
        box,
        wall,
        blockedZones,
        targetDoorStyle,
        defaultHoodKind
      );
      placedDoors += res.doorsAdded;
      syncedAppliances += res.syncedCount;
      if (box.doors.length !== prevDoors || res.syncedCount > 0) changedBoxes++;
    }

    // 3) Fill remaining empty bays on base, tall, closet, and wall cabinets cleanly (excluding columns!)
    for (const box of wall.boxes) {
      if (box.type === 'fridge') continue;
      const prevDoorCount = box.doors.length;
      stripInvalidColumnAndCornerDividers(wall, box, blockedZones, columns);

      const blocked = collectBlockedIntervalsForBox(box, wall, blockedZones, columns);
      const freeSpans = subtractIntervals(0, box.width, blocked);

      for (const sp of freeSpans) {
        const w = +(sp.endCm - sp.startCm).toFixed(1);
        if (w < MIN_DOOR_CM - 0.1) continue;

        if (
          designStyle === 'modern' &&
          (box.type === 'wall' || box.type === 'wall-deep') &&
          !box.linkedToBoxId &&
          w >= MIN_LIFT_DOOR_CM - 0.1 &&
          w <= MAX_LIFT_DOOR_CM + 0.1
        ) {
          addUnitDividerIfInterior(box, sp.startCm);
          addUnitDividerIfInterior(box, sp.endCm);
          const wallRatios = getWallHorizontalDrawerRatios(box);
          box.doors.push({
            id: uid('door'),
            startCm: sp.startCm,
            widthCm: w,
            kind: 'lift',
            doorStyle: targetDoorStyle,
            hardwareKind: wallRatios.length > 0 ? 'lift-bifold' : 'hinged',
            drawerRatios: wallRatios,
          });
          placedDoors++;
        } else {
          if (sp.startCm > 2) addUnitDividerIfInterior(box, sp.startCm);
          if (sp.endCm < box.width - 2) addUnitDividerIfInterior(box, sp.endCm);
          placedDoors += populateVerticalDoorsInSpan(box, sp.startCm, sp.endCm, targetDoorStyle);
        }
      }

      // Pack & compact any leftover dead <30cm slivers across open bays
      compactDisconnectedDoorsInBox(box, blockedZones, wall, next.walls, next.cornerOwners);

      box.doors.sort((a, b) => a.startCm - b.startCm);
      box.unitDividers.sort((a, b) => a - b);

      // Ensure structural unit dividers separate drawers/lifts from adjacent hinged bays
      for (const d of box.doors) {
        if (d.kind === 'drawer' || d.kind === 'lift') {
          addUnitDividerIfInterior(box, d.startCm);
          addUnitDividerIfInterior(box, d.startCm + d.widthCm);
        }
      }

      // Cleanly unitize contiguous door bays for paired hinges & strip blocked-corner double dividers
      const unitizeRes = autoUnitizeBoxForHandles(box, blockedZones);
      stripInvalidColumnAndCornerDividers(wall, box, blockedZones, columns);

      // Enforce <=60cm horizontal lift leaf height on existing wall lift doors too
      if (box.type === 'wall' || box.type === 'wall-deep') {
        const expectedLiftRatios = getWallHorizontalDrawerRatios(box);
        for (const d of box.doors) {
          if (d.kind === 'lift' && expectedLiftRatios.length > 0 && d.drawerRatios.length === 0) {
            d.drawerRatios = [...expectedLiftRatios];
          }
        }
      }

      // Smart internal shelving for wall lift, wall hinged (1..3), and base non-sink hinged (1)
      const shelvesAdded = populateSmartShelvesForBox(box, wall, blockedZones);
      const handlesAdded = installMissingSmartHandles(box, targetHandleStyle);
      placedHandles += handlesAdded;

      if (
        box.doors.length !== prevDoorCount ||
        unitizeRes.addedDividers.length > 0 ||
        handlesAdded > 0 ||
        shelvesAdded > 0
      ) {
        changedBoxes++;
      }
    }
  }

  // Clear stale sub-selections in case door ids shifted
  next.doorsLocked = false;
  next.doorsHidden = false;
  next.selectedDoorId = null;
  next.selectedHandleId = null;
  next.selectedUnit = null;

  const firstWall = next.walls.find((w) => w.boxes.some((b) => b.type !== 'fridge')) || next.walls[0];
  const firstBox = firstWall?.boxes.find((b) => b.type !== 'fridge') || firstWall?.boxes[0];
  const changed = changedBoxes > 0 || placedDoors > 0 || placedHandles > 0 || syncedAppliances > 0;

  const summary =
    placedDoors > 0 || placedHandles > 0
      ? `طراحی هوشمند انجام شد: ${placedDoors} درب/کشو و ${placedHandles} دستگیره چیده و گاز/سینک تنظیم شد`
      : 'چیدمان هوشمند کابینت‌ها، گاز/هود و دستگیره‌ها به‌روزرسانی شد';

  return {
    next,
    changed,
    firstWallId: firstWall?.id,
    firstBoxId: firstBox?.id,
    changedBoxes,
    placedDoors,
    placedHandles,
    syncedAppliances,
    summary,
  };
}
