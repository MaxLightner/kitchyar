// Direct TypeScript port of chidoset/anchor-rig.js (2026-11-16).
// Stabilize one horizontal floor from independent WebXR anchor poses.
export type ChidoVec3 = [number, number, number];
export interface AnchorSample {
  id: string;
  reference: ChidoVec3;
  observed: ChidoVec3;
}
export interface FloorAnchorPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}
export const wrapAngle = (value: number) => Math.atan2(Math.sin(value), Math.cos(value));
const median = (values: number[]) => {
  const v = [...values].sort((a, b) => a - b);
  return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
};
const finite = (p: number[]): p is ChidoVec3 =>
  Array.isArray(p) && p.length === 3 && p.every(Number.isFinite);
function fit(points: AnchorSample[]): FloorAnchorPose {
  const n = points.length;
  const a: ChidoVec3 = [0, 0, 0], b: ChidoVec3 = [0, 0, 0];
  for (const p of points) for (let k = 0; k < 3; k++) {
    a[k] += p.reference[k] / n;
    b[k] += p.observed[k] / n;
  }
  let dot = 0, cross = 0;
  for (const p of points) {
    const ux = p.reference[0] - a[0], uz = p.reference[2] - a[2];
    const vx = p.observed[0] - b[0], vz = p.observed[2] - b[2];
    dot += ux * vx + uz * vz;
    cross += uz * vx - ux * vz;
  }
  const yaw = Math.atan2(cross, dot), c = Math.cos(yaw), s = Math.sin(yaw);
  return {x: b[0] - c * a[0] - s * a[2],
    y: median(points.map(p => p.observed[1] - p.reference[1])),
    z: b[2] + s * a[0] - c * a[2], yaw};
}
export function transformPoint(point: ChidoVec3, pose: FloorAnchorPose): ChidoVec3 {
  const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
  return [c * point[0] + s * point[2] + pose.x, point[1] + pose.y,
    -s * point[0] + c * point[2] + pose.z];
}
export function inversePoint(point: ChidoVec3, pose: FloorAnchorPose): ChidoVec3 {
  const c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
  const x = point[0] - pose.x, z = point[2] - pose.z;
  return [c * x - s * z, point[1] - pose.y, s * x + c * z];
}
const distance = (p: ChidoVec3, q: ChidoVec3) =>
  Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const spread = (points: AnchorSample[]): boolean => {
  if (points.length < 3) return false;
  const [a, b, c] = points.map(p => p.reference);
  const area = Math.abs((b[0] - a[0]) * (c[2] - a[2]) -
    (b[2] - a[2]) * (c[0] - a[0]));
  return area >= 0.09;
};
export function estimateFloorPose(samples: AnchorSample[], threshold = 0.09, preferred: string[] = []) {
  const points = samples.filter(p => finite(p.reference) && finite(p.observed));
  if (points.length < 3) return null;
  let best: {pose: FloorAnchorPose; inliers: string[]; outliers: string[]; error: number} | null = null;
  for (let i = 0; i < points.length - 2; i++)
    for (let j = i + 1; j < points.length - 1; j++)
      for (let k = j + 1; k < points.length; k++) {
        const trio = [points[i], points[j], points[k]];
        if (!spread(trio)) continue;
        const proposed = fit(trio);
        const inliers = points.filter(p => distance(transformPoint(p.reference, proposed), p.observed) <= threshold);
        if (inliers.length < 3 || !inliers.some(p => p.id === trio[0].id)) continue;
        const refined = fit(inliers);
        const finalInliers = points.filter(p => distance(transformPoint(p.reference, refined), p.observed) <= threshold);
        if (finalInliers.length < 3) continue;
        const corrected = fit(finalInliers);
        const error = finalInliers.reduce((total, p) =>
          total + Math.pow(distance(transformPoint(p.reference, corrected), p.observed), 2), 0) / finalInliers.length;
        const continuity = finalInliers.filter(p => preferred.includes(p.id)).length;
        const candidate = {pose: corrected, inliers: finalInliers.map(p => p.id),
          outliers: points.filter(p => !finalInliers.includes(p)).map(p => p.id), error};
        if (!best || candidate.inliers.length > best.inliers.length ||
            (candidate.inliers.length === best.inliers.length &&
             error - 0.00002 * continuity <
             best.error - 0.00002 * best.inliers.filter(id => preferred.includes(id)).length)) best = candidate;
      }
  return best;
}
export class AnchorStabilizer {
  pose: FloorAnchorPose = {x: 0, y: 0, z: 0, yaw: 0};
  inliers: string[] = [];
  outliers: string[] = [];
  status: 'waiting' | 'insufficient' | 'verifying' | 'filtered' | 'stable' = 'waiting';
  private pending: string | null = null;
  private pendingFrames = 0;
  toReference(point: ChidoVec3): ChidoVec3 { return inversePoint(point, this.pose); }
  update(samples: AnchorSample[], dt = 0.016) {
    const result = estimateFloorPose(samples, 0.09, this.inliers);
    if (!result) { this.status = 'insufficient'; return this.snapshot(); }
    const requested = result.pose;
    const offset = Math.hypot(requested.x - this.pose.x, requested.y - this.pose.y,
      requested.z - this.pose.z);
    const yawDiff = wrapAngle(requested.yaw - this.pose.yaw);
    const sudden = offset > 0.15 || Math.abs(yawDiff) > 0.10;
    if (sudden) {
      const key = result.inliers.slice().sort().join(',');
      if (this.pending === key) this.pendingFrames++;
      else {this.pending = key; this.pendingFrames = 1;}
      if (this.pendingFrames < 6) {this.status = 'verifying'; return this.snapshot();}
    } else {this.pending = null; this.pendingFrames = 0;}
    const seconds = Math.max(0.001, Math.min(dt, 0.1));
    const alpha = 1 - Math.exp(-seconds / 0.26);
    const limit = Math.min(1, 0.32 * seconds / Math.max(offset, 1e-9));
    const amount = Math.min(alpha, limit);
    this.pose.x += (requested.x - this.pose.x) * amount;
    this.pose.y += (requested.y - this.pose.y) * amount;
    this.pose.z += (requested.z - this.pose.z) * amount;
    this.pose.yaw = wrapAngle(this.pose.yaw +
      Math.sign(yawDiff) * Math.min(Math.abs(yawDiff) * alpha, 0.35 * seconds));
    this.inliers = result.inliers;
    this.outliers = result.outliers;
    this.status = result.outliers.length ? 'filtered' : 'stable';
    return this.snapshot();
  }
  snapshot() {return {pose: {...this.pose}, inliers: [...this.inliers],
    outliers: [...this.outliers], status: this.status};}
}
