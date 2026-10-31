const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'../apps/preview');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('only the three requested screens are routed',()=>{
 const source=read('app.js');
 assert.match(source,/function welcome\(/);
 assert.match(source,/function projectPage\(/);
 assert.match(source,/function editorPage\(/);
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
test('cabinet opening builds white interiors on demand and the lower tool sheet has no select button',()=>{
 const app=read('app.js'),renderer=read('floor-ar.js'),elevation=read('edit-handles.js');
 assert.match(app,/data-action="toggle-front"/);
 assert.match(app,/Geo\.setFrontOpening\(currentItems\(\),front\.id,opening\)/);
 assert.doesNotMatch(app,/'<button data-action="select">انتخاب<\/button>/);
 assert.match(app,/class="side-tools"/,'the existing side select tool stays available');
 assert.match(renderer,/frontOpeningCavity\(f,c\)/);
 assert.match(renderer,/else if\(opened\.length\)/);
 assert.match(renderer,/front\.subtype==='drawer'/);
 assert.match(renderer,/pivot\.rotation\.y=/);
 assert.match(renderer,/pivot\.rotation\.x=/);
 assert.match(elevation,/is-open/);
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
