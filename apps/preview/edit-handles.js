import {lengthOf,projectOnWall,editOpening,editCabinet,moveCabinetEndpoint,moveEndpoint,editFront} from './geometry.js?v=render25';

export const snapCm=value=>Math.round(Number(value)*100)/100;
const n=value=>Number(value).toFixed(2);
const esc=value=>String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[ch]));
const byId=(items,id)=>items.find(o=>o.id===id);
const openingEdges=(o,wall)=>{const c=o.hostT*lengthOf(wall);return {left:c-o.width/2,right:c+o.width/2};};
export function neighborGaps(items,opening){
 const wall=byId(items,opening.hostId);if(!wall)return null;
 const len=lengthOf(wall),{left,right}=openingEdges(opening,wall);
 let before={at:0,label:'کنج دیوار'},after={at:len,label:'کنج دیوار'};
 for(const other of items){
  if(other.id===opening.id||other.hostId!==wall.id)continue;
  let a,b,label;
  if(other.kind==='opening'){const edges=openingEdges(other,wall);a=edges.left;b=edges.right;label=other.style==='door'?'در':'پنجره';}
  else if(other.kind==='cabinet'){a=other.startT*len;b=other.endT*len;label=other.subtype==='upper'?'کابینت هوایی':'کابینت زمینی';}
  else continue;
  if(b<=left+.001&&b>before.at){before={at:b,label};}
  if(a>=right-.001&&a<after.at){after={at:a,label};}
 }
 return {wall,left,right,before:{...before,gap:snapCm(Math.max(0,left-before.at))},after:{...after,gap:snapCm(Math.max(0,after.at-right))}};
}
export function resizeFromHandle(items,id,side,position){
 const object=byId(items,id);if(!object)throw Error('آبجکت انتخاب‌شده پیدا نشد.');
 if(object.kind==='opening'){
  const w=byId(items,object.hostId);if(!w)throw Error('دیوار میزبان پیدا نشد.');
  const len=lengthOf(w),old=openingEdges(object,w),bottom=object.sill,top=object.sill+object.height;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  let left=old.left,right=old.right,sill=bottom,height=object.height;
  if(side==='left')left=clamp(snapCm(position.along),.10,right-.30);
  if(side==='right')right=clamp(snapCm(position.along),left+.30,len-.10);
  if(side==='centre'){const width=right-left,mid=clamp(snapCm(position.along),width/2+.1,len-width/2-.1);left=mid-width/2;right=mid+width/2;}
  if(side==='top')height=Math.max(.30,snapCm(position.y)-sill);
  if(side==='bottom'){
   if(object.style==='door')throw Error('پایین در باید روی کف ثابت بماند.');
   sill=clamp(snapCm(position.y),0,top-.30);height=snapCm(top-sill);
  }
  const result=editOpening(items,id,{width:snapCm(right-left),height:snapCm(height),sill:snapCm(sill),metresFromStart:(left+right)/2});
  return result;
 }
 if(object.kind==='front'){
  const host=byId(items,object.hostId);
  if(!host)throw Error('کابینت میزبان پیدا نشد.');
  if(side==='right')return editFront(items,id,{width:snapCm(position.along-object.startT*lengthOf(host))});
  if(side==='top')return editFront(items,id,{height:snapCm(position.y-(host.elevation+object.bottomT*host.height))});
  throw Error('دستگیره نمای کابینت معتبر نیست.');
 }
 if(object.kind==='cabinet'){
  const host=byId(items,object.hostId);if(!host)throw Error('دیوار میزبان پیدا نشد.');
  if(side==='top')return editCabinet(items,id,{height:Math.max(.25,snapCm(position.y-object.elevation))});
   if(side==='bottom'){
    const top=object.elevation+object.height;
    const elevation=Math.max(0,Math.min(top-.25,snapCm(position.y)));
    return editCabinet(items,id,{elevation,height:snapCm(top-elevation)});
   }
   if(!['start','end'].includes(side))throw Error('دستگیره کابینت معتبر نیست.');
  const len=lengthOf(host),old=side==='start'?object.endT*len:object.startT*len;
  let along=snapCm(position.along);
  along=side==='start'?Math.max(0,Math.min(old-.45,along)):Math.min(len,Math.max(old+.45,along));
  return moveCabinetEndpoint(items,id,side==='start',
   host.x1+(host.x2-host.x1)*along/len,host.z1+(host.z2-host.z1)*along/len);
 }
 if(object.kind==='wall'){
  if(!['start','end'].includes(side))throw Error('دستگیره دیوار معتبر نیست.');
  return moveEndpoint(items,id,side==='start',snapCm(position.x),snapCm(position.z));
 }
 throw Error('این آبجکت دستگیرهٔ تغییر اندازه ندارد.');
}
export function handlePosition(items,id,side){
 const o=byId(items,id);if(!o)return null;
 if(o.kind==='opening'){
  const w=byId(items,o.hostId),e=w?openingEdges(o,w):null;if(!e)return null;
  if(side==='left')return {along:e.left,y:o.sill+o.height/2};
  if(side==='right')return {along:e.right,y:o.sill+o.height/2};
  if(side==='centre')return {along:(e.left+e.right)/2,y:o.sill+o.height/2};
  if(side==='top')return {along:(e.left+e.right)/2,y:o.sill+o.height};
  if(side==='bottom')return {along:(e.left+e.right)/2,y:o.sill};
 }
 if(o.kind==='front'){
  const host=byId(items,o.hostId);if(!host)return null;
  const len=lengthOf(host);
  return {along:len*(side==='right'?o.endT:(o.startT+o.endT)/2),
   y:(host.elevation??.08)+host.height*(side==='top'?o.topT:(o.bottomT+o.topT)/2)};
 }
 if(o.kind==='cabinet'){
  const w=byId(items,o.hostId);if(!w)return null;
  const len=lengthOf(w),along=(side==='start'?o.startT:side==='end'?o.endT:(o.startT+o.endT)/2)*len;
   return {along,y:side==='top'?o.elevation+o.height:side==='bottom'?o.elevation:o.elevation+o.height/2};
 }
 if(o.kind==='wall')return {x:side==='start'?o.x1:o.x2,z:side==='start'?o.z1:o.z2};
 return null;
}
export function renderElevation(items,opening,drag=null){
 if(!opening||opening.kind!=='opening')return '';
 const wall=byId(items,opening.hostId);if(!wall)return '';
 const scale=drag?.anchorScale||Math.min(76,160/Math.max(wall.height,1.5),220/Math.max(opening.width+.6,1.4));
 const ground=201,cx=160,mid=drag?.anchorCentre??opening.hostT*lengthOf(wall);
 const sx=along=>cx+(along-mid)*scale,sy=y=>ground-y*scale;
 const left=sx(mid-opening.width/2),right=sx(mid+opening.width/2);
 const top=sy(opening.sill+opening.height),bottom=sy(opening.sill);
 const marker=(side,x,y,color,label)=>
  '<g class="elevation-handle" data-open-handle="'+side+'" data-item-id="'+esc(opening.id)+'">'+
  '<circle cx="'+n(x)+'" cy="'+n(y)+'" r="13" fill="transparent"/>'+
  '<circle cx="'+n(x)+'" cy="'+n(y)+'" r="8" fill="'+color+'" stroke="#fff" stroke-width="2"/>'+
  '<title>'+label+'</title></g>';
 let s='<div class="elevation-title"><strong>نمای روبروی '+(opening.style==='door'?'در':'پنجره')+'</strong><span>دستگیره‌ها را بکش · اسنپ ۱ سانتی‌متر</span></div>'+
  '<svg id="elevation-view" data-ppm="'+n(scale)+'" viewBox="0 0 320 225" role="img" aria-label="نمای روبروی دیوار و دستگیره‌های تغییر ابعاد">'+
  '<rect x="8" y="'+n(sy(wall.height))+'" width="304" height="'+n(ground-sy(wall.height))+'" fill="#dce5df" stroke="#a8b7ad" />'+
  '<line x1="8" y1="'+ground+'" x2="312" y2="'+ground+'" stroke="#416854" stroke-width="2"/>'+
  '<rect x="'+n(left)+'" y="'+n(top)+'" width="'+n(right-left)+'" height="'+n(bottom-top)+'" fill="#b8e2df" stroke="#298e81" stroke-width="2.5"/>'+
  '<line x1="'+n(left)+'" y1="'+n(bottom)+'" x2="'+n(right)+'" y2="'+n(bottom)+'" stroke="#236e66" stroke-width="3"/>'+
  marker('left',left,(top+bottom)/2,'#61bc9b','عرض از سمت چپ')+
  marker('right',right,(top+bottom)/2,'#61bc9b','عرض از سمت راست')+
  marker('top',cx,top,'#e9ad63','ارتفاع بازشو')+
  (opening.style==='door'?'':marker('bottom',cx,bottom,'#e9ad63','ارتفاع لبه زیر پنجره از کف'))+
  '<text x="160" y="217" text-anchor="middle" class="elevation-scale">تراز کف</text>';
 if(drag&&drag.id===opening.id){
  s+='<line x1="'+n(left-22)+'" y1="'+n(ground)+'" x2="'+n(left-22)+'" y2="'+n(bottom)+'" class="measure-line"/>'+
    '<text x="'+n(left-27)+'" y="'+n((ground+bottom)/2)+'" text-anchor="end" class="measure-text">'+n(opening.sill)+' m</text>'+
    '<line x1="'+n(right+22)+'" y1="'+n(top)+'" x2="'+n(right+22)+'" y2="'+n(bottom)+'" class="measure-line"/>'+
    '<text x="'+n(right+27)+'" y="'+n((top+bottom)/2)+'" class="measure-text">'+n(opening.height)+' m</text>'+
    '<text x="160" y="'+n(Math.max(18,top-14))+'" text-anchor="middle" class="measure-text">'+n(opening.width)+' m</text>';
 }
 const summary=drag?neighborGaps(items,opening):null;
 return s+'</svg>'+(summary?'<div class="live-gap-summary"><span>چپ تا '+esc(summary.before.label)+': '+n(summary.before.gap)+' متر</span><span>راست تا '+esc(summary.after.label)+': '+n(summary.after.gap)+' متر</span></div>':'');
}
export function renderPlanMeasurements(items,id,side){
 const o=byId(items,id);if(!o)return '';
 const w=o.kind==='wall'?o:byId(items,o.hostId);if(!w)return '';
 const len=lengthOf(w),ux=(w.x2-w.x1)/len,uz=(w.z2-w.z1)/len,nx=-uz,nz=ux;
 const pos=(t,offset)=>({x:w.x1+ux*t+nx*offset,z:w.z1+uz*t+nz*offset});
 const line=(a,b)=>'<line x1="'+n(a.x)+'" y1="'+n(a.z)+'" x2="'+n(b.x)+'" y2="'+n(b.z)+'" class="measure-line"/>';
 const label=(a,text)=>'<g class="measure-tag"><rect x="'+n(a.x-.33)+'" y="'+n(a.z-.115)+'" width=".66" height=".23" rx=".08"/>'+
   '<g transform="translate('+n(a.x)+' '+n(a.z)+') scale(0.0095)"><text x="0" y="5" text-anchor="middle">'+esc(text)+'</text></g></g>';
 let out='<g class="live-measurements" pointer-events="none">';
 if(o.kind==='opening'){
  const gaps=neighborGaps(items,o),a=gaps.left,b=gaps.right;
  const measure=(l,r,offset,title)=>{
   if(r-l<.015)return '';
   const p=pos(l,offset),q=pos(r,offset);
   return line(p,q)+line(pos(l,offset-.065),pos(l,offset+.065))+line(pos(r,offset-.065),pos(r,offset+.065))+
    label(pos((l+r)/2,offset-.14),title);
  };
  out+=measure(a,b,-.32,'عرض '+n(o.width)+'m');
  out+=measure(gaps.before.at,a,-.72,'فاصله '+n(gaps.before.gap)+'m');
  out+=measure(b,gaps.after.at,-1.07,'فاصله '+n(gaps.after.gap)+'m');
  out+=label(pos((a+b)/2,.55),'کف '+n(o.sill)+'m · ارتفاع '+n(o.height)+'m');
 }else if(o.kind==='cabinet'){
  out+=line({x:o.x1,z:o.z1},{x:o.x2,z:o.z2});
  out+=label(pos((o.startT+o.endT)*len/2,-.39),'طول '+n((o.endT-o.startT)*len)+'m');
 }else if(o.kind==='wall'){
  out+=line({x:o.x1,z:o.z1},{x:o.x2,z:o.z2});
  out+=label(pos(len/2,-.4),'طول '+n(len)+'m');
 }
 return out+'</g>';
}

