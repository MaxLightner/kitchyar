import { autoOrientWallsOnAdd, getWallVectors } from '../cad/cornerLogic';
import { createWall } from '../cad/doorRules';
import { Wall } from '../cad/types';

export interface XZPoint {
  x: number;
  z: number;
}

export interface CalibrationFitResult {
  b: XZPoint;
  yaw: number;
  x: number;
  z: number;
}

/**
 * Re-anchors the A/B reference without distorting the project's metric scale.
 * Three.js Y rotation maps local (x,z) to (x*cos + z*sin, -x*sin + z*cos).
 */
export function fitCalibrationDragB(
  a: XZPoint,
  b: XZPoint,
  anchorA: XZPoint,
  targetB: XZPoint,
  scale = 1
): CalibrationFitResult | null {
  const values = [a?.x, a?.z, b?.x, b?.z, anchorA?.x, anchorA?.z, targetB?.x, targetB?.z, scale];
  if (!values.every(Number.isFinite) || scale <= 0) return null;

  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const wx = targetB.x - anchorA.x;
  const wz = targetB.z - anchorA.z;
  const oldLength = Math.hypot(dx, dz);
  const physicalLength = Math.hypot(wx, wz);

  if (oldLength < 0.1 || physicalLength < Math.max(0.1, 0.1 * scale)) return null;

  const lengthFactor = physicalLength / (scale * oldLength);
  const yaw = Math.atan2(dz, dx) - Math.atan2(wz, wx);
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);

  return {
    b: { x: a.x + dx * lengthFactor, z: a.z + dz * lengthFactor },
    yaw,
    x: anchorA.x - scale * (a.x * cosine + a.z * sine),
    z: anchorA.z - scale * (-a.x * sine + a.z * cosine),
  };
}

export interface CalibrationScaledFitResult {
  scale: number;
  yaw: number;
  x: number;
  z: number;
}

/**
 * Anchors reference point A at `anchorA` in physical AR space and rotates + uniformly scales
 * the entire kitchen mount so reference point B lands on `targetB`.
 */
export function fitCalibrationDragABWithScale(
  a: XZPoint,
  b: XZPoint,
  anchorA: XZPoint,
  targetB: XZPoint
): CalibrationScaledFitResult | null {
  const values = [a?.x, a?.z, b?.x, b?.z, anchorA?.x, anchorA?.z, targetB?.x, targetB?.z];
  if (!values.every(Number.isFinite)) return null;

  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const wx = targetB.x - anchorA.x;
  const wz = targetB.z - anchorA.z;
  const modelLength = Math.hypot(dx, dz);
  const physicalLength = Math.hypot(wx, wz);

  if (modelLength < 0.08 || physicalLength < 0.1) return null;

  const scale = Math.max(0.25, Math.min(3.5, +(physicalLength / modelLength).toFixed(4)));
  const yaw = Math.atan2(dz, dx) - Math.atan2(wz, wx);
  const cosine = Math.cos(yaw);
  const sine = Math.sin(yaw);

  return {
    scale,
    yaw,
    x: anchorA.x - scale * (a.x * cosine + a.z * sine),
    z: anchorA.z - scale * (-a.x * sine + a.z * cosine),
  };
}

/**
 * Computes global uniform AR scale factor when user enters the real tape-measured distance
 * between calibration point A and calibration point B.
 */
export function computeScaleFromRealDistanceCm(
  a: XZPoint,
  b: XZPoint,
  realDistanceCm: number
): number | null {
  if (!Number.isFinite(realDistanceCm) || realDistanceCm < 20) return null;
  const modelDistM = Math.hypot(b.x - a.x, b.z - a.z);
  if (modelDistM < 0.1) return null;
  const realM = realDistanceCm / 100;
  return +(realM / modelDistM).toFixed(4);
}

/**
 * Transforms a floor point from aligned AR local space (meters) into CAD plan coordinates (cm),
 * snapping endpoints cleanly to existing wall corners (<=20cm) and 45°/90° orthogonal axes.
 */
