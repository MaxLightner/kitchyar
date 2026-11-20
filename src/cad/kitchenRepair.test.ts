import test from 'node:test';
import assert from 'node:assert/strict';
import type { CabinetBox, ProjectState } from './types';
import { auditKitchen } from './kitchenAudit';
import { repairKitchenIssues } from './kitchenRepair';
import { collectCutMasterParts } from './cutMasterIds';

function box(id: string, x: number): CabinetBox {
  return {
    id, name: id, type: 'base', offsetX: x, elevY: 0,
    width: 50, height: 85, depth: 60, plinth: 10, countertopCm: 3,
    doors: [{ id: `door_${id}`, startCm: 0, widthCm: 50, kind: 'door', drawerRatios: [] }],
    unitDividers: [], shelves: [], handles: [],
  };
}
function project(): ProjectState {
  return {
    walls: [{
      id: 'wall_1', name: 'Test wall',
      x1Cm: 0, y1Cm: 0, x2Cm: 250, y2Cm: 0,
      length: 250, height: 280, angle: 0, flipSide: 1,
      boxes: [box('left', 0), box('right', 80)],
      appliances: [],
    }],
    cornerOwners: {}, activeWallId: 'wall_1',
    activeBoxId: null, selectedDoorId: null, doorsLocked: false,
  };
}
test('audit finds a 30cm dead gap and repair absorbs it without mutating the input', () => {
  const original = project();
  assert.ok(auditKitchen(original).some(issue => issue.kind === 'gap'));
  const before = JSON.stringify(original);
  const repaired = repairKitchenIssues(original);
  assert.equal(repaired.changed, true);
  assert.equal(JSON.stringify(original), before);
  assert.equal(repaired.project.walls[0].boxes[0].width, 65);
  assert.equal(repaired.project.walls[0].boxes[1].offsetX, 65);
  assert.equal(repaired.project.walls[0].boxes[1].width, 65);
  assert.equal(auditKitchen(repaired.project).filter(issue => issue.kind === 'gap').length, 0);
});
test('CutMaster IDs are unique, deterministic, and material signatures change with finish', () => {
  const p = project();
  const a = collectCutMasterParts(p);
  assert.ok(a.length > 5);
  assert.equal(new Set(a.map(part => part.id)).size, a.length);
  assert.deepEqual(a.map(part => part.id), collectCutMasterParts(p).map(part => part.id));
  p.walls[0].boxes[0].finish = 'walnut';
  const b = collectCutMasterParts(p);
  assert.notEqual(a[0].id, b[0].id);
  assert.notEqual(a[0].materialSig, b[0].materialSig);
});
