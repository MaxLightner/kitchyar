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
test('legible controls and compact measurement labels coexist with bottom drawing controls',()=>{
 const css=source('styles.css'),app=source('app.js');
 for(const match of css.matchAll(/font(?:-size)?:\s*(\d+(?:\.\d+)?)px/g))
  assert.ok(Number(match[1])>=13,'font below 13px: '+match[0]);
 assert.match(css,/button,input,small,label,\.drawing-hint,\.scan-card small\{font-size:15px\}/);
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
 assert.throws(()=>H.resizeFromHandle(items,op.id,'top',{y:3.91}),/بازشو|دیوار/);
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
 assert.match(plan,/placeCabinetRoute\(items,start,target,/);
 assert.match(css,/\.bottom-panel \.draw-controls/);
});

test('new drawing confirmation/cancellation flow covers walls, cabinets and equipment',()=>{
 const app=source('app.js'),css=source('styles.css');
 assert.match(app,/if\(action==='confirm-drawing'\)/);
 assert.match(app,/if\(action==='cancel-drawing'\)/);
 assert.match(app,/return placeAt\(point\)/);
 assert.match(app,/if\(mode==='2d'\)return hover\|\|null/);
 assert.match(app,/\['wall','base','upper','tall'\]\.includes\(drawing\.tool\)/);
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
 assert.match(app,/elevation\.hidden=!\(isPlan\|\|trackedView\(\)\)/);
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

test('built-in refrigerator can reach a connected corner with only physical-wall clearance',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:4,z:0}).items;
 items=G.placeWall(items,{x:0,z:0},{x:0,z:4}).items;
 items=G.placeCabinet(items,{x:.15,z:0,side:1},{x:3.85,z:0}).items;
 const result=G.placeEquipment(items,{x:.25,z:.40},'fridge');
 const fridge=result.items.find(o=>o.subtype==='fridge');
 assert.ok(fridge.builtIn);
 assert.ok(fridge.x-fridge.width/2>=.06,'fridge does not intersect the perpendicular wall');
 assert.ok(fridge.x-fridge.width/2<.15,'fridge can sit against the corner without a 70cm gap');
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

test('smart kitchen plans two sink doors, graduated hob drawers and overhead lift-up',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:5,z:0}).items;
 items=G.placeCabinet(items,{x:.1,z:0,side:1},{x:4.9,z:0}).items;
 const base=items.find(o=>o.subtype==='base');
 items=G.placeCabinet(items,{x:.1,z:0,side:1},{x:4.9,z:0},{kind:'upper'}).items;
 const upper=items.find(o=>o.subtype==='upper');
 items=G.placeEquipment(items,{x:1.23,z:.35},'sink').items;
 items=G.placeEquipment(items,{x:3.5,z:.35},'stove').items;
 const result=G.planSmartKitchen(items),fronts=result.items.filter(o=>o.kind==='front');
 const sink=result.items.find(e=>e.subtype==='sink'),stove=result.items.find(e=>e.subtype==='stove');
 const belowSink=fronts.filter(f=>f.hostId===base.id&&f.startT<=sink.offsetT&&f.endT>=sink.offsetT);
 assert.equal(belowSink.length,2,'sink requires two swing leaves');
 assert.ok(belowSink.every(f=>f.subtype==='door'));
 const belowHob=fronts.filter(f=>f.hostId===base.id&&f.startT<=stove.offsetT&&f.endT>=stove.offsetT);
 assert.equal(belowHob.length,3);
 assert.ok(belowHob.every(f=>f.subtype==='drawer'));
 const heights=belowHob.map(f=>f.topT-f.bottomT);
 assert.ok(heights[0]>heights[1]&&heights[1]>heights[2],'bottom drawer deepest');
 assert.ok(fronts.some(f=>f.hostId===upper.id&&f.hinge==='top'),'over-sink unit lifts horizontally');
 assert.ok(Math.abs(sink.x-1.23)<=.0251,'smart modular alignment moves equipment only slightly');
 assert.ok(items.every(o=>o.kind!=='front'),'preview/planner leaves source untouched');
});
test('facade presets include two/three/four equal drawers and inverted drawer-plus-doors',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:1,z:0}).items;
 items=G.placeCabinet(items,{x:.1,z:0,side:1},{x:.9,z:0}).items;
 const c=items.find(o=>o.kind==='cabinet');
 for(const [preset,rows] of [['drawers2',2],['drawers3',3],['drawers4',4]]){
  const fronts=G.planFronts(items,c,preset);
  assert.equal(fronts.length,rows);
  assert.ok(fronts.every(f=>f.subtype==='drawer'&&Math.abs((f.topT-f.bottomT)-1/rows)<1e-6));
 }
 const grad=G.planFronts(items,c,'graduated');
 assert.ok(grad[0].topT-grad[0].bottomT>grad[1].topT-grad[1].bottomT);
 const low=G.planFronts(items,c,'mixedLower');
 assert.equal(low[0].subtype,'door');assert.equal(low.at(-1).subtype,'drawer');
 assert.equal(low.at(-1).bottomT,0);
 const top=G.planFronts(items,c,'mixed');
 assert.equal(top.at(-1).topT,1);
});
test('sink and hob make actual centimetre-defined worktop cutouts',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:5,z:0}).items;
 items=G.placeCabinet(items,{x:.1,z:0,side:1},{x:4.9,z:0}).items;
 const c=items.find(o=>o.kind==='cabinet');
 items=G.placeEquipment(items,{x:1.1,z:.35},'sink').items;
 items=G.placeEquipment(items,{x:3.5,z:.35},'stove').items;
 const cuts=G.countertopCutouts(items,c);
 assert.equal(cuts.length,2);
 for(const h of cuts){
  assert.ok(h.width>0&&h.depth>0&&h.cutDepth>0);
  assert.ok(Math.abs(Math.round(h.width*100)-h.width*100)<1e-8);
  assert.ok(h.left>=0&&h.right>=0);
 }
 assert.equal(G.countertopCutouts(items,{...c,subtype:'upper'}).length,0);
});
test('refrigerator gets an overhead cupboard that can adopt its own depth',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:5,z:0}).items;
 items=G.placeCabinet(items,{x:.1,z:0,side:1},{x:4.9,z:0}).items;
 items=G.placeEquipment(items,{x:2,z:.4},'fridge').items;
 const fridge=items.find(o=>o.subtype==='fridge');
 const overhead=items.find(o=>o.subtype==='over-fridge');
 assert.ok(overhead,'overhead cabinet automatically added when wall has room');
 assert.equal(overhead.depth,.60);
 assert.ok(items.some(f=>f.kind==='front'&&f.hostId===overhead.id));
 const changed=G.addOverFridgeCabinet(items,fridge.id,{depth:fridge.depth});
 assert.equal(changed.items.find(o=>o.id===overhead.id).depth,fridge.depth);
 assert.equal(changed.items.filter(o=>o.subtype==='over-fridge').length,1);
});
test('vertical shelf bridges base/upper and tracks bulk upper height changes',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:5,z:0}).items;
 items=G.placeCabinet(items,{x:.1,z:0,side:1},{x:4.9,z:0}).items;
 const base=items.find(o=>o.subtype==='base');
 items=G.placeCabinet(items,{x:.1,z:0,side:1},{x:4.9,z:0},{kind:'upper'}).items;
 const upper=items.find(o=>o.subtype==='upper');
 items=G.addVerticalBridge(items,upper.id,{edge:'end',depthMode:'base'}).items;
 const bridge=items.find(o=>o.subtype==='bridge');
 assert.ok(bridge);
 assert.equal(bridge.depth,base.depth);
 const modified=G.applyAllUpperHeights(items,{elevation:1.70,height:.60}).items;
 assert.equal(modified.find(o=>o.id===upper.id).elevation,1.70);
 assert.ok(modified.find(o=>o.id===bridge.id).height>bridge.height);
 const onlyOne=G.editCabinet(items,upper.id,{elevation:1.65}).items;
 assert.ok(onlyOne.find(o=>o.id===bridge.id).height>bridge.height,'single upper resize keeps bridge connected');
});
test('cabinet pointer snaps to neighboring cabinet edges without gaps',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:4,z:0}).items;
 items=G.placeCabinet(items,{x:.1,z:0,side:1},{x:1.5,z:0}).items;
 const first=items.find(o=>o.kind==='cabinet');
 items=G.placeCabinet(items,{x:1.6,z:0,side:1},{x:3,z:0}).items;
 const second=items.find(o=>o.kind==='cabinet'&&o.id!==first.id);
 const snapped=G.snapCabinetPoint(items,1.56,0,.8);
 assert.ok(Math.abs(snapped.x-1.6)<1e-6&&snapped.edgeSnap);
 const moved=G.moveCabinetEndpoint(items,first.id,false,1.56,0).items;
 assert.ok(Math.abs(moved.find(o=>o.id===first.id).endT-second.startT)<1e-6);
});

