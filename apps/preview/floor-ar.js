/* Chido v0.5.7 floor detection adapter, pinned to its exact source commit. */
import * as THREE from 'https://cdn.jsdelivr.net/gh/MaxLightner/tolica-ar@0abbab05c15eed4f3922d1e1dc74b5c17b82e8be/vendor/three.module.js';
import {FloorScanner,floorCandidates} from 'https://cdn.jsdelivr.net/gh/MaxLightner/tolica-ar@0abbab05c15eed4f3922d1e1dc74b5c17b82e8be/surfaces.js';
import {requestARSession} from 'https://cdn.jsdelivr.net/gh/MaxLightner/tolica-ar@0abbab05c15eed4f3922d1e1dc74b5c17b82e8be/xr.js';
import {AnchorStabilizer,transformPoint} from 'https://cdn.jsdelivr.net/gh/MaxLightner/tolica-ar@0abbab05c15eed4f3922d1e1dc74b5c17b82e8be/anchor-rig.js';
import {limitCabinetEnd,EQUIPMENT_SPECS} from './geometry.js?v=render9';

const RAYS=[[-.24,0],[.24,0],[0,-.24],[0,.24],[-.18,-.18],[.18,-.18],[-.18,.18],[.18,.18]];
export class FloorAR {
 constructor(root,update,exit){
  Object.assign(this,{root,update,exit,session:null,renderer:null,locked:false,current:null,origin:null});
  this.scanner=new FloorScanner();this.rig=new AnchorStabilizer();this.sources=[];this.anchors=[];
  this.candidates=[];this.pending=false;this.points={a:null,b:null};this.lastReport=0;this.lastTime=0;
   this.items=[];this.selectedId=null;this.drawing=null;this.targetLocal=null;this.lastPose=null;this.gridYaw=0;
   this.renderSettings={sunAzimuth:-40,sunElevation:55,sunIntensity:2.1,ambientIntensity:1,aoStrength:.65,reflection:.10};
 }
 report(message,extra={}){
  this.update({message,locked:this.locked,ready:this.scanner.ready,
   progress:Math.min(100,Math.round(this.scanner.observations.length/3*100)),
   valid:this.scanner.validHits,inliers:this.scanner.inlierHits,raw:this.scanner.rawHits,
   anchors:this.anchors.length,depth:this.renderer?.xr?.hasDepthSensing?.()||false,
   direction:this.points?.a&&this.points?.b?Math.round(this.gridYaw*180/Math.PI):null,...extra});
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
   const point=(color,name)=>{const mesh=new THREE.Mesh(new THREE.SphereGeometry(.075,20,16),
    new THREE.MeshBasicMaterial({color,depthTest:false}));mesh.renderOrder=12;
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=80;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff9ee';ctx.beginPath();ctx.roundRect(2,2,124,76,12);ctx.fill();
    ctx.fillStyle='#2d4436';ctx.font='bold 54px Tahoma';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(name,64,41);
    const label=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),depthTest:false}));
    label.position.y=.16;label.scale.set(.26,.16,1);label.renderOrder=13;mesh.add(label);
    return mesh;};
   this.markA=point(0xe5a45b,'A');this.markB=point(0x57b7aa,'B');
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
 async scan(){
  if(!this.session)return;
  this.scanner.reset();this.locked=false;this.current=null;this.points={a:null,b:null};
  this.rig=new AnchorStabilizer();this.candidates=[];this.pending=false;
  for(const a of this.anchors)try{a.anchor.delete();}catch{}this.anchors=[];
  this.hitSource?.cancel();
  for(const s of this.sources)try{s.cancel();}catch{}this.sources=[];
  this.net.visible=false;this.net.rotation.z=0;this.gridYaw=0;this.whiteFloor.visible=false;this.shadowFloor.visible=false;
  this.previewGroup.visible=false;this.ruler.visible=false;this.marks.forEach(m=>m.visible=false);
  const viewer=await this.session.requestReferenceSpace('viewer');
  this.lowerHitSource?.cancel?.();this.lowerHitSource=null;
  if(window.XRRigidTransform){try{
   const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1),new THREE.Vector3(0,-.38,-1).normalize());
   const lower=viewer.getOffsetReferenceSpace(new XRRigidTransform({}, {x:q.x,y:q.y,z:q.z,w:q.w}));
   this.lowerHitSource=await this.session.requestHitTestSource({space:lower,entityTypes:['plane']});
  }catch(error){console.debug('Lower reticle hit-test unavailable',error);}}

  this.hitSource=await this.session.requestHitTestSource({space:viewer,entityTypes:['plane']});
  if(window.XRRigidTransform){
   for(const [x,y] of RAYS){
    try{
     const direction=new THREE.Vector3(x,y,-1).normalize();
     const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,-1),direction);
     const ray=viewer.getOffsetReferenceSpace(new XRRigidTransform({}, {x:q.x,y:q.y,z:q.z,w:q.w}));
     this.sources.push(await this.session.requestHitTestSource({space:ray,entityTypes:['plane']}));
    }catch(error){console.debug('Optional Chido hit ray unavailable',error);break;}
   }
  }
  this.report('در حال یافتن سطح افقی...');
 }
 confirm(){
  if(!this.scanner.ready||!this.scanner.point||this.locked)return false;
  this.locked=true;this.origin=this.scanner.point.clone();
  this.floorGroup.position.copy(this.origin);
  this.net.material.uniforms.reveal.value=2.8;this.net.material.uniforms.pulse.value=0;
  this.net.material.uniforms.opacity.value=.39;this.net.visible=true;
  this.whiteFloor.visible=true;this.shadowFloor.visible=true;
  this.marks.forEach(m=>m.visible=false);
  this.candidates=[this.origin.clone(),...this.scanner.observations.map(p=>p.clone())];
  this.points={a:new THREE.Vector3(-.5,0,.65),b:new THREE.Vector3(.5,0,.65)};
  this.drawRuler();
  this.report('کف تثبیت شد. A یا B را با نشانگر جابه‌جا کن؛ شبکه هم‌جهت می‌شود.',{progress:100});
  return true;
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
  this.report('مقیاس نمایش تصحیح شد؛ داده هندسی پروژه ثابت است.',{distance:measured,ratio});
  return ratio;
 }
 drawRuler(){
  const a=this.points.a,b=this.points.b;
  this.ruler.visible=!!(a||b);
  this.markA.visible=!!a;this.markB.visible=!!b;
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
  if(this.hitSource){
   const center=frame.getHitTestResults(this.hitSource),extra=[];
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
 }
 updateAnchors(frame,time,center,viewer){
  for(const hit of floorCandidates(center,this.space,viewer)){
   if(Math.abs(hit.point.y-this.origin.y)>.055)continue;
   if(this.candidates.every(p=>p.distanceTo(hit.point)>.42))this.candidates.push(hit.point.clone());
  }
  if(!frame.createAnchor||!window.XRRigidTransform)return;
  if(this.anchors.length<5&&!this.pending){
   const p=this.candidates.find(p=>this.anchors.every(a=>a.requested.distanceTo(p)>.42));
   if(p){
    this.pending=true;
    frame.createAnchor(new XRRigidTransform({x:p.x,y:p.y,z:p.z}),this.space)
     .then(anchor=>this.anchors.push({anchor,requested:p.clone()})).catch(()=>{})
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
   this.floorGroup.position.set(p[0],p[1],p[2]);this.floorGroup.rotation.y=fit.pose.yaw;
  }
  this.lastTime=time;
 }
 /* Exact viewport NDC = x:0 and y:-1/3 (lower third) or +1/3 (upper third).
    Inverse XR projection, not a hardcoded device-specific ray slope. */
 screenRay(pose,upper=false,x=0,y=null){
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
 pickObject(clientX,clientY){
  if(!this.locked||!this.lastPose||!this.objectGroup)return null;
  const rect=this.renderer.domElement.getBoundingClientRect();
  const x=(clientX-rect.left)/rect.width*2-1,y=1-(clientY-rect.top)/rect.height*2;
  const ray=this.screenRay(this.lastPose,false,x,y);if(!ray)return null;
  const caster=new THREE.Raycaster(ray.origin,ray.direction,.05,12);
  this.objectGroup.updateWorldMatrix(true,true);
  const hit=caster.intersectObjects(this.objectGroup.children,true);
  return hit.find(h=>h.object.userData.objectId||h.object.parent?.userData.objectId)?.object.userData.objectId||
   hit.find(h=>h.object.parent?.userData.objectId)?.object.parent.userData.objectId||null;
 }
 pick(){
  if(!this.locked||!this.floorGroup)return null;
  if(this.targetLocal)return {...this.targetLocal};
  if(!this.current)return null;
  this.floorGroup.updateWorldMatrix(true,false);
  const v=this.floorGroup.worldToLocal(this.current.clone());
  return {x:v.x,z:v.z};
 }
 setItems(items,selectedId=null){this.items=structuredClone(items||[]);this.selectedId=selectedId;this.rebuildObjects();}
 setLighting(options={}){
  const before=this.renderSettings||{},next={...before,...options};
  const changed=next.aoStrength!==before.aoStrength||next.reflection!==before.reflection;
  this.renderSettings=next;
  if(this.sun){
   const az=THREE.MathUtils.degToRad(next.sunAzimuth),el=THREE.MathUtils.degToRad(next.sunElevation);
   const r=8;this.sun.position.set(r*Math.cos(el)*Math.cos(az),r*Math.sin(el),r*Math.cos(el)*Math.sin(az));
   this.sun.intensity=next.sunIntensity;this.sun.target.position.set(0,0,0);
   this.sun.shadow.needsUpdate=true;this.ambient.intensity=next.ambientIntensity;
  }
  if(changed)this.rebuildObjects();
 }
 setDrawing(start,kind){
  this.drawing=kind?{start,kind}:null;
  if(!kind&&this.previewGroup)this.previewGroup.visible=false;
 }
 updatePreview(){
  if(!this.previewGroup)return;
  const group=this.previewGroup;
  while(group.children.length){const c=group.children[0];group.remove(c);c.geometry?.dispose();c.material?.dispose();}
  if(!this.drawing){group.visible=false;return;}
  const p=this.pick();if(!p){group.visible=false;return;}
  const kind=this.drawing.kind,a=this.drawing.start;
  let from=a||p,to=p,width,level=0,height,colour;
  if(EQUIPMENT_SPECS[kind]){
   const spec=EQUIPMENT_SPECS[kind];let at=p,rotation=0,level=0;
   if(kind!=='fridge'){
    const nearest=this.items.filter(x=>x.kind==='cabinet'&&x.subtype==='base')
     .map(c=>{const len=Math.hypot(c.x2-c.x1,c.z2-c.z1);
      const t=THREE.MathUtils.clamp(((p.x-c.x1)*(c.x2-c.x1)+(p.z-c.z1)*(c.z2-c.z1))/(len*len),0,1);
      const x=c.x1+t*(c.x2-c.x1),z=c.z1+t*(c.z2-c.z1);
      return {c,x,z,d:Math.hypot(x-p.x,z-p.z)};}).sort((a,b)=>a.d-b.d)[0];
    if(!nearest||nearest.d>nearest.c.depth/2+.2||Math.hypot(nearest.c.x2-nearest.c.x1,nearest.c.z2-nearest.c.z1)<spec.width+.04){
     group.visible=false;return;
    }
    at={x:nearest.x,z:nearest.z};rotation=Math.atan2(nearest.c.z2-nearest.c.z1,nearest.c.x2-nearest.c.x1);
    level=nearest.c.elevation+nearest.c.height;
   }
   const ghost=new THREE.Mesh(new THREE.BoxGeometry(spec.width,spec.height,spec.depth),
    new THREE.MeshPhysicalMaterial({color:kind==='fridge'?0xd9e3e2:kind==='stove'?0x657276:0x79b2b1,
     transparent:true,opacity:.50,depthWrite:false,roughness:.35}));
   ghost.position.set(at.x,level+spec.height/2,at.z);ghost.rotation.y=-rotation;
   ghost.renderOrder=20;group.add(ghost);group.visible=true;return;
  }
  if(kind==='wall'){if(!a)to={x:p.x+1.1,z:p.z};width=.12;height=2.8;colour=0x67cba7;}
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
     const t=limitCabinetEnd(this.items,host,from.t,to.t,{kind:'upper'});
     to=project({x:host.x1+t*(host.x2-host.x1),z:host.z1+t*(host.z2-host.z1)});
    }catch{group.visible=false;return;}
    if(!a&&Math.hypot(to.x-from.x,to.z-from.z)<.3){
     from=project({x:p.x-(host.x2-host.x1)/len,z:p.z-(host.z2-host.z1)/len});
    }
    width=kind==='upper'?.35:.60;level=kind==='upper'?1.55:.08;height=kind==='upper'?.72:.78;colour=kind==='upper'?0xe5c79a:0xbca289;
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
  for(const mesh of [...this.objectGroup.children]){
   this.objectGroup.remove(mesh);
   mesh.traverse(n=>{n.geometry?.dispose();if(n.material)for(const m of (Array.isArray(n.material)?n.material:[n.material]))m.dispose();});
  }
  const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.65,...extra});
  const plaster=material(0xd7dbd1),selected=material(0x65ac8e),frame=material(0xf0eee6);
  const glass=new THREE.MeshPhysicalMaterial({color:0x9dcede,transparent:true,opacity:.48,roughness:.18,depthWrite:false,side:THREE.DoubleSide});
  const wood=material(0x8a6d50);
  const cabinet=(color)=>new THREE.MeshPhysicalMaterial({
   color,roughness:.36,metalness:.08,clearcoat:.10,clearcoatRoughness:.22,
   envMap:this.reflectionRT?.texture,envMapIntensity:this.renderSettings.reflection
  });
  const base=cabinet(0xbda995),upper=cabinet(0xe2ded4);
  const cabinetSelected=cabinet(0x65ac8e);
  const box=(owner,from,to,y0,y1,width,angle,cx,cz,mat)=>{
   if(to-from<.002||y1-y0<.002)return;
   const mesh=new THREE.Mesh(new THREE.BoxGeometry(to-from,y1-y0,width),mat.clone());
   mesh.position.set(cx,(y0+y1)/2,cz);mesh.rotation.y=-angle;
   mesh.userData.objectId=owner.id;mesh.userData.wall=owner.kind==='wall';
   mesh.userData.cabinet=owner.kind==='cabinet';
   mesh.castShadow=true;mesh.receiveShadow=true;this.objectGroup.add(mesh);
  };
  for(const w of this.items.filter(x=>x.kind==='wall')){
   const dx=w.x2-w.x1,dz=w.z2-w.z1,len=Math.hypot(dx,dz);if(len<.1)continue;
   const angle=Math.atan2(dz,dx),ux=dx/len,uz=dz/len;
   const piece=(a,b,y0,y1,width,mat)=>{
    const t=(a+b)/2;box(w,a,b,y0,y1,width,angle,w.x1+t*ux,w.z1+t*uz,mat);
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
    piece(o.a,o.a+edge,o.sill,o.sill+o.height,t,frame);
    piece(o.b-edge,o.b,o.sill,o.sill+o.height,t,frame);
    piece(o.a,o.b,o.sill+o.height-edge,o.sill+o.height,t,frame);
    if(o.style==='fixed'){
     piece(o.a,o.b,o.sill,o.sill+edge,t,frame);
     piece(o.a+edge,o.b-edge,o.sill+edge,o.sill+o.height-edge,.015,glass);
    }else{
     const hingeX=w.x1+o.a*ux,hingeZ=w.z1+o.a*uz;
     const pivot=new THREE.Group();pivot.position.set(hingeX,0,hingeZ);
     pivot.rotation.y=-angle+(o.mirrored?1:-1)*(o.openFraction||0)*Math.PI/2;
     const panel=new THREE.Mesh(new THREE.BoxGeometry(o.width-edge,o.height,.047),wood.clone());
     panel.position.set((o.width-edge)/2,o.height/2,0);
     panel.castShadow=true;panel.receiveShadow=true;pivot.add(panel);this.objectGroup.add(pivot);
    }
    last=o.b;
   }
   piece(last,len,0,w.height,w.thickness,fill);
   if(w.id===this.selectedId)for(const p of [{x:w.x1,z:w.z1},{x:w.x2,z:w.z2}]){
    const dot=new THREE.Mesh(new THREE.SphereGeometry(.065,10,8),selected.clone());
    dot.position.set(p.x,.08,p.z);this.objectGroup.add(dot);
   }
  }
  for(const c of this.items.filter(x=>x.kind==='cabinet')){
   const len=Math.hypot(c.x2-c.x1,c.z2-c.z1);if(len<.3)continue;
   const angle=Math.atan2(c.z2-c.z1,c.x2-c.x1),y0=c.elevation??.1;
   box(c,0,len,y0,y0+c.height,c.depth,angle,(c.x1+c.x2)/2,(c.z1+c.z2)/2,
    c.id===this.selectedId?cabinetSelected:c.subtype==='upper'?upper:base);
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
    add(new THREE.BoxGeometry(o.width,o.height,o.depth),steel,0,o.height/2,0);
    add(new THREE.BoxGeometry(o.width*.94,o.height*.94,.027),steel,0,o.height/2,o.depth/2+.018);
    add(new THREE.BoxGeometry(o.width*.92,.014,.025),dark,0,o.height*.43,o.depth/2+.040);
    add(new THREE.CylinderGeometry(.009,.009,.35,8),silver,o.width*.38,o.height*.72,o.depth/2+.057);
   }else if(o.subtype==='stove'){
    add(new THREE.BoxGeometry(o.width,o.height*.65,o.depth),dark,0,o.height*.35,0);
    add(new THREE.BoxGeometry(o.width*.96,.009,o.depth*.94),steel,0,o.height*.72,0);
    for(const x of [-.145,.145])for(const z of [-.115,.115]){
     const burner=add(new THREE.TorusGeometry(.075,.009,8,20),silver,x,o.height*.82,z,-Math.PI/2);
     burner.castShadow=false;
    }
    for(const x of [-.18,-.06,.06,.18])add(new THREE.CylinderGeometry(.018,.018,.02,10),dark,x,o.height*.79,o.depth*.44);
   }else if(o.subtype==='sink'){
    add(new THREE.BoxGeometry(o.width,.028,o.depth),silver,0,.014,0);
    add(new THREE.BoxGeometry(o.width*.72,.016,o.depth*.65),dark,0,.028,0);
    add(new THREE.BoxGeometry(o.width*.65,.012,o.depth*.58),steel,0,.034,0);
    add(new THREE.CylinderGeometry(.014,.014,.19,12),silver,0,.115,-o.depth*.35);
    const arc=add(new THREE.TorusGeometry(.085,.014,8,18,Math.PI),silver,0,.21,-o.depth*.35);
    arc.rotation.z=Math.PI/2;
   }
   for(const m of [steel,dark,silver])m.dispose();
  }
  for(const m of [plaster,selected,frame,glass,wood,base,upper,cabinetSelected])m.dispose();
  this.applyRaycastAO();
  this.reflectionDirty=true;
 }
 /* Geometry-based ambient occlusion: hemisphere rays against actual neighboring meshes.
    Computed only when geometry or AO strength changes, never per XR frame. */
 applyRaycastAO(){
  if(!this.objectGroup)return;
  this.floorGroup?.updateWorldMatrix(true,true);
  const meshes=[];
  this.objectGroup.traverse(n=>{if(n.isMesh&&n.geometry?.attributes?.normal)meshes.push(n);});
  const cast=meshes.filter(m=>!m.material.transparent),ray=new THREE.Raycaster();
  const up=new THREE.Vector3(),normal=new THREE.Vector3(),tangent=new THREE.Vector3(),bitangent=new THREE.Vector3();
  const axes=[[0,0],[.74,0],[-.74,0],[0,.74],[0,-.74],[.48,.48],[-.48,-.48]];
  const strength=THREE.MathUtils.clamp(this.renderSettings?.aoStrength??.65,0,1);
  for(const mesh of cast){
   const geo=mesh.geometry,position=geo.getAttribute('position'),normals=geo.getAttribute('normal');
   const colours=[];
   const nearby=cast.filter(other=>other!==mesh);
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
  this.hitSource?.cancel();this.lowerHitSource?.cancel?.();for(const s of this.sources)try{s.cancel();}catch{}
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
