const test=require('node:test');
const assert=require('node:assert/strict');

test('fridge removal restores original manually styled doors and keeps sink, hob and hood',async()=>{
 const G=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:7,z:0}).items;
 items=G.placeCabinet(items,{x:.2,z:0,side:1},{x:6.8,z:0},{kind:'base',side:1}).items;
 const id=items.find(c=>c.kind==='cabinet').id;
 items=G.placeEquipment(items,{x:1.3,z:.36},'sink').items;
 items=G.placeEquipment(items,{x:5.4,z:.36},'stove').items;
 items=G.placeFrontLayout(items,id,'smart').items;
 const middle=items.filter(f=>f.kind==='front'&&f.hostId===id)
  .find(f=>(f.startT+f.endT)/2>.40&&(f.startT+f.endT)/2<.60);
 assert.ok(middle,'test needs a facade at the fridge position');
 items=G.editFront(items,middle.id,{finish:'graphite',handleStyle:'knob'}).items;
 const fronts=items.filter(f=>f.kind==='front');
 const devices=items.filter(e=>e.kind==='equipment').map(e=>({id:e.id,x:e.x,z:e.z,hostId:e.hostId}));
 const placed=G.placeEquipment(items,{x:3.2,z:.38},'fridge');
 const fridge=placed.items.find(e=>e.id===placed.selectedId);
 assert.equal(fridge.builtIn,true);
 const restored=G.removeObject(placed.items,fridge.id).items;
 assert.equal(restored.filter(c=>c.kind==='cabinet'&&c.subtype==='base').length,1);
 assert.deepEqual(restored.filter(f=>f.kind==='front'),fronts);
 assert.deepEqual(restored.filter(e=>e.kind==='equipment').map(e=>({id:e.id,x:e.x,z:e.z,hostId:e.hostId})),devices);
});

test('removing a fridge does not merge originally independent adjacent cabinet runs',async()=>{
 const G=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:6,z:0}).items;
 items=G.placeCabinet(items,{x:.2,z:0,side:1},{x:3,z:0},{kind:'base',side:1}).items;
 items=G.placeCabinet(items,{x:3,z:0,side:1},{x:5.8,z:0},{kind:'base',side:1}).items;
 for(const c of items.filter(x=>x.kind==='cabinet'))items=G.placeFrontLayout(items,c.id,'doors').items;
 const initial=items.filter(x=>x.kind==='cabinet'||x.kind==='front');
 const placed=G.placeEquipment(items,{x:3,z:.38},'fridge');
 assert.equal(placed.items.find(e=>e.id===placed.selectedId).builtIn,true);
 const restored=G.removeObject(placed.items,placed.selectedId).items;
 const relevant=restored.filter(x=>x.kind==='cabinet'||x.kind==='front');
 assert.equal(restored.filter(c=>c.kind==='cabinet').length,2);
 assert.equal(relevant.length,initial.length);
 for(const original of initial)assert.deepEqual(relevant.find(o=>o.id===original.id),original);
});
