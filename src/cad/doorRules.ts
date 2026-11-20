import { defaultHandleLengthCm } from './handleGeometry';
import {
  APPLIANCE_CONFIGS,
  BOX_PRESETS,
  CARCASS_STILE_CM,
  CORNER_FILLER_CM,
  DEFAULT_DOOR_CM,
  DRAWER_MAX_CM,
  DRAWER_MIN_CM,
  DRAWER_PATTERNS,
  FRAME_WIDTH_OPTIONS,
  FRIDGE_FRAME_CM,
  FRIDGE_MODELS,
  LIFT_PATTERNS,
  MAX_DOOR_CM,
  MAX_LIFT_DOOR_CM,
  MAX_LIFT_LEAF_HEIGHT_CM,
  MIN_DOOR_CM,
  MIN_DYNAMIC_DOOR_CM,
  MIN_LIFT_DOOR_CM,
  MIN_PANTRY_CM,
  MIN_SHELF_GAP_CM,
  SINK_MODELS,
  WALL_DOUBLE_LOWER_H_CM,
  WALL_LOWER_ELEV_CM,
  WASHING_CAPACITIES,
} from './constants';
import {
  analyzeCornerJunction,
  detectCornerJunctions,
  getBoxTier,
  getCornerBlockedZonesForWall,
  getWallVectors,
  isBoxIntervalBlocked,
} from './cornerLogic';
import { findCollidingOpening, getWallColumnSpans } from './openingRules';
import {
  ApplianceItem,
  ApplianceKind,
  BlockedZone,
  BoxFrameItem,
  BoxKind,
  CabinetBox,
  DoorKind,
  DoorStyle,
  DoorUnit,
  EquipmentFinish,
  FrameSide,
  FridgeModel,
  HandleStyle,
  HardwareKind,
  HoodModel,
  Orientation,
  ProjectSettings,
  RoomColumn,
  SinkModel,
  Wall,
  WashingCapacityKg,
} from './types';

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createWall(
  name: string,
  x1Cm: number,
  y1Cm: number,
  x2Cm: number,
  y2Cm: number,
  flipSide: 1 | -1 = 1,
  wallHeightCm = 265
): Wall {
  const dx = x2Cm - x1Cm;
  const dy = y2Cm - y1Cm;
  const length = Math.max(40, Math.round(Math.hypot(dx, dy)));
  const angle = +(Math.atan2(dy, dx) * (180 / Math.PI)).toFixed(2);
  return {
    id: uid('wall'),
    name,
    x1Cm,
    y1Cm,
    x2Cm,
    y2Cm,
    length,
    height: wallHeightCm,
    angle,
    flipSide,
    boxes: [],
    appliances: [],
    openings: [],
  };
}

export function createEmptyBox(
  kind: BoxKind,
  offsetX: number,
  width: number,
  opts?: {
    twoDepthWallLower?: boolean;
    hasFridgeFrame?: boolean;
    fridgeModel?: FridgeModel;
    settings?: ProjectSettings;
  }
): CabinetBox {
  const p = BOX_PRESETS[kind] || BOX_PRESETS.base;
  const st = opts?.settings;
  let height = p.height;
  let depth = p.depth;
  let elevY = p.elevY;
  let plinth = p.plinth;
  let countertopCm = p.countertopCm;

  const hasFrame = kind === 'fridge' ? (opts?.hasFridgeFrame ?? true) : false;

  if (kind === 'base' && st) {
    height = st.baseHeightCm;
    plinth = st.plinthCm;
    countertopCm = st.countertopCm;
  } else if (kind === 'wall') {
    if (opts?.twoDepthWallLower) height = WALL_DOUBLE_LOWER_H_CM;
    else if (st) height = st.wallCabHeightCm;
    if (st) elevY = st.wallCabElevCm;
  } else if (kind === 'fridge') {
    const fm = FRIDGE_MODELS[opts?.fridgeModel || 'fridge-sbs-homebar'];
    height = fm.height + (hasFrame ? FRIDGE_FRAME_CM : 0);
    depth = fm.depth;
  }

  const w = Math.max(30, Math.round(width));
  const doors: DoorUnit[] =
    kind === 'fridge'
      ? [{ id: uid('door'), startCm: 0, widthCm: w, kind: 'fridge', drawerRatios: [] }]
      : [];

  const frames: BoxFrameItem[] =
    kind === 'fridge' && hasFrame
      ? [
          { id: uid('fr'), side: 'left', widthCm: FRIDGE_FRAME_CM },
          { id: uid('fr'), side: 'right', widthCm: FRIDGE_FRAME_CM },
          { id: uid('fr'), side: 'top', widthCm: FRIDGE_FRAME_CM },
        ]
      : [];

  return {
    id: uid('box'),
    name: kind === 'fridge' ? `یخچال ${FRIDGE_MODELS[opts?.fridgeModel || 'fridge-sbs-homebar'].shortLabel}` : p.name,
    type: kind,
    offsetX: Math.round(offsetX),
    elevY,
    width: w,
    height,
    depth,
    plinth,
    countertopCm,
    hasFridgeFrame: hasFrame,
    fridgeModel: kind === 'fridge' ? (opts?.fridgeModel || 'fridge-sbs-homebar') : undefined,
    doors,
    unitDividers: [],
    shelves: [],
    handles: [],
    frames,
  };
}

/**
 * Returns contiguous unobstructed [startCm, endCm] intervals inside a box (in box-local coordinates)
 * after subtracting existing doors AND any blocked corner zones.
 */
export function getFreeSpansInBox(
  box: CabinetBox,
  blockedZones: BlockedZone[]
): Array<{ startCm: number; endCm: number }> {
  const occupied: Array<[number, number]> = box.doors.map((d) => [
    d.startCm,
    d.startCm + d.widthCm,
  ]);

  // Also treat blocked corner intervals as occupied so doors cannot be placed inside them!
  const boxTier =
    box.type === 'wall'
      ? 'wall-lower'
      : box.type === 'wall-deep'
      ? 'wall-upper'
      : 'lower';

  for (const z of blockedZones) {
    const tierMatches =
      z.tier === boxTier ||
      ((box.type === 'tall' || box.type === 'closet') && z.tier === 'lower');
    if (!tierMatches) continue;
    const localStart = Math.max(0, z.startCm - box.offsetX);
    const localEnd = Math.min(box.width, z.endCm - box.offsetX);
    if (localEnd - localStart > 1) {
      occupied.push([localStart, localEnd]);
    }
  }

  occupied.sort((a, b) => a[0] - b[0]);

  const merged: Array<[number, number]> = [];
  for (const seg of occupied) {
    if (!merged.length || seg[0] > merged[merged.length - 1][1] + 0.1) {
      merged.push([...seg]);
    } else {
      merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], seg[1]);
    }
  }

  const free: Array<{ startCm: number; endCm: number }> = [];
  let cursor = 0;
  for (const [s, e] of merged) {
    if (s - cursor >= MIN_DOOR_CM - 0.1) {
      free.push({ startCm: +cursor.toFixed(1), endCm: +s.toFixed(1) });
    }
    cursor = Math.max(cursor, e);
  }
  if (box.width - cursor >= MIN_DOOR_CM - 0.1) {
    free.push({ startCm: +cursor.toFixed(1), endCm: +box.width.toFixed(1) });
  }
  return free;
}

/**
 * Returns the usable unobstructed visible front interval `[startCm, endCm]` inside a box
 * after subtracting corner blind zones / side-profile blocks from left/right ends.
 */
export function getBoxUsableFrontSpan(
  box: CabinetBox,
  blockedZones: BlockedZone[] = []
): { startCm: number; endCm: number } {
  const boxTier =
    box.type === 'wall'
      ? 'wall-lower'
      : box.type === 'wall-deep'
      ? 'wall-upper'
      : 'lower';

  let startCm = 0;
  let endCm = box.width;

  for (const z of blockedZones) {
    const tierMatches =
      z.tier === boxTier ||
      ((box.type === 'tall' || box.type === 'closet') && z.tier === 'lower');
    if (!tierMatches) continue;
    const ls = Math.max(0, +(z.startCm - box.offsetX).toFixed(1));
    const le = Math.min(box.width, +(z.endCm - box.offsetX).toFixed(1));
    if (le - ls <= 1) continue;
    if (ls <= startCm + 2) {
      startCm = Math.max(startCm, le);
    } else if (le >= endCm - 2) {
      endCm = Math.min(endCm, ls);
    }
  }

  if (endCm < startCm) return { startCm: 0, endCm: box.width };
  return { startCm: +startCm.toFixed(1), endCm: +endCm.toFixed(1) };
}

/**
 * Upper wall cabinet horizontal ('lift') door rule:
 * - No horizontal lift leaf may exceed 60cm (`MAX_LIFT_LEAF_HEIGHT_CM`) in height
 * - When box height <= 60cm (e.g. 45cm wall-deep or over-fridge), returns 1 horizontal door (`[]`)
 * - When box height is 61..120cm (e.g. 70-90cm wall cabinet), splits vertically into 2 leaves (`[0.5]`)
 * - When box height > 120cm, splits vertically into 3 leaves (`[0.333, 0.667]`)
 */
export function getWallHorizontalDrawerRatios(box: CabinetBox): number[] {
  if (box.linkedToBoxId && box.height <= MAX_LIFT_LEAF_HEIGHT_CM) return [];
  if (box.height <= MAX_LIFT_LEAF_HEIGHT_CM) return [];
  if (box.height > MAX_LIFT_LEAF_HEIGHT_CM * 2) return [0.333, 0.667];
  return [0.5];
}

export interface DoorPreviewResult {
  ok: boolean;
  reason?: string;
  replaceSpan?: { startCm: number; endCm: number };
  items: Array<{
    startCm: number;
    widthCm: number;
    kind: DoorKind;
    drawerRatios: number[];
    drawerBand?: { position: 'top' | 'bottom'; ratio: number };
  }>;
}

export function getMaxVerticalDoorCount(spanWidthCm: number): number {
  return Math.max(1, Math.floor((Math.max(0, spanWidthCm) + 0.05) / MIN_DYNAMIC_DOOR_CM));
}

export function isDividerNearBlockedCorner(
  box: CabinetBox,
  seamCm: number,
  blockedZones: BlockedZone[] = []
): boolean {
  const boxTier =
    box.type === 'wall'
      ? 'wall-lower'
      : box.type === 'wall-deep'
      ? 'wall-upper'
      : 'lower';
  for (const z of blockedZones) {
    const tierMatches =
      z.tier === boxTier ||
      ((box.type === 'tall' || box.type === 'closet') && z.tier === 'lower');
    if (!tierMatches) continue;
    const ls = +(z.startCm - box.offsetX).toFixed(1);
    const le = +(z.endCm - box.offsetX).toFixed(1);
    if (le <= 0.5 || ls >= box.width - 0.5) continue;
    // Strip double/closing unit dividers sitting on an inside-corner blind edge or inside a blind corner
    if (seamCm >= ls - 2 && seamCm <= le + 2) return true;
  }
  return false;
}

export function stripInvalidColumnAndCornerDividers(
  wall: Wall | null | undefined,
  box: CabinetBox,
  blockedZones: BlockedZone[] = [],
  columns: RoomColumn[] = []
): void {
  const colSpans = wall ? getWallColumnSpans(wall, columns) : [];
  box.unitDividers = box.unitDividers.filter((u) => {
    if (u <= 2 || u >= box.width - 2) return false;
    if (isDividerNearBlockedCorner(box, u, blockedZones)) return false;
    for (const cs of colSpans) {
      const topOverlap = box.elevY < cs.elevY + cs.height - 1 && box.elevY + box.height > cs.elevY + 1;
      if (!topOverlap) continue;
      const ls = cs.startCm - box.offsetX;
      const le = cs.endCm - box.offsetX;
      if (u >= ls - 1.5 && u <= le + 1.5) return false;
    }
    return true;
  });
  if (box.frames?.length && wall && colSpans.length > 0) {
    box.frames = box.frames.filter((f) => {
      if (f.side !== 'seam' || f.seamCm === undefined) return true;
      for (const cs of colSpans) {
        const ls = cs.startCm - box.offsetX;
        const le = cs.endCm - box.offsetX;
        if (f.seamCm >= ls - 1.5 && f.seamCm <= le + 1.5) return false;
      }
      return true;
    });
  }
}

export function isDoorAdjacentToInsideCorner(
  box: CabinetBox,
  door: DoorUnit,
  blockedZones: BlockedZone[] = []
): boolean {
  if (door.hardwareKind === 'corner') return true;
  const boxTier =
    box.type === 'wall'
      ? 'wall-lower'
      : box.type === 'wall-deep'
      ? 'wall-upper'
      : 'lower';
  for (const z of blockedZones) {
    const tierMatches =
      z.tier === boxTier ||
      ((box.type === 'tall' || box.type === 'closet') && z.tier === 'lower');
    if (!tierMatches) continue;
    const ls = +(z.startCm - box.offsetX).toFixed(1);
    const le = +(z.endCm - box.offsetX).toFixed(1);
    const doorEnd = +(door.startCm + door.widthCm).toFixed(1);
    if (Math.abs(door.startCm - le) <= CORNER_FILLER_CM + 2.5) return true;
    if (Math.abs(doorEnd - ls) <= CORNER_FILLER_CM + 2.5) return true;
  }
  return false;
}

export function canDoorOpenIn3D(
  box: CabinetBox,
  door: DoorUnit,
  rowIndex?: number
): boolean {
  if (door.kind === 'fridge') return true;
  if (door.kind === 'open' || door.kind === 'rail') return false;
  if (door.hardwareKind === 'push-to-open' || door.hardwareKind === 'lift-bifold' || door.hardwareKind === 'pantry-pullout') return true;
  return box.handles.some((h) => {
    if (h.doorId !== door.id) return false;
    if (h.style === 'handleless') return true;
    if (rowIndex !== undefined && (door.kind === 'drawer' || door.kind === 'lift')) {
      return (h.rowIndex ?? 0) === rowIndex;
    }
    return true;
  });
}

export function computeCabinetSweepRange(
  startXCm: number,
  currXCm: number,
  wallLengthCm: number,
  minWidthCm: number = 30
): { offsetX: number; width: number } {
  const safeWallLen = Math.max(minWidthCm, wallLengthCm);
  const s = Math.max(0, Math.min(safeWallLen, Math.round(startXCm / 5) * 5));
  const c = Math.max(0, Math.min(safeWallLen, Math.round(currXCm / 5) * 5));
  let offsetX = Math.min(s, c);
  let endX = Math.max(s, c);
  if (endX - offsetX < minWidthCm) {
    if (c >= s) {
      endX = Math.min(safeWallLen, offsetX + minWidthCm);
      if (endX - offsetX < minWidthCm) {
        offsetX = Math.max(0, endX - minWidthCm);
      }
    } else {
      offsetX = Math.max(0, endX - minWidthCm);
      if (endX - offsetX < minWidthCm) {
        endX = Math.min(safeWallLen, offsetX + minWidthCm);
      }
    }
  }
  return {
    offsetX: +offsetX.toFixed(1),
    width: +(endX - offsetX).toFixed(1),
  };
}

export interface CabinetUnitInfo {
  startCm: number;
  endCm: number;
  widthCm: number;
  doors: DoorUnit[];
  hasDrawer: boolean;
  hasLift: boolean;
  hingedCount: number;
  canHaveShelves: boolean;
  blockedReason?: string;
}

/**
 * Returns contiguous architectural units inside a box separated by `unitDividers` and corner blind zones.
 * Shelves belong to units (not individual doors). Drawers cannot have internal shelves;
 * multi-door bays (>2 hinged doors or >125cm) require defining unit dividers first.
 */
export function getUnitsInBox(
  box: CabinetBox,
  blockedZones: BlockedZone[]
): CabinetUnitInfo[] {
  const boxTier =
    box.type === 'wall'
      ? 'wall-lower'
      : box.type === 'wall-deep'
      ? 'wall-upper'
      : 'lower';

  const pts = new Set<number>([0, +box.width.toFixed(1)]);
  for (const u of box.unitDividers) {
    if (u > 2 && u < box.width - 2) pts.add(+u.toFixed(1));
  }
  for (const z of blockedZones) {
    const tierMatches =
      z.tier === boxTier ||
      ((box.type === 'tall' || box.type === 'closet') && z.tier === 'lower');
    if (!tierMatches) continue;
    const ls = +(z.startCm - box.offsetX).toFixed(1);
    const le = +(z.endCm - box.offsetX).toFixed(1);
    if (ls > 2 && ls < box.width - 2) pts.add(ls);
    if (le > 2 && le < box.width - 2) pts.add(le);
  }

  const sortedPts = Array.from(pts).sort((a, b) => a - b);
  const deduped: number[] = [];
  for (const p of sortedPts) {
    if (!deduped.length || p - deduped[deduped.length - 1] > 2) {
      deduped.push(p);
    }
  }

  const units: CabinetUnitInfo[] = [];
  for (let i = 0; i < deduped.length - 1; i++) {
    const uStart = deduped[i];
    const uEnd = deduped[i + 1];
    const uWidth = +(uEnd - uStart).toFixed(1);
    if (uWidth < 15) continue;
    if (isBoxIntervalBlocked(box, uStart + 1, uEnd - 1, blockedZones)) continue;

    const unitDoors = box.doors
      .filter((d) => {
        const mid = d.startCm + d.widthCm / 2;
        return mid >= uStart - 0.5 && mid <= uEnd + 0.5;
      })
      .sort((a, b) => a.startCm - b.startCm);

    const hasDrawer = unitDoors.some((d) => d.kind === 'drawer');
    const hasLift = unitDoors.some((d) => d.kind === 'lift');
    const hingedCount = unitDoors.filter((d) => d.kind === 'door').length;
    const pantryCount = unitDoors.filter(
      (d) => d.kind === 'door' && d.hardwareKind === 'pantry-pullout'
    ).length;
    const regularHingedCount = hingedCount - pantryCount;
    const isThreeDoorPantryUnit =
      pantryCount === 1 && regularHingedCount === 2 && uWidth <= 145;

    let canHaveShelves = true;
    let blockedReason: string | undefined;

    if (box.type === 'fridge') {
      canHaveShelves = false;
      blockedReason = 'یخچال طبقه داخلی ندارد';
    } else if (hasDrawer) {
      canHaveShelves = false;
      blockedReason = 'کشو تقسیم‌بندی داخلی (طبقه) نمی‌گیرد';
    } else if (!isThreeDoorPantryUnit && (hingedCount >= 3 || (hingedCount >= 1 && uWidth > 125))) {
      canHaveShelves = false;
      blockedReason = 'ابتدا با ابزار یونیت روی درز بین درب‌ها کلیک کنید تا مرز یونیت مشخص شود (حداکثر ۲ درب در هر یونیت)';
    }

    units.push({
      startCm: uStart,
      endCm: uEnd,
      widthCm: uWidth,
      doors: unitDoors,
      hasDrawer,
      hasLift,
      hingedCount,
      canHaveShelves,
      blockedReason,
    });
  }

  return units;
}

function getBaySpanContainingCursor(
  box: CabinetBox,
  cursorCmInBox: number,
  blockedZones: BlockedZone[]
): { bayStart: number; bayEnd: number } {
  const boxTier =
    box.type === 'wall'
      ? 'wall-lower'
      : box.type === 'wall-deep'
      ? 'wall-upper'
      : 'lower';

  const bounds = [0, box.width, ...box.unitDividers];
  // Drawers and lift units always act as rigid boundaries for hinged door runs
  for (const d of box.doors) {
    if (d.kind === 'drawer' || d.kind === 'lift') {
      bounds.push(d.startCm, d.startCm + d.widthCm);
    }
  }
  for (const z of blockedZones) {
    const tierMatches =
      z.tier === boxTier ||
      ((box.type === 'tall' || box.type === 'closet') && z.tier === 'lower');
    if (!tierMatches) continue;
    const ls = z.startCm - box.offsetX;
    const le = z.endCm - box.offsetX;
    if (ls > 0 && ls < box.width) bounds.push(ls);
    if (le > 0 && le < box.width) bounds.push(le);
  }
  const sorted = Array.from(new Set(bounds.map((v) => +v.toFixed(1)))).sort((a, b) => a - b);
  for (let i = 0; i < sorted.length - 1; i++) {
    if (cursorCmInBox >= sorted[i] - 0.5 && cursorCmInBox <= sorted[i + 1] + 0.5) {
      return { bayStart: sorted[i], bayEnd: sorted[i + 1] };
    }
  }
  return { bayStart: 0, bayEnd: box.width };
}

function isStructuralDivider(box: CabinetBox, seamCm: number): boolean {
  return box.doors.some(
    (d) =>
      (d.kind === 'drawer' || d.kind === 'lift') &&
      (Math.abs(d.startCm - seamCm) <= 1.8 || Math.abs(d.startCm + d.widthCm - seamCm) <= 1.8)
  );
}

/**
 * Re-partitions a continuous span `[spanStart, spanEnd]` inside `box` into contiguous hinged doors
 * strictly within `[MIN_DOOR_CM..MAX_DOOR_CM]` (30..60cm), leaving zero dead `<30cm` slivers.
 */
export function equalizeSpanDoors(
  box: CabinetBox,
  spanStart: number,
  spanEnd: number,
  opts?: { preferredDoorWidthCm?: number }
): DoorUnit[] {
  const s = +Math.max(0, spanStart).toFixed(1);
  const e = +Math.min(box.width, spanEnd).toFixed(1);
  const spanW = +(e - s).toFixed(1);
  if (spanW < MIN_DOOR_CM - 0.1) return [];

  const inside = box.doors
    .filter((d) => {
      const mid = d.startCm + d.widthCm / 2;
      return mid >= s - 0.5 && mid <= e + 0.5 && d.kind === 'door';
    })
    .sort((a, b) => a.startCm - b.startCm);

  const removedIds = new Set(inside.map((d) => d.id));
  box.doors = box.doors.filter((d) => !removedIds.has(d.id));
  box.handles = box.handles.filter((h) => !removedIds.has(h.doorId));
  // Strip any stale interior non-structural dividers inside (s..e)
  box.unitDividers = box.unitDividers.filter(
    (u) => u <= s + 1.5 || u >= e - 1.5 || isStructuralDivider(box, u)
  );

  const minN = Math.max(1, Math.ceil((spanW - 0.1) / MAX_DOOR_CM));
  const maxN = Math.max(minN, Math.floor((spanW + 0.1) / MIN_DOOR_CM));
  let n = Math.max(
    minN,
    Math.min(maxN, inside.length || Math.round(spanW / (opts?.preferredDoorWidthCm ?? 45)))
  );
  if (spanW / n < MIN_DOOR_CM - 0.05 || spanW / n > MAX_DOOR_CM + 0.05) {
    let bestN = minN;
    let bestScore = Infinity;
    for (let cand = minN; cand <= maxN; cand++) {
      const w = spanW / cand;
      if (w >= MIN_DOOR_CM - 0.05 && w <= MAX_DOOR_CM + 0.05) {
        const dist = inside.length > 0 ? Math.abs(cand - inside.length) : Math.abs(w - 45) / 10;
        if (dist < bestScore) {
          bestScore = dist;
          bestN = cand;
        }
      }
    }
    n = bestN;
  }

  const eachW = +(spanW / n).toFixed(1);
  const created: DoorUnit[] = [];
  let cur = s;
  for (let i = 0; i < n; i++) {
    const w = i === n - 1 ? +(e - cur).toFixed(1) : eachW;
    const prevDoor = inside[i];
    const d: DoorUnit = {
      id: prevDoor?.id ?? uid('door'),
      startCm: +cur.toFixed(1),
      widthCm: w,
      kind: 'door',
      drawerRatios: [],
      ...(prevDoor?.doorStyle ? { doorStyle: prevDoor.doorStyle } : {}),
    };
    created.push(d);
    cur += w;
  }
  box.doors.push(...created);
  box.doors.sort((a, b) => a.startCm - b.startCm);
  return created;
}

function computeShrinkInsertPreview(
  bayStart: number,
  bayEnd: number,
  bayDoors: DoorUnit[],
  cursorCmInBox: number,
  clickedDoor: DoorUnit | undefined
): DoorPreviewResult {
  const bayWidth = +(bayEnd - bayStart).toFixed(1);
  const newCount = bayDoors.length + 1;
  if (newCount * MIN_DOOR_CM > bayWidth + 0.2) {
    return {
      ok: false,
      reason: 'حداقل عرض هر درب ۳۰cm است؛ امکان افزودن درب جدید نیست',
      items: [],
    };
  }

  // Keep existing order and steal deficit down to 30cm starting from the clicked/nearest door
  const widths = bayDoors.map((d) => d.widthCm);
  const existingSum = widths.reduce((a, b) => a + b, 0);
  const freeGap = Math.max(0, +(bayWidth - existingSum).toFixed(1));
  const closeFullBay = freeGap < MIN_DOOR_CM;
  const newDoorW = closeFullBay && existingSum + MIN_DOOR_CM < bayWidth
    ? Math.min(MAX_DOOR_CM, +(bayWidth - existingSum).toFixed(1))
    : MIN_DOOR_CM;
  const deficit = Math.max(0, +(newDoorW - freeGap).toFixed(1));

  let anchorIdx = clickedDoor ? bayDoors.indexOf(clickedDoor) : -1;
  if (anchorIdx === -1) {
    let bestDist = Infinity;
    bayDoors.forEach((d, idx) => {
      const dist = Math.abs(cursorCmInBox - (d.startCm + d.widthCm / 2));
      if (dist < bestDist) {
        bestDist = dist;
        anchorIdx = idx;
      }
    });
  }
  if (anchorIdx < 0) anchorIdx = 0;

  let rem = deficit;
  const order = widths
    .map((_, idx) => idx)
    .sort((a, b) => Math.abs(a - anchorIdx) - Math.abs(b - anchorIdx));
  for (const idx of order) {
    if (rem <= 0.05) break;
    const avail = Math.max(0, +(widths[idx] - MIN_DOOR_CM).toFixed(1));
    const take = Math.min(rem, avail);
    widths[idx] = +(widths[idx] - take).toFixed(1);
    rem = +(rem - take).toFixed(1);
  }

  // Insert new door at anchor position (or in the gap side)
  const insertAt = clickedDoor
    ? anchorIdx + 1
    : cursorCmInBox < bayDoors[0].startCm
    ? 0
    : bayDoors.length;

  const newEntries = bayDoors.map((d, idx) => ({
    kind: d.kind,
    drawerRatios: [...d.drawerRatios],
    drawerBand: d.drawerBand ? { ...d.drawerBand } : undefined,
    widthCm: widths[idx],
  }));
  newEntries.splice(insertAt, 0, {
    kind: 'door',
    drawerRatios: [],
    drawerBand: undefined,
    widthCm: newDoorW,
  });

  // Always close the entire bay when freeGap < MIN_DOOR_CM so no <30cm sliver ever remains
  const used = newEntries.reduce((s, e) => s + e.widthCm, 0);
  const diff = +(bayWidth - used).toFixed(1);
  if (closeFullBay && Math.abs(diff) > 0.05) {
    newEntries[insertAt].widthCm = +(
      Math.max(MIN_DOOR_CM, Math.min(MAX_DOOR_CM, newEntries[insertAt].widthCm + diff))
    ).toFixed(1);
  }

  let cur =
    !closeFullBay && bayDoors.length > 0
      ? Math.min(bayDoors[0].startCm, bayStart)
      : bayStart;
  const items = newEntries.map((ent, idx) => {
    const startCm = +cur.toFixed(1);
    const w =
      closeFullBay && idx === newEntries.length - 1
        ? +(bayEnd - startCm).toFixed(1)
        : Math.max(MIN_DOOR_CM, ent.widthCm);
    cur = startCm + w;
    return {
      startCm,
      widthCm: w,
      kind: ent.kind,
      drawerRatios: ent.drawerRatios,
      ...(ent.drawerBand ? { drawerBand: ent.drawerBand } : {}),
    };
  });

  if (items.some((it) => it.widthCm < MIN_DOOR_CM - 0.1 || it.widthCm > MAX_DOOR_CM + 0.5)) {
    return {
      ok: false,
      reason: 'عرض درب‌ها خارج از بازه مجاز ۳۰ تا ۶۰ سانتی‌متر می‌شود',
      items: [],
    };
  }

  return {
    ok: true,
    replaceSpan: { startCm: bayStart, endCm: bayEnd },
    items,
  };
}

function computeShrinkInsertManyPreview(
  bayStart: number,
  bayEnd: number,
  bayDoors: DoorUnit[],
  cursorCmInBox: number,
  insertCount: number,
  desiredW: number,
  clickedDoor: DoorUnit | undefined
): DoorPreviewResult {
  const bayWidth = +(bayEnd - bayStart).toFixed(1);
  if (bayDoors.some((d) => d.kind !== 'door')) {
    return {
      ok: false,
      reason: `برای ${insertCount} درب، عرض درب یا دهانه باید حداقل ${insertCount * MIN_DOOR_CM}cm باشد`,
      items: [],
    };
  }

  const existingSum = +bayDoors.reduce((s, d) => s + d.widthCm, 0).toFixed(1);
  const freeGap = Math.max(0, +(bayWidth - existingSum).toFixed(1));
  const totalCount = clickedDoor
    ? bayDoors.length - 1 + insertCount
    : bayDoors.length + insertCount;
  const keepExistingSpanOnly =
    Boolean(clickedDoor) &&
    freeGap >= MIN_DOOR_CM &&
    existingSum >= totalCount * MIN_DOOR_CM - 0.1;
  const spanW = keepExistingSpanOnly ? existingSum : bayWidth;
  const spanStart = keepExistingSpanOnly && bayDoors.length > 0 ? bayDoors[0].startCm : bayStart;
  const spanEnd = +(spanStart + spanW).toFixed(1);

  if (
    spanW < totalCount * MIN_DOOR_CM - 0.1 ||
    spanW > totalCount * MAX_DOOR_CM + 0.5
  ) {
    return {
      ok: false,
      reason: `برای ${insertCount} درب، عرض درب یا دهانه باید حداقل ${insertCount * MIN_DOOR_CM}cm باشد`,
      items: [],
    };
  }

  // Try keeping existing doors near their size (shrinking down to 30cm) when replacing/inserting,
  // or distribute cleanly across spanW in [30..60cm]
  const eachEq = +(spanW / totalCount).toFixed(1);
  const targetNewEach = Math.max(
    MIN_DOOR_CM,
    Math.min(MAX_DOOR_CM, Math.min(desiredW, Math.max(MIN_DOOR_CM, eachEq)))
  );

  const keptDoors = clickedDoor ? bayDoors.filter((d) => d.id !== clickedDoor.id) : bayDoors;
  const keptWidths = keptDoors.map((d) => d.widthCm);
  const neededForNew = +(insertCount * targetNewEach).toFixed(1);
  const availForKept = +(spanW - neededForNew).toFixed(1);

  let finalWidths: number[];
  const insertAt = clickedDoor
    ? Math.max(0, bayDoors.indexOf(clickedDoor))
    : keptDoors.length === 0 || cursorCmInBox < keptDoors[0].startCm
    ? 0
    : keptDoors.length;

  if (
    keptDoors.length > 0 &&
    availForKept >= keptDoors.length * MIN_DOOR_CM - 0.1 &&
    availForKept <= keptDoors.length * MAX_DOOR_CM + 0.5
  ) {
    // Shrink/adjust keptDoors cleanly so they sum to availForKept
    const keptSum = keptWidths.reduce((a, b) => a + b, 0);
    let delta = +(keptSum - availForKept).toFixed(1);
    const adj = [...keptWidths];
    if (delta > 0) {
      let rem = delta;
      for (let pass = 0; pass < 4 && rem > 0.05; pass++) {
        for (let i = adj.length - 1; i >= 0 && rem > 0.05; i--) {
          const take = Math.min(rem, Math.max(0, +(adj[i] - MIN_DOOR_CM).toFixed(1)));
          adj[i] = +(adj[i] - take).toFixed(1);
          rem = +(rem - take).toFixed(1);
        }
      }
    } else if (delta < 0) {
      let rem = -delta;
      for (let i = 0; i < adj.length && rem > 0.05; i++) {
        const add = Math.min(rem, Math.max(0, +(MAX_DOOR_CM - adj[i]).toFixed(1)));
        adj[i] = +(adj[i] + add).toFixed(1);
        rem = +(rem - add).toFixed(1);
      }
    }
    const insertedWidths = Array.from({ length: insertCount }, () => targetNewEach);
    finalWidths = [...adj];
    finalWidths.splice(insertAt, 0, ...insertedWidths);
  } else {
    finalWidths = Array.from({ length: totalCount }, () => eachEq);
  }

  let cur = spanStart;
  const items = finalWidths.map((w, idx) => {
    const startCm = +cur.toFixed(1);
    const clampedW =
      idx === finalWidths.length - 1 ? +(spanEnd - startCm).toFixed(1) : +w.toFixed(1);
    cur = startCm + clampedW;
    return {
      startCm,
      widthCm: clampedW,
      kind: 'door' as DoorKind,
      drawerRatios: [] as number[],
    };
  });

  if (items.some((it) => it.widthCm < MIN_DOOR_CM - 0.1 || it.widthCm > MAX_DOOR_CM + 0.5)) {
    return {
      ok: false,
      reason: `برای ${insertCount} درب، عرض درب یا دهانه باید حداقل ${insertCount * MIN_DOOR_CM}cm باشد`,
      items: [],
    };
  }

  return {
    ok: true,
    replaceSpan: { startCm: spanStart, endCm: spanEnd },
    items,
  };
}

/**
 * Computes the live preview (and placement) for the Door Brush!
 * - Respects MIN_DOOR_CM (30) and MAX_DOOR_CM (60)
 * - Places 60cm doors while room exists; when clicking in tight spaces or full bays,
 *   shrinks neighboring doors in that bay down toward 30cm (refusing if any < 30cm).
 * - Horizontal on base/tall/closet -> Drawers (+ auto unit dividers)
 * - Horizontal on wall/wall-deep -> Horizontal Lift doors (+ auto unit dividers matching door width)
 */
