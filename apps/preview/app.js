import {FloorAR} from './floor-ar.js?v=render11';
import * as Geo from './geometry.js?v=render11';
import {renderPlan,renderPreview,planPoint} from './plan-view.js?v=render11';
import {resizeFromHandle,handlePosition,renderElevation} from './edit-handles.js?v=render11';
const STORAGE='kitchyar.ui.v2';
const app=document.getElementById('app'),dialogs=document.getElementById('dialog-root'),toastNode=document.getElementById('toast');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=value=>new Date(value).toLocaleDateString('fa-IR',{year:'numeric',month:'short',day:'numeric'});
let projects=[],floor=null,mode='ar',activeTool=null,activeId=null,toastTimer=null,loadError=null;
let selection=null,drawing=null,hover=null,undoStack=[],redoStack=[],dragHandle=null;
const settings={thickness:.12,height:2.8,pointSnap:true,angleSnap:true,gridSnap:true,baseDepth:.6,upperDepth:.35};
const defaultRender={sunAzimuth:-40,sunElevation:55,sunIntensity:2.1,ambientIntensity:1.0,aoStrength:.65,reflection:.10};
const renderSettings=()=>({...defaultRender,...currentProject()?.scene?.render});
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
 const p={id:uid(),name:'آشپزخانه جدید',createdAt:now,updatedAt:now,scene:{items:[],render:{...defaultRender}},revision:0};
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
 app.innerHTML='<main class="editor-root" id="editor-root"><div class="editor-scene"><div class="scene-grid"></div><div class="plan-host" id="plan-host" hidden></div><div class="drawing-hint" id="drawing-hint" hidden></div><aside class="elevation-panel" id="elevation-panel" hidden></aside><div class="scene-message" id="scene-message"><span class="scan-orbit"></span><h2>آماده شناسایی کف</h2><p>پس از ورود، دوربین روی کف قرار می‌گیرد. برای اسکن به گوشی سازگار با ARCore نیاز است.</p><button data-action="start-ar">فعال‌سازی دوربین AR</button></div></div>'+
 '<header class="editor-header"><button class="editor-back" data-action="projects">← پروژه‌ها</button><div class="editor-name"><strong>'+esc(p.name)+'</strong><span id="save-indicator">ذخیره‌شده روی دستگاه</span></div><div class="mode-switch"><button class="selected" data-action="mode" data-mode="ar">AR</button><button data-action="mode" data-mode="3d">3D</button><button data-action="mode" data-mode="2d">2D</button></div><button class="save-button" data-action="save">ذخیره</button></header>'+
 '<div class="ar-toolbar"><button data-action="menu">منوی کیچیار</button><button data-action="rescan">اسکن مجدد ↻</button><span id="scan-status" role="status">در حال آماده‌سازی دوربین AR…</span></div>'+
 '<aside class="editor-menu" id="editor-menu" hidden><strong>KITCHYAR · تنظیمات رندر</strong><label>جهت نور (درجه)<input data-render="sunAzimuth" type="range" min="-180" max="180" value="'+renderSettings().sunAzimuth+'"></label><label>ارتفاع نور (درجه)<input data-render="sunElevation" type="range" min="10" max="85" value="'+renderSettings().sunElevation+'"></label><label>شدت نور جهت‌دار<input data-render="sunIntensity" type="range" min=".3" max="4" step=".1" value="'+renderSettings().sunIntensity+'"></label><label>شدت اکلوژن محیطی<input data-render="aoStrength" type="range" min="0" max="1" step=".05" value="'+renderSettings().aoStrength+'"></label><div class="render-note">بازتاب کابینت ۱۰٪ · کف سفید ۵۰٪ · سایه نرم</div><button data-action="save">ذخیره پروژه</button><button data-action="projects">مدیریت پروژه‌ها</button><button data-action="close-menu">ادامه ویرایش</button></aside>'+
 '<section class="scan-card" id="scan-card"><div class="scan-head"><strong id="scan-stage">در انتظار اسکن کف</strong><span id="scan-pct">۰٪</span></div><progress id="scan-progress" max="100" value="0"></progress><small>آمادگی بر اساس برخوردهای معتبر و نمونه‌های مستقل است؛ درصد ARCore نیست.</small><div class="scan-info"><span id="scan-hits">برخورد معتبر: ۰</span><span id="anchor-count">Anchor: ۰ / ۵</span></div></section>'+
 '<div class="scan-confirm"><button class="primary" id="confirm-floor" data-action="confirm-floor" disabled>تثبیت این کف</button><div id="calibration" hidden><div class="point-row"><button data-action="point-a">ثبت A</button><button data-action="point-b">ثبت B</button></div><label>فاصله واقعی A تا B (متر)<input type="number" id="real-distance" value="1" min=".1" max="20" step=".01"></label><button data-action="apply-distance">اعمال مقیاس</button></div></div>'+
 '<div class="side-tools"><div class="side-basic"><button data-action="select" aria-label="انتخاب">⌖</button><button data-action="undo" disabled aria-label="بازگشت تغییر">↶</button><button data-action="redo" disabled aria-label="انجام دوباره">↷</button></div><div id="draw-controls" class="draw-controls" hidden><strong>کنترل ترسیم</strong><button data-action="record-start">ثبت نقطه شروع</button><button class="primary" data-action="record-end">ثبت نقطه پایان / نصب</button><button data-action="cancel-start">لغو نقطه شروع</button><button data-action="finish-line">پایان ترسیم</button></div></div><div class="aim-marker" id="aim-marker" hidden><span>＋</span><small id="aim-label">محل ترسیم</small></div>'+
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
 msg.textContent=data.message+(data.depth?' · اکلوژن عمق واقعی فعال':'');
 const stage=document.getElementById('scan-stage');
 stage.textContent=data.locked?'کف تثبیت شده':data.ready?'کف آماده تثبیت':'در حال شناسایی کف';
 document.getElementById('scan-pct').textContent=data.progress.toLocaleString('fa-IR')+'٪';
 document.getElementById('scan-progress').value=data.progress;
 document.getElementById('scan-hits').textContent='برخورد معتبر: '+(data.valid||0).toLocaleString('fa-IR');
 document.getElementById('anchor-count').textContent='Anchor: '+(data.anchors||0).toLocaleString('fa-IR')+' / ۵';
 document.getElementById('confirm-floor').disabled=!data.ready||data.locked;
 document.getElementById('calibration').hidden=!data.locked;
 if(data.locked&&document.getElementById('ab-status'))
  document.getElementById('ab-status').textContent=data.direction===null||data.direction===undefined?
   'نقاط A و B را روی کف جابه‌جا کن؛ جهت شبکه تابع خط A—B است.':
   'جهت شبکه: '+num(data.direction,0)+'° · نقطه A مبدأ و B جهت را تعیین می‌کند.';
 if(data.locked)document.getElementById('scan-card').classList.add('complete');
}
function beginAR(){
 if(!document.getElementById('editor-root')||mode!=='ar')return;
 if(floor?.session)return;
 floor=new FloorAR(document.getElementById('editor-root'),arUpdate,()=>{
  document.getElementById('editor-root')?.classList.remove('ar-live');
  if(mode==='ar')document.getElementById('scan-status').textContent='جلسه AR بسته شد.';
 });
 floor.setItems(currentItems(),selection);floor.setLighting(renderSettings());
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
  activeTool==='cabinets'?[['base','کابینت زمینی'],['upper','کابینت هوایی']]:
  activeTool==='equipment'?[['fridge','یخچال'],['stove','اجاق گاز'],['sink','سینک']]:[];
 if(!tools.length){sheet.innerHTML='<span>ابزارهای این بخش در مرحله بعد اضافه می‌شوند.</span><button data-action="hide-tools">بستن</button>';return;}
 const wallTools=activeTool==='architecture';
 sheet.innerHTML='<div class="tool-choices">'+tools.map(([id,label])=>
  '<button class="'+(drawing?.tool===id?'active':'')+'" data-action="tool" data-tool="'+id+'">'+label+'</button>').join('')+
  '<button data-action="select">انتخاب</button></div>'+
  (activeTool==='equipment'?'<p class="equipment-help">یخچال روی کف قرار می‌گیرد؛ گاز و سینک روی کابینت زمینی نصب می‌شوند.</p>':wallTools?'<div class="tool-settings"><label>ضخامت دیوار (متر)<input data-setting="thickness" type="number" min=".07" max=".8" step=".01" value="'+settings.thickness+'"></label>'+
   '<label>ارتفاع (متر)<input data-setting="height" type="number" min=".4" max="9" step=".1" value="'+settings.height+'"></label></div>':
   '<div class="tool-settings"><label>عمق زمینی (متر)<input data-setting="baseDepth" type="number" min=".2" max="1.2" step=".05" value="'+settings.baseDepth+'"></label>'+
   '<label>عمق هوایی (متر)<input data-setting="upperDepth" type="number" min=".2" max="1.2" step=".05" value="'+settings.upperDepth+'"></label></div>')+
  '<div class="snap-options"><label><input type="checkbox" data-setting="pointSnap" '+(settings.pointSnap?'checked':'')+'> اسنپ نقطه</label>'+
  '<label><input type="checkbox" data-setting="angleSnap" '+(settings.angleSnap?'checked':'')+'> زاویه ۴۵°</label>'+
  '<label><input type="checkbox" data-setting="gridSnap" '+(settings.gridSnap?'checked':'')+'> شبکه ۱۰ سانتی</label>'+
  '</div>';
}
function drawSelection(){
 const panel=document.getElementById('object-editor');if(!panel)return;
 const obj=currentItems().find(x=>x.id===selection);
 panel.hidden=!obj||!!drawing;if(!obj||drawing)return;
 const field=(key,title,val,min,step='.01')=>'<label>'+title+'<input type="number" data-edit="'+key+'" value="'+Number(val).toFixed(2)+'" min="'+min+'" step="'+step+'"></label>';
 let fields='',title=obj.name;
 if(obj.kind==='wall')fields=field('length','طول (متر)',Geo.lengthOf(obj),.1)+field('thickness','ضخامت (متر)',obj.thickness,.07)+field('height','ارتفاع (متر)',obj.height,.4);
 if(obj.kind==='opening'){
  const host=currentItems().find(x=>x.id===obj.hostId);
  fields=field('width','عرض (متر)',obj.width,.3)+field('height','ارتفاع (متر)',obj.height,.3)+
   field('sill','ارتفاع نصب (متر)',obj.sill,0)+field('offset','فاصله از ابتدای دیوار',obj.hostT*Geo.lengthOf(host),.1);
  if(obj.style==='door')fields+=field('openFraction','میزان بازشدن در (۰ تا ۱)',obj.openFraction||0,0,'.05')+
   '<label class="check-row">جهت لولا<input type="checkbox" data-edit="mirrored" '+(obj.mirrored?'checked':'')+'></label>';
 }
 if(obj.kind==='equipment')fields=field('width','عرض (متر)',obj.width,.30)+field('depth','عمق (متر)',obj.depth,.20)+field('height','ارتفاع (متر)',obj.height,.04);
 if(obj.kind==='cabinet')fields=field('length','طول (متر)',obj.hostId?(obj.endT-obj.startT)*Geo.lengthOf(currentItems().find(x=>x.id===obj.hostId)):Geo.lengthOf(obj),.3)+
  field('depth','عمق (متر)',obj.depth,.2)+field('height','ارتفاع (متر)',obj.height,.25)+
  field('elevation','ارتفاع از کف (متر)',obj.elevation,0);
 panel.innerHTML='<div class="object-head"><strong>'+esc(title)+'</strong><button data-action="close-object" aria-label="بستن">×</button></div>'+
  '<div class="object-fields">'+fields+'</div><div class="object-actions"><button class="primary" data-action="apply-edit">اعمال ابعاد</button>'+
  '<button class="danger" data-action="delete-object">حذف</button></div>'+
  (['wall','cabinet','opening'].includes(obj.kind)?'<small>دستگیره‌ها را بکش؛ اندازه‌گذاری هنگام حرکت نمایش داده می‌شود و پس از رها کردن، با دقت ۱ سانتی‌متر ثبت می‌شود.</small>':'');
}
function showScene(){
 const root=document.getElementById('editor-root');if(!root)return;
 const items=currentItems(),host=document.getElementById('plan-host');
 const isPlan=mode==='2d';host.hidden=!isPlan;
 if(isPlan){
  host.innerHTML=renderPlan(items,{selectedId:selection,drawing,hover});
  document.getElementById('scene-message').classList.add('hide-for-plan');
 }else {
  host.innerHTML='';
  document.getElementById('scene-message').classList.remove('hide-for-plan');
 }
 const elevation=document.getElementById('elevation-panel');
 if(elevation){
  const opening=items.find(o=>o.id===selection&&o.kind==='opening');
  elevation.hidden=!isPlan||!opening||!!drawing;
  elevation.innerHTML=elevation.hidden?'':renderElevation(items,opening);
 }
 document.getElementById('mini-plan').innerHTML=renderPlan(items,{mini:true});
 document.getElementById('item-count').textContent=items.length?num(items.length,0)+' عنصر در صحنه':'هنوز آبجکتی در صحنه نیست';
 const hint=document.getElementById('drawing-hint');
 hint.hidden=!drawing;
 if(drawing){
  const name={wall:'دیوار',window:'پنجره ثابت',door:'در',base:'کابینت زمینی',upper:'کابینت هوایی',fridge:'یخچال',stove:'اجاق گاز',sink:'سینک'}[drawing.tool];
  const length=drawing.start&&hover?Math.hypot(hover.x-drawing.start.x,hover.z-drawing.start.z):null;
  hint.textContent=name+' — '+(drawing.start?'نقطه پایان را ثبت کن':'پیش‌نمایش را بررسی و نقطه شروع را ثبت کن')+
   (length!==null?' · '+num(length)+' متر':'');
 }
 floor?.setItems(items,selection);
 floor?.setDrawing(drawing?.start||null,drawing?.tool);
 floor?.setLighting(renderSettings());
 const controls=document.getElementById('draw-controls');if(controls){
  controls.hidden=!drawing;
  const single=['window','door','fridge','stove','sink'].includes(drawing?.tool);
  controls.querySelector('[data-action="record-start"]').disabled=!drawing||!!drawing.start||single;
  controls.querySelector('[data-action="record-end"]').disabled=!drawing||(!drawing.start&&!single);
  controls.querySelector('[data-action="record-end"]').textContent=single?'نصب / افزودن':'ثبت نقطه پایان';
 }
 const marker=document.getElementById('aim-marker');if(marker){
  marker.hidden=!drawing||mode!=='ar';
  marker.classList.toggle('upper',drawing?.tool==='upper');
  document.getElementById('aim-label').textContent=drawing?.tool==='upper'?'لبه کابینت هوایی · یک‌سوم بالای صفحه':'کنج دیوار / کابینت · یک‌سوم پایین صفحه';
 }

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
function selectAt(point,target,arId=null){
 const items=currentItems(),id=arId||target?.closest?.('[data-item-id]')?.dataset.itemId;
 let hit=items.find(x=>x.id===id);
 if(!hit&&point){
  hit=items.filter(x=>x.kind==='equipment').map(o=>({o,d:Math.hypot(point.x-o.x,point.z-o.z)}))
   .filter(p=>p.d<Math.max(p.o.width,p.o.depth)*.7).sort((a,b)=>a.d-b.d)[0]?.o;
 }
 if(!hit&&point){
  const near=Geo.nearestWall(items,point.x,point.z,.30);
  hit=near?.wall||items.filter(x=>x.kind==='cabinet')
   .map(x=>({obj:x,d:Geo.projectOnWall(x,point.x,point.z).distance})).filter(x=>x.d<.35).sort((a,b)=>a.d-b.d)[0]?.obj;
 }
 selection=hit?.id||null;showScene();
}
function initialPreviewForTool(tool){
 if(tool==='wall'||tool==='fridge')return {x:0,z:0};
 if(tool==='stove'||tool==='sink'){
  const c=currentItems().find(x=>x.kind==='cabinet'&&x.subtype==='base');
  return c?{x:(c.x1+c.x2)/2,z:(c.z1+c.z2)/2}:null;
 }
 const w=currentItems().find(x=>x.kind==='wall');
 if(!w)return null;
 return {x:(w.x1+w.x2)/2,z:(w.z1+w.z2)/2};
}
function placeAt(point){
 if(!drawing||!point)return;
 const items=currentItems(),tool=drawing.tool;
 if(['fridge','stove','sink'].includes(tool)){
  commitChange(Geo.placeEquipment(items,point,tool));drawing={tool,start:null};hover=point;showScene();return;
 }
 if(tool==='window'||tool==='door'){
  const near=Geo.nearestWall(items,point.x,point.z,.60);
  if(!near){tell('برای نصب در یا پنجره باید نشانگر روی دیوار باشد.');return;}
  const result=Geo.placeOpening(items,near.wall.id,point.x,point.z,{style:tool==='door'?'door':'fixed'});
  commitChange(result);drawing={tool,start:null};showScene();return;
 }
 if(!drawing.start){
  if(tool==='base'||tool==='upper'){
   const near=Geo.nearestWall(items,point.x,point.z,.60);
   if(!near){tell('اول دیوار بکش؛ شروع کابینت فقط روی دیوار ممکن است.');return;}
   const w=near.wall,cross=(point.x-w.x1)*(w.z2-w.z1)-(point.z-w.z1)*(w.x2-w.x1);
   drawing.start={x:near.x,z:near.z,hostId:w.id,side:Math.abs(cross)<.01?1:cross>0?-1:1};
  }else{
   const p=Geo.resolvePoint(items,null,point.x,point.z,settings);
   drawing.start={x:p.x,z:p.z};
  }
  selection=null;showScene();return;
 }
 let a=drawing.start,b;
 if(tool==='wall'){
  const end=Geo.resolvePoint(items,a,point.x,point.z,settings);
  b={x:end.x,z:end.z};
 }else{
  const host=items.find(w=>w.id===a.hostId);
  if(!host)throw Error('دیوار میزبان دیگر وجود ندارد.');
  const near=Geo.projectOnWall(host,point.x,point.z);
  if(near.distance>.65)throw Error('نقطه پایان باید روی همان دیوار میزبان باشد.');
  b={x:near.x,z:near.z};
 }
 const result=tool==='wall'?Geo.placeWall(items,a,b,{thickness:settings.thickness,height:settings.height}):
  Geo.placeCabinet(items,a,b,{kind:tool==='upper'?'upper':'base',depth:tool==='upper'?settings.upperDepth:settings.baseDepth});
 commitChange(result);drawing={tool,start:result.end};hover=null;showScene();
}
function controlPoint(){
 if(mode==='ar')return floor?.pick()||null;
 if(mode==='2d'){
  if(hover)return hover;
  const svg=document.getElementById('plan-view'),marker=document.getElementById('aim-marker');
  if(!svg)return null;
  const r=svg.getBoundingClientRect(),evt={clientX:r.left+r.width*.50,clientY:r.top+r.height*(drawing?.tool==='upper'?1/3:2/3)};
  return planPoint(svg,evt);
 }
 return null;
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
   metresFromStart:value('offset',0),openFraction:value('openFraction',obj.openFraction||0),
   mirrored:document.querySelector('[data-edit="mirrored"]')?.checked});
 if(obj.kind==='equipment')result=Geo.editEquipment(currentItems(),obj.id,
  {width:value('width',obj.width),depth:value('depth',obj.depth),height:value('height',obj.height)});
 if(obj.kind==='cabinet')result=Geo.editCabinet(currentItems(),obj.id,
  {length:value('length',Geo.lengthOf(obj)),depth:value('depth',obj.depth),
   height:value('height',obj.height),elevation:value('elevation',obj.elevation)});
 if(result)commitChange(result);
}
document.addEventListener('input',e=>{
 const slider=e.target.closest('[data-render]');if(!slider)return;
 const p=currentProject();if(!p)return;p.scene??={items:[]};p.scene.render??={...defaultRender};
 p.scene.render[slider.dataset.render]=Number(slider.value);floor?.setLighting(renderSettings());
});
document.addEventListener('change',e=>{
 const slider=e.target.closest('[data-render]');if(slider){touch(activeId);return;}
 const field=e.target.closest('[data-setting]');if(!field)return;
 const name=field.dataset.setting;settings[name]=field.type==='checkbox'?field.checked:Number(field.value);
});
/* Dedicated resize gesture: no document mutation until pointer release. */
function positionForResize(e,drag){
 const original=drag.initial,scene=document.querySelector('.editor-scene');
 if(drag.surface==='elevation'){
  const pixels=drag.pixelsPerMetre||1;
  return {...original,along:(original.along||0)+(e.clientX-drag.startClientX)/pixels,
   y:(original.y||0)-(e.clientY-drag.startClientY)/pixels};
 }
 if(mode==='ar'){
  const target=floor?.dragHandlePoint(e.clientX,e.clientY,drag.id);
  return target||null;
 }
 const svg=scene?.querySelector('#plan-view');
 const point=svg?planPoint(svg,e):null;if(!point)return null;
 const obj=drag.originalItems.find(o=>o.id===drag.id);
 if(obj?.kind==='wall')return point;
 const host=drag.originalItems.find(o=>o.id===obj?.hostId);
 if(!host)return null;
 const projected=Geo.projectOnWall(host,point.x,point.z);
 return {along:projected.t*Geo.lengthOf(host),y:original.y};
}
function paintResize(){
 if(!dragHandle)return;
 const objItems=dragHandle.previewItems||dragHandle.originalItems;
 const current=objItems.find(o=>o.id===dragHandle.id);
 const gesture=dragHandle.moved?{id:dragHandle.id,side:dragHandle.side,
  anchorCentre:dragHandle.anchorCentre,anchorScale:dragHandle.anchorScale}:null;
 if(mode==='2d'){
  const host=document.getElementById('plan-host');
  if(host)host.innerHTML=renderPlan(objItems,{selectedId:selection,gesture});
  const panel=document.getElementById('elevation-panel');
  if(panel){const opening=current?.kind==='opening'?current:null;
   panel.hidden=!opening;
   panel.innerHTML=opening?renderElevation(objItems,opening,gesture):'';
   if(dragHandle.error)panel.insertAdjacentHTML('beforeend','<p class="resize-warning">'+esc(dragHandle.error)+'</p>');
  }
 }else if(mode==='ar'){
  floor?.setEditPreview(objItems,dragHandle.id,dragHandle.side,dragHandle.moved);
 }
}
function finishResize(cancelled=false){
 const drag=dragHandle;if(!drag)return;
 dragHandle=null;
 const scene=document.querySelector('.editor-scene');scene?.classList.remove('is-resizing');
 if(mode==='ar')floor?.setEditPreview(null,null,null,false);
 if(!cancelled&&drag.moved&&drag.previewItems){
  commitChange({items:drag.previewItems,selectedId:drag.id});
 }else{
  if(drag.error&&!cancelled)tell(drag.error);
  showScene();
 }
}
document.addEventListener('pointerdown',e=>{
 const handle=e.target.closest('[data-handle],[data-open-handle]');
 const hit=handle?{id:handle.dataset.itemId,side:handle.dataset.openHandle||handle.dataset.handle}:
  mode==='ar'&&!drawing&&!e.target.closest('button,input,aside,.editor-header,.bottom-panel,.side-tools')?floor?.pickHandle(e.clientX,e.clientY):null;
 if(!hit||drawing||!currentItems().some(o=>o.id===hit.id))return;
 const initial=handlePosition(currentItems(),hit.id,hit.side);
 if(!initial)return;
 const elevationSvg=handle?.closest('#elevation-view');
 const surface=elevationSvg?'elevation':mode==='ar'?'ar':'plan';
 const ppm=elevationSvg?Number(elevationSvg.dataset.ppm)*elevationSvg.getBoundingClientRect().width/320:0;
 const original=currentItems().find(o=>o.id===hit.id);
 const wall=original?.kind==='opening'?currentItems().find(o=>o.id===original.hostId):null;
 selection=hit.id;
 dragHandle={id:hit.id,side:hit.side,initial,surface,pixelsPerMetre:ppm,
  startClientX:e.clientX,startClientY:e.clientY,originalItems:structuredClone(currentItems()),
  previewItems:null,moved:false,error:null,pointerId:e.pointerId,
  anchorCentre:wall?original.hostT*Geo.lengthOf(wall):null,
  anchorScale:elevationSvg?Number(elevationSvg.dataset.ppm):null};
 const scene=document.querySelector('.editor-scene');
 scene?.classList.add('is-resizing');
 try{scene?.setPointerCapture(e.pointerId);}catch{}
 e.preventDefault();e.stopPropagation();
});
document.addEventListener('pointermove',e=>{
 if(dragHandle){
  if(e.pointerId!==dragHandle.pointerId)return;
  if(Math.hypot(e.clientX-dragHandle.startClientX,e.clientY-dragHandle.startClientY)<3)return;
  const position=positionForResize(e,dragHandle);
  if(!position)return;
  dragHandle.moved=true;
  try{
   const result=resizeFromHandle(dragHandle.originalItems,dragHandle.id,dragHandle.side,position);
   dragHandle.previewItems=result.items;dragHandle.error=null;
  }catch(error){dragHandle.error=error.message;}
  paintResize();e.preventDefault();return;
 }
 if(mode!=='2d'||!drawing)return;
 const svg=e.target.closest('#plan-view');if(!svg)return;
 const point=planPoint(svg,e);if(!point)return;
 const cabinet=['base','upper','fridge','stove','sink'].includes(drawing.tool);
 const resolved=cabinet?point:Geo.resolvePoint(currentItems(),drawing.start,point.x,point.z,settings);
 hover={x:resolved.x,z:resolved.z};
 svg.querySelector('.live-preview')?.remove();
 const ghost=renderPreview(currentItems(),drawing,hover);
 if(ghost){
  const group=document.createElementNS('http://www.w3.org/2000/svg','g');
  group.innerHTML=ghost;const shape=group.firstElementChild;
  if(shape)svg.appendChild(shape);
 }
 const hint=document.getElementById('drawing-hint');
 if(hint&&drawing.start){
  hint.textContent='پیش‌نمایش حجمی · طول: '+num(Math.hypot(hover.x-drawing.start.x,hover.z-drawing.start.z))+' متر · '+(resolved.label||'روی دیوار');
 }
});
document.addEventListener('pointerup',e=>{
 if(dragHandle){if(e.pointerId===dragHandle.pointerId)finishResize();return;}
 const scene=e.target.closest('.editor-scene');if(!scene)return;
 if(e.target.closest('[data-action]'))return;
 try{
  const svg=scene.querySelector('#plan-view');
  const point=mode==='2d'?svg?planPoint(svg,e):null:mode==='ar'?floor?.pick():null;
  const arId=mode==='ar'&&!drawing?floor?.pickObject(e.clientX,e.clientY):null;
  if(!point&&!arId){if(mode==='ar'&&drawing)tell('نشانگر را روی سطح معتبر بگیر.');return;}
  if(drawing)placeAt(point);else selectAt(point,e.target,arId);
 }catch(error){tell(error.message);}
});
document.addEventListener('pointercancel',e=>{
 if(dragHandle&&e.pointerId===dragHandle.pointerId)finishResize(true);
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
  if(action==='tool'){drawing={tool:button.dataset.tool,start:null};selection=null;hover=initialPreviewForTool(drawing.tool);showScene();return;}
  if(action==='record-start'||action==='record-end'){
   const p=controlPoint();if(!p){tell('نشانگر هنوز روی سطح معتبر قرار نگرفته است.');return;}
   if(action==='record-start'&&drawing?.start){tell('نقطه شروع قبلاً ثبت شده است.');return;}
   if(action==='record-end'&&!drawing?.start&&!['window','door','fridge','stove','sink'].includes(drawing?.tool)){tell('ابتدا نقطه شروع را ثبت کن.');return;}
   return placeAt(p);
  }
  if(action==='cancel-start'){if(drawing){drawing.start=null;showScene();}return;}
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
   document.querySelector('.scan-confirm').hidden=next!=='ar';
   document.querySelector('[data-action="rescan"]').hidden=next!=='ar';
   if(next==='ar'){document.getElementById('scan-status').hidden=false;document.getElementById('scan-card').hidden=false;document.getElementById('scan-status').textContent='برای شروع اسکن، دوربین AR را فعال کن.';showScene();beginAR();}
   else {closeFloor();document.getElementById('scan-status').hidden=true;document.getElementById('scan-card').hidden=true;document.getElementById('scene-message').classList.add('visible');
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
