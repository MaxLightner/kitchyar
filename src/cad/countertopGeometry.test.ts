import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  computeCountertopRadii,
  computeUnderCabinetLightConfig,
  createCountertopSectionGeometry,
  createSinkCountertopGeometry,
  expandBasinCutoutOutline,
  normalizeCountertopExtrudeUVs,
} from './countertopGeometry';
import type { CountertopEdgeProfile } from './types';

function assertFiniteGeometry(geo: THREE.BufferGeometry, expectedBounds: {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  assert.ok(pos && pos.count >= 12, 'position attribute must have triangles');
  assert.equal(nrm.count, pos.count, 'normal count must match position count');
  assert.equal(uv.count, pos.count, 'uv count must match position count');

  for (let i = 0; i < pos.count; i++) {
    assert.ok(Number.isFinite(pos.getX(i)) && Number.isFinite(pos.getY(i)) && Number.isFinite(pos.getZ(i)));
    const nx = nrm.getX(i);
    const ny = nrm.getY(i);
    const nz = nrm.getZ(i);
    assert.ok(Number.isFinite(nx) && Number.isFinite(ny) && Number.isFinite(nz));
    const len = Math.hypot(nx, ny, nz);
    assert.ok(len > 0.99 && len < 1.01, `normal must be unit length, got ${len}`);
    assert.ok(Number.isFinite(uv.getX(i)) && Number.isFinite(uv.getY(i)));
  }

  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  assert.ok(Math.abs(bb.min.x - expectedBounds.minX) < 1e-4, `min.x ${bb.min.x} vs ${expectedBounds.minX}`);
  assert.ok(Math.abs(bb.max.x - expectedBounds.maxX) < 1e-4, `max.x ${bb.max.x} vs ${expectedBounds.maxX}`);
  assert.ok(Math.abs(bb.min.y - expectedBounds.minY) < 1e-4, `min.y ${bb.min.y} vs ${expectedBounds.minY}`);
  assert.ok(Math.abs(bb.max.y - expectedBounds.maxY) < 1e-4, `max.y ${bb.max.y} vs ${expectedBounds.maxY}`);
  assert.ok(Math.abs(bb.min.z - expectedBounds.minZ) < 1e-4, `min.z ${bb.min.z} vs ${expectedBounds.minZ}`);
  assert.ok(Math.abs(bb.max.z - expectedBounds.maxZ) < 1e-4, `max.z ${bb.max.z} vs ${expectedBounds.maxZ}`);
}

function verifyOutwardTriangleWinding(geo: THREE.BufferGeometry) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const faceCross = new THREE.Vector3();
  const avgN = new THREE.Vector3();

  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    faceCross.crossVectors(ab, ac);
    if (faceCross.lengthSq() < 1e-12) continue;
    faceCross.normalize();
    avgN
      .set(nrm.getX(i), nrm.getY(i), nrm.getZ(i))
      .add(new THREE.Vector3(nrm.getX(i + 1), nrm.getY(i + 1), nrm.getZ(i + 1)))
      .add(new THREE.Vector3(nrm.getX(i + 2), nrm.getY(i + 2), nrm.getZ(i + 2)))
      .normalize();
    assert.ok(
      faceCross.dot(avgN) > 0.5,
      `triangle ${i / 3} winding opposes vertex normal (dot=${faceCross.dot(avgN)})`
    );
  }
}

test('computeCountertopRadii respects independent edges and thickness bounds', () => {
  const sqSq = computeCountertopRadii(0.04, 0.62, 'square', 'square');
  assert.equal(sqSq.topRadius, 0);
  assert.equal(sqSq.bottomRadius, 0);

  const rndSq = computeCountertopRadii(0.04, 0.62, 'round', 'square');
  assert.ok(rndSq.topRadius > 0.015 && rndSq.topRadius <= 0.026);
  assert.equal(rndSq.bottomRadius, 0);

  const sqRnd = computeCountertopRadii(0.04, 0.62, 'square', 'round');
  assert.equal(sqRnd.topRadius, 0);
  assert.ok(sqRnd.bottomRadius > 0.015 && sqRnd.bottomRadius <= 0.026);

  for (const tCm of [2, 3, 4, 5, 6, 8]) {
    const tM = tCm * 0.01;
    const both = computeCountertopRadii(tM, 0.62, 'round', 'round');
    assert.ok(both.topRadius > 0 && both.bottomRadius > 0);
    assert.ok(
      both.topRadius + both.bottomRadius < tM,
      `combined radii must remain strictly less than thickness ${tCm}cm`
    );
  }
});

test('createCountertopSectionGeometry builds valid outward normals for all 4 edge combos and both normalSigns', () => {
  const combos: Array<[CountertopEdgeProfile, CountertopEdgeProfile]> = [
    ['square', 'square'],
    ['round', 'square'],
    ['square', 'round'],
    ['round', 'round'],
  ];
  const vertCounts: Record<string, number> = {};

  for (const normalSign of [1, -1] as const) {
    for (const [topEdge, bottomEdge] of combos) {
      const geo = createCountertopSectionGeometry({
        startX: 0.2,
        width: 1.2,
        zStart: 0,
        zEnd: 0.62,
        thickness: 0.04,
        normalSign,
        topEdge,
        bottomEdge,
        arcSegments: 8,
      });
      assertFiniteGeometry(geo, {
        minX: 0.2,
        maxX: 1.4,
        minY: 0,
        maxY: 0.04,
        minZ: normalSign > 0 ? 0 : -0.62,
        maxZ: normalSign > 0 ? 0.62 : 0,
      });
      verifyOutwardTriangleWinding(geo);
      if (normalSign === 1) {
        vertCounts[`${topEdge}-${bottomEdge}`] = geo.getAttribute('position').count;
      }
      geo.dispose();
    }
  }

  assert.ok(vertCounts['round-square'] > vertCounts['square-square']);
  assert.equal(vertCounts['round-square'], vertCounts['square-round']);
  assert.ok(vertCounts['round-round'] > vertCounts['round-square']);
});