/* Same editable front elevation as windows, with cabinet top and floor-offset grips. */
export function renderCabinetElevation(items,cabinet,drag=null){
 if(!cabinet||cabinet.kind!=='cabinet')return '';
 const host=byId(items,cabinet.hostId);if(!host)return '';
 const scale=Math.min(72,160/Math.max(host.height,2.2)),ground=201;
 const sy=y=>ground-y*scale,top=sy(cabinet.elevation+cabinet.height),bottom=sy(cabinet.elevation);
 const marker=(side,y,color,label)=>'<g class="elevation-handle" data-open-handle="'+side+'" data-item-id="'+esc(cabinet.id)+'">'+
  '<circle cx="160" cy="'+n(y)+'" r="15" fill="transparent"/>'+
  '<circle cx="160" cy="'+n(y)+'" r="9" fill="'+color+'" stroke="#fff" stroke-width="2"/>'+
  '<title>'+label+'</title></g>';
 const measured=drag?.id===cabinet.id;
 return '<div class="elevation-title"><strong>نمای روبه‌روی '+esc(cabinet.name)+'</strong><span>بالا: ارتفاع · پایین: تراز نصب</span></div>'+
  '<svg id="elevation-view" data-ppm="'+n(scale)+'" viewBox="0 0 320 225" role="img" aria-label="دستگیره‌های ارتفاع کابینت">'+
  '<rect x="7" y="'+n(sy(host.height))+'" width="306" height="'+n(ground-sy(host.height))+'" fill="#e1e8e0" stroke="#a8b7ad"/>'+
  '<line x1="7" x2="313" y1="'+ground+'" y2="'+ground+'" stroke="#416854" stroke-width="2"/>'+
  '<rect x="82" y="'+n(top)+'" width="156" height="'+n(bottom-top)+'" fill="'+(cabinet.subtype==='upper'?'#e0cfad':'#b6cbb8')+'" stroke="#64836b" stroke-width="2"/>'+
  marker('top',top,'#e9ad63','ارتفاع کل کابینت')+
  marker('bottom',bottom,'#57b7aa','فاصله لبه پایین تا کف')+
  '<text x="13" y="'+n((top+bottom)/2)+'" class="elevation-scale">'+n(cabinet.height)+' m</text>'+
  '<text x="13" y="'+n((bottom+ground)/2)+'" class="elevation-scale">'+n(cabinet.elevation)+' m از کف</text>'+
  (measured?'<line x1="252" x2="252" y1="'+n(top)+'" y2="'+n(bottom)+'" class="measure-line"/>'+
   '<line x1="270" x2="270" y1="'+n(bottom)+'" y2="'+ground+'" class="measure-line"/>':'')+
  '</svg>';
}


