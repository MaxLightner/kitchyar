import { fitHandleLengthCm } from './handleGeometry';
import * as THREE from 'three';
import {
  APPLIANCE_CONFIGS,
  APRON_SINK_DEPTH_CM,
  CORNER_FILLER_CM,
  DEFAULT_COLUMN_DEPTH_CM,
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
  applyHandlesToBoxDoors,
  canDoorOpenIn3D,
  computeWallBacksplashSpans,
  doesFridgeTouchCabinet,
  getBoxCarpentryElements,
  getBoxFrameInsets,
  effectiveHoodKind,
  getUnitsInBox,
  isDividerNearBlockedCorner,
  isDoorAdjacentToInsideCorner,
} from './doorRules';
import { buildDining3D, buildTelevisionSet3D, createDiningMaterials } from './dining3d';
import { readSurfaceFinish } from './surfaceFinish';
import { bakeKitchenOcclusion, kitchenOcclusionGeometryKey } from './kitchenOcclusion';
import { addCeilingFillLights, addKitchenLightDecal } from './kitchenLighting';
import { getCabinetLighting, getKitchenCabinetLightMode } from './cabinetLighting';
import { limitKitchenHdrIrradiance } from './kitchenEnvironment';
import { getWallColumnSpans } from './openingRules';
import { createKitchenMaterialPack, getEquipmentEdgeNormalMap, KitchenMaterialPack, isSharedKitchenTexture } from './materials3d';
import { fitAppliance, makeFridge, makeHood, makeCooktop, makeSink, makeWashingMachine, makeDishwasher, toneApplianceMetal } from './applianceModels';
import { fridgeDepthCm, fridgeFrontCm } from './fridgePlacement';
import {
  createCountertopSectionGeometry,
  createSinkCountertopGeometry,
  expandBasinCutoutOutline,
  normalizeCountertopExtrudeUVs,
} from './countertopGeometry';
import { deriveFloorPolygon } from './floorPolygon';
import { computeDoorHandleSpots } from './handleSpots';
import {
  ApplianceItem,
  BlockedZone,
  CabinetBox,
  CabinetFinishId,
  DoorStyle,
  DoorUnit,
  HandleStyle,
  Orientation,
  ProjectState,
  ToolId,
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
    | 'handle-spot'
    | 'appliance'
    | 'opening'
    | 'column'
    | 'dining'
    | 'under-cabinet-light'
    | 'box-handle'
    | 'drawer-resize-handle'
    | 'door-seam-handle';
  wallId: string;
  boxId?: string;
  doorId?: string;
  /** Unique animated leaf/drawer part; keeps façade selection tied to doorId. */
  animationId?: string;
  appId?: string;
  subPart?: 'gas' | 'hood';
  openingId?: string;
  columnId?: string;
  diningId?: string;
  lightBoxIds?: string[];
  frameId?: string;
  shelfId?: string;
  handleId?: string;
  spotId?: string;
  rowIndex?: number;
  xRatio?: number;
  yRatio?: number;
  seamCm?: number;
  unitStart?: number;
  unitEnd?: number;
  handleSide?: 'left' | 'right' | 'top' | 'bottom';
  edge?: 'left' | 'right';
  leftDoorId?: string;
  localXCm?: number;
  localYCm?: number;
}

export interface AnimatedDoorHandle {
  doorId: string;
  group: THREE.Group;
  kind: 'hinge-left' | 'hinge-right' | 'lift' | 'bifold' | 'drawer';
  normalSign: number;
  baseX: number;
  baseY: number;
  baseZ: number;
  baseRotX: number;
  baseRotY: number;
  maxAngle?: number;
  maxSlide?: number;
  lowerLeaf?: THREE.Group;
  liftArms?: Array<{ mesh: THREE.Mesh; fixed: THREE.Vector3; moving: THREE.Vector3 }>;
}

const LIFT_X_AXIS = new THREE.Vector3(1, 0, 0);
const LIFT_Y_AXIS = new THREE.Vector3(0, 1, 0);

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
  } else if (handle.kind === 'lift' || handle.kind === 'bifold') {
    const angle = -handle.normalSign * e * (handle.maxAngle ?? 1.25);
    handle.group.rotation.x = handle.baseRotX + angle;
    // Counter-rotate the lower leaf so it hangs vertically from the moving hinge.
    if (handle.lowerLeaf) handle.lowerLeaf.rotation.x = -angle;
    for (const arm of handle.liftArms ?? []) {
      const to = arm.moving.clone().applyAxisAngle(LIFT_X_AXIS, angle).add(handle.group.position);
      const axis = to.clone().sub(arm.fixed);
      arm.mesh.position.copy(arm.fixed).lerp(to, 0.5);
      arm.mesh.scale.y = axis.length();
      arm.mesh.quaternion.setFromUnitVectors(LIFT_Y_AXIS, axis.normalize());
    }
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
  syncOcclusion?: () => void;
  activateOcclusion?: () => void;
  /** Costly source models are populated after the first scene frame. */
  deferredEquipmentJobs?: Array<() => void>;
  /** Replace only affected procedural equipment without rebuilding the room. */
  updateEquipment?: (project: ProjectState) => boolean;
  updateLighting: (project: ProjectState, stage?: number) => void;
}

/** Ignore only lighting state to avoid rebuilding all kitchen meshes when toggling a lamp. */
const LIGHTING_ONLY_KEYS = new Set([
  'lighting', 'underCabinetLight', 'ovenLightOn', 'flameOn', 'underCabinetLightMode',
  'linearLightIntensity', 'halogenLightIntensity', 'facadeLightIntensity', 'facadeLightEnabled',
  'ceilingAreaIntensity', 'ceilingLightIntensities', 'hdrIntensity', 'cameraLightIntensity',
  'ambientLightIntensity', 'enableAmbientLight', 'enableReflections',
]);
export function kitchenGeometryKey(project: ProjectState): string {
  return JSON.stringify(project, (key, value) => LIGHTING_ONLY_KEYS.has(key) ? undefined : value);
}


/** Stable room geometry identity. Cosmetic appliance model/finish updates can be
 * applied to their existing holders without reconstructing cabinets, camera,
 * reflections, or other equipment. Structural size/position edits still rebuild. */
export function kitchenStructuralKey(project: ProjectState): string {
  return JSON.stringify(project, function (key, value) {
    if (key === 'equipmentFinish' || key === 'fridgeModel' ||
        key === 'sinkFinish' || key === 'hoodModel' || key === 'hoodFinish' ||
        key === 'cooktopModel') return undefined;
    if (key === 'finish' && this && typeof this === 'object' &&
        'kind' in this && 'offsetX' in this) return undefined;
    return LIGHTING_ONLY_KEYS.has(key) ? undefined : value;
  });
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
    if (obj instanceof THREE.InstancedMesh) obj.dispose();
    if (obj.userData.kitchenOcclusionTexture instanceof THREE.Data3DTexture) {
      textures.add(obj.userData.kitchenOcclusionTexture);
    }
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        materials.add(m);
        const std = m as THREE.MeshStandardMaterial;
        if (std.map) textures.add(std.map);
        if (std.roughnessMap) textures.add(std.roughnessMap);
        if (std.bumpMap) textures.add(std.bumpMap);
        if (std.normalMap) textures.add(std.normalMap);
      }
    }
  });

  geometries.forEach((g) => g.dispose());
  textures.forEach(t => { if (!isSharedKitchenTexture(t)) t.dispose(); });
  materials.forEach((m) => { if (!m.userData.sharedApplianceMaterial) m.dispose(); });
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

export function buildHandleMesh(
  style: HandleStyle,
  orient: 'vertical' | 'horizontal',
  lengthCm: number,
  w: number,
  h: number,
  thick: number,
  normalSign: number,
  matDarkChrome: THREE.Material,
  matHiddenTrim: THREE.Material,
  xRatio = 0.5,
  yRatio = 0.5
): THREE.Object3D {
  const grp = new THREE.Group();
  if (style === 'handleless') return grp;

  if (style === 'knob') {
    // True half-sphere mushroom/button knob spaced ~1.5cm off the door surface on a narrow neck stem
    const stemLen = 0.015;
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0045, 0.0055, stemLen, 18),
      matDarkChrome
    );
    neck.rotation.x = Math.PI / 2;
    neck.position.z = normalSign * (thick * 0.5 + stemLen * 0.5);

    const headGeo = new THREE.SphereGeometry(0.018, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const head = new THREE.Mesh(headGeo, matDarkChrome);
    head.rotation.x = normalSign > 0 ? Math.PI / 2 : -Math.PI / 2;
    head.position.z = normalSign * (thick * 0.5 + stemLen);
    grp.add(neck, head);
    return grp;
  }

  const lenM = fitHandleLengthCm(style, orient, lengthCm, w / CM, h / CM, xRatio, yRatio) * CM;
  const vertical = orient === 'vertical';
  if (style === 'f-profile') {
    const edge = (vertical ? xRatio : 1 - yRatio) >= 0.5 ? 1 : -1;
    const cross = vertical ? w : h;
    const anchor = vertical ? (xRatio - 0.5) * w : (0.5 - yRatio) * h;
    const along = vertical ? (yRatio - 0.5) * h : (0.5 - xRatio) * w;
    const rail = (width: number, offset: number, depth: number, z: number, material: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(vertical ? width : lenM, vertical ? lenM : width, depth), material);
      const center = edge * (cross / 2 - offset) - anchor;
      mesh.position.set(vertical ? center : along, vertical ? along : center, normalSign * z);
      grp.add(mesh);
    };
    rail(0.025, 0.0125, 0.006, thick / 2 - 0.004, matHiddenTrim);
    rail(0.004, 0.003, 0.010, thick / 2, matDarkChrome);
    rail(0.003, 0.023, 0.004, thick / 2 - 0.002, matDarkChrome);
    return grp;
  }
  if (style === 'hidden' || style === 'tab') {
    const width = vertical ? 0.012 : lenM;
    const height = vertical ? lenM : 0.012;
    const recess = style === 'hidden';
    const strip = new THREE.Mesh(new THREE.BoxGeometry(width, height, recess ? 0.0008 : 0.01),
      recess ? matHiddenTrim : matDarkChrome);
    strip.position.z = normalSign * (thick * 0.5 + (recess ? 0.0006 : 0.006));
    grp.add(strip);
    if (recess) {
      const shadow = new THREE.Mesh(new THREE.BoxGeometry(width * (vertical ? 0.53 : 0.96),
        height * (vertical ? 0.96 : 0.53), 0.0006), matDarkChrome);
      shadow.position.z = normalSign * (thick * 0.5 + 0.0013);
      grp.add(shadow);
    }
    return grp;
  }
  if (style === 'arch') {
    const point = (t: number, z: number) => new THREE.Vector3(vertical ? 0 : t, vertical ? t : 0,
      normalSign * (thick * 0.5 + z));
    const curve = new THREE.QuadraticBezierCurve3(point(-lenM / 2, 0.004), point(0, 0.048), point(lenM / 2, 0.004));
    grp.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.0055, 7, false), matDarkChrome));
    return grp;
  }
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

/**
 * Preview the actual handle geometry at the exact positions the Install action
 * would choose. Ghosts live on the rendered door leaves, so they inherit wall
 * transforms and opening animations without modifying the saved project.
 */
export function attachSelectedHandlePreviews(
  built: BuiltKitchenScene,
  project: ProjectState,
  style: HandleStyle,
  orient: Orientation
): THREE.Object3D[] {
  if (project.doorsHidden) return [];
  const selected = new Set(project.multiSelection?.doorIds ?? []);
  if (project.selectedDoorId) selected.add(project.selectedDoorId);
  if (selected.size === 0) return [];

  const candidates = new Map<string, THREE.Mesh[]>();
  for (const node of built.interactables) {
    const data = node.userData as Scene3DHitData;
    if (data.kind !== 'door' || !data.doorId || !selected.has(data.doorId)) continue;
    if (!(node instanceof THREE.Mesh) || !(node.geometry instanceof THREE.BoxGeometry)) continue;
    const key = `${data.wallId}:${data.boxId}:${data.doorId}`;
    if (!candidates.has(key)) candidates.set(key, []);
    candidates.get(key)!.push(node);
  }

  const previews: THREE.Object3D[] = [];
  for (const wall of project.walls) {
    for (const box of wall.boxes) {
      const targetIds = box.doors.filter((door) => selected.has(door.id)).map((door) => door.id);
      if (targetIds.length === 0) continue;
      const previewBox: CabinetBox = {
        ...box,
        doors: box.doors.map((door) => ({ ...door })),
        handles: [],
      };
      applyHandlesToBoxDoors(
        previewBox, targetIds, style, orient, undefined,
        getCornerBlockedZonesForWall(wall, project.walls, project.cornerOwners)
      );
      for (const handle of previewBox.handles) {
        const key = `${wall.id}:${box.id}:${handle.doorId}`;
        const panels = candidates.get(key) ?? [];
        const rowKey = `${handle.doorId}:row:${handle.rowIndex ?? 0}`;
        const rowPanels = panels.filter((panel) => panel.userData.animationId === rowKey);
        const options = rowPanels.length > 0 ? rowPanels : panels;
        const panel = options.reduce<THREE.Mesh | null>((best, node) => {
          const size = (node.geometry as THREE.BoxGeometry).parameters;
          const area = size.width * size.height;
          if (!best) return node;
          const old = (best.geometry as THREE.BoxGeometry).parameters;
          return area > old.width * old.height ? node : best;
        }, null);
        if (!panel) continue;
        const size = (panel.geometry as THREE.BoxGeometry).parameters;
        const normalSign = built.wallTransforms.get(wall.id)?.normalSign ?? 1;
        const material = new THREE.MeshStandardMaterial({
          color: 0x0d9488,
          metalness: 0.56,
          roughness: 0.23,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
        });
        const preview = buildHandleMesh(
          handle.style, handle.orient, handle.lengthCm || 16,
          size.width, size.height, 0.018, normalSign, material, material, handle.xRatio, handle.yRatio
        );
        preview.position.set(
          (handle.xRatio - 0.5) * size.width,
          (0.5 - handle.yRatio) * size.height,
          normalSign * 0.006
        );
        preview.userData = { previewOnly: true, doorId: handle.doorId };
        panel.add(preview);
        previews.push(preview);
      }
    }
  }
  return previews;
}

