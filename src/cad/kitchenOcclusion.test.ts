import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { bakeKitchenOcclusion } from './kitchenOcclusion';

function sceneWithMaterials(shared: THREE.MeshStandardMaterial, local: THREE.MeshStandardMaterial) {
  const root = new THREE.Group();
  const equipment = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), shared);
  equipment.position.x = 0.3;
  equipment.castShadow = true;
  const cabinet = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), local);
  cabinet.position.x = -0.3;
  cabinet.castShadow = true;
  root.add(equipment, cabinet);
  root.updateWorldMatrix(true, true);
  return { root, bounds: new THREE.Box3().setFromObject(root) };
}

test('AO does not patch cached appliance shader or accumulate wrappers across scene rebuilds', () => {
  const appliance = new THREE.MeshStandardMaterial();
  appliance.userData.sharedApplianceMaterial = true;
  const originalHook = appliance.onBeforeCompile;

  for (let pass = 0; pass < 3; pass++) {
    const cabinet = new THREE.MeshStandardMaterial();
    const originalCabinetHook = cabinet.onBeforeCompile;
    const { root, bounds } = sceneWithMaterials(appliance, cabinet);
    const sync = bakeKitchenOcclusion(root, bounds, new Set(), 'ao-scene-' + pass);

    assert.equal(typeof sync, 'function');
    assert.equal(appliance.onBeforeCompile, originalHook,
      'Cached equipment shader must never capture an AO volume or stack GLSL patches');
    assert.notEqual(cabinet.onBeforeCompile, originalCabinetHook,
      'Scene-local cabinet material should still receive ambient occlusion');
    const ao = root.userData.kitchenOcclusionTexture as THREE.Data3DTexture;
    assert.ok(ao instanceof THREE.Data3DTexture);
    sync?.();
    ao.dispose();
  }
});