export function computeDoorBrushPreview(
  box: CabinetBox,
  cursorCmInBox: number,
  orient: Orientation,
  verticalCount: number,
  drawerPatternIdx: number,
  liftPatternIdx: number,
  blockedZones: BlockedZone[],
  targetDoorWidthCm: number = DEFAULT_DOOR_CM
): DoorPreviewResult {
  if (box.type === 'fridge') {
    return { ok: false, reason: 'روی یخچال درب جداگانه قرار نمی‌گیرد', items: [] };
  }

  // Check if cursor is inside a corner blind zone
  const blockedAtCursor = isBoxIntervalBlocked(
    box,
    Math.max(0, cursorCmInBox - 1),
    Math.min(box.width, cursorCmInBox + 1),
    blockedZones
  );
  if (blockedAtCursor) {
    return {
      ok: false,
      reason:
        blockedAtCursor.role === 'blind-behind'
          ? `فضای کنج کور (${blockedAtCursor.depthCm}cm) — درب‌گذاری غیرمجاز`
          : `عمق کنج دیوار مجاور (${blockedAtCursor.depthCm}cm) — درب‌گذاری غیرمجاز`,
      items: [],
    };
  }

  // Is cursor over an existing door?
  const existingDoor = box.doors.find(
    (d) => cursorCmInBox >= d.startCm && cursorCmInBox <= d.startCm + d.widthCm
  );

  if (existingDoor) {
    if (orient === 'horizontal') {
      const isWall = box.type === 'wall' || box.type === 'wall-deep';
      if (isWall) {
        const wallRatios = getWallHorizontalDrawerRatios(box);
        return {
          ok: true,
          items: [
            {
              startCm: existingDoor.startCm,
              widthCm: existingDoor.widthCm,
              kind: 'lift',
              drawerRatios: wallRatios,
            },
          ],
        };
      } else {
        const pat = DRAWER_PATTERNS[drawerPatternIdx % DRAWER_PATTERNS.length];
        if (pat.drawerBand) {
          return {
            ok: true,
            items: [
              {
                startCm: existingDoor.startCm,
                widthCm: existingDoor.widthCm,
                kind: 'door',
                drawerRatios: [],
                drawerBand: { ...pat.drawerBand },
              },
            ],
          };
        }
        return {
          ok: true,
          items: [
            {
              startCm: existingDoor.startCm,
              widthCm: existingDoor.widthCm,
              kind: 'drawer',
              drawerRatios: [...pat.ratios],
            },
          ],
        };
      }
    }

    // Vertical click on existing door
    const desiredWVert = Math.max(MIN_DOOR_CM, Math.min(MAX_DOOR_CM, Math.round(targetDoorWidthCm)));
    const freeSpansAll = getFreeSpansInBox(box, blockedZones);
    const doorRightEdge = +(existingDoor.startCm + existingDoor.widthCm).toFixed(1);
    const edgeProx = Math.min(10, existingDoor.widthCm * 0.35);
    const nearRightEdge = doorRightEdge - cursorCmInBox <= edgeProx;
    const nearLeftEdge = cursorCmInBox - existingDoor.startCm <= edgeProx;

    // If hovering right at the seam touching an adjacent free span, prefer placing into the free span instead of halving the existing door!
    if (nearRightEdge || nearLeftEdge) {
      const adjFree = freeSpansAll.find((sp) =>
        nearRightEdge
          ? Math.abs(sp.startCm - doorRightEdge) <= 1.5
          : Math.abs(sp.endCm - existingDoor.startCm) <= 1.5
      );
      if (adjFree) {
        const adjLen = +(adjFree.endCm - adjFree.startCm).toFixed(1);
        if (verticalCount <= 1 && adjLen >= MIN_DOOR_CM) {
          const w = Math.min(desiredWVert, adjLen);
          const start = nearRightEdge ? adjFree.startCm : +(adjFree.endCm - w).toFixed(1);
          return {
            ok: true,
            items: [{ startCm: +start.toFixed(1), widthCm: +w.toFixed(1), kind: 'door', drawerRatios: [] }],
          };
        }
        if (verticalCount > 1 && adjLen >= verticalCount * MIN_DOOR_CM) {
          const maxSpan = Math.min(adjLen, verticalCount * desiredWVert);
          const eachW = +(maxSpan / verticalCount).toFixed(1);
          const start = nearRightEdge ? adjFree.startCm : +(adjFree.endCm - maxSpan).toFixed(1);
          const items = Array.from({ length: verticalCount }, (_, i) => ({
            startCm: +(start + i * eachW).toFixed(1),
            widthCm:
              i === verticalCount - 1
                ? +(maxSpan - eachW * (verticalCount - 1)).toFixed(1)
                : eachW,
            kind: 'door' as DoorKind,
            drawerRatios: [],
          }));
          return { ok: true, items };
        }
      }
    }

    if (verticalCount <= 1) {
      const { bayStart, bayEnd } = getBaySpanContainingCursor(box, cursorCmInBox, blockedZones);
      const bayDoors = box.doors
        .filter((d) => {
          const mid = d.startCm + d.widthCm / 2;
          return mid >= bayStart - 0.5 && mid <= bayEnd + 0.5;
        })
        .sort((a, b) => a.startCm - b.startCm);
      const existingSum = bayDoors.reduce((s, d) => s + d.widthCm, 0);
      const freeGap = Math.max(0, +(bayEnd - bayStart - existingSum).toFixed(1));

      // If near an edge touching a <30cm sliver inside the bay, absorb the sliver by shrinking neighbors instead of halving
      if ((nearLeftEdge || nearRightEdge) && freeGap >= 1 && freeGap < MIN_DOOR_CM && bayDoors.length > 0) {
        return computeShrinkInsertPreview(bayStart, bayEnd, bayDoors, cursorCmInBox, undefined);
      }

      // If clicked door >= 60cm (middle click), split it directly without touching neighbors
      if (existingDoor.widthCm >= MIN_DOOR_CM * 2) {
        const half = +(existingDoor.widthCm / 2).toFixed(1);
        return {
          ok: true,
          items: [
            { startCm: existingDoor.startCm, widthCm: half, kind: 'door', drawerRatios: [] },
            {
              startCm: +(existingDoor.startCm + half).toFixed(1),
              widthCm: +(existingDoor.widthCm - half).toFixed(1),
              kind: 'door',
              drawerRatios: [],
            },
          ],
        };
      }
      // Otherwise shrink doors in the same unit/bay down to min 30cm to fit a new door!
      return computeShrinkInsertPreview(bayStart, bayEnd, bayDoors, cursorCmInBox, existingDoor);
    }

    const parts = verticalCount;
    const partW = +(existingDoor.widthCm / parts).toFixed(1);
    if (partW < MIN_DOOR_CM) {
      const { bayStart, bayEnd } = getBaySpanContainingCursor(box, cursorCmInBox, blockedZones);
      const bayDoors = box.doors
        .filter((d) => {
          const mid = d.startCm + d.widthCm / 2;
          return mid >= bayStart - 0.5 && mid <= bayEnd + 0.5;
        })
        .sort((a, b) => a.startCm - b.startCm);
      return computeShrinkInsertManyPreview(
        bayStart,
        bayEnd,
        bayDoors,
        cursorCmInBox,
        parts,
        desiredWVert,
        existingDoor
      );
    }
    const items = [];
    for (let i = 0; i < parts; i++) {
      items.push({
        startCm: +(existingDoor.startCm + i * partW).toFixed(1),
        widthCm:
          i === parts - 1
            ? +(existingDoor.widthCm - partW * (parts - 1)).toFixed(1)
            : partW,
        kind: 'door' as DoorKind,
        drawerRatios: [],
      });
    }
    return { ok: true, items };
  }

  // Cursor is in an empty space inside the box -> find free span containing cursor
  const freeSpans = getFreeSpansInBox(box, blockedZones);
  const span = freeSpans.find(
    (sp) => cursorCmInBox >= sp.startCm - 0.5 && cursorCmInBox <= sp.endCm + 0.5
  );

  if (!span) {
    // Check if cursor is in a small (<30cm) sliver next to existing doors inside a bay -> shrink neighbors down to 30cm!
    if (orient === 'vertical') {
      const { bayStart, bayEnd } = getBaySpanContainingCursor(box, cursorCmInBox, blockedZones);
      const bayDoors = box.doors
        .filter((d) => {
          const mid = d.startCm + d.widthCm / 2;
          return mid >= bayStart - 0.5 && mid <= bayEnd + 0.5;
        })
        .sort((a, b) => a.startCm - b.startCm);
      if (bayDoors.length > 0) {
        if (verticalCount <= 1) {
          return computeShrinkInsertPreview(bayStart, bayEnd, bayDoors, cursorCmInBox, undefined);
        }
        return computeShrinkInsertManyPreview(
          bayStart,
          bayEnd,
          bayDoors,
          cursorCmInBox,
          verticalCount,
          Math.max(MIN_DOOR_CM, Math.min(MAX_DOOR_CM, Math.round(targetDoorWidthCm))),
          undefined
        );
      }
    }
    return {
      ok: false,
      reason:
        orient === 'vertical' && verticalCount > 1
          ? `برای ${verticalCount} درب، عرض درب یا دهانه باید حداقل ${verticalCount * MIN_DOOR_CM}cm باشد`
          : 'فضای خالی با عرض حداقل ۳۰cm در این قسمت وجود ندارد',
      items: [],
    };
  }

  const isWallBox = box.type === 'wall' || box.type === 'wall-deep';
  const isWallLift = orient === 'horizontal' && isWallBox;
  const minW = isWallLift ? MIN_LIFT_DOOR_CM : MIN_DOOR_CM;
  const maxW = isWallLift ? MAX_LIFT_DOOR_CM : orient === 'horizontal' ? MAX_LIFT_DOOR_CM : MAX_DOOR_CM;

  const freeLen = +(span.endCm - span.startCm).toFixed(1);
  if (freeLen < minW) {
    if (orient === 'vertical') {
      const { bayStart, bayEnd } = getBaySpanContainingCursor(box, cursorCmInBox, blockedZones);
      const bayDoors = box.doors
        .filter((d) => {
          const mid = d.startCm + d.widthCm / 2;
          return mid >= bayStart - 0.5 && mid <= bayEnd + 0.5;
        })
        .sort((a, b) => a.startCm - b.startCm);
      if (bayDoors.length > 0) {
        if (verticalCount <= 1) {
          return computeShrinkInsertPreview(bayStart, bayEnd, bayDoors, cursorCmInBox, undefined);
        }
        return computeShrinkInsertManyPreview(
          bayStart,
          bayEnd,
          bayDoors,
          cursorCmInBox,
          verticalCount,
          Math.max(MIN_DOOR_CM, Math.min(MAX_DOOR_CM, Math.round(targetDoorWidthCm))),
          undefined
        );
      }
    }
    return {
      ok: false,
      reason: isWallLift
        ? 'عرض درب افقی کابینت هوایی حداقل ۵۰ سانتی‌متر است'
        : orient === 'vertical' && verticalCount > 1
        ? `برای ${verticalCount} درب، عرض درب یا دهانه باید حداقل ${verticalCount * MIN_DOOR_CM}cm باشد`
        : 'فضای خالی کمتر از ۳۰ سانتی‌متر است',
      items: [],
    };
  }

  const desiredW = Math.max(minW, Math.min(maxW, Math.round(targetDoorWidthCm)));

  if (orient === 'horizontal') {
    const pat = !isWallBox ? DRAWER_PATTERNS[drawerPatternIdx % DRAWER_PATTERNS.length] : null;
    const isBandDoor = Boolean(pat?.drawerBand);
    const effectiveDes = isBandDoor ? Math.min(desiredW, MAX_DOOR_CM) : desiredW;
    const w = Math.min(effectiveDes, freeLen);
    let start = Math.max(
      span.startCm,
      Math.min(span.endCm - w, Math.round((cursorCmInBox - w / 2) / 5) * 5)
    );
    if (cursorCmInBox - span.startCm < w * 0.65) start = span.startCm;
    else if (span.endCm - cursorCmInBox < w * 0.65) start = +(span.endCm - w).toFixed(1);

    if (isWallBox) {
      const wallRatios = getWallHorizontalDrawerRatios(box);
      return {
        ok: true,
        items: [{ startCm: +start.toFixed(1), widthCm: +w.toFixed(1), kind: 'lift', drawerRatios: wallRatios }],
      };
    } else if (pat?.drawerBand) {
      return {
        ok: true,
        items: [
          {
            startCm: +start.toFixed(1),
            widthCm: +w.toFixed(1),
            kind: 'door',
            drawerRatios: [],
            drawerBand: { ...pat.drawerBand },
          },
        ],
      };
    } else {
      return {
        ok: true,
        items: [
          {
            startCm: +start.toFixed(1),
            widthCm: +w.toFixed(1),
            kind: 'drawer',
            drawerRatios: [...(pat?.ratios || [0.333, 0.667])],
          },
        ],
      };
    }
  }

  // Vertical brush in empty space — directly respects targetDoorWidthCm (30..60cm) and leaves remainder empty!
  if (verticalCount <= 1) {
    const w = Math.min(desiredW, freeLen);
    let start = Math.max(
      span.startCm,
      Math.min(span.endCm - w, Math.round((cursorCmInBox - w / 2) / 5) * 5)
    );
    if (cursorCmInBox - span.startCm < w * 0.65) start = span.startCm;
    else if (span.endCm - cursorCmInBox < w * 0.65) start = +(span.endCm - w).toFixed(1);

    if (freeLen <= desiredW) {
      start = span.startCm;
    }

    return {
      ok: true,
      items: [{ startCm: +start.toFixed(1), widthCm: +w.toFixed(1), kind: 'door', drawerRatios: [] }],
    };
  }

  // Multi-door placement in empty span — honors desired door width & shrinks adjacent bay doors if span < count * 30
  const count = verticalCount;
  if (freeLen < count * MIN_DOOR_CM) {
    const { bayStart, bayEnd } = getBaySpanContainingCursor(box, cursorCmInBox, blockedZones);
    const bayDoors = box.doors
      .filter((d) => {
        const mid = d.startCm + d.widthCm / 2;
        return mid >= bayStart - 0.5 && mid <= bayEnd + 0.5;
      })
      .sort((a, b) => a.startCm - b.startCm);
    if (bayDoors.length > 0) {
      return computeShrinkInsertManyPreview(
        bayStart,
        bayEnd,
        bayDoors,
        cursorCmInBox,
        count,
        desiredW,
        undefined
      );
    }
    return {
      ok: false,
      reason: `برای ${count} درب، عرض درب یا دهانه باید حداقل ${count * MIN_DOOR_CM}cm باشد`,
      items: [],
    };
  }

  const maxSpanForCount = Math.min(freeLen, count * desiredW);
  const eachW = +(maxSpanForCount / count).toFixed(1);

  let start = span.startCm;
  if (freeLen > maxSpanForCount) {
    start = Math.max(
      span.startCm,
      Math.min(span.endCm - maxSpanForCount, Math.round((cursorCmInBox - maxSpanForCount / 2) / 5) * 5)
    );
    if (cursorCmInBox - span.startCm < maxSpanForCount * 0.5) start = span.startCm;
  }

  const items = [];
  for (let i = 0; i < count; i++) {
    items.push({
      startCm: +(start + i * eachW).toFixed(1),
      widthCm: i === count - 1 ? +(maxSpanForCount - eachW * (count - 1)).toFixed(1) : eachW,
      kind: 'door' as DoorKind,
      drawerRatios: [],
    });
  }
  return { ok: true, items };
}

function ensureUnitDividersForRange(box: CabinetBox, startCm: number, endCm: number) {
  if (startCm > 2 && !box.unitDividers.some((u) => Math.abs(u - startCm) < 2)) {
    box.unitDividers.push(+startCm.toFixed(1));
  }
  if (endCm < box.width - 2 && !box.unitDividers.some((u) => Math.abs(u - endCm) < 2)) {
    box.unitDividers.push(+endCm.toFixed(1));
  }
  box.unitDividers.sort((a, b) => a - b);
}

/**
 * Applies a computed Door Brush preview onto the box:
 * - Supports bay shrinking/replacement (`replaceSpan`)
 * - Automatically places unit dividers for drawers and horizontal lift doors
 */
export function applyDoorBrushPreview(
  box: CabinetBox,
  cursorCmInBox: number,
  preview: DoorPreviewResult,
  _blockedZones: BlockedZone[] = []
): { ok: boolean; selectedDoorId: string | null; message?: string } {
  if (!preview.ok || !preview.items.length) {
    return { ok: false, selectedDoorId: null, message: preview.reason };
  }

  // Empty tall / pantry wardrobes: create two manageable hinged leaves automatically.
  // A full-height door must never exceed the refrigerator height (185 cm).
  const autoSplitTall = (box.type === 'tall' || box.type === 'closet')
    && box.doors.length === 0 && box.height > 185;
  const tallSplitRatio = Math.min(0.52, Math.max(0.18, (box.height - 185) / box.height, 86 / box.height));
  const mapItemToDoor = (it: DoorPreviewResult['items'][number]): DoorUnit => ({
    id: uid('door'),
    startCm: it.startCm,
    widthCm: it.widthCm,
    kind: it.kind,
    drawerRatios: [...it.drawerRatios],
    ...(it.drawerBand ? { drawerBand: { ...it.drawerBand } } :
      autoSplitTall && it.kind === 'door'
        ? { drawerBand: { position: 'bottom', ratio: tallSplitRatio }, tallDoorSplit: true } : {}),
  });

  if (preview.replaceSpan) {
    const { startCm, endCm } = preview.replaceSpan;
    const removedIds = new Set(
      box.doors
        .filter((d) => {
          const mid = d.startCm + d.widthCm / 2;
          return mid >= startCm - 0.5 && mid <= endCm + 0.5;
        })
        .map((d) => d.id)
    );
    box.doors = box.doors.filter((d) => !removedIds.has(d.id));
    box.handles = box.handles.filter((h) => !removedIds.has(h.doorId));

    const created: DoorUnit[] = preview.items.map(mapItemToDoor);
    box.doors.push(...created);
    box.doors.sort((a, b) => a.startCm - b.startCm);
    for (const c of created) {
      if (c.kind === 'drawer' || c.kind === 'lift') {
        ensureUnitDividersForRange(box, c.startCm, c.startCm + c.widthCm);
      }
    }
    return { ok: true, selectedDoorId: created[0]?.id ?? null };
  }

  const existingDoor = box.doors.find(
    (d) => cursorCmInBox >= d.startCm && cursorCmInBox <= d.startCm + d.widthCm
  );

  if (existingDoor) {
    const idx = box.doors.indexOf(existingDoor);
    const first = preview.items[0];
    if (
      preview.items.length === 1 &&
      (first.kind === 'drawer' || first.kind === 'lift' || Boolean(first.drawerBand))
    ) {
      existingDoor.kind = first.kind;
      existingDoor.drawerRatios = [...first.drawerRatios];
      if (first.drawerBand) {
        existingDoor.drawerBand = { ...first.drawerBand };
      } else {
        delete existingDoor.drawerBand;
      }
      box.handles = box.handles.filter((h) => h.doorId !== existingDoor.id);
      if (existingDoor.kind === 'drawer' || existingDoor.kind === 'lift') {
        ensureUnitDividersForRange(box, existingDoor.startCm, existingDoor.startCm + existingDoor.widthCm);
      }
      return { ok: true, selectedDoorId: existingDoor.id };
    }
    // Check if preview actually targets an adjacent free span (e.g. clicking right on seam edge)
    const touchesExisting =
      preview.items[0].startCm >= existingDoor.startCm - 0.5 &&
      preview.items[0].startCm + preview.items[0].widthCm <=
        existingDoor.startCm + existingDoor.widthCm + 0.5;
    if (touchesExisting) {
      const created: DoorUnit[] = preview.items.map(mapItemToDoor);
      box.doors.splice(idx, 1, ...created);
      box.handles = box.handles.filter((h) => h.doorId !== existingDoor.id);
      return { ok: true, selectedDoorId: created[0].id };
    }
  }

  const created: DoorUnit[] = preview.items.map(mapItemToDoor);
  box.doors.push(...created);
  box.doors.sort((a, b) => a.startCm - b.startCm);
  for (const c of created) {
    if (c.kind === 'drawer' || c.kind === 'lift') {
      ensureUnitDividersForRange(box, c.startCm, c.startCm + c.widthCm);
    }
  }
  return { ok: true, selectedDoorId: created[0].id };
}

/**
 * Erases a door using the strict 30-60cm merge rule:
 * Merges into an adjacent door ONLY if they touch AND combined width <= 60cm;
 * otherwise leaves the space empty.
 */
export function eraseDoorWithRule(box: CabinetBox, doorId: string): string {
  box.doors.sort((a, b) => a.startCm - b.startCm);
  const idx = box.doors.findIndex((d) => d.id === doorId);
  if (idx === -1) return '';

  const door = box.doors[idx];
  const prev = idx > 0 ? box.doors[idx - 1] : null;
  const next = idx < box.doors.length - 1 ? box.doors[idx + 1] : null;
  let msg = '';

  if (
    prev &&
    Math.abs(prev.startCm + prev.widthCm - door.startCm) < 1 &&
    prev.widthCm + door.widthCm <= MAX_DOOR_CM
  ) {
    prev.widthCm = +(prev.widthCm + door.widthCm).toFixed(1);
    box.doors.splice(idx, 1);
    msg = `درب با درب کناری ادغام شد (${prev.widthCm} cm)`;
  } else if (
    next &&
    Math.abs(door.startCm + door.widthCm - next.startCm) < 1 &&
    next.widthCm + door.widthCm <= MAX_DOOR_CM
  ) {
    next.startCm = door.startCm;
    next.widthCm = +(next.widthCm + door.widthCm).toFixed(1);
    box.doors.splice(idx, 1);
    msg = `درب با درب کناری ادغام شد (${next.widthCm} cm)`;
  } else {
    box.doors.splice(idx, 1);
    msg = 'درب حذف شد (ادغام بیش از ۶۰cm می‌شد؛ فضا خالی ماند)';
  }

  box.handles = box.handles.filter((h) => h.doorId !== door.id);
  return msg;
}

/**
 * Clamps internal doors, dividers, and shelves when a box is resized so nothing ever leaks outside.
 */
export function clampBoxInternalsAfterResize(box: CabinetBox): void {
  const minForDoor = (d: DoorUnit) =>
    d.hardwareKind === 'pantry-pullout' ? MIN_PANTRY_CM : MIN_DOOR_CM;
  box.doors = box.doors
    .filter((d) => d.startCm < box.width - minForDoor(d) + 1)
    .map((d) => {
      const maxW = +(box.width - d.startCm).toFixed(1);
      return {
        ...d,
        widthCm: Math.min(d.widthCm, maxW),
      };
    })
    .filter((d) => d.widthCm >= minForDoor(d) - 0.5 || box.type === 'fridge');

  box.unitDividers = box.unitDividers.filter((u) => u > 2 && u < box.width - 2);
  box.shelves = box.shelves
    .filter((s) => s.startCm < box.width - 5)
    .map((s) => ({ ...s, endCm: Math.min(s.endCm, box.width) }));
  if (box.frames?.length) {
    box.frames = box.frames.filter(
      (f) => f.side !== 'seam' || (f.seamCm !== undefined && box.unitDividers.some((u) => Math.abs(u - f.seamCm!) < 2))
    );
  }
  if (box.type === 'wall' || box.type === 'wall-deep') {
    const wallRatios = getWallHorizontalDrawerRatios(box);
    box.doors.forEach((d) => {
      if (d.kind === 'lift') {
        d.drawerRatios = [...wallRatios];
      }
    });
  }
}

/**
 * Checks whether a movable appliance (`gas` or `sink`) separates two runs of vertical hinged doors
 * inside `box`, and if shifting it (+ its coupled hood/drawers) makes all vertical doors equal within [30..60cm].
 */
function tryEqualizeVerticalWithMovableAppliance(
  box: CabinetBox,
  hinged: DoorUnit[],
  wall: Wall,
  allWalls: Wall[],
  cornerOwners: Record<string, string>
): { ok: boolean; message: string } | null {
  const runs: DoorUnit[][] = [];
  for (const d of hinged) {
    const lastRun = runs[runs.length - 1];
    if (
      lastRun &&
      Math.abs(lastRun[lastRun.length - 1].startCm + lastRun[lastRun.length - 1].widthCm - d.startCm) <= 1.5
    ) {
      lastRun.push(d);
    } else {
      runs.push([d]);
    }
  }
  if (runs.length < 2) return null;

  // Find candidate movable appliance (gas or sink) sitting directly between two adjacent door runs
  for (let i = 0; i < runs.length - 1; i++) {
    const runL = runs[i];
    const runR = runs[i + 1];
    const gapStartGlobal = +(box.offsetX + runL[runL.length - 1].startCm + runL[runL.length - 1].widthCm).toFixed(1);
    const gapEndGlobal = +(box.offsetX + runR[0].startCm).toFixed(1);
    const gapW = +(gapEndGlobal - gapStartGlobal).toFixed(1);
    if (gapW < 30) continue;

    const sepApp = wall.appliances.find(
      (a) =>
        (a.kind === 'gas' || a.kind === 'sink') &&
        Math.abs(a.offsetX - gapStartGlobal) <= 2 &&
        Math.abs(a.offsetX + a.width - gapEndGlobal) <= 2
    );
    if (!sepApp) continue;

    const allDoorsInPair = [...runL, ...runR];
    const totalLeftW = runL.reduce((s, d) => s + d.widthCm, 0);
    const totalRightW = runR.reduce((s, d) => s + d.widthCm, 0);
    const totalDoorW = +(totalLeftW + totalRightW).toFixed(1);
    const eqW = +(totalDoorW / allDoorsInPair.length).toFixed(1);
    if (eqW < MIN_DOOR_CM - 0.1 || eqW > MAX_DOOR_CM + 0.1) continue;

    const targetLeftSpan = +(eqW * runL.length).toFixed(1);
    const desiredAppX = +(box.offsetX + runL[0].startCm + targetLeftSpan).toFixed(1);

    // Must be movable within bounds (without colliding with corners or sibling appliances)
    const range = getFreeMoveRangeForAppliance(wall, allWalls, sepApp, cornerOwners);
    if (desiredAppX < range.minX - 0.5 || desiredAppX > range.maxX + 0.5) continue;
    const clampedAppX = Math.max(range.minX, Math.min(range.maxX, desiredAppX));
    if (Math.abs(clampedAppX - desiredAppX) > 1.5) continue;

    const allPairIds = new Set(allDoorsInPair.map((d) => d.id));
    const savedHandles = box.handles.filter((h) => allPairIds.has(h.doorId));

    // Move the separating appliance (exact sub-cm alignment, synced hood & drawers)
    moveApplianceHierarchically(wall, allWalls, sepApp.id, clampedAppX, cornerOwners, {
      exact: true,
    });

    // Ensure all hinged doors from runL/runR remain in box.doors (moveApplianceHierarchically may prune pre-shrink overlaps)
    for (const d of allDoorsInPair) {
      if (!box.doors.some((x) => x.id === d.id)) {
        box.doors.push(d);
      }
    }
    for (const h of savedHandles) {
      if (!box.handles.some((x) => x.id === h.id)) {
        box.handles.push(h);
      }
    }

    const newLocalAppStart = +(sepApp.offsetX - box.offsetX).toFixed(1);
    const newLocalAppEnd = +(newLocalAppStart + sepApp.width).toFixed(1);

    // Reposition & equalize left run doors cleanly from runL[0].startCm to newLocalAppStart
    const leftBayW = +(newLocalAppStart - runL[0].startCm).toFixed(1);
    const leftEach = +(leftBayW / runL.length).toFixed(1);
    let curL = runL[0].startCm;
    const oldLeftBoundary = +(runL[runL.length - 1].startCm + runL[runL.length - 1].widthCm).toFixed(1);
    const leftMap = new Map<number, number>();
    runL.forEach((d, idx) => {
      const oldEnd = +(d.startCm + d.widthCm).toFixed(1);
      d.startCm = +curL.toFixed(1);
      d.widthCm =
        idx === runL.length - 1
          ? +(newLocalAppStart - curL).toFixed(1)
          : leftEach;
      curL += d.widthCm;
      if (Math.abs(oldEnd - oldLeftBoundary) > 1.5) {
        leftMap.set(oldEnd, +curL.toFixed(1));
      }
    });

    // Reposition & equalize right run doors cleanly from newLocalAppEnd to runREnd
    const runREnd = +(runR[runR.length - 1].startCm + runR[runR.length - 1].widthCm).toFixed(1);
    const rightBayW = +(runREnd - newLocalAppEnd).toFixed(1);
    const rightEach = +(rightBayW / runR.length).toFixed(1);
    let curR = newLocalAppEnd;
    const oldRightBoundary = runR[0].startCm;
    const rightMap = new Map<number, number>();
    runR.forEach((d, idx) => {
      const oldEnd = +(d.startCm + d.widthCm).toFixed(1);
      d.startCm = +curR.toFixed(1);
      d.widthCm =
        idx === runR.length - 1
          ? +(runREnd - curR).toFixed(1)
          : rightEach;
      curR += d.widthCm;
      if (Math.abs(oldEnd - runREnd) > 1.5 && Math.abs(oldEnd - oldRightBoundary) > 1.5) {
        rightMap.set(oldEnd, +curR.toFixed(1));
      }
    });

    // Keep any internal unit dividers / seam frames inside left/right runs aligned to equalized door edges
    box.unitDividers = box.unitDividers
      .map((u) => {
        for (const [oldU, newU] of leftMap.entries()) {
          if (Math.abs(u - oldU) <= 1.8) return newU;
        }
        for (const [oldU, newU] of rightMap.entries()) {
          if (Math.abs(u - oldU) <= 1.8) return newU;
        }
        return u;
      })
      .sort((a, b) => a - b);

    if (box.frames?.length) {
      box.frames.forEach((f) => {
        if (f.side !== 'seam' || f.seamCm === undefined) return;
        for (const [oldU, newU] of [...leftMap.entries(), ...rightMap.entries()]) {
          if (Math.abs(f.seamCm - oldU) <= 1.8) f.seamCm = newU;
        }
      });
    }

    box.doors.sort((a, b) => a.startCm - b.startCm);
    const displayW = Number.isInteger(eqW) ? `${eqW}` : `${eqW}`;
    return {
      ok: true,
      message: `${allDoorsInPair.length} درب عمودی هم‌راستا به عرض ${displayW}cm مساوی و تجهیز متصل تراز شد`,
    };
  }

  return null;
}

/**
 * Equalizes widths of vertical hinged doors inside a box (30..60cm).
 * Supports any number of aligned doors and automatically balances a separating movable appliance
 * (such as Gas + Hood or Sink) when present on `wall`.
 */
export function equalizeVerticalDoorsInBox(
  box: CabinetBox,
  blockedZones: BlockedZone[],
  wall?: Wall,
  allWalls?: Wall[],
  cornerOwners: Record<string, string> = {}
): { ok: boolean; message: string } {
  const hinged = box.doors.filter((d) => d.kind === 'door').sort((a, b) => a.startCm - b.startCm);
  if (hinged.length < 2) {
    return { ok: false, message: 'حداقل ۲ درب عمودی لولایی برای مساوی‌سازی عمودی لازم است' };
  }

  // Try appliance-aware equalization across all aligned doors first (e.g. [42.5, 42.5] | Gas | [32.5, 32.5])
  if (wall) {
    const balanced = tryEqualizeVerticalWithMovableAppliance(
      box,
      hinged,
      wall,
      allWalls || [wall],
      cornerOwners
    );
    if (balanced) return balanced;
  }

  // Group into contiguous door runs (separated by gaps/drawers/appliances)
  const runs: DoorUnit[][] = [];
  for (const d of hinged) {
    const lastRun = runs[runs.length - 1];
    if (
      lastRun &&
      Math.abs(lastRun[lastRun.length - 1].startCm + lastRun[lastRun.length - 1].widthCm - d.startCm) <= 1.5
    ) {
      lastRun.push(d);
    } else {
      runs.push([d]);
    }
  }

  const validRuns = runs.filter((r) => r.length >= 2);
  if (!validRuns.length) {
    return { ok: false, message: 'حداقل ۲ درب عمودی هم‌جوار یا هم‌راستا برای مساوی‌سازی نیاز است' };
  }

  for (const run of validRuns) {
    const totalW = +(run.reduce((s, d) => s + d.widthCm, 0)).toFixed(1);
    const eqW = +(totalW / run.length).toFixed(1);
    if (eqW < MIN_DOOR_CM || eqW > MAX_DOOR_CM) {
      return {
        ok: false,
        message: `عرض مساوی (${eqW}cm) خارج از بازه مجاز ۳۰ تا ۶۰ سانتی‌متر است`,
      };
    }

    let startCursor = run[0].startCm;
    for (const z of blockedZones) {
      if (z.startCm <= box.offsetX && z.endCm > box.offsetX && run[0].startCm < 5) {
        startCursor = Math.max(startCursor, z.endCm - box.offsetX);
      }
    }
    if (startCursor + totalW > box.width + 0.5) {
      startCursor = run[0].startCm;
    }

    let cur = startCursor;
    run.forEach((d, i) => {
      d.startCm = +cur.toFixed(1);
      d.widthCm =
        i === run.length - 1 ? +(totalW - eqW * (run.length - 1)).toFixed(1) : eqW;
      cur += eqW;
    });
  }

  return { ok: true, message: 'عرض درب‌های عمودی هم‌راستا مساوی و مرتب شدند' };
}

/**
 * Backward-compatible alias for vertical door equalization.
 */
export function equalizeDoorsInBox(
  box: CabinetBox,
  blockedZones: BlockedZone[],
  wall?: Wall,
  allWalls?: Wall[],
  cornerOwners: Record<string, string> = {}
): { ok: boolean; message: string } {
  return equalizeVerticalDoorsInBox(box, blockedZones, wall, allWalls, cornerOwners);
}

/**
 * Equalizes horizontal splits on drawers (e.g., stepped -> equal rows) and horizontal lift doors
 * (both row height ratios and adjacent lift widths in 50..110cm on wall cabinets).
 */
export function equalizeHorizontalInBox(
  box: CabinetBox,
  targetDoorId?: string | null
): { ok: boolean; message: string } {
  const targets = box.doors.filter(
    (d) =>
      (d.kind === 'drawer' || d.kind === 'lift') &&
      (!targetDoorId || d.id === targetDoorId)
  );
  const effectiveTargets = targets.length
    ? targets
    : box.doors.filter((d) => d.kind === 'drawer' || d.kind === 'lift');

  if (!effectiveTargets.length) {
    return { ok: false, message: 'کشو یا درب افقی برای مساوی‌سازی افقی وجود ندارد' };
  }

  let changed = false;
  for (const d of effectiveTargets) {
    const count =
      d.drawerRatios.length > 0
        ? d.drawerRatios.length + 1
        : d.kind === 'drawer'
        ? 3
        : 1;
    if (count > 1) {
      const nextRatios = Array.from({ length: count - 1 }, (_, i) =>
        +((i + 1) / count).toFixed(3)
      );
      d.drawerRatios = nextRatios;
      changed = true;
    }
  }

  // Also equalize contiguous lift widths on wall boxes if >=2 lift doors exist
  const isWall = box.type === 'wall' || box.type === 'wall-deep';
  const lifts = box.doors.filter((d) => d.kind === 'lift').sort((a, b) => a.startCm - b.startCm);
  if (isWall && lifts.length >= 2) {
    const totalW = +(lifts.reduce((s, d) => s + d.widthCm, 0)).toFixed(1);
    const eqW = +(totalW / lifts.length).toFixed(1);
    if (eqW >= MIN_LIFT_DOOR_CM && eqW <= MAX_LIFT_DOOR_CM) {
      let cur = lifts[0].startCm;
      lifts.forEach((d, i) => {
        d.startCm = +cur.toFixed(1);
        d.widthCm = i === lifts.length - 1 ? +(totalW - eqW * (lifts.length - 1)).toFixed(1) : eqW;
        cur += eqW;
      });
      changed = true;
    }
  }

  if (!changed) {
    return { ok: false, message: 'این درب افقی تک‌لنگه است و ردیف یا تقسیم نامساوی ندارد' };
  }
  return { ok: true, message: 'ردیف‌های کشو و درب‌های افقی مساوی‌سازی شدند' };
}

/**
 * Mirrors doors, dividers, shelves, frames, handles, and coupled appliances left-to-right
 * strictly inside the box's usable visible front span (never pushing doors/appliances into کنج کور).
 */
export function mirrorBoxLayout(
  box: CabinetBox,
  wall?: Wall,
  allWalls?: Wall[],
  cornerOwners: Record<string, string> = {}
): void {
  const blocked = wall
    ? getCornerBlockedZonesForWall(wall, allWalls || [wall], cornerOwners)
    : [];
  const { startCm: spanStart, endCm: spanEnd } = getBoxUsableFrontSpan(box, blocked);
  const mirrorX = (x: number) => +(spanStart + spanEnd - x).toFixed(1);

  const ownedApps = wall
    ? wall.appliances.filter(
        (a) =>
          a.boxId === box.id ||
          (!a.boxId &&
            box.type === 'base' &&
            a.offsetX >= box.offsetX - 2 &&
            a.offsetX + a.width <= box.offsetX + box.width + 2)
      )
    : [];

  if (wall) {
    for (const app of ownedApps) {
      if (app.kind === 'gas') {
        clearHoodUnitForGas(wall, app.offsetX, app.offsetX + app.width, app.id);
      } else if (app.kind === 'sink') {
        clearDishRackUnitAboveSink(wall, app.offsetX, app.offsetX + app.width, app.id);
      }
    }
  }

  box.doors.forEach((d) => {
    const mid = d.startCm + d.widthCm / 2;
    if (mid >= spanStart - 1 && mid <= spanEnd + 1) {
      const mirroredStart = +(spanStart + spanEnd - (d.startCm + d.widthCm)).toFixed(1);
      d.startCm = Math.max(spanStart, Math.min(spanEnd - d.widthCm, mirroredStart));
      if (d.hingeSide === 'left') d.hingeSide = 'right';
      else if (d.hingeSide === 'right') d.hingeSide = 'left';
    }
  });
  box.doors.sort((a, b) => a.startCm - b.startCm);

  box.unitDividers = box.unitDividers
    .map((u) => {
      if (u >= spanStart + 1.5 && u <= spanEnd - 1.5) return mirrorX(u);
      return +u.toFixed(1);
    })
    .filter((u) => u > 2 && u < box.width - 2)
    .sort((a, b) => a - b);

  box.shelves.forEach((sh) => {
    const mid = (sh.startCm + sh.endCm) / 2;
    if (mid >= spanStart - 1 && mid <= spanEnd + 1) {
      const ns = Math.max(spanStart, mirrorX(sh.endCm));
      const ne = Math.min(spanEnd, mirrorX(sh.startCm));
      if (ne - ns >= 15) {
        sh.startCm = ns;
        sh.endCm = ne;
      }
    }
  });

  if (box.frames?.length) {
    box.frames.forEach((f) => {
      if (f.side === 'seam' && f.seamCm !== undefined) {
        if (f.seamCm >= spanStart + 1.5 && f.seamCm <= spanEnd - 1.5) {
          f.seamCm = mirrorX(f.seamCm);
        }
      } else if (f.side === 'left' && spanStart <= 1 && Math.abs(spanEnd - box.width) <= 1) {
        f.side = 'right';
      } else if (f.side === 'right' && spanStart <= 1 && Math.abs(spanEnd - box.width) <= 1) {
        f.side = 'left';
      }
    });
  }

  box.handles.forEach((h) => {
    h.xRatio = +(1 - h.xRatio).toFixed(2);
  });

  if (wall) {
    for (const app of ownedApps) {
      app.boxId = box.id;
      const localStart = +(app.offsetX - box.offsetX).toFixed(1);
      const localEnd = +(localStart + app.width).toFixed(1);
      if (localStart >= spanStart - 2 && localEnd <= spanEnd + 2) {
        const newLocalStart = Math.max(
          spanStart,
          Math.min(spanEnd - app.width, +(spanStart + spanEnd - localEnd).toFixed(1))
        );
        app.offsetX = +(box.offsetX + newLocalStart).toFixed(1);
      }
      if (app.kind === 'gas') {
        syncHoodUnitAboveGas(wall, app);
      } else if (app.kind === 'sink') {
        ensureHorizontalDoorsAboveSink(wall, app.offsetX, app.width);
      }
    }
  }
}

/**
 * Removes previous hood unit dividers/doors anchored to `[oldStartX, oldEndX]` on overhead wall boxes
 * when a gas appliance is moved or deleted.
 */
export function clearHoodUnitForGas(
  wall: Wall,
  oldStartX: number,
  oldEndX: number,
  excludeGasId?: string
): void {
  const siblingWallEdges = (wallBox: CabinetBox): number[] => {
    const edges: number[] = [];
    for (const a of wall.appliances) {
      if (a.id === excludeGasId) continue;
      if (a.kind !== 'gas' && a.kind !== 'sink') continue;
      edges.push(+(a.offsetX - wallBox.offsetX).toFixed(1));
      edges.push(+(a.offsetX + a.width - wallBox.offsetX).toFixed(1));
    }
    return edges;
  };

  for (const box of wall.boxes) {
    if (box.type !== 'wall' && box.type !== 'wall-deep') continue;
    if (box.linkedToBoxId) continue;
    const localStart = +(Math.max(0, oldStartX - box.offsetX)).toFixed(1);
    const localEnd = +(Math.min(box.width, oldEndX - box.offsetX)).toFixed(1);
    if (localEnd - localStart < 25) continue;

    // Remove auto hood door(s) spanning the old hood bay
    const rmDoorIds = new Set(
      box.doors
        .filter((d) => {
          const mid = d.startCm + d.widthCm / 2;
          return (
            mid >= localStart - 0.5 &&
            mid <= localEnd + 0.5 &&
            d.startCm >= localStart - 2 &&
            d.startCm + d.widthCm <= localEnd + 2
          );
        })
        .map((d) => d.id)
    );
    box.doors = box.doors.filter((d) => !rmDoorIds.has(d.id));
    box.handles = box.handles.filter((h) => !rmDoorIds.has(h.doorId));

    const keepEdges = siblingWallEdges(box);
    box.unitDividers = box.unitDividers.filter((u) => {
      const matchesOld = Math.abs(u - localStart) <= 1.8 || Math.abs(u - localEnd) <= 1.8;
      if (!matchesOld) return true;
      return keepEdges.some((ke) => Math.abs(ke - u) <= 1.8);
    });
    if (box.frames?.length) {
      box.frames = box.frames.filter(
        (f) => f.side !== 'seam' || (f.seamCm !== undefined && box.unitDividers.some((u) => Math.abs(u - f.seamCm!) < 2))
      );
    }
  }
}

/**
 * Synchronizes wall cabinet unit boundaries above a `gas` appliance flush with `[gas.offsetX .. gas.offsetX + gas.width]`:
 * - Creates/maintains dedicated hood unit dividers flush with gas edges
 * - Trims/removes any wall cabinet doors overlapping the hood zone so no cabinet door collides with the hood
 * - For `chimney` hoods: keeps the dedicated hood bay open (with its own hood unit dividers)
 * - For `hidden` hoods: inserts a matching horizontal `lift` door for the upper hood cabinet
 */
export function requiresIntegratedHood(wall: Wall, gas: Pick<ApplianceItem, 'offsetX' | 'width'>) {
  const overGas = (box: CabinetBox) => box.offsetX < gas.offsetX + gas.width - 5 && box.offsetX + box.width > gas.offsetX + 5;
  return wall.boxes.some(lower => lower.type === 'wall' && overGas(lower) && wall.boxes.some(upper =>
    upper.type === 'wall-deep' && !upper.linkedToBoxId && overGas(upper) &&
    Math.abs(upper.elevY - lower.elevY - lower.height) <= 3));
}

export function effectiveHoodKind(wall: Wall, gas: ApplianceItem) {
  return requiresIntegratedHood(wall, gas) ? 'hidden' : gas.hoodKind ?? 'chimney';
}

