/*
 * Browser port of Archyar domain/WallTopology.java and DrawingSnap.java.
 * Source: MaxLightner/archyar main (private), 89283efb, 2026-10-31.
 * Metres, stable shared endpoint node IDs, transactional topology.
 */
import {KITCHEN_STYLES,MATERIALS} from './materials.js?v=report33';
export const SNAP_RADIUS=.50;
const cm=value=>Math.round(value*100)/100;
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
 if(gridSnap){x=cm(x);z=cm(z);}
 return {x,z,label:gridSnap?'شبکه ۱ سانتی‌متری':'آزاد',pointLocked:false,angleLocked:false,type:'free'};
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
/* Snap cabinet reticle to its host centreline and exact connected corner nodes. */
export function snapCabinetPoint(items,x,z,tolerance=.8){
 if(!finite(x,z))return null;
 const hit=nearestWall(items,x,z,tolerance);if(!hit)return null;
 let best=null,d=.22;
 for(const w of items.filter(wall))for(const [t,px,pz] of [[0,w.x1,w.z1],[1,w.x2,w.z2]]){
  const distance=Math.hypot(x-px,z-pz);
  if(distance<d&&Math.hypot(hit.x-px,hit.z-pz)<.28){best={x:px,z:pz,hostId:w.id,t,corner:true};d=distance;}
 }
 if(best)return best;
 // Cabinet seams snap to neighboring cabinet edges as well as wall corners.
 for(const c of items.filter(o=>o.kind==='cabinet'&&o.hostId===hit.wall.id)){
  for(const t of [c.startT,c.endT]){
   const px=hit.wall.x1+(hit.wall.x2-hit.wall.x1)*t,pz=hit.wall.z1+(hit.wall.z2-hit.wall.z1)*t;
   const distance=Math.hypot(px-x,pz-z);
   if(distance<.18&&distance<d){best={x:px,z:pz,hostId:hit.wall.id,t,corner:false,edgeSnap:true};d=distance;}
  }
 }
 if(best)return best;
 return {x:hit.x,z:hit.z,hostId:hit.wall.id,t:hit.t,corner:false};
}
/* Discover a shortest contiguous wall route: a single cabinet gesture may turn at corners. */
export function cabinetPath(items,start,target){
 const walls=items.filter(wall),origin=walls.find(w=>w.id===start?.hostId);
 const goal=target?.hostId?walls.find(w=>w.id===target.hostId):nearestWall(items,target?.x,target?.z,.8)?.wall;
 if(!origin||!goal)return null;
 const from=projectOnWall(origin,start.x,start.z).t,to=projectOnWall(goal,target.x,target.z).t;
 const joined=(a,ta,b,tb)=>{
  const aid=ta===0?a.startNodeId:a.endNodeId,bid=tb===0?b.startNodeId:b.endNodeId;
  return !!aid&&aid===bid||Math.hypot((ta===0?a.x1:a.x2)-(tb===0?b.x1:b.x2),
    (ta===0?a.z1:a.z2)-(tb===0?b.z1:b.z2))<.025;
 };
 let best=null;
 const visit=(w,entry,path,cost,seen)=>{
  if(w.id===goal.id){
   const candidate=[...path,{wallId:w.id,startT:entry,endT:to}],total=cost+Math.abs(to-entry)*lengthOf(w);
   if(!best||total<best.cost)best={segments:candidate,cost:total};
   return;
  }
  if(path.length>10||best&&cost>best.cost)return;
  for(const exit of [0,1]){
   const travel=Math.abs(exit-entry)*lengthOf(w);
    for(const next of walls){
    if(next.id===w.id||seen.has(next.id))continue;
    for(const arrive of [0,1])if(joined(w,exit,next,arrive)){
     visit(next,arrive,[...path,{wallId:w.id,startT:entry,endT:exit}],
      cost+travel,new Set([...seen,next.id]));
    }
   }
  }
 };
 visit(origin,from,[],0,new Set([origin.id]));
 if(!best)return null;
 const first=best.segments.find(s=>Math.abs(s.endT-s.startT)>.001);
 const travelSide=(start.side||1)*(first&&first.endT<first.startT?-1:1);
 best.segments=best.segments.map(s=>({...s,side:travelSide*(s.endT<s.startT?-1:1)}));
 return best;
}
export function cabinetTurnTrim(a,b){return Math.max(.14,(a?.thickness||.12)/2+.05,(b?.thickness||.12)/2+.05);}
// Joining two deep cabinet runs is NOT the same as joining thin walls. On
// interior corners the incoming run stops at the outer face of the next run,
// avoiding the old .6 m x .6 m self-intersection. Outer corners stay compact.
export function cabinetCornerTrims(a,b,entrySide=1,depth=.6,dirA=1,dirB=1){
 const lenA=lengthOf(a),lenB=lengthOf(b);
 if(lenA<.1||lenB<.1)return {before:.02,after:.02};
 const u={x:(a.x2-a.x1)*dirA/lenA,z:(a.z2-a.z1)*dirA/lenA},
  v={x:(b.x2-b.x1)*dirB/lenB,z:(b.z2-b.z1)*dirB/lenB};
 const cross=u.x*v.z-u.z*v.x,inner=cross*entrySide*dirA>.0001;
 // Geometric intersection of the two cabinet-depth strips: a 20-degree
 // inside bend needs far more clearance than a right angle. Never cap it
 // at 1.1m: that left deep cabinets overlapping at shallow corners.
 const width=depth+Math.max(a.thickness,b.thickness)/2+.007;
 const wallClearance=cabinetTurnTrim(a,b);
 return {before:inner?Math.min(8,width/Math.max(.035,Math.abs(cross))):wallClearance,
  after:wallClearance};
}
/* Stop a near-corner stroke cleanly against the adjoining wall. A 10–35 cm
   accidental scrap is not installed as a separate cabinet. */
