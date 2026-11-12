import {FloorAR} from './floor-ar.js?v=local1';
import {frontPose} from './geometry.js?v=gallery2';
import {MATERIALS,DEFAULT_MATERIALS} from './materials.js?v=gallery2';
import {defaultWardrobe,wardrobeItems,wardrobeSections,wardrobePanels,wardrobeRods,resizeWardrobe,editWardrobeBay,splitWardrobeBay,joinWardrobeBay,addWardrobeShelf,eraseWardrobeShelf,setWardrobeOpening,openWardrobeDoors,WARDROBE_ROLES} from './wardrobe-model.js?v=gallery2';
import {wardrobeParts} from './wardrobe-report.js?v=gallery2';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cm=n=>Math.round(n*1000)/10,num=n=>new Intl.NumberFormat('fa-IR',{maximumFractionDigits:1}).format(n);
const input=(label,key,value,min,max)=>'<label>'+label+'<input data-w-field="'+key+'" type="number" step="1" min="'+min+'" max="'+max+'" value="'+value+'"></label>';
export function newWardrobeScene(){return {items:wardrobeItems(defaultWardrobe()),materials:{...DEFAULT_MATERIALS},ceilingHeight:2.6};}

export function wardrobeElevation(items,inside=true,selectedBayKey=null){
 const c=items.find(c=>c.wardrobe),{width:w,height:h}=c.wardrobe,pad=.15;
 const rect=(x,y,width,height,fill,extra='')=>'<rect x="'+x+'" y="'+(h-y-height)+'" width="'+width+'" height="'+height+'" fill="'+fill+'" stroke="#6d766b" stroke-width=".008" '+extra+'/>';
 let out=rect(-w/2,0,w,h,'#ece6da');
 for(const p of wardrobePanels(c))if(p.part!=='back')out+=rect(p.x-p.width/2,p.y-p.height/2,p.width,p.height,p.part==='desk-top'?'#b99a6d':'#fafbf7');
 for(const r of wardrobeRods(c))out+='<line x1="'+(r.x-r.length/2)+'" x2="'+(r.x+r.length/2)+'" y1="'+(h-r.y)+'" y2="'+(h-r.y)+'" stroke="#647275" stroke-width=".025"/>';
 for(const f of items.filter(f=>f.kind==='front'&&(inside?f.wardrobeInternal:!f.wardrobeInternal))){
  const p=frontPose(f,c);out+=rect((f.startT-.5)*w+.0015,f.bottomT*h+.0015,p.width,p.height,f.mirror?'#b8d1d5':'#dccbb0');
  if(!inside)out+='<line x1="'+((f.startT+f.endT-1)*w/2)+'" x2="'+((f.startT+f.endT-1)*w/2)+'" y1="'+(h*.4)+'" y2="'+(h*.55)+'" stroke="#6b7069" stroke-width=".013"/>';
 }
 if(inside){
  const bays=wardrobeSections(c);
  for(const b of bays){
   out+='<rect data-w-bay-rect="'+esc(b.key)+'" x="'+(b.start-w/2)+'" y="0" width="'+b.width+'" height="'+h+'" fill="transparent" stroke="'+(b.key===selectedBayKey?'#2563eb':'transparent')+'" stroke-width=".04" style="cursor:crosshair"/>';
  }
  for(const b of bays.slice(0,-1))out+='<line data-w-erase-seam="'+esc(b.key)+'" x1="'+(b.end-w/2)+'" x2="'+(b.end-w/2)+'" y1="0" y2="'+h+'" stroke="transparent" stroke-width=".075" pointer-events="stroke" style="cursor:crosshair"/>';
 }
 for(const b of wardrobeSections(c))out+='<text x="'+((b.start+b.end-w)/2)+'" y="'+(h+.085)+'" text-anchor="middle" font-size=".065" fill="#3c5148">'+num(b.index+1)+' · '+num(cm(b.width))+' cm</text>';
 return '<svg viewBox="'+[-w/2-pad,-pad,w+pad*2,h+pad*2].join(' ')+'" role="img" aria-label="نمای روبه‌روی کمد با تقسیمات واقعی">'+out+'</svg>';
}