export interface HandleSpotOverlaySet {
  overlays: THREE.Object3D[];
  spotInteractables: THREE.Object3D[];
  setHoveredSpot: (spotId: string | null) => void;
  dispose: () => void;
}

/**
 * Attaches visible interactive handle candidate markers onto rendered 3D door leaves
 * using the exact same `computeDoorHandleSpots` coordinates as 2D FrontCanvas.
 */
export function attachHandleCandidateSpots(
  built: BuiltKitchenScene,
  project: ProjectState
): HandleSpotOverlaySet {
  const overlays: THREE.Object3D[] = [];
  const spotInteractables: THREE.Object3D[] = [];
  if (project.doorsHidden) {
    return { overlays, spotInteractables, setHoveredSpot: () => {}, dispose: () => {} };
  }

  const candidates = new Map<string, THREE.Mesh[]>();
  for (const node of built.interactables) {
    const data = node.userData as Scene3DHitData;
    if (data.kind !== 'door' || !data.doorId) continue;
    if (!(node instanceof THREE.Mesh) || !(node.geometry instanceof THREE.BoxGeometry)) continue;
    const key = `${data.wallId}:${data.boxId}:${data.doorId}`;
    if (!candidates.has(key)) candidates.set(key, []);
    candidates.get(key)!.push(node);
  }

  const matRingIdle = new THREE.MeshBasicMaterial({
    color: 0x0f766e,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  const matDotIdle = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  const matRingOccupied = new THREE.MeshBasicMaterial({
    color: 0x059669,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  const matRingHover = new THREE.MeshBasicMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0.98,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  const matHit = new THREE.MeshBasicMaterial({
    visible: false,
    side: THREE.DoubleSide,
  });

  const ringGeo = new THREE.RingGeometry(0.016, 0.025, 20);
  const dotGeo = new THREE.CircleGeometry(0.014, 16);
  const hitGeo = new THREE.CircleGeometry(0.044, 16);

  const ringBySpotId = new Map<string, { ring: THREE.Mesh; occupied: boolean }>();

  for (const wall of project.walls) {
    const normalSign = built.wallTransforms.get(wall.id)?.normalSign ?? 1;
    for (const box of wall.boxes) {
      if (box.type === 'fridge') continue;
      for (const door of box.doors) {
        if (door.kind === 'fridge' || door.kind === 'open' || door.kind === 'rail') continue;
        const spots = computeDoorHandleSpots(box, door);
        if (!spots.length) continue;

        const key = `${wall.id}:${box.id}:${door.id}`;
        const panels = candidates.get(key) ?? [];

        for (const sp of spots) {
          const rowKey = `${door.id}:row:${sp.rowIndex}`;
          const rowPanels = panels.filter((p) => p.userData.animationId === rowKey);
          const options = rowPanels.length > 0 ? rowPanels : panels;
          const panel = options.reduce<THREE.Mesh | null>((best, node) => {
            const size = (node.geometry as THREE.BoxGeometry).parameters;
            const area = size.width * size.height;
            if (!best) return node;
            const old = (best.geometry as THREE.BoxGeometry).parameters;
            return area > old.width * old.height ? node : best;
          }, null);
          if (!panel) continue;

          const size = (panel.geometry as THREE.BoxGeometry).parameters;
          const occupied = box.handles.some(
            (h) =>
              h.doorId === door.id &&
              (h.rowIndex ?? 0) === sp.rowIndex &&
              Math.abs(h.xRatio - sp.xRatio) < 0.1 &&
              Math.abs(h.yRatio - sp.yRatio) < 0.1
          );

          const marker = new THREE.Group();
          marker.position.set(
            (sp.xRatio - 0.5) * size.width,
            (0.5 - sp.yRatio) * size.height,
            normalSign * (size.depth * 0.5 + 0.008)
          );
          if (normalSign < 0) marker.rotation.y = Math.PI;

          const dot = new THREE.Mesh(dotGeo, matDotIdle);
          dot.renderOrder = 18;
          const ring = new THREE.Mesh(ringGeo, occupied ? matRingOccupied : matRingIdle);
          ring.renderOrder = 19;
          const hitMesh = new THREE.Mesh(hitGeo, matHit);
          hitMesh.userData = {
            kind: 'handle-spot',
            wallId: wall.id,
            boxId: box.id,
            doorId: door.id,
            spotId: sp.spotId,
            rowIndex: sp.rowIndex,
            xRatio: sp.xRatio,
            yRatio: sp.yRatio,
          } as Scene3DHitData;

          marker.add(dot, ring, hitMesh);
          panel.add(marker);
          overlays.push(marker);
          spotInteractables.push(hitMesh);
          ringBySpotId.set(sp.spotId, { ring, occupied });
        }
      }
    }
  }

  let prevHover: string | null = null;
  const setHoveredSpot = (spotId: string | null) => {
    if (prevHover === spotId) return;
    if (prevHover) {
      const oldEntry = ringBySpotId.get(prevHover);
      if (oldEntry) {
        oldEntry.ring.material = oldEntry.occupied ? matRingOccupied : matRingIdle;
        oldEntry.ring.scale.setScalar(1);
      }
    }
    prevHover = spotId;
    if (spotId) {
      const entry = ringBySpotId.get(spotId);
      if (entry) {
        entry.ring.material = matRingHover;
        entry.ring.scale.setScalar(1.35);
      }
    }
  };

  const dispose = () => {
    for (const ov of overlays) {
      ov.parent?.remove(ov);
    }
    ringGeo.dispose();
    dotGeo.dispose();
    hitGeo.dispose();
    matRingIdle.dispose();
    matDotIdle.dispose();
    matRingOccupied.dispose();
    matRingHover.dispose();
    matHit.dispose();
  };

  return { overlays, spotInteractables, setHoveredSpot, dispose };
}

function applianceAppearanceKey(item: ApplianceItem, equipmentFinish: string): string {
  return JSON.stringify([
    item.sinkModel, item.sinkFinish, item.cooktopModel, item.hoodModel,
    item.hoodFinish, item.hoodKind, item.finish, equipmentFinish,
  ]);
}

/** Dispose per-model geometry without destroying room-wide material instances. */
function disposeReplacedEquipment(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse(node => {
    if (!(node instanceof THREE.Mesh)) return;
    geometries.add(node.geometry);
    for (const mat of Array.isArray(node.material) ? node.material : [node.material]) {
      if (mat.userData.applianceInstanceMaterial) materials.add(mat);
    }
  });
  geometries.forEach(geo => geo.dispose());
  materials.forEach(mat => mat.dispose());
}

export function buildKitchen3DScene(
  project: ProjectState,
  opts: { doorOpenProgress?: number; hideFloor?: boolean; floorOpacity?: number; tool?: ToolId; onTextureReady?: () => void; deferOcclusion?: boolean; deferEquipment?: boolean } = {}
): BuiltKitchenScene {
  const root = new THREE.Group();
  const interactables: THREE.Object3D[] = [];
  const animatedDoors: AnimatedDoorHandle[] = [];
  const deferredEquipmentJobs: Array<() => void> = [];
  const applianceViews = new Map<string, { signature: string; refresh: (wall: Wall, item: ApplianceItem, next: ProjectState) => void }>();
  const fridgeViews = new Map<string, { model?: string; refresh: (wall: Wall, box: CabinetBox, next: ProjectState) => void }>();
  let registerOvenParts = (_group: THREE.Object3D) => {};
  const linearControls: Array<{ boxId: string; group: THREE.Group; strip: THREE.Mesh; area: THREE.RectAreaLight }> = [];
  const cooktopControls: Array<{ id: string; setLit: (lit: boolean) => void }> = [];
  const halogenControls: Array<{ boxId: string; group: THREE.Group; decals: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] }> = [];
  const facadeControls: Array<{ boxId: string; group: THREE.Group; decals: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] }> = [];
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
  const matPack = createKitchenMaterialPack(project, opts.onTextureReady);
  const floorTex = createFloorTileTexture();
  const matFloor = new THREE.MeshPhysicalMaterial({
    map: floorTex,
    ...readSurfaceFinish(project.settings, 3),
    transparent: (opts.floorOpacity ?? 1) < 1,
    opacity: Math.max(0, Math.min(1, opts.floorOpacity ?? 1)),
    depthWrite: (opts.floorOpacity ?? 1) >= 1,
  });
  matFloor.userData.sceneReflection = true;
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
  const matCabinetBack = matPack.matCabinetBack;
  const matPlinth = matPack.matPlinth;
  const matCountertop = matPack.matCountertop;
  const matDoorRevealDark = matPack.matDoorRevealDark;
  const defaultCabFinish: CabinetFinishId = project.cabinetFinish || 'warm-white';
  const matDoorModern = matPack.getDoorMaterial(defaultCabFinish, 'flat', doorOpenProgress < 0.08, false);
  // Both clear and frosted glazing allow the cabinet interior to remain
  // visible as appropriate, without a separate transmission render pass.
  const matGlass = new THREE.MeshPhysicalMaterial({
    color: 0xeaf6ff, transparent: true, opacity: 0.16,
    depthWrite: false, side: THREE.DoubleSide, roughness: 0.07,
    metalness: 0.08, clearcoat: 0.7,
  });
  const matFrostedGlass = new THREE.MeshPhysicalMaterial({
    color: 0xd7e1e8, transparent: true, opacity: 0.75,
    depthWrite: false, side: THREE.DoubleSide,
    roughness: 0.78, metalness: 0.01, clearcoat: 0.05,
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
  const matShelf = matCarcass;
  const matSteel = new THREE.MeshStandardMaterial({
    color: 0x969da6,
    roughness: 0.38,
    metalness: 0.84,
    envMapIntensity: 1.18,
  });
  const equipmentFinish = project.settings?.equipmentFinish ?? 'silver';
  const equipmentColor = equipmentFinish === 'white' ? 0xe7e9ea : equipmentFinish === 'black' ? 0x111419 : 0x969da6;
  const matEquipment = new THREE.MeshPhysicalMaterial({
    color: equipmentColor,
    roughness: equipmentFinish === 'silver' ? 0.43 : 0.42,
    metalness: equipmentFinish === 'silver' ? 0.92 : 0.12,
    normalMap: getEquipmentEdgeNormalMap(),
    normalScale: new THREE.Vector2(equipmentFinish === 'silver' ? 1.9 : 1.35, equipmentFinish === 'silver' ? 1.9 : 1.35),
    clearcoat: equipmentFinish === 'silver' ? 0.24 : 0.38,
    clearcoatRoughness: 0.24,
    envMapIntensity: equipmentFinish === 'silver' ? 1.25 : 1.10,
  });
  const matPorcelain = new THREE.MeshPhysicalMaterial({
    color: 0xf5f2ec,
    roughness: 0.18,
    clearcoat: 0.6,
    envMapIntensity: 1.45,
  });
  const matDarkChrome = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.22,
    metalness: 0.85,
    envMapIntensity: 1.55,
  });
  const matHiddenTrim = new THREE.MeshStandardMaterial({
    color: 0x252932,
    roughness: 0.52,
    metalness: 0.15,
  });
  const matGlassCooktop = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.1,
    metalness: 0.28,
    envMapIntensity: 1.7,
  });
  const matHandleGizmo = new THREE.MeshStandardMaterial({
    color: 0x4f46e5,
    roughness: 0.3,
    metalness: 0.2,
  });
  const matDrawerGizmo = new THREE.MeshStandardMaterial({
    color: 0x0f766e,
    emissive: 0x0f766e,
    emissiveIntensity: 0.28,
    roughness: 0.28,
    metalness: 0.2,
  });
  const matSeamGizmo = new THREE.MeshStandardMaterial({
    color: 0x059669,
    emissive: 0x059669,
    emissiveIntensity: 0.28,
    roughness: 0.28,
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
  const vertices = deriveFloorPolygon(project.walls);
  if (!opts.hideFloor) {
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

  const ceilingHeightM = (project.settings?.wallHeightCm ?? project.walls[0]?.height ?? 265) * CM;
  const ceilingIntensity = project.settings?.ceilingAreaIntensity ??
    (project.settings?.ceilingLightIntensities?.[0] ?? 12);
  const ceilingControls = addCeilingFillLights(root, vertices, ceilingHeightM, ceilingIntensity);
  const kitchenLightMode = getKitchenCabinetLightMode(project);

  const stripMaterial = new THREE.MeshBasicMaterial({ color: 0xffdfb6 });
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
    const bsSpans = computeWallBacksplashSpans(wall, project.walls, project.cornerOwners);
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
      if (project.selectedSurface === 'backsplash') {
        addOutlineHighlight(wallGrp, spanW, spanH, 0.02, bsMesh.position.x, bsMesh.position.y, bsMesh.position.z);
      }
    }

    const blockedZones = getCornerBlockedZonesForWall(wall, project.walls, project.cornerOwners);

    const uppers = wall.boxes.filter(b => b.type === 'wall' || b.type === 'wall-deep')
      .sort((a, b) => a.elevY - b.elevY || a.depth - b.depth || a.offsetX - b.offsetX);
    const runs: Array<{
      start: number; end: number; elevation: number; height: number; depth: number;
      mode: ReturnType<typeof getCabinetLighting>['mode']; intensity: number; boxIds: string[];
    }> = [];
    for (const box of uppers) {
      const { intensity } = getCabinetLighting(box);
      const mode = getCabinetLighting(box).mode;
      runs.push({
        start: box.offsetX, end: box.offsetX + box.width, elevation: box.elevY, height: box.height,
        depth: box.depth, mode, intensity, boxIds: [box.id],
      });
    }
    for (const run of runs) {
      // Exactly one continuous strip / area light per upper-cabinet box.
      const length = Math.max(0.08, (run.end - run.start) * CM - 0.006);
      const y = run.elevation * CM - 0.009;
      const x = (run.start + run.end) * CM / 2;
      const z = normalSign * Math.min(0.055, run.depth * CM / 2);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(length, 0.015, 0.028), stripMaterial);
      strip.position.set(x, y, z);
      strip.userData = { kind: 'under-cabinet-light', wallId: wall.id, lightBoxIds: run.boxIds } satisfies Scene3DHitData;
      wallGrp.add(strip);
      interactables.push(strip);

      // Both lamp types are created once; later switches only set group visibility.
      const linearGroup = new THREE.Group();
      const area = new THREE.RectAreaLight(0xffdfb6, 0, length, 0.045);
      area.position.set(x, y - 0.022, normalSign * 0.09);
      area.lookAt(x, y - 0.32, normalSign * 0.008);
      linearGroup.add(area);
      wallGrp.add(linearGroup);
      linearControls.push({ boxId: run.boxIds[0], group: linearGroup, strip, area });

      const halogenGroup = new THREE.Group();
      const decals: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
      // Render the same soft cones on backsplash tiles but without any
      // per-fixture SpotLights. One controllable strip belongs to each box.
      const count = Math.min(6, Math.max(1, Math.ceil(length / 1)));
      for (let i = 0; i < count; i++) {
        const spotX = run.start * CM + length * (i + 0.5) / count;
        decals.push(addKitchenLightDecal(halogenGroup,
          spotX, y - 0.28, normalSign * 0.020,
          Math.min(0.75, length / count + 0.22), 0.68, 0xffdfb6));
      }
      wallGrp.add(halogenGroup);
      halogenControls.push({ boxId: run.boxIds[0], group: halogenGroup, decals });
    }

    // Each upper box owns its facade fake spotlight(s), controlled in its own inspector.
    for (const box of uppers) {
      const hasTierAbove = uppers.some(upper => upper.id !== box.id &&
        upper.elevY >= box.elevY + box.height - 1 &&
        upper.offsetX < box.offsetX + box.width - 1 &&
        upper.offsetX + upper.width > box.offsetX + 1);
      if (hasTierAbove) continue;
      const group = new THREE.Group();
      const decals: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
      const width = box.width * CM;
      const count = Math.min(8, Math.max(1, Math.ceil(width)));
      for (let index = 0; index < count; index++) {
        const x = (box.offsetX + box.width * (index + 0.5) / count) * CM;
        // Physical beam top begins at the box crown, not the center of the door.
        const height = Math.min(1.1, box.height * CM * 0.9);
        const top = (box.elevY + box.height) * CM + 0.045;
        decals.push(addKitchenLightDecal(group, x, top - height / 2,
          normalSign * (box.depth * CM + 0.035), Math.min(0.80, width / count + 0.18), height));
      }
      wallGrp.add(group);
      facadeControls.push({ boxId: box.id, group, decals });
    }

    // Render all Cabinet Boxes on this wall    // Render all Cabinet Boxes on this wall
    for (const box of wall.boxes) {
      const isBoxSel =
        box.id === project.activeBoxId ||
        Boolean(project.multiSelection?.boxIds.includes(box.id));

      const boxMats = {
        matCarcass, matCabinetBack, matEquipment, matPlinth, matCountertop,
        matDoorRevealDark, matDoorModern, matGlass, matFrostedGlass,
        matFrame, matDivider, matShelf, matSteel, matDarkChrome,
        matHiddenTrim, matHandleGizmo, matDrawerGizmo, matSeamGizmo,
      };
      let boxGrp = buildBox3D({
        wall,
        box,
        normalSign,
        doorsHidden,
        doorOpenProgress,
        isBoxSel,
        tool: opts.tool,
        project,
        blockedZones,
        animatedDoors,
        interactables,
        matPack,
        deferEquipment: opts.deferEquipment ? job => deferredEquipmentJobs.push(job) : undefined,
        mats: boxMats,
      });
      wallGrp.add(boxGrp);
      if (box.type === 'fridge') {
        fridgeViews.set(wall.id + '/' + box.id, {
          model: box.fridgeModel,
          refresh(nextWall, nextBox, nextProject) {
            // The room geometry key confirms that the fridge cabinet's size
            // and its surrounding frame have not changed.
            const oldGroup = boxGrp;
            const oldNodes = new Set<THREE.Object3D>();
            oldGroup.traverse(node => oldNodes.add(node));
            for (let i = interactables.length - 1; i >= 0; i--) {
              if (oldNodes.has(interactables[i])) interactables.splice(i, 1);
            }
            boxGrp = buildBox3D({
              wall: nextWall, box: nextBox, normalSign, doorsHidden,
              doorOpenProgress, isBoxSel, tool: opts.tool, project: nextProject,
              blockedZones, animatedDoors, interactables, matPack,
              mats: boxMats, // Build only this source model immediately
            });
            wallGrp.add(boxGrp);
            wallGrp.remove(oldGroup);
            disposeReplacedEquipment(oldGroup);
          },
        });
      }
    }

    // Continuous counter / top slab segments? Each base box carries its countertop mesh flush to neighbors,
    // now render all Appliances (Sink + Faucet, Gas + Hood, Dishwasher, Washing Machine)
    for (const app of wall.appliances) {
      const appHolder = new THREE.Group();
      wallGrp.add(appHolder);
      const installAppliance = (
        nextWall: Wall = wall,
        nextApp: ApplianceItem = app,
        nextProject: ProjectState = project,
      ) => {
        const oldGroups = [...appHolder.children];
        const oldNodes = new Set<THREE.Object3D>();
        for (const old of oldGroups) old.traverse(node => oldNodes.add(node));
        for (let i = interactables.length - 1; i >= 0; i--) {
          if (oldNodes.has(interactables[i])) interactables.splice(i, 1);
        }
        for (let i = cooktopControls.length - 1; i >= 0; i--) {
          if (cooktopControls[i].id === nextApp.id) cooktopControls.splice(i, 1);
        }
        const selected = nextApp.id === nextProject.selectedApplianceId;
        const appGrp = buildAppliance3D(
          nextWall, nextApp, normalSign, selected,
          selected ? (nextProject.selectedApplianceSubPart ?? null) : null,
          nextProject.settings?.equipmentFinish ?? 'silver',
          matsForApps({
            matSteel, matDarkChrome, matGlassCooktop, matCarcass,
            matDoorModern: matPorcelain, matEquipment, matGlass,
          }),
          cooktopControls,
        );
        const appHitData = { kind: 'appliance', wallId: nextWall.id, appId: nextApp.id } as Scene3DHitData;
        appGrp.userData = appHitData;
        appGrp.traverse(ch => {
          if (!(ch instanceof THREE.Mesh)) return;
          const subPart = (ch.userData as Scene3DHitData | undefined)?.subPart;
          ch.userData = subPart ? { ...appHitData, subPart } : appHitData;
          interactables.push(ch);
        });
        appHolder.add(appGrp);
        for (const old of oldGroups) {
          appHolder.remove(old);
          disposeReplacedEquipment(old);
        }
        registerOvenParts(appGrp);
      };
      applianceViews.set(wall.id + '/' + app.id, {
        signature: applianceAppearanceKey(app, project.settings?.equipmentFinish ?? 'silver'),
        refresh: installAppliance,
      });
      if (opts.deferEquipment) deferredEquipmentJobs.push(() => installAppliance());
      else installAppliance();
    }

    root.add(wallGrp);
    bounds.expandByObject(wallGrp);
  }

  // Freestanding structural columns placed on the room floor
  for (const col of project.columns || []) {
    const cw = Math.max(0.15, col.widthCm * CM);
    const cd = Math.max(0.1, col.depthCm * CM);
    const ch = Math.max(0.4, col.heightCm * CM);
    const colGrp = new THREE.Group();
    const colMesh = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, cd), matWall);
    colMesh.position.set(col.xCm * CM, ch / 2, col.yCm * CM);
    colMesh.castShadow = true;
    colMesh.receiveShadow = true;
    const colHit: Scene3DHitData = { kind: 'column', wallId: '', columnId: col.id };
    colMesh.userData = colHit;
    colGrp.add(colMesh);
    interactables.push(colMesh);
    if (col.id === project.selectedColumnId) {
      addOutlineHighlight(colGrp, cw, ch, cd, col.xCm * CM, ch / 2, col.yCm * CM);
    }
    root.add(colGrp);
    bounds.expandByObject(colGrp);
  }

  const diningSets = project.diningSets ?? [];
  if (diningSets.length) {
    const diningMaterials = createDiningMaterials(opts.onTextureReady);
    for (const item of diningSets) {
      const set = item.kind === 'tv' ? buildTelevisionSet3D(diningMaterials.wood, matHiddenTrim, matGlassCooktop)
        : buildDining3D(item.seats, diningMaterials, item.shape);
      set.position.set(item.xCm * CM, 0, item.yCm * CM);
      set.rotation.y = -item.rotation * Math.PI / 180;
      const hit: Scene3DHitData = { kind: 'dining', wallId: '', diningId: item.id };
      set.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return;
        node.userData = hit;
        interactables.push(node);
      });
      root.add(set);
      const setBounds = new THREE.Box3().setFromObject(set);
      bounds.union(setBounds);
      if (project.selectedDiningId === item.id) {
        const outline = new THREE.Box3Helper(setBounds, 0x6366f1);
        root.add(outline);
      }
    }
  }

  // Solid architectural infill for upper cabinet corners (wall & wall-deep) so L/U upper corners are never hollow
  const cornerInfills = buildUpperCornerInfills3D(project, matPack, doorOpenProgress);
  if (cornerInfills.children.length > 0) {
    root.add(cornerInfills);
    bounds.expandByObject(cornerInfills);
  }

  const sceneMaterials = new Set<THREE.MeshStandardMaterial>();
  root.traverse(obj => {
    if (!(obj instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(obj.material) ? obj.material : [obj.material]) {
      if (material instanceof THREE.MeshStandardMaterial) sceneMaterials.add(material);
    }
  });
  sceneMaterials.forEach(limitKitchenHdrIrradiance);

  // Cache direct references so changing a light never reconstructs cabinets or geometry.
  const ovenParts = new Map<string, { light?: THREE.PointLight; cavity?: THREE.MeshStandardMaterial; glass?: THREE.MeshPhysicalMaterial }>();
  registerOvenParts = group => {
    group.traverse(node => {
      const id = node.userData.ovenControlId as string | undefined;
      if (!id) return;
      const part = ovenParts.get(id) ?? {};
      if (node.userData.ovenControlPart === 'light' && node instanceof THREE.PointLight) part.light = node;
      if (node.userData.ovenControlPart === 'cavity' && node instanceof THREE.Mesh) part.cavity = node.material as THREE.MeshStandardMaterial;
      if (node.userData.ovenControlPart === 'glass' && node instanceof THREE.Mesh) part.glass = node.material as THREE.MeshPhysicalMaterial;
      ovenParts.set(id, part);
    });
  };
  registerOvenParts(root);
  const updateLighting = (next: ProjectState, stage = 3) => {
    const settings = next.settings;
    const boxLights = new Map(next.walls.flatMap(wall => wall.boxes.map(box => [box.id, getCabinetLighting(box)] as const)));
    const facadeEnabled = new Map(next.walls.flatMap(wall => wall.boxes.map(box => [box.id, Boolean(box.facadeLightEnabled)] as const)));
    for (const item of linearControls) {
      const visible = stage >= 4 && boxLights.get(item.boxId)?.mode === 'linear';
      item.group.visible = visible;
      item.strip.visible = visible;
      item.area.intensity = (boxLights.get(item.boxId)?.intensity ?? 1) * (settings?.linearLightIntensity ?? 5);
    }
    for (const item of halogenControls) {
      item.group.visible = stage >= 4 && boxLights.get(item.boxId)?.mode === 'halogen';
      const intensity = (boxLights.get(item.boxId)?.intensity ?? 1) * (settings?.halogenLightIntensity ?? 1);
      item.decals.forEach(decal => { decal.material.opacity = Math.min(0.78, Math.max(0, 0.35 * intensity)); });
    }
    for (const item of facadeControls) {
      item.group.visible = stage >= 4 && facadeEnabled.get(item.boxId) === true;
      item.decals.forEach(decal => { decal.material.opacity = Math.min(0.8, Math.max(0, 0.35 * (settings?.facadeLightIntensity ?? 1))); });
    }
    ceilingControls.forEach(light => { light.intensity = settings?.ceilingAreaIntensity ?? settings?.ceilingLightIntensities?.[0] ?? 12; });
    const cooktopStates = new Map(next.walls.flatMap(w => w.appliances
      .filter(a => a.kind === 'gas').map(a => [a.id, Boolean(a.flameOn)] as const)));
    for (const control of cooktopControls) control.setLit(cooktopStates.get(control.id) ?? false);
    for (const wall of next.walls) for (const appliance of wall.appliances) {
      const parts = ovenParts.get(appliance.id);
      if (!parts) continue;
      const on = Boolean(appliance.ovenLightOn);
      if (parts.light) parts.light.visible = stage >= 1 && on;
      if (parts.cavity) {
        parts.cavity.color.setHex(on ? 0xffd28a : 0x161920);
        parts.cavity.emissiveIntensity = on ? 0.012 : 0;
      }
      if (parts.glass) {
        parts.glass.color.setHex(on ? 0xfde68a : 0x090d16);
        parts.glass.emissiveIntensity = on ? 0.0045 : 0;
        parts.glass.opacity = on ? 0.34 : 0.84;
        parts.glass.metalness = on ? 0.1 : 0.25;
      }
    }
  };
  let syncAo: (() => void) | undefined;
  const activateOcclusion = () => {
    if (syncAo || project.settings?.ambientOcclusion === false) return;
    syncAo = bakeKitchenOcclusion(root, bounds,
      new Set(animatedDoors.map(part => part.group)), kitchenOcclusionGeometryKey(project));
    if (syncAo) root.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      for (const mat of Array.isArray(node.material) ? node.material : [node.material]) {
        if (mat instanceof THREE.MeshStandardMaterial) mat.needsUpdate = true;
      }
    });
  };
  updateLighting(project, opts.deferOcclusion ? 0 : 3);
  if (!opts.deferOcclusion) activateOcclusion();

  const updateEquipment = (next: ProjectState): boolean => {
    let changed = false;
    for (const nextWall of next.walls) {
      for (const item of nextWall.appliances) {
        const view = applianceViews.get(nextWall.id + '/' + item.id);
        if (!view) continue;
        const signature = applianceAppearanceKey(item, next.settings?.equipmentFinish ?? 'silver');
        if (view.signature !== signature) {
          view.refresh(nextWall, item, next);
          view.signature = signature;
          changed = true;
        }
      }
      for (const box of nextWall.boxes) {
        if (box.type !== 'fridge') continue;
        const view = fridgeViews.get(nextWall.id + '/' + box.id);
        if (view && view.model !== box.fridgeModel) {
          view.refresh(nextWall, box, next);
          view.model = box.fridgeModel;
          changed = true;
        }
      }
    }
    if (changed) updateLighting(next, 4);
    return changed;
  };
  return { root, interactables, animatedDoors, wallTransforms, bounds,
    deferredEquipmentJobs, updateEquipment,
    syncOcclusion: () => syncAo?.(), activateOcclusion, updateLighting };
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
        // Fill empty corner space only. Extending into an existing cabinet duplicates its faces.
        const coverA = Math.min(nearA.dist, geom.getSetbackCm(depthB));
        const coverB = Math.min(nearB.dist, geom.getSetbackCm(depthA));
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
    const colD = Math.max(0.1, (op.depthCm ?? DEFAULT_COLUMN_DEPTH_CM) * CM);
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
  tool?: ToolId;
  project: ProjectState;
  blockedZones: ReturnType<typeof getCornerBlockedZonesForWall>;
  animatedDoors: AnimatedDoorHandle[];
  interactables: THREE.Object3D[];
  matPack: KitchenMaterialPack;
  deferEquipment?: (job: () => void) => void;
  mats: {
    matCarcass: THREE.Material;
    matCabinetBack: THREE.Material;
    matEquipment: THREE.Material;
    matPlinth: THREE.Material;
    matCountertop: THREE.Material;
    matDoorRevealDark: THREE.Material;
    matDoorModern: THREE.Material;
    matGlass: THREE.Material;
    matFrostedGlass: THREE.Material;
    matFrame: THREE.Material;
    matDivider: THREE.Material;
    matShelf: THREE.Material;
    matSteel: THREE.Material;
    matDarkChrome: THREE.Material;
    matHiddenTrim: THREE.Material;
    matHandleGizmo: THREE.Material;
    matDrawerGizmo: THREE.Material;
    matSeamGizmo: THREE.Material;
  };
}): THREE.Group {
  const { wall, box, normalSign, doorsHidden, doorOpenProgress, isBoxSel, tool, project, blockedZones, animatedDoors, interactables, matPack, mats } = ctx;
  const grp = new THREE.Group();
  grp.userData = { kind: 'box', wallId: wall.id, boxId: box.id } as Scene3DHitData;

  const boxFinish: CabinetFinishId = box.finish || project.cabinetFinish || 'warm-white';
  const boxBodyMat = matPack.getCabinetBodyMaterial(boxFinish, box);

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
    const hasFridgeFrame = box.hasFridgeFrame ?? doesFridgeTouchCabinet(wall, box);
    const ff = hasFridgeFrame ? FRIDGE_FRAME_CM * CM : 0;
    // Regular enclosures are 60 or 80cm deep. The fridge front ALWAYS
    // protrudes at least 15cm in front of this surround. Concealed fronts
    // are MDF-finished and flush with the extended surround instead.
    const frameDepth = box.fridgeConcealed ? bd :
      (box.fridgeFrameDepthCm === 80 ? 0.80 : 0.60);

    if (ff > 0) {
      const fLeft = new THREE.Mesh(new THREE.BoxGeometry(ff, bh, frameDepth), boxBodyMat);
      fLeft.position.set(bx + ff / 2, by + bh / 2, normalSign * (frameDepth / 2));
      const fRight = new THREE.Mesh(new THREE.BoxGeometry(ff, bh, frameDepth), boxBodyMat);
      fRight.position.set(bx + bw - ff / 2, by + bh / 2, normalSign * (frameDepth / 2));
      const fTop = new THREE.Mesh(new THREE.BoxGeometry(bw, ff, frameDepth), boxBodyMat);
      fTop.position.set(bx + bw / 2, by + bh - ff / 2, normalSign * (frameDepth / 2));
      fLeft.userData = fRight.userData = fTop.userData = { kind: 'box', wallId: wall.id, boxId: box.id } as Scene3DHitData;
      grp.add(fLeft, fRight, fTop);
      interactables.push(fLeft, fRight, fTop);
    }

    const fW = Math.max(0.4, bw - ff * 2 - (hasFridgeFrame ? .020 : 0));
    const fH = Math.max(1.2, cfg.height * CM);
    const fD = box.fridgeConcealed ? frameDepth - 0.042 : bd - 0.045;
    if (!box.fridgeConcealed) {
      // Install the ORIGINAL supplied fridge design. None of the former
      // primitive refrigerator bodies/doors are rendered for visible fridges.
      const installFridge = () => {
      const realFridge = fitAppliance(makeFridge(box.fridgeModel), {
        // Cabinet depth is not the fridge's physical body depth.
        w: fW, h: fH, d: fridgeDepthCm(box.fridgeModel) * CM,
      }, normalSign);
      const visualDepth = new THREE.Box3().setFromObject(realFridge).getSize(new THREE.Vector3()).z;
      const frontCm = fridgeFrontCm(box.fridgeModel, frameDepth / CM);
      realFridge.position.set(bx + bw / 2, by,
        normalSign * (frontCm * CM - visualDepth / 2));
      const hitData = { kind: 'box', wallId: wall.id, boxId: box.id } as Scene3DHitData;
      realFridge.traverse(child => {
        if (!(child instanceof THREE.Mesh)) return;
        child.userData = hitData;
        interactables.push(child);
      });
      grp.add(realFridge);
      };
      if (ctx.deferEquipment) ctx.deferEquipment(installFridge);
      else installFridge();
      if (isBoxSel) {
        addOutlineHighlight(grp, bw, bh, bd, bx + bw / 2, by + bh / 2, normalSign * (bd / 2));
        addBox3DHandles(grp, wall.id, box, bodyBottomY, bh, bd, normalSign, mats.matHandleGizmo, interactables);
      }
      return grp;
    }
    const doorThick = 0.036;
    const cx = bx + bw / 2;
    // Concealed MDF front must be flush with the full-depth surround.
    const frontDoorZ = normalSign * (frameDepth - doorThick / 2);

    const matBrushedInox = box.fridgeConcealed
      ? matPack.getDoorMaterial(boxFinish, 'flat', true, false, box)
      : mats.matEquipment;
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
    if (!box.fridgeConcealed) grp.add(ventBase);
    for (let sIdx = -2; sIdx <= 2; sIdx++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(fW - 0.08, 0.006, 0.008), mats.matSteel);
      slat.position.set(cx, by + ventH * 0.5 + sIdx * 0.011, normalSign * (fD + doorThick * 0.7));
      if (!box.fridgeConcealed) grp.add(slat);
    }

    const addFridgeHandle = (hx: number, hy: number, hLen: number) => {
      if (box.fridgeConcealed) return;
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
      if (box.fridgeConcealed) return;
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

    if (model === 'single-door') {
      const singleD = new THREE.Mesh(new THREE.BoxGeometry(fW - 0.012, leavesH, doorThick), matBrushedInox);
      singleD.position.set(cx, leavesMidY, frontDoorZ);
      singleD.castShadow = true;
      singleD.userData = { kind: 'box', wallId: wall.id, boxId: box.id } as Scene3DHitData;
      grp.add(singleD);
      interactables.push(singleD);

      const hingeCap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.045), mats.matDarkChrome);
      hingeCap.position.set(cx - fW * 0.42, by + fH - 0.002, normalSign * (fD + 0.015));
      if (!box.fridgeConcealed) grp.add(hingeCap);
      addFridgeHandle(cx + fW * 0.37, leavesMidY + leavesH * 0.05, leavesH * 0.62);
    } else if (model === 'single') {
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
      if (!box.fridgeConcealed) grp.add(hingeCap);
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
      if (!box.fridgeConcealed) grp.add(capL, capR);

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
      if (!box.fridgeConcealed) grp.add(capL, capR);

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
              effectiveHoodKind(wall, a) !== 'hidden' &&
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
    const pLeft = new THREE.Mesh(new THREE.BoxGeometry(board, bodyH, carcD),
      [mats.matCarcass, boxBodyMat, boxBodyMat, boxBodyMat, boxBodyMat, boxBodyMat]);
    pLeft.position.set(bx + board / 2, bodyCenterY, cz);
    carcassMeshes.push(pLeft);
  }
  if (solidHorizSpans.some((sp) => sp.e >= box.width - 2)) {
    const pRight = new THREE.Mesh(new THREE.BoxGeometry(board, bodyH, carcD),
      [boxBodyMat, mats.matCarcass, boxBodyMat, boxBodyMat, boxBodyMat, boxBodyMat]);
    pRight.position.set(bx + bw - board / 2, bodyCenterY, cz);
    carcassMeshes.push(pRight);
  }

  const sinkBowls = box.type === 'base' ? wall.appliances
    .filter(app => app.kind === 'sink' && app.offsetX >= box.offsetX - 0.1 &&
      app.offsetX + app.width <= box.offsetX + box.width + 0.1)
    .flatMap(app => sinkFootprint(app, bd, normalSign).bowls) : [];

  // Cooktops are surface mounted: the black/steel plate rests on uninterrupted
  // countertop stone. Only actual sinks cut through the slab.
  const countertopCutouts = sinkBowls;

  for (const sp of solidHorizSpans) {
    const spanW = (sp.e - sp.s) * CM;
    if (spanW < 0.04) continue;
    const midX = bx + (sp.s + (sp.e - sp.s) / 2) * CM;
    const pBot = new THREE.Mesh(new THREE.BoxGeometry(spanW, board, carcD), mats.matCarcass);
    pBot.position.set(midX, bodyBottomY + board / 2, cz);
    const pTopGeo = sinkBowls.length
      ? normalizeCountertopExtrudeUVs(sinkSlabGeometry(midX, cz, spanW, carcD, board, sinkBowls, 0), board)
      : new THREE.BoxGeometry(spanW, board, carcD);
    const pTop = new THREE.Mesh(pTopGeo, mats.matCarcass);
    if (sinkBowls.length) pTop.position.y = bodyBottomY + bodyH - board;
    else pTop.position.set(midX, bodyBottomY + bodyH - board / 2, cz);
    const pBack = new THREE.Mesh(new THREE.BoxGeometry(spanW, bodyH - board * 2, 0.01), mats.matCabinetBack);
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

  // 4. Countertop Stone Slab (flush width, corner overhang trim, independent top/bottom front edge profiles)
  if (topPadM > 0.005) {
    const slabD = bd + 0.02;
    const ctTopEdge = project.settings?.countertopTopEdge ?? 'square';
    const ctBottomEdge = project.settings?.countertopBottomEdge ?? 'square';

    // Trim 2cm where an owner perpendicular wall's base countertop overhangs into a non-owner corner start/end
    let trimLeftM = 0;
    let trimRightM = 0;
    const cornerJunctions = detectCornerJunctions(project.walls, project.cornerOwners);
    for (const z of blockedZones) {
      if (z.tier !== 'lower' || z.role !== 'side-profile') continue;
      const j = cornerJunctions.find((cj) => cj.key === z.cornerKey);
      if (!j || j.ownerWallId === wall.id) continue;
      const ownerWall = project.walls.find((ow) => ow.id === j.ownerWallId);
      const ownerEnd = j.wallAId === ownerWall?.id ? j.wallAEnd : j.wallBEnd;
      const ownerHasCountertopAtCorner = Boolean(
        ownerWall?.boxes.some(
          (ob) =>
            ob.type === 'base' &&
            ob.countertopCm > 0 &&
            (ownerEnd === 'start' ? ob.offsetX <= 5 : ob.offsetX + ob.width >= ownerWall.length - 5)
        )
      );
      if (!ownerHasCountertopAtCorner) continue;
      if (z.startCm <= 1 && Math.abs(box.offsetX - z.endCm) <= 1.2) {
        trimLeftM = Math.max(trimLeftM, 0.02);
      }
      if (z.endCm >= wall.length - 1 && Math.abs(box.offsetX + box.width - z.startCm) <= 1.2) {
        trimRightM = Math.max(trimRightM, 0.02);
      }
    }

    const slabStartX = bx + trimLeftM;
    const slabW = Math.max(0.04, bw - trimLeftM - trimRightM);
    const slabSign: 1 | -1 = normalSign >= 0 ? 1 : -1;
    const slabGeo = countertopCutouts.length
      ? createSinkCountertopGeometry({
          startX: slabStartX,
          width: slabW,
          depth: slabD,
          thickness: topPadM,
          normalSign: slabSign,
          topEdge: ctTopEdge,
          bottomEdge: ctBottomEdge,
          bowls: countertopCutouts,
        })
      : createCountertopSectionGeometry({
          startX: slabStartX,
          width: slabW,
          zStart: 0,
          zEnd: slabD,
          thickness: topPadM,
          normalSign: slabSign,
          topEdge: ctTopEdge,
          bottomEdge: ctBottomEdge,
        });

    const slab = new THREE.Mesh(slabGeo, mats.matCountertop);
    slab.position.y = bodyBottomY + bodyH;
    slab.castShadow = true;
    slab.receiveShadow = true;
    slab.userData = { kind: 'countertop', wallId: wall.id, boxId: box.id } as Scene3DHitData;
    grp.add(slab);
    interactables.push(slab);
    if (project.selectedSurface === 'countertop') {
      addOutlineHighlight(
        grp,
        slabW,
        topPadM,
        slabD,
        slabStartX + slabW / 2,
        bodyBottomY + bodyH + topPadM / 2,
        slabSign * (slabD / 2)
      );
    }
  }

  // Compute inner frame insets
  const rawIn = getBoxFrameInsets(box);
  const scaleX = Math.max(0.2, (box.width - rawIn.left - rawIn.right) / Math.max(1, box.width));
  const innerBottomY = bodyBottomY + rawIn.bottom * CM;
  const innerH = Math.max(0.08, bodyH - (rawIn.top + rawIn.bottom) * CM);
  const frontFaceZ = normalSign * (carcD + 0.01);

  const colSpans = getWallColumnSpans(wall, project.columns || []);

  // 5. Perimeter / Seam Frames (excluding seam frames colliding with columns)
  for (const fr of box.frames || []) {
    if (fr.side === 'seam' && fr.seamCm !== undefined) {
      const inCol = colSpans.some(
        (cs) =>
          box.elevY < cs.elevY + cs.height - 1 &&
          box.elevY + box.height > cs.elevY + 1 &&
          fr.seamCm! >= cs.startCm - box.offsetX - 1.5 &&
          fr.seamCm! <= cs.endCm - box.offsetX + 1.5
      );
      if (inCol) continue;
    }
    const fM = fr.widthCm * CM;
    const isFSel = fr.id === project.selectedFrameId;
    const fMat = fr.color ? new THREE.MeshStandardMaterial({ color: fr.color, roughness: 0.4 }) : isFSel ? mats.matHandleGizmo : mats.matFrame;
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

  // 6. Unit Dividers (3.2cm) — skip any divider inside blind inside-corners or structural columns
  for (const uCm of box.unitDividers) {
    if (isDividerNearBlockedCorner(box, uCm, blockedZones)) continue;
    const inCol = colSpans.some(
      (cs) =>
        box.elevY < cs.elevY + cs.height - 1 &&
        box.elevY + box.height > cs.elevY + 1 &&
        uCm >= cs.startCm - box.offsetX - 1.5 &&
        uCm <= cs.endCm - box.offsetX + 1.5
    );
    if (inCol) continue;

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

  const jointWidth = 0.0022;
  const backFaceZ = normalSign * 0.0116;
  const joints: JointLine[] = [];
  for (const span of solidHorizSpans) {
    const left = bx + span.s * CM + board;
    const right = bx + span.e * CM - board;
    if (right <= left) continue;
    const midX = (left + right) / 2;
    joints.push([right - left, jointWidth, midX, bodyBottomY + board, backFaceZ],
      [right - left, jointWidth, midX, bodyBottomY + bodyH - board, backFaceZ],
      [jointWidth, bodyH - 2 * board, left, bodyCenterY, backFaceZ],
      [jointWidth, bodyH - 2 * board, right, bodyCenterY, backFaceZ]);
  }
  for (const divider of box.unitDividers) {
    if (isDividerNearBlockedCorner(box, divider, blockedZones)) continue;
    const x = bx + (rawIn.left + divider * scaleX) * CM;
    if (!solidHorizSpans.some(span => x > bx + span.s * CM && x < bx + span.e * CM)) continue;
    for (const side of [-1, 1]) joints.push([jointWidth, innerH, x + side * 0.016, innerBottomY + innerH / 2, backFaceZ]);
  }

  // 7. Interior Shelves (horizontal shelves & vertical partitions)
  for (const sh of box.shelves) {
    const isShSel = sh.id === project.selectedShelfId;
    if (sh.orient === 'vertical') {
      const xCm = sh.startCm + (sh.xRatio ?? 0.5) * (sh.endCm - sh.startCm);
      const vx = bx + (rawIn.left + xCm * scaleX) * CM;
      const vh = Math.max(0.08, innerH - 0.02);
      const vMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.018, vh, carcD - 0.04),
        isShSel ? mats.matHandleGizmo : mats.matShelf
      );
      vMesh.position.set(vx, innerBottomY + innerH / 2, normalSign * ((carcD - 0.04) / 2 + 0.01));
      joints.push([jointWidth, vh, vx - 0.009, vMesh.position.y, backFaceZ], [jointWidth, vh, vx + 0.009, vMesh.position.y, backFaceZ]);
      vMesh.userData = { kind: 'shelf', wallId: wall.id, boxId: box.id, shelfId: sh.id } as Scene3DHitData;
      grp.add(vMesh);
      interactables.push(vMesh);
      continue;
    }

    const sx = bx + (rawIn.left + sh.startCm * scaleX) * CM;
    const sw = Math.max(0.06, (sh.endCm - sh.startCm) * scaleX * CM - 0.032);
    const sy = innerBottomY + innerH * (1 - sh.yRatio);
    const shMesh = new THREE.Mesh(
      new THREE.BoxGeometry(sw, 0.018, carcD - 0.04),
      isShSel ? mats.matHandleGizmo : mats.matShelf
    );
    shMesh.position.set(sx + sw / 2 + 0.016, sy, normalSign * ((carcD - 0.04) / 2 + 0.01));
    joints.push([sw, jointWidth, shMesh.position.x, sy + 0.009, backFaceZ]);
    shMesh.userData = { kind: 'shelf', wallId: wall.id, boxId: box.id, shelfId: sh.id } as Scene3DHitData;
    grp.add(shMesh);
    interactables.push(shMesh);
  }

  if (!doorsHidden) {
    const frontZ = normalSign * (carcD - 0.002);
    const fronts = box.doors.filter(door => door.kind !== 'open' && door.kind !== 'rail');
    const edges = new Set(fronts.flatMap(door => [door.startCm, door.startCm + door.widthCm]));
    for (const edge of edges) {
      const x = bx + (rawIn.left + edge * scaleX) * CM;
      joints.push([0.0045, innerH, x, innerBottomY + innerH / 2, frontZ]);
    }
    for (const door of fronts) {
      const x = bx + (rawIn.left + (door.startCm + door.widthCm / 2) * scaleX) * CM;
      const ratios = door.drawerBand
        ? [door.drawerBand.position === 'top' ? door.drawerBand.ratio : 1 - door.drawerBand.ratio]
        : door.drawerRatios;
      for (const ratio of [0, ...ratios, 1]) joints.push([door.widthCm * scaleX * CM, 0.003, x, innerBottomY + (1 - ratio) * innerH, frontZ]);
    }
  }
  addJointLines(grp, joints, mats.matDoorRevealDark);

  // 7b. Derived Carcass Carpentry (5cm corner fillers, outer/drawer 5cm stiles, base non-drawer top rails)
  const carpentry = getBoxCarpentryElements(box, wall, blockedZones, project.columns || []);
  for (const cp of carpentry) {
    const cxPos = bx + (rawIn.left + (cp.startCm + cp.widthCm / 2) * scaleX) * CM;
    const cw = Math.max(0.015, cp.widthCm * scaleX * CM + (cp.depthMode === 'corner-filler' ? 0.002 : 0));
    const ch = Math.max(0.02, Math.min(innerH, cp.heightCm * CM));
    const cyPos = innerBottomY + innerH - cp.topOffsetCm * CM - ch / 2;
    const depth = cp.depthMode === 'corner-filler' ? 0.022 : 0.018;
    const czPos =
      cp.depthMode === 'corner-filler'
        ? frontFaceZ - normalSign * 0.002
        : normalSign * (carcD - depth / 2);

    const cpMesh = new THREE.Mesh(
      new THREE.BoxGeometry(cw, ch, depth),
      boxBodyMat
    );
    cpMesh.position.set(cxPos, cyPos, czPos);
    cpMesh.castShadow = true;
    cpMesh.receiveShadow = true;
    cpMesh.userData = { kind: 'box', wallId: wall.id, boxId: box.id } as Scene3DHitData;
    grp.add(cpMesh);
    interactables.push(cpMesh);
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
    for (const door of box.doors) {
      buildDoor3D({
        wall,
        box,
        door,
        blockedZones,
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

    // 9b. 3D Drawer resize handles (40..110cm) and touching door seam resize handles in Select mode
    const showSelectHandles = tool === 'select' || (tool === undefined && Boolean(project.selectedDoorId));
    if (showSelectHandles) {
      const sortedDoors = [...box.doors].sort((a, b) => a.startCm - b.startCm);
      const gizmoZ = frontFaceZ + normalSign * 0.028;
      const midY = innerBottomY + innerH / 2;
      for (let di = 0; di < sortedDoors.length; di++) {
        const door = sortedDoors[di];
        const isDoorSel =
          door.id === project.selectedDoorId ||
          Boolean(project.multiSelection?.doorIds.includes(door.id));
        const dxLeft = bx + (rawIn.left + door.startCm * scaleX) * CM;
        const dwM = Math.max(0.05, door.widthCm * scaleX * CM);

        if (door.kind === 'drawer' && isDoorSel) {
          const mkDrawerPill = (px: number, edge: 'left' | 'right') => {
            const pill = new THREE.Mesh(
              new THREE.BoxGeometry(0.032, 0.16, 0.032),
              mats.matDrawerGizmo
            );
            pill.position.set(px, midY, gizmoZ);
            pill.renderOrder = 20;
            pill.userData = {
              kind: 'drawer-resize-handle',
              wallId: wall.id,
              boxId: box.id,
              doorId: door.id,
              edge,
            } as Scene3DHitData;
            grp.add(pill);
            interactables.push(pill);
          };
          mkDrawerPill(dxLeft, 'left');
          mkDrawerPill(dxLeft + dwM, 'right');
        }

        const nextDoor = di < sortedDoors.length - 1 ? sortedDoors[di + 1] : null;
        if (
          nextDoor &&
          door.kind !== 'fridge' &&
          door.kind !== 'drawer' &&
          nextDoor.kind !== 'drawer' &&
          Math.abs(door.startCm + door.widthCm - nextDoor.startCm) <= 1.2 &&
          (isBoxSel ||
            isDoorSel ||
            nextDoor.id === project.selectedDoorId ||
            Boolean(project.multiSelection?.doorIds.includes(nextDoor.id)))
        ) {
          const seamPill = new THREE.Mesh(
            new THREE.BoxGeometry(0.03, 0.17, 0.03),
            mats.matSeamGizmo
          );
          seamPill.position.set(dxLeft + dwM, midY, gizmoZ);
          seamPill.renderOrder = 20;
          seamPill.userData = {
            kind: 'door-seam-handle',
            wallId: wall.id,
            boxId: box.id,
            leftDoorId: door.id,
          } as Scene3DHitData;
          grp.add(seamPill);
          interactables.push(seamPill);
        }
      }
    }
  }

  // Selection wireframe + 3D move/resize handles
  if (isBoxSel) {
    addOutlineHighlight(grp, bw, bh, bd, bx + bw / 2, by + bh / 2, normalSign * (bd / 2));
    if (tool === 'move') {
      addBox3DHandles(grp, wall.id, box, by, bh, bd, normalSign, mats.matHandleGizmo, interactables);
    }
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
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(w, 0.095), Math.max(h, 0.095), Math.max(d, 0.06)),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.position.copy(m.position);
    hit.userData = m.userData;
    grp.add(hit);
    interactables.push(hit);
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

type JointLine = [width: number, height: number, x: number, y: number, z: number];

function addJointLines(group: THREE.Group, lines: JointLine[], material: THREE.Material) {
  if (!lines.length) return;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, lines.length);
  const transform = new THREE.Object3D();
  lines.forEach(([width, height, x, y, z], index) => {
    transform.position.set(x, y, z);
    transform.scale.set(width, height, 0.0014);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
}

function buildDoor3D(ctx: {
  wall: Wall;
  box: CabinetBox;
  door: DoorUnit;
  blockedZones: BlockedZone[];
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
    matCarcass: THREE.Material;
    matGlass: THREE.Material;
    matFrostedGlass: THREE.Material;
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
    blockedZones,
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

  // Exposed appliances (washing, builtin-oven, microwave) always show their appliance front
  if ((box.type === 'base' || box.type === 'tall') && wall.appliances.some((appliance) => {
    if (appliance.kind !== 'washing' && appliance.kind !== 'builtin-oven' && appliance.kind !== 'microwave') return false;
    const doorStart = box.offsetX + door.startCm;
    const doorEnd = doorStart + door.widthCm;
    const overlap = Math.max(0, Math.min(doorEnd, appliance.offsetX + appliance.width) - Math.max(doorStart, appliance.offsetX));
    return overlap > door.widthCm * 0.5;
  })) return;

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

  // 4cm corner filler clearance so doors abutting an inside-corner perpendicular cabinet never clash
  let cornerLeftTrimCm = 0;
  let cornerRightTrimCm = 0;
  const boxTier =
    box.type === 'wall' ? 'wall-lower' : box.type === 'wall-deep' ? 'wall-upper' : 'lower';
  for (const z of blockedZones) {
    const tierMatches =
      z.tier === boxTier || ((box.type === 'tall' || box.type === 'closet') && z.tier === 'lower');
    if (!tierMatches) continue;
    const ls = +(z.startCm - box.offsetX).toFixed(1);
    const le = +(z.endCm - box.offsetX).toFixed(1);
    if (door.widthCm >= 34 && Math.abs(door.startCm - le) <= 0.8) {
      cornerLeftTrimCm = Math.max(cornerLeftTrimCm, CORNER_FILLER_CM);
    }
    if (door.widthCm >= 34 && Math.abs(door.startCm + door.widthCm - ls) <= 0.8) {
      cornerRightTrimCm = Math.max(cornerRightTrimCm, CORNER_FILLER_CM);
    }
  }
  const effectiveStartCm = door.startCm + cornerLeftTrimCm;
  const effectiveWidthCm = Math.max(22, door.widthCm - cornerLeftTrimCm - cornerRightTrimCm);

  const dw = Math.max(0.05, effectiveWidthCm * scaleX * CM - 0.006);
  const dh = Math.max(0.08, innerH - apronExtraM - 0.006);
  const dxLeft = bx + (rawIn.left + effectiveStartCm * scaleX) * CM + 0.003;
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
  const doorFinish = door.finish ?? boxFinish;
  const doorAppearance = door.finish ? { reflection: box.reflection, roughness: box.roughness } : box;
  const doorMat = matPack.getDoorMaterial(doorFinish, dStyle, isClosed, isSel, doorAppearance);
  const doorEdgeMat = matPack.getDoorEdgeMaterial(doorFinish, isClosed, isSel);
  const doorBoxMats: THREE.Material[] = [doorEdgeMat, doorEdgeMat, doorEdgeMat, doorEdgeMat, doorMat, doorMat];
  const doorCncInnerMat = matPack.getDoorInnerCncMaterial(doorFinish, isSel);

  const doorHit: Scene3DHitData = {
    kind: 'door',
    wallId: wall.id,
    boxId: box.id,
    doorId: door.id,
  };

  // Flat door geometry is UNCHANGED. The sole extra vertex attribute tells
  // the fragment shader the physical dimensions, so the specular edge response
  // is 5mm on every panel; CNC bars and wooden lattice bars need it too.
  const addDoorNormalDimensions = (geometry: THREE.BoxGeometry, pw: number, ph: number) => {
    const attr = new Float32Array(geometry.getAttribute('position').count * 2);
    for (let i = 0; i < attr.length; i += 2) {
      attr[i] = pw;
      attr[i + 1] = ph;
    }
    geometry.setAttribute('cabinetDoorSize', new THREE.BufferAttribute(attr, 2));
    return geometry;
  };

  const makePanelMesh = (pw: number, ph: number, cx: number, cy: number, targetParent: THREE.Group, row = 0) => {
    const profile = box.handles.find(h => h.doorId === door.id && (h.rowIndex ?? 0) === row && h.style === 'f-profile');
    if (profile) {
      if (profile.orient === 'vertical') {
        const inset = Math.min(0.025, pw / 4);
        pw -= inset; cx += (profile.xRatio >= 0.5 ? -1 : 1) * inset / 2;
      } else {
        const inset = Math.min(0.025, ph / 4);
        ph -= inset; cy += (profile.yRatio <= 0.5 ? -1 : 1) * inset / 2;
      }
    }
    if (dStyle === 'glass' || dStyle === 'glass-frosted' || dStyle === 'glass-grid') {
      const woodGrid = dStyle === 'glass-grid';
      const st = Math.min(0.045, pw / 4, ph / 4);
      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(0.04, pw - (woodGrid ? st * 2 : 0)),
          Math.max(0.04, ph - (woodGrid ? st * 2 : 0)), 0.008),
        dStyle === 'glass-frosted' ? mats.matFrostedGlass : mats.matGlass
      );
      glass.position.set(cx, cy, 0);
      glass.userData = doorHit;
      targetParent.add(glass);
      interactables.push(glass);
      if (woodGrid) {
        // Physical glazing bars in the selected cabinet's wood/paint finish.
        const addBar = (w: number, h: number, x: number, y: number) => {
          const bar = new THREE.Mesh(addDoorNormalDimensions(new THREE.BoxGeometry(w, h, doorThick), w, h), doorMat);
          bar.position.set(cx + x, cy + y, 0);
          bar.castShadow = true;
          bar.userData = doorHit;
          targetParent.add(bar);
          interactables.push(bar);
        };
        addBar(pw, st, 0, ph / 2 - st / 2);
        addBar(pw, st, 0, -ph / 2 + st / 2);
        addBar(st, ph - 2 * st, -pw / 2 + st / 2, 0);
        addBar(st, ph - 2 * st, pw / 2 - st / 2, 0);
        const innerW = pw - 2 * st, innerH = ph - 2 * st;
        for (const side of [-1, 1]) {
          addBar(0.014, innerH, side * innerW / 6, 0);
          addBar(innerW, 0.014, 0, side * innerH / 6);
        }
      }
    } else if (dStyle === 'cnc') {
      const st = Math.min(0.055, pw * 0.16, ph / 4);
      const back = new THREE.Mesh(new THREE.BoxGeometry(pw, ph, doorThick * 0.72), doorCncInnerMat);
      back.position.set(cx, cy, -normalSign * 0.002);
      const topR = new THREE.Mesh(addDoorNormalDimensions(new THREE.BoxGeometry(pw, st, doorThick), pw, st), doorBoxMats);
      topR.position.set(cx, cy + ph / 2 - st / 2, 0);
      const botR = new THREE.Mesh(addDoorNormalDimensions(new THREE.BoxGeometry(pw, st, doorThick), pw, st), doorBoxMats);
      botR.position.set(cx, cy - ph / 2 + st / 2, 0);
      const lR = new THREE.Mesh(addDoorNormalDimensions(new THREE.BoxGeometry(st, ph - st * 2, doorThick), st, ph - st * 2), doorBoxMats);
      lR.position.set(cx - pw / 2 + st / 2, cy, 0);
      const rR = new THREE.Mesh(addDoorNormalDimensions(new THREE.BoxGeometry(st, ph - st * 2, doorThick), st, ph - st * 2), doorBoxMats);
      rR.position.set(cx + pw / 2 - st / 2, cy, 0);
      targetParent.add(back, topR, botR, lR, rR);
      for (const m of [back, topR, botR, lR, rR]) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.userData = doorHit;
        interactables.push(m);
      }
    } else {
      const panelGeometry = new THREE.BoxGeometry(pw, ph, doorThick);
      // Only adds metadata for the shading program; no changed geometry,
      // positions, bevel or silhouette. Works at any door dimensions.
      addDoorNormalDimensions(panelGeometry, pw, ph);
      const panel = new THREE.Mesh(panelGeometry, doorBoxMats);
      panel.position.set(cx, cy, 0);
      panel.castShadow = true;
      panel.receiveShadow = true;
      panel.userData = doorHit;
      targetParent.add(panel);
      interactables.push(panel);
    }
  };

  if (door.kind === 'lift' && door.hardwareKind === 'lift-bifold') {
    const upper = new THREE.Group();
    const lower = new THREE.Group();
    const upperHeight = dh * (door.drawerRatios[0] ?? 2 / 3);
    const lowerHeight = dh - upperHeight;
    const baseX = dxLeft + dw / 2;
    const baseY = dyBot + dh;
    upper.position.set(baseX, baseY, frontFaceZ);
    lower.position.y = -upperHeight;
    upper.add(lower);
    makePanelMesh(dw, upperHeight - 0.003, 0, -upperHeight / 2, upper);
    makePanelMesh(dw, lowerHeight - 0.003, 0, -lowerHeight / 2, lower, 1);
    grp.add(upper);

    for (const h of box.handles) {
      if (h.doorId !== door.id) continue;
      const isLower = h.rowIndex === 1;
      const leafHeight = isLower ? lowerHeight : upperHeight;
      const grip = buildHandleMesh(h.style, h.orient, h.lengthCm || 16, dw, leafHeight,
        doorThick, normalSign, mats.matDarkChrome, mats.matHiddenTrim, h.xRatio, h.yRatio);
      grip.position.set((h.xRatio - 0.5) * dw, -leafHeight * h.yRatio, 0);
      grip.userData = { ...doorHit, kind: 'handle', handleId: h.id };
      (isLower ? lower : upper).add(grip);
      grip.traverse(child => { if (child instanceof THREE.Mesh) interactables.push(child); });
    }

    upper.traverse(child => {
      if (child instanceof THREE.Mesh || child.userData.kind === 'handle')
        child.userData = { ...child.userData, animationId: door.id };
    });

    if (canDoorOpenIn3D(box, door)) {
      const armGeometry = new THREE.CylinderGeometry(0.009, 0.009, 1, 10);
      const liftArms = [-1, 1].map(side => {
        const x = side * (dw / 2 - Math.min(0.035, dw / 6));
        const fixed = new THREE.Vector3(baseX + x, baseY - upperHeight * 0.82, frontFaceZ - normalSign * Math.min(carcD * 0.52, 0.15));
        const moving = new THREE.Vector3(x, -upperHeight * 0.73, -normalSign * 0.012);
        const mesh = new THREE.Mesh(armGeometry, mats.matDarkChrome);
        mesh.castShadow = true;
        grp.add(mesh);
        return { mesh, fixed, moving };
      });
      const anim: AnimatedDoorHandle = {
        doorId: door.id, group: upper, lowerLeaf: lower, liftArms, kind: 'bifold',
        normalSign, baseX, baseY, baseZ: frontFaceZ, baseRotX: 0, baseRotY: 0, maxAngle: Math.PI / 3,
      };
      applyAnimatedDoorProgress(anim, doorOpenProgress);
      animatedDoors.push(anim);
    }
    return;
  }

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

      const rowCanOpen = canDoorOpenIn3D(box, door, r);

      if (door.kind === 'drawer') {
        const baseX = dxLeft + dw / 2;
        const baseY = rowBotY + rowH / 2;
        rowGrp.position.set(baseX, baseY, frontFaceZ);
        makePanelMesh(dw, rowH, 0, 0, rowGrp, r);
        // A real lightweight drawer box travels cleanly between the 5cm side stiles.
        const drawerDepth = Math.max(0.12, Math.min(0.42, carcD * 0.78));
        const sideH = Math.max(0.045, Math.min(0.16, rowH * 0.58));
        const bodyW = Math.max(0.04, dw - 0.11);
        const bodyY = -rowH / 2 + sideH / 2 + 0.01;
        const drawerParts: THREE.Mesh[] = [
          new THREE.Mesh(new THREE.BoxGeometry(bodyW, 0.012, drawerDepth), mats.matCarcass),
          new THREE.Mesh(new THREE.BoxGeometry(0.012, sideH, drawerDepth), mats.matCarcass),
          new THREE.Mesh(new THREE.BoxGeometry(0.012, sideH, drawerDepth), mats.matCarcass),
          new THREE.Mesh(new THREE.BoxGeometry(bodyW, sideH, 0.012), mats.matCarcass),
        ];
        drawerParts[0].position.set(0, -rowH / 2 + 0.014, -normalSign * (drawerDepth / 2 + 0.01));
        drawerParts[1].position.set(-bodyW / 2 + 0.006, bodyY, -normalSign * (drawerDepth / 2 + 0.01));
        drawerParts[2].position.set(bodyW / 2 - 0.006, bodyY, -normalSign * (drawerDepth / 2 + 0.01));
        drawerParts[3].position.set(0, bodyY, -normalSign * (drawerDepth + 0.01));
        const drawerJoints = new THREE.Group();
        drawerJoints.rotation.x = Math.PI / 2;
        drawerJoints.position.y = -rowH / 2 + 0.021;
        const jointX = bodyW / 2 - 0.012;
        const midZ = -normalSign * (drawerDepth / 2 + 0.01);
        addJointLines(drawerJoints, [
          [0.0022, drawerDepth - 0.024, -jointX, midZ, 0],
          [0.0022, drawerDepth - 0.024, jointX, midZ, 0],
          [bodyW - 0.024, 0.0022, 0, -normalSign * 0.022, 0],
          [bodyW - 0.024, 0.0022, 0, -normalSign * (drawerDepth - 0.002), 0],
        ], mats.matDoorRevealDark);
        rowGrp.add(drawerJoints);
        for (const part of drawerParts) {
          part.castShadow = true;
          part.receiveShadow = true;
          part.userData = doorHit;
          interactables.push(part);
          rowGrp.add(part);
        }
        if (rowCanOpen) {
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
        }
      } else {
        const hinge = door.frontCutHinges ? (door.hingeSide === 'right' ? -1 : 1) : 0;
        const baseX = dxLeft + dw / 2 - hinge * dw / 2;
        const baseY = rowBotY + rowH / (hinge ? 2 : 1);
        rowGrp.position.set(baseX, baseY, frontFaceZ);
        makePanelMesh(dw, rowH, hinge * dw / 2, hinge ? 0 : -rowH / 2, rowGrp, r);
        if (rowCanOpen) {
          const handle: AnimatedDoorHandle = {
            doorId: partId,
            group: rowGrp,
            kind: hinge ? (hinge > 0 ? 'hinge-left' : 'hinge-right') : 'lift',
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
      }

      // Attach handles belonging to this row
      for (const h of box.handles) {
        if (h.doorId !== door.id || h.rowIndex !== r) continue;
        const hingeOffset = door.frontCutHinges ? (door.hingeSide === 'right' ? -dw / 2 : dw / 2) : 0;
        const hx = (h.xRatio - 0.5) * dw + hingeOffset;
        const hy =
          door.kind === 'drawer' || door.frontCutHinges
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
          mats.matHiddenTrim,
          h.xRatio,
          h.yRatio
        );
        hMesh.position.set(hx, hy, 0);
        hMesh.userData = {
          kind: 'handle',
          wallId: wall.id,
          boxId: box.id,
          doorId: door.id,
          handleId: h.id,
          animationId: partId,
        } as Scene3DHitData;
        rowGrp.add(hMesh);
        hMesh.traverse(child => { if (child instanceof THREE.Mesh) interactables.push(child); });
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
    const canOpen = canDoorOpenIn3D(box, door);
    const pivot = new THREE.Group();
    const baseX = dxLeft + dw / 2;
    const baseY = dyBot + dh;
    pivot.position.set(baseX, baseY, frontFaceZ);
    makePanelMesh(dw, dh, 0, -dh / 2, pivot);
    if (canOpen) {
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
    }

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
        mats.matHiddenTrim,
          h.xRatio,
          h.yRatio
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
      hMesh.traverse(child => { if (child instanceof THREE.Mesh) interactables.push(child); });
    }

    grp.add(pivot);
    return;
  }

  // Pantry pull-out vs standard Hinged Door
  const isPantry = door.hardwareKind === 'pantry-pullout';
  if (isPantry) {
    const canOpen = canDoorOpenIn3D(box, door);
    const pivot = new THREE.Group();
    const baseX = dxLeft + dw / 2;
    const baseY = dyBot + dh / 2;
    pivot.position.set(baseX, baseY, frontFaceZ);
    makePanelMesh(dw, dh, 0, 0, pivot);
    const basketDepth = Math.min(0.53, carcD - 0.025);
    if (basketDepth >= 0.18) addPantryBaskets(pivot, dw, dh, basketDepth, normalSign, mats.matSteel);
    if (canOpen) {
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
        maxSlide: Math.max(0.26, basketDepth - 0.04),
      };
      if (doorOpenProgress > 0) applyAnimatedDoorProgress(animHandle, doorOpenProgress);
      animatedDoors.push(animHandle);
    }

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
        mats.matHiddenTrim,
          h.xRatio,
          h.yRatio
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
      hMesh.traverse(child => { if (child instanceof THREE.Mesh) interactables.push(child); });
    }

    grp.add(pivot);
    return;
  }

  // Hinged vertical door (with optional top/bottom drawerBand!)
  const hasDoorHandle = canDoorOpenIn3D(box, door);
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
    const tallHinge = Boolean(door.tallDoorSplit && (box.type === 'tall' || box.type === 'closet'));
    const bandBaseX = tallHinge ? pivotX : dxLeft + dw / 2;
    bandGrp.position.set(bandBaseX, bandCenterY, frontFaceZ);
    makePanelMesh(dw, bandH, tallHinge ? panelOffsetX : 0, 0, bandGrp);
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
    pullMesh.position.set(tallHinge ? panelOffsetX : 0, 0, 0);
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
    if (hasDoorHandle) {
      const bandHandle: AnimatedDoorHandle = {
        doorId: bandPartId,
        group: bandGrp,
        kind: tallHinge ? (hingeSide === 'left' ? 'hinge-left' : 'hinge-right') : 'drawer',
        normalSign,
        baseX: bandBaseX,
        baseY: bandCenterY,
        baseZ: frontFaceZ,
        baseRotX: 0,
        baseRotY: 0,
        maxSlide: 0.34,
        maxAngle: tallHinge ? 1.4 : undefined,
      };
      if (doorOpenProgress > 0) applyAnimatedDoorProgress(bandHandle, doorOpenProgress);
      animatedDoors.push(bandHandle);
    }
    grp.add(bandGrp);
  }

  const pivot = new THREE.Group();
  const pivotBaseY = leafBot + leafH / 2;
  pivot.position.set(pivotX, pivotBaseY, frontFaceZ);
  makePanelMesh(dw, leafH, panelOffsetX, 0, pivot);

  if (hasDoorHandle) {
    const swingKind = hingeSide === 'left' ? 'hinge-left' : 'hinge-right';
    const isCornerSwing = isDoorAdjacentToInsideCorner(box, door, blockedZones);
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
      maxAngle: isCornerSwing ? 1.38 : 1.68,
    };
    if (doorOpenProgress > 0) applyAnimatedDoorProgress(pivotHandle, doorOpenProgress);
    animatedDoors.push(pivotHandle);
  }

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
      mats.matHiddenTrim,
          h.xRatio,
          h.yRatio
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
    hMesh.traverse(child => { if (child instanceof THREE.Mesh) interactables.push(child); });
  }

  grp.add(pivot);
}