export function syncHoodUnitAboveGas(wall: Wall, gas: ApplianceItem): number {
  if (gas.kind !== 'gas') return 0;
  const integrated = requiresIntegratedHood(wall, gas);
  if (integrated) gas.hoodKind = 'hidden';
  const gStart = gas.offsetX;
  const gEnd = gas.offsetX + gas.width;
  let updated = 0;

  for (const box of wall.boxes) {
    if (box.type !== 'wall' && box.type !== 'wall-deep') continue;
    if (box.linkedToBoxId) continue;

    const rawStart = Math.max(0, gStart - box.offsetX);
    const rawEnd = Math.min(box.width, gEnd - box.offsetX);
    const spanW = +(rawEnd - rawStart).toFixed(1);
    if (spanW <= 1.5) continue;

    const localStart = +rawStart.toFixed(1);
    const localEnd = +rawEnd.toFixed(1);
    if (integrated && box.type === 'wall-deep') {
      if (spanW >= 30 && !box.doors.some(door => door.kind !== 'open' && door.startCm < localEnd - 2 && door.startCm + door.widthCm > localStart + 2)) {
        box.doors.push({ id: uid('door'), startCm: localStart, widthCm: spanW, kind: 'lift', drawerRatios: [] });
        box.doors.sort((a, b) => a.startCm - b.startCm);
      }
      continue;
    }

    // Trim or remove any doors colliding with the dedicated hood unit span [localStart .. localEnd]
    const nextDoors: DoorUnit[] = [];
    const removedIds = new Set<string>();
    for (const d of box.doors) {
      const dEnd = +(d.startCm + d.widthCm).toFixed(1);
      if (dEnd <= localStart + 1.5 || d.startCm >= localEnd - 1.5) {
        nextDoors.push(d);
        continue;
      }
      removedIds.add(d.id);
      const minLeft = d.kind === 'lift' ? MIN_LIFT_DOOR_CM : MIN_DOOR_CM;
      const leftRem = +(localStart - d.startCm).toFixed(1);
      if (leftRem >= minLeft) {
        nextDoors.push({
          id: uid('door'),
          startCm: d.startCm,
          widthCm: leftRem,
          kind: leftRem > MAX_DOOR_CM ? 'lift' : d.kind,
          doorStyle: d.doorStyle,
          drawerRatios: d.kind === 'lift' ? [...d.drawerRatios] : [],
        });
      } else if (leftRem >= MIN_DOOR_CM) {
        nextDoors.push({
          id: uid('door'),
          startCm: d.startCm,
          widthCm: leftRem,
          kind: 'door',
          doorStyle: d.doorStyle,
          drawerRatios: [],
        });
      }

      const rightRem = +(dEnd - localEnd).toFixed(1);
      if (rightRem >= minLeft) {
        nextDoors.push({
          id: uid('door'),
          startCm: localEnd,
          widthCm: rightRem,
          kind: rightRem > MAX_DOOR_CM ? 'lift' : d.kind,
          doorStyle: d.doorStyle,
          drawerRatios: d.kind === 'lift' ? [...d.drawerRatios] : [],
        });
      } else if (rightRem >= MIN_DOOR_CM) {
        nextDoors.push({
          id: uid('door'),
          startCm: localEnd,
          widthCm: rightRem,
          kind: 'door',
          doorStyle: d.doorStyle,
          drawerRatios: [],
        });
      }
    }

    box.doors = nextDoors;
    if (removedIds.size > 0) {
      box.handles = box.handles.filter((h) => !removedIds.has(h.doorId));
    }

    // Remove shelves crossing through the dedicated hood bay so unit-on-unit or duct clashes never happen
    box.shelves = box.shelves.filter(
      (sh) => sh.endCm <= localStart + 1.5 || sh.startCm >= localEnd - 1.5
    );

    // Clear stale unit dividers strictly inside the hood bay (unless owned by a sibling appliance edge)
    const siblingEdges: number[] = [];
    for (const a of wall.appliances) {
      if (a.id === gas.id) continue;
      if (a.kind !== 'gas' && a.kind !== 'sink') continue;
      siblingEdges.push(+(a.offsetX - box.offsetX).toFixed(1));
      siblingEdges.push(+(a.offsetX + a.width - box.offsetX).toFixed(1));
    }
    box.unitDividers = box.unitDividers.filter((u) => {
      if (u <= localStart + 1.5 || u >= localEnd - 1.5) return true;
      return siblingEdges.some((se) => Math.abs(se - u) <= 1.5);
    });

    // Add unit dividers flush with hood left & right boundaries
    if (localStart > 2 && !box.unitDividers.some((u) => Math.abs(u - localStart) <= 1.5)) {
      box.unitDividers.push(localStart);
    }
    if (localEnd < box.width - 2 && !box.unitDividers.some((u) => Math.abs(u - localEnd) <= 1.5)) {
      box.unitDividers.push(localEnd);
    }
    box.unitDividers.sort((a, b) => a - b);

    if (box.frames?.length) {
      box.frames = box.frames.filter(
        (f) =>
          f.side !== 'seam' ||
          (f.seamCm !== undefined &&
            box.unitDividers.some((u) => Math.abs(u - f.seamCm!) <= 1.8))
      );
    }

    // Hidden hood sits inside its own dedicated horizontal lift unit flush with gas width
    const neighborStyle = box.doors.find(
      (d) => d.doorStyle === 'cnc' || d.doorStyle === 'flat'
    )?.doorStyle;
    if (gas.hoodKind === 'hidden' && spanW >= 30 && box.type === 'wall') {
      box.doors.push({
        id: uid('door'),
        startCm: localStart,
        widthCm: spanW,
        kind: 'lift',
        doorStyle: neighborStyle,
        drawerRatios: getWallHorizontalDrawerRatios(box),
      });
    } else if (gas.hoodKind === 'hidden' && spanW >= 30 && box.type === 'wall-deep') {
      const hasLowerWall = wall.boxes.some(
        (wb) => wb.type === 'wall' && wb.offsetX < gEnd - 5 && wb.offsetX + wb.width > gStart + 5
      );
      if (!hasLowerWall) {
        box.doors.push({
          id: uid('door'),
          startCm: localStart,
          widthCm: spanW,
          kind: 'lift',
          doorStyle: neighborStyle,
          drawerRatios: getWallHorizontalDrawerRatios(box),
        });
      }
    }

    box.doors.sort((a, b) => a.startCm - b.startCm);
    updated++;
  }

  return updated;
}

/**
 * Removes previous over-sink dish-rack unit dividers/doors anchored to `[oldStartX, oldEndX]`
 * on overhead wall boxes when a sink is moved, replaced, or deleted.
 */
export function clearDishRackUnitAboveSink(
  wall: Wall,
  oldStartX: number,
  oldEndX: number,
  excludeSinkId?: string
): void {
  const siblingWallEdges = (wallBox: CabinetBox): number[] => {
    const edges: number[] = [];
    for (const a of wall.appliances) {
      if (a.id === excludeSinkId) continue;
      if (a.kind !== 'gas' && a.kind !== 'sink') continue;
      edges.push(+(a.offsetX - wallBox.offsetX).toFixed(1));
      edges.push(+(a.offsetX + a.width - wallBox.offsetX).toFixed(1));
    }
    return edges;
  };

  const overhead = getSinkUpperCabinet(wall, oldStartX, oldEndX - oldStartX);
  for (const box of overhead ? [overhead] : wall.boxes) {
    if (box.type !== 'wall' && box.type !== 'wall-deep') continue;
    if (box.linkedToBoxId) continue;
    const localStart = +(Math.max(0, oldStartX - box.offsetX)).toFixed(1);
    const localEnd = +(Math.min(box.width, oldEndX - box.offsetX)).toFixed(1);
    if (localEnd - localStart < 30) continue;

    const rmDoorIds = new Set(
      box.doors
        .filter((d) => {
          const mid = d.startCm + d.widthCm / 2;
          return (
            d.kind === 'lift' && mid >= localStart - 0.5 &&
            mid <= localEnd + 0.5 &&
            d.startCm >= localStart - 2 &&
            d.startCm + d.widthCm <= localEnd + 2
          );
        })
        .map((d) => d.id)
    );
    box.doors = box.doors.filter((d) => !rmDoorIds.has(d.id));
    box.handles = box.handles.filter((h) => !rmDoorIds.has(h.doorId));

    const keepEdges = siblingWallEdges(box);
    box.unitDividers = box.unitDividers.filter((u) => {
      const matchesOld = Math.abs(u - localStart) <= 1.8 || Math.abs(u - localEnd) <= 1.8;
      if (!matchesOld) return true;
      return keepEdges.some((ke) => Math.abs(ke - u) <= 1.8);
    });
    if (box.frames?.length) {
      box.frames = box.frames.filter(
        (f) => f.side !== 'seam' || (f.seamCm !== undefined && box.unitDividers.some((u) => Math.abs(u - f.seamCm!) < 2))
      );
    }
  }
}

/**
 * Places a kitchen appliance onto a base box:
 * - Clicking directly on an existing appliance replaces it cleanly (e.g., sink -> gas)
 * - Clicking elsewhere adds another appliance without overlapping
 * - Dishwasher / washing snaps flush to sink or edges to avoid <30cm dead slivers
 */
function getSinkUpperCabinet(wall: Wall, x: number, width: number) {
  return wall.boxes.filter(box => (box.type === 'wall' || box.type === 'wall-deep') && !box.linkedToBoxId &&
    box.offsetX <= x + 0.5 && box.offsetX + box.width >= x + Math.min(width, MIN_LIFT_DOOR_CM) - 0.5).sort((a, b) => a.elevY - b.elevY)[0];
}

function isDedicatedSinkUpper(box: CabinetBox, sink: ApplianceItem) {
  return Math.abs(box.offsetX - sink.offsetX) <= 0.6 && Math.abs(box.width - sink.width) <= 1;
}

export function ensureHorizontalDoorsAboveSink(
  wall: Wall,
  sinkOffsetX: number,
  sinkWidth: number
): number {
  const sStart = sinkOffsetX;
  const sEnd = sinkOffsetX + sinkWidth;
  let updatedCount = 0;
  const overhead = getSinkUpperCabinet(wall, sStart, sinkWidth);

  for (const box of overhead ? [overhead] : wall.boxes) {
    if (box.type !== 'wall' && box.type !== 'wall-deep') continue;
    if (box.linkedToBoxId) continue;
    const rawStart = Math.max(0, sStart - box.offsetX);
    const rawEnd = Math.min(box.width, sEnd - box.offsetX);
    let spanW = +(rawEnd - rawStart).toFixed(1);
    if (spanW < 35) continue;

    let localStart = +rawStart.toFixed(1);
    let localEnd = +rawEnd.toFixed(1);
    if (spanW < MIN_LIFT_DOOR_CM && box.width >= MIN_LIFT_DOOR_CM) {
      localEnd = Math.min(box.width, localStart + MIN_LIFT_DOOR_CM);
      localStart = Math.max(0, localEnd - MIN_LIFT_DOOR_CM);
      spanW = +(localEnd - localStart).toFixed(1);
    }

    const existing = box.doors.filter(d => d.kind === 'lift' && d.startCm >= localStart - 0.5 && d.startCm + d.widthCm <= localEnd + 0.5);
    if (existing.length && Math.abs(existing[0].startCm - localStart) <= 0.5 &&
        Math.abs(existing.reduce((end, d) => Math.max(end, d.startCm + d.widthCm), 0) - localEnd) <= 0.5) continue;
    const overlappedIds = new Set(
      box.doors
        .filter((d) => !(d.startCm + d.widthCm <= localStart + 2 || d.startCm >= localEnd - 2))
        .map((d) => d.id)
    );
    box.doors = box.doors.filter((d) => !overlappedIds.has(d.id));
    box.handles = box.handles.filter((h) => !overlappedIds.has(h.doorId));

    if (localStart > 2 && !box.unitDividers.some((u) => Math.abs(u - localStart) < 2)) {
      box.unitDividers.push(localStart);
    }
    if (localEnd < box.width - 2 && !box.unitDividers.some((u) => Math.abs(u - localEnd) < 2)) {
      box.unitDividers.push(localEnd);
    }
    box.unitDividers.sort((a, b) => a - b);

    const wallRatios = getWallHorizontalDrawerRatios(box);
    if (spanW <= MAX_LIFT_DOOR_CM) {
      box.doors.push({
        id: uid('door'),
        startCm: localStart,
        widthCm: spanW,
        kind: 'lift',
        drawerRatios: wallRatios,
      });
    } else {
      const half = +(spanW / 2).toFixed(1);
      box.doors.push(
        { id: uid('door'), startCm: localStart, widthCm: half, kind: 'lift', drawerRatios: wallRatios },
        {
          id: uid('door'),
          startCm: +(localStart + half).toFixed(1),
          widthCm: +(spanW - half).toFixed(1),
          kind: 'lift',
          drawerRatios: wallRatios,
        }
      );
    }
    box.doors.sort((a, b) => a.startCm - b.startCm);
    updatedCount++;
  }
  return updatedCount;
}

const SINK_UNIT_CLEARANCE_CM = 1;
type ApplianceSpan = [number, number];

function protectedSinkSpans(wall: Wall, blocked: BlockedZone[]): ApplianceSpan[] {
  return wall.appliances.filter(app => app.kind === 'sink').map(sink => {
    const box = findParentBoxForAppliance(wall, sink);
    const mid = sink.offsetX + sink.width / 2 - (box?.offsetX ?? 0);
    const unit = box?.unitDividers.length ? getUnitsInBox(box, blocked).find(u => mid >= u.startCm && mid <= u.endCm) : undefined;
    const start = unit && box ? Math.min(sink.offsetX, box.offsetX + unit.startCm) : sink.offsetX;
    const end = unit && box ? Math.max(sink.offsetX + sink.width, box.offsetX + unit.endCm) : sink.offsetX + sink.width;
    return [start - SINK_UNIT_CLEARANCE_CM, end + SINK_UNIT_CLEARANCE_CM];
  });
}

function nearestClearApplianceOffset(desired: number, min: number, max: number, width: number, blockers: ApplianceSpan[]) {
  return [Math.max(min, Math.min(max, desired)), min, max, ...blockers.flatMap(([a,b]) => [a - width, b])]
    .filter(x => x >= min - 0.005 && x <= max + 0.005 &&
      blockers.every(([a,b]) => x + width <= a + 0.005 || x >= b - 0.005))
    .sort((a,b) => Math.abs(a-desired) - Math.abs(b-desired))[0];
}

export function placeApplianceWithCabinetRules(
  wall: Wall,
  allWalls: Wall[],
  kind: ApplianceKind,
  targetBox: CabinetBox,
  desiredOffsetX: number,
  cornerOwners: Record<string, string>,
  hoodKind: 'hidden' | 'chimney' = 'chimney',
  opts?: {
    sinkModel?: SinkModel;
    customWidth?: number;
    hoodModel?: HoodModel;
    washingCapacityKg?: WashingCapacityKg;
    desiredElevY?: number;
  }
): { ok: boolean; appliance?: ApplianceItem; replaced?: boolean; message: string } {
  const cfg = APPLIANCE_CONFIGS[kind];
  const sinkModel: SinkModel | undefined =
    kind === 'sink' ? opts?.sinkModel ?? 'steel-2' : undefined;
  const washingKg: WashingCapacityKg | undefined =
    kind === 'washing' ? opts?.washingCapacityKg ?? 8 : undefined;
  const width =
    opts?.customWidth ??
    (kind === 'sink' && sinkModel
      ? SINK_MODELS[sinkModel].width
      : kind === 'washing' && washingKg
      ? WASHING_CAPACITIES[washingKg].width
      : cfg.width);
  const blocked = getCornerBlockedZonesForWall(wall, allWalls, cornerOwners);

  const isBuiltIn = kind === 'builtin-oven' || kind === 'microwave';
  if (isBuiltIn && targetBox.type !== 'base' && targetBox.type !== 'tall') {
    return {
      ok: false,
      message: 'فر توکار و ماکروفر فقط روی کابینت زمینی یا کمد قدی قابل نصب هستند',
    };
  }
  if (!isBuiltIn && targetBox.type !== 'base') {
    return {
      ok: false,
      message: 'این تجهیز فقط روی باکس زمینی قابل نصب است',
    };
  }

  let elevY: number | undefined;
  if (isBuiltIn && targetBox.type === 'tall') {
    const appH = cfg.heightCm ?? (kind === 'microwave' ? 38 : 60);
    const minElev = targetBox.plinth + 15;
    const maxElev = Math.max(minElev, targetBox.height - appH - 12);
    const defaultElev = kind === 'microwave' ? Math.min(maxElev, 146) : Math.min(maxElev, 82);
    const requested = opts?.desiredElevY ?? defaultElev;
    elevY = Math.round(Math.max(minElev, Math.min(maxElev, requested)) / 5) * 5;
  }

  let minX = targetBox.offsetX;
  let maxX = targetBox.offsetX + targetBox.width - width;
  let cornerSide: 'left' | 'right' | undefined;

  if (kind === 'sink' && (sinkModel === 'corner-sink' || sinkModel?.startsWith('sink-corner-'))) {
    const junctions = detectCornerJunctions(allWalls, cornerOwners);
    const validCornerEnds: Array<'start' | 'end'> = [];

    for (const j of junctions) {
      const isA = j.wallAId === wall.id;
      const isB = j.wallBId === wall.id;
      if (!isA && !isB) continue;
      const myEnd = isA ? j.wallAEnd : j.wallBEnd;
      const otherWall = allWalls.find((w) => w.id === (isA ? j.wallBId : j.wallAId));
      const otherEnd = isA ? j.wallBEnd : j.wallAEnd;
      if (!otherWall) continue;
      const geom = analyzeCornerJunction(wall, myEnd, otherWall, otherEnd);
      if (geom.kind !== 'inside-90') continue;

      const boxCoversEnd =
        myEnd === 'start'
          ? targetBox.offsetX <= 5
          : targetBox.offsetX + targetBox.width >= wall.length - 5;
      if (boxCoversEnd && targetBox.width >= width - 1) {
        validCornerEnds.push(myEnd);
      }
    }

    if (!validCornerEnds.length) {
      return {
        ok: false,
        message: 'سینک کنج سه گوش فقط در کنج ۹۰ درجه بین دو دیوار قابل نصب است (روی وسط کابینت مجاز نیست)',
      };
    }

    const cursorMid = desiredOffsetX + width / 2;
    let bestEnd: 'start' | 'end' = validCornerEnds[0];
    let bestDist = Infinity;
    for (const ce of validCornerEnds) {
      const dist = ce === 'start' ? Math.abs(cursorMid) : Math.abs(wall.length - cursorMid);
      if (dist < bestDist) {
        bestDist = dist;
        bestEnd = ce;
      }
    }

    if (bestDist > 110) {
      return {
        ok: false,
        message: 'سینک کنج را نزدیک گوشه ۹۰ درجه قرار دهید؛ وسط کابینت قابل نصب نیست',
      };
    }

    const snappedCornerX = bestEnd === 'start' ? 0 : Math.max(0, +(wall.length - width).toFixed(1));
    cornerSide = bestEnd === 'start' ? 'left' : 'right';
    desiredOffsetX = snappedCornerX;
    minX = snappedCornerX;
    maxX = snappedCornerX;
  } else {
    for (const z of blocked) {
      if (z.tier !== 'lower') continue;
      if (z.startCm <= minX && z.endCm > minX) {
        minX = Math.max(minX, z.endCm);
      }
      if (z.endCm >= targetBox.offsetX + targetBox.width && z.startCm < targetBox.offsetX + targetBox.width) {
        maxX = Math.min(maxX, z.startCm - width);
      }
    }
  }

  if (maxX < minX) {
    return {
      ok: false,
      message: 'فضای کافی بیرون از محدوده کنج برای نصب تجهیز وجود ندارد',
    };
  }

  const desiredClamped = Math.max(minX, Math.min(maxX, Math.round(desiredOffsetX / 5) * 5));
  const clickCenter = desiredOffsetX + width / 2;

  // Check if the user clicked directly over an existing appliance -> replace it cleanly (keeping gas above builtin-oven!).
  const isMachine = kind === 'dishwasher' || kind === 'washing';
  const appHeightCm = (k: ApplianceKind) => APPLIANCE_CONFIGS[k]?.heightCm ?? 60;
  const verticalOverlap = (aElev: number, aH: number, bElev: number, bH: number) =>
    aElev < bElev + bH - 2 && aElev + aH > bElev + 2;
  const conflictsWithOther = (other: ApplianceItem, candElevY: number | undefined): boolean => {
    const otherIsBuiltIn = other.kind === 'builtin-oven' || other.kind === 'microwave';
    if (isBuiltIn) {
      if (targetBox.type === 'tall') {
        if (other.boxId !== targetBox.id && !otherIsBuiltIn) return false;
        const oElev = other.elevY ?? (other.kind === 'microwave' ? 146 : 82);
        return verticalOverlap(candElevY ?? 82, appHeightCm(kind), oElev, appHeightCm(other.kind));
      }
      // On base boxes: builtin-oven/microwave can sit inside the base carcass directly under a gas cooktop!
      return other.kind !== 'gas';
    }
    if (kind === 'gas' && otherIsBuiltIn && (other.boxId === targetBox.id || !other.boxId)) {
      return false;
    }
    if (other.boxId && other.boxId !== targetBox.id) {
      const otherBox = wall.boxes.find((b) => b.id === other.boxId);
      if (otherBox?.type === 'tall') return false;
    }
    return true;
  };

  // Snap stacked built-in microwave neatly above an existing built-in oven in a tall box if vertically close
  if (isBuiltIn && targetBox.type === 'tall' && elevY !== undefined) {
    const myH = appHeightCm(kind);
    const sameColApps = wall.appliances.filter(
      (a) =>
        (a.boxId === targetBox.id || (a.offsetX >= targetBox.offsetX - 2 && a.offsetX + a.width <= targetBox.offsetX + targetBox.width + 2)) &&
        desiredClamped < a.offsetX + a.width - 5 &&
        desiredClamped + width > a.offsetX + 5
    );
    for (const other of sameColApps) {
      const oElev = other.elevY ?? 82;
      const oH = appHeightCm(other.kind);
      if (verticalOverlap(elevY, myH, oElev, oH) && other.kind !== kind) {
        const above = oElev + oH + 4;
        const below = oElev - myH - 4;
        const maxE = targetBox.height - myH - 8;
        const minE = targetBox.plinth + 10;
        if (above <= maxE) elevY = above;
        else if (below >= minE) elevY = below;
      }
    }
  }

  const directHit = wall.appliances.find((other) => {
    if (clickCenter < other.offsetX || clickCenter > other.offsetX + other.width) return false;
    if (isMachine) return other.kind === 'dishwasher' || other.kind === 'washing';
    if (isBuiltIn) {
      if (other.kind !== 'builtin-oven' && other.kind !== 'microwave') return false;
      if (targetBox.type === 'tall') {
        const oElev = other.elevY ?? (other.kind === 'microwave' ? 146 : 82);
        return Math.abs((elevY ?? 82) - oElev) < 25;
      }
      return true;
    }
    // Countertop sink/gas: replace other countertop items, NEVER delete an under-counter builtin-oven unless replacing another gas/sink
    return other.kind !== 'builtin-oven' && other.kind !== 'microwave';
  });
  const safeMachineX = isMachine ? nearestClearApplianceOffset(desiredClamped, minX, maxX, width,
    [...protectedSinkSpans(wall, blocked),
      ...wall.appliances.filter(app => app !== directHit && app.kind !== 'sink' && conflictsWithOther(app, elevY))
        .map((app): ApplianceSpan => [app.offsetX, app.offsetX + app.width])]) : undefined;
  if (isMachine && safeMachineX === undefined) {
    return { ok: false, message: 'برای نصب تجهیز با فاصلهٔ ۱ سانتی‌متر از یونیت سینک جا نیست' };
  }

  let replaced = false;
  if (directHit) {
    replaced = true;
    const oldStart = +(directHit.offsetX - targetBox.offsetX).toFixed(1);
    const oldEnd = +(oldStart + directHit.width).toFixed(1);
    if (directHit.kind === 'gas') {
      clearHoodUnitForGas(wall, directHit.offsetX, directHit.offsetX + directHit.width, directHit.id);
    } else if (directHit.kind === 'sink') {
      clearDishRackUnitAboveSink(wall, directHit.offsetX, directHit.offsetX + directHit.width, directHit.id);
    }
    wall.appliances = wall.appliances.filter((a) => a.id !== directHit.id);
    if (targetBox.type !== 'tall') {
      const removedDoorIds = new Set(
        targetBox.doors
          .filter((d) => !(d.startCm + d.widthCm <= oldStart + 1 || d.startCm >= oldEnd - 1))
          .map((d) => d.id)
      );
      targetBox.doors = targetBox.doors.filter((d) => !removedDoorIds.has(d.id));
      targetBox.handles = targetBox.handles.filter((h) => !removedDoorIds.has(h.doorId));
      targetBox.unitDividers = targetBox.unitDividers.filter(
        (u) => Math.abs(u - oldStart) > 1.5 && Math.abs(u - oldEnd) > 1.5
      );
    }
  }

  const overlapsAny = (x: number) =>
    wall.appliances.some(
      (other) =>
        conflictsWithOther(other, elevY) &&
        x < other.offsetX + other.width - 1 &&
        x + width > other.offsetX + 1
    );

  let offsetX = safeMachineX ?? desiredClamped;

  // Smart snap for gas / sink when placed AFTER doors: align to adjacent seam/divider (<20cm) to prevent <30cm dead slivers
  if (!replaced && (kind === 'gas' || kind === 'sink') && targetBox.doors.length > 0) {
    const seamLocals = new Set<number>([
      +(minX - targetBox.offsetX).toFixed(1),
      +(maxX - targetBox.offsetX).toFixed(1),
    ]);
    for (const d of targetBox.doors) {
      seamLocals.add(+d.startCm.toFixed(1));
      seamLocals.add(+(d.startCm + d.widthCm).toFixed(1));
    }
    for (const u of targetBox.unitDividers) {
      seamLocals.add(+u.toFixed(1));
    }

    const candidates = new Set<number>([offsetX]);
    for (const seam of seamLocals) {
      const g = targetBox.offsetX + seam;
      if (Math.abs(g - desiredClamped) < 20) candidates.add(+g.toFixed(1));
      if (Math.abs(g - width - desiredClamped) < 20) candidates.add(+(g - width).toFixed(1));
    }

    const scoreCandidate = (candX: number): { deadGaps: number; minGap: number; dist: number } => {
      const ls = +(candX - targetBox.offsetX).toFixed(1);
      const le = +(ls + width).toFixed(1);
      const surviving = targetBox.doors
        .filter((d) => d.startCm + d.widthCm <= ls + 1 || d.startCm >= le - 1)
        .sort((a, b) => a.startCm - b.startCm);
      const leftNeighbor = [...surviving].reverse().find((d) => d.startCm + d.widthCm <= ls + 1);
      const rightNeighbor = surviving.find((d) => d.startCm >= le - 1);
      const lGap = leftNeighbor
        ? Math.max(0, +(ls - (leftNeighbor.startCm + leftNeighbor.widthCm)).toFixed(1))
        : ls > minX - targetBox.offsetX + 0.5 &&
          targetBox.doors.some((d) => d.startCm < ls - 0.5 && d.startCm + d.widthCm > ls + 1)
        ? +(ls - (minX - targetBox.offsetX)).toFixed(1)
        : 0;
      const rGap = rightNeighbor
        ? Math.max(0, +(rightNeighbor.startCm - le).toFixed(1))
        : le < maxX - targetBox.offsetX - 0.5 &&
          targetBox.doors.some((d) => d.startCm < le - 1 && d.startCm + d.widthCm > le + 0.5)
        ? +(maxX - targetBox.offsetX - le).toFixed(1)
        : 0;
      let deadGaps = 0;
      if (lGap > 0.5 && lGap < MIN_DOOR_CM) deadGaps++;
      if (rGap > 0.5 && rGap < MIN_DOOR_CM) deadGaps++;
      return {
        deadGaps,
        minGap: (lGap > 0.5 ? lGap : 999) + (rGap > 0.5 ? rGap : 999),
        dist: Math.abs(candX - desiredClamped),
      };
    };

    let bestX = offsetX;
    let bestScore = scoreCandidate(offsetX);
    for (const cand of candidates) {
      if (cand < minX - 0.1 || cand > maxX + 0.1) continue;
      if (overlapsAny(cand)) continue;
      const sc = scoreCandidate(cand);
      if (
        sc.deadGaps < bestScore.deadGaps ||
        (sc.deadGaps === bestScore.deadGaps && sc.dist < bestScore.dist - 0.1)
      ) {
        bestX = cand;
        bestScore = sc;
      }
    }
    offsetX = bestX;
  }

  if (overlapsAny(offsetX)) {
    let found: number | null = null;
    for (let step = 5; step <= maxX - minX; step += 5) {
      if (desiredClamped + step <= maxX && !overlapsAny(desiredClamped + step)) {
        found = desiredClamped + step;
        break;
      }
      if (desiredClamped - step >= minX && !overlapsAny(desiredClamped - step)) {
        found = desiredClamped - step;
        break;
      }
    }
    if (found === null) {
      return {
        ok: false,
        message: 'فضای خالی کافی روی این باکس نیست — جای دیگری انتخاب کنید',
      };
    }
    offsetX = found;
  }

  // When replacing a 90cm sink with 80cm gas (etc.), keep aligned cleanly if flush
  if (!isMachine && replaced && directHit && directHit.offsetX >= minX && directHit.offsetX + width <= maxX + width) {
    offsetX = Math.max(minX, Math.min(maxX, directHit.offsetX));
  }

  const localStart = +(offsetX - targetBox.offsetX).toFixed(1);
  const localEnd = +(localStart + width).toFixed(1);

  const overlappedDoors = targetBox.doors.filter(
    (d) => !(d.startCm + d.widthCm <= localStart + 1 || d.startCm >= localEnd - 1)
  );
  const overlappedDoorIds = new Set(overlappedDoors.map((d) => d.id));
  const hadLeftOverlap = overlappedDoors.some((d) => d.startCm < localStart - 0.5);
  const hadRightOverlap = overlappedDoors.some((d) => d.startCm + d.widthCm > localEnd + 0.5);

  if (targetBox.type !== 'tall' || targetBox.doors.some((d) => overlappedDoorIds.has(d.id))) {
    targetBox.doors = targetBox.doors.filter((d) => !overlappedDoorIds.has(d.id));
    targetBox.handles = targetBox.handles.filter((h) => !overlappedDoorIds.has(h.doorId));
  }

  // Clear ALL stale unit dividers strictly inside the appliance interior `(localStart + 1.5 .. localEnd - 1.5)`
  targetBox.unitDividers = targetBox.unitDividers.filter(
    (u) => u <= localStart + 1.5 || u >= localEnd - 1.5
  );
  if (targetBox.frames?.length) {
    targetBox.frames = targetBox.frames.filter(
      (f) =>
        f.side !== 'seam' ||
        f.seamCm === undefined ||
        f.seamCm <= localStart + 1.5 ||
        f.seamCm >= localEnd - 1.5
    );
  }

  if (localStart > 2 && !isDividerNearBlockedCorner(targetBox, localStart, blocked) && !targetBox.unitDividers.some((u) => Math.abs(u - localStart) < 1.5)) {
    targetBox.unitDividers.push(localStart);
  }
  if (localEnd < targetBox.width - 2 && !isDividerNearBlockedCorner(targetBox, localEnd, blocked) && !targetBox.unitDividers.some((u) => Math.abs(u - localEnd) < 1.5)) {
    targetBox.unitDividers.push(localEnd);
  }
  targetBox.unitDividers.sort((a, b) => a - b);

  // Reform 2: Heal any <30cm sliver or overlapped door hole on the left and right sides of gas/sink
  let insertedAutoPantry = false;
  if (!replaced && (kind === 'gas' || kind === 'sink')) {
    const usableLeft = +(minX - targetBox.offsetX).toFixed(1);
    const usableRight = +(maxX - targetBox.offsetX).toFixed(1);

    // Helper: find continuous hinged run adjacent to cutEdge
    const healSideGap = (side: 'left' | 'right', hadSideOverlap: boolean) => {
      const sortedDoors = [...targetBox.doors].sort((a, b) => a.startCm - b.startCm);
      if (side === 'left') {
        const leftDoors = sortedDoors.filter((d) => d.startCm + d.widthCm <= localStart + 0.5);
        const lastLeft = leftDoors[leftDoors.length - 1];
        const gapStart = lastLeft ? +(lastLeft.startCm + lastLeft.widthCm).toFixed(1) : usableLeft;
        const gap = +(localStart - gapStart).toFixed(1);
        if (gap <= 0.5) return;
        const isDeadSliver = gap < MIN_DOOR_CM;
        if (!isDeadSliver && !hadSideOverlap) return;

        // Option A: stretch single adjacent hinged door <= 60cm
        if (
          isDeadSliver &&
          lastLeft &&
          lastLeft.kind === 'door' &&
          lastLeft.hardwareKind !== 'pantry-pullout' &&
          lastLeft.widthCm + gap <= MAX_DOOR_CM + 0.1
        ) {
          lastLeft.widthCm = +(lastLeft.widthCm + gap).toFixed(1);
          return;
        }
        // Option B: 15..29cm gap directly beside gas -> insert pull-out pantry door
        if (kind === 'gas' && isDeadSliver && gap >= MIN_PANTRY_CM) {
          targetBox.doors.push({
            id: uid('door'),
            startCm: gapStart,
            widthCm: gap,
            kind: 'door',
            hardwareKind: 'pantry-pullout',
            drawerRatios: [],
          });
          insertedAutoPantry = true;
          return;
        }
        // Option C: rebalance contiguous hinged run (or fill hole >=30cm) up to localStart
        let runStart = gapStart;
        for (let i = leftDoors.length - 1; i >= 0; i--) {
          const d = leftDoors[i];
          if (d.kind !== 'door') break;
          if (i < leftDoors.length - 1 && Math.abs(d.startCm + d.widthCm - runStart) > 1.5) break;
          runStart = d.startCm;
        }
        if (localStart - runStart >= MIN_DOOR_CM) {
          equalizeSpanDoors(targetBox, runStart, localStart);
        }
      } else {
        const rightDoors = sortedDoors.filter((d) => d.startCm >= localEnd - 0.5);
        const firstRight = rightDoors[0];
        const gapEnd = firstRight ? +firstRight.startCm.toFixed(1) : usableRight;
        const gap = +(gapEnd - localEnd).toFixed(1);
        if (gap <= 0.5) return;
        const isDeadSliver = gap < MIN_DOOR_CM;
        if (!isDeadSliver && !hadSideOverlap) return;

        // Option A: stretch single adjacent hinged door <= 60cm
        if (
          isDeadSliver &&
          firstRight &&
          firstRight.kind === 'door' &&
          firstRight.hardwareKind !== 'pantry-pullout' &&
          firstRight.widthCm + gap <= MAX_DOOR_CM + 0.1
        ) {
          firstRight.startCm = localEnd;
          firstRight.widthCm = +(firstRight.widthCm + gap).toFixed(1);
          return;
        }
        // Option B: 15..29cm gap directly beside gas -> insert pull-out pantry door
        if (kind === 'gas' && isDeadSliver && gap >= MIN_PANTRY_CM) {
          targetBox.doors.push({
            id: uid('door'),
            startCm: localEnd,
            widthCm: gap,
            kind: 'door',
            hardwareKind: 'pantry-pullout',
            drawerRatios: [],
          });
          insertedAutoPantry = true;
          return;
        }
        // Option C: rebalance contiguous hinged run (or fill hole >=30cm) from localEnd
        let runEnd = gapEnd;
        for (let i = 0; i < rightDoors.length; i++) {
          const d = rightDoors[i];
          if (d.kind !== 'door') break;
          if (i > 0 && Math.abs(d.startCm - runEnd) > 1.5) break;
          runEnd = +(d.startCm + d.widthCm).toFixed(1);
        }
        if (runEnd - localEnd >= MIN_DOOR_CM) {
          equalizeSpanDoors(targetBox, localEnd, runEnd);
        }
      }
    };

    healSideGap('left', hadLeftOverlap);
    healSideGap('right', hadRightOverlap);
  }

  if (kind === 'sink') {
    if (width <= 60) {
      targetBox.doors.push({
        id: uid('door'),
        startCm: localStart,
        widthCm: width,
        kind: 'door',
        drawerRatios: [],
      });
    } else {
      const half = +(width / 2).toFixed(1);
      targetBox.doors.push(
        { id: uid('door'), startCm: localStart, widthCm: half, kind: 'door', drawerRatios: [] },
        {
          id: uid('door'),
          startCm: +(localStart + half).toFixed(1),
          widthCm: +(width - half).toFixed(1),
          kind: 'door',
          drawerRatios: [],
        }
      );
    }
  } else if (kind === 'gas') {
    const hasUnderBuiltInOven = wall.appliances.some(
      (a) =>
        (a.kind === 'builtin-oven' || a.kind === 'microwave') &&
        a.offsetX < offsetX + width - 2 &&
        a.offsetX + a.width > offsetX + 2 &&
        (a.boxId === targetBox.id || !a.boxId)
    );
    if (!hasUnderBuiltInOven) {
      targetBox.doors.push({
        id: uid('door'),
        startCm: localStart,
        widthCm: width,
        kind: 'drawer',
        drawerRatios: [0.22, 0.54],
      });
    }
  }
  targetBox.doors.sort((a, b) => a.startCm - b.startCm);

  const app: ApplianceItem = {
    id: uid('app'),
    kind,
    boxId: targetBox.id,
    offsetX,
    width,
    sinkModel,
    cornerSide,
    hoodKind: kind === 'gas' ? hoodKind : undefined,
    hoodModel: kind === 'gas' && hoodKind !== 'hidden' ? opts?.hoodModel ?? 'curved-black' : undefined,
    washingCapacityKg: washingKg,
    elevY,
  };
  wall.appliances.push(app);

  if (kind === 'sink') {
    ensureHorizontalDoorsAboveSink(wall, offsetX, width);
  } else if (kind === 'gas') {
    syncHoodUnitAboveGas(wall, app);
  }

  const sinkLabel = sinkModel ? SINK_MODELS[sinkModel].shortLabel : 'سینک';
  const msgMap: Record<ApplianceKind, string> = {
    sink: replaced
      ? `تجهیز با سینک ${sinkLabel} جایگزین شد`
      : `سینک ${sinkLabel} همراه با یونیت زیرسینک نصب شد`,
    gas: replaced
      ? `تجهیز با گاز ${width}cm (متصل به هود و کشو) جایگزین شد`
      : insertedAutoPantry
      ? `گاز ${width}cm نصب شد و فاصله باریک کنار آن به سوپری تبدیل شد`
      : `گاز ${width}cm متصل به هود و کشوهای پلکانی زیر آن نصب شد`,
    dishwasher: replaced
      ? 'تجهیز با ماشین ظرفشویی ۶۰cm جایگزین شد'
      : 'فضای ۶۰cm ماشین ظرفشویی زیر صفحه ثبت شد',
    washing: replaced
      ? `تجهیز با ماشین لباسشویی ${washingKg ?? 8} کیلویی جایگزین شد`
      : `فضای ${width}cm ماشین لباسشویی زیر صفحه ثبت شد`,
    'builtin-oven': replaced
      ? 'تجهیز با فر توکار جایگزین شد'
      : targetBox.type === 'tall'
      ? 'فر توکار داخل کمد قدی نصب شد'
      : 'فر توکار داخل کابینت زمینی نصب شد',
    microwave: replaced
      ? 'تجهیز با ماکروفر توکار جایگزین شد'
      : targetBox.type === 'tall'
      ? 'ماکروفر توکار داخل کمد قدی نصب شد'
      : 'ماکروفر توکار داخل کابینت زمینی نصب شد',
  };

  return {
    ok: true,
    appliance: app,
    replaced,
    message: msgMap[kind],
  };
}

