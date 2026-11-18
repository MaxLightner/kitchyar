import * as THREE from 'three';

/** A world-space placement target; option gestures never change its position. */
export class SurfaceCursor {
  point: THREE.Vector3 | null = null;
  normal = new THREE.Vector3(0,1,0);
  private gesture: {id:number; x:number; y:number; moved:boolean; cancelled:boolean; hadTarget:boolean} | null = null;
  pin(point: THREE.Vector3, normal = new THREE.Vector3(0,1,0)) {
    this.point=point.clone();
    this.normal.copy(normal).normalize();
  }
  clearTarget() { this.point = null; }
  clear() {this.clearTarget();this.gesture=null;}
  begin(id:number,x:number,y:number): boolean {
    if(this.gesture) {this.gesture.cancelled=true;return false;}
    this.gesture={id,x,y,moved:false,cancelled:false,hadTarget:!!this.point};
    return true;
  }
  moving(id:number,x:number,y:number) {
    const g=this.gesture;
    if(!g||g.id!==id||g.cancelled)return false;
    if(Math.hypot(x-g.x,y-g.y)>8)g.moved=true;
    return g.moved;
  }
  end(id:number) {
    const g=this.gesture;
    if(!g||g.id!==id)return false;
    this.gesture=null;
    return g.hadTarget && !!this.point && !g.moved && !g.cancelled;
  }
  cancelGesture() {if(this.gesture)this.gesture.cancelled=true;}
  resetGesture(id: number) { if (this.gesture?.id === id) this.gesture = null; }
  get dragging() {return !!this.gesture;}
  screen(camera:THREE.Camera, element:HTMLElement) {
    if(!this.point)return null;
    const p=this.point.clone().project(camera);
    if(p.z < -1 || p.z > 1)return null;
    const r=element.getBoundingClientRect();
    return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};
  }
}
export function createSurfaceCursorMarker() {
  const marker=new THREE.Group();
  marker.name='placement-surface-cursor';
  const material=new THREE.MeshBasicMaterial({color:0x13b9a0,depthTest:false,transparent:true,opacity:.95,side:THREE.DoubleSide});
  const ring=new THREE.Mesh(new THREE.RingGeometry(.065,.085,40),material);
  ring.rotation.x=-Math.PI/2;
  const dot=new THREE.Mesh(new THREE.SphereGeometry(.018,12,8),material);
  dot.position.y=.014;
  marker.add(ring,dot);
  marker.renderOrder=1000;
  marker.visible=false;
  return marker;
}
export function updateSurfaceCursorMarker(marker:THREE.Group,cursor:SurfaceCursor) {
  marker.visible=!!cursor.point;
  if(!cursor.point)return;
  marker.position.copy(cursor.point).addScaledVector(cursor.normal,.008);
  marker.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),cursor.normal);
}
