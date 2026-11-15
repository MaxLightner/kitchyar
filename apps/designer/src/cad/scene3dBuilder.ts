import * as THREE from 'three';
import {
  APPLIANCE_CONFIGS,
  APRON_SINK_DEPTH_CM,
  FRIDGE_FRAME_CM,
  FRIDGE_MODELS,
} from './constants';
import {
  analyzeCornerJunction,
  detectCornerJunctions,
  getCornerBlockedZonesForWall,
  getWallVectors,
} from './cornerLogic';
import {
  computeWallBacksplashSpans,
  doesFridgeTouchCabinet,
  getBoxFrameInsets,
  getUnitsInBox,
} from './doorRules';
import { createKitchenMaterialPack, KitchenMaterialPack } from './materials3d';
import { deriveFloorPolygon } from './floorPolygon';
import {
  ApplianceItem,
  CabinetBox,
  CabinetFinishId,
  DoorStyle,
  DoorUnit,
  ProjectState,
  Wall,
  WallOpening,
} from './types';

export const CM = 0.01; // 1 cm = 0.01 world meter

export interface Scene3DHitData {
  kind:
    | 'wall'
    | 'backsplash'
    | 'countertop'
    | 'box'
    | 'door'
    | 'unit'
    | 'unit-div'
    | 'shelf'
    | 'frame'
    | 'handle'
    | 'appliance'
    | 'opening'
    | 'box-handle';
  wallId: string;
  boxId?: string;
  doorId?: string;
  /** Unique animated leaf/drawer part; keeps façade selection tied to doorId. */
  animationId?: string;
  appId?: string;
  openingId?: string;
  frameId?: string;
  shelfId?: string;
  handleId?: string;
  seamCm?: number;
  unitStart?: number;
  unitEnd?: number;
  handleSide?: 'left' | 'right' | 'top' | 'bottom';
  localXCm?: number;
  localYCm?: number;
}

export interface AnimatedDoorHandle {
  doorId: string;
  group: THREE.Group;
  kind: 'hinge-left' | 'hinge-right' | 'lift' | 'drawer';
  normalSign: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  baseRotX: number;
  baseRotY: number;
  maxAngle?: number;
  maxSlide?: number;
}

/**
 * Quintic ease-in-out curve for damped soft-close ("آرام‌بند") cabinet door motion.
 */
export function easeInOutSoftClose(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/**
 * Applies normalized `[0..1]` open progress to an animated door handle using soft-close easing.
 */
export function applyAnimatedDoorProgress(
  handle: AnimatedDoorHandle,
  rawProgress: number
): void {
  const e = easeInOutSoftClose(rawProgress);
  handle.group.position.set(handle.baseX, handle.baseY, handle.baseZ);
  handle.group.rotation.x = handle.baseRotX;
  handle.group.rotation.y = handle.baseRotY;

  if (handle.kind === 'hinge-left') {
    handle.group.rotation.y =
      handle.baseRotY - handle.normalSign * e * (handle.maxAngle ?? 1.38);
  } else if (handle.kind === 'hinge-right') {
    handle.group.rotation.y =
      handle.baseRotY + handle.normalSign * e * (handle.maxAngle ?? 1.38);
  } else if (handle.kind === 'lift') {
    handle.group.rotation.x =
      handle.baseRotX - handle.normalSign * e * (handle.maxAngle ?? 1.25);
  } else {
    handle.group.position.z =
      handle.baseZ + handle.normalSign * e * (handle.maxSlide ?? 0.34);
  }
}

export interface BuiltKitchenScene {
  root: THREE.Group;
  interactables: THREE.Object3D[];
  animatedDoors: AnimatedDoorHandle[];
  wallTransforms: Map<
    string,
    {
      origin: THREE.Vector3;
      tangent: THREE.Vector3;
      normal: THREE.Vector3;
      rightVec: THREE.Vector3;
      normalSign: 1 | -1;
      lengthCm: number;
      heightCm: number;
    }
  >;
  bounds: THREE.Box3;
}

export function detectSoftwareWebGL(gl: WebGLRenderingContext | WebGL2RenderingContext | null): boolean {
  if (!gl) return true;
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) {
      const renderer = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '');
      if (/SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(renderer)) {
        return true;
      }
    }
  } catch {
    // ignore probe errors
  }
  return false;
}

export function disposeObject3D(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        materials.add(m);
        const std = m as THREE.MeshStandardMaterial;
        if (std.map) textures.add(std.map);
        if (std.roughnessMap) textures.add(std.roughnessMap);
        if (std.normalMap) textures.add(std.normalMap);
      }
    }
  });

  geometries.forEach((g) => g.dispose());
  textures.forEach((t) => t.dispose());
  materials.forEach((m) => m.dispose());
}

function createFloorTileTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  // One complete 100x100cm white porcelain tile per texture repeat.
  ctx.fillStyle = '#fcfcfa';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = 'rgba(223,226,228,0.14)';
  for (let i = 0; i < 64; i++) {
    const x = (i * 73) % 253 + 1;
    const y = (i * 137) % 253 + 1;
    ctx.fillRect(x, y, 1, 1);
  }
  // 2px grout (approximately 8mm per metre on this preview map).
  ctx.strokeStyle = '#d7d9d9';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(1, 1);
  tex.anisotropy = 8;
  return tex;
}

function addOutlineHighlight(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  cx: number,
  cy: number,
  cz: number,
  color = 0x4f46e5
) {
  const boxGeo = new THREE.BoxGeometry(w + 0.012, h + 0.012, d + 0.012);
  const edges = new THREE.EdgesGeometry(boxGeo);
  boxGeo.dispose();
  const mat = new THREE.LineBasicMaterial({ color });
  const seg = new THREE.LineSegments(edges, mat);
  seg.position.set(cx, cy, cz);
  parent.add(seg);
}

function buildHandleMesh(
  style: 'simple' | 'knob' | 'hidden',
  orient: 'vertical' | 'horizontal',
  lengthCm: number,
  w: number,
  h: number,
  thick: number,
  normalSign: number,
  matDarkChrome: THREE.Material,
  matHiddenTrim: THREE.Material
): THREE.Object3D {
  const grp = new THREE.Group();
  const frontOutZ = normalSign * (thick * 0.5 + 0.008);

  if (style === 'knob') {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.014, 12), matDarkChrome);
    stem.rotation.x = Math.PI / 2;
    stem.position.set(0, 0, frontOutZ);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.014, 14, 10), matDarkChrome);
    cap.position.set(0, 0, normalSign * (thick * 0.5 + 0.018));
    grp.add(stem, cap);
    return grp;
  }

  if (style === 'hidden') {
    const stripW = orient === 'horizontal' ? Math.max(0.06, w - 0.01) : 0.018;
    const stripH = orient === 'vertical' ? Math.max(0.08, h - 0.01) : 0.018;
    const strip = new THREE.Mesh(new THREE.BoxGeometry(stripW, stripH, 0.008), matHiddenTrim);
    strip.position.set(0, 0, normalSign * (thick * 0.5 + 0.003));
    grp.add(strip);
    return grp;
  }

  const lenM = Math.max(0.09, Math.min(orient === 'vertical' ? h - 0.04 : w - 0.04, lengthCm * CM));
  const barGeo =
    orient === 'vertical'
      ? new THREE.BoxGeometry(0.01, lenM, 0.012)
      : new THREE.BoxGeometry(lenM, 0.01, 0.012);
  const bar = new THREE.Mesh(barGeo, matDarkChrome);
  bar.position.set(0, 0, normalSign * (thick * 0.5 + 0.02));
  grp.add(bar);

  const postGeo = new THREE.BoxGeometry(0.008, 0.008, 0.016);
  const offset = lenM * 0.36;
  const p1 = new THREE.Mesh(postGeo, matDarkChrome);
  const p2 = new THREE.Mesh(postGeo, matDarkChrome);
  if (orient === 'vertical') {
    p1.position.set(0, offset, normalSign * (thick * 0.5 + 0.008));
    p2.position.set(0, -offset, normalSign * (thick * 0.5 + 0.008));
  } else {
    p1.position.set(offset, 0, normalSign * (thick * 0.5 + 0.008));
    p2.position.set(-offset, 0, normalSign * (thick * 0.5 + 0.008));
  }
  grp.add(p1, p2);
  return grp;
}

