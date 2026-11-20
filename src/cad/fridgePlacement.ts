import { FRIDGE_FRAME_CM, FRIDGE_MODELS } from './constants';
import type { CabinetBox, FridgeModel, Wall } from './types';

/** The source model's published physical depth, never the cabinet-frame depth. */
export function fridgeDepthCm(model?: FridgeModel): number {
  return FRIDGE_MODELS[model ?? 'side-by-side']?.depth ?? 70;
}

/** Exposed refrigerators stand a little ahead of their structural surrounds. */
export function fridgeFrontCm(model: FridgeModel | undefined, frameDepthCm: number): number {
  return Math.max(fridgeDepthCm(model) + 3, frameDepthCm + 18);
}

/** Keep the underside of an upper fridge cabinet within 5cm of the real
 * refrigerator top, including in older saved projects.
 * Linked cabinet's top is retained as much as its physical height allows. */
export function alignAboveFridge(wall: Wall, fridge: CabinetBox): void {
  if (fridge.type !== 'fridge') return;
  const upper = wall.boxes.find(box => box.linkedToBoxId === fridge.id);
  if (!upper) return;
  const modelHeight = FRIDGE_MODELS[fridge.fridgeModel ?? 'side-by-side']?.height ?? 185;
  const hasFrame = fridge.hasFridgeFrame ?? true;
  const gapCm = hasFrame ? FRIDGE_FRAME_CM : 3;
  const bottom = fridge.elevY + modelHeight + gapCm;
  const top = upper.elevY + upper.height;
  // The vertical frame and upper cabinet touch; no oversized void remains.
  fridge.height = modelHeight + (hasFrame ? FRIDGE_FRAME_CM : 0);
  upper.elevY = bottom;
  upper.height = Math.max(20, top - bottom);
  upper.offsetX = fridge.offsetX;
  upper.width = fridge.width;
  if (upper.doors.length === 1) {
    upper.doors[0].startCm = 0;
    upper.doors[0].widthCm = upper.width;
  }
}
