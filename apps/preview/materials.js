/* Separate full-resolution albedo assets per surface — never a packed atlas. */
export const MATERIALS=Object.freeze({
 body:[
  {id:'deep-green',label:'سبز تیره',color:0x275c50},{id:'warm-grey',label:'طوسی گرم',color:0xaaa99f},
  {id:'ivory-matte',label:'عاجی مات',color:0xe7dfd3},
  {id:'oak',label:'بلوط روشن',color:0xffffff,file:'assets/materials/cabinet-oak.webp',wood:true},
  {id:'walnut',label:'گردویی',color:0xffffff,file:'assets/materials/cabinet-walnut.webp',wood:true},
  {id:'graphite-matte',label:'گرافیت مات',color:0x444c51},
  {id:'sage-matte',label:'سبز سیج مات',color:0x99aa9b}
 ],
 front:[
  {id:'deep-green',label:'سبز تیره',color:0x275c50},{id:'warm-grey',label:'طوسی گرم',color:0xaaa99f},
  {id:'ivory-matte',label:'عاجی مات',color:0xe7dfd3},
  {id:'oak',label:'بلوط روشن',color:0xffffff,file:'assets/materials/cabinet-oak.webp',wood:true},
  {id:'walnut',label:'گردویی',color:0xffffff,file:'assets/materials/cabinet-walnut.webp',wood:true},
  {id:'graphite-matte',label:'گرافیت مات',color:0x444c51},
  {id:'sage-matte',label:'سبز سیج مات',color:0x99aa9b}
 ],
 counter:[
  {id:'black-stone',label:'سنگ مشکی',color:0x171b1d},{id:'oak-counter',label:'صفحه چوبی',color:0xffffff,file:'assets/materials/cabinet-oak.webp',wood:true},
  {id:'quartz-white',label:'کوارتز سفید',color:0xffffff,file:'assets/materials/counter-quartz-white.webp'},
  {id:'marble-grey',label:'مرمر طوسی',color:0xffffff,file:'assets/materials/counter-marble-grey.webp'}
 ],
 backsplash:[
  {id:'black-stone',label:'سنگ مشکی',color:0x171b1d},{id:'light-stone',label:'سنگ روشن',color:0xe8e4da},
  {id:'tile-zellige',label:'زلج کرم',color:0xffffff,file:'assets/materials/tile-zellige.webp'},
  {id:'tile-sage',label:'کاشی سبز سیج',color:0xffffff,file:'assets/materials/tile-sage.webp'},
  {id:'tile-stone',label:'سنگ روشن',color:0xffffff,file:'assets/materials/tile-stone.webp'}
 ]
});
export const DEFAULT_MATERIALS=Object.freeze({body:'ivory-matte',front:'ivory-matte',counter:'quartz-white',backsplash:'tile-zellige'});
// A single, semantic catalog drives the gallery, the facade generator and the
// material palette. Photographs are references; the rules are what is applied.
export const KITCHEN_STYLES=Object.freeze([{"id": "reference-cream", "label": "کرم و چوب تا سقف", "image": "assets/styles/reference-cream.webp", "config": "assets/styles/reference-cream.json", "description": "کرم و چوب تا سقف · متناسب با آشپزخانه شما", "layout": {"base": "smart", "upper": "doors", "panel": "flat", "handle": "hidden", "finish": "cream"}, "materials": {"baseFront": "ivory-matte", "upperFront": "ivory-matte", "baseBody": "ivory-matte", "upperBody": "ivory-matte", "body": "ivory-matte", "front": "ivory-matte", "counter": "quartz-white", "backsplash": "tile-stone"}}, {"id": "reference-classic", "label": "کلاسیک سفید و طلایی", "image": "assets/styles/reference-classic.webp", "config": "assets/styles/reference-classic.json", "description": "کلاسیک سفید و طلایی · متناسب با آشپزخانه شما", "layout": {"base": "smart", "upper": "doors", "panel": "raised", "handle": "knob", "finish": "cream"}, "materials": {"baseFront": "ivory-matte", "upperFront": "ivory-matte", "baseBody": "ivory-matte", "upperBody": "ivory-matte", "body": "ivory-matte", "front": "ivory-matte", "counter": "quartz-white", "backsplash": "tile-stone"}}, {"id": "reference-green", "label": "سبز قاب‌دار", "image": "assets/styles/reference-green.webp", "config": "assets/styles/reference-green.json", "description": "سبز قاب‌دار · متناسب با آشپزخانه شما", "layout": {"base": "smart", "upper": "doors", "panel": "frame", "handle": "knob", "finish": "cream"}, "materials": {"baseFront": "deep-green", "upperFront": "deep-green", "baseBody": "deep-green", "upperBody": "deep-green", "body": "deep-green", "front": "deep-green", "counter": "quartz-white", "backsplash": "tile-stone"}}, {"id": "reference-white", "label": "سفید، شیشه و هود چوبی", "image": "assets/styles/reference-white.webp", "config": "assets/styles/reference-white.json", "description": "سفید، شیشه و هود چوبی · متناسب با آشپزخانه شما", "layout": {"base": "smart", "upper": "doors", "panel": "frame", "handle": "knob", "finish": "cream"}, "materials": {"baseFront": "ivory-matte", "upperFront": "ivory-matte", "baseBody": "ivory-matte", "upperBody": "ivory-matte", "body": "ivory-matte", "front": "ivory-matte", "counter": "quartz-white", "backsplash": "tile-stone"}}, {"id": "reference-grey", "label": "طوسی و چوب دوطبقه", "image": "assets/styles/reference-grey.webp", "config": "assets/styles/reference-grey.json", "description": "طوسی و چوب دوطبقه · متناسب با آشپزخانه شما", "layout": {"base": "smart", "upper": "doors", "panel": "flat", "handle": "hidden", "finish": "cream"}, "materials": {"baseFront": "warm-grey", "upperFront": "warm-grey", "baseBody": "warm-grey", "upperBody": "warm-grey", "body": "warm-grey", "front": "warm-grey", "counter": "quartz-white", "backsplash": "tile-stone"}}].concat([
 {id:'modern-oak',label:'مدرن چوب روشن',image:'assets/styles/modern-oak.webp',
  config:'assets/styles/modern-oak.json',
  description:'سه کشوی پهن با درب صاف بلوطی، صفحه سفید و دستگیره مخفی',
  layout:{base:'smart',upper:'doors',panel:'flat',handle:'hidden',finish:'wood'},
  materials:{body:'ivory-matte',front:'oak',baseFront:'oak',upperFront:'oak',baseBody:'ivory-matte',upperBody:'ivory-matte',counter:'quartz-white',backsplash:'tile-zellige'}},
 {id:'soft-cream',label:'کلاسیک کرم',image:'assets/styles/soft-cream.webp',
  config:'assets/styles/soft-cream.json',
  description:'درب قاب‌دار کرم و سه کشو با دستگیره میله‌ای برنجی',
  layout:{base:'mixedLower',upper:'doors',panel:'frame',handle:'bar',finish:'cream',frameMaterial:'ivory-matte'},
  materials:{body:'ivory-matte',front:'ivory-matte',baseFront:'ivory-matte',upperFront:'ivory-matte',baseBody:'ivory-matte',upperBody:'ivory-matte',counter:'quartz-white',backsplash:'tile-stone'}},
 {id:'graphite',label:'مینیمال گرافیتی',image:'assets/styles/graphite.webp',
  config:'assets/styles/graphite.json',
  description:'دو کشوی عریض گرافیتی و دستگیره میله‌ای مشکی',
  layout:{base:'drawers3',upper:'doors',panel:'flat',handle:'hidden',finish:'graphite'},
  materials:{body:'graphite-matte',front:'graphite-matte',baseFront:'graphite-matte',upperFront:'graphite-matte',baseBody:'graphite-matte',upperBody:'graphite-matte',counter:'marble-grey',backsplash:'tile-stone'}},
 {id:'walnut-sage',label:'گردویی و سیج',image:'assets/styles/walnut-sage.webp',
  config:'assets/styles/walnut-sage.json',
  description:'سه کشوی گردویی با دستگیره برنجی و کاشی سبز سیج',
  layout:{base:'graduated',upper:'doors',panel:'flat',handle:'bar',finish:'wood'},
  materials:{body:'walnut',front:'walnut',baseFront:'walnut',upperFront:'walnut',baseBody:'walnut',upperBody:'walnut',counter:'quartz-white',backsplash:'tile-sage'}}
]));
export const resolveFinish=(palette,kind,part='front')=>{
 const isUpper=kind==='upper'||kind==='over-fridge'||kind==='bridge';
 const key=(isUpper?'upper':'base')+(part==='body'?'Body':'Front');
 return palette?.[key]||palette?.[part]||DEFAULT_MATERIALS[part];
};
export const materialFor=(category,id)=>MATERIALS[category]?.find(entry=>entry.id===id)||
 MATERIALS[category]?.find(entry=>entry.id===DEFAULT_MATERIALS[category]);
export const assetUrl=file=>{
 const url=new URL(file,import.meta.url);url.searchParams.set('v',file.startsWith('assets/styles/')?'gallery2':'facaderules29');return url.href;
};
