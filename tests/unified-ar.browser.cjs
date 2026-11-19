const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const mock=()=>{
  window.__xrStats={requests:0,ends:0,frames:0};window.XRWebGLBinding=undefined;
  if(typeof window.XRRigidTransform==='undefined')window.XRRigidTransform=class {};
  for(const type of [WebGLRenderingContext,WebGL2RenderingContext])Object.defineProperty(type.prototype,'makeXRCompatible',{configurable:true,value:async()=>{}});
  window.XRWebGLLayer=class {constructor(){this.framebuffer=null;this.framebufferWidth=800;this.framebufferHeight=600;this.ignoreDepthValues=false;this.fixedFoveation=0;}getViewport(){return{x:0,y:0,width:800,height:600};}};
  const space={getOffsetReferenceSpace(){return space;}};
  const theta=-.7,c=Math.cos(theta),s=Math.sin(theta);
  const transform={position:{x:0,y:1.6,z:2},orientation:{x:Math.sin(theta/2),y:0,z:0,w:Math.cos(theta/2)},matrix:new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,1.6,2,1])};
  window.__xrPose=transform;
  const f=1/Math.tan(Math.PI/6),near=.04,far=48,nf=1/(near-far);
  const projectionMatrix=new Float32Array([f/(4/3),0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]);
  class Session extends EventTarget{
    constructor(){super();this.renderState={};this.inputSources=[];this.enabledFeatures=['hit-test','dom-overlay'];this.domOverlayState={type:'screen'};this.environmentBlendMode='alpha-blend';this.visibilityState='visible';this.hits=0;this.ended=false;this.handles=new Set();window.__xrSession=this;}
    updateRenderState(patch){Object.assign(this.renderState,patch);}
    requestReferenceSpace(){return Promise.resolve(space);}
    requestHitTestSource(){return Promise.resolve({index:this.hits++,cancel(){}});}
    requestAnimationFrame(callback){const id=window.requestAnimationFrame(t=>{this.handles.delete(id);if(this.ended)return;window.__xrStats.frames++;callback(t,{getViewerPose:()=>({transform,views:[{eye:'none',transform,projectionMatrix}]}),getHitTestResults:source=>{const x=(source.index%3-1)*.25,z=.1+(Math.floor(source.index/3)-1)*.25;return[{getPose:()=>({transform:{position:{x,y:0,z},matrix:new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,x,0,z,1])}})}];}});});this.handles.add(id);return id;}
    cancelAnimationFrame(id){window.cancelAnimationFrame(id);this.handles.delete(id);}
    async end(){if(this.ended)return;this.ended=true;for(const id of this.handles)window.cancelAnimationFrame(id);window.__xrStats.ends++;this.dispatchEvent(new Event('end'));}
  }
  Object.defineProperty(navigator,'xr',{configurable:true,value:{isSessionSupported:async()=>true,requestSession:async()=>{window.__xrStats.requests++;return new Session();}}});
};
(async()=>{
  const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1100,height:850},hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 13; Tablet) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36'});
  page.setDefaultTimeout(15000);
  const result={checks:[],errors:[],consoleErrors:[],networkErrors:[]};
  page.on('response',r=>{if(r.status()>=400)result.networkErrors.push({url:r.url(),status:r.status()});});
  page.on('pageerror',e=>result.errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')result.consoleErrors.push(m.text());});
  try{
    await page.addInitScript(mock);
    await page.goto('http://127.0.0.1:5189/kitchyar/',{timeout:60000});
    await page.getByRole('button',{name:'اسکن کف AR',exact:true}).click();
    await page.waitForSelector('[data-testid="scene-3d-root"][data-xr-active="1"]');
    assert.equal(await page.getByTestId('ar-scale-controls').count(),0);
    assert.equal(await page.locator('canvas').count(),1);
    result.checks.push({phase:'scan',scaleCount:0,canvas:1});
    await page.waitForFunction(()=>!document.querySelector('[data-testid="chido-confirm-floor"]')?.disabled);
    await page.getByTestId('chido-confirm-floor').click();
    await page.waitForSelector('[data-testid="ar-calibration-panel"]');
    result.checks.push({phase:'floor confirmed',stats:await page.evaluate(()=>window.__xrStats)});
    await page.screenshot({path:'xr-after-scan.png'});
    await page.getByTestId('ar-real-distance').click();
    await page.getByRole('dialog').locator('input').fill('120');
    await page.getByRole('dialog').locator('button[type="submit"]').click();
    await page.waitForFunction(()=>{const id=localStorage.getItem('kichiyar_active_project_id_v2');return JSON.parse(localStorage.getItem('kichiyar_projects_v2')).find(p=>p.id===id)?.state.arCalibration?.realDistanceCm===120;});
    result.checks.push({phase:'A/B real distance applied and saved'});
    await page.getByTestId('ar-calibrate-toggle').click();
    await page.getByTestId('ar-calibration-done').click();
    await page.locator('button').filter({hasText:/^دیوار$/}).click();
    await page.getByTestId('scene-confirm-placement').click();
    await page.evaluate(()=>{window.__xrPose.position.x=1.2;window.__xrPose.matrix[12]=1.2;});
    await page.waitForFunction(()=>Number(document.querySelector('[data-testid="scene-3d-root"]').dataset.cursorX)>.8);
    await page.getByTestId('scene-confirm-placement').click();
    await page.waitForFunction(()=>{const id=localStorage.getItem('kichiyar_active_project_id_v2');return JSON.parse(localStorage.getItem('kichiyar_projects_v2')).find(p=>p.id===id)?.state.walls.length===1;});
    result.checks.push({phase:'wall drawn in AR'});
    await page.locator('button').filter({hasText:/^2D$/}).click();
    assert.equal(await page.locator('canvas').count(),1);
    result.checks.push({phase:'2D',stats:await page.evaluate(()=>window.__xrStats)});
    await page.locator('button[title*="Undo"]').click();
    await page.waitForFunction(()=>{const id=localStorage.getItem('kichiyar_active_project_id_v2');return JSON.parse(localStorage.getItem('kichiyar_projects_v2')).find(p=>p.id===id)?.state.walls.length===0;});
    await page.locator('button[title*="Redo"]').click();
    await page.waitForFunction(()=>{const id=localStorage.getItem('kichiyar_active_project_id_v2');return JSON.parse(localStorage.getItem('kichiyar_projects_v2')).find(p=>p.id===id)?.state.walls.length===1;});
    result.checks.push({phase:'shared 2D undo, redo and save'});
    await page.locator('button').filter({hasText:/^3D$/}).click();
    assert.equal(await page.locator('canvas').count(),1);
    assert.equal(await page.getByTestId('scene-3d-root').getAttribute('data-floor-locked'),'1');
    const stats=await page.evaluate(()=>window.__xrStats);
    assert.equal(stats.requests,1);assert.equal(stats.ends,0);
    result.checks.push({phase:'3D',stats,canvas:1,floor:'1'});
    await page.getByTestId('dock-tool-dining').click();
    await page.evaluate(()=>{const canvas=document.querySelector('[data-testid="scene-3d-canvas"]'),r=canvas.getBoundingClientRect();
      const make=(id,y)=>new Touch({identifier:id,target:canvas,clientX:r.left+r.width/2+id*25,clientY:r.top+r.height*.55+y});
      canvas.dispatchEvent(new TouchEvent('touchstart',{touches:[make(1,0),make(2,0)],bubbles:true}));
      canvas.dispatchEvent(new TouchEvent('touchmove',{touches:[make(1,-80),make(2,-80)],bubbles:true,cancelable:true}));
      canvas.dispatchEvent(new TouchEvent('touchend',{touches:[],bubbles:true}));});
    await page.waitForFunction(()=>document.querySelector('.kitchyar-tool-guides')?.textContent.includes('۶ نفره'));
    assert.equal(await page.locator('[data-testid^="dining-seats-"]').count(),0);
    result.checks.push({phase:'dining',guide:await page.locator('.kitchyar-tool-guides').textContent(),bottomPanel:0});
    await page.evaluate(()=>window.__xrSession.end());
    await page.waitForSelector('[data-testid="scene-3d-root"][data-xr-active="0"]');
    result.checks.push({phase:'session ended',stats:await page.evaluate(()=>window.__xrStats),canvas:await page.locator('canvas').count()});
    assert.deepEqual(result.errors,[]);
    assert.deepEqual(result.consoleErrors.filter(error=>!error.includes('404 (Not Found)')),[]);
  }catch(error){result.failure=String(error);await page.screenshot({path:'xr-check-failure.png'});result.buttons=await page.locator('button').allTextContents();process.exitCode=1;}
  finally{fs.writeFileSync('xr-browser-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close();}
})();
