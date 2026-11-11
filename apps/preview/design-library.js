import {tierHeights,DEFAULT_CEILING_HEIGHT,MAX_CEILING_HEIGHT,checkCeilingHeight} from './kitchen-policy.js?v=gallery2';
import * as G from './geometry.js?v=gallery2';

export const PARTS=Object.freeze([
 ['board','تخته ساده'],['box','باکس باز'],['shelf','طبقه'],['crown','تاج کلاسیک'],
 ['pilaster','ستونک'],['capital','سرستون'],['trim','ابزار قاب'],['corbel','پایه تزئینی']
].map(([id,label])=>({id,label})));
export const THICKNESSES=[.016,.03,.05,.07];
const clone=v=>structuredClone(v);
const uid=()=>globalThis.crypto.randomUUID();
export function cabinetHost(items,id){
 const o=items.find(o=>o.id===id);return o?.kind==='front'?items.find(c=>c.id===o.hostId):o;
}
export function configureSurround(source,id,enabled=true,unit=null,group=false){
 const items=clone(source),c=cabinetHost(items,id);
 if(c?.kind!=='cabinet')throw Error('یک یونیت کابینت انتخاب کن.');
 if(group){const peers=items.filter(p=>p.kind==='cabinet'&&p.hostId===c.hostId&&p.side===c.side&&p.subtype===c.subtype&&Math.abs(p.elevation-c.elevation)<.01&&Math.abs(p.height-c.height)<.01);for(const p of peers)delete p.surroundFrame;c.frameGroup=enabled?peers.map(p=>p.id):null;return {items,selectedId:c.id};}
 c.surroundFrame=enabled?(unit?{startT:unit.startT,endT:unit.endT,bottomT:unit.bottomT,topT:unit.topT}:true):false;return {items,selectedId:c.id};
}
export function configureTiers(source,{enabled=true,lowerHeight=null,lowerDepth=.35,upperDepth=.60,ceilingHeight,cabinetIds=null,auto=true}={}){
 const items=clone(source),uppers=items.filter(c=>c.kind==='cabinet'&&c.subtype==='upper'&&(!cabinetIds||cabinetIds.includes(c.id)));
 if(!uppers.length)throw Error('ابتدا کابینت هوایی بکش.');
 for(const old of uppers){
  const c=items.find(c=>c.id===old.id);
  const wall=items.find(w=>w.id===c.hostId),ceiling=checkCeilingHeight(Number(ceilingHeight??wall?.height??DEFAULT_CEILING_HEIGHT));
  if(enabled){
   c.elevation=1.5;
   const heights=tierHeights(ceiling,c.elevation,auto?null:lowerHeight);
   if(![lowerDepth,upperDepth].every(Number.isFinite)||lowerDepth<.2||lowerDepth>.8||upperDepth<.2||upperDepth>.8)throw Error('عمق طبقات باید بین ۲۰ و ۸۰ سانتی‌متر باشد.');
   c.upperTiers={lowerHeight:heights.lower,lowerDepth,upperDepth,ceilingHeight:ceiling,auto};c.height=heights.total;

  }else {c.height=c.upperTiers?.lowerHeight||.9;delete c.upperTiers;}
  // Protected units retain their own semantic boundaries. Automatic fronts use
  // the shared facade generator, including the two sink lifts and hob void.
  const next=G.placeFrontLayout(items,c.id,c.frontPreset||'smart');items.splice(0,items.length,...next.items);
 }
 G.refitUpperDependants(items,Number(ceilingHeight??Infinity));
 return {items,selectedId:uppers[0].id};
}
export function upgradeLegacyTiers(source,ceilingHeight){
 if(Number(ceilingHeight)>MAX_CEILING_HEIGHT)return source;
 const legacy=source.filter(c=>c.kind==='cabinet'&&c.upperTiers&&c.upperTiers.auto!==false&&
  (c.upperTiers.auto===undefined||Math.abs(c.upperTiers.lowerHeight-tierHeights(Number(ceilingHeight??c.upperTiers.ceilingHeight??DEFAULT_CEILING_HEIGHT)).lower)>.001));
 if(!legacy.length)return source;
 let items=source;
 for(const c of legacy)items=configureTiers(items,{cabinetIds:[c.id],ceilingHeight,lowerDepth:c.upperTiers.lowerDepth,upperDepth:c.upperTiers.upperDepth}).items;
 return items;
}
export function addPart(source,id,type,{startT=0,endT=1}={}){
 const items=clone(source),host=cabinetHost(items,id),entry=PARTS.find(p=>p.id===type);
 if(host?.kind!=='cabinet'||!entry)throw Error('ابتدا یونیت میزبان قطعه را انتخاب کن.');
 const vertical=['pilaster','corbel','capital'].includes(type),part={id:uid(),kind:'design-part',name:entry.label,hostId:host.id,type,
  startT,endT,width:vertical?.08:(endT-startT)*G.lengthOf(host),height:vertical?Math.min(host.height,.9):type==='box'?.5:.07,
  depth:type==='box'||type==='shelf'?.3:.05,thickness:.016,offsetX:0,offsetY:type==='crown'?host.height:type==='shelf'?host.height*.5:0,
  surface:type==='shelf'?'inside':'front',materialId:'ivory-matte'};
 items.push(part);return {items,selectedId:part.id};
}
export function editPart(source,id,values){
 const items=clone(source),p=items.find(o=>o.id===id&&o.kind==='design-part');if(!p)throw Error('قطعه پیدا نشد.');
 for(const key of ['width','height','depth','offsetX','offsetY'])if(values[key]!==undefined){const n=Number(values[key]);if(!Number.isFinite(n)||Math.abs(n)>10||(['width','height','depth'].includes(key)&&n<.01))throw Error('اندازه قطعه معتبر نیست.');p[key]=n;}
 if(values.thickness!==undefined){const n=Number(values.thickness);if(!THICKNESSES.includes(n))throw Error('ضخامت آماده انتخاب کن.');p.thickness=n;}
 if(values.surface!==undefined){if(!['front','top','inside','left','right'].includes(values.surface))throw Error('سطح معتبر نیست.');p.surface=values.surface;}
 if(values.materialId!==undefined)p.materialId=values.materialId;
 return {items,selectedId:id};
}
// All views derive attachment positions from the current host. No cached world
// transforms: moving/resizing a cabinet cannot leave decorations behind.
export function partPose(items,p){
 const c=items.find(c=>c.id===p.hostId);if(c?.kind!=='cabinet')return null;
 const len=G.lengthOf(c),angle=Math.atan2(c.z2-c.z1,c.x2-c.x1),ux=Math.cos(angle),uz=Math.sin(angle),side=c.side||1;
 let x=(p.startT+p.endT-1)*len/2+p.offsetX,z=side*(c.depth/2+p.depth/2+.022),y=c.elevation+p.offsetY+p.height/2;
 if(p.surface==='top'){z=0;y=c.elevation+c.height+p.height/2;}
 if(p.surface==='inside')z=side*(c.depth-p.depth)/2;
 if(p.surface==='left'||p.surface==='right'){x=(p.surface==='left'?-1:1)*(len/2+p.width/2);z=0;}
 return {x:(c.x1+c.x2)/2+ux*x-uz*z,z:(c.z1+c.z2)/2+uz*x+ux*z,y,angle,width:p.width,height:p.height,depth:p.depth};
}
export function applyReference(source,style,preset,{ceilingHeight,cabinetIds=null}={}){
 let items=clone(source);
 const ref=preset.reference;if(!ref)return G.applyKitchenLayout(items,style.id,{preset,cabinetIds});
 // Switching references removes only features generated by the previous sample.
 for(const c of items.filter(c=>c.kind==='cabinet'&&(!cabinetIds||cabinetIds.includes(c.id)))){if(c.referenceDecor){delete c.decor;delete c.surroundFrame;delete c.referenceDecor;}}
 if(items.some(c=>c.upperTiers&&(!cabinetIds||cabinetIds.includes(c.id))))items=configureTiers(items,{enabled:false,cabinetIds}).items;
 for(const h of items.filter(e=>e.kind==='equipment'&&e.subtype==='hood'))h.coverStyle=ref.hood;
 items=G.applyKitchenLayout(items,style.id,{preset,cabinetIds}).items;
 if(ref.tiers&&items.some(c=>c.kind==='cabinet'&&c.subtype==='upper'&&(!cabinetIds||cabinetIds.includes(c.id))))items=configureTiers(items,{...ref.tiers,ceilingHeight,cabinetIds}).items;
 for(const c of items.filter(c=>c.kind==='cabinet'&&(!cabinetIds||cabinetIds.includes(c.id)))){
  c.referenceDecor=true;c.decor={...G.resolvedCabinetDecor(c),...(ref.decor||{})};
  if(c.subtype==='tall'||c.subtype==='over-fridge')c.surroundFrame=true;
 }
 for(const h of items.filter(e=>e.kind==='equipment'&&e.subtype==='hood'))h.coverStyle=ref.hood;
 for(const c of items.filter(c=>c.kind==='cabinet'&&(!cabinetIds||cabinetIds.includes(c.id)))){
  const fs=items.filter(f=>f.kind==='front'&&f.hostId===c.id).sort((a,b)=>a.startT-b.startT||a.bottomT-b.bottomT);
  for(const f of fs){
   if(c.subtype==='tall'&&c.tallFrontsEnabled!==undefined)continue;
   if(f.manualOverrides?.style||f.unitKey)continue;
   if(!f.manualOverrides?.materialId)delete f.materialId;if(!f.manualOverrides?.frameMaterialId)delete f.frameMaterialId;
   f.style=ref.cross&&f.style==='cross'?'cross':ref.panel||preset.front.style;f.handleStyle=f.subtype==='drawer'?(ref.drawerHandle||preset.front.handleStyle):preset.front.handleStyle;
   if(c.subtype==='upper'){
    if(f.tier==='lower'&&ref.lowerMaterial)f.materialId=ref.lowerMaterial;
    if(f.tier==='upper'&&ref.upperMaterial)f.materialId=ref.upperMaterial;
    if(ref.glass&&f.subtype==='door'&&(f.startT<.18||f.endT>.82))f.style='glass-grid';
    const hob=items.find(e=>e.subtype==='stove'&&e.hostId&&items.find(b=>b.id===e.hostId)?.hostId===c.hostId);
    if(ref.cross&&hob&&f.bottomT>.6&&f.startT<=(hob.offsetT??.5)+1e-6&&f.endT>=(hob.offsetT??.5)-1e-6)f.style='cross';
   }
  }
 }
 return {items,selectedId:items.find(c=>c.kind==='cabinet'&&(!cabinetIds||cabinetIds.includes(c.id)))?.id};
}
