import { DEFAULT_COLUMN_DEPTH_CM, OPENING_DEFAULTS } from './constants';
import { DoorSwing, OpeningKind, RoomColumn, Wall, WallOpening } from './types';

function makeUid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createWallOpening(
  kind: OpeningKind,
  offsetX: number,
  wall: Wall,
  overrides?: Partial<Pick<WallOpening, 'width' | 'elevY' | 'height' | 'swingDir' | 'depthCm'>>
): WallOpening {
  const def = OPENING_DEFAULTS[kind];
  const width = Math.max(20, Math.min(wall.length, Math.round(overrides?.width ?? def.width)));
  const clampedOffsetX = Math.max(
    0,
    Math.min(wall.length - width, Math.round(offsetX / 5) * 5)
  );
  const elevY =
    kind === 'door' || kind === 'column'
      ? 0
      : Math.max(0, Math.min(wall.height - 30, Math.round(overrides?.elevY ?? def.elevY)));
  const maxH = wall.height - elevY;
  const height =
    kind === 'column'
      ? wall.height
      : Math.max(30, Math.min(maxH, Math.round(overrides?.height ?? def.height)));
  const depthCm =
    kind === 'column'
      ? Math.max(10, Math.min(120, Math.round(overrides?.depthCm ?? def.depthCm ?? DEFAULT_COLUMN_DEPTH_CM)))
      : undefined;

  return {
    id: makeUid('open'),
    kind,
    offsetX: clampedOffsetX,
    width,
    elevY,
    height,
    depthCm,
    swingDir: kind === 'door' ? (overrides?.swingDir ?? 'left-in') : undefined,
  };
}

export function createRoomColumn(
  xCm: number,
  yCm: number,
  wallHeightCm = 265,
  overrides?: Partial<Pick<RoomColumn, 'widthCm' | 'depthCm' | 'heightCm'>>
): RoomColumn {
  return {
    id: makeUid('col'),
    xCm: Math.round(xCm),
    yCm: Math.round(yCm),
    widthCm: Math.max(15, Math.min(200, Math.round(overrides?.widthCm ?? 45))),
    depthCm: Math.max(10, Math.min(120, Math.round(overrides?.depthCm ?? DEFAULT_COLUMN_DEPTH_CM))),
    heightCm: Math.max(40, Math.min(400, Math.round(overrides?.heightCm ?? wallHeightCm))),
  };
}

export function updateRoomColumn(
  col: RoomColumn,
  patch: Partial<Pick<RoomColumn, 'xCm' | 'yCm' | 'widthCm' | 'depthCm' | 'heightCm'>>,
  maxHeightCm = 400
): void {
  if (patch.xCm !== undefined && Number.isFinite(patch.xCm)) col.xCm = Math.round(patch.xCm);
  if (patch.yCm !== undefined && Number.isFinite(patch.yCm)) col.yCm = Math.round(patch.yCm);
  if (patch.widthCm !== undefined && Number.isFinite(patch.widthCm)) {
    col.widthCm = Math.max(15, Math.min(200, Math.round(patch.widthCm)));
  }
  if (patch.depthCm !== undefined && Number.isFinite(patch.depthCm)) {
    // 1cm resolution (never rounded to 5cm)
    col.depthCm = Math.max(10, Math.min(120, Math.round(patch.depthCm)));
  }
  if (patch.heightCm !== undefined && Number.isFinite(patch.heightCm)) {
    col.heightCm = Math.max(40, Math.min(maxHeightCm, Math.round(patch.heightCm)));
  }
}

export interface WallColumnSpan {
  startCm: number;
  endCm: number;
  depthCm: number;
  elevY: number;
  height: number;
}

/**
 * Computes all column-occupied spans along a wall `[0..wall.length]`,
 * combining wall-attached `openings` (`kind === 'column'`) and any freestanding
 * `RoomColumn` overlapping the wall's cabinet band.
 */
