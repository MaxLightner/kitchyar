import test from 'node:test';
import assert from 'node:assert/strict';
import { kitchenGeometryKey, kitchenStructuralKey } from './scene3dBuilder';
import type { ProjectState } from './types';
import { DEFAULT_PROJECT_SETTINGS } from './constants';

const sample = () => ({
  walls: [{
    id: 'w1', length: 300,
    boxes: [
      { id: 'fridge', type: 'fridge', fridgeModel: 'fridge-sbs-homebar', offsetX: 0, width: 95 },
      { id: 'base', type: 'base', offsetX: 96, width: 150, depth: 60, countertopCm: 3 },
    ],
    appliances: [
      { id: 'sink', kind: 'sink', offsetX: 115, width: 90, sinkModel: 'sink-double-flat-chrome' },
      { id: 'hob', kind: 'gas', offsetX: 200, width: 90, cooktopModel: 'hob-steel-5-center' },
    ],
  }],
  settings: { ...DEFAULT_PROJECT_SETTINGS, equipmentFinish: 'silver' },
}) as unknown as ProjectState;

test('color and procedural cooktop model changes leave kitchen structure intact', () => {
  const original = sample();
  const after = structuredClone(original);
  after.walls[0].appliances[1].cooktopModel = 'hob-glass-5';
  after.walls[0].appliances[0].sinkFinish = 'black';
  after.settings = { ...DEFAULT_PROJECT_SETTINGS, ...after.settings, equipmentFinish: 'black' };
  assert.equal(kitchenStructuralKey(original), kitchenStructuralKey(after));
  assert.notEqual(kitchenGeometryKey(original), kitchenGeometryKey(after));
});

test('fridge model alone is visual; changing its width is structural', () => {
  const original = sample();
  const changedModel = structuredClone(original);
  changedModel.walls[0].boxes[0].fridgeModel = 'fridge-instaview-black';
  assert.equal(kitchenStructuralKey(original), kitchenStructuralKey(changedModel));
  changedModel.walls[0].boxes[0].width = 100;
  assert.notEqual(kitchenStructuralKey(original), kitchenStructuralKey(changedModel));
});

test('sink model switches must rebuild stone cutout geometry', () => {
  const original = sample();
  const changed = structuredClone(original);
  changed.walls[0].appliances[0].sinkModel = 'sink-double-ribbed-steel';
  assert.notEqual(kitchenStructuralKey(original), kitchenStructuralKey(changed));
});
