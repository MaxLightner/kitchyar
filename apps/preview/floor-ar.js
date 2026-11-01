/* Chido v0.5.7 floor detection adapter, pinned to its exact source commit. */
import * as THREE from 'https://cdn.jsdelivr.net/gh/MaxLightner/tolica-ar@0abbab05c15eed4f3922d1e1dc74b5c17b82e8be/vendor/three.module.js';
import {FloorScanner,floorCandidates} from 'https://cdn.jsdelivr.net/gh/MaxLightner/tolica-ar@0abbab05c15eed4f3922d1e1dc74b5c17b82e8be/surfaces.js';
import {requestARSession} from 'https://cdn.jsdelivr.net/gh/MaxLightner/tolica-ar@0abbab05c15eed4f3922d1e1dc74b5c17b82e8be/xr.js';
import {AnchorStabilizer,transformPoint} from 'https://cdn.jsdelivr.net/gh/MaxLightner/tolica-ar@0abbab05c15eed4f3922d1e1dc74b5c17b82e8be/anchor-rig.js';
import {limitCabinetEnd,wallJointCaps,EQUIPMENT_SPECS,snapCabinetPoint,cabinetPath,cabinetFootprint,cornerFillFootprint,cabinetCornerTrims,snapFridgePoint,placeEquipment,nearestCabinet,planFronts,frontPose,planSmartKitchen,countertopCutouts,resolvedCabinetDecor,resolvedCountertopDesign} from './geometry.js?v=fix43';
import {neighborGaps} from './edit-handles.js?v=fix43';
import {DEFAULT_MATERIALS,resolveFinish,materialFor,assetUrl} from './materials.js?v=fix43';
import {DEFAULT_TILE_LAYOUT,validateTileLayout,buildTileGeometry} from './tile-layout.js?v=fix43';
import {WIDE_FOV,verticalFovFromHorizontal,copyTrackedView} from './wide-view.js?v=wide34';
import {cabinetCarcassPanels,buildCarcassPanelGeometry} from './carcass.js?v=fix43';
import {roomOutline} from './room-surfaces.js?v=room40';

