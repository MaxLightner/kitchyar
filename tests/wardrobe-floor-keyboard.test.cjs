const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');

test('wardrobe is drawn from a metric floor rectangle before extrusion',async()=>{
 const W=await import('../apps/preview/wardrobe-model.js');
 const old=W.defaultWardrobe();
 const cfg=W.wardrobeFromFloorRectangle(old,{x1:-1,z1:-.4,x2:1.4,z2:.2});
 assert.equal(cfg.width,2.4);assert.equal(cfg.depth,.6);
 assert.equal(cfg.centerX,.2);assert.equal(cfg.centerZ,-.1);
 const items=W.wardrobeItems(cfg);
 const c=items.find(o=>o.wardrobe),wall=items.find(o=>o.kind==='wall');
 assert.ok(Math.abs((c.x1+c.x2)/2-.2)<1e-8);
 assert.ok(Math.abs(c.z1+.1)<1e-8);
 assert.ok(Math.abs(wall.z1-(-.1-.3-.064))<1e-8);
 assert.ok(items.filter(f=>f.kind==='front').length>0);
 assert.throws(()=>W.wardrobeFromFloorRectangle(old,{x1:0,z1:0,x2:.5,z2:.6}),/۶۰/);
 assert.throws(()=>W.wardrobeFromFloorRectangle(old,{x1:0,z1:0,x2:1.5,z2:1.1}),/۸۰/);
});

test('an open wardrobe bay has real shelves and no exterior doors',async()=>{
 const W=await import('../apps/preview/wardrobe-model.js');
 const base=W.defaultWardrobe();
 const key=base.bays[0].key;
 const cfg=W.editWardrobeBay(base,key,{role:'open-shelves',shelves:3});
 const items=W.wardrobeItems(cfg);
 assert.equal(items.filter(f=>f.kind==='front'&&f.wardrobeBay===key&&!f.wardrobeInternal).length,0);
 const panels=W.wardrobePanels(items.find(o=>o.wardrobe));
 assert.equal(panels.filter(p=>p.bay===key&&p.part==='shelf').length,3);
});

test('top-view Word-style floor gesture UI and extrusion are wired',async()=>{
 const T=await import('../apps/preview/wardrobe-box-tool.js');
 const svg=T.renderWardrobeTop({width:2.4,height:2.4,depth:.6},{drawing:true});
 assert.match(svg,/data-w-floor-target/);assert.match(svg,/wardrobe-footprint-preview/);
 assert.match(T.renderWardrobeTop({width:2.4,height:2.4,depth:.6},{drawing:false}),/240 × 60 cm/);
 const work=fs.readFileSync('apps/preview/wardrobe-workspace.js','utf8');
 assert.match(work,/wardrobeBoxStage:'floor'/);
 assert.match(work,/wardrobeFromFloorRectangle\(config\(\),/);
 assert.match(work,/wardrobeBoxStage:'height'/);
 assert.match(work,/wardrobeBoxStage:'ready'/);
 assert.match(work,/function renderBoxGhost/);
 assert.match(work,/function finishBoxHeight/);
 assert.match(work,/data-w-action="redraw-box"/);
 assert.match(work,/data-view="top"/);
 assert.match(work,/data-w-front-id/);
});

test('keyboard mappings preserve typing and normalize undo/delete/confirm/pan/3D',async()=>{
 const K=await import('../apps/preview/desktop-shortcuts.js');
 const target={closest:()=>null},editable={closest:selector=>selector.startsWith('input')?{}:null};
 const command=(code,key,opts={})=>K.desktopCommand({code,key,target,...opts});
 assert.equal(command('Enter','Enter'),'confirm');
 assert.equal(command('Space',' '),'pan');
 assert.equal(command('Delete','Delete'),'delete');
 assert.equal(command('Backspace','Backspace'),'delete');
 assert.equal(command('KeyZ','z',{ctrlKey:true}),'undo');
 assert.equal(command('KeyZ','z',{ctrlKey:true,shiftKey:true}),'redo');
 assert.equal(command('KeyY','y',{ctrlKey:true}),'redo');
 assert.equal(command('KeyS','s',{ctrlKey:true}),'save');
 assert.equal(command('Digit1','1'),'top');
 assert.equal(command('Digit2','2'),'front');
 assert.equal(command('Digit3','3'),'three');
 assert.equal(command('KeyW','w'),'wall');
 assert.equal(K.desktopCommand({code:'Backspace',key:'Backspace',target:editable}),null);
 assert.equal(K.desktopCommand({code:'Space',key:' ',target:editable}),null);
 assert.equal(K.desktopCommand({code:'KeyZ',key:'z',target:editable,ctrlKey:true}),null);
 assert.equal(K.desktopCommand({code:'KeyS',key:'s',target:editable,ctrlKey:true}),'save');
});


test('floor box respects full allowable widths and keeps handcrafted bays when possible',async()=>{
 const W=await import('../apps/preview/wardrobe-model.js');
 for(const width of [.6,1.2,2.4,6]){
  const cfg=W.wardrobeFromFloorRectangle(W.defaultWardrobe(),{x1:0,z1:0,x2:width,z2:.6});
  assert.equal(cfg.width,width);assert.equal(cfg.depth,.6);
  assert.ok(W.wardrobeItems(cfg).some(o=>o.wardrobe));
 }
 const original=W.defaultWardrobe();
 const special=W.editWardrobeBay(original,original.bays[0].key,{role:'open-shelves',shelves:5});
 const rebuilt=W.wardrobeFromFloorRectangle(special,{x1:0,z1:0,x2:2.3,z2:.65},{preserveBays:true});
 assert.equal(rebuilt.bays[0].role,'open-shelves');
 assert.equal(rebuilt.bays[0].shelves,5);
 assert.equal(rebuilt.bays.length,special.bays.length);
 assert.throws(()=>W.wardrobeFromFloorRectangle(special,{x1:0,z1:0,x2:4,z2:.65},{preserveBays:true}),/تقسیمات|یونیت/);
});

test('both web editing workspaces wire mouse and keyboard commands',()=>{
 const kitchen=fs.readFileSync('apps/preview/app.js','utf8'),wardrobe=fs.readFileSync('apps/preview/wardrobe-workspace.js','utf8');
 assert.match(kitchen,/function handleKitchenKeyboard/);
 assert.match(kitchen,/document\.addEventListener\('wheel'/);
 assert.match(kitchen,/planViewport=\[point\.x/);
 assert.match(kitchen,/if\(command==='delete'\)/);
 assert.match(kitchen,/if\(command==='pan'\)/);
 assert.match(kitchen,/document\.addEventListener\('keyup'/);
 assert.match(wardrobe,/topHost\.addEventListener\('pointerdown'/);
 assert.match(wardrobe,/topHost\.addEventListener\('pointermove'/);
 assert.match(wardrobe,/topHost\.addEventListener\('pointerup'/);
 assert.match(wardrobe,/heightHandle\.addEventListener\('pointermove'/);
 assert.match(wardrobe,/if\(command==='delete'\)/);
 assert.match(wardrobe,/if\(command==='pan'\)/);
 assert.match(wardrobe,/wardrobeBoxCreated:true/);
});
