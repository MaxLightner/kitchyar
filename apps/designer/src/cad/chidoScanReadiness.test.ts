import assert from 'node:assert/strict';
import test from 'node:test';
import { chidoScanReadiness } from '../ar/chidoScanReadiness';

const initial = {
  xrAvailable: true as const,
  starting: false,
  sessionActive: true,
  tracking: false,
  rawHits: 0,
  validHits: 0,
  ready: false,
};
test('Chido scan progress follows the same tracking and surface stages as Chido app.js', () => {
  assert.equal(chidoScanReadiness(initial).progress, 12);
  assert.equal(chidoScanReadiness({...initial, tracking:true}).progress, 35);
  assert.equal(chidoScanReadiness({...initial, tracking:true, rawHits:2}).progress, 60);
  assert.equal(chidoScanReadiness({...initial, tracking:true, rawHits:2, validHits:1}).progress, 78);
  assert.deepEqual(chidoScanReadiness({...initial, tracking:true, rawHits:2, validHits:1, ready:true}),
    {progress:100, label:'کف پیشنهادی آماده است؛ تثبیت را بزن'});
});
test('Welcome scanner displays a visible diagnostic instead of silently switching to 3D when XR is unavailable', () => {
  const status = chidoScanReadiness({...initial, sessionActive:false, xrAvailable:false});
  assert.equal(status.progress, 0);
  assert.match(status.label, /WebXR/);
});
test('WebXR rejection is shown with a recoverable error', () => {
  const status = chidoScanReadiness({...initial, sessionActive:false, error:'NotAllowedError: camera'});
  assert.deepEqual(status, {progress:0, label:'NotAllowedError: camera'});
});
