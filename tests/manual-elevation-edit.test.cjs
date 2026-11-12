const test=require('node:test');
const assert=require('node:assert/strict');

test('draw and erase facade seams edit the same geometry read by elevation and 3D',async()=>{
 const G=await import('../apps/preview/geometry.js');
 const E=await import('../apps/preview/side-elevation.js');
 let r=G.placeWall([],{x:0,z:0},{x:4,z:0});
 r=G.placeCabinet(r.items,{x:.2,z:0},{x:3.8,z:0});
 const c=r.items.find(o=>o.kind==='cabinet');
 r=G.placeFrontLayout(r.items,c.id,'doors');
 const f=r.items.find(o=>o.kind==='front');
 const before=r.items.filter(o=>o.kind==='front'&&o.hostId===c.id).length;
 const oldWidth=(f.endT-f.startT)*G.lengthOf(c);
 r=G.splitManualFront(r.items,f.id,{direction:'vertical',ratio:.5});
 const left=r.items.find(o=>o.id===f.id);
 const right=r.items.find(o=>o.id===r.selectedId);
 assert.equal(r.items.filter(o=>o.kind==='front'&&o.hostId===c.id).length,before+1);
 assert.ok(Math.abs(G.frontPose(left,c).width+G.frontPose(right,c).width-oldWidth)<.01);
 assert.equal(r.items.find(o=>o.id===c.id).frontPreset,'custom');
 assert.match(E.renderSideElevation(r.items,{wallId:c.hostId,selectedId:right.id}),new RegExp('data-item-id="'+right.id+'"'));
 const rhs=right.id;
 r=G.setManualFrontType(r.items,rhs,'mirror');
 assert.equal(r.items.find(o=>o.id===rhs).mirror,true);
 r=G.setManualFrontType(r.items,rhs,'shelf');
 assert.equal(r.items.find(o=>o.id===rhs).style,'open');
 assert.equal(r.items.find(o=>o.id===rhs).shelfCount,2);
 r=G.eraseManualFrontSeam(r.items,rhs,{direction:'vertical'});
 assert.equal(r.items.filter(o=>o.kind==='front'&&o.hostId===c.id).length,before);
 assert.equal(r.items.find(o=>o.id===c.id).frontPreset,'custom');
});

test('horizontal pencil and eraser preserve physical height',async()=>{
 const G=await import('../apps/preview/geometry.js');
 let r=G.placeWall([],{x:0,z:0},{x:2.5,z:0});
 r=G.placeCabinet(r.items,{x:.2,z:0},{x:2.3,z:0});
 const c=r.items.find(o=>o.kind==='cabinet');
 r=G.placeFrontLayout(r.items,c.id,'doors');
 const first=r.items.find(o=>o.kind==='front'),height=(first.topT-first.bottomT)*c.height;
 r=G.splitManualFront(r.items,first.id,{direction:'horizontal',ratio:.55});
 const part=r.items.find(o=>o.id===r.selectedId),original=r.items.find(o=>o.id===first.id);
 assert.ok(Math.abs((part.topT-part.bottomT+original.topT-original.bottomT)*c.height-height)<.005);
 r=G.eraseManualFrontSeam(r.items,part.id,{direction:'horizontal'});
 assert.ok(Math.abs((r.items.find(o=>o.id===part.id).topT-r.items.find(o=>o.id===part.id).bottomT)*c.height-height)<.005);
});

test('reference gallery appearance keeps prior facade IDs and divisions',async()=>{
 const G=await import('../apps/preview/geometry.js');
 const M=await import('../apps/preview/materials.js');
 let r=G.placeWall([],{x:0,z:0},{x:3,z:0});
 r=G.placeCabinet(r.items,{x:.2,z:0},{x:2.8,z:0});
 const c=r.items.find(o=>o.kind==='cabinet');
 r=G.placeFrontLayout(r.items,c.id,'doors');
 const f=r.items.find(o=>o.kind==='front');
 r=G.splitManualFront(r.items,f.id,{direction:'vertical',ratio:.5});
 const before=r.items.filter(o=>o.kind==='front'&&o.hostId===c.id).map(o=>[o.id,o.startT,o.endT,o.topT,o.bottomT]);
 const style=M.KITCHEN_STYLES[0];
 r=G.applyKitchenLayout(r.items,style.id);
 const after=r.items.filter(o=>o.kind==='front'&&o.hostId===c.id).map(o=>[o.id,o.startT,o.endT,o.topT,o.bottomT]);
 assert.deepEqual(after,before);
});
