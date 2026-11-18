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

export function snapWallDrawingPoint(raw: { x: number; y: number }, walls: Wall[], start?: { x: number; y: number } | null) {
  const vertex = snapWallEndpoint(raw, walls);
  if (vertex.corner) return vertex;
  let x = Math.round(raw.x / 5) * 5;
  let y = Math.round(raw.y / 5) * 5;
  if (start) {
    const angle = Math.abs(Math.atan2(y - start.y, x - start.x) * 180 / Math.PI);
    if (angle < 12 || angle > 168) y = start.y;
    else if (Math.abs(angle - 90) < 12) x = start.x;
  }
  return { x, y, corner: false };
}

export function hasWallSegment(walls: Wall[], candidate: Wall) {
  const close = (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x1 - x2, y1 - y2) <= 0.5;
  return walls.some(wall => (
    close(wall.x1Cm, wall.y1Cm, candidate.x1Cm, candidate.y1Cm) && close(wall.x2Cm, wall.y2Cm, candidate.x2Cm, candidate.y2Cm)
  ) || (
    close(wall.x1Cm, wall.y1Cm, candidate.x2Cm, candidate.y2Cm) && close(wall.x2Cm, wall.y2Cm, candidate.x1Cm, candidate.y1Cm)
  ));
}
