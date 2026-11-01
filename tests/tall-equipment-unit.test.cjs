const test=require('node:test');
const assert=require('node:assert/strict');

const wall=(id,z,height=3.6)=>({id,kind:'wall',x1:0,z1:z,x2:4,z2:z,height,thickness:.15});
const tall=items=>items.find(o=>o.kind==='cabinet'&&o.subtype==='tall');

test('equipment-style tall unit follows ceiling and offers independent door rows, leaves and depth',async()=>{
 const Geo=await import('../apps/preview/geometry.js');
 let p=Geo.placeTallCabinet([wall('w',0)],{x:2,z:.2});
 let c=tall(p.items);
 assert.equal(c.ceilingAligned,true);
 assert.ok(Math.abs(c.height-3.58)<.001);
 assert.equal(p.items.filter(f=>f.kind==='front'&&f.hostId===c.id).length,2);
 p=Geo.configureTallCabinet(p.items,c.id,{rows:3,leaves:2,depth:.35});
 c=tall(p.items);
 assert.equal(c.depth,.35);
 assert.equal(c.tallDoorRows,3);
 assert.equal(c.tallDoorLeaves,2);
 assert.equal(p.items.filter(f=>f.kind==='front'&&f.hostId===c.id).length,6);
 p=Geo.setAllWallHeights(p.items,4.2);
 c=tall(p.items);
 assert.ok(Math.abs(c.height-4.18)<.001);
 assert.equal(p.items.filter(f=>f.kind==='front'&&f.hostId===c.id).length,6);
 assert.throws(()=>Geo.configureTallCabinet(p.items,c.id,{leaves:3}));
});

test('moving an independent tall unit keeps its fronts, identities and manual finish',async()=>{
 const Geo=await import('../apps/preview/geometry.js');
 const base=[wall('one',0),wall('two',3)];
 let result=Geo.placeTallCabinet(base,{x:1.3,z:.2},{rows:2,leaves:1});
 const id=result.selectedId;
 const door=result.items.find(f=>f.kind==='front'&&f.hostId===id);
 result=Geo.editFront(result.items,door.id,{finish:'graphite'});
 const before=result.items.find(f=>f.id===door.id);
 const moved=Geo.moveTallCabinet(result.items,id,{x:2.7,z:3.2});
 const c=moved.items.find(o=>o.id===id);
 assert.equal(c.hostId,'two');
 assert.equal(moved.items.filter(o=>o.kind==='cabinet'&&o.subtype==='tall').length,1);
 const retained=moved.items.find(o=>o.id===door.id);
 assert.equal(retained.hostId,id);
 assert.equal(retained.finish,'graphite');
 assert.deepEqual(retained.manualOverrides,before.manualOverrides);
 assert.equal(moved.items.filter(f=>f.kind==='front'&&f.hostId===id).length,2);
});