function addPantryBaskets(parent: THREE.Group, width: number, height: number, depth: number, sign: number, material: THREE.Material) {
  const basketWidth = Math.max(0.08, width - 0.034);
  const levels = Math.max(1, Math.min(5, Math.floor(height / 0.31)));
  const ribCount = Math.max(3, Math.ceil(depth / 0.055));
  const wire = new THREE.BoxGeometry(1, 1, 1);
  const parts = new THREE.InstancedMesh(wire, material, levels * (ribCount + 10) + 2);
  const transform = new THREE.Object3D();
  let index = 0;
  const bar = (x: number, y: number, z: number, w: number, h: number, d: number) => {
    transform.position.set(x, y, -sign * (z + 0.02));
    transform.scale.set(w, h, d);
    transform.updateMatrix();
    parts.setMatrixAt(index++, transform.matrix);
  };
  for (const side of [-1, 1]) bar(side * basketWidth / 2, 0, depth - 0.02, 0.016, height - 0.05, 0.016);
  for (let level = 0; level < levels; level++) {
    const y = -height / 2 + 0.07 + level * (height - 0.08) / levels;
    for (let i = 0; i < ribCount; i++) bar(0, y, depth * (i + 0.5) / ribCount, basketWidth, 0.005, 0.006);
    for (const side of [-1, 1]) {
      for (const rise of [0, 0.075]) {
        bar(side * basketWidth / 2, y + rise, depth / 2, 0.007, 0.007, depth);
        bar(0, y + rise, side < 0 ? 0.004 : depth - 0.004, basketWidth, 0.007, 0.007);
      }
      bar(side * basketWidth / 2, y + 0.036, depth * 0.30, 0.007, 0.075, 0.007);
    }
  }
  parts.instanceMatrix.needsUpdate = true;
  parent.add(parts);
}

