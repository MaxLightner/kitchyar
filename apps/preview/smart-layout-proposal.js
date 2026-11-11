import * as Geo from './geometry.js?v=editor67';
import {renderPlan,fitPlanViewport} from './plan-view.js?v=editor67';
import {renderFrontElevation} from './edit-handles.js?v=editor67';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cm=n=>new Intl.NumberFormat('fa-IR',{maximumFractionDigits:1}).format(n*100);
const snapshot=project=>JSON.stringify([project.id,project.revision||0,project.scene]);

// Proposals own their source snapshot. Only the already inspected result may
// be committed; confirmation never invokes a second, potentially different solve.
export function createSmartProposal(project){
 if(!project?.scene?.items)throw Error('پروژه‌ای برای طراحی انتخاب نشده است.');
 const source=structuredClone(project.scene.items),balanced=Geo.planSmartKitchen(source);
 const result=project.scene.styleId&&project.scene.stylePreset?
  {...Geo.applyKitchenLayout(balanced.items,project.scene.styleId,{preset:project.scene.stylePreset}),
   valid:balanced.valid,layoutWarnings:balanced.layoutWarnings}:balanced;
 const issues=[],fronts=result.items.filter(f=>f.kind==='front'),widths=[];
 try{Geo.validateEquipmentSpacing(result.items);}catch(e){issues.push(e.message);}
 for(const f of fronts){
  const host=result.items.find(c=>c.id===f.hostId),pose=host&&Geo.frontPose(f,host);
  if(!pose||![pose.width,pose.height,f.startT,f.endT,f.bottomT,f.topT].every(Number.isFinite)||
   pose.width<=0||pose.height<=0||f.startT<0||f.endT>1+1e-7||f.startT>=f.endT){
   issues.push('ابعاد یکی از نماها معتبر نیست.');continue;
  }
  if(f.subtype!=='door'||f.hinge==='top'||f.style==='open')continue;
  const width=pose.width+(f.gap??.003);widths.push(width);
  if(width<.45-1e-6||width>.55+1e-6)
   issues.push('عرض یک در عمودی '+cm(width)+' سانتی‌متر است؛ تقسیم ردیف باید اصلاح شود.');
 }
 for(const w of result.layoutWarnings||[])if(w.equipmentId)issues.push(w.reason);
 const moves=[];
 for(const before of source.filter(e=>e.kind==='equipment'||e.kind==='cabinet'&&e.subtype==='tall')){
  const after=result.items.find(e=>e.id===before.id);if(!after)continue;
  const position=e=>({x:e.x??(e.x1+e.x2)/2,z:e.z??(e.z1+e.z2)/2});
  const a=position(before),b=position(after),distance=Math.hypot(b.x-a.x,b.z-a.z);
  if(!Number.isFinite(distance)){issues.push('موقعیت یکی از تجهیزات معتبر نیست.');continue;}
  if(distance<.001)continue;
  if(before.positionLocked||before.locked||before.manualPositionLocked)
   issues.push('تجهیز قفل‌شده نباید جابه‌جا شود.');
  const host=source.find(c=>c.id===before.hostId),along=host&&Number.isFinite(before.offsetT)&&Number.isFinite(after.offsetT)?
   (after.offsetT-before.offsetT)*Geo.lengthOf(host):null;
  moves.push({id:before.id,name:before.name||Geo.EQUIPMENT_SPECS[before.subtype]?.name||'یونیت قدی',distance,along});
 }
 if(result.valid===false&&!issues.length)issues.push('در این جست‌وجو تقسیم قابل اعمال پیدا نشد؛ طول ردیف، محل تجهیزات یا قفل‌ها را بررسی کن.');
 return {projectId:project.id,sourceSnapshot:snapshot(project),before:source,result,
  moves,issues:[...new Set(issues)],valid:result.valid!==false&&!issues.length,
  summary:{doors:fronts.filter(f=>f.subtype==='door').length,drawers:fronts.filter(f=>f.subtype==='drawer').length,
   min:widths.length?Math.min(...widths):null,max:widths.length?Math.max(...widths):null}};
}

export function acceptSmartProposal(project,proposal){
 if(!proposal||!project||proposal.projectId!==project.id||proposal.sourceSnapshot!==snapshot(project))
  throw Error('طرح از زمان پیش‌نمایش تغییر کرده است؛ دوباره پیشنهاد چیدمان را اجرا کن.');
 if(!proposal.valid)throw Error('این پیشنهاد هنوز قابل اعمال نیست؛ موارد مشخص‌شده را اصلاح کن.');
 return structuredClone(proposal.result);
}