/**
 * Optimizes positions of loose 60cm built-in appliances (dishwasher/washing) inside a base box:
 * anchors them cleanly next to a sink or box edges so leftover empty gaps aren't stuck below 30cm!
 */
export function optimizeBoxWithAppliances(
  wall: Wall,
  allWalls: Wall[],
  box: CabinetBox,
  cornerOwners: Record<string, string>
): { ok: boolean; message: string } {
  const blocked = getCornerBlockedZonesForWall(wall, allWalls, cornerOwners);
  let minX = box.offsetX;
  let maxX = box.offsetX + box.width;

  for (const z of blocked) {
    if (z.tier !== 'lower') continue;
    if (z.startCm <= minX && z.endCm > minX) minX = Math.max(minX, z.endCm);
    if (z.endCm >= maxX && z.startCm < maxX) maxX = Math.min(maxX, z.startCm);
  }

  const boxApps = wall.appliances
    .filter((a) => a.offsetX >= box.offsetX - 1 && a.offsetX + a.width <= box.offsetX + box.width + 1)
    .sort((a, b) => a.offsetX - b.offsetX);

  const looseApps = boxApps.filter((a) => a.kind === 'dishwasher' || a.kind === 'washing');
  if (!looseApps.length) {
    return { ok: false, message: 'ظرفشویی یا لباسشویی روی این باکس وجود ندارد' };
  }

  const sinkSpans = protectedSinkSpans(wall, blocked);
  const occupied: ApplianceSpan[] = [
    ...sinkSpans,
    ...wall.appliances.filter(app => !looseApps.includes(app) && app.kind !== 'sink')
      .map((app): ApplianceSpan => [app.offsetX, app.offsetX + app.width]),
  ];
  const plan = new Map<ApplianceItem, number>();
  for (const app of looseApps) {
    const adjacent = sinkSpans.flatMap(([a,b]) => [a - app.width, b])
      .sort((a,b) => Math.abs(a - app.offsetX) - Math.abs(b - app.offsetX));
    const offset = adjacent.find(x => x >= minX && x + app.width <= maxX &&
      occupied.every(([a,b]) => x + app.width <= a + 0.005 || x >= b - 0.005))
      ?? nearestClearApplianceOffset(app.offsetX, minX, maxX - app.width, app.width, occupied);
    if (offset === undefined) {
      return { ok: false, message: 'برای چیدمان تجهیزات با فاصلهٔ ۱ سانتی‌متر از یونیت سینک جا نیست' };
    }
    plan.set(app, offset);
    occupied.push([offset, offset + app.width]);
  }

  for (const [app, offset] of plan) {
    if (Math.abs(app.offsetX - offset) < 0.005) continue;
    const oldStart = app.offsetX - box.offsetX;
    const oldEnd = oldStart + app.width;
    box.unitDividers = box.unitDividers.filter(u =>
      Math.abs(u - oldStart) > 1.5 && Math.abs(u - oldEnd) > 1.5 ||
      sinkSpans.some(([a,b]) => Math.abs(box.offsetX + u - a - SINK_UNIT_CLEARANCE_CM) <= 0.1 ||
        Math.abs(box.offsetX + u - b + SINK_UNIT_CLEARANCE_CM) <= 0.1));
    app.offsetX = offset;
    const start = +(offset - box.offsetX).toFixed(1);
    const end = +(start + app.width).toFixed(1);
    const removed = new Set(box.doors.filter(d => d.startCm + d.widthCm > start + 1 && d.startCm < end - 1).map(d => d.id));
    box.doors = box.doors.filter(d => !removed.has(d.id));
    box.handles = box.handles.filter(h => !removed.has(h.doorId));
    if (start > 2 && !box.unitDividers.includes(start)) box.unitDividers.push(start);
    if (end < box.width - 2 && !box.unitDividers.includes(end)) box.unitDividers.push(end);
  }

  box.unitDividers.sort((a, b) => a - b);
  return { ok: true, message: 'جای ماشین ظرفشویی/لباسشویی بدون پرتی فضا بهینه‌سازی شد' };
}

function carveBoxAroundInterval(
  box: CabinetBox,
  cutStart: number,
  cutEnd: number
): CabinetBox[] {
  const bStart = box.offsetX;
  const bEnd = box.offsetX + box.width;
  if (cutEnd <= bStart + 1 || cutStart >= bEnd - 1) return [box];

  const originalHadDoors = box.doors.length > 0;
  const out: CabinetBox[] = [];

  // Left remainder (cut edge is right = leftCopy.width)
  const leftW = Math.round(cutStart - bStart);
  if (leftW >= MIN_DOOR_CM) {
    const leftCopy: CabinetBox = JSON.parse(JSON.stringify(box));
    leftCopy.width = leftW;
    if (leftCopy.frames?.length) {
      leftCopy.frames = leftCopy.frames.filter((f) => f.side !== 'right');
    }
    clampBoxInternalsAfterResize(leftCopy);
    // Strip orphaned non-structural unitDividers within <25cm of the cut edge
    leftCopy.unitDividers = leftCopy.unitDividers.filter(
      (u) => u <= leftCopy.width - 25 || isStructuralDivider(leftCopy, u)
    );
    if (originalHadDoors) {
      leftCopy.doors.sort((a, b) => a.startCm - b.startCm);
      const lastDoor = leftCopy.doors[leftCopy.doors.length - 1];
      const cutGap = +(leftCopy.width - (lastDoor ? lastDoor.startCm + lastDoor.widthCm : 0)).toFixed(1);
      if (cutGap > 0.5) {
        if (lastDoor && lastDoor.kind === 'door') {
          let spanStart = lastDoor.startCm;
          for (let i = leftCopy.doors.length - 2; i >= 0; i--) {
            const d = leftCopy.doors[i];
            if (d.kind !== 'door') break;
            if (Math.abs(d.startCm + d.widthCm - spanStart) > 1.5) break;
            if (leftCopy.unitDividers.some((u) => Math.abs(u - spanStart) <= 1.8 && isStructuralDivider(leftCopy, u))) {
              break;
            }
            spanStart = d.startCm;
          }
          equalizeSpanDoors(leftCopy, spanStart, leftCopy.width);
        } else if (!lastDoor && leftCopy.width >= MIN_DOOR_CM) {
          equalizeSpanDoors(leftCopy, 0, leftCopy.width);
        }
      }
    }
    out.push(leftCopy);
  }

  // Right remainder (cut edge is left = 0)
  const rightW = Math.round(bEnd - cutEnd);
  if (rightW >= MIN_DOOR_CM) {
    const shift = Math.round(cutEnd - bStart);
    const rightCopy: CabinetBox = JSON.parse(JSON.stringify(box));
    rightCopy.id = uid('box');
    rightCopy.offsetX = Math.round(cutEnd);
    rightCopy.width = rightW;
    // Clip any door straddling the cut edge cleanly rather than dropping blindly
    const shiftedDoors: DoorUnit[] = [];
    for (const d of rightCopy.doors) {
      const ns = +(d.startCm - shift).toFixed(1);
      const ne = +(ns + d.widthCm).toFixed(1);
      if (ne <= 0.5 || ns >= rightW - 0.5) continue;
      if (ns < 0) {
        const clippedW = +(Math.min(rightW, ne)).toFixed(1);
        const minReq = d.hardwareKind === 'pantry-pullout' ? MIN_PANTRY_CM : MIN_DOOR_CM;
        if (clippedW >= minReq - 0.5) {
          shiftedDoors.push({ ...d, startCm: 0, widthCm: clippedW });
        }
      } else {
        shiftedDoors.push({ ...d, startCm: ns });
      }
    }
    rightCopy.doors = shiftedDoors;
    rightCopy.unitDividers = rightCopy.unitDividers
      .map((u) => +(u - shift).toFixed(1))
      .filter((u) => u > 2 && u < rightW - 2);
    rightCopy.shelves = rightCopy.shelves
      .map((s) => ({
        ...s,
        startCm: Math.max(0, +(s.startCm - shift).toFixed(1)),
        endCm: Math.min(rightW, +(s.endCm - shift).toFixed(1)),
      }))
      .filter((s) => s.endCm - s.startCm >= 15);
    if (rightCopy.frames?.length) {
      rightCopy.frames = rightCopy.frames
        .filter((f) => f.side !== 'left')
        .map((f) => (f.side === 'seam' && f.seamCm !== undefined ? { ...f, seamCm: +(f.seamCm - shift).toFixed(1) } : f));
    }
    clampBoxInternalsAfterResize(rightCopy);
    // Strip orphaned non-structural unitDividers within <25cm of the cut edge (u < 25)
    rightCopy.unitDividers = rightCopy.unitDividers.filter(
      (u) => u >= 25 || isStructuralDivider(rightCopy, u)
    );
    if (originalHadDoors) {
      rightCopy.doors.sort((a, b) => a.startCm - b.startCm);
      const firstDoor = rightCopy.doors[0];
      const cutGap = +(firstDoor ? firstDoor.startCm : rightCopy.width).toFixed(1);
      if (cutGap > 0.5) {
        if (firstDoor && firstDoor.kind === 'door') {
          let spanEnd = +(firstDoor.startCm + firstDoor.widthCm).toFixed(1);
          for (let i = 1; i < rightCopy.doors.length; i++) {
            const d = rightCopy.doors[i];
            if (d.kind !== 'door') break;
            if (Math.abs(d.startCm - spanEnd) > 1.5) break;
            if (rightCopy.unitDividers.some((u) => Math.abs(u - spanEnd) <= 1.8 && isStructuralDivider(rightCopy, u))) {
              break;
            }
            spanEnd = +(d.startCm + d.widthCm).toFixed(1);
          }
          equalizeSpanDoors(rightCopy, 0, spanEnd);
        } else if (!firstDoor && rightCopy.width >= MIN_DOOR_CM) {
          equalizeSpanDoors(rightCopy, 0, rightCopy.width);
        }
      }
    }
    out.push(rightCopy);
  }
  return out;
}

/**
 * Auto-carves overlapping lower/upper cabinets (`base`, `wall`, `wall-deep`, or optionally all tiers for fridge)
 * and removes trapped appliances when placing or dragging a full-height unit (`tall` / `fridge`).
 */
export function carveBoxesForPlacedBox(
  wall: Wall,
  placer: CabinetBox,
  options?: { includeFullHeight?: boolean }
): { carved: boolean; carvedCount: number } {
  const cutStart = placer.offsetX;
  const cutEnd = placer.offsetX + placer.width;
  const pElev = placer.elevY;
  const pTop = placer.elevY + placer.height;
  let carvedCount = 0;

  const nextBoxes: CabinetBox[] = [];
  for (const b of wall.boxes) {
    if (b.id === placer.id || b.linkedToBoxId === placer.id) {
      nextBoxes.push(b);
      continue;
    }
    const isStandardTier = b.type === 'base' || b.type === 'wall' || b.type === 'wall-deep';
    if (!options?.includeFullHeight && !isStandardTier) {
      nextBoxes.push(b);
      continue;
    }
    const overlapsHoriz = cutStart < b.offsetX + b.width - 1 && cutEnd > b.offsetX + 1;
    const overlapsVert = pElev < b.elevY + b.height - 1 && pTop > b.elevY + 1;
    if (!overlapsHoriz || (!options?.includeFullHeight && !overlapsVert)) {
      nextBoxes.push(b);
      continue;
    }
    carvedCount++;
    nextBoxes.push(...carveBoxAroundInterval(b, cutStart, cutEnd));
  }
  wall.boxes = nextBoxes;

  if (carvedCount > 0 || placer.type === 'tall' || placer.type === 'fridge') {
    wall.appliances = wall.appliances.filter(
      (a) => a.offsetX + a.width <= cutStart + 1 || a.offsetX >= cutEnd - 1
    );
  }

  return { carved: carvedCount > 0, carvedCount };
}

/**
 * Places a Fridge anywhere along a wall that has backing wall and no door/column clash.
 * If existing base/wall cabinets sit there, automatically carves/splits them around the fridge!
 */
export function placeFridgeOnWall(
  wall: Wall,
  allWalls: Wall[],
  model: FridgeModel,
  desiredOffsetX: number,
  cornerOwners: Record<string, string>,
  hasFrame = true,
  settings?: ProjectSettings
): { ok: boolean; fridgeId?: string; carved?: boolean; message: string } {
  const cfg = FRIDGE_MODELS[model];
  const width = cfg.width + (hasFrame ? FRIDGE_FRAME_CM * 2 + 2 : 0);
  const fridgeTotalHeight = cfg.height + (hasFrame ? FRIDGE_FRAME_CM : 0);
  const blocked = getCornerBlockedZonesForWall(wall, allWalls, cornerOwners);

  let offsetX = Math.round(desiredOffsetX / 5) * 5;

  for (const z of blocked) {
    if (z.tier !== 'lower') continue;
    if (offsetX < z.endCm && offsetX + width > z.startCm) {
      if (z.startCm <= 2) offsetX = Math.max(offsetX, z.endCm);
      else offsetX = Math.min(offsetX, z.startCm - width);
    }
  }
  const collidingOp = findCollidingOpening(wall, offsetX, offsetX + width, 0, fridgeTotalHeight);
  if (collidingOp) {
    return { ok: false, message: 'یخچال با پنجره، درب یا ستون دیوار تداخل دارد' };
  }

  const cutStart = offsetX;
  const cutEnd = offsetX + width;

  if (
    wall.boxes.some(
      (b) => b.type === 'fridge' && cutStart < b.offsetX + b.width - 1 && cutEnd > b.offsetX + 1
    )
  ) {
    return {
      ok: false,
      message: 'در این محل قبلاً یخچال قرار دارد (ابتدا با پاک‌کن حذف کنید)',
    };
  }

  // Carve / split ANY overlapping cabinets across all tiers (base, wall, wall-deep, tall, closet)!
  let carved = false;
  const nextBoxes: CabinetBox[] = [];
  for (const b of wall.boxes) {
    const overlapsHoriz = cutStart < b.offsetX + b.width - 1 && cutEnd > b.offsetX + 1;
    if (!overlapsHoriz) {
      nextBoxes.push(b);
      continue;
    }
    carved = true;
    nextBoxes.push(...carveBoxAroundInterval(b, cutStart, cutEnd));
  }
  wall.boxes = nextBoxes;

  // Remove any appliances trapped in the carved fridge span
  wall.appliances = wall.appliances.filter(
    (a) => a.offsetX + a.width <= cutStart + 1 || a.offsetX >= cutEnd - 1
  );

  const fridge = createEmptyBox('fridge', offsetX, width, {
    hasFridgeFrame: hasFrame,
    fridgeModel: model,
    settings,
  });
  wall.boxes.push(fridge);

  const topAlign = Math.max(fridge.height + 30, getWallTopAlignmentCm(wall));
  const overH = Math.max(30, topAlign - fridge.height);
  const over = createEmptyBox('wall-deep', offsetX, width, { settings });
  over.name = 'بالای یخچال';
  over.elevY = fridge.height;
  over.height = overH;
  over.linkedToBoxId = fridge.id;
  over.doors = [
    {
      id: uid('door'),
      startCm: 0,
      widthCm: fridge.width,
      kind: 'lift',
      drawerRatios: [],
    },
  ];
  wall.boxes.push(over);

  return {
    ok: true,
    fridgeId: fridge.id,
    carved,
    message: carved
      ? `یخچال ${cfg.label} با فریم ۵cm درج شد و باکس‌های محل آن برش خوردند`
      : `یخچال ${cfg.label} همراه با باکس فریم ۵cm و کابینت بالا اضافه شد`,
  };
}

/**
 * Checks if a fridge box has adjacent cabinets on either side so it gets enclosure frames,
 * and ensures an over-fridge horizontal cabinet aligns with the wall cabinet top!
 */
export function getWallTopAlignmentCm(wall: Wall): number {
  const wallCabs = wall.boxes.filter(
    (b) => b.type === 'wall' || b.type === 'wall-deep' || b.type === 'tall'
  );
  if (!wallCabs.length) return WALL_LOWER_ELEV_CM + BOX_PRESETS.wall.height; // 220cm
  return Math.max(...wallCabs.map((b) => b.elevY + b.height));
}

export function doesFridgeTouchCabinet(wall: Wall, fridge: CabinetBox): boolean {
  return wall.boxes.some((other) => {
    if (other.id === fridge.id) return false;
    const gapLeft = Math.abs(other.offsetX + other.width - fridge.offsetX);
    const gapRight = Math.abs(fridge.offsetX + fridge.width - other.offsetX);
    return gapLeft <= 6 || gapRight <= 6;
  });
}

/**
 * Resizes a door inside a box while preventing overlap with neighbors and staying in 30..60cm
 */
export function resizeDoorSafely(
  box: CabinetBox,
  doorId: string,
  newWidthCm: number,
  blockedZones: BlockedZone[]
): number {
  const sorted = [...box.doors].sort((a, b) => a.startCm - b.startCm);
  const idx = sorted.findIndex((d) => d.id === doorId);
  if (idx === -1) return newWidthCm;

  const door = sorted[idx];
  const oldRightEdge = +(door.startCm + door.widthCm).toFixed(1);
  const nextDoor = idx < sorted.length - 1 ? sorted[idx + 1] : null;

  let maxRight = box.width;
  if (nextDoor) maxRight = Math.min(maxRight, nextDoor.startCm);

  const boxTier =
    box.type === 'wall'
      ? 'wall-lower'
      : box.type === 'wall-deep'
      ? 'wall-upper'
      : 'lower';
  for (const z of blockedZones) {
    const tierMatches =
      z.tier === boxTier ||
      ((box.type === 'tall' || box.type === 'closet') && z.tier === 'lower');
    if (!tierMatches) continue;
    const localStart = z.startCm - box.offsetX;
    if (localStart >= door.startCm + MIN_DOOR_CM - 1) {
      maxRight = Math.min(maxRight, localStart);
    }
  }

  const isWall = box.type === 'wall' || box.type === 'wall-deep';
  const minDoor =
    door.kind === 'lift' && isWall
      ? MIN_LIFT_DOOR_CM
      : door.kind === 'drawer'
      ? DRAWER_MIN_CM
      : MIN_DOOR_CM;
  const maxAllowedW = Math.min(
    door.kind === 'lift' && isWall ? MAX_LIFT_DOOR_CM : door.kind === 'drawer' ? DRAWER_MAX_CM : MAX_DOOR_CM,
    Math.max(minDoor, maxRight - door.startCm)
  );
  const clamped = Math.max(minDoor, Math.min(maxAllowedW, Math.round(newWidthCm)));
  door.widthCm = clamped;

  const newRightEdge = +(door.startCm + clamped).toFixed(1);
  box.unitDividers = box.unitDividers
    .map((u) => (Math.abs(u - oldRightEdge) < 2 ? newRightEdge : u))
    .filter((u) => u > 2 && u < box.width - 2);

  return clamped;
}

/**
 * Resizes a drawer stack (`kind === 'drawer'`) from either its left or right handle within [40cm .. 110cm],
 * moving all drawer rows together and keeping neighboring doors/unitDividers/shelves synchronized.
 */
export function resizeDrawerUnitWidthCm(
  box: CabinetBox,
  doorId: string,
  edge: 'left' | 'right',
  desiredWidthCm: number,
  blockedZones: BlockedZone[] = []
): { ok: boolean; widthCm: number; message?: string } {
  const sorted = [...box.doors].sort((a, b) => a.startCm - b.startCm);
  const idx = sorted.findIndex((d) => d.id === doorId);
  if (idx === -1) return { ok: false, widthCm: 0 };
  const door = sorted[idx];
  if (door.kind !== 'drawer') return { ok: false, widthCm: door.widthCm };

  const isWall = box.type === 'wall' || box.type === 'wall-deep';
  const usable = getBoxUsableFrontSpan(box, blockedZones);
  const oldStart = door.startCm;
  const oldEnd = +(door.startCm + door.widthCm).toFixed(1);
  const targetW = Math.max(DRAWER_MIN_CM, Math.min(DRAWER_MAX_CM, Math.round(desiredWidthCm)));

  if (edge === 'right') {
    const rightNeighbor = idx < sorted.length - 1 ? sorted[idx + 1] : null;
    if (rightNeighbor && Math.abs(rightNeighbor.startCm - oldEnd) <= 1.5) {
      const rMin = rightNeighbor.kind === 'lift' && isWall ? MIN_LIFT_DOOR_CM : rightNeighbor.kind === 'drawer' ? DRAWER_MIN_CM : MIN_DOOR_CM;
      const rMax = rightNeighbor.kind === 'lift' && isWall ? MAX_LIFT_DOOR_CM : rightNeighbor.kind === 'drawer' ? DRAWER_MAX_CM : MAX_DOOR_CM;
      const rightEdgeFixed = +(rightNeighbor.startCm + rightNeighbor.widthCm).toFixed(1);
      const maxEndFromRight = rightEdgeFixed - rMin;
      const minEndFromRight = rightEdgeFixed - rMax;
      const clampedW = Math.max(
        DRAWER_MIN_CM,
        Math.min(DRAWER_MAX_CM, Math.min(maxEndFromRight - oldStart, Math.max(minEndFromRight - oldStart, targetW)))
      );
      const nextEnd = +(oldStart + clampedW).toFixed(1);
      const delta = +(nextEnd - oldEnd).toFixed(1);
      if (Math.abs(delta) < 0.5) return { ok: true, widthCm: door.widthCm };
      door.widthCm = clampedW;
      rightNeighbor.startCm = nextEnd;
      rightNeighbor.widthCm = +(rightEdgeFixed - nextEnd).toFixed(1);
      box.unitDividers = box.unitDividers
        .map((u) => (Math.abs(u - oldEnd) < 2 ? nextEnd : u))
        .filter((u) => u > 2 && u < box.width - 2);
      if (!box.unitDividers.some((u) => Math.abs(u - nextEnd) < 1.8) && nextEnd < box.width - 2) {
        box.unitDividers.push(nextEnd);
      }
      box.unitDividers.sort((a, b) => a - b);
      return { ok: true, widthCm: clampedW };
    }

    const maxRight = rightNeighbor ? Math.min(usable.endCm, rightNeighbor.startCm) : usable.endCm;
    const clampedW = Math.max(DRAWER_MIN_CM, Math.min(DRAWER_MAX_CM, Math.min(maxRight - oldStart, targetW)));
    const nextEnd = +(oldStart + clampedW).toFixed(1);
    door.widthCm = clampedW;
    box.unitDividers = box.unitDividers
      .map((u) => (Math.abs(u - oldEnd) < 2 ? nextEnd : u))
      .filter((u) => u > 2 && u < box.width - 2);
    return { ok: true, widthCm: clampedW };
  }

  // Left handle drag -> keep right edge fixed and adjust startCm / widthCm
  const leftNeighbor = idx > 0 ? sorted[idx - 1] : null;
  if (leftNeighbor && Math.abs(leftNeighbor.startCm + leftNeighbor.widthCm - oldStart) <= 1.5) {
    const lMin = leftNeighbor.kind === 'lift' && isWall ? MIN_LIFT_DOOR_CM : leftNeighbor.kind === 'drawer' ? DRAWER_MIN_CM : MIN_DOOR_CM;
    const lMax = leftNeighbor.kind === 'lift' && isWall ? MAX_LIFT_DOOR_CM : leftNeighbor.kind === 'drawer' ? DRAWER_MAX_CM : MAX_DOOR_CM;
    const maxWFromLeft = oldEnd - (leftNeighbor.startCm + lMin);
    const minWFromLeft = oldEnd - (leftNeighbor.startCm + lMax);
    const clampedW = Math.max(
      DRAWER_MIN_CM,
      Math.min(DRAWER_MAX_CM, Math.min(maxWFromLeft, Math.max(minWFromLeft, targetW)))
    );
    const nextStart = +(oldEnd - clampedW).toFixed(1);
    if (Math.abs(nextStart - oldStart) < 0.5) return { ok: true, widthCm: door.widthCm };
    door.startCm = nextStart;
    door.widthCm = clampedW;
    leftNeighbor.widthCm = +(nextStart - leftNeighbor.startCm).toFixed(1);
    box.unitDividers = box.unitDividers
      .map((u) => (Math.abs(u - oldStart) < 2 ? nextStart : u))
      .filter((u) => u > 2 && u < box.width - 2);
    if (!box.unitDividers.some((u) => Math.abs(u - nextStart) < 1.8) && nextStart > 2) {
      box.unitDividers.push(nextStart);
    }
    box.unitDividers.sort((a, b) => a - b);
    return { ok: true, widthCm: clampedW };
  }

  const minLeft = leftNeighbor ? Math.max(usable.startCm, leftNeighbor.startCm + leftNeighbor.widthCm) : usable.startCm;
  const maxW = oldEnd - minLeft;
  const clampedW = Math.max(DRAWER_MIN_CM, Math.min(DRAWER_MAX_CM, Math.min(maxW, targetW)));
  const nextStart = +(oldEnd - clampedW).toFixed(1);
  door.startCm = nextStart;
  door.widthCm = clampedW;
  box.unitDividers = box.unitDividers
    .map((u) => (Math.abs(u - oldStart) < 2 ? nextStart : u))
    .filter((u) => u > 2 && u < box.width - 2);
  return { ok: true, widthCm: clampedW };
}

/**
 * Coupled seam resize: drags the seam between `leftDoorId` and its immediately adjacent right neighbor
 * so widening one shrinks the neighbor by the exact same amount!
 */
export function resizeDoorSeamCoupled(
  box: CabinetBox,
  leftDoorId: string,
  deltaCm: number
): number {
  const sorted = [...box.doors].sort((a, b) => a.startCm - b.startCm);
  const idx = sorted.findIndex((d) => d.id === leftDoorId);
  if (idx === -1 || idx >= sorted.length - 1) return 0;

  const left = sorted[idx];
  const right = sorted[idx + 1];
  const seamOld = +(left.startCm + left.widthCm).toFixed(1);
  if (Math.abs(right.startCm - seamOld) > 1.5) return 0;

  const isWall = box.type === 'wall' || box.type === 'wall-deep';
  const leftMin = left.kind === 'lift' && isWall ? MIN_LIFT_DOOR_CM : MIN_DOOR_CM;
  const rightMin = right.kind === 'lift' && isWall ? MIN_LIFT_DOOR_CM : MIN_DOOR_CM;
  const leftMax = left.kind === 'lift' && isWall ? MAX_LIFT_DOOR_CM : left.kind === 'drawer' ? 110 : MAX_DOOR_CM;
  const rightMax = right.kind === 'lift' && isWall ? MAX_LIFT_DOOR_CM : right.kind === 'drawer' ? 110 : MAX_DOOR_CM;

  const minDelta = Math.max(leftMin - left.widthCm, right.widthCm - rightMax);
  const maxDelta = Math.min(leftMax - left.widthCm, right.widthCm - rightMin);
  const applied = Math.round(Math.max(minDelta, Math.min(maxDelta, deltaCm)));

  left.widthCm = +(left.widthCm + applied).toFixed(1);
  right.startCm = +(left.startCm + left.widthCm).toFixed(1);
  right.widthCm = +(right.widthCm - applied).toFixed(1);

  const seamNew = right.startCm;
  box.unitDividers = box.unitDividers
    .map((u) => (Math.abs(u - seamOld) < 2 ? seamNew : u))
    .filter((u) => u > 2 && u < box.width - 2);

  if (box.frames?.length) {
    box.frames.forEach((f) => {
      if (f.side === 'seam' && f.seamCm !== undefined && Math.abs(f.seamCm - seamOld) < 2) {
        f.seamCm = seamNew;
      }
    });
  }

  box.shelves = box.shelves
    .map((sh) => ({
      ...sh,
      startCm: Math.abs(sh.startCm - seamOld) < 2 ? seamNew : sh.startCm,
      endCm: Math.abs(sh.endCm - seamOld) < 2 ? seamNew : sh.endCm,
    }))
    .filter((sh) => sh.endCm - sh.startCm >= 15);

  return applied;
}

/**
 * Removes a unit divider line cleanly while keeping attached seam frames and shelves synchronized:
 * merges shelves across adjacent valid spans when <= 125cm, or prunes shelves whose merged bay is invalid.
 */
export function removeUnitDividerWithSync(
  box: CabinetBox,
  seamCm: number,
  blockedZones: BlockedZone[] = []
): { ok: boolean; message: string } {
  const idx = box.unitDividers.findIndex((u) => Math.abs(u - seamCm) <= 2);
  if (idx === -1) {
    return { ok: false, message: 'دیواره یونیت انتخاب‌شده یافت نشد' };
  }
  const removed = box.unitDividers[idx];
  box.unitDividers.splice(idx, 1);

  if (box.frames?.length) {
    box.frames = box.frames.filter(
      (f) => f.side !== 'seam' || f.seamCm === undefined || Math.abs(f.seamCm - removed) > 2
    );
  }

  const nextUnits = getUnitsInBox(box, blockedZones);
  const nextShelves: typeof box.shelves = [];

  for (const sh of box.shelves) {
    const touchesRemoved =
      Math.abs(sh.startCm - removed) <= 2 || Math.abs(sh.endCm - removed) <= 2;
    if (!touchesRemoved) {
      nextShelves.push(sh);
      continue;
    }
    const mid = (sh.startCm + sh.endCm) / 2;
    const ownerUnit = nextUnits.find((u) => mid >= u.startCm - 0.5 && mid <= u.endCm + 0.5);
    if (!ownerUnit || !ownerUnit.canHaveShelves) {
      continue;
    }
    const alreadyMerged = nextShelves.some(
      (other) =>
        Math.abs(other.startCm - ownerUnit.startCm) <= 2 &&
        Math.abs(other.endCm - ownerUnit.endCm) <= 2 &&
        Math.abs(other.yRatio - sh.yRatio) <= 0.08
    );
    if (!alreadyMerged) {
      nextShelves.push({
        ...sh,
        startCm: ownerUnit.startCm,
        endCm: ownerUnit.endCm,
      });
    }
  }
  box.shelves = nextShelves;

  return { ok: true, message: 'دیواره یونیت و اتصالات داخلی به‌روزرسانی شد' };
}

/**
 * Evenly divides an entire box into `count` doors respecting corner blind zones
 */
export function divideBoxEvenlyRespectingCorners(
  box: CabinetBox,
  count: number,
  blockedZones: BlockedZone[]
): { ok: boolean; message: string } {
  if (box.type === 'fridge') return { ok: false, message: 'یخچال قابل تقسیم نیست' };

  const spans = getFreeSpansInBox({ ...box, doors: [] }, blockedZones);
  if (!spans.length) return { ok: false, message: 'فضای مجاز برای درب‌گذاری وجود ندارد' };

  const mainSpan = spans.reduce((best, cur) =>
    cur.endCm - cur.startCm > best.endCm - best.startCm ? cur : best
  );
  const avail = +(mainSpan.endCm - mainSpan.startCm).toFixed(1);
  const w = +(avail / count).toFixed(1);

  if (w < MIN_DOOR_CM || w > MAX_DOOR_CM) {
    return {
      ok: false,
      message: `با ${count} بخش، عرض هر درب ${w}cm می‌شود (باید بین ۳۰ تا ۶۰cm باشد)`,
    };
  }

  box.doors = [];
  for (let i = 0; i < count; i++) {
    box.doors.push({
      id: uid('door'),
      startCm: +(mainSpan.startCm + i * w).toFixed(1),
      widthCm: i === count - 1 ? +(avail - w * (count - 1)).toFixed(1) : w,
      kind: 'door',
      drawerRatios: [],
    });
  }
  box.handles = [];
  return { ok: true, message: `فضای مجاز به ${count} درب ${w}cm تقسیم شد` };
}

/**
 * Resolves the parent base box for an appliance (using explicit boxId or geometric fallback).
 */
export function findParentBoxForAppliance(wall: Wall, app: ApplianceItem): CabinetBox | null {
  if (app.boxId) {
    const exact = wall.boxes.find((b) => b.id === app.boxId);
    if (exact) return exact;
  }
  return (
    wall.boxes.find(
      (b) =>
        (b.type === 'base' || (b.type === 'tall' && (app.kind === 'builtin-oven' || app.kind === 'microwave'))) &&
        app.offsetX >= b.offsetX - 5 &&
        app.offsetX + app.width <= b.offsetX + b.width + 5
    ) || null
  );
}

function tiersCollideForBoxMove(a: CabinetBox, b: CabinetBox): boolean {
  // Moving a tall cabinet carves overlapping base / wall / wall-deep cabinets dynamically (like fridge)
  if (a.type === 'tall' && (b.type === 'base' || b.type === 'wall' || b.type === 'wall-deep')) {
    return false;
  }
  const aFull = a.type === 'tall' || a.type === 'closet' || a.type === 'fridge';
  const bFull = b.type === 'tall' || b.type === 'closet' || b.type === 'fridge';
  if (aFull || bFull) {
    // Check vertical elevation overlap
    return a.elevY < b.elevY + b.height - 1 && a.elevY + a.height > b.elevY + 1;
  }
  return getBoxTier(a) === getBoxTier(b);
}

/**
 * Computes the free horizontal movement bounds [minX, maxX] for any cabinet/closet/fridge box
 * along a wall without overlapping same-tier boxes, colliding openings, or corner side-profiles.
 */
export function getFreeMoveRangeForBox(
  wall: Wall,
  allWalls: Wall[],
  box: CabinetBox,
  cornerOwners: Record<string, string>
): { minX: number; maxX: number; snapTargets: number[] } {
  let minX = -Infinity;
  let maxX = Infinity;
  const snapTargets: number[] = [0, wall.length - box.width];
  const linked = wall.boxes.filter(item => item.linkedToBoxId === box.id);

  const boxCenter = box.offsetX + box.width / 2;
  const blocked = getCornerBlockedZonesForWall(wall, allWalls, cornerOwners);
  const boxTier = getBoxTier(box);

  for (const z of blocked) {
    if (z.role !== 'side-profile') continue;
    const matches =
      z.tier === boxTier ||
      ((box.type === 'tall' || box.type === 'closet' || box.type === 'fridge') &&
        z.tier === 'lower');
    if (!matches) continue;
    if (z.startCm <= 2 && box.offsetX + box.width > z.startCm + 0.1) {
      minX = Math.max(minX, z.endCm);
      snapTargets.push(z.endCm);
    } else if (z.endCm >= wall.length - 2 && box.offsetX < z.endCm - 0.1) {
      maxX = Math.min(maxX, z.startCm - box.width);
      snapTargets.push(z.startCm - box.width);
    }
  }

  for (const other of wall.boxes) {
    if (other.id === box.id) continue;
    // Magnetic edge alignment works across base, wall, deep wall, tall and fridge tiers.
    // Collision constraints are evaluated separately, so a snap never overrides them.
    snapTargets.push(other.offsetX, other.offsetX + other.width);
    snapTargets.push(other.offsetX - box.width, other.offsetX + other.width - box.width);
    if (other.linkedToBoxId === box.id || box.linkedToBoxId === other.id) continue;
    if (!tiersCollideForBoxMove(box, other) && !linked.some(item => tiersCollideForBoxMove(item, other))) continue;
    const otherCenter = other.offsetX + other.width / 2;
    if (otherCenter <= boxCenter) {
      const edge = other.offsetX + other.width;
      if (edge <= box.offsetX + 5) {
        minX = Math.max(minX, edge);
        snapTargets.push(edge);
      }
    } else {
      const edge = other.offsetX - box.width;
      if (other.offsetX >= box.offsetX + box.width - 5) {
        maxX = Math.min(maxX, edge);
        snapTargets.push(edge);
      }
    }
  }

  for (const app of wall.appliances) {
    if (app.boxId === box.id) continue;
    snapTargets.push(app.offsetX, app.offsetX + app.width);
    snapTargets.push(app.offsetX - box.width, app.offsetX + app.width - box.width);
  }

  for (const op of wall.openings || []) {
    const vOverlap = [box, ...linked].some(item =>
      item.elevY < op.elevY + op.height - 1 && item.elevY + item.height > op.elevY + 1);
    if (!vOverlap) continue;
    const opCenter = op.offsetX + op.width / 2;
    if (opCenter <= boxCenter) {
      const edge = op.offsetX + op.width;
      if (edge <= box.offsetX + 5) {
        minX = Math.max(minX, edge);
        snapTargets.push(edge);
      }
    } else {
      const edge = op.offsetX - box.width;
      if (op.offsetX >= box.offsetX + box.width - 5) {
        maxX = Math.min(maxX, edge);
        snapTargets.push(edge);
      }
    }
  }

  if (maxX < minX) {
    return { minX: box.offsetX, maxX: box.offsetX, snapTargets: [box.offsetX] };
  }
  return { minX, maxX, snapTargets };
}

/**
 * Moves a cabinet box / closet / fridge hierarchically within its free space along the wall,
 * carrying all attached appliances and linked over-fridge cabinets along with it.
 */
function stackedCabinet(companion: CabinetBox, box: CabinetBox) {
  if (companion.linkedToBoxId || box.linkedToBoxId || Math.abs(companion.offsetX - box.offsetX) > 1 || Math.abs(companion.width - box.width) > 1) return false;
  const lower = box.type === 'wall' ? box : companion;
  const upper = box.type === 'wall-deep' ? box : companion;
  return lower.type === 'wall' && upper.type === 'wall-deep' && Math.abs(lower.elevY + lower.height - upper.elevY) <= 2;
}