/** The new ZIP's decks and bowl centers, in source-model local metres.
 * These EXACT local bowl footprints drive both countertop cutting and visual
 * placement. This prevents a model from sitting on a solid countertop.
 * Corner contours require a dedicated cutout mask; the holes here use the
 * bowl's safe bounding rectangle (rotated bowls expand by a few mm).
 */
const SINK_SOURCE_LAYOUTS: Record<string, {
  w: number; d: number; sourceCenterZ?:number; holes: Array<{x:number;z:number;w:number;d:number;
    rot?:number; outline?:Array<[number,number]>}>;
}> = {
  'sink-double-flat-chrome': { w:1.32,d:.56,holes:[{x:-.42,z:-.015,w:.37,d:.42},{x:.02,z:-.015,w:.37,d:.42}] },
  'sink-single-granite-black': { w:.88,d:.56,holes:[{x:0,z:.035,w:.76,d:.41}] },
  'sink-double-ribbed-steel': { w:1.34,d:.56,holes:[{x:.03,z:0,w:.37,d:.41},{x:.45,z:0,w:.37,d:.41}] },
  'sink-single-deep-steel': { w:.86,d:.56,holes:[{x:0,z:.025,w:.74,d:.42}] },
  'sink-workstation-dual-tap': { w:1.14,d:.56,holes:[{x:0,z:.04,w:1.04,d:.39}] },
  'sink-workstation-gunmetal': { w:1.14,d:.56,holes:[{x:0,z:.045,w:1.04,d:.39}] },
  'sink-single-fan-steel': { w:1.06,d:.58,holes:[{x:-.21,z:0,w:.45,d:.42}] },
  'sink-double-grid-steel': { w:1.34,d:.56,holes:[{x:-.44,z:0,w:.37,d:.41},{x:-.02,z:0,w:.37,d:.41}] },
  'sink-corner-v-steel': { w:1.16,d:.86,sourceCenterZ:-.01,holes:[
    {x:-.27,z:.05,w:.34,d:.33,rot:-Math.PI/4},
    {x:.27,z:.05,w:.34,d:.33,rot:Math.PI/4},
  ] },
  'sink-corner-l-steel': { w:1.22,d:.90,sourceCenterZ:.03,holes:[
    {x:-.32,z:.08,w:.32,d:.32,rot:-Math.PI/4},
    {x:-.02,z:-.15,w:.32,d:.32,rot:-Math.PI/4},
  ] },
  'sink-corner-granite-brown': { w:1.28,d:.88,sourceCenterZ:.08,holes:[
    {x:-.15,z:-.06,w:.42,d:.44,outline:[
      [-.36,.02],[-.14,.16],[.02,-.04],[.06,-.22],[-.18,-.28],[-.34,-.14]
    ]},
    {x:.32,z:.05,w:.38,d:.36},
  ] },
};
function sinkModelPlacement(app: ApplianceItem, depth: number, sign: number) {
  const layout = SINK_SOURCE_LAYOUTS[app.sinkModel ?? ''] ??
    SINK_SOURCE_LAYOUTS['sink-double-flat-chrome'];
  const scale = Math.min(
    (app.width * CM - .025) / layout.w,
    Math.max(.1, depth - .05) / layout.d,
  );
  const x = (app.offsetX + app.width / 2) * CM;
  const z = sign * (depth - .015 - layout.d * scale / 2 -
    (layout.sourceCenterZ ?? 0) * scale);
  return {layout, scale, x, z};
}
function sinkFootprint(app: ApplianceItem, depth: number, sign: number) {
  const {layout, scale, x, z} = sinkModelPlacement(app,depth,sign);
  const width = layout.w * scale, length = layout.d * scale;
  const bowls = layout.holes.map(bowl => {
    let outline = bowl.outline;
    if (bowl.rot !== undefined) {
      // Copy the EXACT corner rotation / radius / arc subdivision used by
      // addRotatedRoundedHole in src/three/sinkHelpers.ts.
      const hw=bowl.w/2, hd=bowl.d/2, r=Math.min(.075,hw*.85,hd*.85);
      const corners: Array<[number,number,number]> = [
        [-hw+r,-hd+r,Math.PI],[hw-r,-hd+r,-Math.PI*.5],
        [hw-r,hd-r,0],[-hw+r,hd-r,Math.PI*.5],
      ];
      const local: Array<[number,number]> = [];
      for (const [cx,cz,start] of corners) for (let n=0;n<=4;n++){
        const angle=start+(n/4)*(Math.PI/2);
        const lx=cx+Math.cos(angle)*r, lz=cz+Math.sin(angle)*r;
        local.push([
          bowl.x+lx*Math.cos(bowl.rot)+lz*Math.sin(bowl.rot),
          bowl.z-lx*Math.sin(bowl.rot)+lz*Math.cos(bowl.rot),
        ]);
      }
      outline=local;
    }
    const gap = .008; // 8 mm of stone clearance on EACH side of the bowl
    const contour = outline?.map(([px,pz]): [number,number] => [
      x + px * scale, z + sign * pz * scale,
    ]);
    return {
      x: x + bowl.x * scale, z: z + sign * bowl.z * scale,
      width: bowl.w * scale + gap * 2,
      length: bowl.d * scale + gap * 2,
      outline: contour ? expandBasinCutoutOutline(contour, gap) : undefined,
    };
  });
  // Legacy projects remain supported: they now use a new source model.
  return {x,z,width,length,bowls};
}

