import {wardrobePanels,wardrobeRods,drawerTrayPanels} from './wardrobe-model.js?v=boxkeys1';
import {frontPose} from './geometry.js?v=gallery2';
const labels={'left-side':'پهلو چپ','right-side':'پهلو راست',top:'سقف',back:'پشت',bottom:'کف بخش',divider:'جداکنندهٔ عمودی',
 shelf:'طبقه','top-shelf':'طبقهٔ بالای آویز','drawer-cap':'طبقهٔ بالای کشو','desk-top':'صفحهٔ میز','desk-upper-shelf':'طبقهٔ بالای میز',
 'drawer-bottom':'کف کشو','drawer-side':'بغل کشو','drawer-back':'پشت کشو'};
const mm=n=>Math.round(n*1000);
export function wardrobeParts(items){
 const c=items.find(c=>c.wardrobe);if(!c)return [];
 const rows=[];
 const add=(name,material,a,b,t,bay='')=>rows.push({code:'W'+String(rows.length+1).padStart(3,'0'),name,material,lengthMm:mm(a),widthMm:mm(b),thicknessMm:mm(t),bay});
 const panel=p=>{const sides=[p.width,p.height,p.depth].sort((a,b)=>b-a);add(labels[p.part]||p.part,'MDF',sides[0],sides[1],sides[2],p.bay||'');};
 wardrobePanels(c).forEach(panel);
 for(const f of items.filter(f=>f.kind==='front'&&f.hostId===c.id)){
  const p=frontPose(f,c);add(f.wardrobeInternal?'نمای کشوی داخلی':'درب','MDF',p.height,p.width,p.thickness,f.wardrobeBay);
  if(f.mirror)add('آینهٔ روی در','آینه',p.height-.032,p.width-.032,.004,f.wardrobeBay);
  if(f.wardrobeInternal)drawerTrayPanels(p,c).map(p=>({...p,bay:f.wardrobeBay})).forEach(panel);
 }
 for(const r of wardrobeRods(c))add('میلهٔ آویز','فلز',r.length,r.radius*2,r.radius*2,r.bay);
 return rows;
}
