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
test('UI font sizes are at least 15px and drawing controls belong to bottom panel',()=>{
 const css=source('styles.css'),app=source('app.js');
 for(const match of css.matchAll(/font(?:-size)?:\s*(\d+(?:\.\d+)?)px/g))
  assert.ok(Number(match[1])>=15,'font below 15px: '+match[0]);
 for(const action of ['confirm-drawing','cancel-drawing'])
  assert.match(app,new RegExp('data-action="'+action+'"'));
 for(const action of ['record-start','record-end','cancel-start','finish-line'])
  assert.doesNotMatch(app,new RegExp('data-action="'+action+'"'));
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
 assert.deepEqual(items.filter(x=>x.kind==='equipment').map(x=>x.subtype),['sink','stove','hood','fridge']);
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


test('direct window handles snap to one centimetre and preserve the opposite edge',async()=>{
 G||=await import('../apps/preview/geometry.js');
 const H=await import('../apps/preview/edit-handles.js');
 let items=G.placeWall([],{x:0,z:0},{x:5,z:0}).items;
 const wall=items[0];
 items=G.placeOpening(items,wall.id,2.5,0,{style:'fixed',sill:.9,height:1.2,width:1.2}).items;
 const op=items.find(o=>o.kind==='opening'),rightBefore=op.hostT*5+op.width/2;
 const bottom=H.resizeFromHandle(items,op.id,'bottom',{y:1.073}).items.find(o=>o.id===op.id);
 assert.equal(bottom.sill,1.07);assert.equal(bottom.height,1.03);
 assert.equal(bottom.sill+bottom.height,2.1,'top edge stays fixed during sill drag');
 const left=H.resizeFromHandle(items,op.id,'left',{along:1.713}).items.find(o=>o.id===op.id);
 assert.equal(left.width,1.39);
 assert.ok(Math.abs(left.hostT*5+left.width/2-rightBefore)<1e-8,'opposite edge must not shift');
 assert.throws(()=>H.resizeFromHandle(items,op.id,'top',{y:2.91}),/بازشو|دیوار/);
 const minimum=H.resizeFromHandle(items,op.id,'left',{along:100}).items.find(o=>o.id===op.id);
 assert.equal(minimum.width,.3,'width is clamped to 30cm');
});
test('cabinet installed length has stable 1 cm start/end resizing',async()=>{
 G||=await import('../apps/preview/geometry.js');
 const H=await import('../apps/preview/edit-handles.js');
 let items=G.placeWall([],{x:0,z:0},{x:5,z:0}).items;
 items=G.placeCabinet(items,{x:.5,z:0},{x:1.5,z:0},{kind:'base'}).items;
 const c=items.find(o=>o.kind==='cabinet');
 const adjusted=H.resizeFromHandle(items,c.id,'end',{along:1.647}).items.find(o=>o.id===c.id);
 assert.ok(Math.abs((adjusted.endT-adjusted.startT)*5-1.15)<1e-8);
 assert.equal(adjusted.startT,c.startT);
});
test('live resize guides locate nearest cabinet or wall corner',async()=>{
 G||=await import('../apps/preview/geometry.js');
 const H=await import('../apps/preview/edit-handles.js');
 let items=G.placeWall([],{x:0,z:0},{x:5,z:0}).items;
 const wall=items[0];
 items=G.placeCabinet(items,{x:.5,z:0},{x:1.5,z:0},{kind:'base'}).items;
 items=G.placeOpening(items,wall.id,2.5,0,{style:'fixed'}).items;
 const op=items.find(o=>o.kind==='opening'),gap=H.neighborGaps(items,op);
 assert.equal(gap.before.label,'کابینت زمینی');
 assert.equal(gap.before.gap,.4);
 assert.equal(gap.after.label,'کنج دیوار');
 const elevation=H.renderElevation(items,op,{id:op.id,side:'bottom'});
 assert.match(elevation,/data-open-handle="bottom"/);
 assert.match(elevation,/کابینت زمینی/);
 assert.match(H.renderPlanMeasurements(items,op.id,'right'),/live-measurements/);
 const app=source('app.js'),floor=source('floor-ar.js');
 assert.match(app,/setPointerCapture/);
 assert.match(app,/function finishResize/);
 assert.match(floor,/pickHandle\(clientX,clientY\)/);
 assert.match(floor,/setEditPreview\(items,id,side,visible\)/);
});

test('cabinet cursor snaps to wall endpoints and corner route installs without intermediate confirmation',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:3,z:0}).items;
 items=G.placeWall(items,{x:3,z:0},{x:3,z:3}).items;
 const corner=G.snapCabinetPoint(items,3.1,.08);
 assert.equal(corner.corner,true);assert.equal(corner.x,3);assert.equal(corner.z,0);
 const a=G.snapCabinetPoint(items,.5,.09),b=G.snapCabinetPoint(items,3.04,2);
 const path=G.cabinetPath(items,a,b);
 assert.equal(path.segments.length,2,'preview route turns around connected wall');
 const placed=G.placeCabinetRoute(items,a,b,{kind:'base'});
 const cabinets=placed.items.filter(x=>x.kind==='cabinet');
 assert.equal(cabinets.length,2,'one end tap installs two wall segments');
 assert.notEqual(cabinets[0].hostId,cabinets[1].hostId);
 assert.equal(placed.end.hostId,b.hostId);
 assert.ok(cabinets.every(c=>G.lengthOf(c)>.3));
});
test('upper cabinet stops at fixed window instead of crossing opening',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:5,z:0}).items;
 items=G.placeOpening(items,items[0].id,3,0,{style:'fixed'}).items;
 const a=G.snapCabinetPoint(items,.25,0),b=G.snapCabinetPoint(items,4.7,0);
 const done=G.placeCabinetRoute(items,a,b,{kind:'upper'});
 assert.equal(done.stoppedAtOpening,true);
 assert.ok(done.end.x<2.4 && done.end.x>2.35);
});
test('sink-to-stove gap is at least 45 cm measured from object edges',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:6,z:0}).items;
 items=G.placeCabinet(items,{x:.2,z:0},{x:5.8,z:0},{kind:'base'}).items;
 items=G.placeEquipment(items,{x:1,z:.3},'sink').items;
 assert.throws(()=>G.placeEquipment(items,{x:2,z:.3},'stove'),/۴۵ سانتی‌متر/);
 items=G.placeEquipment(items,{x:3,z:.3},'stove').items;
 const sink=items.find(x=>x.subtype==='sink'),stove=items.find(x=>x.subtype==='stove');
 assert.equal(sink.rotation,stove.rotation);
 assert.equal(items.filter(x=>x.kind==='equipment').length,3);
 const wrongModel=()=>G.editEquipment(items,sink.id,{model:'not-a-model'});
 assert.throws(wrongModel,/مدل تجهیزات نامعتبر/);
 items=G.editEquipment(items,sink.id,{model:'double'}).items;
 assert.equal(items.find(x=>x.id===sink.id).model,'double');
});
test('fridge integrates into a cabinet run, keeping both side cabinets',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:6,z:0}).items;
 items=G.placeCabinet(items,{x:.2,z:0},{x:2,z:0},{kind:'base'}).items;
 const integrated=G.placeEquipment(items,{x:1,z:.40},'fridge');
 assert.equal(integrated.items.find(x=>x.subtype==='fridge').builtIn,true);
 assert.ok(integrated.items.filter(x=>x.kind==='cabinet'&&x.subtype==='base').every(c=>G.lengthOf(c)>=.45),
  'no undersized side cabinet may survive fridge insertion');
 const done=G.placeEquipment(items,{x:3,z:.8},'fridge');
 const fridge=done.items.find(x=>x.subtype==='fridge');
 assert.ok(fridge.z>.4 && fridge.z<.5,'free fridge still snaps to the wall');
});
test('UI renders bottom controls, direct A/B drag, live corner ghost, and equipment model picker',()=>{
 const app=source('app.js'),floor=source('floor-ar.js'),plan=source('plan-view.js'),css=source('styles.css');
 assert.ok(app.indexOf('class="bottom-panel"')<app.indexOf('id="draw-controls"'));
 assert.match(app,/controls\.hidden=!drawing;/);
 assert.match(app,/data-action="equipment-model"/);
 assert.match(floor,/pickCalibrationHandle\(clientX,clientY\)/);
 assert.match(floor,/dragCalibrationPoint\(clientX,clientY,which\)/);
 assert.match(floor,/cabinetPath\(this\.items,a,snapped\)/);
 assert.match(plan,/cabinetPath\(items,start,target\)/);
 assert.match(css,/\.bottom-panel \.draw-controls/);
});

