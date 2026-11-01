const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const root=join(__dirname,'..');
const preset=id=>JSON.parse(readFileSync(join(root,'apps/preview/assets/styles',id+'.json'),'utf8'));
let G;

test('reference photographs are backed by executable layout and material JSON',async()=>{
 G||=await import('../apps/preview/geometry.js');
 const {MATERIALS,KITCHEN_STYLES}=await import('../apps/preview/materials.js');
 for(const style of KITCHEN_STYLES){
  const config=preset(style.id);
  assert.equal(config.id,style.id);
  assert.equal(config.version,1);
  assert.ok(config.zones.base.unitWidth>.45);
  for(const [slot,material] of Object.entries(config.materials)){
   const group=/counter/i.test(slot)?'counter':/backsplash/i.test(slot)?'backsplash':/body/i.test(slot)?'body':'front';
   assert.ok(MATERIALS[group].some(m=>m.id===material),style.id+' '+slot);
  }
  let items=G.placeWall([],{x:0,z:0},{x:4,z:0}).items;
  items=G.placeCabinet(items,{x:0,z:0},{x:4,z:0}).items;
  const result=G.applyKitchenLayout(items,style.id,{preset:config}).items;
  const faces=result.filter(o=>o.kind==='front');
  assert.ok(faces.length>2,style.id);
  assert.ok(faces.every(f=>f.handleFinish===config.front.handleFinish),style.id);
  assert.ok(faces.every(f=>f.style===config.front.style),style.id);
  assert.ok(faces.every(f=>f.handleStyle===config.zones.base.handleStyle),style.id);
  assert.equal(result.find(o=>o.kind==='cabinet').frontPreset,'photo');
 }
});

test('fridge relocation and deletion restore a single cabinet run, without forcing new doors',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:4,z:0}).items;
 items=G.placeCabinet(items,{x:0,z:0},{x:4,z:0}).items;
 const original=items.find(o=>o.kind==='cabinet');
 const installed=G.placeEquipment(items,{x:2,z:.4},'fridge');
 const moved=G.moveEquipment(installed.items,installed.selectedId,{x:.35,z:.4});
 const fridge=moved.items.find(e=>e.id===installed.selectedId);
 assert.ok(fridge.x<.6,'fridge should be able to reach the corner');
 assert.ok(moved.items.filter(o=>o.kind==='cabinet'&&o.subtype==='base').every(c=>G.lengthOf(c)>=.45));
 items=G.removeObject(moved.items,fridge.id).items;
 const bases=items.filter(c=>c.kind==='cabinet'&&c.subtype==='base');
 assert.equal(bases.length,1);
 assert.equal(bases[0].startT,original.startT);
 assert.equal(bases[0].endT,original.endT);
 assert.equal(bases[0].frontPreset,null);
 assert.equal(items.filter(o=>o.kind==='front').length,0);
});

test('refrigerator model changes and stove relocation are real geometric actions',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:6,z:0}).items;
 items=G.placeCabinet(items,{x:0,z:0},{x:6,z:0}).items;
 let placed=G.placeEquipment(items,{x:4,z:.4},'fridge');
 const fridgeId=placed.selectedId;
 placed=G.editEquipment(placed.items,fridgeId,{model:'side',fridgeFeet:30});
 const fridge=placed.items.find(e=>e.id===fridgeId);
 assert.equal(fridge.model,'side');
 assert.equal(fridge.fridgeFeet,30);
 assert.ok(fridge.width>.9);
 items=G.placeEquipment(items,{x:1,z:.35},'stove').items;
 const stove=items.find(e=>e.subtype==='stove'),hood=items.find(e=>e.subtype==='hood');
 placed=G.moveEquipment(items,stove.id,{x:3,z:.35});
 const nextStove=placed.items.find(e=>e.id===stove.id),nextHood=placed.items.find(e=>e.id===hood.id);
 assert.ok(nextStove&&nextHood);
 assert.equal(nextStove.x,3);
 assert.equal(nextHood.x,nextStove.x);
 assert.equal(nextHood.linkedStoveId,nextStove.id);
});

test('equipment removal leaves an undecorated run undecorated',async()=>{
 G||=await import('../apps/preview/geometry.js');
 let items=G.placeWall([],{x:0,z:0},{x:4,z:0}).items;
 items=G.placeCabinet(items,{x:0,z:0},{x:4,z:0}).items;
 const sink=G.placeEquipment(items,{x:1,z:.35},'sink');
 items=G.removeObject(sink.items,sink.selectedId).items;
 assert.equal(items.filter(o=>o.kind==='front').length,0);
 assert.equal(items.filter(o=>o.kind==='cabinet').length,1);
});

test('AR alignment, scan guard and draggable equipment grips are wired',()=>{
 const floor=readFileSync(join(root,'apps/preview/floor-ar.js'),'utf8');
 const app=readFileSync(join(root,'apps/preview/app.js'),'utf8');
 const edit=readFileSync(join(root,'apps/preview/edit-handles.js'),'utf8');
 assert.match(floor,/_applyAlignment\(\)/);
 assert.match(floor,/this\.floorGroup\.scale\.setScalar\(this\.alignment\.scale\)/);
 assert.match(floor,/if\(this\.scanPromise\)return this\.scanPromise/);
 assert.match(floor,/mark\('move',obj\.x/);
 assert.match(edit,/return moveEquipment\(items,id/);
 assert.match(app,/data-action="apply-style" disabled/);
 assert.match(app,/response=await fetch\(assetUrl\(style\.config\)\)/);
});
