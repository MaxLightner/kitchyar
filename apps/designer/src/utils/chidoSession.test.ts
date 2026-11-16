import assert from 'node:assert/strict';
import test from 'node:test';
import { CHIDO_REFERENCE_SPACE, chidoSessionOptions, createChidoSessionOwner, isHandheldARDevice, xrLaunchError } from '../ar/chidoSession';

test('one camera request survives repeated taps and tracked-view changes until session end', async () => {
  const own = createChidoSessionOwner();
  const session = new EventTarget() as unknown as XRSession;
  let calls = 0;
  let resolve!: (session: XRSession) => void;
  const xr = { requestSession: () => { calls++; return new Promise<XRSession>(done => { resolve = done; }); } } as unknown as XRSystem;
  const root = {} as HTMLElement;
  const first = own(xr, root);
  assert.equal(calls, 1, 'camera request starts inside the tap, before any await');
  assert.equal(own(xr, root), first);
  resolve(session);
  await first;
  assert.equal(own(xr, root), first, 'returning to AR reuses the live session');
  assert.equal(calls, 1);
  (session as unknown as EventTarget).dispatchEvent(new Event('end'));
  assert.notEqual(own(xr, root), first);
  assert.equal(calls, 2);
  resolve(session);
});

test('failed request releases ownership and preserves the actual failure stage', async () => {
  const own = createChidoSessionOwner();
  let calls = 0;
  const error = new DOMException('local-floor was not enabled', 'NotSupportedError');
  const xr = { requestSession: () => { calls++; return Promise.reject(error); } } as unknown as XRSystem;
  await assert.rejects(own(xr, {} as HTMLElement), error);
  await assert.rejects(own(xr, {} as HTMLElement), error);
  assert.equal(calls, 2);
  const message = xrLaunchError(error, 'reference space');
  assert.match(message, /reference space.*NotSupportedError.*local-floor was not enabled/);
  assert.doesNotMatch(message, /هم‌زمان/);
  const options = chidoSessionOptions({} as HTMLElement);
  assert.equal(CHIDO_REFERENCE_SPACE, 'local', 'use the reference space available in a basic immersive session');
  assert.ok(!options.optionalFeatures?.includes('camera-access'));
});

test('AR device eligibility is independent of touch and viewport size', () => {
  assert.equal(isHandheldARDevice({userAgent: 'Windows NT 10.0', platform: 'Win32', maxTouchPoints: 10}), false);
  assert.equal(isHandheldARDevice({userAgent: 'Linux; Android 14; Tablet', platform: 'Linux armv8l', maxTouchPoints: 5}), true);
  assert.equal(isHandheldARDevice({userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5}), true);
  assert.equal(isHandheldARDevice({userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 0}), false);
});

test('Android desktop-site tablets remain eligible while touch laptops remain desktop', () => {
  const desktopUA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36';
  assert.equal(isHandheldARDevice({userAgent: desktopUA, platform:'Linux aarch64', maxTouchPoints:5}, true), true);
  assert.equal(isHandheldARDevice({userAgent: desktopUA, platform:'Linux aarch64', maxTouchPoints:1}, true), true);
  assert.equal(isHandheldARDevice({userAgent: desktopUA, platform:'Linux x86_64', maxTouchPoints:10}, false), false);
  assert.equal(isHandheldARDevice({userAgent: desktopUA, platform:'Linux x86_64', maxTouchPoints:0}, true), false);
  assert.equal(isHandheldARDevice({userAgent:'Windows NT 10.0', platform:'Win32', maxTouchPoints:10}, true), false);
});
