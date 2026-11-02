const {chromium}=require('C:/Users/Mayram/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,args:['--disable-gpu-sandbox']});
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4173');
 await page.evaluate(async()=>{
  const G=await import('./geometry.js?v=library65');let r=G.placeWall([],{x:-3,z:0},{x:3,z:0});const w=r.selectedId;
  r=G.placeCabinet(r.items,{x:-3,z:0,hostId:w,side:1},{x:3,z:0});r=G.placeFrontLayout(r.items,r.selectedId,'smart');
  r=G.placeCabinet(r.items,{x:-3,z:0,hostId:w,side:1},{x:3,z:0},{kind:'upper'});
  r=G.placeEquipment(r.items,{x:-1.5,z:.3},'sink');r=G.placeEquipment(r.items,{x:.3,z:.3},'stove');r=G.placeEquipment(r.items,{x:2,z:.3},'washer');r=G.planSmartKitchen(r.items);
  localStorage.setItem('kitchyar.ui.v2',JSON.stringify([{id:'qa',name:'آشپزخانه بررسی',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),scene:{items:r.items,ceilingHeight:3,materials:{}},revision:0}]));
 });
 await page.reload();await page.goto('http://127.0.0.1:4173/#/editor/qa');await page.locator('[data-mode="2d"]').click();
 const stored=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('kitchyar.ui.v2'))[0]);
 const out=path.resolve('../outputs');fs.mkdirSync(out,{recursive:true});
 for(const id of ['reference-cream','reference-classic','reference-green','reference-white','reference-grey']){
  await page.locator('[data-category="fronts"]').click();await page.locator('[data-action="open-style-gallery"]').first().click();
  await page.locator('[data-action="select-style"][data-style="'+id+'"]').click();await page.waitForFunction(()=>!document.querySelector('.style-dialog'));
  const p=await stored();if(p.scene.styleId!==id)throw Error('sample not saved '+id);
  await page.locator('[data-mode="3d"]').click();await page.waitForTimeout(400);await page.screenshot({path:path.join(out,id+'.png')});await page.locator('[data-mode="2d"]').click();
 }
 await page.reload();await page.locator('[data-mode="2d"]').click();if((await stored()).scene.styleId!=='reference-grey')throw Error('reload');
 // Exercise actual UI placement of all newly introduced object tools.
 await page.locator('[data-category="decor"]').click();await page.locator('[data-tool="island-l"]').click();await page.locator('#plan-view').click({position:{x:400,y:240}});
 const p=await stored();if(!p.scene.items.some(o=>o.type==='island-l'))throw Error('island placement failed '+await page.locator('#toast').textContent());
 await page.locator('[data-mode="3d"]').click();await page.waitForTimeout(300);await page.screenshot({path:path.join(out,'island-L.png')});
 console.log(JSON.stringify({errors,style:p.scene.styleId,objects:p.scene.items.filter(o=>o.kind==='scene-object').map(o=>o.type),screenshots:out}));
 await browser.close();if(errors.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exit(1)});
