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
export const KITCHEN_STYLES=Object.freeze([
 {id:'modern-oak',label:'مدرن چوب روشن',image:'assets/styles/modern-oak.webp',materials:{body:'ivory-matte',front:'oak',counter:'quartz-white',backsplash:'tile-zellige'}},
 {id:'soft-cream',label:'کلاسیک کرم',image:'assets/styles/soft-cream.webp',materials:{body:'ivory-matte',front:'ivory-matte',counter:'quartz-white',backsplash:'tile-stone'}},
 {id:'graphite',label:'مینیمال گرافیتی',image:'assets/styles/graphite.webp',materials:{body:'graphite-matte',front:'graphite-matte',counter:'marble-grey',backsplash:'tile-stone'}},
 {id:'walnut-sage',label:'گردویی و سیج',image:'assets/styles/walnut-sage.webp',materials:{body:'walnut',front:'walnut',counter:'quartz-white',backsplash:'tile-sage'}}
]);
export const materialFor=(category,id)=>MATERIALS[category]?.find(entry=>entry.id===id)||
 MATERIALS[category]?.find(entry=>entry.id===DEFAULT_MATERIALS[category]);
export const assetUrl=file=>new URL(file,import.meta.url).href;