test('new drawing confirmation/cancellation flow covers walls, cabinets and equipment',()=>{
 const app=source('app.js'),css=source('styles.css');
 assert.match(app,/if\(action==='confirm-drawing'\)/);
 assert.match(app,/if\(action==='cancel-drawing'\)/);
 assert.match(app,/return placeAt\(point\)/);
 assert.match(app,/if\(mode==='2d'\)return hover\|\|null/);
 assert.match(app,/\['wall','base','upper'\]\.includes\(drawing\.tool\)/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
 assert.match(app,/controls\.hidden=!drawing;/);
 assert.doesNotMatch(app,/controls\.hidden=!drawing\|\|single/);
});
test('on-scene calibration grips rotate the 2D grid and persist AB across reopening',()=>{
 const app=source('app.js'),plan=source('plan-view.js'),floor=source('floor-ar.js');
 assert.match(plan,/patternTransform=/);
 assert.match(plan,/data-calibration=/);
 assert.match(app,/planCalibrationDrag/);
 assert.match(app,/p\.scene\.calibration/);
 assert.match(floor,/this\.net\.rotation\.z=-this\.gridYaw/);
 assert.match(floor,/view\.transform\.inverse\.matrix/);
 assert.match(floor,/beginCalibrationDrag/);
 assert.match(floor,/calibrationSnapshot/);
 assert.match(floor,/calibrationOffset/);
});
test('floor scanning restart remains accessible after leaving and returning to a project',()=>{
 const app=source('app.js'),css=source('styles.css');
 assert.match(app,/data-action="rescan">شروع \/ اسکن دوبارهٔ کف/);
 assert.match(app,/if\(action==='rescan'\)/);
 assert.match(app,/if\(floor\?\.session\)\{await floor\.scan\(\);\}/);
 assert.match(app,/else \{if\(floor\)\{floor\.cleanup\(\);floor=null;\}beginAR\(\);\}/);
 assert.match(app,/if\(floor!==instance\)return/);
 assert.match(css,/\.scan-card \.scan-restart/);
});
test('installed upper cabinets support 1cm top, sill and endpoint edits',async()=>{
 G||=await import('../apps/preview/geometry.js');
 const H=await import('../apps/preview/edit-handles.js');
 let items=G.placeWall([],{x:0,z:0},{x:5,z:0}).items;
 items=G.placeCabinetRoute(items,G.snapCabinetPoint(items,.5,0),G.snapCabinetPoint(items,2,0),
  {kind:'upper',height:.84,elevation:1.4}).items;
 const cabinet=items.find(x=>x.kind==='cabinet');
 assert.equal(cabinet.height,.84);assert.equal(cabinet.elevation,1.4);
 let raised=H.resizeFromHandle(items,cabinet.id,'top',{y:2.493}).items.find(x=>x.id===cabinet.id);
 assert.equal(raised.height,1.09);assert.equal(raised.elevation,1.4);
 let moved=H.resizeFromHandle(items,cabinet.id,'bottom',{y:1.6}).items.find(x=>x.id===cabinet.id);
 assert.equal(moved.elevation,1.6);assert.equal(moved.height,.64);
 let grown=H.resizeFromHandle(items,cabinet.id,'end',{along:2.2}).items.find(x=>x.id===cabinet.id);
 assert.ok(Math.abs(G.lengthOf(grown)-1.7)<.01);
 const panel=H.renderCabinetElevation(items,cabinet);
 assert.match(panel,/data-open-handle="top"/);
 assert.match(panel,/data-open-handle="bottom"/);
});
test('touch handles have large targets for selected cabinets and height editing',()=>{
 const plan=source('plan-view.js'),app=source('app.js'),floor=source('floor-ar.js');
 assert.match(plan,/class="resize-handle"/);
 assert.match(plan,/touchRadius/);
 assert.match(app,/renderCabinetElevation/);
 assert.match(floor,/mark\('top'/);
 assert.match(floor,/mark\('bottom'/);
 assert.match(floor,/distance=60/);
});

test('new stove sizes, induction toggle and sink widths are separately editable',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:8,z:0}).items;
 items=G.placeCabinet(items,{x:.2,z:0},{x:7.8,z:0},{kind:'base'}).items;
 items=G.placeEquipment(items,{x:1,z:.3},'stove').items;
 const stove=items.find(o=>o.subtype==='stove');
 assert.equal(stove.model,'gas5');
 assert.ok(stove.height<=.05);
 items=G.editEquipment(items,stove.id,{model:'gas2',induction:true}).items;
 assert.equal(items.find(o=>o.id===stove.id).width,.32);
 assert.equal(items.find(o=>o.id===stove.id).induction,true);
 items=G.placeEquipment(items,{x:4,z:.3},'sink').items;
 const sink=items.find(o=>o.subtype==='sink');
 items=G.editEquipment(items,sink.id,{sinkSize:120,model:'double'}).items;
 assert.equal(items.find(o=>o.id===sink.id).width,1.20);
 assert.equal(items.find(o=>o.id===sink.id).model,'double');
});
test('cabinet strokes close small corner gaps, and ignore tiny stray segments',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:3,z:0}).items;
 items=G.placeWall(items,{x:3,z:0},{x:3,z:3}).items;
 const a=G.snapCabinetPoint(items,.4,.05),b=G.snapCabinetPoint(items,2.79,.04);
 const done=G.placeCabinetRoute(items,a,b,{kind:'base'});
 const cabinet=done.items.find(o=>o.kind==='cabinet');
 assert.ok(cabinet.endT*G.lengthOf(items[0])>2.83);
 assert.throws(()=>G.placeCabinetRoute(items,G.snapCabinetPoint(items,2.49,0),G.snapCabinetPoint(items,2.78,0),{kind:'base'}),/مسیر کابینت کوتاه/);
});

