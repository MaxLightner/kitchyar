const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../apps/preview/core.js');
const storage = () => {
  const map = new Map();
  return {getItem: (k) => map.get(k) || null, setItem: (k, v) => {map.set(k, v);}};
};
test('empty → create → save → reload keeps same project and metric geometry', () => {
  const mem = storage(), repo = core.createRepository(mem);
  const p = repo.create('نمونه'), vol = core.sampleVolume();
  vol.width = 1.234;
  repo.update(p.id, {scene: {items: [vol]}});
  const fresh = core.createRepository(mem).get(p.id);
  assert.equal(fresh.scene.items[0].width, 1.234);
  assert.equal(fresh.name, 'نمونه');
  assert.equal(fresh.revision, 1);
});
test('duplicate does not alias object IDs; delete is scoped', () => {
  const repo = core.createRepository(storage()), p = repo.create('A');
  repo.update(p.id, {scene: {items: [core.sampleVolume()]}});
  const q = repo.duplicate(p.id);
  assert.notEqual(q.id, p.id);
  assert.notEqual(q.scene.items[0].id, repo.get(p.id).scene.items[0].id);
  repo.remove(p.id);
  assert.equal(repo.list().length, 1);
  assert.equal(repo.get(q.id).scene.items.length, 1);
});
test('corrupt saved state is not overwritten', () => {
  const mem = storage(); mem.setItem(core.STORAGE_KEY, '{broken');
  const repo = core.createRepository(mem);
  assert.throws(() => repo.list(), /معتبر نیست/);
  assert.equal(mem.getItem(core.STORAGE_KEY), '{broken');
});
test('failed storage write cannot mutate memory', () => {
  const mem = storage(), repo = core.createRepository(mem), p = repo.create('original');
  mem.setItem = () => {throw Error('disk full');};
  assert.throws(() => repo.update(p.id, {name: 'lost'}));
  assert.equal(repo.get(p.id).name, 'original');
});
test('model normalizes dimensions, colors and unknown kinds', () => {
  const scene = core.normalizeScene({items: [{id: 'x', kind: 'volume', width: -3, depth: 0, height: 0.4, color: 'red'}, {id: 'y', kind: 'gizmo'}]});
  assert.equal(scene.items.length, 1);
  assert.equal(scene.items[0].width, 0.1);
  assert.equal(scene.items[0].color, '#b4bdac');
});
test('walls and semantic windows cut through a wall and reject invalid placement', () => {
  const wall=core.createWall({x:0,z:0},{x:3,z:0});
  assert.equal(core.length(wall),3);
  const window=core.createOpening(wall,'window',1.5);
  assert.equal(window.wallId,wall.id);
  assert.equal(window.openingType,'window');
  const scene=core.normalizeScene({items:[wall,window]});
  assert.equal(core.validateScene(scene),true);
  assert.match(core.canPlaceOpening({...window,width:4},wall,scene.items),/خارج/);
  const second=core.createOpening(wall,'door',1.7);
  assert.match(core.canPlaceOpening(second,wall,scene.items),/تداخل/);
  assert.throws(()=>core.validateScene({items:[wall,{...window,sill:2.5}]}),/ارتفاع/);
  assert.throws(()=>core.validateScene({items:[{...wall,x2:.1},window]}));
});
test('cabinet runs are continuous without fabricated units and preserve elevation', () => {
  const base=core.createCabinetRun({x:0,z:0},{x:3,z:0},'base');
  const upper=core.createCabinetRun({x:0,z:0},{x:3,z:0},'wall');
  assert.equal(core.length(base),3);
  assert.equal(base.runType,'base');
  assert.equal(base.elevation,0);
  assert.ok(upper.elevation>1);
  assert.equal(upper.runType,'wall');
  assert.equal('units' in base,false);
  assert.equal(core.validateScene({items:[base,upper]}),true);
  assert.equal(core.normalizeItem({...upper,elevation:1.75}).elevation,1.75);
});
test('duplicate and import remap window host references', () => {
  const repo=core.createRepository(storage()),p=repo.create('با دیوار');
  const wall=core.createWall({x:0,z:0},{x:4,z:0}),window=core.createOpening(wall,'window',2);
  repo.update(p.id,{scene:{items:[wall,window]}});
  for(const duplicate of [repo.duplicate(p.id),repo.importProject(repo.exportProject(p.id))]){
    const [host,opening]=duplicate.scene.items;
    assert.notEqual(host.id,wall.id);
    assert.equal(opening.wallId,host.id);
    assert.equal(core.validateScene(duplicate.scene),true);
  }
});
test('scene calibration metadata is separate from metric model dimensions', () => {
  const wall=core.createWall({x:0,z:0},{x:3,z:0});
  const scene=core.normalizeScene({items:[wall],calibration:{originX:10,rotation:40,baselineMeters:2}});
  assert.equal(scene.items[0].x2,3);
  assert.equal(scene.calibration.originX,10);
  assert.equal(scene.calibration.baselineMeters,2);
});
test('project JSON backup restores a new independent project', () => {
  const repo=core.createRepository(storage()),p=repo.create('Kitchen');
  repo.update(p.id,{scene:{items:[core.sampleVolume()]}});
  const restored=repo.importProject(repo.exportProject(p.id));
  assert.notEqual(restored.id,p.id);
  assert.notEqual(restored.scene.items[0].id,repo.get(p.id).scene.items[0].id);
  assert.equal(repo.list().length,2);
});
test('invalid import never changes project list', () => {
  const repo=core.createRepository(storage());repo.create('Safe');
  assert.throws(()=>repo.importProject('{not json'));
  assert.equal(repo.list().length,1);
});


test('crossing walls split into four connected metric segments', () => {
  const horizontal=core.createWall({x:-2,z:0},{x:2,z:0});
  const vertical=core.createWall({x:0,z:-2},{x:0,z:2});
  const connected=core.connectWall([horizontal],vertical);
  assert.equal(connected.items.filter(i=>i.kind==='wall').length,4);
  assert.equal(core.validateScene(core.normalizeScene({items:connected.items})),true);
  const intersections=connected.items.filter(i=>i.kind==='wall')
    .flatMap(w=>[[w.x1,w.z1],[w.x2,w.z2]]).filter(p=>p[0]===0&&p[1]===0);
  assert.equal(intersections.length,4);
});
test('T junction preserves a hosted window and remaps its wall after splitting', () => {
  const first=core.createWall({x:0,z:0},{x:4,z:0});
  const window=core.createOpening(first,'window',3);
  const branch=core.createWall({x:2,z:0},{x:2,z:3});
  const result=core.connectWall([first,window],branch);
  const host=result.items.find(i=>i.id===result.items.find(o=>o.kind==='opening').wallId);
  const opening=result.items.find(i=>i.kind==='opening');
  assert.equal(core.length(host),2);
  assert.equal(opening.offset,1);
  assert.equal(core.validateScene(core.normalizeScene({items:result.items})),true);
});
test('moving one wall node drags the shared endpoint of its neighbor', () => {
  const a=core.createWall({x:0,z:0},{x:2,z:0});
  const b=core.createWall({x:2,z:0},{x:2,z:2});
  core.propagateWallNodes([a,b],a,{x2:3,z2:1});
  assert.equal(b.x1,3);assert.equal(b.z1,1);
  assert.equal(b.x2,2);assert.equal(b.z2,2);
});
