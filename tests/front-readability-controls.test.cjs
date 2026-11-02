const test=require('node:test'),assert=require('node:assert/strict');
test('visible fridge stays in its wall bay and overhead follows upper top and chosen depth',async()=>{
 const G=await import('../apps/preview/geometry.js');let r=G.placeWall([],{x:0,z:0},{x:6,z:0});r=G.placeCabinet(r.items,{x:.2,z:0},{x:5.8,z:0});r=G.placeCabinet(r.items,{x:.2,z:0},{x:5.8,z:0},{kind:'upper'});
 r=G.placeEquipment(r.items,{x:3,z:.4},'fridge');const id=r.selectedId,e=r.items.find(o=>o.id===id);r=G.setFridgeMode(r.items,id,'free');const f=r.items.find(o=>o.id===id);assert.equal(f.x,e.x);assert.equal(f.z,e.z);assert.equal(f.builtIn,true);
 let top=r.items.find(c=>c.overFridgeId===id);assert.ok(top);assert.ok(Math.abs(top.height+top.elevation-2.45)<1e-8);
 r=G.addOverFridgeCabinet(r.items,id,{depth:'fridge'});top=r.items.find(c=>c.overFridgeId===id);assert.equal(top.depth,f.depth);
 r=G.applyAllUpperHeights(r.items,{height:1});top=r.items.find(c=>c.overFridgeId===id);assert.ok(Math.abs(top.height+top.elevation-2.55)<1e-8);
});
test('exposed hood overrides a decorative sample and clears manually edited upper doors',async()=>{
 const G=await import('../apps/preview/geometry.js');let r=G.placeWall([],{x:0,z:0},{x:5,z:0});r=G.placeCabinet(r.items,{x:0,z:0},{x:5,z:0});r=G.placeCabinet(r.items,{x:0,z:0},{x:5,z:0},{kind:'upper'});const upper=r.selectedId;r=G.placeEquipment(r.items,{x:2.5,z:.4},'stove');r=G.planSmartKitchen(r.items);
 const front=r.items.find(f=>f.kind==='front'&&f.hostId===upper&&f.startT<=.5&&f.endT>=.5);r=G.configureFrontUnit(r.items,front.id,{doorStyle:'frame'});const hood=r.items.find(o=>o.subtype==='hood');hood.coverStyle='wood';r=G.editEquipment(r.items,hood.id,{model:'chimney'});
 assert.equal(r.items.find(o=>o.id===hood.id).coverStyle,undefined);assert.ok(!r.items.some(f=>f.kind==='front'&&f.hostId===upper&&f.startT<.5&&f.endT>.5));
});
test('tall internal shelves avoid built-in appliances and burners toggle independently',async()=>{
 const G=await import('../apps/preview/geometry.js'),C=await import('../apps/preview/carcass.js');let r=G.placeWall([],{x:0,z:0},{x:5,z:0});r=G.placeTallCabinet(r.items,{x:2,z:.4});const id=r.selectedId;r=G.configureTallCabinet(r.items,id,{shelves:5});const c=r.items.find(o=>o.id===id);assert.equal(C.cabinetCarcassPanels(c).filter(p=>p.part==='adjustable-shelf').length,5);
 let a=G.placeCabinet(r.items,{x:3,z:0},{x:5,z:0});a=G.placeEquipment(a.items,{x:4,z:.3},'stove');const stove=a.selectedId;a=G.toggleBurner(a.items,stove,0);a=G.toggleBurner(a.items,stove,2);assert.deepEqual(a.items.find(o=>o.id===stove).burnersOn,[true,false,true,false,false]);a=G.toggleBurner(a.items,stove,0);assert.equal(a.items.find(o=>o.id===stove).burnersOn[2],true);
});