test('continuous XR session is preserved between AR/2D and project overview',()=>{
 const app=source('app.js'),floor=source('floor-ar.js');
 assert.match(app,/sessionProjectId===target/);
 assert.match(app,/parkedEditor/);
 assert.doesNotMatch(app,/else \{closeFloor\(\);document\.getElementById\('scan-status'\)/);
 assert.match(floor,/cameraSideForWall\(w\)/);
 assert.match(app,/floor\.cameraSideForWall\(w\)/);
});
test('AR window manipulation projects touch deltas onto wall and displays elevation',()=>{
 const app=source('app.js'),floor=source('floor-ar.js');
 assert.match(floor,/dragScreenHandlePoint\(clientX,clientY,drag\)/);
 assert.match(floor,/this\.cameraSideForWall\(w\)\*\(w\.thickness\/2\+\.06\)/);
 assert.match(app,/floor\?\.dragScreenHandlePoint/);
 assert.match(app,/elevation\.hidden=!\(isPlan\|\|mode==='ar'\)/);
 assert.match(app,/floor\?\.setEditPreview\(items,selection/);
});
test('floor calibration collapses and reopens both calibration panel and A/B grips',()=>{
 const app=source('app.js'),floor=source('floor-ar.js'),plan=source('plan-view.js');
 assert.match(app,/data-action="toggle-calibration"/);
 assert.match(app,/calibrationCollapsed=true;updateCalibrationPanel/);
 assert.match(floor,/setCalibrationVisible\(visible\)/);
 assert.match(plan,/showCalibration=true/);
});
test('built-in appliances carve a cabinet bay; stove always creates a separately editable hood',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:8,z:0}).items;
 items=G.placeCabinet(items,{x:.2,z:0},{x:7.8,z:0},{kind:'base'}).items;
 items=G.placeEquipment(items,{x:1,z:.34},'stove').items;
 const stove=items.find(o=>o.subtype==='stove'),hood=items.find(o=>o.subtype==='hood');
 assert.equal(hood.linkedStoveId,stove.id);
 items=G.editEquipment(items,hood.id,{model:'angled'}).items;
 assert.equal(items.find(o=>o.id===hood.id).model,'angled');
 items=G.placeEquipment(items,{x:3,z:.34},'dishwasher').items;
 assert.equal(items.find(o=>o.subtype==='dishwasher').builtIn,true);
 items=G.placeEquipment(items,{x:5,z:.34},'washer').items;
 assert.equal(items.find(o=>o.subtype==='washer').builtIn,true);
 items=G.placeEquipment(items,{x:6.5,z:.34},'oven').items;
 assert.equal(items.find(o=>o.subtype==='oven').builtIn,true);
 assert.ok(items.filter(o=>o.kind==='cabinet').every(c=>G.lengthOf(c)>=.45));
 items=G.removeObject(items,stove.id).items;
 assert.equal(items.some(o=>o.subtype==='hood'),false);
});
test('fridge capacity and side-by-side model change physical dimensions',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeEquipment([],{x:1,z:2},'fridge').items;
 const id=items[0].id,before=items[0].width;
 items=G.editEquipment(items,id,{model:'side',fridgeFeet:30}).items;
 assert.equal(items[0].fridgeFeet,30);
 assert.ok(items[0].width>before);
 assert.ok(items[0].depth>.72);
 assert.equal(items[0].model,'side');
});
test('no cabinet segment shorter than 45cm, including resizing',async()=>{
 G||=await import('../apps/preview/geometry.js');
 const H=await import('../apps/preview/edit-handles.js');
 let items=G.placeWall([],{x:0,z:0},{x:3,z:0}).items;
 assert.throws(()=>G.placeCabinet(items,{x:.2,z:0},{x:.55,z:0},{kind:'base'}),/۴۵ سانتی‌متر/);
 items=G.placeCabinet(items,{x:.2,z:0},{x:1.2,z:0},{kind:'base'}).items;
 const cabinet=items.find(o=>o.kind==='cabinet');
 const changed=H.resizeFromHandle(items,cabinet.id,'end',{along:.3}).items.find(o=>o.id===cabinet.id);
 assert.ok(G.lengthOf(changed)>=.45-1e-6);
});

