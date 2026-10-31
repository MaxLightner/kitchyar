const test=require('node:test');const assert=require('node:assert/strict');
const front=(code,widthMm,heightMm,materialId='oak',grain='عمودی',wood=true)=>({
 code,widthMm,heightMm,materialId,material:materialId,grain,wood,quantity:1,
 type:'درب',cabinet:'C01',style:'صاف'});

test('MDF layout counts only placed front sheets, grouped by material',async()=>{
 const {nestFronts}=await import('../apps/preview/sheet-nesting.js');
 const result=nestFronts([
  front('D001',700,2000),front('D002',700,2000),
  front('D003',700,2000,'graphite','عمودی',false)
 ]);
 assert.equal(result.totalSheets,2);
 assert.equal(result.materials.length,2);
 assert.equal(result.placedPieces,3);
 assert.equal(result.unplaced.length,0);
 assert.deepEqual(result.sheets.map(s=>s.materialId),['oak','graphite']);
});

test('grain orientation is aligned with long sheet axis for wood doors and drawers',async()=>{
 const {nestFronts}=await import('../apps/preview/sheet-nesting.js');
 const result=nestFronts([front('D001',690,2200),front('R001',740,310,'oak','افقی')]);
 const pieces=result.sheets.flatMap(s=>s.placements);
 assert.equal(pieces.find(p=>p.code==='D001').rotated,true);
 assert.equal(pieces.find(p=>p.code==='D001').cutWidthMm,2200);
 assert.equal(pieces.find(p=>p.code==='D001').cutHeightMm,690);
 assert.equal(pieces.find(p=>p.code==='R001').rotated,false);
});

test('all rectangles stay inside margins and never overlap including kerf',async()=>{
 const {nestFronts,DEFAULT_SHEET}=await import('../apps/preview/sheet-nesting.js');
 const faces=Array.from({length:37},(_,i)=>front('D'+String(i).padStart(3,'0'),
  380+(i%5)*95,310+(i%7)*110,i%3?'oak':'graphite','عمودی',i%3!==0));
 const result=nestFronts(faces);
 assert.equal(result.unplaced.length,0);
 const {marginMm,kerfMm,widthMm,heightMm}=DEFAULT_SHEET;
 for(const sheet of result.sheets){
  for(const p of sheet.placements){
   assert.ok(p.xMm>=marginMm&&p.yMm>=marginMm);
   assert.ok(p.xMm+p.cutWidthMm+kerfMm<=widthMm-marginMm);
   assert.ok(p.yMm+p.cutHeightMm+kerfMm<=heightMm-marginMm);
   for(const q of sheet.placements)if(q!==p)
    assert.ok(p.xMm+p.cutWidthMm+kerfMm<=q.xMm||
     q.xMm+q.cutWidthMm+kerfMm<=p.xMm||
     p.yMm+p.cutHeightMm+kerfMm<=q.yMm||
     q.yMm+q.cutHeightMm+kerfMm<=p.yMm, p.code+' overlaps '+q.code);
  }
 }
});

test('oversize grain-constrained panels are flagged, never omitted from estimate silently',async()=>{
 const {nestFronts,validateSheetOptions}=await import('../apps/preview/sheet-nesting.js');
 const result=nestFronts([front('R003',700,2400,'oak','افقی')]);
 assert.equal(result.totalSheets,0);
 assert.equal(result.unplaced[0].code,'R003');
 assert.throws(()=>validateSheetOptions({kerfMm:-1}),RangeError);
 assert.throws(()=>validateSheetOptions({widthMm:0}),RangeError);
});

test('nesting is deterministic and does not mutate input',async()=>{
 const {nestFronts}=await import('../apps/preview/sheet-nesting.js');
 const faces=[front('D02',520,600),front('D01',610,800)];
 const snapshot=JSON.stringify(faces);
 assert.deepEqual(nestFronts(faces),nestFronts(faces));
 assert.equal(JSON.stringify(faces),snapshot);
});