type SinkBowl = ReturnType<typeof sinkFootprint>['bowls'][number];

function sinkPath(x: number, z: number, width: number, length: number, radius: number) {
  const path = new THREE.Shape();
  radius = Math.min(radius, width / 2, length / 2);
  const l = x - width / 2, r = x + width / 2;
  const b = -z - length / 2, t = -z + length / 2;
  path.moveTo(l + radius, b);
  path.lineTo(r - radius, b);
  path.quadraticCurveTo(r, b, r, b + radius);
  path.lineTo(r, t - radius);
  path.quadraticCurveTo(r, t, r - radius, t);
  path.lineTo(l + radius, t);
  path.quadraticCurveTo(l, t, l, t - radius);
  path.lineTo(l, b + radius);
  path.quadraticCurveTo(l, b, l + radius, b);
  return path;
}

function sinkSlabGeometry(x: number, z: number, width: number, length: number,
  thickness: number, bowls: SinkBowl[], radius: number) {
  const shape = sinkPath(x, z, width, length, radius);
  shape.holes.push(...bowls.map(bowl => {
    if (!bowl.outline?.length) return sinkPath(bowl.x, bowl.z, bowl.width, bowl.length, .045);
    const pts = bowl.outline.map(([px,pz]) => new THREE.Vector2(px,-pz));
    if (!THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
    const path = new THREE.Path();
    pts.forEach((pt,i) => i ? path.lineTo(pt.x,pt.y) : path.moveTo(pt.x,pt.y));
    path.closePath();
    return path;
  }));
  return new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 8 }).rotateX(-Math.PI / 2);
}

