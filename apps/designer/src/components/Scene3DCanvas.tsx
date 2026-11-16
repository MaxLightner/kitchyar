import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { DoorClosed, DoorOpen, Eye, Layers } from 'lucide-react';
import {
  APPLIANCE_CONFIGS,
  BACKSPLASH_FINISHES,
  BACKSPLASH_FINISH_ORDER,
  BOX_PRESETS,
  CABINET_FINISHES,
  CABINET_FINISH_ORDER,
  COUNTERTOP_FINISHES,
  COUNTERTOP_FINISH_ORDER,
  DOOR_STYLE_META,
  DOOR_STYLE_ORDER,
  DRAWER_PATTERNS,
  FRAME_WIDTH_OPTIONS,
  FRIDGE_FRAME_CM,
  FRIDGE_MODELS,
  FRIDGE_MODEL_ORDER,
  GAS_WIDTH_OPTIONS,
  LIFT_PATTERNS,
  OPENING_DEFAULTS,
  SINK_MODELS,
  SINK_MODEL_ORDER,
} from '../cad/constants';
import { getCornerBlockedZonesForWall } from '../cad/cornerLogic';
import {
  addShelvesWithMinGap,
  applyDoorBrushPreview,
  applyDoorDrawerBand,
  autoUnitizeBoxForHandles,
  canDoorOpenIn3D,
  carveBoxesForPlacedBox,
  clampBoxInternalsAfterResize,
  computeCabinetSweepRange,
  computeDoorBrushPreview,
  createEmptyBox,
  createWall,
  deleteApplianceHierarchically,
  deleteBoxHierarchically,
  eraseDoorWithRule,
  getBoxSideExposure,
  getUnitsInBox,
  placeFrameOnBox,
  removeUnitDividerWithSync,
  uid,
} from '../cad/doorRules';
import {
  applyAnimatedDoorProgress,
  buildHandleMesh,
  attachSelectedHandlePreviews,
  BuiltKitchenScene,
  buildKitchen3DScene,
  CM,
  detectSoftwareWebGL,
  disposeObject3D,
  Scene3DHitData,
} from '../cad/scene3dBuilder';
import {
  ApplianceKind,
  BacksplashFinishId,
  BoxKind,
  CabinetFinishId,
  CountertopFinishId,
  DoorStyle,
  FridgeModel,
  HandleItem,
  HandleStyle,
  MultiSelection,
  OpeningKind,
  Orientation,
  ProjectState,
  SelectionMode,
  SinkModel,
  ToolId,
  Wall,
} from '../cad/types';
import { CursorTargetStatus, CursorToolPreview } from './CursorToolPreview';
import { PacedGestureStepper } from '../utils/gesturePacing';
import { SurfaceCursor, createSurfaceCursorMarker, updateSurfaceCursorMarker } from '../utils/surfaceCursor';
import { wideViewVerticalFov, WideViewMode } from '../ar/wideView';

const APPLIANCE_ORDER: ApplianceKind[] = ['dishwasher', 'washing'];
const OPENING_ORDER: OpeningKind[] = ['window', 'door', 'column'];
const CAB_DRAW_KIND_ORDER: BoxKind[] = ['base', 'wall', 'wall-deep', 'tall', 'closet'];
const HANDLE_STYLE_ORDER: HandleStyle[] = ['simple', 'knob', 'hidden'];

interface Scene3DCanvasProps {
  /** Keep the entire 3D editor mounted during scanning, without painting its
   * virtual WebGL canvas over the real camera passthrough. */
  scanMode?: boolean;
  wideViewModeExternal?: WideViewMode;
  onWideViewModeChange?: (mode: WideViewMode) => void;
  project: ProjectState;
  tool: ToolId;
  selectionMode: SelectionMode;
  drawBoxKind: BoxKind;
  onSelectDrawBoxKind?: (kind: BoxKind) => void;
  onAddWall?: (wall: Wall) => void;
  doorOrient: Orientation;
  doorTargetWidth: number;
  doorVertCount: number;
  drawerPatIdx: number;
  liftPatIdx: number;
  doorBandPos?: 'top' | 'bottom';
  doorBandRatio?: number;
  onSetDoorBandPos?: (p: 'top' | 'bottom') => void;
  doorStyleBrush: DoorStyle;
  cabinetFinishBrush: CabinetFinishId;
  backsplashBrush: BacksplashFinishId;
  countertopBrush: CountertopFinishId;
  shelfCount: number;
  frameWidthCm: number;
  handleStyle: HandleStyle;
  handleOrient: Orientation;
  fridgeModel: FridgeModel;
  sinkModel: SinkModel;
  gasWidth: number;
  applianceKind: ApplianceKind;
  hoodKind: 'hidden' | 'chimney';
  openingKind: OpeningKind;
  onSetDoorVertCount: (c: number) => void;
  onSetDrawerPatIdx: (i: number) => void;
  onSetLiftPatIdx: (i: number) => void;
  onSetDoorStyleBrush: (s: DoorStyle) => void;
  onSetCabinetFinishBrush: (f: CabinetFinishId) => void;
  onSetBacksplashBrush: (f: BacksplashFinishId) => void;
  onSetCountertopBrush: (f: CountertopFinishId) => void;
  onSetShelfCount: (c: number) => void;
  onSetFrameWidthCm: (w: number) => void;
  onSetFridgeModel: (m: FridgeModel) => void;
  onSetSinkModel: (m: SinkModel) => void;
  onSetGasWidth: (w: number) => void;
  onSetApplianceKind: (k: ApplianceKind) => void;
  onSetOpeningKind: (k: OpeningKind) => void;
  onSetDoorOrient?: (o: Orientation) => void;
  onSetHandleStyle?: (s: HandleStyle) => void;
  onSetHandleOrient?: (o: Orientation) => void;
  onSelectWallAndBox: (
    wallId: string,
    boxId: string | null,
    doorId?: string | null,
    preserveMulti?: boolean
  ) => void;
  onSetMultiSelection: (m?: MultiSelection) => void;
  onSelectUnit: (wallId: string, unit: { boxId: string; startCm: number; endCm: number } | null) => void;
  onSelectAppliance: (wallId: string, appId: string | null) => void;
  onSelectOpening: (wallId: string, openingId: string | null) => void;
  onSelectShelf: (wallId: string, boxId: string, shelfId: string | null) => void;
  onSelectHandle: (wallId: string, boxId: string, handleId: string | null) => void;
  onSelectFrame: (wallId: string, boxId: string, frameId: string | null) => void;
  onSelectUnitDivider: (wallId: string, div: { boxId: string; seamCm: number } | null) => void;
  onMoveBox: (wallId: string, boxId: string, offsetX: number, commit: boolean, sessionId?: string) => void;
  onMoveAppliance: (wallId: string, appId: string, offsetX: number, commit: boolean, sessionId?: string) => void;
  onResizeWallBoxesSynced: (
    sourceWallId: string,
    sourceBoxId: string,
    nextElevY: number,
    nextHeight: number,
    commit: boolean
  ) => void;
  onMutateWallById: (
    wallId: string,
    mutator: (wall: Wall) => void,
    commitHistory?: boolean,
    toastMsg?: string
  ) => void;
  onApplyDoorStyle: (boxId: string | null, doorIds: string[] | null, style: DoorStyle) => void;
  onApplyFinish: (
    target: 'box' | 'all-cabinets' | 'backsplash' | 'countertop',
    wallId?: string,
    boxId?: string,
    overrideId?: string
  ) => void;
  onPlaceAppliance: (wallId: string, boxId: string, desiredOffsetX: number, kindOverride?: ApplianceKind) => void;
  onPlaceFridge: (wallId: string, desiredOffsetX: number) => void;
  onPlaceOpening: (wallId: string, desiredOffsetX: number, desiredElevY?: number) => void;
  onDeleteOpening: (wallId: string, openingId: string) => void;
  onExitToSelect: () => void;
  onToast: (msg: string) => void;
}

type Drag3D =
  | {
      kind: 'move-box';
      wallId: string;
      boxId: string;
      origX: number;
      lastTargetX: number;
      startDot: number;
      sessionId: string;
      moved?: boolean;
    }
  | {
      kind: 'move-app';
      wallId: string;
      appId: string;
      origX: number;
      lastTargetX: number;
      startDot: number;
      sessionId: string;
      moved?: boolean;
    }
  | {
      kind: 'resize-box';
      wallId: string;
      boxId: string;
      side: 'left' | 'right' | 'top' | 'bottom';
      origX: number;
      origW: number;
      origElev: number;
      origH: number;
      lastElev: number;
      lastH: number;
      startDot: number;
      startY: number;
    };

function resolveHitData(obj: THREE.Object3D | null): Scene3DHitData | null {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    if (cur.userData && (cur.userData as Scene3DHitData).kind) {
      return cur.userData as Scene3DHitData;
    }
    cur = cur.parent;
  }
  return null;
}

function applySelectionMode3D(
  prev: MultiSelection | undefined,
  mode: SelectionMode,
  kind: 'door' | 'box',
  itemId: string
): MultiSelection | undefined {
  const next: MultiSelection = prev
    ? {
        boxIds: [...prev.boxIds],
        doorIds: [...prev.doorIds],
        openingIds: [...prev.openingIds],
        applianceIds: [...prev.applianceIds],
      }
    : { boxIds: [], doorIds: [], openingIds: [], applianceIds: [] };
  const arr = kind === 'door' ? next.doorIds : next.boxIds;
  if (mode === 'add') {
    if (!arr.includes(itemId)) arr.push(itemId);
  } else if (mode === 'subtract') {
    const idx = arr.indexOf(itemId);
    if (idx !== -1) arr.splice(idx, 1);
  }
  const total =
    next.boxIds.length + next.doorIds.length + next.openingIds.length + next.applianceIds.length;
  return total > 0 ? next : undefined;
}

