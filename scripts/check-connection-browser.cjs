const {chromium}=require('C:/Users/Mayram/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../apps/preview'),origin='https://kitchyar-check.invalid';
const prefix='https://cdn.jsdelivr.net/gh/MaxLightner/tolica-ar@0abbab05c15eed4f3922d1e1dc74b5c17b82e8be/';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webp':'image/webp'};
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const context=await browser.newContext(),page=await context.newPage(),external=[],errors=[];
  let failApp=false;
  await context.route('**/*',async route=>{
   const url=route.request().url(),parsed=new URL(url);let file;
   if(parsed.origin===origin){
    if(failApp&&parsed.pathname==='/app.js')return route.fulfill({status:503,body:'test failure'});
    file=path.resolve(root,'.'+decodeURIComponent(parsed.pathname)+(parsed.pathname.endsWith('/')?'index.html':''));
   }else if(url.startsWith(prefix)){
    // Archived version is tested with byte-identical pinned CDN fixtures,
    // not a claim that this CDN is reachable on the user's network.
    file=path.resolve(root,'vendor/chido',parsed.pathname.split(prefix.split('jsdelivr.net')[1])[1]);
   }else{external.push(url);return route.abort();}
   if(!file.startsWith(root+path.sep))return route.fulfill({status:403,body:''});
   try{return route.fulfill({status:200,contentType:types[path.extname(file)]||'application/octet-stream',body:await fs.readFile(file)});}
   catch{return route.fulfill({status:404,body:''});}
  });
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/connection-check.html');
  await page.waitForFunction(()=>document.querySelector('#report').textContent.includes('Check complete'));
  assert.doesNotMatch(await page.locator('#report').innerText(),/FAIL/);
  assert.equal(await page.locator('#checks li').count(),5);
  assert.deepEqual(external,[]);
  failApp=true;await page.reload();
  await page.waitForFunction(()=>document.querySelector('#report').textContent.includes('Check complete'));
  assert.match(await page.locator('#report').innerText(),/FAIL .\/app.js \/ Error: HTTP 503/);
  assert.match(await page.locator('#report').innerText(),/OK .\/vendor\/chido\/vendor\/three.core.js/);
  failApp=false;
  await page.evaluate(()=>localStorage.setItem('kitchyar.ui.v2','[{"id":"untouched","name":"Existing project"}]'));
  await page.locator('a[href="./connection-baseline/#/welcome"]').click();
  await page.locator('[data-action="new"]').waitFor();
  await page.locator('[data-action="new"]').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('kitchyar.ui.v2')),'[{"id":"untouched","name":"Existing project"}]');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('kitchyar.connection-baseline.v1')).length),1);
  assert.deepEqual(external,['https://maxlightner.github.io/tolica-ar/assets/welcome.png']);
  assert.deepEqual(errors,[]);
  const noJS=await browser.newContext({javaScriptEnabled:false});
  await noJS.route('**/*',r=>fs.readFile(path.join(root,'connection-check.html')).then(body=>r.fulfill({status:200,contentType:'text/html',body})));
  const plain=await noJS.newPage();await plain.goto(origin+'/connection-check.html');
  await plain.locator('#document-status').waitFor();
  assert.match(await plain.locator('body').innerText(),/جاوااسکریپت در مرورگر غیرفعال/);
  console.log('PASS: dependency-free document with JavaScript disabled; independent file probes and exact HTTP failures; archived welcome/project creation with pinned CDN fixtures; existing project storage untouched.');
  await context.close();await noJS.close();
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
