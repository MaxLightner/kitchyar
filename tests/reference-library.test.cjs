const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const load=async()=>({G:await import('../apps/preview/geometry.js'),L:await import('../apps/preview/design-library.js'),M:await import('../apps/preview/materials.js')});
test('five reference kitchens adapt to L/U equipment and survive serialization',async()=>{
 const {G,L,M}=await load();
 for(const shape of ['L','U']){
  const fixture=await (await import('../scripts/acceptance-fixture.mjs')).build(shape),items=G.planSmartKitchen(fixture.items).items;
  const devices=items.filter(e=>e.kind==='equipment').map(({coverStyle,...e})=>e);
  const beforeFronts=items.filter(f=>f.kind==='front').map(f=>({id:f.id,hostId:f.hostId,startT:f.startT,endT:f.endT,bottomT:f.bottomT,topT:f.topT}));
  const beforeUpper=items.filter(c=>c.subtype==='upper').map(c=>({id:c.id,height:c.height,elevation:c.elevation}));
  for(const style of M.KITCHEN_STYLES.filter(s=>s.id.startsWith('reference-'))){
   const preset=JSON.parse(fs.readFileSync('apps/preview/'+style.config)),r=L.applyReference(items,style,preset);
   assert.deepEqual(r.items.filter(e=>e.kind==='equipment').map(({coverStyle,...e})=>e),devices);
   assert.ok(r.items.some(f=>f.kind==='front'&&f.style===preset.front.style));
   // A reference changes appearance, not the customer's existing semantic
   // front grid, even if its source photo happens to show two upper tiers.
   assert.deepEqual(r.items.filter(f=>f.kind==='front').map(f=>({id:f.id,hostId:f.hostId,startT:f.startT,endT:f.endT,bottomT:f.bottomT,topT:f.topT})),beforeFronts);
   assert.deepEqual(r.items.filter(c=>c.subtype==='upper').map(c=>({id:c.id,height:c.height,elevation:c.elevation})),beforeUpper);
   const restored=JSON.parse(JSON.stringify(r.items));assert.equal(JSON.stringify(restored),JSON.stringify(r.items));for(const f of restored.filter(o=>o.kind==='front'))assert.ok(G.frontPose(f,restored.find(c=>c.id===f.hostId)));
  }
 }
});
test('library parts follow the host, use preset thickness and delete with it',async()=>{
 const {G,L}=await load();let r=G.placeWall([],{x:0,z:0},{x:4,z:0});r=G.placeCabinet(r.items,{x:0,z:0},{x:4,z:0});const c=r.selectedId;
 for(const type of L.PARTS.map(p=>p.id)){
  let a=L.addPart(r.items,c,type),p=a.items.find(p=>p.id===a.selectedId),before=L.partPose(a.items,p);
  a=L.editPart(a.items,p.id,{width:.6,height:.5,thickness:.03});assert.equal(a.items.find(o=>o.id===p.id).thickness,.03);
  const host=a.items.find(o=>o.id===c);host.x1+=1;host.x2+=1;
  assert.ok(Math.abs(L.partPose(a.items,p).x-before.x-1)<1e-8);
  assert.ok(!G.removeObject(a.items,c).items.some(o=>o.id===p.id));
 }
});
test('tier carcasses share their back plane and preserve open lower hood gap',async()=>{
 const {G,L}=await load(),{cabinetCarcassPanels}=await import('../apps/preview/carcass.js');
 let r=G.placeWall([],{x:0,z:0},{x:4,z:0});r=G.placeCabinet(r.items,{x:0,z:0},{x:4,z:0},{kind:'upper'});const id=r.selectedId;
 r=L.configureTiers(r.items,{ceilingHeight:3});const c=r.items.find(o=>o.id===id),faces=r.items.filter(o=>o.kind==='front');
 const panels=cabinetCarcassPanels(c,faces);assert.ok(panels.length);
 for(const p of panels)assert.ok([p.width,p.height,p.depth,p.y,p.z].every(Number.isFinite));
 const backs=panels.filter(p=>p.part==='back');assert.equal(backs.length,2);assert.ok(Math.abs(backs[0].z-backs[1].z)<1e-8);
 assert.throws(()=>L.configureTiers(r.items,{ceilingHeight:2}),/۲۰/);
});
