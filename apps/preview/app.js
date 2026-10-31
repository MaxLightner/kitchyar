import {FloorAR} from './floor-ar.js?v=finishes28';
import * as Geo from './geometry.js?v=finishes28';
import {renderPlan,renderPreview,planPoint} from './plan-view.js?v=finishes28';
import {resizeFromHandle,handlePosition,renderElevation,renderCabinetElevation,renderFrontElevation} from './edit-handles.js?v=finishes28';
import {MATERIALS,DEFAULT_MATERIALS,KITCHEN_STYLES,resolveFinish,assetUrl} from './materials.js?v=finishes28';
const STORAGE='kitchyar.ui.v2';
const app=document.getElementById('app'),dialogs=document.getElementById('dialog-root'),toastNode=document.getElementById('toast');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=value=>new Date(value).toLocaleDateString('fa-IR',{year:'numeric',month:'short',day:'numeric'});
let projects=[],floor=null,desktopPreview=null,mode='ar',activeTool=null,activeId=null,toastTimer=null,loadError=null;
let selection=null,drawing=null,hover=null,pendingUpperEdit=null,undoStack=[],redoStack=[],dragHandle=null,abDrag=null,planCalibrationDrag=null;
let paintScope='single',paintPart='panel';
let movingEquipmentId=null;
let sessionProjectId=null,parkedEditor=null,calibrationCollapsed=false;
const settings={thickness:.12,height:2.8,pointSnap:true,angleSnap:true,gridSnap:true,baseDepth:.6,upperDepth:.35,upperHeight:.72,upperElevation:1.55};
const defaultRender={sunAzimuth:-40,sunElevation:55,sunIntensity:2.1,ambientIntensity:1.0,aoStrength:.65,reflection:.10,taskLighting:false,taskIntensity:1.8};
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
function closeDesktopPreview(){desktopPreview?.stopPreview();desktopPreview=null;}
function closeFloor(){closeDesktopPreview();const old=floor;floor=null;sessionProjectId=null;
 if(parkedEditor){parkedEditor.remove();parkedEditor=null;}
 if(old)old.stop();}
