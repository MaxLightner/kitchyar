const test=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../apps/preview/geometry.js');
async function kitchen(){
 const G=await load();let items=[];
 for(const z of [0,4]){
  let r=G.placeWall(items,{x:0,z},{x:4,z});items=r.items;
  r=G.placeCabinet(items,{x:0,z,hostId:r.selectedId},{x:4,z});items=r.items;
  items=G.placeFrontLayout(items,r.selectedId,'smart').items;
 }
 return {G,items};
}

test('nominal equipment sizes agree on placement and model edits; hob drawers stay exact',async()=>{
 const {G,items}=await kitchen();
 const sink=G.placeEquipment(items,{x:2,z:4.3},'sink');
 assert.equal(sink.items.find(o=>o.id===sink.selectedId).sinkSize,90);
 for(const model of ['gas2','gas3','gas4','gas5','induction']){
  let r=G.placeEquipment(items,{x:2,z:.3},'stove',{model});
  let e=r.items.find(o=>o.id===r.selectedId);
  assert.equal(e.width,G.STOVE_WIDTHS[model]);
  r=G.planSmartKitchen(r.items,{cabinetIds:[e.hostId]});
  e=r.items.find(o=>o.id===e.id);
  const c=r.items.find(o=>o.id===e.hostId),len=G.lengthOf(c);
  const at=e.offsetT,fs=r.items.filter(o=>o.kind==='front'&&o.hostId===c.id);
  const member=fs.find(f=>f.startT<=at&&f.endT>=at);
  const bay=fs.filter(f=>f.bay===member.bay);
  assert.ok(bay.every(f=>f.subtype==='drawer'));
  assert.ok(bay.every(f=>Math.abs((f.endT-f.startT)*len-e.width)<1e-6));
  const edited=G.editEquipment(r.items,e.id,{model:'gas5'});
  assert.equal(edited.items.find(o=>o.id===e.id).width,.9);
 }
});

test('moving and aligning a hob touches only its row; scoped optimization preserves the other side',async()=>{
 let {G,items}=await kitchen();
 let r=G.placeEquipment(items,{x:1.5,z:.3},'stove');items=r.items;
 const stoveId=r.selectedId;
 r=G.placeEquipment(items,{x:1.2,z:4.3},'sink');items=r.items;
 const remoteHost=items.find(o=>o.id===r.selectedId).hostId;
 const remote=items.filter(o=>o.id===remoteHost||o.hostId===remoteHost);
 const moved=G.moveEquipment(items,stoveId,{x:2.5,z:.3});
 const ids=G.affectedCabinetIds(items,moved.items);
 assert.ok(!ids.includes(remoteHost));
 const aligned=G.alignFrontSeams(moved.items,{cabinetIds:ids});
 const planned=G.planSmartKitchen(aligned.items,{cabinetIds:ids});
 assert.deepEqual(planned.items.filter(o=>o.id===remoteHost||o.hostId===remoteHost),remote);
});

test('washer relocation is offered only in the requested row and respects position lock',async()=>{
 let {G,items}=await kitchen();
 const r=G.placeEquipment(items,{x:1.1,z:.3},'washer');items=r.items;
 const washer=items.find(o=>o.id===r.selectedId);
 const plan=G.planSmartKitchen(items,{cabinetIds:[washer.hostId]});
 assert.ok(plan.equipmentMoves.some(m=>m.id===washer.id),'washer participates in front-width optimization');
 assert.ok(plan.equipmentMoves.every(m=>Math.abs(m.delta)<=38));
 washer.positionLocked=true;
 const locked=G.planSmartKitchen(items,{cabinetIds:[washer.hostId]});
 assert.equal(locked.items.find(o=>o.id===washer.id).offsetT,washer.offsetT);
});