function finishAtCorner(items,w,t){
 const len=lengthOf(w),atStart=t<.5,endpoint=atStart?0:1;
 if(Math.abs(t-endpoint)*len>.36)return t;
 const x=atStart?w.x1:w.x2,z=atStart?w.z1:w.z2;
 const neighbor=items.find(other=>wall(other)&&other.id!==w.id&&
  (Math.hypot(other.x1-x,other.z1-z)<.025||Math.hypot(other.x2-x,other.z2-z)<.025));
 if(!neighbor)return t;
 const inset=Math.min(.27,cabinetTurnTrim(w,neighbor))/len;
 return atStart?inset:1-inset;
}
export function placeCabinetRoute(source,start,target,opts={}){
 const route=cabinetPath(source,start,target);
 if(!route)throw Error('مسیر کابینت باید روی دیوارهای متصل باشد.');
 let items=copy(source),lastId=null,lastEnd=null,stoppedAtOpening=false;
 const group=opts.groupId||uid();
 const runs=[];
 for(let i=0;i<route.segments.length;i++){
  const seg=route.segments[i],w=byId(items,seg.wallId),len=lengthOf(w),dir=Math.sign(seg.endT-seg.startT);
  if(!dir)continue;
  let a=seg.startT,b=seg.endT;
  if(i>0){
   const previous=route.segments[i-1],prevWall=byId(items,previous.wallId);
   a+=dir*cabinetCornerTrims(prevWall,w,previous.side,opts.depth||.6,
    Math.sign(previous.endT-previous.startT),dir).after/len;
  }
  else a=finishAtCorner(items,w,a);
  if(i<route.segments.length-1){const next=route.segments[i+1];
   b-=dir*cabinetCornerTrims(w,byId(items,next.wallId),seg.side,opts.depth||.6,
    dir,Math.sign(next.endT-next.startT)).before/len;}
  else b=finishAtCorner(items,w,b);
  if(Math.abs(b-a)*len<MIN_CABINET_LENGTH)continue;
  const pt=t=>({x:w.x1+(w.x2-w.x1)*t,z:w.z1+(w.z2-w.z1)*t});
  const span=Math.abs(b-a)*len,columns=opts.kind==='tall'?Math.ceil(span/.90):1;
  let firstId=null;
  for(let j=0;j<columns;j++){
   const from=a+(b-a)*j/columns,to=a+(b-a)*(j+1)/columns;
   const result=placeCabinet(items,{...pt(from),hostId:w.id,side:seg.side},pt(to),
    {...opts,side:seg.side,cornerGroup:group});
   items=result.items;lastId=result.selectedId;firstId||=lastId;lastEnd=result.end;
   if(result.stoppedAtOpening){stoppedAtOpening=true;break;}
  }
  if(firstId)runs.push({firstId,lastId});
  if(stoppedAtOpening)break;
 }
 for(let i=1;i<runs.length;i++){
  const left=byId(items,runs[i-1].lastId),right=byId(items,runs[i].firstId);
  if(left&&right&&left.hostId!==right.hostId&&left.subtype===right.subtype){
   items.push({id:uid(),kind:'corner',subtype:'join',name:'اتصال زاویه‌دار کابینت',
    aCabinetId:left.id,bCabinetId:right.id,cornerGroup:group});
  }
 }
 if(!lastId)throw Error('مسیر کابینت کوتاه است؛ حداقل ۴۵ سانتی‌متر روی دیوار حرکت کن.');
 return {items,selectedId:lastId,end:lastEnd,stoppedAtOpening,groupId:group};
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
export function placeWall(source,start,end,{thickness=.12,height=3.6,tolerance=SNAP_RADIUS}={}){
 checkWall(start,end,thickness,height);
 const items=copy(source);normalize(items);
 const sa=snap(items,start.x,start.z,tolerance);
 const na=nodeFor(items,sa);
 let sb=snap(items,end.x,end.z,tolerance);
 if(sb.type==='endpoint'&&dist(sb.x,sb.z,start.x,start.z)<.025&&dist(end.x,end.z,start.x,start.z)>.10)
  sb={x:end.x,z:end.z,type:'free'};
 const nb=nodeFor(items,sb);
 const a=sa.type==='free'?{x:cm(start.x),z:cm(start.z)}:sa,b=sb.type==='free'?{x:cm(end.x),z:cm(end.z)}:sb;
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
export function cornerFillFootprint(items,join){
 const a=byId(items,join?.aCabinetId),b=byId(items,join?.bCabinetId);
 if(a?.kind!=='cabinet'||b?.kind!=='cabinet')return null;
 const wa=byId(items,a.hostId),wb=byId(items,b.hostId);
 if(!wall(wa)||!wall(wb))return null;
 const pa=cabinetFootprint(a,wa),pb=cabinetFootprint(b,wb);
 return {corners:[pa.corners[1],pb.corners[0],pb.corners[3],pa.corners[2]],
  elevation:Math.max(a.elevation,b.elevation),height:Math.min(a.elevation+a.height,b.elevation+b.height)-Math.max(a.elevation,b.elevation),
  subtype:a.subtype};
}
export const EQUIPMENT_MODELS=Object.freeze({
 fridge:[{id:'single',label:'تک‌درب'},{id:'side',label:'سایدبای‌ساید'},{id:'combination',label:'فریزر پایین'}],
 dishwasher:[{id:'built-in',label:'توکار'},{id:'freestanding',label:'زیرصفحه'}],
 washer:[{id:'front',label:'درب از جلو'},{id:'integrated',label:'پنهان در کابینت'}],
 oven:[{id:'electric',label:'فر برقی توکار'},{id:'gas',label:'فر گازی توکار'}],
 microwave:[{id:'built-in',label:'مایکروویو توکار'},{id:'compact',label:'کامپکت'}],
 hood:[{id:'slim',label:'مخفی کشویی'},{id:'chimney',label:'شومینه‌ای'},{id:'angled',label:'مورب'},{id:'concealed',label:'مخفی کابینتی'},{id:'cabinet-framed',label:'داخل قاب کابینت'}],
 stove:[{id:'gas5',label:'۵ شعله'},{id:'gas3',label:'۳ شعله'},{id:'gas2',label:'۲ شعله'},
  {id:'gas4',label:'۴ شعله (قدیمی)'},{id:'induction',label:'القایی (قدیمی)'}],
 sink:[{id:'single',label:'تک‌کاسه'},{id:'double',label:'دوکاسه'},{id:'drainer',label:'آبچکان (قدیمی)'}]
});
export const FAUCET_MODELS=Object.freeze([
 {id:'arc',label:'قوسی کلاسیک'},{id:'gooseneck',label:'گردن‌غازی بلند'},
 {id:'square',label:'زاویه‌دار مدرن'},{id:'pullout',label:'شاوری / شلنگ‌دار'},
 {id:'wall',label:'دیواری دو دستگیره'}
]);
export const EQUIPMENT_SPECS=Object.freeze({
 fridge:{name:'یخچال',width:.82,depth:.72,height:1.90,elevation:0},
 dishwasher:{name:'ماشین ظرفشویی',width:.60,depth:.58,height:.80,elevation:.08},
 washer:{name:'ماشین لباسشویی',width:.60,depth:.60,height:.82,elevation:.08},
 oven:{name:'فر توکار',width:.60,depth:.56,height:.60,elevation:.20},
 microwave:{name:'مایکروویو توکار',width:.60,depth:.43,height:.38,elevation:1.4},
 hood:{name:'هود',width:.75,depth:.45,height:.32,elevation:1.55},
 stove:{name:'اجاق گاز',width:.75,depth:.52,height:.045,elevation:.86},
 sink:{name:'سینک',width:.60,depth:.54,height:.045,elevation:.86}
});
const STOVE_WIDTHS={gas2:.32,gas3:.45,gas4:.60,gas5:.75,induction:.60};
const SINK_WIDTHS={60:.60,90:.90,120:1.20};
export const FRIDGE_FEET=[18,22,24,28,30,32];
const FRIDGE_DIMENSIONS={single:{18:[.72,.68,1.75],22:[.76,.70,1.83],24:[.82,.72,1.90],28:[.85,.74,1.93],30:[.88,.75,1.95],32:[.91,.77,1.98]},side:{18:[.86,.71,1.72],22:[.89,.73,1.78],24:[.92,.75,1.82],28:[.95,.78,1.86],30:[.99,.80,1.89],32:[1.04,.83,1.92]},combination:{18:[.72,.68,1.76],22:[.76,.70,1.83],24:[.80,.72,1.88],28:[.84,.75,1.94],30:[.88,.77,1.96],32:[.90,.79,1.99]}};
export const fridgeDimensions=(model='single',feet=24)=>FRIDGE_DIMENSIONS[model]?.[feet]||FRIDGE_DIMENSIONS.single[24];
const BUILT_IN_TYPES=new Set(['dishwasher','washer','oven','microwave']);
const UNDERCOUNTER_TYPES=new Set(['dishwasher','washer']);
export const MIN_CABINET_LENGTH=.45;
export const DEFAULT_CABINET_DECOR=Object.freeze({
 toeKick:'recessed',endPanel:'plain',crown:'none',wallFiller:'none',
 pilaster:'none',trim:'none'
});
export const CABINET_DECOR_OPTIONS=Object.freeze({
 toeKick:['recessed','flush','body'],endPanel:['plain','framed','none'],
 crown:['none','modern','classic'],wallFiller:['none','auto'],
 pilaster:['none','slim','classic'],trim:['none','vertical','horizontal','both']
});
export function resolvedCabinetDecor(c){return {...DEFAULT_CABINET_DECOR,...c?.decor};}
export const DEFAULT_COUNTERTOP_DESIGN=Object.freeze({
 edge:'square',waterfall:'none',overhang:0,raisedHeight:0,cornerRadius:0,curve:0
});
export const COUNTERTOP_EDGES=Object.freeze(['square','round','bevel','thick']);
export const COUNTERTOP_WATERFALLS=Object.freeze(['none','start','end','both']);
export function resolvedCountertopDesign(c){return {...DEFAULT_COUNTERTOP_DESIGN,...c?.countertopDesign};}
export function styleCountertop(source,cabinetId,options,{scope='single'}={}){
 const items=copy(source),host=byId(items,cabinetId);
 if(host?.kind!=='cabinet'||host.subtype!=='base')throw Error('برای تنظیم صفحه، کابینت زمینی انتخاب کن.');
 if(!['single','connected'].includes(scope))throw Error('محدوده تنظیم صفحه معتبر نیست.');
 const design={...resolvedCountertopDesign(host),...options};
 if(!COUNTERTOP_EDGES.includes(design.edge)||!COUNTERTOP_WATERFALLS.includes(design.waterfall))
  throw Error('نوع لبه یا صفحه آبشاری معتبر نیست.');
 for(const [key,max] of [['overhang',.5],['raisedHeight',.25],['cornerRadius',.18],['curve',.16]]){
  design[key]=Number(design[key]);
  if(!Number.isFinite(design[key])||design[key]<0||design[key]>max)
   throw Error('اندازه پیش‌آمدگی، ارتفاع یا انحنای صفحه معتبر نیست.');
 }
 const ids=scope==='connected'?connectedCabinetIds(items,host.id):new Set([host.id]);
 for(const c of items.filter(c=>c.kind==='cabinet'&&c.subtype==='base'&&ids.has(c.id)))
  c.countertopDesign={...design};
 return {items,selectedId:cabinetId};
}
export const SPECIALTY_TYPES=Object.freeze(['none','coffee','display','appliance','shelves','bar','seating']);
export const SPECIALTY_DOORS=Object.freeze(['open','glass','solid']);
export function styleCabinetSpecialty(source,cabinetId,options){
 const items=copy(source),c=byId(items,cabinetId);
 if(c?.kind!=='cabinet'||c.subtype==='bridge')throw Error('برای فضای تخصصی یک کابینت انتخاب کن.');
 if(!SPECIALTY_TYPES.includes(options?.type))throw Error('نوع فضای تخصصی نامعتبر است.');
 if(options.type==='none'){delete c.specialty;return {items,selectedId:cabinetId};}
 const width=Number(options.width),height=Number(options.height),shelves=Number(options.shelves),offsetT=Number(options.offsetT??.5);
 if(!Number.isFinite(width)||width<.25||width>lengthOf(c)-.02||
  !Number.isFinite(height)||height<.24||height>c.height-.03||
  !Number.isInteger(shelves)||shelves<0||shelves>6||
  !Number.isFinite(offsetT)||offsetT-width/(2*lengthOf(c))<0||offsetT+width/(2*lengthOf(c))>1||
  !SPECIALTY_DOORS.includes(options.door)||!MATERIALS.front.some(m=>m.id===options.materialId))
  throw Error('ابعاد یا مدل فضای تخصصی با کابینت سازگار نیست.');
 if(options.type==='seating'&&c.subtype!=='base')throw Error('نشیمن فقط به کابینت زمینی متصل می‌شود.');
 const occupied=items.some(e=>e.kind==='equipment'&&e.hostId===c.id&&
  Math.abs((e.offsetT??.5)-offsetT)*lengthOf(c)<(e.width+width)/2+.025);
 if(occupied)throw Error('محل فضای تخصصی با تجهیزات نصب‌شده تداخل دارد.');
 c.specialty={type:options.type,width,height,shelves,offsetT,door:options.door,materialId:options.materialId};
 return {items,selectedId:cabinetId};
}
export function styleCabinetDecor(source,cabinetId,choices,{scope='single'}={}){
 const items=copy(source),host=byId(items,cabinetId);
 if(host?.kind!=='cabinet'||host.subtype==='bridge')throw Error('ابتدا کابینتی برای تزئین انتخاب کن.');
 if(!['single','connected'].includes(scope))throw Error('محدوده تزئینات معتبر نیست.');
 for(const [key,option] of Object.entries(choices||{}))
  if(!CABINET_DECOR_OPTIONS[key]?.includes(option))throw Error('گزینه تزئینی کابینت معتبر نیست.');
 const ids=scope==='connected'?connectedCabinetIds(items,host.id):new Set([host.id]);
 for(const c of items.filter(c=>c.kind==='cabinet'&&ids.has(c.id)&&c.subtype!=='bridge'))
  c.decor={...resolvedCabinetDecor(c),...choices};
 return {items,selectedId:cabinetId};
}
export const EQUIPMENT_FACADE_MODES=Object.freeze(['visible','matched','concealed']);
export function styleEquipmentFacade(source,id,facadeMode){
 const items=copy(source),e=byId(items,id);
 if(e?.kind!=='equipment'||!['dishwasher','washer','fridge'].includes(e.subtype)||
  !EQUIPMENT_FACADE_MODES.includes(facadeMode))throw Error('پوشش نمای این دستگاه قابل تغییر نیست.');
 if(e.subtype==='fridge'&&!e.builtIn&&facadeMode!=='visible')
  throw Error('برای نمای هم‌رنگ، یخچال باید داخل کابینت نصب شده باشد.');
 e.facadeMode=facadeMode;
 return {items,selectedId:id};
}
export const DEFAULT_FRONT_RULES=Object.freeze({
 minDoorWidth:.30,maxDoorWidth:.62,gap:.003,alignRows:true,
 singleHinge:'left',pairHinge:'outer',handleStyle:'bar'
});
const RULE_KEYS=Object.keys(DEFAULT_FRONT_RULES);
function checkedFrontRules(input,base=DEFAULT_FRONT_RULES){
 const rules={...base};
 for(const key of Object.keys(input||{})){
  if(!RULE_KEYS.includes(key))throw Error('تنظیم ناشناخته برای نمای کابینت.');
  rules[key]=input[key];
 }
 for(const key of ['minDoorWidth','maxDoorWidth','gap'])rules[key]=Number(rules[key]);
 if(!finite(rules.minDoorWidth,rules.maxDoorWidth,rules.gap)||rules.minDoorWidth<.15||
  rules.maxDoorWidth>1.2||rules.maxDoorWidth<rules.minDoorWidth||rules.gap<.001||rules.gap>.012)
  throw Error('حداقل و حداکثر عرض درب یا فاصله بین نماها معتبر نیست.');
 if(!['left','right'].includes(rules.singleHinge)||!['outer','inner'].includes(rules.pairHinge)||
  !['bar','knob','hidden'].includes(rules.handleStyle)||typeof rules.alignRows!=='boolean')
  throw Error('جهت لولا، دستگیره یا هم‌ترازی معتبر نیست.');
 return rules;
}
export const resolvedFrontRules=c=>checkedFrontRules(c?.frontRuleOverrides||{},checkedFrontRules(c?.frontRules||{}));
const cabinetLayer=c=>['base','tall'].includes(c?.subtype)?'base':'upper';
function adjacentCabinets(a,b){
 return cabinetLayer(a)===cabinetLayer(b)&&Math.abs(a.elevation-b.elevation)<.025&&
  (a.cornerGroup&&b.cornerGroup&&a.cornerGroup===b.cornerGroup||
   [[a.x1,a.z1],[a.x2,a.z2]].some(p=>[[b.x1,b.z1],[b.x2,b.z2]].some(q=>dist(...p,...q)<.10)));
}
export function connectedCabinetIds(items,hostId){
 const cabinets=items.filter(c=>c.kind==='cabinet'&&c.subtype!=='bridge');
 const connected=new Set([hostId]);let changed=true;
 while(changed){changed=false;for(const c of cabinets)if(!connected.has(c.id)&&
   cabinets.some(n=>connected.has(n.id)&&adjacentCabinets(c,n))){connected.add(c.id);changed=true;}}
 return connected;
}

/* Facade-first design: semantic door/drawer rectangles precede internal carcass units.
   All coordinates are fractions of the host cabinet; rendering is derived from them. */
export const FRONT_PRESETS=Object.freeze({
 smart:{label:'هوشمند کل آشپزخانه',type:'smart'},
 doors:{label:'درب لولایی',type:'door'},
 drawers2:{label:'دو کشوی هم‌اندازه',type:'drawer',rows:2},
 drawers3:{label:'سه کشوی هم‌اندازه',type:'drawer',rows:3},
 drawers4:{label:'چهار کشوی هم‌اندازه',type:'drawer',rows:4},
 graduated:{label:'سه کشوی پلکانی',type:'drawer',rows:3,graduated:true},
 mixed:{label:'کشوی بالا + دو درب پایین',type:'mixed',drawerOnTop:true},
 mixedLower:{label:'دو درب بالا + کشوی پایین',type:'mixed',drawerOnTop:false}
});
export function nearestCabinet(items,point,tolerance=.24){
 if(!finite(point?.x,point?.z))return null;
 const found=items.filter(o=>o.kind==='cabinet').map(c=>{
  const len=lengthOf(c),dx=c.x2-c.x1,dz=c.z2-c.z1;
  const t=Math.max(0,Math.min(1,((point.x-c.x1)*dx+(point.z-c.z1)*dz)/(len*len)));
  const d=Math.hypot(point.x-c.x1-dx*t,point.z-c.z1-dz*t);
  return {cabinet:c,t,d};
 }).filter(o=>o.d<=o.cabinet.depth/2+tolerance)
  .sort((a,b)=>a.d-b.d);
 return found[0]||null;
}
export function frontPose(front,c){
 if(!c||c.kind!=='cabinet')return null;
 const len=lengthOf(c),ux=(c.x2-c.x1)/len,uz=(c.z2-c.z1)/len;
 const side=c.side||1,nx=-uz*side,nz=ux*side;
 const mid=(front.startT+front.endT)/2,face=c.depth/2+.014,gap=front.gap??.003;
 return {x:c.x1+ux*len*mid+nx*face,z:c.z1+uz*len*mid+nz*face,
  y:(c.elevation??.08)+c.height*(front.bottomT+front.topT)/2,
  angle:Math.atan2(uz,ux),side,width:Math.max(.10,(front.endT-front.startT)*len-gap),
  height:Math.max(.08,(front.topT-front.bottomT)*c.height-gap),thickness:.019};
}
/* Split facade bays around fixture widths before choosing doors and drawers. All
   dimensions remain semantic, independent of future internal cabinet units. */
function layoutBays(items,c,preset){
 const len=lengthOf(c),fixtures=[];
 if(preset==='smart'||items.some(e=>e.kind==='equipment'&&['sink','oven','dishwasher','washer'].includes(e.subtype)&&e.hostId===c.id)){
  for(const e of items.filter(o=>o.kind==='equipment'&&['sink','stove','oven','dishwasher','washer'].includes(o.subtype))){
   if(preset!=='smart'&&!['sink','oven','dishwasher','washer'].includes(e.subtype))continue;
   if(['dishwasher','washer','oven'].includes(e.subtype)&&c.subtype!=='base')continue;
   let centre=null;
   if(c.subtype==='base'&&e.hostId===c.id)centre=(e.offsetT??.5)*len;
   if(c.subtype==='upper'&&e.subtype!=='oven'){
    const base=byId(items,e.hostId);
    if(base?.kind==='cabinet'&&base.hostId===c.hostId&&base.side===c.side){
     const px=e.x,pz=e.z,dx=c.x2-c.x1,dz=c.z2-c.z1;
     centre=((px-c.x1)*dx+(pz-c.z1)*dz)/len;
    }
   }
   if(centre===null||centre<-.1||centre>len+.1)continue;
   fixtures.push({a:Math.max(0,centre-e.width/2-.02),b:Math.min(len,centre+e.width/2+.02),type:e.subtype,e});
  }
  fixtures.sort((a,b)=>a.a-b.a);
  for(let i=fixtures.length-1;i>0;i--)if(fixtures[i].a<fixtures[i-1].b-.01){
   // Preserve a valid contiguous bay even if the objects were installed very close.
   fixtures[i-1].b=Math.max(fixtures[i-1].b,fixtures[i].b);
   fixtures.splice(i,1);
  }
 }
 const addGap=(result,a,b)=>{
  const size=b-a;if(size<.001)return;
  const count=Math.max(1,Math.ceil(size/.88));
  // Prefer a single slightly wide bay over an unusable sub-45cm drawer.
  const n=count>1&&size/count<MIN_CABINET_LENGTH?count-1:count;
  for(let j=0;j<n;j++)result.push({a:a+size*j/n,b:a+size*(j+1)/n,type:'free'});
 };
 if(!fixtures.length){const result=[];addGap(result,0,len);return result;}
 if(fixtures[0].a<MIN_CABINET_LENGTH)fixtures[0].a=0;
 if(len-fixtures.at(-1).b<MIN_CABINET_LENGTH)fixtures.at(-1).b=len;
 for(let i=1;i<fixtures.length;i++){
  const gap=fixtures[i].a-fixtures[i-1].b;
  if(gap>0&&gap<MIN_CABINET_LENGTH){fixtures[i-1].b+=gap/2;fixtures[i].a-=gap/2;}
 }
 const result=[];let cursor=0;
 for(const fixture of fixtures){addGap(result,cursor,fixture.a);result.push(fixture);cursor=fixture.b;}
 addGap(result,cursor,len);
 return result;
}
export function planFronts(items,c,preset='doors'){
 const config=FRONT_PRESETS[preset];
 if(!config||c?.kind!=='cabinet')throw Error('برای نصب نما باید کابینت و طرح معتبر انتخاب شود.');
 if(['upper','over-fridge','tall'].includes(c.subtype)&&!['doors','smart'].includes(preset))throw Error('کشو فقط روی کابینت زمینی نصب می‌شود؛ ستون تمام‌قد و هوایی درب دارند.');
 if(c.subtype==='bridge')return [];
 const length=lengthOf(c),bays=c.subtype==='tall'?[{a:0,b:length,type:'free'}]:layoutBays(items,c,preset),result=[],rules=resolvedFrontRules(c);
 const make=(kind,bay,part,left,right,bottom,top,hinge='none')=>({
  id:uid(),kind:'front',subtype:kind,name:kind==='door'?'درب کابینت':'کشوی کابینت',
  hostId:c.id,preset,bay,part,startT:left,endT:right,bottomT:bottom,topT:top,
  hinge,finish:'cream',style:'flat',handleStyle:rules.handleStyle,gap:rules.gap
 });
 for(let i=0;i<bays.length;i++){
  const {a:metresA,b:metresB,type}=bays[i],a=metresA/length,b=metresB/length,span=metresB-metresA;
  const sink=type==='sink',stove=type==='stove';
  const oven=type==='oven'||stove&&items.some(e=>e.kind==='equipment'&&e.subtype==='oven'&&
   Math.hypot(e.x-bays[i].e.x,e.z-bays[i].e.z)<.55);
  if(oven||['dishwasher','washer'].includes(type))continue; // Keep appliance faces unobstructed.
  const layout=sink&&c.subtype==='base'?'sinkDoors':preset!=='smart'?preset:
   (c.subtype==='upper'&&sink?'lift':
    c.subtype!=='base'?'doors':
    sink?'sinkDoors':stove?'graduated':span<.55?'doors':
    span>.9?'drawers3':'mixed');
  let part=0;
  const doors=(low,high,forcePair=false,topHinge=false)=>{
   const required=Math.max(1,Math.ceil((span-1e-7)/rules.maxDoorWidth));
   const leaves=topHinge?1:Math.max(forcePair&&span>=2*rules.minDoorWidth-1e-6?2:1,required);
   if(span/leaves<rules.minDoorWidth-1e-6)
    throw Error('عرض این قسمت برای حداقل و حداکثر عرض درب سازگار نیست؛ قوانین را اصلاح کن.');
   for(let j=0;j<leaves;j++){
    const left=a+(b-a)*j/leaves,right=a+(b-a)*(j+1)/leaves;
    const hinge=topHinge?'top':leaves===1?rules.singleHinge:
     rules.pairHinge==='outer'?(j%2===0?'left':'right'):(j%2===0?'right':'left');
    result.push(make('door',i,part++,left,right,low,high,hinge));
   }
  };
  if(c.subtype==='tall'){
   const appliances=items.filter(e=>e.kind==='equipment'&&e.hostId===c.id&&['oven','microwave'].includes(e.subtype))
    .map(e=>({low:Math.max(0,(e.elevation-c.elevation)/c.height),high:Math.min(1,(e.elevation+e.height-c.elevation)/c.height)}))
    .sort((x,y)=>x.low-y.low);
   let cursor=0;
   for(const slot of appliances){
    if((slot.low-cursor)*c.height>=.10)doors(cursor,slot.low);
    cursor=Math.max(cursor,slot.high);
   }
   if((1-cursor)*c.height>=.10)doors(cursor,1);
   continue;
  }
  if(layout==='lift')doors(0,1,false,true);
  else if(layout==='doors'||layout==='sinkDoors')doors(0,1,sink||layout==='sinkDoors');
  else if(layout==='mixed'||layout==='mixedLower'){
   const drawerTop=layout==='mixed',split=drawerTop?.72:.28;
   doors(drawerTop?0:split,drawerTop?split:1,true);
   result.push(make('drawer',i,part++,a,b,drawerTop?split:0,drawerTop?1:split));
  }else{
   const rows=FRONT_PRESETS[layout]?.rows||3;
   const weights=layout==='graduated'?[.46,.33,.21]:Array(rows).fill(1/rows);
   let low=0;
   for(let j=0;j<rows;j++){
    const high=j===rows-1?1:low+weights[j];
    result.push(make('drawer',i,j,a,b,low,high));low=high;
   }
  }
 }
 return result;
}
export function planSmartKitchen(source){
 const items=copy(source);
 const cabinetry=items.filter(c=>c.kind==='cabinet'&&c.subtype!=='bridge');
 if(!cabinetry.length)throw Error('برای طراحی هوشمند ابتدا کابینت‌ها را نصب کن.');
 // Only tiny, reversible equipment corrections are allowed. Try the closest
 // 5 cm module center (at most 2.5 cm), preserving every collision constraint.
 for(const e of items.filter(o=>o.kind==='equipment'&&['sink','stove'].includes(o.subtype))){
  const host=byId(items,e.hostId);if(!host)continue;
  const len=lengthOf(host),old=e.offsetT;
  const target=Math.round(old*len*20)/20/len;
  const margin=(e.width/2+.02)/len;
  if(Math.abs(target-old)*len>.025||target<margin||target>1-margin)continue;
  e.offsetT=target;
  try{syncEquipment(items);validateEquipmentSpacing(items);}
  catch{e.offsetT=old;syncEquipment(items);}
 }
 for(const c of cabinetry)reflowFronts(items,c,'smart');
 for(const c of cabinetry)validateFronts(items,c);
 return {items,selectedId:items.find(o=>o.kind==='front')?.id||cabinetry[0].id};
}
/* Catalog styles alter actual semantic door/drawer layouts, not just colors. */
export function applyKitchenLayout(source,styleId,{cabinetIds=null}={}){
 const spec=KITCHEN_STYLES.find(s=>s.id===styleId)?.layout;
 if(!spec)throw Error('مدل آشپزخانه انتخاب‌شده معتبر نیست.');
 const items=copy(source),cabinets=items.filter(c=>c.kind==='cabinet'&&c.subtype!=='bridge'&&
  (!cabinetIds||cabinetIds.includes(c.id)));
 for(const c of cabinets){
  // A manually split facade is an explicit exception to the chosen kitchen sample.
  if(c.frontPreset==='custom'||items.some(f=>f.kind==='front'&&f.hostId===c.id&&
   f.manualOverrides&&Object.values(f.manualOverrides).some(Boolean)))continue;
  reflowFronts(items,c,c.subtype==='base'?spec.base:spec.upper);
  for(const front of items.filter(f=>f.kind==='front'&&f.hostId===c.id)){
   if(!front.manualOverrides?.style)front.style=spec.panel;
   if(!front.manualOverrides?.handleStyle)front.handleStyle=spec.handle;
   if(!front.manualOverrides?.finish)front.finish=spec.finish;
   if(!front.manualOverrides?.materialId&&!front.materialId)delete front.materialId;
   if(!front.manualOverrides?.frameMaterialId&&!front.frameMaterialId)front.frameMaterialId=spec.frameMaterial||undefined;
  }
  validateFronts(items,c);
 }
 return {items,selectedId:items.find(f=>f.kind==='front'&&cabinets.some(c=>c.id===f.hostId))?.id||cabinets[0]?.id||null};
}
export function paintFronts(source,id,{scope='single',part='panel',materialId}={}){
 if(!MATERIALS.front.some(m=>m.id===materialId))throw Error('متریال نما معتبر نیست.');
 if(!['single','connected','layer','all'].includes(scope)||!['panel','frame'].includes(part))
  throw Error('حالت رنگ‌آمیزی معتبر نیست.');
 const items=copy(source),front=byId(items,id),host=byId(items,front?.hostId);
 if(front?.kind!=='front'||host?.kind!=='cabinet')throw Error('ابتدا یک درب یا کشو انتخاب کن.');
 const layer=c=>cabinetLayer(c);
 const cabinets=items.filter(o=>o.kind==='cabinet'&&o.subtype!=='bridge');
 const connected=scope==='connected'?connectedCabinetIds(items,host.id):new Set([host.id]);
 let count=0;
 for(const f of items.filter(o=>o.kind==='front')){
  const c=byId(items,f.hostId);
  if(scope==='single'&&f.id!==id||scope==='connected'&&!connected.has(f.hostId)||
    scope==='layer'&&layer(c)!==layer(host)||part==='frame'&&f.style!=='frame')continue;
  const property=part==='frame'?'frameMaterialId':'materialId';
  f[property]=materialId;f.manualOverrides??={};f.manualOverrides[property]=true;count++;
 }
 return {items,selectedId:id,paintedCount:count};
}
function reflowFronts(items,c,preset=c?.frontPreset){
 if(!FRONT_PRESETS[preset])return;
 const previous=items.filter(o=>o.kind==='front'&&o.hostId===c.id)
  .sort((a,b)=>a.bay-b.bay||a.part-b.part);
 const fresh=planFronts(items,c,preset);
 for(let i=0;i<fresh.length;i++)if(previous[i]&&previous[i].subtype===fresh[i].subtype){
  fresh[i].id=previous[i].id;
  fresh[i].finish=previous[i].finish||'cream';
  if(previous[i].materialId)fresh[i].materialId=previous[i].materialId;
  if(previous[i].frameMaterialId)fresh[i].frameMaterialId=previous[i].frameMaterialId;
  fresh[i].style=previous[i].style||'flat';
  fresh[i].handleStyle=previous[i].handleStyle||'bar';
  if(previous[i].openFraction)fresh[i].openFraction=previous[i].openFraction;
  if(previous[i].grainDirection)fresh[i].grainDirection=previous[i].grainDirection;
  if(previous[i].manualOverrides){
   fresh[i].manualOverrides={...previous[i].manualOverrides};
   for(const key of ['hinge','handleStyle','gap','style','finish'])if(previous[i].manualOverrides[key])
    fresh[i][key]=previous[i][key];
  }
 }
 for(let i=items.length-1;i>=0;i--)if(items[i].kind==='front'&&items[i].hostId===c.id)items.splice(i,1);
 items.push(...fresh);
 c.frontPreset=preset;
}
/* Global defaults are copied into cabinet models: existing geometry operations
   can regenerate faces without access to the project/UI state. Connected group
   overrides sit above those defaults; hand-edited faces sit above both. */
export function configureFrontRules(source,rules,{scope='global',targetId=null}={}){
 if(!['global','connected'].includes(scope))throw Error('سطح تنظیمات نما معتبر نیست.');
 const items=copy(source),target=byId(items,targetId),host=target?.kind==='front'?byId(items,target.hostId):target;
 if(scope==='connected'&&host?.kind!=='cabinet')throw Error('برای تنظیمات گروهی یک کابینت یا نمای آن را انتخاب کن.');
 const ids=scope==='connected'?connectedCabinetIds(items,host.id):null;
 const globalRules=checkedFrontRules(rules);
 for(const c of items.filter(c=>c.kind==='cabinet'&&c.subtype!=='bridge')){
  if(scope==='connected'){
   if(!ids.has(c.id))continue;
   c.frontRuleOverrides={...globalRules};
  }else c.frontRules={...globalRules};
  const effective=resolvedFrontRules(c);
  if(c.frontPreset!=='custom')reflowFronts(items,c);
  for(const f of items.filter(f=>f.kind==='front'&&f.hostId===c.id)){
   if(!f.manualOverrides?.gap)f.gap=effective.gap;
   if(!f.manualOverrides?.handleStyle)f.handleStyle=effective.handleStyle;
   if(f.subtype==='door'&&!f.manualOverrides?.hinge&&c.frontPreset==='custom'){
    // Keep manually split widths but let default hinge policy update untouched doors.
    const peers=items.filter(o=>o.kind==='front'&&o.hostId===c.id&&o.subtype==='door'&&
     Math.abs(o.bottomT-f.bottomT)<.001&&Math.abs(o.topT-f.topT)<.001);
    f.hinge=peers.length===1?effective.singleHinge:
     effective.pairHinge==='outer'?(peers.indexOf(f)%2?'right':'left'):(peers.indexOf(f)%2?'left':'right');
   }
  }
  validateFronts(items,c);
 }
 return {items,selectedId:targetId,frontRules:scope==='global'?globalRules:undefined};
}
/* Align comparable horizontal drawer rails between connected cabinets. The
   seam is shared by every panel touching it; manually resized cabinets anchor
   their neighbors and are never silently reshaped. */
export function alignFrontSeams(source){
 const items=copy(source),cabinets=items.filter(c=>c.kind==='cabinet'&&c.subtype!=='bridge');
 const visited=new Set();let alignedCount=0;
 for(const root of cabinets){
  if(visited.has(root.id))continue;
  const ids=connectedCabinetIds(items,root.id);
  for(const id of ids)visited.add(id);
  const group=cabinets.filter(c=>ids.has(c.id)&&resolvedFrontRules(c).alignRows);
  const seams=[];
  for(const c of group){
   const fs=items.filter(f=>f.kind==='front'&&f.hostId===c.id);
   const levels=[...new Set(fs.flatMap(f=>[f.topT,f.bottomT]).filter(t=>t>.001&&t<.999).map(t=>Math.round(t*100000)/100000))];
   for(const t of levels)seams.push({c,t,y:(c.elevation||0)+c.height*t,manual:c.frontPreset==='custom'});
  }
  seams.sort((a,b)=>a.y-b.y);
  const clusters=[];
  for(const seam of seams){
   const group=clusters.at(-1);
   if(group&&seam.y-group[0].y<=.08&&!group.some(s=>s.c.id===seam.c.id))group.push(seam);
   else clusters.push([seam]);
  }
  for(const cluster of clusters){
   if(cluster.length<2)continue;
   const stable=cluster.filter(s=>s.manual),target=(stable.length?stable:cluster).reduce((sum,s)=>sum+s.y,0)/(stable.length||cluster.length);
   for(const seam of cluster){
    if(seam.manual||Math.abs(seam.y-target)<.0001)continue;
    const t=(target-(seam.c.elevation||0))/seam.c.height,fs=items.filter(f=>f.kind==='front'&&f.hostId===seam.c.id);
    const affected=fs.filter(f=>Math.abs(f.topT-seam.t)<.0001||Math.abs(f.bottomT-seam.t)<.0001);
    if(affected.some(f=>Math.abs(f.topT-seam.t)<.0001&&(t-f.bottomT)*seam.c.height<.10-1e-5||
     Math.abs(f.bottomT-seam.t)<.0001&&(f.topT-t)*seam.c.height<.10-1e-5))continue;
    for(const f of affected){if(Math.abs(f.topT-seam.t)<.0001)f.topT=t;
     if(Math.abs(f.bottomT-seam.t)<.0001)f.bottomT=t;}
    alignedCount++;
   }
  }
 }
 for(const c of cabinets)validateFronts(items,c);
 return {items,alignedCount};
}
export function placeFrontLayout(source,cabinetId,preset='doors'){
 const items=copy(source),c=byId(items,cabinetId);
 if(!c||c.kind!=='cabinet')throw Error('ابتدا کابینت میزبان درب و کشو را انتخاب کن.');
 if(!FRONT_PRESETS[preset])throw Error('مدل تقسیم‌بندی نما نامعتبر است.');
 reflowFronts(items,c,preset);
 validateFronts(items,c);
 return {items,selectedId:items.find(o=>o.kind==='front'&&o.hostId===c.id)?.id||c.id};
}
export function editFront(source,id,{width,height,hinge,finish,style,handleStyle,materialId,frameMaterialId,grainDirection,gap}={}){
 const items=copy(source),f=byId(items,id),c=byId(items,f?.hostId);
 if(f?.kind!=='front'||c?.kind!=='cabinet')throw Error('درب یا کشوی معتبر انتخاب نشده است.');
 const manual=f.manualOverrides??={};
 if(width!==undefined){
  const val=Math.round(Number(width)*100)/100;
  if(!Number.isFinite(val)||val<.15||val>1.2)throw Error('عرض نمای درب یا کشو معتبر نیست.');
  const next=f.startT+val/lengthOf(c),old=f.endT;
  // The shared vertical seam moves both adjacent leaves, with no crack or overlap.
  const neighbor=items.find(g=>g.kind==='front'&&g.hostId===c.id&&g.id!==f.id&&
   Math.abs(g.startT-old)<.002&&Math.min(f.topT,g.topT)-Math.max(f.bottomT,g.bottomT)>.08);
  if(neighbor)neighbor.startT=next;
  f.endT=next;
  manual.geometry=true;
 }
 if(height!==undefined){
  const val=Math.round(Number(height)*100)/100;
  if(!Number.isFinite(val)||val<.10||val>c.height)throw Error('ارتفاع نمای درب یا کشو معتبر نیست.');
  const next=f.bottomT+val/c.height,old=f.topT;
  // A drawer rail is a shared horizontal seam, so the drawer above follows.
  const neighbors=items.filter(g=>g.kind==='front'&&g.hostId===c.id&&g.id!==f.id&&
   Math.abs(g.bottomT-old)<.002&&Math.min(f.endT,g.endT)-Math.max(f.startT,g.startT)>.08);
  for(const neighbor of neighbors)neighbor.bottomT=next;
  // When the same rail continues into neighboring bays, keep one continuous
  // horizontal seam across the whole cabinet frontage.
  for(const peer of items.filter(g=>g.kind==='front'&&g.hostId===c.id&&g.id!==f.id)){
   if(Math.abs(peer.topT-old)<.002)peer.topT=next;
   if(Math.abs(peer.bottomT-old)<.002)peer.bottomT=next;
  }
  f.topT=next;
  manual.geometry=true;
 }
 if(hinge!==undefined){if(f.subtype!=='door'||!['left','right','top'].includes(hinge))throw Error('جهت لولا نامعتبر است.');if(f.hinge!==hinge)manual.hinge=true;f.hinge=hinge;}
 if(finish!==undefined){if(!['cream','wood','graphite'].includes(finish))throw Error('رنگ درب نامعتبر است.');if(f.finish!==finish)manual.finish=true;f.finish=finish;}
 if(style!==undefined){if(!['flat','frame'].includes(style))throw Error('سبک درب نامعتبر است.');if(f.style!==style)manual.style=true;f.style=style;}
 if(handleStyle!==undefined){if(!['bar','knob','hidden'].includes(handleStyle))throw Error('دستگیره نامعتبر است.');if(f.handleStyle!==handleStyle)manual.handleStyle=true;f.handleStyle=handleStyle;}
 if(materialId!==undefined){if((f.materialId||'')!==materialId)manual.materialId=true;f.materialId=materialId||undefined;}
 if(frameMaterialId!==undefined){if((f.frameMaterialId||'')!==frameMaterialId)manual.frameMaterialId=true;f.frameMaterialId=frameMaterialId||undefined;}
 if(grainDirection!==undefined){if(!['auto','vertical','horizontal'].includes(grainDirection))throw Error('جهت بافت معتبر نیست.');if((f.grainDirection||'auto')!==grainDirection)manual.grainDirection=true;f.grainDirection=grainDirection;}
 if(gap!==undefined){const spacing=Number(gap);if(!finite(spacing)||spacing<.001||spacing>.012)throw Error('درز نمای کابینت باید ۱ تا ۱۲ میلی‌متر باشد.');if(f.gap!==spacing)manual.gap=true;f.gap=spacing;}
 if(width!==undefined||height!==undefined)c.frontPreset='custom';
 validateFronts(items,c);
 return {items,selectedId:id};
}
/* Interior geometry is derived only for opened fronts, never stored as a
   manufacturing unit or generated for every closed door and drawer. */
export function frontOpeningCavity(front,c){
 if(front?.kind!=='front'||c?.kind!=='cabinet'||front.hostId!==c.id||!(front.openFraction>.01))return null;
 const len=lengthOf(c),side=c.side||1,frame=.026;
 const width=(front.endT-front.startT)*len-2*frame;
 const yLow=c.elevation+c.height*front.bottomT+frame,
  yHigh=c.elevation+c.height*front.topT-frame;
 if(width<.07||yHigh-yLow<.055)return null;
 const backZ=-side*(c.depth/2-.055),faceZ=side*(c.depth/2+.006);
 return {x:((front.startT+front.endT)/2-.5)*len,
  z:(backZ+faceZ)/2,width,depth:Math.abs(faceZ-backZ),yLow,yHigh,backZ,faceZ,side};
}
export function setFrontOpening(source,id,fraction){
 const items=copy(source),f=byId(items,id);
 if(f?.kind!=='front'||!['door','drawer'].includes(f.subtype))throw Error('ابتدا یک درب یا کشو انتخاب کن.');
 const amount=Number(fraction);
 if(!Number.isFinite(amount)||amount<0||amount>1)throw Error('میزان بازشدن درب یا کشو باید بین صفر و یک باشد.');
 f.openFraction=amount;
 return {items,selectedId:id};
}
// A unit is the shared bay behind a door pair or a vertical drawer stack.
// It can be selected without deleting or replacing its host cabinet run.
export function frontUnitFor(source,id){
 const front=byId(source,id);if(front?.kind!=='front')return null;
 const host=byId(source,front.hostId);if(host?.kind!=='cabinet')return null;
 const members=source.filter(f=>f.kind==='front'&&f.hostId===host.id&&
  (Number.isInteger(front.bay)&&f.bay===front.bay||!Number.isInteger(front.bay)&&f.id===front.id));
 return {hostId:host.id,frontId:id,bay:front.bay,
  startT:Math.min(...members.map(f=>f.startT)),endT:Math.max(...members.map(f=>f.endT)),
  bottomT:Math.min(...members.map(f=>f.bottomT)),topT:Math.max(...members.map(f=>f.topT)),
  frontIds:members.map(f=>f.id)};
}
export function convertFrontUnit(source,id,preset){
 if(!['doors','drawers2','drawers3','drawers4'].includes(preset))throw Error('نوع یونیت انتخاب‌شده معتبر نیست.');
 const unit=frontUnitFor(source,id);if(!unit)throw Error('ابتدا یک درب یا کشو انتخاب کن.');
 const items=copy(source),host=byId(items,unit.hostId),old=byId(items,id),rules=resolvedFrontRules(host);
 const width=(unit.endT-unit.startT)*lengthOf(host),count=preset==='doors'?
  Math.max(1,Math.ceil((width-1e-6)/rules.maxDoorWidth)):Number(preset.slice(-1));
 if(preset==='doors'&&width/count<rules.minDoorWidth-.00001)throw Error('عرض یونیت از حداقل عرض درب کمتر می‌شود.');
 const replacement=[];
 for(let j=0;j<count;j++){
  const isDoor=preset==='doors',startT=isDoor?unit.startT+(unit.endT-unit.startT)*j/count:unit.startT,
   endT=isDoor?unit.startT+(unit.endT-unit.startT)*(j+1)/count:unit.endT,
   bottomT=isDoor?unit.bottomT:unit.bottomT+(unit.topT-unit.bottomT)*j/count,
   topT=isDoor?unit.topT:unit.bottomT+(unit.topT-unit.bottomT)*(j+1)/count;
  replacement.push({...old,id:uid(),subtype:isDoor?'door':'drawer',name:isDoor?'درب کابینت':'کشوی کابینت',
   preset,bay:unit.bay,part:j,startT,endT,bottomT,topT,
   hinge:isDoor?(count===1?rules.singleHinge:rules.pairHinge==='outer'?(j%2?'right':'left'):(j%2?'left':'right')):'none',
   openFraction:0,manualOverrides:{}});
 }
 const deleted=new Set(unit.frontIds);
 const result=items.filter(f=>!deleted.has(f.id));result.push(...replacement);
 host.frontPreset='custom';validateFronts(result,host);
 return {items:result,selectedId:replacement[0].id,unitCount:replacement.length};
}
function validateFronts(items,c){
 const fronts=items.filter(o=>o.kind==='front'&&o.hostId===c.id),len=lengthOf(c);
 for(const f of fronts){
  if(!finite(f.startT,f.endT,f.bottomT,f.topT)||f.startT<-.00001||f.endT>1.00001||
   f.bottomT<-.00001||f.topT>1.00001||
   (f.endT-f.startT)*len<.15-1e-6||(f.topT-f.bottomT)*c.height<.10-1e-6)
   throw Error('ابعاد نمای درب یا کشو از محدوده کابینت بیرون است.');
  for(const q of fronts)if(q!==f&&Math.min(q.endT,f.endT)-Math.max(q.startT,f.startT)>.004/len&&
   Math.min(q.topT,f.topT)-Math.max(q.bottomT,f.bottomT)>.004/c.height)
   throw Error('درب‌ها و کشوهای روی یک کابینت نمی‌توانند روی هم قرار بگیرند.');
 }
}

export function equipmentPosition(o,items){
 if(o.subtype==='hood'){
  const stove=byId(items,o.linkedStoveId);
  return stove?{x:stove.x,z:stove.z,rotation:stove.rotation||0,elevation:1.55}:null;
 }
 if(o.subtype==='fridge'||o.builtIn||!o.hostId)return {x:o.x,z:o.z,rotation:o.rotation||0,elevation:o.elevation||0};
 const c=byId(items,o.hostId);if(!c||c.kind!=='cabinet')return null;
 const dx=c.x2-c.x1,dz=c.z2-c.z1,len=Math.hypot(dx,dz);
 if(len<.3)return null;
 const t=o.offsetT??.5,v=o.depthT??0;
 return {x:c.x1+dx*t-dz/len*v,z:c.z1+dz*t+dx/len*v,
  rotation:Math.atan2(dz,dx)+(c.side===-1?Math.PI:0),elevation:(c.elevation||0)+c.height};
}

export function equipmentFootprint(o){
 const a=o.rotation||0,c=Math.cos(a),s=Math.sin(a),w=o.width/2,d=o.depth/2;
 return [[-w,-d],[w,-d],[w,d],[-w,d]].map(([x,z])=>({x:o.x+x*c-z*s,z:o.z+x*s+z*c}));
}
function pointSegmentDistance(p,a,b){
 const dx=b.x-a.x,dz=b.z-a.z,len=dx*dx+dz*dz;
 const t=len?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/len)):0;
 return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);
}
function polygonGap(a,b){
 if(polygonOverlap(a,b,0))return 0;
 let minimum=Infinity;
 for(const [v,other] of [[a,b],[b,a]])for(const p of v)
  for(let i=0;i<other.length;i++)minimum=Math.min(minimum,pointSegmentDistance(p,other[i],other[(i+1)%other.length]));
 return minimum;
}
export function validateEquipmentSpacing(items){
 const fixtures=items.filter(e=>e.kind==='equipment'&&['sink','stove'].includes(e.subtype));
 for(let i=0;i<fixtures.length;i++)for(let j=i+1;j<fixtures.length;j++){
  const a=fixtures[i],b=fixtures[j];if(a.subtype===b.subtype)continue;
  if(polygonGap(equipmentFootprint(a),equipmentFootprint(b))<.45-1e-6)
   throw Error('فاصله لبه گاز تا لبه سینک باید حداقل ۴۵ سانتی‌متر باشد.');
 }
}
function syncEquipment(items){
 for(const e of items.filter(o=>o.kind==='equipment'&&BUILT_IN_TYPES.has(o.subtype)&&o.builtIn&&o.hostId)){
  const c=byId(items,e.hostId);if(!c||c.kind!=='cabinet')continue;
  const t=e.offsetT??.5;
  e.x=c.x1+(c.x2-c.x1)*t;e.z=c.z1+(c.z2-c.z1)*t;
  e.rotation=Math.atan2(c.z2-c.z1,c.x2-c.x1)+(c.side===-1?Math.PI:0);
  e.elevation=c.subtype==='tall'?(c.elevation+(e.subtype==='microwave'?1.47:.72)):
   e.subtype==='oven'?c.elevation+.12:Math.max(.005,c.elevation+c.height-e.height-.02);
 }
 for(const e of items.filter(o=>o.kind==='equipment'&&o.subtype!=='fridge'&&o.subtype!=='hood'&&!o.builtIn)){
  const p=equipmentPosition(e,items);
  if(!p)throw Error('تجهیزات باید روی کابینت زمینی معتبر نصب شوند.');
  e.x=p.x;e.z=p.z;e.rotation=p.rotation;e.elevation=p.elevation;
 }
 for(const hood of items.filter(o=>o.kind==='equipment'&&o.subtype==='hood')){
  const p=equipmentPosition(hood,items);if(!p)throw Error('هود باید به گاز متصل باشد.');
  Object.assign(hood,p);
  const stove=byId(items,hood.linkedStoveId);hood.width=Math.max(.60,stove.width);
 }
 validateEquipmentSpacing(items);
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
/* A wall joint is a shared geometric cap, not a pair of overlapping boxes.
 * Both the plan and the WebGL mesher consume these exact longitudinal offsets.
 * At T/cross junctions we keep conservative square caps; the miter is only
 * defined for two outgoing walls. Very acute miters are bevel-limited. */
export function wallJointCaps(w,items=[]){
 const len=lengthOf(w),empty={startPlus:0,startMinus:0,endPlus:0,endMinus:0};
 if(len<.1)return empty;
 const cap=(end,side)=>{
  const px=end?w.x2:w.x1,pz=end?w.z2:w.z1;
  const ux=(end?w.x1-w.x2:w.x2-w.x1)/len,uz=(end?w.z1-w.z2:w.z2-w.z1)/len;
  const linked=[];
  for(const other of items)if(wall(other)&&other.id!==w.id){
   for(const e of [false,true]){
    const x=e?other.x2:other.x1,z=e?other.z2:other.z1;
    if((end?w.endNodeId:w.startNodeId)&&
       (end?w.endNodeId:w.startNodeId)===(e?other.endNodeId:other.startNodeId)||dist(px,pz,x,z)<.025){
     const length=lengthOf(other);
     if(length>.099)linked.push({other,ux:(e?other.x1-other.x2:other.x2-other.x1)/length,
      uz:(e?other.z1-other.z2:other.z2-other.z1)/length});
    }
   }
  }
  if(!linked.length)return 0;
  // A T- or cross-junction has multiple outgoing walls. The side's nearest
  // angular neighbour determines its miter; don't leave a protruding square.
  const s=end?-side:side;
  const options=linked.length===1?linked:linked.filter(n=>
   (ux*n.uz-uz*n.ux)*s>.0001).sort((a,b)=>{
    const ca=Math.atan2(ux*a.uz-uz*a.ux,ux*a.ux+uz*a.uz);
    const cb=Math.atan2(ux*b.uz-uz*b.ux,ux*b.ux+uz*b.uz);
    return Math.abs(ca)-Math.abs(cb);
   });
  if(!options.length)return 0;
  const next=options[0],cross=ux*next.uz-uz*next.ux;
  if(Math.abs(cross)<.0001)return 0;
  // At an end node local +Z is opposite to the outgoing ray's left side.
  const h=w.thickness/2,otherH=next.other.thickness/2;
  const p1={x:-uz*s*h,z:ux*s*h};
  const p2={x:next.uz*s*otherH,z:-next.ux*s*otherH};
  const t=((p2.x-p1.x)*next.uz-(p2.z-p1.z)*next.ux)/cross;
  const limit=Math.min(.45,len*.45,Math.max(w.thickness,next.other.thickness)*2);
  return (end?-1:1)*Math.max(-limit,Math.min(limit,t));
 };
 return {startPlus:cap(false,1),startMinus:cap(false,-1),
  endPlus:cap(true,1),endMinus:cap(true,-1)};
}
export function wallFootprint(w,items=[]){
 const len=lengthOf(w);if(len<.001)return [];
 const ux=(w.x2-w.x1)/len,uz=(w.z2-w.z1)/len,nx=-uz*w.thickness/2,nz=ux*w.thickness/2;
 const cap=wallJointCaps(w,items);
 return [{x:w.x1+ux*cap.startPlus+nx,z:w.z1+uz*cap.startPlus+nz},
  {x:w.x2+ux*cap.endPlus+nx,z:w.z2+uz*cap.endPlus+nz},
  {x:w.x2+ux*cap.endMinus-nx,z:w.z2+uz*cap.endMinus-nz},
  {x:w.x1+ux*cap.startMinus-nx,z:w.z1+uz*cap.startMinus-nz}];
}
function validateCabinets(items,w){
 const len=lengthOf(w),cab=items.filter(c=>c.kind==='cabinet'&&c.hostId===w.id),openings=items.filter(o=>o.kind==='opening'&&o.hostId===w.id);
 for(const c of cab){
  if(!finite(c.startT,c.endT,c.depth,c.height,c.elevation)||c.startT*len<-.00001||c.endT*len>len+.00001||
    (c.endT-c.startT)*len<MIN_CABINET_LENGTH-.00001||c.depth<.2||c.depth>1.2||c.height<.25||c.elevation<0||c.elevation+c.height>w.height+.001)
   throw Error('ابعاد کابینت با دیوار میزبان ناسازگار است.');
  if(c.subtype==='tall'&&(c.height<1.8||(c.endT-c.startT)*len>.91))
   throw Error('عرض ستون تمام‌قد حداکثر ۹۰ و ارتفاع آن حداقل ۱۸۰ سانتی‌متر است.');
  for(const e of items.filter(e=>e.kind==='equipment'&&e.hostId===c.id&&['oven','microwave'].includes(e.subtype)))
   if(c.subtype==='tall'&&c.elevation+(e.subtype==='microwave'?1.47:.72)+e.height>c.elevation+c.height-.015)
    throw Error('ارتفاع ستون تمام‌قد برای تجهیزات توکار کافی نیست.');
  for(const other of cab)if(other!==c&&other.side===c.side&&
   Math.min(c.elevation+c.height,other.elevation+other.height)-Math.max(c.elevation,other.elevation)>.015&&
   Math.min(c.endT,other.endT)*len-Math.max(c.startT,other.startT)*len>.015)
    throw Error('کابینت‌های هم‌سطح روی یک دیوار تداخل دارند.');
  for(const o of openings)if(Math.min(c.endT*len,o.hostT*len+o.width/2)-
     Math.max(c.startT*len,o.hostT*len-o.width/2)>.015&&
     Math.min(c.elevation+c.height,o.sill+o.height)-Math.max(c.elevation,o.sill)>.015)
    throw Error('کابینت با در یا پنجره روی دیوار تداخل دارد.');
  const fp=cabinetFootprint(c,w);
  for(const other of items)if(wall(other)&&other.id!==w.id&&polygonOverlap(fp.corners,wallFootprint(other,items)))
   throw Error('کابینت به دیوار مجاور برخورد می‌کند؛ فاصله از گوشه را بیشتر کن.');
  for(const other of items)if(other.kind==='cabinet'&&other.id!==c.id&&other.hostId!==c.hostId){
   const owner=byId(items,other.hostId);
   if(wall(owner)&&!(c.cornerGroup&&c.cornerGroup===other.cornerGroup)&&
    Math.min(c.elevation+c.height,other.elevation+other.height)-
      Math.max(c.elevation,other.elevation)>.02&&polygonOverlap(fp.corners,cabinetFootprint(other,owner).corners))
    throw Error('کابینت با کابینت دیوار مجاور تداخل دارد.');
  }
  syncCabinet(items,c);
  validateFronts(items,c);
 }
 syncEquipment(items);
}
/* Stop the run at the first opening edge; no cabinet silently crosses a window. */
export function limitCabinetEnd(items,w,startT,targetT,{kind='upper',height=.72,elevation=1.55}={}){
 if(!['upper','tall'].includes(kind))return targetT;
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
export function snapFridgePoint(items,point,width=.82,depth=.72){
 if(!finite(point?.x,point?.z))return null;
 const near=nearestWall(items,point.x,point.z,.95);
 if(!near)return {x:point.x,z:point.z,rotation:0};
 const w=near.wall,len=lengthOf(w),ux=(w.x2-w.x1)/len,uz=(w.z2-w.z1)/len;
 const sign=(point.x-near.x)*(-uz)+(point.z-near.z)*ux>=0?1:-1;
 const offset=w.thickness/2+depth/2+.02;
 return {x:near.x-uz*offset*sign,z:near.z+ux*offset*sign,
  rotation:Math.atan2(uz,ux)+(sign<0?Math.PI:0)};
}
/* A fridge may replace a section of a cabinet run. All changes are transactional:
   narrow corner scraps disappear, valid side cabinets remain, and hosted appliances move with them. */
function embedFridge(items,obj,point){
 const hosted=items.filter(c=>c.kind==='cabinet'&&c.subtype==='base');
 const near=items.filter(wall).filter(w=>hosted.some(c=>c.hostId===w.id))
  .map(w=>({wall:w,...projectOnWall(w,point.x,point.z)}))
  .filter(p=>p.distance<=.95).sort((a,b)=>a.distance-b.distance)[0]||nearestWall(items,point.x,point.z,.95);
 if(!near)return false;
 const w=near.wall,len=lengthOf(w),along=near.t*len,base=items.filter(c=>c.kind==='cabinet'&&c.subtype==='base'&&c.hostId===w.id);
 const nearest=base.map(c=>({c,d:Math.max(c.startT*len-along,0,along-c.endT*len)})).sort((a,b)=>a.d-b.d)[0];
 if(!nearest||nearest.d>.66||len<obj.width+.22)return false;
 const chosen=nearest.c,side=chosen.side||1,ux=(w.x2-w.x1)/len,uz=(w.z2-w.z1)/len;
 const nx=-uz*side,nz=ux*side,half=(obj.width+.055)/2;
 const joinedCorner=t=>items.some(other=>wall(other)&&other.id!==w.id&&
  Math.min(Math.hypot(other.x1-(t===0?w.x1:w.x2),other.z1-(t===0?w.z1:w.z2)),
   Math.hypot(other.x2-(t===0?w.x1:w.x2),other.z2-(t===0?w.z1:w.z2)))<.035);
 const leftClearance=joinedCorner(0)?.70:.40,rightClearance=joinedCorner(1)?.70:.40;
 if(len<obj.width+.055+leftClearance+rightClearance)
  throw Error('یخچال در کنج باید حداقل ۷۰ سانتی‌متر از دیوار کناری فاصله داشته باشد.');
 const mid=Math.max(half+leftClearance,Math.min(len-half-rightClearance,along));
 let cutLeft=mid-half,cutRight=mid+half;
 // An appliance may enter a narrow residual cabinet bay. Absorb the entire
 // remainder into its surround instead of refusing the drag or leaving a
 // physically impossible 10–40 cm cabinet fragment.
 for(const c of base.filter(c=>c.side===side)){
  const a=c.startT*len,b=c.endT*len;
  if(a<cutLeft&&b>cutLeft&&cutLeft-a<MIN_CABINET_LENGTH)cutLeft=a;
  if(a<cutRight&&b>cutRight&&b-cutRight<MIN_CABINET_LENGTH)cutRight=b;
 }
 const cutL=cutLeft/len,cutR=cutRight/len;
 const replacing=items.filter(c=>c.kind==='cabinet'&&c.hostId===w.id&&c.side===side&&
  Math.min(c.endT,cutR)-Math.max(c.startT,cutL)>.001&&
  c.elevation<obj.height+.035);
 if(!replacing.length){
  const left=base.some(c=>c.side===side&&Math.abs(c.endT*len-cutLeft)<.22);
  const right=base.some(c=>c.side===side&&Math.abs(c.startT*len-cutRight)<.22);
  if(!left||!right)return false;
 }
 for(const c of replacing){
  const hosted=items.filter(e=>e.kind==='equipment'&&e.hostId===c.id);
  const segments=[];
  const add=(startT,endT)=>{
   if((endT-startT)*len<MIN_CABINET_LENGTH)return;
   const piece={...c,id:segments.length?uid():c.id,startT,endT};
   segments.push(piece);
  };
  add(c.startT,Math.min(c.endT,cutL));
  add(Math.max(c.startT,cutR),c.endT);
  for(const e of hosted){
   const centre=(c.startT+(c.endT-c.startT)*(e.offsetT??.5))*len;
   if(centre+e.width/2>cutLeft-.02&&centre-e.width/2<cutRight+.02)
    throw Error('محل یخچال با سینک یا گاز نصب‌شده تداخل دارد.');
   const target=segments.find(p=>centre/len>=p.startT&&centre/len<=p.endT);
   if(!target)throw Error('کابینت زیر تجهیزات برای یخچال کافی نیست.');
   e.hostId=target.id;e.offsetT=(centre/len-target.startT)/(target.endT-target.startT);
  }
  const oldFronts=items.filter(f=>f.kind==='front'&&f.hostId===c.id);
  for(let j=items.length-1;j>=0;j--)if(items[j].kind==='front'&&items[j].hostId===c.id)items.splice(j,1);
  items.splice(items.findIndex(x=>x.id===c.id),1,...segments);
  for(const piece of segments)syncCabinet(items,piece);
  if(FRONT_PRESETS[c.frontPreset])for(const piece of segments)reflowFronts(items,piece);
  else for(const f of oldFronts){
   const originalStart=c.startT+(c.endT-c.startT)*f.startT,
    originalEnd=c.startT+(c.endT-c.startT)*f.endT;
   const piece=segments.find(p=>originalStart>=p.startT-.00001&&originalEnd<=p.endT+.00001);
   if(piece){f.hostId=piece.id;f.startT=(originalStart-piece.startT)/(piece.endT-piece.startT);
    f.endT=(originalEnd-piece.startT)/(piece.endT-piece.startT);items.push(f);}
  }
 }
 obj.x=w.x1+ux*mid+nx*(w.thickness/2+obj.depth/2+.02);
 obj.z=w.z1+uz*mid+nz*(w.thickness/2+obj.depth/2+.02);
 obj.rotation=Math.atan2(uz,ux)+(side<0?Math.PI:0);
 obj.builtIn=true;obj.surround={wallId:w.id,side,clearance:.055,
  bayWidth:cutRight-cutLeft,bayOffset:(cutLeft+cutRight)/2-mid};
 validateCabinets(items,w);
 return true;
}
/* An in-cabinet oven remains inside its base run. Keeping the host run intact
   lets a stove occupy the exact same bay above it without drifting sideways. */
function embedOven(items,obj,point){
 const ranked=items.filter(c=>c.kind==='cabinet'&&c.subtype==='base').map(c=>{
  const len=lengthOf(c),dx=c.x2-c.x1,dz=c.z2-c.z1;
  const t=Math.max(0,Math.min(1,((point.x-c.x1)*dx+(point.z-c.z1)*dz)/(len*len)));
  const x=c.x1+t*dx,z=c.z1+t*dz;
  return {c,t,d:Math.hypot(point.x-x,point.z-z)};
 }).filter(v=>v.d<=v.c.depth/2+.22&&lengthOf(v.c)>=obj.width+.04&&v.c.depth>=obj.depth-.02)
  .sort((a,b)=>a.d-b.d);
 const best=ranked[0];if(!best)return false;
 const c=best.c,len=lengthOf(c),margin=(obj.width/2+.02)/len;
 const t=Math.max(margin,Math.min(1-margin,best.t));
 obj.x=c.x1+(c.x2-c.x1)*t;obj.z=c.z1+(c.z2-c.z1)*t;
 obj.rotation=Math.atan2(c.z2-c.z1,c.x2-c.x1)+(c.side===-1?Math.PI:0);
 obj.elevation=c.elevation+.12;
 obj.hostId=c.id;obj.offsetT=t;obj.builtIn=true;
 obj.surround={wallId:c.hostId,side:c.side};
 if(obj.elevation+obj.height>c.elevation+c.height-.015)throw Error('ارتفاع فر از فضای کابینت بیشتر است.');
 for(const other of items.filter(e=>e.kind==='equipment'&&['oven','dishwasher','washer','fridge'].includes(e.subtype)))
  if(polygonOverlap(equipmentFootprint(obj),equipmentFootprint(other)))
   throw Error('فر با وسیله توکار دیگری تداخل دارد.');
 return true;
}
function embedTallAppliance(items,obj,point){
 const ranked=items.filter(c=>c.kind==='cabinet'&&c.subtype==='tall').map(c=>{
  const len=lengthOf(c),dx=c.x2-c.x1,dz=c.z2-c.z1;
  const t=Math.max(0,Math.min(1,((point.x-c.x1)*dx+(point.z-c.z1)*dz)/(len*len)));
  return {c,t,d:Math.hypot(point.x-c.x1-dx*t,point.z-c.z1-dz*t)};
 }).filter(v=>v.d<=v.c.depth/2+.23&&lengthOf(v.c)>=obj.width+.035&&v.c.depth>=obj.depth-.025)
  .sort((a,b)=>a.d-b.d);
 const best=ranked[0];if(!best)return false;
 const c=best.c,len=lengthOf(c),margin=(obj.width/2+.016)/len;
 obj.hostId=c.id;obj.offsetT=Math.max(margin,Math.min(1-margin,best.t));
 obj.builtIn=true;obj.surround={wallId:c.hostId,side:c.side};
 syncEquipment([c,obj]);
 if(obj.elevation+obj.height>c.elevation+c.height-.015)
  throw Error('ارتفاع ستون برای این دستگاه کافی نیست.');
 for(const other of items.filter(e=>e.kind==='equipment'&&e.hostId===c.id)){
  const vertical=Math.min(obj.elevation+obj.height,other.elevation+other.height)-Math.max(obj.elevation,other.elevation);
  if(vertical>.01&&Math.abs((obj.offsetT-other.offsetT)*len)<(obj.width+other.width)/2+.02)
   throw Error('فر و مایکروویو داخل ستون نباید هم‌پوشانی داشته باشند.');
 }
 return true;
}
/* A washing machine or dishwasher occupies the front cavity of its cabinet run.
   Unlike a refrigerator it never deletes/splits the host or its full worktop. */
function embedUndercounter(items,obj,point){
 const ranked=items.filter(c=>c.kind==='cabinet'&&c.subtype==='base').map(c=>{
  const len=lengthOf(c),dx=c.x2-c.x1,dz=c.z2-c.z1;
  const t=Math.max(0,Math.min(1,((point.x-c.x1)*dx+(point.z-c.z1)*dz)/(len*len)));
  return {c,t,d:Math.hypot(point.x-c.x1-dx*t,point.z-c.z1-dz*t)};
 }).filter(v=>v.d<=v.c.depth/2+.22&&lengthOf(v.c)>=obj.width+.04&&v.c.depth>=obj.depth-.035&&
  v.c.elevation+v.c.height-obj.height-.02>=.005).sort((a,b)=>a.d-b.d);
 const best=ranked[0];if(!best)return false;
 const c=best.c,len=lengthOf(c),margin=(obj.width/2+.02)/len;
 obj.hostId=c.id;obj.offsetT=Math.max(margin,Math.min(1-margin,best.t));
 obj.builtIn=true;obj.underCounter=true;
 obj.surround={wallId:c.hostId,side:c.side};
 syncEquipment([c,obj]); // Position from the host without changing any other object.
 for(const other of items.filter(e=>e.kind==='equipment'&&['oven','dishwasher','washer','fridge'].includes(e.subtype))){
  const vertical=Math.min(obj.elevation+obj.height,other.elevation+other.height)-Math.max(obj.elevation,other.elevation);
  if(vertical>.015&&polygonOverlap(equipmentFootprint(obj),equipmentFootprint(other)))
   throw Error('فضای زیر صفحه با تجهیزات توکار دیگری اشغال شده است.');
 }
 return true;
}
export function placeEquipment(source,point,subtype,{freestanding=false}={}){
 const spec=EQUIPMENT_SPECS[subtype],items=copy(source);
 if(!spec||!finite(point?.x,point?.z))throw Error('محل تجهیزات معتبر نیست.');
 const obj={id:uid(),kind:'equipment',subtype,name:spec.name,width:spec.width,
  depth:spec.depth,height:spec.height,elevation:spec.elevation,x:point.x,z:point.z,rotation:0,
  model:EQUIPMENT_MODELS[subtype][0].id,...(subtype==='stove'?{induction:false}:{}),
  ...(subtype==='sink'?{sinkSize:60,faucetModel:'arc'}:{}),
  ...(subtype==='fridge'?{fridgeFeet:24}:{})};
 if(subtype==='fridge'){
  Object.assign(obj,snapFridgePoint(items,point,obj.width,obj.depth));
  if(!freestanding)embedFridge(items,obj,point);
  for(const w of items.filter(wall)){
   if(polygonOverlap(equipmentFootprint(obj),wallFootprint(w,items)))throw Error('یخچال نباید داخل دیوار قرار بگیرد.');
  }
  for(const c of items.filter(o=>o.kind==='cabinet')){
   const host=byId(items,c.hostId);
   if(host&&Math.min(obj.height,c.elevation+c.height)-Math.max(0,c.elevation)>.015&&
     polygonOverlap(equipmentFootprint(obj),cabinetFootprint(c,host).corners))
    throw Error('یخچال با کابینت برخورد دارد؛ آن را داخل فضای کابینت یا روی کف آزاد بگذار.');
  }
  for(const e of items.filter(o=>o.kind==='equipment'))
   if(polygonOverlap(equipmentFootprint(obj),equipmentFootprint(e)))
    throw Error('یخچال با تجهیزات دیگر برخورد دارد.');
 }else if(subtype==='oven'){
  if(!embedTallAppliance(items,obj,point)&&!embedOven(items,obj,point))
   throw Error('برای فر توکار، کابینت زمینی یا ستون تمام‌قد با عمق کافی لازم است.');
 }else if(subtype==='microwave'){
  if(!embedTallAppliance(items,obj,point))throw Error('برای نصب مایکروویو توکار، ستون تمام‌قد لازم است.');
 }else if(UNDERCOUNTER_TYPES.has(subtype)){
  if(!embedUndercounter(items,obj,point))throw Error('برای نصب زیرصفحه، کابینت زمینی با ارتفاع و عمق کافی لازم است.');
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
  for(const other of items.filter(o=>o.kind==='equipment'&&o.hostId===obj.hostId&&!(subtype==='stove'&&o.subtype==='oven')))
   if(Math.abs(other.offsetT-obj.offsetT)*len<(other.width+obj.width)/2+.02)
    throw Error('این قسمت کابینت قبلاً تجهیزات دارد.');
 }
 items.push(obj);
 if(BUILT_IN_TYPES.has(subtype)||['sink','stove'].includes(subtype)){
  const c=byId(items,obj.hostId);
  if(FRONT_PRESETS[c?.frontPreset])reflowFronts(items,c);
 }
 if(subtype==='stove')items.push({id:uid(),kind:'equipment',subtype:'hood',name:'هود',
  model:'slim',linkedStoveId:obj.id,width:Math.max(.60,obj.width),depth:.45,height:.32,
  elevation:1.55,x:obj.x,z:obj.z,rotation:obj.rotation});
 syncEquipment(items);validateEquipmentSpacing(items);
 if(subtype==='fridge'&&obj.builtIn)try{
  const result=addOverFridgeCabinet(items,obj.id,{depth:.60});
  return {items:result.items,selectedId:obj.id};
 }catch{ /* A freestanding fridge remains valid when an overhead unit cannot fit. */ }
 return {items,selectedId:obj.id};
}
export function editEquipment(source,id,{width,depth,height,model,induction,sinkSize,fridgeFeet,facadeMode,faucetModel}={}){
 const items=copy(source),e=byId(items,id);
 if(!e||e.kind!=='equipment')throw Error('تجهیزات انتخاب نشده‌اند.');
 if(facadeMode!==undefined){
  if(!['dishwasher','washer','fridge'].includes(e.subtype)||!EQUIPMENT_FACADE_MODES.includes(facadeMode))
   throw Error('پوشش نمای تجهیزات معتبر نیست.');
  if(e.subtype==='fridge'&&!e.builtIn&&facadeMode!=='visible')throw Error('یخچال باید توکار باشد.');
  e.facadeMode=facadeMode;
 }
 if(model!==undefined){
  if(!EQUIPMENT_MODELS[e.subtype]?.some(m=>m.id===model))throw Error('مدل تجهیزات نامعتبر است.');
  e.model=model;
  if(e.subtype==='stove'&&width===undefined)e.width=STOVE_WIDTHS[model]??e.width;
  if(e.subtype==='fridge'&&width===undefined&&fridgeFeet===undefined){
   const dims=fridgeDimensions(e.model,e.fridgeFeet||24);[e.width,e.depth,e.height]=dims;
  }
 }
 if(fridgeFeet!==undefined&&e.subtype==='fridge'){
  const feet=Number(fridgeFeet);if(!FRIDGE_FEET.includes(feet))throw Error('فوت یخچال معتبر نیست.');
  e.fridgeFeet=feet;if(width===undefined){const dims=fridgeDimensions(e.model,feet);[e.width,e.depth,e.height]=dims;}
 }
 if(induction!==undefined&&e.subtype==='stove')e.induction=Boolean(induction);
 if(faucetModel!==undefined&&e.subtype==='sink'){
  if(!FAUCET_MODELS.some(f=>f.id===faucetModel))throw Error('مدل شیر سینک معتبر نیست.');
  e.faucetModel=faucetModel;
 }
 if(sinkSize!==undefined&&e.subtype==='sink'){
  const v=Number(sinkSize);if(!SINK_WIDTHS[v])throw Error('عرض سینک باید ۶۰، ۹۰ یا ۱۲۰ سانتی‌متر باشد.');
  e.sinkSize=v;if(width===undefined)e.width=SINK_WIDTHS[v];
 }
 e.width=Number(width??e.width);e.depth=Number(depth??e.depth);e.height=Number(height??e.height);
 if(!finite(e.width,e.depth,e.height)||e.width<.3||e.width>2||e.depth<.2||e.depth>1.3||e.height<.025||e.height>2.7)
  throw Error('ابعاد تجهیزات نامعتبر است.');
 if(e.builtIn&&e.subtype==='fridge'){
  const hostWall=byId(items,e.surround?.wallId);
  if(hostWall){
   const len=lengthOf(hostWall),ux=(hostWall.x2-hostWall.x1)/len,uz=(hostWall.z2-hostWall.z1)/len;
   const side=e.surround.side||1,nx=-uz*side,nz=ux*side;
   const center=projectOnWall(hostWall,e.x,e.z).t*len,half=(e.width+.055)/2;
   let cutLeft=center-half,cutRight=center+half;
   if(e.surround?.bayWidth){
    const oldMid=center+(e.surround.bayOffset||0);
    cutLeft=Math.min(cutLeft,oldMid-e.surround.bayWidth/2);
    cutRight=Math.max(cutRight,oldMid+e.surround.bayWidth/2);
   }
   if(cutLeft<.40||cutRight>len-.40)throw Error('برای این وسیله حداقل ۴۰ سانتی‌متر فاصله تا انتهای دیوار لازم است.');
   for(const endpoint of [0,1]){
    const x=endpoint?hostWall.x2:hostWall.x1,z=endpoint?hostWall.z2:hostWall.z1;
    const connected=items.some(w=>wall(w)&&w.id!==hostWall.id&&
     (Math.hypot(w.x1-x,w.z1-z)<.035||Math.hypot(w.x2-x,w.z2-z)<.035));
    if(connected&&(endpoint?len-cutRight:cutLeft)<.70-.0001)
     throw Error('فاصله یخچال یا وسیله توکار تا دیوار کنج باید حداقل ۷۰ سانتی‌متر باشد.');
   }
   for(const c of items.filter(c=>c.kind==='cabinet'&&c.hostId===hostWall.id&&c.side===side)){
    if(c.startT*len<cutLeft&&c.endT*len>cutLeft&&cutLeft-c.startT*len<MIN_CABINET_LENGTH)cutLeft=c.startT*len;
    if(c.startT*len<cutRight&&c.endT*len>cutRight&&c.endT*len-cutRight<MIN_CABINET_LENGTH)cutRight=c.endT*len;
   }
   for(const c of [...items])if(c.kind==='cabinet'&&c.hostId===hostWall.id&&c.side===side&&
    Math.min(c.endT*len,cutRight)-Math.max(c.startT*len,cutLeft)>.001&&
    Math.min(e.elevation+e.height,c.elevation+c.height)-Math.max(e.elevation,c.elevation)>.015){
    const attached=items.filter(o=>o.kind==='equipment'&&o.hostId===c.id);
    if(attached.length)throw Error('ابتدا تجهیزات موجود در کابینت مجاور را جابه‌جا کن.');
    if(c.startT*len<center)c.endT=cutLeft/len;
    else c.startT=cutRight/len;
    if((c.endT-c.startT)*len<MIN_CABINET_LENGTH)items.splice(items.indexOf(c),1);
    else {syncCabinet(items,c);if(FRONT_PRESETS[c.frontPreset])reflowFronts(items,c);}
   }
   e.x=hostWall.x1+ux*center+nx*(hostWall.thickness/2+e.depth/2+.02);
   e.z=hostWall.z1+uz*center+nz*(hostWall.thickness/2+e.depth/2+.02);
   e.rotation=Math.atan2(uz,ux)+(side<0?Math.PI:0);
   e.surround.bayWidth=cutRight-cutLeft;e.surround.bayOffset=(cutLeft+cutRight)/2-center;
   if(items.some(w=>wall(w)&&polygonOverlap(equipmentFootprint(e),wallFootprint(w,items))))
    throw Error('ابعاد وسیله با دیوار تداخل دارد.');
   for(const c of items.filter(o=>o.kind==='cabinet')){
    const owner=byId(items,c.hostId);
    if(owner&&Math.min(e.elevation+e.height,c.elevation+c.height)-Math.max(e.elevation,c.elevation)>.01&&
     polygonOverlap(equipmentFootprint(e),cabinetFootprint(c,owner).corners))
     throw Error('اندازه انتخابی در فضای فعلی کابینت جا نمی‌گیرد؛ ابتدا جای آن را بزرگ کن.');
   }
  }
 }
 if(e.subtype==='fridge'&&!e.builtIn){
  // The standalone refrigerator can change to side-by-side dimensions without
  // being forced back into a cabinet; reject only actual footprint collisions.
  if(items.some(w=>wall(w)&&polygonOverlap(equipmentFootprint(e),wallFootprint(w,items)))||
    items.some(c=>c.kind==='cabinet'&&wall(byId(items,c.hostId))&&
     Math.min(e.elevation+e.height,c.elevation+c.height)-Math.max(e.elevation,c.elevation)>.015&&
     polygonOverlap(equipmentFootprint(e),cabinetFootprint(c,byId(items,c.hostId)).corners)))
   throw Error('برای ابعاد جدید یخچال، آن را کمی از دیوار یا کابینت فاصله بده.');
 }
 if(e.hostId){
  const host=byId(items,e.hostId);
  if(!host||e.width>lengthOf(host)-.04)throw Error('عرض تجهیزات از طول کابینت بیشتر است.');
  if(host.subtype==='tall'){
   if(e.depth>host.depth+.025||host.elevation+(e.subtype==='microwave'?1.47:.72)+e.height>host.elevation+host.height-.015)
    throw Error('ابعاد تجهیزات با فضای ستون تمام‌قد سازگار نیست.');
   const low=host.elevation+(e.subtype==='microwave'?1.47:.72),high=low+e.height;
   for(const other of items.filter(x=>x.kind==='equipment'&&x.id!==e.id&&x.hostId===host.id))
    if(Math.min(high,other.elevation+other.height)-Math.max(low,other.elevation)>.01)
     throw Error('تجهیزات توکار ستون در ارتفاع روی هم افتاده‌اند.');
  }
  if(UNDERCOUNTER_TYPES.has(e.subtype)&&
   (e.depth>host.depth+.035||e.height>host.elevation+host.height-.025))
   throw Error('ابعاد ماشین از فضای زیر صفحه کابینت بزرگ‌تر است.');
  const margin=(e.width/2+.02)/lengthOf(host);
  e.offsetT=Math.max(margin,Math.min(1-margin,e.offsetT??.5));
  syncEquipment(items);
 }
 syncEquipment(items);validateEquipmentSpacing(items);
 return {items,selectedId:id};
}
export function placeCabinet(source,start,end,{kind='base',depth,height,elevation,side,cornerGroup,frontRules}={}){
 const items=copy(source);
 if(!finite(start?.x,start?.z,end?.x,end?.z))throw Error('نقطه شروع یا پایان کابینت نامعتبر است.');
 const found=byId(items,start.hostId)||nearestWall(items,start.x,start.z,.58)?.wall;
 if(!wall(found))throw Error('ابتدا دیوار بساز؛ کابینت فقط روی دیوار میزبان نصب می‌شود.');
 const w=found,len=lengthOf(w),a=projectOnWall(w,start.x,start.z),b=projectOnWall(w,end.x,end.z);
 if(b.distance>.65)throw Error('پایان کابینت باید روی همان دیوار میزبان باشد.');
 if(!['base','upper','tall'].includes(kind))throw Error('نوع کابینت نامعتبر است.');
 const upper=kind==='upper',tall=kind==='tall',d=Number(depth??(upper?.35:.60)),h=Number(height??(upper?.72:tall?2.15:.78)),e=Number(elevation??(upper?1.55:.08));
 const capped=limitCabinetEnd(items,w,a.t,b.t,{kind,height:h,elevation:e});
 let from=Math.min(a.t,capped),to=Math.max(a.t,capped);
 if((to-from)*len<MIN_CABINET_LENGTH)throw Error('طول کابینت باید حداقل ۴۵ سانتی‌متر باشد.');
 const cross=(start.x-w.x1)*(w.z2-w.z1)-(start.z-w.z1)*(w.x2-w.x1);
 const chosen=side??start.side??(Math.abs(cross)<.01?1:(cross>0?-1:1));
 const obj={id:uid(),kind:'cabinet',subtype:kind,name:upper?'کابینت هوایی':tall?'ستون تمام‌قد':'کابینت زمینی',
  hostId:w.id,startT:from,endT:to,side:chosen,depth:d,height:h,elevation:e,cornerGroup:cornerGroup||null,
  frontRules:checkedFrontRules(frontRules||{})};
 items.push(obj);validateCabinets(items,w);
 return {items,selectedId:obj.id,end:{x:w.x1+(w.x2-w.x1)*capped,z:w.z1+(w.z2-w.z1)*capped,hostId:w.id,side:chosen},stoppedAtOpening:(upper||tall)&&Math.abs(capped-b.t)>.0001};
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
export function editOpening(source,id,{width,height,sill,metresFromStart,mirrored,openFraction,windowModel}){
 const items=copy(source),op=byId(items,id),w=byId(items,op?.hostId);
 if(!op||op.kind!=='opening'||!wall(w))throw Error('بازشوی معتبر انتخاب نشده است.');
 op.width=Number(width??op.width);op.height=Number(height??op.height);op.sill=Number(sill??op.sill);
 const centre=Number(metresFromStart??op.hostT*lengthOf(w));
 if(!finite(centre,op.width,op.height,op.sill)||op.width<.3||op.height<.3||op.sill<0||
  (op.style==='door'&&op.sill>.01)||centre<op.width/2+.1||centre>lengthOf(w)-op.width/2-.1)
  throw Error('ابعاد یا محل بازشو خارج از دیوار است.');
 op.hostT=centre/lengthOf(w);
 if(windowModel!==undefined&&op.style==='fixed'){
  if(!['single','double','triple','quad'].includes(windowModel))throw Error('تقسیم پنجره معتبر نیست.');
  op.windowModel=windowModel;
 }
 if(op.style==='door'){
  if(openFraction!==undefined){const f=Number(openFraction);if(!finite(f)||f<0||f>1)throw Error('زاویه بازشدن در معتبر نیست.');op.openFraction=f;}
  if(mirrored!==undefined)op.mirrored=Boolean(mirrored);
 }
 validateHostOpenings(items,w);validateCabinets(items,w);
 return {items,selectedId:id};
}
export function moveEndpoint(source,id,start,x,z){
 x=cm(x);z=cm(z);
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
 const len=lengthOf(w),target=cm(Number(length??len)),thick=cm(Number(thickness??w.thickness)),high=cm(Number(height??w.height));
 checkWall({x:0,z:0},{x:target,z:0},thick,high);
 const x=cm(w.x1+(w.x2-w.x1)/len*target),z=cm(w.z1+(w.z2-w.z1)/len*target),node=w.endNodeId;
 for(const other of items)if(wall(other)){
  if(other.startNodeId===node){other.x1=x;other.z1=z;}
  if(other.endNodeId===node){other.x2=x;other.z2=z;}
 }
 w.thickness=thick;w.height=high;
 for(const other of items)if(wall(other)){if(lengthOf(other)<.10)throw Error('دیوار کوتاه می‌شود.');validateHostOpenings(items,other);validateCabinets(items,other);}
 return {items,selectedId:id};
}
export function setAllWallHeights(source,height){
 const target=cm(Number(height));
 if(!Number.isFinite(target)||target<2||target>9)throw Error('ارتفاع سقف باید بین ۲ تا ۹ متر باشد.');
 const items=copy(source);
 for(const w of items.filter(wall))w.height=target;
 for(const w of items.filter(wall)){validateHostOpenings(items,w);validateCabinets(items,w);}
 return {items,selectedId:null};
}
export function removeObject(source,id){
 const target=source.find(x=>x.id===id);
 if(!target)throw Error('آبجکت پیدا نشد.');
 if(target.subtype==='hood')throw Error('هود همیشه همراه گاز است؛ مدل آن را تغییر بده.');
 const deleted=new Set([id]);let changed=true;
 while(changed){changed=false;for(const o of source)if((o.hostId&&deleted.has(o.hostId)||o.linkedStoveId&&deleted.has(o.linkedStoveId)||o.overFridgeId&&deleted.has(o.overFridgeId)||o.kind==='corner'&&(deleted.has(o.aCabinetId)||deleted.has(o.bCabinetId)))&&!deleted.has(o.id)){deleted.add(o.id);changed=true;}}
 const items=copy(source).filter(o=>!deleted.has(o.id));
 if(target.kind==='front'){
  const owner=byId(items,target.hostId);
  if(owner){
   owner.frontPreset='custom';
   // Deleting the top drawer of a mixed unit extends the doors below up to
   // the worktop, instead of leaving an unmanufacturable empty band.
   const below=items.filter(f=>f.kind==='front'&&f.hostId===owner.id&&
    Math.abs(f.topT-target.bottomT)<.012&&
    Math.min(f.endT,target.endT)-Math.max(f.startT,target.startT)>.012);
   const covers=below.length&&below.every(f=>f.startT>=target.startT-.008&&f.endT<=target.endT+.008)&&
    Math.min(...below.map(f=>f.startT))<=target.startT+.008&&
    Math.max(...below.map(f=>f.endT))>=target.endT-.008;
   if(covers){for(const f of below)f.topT=target.topT;validateFronts(items,owner);}
  }
 }
 if(target.kind==='equipment'){
  // Old integrated units and inset refrigerators replaced cabinet geometry;
  // explicitly restore that missing run on deletion, including its facade.
  if(target.builtIn&&!target.hostId&&target.surround?.wallId){
   const wallObj=byId(items,target.surround.wallId),side=target.surround.side;
   if(wall(wallObj)){
    const len=lengthOf(wallObj),mid=projectOnWall(wallObj,target.x,target.z).t;
    const width=target.surround.bayWidth||target.width+.055;
    const startT=Math.max(0,mid-width/(2*len)),endT=Math.min(1,mid+width/(2*len));
    const overlap=items.some(c=>c.kind==='cabinet'&&c.subtype==='base'&&c.hostId===wallObj.id&&c.side===side&&
     Math.min(c.endT,endT)-Math.max(c.startT,startT)>.002);
    const neighbor=items.find(c=>c.kind==='cabinet'&&c.subtype==='base'&&c.hostId===wallObj.id&&c.side===side);
    if(!overlap&&neighbor&&(endT-startT)*len>=MIN_CABINET_LENGTH){
     const restored={id:uid(),kind:'cabinet',subtype:'base',name:'کابینت زمینی',hostId:wallObj.id,
      side,startT,endT,depth:neighbor.depth,height:neighbor.height,elevation:neighbor.elevation,frontPreset:'doors'};
     items.push(restored);syncCabinet(items,restored);reflowFronts(items,restored,'doors');
    }
   }
  }
  const host=byId(items,target.hostId);
  if(host?.kind==='cabinet'&&['base','tall'].includes(host.subtype)){
   reflowFronts(items,host,FRONT_PRESETS[host.frontPreset]?host.frontPreset:'doors');
  }
 }
 return {items,selectedId:null};
}
/* A move is one atomic replacement: clear old cutouts/apertures, relocate, and
   rebuild front bays. Failure leaves the original project untouched. */
export function moveEquipment(source,id,point){
 const original=byId(source,id);
 if(original?.kind!=='equipment'||original.subtype==='hood')throw Error('برای جابه‌جایی، خود وسیله را انتخاب کن.');
 const cleared=removeObject(source,id).items;
 const placed=placeEquipment(cleared,point,original.subtype,{freestanding:original.subtype==='fridge'&&!original.builtIn});
 const created=byId(placed.items,placed.selectedId);
 if(!created)throw Error('انتقال تجهیزات انجام نشد.');
 const createdId=created.id;created.id=id;
 for(const hood of placed.items.filter(e=>e.linkedStoveId===createdId)){
  hood.linkedStoveId=id;
  const oldHood=source.find(e=>e.linkedStoveId===id);
  if(oldHood){hood.id=oldHood.id;hood.model=oldHood.model;}
 }
 const changes={width:original.width,depth:original.depth,height:original.height,model:original.model,
  induction:original.induction,sinkSize:original.sinkSize,fridgeFeet:original.fridgeFeet,
  faucetModel:original.faucetModel,facadeMode:original.facadeMode};
 return {...editEquipment(placed.items,id,changes),selectedId:id};
}
export function setFridgeInstallation(source,id,freestanding){
 const old=byId(source,id);
 if(old?.subtype!=='fridge')throw Error('ابتدا یخچال را انتخاب کن.');
 if(freestanding===!old.builtIn)return {items:copy(source),selectedId:id};
 const cleared=removeObject(source,id).items;
 let point={x:old.x,z:old.z};
 if(freestanding&&old.builtIn){
  const wallObj=byId(source,old.surround?.wallId),side=old.surround?.side||1;
  if(wall(wallObj)){
   const len=lengthOf(wallObj),nx=-(wallObj.z2-wallObj.z1)/len*side,nz=(wallObj.x2-wallObj.x1)/len*side;
   point={x:old.x+nx*1.05,z:old.z+nz*1.05};
  }
 }
 const fresh=placeEquipment(cleared,point,'fridge',{freestanding});
 const equipment=byId(fresh.items,fresh.selectedId);
 if(!freestanding&&!equipment?.builtIn)throw Error('برای نصب توکار، یخچال را نزدیک کابینت زمینی جابه‌جا کن.');
 if(equipment){const createdId=equipment.id;equipment.id=id;equipment.model=old.model;equipment.fridgeFeet=old.fridgeFeet;
  for(const c of fresh.items)if(c.overFridgeId===createdId)c.overFridgeId=id;
  if(old.width!==equipment.width||old.depth!==equipment.depth||old.height!==equipment.height){
   // Re-run dimensional validation after the selected installation is fixed.
   return editEquipment(fresh.items,id,{model:old.model,fridgeFeet:old.fridgeFeet});
  }
 }
 return {items:fresh.items,selectedId:id};
}

export function editCabinet(source,id,{length,depth,height,elevation}){
 const items=copy(source),c=byId(items,id),w=byId(items,c?.hostId);
 if(!c||c.kind!=='cabinet'||!wall(w))throw Error('برای ویرایش کابینت باید دیوار میزبان وجود داشته باشد.');
 const len=lengthOf(w),target=Number(length??(c.endT-c.startT)*len);
 c.endT=c.startT+target/len;
 c.depth=Number(depth??c.depth);c.height=Number(height??c.height);c.elevation=Number(elevation??c.elevation);
 if(FRONT_PRESETS[c.frontPreset])reflowFronts(items,c);
 if(['upper','base'].includes(c.subtype))refitBridges(items);
 validateCabinets(items,w);return {items,selectedId:id};
}
export function moveCabinetEndpoint(source,id,start,x,z){
 const items=copy(source),c=byId(items,id),w=byId(items,c?.hostId);
 if(!c||c.kind!=='cabinet'||!wall(w)||!finite(x,z))throw Error('کابینت روی دیوار معتبر انتخاب نشده است.');
 const projected=projectOnWall(w,x,z);
 if(projected.distance>.65)throw Error('دستگیره کابینت باید روی همان دیوار بماند.');
 let t=projected.t;
 const boundary=[0,1,...items.filter(o=>o.kind==='cabinet'&&o.id!==c.id&&o.hostId===w.id&&o.side===c.side)
  .flatMap(o=>[o.startT,o.endT])].sort((a,b)=>Math.abs(a-t)-Math.abs(b-t))[0];
 if(Math.abs(boundary-t)*lengthOf(w)<.15)t=boundary;
 if(start)c.startT=t;else c.endT=t;
 if(FRONT_PRESETS[c.frontPreset])reflowFronts(items,c);
 if(['upper','base'].includes(c.subtype))refitBridges(items);
 validateCabinets(items,w);return {items,selectedId:id};
}

/* Real parametric rectangular cutouts: available both to the 3D slab mesher
   and the fabrication/plan view; sizes are snapped to 1 cm. */
export function countertopCutouts(items,c){
 if(c?.kind!=='cabinet'||c.subtype!=='base')return [];
 const len=lengthOf(c);
 return items.filter(e=>e.kind==='equipment'&&['sink','stove'].includes(e.subtype)&&e.hostId===c.id)
  .map(e=>{
   const width=Math.round(Math.min(e.width-.05,len-.04)*100)/100;
   const depth=Math.round(Math.min(e.depth-.045,c.depth-.05)*100)/100;
   const middle=((e.offsetT??.5)-.5)*len;
   return {id:e.id,type:e.subtype,model:e.model,x:middle,z:0,width,depth,
    left:Math.round((middle+len/2-width/2)*100)/100,
    right:Math.round((len/2-middle-width/2)*100)/100,
    cutDepth:e.subtype==='sink'?.24:.085};
  });
}
/* A cupboard above a refrigerator has its own facade and depth choice. */
export function addOverFridgeCabinet(source,fridgeId,{depth=.60}={}){
 const items=copy(source),e=byId(items,fridgeId);
 if(e?.subtype!=='fridge')throw Error('ابتدا یخچال را انتخاب کن.');
 const existing=items.find(c=>c.kind==='cabinet'&&c.overFridgeId===fridgeId);
 if(existing){existing.depth=Number(depth);validateCabinets(items,byId(items,existing.hostId));
  return {items,selectedId:existing.id};}
 const host=byId(items,e.surround?.wallId)||nearestWall(items,e.x,e.z,1)?.wall;
 if(!wall(host))throw Error('یخچال باید نزدیک دیوار باشد تا کابینت بالای آن نصب شود.');
 const len=lengthOf(host),pos=projectOnWall(host,e.x,e.z),width=Math.max(MIN_CABINET_LENGTH,e.width+.10);
 const a=pos.t-width/(2*len),b=pos.t+width/(2*len),elevation=e.height+.035;
 const height=Math.min(.50,host.height-elevation-.04);
 if(a<0||b>1||height<.25)throw Error('بالای یخچال فضای کافی روی این دیوار نیست.');
 const cross=(e.x-host.x1)*(host.z2-host.z1)-(e.z-host.z1)*(host.x2-host.x1);
 const side=e.surround?.side??(cross>0?-1:1);
 const c={id:uid(),kind:'cabinet',subtype:'over-fridge',name:'کابینت بالای یخچال',
  hostId:host.id,overFridgeId:fridgeId,side,startT:a,endT:b,depth:Number(depth),
  height,elevation,cornerGroup:null};
 items.push(c);validateCabinets(items,host);reflowFronts(items,c,'doors');
 return {items,selectedId:c.id};
}
/* Link the countertop to the wall unit with a selectable open vertical shelf.
   The column fills only the free height between the two installed runs. */
export function addVerticalBridge(source,upperId,{edge='end',depthMode='base',width=.45}={}){
 const items=copy(source),upper=byId(items,upperId);
 if(upper?.kind!=='cabinet'||upper.subtype!=='upper')throw Error('کابینت هوایی را انتخاب کن.');
 const owner=byId(items,upper.hostId),len=lengthOf(owner);
 const anchor=edge==='start'?upper.startT:upper.endT,span=Number(width)/len;
 const a=edge==='start'?anchor:anchor-span,b=edge==='start'?anchor+span:anchor;
 if(a<0||b>1||Number(width)<MIN_CABINET_LENGTH)throw Error('برای قفسه عمودی حداقل ۴۵ سانتی‌متر فضا لازم است.');
 const base=items.find(c=>c.kind==='cabinet'&&c.subtype==='base'&&c.hostId===upper.hostId&&
  c.side===upper.side&&c.startT<=a+.01&&c.endT>=b-.01);
 if(!base)throw Error('زیر این لبه باید کابینت زمینی هم‌راستا نصب شده باشد.');
 const elevation=base.elevation+base.height+.04,height=upper.elevation-elevation-.04;
 if(height<.25)throw Error('بین کابینت زمینی و هوایی ارتفاع کافی برای قفسه نیست.');
 const c={id:uid(),kind:'cabinet',subtype:'bridge',name:'قفسه رابط عمودی',
  hostId:owner.id,side:upper.side,startT:a,endT:b,
  depth:depthMode==='upper'?upper.depth:base.depth,elevation,height,
  bridgeMode:depthMode,cornerGroup:null};
 items.push(c);validateCabinets(items,owner);
 return {items,selectedId:c.id};
}
function refitBridges(items){
 const uppers=items.filter(c=>c.kind==='cabinet'&&c.subtype==='upper');
 for(const bridge of items.filter(c=>c.kind==='cabinet'&&c.subtype==='bridge')){
  const matching=uppers.find(c=>c.hostId===bridge.hostId&&c.side===bridge.side&&
   c.startT<=bridge.startT+.01&&c.endT>=bridge.endT-.01);
  const base=items.find(c=>c.kind==='cabinet'&&c.subtype==='base'&&c.hostId===bridge.hostId&&
   c.side===bridge.side&&c.startT<=bridge.startT+.01&&c.endT>=bridge.endT-.01);
  if(!matching||!base)throw Error('قفسه رابط باید بین دو کابینت هم‌راستا بماند.');
  bridge.elevation=base.elevation+base.height+.04;
  bridge.height=matching.elevation-bridge.elevation-.04;
  if(bridge.height<.25)throw Error('ارتفاع جدید برای قفسه رابط کافی نیست.');
 }
}
export function applyAllUpperHeights(source,{height,elevation}={}){
 const items=copy(source),uppers=items.filter(c=>c.kind==='cabinet'&&c.subtype==='upper');
 if(!uppers.length)throw Error('کابینت هوایی وجود ندارد.');
 for(const c of uppers){if(height!==undefined)c.height=Number(height);
  if(elevation!==undefined)c.elevation=Number(elevation);
  if(FRONT_PRESETS[c.frontPreset])reflowFronts(items,c);
 }
 refitBridges(items);
 for(const id of new Set(uppers.map(c=>c.hostId)))validateCabinets(items,byId(items,id));
 return {items,selectedId:uppers[0].id};
}
