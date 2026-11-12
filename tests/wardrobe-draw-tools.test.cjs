const test=require('node:test'),assert=require('node:assert/strict');

test('wardrobe pencil positions a true divider and eraser preserves dimensions',async()=>{
 const W=await import('../apps/preview/wardrobe-model.js');
 const c=W.defaultWardrobe(3);
 const b=c.bays[0];
 assert.ok(b.width>=.7);
 const desired=Math.max(.35/b.width,Math.min(.65,.43));
 const divided=W.splitWardrobeBay(c,b.key,desired);
 assert.equal(divided.bays.length,c.bays.length+1);
 assert.ok(Math.abs(divided.bays[0].width+divided.bays[1].width-b.width)<1e-8);
 assert.ok(divided.bays[0].width>=.35);
 const restored=W.joinWardrobeBay(divided,b.key);
 assert.equal(restored.bays.length,c.bays.length);
 assert.ok(Math.abs(restored.bays[0].width-b.width)<1e-8);
});

test('wardrobe horizontal pencil creates a real reportable board; eraser removes only that board',async()=>{
 const W=await import('../apps/preview/wardrobe-model.js');
 const E=await import('../apps/preview/wardrobe-workspace.js');
 let c=W.defaultWardrobe();
 const bay=c.bays.find(b=>b.role==='long-hang');
 assert.ok(bay);
 const before=W.wardrobePanels(W.wardrobeItems(c).find(x=>x.wardrobe)).length;
 c=W.addWardrobeShelf(c,bay.key,.51);
 const items=W.wardrobeItems(c);
 const cabinet=items.find(x=>x.wardrobe);
 assert.equal(W.wardrobePanels(cabinet).length,before+1);
 assert.ok(W.wardrobePanels(cabinet).some(x=>x.part==='custom-shelf'));
 assert.match(E.wardrobeElevation(items,true),/data-w-bay-rect/);
 assert.match(E.wardrobeElevation(items,true),/data-w-erase-seam/);
 c=W.eraseWardrobeShelf(c,bay.key,.52);
 assert.equal(W.wardrobePanels(W.wardrobeItems(c).find(x=>x.wardrobe)).length,before);
});
