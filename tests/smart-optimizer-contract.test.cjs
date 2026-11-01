const test=require('node:test');
const assert=require('node:assert/strict');
let G;
const load=async()=>G||=await import('../apps/preview/geometry.js');
async function kitchen(length=4){
 const g=await load();
 const wall=g.placeWall([],{x:0,z:0},{x:length,z:0}).items;
 return g.placeCabinet(wall,{x:0,z:0},{x:length,z:0}).items;
}
function sinkBay(items,sink){
 const cabinet=items.find(o=>o.id===sink.hostId),length=G.lengthOf(cabinet),
  at=(sink.offsetT??.5)*length;
 const fronts=items.filter(f=>f.kind==='front'&&f.hostId===cabinet.id);
 const member=fronts.find(f=>f.startT*length<=at+.00001&&f.endT*length>=at-.00001);
 assert.ok(member,'sink must retain a facade bay');
 return {at,length,doors:fronts.filter(f=>f.bay===member.bay&&f.subtype==='door')};
}
test('automatic bay counts favour 45–55 cm where feasible, without hard-coded modules',async()=>{
 const m=await import('../apps/preview/optimization-rules.js');
 assert.equal(m.chooseFacadeBayCount(2),4);
 assert.equal(m.chooseFacadeBayCount(2.5),5);
 assert.equal(m.chooseFacadeBayCount(1.25),3,'incompatible lengths choose the closest physical solution and flag deviation');
});
test('smart proposal moves a 120cm sink only with explicit approval and produces an outward-opening pair',async()=>{
 let items=await kitchen();
 let r=G.placeEquipment(items,{x:.75,z:.4},'sink');
 r=G.editEquipment(r.items,r.selectedId,{sinkSize:120});items=r.items;
 const initial=JSON.stringify(items),before=items.find(e=>e.kind==='equipment'&&e.subtype==='sink');
 const plan=G.planSmartKitchen(items);
 const after=plan.items.find(e=>e.id===before.id);
 assert.equal(JSON.stringify(items),initial,'proposing does not mutate the original model');
 assert.ok(plan.equipmentMoves.length>=1,'the user must see any recommended relocation');
 assert.ok(Math.abs(after.offsetT-before.offsetT)*4>.05);
 const {at,length,doors}=sinkBay(plan.items,after);
 assert.equal(doors.length,2,'sink has exactly two outward-opening door leaves');
 assert.ok(doors.every(f=>(f.endT-f.startT)*length>=.45));
 assert.ok(doors.some(f=>Math.abs(f.startT*length-at)<.005)&&
  doors.some(f=>Math.abs(f.endT*length-at)<.005),'the two leaves meet at the sink centre');
});
test('a position-locked sink never moves; an unresolved two-leaf conflict is reported',async()=>{
 let items=await kitchen();
 let r=G.placeEquipment(items,{x:.75,z:.4},'sink');
 r=G.editEquipment(r.items,r.selectedId,{sinkSize:120});
 items=r.items;
 const sink=items.find(e=>e.kind==='equipment'&&e.subtype==='sink');
 sink.positionLocked=true;
 const planned=G.planSmartKitchen(items);
 assert.equal(planned.items.find(e=>e.id===sink.id).offsetT,sink.offsetT);
 assert.equal(planned.equipmentMoves.length,0);
 assert.ok(planned.layoutWarnings.some(w=>w.equipmentId===sink.id),
  'never silently accept four narrow sink doors as if they were the requested two');
});
