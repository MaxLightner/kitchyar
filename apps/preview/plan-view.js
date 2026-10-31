import {lengthOf,nearestWall,projectOnWall,cabinetFootprint,limitCabinetEnd,EQUIPMENT_SPECS,equipmentPosition,snapCabinetPoint,cabinetPath,cabinetTurnTrim,snapFridgePoint,placeEquipment} from './geometry.js?v=render14';
import {renderPlanMeasurements} from './edit-handles.js?v=render14';
const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const f=n=>Number(n).toFixed(4);
export function renderPlan(items,{mini=false,selectedId=null,drawing=null,hover=null,gesture=null}={}){
 const walls=items.filter(x=>x.kind==='wall'),cabinets=items.filter(x=>x.kind==='cabinet');
 const gridId=mini?'mini-grid-k':'main-grid-k';
 let out='<svg '+(mini?'class="mini-svg"':'id="plan-view" class="plan-svg"')+
  ' xmlns="http://www.w3.org/2000/svg" viewBox="-5 -4 10 8" preserveAspectRatio="xMidYMid meet" role="img" aria-label="پلان متریک پروژه">'+
  '<defs><pattern id="'+gridId+'" width=".1" height=".1" patternUnits="userSpaceOnUse"><path d="M.1 0H0V.1" fill="none" stroke="#a4bbaa" stroke-width=".006"/></pattern></defs>'+
  '<rect x="-5" y="-4" width="10" height="8" fill="#f4f5ef"/><rect x="-5" y="-4" width="10" height="8" fill="url(#'+gridId+')"/>';
 for(const w of walls){
  const isSelected=w.id===selectedId;
  out+='<line data-item-id="'+safe(w.id)+'" x1="'+f(w.x1)+'" y1="'+f(w.z1)+'" x2="'+f(w.x2)+'" y2="'+f(w.z2)+
   '" stroke="'+(isSelected?'#3c9b7f':'#6f7771')+'" stroke-width="'+f(w.thickness)+'" stroke-linecap="butt" />';
 }
 for(const o of items.filter(x=>x.kind==='opening')){
  const w=walls.find(x=>x.id===o.hostId);if(!w)continue;
  const len=lengthOf(w),dx=(w.x2-w.x1)/len,dz=(w.z2-w.z1)/len,t=o.hostT*len;
  const ax=w.x1+(t-o.width/2)*dx,az=w.z1+(t-o.width/2)*dz;
  const bx=w.x1+(t+o.width/2)*dx,bz=w.z1+(t+o.width/2)*dz;
  out+='<line data-item-id="'+safe(o.id)+'" x1="'+f(ax)+'" y1="'+f(az)+'" x2="'+f(bx)+'" y2="'+f(bz)+
   '" stroke="'+(o.style==='door'?'#a78063':'#86b6c4')+'" stroke-width="'+(o.id===selectedId?'.15':'.105')+'" stroke-linecap="butt"/>';
  if(o.style==='door'){
   const swingX=ax+(bx-ax)*.7,swingZ=az+(bz-az)*.7;
   out+='<line x1="'+f(ax)+'" y1="'+f(az)+'" x2="'+f(swingX)+'" y2="'+f(swingZ)+'" stroke="#7d6854" stroke-width=".018" pointer-events="none"/>';
  }
 }
 for(const c of cabinets){
  const w=walls.find(x=>x.id===c.hostId),fp=w?cabinetFootprint(c,w):null;
  if(fp){
   out+='<polygon data-item-id="'+safe(c.id)+'" points="'+fp.corners.map(p=>f(p.x)+','+f(p.z)).join(' ')+
    '" fill="'+(c.id===selectedId?'#70bd9e':c.subtype==='upper'?'#dfd5c5':'#b5a08b')+
    '" fill-opacity="'+(c.subtype==='upper'?'.6':'.9')+'" stroke="#786e64" stroke-width=".025"/>';
  }else out+='<line data-item-id="'+safe(c.id)+'" x1="'+f(c.x1)+'" y1="'+f(c.z1)+'" x2="'+f(c.x2)+'" y2="'+f(c.z2)+
   '" stroke="#ab9382" stroke-width="'+f(c.depth)+'" opacity=".65"/>';
 }
 for(const e of items.filter(x=>x.kind==='equipment')){
  const corners=equipmentCorners(e.x,e.z,e.width,e.depth,e.rotation||0);
  out+='<g data-item-id="'+safe(e.id)+'" opacity=".94"><polygon points="'+corners.map(p=>f(p.x)+','+f(p.z)).join(' ')+
   '" fill="'+(e.subtype==='fridge'?'#cbd2d3':e.subtype==='stove'?'#45484a':'#9bc7c6')+
   '" stroke="'+(e.id===selectedId?'#329e7f':'#5c7373')+'" stroke-width=".028"/>';
  if(e.subtype==='stove'){
   const burner=e.model==='induction'?'#85c5bf':'#dbe3df';
   for(const offset of [-.15,.15])for(const dz of [-.12,.12])out+='<circle cx="'+f(e.x+offset)+'" cy="'+f(e.z+dz)+'" r=".075" stroke="'+burner+'" fill="none" stroke-width=".018"/>';
   if(e.model==='gas5')out+='<circle cx="'+f(e.x)+'" cy="'+f(e.z)+'" r=".09" stroke="'+burner+'" fill="none" stroke-width=".018"/>';
  }else if(e.subtype==='sink'){
   const double=e.model==='double',left=e.x-e.width*.36,top=e.z-e.depth*.32;
   if(double)for(const i of [0,1])out+='<rect x="'+f(left+i*e.width*.36)+'" y="'+f(top)+'" width="'+f(e.width*.34)+'" height="'+f(e.depth*.64)+'" rx=".04" fill="#4d8585" stroke="#e3f4f0" stroke-width=".022"/>';
   else{
    out+='<rect x="'+f(left)+'" y="'+f(top)+'" width="'+f(e.width*(e.model==='drainer'?.48:.72))+'" height="'+f(e.depth*.64)+'" rx=".055" fill="#4d8585" stroke="#e3f4f0" stroke-width=".03"/>';
    if(e.model==='drainer')for(const i of [0,1,2])out+='<line x1="'+f(e.x+e.width*(.19+i*.065))+'" x2="'+f(e.x+e.width*(.19+i*.065))+'" y1="'+f(top)+'" y2="'+f(top+e.depth*.64)+'" stroke="#e3f4f0" stroke-width=".018"/>';
   }
  }else if(e.subtype==='fridge'){
   if(e.model==='side')out+='<line x1="'+f(e.x)+'" x2="'+f(e.x)+'" y1="'+f(e.z-e.depth*.47)+'" y2="'+f(e.z+e.depth*.47)+'" stroke="#637a7c" stroke-width=".03"/>';
   if(e.model==='combination')out+='<line x1="'+f(e.x-e.width*.47)+'" x2="'+f(e.x+e.width*.47)+'" y1="'+f(e.z+e.depth*.1)+'" y2="'+f(e.z+e.depth*.1)+'" stroke="#637a7c" stroke-width=".03"/>';
  }
  out+='</g>';
 }
 if(!mini)for(const o of items.filter(x=>x.kind==='opening')){
  const w=walls.find(x=>x.id===o.hostId);if(!w)continue;
  const len=lengthOf(w),a=(o.hostT*len-o.width/2)/len,b=(o.hostT*len+o.width/2)/len;
  out+='<line class="opening-hit" data-item-id="'+safe(o.id)+'" x1="'+f(w.x1+(w.x2-w.x1)*a)+'" y1="'+f(w.z1+(w.z2-w.z1)*a)+
   '" x2="'+f(w.x1+(w.x2-w.x1)*b)+'" y2="'+f(w.z1+(w.z2-w.z1)*b)+'" stroke="transparent" stroke-width=".22" pointer-events="stroke"/>';
 }
 const selection=items.find(x=>x.id===selectedId);
 if(selection&&['wall','cabinet'].includes(selection.kind)&&!mini){
  for(const [side,x,z] of [['start',selection.x1,selection.z1],['end',selection.x2,selection.z2]]){
   out+='<circle data-handle="'+side+'" data-item-id="'+safe(selection.id)+'" cx="'+f(x)+'" cy="'+f(z)+
    '" r=".095" fill="#51b090" stroke="#fff" stroke-width=".028"/>';
  }
 }
 if(selection&&selection.kind==='opening'&&!mini){
  const host=walls.find(w=>w.id===selection.hostId);
  if(host){
   const len=lengthOf(host),dx=(host.x2-host.x1)/len,dz=(host.z2-host.z1)/len;
   const center=selection.hostT*len;
   for(const [side,d] of [['left',center-selection.width/2],['centre',center],['right',center+selection.width/2]]){
    out+='<circle data-open-handle="'+side+'" data-item-id="'+safe(selection.id)+'" cx="'+f(host.x1+dx*d)+'" cy="'+f(host.z1+dz*d)+
     '" r=".085" fill="'+(side==='centre'?'#d8a15b':'#51b090')+'" stroke="#fff" stroke-width=".028"/>';
   }
  }
 }
 if(gesture&&!mini)out+=renderPlanMeasurements(items,gesture.id,gesture.side);
 if(drawing&&!mini)out+=renderPreview(items,drawing,hover);
 return out+'</svg>';
}
export function planPoint(svg,event){
 const pt=svg.createSVGPoint();pt.x=event.clientX;pt.y=event.clientY;
 const matrix=svg.getScreenCTM();if(!matrix)return null;
 const local=pt.matrixTransform(matrix.inverse());
 return {x:local.x,z:local.y};
}