export function moveBoxHierarchically(
  wall: Wall,
  allWalls: Wall[],
  boxId: string,
  desiredOffsetX: number,
  cornerOwners: Record<string, string>,
  opts?: { exact?: boolean }
): { offsetX: number; minX: number; maxX: number; leftGap: number; rightGap: number } | null {
  const picked = wall.boxes.find((b) => b.id === boxId);
  if (!picked || !Number.isFinite(desiredOffsetX)) return null;
  const pairedSink = wall.appliances.find(app => app.kind === 'sink' && isDedicatedSinkUpper(picked, app) &&
    getSinkUpperCabinet(wall, app.offsetX, app.width)?.id === picked.id);
  const box = (pairedSink && findParentBoxForAppliance(wall, pairedSink)) ??
    wall.boxes.find(item => item.id === picked.linkedToBoxId && item.type === 'fridge') ??
    (picked.type === 'wall-deep' ? wall.boxes.find(item => stackedCabinet(item, picked)) : undefined) ?? picked;
  const pickedOffset = picked.offsetX - box.offsetX;
  desiredOffsetX -= pickedOffset;

  let { minX, maxX, snapTargets } = getFreeMoveRangeForBox(wall, allWalls, box, cornerOwners);
  const stacked = box.type === 'wall' ? wall.boxes.find(item => stackedCabinet(item, box)) : undefined;
  if (stacked) {
    const offset = stacked.offsetX - box.offsetX;
    const range = getFreeMoveRangeForBox(wall, allWalls, stacked, cornerOwners);
    minX = Math.max(minX, range.minX - offset);
    maxX = Math.min(maxX, range.maxX - offset);
  }
  const linkedUppers = new Map<string, CabinetBox>();
  const sinksBelow: ApplianceItem[] = [];
  for (const sink of wall.appliances) {
    if (sink.kind !== 'sink') continue;
    const upper = getSinkUpperCabinet(wall, sink.offsetX, sink.width);
    if (!upper) continue;
    if (findParentBoxForAppliance(wall, sink)?.id === box.id) {
      const offset = sink.offsetX - box.offsetX;
      if (isDedicatedSinkUpper(upper, sink)) {
        const range = getFreeMoveRangeForBox(wall, allWalls, upper, cornerOwners);
        minX = Math.max(minX, range.minX - offset);
        maxX = Math.min(maxX, range.maxX - offset);
        linkedUppers.set(sink.id, upper);
      } else {
        minX = Math.max(minX, upper.offsetX - offset);
        maxX = Math.min(maxX, upper.offsetX + upper.width - Math.min(sink.width, MIN_LIFT_DOOR_CM) - offset);
      }
    } else if (upper.id === box.id) {
      minX = Math.max(minX, sink.offsetX + Math.min(sink.width, MIN_LIFT_DOOR_CM) - box.width);
      maxX = Math.min(maxX, sink.offsetX);
      sinksBelow.push(sink);
    }
  }
  if (minX > maxX) { minX = box.offsetX; maxX = box.offsetX; }
  let target = Math.max(minX, Math.min(maxX, opts?.exact ? desiredOffsetX : Math.round(desiredOffsetX / 5) * 5));

  const closestSnap = snapTargets
    .filter((st) => st >= minX && st <= maxX && Math.abs(desiredOffsetX - st) <= 4)
    .sort((a, b) => Math.abs(desiredOffsetX - a) - Math.abs(desiredOffsetX - b))[0];
  if (!opts?.exact && closestSnap !== undefined) target = Math.round(closestSnap);

  const oldX = box.offsetX;
  const delta = target - oldX;
  if (delta !== 0) {
    for (const sink of sinksBelow) clearDishRackUnitAboveSink(wall, sink.offsetX, sink.offsetX + sink.width, sink.id);
    box.offsetX = target;
    if (stacked) stacked.offsetX = +(stacked.offsetX + delta).toFixed(1);
    for (const sink of sinksBelow) ensureHorizontalDoorsAboveSink(wall, sink.offsetX, sink.width);

    // Moving a base box must move its gas/sink AND resynchronize the overhead hood/rack.
    const movedAppliances: ApplianceItem[] = [];
    for (const app of wall.appliances) {
      const belongs =
        app.boxId === box.id ||
        (!app.boxId &&
          box.type === 'base' &&
          app.offsetX >= oldX - 2 &&
          app.offsetX + app.width <= oldX + box.width + 2);
      if (belongs) {
        if (app.kind === 'gas') {
          clearHoodUnitForGas(wall, app.offsetX, app.offsetX + app.width, app.id);
        } else if (app.kind === 'sink') {
          const upper = linkedUppers.get(app.id);
          if (upper) upper.offsetX = +(upper.offsetX + delta).toFixed(1);
          else clearDishRackUnitAboveSink(wall, app.offsetX, app.offsetX + app.width, app.id);
        }
        app.boxId = box.id;
        app.offsetX = +(app.offsetX + delta).toFixed(1);
        movedAppliances.push(app);
      }
    }
    for (const app of movedAppliances) {
      if (app.kind === 'gas') syncHoodUnitAboveGas(wall, app);
      else if (app.kind === 'sink') ensureHorizontalDoorsAboveSink(wall, app.offsetX, app.width);
    }

    // Move linked over-fridge cabinet(s)
    for (const other of wall.boxes) {
      const isLinkedOver =
        other.linkedToBoxId === box.id ||
        (box.type === 'fridge' &&
          other.type === 'wall-deep' &&
          Math.abs(other.offsetX - oldX) <= 2 &&
          Math.abs(other.width - box.width) <= 2);
      if (isLinkedOver) {
        other.linkedToBoxId = box.id;
        other.offsetX = +(other.offsetX + delta).toFixed(1);
      }
    }

    if (box.type === 'tall') {
      carveBoxesForPlacedBox(wall, box);
    }
  } else if (box.type === 'tall') {
    carveBoxesForPlacedBox(wall, box);
  }

  return {
    offsetX: box.offsetX,
    minX,
    maxX,
    leftGap: Math.max(0, Math.round(box.offsetX - minX)),
    rightGap: Math.max(0, Math.round(maxX - box.offsetX)),
  };
}

/**
 * Deletes a box hierarchically along with its attached appliances and linked upper boxes (e.g. over-fridge).
 */
export function deleteBoxHierarchically(wall: Wall, boxId: string): void {
  const target = wall.boxes.find((b) => b.id === boxId);
  if (!target) return;

  const oldStart = target.offsetX;
  const oldEnd = target.offsetX + target.width;

  wall.boxes = wall.boxes.filter((b) => {
    if (b.id === boxId) return false;
    if (b.linkedToBoxId === boxId) return false;
    if (
      target.type === 'fridge' &&
      b.type === 'wall-deep' &&
      Math.abs(b.offsetX - oldStart) <= 2 &&
      Math.abs(b.width - target.width) <= 2
    ) {
      return false;
    }
    return true;
  });

  wall.appliances = wall.appliances.filter((a) => {
    if (a.boxId === boxId) return false;
    if (!a.boxId && target.type === 'base' && a.offsetX >= oldStart - 2 && a.offsetX + a.width <= oldEnd + 2) {
      return false;
    }
    return true;
  });
}

/**
 * Computes free movement bounds for an appliance inside its parent base box (or along the wall),
 * respecting corner blind zones and sibling appliances.
 */
export function getFreeMoveRangeForAppliance(
  wall: Wall,
  allWalls: Wall[],
  app: ApplianceItem,
  cornerOwners: Record<string, string>
): { minX: number; maxX: number; parentBox: CabinetBox | null; snapTargets: number[] } {
  const parentBox = findParentBoxForAppliance(wall, app);
  let minX = parentBox ? parentBox.offsetX : 0;
  let maxX = parentBox ? parentBox.offsetX + parentBox.width - app.width : wall.length - app.width;
  const snapTargets: number[] = [minX, maxX];

  const blocked = getCornerBlockedZonesForWall(wall, allWalls, cornerOwners);
  for (const z of blocked) {
    if (z.tier !== 'lower') continue;
    if (z.startCm <= minX + 2 && z.endCm > minX) {
      minX = Math.max(minX, z.endCm);
      snapTargets.push(z.endCm);
    }
    const rightBound = parentBox ? parentBox.offsetX + parentBox.width : wall.length;
    if (z.endCm >= rightBound - 2 && z.startCm < rightBound) {
      maxX = Math.min(maxX, z.startCm - app.width);
      snapTargets.push(z.startCm - app.width);
    }
  }

  const upper = app.kind === 'sink' ? getSinkUpperCabinet(wall, app.offsetX, app.width) : undefined;
  if (upper) {
    const range = isDedicatedSinkUpper(upper, app)
      ? getFreeMoveRangeForBox(wall, allWalls, upper, cornerOwners)
      : { minX: upper.offsetX, maxX: upper.offsetX + upper.width - Math.min(app.width, MIN_LIFT_DOOR_CM) };
    minX = Math.max(minX, range.minX);
    maxX = Math.min(maxX, range.maxX);
  }
  const isBuiltIn = app.kind === 'builtin-oven' || app.kind === 'microwave';
  const appCenter = app.offsetX + app.width / 2;
  for (const other of wall.appliances) {
    if (other.id === app.id) continue;
    const otherParent = findParentBoxForAppliance(wall, other);
    if (parentBox && otherParent && otherParent.id !== parentBox.id && parentBox.type !== otherParent.type) {
      continue;
    }
    const otherIsBuiltIn = other.kind === 'builtin-oven' || other.kind === 'microwave';
    if (isBuiltIn && other.kind === 'gas') continue;
    if (app.kind === 'gas' && otherIsBuiltIn) continue;
    if (isBuiltIn && parentBox?.type === 'tall' && otherIsBuiltIn) {
      const myH = APPLIANCE_CONFIGS[app.kind]?.heightCm ?? 60;
      const oH = APPLIANCE_CONFIGS[other.kind]?.heightCm ?? 60;
      const myE = app.elevY ?? 82;
      const oE = other.elevY ?? (other.kind === 'microwave' ? 146 : 82);
      if (!(myE < oE + oH - 2 && myE + myH > oE + 2)) continue;
    }
    const otherCenter = other.offsetX + other.width / 2;
    if (otherCenter <= appCenter) {
      const edge = other.offsetX + other.width;
      if (edge <= app.offsetX + 5) {
        minX = Math.max(minX, edge);
        snapTargets.push(edge);
      }
    } else {
      const edge = other.offsetX - app.width;
      if (other.offsetX >= app.offsetX + app.width - 5) {
        maxX = Math.min(maxX, edge);
        snapTargets.push(edge);
      }
    }
  }

  if (maxX < minX) {
    return { minX: app.offsetX, maxX: app.offsetX, parentBox, snapTargets: [app.offsetX] };
  }
  return { minX, maxX, parentBox, snapTargets };
}

function refitDoorSpanAfterEdgeShift(
  box: CabinetBox,
  spanStart: number,
  spanEnd: number,
  oldDoors: DoorUnit[]
): void {
  const spanW = +(spanEnd - spanStart).toFixed(1);
  if (spanW < MIN_DOOR_CM - 0.5 || !oldDoors.length) return;

  const isDrawerOrLift = oldDoors.every((d) => d.kind === 'drawer' || d.kind === 'lift');
  if (isDrawerOrLift && oldDoors.length === 1) {
    box.doors.push({
      id: uid('door'),
      startCm: +spanStart.toFixed(1),
      widthCm: spanW,
      kind: oldDoors[0].kind,
      doorStyle: oldDoors[0].doorStyle,
      drawerRatios: [...oldDoors[0].drawerRatios],
    });
    return;
  }

  let count = oldDoors.length;
  let eachW = +(spanW / count).toFixed(1);
  if (eachW < MIN_DOOR_CM) {
    count = Math.max(1, Math.floor(spanW / MIN_DOOR_CM));
    eachW = +(spanW / count).toFixed(1);
  } else if (eachW > MAX_DOOR_CM) {
    count = Math.max(1, Math.ceil(spanW / MAX_DOOR_CM));
    eachW = +(spanW / count).toFixed(1);
  }
  if (eachW < MIN_DOOR_CM - 0.1 || eachW > MAX_DOOR_CM + 0.5) return;

  for (let i = 0; i < count; i++) {
    const template = oldDoors[Math.min(i, oldDoors.length - 1)];
    const startCm = +(spanStart + i * eachW).toFixed(1);
    const widthCm =
      i === count - 1 ? +(spanEnd - startCm).toFixed(1) : eachW;
    box.doors.push({
      id: uid('door'),
      startCm,
      widthCm,
      kind: 'door',
      doorStyle: template?.doorStyle,
      hingeSide:
        count === 2
          ? i === 0
            ? 'left'
            : 'right'
          : template?.hingeSide,
      drawerBand: template?.drawerBand ? { ...template.drawerBand } : undefined,
      drawerRatios: [],
    });
  }
}

/**
 * Moves an appliance along its parent base box while keeping its linked doors/drawers,
 * unit dividers, and coupled overhead unit (Hood for Gas, Dish-rack for Sink) synchronized!
 */
export function moveApplianceHierarchically(
  wall: Wall,
  allWalls: Wall[],
  appId: string,
  desiredOffsetX: number,
  cornerOwners: Record<string, string>,
  opts?: { exact?: boolean; refitAdjacentDoors?: boolean }
): { offsetX: number; minX: number; maxX: number; leftGap: number; rightGap: number } | null {
  const app = wall.appliances.find((a) => a.id === appId);
  if (!app) return null;
  const upper = app.kind === 'sink' ? getSinkUpperCabinet(wall, app.offsetX, app.width) : undefined;
  const linkedUpper = upper && isDedicatedSinkUpper(upper, app) ? upper : undefined;
  const under = app.kind === 'sink' ? findParentBoxForAppliance(wall, app) : null;
  if (under && under.width - app.width <= 1) {
    const offset = app.offsetX - under.offsetX;
    const moved = moveBoxHierarchically(wall, allWalls, under.id, desiredOffsetX - offset, cornerOwners, opts);
    return moved && { ...moved, offsetX: app.offsetX, minX: moved.minX + offset, maxX: moved.maxX + offset };
  }

  const { minX, maxX, parentBox, snapTargets } = getFreeMoveRangeForAppliance(
    wall,
    allWalls,
    app,
    cornerOwners
  );

  let target = opts?.exact
    ? +Math.max(minX, Math.min(maxX, desiredOffsetX)).toFixed(1)
    : Math.max(minX, Math.min(maxX, Math.round(desiredOffsetX / 5) * 5));

  if (!opts?.exact) {
    for (const st of snapTargets) {
      if (st >= minX && st <= maxX && Math.abs(desiredOffsetX - st) <= 3) {
        target = Math.round(st);
        break;
      }
    }
  }

  if (app.kind === 'dishwasher' || app.kind === 'washing') {
    const protectedSpans = protectedSinkSpans(wall, getCornerBlockedZonesForWall(wall, allWalls, cornerOwners));
    const safe = nearestClearApplianceOffset(target, minX, maxX, app.width, protectedSpans);
    if (safe === undefined) return null;
    target = safe;
  }

  const oldX = app.offsetX;
  const delta = +(target - oldX).toFixed(1);

  if (Math.abs(delta) > 0.05) {
    if (app.kind === 'gas') {
      clearHoodUnitForGas(wall, oldX, oldX + app.width, app.id);
    } else if (app.kind === 'sink') {
      if (linkedUpper) linkedUpper.offsetX = +(linkedUpper.offsetX + delta).toFixed(1);
      else clearDishRackUnitAboveSink(wall, oldX, oldX + app.width, app.id);
    }

    app.offsetX = target;

    if (parentBox) {
      app.boxId = parentBox.id;
      const oldLocalStart = +(oldX - parentBox.offsetX).toFixed(1);
      const oldLocalEnd = +(oldLocalStart + app.width).toFixed(1);
      const newLocalStart = +(target - parentBox.offsetX).toFixed(1);
      const newLocalEnd = +(newLocalStart + app.width).toFixed(1);

      const siblingAppLocalRanges = wall.appliances
        .filter((other) => other.id !== app.id)
        .map((other) => ({
          start: +(other.offsetX - parentBox.offsetX).toFixed(1),
          end: +(other.offsetX + other.width - parentBox.offsetX).toFixed(1),
        }));
      const isOwnedBySiblingApp = (d: DoorUnit) => {
        const mid = d.startCm + d.widthCm / 2;
        return siblingAppLocalRanges.some((r) => mid >= r.start - 0.5 && mid <= r.end + 0.5);
      };

      // Extract the doors belonging to this appliance bay
      const linkedDoors = parentBox.doors.filter((d) => {
        const mid = d.startCm + d.widthCm / 2;
        return mid >= oldLocalStart - 1 && mid <= oldLocalEnd + 1;
      });
      const linkedIds = new Set(linkedDoors.map((d) => d.id));

      // Optionally collect contiguous doors touching old left/right edges so we refit neighboring bays cleanly
      const leftTouching: DoorUnit[] = [];
      const rightTouching: DoorUnit[] = [];
      let leftSpanStart = oldLocalStart;
      let rightSpanEnd = oldLocalEnd;

      if (opts?.refitAdjacentDoors) {
        const sortedNonLinked = parentBox.doors
          .filter((d) => !linkedIds.has(d.id) && !isOwnedBySiblingApp(d))
          .sort((a, b) => a.startCm - b.startCm);

        let curLeft = oldLocalStart;
        for (let i = sortedNonLinked.length - 1; i >= 0; i--) {
          const d = sortedNonLinked[i];
          if (Math.abs(d.startCm + d.widthCm - curLeft) <= 1.5 && d.kind === 'door') {
            leftTouching.unshift(d);
            curLeft = d.startCm;
            leftSpanStart = curLeft;
          }
        }

        let curRight = oldLocalEnd;
        for (let i = 0; i < sortedNonLinked.length; i++) {
          const d = sortedNonLinked[i];
          if (Math.abs(d.startCm - curRight) <= 1.5 && d.kind === 'door') {
            rightTouching.push(d);
            curRight = +(d.startCm + d.widthCm).toFixed(1);
            rightSpanEnd = curRight;
          }
        }
      }

      // Remove old appliance dividers & doors overlapping new slot (or refitted neighbor spans)
      const neighborDropIds = new Set([
        ...leftTouching.map((d) => d.id),
        ...rightTouching.map((d) => d.id),
      ]);
      parentBox.unitDividers = parentBox.unitDividers.filter((u) => {
        if (Math.abs(u - oldLocalStart) <= 1.8 || Math.abs(u - oldLocalEnd) <= 1.8) return false;
        // Never leave stale interior dividers inside the appliance's new span
        if (u > newLocalStart + 1.5 && u < newLocalEnd - 1.5) return false;
        if (opts?.refitAdjacentDoors) {
          if (leftTouching.length > 0 && u > leftSpanStart + 1.5 && u < newLocalStart - 1.5) return false;
          if (rightTouching.length > 0 && u > newLocalEnd + 1.5 && u < rightSpanEnd - 1.5) return false;
        }
        return true;
      });
      const overwrittenIds = new Set(
        parentBox.doors
          .filter(
            (d) =>
              !linkedIds.has(d.id) &&
              (neighborDropIds.has(d.id) ||
                !(d.startCm + d.widthCm <= newLocalStart + 1 || d.startCm >= newLocalEnd - 1))
          )
          .map((d) => d.id)
      );
      parentBox.doors = parentBox.doors.filter((d) => !overwrittenIds.has(d.id));
      parentBox.handles = parentBox.handles.filter((h) => !overwrittenIds.has(h.doorId));

      for (const shelf of parentBox.shelves) {
        if (shelf.startCm >= oldLocalStart - 1 && shelf.endCm <= oldLocalEnd + 1) {
          shelf.startCm = +(shelf.startCm + delta).toFixed(1);
          shelf.endCm = +(shelf.endCm + delta).toFixed(1);
        } else if (Math.abs(shelf.startCm - oldLocalEnd) <= 1) shelf.startCm = newLocalEnd;
        else if (Math.abs(shelf.endCm - oldLocalStart) <= 1) shelf.endCm = newLocalStart;
      }
      parentBox.shelves = parentBox.shelves.filter(shelf => shelf.endCm - shelf.startCm >= 15);

      // Shift linked doors (e.g. stepped gas drawers or sink 2-door unit) cleanly with the appliance
      for (const d of linkedDoors) {
        d.startCm = +(d.startCm + delta).toFixed(1);
      }

      if (opts?.refitAdjacentDoors) {
        if (leftTouching.length > 0) {
          refitDoorSpanAfterEdgeShift(parentBox, leftSpanStart, newLocalStart, leftTouching);
        }
        if (rightTouching.length > 0) {
          refitDoorSpanAfterEdgeShift(parentBox, newLocalEnd, rightSpanEnd, rightTouching);
        }
      }

      const moveBlocked = getCornerBlockedZonesForWall(wall, allWalls, cornerOwners);
      if (newLocalStart > 2 && !isDividerNearBlockedCorner(parentBox, newLocalStart, moveBlocked) && !parentBox.unitDividers.some((u) => Math.abs(u - newLocalStart) < 1.5)) {
        parentBox.unitDividers.push(newLocalStart);
      }
      if (
        newLocalEnd < parentBox.width - 2 &&
        !isDividerNearBlockedCorner(parentBox, newLocalEnd, moveBlocked) &&
        !parentBox.unitDividers.some((u) => Math.abs(u - newLocalEnd) < 1.5)
      ) {
        parentBox.unitDividers.push(newLocalEnd);
      }
      parentBox.unitDividers.sort((a, b) => a - b);
      parentBox.doors.sort((a, b) => a.startCm - b.startCm);
    }
  }

  if (app.kind === 'gas') {
    syncHoodUnitAboveGas(wall, app);
  } else if (app.kind === 'sink') {
    ensureHorizontalDoorsAboveSink(wall, app.offsetX, app.width);
  }

  return {
    offsetX: app.offsetX,
    minX,
    maxX,
    leftGap: Math.max(0, Math.round(app.offsetX - minX)),
    rightGap: Math.max(0, Math.round(maxX - app.offsetX)),
  };
}

/**
 * Aligns an appliance (`left`, `center`, or `right`) relative to the usable visible cabinet front
 * of its parent base box (automatically excluding corner blind zones!), moving any coupled hood
 * unit and refitting neighboring bay doors cleanly.
 */
export function alignApplianceOnBoxFront(
  wall: Wall,
  allWalls: Wall[],
  appId: string,
  pos: 'left' | 'center' | 'right',
  cornerOwners: Record<string, string>
): { ok: boolean; offsetX?: number; message: string } {
  const app = wall.appliances.find((a) => a.id === appId);
  if (!app) return { ok: false, message: 'تجهیز انتخاب‌شده یافت نشد' };

  const range = getFreeMoveRangeForAppliance(wall, allWalls, app, cornerOwners);
  // Note: range.minX is left usable boundary and range.maxX + app.width is right usable boundary!
  const usableWidth = +(range.maxX + app.width - range.minX).toFixed(1);
  if (usableWidth < app.width) {
    return { ok: false, message: 'فضای آزاد کافی روی فرانت باکس برای تراز وجود ندارد' };
  }

  const desiredX =
    pos === 'left'
      ? range.minX
      : pos === 'right'
      ? range.maxX
      : +(range.minX + (usableWidth - app.width) / 2).toFixed(1);

  const res = moveApplianceHierarchically(wall, allWalls, app.id, desiredX, cornerOwners, {
    exact: true,
    refitAdjacentDoors: true,
  });
  if (!res) return { ok: false, message: 'خطا در تراز تجهیز روی باکس' };

  const label = pos === 'center' ? 'مرکز فرانت باکس' : pos === 'right' ? 'سمت راست فرانت باکس' : 'سمت چپ فرانت باکس';
  return {
    ok: true,
    offsetX: res.offsetX,
    message:
      app.kind === 'gas'
        ? `گاز و هود روی ${label} تراز و درب‌های مجاور تنظیم شدند`
        : `تجهیز روی ${label} تراز شد`,
  };
}

/**
 * Reversibly deletes an appliance and cleanly removes the dedicated appliance doors (under-sink/drawer),
 * orphaned handles, and appliance-created unit dividers unless kept by an adjacent remaining appliance.
 */
export function deleteApplianceHierarchically(wall: Wall, appId: string): void {
  const app = wall.appliances.find((a) => a.id === appId);
  if (!app) return;

  if (app.kind === 'gas') {
    clearHoodUnitForGas(wall, app.offsetX, app.offsetX + app.width, app.id);
  } else if (app.kind === 'sink') {
    clearDishRackUnitAboveSink(wall, app.offsetX, app.offsetX + app.width, app.id);
  }

  const parentBox = findParentBoxForAppliance(wall, app);
  wall.appliances = wall.appliances.filter((a) => a.id !== appId);

  if (!parentBox) return;

  const localStart = +(app.offsetX - parentBox.offsetX).toFixed(1);
  const localEnd = +(localStart + app.width).toFixed(1);

  if (parentBox.type !== 'tall') {
    const removedDoorIds = new Set(
      parentBox.doors
        .filter((d) => {
          const mid = d.startCm + d.widthCm / 2;
          return mid >= localStart - 1 && mid <= localEnd + 1;
        })
        .map((d) => d.id)
    );
    parentBox.doors = parentBox.doors.filter((d) => !removedDoorIds.has(d.id));
    parentBox.handles = parentBox.handles.filter((h) => !removedDoorIds.has(h.doorId));
  }

  // Preserve dividers still anchored by another remaining appliance on this box
  const siblingEdges: number[] = [];
  for (const other of wall.appliances) {
    const otherParent = findParentBoxForAppliance(wall, other);
    if (otherParent?.id !== parentBox.id) continue;
    siblingEdges.push(+(other.offsetX - parentBox.offsetX).toFixed(1));
    siblingEdges.push(+(other.offsetX + other.width - parentBox.offsetX).toFixed(1));
  }

  parentBox.unitDividers = parentBox.unitDividers.filter((u) => {
    const matchesDeleted = Math.abs(u - localStart) <= 1.8 || Math.abs(u - localEnd) <= 1.8;
    if (!matchesDeleted) return true;
    return siblingEdges.some((se) => Math.abs(se - u) <= 1.8);
  });

  if (parentBox.frames?.length) {
    parentBox.frames = parentBox.frames.filter(
      (f) => f.side !== 'seam' || (f.seamCm !== undefined && parentBox.unitDividers.some((u) => Math.abs(u - f.seamCm!) < 2))
    );
  }

  if ((app.kind === 'builtin-oven' || app.kind === 'microwave') && parentBox.type === 'base') {
    const gasAbove = wall.appliances.find(
      (other) =>
        other.kind === 'gas' &&
        other.offsetX < app.offsetX + app.width - 2 &&
        other.offsetX + other.width > app.offsetX + 2
    );
    if (gasAbove) {
      const gs = +(gasAbove.offsetX - parentBox.offsetX).toFixed(1);
      const ge = +(gs + gasAbove.width).toFixed(1);
      const hasDoorInBay = parentBox.doors.some((d) => d.startCm < ge - 2 && d.startCm + d.widthCm > gs + 2);
      if (!hasDoorInBay) {
        parentBox.doors.push({
          id: uid('door'),
          startCm: gs,
          widthCm: gasAbove.width,
          kind: 'drawer',
          drawerRatios: [0.22, 0.54],
        });
        parentBox.doors.sort((a, b) => a.startCm - b.startCm);
      }
    }
  }
}

/**
 * Live-updates a placed Fridge box's model (`single-door` | `single` | `side-by-side` | `twin`)
 * and/or interior body width (in cm), resizing the box, its 5cm frame, and its linked over-fridge wall-deep box safely.
 */
export function updateFridgeBoxModelAndSize(
  wall: Wall,
  allWalls: Wall[],
  cornerOwners: Record<string, string>,
  boxId: string,
  nextModel: FridgeModel,
  nextBodyWidthCm?: number,
  nextHasFrame?: boolean
): { ok: boolean; width?: number; message: string } {
  const fridge = wall.boxes.find((b) => b.id === boxId && b.type === 'fridge');
  if (!fridge) return { ok: false, message: 'باکس یخچال یافت نشد' };

  const cfg = FRIDGE_MODELS[nextModel] ?? FRIDGE_MODELS['side-by-side'];
  const hasFrame = nextHasFrame ?? (fridge.hasFridgeFrame ?? true);
  const currentBodyW = Math.max(
    50,
    fridge.width - (fridge.hasFridgeFrame ? FRIDGE_FRAME_CM * 2 + 2 : 0)
  );
  const bodyW =
    nextBodyWidthCm !== undefined
      ? Math.max(50, Math.round(nextBodyWidthCm))
      : fridge.fridgeModel === nextModel
      ? currentBodyW
      : cfg.width;
  const targetW = bodyW + (hasFrame ? FRIDGE_FRAME_CM * 2 + 2 : 0);
  const targetH = cfg.height + (hasFrame ? FRIDGE_FRAME_CM : 0);

  // Changing the fridge is a model-selection operation, not a placement
  // rejection. Keep its visual center as stable as the wall allows, and
  // always resize the frame even when adjacent cabinets occupy that space.
  // Space optimization is a separate operation initiated by the designer.
  const preferredOffset = fridge.offsetX + (fridge.width - targetW) / 2;
  const nextOffsetX = Math.max(0, Math.round(
    Math.min(Math.max(0, wall.length - targetW), preferredOffset)
  ));
  const oldStart = fridge.offsetX;
  const oldW = fridge.width;

  fridge.fridgeModel = nextModel;
  fridge.name = `یخچال ${cfg.shortLabel}`;
  fridge.hasFridgeFrame = hasFrame;
  fridge.offsetX = nextOffsetX;
  fridge.width = targetW;
  fridge.depth = cfg.depth;
  fridge.height = targetH;
  if (fridge.doors.length > 0) {
    fridge.doors[0].startCm = 0;
    fridge.doors[0].widthCm = targetW;
  } else {
    fridge.doors = [{ id: uid('door'), startCm: 0, widthCm: targetW, kind: 'fridge', drawerRatios: [] }];
  }
  fridge.frames = hasFrame
    ? [
        { id: uid('fr'), side: 'left', widthCm: FRIDGE_FRAME_CM },
        { id: uid('fr'), side: 'right', widthCm: FRIDGE_FRAME_CM },
        { id: uid('fr'), side: 'top', widthCm: FRIDGE_FRAME_CM },
      ]
    : [];

  const linkedOvers = wall.boxes.filter(
    (other) =>
      other.linkedToBoxId === fridge.id ||
      (other.type === 'wall-deep' &&
        Math.abs(other.offsetX - oldStart) <= 2 &&
        Math.abs(other.width - oldW) <= 2)
  );
  const topAlign = Math.max(fridge.height + 30, getWallTopAlignmentCm(wall));
  for (const over of linkedOvers) {
    over.linkedToBoxId = fridge.id;
    over.offsetX = nextOffsetX;
    over.width = targetW;
    over.elevY = fridge.height;
    over.height = Math.max(30, topAlign - fridge.height);
    over.depth = fridge.overFridgeDepthMode === 'flush'
      ? (fridge.fridgeConcealed ? fridge.depth :
        (fridge.fridgeFrameDepthCm === 80 ? 80 : 60) + 15)
      : 60;
    if (over.doors.length > 0) {
      over.doors[0].startCm = 0;
      over.doors[0].widthCm = targetW;
    }
  }

  return {
    ok: true,
    width: targetW,
    message: `یخچال به ${cfg.shortLabel} (${bodyW}cm) به‌روزرسانی شد`,
  };
}

/**
 * Resizes a gas cooktop (`width`: 30..90cm) cleanly inside its parent base box,
 * updating under-gas stepped drawer bay, neighboring doors, and the connected hood bay above.
 */
export function resizeGasApplianceWidth(
  wall: Wall,
  allWalls: Wall[],
  cornerOwners: Record<string, string>,
  appId: string,
  nextWidthCm: number
): { ok: boolean; width?: number; message: string } {
  const gas = wall.appliances.find((a) => a.id === appId && a.kind === 'gas');
  if (!gas) return { ok: false, message: 'گاز انتخاب‌شده یافت نشد' };

  const parentBox = findParentBoxForAppliance(wall, gas);
  const blocked = getCornerBlockedZonesForWall(wall, allWalls, cornerOwners);
  let boundLeft = parentBox ? parentBox.offsetX : 0;
  let boundRight = parentBox ? parentBox.offsetX + parentBox.width : wall.length;

  for (const z of blocked) {
    if (z.tier !== 'lower') continue;
    if (z.startCm <= boundLeft + 2 && z.endCm > boundLeft) boundLeft = Math.max(boundLeft, z.endCm);
    if (z.endCm >= boundRight - 2 && z.startCm < boundRight) boundRight = Math.min(boundRight, z.startCm);
  }
  const gasCenter = gas.offsetX + gas.width / 2;
  for (const other of wall.appliances) {
    if (other.id === gas.id) continue;
    if (other.kind === 'builtin-oven' || other.kind === 'microwave') continue;
    const oc = other.offsetX + other.width / 2;
    if (oc <= gasCenter) boundLeft = Math.max(boundLeft, other.offsetX + other.width);
    else boundRight = Math.min(boundRight, other.offsetX);
  }

  if (nextWidthCm > boundRight - boundLeft + 0.5) {
    return {
      ok: false,
      message: `فضای کافی برای گاز ${nextWidthCm}cm روی این باکس نیست`,
    };
  }

  const oldX = gas.offsetX;
  const oldW = gas.width;
  clearHoodUnitForGas(wall, oldX, oldX + oldW, gas.id);

  const centeredX = +(gas.offsetX + (oldW - nextWidthCm) / 2).toFixed(1);
  const newX = +Math.max(boundLeft, Math.min(boundRight - nextWidthCm, centeredX)).toFixed(1);

  if (parentBox) {
    const oldLocalStart = +(oldX - parentBox.offsetX).toFixed(1);
    const oldLocalEnd = +(oldLocalStart + oldW).toFixed(1);
    const newLocalStart = +(newX - parentBox.offsetX).toFixed(1);
    const newLocalEnd = +(newLocalStart + nextWidthCm).toFixed(1);

    const linkedDoors = parentBox.doors.filter((d) => {
      const mid = d.startCm + d.widthCm / 2;
      return mid >= oldLocalStart - 1 && mid <= oldLocalEnd + 1;
    });
    const linkedIds = new Set(linkedDoors.map((d) => d.id));

    const siblingRanges = wall.appliances
      .filter((other) => other.id !== gas.id && other.kind !== 'builtin-oven' && other.kind !== 'microwave')
      .map((other) => ({
        start: +(other.offsetX - parentBox.offsetX).toFixed(1),
        end: +(other.offsetX + other.width - parentBox.offsetX).toFixed(1),
      }));
    const ownedBySibling = (d: DoorUnit) => {
      const mid = d.startCm + d.widthCm / 2;
      return siblingRanges.some((r) => mid >= r.start - 0.5 && mid <= r.end + 0.5);
    };

    const sortedNonLinked = parentBox.doors
      .filter((d) => !linkedIds.has(d.id) && !ownedBySibling(d))
      .sort((a, b) => a.startCm - b.startCm);

    const leftTouching: DoorUnit[] = [];
    let leftSpanStart = oldLocalStart;
    let curL = oldLocalStart;
    for (let i = sortedNonLinked.length - 1; i >= 0; i--) {
      const d = sortedNonLinked[i];
      if (Math.abs(d.startCm + d.widthCm - curL) <= 1.5 && d.kind === 'door') {
        leftTouching.unshift(d);
        curL = d.startCm;
        leftSpanStart = curL;
      }
    }

    const rightTouching: DoorUnit[] = [];
    let rightSpanEnd = oldLocalEnd;
    let curR = oldLocalEnd;
    for (let i = 0; i < sortedNonLinked.length; i++) {
      const d = sortedNonLinked[i];
      if (Math.abs(d.startCm - curR) <= 1.5 && d.kind === 'door') {
        rightTouching.push(d);
        curR = +(d.startCm + d.widthCm).toFixed(1);
        rightSpanEnd = curR;
      }
    }

    const dropIds = new Set([
      ...leftTouching.map((d) => d.id),
      ...rightTouching.map((d) => d.id),
    ]);
    parentBox.unitDividers = parentBox.unitDividers.filter((u) => {
      if (Math.abs(u - oldLocalStart) <= 1.8 || Math.abs(u - oldLocalEnd) <= 1.8) return false;
      if (u > newLocalStart + 1.5 && u < newLocalEnd - 1.5) return false;
      return true;
    });
    parentBox.doors = parentBox.doors.filter((d) => {
      if (linkedIds.has(d.id)) return true;
      if (dropIds.has(d.id)) return false;
      return d.startCm + d.widthCm <= newLocalStart + 1 || d.startCm >= newLocalEnd - 1;
    });

    for (const d of linkedDoors) {
      d.startCm = newLocalStart;
      d.widthCm = nextWidthCm;
    }
    if (leftTouching.length > 0 && newLocalStart - leftSpanStart >= MIN_DOOR_CM) {
      refitDoorSpanAfterEdgeShift(parentBox, leftSpanStart, newLocalStart, leftTouching);
    }
    if (rightTouching.length > 0 && rightSpanEnd - newLocalEnd >= MIN_DOOR_CM) {
      refitDoorSpanAfterEdgeShift(parentBox, newLocalEnd, rightSpanEnd, rightTouching);
    }

    if (newLocalStart > 2 && !isDividerNearBlockedCorner(parentBox, newLocalStart, blocked) && !parentBox.unitDividers.some((u) => Math.abs(u - newLocalStart) < 1.5)) {
      parentBox.unitDividers.push(newLocalStart);
    }
    if (newLocalEnd < parentBox.width - 2 && !isDividerNearBlockedCorner(parentBox, newLocalEnd, blocked) && !parentBox.unitDividers.some((u) => Math.abs(u - newLocalEnd) < 1.5)) {
      parentBox.unitDividers.push(newLocalEnd);
    }
    parentBox.unitDividers.sort((a, b) => a - b);
    parentBox.doors.sort((a, b) => a.startCm - b.startCm);
  }

  gas.offsetX = newX;
  gas.width = nextWidthCm;
  syncHoodUnitAboveGas(wall, gas);

  return { ok: true, width: nextWidthCm, message: `اندازه گاز و هود به ${nextWidthCm}cm تغییر کرد` };
}

/**
 * Updates a washing machine's load capacity (`6 | 8 | 9` kg) and physical width (`55 | 60 | 62` cm),
 * checking sink unit clearance and sibling appliances.
 */
export function updateWashingMachineCapacity(
  wall: Wall,
  allWalls: Wall[],
  cornerOwners: Record<string, string>,
  appId: string,
  kg: WashingCapacityKg
): { ok: boolean; width?: number; message: string } {
  const app = wall.appliances.find((a) => a.id === appId && a.kind === 'washing');
  if (!app) return { ok: false, message: 'ماشین لباسشویی یافت نشد' };

  const cap = WASHING_CAPACITIES[kg];
  const parentBox = findParentBoxForAppliance(wall, app);
  const blocked = getCornerBlockedZonesForWall(wall, allWalls, cornerOwners);
  let minX = parentBox ? parentBox.offsetX : 0;
  let maxX = parentBox ? parentBox.offsetX + parentBox.width - cap.width : wall.length - cap.width;
  for (const z of blocked) {
    if (z.tier !== 'lower') continue;
    if (z.startCm <= minX + 2 && z.endCm > minX) minX = Math.max(minX, z.endCm);
    const rb = parentBox ? parentBox.offsetX + parentBox.width : wall.length;
    if (z.endCm >= rb - 2 && z.startCm < rb) maxX = Math.min(maxX, z.startCm - cap.width);
  }
  const blockers: ApplianceSpan[] = [
    ...protectedSinkSpans(wall, blocked),
    ...wall.appliances
      .filter((o) => o.id !== app.id && o.kind !== 'sink' && o.kind !== 'builtin-oven' && o.kind !== 'microwave')
      .map((o): ApplianceSpan => [o.offsetX, o.offsetX + o.width]),
  ];
  const oldStart = app.offsetX;
  const oldEnd = app.offsetX + app.width;
  const safeX = nearestClearApplianceOffset(oldStart, minX, maxX, cap.width, blockers);
  if (safeX === undefined) {
    return { ok: false, message: `فضای کافی برای ماشین لباسشویی ${cap.label} نیست` };
  }

  app.washingCapacityKg = kg;
  app.width = cap.width;
  app.offsetX = safeX;
  if (parentBox) {
    const oldLs = +(oldStart - parentBox.offsetX).toFixed(1);
    const oldLe = +(oldEnd - parentBox.offsetX).toFixed(1);
    const newLs = +(safeX - parentBox.offsetX).toFixed(1);
    const newLe = +(newLs + cap.width).toFixed(1);
    parentBox.unitDividers = parentBox.unitDividers.filter(
      (u) => Math.abs(u - oldLs) > 1.5 && Math.abs(u - oldLe) > 1.5
    );
    if (newLs > 2 && !isDividerNearBlockedCorner(parentBox, newLs, blocked)) parentBox.unitDividers.push(newLs);
    if (newLe < parentBox.width - 2 && !isDividerNearBlockedCorner(parentBox, newLe, blocked)) parentBox.unitDividers.push(newLe);
    parentBox.unitDividers.sort((a, b) => a - b);
  }

  return { ok: true, width: cap.width, message: `ظرفیت لباسشویی به ${cap.label} تغییر کرد` };
}

