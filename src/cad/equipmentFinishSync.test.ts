import test from 'node:test';
import assert from 'node:assert/strict';
import { fridgeModelFinish, cooktopForFinish, syncEquipmentFinishes } from './equipmentFinishSync';
import type { ProjectState } from './types';

const base = () => ({
  walls: [{
    id: 'w1', length: 250, boxes: [],
    appliances: [
      { id: 'washing', kind: 'washing', offsetX: 0, width: 60 },
      { id: 'dish', kind: 'dishwasher', offsetX: 60, width: 60 },
      { id: 'sink', kind: 'sink', offsetX: 120, width: 90, sinkModel: 'sink-double-flat-chrome' },
      { id: 'hob', kind: 'gas', offsetX: 0, width: 90, cooktopModel: 'hob-steel-5-center', hoodModel: 'curved-steel' },
    ],
  }],
  settings: { equipmentFinish: 'silver' },
}) as unknown as ProjectState;

test('fridge finish is inferred from selected model', () => {
  assert.equal(fridgeModelFinish('fridge-instaview-black'), 'black');
  assert.equal(fridgeModelFinish('fridge-combi-white'), 'white');
  assert.equal(fridgeModelFinish('fridge-twin-steel'), 'silver');
});

test('black sync preserves sink geometry and the original saved project', () => {
  const original = base();
  const next = syncEquipmentFinishes(original, 'black');
  assert.equal(original.settings?.equipmentFinish, 'silver');
  const [washing, dish, sink, hob] = next.walls[0].appliances;
  assert.equal(washing.finish, 'black');
  assert.equal(dish.finish, 'black');
  assert.equal(sink.sinkFinish, 'black');
  assert.equal(sink.sinkModel, 'sink-double-flat-chrome');
  assert.equal(hob.finish, 'black');
  assert.equal(hob.cooktopModel, 'hob-glass-5');
  assert.equal(hob.hoodModel, 'curved-black');
});
test('white sync uses white laundry appliances and available metallic accessories', () => {
  const [washing, dish, sink, hob] = syncEquipmentFinishes(base(), 'white').walls[0].appliances;
  assert.equal(washing.finish, 'white');
  assert.equal(dish.finish, 'white');
  assert.equal(sink.sinkFinish, 'silver');
  assert.equal(hob.finish, 'silver');
});
test('silver sync selects correct five-burner steel model', () => {
  assert.equal(cooktopForFinish('hob-glass-5', 'silver'), 'hob-steel-5-center');
});
