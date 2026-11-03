const {chromium}=require('C:/Users/Mayram/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),assert=require('node:assert/strict');
const base=process.env.KITCHYAR_URL||'http://127.0.0.1:4173/';
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true}),page=await browser.newPage({viewport:{width:820,height:1180}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader|VALIDATE|GL_INVALID/.test(m.text()))errors.push(m.text());});
 await page.route('**/app.js*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text())+'\nwindow.__occlusionStatus=arUpdate;'});});
 await page.goto(base,{waitUntil:'domcontentloaded'});
 const pixels=await page.evaluate(async()=>{
  const T=await import('https://cdn.jsdelivr.net/gh/MaxLightner/tolica-ar@0abbab05c15eed4f3922d1e1dc74b5c17b82e8be/vendor/three.module.js'),{NearRealOcclusion}=await import('./near-occlusion.js?v=hands68');
  const renderer=new T.WebGLRenderer({alpha:true,antialias:false,preserveDrawingBuffer:true});renderer.setSize(64,32);renderer.setClearColor(0,0);
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(60,2,.01,10),box=new T.Mesh(new T.BoxGeometry(3,3,.01),new T.MeshBasicMaterial({color:0xff0000}));box.position.z=-.7;scene.add(box);
  const pass=new NearRealOcclusion(T,scene),data=new Float32Array(16).fill(2);for(const i of [0,1,4,5])data[i]=.4;
  const info={width:4,height:4,rawValueToMeters:1,data:data.buffer,normDepthBufferFromNormView:{matrix:new T.Matrix4().elements}},pose={views:[{}]},session={depthUsage:'cpu-optimized',depthDataFormat:'float32'};let available=info;
  const frame={getDepthInformation:()=>available};
  const draw=()=>{pass.update(frame,pose,renderer,session);renderer.render(scene,camera);const gl=renderer.getContext(),read=(x,y)=>{const p=new Uint8Array(4);gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,p);return [...p];};return {topLeft:read(16,24),bottomLeft:read(16,8),topRight:read(48,24)};};
  const behindHand=draw();box.position.z=-.25;const cabinetNearerThanHand=draw();box.position.z=-.7;data.fill(.9);const realBehindCabinet=draw();data.fill(1.2);const beyondOneMetre=draw();data.fill(.4);draw();available=null;const missingFrame=draw();
  available=info;pass.update(frame,pose,renderer,session,{enabled:false});renderer.render(scene,camera);const disabled=pass.mesh.visible;
  pass.update(frame,pose,renderer,session,{wide:true});const wideStatus=pass.status;pass.update(frame,pose,renderer,{});const unsupported=pass.status;
  // Exercise actual raw GPU texture binding, including packed 16-bit depth.
  const gl=renderer.getContext(),gpuTexture=gl.createTexture(),binding=renderer.xr.getBinding,nativeGetter=renderer.xr.getDepthSensingMesh,nativeMesh={visible:true};
  gl.bindTexture(gl.TEXTURE_2D,gpuTexture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,1,1,0,gl.RED,gl.FLOAT,new Float32Array([400]));renderer.resetState();
  const gpuInfo={...info,rawValueToMeters:.001,texture:gpuTexture,textureType:'texture'};renderer.xr.getBinding=()=>({getDepthInformation:()=>gpuInfo});renderer.xr.getDepthSensingMesh=()=>nativeMesh;session.depthUsage='gpu-optimized';session.depthDataFormat='float32';const gpuRaw=draw();
  gl.bindTexture(gl.TEXTURE_2D,gpuTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([144,0,0,1]));renderer.resetState();session.depthDataFormat='luminance-alpha';const gpuPacked=draw();
  gpuInfo.textureType='texture-array';draw();const unsupportedArray=pass.status,nativeSuppressed=!nativeMesh.visible;
  renderer.xr.getBinding=binding;renderer.xr.getDepthSensingMesh=nativeGetter;
  const unchangedNear=camera.near;pass.dispose();const disposed=!scene.children.some(o=>o.name==='near-real-depth-only'),borrowedTexturePreserved=gl.isTexture(gpuTexture);gl.deleteTexture(gpuTexture);box.geometry.dispose();box.material.dispose();renderer.dispose();
  return {behindHand,cabinetNearerThanHand,realBehindCabinet,beyondOneMetre,missingFrame,gpuRaw,gpuPacked,unsupportedArray,nativeSuppressed,borrowedTexturePreserved,disabled,wideStatus,unsupported,unchangedNear,disposed};
 });
 assert.equal(pixels.behindHand.topLeft[3],0,'hand at 40cm masks cabinet at 70cm');assert.equal(pixels.behindHand.bottomLeft[0],255,'top-left depth orientation');assert.equal(pixels.behindHand.topRight[0],255,'far real background never masks');
 for(const name of ['cabinetNearerThanHand','realBehindCabinet','beyondOneMetre','missingFrame'])assert.equal(pixels[name].topLeft[0],255,name);
 assert.equal(pixels.disabled,false);assert.equal(pixels.wideStatus,'wide');assert.equal(pixels.unsupported,'unsupported');assert.equal(pixels.unchangedNear,.01);assert.equal(pixels.disposed,true);
 assert.equal(pixels.gpuRaw.topLeft[3],0);assert.equal(pixels.gpuPacked.topLeft[3],0);assert.equal(pixels.unsupportedArray,'unsupported');assert.equal(pixels.nativeSuppressed,true);assert.equal(pixels.borrowedTexturePreserved,true);
 await page.evaluate(()=>{localStorage.setItem('kitchyar.ui.v2',JSON.stringify([{id:'hands',name:'بررسی نمایش دست',scene:{items:[],ceilingHeight:3},revision:0}]));});await page.reload({waitUntil:'domcontentloaded'});await page.goto(base+'#/editor/hands',{waitUntil:'domcontentloaded'});
 await page.locator('[data-action="menu"]').click();const toggle=page.locator('[data-render="nearOcclusion"]');await toggle.waitFor();assert.equal(await toggle.isChecked(),true);
 await page.evaluate(()=>window.__occlusionStatus({message:'عمق در دسترس نیست',progress:0,nearOcclusion:'unsupported'}));assert.match(await page.locator('#near-occlusion-status').textContent(),/عمق مناسب/);
 await toggle.uncheck();assert.match(await page.locator('#near-occlusion-status').textContent(),/خاموش/);await page.reload({waitUntil:'domcontentloaded'});await page.locator('[data-action="menu"]').click();assert.equal(await toggle.isChecked(),false);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({gpuPixels:pixels,uiTogglePersists:true,errors}));await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
