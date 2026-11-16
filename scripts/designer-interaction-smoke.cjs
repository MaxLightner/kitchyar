const assert=require('node:assert/strict');
const base='http://127.0.0.1:4173/';
function projectFixture(){
 return {walls:[{id:'w',name:'دیوار تست',x1Cm:0,y1Cm:0,x2Cm:600,y2Cm:0,length:600,height:300,angle:0,flipSide:-1,
  boxes:[{id:'b',name:'باکس',type:'base',offsetX:0,elevY:0,width:100,height:86,depth:60,plinth:10,countertopCm:4,
   doors:[{id:'d',startCm:0,widthCm:100,kind:'door',drawerRatios:[1]}],unitDividers:[],shelves:[],handles:[],frames:[]}],appliances:[],openings:[]}],
  cornerOwners:{},activeWallId:'w',activeBoxId:'b',selectedDoorId:null,doorsLocked:false};
}
async function seed(context){
 await context.addInitScript(state=>{
  localStorage.setItem('kichiyar_projects_v2',JSON.stringify([{id:'test',name:'تست تعامل',state,wallCount:1,boxCount:1,updatedAt:Date.now()}]));
  localStorage.setItem('kichiyar_active_project_id_v2','test');
 },projectFixture());
}
module.exports=async function(browser){
 const errors=[];
 const desktop=await browser.newContext({viewport:{width:1100,height:800}});
 await seed(desktop);
 const p=await desktop.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+'?autostart=1',{waitUntil:'networkidle'});
 assert.equal(await p.getByTestId('editor-shell').getAttribute('data-active-tool'),'select');
 const boxes=await p.getByRole('complementary').getByRole('button').evaluateAll(elements=>elements.slice(0,3).map(e=>({label:e.getAttribute('aria-label'),y:e.getBoundingClientRect().y})));
 assert.deepEqual(boxes.map(x=>x.label),['ابزار انتخاب و جابجایی','حذف مورد انتخاب‌شده','کپی مورد انتخاب‌شده']);
 assert.ok(boxes[0].y<boxes[1].y&&boxes[1].y<boxes[2].y);
 await p.getByTestId('rail-copy').click();
 await p.waitForFunction(()=>JSON.parse(localStorage.getItem('kichiyar_projects_v2'))[0].state.walls[0].boxes.length===2);
 const front=p.getByTestId('front-svg');
 assert.equal(await front.getAttribute('data-front-direction'),'reversed');
 const transform=await front.evaluate(el=>{const m=el.getScreenCTM();const pt=el.createSVGPoint();pt.x=100;pt.y=20;const screen=pt.matrixTransform(m);const back=screen.matrixTransform(m.inverse());return {a:m.a,x:back.x,y:back.y};});
 assert.ok(transform.a<0);assert.ok(Math.abs(transform.x-100)<.001&&Math.abs(transform.y-20)<.001);
 await p.getByRole('button',{name:'بازشو / ستون',exact:true}).click();
 const preview=p.getByTestId('cursor-preview-2d');
 await preview.waitFor();
 await p.mouse.move(300,420);const card1=await preview.boundingBox();
 await p.mouse.move(850,600);const card2=await preview.boundingBox();
 assert.ok(Math.abs(card1.x-card2.x)<1&&Math.abs(card1.y-card2.y)<1);
 assert.ok(Math.abs(card2.x+card2.width/2-550)<2);
 await desktop.close();
 console.log('PASS: default Select, Select/Delete/Copy rail, semantic copy, front coordinate direction, fixed preview.');

 const touch=await browser.newContext({viewport:{width:1024,height:768},hasTouch:true,isMobile:true,
  userAgent:'Mozilla/5.0 (Linux; Android 14; Tablet) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'});
 await seed(touch);
 const t=await touch.newPage();t.on('pageerror',e=>errors.push(e.message));
 await t.goto(base+'?autostart=1',{waitUntil:'networkidle'});
 await t.getByRole('button',{name:'نمای سه‌بعدی',exact:true}).click();
 const canvas=t.getByTestId('scene-3d-canvas');await canvas.waitFor();
 await t.getByRole('button',{name:'بازشو / ستون',exact:true}).click();
 const rect=await canvas.boundingBox(),x=rect.x+rect.width*.5,y=rect.y+rect.height*.7;
 await t.touchscreen.tap(x,y);
 await t.getByTestId('scene-confirm-placement').waitFor();
 const target=await t.getByTestId('scene-3d-root').evaluate(e=>[e.dataset.cursorX,e.dataset.cursorY,e.dataset.cursorZ]);
 const before=await t.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('kichiyar_projects_v2'))[0].state));
 const cdp=await touch.newCDPSession(t);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-40,y,id:1},{x:x+40,y,id:2}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-40,y:y-75,id:1},{x:x+40,y:y-75,id:2}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert.deepEqual(await t.getByTestId('scene-3d-root').evaluate(e=>[e.dataset.cursorX,e.dataset.cursorY,e.dataset.cursorZ]),target);
 assert.equal(await t.evaluate(()=>JSON.stringify(JSON.parse(localStorage.getItem('kichiyar_projects_v2'))[0].state)),before);
 await t.getByRole('button',{name:'دیوار',exact:true}).tap();
 await t.getByTestId('scene-confirm-placement').tap();
 const movedX=x+110,movedY=y+15;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:movedX,y:movedY,id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert.equal(await t.evaluate(()=>JSON.parse(localStorage.getItem('kichiyar_projects_v2'))[0].state.walls.length),1,
   'dragging the cursor previews only');
 await t.touchscreen.tap(movedX,movedY);
 await t.waitForFunction(()=>JSON.parse(localStorage.getItem('kichiyar_projects_v2'))[0].state.walls.length===2);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:movedX,y:movedY,id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:movedX-150,y:movedY+20,id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await t.keyboard.press('Enter');
 await t.waitForFunction(()=>JSON.parse(localStorage.getItem('kichiyar_projects_v2'))[0].state.walls.length===3);
 await touch.close();
 console.log('PASS: Confirm starts placement, dragging previews, the next tap and Enter commit at the pinned target.');
 console.log('PASS: first touch positions the world cursor; two fingers keep its location and do not place objects.');

 const tracked=await browser.newContext({viewport:{width:1024,height:768},hasTouch:true,
  userAgent:'Mozilla/5.0 (Linux; Android 14; Tablet) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36'});
 await seed(tracked);
 await tracked.addInitScript(()=>{
  window.__sessionCalls=0;window.__sessionEnds=0;
  const matrix=(x,y,z,angle=0)=>{
   const c=Math.cos(angle),s=Math.sin(angle);
   return new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,x,y,z,1]);
  };
  const identity=matrix(0,0,0);
  const space=new EventTarget();space.getOffsetReferenceSpace=()=>space;
  const transform={position:{x:0,y:1.5,z:2},orientation:{x:-Math.sin(Math.PI/12),y:0,z:0,w:Math.cos(Math.PI/12)},
   matrix:matrix(0,1.5,2,-Math.PI/6),inverse:{matrix:identity}};
  const projection=new Float32Array([1.3,0,0,0,0,1.7,0,0,0,0,-1.002,-1,0,0,-.2,0]);
  const pose={transform,views:[{eye:'none',transform,projectionMatrix:projection}]};
  const compatible=()=>Promise.resolve();
  if(window.WebGLRenderingContext)WebGLRenderingContext.prototype.makeXRCompatible=compatible;
  if(window.WebGL2RenderingContext)WebGL2RenderingContext.prototype.makeXRCompatible=compatible;
  Reflect.deleteProperty(window,'XRWebGLBinding');
  window.XRWebGLLayer=class {
   constructor(){this.framebuffer=null;this.framebufferWidth=1024;this.framebufferHeight=768;this.ignoreDepthValues=true;}
   getViewport(){return {x:0,y:0,width:1024,height:768};}
  };
  Object.defineProperty(navigator,'xr',{configurable:true,value:{
   isSessionSupported:async()=>true,
   requestSession:async()=>{
    window.__sessionCalls++;
    const session=new EventTarget();
    session.renderState={depthNear:.1,depthFar:100};
    session.inputSources=[];session.enabledFeatures=[];session.environmentBlendMode='alpha-blend';
    session.domOverlayState={type:'screen'};session.visibilityState='visible';
    session.requestReferenceSpace=async()=>space;
    let n=0,ended=false;
    session.requestHitTestSource=async()=>({id:++n,cancel(){}});
    session.updateRenderState=state=>Object.assign(session.renderState,state);
    session.requestAnimationFrame=callback=>requestAnimationFrame(time=>{
     if(ended)return;
     const frame={session,getViewerPose:()=>pose,getPose:()=>null,
      getHitTestResults:source=>{
       if(source.id===2)throw new DOMException('side ray unavailable','InvalidStateError');
       return [0,.3,.6].map(x=>({getPose:()=>({transform:{matrix:matrix(x,0,-1),position:{x,y:0,z:-1}}})}));
      }};
     callback(time,frame);
    });
    session.cancelAnimationFrame=id=>cancelAnimationFrame(id);
    session.end=async()=>{if(!ended){ended=true;window.__sessionEnds++;session.dispatchEvent(new Event('end'));}};
    return session;
   }
  }});
 });
 const a=await tracked.newPage();a.on('pageerror',e=>errors.push(e.message));
 await a.goto(base,{waitUntil:'networkidle'});
 await a.getByRole('button',{name:'اسکن کف AR',exact:true}).tap();
 const ar=a.getByTestId('ar-workspace');
 await a.waitForFunction(()=>document.querySelector('[data-testid="chido-floor-scan-readiness"]')?.dataset.scanStage==='100',null,{timeout:15000});
 const confirm=a.getByTestId('ar-confirm-btn');
 await confirm.tap();
 await a.waitForFunction(()=>document.querySelector('[data-testid="ar-workspace"]')?.dataset.floorLocked==='1');
 assert.equal(await a.getByTestId('editor-shell').getAttribute('data-active-tool'),'select');
 await a.evaluate(()=>window.__originalWorkspace=document.querySelector('[data-testid="ar-workspace"]'));
 await a.getByRole('button',{name:'نمای دوبعدی',exact:true}).tap();
 assert.equal(await a.evaluate(()=>window.__sessionEnds),0);
 assert.equal(await ar.count(),1);
 await a.getByRole('button',{name:'نمای سه‌بعدی',exact:true}).tap();
 assert.equal(await a.evaluate(()=>document.querySelector('[data-testid="ar-workspace"]')===window.__originalWorkspace),true);
 assert.equal(await ar.getAttribute('data-floor-locked'),'1');
 assert.equal(await a.evaluate(()=>window.__sessionCalls),1);
 assert.equal(await a.evaluate(()=>window.__sessionEnds),0);
 assert.equal(await a.getByTestId('3d-fov-wide').getAttribute('aria-pressed'),'true');
 await tracked.close();
 assert.deepEqual(errors,[]);
 console.log('PASS: live scan reaches readiness, floating Confirm locks the floor, 2D/3D reuses the same session and wide tracked camera.');
};
