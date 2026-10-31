import {FloorAR} from './floor-ar.js?v=arch3';
import * as Geo from './geometry.js?v=arch3';
import {renderPlan,planPoint} from './plan-view.js?v=arch3';
const STORAGE='kitchyar.ui.v2';
const app=document.getElementById('app'),dialogs=document.getElementById('dialog-root'),toastNode=document.getElementById('toast');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=value=>new Date(value).toLocaleDateString('fa-IR',{year:'numeric',month:'short',day:'numeric'});
let projects=[],floor=null,mode='ar',activeTool=null,activeId=null,toastTimer=null,loadError=null;
let selection=null,drawing=null,hover=null,undoStack=[],redoStack=[],dragHandle=null;
const settings={thickness:.12,height:2.8,pointSnap:true,angleSnap:true,gridSnap:true,baseDepth:.6,upperDepth:.35};
try{
 const raw=localStorage.getItem(STORAGE),parsed=raw?JSON.parse(raw):[];
 if(!Array.isArray(parsed))throw Error('ساختار داده معتبر نیست.');
 projects=parsed.filter(p=>p&&typeof p.id==='string'&&typeof p.name==='string');
}catch(error){loadError=error.message;}
const uid=()=>crypto.randomUUID?crypto.randomUUID():'p-'+Date.now()+'-'+Math.random().toString(16).slice(2);
function save(){
 if(loadError)throw Error('خواندن ذخیره قبلی ناموفق بود؛ برای حفظ اطلاعات از بازنویسی جلوگیری شد.');
 localStorage.setItem(STORAGE,JSON.stringify(projects));
}
function touch(id){const p=projects.find(x=>x.id===id);if(p){p.updatedAt=new Date().toISOString();save();}}
function tell(message){clearTimeout(toastTimer);toastNode.textContent=message;toastNode.classList.add('show');toastTimer=setTimeout(()=>toastNode.classList.remove('show'),3400);}
function go(hash,autoAR=false){
 history.pushState({},'',hash);render();
 if(autoAR)beginAR();
}
function closeFloor(){const old=floor;floor=null;if(old)old.stop();}
function createProject(){
 const now=new Date().toISOString();
 const p={id:uid(),name:'آشپزخانه جدید',createdAt:now,updatedAt:now,scene:{items:[]},revision:0};
 projects.unshift(p);save();go('#/editor/'+p.id,true);
}
function welcome(){
 app.innerHTML='<main class="welcome"><img class="welcome-photo" src="https://maxlightner.github.io/tolica-ar/assets/welcome.png" alt=""><div class="welcome-title"><h1>KITCHYAR</h1><p>آشپزخانه را پیش از ساخت ببین.</p></div><div class="welcome-actions"><button class="primary" data-action="projects">پروژه‌های من <span>←</span></button><button data-action="new">＋ ایجاد پروژه جدید</button><span class="wordmark">KITCHYAR</span></div></main>';
}
function projectPage(){
 const sorted=[...projects].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
 app.innerHTML='<div class="page"><header class="page-header"><button class="back" data-action="home">← خانه</button><strong>KITCHYAR</strong><span>۲ / پروژه‌ها</span></header><main class="projects"><div class="page-heading"><span>YOUR WORKSPACE</span><h1>پروژه‌های من</h1><p>هر پروژه، یک فضای مستقل با ذخیره‌سازی محلی.</p></div><div class="project-grid"><button class="new-card" data-action="new"><span>＋</span><strong>پروژه جدید</strong><small>شروع با شناسایی کف در AR</small></button>'+
 sorted.map(p=>'<article class="project-card"><div class="project-art"><div class="room-icon"><i></i><i></i></div></div><div class="project-detail"><h2>'+esc(p.name)+'</h2><p>ویرایش: '+date(p.updatedAt)+'</p><div class="project-actions"><button class="primary" data-action="open" data-id="'+esc(p.id)+'">ورود به ویرایشگر AR</button><button data-action="more" data-id="'+esc(p.id)+'" aria-label="گزینه‌های پروژه">⋯</button></div></div></article>').join('')+
 '</div></main></div>';
}
const categories=[
 ['architecture','معماری','▤'],['cabinets','کابینت','▣'],['equipment','تجهیزات','▥'],
 ['fronts','در و کشو','▦'],['material','متریال','◩'],['decor','دکوری','✦']
];
function editorPage(id){
 const p=projects.find(x=>x.id===id);if(!p){go('#/projects');return;}
 activeId=id;mode='ar';activeTool=null;selection=null;drawing=null;hover=null;undoStack=[];redoStack=[];
 app.innerHTML='<main class="editor-root" id="editor-root"><div class="editor-scene"><div class="scene-grid"></div><div class="plan-host" id="plan-host" hidden></div><div class="drawing-hint" id="drawing-hint" hidden></div><div class="scene-message" id="scene-message"><span class="scan-orbit"></span><h2>آماده شناسایی کف</h2><p>پس از ورود، دوربین روی کف قرار می‌گیرد. برای اسکن به گوشی سازگار با ARCore نیاز است.</p><button data-action="start-ar">فعال‌سازی دوربین AR</button></div></div>'+
 '<header class="editor-header"><button class="editor-back" data-action="projects">← پروژه‌ها</button><div class="editor-name"><strong>'+esc(p.name)+'</strong><span id="save-indicator">ذخیره‌شده روی دستگاه</span></div><div class="mode-switch"><button class="selected" data-action="mode" data-mode="ar">AR</button><button data-action="mode" data-mode="3d">3D</button><button data-action="mode" data-mode="2d">2D</button></div><button class="save-button" data-action="save">ذخیره</button></header>'+
 '<div class="ar-toolbar"><button data-action="menu">منوی کیچیار</button><button data-action="rescan">اسکن مجدد ↻</button><span id="scan-status" role="status">در حال آماده‌سازی دوربین AR…</span></div>'+
 '<aside class="editor-menu" id="editor-menu" hidden><strong>KITCHYAR</strong><button data-action="save">ذخیره پروژه</button><button data-action="projects">مدیریت پروژه‌ها</button><button data-action="close-menu">ادامه ویرایش</button></aside>'+
 '<section class="scan-card" id="scan-card"><div class="scan-head"><strong id="scan-stage">در انتظار اسکن کف</strong><span id="scan-pct">۰٪</span></div><progress id="scan-progress" max="100" value="0"></progress><small>آمادگی بر اساس برخوردهای معتبر و نمونه‌های مستقل است؛ درصد ARCore نیست.</small><div class="scan-info"><span id="scan-hits">برخورد معتبر: ۰</span><span id="anchor-count">Anchor: ۰ / ۵</span></div></section>'+
 '<div class="scan-confirm"><button class="primary" id="confirm-floor" data-action="confirm-floor" disabled>تثبیت این کف</button><div id="calibration" hidden><div class="point-row"><button data-action="point-a">ثبت A</button><button data-action="point-b">ثبت B</button></div><label>فاصله واقعی A تا B (متر)<input type="number" id="real-distance" value="1" min=".1" max="20" step=".01"></label><button data-action="apply-distance">اعمال مقیاس</button></div></div>'+
 '<div class="side-tools"><button data-action="select" aria-label="انتخاب">⌖</button><button data-action="undo" disabled aria-label="بازگشت تغییر">↶</button><button data-action="redo" disabled aria-label="انجام دوباره">↷</button></div>'+
 '<div class="mini-map"><span>پلان زنده</span><div id="mini-plan" class="mini-plan"></div><small id="item-count">هنوز آبجکتی در صحنه نیست</small></div>'+
 '<aside class="object-editor" id="object-editor" hidden></aside><div class="bottom-panel"><div class="tool-sheet" id="tool-sheet" hidden></div><nav class="dock">'+categories.map(([id,name,icon])=>'<button data-action="category" data-category="'+id+'"><span>'+icon+'</span><small>'+name+'</small></button>').join('')+'</nav></div>'+
 '</main>';
 showScene();
}
function render(){
 const hash=location.hash||'#/welcome';
 if(floor)closeFloor();
 if(hash.startsWith('#/editor/'))editorPage(hash.slice(9));
 else if(hash==='#/projects')projectPage();
 else welcome();
}
function arUpdate(data){
 const msg=document.getElementById('scan-status');if(!msg)return;
 msg.textContent=data.message;
 const stage=document.getElementById('scan-stage');
 stage.textContent=data.locked?'کف تثبیت شده':data.ready?'کف آماده تثبیت':'در حال شناسایی کف';
 document.getElementById('scan-pct').textContent=data.progress.toLocaleString('fa-IR')+'٪';
 document.getElementById('scan-progress').value=data.progress;
 document.getElementById('scan-hits').textContent='برخورد معتبر: '+(data.valid||0).toLocaleString('fa-IR');
 document.getElementById('anchor-count').textContent='Anchor: '+(data.anchors||0).toLocaleString('fa-IR')+' / ۵';
 document.getElementById('confirm-floor').disabled=!data.ready||data.locked;
 document.getElementById('calibration').hidden=!data.locked;
 if(data.locked)document.getElementById('scan-card').classList.add('complete');
}
function beginAR(){
 if(!document.getElementById('editor-root')||mode!=='ar')return;
 if(floor?.session)return;
 floor=new FloorAR(document.getElementById('editor-root'),arUpdate,()=>{
  document.getElementById('editor-root')?.classList.remove('ar-live');
  if(mode==='ar')document.getElementById('scan-status').textContent='جلسه AR بسته شد.';
 });
 floor.setItems(currentItems(),selection);
 const pending=floor.start();
 pending.then(()=>{document.getElementById('editor-root')?.classList.add('ar-live');})
  .catch(error=>{
   const detail=String(error?.message||'');
   const unsupported=/not supported|no XR hardware|not found|not available|unsupported/i.test(detail);
   document.getElementById('scan-status').textContent=unsupported?'این دستگاه یا مرورگر از AR پشتیبانی نمی‌کند. برای شناسایی کف، Chrome در گوشی سازگار با ARCore را باز کن.':'راه‌اندازی AR ناموفق بود: '+detail;
   document.getElementById('scene-message')?.classList.add('visible');
  });
}
function projectMenu(id){
 const p=projects.find(x=>x.id===id);if(!p)return;
 dialogs.innerHTML='<div class="dialog-cover"><div class="dialog"><h2>'+esc(p.name)+'</h2><button data-action="rename" data-id="'+esc(id)+'">تغییر نام</button><button data-action="copy" data-id="'+esc(id)+'">ایجاد کپی</button><button class="danger" data-action="delete" data-id="'+esc(id)+'">حذف پروژه</button><button data-action="close-dialog">بستن</button></div></div>';
}
function rename(id){
 const p=projects.find(x=>x.id===id);if(!p)return;
 dialogs.innerHTML='<div class="dialog-cover"><form id="rename-form" class="dialog"><h2>تغییر نام پروژه</h2><input id="rename-input" maxlength="65" required value="'+esc(p.name)+'"><button class="primary" type="submit">ذخیره نام</button><button type="button" data-action="close-dialog">انصراف</button></form></div>';
 const form=document.getElementById('rename-form');form.onsubmit=e=>{
  e.preventDefault();p.name=document.getElementById('rename-input').value.trim()||p.name;touch(id);dialogs.innerHTML='';projectPage();};
}
function remove(id){
 const p=projects.find(x=>x.id===id);if(!p)return;
 dialogs.innerHTML='<div class="dialog-cover"><div class="dialog"><h2>حذف پروژه</h2><p>پروژه «'+esc(p.name)+'» از این دستگاه حذف می‌شود.</p><button class="danger" data-action="confirm-delete" data-id="'+esc(id)+'">حذف قطعی</button><button data-action="close-dialog">انصراف</button></div></div>';
}

