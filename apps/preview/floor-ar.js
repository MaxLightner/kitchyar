/* Chido v0.5.7 floor detection adapter, pinned to its exact source commit. */
import * as THREE from 'https://cdn.jsdelivr.net/gh/MaxLightner/tolica-ar@0abbab05c15eed4f3922d1e1dc74b5c17b82e8be/vendor/three.module.js';
import {FloorScanner,floorCandidates} from 'https://cdn.jsdelivr.net/gh/MaxLightner/tolica-ar@0abbab05c15eed4f3922d1e1dc74b5c17b82e8be/surfaces.js';
import {requestARSession} from 'https://cdn.jsdelivr.net/gh/MaxLightner/tolica-ar@0abbab05c15eed4f3922d1e1dc74b5c17b82e8be/xr.js';
import {AnchorStabilizer,transformPoint} from 'https://cdn.jsdelivr.net/gh/MaxLightner/tolica-ar@0abbab05c15eed4f3922d1e1dc74b5c17b82e8be/anchor-rig.js';

const RAYS=[[-.24,0],[.24,0],[0,-.24],[0,.24],[-.18,-.18],[.18,-.18],[-.18,.18],[.18,.18]];
export class FloorAR {
 constructor(root,update,exit){
  Object.assign(this,{root,update,exit,session:null,renderer:null,locked:false,current:null,origin:null});
  this.scanner=new FloorScanner();this.rig=new AnchorStabilizer();this.sources=[];this.anchors=[];
  this.candidates=[];this.pending=false;this.points={a:null,b:null};this.lastReport=0;this.lastTime=0;
   this.items=[];this.selectedId=null;this.drawing=null;
 }
 report(message,extra={}){
  this.update({message,locked:this.locked,ready:this.scanner.ready,
   progress:Math.min(100,Math.round(this.scanner.observations.length/3*100)),
   valid:this.scanner.validHits,inliers:this.scanner.inlierHits,raw:this.scanner.rawHits,
   anchors:this.anchors.length,...extra});
 }
 async start(){
  if(this.session)return;
  if(!navigator.xr||!isSecureContext)throw Error('این مرورگر از AR پشتیبانی نمی‌کند. برای اسکن کف از Chrome اندروید و ARCore استفاده کن.');
  // Preserve click activation: requestSession is the first asynchronous operation.
  const requesting=requestARSession(navigator.xr,this.root,false,{});
  this.session=await requesting;
  try{
   this.scene=new THREE.Scene();this.camera=new THREE.PerspectiveCamera();
   this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
   this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));
   this.renderer.xr.enabled=true;this.renderer.xr.setReferenceSpaceType('local');
   this.renderer.domElement.className='xr-canvas';
   this.root.querySelector('.editor-scene').prepend(this.renderer.domElement);
   await this.renderer.xr.setSession(this.session);
   this.space=this.renderer.xr.getReferenceSpace();
   this.floorGroup=new THREE.Group();this.scene.add(this.floorGroup);
    this.scene.add(new THREE.HemisphereLight(0xffffff,0x7d8b80,2.0));
    const sun=new THREE.DirectionalLight(0xfff4e2,2.1);sun.position.set(-3,6,4);this.scene.add(sun);
    this.objectGroup=new THREE.Group();this.floorGroup.add(this.objectGroup);
    this.previewLine=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xffd16e,depthTest:false,linewidth:2}));
    this.previewLine.visible=false;this.previewLine.renderOrder=20;this.floorGroup.add(this.previewLine);
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
   const point=(color)=>new THREE.Mesh(new THREE.SphereGeometry(.04,12,10),new THREE.MeshBasicMaterial({color,depthTest:false}));
   this.markA=point(0xe0a763);this.markB=point(0x5bbba7);
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
  this.net.visible=false;this.ruler.visible=false;this.marks.forEach(m=>m.visible=false);
  const viewer=await this.session.requestReferenceSpace('viewer');
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
  this.marks.forEach(m=>m.visible=false);
  this.candidates=[this.origin.clone(),...this.scanner.observations.map(p=>p.clone())];
  this.report('کف تثبیت شد. اکنون نقاط A و B را ثبت کن.',{progress:100});
  return true;
 }
 capture(which){
  if(!this.locked||!this.current)return false;
  this.points[which]=this.current.clone();if(which==='a')this.points.b=null;
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
  if(a)this.markA.position.copy(a).sub(this.origin);
  if(b)this.markB.position.copy(b).sub(this.origin);
  this.rulerLine.visible=!!(a&&b);
  if(a&&b){
   this.rulerLine.geometry.dispose();
   this.rulerLine.geometry=new THREE.BufferGeometry().setFromPoints([a.clone().sub(this.origin),b.clone().sub(this.origin)]);
   const length=a.distanceTo(b),steps=Math.min(200,Math.floor(length/.1));
   const direction=b.clone().sub(a).normalize(),normal=new THREE.Vector3(-direction.z,0,direction.x),ticks=[];
   for(let i=0;i<=steps;i++){
    const center=a.clone().addScaledVector(direction,i*.1).sub(this.origin),half=(i%5===0?.07:.035);
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
    this.current=floorCandidates(center,this.space,viewer)
      .find(h=>Math.abs(h.point.y-this.origin.y)<.055)?.point||null;
    this.updateAnchors(frame,time,center,viewer);
     this.updatePreview();
   }
  }
  if(time-this.lastReport>350){
   this.report(!this.locked?(this.scanner.ready?'کف آماده است؛ «تثبیت این کف» را بزن.':'نشانگر را روی کف حرکت بده.'):
    (this.current?'سطح معتبر است؛ نقطه مرجع را ثبت کن.':'مرجع حفظ شده؛ سطح معتبر زیر نشانگر نیست.'),{tracking:true});
   this.lastReport=time;
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
 pick(){
  if(!this.locked||!this.current||!this.floorGroup)return null;
  this.floorGroup.updateWorldMatrix(true,false);
  const v=this.floorGroup.worldToLocal(this.current.clone());
  return {x:v.x,z:v.z};
 }
 setItems(items,selectedId=null){this.items=structuredClone(items||[]);this.selectedId=selectedId;this.rebuildObjects();}
 setDrawing(start,kind){this.drawing=start?{start,kind}:null;if(!start&&this.previewLine)this.previewLine.visible=false;}
 updatePreview(){
  if(!this.previewLine||!this.drawing)return;
  const end=this.pick();if(!end)return;
  this.previewLine.geometry.dispose();
  this.previewLine.geometry=new THREE.BufferGeometry().setFromPoints([
   new THREE.Vector3(this.drawing.start.x,.08,this.drawing.start.z),new THREE.Vector3(end.x,.08,end.z)]);
  this.previewLine.visible=true;
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
  const wood=material(0x8a6d50),base=material(0xbda995),upper=material(0xe2ded4);
  const box=(owner,from,to,y0,y1,width,angle,cx,cz,mat)=>{
   if(to-from<.002||y1-y0<.002)return;
   const mesh=new THREE.Mesh(new THREE.BoxGeometry(to-from,y1-y0,width),mat.clone());
   mesh.position.set(cx,(y0+y1)/2,cz);mesh.rotation.y=-angle;mesh.userData.objectId=owner.id;this.objectGroup.add(mesh);
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
    }else piece(o.a+edge,o.b-edge,0,o.height,.047,wood);
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
    c.id===this.selectedId?selected:c.subtype==='upper'?upper:base);
  }
  for(const m of [plaster,selected,frame,glass,wood,base,upper])m.dispose();
 }

 async stop(){if(this.session)try{await this.session.end();}catch{this.cleanup();}}
 cleanup(){
  this.hitSource?.cancel();for(const s of this.sources)try{s.cancel();}catch{}
  this.renderer?.setAnimationLoop(null);this.renderer?.dispose();this.renderer?.domElement.remove();
  this.renderer=null;this.session=null;this.objectGroup=null;this.previewLine=null;this.exit?.();
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