/* Full-footprint SVG ghost rendered before either point is committed. */
export function equipmentCorners(x,z,width,depth,rotation=0){
 const c=Math.cos(rotation),s=Math.sin(rotation);
 return [[-width/2,-depth/2],[width/2,-depth/2],[width/2,depth/2],[-width/2,depth/2]]
  .map(([u,v])=>({x:x+u*c-v*s,z:z+u*s+v*c}));
}
export function renderPreview(items,drawing,hover){
 if(!drawing||!hover)return '';
 const tool=drawing.tool,start=drawing.start;
 const wallMode=tool==='wall',openingMode=tool==='window'||tool==='door';
 if(['fridge','stove','sink'].includes(tool)){
  const spec=EQUIPMENT_SPECS[tool];let p=hover,angle=0,valid=true;
  try{placeEquipment(items,hover,tool);}catch{valid=false;}
  if(tool==='fridge'){const snap=snapFridgePoint(items,hover,spec.width,spec.depth);if(snap){p=snap;angle=snap.rotation;}}
  if(tool!=='fridge'){
   const ranked=items.filter(c=>c.kind==='cabinet'&&c.subtype==='base').map(c=>{
    const len=lengthOf(c),q=projectOnWall(c,hover.x,hover.z);
    return {c,q,dist:q.distance};
   }).sort((a,b)=>a.dist-b.dist);
   const near=ranked[0];
   if(!near||near.dist>near.c.depth/2+.2)return '<g class="live-preview"><circle cx="'+f(hover.x)+'" cy="'+f(hover.z)+'" r=".10" fill="#c35a4b"/></g>';
   p={x:near.q.x,z:near.q.z};angle=Math.atan2(near.c.z2-near.c.z1,near.c.x2-near.c.x1)+(near.c.side===-1?Math.PI:0);
  }
  return '<g class="live-preview" pointer-events="none"><polygon points="'+equipmentCorners(p.x,p.z,spec.width,spec.depth,angle).map(q=>f(q.x)+','+f(q.z)).join(' ')+
   '" fill="'+(valid?'#8cd2c8':'#d9a09c')+'" fill-opacity=".64" stroke="'+(valid?'#d0873a':'#bd413d')+'" stroke-width=".04" stroke-dasharray=".06,.04"/></g>';
 }
 if((tool==='base'||tool==='upper')&&start){
  const target=snapCabinetPoint(items,hover.x,hover.z,.8);
  const route=target?cabinetPath(items,start,target):null;
  if(!route)return '<g class="live-preview"><circle cx="'+f(hover.x)+'" cy="'+f(hover.z)+'" r=".12" fill="#b85b4e"/></g>';
  let drawings='',marker=target;
  for(let i=0;i<route.segments.length;i++){
   const seg=route.segments[i],w=items.find(o=>o.id===seg.wallId);
   if(!w)continue;
   const len=lengthOf(w),dir=Math.sign(seg.endT-seg.startT);if(!dir)continue;
   let a=seg.startT+(i>0?dir*cabinetTurnTrim(items.find(o=>o.id===route.segments[i-1].wallId),w)/len:0),
    b=seg.endT-(i<route.segments.length-1?dir*cabinetTurnTrim(w,items.find(o=>o.id===route.segments[i+1].wallId))/len:0);
   let stopped=false;
   if(tool==='upper')try{const old=b;b=limitCabinetEnd(items,w,a,b,{kind:'upper'});stopped=Math.abs(old-b)>.0001;}catch{b=a;stopped=true;}
   if(Math.abs(b-a)*len<.03){if(stopped)break;continue;}
   const c={startT:Math.min(a,b),endT:Math.max(a,b),depth:tool==='upper'?.35:.6,side:seg.side};
   const fp=cabinetFootprint(c,w);
   drawings+='<polygon points="'+fp.corners.map(p=>f(p.x)+','+f(p.z)).join(' ')+
    '" fill="'+(tool==='upper'?'#f1dcb2':'#88c4a8')+
    '" fill-opacity=".64" stroke="#d0873a" stroke-width=".035" stroke-dasharray=".08,.04"/>';
   if(stopped){marker={x:w.x1+(w.x2-w.x1)*b,z:w.z1+(w.z2-w.z1)*b};break;}
  }
  return drawings?'<g class="live-preview" pointer-events="none">'+drawings+
   '<circle cx="'+f(marker.x)+'" cy="'+f(marker.z)+'" r=".075" fill="#f0ac50" stroke="white" stroke-width=".02"/></g>':'';
 }
 const width=wallMode?.12:openingMode?.12:tool==='upper'?.35:.60;
 let corners=null;
 const rect=(a,b,depth,offset=0)=>{
  const len=Math.hypot(b.x-a.x,b.z-a.z);if(len<.0001)return null;
  const nx=-(b.z-a.z)/len,nz=(b.x-a.x)/len;
  return [a,b].map(p=>({x:p.x+nx*(offset-depth/2),z:p.z+nz*(offset-depth/2)}))
   .concat([b,a].map(p=>({x:p.x+nx*(offset+depth/2),z:p.z+nz*(offset+depth/2)})));
 };
 if(wallMode){
  const a=start||{x:hover.x-.55,z:hover.z},b=start?hover:{x:hover.x+.55,z:hover.z};
  corners=rect(a,b,width);
 }else{
  const host=start?.hostId?items.find(x=>x.id===start.hostId):nearestWall(items,hover.x,hover.z,.6)?.wall;
  if(host){
   const len=lengthOf(host);
   if(openingMode){
    const p=projectOnWall(host,hover.x,hover.z),centre=p.t*len,half=tool==='door'?.45:.6;
    const ux=(host.x2-host.x1)/len,uz=(host.z2-host.z1)/len;
    corners=rect({x:host.x1+ux*Math.max(.1,centre-half),z:host.z1+uz*Math.max(.1,centre-half)},
     {x:host.x1+ux*Math.min(len-.1,centre+half),z:host.z1+uz*Math.min(len-.1,centre+half)},width);
   }else{
    const a=start?projectOnWall(host,start.x,start.z).t:Math.max(0,projectOnWall(host,hover.x,hover.z).t-1/len);
    let b=start?projectOnWall(host,hover.x,hover.z).t:Math.min(1,a+1/len);
    if(tool==='upper')try{b=limitCabinetEnd(items,host,a,b,{kind:'upper'});}catch{b=a;}
    if(Math.abs(b-a)*len>.02){
     const cabinet={startT:Math.min(a,b),endT:Math.max(a,b),depth:width,side:start?.side||1};
     corners=cabinetFootprint(cabinet,host).corners;
    }
   }
  }
 }
 if(!corners)return '<g class="live-preview"><circle cx="'+f(hover.x)+'" cy="'+f(hover.z)+'" r=".09" fill="#a14b44" opacity=".65"/></g>';
 return '<g class="live-preview" pointer-events="none"><polygon points="'+corners.map(p=>f(p.x)+','+f(p.z)).join(' ')+
  '" fill="'+(tool==='upper'?'#f1dcb2':'#88c4a8')+'" fill-opacity=".6" stroke="#d0873a" stroke-width=".035" stroke-dasharray=".08,.04"/>'+
  '<circle cx="'+f(hover.x)+'" cy="'+f(hover.z)+'" r=".07" fill="#f0ac50" stroke="white" stroke-width=".02"/></g>';
}
