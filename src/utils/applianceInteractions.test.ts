import assert from 'node:assert/strict';
import test from 'node:test';
import { DoorTapSequence } from './doorTapSequence';
import { APPLIANCE_CATALOG } from '../hoods/catalog';
import { resolveFridgeModel, resolveHoodModel } from '../cad/applianceModels';

test('only user-supplied appliance models appear in the active catalog', () => {
  assert.equal(APPLIANCE_CATALOG.filter(x => x.category === 'hood').length, 6);
  assert.equal(APPLIANCE_CATALOG.filter(x => x.category === 'fridge').length, 6);
  assert.equal(APPLIANCE_CATALOG.filter(x => x.category === 'cooktop').length, 7);
  assert.ok(APPLIANCE_CATALOG.filter(x => x.category === 'cooktop').every(x => x.supportsIgnition));
  assert.equal(resolveFridgeModel('side-by-side'), 'fridge-sbs-homebar');
  assert.equal(resolveHoodModel('chimney'), 'curved-black');
});

test('gas must be double-tapped to switch ON and also double-tapped to switch OFF', () => {
  const taps = new DoorTapSequence();
  let lit = false;
  const tap = (at: number, x = 200, y = 120, id = 'hob-1', type = 'touch') => {
    // The 3D view always passes false so a lit hob also requires TWO taps to turn OFF.
    if (taps.next('hob:' + id, false, type, at, x, y) === 1) lit = !lit;
  };
  tap(100); assert.equal(lit, false, 'a single tap must only select a hob');
  tap(220, 210); assert.equal(lit, true);
  tap(1000); assert.equal(lit, true, 'first OFF tap must not turn the hob off');
  tap(1160); assert.equal(lit, false);
  tap(2000);
  tap(2200, 200, 120, 'other-hob'); assert.equal(lit, false, 'taps on different hobs do not combine');
  tap(2750); assert.equal(lit, false, 'late second tap does not switch flames');
  tap(2840); assert.equal(lit, true);
});