test('createCountertopSectionGeometry preserves crisp 90-degree front edge normals when only one edge is rounded', () => {
  const topOnlyRound = createCountertopSectionGeometry({
    startX: 0,
    width: 1.0,
    zStart: 0,
    zEnd: 0.62,
    thickness: 0.04,
    normalSign: 1,
    topEdge: 'round',
    bottomEdge: 'square',
    arcSegments: 8,
  });
  const pos = topOnlyRound.getAttribute('position') as THREE.BufferAttribute;
  const nrm = topOnlyRound.getAttribute('normal') as THREE.BufferAttribute;
  let hasBottomCornerFlat = false;
  let hasSmoothTopArc = false;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ny = nrm.getY(i);
    const nz = nrm.getZ(i);
    if (Math.abs(y) < 1e-5 && Math.abs(z - 0.62) < 1e-5 && Math.abs(ny + 1) < 1e-5) {
      hasBottomCornerFlat = true;
    }
    if (y > 0.015 && y < 0.04 && z > 0.59 && ny > 0.15 && nz > 0.15) {
      hasSmoothTopArc = true;
    }
  }
  assert.ok(hasBottomCornerFlat, 'bottom-front edge must remain sharp square at (z=0.62, y=0)');
  assert.ok(hasSmoothTopArc, 'top-front edge must have smooth oblique normals');
  topOnlyRound.dispose();
});

test('createSinkCountertopGeometry handles single & double bowls with normalized metric UVs', () => {
  for (const normalSign of [1, -1] as const) {
    for (const [topEdge, bottomEdge] of [
      ['square', 'square'],
      ['round', 'square'],
      ['square', 'round'],
      ['round', 'round'],
    ] as const) {
      const geo = createSinkCountertopGeometry({
        startX: 0,
        width: 0.9,
        depth: 0.62,
        thickness: 0.05,
        normalSign,
        topEdge,
        bottomEdge,
        bowls: [
          { x: 0.27, z: normalSign * 0.28, width: 0.36, length: 0.4 },
          { x: 0.65, z: normalSign * 0.28, width: 0.32, length: 0.4 },
        ],
        arcSegments: 6,
      });
      assertFiniteGeometry(geo, {
        minX: 0,
        maxX: 0.9,
        minY: 0,
        maxY: 0.05,
        minZ: normalSign > 0 ? 0 : -0.62,
        maxZ: normalSign > 0 ? 0.62 : 0,
      });
      geo.dispose();
    }
  }
});

test('normalizeCountertopExtrudeUVs produces bounded metric UVs regardless of box width', () => {
  const box = new THREE.BoxGeometry(0.9, 0.02, 0.58);
  const norm = normalizeCountertopExtrudeUVs(box, 0.02);
  const uv = norm.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    assert.ok(Number.isFinite(uv.getX(i)) && Number.isFinite(uv.getY(i)));
    assert.ok(uv.getX(i) >= -1 && uv.getX(i) <= 2);
  }
  box.dispose();
  norm.dispose();
});

test('computeUnderCabinetLightConfig returns calibrated studio lighting without whiteout', () => {
  const shortCfg = computeUnderCabinetLightConfig(0.8, 2);
  const longCfg = computeUnderCabinetLightConfig(3.2, 4);
  assert.ok(shortCfg.spotIntensity >= 1.4 && shortCfg.spotIntensity <= 3.5);
  assert.ok(longCfg.spotIntensity >= 1.4 && longCfg.spotIntensity <= 3.5);
  assert.ok(shortCfg.stripRgb[0] < 1.6 && shortCfg.stripRgb[1] < 1.3 && shortCfg.stripRgb[2] < 1.0);
});


test('8mm basin cutout clearance expands rotated and concave outlines without invalid vertices', () => {
  const rotated: Array<[number,number]> = [
    [-.12, 0], [0, -.12], [.12, 0], [0, .12],
  ];
  const expanded = expandBasinCutoutOutline(rotated, .008);
  assert.equal(expanded.length, rotated.length);
  for (let i = 0; i < rotated.length; i++) {
    const [x,z] = rotated[i];
    const [ex,ez] = expanded[i];
    assert.ok(Number.isFinite(ex) && Number.isFinite(ez));
    assert.ok(Math.hypot(ex, ez) > Math.hypot(x, z));
    assert.ok(Math.hypot(ex-x,ez-z) < .021);
  }
  for (const sign of [1,-1] as const) {
    const bowl = expanded.map(([x,z]):[number,number] => [
      0.5 + x, sign * (0.30 + z),
    ]);
    const geo = createSinkCountertopGeometry({
      startX: 0, width: 1, depth: .60, thickness: .03,
      normalSign: sign, topEdge: 'round', bottomEdge: 'square',
      bowls: [{x:.5,z:sign*.3,width:.25,length:.25,outline:bowl}],
    });
    const position = geo.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      assert.ok(Number.isFinite(position.getX(i)) && Number.isFinite(position.getY(i)) && Number.isFinite(position.getZ(i)));
    }
    geo.dispose();
  }
});