/* Facade-first elevation. Every door/drawer is a selectable object; the selected
   panel has touch-sized, 1 cm snapped width and height seam grips. */
export function renderFrontElevation(items,cabinet,selectedId=null,drag=null){
 if(!cabinet||cabinet.kind!=='cabinet')return '';
 const panels=items.filter(o=>o.kind==='front'&&o.hostId===cabinet.id);
 if(!panels.length)return renderCabinetElevation(items,cabinet,drag);
 const len=lengthOf(cabinet),scale=Math.min(104,Math.max(72,148/Math.max(.45,cabinet.height)));
 const svgWidth=Math.max(320,Math.ceil(len*scale+42)),left=22,bottom=187;
 const sx=t=>left+t*len*scale,sy=t=>bottom-t*cabinet.height*scale;
 const colors={cream:'#e8d9bf',wood:'#ac875d',graphite:'#535a61'};
 const handle=(o,side,x,y,color)=>{
  if(o.id!==selectedId)return '';
  return '<g class="elevation-handle front-resize-grip" data-open-handle="'+side+'" data-item-id="'+esc(o.id)+'" tabindex="0" role="button" aria-label="تغییر '+(side==='right'?'عرض':'ارتفاع')+' با کشیدن">'+
   '<circle cx="'+n(x)+'" cy="'+n(y)+'" r="14" fill="transparent"/>'+
   '<circle cx="'+n(x)+'" cy="'+n(y)+'" r="8" fill="'+color+'" stroke="#fff" stroke-width="2"/>'+
   '</g>';
 };
 let graphic='<rect x="'+n(left)+'" y="'+n(sy(1))+'" width="'+n(len*scale)+'" height="'+n(cabinet.height*scale)+'" rx="2" fill="#d7d4c9" stroke="#777e74"/>';
 for(const o of panels){
  const x=sx(o.startT)+1,y=sy(o.topT)+1,w=(o.endT-o.startT)*len*scale-2,h=(o.topT-o.bottomT)*cabinet.height*scale-2,
   selected=o.id===selectedId,color=colors[o.finish]||colors.cream;
  const horizontal=o.hinge==='top';
  const knobX=o.subtype==='drawer'||horizontal?x+w/2:o.hinge==='left'?x+w-13:x+13;
  graphic+='<g class="front-panel-elevation" data-item-id="'+esc(o.id)+'" tabindex="0" role="button" aria-label="'+(o.subtype==='drawer'?'کشو':'درب')+' '+n((o.endT-o.startT)*len)+' متر">'+
   '<rect x="'+n(x)+'" y="'+n(y)+'" width="'+n(w)+'" height="'+n(h)+'" rx="1.4" fill="'+color+'" stroke="'+(selected?'#168b6a':'#7e7b73')+'" stroke-width="'+(selected?'2.6':'.9')+'"/>'+
   (o.style==='frame'?'<rect x="'+n(x+5)+'" y="'+n(y+5)+'" width="'+n(Math.max(1,w-10))+'" height="'+n(Math.max(1,h-10))+'" rx="1" fill="none" stroke="#847e72" stroke-width="1.2"/>':'')+
   (o.handleStyle==='hidden'?'':o.handleStyle==='knob'?
    '<circle cx="'+n(knobX)+'" cy="'+n(horizontal?y+h-11:y+h*.52)+'" r="3.5" fill="#777b7a"/>':
    '<rect x="'+n(knobX-(o.subtype==='drawer'||horizontal?Math.min(18,w*.24):2))+'" y="'+n(y+(horizontal?h-10:o.subtype==='drawer'?Math.min(13,h*.22):h*.30))+
    '" width="'+n(o.subtype==='drawer'||horizontal?Math.min(36,w*.48):4)+'" height="'+n(o.subtype==='drawer'||horizontal?4:Math.min(29,h*.40))+'" rx="2" fill="#737e7e"/>')+
   '<title>'+esc(o.name)+' · '+n((o.endT-o.startT)*len)+' × '+n((o.topT-o.bottomT)*cabinet.height)+' متر</title></g>';
  graphic+=handle(o,'right',x+w,y+h/2,'#36bd92')+handle(o,'top',x+w/2,y,'#e5a955');
  if(w>43&&h>42)graphic+='<text x="'+n(x+w/2)+'" y="'+n(y+h-9)+'" text-anchor="middle" class="front-elevation-dimension" pointer-events="none">'+n((o.endT-o.startT)*len)+'m</text>';
 }
 return '<div class="elevation-title"><strong>تقسیم‌بندی درب و کشو</strong><span>هر نما را لمس کن · دستگیره‌ها با اسنپ ۱ سانتی‌متر</span></div>'+
  '<div class="front-elevation-scroll"><svg id="elevation-view" data-ppm="'+n(scale)+'" viewBox="0 0 '+svgWidth+' 213" style="width:'+svgWidth+'px;max-width:none" role="img" aria-label="نمای روبروی درب‌ها و کشوهای کابینت">'+
  '<line x1="15" x2="'+(svgWidth-7)+'" y1="'+(bottom+6)+'" y2="'+(bottom+6)+'" stroke="#9c9d8d" stroke-width="2"/>'+
  graphic+'<text x="'+n(svgWidth/2)+'" y="206" text-anchor="middle" class="front-elevation-dimension">طول '+n(len)+' متر · '+panels.length+' نما</text></svg></div>';
}