export const Scene3DCanvas: React.FC<Scene3DCanvasProps> = (props) => {
  const { project, tool } = props;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const surfaceCursorRef = useRef(new SurfaceCursor());
  const commitPlacementRef = useRef<() => void>(()=>{});
  const [hasPlacementCursor, setHasPlacementCursor] = useState(false);
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [camPreset, setCamPreset] = useState<'iso' | 'front' | 'top'>('iso');
  const [localWideViewMode, setLocalWideViewMode] = useState<WideViewMode>('normal');
  const wideViewMode = props.wideViewModeExternal ?? localWideViewMode;
  const wideViewModeRef = useRef<WideViewMode>('normal');
  wideViewModeRef.current = wideViewMode;
  const [hoverPreview, setHoverPreview] = useState<{
    clientX: number;
    clientY: number;
    hoverTarget: 'cabinet' | 'backsplash' | 'countertop' | 'wall' | null;
    targetStatus: CursorTargetStatus;
    sweepWidthCm?: number;
  } | null>(null);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const builtRef = useRef<BuiltKitchenScene | null>(null);
  const ghostGroupRef = useRef<THREE.Group | null>(null);
  const requestRenderRef = useRef<() => void>(() => {});
  const drag3DRef = useRef<Drag3D | null>(null);
  const downClientRef = useRef<{ x: number; y: number } | null>(null);
  const rightDownClientRef = useRef<{ x: number; y: number } | null>(null);
  const lastHoverCheckRef = useRef<{ x: number; y: number; ts: number }>({ x: 0, y: 0, ts: 0 });
  const gestureStepperRef = useRef(new PacedGestureStepper());
  const camInitDoneRef = useRef(false);
  const doorStatesRef = useRef<Map<string, { cur: number; target: number }>>(new Map());
  const pendingWallStart3DRef = useRef<{ xCm: number; yCm: number } | null>(null);
  const pendingCabDraw3DRef = useRef<{ wallId: string; startXCm: number; boxKind: BoxKind } | null>(null);
  const clearWallPreviewRef = useRef<() => void>(() => {});
  const updateWallPreviewRef = useRef<(clientX: number, clientY: number) => void>(() => {});
  const updateGhostAndHoverRef = useRef<(clientX: number, clientY: number) => void>(() => {});

  const propsRef = useRef(props);
  propsRef.current = props;
  const doorsOpenRef = useRef(doorsOpen);
  doorsOpenRef.current = doorsOpen;

  const applyCameraPreset = (
    preset: 'iso' | 'front' | 'top',
    bounds?: THREE.Box3,
    explicitWallId?: string
  ) => {
    const cam = cameraRef.current;
    const ctrl = controlsRef.current;
    const b = bounds || builtRef.current?.bounds;
    if (!cam || !ctrl || !b) return;

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    b.getCenter(center);
    b.getSize(size);
    const maxDim = Math.max(3.2, size.x, size.z, size.y);

    const targetWallId = explicitWallId ?? propsRef.current.project.activeWallId;
    const aw =
      propsRef.current.project.walls.find((w) => w.id === targetWallId) ||
      propsRef.current.project.walls[0];
    const tr = aw ? builtRef.current?.wallTransforms.get(aw.id) : null;

    ctrl.target.set(center.x, Math.max(0.9, center.y * 0.65), center.z);
    if (preset === 'top') {
      cam.position.set(center.x, maxDim * 1.45, center.z + 0.01);
    } else if (preset === 'front') {
      if (tr) {
        const mid = tr.origin.clone().addScaledVector(tr.tangent, (tr.lengthCm * CM) / 2);
        mid.y = tr.heightCm * CM * 0.48;
        ctrl.target.copy(mid);
        const dist = Math.max(2.6, tr.lengthCm * CM * 0.95);
        cam.position.copy(mid).addScaledVector(tr.normal, dist);
        cam.position.y = mid.y + 0.25;
      } else {
        cam.position.set(center.x, 1.35, center.z + maxDim * 1.1);
      }
    } else {
      if (tr) {
        const focus = explicitWallId
          ? tr.origin.clone().addScaledVector(tr.tangent, (tr.lengthCm * CM) / 2)
          : center.clone();
        focus.y = explicitWallId ? tr.heightCm * CM * 0.45 : Math.max(0.9, center.y * 0.65);
        ctrl.target.copy(focus);
        const dist = Math.max(3.4, maxDim * 0.92);

        const candA = focus
          .clone()
          .addScaledVector(tr.normal, dist * 0.85)
          .addScaledVector(tr.tangent, -dist * 0.42);
        const candB = focus
          .clone()
          .addScaledVector(tr.normal, dist * 0.85)
          .addScaledVector(tr.tangent, +dist * 0.42);

        const scoreCam = (p: THREE.Vector3) => {
          let behindWalls = 0;
          if (builtRef.current) {
            for (const wt of builtRef.current.wallTransforms.values()) {
              const rel = p.clone().sub(wt.origin);
              const along = rel.dot(wt.tangent);
              if (along >= -0.35 && along <= wt.lengthCm * CM + 0.35 && rel.dot(wt.normal) < -0.08) {
                behindWalls++;
              }
            }
          }
          return behindWalls * 1000 + p.distanceTo(center);
        };

        cam.position.copy(scoreCam(candB) < scoreCam(candA) ? candB : candA);
        cam.position.y = Math.max(2.2, maxDim * 0.62);
      } else {
        cam.position.set(center.x + maxDim * 0.75, Math.max(2.2, maxDim * 0.65), center.z + maxDim * 0.85);
      }
    }
    cam.updateProjectionMatrix();
    ctrl.update();
    requestRenderRef.current();
  };

  useEffect(() => {
    const container = hostRef.current;
    // Chido runs ONE WebXR renderer during floor scanning. Keeping a second
    // hidden 3D WebGL context alive can exhaust GPU limits on Android devices
    // and prevent the live camera from initializing. The Scene3DCanvas React
    // component and every button remain mounted; only its renderer is paused.
    if (!container || props.scanMode) return;

    const w = Math.max(320, container.clientWidth);
    const h = Math.max(240, container.clientHeight);

    const probeCanvas = document.createElement('canvas');
    const glProbe =
      (probeCanvas.getContext('webgl2') as WebGL2RenderingContext | null) ||
      (probeCanvas.getContext('webgl') as WebGLRenderingContext | null);
    const isSoftwareGl = detectSoftwareWebGL(glProbe);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    if (!isSoftwareGl) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    renderer.domElement.setAttribute('data-testid', 'scene-3d-canvas');
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#eaeef3');
    scene.fog = new THREE.Fog('#eaeef3', 14, 34);
    sceneRef.current = scene;

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    scene.environmentIntensity = 0.52;

    const hemi = new THREE.HemisphereLight(0xffffff, 0xcbd5e1, 0.56);
    scene.add(hemi);

    const dirKey = new THREE.DirectionalLight(0xfffbeb, 1.05);
    dirKey.position.set(4.5, 6.8, 5.2);
    if (!isSoftwareGl) {
      dirKey.castShadow = true;
      dirKey.shadow.mapSize.set(1024, 1024);
      dirKey.shadow.camera.near = 0.5;
      dirKey.shadow.camera.far = 22;
      dirKey.shadow.camera.left = -6;
      dirKey.shadow.camera.right = 6;
      dirKey.shadow.camera.top = 6;
      dirKey.shadow.camera.bottom = -6;
    }
    scene.add(dirKey);

    const dirFill = new THREE.DirectionalLight(0xe0f2fe, 0.36);
    dirFill.position.set(-4, 3.5, -4);
    scene.add(dirFill);

    // Reusable 3D ghost preview group + materials
    const ghostGroup = new THREE.Group();
    ghostGroup.visible = false;
    scene.add(ghostGroup);
    ghostGroupRef.current = ghostGroup;

    const ghostMatIndigo = new THREE.MeshStandardMaterial({
      color: 0x4f46e5,
      transparent: true,
      opacity: 0.34,
      roughness: 0.35,
      depthWrite: false,
    });
    const ghostMatTeal = new THREE.MeshStandardMaterial({
      color: 0x0f766e,
      transparent: true,
      opacity: 0.38,
      roughness: 0.32,
      depthWrite: false,
    });
    const ghostMatDanger = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      transparent: true,
      opacity: 0.38,
      roughness: 0.35,
      depthWrite: false,
    });
    const ghostMatWire = new THREE.LineBasicMaterial({ color: 0x312e81 });

    // Floor wall-drawing reticle, start marker, and live preview wall
    const floorWallGroup = new THREE.Group();
    scene.add(floorWallGroup);

    const floorReticle = new THREE.Group();
    floorReticle.visible = false;
    const reticleRing = new THREE.Mesh(
      new THREE.RingGeometry(0.075, 0.115, 28),
      new THREE.MeshBasicMaterial({ color: 0x059669, side: THREE.DoubleSide })
    );
    reticleRing.rotation.x = -Math.PI / 2;
    reticleRing.position.y = 0.012;
    const reticleDot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.02, 16),
      new THREE.MeshBasicMaterial({ color: 0x10b981 })
    );
    reticleDot.position.y = 0.014;
    floorReticle.add(reticleRing, reticleDot);
    floorWallGroup.add(floorReticle);

    const wallStartPin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.036, 0.22, 16),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3 })
    );
    wallStartPin.visible = false;
    floorWallGroup.add(wallStartPin);

    const wallPreviewGroup = new THREE.Group();
    wallPreviewGroup.visible = false;
    floorWallGroup.add(wallPreviewGroup);

    const clearWallFloorPreview = () => {
      floorReticle.visible = false;
      wallStartPin.visible = false;
      while (wallPreviewGroup.children.length > 0) {
        const ch = wallPreviewGroup.children[0];
        wallPreviewGroup.remove(ch);
        const m = ch as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      }
      wallPreviewGroup.visible = false;
    };
    clearWallPreviewRef.current = clearWallFloorPreview;

    const camera = new THREE.PerspectiveCamera(wideViewVerticalFov(wideViewModeRef.current, w / h), w / h, 0.1, 80);
    camera.position.set(3.2, 2.5, 3.8);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minDistance = 0.9;
    controls.maxDistance = 18;
    controlsRef.current = controls;

    const surfaceMarker = createSurfaceCursorMarker();
    scene.add(surfaceMarker);
    let rafId: number | null = null;
    let needsRender = true;
    let lastAnimTs = performance.now();
    const DOOR_ANIM_DURATION_S = 0.58;

    const renderLoop = (now = performance.now()) => {
      rafId = null;
      const dt = Math.min(0.05, Math.max(0.001, (now - lastAnimTs) / 1000));
      lastAnimTs = now;

      let anyDoorMoving = false;
      const built = builtRef.current;
      if (built && built.animatedDoors.length > 0) {
        const states = doorStatesRef.current;
        for (const h of built.animatedDoors) {
          let st = states.get(h.doorId);
          if (!st) {
            st = { cur: doorsOpenRef.current ? 1 : 0, target: doorsOpenRef.current ? 1 : 0 };
            states.set(h.doorId, st);
          }
          if (Math.abs(st.target - st.cur) > 0.001) {
            const step = dt / DOOR_ANIM_DURATION_S;
            if (st.target > st.cur) st.cur = Math.min(st.target, st.cur + step);
            else st.cur = Math.max(st.target, st.cur - step);
            applyAnimatedDoorProgress(h, st.cur);
            needsRender = true;
            if (Math.abs(st.target - st.cur) > 0.001) {
              anyDoorMoving = true;
            }
          }
        }
      }

      if (controls.enableDamping) {
        if (controls.update()) needsRender = true;
      }
      if (needsRender) {
        needsRender = false;
        updateSurfaceCursorMarker(surfaceMarker, surfaceCursorRef.current);
        renderer.render(scene, camera);
      }
      if (anyDoorMoving) {
        rafId = requestAnimationFrame(renderLoop);
      }
    };
    const requestRender = () => {
      needsRender = true;
      if (rafId === null) {
        lastAnimTs = performance.now();
        rafId = requestAnimationFrame(renderLoop);
      }
    };
    requestRenderRef.current = requestRender;

    controls.addEventListener('change', requestRender);

    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr || cr.width < 10 || cr.height < 10) return;
      camera.aspect = cr.width / cr.height;
      camera.fov = wideViewVerticalFov(wideViewModeRef.current, camera.aspect);
      camera.updateProjectionMatrix();
      renderer.setSize(cr.width, cr.height);
      requestRender();
    });
    ro.observe(container);

    // Scratch math objects to minimize allocations in pointermove/wheel
    const raycaster = new THREE.Raycaster();
    const ndcVec = new THREE.Vector2();
    const scratchPlane = new THREE.Plane();
    const scratchHit = new THREE.Vector3();
    const scratchRel = new THREE.Vector3();
    const upAxis = new THREE.Vector3(0, 1, 0);
    const basisMat = new THREE.Matrix4();

    const setNdc = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      ndcVec.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
      return ndcVec;
    };

    const projectPointerOntoWall = (wallId: string, clientX: number, clientY: number) => {
      const tr = builtRef.current?.wallTransforms.get(wallId);
      if (!tr) return null;
      raycaster.setFromCamera(setNdc(clientX, clientY), camera);
      scratchPlane.setFromNormalAndCoplanarPoint(tr.normal, tr.origin);
      if (!raycaster.ray.intersectPlane(scratchPlane, scratchHit)) return null;
      scratchRel.copy(scratchHit).sub(tr.origin);
      const xCm = scratchRel.dot(tr.tangent) / CM;
      const yCm = scratchHit.y / CM;
      return { xCm, yCm, tr };
    };

    const disposeGhostChildren = () => {
      while (ghostGroup.children.length > 0) {
        const ch = ghostGroup.children[0];
        ghostGroup.remove(ch);
        disposeObject3D(ch);
      }
    };

    const clearGhost = () => {
      disposeGhostChildren();
      if (ghostGroup.visible) {
        ghostGroup.visible = false;
        requestRender();
      }
    };

    const raycastFloorPointCm = (clientX: number, clientY: number) => {
      raycaster.setFromCamera(setNdc(clientX, clientY), camera);
      scratchPlane.set(upAxis, 0);
      if (!raycaster.ray.intersectPlane(scratchPlane, scratchHit)) return null;
      let xCm = Math.max(-3000, Math.min(3000, Math.round((scratchHit.x / CM) / 5) * 5));
      let yCm = Math.max(-3000, Math.min(3000, Math.round((scratchHit.z / CM) / 5) * 5));
      const cur = propsRef.current;

      // Snap to existing wall endpoints within 18cm
      let snappedToCorner = false;
      for (const w of cur.project.walls) {
        for (const ep of [
          { x: w.x1Cm, y: w.y1Cm },
          { x: w.x2Cm, y: w.y2Cm },
        ]) {
          if (Math.hypot(xCm - ep.x, yCm - ep.y) <= 18) {
            xCm = Math.round(ep.x);
            yCm = Math.round(ep.y);
            snappedToCorner = true;
            break;
          }
        }
        if (snappedToCorner) break;
      }

      // Orthogonal 90-degree assist from pending start point
      const pStart = pendingWallStart3DRef.current;
      if (!snappedToCorner && pStart) {
        if (Math.abs(xCm - pStart.xCm) <= 14) xCm = pStart.xCm;
        else if (Math.abs(yCm - pStart.yCm) <= 14) yCm = pStart.yCm;
      }

      return { xCm, yCm };
    };

    const updateWallFloorPreview = (clientX: number, clientY: number) => {
      const cur = propsRef.current;
      if (cur.tool !== 'wall') {
        clearWallFloorPreview();
        return;
      }
      const pt = raycastFloorPointCm(clientX, clientY);
      if (!pt) {
        floorReticle.visible = false;
        wallPreviewGroup.visible = false;
        requestRender();
        return;
      }
      floorReticle.position.set(pt.xCm * CM, 0, pt.yCm * CM);
      floorReticle.visible = true;

      while (wallPreviewGroup.children.length > 0) {
        const ch = wallPreviewGroup.children[0];
        wallPreviewGroup.remove(ch);
        const m = ch as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
      }

      const start = pendingWallStart3DRef.current;
      if (start) {
        wallStartPin.position.set(start.xCm * CM, 0.11, start.yCm * CM);
        wallStartPin.visible = true;
        const dxM = (pt.xCm - start.xCm) * CM;
        const dzM = (pt.yCm - start.yCm) * CM;
        const lenM = Math.hypot(dxM, dzM);
        if (lenM >= 0.05) {
          const wallHM = (cur.project.settings?.wallHeightCm || 265) * CM;
          const prevGeo = new THREE.BoxGeometry(lenM, wallHM, 0.14);
          const prevMesh = new THREE.Mesh(
            prevGeo,
            lenM >= 0.4 ? ghostMatTeal : ghostMatDanger
          );
          const angle = Math.atan2(-dzM, dxM);
          prevMesh.rotation.y = angle;
          prevMesh.position.set(
            (start.xCm * CM + pt.xCm * CM) / 2,
            wallHM / 2,
            (start.yCm * CM + pt.yCm * CM) / 2
          );
          const prevEdges = new THREE.EdgesGeometry(prevGeo);
          const prevLines = new THREE.LineSegments(prevEdges, ghostMatWire);
          prevLines.rotation.y = angle;
          prevLines.position.copy(prevMesh.position);
          wallPreviewGroup.add(prevMesh, prevLines);
          wallPreviewGroup.visible = true;
        } else {
          wallPreviewGroup.visible = false;
        }
      } else {
        wallStartPin.visible = false;
        wallPreviewGroup.visible = false;
      }
      requestRender();
    };

    updateWallPreviewRef.current = updateWallFloorPreview;

    const updateGhostAndHover = (clientX: number, clientY: number) => {
      const curTool = propsRef.current.tool;
      if (curTool === 'wall') {
        clearGhost();
        setHoverPreview({ clientX, clientY, hoverTarget: null, targetStatus: 'valid' });
        updateWallFloorPreview(clientX, clientY);
        return;
      }
      clearWallFloorPreview();
      if (!builtRef.current) {
        clearGhost();
        setHoverPreview({ clientX, clientY, hoverTarget: null, targetStatus: 'neutral' });
        return;
      }
      const cur = propsRef.current;

      // Active 2-click cab-draw sweep can track cursor even across wall edges
      const pendingSweep = pendingCabDraw3DRef.current;
      if (cur.tool === 'cab-draw' && pendingSweep) {
        const sweepWall = cur.project.walls.find((x) => x.id === pendingSweep.wallId);
        const sweepTr = builtRef.current.wallTransforms.get(pendingSweep.wallId);
        if (sweepWall && sweepTr) {
          raycaster.setFromCamera(setNdc(clientX, clientY), camera);
          const hits = raycaster.intersectObjects(builtRef.current.interactables, false);
          const sameWallHit = hits.find((h) => resolveHitData(h.object)?.wallId === sweepWall.id);
          let currXCm: number | null = null;
          if (sameWallHit) {
            scratchRel.copy(sameWallHit.point).sub(sweepTr.origin);
            currXCm = Math.max(0, Math.min(sweepWall.length, scratchRel.dot(sweepTr.tangent) / CM));
          } else {
            const proj = projectPointerOntoWall(sweepWall.id, clientX, clientY);
            if (proj) currXCm = Math.max(0, Math.min(sweepWall.length, proj.xCm));
          }
          if (currXCm !== null) {
            const kindNow = cur.drawBoxKind;
            const preset = BOX_PRESETS[kindNow] || BOX_PRESETS.base;
            const range = computeCabinetSweepRange(pendingSweep.startXCm, currXCm, sweepWall.length, 30);
            disposeGhostChildren();
            ghostGroup.position.copy(sweepTr.origin);
            basisMat.makeBasis(sweepTr.tangent, upAxis, sweepTr.rightVec);
            ghostGroup.quaternion.setFromRotationMatrix(basisMat);

            const geo = new THREE.BoxGeometry(
              Math.max(0.02, range.width * CM),
              Math.max(0.02, preset.height * CM),
              Math.max(0.015, preset.depth * CM)
            );
            const mesh = new THREE.Mesh(geo, ghostMatIndigo);
            mesh.position.set(
              (range.offsetX + range.width / 2) * CM,
              (preset.elevY + preset.height / 2) * CM,
              sweepTr.normalSign * (preset.depth / 2) * CM
            );
            ghostGroup.add(mesh);
            const edges = new THREE.EdgesGeometry(geo);
            const line = new THREE.LineSegments(edges, ghostMatWire);
            line.position.copy(mesh.position);
            ghostGroup.add(line);

            // Start anchor marker strip
            const pinGeo = new THREE.BoxGeometry(0.025, Math.max(0.05, preset.height * CM + 0.04), 0.025);
            const pinMesh = new THREE.Mesh(pinGeo, ghostMatTeal);
            pinMesh.position.set(
              pendingSweep.startXCm * CM,
              (preset.elevY + preset.height / 2) * CM,
              sweepTr.normalSign * (preset.depth + 2) * CM
            );
            ghostGroup.add(pinMesh);

            ghostGroup.visible = true;
            setHoverPreview({
              clientX,
              clientY,
              hoverTarget: null,
              targetStatus: 'valid',
              sweepWidthCm: range.width,
            });
            requestRender();
            return;
          }
        }
      }

      raycaster.setFromCamera(setNdc(clientX, clientY), camera);
      const hits = raycaster.intersectObjects(builtRef.current.interactables, false);
      if (!hits.length) {
        clearGhost();
        setHoverPreview({ clientX, clientY, hoverTarget: null, targetStatus: 'neutral' });
        return;
      }
      const topHit = hits[0];
      const data = resolveHitData(topHit.object);
      if (!data) {
        clearGhost();
        setHoverPreview({ clientX, clientY, hoverTarget: null, targetStatus: 'neutral' });
        return;
      }

      const wall = cur.project.walls.find((x) => x.id === data.wallId);
      const tr = builtRef.current.wallTransforms.get(data.wallId);
      if (!wall || !tr) {
        clearGhost();
        setHoverPreview({ clientX, clientY, hoverTarget: null, targetStatus: 'neutral' });
        return;
      }

      scratchRel.copy(topHit.point).sub(tr.origin);
      const hitXCm = Math.max(0, Math.min(wall.length, scratchRel.dot(tr.tangent) / CM));
      const hitYCm = Math.max(0, Math.min(wall.height, topHit.point.y / CM));

      let finishTarget: 'cabinet' | 'backsplash' | 'countertop' | 'wall' | null = null;
      if (cur.tool === 'finish') {
        finishTarget =
          data.kind === 'countertop'
            ? 'countertop'
            : data.kind === 'backsplash'
            ? 'backsplash'
            : data.boxId
            ? 'cabinet'
            : null;
      } else if (cur.tool === 'doors' && data.boxId) {
        const bHover = wall.boxes.find((b) => b.id === data.boxId);
        if (bHover && (bHover.type === 'wall' || bHover.type === 'wall-deep')) {
          finishTarget = 'wall';
        }
      }

      // Update translucent 3D ghost mesh on hovered wall using right-handed wall basis (det = +1)
      disposeGhostChildren();

      ghostGroup.position.copy(tr.origin);
      basisMat.makeBasis(tr.tangent, upAxis, tr.rightVec);
      ghostGroup.quaternion.setFromRotationMatrix(basisMat);

      const addGhostBox = (
        x1Cm: number,
        y1Cm: number,
        z1Cm: number,
        wCm: number,
        hCm: number,
        dCm: number,
        mat: THREE.Material
      ) => {
        const geo = new THREE.BoxGeometry(Math.max(0.02, wCm * CM), Math.max(0.02, hCm * CM), Math.max(0.015, dCm * CM));
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(
          (x1Cm + wCm / 2) * CM,
          (y1Cm + hCm / 2) * CM,
          tr.normalSign * (z1Cm + dCm / 2) * CM
        );
        ghostGroup.add(mesh);
        const edges = new THREE.EdgesGeometry(geo);
        const line = new THREE.LineSegments(edges, ghostMatWire);
        line.position.copy(mesh.position);
        ghostGroup.add(line);
      };

      let hasGhost = false;
      let targetStatus: CursorTargetStatus = 'neutral';
      let previewSweepWidth: number | undefined;

      if (cur.tool === 'cab-draw') {
        const preset = BOX_PRESETS[cur.drawBoxKind] || BOX_PRESETS.base;
        const wCm = Math.min(60, Math.max(30, wall.length));
        const startCm = Math.max(0, Math.min(wall.length - wCm, Math.round((hitXCm - wCm / 2) / 5) * 5));
        addGhostBox(startCm, preset.elevY, 0, wCm, preset.height, preset.depth, ghostMatIndigo);
        hasGhost = true;
        targetStatus = 'valid';
        previewSweepWidth = wCm;
      } else if (cur.tool === 'fridge') {
        const cfg = FRIDGE_MODELS[cur.fridgeModel];
        const fw = cfg.width + FRIDGE_FRAME_CM * 2;
        const fh = cfg.height + FRIDGE_FRAME_CM;
        const startCm = Math.max(0, Math.min(wall.length - fw, Math.round((hitXCm - fw / 2) / 5) * 5));
        addGhostBox(startCm, 0, 0, fw, fh, cfg.depth, ghostMatIndigo);
        hasGhost = true;
        targetStatus = 'valid';
      } else if (cur.tool === 'opening') {
        const def = OPENING_DEFAULTS[cur.openingKind];
        const elev = cur.openingKind === 'window' ? Math.max(20, Math.round(hitYCm - def.height / 2)) : 0;
        const startCm = Math.max(0, Math.min(wall.length - def.width, Math.round((hitXCm - def.width / 2) / 5) * 5));
        addGhostBox(startCm, elev, -2, def.width, def.height, 14, ghostMatTeal);
        hasGhost = true;
        targetStatus = 'valid';
      } else if (cur.tool === 'sink' || cur.tool === 'gas' || cur.tool === 'appliance') {
        const baseBox =
          (data.boxId ? wall.boxes.find((b) => b.id === data.boxId && b.type === 'base') : undefined) ||
          wall.boxes.find((b) => b.type === 'base' && hitXCm >= b.offsetX - 5 && hitXCm <= b.offsetX + b.width + 5);
        if (baseBox) {
          const kind = cur.tool === 'sink' ? 'sink' : cur.tool === 'gas' ? 'gas' : cur.applianceKind;
          const tw =
            kind === 'sink'
              ? SINK_MODELS[cur.sinkModel].width
              : kind === 'gas'
              ? cur.gasWidth
              : APPLIANCE_CONFIGS[kind].width;
          const startCm = Math.max(
            baseBox.offsetX,
            Math.min(baseBox.offsetX + baseBox.width - tw, Math.round((hitXCm - tw / 2) / 5) * 5)
          );
          const topY = baseBox.elevY + baseBox.height;
          if (kind === 'sink' || kind === 'gas') {
            const appDepthCm = kind === 'gas' ? 48 : 50;
            const appZStart = Math.max(2, (baseBox.depth - appDepthCm) / 2);
            const appH = kind === 'gas' ? 5 : 4;
            addGhostBox(startCm, topY, appZStart, tw, appH, appDepthCm, ghostMatTeal);
          } else {
            addGhostBox(startCm, baseBox.plinth, 0, tw, topY - baseBox.countertopCm - baseBox.plinth, baseBox.depth + 2, ghostMatIndigo);
          }
          hasGhost = true;
          targetStatus = 'valid';
        } else {
          targetStatus = 'invalid';
        }
      } else if (cur.tool === 'doors' && data.boxId) {
        const box = wall.boxes.find((b) => b.id === data.boxId);
        if (box && box.type !== 'fridge') {
          const blockedZones = getCornerBlockedZonesForWall(wall, cur.project.walls, cur.project.cornerOwners);
          const prev = computeDoorBrushPreview(
            box,
            hitXCm - box.offsetX,
            cur.doorOrient,
            cur.doorVertCount,
            cur.drawerPatIdx,
            cur.liftPatIdx,
            blockedZones,
            cur.doorTargetWidth
          );
          if (prev.ok) {
            const innerBotCm = box.elevY + box.plinth;
            const innerHCm = Math.max(10, box.height - box.plinth - box.countertopCm - 1);
            for (const it of prev.items) {
              if (it.drawerBand) {
                const bandH = Math.max(8, innerHCm * it.drawerBand.ratio - 0.4);
                const leafH = Math.max(10, innerHCm - bandH - 0.6);
                const isTop = it.drawerBand.position === 'top';
                const bandY = isTop ? innerBotCm + innerHCm - bandH + 0.5 : innerBotCm + 0.5;
                const leafY = isTop ? innerBotCm + 0.5 : innerBotCm + bandH + 1.1;
                addGhostBox(
                  box.offsetX + it.startCm + 0.5,
                  bandY,
                  box.depth + 0.5,
                  Math.max(4, it.widthCm - 1),
                  bandH,
                  2.5,
                  ghostMatTeal
                );
                addGhostBox(
                  box.offsetX + it.startCm + 0.5,
                  leafY,
                  box.depth + 0.5,
                  Math.max(4, it.widthCm - 1),
                  leafH,
                  2.5,
                  ghostMatIndigo
                );
              } else {
                addGhostBox(
                  box.offsetX + it.startCm + 0.5,
                  innerBotCm + 0.5,
                  box.depth + 0.5,
                  Math.max(4, it.widthCm - 1),
                  innerHCm,
                  2.5,
                  ghostMatIndigo
                );
              }
            }
            targetStatus = 'valid';
          } else {
            addGhostBox(
              hitXCm - 15,
              box.elevY + box.plinth + 4,
              box.depth + 1,
              30,
              Math.max(16, box.height - box.plinth - box.countertopCm - 8),
              2.5,
              ghostMatDanger
            );
            targetStatus = 'invalid';
          }
          hasGhost = true;
        }
      } else if (cur.tool === 'handle' && data.boxId) {
        const box = wall.boxes.find((b) => b.id === data.boxId);
        const localX = box ? hitXCm - box.offsetX : 0;
        const door =
          (data.doorId ? box?.doors.find((d) => d.id === data.doorId) : undefined) ||
          box?.doors.find((d) => localX >= d.startCm - 0.5 && localX <= d.startCm + d.widthCm + 0.5);
        if (box && door && door.kind !== 'fridge') {
          const innerBot = box.elevY + box.plinth;
          const innerH = Math.max(10, box.height - box.plinth - box.countertopCm);
          const normY = Math.max(0, Math.min(1, 1 - (hitYCm - innerBot) / innerH));
          let rowCenterNorm = 0.5;
          let rowH = innerH;
          if ((door.kind === 'drawer' || door.kind === 'lift') && door.drawerRatios.length > 0) {
            const pts = [0, ...door.drawerRatios, 1];
            for (let ri = 0; ri < pts.length - 1; ri++) {
              if (normY >= pts[ri] && normY <= pts[ri + 1]) {
                rowCenterNorm = (pts[ri] + pts[ri + 1]) / 2;
                rowH = (pts[ri + 1] - pts[ri]) * innerH;
                break;
              }
            }
          } else if (door.kind === 'door' && door.doorStyle !== 'pantry') {
            rowCenterNorm = box.type === 'wall' || box.type === 'wall-deep' ? 0.82 : 0.18;
          }

          let xRatio = 0.5;
          if (door.kind === 'door' && door.doorStyle !== 'pantry') {
            const midDoorCm = door.startCm + door.widthCm / 2;
            xRatio = localX >= midDoorCm ? 0.86 : 0.14;
          }

          const handleCenterXCm = box.offsetX + door.startCm + xRatio * door.widthCm;
          const handleCenterYCm = innerBot + (1 - rowCenterNorm) * innerH;
          const hMesh = buildHandleMesh(
            cur.handleStyle,
            cur.handleOrient,
            16,
            door.widthCm * CM,
            rowH * CM,
            0.02,
            tr.normalSign,
            ghostMatTeal,
            ghostMatTeal
          );
          hMesh.position.set(
            handleCenterXCm * CM,
            handleCenterYCm * CM,
            tr.normalSign * (box.depth + 2.2) * CM
          );
          ghostGroup.add(hMesh);
          hasGhost = true;
          targetStatus = 'valid';
        }
      } else if (cur.tool === 'door-pencil' && data.boxId && data.doorId) {
        const box = wall.boxes.find((b) => b.id === data.boxId);
        const door = box?.doors.find((d) => d.id === data.doorId);
        if (box && door && door.kind === 'door') {
          const innerH = Math.max(10, box.height - box.plinth - box.countertopCm);
          const ratio = cur.doorBandRatio ?? 0.26;
          const bandH = innerH * ratio;
          const bandPos = cur.doorBandPos ?? 'top';
          const bandY =
            bandPos === 'top'
              ? box.elevY + box.plinth + innerH - bandH
              : box.elevY + box.plinth;
          addGhostBox(
            box.offsetX + door.startCm + 0.5,
            bandY,
            box.depth + 0.6,
            Math.max(4, door.widthCm - 1),
            bandH,
            2.5,
            ghostMatIndigo
          );
          hasGhost = true;
          targetStatus = 'valid';
        }
      } else if (cur.tool === 'finish' && data.boxId) {
        const box = wall.boxes.find((b) => b.id === data.boxId);
        if (box) {
          addGhostBox(box.offsetX, box.elevY, 0, box.width, box.height, box.depth + 3, ghostMatIndigo);
          hasGhost = true;
          targetStatus = 'valid';
        }
      } else if (cur.tool === 'finish' && (data.kind === 'countertop' || data.kind === 'backsplash')) {
        targetStatus = 'valid';
      } else if (cur.tool === 'door-style' && data.boxId && data.doorId) {
        targetStatus = 'valid';
      } else if ((cur.tool === 'pencil' || cur.tool === 'skeleton' || cur.tool === 'frame') && data.boxId) {
        targetStatus = 'valid';
      }

      setHoverPreview({
        clientX,
        clientY,
        hoverTarget: finishTarget,
        targetStatus,
        ...(previewSweepWidth !== undefined ? { sweepWidthCm: previewSweepWidth } : {}),
      });
      ghostGroup.visible = hasGhost;
      requestRender();
    };

    updateGhostAndHoverRef.current = updateGhostAndHover;


    const pinSurfaceCursor = (clientX:number,clientY:number) => {
      raycaster.setFromCamera(setNdc(clientX,clientY),camera);
      builtRef.current?.root.updateWorldMatrix(true,true);
      const hit=builtRef.current ? raycaster.intersectObjects(builtRef.current.interactables,false)[0] : null;
      if(hit) {
        const normal=hit.face?.normal.clone().transformDirection(hit.object.matrixWorld) || new THREE.Vector3(0,1,0);
        if(normal.dot(raycaster.ray.direction)>0)normal.negate();
        surfaceCursorRef.current.pin(hit.point,normal);
      } else {
        const floor=new THREE.Vector3();
        if(!raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),floor))return;
        surfaceCursorRef.current.pin(floor);
      }
      setHasPlacementCursor(true);
      updateSurfaceCursorMarker(surfaceMarker,surfaceCursorRef.current);
      updateGhostAndHover(clientX,clientY);
      requestRender();
    };
    const cursorScreen = (x:number,y:number) => surfaceCursorRef.current.screen(camera,renderer.domElement) || {x,y};

    const onPointerDown = (e: PointerEvent) => {
      if(e.pointerType === 'touch' && propsRef.current.tool !== 'select') {
        e.preventDefault();e.stopImmediatePropagation();controls.enabled=false;
        surfaceCursorRef.current.begin(e.pointerId,e.clientX,e.clientY);
        if(!surfaceCursorRef.current.point)pinSurfaceCursor(e.clientX,e.clientY);
        try{renderer.domElement.setPointerCapture(e.pointerId);}catch{}
        return;
      }
      if (e.button === 2) {
        rightDownClientRef.current = { x: e.clientX, y: e.clientY };
        return;
      }
      if (e.button !== 0 || !builtRef.current) return;
      downClientRef.current = { x: e.clientX, y: e.clientY };
      if (propsRef.current.tool === 'wall') return;

      raycaster.setFromCamera(setNdc(e.clientX, e.clientY), camera);
      const hits = raycaster.intersectObjects(builtRef.current.interactables, false);
      if (!hits.length) return;

      const topHit = hits[0];
      const data = resolveHitData(topHit.object);
      if (!data) return;

      const cur = propsRef.current;
      const wall = cur.project.walls.find((x) => x.id === data.wallId);
      if (!wall) return;

      const wallProj = projectPointerOntoWall(data.wallId, e.clientX, e.clientY);

      if (data.kind === 'appliance' && data.appId && wallProj) {
        const app = wall.appliances.find((a) => a.id === data.appId);
        const canDragApp =
          app &&
          (cur.tool === 'select' ||
            (cur.tool === 'gas' && app.kind === 'gas') ||
            (cur.tool === 'sink' && app.kind === 'sink') ||
            (cur.tool === 'appliance' && (app.kind === 'dishwasher' || app.kind === 'washing')));
        if (canDragApp && app) {
          cur.onSelectAppliance(wall.id, app.id);
          controls.enabled = false;
          e.stopPropagation();
          try {
            dom.setPointerCapture(e.pointerId);
          } catch {}
          drag3DRef.current = {
            kind: 'move-app',
            wallId: wall.id,
            appId: app.id,
            origX: app.offsetX,
            lastTargetX: app.offsetX,
            startDot: wallProj.xCm,
            sessionId: `3dapp_${Date.now()}`,
            moved: false,
          };
          return;
        }
      }

      if (cur.tool === 'select') {
        if (data.kind === 'box-handle' && data.boxId && data.handleSide && wallProj) {
          const box = wall.boxes.find((b) => b.id === data.boxId);
          if (box) {
            controls.enabled = false;
            e.stopPropagation();
            try {
              dom.setPointerCapture(e.pointerId);
            } catch {}
            drag3DRef.current = {
              kind: 'resize-box',
              wallId: wall.id,
              boxId: box.id,
              side: data.handleSide,
              origX: box.offsetX,
              origW: box.width,
              origElev: box.elevY,
              origH: box.height,
              lastElev: box.elevY,
              lastH: box.height,
              startDot: wallProj.xCm,
              startY: wallProj.yCm,
            };
          }
          return;
        }
        if (data.kind === 'unit-div' && data.boxId && data.seamCm !== undefined) {
          cur.onSelectUnitDivider(wall.id, { boxId: data.boxId, seamCm: data.seamCm });
          return;
        }
        if (data.kind === 'opening' && data.openingId) {
          cur.onSelectOpening(wall.id, data.openingId);
          return;
        }
        if (
          data.boxId &&
          (data.kind === 'box' ||
            data.kind === 'door' ||
            data.kind === 'countertop' ||
            data.kind === 'unit' ||
            data.kind === 'frame' ||
            data.kind === 'shelf' ||
            data.kind === 'handle')
        ) {
          const box = wall.boxes.find((b) => b.id === data.boxId);
          if (cur.selectionMode !== 'single') {
            const nextSel = data.doorId
              ? applySelectionMode3D(cur.project.multiSelection, cur.selectionMode, 'door', data.doorId)
              : applySelectionMode3D(cur.project.multiSelection, cur.selectionMode, 'box', data.boxId);
            cur.onSetMultiSelection(nextSel);
            cur.onSelectWallAndBox(
              wall.id,
              data.boxId,
              cur.selectionMode === 'subtract' ? null : data.doorId ?? null,
              true
            );
            return;
          }

          if (data.kind === 'unit' && data.unitStart !== undefined && data.unitEnd !== undefined) {
            cur.onSelectUnit(wall.id, { boxId: data.boxId, startCm: data.unitStart, endCm: data.unitEnd });
          } else if (data.kind === 'frame' && data.frameId) {
            cur.onSelectFrame(wall.id, data.boxId, data.frameId);
          } else if (data.kind === 'shelf' && data.shelfId) {
            cur.onSelectShelf(wall.id, data.boxId, data.shelfId);
          } else if (data.kind === 'handle' && data.handleId) {
            cur.onSelectHandle(wall.id, data.boxId, data.handleId);
          } else {
            cur.onSelectWallAndBox(wall.id, data.boxId, data.doorId ?? null);
          }

          if (box && wallProj) {
            controls.enabled = false;
            e.stopPropagation();
            try {
              dom.setPointerCapture(e.pointerId);
            } catch {}
            drag3DRef.current = {
              kind: 'move-box',
              wallId: wall.id,
              boxId: box.id,
              origX: box.offsetX,
              lastTargetX: box.offsetX,
              startDot: wallProj.xCm,
              sessionId: `3dbox_${Date.now()}`,
              moved: false,
            };
          }
          return;
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if(e.pointerType === 'touch' && surfaceCursorRef.current.dragging && propsRef.current.tool !== 'select') {
        if(surfaceCursorRef.current.moving(e.pointerId,e.clientX,e.clientY))pinSurfaceCursor(e.clientX,e.clientY);
        return;
      }
      const dr = drag3DRef.current;
      if (!dr) {
        if (e.buttons === 0 && e.target === renderer.domElement) {
          const now = performance.now();
          const last = lastHoverCheckRef.current;
          if (now - last.ts >= 32 || Math.hypot(e.clientX - last.x, e.clientY - last.y) >= 12) {
            lastHoverCheckRef.current = { x: e.clientX, y: e.clientY, ts: now };
            updateGhostAndHover(e.clientX, e.clientY);
          }
        } else if (e.buttons !== 0) {
          setHoverPreview((prev) => (prev ? null : prev));
        }
        return;
      }

      const proj = projectPointerOntoWall(dr.wallId, e.clientX, e.clientY);
      if (!proj) return;
      const cur = propsRef.current;
      const dc = downClientRef.current;
      const pointerMovedPx = dc ? Math.hypot(e.clientX - dc.x, e.clientY - dc.y) : 999;

      if (dr.kind === 'move-box') {
        if (!dr.moved && pointerMovedPx < 5 && Math.abs(proj.xCm - dr.startDot) < 2.5) return;
        dr.moved = true;
        const dx = Math.round((proj.xCm - dr.startDot) / 5) * 5;
        const target = dr.origX + dx;
        if (target !== dr.lastTargetX) {
          dr.lastTargetX = target;
          cur.onMoveBox(dr.wallId, dr.boxId, target, false, dr.sessionId);
        }
      } else if (dr.kind === 'move-app') {
        if (!dr.moved && pointerMovedPx < 5 && Math.abs(proj.xCm - dr.startDot) < 2.5) return;
        dr.moved = true;
        const dx = Math.round((proj.xCm - dr.startDot) / 5) * 5;
        const target = dr.origX + dx;
        if (target !== dr.lastTargetX) {
          dr.lastTargetX = target;
          cur.onMoveAppliance(dr.wallId, dr.appId, target, false, dr.sessionId);
        }
      } else if (dr.kind === 'resize-box') {
        const dx = Math.round(proj.xCm - dr.startDot);
        const dy = Math.round(proj.yCm - dr.startY);
        const wall = cur.project.walls.find((x) => x.id === dr.wallId);
        const box = wall?.boxes.find((b) => b.id === dr.boxId);
        if (!wall || !box) return;

        if ((box.type === 'wall' || box.type === 'wall-deep') && (dr.side === 'top' || dr.side === 'bottom')) {
          let nextElev = dr.origElev;
          let nextH = dr.origH;
          if (dr.side === 'top') {
            nextH = Math.max(25, Math.min(wall.height - dr.origElev, dr.origH + dy));
          } else {
            nextElev = Math.max(95, Math.min(dr.origElev + dr.origH - 25, dr.origElev + dy));
            nextH = dr.origH + (dr.origElev - nextElev);
          }
          dr.lastElev = nextElev;
          dr.lastH = nextH;
          cur.onResizeWallBoxesSynced(dr.wallId, dr.boxId, nextElev, nextH, false);
          return;
        }

        cur.onMutateWallById(
          dr.wallId,
          (w) => {
            const b = w.boxes.find((x) => x.id === dr.boxId);
            if (!b) return;
            if (dr.side === 'right') {
              b.width = Math.max(40, Math.min(w.length - b.offsetX, dr.origW + dx));
            } else if (dr.side === 'left') {
              const newOff = Math.max(0, Math.min(dr.origX + dr.origW - 40, dr.origX + dx));
              b.width = dr.origW + (dr.origX - newOff);
              b.offsetX = newOff;
            } else if (dr.side === 'top') {
              b.height = Math.max(40, Math.min(w.height - b.elevY, dr.origH + dy));
            }
            clampBoxInternalsAfterResize(b);
          },
          false
        );
      }
    };

    const onDoorSingleClick = (e: PointerEvent) => {
      if (!builtRef.current) return;
      raycaster.setFromCamera(setNdc(e.clientX, e.clientY), camera);
      const hits = raycaster.intersectObjects(builtRef.current.interactables, false);
      if (!hits.length) return;
      const data = resolveHitData(hits[0].object);
      if (!data?.doorId || !data.boxId) return;

      const cur = propsRef.current;
      const wall = cur.project.walls.find((x) => x.id === data.wallId);
      const box = wall?.boxes.find((b) => b.id === data.boxId);
      const door = box?.doors.find((d) => d.id === data.doorId);
      if (!box || !door) return;

      let rowIdx: number | undefined;
      if (data.animationId && data.animationId.includes(':row:')) {
        const raw = Number(data.animationId.split(':row:')[1]);
        if (!Number.isNaN(raw)) rowIdx = raw;
      }

      if (!canDoorOpenIn3D(box, door, rowIdx)) {
        cur.onToast('تا روی این درب دستگیره قرار ندهید درب باز نمی‌شود');
        return;
      }

      const partId = data.animationId || data.doorId;

      const states = doorStatesRef.current;
      const curSt = states.get(partId) || {
        cur: doorsOpenRef.current ? 1 : 0,
        target: doorsOpenRef.current ? 1 : 0,
      };
      curSt.target = curSt.target > 0.5 ? 0 : 1;
      states.set(partId, curSt);
      requestRender();
    };


    const onPointerUp = (e: PointerEvent) => {
      let actionX=e.clientX, actionY=e.clientY;
      if(e.pointerType==='touch' && propsRef.current.tool!=='select') {
        const commit=surfaceCursorRef.current.end(e.pointerId);
        controls.enabled=propsRef.current.tool!=='wall'&&propsRef.current.tool!=='cab-draw';
        if(!commit)return;
        const pinned=cursorScreen(actionX,actionY);
        actionX=pinned.x;actionY=pinned.y;
        downClientRef.current={x:actionX,y:actionY};
      }

      const dr = drag3DRef.current;
      drag3DRef.current = null;
      controls.enabled = true;
      try {
        if (dom.hasPointerCapture(e.pointerId)) dom.releasePointerCapture(e.pointerId);
      } catch {}

      const cur = propsRef.current;
      if (dr) {
        if (dr.kind === 'move-box' && !dr.moved && cur.tool === 'select') onDoorSingleClick(e);
        if (dr.kind === 'move-box' && dr.moved && dr.lastTargetX !== dr.origX) {
          cur.onMoveBox(dr.wallId, dr.boxId, dr.lastTargetX, true, dr.sessionId);
        } else if (dr.kind === 'move-app' && dr.moved && dr.lastTargetX !== dr.origX) {
          cur.onMoveAppliance(dr.wallId, dr.appId, dr.lastTargetX, true, dr.sessionId);
        } else if (dr.kind === 'resize-box') {
          const wall = cur.project.walls.find((x) => x.id === dr.wallId);
          const box = wall?.boxes.find((b) => b.id === dr.boxId);
          if (box && (box.type === 'wall' || box.type === 'wall-deep') && (dr.side === 'top' || dr.side === 'bottom')) {
            cur.onResizeWallBoxesSynced(dr.wallId, dr.boxId, dr.lastElev, dr.lastH, true);
          } else {
            cur.onMutateWallById(dr.wallId, () => {}, true);
          }
        }
        return;
      }

      const dc = downClientRef.current;
      downClientRef.current = null;
      if (!dc || Math.hypot(actionX - dc.x, actionY - dc.y) > 8 || !builtRef.current) return;
      if (cur.tool === 'select') onDoorSingleClick(e);

      if (cur.tool === 'wall') {
        const pt = raycastFloorPointCm(actionX, actionY);
        if (!pt) return;
        const start = pendingWallStart3DRef.current;
        if (!start) {
          pendingWallStart3DRef.current = pt;
          updateWallFloorPreview(actionX, actionY);
          cur.onToast('نقطه شروع دیوار ثبت شد — نقطه بعدی را روی زمین کلیک کنید');
          return;
        }
        const lenCm = Math.round(Math.hypot(pt.xCm - start.xCm, pt.yCm - start.yCm));
        if (lenCm < 40) {
          cur.onToast('طول دیوار باید حداقل ۴۰ سانتی‌متر باشد');
          return;
        }
        const newWall = createWall(
          `دیوار ${cur.project.walls.length + 1} (${lenCm})`,
          start.xCm,
          start.yCm,
          pt.xCm,
          pt.yCm
        );
        cur.onAddWall?.(newWall);
        pendingWallStart3DRef.current = pt;
        updateWallFloorPreview(actionX, actionY);
        cur.onToast(`دیوار (${lenCm}cm) رسم شد — نقطه بعدی یا راست‌کلیک برای پایان`);
        return;
      }

      // Complete 2-click cab-draw sweep even if pointer ends outside wall mesh bounds
      if (cur.tool === 'cab-draw' && pendingCabDraw3DRef.current) {
        const pending = pendingCabDraw3DRef.current;
        const pWall = cur.project.walls.find((x) => x.id === pending.wallId);
        const pTr = builtRef.current.wallTransforms.get(pending.wallId);
        if (pWall && pTr) {
          raycaster.setFromCamera(setNdc(actionX, actionY), camera);
          const sweepHits = raycaster.intersectObjects(builtRef.current.interactables, false);
          const sameWallHit = sweepHits.find((h) => resolveHitData(h.object)?.wallId === pWall.id);
          let currXCm: number | null = null;
          if (sameWallHit) {
            scratchRel.copy(sameWallHit.point).sub(pTr.origin);
            currXCm = Math.max(0, Math.min(pWall.length, scratchRel.dot(pTr.tangent) / CM));
          } else {
            const proj = projectPointerOntoWall(pWall.id, actionX, actionY);
            if (proj) currXCm = Math.max(0, Math.min(pWall.length, proj.xCm));
          }
          if (currXCm !== null) {
            const range = computeCabinetSweepRange(pending.startXCm, currXCm, pWall.length, 30);
            const box = createEmptyBox(pending.boxKind, range.offsetX, range.width, {
              settings: cur.project.settings,
            });
            let carvedTall = false;
            cur.onMutateWallById(
              pWall.id,
              (w) => {
                w.boxes.push(box);
                if (box.type === 'tall') {
                  carvedTall = carveBoxesForPlacedBox(w, box).carved;
                }
              },
              true,
              carvedTall
                ? `باکس ${box.name} (${range.width}cm) جایگزین و فضا برش داده شد`
                : `باکس ${box.name} (${range.width}cm) اضافه شد`
            );
            pendingCabDraw3DRef.current = null;
            clearGhost();
            cur.onSelectWallAndBox(pWall.id, box.id, null);
            return;
          }
        }
        pendingCabDraw3DRef.current = null;
        clearGhost();
      }

      raycaster.setFromCamera(setNdc(actionX, actionY), camera);
      const hits = raycaster.intersectObjects(builtRef.current.interactables, false);
      if (!hits.length) {
        if (cur.tool === 'doors') {
          const nextOrient: Orientation = cur.doorOrient === 'vertical' ? 'horizontal' : 'vertical';
          cur.onSetDoorOrient?.(nextOrient);
          cur.onToast(`جهت براش درب: ${nextOrient === 'vertical' ? 'عمودی (درب)' : 'افقی (کشو / جک‌دار)'}`);
        } else if (cur.tool === 'handle') {
          const nextOrient: Orientation = cur.handleOrient === 'vertical' ? 'horizontal' : 'vertical';
          cur.onSetHandleOrient?.(nextOrient);
          cur.onToast(`جهت دستگیره: ${nextOrient === 'vertical' ? 'عمودی' : 'افقی'}`);
        } else if (cur.tool === 'select') {
          cur.onSelectWallAndBox(cur.project.activeWallId || '', null, null);
        }
        return;
      }
      const topHit = hits[0];
      const data = resolveHitData(topHit.object);
      if (!data) return;
      const wall = cur.project.walls.find((x) => x.id === data.wallId);
      const tr = builtRef.current.wallTransforms.get(data.wallId);
      if (!wall || !tr) return;

      if (cur.tool === 'select') {
        if (data.kind === 'wall' || data.kind === 'backsplash' || data.kind === 'countertop') {
          cur.onSelectWallAndBox(wall.id, null, null);
        }
        return;
      }

      scratchRel.copy(topHit.point).sub(tr.origin);
      const hitXCm = Math.max(0, Math.min(wall.length, scratchRel.dot(tr.tangent) / CM));
      const hitYCm = Math.max(0, Math.min(wall.height, topHit.point.y / CM));

      if (cur.tool === 'cab-draw') {
        const startXCm = Math.max(0, Math.min(wall.length, Math.round(hitXCm / 5) * 5));
        pendingCabDraw3DRef.current = {
          wallId: wall.id,
          startXCm,
          boxKind: cur.drawBoxKind,
        };
        updateGhostAndHover(actionX, actionY);
        cur.onToast('نقطه شروع باکس ثبت شد — موس را روی دیوار بکشید و با کلیک دوم تمام کنید');
        return;
      }

      if (cur.tool === 'fridge') {
        const cfg = FRIDGE_MODELS[cur.fridgeModel];
        cur.onPlaceFridge(wall.id, hitXCm - cfg.width / 2);
        return;
      }

      if (cur.tool === 'opening') {
        const def = OPENING_DEFAULTS[cur.openingKind];
        const elev = cur.openingKind === 'window' ? Math.max(20, Math.round(hitYCm - def.height / 2)) : 0;
        cur.onPlaceOpening(wall.id, hitXCm - def.width / 2, elev);
        return;
      }

      if (cur.tool === 'sink' || cur.tool === 'gas' || cur.tool === 'appliance') {
        let baseBox = data.boxId ? wall.boxes.find((b) => b.id === data.boxId && b.type === 'base') : undefined;
        if (!baseBox) {
          baseBox = wall.boxes.find(
            (b) => b.type === 'base' && hitXCm >= b.offsetX - 5 && hitXCm <= b.offsetX + b.width + 5
          );
        }
        if (!baseBox) {
          cur.onToast('لطفاً روی یک باکس زمینی کلیک کنید');
          return;
        }
        const k: ApplianceKind =
          cur.tool === 'sink' ? 'sink' : cur.tool === 'gas' ? 'gas' : cur.applianceKind;
        const tw =
          k === 'sink' ? SINK_MODELS[cur.sinkModel].width : k === 'gas' ? cur.gasWidth : APPLIANCE_CONFIGS[k].width;
        cur.onPlaceAppliance(wall.id, baseBox.id, hitXCm - tw / 2, k);
        return;
      }

      if (cur.tool === 'doors') {
        if (cur.project.doorsLocked) {
          cur.onToast('درب‌ها قفل هستند؛ قفل را باز کنید');
          return;
        }
        if (!data.boxId) {
          const nextOrient: Orientation = cur.doorOrient === 'vertical' ? 'horizontal' : 'vertical';
          cur.onSetDoorOrient?.(nextOrient);
          cur.onToast(`جهت براش درب: ${nextOrient === 'vertical' ? 'عمودی (درب)' : 'افقی (کشو / جک‌دار)'}`);
          return;
        }
        const box = wall.boxes.find((b) => b.id === data.boxId);
        if (!box || box.type === 'fridge') return;
        const blockedZones = getCornerBlockedZonesForWall(wall, cur.project.walls, cur.project.cornerOwners);
        const cursorCm = hitXCm - box.offsetX;
        const prev = computeDoorBrushPreview(
          box,
          cursorCm,
          cur.doorOrient,
          cur.doorVertCount,
          cur.drawerPatIdx,
          cur.liftPatIdx,
          blockedZones,
          cur.doorTargetWidth
        );
        if (!prev.ok) {
          cur.onToast(prev.reason || 'امکان درب‌گذاری نیست');
          return;
        }
        let selDoor: string | null = null;
        cur.onMutateWallById(
          wall.id,
          (w) => {
            const b = w.boxes.find((x) => x.id === box.id);
            if (!b) return;
            selDoor = applyDoorBrushPreview(b, cursorCm, prev, blockedZones).selectedDoorId;
          },
          true
        );
        cur.onSelectWallAndBox(wall.id, box.id, selDoor);
        return;
      }

      if (cur.tool === 'door-pencil') {
        if (cur.project.doorsLocked) {
          cur.onToast('درب‌ها قفل هستند؛ ابتدا قفل را باز کنید');
          return;
        }
        const pos = cur.doorBandPos ?? 'top';
        const ratio = cur.doorBandRatio ?? 0.26;
        if (!data.boxId || !data.doorId) {
          const nxt = pos === 'top' ? 'bottom' : 'top';
          cur.onSetDoorBandPos?.(nxt);
          cur.onToast(`موقعیت کشو: ${nxt === 'top' ? 'بالای درب' : 'پایین درب'}`);
          return;
        }
        const box = wall.boxes.find((b) => b.id === data.boxId);
        const targetDoor = box?.doors.find((d) => d.id === data.doorId);
        if (!box || !targetDoor || targetDoor.kind !== 'door') {
          cur.onToast('روی درب‌های عمودی کلیک کنید');
          return;
        }
        const shouldRemove = targetDoor.drawerBand?.position === pos;
        cur.onMutateWallById(
          wall.id,
          (w) => {
            const b = w.boxes.find((x) => x.id === box.id);
            if (b) applyDoorDrawerBand(b, [targetDoor.id], shouldRemove ? null : { position: pos, ratio });
          },
          true,
          shouldRemove ? 'کشوی درب برداشته شد' : `کشوی ${pos === 'top' ? 'بالا' : 'پایین'} ثبت شد`
        );
        cur.onSelectWallAndBox(wall.id, box.id, targetDoor.id);
        return;
      }

      if (cur.tool === 'door-style') {
        if (cur.selectionMode !== 'single' && data.boxId && data.doorId) {
          const nextSel = applySelectionMode3D(
            cur.project.multiSelection,
            cur.selectionMode,
            'door',
            data.doorId
          );
          cur.onSetMultiSelection(nextSel);
          cur.onSelectWallAndBox(
            wall.id,
            data.boxId,
            cur.selectionMode === 'subtract' ? null : data.doorId,
            true
          );
          return;
        }
        if (cur.project.multiSelection && cur.project.multiSelection.doorIds.length > 0) {
          cur.onApplyDoorStyle(null, cur.project.multiSelection.doorIds, cur.doorStyleBrush);
          return;
        }
        if (data.boxId && data.doorId) {
          cur.onApplyDoorStyle(data.boxId, [data.doorId], cur.doorStyleBrush);
        } else if (data.boxId) {
          cur.onApplyDoorStyle(data.boxId, null, cur.doorStyleBrush);
        } else {
          const idx = Math.max(0, DOOR_STYLE_ORDER.indexOf(cur.doorStyleBrush));
          const nxt = DOOR_STYLE_ORDER[(idx + 1) % DOOR_STYLE_ORDER.length];
          cur.onSetDoorStyleBrush(nxt);
          cur.onToast(`مدل قلم: ${DOOR_STYLE_META[nxt].label}`);
        }
        return;
      }

      if (cur.tool === 'finish') {
        if (data.kind === 'countertop') {
          cur.onApplyFinish('countertop', wall.id);
          return;
        }
        if (data.kind === 'backsplash') {
          cur.onApplyFinish('backsplash', wall.id);
          return;
        }
        if (data.boxId) {
          cur.onApplyFinish('box', wall.id, data.boxId);
          cur.onSelectWallAndBox(wall.id, data.boxId, null);
          return;
        }
        const idx = Math.max(0, CABINET_FINISH_ORDER.indexOf(cur.cabinetFinishBrush));
        const nxt = CABINET_FINISH_ORDER[(idx + 1) % CABINET_FINISH_ORDER.length];
        cur.onSetCabinetFinishBrush(nxt);
        cur.onToast(`رنگ قلم: ${CABINET_FINISHES[nxt].label}`);
        return;
      }

      if (cur.tool === 'pencil' || cur.tool === 'skeleton') {
        if (!data.boxId) return;
        const box = wall.boxes.find((b) => b.id === data.boxId);
        if (!box || box.type === 'fridge') return;
        const blockedZones = getCornerBlockedZonesForWall(wall, cur.project.walls, cur.project.cornerOwners);
        const clickCm = hitXCm - box.offsetX;
        let seam: number | null = null;
        for (const d of box.doors) {
          if (d.startCm > 2 && Math.abs(clickCm - d.startCm) < 8) seam = d.startCm;
          const endCm = d.startCm + d.widthCm;
          if (endCm < box.width - 2 && Math.abs(clickCm - endCm) < 8) seam = endCm;
        }
        for (const u of box.unitDividers) {
          if (Math.abs(clickCm - u) < 8) seam = u;
        }
        if (seam !== null) {
          const sv = +seam.toFixed(1);
          const hasDiv = box.unitDividers.some((u) => Math.abs(u - sv) < 1.5);
          cur.onMutateWallById(
            wall.id,
            (w) => {
              const b = w.boxes.find((x) => x.id === box.id);
              if (!b) return;
              if (hasDiv) removeUnitDividerWithSync(b, sv, blockedZones);
              else {
                b.unitDividers.push(sv);
                b.unitDividers.sort((a, c) => a - c);
              }
            },
            true,
            hasDiv ? 'دیواره یونیت برداشته شد' : 'دیواره یونیت (32mm) ثبت شد'
          );
        } else {
          const units = getUnitsInBox(box, blockedZones);
          const u = units.find((x) => clickCm >= x.startCm - 0.5 && clickCm <= x.endCm + 0.5);
          if (!u || !u.canHaveShelves) {
            cur.onToast(u?.blockedReason || 'امکان طبقه‌گذاری نیست');
            return;
          }
          const innerH = Math.max(10, box.height - box.plinth - box.countertopCm);
          const clickRatio = Math.max(
            0.12,
            Math.min(0.88, 1 - (hitYCm - box.elevY - box.plinth) / innerH)
          );
          let shelfMsg = '';
          cur.onMutateWallById(
            wall.id,
            (w) => {
              const b = w.boxes.find((x) => x.id === box.id);
              if (!b) return;
              shelfMsg = addShelvesWithMinGap(
                b,
                u.startCm,
                u.endCm,
                cur.shelfCount,
                clickRatio
              ).message;
            },
            true
          );
          if (shelfMsg) cur.onToast(shelfMsg);
        }
        return;
      }

      if (cur.tool === 'frame' && data.boxId) {
        const box = wall.boxes.find((b) => b.id === data.boxId);
        if (!box) return;
        const clickCm = hitXCm - box.offsetX;
        const blockedZones = getCornerBlockedZonesForWall(wall, cur.project.walls, cur.project.cornerOwners);
        const exposure = getBoxSideExposure(box, wall, cur.project.walls, cur.project.cornerOwners, blockedZones);
        const topEdge = box.elevY + box.height;
        const botEdge = box.elevY + box.plinth;
        let side: 'left' | 'right' | 'top' | 'bottom' | 'seam' = 'top';
        let seamCm: number | undefined;
        if (Math.abs(clickCm) <= 10) side = 'left';
        else if (Math.abs(box.width - clickCm) <= 10) side = 'right';
        else if (Math.abs(topEdge - hitYCm) <= 12) side = 'top';
        else if (Math.abs(hitYCm - botEdge) <= 12) side = 'bottom';
        else {
          side = 'seam';
          seamCm = clickCm;
        }
        let msg = '';
        cur.onMutateWallById(
          wall.id,
          (w) => {
            const b = w.boxes.find((x) => x.id === box.id);
            if (b) msg = placeFrameOnBox(b, side, cur.frameWidthCm, seamCm, exposure).message;
          },
          true
        );
        if (msg) cur.onToast(msg);
        return;
      }

      if (cur.tool === 'handle') {
        const box = data.boxId ? wall.boxes.find((b) => b.id === data.boxId) : undefined;
        const localX = box ? hitXCm - box.offsetX : 0;
        const door =
          (data.doorId ? box?.doors.find((d) => d.id === data.doorId) : undefined) ||
          box?.doors.find((d) => localX >= d.startCm - 0.5 && localX <= d.startCm + d.widthCm + 0.5);

        if (!box || !door || door.kind === 'fridge') {
          const nextOrient: Orientation = cur.handleOrient === 'vertical' ? 'horizontal' : 'vertical';
          cur.onSetHandleOrient?.(nextOrient);
          cur.onToast(`جهت دستگیره: ${nextOrient === 'vertical' ? 'عمودی' : 'افقی'}`);
          return;
        }
        if (cur.selectionMode !== 'single') {
          const nextSel = applySelectionMode3D(
            cur.project.multiSelection,
            cur.selectionMode,
            'door',
            door.id
          );
          cur.onSetMultiSelection(nextSel);
          cur.onSelectWallAndBox(
            wall.id,
            box.id,
            cur.selectionMode === 'subtract' ? null : door.id,
            true
          );
          return;
        }

        const innerBot = box.elevY + box.plinth;
        const innerH = Math.max(10, box.height - box.plinth - box.countertopCm);
        const normY = Math.max(0, Math.min(1, 1 - (hitYCm - innerBot) / innerH));
        let rowIndex = 0;
        let yRatio = box.type === 'wall' || box.type === 'wall-deep' ? 0.82 : 0.18;

        if ((door.kind === 'drawer' || door.kind === 'lift') && door.drawerRatios.length > 0) {
          const pts = [0, ...door.drawerRatios, 1];
          for (let ri = 0; ri < pts.length - 1; ri++) {
            if (normY >= pts[ri] && normY <= pts[ri + 1]) {
              rowIndex = ri;
              yRatio = 0.5;
              break;
            }
          }
        } else if (door.kind === 'door' && door.doorStyle === 'pantry') {
          yRatio = 0.5;
        }

        let xRatio = 0.5;
        if (door.kind === 'door' && door.doorStyle !== 'pantry') {
          const midDoorCm = door.startCm + door.widthCm / 2;
          xRatio = localX >= midDoorCm ? 0.86 : 0.14;
        }

        const blockedZones = getCornerBlockedZonesForWall(wall, cur.project.walls, cur.project.cornerOwners);
        cur.onMutateWallById(
          wall.id,
          (w) => {
            const b = w.boxes.find((x) => x.id === box.id);
            if (!b) return;
            autoUnitizeBoxForHandles(b, blockedZones);
            const targetDoor = b.doors.find((d) => d.id === door.id);
            if (targetDoor && targetDoor.kind === 'door' && targetDoor.doorStyle !== 'pantry') {
              targetDoor.hingeSide = xRatio >= 0.65 ? 'left' : 'right';
            }
            b.handles = b.handles.filter((h) => !(h.doorId === door.id && (h.rowIndex ?? 0) === rowIndex));
            const hItem: HandleItem = {
              id: uid('hand'),
              doorId: door.id,
              rowIndex,
              xRatio,
              yRatio,
              orient: cur.handleOrient,
              style: cur.handleStyle,
              lengthCm: 16,
            };
            b.handles.push(hItem);
          },
          true,
          'دستگیره نصب شد'
        );
        cur.onSelectWallAndBox(wall.id, box.id, door.id);
        return;
      }

      if (cur.tool === 'eraser') {
        if (data.kind === 'opening' && data.openingId) {
          cur.onDeleteOpening(wall.id, data.openingId);
        } else if (data.kind === 'appliance' && data.appId) {
          cur.onMutateWallById(
            wall.id,
            (w) => deleteApplianceHierarchically(w, data.appId!),
            true,
            'تجهیز حذف شد'
          );
        } else if (data.kind === 'handle' && data.boxId && data.handleId) {
          cur.onMutateWallById(
            wall.id,
            (w) => {
              const b = w.boxes.find((x) => x.id === data.boxId);
              if (b) {
                const removed = b.handles.find((h) => h.id === data.handleId);
                b.handles = b.handles.filter((h) => h.id !== data.handleId);
                if (removed && !b.handles.some((h) => h.doorId === removed.doorId)) {
                  const affDoor = b.doors.find((d) => d.id === removed.doorId);
                  if (affDoor) affDoor.hingeSide = undefined;
                }
              }
            },
            true,
            'دستگیره حذف شد'
          );
        } else if (data.kind === 'frame' && data.boxId && data.frameId) {
          cur.onMutateWallById(
            wall.id,
            (w) => {
              const b = w.boxes.find((x) => x.id === data.boxId);
              if (b && b.frames) b.frames = b.frames.filter((f) => f.id !== data.frameId);
            },
            true,
            'فریم حذف شد'
          );
        } else if (data.kind === 'shelf' && data.boxId && data.shelfId) {
          cur.onMutateWallById(
            wall.id,
            (w) => {
              const b = w.boxes.find((x) => x.id === data.boxId);
              if (b) b.shelves = b.shelves.filter((s) => s.id !== data.shelfId);
            },
            true,
            'طبقه حذف شد'
          );
        } else if (data.kind === 'unit-div' && data.boxId && data.seamCm !== undefined) {
          const blockedZones = getCornerBlockedZonesForWall(wall, cur.project.walls, cur.project.cornerOwners);
          cur.onMutateWallById(
            wall.id,
            (w) => {
              const b = w.boxes.find((x) => x.id === data.boxId);
              if (b) removeUnitDividerWithSync(b, data.seamCm!, blockedZones);
            },
            true,
            'دیواره یونیت حذف شد'
          );
        } else if (data.kind === 'door' && data.boxId && data.doorId) {
          if (cur.project.doorsLocked) {
            cur.onToast('درب‌ها قفل هستند');
            return;
          }
          cur.onMutateWallById(
            wall.id,
            (w) => {
              const b = w.boxes.find((x) => x.id === data.boxId);
              if (b) eraseDoorWithRule(b, data.doorId!);
            },
            true,
            'درب حذف شد'
          );
        } else if (data.kind === 'box' && data.boxId) {
          cur.onMutateWallById(
            wall.id,
            (w) => deleteBoxHierarchically(w, data.boxId!),
            true,
            'باکس حذف شد'
          );
        }
      }
    };

    commitPlacementRef.current = () => {
      if(propsRef.current.tool==='select')return;
      const pinned=surfaceCursorRef.current.screen(camera,renderer.domElement);
      if(!pinned)return;
      downClientRef.current={x:pinned.x,y:pinned.y};
      onPointerUp(new PointerEvent('pointerup',{clientX:pinned.x,clientY:pinned.y,pointerType:'mouse',button:0}));
    };

    const is3DCyclableTool = (t: ToolId): boolean =>
      t !== 'select' && t !== 'wall' && t !== 'eraser';

    const step3DToolOption = (dir: 1 | -1, clientX: number, clientY: number): boolean => {
      const cur = propsRef.current;
      let contextBox: { type: string } | null = null;
      let hitKind: string | undefined;

      if (builtRef.current) {
        raycaster.setFromCamera(setNdc(clientX, clientY), camera);
        const hits = raycaster.intersectObjects(builtRef.current.interactables, false);
        const data = hits[0] ? resolveHitData(hits[0].object) : null;
        if (data) {
          hitKind = data.kind;
          const wall = cur.project.walls.find((x) => x.id === data.wallId);
          contextBox = wall && data.boxId ? wall.boxes.find((b) => b.id === data.boxId) || null : null;
        }
      }

      if (cur.tool === 'handle') {
        const idx = Math.max(0, HANDLE_STYLE_ORDER.indexOf(cur.handleStyle));
        const nxt = HANDLE_STYLE_ORDER[(idx + (dir > 0 ? 1 : HANDLE_STYLE_ORDER.length - 1)) % HANDLE_STYLE_ORDER.length];
        cur.onSetHandleStyle?.(nxt);
        cur.onToast(`مدل دستگیره: ${nxt === 'knob' ? 'دکمه‌ای' : nxt === 'hidden' ? 'مخفی' : 'میله‌ای'}`);
        return true;
      }
      if (cur.tool === 'cab-draw') {
        const idx = Math.max(0, CAB_DRAW_KIND_ORDER.indexOf(cur.drawBoxKind));
        const next = CAB_DRAW_KIND_ORDER[(idx + (dir > 0 ? 1 : CAB_DRAW_KIND_ORDER.length - 1)) % CAB_DRAW_KIND_ORDER.length];
        cur.onSelectDrawBoxKind?.(next);
        cur.onToast(`مدل باکس: ${BOX_PRESETS[next].name}`);
        return true;
      }
      if (cur.tool === 'doors') {
        if (cur.doorOrient === 'vertical') {
          cur.onSetDoorVertCount(Math.max(1, Math.min(4, cur.doorVertCount + dir)));
        } else if (contextBox && (contextBox.type === 'wall' || contextBox.type === 'wall-deep')) {
          cur.onSetLiftPatIdx((cur.liftPatIdx + (dir > 0 ? 1 : LIFT_PATTERNS.length - 1)) % LIFT_PATTERNS.length);
        } else {
          cur.onSetDrawerPatIdx(
            (cur.drawerPatIdx + (dir > 0 ? 1 : DRAWER_PATTERNS.length - 1)) % DRAWER_PATTERNS.length
          );
        }
        return true;
      }
      if (cur.tool === 'sink') {
        const idx = SINK_MODEL_ORDER.indexOf(cur.sinkModel);
        cur.onSetSinkModel(
          SINK_MODEL_ORDER[(idx + (dir > 0 ? 1 : SINK_MODEL_ORDER.length - 1)) % SINK_MODEL_ORDER.length]
        );
        return true;
      }
      if (cur.tool === 'gas') {
        const widths = [...GAS_WIDTH_OPTIONS];
        const idx = Math.max(0, widths.indexOf(cur.gasWidth as (typeof GAS_WIDTH_OPTIONS)[number]));
        cur.onSetGasWidth(widths[(idx + (dir > 0 ? 1 : widths.length - 1)) % widths.length]);
        return true;
      }
      if (cur.tool === 'appliance') {
        const idx = Math.max(0, APPLIANCE_ORDER.indexOf(cur.applianceKind));
        cur.onSetApplianceKind(
          APPLIANCE_ORDER[(idx + (dir > 0 ? 1 : APPLIANCE_ORDER.length - 1)) % APPLIANCE_ORDER.length]
        );
        return true;
      }
      if (cur.tool === 'fridge') {
        const idx = FRIDGE_MODEL_ORDER.indexOf(cur.fridgeModel);
        cur.onSetFridgeModel(
          FRIDGE_MODEL_ORDER[(idx + (dir > 0 ? 1 : FRIDGE_MODEL_ORDER.length - 1)) % FRIDGE_MODEL_ORDER.length]
        );
        return true;
      }
      if (cur.tool === 'opening') {
        const idx = OPENING_ORDER.indexOf(cur.openingKind);
        cur.onSetOpeningKind(
          OPENING_ORDER[(idx + (dir > 0 ? 1 : OPENING_ORDER.length - 1)) % OPENING_ORDER.length]
        );
        return true;
      }
      if (cur.tool === 'door-style') {
        const idx = Math.max(0, DOOR_STYLE_ORDER.indexOf(cur.doorStyleBrush));
        const nxt = DOOR_STYLE_ORDER[(idx + (dir > 0 ? 1 : DOOR_STYLE_ORDER.length - 1)) % DOOR_STYLE_ORDER.length];
        cur.onSetDoorStyleBrush(nxt);
        cur.onToast(`مدل درب: ${DOOR_STYLE_META[nxt].label}`);
        return true;
      }
      if (cur.tool === 'finish') {
        if (hitKind === 'countertop') {
          const idx = Math.max(0, COUNTERTOP_FINISH_ORDER.indexOf(cur.countertopBrush));
          const nxt =
            COUNTERTOP_FINISH_ORDER[(idx + (dir > 0 ? 1 : COUNTERTOP_FINISH_ORDER.length - 1)) % COUNTERTOP_FINISH_ORDER.length];
          cur.onSetCountertopBrush(nxt);
          cur.onToast(`صفحه: ${COUNTERTOP_FINISHES[nxt].label}`);
        } else if (hitKind === 'backsplash') {
          const idx = Math.max(0, BACKSPLASH_FINISH_ORDER.indexOf(cur.backsplashBrush));
          const nxt =
            BACKSPLASH_FINISH_ORDER[(idx + (dir > 0 ? 1 : BACKSPLASH_FINISH_ORDER.length - 1)) % BACKSPLASH_FINISH_ORDER.length];
          cur.onSetBacksplashBrush(nxt);
          cur.onToast(`کاشی بین‌کابینتی: ${BACKSPLASH_FINISHES[nxt].label}`);
        } else {
          const idx = Math.max(0, CABINET_FINISH_ORDER.indexOf(cur.cabinetFinishBrush));
          const nxt =
            CABINET_FINISH_ORDER[(idx + (dir > 0 ? 1 : CABINET_FINISH_ORDER.length - 1)) % CABINET_FINISH_ORDER.length];
          cur.onSetCabinetFinishBrush(nxt);
          cur.onToast(`رنگ کابینت: ${CABINET_FINISHES[nxt].label}`);
        }
        return true;
      }
      if (cur.tool === 'door-pencil') {
        const nxt = (cur.doorBandPos ?? 'top') === 'top' ? 'bottom' : 'top';
        cur.onSetDoorBandPos?.(nxt);
        cur.onToast(`موقعیت کشو: ${nxt === 'top' ? 'بالای درب' : 'پایین درب'}`);
        return true;
      }
      if (cur.tool === 'pencil' || cur.tool === 'skeleton') {
        cur.onSetShelfCount(Math.max(1, Math.min(4, cur.shelfCount + dir)));
        return true;
      }
      if (cur.tool === 'frame') {
        const idx = Math.max(
          0,
          FRAME_WIDTH_OPTIONS.indexOf(cur.frameWidthCm as (typeof FRAME_WIDTH_OPTIONS)[number])
        );
        const nextIdx = Math.max(0, Math.min(FRAME_WIDTH_OPTIONS.length - 1, idx + dir));
        cur.onSetFrameWidthCm(FRAME_WIDTH_OPTIONS[nextIdx]);
        return true;
      }
      return false;
    };

    const onWheelCapture = (e: WheelEvent) => {
      if (!builtRef.current) return;
      const cur = propsRef.current;
      // Ctrl+wheel remains available for ordinary canvas zoom.
      if (!e.ctrlKey && is3DCyclableTool(cur.tool)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const pacedDir = gestureStepperRef.current.consumeWheelDelta(e.deltaY, e.deltaMode);
        if (pacedDir !== 0) {
          step3DToolOption(pacedDir, e.clientX, e.clientY);
        }
        requestAnimationFrame(() => updateGhostAndHover(e.clientX, e.clientY));
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      rightDownClientRef.current = null;

      if (pendingWallStart3DRef.current) {
        pendingWallStart3DRef.current = null;
        clearWallFloorPreview();
        requestRender();
      }
      if (pendingCabDraw3DRef.current) {
        pendingCabDraw3DRef.current = null;
        clearGhost();
        requestRender();
      }
      if (propsRef.current.tool !== 'select') {
        propsRef.current.onExitToSelect();
      }
    };

    let lastTwoFingerMidY: number | null = null;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2 && is3DCyclableTool(propsRef.current.tool)) {
        surfaceCursorRef.current.cancelGesture();
        controls.enabled = false;
        gestureStepperRef.current.resetTouch();
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        lastTwoFingerMidY = midY;
        if(!surfaceCursorRef.current.point)pinSurfaceCursor(midX,midY);
        const target=cursorScreen(midX,midY);
        updateGhostAndHover(target.x,target.y);
      } else {
        lastTwoFingerMidY = null;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (
        e.touches.length !== 2 ||
        !is3DCyclableTool(propsRef.current.tool) ||
        lastTwoFingerMidY === null
      ) {
        return;
      }
      e.preventDefault();
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const deltaY = midY - lastTwoFingerMidY;
      lastTwoFingerMidY = midY;
      const pacedDir = gestureStepperRef.current.consumeTouchDelta(deltaY);
      if (pacedDir !== 0) {
        const target=cursorScreen(midX,midY);
        step3DToolOption(pacedDir, target.x, target.y);
      }
      const target=cursorScreen(midX,midY);
      requestAnimationFrame(() => updateGhostAndHover(target.x,target.y));
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        lastTwoFingerMidY = null;
        gestureStepperRef.current.resetTouch();
        if (!drag3DRef.current) controls.enabled = true;
      }
    };

    const onPointerLeave = () => {
      if(surfaceCursorRef.current.point)return;
      clearGhost();
      clearWallFloorPreview();
      setHoverPreview(null);
    };

    const dom = renderer.domElement;
    const onPlacementKey = (event:KeyboardEvent) => {
      if(event.key==='Enter' && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || (event.target as HTMLElement)?.isContentEditable)) {
        event.preventDefault();commitPlacementRef.current();
      }
    };
    window.addEventListener('keydown',onPlacementKey);
    dom.addEventListener('wheel', onWheelCapture, { passive: false, capture: true });
    dom.addEventListener('pointerdown', onPointerDown, { capture: true });
    dom.addEventListener('contextmenu', onContextMenu);
    dom.addEventListener('touchstart', onTouchStart, { passive: true });
    dom.addEventListener('touchmove', onTouchMove, { passive: false });
    dom.addEventListener('touchend', onTouchEnd);
    dom.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('resize', onPointerLeave);
    window.addEventListener('blur', onPointerLeave);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      ro.disconnect();
      dom.removeEventListener('wheel', onWheelCapture, { capture: true });
      dom.removeEventListener('pointerdown', onPointerDown, { capture: true });
      window.removeEventListener('keydown',onPlacementKey);
      disposeObject3D(surfaceMarker);
      dom.removeEventListener('contextmenu', onContextMenu);
      dom.removeEventListener('touchstart', onTouchStart);
      dom.removeEventListener('touchmove', onTouchMove);
      dom.removeEventListener('touchend', onTouchEnd);
      dom.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('resize', onPointerLeave);
      window.removeEventListener('blur', onPointerLeave);
      controls.removeEventListener('change', requestRender);
      controls.dispose();
      clearGhost();
      clearWallFloorPreview();
      disposeObject3D(floorWallGroup);
      ghostMatIndigo.dispose();
      ghostMatTeal.dispose();
      ghostMatDanger.dispose();
      ghostMatWire.dispose();
      if (builtRef.current) {
        disposeObject3D(builtRef.current.root);
        builtRef.current = null;
      }
      envTex.dispose();
      pmrem.dispose();
      renderer.dispose();
      if (dom.parentNode === container) container.removeChild(dom);
      if (rendererRef.current === renderer) rendererRef.current = null;
      if (sceneRef.current === scene) sceneRef.current = null;
      if (cameraRef.current === camera) cameraRef.current = null;
      if (controlsRef.current === controls) controlsRef.current = null;
      camInitDoneRef.current = false;
    };
  }, [props.scanMode]);

  useEffect(() => {
    // Mouse-only 3D mode: while a drawing tool is selected, clicking commits
    // segments, not a camera orbit. The pointer preview stays attached to the
    // cursor before the first click and while waiting for the second.
    if (controlsRef.current) {
      controlsRef.current.enabled = !props.scanMode && tool !== 'wall' && tool !== 'cab-draw';
    }
    if (tool !== 'cab-draw') {
      pendingCabDraw3DRef.current = null;
    }
    if (tool === 'wall') {
      // Show the floor target immediately when the wall tool is selected.
      const rect = hostRef.current?.getBoundingClientRect();
      if (rect) updateWallPreviewRef.current(rect.left + rect.width * 0.5, rect.top + rect.height * 0.68);
    } else {
      pendingWallStart3DRef.current = null;
      clearWallPreviewRef.current();
      requestRenderRef.current();
    }
    if (!props.scanMode && tool !== 'select') {
      const last = lastHoverCheckRef.current;
      const rect = rendererRef.current?.domElement.getBoundingClientRect();
      if (rect && last.x >= rect.left && last.x <= rect.right &&
          last.y >= rect.top && last.y <= rect.bottom) {
        updateGhostAndHoverRef.current(last.x, last.y);
      }
    }
  }, [tool, props.drawBoxKind, props.scanMode]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (builtRef.current) {
      scene.remove(builtRef.current.root);
      disposeObject3D(builtRef.current.root);
      builtRef.current = null;
    }

    const built = buildKitchen3DScene(project, {
      doorOpenProgress: 0,
    });
    builtRef.current = built;
    scene.add(built.root);

    // Reapply current door open/close states smoothly without snapping
    const states = doorStatesRef.current;
    for (const h of built.animatedDoors) {
      let st = states.get(h.doorId);
      if (!st) {
        st = { cur: doorsOpenRef.current ? 1 : 0, target: doorsOpenRef.current ? 1 : 0 };
        states.set(h.doorId, st);
      }
      if (st.cur > 0.001) {
        applyAnimatedDoorProgress(h, st.cur);
      }
    }

    if (!camInitDoneRef.current) {
      camInitDoneRef.current = true;
      applyCameraPreset('iso', built.bounds);
    } else {
      requestRenderRef.current();
    }
  }, [project, props.scanMode]);

  // Choosing a handle now previews it on EVERY selected door in the real
  // 3D scene, not only beneath a hovering mouse pointer.
  useEffect(() => {
    const built = builtRef.current;
    if (!built || props.scanMode || tool !== 'handle') return;
    const previews = attachSelectedHandlePreviews(built, project, props.handleStyle, props.handleOrient);
    requestRenderRef.current();
    return () => {
      for (const preview of previews) {
        preview.parent?.remove(preview);
        disposeObject3D(preview);
      }
      requestRenderRef.current();
    };
  }, [project, props.scanMode, tool, props.handleStyle, props.handleOrient]);

  const handleToggleAllDoors = () => {
    const nextOpen = !doorsOpen;
    if (nextOpen && (!builtRef.current || builtRef.current.animatedDoors.length === 0)) {
      props.onToast('برای باز شدن درب‌ها ابتدا روی آن‌ها دستگیره قرار دهید');
      return;
    }
    setDoorsOpen(nextOpen);
    const states = doorStatesRef.current;
    const targetVal = nextOpen ? 1 : 0;
    if (builtRef.current) {
      for (const h of builtRef.current.animatedDoors) {
        const curSt = states.get(h.doorId) || { cur: doorsOpen ? 1 : 0, target: doorsOpen ? 1 : 0 };
        curSt.target = targetVal;
        states.set(h.doorId, curSt);
      }
    }
    requestRenderRef.current();
  };

  const handleSetWideViewMode = (mode: WideViewMode) => {
    wideViewModeRef.current = mode;
    setLocalWideViewMode(mode);
    props.onWideViewModeChange?.(mode);
    if (cameraRef.current) {
      cameraRef.current.fov = wideViewVerticalFov(mode, cameraRef.current.aspect);
      cameraRef.current.updateProjectionMatrix();
      requestRenderRef.current();
    }
  };

  const handleSetCamPreset = (p: 'iso' | 'front' | 'top') => {
    setCamPreset(p);
    applyCameraPreset(p);
  };

  return (
    <div
      data-testid="scene-3d-root"
      data-cursor-placed={hasPlacementCursor ? '1' : '0'}
      data-cursor-x={surfaceCursorRef.current.point?.x}
      data-cursor-y={surfaceCursorRef.current.point?.y}
      data-cursor-z={surfaceCursorRef.current.point?.z}
      data-active-wall-id={project.activeWallId || ''}
      className={`relative w-full h-full overflow-hidden select-none ${props.scanMode
        ? 'z-50 pointer-events-none bg-transparent'
        : 'bg-slate-100'}`}
    >
      <div ref={hostRef} className={props.scanMode
        ? 'w-full h-full invisible pointer-events-none'
        : 'w-full h-full'} />

      {/* نوار شناور بالای نمای سه‌بعدی (دوربین، باز شدن درها، انتخاب دیوار) */}
      <div className="absolute top-2.5 right-3 left-3 flex flex-wrap items-center justify-between gap-2 pointer-events-none z-[60]">
        <div className="pointer-events-auto flex items-center gap-1 bg-white/95 border border-slate-300 rounded-xl p-1 shadow-sm">
          <button
            type="button"
            onClick={() => handleSetCamPreset('iso')}
            className={`h-7 px-2.5 rounded-lg text-[13px] font-bold transition ${
              camPreset === 'iso'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            سه‌بعدی
          </button>
          <button
            type="button"
            onClick={() => handleSetCamPreset('front')}
            disabled={props.scanMode}
            className={`h-7 px-2.5 rounded-lg text-[13px] font-bold transition ${
              camPreset === 'front'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            روبروی دیوار
          </button>
          <button
            type="button"
            onClick={() => handleSetCamPreset('top')}
            disabled={props.scanMode}
            className={`h-7 px-2.5 rounded-lg text-[13px] font-bold transition ${
              camPreset === 'top'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            بالا (پلان)
          </button>

          <div className="w-px h-4 bg-slate-200 mx-0.5" />
          {(['normal', 'wide', 'ultra'] as const).map((mode) => (
            <button key={mode} type="button" data-testid={`3d-fov-${mode}`}
              onClick={() => handleSetWideViewMode(mode)} aria-pressed={wideViewMode === mode}
              className={`h-7 px-2 rounded-lg text-[13px] font-bold ${wideViewMode === mode
                ? 'bg-emerald-600 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
            >{mode === 'normal' ? 'عادی' : mode === 'wide' ? 'واید' : 'اولترا'}</button>
          ))}
          <div className="w-px h-4 bg-slate-200 mx-0.5" />

          <button
            type="button"
            data-testid="toggle-3d-doors-btn"
            onClick={handleToggleAllDoors}
            aria-pressed={doorsOpen}
            title="باز و بسته کردن درب‌ها در نمای سه‌بعدی"
            className={`h-7 px-2.5 rounded-lg text-[13px] font-bold inline-flex items-center gap-1 transition ${
              doorsOpen
                ? 'bg-amber-500 text-white'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            {doorsOpen ? <DoorOpen className="w-3.5 h-3.5" /> : <DoorClosed className="w-3.5 h-3.5" />}
            <span>{doorsOpen ? 'درب‌ها باز' : 'درب‌ها بسته'}</span>
          </button>
        </div>

        {/* انتخاب دیوار فعال + نشانگر ابزار فعال در سه‌بعدی */}
        <div
          data-testid="wall-selector-3d"
          className="pointer-events-auto flex items-center gap-1 bg-white/95 border border-slate-300 rounded-xl p-1 shadow-sm max-w-full overflow-x-auto no-scrollbar"
        >
          <Layers className="w-3.5 h-3.5 text-slate-400 mx-1 shrink-0" />
          {project.walls.map((w) => {
            const isSel = w.id === project.activeWallId;
            return (
              <button
                key={w.id}
                type="button"
                data-wall-selector-id={w.id}
                aria-pressed={isSel}
                onClick={() => {
                  props.onSelectWallAndBox(w.id, null, null);
                  if (camPreset === 'front' || camPreset === 'iso') {
                    applyCameraPreset(camPreset, undefined, w.id);
                  }
                }}
                className={`h-7 px-2 rounded-lg text-[13px] font-bold whitespace-nowrap transition ${
                  isSel
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                {w.name}
              </button>
            );
          })}
          {project.doorsHidden && (
            <span className="h-7 px-2 rounded-lg bg-purple-100 text-purple-800 text-[13px] font-extrabold inline-flex items-center gap-1">
              <Eye className="w-3 h-3" />
              <span>یونیت‌ها</span>
            </span>
          )}
        </div>
      </div>

      {/* راهنمای مختصر پایین سه‌بعدی */}
      <div className="pointer-events-none absolute bottom-2.5 left-3 bg-white/95 border border-slate-200 rounded-lg px-2.5 py-1 text-[13px] font-bold text-slate-600 shadow-xs">
        {tool === 'wall'
          ? 'نشانگر روی زمین را حرکت دهید و با کلیک نقطه‌ها دیوار بکشید (راست‌کلیک = انتخاب)'
          : tool === 'select'
          ? 'کلیک روی دیوار/باکس = انتخاب · دابل‌کلیک روی هر درب = انیمیشن آرام‌بند · کشیدن = چرخش'
          : 'موس روی دیوار = پیش‌نمایش و اسکرول تغییر مدل · راست‌کلیک = بازگشت به انتخاب'}
      </div>

      {!props.scanMode && hasPlacementCursor && tool !== 'select' && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 pointer-events-auto flex gap-2">
          <button type="button" data-testid="scene-confirm-placement" onClick={()=>commitPlacementRef.current()}
            className="h-11 rounded-xl px-5 bg-emerald-700 text-white font-bold">تأیید</button>
          <button type="button" data-testid="scene-reset-cursor" onClick={()=>{surfaceCursorRef.current.clear();setHasPlacementCursor(false);requestRenderRef.current();}}
            className="h-11 rounded-xl px-3 bg-white border border-slate-300">جابجایی نشانگر</button>
        </div>
      )}
      {!props.scanMode && (hoverPreview || tool !== 'select') && !drag3DRef.current && (
        <CursorToolPreview
          visible={true}
          clientX={hoverPreview?.clientX ?? 0}
          clientY={hoverPreview?.clientY ?? 0}
          tool={tool}
          drawBoxKind={props.drawBoxKind}
          activeCabWidthCm={hoverPreview?.sweepWidthCm}
          hoverTarget={hoverPreview?.hoverTarget}
          targetStatus={hoverPreview?.targetStatus}
          sinkModel={props.sinkModel}
          gasWidth={props.gasWidth}
          hoodKind={props.hoodKind}
          applianceKind={props.applianceKind}
          fridgeModel={props.fridgeModel}
          openingKind={props.openingKind}
          doorOrient={props.doorOrient}
          doorTargetWidth={props.doorTargetWidth}
          doorVertCount={props.doorVertCount}
          drawerPatIdx={props.drawerPatIdx}
          liftPatIdx={props.liftPatIdx}
          doorBandPos={props.doorBandPos}
          doorBandRatio={props.doorBandRatio}
          doorStyleBrush={props.doorStyleBrush}
          cabinetFinishBrush={props.cabinetFinishBrush}
          backsplashBrush={props.backsplashBrush}
          countertopBrush={props.countertopBrush}
          frameWidthCm={props.frameWidthCm}
          shelfCount={props.shelfCount}
          handleStyle={props.handleStyle}
          handleOrient={props.handleOrient}
          testId="cursor-preview-3d"
        />
      )}
    </div>
  );
};
