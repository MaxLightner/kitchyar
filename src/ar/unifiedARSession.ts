import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FloorScanner } from './floorScanner';
import { FloorConfirmation } from './floorConfirmation';
import { ChidoFloorTracking } from './chidoFloorTracking';
import { AnchorStabilizer, type AnchorSample, type ChidoVec3, transformPoint } from './chidoAnchorRig';
import { CHIDO_REFERENCE_SPACE, requestChidoSession, xrLaunchError } from './chidoSession';
import { calibrationPinsAtView } from './centerAim';
import { fitCalibrationDragABWithScale, type XZPoint } from './arCalibration';
import { wideViewVerticalFov, type WideViewMode } from './wideView';
import {createFloorNetMesh,createCrossMarker} from './scanVisuals';
import {NearRealOcclusion} from './nearOcclusion';

export interface ARSessionState {
  starting: boolean;
  active: boolean;
  floorLocked: boolean;
  ready: boolean;
  tracking: boolean;
  rawHits: number;
  validHits: number;
  error: string | null;
  calibrating: boolean;
  selectedPin: 'a' | 'b' | null;
  distanceCm: number;
  detectedFloorDistanceM: number | null;
  kitchenHidden: boolean;
  occlusionEnabled: boolean;
}

export const initialARState = (): ARSessionState => ({ starting: false, active: false,
  floorLocked: false, ready: false, tracking: false, rawHits: 0, validHits: 0,
  error: null, calibrating: false, selectedPin: null, distanceCm: 60, detectedFloorDistanceM:null, kitchenHidden:false,occlusionEnabled:true });

/** AR owns tracking only. The editor keeps its scene, renderer, picking and history.
 * Transforming the camera rig, rather than CAD objects, preserves every existing
 * world-space editing calculation and keeps session coordinates out of the project.
 */