/** Five-burner source models have a fixed physical 90cm cooking surface. */
function isFiveBurnerCooktop(model?: string): boolean {
  return !model || model === 'hob-glass-5' ||
    model === 'hob-steel-5-right' || model === 'hob-steel-5-center';
}

function buildAppliance3D(
  wall: Wall,
  app: ApplianceItem,
  normalSign: number,
  isSelected: boolean,
  selectedSubPart: 'gas' | 'hood' | null,
  defaultEquipmentFinish: 'silver' | 'white' | 'black',
  mats: {
    matSteel: THREE.Material;
    matDarkChrome: THREE.Material;
    matGlassCooktop: THREE.Material;
    matCarcass: THREE.Material;
    matDoorModern: THREE.Material;
    matEquipment: THREE.Material;
    matGlass: THREE.Material;
  },
  cooktopControls: Array<{ id: string; setLit: (lit: boolean) => void }>,
): THREE.Group {
  const grp = new THREE.Group();
  const resolveMatForFinish = (fin: 'silver' | 'white' | 'black', fallback: THREE.Material): THREE.Material => {
    if (fin === 'white') return mats.matDoorModern;
    if (fin === 'black') return mats.matDarkChrome;
    return fallback;
  };
  const underBox =
    wall.boxes.find(
      (b) =>
        b.id === app.boxId ||
        ((b.type === 'base' || (b.type === 'tall' && (app.kind === 'builtin-oven' || app.kind === 'microwave'))) &&
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
    const { layout, scale, x, z } = sinkModelPlacement(app, boxDepthCm * CM, normalSign);
    const model = makeSink(app.sinkModel);
    toneApplianceMetal(model, app.sinkFinish ?? defaultEquipmentFinish, true);
    // The model's deck is made at local y=0 and the basins extend below it;
    // align this exactly with the countertop's perforated top.
    model.scale.set(scale, scale, normalSign * scale);
    model.position.set(x, topY + .002, z);
    model.traverse(child => {
      if (child instanceof THREE.Mesh) child.castShadow = true;
    });
    grp.add(model);
    if (isSelected) addOutlineHighlight(grp, layout.w * scale, .30, layout.d * scale,
      x, topY - .08, z);
    return grp;
  }

  if (app.kind === 'gas') {
    const hoodParts: THREE.Object3D[] = [];
    // Use real source-model widths: 5 burners = 90cm. Previously the
    // placement subtracted 6cm and a 9cm height cap reduced the entire model.
    const cookW = isFiveBurnerCooktop(app.cooktopModel) ? .90 : aw;
    const cookD = Math.min(0.55, Math.max(0.38, boxDepthCm * CM - 0.04));
    const hob = makeCooktop(app.cooktopModel);
    toneApplianceMetal(hob.group, app.finish ?? defaultEquipmentFinish);
    const cooktop = fitAppliance(hob.group, {
      w: cookW, h: 100, d: 100, // width-led, never shrink X to satisfy a Y/Z cap
    }, normalSign, 'floor');
    const sourceHobDepth = new THREE.Box3().setFromObject(cooktop).getSize(new THREE.Vector3()).z;
    cooktop.scale.z *= cookD / Math.max(.001, sourceHobDepth);
    // Hob sheet is seated into the countertop, not floating above it.
    // Its front edge faces the room rather than being placed inside the wall.
    const cooktopDepth = new THREE.Box3().setFromObject(cooktop).getSize(new THREE.Vector3()).z;
    // Model's CENTER is half its own visual depth away from the room-facing
    // countertop edge; never put the center at 57cm (20cm overhang).
    const cooktopZ = normalSign * (boxDepthCm * CM - 0.01 - cooktopDepth / 2);
    // After removing the model's underside chassis, fitAppliance's local
    // Y=0 is the underside of the black/steel top sheet. Seat it 1mm above
    // the stone to avoid z-fighting; do not recess or cut the countertop.
    cooktop.position.set(ax, topY + .001, cooktopZ);
    hob.setLit(Boolean(app.flameOn));
    cooktopControls.push({ id: app.id, setLit: hob.setLit });
    cooktop.traverse(child => {
      if (child instanceof THREE.Mesh) child.userData.subPart = 'gas';
    });
    grp.add(cooktop);

    // Connected Hood above gas (chimney, angled glass, exposed box, cylinder, or hidden)
    const hoodD = 0.42;
    const frameAbove = wall.boxes.flatMap(box => (box.frames ?? [])
      .filter(frame => frame.side === 'top' && (box.type === 'wall' || box.type === 'wall-deep') &&
        box.offsetX <= app.offsetX + app.width / 2 && box.offsetX + box.width >= app.offsetX + app.width / 2)
      .map(frame => (box.elevY + box.height - frame.widthCm) * CM))
      .filter(height => height > topY + 0.67);
    const hoodTop = Math.min(wall.height * CM, ...frameAbove);
    const upperHoodBox = wall.boxes
      .filter(b => (b.type === 'wall' || b.type === 'wall-deep') &&
        b.offsetX < app.offsetX + app.width - 3 && b.offsetX + b.width > app.offsetX + 3)
      .sort((a,b) => a.elevY - b.elevY)[0];
    // Bottom of ALL exposed hoods is level with the nearby upper cabinet bottom.
    const hoodY = upperHoodBox ? upperHoodBox.elevY * CM : Math.min(hoodTop - .055, topY + .69);
    const hoodMat = resolveMatForFinish(app.hoodFinish ?? defaultEquipmentFinish, mats.matSteel);
    const effKind = effectiveHoodKind(wall, app);
    const hModel = app.hoodModel ?? 'chimney';
    let hoodOutlineCenterY = hoodY + 0.12;
    let hoodOutlineH = 0.32;
    let hoodOutlineZ = normalSign * (hoodD / 2);

    if (effKind !== 'chimney') {
      const hiddenHood = new THREE.Mesh(new THREE.BoxGeometry(Math.max(aw, cookW), 0.04, 0.28), hoodMat);
      hiddenHood.position.set(ax, 1.48, normalSign * 0.16);
      hoodParts.push(hiddenHood);
      hoodOutlineCenterY = 1.48;
      hoodOutlineH = 0.08;
      hoodOutlineZ = normalSign * 0.16;
    } else {
      const sourceHood = makeHood(app.hoodModel);
      toneApplianceMetal(sourceHood, app.hoodFinish ?? defaultEquipmentFinish);
      const model = fitAppliance(sourceHood, {
        w: Math.max(0.55, cookW, aw),
        h: 100, d: 100, // retain actual width, not the old 42cm depth scale cap
      }, normalSign);
      // The wall-facing rear surface of every source hood must touch Z=0.
      // fitAppliance centers the source model, so placing its origin at the
      // entire hood depth pushed the rear ~20cm away from the wall.
      const fittedHoodDepth = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()).z;
      model.position.set(ax, hoodY, normalSign * (fittedHoodDepth / 2 + 0.001));
      model.traverse(child => { if (child instanceof THREE.Mesh) child.userData.subPart = 'hood'; });
      hoodParts.push(model);
      hoodOutlineCenterY = hoodY + 0.24;
      hoodOutlineH = 0.65;
      hoodOutlineZ = normalSign * (hoodD * 0.55);
    }

    for (const hp of hoodParts) {
      hp.castShadow = true;
      hp.userData = { subPart: 'hood' };
      grp.add(hp);
    }

    if (isSelected) {
      if (selectedSubPart === 'hood') {
        addOutlineHighlight(grp, aw, hoodOutlineH, hoodD, ax, hoodOutlineCenterY, hoodOutlineZ);
      } else {
        addOutlineHighlight(grp, aw, 0.15, cookD, ax, topY + 0.05, cooktopZ);
      }
    }
    return grp;
  }

  // Built-in Oven & Built-in Microwave (mounted in Base or Tall cabinet)
  if (app.kind === 'builtin-oven' || app.kind === 'microwave') {
    const isMicro = app.kind === 'microwave';
    const isTall = underBox?.type === 'tall';
    const machW = aw - 0.012;
    const rawH = (isMicro ? 0.38 : 0.60);
    const machH = isTall ? rawH : Math.min(rawH, Math.max(0.36, (topElevCm - counterCm - plinthCm - 4) * CM));
    const machD = Math.min(boxDepthCm * CM, isMicro ? 0.44 : 0.56);
    const baseElevM = isTall
      ? (app.elevY ?? (isMicro ? 146 : 82)) * CM
      : (plinthCm + Math.max(2, ((topElevCm - counterCm - plinthCm) - machH / CM) * 0.72)) * CM;
    const midY = baseElevM + machH / 2;
    const frontZ = normalSign * (boxDepthCm * CM);

    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(machW, machH, machD),
      mats.matEquipment
    );
    chassis.position.set(ax, midY, frontZ - normalSign * (machD / 2));
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    grp.add(chassis);

    // Full-depth support shelves above and below built-in ovens and microwaves.
    const applianceFrameRailH = 0.018;
    const supportShelfD = Math.max(machD, boxDepthCm * CM - 0.02);
    for (const railY of [baseElevM - applianceFrameRailH / 2, baseElevM + machH + applianceFrameRailH / 2]) {
      const shelf = new THREE.Mesh(
        new THREE.BoxGeometry(Math.max(0.08, machW + 0.015), applianceFrameRailH, supportShelfD),
        underBox ? mats.matCarcass : mats.matDoorModern
      );
      shelf.position.set(ax, railY, frontZ - normalSign * (supportShelfD / 2 - 0.006));
      shelf.castShadow = true;
      shelf.receiveShadow = true;
      grp.add(shelf);
    }

    // Top control bezel strip with rotary dials / digital LED display
    const ctrlH = isMicro ? 0.065 : 0.085;
    const ctrl = new THREE.Mesh(
      new THREE.BoxGeometry(machW - 0.012, ctrlH, 0.022),
      mats.matDarkChrome
    );
    ctrl.position.set(ax, baseElevM + machH - ctrlH / 2 - 0.008, frontZ + normalSign * 0.009);
    grp.add(ctrl);

    const knobOffsets = isMicro ? [0.16, 0.22] : [-0.18, 0.18];
    for (const ko of knobOffsets) {
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.02, 16), mats.matSteel);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(ax + ko, ctrl.position.y, frontZ + normalSign * 0.022);
      grp.add(knob);
    }

    // Lit or unlit recessed interior cavity + baking racks visible through front glass
    const winW = machW - 0.09;
    const winH = machH - ctrlH - 0.075;
    const winY = baseElevM + 0.036 + winH / 2;
    const cavityMat = new THREE.MeshStandardMaterial({
      color: app.ovenLightOn ? 0xffd28a : 0x161920,
      emissive: 0xffa340, emissiveIntensity: app.ovenLightOn ? 0.012 : 0,
      roughness: 0.35,
    });
    const ovenLight = new THREE.PointLight(0xffc477, 0.05, 0.4, 2);
    ovenLight.castShadow = false;
    ovenLight.position.set(ax + winW * 0.32, winY + winH * 0.28, frontZ - normalSign * 0.04);
    ovenLight.userData.ovenControlId = app.id;
    ovenLight.userData.ovenControlPart = 'light';
    ovenLight.visible = Boolean(app.ovenLightOn);
    grp.add(ovenLight);
    const cavity = new THREE.Mesh(new THREE.BoxGeometry(winW - 0.02, winH - 0.02, 0.018), cavityMat);
    cavity.userData.ovenControlId = app.id;
    cavity.userData.ovenControlPart = 'cavity';
    cavity.position.set(ax, winY, frontZ - normalSign * 0.004);
    grp.add(cavity);

    for (const rOffset of [-winH * 0.16, winH * 0.14]) {
      const rack = new THREE.Mesh(new THREE.BoxGeometry(winW - 0.04, 0.005, 0.016), mats.matSteel);
      rack.position.set(ax, winY + rOffset, frontZ + normalSign * 0.002);
      grp.add(rack);
    }

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: app.ovenLightOn ? 0xfde68a : 0x090d16,
      emissive: 0xd97706,
      emissiveIntensity: app.ovenLightOn ? 0.0045 : 0,
      transparent: true,
      opacity: app.ovenLightOn ? 0.34 : 0.84,
      roughness: 0.08,
      metalness: app.ovenLightOn ? 0.1 : 0.25,
      envMapIntensity: 1.7,
    });
    const doorGlass = new THREE.Mesh(new THREE.BoxGeometry(winW, winH, 0.01), glassMat);
    doorGlass.userData.ovenControlId = app.id;
    doorGlass.userData.ovenControlPart = 'glass';
    doorGlass.position.set(ax, winY, frontZ + normalSign * 0.011);
    grp.add(doorGlass);

    if (!isMicro) {
      const handle = new THREE.Mesh(new THREE.BoxGeometry(winW - 0.03, 0.014, 0.024), mats.matSteel);
      handle.position.set(ax, winY + winH / 2 - 0.018, frontZ + normalSign * 0.028);
      grp.add(handle);
    }

    if (isSelected) {
      addOutlineHighlight(grp, machW, machH, 0.06, ax, midY, frontZ);
    }
    return grp;
  }

  // Replacement source models: no primitive old washing machine/dishwasher.
  const machH = Math.max(.65, (topElevCm - counterCm) * CM);
  const machW = Math.max(.4, aw - .016);
  const machD = Math.max(.45, boxDepthCm * CM - .014);
  const finish = app.finish ?? defaultEquipmentFinish;
  const source = app.kind === 'washing' ? makeWashingMachine(finish) : makeDishwasher(finish);
  toneApplianceMetal(source, finish);
  const applianceMesh = fitAppliance(source, {w:machW,h:machH,d:machD},normalSign);
  // The fitted model is centered in Z. Position its actual FRONT, not its
  // center, at/behind the countertop edge: never >1cm beyond the stone.
  // Preserve the exact white/silver geometry, materials and details from the
  // user's ZIP; no substitute primitives or material overrides here.
  const fittedDepth = new THREE.Box3().setFromObject(applianceMesh).getSize(new THREE.Vector3()).z;
  // Stone actually extends 2cm beyond the carcass (slabD = bd + .02).
  // The previous reference was 1.2cm behind the stone edge, exposing the
  // toe-kick in front of the washer. Bring its visible front just 8mm beyond
  // the stone, never more than the 1cm appliance overhang allowance.
  const stoneFront = boxDepthCm * CM + 0.02;
  const targetFront = stoneFront + (app.kind === 'washing' ? 0.008 : 0.001);
  applianceMesh.position.set(ax, 0,
    normalSign * (targetFront - fittedDepth / 2));
  applianceMesh.traverse(child => {
    if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true; }
  });
  grp.add(applianceMesh);
  if (isSelected) addOutlineHighlight(grp,machW,machH,machD,
    ax,machH / 2,normalSign*(machD / 2));
  return grp;
}

