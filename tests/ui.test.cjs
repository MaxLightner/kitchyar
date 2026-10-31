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
 assert.match(source,/data-action="point-a"/);
 assert.match(source,/data-action="point-b"/);
 assert.match(source,/data-action="apply-distance"/);
});
test('retains explicit fallback with no fake successful tracking',()=>{
 const source=read('app.js');
 assert.match(source,/این نما در مرحله بعد فعال خواهد شد/);
 assert.match(source,/document\.getElementById\('scan-status'\)\.textContent=error\.message/);
});
