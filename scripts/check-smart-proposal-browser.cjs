// Isolated normal UI flow; the read-only hook inspects private proposal/history
// so the browser can verify the approved geometry and single Undo transaction.
const {chromium}=require('C:/Users/Mayram/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict'),path=require('node:path');
const origin=process.env.KITCHYAR_TEST_ORIGIN||'http://127.0.0.1:4175';
module.exports=(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:950}}),errors=[];
  page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/app.js*',async route=>{const r=await route.fetch();await route.fulfill({response:r,body:(await r.text())+'\nwindow.__solverCheck=()=>({pending:pendingSmartLayout,undo:undoStack.length,redo:redoStack.length,items:currentItems(),previewReady:!!desktopPreview?.previewRenderer,renderedFronts:desktopPreview?.frontControls?.size});'});});
  await page.goto(origin,{waitUntil:'networkidle'});
  await page.locator('[data-action="solver-example"]').click();
  await page.locator('#plan-view').waitFor();
  const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('kitchyar.ui.v2')));
  const before=await stored(),initialItems=before[0].scene.items;
  assert.equal(before.length,1);assert.equal(initialItems.filter(o=>o.kind==='front').length,0);
  const preview=()=>page.locator('.solver-trigger').click();
  await preview();await page.locator('.solver-dialog').waitFor();
  assert.equal(await page.locator('.solver-plans svg').count(),2);
  assert.equal(await page.locator('[data-action="confirm-smart-layout"]').isEnabled(),true);
  assert.equal(await page.locator('.solver-moves li').count(),1);
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.dataset.action),'confirm-smart-layout');
  await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement.dataset.action),'cancel-smart-layout');
  const bounds=await page.locator('.solver-dialog').boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=1366);
  await page.screenshot({path:path.join(__dirname,'../../outputs/solver-stage1-desktop.png')});
  await page.locator('[data-action="cancel-smart-layout"]').click();assert.deepEqual(await stored(),before);
  assert.equal(await page.evaluate(()=>window.__solverCheck().undo),0);
  await preview();await page.keyboard.press('Escape');assert.deepEqual(await stored(),before);
  assert.equal(await page.evaluate(()=>window.__solverCheck().pending),null);
  assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('solver-trigger')),true);
  await preview();await page.locator('.dialog-cover').click({position:{x:3,y:3}});assert.deepEqual(await stored(),before);
  await preview();const inspected=await page.evaluate(()=>window.__solverCheck().pending.result.items);
  await page.locator('[data-action="confirm-smart-layout"]').click();
  assert.deepEqual((await stored())[0].scene.items,inspected);
  assert.equal(await page.evaluate(()=>window.__solverCheck().undo),1);
  await page.locator('[data-action="undo"]').click();assert.deepEqual((await stored())[0].scene.items,initialItems);
  await page.locator('[data-action="redo"]').click();assert.deepEqual((await stored())[0].scene.items,inspected);
  await page.locator('[data-mode="3d"]').click();
  await page.waitForFunction(()=>window.__solverCheck().previewReady&&window.__solverCheck().renderedFronts===8);
  await page.screenshot({path:path.join(__dirname,'../../outputs/solver-stage1-3d.png')});
  await page.reload({waitUntil:'networkidle'});assert.deepEqual((await stored())[0].scene.items,inspected);
  await page.locator('[data-mode="2d"]').click();
  // A second tab/storage edit invalidates the displayed proposal at confirmation.
  await preview();await page.evaluate(()=>{const ps=JSON.parse(localStorage.getItem('kitchyar.ui.v2'));ps[0].revision++;localStorage.setItem('kitchyar.ui.v2',JSON.stringify(ps));});
  const changed=await stored();await page.locator('[data-action="confirm-smart-layout"]').click();assert.deepEqual(await stored(),changed);
  await page.locator('#toast').filter({hasText:'تغییر کرده'}).waitFor();
  await page.reload({waitUntil:'networkidle'});await page.locator('[data-mode="2d"]').click();
  for(const viewport of [{width:820,height:1180},{width:390,height:844}]){
   await page.setViewportSize(viewport);await preview();
   const box=await page.locator('.solver-dialog').boundingBox();
   assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width+.5&&box.y+box.height<=viewport.height+.5);
   assert.equal(await page.locator('.solver-dialog').evaluate(e=>e.scrollWidth<=e.clientWidth),true);
   await page.locator('[data-action="cancel-smart-layout"]').scrollIntoViewIfNeeded();
   await page.screenshot({path:path.join(__dirname,'../../outputs/solver-stage1-'+viewport.width+'.png')});
   await page.keyboard.press('Escape');
  }
  // A locked, unresolved sink gives a visible conflict and a disabled Apply.
  await page.evaluate(async()=>{const M=await import('./smart-layout-proposal.js?v=solver1');const ps=JSON.parse(localStorage.getItem('kitchyar.ui.v2'));ps[0].scene.items=M.solverExampleItems();ps[0].scene.items.find(e=>e.subtype==='sink').positionLocked=true;localStorage.setItem('kitchyar.ui.v2',JSON.stringify(ps));});
  await page.reload({waitUntil:'networkidle'});await page.locator('[data-mode="2d"]').click();const locked=await stored();
  await preview();assert.equal(await page.locator('[data-action="confirm-smart-layout"]').isDisabled(),true);
  assert.ok(await page.locator('.solver-issues').isVisible());await page.keyboard.press('Escape');assert.deepEqual(await stored(),locked);
  assert.deepEqual(errors,[]);
  console.log('PASS: actual app entry, sample, previews, cancel/Escape/backdrop, focus, exact apply, one Undo, Redo, 3D rendered fronts, reload, stale storage, conflict and desktop/tablet/mobile layouts; no page errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
