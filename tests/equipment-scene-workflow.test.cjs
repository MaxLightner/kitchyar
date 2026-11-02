const test=require('node:test'),assert=require('node:assert/strict');
test('adding devices after edited fronts clears each device bay and leaves the opposite row intact',async()=>{
 const G=await import('../apps/preview/geometry.js');let r=G.placeWall([],{x:0,z:0},{x:6,z:0});const wall=r.selectedId;
 r=G.placeCabinet(r.items,{x:0,z:0},{x:6,z:0});const host=r.selectedId;r=G.placeFrontLayout(r.items,host,'smart');
 const front=r.items.find(o=>o.kind==='front');r=G.convertFrontUnit(r.items,front.id,'drawers3');
 r=G.placeWall(r.items,{x:0,z:4},{x:6,z:4});r=G.placeCabinet(r.items,{x:0,z:4},{x:6,z:4});const remote=r.selectedId;r=G.placeFrontLayout(r.items,remote,'doors');
 const before=r.items.filter(o=>o.id===remote||o.hostId===remote);
 for(const [type,x] of [['washer',2],['dishwasher',3],['fridge',4.8]])r=G.placeEquipment(r.items,{x,z:.4},type);
 const ids=G.affectedCabinetIds([],r.items).filter(id=>r.items.find(c=>c.id===id)?.hostId===wall);
 r=G.planSmartKitchen(r.items,{cabinetIds:ids,optimizePositions:false});
 assert.deepEqual(r.items.filter(o=>o.id===remote||o.hostId===remote),before);
 for(const e of r.items.filter(e=>['washer','dishwasher'].includes(e.subtype))){const c=r.items.find(c=>c.id===e.hostId),len=G.lengthOf(c);for(const f of r.items.filter(f=>f.kind==='front'&&f.hostId===c.id))assert.ok(f.endT*len<=(e.offsetT*len-e.width/2)+.001||f.startT*len>=(e.offsetT*len+e.width/2)-.001);}
 assert.ok(r.items.some(e=>e.subtype==='fridge'&&e.builtIn));
});
test('base and upper routes may begin at an occupied wall joint and clip the corner',async()=>{
 const G=await import('../apps/preview/geometry.js');
 for(const kind of ['base','upper']){
  let r=G.placeWall([],{x:0,z:0},{x:4,z:0});r=G.placeWall(r.items,{x:4,z:0},{x:4,z:4});const [a,b]=r.items.filter(o=>o.kind==='wall');
  r=G.placeCabinet(r.items,{x:.1,z:0,hostId:a.id,side:1},{x:4,z:0},{kind});
  r=G.placeCabinet(r.items,{x:4,z:0,hostId:b.id,side:1},{x:4,z:3.8},{kind});
  assert.ok(r.items.find(o=>o.id===r.selectedId).startT>.08);assert.ok(r.items.some(o=>o.kind==='corner'));
 }
});
test('bare tall fronts are opt-in, sliding and independent; furniture seats move independently and with their parent',async()=>{
 const G=await import('../apps/preview/geometry.js'),O=await import('../apps/preview/scene-objects.js');
 let r=G.placeWall([],{x:0,z:0},{x:5,z:0});r=G.placeTallCabinet(r.items,{x:2,z:.4});const id=r.selectedId;
 assert.equal(r.items.filter(f=>f.kind==='front').length,0);
 r=G.editCabinet(r.items,id,{length:1.4,depth:.7});r=G.configureTallCabinet(r.items,id,{enabled:true,opening:'sliding',handleStyle:'knob',rows:1,leaves:2});
 assert.ok(r.items.filter(f=>f.kind==='front').every(f=>f.opening==='sliding'&&f.handleStyle==='knob'));
 for(const seats of [4,6,8]){let a=O.placeObject([],{x:0,z:0},'dining'+seats);assert.equal(a.items.filter(o=>o.type==='chair').length,seats);const parent=a.selectedId,chair=a.items.find(o=>o.type==='chair');a=O.editObject(a.items,chair.id,{x:3,rotation:1});assert.equal(a.items.find(o=>o.id===chair.id).x,3);a=O.editObject(a.items,parent,{x:1});assert.equal(a.items.find(o=>o.id===chair.id).x,4);}
});
