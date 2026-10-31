/* Kitchyar project domain; no UI, rendering or Android dependencies. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.KitchyarCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const STORAGE_KEY = 'kitchyar.projects.v1';
  const SCHEMA_VERSION = 1;
  const MAX_ITEMS = 350;
  const MAX_BYTES = 2_000_000;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const cleanName = (value) => String(value || '').trim().slice(0, 65) || 'پروژه بدون نام';
  const copy = (v) => JSON.parse(JSON.stringify(v));
  const id = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const now = () => new Date().toISOString();
  const finite = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;

  const length = (v) => Math.hypot(v.x2 - v.x1, v.z2 - v.z1);
  const rounded = (v) => Math.round(v * 1000) / 1000;
  const xy = (raw) => ({
    x1: clamp(finite(raw.x1, 0), -100, 100), z1: clamp(finite(raw.z1, 0), -100, 100),
    x2: clamp(finite(raw.x2, 1), -100, 100), z2: clamp(finite(raw.z2, 0), -100, 100),
  });
  function normalizeItem(raw) {
    if (!raw || typeof raw.id !== 'string') return null;
    const common = {id: raw.id.slice(0, 80), kind: raw.kind,
      label: String(raw.label || 'آبجکت').slice(0, 60),
      color: /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : '#b4bdac'};
    if (raw.kind === 'volume') return {...common, x: clamp(finite(raw.x, 0), -100, 100),
      z: clamp(finite(raw.z, 0), -100, 100),
      width: clamp(finite(raw.width, 0.8), .1, 10),
      depth: clamp(finite(raw.depth, .6), .1, 10),
      height: clamp(finite(raw.height, .85), .1, 10)};
    if (raw.kind === 'wall') return {...common, ...xy(raw),
      thickness: clamp(finite(raw.thickness, .15), .06, .6),
      height: clamp(finite(raw.height, 2.8), 1.8, 6)};
    if (raw.kind === 'opening' && typeof raw.wallId === 'string') return {...common,
      wallId: raw.wallId.slice(0, 80), openingType: raw.openingType === 'door' ? 'door' : 'window',
      offset: clamp(finite(raw.offset, .5), 0, 100),
      width: clamp(finite(raw.width, 1), .35, 5),
      height: clamp(finite(raw.height, 1.2), .4, 3),
      sill: clamp(finite(raw.sill, .9), 0, 5)};
    if (raw.kind === 'cabinetRun') return {...common, ...xy(raw),
      runType: raw.runType === 'wall' ? 'wall' : 'base',
      depth: clamp(finite(raw.depth, raw.runType === 'wall' ? .35 : .6), .2, 1.2),
      height: clamp(finite(raw.height, raw.runType === 'wall' ? .72 : .85), .3, 2.5),
      elevation: clamp(finite(raw.elevation, raw.runType === 'wall' ? 1.45 : 0), 0, 4),
      wallId: typeof raw.wallId === 'string' ? raw.wallId.slice(0,80) : null};
    return null;
  }
  const DEFAULT_CALIBRATION = {originX: 0, originZ: 0, rotation: 0, baselineMeters: 1, measuredMeters: null};
  function normalizeCalibration(raw) {
    return {originX: clamp(finite(raw?.originX, 0), -100, 100),
      originZ: clamp(finite(raw?.originZ, 0), -100, 100),
      rotation: clamp(finite(raw?.rotation, 0), -360, 360),
      baselineMeters: clamp(finite(raw?.baselineMeters, 1), .1, 20),
      measuredMeters: raw?.measuredMeters == null ? null : clamp(finite(raw.measuredMeters, 1), .1, 20)};
  }
  function canPlaceOpening(opening, wall, siblings = []) {
    if (!wall || wall.kind !== 'wall') return 'دیوار میزبان موجود نیست.';
    const l = length(wall), gap = .08;
    if (l < .5) return 'طول دیوار کافی نیست.';
    if (opening.offset - opening.width / 2 < gap - 1e-6 ||
        opening.offset + opening.width / 2 > l - gap + 1e-6) return 'بازشو از محدوده دیوار خارج می‌شود.';
    if (opening.sill + opening.height > wall.height + 1e-6) return 'ارتفاع بازشو از ارتفاع دیوار بیشتر است.';
    for (const other of siblings) {
      if (other.id !== opening.id && other.kind === 'opening' && other.wallId === wall.id &&
          Math.abs(other.offset - opening.offset) < (other.width + opening.width) / 2 + gap - 1e-6)
        return 'بازشو با بازشوی دیگر تداخل دارد.';
    }
    return null;
  }
  function validateScene(scene) {
    const items = scene?.items || [];
    for (const item of items) {
      if ((item.kind === 'wall' || item.kind === 'cabinetRun') && length(item) < .3)
        throw Error('طول دیوار یا ردیف کابینت باید حداقل ۳۰ سانتی‌متر باشد.');
      if (item.kind === 'opening') {
        const error = canPlaceOpening(item,items.find(w=>w.id === item.wallId),items);
        if (error) throw Error(error);
      }
    }
    return true;
  }
  function normalizeScene(raw) {
    return {items: Array.isArray(raw?.items) ? raw.items.slice(0, MAX_ITEMS).map(normalizeItem).filter(Boolean) : [],
      calibration: normalizeCalibration(raw?.calibration)};
  }
  function createWall(a, b) {
    return normalizeItem({id:id(),kind:'wall',label:'دیوار',x1:rounded(a.x),z1:rounded(a.z),
      x2:rounded(b.x),z2:rounded(b.z),height:2.8,thickness:.15,color:'#d6dfd0'});
  }
  function createCabinetRun(a, b, type = 'base') {
    const wall = type === 'wall';
    return normalizeItem({id:id(),kind:'cabinetRun',label:wall?'کابینت هوایی':'کابینت زمینی',
      x1:rounded(a.x),z1:rounded(a.z),x2:rounded(b.x),z2:rounded(b.z),runType:type,
      depth:wall?.35:.6,height:wall?.72:.85,elevation:wall?1.45:0,
      color:wall?'#a7bda6':'#8faaa0'});
  }
  function createOpening(wall,type='window',offset=length(wall)/2) {
    const door = type === 'door';
    const margin = .08, width = Math.min(door?.9:1.2, length(wall) - margin * 2);
    return normalizeItem({id:id(),kind:'opening',wallId:wall.id,openingType:type,label:door?'در':'پنجره',
      offset:rounded(offset),width,height:door?2.1:1.2,sill:door?0:.9,color:door?'#ac9b85':'#87aab4'});
  }
  function normalizeProject(raw) {
    if (!raw || typeof raw.id !== 'string') return null;
    const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : now();
    return {
      id: raw.id.slice(0, 80), name: cleanName(raw.name),
      createdAt, updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : createdAt,
      revision: Math.max(0, Math.floor(finite(raw.revision, 0))), scene: normalizeScene(raw.scene),
    };
  }
  function blankProject(name = 'آشپزخانه جدید') {
    const stamp = now();
    return {id: id(), name: cleanName(name), createdAt: stamp, updatedAt: stamp, revision: 0, scene: normalizeScene({items: []})};
  }
  function sampleVolume(n = 0) {
    return normalizeItem({id: id(), kind: 'volume', label: 'حجم آزمایشی', x: (n % 4) * 0.55 - 0.9, z: Math.floor(n / 4) * 0.55 - 0.4, width: 0.8, depth: 0.6, height: 0.85, color: '#b4bdac'});
  }
  function validateEnvelope(value) {
    if (value.length > MAX_BYTES) throw Error('حجم داده پروژه‌ها از حد مجاز این نسخه بیشتر است.');
    let data;
    try { data = JSON.parse(value); } catch { throw Error('فایل پروژه‌ها معتبر نیست؛ اطلاعات فعلی بازنویسی نمی‌شود.'); }
    if (data?.format !== 'kitchyar-projects' || data.version !== SCHEMA_VERSION || !Array.isArray(data.projects)) {
      throw Error('نسخه ذخیره‌سازی پروژه‌ها ناشناخته است؛ اطلاعات فعلی بازنویسی نمی‌شود.');
    }
    return data.projects.slice(0, 100).map(normalizeProject).filter(Boolean);
  }
  function createRepository(storage) {
    if (!storage || typeof storage.getItem !== 'function') throw Error('فضای ذخیره‌سازی در دسترس نیست.');
    let projects;
    function load() {
      if (projects) return projects;
      const value = storage.getItem(STORAGE_KEY);
      projects = value ? validateEnvelope(value) : [];
      return projects;
    }
    function persist(next) {
      const value = JSON.stringify({format: 'kitchyar-projects', version: SCHEMA_VERSION, projects: next});
      if (value.length > MAX_BYTES) throw Error('فضای پروژه‌ها پر شده؛ ابتدا نسخه پشتیبان تهیه کنید.');
      storage.setItem(STORAGE_KEY, value);
      projects = next;
    }
    const list = () => copy(load()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const get = (pid) => { const p = load().find((p) => p.id === pid); return p ? copy(p) : null; };
    function create(name) { const p = blankProject(name); persist([...load(), p]); return copy(p); }
    function update(pid, values) {
      const existing = load().find((p) => p.id === pid);
      if (!existing) throw Error('پروژه پیدا نشد.');
      const next = {...existing, name: values.name === undefined ? existing.name : cleanName(values.name),
        scene: values.scene === undefined ? existing.scene : normalizeScene(values.scene),
        revision: existing.revision + 1, updatedAt: now()};
      persist(load().map((p) => p.id === pid ? next : p)); return copy(next);
    }
    function duplicate(pid) {
      const original = get(pid);
      if (!original) throw Error('پروژه پیدا نشد.');
      const p = {...original, id: id(), name: cleanName(`${original.name} — کپی`), createdAt: now(), updatedAt: now(), revision: 0};
      const ids = new Map(p.scene.items.map(item=>[item.id,id()]));
      p.scene.items = p.scene.items.map(item=>({...item,id:ids.get(item.id),
        ...(item.wallId?{wallId:ids.get(item.wallId)||item.wallId}:{})}));
      persist([...load(), p]); return copy(p);
    }
    function remove(pid) { if (!get(pid)) throw Error('پروژه پیدا نشد.'); persist(load().filter((p) => p.id !== pid)); }
    function exportProject(pid) {
      const p = get(pid);
      if (!p) throw Error('پروژه پیدا نشد.');
      return JSON.stringify({format: 'kitchyar-project', version: SCHEMA_VERSION, project: p}, null, 2);
    }
    function importProject(text) {
      if (typeof text !== 'string' || text.length > MAX_BYTES) throw Error('حجم فایل پروژه معتبر نیست.');
      let data;
      try {data=JSON.parse(text);}catch{throw Error('فایل JSON معتبر نیست.');}
      if (data?.format !== 'kitchyar-project' || data.version !== SCHEMA_VERSION) throw Error('فرمت این پروژه با کیچیار سازگار نیست.');
      const incoming=normalizeProject(data.project);
      if (!incoming) throw Error('اطلاعات پروژه ناقص است.');
      const p={...incoming,id:id(),name:cleanName(incoming.name+' — واردشده'),updatedAt:now(),createdAt:now(),revision:0};
      const ids=new Map(p.scene.items.map(item=>[item.id,id()]));
      p.scene.items=p.scene.items.map(item=>({...item,id:ids.get(item.id),
        ...(item.wallId?{wallId:ids.get(item.wallId)||item.wallId}:{})}));
      persist([...load(),p]);return copy(p);
    }
    return {list, get, create, update, duplicate, remove, exportProject, importProject};
  }

  // Implicit shared-node topology: all segment endpoints are metric coordinates.
  const pointAt=(wall,t)=>{const l=length(wall)||1;return {x:wall.x1+(wall.x2-wall.x1)*t/l,z:wall.z1+(wall.z2-wall.z1)*t/l};};
  function nearestOn(wall,p){
    const l=length(wall)||1,dx=(wall.x2-wall.x1)/l,dz=(wall.z2-wall.z1)/l;
    const t=clamp((p.x-wall.x1)*dx+(p.z-wall.z1)*dz,0,l);
    const q=pointAt(wall,t);
    return {t,p:q,d:Math.hypot(p.x-q.x,p.z-q.z)};
  }
  function segmentIntersection(a,b){
    const ax=a.x2-a.x1,az=a.z2-a.z1,bx=b.x2-b.x1,bz=b.z2-b.z1;
    const cross=ax*bz-az*bx;
    if(Math.abs(cross)<1e-8)return null;
    const qx=b.x1-a.x1,qz=b.z1-a.z1;
    const t=(qx*bz-qz*bx)/cross,u=(qx*az-qz*ax)/cross;
    if(t<-.001||t>1.001||u<-.001||u>1.001)return null;
    return {a:clamp(t,0,1)*length(a),b:clamp(u,0,1)*length(b)};
  }
  function connectWall(items,rawWall){
    const walls=items.filter(i=>i.kind==='wall');
    const wall=normalizeItem(rawWall);
    // Endpoint first, then on-segment snap: exact shared coordinates are important.
    for(const key of ['1','2']){
      const p={x:wall['x'+key],z:wall['z'+key]};
      const candidates=walls.flatMap(w=>[pointAt(w,0),pointAt(w,length(w))]);
      let closest=null,dist=.18;
      for(const q of candidates){const d=Math.hypot(q.x-p.x,q.z-p.z);if(d<dist){closest=q;dist=d;}}
      if(!closest){
        for(const w of walls){const q=nearestOn(w,p);if(q.d<dist){closest=q.p;dist=q.d;}}
      }
      if(closest){wall['x'+key]=rounded(closest.x);wall['z'+key]=rounded(closest.z);}
    }
    if(length(wall)<.3)throw Error('طول دیوار کمتر از ۳۰ سانتی‌متر است.');
    const cuts=new Map(walls.map(w=>[w.id,[]])),freshCuts=[];
    function cut(list,t,len){if(t>.3&&t<len-.3&&!list.some(v=>Math.abs(v-t)<.055))list.push(t);}
    for(const other of walls){
      const l=length(other),n=length(wall);
      const intersection=segmentIntersection(other,wall);
      if(intersection){cut(cuts.get(other.id),intersection.a,l);cut(freshCuts,intersection.b,n);}
      for(const p of [pointAt(wall,0),pointAt(wall,n)]){
        const q=nearestOn(other,p);
        if(q.d<.06)cut(cuts.get(other.id),q.t,l);
      }
      for(const p of [pointAt(other,0),pointAt(other,l)]){
        const q=nearestOn(wall,p);
        if(q.d<.06)cut(freshCuts,q.t,n);
      }
    }
    const others=items.filter(i=>i.kind!=='wall').map(copy);
    function split(w,positions){
      const l=length(w),opens=others.filter(o=>o.kind==='opening'&&o.wallId===w.id);
      const ordered=[0,...positions.sort((a,b)=>a-b),l];
      const valid=[0];
      for(const t of ordered.slice(1,-1)){
        const prev=valid.at(-1);
        if(t-prev<.3||l-t<.3)continue;
        // A node must not cut through the occupied width of an opening.
        if(opens.some(o=>Math.abs(o.offset-t)<o.width/2+.09))continue;
        valid.push(t);
      }
      valid.push(l);
      const fragments=[];
      for(let i=1;i<valid.length;i++){
        const from=valid[i-1],to=valid[i];
        if(to-from<.3)continue;
        const a=pointAt(w,from),b=pointAt(w,to);
        const fragment={...w,id:fragments.length?w.id+'-j'+id().slice(-8):w.id,
          x1:rounded(a.x),z1:rounded(a.z),x2:rounded(b.x),z2:rounded(b.z)};
        fragments.push(fragment);
        for(const op of opens){
          if(op.offset>=from-1e-5&&op.offset<=to+1e-5){
            op.wallId=fragment.id;op.offset=rounded(op.offset-from);
          }
        }
      }
      return fragments.length?fragments:[w];
    }
    const existing=walls.flatMap(w=>split(w,cuts.get(w.id)));
    const added=split(wall,freshCuts);
    return {items:[...existing,...added,...others],selectedId:added[0].id};
  }
  function propagateWallNodes(items,oldWall,changed){
    if(!oldWall||oldWall.kind!=='wall')return;
    for(const edge of ['1','2']){
      const x='x'+edge,z='z'+edge;
      if(!(x in changed)&&!(z in changed))continue;
      const old={x:oldWall[x],z:oldWall[z]};
      const next={x:changed[x]===undefined?old.x:changed[x],z:changed[z]===undefined?old.z:changed[z]};
      if(Math.hypot(next.x-old.x,next.z-old.z)<.0005)continue;
      for(const other of items){
        if(other.id===oldWall.id||other.kind!=='wall')continue;
        for(const e of ['1','2']){
          if(Math.hypot(other['x'+e]-old.x,other['z'+e]-old.z)<.025){
            other['x'+e]=next.x;other['z'+e]=next.z;
          }
        }
      }
    }
  }

  return {STORAGE_KEY, SCHEMA_VERSION, connectWall, propagateWallNodes, createRepository, normalizeScene, normalizeItem, normalizeCalibration,
    blankProject, sampleVolume, createWall, createOpening, createCabinetRun, canPlaceOpening,
    validateScene, length, rounded, copy, DEFAULT_CALIBRATION};
});
