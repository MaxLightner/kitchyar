import * as THREE from 'three';
import { FloorScanner } from './floorScanner';

/**
 * Port of MaxLightner/chidoset studio.js beginScan + frame scan block.
 * Source: e7b76d7ba644ac270a9b72f52d56711532086c03.
 * Only lifecycle ownership is adapted for React; sampling/order are Chido's.
 */
export class ChidoFloorTracking {
  hitSource: XRHitTestSource | null = null;
  extraHitSources: XRHitTestSource[] = [];
  private session: XRSession | null = null;
  private generation = 0;
  auxiliaryReady: Promise<void> = Promise.resolve();

  constructor(readonly scanner: FloorScanner) {}

  async start(session: XRSession) {
    this.dispose();
    this.session = session;
    const generation = this.generation;
    this.scanner.reset();
    const viewer = await session.requestReferenceSpace('viewer');
    const source = await session.requestHitTestSource!({space: viewer, entityTypes: ['plane']});
    if (this.session !== session || this.generation !== generation) {
      try { source?.cancel(); } catch {}
      return;
    }
    if (!source) throw new DOMException('Chido central plane hit test unavailable', 'NotSupportedError');
    this.hitSource = source;
    // Chido requests each auxiliary ray sequentially and stops on unsupported
    // rays. The central scan is already live while these optional requests run.
    this.auxiliaryReady = this.beginAuxiliary(session, generation);
  }

  private async beginAuxiliary(session: XRSession, generation: number) {
    if (typeof XRRigidTransform === 'undefined') return;
    const offsets = [[-.24,0],[.24,0],[0,-.24],[0,.24],[-.18,-.18],[.18,-.18],[-.18,.18],[.18,.18]];
    for (const [x,y] of offsets) {
      if (this.session !== session || this.generation !== generation) return;
      try {
        const direction = new THREE.Vector3(x,y,-1).normalize();
        const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1), direction);
        const transformed = await session.requestReferenceSpace('viewer');
        if (this.session !== session || this.generation !== generation) return;
        const raySpace = transformed.getOffsetReferenceSpace(new XRRigidTransform({}, {
          x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w,
        }));
        const hit = await session.requestHitTestSource!({space: raySpace, entityTypes:['plane']});
        if (this.session !== session || this.generation !== generation) {
          try { hit?.cancel(); } catch {}
          return;
        }
        if (!hit) break;
        this.extraHitSources.push(hit);
      } catch {
        break;
      }
    }
  }

  update(frame: XRFrame, space: XRReferenceSpace, pose: XRViewerPose, time: number) {
    if (!this.hitSource) return null;
    // Read the viewer pose exactly as Studio.frame does, not an eye transform.
    const viewer = new THREE.Vector3(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
    const centralResults = frame.getHitTestResults(this.hitSource);
    const additional: XRHitTestResult[] = [];
    for (const source of this.extraHitSources) {
      // A failed optional source must never discard the central floor hit.
      try { additional.push(...frame.getHitTestResults(source)); } catch {}
    }
    const forward = new THREE.Vector3(0,0,-1).applyQuaternion(new THREE.Quaternion(
      pose.transform.orientation.x, pose.transform.orientation.y,
      pose.transform.orientation.z, pose.transform.orientation.w
    ));
    return this.scanner.update(centralResults, additional, space, viewer, time, forward);
  }

  dispose() {
    this.session = null;
    this.generation++;
    try { this.hitSource?.cancel(); } catch {}
    for (const source of this.extraHitSources) {
      try { source.cancel(); } catch {}
    }
    this.hitSource = null;
    this.extraHitSources = [];
  }
}
