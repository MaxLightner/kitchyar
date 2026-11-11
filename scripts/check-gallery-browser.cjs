const {chromium}=require('C:/Users/Mayram/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),path=require('node:path');
const origin=process.env.KITCHYAR_TEST_ORIGIN||'http://127.0.0.1:4175';
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:1000}}),errors=[],requests=[];
  page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/assets\/styles\/.*\.json/.test(r.url()))requests.push(r.url());});
  await page.route('**/app.js*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text())+'\nwindow.__galleryCheck=()=>({project:currentProject(),undo:undoStack.length,preview:desktopPreview});'});});
  await page.goto(origin,{waitUntil:'networkidle'});
  const styles=await page.evaluate(async()=>{
   const G=await import('./geometry.js?v=gallery2'),M=await import('./materials.js?v=library65');
   let r=G.placeWall([],{x:0,z:0},{x:5,z:0});r=G.placeCabinet(r.items,{x:0,z:0},{x:5,z:0});r=G.placeCabinet(r.items,{x:0,z:0},{x:5,z:0},{kind:'upper'});
   r=G.placeEquipment(r.items,{x:1.5,z:.3},'sink');r=G.placeEquipment(r.items,{x:3.4,z:.3},'stove');
   localStorage.setItem('kitchyar.ui.v2',JSON.stringify([{id:'gallery',name:'آزمون گالری',revision:0,scene:{items:r.items,ceilingHeight:3},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}]));
   return M.KITCHEN_STYLES.map(s=>s.id);
  });
  await page.reload({waitUntil:'networkidle'});await page.goto(origin+'#/editor/gallery',{waitUntil:'networkidle'});await page.locator('[data-mode="2d"]').click();
  const project=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('kitchyar.ui.v2'))[0]);
  const gallery=()=>page.locator('.side-basic [data-action="open-style-gallery"]').click();
  await gallery();await page.locator('.style-grid img').evaluateAll(async imgs=>{await Promise.all(imgs.map(i=>i.decode()));});
  assert.equal(await page.locator('.style-grid button').count(),9);
  const before=await project(),count=requests.length;
  for(const id of styles){await page.locator('[data-action="select-style"][data-style="'+id+'"]').click();assert.deepEqual(await project(),before);assert.equal(requests.length,count,'selecting an image must not request its preset');}
  await page.locator('.style-dialog-head [data-action="close-dialog"]').click();
  for(const id of styles){
   await gallery();const saved=await project(),n=requests.length,undo=await page.evaluate(()=>window.__galleryCheck().undo);
   await page.locator('[data-action="select-style"][data-style="'+id+'"]').click();assert.deepEqual(await project(),saved);assert.equal(requests.length,n);
   await page.locator('[data-action="apply-style"]').click();await page.locator('.style-dialog').waitFor({state:'detached'});
   const changed=await project();assert.equal(changed.scene.styleId,id);assert.equal(await page.evaluate(()=>window.__galleryCheck().undo),undo+1);
   for(const c of changed.scene.items.filter(c=>c.upperTiers)){assert.ok(c.upperTiers.lowerHeight<=.6+1e-8);assert.ok(Math.abs(c.elevation+c.height-3)<1e-8);}
  }
  // Fetch failure and malformed preset both leave an actionable dialog and an unchanged project.
  let mode='fail';const pattern='**/assets/styles/reference-cream.json*';
  await page.route(pattern,async route=>{if(mode==='fail')return route.fulfill({status:503,body:'Unavailable'});if(mode==='bad')return route.fulfill({status:200,contentType:'application/json',body:'{"id":"wrong"}'});return route.continue();});
  await gallery();await page.locator('[data-style="reference-cream"][data-action="select-style"]').click();
  for(const failure of ['fail','bad']){
   mode=failure;const saved=await project();await page.locator('[data-action="apply-style"]').click();
   await page.waitForFunction(()=>!document.querySelector('[data-action="apply-style"]').disabled);
   assert.deepEqual(await project(),saved);assert.equal(await page.locator('#style-progress').count(),1);
  }
  mode='ok';await page.locator('[data-action="apply-style"]').click();await page.locator('.style-dialog').waitFor({state:'detached'});await page.unroute(pattern);
  // Cancelling while the preset is in flight must never apply after the response arrives.
  let release;const gate=new Promise(resolve=>release=resolve);await page.route(pattern,async route=>{await gate;await route.continue();});
  await gallery();await page.locator('[data-style="reference-cream"][data-action="select-style"]').click();const saved=await project();
  const requested=page.waitForRequest(r=>/assets\/styles\/reference-cream.json/.test(r.url()));await page.locator('[data-action="apply-style"]').click();await requested;
  await page.locator('.style-dialog-head [data-action="close-dialog"]').click();release();await page.waitForLoadState('networkidle');assert.deepEqual(await project(),saved);await page.unroute(pattern);
  // Valid maximum ceiling, and a rejected value beyond the user's limit.
  await page.locator('[data-action="menu"]').click();const ceiling=page.locator('[data-ceiling-height]');assert.equal(await ceiling.getAttribute('max'),'3.1');
  await ceiling.fill('3.1');await ceiling.dispatchEvent('change');assert.equal((await project()).scene.ceilingHeight,3.1);
  for(const c of (await project()).scene.items.filter(c=>c.upperTiers)){assert.equal(c.upperTiers.lowerHeight,.6);assert.equal(c.height,1.6);}
  const allowed=await project();await ceiling.fill('3.2');await ceiling.dispatchEvent('change');assert.deepEqual(await project(),allowed);await page.locator('[data-action="close-menu"]').click();
  await page.locator('[data-mode="3d"]').click();await page.waitForFunction(()=>window.__galleryCheck().preview?.previewRenderer);
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(()=>window.__galleryCheck().preview?.frontControls.size>0);
  const normals=await page.evaluate(()=>{
   const r=window.__galleryCheck().preview;let tilted=0,max=0;window.__normalBackup=[];
   for(const c of r.frontControls.values())c.root.traverse(n=>{const a=n.geometry?.getAttribute('normal');if(!a||n.geometry.type!=='ExtrudeGeometry')return;
    window.__normalBackup.push({a,data:a.array.slice()});
    for(let i=0;i<a.count;i++){if(Math.abs(a.getZ(i))>.999&&Math.hypot(a.getX(i),a.getY(i))>.0001){tilted++;max=Math.max(max,Math.acos(Math.abs(a.getZ(i)))*180/Math.PI);}}
   });return {tilted,max};
  });assert.ok(normals.tilted>0&&normals.max<1.51);
  const geometry=JSON.stringify((await project()).scene.items);
  await page.screenshot({path:path.join(__dirname,'../../outputs/kitchen-soft-normals.png')});
  await page.evaluate(()=>{for(const {a}of window.__normalBackup){for(let i=0;i<a.count;i++)if(Math.abs(a.getZ(i))>.999)a.setXYZ(i,0,0,Math.sign(a.getZ(i)));a.needsUpdate=true;}window.__galleryCheck().preview.renderPreview();});
  await page.screenshot({path:path.join(__dirname,'../../outputs/kitchen-flat-normals.png')});
  await page.evaluate(()=>{for(const {a,data}of window.__normalBackup){a.array.set(data);a.needsUpdate=true;}window.__galleryCheck().preview.renderPreview();});
  assert.equal(JSON.stringify((await project()).scene.items),geometry);assert.deepEqual(errors,[]);
  console.log('PASS: nine decoded images/presets, selection without execution/fetch, nine explicit applications, retry after network/invalid JSON, in-flight cancellation, one Undo per apply, 3/3.1m ceiling with 60cm lower tier, rejected 3.2m, subtle 3D cap normals with unchanged geometry; no page errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
