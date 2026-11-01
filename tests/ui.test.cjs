const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'../apps/preview');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('welcome, project list, editor and independent fabrication report are routed',()=>{
 const source=read('app.js');
 assert.match(source,/function welcome\(/);
 assert.match(source,/function projectPage\(/);
 assert.match(source,/function editorPage\(/);
 assert.match(source,/function reportPage\(/);
 assert.match(source,/mode='ar'/);
 assert.match(source,/go\('#\/editor\/'\+id,true\)/);
});
test('floor uses the pinned Chido source, not an approximate scanner',()=>{
 const floor=read('floor-ar.js');
 assert.match(floor,/tolica-ar@0abbab05c15eed4f3922d1e1dc74b5c17b82e8be\/surfaces\.js/);
 assert.match(floor,/FloorScanner/);
 assert.match(floor,/AnchorStabilizer/);
 assert.match(floor,/const RAYS=\[\[-\.24,0\]/);
 assert.match(floor,/this\.scanner\.update\(center,extra,this\.space,viewer,time,forward\)/);
});
test('editor starts with AR and provides a calibration after floor confirmation',()=>{
 const source=read('app.js');
 assert.match(source,/class="mode-switch"/);
 assert.match(source,/data-mode="ar"/);
 assert.match(source,/data-action="confirm-floor"/);
 assert.match(read('plan-view.js'),/data-calibration/);
 assert.match(read('floor-ar.js'),/pickCalibrationHandle/);
 assert.match(source,/data-action="rescan"/);
 assert.match(source,/data-action="apply-distance"/);
});
test('retains explicit fallback with no fake successful tracking',()=>{
 const source=read('app.js');
 assert.match(source,/desktopPreview\.startPreview/);
 assert.match(source,/این دستگاه یا مرورگر از AR پشتیبانی نمی‌کند/);
});
test('selecting objects does not remesh the whole kitchen or recompute raycast AO',()=>{
 const floor=read('floor-ar.js'),app=read('app.js');
 const select=floor.slice(floor.indexOf(' setSelection(selectedId=null){'),
  floor.indexOf(' setMaterials(materials={}){'));
 assert.match(select,/this\.highlightSelection\(\)/);
 assert.match(select,/this\.updateEditHandles\(\)/);
 assert.doesNotMatch(select,/rebuildObjects\(/);
 assert.doesNotMatch(select,/applyRaycastAO\(/);
 assert.match(floor,/setSceneState\(items,selectedId,materials=\{\},tileLayout=\{\}\)/);
 assert.match(app,/floor\?\.setSceneState\(items,selection,materials,tileLayout\)/);
 assert.match(app,/desktopPreview\?\.setSceneState\(items,selection,materials,tileLayout\)/);
});
test('AR settings are in the same DOM overlay, and all panels have dismiss gestures',()=>{
 const app=read('app.js');
 assert.match(app,/document\.getElementById\('editor-root'\)\.appendChild\(dialogs\)/);
 assert.match(app,/document\.getElementById\('editor-root'\)\?\.appendChild\(dialogs\)/);
 assert.match(app,/e\.target\.classList\?\.contains\('dialog-cover'\)/);
 assert.match(app,/if\(e\.key!=='Escape'\)return/);
 assert.match(app,/data-action="hide-tools" aria-label="بستن پنل ابزار"/);
 assert.match(app,/selectAt\(trackedView\(\)\?null:point,e\.target,arId\)/);
});
test('style gallery selects a photograph then applies its JSON facades and materials in one undo step',()=>{
 const app=read('app.js');
 assert.match(app,/data-action="apply-style" disabled/);
 assert.match(app,/action==='select-style'/);
 assert.match(app,/fetch\(assetUrl\(style\.config\)\)/);
 assert.match(app,/commitChange\(result,\{styleId:style\.id,stylePreset:preset\}\)/);
 assert.match(app,/await new Promise\(resolve=>setTimeout\(resolve,450\)\)/);
 assert.match(app,/project\.scene\.materials=\{\.\.\.DEFAULT_MATERIALS,\.\.\.preset\.materials\}/);
 assert.doesNotMatch(app,/commitChange\(result,\{materials:preset\.materials,styleId:style\.id\}\)/);
});

test('exactly two bottom drawing actions are exposed for every tool',()=>{
 const source=read('app.js');
 const controls=source.match(/class="draw-controls"[^\n]+/g)||[];
 assert.equal(controls.length,1);
 assert.match(controls[0],/data-action="confirm-drawing"/);
 assert.match(controls[0],/data-action="cancel-drawing"/);
 assert.doesNotMatch(controls[0],/data-action="(?:start-drawing|end-drawing|finish-drawing)"/);
 assert.match(source,/\['fridge','stove','sink',/);
});
test('cabinet selection offers editable dimensions and an elevation drawing',()=>{
 const source=read('app.js');
 assert.match(source,/renderCabinetElevation\(items,selected\)/);
 assert.match(source,/data-edit=/);
 assert.match(source,/upperHeight/);
 assert.match(read('edit-handles.js'),/renderCabinetElevation/);
});

test('tool dimensions update as the user types, before focus leaves the field',()=>{
 const source=read('app.js');
 assert.match(source,/const field=e\.target\.closest\('\[data-setting\]'\);/);
 assert.match(source,/settings\[field\.dataset\.setting\]=field\.type/);
 assert.match(source,/activeTool=null;[\s\S]*?floor\?\.setDrawing\(null\);showScene\(\)/);
});

test('mobile drawing handles use pixel proximity and retain finger offset',()=>{
 const app=read('app.js'),plan=read('plan-view.js'),floor=read('floor-ar.js');
 assert.match(app,/function pickPlanCalibration/);
 assert.match(app,/function pickPlanHandle/);
 assert.match(app,/dx:anchor\.x-/);
 assert.match(plan,/touchRadius=Math\.max/);
 assert.match(floor,/distance=65/);
});
test('kitchen fixtures and task lighting expose their independent controls',()=>{
 const app=read('app.js'),floor=read('floor-ar.js');
 assert.match(app,/data-action="sink-size"/);
 assert.match(app,/data-equipment-induction/);
 assert.match(app,/data-render="taskLighting"/);
 assert.match(floor,/THREE\.PointLight/);
});

test('facade editor offers preview, selectable doors and centimetre grips in both modes',()=>{
 const app=read('app.js'),plan=read('plan-view.js'),floor=read('floor-ar.js'),handles=read('edit-handles.js');
 assert.match(app,/front-doors/);assert.match(app,/front-drawers3/);
 assert.match(app,/front-drawers4/);assert.match(app,/front-mixed/);
 assert.match(app,/data-edit-front/);
 assert.match(app,/پیش‌نمایش · هنوز ثبت نشده/);
 assert.match(plan,/front-plan/);assert.match(plan,/planFronts/);
 assert.match(floor,/kind\.startsWith\('front-'\)/);
 assert.match(floor,/surface\.userData\.objectId=panel\.id/);
 assert.match(handles,/renderFrontElevation/);
 assert.match(handles,/front-resize-grip/);
 assert.match(handles,/editFront\(items,id/);
});
test('base kitchen envelope has countertop and recessed plinth from initial placement',()=>{
 const floor=read('floor-ar.js'),plan=read('plan-view.js');
 assert.match(floor,/countertopCutouts\(this\.items,c\)/);
 assert.match(floor,/for\(const cut of cuts\)/);
 assert.match(floor,/new THREE\.ExtrudeGeometry\(shape/);
 assert.match(plan,/countertop-cutout/);
 assert.match(floor,/const toe=new THREE\.Mesh/);
 assert.match(plan,/countertop-plan/);
});
test('ceramic layouts generate clipped batched geometry in six patterns without tile image atlases',async()=>{
 const {TILE_PATTERNS,buildTileGeometry,validateTileLayout}=await import('../apps/preview/tile-layout.js');
 assert.equal(TILE_PATTERNS.length,6);
 for(const pattern of TILE_PATTERNS){
  const batch=buildTileGeometry(1.8,.62,{pattern,width:.20,height:.10,grout:.003,groutColor:'#ded8cd'});
  assert.ok(batch.count>10,pattern);
  assert.ok(batch.indices.length>=batch.count*3,pattern);
  assert.ok(batch.positions.every(Number.isFinite)&&batch.uvs.every(Number.isFinite));
  for(let i=0;i<batch.positions.length;i+=3){
   assert.ok(batch.positions[i]>=-.90001&&batch.positions[i]<=.90001,pattern+' x clipped');
   assert.ok(batch.positions[i+1]>=-.31001&&batch.positions[i+1]<=.31001,pattern+' y clipped');
  }
 }
 assert.throws(()=>validateTileLayout({pattern:'invalid'}),/نامعتبر/);
 assert.throws(()=>validateTileLayout({grout:.2}),/نامعتبر/);
 const floor=read('floor-ar.js'),app=read('app.js');
 assert.match(floor,/buildTileGeometry\(span,endY-baseTop,this\.tileLayout\)/);
 assert.match(app,/data-action="apply-tile-layout"/);
 assert.match(app,/tileLayout:currentTileLayout\(\)/);
});
test('carcass is always hollow; drawer trays animate and the lower sheet has no select button',()=>{
 const app=read('app.js'),renderer=read('floor-ar.js'),elevation=read('edit-handles.js');
 assert.match(app,/data-action="toggle-front"/);
 assert.match(app,/commitFrontOpening\(front\.id,opening\)/);
 assert.doesNotMatch(app,/'<button data-action="select">انتخاب<\/button>/);
 assert.match(app,/class="side-tools"/,'the existing side select tool stays available');
 assert.match(renderer,/this\.frontControls\.set\(panel\.id,control\)/);
 assert.match(renderer,/cabinetCarcassPanels\(c,/);
 assert.match(renderer,/buildCarcassPanelGeometry\(panels\)/);
 assert.match(renderer,/const trayPanels=\[/);
 assert.doesNotMatch(renderer,/else box\(c,0,len,y0,y0\+c\.height,c\.depth/);
 assert.match(renderer,/panel\.subtype==='drawer'/);
 assert.match(renderer,/pivot\.rotation\.y=/);
 assert.match(renderer,/pivot\.rotation\.x=/);
 assert.match(elevation,/is-open/);
});
test('view-only hide-all-facades controls both 3D renderers and the 2D plan',()=>{
 const app=read('app.js'),floor=read('floor-ar.js'),plan=read('plan-view.js');
 assert.match(app,/data-action="toggle-facades"/);
 assert.match(app,/floor\?\.setFacadesHidden\(facadesHidden\)/);
 assert.match(app,/desktopPreview\?\.setFacadesHidden\(facadesHidden\)/);
 assert.match(app,/hideFronts:facadesHidden/);
 assert.match(app,/if\(action==='toggle-facades'\)/);
 assert.match(floor,/setFacadesHidden\(hidden\)/);
 assert.match(floor,/const pickable=node=>/);
 assert.match(floor,/if\(!pickable\(hit\.object\)\)continue/);
 const toggle=floor.slice(floor.indexOf(' setFacadesHidden(hidden){'),floor.indexOf(' setMaterials(materials={}){'));
 assert.doesNotMatch(toggle,/rebuildObjects|applyRaycastAO|setItems/);
 assert.match(floor,/root\.visible=!this\.facadesHidden/);
 assert.match(plan,/hideFronts\?\[\]:items\.filter\(x=>x\.kind==='front'\)/);
});
test('new facade styles keep all explicit text at 13 px or larger',()=>{
 const css=read('styles.css');
 const sizes=[...css.matchAll(/font-size\s*:\s*([\d.]+)px/g)].map(m=>Number(m[1]));
 assert.ok(sizes.every(n=>n>=13));
 assert.match(css,/front-elevation-dimension/);
});

test('changing only front styling never re-snaps the displayed rounded dimensions',()=>{
 const app=read('app.js');
 assert.match(app,/shownWidth=Math\.round\(actualWidth\*100\)\/100/);
 assert.match(app,/width:Math\.abs\(desiredWidth-shownWidth\)>\.001\?desiredWidth:undefined/);
 assert.match(app,/height:Math\.abs\(desiredHeight-shownHeight\)>\.001\?desiredHeight:undefined/);
});
test('facade viewport scrolls selected front into view without hidden hit targets',()=>{
 const app=read('app.js'),css=read('styles.css');
 assert.match(app,/selectedPanel\.getBBox\(\)/);
 assert.match(app,/scroller\.scrollLeft/);
 assert.match(app,/const clip=el\.closest\('\.front-elevation-scroll'\)/);
 assert.match(css,/\.front-elevation-scroll\{direction:ltr\}/);
});

test('facade panel taps are not swallowed by nearby resize grips',()=>{
 const app=read('app.js');
 assert.match(app,/if\(e\.target\.closest\('\.front-panel-elevation'\)\)return null/);
});

test('tapping through an elevated resize grip can still select a neighboring drawer',()=>{
 const app=read('app.js');
 assert.match(app,/document\.elementsFromPoint\(e\.clientX,e\.clientY\)/);
 assert.match(app,/if\(panel\?\.dataset\.itemId\)selectAt\(null,panel\)/);
});


test('A/B drag extends a three-metre reference without rescaling the kitchen',async()=>{
 const {fitCalibrationDragB}=await import('../apps/preview/calibration-transform.js');
 const a={x:-.5,z:.65},b={x:.5,z:.65},anchor={x:-.5,z:.65};
 const result=fitCalibrationDragB(a,b,anchor,{x:2.5,z:.65},1);
 assert.ok(result);
 assert.ok(Math.abs(Math.hypot(result.b.x-a.x,result.b.z-a.z)-3)<1e-9);
 assert.equal(result.yaw,0);
 const floor=read('floor-ar.js');
 const drag=floor.slice(floor.indexOf(' dragCalibrationPoint('),floor.indexOf(' pickHandle('));
 assert.match(drag,/this\.points\.b\.set\(solution\.b\.x,0,solution\.b\.z\)/);
 assert.match(drag,/this\.savedCalibration=this\.calibrationSnapshot\(\)/);
 assert.doesNotMatch(drag,/this\.alignment\.scale\s*=/);
 assert.match(read('app.js'),/p\.scene\.calibration=floor\.calibrationSnapshot\(\);save\(\)/);
});

test('A/B drag rotates the project around A without changing its metre scale',async()=>{
 const {fitCalibrationDragB}=await import('../apps/preview/calibration-transform.js');
 const a={x:-.5,z:.65},b={x:.5,z:.65},anchor={x:2.2,z:-1.1},target={x:2.2,z:1.9},scale=1.1;
 const fitted=fitCalibrationDragB(a,b,anchor,target,scale);
 assert.ok(fitted);
 const transform=p=>({x:scale*(p.x*Math.cos(fitted.yaw)+p.z*Math.sin(fitted.yaw))+fitted.x,
  z:scale*(-p.x*Math.sin(fitted.yaw)+p.z*Math.cos(fitted.yaw))+fitted.z});
 for(const [point,expected] of [[transform(a),anchor],[transform(fitted.b),target]])
  for(const key of ['x','z'])assert.ok(Math.abs(point[key]-expected[key])<1e-9,key);
 assert.equal(fitCalibrationDragB(a,b,anchor,anchor,1),null,'coincident markers are rejected');
});