function updateCalibrationPanel(){
 const panel=document.querySelector('.scan-confirm'),toggle=document.getElementById('calibration-toggle');
 if(panel)panel.hidden=mode!=='ar'||calibrationCollapsed;
 if(toggle)toggle.hidden=mode!=='ar'||!floor?.locked;
 if(toggle)toggle.textContent=calibrationCollapsed?'تنظیم کف و نقاط A/B ▴':'جمع‌کردن تنظیم کف ▾';
 const card=document.getElementById('scan-card');if(card&&floor?.locked)card.hidden=calibrationCollapsed||mode!=='ar';
 floor?.setCalibrationVisible(!calibrationCollapsed);
}
function createProject(){
 const now=new Date().toISOString();
 const p={id:uid(),name:'آشپزخانه جدید',createdAt:now,updatedAt:now,scene:{items:[],render:{...defaultRender},materials:{...DEFAULT_MATERIALS},calibration:{a:{x:-.5,z:.65},b:{x:.5,z:.65}}},revision:0};
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
 activeId=id;mode='ar';activeTool=null;selection=null;drawing=null;hover=null;abDrag=null;movingEquipmentId=null;undoStack=[];redoStack=[];calibrationCollapsed=false;paintScope='single';paintPart='panel';
 app.innerHTML='<main class="editor-root" id="editor-root"><div class="editor-scene"><div class="scene-grid"></div><div class="plan-host" id="plan-host" hidden></div><div class="drawing-hint" id="drawing-hint" hidden></div><aside class="elevation-panel" id="elevation-panel" hidden></aside><div class="scene-message" id="scene-message"><span class="scan-orbit"></span><h2>آماده شناسایی کف</h2><p>پس از ورود، دوربین روی کف قرار می‌گیرد. برای اسکن به گوشی سازگار با ARCore نیاز است.</p><button data-action="start-ar">فعال‌سازی دوربین AR</button></div></div>'+
 '<header class="editor-header"><button class="editor-back" data-action="projects">← پروژه‌ها</button><div class="editor-name"><strong>'+esc(p.name)+'</strong><span id="save-indicator">ذخیره‌شده روی دستگاه</span></div><div class="mode-switch"><button class="selected" data-action="mode" data-mode="ar">AR</button><button data-action="mode" data-mode="3d">3D</button><button data-action="mode" data-mode="2d">2D</button></div><button class="save-button" data-action="save">ذخیره</button></header>'+
 '<div class="ar-toolbar"><button data-action="menu">منوی کیچیار</button><button data-action="rescan">شروع / اسکن مجدد کف ↻</button><span id="scan-status" role="status">در حال آماده‌سازی دوربین AR…</span></div>'+
 '<aside class="editor-menu" id="editor-menu" hidden><strong>KITCHYAR · تنظیمات رندر</strong><label>جهت نور (درجه)<input data-render="sunAzimuth" type="range" min="-180" max="180" value="'+renderSettings().sunAzimuth+'"></label><label>ارتفاع نور (درجه)<input data-render="sunElevation" type="range" min="10" max="85" value="'+renderSettings().sunElevation+'"></label><label>شدت نور جهت‌دار<input data-render="sunIntensity" type="range" min=".3" max="4" step=".1" value="'+renderSettings().sunIntensity+'"></label><label>شدت اکلوژن محیطی<input data-render="aoStrength" type="range" min="0" max="1" step=".05" value="'+renderSettings().aoStrength+'"></label><label class="check-row">نور خطی زیر کابینت هوایی<input data-render="taskLighting" type="checkbox" '+(renderSettings().taskLighting?'checked':'')+'></label><label>شدت نور کابینت<input data-render="taskIntensity" type="range" min="0" max="4" step=".1" value="'+renderSettings().taskIntensity+'"></label><div class="render-note">بازتاب کابینت ۱۰٪ · کف سفید ۵۰٪ · سایه نرم</div><button data-action="save">ذخیره پروژه</button><button data-action="projects">مدیریت پروژه‌ها</button><button data-action="close-menu">ادامه ویرایش</button></aside>'+
 '<section class="scan-card" id="scan-card"><button class="scan-restart" data-action="rescan">شروع / اسکن دوبارهٔ کف ↻</button><div class="scan-head"><strong id="scan-stage">در انتظار اسکن کف</strong><span id="scan-pct">۰٪</span></div><progress id="scan-progress" max="100" value="0"></progress><small>آمادگی بر اساس برخوردهای معتبر و نمونه‌های مستقل است؛ درصد ARCore نیست.</small><div class="scan-info"><span id="scan-hits">برخورد معتبر: ۰</span><span id="anchor-count">Anchor: ۰ / ۵</span></div></section>'+
 '<button id="calibration-toggle" class="calibration-toggle" data-action="toggle-calibration" hidden>تنظیم کف و نقاط A/B ▴</button><div class="scan-confirm"><button class="primary" id="confirm-floor" data-action="confirm-floor" disabled>تثبیت این کف</button><div id="calibration" hidden><p class="calibration-help">A و B را روی صحنه بگیر و بکش؛ جهت شبکه همان لحظه تغییر می‌کند.</p><label>فاصله واقعی A تا B (متر)<input type="number" id="real-distance" value="1" min=".1" max="20" step=".01"></label><button data-action="apply-distance">اعمال مقیاس</button></div></div>'+
 '<div class="side-tools"><div class="side-basic"><button data-action="select" aria-label="انتخاب">⌖</button><button data-action="undo" disabled aria-label="بازگشت تغییر">↶</button><button data-action="redo" disabled aria-label="انجام دوباره">↷</button><button data-action="open-style-gallery" title="گالری آشپزخانه" aria-label="گالری نمونه‌های آشپزخانه">▣</button></div></div><div class="aim-marker" id="aim-marker" hidden><span>＋</span><small id="aim-label">محل ترسیم</small></div>'+
 '<div class="mini-map"><span>پلان زنده</span><div id="mini-plan" class="mini-plan"></div><small id="item-count">هنوز آبجکتی در صحنه نیست</small></div>'+
 '<aside class="object-editor" id="object-editor" hidden></aside><div class="bottom-panel"><div id="draw-controls" class="draw-controls" hidden><button class="primary" data-action="confirm-drawing">تأیید</button><button data-action="cancel-drawing">لغو</button></div><div class="tool-sheet" id="tool-sheet" hidden></div><nav class="dock">'+categories.map(([id,name,icon])=>'<button data-action="category" data-category="'+id+'"><span>'+icon+'</span><small>'+name+'</small></button>').join('')+'</nav></div>'+
 '</main>';
 showScene();
}
function render(){
 const hash=location.hash||'#/welcome',target=hash.startsWith('#/editor/')?hash.slice(9):null;
 if(target&&floor?.session&&sessionProjectId===target){
  if(parkedEditor){parkedEditor.classList.remove('session-parked');app.replaceChildren(parkedEditor);parkedEditor=null;}
  mode='ar';document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.mode==='ar'));
  document.getElementById('editor-root')?.classList.add('ar-live');
  document.getElementById('scan-status').hidden=false;
  updateCalibrationPanel();showScene();return;
 }
 if(!target&&floor?.session&&sessionProjectId===activeId){
  const root=document.getElementById('editor-root');
  if(root){parkedEditor=root;document.body.appendChild(root);root.classList.add('session-parked');}
 }else if(floor||desktopPreview)closeFloor();
 if(target)editorPage(target);
 else if(hash==='#/projects')projectPage();
 else welcome();
}
function arUpdate(data){
 const msg=document.getElementById('scan-status');if(!msg)return;
 if(data.calibration){const p=currentProject();if(p){p.scene.calibration=data.calibration;save();}}
 if(!data.locked){document.getElementById('editor-root')?.classList.remove('floor-locked');document.getElementById('scan-card')?.classList.remove('complete');}
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
   'A و B را روی کف لمس کن و بکش؛ شبکه همزمان می‌چرخد.':
   'جهت شبکه: '+num(data.direction,0)+'° · نقطه A مبدأ و B جهت را تعیین می‌کند.';
 if(data.locked)document.getElementById('scan-card').classList.add('complete');
 updateCalibrationPanel();
}
function beginAR(){
 if(!document.getElementById('editor-root')||mode!=='ar')return;
 if(floor?.session){document.getElementById('editor-root')?.classList.add('ar-live');updateCalibrationPanel();return;}
 const instance=new FloorAR(document.getElementById('editor-root'),
   data=>{if(floor===instance)arUpdate(data);},()=>{
    if(floor!==instance)return;
    sessionProjectId=null;
    document.getElementById('editor-root')?.classList.remove('ar-live');
    if(mode==='ar')document.getElementById('scan-status').textContent='جلسه AR بسته شد.';
   });
  floor=instance;sessionProjectId=activeId;
  instance.setCalibrationVisible(!calibrationCollapsed);
  instance.setItems(currentItems(),selection);instance.setLighting(renderSettings());instance.setCalibration(currentProject()?.scene?.calibration);
  const pending=instance.start();
 pending.then(()=>{if(floor===instance)document.getElementById('editor-root')?.classList.add('ar-live');})
  .catch(error=>{
   if(floor!==instance)return;
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
function openStyleGallery(){
 const selected=currentProject()?.scene?.styleId;
 dialogs.innerHTML='<div class="dialog-cover"><div class="dialog style-dialog"><div class="style-dialog-head"><h2>انتخاب نمونه آشپزخانه</h2><button data-action="close-dialog">×</button></div><p>هر سبک، چیدمان کدنویسی‌شده درب‌ها، کشوها، دستگیره‌ها و متریال‌ها دارد. حتی پیش از نصب کابینت می‌توانی سبک را انتخاب کنی.</p><div class="style-grid">'+
  KITCHEN_STYLES.map(s=>'<button class="'+(selected===s.id?'active':'')+'" data-action="choose-style" data-style="'+s.id+'"><img src="'+assetUrl(s.image)+'" alt="نمونه '+s.label+'"><strong>'+s.label+'</strong><small>'+s.description+'</small></button>').join('')+
  '</div><button data-action="close-dialog">انصراف</button></div></div>';
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
 if(activeTool==='material'){
  const chosen={...DEFAULT_MATERIALS,...currentProject()?.scene?.materials};
  sheet.innerHTML='<div class="material-tool-head"><strong>متریال‌های مستقل آشپزخانه</strong><button data-action="open-style-gallery">گالری نمونه‌های آشپزخانه</button></div>'+
   Object.entries({baseBody:'بدنه نمایان زمینی',upperBody:'بدنه نمایان هوایی',baseFront:'درب و کشوی زمینی',upperFront:'درب هوایی',counter:'صفحه رویه',backsplash:'بین‌کابینتی خودکار'}).map(([key,title])=>
    '<div class="material-family"><strong>'+title+'</strong><div class="material-options">'+MATERIALS[key.endsWith('Front')?'front':key.endsWith('Body')?'body':key].map(m=>
    '<button data-action="set-material" data-surface="'+key+'" data-material="'+m.id+'" class="'+((key.endsWith('Front')||key.endsWith('Body')?resolveFinish(chosen,key.startsWith('upper')?'upper':'base',key.endsWith('Body')?'body':'front'):chosen[key])===m.id?'active':'')+'">'+
    (m.file?'<img loading="lazy" src="'+assetUrl(m.file)+'" alt="">':'<span class="material-color" style="background:#'+m.color.toString(16).padStart(6,'0')+'"></span>')+
    '<small>'+m.label+'</small></button>').join('')+'</div></div>').join('')+
   '<p class="material-note">بافت‌ها فایل مستقل دارند؛ اندازه و جهت رگه روی هر پنل بر اساس ابعاد واقعی تنظیم می‌شود. کاشی بین کابینتی خودکار است.</p>';
  return;
 }
 const tools=activeTool==='architecture'?[['wall','دیوار'],['window','پنجره ثابت'],['door','در']]:
  activeTool==='cabinets'?[['base','کابینت زمینی'],['upper','کابینت هوایی']]:
  activeTool==='equipment'?[['fridge','یخچال'],['stove','اجاق گاز'],['sink','سینک'],
   ['dishwasher','ماشین ظرفشویی'],['washer','ماشین لباسشویی'],['oven','فر توکار']]:
  activeTool==='fronts'?[['front-smart','طراحی هوشمند کل آشپزخانه'],['front-doors','درب بازشو'],['front-drawers2','۲ کشوی مساوی'],['front-drawers3','۳ کشوی مساوی'],['front-drawers4','۴ کشوی مساوی'],['front-graduated','۳ کشوی پلکانی'],['front-mixed','کشوی بالا + دو درب'],['front-mixedLower','دو درب بالا + کشوی پایین']]:[];
 if(!tools.length){sheet.innerHTML='<span>ابزارهای این بخش در مرحله بعد اضافه می‌شوند.</span><button data-action="hide-tools">بستن</button>';return;}
 const wallTools=activeTool==='architecture';
 sheet.innerHTML=(activeTool==='fronts'?'<button class="style-gallery-trigger" data-action="open-style-gallery">▣ انتخاب مدل از گالری آشپزخانه</button>':'')+'<div class="tool-choices">'+tools.map(([id,label])=>
  '<button class="'+(drawing?.tool===id?'active':'')+'" data-action="tool" data-tool="'+id+'">'+label+'</button>').join('')+
  '<button data-action="select">انتخاب</button></div>'+
  (activeTool==='fronts'?'<p class="equipment-help">طرح هوشمند تمام کابینت‌ها را یک‌جا با سینک، گاز، فر و یخچال هماهنگ می‌کند. پیش‌نمایش را ببین و تأیید کن؛ برای تغییر یک کابینت آن را انتخاب کن و یک طرح دیگر بزن.</p>':activeTool==='equipment'?'<p class="equipment-help">یخچال روی کف یا داخل کابینت قرار می‌گیرد؛ گاز و سینک روی صفحه و ظرفشویی، لباسشویی و فر داخل کابینت زمینی نصب می‌شوند.</p>':wallTools?'<div class="tool-settings"><label>ضخامت دیوار (متر)<input data-setting="thickness" type="number" min=".07" max=".8" step=".01" value="'+settings.thickness+'"></label>'+
   '<label>ارتفاع (متر)<input data-setting="height" type="number" min=".4" max="9" step=".1" value="'+settings.height+'"></label></div>':
   '<div class="tool-settings"><label>عمق زمینی (متر)<input data-setting="baseDepth" type="number" min=".2" max="1.2" step=".05" value="'+settings.baseDepth+'"></label>'+
   '<label>عمق هوایی (متر)<input data-setting="upperDepth" type="number" min=".2" max="1.2" step=".05" value="'+settings.upperDepth+'"></label>'+'<label>ارتفاع کابینت هوایی (متر)<input data-setting="upperHeight" type="number" min=".25" max="1.8" step=".01" value="'+settings.upperHeight+'"></label>'+'<label>ارتفاع نصب از کف (متر)<input data-setting="upperElevation" type="number" min="0" max="3" step=".01" value="'+settings.upperElevation+'"></label></div>')+
  '<div class="snap-options"><label><input type="checkbox" data-setting="pointSnap" '+(settings.pointSnap?'checked':'')+'> اسنپ نقطه</label>'+
  '<label><input type="checkbox" data-setting="angleSnap" '+(settings.angleSnap?'checked':'')+'> زاویه ۴۵°</label>'+
  '<label><input type="checkbox" data-setting="gridSnap" '+(settings.gridSnap?'checked':'')+'> شبکه ۱۰ سانتی</label>'+
  '</div>';
}
function openCutSheet(c){
 const holes=Geo.countertopCutouts(currentItems(),c),width=Geo.lengthOf(c),depth=c.depth;
 const rows=holes.map(h=>{
  const x=40+920*(h.left/width),w=920*(h.width/width);
  const y=35+150*(depth-h.depth)/(2*depth),d=150*h.depth/depth;
  return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+d+'" fill="#3c5051" stroke="#f1fffa" stroke-width="2"/>';
 }).join('');
 const list=holes.map(h=>'<li>'+(h.type==='sink'?'سینک':'گاز')+': برش '+Math.round(h.width*100)+' × '+Math.round(h.depth*100)+' سانتی‌متر، فاصله از لبهٔ آغاز '+Math.round(h.left*100)+' سانتی‌متر، از لبهٔ پایان '+Math.round(h.right*100)+' سانتی‌متر</li>').join('');
 dialogs.innerHTML='<div class="dialog-cover"><div class="dialog cut-dialog"><h2>نقشه برش صفحه کابینت</h2><p>اندازه‌ها در واحد سانتی‌متر و با دقت یک سانتی‌متر هستند.</p>'+
  '<svg class="cut-sheet-svg" viewBox="0 0 1000 230" role="img" aria-label="پلان برش صفحه کابینت">'+
  '<rect x="40" y="35" width="920" height="150" fill="#f2e8d5" stroke="#7c6f60" stroke-width="3"/>'+rows+
  '<text x="500" y="22" text-anchor="middle" font-size="16">'+Math.round(width*100)+' cm</text>'+
  '<text x="500" y="208" text-anchor="middle" font-size="15">عمق '+Math.round(depth*100)+' cm</text></svg>'+
  '<ul class="cut-details">'+(list||'<li>فعلاً هیچ سوراخی روی صفحه وجود ندارد.</li>')+'</ul>'+
  '<button class="primary" data-action="close-dialog">بستن نقشه برش</button></div></div>';
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
 if(obj.kind==='cabinet')fields=field('length','طول (متر)',obj.hostId?(obj.endT-obj.startT)*Geo.lengthOf(currentItems().find(x=>x.id===obj.hostId)):Geo.lengthOf(obj),.45)+
  field('depth','عمق (متر)',obj.depth,.2)+field('height','ارتفاع (متر)',obj.height,.25)+
  field('elevation','ارتفاع از کف (متر)',obj.elevation,0);
 if(obj.kind==='front'){
  const host=currentItems().find(x=>x.id===obj.hostId);
  if(host){
   const span=(obj.endT-obj.startT)*Geo.lengthOf(host),height=(obj.topT-obj.bottomT)*host.height;
   const choose=(key,title,options,value)=>'<label>'+title+'<select data-edit-front="'+key+'">'+options.map(([v,l])=>
    '<option value="'+v+'" '+(value===v?'selected':'')+'>'+l+'</option>').join('')+'</select></label>';
   fields=field('width','عرض نما (متر)',span,.15)+field('height','ارتفاع نما (متر)',height,.10)+
    choose('materialId','متریال این نما',[['','مطابق انتخاب کلی'],...MATERIALS.front.map(m=>[m.id,m.label])],obj.materialId||'')+
    choose('frameMaterialId','متریال قاب (در حالت قاب‌دار)',[['','هم‌رنگ پنل'],...MATERIALS.front.map(m=>[m.id,m.label])],obj.frameMaterialId||'')+
    choose('grainDirection','جهت رگه چوب',[['auto','خودکار: درب عمودی، کشو افقی'],['vertical','عمودی'],['horizontal','افقی']],obj.grainDirection||'auto')+
    choose('style','طرح پنل',[['flat','صاف'],['frame','قاب‌دار']],obj.style||'flat')+
    choose('handleStyle','دستگیره',[['bar','میله‌ای'],['knob','دکمه‌ای'],['hidden','مخفی']],obj.handleStyle||'bar');
   if(obj.subtype==='door')fields+=choose('hinge','محل لولا',[['left','چپ'],['right','راست'],['top','بالا / افقی']],obj.hinge||'left');
   title=(obj.subtype==='drawer'?'کشو':'درب')+' · عرض '+num(span)+' متر';
  }
 }
 const models=obj.kind==='equipment'?Geo.EQUIPMENT_MODELS[obj.subtype]||[]:[];
 const modelOptions=models.length?'<div class="model-choices"><strong>مدل '+esc(obj.name)+'</strong><div class="model-choices-grid">'+models.filter(m=>!['gas4','induction','drainer'].includes(m.id)||m.id===obj.model).map(m=>
  '<button data-action="equipment-model" data-model="'+esc(m.id)+'" class="'+((obj.model||models[0].id)===m.id?'active':'')+'">'+esc(m.label)+'</button>').join('')+'</div>'+
  (obj.subtype==='stove'?'<label class="check-row">صفحه القایی <input type="checkbox" data-equipment-induction '+(obj.induction||obj.model==='induction'?'checked':'')+'></label>':'')+
  (obj.subtype==='fridge'?'<strong>ظرفیت تقریبی یخچال (فوت مکعب)</strong><div class="model-choices-grid">'+Geo.FRIDGE_FEET.map(n=>
   '<button data-action="fridge-feet" data-feet="'+n+'" class="'+((obj.fridgeFeet||24)===n?'active':'')+'">'+n+' فوت</button>').join('')+'</div>':'')+
  (obj.subtype==='sink'?'<strong>عرض سینک</strong><div class="model-choices-grid">'+[60,90,120].map(n=>
   '<button data-action="sink-size" data-size="'+n+'" class="'+((obj.sinkSize||Math.round(obj.width*100))===n?'active':'')+'">'+n+' سانتی‌متر</button>').join('')+'</div>':'')+
  '</div>':'';
 const extras=obj.kind==='cabinet'&&obj.subtype==='upper'?'<div class="object-extras"><button data-action="toggle-task-light">'+(renderSettings().taskLighting?'خاموش‌کردن نور زیر همه کابینت‌ها':'روشن‌کردن نور زیر همه کابینت‌ها')+'</button><p>قفسهٔ رابط بین کابینت زمینی و هوایی</p><label>عرض قفسه (متر)<input type="number" data-bridge-width min=".45" max="1.20" step=".01" value=".45"></label><div class="model-choices-grid"><button data-action="bridge" data-edge="start" data-depth="base">سمت چپ · عمق زمینی</button><button data-action="bridge" data-edge="end" data-depth="base">سمت راست · عمق زمینی</button><button data-action="bridge" data-edge="start" data-depth="upper">سمت چپ · عمق هوایی</button><button data-action="bridge" data-edge="end" data-depth="upper">سمت راست · عمق هوایی</button></div></div>':obj.kind==='equipment'&&obj.subtype==='fridge'?'<div class="object-extras"><strong>کابینت بالای یخچال</strong><div class="model-choices-grid"><button data-action="fridge-over" data-depth=".60">عمق ۶۰ سانتی‌متر</button><button data-action="fridge-over" data-depth="fridge">عمق خود یخچال</button></div></div>':obj.kind==='cabinet'&&obj.subtype==='base'?'<div class="object-extras"><strong>برش‌های صفحه کابینت</strong>'+((Geo.countertopCutouts(currentItems(),obj).map(h=>'<p>'+ (h.type==='sink'?'سینک':'گاز')+' · '+Math.round(h.width*100)+' × '+Math.round(h.depth*100)+' سانتی‌متر · از ابتدای کابینت '+Math.round(h.left*100)+' سانتی‌متر</p>').join(''))||'<p>برشی ثبت نشده است.</p>')+'</div>':'';
 const paintControls=obj.kind==='front'?'<div class="paint-panel"><strong>رنگ‌آمیزی درب و کشو</strong><div class="paint-choice">'+
  [['single','فقط همین'],['connected','متصل‌ها'],['layer','همه هم‌سطح‌ها'],['all','کل آشپزخانه']].map(([id,name])=>
   '<button data-action="paint-scope" data-scope="'+id+'" class="'+(paintScope===id?'active':'')+'">'+name+'</button>').join('')+
  '</div><div class="paint-choice">'+[['panel','رنگ پنل'],['frame','رنگ فریم']].map(([id,name])=>
   '<button data-action="paint-part" data-part="'+id+'" class="'+(paintPart===id?'active':'')+'">'+name+'</button>').join('')+
  '</div><div class="paint-colors">'+MATERIALS.front.map(m=>
   '<button data-action="paint-front" data-material="'+m.id+'" title="'+m.label+'" aria-label="رنگ‌آمیزی '+m.label+'">'+
   (m.file?'<img src="'+assetUrl(m.file)+'" alt="">':'<span style="background:#'+m.color.toString(16).padStart(6,'0')+'"></span>')+
   '<small>'+m.label+'</small></button>').join('')+'</div><small>رنگ فقط روی نماهای انتخاب‌شده اعمال می‌شود؛ داخل کابینت سفید می‌ماند.</small></div>':'';
 panel.innerHTML='<div class="object-head"><strong>'+esc(title)+'</strong><button data-action="close-object" aria-label="بستن">×</button></div>'+
  modelOptions+'<div class="object-fields">'+fields+'</div>'+paintControls+extras+(obj.kind==='cabinet'&&obj.subtype==='base'?'<button class="cut-sheet-button" data-action="cut-sheet">نمای دقیق برش صفحه</button>':'')+'<div class="object-actions"><button class="primary" data-action="apply-edit">اعمال ابعاد</button>'+
  (obj.kind==='equipment'&&obj.subtype!=='hood'?'<button data-action="move-equipment">جابجایی روی پلان / AR</button>':'')+
  '<button class="danger" data-action="delete-object">حذف</button></div>'+
  (obj.kind==='front'?'<small>دستگیره‌های نما را در تصویر بکش؛ عرض و ارتفاع با اسنپ ۱ سانتی‌متر ثبت می‌شوند.</small>':
   ['wall','cabinet','opening'].includes(obj.kind)?'<small>دستگیره‌ها را بکش؛ اندازه‌گذاری هنگام حرکت نمایش داده می‌شود و پس از رها کردن، با دقت ۱ سانتی‌متر ثبت می‌شود.</small>':'');
}
function showScene(){
 const root=document.getElementById('editor-root');if(!root)return;
 const items=currentItems(),host=document.getElementById('plan-host');
 const isPlan=mode==='2d';host.hidden=!isPlan;
 if(isPlan){
  host.innerHTML=renderPlan(items,{selectedId:selection,drawing:drawing?{...drawing,height:settings.upperHeight,elevation:settings.upperElevation}:null,hover,calibration:currentProject()?.scene?.calibration,showCalibration:!calibrationCollapsed});
  document.getElementById('scene-message').classList.add('hide-for-plan');
 }else {
  host.innerHTML='';
  document.getElementById('scene-message').classList.remove('hide-for-plan');
 }
 const elevation=document.getElementById('elevation-panel');
 if(elevation){
  const selected=items.find(o=>o.id===selection&&['opening','cabinet','front'].includes(o.kind));
  const facadeHost=selected?.kind==='front'?items.find(o=>o.id===selected.hostId):selected?.kind==='cabinet'?selected:null;
  const hasFacades=facadeHost&&items.some(o=>o.kind==='front'&&o.hostId===facadeHost.id);
  const facadeTool=drawing?.tool.startsWith('front-');
  const previewHost=facadeTool?(items.find(o=>o.id===drawing.hostId&&o.kind==='cabinet')||
   Geo.nearestCabinet(items,hover)?.cabinet):null;
  let pending=null;
  if(previewHost)try{
   pending=drawing.tool==='front-smart'?Geo.planSmartKitchen(items).items:
    items.filter(o=>!(o.kind==='front'&&o.hostId===previewHost.id))
     .concat(Geo.planFronts(items,previewHost,drawing.tool.slice(6)));
  }catch{}
  elevation.hidden=!(isPlan||mode==='ar')||(!selected&&!pending)||!!(drawing&&!facadeTool)||!!(facadeTool&&!pending);
  elevation.innerHTML=elevation.hidden?'':pending?
   '<div class="preview-elevation-flag">پیش‌نمایش · هنوز ثبت نشده</div>'+renderFrontElevation(pending,previewHost):
   selected.kind==='opening'?renderElevation(items,selected):
   hasFacades?renderFrontElevation(items,facadeHost,selection):selected.kind==='cabinet'?renderCabinetElevation(items,selected):'';
  // Scroll only the facade strip to bring the selected panel and its grips into view.
  if(!elevation.hidden&&selected?.kind==='front'&&!drawing){
   const scroller=elevation.querySelector('.front-elevation-scroll'),
    selectedPanel=[...elevation.querySelectorAll('.front-panel-elevation')]
     .find(node=>node.dataset.itemId===selection);
   if(scroller&&selectedPanel){
    const panelBox=selectedPanel.getBBox();
    scroller.scrollLeft=Math.max(0,panelBox.x-scroller.clientWidth*.32);
   }
  }
 }
 document.getElementById('mini-plan').innerHTML=renderPlan(items,{mini:true,calibration:currentProject()?.scene?.calibration});
 document.getElementById('item-count').textContent=items.length?num(items.length,0)+' عنصر در صحنه':'هنوز آبجکتی در صحنه نیست';
 const hint=document.getElementById('drawing-hint');
 hint.hidden=!drawing&&!movingEquipmentId;
 if(movingEquipmentId&&!drawing){
  const moved=items.find(o=>o.id===movingEquipmentId);
  hint.textContent='جابجایی '+(moved?.name||'تجهیزات')+' — محل جدید را روی پلان یا کف AR لمس کن. برای لغو، «انتخاب» را بزن.';
 }
 if(drawing){
  const name={wall:'دیوار',window:'پنجره ثابت',door:'در',base:'کابینت زمینی',upper:'کابینت هوایی',fridge:'یخچال',stove:'اجاق گاز',sink:'سینک',dishwasher:'ماشین ظرفشویی',washer:'ماشین لباسشویی',oven:'فر توکار',
   'front-smart':'هوشمندسازی همه کابینت‌ها','front-doors':'درب بازشو','front-drawers2':'دو کشو','front-drawers3':'سه کشو','front-drawers4':'چهار کشو','front-graduated':'سه کشوی پلکانی','front-mixed':'کشوی بالا و درب پایین','front-mixedLower':'درب بالا و کشوی پایین'}[drawing.tool];
  const length=drawing.start&&hover?Math.hypot(hover.x-drawing.start.x,hover.z-drawing.start.z):null;
  const singleTap=drawing.tool.startsWith('front-')||['window','door','fridge','stove','sink','dishwasher','washer','oven'].includes(drawing.tool);
  hint.textContent=name+' — '+(singleTap?'روی پیش‌نمایش لمس کن یا «تأیید» بزن':drawing.start?'نقطه پایان را نشانه بگیر و «تأیید» بزن':'نقطه شروع را نشانه بگیر و «تأیید» بزن')+
   (length!==null?' · '+num(length)+' متر':'');
 }
 floor?.setItems(items,selection);
 floor?.setMaterials({...DEFAULT_MATERIALS,...currentProject()?.scene?.materials});
 if(mode==='3d'){
  if(!desktopPreview){
   try{desktopPreview=new FloorAR(document.getElementById('editor-root'),()=>{},()=>{});
    desktopPreview.startPreview(document.querySelector('.editor-scene'));
   }catch(error){closeDesktopPreview();tell('نمای سه‌بعدی در این مرورگر آماده نشد: '+error.message);}
  }
  desktopPreview?.setItems(items,selection);
  desktopPreview?.setMaterials({...DEFAULT_MATERIALS,...currentProject()?.scene?.materials});
  desktopPreview?.setLighting(renderSettings());
 }
 if(mode==='ar')floor?.setEditPreview(items,selection,'centre',
  !!items.find(o=>o.id===selection&&o.kind==='opening')&&!drawing);
 floor?.setDrawing(drawing?.start||null,drawing?.tool,{height:settings.upperHeight,elevation:settings.upperElevation,hostId:drawing?.hostId});
 floor?.setLighting(renderSettings());
 const controls=document.getElementById('draw-controls');if(controls){
  controls.hidden=!drawing;
  controls.querySelector('[data-action="confirm-drawing"]').disabled=!drawing;
  controls.querySelector('[data-action="confirm-drawing"]').title=drawing?.start?'ثبت انتهای قطعه و ادامهٔ مسیر':'تأیید محل نشانگر';
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
function commitChange(result,{materials,styleId}={}){
 if(!result||!Array.isArray(result.items))throw Error('تغییر هندسه معتبر نیست.');
 const p=currentProject();if(!p)return;
 undoStack.push({items:structuredClone(currentItems()),materials:{...DEFAULT_MATERIALS,...p.scene?.materials},styleId:p.scene?.styleId||null});if(undoStack.length>60)undoStack.shift();redoStack=[];
 const existing=new Set(currentItems().filter(c=>c.kind==='cabinet').map(c=>c.id));
 const added=result.items.filter(c=>c.kind==='cabinet'&&c.subtype!=='bridge'&&!existing.has(c.id)).map(c=>c.id);
 if(added.length&&p.scene?.styleId){
  const styled=Geo.applyKitchenLayout(result.items,p.scene.styleId,{cabinetIds:added});
  result={...result,items:styled.items};
 }
 p.scene??={items:[]};p.scene.items=result.items;p.updatedAt=new Date().toISOString();p.revision=(p.revision||0)+1;
 if(materials)p.scene.materials={...DEFAULT_MATERIALS,...materials};
 if(styleId!==undefined)p.scene.styleId=styleId;
 save();selection=result.selectedId||null;showScene();
}
function undoChange(redo=false){
 const source=redo?redoStack:undoStack,dest=redo?undoStack:redoStack;if(!source.length)return;
 const p=currentProject();dest.push({items:structuredClone(currentItems()),materials:{...DEFAULT_MATERIALS,...p.scene.materials},styleId:p.scene.styleId||null});
 const snapshot=source.pop();p.scene.items=Array.isArray(snapshot)?snapshot:snapshot.items;
 if(!Array.isArray(snapshot)){p.scene.materials=snapshot.materials;p.scene.styleId=snapshot.styleId||null;}
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
 if(tool.startsWith('front-')){
  const c=currentItems().find(o=>o.id===drawing?.hostId&&o.kind==='cabinet')||currentItems().find(o=>o.kind==='cabinet');
  return c?{x:(c.x1+c.x2)/2,z:(c.z1+c.z2)/2}:null;
 }
 if(tool==='wall')return {x:0,z:0};
 if(tool==='fridge'){
  for(const c of currentItems().filter(x=>x.kind==='cabinet'&&x.subtype==='base'&&Geo.lengthOf(x)>=1.15)){
   const host=currentItems().find(w=>w.id===c.hostId);
   const fp=host?Geo.cabinetFootprint(c,host):null;
   if(fp){try{Geo.placeEquipment(currentItems(),fp.centre,tool);return fp.centre;}catch{}}
  }
  const w=currentItems().find(x=>x.kind==='wall');
  if(!w)return {x:0,z:0};
  const len=Geo.lengthOf(w),nx=-(w.z2-w.z1)/len,nz=(w.x2-w.x1)/len;
  return {x:(w.x1+w.x2)/2+nx*.65,z:(w.z1+w.z2)/2+nz*.65};
 }
 if(['stove','sink','dishwasher','washer','oven'].includes(tool)){
  for(const c of currentItems().filter(x=>x.kind==='cabinet'&&x.subtype==='base'))
   for(const t of [.2,.4,.6,.8,.5]){
    const p={x:c.x1+(c.x2-c.x1)*t,z:c.z1+(c.z2-c.z1)*t};
    try{Geo.placeEquipment(currentItems(),p,tool);return p;}catch{}
   }
  return null;
 }
 const w=currentItems().find(x=>x.kind==='wall');
 if(!w)return null;
 return {x:(w.x1+w.x2)/2,z:(w.z1+w.z2)/2};
}
function placeAt(point){
 if(!drawing||!point)return;
 const items=currentItems(),tool=drawing.tool;
 if(tool==='front-smart'){
  commitChange(Geo.planSmartKitchen(items));drawing={tool,start:null};hover=initialPreviewForTool(tool);showScene();return;
 }
 if(tool.startsWith('front-')){
  const c=items.find(o=>o.id===drawing.hostId&&o.kind==='cabinet')||Geo.nearestCabinet(items,point)?.cabinet;
  if(!c)throw Error('برای نصب درب و کشو ابتدا کابینت میزبان را انتخاب کن.');
  commitChange(Geo.placeFrontLayout(items,c.id,tool.slice(6)));
  drawing={tool,start:null,hostId:c.id};hover=initialPreviewForTool(tool);showScene();return;
 }
 if(['fridge','stove','sink','dishwasher','washer','oven'].includes(tool)){
  commitChange(Geo.placeEquipment(items,point,tool));drawing={tool,start:null};hover=initialPreviewForTool(tool);showScene();return;
 }
 if(tool==='window'||tool==='door'){
  const near=Geo.nearestWall(items,point.x,point.z,.60);
  if(!near){tell('برای نصب در یا پنجره باید نشانگر روی دیوار باشد.');return;}
  const result=Geo.placeOpening(items,near.wall.id,point.x,point.z,{style:tool==='door'?'door':'fixed'});
  commitChange(result);drawing={tool,start:null};hover=initialPreviewForTool(tool);showScene();return;
 }
 if(!drawing.start){
  if(tool==='base'||tool==='upper'){
   const snap=Geo.snapCabinetPoint(items,point.x,point.z,.85);
   if(!snap){tell('برای کابینت، نشانگر باید به دیوار یا کنج آن برسد.');return;}
   const w=items.find(x=>x.id===snap.hostId),
    cross=(point.x-w.x1)*(w.z2-w.z1)-(point.z-w.z1)*(w.x2-w.x1);
   drawing.start={x:snap.x,z:snap.z,hostId:w.id,
    side:mode==='ar'&&floor?.locked?floor.cameraSideForWall(w):Math.abs(cross)<.01?1:cross>0?-1:1};
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
  b=Geo.snapCabinetPoint(items,point.x,point.z,.85);
  if(!b)throw Error('نقطه پایان باید روی دیوار میزبان یا دیوار متصل به آن باشد.');
 }
 const result=tool==='wall'?Geo.placeWall(items,a,b,{thickness:settings.thickness,height:settings.height,tolerance:settings.pointSnap?.22:.001}):
  Geo.placeCabinetRoute(items,a,b,{kind:tool==='upper'?'upper':'base',
   depth:tool==='upper'?settings.upperDepth:settings.baseDepth,height:tool==='upper'?settings.upperHeight:undefined,elevation:tool==='upper'?settings.upperElevation:undefined,groupId:drawing.groupId});
 commitChange(result);drawing={tool,start:result.end,groupId:result.groupId||drawing.groupId};hover=result.end||null;showScene();
}
function controlPoint(){
 if(mode==='ar')return floor?.pick()||null;
 if(mode==='2d')return hover||null;
 return null;
}
function finishLine(){
 drawing=null;hover=null;activeTool=null;
 document.querySelectorAll('[data-category]').forEach(b=>b.classList.remove('active'));
 floor?.setDrawing(null);showScene();
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
 if(obj.kind==='cabinet'){
  const changes={length:value('length',Geo.lengthOf(obj)),depth:value('depth',obj.depth),
   height:value('height',obj.height),elevation:value('elevation',obj.elevation)};
  if(obj.subtype==='upper'&&(Math.abs(changes.height-obj.height)>.001||Math.abs(changes.elevation-obj.elevation)>.001)){
   // Ask before a global height change; the current cabinet can always be edited alone.
   dialogs.innerHTML='<div class="dialog-cover"><div class="dialog"><h2>ارتفاع کابینت هوایی</h3><p>این ارتفاع و تراز نصب به همهٔ کابینت‌های هوایی اعمال شود؟</p><div class="dialog-actions"><button data-action="upper-height-single">فقط همین کابینت</button><button class="primary" data-action="upper-height-all">اعمال به همه</button><button data-action="upper-height-cancel">لغو</button></div></div></div>';
   pendingUpperEdit={id:obj.id,changes};return;
  }
  result=Geo.editCabinet(currentItems(),obj.id,changes);
 }
 if(obj.kind==='front'){
  const c=currentItems().find(x=>x.id===obj.hostId);
  const get=key=>document.querySelector('[data-edit-front="'+key+'"]')?.value;
  const actualWidth=(obj.endT-obj.startT)*Geo.lengthOf(c),actualHeight=(obj.topT-obj.bottomT)*c.height;
  const shownWidth=Math.round(actualWidth*100)/100,shownHeight=Math.round(actualHeight*100)/100;
  const desiredWidth=value('width',shownWidth),desiredHeight=value('height',shownHeight);
  result=Geo.editFront(currentItems(),obj.id,{
   width:Math.abs(desiredWidth-shownWidth)>.001?desiredWidth:undefined,
   height:Math.abs(desiredHeight-shownHeight)>.001?desiredHeight:undefined,
   materialId:get('materialId'),frameMaterialId:get('frameMaterialId'),grainDirection:get('grainDirection'),style:get('style'),handleStyle:get('handleStyle'),
   hinge:obj.subtype==='door'?get('hinge'):undefined});
 }
 if(result)commitChange(result);
}
document.addEventListener('input',e=>{
 const field=e.target.closest('[data-setting]');
 if(field){
  if(field.type==='checkbox'||(field.value!==''&&Number.isFinite(Number(field.value))))
   settings[field.dataset.setting]=field.type==='checkbox'?field.checked:Number(field.value);
  return;
 }
 const slider=e.target.closest('[data-render]');if(!slider)return;
 const p=currentProject();if(!p)return;p.scene??={items:[]};p.scene.render??={...defaultRender};
 p.scene.render[slider.dataset.render]=slider.type==='checkbox'?slider.checked:Number(slider.value);floor?.setLighting(renderSettings());
});
document.addEventListener('change',e=>{
 if(e.target.matches('[data-equipment-induction]')){
  const obj=currentItems().find(x=>x.id===selection);
  if(obj?.subtype==='stove')commitChange(Geo.editEquipment(currentItems(),obj.id,{induction:e.target.checked}));
  return;
 }
 const slider=e.target.closest('[data-render]');if(slider){touch(activeId);return;}
 const field=e.target.closest('[data-setting]');if(!field)return;
 const name=field.dataset.setting;settings[name]=field.type==='checkbox'?field.checked:Number(field.value);
  if(['upperHeight','upperElevation','upperDepth','baseDepth'].includes(name)&&drawing)showScene();
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
  const target=floor?.dragScreenHandlePoint(e.clientX,e.clientY,drag)||floor?.dragHandlePoint(e.clientX,e.clientY,drag.id);
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
  if(panel){const editable=current&&['opening','cabinet','front'].includes(current.kind)?current:null;
    const cabinet=editable?.kind==='front'?objItems.find(o=>o.id===editable.hostId):editable?.kind==='cabinet'?editable:null;
    panel.hidden=!editable;
    panel.innerHTML=!editable?'':editable.kind==='opening'?renderElevation(objItems,editable,gesture):
     cabinet&&objItems.some(o=>o.kind==='front'&&o.hostId===cabinet.id)?renderFrontElevation(objItems,cabinet,dragHandle.id,gesture):renderCabinetElevation(objItems,cabinet,gesture);
   if(dragHandle.error)panel.insertAdjacentHTML('beforeend','<p class="resize-warning">'+esc(dragHandle.error)+'</p>');
  }
 }else if(mode==='ar'){
  floor?.setEditPreview(objItems,dragHandle.id,dragHandle.side,dragHandle.moved);
  const panel=document.getElementById('elevation-panel');
  if(panel&&['opening','cabinet','front'].includes(current?.kind)){
   const c=current.kind==='front'?objItems.find(o=>o.id===current.hostId):current.kind==='cabinet'?current:null;
   panel.hidden=false;panel.innerHTML=current.kind==='opening'?renderElevation(objItems,current,gesture):
    c&&objItems.some(o=>o.kind==='front'&&o.hostId===c.id)?renderFrontElevation(objItems,c,dragHandle.id,gesture):renderCabinetElevation(objItems,c,gesture);
   if(dragHandle.error)panel.insertAdjacentHTML('beforeend','<p class="resize-warning">'+esc(dragHandle.error)+'</p>');
  }
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
function screenPlanPoint(svg,point){
 if(!svg||!point)return null;
 const matrix=svg.getScreenCTM();if(!matrix)return null;
 const marker=svg.createSVGPoint();marker.x=point.x;marker.y=point.z;
 return marker.matrixTransform(matrix);
}
function pickPlanCalibration(e){
 if(mode!=='2d'||drawing||calibrationCollapsed||!e.target.closest('#plan-view'))return null;
 const svg=document.querySelector('#plan-view'),cal=currentProject()?.scene?.calibration||
  {a:{x:-.5,z:.65},b:{x:.5,z:.65}};
 let nearest=null,dist=48;
 for(const which of ['a','b']){
  const pt=screenPlanPoint(svg,cal[which]);if(!pt)continue;
  const d=Math.hypot(e.clientX-pt.x,e.clientY-pt.y);
  if(d<dist){nearest=which;dist=d;}
 }
 return nearest;
}
function pickPlanHandle(e){
 if(mode!=='2d'||drawing||!e.target.closest('.editor-scene'))return null;
 // A tap on a facade itself selects that panel, even beside another panel's grip.
 if(e.target.closest('.front-panel-elevation'))return null;
 const candidates=document.querySelectorAll('#plan-view [data-handle],#plan-view [data-open-handle],#elevation-view [data-open-handle]');
 let hit=null,distance=47;
 for(const el of candidates){
  const box=el.getBoundingClientRect();
  if(!box.width||!box.height)continue;
  const cx=box.left+box.width/2,cy=box.top+box.height/2;
  const clip=el.closest('.front-elevation-scroll')?.getBoundingClientRect();
  if(clip&&(cx<clip.left||cx>clip.right||cy<clip.top||cy>clip.bottom))continue;
  const d=Math.hypot(e.clientX-cx,e.clientY-cy);
  if(d<distance){
   distance=d;hit={id:el.dataset.itemId,side:el.dataset.openHandle||el.dataset.handle,element:el};
  }
 }
 return hit;
}
document.addEventListener('pointerdown',e=>{
 const whichPlan=pickPlanCalibration(e);
 if(whichPlan){
  const svg=document.querySelector('#plan-view'),cursor=svg?planPoint(svg,e):null;
  const cal=currentProject()?.scene?.calibration||{a:{x:-.5,z:.65},b:{x:.5,z:.65}};
  const anchor=cal[whichPlan];
  planCalibrationDrag={which:whichPlan,pointerId:e.pointerId,
   dx:anchor.x-(cursor?.x??anchor.x),dz:anchor.z-(cursor?.z??anchor.z),
   startX:e.clientX,startY:e.clientY,moved:false};
  const scene=document.querySelector('.editor-scene');
  try{scene?.setPointerCapture(e.pointerId);}catch{}
  e.preventDefault();e.stopPropagation();return;
 }
 if(mode==='ar'&&floor?.locked&&!calibrationCollapsed&&e.target.closest('.editor-scene')){
  const which=floor.pickCalibrationHandle(e.clientX,e.clientY);
  if(which){
   abDrag={which,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,moved:false};
   floor.beginCalibrationDrag(e.clientX,e.clientY,which);
   const scene=document.querySelector('.editor-scene');
   try{scene?.setPointerCapture(e.pointerId);}catch{}
   e.preventDefault();return;
  }
 }
 const direct=e.target.closest('[data-handle],[data-open-handle]');
 const planHit=pickPlanHandle(e),handle=planHit?.element||direct;
 const hit=planHit|| (direct?{id:direct.dataset.itemId,side:direct.dataset.openHandle||direct.dataset.handle}:
  mode==='ar'&&!drawing&&!e.target.closest('button,input,aside,.editor-header,.bottom-panel,.side-tools')?floor?.pickHandle(e.clientX,e.clientY):null);
 if(!hit||drawing||!currentItems().some(o=>o.id===hit.id))return;
 const initial=handlePosition(currentItems(),hit.id,hit.side);
 if(!initial)return;
 const elevationSvg=handle?.closest('#elevation-view');
 const surface=elevationSvg?'elevation':mode==='ar'?'ar':'plan';
 const ppm=elevationSvg?Number(elevationSvg.dataset.ppm)*elevationSvg.getBoundingClientRect().width/elevationSvg.viewBox.baseVal.width:0;
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
 if(planCalibrationDrag&&e.pointerId===planCalibrationDrag.pointerId){
  const drag=planCalibrationDrag;
  if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<3){e.preventDefault();return;}
  const svg=document.querySelector('#plan-view'),point=svg?planPoint(svg,e):null;
  if(point){const p=currentProject();if(p){
   p.scene.calibration??={a:{x:-.5,z:.65},b:{x:.5,z:.65}};
   const current=p.scene.calibration,old=current[drag.which];
   current[drag.which]={x:Math.round((point.x+drag.dx)*1000)/1000,
    z:Math.round((point.z+drag.dz)*1000)/1000};
   if(Math.hypot(current.b.x-current.a.x,current.b.z-current.a.z)>.10){
    drag.moved=true;showScene();
   }else current[drag.which]=old;
  }}
  e.preventDefault();return;
 }
 if(abDrag&&e.pointerId===abDrag.pointerId){
  if(Math.hypot(e.clientX-abDrag.startX,e.clientY-abDrag.startY)<5){e.preventDefault();return;}
  abDrag.moved=true;floor?.dragCalibrationPoint(e.clientX,e.clientY,abDrag.which);
  e.preventDefault();return;
 }
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
 const cabinet=drawing.tool.startsWith('front-')||['base','upper','fridge','stove','sink','dishwasher','washer','oven'].includes(drawing.tool);
 const snapped=['base','upper'].includes(drawing.tool)?Geo.snapCabinetPoint(currentItems(),point.x,point.z,.85):null;
 const resolved=snapped|| (cabinet?point:Geo.resolvePoint(currentItems(),drawing.start,point.x,point.z,settings));
 hover={x:resolved.x,z:resolved.z,...(snapped?{hostId:snapped.hostId,corner:snapped.corner}:{})};
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
 if(planCalibrationDrag&&e.pointerId===planCalibrationDrag.pointerId){planCalibrationDrag=null;save();return;}
 if(abDrag&&e.pointerId===abDrag.pointerId){abDrag=null;floor?.endCalibrationDrag();
  const p=currentProject();if(p&&floor){p.scene.calibration=floor.calibrationSnapshot();save();}
  return;}
 if(dragHandle){
  if(e.pointerId===dragHandle.pointerId){
   // Tapping a grip without dragging is selection, not a swallowed touch.
   // Check the panel under the 28px grip's transparent finger hit area.
   const panel=!dragHandle.moved&&dragHandle.surface==='elevation'?
    [...document.elementsFromPoint(e.clientX,e.clientY)]
     .map(node=>node.closest?.('.front-panel-elevation')).find(Boolean):null;
   finishResize();
   if(panel?.dataset.itemId)selectAt(null,panel);
  }
  return;
 }
 const scene=e.target.closest('.editor-scene');if(!scene)return;
 if(e.target.closest('[data-action]'))return;
 try{
  if(mode==='3d'&&desktopPreview?.previewWasDragged){desktopPreview.previewWasDragged=false;return;}
  const svg=scene.querySelector('#plan-view');
  const point=mode==='2d'?svg?planPoint(svg,e):null:mode==='ar'?floor?.pick():
   mode==='3d'?desktopPreview?.pickPreviewPoint(e.clientX,e.clientY):null;
  const arId=mode==='ar'&&!drawing?floor?.pickObject(e.clientX,e.clientY):
   mode==='3d'&&!drawing?desktopPreview?.pickPreviewObject(e.clientX,e.clientY):null;
  if(!point&&!arId){if(mode==='ar'&&drawing)tell('نشانگر را روی سطح معتبر بگیر.');return;}
  if(movingEquipmentId){
   if(!point){tell('برای جابه‌جایی، محل جدید را روی کف نشانه بگیر.');return;}
   const result=Geo.moveEquipment(currentItems(),movingEquipmentId,point);
   movingEquipmentId=null;commitChange(result);tell('تجهیزات جابه‌جا شد و صفحه و کابینت بازسازی شدند.');return;
  }
  if(drawing){
    hover=point;
    if(['wall','base','upper'].includes(drawing.tool)){showScene();return;}
    placeAt(point);
   }else selectAt(point,e.target,arId);
 }catch(error){tell(error.message);}
});
document.addEventListener('pointercancel',e=>{
 if(planCalibrationDrag&&e.pointerId===planCalibrationDrag.pointerId){planCalibrationDrag=null;save();}
 if(abDrag&&e.pointerId===abDrag.pointerId){abDrag=null;floor?.endCalibrationDrag();}
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
  if(action==='close-dialog'){dialogs.innerHTML='';pendingUpperEdit=null;return;}
  if(action==='open-style-gallery')return openStyleGallery();
  if(action==='choose-style'){
   const style=KITCHEN_STYLES.find(s=>s.id===button.dataset.style);
   if(!style)throw Error('مدل انتخاب‌شده پیدا نشد.');
   const hadCabinets=currentItems().some(c=>c.kind==='cabinet'&&c.subtype!=='bridge');
   const result=Geo.applyKitchenLayout(currentItems(),style.id);
   dialogs.innerHTML='';commitChange(result,{materials:style.materials,styleId:style.id});
   tell(hadCabinets?'مدل، درب‌ها، کشوها و متریال‌ها اعمال شدند.':'مدل ذخیره شد؛ با نصب کابینت‌ها خودکار اعمال می‌شود.');return;
  }
  if(action==='set-material'){
   const category=button.dataset.surface,material=button.dataset.material;
   const family=category.endsWith('Front')?'front':category.endsWith('Body')?'body':category;
   if(!MATERIALS[family]?.some(m=>m.id===material))throw Error('متریال معتبر نیست.');
   const palette={...DEFAULT_MATERIALS,...currentProject()?.scene?.materials,[category]:material};
   commitChange({items:structuredClone(currentItems()),selectedId:selection},{materials:palette});return;
  }
  if(action==='paint-scope'){
   paintScope=button.dataset.scope;drawSelection();return;
  }
  if(action==='paint-part'){
   paintPart=button.dataset.part;drawSelection();return;
  }
  if(action==='paint-front'){
   const result=Geo.paintFronts(currentItems(),selection,{scope:paintScope,part:paintPart,materialId:button.dataset.material});
   if(!result.paintedCount)throw Error('برای رنگ فریم باید درب قاب‌دار وجود داشته باشد.');
   commitChange(result);tell('رنگ روی '+num(result.paintedCount,0)+' نما اعمال شد.');return;
  }
  if(action==='upper-height-cancel'){pendingUpperEdit=null;dialogs.innerHTML='';return;}
  if(action==='upper-height-single'||action==='upper-height-all'){
   if(!pendingUpperEdit)return;const {id,changes}=pendingUpperEdit;
   const result=action==='upper-height-all'?Geo.applyAllUpperHeights(currentItems(),{height:changes.height,elevation:changes.elevation}):
    Geo.editCabinet(currentItems(),id,changes);
   pendingUpperEdit=null;dialogs.innerHTML='';commitChange(result);return;
  }
  if(action==='toggle-task-light'){
   const p=currentProject();p.scene??={items:[]};p.scene.render??={...defaultRender};
   p.scene.render.taskLighting=!renderSettings().taskLighting;save();floor?.setLighting(renderSettings());showScene();return;
  }
  if(action==='cut-sheet'){
   const c=currentItems().find(o=>o.id===selection&&o.subtype==='base');if(c)openCutSheet(c);return;
  }
  if(action==='bridge'){
   commitChange(Geo.addVerticalBridge(currentItems(),selection,{edge:button.dataset.edge,depthMode:button.dataset.depth,width:Number(document.querySelector('[data-bridge-width]')?.value||.45)}));return;
  }
  if(action==='fridge-over'){
   const e=currentItems().find(o=>o.id===selection&&o.subtype==='fridge');if(!e)return;
   commitChange(Geo.addOverFridgeCabinet(currentItems(),e.id,{depth:button.dataset.depth==='fridge'?e.depth:Number(button.dataset.depth)}));return;
  }
  if(action==='rename')return rename(id);
  if(action==='delete')return remove(id);
  if(action==='confirm-delete'){projects=projects.filter(p=>p.id!==id);save();dialogs.innerHTML='';projectPage();return;}
  if(action==='copy'){const p=projects.find(x=>x.id===id),time=new Date().toISOString();
   projects.unshift({...structuredClone(p),id:uid(),name:p.name+' — کپی',createdAt:time,updatedAt:time});
   save();dialogs.innerHTML='';projectPage();return;}
  if(action==='tool'){
   const chosen=button.dataset.tool,selected=currentItems().find(o=>o.id===selection);
   const host=selected?.kind==='cabinet'?selected:selected?.kind==='front'?currentItems().find(o=>o.id===selected.hostId):null;
   movingEquipmentId=null;drawing={tool:chosen,start:null,hostId:chosen.startsWith('front-')?host?.id:null};
   selection=null;hover=initialPreviewForTool(drawing.tool);showScene();return;
  }
  if(action==='confirm-drawing'){
   if(!drawing)return;
   const point=controlPoint();
   if(drawing.tool==='front-smart')return placeAt(point||initialPreviewForTool(drawing.tool));
   if(!point){tell('نشانگر را روی محل دلخواه در صحنه ببر، سپس تأیید کن.');return;}
   return placeAt(point);
  }
  if(action==='cancel-drawing'){finishLine();return;}
  if(action==='select'){
   drawing=null;movingEquipmentId=null;selection=null;activeTool=null;
   document.querySelectorAll('[data-category]').forEach(b=>b.classList.remove('active'));
   showScene();return;
  }
  if(action==='undo'){undoChange();return;}
  if(action==='redo'){undoChange(true);return;}
  if(action==='fridge-feet'){
   const obj=currentItems().find(x=>x.id===selection);
   if(obj?.subtype==='fridge')commitChange(Geo.editEquipment(currentItems(),obj.id,{fridgeFeet:Number(button.dataset.feet)}));
   return;
  }
  if(action==='sink-size'){
   const obj=currentItems().find(x=>x.id===selection);
   if(obj?.subtype==='sink')commitChange(Geo.editEquipment(currentItems(),obj.id,{sinkSize:Number(button.dataset.size)}));
   return;
  }
  if(action==='equipment-model'){
   const obj=currentItems().find(x=>x.id===selection);
   if(obj?.kind==='equipment')commitChange(Geo.editEquipment(currentItems(),obj.id,{model:button.dataset.model}));
   return;
  }
  if(action==='apply-edit'){applySelection();return;}
  if(action==='move-equipment'){
   const e=currentItems().find(o=>o.id===selection&&o.kind==='equipment');
   if(!e||e.subtype==='hood')throw Error('برای جابجایی یک وسیله مستقل انتخاب کن.');
   movingEquipmentId=e.id;drawing=null;activeTool=null;
   document.querySelectorAll('[data-category]').forEach(b=>b.classList.remove('active'));
   showScene();tell('روی محل جدید وسیله در پلان یا AR بزن.');return;
  }
  if(action==='close-object'){selection=null;showScene();return;}
  if(action==='delete-object'){if(selection){movingEquipmentId=null;commitChange(Geo.removeObject(currentItems(),selection));selection=null;showScene();}return;}
  if(action==='save'){touch(activeId);document.getElementById('save-indicator').textContent='ذخیره‌شده';return tell('پروژه ذخیره شد.');}
  if(action==='start-ar')return beginAR();
  if(action==='rescan'){
   activeTool=null;drawing=null;hover=null;
   document.querySelectorAll('[data-category]').forEach(b=>b.classList.remove('active'));
   showScene();
   calibrationCollapsed=false;
   if(floor?.session){await floor.scan();}
   else {if(floor){floor.cleanup();floor=null;}beginAR();}
   document.getElementById('scan-card')?.classList.remove('complete');
   document.getElementById('editor-root')?.classList.remove('floor-locked');
   document.querySelector('.scan-restart')?.classList.remove('attention');
   updateCalibrationPanel();
   return;
  }
  if(action==='confirm-floor'){
   if(!floor?.confirm())tell('هنوز کف آماده تثبیت نیست.');
   else{document.getElementById('editor-root').classList.add('floor-locked');floor?.setCalibration(currentProject()?.scene?.calibration,true);}
   return;
  }
  if(action==='apply-distance'){
   floor?.calibrate(document.getElementById('real-distance').value);
   calibrationCollapsed=true;updateCalibrationPanel();showScene();return;
  }
  if(action==='toggle-calibration'){
   calibrationCollapsed=!calibrationCollapsed;updateCalibrationPanel();showScene();return;
  }
  if(action==='menu'){document.getElementById('editor-menu').hidden=!document.getElementById('editor-menu').hidden;return;}
  if(action==='close-menu'){document.getElementById('editor-menu').hidden=true;return;}
  if(action==='mode'){
   const next=button.dataset.mode;if(next===mode)return;
   if(next!=='3d')closeDesktopPreview();mode=next;
   document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.mode===mode));
   updateCalibrationPanel();
   document.querySelector('[data-action="rescan"]').hidden=next!=='ar';
   if(next==='ar'){
     activeTool=null;drawing=null;hover=null;
     document.querySelectorAll('[data-category]').forEach(b=>b.classList.remove('active'));
     document.getElementById('scan-status').hidden=false;document.getElementById('scan-card').hidden=false;
     document.getElementById('scan-status').textContent=floor?.locked?'کف تثبیت شده؛ سشن AR فعال است.':'برای شروع اسکن، دوربین AR را فعال کن.';
     showScene();beginAR();updateCalibrationPanel();
    }
   else {document.getElementById('scan-status').hidden=true;document.getElementById('scan-card').hidden=true;document.getElementById('scene-message').classList.add('visible');
    document.getElementById('scene-message').querySelector('h2').textContent=next==='2d'?'پلان دوبعدی':'نمای سه‌بعدی';
    document.getElementById('scene-message').querySelector('p').textContent=next==='2d'?'روی پلان برای ترسیم یا انتخاب آبجکت بزن.':'مدل سه‌بعدی را بچرخان، زوم کن و برای ویرایش آبجکت‌ها را انتخاب کن.';showScene();}
   return;
  }
  if(action==='category'){
   if(mode==='ar'&&!floor?.locked){tell('ابتدا کف را اسکن و تثبیت کن؛ یا وارد نمای ۲بعدی شو.');return;}
   const kind=button.dataset.category;
   activeTool=activeTool===kind?null:kind;drawing=null;movingEquipmentId=null;hover=null;
   document.querySelectorAll('[data-category]').forEach(b=>b.classList.toggle('active',b.dataset.category===activeTool));
   showScene();return;
  }
  if(action==='hide-tools'){activeTool=null;drawing=null;showScene();document.querySelectorAll('[data-category]').forEach(b=>b.classList.remove('active'));return;}
 }catch(error){tell(error.message);}
});
window.addEventListener('popstate',render);window.addEventListener('hashchange',render);
if(loadError)tell('خطا در اطلاعات قبلی؛ داده‌ها دست‌نخورده باقی مانده‌اند.');
render();