const RAYS=[[-.24,0],[.24,0],[0,-.24],[0,.24],[-.18,-.18],[.18,-.18],[-.18,.18],[.18,.18]];
// Raycaster may return intersections belonging to invisible ancestor groups.
// Concealed facades must also disappear from selection, not just rendering.
const pickable=node=>{for(let n=node;n;n=n.parent)if(!n.visible)return false;return true;};
export class FloorAR {
 constructor(root,update,exit){
  Object.assign(this,{root,update,exit,session:null,renderer:null,locked:false,current:null,origin:null});
  this.scanner=new FloorScanner();this.rig=new AnchorStabilizer();this.sources=[];this.anchors=[];
  this.candidates=[];this.pending=false;this.points={a:null,b:null};this.lastReport=0;this.lastTime=0;
   this.basePosition=null;this.baseYaw=0;this.alignment={x:0,z:0,yaw:0,scale:1};
   this.items=[];this.selectedId=null;this.drawing=null;this.targetLocal=null;this.lastPose=null;this.gridYaw=0;this.calibrationOffset=null;this.savedCalibration=null;this.calibrationVisible=true;
   this.renderSettings={sunAzimuth:-40,sunElevation:55,sunIntensity:2.1,ambientIntensity:1,aoStrength:.65,reflection:.10,taskLighting:true,taskIntensity:1.8};
   this.materialSettings={...DEFAULT_MATERIALS};this.tileLayout={...DEFAULT_TILE_LAYOUT};this.textureCache=new Map();
   this.wideRenderer=null;this.wideCamera=null;this.wideActive=false;this.wideLevel='wide';
   this.facadesHidden=false;this.frontRoots=[];this.frontControls=new Map();this.frontMotions=new Map();
   this.roomSurfacesVisible=false;this.ceilingHeight=3.6;this.resizingWindowId=null;
 }
 report(message,extra={}){
  this.update({message,locked:this.locked,ready:this.scanner.ready,
   progress:Math.min(100,Math.round(this.scanner.observations.length/3*100)),
   valid:this.scanner.validHits,inliers:this.scanner.inlierHits,raw:this.scanner.rawHits,
   anchors:this.anchors.length,depth:this.renderer?.xr?.hasDepthSensing?.()||false,
   direction:this.points?.a&&this.points?.b?Math.round(this.gridYaw*180/Math.PI):null,...extra});
 }
 _applyAlignment(){
  if(!this.floorGroup||!this.basePosition)return;
  const offset=new THREE.Vector3(this.alignment.x,0,this.alignment.z).applyAxisAngle(new THREE.Vector3(0,1,0),this.baseYaw);
  this.floorGroup.position.copy(this.basePosition).add(offset);
  this.floorGroup.rotation.y=this.baseYaw+this.alignment.yaw;
  this.floorGroup.scale.setScalar(this.alignment.scale);
 }
 _alignedBasePoint(projectPoint){
  const v=projectPoint.clone().multiplyScalar(this.alignment.scale)
   .applyAxisAngle(new THREE.Vector3(0,1,0),this.alignment.yaw);
  return v.add(new THREE.Vector3(this.alignment.x,0,this.alignment.z));
 }
 _basePoint(worldPoint){
  return worldPoint.clone().sub(this.basePosition)
   .applyAxisAngle(new THREE.Vector3(0,1,0),-this.baseYaw);
 }
 async start(){
  if(this.session)return;
  if(!navigator.xr||!isSecureContext)throw Error('این مرورگر از AR پشتیبانی نمی‌کند. برای اسکن کف از Chrome اندروید و ARCore استفاده کن.');
  // Preserve click activation: requestSession is the first asynchronous operation.
  const requesting=requestARSession(navigator.xr,this.root,false,{depth:true,light:true});
  this.session=await requesting;
  try{
   this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera();
   this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
   this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
   this.renderer.shadowMap.enabled=true;
   this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
   this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
   this.renderer.toneMappingExposure=1.15;
   this.renderer.xr.enabled=true;this.renderer.xr.setReferenceSpaceType('local');
   this.renderer.domElement.className='xr-canvas';
   this.root.querySelector('.editor-scene').prepend(this.renderer.domElement);
   await this.renderer.xr.setSession(this.session);
   this.space=this.renderer.xr.getReferenceSpace();
   this.floorGroup=new THREE.Group();this.scene.add(this.floorGroup);
    this.ambient=new THREE.HemisphereLight(0xffffff,0x7d8b80,1.0);this.scene.add(this.ambient);
    this.sun=new THREE.DirectionalLight(0xfff4e2,2.1);
    this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);
    this.sun.shadow.camera.left=-6;this.sun.shadow.camera.right=6;
    this.sun.shadow.camera.top=6;this.sun.shadow.camera.bottom=-6;
    this.sun.shadow.camera.near=.1;this.sun.shadow.camera.far=22;
    this.sun.shadow.bias=-.00015;this.sun.shadow.normalBias=.018;
    this.sun.shadow.radius=3;this.sun.target.position.set(0,0,0);
    this.floorGroup.add(this.sun,this.sun.target);this.setLighting(this.renderSettings);
    this.objectGroup=new THREE.Group();this.floorGroup.add(this.objectGroup);
    this.previewGroup=new THREE.Group();this.previewGroup.visible=false;
    this.previewGroup.renderOrder=20;this.floorGroup.add(this.previewGroup);
    this.editGroup=new THREE.Group();this.floorGroup.add(this.editGroup);
    this.editPreviewGroup=new THREE.Group();this.floorGroup.add(this.editPreviewGroup);
    this.whiteFloor=new THREE.Mesh(new THREE.PlaneGeometry(6,6),new THREE.MeshStandardMaterial({
     color:0xffffff,transparent:true,opacity:.50,depthWrite:false,roughness:1,metalness:0,side:THREE.DoubleSide
    }));
    this.whiteFloor.rotation.x=-Math.PI/2;this.whiteFloor.position.y=.001;
    this.whiteFloor.receiveShadow=true;this.whiteFloor.visible=false;this.floorGroup.add(this.whiteFloor);
    this.shadowFloor=new THREE.Mesh(new THREE.PlaneGeometry(6,6),new THREE.ShadowMaterial({opacity:.27,transparent:true,depthWrite:false}));
    this.shadowFloor.rotation.x=-Math.PI/2;this.shadowFloor.position.y=.002;
    this.shadowFloor.receiveShadow=true;this.shadowFloor.visible=false;this.floorGroup.add(this.shadowFloor);
    this.reflectionRT=new THREE.WebGLCubeRenderTarget(64,{generateMipmaps:true,minFilter:THREE.LinearMipmapLinearFilter});
    this.reflectionCamera=new THREE.CubeCamera(.1,20,this.reflectionRT);
    this.reflectionCamera.position.set(0,1.4,0);this.floorGroup.add(this.reflectionCamera);
    this.rebuildObjects();
   this.net=createFloorNet();this.floorGroup.add(this.net);
   this.crosses=new THREE.Group();this.scene.add(this.crosses);
   const cross=new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-.016,0,-.016),new THREE.Vector3(.016,0,.016),
    new THREE.Vector3(-.016,0,.016),new THREE.Vector3(.016,0,-.016)]);
   this.marks=Array.from({length:20},()=>{
    const m=new THREE.LineSegments(cross,new THREE.LineBasicMaterial({color:0x83ffe3,transparent:true,opacity:.94,depthTest:false}));
    m.visible=false;m.renderOrder=10;this.crosses.add(m);return m;
   });
   this.ruler=new THREE.Group();this.floorGroup.add(this.ruler);
   const point=(color,name)=>{const shape=new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-.045,0,-.045),new THREE.Vector3(.045,0,.045),
    new THREE.Vector3(-.045,0,.045),new THREE.Vector3(.045,0,-.045)]);
    const mesh=new THREE.LineSegments(shape,new THREE.LineBasicMaterial({color,linewidth:3,depthTest:false}));mesh.renderOrder=12;
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=80;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff9ee';ctx.beginPath();ctx.roundRect(2,2,124,76,12);ctx.fill();
    ctx.fillStyle='#2d4436';ctx.font='bold 54px Tahoma';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(name,64,41);
    const label=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),depthTest:false}));
    label.position.y=.16;label.scale.set(.26,.16,1);label.renderOrder=13;mesh.add(label);
    return mesh;};
   this.markA=point(0xe5a45b,'A');this.markB=point(0x57b7aa,'B');
   for(const [mesh,name] of [[this.markA,'a'],[this.markB,'b']]){
    mesh.userData.calibration=name;
    const touch=new THREE.Mesh(new THREE.SphereGeometry(.10,12,8),
     new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,depthWrite:false}));
    touch.userData.calibration=name;mesh.add(touch);
   }
   this.ruler.add(this.markA,this.markB);
   this.rulerLine=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xffbc62,depthTest:false}));
   this.ruler.add(this.rulerLine);
   this.rulerTicks=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xffbc62,depthTest:false}));
   this.ruler.add(this.rulerTicks);this.ruler.visible=false;
   this.session.addEventListener('end',()=>this.cleanup(),{once:true});
   await this.scan();
   this.renderer.setAnimationLoop((time,frame)=>this.frame(time,frame));
   this.report('گوشی را به آرامی روی کف حرکت بده.');
  }catch(error){await this.stop();throw error;}
 }
 // The DOM-overlay renderer is intentionally independent of the immersive XR
 // compositor. It uses the exact tracked world-space pose, never an orbit,
 // moved camera, scaled room or a simulated zoom-out.
 setWideView(level='wide'){
  if(!Object.hasOwn(WIDE_FOV,level))throw Error('زاویه دید سه‌بعدی معتبر نیست.');
  if(!this.session||!this.locked)throw Error('ابتدا AR را فعال و کف را تثبیت کن.');
  if(this.session.domOverlayState?.type!=='screen')
   throw Error('این مرورگر لایه تمام‌صفحه WebXR را برای نمای واید پشتیبانی نمی‌کند.');
  if(!this.wideRenderer){
   const sceneHost=this.root.querySelector('.editor-scene');
   if(!sceneHost)throw Error('سطح نمایش سه‌بعدی پیدا نشد.');
   const renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,powerPreference:'low-power'});
   renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.25));
   renderer.outputColorSpace=THREE.SRGBColorSpace;
   renderer.toneMapping=THREE.ACESFilmicToneMapping;
   renderer.toneMappingExposure=1.15;
   renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
   renderer.setClearColor(0xe9eee6,1);
   renderer.domElement.className='wide-view-canvas';
   renderer.domElement.setAttribute('aria-hidden','true');
   renderer.domElement.hidden=true;
   renderer.domElement.addEventListener('webglcontextlost',event=>{
    event.preventDefault();this.disableWideView();
    this.onWideViewError?.('مرورگر رندرر نمای واید را از دست داد؛ به AR برگرد.');
   });
   sceneHost.appendChild(renderer.domElement);
   this.wideRenderer=renderer;
   this.wideCamera=new THREE.PerspectiveCamera(60,1,.03,80);
  }
  this.wideLevel=level;this.wideActive=true;this.wideRenderer.domElement.hidden=false;
  this.resizeWideView(true);
  if(this.lastPose)copyTrackedView(this.wideCamera,this.lastPose);
  return WIDE_FOV[level];
 }
 disableWideView(){
  this.wideActive=false;
  if(this.wideRenderer)this.wideRenderer.domElement.hidden=true;
 }
 resizeWideView(force=false){
  if(!this.wideActive||!this.wideRenderer)return;
  const rect=this.root.querySelector('.editor-scene').getBoundingClientRect();
  const width=Math.max(1,Math.round(rect.width||innerWidth)),height=Math.max(1,Math.round(rect.height||innerHeight));
  if(force||this.wideWidth!==width||this.wideHeight!==height){
   this.wideWidth=width;this.wideHeight=height;
   this.wideRenderer.setSize(width,height,false);
   this.wideCamera.aspect=width/height;
  }
  this.wideCamera.fov=verticalFovFromHorizontal(WIDE_FOV[this.wideLevel],this.wideCamera.aspect);
  this.wideCamera.updateProjectionMatrix();
 }
 drawWideView(pose){
  if(!this.wideActive||!this.wideRenderer||!copyTrackedView(this.wideCamera,pose))return;
  this.resizeWideView();
  this.wideRenderer.render(this.scene,this.wideCamera);
 }
 activeViewMatrices(){
  if(this.wideActive&&this.wideCamera){
   this.wideCamera.updateMatrixWorld(true);
   return {cameraView:this.wideCamera.matrixWorldInverse,projection:this.wideCamera.projectionMatrix};
  }
  const view=this.lastPose?.views?.[0];if(!view)return null;
  return {cameraView:new THREE.Matrix4().fromArray(view.transform.inverse.matrix),
   projection:new THREE.Matrix4().fromArray(view.projectionMatrix)};
 }
 async scan(){
  if(!this.session)return;
  if(this.scanPromise)return this.scanPromise;
  const pending=this._scanOnce();this.scanPromise=pending;
  try{return await pending;}finally{if(this.scanPromise===pending)this.scanPromise=null;}
 }
 async _scanOnce(){
  const session=this.session;
  this.scanner.reset();this.locked=false;this.current=null;this.points={a:null,b:null};
  this.basePosition=null;this.baseYaw=0;this.alignment={x:0,z:0,yaw:0,scale:1};
  this.rig=new AnchorStabilizer();this.candidates=[];this.pending=false;
  for(const a of this.anchors)try{a.anchor.delete();}catch{}this.anchors=[];
  const oldHit=this.hitSource;this.hitSource=null;oldHit?.cancel();
  for(const s of this.sources)try{s.cancel();}catch{}this.sources=[];
  this.net.visible=false;this.net.rotation.z=0;this.gridYaw=0;this.whiteFloor.visible=false;this.shadowFloor.visible=false;
  this.previewGroup.visible=false;this.ruler.visible=false;this.marks.forEach(m=>m.visible=false);
  const viewer=await session.requestReferenceSpace('viewer');
  if(session!==this.session)return;
  this.lowerHitSource?.cancel?.();this.lowerHitSource=null;
  if(window.XRRigidTransform){try{
   const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1),new THREE.Vector3(0,-.38,-1).normalize());
   const lower=viewer.getOffsetReferenceSpace(new XRRigidTransform({}, {x:q.x,y:q.y,z:q.z,w:q.w}));
   this.lowerHitSource=await this.session.requestHitTestSource({space:lower,entityTypes:['plane']});
  }catch(error){console.debug('Lower reticle hit-test unavailable',error);}}

  const source=await session.requestHitTestSource({space:viewer,entityTypes:['plane']});
  if(session!==this.session){source.cancel();return;}this.hitSource=source;
  if(window.XRRigidTransform){
   for(const [x,y] of RAYS){
    try{
     const direction=new THREE.Vector3(x,y,-1).normalize();
     const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1),direction);
     const ray=viewer.getOffsetReferenceSpace(new XRRigidTransform({}, {x:q.x,y:q.y,z:q.z,w:q.w}));
     const optional=await session.requestHitTestSource({space:ray,entityTypes:['plane']});
    if(session!==this.session){optional.cancel();return;}this.sources.push(optional);
    }catch(error){console.debug('Optional Chido hit ray unavailable',error);break;}
   }
  }
  this.report('در حال یافتن سطح افقی...');
 }
 confirm(){
  if(!this.scanner.ready||!this.scanner.point||this.locked)return false;
  this.locked=true;this.origin=this.scanner.point.clone();
  this.basePosition=this.origin.clone();this.baseYaw=0;this._applyAlignment();
  this.net.material.uniforms.reveal.value=2.8;this.net.material.uniforms.pulse.value=0;
  this.net.material.uniforms.opacity.value=.39;this.net.visible=true;
  this.whiteFloor.visible=true;this.shadowFloor.visible=true;
  this.marks.forEach(m=>m.visible=false);
  this.candidates=[this.origin.clone(),...this.scanner.observations.map(p=>p.clone())];
  this.points=this.savedCalibration?{
    a:new THREE.Vector3(this.savedCalibration.a.x,0,this.savedCalibration.a.z),
    b:new THREE.Vector3(this.savedCalibration.b.x,0,this.savedCalibration.b.z)
   }:{a:new THREE.Vector3(-.5,0,.65),b:new THREE.Vector3(.5,0,.65)};
  this.drawRuler();
  this.report('کف تثبیت شد. A یا B را با نشانگر جابه‌جا کن؛ شبکه هم‌جهت می‌شود.',{progress:100});
  return true;
 }
 setCalibration(points,apply=false){
   if(!points?.a||!points?.b||![points.a.x,points.a.z,points.b.x,points.b.z].every(Number.isFinite)||
    Math.hypot(points.b.x-points.a.x,points.b.z-points.a.z)<.10)return false;
   this.savedCalibration={a:{x:points.a.x,z:points.a.z},b:{x:points.b.x,z:points.b.z}};
   if(apply&&this.locked){
    this.points={a:new THREE.Vector3(points.a.x,0,points.a.z),b:new THREE.Vector3(points.b.x,0,points.b.z)};
    this.drawRuler();
   }
   return true;
  }
  calibrationSnapshot(){
   return this.points.a&&this.points.b?{
    a:{x:this.points.a.x,z:this.points.a.z},b:{x:this.points.b.x,z:this.points.b.z}
   }:null;
  }
  capture(which){
  if(!this.locked||!this.current)return false;
  this.floorGroup.updateWorldMatrix(true,false);
  this.points[which]=this.floorGroup.worldToLocal(this.current.clone());
  this.points[which].y=0;
  this.drawRuler();
  this.report(which==='a'?'نقطه A ثبت شد؛ حالا B را ثبت کن.':'نقطه B ثبت شد؛ فاصله واقعی را وارد کن.',
   {distance:this.points.a&&this.points.b?this.points.a.distanceTo(this.points.b):null});
  return true;
 }
 calibrate(real){
  const a=this.points.a,b=this.points.b,actual=Number(real);
  if(!a||!b)throw Error('ابتدا A و B را ثبت کن.');
  const measured=a.distanceTo(b);
  if(!Number.isFinite(actual)||actual<.1||actual>20||measured<.1)throw Error('فاصله معتبر نیست.');
  const ratio=actual/measured;
  if(Math.abs(ratio-1)>.2)throw Error('اختلاف بیشتر از ۲۰٪ است؛ اندازه‌گیری را تکرار کن.');
  const anchor=this._alignedBasePoint(a),next=this.alignment.scale*ratio;
  if(next<.8||next>1.2)throw Error('اصلاح مقیاس باید در محدوده ۲۰٪ باشد.');
  this.alignment.scale=next;
  const rotated=a.clone().multiplyScalar(next).applyAxisAngle(new THREE.Vector3(0,1,0),this.alignment.yaw);
  this.alignment.x=anchor.x-rotated.x;this.alignment.z=anchor.z-rotated.z;
  this._applyAlignment();
  this.report('مقیاس فیزیکی پروژه تصحیح شد؛ مختصات اصلی طراحی تغییر نکرد.',{distance:measured,ratio});
  return ratio;
 }
 setCalibrationVisible(visible){
  if(this.calibrationVisible===Boolean(visible))return;
  this.calibrationVisible=Boolean(visible);
  if(this.ruler)this.drawRuler();
 }
 cameraSideForWall(w){
  if(!this.lastPose||!this.floorGroup||!w)return 1;
  const p=this.lastPose.transform.position;
  this.floorGroup.updateWorldMatrix(true,false);
  const local=new THREE.Vector3(p.x,p.y,p.z).applyMatrix4(this.floorGroup.matrixWorld.clone().invert());
  const dx=w.x2-w.x1,dz=w.z2-w.z1;
  return (local.x-w.x1)*(-dz)+(local.z-w.z1)*dx>=0?1:-1;
 }
 drawRuler(){
  const a=this.points.a,b=this.points.b;
  this.ruler.visible=this.calibrationVisible&&!!(a||b);
  this.markA.visible=this.calibrationVisible&&!!a;this.markB.visible=this.calibrationVisible&&!!b;
  if(a)this.markA.position.copy(a);
  if(b)this.markB.position.copy(b);
  if(a&&b){
   this.gridYaw=Math.atan2(b.z-a.z,b.x-a.x);
   this.net.rotation.z=-this.gridYaw;
  }
  this.rulerLine.visible=!!(a&&b);
  if(a&&b){
   this.rulerLine.geometry.dispose();
   this.rulerLine.geometry=new THREE.BufferGeometry().setFromPoints([a.clone().add(new THREE.Vector3(0,.045,0)),b.clone().add(new THREE.Vector3(0,.045,0))]);
   const length=a.distanceTo(b),steps=Math.min(200,Math.floor(length/.1));
   const direction=b.clone().sub(a).normalize(),normal=new THREE.Vector3(-direction.z,0,direction.x),ticks=[];
   for(let i=0;i<=steps;i++){
    const center=a.clone().addScaledVector(direction,i*.1),half=(i%5===0?.07:.035);
    ticks.push(center.clone().addScaledVector(normal,-half),center.clone().addScaledVector(normal,half));
   }
   this.rulerTicks.geometry.dispose();this.rulerTicks.geometry=new THREE.BufferGeometry().setFromPoints(ticks);
   this.rulerTicks.visible=true;
  }else this.rulerTicks.visible=false;
 }
 frame(time,frame){
  if(!frame||!this.renderer)return;
  const pose=frame.getViewerPose(this.space);
  if(!pose){if(time-this.lastReport>400){this.report('ردیابی از دست رفت؛ گوشی را آرام حرکت بده.',{tracking:false});this.lastReport=time;}
   this.renderer.render(this.scene,this.camera);return;}
  const viewer=new THREE.Vector3(pose.transform.position.x,pose.transform.position.y,pose.transform.position.z);
  if(this.hitSource&&!this.scanPromise){
   let center=[];try{center=frame.getHitTestResults(this.hitSource);}catch(error){
    this.report('منبع اسکن کف قطع شد؛ دوباره اسکن کن.',{tracking:false});return;
   }
   const extra=[];
   for(const s of this.sources)try{extra.push(...frame.getHitTestResults(s));}catch{}
   if(!this.locked){
    const q=pose.transform.orientation;
    const forward=new THREE.Vector3(0,0,-1).applyQuaternion(new THREE.Quaternion(q.x,q.y,q.z,q.w));
    const point=this.scanner.update(center,extra,this.space,viewer,time,forward);
    this.marks.forEach((m,i)=>{const c=this.scanner.currentHits[i];m.visible=!!c;
     if(c){m.position.copy(c.point);m.position.y+=.009;m.rotation.y=i*1.4;
      m.material.color.setHex(c.accepted?0x83ffe3:0xff6b61);}});
    this.net.visible=!!point;
    if(point){
     this.floorGroup.position.copy(point);
     const dist=viewer.distanceTo(point);
     this.net.material.uniforms.reveal.value=THREE.MathUtils.clamp(dist*Math.tan(THREE.MathUtils.degToRad(24))/3,.28,.95);
     this.net.material.uniforms.pulse.value=1;
    }
   }else{
    this.updateAnchors(frame,time,center,viewer);
    this.lastPose=pose;
    // Pixel-locked 2/3-screen aiming ray. NEVER fall back to the centre hit-test,
    // which caused the wall endpoint to jump as the camera moved.
    this.current=this.floorRayHit(pose);
    this.targetLocal=null;
    const kind=this.drawing?.kind;
    if(kind&&['upper','base','window','door'].includes(kind)){
     const wallHit=this.raycastWall(pose,kind==='upper');
     if(wallHit)this.targetLocal=wallHit;
     else if(kind==='upper')this.current=null;
    }
    if(kind==='stove'||kind==='sink'){
     this.targetLocal=this.raycastCabinet(pose);
     if(!this.targetLocal)this.current=null;
    }
    this.updatePreview();
   }
  }
  if(time-this.lastReport>350){
   this.report(!this.locked?(this.scanner.ready?'کف آماده است؛ «تثبیت این کف» را بزن.':'نشانگر را روی کف حرکت بده.'):
    (this.current||this.targetLocal?'نشانگر روی سطح معتبر است؛ نقطه را ثبت کن.':'سطح معتبری زیر نشانگر نیست.'),{tracking:true});
   this.lastReport=time;
  }
  if(this.reflectionDirty&&this.reflectionCamera&&this.locked){
   this.reflectionDirty=false;
   const old=this.renderer.xr.enabled;this.renderer.xr.enabled=false;
   try{
    this.previewGroup.visible=false;
    const cabinets=this.objectGroup.children.filter(n=>n.userData?.cabinet);
    cabinets.forEach(n=>n.visible=false);
    this.reflectionCamera.update(this.renderer,this.scene);
    cabinets.forEach(n=>n.visible=true);
   }catch(error){console.debug('Reflection probe unavailable',error);}
   finally{this.renderer.xr.enabled=old;}
  }
  this.renderer.render(this.scene,this.camera);
  if(this.wideActive){
   try{this.drawWideView(pose);}
   catch(error){this.disableWideView();this.onWideViewError?.('رندر سه‌بعدی واید روی این دستگاه ممکن نشد: '+(error?.message||error));}
  }
 }
 updateAnchors(frame,time,center,viewer){
  for(const hit of floorCandidates(center,this.space,viewer)){
   if(Math.abs(hit.point.y-this.origin.y)>.055)continue;
   if(this.candidates.every(p=>p.distanceTo(hit.point)>.42))this.candidates.push(hit.point.clone());
  }
  if(!frame.createAnchor||!window.XRRigidTransform)return;
  if(this.anchors.length<5&&!this.pending&&!this.scanPromise){
   const p=this.candidates.find(p=>this.anchors.every(a=>a.requested.distanceTo(p)>.42));
   if(p){
    this.pending=true;
    frame.createAnchor(new XRRigidTransform({x:p.x,y:p.y,z:p.z}),this.space)
     .then(anchor=>{if(this.scanPromise){anchor.delete();return;}this.anchors.push({anchor,requested:p.clone()});}).catch(()=>{})
     .finally(()=>{this.pending=false;});
   }
  }
  const samples=[];
  for(let i=0;i<this.anchors.length;i++){
   const a=this.anchors[i],pose=frame.getPose(a.anchor.anchorSpace,this.space);
   if(pose){const p=pose.transform.position;
    samples.push({id:String(i),reference:a.requested.toArray(),observed:[p.x,p.y,p.z]});}
  }
  if(samples.length>=3){
   const fit=this.rig.update(samples,Math.min(.1,Math.max(.001,(time-this.lastTime)/1000)));
   const p=transformPoint(this.origin.toArray(),fit.pose);
   this.basePosition.set(p[0],p[1],p[2]);this.baseYaw=fit.pose.yaw;this._applyAlignment();
  }
  this.lastTime=time;
 }
 /* Exact viewport NDC = x:0 and y:-1/3 (lower third) or +1/3 (upper third).
    Inverse XR projection, not a hardcoded device-specific ray slope. */
 screenRay(pose,upper=false,x=0,y=null){
  if(this.wideActive&&this.wideCamera){
   const camera=this.wideCamera,ndc=new THREE.Vector3(x,y??(upper?1/3:-1/3),.5);
   camera.updateMatrixWorld(true);
   const direction=ndc.unproject(camera).sub(camera.position).normalize();
   return new THREE.Ray(camera.position.clone(),direction);
  }
  const view=pose?.views?.[0];if(!view)return null;
  const inverse=new THREE.Matrix4().fromArray(view.projectionMatrix).invert();
  const local=new THREE.Vector3(x,y??(upper?1/3:-1/3),-1).applyMatrix4(inverse).normalize();
  const q=view.transform.orientation,p=view.transform.position;
  const direction=local.applyQuaternion(new THREE.Quaternion(q.x,q.y,q.z,q.w)).normalize();
  return new THREE.Ray(new THREE.Vector3(p.x,p.y,p.z),direction);
 }
 floorRayHit(pose){
  if(!this.locked||!this.floorGroup)return null;
  const ray=this.screenRay(pose,false);if(!ray||ray.direction.y>=-.0001)return null;
  this.floorGroup.updateWorldMatrix(true,false);
  const floorY=this.floorGroup.getWorldPosition(new THREE.Vector3()).y;
  const distance=(floorY-ray.origin.y)/ray.direction.y;
  if(distance<.05||distance>12)return null;
  return ray.at(distance,new THREE.Vector3());
 }
 raycastCabinet(pose){
  const ray=this.screenRay(pose,false);if(!ray||!this.objectGroup)return null;
  this.floorGroup.updateWorldMatrix(true,true);
  const cabinets=this.objectGroup.children.filter(n=>n.userData?.cabinet);
  const hits=new THREE.Raycaster(ray.origin,ray.direction,.03,12).intersectObjects(cabinets,false);
  const hit=hits[0];if(!hit)return null;
  const host=this.items.find(x=>x.id===hit.object.userData.objectId);
  if(!host)return null;
  const local=this.floorGroup.worldToLocal(hit.point.clone());
  const len=Math.hypot(host.x2-host.x1,host.z2-host.z1),dx=host.x2-host.x1,dz=host.z2-host.z1;
  const t=THREE.MathUtils.clamp(((local.x-host.x1)*dx+(local.z-host.z1)*dz)/(len*len),0,1);
  return {x:host.x1+dx*t,z:host.z1+dz*t};
 }
 raycastWall(pose,upper){
  if(!this.objectGroup||!this.floorGroup)return null;
  const ray=this.screenRay(pose,upper);if(!ray)return null;
  const raycaster=new THREE.Raycaster(ray.origin,ray.direction,.05,12);
  this.floorGroup.updateWorldMatrix(true,true);
  const walls=[];
  this.objectGroup.traverse(n=>{if(n.isMesh&&n.userData.wall)walls.push(n);});
  const hit=raycaster.intersectObjects(walls,false)[0];
  if(!hit)return null;
  const local=this.floorGroup.worldToLocal(hit.point.clone());
  return {x:local.x,z:local.z};
 }
 _clearEdit(group){
  if(!group)return;
  while(group.children.length){
   const child=group.children[0];group.remove(child);
   child.traverse(x=>{x.geometry?.dispose();const mat=x.material;
    if(mat)for(const m of Array.isArray(mat)?mat:[mat]){m.map?.dispose();m.dispose();}});
  }
 }
 _rayFromTouch(clientX,clientY){
  if(!this.locked||!this.lastPose||!this.renderer)return null;
  const r=(this.wideActive&&this.wideRenderer?this.wideRenderer.domElement:this.renderer.domElement).getBoundingClientRect();
  return this.screenRay(this.lastPose,false,(clientX-r.left)/r.width*2-1,1-(clientY-r.top)/r.height*2);
 }
 updateEditHandles(items=this.items){
  if(!this.editGroup)return;
  this._clearEdit(this.editGroup);
  const obj=items?.find(x=>x.id===this.selectedId);if(!obj)return;
  const mark=(side,x,y,z,color)=>{
   const mesh=new THREE.Mesh(new THREE.SphereGeometry(.0525,12,10),
    new THREE.MeshBasicMaterial({color,depthTest:false,transparent:true,opacity:.95}));
   mesh.position.set(x,y,z);mesh.renderOrder=50;
   mesh.userData.editHandle={id:obj.id,side};
   this.editGroup.add(mesh);
  };
  if(obj.kind==='opening'){
   const w=items.find(x=>x.id===obj.hostId);if(!w)return;
   const len=Math.hypot(w.x2-w.x1,w.z2-w.z1),ux=(w.x2-w.x1)/len,uz=(w.z2-w.z1)/len;
   const nx=-uz,nz=ux,offset=this.cameraSideForWall(w)*(w.thickness/2+.06),center=obj.hostT*len;
   const p=(along,y)=>({x:w.x1+ux*along+nx*offset,y,z:w.z1+uz*along+nz*offset});
   const l=center-obj.width/2,r=center+obj.width/2,middle=obj.sill+obj.height/2;
   for(const [side,along,y,c] of [['left',l,middle,0x66d0a7],['right',r,middle,0x66d0a7],
    ['top',center,obj.sill+obj.height,0xf1b366],['centre',center,middle,0xffe2a5]])
    {const v=p(along,y);mark(side,v.x,v.y,v.z,c);}
   if(obj.style!=='door'){const v=p(center,obj.sill);mark('bottom',v.x,v.y,v.z,0xf1b366);}
  }else if(obj.kind==='front'){
   const host=items.find(x=>x.id===obj.hostId),pose=frontPose(obj,host);if(!pose)return;
   const len=Math.hypot(host.x2-host.x1,host.z2-host.z1),ux=(host.x2-host.x1)/len,uz=(host.z2-host.z1)/len;
   const p=(along,y)=>({x:host.x1+ux*along-uz*pose.side*(host.depth/2+.055),
    y,z:host.z1+uz*along+ux*pose.side*(host.depth/2+.055)});
   const mid=(obj.startT+obj.endT)*len/2,centreY=(host.elevation??.08)+host.height*(obj.bottomT+obj.topT)/2;
   const right=p(obj.endT*len,centreY),top=p(mid,(host.elevation??.08)+host.height*obj.topT);
   mark('right',right.x,right.y,right.z,0x48c9a2);
   mark('top',top.x,top.y,top.z,0xf1b366);
  }else if(obj.kind==='cabinet'){
   const w=items.find(x=>x.id===obj.hostId);if(!w)return;
   const len=Math.hypot(w.x2-w.x1,w.z2-w.z1),ux=(w.x2-w.x1)/len,uz=(w.z2-w.z1)/len;
   const nx=-uz,nz=ux,offset=(obj.side||1)*(w.thickness/2+.004+obj.depth/2);
   for(const [side,t] of [['start',obj.startT],['end',obj.endT]])
    mark(side,w.x1+ux*t*len+nx*offset,obj.elevation+obj.height/2,
     w.z1+uz*t*len+nz*offset,0x64d2a5);
    const centre=(obj.startT+obj.endT)*len/2;
    mark('top',w.x1+ux*centre+nx*offset,obj.elevation+obj.height+.015,
     w.z1+uz*centre+nz*offset,0xe9ad63);
    mark('bottom',w.x1+ux*centre+nx*offset,obj.elevation,
     w.z1+uz*centre+nz*offset,0x61b5c1);
  }else if(obj.kind==='equipment'&&obj.subtype!=='hood'){
   mark('move',obj.x,obj.elevation+obj.height*.5,obj.z,0xeab16b);
  }else if(obj.kind==='wall'){
   mark('start',obj.x1,.15,obj.z1,0x64d2a5);
   mark('end',obj.x2,.15,obj.z2,0x64d2a5);
  }
 }
 pickCalibrationHandle(clientX,clientY){
  if(!this.locked||!this.ruler?.visible||!this.lastPose||!this.renderer)return null;
  // Chido's screen-space hit testing tolerates fingers over the visible A/B badges,
  // even where a world-space XR ray misses their small physical spheres.
  const matrices=this.activeViewMatrices(),rect=(this.wideActive&&this.wideRenderer?this.wideRenderer.domElement:this.renderer.domElement).getBoundingClientRect();
  if(matrices&&rect.width&&rect.height){
   this.floorGroup.updateWorldMatrix(true,true);
   const {cameraView,projection}=matrices;
   let nearest=null,distance=65;
   for(const [name,mark] of [['a',this.markA],['b',this.markB]]){
    if(!mark?.visible)continue;
    for(const height of [0,.16]){
     const world=mark.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,height,0));
     const clip=world.applyMatrix4(cameraView).applyMatrix4(projection);
     if(clip.z<-.8||clip.z>1.1||Math.abs(clip.x)>1.2||Math.abs(clip.y)>1.2)continue;
     const sx=rect.left+(clip.x+1)*rect.width/2,sy=rect.top+(1-clip.y)*rect.height/2;
     const d=Math.hypot(sx-clientX,sy-clientY);
     if(d<distance){distance=d;nearest=name;}
    }
   }
   if(nearest)return nearest;
  }
  const ray=this._rayFromTouch(clientX,clientY);if(!ray)return null;
  const hit=new THREE.Raycaster(ray.origin,ray.direction,.04,12)
   .intersectObjects([this.markA,this.markB],true)[0];
  return hit?.object.userData.calibration||hit?.object.parent?.userData.calibration||null;
 }
 _calibrationFloorPoint(clientX,clientY){
  const ray=this._rayFromTouch(clientX,clientY);
  if(!ray||!this.locked||Math.abs(ray.direction.y)<.001)return null;
  this.floorGroup.updateWorldMatrix(true,false);
  const y=this.floorGroup.getWorldPosition(new THREE.Vector3()).y;
  const distance=(y-ray.origin.y)/ray.direction.y;
  if(distance<.05||distance>14)return null;
  const local=this.floorGroup.worldToLocal(ray.at(distance,new THREE.Vector3()));
  local.y=0;return local;
 }
 dragEquipmentPoint(clientX,clientY){
  const p=this._calibrationFloorPoint(clientX,clientY);
  return p?{x:p.x,z:p.z}:null;
 }
 beginCalibrationDrag(clientX,clientY,which){
  this.calibrationOffset=null;
  const at=this._calibrationFloorPoint(clientX,clientY),old=this.points[which];
  if(at&&old)this.calibrationOffset=old.clone().sub(at);
 }
 endCalibrationDrag(){this.calibrationOffset=null;}
 dragCalibrationPoint(clientX,clientY,which){
  const local=this._calibrationFloorPoint(clientX,clientY);
  if(!local||!['a','b'].includes(which)||!this.points.a||!this.points.b||!this.basePosition)return false;
  if(this.calibrationOffset)local.add(this.calibrationOffset);
  this.floorGroup.updateWorldMatrix(true,false);
  const target=this._basePoint(this.floorGroup.localToWorld(local.clone()));
  const a=this.points.a,b=this.points.b;
  if(which==='a'){
   const rotated=a.clone().multiplyScalar(this.alignment.scale)
    .applyAxisAngle(new THREE.Vector3(0,1,0),this.alignment.yaw);
   this.alignment.x=target.x-rotated.x;this.alignment.z=target.z-rotated.z;
  }else{
   const baseA=this._alignedBasePoint(a),wanted=target.clone().sub(baseA),reference=b.clone().sub(a);
   const distance=wanted.length(),original=reference.length();
   if(distance<.1||original<.1)return false;
   const scale=distance/original;
   if(scale<.8||scale>1.2){this.report('برای تثبیت دقیق، فاصله A/B را در محدوده ۲۰٪ اندازه مرجع بگذار.');return false;}
   this.alignment.scale=scale;
   this.alignment.yaw=Math.atan2(reference.z,reference.x)-Math.atan2(wanted.z,wanted.x);
   const rotated=a.clone().multiplyScalar(scale)
    .applyAxisAngle(new THREE.Vector3(0,1,0),this.alignment.yaw);
   this.alignment.x=baseA.x-rotated.x;this.alignment.z=baseA.z-rotated.z;
  }
  this._applyAlignment();
  this.report('مرجع A/B کل پروژه را جابه‌جا و هم‌جهت می‌کند.',{distance:a.distanceTo(b),
   projectAlignment:{...this.alignment}});
  return true;
 }
 pickHandle(clientX,clientY){
  if(!this.editGroup||!this.lastPose||!this.renderer)return null;
  const matrices=this.activeViewMatrices(),rect=(this.wideActive&&this.wideRenderer?this.wideRenderer.domElement:this.renderer.domElement).getBoundingClientRect();
  if(matrices&&rect.width&&rect.height){
   this.floorGroup.updateWorldMatrix(true,true);
   const {cameraView,projection}=matrices;
   let nearest=null,distance=60;
   for(const marker of this.editGroup.children){
    const pos=marker.getWorldPosition(new THREE.Vector3()).applyMatrix4(cameraView).applyMatrix4(projection);
    if(pos.z<-.8||pos.z>1.1||Math.abs(pos.x)>1.2||Math.abs(pos.y)>1.2)continue;
    const sx=rect.left+(pos.x+1)*rect.width/2,sy=rect.top+(1-pos.y)*rect.height/2;
    const d=Math.hypot(sx-clientX,sy-clientY);
    if(d<distance){distance=d;nearest=marker.userData.editHandle;}
   }
   if(nearest)return nearest;
  }
  const ray=this._rayFromTouch(clientX,clientY);if(!ray)return null;
  return new THREE.Raycaster(ray.origin,ray.direction,.04,15)
   .intersectObjects(this.editGroup.children,true)[0]?.object.userData.editHandle||null;
 }
 dragScreenHandlePoint(clientX,clientY,drag){
  const o=drag.originalItems?.find(v=>v.id===drag.id);
  const w=o?.kind==='wall'?o:drag.originalItems?.find(v=>v.id===o?.hostId);
  const matrices=this.activeViewMatrices(),rect=(this.wideActive&&this.wideRenderer?this.wideRenderer.domElement:this.renderer?.domElement)?.getBoundingClientRect();
  if(!w||!matrices||!rect?.width||!rect?.height||!this.floorGroup)return null;
  const len=Math.hypot(w.x2-w.x1,w.z2-w.z1);if(len<.001)return null;
  const ux=(w.x2-w.x1)/len,uz=(w.z2-w.z1)/len;
  this.floorGroup.updateWorldMatrix(true,false);
  const {cameraView:toView,projection}=matrices,world=this.floorGroup.matrixWorld;
  const initial=drag.initial,along=initial.along??0,y=initial.y??.7;
  const project=(a,b)=>{
   const v=new THREE.Vector3(w.x1+ux*a,b,w.z1+uz*a).applyMatrix4(world).applyMatrix4(toView).applyMatrix4(projection);
   return {x:v.x*rect.width/2,y:-v.y*rect.height/2};
  };
  const p=project(along,y),q=project(along+1,y),v=project(along,y+1);
  const ax=q.x-p.x,ay=q.y-p.y,bx=v.x-p.x,by=v.y-p.y;
  const dx=clientX-drag.startClientX,dy=clientY-drag.startClientY;
  const dot=(x,z)=>x*dx+z*dy;
  let da=0,db=0;
  if(['left','right','start','end'].includes(drag.side)){
   const sq=ax*ax+ay*ay;if(sq<25)return null;da=dot(ax,ay)/sq;
  }else if(['top','bottom'].includes(drag.side)){
   const sq=bx*bx+by*by;if(sq<25)return null;db=dot(bx,by)/sq;
  }else{
   const det=ax*by-ay*bx;
   if(Math.abs(det)<100)return null;
   da=(dx*by-dy*bx)/det;db=(ax*dy-ay*dx)/det;
  }
  return {along:along+da,y:y+db,x:w.x1+ux*(along+da),z:w.z1+uz*(along+da)};
 }
 dragHandlePoint(clientX,clientY,id){
  const ray=this._rayFromTouch(clientX,clientY),o=this.items.find(x=>x.id===id);
  if(!ray||!o)return null;
  const w=o.kind==='wall'?o:this.items.find(x=>x.id===o.hostId);if(!w)return null;
  const len=Math.hypot(w.x2-w.x1,w.z2-w.z1),ux=(w.x2-w.x1)/len,uz=(w.z2-w.z1)/len;
  const nx=-uz,nz=ux,offset=o.kind==='opening'?this.cameraSideForWall(w)*(w.thickness/2+.06):
   o.kind==='cabinet'?(o.side||1)*(w.thickness/2+.004+o.depth/2):
   o.kind==='front'?(w.side||1)*(w.depth/2+.06):0;
  this.floorGroup.updateWorldMatrix(true,false);
  const inverse=this.floorGroup.matrixWorld.clone().invert();
  const from=ray.origin.clone().applyMatrix4(inverse),
   dir=ray.direction.clone().transformDirection(inverse),den=dir.x*nx+dir.z*nz;
  if(Math.abs(den)<.002)return null;
  const distance=((w.x1+nx*offset-from.x)*nx+(w.z1+nz*offset-from.z)*nz)/den;
  if(distance<.05||distance>18)return null;
  const hit=from.addScaledVector(dir,distance),along=(hit.x-w.x1)*ux+(hit.z-w.z1)*uz;
  return {along,y:hit.y,x:hit.x,z:hit.z};
 }
 _editLabel(text,x,y,z){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=64;
  const c=canvas.getContext('2d');c.fillStyle='#f7f5eb';c.fillRect(0,0,512,64);
  c.strokeStyle='#69a995';c.strokeRect(2,2,508,60);c.fillStyle='#244d40';
  c.font='bold 30px Tahoma';c.textAlign='center';c.textBaseline='middle';c.fillText(text,256,32);
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),
   depthTest:false,transparent:true}));sprite.position.set(x,y,z);sprite.scale.set(1.28,.18,1);
  sprite.renderOrder=55;this.editPreviewGroup.add(sprite);
 }
 setEditPreview(items,id,side,visible){
  if(!this.editPreviewGroup)return;
  this._clearEdit(this.editPreviewGroup);
  if(!visible||!items){this.updateEditHandles();return;}
  const o=items.find(x=>x.id===id);if(!o)return;
  this.updateEditHandles(items);
  const mat=new THREE.MeshBasicMaterial({color:0x61c5a3,opacity:.36,transparent:true,
   depthTest:false,depthWrite:false,side:THREE.DoubleSide});
  const box=(width,height,depth,x,y,z,angle)=>{
   const mesh=new THREE.Mesh(new THREE.BoxGeometry(Math.max(.02,width),Math.max(.02,height),depth),mat);
   mesh.position.set(x,y,z);mesh.rotation.y=-angle;mesh.renderOrder=40;this.editPreviewGroup.add(mesh);
  };
  const label=(t,x,y,z)=>this._editLabel(t,x,y,z);
  const measure=(a,b,color=0xeab16b)=>{
   const geometry=new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(a.x,a.y,a.z),new THREE.Vector3(b.x,b.y,b.z)]);
   const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color,depthTest:false}));
   line.renderOrder=54;this.editPreviewGroup.add(line);
  };
  if(o.kind==='opening'){
   const w=items.find(x=>x.id===o.hostId);if(!w)return;
   const len=Math.hypot(w.x2-w.x1,w.z2-w.z1),ux=(w.x2-w.x1)/len,uz=(w.z2-w.z1)/len;
   const nx=-uz,nz=ux,offset=this.cameraSideForWall(w)*(w.thickness/2+.09),t=o.hostT*len;
   const x=w.x1+ux*t+nx*offset,z=w.z1+uz*t+nz*offset;
   box(o.width,o.height,.018,x,o.sill+o.height/2,z,Math.atan2(uz,ux));
   label('عرض '+o.width.toFixed(2)+' m',x,o.sill+o.height+.24,z);
   label('ارتفاع '+o.height.toFixed(2)+' m',x+.28,o.sill+o.height/2,z+.28);
   label('کف '+o.sill.toFixed(2)+' m',x-.28,Math.max(.15,o.sill/2),z-.28);
   const at=(along,y,depth=offset+.03)=>({x:w.x1+ux*along+nx*depth,y,z:w.z1+uz*along+nz*depth});
   const left=t-o.width/2,right=t+o.width/2,top=o.sill+o.height;
   measure(at(t,0),at(t,o.sill)); // Floor-to-sill dimension.
   measure(at(right+.11,o.sill),at(right+.11,top));
   measure(at(left,top+.13),at(right,top+.13));
   const gaps=neighborGaps(items,o);
   if(gaps){
    if(gaps.before.gap>.015){
     measure(at(gaps.before.at,top+.30),at(left,top+.30),0x76d4b4);
     label('تا '+gaps.before.label+' '+gaps.before.gap.toFixed(2)+' m',
      at((gaps.before.at+left)/2,top+.52).x,top+.52,at((gaps.before.at+left)/2,top+.52).z);
    }
    if(gaps.after.gap>.015){
     measure(at(right,top+.30),at(gaps.after.at,top+.30),0x76d4b4);
     label('تا '+gaps.after.label+' '+gaps.after.gap.toFixed(2)+' m',
      at((right+gaps.after.at)/2,top+.52).x,top+.52,at((right+gaps.after.at)/2,top+.52).z);
    }
   }
  }else if(o.kind==='front'){
   const host=items.find(x=>x.id===o.hostId),pose=frontPose(o,host);
   if(!pose)return;
   box(pose.width,pose.height,.025,pose.x,pose.y,pose.z,pose.angle);
   label('عرض '+(pose.width+(o.gap??.003)).toFixed(2)+' m',pose.x,pose.y+pose.height/2+.17,pose.z);
   label('ارتفاع '+(pose.height+(o.gap??.003)).toFixed(2)+' m',pose.x+.18,pose.y,pose.z+.14);
  }else if(o.kind==='cabinet'){
   const len=Math.hypot(o.x2-o.x1,o.z2-o.z1),angle=Math.atan2(o.z2-o.z1,o.x2-o.x1);
   box(len,o.height,o.depth,(o.x1+o.x2)/2,o.elevation+o.height/2,(o.z1+o.z2)/2,angle);
   label('طول '+len.toFixed(2)+' m',(o.x1+o.x2)/2,o.elevation+o.height+.24,(o.z1+o.z2)/2);
    label('ارتفاع '+o.height.toFixed(2)+' m',(o.x1+o.x2)/2+.26,o.elevation+o.height/2,(o.z1+o.z2)/2+.24);
    label('از کف '+o.elevation.toFixed(2)+' m',(o.x1+o.x2)/2-.26,Math.max(.17,o.elevation/2),(o.z1+o.z2)/2-.24);
  }else if(o.kind==='equipment'){
   box(o.width,o.height,o.depth,o.x,o.elevation+o.height/2,o.z,o.rotation||0);
   label(o.name+' · '+o.width.toFixed(2)+' m',o.x,o.elevation+o.height+.20,o.z);
  }else if(o.kind==='wall'){
   const len=Math.hypot(o.x2-o.x1,o.z2-o.z1);
   box(len,o.height,o.thickness,(o.x1+o.x2)/2,o.height/2,(o.z1+o.z2)/2,Math.atan2(o.z2-o.z1,o.x2-o.x1));
   label('طول '+len.toFixed(2)+' m',(o.x1+o.x2)/2,o.height+.22,(o.z1+o.z2)/2);
  }
 }
 pickObject(clientX,clientY){
  if(!this.locked||!this.lastPose||!this.objectGroup)return null;
  const wide=!!this.wideActive&&!!this.wideCamera&&!!this.wideRenderer;
  const rect=(wide?this.wideRenderer.domElement:this.renderer.domElement).getBoundingClientRect();
  const x=(clientX-rect.left)/rect.width*2-1,y=1-(clientY-rect.top)/rect.height*2;
  let caster;
  if(wide){
   this.wideCamera.updateMatrixWorld(true);
   caster=new THREE.Raycaster();caster.setFromCamera(new THREE.Vector2(x,y),this.wideCamera);
   caster.near=.05;caster.far=12;
  }else{
   const ray=this.screenRay(this.lastPose,false,x,y);if(!ray)return null;
   caster=new THREE.Raycaster(ray.origin,ray.direction,.05,12);
  }
  this.objectGroup.updateWorldMatrix(true,true);
  const hits=caster.intersectObjects(this.objectGroup.children,true);
  for(const hit of hits){
   if(!pickable(hit.object))continue;
   for(let node=hit.object;node;node=node.parent)if(node.userData?.objectId)return node.userData.objectId;
  }
  return null;
 }
 pick(){
  if(!this.locked||!this.floorGroup)return null;
  let point=this.targetLocal?{...this.targetLocal}:null;
  if(!point){
   if(!this.current)return null;
   this.floorGroup.updateWorldMatrix(true,false);
   const v=this.floorGroup.worldToLocal(this.current.clone());
   point={x:v.x,z:v.z};
  }
  if(['base','upper','tall'].includes(this.drawing?.kind))
   return snapCabinetPoint(this.items,point.x,point.z,.85)||point;
  return point;
 }
 setItems(items,selectedId=null){
  if(items===this.itemsSource){this.setSelection(selectedId);return;}
  const signature=JSON.stringify(items||[]);
  this.itemsSource=items;
  if(signature===this.itemsSignature){this.setSelection(selectedId);return;}
  const previousCount=this.items?.length||0;
  this.itemsSignature=signature;this.items=structuredClone(items||[]);
  if(this.previewRenderer&&previousCount!==this.items.length)this.fitPreview();
  this.selectedId=selectedId;this.previewVersion=(this.previewVersion||0)+1;this.rebuildObjects();
 }
 // Apply a complete semantic scene snapshot in one pass. Style changes used to
 // trigger one full rebuild per items/materials/tiles setter, each rebaking AO.
 setSceneState(items,selectedId,materials={},tileLayout={}){
  const sourceUnchanged=items===this.itemsSource;
  const signature=sourceUnchanged?this.itemsSignature:JSON.stringify(items||[]);
  const nextMaterials={...DEFAULT_MATERIALS,...materials};
  const nextTiles=validateTileLayout(tileLayout);
  const geometryChanged=signature!==this.itemsSignature;
  const appearanceChanged=JSON.stringify(nextMaterials)!==JSON.stringify(this.materialSettings)||
   JSON.stringify(nextTiles)!==JSON.stringify(this.tileLayout);
  this.itemsSource=items;
  if(!geometryChanged&&!appearanceChanged){this.setSelection(selectedId);return;}
  const previousCount=this.items?.length||0;
  if(geometryChanged){
   this.itemsSignature=signature;this.items=structuredClone(items||[]);
   if(this.previewRenderer&&previousCount!==this.items.length)this.fitPreview();
  }
  this.materialSettings=nextMaterials;this.tileLayout=nextTiles;
  this.selectedId=selectedId;this.previewVersion=(this.previewVersion||0)+1;
  this.rebuildObjects();
 }
 // Selection only changes emissive accents and edit grips. Rebuilding the full
 // mesh here used to trigger thousands of raycast AO checks on every tap.
 clearSelectionHighlight(){
  for(const entry of this.selectionHighlights||[]){
   entry.mesh.material=entry.original;
   for(const material of entry.temporary)material.dispose();
  }
  this.selectionHighlights=[];
 }
 highlightSelection(){
  if(!this.selectedId||!this.objectGroup)return;
  this.selectionHighlights=[];
  const accent=new THREE.Color(0x44b88c);
  this.objectGroup.traverse(mesh=>{
   if(!mesh.isMesh||!mesh.material)return;
   let owner=mesh;
   while(owner&&owner!==this.objectGroup&&!owner.userData?.objectId)owner=owner.parent;
   if(owner?.userData?.objectId!==this.selectedId)return;
   const original=mesh.material,materials=Array.isArray(original)?original:[original];
   const temporary=materials.map(material=>{
    const clone=material.clone();
    if(clone.emissive){clone.emissive.copy(accent);clone.emissiveIntensity=.27;}
    else if(clone.color)clone.color.lerp(accent,.25);
    return clone;
   });
   mesh.material=Array.isArray(original)?temporary:temporary[0];
   this.selectionHighlights.push({mesh,original,temporary});
  });
 }
 setSelection(selectedId=null){
  if(selectedId===this.selectedId)return;
  this.clearSelectionHighlight();
  this.selectedId=selectedId;
  this.highlightSelection();
  this.updateEditHandles();
  this.renderPreview();
 }
 setFacadesHidden(hidden){
  const next=!!hidden;
  if(next===this.facadesHidden)return;
  this.facadesHidden=next;
  for(const root of this.frontRoots)root.visible=!next;
  // Visibility is view state: no remeshing, AO, project mutation or undo step.
  this.renderPreview();
 }
 setRoomSurfaces(visible=false,height=3.6){
  const nextHeight=Math.max(2,Math.min(9,Number(height)||3.6));
  const changed=Math.abs(nextHeight-this.ceilingHeight)>.001;
  if(!changed&&this.roomSurfaceGroup?.visible===!!visible)return;
  this.roomSurfacesVisible=!!visible;this.ceilingHeight=nextHeight;
  if(changed)this.buildRoomSurfaces();
  if(this.roomSurfaceGroup)this.roomSurfaceGroup.visible=this.roomSurfacesVisible;
  this.renderPreview();
 }
 buildRoomSurfaces(){
  if(!this.floorGroup)return;
  const signature=JSON.stringify(this.items.filter(o=>o.kind==='wall').map(w=>
   [w.id,w.x1,w.z1,w.x2,w.z2]))+'|'+this.ceilingHeight;
  if(this.roomSurfaceGroup?.parent===this.floorGroup&&this.roomSurfaceSignature===signature)return;
  this.roomSurfaceSignature=signature;
  if(this.roomSurfaceGroup){this.roomSurfaceGroup.traverse(m=>{m.geometry?.dispose();m.material?.map?.dispose();m.material?.dispose();});this.floorGroup.remove(this.roomSurfaceGroup);}
  const group=new THREE.Group();group.visible=this.roomSurfacesVisible;this.floorGroup.add(group);this.roomSurfaceGroup=group;
  const polygon=roomOutline(this.items);
  if(polygon.length<3)return;
  const outline=new THREE.Shape();polygon.forEach((p,i)=>i?outline.lineTo(p.x,p.z):outline.moveTo(p.x,p.z));outline.closePath();
  const geometry=new THREE.ShapeGeometry(outline);geometry.rotateX(Math.PI/2);
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#eee9da';ctx.fillRect(0,0,128,128);
  ctx.fillStyle='#cfc8b8';ctx.fillRect(0,0,2,128);ctx.fillRect(0,0,128,2);
  ctx.fillStyle='rgba(255,255,255,.17)';ctx.fillRect(3,3,122,122);
  const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.colorSpace=THREE.SRGBColorSpace;
  const tile=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({map:texture,roughness:.83,side:THREE.DoubleSide}));
  tile.position.y=-.012;tile.receiveShadow=true;group.add(tile);
  const roof=new THREE.Mesh(geometry.clone(),new THREE.MeshStandardMaterial({color:0xf7f5ee,roughness:.94,side:THREE.DoubleSide}));
  roof.position.y=this.ceilingHeight;roof.receiveShadow=true;group.add(roof);
 }
 setWindowResizeActive(id,active){
  if(this.windowRestoreTimer){clearTimeout(this.windowRestoreTimer);this.windowRestoreTimer=null;}
  if(active)this.resizingWindowId=id;
  const update=visible=>this.objectGroup?.traverse(m=>{if(m.userData?.windowGlassId===id)m.visible=visible;});
  update(false);
  if(!active)this.windowRestoreTimer=setTimeout(()=>{
   if(this.resizingWindowId===id){this.resizingWindowId=null;update(true);this.renderPreview();}
  },1000);
  this.renderPreview();
 }
 applyFrontFraction(control,fraction){
  const {root,pivot,pose,host,panel,tray}=control;
  control.fraction=fraction;
  if(panel.subtype==='drawer'){
   const slide=Math.min(host.depth*.70,.38)*fraction;
   root.position.set(pose.x-Math.sin(pose.angle)*pose.side*slide,pose.y,
    pose.z+Math.cos(pose.angle)*pose.side*slide);
   if(tray)tray.position.copy(root.position);
  }else if(pivot){
   if(panel.hinge==='top')pivot.rotation.x=-pose.side*fraction*Math.PI*.48;
   else pivot.rotation.y=(panel.hinge==='right'?1:-1)*pose.side*fraction*Math.PI*.49;
  }
 }
 animateFront(id,to){
  const control=this.frontControls.get(id);if(!control)return;
  this.frontMotions.set(id,{from:control.fraction,to,start:performance.now(),duration:to?420:520});
  if(this.frontAnimationFrame)return;
  const tick=now=>{
   this.frontAnimationFrame=null;
   for(const [key,motion] of this.frontMotions){
    const current=this.frontControls.get(key);
    if(!current){this.frontMotions.delete(key);continue;}
    const t=Math.min(1,Math.max(0,(now-motion.start)/motion.duration));
    // Cubic ease-out produces a deliberately slow, soft-closing final motion.
    const eased=1-(1-t)**3;
    this.applyFrontFraction(current,motion.from+(motion.to-motion.from)*eased);
    if(t>=1)this.frontMotions.delete(key);
   }
   if(this.previewRenderer&&this.previewCamera)this.previewRenderer.render(this.previewScene,this.previewCamera);
   if(this.frontMotions.size)this.frontAnimationFrame=requestAnimationFrame(tick);
  };
  this.frontAnimationFrame=requestAnimationFrame(tick);
 }
 syncFrontOpeningState(items){
  const before=new Map(this.items.filter(f=>f.kind==='front').map(f=>[f.id,f.openFraction||0]));
  this.itemsSource=items;this.itemsSignature=JSON.stringify(items);this.items=structuredClone(items);
  for(const f of this.items.filter(f=>f.kind==='front')){
   const previous=before.get(f.id)||0,next=f.openFraction||0;
   if(Math.abs(previous-next)>.001)this.animateFront(f.id,next);
  }
 }
 setMaterials(materials={}){
  const next={...DEFAULT_MATERIALS,...materials};
  if(JSON.stringify(next)===JSON.stringify(this.materialSettings))return;
  this.materialSettings=next;this.rebuildObjects();
 }
 setTileLayout(config={}){
  const next=validateTileLayout(config);
  if(JSON.stringify(next)===JSON.stringify(this.tileLayout))return;
  this.tileLayout=next;this.rebuildObjects();
 }
 surfaceTexture(category,id,width,height,grainDirection='auto'){
  const info=materialFor(category,id);if(!info?.file)return null;
  const path=assetUrl(info.file);
  if(!this.textureCache.has(path)){
   const texture=new THREE.TextureLoader().load(path,()=>{
    // Several materials can finish loading in the same frame. Rebuild only once.
    if(this.objectGroup&&!this.textureRebuildScheduled){
     this.textureRebuildScheduled=true;
     requestAnimationFrame(()=>{
      this.textureRebuildScheduled=false;
      if(this.objectGroup)this.rebuildObjects();
     });
    }
   },undefined,()=>console.warn('Kitchyar texture unavailable:',path));
   texture.colorSpace=THREE.SRGBColorSpace;
   texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
   this.textureCache.set(path,texture);
  }
  // Reuse one GPU texture for every panel; physical repeats and grain direction
  // are represented in mesh UVs, never by cloning a texture per door/drawer.
  return this.textureCache.get(path);
 }
 surfaceMaterial(category,id,width,height,grainDirection='auto'){
  const info=materialFor(category,id);
  const isCounter=category==='counter',isTile=category==='backsplash';
  const surface=new THREE.MeshPhysicalMaterial({
   color:info?.color??0xffffff,map:this.surfaceTexture(category,id,width,height,grainDirection),
   roughness:isCounter?.27:isTile?.42:info?.wood?.52:.46,metalness:isCounter?.04:0,
   clearcoat:isCounter?.19:.06,clearcoatRoughness:.27,
   envMap:this.reflectionRT?.texture,envMapIntensity:isCounter?.10:this.renderSettings.reflection
  });
  if(info?.file)surface.userData={textureScale:info.wood?.65:isTile?.50:1.15,
   horizontal:!!info.wood&&grainDirection==='horizontal'};
  return surface;
 }
 applySurfaceUV(geometry,mat,width,height,depth){
  const scale=mat?.userData?.textureScale;if(!scale)return geometry;
  const uv=geometry.getAttribute('uv');if(!uv||uv.count!==24)return geometry;
  const faces=[[depth,height],[depth,height],[width,depth],[width,depth],[width,height],[width,height]];
  for(let face=0;face<6;face++)for(let i=0;i<4;i++){
   const j=face*4+i,u=uv.getX(j),v=uv.getY(j),[w,h]=faces[face];
   if(mat.userData.horizontal)uv.setXY(j,v*h/scale,u*w/scale);
   else uv.setXY(j,u*w/scale,v*h/scale);
  }
  uv.needsUpdate=true;return geometry;
 }
 /* Desktop preview shares the exact AR object mesher/materials. It does not
    pretend to be a tracked AR session and remains available without ARCore. */
 startPreview(host){
  if(this.previewRenderer)return;
  this.previewHost=host;this.previewScene=new THREE.Scene();this.previewScene.background=new THREE.Color(0xe9ede8);
  this.floorGroup=new THREE.Group();this.objectGroup=new THREE.Group();
  this.floorGroup.add(this.objectGroup);this.previewScene.add(this.floorGroup);
  const grid=new THREE.GridHelper(24,120,0xb3c2b6,0xd5ddd4);grid.position.y=-.012;
  this.previewScene.add(grid);
  this.previewCamera=new THREE.PerspectiveCamera(46,1,.02,100);
  this.previewOrbit={x:0,y:.72,radius:6,yaw:.72,pitch:.56};
  this.sun=new THREE.DirectionalLight(0xfff7ec,2);this.sun.position.set(4,7,3);
  this.sun.castShadow=true;this.sun.shadow.mapSize.set(1024,1024);
  this.sun.shadow.camera.left=-10;this.sun.shadow.camera.right=10;
  this.sun.shadow.camera.top=10;this.sun.shadow.camera.bottom=-10;
  this.previewScene.add(this.sun,this.sun.target);
  this.ambient=new THREE.HemisphereLight(0xe7f2fb,0xa59b8c,1.35);this.previewScene.add(this.ambient);
  this.previewRenderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'default'});
  this.previewRenderer.shadowMap.enabled=true;
  this.previewRenderer.shadowMap.type=THREE.PCFSoftShadowMap;
  this.previewRenderer.outputColorSpace=THREE.SRGBColorSpace;
  this.previewRenderer.domElement.className='preview-3d-canvas';
  host.appendChild(this.previewRenderer.domElement);
  const canvas=this.previewRenderer.domElement;
  canvas.addEventListener('pointerdown',e=>{
   this.previewDrag={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};
   try{canvas.setPointerCapture(e.pointerId);}catch{}
  });
  canvas.addEventListener('pointermove',e=>{
   const d=this.previewDrag;if(!d||d.id!==e.pointerId)return;
   const dx=e.clientX-d.x,dy=e.clientY-d.y;
   if(Math.abs(dx)+Math.abs(dy)>2)d.moved=true;
   this.previewOrbit.yaw-=dx*.006;
   this.previewOrbit.pitch=THREE.MathUtils.clamp(this.previewOrbit.pitch+dy*.005,.12,1.42);
   d.x=e.clientX;d.y=e.clientY;this.renderPreview();
  });
  canvas.addEventListener('pointerup',e=>{if(this.previewDrag?.id===e.pointerId){
   this.previewWasDragged=this.previewDrag.moved;this.previewDrag=null;
  }});
  canvas.addEventListener('wheel',e=>{
   e.preventDefault();this.previewOrbit.radius=THREE.MathUtils.clamp(this.previewOrbit.radius*(e.deltaY>0?1.1:.9),1.5,25);
   this.renderPreview();
  },{passive:false});
  if(typeof ResizeObserver!=='undefined'){
   this.previewResize=new ResizeObserver(()=>this.renderPreview());this.previewResize.observe(host);
  }
  this.fitPreview();this.rebuildObjects();this.setLighting(this.renderSettings);this.renderPreview();
 }
 fitPreview(){
  if(!this.previewOrbit)return;
  const vertices=[];
  for(const o of this.items)if(['wall','cabinet'].includes(o.kind)){
   vertices.push([o.x1,o.z1],[o.x2,o.z2]);
  }else if(o.kind==='equipment')vertices.push([o.x,o.z]);
  if(!vertices.length)return;
  const xs=vertices.map(p=>p[0]),zs=vertices.map(p=>p[1]);
  this.previewOrbit.x=(Math.min(...xs)+Math.max(...xs))/2;
  this.previewOrbit.z=(Math.min(...zs)+Math.max(...zs))/2;
  this.previewOrbit.radius=Math.max(3.5,(Math.max(...xs)-Math.min(...xs)+Math.max(...zs)-Math.min(...zs))*.85+2);
 }
 renderPreview(){
  if(!this.previewRenderer||!this.previewCamera||!this.previewHost)return;
  const rect=this.previewHost.getBoundingClientRect(),w=Math.max(1,rect.width),h=Math.max(1,rect.height);
  this.previewRenderer.setSize(w,h,false);this.previewCamera.aspect=w/h;this.previewCamera.updateProjectionMatrix();
  const o=this.previewOrbit,r=o.radius;
  this.previewCamera.position.set(o.x+r*Math.cos(o.pitch)*Math.cos(o.yaw),o.y+r*Math.sin(o.pitch),
   (o.z||0)+r*Math.cos(o.pitch)*Math.sin(o.yaw));
  this.previewCamera.lookAt(o.x,o.y,o.z||0);this.previewRenderer.render(this.previewScene,this.previewCamera);
 }
 previewRay(clientX,clientY){
  if(!this.previewRenderer)return null;
  const r=this.previewRenderer.domElement.getBoundingClientRect();
  const mouse=new THREE.Vector2((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1);
  const ray=new THREE.Raycaster();ray.setFromCamera(mouse,this.previewCamera);return ray;
 }
 pickPreviewObject(clientX,clientY){
  if(this.previewWasDragged){this.previewWasDragged=false;return null;}
  const hits=this.previewRay(clientX,clientY)?.intersectObjects(this.objectGroup?.children||[],true)||[];
  for(const hit of hits){if(!pickable(hit.object))continue;
   let mesh=hit.object;while(mesh){if(mesh.userData?.objectId)return mesh.userData.objectId;mesh=mesh.parent;}}
  return null;
 }
 pickPreviewPoint(clientX,clientY){
  const ray=this.previewRay(clientX,clientY),point=new THREE.Vector3();
  return ray?.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),point)?{x:point.x,z:point.z}:null;
 }
 stopPreview(){
  if(this.frontAnimationFrame)cancelAnimationFrame(this.frontAnimationFrame);
  this.frontAnimationFrame=null;this.frontMotions.clear();this.frontControls.clear();
  this.clearSelectionHighlight();
  this.previewResize?.disconnect();this.previewRenderer?.dispose();this.previewRenderer?.domElement.remove();
  this.previewRenderer=null;this.previewHost=null;this.previewScene=null;this.objectGroup=null;this.floorGroup=null;
 }
 setLighting(options={}){
  const before=this.renderSettings||{},next={...before,...options};
  const changed=next.aoStrength!==before.aoStrength||next.reflection!==before.reflection||
   next.taskLighting!==before.taskLighting||next.taskIntensity!==before.taskIntensity;
  const lightingChanged=next.sunAzimuth!==before.sunAzimuth||next.sunElevation!==before.sunElevation||
   next.sunIntensity!==before.sunIntensity||next.ambientIntensity!==before.ambientIntensity;
  this.renderSettings=next;
  if(this.sun&&lightingChanged){
   const az=THREE.MathUtils.degToRad(next.sunAzimuth),el=THREE.MathUtils.degToRad(next.sunElevation);
   const r=8;this.sun.position.set(r*Math.cos(el)*Math.cos(az),r*Math.sin(el),r*Math.cos(el)*Math.sin(az));
   this.sun.intensity=next.sunIntensity;this.sun.target.position.set(0,0,0);
   this.sun.shadow.needsUpdate=true;this.ambient.intensity=next.ambientIntensity;
  }
  if(changed)this.rebuildObjects();
 }
 setDrawing(start,kind,options={}){
  this.drawing=kind?{start,kind,...options}:null;
  if(!kind&&this.previewGroup)this.previewGroup.visible=false;
 }
 updatePreview(){
  if(!this.previewGroup)return;
  const group=this.previewGroup;
  if(!this.drawing){group.visible=false;this.frontPreviewKey=null;return;}
  const p=this.pick();if(!p){group.visible=false;return;}
  const kind=this.drawing.kind,a=this.drawing.start;
  if(kind.startsWith('front-')){
   const c=this.items.find(o=>o.id===this.drawing.hostId&&o.kind==='cabinet')||nearestCabinet(this.items,p)?.cabinet;
   const key=kind+':'+(kind==='front-smart'?'all':c?.id)+':'+this.previewVersion;
   if(key===this.frontPreviewKey){group.visible=true;return;}
   this.frontPreviewKey=key;
  }else this.frontPreviewKey=null;
  while(group.children.length){const c=group.children[0];group.remove(c);c.geometry?.dispose();c.material?.dispose();}
  let from=a||p,to=p,width,level=0,height,colour;
  if((kind==='base'||kind==='upper')&&a){
   const snapped=snapCabinetPoint(this.items,p.x,p.z,.85);
   const route=snapped?cabinetPath(this.items,a,snapped):null;
   if(!route){group.visible=false;return;}
   const upper=kind==='upper',depth=upper?.35:.60,elevation=upper?(this.drawing.elevation??1.55):.08,high=upper?(this.drawing.height??.72):.78;
   for(let i=0;i<route.segments.length;i++){
    const seg=route.segments[i],w=this.items.find(o=>o.id===seg.wallId);
    if(!w)continue;
    const len=Math.hypot(w.x2-w.x1,w.z2-w.z1),dir=Math.sign(seg.endT-seg.startT);
    if(!dir)continue;
    const prev=i>0?route.segments[i-1]:null,next=i<route.segments.length-1?route.segments[i+1]:null;
    let x=seg.startT+(prev?dir*cabinetCornerTrims(this.items.find(o=>o.id===prev.wallId),w,prev.side,depth,
     Math.sign(prev.endT-prev.startT),dir).after/len:0),
     y=seg.endT-(next?dir*cabinetCornerTrims(w,this.items.find(o=>o.id===next.wallId),seg.side,depth,
      dir,Math.sign(next.endT-next.startT)).before/len:0);
    let stopped=false;
    if(upper)try{const old=y;y=limitCabinetEnd(this.items,w,x,y,{kind:'upper',elevation,height:high});stopped=Math.abs(old-y)>.0001;}catch{y=x;stopped=true;}
    if(Math.abs(y-x)*len<.03){if(stopped)break;continue;}
    const fp=cabinetFootprint({startT:Math.min(x,y),endT:Math.max(x,y),depth,side:seg.side},w);
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(Math.abs(y-x)*len,high,depth),
     new THREE.MeshPhysicalMaterial({color:upper?0xe5d8be:0x83c8a6,transparent:true,opacity:.48,
      depthWrite:false,roughness:.38,side:THREE.DoubleSide}));
    mesh.position.set(fp.centre.x,elevation+high/2,fp.centre.z);
    mesh.rotation.y=-fp.angle;mesh.renderOrder=20;group.add(mesh);
    if(stopped)break;
   }
   const pin=new THREE.Mesh(new THREE.SphereGeometry(.075,12,9),
    new THREE.MeshBasicMaterial({color:0xffbd64,depthTest:false}));
   pin.position.set(snapped.x,.09,snapped.z);pin.renderOrder=25;group.add(pin);
   group.visible=group.children.length>0;return;
  }
  if(kind.startsWith('front-')){
   const host=this.items.find(c=>c.id===this.drawing.hostId&&c.kind==='cabinet')||
    nearestCabinet(this.items,p)?.cabinet;
   if(!host&&kind!=='front-smart'){group.visible=false;return;}
   let panels=[];try{panels=kind==='front-smart'?planSmartKitchen(this.items).items.filter(o=>o.kind==='front'):
    planFronts(this.items,host,kind.slice(6));}catch{group.visible=false;return;}
   for(const panel of panels){
    const owner=kind==='front-smart'?this.items.find(o=>o.id===panel.hostId):host;
    const pose=frontPose(panel,owner);if(!pose)continue;
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(pose.width,pose.height,.028),
     new THREE.MeshPhysicalMaterial({color:panel.subtype==='drawer'?0xe6bc7b:0x6dcbaa,
      opacity:.58,transparent:true,depthWrite:false,roughness:.34,side:THREE.DoubleSide}));
    mesh.position.set(pose.x,pose.y,pose.z);mesh.rotation.y=-pose.angle;
    mesh.renderOrder=22;group.add(mesh);
   }
   group.visible=group.children.length>0;return;
  }
  if(EQUIPMENT_SPECS[kind]){
   const spec=EQUIPMENT_SPECS[kind];let at=p,rotation=0,level=0,valid=true;
   let installed=null;
   try{const result=placeEquipment(this.items,p,kind,{freestanding:kind==='fridge'&&!!this.drawing.freestanding});installed=result.items.find(o=>o.id===result.selectedId);}catch{valid=false;}
   if(installed){at=installed;rotation=installed.rotation;level=installed.elevation;}
   if(kind==='fridge'&&!installed){const snap=snapFridgePoint(this.items,p,spec.width,spec.depth);if(snap){at=snap;rotation=snap.rotation;}}
   if(kind!=='fridge'&&!installed){
    const nearest=this.items.filter(x=>x.kind==='cabinet'&&x.subtype==='base')
     .map(c=>{const len=Math.hypot(c.x2-c.x1,c.z2-c.z1);
      const t=THREE.MathUtils.clamp(((p.x-c.x1)*(c.x2-c.x1)+(p.z-c.z1)*(c.z2-c.z1))/(len*len),0,1);
      const x=c.x1+t*(c.x2-c.x1),z=c.z1+t*(c.z2-c.z1);
      return {c,x,z,d:Math.hypot(x-p.x,z-p.z)};}).sort((a,b)=>a.d-b.d)[0];
    if(!nearest||nearest.d>nearest.c.depth/2+.2||Math.hypot(nearest.c.x2-nearest.c.x1,nearest.c.z2-nearest.c.z1)<spec.width+.04){
     group.visible=false;return;
    }
    at={x:nearest.x,z:nearest.z};rotation=Math.atan2(nearest.c.z2-nearest.c.z1,nearest.c.x2-nearest.c.x1)+(nearest.c.side===-1?Math.PI:0);
    level=['dishwasher','washer'].includes(kind)?nearest.c.elevation:kind==='oven'?nearest.c.elevation+.16:nearest.c.elevation+nearest.c.height;
   }
   const ghost=new THREE.Mesh(new THREE.BoxGeometry(installed?.width||spec.width,installed?.height||spec.height,installed?.depth||spec.depth),
    new THREE.MeshPhysicalMaterial({color:!valid?0xc75f58:kind==='fridge'?0xd9e3e2:kind==='stove'?0x657276:0x79b2b1,
     transparent:true,opacity:.50,depthWrite:false,roughness:.35}));
   ghost.position.set(at.x,level+spec.height/2,at.z);ghost.rotation.y=-rotation;
   ghost.renderOrder=20;group.add(ghost);group.visible=true;return;
  }
  if(kind==='wall'){if(!a)to={x:p.x+1.1,z:p.z};width=.12;height=this.drawing.height||3.6;colour=0x67cba7;}
  else{
   const host=a?.hostId?this.items.find(w=>w.id===a.hostId):
    nearestWallLocal(this.items,p.x,p.z);
   if(!host){group.visible=false;return;}
   const len=Math.hypot(host.x2-host.x1,host.z2-host.z1);
   const project=(point)=>{
    const t=THREE.MathUtils.clamp(((point.x-host.x1)*(host.x2-host.x1)+(point.z-host.z1)*(host.z2-host.z1))/(len*len),0,1);
    return {x:host.x1+t*(host.x2-host.x1),z:host.z1+t*(host.z2-host.z1),t};
   };
   const projected=project(p);
   if(kind==='window'||kind==='door'){
    from=projected;to=project({x:p.x+(host.x2-host.x1)/len*(kind==='door'?.9:1.2),
     z:p.z+(host.z2-host.z1)/len*(kind==='door'?.9:1.2)});
    const half=(kind==='door'?.45:.6)/len,mid=projected.t;
    from=project({x:host.x1+(host.x2-host.x1)*Math.max(0,mid-half),
     z:host.z1+(host.z2-host.z1)*Math.max(0,mid-half)});
    to=project({x:host.x1+(host.x2-host.x1)*Math.min(1,mid+half),
     z:host.z1+(host.z2-host.z1)*Math.min(1,mid+half)});
    width=Math.max(.10,host.thickness+.03);level=kind==='door'?0:.9;height=kind==='door'?2.1:1.2;colour=kind==='door'?0xdba76f:0x73c9df;
   }else{
    from=a?project(a):project({x:p.x-(host.x2-host.x1)/len,z:p.z-(host.z2-host.z1)/len});
    to=project(p);
    if(kind==='upper')try{
     const t=limitCabinetEnd(this.items,host,from.t,to.t,{kind:'upper',height:this.drawing.height??.72,elevation:this.drawing.elevation??1.55});
     to=project({x:host.x1+t*(host.x2-host.x1),z:host.z1+t*(host.z2-host.z1)});
    }catch{group.visible=false;return;}
    if(!a&&Math.hypot(to.x-from.x,to.z-from.z)<.3){
     from=project({x:p.x-(host.x2-host.x1)/len,z:p.z-(host.z2-host.z1)/len});
    }
    width=kind==='upper'?.35:.60;level=kind==='upper'?(this.drawing.elevation??1.55):.08;height=kind==='upper'?(this.drawing.height??.72):.78;colour=kind==='upper'?0xe5c79a:0xbca289;
    const nx=-(host.z2-host.z1)/len*(a?.side||1),nz=(host.x2-host.x1)/len*(a?.side||1);
    const offset=host.thickness/2+.004+width/2;
    from={x:from.x+nx*offset,z:from.z+nz*offset};
    to={x:to.x+nx*offset,z:to.z+nz*offset};
   }
  }
  const dx=to.x-from.x,dz=to.z-from.z,length=Math.hypot(dx,dz);
  if(length<.04){group.visible=false;return;}
  const mat=new THREE.MeshPhysicalMaterial({color:colour,transparent:true,opacity:.48,depthWrite:false,
   roughness:.4,metalness:.08,side:THREE.DoubleSide});
  const ghost=new THREE.Mesh(new THREE.BoxGeometry(length,height,width),mat);
  ghost.position.set((from.x+to.x)/2,level+height/2,(from.z+to.z)/2);
  ghost.rotation.y=-Math.atan2(dz,dx);ghost.renderOrder=20;ghost.userData.preview=true;
  group.add(ghost);
  if(kind==='wall'){
   // Precise endpoint/corner pins: the live end remains directly under the
   // screen reticle and no centred hit-test is ever substituted.
   for(const pos of [from,to]){
    const pin=new THREE.Mesh(new THREE.SphereGeometry(.062,12,10),
     new THREE.MeshBasicMaterial({color:pos===to?0xffb85c:0x67d4ac,depthTest:false}));
    pin.position.set(pos.x,.08,pos.z);pin.renderOrder=22;group.add(pin);
   }
  }
  group.visible=true;
 }
 rebuildObjects(){
  if(!this.objectGroup)return;
  if(this.frontAnimationFrame)cancelAnimationFrame(this.frontAnimationFrame);
  this.frontAnimationFrame=null;this.frontMotions.clear();this.frontControls.clear();
  this.frontRoots=[];
  const selectedId=this.selectedId;
  this.clearSelectionHighlight();
  // The selected appearance is applied after meshing and AO, without changing
  // the geometry or the materials that are shared by other objects.
  this.selectedId=null;
  for(const mesh of [...this.objectGroup.children]){
   this.objectGroup.remove(mesh);
   mesh.traverse(n=>{n.geometry?.dispose();if(n.material)for(const m of (Array.isArray(n.material)?n.material:[n.material])){
    if(m.map?.userData?.ephemeral)m.map.dispose();m.dispose();
   }});
  }
  const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.65,...extra});
  const plaster=material(0xd7dbd1),selected=material(0x65ac8e),frame=material(0xf0eee6);
  const glass=new THREE.MeshPhysicalMaterial({color:0x9dcede,transparent:true,opacity:.48,roughness:.18,depthWrite:false,side:THREE.DoubleSide});
  const wood=material(0x8a6d50);
  const cabinet=(color)=>new THREE.MeshPhysicalMaterial({
   color,roughness:.36,metalness:.08,clearcoat:.10,clearcoatRoughness:.22,
   envMap:this.reflectionRT?.texture,envMapIntensity:this.renderSettings.reflection
  });
  const cabinetSelected=cabinet(0x65ac8e);
  const box=(owner,from,to,y0,y1,width,angle,cx,cz,mat)=>{
   if(to-from<.002||y1-y0<.002)return;
   const geo=this.applySurfaceUV(new THREE.BoxGeometry(to-from,y1-y0,width),mat,to-from,y1-y0,width);
   const mesh=new THREE.Mesh(geo,mat.clone());
   mesh.position.set(cx,(y0+y1)/2,cz);mesh.rotation.y=-angle;
   mesh.userData.objectId=owner.id;mesh.userData.wall=owner.kind==='wall';
   mesh.userData.cabinet=owner.kind==='cabinet';
   mesh.castShadow=true;mesh.receiveShadow=true;this.objectGroup.add(mesh);
   return mesh;
  };
  const wallPrism=(owner,a,b,y0,y1,width,angle,cap,mat)=>{
   if(b-a<.002||y1-y0<.002)return;
   const h=width/2;
   const sP=a<.0001?cap.startPlus:0,sM=a<.0001?cap.startMinus:0;
   const eP=b>cap.length-.0001?cap.endPlus:0,eM=b>cap.length-.0001?cap.endMinus:0;
   const lower=[[a+sP,y0,h],[b+eP,y0,h],[b+eM,y0,-h],[a+sM,y0,-h]];
   const upper=lower.map(p=>[p[0],y1,p[2]]);
   const positions=[],uvs=[],indices=[];
   const quad=(p,q,r,s)=>{
    const start=positions.length/3;
    for(const [point,uv] of [[p,[0,0]],[q,[1,0]],[r,[1,1]],[s,[0,1]]]){
     positions.push(...point);uvs.push(...uv);
    }
    indices.push(start,start+1,start+2,start,start+2,start+3);
   };
   quad(upper[0],upper[1],upper[2],upper[3]);
   quad(lower[3],lower[2],lower[1],lower[0]);
   quad(lower[0],lower[1],upper[1],upper[0]);
   quad(lower[2],lower[3],upper[3],upper[2]);
   quad(lower[3],lower[0],upper[0],upper[3]);
   quad(lower[1],lower[2],upper[2],upper[1]);
   const geo=new THREE.BufferGeometry();
   geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
   geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
   geo.setIndex(indices);geo.computeVertexNormals();
   const mesh=new THREE.Mesh(geo,mat.clone());
   mesh.position.set(owner.x1,0,owner.z1);mesh.rotation.y=-angle;
   mesh.userData.objectId=owner.id;mesh.userData.wall=true;
   mesh.castShadow=true;mesh.receiveShadow=true;this.objectGroup.add(mesh);
  };
  for(const w of this.items.filter(x=>x.kind==='wall')){
   const dx=w.x2-w.x1,dz=w.z2-w.z1,len=Math.hypot(dx,dz);if(len<.1)continue;
   const angle=Math.atan2(dz,dx),ux=dx/len,uz=dz/len;
   const caps={...wallJointCaps(w,this.items),length:len};
   const piece=(a,b,y0,y1,width,mat,owner=w)=>{
    if(owner===w&&width===w.thickness)wallPrism(owner,a,b,y0,y1,width,angle,caps,mat);
    else {const t=(a+b)/2;return box(owner,a,b,y0,y1,width,angle,w.x1+t*ux,w.z1+t*uz,mat);}
   };
   const fill=w.id===this.selectedId?selected:plaster;
   const openings=this.items.filter(o=>o.kind==='opening'&&o.hostId===w.id)
    .map(o=>({...o,a:o.hostT*len-o.width/2,b:o.hostT*len+o.width/2})).sort((a,b)=>a.a-b.a);
   let last=0;
   for(const o of openings){
    piece(last,o.a,0,w.height,w.thickness,fill);
    piece(o.a,o.b,0,o.sill,w.thickness,fill);
    piece(o.a,o.b,o.sill+o.height,w.height,w.thickness,fill);
    const t=Math.max(w.thickness+.018,.065),edge=.045;
    piece(o.a,o.a+edge,o.sill,o.sill+o.height,t,frame,o);
    piece(o.b-edge,o.b,o.sill,o.sill+o.height,t,frame,o);
    piece(o.a,o.b,o.sill+o.height-edge,o.sill+o.height,t,frame,o);
    if(o.style==='fixed'){
     piece(o.a,o.b,o.sill,o.sill+edge,t,frame,o);
     const panels={single:1,double:2,triple:3,quad:4}[o.windowModel]||1;
     const innerStart=o.a+edge,innerEnd=o.b-edge,span=(innerEnd-innerStart)/panels;
     // Iranian sliding/uPVC layout: vertical leaves, lower/upper tracks and
     // discreet dividers, with no European casement sash projecting out.
     for(let i=1;i<panels;i++){
      const x=innerStart+i*span;
      piece(x-edge*.38,x+edge*.38,o.sill+edge,o.sill+o.height-edge,t,frame,o);
     }
     for(let i=0;i<panels;i++){
      const a=innerStart+i*span+(i?edge*.20:0),b=innerStart+(i+1)*span-(i<panels-1?edge*.20:0);
      const pane=piece(a,b,o.sill+edge,o.sill+o.height-edge,.015,glass,o);
      if(pane){
       const fraction=o.openFraction||0,operation=o.windowOperation||'sliding';
       if(operation==='sliding'&&panels>1){
        const shift=(i%2===0?1:-1)*Math.min(span*.72,(b-a)*.85)*fraction;
        pane.position.x+=ux*shift;pane.position.z+=uz*shift;
       }else if(operation==='casement'&&fraction>0){
        const turn=(i%2===0?-1:1)*fraction*Math.PI*.46;
        const hinge=i%2===0?a:b,originX=w.x1+ux*hinge,originZ=w.z1+uz*hinge;
        const rx=pane.position.x-originX,rz=pane.position.z-originZ;
        pane.position.x=originX+rx*Math.cos(turn)-rz*Math.sin(turn);
        pane.position.z=originZ+rx*Math.sin(turn)+rz*Math.cos(turn);
        pane.rotation.y-=turn;
       }
       pane.userData.windowGlassId=o.id;pane.visible=this.resizingWindowId!==o.id;
      }
     }
    }else{
     const hingeX=w.x1+o.a*ux,hingeZ=w.z1+o.a*uz;
     const pivot=new THREE.Group();pivot.position.set(hingeX,0,hingeZ);
     pivot.rotation.y=-angle+(o.mirrored?1:-1)*(o.openFraction||0)*Math.PI/2;
     const panel=new THREE.Mesh(new THREE.BoxGeometry(o.width-edge,o.height,.047),wood.clone());
     panel.position.set((o.width-edge)/2,o.height/2,0);
     panel.castShadow=true;panel.receiveShadow=true;panel.userData.objectId=o.id;pivot.userData.objectId=o.id;pivot.add(panel);this.objectGroup.add(pivot);
    }
    last=o.b;
   }
   piece(last,len,0,w.height,w.thickness,fill);
   if(w.id===this.selectedId)for(const p of [{x:w.x1,z:w.z1},{x:w.x2,z:w.z2}]){
    const dot=new THREE.Mesh(new THREE.SphereGeometry(.0325,10,8),selected.clone());
    dot.position.set(p.x,.08,p.z);this.objectGroup.add(dot);
   }
  }
  for(const join of this.items.filter(x=>x.kind==='corner')){
   const data=cornerFillFootprint(this.items,join);if(!data||data.height<.2)continue;
   const polygon=data.corners,shape=new THREE.Shape();
   polygon.forEach((p,i)=>i?shape.lineTo(p.x,p.z):shape.moveTo(p.x,p.z));shape.closePath();
   // One low-poly extruded trapezoid links arbitrary-angle cabinet runs.
   // No boolean mesh and no shadow-catching internal overlap.
   const body=new THREE.ExtrudeGeometry(shape,{depth:data.height,steps:1,bevelEnabled:false,curveSegments:1});
   body.rotateX(Math.PI/2);
   const mat=new THREE.MeshStandardMaterial({color:0xe7e4dc,roughness:.78,side:THREE.DoubleSide});
   const mesh=new THREE.Mesh(body,mat);mesh.position.y=data.elevation+data.height;
   mesh.userData.objectId=join.id;mesh.castShadow=true;mesh.receiveShadow=true;this.objectGroup.add(mesh);
   const outerA=polygon[3],outerB=polygon[2],span=Math.hypot(outerB.x-outerA.x,outerB.z-outerA.z);
   const frontMat=this.surfaceMaterial('front',resolveFinish(this.materialSettings,data.subtype==='upper'?'upper':'base','front'),span,data.height);
   const front=new THREE.Mesh(new THREE.BoxGeometry(span-.005,data.height-.018,.022),frontMat);
   front.position.set((outerA.x+outerB.x)/2,data.elevation+data.height/2,(outerA.z+outerB.z)/2);
   front.rotation.y=-Math.atan2(outerB.z-outerA.z,outerB.x-outerA.x);
   front.userData.objectId=join.id;front.castShadow=true;this.objectGroup.add(front);
   if(data.subtype==='base'){
    const counter=this.surfaceMaterial('counter',this.materialSettings.counter,span,.6);
    const cap=new THREE.Mesh(new THREE.ShapeGeometry(shape),counter);cap.geometry.rotateX(Math.PI/2);
    cap.position.y=data.elevation+data.height+.018;cap.material.side=THREE.DoubleSide;
    cap.receiveShadow=true;cap.userData.objectId=join.id;this.objectGroup.add(cap);
   }
  }
  for(const c of this.items.filter(x=>x.kind==='cabinet')){
   const len=Math.hypot(c.x2-c.x1,c.z2-c.z1);if(len<.3)continue;
   const angle=Math.atan2(c.z2-c.z1,c.x2-c.x1),y0=c.elevation??.1;
   const cx=(c.x1+c.x2)/2,cz=(c.z1+c.z2)/2,ux=Math.cos(angle),uz=Math.sin(angle),nx=-uz,nz=ux;
   const bodyId=resolveFinish(this.materialSettings,c.subtype,'body');
   const bodyMat=this.surfaceMaterial('body',bodyId,len,c.height);
   const decor=resolvedCabinetDecor(c),frontMat=this.surfaceMaterial('front',resolveFinish(this.materialSettings,c.subtype==='upper'?'upper':'base','front'),len,c.height);
   const addDetail=(width,height,depth,x,y,z,mat=frontMat)=>{
    if(width<=0||height<=0||depth<=0)return;
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth),mat.clone());
    mesh.position.set(cx+ux*x+nx*z,y,cz+uz*x+nz*z);mesh.rotation.y=-angle;
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.objectId=c.id;mesh.userData.cabinet=true;
    this.objectGroup.add(mesh);
    return mesh;
   };
   const frontZ=(c.side||1)*(c.depth/2+.025);
   // Before front design, the run is one clean envelope; inner dividers are generated with the doors/drawers.
   if(c.subtype!=='bridge'&&!this.items.some(f=>f.kind==='front'&&f.hostId===c.id)&&
     !this.items.some(e=>e.kind==='equipment'&&e.hostId===c.id))
    addDetail(Math.max(.02,len-.016),Math.max(.02,c.height-.025),.018,0,y0+c.height/2,frontZ,bodyMat);
   // The carcass is actually hollow, even when all doors are closed. Every
   // panel is a 12-triangle box, batched into ONE mesh/material per cabinet.
   // The interior stays matte white; only exposed finished ends use bodyMat.
   const cuts=countertopCutouts(this.items,c);
   const panels=cabinetCarcassPanels(c,
    this.items.filter(f=>f.kind==='front'&&f.hostId===c.id),
    this.items.filter(e=>e.kind==='equipment'&&e.hostId===c.id));
   const batch=buildCarcassPanelGeometry(panels);
   if(batch.indices.length){
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(batch.positions,3));
    geo.setAttribute('normal',new THREE.Float32BufferAttribute(batch.normals,3));
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(batch.uvs,2));
    geo.setIndex(batch.indices);
    const carcass=new THREE.Mesh(geo,material(0xf4f5f2,{roughness:.84}));
    carcass.position.set(cx,0,cz);carcass.rotation.y=-angle;
    carcass.castShadow=true;carcass.receiveShadow=true;
    carcass.userData.objectId=c.id;carcass.userData.cabinet=true;carcass.userData.carcass=true;
    this.objectGroup.add(carcass);
   }
   // Every cavity is built at cabinet installation time, regardless of its
   // doors' open state. Drawer boxes are generated with the facades below.
   if(c.subtype!=='bridge'&&decor.endPanel!=='none')for(const end of [-1,1]){
    const point=end<0?{x:c.x1,z:c.z1}:{x:c.x2,z:c.z2};
    const concealed=this.items.some(other=>other.kind==='cabinet'&&other.id!==c.id&&
     other.subtype===c.subtype&&Math.abs((other.elevation||0)-y0)<.025&&
     [{x:other.x1,z:other.z1},{x:other.x2,z:other.z2}]
      .some(p=>Math.hypot(point.x-p.x,point.z-p.z)<.045));
    if(concealed)continue;
    const panelGeo=this.applySurfaceUV(new THREE.BoxGeometry(.012,c.height,c.depth),bodyMat,.012,c.height,c.depth);
    const panel=new THREE.Mesh(panelGeo,(c.id===this.selectedId?cabinetSelected:bodyMat).clone());
    panel.position.set(cx+ux*end*(len/2-.006),y0+c.height/2,cz+uz*end*(len/2-.006));
    panel.rotation.y=-angle;panel.castShadow=true;panel.receiveShadow=true;
    panel.userData.objectId=c.id;panel.userData.cabinet=true;this.objectGroup.add(panel);
    if(decor.endPanel==='framed'){
     const x=end*(len/2+.011),edge=.028,outer=c.depth*.91;
     for(const y of [y0+.04,y0+c.height-.04])addDetail(.019,.027,outer,x,y,0,bodyMat);
     for(const z of [-outer/2+edge,outer/2-edge])addDetail(.019,c.height-.075,.024,x,y0+c.height/2,z,bodyMat);
    }
   }
   if(['base','tall'].includes(c.subtype)){
    // At first placement, every base envelope has a stone worktop and recessed plinth.
    const ux=(c.x2-c.x1)/len,uz=(c.z2-c.z1)/len,side=c.side||1;
    const nx=-uz*side,nz=ux*side,cx=(c.x1+c.x2)/2,cz=(c.z1+c.z2)/2;
    if(c.subtype==='base'){
     const stone=this.surfaceMaterial('counter',this.materialSettings.counter,len,c.depth);
     const design=resolvedCountertopDesign(c),side=c.side||1,top=y0+c.height;
     const x0=-len/2-.0175,x1=len/2+.0175,
      z0=-c.depth/2-.0175-(side<0?design.overhang:0),
      z1=c.depth/2+.0175+(side>0?design.overhang:0),
      r=Math.min(design.cornerRadius,(x1-x0)/4,(z1-z0)/4);
     const shape=new THREE.Shape();
     shape.moveTo(x0+r,z0);
     if(side<0&&design.curve>.001)shape.quadraticCurveTo((x0+x1)/2,z0-design.curve,x1-r,z0);
     else shape.lineTo(x1-r,z0);
     shape.quadraticCurveTo(x1,z0,x1,z0+r);shape.lineTo(x1,z1-r);
     shape.quadraticCurveTo(x1,z1,x1-r,z1);
     if(side>0&&design.curve>.001)shape.quadraticCurveTo((x0+x1)/2,z1+design.curve,x0+r,z1);
     else shape.lineTo(x0+r,z1);
     shape.quadraticCurveTo(x0,z1,x0,z1-r);shape.lineTo(x0,z0+r);
     shape.quadraticCurveTo(x0,z0,x0+r,z0);
     for(const cut of cuts){
      const a=cut.x-cut.width/2,b=cut.x+cut.width/2,
       low=cut.z-cut.depth/2,high=cut.z+cut.depth/2;
      const hole=new THREE.Path();
      hole.moveTo(a,low);hole.lineTo(a,high);hole.lineTo(b,high);hole.lineTo(b,low);hole.closePath();
      shape.holes.push(hole);
     }
     const thickness=design.edge==='thick'?.075:.035;
     const rounded=design.edge==='round',bevel=rounded||design.edge==='bevel';
     const geo=new THREE.ExtrudeGeometry(shape,{depth:thickness,steps:1,
      bevelEnabled:bevel,bevelSize:rounded?.008:.005,bevelThickness:rounded?.008:.004,
      bevelSegments:rounded?3:1,curveSegments:8});
     const uv=geo.getAttribute('uv'),textureScale=stone.userData?.textureScale||.4;
     if(uv)for(let index=0;index<uv.count;index++)uv.setXY(index,uv.getX(index)/textureScale,uv.getY(index)/textureScale);
     const slab=new THREE.Mesh(geo,stone.clone()),slabGroup=new THREE.Group();
     slab.rotation.x=Math.PI/2;slab.castShadow=true;slab.receiveShadow=true;
     slab.userData.objectId=c.id;slabGroup.userData.objectId=c.id;
     slabGroup.position.set(cx,top+.035,cz);slabGroup.rotation.y=-angle;
     slabGroup.add(slab);this.objectGroup.add(slabGroup);
     if(design.waterfall!=='none')for(const end of [-1,1]){
      if(design.waterfall!=='both'&&design.waterfall!==(end<0?'start':'end'))continue;
      const point=end<0?{x:c.x1,z:c.z1}:{x:c.x2,z:c.z2};
      const hidden=this.items.some(other=>other.kind==='cabinet'&&other.id!==c.id&&other.subtype==='base'&&
       Math.abs(other.elevation-y0)<.02&&[[other.x1,other.z1],[other.x2,other.z2]].some(p=>Math.hypot(p[0]-point.x,p[1]-point.z)<.055));
      if(hidden)continue;
      addDetail(.034,top+.035-Math.max(0,y0-.04),z1-z0,end*(len/2+.017),
       (top+.035+Math.max(0,y0-.04))/2,(z0+z1)/2,stone);
     }
     if(design.raisedHeight>.005){
      const rear=side>0?z0+.13:z1-.13;
      addDetail(len+.02,.028,.26,0,top+.035+design.raisedHeight,rear,stone);
      addDetail(len+.02,design.raisedHeight,.028,0,top+.035+design.raisedHeight/2,
       rear+(side>0?.13:-.13),stone);
     }
     stone.dispose();
    }
    const toe=new THREE.Mesh(new THREE.BoxGeometry(len,.085,.09),
     decor.toeKick==='body'?bodyMat.clone():material(0x776d62,{metalness:.03,roughness:.68}));
    const recess=decor.toeKick==='flush'?c.depth/2-.017:c.depth/2-.064;
    toe.position.set(cx+nx*(c.side||1)*recess,Math.max(.042,y0-.035),cz+nz*(c.side||1)*recess);
    toe.rotation.y=-angle;toe.castShadow=true;toe.receiveShadow=true;
    toe.userData.objectId=c.id;toe.userData.cabinet=true;this.objectGroup.add(toe);
   }
   if(['upper','over-fridge','tall'].includes(c.subtype)&&decor.crown!=='none'){
    const top=y0+c.height,depth=c.depth+.045;
    addDetail(len+.04,.038,depth,0,top+.019,0,bodyMat);
    if(decor.crown==='classic'){
     addDetail(len+.065,.025,depth+.035,0,top+.050,0,frontMat);
     addDetail(len+.087,.018,depth+.053,0,top+.071,0,bodyMat);
    }
   }
   if(c.subtype!=='bridge'){
    const facadeY=y0+c.height/2;
    if(decor.pilaster!=='none')for(const side of [-1,1]){
     const x=side*(len/2-.025);
     addDetail(decor.pilaster==='classic' ? .045 : .028,c.height-.035,.026,x,facadeY,frontZ);
     if(decor.pilaster==='classic')for(const y of [y0+.046,y0+c.height-.046])
      addDetail(.070,.047,.038,x,y,frontZ,bodyMat);
    }
    if(['vertical','both'].includes(decor.trim))for(const x of [-len/2+.021,len/2-.021])
     addDetail(.014,c.height-.025,.012,x,facadeY,frontZ+.010*(c.side||1));
    if(['horizontal','both'].includes(decor.trim))for(const y of [y0+.027,y0+c.height-.027])
     addDetail(len-.045,.014,.012,0,y,frontZ+.010*(c.side||1));
    if(decor.wallFiller==='auto'){
     const host=this.items.find(w=>w.id===c.hostId&&w.kind==='wall');
     if(host){const hostLen=Math.hypot(host.x2-host.x1,host.z2-host.z1);
      for(const [sign,gap] of [[-1,c.startT*hostLen],[1,(1-c.endT)*hostLen]]){
       if(gap<.018||gap>.20)continue;
       const occupied=this.items.some(other=>other.kind==='cabinet'&&other.id!==c.id&&other.hostId===host.id&&other.side===c.side&&
        Math.abs(other.elevation-c.elevation)<.02&&(sign<0?Math.abs(other.endT-c.startT):Math.abs(other.startT-c.endT))*hostLen<gap+.025);
       if(!occupied)addDetail(gap-.009,c.height,.018,sign*(len/2+gap/2),facadeY,frontZ,frontMat);
      }
     }
    }
   }
   if(c.specialty?.type&&c.specialty.type!=='none'&&c.subtype!=='bridge'){
    const s=c.specialty,sw=Math.min(s.width,len-.025),sh=Math.min(s.height,c.height-.035),
     sx=((s.offsetT??.5)-.5)*len,centreY=y0+c.height/2,
     face=frontZ+(c.side||1)*.042;
    const specialtyMat=this.surfaceMaterial('front',s.materialId,sw,sh);
    const inner=material(0x454d47,{roughness:.84}),shelf=material(0xd4d0c7,{roughness:.61});
    if(s.type==='seating'){
     addDetail(sw,.06,.48,sx,y0+c.height+.066,frontZ+(c.side||1)*.24,specialtyMat);
     for(const x of [sx-sw/2+.08,sx+sw/2-.08])
      addDetail(.045,Math.min(.55,c.height),.045,x,y0+c.height-Math.min(.55,c.height)/2,
       frontZ+(c.side||1)*.41,specialtyMat);
    }else{
     // A parametric presentation niche: dark back, reveal/frame, adjustable
     // shelves and procedural contents, independent from manufacturing units.
     addDetail(sw,sh,.019,sx,centreY,face,inner);
     for(const x of [sx-sw/2+.015,sx+sw/2-.015])
      addDetail(.025,sh,.030,x,centreY,face+(c.side||1)*.022,specialtyMat);
     for(const y of [centreY-sh/2+.014,centreY+sh/2-.014])
      addDetail(sw,.028,.033,sx,y,face+(c.side||1)*.022,specialtyMat);
     const shelfCount=Math.min(6,Math.max(0,s.shelves||0));
     for(let j=1;j<=shelfCount;j++){
      const y=centreY-sh/2+sh*j/(shelfCount+1);
      addDetail(sw-.055,.018,.18,sx,y,face+(c.side||1)*.10,shelf);
     }
     if(s.type==='coffee'||s.type==='appliance'){
      const lower=centreY-sh/2+.12;
      const machine=material(s.type==='coffee'?0x323a3b:0x59656a,{metalness:.32,roughness:.31});
      addDetail(Math.min(.34,sw*.65),.20,.16,sx,lower,face+(c.side||1)*.15,machine);
      addDetail(Math.min(.26,sw*.55),.115,.012,sx,lower+.012,face+(c.side||1)*.244,inner);
      if(s.type==='coffee')addDetail(.075,.065,.075,sx+.14,lower-.085,face+(c.side||1)*.26,shelf);
      machine.dispose();
     }
     if(s.type==='bar'){
      const bottle=material(0x527068,{metalness:.12,roughness:.18});
      for(let j=-2;j<=2;j++){
       const mesh=new THREE.Mesh(new THREE.CylinderGeometry(.025,.035,.21,10),bottle.clone());
       mesh.position.set(cx+ux*(sx+j*Math.min(.075,sw/7))+nx*(face+(c.side||1)*.12),
        centreY-sh/2+.135,cz+uz*(sx+j*Math.min(.075,sw/7))+nz*(face+(c.side||1)*.12));
       mesh.castShadow=true;mesh.userData.objectId=c.id;this.objectGroup.add(mesh);
      }
      bottle.dispose();
     }
     if(s.door==='glass'){
      const glassPanel=new THREE.Mesh(new THREE.BoxGeometry(sw-.046,sh-.045,.009),
       new THREE.MeshPhysicalMaterial({color:0xc9e6e4,transparent:true,opacity:.30,roughness:.09,
        metalness:.03,depthWrite:false,side:THREE.DoubleSide}));
      glassPanel.position.set(cx+ux*sx+nx*(face+(c.side||1)*.032),centreY,
       cz+uz*sx+nz*(face+(c.side||1)*.032));
      glassPanel.rotation.y=-angle;glassPanel.userData.objectId=c.id;
      glassPanel.visible=!this.facadesHidden;this.frontRoots.push(glassPanel);this.objectGroup.add(glassPanel);
     }else if(s.door==='solid'){
      const nicheDoor=addDetail(sw-.045,sh-.043,.021,sx,centreY,face+(c.side||1)*.054,specialtyMat);
      if(nicheDoor){nicheDoor.visible=!this.facadesHidden;this.frontRoots.push(nicheDoor);}
     }
    }
    specialtyMat.dispose();inner.dispose();shelf.dispose();
   }
   bodyMat.dispose();frontMat.dispose();
  }
  // Automatic backsplash: attached to the host wall, from worktop to the
  // underside of upper cupboards (or a standard 62 cm rise), excluding windows.
  for(const c of this.items.filter(x=>x.kind==='cabinet'&&x.subtype==='base')){
   const w=this.items.find(o=>o.id===c.hostId&&o.kind==='wall');if(!w)continue;
   const wallLen=Math.hypot(w.x2-w.x1,w.z2-w.z1),angle=Math.atan2(w.z2-w.z1,w.x2-w.x1);
   const baseTop=c.elevation+c.height+.035,from=c.startT*wallLen,to=c.endT*wallLen;
   const upper=this.items.filter(u=>u.kind==='cabinet'&&['upper','bridge'].includes(u.subtype)&&
    u.hostId===w.id&&u.side===c.side&&Math.min(u.endT,c.endT)>Math.max(u.startT,c.startT));
   const nearestTop=upper.length?Math.min(...upper.map(u=>u.elevation)):baseTop+.62;
   const endY=Math.min(w.height-.025,nearestTop);
   if(endY-baseTop<.10)continue;
   let spans=[[from,to]];
   for(const opening of this.items.filter(o=>o.kind==='opening'&&o.hostId===w.id&&
    o.sill<endY&&o.sill+o.height>baseTop)){
    const a=opening.hostT*wallLen-opening.width/2,b=opening.hostT*wallLen+opening.width/2;
    spans=spans.flatMap(([s,e])=>e<=a||s>=b?[[s,e]]:[[s,Math.min(e,a)],[Math.max(s,b),e]].filter(([x,y])=>y-x>.01));
   }
   const ux=Math.cos(angle),uz=Math.sin(angle),side=c.side||1,nx=-uz*side,nz=ux*side;
   for(const [s,e] of spans){
    const span=e-s;if(span<.05)continue;
    const t=(s+e)/2,offset=w.thickness/2+.014;
    const tile=this.surfaceMaterial('backsplash',this.materialSettings.backsplash,span,endY-baseTop);
    const grout=new THREE.Mesh(new THREE.PlaneGeometry(span,endY-baseTop),
     new THREE.MeshStandardMaterial({color:this.tileLayout.groutColor,roughness:.91,side:THREE.DoubleSide}));
    grout.position.set(w.x1+ux*t+nx*offset,(baseTop+endY)/2,w.z1+uz*t+nz*offset);
    grout.rotation.y=-angle;grout.receiveShadow=true;grout.userData.objectId=c.id;
    this.objectGroup.add(grout);
    const layout=buildTileGeometry(span,endY-baseTop,this.tileLayout),geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(layout.positions,3));
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(layout.uvs,2));
    geo.setIndex(layout.indices);geo.computeVertexNormals();tile.side=THREE.DoubleSide;
    const mesh=new THREE.Mesh(geo,tile);
    mesh.position.set(w.x1+ux*t+nx*(offset+.006),(baseTop+endY)/2,w.z1+uz*t+nz*(offset+.006));
    mesh.rotation.y=-angle;mesh.receiveShadow=true;mesh.userData.objectId=c.id;
    this.objectGroup.add(mesh);
   }
  }
  // Each facade is a semantic, selectable object independent of its future internal unit.
  for(const panel of this.items.filter(o=>o.kind==='front')){
   const host=this.items.find(c=>c.id===panel.hostId&&c.kind==='cabinet');
   if(!host)continue;
   const pose=frontPose(panel,host),materialId=panel.materialId||resolveFinish(this.materialSettings,host.subtype,'front');
   const grain=panel.grainDirection==='horizontal'||(panel.grainDirection!=='vertical'&&panel.subtype==='drawer')?'horizontal':'vertical';
   const root=new THREE.Group();root.position.set(pose.x,pose.y,pose.z);root.rotation.y=-pose.angle;
   root.userData.objectId=panel.id;root.userData.frontRoot=true;
   root.visible=!this.facadesHidden;this.frontRoots.push(root);this.objectGroup.add(root);
   const amount=Math.max(0,Math.min(1,panel.openFraction||0));
   let leaf=root,pivot=null;
   if(panel.subtype==='door'){
    pivot=new THREE.Group();const face=new THREE.Group();
    if(panel.hinge==='top'){
     pivot.position.y=pose.height/2;
     face.position.y=-pose.height/2;
    }else{
     const left=panel.hinge!=='right';
     pivot.position.x=(left?-1:1)*pose.width/2;
     face.position.x=(left?1:-1)*pose.width/2;
    }
    root.add(pivot);pivot.add(face);leaf=face;
   }
   let tray=null;
   if(panel.subtype==='drawer'){
    const depth=Math.min(host.depth*.75,.48),width=Math.max(.10,pose.width-.036),
     wall=.012,low=-pose.height/2+.025,rail=Math.max(.045,Math.min(.14,pose.height*.52));
    const z=-pose.side*(depth/2+.017),back=-pose.side*(depth+.011);
    const trayPanels=[
     {x:0,y:low,z,width,height:.014,depth},
     {x:-width/2+wall/2,y:low+rail/2,z,width:wall,height:rail,depth},
     {x:width/2-wall/2,y:low+rail/2,z,width:wall,height:rail,depth},
     {x:0,y:low+rail/2,z:back,width,height:rail,depth:wall}
    ];
    const batch=buildCarcassPanelGeometry(trayPanels),geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(batch.positions,3));
    geo.setAttribute('normal',new THREE.Float32BufferAttribute(batch.normals,3));
    geo.setIndex(batch.indices);
    tray=new THREE.Group();tray.position.copy(root.position);tray.rotation.copy(root.rotation);
    const drawerBox=new THREE.Mesh(geo,material(0xf4f5f2,{roughness:.82}));
    drawerBox.castShadow=true;drawerBox.receiveShadow=true;drawerBox.userData.objectId=panel.id;
    tray.add(drawerBox);this.objectGroup.add(tray);
   }
   const control={root,pivot,pose,host,panel,tray,fraction:0};
   this.frontControls.set(panel.id,control);this.applyFrontFraction(control,amount);
   const frameId=panel.style==='frame'?panel.frameMaterialId||materialId:materialId;
   const faceMaterial=panel.id===this.selectedId?cabinetSelected.clone():
    this.surfaceMaterial('front',frameId,pose.width,pose.height,grain);
   const surface=new THREE.Mesh(this.applySurfaceUV(new THREE.BoxGeometry(pose.width,pose.height,pose.thickness),faceMaterial,
    pose.width,pose.height,pose.thickness),faceMaterial);
   surface.castShadow=true;surface.receiveShadow=true;surface.userData.objectId=panel.id;
   leaf.add(surface);
   const visibleZ=(pose.side||1)*(.012+pose.thickness/2);
   if(panel.style==='frame'&&pose.width>.20&&pose.height>.18){
    const innerMaterial=panel.id===this.selectedId?cabinetSelected.clone():
     this.surfaceMaterial('front',materialId,pose.width-.065,pose.height-.065,grain);
    const inset=new THREE.Mesh(this.applySurfaceUV(new THREE.BoxGeometry(pose.width-.065,pose.height-.065,.007),
     innerMaterial,pose.width-.065,pose.height-.065,.007),innerMaterial);
    inset.position.z=visibleZ*.82;inset.userData.objectId=panel.id;leaf.add(inset);
   }
   if(panel.handleStyle!=='hidden'){
    const finish=panel.handleFinish||'steel',color=finish==='brass'?0xc8a257:finish==='black'?0x303638:0x8c9493;
    const metal=material(color,{metalness:.66,roughness:.23});
    const isDrawer=panel.subtype==='drawer',horizontal=panel.hinge==='top';
    const barLength=isDrawer||horizontal?Math.min(host.photoPreset?.front?.handleLength||.34,pose.width*.63):
     Math.min(host.photoPreset?.front?.handleLength||.25,pose.height*.60);
    const handle=panel.handleStyle==='knob'?
     new THREE.Mesh(new THREE.SphereGeometry(.018,12,8),metal):
     new THREE.Mesh(new THREE.CylinderGeometry(.008,.008,barLength,10),metal);
    if(panel.handleStyle!=='knob'&&(isDrawer||horizontal))handle.rotation.z=Math.PI/2;
    handle.position.set(isDrawer||horizontal?0:panel.hinge==='left'?pose.width/2-.055:-pose.width/2+.055,
     horizontal?-pose.height/2+.055:isDrawer?pose.height*.19:0,visibleZ+.015*(pose.side||1));
    handle.userData.objectId=panel.id;handle.castShadow=true;leaf.add(handle);
   }
  }
  if(this.renderSettings.taskLighting){
   const lightRuns=this.items.filter(x=>x.kind==='cabinet'&&x.subtype==='upper');
   for(const c of lightRuns){
    const x=(c.x1+c.x2)/2,z=(c.z1+c.z2)/2;
    if(lightRuns.indexOf(c)<4){
     const lamp=new THREE.PointLight(0xffebc5,this.renderSettings.taskIntensity??1.8,3,2);
     lamp.position.set(x,Math.max(.3,c.elevation-.07),z);lamp.castShadow=false;
     this.objectGroup.add(lamp);
    }
    const line=new THREE.Mesh(new THREE.BoxGeometry(Math.max(.2,Math.hypot(c.x2-c.x1,c.z2-c.z1)*.85),.012,.025),
     new THREE.MeshBasicMaterial({color:0xffecc8,transparent:true,opacity:.94}));
    line.position.set(x,c.elevation-.017,z);line.rotation.y=-Math.atan2(c.z2-c.z1,c.x2-c.x1);
    line.userData.objectId=c.id;this.objectGroup.add(line);
   }
  }
  for(const o of this.items.filter(x=>x.kind==='equipment')){
   const root=new THREE.Group();root.position.set(o.x,o.elevation||0,o.z);root.rotation.y=-(o.rotation||0);
   root.userData.objectId=o.id;this.objectGroup.add(root);
   const steel=material(o.id===this.selectedId?0x70bbaa:0xc6cfce,{metalness:.48,roughness:.28});
   const dark=material(0x343c3e,{metalness:.34,roughness:.35});
   const silver=material(0x8fa6a8,{metalness:.56,roughness:.22});
   const add=(geometry,mat,x,y,z,rotationX=0)=>{
    const mesh=new THREE.Mesh(geometry,mat.clone());mesh.position.set(x,y,z);mesh.rotation.x=rotationX;
    mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.objectId=o.id;root.add(mesh);return mesh;
   };
   if(o.subtype==='fridge'){
    if(o.builtIn){
     const surround=material(0xd9d1c3,{roughness:.38,metalness:.03});
     const top=Math.max(o.height+.16,2.15),edge=.028,span=Math.max(o.width+.12,o.surround?.bayWidth||0),shift=o.surround?.bayOffset||0;
     add(new THREE.BoxGeometry(edge,top,o.depth+.12),surround,shift-span/2,top/2,0);
     add(new THREE.BoxGeometry(edge,top,o.depth+.12),surround,shift+span/2,top/2,0);
     add(new THREE.BoxGeometry(span,.14,o.depth+.12),surround,shift,top-.07,0);
     for(const side of [-1,1]){
      const from=side<0?shift-span/2+edge/2:-o.width/2,to=side<0?-o.width/2:shift+span/2-edge/2;
      if(to-from>.025)add(new THREE.BoxGeometry(to-from,top,.025),surround,(from+to)/2,top/2,o.depth/2+.025);
     }
     surround.dispose();
    }
    add(new THREE.BoxGeometry(o.width,o.height,o.depth),steel,0,o.height/2,0);
    const front=o.depth/2+.02;
    if(o.model==='side'){
     for(const side of [-1,1]){
      add(new THREE.BoxGeometry(o.width*.46,o.height*.95,.028),steel,side*o.width*.245,o.height/2,front);
      add(new THREE.CylinderGeometry(.008,.008,.42,8),silver,side*o.width*.07,o.height*.62,front+.04);
     }
    }else if(o.model==='combination'){
     add(new THREE.BoxGeometry(o.width*.94,o.height*.64,.028),steel,0,o.height*.67,front);
     add(new THREE.BoxGeometry(o.width*.94,o.height*.29,.028),steel,0,o.height*.16,front);
     add(new THREE.CylinderGeometry(.01,.01,.38,8),silver,o.width*.39,o.height*.71,front+.04);
    }else{
     add(new THREE.BoxGeometry(o.width*.94,o.height*.94,.028),steel,0,o.height/2,front);
     add(new THREE.CylinderGeometry(.009,.009,.35,8),silver,o.width*.38,o.height*.72,front+.04);
    }
    if(o.builtIn&&['matched','concealed'].includes(o.facadeMode)){
     const finish=this.surfaceMaterial('front',resolveFinish(this.materialSettings,'base','front'),o.width,o.height);
     add(new THREE.BoxGeometry(o.width*.985,o.height*.982,.025),finish,0,o.height/2,front+.055);
     if(o.facadeMode==='concealed'){
      for(const y of [.055,o.height-.055])add(new THREE.BoxGeometry(o.width*.90,.022,.035),finish,0,y,front+.076);
      for(const x of [-o.width*.44,o.width*.44])add(new THREE.BoxGeometry(.020,o.height*.89,.035),finish,x,o.height/2,front+.076);
     }
     add(new THREE.CylinderGeometry(.008,.008,.25,10),silver,o.width*.37,o.height*.72,front+.10);
     finish.dispose();
    }
   }else if(['dishwasher','washer','oven','microwave'].includes(o.subtype)){
    const body=material(['oven','microwave'].includes(o.subtype)?0x33383a:0xe2e1dc,{metalness:.28,roughness:.31});
    const front=o.depth/2+.012;
    add(new THREE.BoxGeometry(o.width,o.height,o.depth),body,0,o.height/2,0);
    if(['oven','microwave'].includes(o.subtype)){
     add(new THREE.BoxGeometry(o.width*.90,o.height*.66,.016),dark,0,o.height*.43,front);
     add(new THREE.BoxGeometry(o.width*.78,o.height*.50,.019),material(0x3b535b,{metalness:.3,roughness:.19}),0,o.height*.42,front+.016);
     add(new THREE.BoxGeometry(o.width*.70,.02,.026),silver,0,o.height*.85,front+.035);
     for(const side of [-1,1])add(new THREE.CylinderGeometry(.015,.015,.012,12),silver,side*o.width*.32,o.height*.93,front+.03,Math.PI/2);
    }else{
     const door=add(new THREE.CylinderGeometry(o.width*.30,o.width*.30,.013,32),dark,0,o.height*.54,front+.022,Math.PI/2);
     add(new THREE.CylinderGeometry(o.width*.23,o.width*.23,.015,32),material(0x7b969b,{metalness:.25,roughness:.20}),0,o.height*.54,front+.037,Math.PI/2);
     add(new THREE.BoxGeometry(o.width*.9,.12,.024),steel,0,o.height*.91,front+.025);
     for(let i=0;i<3;i++)add(new THREE.CylinderGeometry(.014,.014,.014,10),dark,-o.width*.33+i*.065,o.height*.91,front+.046,Math.PI/2);
     if(['matched','concealed'].includes(o.facadeMode)){
      const host=this.items.find(c=>c.id===o.hostId),finishId=resolveFinish(this.materialSettings,host?.subtype,'front');
      const finish=this.surfaceMaterial('front',finishId,o.width,o.height);
      add(new THREE.BoxGeometry(o.width*.99,o.height*.98,.025),finish,0,o.height/2,front+.066);
      if(o.facadeMode==='concealed'){
       for(const y of [.055,o.height-.055])add(new THREE.BoxGeometry(o.width*.92,.020,.028),finish,0,y,front+.086);
       for(const x of [-o.width*.45,o.width*.45])add(new THREE.BoxGeometry(.018,o.height*.88,.028),finish,x,o.height/2,front+.086);
      }
      add(new THREE.CylinderGeometry(.008,.008,.27,10),silver,o.width*.36,o.height*.72,front+.106);
      finish.dispose();
     }
    }
    // No appliance cap: the uncut countertop above both machines is the cap.
    body.dispose();
   }else if(o.subtype==='hood'){
    const wide=o.width,body=material(['concealed','cabinet-framed'].includes(o.model)?0xe6dfd1:0xaebabb,{metalness:.55,roughness:.24});
    if(o.model==='chimney'){
     add(new THREE.BoxGeometry(wide,.085,.52),body,0,.05,0);
     add(new THREE.BoxGeometry(wide*.43,.42,.25),body,0,.25,-.10);
    }else if(o.model==='angled'){
     const face=add(new THREE.BoxGeometry(wide,.40,.045),dark,0,.20,.10);face.rotation.x=-.38;
     add(new THREE.BoxGeometry(wide,.08,.42),body,0,.05,-.07);
    }else if(['concealed','cabinet-framed'].includes(o.model)){
     add(new THREE.BoxGeometry(wide,.28,.42),body,0,.14,-.08);
     add(new THREE.BoxGeometry(wide*.86,.018,.23),silver,0,.015,.06);
     const finish=this.surfaceMaterial('front',resolveFinish(this.materialSettings,'upper','front'),wide,.28);
     add(new THREE.BoxGeometry(wide,.265,.022),finish,0,.16,.15);
     if(o.model==='cabinet-framed'){
      for(const x of [-wide*.45,wide*.45])add(new THREE.BoxGeometry(.025,.25,.03),finish,x,.16,.169);
      for(const y of [.055,.265])add(new THREE.BoxGeometry(wide*.94,.025,.03),finish,0,y,.169);
     }
     finish.dispose();
    }else{
     add(new THREE.BoxGeometry(wide,.12,.46),body,0,.10,0);
     add(new THREE.BoxGeometry(wide*.83,.025,.36),silver,0,.025,.04);
    }
    for(const x of [-wide*.25,wide*.25])add(new THREE.CylinderGeometry(.028,.028,.008,12),material(0xffeed1,{emissive:0xffd99c,emissiveIntensity:.6}),x,.01,.16);
    body.dispose();
   }else if(o.subtype==='stove'){
    const induction=Boolean(o.induction||o.model==='induction'),count=
     o.model==='gas2'?2:o.model==='gas3'?3:o.model==='gas5'?5:4;
    const slab=.025;
    add(new THREE.BoxGeometry(o.width,slab,o.depth),dark,0,slab/2,0);
    add(new THREE.BoxGeometry(o.width*.96,.007,o.depth*.94),induction?dark:steel,0,slab+.003,0);
    const x=o.width*.255,z=o.depth*.225;
    const positions=count===2?[[-x,0],[x,0]]:count===3?[[-x,-z],[x,-z],[0,z]]:
     count===5?[[-x,-z],[-x,z],[x,-z],[x,z],[0,0]]:[[-x,-z],[-x,z],[x,-z],[x,z]];
    for(const [bx,bz] of positions){
     const burner=add(new THREE.TorusGeometry(bx===0&&bz===0?.073:.058,induction?.0035:.007,8,20),
      induction?silver:dark,bx,slab+.009,bz,-Math.PI/2);burner.castShadow=false;
    }
    if(!induction)for(let i=0;i<Math.min(count,5);i++)
     add(new THREE.CylinderGeometry(.012,.012,.012,10),dark,
      (i-(Math.min(count,5)-1)/2)*.060,slab+.008,o.depth*.42);
   }else if(o.subtype==='sink'){
    const double=o.model==='double',drainer=o.model==='drainer';
    const bowlDepth=o.depth*.59,usable=o.width-(drainer?.20:.13);
    const bowlWidth=double?Math.min(.44,(usable-.045)/2):Math.min(.48,usable);
    const xs=double?[-(bowlWidth+.03)/2,(bowlWidth+.03)/2]:[drainer?-o.width*.15:0];
    const plate=new THREE.Shape();
    plate.moveTo(-o.width/2,-o.depth/2);plate.lineTo(o.width/2,-o.depth/2);
    plate.lineTo(o.width/2,o.depth/2);plate.lineTo(-o.width/2,o.depth/2);plate.closePath();
    for(const bx of xs){
     const path=new THREE.Path(),l=bx-bowlWidth/2,r=bx+bowlWidth/2,b=-bowlDepth/2,t=bowlDepth/2;
     path.moveTo(l,b);path.lineTo(l,t);path.lineTo(r,t);path.lineTo(r,b);path.closePath();
     plate.holes.push(path);
    }
    const deck=add(new THREE.ShapeGeometry(plate),silver,0,.012,0,-Math.PI/2);
    deck.material.side=THREE.DoubleSide;
    for(const bx of xs){
     add(new THREE.BoxGeometry(bowlWidth-.012,.01,bowlDepth-.012),dark,bx,-.115,0);
     for(const sign of [-1,1]){
      add(new THREE.BoxGeometry(.010,.12,bowlDepth),steel,bx+sign*bowlWidth/2,-.052,0);
      add(new THREE.BoxGeometry(bowlWidth,.12,.010),steel,bx,-.052,sign*bowlDepth/2);
     }
     add(new THREE.TorusGeometry(.027,.007,8,18),dark,bx,-.105,0,-Math.PI/2);
    }
    if(drainer)for(const n of [1,2,3,4])
     add(new THREE.BoxGeometry(.008,.005,o.depth*.61),silver,o.width*(.10+n*.045),.018,0);
    const faucet=o.faucetModel||'arc',rear=-o.depth*.39;
    if(faucet==='wall'){
     for(const x of [-.09,.09]){
      add(new THREE.CylinderGeometry(.018,.018,.030,8),silver,x,.16,rear-.018,Math.PI/2);
      add(new THREE.BoxGeometry(.052,.009,.018),silver,x,.16,rear+.012);
     }
     add(new THREE.CylinderGeometry(.011,.011,.10,10),silver,0,.16,rear,.5*Math.PI);
     add(new THREE.CylinderGeometry(.013,.013,.11,10),silver,0,.115,rear+.07);
    }else{
     const height=faucet==='gooseneck'?.32:faucet==='pullout'?.29:faucet==='square'?.26:.20;
     add(new THREE.CylinderGeometry(.015,.017,height,10),silver,0,height/2,rear);
     if(faucet==='square'){
      add(new THREE.BoxGeometry(.018,.018,.16),silver,0,height,rear+.075);
      add(new THREE.BoxGeometry(.024,.06,.024),silver,0,height-.035,rear+.15);
     }else{
      const arc=add(new THREE.TorusGeometry(faucet==='gooseneck'?.095:.078,.012,8,20,Math.PI),silver,0,height,rear);
      arc.rotation.z=Math.PI/2;
      if(faucet==='pullout'){
       add(new THREE.CylinderGeometry(.017,.012,.085,10),dark,0,height-.07,rear+.085);
       add(new THREE.CylinderGeometry(.009,.009,.045,8),silver,.036,.044,rear+.015);
      }
     }
     add(new THREE.BoxGeometry(.047,.009,.016),silver,.042,.04,rear);
    }
   }
   for(const m of [steel,dark,silver])m.dispose();
  }
  for(const m of [plaster,selected,frame,glass,wood,cabinetSelected])m.dispose();
  this.buildRoomSurfaces();
  this.applyRaycastAO();
  this.selectedId=selectedId;
  this.highlightSelection();
  this.updateEditHandles();
  this.reflectionDirty=true;
  this.renderPreview();
 }
 /* Geometry-based ambient occlusion: hemisphere rays against actual neighboring meshes.
    Computed only when geometry or AO strength changes, never per XR frame. */
 applyRaycastAO(){
  if(!this.objectGroup)return;
  const strength=THREE.MathUtils.clamp(this.renderSettings?.aoStrength??.65,0,1);
  if(strength<.025)return;
  this.objectGroup.updateWorldMatrix(true,true);
  // Spatial pruning keeps occlusion linear in local neighbors instead of
  // raycasting every handle and every vertex against the entire kitchen.
  const cast=[];
  this.objectGroup.traverse(n=>{
   if(!n.isMesh||!n.geometry?.attributes?.normal||n.material?.transparent)return;
   n.geometry.computeBoundingSphere();
   const center=n.geometry.boundingSphere.center.clone().applyMatrix4(n.matrixWorld);
   const radius=n.geometry.boundingSphere.radius*n.getWorldScale(new THREE.Vector3()).length()/Math.sqrt(3);
   cast.push({mesh:n,center,radius});
  });
  const ray=new THREE.Raycaster(),normal=new THREE.Vector3(),tangent=new THREE.Vector3(),bitangent=new THREE.Vector3();
  const axes=[[0,0],[.68,0],[-.68,0],[0,.68],[0,-.68]];
  for(const subject of cast){
   const mesh=subject.mesh,geo=mesh.geometry,position=geo.getAttribute('position'),normals=geo.getAttribute('normal');
   if(position.count>1200)continue; // Never bake AO on detailed imported equipment.
   const nearby=cast.filter(q=>q!==subject&&q.center.distanceTo(subject.center)<q.radius+subject.radius+.78)
    .map(q=>q.mesh);
   if(!nearby.length)continue;
   const colours=[];
   for(let i=0;i<position.count;i++){
    const world=new THREE.Vector3().fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);
    normal.fromBufferAttribute(normals,i).transformDirection(mesh.matrixWorld).normalize();
    const ref=Math.abs(normal.y)>.91?new THREE.Vector3(1,0,0):new THREE.Vector3(0,1,0);
    tangent.crossVectors(normal,ref).normalize();bitangent.crossVectors(normal,tangent).normalize();
    let blocked=0;
    for(const [x,y] of axes){
     const dir=normal.clone().addScaledVector(tangent,x).addScaledVector(bitangent,y).normalize();
     ray.set(world.clone().addScaledVector(normal,.018),dir);ray.near=.005;ray.far=.66;
     const hit=ray.intersectObjects(nearby,false)[0];
     if(hit)blocked+=1-hit.distance/.66;
    }
    const ao=THREE.MathUtils.clamp(1-strength*(blocked/axes.length)*.95,.48,1);
    colours.push(ao,ao,ao);
   }
   geo.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));
   mesh.material.vertexColors=true;mesh.material.needsUpdate=true;
  }
 }


 async stop(){if(this.session)try{await this.session.end();}catch{this.cleanup();}}
 cleanup(){
  if(this.frontAnimationFrame)cancelAnimationFrame(this.frontAnimationFrame);
  this.frontAnimationFrame=null;this.frontMotions.clear();this.frontControls.clear();
  this.hitSource?.cancel();this.lowerHitSource?.cancel?.();for(const s of this.sources)try{s.cancel();}catch{}
  this.clearSelectionHighlight();
  this.disableWideView();this.wideRenderer?.dispose();this.wideRenderer?.domElement.remove();
  this.wideRenderer=null;this.wideCamera=null;
  this.renderer?.setAnimationLoop(null);this.reflectionRT?.dispose();this.renderer?.dispose();this.renderer?.domElement.remove();
  this.renderer=null;this.session=null;this.objectGroup=null;this.previewGroup=null;this.exit?.();
 }
}
function createFloorNet(){
 const fragment='precision highp float;varying vec2 gridUv;uniform float opacity;uniform float reveal;uniform float pulse;void main(){vec2 cells=gridUv*60.0;vec2 dx=max(fwidth(cells),vec2(0.0001));vec2 line=abs(fract(cells+0.5)-0.5)/dx;float px=min(line.x,line.y);float core=1.0-smoothstep(0.7,1.65,px);float glow=1.0-smoothstep(1.2,5.2,px);float radius=length((gridUv-0.5)*6.0);float edge=1.0-smoothstep(reveal-0.06,reveal+0.06,radius);float rim=(1.0-smoothstep(0.025,0.11,abs(radius-reveal)))*(1.0-step(2.95,reveal));float alpha=clamp((0.72*core+0.32*glow)*opacity*edge+rim*0.65*pulse,0.0,0.95);gl_FragColor=vec4(mix(vec3(0.20,0.57,0.52),vec3(0.55,0.97,0.83),max(core,rim)),alpha);}';
 const net=new THREE.Mesh(new THREE.PlaneGeometry(6,6),new THREE.ShaderMaterial({
  transparent:true,depthWrite:false,side:THREE.DoubleSide,extensions:{derivatives:true},
  uniforms:{opacity:{value:.85},reveal:{value:1},pulse:{value:0}},
  vertexShader:'varying vec2 gridUv;void main(){gridUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:fragment
 }));
 net.rotation.x=-Math.PI/2;net.position.y=.004;return net;
}

function nearestWallLocal(items,x,z,tolerance=.65){
 let best=null,d=tolerance;
 for(const w of items)if(w.kind==='wall'){
  const len=(w.x2-w.x1)**2+(w.z2-w.z1)**2;
  if(len<.01)continue;
  const t=THREE.MathUtils.clamp(((x-w.x1)*(w.x2-w.x1)+(z-w.z1)*(w.z2-w.z1))/len,0,1);
  const dist=Math.hypot(x-w.x1-t*(w.x2-w.x1),z-w.z1-t*(w.z2-w.z1));
  if(dist<d){best=w;d=dist;}
 }
 return best;
}
