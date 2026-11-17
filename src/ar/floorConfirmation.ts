import { Vector3 } from 'three';

/** Short-lived confirmed evidence, independent of a single missed XR frame. */
export class FloorConfirmation {
  private snapshot: {point: Vector3; observations: Vector3[]; time: number} | null = null;
  observe(point: Vector3 | null, observations: Vector3[], ready: boolean, time: number) {
    if (ready && point) this.snapshot = {point:point.clone(), observations:observations.map(p=>p.clone()), time};
  }
  current(time: number) {
    const value=this.snapshot;
    return value && time-value.time <= 1200 ? value : null;
  }
  reset() {this.snapshot=null;}
}
