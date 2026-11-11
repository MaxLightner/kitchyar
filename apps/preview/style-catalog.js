import {FRONT_PRESETS} from './geometry.js?v=gallery2';
import {MATERIALS} from './materials.js?v=gallery2';

export function validateStylePreset(style,preset){
 const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
 const fail=()=>{throw Error('تنظیمات این تصویر کامل یا سازگار نیست؛ تصویر دیگری انتخاب کن یا دوباره تلاش کن.');};
 if(!object(preset)||preset.version!==1||preset.id!==style.id||!object(preset.zones)||!object(preset.front)||!object(preset.materials))fail();
 const layouts=new Set([...Object.keys(FRONT_PRESETS),'sinkDoors','lift']);
 for(const layer of ['base','upper','tall']){
  const zone=preset.zones[layer];
  if(!object(zone)||!Array.isArray(zone.pattern)||!zone.pattern.length||!zone.pattern.every(p=>layouts.has(p)))fail();
  if(!Number.isFinite(zone.unitWidth)||zone.unitWidth<.15||zone.unitWidth>2)fail();
  for(const name of ['sinkLayout','stoveLayout'])if(zone[name]!==undefined&&!layouts.has(zone[name]))fail();
 }
 if(typeof preset.front.style!=='string'||typeof preset.front.handleStyle!=='string')fail();
 for(const [key,id] of Object.entries(preset.materials)){
  const family=key==='counter'?'counter':key==='backsplash'?'backsplash':key.toLowerCase().includes('body')?'body':'front';
  if(!MATERIALS[family]?.some(m=>m.id===id))fail();
 }
 if(!preset.materials.front&&!preset.materials.baseFront||!preset.materials.upperFront&&!preset.materials.front)fail();
 return preset;
}
