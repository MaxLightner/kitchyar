const test=require('node:test');
const assert=require('node:assert/strict');
let G;

async function kitchen(){
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:4,z:0}).items;
 return G.placeCabinet(items,{x:0,z:0},{x:4,z:0}).items;
}

function applianceBay(items,e){
 const cabinet=items.find(c=>c.id===e.hostId),length=G.lengthOf(cabinet);
 const centre=(e.offsetT??.5)*length;
 const fronts=items.filter(f=>f.kind==='front'&&f.hostId===cabinet.id);
 const member=fronts.find(f=>f.startT*length<=centre+.00001&&f.endT*length>=centre-.00001);
 assert.ok(member,'the appliance must have a facade bay');
 const bay=fronts.filter(f=>f.bay===member.bay);
 return {centre,bay,
  start:Math.min(...bay.map(f=>f.startT))*length,
  end:Math.max(...bay.map(f=>f.endT))*length,
  length};
}

function assertCentred(items,e,requireMiddleSeam=false){
 const b=applianceBay(items,e);
 assert.ok(Math.abs((b.start+b.end)/2-b.centre)<.005,
  e.subtype+' facade bay drifted from equipment centre');
 if(requireMiddleSeam){
  assert.ok(b.bay.some(f=>Math.abs(f.startT*b.length-b.centre)<.005||
   Math.abs(f.endT*b.length-b.centre)<.005),
   'sink door split must pass through sink centre');
  assert.ok(b.bay.every(f=>(f.endT-f.startT)*b.length<=.62001&&
   (f.endT-f.startT)*b.length>=.29999),'door leaf widths must stay valid');
 }
}

test('120 cm sink doors remain centred near both ends after narrow remainders are absorbed',async()=>{
 for(const x of [.75,.95,3.25]){
  let result=await kitchen();
  result=G.placeEquipment(result,{x,z:.4},'sink');
  result=G.editEquipment(result.items,result.selectedId,{sinkSize:120});
  const planned=G.planSmartKitchen(result.items).items;
  assertCentred(planned,planned.find(e=>e.kind==='equipment'&&e.subtype==='sink'),true);
 }
});

test('hob drawer bay stays centred near corners and beside a 120 cm sink',async()=>{
 for(const x of [.75,3.25]){
  let items=await kitchen();
  items=G.placeEquipment(items,{x,z:.4},'stove').items;
  const planned=G.planSmartKitchen(items).items;
  assertCentred(planned,planned.find(e=>e.kind==='equipment'&&e.subtype==='stove'));
 }
 let items=await kitchen();
 let r=G.placeEquipment(items,{x:.95,z:.4},'sink');
 r=G.editEquipment(r.items,r.selectedId,{sinkSize:120});
 r=G.placeEquipment(r.items,{x:2.5,z:.4},'stove');
 const planned=G.planSmartKitchen(r.items).items;
 assertCentred(planned,planned.find(e=>e.kind==='equipment'&&e.subtype==='sink'),true);
 assertCentred(planned,planned.find(e=>e.kind==='equipment'&&e.subtype==='stove'));
});
