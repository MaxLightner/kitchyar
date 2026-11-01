// Parametric cabinet carcasses: flat panels only, no booleans, CSG or solid filler.
// Dimensions are metres. Local X follows the cabinet run, local Z its depth.
export const CARCASS_THICKNESS=.018;
export const CARCASS_BACK_THICKNESS=.008;

const near=(a,b,epsilon=.012)=>Math.abs(a-b)<epsilon;
const panel=(part,x,y,z,width,height,depth)=>({part,x,y,z,width,height,depth});

export function cabinetCarcassPanels(c,fronts=[],equipment=[],voids=[]){
 const len=Math.hypot(c.x2-c.x1,c.z2-c.z1),height=Number(c.height),depth=Number(c.depth);
 if(len<.20||height<.10||depth<.10)return [];
 const t=Math.min(CARCASS_THICKNESS,len/12,height/10,depth/10),backT=Math.min(CARCASS_BACK_THICKNESS,depth/20);
 const y0=c.elevation??.1,side=c.side||1,innerWidth=len-2*t;
 const parts=[
  panel('left-side',-len/2+t/2,y0+height/2,0,t,height,depth),
  panel('right-side',len/2-t/2,y0+height/2,0,t,height,depth)
 ];
 const applianceBays=equipment.filter(e=>e.hostId===c.id&&['washer','dishwasher','oven','microwave'].includes(e.subtype))
  .map(e=>({start:Math.max(-len/2,((e.offsetT??.5)-.5)*len-e.width/2-.012),
   end:Math.min(len/2,((e.offsetT??.5)-.5)*len+e.width/2+.012),
   floorless:['washer','dishwasher'].includes(e.subtype)||(e.elevation??y0)<=y0+.04}));

 // Bottom boards avoid floor-standing appliances; everything else stays open.
 let bottomRuns=[{start:-len/2+t,end:len/2-t}];
 for(const bay of applianceBays.filter(b=>b.floorless))bottomRuns=bottomRuns.flatMap(run=>
  bay.start>=run.end||bay.end<=run.start?[run]:[
   {start:run.start,end:Math.min(run.end,bay.start)},
   {start:Math.max(run.start,bay.end),end:run.end}
  ].filter(part=>part.end-part.start>.035));
 if(c.subtype==='bridge'){
  for(const fraction of [.01,.32,.65,.98])parts.push(panel('open-shelf',0,y0+Math.min(height-t/2,Math.max(t/2,height*fraction)),0,innerWidth,t,depth));
  return parts;
 }
 for(const run of bottomRuns)parts.push(panel('bottom',(run.start+run.end)/2,y0+t/2,side*backT/2,
  run.end-run.start,t,depth-backT));
 parts.push(panel('back',0,y0+height/2,-side*(depth/2-backT/2),innerWidth,height,backT));
 if(c.subtype!=='base')parts.push(panel('top',0,y0+height-t/2,side*backT/2,innerWidth,t,depth-backT));

 // A pair of doors belongs to one bay. Drawers within one bay share a unit.
 // An appliance without a door still gets its own bay between two partitions.
 const groups=new Map();
 for(const f of fronts.filter(f=>f.hostId===c.id)){
  const key=Number.isInteger(f.bay)?f.bay:f.id;
  const current=groups.get(key)||{start:1,end:0};
  current.start=Math.min(current.start,f.startT);current.end=Math.max(current.end,f.endT);
  groups.set(key,current);
 }
 const edges=[];
 if(groups.size){
  for(const {start,end} of groups.values())edges.push((start-.5)*len,(end-.5)*len);
 } // No internal bays until doors/drawers exist; appliance clearances remain.
 for(const b of applianceBays)edges.push(b.start,b.end);
 const boundaries=edges.filter(x=>x>-len/2+.12&&x<len/2-.12).sort((a,b)=>a-b);
 let previous=-len/2;
 for(const x of boundaries){
  if(near(x,previous,.08))continue;
  parts.push(panel('divider',x,y0+height/2,side*backT/2,t,height-2*t,depth-backT));
  previous=x;
 }
 if(c.frontOrientation==='side'){
  const right=parts.findIndex(p=>p.part==='right-side');if(right>=0)parts.splice(right,1);
  parts.push(panel('closed-front',0,y0+height/2,side*(depth/2-t/2),innerWidth,height,t));
 }
 return parts.flatMap(p=>{
  let spans=[{start:p.x-p.width/2,end:p.x+p.width/2}];
  for(const v of voids)spans=spans.flatMap(s=>v.start>=s.end||v.end<=s.start?[s]:[{start:s.start,end:Math.min(s.end,v.start)},{start:Math.max(s.start,v.end),end:s.end}].filter(s=>s.end-s.start>.005));
  return spans.map(s=>({...p,x:(s.start+s.end)/2,width:s.end-s.start}));
 });
}

// One indexed BufferGeometry for an entire carcass: 24 vertices and 12 triangles
// per closed rectangular board, with outward-facing flat normals.
export function buildCarcassPanelGeometry(panels){
 const positions=[],normals=[],uvs=[],indices=[];
 const addFace=(corners,normal)=>{
  const base=positions.length/3;
  for(let i=0;i<4;i++){
   positions.push(...corners[i]);normals.push(...normal);
   uvs.push(i===1||i===2?1:0,i>=2?1:0);
  }
  indices.push(base,base+1,base+2,base,base+2,base+3);
 };
 for(const p of panels){
  if(p.width<=0||p.height<=0||p.depth<=0)continue;
  const a=p.x-p.width/2,b=p.x+p.width/2,l=p.y-p.height/2,h=p.y+p.height/2,
   n=p.z-p.depth/2,f=p.z+p.depth/2;
  addFace([[a,l,f],[b,l,f],[b,h,f],[a,h,f]],[0,0,1]);
  addFace([[b,l,n],[a,l,n],[a,h,n],[b,h,n]],[0,0,-1]);
  addFace([[b,l,f],[b,l,n],[b,h,n],[b,h,f]],[1,0,0]);
  addFace([[a,l,n],[a,l,f],[a,h,f],[a,h,n]],[-1,0,0]);
  addFace([[a,h,f],[b,h,f],[b,h,n],[a,h,n]],[0,1,0]);
  addFace([[a,l,n],[b,l,n],[b,l,f],[a,l,f]],[0,-1,0]);
 }
 return {positions,normals,uvs,indices,triangles:indices.length/3};
}
