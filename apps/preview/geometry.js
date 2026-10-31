/*
 * Browser port of Archyar domain/WallTopology.java and DrawingSnap.java.
 * Source: MaxLightner/archyar main (private), 89283efb, 2026-10-31.
 * Metres, stable shared endpoint node IDs, transactional topology.
 */
export const SNAP_RADIUS=.50;
const uid=()=>globalThis.crypto?.randomUUID?.()||'node-'+Math.random().toString(36).slice(2);
const dist=(ax,az,bx,bz)=>Math.hypot(bx-ax,bz-az);
const finite=(...v)=>v.every(Number.isFinite);
const copy=items=>structuredClone(items);
export const lengthOf=w=>dist(w.x1,w.z1,w.x2,w.z2);
const wall=w=>w?.kind==='wall';
const byId=(items,id)=>items.find(w=>w.id===id);
function renameNode(items,from,to){
 if(!from||from===to)return;
 for(const w of items)if(wall(w)){
  if(w.startNodeId===from)w.startNodeId=to;
  if(w.endNodeId===from)w.endNodeId=to;
 }
}
function normalize(items){
 for(const w of items)if(wall(w)){w.startNodeId ||= uid();w.endNodeId ||= uid();}
 for(let a=0;a<items.length;a++)for(let b=a+1;b<items.length;b++){
  const x=items[a],y=items[b];if(!wall(x)||!wall(y))continue;
  for(const ea of ['start','end'])for(const eb of ['start','end']){
   const xa=ea==='start'?x.x1:x.x2,za=ea==='start'?x.z1:x.z2;
   const xb=eb==='start'?y.x1:y.x2,zb=eb==='start'?y.z1:y.z2;
   if(dist(xa,za,xb,zb)<.000001)renameNode(items,y[eb+'NodeId'],x[ea+'NodeId']);
  }
 }
}
function checkWall(a,b,thickness,height){
 if(!finite(a.x,a.z,b.x,b.z,thickness,height))throw Error('ابعاد دیوار نامعتبر است.');
 if(dist(a.x,a.z,b.x,b.z)<.10)throw Error('طول دیوار باید حداقل ۱۰ سانتی‌متر باشد.');
 if(thickness<.07||thickness>.8||height<.4||height>9)
  throw Error('ارتفاع یا ضخامت دیوار خارج از بازه است.');
}
export function snap(items,x,z,tolerance=SNAP_RADIUS){
 let best={x,z,distance:Infinity,nodeId:null,wallId:null,type:'free'};
 if(!finite(x,z,tolerance)||tolerance<=0)return best;
 for(const w of items){
  if(!wall(w)||lengthOf(w)<.10)continue;
  for(let i=0;i<2;i++){
   const px=i===0?w.x1:w.x2,pz=i===0?w.z1:w.z2,d=dist(x,z,px,pz);
   if(d<=tolerance&&(best.type!=='endpoint'||d<best.distance))
    best={x:px,z:pz,distance:d,nodeId:i===0?w.startNodeId:w.endNodeId,wallId:w.id,type:'endpoint'};
  }
  if(w.locked)continue;
  const len=lengthOf(w),t=((x-w.x1)*(w.x2-w.x1)+(z-w.z1)*(w.z2-w.z1))/(len*len);
  const margin=Math.min(.07,.08/len);
  if(t>margin&&t<1-margin){
   const px=w.x1+t*(w.x2-w.x1),pz=w.z1+t*(w.z2-w.z1),d=dist(x,z,px,pz);
   if(d<=tolerance&&best.type!=='endpoint'&&d<best.distance-.025)
    best={x:px,z:pz,distance:d,nodeId:null,wallId:w.id,type:'segment'};
  }
 }
 return best;
}
/* Archyar DrawingSnap: point/segment snapping has priority over angle lock. */
export function resolvePoint(items,start,x,z,{pointSnap=true,angleSnap=true,gridSnap=false,tolerance=SNAP_RADIUS}={}){
 if(pointSnap){
  const s=snap(items,x,z,tolerance);
  // Never magnetize the moving end back onto its own starting vertex:
  // the old half-metre snap zone caused a sudden jump when the user moved away.
  const self=s.type==='endpoint'&&start&&dist(s.x,s.z,start.x,start.z)<.025;
  if(s.type!=='free'&&!self)return {...s,label:s.type==='endpoint'?'انتهای دیوار':'اتصال میانی',pointLocked:true,angleLocked:false};
 }
 if(start&&angleSnap){
  const dx=x-start.x,dz=z-start.z,d=Math.hypot(dx,dz);
  if(d>=.10){
   const a=Math.atan2(dz,dx),step=Math.PI/4,target=Math.round(a/step)*step;
   const err=Math.atan2(Math.sin(a-target),Math.cos(a-target))*180/Math.PI;
   if(Math.abs(err)<=10)
    return {x:start.x+d*Math.cos(target),z:start.z+d*Math.sin(target),label:'زاویه '+Math.round(target*180/Math.PI)+'°',pointLocked:false,angleLocked:true,type:'angle'};
  }
 }
 if(gridSnap){x=Math.round(x*10)/10;z=Math.round(z*10)/10;}
 return {x,z,label:gridSnap?'شبکه ۱۰ سانتی‌متری':'آزاد',pointLocked:false,angleLocked:false,type:'free'};
}
export function projectOnWall(w,x,z){
 const len=lengthOf(w);
 if(len<.1)return {t:0,x:w.x1,z:w.z1,distance:Infinity};
 const t=Math.max(0,Math.min(1,((x-w.x1)*(w.x2-w.x1)+(z-w.z1)*(w.z2-w.z1))/(len*len)));
 const px=w.x1+t*(w.x2-w.x1),pz=w.z1+t*(w.z2-w.z1);
 return {t,x:px,z:pz,distance:dist(x,z,px,pz)};
}
export function nearestWall(items,x,z,tolerance=.6){
 const ranked=items.filter(wall).map(w=>({wall:w,...projectOnWall(w,x,z)}))
  .filter(s=>s.distance<=tolerance).sort((a,b)=>a.distance-b.distance);
 return ranked[0]||null;
}
export function validateHostOpenings(items,w){
 const ops=items.filter(o=>o.kind==='opening'&&o.hostId===w.id),len=lengthOf(w);
 for(const op of ops){
  const begin=op.hostT*len-op.width/2,end=op.hostT*len+op.width/2;
  if(begin<.099||end>len-.099||op.sill+op.height>w.height)
   throw Error('بازشوی متصل با تغییر هندسه ناسازگار است.');
  for(const other of ops)if(other!==op&&Math.abs(op.hostT-other.hostT)*len<(op.width+other.width)/2+.05)
   throw Error('بازشوها روی دیوار تداخل دارند.');
 }
}
function split(items,at){
 const host=byId(items,at.wallId);
 if(!host||!wall(host)||host.locked)throw Error('دیوار میزبان برای اتصال میانی آماده نیست.');
 const len=lengthOf(host);
 const t=((at.x-host.x1)*(host.x2-host.x1)+(at.z-host.z1)*(host.z2-host.z1))/(len*len);
 const left=t*len,right=(1-t)*len;
 if(t<.025||t>.975||left<.10||right<.10)throw Error('نقطه اتصال قطعه کوتاه ایجاد می‌کند.');
 const hosted=items.filter(o=>o.hostId===host.id&&o.kind==='opening');
 const cabinets=items.filter(o=>o.hostId===host.id&&o.kind==='cabinet');
 for(const c of cabinets)if(c.startT*len<left-.00001&&c.endT*len>left+.00001)
  throw Error('محل اتصال دیوار داخل کابینت است؛ نقطه دیگری انتخاب کن.');
 for(const op of hosted){
  const begin=op.hostT*len-op.width/2,end=op.hostT*len+op.width/2;
  if(begin<left+.100001&&end>left-.100001)throw Error('محل اتصال داخل بازشو است؛ نقطه دیگری انتخاب کن.');
 }
 const node=uid(),originalEnd=host.endNodeId;
 const rhs={...host,id:uid(),x1:at.x,z1:at.z,startNodeId:node,endNodeId:originalEnd};
 host.x2=at.x;host.z2=at.z;host.endNodeId=node;
 for(const op of hosted){
  const position=op.hostT*len;
  if(position<left)op.hostT=position/left;
  else {op.hostId=rhs.id;op.hostT=(position-left)/right;}
 }
 items.push(rhs);
 for(const c of cabinets){
  const a=c.startT*len,b=c.endT*len;
  if(b<=left+.00001){c.startT=a/left;c.endT=b/left;}
  else{c.hostId=rhs.id;c.startT=(a-left)/right;c.endT=(b-left)/right;}
  syncCabinet(items,c);
 }
 return node;
}
function nodeFor(items,s){
 if(s.type==='endpoint'){
  const w=byId(items,s.wallId);
  if(!w)throw Error('نقطه اتصال نامعتبر است.');
  const node=dist(s.x,s.z,w.x1,w.z1)<dist(s.x,s.z,w.x2,w.z2)?w.startNodeId:w.endNodeId;
  return node||uid();
 }
 if(s.type==='segment')return split(items,s);
 return uid();
}
function intersection(a,b){
 const rx=a.x2-a.x1,rz=a.z2-a.z1,sx=b.x2-b.x1,sz=b.z2-b.z1;
 const denom=rx*sz-rz*sx;
 if(Math.abs(denom)<1e-10)return null;
 const qx=b.x1-a.x1,qz=b.z1-a.z1;
 const t=(qx*sz-qz*sx)/denom,u=(qx*rz-qz*rx)/denom;
 if(t<0||t>1||u<0||u>1)return null;
 return {t,u,x:a.x1+rx*t,z:a.z1+rz*t};
}
function connectCrossings(items,id){
 const created=[id];let operations=0;
 for(let index=0;index<created.length;index++){
  const currentId=created[index];let changed=true;
  while(changed){
   changed=false;const current=byId(items,currentId);if(!current)break;
   for(const other of [...items]){
    if(!wall(other)||other.id===currentId||created.includes(other.id))continue;
    const cross=intersection(current,other);
    if(!cross||cross.t<=.00001||cross.t>=.99999||cross.u<=.00001||cross.u>=.99999)continue;
    if(++operations>100)throw Error('تقاطع‌ها بیش از حد پیچیده‌اند.');
    const currentNode=split(items,{...cross,wallId:current.id});
    created.push(items[items.length-1].id);
    const otherNode=split(items,{...cross,wallId:other.id});
    renameNode(items,otherNode,currentNode);changed=true;break;
   }
  }
 }
}
export function placeWall(source,start,end,{thickness=.12,height=2.8,tolerance=SNAP_RADIUS}={}){
 checkWall(start,end,thickness,height);
 const items=copy(source);normalize(items);
 const sa=snap(items,start.x,start.z,tolerance);
 const na=nodeFor(items,sa);
 let sb=snap(items,end.x,end.z,tolerance);
 if(sb.type==='endpoint'&&dist(sb.x,sb.z,start.x,start.z)<.025&&dist(end.x,end.z,start.x,start.z)>.10)
  sb={x:end.x,z:end.z,type:'free'};
 const nb=nodeFor(items,sb);
 const a=sa.type==='free'?start:sa,b=sb.type==='free'?end:sb;
 checkWall(a,b,thickness,height);
 if(na===nb)throw Error('شروع و پایان روی یک گره‌اند.');
 if(items.some(w=>wall(w)&&((w.startNodeId===na&&w.endNodeId===nb)||(w.startNodeId===nb&&w.endNodeId===na))))
  throw Error('این دیوار از قبل وجود دارد.');
 const obj={id:uid(),kind:'wall',name:'دیوار',x1:a.x,z1:a.z,x2:b.x,z2:b.z,
  thickness,height,startNodeId:na,endNodeId:nb,locked:false};
 items.push(obj);connectCrossings(items,obj.id);
 for(const w of items.filter(wall))validateCabinets(items,w);
 return {items,selectedId:obj.id,end:{x:b.x,z:b.z}};
}
/* Hosted cabinet geometry: a run is measured along one wall and mounted on its face. */
export function cabinetFootprint(c,w){
 if(!w||w.kind!=='wall')return null;
 const len=lengthOf(w),ux=(w.x2-w.x1)/len,uz=(w.z2-w.z1)/len;
 const nx=-uz*(c.side||1),nz=ux*(c.side||1);
 const face=w.thickness/2+.004,depth=c.depth;
 const a=(c.startT??0)*len,b=(c.endT??0)*len;
 const point=(along,out)=>({x:w.x1+ux*along+nx*out,z:w.z1+uz*along+nz*out});
 return {corners:[point(a,face),point(b,face),point(b,face+depth),point(a,face+depth)],
  start:point(a,face+depth/2),end:point(b,face+depth/2),angle:Math.atan2(uz,ux),centre:point((a+b)/2,face+depth/2)};
}
export const EQUIPMENT_SPECS=Object.freeze({
 fridge:{name:'یخچال',width:.82,depth:.72,height:1.90,elevation:0},
 stove:{name:'اجاق گاز',width:.60,depth:.55,height:.10,elevation:.86},
 sink:{name:'سینک',width:.60,depth:.54,height:.12,elevation:.86}
});
export function equipmentPosition(o,items){
 if(o.subtype==='fridge'||!o.hostId)return {x:o.x,z:o.z,rotation:o.rotation||0,elevation:0};
 const c=byId(items,o.hostId);if(!c||c.kind!=='cabinet')return null;
 const dx=c.x2-c.x1,dz=c.z2-c.z1,len=Math.hypot(dx,dz);
 if(len<.3)return null;
 const t=o.offsetT??.5,v=o.depthT??0;
 return {x:c.x1+dx*t-dz/len*v,z:c.z1+dz*t+dx/len*v,
  rotation:Math.atan2(dz,dx),elevation:(c.elevation||0)+c.height};
}
function syncEquipment(items){
 for(const e of items.filter(o=>o.kind==='equipment'&&o.subtype!=='fridge')){
  const p=equipmentPosition(e,items);
  if(!p)throw Error('تجهیزات باید روی کابینت زمینی معتبر نصب شوند.');
  e.x=p.x;e.z=p.z;e.rotation=p.rotation;e.elevation=p.elevation;
 }
}
function syncCabinet(items,c){
 const w=byId(items,c.hostId);
 if(!wall(w))throw Error('کابینت باید دیوار میزبان معتبر داشته باشد.');
 const fp=cabinetFootprint(c,w);c.x1=fp.start.x;c.z1=fp.start.z;c.x2=fp.end.x;c.z2=fp.end.z;
}
function polygonOverlap(a,b,gap=.008){
 for(const poly of [a,b])for(let i=0;i<poly.length;i++){
  const p=poly[i],q=poly[(i+1)%poly.length],ax=-(q.z-p.z),az=q.x-p.x;
  const pa=a.map(v=>v.x*ax+v.z*az),pb=b.map(v=>v.x*ax+v.z*az);
  if(Math.max(...pa)<=Math.min(...pb)+gap||Math.max(...pb)<=Math.min(...pa)+gap)return false;
 }
 return true;
}
function wallFootprint(w){
 const len=lengthOf(w),nx=-(w.z2-w.z1)/len*w.thickness/2,nz=(w.x2-w.x1)/len*w.thickness/2;
 return [{x:w.x1+nx,z:w.z1+nz},{x:w.x2+nx,z:w.z2+nz},
  {x:w.x2-nx,z:w.z2-nz},{x:w.x1-nx,z:w.z1-nz}];
}
function validateCabinets(items,w){
 const len=lengthOf(w),cab=items.filter(c=>c.kind==='cabinet'&&c.hostId===w.id),openings=items.filter(o=>o.kind==='opening'&&o.hostId===w.id);
 for(const c of cab){
  if(!finite(c.startT,c.endT,c.depth,c.height,c.elevation)||c.startT*len<-.00001||c.endT*len>len+.00001||
    (c.endT-c.startT)*len<.30-.00001||c.depth<.2||c.depth>1.2||c.height<.25||c.elevation<0||c.elevation+c.height>w.height+.001)
   throw Error('ابعاد کابینت با دیوار میزبان ناسازگار است.');
  for(const other of cab)if(other!==c&&other.subtype===c.subtype&&other.side===c.side&&
   Math.min(c.endT,other.endT)*len-Math.max(c.startT,other.startT)*len>.015)
    throw Error('کابینت‌های هم‌سطح روی یک دیوار تداخل دارند.');
  for(const o of openings)if(Math.min(c.endT*len,o.hostT*len+o.width/2)-
     Math.max(c.startT*len,o.hostT*len-o.width/2)>.015&&
     Math.min(c.elevation+c.height,o.sill+o.height)-Math.max(c.elevation,o.sill)>.015)
    throw Error('کابینت با در یا پنجره روی دیوار تداخل دارد.');
  const fp=cabinetFootprint(c,w);
  for(const other of items)if(wall(other)&&other.id!==w.id&&polygonOverlap(fp.corners,wallFootprint(other)))
   throw Error('کابینت به دیوار مجاور برخورد می‌کند؛ فاصله از گوشه را بیشتر کن.');
  for(const other of items)if(other.kind==='cabinet'&&other.id!==c.id&&other.hostId!==c.hostId){
   const owner=byId(items,other.hostId);
   if(wall(owner)&&Math.min(c.elevation+c.height,other.elevation+other.height)-
      Math.max(c.elevation,other.elevation)>.02&&polygonOverlap(fp.corners,cabinetFootprint(other,owner).corners))
    throw Error('کابینت با کابینت دیوار مجاور تداخل دارد.');
  }
  syncCabinet(items,c);
 }
 syncEquipment(items);
}
/* Stop the run at the first opening edge; no cabinet silently crosses a window. */
export function limitCabinetEnd(items,w,startT,targetT,{kind='upper',height=.72,elevation=1.55}={}){
 if(kind!=='upper')return targetT;
 const len=lengthOf(w),dir=Math.sign(targetT-startT);
 if(!dir)return targetT;
 let result=targetT;
 for(const o of items)if(o.kind==='opening'&&o.hostId===w.id&&
   Math.min(elevation+height,o.sill+o.height)-Math.max(elevation,o.sill)>.015){
  const l=o.hostT-o.width/(2*len),r=o.hostT+o.width/(2*len),gap=.006/len;
  if(startT>l-gap&&startT<r+gap)throw Error('شروع کابینت هوایی نمی‌تواند روی پنجره یا در باشد.');
  if(dir>0&&startT<=l-gap&&result>l-gap)result=l-gap;
  if(dir<0&&startT>=r+gap&&result<r+gap)result=r+gap;
 }
 return Math.max(0,Math.min(1,result));
}
export function placeEquipment(source,point,subtype){
 const spec=EQUIPMENT_SPECS[subtype],items=copy(source);
 if(!spec||!finite(point?.x,point?.z))throw Error('محل تجهیزات معتبر نیست.');
 const obj={id:uid(),kind:'equipment',subtype,name:spec.name,width:spec.width,
  depth:spec.depth,height:spec.height,elevation:spec.elevation,x:point.x,z:point.z,rotation:0};
 if(subtype==='fridge'){
  for(const w of items.filter(wall)){
   const r={corners:[{x:obj.x-spec.width/2,z:obj.z-spec.depth/2},{x:obj.x+spec.width/2,z:obj.z-spec.depth/2},
    {x:obj.x+spec.width/2,z:obj.z+spec.depth/2},{x:obj.x-spec.width/2,z:obj.z+spec.depth/2}]};
   if(polygonOverlap(r.corners,wallFootprint(w)))throw Error('یخچال نباید داخل دیوار قرار بگیرد.');
  }
 }else{
  const bases=items.filter(c=>c.kind==='cabinet'&&c.subtype==='base');
  const ranked=bases.map(c=>{
   const len=lengthOf(c),t=Math.max(0,Math.min(1,((point.x-c.x1)*(c.x2-c.x1)+(point.z-c.z1)*(c.z2-c.z1))/(len*len)));
   const x=c.x1+t*(c.x2-c.x1),z=c.z1+t*(c.z2-c.z1);
   return {c,t,d:Math.hypot(point.x-x,point.z-z)};
  }).filter(r=>r.d<=r.c.depth/2+.20&&lengthOf(r.c)>=spec.width+.04).sort((a,b)=>a.d-b.d);
  const best=ranked[0];if(!best)throw Error('برای نصب سینک و گاز، کابینت زمینی با طول کافی لازم است.');
  const len=lengthOf(best.c),margin=(spec.width/2+.02)/len;
  obj.hostId=best.c.id;obj.offsetT=Math.max(margin,Math.min(1-margin,best.t));obj.depthT=0;
  const pos=equipmentPosition(obj,items);Object.assign(obj,pos);
  for(const other of items.filter(o=>o.kind==='equipment'&&o.hostId===obj.hostId))
   if(Math.abs(other.offsetT-obj.offsetT)*len<(other.width+obj.width)/2+.02)
    throw Error('این قسمت کابینت قبلاً تجهیزات دارد.');
 }
 items.push(obj);return {items,selectedId:obj.id};
}
export function editEquipment(source,id,{width,depth,height}={}){
 const items=copy(source),e=byId(items,id);
 if(!e||e.kind!=='equipment')throw Error('تجهیزات انتخاب نشده‌اند.');
 e.width=Number(width??e.width);e.depth=Number(depth??e.depth);e.height=Number(height??e.height);
 if(!finite(e.width,e.depth,e.height)||e.width<.3||e.width>2||e.depth<.2||e.depth>1.3||e.height<.04||e.height>2.7)
  throw Error('ابعاد تجهیزات نامعتبر است.');
 if(e.hostId){
  const host=byId(items,e.hostId);
  if(!host||e.width>lengthOf(host)-.04)throw Error('عرض تجهیزات از طول کابینت بیشتر است.');
  syncEquipment(items);
 }
 return {items,selectedId:id};
}
export function placeCabinet(source,start,end,{kind='base',depth,height,elevation,side}={}){
 const items=copy(source);
 if(!finite(start?.x,start?.z,end?.x,end?.z))throw Error('نقطه شروع یا پایان کابینت نامعتبر است.');
 const found=byId(items,start.hostId)||nearestWall(items,start.x,start.z,.58)?.wall;
 if(!wall(found))throw Error('ابتدا دیوار بساز؛ کابینت فقط روی دیوار میزبان نصب می‌شود.');
 const w=found,len=lengthOf(w),a=projectOnWall(w,start.x,start.z),b=projectOnWall(w,end.x,end.z);
 if(b.distance>.65)throw Error('پایان کابینت باید روی همان دیوار میزبان باشد.');
 const upper=kind==='upper',d=Number(depth??(upper?.35:.60)),h=Number(height??(upper?.72:.78)),e=Number(elevation??(upper?1.55:.08));
 const capped=limitCabinetEnd(items,w,a.t,b.t,{kind,height:h,elevation:e});
 let from=Math.min(a.t,capped),to=Math.max(a.t,capped);
 if((to-from)*len<.30)throw Error('طول کابینت باید حداقل ۳۰ سانتی‌متر باشد.');
 const cross=(start.x-w.x1)*(w.z2-w.z1)-(start.z-w.z1)*(w.x2-w.x1);
 const chosen=side??start.side??(Math.abs(cross)<.01?1:(cross>0?-1:1));
 const obj={id:uid(),kind:'cabinet',subtype:kind,name:upper?'کابینت هوایی':'کابینت زمینی',
  hostId:w.id,startT:from,endT:to,side:chosen,depth:d,height:h,elevation:e};
 items.push(obj);validateCabinets(items,w);
 return {items,selectedId:obj.id,end:{x:w.x1+(w.x2-w.x1)*capped,z:w.z1+(w.z2-w.z1)*capped,hostId:w.id,side:chosen},stoppedAtOpening:upper&&Math.abs(capped-b.t)>.0001};
}
export function placeOpening(source,hostId,x,z,{style='fixed',width,height,sill}={}){
 const items=copy(source),w=byId(items,hostId);
 if(!wall(w)||w.locked)throw Error('برای در یا پنجره باید دیوار میزبان انتخاب شود.');
 const door=style==='door';width??=(door?.90:1.20);height??=(door?2.10:1.20);sill??=(door?0:.90);
 if(!finite(width,height,sill)||width<.3||height<.3||sill<0||sill+height>w.height||width>lengthOf(w)-.20)
  throw Error('ابعاد بازشو با دیوار سازگار نیست.');
 const projected=projectOnWall(w,x,z),margin=(width/2+.1)/lengthOf(w),t=Math.max(margin,Math.min(1-margin,projected.t));
 const op={id:uid(),kind:'opening',style,name:door?'در':'پنجره ثابت',hostId:w.id,hostT:t,width,height,sill,mirrored:false,openFraction:0};
 items.push(op);validateHostOpenings(items,w);validateCabinets(items,w);
 return {items,selectedId:op.id};
}
export function editOpening(source,id,{width,height,sill,metresFromStart,mirrored,openFraction}){
 const items=copy(source),op=byId(items,id),w=byId(items,op?.hostId);
 if(!op||op.kind!=='opening'||!wall(w))throw Error('بازشوی معتبر انتخاب نشده است.');
 op.width=Number(width??op.width);op.height=Number(height??op.height);op.sill=Number(sill??op.sill);
 const centre=Number(metresFromStart??op.hostT*lengthOf(w));
 if(!finite(centre,op.width,op.height,op.sill)||op.width<.3||op.height<.3||op.sill<0||
  (op.style==='door'&&op.sill>.01)||centre<op.width/2+.1||centre>lengthOf(w)-op.width/2-.1)
  throw Error('ابعاد یا محل بازشو خارج از دیوار است.');
 op.hostT=centre/lengthOf(w);
 if(op.style==='door'){
  if(openFraction!==undefined){const f=Number(openFraction);if(!finite(f)||f<0||f>1)throw Error('زاویه بازشدن در معتبر نیست.');op.openFraction=f;}
  if(mirrored!==undefined)op.mirrored=Boolean(mirrored);
 }
 validateHostOpenings(items,w);validateCabinets(items,w);
 return {items,selectedId:id};
}
export function moveEndpoint(source,id,start,x,z){
 const items=copy(source);normalize(items);const w=byId(items,id);
 if(!w||!wall(w)||w.locked||!finite(x,z))throw Error('دیوار قابل ویرایش نیست.');
 const node=start?w.startNodeId:w.endNodeId;
 for(const other of items)if(wall(other)){
  if(other.startNodeId===node){if(other.locked)throw Error('گره قفل است.');other.x1=x;other.z1=z;}
  if(other.endNodeId===node){if(other.locked)throw Error('گره قفل است.');other.x2=x;other.z2=z;}
 }
 for(const other of items)if(wall(other)){
  if(lengthOf(other)<.1)throw Error('دیوار متصل بیش از حد کوتاه می‌شود.');
  validateHostOpenings(items,other);validateCabinets(items,other);
 }
 return {items,selectedId:id};
}
export function editWall(source,id,{length,thickness,height}){
 const items=copy(source);normalize(items);const w=byId(items,id);
 if(!wall(w)||w.locked)throw Error('دیوار قابل ویرایش نیست.');
 const len=lengthOf(w),target=Number(length??len),thick=Number(thickness??w.thickness),high=Number(height??w.height);
 checkWall({x:0,z:0},{x:target,z:0},thick,high);
 const x=w.x1+(w.x2-w.x1)/len*target,z=w.z1+(w.z2-w.z1)/len*target,node=w.endNodeId;
 for(const other of items)if(wall(other)){
  if(other.startNodeId===node){other.x1=x;other.z1=z;}
  if(other.endNodeId===node){other.x2=x;other.z2=z;}
 }
 w.thickness=thick;w.height=high;
 for(const other of items)if(wall(other)){if(lengthOf(other)<.10)throw Error('دیوار کوتاه می‌شود.');validateHostOpenings(items,other);validateCabinets(items,other);}
 return {items,selectedId:id};
}
export function removeObject(source,id){
 const target=source.find(x=>x.id===id);
 if(!target)throw Error('آبجکت پیدا نشد.');
 const deleted=new Set([id]);let changed=true;
 while(changed){changed=false;for(const o of source)if(o.hostId&&deleted.has(o.hostId)&&!deleted.has(o.id)){deleted.add(o.id);changed=true;}}
 return {items:copy(source).filter(o=>!deleted.has(o.id)),selectedId:null};
}

export function editCabinet(source,id,{length,depth,height,elevation}){
 const items=copy(source),c=byId(items,id),w=byId(items,c?.hostId);
 if(!c||c.kind!=='cabinet'||!wall(w))throw Error('برای ویرایش کابینت باید دیوار میزبان وجود داشته باشد.');
 const len=lengthOf(w),target=Number(length??(c.endT-c.startT)*len);
 c.endT=c.startT+target/len;
 c.depth=Number(depth??c.depth);c.height=Number(height??c.height);c.elevation=Number(elevation??c.elevation);
 validateCabinets(items,w);return {items,selectedId:id};
}
export function moveCabinetEndpoint(source,id,start,x,z){
 const items=copy(source),c=byId(items,id),w=byId(items,c?.hostId);
 if(!c||c.kind!=='cabinet'||!wall(w)||!finite(x,z))throw Error('کابینت روی دیوار معتبر انتخاب نشده است.');
 const projected=projectOnWall(w,x,z);
 if(projected.distance>.65)throw Error('دستگیره کابینت باید روی همان دیوار بماند.');
 if(start)c.startT=projected.t;else c.endT=projected.t;
 validateCabinets(items,w);return {items,selectedId:id};
}