/**
 * Computes the world-space bounding center & size for the currently selected 3D entity
 * (column, appliance, door, shelf, handle, frame, opening, active box, multiSelection, or active wall)
 * so Zoom-to-Selected can frame it cleanly in 3D Orbit mode.
 */
export function computeSelectionFocusTarget3D(
  built: BuiltKitchenScene,
  project: ProjectState
): { center: THREE.Vector3; size: THREE.Vector3 } | null {
  const focusBox = new THREE.Box3();
  let matched = false;

  const ms = project.multiSelection;
  const multiDoors = new Set(ms?.doorIds || []);
  const multiBoxes = new Set(ms?.boxIds || []);
  const multiApps = new Set(ms?.applianceIds || []);
  const multiOps = new Set(ms?.openingIds || []);
  const hasMulti = multiDoors.size + multiBoxes.size + multiApps.size + multiOps.size > 0;

  for (const node of built.interactables) {
    const data = node.userData as Scene3DHitData | undefined;
    if (!data) continue;
    let isMatch = false;

    if (hasMulti) {
      if (data.doorId && multiDoors.has(data.doorId)) isMatch = true;
      else if (data.boxId && multiBoxes.has(data.boxId)) isMatch = true;
      else if (data.appId && multiApps.has(data.appId)) isMatch = true;
      else if (data.openingId && multiOps.has(data.openingId)) isMatch = true;
    } else if (project.selectedColumnId) {
      isMatch = data.kind === 'column' && data.columnId === project.selectedColumnId;
    } else if (project.selectedApplianceId) {
      isMatch = data.kind === 'appliance' && data.appId === project.selectedApplianceId;
    } else if (project.selectedOpeningId) {
      isMatch = data.kind === 'opening' && data.openingId === project.selectedOpeningId;
    } else if (project.selectedDoorId) {
      isMatch = data.doorId === project.selectedDoorId;
    } else if (project.selectedShelfId) {
      isMatch = data.kind === 'shelf' && data.shelfId === project.selectedShelfId;
    } else if (project.selectedHandleId) {
      isMatch = data.kind === 'handle' && data.handleId === project.selectedHandleId;
    } else if (project.selectedFrameId) {
      isMatch = data.kind === 'frame' && data.frameId === project.selectedFrameId;
    } else if (project.activeBoxId) {
      isMatch = data.boxId === project.activeBoxId;
    } else if (project.activeWallId) {
      isMatch = data.wallId === project.activeWallId;
    }

    if (isMatch) {
      focusBox.expandByObject(node);
      matched = true;
    }
  }

  if (!matched || focusBox.isEmpty()) return null;
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  focusBox.getCenter(center);
  focusBox.getSize(size);
  return { center, size };
}