export function buildKitchen3DScene(
  project: ProjectState,
  opts: { doorOpenProgress?: number; hideFloor?: boolean } = {}
): BuiltKitchenScene {
  const root = new THREE.Group();
  const interactables: THREE.Object3D[] = [];
  const animatedDoors: AnimatedDoorHandle[] = [];
  const wallTransforms = new Map<
    string,
    {
      origin: THREE.Vector3;
      tangent: THREE.Vector3;
      normal: THREE.Vector3;
      rightVec: THREE.Vector3;
      normalSign: 1 | -1;
      lengthCm: number;
      heightCm: number;
    }
  >();

  const doorsHidden = Boolean(project.doorsHidden);
  const doorOpenProgress = Math.max(0, Math.min(1, opts.doorOpenProgress ?? 0));

  // Shared procedural material pack (finishes, gradient+bevel normal doors, tiles, countertops)
  const matPack = createKitchenMaterialPack(project);
  const floorTex = createFloorTileTexture();
  const matFloor = new THREE.MeshPhysicalMaterial({
    map: floorTex,
    roughness: 0.26,
    metalness: 0.02,
    clearcoat: 0.56,
    clearcoatRoughness: 0.18,
    envMapIntensity: 1.4,
  });
  const matWall = new THREE.MeshStandardMaterial({
    color: 0xf4f1ec,
    roughness: 0.9,
    metalness: 0.02,
  });
  const matWallActive = new THREE.MeshStandardMaterial({
    color: 0xe6eefc,
    roughness: 0.85,
    metalness: 0.03,
  });
  const matActiveWallAccent = new THREE.MeshStandardMaterial({
    color: 0x4f46e5,
    roughness: 0.35,
    metalness: 0.15,
  });
  const matCarcass = matPack.matCarcass;
  const matPlinth = matPack.matPlinth;
  const matCountertop = matPack.matCountertop;
  const matDoorRevealDark = matPack.matDoorRevealDark;
  const defaultCabFinish: CabinetFinishId = project.cabinetFinish || 'warm-white';
  const matDoorModern = matPack.getDoorMaterial(defaultCabFinish, 'flat', doorOpenProgress < 0.08, false);
  const matGlass = new THREE.MeshPhysicalMaterial({
    color: 0xcbd5e1,
    transparent: true,
    opacity: 0.38,
    roughness: 0.1,
    metalness: 0.08,
    transmission: 0.45,
  });
  const matWindowGlass = new THREE.MeshPhysicalMaterial({
    color: 0xbae6fd,
    transparent: true,
    opacity: 0.48,
    roughness: 0.08,
    metalness: 0.05,
  });
  const matFrame = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.45,
    metalness: 0.12,
  });
  const matDivider = new THREE.MeshStandardMaterial({
    color: 0xd8b4fe,
    roughness: 0.58,
    metalness: 0.05,
  });
  const matShelf = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    roughness: 0.55,
    metalness: 0.04,
  });
  const matSteel = new THREE.MeshStandardMaterial({
    color: 0xd1d5db,
    roughness: 0.25,
    metalness: 0.85,
  });
  const matDarkChrome = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.26,
    metalness: 0.82,
  });
  const matHiddenTrim = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.3,
    metalness: 0.72,
  });
  const matGlassCooktop = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.14,
    metalness: 0.22,
  });
  const matHandleGizmo = new THREE.MeshStandardMaterial({
    color: 0x4f46e5,
    roughness: 0.3,
    metalness: 0.2,
  });

  // Compute scene bounding box across walls
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const w of project.walls) {
    minX = Math.min(minX, w.x1Cm * CM, w.x2Cm * CM);
    maxX = Math.max(maxX, w.x1Cm * CM, w.x2Cm * CM);
    minZ = Math.min(minZ, w.y1Cm * CM, w.y2Cm * CM);
    maxZ = Math.max(maxZ, w.y1Cm * CM, w.y2Cm * CM);
  }
  if (!Number.isFinite(minX)) {
    minX = -2;
    maxX = 2;
    minZ = -2;
    maxZ = 2;
  }
  const bounds = new THREE.Box3();
  if (!opts.hideFloor) {
    const vertices = deriveFloorPolygon(project.walls);
    if (vertices.length >= 3) {
      // THREE.Shape is in XY; -Z in shape space becomes +Z after rotating onto the floor.
      const outline = new THREE.Shape();
      outline.moveTo(vertices[0].x * CM, -vertices[0].y * CM);
      for (let i = 1; i < vertices.length; i++) {
        outline.lineTo(vertices[i].x * CM, -vertices[i].y * CM);
      }
      outline.closePath();
      const geo = new THREE.ShapeGeometry(outline);
      geo.rotateX(-Math.PI / 2);
      // World-aligned 1m UVs: the tile grid does not stretch with room dimensions.
      const pos = geo.getAttribute('position');
      const uv = geo.getAttribute('uv');
      for (let i = 0; i < pos.count; i++) {
        uv.setXY(i, pos.getX(i), pos.getZ(i));
      }
      uv.needsUpdate = true;
      const floorMesh = new THREE.Mesh(geo, matFloor);
      floorMesh.position.y = -0.012;
      floorMesh.receiveShadow = true;
      floorMesh.userData = { kind: 'floor' };
      root.add(floorMesh);
      bounds.expandByObject(floorMesh);
    }
  }

  for (const wall of project.walls) {
    const v = getWallVectors(wall);
    const tangent = new THREE.Vector3(v.tx, 0, v.ty).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    // Right-handed vector orthogonal to (tangent, up)
    const rightVec = new THREE.Vector3().crossVectors(tangent, up).normalize();
    const normal = new THREE.Vector3(v.nx, 0, v.ny).normalize();
    const normalSign: 1 | -1 = rightVec.dot(normal) >= 0 ? 1 : -1;

    const wallGrp = new THREE.Group();
    const origin = new THREE.Vector3(wall.x1Cm * CM, 0, wall.y1Cm * CM);
    const basis = new THREE.Matrix4().makeBasis(tangent, up, rightVec);
    wallGrp.position.copy(origin);
    wallGrp.quaternion.setFromRotationMatrix(basis);

    wallTransforms.set(wall.id, {
      origin,
      tangent,
      normal,
      rightVec,
      normalSign,
      lengthCm: wall.length,
      heightCm: wall.height,
    });

    const wallLenM = wall.length * CM;
    const wallHM = wall.height * CM;
    const wallThick = 0.14;
    const isWallActive = wall.id === project.activeWallId;

    // Extrude wall face with rectangular cutouts for windows & room doors!
    const wallShape = new THREE.Shape();
    wallShape.moveTo(0, 0);
    wallShape.lineTo(wallLenM, 0);
    wallShape.lineTo(wallLenM, wallHM);
    wallShape.lineTo(0, wallHM);
    wallShape.closePath();

    for (const op of wall.openings || []) {
      if (op.kind === 'column') continue;
      const ox1 = Math.max(0.01, op.offsetX * CM);
      const ox2 = Math.min(wallLenM - 0.01, (op.offsetX + op.width) * CM);
      const oy1 = Math.max(0.01, op.elevY * CM);
      const oy2 = Math.min(wallHM - 0.01, (op.elevY + op.height) * CM);
      if (ox2 - ox1 > 0.05 && oy2 - oy1 > 0.05) {
        const hole = new THREE.Path();
        hole.moveTo(ox1, oy1);
        hole.lineTo(ox2, oy1);
        hole.lineTo(ox2, oy2);
        hole.lineTo(ox1, oy2);
        hole.closePath();
        wallShape.holes.push(hole);
      }
    }

    const wallGeo = new THREE.ExtrudeGeometry(wallShape, {
      depth: wallThick,
      bevelEnabled: false,
    });
    // Position extrusion strictly behind z=0 relative to normalSign!
    wallGeo.translate(0, 0, normalSign > 0 ? -wallThick : 0);
    const wallMesh = new THREE.Mesh(wallGeo, isWallActive ? matWallActive : matWall);
    wallMesh.receiveShadow = true;
    wallMesh.castShadow = true;
    wallMesh.userData = { kind: 'wall', wallId: wall.id } as Scene3DHitData;
    wallGrp.add(wallMesh);
    interactables.push(wallMesh);

    if (isWallActive && project.walls.length > 1) {
      const topAccent = new THREE.Mesh(
        new THREE.BoxGeometry(wallLenM, 0.028, wallThick + 0.012),
        matActiveWallAccent
      );
      topAccent.position.set(
        wallLenM / 2,
        wallHM + 0.014,
        normalSign > 0 ? -wallThick / 2 : wallThick / 2
      );
      topAccent.userData = { kind: 'wall', wallId: wall.id } as Scene3DHitData;
      wallGrp.add(topAccent);
      interactables.push(topAccent);
    }

    // Openings (Window glass & frames, Room Doors, Structural Columns)
    for (const op of wall.openings || []) {
      const opGrp = buildOpening3D(
        wall,
        op,
        normalSign,
        op.id === project.selectedOpeningId,
        matFrame,
        matWindowGlass,
        matCarcass,
        matDarkChrome,
        matWall
      );
      const opHitData = { kind: 'opening', wallId: wall.id, openingId: op.id } as Scene3DHitData;
      opGrp.userData = opHitData;
      opGrp.traverse((ch) => {
        if ((ch as THREE.Mesh).isMesh) {
          ch.userData = opHitData;
          interactables.push(ch);
        }
      });
      wallGrp.add(opGrp);
    }

    // Backsplash tile zones above base countertops (between base top and wall cabinets / hood)
    const bsSpans = computeWallBacksplashSpans(wall);
    for (const sp of bsSpans) {
      const spanW = (sp.endCm - sp.startCm) * CM;
      const spanH = (sp.topY - sp.botY) * CM;
      if (spanW < 0.04 || spanH < 0.06) continue;
      const bsMat = matPack.createBacksplashSpanMaterial(sp.endCm - sp.startCm, sp.topY - sp.botY);
      const bsMesh = new THREE.Mesh(new THREE.BoxGeometry(spanW, spanH, 0.015), bsMat);
      bsMesh.position.set(
        (sp.startCm + (sp.endCm - sp.startCm) / 2) * CM,
        (sp.botY + (sp.topY - sp.botY) / 2) * CM,
        normalSign * 0.008
      );
      bsMesh.receiveShadow = true;
      bsMesh.userData = { kind: 'backsplash', wallId: wall.id } as Scene3DHitData;
      wallGrp.add(bsMesh);
      interactables.push(bsMesh);
    }

    const blockedZones = getCornerBlockedZonesForWall(wall, project.walls, project.cornerOwners);

    // Render all Cabinet Boxes on this wall
    for (const box of wall.boxes) {
      const isBoxSel =
        box.id === project.activeBoxId ||
        Boolean(project.multiSelection?.boxIds.includes(box.id));

      const boxGrp = buildBox3D({
        wall,
        box,
        normalSign,
        doorsHidden,
        doorOpenProgress,
        isBoxSel,
        project,
        blockedZones,
        animatedDoors,
        interactables,
        matPack,
        mats: {
          matCarcass,
          matPlinth,
          matCountertop,
          matDoorRevealDark,
          matDoorModern,
          matGlass,
          matFrame,
          matDivider,
          matShelf,
          matSteel,
          matDarkChrome,
          matHiddenTrim,
          matHandleGizmo,
        },
      });
      wallGrp.add(boxGrp);
    }

    // Continuous counter / top slab segments? Each base box carries its countertop mesh flush to neighbors,
    // now render all Appliances (Sink + Faucet, Gas + Hood, Dishwasher, Washing Machine)
    for (const app of wall.appliances) {
      const appGrp = buildAppliance3D(
        wall,
        app,
        normalSign,
        app.id === project.selectedApplianceId,
        matsForApps({
          matSteel,
          matDarkChrome,
          matGlassCooktop,
          matCarcass,
          matDoorModern,
          matGlass,
        })
      );
      const appHitData = { kind: 'appliance', wallId: wall.id, appId: app.id } as Scene3DHitData;
      appGrp.userData = appHitData;
      appGrp.traverse((ch) => {
        if ((ch as THREE.Mesh).isMesh) {
          ch.userData = appHitData;
          interactables.push(ch);
        }
      });
      wallGrp.add(appGrp);
    }

    root.add(wallGrp);
    bounds.expandByObject(wallGrp);
  }

  // Solid architectural infill for upper cabinet corners (wall & wall-deep) so L/U upper corners are never hollow
  const cornerInfills = buildUpperCornerInfills3D(project, matPack, doorOpenProgress);
  if (cornerInfills.children.length > 0) {
    root.add(cornerInfills);
    bounds.expandByObject(cornerInfills);
  }

  return { root, interactables, animatedDoors, wallTransforms, bounds };
}

