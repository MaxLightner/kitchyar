const test=require('node:test'),assert=require('node:assert/strict');
test('90cm uppers share height; sink upper has two horizontal doors and 120cm sink keeps two regular lower leaves',async()=>{
 const G=await import('../apps/preview/geometry.js');
 let r=G.placeWall([],{x:0,z:0},{x:4,z:0});
 r=G.placeCabinet(r.items,{x:0,z:0},{x:4,z:0});const baseId=r.selectedId;
 r=G.placeCabinet(r.items,{x:0,z:0},{x:4,z:0},{kind:'upper'});const upperId=r.selectedId;
 assert.equal(r.items.find(c=>c.id===upperId).height,.9);
 r=G.placeEquipment(r.items,{x:2,z:.3},'sink');const sinkId=r.selectedId;
 r=G.editEquipment(r.items,sinkId,{sinkSize:120});r=G.planSmartKitchen(r.items);
 assert.equal(r.valid,true);
 const lower=r.items.filter(f=>f.kind==='front'&&f.hostId===baseId&&f.startT>=.375-1e-6&&f.endT<=.625+1e-6);
 assert.equal(lower.length,2);assert.ok(lower.every(f=>Math.abs((f.endT-f.startT)*4-.5)<1e-6));
 const top=r.items.filter(f=>f.kind==='front'&&f.hostId===upperId&&f.hinge==='top');
 assert.equal(top.length,2);assert.ok(top.every(f=>Math.abs((f.endT-f.startT)*4-1)<1e-6));
 const moved=G.editCabinet(r.items,upperId,{height:.8});
 assert.ok(moved.items.filter(f=>f.kind==='front'&&f.hostId===upperId).every(f=>f.hinge!=='top'));
 assert.throws(()=>G.editFront(moved.items,top[0].id,{hinge:'top'}),/۹۰/);
 const other=G.placeWall(moved.items,{x:0,z:4},{x:4,z:4});
 const second=G.placeCabinet(other.items,{x:0,z:4},{x:4,z:4},{kind:'upper'});
 const all=G.editCabinet(second.items,upperId,{height:1.0});
 assert.ok(all.items.filter(c=>c.kind==='cabinet'&&c.subtype==='upper').every(c=>c.height===1));
});
test('exposed hood removes upper doors over its hob; switching back restores the bay',async()=>{
 const G=await import('../apps/preview/geometry.js');let r=G.placeWall([],{x:0,z:0},{x:4,z:0});r=G.placeCabinet(r.items,{x:0,z:0},{x:4,z:0});r=G.placeCabinet(r.items,{x:0,z:0},{x:4,z:0},{kind:'upper'});const upper=r.selectedId;
 r=G.placeEquipment(r.items,{x:2,z:.3},'stove',{model:'gas3'});const stove=r.items.find(e=>e.id===r.selectedId);const hood=r.items.find(e=>e.linkedStoveId===stove.id);
 assert.equal(hood.width,.45);r=G.planSmartKitchen(r.items);r=G.editEquipment(r.items,hood.id,{model:'chimney'});
 const fronts=()=>r.items.filter(f=>f.kind==='front'&&f.hostId===upper&&f.startT<.5&&f.endT>.5);
 assert.equal(fronts().length,0);r=G.editEquipment(r.items,hood.id,{model:'concealed'});assert.ok(fronts().length>0);
});
