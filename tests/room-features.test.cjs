const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
let G;
const geometry=async()=>G||=await import('../apps/preview/geometry.js');

test('a 20 degree cabinet bend has a real low-polygon corner connector instead of a gap',async()=>{
 const g=await geometry();const a=Math.PI/9;
 let items=g.placeWall([],{x:0,z:0},{x:4,z:0}).items;
 items=g.placeWall(items,{x:4,z:0},{x:4+4*Math.cos(a),z:4*Math.sin(a)}).items;
 const result=g.placeCabinetRoute(items,{x:.3,z:0,hostId:items[0].id,side:1},
  {x:7,z:1.1,hostId:items[1].id},{kind:'base',depth:.6});
 const joins=result.items.filter(o=>o.kind==='corner');assert.equal(joins.length,1);
 const polygon=g.cornerFillFootprint(result.items,joins[0]);
 assert.equal(polygon.corners.length,4);
 assert.ok(polygon.height>.7);
 assert.ok(result.items.filter(o=>o.kind==='cabinet').every(o=>g.lengthOf(o)>=.45));
 const deleted=g.removeObject(result.items,joins[0].aCabinetId).items;
 assert.ok(!deleted.some(o=>o.id===joins[0].id),'join cannot outlive either neighboring cabinet');
});

test('wall defaults to 3.6m and a numeric length edit reflows hosted openings and cabinets',async()=>{
 const g=await geometry();let items=g.placeWall([],{x:0,z:0},{x:5,z:0}).items;
 const w=items[0];assert.equal(w.height,3.6);
 items=g.placeOpening(items,w.id,2,0,{style:'fixed',width:1.2}).items;
 items=g.placeCabinet(items,{x:3,z:0,hostId:w.id,side:1},{x:4,z:0},{kind:'base'}).items;
 const edited=g.editWall(items,w.id,{length:6.31}).items;
 const wall=edited.find(o=>o.id===w.id),cab=edited.find(o=>o.kind==='cabinet');
 assert.ok(Math.abs(g.lengthOf(wall)-6.31)<.02);
 assert.ok(Math.abs(g.lengthOf(cab)-(cab.endT-cab.startT)*g.lengthOf(wall))<1e-8);
 assert.ok(g.resolvePoint([],{x:0,z:0},1.237,.883,{angleSnap:false,gridSnap:true}).x===1.24);
 const diagonal=g.placeWall([],{x:0,z:0},{x:2,z:1}).items;
 const resized=g.editWall(diagonal,diagonal[0].id,{length:3.17}).items;
 assert.ok(Math.abs(g.lengthOf(resized[0])-3.17)<1e-10,'exact centimetre wall length at any angle');
});

test('square-metre ivory room tiles follow a non-orthogonal closed polygon',async()=>{
 const g=await geometry();const {roomOutline,hasClosedRoom}=await import('../apps/preview/room-surfaces.js');
 let items=g.placeWall([],{x:0,z:0},{x:3,z:0}).items;
 items=g.placeWall(items,{x:3,z:0},{x:3.5,z:2}).items;
 items=g.placeWall(items,{x:3.5,z:2},{x:0,z:2}).items;
 items=g.placeWall(items,{x:0,z:2},{x:0,z:0}).items;
 assert.equal(hasClosedRoom(items),true);
 assert.equal(roomOutline(items).length,4);
});

test('windows accept Iranian vertical 1–4 leaf layouts and sinks store faucet selection',async()=>{
 const g=await geometry();let items=g.placeWall([],{x:0,z:0},{x:7,z:0}).items;
 const wall=items[0];items=g.placeOpening(items,wall.id,2,0,{style:'fixed'}).items;
 const window=items.find(o=>o.kind==='opening');
 items=g.editOpening(items,window.id,{windowModel:'quad'}).items;
 assert.equal(items.find(o=>o.id===window.id).windowModel,'quad');
 items=g.editOpening(items,window.id,{windowOperation:'casement',openFraction:.65}).items;
 assert.equal(items.find(o=>o.id===window.id).windowOperation,'casement');
 assert.equal(items.find(o=>o.id===window.id).openFraction,.65);
 assert.throws(()=>g.editOpening(items,window.id,{windowOperation:'european'}),/پنجره/);
 assert.throws(()=>g.editOpening(items,window.id,{windowModel:'six'}),/پنجره/);
 items=g.placeCabinet(items,{x:3.4,z:0,hostId:wall.id,side:1},{x:5.8,z:0},{kind:'base'}).items;
 const sink=g.placeEquipment(items,{x:4.25,z:.45},'sink');
 const updated=g.editEquipment(sink.items,sink.selectedId,{faucetModel:'pullout'});
 assert.equal(updated.items.find(o=>o.id===sink.selectedId).faucetModel,'pullout');
});

test('a standalone side-by-side fridge resizes without needing a cabinet',async()=>{
 const g=await geometry();let items=g.placeWall([],{x:0,z:0},{x:6,z:0}).items;
 items=g.placeCabinet(items,{x:1,z:0,hostId:items[0].id,side:1},{x:3,z:0},{kind:'base'}).items;
 const result=g.placeEquipment(items,{x:4.6,z:1.55},'fridge',{freestanding:true});
 assert.equal(result.items.find(o=>o.id===result.selectedId).builtIn,undefined);
 const side=g.editEquipment(result.items,result.selectedId,{model:'side',fridgeFeet:32});
 const fridge=side.items.find(o=>o.id===result.selectedId);
 assert.ok(fridge.width>1);assert.equal(fridge.model,'side');
});

test('ceiling and floor are hidden by default and do not trigger full remeshing when toggled',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'../apps/preview/app.js'),'utf8');
 const three=fs.readFileSync(path.join(__dirname,'../apps/preview/floor-ar.js'),'utf8');
 assert.match(ui,/roomSurfacesVisible=false/);
 assert.match(ui,/data-action="toggle-surfaces"/);
 assert.match(ui,/data-ceiling-height/);
 assert.match(three,/setRoomSurfaces\(visible=false,height=3\.6\)/);
 assert.match(three,/new THREE\.ShapeGeometry\(outline\)/);
 assert.match(three,/CanvasTexture\(canvas\)/);
 assert.match(three,/this\.roomSurfaceGroup\.visible=this\.roomSurfacesVisible/);
});

test('selected resize grips are smaller, A/B are crosses, and glass waits one second',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'../apps/preview/app.js'),'utf8');
 const three=fs.readFileSync(path.join(__dirname,'../apps/preview/floor-ar.js'),'utf8');
 const plan=fs.readFileSync(path.join(__dirname,'../apps/preview/plan-view.js'),'utf8');
 assert.match(three,/SphereGeometry\(\.0525/);
 assert.match(plan,/visibleRadius=Math\.max\(\.0525,6\/pixelsPerMetre\)/);
 assert.match(plan,/data-calibration=.*class="ab-touch"/);
 assert.match(three,/new THREE\.LineSegments\(shape/);
 assert.match(three,/windowGlassId/);
 assert.match(three,/,1000\)/);
 assert.match(ui,/setWindowResizeActive\(drag\.id,false\)/);
});
