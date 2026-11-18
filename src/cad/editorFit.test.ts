import test from 'node:test';
import assert from 'node:assert/strict';
import { fitHandleLengthCm } from './handleGeometry';
import { createEmptyBox, createWall, moveBoxHierarchically, optimizeBoxWithAppliances, placeApplianceWithCabinetRules } from './doorRules';

test('concealed pulls stay short on tall doors, and fitting honors the closer edge', () => {
  assert.equal(fitHandleLengthCm('hidden', 'vertical', 230, 45, 225, 0.5, 0.5), 24);
  assert.ok(Math.abs(fitHandleLengthCm('hidden', 'horizontal', 24, 30, 70, 0.18, 0.18) - 9.8) < 0.001);
  assert.equal(fitHandleLengthCm('knob', 'horizontal', 99, 35, 45), 3.6);
});

test('dishwasher placement uses a 1 cm gap after the sink cabinet unit, not the sink edge', () => {
  const w = createWall('test', 0, 0, 300, 0);
  const box = createEmptyBox('base', 0, 300);
  w.boxes.push(box);
  w.appliances.push({ id: 'sink', kind: 'sink', boxId: box.id, offsetX: 12, width: 90 });
  box.unitDividers = [120];
  const result = placeApplianceWithCabinetRules(w, [w], 'dishwasher', box, 100, {});
  assert.equal(result.appliance?.offsetX, 121);
  assert.ok(w.appliances.some(a => a.id === 'sink'));
});

test('when a dishwasher cannot fit, the optimizer leaves equipment and dividers unchanged', () => {
  const w = createWall('test', 0, 0, 150, 0);
  const box = createEmptyBox('base', 0, 150);
  w.boxes.push(box);
  box.unitDividers = [90];
  w.appliances = [
    { id: 'sink', kind: 'sink', boxId: box.id, offsetX: 0, width: 90 },
    { id: 'dishwasher', kind: 'dishwasher', boxId: box.id, offsetX: 90, width: 60 },
  ];
  const before = JSON.stringify(w);
  assert.equal(optimizeBoxWithAppliances(w, [w], box, {}).ok, false);
  assert.equal(JSON.stringify(w), before);
});

test('numeric cabinet moves preserve centimeters instead of rounding to the drag grid', () => {
  const w = createWall('test', 0, 0, 300, 0);
  const box = createEmptyBox('base', 0, 60);
  w.boxes.push(box);
  assert.equal(moveBoxHierarchically(w, [w], box.id, 43, {}, { exact: true })?.offsetX, 43);
});