function buildUpperCornerInfills3D(
  project: ProjectState,
  matPack: KitchenMaterialPack,
  doorOpenProgress: number
): THREE.Group {
  const grp = new THREE.Group();
  grp.name = 'upper-corner-infills';
  const junctions = detectCornerJunctions(project.walls, project.cornerOwners);
  const tiers: Array<'wall' | 'wall-deep'> = ['wall', 'wall-deep'];
  const defaultFinish: CabinetFinishId = project.cabinetFinish || 'warm-white';

  for (const j of junctions) {
    const wA = project.walls.find((w) => w.id === j.wallAId);
    const wB = project.walls.find((w) => w.id === j.wallBId);
    if (!wA || !wB) continue;

    const geom = analyzeCornerJunction(wA, j.wallAEnd, wB, j.wallBEnd);
    const vA = getWallVectors(wA);
    const vB = getWallVectors(wB);
    const cornerPos =
      j.wallAEnd === 'start'
        ? { x: wA.x1Cm, y: wA.y1Cm }
        : { x: wA.x2Cm, y: wA.y2Cm };
    const dirA = j.wallAEnd === 'start' ? { x: vA.tx, y: vA.ty } : { x: -vA.tx, y: -vA.ty };
    const dirB = j.wallBEnd === 'start' ? { x: vB.tx, y: vB.ty } : { x: -vB.tx, y: -vB.ty };

    for (const tier of tiers) {
      const boxesA = wA.boxes.filter((b) => b.type === tier && !b.linkedToBoxId);
      const boxesB = wB.boxes.filter((b) => b.type === tier && !b.linkedToBoxId);
      if (!boxesA.length || !boxesB.length) continue;

      const distToCorner = (w: Wall, end: 'start' | 'end', b: CabinetBox) =>
        end === 'start' ? b.offsetX : Math.max(0, w.length - (b.offsetX + b.width));

      const nearA = boxesA
        .map((b) => ({ b, dist: distToCorner(wA, j.wallAEnd, b) }))
        .sort((x, y) => x.dist - y.dist)[0];
      const nearB = boxesB
        .map((b) => ({ b, dist: distToCorner(wB, j.wallBEnd, b) }))
        .sort((x, y) => x.dist - y.dist)[0];

      const defaultDepth = tier === 'wall-deep' ? 58 : 32;
      if (!nearA || !nearB) continue;
      if (nearA.dist > defaultDepth + 45 || nearB.dist > defaultDepth + 45) continue;

      const depthA = nearA.b.depth || defaultDepth;
      const depthB = nearB.b.depth || defaultDepth;
      const elevCm = Math.max(nearA.b.elevY, nearB.b.elevY);
      const topCm = Math.min(nearA.b.elevY + nearA.b.height, nearB.b.elevY + nearB.b.height);
      const hCm = topCm - elevCm;
      if (hCm < 15) continue;

      const finish = nearA.b.finish || nearB.b.finish || defaultFinish;
      const bodyMat = matPack.getCabinetBodyMaterial(finish);
      const doorMat = matPack.getDoorMaterial(finish, 'flat', doorOpenProgress < 0.08, false);

      if (geom.kind === 'inside-90' || geom.kind === 'inside-angled') {
        // Reach the actual upper-cabinet start on each wall. The old depth+12 cap
        // stopped the corner infill short and left a visible hollow wedge.
        const coverA = Math.max(depthB, Math.max(nearA.dist, 0) + 1);
        const coverB = Math.max(depthA, Math.max(nearB.dist, 0) + 1);
        if (coverA <= 1 || coverB <= 1) continue;

        // Build solid prism covering the inside corner intersection between both upper cabinet runs
        const p0 = { x: cornerPos.x * CM, z: cornerPos.y * CM };
        const pA = {
          x: (cornerPos.x + dirA.x * coverA) * CM,
          z: (cornerPos.y + dirA.y * coverA) * CM,
        };
        const pB = {
          x: (cornerPos.x + dirB.x * coverB) * CM,
          z: (cornerPos.y + dirB.y * coverB) * CM,
        };
        const pInner = {
          x: (cornerPos.x + dirA.x * coverA + dirB.x * coverB) * CM,
          z: (cornerPos.y + dirA.y * coverA + dirB.y * coverB) * CM,
        };

        const shape = new THREE.Shape();
        shape.moveTo(p0.x, -p0.z);
        shape.lineTo(pA.x, -pA.z);
        shape.lineTo(pInner.x, -pInner.z);
        shape.lineTo(pB.x, -pB.z);
        shape.closePath();

        const geo = new THREE.ExtrudeGeometry(shape, {
          depth: (hCm - 0.3) * CM,
          bevelEnabled: false,
        });
        geo.rotateX(-Math.PI / 2);
        const infill = new THREE.Mesh(geo, bodyMat);
        infill.position.y = (elevCm + 0.15) * CM;
        infill.castShadow = true;
        infill.receiveShadow = true;
        grp.add(infill);

        // Add subtle corner fascia trim plates on exposed inner faces if either box stopped short
        if (nearA.dist > depthB + 1.5) {
          const trimLen = (nearA.dist - depthB) * CM;
          if (trimLen > 0.02) {
            const pTrimStart = {
              x: (cornerPos.x + dirA.x * depthB + dirB.x * depthA) * CM,
              z: (cornerPos.y + dirA.y * depthB + dirB.y * depthA) * CM,
            };
            const trimMesh = new THREE.Mesh(
              new THREE.BoxGeometry(trimLen, hCm * CM, 0.018),
              doorMat
            );
            const angle = Math.atan2(-(dirA.y), dirA.x);
            trimMesh.rotation.y = angle;
            trimMesh.position.set(
              pTrimStart.x + dirA.x * (trimLen / 2),
              (elevCm + hCm / 2) * CM,
              pTrimStart.z + dirA.y * (trimLen / 2)
            );
            grp.add(trimMesh);
          }
        }
        if (nearB.dist > depthA + 1.5) {
          const trimLen = (nearB.dist - depthA) * CM;
          if (trimLen > 0.02) {
            const pTrimStart = {
              x: (cornerPos.x + dirB.x * depthA + dirA.x * depthB) * CM,
              z: (cornerPos.y + dirB.y * depthA + dirA.y * depthB) * CM,
            };
            const trimMesh = new THREE.Mesh(
              new THREE.BoxGeometry(trimLen, hCm * CM, 0.018),
              doorMat
            );
            const angle = Math.atan2(-(dirB.y), dirB.x);
            trimMesh.rotation.y = angle;
            trimMesh.position.set(
              pTrimStart.x + dirB.x * (trimLen / 2),
              (elevCm + hCm / 2) * CM,
              pTrimStart.z + dirB.y * (trimLen / 2)
            );
            grp.add(trimMesh);
          }
        }
      } else if (geom.kind === 'outside' && nearA.dist <= 6 && nearB.dist <= 6) {
        // Fill outer corner wedge between upper cabinets meeting at an exterior bend
        const cX = cornerPos.x * CM;
        const cZ = cornerPos.y * CM;
        const outA = { x: (cornerPos.x + vA.nx * depthA) * CM, z: (cornerPos.y + vA.ny * depthA) * CM };
        const outB = { x: (cornerPos.x + vB.nx * depthB) * CM, z: (cornerPos.y + vB.ny * depthB) * CM };
        const shape = new THREE.Shape();
        shape.moveTo(cX, -cZ);
        shape.lineTo(outA.x, -outA.z);
        shape.lineTo(outB.x, -outB.z);
        shape.closePath();
        const geo = new THREE.ExtrudeGeometry(shape, {
          depth: hCm * CM,
          bevelEnabled: false,
        });
        geo.rotateX(-Math.PI / 2);
        const wedge = new THREE.Mesh(geo, doorMat);
        wedge.position.y = elevCm * CM;
        wedge.castShadow = true;
        wedge.receiveShadow = true;
        grp.add(wedge);
      }
    }
  }

  return grp;
}

function matsForApps<T>(x: T): T {
  return x;
}

function buildOpening3D(
  wall: Wall,
  op: WallOpening,
  normalSign: number,
  isSelected: boolean,
  matFrame: THREE.Material,
  matWindowGlass: THREE.Material,
  matDoorLeaf: THREE.Material,
  matKnob: THREE.Material,
  matWall: THREE.Material
): THREE.Group {
  const grp = new THREE.Group();
  const ow = op.width * CM;
  const oh = op.height * CM;
  const ox = (op.offsetX + op.width / 2) * CM;
  const oy = (op.elevY + op.height / 2) * CM;

  if (op.kind === 'column') {
    const colD = 0.55;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(ow, oh, colD), matWall);
    mesh.position.set(ox, oy, normalSign * (colD / 2));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    grp.add(mesh);
    if (isSelected) addOutlineHighlight(grp, ow, oh, colD, ox, oy, normalSign * (colD / 2));
    return grp;
  }

  const wallDepth = 0.14;
  const zCenter = -normalSign * (wallDepth * 0.5);

  if (op.kind === 'window') {
    const fw = 0.045;
    const topBar = new THREE.Mesh(new THREE.BoxGeometry(ow, fw, wallDepth + 0.01), matFrame);
    topBar.position.set(ox, oy + oh / 2 - fw / 2, zCenter);
    const botBar = new THREE.Mesh(new THREE.BoxGeometry(ow + 0.03, fw, wallDepth + 0.04), matFrame);
    botBar.position.set(ox, oy - oh / 2 + fw / 2, zCenter);
    const leftBar = new THREE.Mesh(new THREE.BoxGeometry(fw, oh, wallDepth + 0.01), matFrame);
    leftBar.position.set(ox - ow / 2 + fw / 2, oy, zCenter);
    const rightBar = new THREE.Mesh(new THREE.BoxGeometry(fw, oh, wallDepth + 0.01), matFrame);
    rightBar.position.set(ox + ow / 2 - fw / 2, oy, zCenter);
    const midMullion = new THREE.Mesh(new THREE.BoxGeometry(0.03, oh - fw * 2, 0.04), matFrame);
    midMullion.position.set(ox, oy, zCenter);
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(0.1, ow - fw * 2), Math.max(0.1, oh - fw * 2), 0.014),
      matWindowGlass
    );
    glass.position.set(ox, oy, zCenter);
    grp.add(topBar, botBar, leftBar, rightBar, midMullion, glass);
    if (isSelected) addOutlineHighlight(grp, ow, oh, wallDepth, ox, oy, zCenter);
    return grp;
  }

  // Room door
  const fw = 0.05;
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(ow, fw, wallDepth + 0.02), matFrame);
  topBar.position.set(ox, oy + oh / 2 - fw / 2, zCenter);
  const leftBar = new THREE.Mesh(new THREE.BoxGeometry(fw, oh, wallDepth + 0.02), matFrame);
  leftBar.position.set(ox - ow / 2 + fw / 2, oy, zCenter);
  const rightBar = new THREE.Mesh(new THREE.BoxGeometry(fw, oh, wallDepth + 0.02), matFrame);
  rightBar.position.set(ox + ow / 2 - fw / 2, oy, zCenter);
  const leaf = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(0.2, ow - fw * 2), Math.max(0.2, oh - fw), 0.04),
    matDoorLeaf
  );
  leaf.position.set(ox, oy - fw / 2, zCenter);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.015, 0.07), matKnob);
  const handleX = op.swingDir?.startsWith('left') ? ox + ow / 2 - 0.14 : ox - ow / 2 + 0.14;
  handle.position.set(handleX, 1.0, zCenter);
  grp.add(topBar, leftBar, rightBar, leaf, handle);
  if (isSelected) addOutlineHighlight(grp, ow, oh, wallDepth, ox, oy, zCenter);
  return grp;
}

