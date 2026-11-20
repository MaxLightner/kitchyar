import * as THREE from 'three';
import type { CountertopEdgeProfile } from './types';

export interface CountertopRadii {
  topRadius: number;
  bottomRadius: number;
}

export interface CountertopBowlRect {
  x: number;
  z: number;
  width: number;
  length: number;
  /** World-space X,Z polygon of the actual source basin cutout, if non-rectangular. */
  outline?: Array<[number, number]>;
}

export interface CountertopSectionParams {
  startX: number;
  width: number;
  zStart?: number;
  zEnd: number;
  thickness: number;
  normalSign: 1 | -1;
  topEdge: CountertopEdgeProfile;
  bottomEdge: CountertopEdgeProfile;
  arcSegments?: number;
}

export interface SinkCountertopParams {
  startX: number;
  width: number;
  depth: number;
  thickness: number;
  normalSign: 1 | -1;
  topEdge: CountertopEdgeProfile;
  bottomEdge: CountertopEdgeProfile;
  bowls: CountertopBowlRect[];
  arcSegments?: number;
}

/**
 * Expand a sink basin polygon outwards by a small physical installation gap.
 * Mitered offsets maintain the wall clearance around diagonal corners instead
 * of scaling polygon vertices from the center (which varies at each angle).
 * A bounded join prevents skinny spikes / degenerate triangles in cutouts.
 */
export function expandBasinCutoutOutline(points: Array<[number, number]>, gapM = .008): Array<[number, number]> {
  if (points.length < 3 || gapM <= 0) return points.map(([x, z]) => [x, z]);
  let twiceArea = 0;
  for (let i = 0; i < points.length; i++) {
    const [x, z] = points[i];
    const [nx, nz] = points[(i + 1) % points.length];
    twiceArea += x * nz - nx * z;
  }
  const winding = twiceArea >= 0 ? 1 : -1;
  const outward = (a: [number, number], b: [number, number]): [number, number] => {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const length = Math.max(1e-8, Math.hypot(dx, dz));
    return winding > 0 ? [dz / length, -dx / length] : [-dz / length, dx / length];
  };
  return points.map((point, i) => {
    const prev = points[(i - 1 + points.length) % points.length];
    const next = points[(i + 1) % points.length];
    const n1 = outward(prev, point);
    const n2 = outward(point, next);
    const bx = n1[0] + n2[0], bz = n1[1] + n2[1];
    const d = bx * n2[0] + bz * n2[1];
    if (Math.abs(d) < .15) return [point[0] + n2[0] * gapM, point[1] + n2[1] * gapM];
    const amount = Math.min(gapM * 2.5, Math.abs(gapM / d) * Math.hypot(bx, bz));
    const length = Math.max(1e-8, Math.hypot(bx, bz));
    return [point[0] + bx * amount / length * Math.sign(d), point[1] + bz * amount / length * Math.sign(d)];
  });
}

const COUNTERTOP_UV_U_SCALE = 1.8;
const COUNTERTOP_UV_V_SCALE = 0.62;

/**
 * Computes physically bounded quarter-round edge radii for independent
 * top and bottom front edges of a countertop slab.
 */
export function computeCountertopRadii(
  thicknessM: number,
  depthM: number,
  topEdge: CountertopEdgeProfile,
  bottomEdge: CountertopEdgeProfile
): CountertopRadii {
  const safeT = Math.max(0.005, thicknessM);
  const safeD = Math.max(0.02, depthM);
  const bothRound = topEdge === 'round' && bottomEdge === 'round';
  const maxByDepth = safeD * 0.28;
  const maxSingle = Math.min(safeT * 0.72, 0.026, maxByDepth);
  const maxBoth = Math.min(safeT * 0.48, 0.022, maxByDepth);

  let topRadius = topEdge === 'round' ? (bothRound ? maxBoth : maxSingle) : 0;
  let bottomRadius = bottomEdge === 'round' ? (bothRound ? maxBoth : maxSingle) : 0;

  // Guarantee a tiny non-zero gap between arcs so vertices never invert
  const sum = topRadius + bottomRadius;
  const maxAllowedSum = Math.max(0, safeT - 0.0004);
  if (sum > maxAllowedSum && sum > 0) {
    const scale = maxAllowedSum / sum;
    topRadius *= scale;
    bottomRadius *= scale;
  }

  return { topRadius, bottomRadius };
}

/**
 * Computes calibrated under-cabinet warm SpotLight intensity and LED strip emissive color
 * so the backsplash and countertop receive soft studio illumination without whiteout.
 */
