import {
  APPLIANCE_CONFIGS,
  BOX_PRESETS,
  DEFAULT_DOOR_CM,
  DRAWER_PATTERNS,
  FRAME_WIDTH_OPTIONS,
  FRIDGE_FRAME_CM,
  FRIDGE_MODELS,
  LIFT_PATTERNS,
  MAX_DOOR_CM,
  MAX_LIFT_DOOR_CM,
  MIN_DOOR_CM,
  MIN_LIFT_DOOR_CM,
  MIN_SHELF_GAP_CM,
  SINK_MODELS,
  WALL_DOUBLE_LOWER_H_CM,
  WALL_LOWER_ELEV_CM,
} from './constants';
import {
  analyzeCornerJunction,
  detectCornerJunctions,
  getBoxTier,
  getCornerBlockedZonesForWall,
  isBoxIntervalBlocked,
} from './cornerLogic';
import { findCollidingOpening } from './openingRules';
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
  FrameSide,
  FridgeModel,
  HandleStyle,
  Orientation,
  ProjectSettings,
  SinkModel,
  Wall,
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
    const fm = FRIDGE_MODELS[opts?.fridgeModel || 'side-by-side'];
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
    name: kind === 'fridge' ? `یخچال ${FRIDGE_MODELS[opts?.fridgeModel || 'side-by-side'].shortLabel}` : p.name,
    type: kind,
    offsetX: Math.round(offsetX),
    elevY,
    width: w,
    height,
    depth,
    plinth,
    countertopCm,
    hasFridgeFrame: hasFrame,
    fridgeModel: kind === 'fridge' ? (opts?.fridgeModel || 'side-by-side') : undefined,
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
 * - Over-fridge ('linkedToBoxId') ALWAYS gets 1 horizontal door (`[]`)
 * - When dividing box height into 2 horizontal doors would make each leaf < 40cm (`box.height < 80`),
 *   returns 1 horizontal door (`[]`)
 * - Otherwise (`box.height >= 80`), returns strictly 2 horizontal doors (`[0.5]`) — no 3-lift option.
 */
