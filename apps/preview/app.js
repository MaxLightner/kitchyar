import {FloorAR} from './floor-ar.js?v=ui2';
const STORAGE='kitchyar.ui.v2';
const app=document.getElementById('app'),dialogs=document.getElementById('dialog-root'),toastNode=document.getElementById('toast');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=value=>new Date(value).toLocaleDateString('fa-IR',{year:'numeric',month:'short',day:'numeric'});
let projects=[],floor=null,mode='ar',activeTool=null,activeId=null,toastTimer=null,loadError=null;
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
 activeId=id;mode='ar';activeTool=null;
 app.innerHTML='<main class="editor-root" id="editor-root"><div class="editor-scene"><div class="scene-grid"></div><div class="scene-message" id="scene-message"><span class="scan-orbit"></span><h2>آماده شناسایی کف</h2><p>پس از ورود، دوربین روی کف قرار می‌گیرد. برای اسکن به گوشی سازگار با ARCore نیاز است.</p><button data-action="start-ar">فعال‌سازی دوربین AR</button></div></div>'+
 '<header class="editor-header"><button class="editor-back" data-action="projects">← پروژه‌ها</button><div class="editor-name"><strong>'+esc(p.name)+'</strong><span id="save-indicator">ذخیره‌شده روی دستگاه</span></div><div class="mode-switch"><button class="selected" data-action="mode" data-mode="ar">AR</button><button data-action="mode" data-mode="3d">3D</button><button data-action="mode" data-mode="2d">2D</button></div><button class="save-button" data-action="save">ذخیره</button></header>'+
 '<div class="ar-toolbar"><button data-action="menu">منوی کیچیار</button><button data-action="rescan">اسکن مجدد ↻</button><span id="scan-status" role="status">در حال آماده‌سازی دوربین AR…</span></div>'+
 '<aside class="editor-menu" id="editor-menu" hidden><strong>KITCHYAR</strong><button data-action="save">ذخیره پروژه</button><button data-action="projects">مدیریت پروژه‌ها</button><button data-action="close-menu">ادامه ویرایش</button></aside>'+
 '<section class="scan-card" id="scan-card"><div class="scan-head"><strong id="scan-stage">در انتظار اسکن کف</strong><span id="scan-pct">۰٪</span></div><progress id="scan-progress" max="100" value="0"></progress><small>آمادگی بر اساس برخوردهای معتبر و نمونه‌های مستقل است؛ درصد ARCore نیست.</small><div class="scan-info"><span id="scan-hits">برخورد معتبر: ۰</span><span id="anchor-count">Anchor: ۰ / ۵</span></div></section>'+
 '<div class="scan-confirm"><button class="primary" id="confirm-floor" data-action="confirm-floor" disabled>تثبیت این کف</button><div id="calibration" hidden><div class="point-row"><button data-action="point-a">ثبت A</button><button data-action="point-b">ثبت B</button></div><label>فاصله واقعی A تا B (متر)<input type="number" id="real-distance" value="1" min=".1" max="20" step=".01"></label><button data-action="apply-distance">اعمال مقیاس</button></div></div>'+
 '<div class="side-tools"><button data-action="select">⌖</button><button data-action="undo" disabled>↶</button><button data-action="redo" disabled>↷</button></div>'+
 '<div class="mini-map"><span>پلان زنده</span><div class="empty-plan"><i></i></div><small>هنوز آبجکتی در صحنه نیست</small></div>'+
 '<div class="bottom-panel"><div class="tool-sheet" id="tool-sheet" hidden></div><nav class="dock">'+categories.map(([id,name,icon])=>'<button data-action="category" data-category="'+id+'"><span>'+icon+'</span><small>'+name+'</small></button>').join('')+'</nav></div>'+
 '</main>';
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
 const pending=floor.start();
 pending.then(()=>{document.getElementById('editor-root')?.classList.add('ar-live');})
  .catch(error=>{document.getElementById('scan-status').textContent=error.message;
   document.getElementById('scene-message')?.classList.add('visible');});
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
  if(action==='save'){touch(activeId);document.getElementById('save-indicator').textContent='ذخیره‌شده';return tell('پروژه ذخیره شد.');}
  if(action==='start-ar')return beginAR();
  if(action==='rescan'){if(floor?.session){await floor.scan();document.getElementById('scan-card').classList.remove('complete');}
   else beginAR();return;}
  if(action==='confirm-floor'){if(!floor?.confirm())tell('هنوز کف آماده تثبیت نیست.');return;}
  if(action==='point-a'||action==='point-b'){if(!floor?.capture(action==='point-a'?'a':'b'))tell('نشانگر را روی سطح معتبر قرار بده.');return;}
  if(action==='apply-distance'){floor?.calibrate(document.getElementById('real-distance').value);return;}
  if(action==='menu'){document.getElementById('editor-menu').hidden=!document.getElementById('editor-menu').hidden;return;}
  if(action==='close-menu'){document.getElementById('editor-menu').hidden=true;return;}
  if(action==='mode'){
   const next=button.dataset.mode;if(next===mode)return;mode=next;
   document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('selected',b.dataset.mode===mode));
   if(next==='ar'){document.getElementById('scan-card').hidden=false;document.getElementById('scan-status').textContent='برای شروع اسکن، دوربین AR را فعال کن.';beginAR();}
   else {closeFloor();document.getElementById('scan-card').hidden=true;document.getElementById('scene-message').classList.add('visible');
    document.getElementById('scene-message').querySelector('h2').textContent=next==='2d'?'پلان دوبعدی':'نمای سه‌بعدی';
    document.getElementById('scene-message').querySelector('p').textContent='این نما در مرحله بعد فعال خواهد شد.';}
   return;
  }
  if(action==='category'){
   const kind=button.dataset.category,cat=categories.find(x=>x[0]===kind);
   activeTool=activeTool===kind?null:kind;
   document.querySelectorAll('[data-category]').forEach(b=>b.classList.toggle('active',b.dataset.category===activeTool));
   const sheet=document.getElementById('tool-sheet');sheet.hidden=!activeTool;
   if(activeTool)sheet.innerHTML='<strong>'+cat[1]+'</strong><span>ابزارهای این بخش در مرحله بعد اضافه می‌شوند.</span><button data-action="hide-tools">×</button>';
   return;
  }
  if(action==='hide-tools'){activeTool=null;document.getElementById('tool-sheet').hidden=true;document.querySelectorAll('[data-category]').forEach(b=>b.classList.remove('active'));return;}
 }catch(error){tell(error.message);}
});
window.addEventListener('popstate',render);window.addEventListener('hashchange',render);
if(loadError)tell('خطا در اطلاعات قبلی؛ داده‌ها دست‌نخورده باقی مانده‌اند.');
render();