/**
 * Normalizes a requested frame thickness to valid 3..11cm steps (3, 5, 7, 9, 11).
 */
export function snapFrameWidthCm(raw: number): number {
  let best: number = FRAME_WIDTH_OPTIONS[0];
  let bestDist = Infinity;
  for (const opt of FRAME_WIDTH_OPTIONS) {
    const dist = Math.abs(raw - opt);
    if (dist < bestDist) {
      bestDist = dist;
      best = opt;
    }
  }
  return best;
}

/**
 * Computes structural frame insets (in cm) on all 4 perimeter edges of a box.
 */
export function getBoxFrameInsets(box: CabinetBox): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} {
  const res = { left: 0, right: 0, top: 0, bottom: 0 };
  for (const f of box.frames || []) {
    if (f.side === 'left') res.left = Math.max(res.left, f.widthCm);
    else if (f.side === 'right') res.right = Math.max(res.right, f.widthCm);
    else if (f.side === 'top') res.top = Math.max(res.top, f.widthCm);
    else if (f.side === 'bottom') res.bottom = Math.max(res.bottom, f.widthCm);
  }
  return res;
}

export interface BoxSideExposure {
  leftExposed: boolean;
  rightExposed: boolean;
  leftReason?: string;
  rightReason?: string;
}

/**
 * Checks whether left & right perimeter edges of a cabinet box are actually exposed architectural ends
 * rather than buried inside a corner blind zone, abutting perpendicular corner cabinetry, or touching a neighbor box.
 */
export function getBoxSideExposure(
  box: CabinetBox,
  wall: Wall,
  allWalls: Wall[],
  cornerOwners: Record<string, string>,
  precomputedZones?: BlockedZone[]
): BoxSideExposure {
  const zones = precomputedZones ?? getCornerBlockedZonesForWall(wall, allWalls, cornerOwners);
  const boxTier = getBoxTier(box);

  let leftExposed = true;
  let rightExposed = true;
  let leftReason: string | undefined;
  let rightReason: string | undefined;

  for (const z of zones) {
    const tierMatches =
      z.tier === boxTier ||
      ((box.type === 'tall' || box.type === 'closet') && z.tier === 'lower');
    if (!tierMatches) continue;

    if (z.startCm <= 2) {
      if (box.offsetX < z.endCm - 1 || Math.abs(box.offsetX - z.endCm) <= 2) {
        leftExposed = false;
        leftReason =
          z.role === 'blind-behind'
            ? 'سمت چپ داخل کنج کور است و فریم کنار نمی‌گیرد'
            : 'سمت چپ چسبیده به کنج دیوار مجاور است و فریم کنار نمی‌گیرد';
      }
    }
    if (z.endCm >= wall.length - 2) {
      const boxEnd = box.offsetX + box.width;
      if (boxEnd > z.startCm + 1 || Math.abs(boxEnd - z.startCm) <= 2) {
        rightExposed = false;
        rightReason =
          z.role === 'blind-behind'
            ? 'سمت راست داخل کنج کور است و فریم کنار نمی‌گیرد'
            : 'سمت راست چسبیده به کنج دیوار مجاور است و فریم کنار نمی‌گیرد';
      }
    }
  }

  for (const other of wall.boxes) {
    if (other.id === box.id) continue;
    const vOverlap =
      box.elevY < other.elevY + other.height - 1 &&
      box.elevY + box.height > other.elevY + 1;
    if (!vOverlap) continue;
    if (leftExposed && Math.abs(other.offsetX + other.width - box.offsetX) <= 2) {
      leftExposed = false;
      leftReason = 'سمت چپ چسبیده به باکس مجاور است';
    }
    if (rightExposed && Math.abs(box.offsetX + box.width - other.offsetX) <= 2) {
      rightExposed = false;
      rightReason = 'سمت راست چسبیده به باکس مجاور است';
    }
  }

  return { leftExposed, rightExposed, leftReason, rightReason };
}

/**
 * Places or updates a structural frame (3, 5, 7, 9, 11cm) on a cabinet box.
 * Strictly enforces architectural edge exposure (no frame in blind corners/buried ends)
 * and snaps vertical seam frames onto unit dividers OR real boundaries between doors.
 */
export function placeFrameOnBox(
  box: CabinetBox,
  side: FrameSide,
  widthCm: number,
  seamCm?: number,
  exposure?: BoxSideExposure
): { ok: boolean; frame?: BoxFrameItem; message: string } {
  const validW = snapFrameWidthCm(widthCm);
  if (!box.frames) box.frames = [];

  if (side === 'bottom' && box.plinth > 0) {
    return {
      ok: false,
      message: 'زیر باکس زمینی و قدی پاخور دارد؛ فریم را روی لبه بالا یا کناره‌ها قرار دهید',
    };
  }

  if (side === 'left' && exposure && !exposure.leftExposed) {
    return {
      ok: false,
      message: exposure.leftReason || 'سمت چپ باکس در کنج یا کنار باکس دیگر قرار دارد',
    };
  }
  if (side === 'right' && exposure && !exposure.rightExposed) {
    return {
      ok: false,
      message: exposure.rightReason || 'سمت راست باکس در کنج یا کنار باکس دیگر قرار دارد',
    };
  }

  if (side === 'seam') {
    let matchedDivider = box.unitDividers.find(
      (u) => seamCm !== undefined && Math.abs(u - seamCm) <= 8
    );
    if (matchedDivider === undefined && seamCm !== undefined) {
      const doorSeams: number[] = [];
      for (const d of box.doors) {
        if (d.startCm > 2 && d.startCm < box.width - 2) doorSeams.push(+d.startCm.toFixed(1));
        const endCm = +(d.startCm + d.widthCm).toFixed(1);
        if (endCm > 2 && endCm < box.width - 2) doorSeams.push(endCm);
      }
      const matchedDoorSeam = doorSeams.find((ds) => Math.abs(ds - seamCm) <= 8);
      if (matchedDoorSeam !== undefined) {
        matchedDivider = matchedDoorSeam;
        if (!box.unitDividers.some((u) => Math.abs(u - matchedDoorSeam) < 1.5)) {
          box.unitDividers.push(matchedDoorSeam);
          box.unitDividers.sort((a, b) => a - b);
        }
      }
    }
    if (matchedDivider === undefined) {
      return {
        ok: false,
        message: 'فریم عمودی فقط روی لبه‌های باکس یا درز بین درب‌ها قرار می‌گیرد (نصف درب مجاز نیست)',
      };
    }
    const existing = box.frames.find(
      (f) => f.side === 'seam' && f.seamCm !== undefined && Math.abs(f.seamCm - matchedDivider!) <= 2
    );
    if (existing) {
      existing.widthCm = validW;
      return { ok: true, frame: existing, message: `عرض فریم میانی به ${validW}cm تغییر یافت` };
    }
    const created: BoxFrameItem = {
      id: uid('fr'),
      side: 'seam',
      widthCm: validW,
      seamCm: matchedDivider,
    };
    box.frames.push(created);
    return { ok: true, frame: created, message: `فریم عمودی ${validW}cm بین درب‌ها نصب شد` };
  }

  const insets = getBoxFrameInsets(box);
  const nextLeft = side === 'left' ? validW : insets.left;
  const nextRight = side === 'right' ? validW : insets.right;
  if (box.width - nextLeft - nextRight < MIN_DOOR_CM) {
    return {
      ok: false,
      message: 'با این عرض فریم، دهانه داخلی کمتر از ۳۰cm می‌شود',
    };
  }

  const existing = box.frames.find((f) => f.side === side);
  if (existing) {
    existing.widthCm = validW;
    return { ok: true, frame: existing, message: `فریم ${validW}cm به‌روزرسانی شد` };
  }

  const created: BoxFrameItem = { id: uid('fr'), side, widthCm: validW };
  box.frames.push(created);

  const sideNames: Record<Exclude<FrameSide, 'seam'>, string> = {
    left: 'چپ',
    right: 'راست',
    top: 'بالا',
    bottom: 'پایین',
  };
  return { ok: true, frame: created, message: `فریم ${validW}cm لبه ${sideNames[side]} نصب شد` };
}

/**
 * Applies a full surround picture-frame around all valid & exposed edges of a box.
 */
export function applyFullBoxFrame(
  box: CabinetBox,
  widthCm: number,
  exposure?: BoxSideExposure
): { ok: boolean; appliedSides: FrameSide[]; message: string } {
  const validW = snapFrameWidthCm(widthCm);
  const sides: FrameSide[] = [];
  if (!exposure || exposure.leftExposed) sides.push('left');
  if (!exposure || exposure.rightExposed) sides.push('right');
  sides.push('top');
  if (box.plinth === 0) sides.push('bottom');

  const appliedSides: FrameSide[] = [];
  for (const side of sides) {
    const res = placeFrameOnBox(box, side, validW, undefined, exposure);
    if (!res.ok) return { ok: false, appliedSides, message: res.message };
    appliedSides.push(side);
  }
  const skippedBuried =
    exposure && (!exposure.leftExposed || !exposure.rightExposed);
  return {
    ok: true,
    appliedSides,
    message: skippedBuried
      ? `فریم ${validW}cm فقط روی لبه‌های آزاد (خارج از کنج) اجرا شد`
      : `فریم ${validW}cm دور تا دور باکس اجرا شد`,
  };
}

/**
 * Automatically adds paired 2-door carcass unit dividers for contiguous hinged door runs
 * (1-2 doors -> 1 unit, 3-4 -> 2 units, 5-6 -> 3 units, etc.) while preserving manual dividers.
 */
export function ensurePairedDoorUnitDividers(
  box: CabinetBox,
  blockedZones: BlockedZone[] = []
): number[] {
  if (box.type === 'fridge' || !box.doors.length) {
    return [];
  }

  const units = getUnitsInBox(box, blockedZones);
  const addedDividers: number[] = [];

  for (const unit of units) {
    const hinged = unit.doors.filter((d) => d.kind === 'door' && d.hardwareKind !== 'pantry-pullout');
    if (hinged.length <= 2) continue;

    // Group contiguous hinged doors within this undivided unit
    const runs: DoorUnit[][] = [];
    for (const d of hinged) {
      const last = runs[runs.length - 1];
      if (last && Math.abs(last[last.length - 1].startCm + last[last.length - 1].widthCm - d.startCm) <= 2) {
        last.push(d);
      } else {
        runs.push([d]);
      }
    }

    for (const run of runs) {
      if (run.length <= 2) continue;
      const splitAfterIndices: number[] = [];
      const n = run.length;
      if (n % 2 === 0) {
        for (let i = 1; i < n - 1; i += 2) splitAfterIndices.push(i);
      } else if (n === 3) {
        const nearLeftCorner = run[0].startCm <= 4 && blockedZones.some((z) => z.startCm <= 2);
        splitAfterIndices.push(nearLeftCorner ? 0 : 1);
      } else if (n === 5) {
        // [2 + 1 + 2] => 3 units (matches architectural centering and existing unit convention)
        splitAfterIndices.push(1, 2);
      } else {
        // Odd >= 7: pairs of 2 from left, leaving 1 single at end -> Math.ceil(n / 2) units
        for (let i = 1; i < n - 1; i += 2) splitAfterIndices.push(i);
      }

      for (const idx of splitAfterIndices) {
        const seam = +(run[idx].startCm + run[idx].widthCm).toFixed(1);
        if (
          seam > 2 &&
          seam < box.width - 2 &&
          !isDividerNearBlockedCorner(box, seam, blockedZones) &&
          !box.unitDividers.some((u) => Math.abs(u - seam) < 1.8)
        ) {
          box.unitDividers.push(seam);
          addedDividers.push(seam);
        }
      }
    }
  }

  if (addedDividers.length > 0) {
    box.unitDividers.sort((a, b) => a - b);
  }
  return addedDividers;
}

/**
 * Automatically divides undivided multi-door hinged runs inside a box into ergonomic 2-door pairs
 * (preserving manual dividers), handling single (1), even (2,4,6 -> pairs), and odd (3 -> 2+1 / 5 -> 2+1+2) runs,
 * and sets paired opposing `hingeSide` values so two-door units get facing center-seam handles.
 */
export function autoUnitizeBoxForHandles(
  box: CabinetBox,
  blockedZones: BlockedZone[] = []
): { addedDividers: number[]; pairedUnits: number } {
  if (box.type === 'fridge' || !box.doors.length) {
    return { addedDividers: [], pairedUnits: 0 };
  }

  const addedDividers = ensurePairedDoorUnitDividers(box, blockedZones);

  // Assign coherent default hingeSide for every unit
  const finalUnits = getUnitsInBox(box, blockedZones);
  let pairedUnits = 0;
  for (const unit of finalUnits) {
    const hinged = unit.doors.filter((d) => d.kind === 'door');
    for (let i = 0; i < hinged.length; i += 2) {
      const pair = hinged.slice(i, i + 2);
      if (pair.length === 2) {
        const dA = pair[0];
        const dB = pair[1];
        if (dA.hardwareKind !== 'pantry-pullout') dA.hingeSide = 'left';
        if (dB.hardwareKind !== 'pantry-pullout') dB.hingeSide = 'right';
        pairedUnits++;
      } else if (pair.length === 1) {
        const d = pair[0];
        if (d.hardwareKind === 'pantry-pullout') {
          d.hingeSide = undefined;
        } else if (!d.hingeSide) {
          d.hingeSide = d.startCm + d.widthCm / 2 > box.width / 2 ? 'right' : 'left';
        }
      }
    }
  }

  return { addedDividers, pairedUnits };
}

export interface SmartUnitizeOptions {
  allowThreeDoorUnit?: boolean;
}

/**
 * Smart architectural unitization (Reform 1):
 * - Detects narrow 15–29cm doors adjacent to gas/fridge or disproportionate 105–135cm 3-door runs beside gas
 *   and converts the gas/fridge-adjacent door into a pull-out pantry (`hardwareKind: 'pantry-pullout'`, vertical center handle, no hingeSide).
 * - Pairs remaining hinged doors into 2-door symmetrical units (`left` + `right`) without dividers inside pairs,
 *   or builds a 3-door `[pantry + pair]` unit when `allowThreeDoorUnit` is enabled.
 * - Sets ergonomic obstacle-facing `hingeSide` on single doors next to walls, corners, or fridges.
 */
export function optimizeBoxUnitsSmart(
  box: CabinetBox,
  wall: Wall | null | undefined,
  allWalls: Wall[] = [],
  blockedZones: BlockedZone[] = [],
  options: SmartUnitizeOptions = {}
): { addedDividers: number; pantryCount: number; pairedUnits: number; threeDoorUnits: number } {
  if (box.type === 'fridge' || !box.doors.length) {
    return { addedDividers: 0, pantryCount: 0, pairedUnits: 0, threeDoorUnits: 0 };
  }

  box.doors.sort((a, b) => a.startCm - b.startCm);

  // Structural boundaries that MUST keep their dividers: drawers, lifts, and appliance edges
  const lockedBoundaries = new Set<number>();
  for (const d of box.doors) {
    if (d.kind === 'drawer' || d.kind === 'lift') {
      lockedBoundaries.add(+d.startCm.toFixed(1));
      lockedBoundaries.add(+(d.startCm + d.widthCm).toFixed(1));
    }
  }
  const gasBoundsGlobal: Array<{ start: number; end: number }> = [];
  const fridgeBoundsGlobal: Array<{ start: number; end: number }> = [];
  if (wall) {
    for (const a of wall.appliances) {
      const ls = +(a.offsetX - box.offsetX).toFixed(1);
      const le = +(ls + a.width).toFixed(1);
      if (ls > -2 && le < box.width + 2) {
        if (ls > 2) lockedBoundaries.add(ls);
        if (le < box.width - 2) lockedBoundaries.add(le);
      }
      if (a.kind === 'gas') {
        gasBoundsGlobal.push({ start: a.offsetX, end: a.offsetX + a.width });
      }
    }
    for (const other of wall.boxes) {
      if (other.type === 'fridge') {
        fridgeBoundsGlobal.push({ start: other.offsetX, end: other.offsetX + other.width });
      }
    }
  }

  const isLockedBoundary = (u: number) =>
    Array.from(lockedBoundaries).some((b) => Math.abs(b - u) <= 1.8);

  // Reset non-locked dividers inside hinged runs so Smart Unitization recomputes clean units
  box.unitDividers = box.unitDividers.filter((u) => isLockedBoundary(u));

  const isDoorNextToGas = (d: DoorUnit) => {
    const gStart = box.offsetX + d.startCm;
    const gEnd = gStart + d.widthCm;
    return gasBoundsGlobal.some(
      (g) => Math.abs(g.end - gStart) <= 3 || Math.abs(gEnd - g.start) <= 3
    );
  };
  const isDoorNextToFridge = (d: DoorUnit) => {
    const gStart = box.offsetX + d.startCm;
    const gEnd = gStart + d.widthCm;
    return fridgeBoundsGlobal.some(
      (f) => Math.abs(f.end - gStart) <= 6 || Math.abs(gEnd - f.start) <= 6
    );
  };
  const hasLeftObstacle = (d: DoorUnit) => {
    const gStart = box.offsetX + d.startCm;
    if (d.startCm <= 4 && (!wall || box.offsetX <= 2)) return true;
    if (isDoorNextToFridge(d) && fridgeBoundsGlobal.some((f) => Math.abs(f.end - gStart) <= 6)) {
      return true;
    }
    return blockedZones.some(
      (z) => z.tier === 'lower' && Math.abs(z.endCm - gStart) <= CORNER_FILLER_CM + 2.5
    );
  };
  const hasRightObstacle = (d: DoorUnit) => {
    const gEnd = box.offsetX + d.startCm + d.widthCm;
    if (
      d.startCm + d.widthCm >= box.width - 4 &&
      (!wall || box.offsetX + box.width >= wall.length - 2)
    ) {
      return true;
    }
    if (isDoorNextToFridge(d) && fridgeBoundsGlobal.some((f) => Math.abs(f.start - gEnd) <= 6)) {
      return true;
    }
    return blockedZones.some(
      (z) => z.tier === 'lower' && Math.abs(z.startCm - gEnd) <= CORNER_FILLER_CM + 2.5
    );
  };

  // Group contiguous hinged doors (`kind === 'door'`), breaking at gaps, drawers/lifts, or locked appliance boundaries
  const hinged = box.doors.filter((d) => d.kind === 'door');
  const runs: DoorUnit[][] = [];
  for (const d of hinged) {
    const prevRun = runs[runs.length - 1];
    const prevDoor = prevRun?.[prevRun.length - 1];
    const seam = prevDoor ? +(prevDoor.startCm + prevDoor.widthCm).toFixed(1) : 0;
    const touches =
      prevDoor &&
      Math.abs(seam - d.startCm) <= 1.8 &&
      !isLockedBoundary(seam);
    if (touches) {
      prevRun.push(d);
    } else {
      runs.push([d]);
    }
  }

  let pantryCount = 0;
  let pairedUnits = 0;
  let threeDoorUnits = 0;
  let addedDividers = 0;

  const pushDivider = (seam: number) => {
    const s = +seam.toFixed(1);
    if (
      s > 2 &&
      s < box.width - 2 &&
      !isDividerNearBlockedCorner(box, s, blockedZones) &&
      !box.unitDividers.some((u) => Math.abs(u - s) < 1.8)
    ) {
      box.unitDividers.push(s);
      addedDividers++;
    }
  };

  const syncPantryHandle = (d: DoorUnit) => {
    d.hardwareKind = 'pantry-pullout';
    d.hingeSide = undefined;
    const existing = box.handles.filter((h) => h.doorId === d.id);
    if (existing.length > 0) {
      existing.forEach((h) => {
        h.xRatio = 0.5;
        h.yRatio = 0.5;
        h.orient = 'vertical';
      });
    } else {
      box.handles.push({
        id: uid('hand'),
        doorId: d.id,
        rowIndex: 0,
        xRatio: 0.5,
        yRatio: 0.5,
        orient: 'vertical',
        style: 'simple',
        lengthCm: 16,
      });
    }
  };

  const syncDoorHandleSide = (d: DoorUnit, side: 'left' | 'right') => {
    d.hingeSide = side;
    box.handles
      .filter((h) => h.doorId === d.id)
      .forEach((h) => {
        if (h.orient === 'vertical') {
          h.xRatio = side === 'left' ? 0.86 : 0.14;
        }
      });
  };

  for (const run of runs) {
    const totalW = +run.reduce((s, d) => s + d.widthCm, 0).toFixed(1);

    // 1. Detect narrow 15..29cm door next to gas/fridge -> pantry-pullout
    for (const d of run) {
      if (
        (d.widthCm >= MIN_PANTRY_CM && d.widthCm < MIN_DOOR_CM && (isDoorNextToGas(d) || isDoorNextToFridge(d) || d.hardwareKind === 'pantry-pullout')) ||
        d.hardwareKind === 'pantry-pullout'
      ) {
        syncPantryHandle(d);
      }
    }

    // 2. Detect disproportionate 105..135cm 3-door bay adjacent to gas -> convert gas-side door to pantry
    if (run.length === 3 && totalW >= 105 && totalW <= 135) {
      const leftTouchesGas = isDoorNextToGas(run[0]);
      const rightTouchesGas = isDoorNextToGas(run[2]);
      if (leftTouchesGas || rightTouchesGas) {
        const pantryDoor = leftTouchesGas ? run[0] : run[2];
        syncPantryHandle(pantryDoor);
      }
    }

    // Check if run is now [pantry, d1, d2] or [d1, d2, pantry]
    const isThreeDoorPantryTuple =
      run.length === 3 &&
      run.filter((d) => d.hardwareKind === 'pantry-pullout').length === 1 &&
      (run[0].hardwareKind === 'pantry-pullout' || run[2].hardwareKind === 'pantry-pullout') &&
      totalW <= 145;

    if (isThreeDoorPantryTuple) {
      pantryCount++;
      const pantryIdx = run[0].hardwareKind === 'pantry-pullout' ? 0 : 2;
      const pair = pantryIdx === 0 ? [run[1], run[2]] : [run[0], run[1]];
      syncDoorHandleSide(pair[0], 'left');
      syncDoorHandleSide(pair[1], 'right');
      pairedUnits++;
      if (options.allowThreeDoorUnit) {
        threeDoorUnits++;
      } else {
        const seam = pantryIdx === 0 ? run[0].startCm + run[0].widthCm : run[1].startCm + run[1].widthCm;
        pushDivider(seam);
      }
      continue;
    }

    // Split into contiguous segments separated by any pantry-pullout doors
    let seg: DoorUnit[] = [];
    const flushRegularSeg = (items: DoorUnit[]) => {
      if (!items.length) return;
      const n = items.length;
      const splitAfter: number[] = [];
      if (n <= 2) {
        // 1 or 2 doors stay together as 1 unit
      } else if (n % 2 === 0) {
        for (let i = 1; i < n - 1; i += 2) splitAfter.push(i);
      } else if (n === 3) {
        const nearLeftCorner = items[0].startCm <= 4 && blockedZones.some((z) => z.startCm <= 2);
        splitAfter.push(nearLeftCorner ? 0 : 1);
      } else if (n === 5) {
        splitAfter.push(1, 2);
      } else {
        for (let i = 1; i < n - 1; i += 2) splitAfter.push(i);
      }

      for (const idx of splitAfter) {
        pushDivider(items[idx].startCm + items[idx].widthCm);
      }

      // Assign hinges per resulting unit chunk
      const cuts = [-1, ...splitAfter, n - 1];
      for (let c = 0; c < cuts.length - 1; c++) {
        const chunk = items.slice(cuts[c] + 1, cuts[c + 1] + 1);
        if (chunk.length === 2) {
          syncDoorHandleSide(chunk[0], 'left');
          syncDoorHandleSide(chunk[1], 'right');
          pairedUnits++;
        } else if (chunk.length === 1) {
          const single = chunk[0];
          const lObs = hasLeftObstacle(single);
          const rObs = hasRightObstacle(single);
          if (lObs && !rObs) {
            syncDoorHandleSide(single, 'left');
          } else if (rObs && !lObs) {
            syncDoorHandleSide(single, 'right');
          } else if (!single.hingeSide) {
            const side: 'left' | 'right' =
              single.startCm + single.widthCm / 2 > box.width / 2 ? 'right' : 'left';
            syncDoorHandleSide(single, side);
          } else {
            syncDoorHandleSide(single, single.hingeSide);
          }
        }
      }
    };

    for (let i = 0; i < run.length; i++) {
      const d = run[i];
      if (d.hardwareKind === 'pantry-pullout') {
        pantryCount++;
        if (seg.length > 0) {
          flushRegularSeg(seg);
          pushDivider(d.startCm);
          seg = [];
        }
        if (i < run.length - 1 && run[i + 1].hardwareKind !== 'pantry-pullout') {
          pushDivider(d.startCm + d.widthCm);
        }
      } else {
        seg.push(d);
      }
    }
    flushRegularSeg(seg);
  }

  // Ensure unit borders exist between adjacent runs separated by locked boundaries
  for (const b of lockedBoundaries) {
    pushDivider(b);
  }
  box.unitDividers.sort((a, b) => a - b);
  populateSmartShelvesForBox(box, wall, blockedZones);
  return { addedDividers, pantryCount, pairedUnits, threeDoorUnits };
}

/**
 * Applies handles consistently across a list of target doors inside a box,
 * honoring unit pairing (side-by-side center handles on 2-door units), pull-out pantry vertical center,
 * horizontal drawers/lifts (including left/center/right X positions), and architectural swing sides.
 */
export function applyHandlesToBoxDoors(
  box: CabinetBox,
  targetDoorIds: string[] | null,
  style: HandleStyle,
  orient: Orientation,
  sampleSpot?: { xRatio: number; yRatio: number },
  blockedZones: BlockedZone[] = []
): number {
  if (box.type === 'fridge') return 0;
  const targets = box.doors.filter(
    (d) =>
      d.kind !== 'fridge' &&
      d.kind !== 'open' &&
      d.kind !== 'rail' &&
      (!targetDoorIds || targetDoorIds.includes(d.id))
  );
  if (!targets.length) return 0;

  // Determine paired relationships from units
  const units = getUnitsInBox(box, blockedZones);
  const doorHingeMap = new Map<string, 'left' | 'right'>();
  for (const u of units) {
    const hinged = u.doors.filter((d) => d.kind === 'door' && d.hardwareKind !== 'pantry-pullout');
    if (hinged.length === 2) {
      doorHingeMap.set(hinged[0].id, hinged[0].hingeSide || 'left');
      doorHingeMap.set(hinged[1].id, hinged[1].hingeSide || 'right');
    } else if (hinged.length === 1 && hinged[0].hingeSide) {
      doorHingeMap.set(hinged[0].id, hinged[0].hingeSide);
    }
  }

  let count = 0;
  const isWall = box.type === 'wall' || box.type === 'wall-deep';

  for (const door of targets) {
    const wasHandleless = box.handles.some(h => h.doorId === door.id && h.style === 'handleless');
    box.handles = box.handles.filter(h => h.doorId !== door.id);
    if (style === 'handleless') {
      if (door.kind === 'door' && (!door.hardwareKind || door.hardwareKind === 'hinged')) door.hardwareKind = 'push-to-open';
      box.handles.push({ id: uid('hand'), doorId: door.id, rowIndex: 0, xRatio: 0.5, yRatio: 0.5,
        orient, style, lengthCm: 0 });
      count++;
      continue;
    }
    if (wasHandleless && door.hardwareKind === 'push-to-open') door.hardwareKind = 'hinged';

    if (door.kind === 'drawer' || (door.kind === 'lift' && door.drawerRatios.length > 0)) {
      const rowCount = door.drawerRatios.length + 1;
      for (let r = 0; r < rowCount; r++) {
        box.handles.push({
          id: uid('hand'),
          doorId: door.id,
          rowIndex: r,
          xRatio: sampleSpot ? sampleSpot.xRatio : orient === 'horizontal' ? 0.5 : 0.86,
          yRatio: sampleSpot ? sampleSpot.yRatio : door.kind === 'lift' ? 0.78 : style === 'f-profile' ? 0.15 : 0.5,
          orient,
          style,
          lengthCm: defaultHandleLengthCm(style),
        });
        count++;
      }
    } else if (door.kind === 'lift') {
      box.handles.push({
        id: uid('hand'),
        doorId: door.id,
        rowIndex: 0,
        xRatio: sampleSpot ? sampleSpot.xRatio : 0.5,
        yRatio: sampleSpot ? sampleSpot.yRatio : 0.86,
        orient: sampleSpot || style === 'f-profile' ? orient : 'horizontal',
        style,
        lengthCm: defaultHandleLengthCm(style),
      });
      count++;
    } else {
      const isPantry = door.hardwareKind === 'pantry-pullout';
      const resolvedHinge = door.hingeSide || doorHingeMap.get(door.id);
      if (!isPantry && resolvedHinge) {
        door.hingeSide = resolvedHinge;
      }

      let xr: number;
      if (sampleSpot) {
        const edgeDist = sampleSpot.xRatio <= 0.3 ? sampleSpot.xRatio : sampleSpot.xRatio >= 0.7 ? 1 - sampleSpot.xRatio : null;
        if (edgeDist !== null && resolvedHinge) {
          xr = resolvedHinge === 'left' ? +(1 - edgeDist).toFixed(2) : +edgeDist.toFixed(2);
        } else {
          xr = sampleSpot.xRatio;
        }
      } else if (isPantry) {
        xr = 0.5;
      } else if (orient === 'horizontal') {
        xr = 0.5;
      } else if (resolvedHinge) {
        xr = resolvedHinge === 'left' ? 0.86 : 0.14;
      } else {
        xr = 0.86;
      }

      const yr = sampleSpot
        ? sampleSpot.yRatio
        : isPantry
        ? 0.5
        : isWall
        ? 0.82
        : 0.18;

      box.handles.push({
        id: uid('hand'),
        doorId: door.id,
        rowIndex: 0,
        xRatio: xr,
        yRatio: yr,
        orient: isPantry && !sampleSpot ? 'vertical' : orient,
        style,
        lengthCm: defaultHandleLengthCm(style),
      });
      count++;
    }
  }
  return count;
}

/**
 * Applies a visual DoorStyle ('flat', 'cnc', 'glass', 'glass-grid') to specific doors (or all doors in a box).
 */
export function applyDoorStyleToDoors(
  box: CabinetBox,
  targetDoorIds: string[] | null,
  style: DoorStyle
): number {
  if (box.type === 'fridge') return 0;
  let count = 0;
  for (const door of box.doors) {
    if (door.kind === 'fridge' || door.kind === 'open' || door.kind === 'rail') continue;
    if (targetDoorIds && !targetDoorIds.includes(door.id)) continue;
    door.doorStyle = style;
    count++;
  }
  return count;
}

export const BIFOLD_SPLIT = 0.5;

/**
 * Applies a dedicated HardwareKind ('hinged', 'pantry-pullout', 'lift-bifold', 'push-to-open', 'corner')
 * cleanly decoupled from visual panel style.
 */
export function applyHardwareKindToDoors(
  box: CabinetBox,
  targetDoorIds: string[] | null,
  hardwareKind: HardwareKind
): number {
  if (box.type === 'fridge') return 0;
  const isWall = box.type === 'wall' || box.type === 'wall-deep';
  let count = 0;
  for (const door of box.doors) {
    if (door.kind === 'fridge' || door.kind === 'open' || door.kind === 'rail') continue;
    if (targetDoorIds && !targetDoorIds.includes(door.id)) continue;

    if (hardwareKind === 'lift-bifold' && (!isWall || door.kind === 'drawer')) continue;
    const previousHardware = door.hardwareKind;
    const split = BIFOLD_SPLIT;
    door.hardwareKind = hardwareKind;
    if (previousHardware === 'lift-bifold' && hardwareKind === 'hinged') {
      door.kind = 'door';
      for (const handle of box.handles) {
        if (handle.doorId !== door.id) continue;
        const previousSplit = door.drawerRatios[0] ?? split;
        handle.yRatio = handle.rowIndex === 1
          ? previousSplit + (1 - previousSplit) * handle.yRatio
          : previousSplit * handle.yRatio;
        handle.rowIndex = 0;
      }
      door.drawerRatios = [];
    }
    if (hardwareKind === 'pantry-pullout') {
      door.hingeSide = undefined;
    } else if (hardwareKind === 'lift-bifold') {
      const previousRows = door.kind === 'lift' ? [0, ...door.drawerRatios, 1] : [0, 1];
      for (const handle of box.handles) {
        if (handle.doorId !== door.id) continue;
        const row = Math.max(0, Math.min(previousRows.length - 2, handle.rowIndex ?? 0));
        const pos = previousRows[row] + (previousRows[row + 1] - previousRows[row]) * handle.yRatio;
        handle.rowIndex = pos >= split ? 1 : 0;
        handle.yRatio = pos >= split ? (pos - split) / (1 - split) : pos / split;
      }
      door.kind = 'lift';
      door.drawerRatios = [split];
    } else if (hardwareKind === 'hinged' && !door.hingeSide && door.kind === 'door') {
      door.hingeSide = door.startCm + door.widthCm / 2 > box.width / 2 ? 'right' : 'left';
    }
    count++;
  }
  return count;
}

/**
 * Smart Door Pencil helper: adds, updates, or clears an integrated horizontal top/bottom drawer band
 * (`drawerBand`) on hinged doors while preserving unit structure, width, hingeSide, and handles.
 */
export function applyDoorDrawerBand(
  box: CabinetBox,
  doorIds: string[] | null,
  band: { position: 'top' | 'bottom'; ratio: number } | null
): number {
  if (box.type === 'fridge') return 0;
  let count = 0;
  const clampedRatio = band ? +Math.max(0.16, Math.min(0.45, band.ratio)).toFixed(2) : 0.26;
  for (const door of box.doors) {
    if (door.kind !== 'door') continue;
    if (doorIds && !doorIds.includes(door.id)) continue;
    if (!band) {
      if (door.drawerBand) {
        delete door.drawerBand;
        count++;
      }
    } else {
      door.drawerBand = { position: band.position, ratio: clampedRatio };
      count++;
    }
  }
  return count;
}

/**
 * Returns all hinged `door` units in `box` overlapping `[startCm, endCm]` horizontally.
 */
export function getDoorsInHorizontalRange(
  box: CabinetBox,
  startCm: number,
  endCm: number
): DoorUnit[] {
  const lo = Math.min(startCm, endCm);
  const hi = Math.max(startCm, endCm);
  const isPoint = Math.abs(hi - lo) < 0.5;
  return box.doors
    .filter((d) =>
      d.kind === 'door' &&
      (isPoint
        ? lo >= d.startCm - 0.1 && lo <= d.startCm + d.widthCm + 0.1
        : d.startCm + d.widthCm >= lo + 0.5 && d.startCm <= hi - 0.5)
    )
    .sort((a, b) => a.startCm - b.startCm);
}

/**
 * Resizes a unit divider (`oldSeamCm` -> `newSeamCm`) inside a cabinet box while keeping all linked
 * doors, drawer ratios, styles, hinge sides, handles, shelves, and seam frames 100% synchronized.
 */
export function resizeUnitDividerWithDoorsSync(
  box: CabinetBox,
  oldSeamCm: number,
  newSeamCm: number,
  blockedZones: BlockedZone[] = []
): {
  ok: boolean;
  seamCm: number;
  leftUnit: { startCm: number; endCm: number };
  rightUnit: { startCm: number; endCm: number };
} | null {
  if (box.type === 'fridge') return null;
  const units = getUnitsInBox(box, blockedZones);
  const rightIdx = units.findIndex((u) => Math.abs(u.startCm - oldSeamCm) <= 2);
  if (rightIdx <= 0) return null;

  const leftU = units[rightIdx - 1];
  const rightU = units[rightIdx];

  const actualSeam = leftU.endCm;
  const leftBound = leftU.startCm;
  const rightBound = rightU.endCm;
  const isWall = box.type === 'wall' || box.type === 'wall-deep';

  const getDoorBounds = (d: DoorUnit) => {
    const min = d.kind === 'lift' && isWall ? MIN_LIFT_DOOR_CM : MIN_DOOR_CM;
    const max =
      d.kind === 'lift' && isWall
        ? MAX_LIFT_DOOR_CM
        : d.kind === 'drawer'
        ? 110
        : MAX_DOOR_CM;
    return { min, max };
  };

  const leftDoors = [...leftU.doors].sort((a, b) => a.startCm - b.startCm);
  const rightDoors = [...rightU.doors].sort((a, b) => a.startCm - b.startCm);

  const leftMin = leftDoors.length
    ? leftDoors.reduce((s, d) => s + getDoorBounds(d).min, 0)
    : MIN_DOOR_CM;
  const leftMax = leftDoors.length
    ? leftDoors.reduce((s, d) => s + getDoorBounds(d).max, 0)
    : Math.max(MIN_DOOR_CM, rightBound - leftBound - MIN_DOOR_CM);

  const rightMin = rightDoors.length
    ? rightDoors.reduce((s, d) => s + getDoorBounds(d).min, 0)
    : MIN_DOOR_CM;
  const rightMax = rightDoors.length
    ? rightDoors.reduce((s, d) => s + getDoorBounds(d).max, 0)
    : Math.max(MIN_DOOR_CM, rightBound - leftBound - MIN_DOOR_CM);

  const minSeam = Math.max(leftBound + leftMin, rightBound - rightMax);
  const maxSeam = Math.min(leftBound + leftMax, rightBound - rightMin);
  if (maxSeam < minSeam) return null;

  const targetSeam = Math.round(Math.max(minSeam, Math.min(maxSeam, newSeamCm)));
  if (Math.abs(targetSeam - actualSeam) < 0.5) {
    return {
      ok: true,
      seamCm: actualSeam,
      leftUnit: { startCm: leftBound, endCm: actualSeam },
      rightUnit: { startCm: actualSeam, endCm: rightBound },
    };
  }

  const redistributeUnitDoors = (doors: DoorUnit[], unitStart: number, unitTotalW: number) => {
    if (!doors.length) return;
    const prevSum = doors.reduce((s, d) => s + d.widthCm, 0) || unitTotalW;
    const bounds = doors.map(getDoorBounds);
    const widths = doors.map((d, i) => {
      const scaled = (d.widthCm / prevSum) * unitTotalW;
      return Math.max(bounds[i].min, Math.min(bounds[i].max, Math.round(scaled * 10) / 10));
    });

    // Distribute remaining delta so exact sum === unitTotalW without violating [min, max]
    let diff = +(unitTotalW - widths.reduce((s, w) => s + w, 0)).toFixed(1);
    for (let pass = 0; pass < 4 && Math.abs(diff) > 0.05; pass++) {
      for (let i = doors.length - 1; i >= 0 && Math.abs(diff) > 0.05; i--) {
        const room =
          diff > 0 ? bounds[i].max - widths[i] : widths[i] - bounds[i].min;
        if (room <= 0) continue;
        const step = diff > 0 ? Math.min(diff, room) : -Math.min(-diff, room);
        widths[i] = +(widths[i] + step).toFixed(1);
        diff = +(diff - step).toFixed(1);
      }
    }

    let cur = unitStart;
    doors.forEach((d, i) => {
      d.startCm = +cur.toFixed(1);
      d.widthCm = widths[i];
      cur += widths[i];
    });
  };

  redistributeUnitDoors(leftDoors, leftBound, +(targetSeam - leftBound).toFixed(1));
  redistributeUnitDoors(rightDoors, targetSeam, +(rightBound - targetSeam).toFixed(1));

  const divIdx = box.unitDividers.findIndex((u) => Math.abs(u - actualSeam) <= 2);
  if (divIdx !== -1) {
    box.unitDividers[divIdx] = targetSeam;
  } else if (targetSeam > 2 && targetSeam < box.width - 2) {
    box.unitDividers.push(targetSeam);
  }
  box.unitDividers.sort((a, b) => a - b);

  if (box.frames?.length) {
    for (const f of box.frames) {
      if (f.side === 'seam' && f.seamCm !== undefined && Math.abs(f.seamCm - actualSeam) <= 2) {
        f.seamCm = targetSeam;
      }
    }
  }

  for (const shelf of box.shelves) {
    if (shelf.startCm >= leftBound - 1 && shelf.endCm <= actualSeam + 1) {
      const scale = (targetSeam - leftBound) / (actualSeam - leftBound);
      shelf.startCm = +(leftBound + (shelf.startCm - leftBound) * scale).toFixed(1);
      shelf.endCm = +(leftBound + (shelf.endCm - leftBound) * scale).toFixed(1);
    } else if (shelf.startCm >= actualSeam - 1 && shelf.endCm <= rightBound + 1) {
      const scale = (rightBound - targetSeam) / (rightBound - actualSeam);
      shelf.startCm = +(rightBound - (rightBound - shelf.startCm) * scale).toFixed(1);
      shelf.endCm = +(rightBound - (rightBound - shelf.endCm) * scale).toFixed(1);
    }
  }
  box.shelves = box.shelves.filter((sh) => sh.endCm - sh.startCm >= 15);
  box.doors.sort((a, b) => a.startCm - b.startCm);

  return {
    ok: true,
    seamCm: targetSeam,
    leftUnit: { startCm: leftBound, endCm: targetSeam },
    rightUnit: { startCm: targetSeam, endCm: rightBound },
  };
}

