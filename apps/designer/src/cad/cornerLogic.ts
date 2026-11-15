import { CabinetBox, CornerJunction, BlockedZone, BoxKind, Wall } from './types';
import { BOX_PRESETS } from './constants';

export function makeCornerKey(
  wallId1: string,
  end1: 'start' | 'end',
  wallId2: string,
  end2: 'start' | 'end'
): string {
  const a = `${wallId1}:${end1}`;
  const b = `${wallId2}:${end2}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function getWallVectors(wall: Wall): {
  tx: number;
  ty: number;
  nx: number;
  ny: number;
} {
  const rad = (wall.angle * Math.PI) / 180;
  const tx = Math.cos(rad);
  const ty = Math.sin(rad);
  const flip = wall.flipSide || 1;
  // Local +y in SVG transform(translate x1,y1 rotate angle) is (-sin, cos);
  // cabinets are placed on +y when flip=1 and -y when flip=-1.
  const nx = -flip * ty;
  const ny = flip * tx;
  return { tx, ty, nx, ny };
}

export interface CornerGeometryInfo {
  kind: 'inside-90' | 'inside-angled' | 'outside' | 'mismatched';
  angleDeg: number;
  getSetbackCm: (depthCm: number) => number;
}

export function analyzeCornerJunction(
  wA: Wall,
  endA: 'start' | 'end',
  wB: Wall,
  endB: 'start' | 'end'
): CornerGeometryInfo {
  const vA = getWallVectors(wA);
  const vB = getWallVectors(wB);

  const dirA = endA === 'start' ? 1 : -1;
  const dirB = endB === 'start' ? 1 : -1;
  const uAx = dirA * vA.tx;
  const uAy = dirA * vA.ty;
  const uBx = dirB * vB.tx;
  const uBy = dirB * vB.ty;

  const dotAB = Math.max(-0.999, Math.min(0.999, uAx * uBx + uAy * uBy));
  const phi = Math.acos(dotAB);
  const angleDeg = +((phi * 180) / Math.PI).toFixed(1);

  const nAintoB = vA.nx * uBx + vA.ny * uBy;
  const nBintoA = vB.nx * uAx + vB.ny * uAy;
  const tanHalf = Math.max(0.15, Math.tan(phi / 2));

  if (nAintoB > 0.05 && nBintoA > 0.05) {
    if (angleDeg >= 78 && angleDeg <= 102) {
      return {
        kind: 'inside-90',
        angleDeg,
        getSetbackCm: (d) => Math.round(d),
      };
    }
    return {
      kind: 'inside-angled',
      angleDeg,
      getSetbackCm: (d) => Math.max(0, Math.round(d / tanHalf)),
    };
  }

  if (nAintoB < -0.05 && nBintoA < -0.05) {
    return {
      kind: 'outside',
      angleDeg,
      getSetbackCm: () => 0,
    };
  }

  if (nAintoB + nBintoA > 0.1) {
    return {
      kind: angleDeg >= 78 && angleDeg <= 102 ? 'inside-90' : 'inside-angled',
      angleDeg,
      getSetbackCm: (d) =>
        angleDeg >= 78 && angleDeg <= 102
          ? Math.round(d)
          : Math.max(0, Math.round(d / tanHalf)),
    };
  }

  return {
    kind: 'mismatched',
    angleDeg,
    getSetbackCm: () => 0,
  };
}

/**
 * Automatically determines the interior flipSide for a newly drawn wall (and, when a 2nd wall
 * turns an isolated empty 1st wall into an L-corner, orients the 1st wall inward too!).
 */
export function autoOrientWallsOnAdd(existingWalls: Wall[], newWall: Wall): Wall {
  const newVec = getWallVectors(newWall);
  const endpointsNew: Array<{ end: 'start' | 'end'; x: number; y: number }> = [
    { end: 'start', x: newWall.x1Cm, y: newWall.y1Cm },
    { end: 'end', x: newWall.x2Cm, y: newWall.y2Cm },
  ];

  type Match = {
    other: Wall;
    otherEnd: 'start' | 'end';
    newEnd: 'start' | 'end';
  };
  let match: Match | null = null;

  for (const other of existingWalls) {
    const endpointsOther: Array<{ end: 'start' | 'end'; x: number; y: number }> = [
      { end: 'start', x: other.x1Cm, y: other.y1Cm },
      { end: 'end', x: other.x2Cm, y: other.y2Cm },
    ];
    for (const en of endpointsNew) {
      for (const eo of endpointsOther) {
        if (Math.hypot(en.x - eo.x, en.y - eo.y) <= 15) {
          match = { other, otherEnd: eo.end, newEnd: en.end };
          break;
        }
      }
      if (match) break;
    }
    if (match) break;
  }

  if (!match) return newWall;

  const { other, otherEnd, newEnd } = match;
  const otherVec = getWallVectors(other);

  // If there is only 1 existing wall and it has no boxes yet, orient BOTH walls toward the concave (<180°) corner!
  if (existingWalls.length === 1 && other.boxes.length === 0) {
    const dirO = otherEnd === 'start' ? 1 : -1;
    const dirN = newEnd === 'start' ? 1 : -1;
    const uOx = dirO * otherVec.tx;
    const uOy = dirO * otherVec.ty;
    const uNx = dirN * newVec.tx;
    const uNy = dirN * newVec.ty;
    const bx = uOx + uNx;
    const by = uOy + uNy;

    if (Math.hypot(bx, by) > 0.2) {
      const oPlusDot = -otherVec.ty * bx + otherVec.tx * by;
      other.flipSide = oPlusDot >= 0 ? 1 : -1;
      const nPlusDot = -newVec.ty * bx + newVec.tx * by;
      return { ...newWall, flipSide: nPlusDot >= 0 ? 1 : -1 };
    }
  }

  // Otherwise preserve continuous polyline handedness from `other` into `newWall`
  const refreshedOther = getWallVectors(other);
  const toJ_x = (otherEnd === 'end' ? 1 : -1) * refreshedOther.tx;
  const toJ_y = (otherEnd === 'end' ? 1 : -1) * refreshedOther.ty;
  const fromJ_x = (newEnd === 'start' ? 1 : -1) * newVec.tx;
  const fromJ_y = (newEnd === 'start' ? 1 : -1) * newVec.ty;

  const sideOther = toJ_x * refreshedOther.ny - toJ_y * refreshedOther.nx;
  const nPlusX = -newVec.ty;
  const nPlusY = newVec.tx;
  const sideNewPlus = fromJ_x * nPlusY - fromJ_y * nPlusX;

  return {
    ...newWall,
    flipSide: sideNewPlus * sideOther >= 0 ? 1 : -1,
  };
}

/**
 * When the user clicks/drags on a specific side of an empty wall, orients that wall
 * (and any connected empty walls) continuously to match that side.
 */
export function orientEmptyConnectedWallsFromSeed(
  walls: Wall[],
  seedWallId: string,
  seedFlip: 1 | -1
): void {
  const seed = walls.find((w) => w.id === seedWallId);
  if (!seed || seed.boxes.length > 0) return;

  seed.flipSide = seedFlip;
  const visited = new Set<string>([seedWallId]);
  const queue: Wall[] = [seed];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    const curVec = getWallVectors(cur);

    for (const next of walls) {
      if (visited.has(next.id) || next.boxes.length > 0) continue;

      const pairs: Array<['start' | 'end', number, number, 'start' | 'end', number, number]> = [
        ['start', cur.x1Cm, cur.y1Cm, 'start', next.x1Cm, next.y1Cm],
        ['start', cur.x1Cm, cur.y1Cm, 'end', next.x2Cm, next.y2Cm],
        ['end', cur.x2Cm, cur.y2Cm, 'start', next.x1Cm, next.y1Cm],
        ['end', cur.x2Cm, cur.y2Cm, 'end', next.x2Cm, next.y2Cm],
      ];

      const hit = pairs.find(([, ax, ay, , bx, by]) => Math.hypot(ax - bx, ay - by) <= 15);
      if (!hit) continue;

      const [curEnd, , , nextEnd] = hit;
      const nextVec = getWallVectors(next);
      const toJ_x = (curEnd === 'end' ? 1 : -1) * curVec.tx;
      const toJ_y = (curEnd === 'end' ? 1 : -1) * curVec.ty;
      const fromJ_x = (nextEnd === 'start' ? 1 : -1) * nextVec.tx;
      const fromJ_y = (nextEnd === 'start' ? 1 : -1) * nextVec.ty;

      const sideCur = toJ_x * curVec.ny - toJ_y * curVec.nx;
      const nPlusX = -nextVec.ty;
      const nPlusY = nextVec.tx;
      const sideNextPlus = fromJ_x * nPlusY - fromJ_y * nPlusX;

      next.flipSide = sideNextPlus * sideCur >= 0 ? 1 : -1;
      visited.add(next.id);
      queue.push(next);
    }
  }
}

export function detectCornerJunctions(
  walls: Wall[],
  cornerOwners: Record<string, string>
): CornerJunction[] {
  const junctions: CornerJunction[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const wA = walls[i];
      const wB = walls[j];
      const pairs: Array<['start' | 'end', number, number, 'start' | 'end', number, number]> = [
        ['start', wA.x1Cm, wA.y1Cm, 'start', wB.x1Cm, wB.y1Cm],
        ['start', wA.x1Cm, wA.y1Cm, 'end', wB.x2Cm, wB.y2Cm],
        ['end', wA.x2Cm, wA.y2Cm, 'start', wB.x1Cm, wB.y1Cm],
        ['end', wA.x2Cm, wA.y2Cm, 'end', wB.x2Cm, wB.y2Cm],
      ];

      for (const [endA, ax, ay, endB, bx, by] of pairs) {
        if (Math.hypot(ax - bx, ay - by) <= 15) {
          const key = makeCornerKey(wA.id, endA, wB.id, endB);
          if (seen.has(key)) continue;
          seen.add(key);

          // Skip collinear straight extensions (~0° or ~180°)
          const dirA = endA === 'start' ? 1 : -1;
          const dirB = endB === 'start' ? 1 : -1;
          const vA = getWallVectors(wA);
          const vB = getWallVectors(wB);
          const dot = dirA * vA.tx * (dirB * vB.tx) + dirA * vA.ty * (dirB * vB.ty);
          if (Math.abs(dot) > 0.96) continue;

          const savedOwner = cornerOwners[key];
          const ownerWallId =
            savedOwner === wA.id || savedOwner === wB.id ? savedOwner : wA.id;

          junctions.push({
            key,
            xCm: (ax + bx) / 2,
            yCm: (ay + by) / 2,
            wallAId: wA.id,
            wallAEnd: endA,
            wallBId: wB.id,
            wallBEnd: endB,
            ownerWallId,
          });
        }
      }
    }
  }
  return junctions;
}

function boxCoversWallEnd(box: CabinetBox, wallLength: number, end: 'start' | 'end'): boolean {
  if (end === 'start') return box.offsetX <= 5;
  return box.offsetX + box.width >= wallLength - 5;
}

function boxAbutsCornerEnd(box: CabinetBox, wallLength: number, end: 'start' | 'end'): boolean {
  if (end === 'start') return box.offsetX <= 70;
  return box.offsetX + box.width >= wallLength - 70;
}

export function getBoxTier(box: CabinetBox): 'lower' | 'wall-lower' | 'wall-upper' {
  if (box.type === 'wall') return 'wall-lower';
  if (box.type === 'wall-deep') return 'wall-upper';
  return 'lower';
}

function getTierBoxesAtEnd(
  wall: Wall,
  end: 'start' | 'end',
  tier: 'lower' | 'wall-lower' | 'wall-upper',
  includeAbutting = false
): CabinetBox[] {
  const matcher = includeAbutting ? boxAbutsCornerEnd : boxCoversWallEnd;
  return wall.boxes.filter((b) => {
    const bTier = getBoxTier(b);
    if (tier === 'lower') {
      return bTier === 'lower' && matcher(b, wall.length, end);
    }
    if (tier === 'wall-lower') {
      return (
        (bTier === 'wall-lower' || b.type === 'tall' || b.type === 'closet') &&
        matcher(b, wall.length, end)
      );
    }
    return (bTier === 'wall-upper' || b.type === 'closet') && matcher(b, wall.length, end);
  });
}

/**
 * Computes locked/blocked corner zones for a specific wall in Front Elevation,
 * handling 90° L/U corners (60/32/58cm), obtuse inside corners (k = d / tan(phi/2)),
 * and outside reflex corners (0cm blocked).
 */
export function getCornerBlockedZonesForWall(
  wall: Wall,
  allWalls: Wall[],
  cornerOwners: Record<string, string>
): BlockedZone[] {
  const junctions = detectCornerJunctions(allWalls, cornerOwners);
  const zones: BlockedZone[] = [];

  for (const j of junctions) {
    const isWallA = j.wallAId === wall.id;
    const isWallB = j.wallBId === wall.id;
    if (!isWallA && !isWallB) continue;

    const myEnd = isWallA ? j.wallAEnd : j.wallBEnd;
    const otherId = isWallA ? j.wallBId : j.wallAId;
    const otherEnd = isWallA ? j.wallBEnd : j.wallAEnd;
    const otherWall = allWalls.find((w) => w.id === otherId);
    if (!otherWall) continue;

    const geom = analyzeCornerJunction(wall, myEnd, otherWall, otherEnd);
    if (geom.kind === 'outside' || geom.kind === 'mismatched') continue;

    const tiers: Array<'lower' | 'wall-lower' | 'wall-upper'> = ['lower', 'wall-lower', 'wall-upper'];

    for (const tier of tiers) {
      if (geom.kind === 'inside-angled') {
        const myBoxes = getTierBoxesAtEnd(wall, myEnd, tier, false);
        const otherBoxes = getTierBoxesAtEnd(otherWall, otherEnd, tier, false);
        if (!myBoxes.length || !otherBoxes.length) continue;

        const minD = Math.min(
          Math.max(...myBoxes.map((b) => b.depth)),
          Math.max(...otherBoxes.map((b) => b.depth))
        );
        const k = geom.getSetbackCm(minD);
        if (k < 4) continue;
        zones.push({
          startCm: myEnd === 'start' ? 0 : Math.max(0, wall.length - k),
          endCm: myEnd === 'start' ? Math.min(wall.length, k) : wall.length,
          depthCm: k,
          tier,
          role: 'blind-behind',
          otherWallName: otherWall.name,
          cornerKey: j.key,
        });
        continue;
      }

      // Standard 90-degree corner
      const iAmOwner = j.ownerWallId === wall.id;
      const myBoxes = getTierBoxesAtEnd(wall, myEnd, tier, !iAmOwner);
      const otherBoxes = getTierBoxesAtEnd(otherWall, otherEnd, tier, iAmOwner);
      if (!myBoxes.length && !otherBoxes.length) continue;

      const otherDepth = otherBoxes.length
        ? Math.max(...otherBoxes.map((b) => b.depth))
        : tier === 'wall-lower'
        ? 32
        : 60;
      const myDepth = myBoxes.length
        ? Math.max(...myBoxes.map((b) => b.depth))
        : tier === 'wall-lower'
        ? 32
        : 60;

      if (iAmOwner) {
        if (otherBoxes.length > 0 && myBoxes.length > 0) {
          const d = otherDepth;
          zones.push({
            startCm: myEnd === 'start' ? 0 : Math.max(0, wall.length - d),
            endCm: myEnd === 'start' ? Math.min(wall.length, d) : wall.length,
            depthCm: d,
            tier,
            role: 'blind-behind',
            otherWallName: otherWall.name,
            cornerKey: j.key,
          });
        }
      } else {
        if (otherBoxes.length > 0) {
          const d = Math.max(otherDepth, myBoxes.length ? otherDepth : 0);
          zones.push({
            startCm: myEnd === 'start' ? 0 : Math.max(0, wall.length - d),
            endCm: myEnd === 'start' ? Math.min(wall.length, d) : wall.length,
            depthCm: d,
            tier,
            role: 'side-profile',
            otherWallName: otherWall.name,
            cornerKey: j.key,
          });
        } else if (myBoxes.length > 0 && otherWall.boxes.some((b) => boxCoversWallEnd(b, otherWall.length, otherEnd))) {
          const d = myDepth;
          zones.push({
            startCm: myEnd === 'start' ? 0 : Math.max(0, wall.length - d),
            endCm: myEnd === 'start' ? Math.min(wall.length, d) : wall.length,
            depthCm: d,
            tier,
            role: 'side-profile',
            otherWallName: otherWall.name,
            cornerKey: j.key,
          });
        }
      }
    }
  }

  return zones;
}

/**
 * Checks whether a specific [startCm, endCm] range inside a CabinetBox overlaps any blocked corner zone
 * for its vertical tier.
 */
export function isBoxIntervalBlocked(
  box: CabinetBox,
  intervalStartInBoxCm: number,
  intervalEndInBoxCm: number,
  blockedZones: BlockedZone[]
): BlockedZone | null {
  const absStart = box.offsetX + intervalStartInBoxCm;
  const absEnd = box.offsetX + intervalEndInBoxCm;
  const boxTier = getBoxTier(box);

  for (const z of blockedZones) {
    const tierMatches =
      (boxTier === 'lower' && z.tier === 'lower') ||
      (boxTier === 'wall-lower' && z.tier === 'wall-lower') ||
      (boxTier === 'wall-upper' && z.tier === 'wall-upper') ||
      ((box.type === 'tall' || box.type === 'closet') && z.tier === 'lower');
    if (!tierMatches) continue;
    const overlap = Math.min(absEnd, z.endCm) - Math.max(absStart, z.startCm);
    if (overlap > 2) return z;
  }
  return null;
}

/**
 * For Plan View rendering: computes the effective start/end offset of a box along its wall
 * so non-owner 90° wall cabinets stop cleanly against the owner wall's corner cabinet depth.
 */
export function getPlanVisualSpanForBox(
  box: CabinetBox,
  wall: Wall,
  allWalls: Wall[],
  cornerOwners: Record<string, string>
): { startCm: number; endCm: number } {
  let startCm = box.offsetX;
  let endCm = box.offsetX + box.width;
  const zones = getCornerBlockedZonesForWall(wall, allWalls, cornerOwners);
  const tier = getBoxTier(box);

  for (const z of zones) {
    if (z.role !== 'side-profile') continue;
    const tierMatches =
      z.tier === tier ||
      ((box.type === 'tall' || box.type === 'closet') && z.tier === 'lower');
    if (!tierMatches) continue;

    if (z.startCm === 0 && startCm < z.endCm) {
      startCm = Math.min(endCm, z.endCm);
    } else if (z.endCm >= wall.length - 1 && endCm > z.startCm) {
      endCm = Math.max(startCm, z.startCm);
    }
  }

  return { startCm, endCm };
}

/**
 * Returns the exact 4-corner world polygon (in cm) for a box in Plan View,
 * automatically beveling/mitering ends that meet an inside-angled (e.g. 135°) corner!
 */
export function getPlanPolygonForBox(
  box: CabinetBox,
  wall: Wall,
  allWalls: Wall[],
  cornerOwners: Record<string, string>
): Array<{ x: number; y: number }> {
  const span = getPlanVisualSpanForBox(box, wall, allWalls, cornerOwners);
  let wallStartCm = span.startCm;
  let wallEndCm = span.endCm;
  const visW = Math.max(0, wallEndCm - wallStartCm);
  if (visW < 3) return [];

  const { tx, ty, nx, ny } = getWallVectors(wall);
  const d = box.depth;
  const tier = getBoxTier(box);
  const junctions = detectCornerJunctions(allWalls, cornerOwners);

  let frontStartCm = wallStartCm;
  let frontEndCm = wallEndCm;

  for (const j of junctions) {
    const isA = j.wallAId === wall.id;
    const isB = j.wallBId === wall.id;
    if (!isA && !isB) continue;

    const myEnd = isA ? j.wallAEnd : j.wallBEnd;
    const otherId = isA ? j.wallBId : j.wallAId;
    const otherEnd = isA ? j.wallBEnd : j.wallAEnd;
    const otherWall = allWalls.find((w) => w.id === otherId);
    if (!otherWall) continue;

    const geom = analyzeCornerJunction(wall, myEnd, otherWall, otherEnd);
    if (geom.kind === 'mismatched') continue;

    const touchesOrAbutsCorner =
      geom.kind === 'inside-90'
        ? (myEnd === 'start' && box.offsetX <= 70) ||
          (myEnd === 'end' && box.offsetX + box.width >= wall.length - 70)
        : (myEnd === 'start' && wallStartCm <= 4) ||
          (myEnd === 'end' && wallEndCm >= wall.length - 4);
    if (!touchesOrAbutsCorner) continue;

    const otherBoxes = getTierBoxesAtEnd(otherWall, otherEnd, tier, geom.kind === 'inside-90');
    if (!otherBoxes.length) continue;

    const otherD = Math.max(...otherBoxes.map((b) => b.depth));
    const phi = (geom.angleDeg * Math.PI) / 180;
    const sinPhi = Math.max(0.15, Math.sin(phi));
    const kExact = (otherD + d * Math.cos(phi)) / sinPhi;

    if (geom.kind === 'inside-90' || geom.kind === 'inside-angled') {
      const k = Math.max(0, Math.min(visW * 0.9, kExact));
      if (myEnd === 'start') {
        wallStartCm = 0;
        frontStartCm = k;
      } else {
        wallEndCm = wall.length;
        frontEndCm = wall.length - k;
      }
    } else if (geom.kind === 'outside') {
      const kOut = Math.max(0, kExact);
      if (myEnd === 'start') {
        wallStartCm = 0;
        frontStartCm = -kOut;
      } else {
        wallEndCm = wall.length;
        frontEndCm = wall.length + kOut;
      }
    }
  }

  const wsx = wall.x1Cm + wallStartCm * tx;
  const wsy = wall.y1Cm + wallStartCm * ty;
  const wex = wall.x1Cm + wallEndCm * tx;
  const wey = wall.y1Cm + wallEndCm * ty;

  const fsx = wall.x1Cm + frontStartCm * tx + d * nx;
  const fsy = wall.y1Cm + frontStartCm * ty + d * ny;
  const fex = wall.x1Cm + frontEndCm * tx + d * nx;
  const fey = wall.y1Cm + frontEndCm * ty + d * ny;

  return [
    { x: wsx, y: wsy },
    { x: wex, y: wey },
    { x: fex, y: fey },
    { x: fsx, y: fsy },
  ];
}

export interface CornerBridgePolygon {
  key: string;
  tier: 'lower' | 'wall-lower' | 'wall-upper';
  isWallCab: boolean;
  points: Array<{ x: number; y: number }>;
}

/**
 * Outside corners are now joined seamlessly by a single diagonal miter line directly
 * inside `getPlanPolygonForBox`, so no extra filler cap polygons (which caused double lines) are needed.
 */
export function getOutsideCornerBridges(
  _walls: Wall[],
  _cornerOwners: Record<string, string>
): CornerBridgePolygon[] {
  return [];
}

export interface SweepSegment {
  wallId: string;
  startCm: number;
  widthCm: number;
}

/**
 * Computes clean, clamped, multi-wall cabinet sweep segments from `(startWallId, startOffsetCm)`
 * to `(targetWallId, targetOffsetCm)`, supporting 1, 2, 3+ walls around 90°, 135°, and outside corners!
 */
export function computeMultiWallSweep(
  walls: Wall[],
  startWallId: string,
  startOffsetCm: number,
  targetWallId: string,
  targetOffsetCm: number,
  boxKind: BoxKind,
  cornerOwners: Record<string, string>,
  hasDragged: boolean
): { segments: SweepSegment[]; suggestedOwners: Record<string, string> } {
  const startWall = walls.find((w) => w.id === startWallId);
  const targetWall = walls.find((w) => w.id === targetWallId);
  if (!startWall || !targetWall) {
    return { segments: [], suggestedOwners: {} };
  }

  const presetDepth = BOX_PRESETS[boxKind]?.depth ?? 60;
  const snapNearEnds = (val: number, len: number) => {
    if (val <= 15) return 0;
    if (len - val <= 15) return len;
    return Math.max(0, Math.min(len, Math.round(val / 5) * 5));
  };

  // Snap to existing boxes of the same tier on a wall if within 12cm
  const targetTier = boxKind === 'wall' ? 'wall-lower' : boxKind === 'wall-deep' ? 'wall-upper' : 'lower';
  const snapToWallAndBoxes = (val: number, w: Wall) => {
    let s = snapNearEnds(val, w.length);
    for (const b of w.boxes) {
      if (getBoxTier(b) !== targetTier) continue;
      if (Math.abs(s - b.offsetX) <= 12) s = b.offsetX;
      if (Math.abs(s - (b.offsetX + b.width)) <= 12) s = b.offsetX + b.width;
    }
    return Math.max(0, Math.min(w.length, s));
  };

  // Same-wall placement
  if (startWall.id === targetWall.id) {
    if (!hasDragged) {
      let s = snapToWallAndBoxes(startOffsetCm - 30, startWall);
      if (startOffsetCm <= 15) s = 0;
      else if (startWall.length - startOffsetCm <= 15) s = Math.max(0, startWall.length - 60);
      s = Math.max(0, Math.min(startWall.length - 30, s));
      const w = Math.min(60, startWall.length - s);
      if (w < 30) return { segments: [], suggestedOwners: {} };
      return {
        segments: [{ wallId: startWall.id, startCm: s, widthCm: w }],
        suggestedOwners: {},
      };
    }

    let s = snapToWallAndBoxes(Math.min(startOffsetCm, targetOffsetCm), startWall);
    let e = snapToWallAndBoxes(Math.max(startOffsetCm, targetOffsetCm), startWall);
    if (e - s < 30) {
      if (s + 30 <= startWall.length) e = s + 30;
      else s = Math.max(0, e - 30);
    }
    const w = e - s;
    if (w < 30) return { segments: [], suggestedOwners: {} };
    return {
      segments: [{ wallId: startWall.id, startCm: s, widthCm: w }],
      suggestedOwners: {},
    };
  }

  // BFS across corner junctions to find wall chain from startWall -> targetWall
  const junctions = detectCornerJunctions(walls, cornerOwners);
  interface Step {
    wallId: string;
    viaJunction?: CornerJunction;
    prevWallId?: string;
    exitEndOnPrev?: 'start' | 'end';
    entryEndOnCur?: 'start' | 'end';
  }
  const visited = new Set<string>([startWall.id]);
  const parent = new Map<string, Step>();
  const queue: string[] = [startWall.id];
  let found = false;

  while (queue.length > 0 && !found) {
    const curId = queue.shift()!;
    for (const j of junctions) {
      const isA = j.wallAId === curId;
      const isB = j.wallBId === curId;
      if (!isA && !isB) continue;
      const nextId = isA ? j.wallBId : j.wallAId;
      if (visited.has(nextId)) continue;
      visited.add(nextId);
      parent.set(nextId, {
        wallId: nextId,
        viaJunction: j,
        prevWallId: curId,
        exitEndOnPrev: isA ? j.wallAEnd : j.wallBEnd,
        entryEndOnCur: isA ? j.wallBEnd : j.wallAEnd,
      });
      if (nextId === targetWall.id) {
        found = true;
        break;
      }
      queue.push(nextId);
    }
  }

  if (!found) {
    // Disconnected wall: fallback to targetWall single placement
    const s = Math.max(0, Math.min(targetWall.length - 60, snapToWallAndBoxes(targetOffsetCm - 30, targetWall)));
    const w = Math.min(60, targetWall.length - s);
    return {
      segments: w >= 30 ? [{ wallId: targetWall.id, startCm: s, widthCm: w }] : [],
      suggestedOwners: {},
    };
  }

  // Reconstruct path of walls + junctions
  const chainSteps: Step[] = [];
  let cursor: string | undefined = targetWall.id;
  while (cursor && cursor !== startWall.id) {
    const st = parent.get(cursor);
    if (!st) break;
    chainSteps.unshift(st);
    cursor = st.prevWallId;
  }

  const wallIds = [startWall.id, ...chainSteps.map((st) => st.wallId)];
  const spans = new Map<string, { startCm: number; endCm: number }>();

  // Initialize spans for every wall in the chain
  wallIds.forEach((wId, idx) => {
    const w = walls.find((x) => x.id === wId)!;
    if (idx === 0) {
      const exitEnd = chainSteps[0].exitEndOnPrev!;
      const sOff = snapToWallAndBoxes(startOffsetCm, w);
      spans.set(
        wId,
        exitEnd === 'end'
          ? { startCm: Math.min(sOff, Math.max(0, w.length - 30)), endCm: w.length }
          : { startCm: 0, endCm: Math.max(sOff, Math.min(w.length, 30)) }
      );
    } else if (idx === wallIds.length - 1) {
      const entryEnd = chainSteps[chainSteps.length - 1].entryEndOnCur!;
      const tOff = snapToWallAndBoxes(targetOffsetCm, w);
      spans.set(
        wId,
        entryEnd === 'start'
          ? { startCm: 0, endCm: Math.max(tOff, Math.min(w.length, 30)) }
          : { startCm: Math.min(tOff, Math.max(0, w.length - 30)), endCm: w.length }
      );
    } else {
      spans.set(wId, { startCm: 0, endCm: w.length });
    }
  });

  // Apply 90° corner ownership setbacks cleanly; angled & outside corners meet right at vertex!
  const suggestedOwners: Record<string, string> = {};
  for (const st of chainSteps) {
    const j = st.viaJunction!;
    const wPrev = walls.find((x) => x.id === st.prevWallId!)!;
    const wNext = walls.find((x) => x.id === st.wallId)!;
    const geom = analyzeCornerJunction(wPrev, st.exitEndOnPrev!, wNext, st.entryEndOnCur!);

    if (geom.kind === 'inside-90') {
      const ownerId =
        cornerOwners[j.key] === wPrev.id || cornerOwners[j.key] === wNext.id
          ? cornerOwners[j.key]
          : wPrev.id;
      suggestedOwners[j.key] = ownerId;

      const trimWallId = ownerId === wPrev.id ? wNext.id : wPrev.id;
      const trimEnd = ownerId === wPrev.id ? st.entryEndOnCur! : st.exitEndOnPrev!;
      const setback = geom.getSetbackCm(presetDepth);
      const sp = spans.get(trimWallId)!;
      if (trimEnd === 'start') {
        sp.startCm = Math.max(sp.startCm, setback);
      } else {
        sp.endCm = Math.min(sp.endCm, (ownerId === wPrev.id ? wNext.length : wPrev.length) - setback);
      }
    }
  }

  const segments: SweepSegment[] = [];
  for (const wId of wallIds) {
    const sp = spans.get(wId)!;
    const widthCm = Math.round(sp.endCm - sp.startCm);
    if (widthCm >= 30) {
      segments.push({ wallId: wId, startCm: Math.round(sp.startCm), widthCm });
    }
  }

  return { segments, suggestedOwners };
}

/**
 * Cleanly flips which wall owns a corner junction:
 * The old owner's boxes touching that corner shrink back by cornerDepth (preserving door wall positions),
 * and the new owner's abutting boxes extend into the corner (preserving door wall positions).
 */
export function toggleCornerOwner(
  walls: Wall[],
  cornerOwners: Record<string, string>,
  cornerKey: string
): Record<string, string> {
  const junctions = detectCornerJunctions(walls, cornerOwners);
  const j = junctions.find((x) => x.key === cornerKey);
  if (!j) return cornerOwners;

  const oldOwnerId = j.ownerWallId;
  const newOwnerId = oldOwnerId === j.wallAId ? j.wallBId : j.wallAId;
  const oldEnd = oldOwnerId === j.wallAId ? j.wallAEnd : j.wallBEnd;
  const newEnd = newOwnerId === j.wallAId ? j.wallAEnd : j.wallBEnd;

  const oldWall = walls.find((w) => w.id === oldOwnerId);
  const newWall = walls.find((w) => w.id === newOwnerId);
  if (!oldWall || !newWall) return cornerOwners;

  const geom = analyzeCornerJunction(oldWall, oldEnd, newWall, newEnd);
  if (geom.kind !== 'inside-90') {
    return { ...cornerOwners, [cornerKey]: newOwnerId };
  }

  const shiftTierBox = (
    w: Wall,
    end: 'start' | 'end',
    mode: 'shrink-from-corner' | 'extend-to-corner',
    tier: 'lower' | 'wall-lower' | 'wall-upper',
    depth: number
  ) => {
    const boxes = w.boxes.filter((b) => {
      const bTier = getBoxTier(b);
      if (tier === 'lower') return bTier === 'lower';
      if (tier === 'wall-lower') return bTier === 'wall-lower';
      return bTier === 'wall-upper';
    });
    for (const b of boxes) {
      if (mode === 'shrink-from-corner') {
        if (end === 'start' && b.offsetX <= 5 && b.width > depth + 30) {
          b.offsetX += depth;
          b.width -= depth;
          b.doors = b.doors
            .map((d) => ({ ...d, startCm: +(d.startCm - depth).toFixed(1) }))
            .filter((d) => d.startCm >= -0.5);
          b.unitDividers = b.unitDividers.map((u) => +(u - depth).toFixed(1)).filter((u) => u > 2);
          b.shelves = b.shelves
            .map((s) => ({ ...s, startCm: +(s.startCm - depth).toFixed(1), endCm: +(s.endCm - depth).toFixed(1) }))
            .filter((s) => s.endCm > 5);
        } else if (end === 'end' && b.offsetX + b.width >= w.length - 5 && b.width > depth + 30) {
          b.width -= depth;
          b.doors = b.doors.filter((d) => d.startCm + d.widthCm <= b.width + 0.5);
          b.unitDividers = b.unitDividers.filter((u) => u < b.width - 2);
          b.shelves = b.shelves.filter((s) => s.startCm < b.width - 5);
        }
      } else {
        if (end === 'start' && b.offsetX >= depth - 10 && b.offsetX <= depth + 15) {
          const delta = b.offsetX;
          b.offsetX = 0;
          b.width += delta;
          b.doors = b.doors.map((d) => ({ ...d, startCm: +(d.startCm + delta).toFixed(1) }));
          b.unitDividers = b.unitDividers.map((u) => +(u + delta).toFixed(1));
          b.shelves = b.shelves.map((s) => ({
            ...s,
            startCm: +(s.startCm + delta).toFixed(1),
            endCm: +(s.endCm + delta).toFixed(1),
          }));
        } else if (
          end === 'end' &&
          b.offsetX + b.width <= w.length - depth + 10 &&
          b.offsetX + b.width >= w.length - depth - 15
        ) {
          const delta = w.length - (b.offsetX + b.width);
          b.width += delta;
        }
      }
    }
  };

  shiftTierBox(oldWall, oldEnd, 'shrink-from-corner', 'lower', 60);
  shiftTierBox(newWall, newEnd, 'extend-to-corner', 'lower', 60);
  shiftTierBox(oldWall, oldEnd, 'shrink-from-corner', 'wall-lower', 32);
  shiftTierBox(newWall, newEnd, 'extend-to-corner', 'wall-lower', 32);
  shiftTierBox(oldWall, oldEnd, 'shrink-from-corner', 'wall-upper', 58);
  shiftTierBox(newWall, newEnd, 'extend-to-corner', 'wall-upper', 58);

  return { ...cornerOwners, [cornerKey]: newOwnerId };
}

export interface WallNodeRef {
  wallId: string;
  end: 'start' | 'end';
}

export interface SmartWallNode {
  key: string;
  xCm: number;
  yCm: number;
  refs: WallNodeRef[];
}

/**
 * Groups all wall endpoints into smart junction nodes (merging endpoints within 8cm).
 */
export function collectSmartWallNodes(walls: Wall[]): SmartWallNode[] {
  const nodes: SmartWallNode[] = [];

  const addEndpoint = (wallId: string, end: 'start' | 'end', x: number, y: number) => {
    const found = nodes.find((n) => Math.hypot(n.xCm - x, n.yCm - y) <= 8);
    if (found) {
      found.refs.push({ wallId, end });
    } else {
      nodes.push({
        key: `${wallId}:${end}`,
        xCm: x,
        yCm: y,
        refs: [{ wallId, end }],
      });
    }
  };

  for (const w of walls) {
    addEndpoint(w.id, 'start', w.x1Cm, w.y1Cm);
    addEndpoint(w.id, 'end', w.x2Cm, w.y2Cm);
  }
  return nodes;
}

/**
 * Snaps a dragged wall node to 10cm grid, orthogonal (0/90°) axis relative to its connected anchors,
 * or another stationary wall endpoint within 16cm.
 */
export function snapWallNodePosition(
  walls: Wall[],
  movingRefs: WallNodeRef[],
  rawX: number,
  rawY: number
): { x: number; y: number; snappedToNode: boolean } {
  const movingSet = new Set(movingRefs.map((r) => `${r.wallId}:${r.end}`));

  for (const w of walls) {
    if (!movingSet.has(`${w.id}:start`) && Math.hypot(rawX - w.x1Cm, rawY - w.y1Cm) <= 16) {
      return { x: w.x1Cm, y: w.y1Cm, snappedToNode: true };
    }
    if (!movingSet.has(`${w.id}:end`) && Math.hypot(rawX - w.x2Cm, rawY - w.y2Cm) <= 16) {
      return { x: w.x2Cm, y: w.y2Cm, snappedToNode: true };
    }
  }

  let sx = Math.round(rawX / 10) * 10;
  let sy = Math.round(rawY / 10) * 10;

  for (const r of movingRefs) {
    const w = walls.find((x) => x.id === r.wallId);
    if (!w) continue;
    const ax = r.end === 'start' ? w.x2Cm : w.x1Cm;
    const ay = r.end === 'start' ? w.y2Cm : w.y1Cm;
    if (Math.abs(sx - ax) <= 12) sx = ax;
    if (Math.abs(sy - ay) <= 12) sy = ay;
  }

  return { x: sx, y: sy, snappedToNode: false };
}

/**
 * Moves a Smart Wall Node and resizes/rotates every connected wall cleanly while preserving minimum 40cm length
 * and clamping any boxes, appliances, or openings safely within updated wall boundaries.
 */
export function moveSmartWallNode(
  walls: Wall[],
  movingRefs: WallNodeRef[],
  targetX: number,
  targetY: number
): boolean {
  // Verify no connected wall drops below 40cm
  for (const r of movingRefs) {
    const w = walls.find((x) => x.id === r.wallId);
    if (!w) continue;
    const ax = r.end === 'start' ? w.x2Cm : w.x1Cm;
    const ay = r.end === 'start' ? w.y2Cm : w.y1Cm;
    if (Math.hypot(targetX - ax, targetY - ay) < 40) {
      return false;
    }
  }

  for (const r of movingRefs) {
    const w = walls.find((x) => x.id === r.wallId);
    if (!w) continue;
    const oldLength = w.length;
    if (r.end === 'start') {
      w.x1Cm = Math.round(targetX);
      w.y1Cm = Math.round(targetY);
    } else {
      w.x2Cm = Math.round(targetX);
      w.y2Cm = Math.round(targetY);
    }

    const dx = w.x2Cm - w.x1Cm;
    const dy = w.y2Cm - w.y1Cm;
    w.length = Math.max(40, Math.round(Math.hypot(dx, dy)));
    w.angle = +(Math.atan2(dy, dx) * (180 / Math.PI)).toFixed(2);
    if (/\(\d+\)/.test(w.name)) {
      w.name = w.name.replace(/\(\d+\)/, `(${w.length})`);
    }

    // If the 'start' end moved, keep stationary boxes/appliances/openings anchored to the fixed 'end'!
    const deltaLen = w.length - oldLength;
    if (r.end === 'start' && deltaLen !== 0) {
      for (const b of w.boxes) {
        b.offsetX = Math.max(0, b.offsetX + deltaLen);
      }
      for (const a of w.appliances) {
        a.offsetX = Math.max(0, a.offsetX + deltaLen);
      }
      if (w.openings) {
        for (const op of w.openings) {
          op.offsetX = Math.max(0, op.offsetX + deltaLen);
        }
      }
    }

    // Clamp internals hierarchically so nothing protrudes past the resized wall
    const survivingBoxIds = new Set<string>();
    const boxDeltaMap = new Map<string, number>();

    w.boxes = w.boxes.filter((b) => b.offsetX < w.length - 25);
    for (const b of w.boxes) {
      survivingBoxIds.add(b.id);
      const beforeX = b.offsetX;
      if (b.offsetX + b.width > w.length) {
        b.width = Math.max(30, w.length - b.offsetX);
        if (b.offsetX + b.width > w.length) {
          b.offsetX = Math.max(0, w.length - b.width);
        }
        b.doors = b.doors.filter((d) => d.startCm < b.width - 20);
        for (const d of b.doors) {
          if (d.startCm + d.widthCm > b.width) {
            d.widthCm = Math.max(30, +(b.width - d.startCm).toFixed(1));
          }
        }
        b.unitDividers = b.unitDividers.filter((u) => u > 2 && u < b.width - 2);
        b.shelves = b.shelves
          .map((s) => ({ ...s, endCm: Math.min(b.width, s.endCm) }))
          .filter((s) => s.endCm - s.startCm >= 15);
      }
      if (b.offsetX !== beforeX) {
        boxDeltaMap.set(b.id, b.offsetX - beforeX);
      }
    }

    // Keep appliances strictly attached to their parent box (and within wall bounds)
    w.appliances = w.appliances.filter((a) => {
      if (a.boxId) {
        if (!survivingBoxIds.has(a.boxId)) return false;
        const parent = w.boxes.find((b) => b.id === a.boxId);
        if (!parent) return false;
        const shift = boxDeltaMap.get(parent.id) || 0;
        a.offsetX += shift;
        if (a.offsetX < parent.offsetX) a.offsetX = parent.offsetX;
        if (a.offsetX + a.width > parent.offsetX + parent.width) {
          a.offsetX = Math.max(parent.offsetX, parent.offsetX + parent.width - a.width);
        }
        return a.offsetX >= parent.offsetX - 1 && a.offsetX + a.width <= parent.offsetX + parent.width + 1;
      }
      if (a.offsetX >= w.length - 20) return false;
      if (a.offsetX + a.width > w.length) a.offsetX = Math.max(0, w.length - a.width);
      return a.offsetX + a.width <= w.length;
    });

    if (w.openings) {
      w.openings = w.openings.filter((op) => {
        if (op.offsetX >= w.length - 20) return false;
        if (op.offsetX + op.width > w.length) {
          op.width = Math.max(20, w.length - op.offsetX);
        }
        return op.width >= 20;
      });
    }
  }
  return true;
}

/**
 * Translates a whole wall by (deltaX, deltaY) in cm while keeping ALL connected wall
 * corner junctions attached so connected walls follow seamlessly without detaching.
 */
export function moveConnectedWall(
  walls: Wall[],
  wallId: string,
  deltaX: number,
  deltaY: number,
  moveEntireComponent = false
): boolean {
  const target = walls.find((w) => w.id === wallId);
  if (!target) return false;

  const dx = Math.round(deltaX);
  const dy = Math.round(deltaY);
  if (dx === 0 && dy === 0) return true;

  if (moveEntireComponent) {
    // Rigidly translate the whole connected wall graph
    const visited = new Set<string>([wallId]);
    const queue = [target];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const other of walls) {
        if (visited.has(other.id)) continue;
        const touches =
          Math.hypot(cur.x1Cm - other.x1Cm, cur.y1Cm - other.y1Cm) <= 15 ||
          Math.hypot(cur.x1Cm - other.x2Cm, cur.y1Cm - other.y2Cm) <= 15 ||
          Math.hypot(cur.x2Cm - other.x1Cm, cur.y2Cm - other.y1Cm) <= 15 ||
          Math.hypot(cur.x2Cm - other.x2Cm, cur.y2Cm - other.y2Cm) <= 15;
        if (touches) {
          visited.add(other.id);
          queue.push(other);
        }
      }
    }
    for (const w of walls) {
      if (!visited.has(w.id)) continue;
      w.x1Cm += dx;
      w.y1Cm += dy;
      w.x2Cm += dx;
      w.y2Cm += dy;
    }
    return true;
  }

  // Collect smart corner nodes for start and end of this wall
  const nodes = collectSmartWallNodes(walls);
  const startNode = nodes.find((n) =>
    n.refs.some((r) => r.wallId === wallId && r.end === 'start')
  );
  const endNode = nodes.find((n) =>
    n.refs.some((r) => r.wallId === wallId && r.end === 'end')
  );

  const startRefs = startNode ? startNode.refs : [{ wallId, end: 'start' as const }];
  const endRefs = endNode ? endNode.refs : [{ wallId, end: 'end' as const }];

  // Pre-validate that no connected neighbor wall collapses below 40cm
  const movedEndpointSet = new Set<string>();
  for (const r of [...startRefs, ...endRefs]) {
    movedEndpointSet.add(`${r.wallId}:${r.end}`);
  }
  for (const w of walls) {
    if (w.id === wallId) continue;
    const startMoved = movedEndpointSet.has(`${w.id}:start`);
    const endMoved = movedEndpointSet.has(`${w.id}:end`);
    if (!startMoved && !endMoved) continue;
    const nx1 = w.x1Cm + (startMoved ? dx : 0);
    const ny1 = w.y1Cm + (startMoved ? dy : 0);
    const nx2 = w.x2Cm + (endMoved ? dx : 0);
    const ny2 = w.y2Cm + (endMoved ? dy : 0);
    if (Math.hypot(nx2 - nx1, ny2 - ny1) < 40) {
      return false;
    }
  }

  // Apply rigid translation to target wall first (length/angle unchanged!)
  const newX1 = target.x1Cm + dx;
  const newY1 = target.y1Cm + dy;
  const newX2 = target.x2Cm + dx;
  const newY2 = target.y2Cm + dy;
  target.x1Cm = newX1;
  target.y1Cm = newY1;
  target.x2Cm = newX2;
  target.y2Cm = newY2;

  // Update all OTHER connected wall endpoints that share those corner junctions
  const otherStartRefs = startRefs.filter((r) => r.wallId !== wallId);
  const otherEndRefs = endRefs.filter((r) => r.wallId !== wallId);

  if (otherStartRefs.length) {
    moveSmartWallNode(walls, otherStartRefs, newX1, newY1);
  }
  if (otherEndRefs.length) {
    moveSmartWallNode(walls, otherEndRefs, newX2, newY2);
  }

  return true;
}