test('a built-in oven stays directly under the hob in the same cabinet, in either placement order',async()=>{
 G||=await import('../apps/preview/geometry.js');
 for(const order of [['oven','stove'],['stove','oven']]){
  let items=G.placeWall([],{x:0,z:0},{x:5,z:0}).items;
  items=G.placeCabinet(items,{x:.1,z:0,side:1},{x:4.9,z:0}).items;
  for(const type of order)items=G.placeEquipment(items,{x:2.4,z:.34},type).items;
  const oven=items.find(e=>e.subtype==='oven'),hob=items.find(e=>e.subtype==='stove');
  assert.equal(oven.hostId,hob.hostId);
  assert.ok(Math.abs(oven.x-hob.x)<.025,'stove does not jump to adjacent cabinet');
  assert.equal(oven.builtIn,true);
  const manual=G.planFronts(items,items.find(c=>c.id===hob.hostId),'drawers3');
  assert.equal(manual.filter(f=>f.startT<=hob.offsetT&&f.endT>=hob.offsetT).length,0,'manual layout cannot cover oven');
  const smart=G.planSmartKitchen(items).items;
  assert.equal(smart.filter(f=>f.kind==='front'&&f.hostId===hob.hostId&&
   f.startT<=hob.offsetT&&f.endT>=hob.offsetT).length,0,'oven aperture remains uncovered');
 }
});
test('dishwasher and washer fit below one uncut full-length worktop and restore facades after deletion',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:8,z:0}).items;
 items=G.placeCabinet(items,{x:.2,z:0},{x:7.8,z:0},{kind:'base'}).items;
 const cabinet=items.find(o=>o.kind==='cabinet');
 items=G.placeEquipment(items,{x:2,z:.33},'dishwasher').items;
 items=G.placeEquipment(items,{x:4,z:.33},'washer').items;
 assert.equal(items.filter(o=>o.kind==='cabinet').length,1,'machines never split the host cabinet');
 assert.equal(G.countertopCutouts(items,cabinet).length,0,'the whole stone top is uncut');
 const fixtures=items.filter(o=>['washer','dishwasher'].includes(o.subtype));
 for(const e of fixtures){
  assert.equal(e.hostId,cabinet.id);
  assert.ok(e.elevation+e.height<=cabinet.elevation+cabinet.height-.019);
 }
 items=G.placeFrontLayout(items,cabinet.id,'doors').items;
 for(const e of fixtures){
  const now=items.find(o=>o.id===e.id);
  assert.equal(items.filter(f=>f.kind==='front'&&f.startT<now.offsetT&&f.endT>now.offsetT).length,0);
 }
 const moved=G.moveEquipment(items,fixtures[0].id,{x:6,z:.33});
 items=moved.items;
 assert.equal(moved.selectedId,fixtures[0].id);
 assert.equal(items.filter(o=>o.kind==='cabinet').length,1);
 assert.equal(G.countertopCutouts(items,cabinet).length,0);
 items=G.removeObject(items,fixtures[0].id).items;
 assert.ok(items.some(f=>f.kind==='front'&&f.startT<6/7.6&&f.endT>6/7.6),'a missing appliance bay gains cabinet doors');
});
test('sink and stove move atomically with fresh cutouts and a hood follows the stove',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:8,z:0}).items;
 items=G.placeCabinet(items,{x:.2,z:0},{x:7.8,z:0},{kind:'base'}).items;
 const base=items.find(o=>o.kind==='cabinet');
 items=G.placeEquipment(items,{x:1.3,z:.32},'stove').items;
 items=G.placeEquipment(items,{x:5.2,z:.32},'sink').items;
 const stove=items.find(e=>e.subtype==='stove'),hood=items.find(e=>e.subtype==='hood');
 const before=G.countertopCutouts(items,base).find(c=>c.id===stove.id).left;
 items=G.moveEquipment(items,stove.id,{x:2.4,z:.32}).items;
 assert.notEqual(G.countertopCutouts(items,base).find(c=>c.id===stove.id).left,before);
 assert.equal(items.find(e=>e.id===hood.id).linkedStoveId,stove.id);
 assert.ok(Math.abs(items.find(e=>e.id===hood.id).x-items.find(e=>e.id===stove.id).x)<.001);
 const sink=items.find(e=>e.subtype==='sink');
 items=G.removeObject(items,sink.id).items;
 assert.equal(G.countertopCutouts(items,base).length,1,'the old sink cutout is healed');
 assert.throws(()=>G.moveEquipment(items,stove.id,{x:100,z:100}),/کابینت/);
});
test('sample kitchen styles recalculate real facade bays without covering appliances',async()=>{
 G||=await import('../apps/preview/geometry.js');
 for(const sample of ['modern-oak','soft-cream','graphite','walnut-sage']){
  let items=G.placeWall([],{x:0,z:0},{x:5,z:0}).items;
  items=G.placeCabinet(items,{x:.2,z:0},{x:4.8,z:0},{kind:'base'}).items;
  items=G.placeEquipment(items,{x:2.1,z:.32},'dishwasher').items;
  const e=items.find(o=>o.subtype==='dishwasher');
  items=G.applyKitchenLayout(items,sample).items;
  assert.ok(items.some(o=>o.kind==='front'));
  assert.ok(items.every(f=>f.kind!=='front'||!(f.startT<e.offsetT&&f.endT>e.offsetT)));
 }
});
test('oblique shared wall caps meet on both sides without protruding square ends',async()=>{
 G||=await import('../apps/preview/geometry.js');
 for(const degrees of [45,60,90,120,135]){
  const radians=degrees*Math.PI/180;
  let items=G.placeWall([],{x:0,z:0},{x:3,z:0}).items;
  items=G.placeWall(items,{x:0,z:0},{x:3*Math.cos(radians),z:3*Math.sin(radians)}).items;
  const [a,b]=items.filter(i=>i.kind==='wall');
  const pa=G.wallFootprint(a,items),pb=G.wallFootprint(b,items);
  assert.ok(Math.hypot(pa[0].x-pb[3].x,pa[0].z-pb[3].z)<1e-5,`inside ${degrees}°`);
  assert.ok(Math.hypot(pa[3].x-pb[0].x,pa[3].z-pb[0].z)<1e-5,`outside ${degrees}°`);
 }
});
test('sample style can be chosen before any cabinets exist',async()=>{
 G||=await import('../apps/preview/geometry.js');
 assert.deepEqual(G.applyKitchenLayout([],'modern-oak').items,[]);
});
test('facade paint supports one, connected, layer and framed inserts',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:5,z:0}).items;
 items=G.placeCabinet(items,{x:.1,z:0},{x:1.5,z:0}).items;
 items=G.placeCabinet(items,{x:1.5,z:0},{x:3,z:0}).items;
 items=G.placeCabinet(items,{x:.1,z:0},{x:1.5,z:0},{kind:'upper'}).items;
 items=G.applyKitchenLayout(items,'soft-cream').items;
 const all=items.filter(f=>f.kind==='front'),first=all.find(f=>items.some(c=>c.id===f.hostId&&c.subtype==='base'));
 let result=G.paintFronts(items,first.id,{scope:'single',materialId:'oak'});
 assert.equal(result.items.filter(f=>f.materialId==='oak').length,1);
 result=G.paintFronts(items,first.id,{scope:'connected',materialId:'walnut'});
 assert.ok(result.items.filter(f=>f.materialId==='walnut').length>1);
 assert.ok(result.items.filter(f=>f.materialId==='walnut').every(f=>items.find(c=>c.id===f.hostId)?.subtype==='base'));
 result=G.paintFronts(items,first.id,{scope:'layer',part:'frame',materialId:'graphite-matte'});
 assert.ok(result.items.some(f=>f.style==='frame'&&f.frameMaterialId==='graphite-matte'));
 assert.ok(result.items.filter(f=>items.find(c=>c.id===f.hostId)?.subtype==='upper').every(f=>f.frameMaterialId!=='graphite-matte'));
 const resized=G.editCabinet(result.items,first.hostId,{height:.88}).items;
 assert.ok(resized.some(f=>f.kind==='front'&&f.frameMaterialId==='graphite-matte'),
  'frame finish survives a cabinet resize');
 result=G.paintFronts(items,first.id,{scope:'all',materialId:'sage-matte'});
 assert.equal(result.items.filter(f=>f.materialId==='sage-matte').length,all.length);
});
test('connected kitchen fronts align nearby horizontal drawer rails without moving other rows',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:4,z:0}).items;
 items=G.placeCabinet(items,{x:.2,z:0},{x:1.4,z:0}).items;
 items=G.placeCabinet(items,{x:1.4,z:0},{x:2.6,z:0}).items;
 const [first,second]=items.filter(o=>o.kind==='cabinet');
 items=G.placeFrontLayout(items,first.id,'drawers3').items;
 items=G.placeFrontLayout(items,second.id,'mixedLower').items;
 const beforeA=items.find(f=>f.kind==='front'&&f.hostId===first.id&&Math.abs(f.topT-1/3)<.001);
 const beforeB=items.find(f=>f.kind==='front'&&f.hostId===second.id&&Math.abs(f.topT-.28)<.001);
 assert.ok(beforeA&&beforeB);
 assert.ok(Math.abs(beforeA.topT-beforeB.topT)>.04);
 const aligned=G.alignFrontSeams(items);
 assert.ok(aligned.alignedCount>=2);
 const a=aligned.items.find(f=>f.id===beforeA.id),b=aligned.items.find(f=>f.id===beforeB.id);
 assert.ok(Math.abs(a.topT-b.topT)<1e-5,'matching horizontal rails share the same elevation');
 assert.ok(aligned.items.every(f=>f.kind!=='front'||f.topT>f.bottomT));
});
test('one manually resized front anchors adjoining cabinets, and survives a style change',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:4,z:0}).items;
 items=G.placeCabinet(items,{x:.2,z:0},{x:1.4,z:0}).items;
 items=G.placeCabinet(items,{x:1.4,z:0},{x:2.6,z:0}).items;
 const [first,second]=items.filter(o=>o.kind==='cabinet');
 items=G.placeFrontLayout(items,first.id,'drawers3').items;
 items=G.placeFrontLayout(items,second.id,'drawers3').items;
 const front=items.find(f=>f.hostId===first.id&&f.part===0);
 items=G.editFront(items,front.id,{height:.29}).items;
 const anchor=items.find(f=>f.id===front.id).topT;
 items=G.alignFrontSeams(items).items;
 assert.ok(Math.abs(items.find(f=>f.id===front.id).topT-anchor)<1e-6);
 assert.ok(items.some(f=>f.hostId===second.id&&Math.abs(f.topT-anchor)<1e-5),
  'neighboring cabinet follows the manually moved rail');
 items=G.applyKitchenLayout(items,'modern-oak').items;
 assert.equal(items.find(c=>c.id===first.id).frontPreset,'custom');
 assert.ok(Math.abs(items.find(f=>f.id===front.id).topT-anchor)<1e-6);
});
test('global, connected and individual front rules have distinct precedence',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:6,z:0}).items;
 items=G.placeCabinet(items,{x:.2,z:0},{x:1.4,z:0}).items;
 items=G.placeCabinet(items,{x:1.4,z:0},{x:2.6,z:0}).items;
 items=G.placeCabinet(items,{x:3.2,z:0},{x:4.4,z:0}).items;
 const [first,second,third]=items.filter(o=>o.kind==='cabinet');
 for(const c of [first,second,third])items=G.placeFrontLayout(items,c.id,'doors').items;
 const global={...G.DEFAULT_FRONT_RULES,maxDoorWidth:.48,minDoorWidth:.22,handleStyle:'knob'};
 let change=G.configureFrontRules(items,global,{scope:'global'});items=change.items;
 assert.equal(change.frontRules.maxDoorWidth,.48);
 const firstLeaves=items.filter(f=>f.kind==='front'&&f.hostId===first.id);
 assert.ok(firstLeaves.length>=3&&firstLeaves.every(f=>G.frontPose(f,first).width<=.48),
  'maximum width remains enforced without manufacturing extra half-sized leaves');
 const group={...global,gap:.008,handleStyle:'hidden',singleHinge:'right'};
 items=G.configureFrontRules(items,group,{scope:'connected',targetId:first.id}).items;
 assert.equal(items.find(c=>c.id===second.id).frontRuleOverrides.gap,.008);
 assert.equal(items.find(c=>c.id===third.id).frontRuleOverrides,undefined);
 const changedFront=items.find(f=>f.kind==='front'&&f.hostId===first.id);
 items=G.editFront(items,changedFront.id,{hinge:'left',handleStyle:'bar',gap:.011}).items;
 items=G.configureFrontRules(items,{...global,gap:.004,handleStyle:'knob'},{scope:'global'}).items;
 const pinned=items.find(f=>f.id===changedFront.id);
 assert.equal(pinned.handleStyle,'bar');assert.equal(pinned.hinge,'left');assert.equal(pinned.gap,.011);
 assert.equal(items.find(f=>f.kind==='front'&&f.hostId===second.id).gap,.008);
 assert.equal(items.find(f=>f.kind==='front'&&f.hostId===third.id).gap,.004);
 items=G.applyKitchenLayout(items,'graphite').items;
 assert.equal(items.find(f=>f.id===changedFront.id)?.handleStyle,'bar');
 assert.equal(items.find(f=>f.id===changedFront.id)?.hinge,'left');
 assert.equal(items.find(f=>f.id===changedFront.id)?.gap,.011);
});
test('front gap rule changes 3D panel size, and invalid rule combinations are rejected',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:3,z:0}).items;
 items=G.placeCabinet(items,{x:.2,z:0},{x:1.4,z:0}).items;
 const c=items.find(o=>o.kind==='cabinet');
 items=G.placeFrontLayout(items,c.id,'doors').items;
 const front=items.find(f=>f.kind==='front');
 const original=G.frontPose(front,c).width;
 items=G.configureFrontRules(items,{...G.DEFAULT_FRONT_RULES,gap:.01},{scope:'global'}).items;
 const changed=items.find(f=>f.id===front.id);
 assert.ok(G.frontPose(changed,c).width<original-.006);
 assert.throws(()=>G.configureFrontRules(items,{...G.DEFAULT_FRONT_RULES,minDoorWidth:.70,maxDoorWidth:.55}),/حداقل/);
});
test('decorative cabinet trim has validated per-cabinet and connected-group settings',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:5,z:0}).items;
 items=G.placeCabinet(items,{x:.2,z:0},{x:1.2,z:0}).items;
 items=G.placeCabinet(items,{x:1.2,z:0},{x:2.2,z:0}).items;
 items=G.placeCabinet(items,{x:3,z:0},{x:4,z:0}).items;
 const [first,second,third]=items.filter(x=>x.kind==='cabinet');
 const old=structuredClone(items);
 items=G.styleCabinetDecor(items,first.id,{toeKick:'flush',endPanel:'framed',crown:'modern',wallFiller:'auto',pilaster:'slim',trim:'both'},{scope:'connected'}).items;
 assert.equal(items.find(x=>x.id===second.id).decor.trim,'both');
 assert.equal(items.find(x=>x.id===third.id).decor,undefined);
 items=G.styleCabinetDecor(items,second.id,{crown:'classic'},{scope:'single'}).items;
 assert.equal(items.find(x=>x.id===first.id).decor.crown,'modern');
 assert.equal(items.find(x=>x.id===second.id).decor.crown,'classic');
 assert.equal(old.find(x=>x.id===first.id).decor,undefined,'source data remains immutable');
 assert.throws(()=>G.styleCabinetDecor(items,first.id,{toeKick:'invalid'}),/معتبر نیست/);
});
test('full-height tower houses oven plus microwave in distinct heights and restores fronts after removal',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:4,z:0}).items;
 items=G.placeCabinet(items,{x:.2,z:0},{x:.95,z:0},{kind:'tall'}).items;
 const tower=items.find(x=>x.subtype==='tall');
 assert.equal(tower.height,2.15);
 items=G.placeFrontLayout(items,tower.id,'doors').items;
 items=G.placeEquipment(items,{x:.55,z:.32},'oven').items;
 items=G.placeEquipment(items,{x:.55,z:.32},'microwave').items;
 const oven=items.find(e=>e.subtype==='oven'),micro=items.find(e=>e.subtype==='microwave');
 assert.ok(oven.builtIn&&micro.builtIn);
 assert.equal(oven.hostId,tower.id);assert.equal(micro.hostId,tower.id);
 assert.ok(oven.elevation+oven.height<micro.elevation,'oven and microwave do not overlap vertically');
 assert.equal(G.countertopCutouts(items,tower).length,0);
 const front=items.filter(f=>f.kind==='front'&&f.hostId===tower.id);
 assert.ok(front.some(f=>f.topT*tower.height+tower.elevation<=oven.elevation+.001));
 assert.ok(front.some(f=>f.bottomT*tower.height+tower.elevation>=micro.elevation+micro.height-.001));
 assert.ok(front.every(f=>f.topT*tower.height+tower.elevation<=oven.elevation+.001||
  f.bottomT*tower.height+tower.elevation>=oven.elevation+oven.height-.001));
 assert.throws(()=>G.editCabinet(items,tower.id,{height:1.8}),/ارتفاع ستون|ستون تمام/);
 items=G.removeObject(items,micro.id).items;
 assert.ok(items.filter(f=>f.kind==='front'&&f.hostId===tower.id).some(f=>
  f.bottomT*tower.height+tower.elevation<=micro.elevation+.001&&
  f.topT*tower.height+tower.elevation>=micro.elevation+micro.height-.001),
  'removed microwave opening is rebuilt as a cabinet door');
});
test('integrated dishwasher/washing machine facade survives movement and does not cut stone',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:6,z:0}).items;
 items=G.placeCabinet(items,{x:.2,z:0},{x:5.8,z:0}).items;
 const host=items.find(c=>c.kind==='cabinet');
 items=G.placeEquipment(items,{x:1.2,z:.32},'dishwasher').items;
 const machine=items.find(e=>e.subtype==='dishwasher');
 items=G.styleEquipmentFacade(items,machine.id,'matched').items;
 assert.equal(items.find(e=>e.id===machine.id).facadeMode,'matched');
 items=G.moveEquipment(items,machine.id,{x:3,z:.32}).items;
 assert.equal(items.find(e=>e.id===machine.id).facadeMode,'matched');
 assert.equal(G.countertopCutouts(items,host).length,0);
 items=G.styleEquipmentFacade(items,machine.id,'concealed').items;
 assert.equal(items.find(e=>e.id===machine.id).facadeMode,'concealed');
 assert.throws(()=>G.styleEquipmentFacade(items,machine.id,'invalid'),/قابل تغییر نیست/);
});
test('drawing one long tall cabinet run creates multiple valid full-height columns',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:5,z:0}).items;
 const wall=items.find(o=>o.kind==='wall');
 items=G.placeCabinetRoute(items,{x:.2,z:0,hostId:wall.id,side:1},{x:2.75,z:0,hostId:wall.id},{kind:'tall'}).items;
 const towers=items.filter(c=>c.subtype==='tall');
 assert.equal(towers.length,3);
 assert.ok(towers.every(c=>G.lengthOf(c)>=.45&&G.lengthOf(c)<=.90+1e-5&&c.height>=1.8));
 assert.ok(towers.every(c=>c.cornerGroup===towers[0].cornerGroup));
});
test('countertop edge, waterfall, raised bar, seat overhang and curves remain semantic and cutout-safe',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:6,z:0}).items;
 items=G.placeCabinet(items,{x:.2,z:0},{x:2.2,z:0}).items;
 items=G.placeCabinet(items,{x:2.2,z:0},{x:4.2,z:0}).items;
 const [first,second]=items.filter(c=>c.kind==='cabinet');
 items=G.placeEquipment(items,{x:1,z:.33},'sink').items;
 const before=G.countertopCutouts(items,first).map(c=>({...c}));
 const source=structuredClone(items);
 const settings={edge:'round',waterfall:'both',overhang:.3,raisedHeight:.15,cornerRadius:.10,curve:.08};
 items=G.styleCountertop(items,first.id,settings,{scope:'connected'}).items;
 assert.equal(items.find(c=>c.id===first.id).countertopDesign.edge,'round');
 assert.equal(items.find(c=>c.id===second.id).countertopDesign.waterfall,'both');
 assert.deepEqual(G.countertopCutouts(items,items.find(c=>c.id===first.id)),before);
 assert.equal(source.find(c=>c.id===first.id).countertopDesign,undefined);
 items=G.styleCountertop(items,second.id,{edge:'thick',overhang:.45},{scope:'single'}).items;
 assert.equal(items.find(c=>c.id===first.id).countertopDesign.edge,'round');
 assert.equal(items.find(c=>c.id===second.id).countertopDesign.edge,'thick');
 assert.throws(()=>G.styleCountertop(items,first.id,{curve:5}),/معتبر نیست/);
});
test('specialized kitchen spaces are parameterized, removable, and reject equipment conflicts',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:5,z:0}).items;
 items=G.placeCabinet(items,{x:.2,z:0},{x:2,z:0}).items;
 const c=items.find(o=>o.kind==='cabinet');
 for(const kind of ['coffee','display','appliance','shelves','bar','seating']){
  const changed=G.styleCabinetSpecialty(items,c.id,{type:kind,width:.65,height:.56,shelves:3,
   door:kind==='display'?'glass':'open',materialId:'oak',offsetT:.5});
  assert.equal(changed.items.find(x=>x.id===c.id).specialty.type,kind);
  assert.equal(changed.items.find(x=>x.id===c.id).specialty.shelves,3);
 }
 items=G.styleCabinetSpecialty(items,c.id,{type:'coffee',width:.65,height:.56,shelves:2,door:'open',materialId:'oak',offsetT:.5}).items;
 items=G.styleCabinetSpecialty(items,c.id,{type:'none'}).items;
 assert.equal(items.find(x=>x.id===c.id).specialty,undefined);
 assert.throws(()=>G.styleCabinetSpecialty(items,c.id,{type:'coffee',width:4,height:.56,shelves:2,door:'open',materialId:'oak'}),/سازگار نیست/);
 items=G.placeEquipment(items,{x:1,z:.32},'dishwasher').items;
 assert.throws(()=>G.styleCabinetSpecialty(items,c.id,{type:'coffee',width:.65,height:.56,shelves:2,door:'open',materialId:'oak',offsetT:.5}),/تداخل/);
});
test('a cabinet remains solid until its own door opens, then only that bay exposes a white cavity',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:4,z:0}).items;
 items=G.placeCabinet(items,{x:.2,z:0},{x:1.4,z:0}).items;
 const cabinet=items.find(o=>o.kind==='cabinet');
 items=G.placeFrontLayout(items,cabinet.id,'doors').items;
 const [first,second]=items.filter(o=>o.kind==='front');
 assert.ok(first&&second);
 assert.equal(G.frontOpeningCavity(first,cabinet),null);
 const source=structuredClone(items);
 items=G.setFrontOpening(items,first.id,1).items;
 const open=items.find(o=>o.id===first.id),closed=items.find(o=>o.id===second.id);
 const cavity=G.frontOpeningCavity(open,cabinet);
 assert.ok(cavity&&cavity.width>0&&cavity.depth>.2&&cavity.yHigh>cavity.yLow);
 assert.equal(G.frontOpeningCavity(closed,cabinet),null);
 assert.equal(source.find(o=>o.id===first.id).openFraction,undefined);
 assert.ok(cavity.width<(first.endT-first.startT)*G.lengthOf(cabinet));
 items=G.setFrontOpening(items,first.id,0).items;
 assert.equal(G.frontOpeningCavity(items.find(o=>o.id===first.id),cabinet),null);
 assert.throws(()=>G.setFrontOpening(items,second.id,1.5),/بین صفر و یک/);
 assert.throws(()=>G.setFrontOpening(items,cabinet.id,1),/درب یا کشو/);
});
test('opening drawers and tall cabinet doors survives facade reflow and supports opposite wall sides',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:4,z:0}).items;
 items=G.placeCabinet(items,{x:.4,z:.06},{x:1.1,z:.06},{kind:'base'}).items;
 const cabinet=items.find(c=>c.kind==='cabinet');
 items=G.placeFrontLayout(items,cabinet.id,'drawers3').items;
 const drawer=items.find(o=>o.kind==='front'&&o.subtype==='drawer');
 items=G.setFrontOpening(items,drawer.id,.65).items;
 assert.equal(items.find(o=>o.id===drawer.id).openFraction,.65);
 items=G.configureFrontRules(items,{...G.DEFAULT_FRONT_RULES,gap:.004}).items;
 assert.equal(items.find(o=>o.id===drawer.id).openFraction,.65);
 const reverse=structuredClone(items);
 reverse.find(o=>o.id===cabinet.id).side=-1;
 const cavity=G.frontOpeningCavity(reverse.find(o=>o.id===drawer.id),reverse.find(o=>o.id===cabinet.id));
 assert.ok(cavity.faceZ<0&&cavity.backZ>0);
});


