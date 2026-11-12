import {FloorAR} from './floor-ar.js?v=boxkeys1';
import * as THREE from './vendor/chido/vendor/three.module.js';
import {renderWardrobeTop,topViewPoint,previewFloorRect} from './wardrobe-box-tool.js?v=box1';
import {desktopCommand} from './desktop-shortcuts.js?v=keyboard1';
import {frontPose} from './geometry.js?v=gallery2';
import {MATERIALS,DEFAULT_MATERIALS} from './materials.js?v=gallery2';
import {defaultWardrobe,wardrobeItems,wardrobeSections,wardrobePanels,wardrobeRods,resizeWardrobe,editWardrobeBay,splitWardrobeBay,joinWardrobeBay,addWardrobeShelf,eraseWardrobeShelf,wardrobeFromFloorRectangle,setWardrobeOpening,openWardrobeDoors,WARDROBE_ROLES} from './wardrobe-model.js?v=boxkeys1';
import {wardrobeParts} from './wardrobe-report.js?v=boxkeys1';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cm=n=>Math.round(n*1000)/10,num=n=>new Intl.NumberFormat('fa-IR',{maximumFractionDigits:1}).format(n);
const input=(label,key,value,min,max)=>'<label>'+label+'<input data-w-field="'+key+'" type="number" step="1" min="'+min+'" max="'+max+'" value="'+value+'"></label>';
export function newWardrobeScene(){return {items:wardrobeItems(defaultWardrobe()),materials:{...DEFAULT_MATERIALS},ceilingHeight:2.6,wardrobeBoxStage:'floor',wardrobeBoxCreated:false};}

