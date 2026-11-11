const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('every catalog image has a matching valid preset and can generate L/U fronts',async()=>{
 const M=await import('../apps/preview/materials.js'),G=await import('../apps/preview/geometry.js'),L=await import('../apps/preview/design-library.js'),V=await import('../apps/preview/style-catalog.js');
 const presets=M.KITCHEN_STYLES.map(style=>{
  const image=fs.readFileSync('apps/preview/'+style.image);assert.equal(image.toString('ascii',0,4),'RIFF');assert.equal(image.toString('ascii',8,12),'WEBP');
  return {style,preset:V.validateStylePreset(style,JSON.parse(fs.readFileSync('apps/preview/'+style.config,'utf8')))};
 });
 assert.equal(presets.length,9);
 for(const shape of ['L','U']){
  const fixture=await(await import('../scripts/acceptance-fixture.mjs')).build(shape),items=G.planSmartKitchen(fixture.items).items,before=JSON.stringify(items);
  for(const {style,preset} of presets){
   const next=preset.reference?L.applyReference(items,style,preset,{ceilingHeight:3}):G.applyKitchenLayout(items,style.id,{preset});
   assert.ok(next.items.some(f=>f.kind==='front'),style.id);
   for(const f of next.items.filter(f=>f.kind==='front')){const p=G.frontPose(f,next.items.find(c=>c.id===f.hostId));assert.ok([p.x,p.y,p.z,p.width,p.height].every(Number.isFinite),style.id);}
   assert.equal(JSON.stringify(items),before);
  }
 }
 const style=M.KITCHEN_STYLES[0],bad=JSON.parse(fs.readFileSync('apps/preview/'+style.config));bad.id='wrong';assert.throws(()=>V.validateStylePreset(style,bad));
});

test('automatic lower uppers stay at most 60cm, migrate old automatic tiers and preserve manual heights',async()=>{
 const P=await import('../apps/preview/kitchen-policy.js'),G=await import('../apps/preview/geometry.js'),L=await import('../apps/preview/design-library.js');
 assert.deepEqual(P.tierHeights(2.7),{total:1.2,lower:.4,upper:.8});
 assert.deepEqual(P.tierHeights(3),{total:1.5,lower:.6,upper:.9});
 assert.deepEqual(P.tierHeights(3.1),{total:1.6,lower:.6,upper:1});
 assert.equal(G.placeWall([],{x:0,z:0},{x:4,z:0}).items[0].height,3);
 assert.throws(()=>G.placeWall([],{x:0,z:0},{x:4,z:0},{height:3.2}));
 let r=G.placeWall([],{x:0,z:0},{x:4,z:0},{height:3.1});r=G.placeCabinet(r.items,{x:0,z:0},{x:4,z:0},{kind:'upper'});r=L.configureTiers(r.items,{ceilingHeight:3.1});
 assert.throws(()=>G.setAllWallHeights(r.items,3.2));
 const old=r.items.find(c=>c.subtype==='upper');old.upperTiers.lowerHeight=1.2;
 const upgraded=L.upgradeLegacyTiers(r.items,3.1),c=upgraded.find(c=>c.id===old.id);assert.equal(c.upperTiers.lowerHeight,.6);assert.equal(L.upgradeLegacyTiers(upgraded,3.1),upgraded);
 const manual=L.configureTiers(upgraded,{ceilingHeight:3.1,auto:false,lowerHeight:.8}).items;
 assert.equal(L.upgradeLegacyTiers(manual,3.1),manual);assert.equal(manual.find(c=>c.subtype==='upper').upperTiers.lowerHeight,.8);
});
