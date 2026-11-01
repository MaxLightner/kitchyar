const test=require('node:test');
const assert=require('node:assert/strict');

let G;
async function geometry(){G||=await import('../apps/preview/geometry.js?v=opt1');return G;}

async function run(length=4){
 const g=await geometry();
 let items=g.placeWall([],{x:0,z:0},{x:length,z:0}).items;
 const wall=items.find(o=>o.kind==='wall');
 items=g.placeCabinet(items,{x:0,z:0,hostId:wall.id},{x:length,z:0},{kind:'base'}).items;
 return {g,items,cabinet:items.find(o=>o.kind==='cabinet')};
}

function assertStandardLeafWidths(g,items,cabinet,{sinkBay=null}={}){
 const faces=items.filter(o=>o.kind==='front'&&o.hostId===cabinet.id);
 assert.ok(faces.length>0,'optimizer must create cabinet fronts');
 for(const face of faces){
  const width=(face.endT-face.startT)*g.lengthOf(cabinet);
  if(sinkBay!==null&&face.bay===sinkBay){
   assert.ok(width>=.45-1e-6&&width<=.62+1e-6,
    '120 cm sink pair may use the functional 62 cm leaf width');
  }else{
   assert.ok(width>=.45-1e-6&&width<=.55+1e-6,
    'ordinary door/drawer leaves must stay in the 45–55 cm target range');
  }
 }
 return faces;
}

test('shared partition solver chooses valid 45–55 cm leaves and reports impossible spans',async()=>{
 const g=await geometry();
 const exact=g.partitionDoorSpan(2.5);
 assert.equal(exact.feasible,true);
 assert.equal(exact.count,5);
 assert.ok(exact.widths.every(width=>Math.abs(width-.5)<1e-8));
 const impossible=g.partitionDoorSpan(1.25);
 assert.equal(impossible.feasible,false);
 assert.equal(impossible.reason,'outside-door-width-range');
});

test('120 cm sink is shifted only as needed and its two doors stay centred on its axis',async()=>{
 const {g,items,cabinet}=await run();
 let placed=g.placeEquipment(items,{x:.75,z:.4},'sink');
 placed=g.editEquipment(placed.items,placed.selectedId,{sinkSize:120});
 const original=placed.items.find(o=>o.id===placed.selectedId).offsetT;
 const planned=g.planSmartKitchen(placed.items).items;
 const sink=planned.find(o=>o.id===placed.selectedId);
 const centre=sink.offsetT*g.lengthOf(cabinet);
 assert.ok(Math.abs(sink.offsetT-original)>.001,'the optimizer should resolve the short end remainder');
 const faces=planned.filter(o=>o.kind==='front'&&o.hostId===cabinet.id);
 const sinkDoor=faces.filter(f=>Math.abs((f.endT-f.startT)*4-.62)<.002);
 assert.equal(sinkDoor.length,2);
 assert.ok(sinkDoor.some(f=>Math.abs(f.endT*4-centre)<.005));
 assert.ok(sinkDoor.some(f=>Math.abs(f.startT*4-centre)<.005));
 assertStandardLeafWidths(g,planned,cabinet,{sinkBay:sinkDoor[0].bay});
});

test('dishwasher placement is part of the shared solve and leaves no narrow adjacent fronts',async()=>{
 const {g,items,cabinet}=await run();
 const placed=g.placeEquipment(items,{x:2,z:.4},'dishwasher');
 const before=placed.items.find(o=>o.id===placed.selectedId).offsetT;
 const planned=g.planSmartKitchen(placed.items).items;
 const dishwasher=planned.find(o=>o.id===placed.selectedId);
 assert.ok(Math.abs(dishwasher.offsetT-before)>.001,'dishwasher may move to make both adjacent facade spans feasible');
 const centre=dishwasher.offsetT*4;
 const faces=assertStandardLeafWidths(g,planned,cabinet);
 assert.ok(!faces.some(f=>f.startT*4<=centre&&f.endT*4>=centre),
  'the appliance face must remain unobstructed');
});

test('stove drawer fronts are split into balanced columns and remain centred under the hob',async()=>{
 const {g,items,cabinet}=await run();
 const placed=g.placeEquipment(items,{x:2,z:.4},'stove');
 const planned=g.planSmartKitchen(placed.items).items;
 const stove=planned.find(o=>o.id===placed.selectedId),centre=stove.offsetT*4;
 const drawers=planned.filter(o=>o.kind==='front'&&o.hostId===cabinet.id&&o.subtype==='drawer'&&
  o.startT*4>=centre-.51&&o.endT*4<=centre+.51);
 assert.equal(drawers.length,6,'three rows should be divided into two balanced columns');
 assert.ok(drawers.some(f=>Math.abs(f.endT*4-centre)<.005));
 assert.ok(drawers.some(f=>Math.abs(f.startT*4-centre)<.005));
 assertStandardLeafWidths(g,planned,cabinet);
 const hood=planned.find(o=>o.kind==='equipment'&&o.subtype==='hood');
 assert.equal(hood.linkedStoveId,stove.id);
 assert.ok(Math.abs(hood.x-stove.x)<1e-6&&Math.abs(hood.z-stove.z)<1e-6);
});

test('an impossible isolated run is reported instead of creating undersized doors',async()=>{
 const {g,items}=await run(1.25);
 assert.throws(()=>g.planSmartKitchen(items),/۴۵ تا ۵۵|تقسیم معتبر/);
 assert.equal(items.filter(o=>o.kind==='front').length,0,'failed solve must not mutate the source scene');
});

test('a locked fixture is not silently moved to satisfy facade widths',async()=>{
 const {g,items}=await run();
 const placed=g.placeEquipment(items,{x:2,z:.4},'dishwasher');
 const appliance=placed.items.find(o=>o.id===placed.selectedId);
 appliance.positionLocked=true;
 const original=appliance.offsetT;
 assert.throws(()=>g.planSmartKitchen(placed.items),/هیچ تقسیم معتبری/);
 assert.equal(placed.items.find(o=>o.id===placed.selectedId).offsetT,original);
});
