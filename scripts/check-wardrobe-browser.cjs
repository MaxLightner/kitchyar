const {chromium}=require('C:/Users/Mayram/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const origin=process.env.KITCHYAR_TEST_ORIGIN||'http://127.0.0.1:4175';
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.setDefaultTimeout(20000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/app.js*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text())+'\nwindow.__wardrobeCheck=()=>({project:projects.find(p=>p.id===activeId),renderer:wardrobeWorkspace?.renderer});'});});
  const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('kitchyar.ui.v2')));
  const wardrobe=async()=>(await stored()).find(p=>p.kind==='wardrobe');
  const items=async()=>(await wardrobe()).scene.items;
  const settle=()=>page.waitForFunction(()=>window.__wardrobeCheck().renderer?.frontMotions.size===0);
  await page.goto(origin,{waitUntil:'networkidle'});
  // Keep an existing kitchen alongside the new wardrobe.
  await page.locator('[data-action="solver-example"]').click();const kitchen=(await stored())[0];
  await page.locator('[data-action="projects"]').first().click();await page.locator('[data-action="new-wardrobe"]').click();
  await page.locator('.wardrobe-app').waitFor();await page.locator('#wardrobe-3d canvas').waitFor();
  assert.equal(await page.locator('[data-category="equipment"]').count(),0);
  assert.equal((await stored()).length,2);assert.deepEqual((await stored()).find(p=>p.id===kitchen.id),kitchen);
  const initial=await wardrobe();assert.equal(initial.scene.items.filter(f=>f.subtype==='door').length,5);
  // Storage failure must roll back geometry/history, rather than display an unsaved design.
  await page.evaluate(()=>{window.__originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='kitchyar.ui.v2')throw Error('storage-test');return window.__originalSetItem.call(this,k,v);};});
  await page.locator('[data-w-field="width"]').fill('260');await page.locator('[data-w-action="dimensions"]').click();
  assert.deepEqual(await wardrobe(),initial);
  assert.deepEqual(await page.evaluate(()=>window.__wardrobeCheck().project),initial);
  assert.equal(await page.locator('[data-w-action="undo"]').isDisabled(),true);
  await page.evaluate(()=>{Storage.prototype.setItem=window.__originalSetItem;});
  await page.locator('[data-w-field="width"]').fill('240');
  // Closed doors block internal drawer operations without recording a change.
  await page.locator('.wardrobe-drawer-toggle').first().click();assert.deepEqual(await wardrobe(),initial);
  assert.match(await page.locator('#toast').innerText(),/ابتدا همه/);
  await page.locator('[data-w-action="all-open"]').click();await settle();
  assert.ok((await items()).filter(f=>f.subtype==='door').every(f=>f.openFraction===1));
  const overlapping=await page.evaluate(()=>{
   const r=window.__wardrobeCheck().renderer,boxes=[];r.objectGroup.updateWorldMatrix(true,true);
   for(const c of r.frontControls.values())if(c.panel.subtype==='door'){
    let slab;c.root.traverse(n=>{if(!slab&&n.isMesh&&n.geometry?.type==='ExtrudeGeometry')slab=n;});
    slab.geometry.computeBoundingBox();boxes.push(slab.geometry.boundingBox.clone().applyMatrix4(slab.matrixWorld));
   }
   return boxes.some((a,i)=>boxes.slice(i+1).some(b=>Math.min(a.max.x,b.max.x)-Math.max(a.min.x,b.min.x)>.001&&Math.min(a.max.z,b.max.z)-Math.max(a.min.z,b.min.z)>.001));
  });assert.equal(overlapping,false,'adjacent open door slabs must not cross');
  await page.locator('.wardrobe-drawer-toggle').first().click();await settle();
  const drawer=(await items()).find(f=>f.wardrobeInternal&&f.openFraction===1);assert.ok(drawer);
  const motion=await page.evaluate(id=>{const r=window.__wardrobeCheck().renderer,c=r.frontControls.get(id);return {fraction:c.fraction,shift:c.root.position.z-c.pose.z,tray:!!c.tray};},drawer.id);
  assert.equal(motion.fraction,1);assert.ok(motion.shift>.3&&motion.tray);
  const drawOpen=await wardrobe();await page.locator('.wardrobe-bay').nth(1).locator('.wardrobe-door-row button').first().click();
  assert.deepEqual(await wardrobe(),drawOpen);assert.match(await page.locator('#toast').innerText(),/پیش از بستن/);
  await page.locator('[data-w-action="all-close"]').click();
  assert.equal(await page.evaluate(key=>{const r=window.__wardrobeCheck().renderer,d=r.items.find(f=>f.subtype==='door'&&f.wardrobeBay===key);return r.frontMotions.get(d.id).start>performance.now()+250;},drawer.wardrobeBay),true,'doors wait for the interior drawers to close');
  await settle();await page.locator('[data-w-action="all-open"]').click();await settle();
  // Mirror is independently selectable and does not change another bay.
  const bay3=page.locator('.wardrobe-bay').nth(2);await bay3.locator('[data-w-mirror="0"]').check();
  const mirror=(await items()).find(f=>f.mirror);assert.ok(mirror);
  assert.equal(await page.evaluate(id=>{let found=false;window.__wardrobeCheck().renderer.frontControls.get(id).root.traverse(n=>{if(n.isMesh&&n.material?.metalness===1&&n.material?.roughness===.025)found=true;});return found;},mirror.id),true);
  // A real desk removes the corresponding full-height doors and keeps other mirrors.
  const first=page.locator('.wardrobe-bay').first();await first.locator('[data-w-role]').selectOption('desk');await first.locator('[data-w-action="bay-apply"]').click();
  const c=(await items()).find(c=>c.wardrobe);assert.equal(c.wardrobe.bays[0].role,'desk');
  assert.equal((await items()).filter(f=>f.wardrobeBay===c.wardrobe.bays[0].key).length,0);
  assert.ok((await items()).find(f=>f.id===mirror.id&&f.mirror));
  await page.locator('[data-w-action="all-open"]').click();await settle();
  await page.screenshot({path:path.join(__dirname,'../../outputs/wardrobe-3d.png')});
  await page.locator('[data-w-action="view"][data-view="inside"]').click();
  await page.screenshot({path:path.join(__dirname,'../../outputs/wardrobe-inside.png')});
  // Dimensions use the wardrobe height, independently of kitchen upper cabinets.
  const beforeSize=(await wardrobe()).scene;await page.locator('[data-w-field="height"]').fill('270');
  await page.locator('[data-w-action="dimensions"]').click();const resized=(await wardrobe()).scene;
  assert.equal(resized.items.find(c=>c.wardrobe).height,2.7);
  await page.locator('[data-w-action="undo"]').click();assert.deepEqual((await wardrobe()).scene,beforeSize);
  await page.locator('[data-w-action="redo"]').click();assert.deepEqual((await wardrobe()).scene,resized);
  await page.locator('[data-w-action="parts"]').click();assert.ok(await page.locator('#wardrobe-parts tbody tr').count()>20);
  assert.match(await page.locator('#wardrobe-parts').innerText(),/صفحهٔ میز/);assert.match(await page.locator('#wardrobe-parts').innerText(),/آینه/);
  const downloadPromise=page.waitForEvent('download');await page.locator('[data-w-action="csv"]').click();const download=await downloadPromise;
  assert.match(fs.readFileSync(await download.path(),'utf8'),/desk|صفحهٔ میز/);
  await page.reload({waitUntil:'networkidle'});await page.locator('.wardrobe-app').waitFor();assert.deepEqual((await wardrobe()).scene,resized);
  for(const viewport of [{width:820,height:1180},{width:390,height:844}]){
   await page.setViewportSize(viewport);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.locator('[data-w-action="view"][data-view="inside"]').click();
   await page.screenshot({path:path.join(__dirname,'../../outputs/wardrobe-'+viewport.width+'.png'),fullPage:true});
  }
  await page.locator('.wardrobe-header a').click();await page.locator('[data-action="open"][data-id="'+initial.id+'"]').click();
  await page.locator('.wardrobe-app').waitFor();assert.deepEqual((await wardrobe()).scene,resized);
  assert.deepEqual((await stored()).find(p=>p.id===kitchen.id),kitchen);
  // A change to this project's persisted revision invalidates editing in the old tab.
  await page.evaluate(()=>{const ps=JSON.parse(localStorage.getItem('kitchyar.ui.v2'));ps.find(p=>p.kind==='wardrobe').revision++;localStorage.setItem('kitchyar.ui.v2',JSON.stringify(ps));});
  const stale=await wardrobe();await page.locator('[data-w-action="all-close"]').click();assert.deepEqual(await wardrobe(),stale);
  assert.match(await page.locator('#toast').innerText(),/تب دیگری/);
  assert.deepEqual(errors,[]);
  console.log('PASS: wardrobe entry beside existing kitchen, actual 3D interior and drawer motion, door/drawer interlocks, independent mirror, usable desk, metric dimensions, Undo/Redo, CSV from model, save/reload/project return, tablet/mobile; no page errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