/**
 * Swaps an architectural unit (`[unitStartCm, unitEndCm]`) with its left or right adjacent unit
 * inside a box while preserving every door, drawer ratio, style, hinge side, handle, shelf,
 * seam frame, and any wall appliances anchored inside either unit.
 */
export function moveUnitInBoxWithDoorsSync(
  wall: Wall,
  box: CabinetBox,
  unitStartCm: number,
  unitEndCm: number,
  direction: 'left' | 'right',
  blockedZones: BlockedZone[] = []
): {
  ok: boolean;
  movedUnit?: { startCm: number; endCm: number };
  message: string;
} {
  if (box.type === 'fridge') {
    return { ok: false, message: 'یخچال قابل جابجایی یونیت نیست' };
  }
  const units = getUnitsInBox(box, blockedZones);
  const idx = units.findIndex(
    (u) => Math.abs(u.startCm - unitStartCm) <= 1.8 && Math.abs(u.endCm - unitEndCm) <= 1.8
  );
  if (idx === -1) {
    return { ok: false, message: 'یونیت انتخاب‌شده در این باکس یافت نشد' };
  }

  const neighborIdx = direction === 'left' ? idx - 1 : idx + 1;
  if (neighborIdx < 0 || neighborIdx >= units.length) {
    return {
      ok: false,
      message:
        direction === 'left'
          ? 'یونیت دیگری در سمت چپ برای جابجایی وجود ندارد'
          : 'یونیت دیگری در سمت راست برای جابجایی وجود ندارد',
    };
  }

  const leftU = direction === 'left' ? units[neighborIdx] : units[idx];
  const rightU = direction === 'left' ? units[idx] : units[neighborIdx];
  if (Math.abs(leftU.endCm - rightU.startCm) > 2) {
    return {
      ok: false,
      message: 'یونیت‌ها به دلیل مانع کنج به هم چسبیده نیستند',
    };
  }

  const wL = +(leftU.endCm - leftU.startCm).toFixed(1);
  const wR = +(rightU.endCm - rightU.startCm).toFixed(1);
  const oldBoundary = leftU.endCm;
  const newBoundary = +(leftU.startCm + wR).toFixed(1);

  const inUnit = (x: number, uStart: number, uEnd: number) =>
    x >= uStart - 1 && x <= uEnd + 1;

  // Shift doors inside leftU by +wR, inside rightU by -wL
  for (const d of box.doors) {
    const mid = d.startCm + d.widthCm / 2;
    if (inUnit(mid, leftU.startCm, leftU.endCm)) {
      d.startCm = +(d.startCm + wR).toFixed(1);
    } else if (inUnit(mid, rightU.startCm, rightU.endCm)) {
      d.startCm = +(d.startCm - wL).toFixed(1);
    }
  }
  box.doors.sort((a, b) => a.startCm - b.startCm);

  // Shift shelves inside leftU by +wR, inside rightU by -wL
  for (const sh of box.shelves) {
    const mid = (sh.startCm + sh.endCm) / 2;
    if (inUnit(mid, leftU.startCm, leftU.endCm)) {
      sh.startCm = +(sh.startCm + wR).toFixed(1);
      sh.endCm = +(sh.endCm + wR).toFixed(1);
    } else if (inUnit(mid, rightU.startCm, rightU.endCm)) {
      sh.startCm = +(sh.startCm - wL).toFixed(1);
      sh.endCm = +(sh.endCm - wL).toFixed(1);
    }
  }

  // Update unit divider and any seam frame on the boundary between leftU & rightU
  const divIdx = box.unitDividers.findIndex((u) => Math.abs(u - oldBoundary) <= 2);
  if (divIdx !== -1) {
    box.unitDividers[divIdx] = newBoundary;
  } else if (newBoundary > 2 && newBoundary < box.width - 2) {
    box.unitDividers.push(newBoundary);
  }
  box.unitDividers.sort((a, b) => a - b);

  if (box.frames?.length) {
    for (const f of box.frames) {
      if (f.side === 'seam' && f.seamCm !== undefined && Math.abs(f.seamCm - oldBoundary) <= 2) {
        f.seamCm = newBoundary;
      }
    }
  }

  // Shift any appliances owned by this box whose center sits in leftU or rightU, keeping overhead units synced
  for (const app of wall.appliances) {
    const belongs =
      app.boxId === box.id ||
      (!app.boxId &&
        app.offsetX >= box.offsetX - 2 &&
        app.offsetX + app.width <= box.offsetX + box.width + 2);
    if (!belongs) continue;
    const oldStart = app.offsetX;
    const oldEnd = app.offsetX + app.width;
    const localMid = oldStart - box.offsetX + app.width / 2;
    let moved = false;
    if (inUnit(localMid, leftU.startCm, leftU.endCm)) {
      if (app.kind === 'gas') clearHoodUnitForGas(wall, oldStart, oldEnd, app.id);
      else if (app.kind === 'sink') clearDishRackUnitAboveSink(wall, oldStart, oldEnd, app.id);
      app.offsetX = +(oldStart + wR).toFixed(1);
      moved = true;
    } else if (inUnit(localMid, rightU.startCm, rightU.endCm)) {
      if (app.kind === 'gas') clearHoodUnitForGas(wall, oldStart, oldEnd, app.id);
      else if (app.kind === 'sink') clearDishRackUnitAboveSink(wall, oldStart, oldEnd, app.id);
      app.offsetX = +(oldStart - wL).toFixed(1);
      moved = true;
    }
    if (moved) {
      if (app.kind === 'gas') syncHoodUnitAboveGas(wall, app);
      else if (app.kind === 'sink') ensureHorizontalDoorsAboveSink(wall, app.offsetX, app.width);
    }
  }

  const movedUnit =
    direction === 'left'
      ? { startCm: leftU.startCm, endCm: newBoundary }
      : { startCm: newBoundary, endCm: rightU.endCm };

  return {
    ok: true,
    movedUnit,
    message: `یونیت به ${direction === 'left' ? 'چپ' : 'راست'} جابجا شد و ارتباط درب‌ها حفظ شد`,
  };
}

/**
 * Synchronizes wall cabinet vertical sizing across ALL walls in the project:
 * - Resizing any `wall` or `wall-deep` box updates all matching wall cabinets project-wide,
 * - Keeps stacked two-tier cabinets flush without overlap,
 * - Updates any over-fridge `wall-deep` box (`linkedToBoxId` or over fridge) to stay flush with the crown line,
 * - Updates any `tall` cabinet attached (directly or through adjacent cabinets/corners) to the wall cabinets.
 */
export function resizeWallCabinetsSynchronized(
  walls: Wall[],
  sourceWallId: string,
  sourceBoxId: string,
  nextElevY: number,
  nextHeight: number
): boolean {
  const srcWall = walls.find((w) => w.id === sourceWallId);
  const srcBox = srcWall?.boxes.find((b) => b.id === sourceBoxId);
  if (!srcWall || !srcBox) return false;
  if (srcBox.type !== 'wall' && srcBox.type !== 'wall-deep') return false;

  const oldSrcTop = +(srcBox.elevY + srcBox.height).toFixed(1);
  const srcLower = srcBox.type === 'wall' ? srcBox : srcWall.boxes.find(box => box.type === 'wall' &&
    box.offsetX < srcBox.offsetX + srcBox.width - 2 && box.offsetX + box.width > srcBox.offsetX + 2);
  const srcUpper = srcBox.type === 'wall-deep' && !srcBox.linkedToBoxId ? srcBox : srcWall.boxes.find(box =>
    box.type === 'wall-deep' && !box.linkedToBoxId && box.offsetX < srcBox.offsetX + srcBox.width - 2 &&
    box.offsetX + box.width > srcBox.offsetX + 2);
  const maxBottom = srcBox.type === 'wall' && srcUpper ? srcUpper.elevY + srcUpper.height - 75 : srcWall.height - 25;
  const clampedElev = Math.max(95, Math.min(maxBottom, Math.round(nextElevY)));
  let clampedH = Math.max(25, Math.min(srcWall.height - clampedElev, Math.round(nextHeight)));
  const bottomMoved = Math.abs(clampedElev - srcBox.elevY) >= 0.5;
  let newSrcTop = +(clampedElev + clampedH).toFixed(1);

  const horizOverlap = (a: CabinetBox, b: CabinetBox) =>
    a.offsetX < b.offsetX + b.width - 2 && a.offsetX + a.width > b.offsetX + 2;

  const hasStackedTwoTier = walls.some((w) =>
    w.boxes.some(
      (wd) =>
        wd.type === 'wall-deep' &&
        !wd.linkedToBoxId &&
        w.boxes.some((wb) => wb.type === 'wall' && horizOverlap(wd, wb))
    )
  );

  if (srcBox.type === 'wall') {
    if (hasStackedTwoTier) {
      const stackedWd = srcWall.boxes.find(
        (wd) => wd.type === 'wall-deep' && !wd.linkedToBoxId && horizOverlap(wd, srcBox)
      );
      if (stackedWd) {
        const total = stackedWd.elevY + stackedWd.height - clampedElev;
        if (total < 75) return false;
        clampedH = Math.max(25, Math.min(clampedH, 40, Math.floor(total / 3)));
        newSrcTop = clampedElev + clampedH;
      }
    }

    for (const w of walls) {
      for (const b of w.boxes) {
        if (b.type !== 'wall') continue;
        b.elevY = Math.max(95, Math.min(w.height - 25, clampedElev));
        b.height = Math.max(25, Math.min(w.height - b.elevY, clampedH));
        clampBoxInternalsAfterResize(b);
      }

      // Sync wall-deep boxes on this wall (both two-tier stacked upper boxes & over-fridge boxes)
      for (const wd of w.boxes) {
        if (wd.type !== 'wall-deep') continue;
        const wallBelow = w.boxes.find((wb) => wb.type === 'wall' && horizOverlap(wd, wb));
        const fridgeBelow = w.boxes.find(
          (fb) => fb.id === wd.linkedToBoxId || (fb.type === 'fridge' && horizOverlap(wd, fb))
        );

        if (wallBelow) {
          // Two-tier upper cabinet stays flush on top of resized lower wall cabinet
          const prevWdTop = wd.elevY + wd.height;
          const newWdElev = Math.min(prevWdTop - 25, Math.min(w.height - 25, wallBelow.elevY + wallBelow.height));
          wd.elevY = newWdElev;
          wd.height = Math.max(25, Math.min(w.height - newWdElev, prevWdTop - newWdElev));
          clampBoxInternalsAfterResize(wd);
        } else {
          // Over-fridge or standalone deep wall cabinet aligns crown top when not blocked by two-tier crown
          const targetTop =
            hasStackedTwoTier && Math.abs(wd.elevY + wd.height - oldSrcTop) > 10
              ? wd.elevY + wd.height
              : newSrcTop;
          const minAllowedElev = fridgeBelow
            ? fridgeBelow.elevY + fridgeBelow.height
            : clampedElev;
          if (fridgeBelow) {
            wd.elevY = minAllowedElev;
            wd.height = Math.max(25, Math.min(w.height - wd.elevY, targetTop - wd.elevY));
          } else {
            wd.elevY = Math.min(w.height - 25, clampedElev);
            wd.height = Math.max(25, Math.min(w.height - wd.elevY, targetTop - wd.elevY));
          }
          clampBoxInternalsAfterResize(wd);
        }
      }
    }
  } else {
    if (srcLower && srcUpper && !bottomMoved) {
      newSrcTop = Math.min(srcWall.height, Math.max(newSrcTop, srcLower.elevY + 3 * srcLower.height));
    }
    // srcBox.type === 'wall-deep' (including over-fridge or stacked top row)
    for (const w of walls) {
      for (const wd of w.boxes) {
        if (wd.type !== 'wall-deep') continue;
        const fridgeBelow = w.boxes.find(
          (fb) => fb.id === wd.linkedToBoxId || (fb.type === 'fridge' && horizOverlap(wd, fb))
        );
        const wallsBelow = w.boxes.filter((wb) => wb.type === 'wall' && horizOverlap(wd, wb));

        if (wallsBelow.length > 0 && bottomMoved) {
          // Dragging the middle seam (bottom of upper wall-deep): move seam while keeping crown top fixed
          const minWallElev = Math.max(...wallsBelow.map((wb) => wb.elevY));
          const crown = Math.min(w.height, oldSrcTop);
          const maxSeamElev = Math.min(...wallsBelow.map(wb => wb.elevY + Math.min(40, Math.floor((crown - wb.elevY) / 3))));
          if (maxSeamElev < minWallElev + 25) continue;
          const newWdElev = Math.max(minWallElev + 25, Math.min(maxSeamElev, clampedElev));
          for (const wb of wallsBelow) {
            wb.height = Math.max(25, newWdElev - wb.elevY);
            clampBoxInternalsAfterResize(wb);
          }
          wd.elevY = newWdElev;
          wd.height = Math.max(25, Math.min(w.height - wd.elevY, oldSrcTop - wd.elevY));
          newSrcTop = wd.elevY + wd.height;
        } else if (fridgeBelow) {
          wd.elevY = fridgeBelow.elevY + fridgeBelow.height;
          wd.height = Math.max(25, Math.min(w.height - wd.elevY, newSrcTop - wd.elevY));
        } else if (wallsBelow.length === 0) {
          wd.elevY = Math.max(95, Math.min(w.height - 25, clampedElev));
          wd.height = Math.max(25, Math.min(w.height - wd.elevY, newSrcTop - wd.elevY));
        } else {
          // Dragging top crown of upper wall-deep: keep middle seam fixed and adjust top height
          const seamY = Math.max(...wallsBelow.map((wb) => wb.elevY + wb.height));
          wd.elevY = seamY;
          wd.height = Math.max(25, Math.min(w.height - wd.elevY, newSrcTop - wd.elevY));
        }

        clampBoxInternalsAfterResize(wd);
      }

      // If single-tier wall cabinets aligned with this box before, align their crown top as well
      if (!bottomMoved) {
        for (const wb of w.boxes) {
          if (wb.type !== 'wall') continue;
          const hasUpperAbove = w.boxes.some((u) => u.type === 'wall-deep' && horizOverlap(u, wb));
          if (!hasUpperAbove && Math.abs(wb.elevY + wb.height - oldSrcTop) <= 8) {
            wb.height = Math.max(25, Math.min(w.height - wb.elevY, newSrcTop - wb.elevY));
            clampBoxInternalsAfterResize(wb);
          }
        }
      }
    }
  }

  // Compute the unified crown top line across project walls
  const crownTops: number[] = [];
  for (const w of walls) {
    for (const b of w.boxes) {
      if (b.type === 'wall' || b.type === 'wall-deep') {
        crownTops.push(b.elevY + b.height);
      }
    }
  }
  const unifiedCrownTop = crownTops.length ? Math.max(...crownTops) : newSrcTop;

  // Find all tall cabinets attached (directly or through adjacent cabinet runs or corner junctions) to any wall/wall-deep
  const attachedKeys = new Set<string>();
  const queue: Array<{ wallId: string; boxId: string }> = [];

  for (const w of walls) {
    for (const b of w.boxes) {
      if (b.type === 'wall' || b.type === 'wall-deep') {
        const key = `${w.id}:${b.id}`;
        attachedKeys.add(key);
        queue.push({ wallId: w.id, boxId: b.id });
      }
    }
  }

  const junctions = detectCornerJunctions(walls, {});

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const curWall = walls.find((w) => w.id === cur.wallId);
    const curBox = curWall?.boxes.find((b) => b.id === cur.boxId);
    if (!curWall || !curBox) continue;

    // Same-wall horizontal adjacency within <= 6cm
    for (const other of curWall.boxes) {
      const k = `${curWall.id}:${other.id}`;
      if (attachedKeys.has(k)) continue;
      const gapL = Math.abs(other.offsetX + other.width - curBox.offsetX);
      const gapR = Math.abs(curBox.offsetX + curBox.width - other.offsetX);
      const overlapsH = horizOverlap(curBox, other);
      if (gapL <= 6 || gapR <= 6 || overlapsH) {
        attachedKeys.add(k);
        queue.push({ wallId: curWall.id, boxId: other.id });
      }
    }

    // Cross-wall corner junction adjacency
    for (const j of junctions) {
      const isA = j.wallAId === curWall.id;
      const isB = j.wallBId === curWall.id;
      if (!isA && !isB) continue;
      const myEnd = isA ? j.wallAEnd : j.wallBEnd;
      const nearMyEnd =
        myEnd === 'start'
          ? curBox.offsetX <= 68
          : curBox.offsetX + curBox.width >= curWall.length - 68;
      if (!nearMyEnd) continue;

      const otherWallId = isA ? j.wallBId : j.wallAId;
      const otherEnd = isA ? j.wallBEnd : j.wallAEnd;
      const otherWall = walls.find((w) => w.id === otherWallId);
      if (!otherWall) continue;

      for (const ob of otherWall.boxes) {
        const k = `${otherWall.id}:${ob.id}`;
        if (attachedKeys.has(k)) continue;
        const nearOtherEnd =
          otherEnd === 'start'
            ? ob.offsetX <= 68
            : ob.offsetX + ob.width >= otherWall.length - 68;
        if (nearOtherEnd) {
          attachedKeys.add(k);
          queue.push({ wallId: otherWall.id, boxId: ob.id });
        }
      }
    }
  }

  for (const w of walls) {
    const wallCrownTops = w.boxes
      .filter((b) => b.type === 'wall' || b.type === 'wall-deep')
      .map((b) => b.elevY + b.height);
    const wallCrown = wallCrownTops.length ? Math.max(...wallCrownTops) : unifiedCrownTop;

    for (const b of w.boxes) {
      if (b.type !== 'tall') continue;
      if (!attachedKeys.has(`${w.id}:${b.id}`)) continue;
      b.height = Math.max(150, Math.min(w.height - b.elevY, wallCrown - b.elevY));
      clampBoxInternalsAfterResize(b);
    }
  }

  return true;
}

export function isCabinetCrown(wall: Wall, box: CabinetBox) {
  return box.type === 'tall' || box.type === 'wall-deep' || (box.type === 'wall' && !wall.boxes.some(above =>
    above.type === 'wall-deep' && !above.linkedToBoxId && Math.abs(above.elevY - box.elevY - box.height) <= 2 &&
    above.offsetX < box.offsetX + box.width - 2 && above.offsetX + above.width > box.offsetX + 2));
}

export function setCabinetCrownHeight(walls: Wall[], top: number): boolean {
  const crowns = walls.flatMap(wall => wall.boxes.filter(box => isCabinetCrown(wall, box)).map(box => ({ wall, box })));
  if (!crowns.length || !Number.isFinite(top)) return false;
  for (const { wall, box } of crowns) {
    const lower = box.type === 'wall-deep' && !box.linkedToBoxId ? wall.boxes.filter(other => other.type === 'wall' &&
      Math.abs(other.elevY + other.height - box.elevY) <= 2 && other.offsetX < box.offsetX + box.width - 2 &&
      other.offsetX + other.width > box.offsetX + 2) : [];
    const minTop = Math.max(box.elevY + (box.type === 'tall' ? 150 : 25), ...lower.map(other => other.elevY + other.height * 3));
    if (top < minTop - 0.1 || top > wall.height + 0.1) return false;
    const oldTop = box.elevY + box.height;
    if (wall.openings?.some(opening => opening.elevY >= oldTop - 0.1 && opening.elevY < top - 0.1 &&
      opening.offsetX < box.offsetX + box.width - 0.1 && opening.offsetX + opening.width > box.offsetX + 0.1)) return false;
  }
  for (const { box } of crowns) {
    box.height = +(top - box.elevY).toFixed(1);
    clampBoxInternalsAfterResize(box);
  }
  return true;
}

export interface BacksplashSpan {
  startCm: number;
  endCm: number;
  botY: number;
  topY: number;
}

/**
 * Computes exact kitchen backsplash tile regions above base countertops
 * up to underside of wall cabinets / chimney hoods, trimming under windows
 * and excluding tall/fridge/closet/door/column obstructions.
 */
export function computeWallBacksplashSpans(
  wall: Wall,
  walls: Wall[] = [wall],
  cornerOwners: Record<string, string> = {},
): BacksplashSpan[] {
  const bases = wall.boxes.filter(b => b.type === 'base' && b.width >= 5);
  const surfaces = bases.map(b => ({ start: b.offsetX, end: b.offsetX + b.width, top: b.elevY + b.height }));
  const v = getWallVectors(wall);

  for (const junction of detectCornerJunctions(walls, cornerOwners)) {
    const isA = junction.wallAId === wall.id;
    if (!isA && junction.wallBId !== wall.id) continue;
    const other = walls.find(w => w.id === (isA ? junction.wallBId : junction.wallAId));
    if (!other) continue;
    const hereEnd = isA ? junction.wallAEnd : junction.wallBEnd;
    const otherEnd = isA ? junction.wallBEnd : junction.wallAEnd;
    const corner = analyzeCornerJunction(wall, hereEnd, other, otherEnd);
    if (corner.kind === 'outside' || corner.kind === 'mismatched') continue;

    const n = getWallVectors(other);
    const dx = wall.x1Cm - other.x1Cm;
    const dy = wall.y1Cm - other.y1Cm;
    const along = dx * n.tx + dy * n.ty;
    const depth = dx * n.nx + dy * n.ny;
    const alongRate = v.tx * n.tx + v.ty * n.ty;
    const depthRate = v.tx * n.nx + v.ty * n.ny;
    for (const base of other.boxes) {
      if (base.type !== 'base' || base.countertopCm <= 0) continue;
      let start = 0;
      let end = wall.length;
      const clip = (origin: number, rate: number, low: number, high: number) => {
        if (Math.abs(rate) < 1e-6) return origin >= low && origin <= high;
        const a = (low - origin) / rate;
        const b = (high - origin) / rate;
        start = Math.max(start, Math.min(a, b));
        end = Math.min(end, Math.max(a, b));
        return end > start;
      };
      if (!clip(along, alongRate, base.offsetX - 1, base.offsetX + base.width + 1)) continue;
      if (!clip(depth, depthRate, -1, base.depth + 2)) continue;
      const cuts = [start, end, ...surfaces.flatMap(span => [span.start, span.end]).filter(x => x > start && x < end)]
        .sort((a, b) => a - b);
      for (let i = 0; i + 1 < cuts.length; i++) {
        const mid = (cuts[i] + cuts[i + 1]) / 2;
        if (!surfaces.some(span => mid >= span.start && mid <= span.end))
          surfaces.push({ start: cuts[i], end: cuts[i + 1], top: base.elevY + base.height });
      }
    }
  }
  if (!surfaces.length) return [];

  const wallCabs = wall.boxes.filter((b) => b.type === 'wall' || b.type === 'wall-deep');
  const defaultWallElev =
    wallCabs.length > 0
      ? Math.min(...wallCabs.filter((b) => b.type === 'wall').map((b) => b.elevY).concat([WALL_LOWER_ELEV_CM]))
      : WALL_LOWER_ELEV_CM;

  const fullBlockers = wall.boxes.filter(
    (b) => b.type === 'fridge' || b.type === 'tall' || b.type === 'closet'
  );
  const openings = wall.openings || [];
  const chimneyGases = wall.appliances.filter((a) => a.kind === 'gas' && effectiveHoodKind(wall, a) === 'chimney');

  const raw: BacksplashSpan[] = [];

  for (const surface of surfaces) {
    const bStart = surface.start;
    const bEnd = surface.end;
    const botY = surface.top;

    const cutSet = new Set<number>([bStart, bEnd]);
    for (const wc of wallCabs) {
      if (wc.offsetX > bStart && wc.offsetX < bEnd) cutSet.add(wc.offsetX);
      if (wc.offsetX + wc.width > bStart && wc.offsetX + wc.width < bEnd) {
        cutSet.add(wc.offsetX + wc.width);
      }
    }
    for (const fb of fullBlockers) {
      if (fb.offsetX > bStart && fb.offsetX < bEnd) cutSet.add(fb.offsetX);
      if (fb.offsetX + fb.width > bStart && fb.offsetX + fb.width < bEnd) {
        cutSet.add(fb.offsetX + fb.width);
      }
    }
    for (const op of openings) {
      if (op.offsetX > bStart && op.offsetX < bEnd) cutSet.add(op.offsetX);
      if (op.offsetX + op.width > bStart && op.offsetX + op.width < bEnd) {
        cutSet.add(op.offsetX + op.width);
      }
    }
    for (const g of chimneyGases) {
      if (g.offsetX > bStart && g.offsetX < bEnd) cutSet.add(g.offsetX);
      if (g.offsetX + g.width > bStart && g.offsetX + g.width < bEnd) {
        cutSet.add(g.offsetX + g.width);
      }
    }

    const cuts = Array.from(cutSet).sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const sX = cuts[i];
      const eX = cuts[i + 1];
      if (eX - sX < 2) continue;
      const midX = (sX + eX) / 2;

      // Skip if blocked by tall/fridge/closet occupying zone above counter
      const blockedByTall = fullBlockers.some(
        (fb) => midX >= fb.offsetX && midX <= fb.offsetX + fb.width && fb.elevY < defaultWallElev && fb.elevY + fb.height > botY + 5
      );
      if (blockedByTall) continue;

      let topY = defaultWallElev;

      // Overhead wall cabinet controls exact top height
      const overheadWall = wall.boxes.find(
        (wc) => wc.type === 'wall' && midX >= wc.offsetX && midX <= wc.offsetX + wc.width
      );
      if (overheadWall) {
        topY = Math.max(botY + 5, overheadWall.elevY);
      } else {
        const overheadChimney = chimneyGases.some(
          (g) => midX >= g.offsetX && midX <= g.offsetX + g.width
        );
        if (overheadChimney) {
          topY = Math.max(defaultWallElev, 156);
        }
      }

      // Openings overlapping horizontally: skip if door/column, or clamp below window sill
      let blockedByOpening = false;
      for (const op of openings) {
        if (midX < op.offsetX || midX > op.offsetX + op.width) continue;
        if (op.kind === 'door' || op.kind === 'column') {
          if (op.elevY < topY && op.elevY + op.height > botY + 2) {
            blockedByOpening = true;
            break;
          }
        } else if (op.kind === 'window') {
          if (op.elevY <= botY + 6) {
            blockedByOpening = true;
            break;
          }
          if (op.elevY < topY) {
            topY = op.elevY;
          }
        }
      }
      if (blockedByOpening || topY - botY < 8) continue;

      raw.push({
        startCm: +sX.toFixed(1),
        endCm: +eX.toFixed(1),
        botY: +botY.toFixed(1),
        topY: +topY.toFixed(1),
      });
    }
  }

  // Merge adjacent segments that share exact vertical bounds
  raw.sort((a, b) => a.startCm - b.startCm);
  const merged: BacksplashSpan[] = [];
  for (const sp of raw) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      Math.abs(prev.endCm - sp.startCm) <= 1.2 &&
      Math.abs(prev.botY - sp.botY) <= 0.5 &&
      Math.abs(prev.topY - sp.topY) <= 0.5
    ) {
      prev.endCm = Math.max(prev.endCm, sp.endCm);
    } else {
      merged.push({ ...sp });
    }
  }
  return merged;
}

/**
 * Computes usable vertical carcass height (in cm) for internal shelves inside a cabinet box.
 */
export function getBoxInteriorHeightCm(box: CabinetBox): number {
  const frameInsets = getBoxFrameInsets(box);
  return Math.max(
    10,
    +(box.height - box.plinth - box.countertopCm - frameInsets.top - frameInsets.bottom).toFixed(1)
  );
}

/**
 * Clamps or validates a single shelf vertical ratio (`yRatio`) inside `[startCm .. endCm]`
 * ensuring at least `MIN_SHELF_GAP_CM` (25 cm) clearance between adjacent shelves and reasonable interior margin.
 */
export function clampShelfRatioWithMinGap(
  box: CabinetBox,
  desiredRatio: number,
  startCm: number,
  endCm: number,
  excludeShelfId?: string
): { ok: boolean; ratio: number; minGapCm: number; reason?: string } {
  const innerH = getBoxInteriorHeightCm(box);
  const edgeMarginCm = Math.min(MIN_SHELF_GAP_CM * 0.45, Math.max(8, innerH * 0.12));
  const minEdgeRatio = Math.min(0.45, edgeMarginCm / innerH);
  const maxEdgeRatio = Math.max(0.55, 1 - edgeMarginCm / innerH);
  const minGapRatio = MIN_SHELF_GAP_CM / innerH;

  const siblings = box.shelves
    .filter(
      (sh) =>
        sh.id !== excludeShelfId &&
        sh.orient !== 'vertical' &&
        sh.endCm > startCm + 2 &&
        sh.startCm < endCm - 2
    )
    .map((sh) => sh.yRatio)
    .sort((a, b) => a - b);

  const clampedDesired = Math.max(minEdgeRatio, Math.min(maxEdgeRatio, desiredRatio));

  if (siblings.length === 0) {
    return {
      ok: true,
      ratio: +clampedDesired.toFixed(3),
      minGapCm: MIN_SHELF_GAP_CM,
    };
  }

  // Dragging an existing shelf keeps it strictly within its neighboring shelves' [prev + 25cm, next - 25cm] corridor
  if (excludeShelfId) {
    const dragged = box.shelves.find((sh) => sh.id === excludeShelfId);
    const anchor = dragged ? dragged.yRatio : clampedDesired;
    let prev: number | null = null;
    let next: number | null = null;
    for (const r of siblings) {
      if (r <= anchor) prev = r;
      else if (next === null) next = r;
    }
    const lo = prev !== null ? Math.max(minEdgeRatio, prev + minGapRatio) : minEdgeRatio;
    const hi = next !== null ? Math.min(maxEdgeRatio, next - minGapRatio) : maxEdgeRatio;
    if (lo > hi + 0.001) {
      return {
        ok: true,
        ratio: +Math.max(minEdgeRatio, Math.min(maxEdgeRatio, anchor)).toFixed(3),
        minGapCm: MIN_SHELF_GAP_CM,
      };
    }
    const finalR = Math.max(lo, Math.min(hi, clampedDesired));
    return {
      ok: true,
      ratio: +finalR.toFixed(3),
      minGapCm: MIN_SHELF_GAP_CM,
    };
  }

  // Placing a new shelf: inspect all open intervals [a .. b] around sibling shelves
  const intervals: Array<{ lo: number; hi: number }> = [];
  let prev = minEdgeRatio - minGapRatio;
  for (const r of siblings) {
    const lo = Math.max(minEdgeRatio, prev + minGapRatio);
    const hi = Math.min(maxEdgeRatio, r - minGapRatio);
    if (lo <= hi + 0.001) intervals.push({ lo, hi: Math.max(lo, hi) });
    prev = r;
  }
  const tailLo = Math.max(minEdgeRatio, prev + minGapRatio);
  if (tailLo <= maxEdgeRatio + 0.001) {
    intervals.push({ lo: tailLo, hi: Math.max(tailLo, maxEdgeRatio) });
  }

  if (intervals.length === 0) {
    return {
      ok: false,
      ratio: +clampedDesired.toFixed(3),
      minGapCm: MIN_SHELF_GAP_CM,
      reason: `حداقل فاصله مجاز بین طبقات ${MIN_SHELF_GAP_CM} سانتی‌متر است`,
    };
  }

  let bestRatio = intervals[0].lo;
  let bestDist = Infinity;
  for (const iv of intervals) {
    const candidate = Math.max(iv.lo, Math.min(iv.hi, clampedDesired));
    const dist = Math.abs(candidate - clampedDesired);
    if (dist < bestDist) {
      bestDist = dist;
      bestRatio = candidate;
    }
  }

  return {
    ok: true,
    ratio: +bestRatio.toFixed(3),
    minGapCm: MIN_SHELF_GAP_CM,
  };
}

/**
 * Adds an internal vertical partition inside a bay `[startCm..endCm]` with automatic 50% center snap.
 */
export function addVerticalDividerWithCenterSnap(
  box: CabinetBox,
  startCm: number,
  endCm: number,
  rawXRatio = 0.5
): { ok: boolean; xRatio: number; snappedCenter: boolean; message: string } {
  const bayW = +(endCm - startCm).toFixed(1);
  if (bayW < 24) {
    return { ok: false, xRatio: 0.5, snappedCenter: false, message: 'عرض یونیت برای تقسیم عمودی کافی نیست' };
  }
  const minEdgeRatio = Math.max(0.15, 12 / bayW);
  const maxEdgeRatio = Math.min(0.85, 1 - 12 / bayW);
  let xr = Math.max(minEdgeRatio, Math.min(maxEdgeRatio, rawXRatio));
  const snappedCenter = Math.abs(xr - 0.5) <= 0.07;
  if (snappedCenter) xr = 0.5;
  xr = +xr.toFixed(3);

  const duplicate = box.shelves.some(
    (sh) =>
      sh.orient === 'vertical' &&
      sh.endCm > startCm + 2 &&
      sh.startCm < endCm - 2 &&
      Math.abs((sh.xRatio ?? 0.5) - xr) < 12 / bayW
  );
  if (duplicate) {
    return { ok: false, xRatio: xr, snappedCenter, message: 'در این نقطه یا نزدیک آن جداکننده عمودی وجود دارد' };
  }

  box.shelves.push({
    id: uid('sh'),
    startCm,
    endCm,
    yRatio: 0.5,
    orient: 'vertical',
    xRatio: xr,
  });

  return {
    ok: true,
    xRatio: xr,
    snappedCenter,
    message: snappedCenter ? 'جداکننده عمودی در مرکز یونیت (۵۰٪) ثبت شد' : 'جداکننده عمودی داخلی ثبت شد',
  };
}

/**
 * Adds 1 or more horizontal shelves inside a unit bay `[startCm .. endCm]` while enforcing `MIN_SHELF_GAP_CM` (25 cm).
 */
export function addShelvesWithMinGap(
  box: CabinetBox,
  startCm: number,
  endCm: number,
  requestedCount: number,
  clickRatio?: number
): { ok: boolean; added: number; message: string } {
  const count = Math.max(1, Math.min(6, Math.round(requestedCount)));
  const innerH = getBoxInteriorHeightCm(box);

  if (count === 1) {
    const check = clampShelfRatioWithMinGap(box, clickRatio ?? 0.5, startCm, endCm);
    if (!check.ok) {
      return {
        ok: false,
        added: 0,
        message: check.reason || `حداقل فاصله بین طبقات ${MIN_SHELF_GAP_CM} سانتی‌متر است`,
      };
    }
    box.shelves.push({
      id: uid('sh'),
      startCm,
      endCm,
      yRatio: check.ratio,
      orient: 'horizontal',
    });
    return { ok: true, added: 1, message: 'طبقه در یونیت اضافه شد' };
  }

  const minGapRatio = MIN_SHELF_GAP_CM / innerH;
  const candidateRatios = Array.from({ length: count }, (_, i) => +((i + 1) / (count + 1)).toFixed(3));
  const stepCm = innerH / (count + 1);
  if (stepCm < MIN_SHELF_GAP_CM - 0.5) {
    return {
      ok: false,
      added: 0,
      message: `با حداقل فاصله ${MIN_SHELF_GAP_CM}cm، حداکثر ${Math.max(
        1,
        Math.floor(innerH / MIN_SHELF_GAP_CM) - 1
      )} طبقه منظم در این ارتفاع جا می‌گیرد`,
    };
  }

  const existingInBay = box.shelves.filter(
    (sh) => sh.orient !== 'vertical' && sh.endCm > startCm + 2 && sh.startCm < endCm - 2
  );
  const validCandidates = candidateRatios.filter((r) =>
    existingInBay.every((sh) => Math.abs(sh.yRatio - r) >= minGapRatio - 0.005)
  );
  if (validCandidates.length === 0) {
    return {
      ok: false,
      added: 0,
      message: `در این یونیت با رعایت حداقل فاصله ${MIN_SHELF_GAP_CM} سانتی‌متر فضای کافی برای طبقه جدید نیست`,
    };
  }

  for (const r of validCandidates) {
    box.shelves.push({
      id: uid('sh'),
      startCm,
      endCm,
      yRatio: r,
      orient: 'horizontal',
    });
  }
  return {
    ok: true,
    added: validCandidates.length,
    message: `${validCandidates.length} طبقه منظم در یونیت اضافه شد`,
  };
}

