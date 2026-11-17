import type { Wall } from './types';

/** Endpoint welding takes precedence over grid/angle assistance. Units: cm. */
export function snapWallEndpoint(raw: { x: number; y: number }, walls: Wall[], radius = 22) {
  let result = { ...raw, corner: false };
  let distance = radius;
  for (const wall of walls) {
    for (const p of [{ x: wall.x1Cm, y: wall.y1Cm }, { x: wall.x2Cm, y: wall.y2Cm }]) {
      const d = Math.hypot(raw.x - p.x, raw.y - p.y);
      if (d < distance) { distance = d; result = { ...p, corner: true }; }
    }
  }
  return result;
}