function buildBox3D(ctx: {
  wall: Wall;
  box: CabinetBox;
  normalSign: number;
  doorsHidden: boolean;
  doorOpenProgress: number;
  isBoxSel: boolean;
  project: ProjectState;
  blockedZones: ReturnType<typeof getCornerBlockedZonesForWall>;
  animatedDoors: AnimatedDoorHandle[];
  interactables: THREE.Object3D[];
  matPack: KitchenMaterialPack;
  mats: {
    matCarcass: THREE.Material;
    matPlinth: THREE.Material;
    matCountertop: THREE.Material;
    matDoorRevealDark: THREE.Material;
    matDoorModern: THREE.Material;
    matGlass: THREE.Material;
    matFrame: THREE.Material;
    matDivider: THREE.Material;
    matShelf: THREE.Material;
    matSteel: THREE.Material;
    matDarkChrome: THREE.Material;
    matHiddenTrim: THREE.Material;
    matHandleGizmo: THREE.Material;
  };
}): THREE.Group {
  const { wall, box, normalSign, doorsHidden, doorOpenProgress, isBoxSel, project, blockedZones, animatedDoors, interactables, matPack, mats } = ctx;
  const grp = new THREE.Group();
  grp.userData = { kind: 'box', wallId: wall.id, boxId: box.id } as Scene3DHitData;

  const boxFinish: CabinetFinishId = box.finish || project.cabinetFinish || 'warm-white';
  const boxBodyMat = matPack.getCabinetBodyMaterial(boxFinish);

  const bx = box.offsetX * CM;
  const bw = box.width * CM;
  const bh = box.height * CM;
  const by = box.elevY * CM;
  const bd = box.depth * CM;
  const plinthM = box.plinth * CM;
  const topPadM = box.countertopCm * CM;
  const bodyH = Math.max(0.14, bh - plinthM - topPadM);
  const bodyBottomY = by + plinthM;
  const board = 0.016; // 1.6cm sheet

  // 1. Plinth (recessed 4cm, cut around floor appliances!)
  if (plinthM > 0.005) {
    let spans: Array<{ s: number; e: number }> = [{ s: box.offsetX, e: box.offsetX + box.width }];
    if (box.type === 'base') {
      const floorApps = wall.appliances.filter(
        (a) =>
          (a.kind === 'dishwasher' || a.kind === 'washing') &&
          a.offsetX < box.offsetX + box.width - 1 &&
          a.offsetX + a.width > box.offsetX + 1
      );
      for (const fa of floorApps) {
        const next: Array<{ s: number; e: number }> = [];
        for (const sp of spans) {
          if (fa.offsetX + fa.width <= sp.s + 0.5 || fa.offsetX >= sp.e - 0.5) next.push(sp);
          else {
            if (fa.offsetX - sp.s > 1) next.push({ s: sp.s, e: fa.offsetX });
            if (sp.e - (fa.offsetX + fa.width) > 1) next.push({ s: fa.offsetX + fa.width, e: sp.e });
          }
        }
        spans = next;
      }
    }
    const plinthD = Math.max(0.1, bd - 0.04);
    for (const sp of spans) {
      const pw = (sp.e - sp.s) * CM;
      const pm = new THREE.Mesh(new THREE.BoxGeometry(pw, plinthM, plinthD), mats.matPlinth);
      pm.position.set((sp.s + (sp.e - sp.s) / 2) * CM, by + plinthM / 2, normalSign * (plinthD / 2));
      pm.userData = { kind: 'box', wallId: wall.id, boxId: box.id } as Scene3DHitData;
      grp.add(pm);
      interactables.push(pm);
    }
  }

  // 2. Realistic Refrigerator enclosure & multi-leaf stainless doors
  if (box.type === 'fridge') {
    const model = box.fridgeModel || 'side-by-side';
    const cfg = FRIDGE_MODELS[model];
    const hasFridgeFrame = box.hasFridgeFrame || doesFridgeTouchCabinet(wall, box);
    const ff = hasFridgeFrame ? FRIDGE_FRAME_CM * CM : 0;

    if (ff > 0) {
      const fLeft = new THREE.Mesh(new THREE.BoxGeometry(ff, bh, bd), boxBodyMat);
      fLeft.position.set(bx + ff / 2, by + bh / 2, normalSign * (bd / 2));
      const fRight = new THREE.Mesh(new THREE.BoxGeometry(ff, bh, bd), boxBodyMat);
      fRight.position.set(bx + bw - ff / 2, by + bh / 2, normalSign * (bd / 2));
      const fTop = new THREE.Mesh(new THREE.BoxGeometry(bw, ff, bd), boxBodyMat);
      fTop.position.set(bx + bw / 2, by + bh - ff / 2, normalSign * (bd / 2));
      fLeft.userData = fRight.userData = fTop.userData = { kind: 'box', wallId: wall.id, boxId: box.id } as Scene3DHitData;
      grp.add(fLeft, fRight, fTop);
      interactables.push(fLeft, fRight, fTop);
    }

    const fW = Math.max(0.4, bw - ff * 2 - 0.016);
    const fH = Math.max(1.2, cfg.height * CM);
    const fD = bd - 0.045;
    const doorThick = 0.036;
    const cx = bx + bw / 2;
    const frontDoorZ = normalSign * (fD + doorThick / 2);

    const matBrushedInox = new THREE.MeshStandardMaterial({
      color: 0xd8dee6,
      roughness: 0.24,
      metalness: 0.78,
    });
    const matShellDark = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.45,
      metalness: 0.35,
    });
    const matLedBlue = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.65,
      roughness: 0.2,
    });

    // Main insulated cabinet chassis behind door leaves
    const fBody = new THREE.Mesh(new THREE.BoxGeometry(fW, fH - 0.02, fD), matShellDark);
    fBody.position.set(cx, by + (fH - 0.02) / 2, normalSign * (fD / 2));
    fBody.castShadow = true;
    fBody.receiveShadow = true;
    fBody.userData = { kind: 'box', wallId: wall.id, boxId: box.id } as Scene3DHitData;
    grp.add(fBody);
    interactables.push(fBody);

    // Bottom slotted ventilation kick-grille
    const ventH = 0.075;
    const ventBase = new THREE.Mesh(new THREE.BoxGeometry(fW - 0.02, ventH, doorThick * 0.75), mats.matDarkChrome);
    ventBase.position.set(cx, by + ventH / 2 + 0.008, normalSign * (fD + doorThick * 0.3));
    grp.add(ventBase);
    for (let sIdx = -2; sIdx <= 2; sIdx++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(fW - 0.08, 0.006, 0.008), mats.matSteel);
      slat.position.set(cx, by + ventH * 0.5 + sIdx * 0.011, normalSign * (fD + doorThick * 0.7));
      grp.add(slat);
    }

    const addFridgeHandle = (hx: number, hy: number, hLen: number) => {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, hLen, 12), mats.matSteel);
      bar.position.set(hx, hy, normalSign * (fD + doorThick + 0.026));
      bar.castShadow = true;
      const post1 = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.016, 0.028), mats.matDarkChrome);
      post1.position.set(hx, hy + hLen * 0.38, normalSign * (fD + doorThick + 0.012));
      const post2 = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.016, 0.028), mats.matDarkChrome);
      post2.position.set(hx, hy - hLen * 0.38, normalSign * (fD + doorThick + 0.012));
      grp.add(bar, post1, post2);
    };

    const addDispenserAlcove = (dx: number, dy: number, dw: number, dh: number) => {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(dw, dh, 0.014), mats.matDarkChrome);
      frame.position.set(dx, dy, normalSign * (fD + doorThick + 0.002));
      const led = new THREE.Mesh(new THREE.BoxGeometry(dw * 0.58, 0.016, 0.006), matLedBlue);
      led.position.set(dx, dy + dh * 0.34, normalSign * (fD + doorThick + 0.01));
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.006, 0.028, 10), mats.matSteel);
      spout.position.set(dx, dy + dh * 0.14, normalSign * (fD + doorThick + 0.014));
      const tray = new THREE.Mesh(new THREE.BoxGeometry(dw * 0.75, 0.012, 0.018), mats.matSteel);
      tray.position.set(dx, dy - dh * 0.38, normalSign * (fD + doorThick + 0.01));
      grp.add(frame, led, spout, tray);
    };

    const leavesTop = by + fH - 0.012;
    const leavesBot = by + ventH + 0.022;
    const leavesH = Math.max(0.9, leavesTop - leavesBot);
    const leavesMidY = leavesBot + leavesH / 2;

    if (model === 'single') {
      const freezerH = leavesH * 0.31;
      const upperH = leavesH - freezerH - 0.014;
      const upperY = leavesTop - upperH / 2;
      const freezerY = leavesBot + freezerH / 2;

      const dUpper = new THREE.Mesh(new THREE.BoxGeometry(fW - 0.012, upperH, doorThick), matBrushedInox);
      dUpper.position.set(cx, upperY, frontDoorZ);
      const dFreezer = new THREE.Mesh(new THREE.BoxGeometry(fW - 0.012, freezerH, doorThick), matBrushedInox);
      dFreezer.position.set(cx, freezerY, frontDoorZ);
      dUpper.castShadow = dFreezer.castShadow = true;
      dUpper.userData = dFreezer.userData = { kind: 'box', wallId: wall.id, boxId: box.id } as Scene3DHitData;
      grp.add(dUpper, dFreezer);
      interactables.push(dUpper, dFreezer);

      // Top hinge cap + stainless bar handles
      const hingeCap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.045), mats.matDarkChrome);
      hingeCap.position.set(cx - fW * 0.42, by + fH - 0.002, normalSign * (fD + 0.015));
      grp.add(hingeCap);
      addFridgeHandle(cx + fW * 0.38, upperY - upperH * 0.08, upperH * 0.56);
      addFridgeHandle(cx + fW * 0.38, freezerY, freezerH * 0.65);
    } else if (model === 'twin') {
      const leafW = (fW - 0.026) / 2;
      const leftX = cx - leafW / 2 - 0.008;
      const rightX = cx + leafW / 2 + 0.008;

      const dLeft = new THREE.Mesh(new THREE.BoxGeometry(leafW, leavesH, doorThick), matBrushedInox);
      dLeft.position.set(leftX, leavesMidY, frontDoorZ);
      const dRight = new THREE.Mesh(new THREE.BoxGeometry(leafW, leavesH, doorThick), matBrushedInox);
      dRight.position.set(rightX, leavesMidY, frontDoorZ);
      dLeft.castShadow = dRight.castShadow = true;
      dLeft.userData = dRight.userData = { kind: 'box', wallId: wall.id, boxId: box.id } as Scene3DHitData;
      grp.add(dLeft, dRight);
      interactables.push(dLeft, dRight);

      // Twin top hinge caps + center handles + dispenser alcove
      const capL = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.02, 0.045), mats.matDarkChrome);
      capL.position.set(cx - fW * 0.43, by + fH - 0.002, normalSign * (fD + 0.015));
      const capR = capL.clone();
      capR.position.x = cx + fW * 0.43;
      grp.add(capL, capR);

      addDispenserAlcove(leftX, leavesBot + leavesH * 0.58, Math.min(0.22, leafW * 0.55), 0.32);
      addFridgeHandle(cx - 0.045, leavesBot + leavesH * 0.52, leavesH * 0.58);
      addFridgeHandle(cx + 0.045, leavesBot + leavesH * 0.52, leavesH * 0.58);
    } else {
      // Side-by-Side (classic 42% narrow freezer left, 58% fresh food right)
      const gap = 0.012;
      const leftW = (fW - gap - 0.012) * 0.41;
      const rightW = (fW - gap - 0.012) * 0.59;
      const seamX = cx - fW / 2 + 0.006 + leftW + gap / 2;
      const leftX = seamX - gap / 2 - leftW / 2;
      const rightX = seamX + gap / 2 + rightW / 2;

      const dLeft = new THREE.Mesh(new THREE.BoxGeometry(leftW, leavesH, doorThick), matBrushedInox);
      dLeft.position.set(leftX, leavesMidY, frontDoorZ);
      const dRight = new THREE.Mesh(new THREE.BoxGeometry(rightW, leavesH, doorThick), matBrushedInox);
      dRight.position.set(rightX, leavesMidY, frontDoorZ);
      dLeft.castShadow = dRight.castShadow = true;
      dLeft.userData = dRight.userData = { kind: 'box', wallId: wall.id, boxId: box.id } as Scene3DHitData;
      grp.add(dLeft, dRight);
      interactables.push(dLeft, dRight);

      const capL = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.02, 0.045), mats.matDarkChrome);
      capL.position.set(cx - fW * 0.43, by + fH - 0.002, normalSign * (fD + 0.015));
      const capR = capL.clone();
      capR.position.x = cx + fW * 0.43;
      grp.add(capL, capR);

      addDispenserAlcove(leftX, leavesBot + leavesH * 0.58, Math.min(0.22, leftW * 0.62), 0.34);
      addFridgeHandle(seamX - 0.042, leavesBot + leavesH * 0.52, leavesH * 0.56);
      addFridgeHandle(seamX + 0.042, leavesBot + leavesH * 0.52, leavesH * 0.56);
    }

    if (isBoxSel) {
      addOutlineHighlight(grp, bw, bh, bd, bx + bw / 2, by + bh / 2, normalSign * (bd / 2));
      addBox3DHandles(grp, wall.id, box, bodyBottomY, bh, bd, normalSign, mats.matHandleGizmo, interactables);
    }
    return grp;
  }

  // 3. Carcass panels (left, right, top, bottom, back), carving open bays for exposed chimney hoods!
  const carcD = Math.max(0.12, bd - 0.02);
  const cz = normalSign * (carcD / 2);
  const bodyCenterY = bodyBottomY + bodyH / 2;

  const chimneyCutIntervals =
    (box.type === 'wall' || box.type === 'wall-deep') && !box.linkedToBoxId
      ? wall.appliances
          .filter(
            (a) =>
              a.kind === 'gas' &&
              a.hoodKind !== 'hidden' &&
              a.offsetX < box.offsetX + box.width - 5 &&
              a.offsetX + a.width > box.offsetX + 5
          )
          .map((a) => ({
            s: Math.max(0, a.offsetX - box.offsetX),
            e: Math.min(box.width, a.offsetX + a.width - box.offsetX),
          }))
          .filter((iv) => iv.e - iv.s >= 25)
          .sort((a, b) => a.s - b.s)
      : [];

  const solidHorizSpans: Array<{ s: number; e: number }> = [];
  if (chimneyCutIntervals.length > 0) {
    let cur = 0;
    for (const iv of chimneyCutIntervals) {
      if (iv.s - cur > 2) solidHorizSpans.push({ s: cur, e: iv.s });
      cur = Math.max(cur, iv.e);
    }
    if (box.width - cur > 2) solidHorizSpans.push({ s: cur, e: box.width });
  } else {
    solidHorizSpans.push({ s: 0, e: box.width });
  }

  const carcassMeshes: THREE.Mesh[] = [];
  if (solidHorizSpans.some((sp) => sp.s <= 2)) {
    const pLeft = new THREE.Mesh(new THREE.BoxGeometry(board, bodyH, carcD), boxBodyMat);
    pLeft.position.set(bx + board / 2, bodyCenterY, cz);
    carcassMeshes.push(pLeft);
  }
  if (solidHorizSpans.some((sp) => sp.e >= box.width - 2)) {
    const pRight = new THREE.Mesh(new THREE.BoxGeometry(board, bodyH, carcD), boxBodyMat);
    pRight.position.set(bx + bw - board / 2, bodyCenterY, cz);
    carcassMeshes.push(pRight);
  }

  for (const sp of solidHorizSpans) {
    const spanW = (sp.e - sp.s) * CM;
    if (spanW < 0.04) continue;
    const midX = bx + (sp.s + (sp.e - sp.s) / 2) * CM;
    const pBot = new THREE.Mesh(new THREE.BoxGeometry(spanW, board, carcD), mats.matCarcass);
    pBot.position.set(midX, bodyBottomY + board / 2, cz);
    const pTop = new THREE.Mesh(new THREE.BoxGeometry(spanW, board, carcD), mats.matCarcass);
    pTop.position.set(midX, bodyBottomY + bodyH - board / 2, cz);
    const pBack = new THREE.Mesh(new THREE.BoxGeometry(spanW, bodyH - board * 2, 0.01), mats.matCarcass);
    pBack.position.set(midX, bodyCenterY, normalSign * 0.006);
    carcassMeshes.push(pBot, pTop, pBack);
  }

  for (const pm of carcassMeshes) {
    pm.castShadow = true;
    pm.receiveShadow = true;
    pm.userData = { kind: 'box', wallId: wall.id, boxId: box.id } as Scene3DHitData;
    grp.add(pm);
    interactables.push(pm);
  }

  // 4. Countertop Stone Slab (tagged as 'countertop' so Finish brush can style it directly)
  if (topPadM > 0.005) {
    const slabD = bd + 0.02;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.004, topPadM, slabD), mats.matCountertop);
    slab.position.set(bx + bw / 2, bodyBottomY + bodyH + topPadM / 2, normalSign * (slabD / 2));
    slab.castShadow = true;
    slab.receiveShadow = true;
    slab.userData = { kind: 'countertop', wallId: wall.id, boxId: box.id } as Scene3DHitData;
    grp.add(slab);
    interactables.push(slab);
  }

  // Compute inner frame insets
  const rawIn = getBoxFrameInsets(box);
  const scaleX = Math.max(0.2, (box.width - rawIn.left - rawIn.right) / Math.max(1, box.width));
  const innerBottomY = bodyBottomY + rawIn.bottom * CM;
  const innerH = Math.max(0.08, bodyH - (rawIn.top + rawIn.bottom) * CM);
  const frontFaceZ = normalSign * (carcD + 0.01);

  // 5. Perimeter / Seam Frames
  for (const fr of box.frames || []) {
    const fM = fr.widthCm * CM;
    const isFSel = fr.id === project.selectedFrameId;
    const fMat = isFSel ? mats.matHandleGizmo : mats.matFrame;
    let mesh: THREE.Mesh | null = null;
    if (fr.side === 'left') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(fM, bodyH, 0.022), fMat);
      mesh.position.set(bx + fM / 2, bodyCenterY, frontFaceZ);
    } else if (fr.side === 'right') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(fM, bodyH, 0.022), fMat);
      mesh.position.set(bx + bw - fM / 2, bodyCenterY, frontFaceZ);
    } else if (fr.side === 'top') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, fM, 0.022), fMat);
      mesh.position.set(bx + bw / 2, bodyBottomY + bodyH - fM / 2, frontFaceZ);
    } else if (fr.side === 'bottom') {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(bw, fM, 0.022), fMat);
      mesh.position.set(bx + bw / 2, bodyBottomY + fM / 2, frontFaceZ);
    } else if (fr.side === 'seam' && fr.seamCm !== undefined) {
      const sx = bx + (rawIn.left + fr.seamCm * scaleX) * CM;
      mesh = new THREE.Mesh(new THREE.BoxGeometry(fM, innerH, 0.022), fMat);
      mesh.position.set(sx, innerBottomY + innerH / 2, frontFaceZ);
    }
    if (mesh) {
      mesh.userData = { kind: 'frame', wallId: wall.id, boxId: box.id, frameId: fr.id } as Scene3DHitData;
      grp.add(mesh);
      interactables.push(mesh);
    }
  }

  // 6. Unit Dividers (3.2cm)
  for (const uCm of box.unitDividers) {
    const ux = bx + (rawIn.left + uCm * scaleX) * CM;
    const isDivSel =
      project.selectedUnitDivider?.boxId === box.id &&
      Math.abs(project.selectedUnitDivider.seamCm - uCm) <= 1.2;
    const divMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.032, innerH, carcD - 0.02),
      isDivSel ? mats.matHandleGizmo : mats.matDivider
    );
    divMesh.position.set(ux, innerBottomY + innerH / 2, normalSign * ((carcD - 0.02) / 2 + 0.01));
    divMesh.userData = { kind: 'unit-div', wallId: wall.id, boxId: box.id, seamCm: uCm } as Scene3DHitData;
    grp.add(divMesh);
    interactables.push(divMesh);
  }

  // 7. Interior Shelves
  for (const sh of box.shelves) {
    const sx = bx + (rawIn.left + sh.startCm * scaleX) * CM;
    const sw = Math.max(0.06, (sh.endCm - sh.startCm) * scaleX * CM - 0.032);
    const sy = innerBottomY + innerH * (1 - sh.yRatio);
    const isShSel = sh.id === project.selectedShelfId;
    const shMesh = new THREE.Mesh(
      new THREE.BoxGeometry(sw, 0.018, carcD - 0.04),
      isShSel ? mats.matHandleGizmo : mats.matShelf
    );
    shMesh.position.set(sx + sw / 2 + 0.016, sy, normalSign * ((carcD - 0.04) / 2 + 0.01));
    shMesh.userData = { kind: 'shelf', wallId: wall.id, boxId: box.id, shelfId: sh.id } as Scene3DHitData;
    grp.add(shMesh);
    interactables.push(shMesh);
  }

  // 8. When Doors are Hidden -> Render selectable/interactive Unit Bay overlays
  if (doorsHidden) {
    const units = getUnitsInBox(box, blockedZones);
    for (const u of units) {
      if (u.blockedReason === 'یخچال طبقه داخلی ندارد') continue;
      const ux = bx + (rawIn.left + u.startCm * scaleX) * CM;
      const uw = Math.max(0.08, u.widthCm * scaleX * CM - 0.01);
      const isUSel =
        project.selectedUnit?.boxId === box.id &&
        Math.abs(project.selectedUnit.startCm - u.startCm) <= 1.8 &&
        Math.abs(project.selectedUnit.endCm - u.endCm) <= 1.8;

      const uMat = new THREE.MeshStandardMaterial({
        color: isUSel ? 0x7c3aed : 0x94a3b8,
        transparent: true,
        opacity: isUSel ? 0.34 : 0.14,
        roughness: 0.6,
      });
      const uBay = new THREE.Mesh(new THREE.BoxGeometry(uw, innerH - 0.02, carcD * 0.8), uMat);
      uBay.position.set(ux + uw / 2 + 0.005, innerBottomY + innerH / 2, normalSign * (carcD * 0.45));
      uBay.userData = {
        kind: 'unit',
        wallId: wall.id,
        boxId: box.id,
        unitStart: u.startCm,
        unitEnd: u.endCm,
      } as Scene3DHitData;
      grp.add(uBay);
      interactables.push(uBay);
    }
  } else {
    // 9. Doors + Handles (hidden when doorsHidden === true!)
    // When doors are closed, add a recessed dark shadow liner behind the door seams so each door leaf separates crisply
    if (doorOpenProgress < 0.08 && box.doors.length > 0) {
      for (const sp of solidHorizSpans) {
        const spanW = (sp.e - sp.s) * scaleX * CM - 0.004;
        if (spanW < 0.06) continue;
        const liner = new THREE.Mesh(
          new THREE.BoxGeometry(spanW, innerH - 0.004, 0.005),
          mats.matDoorRevealDark
        );
        liner.position.set(
          bx + (rawIn.left + sp.s * scaleX) * CM + spanW / 2 + 0.002,
          innerBottomY + innerH / 2,
          frontFaceZ - normalSign * 0.009
        );
        grp.add(liner);
      }
    }

    for (const door of box.doors) {
      buildDoor3D({
        wall,
        box,
        door,
        boxFinish,
        bx,
        bw,
        rawIn,
        scaleX,
        innerBottomY,
        innerH,
        frontFaceZ,
        carcD,
        normalSign,
        doorOpenProgress,
        project,
        animatedDoors,
        interactables,
        grp,
        matPack,
        mats,
      });
    }
  }

  // Selection wireframe + 3D move/resize handles
  if (isBoxSel) {
    addOutlineHighlight(grp, bw, bh, bd, bx + bw / 2, by + bh / 2, normalSign * (bd / 2));
    addBox3DHandles(grp, wall.id, box, by, bh, bd, normalSign, mats.matHandleGizmo, interactables);
  }

  return grp;
}

