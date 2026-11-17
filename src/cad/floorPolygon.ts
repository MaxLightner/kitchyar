import type { Wall } from './types';

/** CAD centimeters: the floor must share the wall endpoints, not a padded scene bounding box. */
export interface FloorPoint { x: number; y: number }
const EPS_CM = 2;
const near = (a: FloorPoint, b: FloorPoint) => Math.hypot(a.x - b.x, a.y - b.y) <= EPS_CM;
const cross = (o: FloorPoint, a: FloorPoint, b: FloorPoint) =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
export const polygonAreaCm2 = (points: FloorPoint[]): number =>
  Math.abs(points.reduce((sum, p, i) => {
    const q = points[(i + 1) % points.length];
    return sum + p.x * q.y - q.x * p.y;
  }, 0)) / 2;

function hull(points: FloorPoint[]): FloorPoint[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const unique = sorted.filter((p, i) => i === 0 || !near(p, sorted[i - 1]));
  if (unique.length <= 2) return unique;
  const lower: FloorPoint[] = [];
  for (const p of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: FloorPoint[] = [];
  for (let i = unique.length - 1; i >= 0; i--) {
    const p = unique[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function singleWallFloor(wall: Wall): FloorPoint[] {
  const a = { x: wall.x1Cm, y: wall.y1Cm };
  const b = { x: wall.x2Cm, y: wall.y2Cm };
  const len = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
  const dir = wall.flipSide === -1 ? -1 : 1;
  const dx = -((b.y - a.y) / len) * 300 * dir;
  const dy = ((b.x - a.x) / len) * 300 * dir;
  return [a, b, { x: b.x + dx, y: b.y + dy }, { x: a.x + dx, y: a.y + dy }];
}

/**
 * Completes an open wall outline into a floor polygon:
 * - a single wall produces a 3m deep provisional rectangle;
 * - two connected walls produce a parallelogram, with the missing sides parallel
 *   to the two existing walls (the exact requested two-wall construction);
 * - a 3+ wall continuous chain is closed between its free endpoints;
 * - non-chain / ambiguous layouts use a convex hull fallback.
 *
 * All vertices are in CAD centimeters. No gap or arbitrary padding is introduced.
 */
export function deriveFloorPolygon(walls: Wall[]): FloorPoint[] {
  if (!walls.length) return [];
  if (walls.length === 1) return singleWallFloor(walls[0]);
  const edges = walls.map(w => ({
    a: { x: w.x1Cm, y: w.y1Cm },
    b: { x: w.x2Cm, y: w.y2Cm },
  }));
  if (walls.length === 2) {
    const [a, b] = edges;
    for (const [s, farA] of [[a.a, a.b], [a.b, a.a]] as [FloorPoint, FloorPoint][]) {
      const farB = near(s, b.a) ? b.b : near(s, b.b) ? b.a : null;
      if (!farB) continue;
      const opposite = { x: farA.x + farB.x - s.x, y: farA.y + farB.y - s.y };
      const poly = [s, farA, opposite, farB];
      if (polygonAreaCm2(poly) >= 400) return poly;
    }
  }

  const nodes: FloorPoint[] = [];
  const ends: [number, number][] = edges.map(edge => {
    const indexOf = (p: FloorPoint) => {
      const idx = nodes.findIndex(n => near(n, p));
      if (idx !== -1) return idx;
      return nodes.push(p) - 1;
    };
    return [indexOf(edge.a), indexOf(edge.b)];
  });
  const adj = nodes.map(() => [] as number[]);
  for (const [a, b] of ends) {
    if (a === b) continue;
    adj[a].push(b);
    adj[b].push(a);
  }
  const openEnds = adj.map((x, i) => x.length === 1 ? i : -1).filter(i => i >= 0);
  const isChain = openEnds.length === 2 && adj.every(n => n.length > 0 && n.length <= 2);
  const isLoop = openEnds.length === 0 && adj.every(n => n.length === 2);
  if (isChain || isLoop) {
    const path: number[] = [];
    const visited = new Set<number>();
    let cur = isChain ? openEnds[0] : 0;
    let prev = -1;
    for (let step = 0; step < nodes.length; step++) {
      if (visited.has(cur)) break;
      visited.add(cur);
      path.push(cur);
      const next = adj[cur].find(n => n !== prev && !visited.has(n));
      if (next === undefined) break;
      prev = cur;
      cur = next;
    }
    if (path.length === nodes.length) {
      const outline = path.map(i => nodes[i]);
      if (polygonAreaCm2(outline) >= 400) return outline;
    }
  }
  const poly = hull(nodes);
  if (polygonAreaCm2(poly) >= 400) return poly;
  const longest = [...walls].sort((a, b) => b.length - a.length)[0];
  return singleWallFloor(longest);
}
