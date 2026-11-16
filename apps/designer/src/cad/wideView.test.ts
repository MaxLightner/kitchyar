import test from 'node:test';
import assert from 'node:assert/strict';
import { HORIZONTAL_FOV, wideViewVerticalFov } from '../ar/wideView';

test('Chido normal/wide/ultra are correct horizontal field-of-view presets', () => {
  assert.deepEqual(HORIZONTAL_FOV, { normal: 60, wide: 84, ultra: 100 });
  for (const mode of ['normal', 'wide', 'ultra'] as const) {
    assert.ok(Math.abs(wideViewVerticalFov(mode, 1) - HORIZONTAL_FOV[mode]) < 0.00001);
  }
});

test('virtual wide view preserves real-world perspective geometry', () => {
  const aspect = 16 / 9;
  const normal = wideViewVerticalFov('normal', aspect);
  const wide = wideViewVerticalFov('wide', aspect);
  const ultra = wideViewVerticalFov('ultra', aspect);
  assert.ok(normal < wide && wide < ultra);
  assert.ok(Math.abs(wide - 2 * Math.atan(Math.tan(84 * Math.PI / 360) / aspect) * 180 / Math.PI) < 0.00001);
});

test('portrait natural projection is capped like Chido without ever widening the physical XR lens', () => {
  assert.ok(wideViewVerticalFov('wide', 0.38) <= 110);
  assert.ok(wideViewVerticalFov('ultra', 0.38) <= 120);
  assert.throws(() => wideViewVerticalFov('normal', 0), RangeError);
});
