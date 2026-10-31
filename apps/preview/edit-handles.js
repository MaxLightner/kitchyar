import {lengthOf,projectOnWall,editOpening,moveCabinetEndpoint,moveEndpoint} from './geometry.js?v=render14';

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
 if(object.kind==='cabinet'){
  const host=byId(items,object.hostId);if(!host)throw Error('دیوار میزبان پیدا نشد.');
  if(!['start','end'].includes(side))throw Error('دستگیره کابینت معتبر نیست.');
  const len=lengthOf(host),old=side==='start'?object.endT*len:object.startT*len;
  let along=snapCm(position.along);
  along=side==='start'?Math.max(0,Math.min(old-.30,along)):Math.min(len,Math.max(old+.30,along));
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
 if(o.kind==='cabinet'){
  const w=byId(items,o.hostId);if(!w)return null;
  return {along:(side==='start'?o.startT:o.endT)*lengthOf(w),y:o.elevation+o.height/2};
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
