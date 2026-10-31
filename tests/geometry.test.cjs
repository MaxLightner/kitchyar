const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=file=>fs.readFileSync(path.join(__dirname,'../apps/preview/',file),'utf8');
let G;
test('ported Archiyar geometry loads as ESM',async()=>{
 G=await import('../apps/preview/geometry.js');
 assert.equal(G.SNAP_RADIUS,.5);
 assert.equal(typeof G.placeWall,'function');
});
test('continuous wall junctions share stable nodes',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:4,z:0}).items;
 items=G.placeWall(items,{x:4,z:0},{x:4,z:3}).items;
 assert.equal(items[0].endNodeId,items[1].startNodeId);
 const moved=G.moveEndpoint(items,items[0].id,false,4.5,.5).items;
 assert.deepEqual([moved[1].x1,moved[1].z1],[4.5,.5]);
});
test('T-junction splits wall and preserves valid hosted window',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:4,z:0}).items;
 const host=items[0].id;
 items=G.placeOpening(items,host,2,0,{style:'fixed',width:1.2,height:1.2,sill:.9}).items;
 assert.throws(()=>G.placeWall(items,{x:2,z:0},{x:2,z:2}),/بازشو/);
 items=G.placeWall(items,{x:3.2,z:0},{x:3.2,z:2}).items;
 assert.equal(items.filter(x=>x.kind==='wall').length,3);
 const opening=items.find(x=>x.kind==='opening');
 assert.equal(opening.hostId,host);
 const rhs=items.find(x=>x.kind==='wall'&&x.x1===3.2&&x.z1===0&&x.x2===4);
 assert.ok(rhs);
});
test('crossing is split into four connected segments',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:-2,z:0},{x:2,z:0}).items;
 items=G.placeWall(items,{x:0,z:-2},{x:0,z:2}).items;
 const walls=items.filter(x=>x.kind==='wall');
 assert.equal(walls.length,4);
 const nodeIds=walls.flatMap(w=>[w.startNodeId,w.endNodeId]);
 assert.equal(Math.max(...Object.values(nodeIds.reduce((m,id)=>(m[id]=(m[id]||0)+1,m),{}))),4);
});
test('Archiyar 45 degree snapping and endpoint priority',async()=>{
 G||=await import('../apps/preview/geometry.js');
 const result=G.resolvePoint([],{x:0,z:0},1,1.1,{angleSnap:true});
 assert.equal(result.angleLocked,true);
 assert.ok(Math.abs(result.x-result.z)<1e-10);
 const items=G.placeWall([],{x:0,z:0},{x:2,z:0}).items;
 const s=G.resolvePoint(items,{x:0,z:0},1.9,.08,{pointSnap:true,angleSnap:true});
 assert.equal(s.pointLocked,true);
 assert.equal(s.x,2);assert.equal(s.z,0);
});
test('door and fixed window are host-bound and overlap-safe',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:5,z:0}).items;
 const host=items[0].id;
 items=G.placeOpening(items,host,1,0,{style:'door',width:.9,height:2.1,sill:0}).items;
 items=G.placeOpening(items,host,3,0,{style:'fixed',width:1.2,height:1.2,sill:.9}).items;
 assert.throws(()=>G.placeOpening(items,host,3.2,0,{style:'fixed',width:.9}),/تداخل/);
 assert.throws(()=>G.editOpening(items,items[2].id,{width:4.8}),/خارج|ناسازگار/);
 assert.equal(items.filter(x=>x.kind==='opening').length,2);
});
test('ground and upper cabinet are continuous parametric runs',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeCabinet([],{x:0,z:0},{x:2,z:0},{kind:'base'}).items;
 items=G.placeCabinet(items,{x:2.04,z:.02},{x:3.5,z:0},{kind:'base'}).items;
 items=G.placeCabinet(items,{x:0,z:.7},{x:2,z:.7},{kind:'upper'}).items;
 assert.equal(items[1].x1,2);
 assert.equal(items[2].subtype,'upper');
 assert.ok(items[2].elevation>items[0].elevation);
});
test('AR locked grid retains the 10 cm geometry',()=>{
 const floor=source('floor-ar.js');
 assert.match(floor,/vec2 cells=gridUv\*60\.0/);
 assert.match(floor,/this\.net\.visible=true/);
 assert.match(floor,/this\.floorGroup\.add\(this\.objectGroup\)/);
 assert.match(floor,/this\.floorGroup\.worldToLocal/);
});
test('minimum 13px font in every explicit CSS declaration',()=>{
 const css=source('styles.css');
 for(const match of css.matchAll(/font(?:-size)?:\s*(\d+(?:\.\d+)?)px/g))
  assert.ok(Number(match[1])>=13,'too-small font: '+match[0]);
 assert.match(css,/small,sub,sup/);
});
test('new dock tools keep the same three screen editor route',()=>{
 const app=source('app.js');
 for(const tool of ['wall','window','door','base','upper'])assert.match(app,new RegExp("'"+tool+"'"));
 assert.match(app,/function editorPage/);assert.match(app,/mode='ar'/);
 assert.match(app,/function commitChange/);assert.match(app,/function undoChange/);
});

test('adjacent cabinets share an editable joint',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeCabinet([],{x:0,z:0},{x:2,z:0},{kind:'base'}).items;
 items=G.placeCabinet(items,{x:2.05,z:0},{x:3.6,z:0},{kind:'base'}).items;
 assert.equal(items[0].endNodeId,items[1].startNodeId);
 items=G.moveCabinetEndpoint(items,items[0].id,false,2.4,.2).items;
 assert.deepEqual([items[1].x1,items[1].z1],[2.4,.2]);
});
test('door hinge and opening angle stay attached to the wall',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:4,z:0}).items;
 items=G.placeOpening(items,items[0].id,2,0,{style:'door'}).items;
 const id=items.find(x=>x.kind==='opening').id;
 items=G.editOpening(items,id,{openFraction:.8,mirrored:true}).items;
 assert.equal(items.find(x=>x.id===id).openFraction,.8);
 assert.equal(items.find(x=>x.id===id).mirrored,true);
 assert.throws(()=>G.editOpening(items,id,{openFraction:1.4}),/زاویه/);
});
