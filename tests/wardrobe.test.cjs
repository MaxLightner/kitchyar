const test=require('node:test'),assert=require('node:assert/strict');
const M=()=>import('../apps/preview/wardrobe-model.js');
test('wardrobe divisions, real panels and door seams share one deterministic model',async()=>{
 const m=await M(),cfg=m.defaultWardrobe(),items=m.wardrobeItems(cfg),c=items.find(c=>c.wardrobe);
 assert.equal(items.some(i=>i.kind==='equipment'),false);
 assert.equal(items.filter(f=>f.subtype==='door').length,5);
 assert.equal(items.filter(f=>f.wardrobeInternal).length,3);
 assert.deepEqual(m.wardrobeItems(cfg,items),items);
 const C=await import('../apps/preview/carcass.js');assert.deepEqual(C.cabinetCarcassPanels(c),m.wardrobePanels(c));
 for(const p of m.wardrobePanels(c)){
  assert.ok([p.x,p.y,p.z,p.width,p.height,p.depth].every(Number.isFinite));
  assert.ok(p.x-p.width/2>=-cfg.width/2-1e-8&&p.x+p.width/2<=cfg.width/2+1e-8);
  assert.ok(p.y-p.height/2>=-1e-8&&p.y+p.height/2<=cfg.height+1e-8);
 }
 assert.equal(m.wardrobeRods(c).length,2);
});
test('drawer clearance, door interlock and opening preserve all unrelated objects',async()=>{
 const m=await M(),G=await import('../apps/preview/geometry.js'),items=m.wardrobeItems(m.defaultWardrobe()),c=items.find(c=>c.wardrobe),drawer=items.find(f=>f.wardrobeInternal),before=JSON.stringify(items);
 assert.throws(()=>m.setWardrobeOpening(items,drawer.id,true),/ابتدا همه/);
 const opened=m.openWardrobeDoors(items,true),moved=m.setWardrobeOpening(opened,drawer.id,true);
 const door=moved.find(f=>f.subtype==='door'&&f.wardrobeBay===drawer.wardrobeBay);
 assert.throws(()=>m.setWardrobeOpening(moved,door.id,false),/پیش از بستن/);
 const b=m.wardrobeSections(c).find(b=>b.key===drawer.wardrobeBay),pose=G.frontPose(drawer,c);
 assert.ok(drawer.startT*c.wardrobe.width-c.wardrobe.width/2-b.left>=m.WARDROBE_RULES.drawerClearance-1e-7);
 assert.ok(b.right-(drawer.endT*c.wardrobe.width-c.wardrobe.width/2)>=m.WARDROBE_RULES.drawerClearance-1e-7);
 assert.ok(pose.z<c.z1+c.depth/2-.04);
 assert.equal(JSON.stringify(items),before);
 assert.deepEqual(moved.filter(o=>o.kind!=='front'),items.filter(o=>o.kind!=='front'));
});
test('desk has real top, clear knee space and no full-height doors; narrow bays and shallow hangers are rejected',async()=>{
 const m=await M(),cfg=m.defaultWardrobe(),desk=m.editWardrobeBay(cfg,cfg.bays[0].key,{role:'desk'}),items=m.wardrobeItems(desk),c=items.find(c=>c.wardrobe);
 assert.equal(items.filter(f=>f.wardrobeBay===cfg.bays[0].key).length,0);
 const b=m.wardrobeSections(c)[0],panels=m.wardrobePanels(c),top=panels.find(p=>p.part==='desk-top');
 assert.ok(Math.abs(top.y+top.height/2-.75)<1e-8);assert.ok(top.y-top.height/2>=.70);
 assert.ok(!panels.some(p=>p.bay===b.key&&p.part!=='divider'&&p.y-p.height/2<.70));
 assert.throws(()=>m.editWardrobeBay(cfg,cfg.bays.at(-1).key,{role:'desk'}),/عرض خالص/);
 assert.throws(()=>m.resizeWardrobe(cfg,{depth:.45}),/عمق کمد حداقل/);
 assert.equal(cfg.bays[0].role,'long-hang');
});
test('mirror is separately scheduled from its MDF backing; resize and bay edits preserve other mirror/door identities',async()=>{
 const m=await M(),R=await import('../apps/preview/wardrobe-report.js'),cfg=m.defaultWardrobe();
 cfg.bays[0].mirrors=[true,false];const items=m.wardrobeItems(cfg),mirror=items.find(f=>f.mirror),old=JSON.stringify(items);
 const changed=m.editWardrobeBay(cfg,cfg.bays[1].key,{drawers:2}),next=m.wardrobeItems(changed,items);
 assert.deepEqual(next.find(f=>f.id===mirror.id),mirror);assert.equal(JSON.stringify(items),old);
 const parts=R.wardrobeParts(items),mirrorPart=parts.find(p=>p.material==='آینه');assert.ok(mirrorPart&&mirrorPart.thicknessMm===4);
 assert.equal(parts.filter(p=>p.name==='نمای کشوی داخلی').length,3);
 assert.equal(parts.filter(p=>p.name==='کف کشو').length,3);
 assert.equal(parts.filter(p=>p.name==='میلهٔ آویز').length,2);
 assert.ok(parts.every(p=>p.lengthMm>0&&p.widthMm>0&&p.thicknessMm>0));
 assert.deepEqual(m.wardrobeItems(cfg,JSON.parse(JSON.stringify(items))),items);
});
