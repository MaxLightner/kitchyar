import * as THREE from 'three';

export const SCAN_RADIUS_METERS = 2;
export const MAX_FLOOR_TILT_DEGREES = 5;
export const FLOOR_HEIGHT_TOLERANCE = 0.03;
const MIN_SEPARATION = 0.14;
const MAX_HISTORY_AGE = 2400;
const cosLimit = Math.cos(THREE.MathUtils.degToRad(MAX_FLOOR_TILT_DEGREES));

const horizontalDistance = (a: THREE.Vector3, b: THREE.Vector3) =>
  Math.hypot(a.x - b.x, a.z - b.z);

const median = (values: number[]) => {
  const a = [...values].sort((x, y) => x - y);
  const n = a.length;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
};

export interface FloorCandidate {
  matrix: THREE.Matrix4;
  point: THREE.Vector3;
  result: XRHitTestResult;
  level: boolean;
  normal: THREE.Vector3;
  accepted?: boolean;
}

export function floorCandidates(
  results: XRHitTestResult[],
  space: XRReferenceSpace,
  viewerPosition: THREE.Vector3 | null = null,
  includeSloped = false
): FloorCandidate[] {
  const found: FloorCandidate[] = [];
  for (const result of results) {
    const pose = result.getPose(space);
    if (!pose) continue;
    const values = pose.transform.matrix;
    if (!values || values.length !== 16 || !Array.from(values).every(Number.isFinite)) {
      continue;
    }
    const matrix = new THREE.Matrix4().fromArray(values);
    const normal = new THREE.Vector3(0, 1, 0).transformDirection(matrix);
    const point = new THREE.Vector3().setFromMatrixPosition(matrix);
    const level = Math.abs(normal.y) >= cosLimit;
    if (!level && !includeSloped) continue;
    if (viewerPosition && point.y >= viewerPosition.y) continue;
    found.push({ matrix, point, result, level, normal });
  }
  return found.sort((a, b) => a.point.y - b.point.y);
}

function uniqueInHeight<T extends { point: THREE.Vector3 }>(items: T[], target: number): T[] {
  const members: T[] = [];
  for (const item of items) {
    if (Math.abs(item.point.y - target) > FLOOR_HEIGHT_TOLERANCE) continue;
    if (members.every((other) => horizontalDistance(other.point, item.point) > MIN_SEPARATION)) {
      members.push(item);
    }
  }
  return members;
}

export class FloorScanner {
  point: THREE.Vector3 | null = null;
  candidate: FloorCandidate | null = null;
  ready = false;
  height: number | null = null;
  observations: THREE.Vector3[] = [];
  history: Array<{ point: THREE.Vector3; seen: number }> = [];
  currentHits: FloorCandidate[] = [];
  rawHits = 0;
  validHits = 0;
  inlierHits = 0;

  reset() {
    this.point = null;
    this.candidate = null;
    this.ready = false;
    this.height = null;
    this.observations = [];
    this.history = [];
    this.currentHits = [];
    this.rawHits = 0;
    this.validHits = 0;
    this.inlierHits = 0;
  }

  update(
    centerResults: XRHitTestResult[],
    additionalResults: XRHitTestResult[],
    space: XRReferenceSpace,
    viewer: THREE.Vector3,
    time: number,
    forward: THREE.Vector3 | null = null
  ): THREE.Vector3 | null {
    const rawCenter = floorCandidates(centerResults, space, viewer, true);
    const center = rawCenter[0]?.point || null;
    const all = [...centerResults, ...additionalResults];
    this.rawHits = all.length;
    const allHits = floorCandidates(all, space, viewer, true);
    this.currentHits = [];
    this.inlierHits = 0;
    this.validHits = 0;
    this.ready = false;

    if (!center) {
      this.point = null;
      this.history = [];
      return null;
    }

    const withinRadius = allHits.filter(
      (item) => horizontalDistance(center, item.point) <= SCAN_RADIUS_METERS
    );
    const valid = withinRadius.filter((item) => item.level);
    this.currentHits = withinRadius;
    this.validHits = valid.length;
    this.history = this.history.filter(
      (item) =>
        time - item.seen <= MAX_HISTORY_AGE &&
        horizontalDistance(center, item.point) <= SCAN_RADIUS_METERS
    );

    for (const hit of valid) {
      const prev = this.history.find(
        (item) =>
          horizontalDistance(item.point, hit.point) < MIN_SEPARATION &&
          Math.abs(item.point.y - hit.point.y) <= FLOOR_HEIGHT_TOLERANCE
      );
      if (prev) {
        prev.seen = time;
        prev.point.copy(hit.point);
      } else {
        this.history.push({ point: hit.point.clone(), seen: time });
      }
    }
    if (this.history.length > 90) this.history.splice(0, this.history.length - 90);

    const combined = [
      ...valid.map((v) => ({ point: v.point })),
      ...this.history.map((h) => ({ point: h.point })),
    ];

    let best: { group: Array<{ point: THREE.Vector3 }>; height: number } | null = null;
    let bestScore = -Infinity;

    for (const seed of valid) {
      const group = uniqueInHeight(combined, seed.point.y);
      if (!group.length) continue;
      const groupHeight = median(group.map((item) => item.point.y));
      const distinctCurrent = uniqueInHeight(valid, groupHeight);
      const proximity =
        this.height === null ? 0 : Math.max(0, 1 - Math.abs(groupHeight - this.height) / 0.1);
      const score = group.length + distinctCurrent.length * 0.5 + proximity * 0.35;
      if (score > bestScore) {
        bestScore = score;
        best = { group, height: groupHeight };
      }
    }

    if (!best) {
      this.point = null;
      this.candidate = null;
      return null;
    }

    this.height = best.height;
    const matching = valid.filter(
      (item) => Math.abs(item.point.y - best!.height) <= FLOOR_HEIGHT_TOLERANCE
    );
    this.inlierHits = matching.length;
    this.currentHits = withinRadius.map((item) => ({
      ...item,
      accepted:
        item.level && Math.abs(item.point.y - best!.height) <= FLOOR_HEIGHT_TOLERANCE,
    }));
    this.observations = best.group
      .map((item) => new THREE.Vector3(item.point.x, best!.height, item.point.z))
      .slice(0, 15);

    const origin = center.clone();
    if (forward && Math.abs(forward.y) > 0.02) {
      const t = (best.height - viewer.y) / forward.y;
      if (t > 0 && Number.isFinite(t)) {
        const projected = viewer.clone().addScaledVector(forward, t);
        if (horizontalDistance(projected, center) <= SCAN_RADIUS_METERS) {
          origin.copy(projected);
        }
      }
    }

    origin.y = best.height;
    this.point = origin;
    this.candidate = matching[0] || null;
    this.ready = best.group.length >= 3;
    return this.point.clone();
  }
}

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