function addBox3DHandles(
  grp: THREE.Group,
  wallId: string,
  box: CabinetBox,
  by: number,
  bh: number,
  bd: number,
  normalSign: number,
  mat: THREE.Material,
  interactables: THREE.Object3D[]
) {
  const bx = box.offsetX * CM;
  const bw = box.width * CM;
  const frontZ = normalSign * (bd + 0.045);

  const mkPill = (
    w: number,
    h: number,
    d: number,
    px: number,
    py: number,
    pz: number,
    handleSide: 'left' | 'right' | 'top' | 'bottom'
  ) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(px, py, pz);
    m.userData = { kind: 'box-handle', wallId, boxId: box.id, handleSide } as Scene3DHitData;
    grp.add(m);
    interactables.push(m);
  };

  // Left & Right width resize pills
  mkPill(0.035, 0.14, 0.035, bx - 0.025, by + bh / 2, frontZ, 'left');
  mkPill(0.035, 0.14, 0.035, bx + bw + 0.025, by + bh / 2, frontZ, 'right');
  // Top height resize pill
  mkPill(0.16, 0.035, 0.035, bx + bw / 2, by + bh + 0.025, frontZ, 'top');
  // Bottom elevation resize pill for wall cabinets
  if (box.type === 'wall' || box.type === 'wall-deep') {
    mkPill(0.16, 0.035, 0.035, bx + bw / 2, by - 0.025, frontZ, 'bottom');
  }
}

