/* Read-only manufacturing overview from the semantic kitchen project.
   This is deliberately a schematic schedule, never a CNC nesting/cut program. */
import {lengthOf,countertopCutouts,frontPose} from './geometry.js?v=report33';
import {MATERIALS,DEFAULT_MATERIALS,resolveFinish} from './materials.js?v=report33';

const mm=metres=>Math.round(metres*1000);
const findLabel=(family,id)=>MATERIALS[family]?.find(m=>m.id===id)?.label||id||'نامشخص';
const sortCabinets=(a,b)=>String(a.hostId).localeCompare(String(b.hostId))||
 (a.elevation||0)-(b.elevation||0)||a.startT-b.startT||a.endT-b.endT;

export function buildCutReport(project){
 const items=project?.scene?.items||[],settings={...DEFAULT_MATERIALS,...project?.scene?.materials};
 const cabinets=items.filter(x=>x.kind==='cabinet'&&x.subtype!=='bridge').sort(sortCabinets);
 const byId=new Map(items.map(item=>[item.id,item]));
 const fronts=[],cabinetViews=[],warnings=[];
 let doors=0,drawers=0,doorArea=0;
 for(let i=0;i<cabinets.length;i++){
  const c=cabinets[i],len=lengthOf(c),code=`C${String(i+1).padStart(2,'0')}`;
  const view={code,id:c.id,kind:c.subtype,lengthMm:mm(len),heightMm:mm(c.height),
   elevationMm:mm(c.elevation||0),depthMm:mm(c.depth),fronts:[]};
  const faces=items.filter(f=>f.kind==='front'&&f.hostId===c.id)
   .sort((a,b)=>a.startT-b.startT||b.topT-a.topT||a.bottomT-b.bottomT);
  for(const f of faces){
   const pose=frontPose(f,c);if(!pose)continue;
   const drawer=f.subtype==='drawer',n=drawer?++drawers:++doors;
   const codeFront=(drawer?'R':'D')+String(n).padStart(3,'0');
   const widthMm=mm(pose.width),heightMm=mm(pose.height),materialId=f.materialId||
    resolveFinish(settings,c.subtype,'front');
   const row={code:codeFront,cabinet:code,hostId:c.id,id:f.id,
    type:drawer?'کشو':'درب',widthMm,heightMm,quantity:1,
    gapMm:mm(f.gap??.003),material:findLabel('front',materialId),materialId,
    style:f.style==='frame'?'قاب‌دار':'صاف',hinge:drawer?'—':
     ({left:'چپ',right:'راست',top:'بالا'}[f.hinge]||'نامشخص'),
    grain:f.grainDirection==='horizontal'||(f.grainDirection!=='vertical'&&drawer)?'افقی':'عمودی',
    xStartMm:mm(f.startT*len),yBottomMm:mm(f.bottomT*c.height),
    startT:f.startT,endT:f.endT,bottomT:f.bottomT,topT:f.topT};
   fronts.push(row);view.fronts.push(row);doorArea+=widthMm*heightMm/1e6;
  }
  cabinetViews.push(view);
 }

 const base=cabinets.filter(c=>c.subtype==='base');
 const grouped=new Map();
 for(const c of base){
  const wall=byId.get(c.hostId),wallLength=wall?lengthOf(wall):lengthOf(c);
  const design=c.countertopDesign||{},materialId=settings.counter;
  const key=[c.hostId,c.side||1,Math.round((c.elevation||0)*1000),
   Math.round(c.depth*1000),materialId,design.edge||'square',
   Math.round((design.overhang||0)*1000),Math.round((design.raisedHeight||0)*1000),
   Math.round((design.curve||0)*1000),Math.round((design.cornerRadius||0)*1000),
   design.waterfall||'none'].join(':');
  if(!grouped.has(key))grouped.set(key,[]);
  grouped.get(key).push({c,wallLength,from:c.startT*wallLength,to:c.endT*wallLength,design,materialId});
 }
 const countertop=[],cutouts=[];
 for(const members of grouped.values()){
  members.sort((a,b)=>a.from-b.from);
  let active=null;
  const finish=()=>{if(!active)return;
   const slabs=active.members,c=slabs[0].c,design=slabs[0].design;
   const code=`P${String(countertop.length+1).padStart(2,'0')}`;
   const runLengthMm=mm(active.to-active.from),depthMm=mm(c.depth+.035+(design.overhang||0));
   const slab={code,hostId:c.hostId,cabinetIds:slabs.map(s=>s.c.id),
    lengthMm:runLengthMm,depthMm,material:findLabel('counter',settings.counter),
    materialId:settings.counter,startMm:mm(active.from),endMm:mm(active.to),
    edge:design.edge||'square',waterfall:design.waterfall||'none',
    overhangMm:mm(design.overhang||0),raisedMm:mm(design.raisedHeight||0),
    curveMm:mm(design.curve||0),cornerRadiusMm:mm(design.cornerRadius||0),holes:[],
    estimatedAreaSqm:runLengthMm*depthMm/1e6};
   for(const part of slabs)for(const hole of countertopCutouts(items,part.c)){
    const id=`H${String(cutouts.length+1).padStart(2,'0')}`;
    const entry={code:id,slab:code,type:hole.type==='sink'?'سینک':'اجاق',
     widthMm:mm(hole.width),depthMm:mm(hole.depth),
     leftMm:mm(part.from-active.from+hole.left),
     centreDepthMm:mm(part.c.depth/2),model:hole.model||'—'};
    slab.holes.push(entry);cutouts.push(entry);
   }
   countertop.push(slab);active=null;
  };
  for(const member of members){
   if(active&&member.from-active.to>.02)finish();
   if(!active)active={from:member.from,to:member.to,members:[]};
   active.to=Math.max(active.to,member.to);active.members.push(member);
  }
  finish();
 }
 countertop.sort((a,b)=>a.code.localeCompare(b.code));
 if(fronts.some(f=>f.style==='قاب‌دار'))warnings.push('درب قاب‌دار در این گزارش فقط با ابعاد کلی نما نمایش داده شده؛ قطعات تشکیل‌دهنده قاب هنوز تفکیک نشده‌اند.');
 if(countertop.length>1)warnings.push('صفحه‌ها بر اساس امتداد هر دیوار تفکیک شده‌اند. محل اتصال گوشه‌ها و جهت برش فارسی‌بر باید پیش از تولید تعیین شود.');
 if(countertop.some(c=>c.curveMm||c.cornerRadiusMm||c.raisedMm||c.waterfall!=='none'))warnings.push('فرم‌های آبشاری، منحنی، گوشه گرد و صفحه دوارتفاعی در جدول ثبت‌اند اما پلان برش آن‌ها مستطیل شماتیک است؛ اندازه‌گیری واقعی فرم باید پیش از برش تأیید شود.');
 if(cutouts.length)warnings.push('محل برش سینک و گاز از مدل طراحی خوانده شده است؛ ابعاد نهایی باید با شابلون یا مشخصات سازنده تجهیزات تطبیق داده شود.');
 warnings.push('ضخامت ورق، نوار لبه، لقی نصب، جهت سوراخ‌کاری لولا و تلرانس دستگاه هنوز تعریف نشده‌اند. این خروجی شماتیک است و مستقیماً فایل CNC نیست.');
 const byMaterial=new Map();
 for(const f of fronts){const key=f.material;
  if(!byMaterial.has(key))byMaterial.set(key,{material:key,quantity:0,areaSqm:0});
  const row=byMaterial.get(key);row.quantity++;row.areaSqm+=f.widthMm*f.heightMm/1e6;
 }
 return {projectId:project?.id||'',name:project?.name||'پروژه',
  revision:project?.revision||0,updatedAt:project?.updatedAt||'',
  fronts,cabinetViews,countertop,cutouts,warnings,materials:[...byMaterial.values()].map(m=>
   ({...m,areaSqm:Math.round(m.areaSqm*1000)/1000})),
  totals:{doors,drawers,fronts:fronts.length,frontAreaSqm:Math.round(doorArea*1000)/1000,
   slabs:countertop.length,counterLengthM:Math.round(countertop.reduce((a,c)=>a+c.lengthMm,0))/1000,
   counterAreaSqm:Math.round(countertop.reduce((a,c)=>a+c.estimatedAreaSqm,0)*1000)/1000,
   cutouts:cutouts.length},
  hasDrawings:fronts.length>0||countertop.length>0};
}