test('one wall height becomes the project-wide height and rejects incompatible openings',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:4,z:0}).items;
 items=G.placeWall(items,{x:4,z:0},{x:4,z:3}).items;
 const wallId=items.find(x=>x.kind==='wall').id;
 items=G.editWall(items,wallId,{height:4}).items;
 assert.ok(items.filter(x=>x.kind==='wall').every(w=>w.height===4));
 items=G.placeOpening(items,wallId,2,0,{width:1,height:1,sill:2.6}).items;
 assert.throws(()=>G.editWall(items,wallId,{height:3}),/بازشو|ناسازگار|خارج/);
 assert.ok(items.filter(x=>x.kind==='wall').every(w=>w.height===4),'failed edit does not mutate source');
 const app=source('app.js');
 assert.match(app,/settings\.height=Number\(p\.scene\?\.ceilingHeight/);
 assert.match(app,/Geo\.setAllWallHeights\(result\.items,settings\.height\)/);
});

test('installing cabinet after fridge cannot cover the fridge cutout',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:4,z:0}).items;
 items=G.placeCabinet(items,{x:0,z:0,side:1},{x:4,z:0}).items;
 items=G.placeEquipment(items,{x:2,z:.4},'fridge').items;
 const fridge=items.find(x=>x.subtype==='fridge');
 assert.ok(fridge);
 assert.throws(()=>G.placeCabinet(items,{x:1.66,z:0,side:1},{x:2.34,z:0}),/یخچال/);
 assert.ok(items.some(x=>x.id===fridge.id),'failed cabinet insertion preserves fridge');
});