export function getWallHorizontalDrawerRatios(box: CabinetBox): number[] {
  if (box.linkedToBoxId) return [];
  if (box.height / 2 < 40) return [];
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
  }>;
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

    let canHaveShelves = true;
    let blockedReason: string | undefined;

    if (box.type === 'fridge') {
      canHaveShelves = false;
      blockedReason = 'یخچال طبقه داخلی ندارد';
    } else if (hasDrawer) {
      canHaveShelves = false;
      blockedReason = 'کشو تقسیم‌بندی داخلی (طبقه) نمی‌گیرد';
    } else if (hingedCount >= 3 || (hingedCount >= 1 && uWidth > 125)) {
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
  const newDoorW = MIN_DOOR_CM;
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
    widthCm: widths[idx],
  }));
  newEntries.splice(insertAt, 0, {
    kind: 'door',
    drawerRatios: [],
    widthCm: newDoorW,
  });

  // Ensure exact bay sum (distribute any leftover freeGap > 0 back if needed, or clamp remainder)
  const used = newEntries.reduce((s, e) => s + e.widthCm, 0);
  const diff = +(bayWidth - used).toFixed(1);
  if (Math.abs(diff) > 0.05) {
    // Only fill leftover gap if bay had no untouched gaps elsewhere (when full bay or tiny sliver)
    newEntries[insertAt].widthCm = +(
      Math.max(MIN_DOOR_CM, Math.min(MAX_DOOR_CM, newEntries[insertAt].widthCm + diff))
    ).toFixed(1);
  }

  let cur = bayStart;
  const items = newEntries.map((ent, idx) => {
    const startCm = +cur.toFixed(1);
    const w =
      idx === newEntries.length - 1
        ? +(bayEnd - startCm).toFixed(1)
        : Math.max(MIN_DOOR_CM, ent.widthCm);
    cur = startCm + w;
    return {
      startCm,
      widthCm: w,
      kind: ent.kind,
      drawerRatios: ent.drawerRatios,
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
    if (verticalCount <= 1) {
      // If clicked door >= 60cm, split it directly without touching neighbors
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
      const { bayStart, bayEnd } = getBaySpanContainingCursor(box, cursorCmInBox, blockedZones);
      const bayDoors = box.doors
        .filter((d) => {
          const mid = d.startCm + d.widthCm / 2;
          return mid >= bayStart - 0.5 && mid <= bayEnd + 0.5;
        })
        .sort((a, b) => a.startCm - b.startCm);
      return computeShrinkInsertPreview(bayStart, bayEnd, bayDoors, cursorCmInBox, existingDoor);
    }

    const parts = verticalCount;
    const partW = +(existingDoor.widthCm / parts).toFixed(1);
    if (partW < MIN_DOOR_CM) {
      return {
        ok: false,
        reason: `عرض هر درب (${partW}cm) کمتر از حداقل ۳۰cm می‌شود`,
        items: [],
      };
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
    if (orient === 'vertical' && verticalCount <= 1) {
      const { bayStart, bayEnd } = getBaySpanContainingCursor(box, cursorCmInBox, blockedZones);
      const bayDoors = box.doors
        .filter((d) => {
          const mid = d.startCm + d.widthCm / 2;
          return mid >= bayStart - 0.5 && mid <= bayEnd + 0.5;
        })
        .sort((a, b) => a.startCm - b.startCm);
      if (bayDoors.length > 0) {
        return computeShrinkInsertPreview(bayStart, bayEnd, bayDoors, cursorCmInBox, undefined);
      }
    }
    return {
      ok: false,
      reason: 'فضای خالی با عرض حداقل ۳۰cm در این قسمت وجود ندارد',
      items: [],
    };
  }

  const isWallBox = box.type === 'wall' || box.type === 'wall-deep';
  const isWallLift = orient === 'horizontal' && isWallBox;
  const minW = isWallLift ? MIN_LIFT_DOOR_CM : MIN_DOOR_CM;
  const maxW = isWallLift ? MAX_LIFT_DOOR_CM : orient === 'horizontal' ? MAX_LIFT_DOOR_CM : MAX_DOOR_CM;

  const freeLen = +(span.endCm - span.startCm).toFixed(1);
  if (freeLen < minW) {
    return {
      ok: false,
      reason: isWallLift
        ? 'عرض درب افقی کابینت هوایی حداقل ۵۰ سانتی‌متر است'
        : 'فضای خالی کمتر از ۳۰ سانتی‌متر است',
      items: [],
    };
  }

  const desiredW = Math.max(minW, Math.min(maxW, Math.round(targetDoorWidthCm)));

  if (orient === 'horizontal') {
    const w = Math.min(desiredW, freeLen);
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
    } else {
      const pat = DRAWER_PATTERNS[drawerPatternIdx % DRAWER_PATTERNS.length];
      return {
        ok: true,
        items: [{ startCm: +start.toFixed(1), widthCm: +w.toFixed(1), kind: 'drawer', drawerRatios: [...pat.ratios] }],
      };
    }
  }

  // Vertical brush in empty space — directly respects targetDoorWidthCm (30..60cm)!
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

  // Multi-door placement in empty span
  const count = verticalCount;
  const maxSpanForCount = Math.min(freeLen, count * MAX_DOOR_CM);
  const eachW = +(maxSpanForCount / count).toFixed(1);
  if (eachW < MIN_DOOR_CM) {
    return {
      ok: false,
      reason: `برای ${count} درب عرض هر لنگه (${eachW}cm) کمتر از ۳۰cm می‌شود`,
      items: [],
    };
  }

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
  preview: DoorPreviewResult
): { ok: boolean; selectedDoorId: string | null; message?: string } {
  if (!preview.ok || !preview.items.length) {
    return { ok: false, selectedDoorId: null, message: preview.reason };
  }

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

    const created: DoorUnit[] = preview.items.map((it) => ({
      id: uid('door'),
      startCm: it.startCm,
      widthCm: it.widthCm,
      kind: it.kind,
      drawerRatios: [...it.drawerRatios],
    }));
    box.doors.push(...created);
    box.doors.sort((a, b) => a.startCm - b.startCm);
    return { ok: true, selectedDoorId: created[0]?.id ?? null };
  }

  const existingDoor = box.doors.find(
    (d) => cursorCmInBox >= d.startCm && cursorCmInBox <= d.startCm + d.widthCm
  );

  if (existingDoor) {
    const idx = box.doors.indexOf(existingDoor);
    if (preview.items.length === 1 && (preview.items[0].kind === 'drawer' || preview.items[0].kind === 'lift')) {
      existingDoor.kind = preview.items[0].kind;
      existingDoor.drawerRatios = [...preview.items[0].drawerRatios];
      box.handles = box.handles.filter((h) => h.doorId !== existingDoor.id);
      ensureUnitDividersForRange(box, existingDoor.startCm, existingDoor.startCm + existingDoor.widthCm);
      return { ok: true, selectedDoorId: existingDoor.id };
    }
    const created: DoorUnit[] = preview.items.map((it) => ({
      id: uid('door'),
      startCm: it.startCm,
      widthCm: it.widthCm,
      kind: it.kind,
      drawerRatios: [...it.drawerRatios],
    }));
    box.doors.splice(idx, 1, ...created);
    box.handles = box.handles.filter((h) => h.doorId !== existingDoor.id);
    return { ok: true, selectedDoorId: created[0].id };
  }

  const created: DoorUnit[] = preview.items.map((it) => ({
    id: uid('door'),
    startCm: it.startCm,
    widthCm: it.widthCm,
    kind: it.kind,
    drawerRatios: [...it.drawerRatios],
  }));
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
  box.doors = box.doors
    .filter((d) => d.startCm < box.width - MIN_DOOR_CM + 1)
    .map((d) => {
      const maxW = +(box.width - d.startCm).toFixed(1);
      return {
        ...d,
        widthCm: Math.min(d.widthCm, maxW),
      };
    })
    .filter((d) => d.widthCm >= MIN_DOOR_CM - 0.5 || box.type === 'fridge');

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
export function syncHoodUnitAboveGas(wall: Wall, gas: ApplianceItem): number {
  if (gas.kind !== 'gas') return 0;
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

  for (const box of wall.boxes) {
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
 * Places a kitchen appliance onto a base box:
 * - Clicking directly on an existing appliance replaces it cleanly (e.g., sink -> gas)
 * - Clicking elsewhere adds another appliance without overlapping
 * - Dishwasher / washing snaps flush to sink or edges to avoid <30cm dead slivers
 */
export function ensureHorizontalDoorsAboveSink(
  wall: Wall,
  sinkOffsetX: number,
  sinkWidth: number
): number {
  const sStart = sinkOffsetX;
  const sEnd = sinkOffsetX + sinkWidth;
  let updatedCount = 0;

  for (const box of wall.boxes) {
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

export function placeApplianceWithCabinetRules(
  wall: Wall,
  allWalls: Wall[],
  kind: ApplianceKind,
  targetBox: CabinetBox,
  desiredOffsetX: number,
  cornerOwners: Record<string, string>,
  hoodKind: 'hidden' | 'chimney' = 'chimney',
  opts?: { sinkModel?: SinkModel; customWidth?: number }
): { ok: boolean; appliance?: ApplianceItem; replaced?: boolean; message: string } {
  const cfg = APPLIANCE_CONFIGS[kind];
  const sinkModel: SinkModel | undefined =
    kind === 'sink' ? opts?.sinkModel ?? 'steel-2' : undefined;
  const width =
    opts?.customWidth ??
    (kind === 'sink' && sinkModel ? SINK_MODELS[sinkModel].width : cfg.width);
  const blocked = getCornerBlockedZonesForWall(wall, allWalls, cornerOwners);

  let minX = targetBox.offsetX;
  let maxX = targetBox.offsetX + targetBox.width - width;
  let cornerSide: 'left' | 'right' | undefined;

  if (kind === 'sink' && sinkModel === 'corner-sink') {
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

  // Check if the user clicked directly over an existing appliance -> replace it cleanly!
  const directHit = wall.appliances.find(
    (other) => clickCenter >= other.offsetX && clickCenter <= other.offsetX + other.width
  );

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

  const overlapsAny = (x: number) =>
    wall.appliances.some((other) => x < other.offsetX + other.width - 1 && x + width > other.offsetX + 1);

  let offsetX = desiredClamped;

  // Smart snap for dishwasher / washing machine: anchor near sink or avoid <30cm dead slivers
  if (!replaced && (kind === 'dishwasher' || kind === 'washing')) {
    const sink = wall.appliances.find((a) => a.kind === 'sink');
    if (sink) {
      const rightOfSink = sink.offsetX + sink.width;
      const leftOfSink = sink.offsetX - width;
      if (Math.abs(offsetX - rightOfSink) <= 25 && rightOfSink <= maxX && !overlapsAny(rightOfSink)) {
        offsetX = rightOfSink;
      } else if (Math.abs(offsetX - leftOfSink) <= 25 && leftOfSink >= minX && !overlapsAny(leftOfSink)) {
        offsetX = leftOfSink;
      }
    }
    const leftGap = offsetX - minX;
    if (leftGap > 0 && leftGap < MIN_DOOR_CM) {
      if (leftGap < 18 && !overlapsAny(minX)) offsetX = minX;
      else if (minX + MIN_DOOR_CM <= maxX && !overlapsAny(minX + MIN_DOOR_CM)) offsetX = minX + MIN_DOOR_CM;
    }
    const rightGap = maxX - offsetX;
    if (rightGap > 0 && rightGap < MIN_DOOR_CM) {
      if (rightGap < 18 && !overlapsAny(maxX)) offsetX = maxX;
      else if (maxX - MIN_DOOR_CM >= minX && !overlapsAny(maxX - MIN_DOOR_CM)) offsetX = maxX - MIN_DOOR_CM;
    }
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
  if (replaced && directHit && directHit.offsetX >= minX && directHit.offsetX + width <= maxX + width) {
    offsetX = Math.max(minX, Math.min(maxX, directHit.offsetX));
  }

  const localStart = +(offsetX - targetBox.offsetX).toFixed(1);
  const localEnd = +(localStart + width).toFixed(1);

  const overlappedDoorIds = new Set(
    targetBox.doors
      .filter((d) => !(d.startCm + d.widthCm <= localStart + 1 || d.startCm >= localEnd - 1))
      .map((d) => d.id)
  );
  targetBox.doors = targetBox.doors.filter((d) => !overlappedDoorIds.has(d.id));
  targetBox.handles = targetBox.handles.filter((h) => !overlappedDoorIds.has(h.doorId));

  if (localStart > 2 && !targetBox.unitDividers.includes(localStart)) {
    targetBox.unitDividers.push(localStart);
  }
  if (localEnd < targetBox.width - 2 && !targetBox.unitDividers.includes(localEnd)) {
    targetBox.unitDividers.push(localEnd);
  }
  targetBox.unitDividers.sort((a, b) => a - b);

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
    targetBox.doors.push({
      id: uid('door'),
      startCm: localStart,
      widthCm: width,
      kind: 'drawer',
      drawerRatios: [0.22, 0.54],
    });
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
      : `گاز ${width}cm متصل به هود و کشوهای پلکانی زیر آن نصب شد`,
    dishwasher: replaced
      ? 'تجهیز با ماشین ظرفشویی ۶۰cm جایگزین شد'
      : 'فضای ۶۰cm ماشین ظرفشویی زیر صفحه ثبت شد',
    washing: replaced
      ? 'تجهیز با ماشین لباسشویی ۶۰cm جایگزین شد'
      : 'فضای ۶۰cm ماشین لباسشویی زیر صفحه ثبت شد',
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

  const fixedApps = boxApps.filter((a) => a.kind === 'sink' || a.kind === 'gas');
  const sink = fixedApps.find((a) => a.kind === 'sink');

  // Remove loose apps temporarily and clear their old dividers
  for (const la of looseApps) {
    const ls = +(la.offsetX - box.offsetX).toFixed(1);
    const le = +(ls + la.width).toFixed(1);
    box.unitDividers = box.unitDividers.filter(
      (u) => Math.abs(u - ls) > 1.5 && Math.abs(u - le) > 1.5
    );
  }

  // Collect free continuous spans around fixed apps inside [minX, maxX]
  const occupied = fixedApps.map((a) => [a.offsetX, a.offsetX + a.width] as [number, number]).sort((a, b) => a[0] - b[0]);
  const freeSpans: Array<{ start: number; end: number }> = [];
  let cur = minX;
  for (const [s, e] of occupied) {
    if (s - cur >= 60) freeSpans.push({ start: cur, end: s });
    cur = Math.max(cur, e);
  }
  if (maxX - cur >= 60) freeSpans.push({ start: cur, end: maxX });

  for (const la of looseApps) {
    // Prefer a span touching sink edge first, else widest span
    let targetSpan =
      (sink &&
        freeSpans.find(
          (sp) =>
            sp.end - sp.start >= la.width &&
            (Math.abs(sp.start - (sink.offsetX + sink.width)) < 2 || Math.abs(sp.end - sink.offsetX) < 2)
        )) ||
      freeSpans
        .filter((sp) => sp.end - sp.start >= la.width)
        .sort((a, b) => b.end - b.start - (a.end - a.start))[0];

    if (!targetSpan) continue;

    // Anchor flush to sink edge if touching sink, else flush to left/right edge of span
    let newX = targetSpan.start;
    if (sink && Math.abs(targetSpan.end - sink.offsetX) < 2) {
      newX = targetSpan.end - la.width;
      targetSpan.end = newX;
    } else {
      targetSpan.start += la.width;
    }

    la.offsetX = newX;
    const ls = +(newX - box.offsetX).toFixed(1);
    const le = +(ls + la.width).toFixed(1);
    box.doors = box.doors.filter((d) => d.startCm + d.widthCm <= ls + 1 || d.startCm >= le - 1);
    if (ls > 2 && !box.unitDividers.includes(ls)) box.unitDividers.push(ls);
    if (le < box.width - 2 && !box.unitDividers.includes(le)) box.unitDividers.push(le);
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

  const out: CabinetBox[] = [];
  // Left remainder
  const leftW = Math.round(cutStart - bStart);
  if (leftW >= MIN_DOOR_CM) {
    const leftCopy: CabinetBox = JSON.parse(JSON.stringify(box));
    leftCopy.width = leftW;
    if (leftCopy.frames?.length) {
      leftCopy.frames = leftCopy.frames.filter((f) => f.side !== 'right');
    }
    clampBoxInternalsAfterResize(leftCopy);
    out.push(leftCopy);
  }

  // Right remainder
  const rightW = Math.round(bEnd - cutEnd);
  if (rightW >= MIN_DOOR_CM) {
    const shift = Math.round(cutEnd - bStart);
    const rightCopy: CabinetBox = JSON.parse(JSON.stringify(box));
    rightCopy.id = uid('box');
    rightCopy.offsetX = Math.round(cutEnd);
    rightCopy.width = rightW;
    rightCopy.doors = rightCopy.doors
      .map((d) => ({ ...d, startCm: +(d.startCm - shift).toFixed(1) }))
      .filter((d) => d.startCm >= -0.5);
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
  const width = cfg.width + (hasFrame ? FRIDGE_FRAME_CM * 2 : 0);
  const fridgeTotalHeight = cfg.height + (hasFrame ? FRIDGE_FRAME_CM : 0);
  const blocked = getCornerBlockedZonesForWall(wall, allWalls, cornerOwners);

  let offsetX = Math.max(0, Math.min(wall.length - width, Math.round(desiredOffsetX / 5) * 5));

  for (const z of blocked) {
    if (z.tier !== 'lower') continue;
    if (offsetX < z.endCm && offsetX + width > z.startCm) {
      if (z.startCm <= 2) offsetX = Math.max(offsetX, z.endCm);
      else offsetX = Math.min(offsetX, z.startCm - width);
    }
  }
  offsetX = Math.max(0, Math.min(wall.length - width, offsetX));

  if (offsetX < 0 || offsetX + width > wall.length) {
    return { ok: false, message: `فضای دیوار برای یخچال ${cfg.label} و فریم ۵cm کافی نیست` };
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
  const minDoor = door.kind === 'lift' && isWall ? MIN_LIFT_DOOR_CM : MIN_DOOR_CM;
  const maxAllowedW = Math.min(
    door.kind === 'lift' && isWall ? MAX_LIFT_DOOR_CM : door.kind === 'drawer' ? 110 : MAX_DOOR_CM,
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
        b.type === 'base' &&
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
  let minX = 0;
  let maxX = Math.max(0, wall.length - box.width);
  const snapTargets: number[] = [0, maxX];

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
    if (z.startCm <= 2) {
      minX = Math.max(minX, z.endCm);
      snapTargets.push(z.endCm);
    } else if (z.endCm >= wall.length - 2) {
      maxX = Math.min(maxX, z.startCm - box.width);
      snapTargets.push(z.startCm - box.width);
    }
  }

  for (const other of wall.boxes) {
    if (other.id === box.id) continue;
    if (other.linkedToBoxId === box.id || box.linkedToBoxId === other.id) continue;
    if (!tiersCollideForBoxMove(box, other)) continue;
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

  for (const op of wall.openings || []) {
    const vOverlap = box.elevY < op.elevY + op.height - 1 && box.elevY + box.height > op.elevY + 1;
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
export function moveBoxHierarchically(
  wall: Wall,
  allWalls: Wall[],
  boxId: string,
  desiredOffsetX: number,
  cornerOwners: Record<string, string>
): { offsetX: number; minX: number; maxX: number; leftGap: number; rightGap: number } | null {
  const box = wall.boxes.find((b) => b.id === boxId);
  if (!box) return null;

  const { minX, maxX, snapTargets } = getFreeMoveRangeForBox(wall, allWalls, box, cornerOwners);
  let target = Math.max(minX, Math.min(maxX, Math.round(desiredOffsetX / 5) * 5));

  for (const st of snapTargets) {
    if (st >= minX && st <= maxX && Math.abs(desiredOffsetX - st) <= 4) {
      target = Math.round(st);
      break;
    }
  }

  const oldX = box.offsetX;
  const delta = target - oldX;
  if (delta !== 0) {
    box.offsetX = target;

    // Move attached appliances hierarchically
    for (const app of wall.appliances) {
      const belongs =
        app.boxId === box.id ||
        (!app.boxId &&
          box.type === 'base' &&
          app.offsetX >= oldX - 2 &&
          app.offsetX + app.width <= oldX + box.width + 2);
      if (belongs) {
        app.boxId = box.id;
        app.offsetX = +(app.offsetX + delta).toFixed(1);
      }
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
        other.offsetX = target;
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

  const appCenter = app.offsetX + app.width / 2;
  for (const other of wall.appliances) {
    if (other.id === app.id) continue;
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

  const oldX = app.offsetX;
  const delta = +(target - oldX).toFixed(1);

  if (Math.abs(delta) > 0.05) {
    if (app.kind === 'gas') {
      clearHoodUnitForGas(wall, oldX, oldX + app.width, app.id);
    } else if (app.kind === 'sink') {
      clearDishRackUnitAboveSink(wall, oldX, oldX + app.width, app.id);
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

      if (newLocalStart > 2 && !parentBox.unitDividers.some((u) => Math.abs(u - newLocalStart) < 1.5)) {
        parentBox.unitDividers.push(newLocalStart);
      }
      if (
        newLocalEnd < parentBox.width - 2 &&
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

  // Remove doors created for / sitting inside this appliance bay
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

  const units = getUnitsInBox(box, blockedZones);
  const addedDividers: number[] = [];

  for (const unit of units) {
    const hinged = unit.doors.filter((d) => d.kind === 'door' && d.doorStyle !== 'pantry');
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
      // Compute split indices after which a unit divider should be placed
      const splitAfterIndices: number[] = [];
      const n = run.length;
      if (n % 2 === 0) {
        for (let i = 1; i < n - 1; i += 2) splitAfterIndices.push(i);
      } else if (n === 3) {
        const nearLeftCorner = run[0].startCm <= 4 && blockedZones.some((z) => z.startCm <= 2);
        splitAfterIndices.push(nearLeftCorner ? 0 : 1);
      } else {
        // Odd >= 5: [2 + ... + 1 center single + ... + 2]
        const mid = Math.floor(n / 2);
        for (let i = 1; i < mid; i += 2) splitAfterIndices.push(i);
        if (!splitAfterIndices.includes(mid - 1)) splitAfterIndices.push(mid - 1);
        splitAfterIndices.push(mid);
        for (let i = mid + 2; i < n - 1; i += 2) splitAfterIndices.push(i);
      }

      for (const idx of splitAfterIndices) {
        const seam = +(run[idx].startCm + run[idx].widthCm).toFixed(1);
        if (seam > 2 && seam < box.width - 2 && !box.unitDividers.some((u) => Math.abs(u - seam) < 1.8)) {
          box.unitDividers.push(seam);
          addedDividers.push(seam);
        }
      }
    }
  }

  if (addedDividers.length > 0) {
    box.unitDividers.sort((a, b) => a - b);
  }

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
        if (dA.doorStyle !== 'pantry') dA.hingeSide = 'left';
        if (dB.doorStyle !== 'pantry') dB.hingeSide = 'right';
        pairedUnits++;
      } else if (pair.length === 1) {
        const d = pair[0];
        if (d.doorStyle === 'pantry') {
          d.hingeSide = undefined;
        } else if (!d.hingeSide) {
          d.hingeSide = d.startCm + d.widthCm / 2 > box.width / 2 ? 'right' : 'left';
        }
      }
    }
  }

  return { addedDividers, pairedUnits };
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
      (!targetDoorIds || targetDoorIds.includes(d.id))
  );
  if (!targets.length) return 0;

  // Determine paired relationships from units
  const units = getUnitsInBox(box, blockedZones);
  const doorHingeMap = new Map<string, 'left' | 'right'>();
  for (const u of units) {
    const hinged = u.doors.filter((d) => d.kind === 'door' && d.doorStyle !== 'pantry');
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
    box.handles = box.handles.filter((h) => h.doorId !== door.id);

    if (door.kind === 'drawer' || (door.kind === 'lift' && door.drawerRatios.length > 0)) {
      const rowCount = door.drawerRatios.length + 1;
      for (let r = 0; r < rowCount; r++) {
        box.handles.push({
          id: uid('hand'),
          doorId: door.id,
          rowIndex: r,
          xRatio: sampleSpot ? sampleSpot.xRatio : orient === 'horizontal' ? 0.5 : 0.86,
          yRatio: sampleSpot ? sampleSpot.yRatio : door.kind === 'lift' ? 0.78 : 0.5,
          orient,
          style,
          lengthCm: 16,
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
        orient: sampleSpot ? orient : 'horizontal',
        style,
        lengthCm: 16,
      });
      count++;
    } else {
      const isPantry = door.doorStyle === 'pantry';
      const resolvedHinge = door.hingeSide || doorHingeMap.get(door.id);
      if (!isPantry && resolvedHinge) {
        door.hingeSide = resolvedHinge;
      }

      let xr: number;
      if (sampleSpot) {
        // Mirror opposing edge only when placing vertical edge handles across paired doors
        const edgeDist = sampleSpot.xRatio <= 0.3 ? sampleSpot.xRatio : sampleSpot.xRatio >= 0.7 ? 1 - sampleSpot.xRatio : null;
        if (edgeDist !== null && resolvedHinge) {
          xr = resolvedHinge === 'left' ? +(1 - edgeDist).toFixed(2) : +edgeDist.toFixed(2);
        } else {
          xr = sampleSpot.xRatio;
        }
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
        orient,
        style,
        lengthCm: 16,
      });
      count++;
    }
  }
  return count;
}

/**
 * Applies a DoorStyle ('flat', 'cnc', 'glass', 'glass-grid', 'pantry') to specific doors (or all doors in a box).
 */
export function applyDoorStyleToDoors(
  box: CabinetBox,
  targetDoorIds: string[] | null,
  style: DoorStyle
): number {
  if (box.type === 'fridge') return 0;
  let count = 0;
  for (const door of box.doors) {
    if (door.kind === 'fridge' || door.kind === 'open') continue;
    if (targetDoorIds && !targetDoorIds.includes(door.id)) continue;
    door.doorStyle = style;
    if (style === 'pantry') {
      door.hingeSide = undefined;
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

  for (const sh of box.shelves) {
    if (Math.abs(sh.startCm - actualSeam) <= 2) sh.startCm = targetSeam;
    if (Math.abs(sh.endCm - actualSeam) <= 2) sh.endCm = targetSeam;
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
  const clampedElev = Math.max(95, Math.min(srcWall.height - 25, Math.round(nextElevY)));
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
    if (hasStackedTwoTier && !bottomMoved) {
      const stackedWd = srcWall.boxes.find(
        (wd) => wd.type === 'wall-deep' && !wd.linkedToBoxId && horizOverlap(wd, srcBox)
      );
      if (stackedWd) {
        const crownLimit = stackedWd.elevY + stackedWd.height - 25;
        if (newSrcTop > crownLimit) {
          clampedH = Math.max(25, Math.round(crownLimit - clampedElev));
          newSrcTop = +(clampedElev + clampedH).toFixed(1);
        }
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
          const maxSeamElev = Math.min(w.height - 25, oldSrcTop - 25);
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
export function computeWallBacksplashSpans(wall: Wall): BacksplashSpan[] {
  const bases = wall.boxes
    .filter((b) => b.type === 'base' && b.width >= 5)
    .sort((a, b) => a.offsetX - b.offsetX);
  if (!bases.length) return [];

  const wallCabs = wall.boxes.filter((b) => b.type === 'wall' || b.type === 'wall-deep');
  const defaultWallElev =
    wallCabs.length > 0
      ? Math.min(...wallCabs.filter((b) => b.type === 'wall').map((b) => b.elevY).concat([WALL_LOWER_ELEV_CM]))
      : WALL_LOWER_ELEV_CM;

  const fullBlockers = wall.boxes.filter(
    (b) => b.type === 'fridge' || b.type === 'tall' || b.type === 'closet'
  );
  const openings = wall.openings || [];
  const chimneyGases = wall.appliances.filter((a) => a.kind === 'gas' && a.hoodKind === 'chimney');

  const raw: BacksplashSpan[] = [];

  for (const base of bases) {
    const bStart = base.offsetX;
    const bEnd = base.offsetX + base.width;
    const botY = base.elevY + base.height;

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
 * Adds 1 or more shelves inside a unit bay `[startCm .. endCm]` while enforcing `MIN_SHELF_GAP_CM` (25 cm).
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

  // Replace/add cleanly inside this bay without violating 25cm against existing shelves
  const existingInBay = box.shelves.filter(
    (sh) => sh.endCm > startCm + 2 && sh.startCm < endCm - 2
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
    });
  }
  return {
    ok: true,
    added: validCandidates.length,
    message: `${validCandidates.length} طبقه منظم در یونیت اضافه شد`,
  };
}