export class UnifiedARSession {
  state = initialARState();
  readonly scanner = new FloorScanner();
  private confirmation = new FloorConfirmation();
  private tracking = new ChidoFloorTracking(this.scanner);
  private session: XRSession | null = null;
  private generation = 0;
  private disposed = false;
  private lastPoseTime = 0;
  private lastReport = 0;
  private startTime = 0;
  private rig = new THREE.Group();
  private origin = new THREE.Object3D();
  private baseOrigin: { x: number; y: number; z: number; yaw: number } | null = null;
  private alignment = new THREE.Object3D();
  private modelToXR = new THREE.Matrix4();
  private a = new THREE.Vector3(-.3, 0, 0);
  private b = new THREE.Vector3(.3, 0, 0);
  private pins = new THREE.Group();
  private pinA = this.makePin(0x4f46e5, 'A');
  private pinB = this.makePin(0x059669, 'B');
  private line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({color:0x10b981, depthTest:false}));
  private scanMarker = new THREE.Mesh(new THREE.RingGeometry(.08,.13,32),
    new THREE.MeshBasicMaterial({ color:0x10b981, side:THREE.DoubleSide, depthTest:false }));
  private floorNet=createFloorNetMesh();
  private crosses=Array.from({length:20},()=>createCrossMarker());
  private revealStart:number|null=null;
  private occlusion:NearRealOcclusion;
  private currentFrame:{frame:XRFrame;pose:XRViewerPose}|null=null;
  private anchors: { anchor: XRAnchor; reference: ChidoVec3 | null; requested: THREE.Vector3 }[] = [];
  private candidates: THREE.Vector3[] = [];
  private anchorPending = false;
  private anchorGeneration = 0;
  private stabilizer = new AnchorStabilizer();
  private lastAnchorTime = 0;
  private drag: { id:number; pin:'a'|'b'; anchorA:THREE.Vector3 } | null = null;
  private saved: { position:THREE.Vector3; quaternion:THREE.Quaternion; target:THREE.Vector3; near:number; fov:number; background:THREE.Scene['background'] } | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera, private controls: OrbitControls,
    private events: { change:(s:ARSessionState)=>void; ended:()=>void; confirmed:()=>void;
      frame:(time:number)=>void; render:()=>void; toast:(text:string)=>void;
      calibration:(a:XZPoint,b:XZPoint,realDistanceCm:number)=>void }) {
    this.rig.matrixAutoUpdate=false;
    this.scanMarker.rotation.x = -Math.PI/2;
    this.scanMarker.visible = false;
    this.scanMarker.renderOrder = 100;
    this.pins.add(this.pinA,this.pinB,this.line);
    this.pins.visible=false;
    scene.add(this.scanMarker,this.pins,this.floorNet.mesh,...this.crosses);
    this.occlusion=new NearRealOcclusion(scene);
  }

  get active() { return this.state.active; }
  get locked() { return this.state.floorLocked; }
  get editingBlocked() { return this.state.starting || (this.active && (!this.locked || this.state.calibrating)); }

  private publish(patch: Partial<ARSessionState>) {
    if(this.disposed)return;
    const next={...this.state,...patch};
    if(Object.keys(next).some(key=>next[key as keyof ARSessionState]!==this.state[key as keyof ARSessionState])) {
      this.state=next;this.events.change({...next});
    }
  }

  private makePin(color:number,label:string) {
    const group=new THREE.Group();
    const material=new THREE.MeshBasicMaterial({color,depthTest:false});
    const ring=new THREE.Mesh(new THREE.CylinderGeometry(.045,.045,.08,20),material);
    ring.position.y=.04;ring.renderOrder=101;group.add(ring);
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#ffffff';ctx.font='bold 48px sans-serif';
    ctx.textAlign='center';ctx.fillText(label,32,50);
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),depthTest:false}));
    sprite.scale.set(.16,.16,1);sprite.position.y=.17;sprite.renderOrder=102;group.add(sprite);
    return group;
  }

  async start(pending?:Promise<XRSession>|null) {
    if(this.disposed||this.state.starting||this.active)return;
    const generation=++this.generation;
    this.publish({starting:true,error:null});
    let requested:Promise<XRSession>|undefined;
    let stage='راه‌اندازی دوربین';
    try {
      const xr=navigator.xr;
      if(!xr&&!pending)throw new DOMException('WebXR در این مرورگر در دسترس نیست','NotSupportedError');
      requested=pending??requestChidoSession(xr!,document.body);
      const session=await this.timeout(requested,30000);
      if(this.disposed||generation!==this.generation){void session.end().catch(()=>{});return;}
      this.session=session;
      this.saved={position:this.camera.position.clone(),quaternion:this.camera.quaternion.clone(),
        target:this.controls.target.clone(),near:this.camera.near,fov:this.camera.fov,background:this.scene.background};
      this.rig.add(this.camera);
      this.rig.matrixAutoUpdate=false;
      this.camera.near=.04;
      this.controls.enabled=false;
      this.renderer.xr.enabled=true;
      this.renderer.xr.cameraAutoUpdate=false;
      // The immersive framebuffer is separate from the DOM canvas. Hide its
      // previous desktop image while keeping the shared touch surface active.
      this.renderer.domElement.style.opacity='0';
      this.renderer.xr.setReferenceSpaceType(CHIDO_REFERENCE_SPACE);
      session.addEventListener('end',()=>this.onEnd(session),{once:true});
      stage='اتصال WebXR';
      await this.timeout(this.renderer.xr.setSession(session),15000);
      if(this.disposed||generation!==this.generation||this.session!==session)return;
      this.confirmation.reset();this.scanner.reset();
      this.startTime=performance.now();this.lastPoseTime=0;
      this.publish({active:true,starting:false,floorLocked:false,ready:false,tracking:false});
      this.renderer.setAnimationLoop((time,frame)=>{
        if(!frame||this.session!==session||this.disposed)return;
        try { this.update(time,frame); }
        catch(error){this.publish({error:xrLaunchError(error,'ردیابی کف')});}
      });
      this.watchdog=setInterval(()=>{
        if(this.active&&performance.now()-(this.lastPoseTime||this.startTime)>10000)
          this.publish({tracking:false,ready:false,error:'ردیابی دوربین متوقف شده؛ دستگاه را آرام به سمت کف حرکت دهید یا دوباره تلاش کنید.'});
      },1500);
      stage='تشخیص کف';
      await this.timeout(this.tracking.start(session),15000);
      if(this.session!==session)return;
      if(!session.domOverlayState)throw new DOMException('DOM Overlay در دسترس نیست','NotSupportedError');
    } catch(error) {
      if(generation!==this.generation||this.disposed)return;
      const message=xrLaunchError(error,stage);
      if(this.session){const session=this.session;this.session=null;void session.end().catch(()=>{});this.restore();}
      else if(requested)void requested.then(s=>s.end()).catch(()=>{});
      this.publish({starting:false,active:false,error:message,ready:false});this.events.toast(message);
    }
  }

  private async timeout<T>(promise:Promise<T>,ms:number) {
    let timer:ReturnType<typeof setTimeout>;
    try{return await Promise.race([promise,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('زمان انتظار به پایان رسید')),ms);})]);}
    finally{clearTimeout(timer!);}
  }

  private update(time:number,frame:XRFrame) {
    const space=this.renderer.xr.getReferenceSpace();
    if(!space)return;
    const pose=frame.getViewerPose(space);
    if(!pose){this.publish({tracking:false,ready:false});return;}
    this.lastPoseTime=performance.now();
    this.currentFrame={frame,pose};
    if(this.locked)this.updateAnchors(frame,space,time);
    else {
      const pt=this.tracking.update(frame,space,pose,time);
      this.confirmation.observe(pt,this.scanner.observations,this.scanner.ready,performance.now());
      this.scanMarker.visible=Boolean(pt);
      if(pt)this.scanMarker.position.copy(pt).applyMatrix4(this.modelToXR.clone().invert()).add(new THREE.Vector3(0,.012,0));
      this.floorNet.mesh.visible=Boolean(pt);
      if(pt){this.floorNet.mesh.position.copy(this.scanMarker.position);this.floorNet.uniforms.uReveal.value=.65;
        this.floorNet.uniforms.uOpacity.value=.85;this.floorNet.uniforms.uPulse.value=1;}
      this.crosses.forEach((cross,index)=>{
        const hit=this.scanner.currentHits[index];cross.visible=Boolean(hit);
        if(hit){cross.position.copy(hit.point).applyMatrix4(this.modelToXR.clone().invert());cross.position.y+=.006;
          (cross.userData.mat as THREE.LineBasicMaterial).color.setHex(hit.accepted?0x83ffe3:0xff6b61);}
      });
    }
    if(this.locked&&this.revealStart!==null){const t=Math.min(1,(performance.now()-this.revealStart)/750);
      this.floorNet.uniforms.uReveal.value=.65+3.6*(1-Math.pow(1-t,3));
      this.floorNet.uniforms.uOpacity.value=.85-.46*t;this.floorNet.uniforms.uPulse.value=1-t;
      this.floorNet.mesh.visible=t<1;if(t>=1)this.revealStart=null;}
    if(time-this.lastReport>250){
      this.lastReport=time;
      // Straight-line distance from tracked camera to detected floor hit in metres.
      const floorHit=this.locked?null:this.scanner.point;
      const distanceM=floorHit?Math.hypot(
        pose.transform.position.x-floorHit.x,
        pose.transform.position.y-floorHit.y,
        pose.transform.position.z-floorHit.z):null;
      this.publish({tracking:true,error:null,ready:!this.locked&&Boolean(this.confirmation.current(performance.now())),
        detectedFloorDistanceM:distanceM===null?null:Math.round(distanceM*100)/100,
        rawHits:this.scanner.rawHits,validHits:this.scanner.validHits});
    }
    this.updateRig();
    this.renderer.xr.updateCamera(this.camera);
    this.events.frame(time);
  }

  /** Raw tracked pose -> metric CAD space; the project itself is never transformed. */
  private updateRig() {
    this.origin.updateMatrix();this.alignment.updateMatrix();
    this.modelToXR.multiplyMatrices(this.origin.matrix,this.alignment.matrix);
    this.rig.matrix.copy(this.modelToXR).invert();
    this.rig.updateMatrixWorld(true);
  }

  configureView(mode:WideViewMode) {
    if(!this.active)return;
    this.scene.background=this.locked&&mode!=='normal'?this.saved?.background??new THREE.Color('#eaeef3'):null;
    const xrCamera=this.renderer.xr.getCamera();
    if(this.currentFrame&&this.session){
      try {this.occlusion.update(this.currentFrame.frame,this.currentFrame.pose,this.renderer,this.session,
        {enabled:this.state.occlusionEnabled,ar:mode==='normal'});}catch{this.occlusion.hide('unsupported');}
    }
    if(this.locked&&mode!=='normal') {
      const rect=this.renderer.domElement.getBoundingClientRect();
      const size=this.renderer.getSize(new THREE.Vector2());
      const aspect=(rect.width||size.x)/Math.max(1,rect.height||size.y);
      const projection=new THREE.PerspectiveCamera(wideViewVerticalFov(mode,aspect),
        aspect,this.camera.near,this.camera.far);
      for(const cam of [xrCamera,...xrCamera.cameras,this.camera]){
        cam.projectionMatrix.copy(projection.projectionMatrix);
        cam.projectionMatrixInverse.copy(projection.projectionMatrixInverse);
      }
    }
  }

  confirmFloor() {
    const evidence=this.confirmation.current(performance.now());
    if(!this.active||!evidence||performance.now()-this.lastPoseTime>600){this.events.toast('کف هنوز پایدار نیست؛ دستگاه را آرام به سمت کف حرکت دهید.');return;}
    // Rescanning preserves horizontal placement, orientation and metric scale.
    if(!this.baseOrigin){this.origin.position.copy(evidence.point);this.baseOrigin={x:evidence.point.x,y:evidence.point.y,z:evidence.point.z,yaw:0};}
    else {this.origin.position.y=evidence.point.y;this.baseOrigin.y=evidence.point.y;}
    this.clearAnchors();this.candidates=evidence.observations.map(p=>p.clone());
    this.scanMarker.visible=false;
    this.updateRig();this.renderer.xr.updateCamera(this.camera);
    const floor=new THREE.Object3D();floor.updateMatrixWorld(true);
    const pins=calibrationPinsAtView(this.camera,floor);this.a.copy(pins.a);this.b.copy(pins.b);
    this.publish({floorLocked:true,ready:false,calibrating:true,selectedPin:null,kitchenHidden:true});
    this.crosses.forEach(c=>c.visible=false);this.floorNet.mesh.position.set(0,.004,0);this.revealStart=performance.now();
    this.refreshPins();this.events.confirmed();
  }

  rescan() {
    if(!this.active)return;
    this.baseOrigin={x:this.origin.position.x,y:this.origin.position.y,z:this.origin.position.z,yaw:this.origin.rotation.y};
    this.clearAnchors();this.confirmation.reset();this.scanner.reset();
    this.pins.visible=false;
    this.revealStart=null;
    this.publish({floorLocked:false,ready:false,calibrating:false,selectedPin:null});
  }

  calibrate(enabled=true) {
    if(!this.locked)return;
    this.publish({calibrating:enabled,selectedPin:null,kitchenHidden:enabled});this.pins.visible=enabled;this.refreshPins();
  }
  toggleKitchen() {this.publish({kitchenHidden:!this.state.kitchenHidden});}
  toggleOcclusion() {this.publish({occlusionEnabled:!this.state.occlusionEnabled});}
  selectPin(pin:'a'|'b') {if(this.locked)this.publish({selectedPin:pin});}
  private refreshPins() {
    this.pinA.position.copy(this.a);this.pinB.position.copy(this.b);
    this.line.geometry.dispose();this.line.geometry=new THREE.BufferGeometry().setFromPoints([
      this.a.clone().setY(.025),this.b.clone().setY(.025)]);
    // Compensate for AR alignment scaling so A/B markers keep constant physical size.
    const inverseScale=1/Math.max(0.01,this.alignment.scale.x);
    this.pinA.scale.setScalar(inverseScale);
    this.pinB.scale.setScalar(inverseScale);
    this.pins.visible=this.locked&&this.state.calibrating;
    this.publish({distanceCm:Math.round(this.a.distanceTo(this.b)*100)});
    this.events.render();
  }

  applyDistance(cm:number) {
    if(!this.locked||!Number.isFinite(cm)||cm<10||cm>1000||this.a.distanceTo(this.b)<.08)return;
    const physicalA=this.a.clone().applyMatrix4(this.alignment.matrix);
    const direction=this.b.clone().sub(this.a).normalize();
    const scale=this.a.distanceTo(this.b)*this.alignment.scale.x/(cm/100);
    this.alignment.scale.setScalar(scale);
    this.alignment.position.set(0,0,0);this.alignment.updateMatrix();
    this.alignment.position.copy(physicalA.sub(this.a.clone().applyMatrix4(this.alignment.matrix)));
    this.b.copy(this.a).addScaledVector(direction,cm/100);
    this.updateRig();this.calibrate(false);
    this.events.calibration({x:this.a.x,z:this.a.z},{x:this.b.x,z:this.b.z},cm);
  }

  private floorPoint(x:number,y:number) {
    const rect=this.renderer.domElement.getBoundingClientRect();
    const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1),this.camera);
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),new THREE.Vector3());
  }
  private movePin(pin:'a'|'b',point:THREE.Vector3,anchorA?:THREE.Vector3) {
    this.updateRig();
    // Pointer coordinates are model-space. Alignment fitting uses floor-local meters.
    const physical=point.clone().applyMatrix4(this.alignment.matrix);
    const fixedA=anchorA??this.a.clone().applyMatrix4(this.alignment.matrix);
    if(pin==='a')this.alignment.position.add(physical.sub(fixedA));
    else {
      const fit=fitCalibrationDragABWithScale({x:this.a.x,z:this.a.z},{x:this.b.x,z:this.b.z},
        {x:fixedA.x,z:fixedA.z},{x:physical.x,z:physical.z});
      if(!fit)return;
      this.alignment.position.set(fit.x,0,fit.z);this.alignment.rotation.y=fit.yaw;this.alignment.scale.setScalar(fit.scale);
    }
    this.updateRig();this.refreshPins();
  }
  confirmPinAtAim() {
    if(!this.state.selectedPin)return;
    const rect=this.renderer.domElement.getBoundingClientRect();
    const p=this.floorPoint(rect.left+rect.width/2,rect.top+rect.height/2);
    if(p)this.movePin(this.state.selectedPin,p);
    this.publish({selectedPin:null});
  }
  /** Old AR used a generous 75-pixel touch radius around A/B. Restore that
   * behavior rather than requiring a precise hit on a 4.5 cm 3D cylinder. */
  private pickPinAtScreen(clientX:number, clientY:number): 'a' | 'b' | null {
    const rect=this.renderer.domElement.getBoundingClientRect();
    if(!rect.width||!rect.height)return null;
    this.camera.updateMatrixWorld(true);
    this.pins.updateWorldMatrix(true,true);
    const measure=(pin:THREE.Group) => {
      let min=Infinity;
      for(const height of [0.02,0.17,0.40]){
        const projected=pin.localToWorld(new THREE.Vector3(0,height,0)).project(this.camera);
        if(projected.z<-1||projected.z>1)continue;
        const px=rect.left+(projected.x+1)*rect.width/2;
        const py=rect.top+(1-projected.y)*rect.height/2;
        min=Math.min(min,Math.hypot(clientX-px,clientY-py));
      }
      return min;
    };
    const distanceA=measure(this.pinA),distanceB=measure(this.pinB);
    return Math.min(distanceA,distanceB)<=75 ? distanceA<=distanceB?'a':'b' : null;
  }
  pointerDown(event:PointerEvent) {
    if(!this.state.calibrating)return this.editingBlocked;
    if(event.button!==0)return true;
    const hitPin=this.pickPinAtScreen(event.clientX,event.clientY);
    const pin=hitPin??this.state.selectedPin;
    if(pin){
      this.alignment.updateMatrix();
      this.drag={id:event.pointerId,pin,anchorA:this.a.clone().applyMatrix4(this.alignment.matrix)};
      // After selecting A or B in the controls, tapping any point on the floor
      // places it immediately, while the same gesture may continue as a drag.
      if(!hitPin && this.state.selectedPin===pin){
        const floor=this.floorPoint(event.clientX,event.clientY);
        if(floor)this.movePin(pin,floor,pin==='b'?this.drag.anchorA:undefined);
      }
      try { this.renderer.domElement.setPointerCapture(event.pointerId); } catch {}
    }
    return true;
  }
  pointerMove(event:PointerEvent) {if(this.drag?.id!==event.pointerId)return false;
    const p=this.floorPoint(event.clientX,event.clientY);if(p)this.movePin(this.drag.pin,p,this.drag.pin==='b'?this.drag.anchorA:undefined);return true;}
  pointerUp(event:PointerEvent) {if(this.drag?.id!==event.pointerId)return false;this.drag=null;
    if(this.renderer.domElement.hasPointerCapture(event.pointerId))this.renderer.domElement.releasePointerCapture(event.pointerId);return true;}

  private clearAnchors() {
    this.anchorGeneration++;this.anchorPending=false;
    for(const node of this.anchors){try{node.anchor.delete();}catch{}}
    this.anchors=[];this.candidates=[];this.stabilizer=new AnchorStabilizer();this.lastAnchorTime=0;
  }
  private updateAnchors(frame:XRFrame,space:XRReferenceSpace,time:number) {
    const origin=this.baseOrigin, session=this.session;if(!origin||!session)return;
    if(this.tracking.hitSource&&this.anchors.length<5) {
      for(const hit of frame.getHitTestResults(this.tracking.hitSource)) {
        const pose=hit.getPose(space);if(!pose)continue;
        const p=pose.transform.position;const point=new THREE.Vector3(p.x,p.y,p.z);
        if(Math.abs(p.y-origin.y)<.055 && this.candidates.every(candidate=>candidate.distanceTo(point)>.42))this.candidates.push(point);
      }
    }
    if(frame.createAnchor&&this.anchors.length<5&&!this.anchorPending){
      const next=this.candidates.find(p=>Math.abs(p.y-origin.y)<.055&&this.anchors.every(a=>a.requested.distanceTo(p)>.42));
      if(next){const generation=this.anchorGeneration;this.anchorPending=true;
        void frame.createAnchor(new XRRigidTransform({x:next.x,y:next.y,z:next.z}),space).then(anchor=>{
          if(this.disposed||this.session!==session||generation!==this.anchorGeneration){anchor.delete();return;}
          this.anchors.push({anchor,requested:next.clone(),reference:null});this.anchorPending=false;
        }).catch(()=>{if(generation===this.anchorGeneration){this.anchorPending=false;this.candidates=this.candidates.filter(p=>p!==next);}});
      }
    }
    const samples:AnchorSample[]=[];
    for(const [index,node] of this.anchors.entries()){
      const pose=frame.getPose(node.anchor.anchorSpace,space);if(!pose)continue;
      const p=pose.transform.position;const observed:ChidoVec3=[p.x,p.y,p.z];node.reference??=[...observed];
      samples.push({id:String(index),reference:node.reference,observed});
    }
    if(samples.length>=3){
      const fitted=this.stabilizer.update(samples,this.lastAnchorTime?(time-this.lastAnchorTime)/1000:.016);this.lastAnchorTime=time;
      if(fitted.status!=='insufficient'){
        this.origin.position.set(...transformPoint([origin.x,origin.y,origin.z],fitted.pose));
        this.origin.rotation.y=origin.yaw+fitted.pose.yaw;
      }
    }
  }

  private restore() {
    if(this.watchdog)clearInterval(this.watchdog);this.watchdog=null;
    this.renderer.setAnimationLoop(null);this.tracking.dispose();this.clearAnchors();
    this.rig.remove(this.camera);this.rig.matrix.identity();
    this.renderer.xr.cameraAutoUpdate=true;
    this.renderer.domElement.style.opacity='1';
    if(this.saved){this.camera.position.copy(this.saved.position);this.camera.quaternion.copy(this.saved.quaternion);
      this.camera.scale.setScalar(1);this.camera.near=this.saved.near;this.camera.fov=this.saved.fov;
      this.controls.target.copy(this.saved.target);this.scene.background=this.saved.background;}
    this.camera.updateMatrixWorld(true);this.camera.updateProjectionMatrix();
    this.controls.enabled=true;this.pins.visible=false;this.scanMarker.visible=false;
    this.floorNet.mesh.visible=false;this.crosses.forEach(c=>c.visible=false);this.currentFrame=null;this.occlusion.hide('idle');
    this.baseOrigin=null;this.origin.position.set(0,0,0);this.origin.rotation.set(0,0,0);
    this.alignment.position.set(0,0,0);this.alignment.rotation.set(0,0,0);this.alignment.scale.setScalar(1);
    this.pinA.scale.setScalar(1);this.pinB.scale.setScalar(1);
    this.events.render();
  }
  private onEnd(session:XRSession) {
    if(this.session!==session)return;
    this.session=null;this.generation++;this.restore();this.publish(initialARState());this.events.ended();
  }
  stop() {
    this.generation++;const session=this.session;this.session=null;
    if(session)void session.end().catch(()=>{});this.restore();this.publish(initialARState());
  }
  dispose() {
    this.stop();this.disposed=true;
    this.occlusion.dispose();
    for(const root of [this.scanMarker,this.pins,this.floorNet.mesh,...this.crosses]){this.scene.remove(root);root.traverse(obj=>{
      const mesh=obj as THREE.Mesh;if(mesh.geometry)mesh.geometry.dispose();
      const material=mesh.material;if(material)for(const m of Array.isArray(material)?material:[material]){
        const map=(m as THREE.MeshBasicMaterial).map;map?.dispose();m.dispose();
      }
    });}
  }
}
