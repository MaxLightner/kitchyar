/* Kitchyar project domain; no UI, rendering or Android dependencies. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.KitchyarCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const STORAGE_KEY = 'kitchyar.projects.v1';
  const SCHEMA_VERSION = 1;
  const MAX_ITEMS = 150;
  const MAX_BYTES = 2_000_000;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const cleanName = (value) => String(value || '').trim().slice(0, 65) || 'پروژه بدون نام';
  const copy = (v) => JSON.parse(JSON.stringify(v));
  const id = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const now = () => new Date().toISOString();
  const finite = (v, fallback) => Number.isFinite(Number(v)) ? Number(v) : fallback;

  function normalizeItem(raw) {
    if (!raw || raw.kind !== 'volume' || typeof raw.id !== 'string') return null;
    return {
      id: raw.id.slice(0, 80), kind: 'volume',
      label: String(raw.label || 'آبجکت نمونه').slice(0, 60),
      x: clamp(finite(raw.x, 0), -100, 100), z: clamp(finite(raw.z, 0), -100, 100),
      width: clamp(finite(raw.width, 0.8), 0.1, 10),
      depth: clamp(finite(raw.depth, 0.6), 0.1, 10),
      height: clamp(finite(raw.height, 0.85), 0.1, 10),
      color: /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : '#b4bdac',
    };
  }
  function normalizeScene(raw) {
    return {items: Array.isArray(raw?.items) ? raw.items.slice(0, MAX_ITEMS).map(normalizeItem).filter(Boolean) : []};
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
      p.scene.items = p.scene.items.map((item) => ({...item, id: id()}));
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
      p.scene.items=p.scene.items.map(item=>({...item,id:id()}));
      persist([...load(),p]);return copy(p);
    }
    return {list, get, create, update, duplicate, remove, exportProject, importProject};
  }
  return {STORAGE_KEY, SCHEMA_VERSION, createRepository, normalizeScene, blankProject, sampleVolume, copy};
});
