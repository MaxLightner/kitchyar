const {chromium}=require('C:/Users/Mayram/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../apps/preview');
(async()=>{
 let server,browser;
 try{
  let origin=process.env.KITCHYAR_TEST_ORIGIN;
  if(!origin){
   server=http.createServer(async(req,res)=>{
    try{
     const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
     if(!file.startsWith(root+path.sep))throw Error('path');
     const ext=path.extname(file),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.glb':'model/gltf-binary','.json':'application/json'};
     res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-store'});res.end(await fs.readFile(file));
    }catch{res.writeHead(404);res.end();}
   });
   await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
   origin='http://127.0.0.1:'+server.address().port+'/';
  }
  const siteOrigin=new URL(origin).origin;
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],external=[];
  page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(/^https?:$/.test(url.protocol)&&url.origin!==siteOrigin){external.push(url.href);return route.abort();}
   if(!process.env.KITCHYAR_TEST_ORIGIN){
    const name=decodeURIComponent(url.pathname),file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
    if(!file.startsWith(root+path.sep))return route.fulfill({status:403,body:''});
    const ext=path.extname(file),types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.glb':'model/gltf-binary','.json':'application/json'};
    return fs.readFile(file).then(body=>route.fulfill({status:200,contentType:types[ext]||'application/octet-stream',body}),()=>route.fulfill({status:404,body:''}));
   }
   return route.continue();
  });
  await page.goto(origin,{waitUntil:'networkidle'});
  await page.locator('[data-action="solver-example"]').waitFor();
  await page.locator('[data-action="solver-example"]').click();
  await page.locator('#plan-view').waitFor();
  await page.locator('[data-mode="3d"]').click();
  await page.locator('.editor-scene canvas').waitFor();
  const exports=await page.evaluate(async()=>{
   const modules=await Promise.all(['EffectComposer','RenderPass','SSRPass','OutputPass'].map(name=>import('./vendor/three-addons/postprocessing/'+name+'.js')));
   return modules.map((module,i)=>typeof module[['EffectComposer','RenderPass','SSRPass','OutputPass'][i]]);
  });
  assert.deepEqual(exports,['function','function','function','function']);
  assert.deepEqual(external,[],'the whole editor and reflection imports must use this site only');
  assert.deepEqual(errors,[]);
  const saved=await page.evaluate(()=>localStorage.getItem('kitchyar.ui.v2'));
  await page.route('**/vendor/chido/vendor/three.core.js',route=>route.fulfill({status:503,body:'unavailable'}));
  await page.reload({waitUntil:'networkidle'});
  await page.locator('#startup-retry').waitFor({state:'visible'});
  assert.ok((await page.locator('#startup-status p').textContent()).length>30);
  assert.equal(await page.evaluate(()=>localStorage.getItem('kitchyar.ui.v2')),saved);
  await page.unroute('**/vendor/chido/vendor/three.core.js');
  await page.locator('#startup-retry').click();
  await page.locator('[data-mode="2d"]').click();
  await page.locator('#plan-view').waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('kitchyar.ui.v2')),saved);
  await page.setViewportSize({width:390,height:844});
  await page.goto(origin,{waitUntil:'networkidle'});
  await page.locator('[data-action="solver-example"]').waitFor();
  assert.deepEqual(external,[]);
  console.log('PASS: welcome, kitchen example, 3D and all SSR modules with every external host blocked; readable module-failure state, retry, saved projects preserved, mobile startup.');
 }finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