const currentProject=()=>projects.find(p=>p.id===activeId);
const currentItems=()=>currentProject()?.scene?.items||[];
const num=(v,d=2)=>Number(v).toLocaleString('fa-IR',{maximumFractionDigits:d});
const value=(name,defaultValue)=>Number(document.querySelector('[data-edit="'+name+'"]')?.value??defaultValue);
function drawTools(){
 const sheet=document.getElementById('tool-sheet');if(!sheet)return;
 sheet.hidden=!activeTool;if(!activeTool)return;
 const tools=activeTool==='architecture'?[['wall','دیوار'],['window','پنجره ثابت'],['door','در']]:
  activeTool==='cabinets'?[['base','کابینت زمینی'],['upper','کابینت هوایی']]:[];
 if(!tools.length){sheet.innerHTML='<span>ابزارهای این بخش در مرحله بعد اضافه می‌شوند.</span><button data-action="hide-tools">بستن</button>';return;}
 const wallTools=activeTool==='architecture';
 sheet.innerHTML='<div class="tool-choices">'+tools.map(([id,label])=>
  '<button class="'+(drawing?.tool===id?'active':'')+'" data-action="tool" data-tool="'+id+'">'+label+'</button>').join('')+
  '<button data-action="select">انتخاب</button></div>'+
  (wallTools?'<div class="tool-settings"><label>ضخامت دیوار (متر)<input data-setting="thickness" type="number" min=".07" max=".8" step=".01" value="'+settings.thickness+'"></label>'+
   '<label>ارتفاع (متر)<input data-setting="height" type="number" min=".4" max="9" step=".1" value="'+settings.height+'"></label></div>':
   '<div class="tool-settings"><label>عمق زمینی (متر)<input data-setting="baseDepth" type="number" min=".2" max="1.2" step=".05" value="'+settings.baseDepth+'"></label>'+
   '<label>عمق هوایی (متر)<input data-setting="upperDepth" type="number" min=".2" max="1.2" step=".05" value="'+settings.upperDepth+'"></label></div>')+
  '<div class="snap-options"><label><input type="checkbox" data-setting="pointSnap" '+(settings.pointSnap?'checked':'')+'> اسنپ نقطه</label>'+
  '<label><input type="checkbox" data-setting="angleSnap" '+(settings.angleSnap?'checked':'')+'> زاویه ۴۵°</label>'+
  '<label><input type="checkbox" data-setting="gridSnap" '+(settings.gridSnap?'checked':'')+'> شبکه ۱۰ سانتی</label>'+
  '<button data-action="finish-line">پایان ترسیم</button></div>';
}
function drawSelection(){
 const panel=document.getElementById('object-editor');if(!panel)return;
 const obj=currentItems().find(x=>x.id===selection);
 panel.hidden=!obj;if(!obj)return;
 const field=(key,title,val,min,step='.01')=>'<label>'+title+'<input type="number" data-edit="'+key+'" value="'+Number(val).toFixed(2)+'" min="'+min+'" step="'+step+'"></label>';
 let fields='',title=obj.name;
 if(obj.kind==='wall')fields=field('length','طول (متر)',Geo.lengthOf(obj),.1)+field('thickness','ضخامت (متر)',obj.thickness,.07)+field('height','ارتفاع (متر)',obj.height,.4);
 if(obj.kind==='opening'){
  const host=currentItems().find(x=>x.id===obj.hostId);
  fields=field('width','عرض (متر)',obj.width,.3)+field('height','ارتفاع (متر)',obj.height,.3)+
   field('sill','ارتفاع نصب (متر)',obj.sill,0)+field('offset','فاصله از ابتدای دیوار',obj.hostT*Geo.lengthOf(host),.1);
 }
 if(obj.kind==='cabinet')fields=field('length','طول (متر)',Geo.lengthOf(obj),.3)+
  field('depth','عمق (متر)',obj.depth,.2)+field('height','ارتفاع (متر)',obj.height,.25)+
  field('elevation','ارتفاع از کف (متر)',obj.elevation,0);
 panel.innerHTML='<div class="object-head"><strong>'+esc(title)+'</strong><button data-action="close-object" aria-label="بستن">×</button></div>'+
  '<div class="object-fields">'+fields+'</div><div class="object-actions"><button class="primary" data-action="apply-edit">اعمال ابعاد</button>'+
  '<button class="danger" data-action="delete-object">حذف</button></div>'+
  (obj.kind==='wall'?'<small>نقاط سبز در پلان برای ویرایش گره‌های متصل قابل جابه‌جایی‌اند.</small>':'');
}
function showScene(){
 const root=document.getElementById('editor-root');if(!root)return;
 const items=currentItems(),host=document.getElementById('plan-host');
 const isPlan=mode==='2d';host.hidden=!isPlan;
 if(isPlan){
  host.innerHTML=renderPlan(items,{selectedId:selection,drawing:drawing?.start||null,hover});
  document.getElementById('scene-message').classList.add('hide-for-plan');
 }else {
  host.innerHTML='';
  document.getElementById('scene-message').classList.remove('hide-for-plan');
 }
 document.getElementById('mini-plan').innerHTML=renderPlan(items,{mini:true});
 document.getElementById('item-count').textContent=items.length?num(items.length,0)+' عنصر در صحنه':'هنوز آبجکتی در صحنه نیست';
 const hint=document.getElementById('drawing-hint');
 hint.hidden=!drawing;
 if(drawing){
  const name={wall:'دیوار',window:'پنجره ثابت',door:'در',base:'کابینت زمینی',upper:'کابینت هوایی'}[drawing.tool];
  const length=drawing.start&&hover?Math.hypot(hover.x-drawing.start.x,hover.z-drawing.start.z):null;
  hint.textContent=name+' — '+(drawing.start?'نقطه بعدی را بزن':'نقطه شروع را انتخاب کن')+
   (length!==null?' · '+num(length)+' متر':'');
 }
 floor?.setItems(items,selection);
 floor?.setDrawing(drawing?.start||null,drawing?.tool);
 const buttons=document.querySelectorAll('[data-action="undo"],[data-action="redo"]');
 buttons.forEach(b=>b.disabled=b.dataset.action==='undo'?!undoStack.length:!redoStack.length);
 drawSelection();drawTools();
}
function commitChange(result){
 if(!result||!Array.isArray(result.items))throw Error('تغییر هندسه معتبر نیست.');
 const p=currentProject();if(!p)return;
 undoStack.push(structuredClone(currentItems()));if(undoStack.length>60)undoStack.shift();redoStack=[];
 p.scene??={items:[]};p.scene.items=result.items;p.updatedAt=new Date().toISOString();p.revision=(p.revision||0)+1;
 save();selection=result.selectedId||null;showScene();
}
function undoChange(redo=false){
 const source=redo?redoStack:undoStack,dest=redo?undoStack:redoStack;if(!source.length)return;
 const p=currentProject();dest.push(structuredClone(currentItems()));p.scene.items=source.pop();
 p.updatedAt=new Date().toISOString();save();selection=null;drawing=null;showScene();
}
function selectAt(point,target){
 const items=currentItems(),id=target?.closest?.('[data-item-id]')?.dataset.itemId;
 let hit=items.find(x=>x.id===id);
 if(!hit&&point){
  const near=Geo.nearestWall(items,point.x,point.z,.30);
  hit=near?.wall||items.filter(x=>x.kind==='cabinet')
   .map(x=>({obj:x,d:Geo.projectOnWall(x,point.x,point.z).distance})).filter(x=>x.d<.35).sort((a,b)=>a.d-b.d)[0]?.obj;
 }
 selection=hit?.id||null;showScene();
}
function placeAt(point){
 if(!drawing||!point)return;
 const items=currentItems(),tool=drawing.tool;
 if(tool==='window'||tool==='door'){
  const near=Geo.nearestWall(items,point.x,point.z,.55);
  if(!near){tell('نشانگر را روی دیوار میزبان قرار بده.');return;}
  const result=Geo.placeOpening(items,near.wall.id,point.x,point.z,{style:tool==='door'?'door':'fixed'});
  commitChange(result);drawing={tool,start:null};showScene();return;
 }
 if(!drawing.start){
  const p=Geo.resolvePoint(items,null,point.x,point.z,settings);
  drawing.start={x:p.x,z:p.z};selection=null;showScene();return;
 }
 const end=Geo.resolvePoint(items,drawing.start,point.x,point.z,settings);
 const a=drawing.start,b={x:end.x,z:end.z};
 const result=tool==='wall'?Geo.placeWall(items,a,b,{thickness:settings.thickness,height:settings.height}):
  Geo.placeCabinet(items,a,b,{kind:tool==='upper'?'upper':'base',depth:tool==='upper'?settings.upperDepth:settings.baseDepth});
 commitChange(result);drawing={tool,start:result.end};hover=null;showScene();
}
function finishLine(){
 drawing=null;hover=null;floor?.setDrawing(null);showScene();
}
function applySelection(){
 const obj=currentItems().find(x=>x.id===selection);if(!obj)return;
 let result;
 if(obj.kind==='wall')result=Geo.editWall(currentItems(),obj.id,
  {length:value('length',Geo.lengthOf(obj)),thickness:value('thickness',obj.thickness),height:value('height',obj.height)});
 if(obj.kind==='opening')result=Geo.editOpening(currentItems(),obj.id,
  {width:value('width',obj.width),height:value('height',obj.height),sill:value('sill',obj.sill),
   metresFromStart:value('offset',0)});
 if(obj.kind==='cabinet')result=Geo.editCabinet(currentItems(),obj.id,
  {length:value('length',Geo.lengthOf(obj)),depth:value('depth',obj.depth),
   height:value('height',obj.height),elevation:value('elevation',obj.elevation)});
 if(result)commitChange(result);
}
document.addEventListener('change',e=>{
 const field=e.target.closest('[data-setting]');if(!field)return;
 const name=field.dataset.setting;settings[name]=field.type==='checkbox'?field.checked:Number(field.value);
});
document.addEventListener('pointerdown',e=>{
 const handle=e.target.closest('[data-handle]');if(handle)dragHandle={id:handle.dataset.itemId,start:handle.dataset.handle==='start'};
});
document.addEventListener('pointerup',e=>{
 const scene=e.target.closest('.editor-scene');if(!scene){dragHandle=null;return;}
 if(e.target.closest('[data-action]')){dragHandle=null;return;}
 try{
  const svg=scene.querySelector('#plan-view');
  const point=mode==='2d'?svg?planPoint(svg,e):null:mode==='ar'?floor?.pick():null;
  if(dragHandle){
   if(point)commitChange(Geo.moveEndpoint(currentItems(),dragHandle.id,dragHandle.start,point.x,point.z));
   dragHandle=null;return;
  }
  if(!point){if(mode==='ar'&&drawing)tell('اول کف را در AR تثبیت کن.');return;}
  if(drawing)placeAt(point);else selectAt(point,e.target);
 }catch(error){tell(error.message);dragHandle=null;}
});
document.addEventListener('pointermove',e=>{
 if(mode!=='2d'||!drawing)return;
 const svg=e.target.closest('#plan-view');if(!svg)return;
 const point=planPoint(svg,e);if(!point)return;
 const resolved=Geo.resolvePoint(currentItems(),drawing.start,point.x,point.z,settings);
 hover={x:resolved.x,z:resolved.z};
 // Update only the temporary vector overlay; keep the pointer interaction target stable.
 const previous=svg.querySelector('.live-preview');previous?.remove();
 if(drawing.start){
  const line=document.createElementNS('http://www.w3.org/2000/svg','line');
  for(const [k,v] of Object.entries({x1:drawing.start.x,y1:drawing.start.z,x2:hover.x,y2:hover.z,
   stroke:'#de9f54','stroke-width':'.045','stroke-dasharray':'.14,.07','pointer-events':'none'}))line.setAttribute(k,v);
  line.classList.add('live-preview');svg.appendChild(line);
  const hint=document.getElementById('drawing-hint');if(hint)
   hint.textContent='طول: '+num(Math.hypot(hover.x-drawing.start.x,hover.z-drawing.start.z))+' متر · '+resolved.label;
 }
});

