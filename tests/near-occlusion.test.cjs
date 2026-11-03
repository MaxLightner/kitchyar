const test=require('node:test'),assert=require('node:assert/strict');
test('real depth decodes in metres with a bounded reusable texture and rejects missing/invalid data',async()=>{
 const {copyDepthFrame,NEAR_OCCLUSION}=await import('../apps/preview/near-occlusion.js');
 const bytes=new Uint8Array([0,0,144,1,220,5,255,255]);
 const a=copyDepthFrame({width:4,height:1,rawValueToMeters:.001,data:bytes.subarray(2,6)},'luminance-alpha');assert.equal(a,null,'truncated buffers do not produce a mask');
 const offset=copyDepthFrame({width:2,height:1,rawValueToMeters:.001,data:bytes.subarray(2,6)},'luminance-alpha');assert.ok(Math.abs(offset.data[0]-.4)<1e-6&&offset.data[1]===1.5);
 const b=copyDepthFrame({width:4,height:1,rawValueToMeters:.001,data:bytes},'luminance-alpha');assert.ok(Math.abs(b.data[1]-.4)<1e-6);assert.equal(b.data[0],0);
 const floats=new Float32Array([.35,NaN,Infinity,-1]);const c=copyDepthFrame({width:4,height:1,rawValueToMeters:1,data:floats.buffer},'float32',b.data);assert.equal(c.data,b.data);assert.equal(c.valid,1);assert.deepEqual([...c.data].slice(1),[0,0,0]);
 const large=copyDepthFrame({width:640,height:480,rawValueToMeters:1,data:new Float32Array(640*480)},'float32');assert.ok(large.width<=NEAR_OCCLUSION.maxTextureSize&&large.height<=NEAR_OCCLUSION.maxTextureSize);assert.equal(large.valid,0);
 assert.equal(copyDepthFrame({width:1,height:1,rawValueToMeters:0,data:new Float32Array([1])},'float32'),null);
});
test('near masking requests optional real-world depth without changing required AR features',async()=>{
 const {nearDepthSessionOptions}=await import('../apps/preview/near-occlusion.js'),root={};const o=nearDepthSessionOptions(root);
 assert.deepEqual(o.requiredFeatures,['hit-test','dom-overlay']);assert.ok(o.optionalFeatures.includes('depth-sensing'));assert.equal(o.domOverlay.root,root);assert.equal(o.depthSensing.usagePreference[0],'cpu-optimized');assert.equal(o.depthSensing.matchDepthView,true);
});
