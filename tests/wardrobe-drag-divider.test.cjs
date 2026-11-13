const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
test('moving wardrobe dividers preserves outer footprint and adjacent bay widths',async()=>{
 const W=await import('../apps/preview/wardrobe-model.js');
 const cfg=W.defaultWardrobe(2.4);
 const before=cfg.bays.map(x=>x.width);
 const first=cfg.bays[0],requested=Math.round((first.width-.08)*100)/100;
 const next=W.moveWardrobeDivider(cfg,first.key,requested);
 assert.equal(next.width,cfg.width);
 assert.ok(Math.abs(next.bays[0].width-requested)<1e-8);
 assert.ok(Math.abs(next.bays[1].width-(before[1]+.08))<1e-8);
 assert.deepEqual(cfg.bays.map(b=>b.width),before);
 assert.ok(next.bays.every(b=>b.width>=.35&&b.width<=1.2));
});
test('wardrobe physical divider cannot cross 35cm minimum or resize other bays',async()=>{
 const W=await import('../apps/preview/wardrobe-model.js');
 const cfg=W.defaultWardrobe(2.4),b=cfg.bays[0];
 assert.throws(()=>W.moveWardrobeDivider(cfg,b.key,.1),/۳۵/);
 assert.throws(()=>W.moveWardrobeDivider(cfg,cfg.bays.at(-1).key,1),/مرز/);
});
test('inside elevation provides pointer-draggable physical seam in select mode',async()=>{
 const W=await import('../apps/preview/wardrobe-model.js');
 const E=await import('../apps/preview/wardrobe-workspace.js');
 const items=W.wardrobeItems(W.defaultWardrobe());
 const selected=E.wardrobeElevation(items,true,null,null,'select');
 const drawing=E.wardrobeElevation(items,true,null,null,'pencilV');
 assert.match(selected,/data-w-divider/);
 assert.doesNotMatch(drawing,/data-w-divider/);
 assert.match(drawing,/data-w-erase-seam/);
});
