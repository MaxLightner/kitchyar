// Focused real-browser checks; instrumentation exposes state without changing production code.
const {chromium}=require('C:/Users/Mayram/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage({viewport:{width:1366,height:950}}),errors=[];
 page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/app.js*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text())+'\nwindow.__editor={state:()=>({mode,selection,lastFrontTap,items:currentItems(),floor,desktopPreview}),select:id=>{selection=id;selectedUnit=null;showScene();},parkAR:session=>{floor??=new FloorAR(document.getElementById("editor-root"),()=>{},()=>{});floor.session=session;floor.locked=true;}};'});});
 await page.goto('http://127.0.0.1:4173',{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{
  const G=await import('./geometry.js?v=editor67'),O=await import('./scene-objects.js?v=editor67'),L=await import('./design-library.js?v=editor67');
  let r=G.placeWall([],{x:-3,z:0},{x:3,z:0});const wall=r.selectedId;
  r=G.placeWall(r.items,{x:3,z:0},{x:3,z:4});const side=r.selectedId;
  r=G.placeCabinetRoute(r.items,{x:-2.8,z:0,hostId:wall,side:1},{x:3,z:3.8,hostId:side},{kind:'base',depth:.6});
  for(const c of r.items.filter(o=>o.kind==='cabinet'))r=G.placeFrontLayout(r.items,c.id,'smart');
  r=G.placeEquipment(r.items,{x:-1.4,z:.35},'sink');r=G.placeEquipment(r.items,{x:-.3,z:.35},'washer');r=G.placeEquipment(r.items,{x:1.1,z:.35},'stove');
  r=G.placeCabinetRoute(r.items,{x:-2.8,z:0,hostId:wall,side:1},{x:3,z:3.8,hostId:side},{kind:'upper',depth:.35});r=L.configureTiers(r.items,{ceilingHeight:3});
  r=G.placeEquipment(r.items,{x:2.6,z:2.7},'fridge');
  r=G.placeWall(r.items,{x:-3,z:4},{x:0,z:4});r=G.placeTallCabinet(r.items,{x:-2.2,z:3.7},{width:1});
  r=O.placeObject(r.items,{x:-.8,z:2.3},'dining6');r=O.placeObject(r.items,{x:0,z:0},'ceiling',{ceilingHeight:3});
  localStorage.setItem('kitchyar.ui.v2',JSON.stringify([{id:'workflow',name:'بررسی ویرایش آشپزخانه',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),scene:{items:r.items,ceilingHeight:3},revision:0}]));
 });
 await page.reload({waitUntil:'domcontentloaded'});await page.goto('http://127.0.0.1:4173/#/editor/workflow',{waitUntil:'domcontentloaded'});
 const state=()=>page.evaluate(()=>{const s=window.__editor.state();return {mode:s.mode,selection:s.selection,items:s.items};});
 const choose=async id=>{await page.evaluate(id=>window.__editor.select(id),id);};
 const inspect=async id=>{await choose(id);if(!await page.locator('#object-editor').isVisible())await page.locator('[data-action="toggle-inspector"]').click();};
 await page.locator('.mini-map').click();assert.equal((await state()).mode,'2d');assert.equal(await page.locator('#plan-view').count(),1);assert.equal(await page.locator('#elevation-panel').count(),0);
 // Minimap opens the same editable plan. Drag the dining table and its rotation handle.
 let items=(await state()).items,table=items.find(o=>o.type==='dining6');await choose(table.id);
 const move=page.locator('#plan-view [data-handle="move"]').first();let box=await move.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+35,box.y+box.height/2+15,{steps:5});await page.mouse.up();
 let changed=(await state()).items.find(o=>o.id===table.id);assert.ok(Math.hypot(changed.x-table.x,changed.z-table.z)>.1,'table move');
 const rotate=page.locator('#plan-view [data-handle="rotate"]').first();box=await rotate.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2-20,box.y+box.height/2+45,{steps:5});await page.mouse.up();
 assert.ok(Math.abs((await state()).items.find(o=>o.id===table.id).rotation)>.1,'table rotation');
 // Tall controls change real saved fronts, with independent sliding and shelf settings.
 const tall=items.find(o=>o.subtype==='tall');await inspect(tall.id);await page.locator('[data-action="toggle-tall-fronts"]').click();await page.locator('[data-action="tall-rows"][data-count="2"]').click();await page.locator('[data-action="tall-leaves"][data-count="2"]').click();
 await page.locator('[data-tall-option="opening"]').selectOption('sliding');await page.locator('[data-tall-option="shelves"]').fill('5');await page.locator('[data-tall-option="shelves"]').dispatchEvent('change');
 let tallNow=(await state()).items.find(o=>o.id===tall.id);assert.equal(tallNow.tallOpening,'sliding');assert.equal(tallNow.tallShelves,5);assert.equal((await state()).items.filter(o=>o.kind==='front'&&o.hostId===tall.id).length,4);
 // Ceiling offers only height and works with open wall boundaries.
 const roof=items.find(o=>o.type==='ceiling');await inspect(roof.id);assert.deepEqual(await page.locator('#object-editor [data-edit]').evaluateAll(es=>es.map(e=>e.dataset.edit)),['height']);
 await page.locator('[data-edit="height"]').fill('2.7');await page.locator('[data-action="apply-edit"]').click();
 const tiers=(await state()).items.filter(o=>o.upperTiers);assert.ok(tiers.every(o=>Math.abs(o.height-1.2)<.001&&Math.abs(o.upperTiers.lowerHeight-.4)<.001));
 await page.locator('[data-action="close-object"]').click();
 // Brush affects one panel; bucket affects only its wall and cabinet layer.
 await page.locator('[data-category="material"]').click();assert.equal(await page.locator('[data-surface="baseBody"],[data-surface="upperBody"]').count(),0);
 await page.locator('[data-action="paint-tool"][data-tool="brush"]').click();await page.locator('[data-action="set-material"][data-surface="baseFront"][data-material="deep-green"]').click();
 items=(await state()).items;const front=items.find(o=>o.kind==='front'&&items.find(c=>c.id===o.hostId)?.subtype==='base');
 await page.locator('#plan-view [data-item-id="'+front.id+'"]').first().dispatchEvent('pointerup',{clientX:400,clientY:300});
 assert.equal((await state()).items.find(o=>o.id===front.id).materialId,'deep-green');assert.equal((await state()).items.filter(o=>o.kind==='front'&&o.materialId==='deep-green').length,1);
 await page.locator('[data-category="material"]').click();await page.locator('[data-action="paint-tool"][data-tool="bucket"]').click();await page.locator('[data-action="set-material"][data-surface="baseFront"][data-material="ivory-matte"]').click();
 await page.locator('#plan-view [data-item-id="'+front.id+'"]').first().dispatchEvent('pointerup',{clientX:400,clientY:300});
 const current=(await state()).items,host=current.find(o=>o.id===front.hostId),sameRow=current.filter(o=>o.kind==='cabinet'&&o.hostId===host.hostId&&o.subtype==='base').map(o=>o.id);assert.ok(current.filter(o=>o.kind==='front'&&sameRow.includes(o.hostId)).every(o=>o.materialId==='ivory-matte'));
 await page.locator('[data-action="select"]').click();
 // Free 3D editor, exact ray picking and camera controls.
 await page.locator('[data-mode="3d"]').click();await page.waitForFunction(()=>window.__editor.state().desktopPreview?.previewRenderer);
 const targets=await page.evaluate(()=>{
  const q=window.__editor.state().desktopPreview;q.previewOrbit={x:0,y:1,radius:7,yaw:Math.PI/2,pitch:.15};q.renderPreview();
  const r=q.previewRenderer.domElement.getBoundingClientRect(),hits=[];
  for(const [id,c]of q.frontControls){const f=q.items.find(o=>o.id===id),host=q.items.find(o=>o.id===f.hostId);if(host?.subtype!=='base'||host.hostId!==q.items.find(o=>o.kind==='wall').id)continue;let mesh;c.root.traverse(o=>{if(!mesh&&o.isMesh)mesh=o;});const v=mesh?.getWorldPosition(new q.previewCamera.position.constructor());if(!v)continue;v.project(q.previewCamera);const x=r.left+(v.x+1)*r.width/2,y=r.top+(1-v.y)*r.height/2;if(q.pickPreviewObject(x,y)===id)hits.push({id,x,y});}return hits;
 });assert.ok(targets.length>=2,'two directly pickable front panels');
 for(const t of targets.slice(0,2)){await page.mouse.click(t.x,t.y);await page.mouse.click(t.x,t.y);assert.equal((await state()).selection,t.id);assert.equal((await state()).items.find(o=>o.id===t.id).openFraction,1);await page.waitForTimeout(600);}
 const before=await page.evaluate(()=>({...window.__editor.state().desktopPreview.previewOrbit}));await page.mouse.move(650,600);await page.mouse.wheel(0,-100);await page.mouse.down({button:'right'});await page.mouse.move(690,620,{steps:4});await page.mouse.up({button:'right'});const after=await page.evaluate(()=>({...window.__editor.state().desktopPreview.previewOrbit}));assert.ok(after.radius<before.radius);assert.ok(Math.abs(after.x-before.x)>.01);
 await page.locator('[data-action="environment"]').click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('kitchyar.ui.v2'))[0].scene.render.environment),'warm');
 await page.locator('.mini-map').click();assert.equal((await state()).mode,'2d');await page.locator('.mini-map').click();assert.equal((await state()).mode,'3d');
 // An already running AR session survives leaving/returning. Hardware tracking is not mocked as proof.
 await page.evaluate(()=>{window.__ended=0;window.__mockSession={domOverlayState:{type:'screen'},end(){window.__ended++;}};window.__editor.parkAR(window.__mockSession);});
 await page.locator('[data-mode="ar"]').click();await page.locator('[data-action="ar-wide"]').click();assert.equal(await page.locator('[data-action="ar-wide"]').getAttribute('aria-pressed'),'true');await page.locator('[data-action="ar-wide"]').click();assert.equal(await page.locator('[data-action="ar-wide"]').getAttribute('aria-pressed'),'false');
 await page.locator('[data-mode="3d"]').click();assert.equal(await page.evaluate(()=>window.__ended),0);assert.equal(await page.evaluate(()=>window.__editor.state().floor.session===window.__mockSession),true);
 await page.screenshot({path:path.resolve('../outputs/editor-workflow.png')});
 await page.setViewportSize({width:820,height:1180});await page.locator('.mini-map').click();assert.equal((await state()).mode,'2d');await page.screenshot({path:path.resolve('../outputs/editor-plan-tablet.png')});await page.locator('.mini-map').click();assert.equal((await state()).mode,'3d');assert.equal(await page.locator('.editor-header').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);await page.screenshot({path:path.resolve('../outputs/editor-tablet.png')});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({minimap:true,tall:true,roof:true,paint:true,rayPicking:true,navigation:true,parkedAR:true,wideToggle:true,tablet:true,errors}));await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