test('2D cabinet ghost uses the same minimum-length and collision rules as commit',async()=>{
 G||=await import('../apps/preview/geometry.js');
 const {renderPreview}=await import('../apps/preview/plan-view.js');
 const items=G.placeWall([],{x:0,z:0},{x:4,z:0}).items;
 const start=G.snapCabinetPoint(items,.2,0),short=G.snapCabinetPoint(items,.4,0);
 const invalid=renderPreview(items,{tool:'base',start,depth:.60},short);
 assert.match(invalid,/fill="#b85b4e"/);
 assert.doesNotMatch(invalid,/<polygon/);
 const valid=renderPreview(items,{tool:'base',start,depth:.60},G.snapCabinetPoint(items,1.2,0));
 assert.match(valid,/<polygon/);
});


test('inspector remains closed until its tab is requested and dimensions stay compact',async()=>{
 const app=source('app.js'),css=source('styles.css'),floor=source('floor-ar.js');
 assert.match(app,/data-action="toggle-inspector"/);
 assert.match(app,/if\(key!==inspectorSelectionKey\)\{inspectorOpen=false;/);
 assert.match(app,/if\(action==='toggle-inspector'\)/);
 assert.match(app,/if\(e\.target\.matches\('\[data-setting="height"\]'\)\)/);
 assert.match(app,/Geo\.setAllWallHeights\(currentItems\(\),rounded\)/);
 assert.match(css,/\.object-editor-tab\[hidden\]/);
 assert.match(floor,/sprite\.scale\.set\(\.90,\.13,1\)/);
 const {renderPlanMeasurements}=await import('../apps/preview/edit-handles.js');
 G||=await import('../apps/preview/geometry.js');
 const items=G.placeWall([],{x:0,z:0},{x:3,z:0}).items;
 const svg=renderPlanMeasurements(items,items[0].id,'right');
 assert.match(svg,/height="\.17"/);
 assert.match(svg,/scale\(0\.0065\)/);
});


test('free cabinet frontage uses variable near-50cm bays and keeps fixture centerlines',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:5,z:0}).items;
 items=G.placeCabinet(items,{x:.2,z:0,side:1},{x:4.8,z:0},{kind:'base'}).items;
 const host=items.find(x=>x.kind==='cabinet');
 let fronts=G.planFronts(items,host,'doors');
 const freeWidths=fronts.map(f=>(f.endT-f.startT)*G.lengthOf(host));
 assert.ok(freeWidths.length>=8,'long runs must not create narrow half doors');
 assert.ok(freeWidths.every(w=>w>=.45-1e-5&&w<=.55+1e-5),'each free leaf is 45 to 55 cm');
 items=G.placeEquipment(items,{x:1.9,z:.35},'sink').items;
 items=G.placeFrontLayout(items,host.id,'doors').items;
 const sink=items.find(e=>e.subtype==='sink');
 items=G.editEquipment(items,sink.id,{sinkSize:120}).items;
 const changedSink=items.find(e=>e.id===sink.id),center=changedSink.offsetT*G.lengthOf(host);
 fronts=items.filter(f=>f.kind==='front'&&f.hostId===host.id&&f.subtype==='door');
 assert.ok(fronts.some(f=>Math.abs(f.endT*G.lengthOf(host)-center)<.015),'120cm sink must align with a door pair seam');
});