export function mountWardrobe(container,project,{save,tell}){
 const abort=new AbortController(),signal=abort.signal;
 let past=[],future=[],view='3d',selected=null,selectedBayKey=null,drawTool='select',partsOpen=false,disposed=false,lastSaved=JSON.stringify(project);
 let renderer;
 const current=()=>project.scene.items,body=()=>current().find(c=>c.wardrobe),config=()=>body().wardrobe;
 container.innerHTML='<main class="wardrobe-app"><header class="wardrobe-header"><a href="#/projects">← پروژه‌ها</a><div><small>KITCHYAR / کمدساز</small><h1>'+esc(project.name)+'</h1></div><span class="wardrobe-save" role="status">ذخیره‌شده روی دستگاه</span><button data-w-action="undo" aria-label="بازگشت تغییر کمد">بازگشت</button><button data-w-action="redo">انجام دوباره</button></header>'+
  '<div class="wardrobe-layout"><section class="wardrobe-preview"><nav class="wardrobe-viewbar" aria-label="نمای کمد"><button data-w-action="view" data-view="3d">سه‌بعدی</button><button data-w-action="view" data-view="inside">تقسیمات داخل</button><button data-w-action="view" data-view="front">نمای درها</button><button data-w-action="all-open">بازکردن درها</button><button data-w-action="all-close">بستن همه</button></nav><nav id="wardrobe-draw-toolbar" class="wardrobe-draw-toolbar" hidden><button data-w-action="draw-tool" data-tool="select">انتخاب</button><button data-w-action="draw-tool" data-tool="pencilV">✎ مرز عمودی</button><button data-w-action="draw-tool" data-tool="pencilH">✎ طبقه افقی</button><button data-w-action="draw-tool" data-tool="eraseV">⌫ حذف مرز</button><button data-w-action="draw-tool" data-tool="eraseH">⌫ پاک‌کردن طبقه</button></nav><div class="wardrobe-viewport" id="wardrobe-viewport"><div id="wardrobe-3d"></div><div id="wardrobe-elevation" hidden></div></div><p class="wardrobe-view-help">چرخش: کشیدن · بزرگ‌نمایی: چرخ ماوس یا دو انگشت · برای انتخاب در یا کشو روی آن بزن.</p><div class="wardrobe-selection" id="wardrobe-selection"></div><section id="wardrobe-parts" hidden></section></section><aside class="wardrobe-settings" id="wardrobe-settings" aria-label="تنظیمات کمد"></aside></div></main>';
 const viewport=container.querySelector('#wardrobe-3d'),elevation=container.querySelector('#wardrobe-elevation'),settings=container.querySelector('#wardrobe-settings');
 const materials=()=>({...DEFAULT_MATERIALS,...project.scene.materials,front:config().finish,baseFront:config().finish});
 function persist(){
  try{save(project);lastSaved=JSON.stringify(project);container.querySelector('.wardrobe-save').textContent='ذخیره شد';}
  catch(e){tell(e.message);throw e;}
 }
 function checkCurrent(){
  const saved=JSON.parse(localStorage.getItem('kitchyar.ui.v2')||'[]').find(p=>p.id===project.id);
  if(!saved||JSON.stringify(saved)!==lastSaved)throw Error('این پروژه در تب دیگری تغییر کرده است؛ صفحه را تازه کن تا نسخهٔ جدید باز شود.');
 }
 function update(items,{opening=false}={}){
  checkCurrent();const before=structuredClone(project.scene),revision=project.revision,updatedAt=project.updatedAt;
  project.scene={...project.scene,items};project.revision=(project.revision||0)+1;project.updatedAt=new Date().toISOString();
  try{persist();}catch(e){project.scene=before;project.revision=revision;project.updatedAt=updatedAt;throw e;}
  past.push(before);if(past.length>60)past.shift();future=[];
  if(opening)renderer.syncFrontOpeningState(items);else renderer.setSceneState(items,selected,materials());
  draw();
 }
 function rebuild(next){update(wardrobeItems(next,current()));}
 function history(redo=false){
  checkCurrent();const source=redo?future:past,target=redo?past:future;if(!source.length)return;
  const before=structuredClone(project.scene),revision=project.revision,updatedAt=project.updatedAt,next=source.at(-1);project.scene=structuredClone(next);
  project.revision=(project.revision||0)+1;project.updatedAt=new Date().toISOString();
  try{persist();}catch(e){project.scene=before;project.revision=revision;project.updatedAt=updatedAt;throw e;}
  source.pop();target.push(before);selected=null;renderer.setSceneState(current(),null,materials());draw();
 }
 function draw(){
  if(disposed)return;
  const cfg=config(),items=current();
  container.querySelector('[data-w-action="undo"]').disabled=!past.length;container.querySelector('[data-w-action="redo"]').disabled=!future.length;
  for(const b of container.querySelectorAll('[data-w-action="view"]'))b.setAttribute('aria-pressed',String(b.dataset.view===view));
  viewport.hidden=view!=='3d';elevation.hidden=view==='3d';
  const drawbar=container.querySelector('#wardrobe-draw-toolbar');drawbar.hidden=view!=='inside';
  for(const b of drawbar.querySelectorAll('[data-w-action="draw-tool"]'))b.setAttribute('aria-pressed',String(b.dataset.tool===drawTool));
  if(view!=='3d')elevation.innerHTML=wardrobeElevation(items,view==='inside',selectedBayKey);
  settings.innerHTML='<section class="wardrobe-setting-block"><span class="wardrobe-eyebrow">ابعاد کلی · سانتی‌متر</span><h2>باکس کمد</h2><div class="wardrobe-dimensions">'+
   input('عرض','width',cm(cfg.width),60,600)+input('ارتفاع','height',cm(cfg.height),180,320)+input('عمق','depth',cm(cfg.depth),45,80)+'</div><button class="primary" data-w-action="dimensions">اعمال ابعاد</button><label>جنس و رنگ درها<select data-w-finish>'+MATERIALS.front.map(m=>'<option value="'+m.id+'" '+(m.id===cfg.finish?'selected':'')+'>'+m.label+'</option>').join('')+'</select></label></section>'+
   '<section class="wardrobe-setting-block"><span class="wardrobe-eyebrow">تقسیم عرض و کاربری</span><h2>بخش‌های داخلی</h2><p>شماره‌گذاری از چپ است. تغییر عرض هر بخش از بخش کناری گرفته می‌شود.</p>'+wardrobeSections(body()).map(b=>{
    const doors=items.filter(f=>f.kind==='front'&&f.subtype==='door'&&f.wardrobeBay===b.key),drawers=items.filter(f=>f.wardrobeInternal&&f.wardrobeBay===b.key);
    return '<article class="wardrobe-bay" data-w-bay="'+esc(b.key)+'"><h3>بخش '+num(b.index+1)+' <small>عرض خالص '+num(cm(b.clear))+' سانتی‌متر</small></h3><label>کاربری<select data-w-role>'+Object.entries(WARDROBE_ROLES).map(([id,label])=>'<option value="'+id+'" '+(b.role===id?'selected':'')+'>'+label+'</option>').join('')+'</select></label>'+input('عرض بخش','bayWidth',cm(b.width),35,120)+
     (b.role==='shelves'?input('تعداد طبقه','shelves',b.shelves,0,8):'')+(b.role==='drawers-hang'?input('تعداد کشوی داخلی','drawers',b.drawers,1,5):'')+
     '<button data-w-action="bay-apply">اعمال بخش</button><div class="wardrobe-bay-actions"><button data-w-action="split">دو بخش کردن</button><button data-w-action="join" '+(b.index===cfg.bays.length-1?'disabled':'')+'>ادغام با بعدی</button></div>'+
     (b.role==='desk'?'<p class="wardrobe-bay-note">میز باز · ارتفاع ۷۵ · فضای زانوی آزاد '+num(cm(.75-.018))+' سانتی‌متر</p>':'')+
     doors.map((f,j)=>'<div class="wardrobe-door-row"><button data-w-action="open" data-id="'+f.id+'">'+(f.openFraction>.5?'بستن':'بازکردن')+' در '+num(j+1)+'</button><label class="wardrobe-check"><input type="checkbox" data-w-mirror="'+j+'" '+(f.mirror?'checked':'')+'>آینه روی در '+num(j+1)+'</label></div>').join('')+
     drawers.map((f,j)=>'<button class="wardrobe-drawer-toggle" data-w-action="open" data-id="'+f.id+'">'+(f.openFraction>.5?'بستن':'بازکردن')+' کشوی داخلی '+num(j+1)+'</button>').join('')+'</article>';
   }).join('')+'</section><button class="wardrobe-parts-button" data-w-action="parts">فهرست قطعات و خروجی CSV</button><p class="wardrobe-small">آینه بازتاب محیط دارد. بازتاب دقیق اشیای اتاق و حالت AR کمد در این مرحله ارائه نشده است.</p>';
  const f=items.find(f=>f.id===selected&&f.kind==='front');
  container.querySelector('#wardrobe-selection').innerHTML=f?'<strong>'+esc(f.name)+'</strong><span>عرض '+num(cm(frontPose(f,body()).width))+' سانتی‌متر</span><button data-w-action="open" data-id="'+f.id+'">'+(f.openFraction>.5?'بستن':'بازکردن')+'</button>':'<span>درها، آینه و کشوهای داخلی از پنل هر بخش قابل کنترل‌اند.</span>';
  const report=container.querySelector('#wardrobe-parts');report.hidden=!partsOpen;
  if(partsOpen){const rows=wardrobeParts(items);report.innerHTML='<h2>قطعات واقعی مدل</h2><p>ابعاد به میلی‌متر؛ اندازهٔ نوار لبه و سوراخ‌کاری پیش از تولید بررسی شود.</p><button data-w-action="csv">دانلود CSV</button><div class="wardrobe-parts-scroll"><table><thead><tr><th>کد</th><th>قطعه</th><th>جنس</th><th>طول</th><th>عرض</th><th>ضخامت</th></tr></thead><tbody>'+rows.map(p=>'<tr><td>'+p.code+'</td><td>'+esc(p.name)+'</td><td>'+p.material+'</td><td>'+p.lengthMm+'</td><td>'+p.widthMm+'</td><td>'+p.thicknessMm+'</td></tr>').join('')+'</tbody></table></div>';}
 }
 renderer=new FloorAR(viewport,()=>{},()=>{});
 renderer.setSceneState(current(),null,materials());renderer.startPreview(viewport);
 renderer.previewOrbit={...renderer.previewOrbit,y:config().height/2,yaw:Math.PI/2,pitch:.12,radius:Math.max(4,config().width*1.8)};renderer.previewViewChosen=true;renderer.renderPreview();draw();
 viewport.addEventListener('click',e=>{
  if(renderer.previewWasDragged||performance.now()<(renderer.suppressTapUntil||0))return;
  selected=renderer.pickPreviewObject(e.clientX,e.clientY);renderer.setSelection(selected);draw();
 },{signal});
 container.addEventListener('click',e=>{
  const bayTarget=view==='inside'?e.target.closest('[data-w-bay-rect],[data-w-erase-seam]'):null;
  if(bayTarget){
   const key=bayTarget.dataset.wBayRect||bayTarget.dataset.wEraseSeam;
   const sections=wardrobeSections(body()),index=sections.findIndex(b=>b.key===key);
   if(index<0)return;
   selectedBayKey=key;
   try{
    const rect=(bayTarget.matches('[data-w-bay-rect]')?bayTarget:elevation.querySelector('[data-w-bay-rect="'+key+'"]'))?.getBoundingClientRect();
    if(!rect)throw Error('محدوده بخش مشخص نشد.');
    if(drawTool==='pencilV'){
     const ratio=Math.max(.02,Math.min(.98,(e.clientX-rect.left)/rect.width));
     return rebuild(splitWardrobeBay(config(),key,ratio));
    }
    if(drawTool==='eraseV'){
     const target=index===sections.length-1?sections[index-1]?.key:key;
     if(!target)throw Error('برای حذف مرز باید دو بخش مجاور وجود داشته باشد.');
     return rebuild(joinWardrobeBay(config(),target));
    }
    if(drawTool==='pencilH'||drawTool==='eraseH'){
     const position=e.clientY,box=elevation.querySelector('[data-w-bay-rect="'+key+'"]')?.getBoundingClientRect();
     if(!box?.height)throw Error('موقعیت بخش مشخص نشد.');
     const heightRatio=Math.max(0,Math.min(1,1-(position-box.top)/box.height));
     return rebuild(drawTool==='pencilH'?addWardrobeShelf(config(),key,heightRatio):eraseWardrobeShelf(config(),key,heightRatio));
    }
    draw();container.querySelector('[data-w-bay="'+key+'"]').scrollIntoView({block:'nearest',behavior:'smooth'});
   }catch(error){tell(error.message);draw();}return;
  }
  const button=e.target.closest('[data-w-action]');if(!button||button.disabled)return;
  const action=button.dataset.wAction,card=button.closest('[data-w-bay]'),key=card?.dataset.wBay;
  try{
   if(action==='view'){view=button.dataset.view;draw();if(view==='3d')renderer.renderPreview();return;}
   if(action==='draw-tool'){drawTool=button.dataset.tool;draw();return;}
   if(action==='undo'||action==='redo')return history(action==='redo');
   if(action==='dimensions')return rebuild(resizeWardrobe(config(),Object.fromEntries(['width','height','depth'].map(k=>[k,Number(settings.querySelector('[data-w-field="'+k+'"]').value)/100]))));
   if(action==='bay-apply'){
    const value=key=>card.querySelector('[data-w-field="'+key+'"]')?.value;
    const b=config().bays.find(b=>b.key===key);
    return rebuild(editWardrobeBay(config(),key,{role:card.querySelector('[data-w-role]').value,width:Number(value('bayWidth'))/100,shelves:value('shelves')===undefined?b.shelves:Number(value('shelves')),drawers:value('drawers')===undefined?b.drawers:Number(value('drawers'))}));
   }
   if(action==='split')return rebuild(splitWardrobeBay(config(),key));
   if(action==='join')return rebuild(joinWardrobeBay(config(),key));
   if(action==='open'){
    const f=current().find(f=>f.id===button.dataset.id);selected=f.id;
    const dependencies=current().filter(d=>d.kind==='front'&&d.wardrobeBay===f.wardrobeBay&&(f.wardrobeInternal?d.subtype==='door':d.wardrobeInternal));
    if(dependencies.some(d=>renderer.frontMotions.has(d.id)))throw Error('حرکت در یا کشوی همین بخش هنوز تمام نشده؛ لحظه‌ای صبر کن.');
    return update(setWardrobeOpening(current(),f.id,!(f.openFraction>.5)),{opening:true});
   }
   if(action==='all-open'||action==='all-close')return update(openWardrobeDoors(current(),action==='all-open'),{opening:true});
   if(action==='parts'){partsOpen=!partsOpen;draw();if(partsOpen)container.querySelector('#wardrobe-parts').scrollIntoView({behavior:'smooth'});return;}
   if(action==='csv'){
    const rows=wardrobeParts(current()),columns=['code','name','material','lengthMm','widthMm','thicknessMm'];
    const csv='\ufeff'+[columns.join(','),...rows.map(r=>columns.map(k=>'"'+String(r[k]).replaceAll('"','""')+'"').join(','))].join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='kitchyar-wardrobe-parts.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   }
  }catch(error){tell(error.message);}
 },{signal});
 container.addEventListener('change',e=>{
  try{
   if(e.target.matches('[data-w-finish]')){const next=structuredClone(config());next.finish=e.target.value;return rebuild(next);}
   if(e.target.matches('[data-w-mirror]')){
    const key=e.target.closest('[data-w-bay]').dataset.wBay,b=config().bays.find(b=>b.key===key),mirrors=[...b.mirrors];mirrors[Number(e.target.dataset.wMirror)]=e.target.checked;
    return rebuild(editWardrobeBay(config(),key,{mirrors}));
   }
  }catch(error){tell(error.message);draw();}
 },{signal});
 return {dispose(){disposed=true;abort.abort();renderer.stopPreview();},renderer};
}