function buildDoor3D(ctx: {
  wall: Wall;
  box: CabinetBox;
  door: DoorUnit;
  boxFinish: CabinetFinishId;
  bx: number;
  bw: number;
  rawIn: { left: number; right: number; top: number; bottom: number };
  scaleX: number;
  innerBottomY: number;
  innerH: number;
  frontFaceZ: number;
  carcD: number;
  normalSign: number;
  doorOpenProgress: number;
  project: ProjectState;
  animatedDoors: AnimatedDoorHandle[];
  interactables: THREE.Object3D[];
  grp: THREE.Group;
  matPack: KitchenMaterialPack;
  mats: {
    matDoorRevealDark: THREE.Material;
    matGlass: THREE.Material;
    matFrame: THREE.Material;
    matSteel: THREE.Material;
    matDarkChrome: THREE.Material;
    matHiddenTrim: THREE.Material;
    matHandleGizmo: THREE.Material;
  };
}) {
  const {
    wall,
    box,
    door,
    boxFinish,
    bx,
    rawIn,
    scaleX,
    innerBottomY,
    innerH,
    frontFaceZ,
    carcD,
    normalSign,
    doorOpenProgress,
    project,
    animatedDoors,
    interactables,
    grp,
    matPack,
    mats,
  } = ctx;

  // Compute apron sink extra top inset if door sits right beneath ceramic apron sink
  let apronExtraM = 0;
  if (box.type === 'base') {
    const hasApron = wall.appliances.some((a) => {
      if (a.kind !== 'sink' || a.sinkModel !== 'ceramic-apron') return false;
      const ls = a.offsetX - box.offsetX;
      const le = ls + a.width;
      const mid = door.startCm + door.widthCm / 2;
      return mid >= ls - 1 && mid <= le + 1;
    });
    if (hasApron) apronExtraM = APRON_SINK_DEPTH_CM * CM;
  }

  const dw = Math.max(0.05, door.widthCm * scaleX * CM - 0.006);
  const dh = Math.max(0.08, innerH - apronExtraM - 0.006);
  const dxLeft = bx + (rawIn.left + door.startCm * scaleX) * CM + 0.003;
  const dyBot = innerBottomY + 0.003;
  const doorThick = 0.018;
  const isSel =
    door.id === project.selectedDoorId || Boolean(project.multiSelection?.doorIds.includes(door.id));

  if (door.kind === 'open' || door.kind === 'rail') {
    if (door.kind === 'rail') {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, dw - 0.02, 12), mats.matSteel);
      rod.rotation.z = Math.PI / 2;
      rod.position.set(dxLeft + dw / 2, dyBot + dh * 0.85, normalSign * (carcD * 0.5));
      grp.add(rod);
    }
    return;
  }

  const dStyle: DoorStyle = door.doorStyle || 'flat';
  const isClosed = doorOpenProgress < 0.08;
  const doorMat = matPack.getDoorMaterial(boxFinish, dStyle, isClosed, isSel);
  const doorEdgeMat = matPack.getDoorEdgeMaterial(boxFinish, isClosed, isSel);
  const doorBoxMats: THREE.Material[] = [doorEdgeMat, doorEdgeMat, doorEdgeMat, doorEdgeMat, doorMat, doorMat];
  const doorCncInnerMat = matPack.getDoorInnerCncMaterial(boxFinish, isSel);

  const doorHit: Scene3DHitData = {
    kind: 'door',
    wallId: wall.id,
    boxId: box.id,
    doorId: door.id,
  };

  const makePanelMesh = (pw: number, ph: number, cx: number, cy: number, targetParent: THREE.Group) => {
    if (dStyle === 'glass' || dStyle === 'glass-grid') {
      const st = 0.045;
      const topR = new THREE.Mesh(new THREE.BoxGeometry(pw, st, doorThick), doorBoxMats);
      topR.position.set(cx, cy + ph / 2 - st / 2, 0);
      const botR = new THREE.Mesh(new THREE.BoxGeometry(pw, st, doorThick), doorBoxMats);
      botR.position.set(cx, cy - ph / 2 + st / 2, 0);
      const lR = new THREE.Mesh(new THREE.BoxGeometry(st, ph - st * 2, doorThick), doorBoxMats);
      lR.position.set(cx - pw / 2 + st / 2, cy, 0);
      const rR = new THREE.Mesh(new THREE.BoxGeometry(st, ph - st * 2, doorThick), doorBoxMats);
      rR.position.set(cx + pw / 2 - st / 2, cy, 0);
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(0.04, pw - st * 2), Math.max(0.04, ph - st * 2), 0.008),
        mats.matGlass
      );
      glass.position.set(cx, cy, 0);
      targetParent.add(topR, botR, lR, rR, glass);
      if (dStyle === 'glass-grid') {
        const m1 = new THREE.Mesh(new THREE.BoxGeometry(0.012, ph - st * 2, 0.012), doorMat);
        m1.position.set(cx, cy, 0);
        const m2 = new THREE.Mesh(new THREE.BoxGeometry(pw - st * 2, 0.012, 0.012), doorMat);
        m2.position.set(cx, cy, 0);
        targetParent.add(m1, m2);
      }
      for (const m of [topR, botR, lR, rR, glass]) {
        m.userData = doorHit;
        interactables.push(m);
      }
    } else if (dStyle === 'cnc') {
      const st = Math.min(0.055, pw * 0.16);
      const back = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, doorThick * 0.72), doorCncInnerMat);
      back.position.set(cx, cy, -normalSign * 0.002);
      const topR = new THREE.Mesh(new THREE.BoxGeometry(pw, st, doorThick), doorBoxMats);
      topR.position.set(cx, cy + ph / 2 - st / 2, 0);
      const botR = new THREE.Mesh(new THREE.BoxGeometry(pw, st, doorThick), doorBoxMats);
      botR.position.set(cx, cy - ph / 2 + st / 2, 0);
      const lR = new THREE.Mesh(new THREE.BoxGeometry(st, ph - st * 2, doorThick), doorBoxMats);
      lR.position.set(cx - pw / 2 + st / 2, cy, 0);
      const rR = new THREE.Mesh(new THREE.BoxGeometry(st, ph - st * 2, doorThick), doorBoxMats);
      rR.position.set(cx + pw / 2 - st / 2, cy, 0);
      targetParent.add(back, topR, botR, lR, rR);
      for (const m of [back, topR, botR, lR, rR]) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.userData = doorHit;
        interactables.push(m);
      }
    } else {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, doorThick), doorBoxMats);
      panel.position.set(cx, cy, 0);
      panel.castShadow = true;
      panel.receiveShadow = true;
      panel.userData = doorHit;
      targetParent.add(panel);
      interactables.push(panel);
    }
  };

  // Drawers or stacked Lift doors
  if (door.kind === 'drawer' || (door.kind === 'lift' && door.drawerRatios.length > 0)) {
    const pts = [0, ...door.drawerRatios, 1];
    for (let r = 0; r < pts.length - 1; r++) {
      const partId = `${door.id}:row:${r}`;
      // pts are top-down (0 top .. 1 bottom in 2D SVG)
      const rTop = 1 - pts[r];
      const rBot = 1 - pts[r + 1];
      const rowH = Math.max(0.05, (rTop - rBot) * dh - 0.003);
      const rowBotY = dyBot + rBot * dh + 0.0015;
      const rowGrp = new THREE.Group();

      if (door.kind === 'drawer') {
        const baseX = dxLeft + dw / 2;
        const baseY = rowBotY + rowH / 2;
        rowGrp.position.set(baseX, baseY, frontFaceZ);
        makePanelMesh(dw, rowH, 0, 0, rowGrp);
        // A real lightweight drawer box travels with its own façade.
        const drawerDepth = Math.max(0.12, Math.min(0.42, carcD * 0.78));
        const sideH = Math.max(0.045, Math.min(0.16, rowH * 0.58));
        const bodyW = Math.max(0.04, dw - 0.035);
        const bodyY = -rowH / 2 + sideH / 2 + 0.01;
        const drawerParts: THREE.Mesh[] = [
          new THREE.Mesh(new THREE.BoxGeometry(bodyW, 0.012, drawerDepth), mats.matFrame),
          new THREE.Mesh(new THREE.BoxGeometry(0.012, sideH, drawerDepth), mats.matFrame),
          new THREE.Mesh(new THREE.BoxGeometry(0.012, sideH, drawerDepth), mats.matFrame),
          new THREE.Mesh(new THREE.BoxGeometry(bodyW, sideH, 0.012), mats.matFrame),
        ];
        drawerParts[0].position.set(0, -rowH / 2 + 0.014, -normalSign * (drawerDepth / 2 + 0.01));
        drawerParts[1].position.set(-bodyW / 2 + 0.006, bodyY, -normalSign * (drawerDepth / 2 + 0.01));
        drawerParts[2].position.set(bodyW / 2 - 0.006, bodyY, -normalSign * (drawerDepth / 2 + 0.01));
        drawerParts[3].position.set(0, bodyY, -normalSign * (drawerDepth + 0.01));
        for (const part of drawerParts) {
          part.castShadow = true;
          part.receiveShadow = true;
          part.userData = doorHit;
          interactables.push(part);
          rowGrp.add(part);
        }
        const handle: AnimatedDoorHandle = {
          doorId: partId,
          group: rowGrp,
          kind: 'drawer',
          normalSign,
          baseX,
          baseY,
          baseZ: frontFaceZ,
          baseRotX: 0,
          baseRotY: 0,
          maxSlide: 0.34,
        };
        if (doorOpenProgress > 0) applyAnimatedDoorProgress(handle, doorOpenProgress);
        animatedDoors.push(handle);
      } else {
        // Lift row pivots from its top edge
        const baseX = dxLeft + dw / 2;
        const baseY = rowBotY + rowH;
        rowGrp.position.set(baseX, baseY, frontFaceZ);
        makePanelMesh(dw, rowH, 0, -rowH / 2, rowGrp);
        const handle: AnimatedDoorHandle = {
          doorId: partId,
          group: rowGrp,
          kind: 'lift',
          normalSign,
          baseX,
          baseY,
          baseZ: frontFaceZ,
          baseRotX: 0,
          baseRotY: 0,
          maxAngle: 1.15,
        };
        if (doorOpenProgress > 0) applyAnimatedDoorProgress(handle, doorOpenProgress);
        animatedDoors.push(handle);
      }

      // Attach handles belonging to this row
      for (const h of box.handles) {
        if (h.doorId !== door.id || h.rowIndex !== r) continue;
        const hx = (h.xRatio - 0.5) * dw;
        const hy =
          door.kind === 'drawer'
            ? (0.5 - h.yRatio) * rowH
            : -h.yRatio * rowH;
        const hMesh = buildHandleMesh(
          h.style,
          h.orient,
          h.lengthCm || 16,
          dw,
          rowH,
          doorThick,
          normalSign,
          mats.matDarkChrome,
          mats.matHiddenTrim
        );
        hMesh.position.set(hx, hy, 0);
        hMesh.userData = {
          kind: 'handle',
          wallId: wall.id,
          boxId: box.id,
          doorId: door.id,
          handleId: h.id,
        } as Scene3DHitData;
        rowGrp.add(hMesh);
        interactables.push(hMesh);
      }

      rowGrp.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) child.userData = { ...child.userData, animationId: partId };
      });
      grp.add(rowGrp);
    }
    return;
  }

  // Single Lift door (top-hinged)
  if (door.kind === 'lift') {
    const pivot = new THREE.Group();
    const baseX = dxLeft + dw / 2;
    const baseY = dyBot + dh;
    pivot.position.set(baseX, baseY, frontFaceZ);
    makePanelMesh(dw, dh, 0, -dh / 2, pivot);
    const animHandle: AnimatedDoorHandle = {
      doorId: door.id,
      group: pivot,
      kind: 'lift',
      normalSign,
      baseX,
      baseY,
      baseZ: frontFaceZ,
      baseRotX: 0,
      baseRotY: 0,
      maxAngle: 1.25,
    };
    if (doorOpenProgress > 0) applyAnimatedDoorProgress(animHandle, doorOpenProgress);
    animatedDoors.push(animHandle);

    for (const h of box.handles) {
      if (h.doorId !== door.id) continue;
      const hx = (h.xRatio - 0.5) * dw;
      const hy = -h.yRatio * dh;
      const hMesh = buildHandleMesh(
        h.style,
        h.orient,
        h.lengthCm || 16,
        dw,
        dh,
        doorThick,
        normalSign,
        mats.matDarkChrome,
        mats.matHiddenTrim
      );
      hMesh.position.set(hx, hy, 0);
      hMesh.userData = {
        kind: 'handle',
        wallId: wall.id,
        boxId: box.id,
        doorId: door.id,
        handleId: h.id,
      } as Scene3DHitData;
      pivot.add(hMesh);
      interactables.push(hMesh);
    }

    grp.add(pivot);
    return;
  }

  // Pantry pull-out vs standard Hinged Door
  const isPantry = dStyle === 'pantry';
  if (isPantry) {
    const pivot = new THREE.Group();
    const baseX = dxLeft + dw / 2;
    const baseY = dyBot + dh / 2;
    pivot.position.set(baseX, baseY, frontFaceZ);
    makePanelMesh(dw, dh, 0, 0, pivot);
    const animHandle: AnimatedDoorHandle = {
      doorId: door.id,
      group: pivot,
      kind: 'drawer',
      normalSign,
      baseX,
      baseY,
      baseZ: frontFaceZ,
      baseRotX: 0,
      baseRotY: 0,
      maxSlide: 0.42,
    };
    if (doorOpenProgress > 0) applyAnimatedDoorProgress(animHandle, doorOpenProgress);
    animatedDoors.push(animHandle);

    for (const h of box.handles) {
      if (h.doorId !== door.id) continue;
      const hx = (h.xRatio - 0.5) * dw;
      const hy = (0.5 - h.yRatio) * dh;
      const hMesh = buildHandleMesh(
        h.style,
        h.orient,
        h.lengthCm || 16,
        dw,
        dh,
        doorThick,
        normalSign,
        mats.matDarkChrome,
        mats.matHiddenTrim
      );
      hMesh.position.set(hx, hy, 0);
      hMesh.userData = {
        kind: 'handle',
        wallId: wall.id,
        boxId: box.id,
        doorId: door.id,
        handleId: h.id,
      } as Scene3DHitData;
      pivot.add(hMesh);
      interactables.push(hMesh);
    }

    grp.add(pivot);
    return;
  }

  // Hinged vertical door (with optional top/bottom drawerBand!)
  const firstHand = box.handles.find((h) => h.doorId === door.id);
  const hingeSide: 'left' | 'right' =
    door.hingeSide ||
    (firstHand && firstHand.xRatio <= 0.35
      ? 'right'
      : firstHand && firstHand.xRatio >= 0.65
      ? 'left'
      : 'left');

  const pivotX = hingeSide === 'left' ? dxLeft : dxLeft + dw;
  const panelOffsetX = hingeSide === 'left' ? dw / 2 : -dw / 2;

  let leafBot = dyBot;
  let leafH = dh;
  if (door.drawerBand) {
    const gapM = 0.004;
    const bandH = Math.max(0.08, dh * door.drawerBand.ratio - gapM / 2);
    leafH = Math.max(0.1, dh - bandH - gapM);
    const isTop = door.drawerBand.position === 'top';
    const bandCenterY = isTop ? dyBot + dh - bandH / 2 : dyBot + bandH / 2;
    leafBot = isTop ? dyBot : dyBot + bandH + gapM;

    const bandGrp = new THREE.Group();
    const bandBaseX = dxLeft + dw / 2;
    bandGrp.position.set(bandBaseX, bandCenterY, frontFaceZ);
    makePanelMesh(dw, bandH, 0, 0, bandGrp);
    const pullMesh = buildHandleMesh(
      'simple',
      'horizontal',
      Math.min(18, Math.max(8, Math.round(dw / CM / 2))),
      dw,
      bandH,
      doorThick,
      normalSign,
      mats.matDarkChrome,
      mats.matHiddenTrim
    );
    pullMesh.position.set(0, 0, 0);
    pullMesh.traverse((ch) => {
      if ((ch as THREE.Mesh).isMesh) {
        ch.userData = doorHit;
        interactables.push(ch);
      }
    });
    bandGrp.add(pullMesh);
    const bandPartId = `${door.id}:band`;
    bandGrp.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) child.userData = { ...child.userData, animationId: bandPartId };
    });
    const bandHandle: AnimatedDoorHandle = {
      doorId: bandPartId,
      group: bandGrp,
      kind: 'drawer',
      normalSign,
      baseX: bandBaseX,
      baseY: bandCenterY,
      baseZ: frontFaceZ,
      baseRotX: 0,
      baseRotY: 0,
      maxSlide: 0.34,
    };
    if (doorOpenProgress > 0) applyAnimatedDoorProgress(bandHandle, doorOpenProgress);
    animatedDoors.push(bandHandle);
    grp.add(bandGrp);
  }

  const pivot = new THREE.Group();
  const pivotBaseY = leafBot + leafH / 2;
  pivot.position.set(pivotX, pivotBaseY, frontFaceZ);
  makePanelMesh(dw, leafH, panelOffsetX, 0, pivot);

  const swingKind = hingeSide === 'left' ? 'hinge-left' : 'hinge-right';
  const pivotHandle: AnimatedDoorHandle = {
    doorId: door.id,
    group: pivot,
    kind: swingKind,
    normalSign,
    baseX: pivotX,
    baseY: pivotBaseY,
    baseZ: frontFaceZ,
    baseRotX: 0,
    baseRotY: 0,
    maxAngle: 1.38,
  };
  if (doorOpenProgress > 0) applyAnimatedDoorProgress(pivotHandle, doorOpenProgress);
  animatedDoors.push(pivotHandle);

  for (const h of box.handles) {
    if (h.doorId !== door.id) continue;
    const hx = panelOffsetX + (h.xRatio - 0.5) * dw;
    const hy = (0.5 - h.yRatio) * leafH;
    const hMesh = buildHandleMesh(
      h.style,
      h.orient,
      h.lengthCm || 16,
      dw,
      leafH,
      doorThick,
      normalSign,
      mats.matDarkChrome,
      mats.matHiddenTrim
    );
    hMesh.position.set(hx, hy, 0);
    hMesh.userData = {
      kind: 'handle',
      wallId: wall.id,
      boxId: box.id,
      doorId: door.id,
      handleId: h.id,
    } as Scene3DHitData;
    pivot.add(hMesh);
    interactables.push(hMesh);
  }

  grp.add(pivot);
}