export interface BoxCarpentryElement {
  kind: 'corner-filler' | 'top-rail' | 'side-stile';
  startCm: number;
  widthCm: number;
  topOffsetCm: number;
  heightCm: number;
  depthMode: 'corner-filler' | 'rail';
}

/**
 * Computes derived architectural front-carcass carpentry strips for a box:
 * - `corner-filler` (~5cm): vertical panel sealing trimmed inside L-corner swing clearance gaps
 * - `side-stile` (~5cm): vertical side front stops at corner edges, outer box ends, and flanking drawer units
 *   (NEVER placed between symmetric paired hinged doors so central unit access stays unobstructed)
 * - `top-rail` (~5cm): horizontal top stretcher ONLY on base hinged units without drawers
 */
export function getBoxCarpentryElements(
  box: CabinetBox,
  wall?: Wall | null,
  blockedZones: BlockedZone[] = [],
  columns: RoomColumn[] = []
): BoxCarpentryElement[] {
  if (box.type === 'fridge') return [];
  const innerH = getBoxInteriorHeightCm(box);
  const usable = getBoxUsableFrontSpan(box, blockedZones);
  if (usable.endCm - usable.startCm < 12) return [];

  const boxTier = getBoxTier(box);
  const colSpans = wall ? getWallColumnSpans(wall, columns) : [];
  const chimneyIntervals =
    (box.type === 'wall' || box.type === 'wall-deep') && !box.linkedToBoxId && wall
      ? wall.appliances
          .filter(
            (a) =>
              a.kind === 'gas' &&
              effectiveHoodKind(wall, a) !== 'hidden' &&
              a.offsetX < box.offsetX + box.width - 5 &&
              a.offsetX + a.width > box.offsetX + 5
          )
          .map((a) => ({
            s: Math.max(0, a.offsetX - box.offsetX),
            e: Math.min(box.width, a.offsetX + a.width - box.offsetX),
          }))
          .filter((iv) => iv.e - iv.s >= 25)
      : [];

  const overlapsVoid = (s: number, e: number): boolean => {
    for (const iv of chimneyIntervals) {
      if (e > iv.s + 1 && s < iv.e - 1) return true;
    }
    for (const cs of colSpans) {
      const vOv = box.elevY < cs.elevY + cs.height - 1 && box.elevY + box.height > cs.elevY + 1;
      if (!vOv) continue;
      const ls = cs.startCm - box.offsetX;
      const le = cs.endCm - box.offsetX;
      if (e > ls + 0.5 && s < le - 0.5) return true;
    }
    return false;
  };

  const out: BoxCarpentryElement[] = [];
  const verticalZones: Array<{ startCm: number; endCm: number }> = [];
  const addVerticalIfFree = (
    kind: 'corner-filler' | 'side-stile',
    sRaw: number,
    eRaw: number,
    depthMode: 'corner-filler' | 'rail'
  ) => {
    const s = +Math.max(0, sRaw).toFixed(2);
    const e = +Math.min(box.width, eRaw).toFixed(2);
    const w = +(e - s).toFixed(2);
    if (w < 2) return;
    if (overlapsVoid(s, e)) return;
    if (verticalZones.some((z) => e > z.startCm + 0.4 && s < z.endCm - 0.4)) return;
    verticalZones.push({ startCm: s, endCm: e });
    out.push({
      kind,
      startCm: s,
      widthCm: w,
      topOffsetCm: 0,
      heightCm: innerH,
      depthMode,
    });
  };

  // 1. Inside-corner vertical fillers (~5cm) matching door trim clearances
  for (const z of blockedZones) {
    const tierMatches =
      z.tier === boxTier || ((box.type === 'tall' || box.type === 'closet') && z.tier === 'lower');
    if (!tierMatches) continue;
    const ls = +(z.startCm - box.offsetX).toFixed(1);
    const le = +(z.endCm - box.offsetX).toFixed(1);

    const doorAtLeft = box.doors.find((d) => Math.abs(d.startCm - le) <= 0.8);
    if (le >= -0.5 && le < box.width - 10) {
      if (doorAtLeft) {
        if (doorAtLeft.widthCm >= 34) {
          addVerticalIfFree('corner-filler', doorAtLeft.startCm, doorAtLeft.startCm + CORNER_FILLER_CM, 'corner-filler');
        }
      } else if (!box.doors.some((d) => d.startCm < le + CORNER_FILLER_CM - 0.5 && d.startCm + d.widthCm > le + 0.5)) {
        addVerticalIfFree('corner-filler', le, le + CORNER_FILLER_CM, 'corner-filler');
      }
    }

    const doorAtRight = box.doors.find((d) => Math.abs(d.startCm + d.widthCm - ls) <= 0.8);
    if (ls > 10 && ls <= box.width + 0.5) {
      if (doorAtRight) {
        if (doorAtRight.widthCm >= 34) {
          addVerticalIfFree(
            'corner-filler',
            doorAtRight.startCm + doorAtRight.widthCm - CORNER_FILLER_CM,
            doorAtRight.startCm + doorAtRight.widthCm,
            'corner-filler'
          );
        }
      } else if (!box.doors.some((d) => d.startCm < ls - 0.5 && d.startCm + d.widthCm > ls - CORNER_FILLER_CM + 0.5)) {
        addVerticalIfFree('corner-filler', ls - CORNER_FILLER_CM, ls, 'corner-filler');
      }
    }
  }

  const units = getUnitsInBox(box, blockedZones);

  // 2. Vertical 5cm stiles around drawer units (keeps drawer front from recessing inward)
  for (const u of units) {
    const uDoors = box.doors.filter(
      (d) => d.startCm < u.endCm - 1 && d.startCm + d.widthCm > u.startCm + 1
    );
    if (!uDoors.some((d) => d.kind === 'drawer')) continue;
    addVerticalIfFree('side-stile', u.startCm, Math.min(u.endCm, u.startCm + CARCASS_STILE_CM), 'rail');
    addVerticalIfFree('side-stile', Math.max(u.startCm, u.endCm - CARCASS_STILE_CM), u.endCm, 'rail');
  }

  // 3. Outer exposed box edges (never between symmetric double doors)
  const leftUnit = units[0];
  const leftHasOpen =
    leftUnit &&
    box.doors.some(
      (d) =>
        d.startCm < leftUnit.endCm - 1 &&
        d.startCm + d.widthCm > leftUnit.startCm + 1 &&
        (d.kind === 'open' || d.kind === 'rail')
    );
  if (!leftHasOpen) {
    addVerticalIfFree('side-stile', usable.startCm, usable.startCm + CARCASS_STILE_CM, 'rail');
  }

  const rightUnit = units[units.length - 1];
  const rightHasOpen =
    rightUnit &&
    box.doors.some(
      (d) =>
        d.startCm < rightUnit.endCm - 1 &&
        d.startCm + d.widthCm > rightUnit.startCm + 1 &&
        (d.kind === 'open' || d.kind === 'rail')
    );
  if (!rightHasOpen) {
    addVerticalIfFree('side-stile', usable.endCm - CARCASS_STILE_CM, usable.endCm, 'rail');
  }

  // 4. Horizontal top rail (~5cm tall) ONLY on base hinged units without drawers
  if (box.type === 'base') {
    for (const u of units) {
      if (u.widthCm < 15 || overlapsVoid(u.startCm, u.endCm)) continue;
      const uDoors = box.doors.filter(
        (d) => d.startCm < u.endCm - 1 && d.startCm + d.widthCm > u.startCm + 1
      );
      if (uDoors.length === 0) continue;
      const hasDrawerOrOpen = uDoors.some(
        (d) =>
          d.kind === 'drawer' ||
          d.kind === 'fridge' ||
          d.kind === 'open' ||
          d.kind === 'rail' ||
          d.drawerBand?.position === 'top'
      );
      if (hasDrawerOrOpen || !uDoors.some((d) => d.kind === 'door')) continue;

      let railStart = u.startCm;
      let railEnd = u.endCm;
      for (const vz of verticalZones) {
        if (vz.startCm <= railStart + 1 && vz.endCm > railStart) {
          railStart = Math.max(railStart, vz.endCm);
        }
        if (vz.endCm >= railEnd - 1 && vz.startCm < railEnd) {
          railEnd = Math.min(railEnd, vz.startCm);
        }
      }
      const railW = +(railEnd - railStart).toFixed(2);
      if (railW >= 4) {
        out.push({
          kind: 'top-rail',
          startCm: +railStart.toFixed(2),
          widthCm: railW,
          topOffsetCm: 0,
          heightCm: CARCASS_STILE_CM,
          depthMode: 'rail',
        });
      }
    }
  }

  return out;
}

/**
 * Automatically populates internal shelves per unit bay according to cabinet type:
 * - Wall horizontal (`lift`): shelves aligned with horizontal split seams (`drawerRatios`, including over-sink)
 * - Wall vertical (`door`): 1 to 3 shelves based on usable interior height (`MIN_SHELF_GAP_CM = 25`)
 * - Base hinged (`door`): 1 removable middle shelf (`0.5`), skipping sink bays, drawers, and pullout pantries
 */
export function populateSmartShelvesForBox(
  box: CabinetBox,
  wall?: Wall | null,
  blockedZones: BlockedZone[] = [],
  opts?: { replaceExisting?: boolean }
): number {
  if (box.type === 'fridge') return 0;
  const isWall = box.type === 'wall' || box.type === 'wall-deep';
  const isBase = box.type === 'base';
  if (!isWall && !isBase) return 0;

  const innerH = getBoxInteriorHeightCm(box);
  const units = getUnitsInBox(box, blockedZones);
  const sinkApps = (wall?.appliances || []).filter((a) => a.kind === 'sink');
  let added = 0;

  for (const u of units) {
    if (u.widthCm < 15) continue;
    const uDoors = box.doors.filter(
      (d) => d.startCm < u.endCm - 1 && d.startCm + d.widthCm > u.startCm + 1
    );
    if (uDoors.length === 0) continue;

    const existingHoriz = box.shelves.filter(
      (sh) => sh.orient !== 'vertical' && sh.endCm > u.startCm + 2 && sh.startCm < u.endCm - 2
    );
    if (existingHoriz.length > 0 && !opts?.replaceExisting) continue;
    if (opts?.replaceExisting && existingHoriz.length > 0) {
      const removeIds = new Set(existingHoriz.map((s) => s.id));
      box.shelves = box.shelves.filter((s) => !removeIds.has(s.id));
    }

    if (isWall) {
      const liftDoors = uDoors.filter((d) => d.kind === 'lift');
      if (liftDoors.length > 0) {
        const expectedRatios = getWallHorizontalDrawerRatios(box);
        for (const ld of liftDoors) {
          if (box.height > MAX_LIFT_LEAF_HEIGHT_CM && ld.drawerRatios.length === 0) {
            ld.drawerRatios = [...expectedRatios];
          }
        }
        const ratios = Array.from(
          new Set(liftDoors.flatMap((ld) => ld.drawerRatios).map((r) => +r.toFixed(3)))
        ).sort((a, b) => a - b);

        for (const r of ratios) {
          if (r <= 0.1 || r >= 0.9) continue;
          const dup = box.shelves.some(
            (sh) =>
              sh.orient !== 'vertical' &&
              sh.endCm > u.startCm + 2 &&
              sh.startCm < u.endCm - 2 &&
              Math.abs(sh.yRatio - r) < 0.08
          );
          if (dup) continue;
          box.shelves.push({
            id: uid('sh'),
            startCm: u.startCm,
            endCm: u.endCm,
            yRatio: r,
            orient: 'horizontal',
          });
          added++;
        }
        continue;
      }

      if (uDoors.some((d) => d.kind === 'door')) {
        const maxShelves = Math.min(3, Math.max(0, Math.floor(innerH / MIN_SHELF_GAP_CM) - 1));
        if (maxShelves > 0) {
          const res = addShelvesWithMinGap(box, u.startCm, u.endCm, maxShelves);
          added += res.added;
        }
      }
      continue;
    }

    if (isBase) {
      const skipBase = uDoors.some(
        (d) =>
          d.kind === 'drawer' ||
          d.kind === 'open' ||
          d.kind === 'rail' ||
          d.kind === 'fridge' ||
          d.hardwareKind === 'pantry-pullout'
      );
      if (skipBase) continue;

      const overlapsSink = sinkApps.some(
        (s) => s.offsetX < box.offsetX + u.endCm - 2 && s.offsetX + s.width > box.offsetX + u.startCm + 2
      );
      if (overlapsSink || innerH < 45) continue;

      const res = addShelvesWithMinGap(box, u.startCm, u.endCm, 1, 0.5);
      added += res.added;
    }
  }

  return added;
}

function getBoxObstacleIntervals(
  box: CabinetBox,
  wall?: Wall
): Array<{ startCm: number; endCm: number; kind: 'appliance' | 'drawer' | 'lift' | 'door' }> {
  const obs: Array<{ startCm: number; endCm: number; kind: 'appliance' | 'drawer' | 'lift' | 'door' }> = [];
  if (wall) {
    for (const app of wall.appliances) {
      const ls = +(app.offsetX - box.offsetX).toFixed(1);
      const le = +(ls + app.width).toFixed(1);
      if (le > 1 && ls < box.width - 1) {
        obs.push({ startCm: Math.max(0, ls), endCm: Math.min(box.width, le), kind: 'appliance' });
      }
    }
  }
  return obs;
}

/**
 * Equalizes doors across open bays of a cabinet box (averaging uneven door widths) AND expands/adds
 * uniform doors across every empty gap inside usable spans so no dead spaces remain, keeping
 * doors strictly within [30..60cm] (or [50..110cm] for horizontal wall lifts) and respecting corners/appliances.
 */
export function equalizeDoorsAndFillGaps(
  box: CabinetBox,
  blockedZones: BlockedZone[],
  wall?: Wall,
  allWalls?: Wall[],
  cornerOwners: Record<string, string> = {},
  selectedDoorId?: string | null
): { ok: boolean; message: string } {
  if (box.type === 'fridge') {
    return { ok: false, message: 'یخچال قابل تقسیم نیست' };
  }

  const isWall = box.type === 'wall' || box.type === 'wall-deep';
  const selectedDoor = selectedDoorId ? box.doors.find((d) => d.id === selectedDoorId) : undefined;
  const targetKind: DoorKind =
    selectedDoor?.kind === 'lift' || (!selectedDoor && isWall && box.doors.some((d) => d.kind === 'lift') && !box.doors.some((d) => d.kind === 'door'))
      ? 'lift'
      : 'door';

  const minW = targetKind === 'lift' && isWall ? MIN_LIFT_DOOR_CM : MIN_DOOR_CM;
  const maxW = targetKind === 'lift' && isWall ? MAX_LIFT_DOOR_CM : MAX_DOOR_CM;

  const usable = getBoxUsableFrontSpan(box, blockedZones);
  if (usable.endCm - usable.startCm < minW - 0.1) {
    return { ok: false, message: 'فضای مجاز کافی برای تنظیم درب وجود ندارد' };
  }

  // First pack/balance if there is a movable separating appliance between vertical runs AND negligible empty gaps
  const existingTargetDoors = box.doors
    .filter((d) => d.kind === targetKind)
    .sort((a, b) => a.startCm - b.startCm);

  // Build fixed obstacle intervals (drawers, non-target door kinds, appliances) inside usable span
  const obstacles: Array<{ start: number; end: number }> = [];
  for (const ob of getBoxObstacleIntervals(box, wall)) {
    const s = Math.max(usable.startCm, ob.startCm);
    const e = Math.min(usable.endCm, ob.endCm);
    if (e - s > 1) obstacles.push({ start: s, end: e });
  }
  for (const d of box.doors) {
    if (d.kind === targetKind) continue;
    const s = Math.max(usable.startCm, d.startCm);
    const e = Math.min(usable.endCm, +(d.startCm + d.widthCm).toFixed(1));
    if (e - s > 1) obstacles.push({ start: s, end: e });
  }
  obstacles.sort((a, b) => a.start - b.start);

  const mergedObs: Array<{ start: number; end: number }> = [];
  for (const ob of obstacles) {
    const last = mergedObs[mergedObs.length - 1];
    if (!last || ob.start > last.end + 0.5) {
      mergedObs.push({ ...ob });
    } else {
      last.end = Math.max(last.end, ob.end);
    }
  }

  // Extract continuous refillable open bays [bayStart, bayEnd]
  const bays: Array<{ startCm: number; endCm: number }> = [];
  let cursor = usable.startCm;
  for (const ob of mergedObs) {
    if (ob.start - cursor >= minW - 0.1) {
      bays.push({ startCm: +cursor.toFixed(1), endCm: +ob.start.toFixed(1) });
    }
    cursor = Math.max(cursor, ob.end);
  }
  if (usable.endCm - cursor >= minW - 0.1) {
    bays.push({ startCm: +cursor.toFixed(1), endCm: +usable.endCm.toFixed(1) });
  }

  if (!bays.length) {
    return { ok: false, message: 'فضای آزادی برای هم‌اندازه‌سازی و پر کردن درب وجود ندارد' };
  }

  // Average width across existing target doors (کوچیک و بزرگ میانگین میشه)
  let preferredW = targetKind === 'lift' ? 80 : 45;
  if (existingTargetDoors.length > 0) {
    preferredW = existingTargetDoors.reduce((s, d) => s + d.widthCm, 0) / existingTargetDoors.length;
  } else if (selectedDoor && selectedDoor.kind === targetKind) {
    preferredW = selectedDoor.widthCm;
  }

  let totalCreated = 0;
  let hadGap = false;
  const wallLiftRatios = targetKind === 'lift' && isWall ? getWallHorizontalDrawerRatios(box) : [];

  for (const bay of bays) {
    const bayW = +(bay.endCm - bay.startCm).toFixed(1);
    const inBay = box.doors
      .filter((d) => {
        const mid = d.startCm + d.widthCm / 2;
        return d.kind === targetKind && mid >= bay.startCm - 0.5 && mid <= bay.endCm + 0.5;
      })
      .sort((a, b) => a.startCm - b.startCm);

    // Skip completely empty bay only if box already had doors AND bay isn't adjacent/part of usable layout?
    // No — user explicitly wants empty gaps filled too!
    const existingSum = inBay.reduce((s, d) => s + d.widthCm, 0);
    if (bayW - existingSum > 2) hadGap = true;

    const minN = Math.max(1, Math.ceil(bayW / maxW));
    const maxN = Math.max(minN, Math.floor(bayW / minW));

    let bestN = minN;
    let bestScore = Infinity;
    for (let n = minN; n <= maxN; n++) {
      const w = bayW / n;
      if (w < minW - 0.1 || w > maxW + 0.1) continue;
      let score = Math.abs(w - preferredW);
      // Slight preference to match or expand existing door count when filling empty space
      if (inBay.length > 0 && n < inBay.length) score += 4;
      if (score < bestScore - 0.01) {
        bestScore = score;
        bestN = n;
      }
    }

    const eachW = +(bayW / bestN).toFixed(1);
    if (eachW < minW - 0.1 || eachW > maxW + 0.1) continue;

    const removedIds = new Set(inBay.map((d) => d.id));
    const oldHandles = box.handles.filter((h) => removedIds.has(h.doorId));
    const templateDoor = selectedDoor?.kind === targetKind ? selectedDoor : inBay[0];

    box.doors = box.doors.filter((d) => !removedIds.has(d.id));
    box.handles = box.handles.filter((h) => !removedIds.has(h.doorId));

    // Drop old dividers strictly inside this bay (not boundary dividers on bay edges)
    box.unitDividers = box.unitDividers.filter(
      (u) => u <= bay.startCm + 1.5 || u >= bay.endCm - 1.5
    );
    if (box.frames?.length) {
      box.frames = box.frames.filter(
        (f) =>
          f.side !== 'seam' ||
          f.seamCm === undefined ||
          f.seamCm <= bay.startCm + 1.5 ||
          f.seamCm >= bay.endCm - 1.5
      );
    }

    const newBayDoors: DoorUnit[] = [];
    for (let i = 0; i < bestN; i++) {
      const startCm = +(bay.startCm + i * eachW).toFixed(1);
      const widthCm = i === bestN - 1 ? +(bay.endCm - startCm).toFixed(1) : eachW;
      const hingeSide: 'left' | 'right' | undefined =
        targetKind === 'door'
          ? bestN === 2
            ? i === 0
              ? 'left'
              : 'right'
            : templateDoor?.hingeSide
          : undefined;
      const nd: DoorUnit = {
        id: uid('door'),
        startCm,
        widthCm,
        kind: targetKind,
        doorStyle: templateDoor?.doorStyle,
        hingeSide,
        drawerBand: targetKind === 'door' && templateDoor?.drawerBand ? { ...templateDoor.drawerBand } : undefined,
        drawerRatios:
          targetKind === 'lift'
            ? [...(templateDoor?.drawerRatios?.length ? templateDoor.drawerRatios : wallLiftRatios)]
            : [],
      };
      box.doors.push(nd);
      newBayDoors.push(nd);
      totalCreated++;

      // Auto-unit dividers cleanly every 1 or 2 doors when bay has lift doors or wide run
      if (targetKind === 'lift' && i < bestN - 1) {
        box.unitDividers.push(+(startCm + widthCm).toFixed(1));
      }
    }

    // Reattach handles onto proportional matching new doors
    if (oldHandles.length > 0 && newBayDoors.length > 0) {
      const sampleH = oldHandles[0];
      newBayDoors.forEach((nd, idx) => {
        const xRatio =
          targetKind === 'lift'
            ? 0.5
            : newBayDoors.length === 2
            ? idx === 0
              ? 0.86
              : 0.14
            : nd.hingeSide === 'right'
            ? 0.14
            : 0.86;
        box.handles.push({
          id: uid('hnd'),
          doorId: nd.id,
          style: sampleH.style,
          orient: targetKind === 'lift' ? 'horizontal' : sampleH.orient,
          lengthCm: sampleH.lengthCm,
          xRatio,
          yRatio: sampleH.yRatio,
          rowIndex: sampleH.rowIndex,
        });
      });
    }
  }

  box.doors.sort((a, b) => a.startCm - b.startCm);
  box.unitDividers = Array.from(new Set(box.unitDividers.map((u) => +u.toFixed(1)))).sort((a, b) => a - b);

  // If vertical doors are separated by a movable gas/sink appliance across runs, try global balance too
  if (wall && targetKind === 'door') {
    const hingedNow = box.doors.filter((d) => d.kind === 'door').sort((a, b) => a.startCm - b.startCm);
    if (hingedNow.length >= 2) {
      const balanced = tryEqualizeVerticalWithMovableAppliance(
        box,
        hingedNow,
        wall,
        allWalls || [wall],
        cornerOwners
      );
      if (balanced) return balanced;
    }
  }

  if (totalCreated === 0) {
    return { ok: false, message: 'تغییری برای هم‌اندازه‌سازی یا پر کردن فضا لازم نبود' };
  }

  return {
    ok: true,
    message: hadGap
      ? `درب‌ها هم‌اندازه شدند و فضاهای خالی باکس به شکل یکنواخت پر شدند (${totalCreated} درب)`
      : `${totalCreated} درب باکس هم‌اندازه و مرتب شدند`,
  };
}

/**
 * Compacts scattered / disconnected doors inside a box so dead slivers (<30cm) are eliminated
 * and disconnected doors sit cleanly together. Also optimizes movable appliances inside `box`
 * (`dishwasher`/`washing` via `optimizeBoxWithAppliances`, plus shifting `gas`/`sink` to eliminate
 * orphan <30cm slivers when `wall` is provided).
 */
export function compactDisconnectedDoorsInBox(
  box: CabinetBox,
  blockedZones: BlockedZone[],
  wall?: Wall,
  allWalls?: Wall[],
  cornerOwners: Record<string, string> = {}
): { ok: boolean; message: string } {
  if (box.type === 'fridge') {
    return { ok: false, message: 'یخچال قابل جمع‌کردن نیست' };
  }

  let movedAppliances = 0;
  let movedDoors = 0;

  // 1) Compact dishwasher / washing via built-in appliance optimizer
  if (wall && allWalls) {
    const optRes = optimizeBoxWithAppliances(wall, allWalls, box, cornerOwners);
    if (optRes.ok) movedAppliances++;

    // 2) Check if gas or sink sits near usable edge / another appliance leaving an unusable <30cm sliver
    const usableBox = getBoxUsableFrontSpan(box, blockedZones);
    const boxGlobalMin = +(box.offsetX + usableBox.startCm).toFixed(1);
    const boxGlobalMax = +(box.offsetX + usableBox.endCm).toFixed(1);
    const movableApps = wall.appliances
      .filter(
        (a) =>
          (a.kind === 'gas' || a.kind === 'sink') &&
          a.offsetX >= box.offsetX - 1 &&
          a.offsetX + a.width <= box.offsetX + box.width + 1
      )
      .sort((a, b) => a.offsetX - b.offsetX);

    for (const app of movableApps) {
      const range = getFreeMoveRangeForAppliance(wall, allWalls, app, cornerOwners);
      const leftBound = Math.max(boxGlobalMin, range.minX);
      const rightBound = Math.min(boxGlobalMax - app.width, range.maxX);
      const leftGap = +(app.offsetX - leftBound).toFixed(1);
      const rightGap = +(rightBound - app.offsetX).toFixed(1);

      let targetX: number | null = null;
      if (leftGap > 0.5 && leftGap < MIN_DOOR_CM) {
        // Close unusable sliver on the left edge if that still leaves >=30cm or 0 on right
        const nextRightGap = +(rightBound - leftBound).toFixed(1);
        if (nextRightGap === 0 || nextRightGap >= MIN_DOOR_CM) {
          targetX = leftBound;
        }
      } else if (rightGap > 0.5 && rightGap < MIN_DOOR_CM) {
        const nextLeftGap = +(rightBound - leftBound).toFixed(1);
        if (nextLeftGap === 0 || nextLeftGap >= MIN_DOOR_CM) {
          targetX = rightBound;
        }
      }

      if (targetX !== null && Math.abs(targetX - app.offsetX) > 0.5) {
        const res = moveApplianceHierarchically(wall, allWalls, app.id, targetX, cornerOwners, {
          exact: true,
          refitAdjacentDoors: false,
        });
        if (res) movedAppliances++;
      }
    }
  }

  const usable = getBoxUsableFrontSpan(box, blockedZones);
  const bayObstacles: Array<{ start: number; end: number }> = [];
  for (const ob of getBoxObstacleIntervals(box, wall)) {
    const s = Math.max(usable.startCm, ob.startCm);
    const e = Math.min(usable.endCm, ob.endCm);
    if (e - s > 1) bayObstacles.push({ start: s, end: e });
  }
  bayObstacles.sort((a, b) => a.start - b.start);

  const openBays: Array<{ startCm: number; endCm: number }> = [];
  let cursor = usable.startCm;
  for (const ob of bayObstacles) {
    if (ob.start - cursor >= MIN_DOOR_CM - 0.1) {
      openBays.push({ startCm: +cursor.toFixed(1), endCm: +ob.start.toFixed(1) });
    }
    cursor = Math.max(cursor, ob.end);
  }
  if (usable.endCm - cursor >= MIN_DOOR_CM - 0.1) {
    openBays.push({ startCm: +cursor.toFixed(1), endCm: +usable.endCm.toFixed(1) });
  }

  const isWall = box.type === 'wall' || box.type === 'wall-deep';

  // 3) Within each open bay, pack non-contiguous doors flush together and eliminate orphan slivers (<30cm)
  for (const bay of openBays) {
    const bayDoors = box.doors
      .filter((d) => {
        const mid = d.startCm + d.widthCm / 2;
        return mid >= bay.startCm - 0.5 && mid <= bay.endCm + 0.5;
      })
      .sort((a, b) => a.startCm - b.startCm);

    if (!bayDoors.length) continue;

    // Pack all doors in this bay tightly starting from bay.startCm
    let packCursor = bay.startCm;
    const oldEnds = new Map<string, number>();
    const newEnds = new Map<string, number>();

    for (const d of bayDoors) {
      const oldEnd = +(d.startCm + d.widthCm).toFixed(1);
      oldEnds.set(d.id, oldEnd);
      if (Math.abs(d.startCm - packCursor) > 0.2) {
        d.startCm = +packCursor.toFixed(1);
        movedDoors++;
      }
      packCursor = +(d.startCm + d.widthCm).toFixed(1);
      newEnds.set(d.id, packCursor);
    }

    // Check remaining gap on the right edge of the bay
    const leftover = +(bay.endCm - packCursor).toFixed(1);
    if (leftover > 0.5 && leftover < MIN_DOOR_CM) {
      // Unusable dead sliver! Absorb it across stretchable doors in this bay if allowed by [min..max]
      const stretchable = bayDoors.filter((d) => d.kind !== 'fridge');
      if (stretchable.length > 0) {
        let rem = leftover;
        // Distribute evenly starting from last doors
        for (let pass = 0; pass < 3 && rem > 0.1; pass++) {
          const slice = +(rem / stretchable.length).toFixed(1);
          for (const d of stretchable) {
            const maxAllowed =
              d.kind === 'lift' && isWall
                ? MAX_LIFT_DOOR_CM
                : d.kind === 'drawer'
                ? 110
                : MAX_DOOR_CM;
            const room = Math.max(0, +(maxAllowed - d.widthCm).toFixed(1));
            const add = Math.min(rem, Math.min(room, pass === 2 ? rem : Math.max(slice, 1)));
            if (add > 0.05) {
              d.widthCm = +(d.widthCm + add).toFixed(1);
              rem = +(rem - add).toFixed(1);
            }
          }
        }
        // Recompute compacted positions after absorption
        let c = bay.startCm;
        for (const d of bayDoors) {
          d.startCm = +c.toFixed(1);
          c = +(c + d.widthCm).toFixed(1);
          newEnds.set(d.id, c);
        }
        movedDoors++;
      }
    }

    // Update unit dividers tied to old boundaries inside this bay
    const divRemap = new Map<number, number>();
    for (const d of bayDoors) {
      const oE = oldEnds.get(d.id);
      const nE = newEnds.get(d.id);
      if (oE !== undefined && nE !== undefined && Math.abs(oE - nE) > 0.2) {
        divRemap.set(oE, nE);
      }
    }
    if (divRemap.size > 0) {
      box.unitDividers = box.unitDividers
        .map((u) => {
          for (const [oU, nU] of divRemap.entries()) {
            if (Math.abs(u - oU) <= 1.8) return nU;
          }
          return u;
        })
        .filter((u) => u > 2 && u < box.width - 2);
      if (box.frames?.length) {
        box.frames.forEach((f) => {
          if (f.side !== 'seam' || f.seamCm === undefined) return;
          for (const [oU, nU] of divRemap.entries()) {
            if (Math.abs(f.seamCm - oU) <= 1.8) f.seamCm = nU;
          }
        });
      }
    }
  }

  box.doors.sort((a, b) => a.startCm - b.startCm);
  box.unitDividers = Array.from(new Set(box.unitDividers.map((u) => +u.toFixed(1)))).sort((a, b) => a - b);

  if (movedDoors === 0 && movedAppliances === 0) {
    return { ok: false, message: 'درب یا تجهیز نامنظمی با فاصله پرتی روی این باکس یافت نشد' };
  }

  return {
    ok: true,
    message:
      movedAppliances > 0
        ? 'درب‌های نامرتب و تجهیزات باکس بدون فاصله اضافه کنار هم جمع شدند'
        : 'درب‌های غیرمتصل باکس به صورت یکدست کنار هم جمع شدند',
  };
}

/**
 * Optional alignment helper: aligns vertical upper-cabinet (`wall`/`wall-deep`) door seams cleanly
 * to the vertical base-cabinet door/unit seams directly beneath them on the same wall, skipping
 * corner blind zones, gas/hood bays, and over-sink dish-rack horizontal lift bays.
 */
export function alignWallAndBaseDoorSeams(
  wall: Wall,
  allWalls: Wall[] = [wall],
  cornerOwners: Record<string, string> = {}
): { ok: boolean; updatedBoxes: number; message: string } {
  const blocked = getCornerBlockedZonesForWall(wall, allWalls, cornerOwners);
  const baseBoxes = wall.boxes.filter((b) => b.type === 'base');
  const upperBoxes = wall.boxes.filter((b) => (b.type === 'wall' || b.type === 'wall-deep') && !b.linkedToBoxId);

  if (!baseBoxes.length || !upperBoxes.length) {
    return { ok: false, updatedBoxes: 0, message: 'برای هم‌راستاسازی به باکس زمینی و دیواری روی این دیوار نیاز است' };
  }

  // Collect global vertical seam X positions along base cabinets (box edges + door seams + appliance edges)
  const baseSeamSet = new Set<number>();
  for (const bb of baseBoxes) {
    baseSeamSet.add(+bb.offsetX.toFixed(1));
    baseSeamSet.add(+(bb.offsetX + bb.width).toFixed(1));
    for (const d of bb.doors) {
      baseSeamSet.add(+(bb.offsetX + d.startCm).toFixed(1));
      baseSeamSet.add(+(bb.offsetX + d.startCm + d.widthCm).toFixed(1));
    }
  }
  const baseSeams = Array.from(baseSeamSet).sort((a, b) => a - b);

  // Reserved horizontal spans in upper tier (hoods above gas, dish racks above sink)
  const reservedUpper: Array<{ start: number; end: number }> = wall.appliances
    .filter((a) => a.kind === 'gas' || a.kind === 'sink')
    .map((a) => ({ start: a.offsetX, end: a.offsetX + a.width }));

  let updatedBoxes = 0;

  for (const ub of upperBoxes) {
    const usable = getBoxUsableFrontSpan(ub, blocked);
    const localStart = usable.startCm;
    const localEnd = usable.endCm;
    if (localEnd - localStart < MIN_DOOR_CM) continue;

    // Preserve any existing lift doors or hood/sink bays inside this upper box
    const protectedSpans: Array<{ start: number; end: number }> = [];
    for (const res of reservedUpper) {
      const ls = Math.max(localStart, +(res.start - ub.offsetX).toFixed(1));
      const le = Math.min(localEnd, +(res.end - ub.offsetX).toFixed(1));
      if (le - ls > 1) protectedSpans.push({ start: ls, end: le });
    }
    for (const d of ub.doors) {
      if (d.kind === 'lift') {
        const ls = Math.max(localStart, d.startCm);
        const le = Math.min(localEnd, +(d.startCm + d.widthCm).toFixed(1));
        if (le - ls > 1) protectedSpans.push({ start: ls, end: le });
      }
    }
    protectedSpans.sort((a, b) => a.start - b.start);

    const openBays: Array<{ startCm: number; endCm: number }> = [];
    let cur = localStart;
    for (const pr of protectedSpans) {
      if (pr.start - cur >= MIN_DOOR_CM - 0.1) {
        openBays.push({ startCm: +cur.toFixed(1), endCm: +pr.start.toFixed(1) });
      }
      cur = Math.max(cur, pr.end);
    }
    if (localEnd - cur >= MIN_DOOR_CM - 0.1) {
      openBays.push({ startCm: +cur.toFixed(1), endCm: +localEnd.toFixed(1) });
    }

    let boxChanged = false;
    for (const bay of openBays) {
      // Find matching base seams strictly inside (bay.startCm..bay.endCm)
      const innerCuts = baseSeams
        .map((gs) => +(gs - ub.offsetX).toFixed(1))
        .filter((lx) => lx > bay.startCm + 1 && lx < bay.endCm - 1);

      const allPts = [bay.startCm, ...innerCuts, bay.endCm];
      // Build candidate cuts only preserving intervals >= MIN_DOOR_CM
      const validPts: number[] = [bay.startCm];
      for (let i = 1; i < allPts.length - 1; i++) {
        if (allPts[i] - validPts[validPts.length - 1] >= MIN_DOOR_CM - 0.1 && bay.endCm - allPts[i] >= MIN_DOOR_CM - 0.1) {
          validPts.push(allPts[i]);
        }
      }
      validPts.push(bay.endCm);

      const segmentDoors: Array<{ startCm: number; widthCm: number }> = [];
      let valid = true;
      for (let i = 0; i < validPts.length - 1; i++) {
        const segW = +(validPts[i + 1] - validPts[i]).toFixed(1);
        if (segW < MIN_DOOR_CM - 0.1) {
          valid = false;
          break;
        }
        if (segW <= MAX_DOOR_CM + 0.1) {
          segmentDoors.push({ startCm: validPts[i], widthCm: segW });
        } else {
          const n = Math.max(2, Math.round(segW / 45));
          const clampedN = Math.max(Math.ceil(segW / MAX_DOOR_CM), Math.min(Math.floor(segW / MIN_DOOR_CM), n));
          const ew = +(segW / clampedN).toFixed(1);
          if (ew < MIN_DOOR_CM - 0.1 || ew > MAX_DOOR_CM + 0.1) {
            valid = false;
            break;
          }
          for (let k = 0; k < clampedN; k++) {
            const s = +(validPts[i] + k * ew).toFixed(1);
            const w = k === clampedN - 1 ? +(validPts[i + 1] - s).toFixed(1) : ew;
            segmentDoors.push({ startCm: s, widthCm: w });
          }
        }
      }

      if (!valid || !segmentDoors.length) continue;

      const existingInBay = ub.doors.filter((d) => {
        const mid = d.startCm + d.widthCm / 2;
        return d.kind === 'door' && mid >= bay.startCm - 0.5 && mid <= bay.endCm + 0.5;
      });
      const sampleDoor = existingInBay[0];
      const existingIds = new Set(existingInBay.map((d) => d.id));
      const oldHandles = ub.handles.filter((h) => existingIds.has(h.doorId));

      ub.doors = ub.doors.filter((d) => !existingIds.has(d.id));
      ub.handles = ub.handles.filter((h) => !existingIds.has(h.doorId));

      segmentDoors.forEach((sd, idx) => {
        const hingeSide: 'left' | 'right' =
          segmentDoors.length === 2
            ? idx === 0
              ? 'left'
              : 'right'
            : idx % 2 === 0
            ? 'left'
            : 'right';
        const nd: DoorUnit = {
          id: uid('door'),
          startCm: sd.startCm,
          widthCm: sd.widthCm,
          kind: 'door',
          doorStyle: sampleDoor?.doorStyle,
          hingeSide,
          drawerRatios: [],
        };
        ub.doors.push(nd);
        if (oldHandles.length > 0) {
          const sh = oldHandles[0];
          ub.handles.push({
            id: uid('hnd'),
            doorId: nd.id,
            style: sh.style,
            orient: sh.orient,
            lengthCm: sh.lengthCm,
            xRatio: hingeSide === 'right' ? 0.14 : 0.86,
            yRatio: sh.yRatio,
            rowIndex: sh.rowIndex,
          });
        }
      });

      boxChanged = true;
    }

    if (boxChanged) {
      ub.doors.sort((a, b) => a.startCm - b.startCm);
      updatedBoxes++;
    }
  }

  if (updatedBoxes === 0) {
    return { ok: false, updatedBoxes: 0, message: 'درز مناسبی بین کابینت‌های زمینی و دیواری برای هم‌راستایی یافت نشد' };
  }
  return {
    ok: true,
    updatedBoxes,
    message: `خطوط درز عمودی ${updatedBoxes} باکس دیواری (بدون دست‌کاری کنج و هود/آبچکان) با پایین هم‌راستا شد`,
  };
}




