import {FloorAR} from './floor-ar.js?v=fix46';
import * as Geo from './geometry.js?v=fix47';
import {renderPlan,renderPreview,planPoint} from './plan-view.js?v=fix45';
import {resizeFromHandle,handlePosition,renderElevation,renderCabinetElevation,renderFrontElevation} from './edit-handles.js?v=fix46';
import {MATERIALS,DEFAULT_MATERIALS,KITCHEN_STYLES,resolveFinish,assetUrl} from './materials.js?v=fix43';
import {DEFAULT_TILE_LAYOUT,validateTileLayout} from './tile-layout.js?v=fix43';
import {buildCutReport} from './report-data.js?v=nest35';
import {renderCutReport} from './report-view.js?v=sheetpager39';
import {downloadCutReportXlsx} from './report-xlsx.js?v=nest35';
import {DEFAULT_SHEET,validateSheetOptions} from './sheet-nesting.js?v=nest35';
const STORAGE='kitchyar.ui.v2';
const app=document.getElementById('app'),dialogs=document.getElementById('dialog-root'),toastNode=document.getElementById('toast');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=value=>new Date(value).toLocaleDateString('fa-IR',{year:'numeric',month:'short',day:'numeric'});
let projects=[],floor=null,desktopPreview=null,mode='ar',activeTool=null,activeId=null,toastTimer=null,loadError=null;
let selection=null,drawing=null,hover=null,pendingUpperEdit=null,undoStack=[],redoStack=[],dragHandle=null,abDrag=null,planCalibrationDrag=null;
let selectedUnit=null,lastFrontTap=null;
let inspectorOpen=false,inspectorSelectionKey=null;
let paintScope='single',paintPart='panel';
let movingEquipmentId=null;
let sessionProjectId=null,parkedEditor=null,parkedMode='ar',calibrationCollapsed=false;
let wideLevel='wide';
let facadesHidden=false,roomSurfacesVisible=false,fridgeFreestanding=false;
let styleApplyToken=0,selectedGalleryStyleId=null;
let reportSheetOptions={...DEFAULT_SHEET};
let miniLastHost=null,miniLastItems=null,miniLastCalibration='',miniLastFacadesHidden=null;
const trackedView=()=>mode==='ar'||(mode==='3d'&&!!floor?.wideActive);
const settings={thickness:.12,height:3.6,pointSnap:true,angleSnap:true,gridSnap:true,baseDepth:.6,upperDepth:.35,upperHeight:.72,upperElevation:1.55};
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
 if(autoAR&&(!floor?.session||sessionProjectId!==hash.slice(9)))beginAR();
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
 const p={id:uid(),name:'آشپزخانه جدید',createdAt:now,updatedAt:now,scene:{items:[],render:{...defaultRender},frontRules:{...Geo.DEFAULT_FRONT_RULES},materials:{...DEFAULT_MATERIALS},tileLayout:{...DEFAULT_TILE_LAYOUT},calibration:{a:{x:-.5,z:.65},b:{x:.5,z:.65}},ceilingHeight:3.6},revision:0};
 projects.unshift(p);save();go('#/editor/'+p.id,true);
}
function welcome(){
 app.innerHTML='<main class="welcome"><img class="welcome-photo" src="https://maxlightner.github.io/tolica-ar/assets/welcome.png" alt=""><div class="welcome-title"><h1>KITCHYAR</h1><p>آشپزخانه را پیش از ساخت ببین.</p></div><div class="welcome-actions"><button class="primary" data-action="projects">پروژه‌های من <span>←</span></button><button data-action="new">＋ ایجاد پروژه جدید</button><span class="wordmark">KITCHYAR</span></div></main>';
}
function projectPage(){
 const sorted=[...projects].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
 app.innerHTML='<div class="page"><header class="page-header"><button class="back" data-action="home">← خانه</button><strong>KITCHYAR</strong><span>۲ / پروژه‌ها</span></header><main class="projects"><div class="page-heading"><span>YOUR WORKSPACE</span><h1>پروژه‌های من</h1><p>هر پروژه، یک فضای مستقل با ذخیره‌سازی محلی.</p></div><div class="project-grid"><button class="new-card" data-action="new"><span>＋</span><strong>پروژه جدید</strong><small>شروع با شناسایی کف در AR</small></button>'+
 sorted.map(p=>'<article class="project-card"><div class="project-art"><div class="room-icon"><i></i><i></i></div></div><div class="project-detail"><h2>'+esc(p.name)+'</h2><p>ویرایش: '+date(p.updatedAt)+'</p><div class="project-actions"><button class="primary" data-action="open" data-id="'+esc(p.id)+'">ورود به ویرایشگر AR</button><button data-action="open-report" data-id="'+esc(p.id)+'">گزارش ساخت</button><button data-action="more" data-id="'+esc(p.id)+'" aria-label="گزینه‌های پروژه">⋯</button></div></div></article>').join('')+
 '</div></main></div>';
}
function reportPage(id){
 const project=projects.find(p=>p.id===id);
 if(!project){go('#/projects');return;}
 app.innerHTML=renderCutReport(buildCutReport(project,reportSheetOptions));
}
function moveReportSheet(direction){
 const pages=[...document.querySelectorAll('[data-report-sheet-page]')];
 if(pages.length<2)return;
 const current=pages.findIndex(page=>!page.hidden),next=Math.max(0,Math.min(pages.length-1,current+direction));
 if(next===current)return;
 pages.forEach((page,i)=>page.hidden=i!==next);
 const status=document.getElementById('report-sheet-indicator');
 if(status)status.textContent='ورق '+num(next+1,0)+' از '+num(pages.length,0)+' · '+
  (pages[next].querySelector('.report-drawing-head strong')?.textContent||'');
 document.querySelector('[data-action="report-sheet-prev"]').disabled=next===0;
 document.querySelector('[data-action="report-sheet-next"]').disabled=next===pages.length-1;
}
const categories=[
 ['architecture','معماری','▤'],['cabinets','کابینت','▣'],['equipment','تجهیزات','▥'],
 ['fronts','در و کشو','▦'],['material','متریال','◩'],['decor','دکوری','✦']
];
function editorPage(id){
 const p=projects.find(x=>x.id===id);if(!p){go('#/projects');return;}
 settings.height=Number(p.scene?.ceilingHeight??p.scene?.items?.find(o=>o.kind==='wall')?.height??3.6);
 activeId=id;mode='ar';facadesHidden=false;roomSurfacesVisible=false;fridgeFreestanding=false;selectedUnit=null;lastFrontTap=null;activeTool=null;selection=null;drawing=null;hover=null;abDrag=null;movingEquipmentId=null;undoStack=[];redoStack=[];calibrationCollapsed=false;paintScope='single';paintPart='panel';
 app.innerHTML='<main class="editor-root" id="editor-root"><div class="editor-scene"><div class="scene-grid"></div><div class="plan-host" id="plan-host" hidden></div><div class="drawing-hint" id="drawing-hint" hidden></div><aside class="elevation-panel" id="elevation-panel" hidden></aside><div class="scene-message" id="scene-message"><span class="scan-orbit"></span><h2>آماده شناسایی کف</h2><p>پس از ورود، دوربین روی کف قرار می‌گیرد. برای اسکن به گوشی سازگار با ARCore نیاز است.</p><button data-action="start-ar">فعال‌سازی دوربین AR</button></div></div>'+
 '<header class="editor-header"><button class="editor-back" data-action="projects">← پروژه‌ها</button><div class="editor-name"><strong>'+esc(p.name)+'</strong><span id="save-indicator">ذخیره‌شده روی دستگاه</span></div><div class="mode-switch"><button class="selected" data-action="mode" data-mode="ar">AR</button><button data-action="mode" data-mode="3d">3D</button><button data-action="mode" data-mode="2d">2D</button><button data-action="open-report" data-id="'+esc(p.id)+'">گزارش</button></div><button class="save-button" data-action="save">ذخیره</button></header>'+
 '<div class="wide-view-settings" id="wide-view-settings" hidden><strong>دید سه‌بعدی زنده</strong><div class="wide-view-options"><button data-action="wide-fov" data-wide-mode="normal">Normal · 60°</button><button class="selected" data-action="wide-fov" data-wide-mode="wide">Wide · 84°</button><button data-action="wide-fov" data-wide-mode="ultra">Ultra · 100°</button></div><small>ارتفاع و موقعیت از دوربین AR · مقیاس ۱:۱</small></div>'+
 '<div class="ar-toolbar"><button data-action="menu">منوی کیچیار</button><button data-action="rescan">شروع / اسکن مجدد کف ↻</button><span id="scan-status" role="status">در حال آماده‌سازی دوربین AR…</span></div>'+
 '<aside class="editor-menu" id="editor-menu" hidden><strong>KITCHYAR · تنظیمات رندر</strong><label>ارتفاع دیوارها و سقف (متر)<input data-ceiling-height type="number" min="2" max="9" step=".01" value="'+(Number(p.scene?.ceilingHeight)||3.6)+'"></label><label>جهت نور (درجه)<input data-render="sunAzimuth" type="range" min="-180" max="180" value="'+renderSettings().sunAzimuth+'"></label><label>ارتفاع نور (درجه)<input data-render="sunElevation" type="range" min="10" max="85" value="'+renderSettings().sunElevation+'"></label><label>شدت نور جهت‌دار<input data-render="sunIntensity" type="range" min=".3" max="4" step=".1" value="'+renderSettings().sunIntensity+'"></label><label>شدت اکلوژن محیطی<input data-render="aoStrength" type="range" min="0" max="1" step=".05" value="'+renderSettings().aoStrength+'"></label><label class="check-row">نور خطی زیر کابینت هوایی<input data-render="taskLighting" type="checkbox" '+(renderSettings().taskLighting?'checked':'')+'></label><label>شدت نور کابینت<input data-render="taskIntensity" type="range" min="0" max="4" step=".1" value="'+renderSettings().taskIntensity+'"></label><div class="render-note">بازتاب کابینت ۱۰٪ · کف سفید ۵۰٪ · سایه نرم</div><button data-action="save">ذخیره پروژه</button><button data-action="projects">مدیریت پروژه‌ها</button><button data-action="close-menu">ادامه ویرایش</button></aside>'+
 '<section class="scan-card" id="scan-card"><button class="scan-restart" data-action="rescan">شروع / اسکن دوبارهٔ کف ↻</button><div class="scan-head"><strong id="scan-stage">در انتظار اسکن کف</strong><span id="scan-pct">۰٪</span></div><progress id="scan-progress" max="100" value="0"></progress><small>آمادگی بر اساس برخوردهای معتبر و نمونه‌های مستقل است؛ درصد ARCore نیست.</small><div class="scan-info"><span id="scan-hits">برخورد معتبر: ۰</span><span id="anchor-count">Anchor: ۰ / ۵</span></div></section>'+
 '<button id="calibration-toggle" class="calibration-toggle" data-action="toggle-calibration" hidden>تنظیم کف و نقاط A/B ▴</button><div class="scan-confirm"><button class="primary" id="confirm-floor" data-action="confirm-floor" disabled>تثبیت این کف</button><div id="calibration" hidden><p class="calibration-help">A و B را روی صحنه بگیر و بکش؛ جهت شبکه همان لحظه تغییر می‌کند.</p><label>فاصله واقعی A تا B (متر)<input type="number" id="real-distance" value="1" min=".1" max="20" step=".01"></label><button data-action="apply-distance">اعمال مقیاس</button></div></div>'+
 '<div class="side-tools"><div class="side-basic"><button data-action="select" aria-label="انتخاب">⌖</button><button data-action="undo" disabled aria-label="بازگشت تغییر">↶</button><button data-action="redo" disabled aria-label="انجام دوباره">↷</button><button data-action="open-style-gallery" title="گالری آشپزخانه" aria-label="گالری نمونه‌های آشپزخانه">▣</button><button class="front-visibility-toggle" data-action="toggle-facades" aria-pressed="false" aria-label="مخفی‌کردن همه درب‌ها و پیشانی کشوها" title="مخفی‌کردن درب‌ها و کشوها برای دیدن یونیت‌ها"><span>▤</span><small>درب‌ها</small></button><button class="front-visibility-toggle" data-action="toggle-surfaces" aria-pressed="false" title="نمایش / مخفی‌کردن سقف و کف"><span>▱</span><small>سقف/کف</small></button></div></div><div class="aim-marker" id="aim-marker" hidden><span>＋</span><small id="aim-label">محل ترسیم</small></div>'+
 '<div class="mini-map"><span>پلان زنده</span><div id="mini-plan" class="mini-plan"></div><small id="item-count">هنوز آبجکتی در صحنه نیست</small></div>'+
 '<button id="object-editor-tab" class="object-editor-tab" data-action="toggle-inspector" aria-controls="object-editor" aria-expanded="false" hidden>⚙ تنظیمات انتخاب</button><aside class="object-editor" id="object-editor" hidden></aside><div class="bottom-panel"><div id="draw-controls" class="draw-controls" hidden><button class="primary" data-action="confirm-drawing">تأیید</button><button data-action="cancel-drawing">لغو</button></div><div class="tool-sheet" id="tool-sheet" hidden></div><nav class="dock">'+categories.map(([id,name,icon])=>'<button data-action="category" data-category="'+id+'"><span>'+icon+'</span><small>'+name+'</small></button>').join('')+'</nav></div>'+
 '</main>';
 // WebXR only exposes descendants of its DOM Overlay root. Keeping dialogs
 // outside it made gallery/rule windows appear only after leaving AR.
 document.getElementById('editor-root').appendChild(dialogs);
 showScene();
}
function render(){
 const hash=location.hash||'#/welcome',target=hash.startsWith('#/editor/')?hash.slice(9):null;
 const reportId=hash.startsWith('#/report/')?hash.slice(9):null;
 if(!target){
  if(dialogs.parentElement?.id==='editor-root')document.body.appendChild(dialogs);
  dialogs.replaceChildren();
 }
 if(target&&floor?.session&&sessionProjectId===target){
  if(parkedEditor){parkedEditor.classList.remove('session-parked');app.replaceChildren(parkedEditor);parkedEditor=null;}
  document.getElementById('editor-root')?.appendChild(dialogs);
  mode=parkedMode;document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.mode===mode));
  document.getElementById('editor-root')?.classList.add('ar-live');
  document.getElementById('scan-status').hidden=mode!=='ar';
  document.getElementById('wide-view-settings').hidden=mode!=='3d'||!floor.wideActive;
  updateCalibrationPanel();showScene();return;
 }
 if(!target&&floor?.session&&sessionProjectId===activeId){
  const root=document.getElementById('editor-root');
  if(root){parkedEditor=root;parkedMode=mode;document.body.appendChild(root);root.classList.add('session-parked');}
 }else if(floor||desktopPreview)closeFloor();
 if(target)editorPage(target);
 else if(reportId)reportPage(reportId);
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
    if(mode==='3d'){
     document.getElementById('wide-view-settings').hidden=true;
     tell('ردیابی AR پایان یافت؛ نمای سه‌بعدی آزاد جایگزین شد.');
     showScene();
    }
   });
  floor=instance;sessionProjectId=activeId;
  instance.onWideViewError=message=>{
   if(floor===instance&&mode==='3d'){
    mode='ar';
    document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.mode===mode));
    document.getElementById('wide-view-settings').hidden=true;
    document.getElementById('scan-status').hidden=false;
    updateCalibrationPanel();showScene();
   }
   tell(message);
  };
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
 selectedGalleryStyleId=null;
 dialogs.innerHTML='<div class="dialog-cover"><div class="dialog style-dialog"><div class="style-dialog-head"><h2>انتخاب نمونه آشپزخانه</h2><button data-action="close-dialog">×</button></div><p>هر سبک، چیدمان کدنویسی‌شده درب‌ها، کشوها، دستگیره‌ها و متریال‌ها دارد. حتی پیش از نصب کابینت می‌توانی سبک را انتخاب کنی.</p><div class="style-grid">'+
  KITCHEN_STYLES.map(s=>'<button data-action="select-style" data-style="'+s.id+'"><img src="'+assetUrl(s.image)+'" alt="نمونه '+s.label+'"><strong>'+s.label+'</strong><small>'+s.description+'</small></button>').join('')+
  '</div><div class="dialog-actions"><button class="primary" data-action="apply-style" disabled>اعمال طرح انتخاب‌شده</button><button data-action="close-dialog">انصراف</button></div></div></div>';
}
const currentFrontRules=()=>({...Geo.DEFAULT_FRONT_RULES,...currentProject()?.scene?.frontRules});
function openFrontRules(scope='global'){
 const chosen=currentItems().find(o=>o.id===selection);
 const host=chosen?.kind==='front'?currentItems().find(o=>o.id===chosen.hostId):chosen?.kind==='cabinet'?chosen:null;
 const front=chosen?.kind==='front'?chosen:null;
 if(scope==='connected'&&!host||scope==='single'&&!front)scope='global';
 const rules=scope==='connected'?Geo.resolvedFrontRules(host):currentFrontRules();
 const opt=(values,current)=>values.map(([id,name])=>'<option value="'+id+'" '+(id===current?'selected':'')+'>'+name+'</option>').join('');
 const field=(name,label,value,min,max,step)=>'<label>'+label+'<input data-front-rule="'+name+'" type="number" min="'+min+'" max="'+max+'" step="'+step+'" value="'+Number(value).toFixed(3)+'"></label>';
 const single=scope==='single';
 const form=single?'<div class="front-rule-fields">'+
  field('width','عرض همین نما (متر)',(front.endT-front.startT)*Geo.lengthOf(host),.15,1.2,.01)+
  field('height','ارتفاع همین نما (متر)',(front.topT-front.bottomT)*host.height,.10,host.height,.01)+
  field('gap','فاصله بین نماها (متر)',front.gap??rules.gap,.001,.012,.001)+
  (front.subtype==='door'?'<label>جهت لولای این درب<select data-front-rule="hinge">'+opt([['left','چپ'],['right','راست'],['top','بالا']],front.hinge)+'</select></label>':'')+
  '<label>دستگیره همین نما<select data-front-rule="handleStyle">'+opt([['bar','میله‌ای'],['knob','دکمه‌ای'],['hidden','مخفی']],front.handleStyle)+'</select></label></div><p class="front-rule-hint">فقط تنظیمات تغییرکرده به عنوان استثنای دستی ثبت می‌شود. تقسیم‌بندی دستی با انتخاب مدل جدید حفظ می‌شود.</p>':
  '<div class="front-rule-fields">'+
  field('minDoorWidth','حداقل عرض درب (متر)',rules.minDoorWidth,.15,1.2,.01)+
  field('maxDoorWidth','حداکثر عرض درب (متر)',rules.maxDoorWidth,.15,1.2,.01)+
  field('gap','فاصله درز نما (متر)',rules.gap,.001,.012,.001)+
  '<label>لولای درب تکی<select data-front-rule="singleHinge">'+opt([['left','چپ'],['right','راست']],rules.singleHinge)+'</select></label>'+
  '<label>لولای درب جفت<select data-front-rule="pairHinge">'+opt([['outer','دو طرف بیرونی'],['inner','دو طرف داخلی']],rules.pairHinge)+'</select></label>'+
  '<label>دستگیره پیش‌فرض<select data-front-rule="handleStyle">'+opt([['bar','میله‌ای'],['knob','دکمه‌ای'],['hidden','مخفی']],rules.handleStyle)+'</select></label>'+
  '<label class="check-row front-rule-toggle">هم‌راستاسازی افقی کشوها و درب‌ها<input type="checkbox" data-front-rule="alignRows" '+(rules.alignRows?'checked':'')+'></label></div>'+
  '<p class="front-rule-hint">'+(scope==='global'?'روی همه کابینت‌ها اعمال می‌شود؛ استثناهای گروهی و دستی محفوظ می‌مانند.':'روی کابینت‌های متصل و هم‌تراز اعمال می‌شود؛ تغییرات تکی محفوظ می‌مانند.')+'</p>';
 dialogs.innerHTML='<div class="dialog-cover"><div class="dialog front-rules-dialog"><div class="style-dialog-head"><h2>قوانین درب و کشو</h2><button data-action="close-dialog" aria-label="بستن">×</button></div><div class="front-rule-scopes">'+
  [['global','کل آشپزخانه'],['connected','گروه متصل'],['single','یک درب / کشو']].map(([id,label])=>'<button data-action="front-rule-scope" data-scope="'+id+'" class="'+(scope===id?'active':'')+'" '+(id==='connected'&&!host||id==='single'&&!front?'disabled title="ابتدا نما یا کابینت انتخاب کن"':'')+'>'+label+'</button>').join('')+'</div>'+form+
  '<div class="dialog-actions"><button class="primary" data-action="apply-front-rules" data-scope="'+scope+'">اعمال و هم‌ترازسازی</button><button data-action="close-dialog">انصراف</button></div></div></div>';
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
const currentTileLayout=()=>({...DEFAULT_TILE_LAYOUT,...currentProject()?.scene?.tileLayout});
const num=(v,d=2)=>Number(v).toLocaleString('fa-IR',{maximumFractionDigits:d});
const value=(name,defaultValue)=>Number(document.querySelector('[data-edit="'+name+'"]')?.value??defaultValue);
function drawTools(){
 const sheet=document.getElementById('tool-sheet');if(!sheet)return;
 sheet.hidden=!activeTool;if(!activeTool)return;
 const head='<div class="tool-sheet-head"><strong>ابزارهای '+esc({
  architecture:'معماری',cabinets:'کابینت',equipment:'تجهیزات',
  fronts:'درب و کشو',material:'متریال',decor:'دکوری'}[activeTool]||'ویرایش')+
  '</strong><button data-action="hide-tools" aria-label="بستن پنل ابزار">× بستن</button></div>';
 if(activeTool==='material'){
  const chosen={...DEFAULT_MATERIALS,...currentProject()?.scene?.materials};
  const tileLayout=currentTileLayout();
  sheet.innerHTML=head+'<div class="material-tool-head"><strong>متریال‌های مستقل آشپزخانه</strong><button data-action="open-style-gallery">گالری نمونه‌های آشپزخانه</button></div>'+
   Object.entries({baseBody:'بدنه نمایان زمینی',upperBody:'بدنه نمایان هوایی',baseFront:'درب و کشوی زمینی',upperFront:'درب هوایی',counter:'صفحه رویه',backsplash:'بین‌کابینتی خودکار'}).map(([key,title])=>
    '<div class="material-family"><strong>'+title+'</strong><div class="material-options">'+MATERIALS[key.endsWith('Front')?'front':key.endsWith('Body')?'body':key].map(m=>
    '<button data-action="set-material" data-surface="'+key+'" data-material="'+m.id+'" class="'+((key.endsWith('Front')||key.endsWith('Body')?resolveFinish(chosen,key.startsWith('upper')?'upper':'base',key.endsWith('Body')?'body':'front'):chosen[key])===m.id?'active':'')+'">'+
    (m.file?'<img loading="lazy" src="'+assetUrl(m.file)+'" alt="">':'<span class="material-color" style="background:#'+m.color.toString(16).padStart(6,'0')+'"></span>')+
    '<small>'+m.label+'</small></button>').join('')+'</div></div>').join('')+
   '<div class="tile-layout-panel"><strong>چیدمان خودکار کاشی بین‌کابینتی</strong><div class="tile-layout-fields">'+
   '<label>الگوی نصب<select data-tile-layout="pattern">'+[
    ['grid','منظم'],['brick','آجری'],['herringbone','جناقی'],['diagonal','مورب ۴۵ درجه'],['vertical','عمودی'],['mixed','ترکیبی']]
    .map(([id,label])=>'<option value="'+id+'" '+(tileLayout.pattern===id?'selected':'')+'>'+label+'</option>').join('')+'</select></label>'+
   [['width','عرض کاشی (متر)'],['height','ارتفاع کاشی (متر)'],['grout','ضخامت بند (متر)']].map(([key,label])=>
    '<label>'+label+'<input type="number" data-tile-layout="'+key+'" value="'+tileLayout[key]+'" min="'+(key==='grout'?.001:key==='width'?.05:.035)+'" max="'+(key==='grout'?.015:key==='width'?.6:.45)+'" step="'+(key==='grout'?.001:.005)+'"></label>').join('')+
   '<label>رنگ بندکشی<input type="color" data-tile-layout="groutColor" value="'+tileLayout.groutColor+'"></label></div>'+
   '<button class="primary" data-action="apply-tile-layout">اعمال الگو و بندکشی</button><small>کاشی‌ها به‌صورت هندسی چیده می‌شوند؛ تکسچر مستقل و سبک قبلی حفظ می‌شود.</small></div>'+
   '<p class="material-note">بافت‌ها فایل مستقل دارند؛ اندازه و جهت رگه روی هر پنل بر اساس ابعاد واقعی تنظیم می‌شود. کاشی بین کابینتی خودکار است.</p>';
  return;
 }
 const tools=activeTool==='architecture'?[['wall','دیوار'],['window','پنجره ثابت'],['door','در']]:
  activeTool==='cabinets'?[['base','کابینت زمینی'],['upper','کابینت هوایی'],['tall','ستون تمام‌قد']]:
  activeTool==='equipment'?[['fridge','یخچال'],['stove','اجاق گاز'],['sink','سینک'],
   ['dishwasher','ماشین ظرفشویی'],['washer','ماشین لباسشویی'],['oven','فر توکار'],['microwave','مایکروویو توکار']]:
  activeTool==='fronts'?[['front-smart','طراحی هوشمند کل آشپزخانه'],['front-doors','درب بازشو'],['front-drawers2','۲ کشوی مساوی'],['front-drawers3','۳ کشوی مساوی'],['front-drawers4','۴ کشوی مساوی'],['front-graduated','۳ کشوی پلکانی'],['front-mixed','کشوی بالا + دو درب'],['front-mixedLower','دو درب بالا + کشوی پایین']]:[];
 if(!tools.length){sheet.innerHTML=head+'<span>ابزارهای این بخش در مرحله بعد اضافه می‌شوند.</span>';return;}
 const wallTools=activeTool==='architecture';
 sheet.innerHTML=head+(activeTool==='fronts'?'<div class="front-tools-actions"><button class="style-gallery-trigger" data-action="open-style-gallery">▣ انتخاب مدل از گالری آشپزخانه</button><button data-action="open-front-rules">⚙ قوانین درب، کشو و هم‌ترازی</button></div>':'')+'<div class="tool-choices">'+tools.map(([id,label])=>
  '<button class="'+(drawing?.tool===id?'active':'')+'" data-action="tool" data-tool="'+id+'">'+label+'</button>').join('')+'</div>'+
  (activeTool==='fronts'?'<p class="equipment-help">طرح هوشمند تمام کابینت‌ها را یک‌جا با سینک، گاز، فر و یخچال هماهنگ می‌کند. پیش‌نمایش را ببین و تأیید کن؛ برای تغییر یک کابینت آن را انتخاب کن و یک طرح دیگر بزن.</p>':activeTool==='equipment'?'<p class="equipment-help">یخچال روی کف یا داخل کابینت قرار می‌گیرد؛ گاز و سینک روی صفحه و ظرفشویی، لباسشویی و فر زیر صفحه نصب می‌شوند.</p><label class="check-row">یخچال مستقل؛ بدون کابینت دور آن<input data-fridge-free type="checkbox" '+(fridgeFreestanding?'checked':'')+'></label>':wallTools?'<div class="tool-settings"><label>ضخامت دیوار (متر)<input data-setting="thickness" type="number" min=".07" max=".8" step=".01" value="'+settings.thickness+'"></label>'+
   '<label>ارتفاع دیوارها و سقف (متر)<input data-setting="height" type="number" min="2" max="9" step=".1" value="'+settings.height+'"></label></div>':
   '<div class="tool-settings"><label>عمق زمینی (متر)<input data-setting="baseDepth" type="number" min=".2" max="1.2" step=".05" value="'+settings.baseDepth+'"></label>'+
   '<label>عمق هوایی (متر)<input data-setting="upperDepth" type="number" min=".2" max="1.2" step=".05" value="'+settings.upperDepth+'"></label>'+'<label>ارتفاع کابینت هوایی (متر)<input data-setting="upperHeight" type="number" min=".25" max="1.8" step=".01" value="'+settings.upperHeight+'"></label>'+'<label>ارتفاع نصب از کف (متر)<input data-setting="upperElevation" type="number" min="0" max="3" step=".01" value="'+settings.upperElevation+'"></label></div>')+
  '<div class="snap-options"><label><input type="checkbox" data-setting="pointSnap" '+(settings.pointSnap?'checked':'')+'> اسنپ نقطه</label>'+
  '<label><input type="checkbox" data-setting="angleSnap" '+(settings.angleSnap?'checked':'')+'> زاویه ۴۵°</label>'+
  '<label><input type="checkbox" data-setting="gridSnap" '+(settings.gridSnap?'checked':'')+'> شبکه ۱ سانتی</label>'+
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
 const tab=document.getElementById('object-editor-tab');
 const key=!drawing&&(selectedUnit?'unit:'+selectedUnit.hostId:selection?'object:'+selection:null);
 if(key!==inspectorSelectionKey){inspectorOpen=false;inspectorSelectionKey=key;}
 if(tab){tab.hidden=!key;tab.setAttribute('aria-expanded',String(!!key&&inspectorOpen));}
 panel.hidden=!key||!inspectorOpen;
 if(!key)return;
 if(selectedUnit&&!drawing){
  const host=currentItems().find(o=>o.id===selectedUnit.hostId);
  if(host){
   const width=(selectedUnit.endT-selectedUnit.startT)*Geo.lengthOf(host);
   panel.innerHTML='<div class="object-head"><strong>یونیت انتخاب‌شده · '+num(width)+' متر</strong><button data-action="close-object" aria-label="بستن">×</button></div>'+
    '<p class="unit-editor-hint">تغییر نوع همین یونیت؛ درب‌ها و کشوهای یونیت‌های مجاور دست‌نخورده می‌مانند.</p>'+
    '<div class="unit-convert-actions">'+[['doors','درب لولایی'],['drawers2','۲ کشو'],['drawers3','۳ کشو'],['drawers4','۴ کشو']].map(([preset,label])=>
     '<button data-action="convert-unit" data-unit-preset="'+preset+'">'+label+'</button>').join('')+'</div>'+
    '<small>یک بار لمس: تنظیمات نما · دو بار: بازکردن · سه بار: انتخاب یونیت</small>';
   return;
  }
  selectedUnit=null;
 }
 const obj=currentItems().find(x=>x.id===selection);
 if(!obj||drawing){if(tab)tab.hidden=true;panel.hidden=true;return;}
 const previousScroll=panel.dataset.selectionId===obj.id?panel.scrollTop:0;
 const field=(key,title,val,min,step='.01')=>'<label>'+title+'<input type="number" data-edit="'+key+'" value="'+Number(val).toFixed(2)+'" min="'+min+'" step="'+step+'"></label>';
 let fields='',title=obj.name;
 if(obj.kind==='wall')fields=field('length','طول (متر)',Geo.lengthOf(obj),.1)+field('thickness','ضخامت (متر)',obj.thickness,.07)+field('height','ارتفاع همه دیوارها (متر)',obj.height,2);
 if(obj.kind==='opening'){
  const host=currentItems().find(x=>x.id===obj.hostId);
  fields=field('width','عرض (متر)',obj.width,.3)+field('height','ارتفاع (متر)',obj.height,.3)+
   field('sill','ارتفاع نصب (متر)',obj.sill,0)+field('offset','فاصله از ابتدای دیوار',obj.hostT*Geo.lengthOf(host),.1);
  if(obj.style==='door')fields+=field('openFraction','میزان بازشدن در (۰ تا ۱)',obj.openFraction||0,0,'.05')+
   '<label class="check-row">جهت لولا<input type="checkbox" data-edit="mirrored" '+(obj.mirrored?'checked':'')+'></label>';
  else fields+=field('openFraction','میزان بازشدن لت‌ها (۰ تا ۱)',obj.openFraction||0,0,'.05');
 }
 const windowControls=obj.kind==='opening'&&obj.style==='fixed'?'<div class="model-choices"><strong>تقسیم عمودی پنجره · سبک کشویی ایرانی</strong><div class="model-choices-grid">'+
  [['single','یک لت'],['double','۲ لت'],['triple','۳ لت'],['quad','۴ لت']].map(([id,label])=>
   '<button data-action="window-model" data-model="'+id+'" class="'+((obj.windowModel||'double')===id?'active':'')+'">'+label+'</button>').join('')+'</div><strong>نوع بازشو</strong><div class="model-choices-grid">'+
  [['sliding','کشویی ایرانی'],['casement','لولایی ایرانی'],['fixed','ثابت']].map(([id,label])=>
   '<button data-action="window-operation" data-model="'+id+'" class="'+((obj.windowOperation||'sliding')===id?'active':'')+'">'+label+'</button>').join('')+'</div></div>':'';
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
 const faucetControls=obj.subtype==='sink'?'<div class="model-choices"><strong>مدل شیرآلات</strong><div class="model-choices-grid">'+Geo.FAUCET_MODELS.map(m=>
  '<button data-action="faucet-model" data-model="'+m.id+'" class="'+((obj.faucetModel||'arc')===m.id?'active':'')+'">'+m.label+'</button>').join('')+'</div></div>':'';
 const fridgeControls=obj.subtype==='fridge'?'<div class="model-choices"><strong>نصب یخچال</strong><div class="model-choices-grid">'+
  '<button data-action="fridge-installation" data-free="true" class="'+(!obj.builtIn?'active':'')+'">مستقل و آزاد</button>'+
  '<button data-action="fridge-installation" data-free="false" class="'+(obj.builtIn?'active':'')+'">بین کابینت‌ها</button></div></div>':'';
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
 const openControls=obj.kind==='front'?'<div class="front-opening-panel"><button class="primary" data-action="toggle-front" aria-label="'+(obj.openFraction>.01?'بستن':'باز کردن')+' '+(obj.subtype==='drawer'?'کشو':'درب')+'">'+
  (obj.openFraction>.01?'بستن '+(obj.subtype==='drawer'?'کشو':'درب'):'باز کردن '+(obj.subtype==='drawer'?'کشو':'درب'))+
  '</button><small>فقط هنگام بازشدن، فضای داخلی سفید همین قسمت ساخته و نمایش داده می‌شود.</small></div>':'';
 const decorControls=obj.kind==='cabinet'&&obj.subtype!=='bridge'?(()=>{
  const decor=Geo.resolvedCabinetDecor(obj),choose=(key,title,options)=>'<label>'+title+'<select data-decor="'+key+'">'+options.map(([id,label])=>
   '<option value="'+id+'" '+(decor[key]===id?'selected':'')+'>'+label+'</option>').join('')+'</select></label>';
  return '<div class="cabinet-decor-panel"><strong>جزئیات نهایی و تزئینی</strong><div class="cabinet-decor-fields">'+
   choose('toeKick','پاخور',[['recessed','عقب‌نشسته'],['flush','هم‌سطح'],['body','هم‌رنگ بدنه']])+
   choose('endPanel','پنل انتهایی',[['plain','ساده'],['framed','قاب‌دار'],['none','بدون پنل تزئینی']])+
   choose('crown','تاج بالای کابینت',[['none','بدون تاج'],['modern','مدرن'],['classic','کلاسیک']])+
   choose('wallFiller','پرکننده کنار دیوار',[['none','خاموش'],['auto','خودکار تا ۲۰ سانتی‌متر']])+
   choose('pilaster','ستونک تزئینی',[['none','بدون ستونک'],['slim','باریک'],['classic','کلاسیک']])+
   choose('trim','نوار نمای کابینت',[['none','بدون نوار'],['vertical','عمودی'],['horizontal','افقی'],['both','عمودی و افقی']])+
   '</div><label class="check-row">اعمال روی کابینت‌های متصل<input type="checkbox" data-decor-connected></label>'+
   '<button class="primary" data-action="apply-cabinet-decor">اعمال جزئیات ظاهری</button></div>';
 })():'';
 const counterControls=obj.kind==='cabinet'&&obj.subtype==='base'?(()=>{
  const c=Geo.resolvedCountertopDesign(obj),choose=(key,title,entries)=>'<label>'+title+'<select data-counter-design="'+key+'">'+entries.map(([id,name])=>
   '<option value="'+id+'" '+(c[key]===id?'selected':'')+'>'+name+'</option>').join('')+'</select></label>';
  const field=(key,title,max)=>'<label>'+title+' (متر)<input data-counter-design="'+key+'" type="number" min="0" max="'+max+'" step=".01" value="'+Number(c[key]).toFixed(2)+'"></label>';
  return '<details class="design-details"><summary>طراحی پارامتریک صفحه کابینت</summary><div class="design-fields">'+
   choose('edge','فرم لبه',[['square','صاف'],['round','گرد'],['bevel','پخ'],['thick','ضخیم‌نما']])+
   choose('waterfall','صفحه آبشاری',[['none','خاموش'],['start','سمت آغاز'],['end','سمت پایان'],['both','هر دو سمت']])+
   field('overhang','پیش‌آمدگی نشیمن',.5)+field('raisedHeight','اختلاف ارتفاع صفحه دوم',.25)+
   field('cornerRadius','گردی گوشه‌ها',.18)+field('curve','انحنای لبه جلو',.16)+'</div>'+
   '<label class="check-row">اعمال به زمینی‌های متصل<input type="checkbox" data-counter-connected></label>'+
   '<button class="primary" data-action="apply-counter-design">اعمال فرم صفحه</button><small>فرم ظاهری تغییر می‌کند؛ برش‌های سینک و اجاق حفظ می‌شوند.</small></details>';
 })():'';
 const specialtyControls=obj.kind==='cabinet'&&obj.subtype!=='bridge'?(()=>{
  const o=obj.specialty||{},len=Geo.lengthOf(obj),width=o.width??Math.min(.65,len-.04),height=o.height??Math.min(.60,obj.height-.06);
  const choose=(key,title,entries,selected)=>'<label>'+title+'<select data-specialty="'+key+'">'+entries.map(([id,name])=>
   '<option value="'+id+'" '+(selected===id?'selected':'')+'>'+name+'</option>').join('')+'</select></label>';
  return '<details class="design-details"><summary>فضای تخصصی پارامتریک</summary><div class="design-fields">'+
   choose('type','نوع فضای تخصصی',[
    ['none','بدون فضای تخصصی'],['coffee','کافی‌بار / محل قهوه'],['display','ویترین شیشه‌ای'],
    ['appliance','محل دستگاه کوچک'],['shelves','قفسه باز'],['bar','بار نوشیدنی'],['seating','نشیمن متصل']],o.type||'none')+
   '<label>عرض (متر)<input type="number" data-specialty="width" value="'+Number(width).toFixed(2)+'" min=".25" max="'+Math.max(.25,len-.02).toFixed(2)+'" step=".01"></label>'+
   '<label>ارتفاع (متر)<input type="number" data-specialty="height" value="'+Number(height).toFixed(2)+'" min=".24" max="'+(obj.height-.03).toFixed(2)+'" step=".01"></label>'+
   '<label>تعداد قفسه<input type="number" data-specialty="shelves" value="'+(o.shelves??2)+'" min="0" max="6" step="1"></label>'+
   choose('door','نوع درب',[['open','باز'],['glass','شیشه‌ای'],['solid','یکپارچه']],o.door||'open')+
   choose('materialId','متریال',MATERIALS.front.map(m=>[m.id,m.label]),o.materialId||resolveFinish(currentProject()?.scene?.materials,obj.subtype,'front'))+
   '<label>موقعیت روی عرض (۰ تا ۱)<input type="number" data-specialty="offsetT" value="'+(o.offsetT??.5)+'" min="0" max="1" step=".05"></label></div>'+
   '<button class="primary" data-action="apply-specialty">ساخت / به‌روزرسانی فضا</button><small>ابعاد، قفسه‌ها و جنس ظاهر قابل ویرایش‌اند؛ مدل ثابت وارد نمی‌شود.</small></details>';
 })():'';
 const equipmentFacadeControls=obj.kind==='equipment'&&['washer','dishwasher','fridge'].includes(obj.subtype)?
  '<div class="equipment-facade-panel"><strong>هماهنگی نمای دستگاه با کابینت</strong><div class="model-choices-grid">'+
  [['visible','نمای خود دستگاه'],['matched','پنل هم‌رنگ'],['concealed','پشت درب قاب‌دار']].map(([id,label])=>
   '<button data-action="equipment-facade" data-facade="'+id+'" class="'+((obj.facadeMode||'visible')===id?'active':'')+'" '+(obj.subtype==='fridge'&&!obj.builtIn&&id!=='visible'?'disabled':'')+'>'+label+'</button>').join('')+
  '</div><small>پوشش فقط ظاهر دستگاه را تغییر می‌دهد؛ ابعاد و جای نصب ثابت می‌مانند.</small></div>':'';
 panel.innerHTML='<div class="object-head"><strong>'+esc(title)+'</strong><button data-action="close-object" aria-label="بستن">×</button></div>'+
  modelOptions+windowControls+faucetControls+fridgeControls+'<div class="object-fields">'+fields+'</div>'+openControls+(['front','cabinet'].includes(obj.kind)?'<button class="front-rule-open" data-action="open-front-rules">⚙ قوانین نما و هم‌ترازسازی گروهی</button>':'')+paintControls+decorControls+counterControls+specialtyControls+equipmentFacadeControls+extras+(obj.kind==='cabinet'&&obj.subtype==='base'?'<button class="cut-sheet-button" data-action="cut-sheet">نمای دقیق برش صفحه</button>':'')+'<div class="object-actions"><button class="primary" data-action="apply-edit">اعمال ابعاد</button>'+
  (obj.kind==='equipment'&&obj.subtype!=='hood'?'<button data-action="move-equipment">جابجایی روی پلان / AR</button>':'')+
  '<button class="danger" data-action="delete-object">حذف</button></div>'+
  (obj.kind==='front'?'<small>دستگیره‌های نما را در تصویر بکش؛ عرض و ارتفاع با اسنپ ۱ سانتی‌متر ثبت می‌شوند.</small>':
   ['wall','cabinet','opening'].includes(obj.kind)?'<small>دستگیره‌ها را بکش؛ اندازه‌گذاری هنگام حرکت نمایش داده می‌شود و پس از رها کردن، با دقت ۱ سانتی‌متر ثبت می‌شود.</small>':'');
 panel.dataset.selectionId=obj.id;panel.scrollTop=previousScroll;
}
function showScene(){
 const root=document.getElementById('editor-root');if(!root)return;
 const items=currentItems(),host=document.getElementById('plan-host');
 const isPlan=mode==='2d';host.hidden=!isPlan;
 if(isPlan){
  host.innerHTML=renderPlan(items,{selectedId:selection,drawing:drawing?{...drawing,height:settings.upperHeight,elevation:settings.upperElevation,depth:drawing.tool==='upper'?settings.upperDepth:settings.baseDepth,frontRules:currentFrontRules(),freestanding:fridgeFreestanding}:null,hover,calibration:currentProject()?.scene?.calibration,showCalibration:!calibrationCollapsed,hideFronts:facadesHidden});
  document.getElementById('scene-message').classList.add('hide-for-plan');
 }else {
  host.innerHTML='';
  document.getElementById('scene-message').classList.remove('hide-for-plan');
 }
 const elevation=document.getElementById('elevation-panel');
 if(elevation){
  const selected=items.find(o=>o.id===selection&&['opening','cabinet','front'].includes(o.kind));
  const facadeHost=selected?.kind==='front'?items.find(o=>o.id===selected.hostId):selected?.kind==='cabinet'?selected:null;
  const hasFacades=!facadesHidden&&facadeHost&&items.some(o=>o.kind==='front'&&o.hostId===facadeHost.id);
  const facadeTool=drawing?.tool.startsWith('front-');
  const previewHost=facadeTool?(items.find(o=>o.id===drawing.hostId&&o.kind==='cabinet')||
   Geo.nearestCabinet(items,hover)?.cabinet):null;
  let pending=null;
  if(previewHost)try{
   pending=drawing.tool==='front-smart'?Geo.planSmartKitchen(items).items:
    items.filter(o=>!(o.kind==='front'&&o.hostId===previewHost.id))
     .concat(Geo.planFronts(items,previewHost,drawing.tool.slice(6)));
  }catch{}
  elevation.hidden=!(isPlan||trackedView())||(!selected&&!pending)||!!(drawing&&!facadeTool)||!!(facadeTool&&!pending);
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
 const miniHost=document.getElementById('mini-plan'),
  miniCalibration=JSON.stringify(currentProject()?.scene?.calibration||null);
 if(miniHost!==miniLastHost||items!==miniLastItems||miniCalibration!==miniLastCalibration||facadesHidden!==miniLastFacadesHidden){
  miniHost.innerHTML=renderPlan(items,{mini:true,calibration:currentProject()?.scene?.calibration,hideFronts:facadesHidden});
  miniLastHost=miniHost;miniLastItems=items;miniLastCalibration=miniCalibration;miniLastFacadesHidden=facadesHidden;
 }
 document.getElementById('item-count').textContent=items.length?num(items.length,0)+' عنصر در صحنه':'هنوز آبجکتی در صحنه نیست';
 const hint=document.getElementById('drawing-hint');
 hint.hidden=!drawing&&!movingEquipmentId;
 if(movingEquipmentId&&!drawing){
  const moved=items.find(o=>o.id===movingEquipmentId);
  hint.textContent='جابجایی '+(moved?.name||'تجهیزات')+' — محل جدید را روی پلان یا کف AR لمس کن. برای لغو، «انتخاب» را بزن.';
 }
 if(drawing){
  const name={wall:'دیوار',window:'پنجره ثابت',door:'در',base:'کابینت زمینی',upper:'کابینت هوایی',tall:'ستون تمام‌قد',fridge:'یخچال',stove:'اجاق گاز',sink:'سینک',dishwasher:'ماشین ظرفشویی',washer:'ماشین لباسشویی',oven:'فر توکار',microwave:'مایکروویو توکار',
   'front-smart':'هوشمندسازی همه کابینت‌ها','front-doors':'درب بازشو','front-drawers2':'دو کشو','front-drawers3':'سه کشو','front-drawers4':'چهار کشو','front-graduated':'سه کشوی پلکانی','front-mixed':'کشوی بالا و درب پایین','front-mixedLower':'درب بالا و کشوی پایین'}[drawing.tool];
  const length=drawing.start&&hover?Math.hypot(hover.x-drawing.start.x,hover.z-drawing.start.z):null;
  const singleTap=drawing.tool.startsWith('front-')||['window','door','fridge','stove','sink','dishwasher','washer','oven','microwave'].includes(drawing.tool);
  hint.textContent=name+' — '+(singleTap?'روی پیش‌نمایش لمس کن یا «تأیید» بزن':drawing.start?'نقطه پایان را نشانه بگیر و «تأیید» بزن':'نقطه شروع را نشانه بگیر و «تأیید» بزن')+
   (length!==null?' · '+num(length)+' متر':'');
 }
 const materials={...DEFAULT_MATERIALS,...currentProject()?.scene?.materials};
 const tileLayout=currentTileLayout();
 floor?.setSceneState(items,selection,materials,tileLayout);
 floor?.setFacadesHidden(facadesHidden);
 floor?.setRoomSurfaces(roomSurfacesVisible,currentProject()?.scene?.ceilingHeight||3.6);
 if(mode==='3d'){
  if(!floor?.wideActive&&!desktopPreview){
   try{desktopPreview=new FloorAR(document.getElementById('editor-root'),()=>{},()=>{});
    desktopPreview.startPreview(document.querySelector('.editor-scene'));
   }catch(error){closeDesktopPreview();tell('نمای سه‌بعدی در این مرورگر آماده نشد: '+error.message);}
  }
  desktopPreview?.setSceneState(items,selection,materials,tileLayout);
  desktopPreview?.setFacadesHidden(facadesHidden);
  desktopPreview?.setRoomSurfaces(roomSurfacesVisible,currentProject()?.scene?.ceilingHeight||3.6);
  desktopPreview?.setLighting(renderSettings());
 }
 if(trackedView())floor?.setEditPreview(items,selection,'centre',
  !!items.find(o=>o.id===selection&&o.kind==='opening')&&!drawing);
 floor?.setDrawing(drawing?.start||null,drawing?.tool,{height:drawing?.tool==='wall'?settings.height:settings.upperHeight,elevation:settings.upperElevation,depth:drawing?.tool==='upper'?settings.upperDepth:settings.baseDepth,hostId:drawing?.hostId,freestanding:fridgeFreestanding});
 floor?.setLighting(renderSettings());
 const frontToggle=document.querySelector('[data-action="toggle-facades"]');
 if(frontToggle){
  frontToggle.classList.toggle('active',facadesHidden);
  frontToggle.setAttribute('aria-pressed',String(facadesHidden));
  frontToggle.setAttribute('aria-label',facadesHidden?'نمایش دوباره همه درب‌ها و پیشانی کشوها':'مخفی‌کردن همه درب‌ها و پیشانی کشوها');
  frontToggle.title=facadesHidden?'نمایش مجدد درب‌ها و کشوها':'مخفی‌کردن درب‌ها و کشوها برای دیدن داخل یونیت‌ها';
  frontToggle.querySelector('small').textContent=facadesHidden?'نمایش':'درب‌ها';
 }
 const surfaceToggle=document.querySelector('[data-action="toggle-surfaces"]');
 if(surfaceToggle){surfaceToggle.classList.toggle('active',roomSurfacesVisible);
  surfaceToggle.setAttribute('aria-pressed',String(roomSurfacesVisible));
  surfaceToggle.querySelector('small').textContent=roomSurfacesVisible?'مخفی':'سقف/کف';}
 const controls=document.getElementById('draw-controls');if(controls){
  controls.hidden=!drawing;
  controls.querySelector('[data-action="confirm-drawing"]').disabled=!drawing;
  controls.querySelector('[data-action="confirm-drawing"]').title=drawing?.start?'ثبت انتهای قطعه و ادامهٔ مسیر':'تأیید محل نشانگر';
 }
 const marker=document.getElementById('aim-marker');if(marker){
  marker.hidden=!drawing||!trackedView();
  marker.classList.toggle('upper',drawing?.tool==='upper');
  document.getElementById('aim-label').textContent=drawing?.tool==='upper'?'لبه کابینت هوایی · یک‌سوم بالای صفحه':'کنج دیوار / کابینت · یک‌سوم پایین صفحه';
 }

 const buttons=document.querySelectorAll('[data-action="undo"],[data-action="redo"]');
 buttons.forEach(b=>b.disabled=b.dataset.action==='undo'?!undoStack.length:!redoStack.length);
 drawSelection();drawTools();
}
function commitChange(result,{materials,styleId,stylePreset,frontRules,tileLayout,ceilingHeight,skipAlignment=false}={}){
 if(!result||!Array.isArray(result.items))throw Error('تغییر هندسه معتبر نیست.');
 const p=currentProject();if(!p)return;
 undoStack.push({items:structuredClone(currentItems()),materials:{...DEFAULT_MATERIALS,...p.scene?.materials},styleId:p.scene?.styleId||null,stylePreset:structuredClone(p.scene?.stylePreset||null),frontRules:currentFrontRules(),tileLayout:currentTileLayout(),ceilingHeight:p.scene?.ceilingHeight||3.6});if(undoStack.length>60)undoStack.shift();redoStack=[];
 const existing=new Set(currentItems().filter(c=>c.kind==='cabinet').map(c=>c.id));
 const added=result.items.filter(c=>c.kind==='cabinet'&&c.subtype!=='bridge'&&!existing.has(c.id)).map(c=>c.id);
 for(const c of result.items.filter(c=>added.includes(c.id)))c.frontRules={...currentFrontRules()};
 if(added.length&&p.scene?.styleId){
  const styled=Geo.applyKitchenLayout(result.items,p.scene.styleId,{cabinetIds:added,preset:p.scene.stylePreset||null});
  result={...result,items:styled.items};
 }
 if(!skipAlignment)result={...result,items:Geo.alignFrontSeams(result.items).items};
 p.scene??={items:[]};p.scene.items=result.items;p.updatedAt=new Date().toISOString();p.revision=(p.revision||0)+1;
 if(materials)p.scene.materials={...DEFAULT_MATERIALS,...materials};
 if(styleId!==undefined)p.scene.styleId=styleId;
 if(stylePreset!==undefined)p.scene.stylePreset=structuredClone(stylePreset);
 if(frontRules)p.scene.frontRules={...frontRules};
 if(tileLayout)p.scene.tileLayout={...tileLayout};
 if(ceilingHeight!==undefined)p.scene.ceilingHeight=ceilingHeight;
 save();selectedUnit=null;lastFrontTap=null;selection=result.selectedId||null;showScene();
}
function commitFrontOpening(frontId,opening){
 const p=currentProject();if(!p)return;
 const result=Geo.setFrontOpening(currentItems(),frontId,opening);
 undoStack.push({items:structuredClone(currentItems()),materials:{...DEFAULT_MATERIALS,...p.scene.materials},
  styleId:p.scene.styleId||null,stylePreset:structuredClone(p.scene?.stylePreset||null),frontRules:currentFrontRules(),tileLayout:currentTileLayout(),ceilingHeight:p.scene?.ceilingHeight||3.6});
 if(undoStack.length>60)undoStack.shift();redoStack=[];
 p.scene.items=result.items;p.updatedAt=new Date().toISOString();p.revision=(p.revision||0)+1;
 save();selection=frontId;selectedUnit=null;
 floor?.syncFrontOpeningState(result.items);
 desktopPreview?.syncFrontOpeningState(result.items);
 showScene();
}
function undoChange(redo=false){
 const source=redo?redoStack:undoStack,dest=redo?undoStack:redoStack;if(!source.length)return;
 const p=currentProject();dest.push({items:structuredClone(currentItems()),materials:{...DEFAULT_MATERIALS,...p.scene.materials},styleId:p.scene.styleId||null,stylePreset:structuredClone(p.scene?.stylePreset||null),frontRules:currentFrontRules(),tileLayout:currentTileLayout(),ceilingHeight:p.scene?.ceilingHeight||3.6});
 const snapshot=source.pop();p.scene.items=Array.isArray(snapshot)?snapshot:snapshot.items;
 if(!Array.isArray(snapshot)){p.scene.materials=snapshot.materials;p.scene.styleId=snapshot.styleId||null;p.scene.stylePreset=structuredClone(snapshot.stylePreset||null);p.scene.frontRules={...Geo.DEFAULT_FRONT_RULES,...snapshot.frontRules};p.scene.tileLayout={...DEFAULT_TILE_LAYOUT,...snapshot.tileLayout};p.scene.ceilingHeight=snapshot.ceilingHeight||3.6;}
 settings.height=Number(p.scene?.ceilingHeight??p.scene?.items?.find(o=>o.kind==='wall')?.height??3.6);
 p.updatedAt=new Date().toISOString();save();selection=null;selectedUnit=null;drawing=null;showScene();
}
function selectAt(point,target,arId=null){
 selectedUnit=null;
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
 // Tapping an already selected object, or a truly empty area, dismisses its
 // property panel. Tool menus don't have to remain stacked underneath it.
 const next=hit?.id===selection?null:hit?.id||null;
 if(next&&activeTool&&!drawing){
  activeTool=null;
  document.querySelectorAll('[data-category]').forEach(button=>button.classList.remove('active'));
 }
 selection=next;showScene();
}
function handleFrontTap(hitId,event){
 const previous=lastFrontTap,now=performance.now(),nearPrevious=previous&&now-previous.time<560&&
  Math.hypot(event.clientX-previous.x,event.clientY-previous.y)<24;
 // An opening leaf may swing away from the cursor on the second tap. The
 // third tap still addresses the original unit if it lands on its carcass.
 const front=currentItems().find(f=>f.id===hitId&&f.kind==='front')||
  (nearPrevious&&previous.count===2&&currentItems().find(f=>f.id===previous.id&&f.kind==='front'));
 if(!front){lastFrontTap=null;return false;}
 const same=nearPrevious&&previous.id===front.id;
 const count=same?Math.min(3,lastFrontTap.count+1):1;
 lastFrontTap={id:front.id,count,time:now,x:event.clientX,y:event.clientY};
 if(count===3){
  selectedUnit=Geo.frontUnitFor(currentItems(),front.id);
  if(selectedUnit){selection=selectedUnit.hostId;showScene();}
  return true;
 }
 if(count===2||count===1&&front.openFraction>.01){
  commitFrontOpening(front.id,front.openFraction>.01?0:1);
  return true;
 }
 selectedUnit=null;selection=front.id;showScene();
 return true;
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
 if(['stove','sink','dishwasher','washer','oven','microwave'].includes(tool)){
  for(const c of currentItems().filter(x=>x.kind==='cabinet'&&
   (tool==='microwave'?x.subtype==='tall':tool==='oven'?['base','tall'].includes(x.subtype):x.subtype==='base')))
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
  const scene=currentProject()?.scene;
  const styled=scene?.styleId&&scene?.stylePreset?
   Geo.applyKitchenLayout(items,scene.styleId,{preset:scene.stylePreset}):Geo.planSmartKitchen(items);
  commitChange(styled);drawing={tool,start:null};hover=initialPreviewForTool(tool);showScene();return;
 }
 if(tool.startsWith('front-')){
  const c=items.find(o=>o.id===drawing.hostId&&o.kind==='cabinet')||Geo.nearestCabinet(items,point)?.cabinet;
  if(!c)throw Error('برای نصب درب و کشو ابتدا کابینت میزبان را انتخاب کن.');
  commitChange(Geo.placeFrontLayout(items,c.id,tool.slice(6)));
  drawing={tool,start:null,hostId:c.id};hover=initialPreviewForTool(tool);showScene();return;
 }
 if(['fridge','stove','sink','dishwasher','washer','oven','microwave'].includes(tool)){
  commitChange(Geo.placeEquipment(items,point,tool,{freestanding:tool==='fridge'&&fridgeFreestanding}));drawing={tool,start:null};hover=initialPreviewForTool(tool);showScene();return;
 }
 if(tool==='window'||tool==='door'){
  const near=Geo.nearestWall(items,point.x,point.z,.60);
  if(!near){tell('برای نصب در یا پنجره باید نشانگر روی دیوار باشد.');return;}
  const result=Geo.placeOpening(items,near.wall.id,point.x,point.z,{style:tool==='door'?'door':'fixed'});
  commitChange(result);drawing={tool,start:null};hover=initialPreviewForTool(tool);showScene();return;
 }
 if(!drawing.start){
  if(['base','upper','tall'].includes(tool)){
   const snap=Geo.snapCabinetPoint(items,point.x,point.z,.85);
   if(!snap){tell('برای کابینت، نشانگر باید به دیوار یا کنج آن برسد.');return;}
   const w=items.find(x=>x.id===snap.hostId),
    cross=(point.x-w.x1)*(w.z2-w.z1)-(point.z-w.z1)*(w.x2-w.x1);
   drawing.start={x:snap.x,z:snap.z,hostId:w.id,
    side:trackedView()&&floor?.locked?floor.cameraSideForWall(w):Math.abs(cross)<.01?1:cross>0?-1:1};
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
 let result=tool==='wall'?Geo.placeWall(items,a,b,{thickness:settings.thickness,height:settings.height,tolerance:settings.pointSnap?.22:.001}):
  Geo.placeCabinetRoute(items,a,b,{kind:tool,
   depth:tool==='upper'?settings.upperDepth:settings.baseDepth,height:tool==='upper'?settings.upperHeight:tool==='tall'?2.15:undefined,
   elevation:tool==='upper'?settings.upperElevation:undefined,groupId:drawing.groupId,frontRules:currentFrontRules()});
 if(tool==='wall'){
  const unified=Geo.setAllWallHeights(result.items,settings.height);
  result={...result,items:unified.items};
 }
 commitChange(result,tool==='wall'?{ceilingHeight:settings.height}:{});
 drawing={tool,start:result.end,groupId:result.groupId||drawing.groupId};hover=result.end||null;showScene();
}
function controlPoint(){
 if(trackedView())return floor?.pick()||null;
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
 if(result){
  const height=obj.kind==='wall'?Math.round(value('height',obj.height)*100)/100:undefined;
  commitChange(result,{ceilingHeight:height});
  if(height!==undefined){
   settings.height=height;
   const field=document.querySelector('[data-ceiling-height]');if(field)field.value=String(height);
  }
 }
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
 if(e.target.matches('[data-fridge-free]')){fridgeFreestanding=e.target.checked;return;}
 if(e.target.matches('[data-setting="height"]')){
  const high=Number(e.target.value);
  if(!Number.isFinite(high)||high<2||high>9){tell('ارتفاع مشترک دیوارها و سقف باید بین ۲ تا ۹ متر باشد.');return;}
  const rounded=Math.round(high*100)/100;
  try{commitChange(Geo.setAllWallHeights(currentItems(),rounded),{ceilingHeight:rounded});settings.height=rounded;}
  catch(err){settings.height=Number(currentProject()?.scene?.ceilingHeight??3.6);e.target.value=String(settings.height);tell(err.message);}
  return;
 }
 if(e.target.matches('[data-ceiling-height]')){
  const high=Number(e.target.value);
  if(!Number.isFinite(high)||high<2||high>9){tell('ارتفاع سقف باید بین ۲ تا ۹ متر باشد.');return;}
  const rounded=Math.round(high*100)/100;
  commitChange(Geo.setAllWallHeights(currentItems(),rounded),{ceilingHeight:rounded});
  settings.height=rounded;
  tell('ارتفاع دیوارها و سقف '+num(rounded)+' متر شد.');return;
 }
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
 const selectedEquipment=drag.originalItems.find(o=>o.id===drag.id);
 if(selectedEquipment?.kind==='equipment'){
  if(trackedView()){
   const p=floor?.dragEquipmentPoint(e.clientX,e.clientY);
   return p?{x:p.x+(drag.moveOffset?.x||0),z:p.z+(drag.moveOffset?.z||0)}:null;
  }
  if(mode==='3d')return desktopPreview?.pickPreviewPoint(e.clientX,e.clientY)||null;
  const svg=scene?.querySelector('#plan-view');return svg?planPoint(svg,e):null;
 }
 if(drag.surface==='elevation'){
  const pixels=drag.pixelsPerMetre||1;
  return {...original,along:(original.along||0)+(e.clientX-drag.startClientX)/pixels,
   y:(original.y||0)-(e.clientY-drag.startClientY)/pixels};
 }
 if(trackedView()){
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
 }else if(trackedView()){
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
 if(trackedView()){
  floor?.setEditPreview(null,null,null,false);
  const original=drag.originalItems.find(o=>o.id===drag.id);
  if(original?.kind==='opening'&&original.style==='fixed')floor?.setWindowResizeActive(drag.id,false);
 }
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
 if(trackedView()&&floor?.locked&&!calibrationCollapsed&&e.target.closest('.editor-scene')){
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
  trackedView()&&!drawing&&!e.target.closest('button,input,aside,.editor-header,.bottom-panel,.side-tools')?floor?.pickHandle(e.clientX,e.clientY):null);
 if(!hit||drawing||!currentItems().some(o=>o.id===hit.id))return;
 const initial=handlePosition(currentItems(),hit.id,hit.side);
 if(!initial)return;
 const elevationSvg=handle?.closest('#elevation-view');
 const surface=elevationSvg?'elevation':trackedView()?'ar':'plan';
 const ppm=elevationSvg?Number(elevationSvg.dataset.ppm)*elevationSvg.getBoundingClientRect().width/elevationSvg.viewBox.baseVal.width:0;
 const original=currentItems().find(o=>o.id===hit.id);
 const wall=original?.kind==='opening'?currentItems().find(o=>o.id===original.hostId):null;
 selection=hit.id;
 dragHandle={id:hit.id,side:hit.side,initial,surface,pixelsPerMetre:ppm,
  startClientX:e.clientX,startClientY:e.clientY,originalItems:structuredClone(currentItems()),
  previewItems:null,moved:false,error:null,pointerId:e.pointerId,
  anchorCentre:wall?original.hostT*Geo.lengthOf(wall):null,
  anchorScale:elevationSvg?Number(elevationSvg.dataset.ppm):null};
 if(original?.kind==='equipment'&&trackedView()){
  const p=floor?.dragEquipmentPoint(e.clientX,e.clientY);
  if(p)dragHandle.moveOffset={x:original.x-p.x,z:original.z-p.z};
 }
 const scene=document.querySelector('.editor-scene');
 scene?.classList.add('is-resizing');
 if(original?.kind==='opening'&&original.style==='fixed'&&trackedView())floor?.setWindowResizeActive(original.id,true);
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
 const cabinet=drawing.tool.startsWith('front-')||['base','upper','tall','fridge','stove','sink','dishwasher','washer','oven','microwave'].includes(drawing.tool);
 const snapped=['base','upper','tall'].includes(drawing.tool)?Geo.snapCabinetPoint(currentItems(),point.x,point.z,.85):null;
 const resolved=snapped|| (cabinet?point:Geo.resolvePoint(currentItems(),drawing.start,point.x,point.z,settings));
 hover={x:resolved.x,z:resolved.z,...(snapped?{hostId:snapped.hostId,corner:snapped.corner}:{})};
 svg.querySelector('.live-preview')?.remove();
 const ghost=renderPreview(currentItems(),{...drawing,height:settings.upperHeight,elevation:settings.upperElevation,depth:drawing.tool==='upper'?settings.upperDepth:settings.baseDepth,frontRules:currentFrontRules()},hover);
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
  const point=mode==='2d'?svg?planPoint(svg,e):null:trackedView()?floor?.pick():
   mode==='3d'?desktopPreview?.pickPreviewPoint(e.clientX,e.clientY):null;
  const arId=trackedView()&&!drawing?floor?.pickObject(e.clientX,e.clientY):
   mode==='3d'&&!drawing?desktopPreview?.pickPreviewObject(e.clientX,e.clientY):null;
  if(!point&&!arId){if(trackedView()&&drawing)tell('نشانگر را روی سطح معتبر بگیر.');return;}
  if(movingEquipmentId){
   if(!point){tell('برای جابه‌جایی، محل جدید را روی کف نشانه بگیر.');return;}
   const result=Geo.moveEquipment(currentItems(),movingEquipmentId,point);
   movingEquipmentId=null;commitChange(result);tell('تجهیزات جابه‌جا شد و صفحه و کابینت بازسازی شدند.');return;
  }
  if(drawing){
    hover=point;
    if(['wall','base','upper','tall'].includes(drawing.tool)){showScene();return;}
    placeAt(point);
  }else if(!handleFrontTap(arId||e.target.closest?.('[data-item-id]')?.dataset.itemId,e))
   selectAt(trackedView()?null:point,e.target,arId);
 }catch(error){tell(error.message);}
});
document.addEventListener('pointercancel',e=>{
 if(planCalibrationDrag&&e.pointerId===planCalibrationDrag.pointerId){planCalibrationDrag=null;save();}
 if(abDrag&&e.pointerId===abDrag.pointerId){abDrag=null;floor?.endCalibrationDrag();}
 if(dragHandle&&e.pointerId===dragHandle.pointerId)finishResize(true);
});

document.addEventListener('click',async e=>{
 if(e.target.classList?.contains('dialog-cover')){
  dialogs.replaceChildren();pendingUpperEdit=null;return;
 }
 const button=e.target.closest('[data-action]');if(!button||button.disabled)return;
 const action=button.dataset.action,id=button.dataset.id;
 try{
  if(action==='home')return go('#/welcome');
  if(action==='projects')return go('#/projects');
  if(action==='new')return createProject();
  if(action==='open')return go('#/editor/'+id,true);
  if(action==='open-report')return go('#/report/'+(id||activeId));
  if(action==='return-editor')return go('#/editor/'+id,true);
  if(action==='report-print'){window.print();return;}
  if(action==='report-sheet-prev')return moveReportSheet(-1);
  if(action==='report-sheet-next')return moveReportSheet(1);
  if(action==='report-xlsx'){
   const project=projects.find(p=>location.hash==='#/report/'+p.id);
   if(!project)throw Error('پروژهٔ گزارش پیدا نشد.');
   downloadCutReportXlsx(buildCutReport(project,reportSheetOptions));return;
  }
  if(action==='report-recalculate'){
   const settings=Object.fromEntries([...document.querySelectorAll('[data-report-sheet]')].map(input=>
    [input.dataset.reportSheet,Number(input.value)]));
   reportSheetOptions=validateSheetOptions(settings);
   reportPage(location.hash.slice(9));
   document.getElementById('report-nesting')?.scrollIntoView({block:'start'});
   return;
  }
  if(action==='report-scroll'){
   document.getElementById(button.dataset.target)?.scrollIntoView({behavior:'smooth',block:'start'});return;
  }
  if(action==='more')return projectMenu(id);
  if(action==='close-dialog'){dialogs.innerHTML='';pendingUpperEdit=null;return;}
  if(action==='convert-unit'){
   if(!selectedUnit)throw Error('ابتدا با سه لمس پشت‌سرهم یونیت را انتخاب کن.');
   commitChange(Geo.convertFrontUnit(currentItems(),selectedUnit.frontId,button.dataset.unitPreset),{skipAlignment:true});
   tell('نوع یونیت تغییر کرد.');return;
  }
  if(action==='toggle-facades'){
   facadesHidden=!facadesHidden;
   if(facadesHidden&&currentItems().some(o=>o.id===selection&&o.kind==='front'))selection=null;
   showScene();return;
  }
 if(action==='toggle-surfaces'){roomSurfacesVisible=!roomSurfacesVisible;showScene();return;}
  if(action==='open-style-gallery')return openStyleGallery();
  if(action==='open-front-rules')return openFrontRules(selection&&currentItems().some(o=>o.id===selection&&['cabinet','front'].includes(o.kind))?'connected':'global');
  if(action==='front-rule-scope')return openFrontRules(button.dataset.scope);
  if(action==='apply-front-rules'){
   const scope=button.dataset.scope,get=name=>dialogs.querySelector('[data-front-rule="'+name+'"]');
   let result;
   if(scope==='single'){
    const f=currentItems().find(o=>o.id===selection&&o.kind==='front');
    if(!f)throw Error('ابتدا درب یا کشو را انتخاب کن.');
    const c=currentItems().find(o=>o.id===f.hostId);
    const w=Number(get('width')?.value),h=Number(get('height')?.value),gap=Number(get('gap')?.value);
    if(!Number.isFinite(w)||!Number.isFinite(h)||!Number.isFinite(gap))throw Error('اندازه‌های نما را بررسی کن.');
    result=Geo.editFront(currentItems(),f.id,{
     width:Math.abs(w-(f.endT-f.startT)*Geo.lengthOf(c))>.005?w:undefined,
     height:Math.abs(h-(f.topT-f.bottomT)*c.height)>.005?h:undefined,
     hinge:f.subtype==='door'&&get('hinge')?.value!==f.hinge?get('hinge').value:undefined,
     handleStyle:get('handleStyle').value!==f.handleStyle?get('handleStyle').value:undefined,
     gap:Math.abs(gap-(f.gap??.003))>.0001?gap:undefined
    });
   }else{
    const rules={minDoorWidth:Number(get('minDoorWidth')?.value),maxDoorWidth:Number(get('maxDoorWidth')?.value),
     gap:Number(get('gap')?.value),singleHinge:get('singleHinge').value,pairHinge:get('pairHinge').value,
     handleStyle:get('handleStyle').value,alignRows:get('alignRows').checked};
    result=Geo.configureFrontRules(currentItems(),rules,{scope,targetId:selection});
   }
   commitChange(result,{frontRules:result.frontRules});dialogs.innerHTML='';
   tell(scope==='single'?'تنظیمات همین نما ثبت شد.':scope==='connected'?'قوانین کابینت‌های متصل اعمال شد.':'قوانین عمومی کل آشپزخانه اعمال شد.');return;
  }
  if(action==='select-style'){
   const style=KITCHEN_STYLES.find(s=>s.id===button.dataset.style);
   if(!style)throw Error('مدل انتخاب‌شده پیدا نشد.');
   selectedGalleryStyleId=style.id;
   dialogs.querySelectorAll('[data-action="select-style"]').forEach(b=>b.classList.toggle('active',b.dataset.style===style.id));
   const apply=dialogs.querySelector('[data-action="apply-style"]');
   if(apply){apply.disabled=false;apply.dataset.style=style.id;}
   return;
  }
  if(action==='apply-style'){
   const style=KITCHEN_STYLES.find(s=>s.id===selectedGalleryStyleId&&s.id===button.dataset.style);
   if(!style)throw Error('مدل انتخاب‌شده پیدا نشد.');
   const project=currentProject(),token=++styleApplyToken;
   if(!project)throw Error('پروژه فعال نیست.');
   const hadCabinets=currentItems().some(c=>c.kind==='cabinet'&&c.subtype!=='bridge');
   dialogs.querySelectorAll('[data-action="select-style"],[data-action="apply-style"]').forEach(b=>b.disabled=true);
   dialogs.querySelector('.style-dialog-head')?.insertAdjacentHTML('afterend',
    '<p id="style-progress" class="style-progress" role="status">مرحله ۱ از ۲ · در حال تنظیم تقسیم‌بندی درب‌ها و کشوها…</p>');
   // Paint the progress state before the potentially expensive semantic update.
   await new Promise(resolve=>requestAnimationFrame(resolve));
   if(token!==styleApplyToken||currentProject()!==project)return;
   const response=await fetch(assetUrl(style.config));
   if(!response.ok)throw Error('فایل دستورهای طرح تصویر در دسترس نیست.');
   const preset=await response.json();
   if(token!==styleApplyToken||currentProject()!==project)return;
   const result=Geo.applyKitchenLayout(currentItems(),style.id,{preset});
   commitChange(result,{styleId:style.id,stylePreset:preset});
   const appliedItems=project.scene.items;
   const status=dialogs.querySelector('#style-progress');
   if(status)status.textContent='مرحله ۲ از ۲ · تنظیم متریال‌ها پس از به‌روزرسانی درب‌ها…';
   await new Promise(resolve=>setTimeout(resolve,450));
   if(token!==styleApplyToken||currentProject()!==project||project.scene.items!==appliedItems)return;
   // Keep a kitchen-style change as a single undo step.
   project.scene.materials={...DEFAULT_MATERIALS,...preset.materials};
   project.updatedAt=new Date().toISOString();save();
   showScene();dialogs.replaceChildren();
   tell(hadCabinets?'مدل، درب‌ها، کشوها و متریال‌ها اعمال شدند.':'مدل ذخیره شد؛ با نصب کابینت‌ها خودکار اعمال می‌شود.');return;
  }
  if(action==='set-material'){
   const category=button.dataset.surface,material=button.dataset.material;
   const family=category.endsWith('Front')?'front':category.endsWith('Body')?'body':category;
   if(!MATERIALS[family]?.some(m=>m.id===material))throw Error('متریال معتبر نیست.');
   const palette={...DEFAULT_MATERIALS,...currentProject()?.scene?.materials,[category]:material};
   commitChange({items:structuredClone(currentItems()),selectedId:selection},{materials:palette});return;
  }
  if(action==='apply-tile-layout'){
   const get=key=>document.querySelector('[data-tile-layout="'+key+'"]')?.value;
   const tileLayout=validateTileLayout({pattern:get('pattern'),width:Number(get('width')),
    height:Number(get('height')),grout:Number(get('grout')),groutColor:get('groutColor')});
   commitChange({items:structuredClone(currentItems()),selectedId:selection},{tileLayout});
   tell('الگوی هندسی کاشی و بندکشی اعمال شد.');return;
  }
  if(action==='toggle-front'){
   const front=currentItems().find(o=>o.id===selection&&o.kind==='front');
   if(!front)throw Error('ابتدا درب یا کشوی موردنظر را انتخاب کن.');
   const opening=front.openFraction>.01?0:1;
   commitFrontOpening(front.id,opening);
   tell(opening?'درب یا کشو باز شد؛ فضای داخلی این قسمت نمایش داده می‌شود.':'درب یا کشو بسته شد.');return;
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
  if(action==='apply-cabinet-decor'){
   const selected=currentItems().find(o=>o.id===selection&&o.kind==='cabinet');
   if(!selected)throw Error('ابتدا کابینت موردنظر را انتخاب کن.');
   const decor=Object.fromEntries(Object.keys(Geo.CABINET_DECOR_OPTIONS).map(key=>
    [key,document.querySelector('[data-decor="'+key+'"]')?.value]));
   const scope=document.querySelector('[data-decor-connected]')?.checked?'connected':'single';
   commitChange(Geo.styleCabinetDecor(currentItems(),selected.id,decor,{scope}));
   tell(scope==='connected'?'تزئینات روی کابینت‌های متصل اعمال شد.':'تزئینات این کابینت اعمال شد.');return;
  }
  if(action==='apply-counter-design'){
   const get=key=>document.querySelector('[data-counter-design="'+key+'"]')?.value;
   const options={edge:get('edge'),waterfall:get('waterfall'),overhang:Number(get('overhang')),
    raisedHeight:Number(get('raisedHeight')),cornerRadius:Number(get('cornerRadius')),curve:Number(get('curve'))};
   const scope=document.querySelector('[data-counter-connected]')?.checked?'connected':'single';
   commitChange(Geo.styleCountertop(currentItems(),selection,options,{scope}));
   tell('فرم صفحه کابینت ثبت شد.');return;
  }
  if(action==='apply-specialty'){
   const get=key=>document.querySelector('[data-specialty="'+key+'"]')?.value;
   const options={type:get('type'),width:Number(get('width')),height:Number(get('height')),
    shelves:Number(get('shelves')),door:get('door'),materialId:get('materialId'),offsetT:Number(get('offsetT'))};
   commitChange(Geo.styleCabinetSpecialty(currentItems(),selection,options));
   tell('فضای تخصصی با ابعاد انتخاب‌شده ساخته شد.');return;
  }
  if(action==='equipment-facade'){
   commitChange(Geo.styleEquipmentFacade(currentItems(),selection,button.dataset.facade));
   tell('نمای دستگاه به‌روز شد.');return;
  }
  if(action==='upper-height-cancel'){pendingUpperEdit=null;dialogs.innerHTML='';return;}
  if(action==='upper-height-single'||action==='upper-height-all'){
   if(!pendingUpperEdit)return;const {id,changes}=pendingUpperEdit;
   const edited=Geo.editCabinet(currentItems(),id,changes);
   const result=action==='upper-height-all'?Geo.applyAllUpperHeights(edited.items,{height:changes.height,elevation:changes.elevation}):edited;
   result.selectedId=id;settings.upperHeight=changes.height;settings.upperElevation=changes.elevation;
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
  if(action==='fridge-installation'){
   commitChange(Geo.setFridgeInstallation(currentItems(),selection,button.dataset.free==='true'));
   return;
  }
  if(action==='faucet-model'){
   commitChange(Geo.editEquipment(currentItems(),selection,{faucetModel:button.dataset.model}));return;
  }
  if(action==='window-model'){
   commitChange(Geo.editOpening(currentItems(),selection,{windowModel:button.dataset.model}));return;
  }
  if(action==='window-operation'){
   commitChange(Geo.editOpening(currentItems(),selection,{windowOperation:button.dataset.model,openFraction:0}));return;
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
  if(action==='toggle-inspector'){if(!selection&&!selectedUnit)return;inspectorOpen=!inspectorOpen;showScene();return;}
  if(action==='close-object'){inspectorOpen=false;showScene();return;}
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
  if(action==='wide-fov'){
   if(mode!=='3d'||!floor?.wideActive)return;
   wideLevel=button.dataset.wideMode;
   floor.setWideView(wideLevel);
   document.querySelectorAll('[data-wide-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.wideMode===wideLevel));
   return;
  }
  if(action==='mode'){
   const next=button.dataset.mode;if(next===mode)return;
   if(next==='3d'&&floor?.session)floor.setWideView(wideLevel);
   else if(floor?.wideActive)floor.disableWideView();
   if(next!=='3d')closeDesktopPreview();mode=next;
   document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.mode===mode));
   document.getElementById('wide-view-settings').hidden=next!=='3d'||!floor?.wideActive;
   document.querySelectorAll('[data-wide-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.wideMode===wideLevel));
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
    document.getElementById('scene-message').querySelector('p').textContent=next==='2d'?'روی پلان برای ترسیم یا انتخاب آبجکت بزن.':
     floor?.wideActive?'موقعیت دقیق از AR دریافت می‌شود؛ زاویه دید را از Normal، Wide یا Ultra انتخاب کن.':
     'بدون نشست AR، این پیش‌نمایش آزاد است. برای نمای زنده ۱:۱ ابتدا AR را فعال کن.';showScene();}
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
document.addEventListener('keydown',e=>{
 if(e.key!=='Escape')return;
 if(dialogs.childElementCount){dialogs.replaceChildren();pendingUpperEdit=null;e.preventDefault();return;}
 const panel=document.getElementById('object-editor');
 if(panel&&!panel.hidden){selection=null;showScene();e.preventDefault();return;}
 if(activeTool||drawing){
  activeTool=null;drawing=null;hover=null;movingEquipmentId=null;showScene();
  document.querySelectorAll('[data-category]').forEach(button=>button.classList.remove('active'));
  e.preventDefault();
 }
});
window.addEventListener('popstate',render);window.addEventListener('hashchange',render);
if(loadError)tell('خطا در اطلاعات قبلی؛ داده‌ها دست‌نخورده باقی مانده‌اند.');
render();