test('gas hob participates in door and photo facade bays without touching unrelated cabinets',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:5,z:0}).items;
 items=G.placeCabinet(items,{x:.2,z:0,side:1},{x:4.8,z:0},{kind:'base'}).items;
 const host=items.find(x=>x.kind==='cabinet');
 items=G.placeEquipment(items,{x:2.05,z:.35},'stove').items;
 const hob=items.find(e=>e.subtype==='stove'),center=hob.offsetT*G.lengthOf(host);
 for(const preset of ['doors','photo']){
  const fronts=G.planFronts(items,host,preset).filter(f=>f.subtype==='door');
  assert.ok(fronts.some(f=>Math.abs(f.endT*G.lengthOf(host)-center)<.015),preset+' keeps the hob centered');
 }
});


test('130cm frontage avoids four half-size leaves; small fixtures retain centered full doors',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:3,z:0}).items;
 items=G.placeCabinet(items,{x:.5,z:0,side:1},{x:1.8,z:0},{kind:'base'}).items;
 const c=items.find(o=>o.kind==='cabinet'),len=G.lengthOf(c);
 const fronts=G.planFronts(items,c,'doors');
 assert.equal(fronts.length,3);
 assert.ok(fronts.every(f=>(f.endT-f.startT)*len>.42),'three balanced doors beat four narrow 32cm leaves');
 let equipped=G.placeWall([],{x:0,z:0},{x:5,z:0}).items;
 equipped=G.placeCabinet(equipped,{x:.2,z:0,side:1},{x:4.8,z:0},{kind:'base'}).items;
 equipped=G.placeEquipment(equipped,{x:2.3,z:.35},'sink').items;
 const host=equipped.find(o=>o.kind==='cabinet'),sink=equipped.find(o=>o.subtype==='sink');
 const center=sink.offsetT*G.lengthOf(host);
 const leaves=G.planFronts(equipped,host,'doors');
 assert.ok(leaves.some(f=>Math.abs(f.endT*G.lengthOf(host)-center)<.01&&
  (f.endT-f.startT)*G.lengthOf(host)>=.45-1e-6),'a 60cm sink has a centered 45cm leaf');
});
