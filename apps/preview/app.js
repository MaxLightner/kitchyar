(function () {
  'use strict';
  const Core = window.KitchyarCore;
  const app = document.getElementById('app'), modalRoot = document.getElementById('modal-root'), toastEl = document.getElementById('toast');
  let repo, project = null, selectedId = null, view = '3d', activeTool = null, drawTool = null, renderer = null;
  let undo = [], redo = [], toastTimer, pbr = null;
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const formatDate = (v) => {try{return new Date(v).toLocaleDateString('fa-IR',{year:'numeric',month:'short',day:'numeric'});}catch{return '—';}};
  const icon = (char) => `<span aria-hidden="true">${char}</span>`;
  const upcoming = (label, phase) => `<button type="button" class="inactive-tool" disabled title="فاز ${phase}">${esc(label)} <small>فاز ${phase}</small></button>`;
  const categories = [
    {id:'architecture',title:'معماری',icon:'▥',tools:[['دیوار','E','wall'],['پنجره','E','window'],['در','E','door'],['اندازه‌گیری','E','calibrate']]},
    {id:'cabinets',title:'کابینت',icon:'▣',tools:[['زمینی','F','base'],['هوایی','F','wall-cabinet'],['تحلیل یونیت','H']]},
    {id:'equipment',title:'تجهیزات',icon:'▤',tools:[['سینک','G'],['گاز','G'],['یخچال','G'],['هود','G']]},
    {id:'fronts',title:'در و کشو',icon:'▦',tools:[['محاسبه نما','I'],['کشو','I'],['در افقی','I']]},
    {id:'material',title:'متریال',icon:'◩',tools:[['رنگ‌آمیزی با درگ','J'],['متریال گروهی','J']]},
    {id:'decor',title:'دکوری',icon:'✦',tools:[['گلدان','J'],['لیوان','J'],['نورپردازی','J']]},
  ];
  function toast(msg) {clearTimeout(toastTimer);toastEl.textContent=msg;toastEl.style.display='block';toastTimer=setTimeout(()=>toastEl.style.display='none',3000);}
  function nav(hash) {if(window.location.hash===hash)route();else window.location.hash=hash;}
  function baseHeader(active = '') {
    return `<header class="topbar"><a href="#/welcome" class="brand" aria-label="خانه کیچیار">KITCHYAR<small>کیچیار</small></a><nav class="topbar-nav"><a href="#/welcome" class="${active==='welcome'?'active':''}">خانه</a><a href="#/projects" class="${active==='projects'?'active':''}">پروژه‌های من</a></nav><div class="topbar-right"><span class="micro">طراحی تا ساخت</span><button type="button" class="button sm" data-action="new-project">＋ پروژه جدید</button></div></header>`;
  }
  function footer() {return `<footer class="footer"><span>KITCHYAR © 2026 · نسخه آزمایشی فازهای A–F</span><span>ذخیره محلی · بدون نیاز به حساب کاربری</span></footer>`;}
  function heroArt() {return `<div class="hero-visual" aria-hidden="true"><span class="hero-tag">DESIGN / SPACE / FORM</span><svg viewBox="0 0 600 480" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M98 172L320 58L528 157L306 275Z" fill="#f3f5ed" stroke="#849780" stroke-width="2"/><path d="M98 172V338L306 452V275Z" fill="#dce5d7" stroke="#849780" stroke-width="2"/><path d="M306 275V452L528 331V157Z" fill="#edf1e8" stroke="#849780" stroke-width="2"/><path d="M150 227L287 299V408L150 336Z" fill="#849a83" stroke="#607760"/><path d="M164 251L274 309V369L164 311Z" fill="#d5dfcf"/><path d="M320 286L487 193V321L320 413Z" fill="#c7d5c1" stroke="#7e957b"/><path d="M335 298L415 254V360L335 404Z" fill="#eff2e9" stroke="#7e947a"/><path d="M422 248L475 217V321L422 353Z" fill="#a5b9a0" stroke="#6b8266"/><path d="M102 166L321 51L533 152" stroke="#7f947b" stroke-dasharray="5 10"/><path d="M148 352L287 426M319 429L495 335" stroke="#698366" stroke-width="2"/><path d="M121 149V106M121 106H193M520 358V397M520 397H457" stroke="#96a98c" stroke-width="1.4"/><circle cx="121" cy="106" r="4" fill="#6e8866"/><circle cx="520" cy="397" r="4" fill="#6e8866"/></svg><span class="hero-caption">فضا را بساز، جزئیات را ببین.</span></div>`;}
  function renderWelcome() {
    app.innerHTML=`<div class="welcome-chido"><div class="welcome-title"><h1>KITCHYAR</h1><p>آشپزخانه را پیش از ساخت، در فضای خود ببین.</p></div><div class="welcome-art">${heroArt()}</div><div class="welcome-bottom"><button class="welcome-primary" data-action="go-projects">ورود به پروژه‌ها <span>←</span></button><button data-action="try-demo">دیدن پروژه نمونه در 3D</button><button data-action="new-project">＋ ایجاد صحنه خالی</button><span class="welcome-wordmark">KITCHYAR</span></div></div>`;
  }
  function thumb(project) {
    const n=project.scene.items.length;
    const shapes=project.scene.items.slice(0,5).map((o,i)=>{const x=75+i*25,y=93+(i%2)*22;return `<path d="M${x} ${y} l32 -17 30 15 -32 18z" fill="#a4b79d" stroke="#647e63"/><path d="M${x} ${y} v35 l30 16 v-36z" fill="#cbd8c6" stroke="#647e63"/><path d="M${x+30} ${y+15} v36 l32 -18 v-35z" fill="#b4c6b1" stroke="#647e63"/>`;}).join('');
    return `<div class="project-thumb"><span class="count">${n.toLocaleString('fa-IR')} آبجکت</span><svg viewBox="0 0 280 180"><path d="M25 76l109 -55 121 62 -108 56Z" fill="#e9efe5" stroke="#b7c5b3"/><path d="M25 76v36l122 62v-35M147 139l108 -56v34l-108 57" fill="none" stroke="#bfcebd"/>${shapes}</svg></div>`;
  }
  function renderProjects() {
    const list=repo.list();
    app.innerHTML=`<div class="shell">${baseHeader('projects')}<main class="content"><div class="page-heading"><div><div class="eyebrow">WORKSPACE / PROJECTS</div><h1>پروژه‌های من</h1><p>تمام طرح‌ها در یک مکان؛ شروع، ادامه و آماده‌سازی ساخت.</p></div><div class="topbar-right"><span class="micro">${list.length.toLocaleString('fa-IR')} پروژه</span><button class="button sm" data-action="try-demo">پروژه نمونه</button><button class="button sm" data-action="import-project">ورود فایل پروژه</button><input type="file" id="project-import" accept=".json,application/json" hidden></div></div><div class="project-grid"><button class="new-project" data-action="new-project"><span class="plus">＋</span><strong>پروژه جدید</strong><span class="micro">از یک صحنه خالی شروع کن</span></button>${list.map(p=>`<article class="project-card">${thumb(p)}<div class="project-info"><h3>${esc(p.name)}</h3><p>آخرین ویرایش: ${formatDate(p.updatedAt)}</p><div class="project-actions"><button class="button primary sm open" data-action="open-project" data-id="${esc(p.id)}">بازکردن طرح</button><button class="button sm square" data-action="project-menu" data-id="${esc(p.id)}" title="گزینه‌های پروژه" aria-label="گزینه‌های پروژه">⋯</button><button class="button sm" disabled title="پس از تکمیل یونیت‌ها در فاز L">آنفولد</button></div></div></article>`).join('')}</div></main>${footer()}</div>`;
  }
  const dockHtml=()=>categories.map(c=>`<button type="button" class="dock-button ${activeTool===c.id?'active':''}" data-action="tool" data-tool="${c.id}" aria-pressed="${activeTool===c.id}"><span class="ico">${c.icon}</span><span>${c.title}</span></button>`).join('');
  function renderToolSheet() {
    const el=document.getElementById('tool-sheet');if(!el)return;
    const c=categories.find(x=>x.id===activeTool);
    el.hidden=!c;
    if(!c){el.innerHTML='';return;}
    el.innerHTML=`<div class="tool-sheet-head"><strong>${esc(c.title)}</strong><button class="button sm ghost" data-action="close-tool">بستن ×</button></div><div class="tool-grid">${c.tools.map(([name,phase,mode])=>mode?`<button class="button sm ${drawTool===mode?'primary':''}" data-action="activate-draw" data-draw="${mode}">${esc(name)}</button>`:upcoming(name,phase)).join('')}${c.id==='cabinets'?'<button class="button sm" data-action="add-sample" title="صرفاً تست حجم فاز C">＋ حجم آزمایشی</button>':''}</div><p class="micro">${c.id==='architecture'?'دیوار را بکشید، سپس روی دیوار برای در/پنجره بزنید.':'ابزار فعال را انتخاب کنید و روی صحنه کلیک و درگ کنید. باکس‌ها هنوز یونیت ندارند.'}</p>`;
    document.querySelectorAll('.dock-button').forEach(btn=>{btn.classList.toggle('active',btn.dataset.tool===activeTool);btn.setAttribute('aria-pressed',String(btn.dataset.tool===activeTool));});
  }
  function renderWorkspace(pid) {
    project=repo.get(pid);
    if(!project){toast('پروژه یافت نشد.');nav('#/projects');return;}
    selectedId=null;view='3d';activeTool=null;drawTool=null;undo=[];redo=[];
    app.innerHTML=`<div class="workspace-shell"><header class="workspace-head"><button class="button sm back-to-projects" data-action="go-projects">← پروژه‌ها</button><div class="workspace-title"><strong id="active-project-title">${esc(project.name)}</strong><span id="save-status">ذخیره‌شده در دستگاه</span></div><div class="spacer"></div><div class="mode-switch" role="group" aria-label="نوع نما"><button data-action="view" data-view="2d">2D</button><button class="active" data-action="view" data-view="3d">3D</button><button data-action="ar" title="نیازمند گوشی سازگار و HTTPS">AR</button></div><button class="button sm" data-action="save">ذخیره</button></header><main class="workspace-main"><canvas id="scene-canvas" class="scene-canvas" aria-label="پلان و نمای ایزومتریک"></canvas><div class="canvas-label"><span class="status-dot"></span><span id="view-label">نمای سه‌بعدی · ایزومتریک</span></div><span class="tool-help" id="tool-help">از پنل پایین ابزار را انتخاب کنید؛ برای طراحی کلیک و درگ کنید.</span><div class="side-actions"><button class="button square" data-action="select-tool" title="انتخاب / خروج از ترسیم" aria-label="انتخاب">⌖</button><button class="button square" data-action="calibrate" title="کالیبراسیون و مبدأ اتاق" aria-label="کالیبراسیون">⊞</button><button class="button square" data-action="lighting" title="نور، رفلکشن و AO" aria-label="تنظیم رندر">☀</button><button class="button square" data-action="undo" title="بازگشت" aria-label="بازگشت">↶</button><button class="button square" data-action="redo" title="انجام دوباره" aria-label="انجام دوباره">↷</button></div><section class="inspector" id="inspector" hidden aria-label="ویژگی‌های آبجکت"></section><section class="lighting-panel" id="lighting-panel" hidden><div class="tool-sheet-head"><strong>نور و رندر سه‌بعدی</strong><button class="button sm ghost" data-action="lighting">×</button></div><label>جهت نور <input type="range" data-light="azimuth" min="0" max="360" value="135"></label><label>ارتفاع نور <input type="range" data-light="elevation" min="15" max="85" value="52"></label><label>شدت نور <input type="range" data-light="intensity" min=".5" max="5" step=".1" value="2.5"></label><label>اکلوژن <input type="range" data-light="ao" min="0" max="1.5" step=".05" value=".75"></label><label>بازتاب کابینت <input type="range" data-light="reflection" min="0" max="1" step=".05" value=".75"></label><small>بازتاب محیطی متریال، سایه واقعی و SSAO · تنظیمات موقت این جلسه</small></section><div class="mini-map" id="mini-map"><div class="map-header"><strong>پلان زنده</strong><button class="map-expand" data-action="toggle-map">بزرگ‌نمایی ↗</button></div><canvas id="map-canvas" aria-label="انتخاب آبجکت روی مینی‌مپ"></canvas><div class="map-footer">متر · واحد مشترک مدل</div></div><div class="dock-wrap"><div id="tool-sheet" class="tool-sheet" hidden></div><nav class="dock" aria-label="ابزارهای طراحی">${dockHtml()}</nav></div></main></div>`;
    renderer=window.KitchyarScene.createScene(document.getElementById('scene-canvas'),document.getElementById('map-canvas'),{
      onSelect: select,onManipulate: manipulate,onCommit: commitMove,onCancel:cancelMove,
      onCreate:createShape,onCreateOpening:createOpening,onHint:toast,
      onSceneFrame:(items,mode,selection,draft)=>pbr?.render(items,mode,selection,draft),
    });
    renderer.render(project.scene.items,view,selectedId);updateInspector();
    const canvas=document.getElementById("scene-canvas");
    const pbrPromise=window.KitchyarReal3D?.create(canvas,(message)=>{if(document.getElementById("scene-canvas")===canvas)document.getElementById("view-label").textContent=message;});
    pbrPromise?.then(instance=>{if(document.getElementById("scene-canvas")!==canvas){instance?.dispose();return;}pbr=instance;refreshScene();})
      .catch(e=>toast("WebGL: "+e.message));
  }
  function refreshScene() {renderer?.render(project.scene.items,view,selectedId);updateInspector();}
  function select(pid) {selectedId=pid;refreshScene();}
  function manipulate(pid,values) {
    const item=project.scene.items.find(i=>i.id===pid);
    if(!item)return;
    if(item.kind==='wall')Core.propagateWallNodes(project.scene.items,item,values);
    Object.assign(item,values);
    const el=document.getElementById('save-status');if(el)el.textContent='ویرایش در جریان...';
    renderer?.render(project.scene.items,view,selectedId);
  }
  function saveScene() {
    const normalized=Core.normalizeScene(project.scene);
    Core.validateScene(normalized);
    project=repo.update(project.id,{scene:normalized});
    const el=document.getElementById('save-status');if(el)el.textContent='ذخیره‌شده در دستگاه';
  }
  function cancelMove(before){project.scene.items=before;refreshScene();}
  function createShape(kind,a,b) {
    const before=Core.copy(project.scene.items);
    try{
      const item=kind==='wall'?Core.createWall(a,b):Core.createCabinetRun(a,b,kind==='base'?'base':'wall');
      if(kind==='wall'){
        const joined=Core.connectWall(project.scene.items,item);
        project.scene.items=joined.items;selectedId=joined.selectedId;
      }else{project.scene.items.push(item);selectedId=item.id;}
      commit(before);
    }catch(error){project.scene.items=before;selectedId=null;refreshScene();toast(error.message);}
  }
  function createOpening(wid,offset,type) {
    const wall=project.scene.items.find(i=>i.id===wid);if(!wall)return;
    const before=Core.copy(project.scene.items),opening=Core.createOpening(wall,type,offset);
    if(!opening||opening.width<.35)return toast('طول دیوار برای بازشو کافی نیست.');
    const half=opening.width/2+.08,maximum=Core.length(wall)-half;
    opening.offset=Math.max(half,Math.min(maximum,offset));
    project.scene.items.push(opening);selectedId=opening.id;
    try{commit(before);}catch(e){project.scene.items=before;selectedId=null;refreshScene();toast(e.message);}
  }
  function createDemo() {
    const p=repo.create('نمونه آشپزخانه — فاز D/E/F');
    const pts=[[-2,-1.5],[2,-1.5],[2,1.5],[-2,1.5]];
    const walls=pts.map((v,i)=>Core.createWall({x:v[0],z:v[1]},
      {x:pts[(i+1)%4][0],z:pts[(i+1)%4][1]}));
    const op=Core.createOpening(walls[0],'window',2);
    const base=Core.createCabinetRun({x:-1.6,z:-1.25},{x:1.4,z:-1.25},'base');
    const upper=Core.createCabinetRun({x:-1.6,z:-1.2},{x:1.4,z:-1.2},'wall');
    const scene={items:[...walls,op,base,upper]};
    Core.validateScene(Core.normalizeScene(scene));
    repo.update(p.id,{scene});
    nav('#/workspace/'+p.id);
  }
  function commit(before) {
    const previous=JSON.stringify(before),current=JSON.stringify(project.scene.items);
    if(previous===current)return;
    saveScene();undo.push(before);if(undo.length>40)undo.shift();redo=[];refreshScene();
  }
  function commitMove(before) {try{commit(before);}catch(e){project.scene.items=before;refreshScene();toast(e.message);}}
  function updateInspector() {
    const el=document.getElementById('inspector');if(!el)return;
    const item=project?.scene.items.find(i=>i.id===selectedId);el.hidden=!item;
    if(!item)return;
    const fields=item.kind==='wall'? [['x1','شروع X'],['z1','شروع Z'],['x2','پایان X'],['z2','پایان Z'],['thickness','ضخامت'],['height','ارتفاع']]
      :item.kind==='opening'?[['offset','فاصله از شروع دیوار'],['width','عرض'],['height','ارتفاع'],['sill','ارتفاع از کف']]
      :item.kind==='cabinetRun'?[['x1','شروع X'],['z1','شروع Z'],['x2','پایان X'],['z2','پایان Z'],
        ['depth','عمق'],['height','ارتفاع'],['elevation','ارتفاع نصب']]
      :[['width','عرض'],['depth','عمق'],['height','ارتفاع'],['x','موقعیت X'],['z','موقعیت Z']];
    const description=item.kind==='wall'?'دیوار با ضخامت واقعی · بازشوها به همین دیوار متصل‌اند'
      :item.kind==='opening'?'پنجره یا در یک آبجکت مستقل با دستگیره‌های عرض، ارتفاع، جان‌پناه و جابه‌جایی است.'
      :item.kind==='cabinetRun'?'حجم پیوسته بدون یونیت، در و کشو · اندازه‌ها بر حسب متر'
      :'حجم نمونه فاز C';
    const length=(item.kind==='wall'||item.kind==='cabinetRun')?`<p class="micro">طول: ${Core.length(item).toFixed(2)} متر</p>`:'';
    el.innerHTML=`<div class="inspector-head"><strong>${esc(item.label)}</strong><button class="button sm ghost" data-action="deselect" aria-label="بستن ویژگی‌ها">×</button></div><p class="micro">${description}</p>${length}<div class="field-grid">${fields.map(([key,label])=>`<label class="field">${label} (m)<input type="number" step="0.01" data-field="${key}" value="${Number(item[key]).toFixed(2)}"></label>`).join('')}</div><div class="inspector-actions"><button class="button sm" data-action="duplicate-item">کپی</button><button class="button sm danger" data-action="remove-item">حذف</button></div>`;
  }
  function changeHistory(direction) {
    if(!project)return;
    const from=direction==='undo'?undo:redo,to=direction==='undo'?redo:undo;
    if(!from.length){toast('مرحله‌ای برای بازگشت وجود ندارد.');return;}
    const snapshot=from.pop(),current=Core.copy(project.scene.items);project.scene.items=Core.copy(snapshot);
    try{saveScene();to.push(current);refreshScene();}catch(e){project.scene.items=current;from.push(snapshot);toast(e.message);}
  }
  function setDrawTool(mode) {
    drawTool=mode||null;renderer?.setTool(drawTool||'select');
    const label=document.getElementById('tool-help');
    if(label)label.textContent=drawTool==='window'||drawTool==='door'?'برای قرار دادن بازشو، روی دیوار لمس کنید.'
      :drawTool?'برای ایجاد حجم، نقطه شروع تا انتها را با انگشت یا موس بکشید.':'برای انتخاب و جابه‌جایی، روی آبجکت بزنید.';
    renderToolSheet();
  }
  function deleteItem(id) {
    const before=Core.copy(project.scene.items),item=project.scene.items.find(i=>i.id===id);
    if(!item)return;
    project.scene.items=project.scene.items.filter(i=>i.id!==id&&i.wallId!==id);
    selectedId=null;
    try{commit(before);}catch(e){project.scene.items=before;refreshScene();toast(e.message);}
  }
  function removeSelected() {
    if(!project||!selectedId)return;
    const id=selectedId,count=project.scene.items.filter(i=>i.wallId===id).length;
    if(count) return modal({title:'حذف دیوار و بازشوها',message:`${count} در/پنجره به این دیوار متصل است. همه حذف شوند؟`,value:null,confirm:'حذف',danger:true,onConfirm:()=>deleteItem(id)});
    deleteItem(id);
  }
  function calibrate() {
    if(!project)return;
    const c=project.scene.calibration||Core.DEFAULT_CALIBRATION;
    modalRoot.innerHTML=`<div class="modal-cover"><section class="modal" role="dialog" aria-modal="true" aria-label="کالیبراسیون"><h2>مبدأ و کالیبراسیون</h2><p>متر واحد مهندسی پروژه است. این تنظیمات ابعاد دیوار و کابینت را تغییر نمی‌دهند؛ در AR نقاط A/B جداگانه ثبت می‌شوند.</p><div class="field-grid">${[['originX','مبدأ X'],['originZ','مبدأ Z'],['rotation','زاویه (درجه)'],['baselineMeters','فاصله مبنا (متر)']].map(([key,title])=>`<label class="field">${title}<input data-calibration="${key}" type="number" step=".01" value="${c[key]}"></label>`).join('')}</div><div class="modal-actions"><button class="button" data-action="close-modal">انصراف</button><button class="button primary" data-action="save-calibration">ثبت مرجع</button></div></section></div>`;
  }
  function modal({title,message='',value='',confirm='تأیید',danger=false,onConfirm}) {
    modalRoot.innerHTML=`<div class="modal-cover" role="presentation"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><h2 id="dialog-title">${esc(title)}</h2>${message?`<p>${esc(message)}</p>`:''}${value!==null?`<input id="dialog-input" aria-label="نام پروژه" value="${esc(value)}" maxlength="65">`:''}<div class="modal-actions"><button class="button" type="button" id="modal-cancel">انصراف</button><button class="button ${danger?'danger':'primary'}" id="modal-confirm" type="button">${esc(confirm)}</button></div></section></div>`;
    const close=()=>modalRoot.innerHTML='';
    document.getElementById('modal-cancel').onclick=close;
    document.getElementById('modal-confirm').onclick=()=>{try{const v=document.getElementById('dialog-input')?.value;onConfirm(v);close();}catch(e){toast(e.message);}};
    const field=document.getElementById('dialog-input');field?.focus();field?.select();
    field?.addEventListener('keydown',e=>{if(e.key==='Enter')document.getElementById('modal-confirm').click();});
  }
  function downloadProject(pid) {
    const text=repo.exportProject(pid),blob=new Blob([text],{type:'application/json'}),url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=`kitchyar-${pid.slice(0,8)}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function showProjectMenu(pid) {
    const p=repo.get(pid);if(!p)return;
    modalRoot.innerHTML=`<div class="modal-cover"><section class="modal" role="dialog" aria-modal="true" aria-label="گزینه‌های پروژه"><h2>${esc(p.name)}</h2><div class="tool-grid"><button class="button" data-action="rename-project" data-id="${esc(pid)}">تغییر نام</button><button class="button" data-action="duplicate-project" data-id="${esc(pid)}">ایجاد کپی</button><button class="button" data-action="export-project" data-id="${esc(pid)}">نسخه پشتیبان JSON</button><button class="button danger" data-action="delete-project" data-id="${esc(pid)}">حذف پروژه</button></div><div class="modal-actions"><button class="button" data-action="close-modal">بستن</button></div></section></div>`;
  }
  function route() {
    if(pbr){pbr.dispose();pbr=null;}renderer=null;
    try {
      if(!repo)repo=Core.createRepository(localStorage);
      repo.list();
      const parts=location.hash.replace(/^#\/?/,'').split('/');
      if(parts[0]==='workspace'&&parts[1])renderWorkspace(parts[1]);
      else if(parts[0]==='projects')renderProjects();
      else renderWelcome();
    }catch(e){app.innerHTML=`<div class="error-view"><h2>بازکردن اطلاعات پروژه ممکن نیست</h2><p>${esc(e.message)}</p><p class="micro">برای جلوگیری از حذف داده‌ها، ذخیره‌سازی خودکار متوقف شده است.</p></div>`;}
  }
  document.addEventListener('click',(e)=>{
    const btn=e.target.closest('[data-action]');if(!btn||btn.disabled)return;
    const action=btn.dataset.action,pid=btn.dataset.id;
    try{
      if(action==='go-projects')return nav('#/projects');
      if(action==='import-project')return document.getElementById('project-import')?.click();
      if(action==='new-project')return modal({title:'پروژه جدید',message:'نام پروژه را وارد کنید.',value:'آشپزخانه جدید',confirm:'ساخت پروژه',onConfirm:name=>{const p=repo.create(name);nav(`#/workspace/${p.id}`);}});
      if(action==='try-demo')return createDemo();
      if(action==='open-project')return nav(`#/workspace/${pid}`);
      if(action==='project-menu')return showProjectMenu(pid);
      if(action==='close-modal')return modalRoot.innerHTML='';
      if(action==='rename-project')return modal({title:'تغییر نام پروژه',value:repo.get(pid).name,onConfirm:name=>{repo.update(pid,{name});renderProjects();}});
      if(action==='duplicate-project'){repo.duplicate(pid);modalRoot.innerHTML='';renderProjects();return toast('نسخه جدید ساخته شد.');}
      if(action==='export-project')return downloadProject(pid);
      if(action==='delete-project')return modal({title:'حذف پروژه',message:'حذف پروژه از همین دستگاه برگشت‌پذیر نیست؛ قبل از حذف نسخه پشتیبان بگیرید.',value:null,confirm:'حذف',danger:true,onConfirm:()=>{repo.remove(pid);renderProjects();}});
      if(action==='view'){view=btn.dataset.view;document.querySelectorAll('[data-action="view"]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));document.getElementById('view-label').textContent=view==='2d'?'پلان دوبعدی · مقیاس متریک':'نمای سه‌بعدی · PBR';return renderer?.render(project.scene.items,view,selectedId);}
      if(action==='ar') {
        if(!window.KitchyarAR)return toast('بخش AR هنوز بارگذاری نشده است.');
        return window.KitchyarAR.start(project.scene,()=>toast('جلسه AR بسته شد.'),toast,(scene,before)=>{
          project.scene=scene;commit(before);
        }).catch(e=>toast('AR: '+e.message));
      }
      if(action==='lighting'){const panel=document.getElementById('lighting-panel');if(panel)panel.hidden=!panel.hidden;return;}
       if(action==='calibrate')return calibrate();
      if(action==='save-calibration'){
        const c={...project.scene.calibration};
        document.querySelectorAll('[data-calibration]').forEach(input=>c[input.dataset.calibration]=Number(input.value));
        project.scene.calibration=Core.normalizeCalibration(c);saveScene();modalRoot.innerHTML='';return toast('مرجع ذخیره شد؛ اندازه‌های مدل ثابت ماند.');
      }
      if(action==='select-tool'){setDrawTool(null);return;}
      if(action==='activate-draw'){
        if(btn.dataset.draw==='calibrate')return calibrate();
        setDrawTool(btn.dataset.draw);return;
      }
      if(action==='toggle-map'){const map=document.getElementById('mini-map');map.classList.toggle('expanded');btn.textContent=map.classList.contains('expanded')?'کوچک‌نمایی ↙':'بزرگ‌نمایی ↗';return renderer?.render(project.scene.items,view,selectedId);}
      if(action==='tool'){activeTool=activeTool===btn.dataset.tool?null:btn.dataset.tool;return renderToolSheet();}
      if(action==='close-tool'){activeTool=null;return renderToolSheet();}
      if(action==='save'){saveScene();return toast('پروژه ذخیره شد.');}
      if(action==='add-sample'){
        if(project.scene.items.length>=150)return toast('حداکثر تعداد آبجکت آزمایشی این نسخه پر شده است.');
        const before=Core.copy(project.scene.items);project.scene.items.push(Core.sampleVolume(before.length));
        selectedId=project.scene.items.at(-1).id;commit(before);return toast('حجم آزمایشی اضافه شد.');
      }
      if(action==='deselect')return select(null);
      if(action==='duplicate-item'){
        const before=Core.copy(project.scene.items),v=project.scene.items.find(i=>i.id===selectedId);
        if(v){
          if(v.kind==='opening')return toast('برای کپی بازشو از ابزار پنجره/در استفاده کنید.');
          const fresh=Core.sampleVolume(before.length),n={...Core.copy(v),id:fresh.id};
          if(v.kind==='volume'){n.x+=.35;n.z+=.35;}
          else {n.x1+=.35;n.x2+=.35;n.z1+=.35;n.z2+=.35;}
          project.scene.items.push(n);selectedId=n.id;
          try{commit(before);}catch(e){project.scene.items=before;selectedId=v.id;refreshScene();toast(e.message);}
        }return;
      }
      if(action==='remove-item')return removeSelected();
      if(action==='undo'||action==='redo')return changeHistory(action);
    }catch(error){toast(error.message);}
  });
  document.addEventListener('input',(e)=>{if(e.target.dataset.light&&pbr){pbr.setLighting({[e.target.dataset.light]:Number(e.target.value)});}});
  document.addEventListener('change',(e)=>{
    if(e.target.id==='project-import'){
      const file=e.target.files?.[0];if(!file)return;
      file.text().then(text=>{repo.importProject(text);renderProjects();toast('پروژه از فایل بازیابی شد.');}).catch(err=>toast(err.message));return;
    }
    const field=e.target.dataset.field;
    if(!field||!project||!selectedId)return;
    const item=project.scene.items.find(i=>i.id===selectedId),value=Number(e.target.value);
    if(!item||!Number.isFinite(value))return toast('عدد معتبر وارد کنید.');
    const before=Core.copy(project.scene.items);item[field]=value;
    try{commit(before);}catch(error){project.scene.items=before;refreshScene();toast(error.message);}
  });
  document.addEventListener('keydown',(e)=>{
    if(e.key==='Escape'&&modalRoot.innerHTML)modalRoot.innerHTML='';
    if(document.activeElement?.tagName==='INPUT')return;
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();changeHistory('undo');}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();changeHistory('redo');}
    if(e.key==='Delete'&&project&&selectedId&&location.hash.startsWith('#/workspace/'))removeSelected();
  });
  window.addEventListener('hashchange',route);
  route();
})();
