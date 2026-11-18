import * as THREE from 'three';

export function aimCenter(rect: { left: number; top: number; width: number; height: number }) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/** Place two floor pins around the current view, without moving the kitchen. */
export function calibrationPinsAtView(camera: THREE.Camera, floor: THREE.Object3D) {
  camera.updateWorldMatrix(true, false);
  floor.updateWorldMatrix(true, false);
  const origin = camera.getWorldPosition(new THREE.Vector3());
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const floorY = floor.getWorldPosition(new THREE.Vector3()).y;
  const hit = new THREE.Ray(origin, direction).intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorY), new THREE.Vector3());
  const forward = new THREE.Vector3(direction.x, 0, direction.z).normalize();
  if (forward.lengthSq() < .01) forward.set(0, 0, -1);
  const center = hit && origin.distanceTo(hit) < 5 ? hit : origin.clone().addScaledVector(forward, 1.2).setY(floorY);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
  const a = floor.worldToLocal(center.clone().addScaledVector(right, -.3));
  const b = floor.worldToLocal(center.clone().addScaledVector(right, .3));
  return { a, b };
}

/** Touching an item still drags that item; only a short placement tap confirms aim. */
export class AimTap {
  private gesture: { id: number; x: number; y: number; cancelled: boolean } | null = null;
  begin(id: number, x: number, y: number) {
    if (this.gesture) { this.cancel(); return; }
    this.gesture = { id, x, y, cancelled: false };
  }
  move(id: number, x: number, y: number) {
    if (this.gesture?.id === id && Math.hypot(x - this.gesture.x, y - this.gesture.y) > 8) this.cancel();
  }
  cancel() { if (this.gesture) this.gesture.cancelled = true; }
  reset(id: number) { if (this.gesture?.id === id) this.gesture = null; }
  end(id: number) {
    if (this.gesture?.id !== id) return false;
    const confirm = !this.gesture.cancelled; this.gesture = null; return confirm;
  }
}
