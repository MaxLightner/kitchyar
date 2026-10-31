/* Separate full-resolution albedo assets per surface — never a packed atlas. */
export const MATERIALS=Object.freeze({
 body:[
  {id:'ivory-matte',label:'عاجی مات',color:0xe7dfd3},
  {id:'oak',label:'بلوط روشن',color:0xffffff,file:'assets/materials/cabinet-oak.webp',wood:true},
  {id:'walnut',label:'گردویی',color:0xffffff,file:'assets/materials/cabinet-walnut.webp',wood:true},
  {id:'graphite-matte',label:'گرافیت مات',color:0x444c51},
  {id:'sage-matte',label:'سبز سیج مات',color:0x99aa9b}
 ],
 front:[
  {id:'ivory-matte',label:'عاجی مات',color:0xe7dfd3},
  {id:'oak',label:'بلوط روشن',color:0xffffff,file:'assets/materials/cabinet-oak.webp',wood:true},
  {id:'walnut',label:'گردویی',color:0xffffff,file:'assets/materials/cabinet-walnut.webp',wood:true},
  {id:'graphite-matte',label:'گرافیت مات',color:0x444c51},
  {id:'sage-matte',label:'سبز سیج مات',color:0x99aa9b}
 ],
 counter:[
  {id:'quartz-white',label:'کوارتز سفید',color:0xffffff,file:'assets/materials/counter-quartz-white.webp'},
  {id:'marble-grey',label:'مرمر طوسی',color:0xffffff,file:'assets/materials/counter-marble-grey.webp'}
 ],
 backsplash:[
  {id:'tile-zellige',label:'زلج کرم',color:0xffffff,file:'assets/materials/tile-zellige.webp'},
  {id:'tile-sage',label:'کاشی سبز سیج',color:0xffffff,file:'assets/materials/tile-sage.webp'},
  {id:'tile-stone',label:'سنگ روشن',color:0xffffff,file:'assets/materials/tile-stone.webp'}
 ]
});
export const DEFAULT_MATERIALS=Object.freeze({body:'ivory-matte',front:'ivory-matte',counter:'quartz-white',backsplash:'tile-zellige'});
// A single, semantic catalog drives the gallery, the facade generator and the
// material palette. Photographs are references; the rules are what is applied.
export const KITCHEN_STYLES=Object.freeze([
 {id:'modern-oak',label:'مدرن چوب روشن',image:'assets/styles/modern-oak.webp',
  description:'درب‌های صاف، کشوهای هوشمند و دستگیره مخفی',
  layout:{base:'smart',upper:'doors',panel:'flat',handle:'hidden',finish:'wood'},
  materials:{body:'ivory-matte',front:'oak',baseFront:'oak',upperFront:'oak',baseBody:'ivory-matte',upperBody:'ivory-matte',counter:'quartz-white',backsplash:'tile-zellige'}},
 {id:'soft-cream',label:'کلاسیک کرم',image:'assets/styles/soft-cream.webp',
  description:'درب قاب‌دار، کشوی پایین، دستگیره میله‌ای',
  layout:{base:'mixedLower',upper:'doors',panel:'frame',handle:'bar',finish:'cream',frameMaterial:'ivory-matte'},
  materials:{body:'ivory-matte',front:'ivory-matte',baseFront:'ivory-matte',upperFront:'ivory-matte',baseBody:'ivory-matte',upperBody:'ivory-matte',counter:'quartz-white',backsplash:'tile-stone'}},
 {id:'graphite',label:'مینیمال گرافیتی',image:'assets/styles/graphite.webp',
  description:'سه کشوی زمینی، درب هوایی صاف و دستگیره مخفی',
  layout:{base:'drawers3',upper:'doors',panel:'flat',handle:'hidden',finish:'graphite'},
  materials:{body:'graphite-matte',front:'graphite-matte',baseFront:'graphite-matte',upperFront:'graphite-matte',baseBody:'graphite-matte',upperBody:'graphite-matte',counter:'marble-grey',backsplash:'tile-stone'}},
 {id:'walnut-sage',label:'گردویی و سیج',image:'assets/styles/walnut-sage.webp',
  description:'سه کشوی پلکانی، نمای گردویی و کاشی سبز',
  layout:{base:'graduated',upper:'doors',panel:'flat',handle:'bar',finish:'wood'},
  materials:{body:'walnut',front:'walnut',baseFront:'walnut',upperFront:'walnut',baseBody:'walnut',upperBody:'walnut',counter:'quartz-white',backsplash:'tile-sage'}}
]);
export const resolveFinish=(palette,kind,part='front')=>{
 const isUpper=kind==='upper'||kind==='over-fridge'||kind==='bridge';
 const key=(isUpper?'upper':'base')+(part==='body'?'Body':'Front');
 return palette?.[key]||palette?.[part]||DEFAULT_MATERIALS[part];
};
export const materialFor=(category,id)=>MATERIALS[category]?.find(entry=>entry.id===id)||
 MATERIALS[category]?.find(entry=>entry.id===DEFAULT_MATERIALS[category]);
export const assetUrl=file=>{
 const url=new URL(file,import.meta.url);url.searchParams.set('v','finishes28');return url.href;
};