test('built-in refrigerator stays 70cm clear of a connected corner wall',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:4,z:0}).items;
 items=G.placeWall(items,{x:0,z:0},{x:0,z:4}).items;
 items=G.placeCabinet(items,{x:.15,z:0,side:1},{x:3.85,z:0}).items;
 const result=G.placeEquipment(items,{x:.25,z:.40},'fridge');
 const fridge=result.items.find(o=>o.subtype==='fridge');
 assert.ok(fridge.builtIn);
 assert.ok(fridge.x-fridge.width/2-.055/2>=.70-1e-6);
 assert.ok(result.items.filter(o=>o.kind==='cabinet').every(c=>G.lengthOf(c)>=.45));
});

test('facade-first planning supports doors, three drawers, four drawers and mixed layouts',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:4,z:0}).items;
 items=G.placeCabinet(items,{x:.1,z:0,side:1},{x:3.9,z:0}).items;
 const c=items.find(o=>o.kind==='cabinet');
 for(const preset of ['doors','drawers3','drawers4','mixed']){
  const result=G.placeFrontLayout(items,c.id,preset);
  const fronts=result.items.filter(o=>o.kind==='front'&&o.hostId===c.id);
  assert.ok(fronts.length>=4);
  assert.ok(fronts.every(o=>o.startT>=0&&o.endT<=1&&o.bottomT>=0&&o.topT<=1));
  assert.ok(fronts.every(o=>G.frontPose(o,c).width>=.15));
  if(preset==='doors')assert.ok(fronts.every(o=>o.subtype==='door'));
  if(preset==='drawers3'||preset==='drawers4')assert.ok(fronts.every(o=>o.subtype==='drawer'));
  if(preset==='mixed')assert.ok(fronts.some(o=>o.subtype==='door')&&fronts.some(o=>o.subtype==='drawer'));
  const again=G.placeFrontLayout(result.items,c.id,preset);
  assert.equal(again.items.filter(o=>o.kind==='front').length,fronts.length,'preset replaces existing panels');
 }
});
test('cabinet facade seam grip snaps to centimetres and adjusts adjoining door',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:3,z:0}).items;
 items=G.placeCabinet(items,{x:.1,z:0,side:1},{x:2.9,z:0}).items;
 const c=items.find(o=>o.kind==='cabinet');
 items=G.placeFrontLayout(items,c.id,'doors').items;
 const f=items.find(o=>o.kind==='front');
 const neighbor=items.find(o=>o.kind==='front'&&Math.abs(o.startT-f.endT)<.00001&&
  o.bottomT===f.bottomT&&o.id!==f.id);
 assert.ok(neighbor,'split door has a partner');
 const requested=Math.round(((f.endT-f.startT)*G.lengthOf(c)-.02)*100)/100;
 const result=G.editFront(items,f.id,{width:requested,finish:'wood',handleStyle:'hidden'});
 const changed=result.items.find(o=>o.id===f.id),next=result.items.find(o=>o.id===neighbor.id);
 assert.ok(Math.abs((changed.endT-changed.startT)*G.lengthOf(c)-requested)<.00001);
 assert.ok(Math.abs(changed.endT-next.startT)<.00001,'shared seam stays joined');
 assert.equal(changed.finish,'wood');
 assert.equal(changed.handleStyle,'hidden');
 assert.throws(()=>G.editFront(items,f.id,{width:2}),/نما|درب|کشو/);
});
test('fronts follow cabinet resize and embedded refrigerator without breaking envelope',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:5.5,z:0}).items;
 items=G.placeCabinet(items,{x:.05,z:0,side:1},{x:5.45,z:0}).items;
 const c=items.find(o=>o.kind==='cabinet');
 items=G.placeFrontLayout(items,c.id,'mixed').items;
 const resized=G.editCabinet(items,c.id,{length:5.2});
 assert.ok(resized.items.some(o=>o.kind==='front'&&o.hostId===c.id));
 const fridge=G.placeEquipment(items,{x:2.7,z:.34},'fridge').items;
 assert.ok(fridge.some(o=>o.subtype==='fridge'&&o.builtIn));
 assert.ok(fridge.filter(o=>o.kind==='cabinet').every(o=>G.lengthOf(o)>=.45));
 assert.ok(fridge.some(o=>o.kind==='front'),'unaffected segments keep their facades');
});
test('cabinet upper front accepts doors but does not accept drawers',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:3,z:0}).items;
 items=G.placeCabinet(items,{x:.1,z:0,side:1},{x:2.9,z:0},{kind:'upper',elevation:1.55,height:.72}).items;
 const c=items.find(o=>o.kind==='cabinet');
 assert.equal(c.subtype,'upper');
 assert.ok(G.placeFrontLayout(items,c.id,'doors').items.some(o=>o.kind==='front'));
 assert.throws(()=>G.placeFrontLayout(items,c.id,'drawers3'),/زمینی/);
});
