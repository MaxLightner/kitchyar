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
  const scene = core.normalizeScene({items: [{id: 'x', kind: 'volume', width: -3, depth: 0, height: 0.4, color: 'red'}, {id: 'y', kind: 'wall'}]});
  assert.equal(scene.items.length, 1);
  assert.equal(scene.items[0].width, 0.1);
  assert.equal(scene.items[0].color, '#b4bdac');
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
