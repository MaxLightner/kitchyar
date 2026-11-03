const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
test('connected countertop pieces share their top surface elevation',async()=>{
 const {countertopSurfaceY,COUNTERTOP_TOP_OFFSET,COUNTERTOP_MIN_FILLET}=await import('../apps/preview/countertop-surface.js');
 const a={elevation:.10,height:.86},b={elevation:.10,height:.86};
 const join={elevation:Math.max(a.elevation,b.elevation),
  height:Math.min(a.elevation+a.height,b.elevation+b.height)-Math.max(a.elevation,b.elevation)};
 assert.equal(countertopSurfaceY(a),countertopSurfaceY(b));
 assert.equal(countertopSurfaceY(join),countertopSurfaceY(a));
 assert.equal(COUNTERTOP_TOP_OFFSET,.035);
 assert.ok(COUNTERTOP_MIN_FILLET>=.003);
});
test('default worktop edge has a visible rounded finish',async()=>{
 const {resolvedCountertopDesign}=await import('../apps/preview/geometry.js');
 assert.equal(resolvedCountertopDesign({}).edge,'round');
 assert.equal(resolvedCountertopDesign({countertopDesign:{edge:'square'}}).edge,'square');
});
