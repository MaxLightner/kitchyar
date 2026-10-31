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
test('cabinet creation requires a hosting wall and sits outside its thickness',async()=>{
 G||=await import('../apps/preview/geometry.js');
 assert.throws(()=>G.placeCabinet([],{x:0,z:0},{x:2,z:0}),/دیوار/);
 let items=G.placeWall([],{x:0,z:0},{x:5,z:0}).items;
 items=G.placeCabinet(items,{x:.4,z:.05},{x:2,z:.05},{kind:'base'}).items;
 const c=items.find(x=>x.kind==='cabinet'),w=items.find(x=>x.kind==='wall');
 assert.equal(c.hostId,w.id);
 const fp=G.cabinetFootprint(c,w);
 assert.ok(fp.corners.every(p=>Math.abs(p.z)>=w.thickness/2));
 assert.equal(c.subtype,'base');
 assert.throws(()=>G.placeCabinet(items,{x:2,z:.05},{x:3,z:1.2}),/همان دیوار/);
});
test('hosted upper cabinets use wall-relative position and respect openings',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:5,z:0}).items;
 const host=items[0].id;
 items=G.placeOpening(items,host,3,0,{style:'fixed',sill:.9}).items;
 items=G.placeCabinet(items,{x:.2,z:0},{x:1.8,z:0},{kind:'base'}).items;
 items=G.placeCabinet(items,{x:.2,z:0},{x:1.8,z:0},{kind:'upper'}).items;
 assert.equal(items.filter(x=>x.kind==='cabinet').length,2);
 assert.ok(items.at(-1).elevation>items.at(-2).elevation);
 const stop=G.placeCabinet(items,{x:1.8,z:0},{x:3.5,z:0},{kind:'upper'});
 assert.equal(stop.stoppedAtOpening,true);
 assert.ok(stop.end.x<2.4&&stop.end.x>2.3,'upper cabinet ends at the window edge');
 assert.throws(()=>G.placeCabinet(items,{x:2.8,z:0},{x:3.5,z:0},{kind:'upper'}),/شروع/);
 const c=items.at(-2),oldZ=c.z1;
 items=G.moveEndpoint(items,host,true,0,.3).items;
 assert.notEqual(items.find(x=>x.id===c.id).z1,oldZ);
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

test('same-layer cabinets do not overlap, handles stay on their host',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:5,z:0}).items;
 items=G.placeCabinet(items,{x:.2,z:0},{x:2,z:0},{kind:'base'}).items;
 assert.throws(()=>G.placeCabinet(items,{x:1.8,z:0},{x:3,z:0},{kind:'base'}),/تداخل/);
 items=G.placeCabinet(items,{x:2,z:0},{x:3.6,z:0},{kind:'base'}).items;
 const c=items.at(-1);
 assert.throws(()=>G.moveCabinetEndpoint(items,c.id,true,2,.9),/همان دیوار/);
 const moved=G.moveCabinetEndpoint(items,c.id,false,4,0).items;
 assert.equal(Number(moved.at(-1).endT.toFixed(2)),.8);
 assert.throws(()=>G.editWall(items,items[0].id,{length:.7}),/ناسازگار/);
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

test('renderer has real ray-tested AO, directional shadows, reflection probe and white overlay',()=>{
 const floor=source('floor-ar.js');
 assert.match(floor,/shadowMap\.enabled=true/);
 assert.match(floor,/DirectionalLight/);
 assert.match(floor,/applyRaycastAO\(\)/);
 assert.match(floor,/intersectObjects\(nearby,false\)/);
 assert.match(floor,/envMapIntensity:this\.renderSettings\.reflection/);
 assert.match(floor,/opacity:\.50/);
 assert.match(floor,/this\.whiteFloor\.visible=true/);
 assert.match(floor,/this\.shadowFloor\.visible=true/);
 assert.match(floor,/this\.previewGroup=new THREE\.Group/);
 assert.match(floor,/upper\?1\/3:-1\/3/);
});
test('UI font sizes are at least 15px and drawing buttons share side controls',()=>{
 const css=source('styles.css'),app=source('app.js');
 for(const match of css.matchAll(/font(?:-size)?:\s*(\d+(?:\.\d+)?)px/g))
  assert.ok(Number(match[1])>=15,'font below 15px: '+match[0]);
 for(const action of ['record-start','record-end','cancel-start','finish-line'])
  assert.match(app,new RegExp('data-action="'+action+'"'));
 assert.match(app,/id="draw-controls"/);
 assert.match(app,/data-render="sunAzimuth"/);
});

test('refrigerator, sink and stove provide selectable parametric equipment',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:5,z:0}).items;
 assert.throws(()=>G.placeEquipment(items,{x:1,z:0},'sink'),/کابینت زمینی/);
 items=G.placeCabinet(items,{x:.2,z:0},{x:3,z:0},{kind:'base'}).items;
 items=G.placeEquipment(items,{x:.9,z:.32},'sink').items;
 items=G.placeEquipment(items,{x:2.1,z:.32},'stove').items;
 items=G.placeEquipment(items,{x:-1.5,z:1.4},'fridge').items;
 assert.deepEqual(items.filter(x=>x.kind==='equipment').map(x=>x.subtype),['sink','stove','fridge']);
 assert.ok(items.find(x=>x.subtype==='sink').hostId,'sink is attached to base cabinet');
 assert.throws(()=>G.placeEquipment(items,{x:.9,z:.32},'stove'),/تجهیزات دارد/);
 const fridge=items.find(x=>x.subtype==='fridge');
 items=G.editEquipment(items,fridge.id,{height:2.1}).items;
 assert.equal(items.find(x=>x.id===fridge.id).height,2.1);
 const wallId=items.find(x=>x.kind==='wall').id;
 items=G.removeObject(items,wallId).items;
 assert.equal(items.filter(x=>x.kind==='equipment').length,1,'hosted equipment cascades on wall removal');
 assert.equal(items[0].subtype,'fridge');
});
test('precise XR screen-space rays and Chido-style AB grid direction',()=>{
 const ar=source('floor-ar.js');
 assert.match(ar,/screenRay\(pose,upper=false/);
 assert.match(ar,/view\.projectionMatrix/);
 assert.match(ar,/upper\?1\/3:-1\/3/);
 assert.match(ar,/this\.current=this\.floorRayHit\(pose\)/);
 assert.doesNotMatch(ar,/floorCandidates\(lower,this\.space,viewer\)/);
 assert.match(ar,/this\.net\.rotation\.z=-this\.gridYaw/);
 assert.match(ar,/this\.markA=point/);
 assert.match(ar,/this\.markB=point/);
});
test('equipment tools and pre-placement previews are visible and selectable',()=>{
 const app=source('app.js'),plan=source('plan-view.js');
 for(const id of ['fridge','stove','sink'])assert.match(app,new RegExp("'"+id+"'"));
 assert.match(app,/Geo\.placeEquipment/);
 assert.match(app,/Geo\.editEquipment/);
 assert.match(app,/floor\?\.pickObject/);
 assert.match(plan,/equipmentCorners/);
 assert.match(plan,/class="live-preview"/);
});

test('moving wall endpoint never jumps back to its own start snap node',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:2,z:0}).items;
 const resolved=G.resolvePoint(items,{x:2,z:0},2.3,.015,{pointSnap:true,angleSnap:false});
 assert.ok(Math.abs(resolved.x-2.3)<1e-8,'wall target stays under the reticle');
 items=G.placeWall(items,{x:2,z:0},{x:2.3,z:.015}).items;
 assert.equal(items.filter(x=>x.kind==='wall').length,2);
});
