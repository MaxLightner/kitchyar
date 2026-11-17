import { APRON_SINK_DEPTH_CM } from './constants';
import { applyHandlesToBoxDoors, getBoxFrameInsets, getUnitsInBox, uid } from './doorRules';
import {
  BlockedZone,
  CabinetBox,
  DoorUnit,
  HandleStyle,
  Orientation,
  Wall,
} from './types';

export interface DoorHandleSpotSpec {
  spotId: string;
  boxId: string;
  doorId: string;
  rowIndex: number;
  xRatio: number;
  yRatio: number;
  /** Normalized offset inside the physical panel leaf [0..1] top-down. */
  leafYRatio: number;
}

export function computeApronExtraTopCm(
  box: CabinetBox,
  door: DoorUnit,
  wall?: Wall | null
): number {
  if (!wall || box.type !== 'base') return 0;
  const hasApron = wall.appliances.some((a) => {
    if (a.kind !== 'sink' || a.sinkModel !== 'ceramic-apron') return false;
    const ls = a.offsetX - box.offsetX;
    const le = ls + a.width;
    const mid = door.startCm + door.widthCm / 2;
    return mid >= ls - 1 && mid <= le + 1;
  });
  return hasApron ? Math.max(0, APRON_SINK_DEPTH_CM - box.countertopCm) : 0;
}

/**
 * Checks whether a bay containing `door` has properly defined carcass units
 * before allowing manual handle placement.
 */
export function canPlaceHandleInBay(
  box: CabinetBox,
  door: DoorUnit,
  blockedZones: BlockedZone[] = []
): { ok: boolean; reason?: string } {
  if (door.kind === 'fridge' || door.kind === 'open' || door.kind === 'rail') {
    return { ok: false, reason: 'روی این بخش دستگیره قرار نمی‌گیرد' };
  }
  if (door.kind === 'drawer' || door.kind === 'lift' || door.hardwareKind === 'pantry-pullout') {
    return { ok: true };
  }
  const units = getUnitsInBox(box, blockedZones);
  const doorMid = door.startCm + door.widthCm / 2;
  const owner = units.find((u) => doorMid >= u.startCm - 0.5 && doorMid <= u.endCm + 0.5);
  if (!owner) {
    return { ok: false, reason: 'اول یونیت رو مشخص کن' };
  }
  const pantryCount = owner.doors.filter(
    (d) => d.kind === 'door' && d.hardwareKind === 'pantry-pullout'
  ).length;
  const isThreeDoorPantryUnit =
    pantryCount === 1 && owner.hingedCount === 3 && owner.widthCm <= 145;
  if (!isThreeDoorPantryUnit && (owner.hingedCount >= 3 || (owner.hingedCount >= 1 && owner.widthCm > 125))) {
    return { ok: false, reason: 'اول یونیت رو مشخص کن' };
  }
  return { ok: true };
}

/**
 * Computes candidate handle attachment spots on a single DoorUnit, shared identically
 * between 2D FrontCanvas and 3D / AR door overlays.
 */
export function computeDoorHandleSpots(
  box: CabinetBox,
  door: DoorUnit,
  handleOrient: Orientation
): DoorHandleSpotSpec[] {
  if (door.kind === 'fridge' || door.kind === 'open' || door.kind === 'rail') return [];
  const spots: DoorHandleSpotSpec[] = [];

  if (door.kind === 'drawer' || (door.kind === 'lift' && door.drawerRatios.length > 0)) {
    const pts = [0, ...door.drawerRatios, 1];
    for (let r = 0; r < pts.length - 1; r++) {
      const rowPts =
        handleOrient === 'horizontal'
          ? [
              { xr: 0.18, yr: 0.5 },
              { xr: 0.5, yr: 0.5 },
              { xr: 0.82, yr: 0.5 },
              { xr: 0.5, yr: 0.22 },
            ]
          : [
              { xr: 0.14, yr: 0.5 },
              { xr: 0.86, yr: 0.5 },
            ];
      rowPts.forEach((sp, i) => {
        spots.push({
          spotId: `${door.id}_r${r}_${i}`,
          boxId: box.id,
          doorId: door.id,
          rowIndex: r,
          xRatio: sp.xr,
          yRatio: sp.yr,
          leafYRatio: sp.yr,
        });
      });
    }
    return spots;
  }

  if (door.kind === 'lift') {
    const liftPts =
      handleOrient === 'horizontal'
        ? [
            { xr: 0.18, yr: 0.86 },
            { xr: 0.5, yr: 0.86 },
            { xr: 0.82, yr: 0.86 },
          ]
        : [
            { xr: 0.14, yr: 0.5 },
            { xr: 0.86, yr: 0.5 },
          ];
    liftPts.forEach((sp, i) => {
      spots.push({
        spotId: `${door.id}_r0_${i}`,
        boxId: box.id,
        doorId: door.id,
        rowIndex: 0,
        xRatio: sp.xr,
        yRatio: sp.yr,
        leafYRatio: sp.yr,
      });
    });
    return spots;
  }

  const doorPts =
    handleOrient === 'vertical'
      ? [
          { xr: 0.14, yr: 0.18 },
          { xr: 0.14, yr: 0.5 },
          { xr: 0.14, yr: 0.82 },
          { xr: 0.86, yr: 0.18 },
          { xr: 0.86, yr: 0.5 },
          { xr: 0.86, yr: 0.82 },
        ]
      : [
          { xr: 0.18, yr: 0.14 },
          { xr: 0.5, yr: 0.14 },
          { xr: 0.82, yr: 0.14 },
          { xr: 0.18, yr: 0.86 },
          { xr: 0.5, yr: 0.86 },
          { xr: 0.82, yr: 0.86 },
        ];
  doorPts.forEach((sp, i) => {
    spots.push({
      spotId: `${door.id}_r0_${i}`,
      boxId: box.id,
      doorId: door.id,
      rowIndex: 0,
      xRatio: sp.xr,
      yRatio: sp.yr,
      leafYRatio: sp.yr,
    });
  });

  return spots;
}

