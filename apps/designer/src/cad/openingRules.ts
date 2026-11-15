import { OPENING_DEFAULTS } from './constants';
import { DoorSwing, OpeningKind, Wall, WallOpening } from './types';

function makeUid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createWallOpening(
  kind: OpeningKind,
  offsetX: number,
  wall: Wall,
  overrides?: Partial<Pick<WallOpening, 'width' | 'elevY' | 'height' | 'swingDir'>>
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

  return {
    id: makeUid('open'),
    kind,
    offsetX: clampedOffsetX,
    width,
    elevY,
    height,
    swingDir: kind === 'door' ? (overrides?.swingDir ?? 'left-in') : undefined,
  };
}

/**
 * Checks whether a vertical elevation range [elevY, elevY + height] and horizontal span [startCm, endCm]
 * collides with any opening (window, room door, or column) on the wall.
 */
export function findCollidingOpening(
  wall: Wall,
  startCm: number,
  endCm: number,
  elevY: number,
  height: number
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
  return null;
}

/**
 * Resizes or moves an opening safely within wall bounds.
 */
export function updateOpeningGeometry(
  opening: WallOpening,
  wall: Wall,
  patch: Partial<Pick<WallOpening, 'offsetX' | 'width' | 'elevY' | 'height' | 'swingDir'>>
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
  if (patch.swingDir !== undefined && opening.kind === 'door') {
    opening.swingDir = patch.swingDir as DoorSwing;
  }
}

export const OPENING_LABELS: Record<OpeningKind, string> = {
  window: 'پنجره',
  door: 'درب ورودی / اتاق',
  column: 'ستون / داکت',
};
