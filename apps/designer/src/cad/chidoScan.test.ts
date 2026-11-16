import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AnchorSample,
  AnchorStabilizer,
  estimateFloorPose,
  inversePoint,
  transformPoint,
} from '../ar/chidoAnchorRig';
import { chidoSessionOptions } from '../ar/chidoSession';

test('Chido floor anchor rig rejects collinear anchor samples', () => {
  const p: AnchorSample[] = [
    { id: 'a', reference: [0, 0, 0], observed: [0, 0, 0] },
    { id: 'b', reference: [1, 0, 1], observed: [1, 0, 1] },
    { id: 'c', reference: [2, 0, 2], observed: [2, 0, 2] },
  ];
  assert.equal(estimateFloorPose(p), null);
});

test('Chido floor anchor rig estimates stable metric pose with outlier rejected', () => {
  const expected = { x: 1.8, y: 0.07, z: -0.95, yaw: 0.26 };
  const refs: Array<[number, number, number]> = [
    [0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1],
  ];
  const samples: AnchorSample[] = refs.map((p, i) => ({
    id: 'anchor-' + i,
    reference: p,
    observed: transformPoint(p, expected),
  }));
  samples.push({id: 'outlier', reference: [2, 0, 2], observed: [99, 99, 99]});
  const fit = estimateFloorPose(samples);
  assert.ok(fit);
  assert.equal(fit.inliers.length, 4);
  assert.deepEqual(fit.outliers, ['outlier']);
  assert.ok(Math.abs(fit.pose.yaw - expected.yaw) < 1e-4);
  assert.ok(Math.abs(fit.pose.x - expected.x) < 1e-4);
  assert.ok(Math.abs(fit.pose.y - expected.y) < 1e-4);
  assert.ok(Math.abs(fit.pose.z - expected.z) < 1e-4);
  const restored = inversePoint(transformPoint(refs[0], expected), expected);
  assert.deepEqual(restored.map(x => +x.toFixed(6)), refs[0]);
});

test('Chido rig verifies sudden pose changes for six frames', () => {
  const expected = {x: 1.3, y: 0, z: -0.8, yaw: 0.15};
  const refs: Array<[number, number, number]> =
    [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1]];
  const samples: AnchorSample[] = refs.map((reference, i) => ({
    id: 'a-' + i, reference, observed: transformPoint(reference, expected),
  }));
  const rig = new AnchorStabilizer();
  for (let i = 0; i < 5; i++) {
    const state = rig.update(samples, 0.016);
    assert.equal(state.status, 'verifying');
    assert.equal(state.pose.x, 0);
  }
  const state = rig.update(samples, 0.016);
  assert.equal(state.status, 'stable');
  assert.ok(state.pose.x > 0);
});

test('Chido WebXR session features are exact and DOM overlay is required', () => {
  const root = {} as HTMLElement;
  const options = chidoSessionOptions(root);
  assert.deepEqual(options.requiredFeatures, ['hit-test', 'dom-overlay']);
  assert.deepEqual(options.optionalFeatures, ['anchors', 'plane-detection']);
  assert.equal(options.domOverlay?.root, root);
});