export function snapArWallEndpointsCm(
  startM: XZPoint,
  endM: XZPoint,
  existingWalls: Wall[],
  snapAngleDeg = 45
): { x1Cm: number; y1Cm: number; x2Cm: number; y2Cm: number; lengthCm: number } {
  const rawX1 = Math.round((startM.x * 100) / 5) * 5;
  const rawY1 = Math.round((startM.z * 100) / 5) * 5;
  const snapEndpoint = (x: number, y: number) => {
    let bestX = x;
    let bestY = y;
    let bestD = 22;
    for (const w of existingWalls) {
      const d1 = Math.hypot(w.x1Cm - x, w.y1Cm - y);
      if (d1 < bestD) {
        bestD = d1;
        bestX = w.x1Cm;
        bestY = w.y1Cm;
      }
      const d2 = Math.hypot(w.x2Cm - x, w.y2Cm - y);
      if (d2 < bestD) {
        bestD = d2;
        bestX = w.x2Cm;
        bestY = w.y2Cm;
      }
    }
    return { x: bestX, y: bestY };
  };

  const p1 = snapEndpoint(rawX1, rawY1);
  let x2 = Math.round((endM.x * 100) / 5) * 5;
  let y2 = Math.round((endM.z * 100) / 5) * 5;

  const dx = x2 - p1.x;
  const dy = y2 - p1.y;
  const len = Math.hypot(dx, dy);
  if (len >= 40) {
    const rawDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    const nearest = Math.round(rawDeg / snapAngleDeg) * snapAngleDeg;
    if (Math.abs(rawDeg - nearest) <= 9) {
      const rad = (nearest * Math.PI) / 180;
      const snappedLen = Math.max(40, Math.round(len / 5) * 5);
      x2 = Math.round(p1.x + Math.cos(rad) * snappedLen);
      y2 = Math.round(p1.y + Math.sin(rad) * snappedLen);
    }
  }

  const p2 = snapEndpoint(x2, y2);
  const finalLen = Math.max(40, Math.round(Math.hypot(p2.x - p1.x, p2.y - p1.y)));
  return { x1Cm: p1.x, y1Cm: p1.y, x2Cm: p2.x, y2Cm: p2.y, lengthCm: finalLen };
}

/**
 * Adds a wall scanned on the AR floor using kichiyar2's exact inward-orientation CAD engine.
 */
export function buildArScannedWall(
  existingWalls: Wall[],
  startM: XZPoint,
  endM: XZPoint,
  wallHeightCm: number
): Wall {
  const snapped = snapArWallEndpointsCm(startM, endM, existingWalls);
  const rawWall = createWall(
    `دیوار ${existingWalls.length + 1} (${snapped.lengthCm})`,
    snapped.x1Cm,
    snapped.y1Cm,
    snapped.x2Cm,
    snapped.y2Cm,
    1,
    wallHeightCm
  );
  return autoOrientWallsOnAdd(existingWalls, rawWall);
}

/**
 * Projects a floor click/hit-test point (meters, aligned to CAD floor) onto the closest wall line
 * and returns its exact `offsetX` (cm) along the wall if within 65cm from the wall face.
 */
export function projectArPointOntoWalls(
  pointM: XZPoint,
  walls: Wall[]
): { wall: Wall; offsetCm: number; signedDistCm: number } | null {
  const px = pointM.x * 100;
  const py = pointM.z * 100;
  let best: { wall: Wall; offsetCm: number; signedDistCm: number; score: number } | null = null;

  for (const w of walls) {
    const v = getWallVectors(w);
    const relX = px - w.x1Cm;
    const relY = py - w.y1Cm;
    const along = relX * v.tx + relY * v.ty;
    const perp = relX * v.nx + relY * v.ny;
    if (along < -20 || along > w.length + 20) continue;
    const absPerp = Math.abs(perp);
    if (absPerp > 85) continue;
    const clampedAlong = Math.max(0, Math.min(w.length, Math.round(along / 5) * 5));
    if (!best || absPerp < best.score) {
      best = { wall: w, offsetCm: clampedAlong, signedDistCm: perp, score: absPerp };
    }
  }

  return best ? { wall: best.wall, offsetCm: best.offsetCm, signedDistCm: best.signedDistCm } : null;
}
