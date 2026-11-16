import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { FloorScanner } from '../ar/floorScanner';

function hit(x: number, z: number, horizontal = true): XRHitTestResult {
  const matrix = new THREE.Matrix4()
    .makeRotationX(horizontal ? 0 : Math.PI / 2)
    .setPosition(x, 0, z);
  return {
    getPose: () => ({ transform: { matrix: matrix.toArray() } }),
  } as unknown as XRHitTestResult;
}

const space = {} as XRReferenceSpace;
const viewer = new THREE.Vector3(0, 1.5, 0);

test('Chido requires a central hit and three distinct level observations', () => {
  const scanner = new FloorScanner();
  const point = scanner.update(
    [hit(-0.4, -0.7)],
    [hit(0.2, -0.6), hit(0.5, -1.0)],
    space,
    viewer,
    100,
    new THREE.Vector3(0, -0.6, -0.8)
  );
  assert.ok(point, 'Chido central hit should establish a valid floor candidate');
  assert.equal(scanner.ready, true);
  assert.equal(scanner.rawHits, 3);
  assert.equal(scanner.validHits, 3);
  assert.equal(scanner.observations.length, 3);
});

test('vertical plane hits must never mark the floor ready', () => {
  const scanner = new FloorScanner();
  const candidate = scanner.update(
    [], [hit(0, -0.5, false), hit(0.3, -0.5, false), hit(-0.3, -0.5, false)],
    space, viewer, 100
  );
  assert.equal(candidate, null);
  assert.equal(scanner.ready, false);
  assert.equal(scanner.validHits, 0);
});

test('Chido clears observations when the central floor hit is absent', () => {
  const scanner = new FloorScanner();
  scanner.update([hit(0, -0.5)], [hit(-0.3, -0.5)], space, viewer, 100);
  assert.equal(scanner.ready, false);
  scanner.update([], [], space, viewer, 150);
  assert.equal(scanner.ready, false);
  assert.equal(scanner.point, null);
  assert.equal(scanner.history.length, 0);
  scanner.update([], [], space, viewer, 3000);
  assert.equal(scanner.history.length, 0, 'old samples expire');
});
