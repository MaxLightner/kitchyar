import * as THREE from 'three';
export const SCAN_RADIUS_METERS: number;
export const MAX_FLOOR_TILT_DEGREES: number;
export const FLOOR_HEIGHT_TOLERANCE: number;
export interface FloorCandidate {
  matrix: THREE.Matrix4;
  point: THREE.Vector3;
  result: XRHitTestResult;
  level: boolean;
  normal: THREE.Vector3;
  accepted?: boolean;
}
export function floorCandidates(results: XRHitTestResult[], space: XRReferenceSpace,
  viewerPosition?: THREE.Vector3 | null, includeSloped?: boolean): FloorCandidate[];
export function horizontalHit(results: XRHitTestResult[], space: XRReferenceSpace): THREE.Matrix4 | null;
export class FloorScanner {
  point: THREE.Vector3 | null;
  candidate: FloorCandidate | null;
  ready: boolean;
  height: number | null;
  observations: THREE.Vector3[];
  history: Array<{point: THREE.Vector3; seen: number}>;
  currentHits: FloorCandidate[];
  rawHits: number;
  validHits: number;
  inlierHits: number;
  reset(): void;
  update(centerResults: XRHitTestResult[], additionalResults: XRHitTestResult[],
    space: XRReferenceSpace, viewer: THREE.Vector3, time: number,
    forward?: THREE.Vector3 | null): THREE.Vector3 | null;
}