export function getWallColumnSpans(wall: Wall, columns: RoomColumn[] = []): WallColumnSpan[] {
  const spans: WallColumnSpan[] = [];
  for (const op of wall.openings || []) {
    if (op.kind !== 'column') continue;
    spans.push({
      startCm: Math.max(0, op.offsetX),
      endCm: Math.min(wall.length, op.offsetX + op.width),
      depthCm: op.depthCm ?? DEFAULT_COLUMN_DEPTH_CM,
      elevY: op.elevY,
      height: op.height,
    });
  }

  if (columns.length > 0 && wall.length > 0) {
    const dx = wall.x2Cm - wall.x1Cm;
    const dy = wall.y2Cm - wall.y1Cm;
    const len = Math.hypot(dx, dy) || wall.length;
    const tx = dx / len;
    const ty = dy / len;
    const side = wall.flipSide || 1;
    const nx = -ty * side;
    const ny = tx * side;

    for (const col of columns) {
      const halfW = col.widthCm / 2;
      const halfD = col.depthCm / 2;
      const corners = [
        { x: col.xCm - halfW, y: col.yCm - halfD },
        { x: col.xCm + halfW, y: col.yCm - halfD },
        { x: col.xCm + halfW, y: col.yCm + halfD },
        { x: col.xCm - halfW, y: col.yCm + halfD },
      ];
      let minT = Infinity;
      let maxT = -Infinity;
      let minN = Infinity;
      let maxN = -Infinity;
      for (const c of corners) {
        const vx = c.x - wall.x1Cm;
        const vy = c.y - wall.y1Cm;
        const projT = vx * tx + vy * ty;
        const projN = vx * nx + vy * ny;
        if (projT < minT) minT = projT;
        if (projT > maxT) maxT = projT;
        if (projN < minN) minN = projN;
        if (projN > maxN) maxN = projN;
      }
      // Overlaps wall front corridor (0..62cm in normal direction) and longitudinal wall span
      if (maxN > 2 && minN < 60 && maxT > 1 && minT < wall.length - 1) {
        spans.push({
          startCm: Math.max(0, +minT.toFixed(1)),
          endCm: Math.min(wall.length, +maxT.toFixed(1)),
          depthCm: Math.max(10, Math.round(maxN)),
          elevY: 0,
          height: col.heightCm,
        });
      }
    }
  }

  return spans.filter((s) => s.endCm - s.startCm >= 2);
}

/**
 * Checks whether a vertical elevation range [elevY, elevY + height] and horizontal span [startCm, endCm]
 * collides with any opening (window, room door, or column) on the wall or freestanding column.
 */
export function findCollidingOpening(
  wall: Wall,
  startCm: number,
  endCm: number,
  elevY: number,
  height: number,
  columns: RoomColumn[] = []
): WallOpening | null {
  const openings = wall.openings || [];
  const boxTop = elevY + height;
  for (const op of openings) {
    const hOverlap = startCm < op.offsetX + op.width - 1 && endCm > op.offsetX + 1;
    if (!hOverlap) continue;
    const opTop = op.elevY + op.height;
    const vOverlap = elevY < opTop - 1 && boxTop > op.elevY + 1;
    if (vOverlap) return op;
  }

  if (columns.length > 0) {
    const spans = getWallColumnSpans(wall, columns);
    for (const sp of spans) {
      // Only check synthetic spans beyond wall.openings
      const matchesOpening = openings.some(
        (o) => o.kind === 'column' && Math.abs(o.offsetX - sp.startCm) < 1 && Math.abs(o.offsetX + o.width - sp.endCm) < 1
      );
      if (matchesOpening) continue;
      if (startCm < sp.endCm - 1 && endCm > sp.startCm + 1 && elevY < sp.elevY + sp.height - 1 && boxTop > sp.elevY + 1) {
        return {
          id: 'freestanding_col',
          kind: 'column',
          offsetX: sp.startCm,
          width: sp.endCm - sp.startCm,
          elevY: sp.elevY,
          height: sp.height,
          depthCm: sp.depthCm,
        };
      }
    }
  }
  return null;
}

/**
 * Resizes or moves an opening safely within wall bounds (supports 1cm depthCm on columns).
 */
export function updateOpeningGeometry(
  opening: WallOpening,
  wall: Wall,
  patch: Partial<Pick<WallOpening, 'offsetX' | 'width' | 'elevY' | 'height' | 'swingDir' | 'depthCm'>>
): void {
  const minW = opening.kind === 'column' ? 15 : 40;
  const minH = opening.kind === 'column' ? 40 : 40;

  let width = patch.width !== undefined ? Math.round(patch.width) : opening.width;
  width = Math.max(minW, Math.min(wall.length, width));

  let offsetX = patch.offsetX !== undefined ? Math.round(patch.offsetX) : opening.offsetX;
  offsetX = Math.max(0, Math.min(wall.length - width, offsetX));

  let elevY = patch.elevY !== undefined ? Math.round(patch.elevY) : opening.elevY;
  if (opening.kind === 'door' || opening.kind === 'column') {
    elevY = 0;
  } else {
    elevY = Math.max(0, Math.min(wall.height - minH, elevY));
  }

  let height = patch.height !== undefined ? Math.round(patch.height) : opening.height;
  height = Math.max(minH, Math.min(wall.height - elevY, height));

  opening.offsetX = offsetX;
  opening.width = width;
  opening.elevY = elevY;
  opening.height = height;
  if (opening.kind === 'column' && patch.depthCm !== undefined && Number.isFinite(patch.depthCm)) {
    opening.depthCm = Math.max(10, Math.min(120, Math.round(patch.depthCm)));
  }
  if (patch.swingDir !== undefined && opening.kind === 'door') {
    opening.swingDir = patch.swingDir as DoorSwing;
  }
}

export const OPENING_LABELS: Record<OpeningKind, string> = {
  window: 'پنجره',
  door: 'درب ورودی / اتاق',
  column: 'ستون / داکت',
};
