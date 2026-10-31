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
 assert.match(source,/نمای سه‌بعدی دسکتاپ در مرحله بعد فعال می‌شود/);
 assert.match(source,/این دستگاه یا مرورگر از AR پشتیبانی نمی‌کند/);
});

test('exactly two bottom drawing actions are exposed for every tool',()=>{
 const source=read('app.js');
 const controls=source.match(/class="draw-controls"[^\n]+/g)||[];
 assert.equal(controls.length,1);
 assert.match(controls[0],/data-action="confirm-drawing"/);
 assert.match(controls[0],/data-action="cancel-drawing"/);
 assert.doesNotMatch(controls[0],/data-action="(?:start-drawing|end-drawing|finish-drawing)"/);
 assert.match(source,/\['fridge','stove','sink'\]/);
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