export function wardrobeElevation(items,inside=true,selectedBayKey=null,selectedFrontId=null){
 const c=items.find(c=>c.wardrobe),{width:w,height:h}=c.wardrobe,pad=.15;
 const rect=(x,y,width,height,fill,extra='')=>'<rect x="'+x+'" y="'+(h-y-height)+'" width="'+width+'" height="'+height+'" fill="'+fill+'" '+(extra||'stroke="#6d766b" stroke-width=".008"')+'/>';
 let out=rect(-w/2,0,w,h,'#ece6da');
 for(const p of wardrobePanels(c))if(p.part!=='back')out+=rect(p.x-p.width/2,p.y-p.height/2,p.width,p.height,p.part==='desk-top'?'#b99a6d':'#fafbf7');
 for(const r of wardrobeRods(c))out+='<line x1="'+(r.x-r.length/2)+'" x2="'+(r.x+r.length/2)+'" y1="'+(h-r.y)+'" y2="'+(h-r.y)+'" stroke="#647275" stroke-width=".025"/>';
 for(const f of items.filter(f=>f.kind==='front'&&(inside?f.wardrobeInternal:!f.wardrobeInternal))){
  const p=frontPose(f,c);out+=rect((f.startT-.5)*w+.0015,f.bottomT*h+.0015,p.width,p.height,f.mirror?'#b8d1d5':'#dccbb0',!inside?'data-w-front-id="'+esc(f.id)+'" style="cursor:pointer" stroke="'+(f.id===selectedFrontId?'#2563eb':'#6d766b')+'" stroke-width="'+(f.id===selectedFrontId?'.028':'.008')+'"':'');
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
 let past=[],future=[],stage=project.scene.wardrobeBoxStage||'ready',view=stage==='floor'?'top':'3d',selected=null,selectedBayKey=null,drawTool='select',partsOpen=false,disposed=false,lastSaved=JSON.stringify(project);
 let floorDrag=null,heightDrag=null,extrudeHeight=project.scene.items.find(x=>x.wardrobe)?.wardrobe.height||2.4,ghost=null;
 let spaceHeld=false,topPan=null,topViewport=[-3.5,-2.5,7,5];
 let renderer;
 const current=()=>project.scene.items,body=()=>current().find(c=>c.wardrobe),config=()=>body().wardrobe;
 container.innerHTML='<main class="wardrobe-app"><header class="wardrobe-header"><a href="#/projects">← پروژه‌ها</a><div><small>KITCHYAR / کمدساز</small><h1>'+esc(project.name)+'</h1></div><span class="wardrobe-save" role="status">ذخیره‌شده روی دستگاه</span><button data-w-action="undo" aria-label="بازگشت تغییر کمد">بازگشت</button><button data-w-action="redo">انجام دوباره</button></header>'+
  '<div class="wardrobe-layout"><section class="wardrobe-preview"><nav class="wardrobe-viewbar" aria-label="نمای کمد"><button data-w-action="view" data-view="top">پلان کف</button><button data-w-action="view" data-view="3d">سه‌بعدی</button><button data-w-action="view" data-view="inside">تقسیمات داخل</button><button data-w-action="view" data-view="front">نمای درها</button><button data-w-action="all-open">بازکردن درها</button><button data-w-action="all-close">بستن همه</button></nav><nav id="wardrobe-draw-toolbar" class="wardrobe-draw-toolbar" hidden><button data-w-action="draw-tool" data-tool="select">انتخاب</button><button data-w-action="draw-tool" data-tool="pencilV">✎ مرز عمودی</button><button data-w-action="draw-tool" data-tool="pencilH">✎ طبقه افقی</button><button data-w-action="draw-tool" data-tool="eraseV">⌫ حذف مرز</button><button data-w-action="draw-tool" data-tool="eraseH">⌫ پاک‌کردن طبقه</button></nav><div class="wardrobe-viewport" id="wardrobe-viewport"><div id="wardrobe-top" hidden></div><div id="wardrobe-3d"></div><div id="wardrobe-elevation" hidden></div><div id="wardrobe-height-step" hidden><strong>۲. ارتفاع باکس را بالا بکش</strong><span>دستگیره ↕ را با موس بالا و پایین ببر، یا عدد وارد کن</span><div class="wardrobe-height-tools"><button id="wardrobe-extrude-handle" type="button" title="برای بالا آوردن ارتفاع، نگه دار و بکش">↕</button><label>ارتفاع (سانتی‌متر)<input data-w-height type="number" min="180" max="320" step="1" value="240"></label><button class="primary" data-w-action="finish-box">تأیید ارتفاع / Enter</button></div></div></div><p class="wardrobe-plan-help" id="wardrobe-plan-help" hidden>۱. روی پلان کلیک کن و بکش تا عرض و عمق کف کمد مشخص شود (عرض ۶۰–۶۰۰ و عمق ۴۵–۸۰ سانتی‌متر).</p><p class="wardrobe-view-help">چرخش: کشیدن · بزرگ‌نمایی: چرخ ماوس یا دو انگشت · برای انتخاب در یا کشو روی آن بزن.</p><p class="wardrobe-key-help">Enter تأیید · Esc لغو · Delete/Backspace حذف قسمت انتخابی · Ctrl+Z/Y بازگشت/تکرار · Ctrl+S ذخیره · Space+Drag جابه‌جایی · ۱/۲/۳/۴ تغییر نما · B رسم باکس</p><div class="wardrobe-selection" id="wardrobe-selection"></div><section id="wardrobe-parts" hidden></section></section><aside class="wardrobe-settings" id="wardrobe-settings" aria-label="تنظیمات کمد"></aside></div></main>';
 const viewport=container.querySelector('#wardrobe-3d'),elevation=container.querySelector('#wardrobe-elevation'),topHost=container.querySelector('#wardrobe-top'),heightStep=container.querySelector('#wardrobe-height-step'),settings=container.querySelector('#wardrobe-settings');
 const materials=()=>({...DEFAULT_MATERIALS,...project.scene.materials,front:config().finish,baseFront:config().finish});
 function persist(){
  try{save(project);lastSaved=JSON.stringify(project);container.querySelector('.wardrobe-save').textContent='ذخیره شد';}
  catch(e){tell(e.message);throw e;}
 }
 function checkCurrent(){
  const saved=JSON.parse(localStorage.getItem('kitchyar.ui.v2')||'[]').find(p=>p.id===project.id);
  if(!saved||JSON.stringify(saved)!==lastSaved)throw Error('این پروژه در تب دیگری تغییر کرده است؛ صفحه را تازه کن تا نسخهٔ جدید باز شود.');
 }
 function update(items,{opening=false,scenePatch={}}={}){
  checkCurrent();const before=structuredClone(project.scene),revision=project.revision,updatedAt=project.updatedAt;
  project.scene={...project.scene,...scenePatch,items};project.revision=(project.revision||0)+1;project.updatedAt=new Date().toISOString();
  try{persist();}catch(e){project.scene=before;project.revision=revision;project.updatedAt=updatedAt;throw e;}
  past.push(before);if(past.length>60)past.shift();future=[];
  if(opening)renderer.syncFrontOpeningState(items);else renderer.setSceneState(items,selected,materials());
  draw();
 }
 function rebuild(next,scenePatch={}){update(wardrobeItems(next,current()),{scenePatch});}
 function history(redo=false){
  checkCurrent();const source=redo?future:past,target=redo?past:future;if(!source.length)return;
  const before=structuredClone(project.scene),revision=project.revision,updatedAt=project.updatedAt,next=source.at(-1);project.scene=structuredClone(next);
  project.revision=(project.revision||0)+1;project.updatedAt=new Date().toISOString();
  try{persist();}catch(e){project.scene=before;project.revision=revision;project.updatedAt=updatedAt;throw e;}
  source.pop();target.push(before);selected=null;stage=project.scene.wardrobeBoxStage||'ready';view=stage==='floor'?'top':stage==='height'?'3d':view;extrudeHeight=config().height;renderer.setSceneState(current(),null,materials());draw();
 }
 function renderBoxGhost(){
  if(!renderer?.previewScene)return;
  if(renderer.objectGroup)renderer.objectGroup.visible=stage!=='height';
  if(stage!=='height'){
   if(ghost){renderer.previewScene.remove(ghost);ghost.traverse(obj=>{obj.geometry?.dispose();obj.material?.dispose()});ghost=null;}
   renderer.renderPreview();return;
  }
  if(!ghost){
   const geometry=new THREE.BoxGeometry(1,1,1);
   const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0x469a72,transparent:true,opacity:.24,depthWrite:false,side:THREE.DoubleSide}));
   const border=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:0x186344}));
   ghost=new THREE.Group();ghost.add(mesh,border);renderer.previewScene.add(ghost);
  }
  const cfg=config(),cx=cfg.centerX??0,cz=cfg.centerZ??(.064+cfg.depth/2);
  ghost.position.set(cx,extrudeHeight/2,cz);
  ghost.scale.set(cfg.width,extrudeHeight,cfg.depth);
  const field=container.querySelector('[data-w-height]');if(field&&document.activeElement!==field)field.value=String(Math.round(extrudeHeight*100));
  if(renderer.previewOrbit){renderer.previewOrbit.x=cx;renderer.previewOrbit.z=cz;renderer.previewOrbit.y=extrudeHeight/2;}
  renderer.renderPreview();
 }
 function setExtrusionHeight(cmValue){
  const cm=Number(cmValue);if(!Number.isFinite(cm))return;
  extrudeHeight=Math.min(3.2,Math.max(1.8,Math.round(cm)/100));
  renderBoxGhost();
 }
 function finishBoxHeight(){
  if(stage!=='height')return;
  try{
   const next=structuredClone(config());next.height=extrudeHeight;
   stage='ready';view='3d';
   rebuild(next,{wardrobeBoxStage:'ready',wardrobeBoxCreated:true,ceilingHeight:Math.max(2.6,extrudeHeight+.1)});
   renderer.objectGroup.visible=true;renderer.fitPreview();renderer.renderPreview();
  }catch(error){stage='height';view='3d';draw();tell(error.message);}
 }
 function draw(){
  if(disposed)return;
  const cfg=config(),items=current();
  if(stage==='floor')view='top';if(stage==='height')view='3d';
  const isTop=view==='top',isElevation=view==='inside'||view==='front';
  topHost.hidden=!isTop;heightStep.hidden=stage!=='height';
  container.querySelector('#wardrobe-plan-help').hidden=stage!=='floor';
  if(isTop)topHost.innerHTML=renderWardrobeTop(cfg,{drawing:stage==='floor',viewport:topViewport});
  renderBoxGhost();
  container.querySelector('[data-w-action="undo"]').disabled=!past.length;container.querySelector('[data-w-action="redo"]').disabled=!future.length;
  for(const b of container.querySelectorAll('[data-w-action="view"]'))b.setAttribute('aria-pressed',String(b.dataset.view===view));
  viewport.hidden=view!=='3d';elevation.hidden=!isElevation;
  const drawbar=container.querySelector('#wardrobe-draw-toolbar');drawbar.hidden=view!=='inside';
  for(const b of drawbar.querySelectorAll('[data-w-action="draw-tool"]'))b.setAttribute('aria-pressed',String(b.dataset.tool===drawTool));
  if(isElevation)elevation.innerHTML=wardrobeElevation(items,view==='inside',selectedBayKey,selected);
  if(stage!=='ready'){
   settings.innerHTML='<section class="wardrobe-setting-block"><span class="wardrobe-eyebrow">ساخت باکس کمد</span><h2>'+(stage==='floor'?'مرحله ۱ · کشیدن کف':'مرحله ۲ · تعیین ارتفاع')+'</h2><p>'+(stage==='floor'?'با موس روی پلان کف کلیک کن، مستطیل را بکش و رها کن. ابعاد واقعی از همین مستطیل ساخته می‌شود.':'در نمای سه‌بعدی دستگیرهٔ عمودی را بالا بکش و ارتفاع را تأیید کن.')+'</p><p>بعد می‌توانی یونیت‌ها و قفسه‌ها را در نماهای دوبعدی و سه‌بعدی ویرایش کنی.</p></section>';
   container.querySelector('#wardrobe-selection').textContent='مدل در مرحلهٔ ساخت باکس است.';
   container.querySelector('#wardrobe-parts').hidden=true;
   return;
  }
  settings.innerHTML='<section class="wardrobe-setting-block"><span class="wardrobe-eyebrow">ابعاد کلی · سانتی‌متر</span><h2>باکس کمد</h2><div class="wardrobe-dimensions">'+
   input('عرض','width',cm(cfg.width),60,600)+input('ارتفاع','height',cm(cfg.height),180,320)+input('عمق','depth',cm(cfg.depth),45,80)+'</div><button class="primary" data-w-action="dimensions">اعمال ابعاد</button><button data-w-action="redraw-box">✎ ترسیم دوباره باکس کف</button><label>جنس و رنگ درها<select data-w-finish>'+MATERIALS.front.map(m=>'<option value="'+m.id+'" '+(m.id===cfg.finish?'selected':'')+'>'+m.label+'</option>').join('')+'</select></label></section>'+
   '<section class="wardrobe-setting-block"><span class="wardrobe-eyebrow">تقسیم عرض و کاربری</span><h2>بخش‌های داخلی</h2><p>شماره‌گذاری از چپ است. تغییر عرض هر بخش از بخش کناری گرفته می‌شود.</p>'+wardrobeSections(body()).map(b=>{
    const doors=items.filter(f=>f.kind==='front'&&f.subtype==='door'&&f.wardrobeBay===b.key),drawers=items.filter(f=>f.wardrobeInternal&&f.wardrobeBay===b.key);
    return '<article class="wardrobe-bay" data-w-bay="'+esc(b.key)+'"><h3>بخش '+num(b.index+1)+' <small>عرض خالص '+num(cm(b.clear))+' سانتی‌متر</small></h3><label>کاربری<select data-w-role>'+Object.entries(WARDROBE_ROLES).map(([id,label])=>'<option value="'+id+'" '+(b.role===id?'selected':'')+'>'+label+'</option>').join('')+'</select></label>'+input('عرض بخش','bayWidth',cm(b.width),35,120)+
     (['shelves','open-shelves'].includes(b.role)?input('تعداد طبقه','shelves',b.shelves,0,8):'')+(b.role==='drawers-hang'?input('تعداد کشوی داخلی','drawers',b.drawers,1,5):'')+
     '<button data-w-action="bay-apply">اعمال بخش</button><div class="wardrobe-bay-actions"><button data-w-action="split">دو بخش کردن</button><button data-w-action="join" '+(b.index===cfg.bays.length-1?'disabled':'')+'>ادغام با بعدی</button></div>'+
     (b.role==='desk'?'<p class="wardrobe-bay-note">میز باز · ارتفاع ۷۵ · فضای زانوی آزاد '+num(cm(.75-.018))+' سانتی‌متر</p>':'')+
     doors.map((f,j)=>'<div class="wardrobe-door-row"><button data-w-action="open" data-id="'+f.id+'">'+(f.openFraction>.5?'بستن':'بازکردن')+' در '+num(j+1)+'</button><label class="wardrobe-check"><input type="checkbox" data-w-mirror="'+j+'" '+(f.mirror?'checked':'')+'>آینه روی در '+num(j+1)+'</label></div>').join('')+
     drawers.map((f,j)=>'<button class="wardrobe-drawer-toggle" data-w-action="open" data-id="'+f.id+'">'+(f.openFraction>.5?'بستن':'بازکردن')+' کشوی داخلی '+num(j+1)+'</button>').join('')+'</article>';
   }).join('')+'</section><button class="wardrobe-parts-button" data-w-action="parts">فهرست قطعات و خروجی CSV</button><p class="wardrobe-small">آینه بازتاب محیط دارد. بازتاب دقیق اشیای اتاق و حالت AR کمد در این مرحله ارائه نشده است.</p>';
  const f=items.find(f=>f.id===selected&&f.kind==='front');
  container.querySelector('#wardrobe-selection').innerHTML=f?'<strong>'+esc(f.name)+'</strong><span>عرض '+num(cm(frontPose(f,body()).width))+' سانتی‌متر</span><button data-w-action="open" data-id="'+f.id+'">'+(f.openFraction>.5?'بستن':'بازکردن')+'</button>'+(f.subtype==='door'?'<button data-w-action="selected-mirror">'+(f.mirror?'حذف آینه':'آینه روی این در')+'</button>':''):'<span>درها، آینه و کشوهای داخلی از پنل هر بخش قابل کنترل‌اند.</span>';
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
 // Draw floor by dragging; extrude vertically in the 3D view.
 topHost.addEventListener('pointerdown',e=>{
  if(view!=='top')return;
  if(spaceHeld||e.button===1){
   const svg=e.target.closest('#wardrobe-top-svg');if(!svg)return;
   const box=svg.getBoundingClientRect();topPan={id:e.pointerId,x:e.clientX,y:e.clientY,viewport:[...topViewport],width:box.width,height:box.height};
   try{topHost.setPointerCapture(e.pointerId);}catch{}
   e.preventDefault();return;
  }
  if(stage!=='floor'||e.button!==0)return;
  const svg=e.target.closest('#wardrobe-top-svg');if(!svg)return;
  const start=topViewPoint(svg,e);if(!start)return;
  floorDrag={id:e.pointerId,start,end:start,svg};
  try{topHost.setPointerCapture(e.pointerId);}catch{}
  e.preventDefault();
 },{signal});
 topHost.addEventListener('pointermove',e=>{
  if(topPan&&topPan.id===e.pointerId){
   const p=topPan,v=p.viewport;
   topViewport=[v[0]-(e.clientX-p.x)*v[2]/p.width,v[1]-(e.clientY-p.y)*v[3]/p.height,v[2],v[3]];
   topHost.innerHTML=renderWardrobeTop(config(),{drawing:stage==='floor',viewport:topViewport});
   e.preventDefault();return;
  }
  if(!floorDrag||floorDrag.id!==e.pointerId)return;
  const end=topViewPoint(floorDrag.svg,e);if(!end)return;
  floorDrag.end=end;previewFloorRect(topHost.querySelector('#wardrobe-footprint-preview'),floorDrag.start,end);
  e.preventDefault();
 },{signal});
 topHost.addEventListener('pointerup',e=>{
  if(topPan&&topPan.id===e.pointerId){topPan=null;e.preventDefault();return;}
  if(!floorDrag||floorDrag.id!==e.pointerId)return;
  const drag=floorDrag;floorDrag=null;
  const end=topViewPoint(drag.svg,e)||drag.end;
  try{
   const next=wardrobeFromFloorRectangle(config(),{x1:drag.start.x,z1:drag.start.z,x2:end.x,z2:end.z},{preserveBays:project.scene.wardrobeBoxCreated!==false});
   extrudeHeight=next.height;stage='height';view='3d';
   renderer.previewOrbit={...renderer.previewOrbit,x:next.centerX,z:next.centerZ,y:next.height/2,radius:Math.max(3.5,next.width*1.5+1),yaw:Math.PI/3,pitch:.38};
   rebuild(next,{wardrobeBoxStage:'height'});
  }catch(error){tell(error.message);draw();}
  e.preventDefault();
 },{signal});
 topHost.addEventListener('pointercancel',e=>{if(topPan?.id===e.pointerId)topPan=null;if(floorDrag?.id===e.pointerId){floorDrag=null;draw();}},{signal});
 topHost.addEventListener('wheel',e=>{
  if(view!=='top')return;
  const svg=topHost.querySelector('#wardrobe-top-svg'),point=topViewPoint(svg,e);if(!point)return;
  const v=topViewport,factor=e.deltaY>0?1.12:.88,w=Math.max(1.4,Math.min(18,v[2]*factor)),scale=w/v[2];
  topViewport=[point.x-(point.x-v[0])*scale,point.z-(point.z-v[1])*scale,w,v[3]*scale];
  draw();e.preventDefault();
 },{signal,passive:false});
 const heightHandle=container.querySelector('#wardrobe-extrude-handle');
 heightHandle.addEventListener('pointerdown',e=>{
  if(stage!=='height'||e.button!==0)return;
  heightDrag={id:e.pointerId,at:e.clientY,original:extrudeHeight};
  try{heightHandle.setPointerCapture(e.pointerId);}catch{}
  e.preventDefault();
 },{signal});
 heightHandle.addEventListener('pointermove',e=>{
  if(!heightDrag||heightDrag.id!==e.pointerId)return;
  setExtrusionHeight((heightDrag.original+(heightDrag.at-e.clientY)*.008)*100);
  e.preventDefault();
 },{signal});
 const stopHeight=e=>{if(heightDrag?.id===e.pointerId)heightDrag=null;};
 heightHandle.addEventListener('pointerup',stopHeight,{signal});
 heightHandle.addEventListener('pointercancel',stopHeight,{signal});
 container.addEventListener('input',e=>{
  if(e.target.matches('[data-w-height]')&&stage==='height')setExtrusionHeight(e.target.value);
 },{signal});
 container.addEventListener('click',e=>{
  const frontTarget=view==='front'?e.target.closest('[data-w-front-id]'):null;
  if(frontTarget){selected=frontTarget.dataset.wFrontId;selectedBayKey=current().find(f=>f.id===selected)?.wardrobeBay||null;renderer.setSelection(selected);draw();return;}
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
   if(action==='view'){
    if(stage==='floor'&&button.dataset.view!=='top'){tell('اول با موس یک مستطیل روی پلان کف بکش.');return;}
    if(stage==='height'&&button.dataset.view!=='3d'){tell('ارتفاع باکس را مشخص و تأیید کن.');return;}
    view=button.dataset.view;draw();if(view==='3d')renderer.renderPreview();return;
   }
   if(action==='finish-box')return finishBoxHeight();
   if(action==='redraw-box'){stage='floor';view='top';update(current(),{scenePatch:{wardrobeBoxStage:'floor'}});return;}
   if(action==='draw-tool'){drawTool=button.dataset.tool;draw();return;}
   if(action==='selected-mirror'){
    const f=current().find(o=>o.id===selected&&o.subtype==='door'&&o.wardrobeBay);
    if(!f)throw Error('ابتدا یک در کمد را انتخاب کن.');
    const b=config().bays.find(o=>o.key===f.wardrobeBay),mirrors=[...(b.mirrors||[])];mirrors[f.part]=!f.mirror;
    return rebuild(editWardrobeBay(config(),b.key,{mirrors}));
   }
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
 // Desktop keyboard controls share the same semantic wardrobe edits as the buttons.
 const stopKeyboardPan=()=>{spaceHeld=false;topPan=null;if(renderer)renderer.keyboardPan=false;container.classList.remove('space-pan');};
 document.addEventListener('keydown',e=>{
  if(!container.isConnected||disposed)return;
  if((e.key==='Enter'||e.code==='NumpadEnter')&&e.target.closest?.('[data-w-height]')){
   setExtrusionHeight(e.target.value);finishBoxHeight();e.preventDefault();return;
  }
  if((e.key==='Enter'||e.code==='NumpadEnter')&&e.target.closest?.('[data-w-field]')){
   const bay=e.target.closest('[data-w-bay]'),apply=bay?.querySelector('[data-w-action="bay-apply"]')||container.querySelector('[data-w-action="dimensions"]');
   apply?.click();e.preventDefault();return;
  }
  const command=desktopCommand(e);
  if(!command)return;
  if(e.repeat&&['delete','confirm','open'].includes(command))return;
  const stop=()=>e.preventDefault();
  try{
   if(command==='pan'){
    spaceHeld=true;container.classList.add('space-pan');
    if(view==='3d')renderer.keyboardPan=true;
    return stop();
   }
   if(command==='undo'||command==='redo'){history(command==='redo');return stop();}
   if(command==='save'){checkCurrent();persist();tell('پروژه ذخیره شد.');return stop();}
   if(command==='confirm'){if(stage==='height')finishBoxHeight();return stop();}
   if(command==='cancel'){
    if(floorDrag){floorDrag=null;draw();}
    else if(stage==='height'){history(false);}
    else{selected=null;selectedBayKey=null;drawTool='select';renderer.setSelection(null);draw();}
    return stop();
   }
   if(command==='delete'){
    if(stage==='height'){history(false);return stop();}
    if(stage==='floor'){floorDrag=null;draw();return stop();}
    const f=current().find(o=>o.id===selected&&o.kind==='front');
    if(f&&!f.wardrobeInternal){
     selected=null;selectedBayKey=f.wardrobeBay;
     rebuild(editWardrobeBay(config(),f.wardrobeBay,{role:'open-shelves'}));return stop();
    }
    if(selectedBayKey){
     const bays=config().bays,index=bays.findIndex(b=>b.key===selectedBayKey);
     const key=index===bays.length-1?bays[index-1]?.key:selectedBayKey;
     if(key){selected=null;selectedBayKey=null;rebuild(joinWardrobeBay(config(),key));}
    }
    return stop();
   }
   if(command==='box'){
    stage='floor';view='top';update(current(),{scenePatch:{wardrobeBoxStage:'floor'}});return stop();
   }
   if(['top','front','three','front-doors','wall','upper'].includes(command)){
    const next=command==='top'?'top':command==='front'||command==='wall'?'inside':command==='front-doors'||command==='upper'?'front':'3d';
    if(stage==='floor'&&next!=='top'){tell('اول باکس کف را بکش.');return stop();}
    if(stage==='height'&&next!=='3d'){tell('ارتفاع باکس را تأیید کن.');return stop();}
    view=next;draw();if(view==='3d')renderer.renderPreview();return stop();
   }
   if(command==='select'){drawTool='select';selected=null;selectedBayKey=null;renderer.setSelection(null);draw();return stop();}
   if(command==='elevation'){view='front';draw();return stop();}
   if(command==='open'){
    const front=current().find(o=>o.id===selected&&o.kind==='front');
    if(front)update(setWardrobeOpening(current(),front.id,!(front.openFraction>.5)),{opening:true});
    return stop();
   }
   if(command==='fit'){if(view==='3d'){renderer.fitPreview();renderer.renderPreview();}else if(view==='top'){topViewport=[-3.5,-2.5,7,5];draw();}return stop();}
   if(command==='zoom-in'||command==='zoom-out'){
    const factor=command==='zoom-in'?.84:1.19;
    if(view==='3d'&&renderer.previewOrbit){
     renderer.previewOrbit.radius=Math.max(1.5,Math.min(25,renderer.previewOrbit.radius*factor));renderer.renderPreview();
    }else if(view==='top'){
     const v=topViewport,w=Math.max(1.4,Math.min(18,v[2]*factor)),scale=w/v[2];
     topViewport=[v[0]+v[2]*(1-scale)/2,v[1]+v[3]*(1-scale)/2,w,v[3]*scale];draw();
    }return stop();
   }
  }catch(error){tell(error.message);return stop();}
 },{signal});
 document.addEventListener('keyup',e=>{if(e.code==='Space'||e.key===' ')stopKeyboardPan();},{signal});
 window.addEventListener('blur',stopKeyboardPan,{signal});
 return {dispose(){disposed=true;abort.abort();if(ghost){renderer.previewScene?.remove(ghost);ghost.traverse(o=>{o.geometry?.dispose();o.material?.dispose()});ghost=null;}renderer.stopPreview();},renderer};
}
