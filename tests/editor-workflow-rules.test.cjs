const test=require('node:test'),assert=require('node:assert/strict');
test('two upper tiers fit 3m and 2.7m ceilings; roof derives from open wall bounds',async()=>{
 const P=await import('../apps/preview/kitchen-policy.js'),G=await import('../apps/preview/geometry.js'),L=await import('../apps/preview/design-library.js'),O=await import('../apps/preview/scene-objects.js');
 assert.deepEqual(P.tierHeights(3),{total:1.5,lower:.6,upper:.9});assert.deepEqual(P.tierHeights(2.7),{total:1.2,lower:.4,upper:.8});
 let r=G.placeWall([],{x:0,z:0},{x:5,z:0});r=G.placeWall(r.items,{x:5,z:0},{x:5,z:4});r=G.placeCabinet(r.items,{x:.2,z:0},{x:4.8,z:0},{kind:'upper'});r=L.configureTiers(r.items,{ceilingHeight:3});r=G.setAllWallHeights(r.items,2.7);
 const c=r.items.find(o=>o.subtype==='upper');assert.equal(c.upperTiers.lowerHeight,.4);assert.ok(Math.abs(c.elevation+c.height-2.7)<1e-7);
 delete c.upperTiers.auto;c.upperTiers.lowerHeight=.9;const upgraded=L.upgradeLegacyTiers(r.items,2.7);assert.equal(upgraded.find(o=>o.id===c.id).upperTiers.lowerHeight,.4);assert.equal(L.upgradeLegacyTiers(upgraded,2.7),upgraded);
 r=O.placeObject(r.items,{x:20,z:20},'ceiling',{ceilingHeight:2.7});const roof=r.items.find(o=>o.type==='ceiling');assert.deepEqual([roof.x,roof.z,roof.width,roof.depth],[2.5,2,5,4]);
});
test('sink keeps paired doors beside a machine; bucket paints only the same row',async()=>{
 const G=await import('../apps/preview/geometry.js');let r=G.placeWall([],{x:0,z:0},{x:4,z:0});r=G.placeCabinet(r.items,{x:0,z:0},{x:4,z:0});r=G.placeFrontLayout(r.items,r.selectedId,'smart');r=G.placeEquipment(r.items,{x:1,z:.3},'washer');r=G.placeEquipment(r.items,{x:1.82,z:.3},'sink');
 const sink=r.items.find(o=>o.id===r.selectedId),f=r.items.find(f=>f.kind==='front'&&f.startT<=sink.offsetT+1e-7&&f.endT>=sink.offsetT-1e-7),doors=r.items.filter(p=>p.kind==='front'&&p.hostId===sink.hostId&&p.bay===f.bay);assert.equal(doors.length,2);assert.ok(doors.every(f=>f.subtype==='door'));
 r=G.placeWall(r.items,{x:0,z:4},{x:4,z:4});r=G.placeCabinet(r.items,{x:0,z:4},{x:4,z:4});const remote=r.selectedId;r=G.placeFrontLayout(r.items,remote,'doors');const before=r.items.filter(o=>o.hostId===remote);
 r=G.paintFronts(r.items,f.id,{scope:'row',materialId:'deep-green'});assert.deepEqual(r.items.filter(o=>o.hostId===remote),before);assert.ok(r.items.filter(o=>o.kind==='front'&&o.hostId===sink.hostId).every(f=>f.materialId==='deep-green'));
});
test('connector reserves both legs and backsplash extends to the shared wall corner',async()=>{
 const G=await import('../apps/preview/geometry.js');let r=G.placeWall([],{x:0,z:0},{x:4,z:0});r=G.placeWall(r.items,{x:4,z:0},{x:4,z:4});const [a,b]=r.items;
 r=G.placeCabinetRoute(r.items,{x:.2,z:0,hostId:a.id,side:1},{x:4,z:3.8,hostId:b.id},{kind:'base',depth:.6});const join=r.items.find(o=>o.kind==='corner'),first=r.items.find(o=>o.kind==='cabinet'&&o.hostId===a.id),second=r.items.find(o=>o.kind==='cabinet'&&o.hostId===b.id);assert.ok(first.endT<.9&&second.startT>.1);assert.equal(join[join.aCabinetId===first.id?'aEnd':'bEnd'],'end');assert.equal(join[join.aCabinetId===second.id?'aEnd':'bEnd'],'start');assert.equal(join.doorMode,'none');assert.equal(G.backsplashSpan(r.items,first).end,4);assert.equal(G.backsplashSpan(r.items,second).start,0);assert.ok(G.cornerFillFootprint(r.items,join).corners.length>=4);
});
test('tall discrete controls accept UI values and Chido chairs face the table',async()=>{
 const G=await import('../apps/preview/geometry.js'),O=await import('../apps/preview/scene-objects.js');let r=G.placeWall([],{x:0,z:0},{x:4,z:0});r=G.placeTallCabinet(r.items,{x:2,z:.4},{width:1});const id=r.selectedId;r=G.configureTallCabinet(r.items,id,{enabled:true,rows:'1',leaves:'2',shelves:3});assert.equal(r.items.filter(o=>o.kind==='front').length,2);
 const a=O.placeObject([],{x:0,z:0},'dining6');for(const c of a.items.filter(o=>o.type==='chair')){assert.equal(c.model,'chido-chair');assert.ok(Math.cos(c.rotation)*(-c.z)>0);}
});
test('standalone fridge has a default frame and preserves the explicit frame-off choice on move and resize',async()=>{
 const G=await import('../apps/preview/geometry.js');let r=G.placeWall([],{x:0,z:0},{x:5,z:0});r=G.placeEquipment(r.items,{x:2,z:.4},'fridge',{freestanding:true});const id=r.selectedId;
 assert.equal(r.items.find(o=>o.id===id).frameEnabled,true);assert.ok(r.items.some(o=>o.overFridgeId===id));
 r=G.configureEquipmentAppearance(r.items,id,{frameEnabled:false});r=G.moveEquipment(r.items,id,{x:3,z:.4});r=G.editEquipment(r.items,id,{depth:.75});assert.equal(r.items.find(o=>o.id===id).frameEnabled,false);assert.ok(!r.items.some(o=>o.overFridgeId===id));
});
