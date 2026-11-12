const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs');
const app=fs.readFileSync('apps/preview/app.js','utf8');
test('2D desktop pointerup uses first and second click to place wall/base/upper',()=>{
 assert.match(app,/if\(mode!=='2d'&&\['wall','base','upper'\]\.includes\(drawing\.tool\)\)\{showScene\(\);return;\}\s*placeAt\(point\)/);
 assert.match(app,/const point=mode==='2d'\?svg\?planPoint\(svg,e\)/);
 assert.match(app,/const directId=e\.target\.closest\('\[data-item-id\]'\)\?\.dataset\.itemId/);
 assert.match(app,/const elevationTarget=mode==='2d'&&planSubview==='front'/);
});
test('free 3D starts without AR scanning and AR-only chrome stays hidden',()=>{
 assert.match(app,/let projects=\[\],floor=null,desktopPreview=null,mode='3d',entryMode='3d'/);
 assert.match(app,/id="scene-message" hidden/);
 assert.match(app,/id="scan-card" hidden/);
 assert.match(app,/class="scan-confirm" hidden/);
 assert.match(app,/sceneMessage\.hidden=mode!=='ar'/);
 assert.match(app,/scanStatus\.hidden=mode!=='ar'/);
 assert.match(app,/if\(panel\)panel\.hidden=mode!=='ar'\|\|calibrationCollapsed/);
 assert.match(app,/floor\?\.setCalibrationVisible\(mode==='ar'&&!calibrationCollapsed\)/);
 assert.match(app,/if\(next==='ar'&&!floor\?\.session\)beginAR\(\)/);
});
