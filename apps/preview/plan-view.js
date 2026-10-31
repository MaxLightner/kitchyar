import {lengthOf} from './geometry.js';
const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const f=n=>Number(n).toFixed(4);
export function renderPlan(items,{mini=false,selectedId=null,drawing=null,hover=null}={}){
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
  out+='<line data-item-id="'+safe(c.id)+'" x1="'+f(c.x1)+'" y1="'+f(c.z1)+'" x2="'+f(c.x2)+'" y2="'+f(c.z2)+
   '" stroke="'+(c.id===selectedId?'#2c9478':c.subtype==='upper'?'#b7aaa1':'#9a826c')+
   '" stroke-width="'+f(c.depth)+'" opacity="'+(c.subtype==='upper'?'.55':'.92')+'"/>';
 }
 const selection=items.find(x=>x.id===selectedId);
 if(selection&&selection.kind==='wall'&&!mini){
  for(const [side,x,z] of [['start',selection.x1,selection.z1],['end',selection.x2,selection.z2]]){
   out+='<circle data-handle="'+side+'" data-item-id="'+safe(selection.id)+'" cx="'+f(x)+'" cy="'+f(z)+
    '" r=".095" fill="#51b090" stroke="#fff" stroke-width=".028"/>';
  }
 }
 if(drawing&&!mini){
  out+='<circle cx="'+f(drawing.x)+'" cy="'+f(drawing.z)+'" r=".085" fill="#dc9d58" stroke="white" stroke-width=".035" pointer-events="none"/>';
  if(hover){
   out+='<line x1="'+f(drawing.x)+'" y1="'+f(drawing.z)+'" x2="'+f(hover.x)+'" y2="'+f(hover.z)+
    '" stroke="#d89954" stroke-width=".05" stroke-dasharray=".13,.08" pointer-events="none"/>';
  }
 }
 if(hover&&!mini)out+='<circle cx="'+f(hover.x)+'" cy="'+f(hover.z)+'" r=".05" fill="#edb568" pointer-events="none"/>';
 return out+'</svg>';
}
export function planPoint(svg,event){
 const pt=svg.createSVGPoint();pt.x=event.clientX;pt.y=event.clientY;
 const matrix=svg.getScreenCTM();if(!matrix)return null;
 const local=pt.matrixTransform(matrix.inverse());
 return {x:local.x,z:local.y};
}