document.addEventListener('click',async e=>{
 const button=e.target.closest('[data-action]');if(!button||button.disabled)return;
 const action=button.dataset.action,id=button.dataset.id;
 try{
  if(action==='home')return go('#/welcome');
  if(action==='projects')return go('#/projects');
  if(action==='new')return createProject();
  if(action==='open')return go('#/editor/'+id,true);
  if(action==='more')return projectMenu(id);
  if(action==='close-dialog'){dialogs.innerHTML='';return;}
  if(action==='rename')return rename(id);
  if(action==='delete')return remove(id);
  if(action==='confirm-delete'){projects=projects.filter(p=>p.id!==id);save();dialogs.innerHTML='';projectPage();return;}
  if(action==='copy'){const p=projects.find(x=>x.id===id),time=new Date().toISOString();
   projects.unshift({...structuredClone(p),id:uid(),name:p.name+' — کپی',createdAt:time,updatedAt:time});
   save();dialogs.innerHTML='';projectPage();return;}
  if(action==='tool'){drawing={tool:button.dataset.tool,start:null};selection=null;showScene();return;}
  if(action==='finish-line'){finishLine();return;}
  if(action==='select'){drawing=null;selection=null;showScene();return;}
  if(action==='undo'){undoChange();return;}
  if(action==='redo'){undoChange(true);return;}
  if(action==='apply-edit'){applySelection();return;}
  if(action==='close-object'){selection=null;showScene();return;}
  if(action==='delete-object'){if(selection){commitChange(Geo.removeObject(currentItems(),selection));selection=null;showScene();}return;}
  if(action==='save'){touch(activeId);document.getElementById('save-indicator').textContent='ذخیره‌شده';return tell('پروژه ذخیره شد.');}
  if(action==='start-ar')return beginAR();
  if(action==='rescan'){if(floor?.session){await floor.scan();document.getElementById('scan-card').classList.remove('complete');document.getElementById('editor-root').classList.remove('floor-locked');}
   else beginAR();return;}
  if(action==='confirm-floor'){if(!floor?.confirm())tell('هنوز کف آماده تثبیت نیست.');else document.getElementById('editor-root').classList.add('floor-locked');return;}
  if(action==='point-a'||action==='point-b'){if(!floor?.capture(action==='point-a'?'a':'b'))tell('نشانگر را روی سطح معتبر قرار بده.');return;}
  if(action==='apply-distance'){floor?.calibrate(document.getElementById('real-distance').value);return;}
  if(action==='menu'){document.getElementById('editor-menu').hidden=!document.getElementById('editor-menu').hidden;return;}
  if(action==='close-menu'){document.getElementById('editor-menu').hidden=true;return;}
  if(action==='mode'){
   const next=button.dataset.mode;if(next===mode)return;mode=next;
   document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.mode===mode));
   if(next==='ar'){document.getElementById('scan-card').hidden=false;document.getElementById('scan-status').textContent='برای شروع اسکن، دوربین AR را فعال کن.';showScene();beginAR();}
   else {closeFloor();document.getElementById('scan-card').hidden=true;document.getElementById('scene-message').classList.add('visible');
    document.getElementById('scene-message').querySelector('h2').textContent=next==='2d'?'پلان دوبعدی':'نمای سه‌بعدی';
    document.getElementById('scene-message').querySelector('p').textContent=next==='2d'?'روی پلان برای ترسیم یا انتخاب آبجکت بزن.':'نمای سه‌بعدی دسکتاپ در مرحله بعد فعال می‌شود.';showScene();}
   return;
  }
  if(action==='category'){
   const kind=button.dataset.category;
   activeTool=activeTool===kind?null:kind;drawing=null;hover=null;
   document.querySelectorAll('[data-category]').forEach(b=>b.classList.toggle('active',b.dataset.category===activeTool));
   showScene();return;
  }
  if(action==='hide-tools'){activeTool=null;drawing=null;showScene();document.querySelectorAll('[data-category]').forEach(b=>b.classList.remove('active'));return;}
 }catch(error){tell(error.message);}
});
window.addEventListener('popstate',render);window.addEventListener('hashchange',render);
if(loadError)tell('خطا در اطلاعات قبلی؛ داده‌ها دست‌نخورده باقی مانده‌اند.');
render();