export function renderSmartProposal(proposal){
 const {summary:s,moves,issues}=proposal,viewport=fitPlanViewport([...proposal.before,...proposal.result.items]);
 const plan=(items,key)=>renderPlan(items,{mini:true,viewport,showCalibration:false}).replaceAll('mini-grid-k','solver-'+key+'-grid');
 const movement=moves.length?'<ul class="solver-moves">'+moves.map(m=>'<li><strong>'+esc(m.name)+'</strong> · '+cm(m.distance)+' سانتی‌متر'+
  (m.along===null?' جابه‌جایی':' به سمت '+(m.along>0?'انتهای':'ابتدای')+' ردیف')+'</li>').join('')+'</ul>':'<p>تجهیزات جابه‌جا نمی‌شوند.</p>';
 const dimensions=s.min===null?'بدون در عمودی':cm(s.min)+(Math.abs(s.max-s.min)>.001?' تا '+cm(s.max):'')+' سانتی‌متر';
 const elevations=proposal.result.items.filter(c=>c.kind==='cabinet'&&proposal.result.items.some(f=>f.kind==='front'&&f.hostId===c.id)).map((c,index)=>{
  // Reuse the app's actual front geometry renderer. The preview is read-only,
  // and identifiers cannot collide with the live editor beneath the dialog.
  const svg=renderFrontElevation(proposal.result.items,c).match(/<svg[\s\S]*?<\/svg>/)?.[0]||'';
  return '<div class="solver-front-row"><strong>'+esc(c.name||'ردیف کابینت')+' · '+cm(Geo.lengthOf(c))+' سانتی‌متر</strong><div class="solver-front-scroll">'+
   svg.replace('id="elevation-view"','id="solver-elevation-'+index+'"').replaceAll(' tabindex="0"','').replaceAll(' role="button"','')+'</div></div>';
 }).join('');
 return '<div class="dialog-cover"><section class="dialog solver-dialog" role="dialog" aria-modal="true" aria-labelledby="solver-title" aria-describedby="solver-description" tabindex="-1">'+
  '<header><span class="solver-step">پیش‌نمایش طراحی</span><h2 id="solver-title">پیشنهاد چیدمان</h2><p id="solver-description">طرح پیشنهادی را بررسی کن. با تأیید، همهٔ تغییرات یک‌جا اعمال می‌شوند و با یک بازگشت قابل برگشت‌اند.</p></header>'+
  '<div class="solver-plans"><figure><figcaption>طرح فعلی</figcaption>'+plan(proposal.before,'before')+'</figure><figure><figcaption>طرح پیشنهادی</figcaption>'+plan(proposal.result.items,'after')+'</figure></div>'+
  '<dl class="solver-summary"><div><dt>درب</dt><dd>'+s.doors+'</dd></div><div><dt>کشو</dt><dd>'+s.drawers+'</dd></div><div><dt>عرض درهای عمودی</dt><dd>'+dimensions+'</dd></div></dl>'+
  '<section class="solver-fronts"><h3>تقسیم نما در طرح پیشنهادی</h3>'+elevations+'</section>'+
  '<section aria-label="تغییر مکان تجهیزات"><h3>تغییر مکان تجهیزات</h3>'+movement+'</section>'+
  (issues.length?'<section class="solver-issues" role="status"><h3>این پیشنهاد قابل اعمال نیست</h3><ul>'+issues.map(i=>'<li>'+esc(i)+'</li>').join('')+'</ul><p>انصراف بده و ابعاد یا محل تجهیزات را اصلاح کن؛ طرح فعلی حفظ می‌شود.</p></section>':'<p class="solver-ready" role="status">طرح آمادهٔ اعمال است. عرض درهای عمودی در بازهٔ ۴۵ تا ۵۵ سانتی‌متر است.</p>')+
  '<footer class="dialog-actions"><button class="primary" data-action="confirm-smart-layout" '+(!proposal.valid?'disabled':'')+'>تأیید و اعمال طرح</button><button data-action="cancel-smart-layout">انصراف · حفظ طرح فعلی</button></footer></section></div>';
}

// The example is a normal, separately saved project built through the same
// geometry API as user drawings; it never overwrites an existing scene.
export function solverExampleItems(){
 let r=Geo.placeWall([],{x:0,z:0},{x:4,z:0});
 r=Geo.placeCabinet(r.items,{x:0,z:0},{x:4,z:0});
 r=Geo.placeEquipment(r.items,{x:.75,z:.4},'sink');
 return Geo.editEquipment(r.items,r.selectedId,{sinkSize:120}).items;
}
