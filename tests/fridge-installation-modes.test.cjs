const test=require('node:test');
const assert=require('node:assert/strict');

test('fridge returns from a free installation to its framed cabinet bay',async()=>{
 const Geo=await import('../apps/preview/geometry.js');
 const wall={id:'w',kind:'wall',x1:0,z1:0,x2:4,z2:0,height:2.8,thickness:.15};
 const base=Geo.placeCabinet([wall],{x:.4,z:0,hostId:'w',side:1},{x:3.6,z:0},{kind:'base',side:1});
 let placed=Geo.placeEquipment(base.items,{x:2,z:.2},'fridge',{model:'side',fridgeFeet:24});
 const id=placed.selectedId;
 let fridge=placed.items.find(e=>e.id===id);
 assert.equal(fridge.builtIn,true);
 const installedX=fridge.x,installedZ=fridge.z;
 let hidden=Geo.setFridgeMode(placed.items,id,'concealed');
 assert.equal(hidden.items.find(e=>e.id===id).facadeMode,'concealed');
 let free=Geo.setFridgeMode(hidden.items,id,'free');
 fridge=free.items.find(e=>e.id===id);
 assert.equal(fridge.builtIn,undefined);
 assert.equal(fridge.facadeMode,'visible');
 assert.ok(fridge.previousBuiltInPoint);
 const returned=Geo.setFridgeMode(free.items,id,'framed');
 fridge=returned.items.find(e=>e.id===id);
 assert.equal(fridge.builtIn,true);
 assert.equal(fridge.facadeMode,'visible');
 assert.equal(fridge.model,'side');
 assert.equal(fridge.id,id);
 assert.ok(Math.hypot(fridge.x-installedX,fridge.z-installedZ)<.02);
 assert.equal(returned.items.filter(e=>e.kind==='equipment'&&e.subtype==='fridge').length,1);
});

test('a fridge can be concealed only inside a cabinet run',async()=>{
 const Geo=await import('../apps/preview/geometry.js');
 let placed=Geo.placeEquipment([],{x:2,z:2},'fridge',{freestanding:true});
 const id=placed.selectedId;
 assert.throws(()=>Geo.setFridgeMode(placed.items,id,'concealed'));
 assert.equal(Geo.setFridgeMode(placed.items,id,'free').items.find(e=>e.id===id).facadeMode,'visible');
});
