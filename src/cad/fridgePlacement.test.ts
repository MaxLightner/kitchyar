import test from 'node:test';
import assert from 'node:assert/strict';
import { fridgeFrontCm, fridgeDepthCm, alignAboveFridge } from './fridgePlacement';
import type { CabinetBox, Wall } from './types';

const fridge = (model: CabinetBox['fridgeModel'] = 'fridge-sbs-homebar', framed = true): CabinetBox => ({
  id: 'f1', name: 'یخچال', type: 'fridge', fridgeModel: model,
  hasFridgeFrame: framed, offsetX: 0, elevY: 0, width: 107,
  height: framed ? 190 : 185, depth: 60, plinth: 0, countertopCm: 0,
  doors: [], shelves: [], handles: [], unitDividers: [],
});
const upper = (start: number): CabinetBox => ({
  id: 'top', name: 'بالای یخچال', type: 'wall-deep',
  linkedToBoxId: 'f1', offsetX: 0, elevY: start, width: 107,
  height: 265 - start, depth: 60, plinth: 0, countertopCm: 0,
  doors: [{ id: 'd1', startCm: 0, widthCm: 107, kind: 'lift', drawerRatios: [] }],
  shelves: [], handles: [], unitDividers: [],
});
const wall = (boxes: CabinetBox[]): Wall => ({
  id: 'w', name: 'W', length: 400, height: 265,
  start: { x: 0, y: 0 }, end: { x: 400, y: 0 },
  boxes, appliances: [], openings: [],
}) as unknown as Wall;

test('fridge body uses physical model depth and stands ahead of 60cm cabinet frame', () => {
  assert.equal(fridgeDepthCm('fridge-sbs-homebar'), 70);
  assert.equal(fridgeDepthCm('fridge-instaview-black'), 74);
  assert.equal(fridgeFrontCm('fridge-sbs-homebar', 60), 78);
  assert.equal(fridgeFrontCm('fridge-instaview-black', 60), 78);
  assert.equal(fridgeFrontCm('fridge-topfreezer-steel', 80), 98);
});

test('linked upper above standard framed fridge has exactly 5cm gap, preserving top', () => {
  const f = fridge();
  const over = upper(228);
  const scene = wall([f, over]);
  alignAboveFridge(scene, f);
  assert.equal(over.elevY, 190);
  assert.equal(over.height, 75);
  assert.equal(over.elevY - 185, 5);
});
test('short refrigerator model lifts upper clearance to no more than 5cm', () => {
  const f = fridge('fridge-topfreezer-steel', true);
  const over = upper(230);
  alignAboveFridge(wall([f, over]), f);
  assert.equal(over.elevY, 175);
  assert.equal(over.elevY - 170, 5);
});
test('unframed fridge and independent upper cabinets stay distinct', () => {
  const f = fridge('fridge-combi-white', false);
  const linked = upper(215);
  const unrelated = upper(230);
  unrelated.id = 'independent';
  unrelated.linkedToBoxId = undefined;
  const w = wall([f, linked, unrelated]);
  alignAboveFridge(w, f);
  assert.equal(linked.elevY - 185, 3);
  assert.equal(unrelated.elevY, 230);
});
