import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { AimTap, aimCenter, calibrationPinsAtView } from './centerAim';

test('aim follows the viewport center in portrait and landscape, independent of touch position', () => {
  assert.deepEqual(aimCenter({ left: 10, top: 80, width: 400, height: 800 }), { x: 210, y: 480 });
  assert.deepEqual(aimCenter({ left: 20, top: 60, width: 900, height: 400 }), { x: 470, y: 260 });
});

test('placement confirms a tap, never a drag, cancellation or multi-touch option gesture', () => {
  const tap = new AimTap();
  tap.begin(1, 80, 90); assert.equal(tap.end(1), true);
  tap.begin(2, 80, 90); tap.move(2, 120, 90); assert.equal(tap.end(2), false);
  tap.begin(3, 80, 90); tap.begin(4, 90, 90);
  assert.equal(tap.end(4), false); assert.equal(tap.end(3), false);
  tap.begin(5, 80, 90); tap.cancel(); assert.equal(tap.end(5), false);
});

test('calibration pins straddle view center on translated floor without moving it', () => {
  const camera = new THREE.PerspectiveCamera(60, 1, .01, 100);
  camera.position.set(3, 2.5, 4); camera.lookAt(3, 1, 2);
  const floor = new THREE.Group(); floor.position.set(2, 1, 1);
  const before = floor.position.clone();
  const { a, b } = calibrationPinsAtView(camera, floor);
  assert.ok(Math.abs(a.y) < 1e-6 && Math.abs(b.y) < 1e-6);
  assert.ok(Math.abs(a.distanceTo(b) - .6) < 1e-6);
  const center = floor.localToWorld(a.clone().add(b).multiplyScalar(.5)).project(camera);
  assert.ok(Math.abs(center.x) < 1e-6 && Math.abs(center.y) < 1e-6);
  assert.deepEqual(floor.position, before);
});

test('horizontal camera gives nearby finite floor pins', () => {
  const camera = new THREE.PerspectiveCamera(); camera.position.y = 1.6;
  const { a, b } = calibrationPinsAtView(camera, new THREE.Group());
  assert.ok(Number.isFinite(a.x + a.z + b.x + b.z));
  assert.equal(a.y, 0); assert.equal(b.y, 0);
  assert.ok(a.length() < 2 && b.length() < 2);
});
