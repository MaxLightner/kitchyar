import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { FloorScanner } from '../ar/floorScanner';
import { ChidoFloorTracking } from '../ar/chidoFloorTracking';

function hit(x: number): XRHitTestResult {
  const matrix = new THREE.Matrix4().makeTranslation(x, 0, -1).toArray();
  return { getPose: () => ({transform:{matrix}}) } as unknown as XRHitTestResult;
}
const pose = {transform:{position:{x:0,y:1.5,z:0},orientation:{x:0,y:0,z:0,w:1}},
  views: []} as unknown as XRViewerPose;
const space = {getOffsetReferenceSpace:()=>space} as unknown as XRReferenceSpace;
const source = () => ({cancel:()=>{}}) as XRHitTestSource;

test('the live floor scanner is the exact Chido surfaces blob with only the engine import adapted', () => {
  const copied = readFileSync(new URL('../ar/chido/surfaces.js', import.meta.url), 'utf8')
    .replace("'three'", "'./vendor/three.module.js'");
  const sha = createHash('sha1').update('blob '+Buffer.byteLength(copied)+'\0').update(copied).digest('hex');
  assert.equal(sha, 'a46ba605171bd1a9afd1c6a9986112e18ae47095');
});

test('Chido registers only plane providers sequentially and cancels a late auxiliary source', async () => {
  const previous = Reflect.get(globalThis, 'XRRigidTransform');
  Object.defineProperty(globalThis, 'XRRigidTransform', {configurable:true,writable:true,value:class {}});
  try {
    let calls = 0, concurrent = 0, peak = 0;
    const requested: XRHitTestOptionsInit[] = [];
    const session = {
      requestReferenceSpace:async()=>space,
      requestHitTestSource:async(options: XRHitTestOptionsInit)=>{
        calls++; requested.push(options); concurrent++; peak=Math.max(peak,concurrent);
        await new Promise(resolve=>setImmediate(resolve));
        concurrent--; return source();
      }
    } as unknown as XRSession;
    const tracker = new ChidoFloorTracking(new FloorScanner());
    await tracker.start(session);
    assert.ok(tracker.hitSource, 'central provider is live before optional setup finishes');
    await tracker.auxiliaryReady;
    assert.equal(calls,9);
    assert.equal(peak,1,'never flood ARCore with concurrent registrations');
    assert.ok(requested.every(options=>options.entityTypes?.join(',')==='plane'));
    tracker.dispose();

    let resolveLate!: (value: XRHitTestSource) => void;
    let lateCancelled = 0;
    let count = 0;
    const lateSession = {
      requestReferenceSpace:async()=>space,
      requestHitTestSource:()=>{
        if(++count===1)return Promise.resolve(source());
        return new Promise<XRHitTestSource>(resolve=>{resolveLate=resolve;});
      }
    } as unknown as XRSession;
    await tracker.start(lateSession);
    await new Promise(resolve=>setImmediate(resolve));
    const optional = tracker.auxiliaryReady;
    tracker.dispose();
    resolveLate({cancel:()=>{lateCancelled++;}} as XRHitTestSource);
    await optional;
    assert.equal(lateCancelled,1);
    assert.equal(tracker.hitSource,null);
    assert.equal(tracker.extraHitSources.length,0);
  } finally {
    if(previous) Reflect.set(globalThis, 'XRRigidTransform', previous);
    else Reflect.deleteProperty(globalThis,'XRRigidTransform');
  }
});

test('central XR frames reach floor readiness despite a broken auxiliary ray', () => {
  const scanner = new FloorScanner();
  const tracker = new ChidoFloorTracking(scanner);
  const central=source(), broken=source();
  tracker.hitSource=central;
  tracker.extraHitSources=[broken];
  let x=0;
  const frame={getHitTestResults:(s: XRHitTestSource)=>{
    if(s===broken)throw new DOMException('optional ray expired','InvalidStateError');
    return [hit(x)];
  }} as unknown as XRFrame;
  for (let i=0;i<3;i++) {
    x=i*.3;
    assert.ok(tracker.update(frame,space,pose,100+i*16));
  }
  assert.equal(scanner.rawHits,1);
  assert.equal(scanner.validHits,1);
  assert.equal(scanner.observations.length,3);
  assert.equal(scanner.ready,true,'three independent central hits enable confirmation');
  tracker.dispose();
});
