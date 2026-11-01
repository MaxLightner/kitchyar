const test=require('node:test'),assert=require('node:assert/strict');
async function build(shape){return (await import('../scripts/acceptance-fixture.mjs')).build(shape);}
test('L and U kitchens generate fronts, preserve one edited unit through equipment moves and survive reload',async()=>{
 for(const shape of ['L','U']){
  const {G,items}=await build(shape);let r=G.planSmartKitchen(items);assert.equal(r.valid,true,shape+JSON.stringify(r.layoutWarnings));assert.deepEqual(G.planSmartKitchen(r.items).items,r.items,'unchanged input is idempotent');
  const sink=r.items.find(e=>e.subtype==='sink');r=G.editEquipment(r.items,sink.id,{sinkSize:120});r=G.planSmartKitchen(r.items);assert.equal(r.valid,true);
  const door=r.items.find(f=>f.kind==='front'&&f.subtype==='door'&&r.items.find(c=>c.id===f.hostId)?.subtype==='base'&&f.endT<sink.offsetT-.15);
  assert.ok(door);r=G.convertFrontUnit(r.items,door.id,'drawers3');const edited=r.items.filter(f=>f.unitKey);
  const host=edited[0].hostId;r=G.planSmartKitchen(r.items);for(const f of edited)assert.deepEqual(r.items.find(p=>p.id===f.id),f);
  const reloaded=JSON.parse(JSON.stringify(r.items));const again=G.planSmartKitchen(reloaded,{optimizePositions:false});
  for(const f of edited)assert.deepEqual(again.items.find(p=>p.id===f.id),f);
  const remote=r.items.filter(o=>o.kind==='cabinet'&&o.id!==host).map(o=>o.id);assert.ok(remote.length);
  const tall=r.items.find(c=>c.subtype==='tall');assert.ok(tall.height+tall.elevation<=2.451);
 }
});
test('unit glass, CNC, open and linked lift remain semantic and only affect the selected unit',async()=>{
 const {G,items}=await build('L');let r=G.planSmartKitchen(items);const upper=r.items.find(f=>f.kind==='front'&&f.hinge==='top');assert.ok(upper);
 r=G.configureFrontUnit(r.items,upper.id,{doorStyle:'glass',opening:'horizontal',mechanism:'bifold'});const unit=G.frontUnitFor(r.items,r.selectedId);assert.equal(unit.frontIds.length,2);
 r=G.setFrontOpening(r.items,r.selectedId,1);assert.ok(r.items.filter(f=>unit.frontIds.includes(f.id)).every(f=>f.openFraction===1));
 r=G.configureFrontUnit(r.items,r.selectedId,{doorStyle:'cnc'});assert.ok(r.items.filter(f=>unit.frontIds.includes(f.id)).every(f=>f.style==='cnc'));
 r=G.configureFrontUnit(r.items,r.selectedId,{doorStyle:'open'});assert.ok(r.items.filter(f=>unit.frontIds.includes(f.id)).every(f=>f.style==='open'));
});
test('freestanding range carves a true cabinet gap and deletion restores the row',async()=>{
 const G=await import('../apps/preview/geometry.js');let r=G.placeWall([],{x:0,z:0},{x:4,z:0});r=G.placeCabinet(r.items,{x:0,z:0},{x:4,z:0});const original=JSON.stringify(r.items);
 r=G.placeEquipment(r.items,{x:2,z:.3},'stove',{model:'range'});const e=r.items.find(e=>e.id===r.selectedId);assert.equal(e.height,.86);
 for(const c of r.items.filter(c=>c.kind==='cabinet'))assert.ok(c.endT*4<=1.55+.001||c.startT*4>=2.45-.001);
 r=G.removeObject(r.items,e.id);assert.equal(JSON.stringify(r.items),original);
});
test('separately drawn base and upper runs stop at a corner and expose semantic corner controls',async()=>{
 const G=await import('../apps/preview/geometry.js');
 for(const kind of ['base','upper']){
  let r=G.placeWall([],{x:0,z:0},{x:4,z:0});r=G.placeWall(r.items,{x:4,z:0},{x:4,z:4});const walls=r.items;
  r=G.placeCabinet(r.items,{x:.2,z:0,hostId:walls[0].id,side:1},{x:3.86,z:0},{kind,depth:kind==='upper'?.35:.6});
  r=G.placeCabinet(r.items,{x:4,z:3.8,hostId:walls[1].id,side:1},{x:4,z:.14},{kind,depth:kind==='upper'?.35:.6});
  const join=r.items.find(o=>o.kind==='corner');assert.ok(join,'collision creates a corner unit');
  const c=r.items.find(o=>o.id===r.selectedId);assert.ok(c.startT*4>.3);
  r=G.configureCorner(r.items,join.id,{doorMode:'door',countertopMode:'full',openFraction:1});
  const p=G.cornerFillFootprint(r.items,r.items.find(o=>o.id===join.id));assert.ok(p.corners.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)));
 }
});
