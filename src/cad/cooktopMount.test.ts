import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fitAppliance, makeCooktop } from './applianceModels';
import type { HoodMaterialLibrary } from '../three/materials';

const MODELS = [
  'hob-glass-5', 'hob-steel-5-right', 'hob-steel-5-center',
  'hob-steel-3', 'hob-domino-2', 'hob-ceramic-4', 'hob-induction-4',
] as const;

test('all procedural cooktops retain their visible plate and remove the recessed underside', () => {
  for (const model of MODELS) {
    const darkChassis = new THREE.MeshStandardMaterial();
    const plate = new THREE.MeshStandardMaterial();
    const other = new THREE.MeshStandardMaterial();
    const mats = new Proxy({ darkChassis, blackGlass: plate, brushedSteel: plate }, {
      get(target, key) {
        return Reflect.get(target, key) ?? other;
      },
    }) as HoodMaterialLibrary;
    const hob = makeCooktop(model, mats);
    let underneath = 0;
    let plateParts = 0;
    hob.group.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (obj.material === darkChassis && obj.position.y < -0.01) underneath++;
      if (obj.material === plate) plateParts++;
    });
    assert.equal(underneath, 0, `${model}: recessed chassis should not exist`);
    assert.ok(plateParts >= 1, `${model}: visible black or metal plate must remain`);

    const width = model.includes('5') ? 0.90 : model.includes('domino') ? 0.48 : 0.65;
    const fitted = fitAppliance(hob.group, { w: width, h: 100, d: 100 }, 1, 'floor');
    fitted.updateMatrixWorld(true);
    const plateBounds = new THREE.Box3();
    fitted.traverse(obj => {
      if (obj instanceof THREE.Mesh && obj.material === plate) {
        plateBounds.union(new THREE.Box3().setFromObject(obj));
      }
    });
    assert.ok(plateBounds.min.y >= -0.00001 && plateBounds.min.y <= 0.008,
      `${model}: plate must touch the countertop, got y=${plateBounds.min.y}`);
  }
});
