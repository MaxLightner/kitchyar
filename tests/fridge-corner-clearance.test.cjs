const test=require('node:test');
const assert=require('node:assert/strict');

test('fridge near a 20-degree wall corner slides to real clearance and deletion reunifies base',async()=>{
 const Geo=await import('../apps/preview/geometry.js');
 const walls=[
  {id:'main',kind:'wall',x1:0,z1:0,x2:5,z2:0,height:3.6,thickness:.15},
  {id:'angled',kind:'wall',x1:0,z1:0,x2:1.6,z2:.58,height:3.6,thickness:.15}
 ];
 const base=Geo.placeCabinet(walls,{x:1.8,z:0,hostId:'main',side:1},{x:4.6,z:0},{kind:'base',side:1});
 const original=base.items.find(o=>o.id===base.selectedId);
 const p=Geo.placeEquipment(base.items,{x:1.76,z:.25},'fridge',{model:'single'});
 const fridge=p.items.find(o=>o.id===p.selectedId);
 assert.equal(fridge.builtIn,true,'fridge should fit inside the existing cabinet run');
 assert.ok(fridge.x>1.97,'fridge body should avoid the angled adjoining wall');
 const removed=Geo.removeObject(p.items,fridge.id);
 const bases=removed.items.filter(o=>o.kind==='cabinet'&&o.subtype==='base'&&o.hostId==='main');
 assert.equal(bases.length,1,'after removing fridge the run must merge back');
 assert.ok(Math.abs(bases[0].startT-original.startT)<.001);
 assert.ok(Math.abs(bases[0].endT-original.endT)<.001);
});
