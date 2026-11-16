export { SCAN_RADIUS_METERS, MAX_FLOOR_TILT_DEGREES, FLOOR_HEIGHT_TOLERANCE, floorCandidates, FloorScanner } from './chido/surfaces.js';
export type { FloorCandidate } from './chido/surfaces.js';

export interface FloorAnchorPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface AnchorSample {
  id: string;
  reference: { x: number; y: number; z: number };
  observed: { x: number; y: number; z: number };
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

const transformAnchorPoint = (
  p: { x: number; y: number; z: number },
  pose: FloorAnchorPose
) => {
  const c = Math.cos(pose.yaw);
  const s = Math.sin(pose.yaw);
  return {
    x: pose.x + p.x * c - p.z * s,
    y: pose.y + p.y,
    z: pose.z + p.x * s + p.z * c,
  };
};

const inverseAnchorPoint = (
  p: { x: number; y: number; z: number },
  pose: FloorAnchorPose
) => {
  const dx = p.x - pose.x;
  const dy = p.y - pose.y;
  const dz = p.z - pose.z;
  const c = Math.cos(pose.yaw);
  const s = Math.sin(pose.yaw);
  return {
    x: dx * c + dz * s,
    y: dy,
    z: -dx * s + dz * c,
  };
};

function fitFloorPose(samples: AnchorSample[]): FloorAnchorPose | null {
  if (samples.length < 2) return null;
  let rx = 0;
  let ry = 0;
  let rz = 0;
  let ox = 0;
  let oy = 0;
  let oz = 0;
  for (const s of samples) {
    rx += s.reference.x;
    ry += s.reference.y;
    rz += s.reference.z;
    ox += s.observed.x;
    oy += s.observed.y;
    oz += s.observed.z;
  }
  const n = samples.length;
  rx /= n;
  ry /= n;
  rz /= n;
  ox /= n;
  oy /= n;
  oz /= n;

  let cs = 0;
  let sn = 0;
  for (const s of samples) {
    const drx = s.reference.x - rx;
    const drz = s.reference.z - rz;
    const dox = s.observed.x - ox;
    const doz = s.observed.z - oz;
    cs += drx * dox + drz * doz;
    sn += drx * doz - drz * dox;
  }
  const yaw = Math.atan2(sn, cs);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return {
    x: ox - (rx * c - rz * s),
    y: oy - ry,
    z: oz - (rx * s + rz * c),
    yaw,
  };
}

export class AnchorStabilizer {
  pose: FloorAnchorPose = { x: 0, y: 0, z: 0, yaw: 0 };
  inliers: string[] = [];
  outliers: string[] = [];
  status: 'waiting' | 'insufficient' | 'verifying' | 'stable' | 'filtered' = 'waiting';
  private pending: string | null = null;
  private pendingFrames = 0;

  toReference(point: { x: number; y: number; z: number }) {
    return inverseAnchorPoint(point, this.pose);
  }

  update(samples: AnchorSample[], dt = 0.016) {
    if (samples.length < 3) {
      this.status = 'insufficient';
      return { pose: { ...this.pose }, status: this.status };
    }
    const requested = fitFloorPose(samples);
    if (!requested) {
      this.status = 'insufficient';
      return { pose: { ...this.pose }, status: this.status };
    }

    const offset = Math.hypot(
      requested.x - this.pose.x,
      requested.y - this.pose.y,
      requested.z - this.pose.z
    );
    const yawDiff = wrapAngle(requested.yaw - this.pose.yaw);
    const sudden = offset > 0.15 || Math.abs(yawDiff) > 0.1;

    if (sudden) {
      const key = samples
        .map((s) => s.id)
        .sort()
        .join(',');
      if (this.pending === key) this.pendingFrames++;
      else {
        this.pending = key;
        this.pendingFrames = 1;
      }
      if (this.pendingFrames < 6) {
        this.status = 'verifying';
        return { pose: { ...this.pose }, status: this.status };
      }
    } else {
      this.pending = null;
      this.pendingFrames = 0;
    }

    const seconds = Math.max(0.001, Math.min(dt, 0.1));
    const alpha = 1 - Math.exp(-seconds / 0.26);
    const limit = Math.min(1, (0.32 * seconds) / Math.max(offset, 1e-9));
    const amount = Math.min(alpha, limit);

    this.pose.x += (requested.x - this.pose.x) * amount;
    this.pose.y += (requested.y - this.pose.y) * amount;
    this.pose.z += (requested.z - this.pose.z) * amount;
    this.pose.yaw = wrapAngle(
      this.pose.yaw + Math.sign(yawDiff) * Math.min(Math.abs(yawDiff) * alpha, 0.35 * seconds)
    );

    const errIds = samples.filter((s) => {
      const tp = transformAnchorPoint(s.reference, this.pose);
      return Math.hypot(tp.x - s.observed.x, tp.z - s.observed.z) > 0.09;
    });
    this.outliers = errIds.map((s) => s.id);
    this.inliers = samples.filter((s) => !this.outliers.includes(s.id)).map((s) => s.id);
    this.status = this.outliers.length ? 'filtered' : 'stable';
    return { pose: { ...this.pose }, status: this.status };
  }
}