function buildAppliance3D(
  wall: Wall,
  app: ApplianceItem,
  normalSign: number,
  isSelected: boolean,
  mats: {
    matSteel: THREE.Material;
    matDarkChrome: THREE.Material;
    matGlassCooktop: THREE.Material;
    matCarcass: THREE.Material;
    matDoorModern: THREE.Material;
    matGlass: THREE.Material;
  }
): THREE.Group {
  const grp = new THREE.Group();
  const underBox =
    wall.boxes.find(
      (b) =>
        b.id === app.boxId ||
        (b.type === 'base' &&
          app.offsetX >= b.offsetX - 5 &&
          app.offsetX + app.width <= b.offsetX + b.width + 5)
    ) || wall.boxes.find((b) => b.type === 'base');

  const topElevCm = underBox ? underBox.elevY + underBox.height : 86;
  const plinthCm = underBox?.plinth ?? 10;
  const counterCm = underBox?.countertopCm ?? 4;
  const boxDepthCm = underBox?.depth ?? 60;

  const aw = app.width * CM;
  const ax = (app.offsetX + app.width / 2) * CM;
  const topY = topElevCm * CM;
  const cz = normalSign * (boxDepthCm * CM * 0.5);

  if (app.kind === 'sink') {
    const isApron = app.sinkModel === 'ceramic-apron';
    const isDouble = app.sinkModel === 'steel-2';
    const hasTray = app.sinkModel === 'steel-tray-left' || app.sinkModel === 'steel-tray-right';
    const rimW = aw - 0.04;
    const rimD = Math.min(0.48, boxDepthCm * CM - 0.08);
    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(rimW, 0.016, rimD),
      isApron ? mats.matDoorModern : mats.matSteel
    );
    rim.position.set(ax, topY + 0.008, cz);
    grp.add(rim);

    // Basin recess look (dark chrome inset)
    const basinW = hasTray ? rimW * 0.52 : rimW * 0.84;
    const basinX =
      app.sinkModel === 'steel-tray-right'
        ? ax - rimW * 0.18
        : app.sinkModel === 'steel-tray-left'
        ? ax + rimW * 0.18
        : ax;
    if (isDouble) {
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(basinW * 0.45, 0.012, rimD * 0.78), mats.matDarkChrome);
      b1.position.set(ax - basinW * 0.25, topY + 0.012, cz);
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(basinW * 0.45, 0.012, rimD * 0.78), mats.matDarkChrome);
      b2.position.set(ax + basinW * 0.25, topY + 0.012, cz);
      grp.add(b1, b2);
    } else {
      const b1 = new THREE.Mesh(new THREE.BoxGeometry(basinW, 0.012, rimD * 0.78), mats.matDarkChrome);
      b1.position.set(basinX, topY + 0.012, cz);
      grp.add(b1);
    }

    if (isApron) {
      const apronH = APRON_SINK_DEPTH_CM * CM;
      const apron = new THREE.Mesh(new THREE.BoxGeometry(aw - 0.02, apronH, 0.045), mats.matDoorModern);
      apron.position.set(ax, topY - apronH / 2, normalSign * (boxDepthCm * CM + 0.022));
      grp.add(apron);
    }

    // Goose-neck chrome faucet
    const fZ = normalSign * (0.09);
    const fStem = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.26, 12), mats.matSteel);
    fStem.position.set(basinX, topY + 0.14, fZ);
    const fNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.16, 10), mats.matSteel);
    fNeck.rotation.x = Math.PI / 2;
    fNeck.position.set(basinX, topY + 0.27, fZ + normalSign * 0.075);
    const fSpout = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.055, 10), mats.matSteel);
    fSpout.position.set(basinX, topY + 0.24, fZ + normalSign * 0.145);
    grp.add(fStem, fNeck, fSpout);

    if (isSelected) addOutlineHighlight(grp, aw, 0.3, rimD, ax, topY + 0.14, cz);
    return grp;
  }

  if (app.kind === 'gas') {
    const cookW = aw - 0.06;
    const cookD = Math.min(0.48, boxDepthCm * CM - 0.08);
    const glassTop = new THREE.Mesh(
      new THREE.BoxGeometry(cookW, 0.018, cookD),
      mats.matGlassCooktop
    );
    glassTop.position.set(ax, topY + 0.009, cz);
    grp.add(glassTop);

    // Burner grates
    const offsets =
      app.width >= 85
        ? [-0.28, -0.1, 0.1, 0.28]
        : [-0.22, 0.22];
    for (const ox of offsets) {
      const r1 = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.07, 0.014, 16), mats.matSteel);
      r1.position.set(ax + ox * cookW, topY + 0.022, cz - normalSign * 0.1);
      const r2 = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.014, 16), mats.matSteel);
      r2.position.set(ax + ox * cookW, topY + 0.022, cz + normalSign * 0.1);
      grp.add(r1, r2);
    }

    // Connected Hood above gas
    const hoodD = 0.42;
    const hoodY = 1.56;
    if (app.hoodKind === 'chimney') {
      const visor = new THREE.Mesh(new THREE.BoxGeometry(aw, 0.06, hoodD), mats.matSteel);
      visor.position.set(ax, hoodY, normalSign * (hoodD / 2));
      const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.28, Math.max(0.4, wall.height * CM - hoodY), 0.26), mats.matSteel);
      chimney.position.set(ax, hoodY + (wall.height * CM - hoodY) / 2, normalSign * 0.13);
      grp.add(visor, chimney);
    } else {
      const hiddenHood = new THREE.Mesh(new THREE.BoxGeometry(aw * 0.85, 0.04, 0.28), mats.matSteel);
      hiddenHood.position.set(ax, 1.48, normalSign * 0.16);
      grp.add(hiddenHood);
    }

    if (isSelected) addOutlineHighlight(grp, aw, 0.15, cookD, ax, topY + 0.05, cz);
    return grp;
  }

  // Dishwasher or Washing Machine (stands on floor beneath countertop)
  const machH = Math.max(0.7, (topElevCm - counterCm) * CM);
  const machW = aw - 0.01;
  const machD = Math.max(0.5, boxDepthCm * CM - 0.01);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(machW, machH, machD),
    app.kind === 'dishwasher' ? mats.matSteel : mats.matDoorModern
  );
  body.position.set(ax, machH / 2, normalSign * (machD / 2));
  body.castShadow = true;
  body.receiveShadow = true;
  grp.add(body);

  const ctrl = new THREE.Mesh(new THREE.BoxGeometry(machW - 0.02, 0.09, 0.016), mats.matDarkChrome);
  ctrl.position.set(ax, machH - 0.055, normalSign * (machD + 0.005));
  grp.add(ctrl);

  if (app.kind === 'washing') {
    const drumRing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.17, 0.022, 24),
      mats.matDarkChrome
    );
    drumRing.rotation.x = Math.PI / 2;
    drumRing.position.set(ax, machH * 0.45, normalSign * (machD + 0.008));
    const drumGlass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.13, 0.026, 20),
      mats.matGlass
    );
    drumGlass.rotation.x = Math.PI / 2;
    drumGlass.position.set(ax, machH * 0.45, normalSign * (machD + 0.01));
    grp.add(drumRing, drumGlass);
  }

  if (isSelected) addOutlineHighlight(grp, machW, machH, machD, ax, machH / 2, normalSign * (machD / 2));
  return grp;
}