export function computeUnderCabinetLightConfig(lengthM: number, spotCount: number) {
  const safeLen = Math.max(0.1, lengthM);
  const count = Math.max(1, spotCount);
  const spotIntensity = Math.min(3.5, 1.45 + (safeLen * 0.75) / count);
  return {
    spotIntensity,
    spotDistance: 1.45,
    spotAngle: 0.98,
    spotPenumbra: 0.92,
    spotDecay: 2,
    stripRgb: [1.38, 1.12, 0.8] as const,
  };
}

interface ProfileSegVertex {
  uZ: number;
  y: number;
  nz: number;
  ny: number;
}

interface ProfileSeg {
  a: ProfileSegVertex;
  b: ProfileSegVertex;
}

function buildCrossSectionSegments(
  zStart: number,
  zEnd: number,
  thickness: number,
  topEdge: CountertopEdgeProfile,
  bottomEdge: CountertopEdgeProfile,
  arcSegments: number
): { segments: ProfileSeg[]; perimeterPoints: Array<[number, number]> } {
  const spanD = Math.max(0.01, zEnd - zStart);
  const { topRadius, bottomRadius } = computeCountertopRadii(
    thickness,
    spanD,
    topEdge,
    bottomEdge
  );
  const segs: ProfileSeg[] = [];
  const perimeterPoints: Array<[number, number]> = [];
  const pushPerim = (z: number, y: number) => {
    const last = perimeterPoints[perimeterPoints.length - 1];
    if (!last || Math.hypot(last[0] - z, last[1] - y) > 1e-6) {
      perimeterPoints.push([z, y]);
    }
  };

  const addFlat = (z1: number, y1: number, z2: number, y2: number, nz: number, ny: number) => {
    if (Math.hypot(z2 - z1, y2 - y1) < 1e-6) return;
    segs.push({
      a: { uZ: z1, y: y1, nz, ny },
      b: { uZ: z2, y: y2, nz, ny },
    });
    pushPerim(z1, y1);
    pushPerim(z2, y2);
  };

  // 1. Bottom flat face: (zStart, 0) -> (zEnd - bottomRadius, 0)
  addFlat(zStart, 0, zEnd - bottomRadius, 0, 0, -1);

  // 2. Bottom-front quarter-round arc: angle -PI/2 -> 0 around (zEnd - rB, rB)
  if (bottomRadius > 1e-5) {
    const cz = zEnd - bottomRadius;
    const cy = bottomRadius;
    for (let i = 0; i < arcSegments; i++) {
      const t0 = -Math.PI / 2 + (i / arcSegments) * (Math.PI / 2);
      const t1 = -Math.PI / 2 + ((i + 1) / arcSegments) * (Math.PI / 2);
      const z0 = cz + bottomRadius * Math.cos(t0);
      const y0 = cy + bottomRadius * Math.sin(t0);
      const z1 = cz + bottomRadius * Math.cos(t1);
      const y1 = cy + bottomRadius * Math.sin(t1);
      segs.push({
        a: { uZ: z0, y: y0, nz: Math.cos(t0), ny: Math.sin(t0) },
        b: { uZ: z1, y: y1, nz: Math.cos(t1), ny: Math.sin(t1) },
      });
      pushPerim(z0, y0);
      pushPerim(z1, y1);
    }
  }

  // 3. Front vertical face: (zEnd, bottomRadius) -> (zEnd, thickness - topRadius)
  addFlat(zEnd, bottomRadius, zEnd, thickness - topRadius, 1, 0);

  // 4. Top-front quarter-round arc: angle 0 -> +PI/2 around (zEnd - rT, thickness - rT)
  if (topRadius > 1e-5) {
    const cz = zEnd - topRadius;
    const cy = thickness - topRadius;
    for (let i = 0; i < arcSegments; i++) {
      const t0 = (i / arcSegments) * (Math.PI / 2);
      const t1 = ((i + 1) / arcSegments) * (Math.PI / 2);
      const z0 = cz + topRadius * Math.cos(t0);
      const y0 = cy + topRadius * Math.sin(t0);
      const z1 = cz + topRadius * Math.cos(t1);
      const y1 = cy + topRadius * Math.sin(t1);
      segs.push({
        a: { uZ: z0, y: y0, nz: Math.cos(t0), ny: Math.sin(t0) },
        b: { uZ: z1, y: y1, nz: Math.cos(t1), ny: Math.sin(t1) },
      });
      pushPerim(z0, y0);
      pushPerim(z1, y1);
    }
  }

  // 5. Top flat face: (zEnd - topRadius, thickness) -> (zStart, thickness)
  addFlat(zEnd - topRadius, thickness, zStart, thickness, 0, 1);

  // 6. Back face: (zStart, thickness) -> (zStart, 0)
  addFlat(zStart, thickness, zStart, 0, -1, 0);

  return { segments: segs, perimeterPoints };
}