/**
 * Installs or replaces a handle on a specific candidate spot after verifying the unit boundary
 * exists ('اول یونیت رو مشخص کن' if multi-door bay has no unit dividers), syncing `hingeSide`.
 */
export function applyHandleAtSpot(
  box: CabinetBox,
  doorId: string,
  rowIndex: number,
  xRatio: number,
  yRatio: number,
  style: HandleStyle,
  orient: Orientation,
  blockedZones: BlockedZone[] = []
): { ok: boolean; handleId?: string; reason?: string } {
  const door = box.doors.find((d) => d.id === doorId);
  if (!door || door.kind === 'fridge' || door.kind === 'open' || door.kind === 'rail') {
    return { ok: false };
  }

  const check = canPlaceHandleInBay(box, door, blockedZones);
  if (!check.ok) {
    return { ok: false, reason: check.reason || 'اول یونیت رو مشخص کن' };
  }

  if (door.kind === 'door' && door.hardwareKind !== 'pantry-pullout') {
    if (xRatio >= 0.65) door.hingeSide = 'left';
    else if (xRatio <= 0.35) door.hingeSide = 'right';
  }

  box.handles = box.handles.filter(
    (h) => !(h.doorId === doorId && (h.rowIndex ?? 0) === rowIndex)
  );
  const handleId = uid('hnd');
  box.handles.push({
    id: handleId,
    doorId,
    rowIndex,
    xRatio,
    yRatio,
    orient,
    style,
    lengthCm: 16,
  });
  return { ok: true, handleId };
}

/**
 * Automatically installs ergonomic opposite/paired handles for all doors within `[unitStartCm..unitEndCm]`
 * when the user defines a unit boundary and wants matching hinges & handles auto-configured.
 */
export function autoPlaceHandlesForUnit(
  box: CabinetBox,
  unitStartCm: number,
  unitEndCm: number,
  style: HandleStyle,
  orient: Orientation,
  blockedZones: BlockedZone[] = []
): number {
  const unitDoors = box.doors
    .filter((d) => {
      if (d.kind === 'fridge' || d.kind === 'open' || d.kind === 'rail') return false;
      const mid = d.startCm + d.widthCm / 2;
      return mid >= unitStartCm - 0.5 && mid <= unitEndCm + 0.5;
    })
    .sort((a, b) => a.startCm - b.startCm);

  if (!unitDoors.length) return 0;

  const hinged = unitDoors.filter((d) => d.kind === 'door' && d.hardwareKind !== 'pantry-pullout');
  if (hinged.length === 2) {
    hinged[0].hingeSide = 'left';
    hinged[1].hingeSide = 'right';
  } else if (hinged.length === 1 && !hinged[0].hingeSide) {
    hinged[0].hingeSide = hinged[0].startCm + hinged[0].widthCm / 2 > box.width / 2 ? 'right' : 'left';
  }

  return applyHandlesToBoxDoors(
    box,
    unitDoors.map((d) => d.id),
    style,
    orient,
    undefined,
    blockedZones
  );
}

export function computeEffectiveBoxDoorMetricsCm(box: CabinetBox, wall?: Wall | null) {
  const insets = getBoxFrameInsets(box);
  let effectiveRight = insets.right;
  if (wall) {
    // Frame insets already account for box.frames; callers keep wall consistent
    void wall;
  }
  const scaleX = Math.max(0.2, (box.width - insets.left - effectiveRight) / Math.max(1, box.width));
  return { insets, scaleX };
}
