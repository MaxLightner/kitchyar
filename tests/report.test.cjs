const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'../apps/preview',name),'utf8');
let G,R,View,Book;
async function modules(){
 G||=await import('../apps/preview/geometry.js');
 R||=await import('../apps/preview/report-data.js');
 View||=await import('../apps/preview/report-view.js');
 Book||=await import('../apps/preview/report-xlsx.js');
}
async function sample(){
 await modules();let items=G.placeWall([],{x:0,z:0},{x:6,z:0}).items;
 items=G.placeCabinet(items,{x:.2,z:0},{x:1.4,z:0},{kind:'base'}).items;
 items=G.placeCabinet(items,{x:1.4,z:0},{x:2.5,z:0},{kind:'base'}).items;
 items=G.placeCabinet(items,{x:3.1,z:0},{x:4.1,z:0},{kind:'base'}).items;
 const cabinets=items.filter(x=>x.kind==='cabinet');
 for(const c of cabinets)items=G.placeFrontLayout(items,c.id,c.id===cabinets[2].id?'drawers3':'doors').items;
 items=G.placeEquipment(items,{x:.8,z:.3},'sink').items;
 return {id:'kitchen-001',name:'آشپزخانه تست & نمونه',revision:4,updatedAt:'2026-10-31T00:00:00Z',scene:{items}};
}
test('report derives fronts, independent runs and placed sink cutouts from current geometry',async()=>{
 const p=await sample(),copy=structuredClone(p),r=R.buildCutReport(p);
 assert.equal(r.totals.doors,4);
 assert.equal(r.totals.drawers,6);
 assert.equal(r.totals.fronts,10);
 assert.equal(r.countertop.length,2,'adjacent cabinets combine, interrupted runs stay separate');
 assert.equal(r.countertop[0].lengthMm,2300);
 assert.equal(r.countertop[1].lengthMm,1000);
 assert.equal(r.cutouts.length,1);
 assert.equal(r.cutouts[0].type,'سینک');
 assert.ok(r.cutouts[0].leftMm>0&&r.cutouts[0].leftMm<r.countertop[0].lengthMm);
 assert.ok(r.fronts.every(f=>f.widthMm>0&&f.heightMm>0&&f.quantity===1));
 assert.ok(r.fronts.some(f=>f.grain==='افقی'&&f.type==='کشو'));
 assert.deepEqual(p,copy,'reading report must not mutate saved design');
});
test('editing a facade immediately changes report dimensions, print and XLSX use identical data',async()=>{
 const p=await sample(),r1=R.buildCutReport(p),first=r1.fronts[0];
 const f=p.scene.items.find(x=>x.id===first.id);
 p.scene.items=G.editFront(p.scene.items,f.id,{gap:.01}).items;
 const r2=R.buildCutReport(p);
 assert.equal(r1.fronts[0].widthMm-r2.fronts[0].widthMm,7);
 const html=View.renderCutReport(r2);
 assert.match(html,/گزارش ابعاد و نقشه‌های شماتیک/);
 assert.match(html,/report-print/);
 assert.match(html,/report-xlsx/);
 assert.match(html,/report-fronts/);
 assert.match(html,/report-nesting/);
 assert.match(html,/report-recalculate/);
 assert.match(html,/report-sheet-svg/);
 assert.match(html,/D001/);
 assert.match(html,/آشپزخانه تست &amp; نمونه/);
 assert.doesNotMatch(html,/href="#report-fronts"/,'links must not hijack the SPA hash route');
});
test('export produces nine Office OpenXML sheets with numeric MDF and facade dimensions',async()=>{
 const report=R.buildCutReport(await sample()),zip=Book.xlsxBytes(report);
 assert.ok(zip.byteLength>5500);
 const data=new DataView(zip.buffer,zip.byteOffset,zip.byteLength);
 const decode=new TextDecoder(),entries=new Map();let p=0;
 while(p+30<zip.length&&data.getUint32(p,true)===0x04034b50){
  const len=data.getUint32(p+18,true),nameLength=data.getUint16(p+26,true),extra=data.getUint16(p+28,true);
  const name=decode.decode(zip.slice(p+30,p+30+nameLength));
  const start=p+30+nameLength+extra;
  entries.set(name,decode.decode(zip.slice(start,start+len)));
  p=start+len;
 }
 assert.equal(entries.size,14);
 assert.match(entries.get('[Content_Types].xml'),/spreadsheetml\.sheet\.main\+xml/);
 assert.match(entries.get('xl/workbook.xml'),/sheet name="درب و کشو"/);
 assert.match(entries.get('xl/workbook.xml'),/sheet name="برش تجهیزات"/);
 assert.match(entries.get('xl/workbook.xml'),/sheet name="ورق MDF"/);
 assert.match(entries.get('xl/workbook.xml'),/sheet name="برش MDF"/);
 assert.match(entries.get('xl/worksheets/sheet2.xml'),/<c r="D2"><v>\d+<\/v><\/c>/,'dimensions must be numeric');
 assert.match(entries.get('xl/worksheets/sheet2.xml'),/D001/);
 assert.match(entries.get('xl/worksheets/sheet4.xml'),/D001/);
 assert.match(entries.get('xl/worksheets/sheet4.xml'),/<c r="F2"><v>\d+<\/v><\/c>/,'cut positions must be numeric');
 assert.match(entries.get('xl/worksheets/sheet7.xml'),/سینک/);
 assert.equal(data.getUint32(p,true),0x02014b50,'central ZIP directory follows files');
 assert.equal(data.getUint32(zip.length-22,true),0x06054b50,'ZIP end record exists');
});
test('report is a fourth independent route and accessible in both project card and editor header',()=>{
 const app=read('app.js'),css=read('styles.css');
 assert.match(app,/function reportPage\(id\)/);
 assert.match(app,/hash\.startsWith\('#\/report\/'\)/);
 assert.match(app,/data-action="open-report" data-id=/);
 assert.match(app,/action==='report-print'/);
 assert.match(app,/action==='report-xlsx'/);
 assert.match(app,/action==='return-editor'/);
 assert.match(css,/@media print/);
 assert.match(css,/@page\{size:A4 landscape/);
 assert.match(css,/\.editor-root\.session-parked\{display:none!important\}/);
});
test('report for a fresh empty project still exports and clearly says no pieces',async()=>{
 await modules();
 const report=R.buildCutReport({id:'empty',name:'جدید',scene:{items:[]}});
 assert.equal(report.hasDrawings,false);
 assert.equal(report.totals.fronts,0);
 assert.equal(report.totals.slabs,0);
 const markup=View.renderCutReport(report);
 assert.match(markup,/هنوز درب یا کشویی ثبت نشده/);
 assert.match(markup,/هنوز کابینت زمینی/);
 assert.ok(Book.xlsxBytes(report).byteLength>3000);
});