/**
 * Builds a watertight, manifold countertop slab geometry with independent top and bottom
 * front edge profiles, smooth analytical normals on rounded arcs, crisp normals on square faces,
 * correct triangle winding for both normalSign = +1 and -1, and consistent world-scale UVs.
 */
export function createCountertopSectionGeometry(params: CountertopSectionParams): THREE.BufferGeometry {
  const zStart = params.zStart ?? 0;
  const zEnd = Math.max(zStart + 0.01, params.zEnd);
  const thickness = Math.max(0.005, params.thickness);
  const width = Math.max(0.01, params.width);
  const x0 = params.startX;
  const x1 = x0 + width;
  const sign = params.normalSign;
  const arcSegs = Math.max(4, params.arcSegments ?? 10);

  const { segments, perimeterPoints } = buildCrossSectionSegments(
    zStart,
    zEnd,
    thickness,
    params.topEdge,
    params.bottomEdge,
    arcSegs
  );

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  const pushTri = (
    ax: number, ay: number, az: number, anx: number, any: number, anz: number, au: number, av: number,
    bx: number, by: number, bz: number, bnx: number, bny: number, bnz: number, bu: number, bv: number,
    cx: number, cy: number, cz: number, cnx: number, cny: number, cnz: number, cu: number, cv: number
  ) => {
    positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    normals.push(anx, any, anz, bnx, bny, bnz, cnx, cny, cnz);
    uvs.push(au, av, bu, bv, cu, cv);
  };

  // Perimeter extrusion quads along X
  for (const seg of segments) {
    const aZ = sign * seg.a.uZ;
    const bZ = sign * seg.b.uZ;
    const aNz = sign * seg.a.nz;
    const bNz = sign * seg.b.nz;

    const u0 = x0 / COUNTERTOP_UV_U_SCALE;
    const u1 = x1 / COUNTERTOP_UV_U_SCALE;
    const vA = (seg.a.uZ + (thickness - seg.a.y)) / COUNTERTOP_UV_V_SCALE;
    const vB = (seg.b.uZ + (thickness - seg.b.y)) / COUNTERTOP_UV_V_SCALE;

    if (sign > 0) {
      pushTri(
        x0, seg.a.y, aZ, 0, seg.a.ny, aNz, u0, vA,
        x1, seg.a.y, aZ, 0, seg.a.ny, aNz, u1, vA,
        x1, seg.b.y, bZ, 0, seg.b.ny, bNz, u1, vB
      );
      pushTri(
        x0, seg.a.y, aZ, 0, seg.a.ny, aNz, u0, vA,
        x1, seg.b.y, bZ, 0, seg.b.ny, bNz, u1, vB,
        x0, seg.b.y, bZ, 0, seg.b.ny, bNz, u0, vB
      );
    } else {
      pushTri(
        x0, seg.a.y, aZ, 0, seg.a.ny, aNz, u0, vA,
        x1, seg.b.y, bZ, 0, seg.b.ny, bNz, u1, vB,
        x1, seg.a.y, aZ, 0, seg.a.ny, aNz, u1, vA
      );
      pushTri(
        x0, seg.a.y, aZ, 0, seg.a.ny, aNz, u0, vA,
        x0, seg.b.y, bZ, 0, seg.b.ny, bNz, u0, vB,
        x1, seg.b.y, bZ, 0, seg.b.ny, bNz, u1, vB
      );
    }
  }

  // Side end-caps (x = x0 normal -1, x = x1 normal +1)
  const cZ = (zStart + zEnd) / 2;
  const cY = thickness / 2;
  const cu = cZ / (COUNTERTOP_UV_V_SCALE * 3);
  const cv = cY / COUNTERTOP_UV_V_SCALE;
  const nPts = perimeterPoints.length;
  for (let i = 0; i < nPts; i++) {
    const [zA, yA] = perimeterPoints[i];
    const [zB, yB] = perimeterPoints[(i + 1) % nPts];
    const uA = zA / (COUNTERTOP_UV_V_SCALE * 3);
    const vA = yA / COUNTERTOP_UV_V_SCALE;
    const uB = zB / (COUNTERTOP_UV_V_SCALE * 3);
    const vB = yB / COUNTERTOP_UV_V_SCALE;

    if (sign > 0) {
      // Right cap (+X)
      pushTri(
        x1, cY, sign * cZ, 1, 0, 0, cu, cv,
        x1, yB, sign * zB, 1, 0, 0, uB, vB,
        x1, yA, sign * zA, 1, 0, 0, uA, vA
      );
      // Left cap (-X)
      pushTri(
        x0, cY, sign * cZ, -1, 0, 0, cu, cv,
        x0, yA, sign * zA, -1, 0, 0, uA, vA,
        x0, yB, sign * zB, -1, 0, 0, uB, vB
      );
    } else {
      // Right cap (+X)
      pushTri(
        x1, cY, sign * cZ, 1, 0, 0, cu, cv,
        x1, yA, sign * zA, 1, 0, 0, uA, vA,
        x1, yB, sign * zB, 1, 0, 0, uB, vB
      );
      // Left cap (-X)
      pushTri(
        x0, cY, sign * cZ, -1, 0, 0, cu, cv,
        x0, yB, sign * zB, -1, 0, 0, uB, vB,
        x0, yA, sign * zA, -1, 0, 0, uA, vA
      );
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

function makeRectPath(x: number, z: number, width: number, length: number, radius: number): THREE.Shape {
  const path = new THREE.Shape();
  const r = Math.min(radius, width / 2, length / 2);
  const l = x - width / 2;
  const right = x + width / 2;
  const b = -z - length / 2;
  const t = -z + length / 2;
  if (r <= 1e-5) {
    path.moveTo(l, b);
    path.lineTo(right, b);
    path.lineTo(right, t);
    path.lineTo(l, t);
    path.closePath();
    return path;
  }
  path.moveTo(l + r, b);
  path.lineTo(right - r, b);
  path.quadraticCurveTo(right, b, right, b + r);
  path.lineTo(right, t - r);
  path.quadraticCurveTo(right, t, right - r, t);
  path.lineTo(l + r, t);
  path.quadraticCurveTo(l, t, l, t - r);
  path.lineTo(l, b + r);
  path.quadraticCurveTo(l, b, l + r, b);
  return path;
}

function makePolygonHolePath(ptsXZ: Array<[number, number]>): THREE.Path {
  // In ExtrudeGeometry XZ maps to (x,-z); hole winding must be clockwise.
  const pts = ptsXZ.map(([x,z]) => new THREE.Vector2(x,-z));
  if (!THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
  const hole = new THREE.Path();
  pts.forEach((pt,index) => index ? hole.lineTo(pt.x,pt.y) : hole.moveTo(pt.x,pt.y));
  hole.closePath();
  return hole;
}

/**
 * Re-projects UVs on an extruded horizontal slab so texture density matches metric dimensions
 * consistently across rectangular slabs, sink slabs, and profiled front edges.
 */
export function normalizeCountertopExtrudeUVs(geo: THREE.BufferGeometry, thickness: number): THREE.BufferGeometry {
  const nonIdx = geo.index ? geo.toNonIndexed() : geo;
  if (!nonIdx.getAttribute('normal')) nonIdx.computeVertexNormals();
  const pos = nonIdx.getAttribute('position');
  const nrm = nonIdx.getAttribute('normal');
  const uvArr = new Float32Array(pos.count * 2);

  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    const nx = Math.abs(nrm.getX(i));
    const ny = Math.abs(nrm.getY(i));
    const nz = Math.abs(nrm.getZ(i));
    const absZ = Math.abs(pz);

    if (ny >= 0.5) {
      uvArr[i * 2] = px / COUNTERTOP_UV_U_SCALE;
      uvArr[i * 2 + 1] = absZ / COUNTERTOP_UV_V_SCALE;
    } else if (nz >= nx) {
      uvArr[i * 2] = px / COUNTERTOP_UV_U_SCALE;
      uvArr[i * 2 + 1] = (absZ + (thickness - py)) / COUNTERTOP_UV_V_SCALE;
    } else {
      uvArr[i * 2] = absZ / (COUNTERTOP_UV_V_SCALE * 3);
      uvArr[i * 2 + 1] = py / COUNTERTOP_UV_V_SCALE;
    }
  }
  nonIdx.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
  return nonIdx;
}

/**
 * Combines a rear bowl-cutout slab and the profiled front nose rail into one seamless BufferGeometry
 * so sink countertops also render independent rounded/square top and bottom edges accurately.
 */
export function createSinkCountertopGeometry(params: SinkCountertopParams): THREE.BufferGeometry {
  const { startX, width, depth, thickness, normalSign, topEdge, bottomEdge, bowls, arcSegments } = params;
  const maxBowlAbsZ = bowls.reduce((acc, b) => Math.max(acc,
    b.outline?.length ? Math.max(...b.outline.map(([,z]) => Math.abs(z))) :
      Math.abs(b.z) + b.length / 2), 0);
  const { topRadius, bottomRadius } = computeCountertopRadii(thickness, depth, topEdge, bottomEdge);
  const minFrontStrip = Math.max(0.018, Math.max(topRadius, bottomRadius) + 0.008);
  const splitZ = Math.max(0.05, Math.min(depth - minFrontStrip, maxBowlAbsZ + 0.006));

  // Clamp holes strictly inside [startX .. startX+width] and [0 .. splitZ]
  const safeBowls = bowls.map((b) => {
    const bw = Math.min(b.width, Math.max(0.04, width - 0.02));
    const halfW = bw / 2;
    const cx = Math.max(startX + halfW + 0.008, Math.min(startX + width - halfW - 0.008, b.x));
    const absCz = Math.abs(b.z);
    const bl = Math.min(b.length, Math.max(0.04, splitZ - 0.02));
    const halfL = bl / 2;
    const clampedAbsZ = Math.max(halfL + 0.008, Math.min(splitZ - halfL - 0.004, absCz));
    // Preserve the topology of diagonal basin polygons. Clamping each vertex
    // independently caused coincident points, broken triangulation and thin
    // shredded triangles near the front strip. Translate and (only when
    // needed) uniformly shrink the entire outline to fit the stone instead.
    let outline: Array<[number, number]> | undefined;
    if (b.outline?.length) {
      const xs = b.outline.map(([x]) => x);
      const zs = b.outline.map(([,z]) => Math.abs(z));
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minZ = Math.min(...zs), maxZ = Math.max(...zs);
      const cx0 = (minX + maxX) / 2, cz0 = (minZ + maxZ) / 2;
      const fit = Math.min(1,
        Math.max(.001, width - .014) / Math.max(.001, maxX - minX),
        Math.max(.001, splitZ - .014) / Math.max(.001, maxZ - minZ));
      const halfW = (maxX - minX) * fit / 2;
      const halfD = (maxZ - minZ) * fit / 2;
      const cx = Math.max(startX + .007 + halfW,
        Math.min(startX + width - .007 - halfW, cx0));
      const cz = Math.max(.007 + halfD,
        Math.min(splitZ - .007 - halfD, cz0));
      outline = b.outline.map(([x,z]): [number,number] => [
        cx + (x - cx0) * fit,
        normalSign * (cz + (Math.abs(z) - cz0) * fit),
      ]);
    }
    return { x: cx, z: normalSign * clampedAbsZ, width: bw, length: bl, outline };
  });

  const rearShape = makeRectPath(startX + width / 2, normalSign * (splitZ / 2), width, splitZ, 0);
  for (const b of safeBowls) {
    rearShape.holes.push(b.outline?.length
      ? makePolygonHolePath(b.outline)
      : makeRectPath(b.x, b.z, b.width, b.length, 0.045));
  }
  const rearRaw = new THREE.ExtrudeGeometry(rearShape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 8,
  }).rotateX(-Math.PI / 2);
  const rearGeo = normalizeCountertopExtrudeUVs(rearRaw, thickness);
  if (rearRaw !== rearGeo) rearRaw.dispose();

  const frontGeo = createCountertopSectionGeometry({
    startX,
    width,
    zStart: splitZ,
    zEnd: depth,
    thickness,
    normalSign,
    topEdge,
    bottomEdge,
    arcSegments,
  });

  const p1 = rearGeo.getAttribute('position') as THREE.BufferAttribute;
  const n1 = rearGeo.getAttribute('normal') as THREE.BufferAttribute;
  const u1 = rearGeo.getAttribute('uv') as THREE.BufferAttribute;
  const p2 = frontGeo.getAttribute('position') as THREE.BufferAttribute;
  const n2 = frontGeo.getAttribute('normal') as THREE.BufferAttribute;
  const u2 = frontGeo.getAttribute('uv') as THREE.BufferAttribute;

  const totalVerts = p1.count + p2.count;
  const pos = new Float32Array(totalVerts * 3);
  const nrm = new Float32Array(totalVerts * 3);
  const uv = new Float32Array(totalVerts * 2);

  pos.set(p1.array as Float32Array, 0);
  pos.set(p2.array as Float32Array, p1.count * 3);
  nrm.set(n1.array as Float32Array, 0);
  nrm.set(n2.array as Float32Array, p1.count * 3);
  uv.set(u1.array as Float32Array, 0);
  uv.set(u2.array as Float32Array, p1.count * 2);

  rearGeo.dispose();
  frontGeo.dispose();

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}
