import {lengthOf,nearestWall,projectOnWall,cabinetFootprint,limitCabinetEnd,EQUIPMENT_SPECS,equipmentPosition,snapCabinetPoint,cabinetPath,cabinetTurnTrim,snapFridgePoint,placeEquipment} from './geometry.js?v=render17';
import {renderPlanMeasurements} from './edit-handles.js?v=render17';
const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const f=n=>Number(n).toFixed(4);
export function renderPlan(items,{mini=false,selectedId=null,drawing=null,hover=null,gesture=null,calibration=null}={}){
 const walls=items.filter(x=>x.kind==='wall'),cabinets=items.filter(x=>x.kind==='cabinet');
 const gridId=mini?'mini-grid-k':'main-grid-k';
 const cal=calibration?.a&&calibration?.b?calibration:{a:{x:-.5,z:.65},b:{x:.5,z:.65}};
 const rect=typeof document!=='undefined'?document.getElementById('plan-host')?.getBoundingClientRect():null;
 const pixelsPerMetre=rect?Math.max(20,Math.min(rect.width/10,rect.height/8)):100;
 const touchRadius=Math.max(.24,29/pixelsPerMetre),visibleRadius=Math.max(.105,12/pixelsPerMetre);
 const angle=Math.atan2(cal.b.z-cal.a.z,cal.b.x-cal.a.x)*180/Math.PI;
 const rotation='translate('+f(cal.a.x)+' '+f(cal.a.z)+') rotate('+f(angle)+') translate('+f(-cal.a.x)+' '+f(-cal.a.z)+')';
 let out='<svg '+(mini?'class="mini-svg"':'id="plan-view" class="plan-svg"')+
  ' xmlns="http://www.w3.org/2000/svg" viewBox="-5 -4 10 8" preserveAspectRatio="xMidYMid meet" role="img" aria-label="پلان متریک پروژه">'+
  '<defs><pattern id="'+gridId+'" width=".1" height=".1" patternUnits="userSpaceOnUse" patternTransform="'+rotation+'"><path d="M.1 0H0V.1" fill="none" stroke="#a4bbaa" stroke-width=".006"/></pattern></defs>'+
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
  out+='<g data-item-id="'+safe(e.id)+'" opacity=".96"><polygon points="'+corners.map(p=>f(p.x)+','+f(p.z)).join(' ')+
   '" fill="'+(e.subtype==='fridge'?'#cbd2d3':e.subtype==='stove'?'#424a4a':'#bdc9ca')+
   '" stroke="'+(e.id===selectedId?'#329e7f':'#5c7373')+'" stroke-width=".028"/>'+
   '<g transform="translate('+f(e.x)+' '+f(e.z)+') rotate('+f((e.rotation||0)*180/Math.PI)+')">';
  if(e.subtype==='stove'){
   const induction=e.induction||e.model==='induction',count=e.model==='gas2'?2:e.model==='gas3'?3:e.model==='gas5'?5:4;
   const x=e.width*.255,z=e.depth*.225,ring=induction?'#85c5bf':'#dbe3df';
   const burners=count===2?[[-x,0],[x,0]]:count===3?[[-x,-z],[x,-z],[0,z]]:
    count===5?[[-x,-z],[-x,z],[x,-z],[x,z],[0,0]]:[[-x,-z],[-x,z],[x,-z],[x,z]];
   for(const [bx,bz] of burners)out+='<circle cx="'+f(bx)+'" cy="'+f(bz)+'" r="'+f(bx===0&&bz===0?.074:.056)+'" stroke="'+ring+'" fill="none" stroke-width=".016"/>';
  }else if(e.subtype==='sink'){
   const double=e.model==='double',drainer=e.model==='drainer';
   const bowlWidth=double?Math.min(.44,(e.width-.17)/2):Math.min(.48,e.width-(drainer?.20:.13));
   const xs=double?[-(bowlWidth+.03)/2,(bowlWidth+.03)/2]:[drainer?-e.width*.15:0];
   for(const x of xs){
    out+='<rect x="'+f(x-bowlWidth/2)+'" y="'+f(-e.depth*.30)+'" width="'+f(bowlWidth)+'" height="'+f(e.depth*.60)+'" rx=".065" fill="#4d8585" stroke="#e9f5f2" stroke-width=".029"/>'+
     '<rect x="'+f(x-bowlWidth*.43)+'" y="'+f(-e.depth*.255)+'" width="'+f(bowlWidth*.86)+'" height="'+f(e.depth*.51)+'" rx=".050" fill="#668f91" stroke="#a4bdbe" stroke-width=".012"/>'+
     '<circle cx="'+f(x)+'" cy="0" r=".026" fill="#3b5a5d" stroke="#b9d4d3" stroke-width=".012"/>';
   }
   if(drainer)for(let i=0;i<4;i++)out+='<line x1="'+f(e.width*(.15+i*.05))+'" x2="'+f(e.width*(.15+i*.05))+'" y1="'+f(-e.depth*.27)+'" y2="'+f(e.depth*.27)+'" stroke="#e3f4f0" stroke-width=".018"/>';
  }else if(e.subtype==='fridge'){
   if(e.builtIn){
    for(const x of [-(e.width/2+.04),e.width/2+.04])
     out+='<rect x="'+f(x-.015)+'" y="'+f(-e.depth/2-.05)+'" width=".03" height="'+f(e.depth+.10)+'" fill="#d7b99a" stroke="#8a795f" stroke-width=".014"/>';
   }
   if(e.model==='side')out+='<line x1="0" x2="0" y1="'+f(-e.depth*.47)+'" y2="'+f(e.depth*.47)+'" stroke="#637a7c" stroke-width=".03"/>';
   if(e.model==='combination')out+='<line x1="'+f(-e.width*.47)+'" x2="'+f(e.width*.47)+'" y1="'+f(e.depth*.10)+'" y2="'+f(e.depth*.10)+'" stroke="#637a7c" stroke-width=".03"/>';
  }
  out+='</g></g>';
 }
 if(!mini)for(const o of items.filter(x=>x.kind==='opening')){
  const w=walls.find(x=>x.id===o.hostId);if(!w)continue;
  const len=lengthOf(w),a=(o.hostT*len-o.width/2)/len,b=(o.hostT*len+o.width/2)/len;
  out+='<line class="opening-hit" data-item-id="'+safe(o.id)+'" x1="'+f(w.x1+(w.x2-w.x1)*a)+'" y1="'+f(w.z1+(w.z2-w.z1)*a)+
   '" x2="'+f(w.x1+(w.x2-w.x1)*b)+'" y2="'+f(w.z1+(w.z2-w.z1)*b)+'" stroke="transparent" stroke-width=".22" pointer-events="stroke"/>';
 }
 if(!mini&&!drawing){
   out+='<g class="ab-calibration" aria-label="جهت شبکه A و B">'+
    '<line x1="'+f(cal.a.x)+'" y1="'+f(cal.a.z)+'" x2="'+f(cal.b.x)+'" y2="'+f(cal.b.z)+'" stroke="#d39d54" stroke-width=".027" stroke-dasharray=".075,.035" pointer-events="none"/>';
   for(const which of ['a','b']){const p=cal[which],color=which==='a'?'#e4a75d':'#4cafa3';
    out+='<g data-calibration="'+which+'" class="ab-touch"><circle cx="'+f(p.x)+'" cy="'+f(p.z)+'" r="'+f(touchRadius)+'" fill="transparent"/>'+
     '<circle cx="'+f(p.x)+'" cy="'+f(p.z)+'" r="'+f(visibleRadius)+'" fill="'+color+'" stroke="#fff" stroke-width=".025" pointer-events="none"/>'+
     '<g transform="translate('+f(p.x)+' '+f(p.z)+') scale(.010)" pointer-events="none">'+
     '<text x="0" y="5" font-size="15px" font-weight="bold" text-anchor="middle" fill="#243c34">'+which.toUpperCase()+'</text></g></g>';
   }
   out+='</g>';
  }
 const selection=items.find(x=>x.id===selectedId);
 if(selection&&['wall','cabinet'].includes(selection.kind)&&!mini){
  for(const [side,x,z] of [['start',selection.x1,selection.z1],['end',selection.x2,selection.z2]]){
   out+='<g class="resize-handle" data-handle="'+side+'" data-item-id="'+safe(selection.id)+'">'+
     '<circle cx="'+f(x)+'" cy="'+f(z)+'" r="'+f(touchRadius)+'" fill="transparent"/>'+
     '<circle cx="'+f(x)+'" cy="'+f(z)+'" r="'+f(visibleRadius)+'" fill="#51b090" stroke="#fff" stroke-width=".028" pointer-events="none"/></g>';
  }
 }
 if(selection&&selection.kind==='opening'&&!mini){
  const host=walls.find(w=>w.id===selection.hostId);
  if(host){
   const len=lengthOf(host),dx=(host.x2-host.x1)/len,dz=(host.z2-host.z1)/len;
   const center=selection.hostT*len;
   for(const [side,d] of [['left',center-selection.width/2],['centre',center],['right',center+selection.width/2]]){
    const cx=f(host.x1+dx*d),cz=f(host.z1+dz*d);
     out+='<g class="resize-handle" data-open-handle="'+side+'" data-item-id="'+safe(selection.id)+'">'+
      '<circle cx="'+cx+'" cy="'+cz+'" r="'+f(touchRadius)+'" fill="transparent"/>'+
      '<circle cx="'+cx+'" cy="'+cz+'" r="'+f(visibleRadius)+'" fill="'+(side==='centre'?'#d8a15b':'#51b090')+'" stroke="#fff" stroke-width=".028" pointer-events="none"/></g>';
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
  let installed=null;
  try{const result=placeEquipment(items,hover,tool);installed=result.items.at(-1);}catch{valid=false;}
  if(tool==='fridge'){const snap=installed||snapFridgePoint(items,hover,spec.width,spec.depth);if(snap){p=snap;angle=snap.rotation;}}
  if(tool!=='fridge'){
   const ranked=items.filter(c=>c.kind==='cabinet'&&c.subtype==='base').map(c=>{
    const len=lengthOf(c),q=projectOnWall(c,hover.x,hover.z);
    return {c,q,dist:q.distance};
   }).sort((a,b)=>a.dist-b.dist);
   const near=ranked[0];
   if(!near||near.dist>near.c.depth/2+.2)return '<g class="live-preview"><circle cx="'+f(hover.x)+'" cy="'+f(hover.z)+'" r="'+f(visibleRadius)+'" fill="#c35a4b"/></g>';
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
   if(tool==='upper')try{const old=b;b=limitCabinetEnd(items,w,a,b,{kind:'upper',height:drawing?.height??.72,elevation:drawing?.elevation??1.55});stopped=Math.abs(old-b)>.0001;}catch{b=a;stopped=true;}
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
    if(tool==='upper')try{b=limitCabinetEnd(items,host,a,b,{kind:'upper',height:drawing?.height??.72,elevation:drawing?.elevation??1.55});}catch{b=a;}
    if(Math.abs(b-a)*len>.02){
     const cabinet={startT:Math.min(a,b),endT:Math.max(a,b),depth:width,side:start?.side||1};
     corners=cabinetFootprint(cabinet,host).corners;
    }
   }
  }
 }
 if(!corners)return '<g class="live-preview"><circle cx="'+f(hover.x)+'" cy="'+f(hover.z)+'" r="'+f(visibleRadius)+'" fill="#a14b44" opacity=".65"/></g>';
 return '<g class="live-preview" pointer-events="none"><polygon points="'+corners.map(p=>f(p.x)+','+f(p.z)).join(' ')+
  '" fill="'+(tool==='upper'?'#f1dcb2':'#88c4a8')+'" fill-opacity=".6" stroke="#d0873a" stroke-width=".035" stroke-dasharray=".08,.04"/>'+
  '<circle cx="'+f(hover.x)+'" cy="'+f(hover.z)+'" r=".07" fill="#f0ac50" stroke="white" stroke-width=".02"/></g>';
}
