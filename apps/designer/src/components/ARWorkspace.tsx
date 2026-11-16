import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  AppWindow,
  BrickWall,
  Camera,
  Check,
  Crosshair,
  DoorClosed,
  DoorOpen,
  Droplets,
  Flame,
  Frame,
  GripHorizontal,
  Layers,
  Lock,
  LockOpen,
  MousePointer2,
  PanelTop,
  RectangleHorizontal,
  Refrigerator,
  RotateCcw,
  Ruler,
  WashingMachine,
  X,
} from 'lucide-react';
import {
  buildArScannedWall,
  computeScaleFromRealDistanceCm,
  fitCalibrationDragABWithScale,
  projectArPointOntoWalls,
  XZPoint,
} from '../ar/arCalibration';
import { FloorScanner } from '../ar/floorScanner';
import { AnchorSample, AnchorStabilizer, ChidoVec3, transformPoint as chidoTransformPoint } from '../ar/chidoAnchorRig';
import { chidoSessionOptions } from '../ar/chidoSession';
import {
  NearRealOcclusion,
  OCCLUSION_STATUS_LABEL,
  OcclusionStatus,
} from '../ar/nearOcclusion';
import {
  APPLIANCE_CONFIGS,
  BOX_PRESETS,
  DEFAULT_PROJECT_SETTINGS,
  FRIDGE_FRAME_CM,
  FRIDGE_MODELS,
  FRIDGE_MODEL_ORDER,
  GAS_WIDTH_OPTIONS,
  OPENING_DEFAULTS,
  SINK_MODELS,
  SINK_MODEL_ORDER,
} from '../cad/constants';

const CAB_DRAW_KIND_ORDER: BoxKind[] = ['base', 'wall', 'tall'];
const HANDLE_STYLE_ORDER: HandleStyle[] = ['simple', 'knob', 'hidden'];
const APPLIANCE_ORDER: ApplianceKind[] = ['dishwasher', 'washing'];
const OPENING_ORDER: OpeningKind[] = ['window', 'door', 'column'];
import { getCornerBlockedZonesForWall, getWallVectors } from '../cad/cornerLogic';
import {
  addShelvesWithMinGap,
  applyDoorBrushPreview,
  autoUnitizeBoxForHandles,
  carveBoxesForPlacedBox,
  computeDoorBrushPreview,
  computeCabinetSweepRange,
  createEmptyBox,
  getBoxSideExposure,
  getUnitsInBox,
  placeApplianceWithCabinetRules,
  placeFrameOnBox,
  placeFridgeOnWall,
} from '../cad/doorRules';
import { createWallOpening } from '../cad/openingRules';
import { CursorTargetStatus, CursorToolPreview } from './CursorToolPreview';
import { PacedGestureStepper } from '../utils/gesturePacing';
import { wideViewVerticalFov, WideViewMode } from '../ar/wideView';
import {
  applyAnimatedDoorProgress,
  buildHandleMesh,
  buildKitchen3DScene,
  BuiltKitchenScene,
  detectSoftwareWebGL,
  disposeObject3D,
  Scene3DHitData,
} from '../cad/scene3dBuilder';
import {
  ApplianceKind,
  BoxKind,
  FridgeModel,
  HandleStyle,
  OpeningKind,
  Orientation,
  ProjectState,
  SinkModel,
  ToolId,
} from '../cad/types';

export type ArToolId =
  | 'select'
  | 'calibrate-a'
  | 'calibrate-b'
  | 'wall'
  | 'cab-base'
  | 'cab-wall'
  | 'cab-tall'
  | 'fridge'
  | 'sink'
  | 'gas'
  | 'appliance'
  | 'opening'
  | 'doors'
  | 'handle'
  | 'shelf'
  | 'frame';

interface ARWorkspaceProps {
  active: boolean;
  overlayRootRef: React.RefObject<HTMLDivElement | null>;
  project: ProjectState;
  fridgeModel: FridgeModel;
  sinkModel: SinkModel;
  gasWidth: number;
  applianceKind: ApplianceKind;
  hoodKind: 'hidden' | 'chimney';
  openingKind: OpeningKind;
  handleStyle?: HandleStyle;
  handleOrient?: Orientation;
  drawBoxKind?: BoxKind;
  onSelectDrawBoxKind?: (kind: BoxKind) => void;
  onHandleStyleChange?: (style: HandleStyle) => void;
  onHandleOrientChange?: (orient: Orientation) => void;
  onFridgeModelChange?: (model: FridgeModel) => void;
  onSinkModelChange?: (model: SinkModel) => void;
  onGasWidthChange?: (w: number) => void;
  onApplianceKindChange?: (k: ApplianceKind) => void;
  onOpeningKindChange?: (k: OpeningKind) => void;
  onMoveBox?: (wallId: string, boxId: string, desiredOffsetX: number, commit: boolean, sessionId?: string) => void;
  onMoveAppliance?: (wallId: string, appId: string, desiredOffsetX: number, commit: boolean, sessionId?: string) => void;
  onUpdateProject: (updater: (prev: ProjectState) => ProjectState, toastMsg?: string) => void;
  onSwitchViewMode: (mode: '2d' | '3d' | 'ar') => void;
  onToast: (msg: string) => void;
  sessionKillSignal?: number;
  /** The WebXR request is started synchronously by the Welcome/Projects click. */
  initialSession?: Promise<XRSession> | null;
  /** In the unified designer the scanner is a camera/input layer, not an editor. */
  embeddedIn3D?: boolean;
  sharedTool?: ToolId;
  onSessionEnded?: () => void;
  onFloorConfirmed?: () => void;
  wideViewModeExternal?: WideViewMode;
  onWideViewModeChange?: (mode: WideViewMode) => void;
}

interface AlignmentState {
  x: number;
  z: number;
  yaw: number;
  scale: number;
}

interface StoredAnchorEntry {
  id: string;
  anchor: XRAnchor;
  requested: THREE.Vector3;
  reference: ChidoVec3 | null;
}

type ArDragState =
  | { kind: 'drag-a'; startWorld: XZPoint; moved: boolean }
  | { kind: 'drag-b'; anchorA: XZPoint; moved: boolean }
  | {
      kind: 'move-box';
      wallId: string;
      boxId: string;
      origX: number;
      startDot: number;
      lastTargetX: number;
      sessionId: string;
      moved: boolean;
    }
  | {
      kind: 'move-app';
      wallId: string;
      appId: string;
      origX: number;
      startDot: number;
      lastTargetX: number;
      sessionId: string;
      moved: boolean;
    };

// Chido's central viewer ray plus eight rotated peripheral rays.
const CHIDO_SCAN_RAYS: ReadonlyArray<readonly [number, number]> = [
  [-0.24, 0], [0.24, 0], [0, -0.24], [0, 0.24],
  [-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18],
];
const MAX_SCAN_CROSSES = 20;
const DOOR_ANIM_DURATION_S = 0.58;

function makeCalibrationPin(colorHex: number, label: string, handleKind: 'a' | 'b'): THREE.Group {
  const group = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.RingGeometry(0.075, 0.125, 32),
    new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.95 })
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.015;
  disc.renderOrder = 14;

  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(0.075, 24),
    new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 0.24, depthTest: false })
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.014;
  halo.renderOrder = 14;

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.014, 0.34, 14),
    new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.3 })
  );
  pole.position.y = 0.17;
  pole.renderOrder = 14;

  const hitSphere = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 12, 10),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  hitSphere.position.y = 0.16;
  hitSphere.userData = { arCalibHandle: handleKind };

  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = `#${colorHex.toString(16).padStart(6, '0')}`;
    ctx.beginPath();
    ctx.arc(48, 48, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 48, 50);
  }
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(canvas),
      depthTest: false,
      transparent: true,
    })
  );
  sprite.position.set(0, 0.4, 0);
  sprite.scale.set(0.2, 0.2, 1);
  sprite.renderOrder = 16;

  group.add(disc, halo, pole, hitSphere, sprite);
  group.userData = { arCalibHandle: handleKind };
  return group;
}

function createFloorNetMesh(): {
  mesh: THREE.Mesh;
  uniforms: { uTime: { value: number }; uCenter: { value: THREE.Vector2 }; uOpacity: { value: number } };
} {
  const uniforms = {
    uTime: { value: 0 },
    uCenter: { value: new THREE.Vector2(0, 0) },
    uOpacity: { value: 0.9 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec2 uCenter;
      uniform float uOpacity;
      varying vec3 vLocal;
      void main() {
        vec2 p = vLocal.xz;
        float d = length(p - uCenter);
        float radius = clamp(1.0 - smoothstep(0.35, 3.2, d), 0.0, 1.0);
        vec2 grid = abs(fract(p * 3.0 - 0.5) - 0.5) / fwidth(p * 3.0);
        float line = 1.0 - min(min(grid.x, grid.y), 1.0);
        float wave = 0.55 + 0.45 * sin(d * 5.0 - uTime * 3.6);
        float alpha = line * radius * wave * uOpacity * 0.72;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(0.06, 0.85, 0.58, alpha);
      }
    `,
  });
  const geo = new THREE.PlaneGeometry(7.2, 7.2, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.004;
  mesh.renderOrder = 2;
  return { mesh, uniforms };
}

function createCrossMarker(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x83ffe3, side: THREE.DoubleSide, depthTest: false });
  const a = new THREE.Mesh(new THREE.PlaneGeometry(0.055, 0.011), mat);
  a.rotation.x = -Math.PI / 2;
  const b = new THREE.Mesh(new THREE.PlaneGeometry(0.011, 0.055), mat);
  b.rotation.x = -Math.PI / 2;
  g.add(a, b);
  g.userData.mat = mat;
  g.visible = false;
  return g;
}

function resolveHitDoorId(obj: THREE.Object3D | null): string | undefined {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    const ud = cur.userData as Scene3DHitData | undefined;
    if (ud?.animationId || ud?.doorId) return ud.animationId || ud.doorId;
    cur = cur.parent;
  }
  return undefined;
}

function buildAbRulerTickPoints(vA: THREE.Vector3, vB: THREE.Vector3): THREE.Vector3[] {
  const dx = vB.x - vA.x;
  const dz = vB.z - vA.z;
  const len = Math.hypot(dx, dz);
  const pts: THREE.Vector3[] = [];
  if (len < 0.08) return pts;
  const tx = dx / len;
  const tz = dz / len;
  const nx = -tz;
  const nz = tx;
  const y = 0.024;
  const steps = Math.floor(len / 0.1);
  for (let i = 0; i <= steps; i++) {
    const dist = i * 0.1;
    const isMajor = i % 5 === 0;
    const halfW = isMajor ? 0.065 : 0.03;
    const cx = vA.x + tx * dist;
    const cz = vA.z + tz * dist;
    pts.push(new THREE.Vector3(cx - nx * halfW, y, cz - nz * halfW));
    pts.push(new THREE.Vector3(cx + nx * halfW, y, cz + nz * halfW));
  }
  return pts;
}

function uid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export const ARWorkspace: React.FC<ARWorkspaceProps> = ({
  active,
  overlayRootRef,
  project,
  fridgeModel,
  sinkModel,
  gasWidth,
  applianceKind,
  hoodKind,
  openingKind,
  handleStyle = 'simple',
  handleOrient = 'vertical',
  drawBoxKind = 'base',
  onSelectDrawBoxKind,
  onHandleStyleChange,
  onHandleOrientChange,
  onFridgeModelChange,
  onSinkModelChange,
  onGasWidthChange,
  onApplianceKindChange,
  onOpeningKindChange,
  onMoveBox,
  onMoveAppliance,
  onUpdateProject,
  onSwitchViewMode,
  onToast,
  sessionKillSignal = 0,
  initialSession = null,
  embeddedIn3D = false,
  sharedTool,
  onSessionEnded,
  onFloorConfirmed,
  wideViewModeExternal,
  onWideViewModeChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [xrSupported, setXrSupported] = useState<boolean | null>(null);
  const [xrActive, setXrActive] = useState(false);
  const [floorLocked, setFloorLocked] = useState(false);
  const [scanReady, setScanReady] = useState(false);
  const [occlusionEnabled, setOcclusionEnabled] = useState(true);
  const [occlusionStatus, setOcclusionStatus] = useState<OcclusionStatus>('idle');
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [reticleEnabled, setReticleEnabled] = useState(true);
  const [localWideViewMode, setLocalWideViewMode] = useState<WideViewMode>('normal');
  const wideViewMode = wideViewModeExternal ?? localWideViewMode;
  const setWideViewMode = (mode: WideViewMode) => {
    setLocalWideViewMode(mode);
    onWideViewModeChange?.(mode);
  };
  const wideViewModeRef = useRef<WideViewMode>('normal');
  wideViewModeRef.current = wideViewMode;

  const [arTool, setArTool] = useState<ArToolId>('select');
  const [cursorPreview, setCursorPreview] = useState<{ x: number; y: number; status: CursorTargetStatus } | null>(null);
  const lastPreviewTouchRef = useRef(0);
  const lastHoverCoordsRef = useRef<{ x: number; y: number } | null>(null);

  const propsRef = useRef({
    fridgeModel,
    sinkModel,
    gasWidth,
    applianceKind,
    hoodKind,
    openingKind,
    handleStyle,
    handleOrient,
    drawBoxKind,
    onSelectDrawBoxKind,
    onHandleStyleChange,
    onHandleOrientChange,
    onFridgeModelChange,
    onSinkModelChange,
    onGasWidthChange,
    onApplianceKindChange,
    onOpeningKindChange,
    onMoveBox,
    onMoveAppliance,
  });
  propsRef.current = {
    fridgeModel,
    sinkModel,
    gasWidth,
    applianceKind,
    hoodKind,
    openingKind,
    handleStyle,
    handleOrient,
    drawBoxKind,
    onSelectDrawBoxKind,
    onHandleStyleChange,
    onHandleOrientChange,
    onFridgeModelChange,
    onSinkModelChange,
    onGasWidthChange,
    onApplianceKindChange,
    onOpeningKindChange,
    onMoveBox,
    onMoveAppliance,
  };

  const lastSelectTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const toggleXrDoorAtPointRef = useRef<(x: number, y: number) => boolean>(() => false);
  const detailedPickAtClientRef = useRef<
    (x: number, y: number) => { data: Scene3DHitData; point: THREE.Vector3 } | null
  >(() => null);
  const floorPointAtClientRef = useRef<(x: number, y: number) => THREE.Vector3 | null>(() => null);
  const updateArGhostRef = useRef<
    (local: THREE.Vector3, clientX?: number, clientY?: number) => CursorTargetStatus
  >(() => 'neutral');
  const projectArPointerOntoWallRef = useRef<
    (wallId: string, clientX: number, clientY: number) => { xCm: number; yCm: number } | null
  >(() => null);
  const pickCalibrationHandleRef = useRef<(clientX: number, clientY: number) => 'a' | 'b' | null>(() => null);

  const [pendingWallStart, setPendingWallStart] = useState<XZPoint | null>(null);

  const [pointA, setPointA] = useState<XZPoint>(() => project.arCalibration?.a || { x: -1.2, z: -0.9 });
  const [pointB, setPointB] = useState<XZPoint>(() => project.arCalibration?.b || { x: 1.2, z: -0.9 });
  const [alignment, setAlignment] = useState<AlignmentState>({ x: 0, z: 0, yaw: 0, scale: 1 });
  const [realDistanceInput, setRealDistanceInput] = useState<string>(() => {
    const a = project.arCalibration?.a || { x: -1.2, z: -0.9 };
    const b = project.arCalibration?.b || { x: 1.2, z: -0.9 };
    return String(
      project.arCalibration?.realDistanceCm || Math.round(Math.hypot(b.x - a.x, b.z - a.z) * 100)
    );
  });
  const [showCalibPanel, setShowCalibPanel] = useState(true);

  const activeRef = useRef(active);
  activeRef.current = active;
  const projectRef = useRef(project);
  projectRef.current = project;
  const arToolRef = useRef(arTool);
  arToolRef.current = arTool;
  // The tool selection comes from the same 3D SideInspector and BottomDock.
  // AR does not maintain an independent toolbar or an independent tool state.
  useEffect(() => {
    if (!embeddedIn3D || !sharedTool) return;
    if (sharedTool !== 'wall') setPendingWallStart(null);
    if (sharedTool !== 'cab-draw') setPendingCabSweep(null);
    const mapped: ArToolId = sharedTool === 'cab-draw'
      ? (drawBoxKind === 'wall' || drawBoxKind === 'wall-deep' ? 'cab-wall' : drawBoxKind === 'tall' ? 'cab-tall' : 'cab-base')
      : sharedTool === 'pencil' ? 'shelf'
      : sharedTool === 'door-pencil' || sharedTool === 'door-style' ? 'doors'
      : sharedTool === 'skeleton' ? 'frame'
      : sharedTool === 'finish' || sharedTool === 'eraser' ? 'select'
      : sharedTool;
    setArTool(mapped);
  }, [embeddedIn3D, sharedTool, drawBoxKind]);
  const [pendingCabSweep, setPendingCabSweep] = useState<{wallId: string; startCm: number; kind: BoxKind} | null>(null);
  const pendingCabSweepRef = useRef(pendingCabSweep);
  pendingCabSweepRef.current = pendingCabSweep;
  const pendingWallStartRef = useRef(pendingWallStart);
  pendingWallStartRef.current = pendingWallStart;
  const pointARef = useRef(pointA);
  pointARef.current = pointA;
  const pointBRef = useRef(pointB);
  pointBRef.current = pointB;
  const alignmentRef = useRef(alignment);
  alignmentRef.current = alignment;
  const floorLockedRef = useRef(floorLocked);
  floorLockedRef.current = floorLocked;
  const occlusionEnabledRef = useRef(occlusionEnabled);
  occlusionEnabledRef.current = occlusionEnabled;
  const doorsOpenRef = useRef(doorsOpen);
  doorsOpenRef.current = doorsOpen;
  const reticleEnabledRef = useRef(reticleEnabled);
  reticleEnabledRef.current = reticleEnabled;

  const xrSessionRef = useRef<XRSession | null>(null);
  const floorScannerRef = useRef(new FloorScanner());
  const anchorStabilizerRef = useRef(new AnchorStabilizer());
  const anchorsRef = useRef<StoredAnchorEntry[]>([]);
  const anchorCandidatesRef = useRef<THREE.Vector3[]>([]);
  const anchorPendingRef = useRef(false);
  const anchorGenerationRef = useRef(0);
  const anchorLastTimeRef = useRef(0);
  const pendingAnchorCreateRef = useRef(false);
  const basePoseRef = useRef<{ x: number; y: number; z: number; yaw: number } | null>(null);
  const hitTestSourcesRef = useRef<XRHitTestSource[]>([]);
  const lowerHitSourceRef = useRef<XRHitTestSource | null>(null);
  const transientHitSourceRef = useRef<XRTransientInputHitTestSource | null>(null);

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  // Chido Wide View: virtual scene uses XR tracking, but a separate perspective
  // from the physical camera; no OrbitControls are enabled during a live scan.
  const trackedWideRendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const trackedWideCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const floorGroupRef = useRef<THREE.Group | null>(null);
  const kitchenMountRef = useRef<THREE.Group | null>(null);
  const floorNetUniformsRef = useRef<{ uTime: { value: number }; uCenter: { value: THREE.Vector2 }; uOpacity: { value: number } } | null>(null);
  const floorNetMeshRef = useRef<THREE.Mesh | null>(null);
  const crossesPoolRef = useRef<THREE.Group[]>([]);
  const reticleRef = useRef<THREE.Mesh | null>(null);
  const wallGhostRef = useRef<THREE.Mesh | null>(null);
  const placementGhostRef = useRef<THREE.Mesh | null>(null);
  const handleGhostGroupRef = useRef<THREE.Group | null>(null);
  const wallStartMarkerRef = useRef<THREE.Mesh | null>(null);
  const pinARef = useRef<THREE.Group | null>(null);
  const pinBRef = useRef<THREE.Group | null>(null);
  const lineABRef = useRef<THREE.Line | null>(null);
  const rulerTicksRef = useRef<THREE.LineSegments | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const occlusionRef = useRef<NearRealOcclusion | null>(null);
  const builtSceneRef = useRef<BuiltKitchenScene | null>(null);
  const doorStatesRef = useRef<Map<string, { cur: number; target: number }>>(new Map());
  const renderOnceRef = useRef<() => void>(() => {});
  const arDragRef = useRef<ArDragState | null>(null);
  const dragDownClientRef = useRef<{ x: number; y: number } | null>(null);
  const gestureStepperRef = useRef(new PacedGestureStepper());

  // Latest action callbacks stored in refs so native DOM listeners always invoke fresh state
  const applyFloorActionRef = useRef<(pt: THREE.Vector3, clientX?: number, clientY?: number) => void>(() => {});
  const handleArDetailActionRef = useRef<(x: number, y: number) => void>(() => {});

  // Check WebXR immersive-ar support once
  useEffect(() => {
    let mounted = true;
    const xr = (navigator as unknown as { xr?: XRSystem }).xr;
    if (!xr || !xr.isSessionSupported) {
      setXrSupported(false);
      return;
    }
    xr.isSessionSupported('immersive-ar')
      .then((ok) => {
        if (mounted) setXrSupported(Boolean(ok));
      })
      .catch(() => {
        if (mounted) setXrSupported(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // End XR session if parent signals explicit exit
  useEffect(() => {
    if (sessionKillSignal > 0 && xrSessionRef.current) {
      xrSessionRef.current.end().catch(() => {});
      xrSessionRef.current = null;
      setXrActive(false);
    }
  }, [sessionKillSignal]);

  // Mount Three.js + WebXR renderer ONCE so XRSession persists across 2D <-> 3D <-> AR switches!
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const width = Math.max(container.clientWidth || 800, 320);
    const height = Math.max(container.clientHeight || 500, 240);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    const isSoftware = detectSoftwareWebGL(renderer.getContext());
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSoftware ? 1 : 2));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.xr.enabled = true;
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.innerHTML = '';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.04, 50);
    camera.position.set(2.4, 2.2, 3.6);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0.75, -0.5);
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 0.9;
    controls.maxDistance = 14;
    controlsRef.current = controls;

    const hemi = new THREE.HemisphereLight(0xf8fafc, 0x94a3b8, 0.9);
    const keyLight = new THREE.DirectionalLight(0xfffbeb, 1.05);
    keyLight.position.set(3, 5, 4);
    scene.add(hemi, keyLight);

    const floorGroup = new THREE.Group();
    scene.add(floorGroup);
    floorGroupRef.current = floorGroup;

    const { mesh: floorNetMesh, uniforms: floorNetUniforms } = createFloorNetMesh();
    floorGroup.add(floorNetMesh);
    floorNetMeshRef.current = floorNetMesh;
    floorNetUniformsRef.current = floorNetUniforms;

    const crosses: THREE.Group[] = [];
    for (let i = 0; i < MAX_SCAN_CROSSES; i++) {
      const c = createCrossMarker();
      scene.add(c);
      crosses.push(c);
    }
    crossesPoolRef.current = crosses;

    const grid = new THREE.GridHelper(10, 20, 0x10b981, 0x94a3b8);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.28;
    floorGroup.add(grid);
    gridHelperRef.current = grid;

    const kitchenMount = new THREE.Group();
    floorGroup.add(kitchenMount);
    kitchenMountRef.current = kitchenMount;

    const reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.08, 0.125, 32),
      new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide, depthTest: false })
    );
    reticle.rotation.x = -Math.PI / 2;
    reticle.position.y = 0.012;
    reticle.renderOrder = 10;
    reticle.visible = true;
    floorGroup.add(reticle);
    reticleRef.current = reticle;

    const wallGhostMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    });
    const wallGhost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), wallGhostMat);
    wallGhost.visible = false;
    wallGhost.renderOrder = 9;
    floorGroup.add(wallGhost);
    wallGhostRef.current = wallGhost;

    const placementGhostMat = new THREE.MeshBasicMaterial({
      color: 0x2563eb,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
    });
    const placementGhost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), placementGhostMat);
    placementGhost.visible = false;
    placementGhost.renderOrder = 9;
    floorGroup.add(placementGhost);
    placementGhostRef.current = placementGhost;

    const handleGhostGroup = new THREE.Group();
    handleGhostGroup.renderOrder = 14;
    floorGroup.add(handleGhostGroup);
    handleGhostGroupRef.current = handleGhostGroup;

    const wallStartMarker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.16, 16),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3 })
    );
    wallStartMarker.visible = false;
    floorGroup.add(wallStartMarker);
    wallStartMarkerRef.current = wallStartMarker;

    const pinA = makeCalibrationPin(0x4f46e5, 'A', 'a');
    const pinB = makeCalibrationPin(0x059669, 'B', 'b');
    floorGroup.add(pinA, pinB);
    pinARef.current = pinA;
    pinBRef.current = pinB;

    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-1.2, 0.024, -0.9),
      new THREE.Vector3(1.2, 0.024, -0.9),
    ]);
    const lineAB = new THREE.Line(
      lineGeo,
      new THREE.LineBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0.96,
        depthTest: false,
      })
    );
    lineAB.renderOrder = 15;
    floorGroup.add(lineAB);
    lineABRef.current = lineAB;

    const rulerGeo = new THREE.BufferGeometry();
    const rulerTicks = new THREE.LineSegments(
      rulerGeo,
      new THREE.LineBasicMaterial({
        color: 0x059669,
        transparent: true,
        opacity: 0.85,
        depthTest: false,
      })
    );
    rulerTicks.renderOrder = 15;
    floorGroup.add(rulerTicks);
    rulerTicksRef.current = rulerTicks;

    const occlusion = new NearRealOcclusion(scene);
    occlusionRef.current = occlusion;

    const stepDoorAnimations = (dt: number): boolean => {
      const built = builtSceneRef.current;
      if (!built || built.animatedDoors.length === 0) return false;
      const step = Math.min(0.05, Math.max(0.001, dt)) / DOOR_ANIM_DURATION_S;
      let anyMoving = false;
      const states = doorStatesRef.current;
      for (const h of built.animatedDoors) {
        const st = states.get(h.doorId);
        if (!st) continue;
        const diff = st.target - st.cur;
        if (Math.abs(diff) > 0.001) {
          st.cur = Math.abs(diff) <= step ? st.target : st.cur + Math.sign(diff) * step;
          applyAnimatedDoorProgress(h, st.cur);
          if (Math.abs(st.target - st.cur) > 0.001) {
            anyMoving = true;
          }
        }
      }
      return anyMoving;
    };

    let rafId: number | null = null;
    let lastAnimTs = performance.now();
    const renderPreview = () => {
      rafId = null;
      if (!activeRef.current || xrSessionRef.current) return;
      const now = performance.now();
      const dt = (now - lastAnimTs) / 1000;
      lastAnimTs = now;
      if (floorNetUniformsRef.current) {
        floorNetUniformsRef.current.uTime.value = now / 1000;
      }
      const doorsMoving = stepDoorAnimations(dt);
      const ctrlChanged = controls.update();
      renderer.render(scene, camera);
      if (doorsMoving || ctrlChanged) {
        rafId = requestAnimationFrame(renderPreview);
      }
    };
    const requestPreviewRender = () => {
      if (!activeRef.current || xrSessionRef.current) return;
      if (rafId === null) {
        lastAnimTs = performance.now();
        rafId = requestAnimationFrame(renderPreview);
      }
    };
    renderOnceRef.current = requestPreviewRender;
    controls.addEventListener('change', requestPreviewRender);

    const raycaster = new THREE.Raycaster();
    const ndcVec = new THREE.Vector2();
    const pointerNdc = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      return new THREE.Vector2(
        ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
        -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1
      );
    };
    const pickingCamera = (): THREE.Camera => {
      if (!xrSessionRef.current) return camera;
      const xrCamera = renderer.xr.getCamera();
      return xrCamera.cameras[0] || xrCamera;
    };
    const getPointerRay = (clientX: number, clientY: number) => {
      raycaster.setFromCamera(pointerNdc(clientX, clientY), pickingCamera());
      return raycaster.ray;
    };

    detailedPickAtClientRef.current = (clientX, clientY) => {
      if (!builtSceneRef.current) return null;
      builtSceneRef.current.root.updateWorldMatrix(true, true);
      getPointerRay(clientX, clientY);
      const hits = raycaster.intersectObjects(builtSceneRef.current.interactables, false);
      for (const hit of hits) {
        let obj: THREE.Object3D | null = hit.object;
        while (obj) {
          const data = obj.userData as Scene3DHitData | undefined;
          if (data?.kind && data.wallId) return { data, point: hit.point.clone() };
          obj = obj.parent;
        }
      }
      return null;
    };

    floorPointAtClientRef.current = (clientX, clientY) => {
      const group = floorGroupRef.current;
      if (!group) return null;
      group.updateWorldMatrix(true, false);
      const worldOrigin = group.getWorldPosition(new THREE.Vector3());
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), worldOrigin);
      const worldHit = new THREE.Vector3();
      if (!getPointerRay(clientX, clientY).intersectPlane(plane, worldHit)) return null;
      return group.worldToLocal(worldHit);
    };

    projectArPointerOntoWallRef.current = (wallId, clientX, clientY) => {
      const built = builtSceneRef.current;
      const mount = kitchenMountRef.current;
      if (!built || !mount) return null;
      const tr = built.wallTransforms.get(wallId);
      if (!tr) return null;
      mount.updateWorldMatrix(true, true);
      const wallNormalWorld = tr.normal.clone().transformDirection(mount.matrixWorld).normalize();
      const wallOriginWorld = tr.origin.clone().applyMatrix4(mount.matrixWorld);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(wallNormalWorld, wallOriginWorld);
      const worldHit = new THREE.Vector3();
      if (!getPointerRay(clientX, clientY).intersectPlane(plane, worldHit)) return null;
      const modelHit = mount.worldToLocal(worldHit);
      const rel = modelHit.clone().sub(tr.origin);
      return {
        xCm: rel.dot(tr.tangent) * 100,
        yCm: modelHit.y * 100,
      };
    };

    pickCalibrationHandleRef.current = (clientX, clientY) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const cam = pickingCamera();
      const checkPin = (pin: THREE.Group | null): number => {
        if (!pin || !pin.visible) return Infinity;
        pin.updateWorldMatrix(true, false);
        const sampleHeights = [0.02, 0.17, 0.4];
        let best = Infinity;
        for (const h of sampleHeights) {
          const p = new THREE.Vector3(0, h, 0);
          pin.localToWorld(p);
          p.project(cam);
          if (p.z > 1 || p.z < -1) continue;
          const sx = rect.left + ((p.x + 1) / 2) * rect.width;
          const sy = rect.top + ((-p.y + 1) / 2) * rect.height;
          best = Math.min(best, Math.hypot(sx - clientX, sy - clientY));
        }
        return best;
      };
      const dA = checkPin(pinARef.current);
      const dB = checkPin(pinBRef.current);
      if (Math.min(dA, dB) <= 75) {
        return dA <= dB ? 'a' : 'b';
      }
      return null;
    };

    const clearHandleGhost = () => {
      const hGrp = handleGhostGroupRef.current;
      if (!hGrp) return;
      while (hGrp.children.length > 0) {
        const ch = hGrp.children[0];
        hGrp.remove(ch);
        disposeObject3D(ch);
      }
    };

    updateArGhostRef.current = (localPt: THREE.Vector3, clientX?: number, clientY?: number) => {
      const wallGhost = wallGhostRef.current;
      const placement = placementGhostRef.current;
      if (!wallGhost || !placement) return 'neutral';
      wallGhost.visible = false;
      placement.visible = false;
      clearHandleGhost();

      const tool = arToolRef.current;
      if (tool === 'select' || tool.startsWith('calibrate-')) return 'neutral';

      const al = alignmentRef.current;
      const c = Math.cos(al.yaw);
      const sn = Math.sin(al.yaw);

      if (tool === 'wall') {
        const start = pendingWallStartRef.current;
        if (!start) return 'neutral';
        const sx = al.x + al.scale * (start.x * c + start.z * sn);
        const sz = al.z + al.scale * (-start.x * sn + start.z * c);
        const dx = localPt.x - sx;
        const dz = localPt.z - sz;
        const len = Math.hypot(dx, dz);
        if (len < 0.03) return 'invalid';
        const h = (projectRef.current.settings?.wallHeightCm || DEFAULT_PROJECT_SETTINGS.wallHeightCm) / 100;
        wallGhost.position.set(sx + dx / 2, (h * al.scale) / 2, sz + dz / 2);
        wallGhost.rotation.y = -Math.atan2(dz, dx);
        wallGhost.scale.set(len, h * al.scale, 0.1 * al.scale);
        wallGhost.visible = true;
        return len >= 0.4 * al.scale ? 'valid' : 'invalid';
      }

      const choices = propsRef.current;

      // For cabinet-front tools ('handle', 'doors', 'shelf', 'frame'), prefer direct raycast onto cabinet mesh
      if ((tool === 'handle' || tool === 'doors' || tool === 'shelf' || tool === 'frame') && clientX !== undefined && clientY !== undefined) {
        const picked = detailedPickAtClientRef.current(clientX, clientY);
        const mount = kitchenMountRef.current;
        const built = builtSceneRef.current;
        if (!picked?.data.boxId || !mount || !built) return 'invalid';
        const wall = projectRef.current.walls.find((x) => x.id === picked.data.wallId);
        const box = wall?.boxes.find((b) => b.id === picked.data.boxId);
        const tr = built.wallTransforms.get(picked.data.wallId);
        if (!wall || !box || !tr || box.type === 'fridge') return 'invalid';

        mount.updateWorldMatrix(true, true);
        const modelPt = mount.worldToLocal(picked.point.clone());
        const rel = modelPt.clone().sub(tr.origin);
        const hitXCm = rel.dot(tr.tangent) * 100;
        const hitYCm = modelPt.y * 100;
        const localX = Math.max(0, Math.min(box.width, hitXCm - box.offsetX));
        const v = getWallVectors(wall);

        if (tool === 'handle') {
          const door =
            (picked.data.doorId ? box.doors.find((d) => d.id === picked.data.doorId) : undefined) ||
            box.doors.find((d) => localX >= d.startCm - 0.5 && localX <= d.startCm + d.widthCm + 0.5);
          if (!door || door.kind === 'fridge') return 'invalid';

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
            xRatio = localX >= door.startCm + door.widthCm / 2 ? 0.86 : 0.14;
          }

          const handleCenterXCm = box.offsetX + door.startCm + xRatio * door.widthCm;
          const handleCenterYCm = innerBot + (1 - rowCenterNorm) * innerH;
          const matGhost = new THREE.MeshBasicMaterial({ color: 0x0d9488, transparent: true, opacity: 0.78 });
          const hMesh = buildHandleMesh(
            choices.handleStyle,
            choices.handleOrient,
            16,
            door.widthCm * 0.01,
            rowH * 0.01,
            0.02,
            1,
            matGhost,
            matGhost
          );
          const px = (wall.x1Cm + handleCenterXCm * v.tx + (box.depth + 2.5) * v.nx) / 100;
          const pz = (wall.y1Cm + handleCenterXCm * v.ty + (box.depth + 2.5) * v.ny) / 100;
          const hGrp = handleGhostGroupRef.current;
          if (hGrp) {
            hGrp.add(hMesh);
            hMesh.position.set(
              al.x + al.scale * (px * c + pz * sn),
              handleCenterYCm * 0.01 * al.scale,
              al.z + al.scale * (-px * sn + pz * c)
            );
            hMesh.rotation.y = -Math.atan2(v.ty, v.tx) + al.yaw;
            hMesh.scale.setScalar(al.scale);
          }
          return 'valid';
        }

        if (tool === 'doors') {
          const zones = getCornerBlockedZonesForWall(wall, projectRef.current.walls, projectRef.current.cornerOwners);
          const prev = computeDoorBrushPreview(box, localX, 'vertical', 1, 1, 0, zones, 60);
          if (!prev.ok) return 'invalid';
          const firstItem = prev.items[0];
          const centerCm = box.offsetX + firstItem.startCm + firstItem.widthCm / 2;
          const px = (wall.x1Cm + centerCm * v.tx + (box.depth + 1.5) * v.nx) / 100;
          const pz = (wall.y1Cm + centerCm * v.ty + (box.depth + 1.5) * v.ny) / 100;
          placement.position.set(
            al.x + al.scale * (px * c + pz * sn),
            (box.elevY + box.height / 2) * 0.01 * al.scale,
            al.z + al.scale * (-px * sn + pz * c)
          );
          placement.rotation.y = -Math.atan2(v.ty, v.tx) + al.yaw;
          placement.scale.set(
            firstItem.widthCm * 0.01 * al.scale,
            Math.max(0.2, (box.height - box.plinth - box.countertopCm) * 0.01 * al.scale),
            0.03 * al.scale
          );
          placement.visible = true;
          return 'valid';
        }

        return 'valid';
      }

      const dx = (localPt.x - al.x) / al.scale;
      const dz = (localPt.z - al.z) / al.scale;
      const modelX = dx * c - dz * sn;
      const modelZ = dx * sn + dz * c;
      const pendingSweep = pendingCabSweepRef.current;
      const fixedWall = pendingSweep && projectRef.current.walls.find(w => w.id === pendingSweep.wallId);
      const result = fixedWall ? {
        wall: fixedWall,
        offsetCm: Math.max(0, Math.min(fixedWall.length,
          (modelX * 100 - fixedWall.x1Cm) * getWallVectors(fixedWall).tx +
          (modelZ * 100 - fixedWall.y1Cm) * getWallVectors(fixedWall).ty)),
      } : projectArPointOntoWalls({ x: modelX, z: modelZ }, projectRef.current.walls);
      if (!result) return 'invalid';
      const w = result.wall;
      const v = getWallVectors(w);
      let width = 0;
      let height = 0;
      let depth = 0;
      let elev = 0;
      let forwardOffsetCm = 0;
      let startX = result.offsetCm;

      if (tool === 'cab-base' || tool === 'cab-wall' || tool === 'cab-tall') {
        // The first confirmation starts the sweep; this is ONLY the live ghost.
        // The second confirmation creates the real box through the CAD engine.
        const kind = tool === 'cab-base' ? 'base' : tool === 'cab-wall' ? 'wall' : 'tall';
        const cfg = BOX_PRESETS[kind];
        if (pendingSweep && pendingSweep.wallId === w.id) {
          const sweep = computeCabinetSweepRange(pendingSweep.startCm, result.offsetCm, w.length, 30);
          width = sweep.width;
          startX = sweep.offsetX;
        } else {
          width = Math.min(120, Math.max(30, w.length - startX));
          startX = Math.max(0, Math.min(w.length - width, startX));
        }
        height = cfg.height;
        depth = cfg.depth;
        elev = cfg.elevY;
        forwardOffsetCm = depth / 2;
      } else if (tool === 'fridge') {
        const cfg = FRIDGE_MODELS[choices.fridgeModel];
        width = cfg.width + FRIDGE_FRAME_CM * 2;
        height = cfg.height + FRIDGE_FRAME_CM;
        depth = cfg.depth;
        forwardOffsetCm = depth / 2;
        startX = Math.max(0, Math.min(w.length - width, startX - width / 2));
      } else if (tool === 'gas' || tool === 'sink' || tool === 'appliance') {
        const baseBox = w.boxes.find(
          (b) => b.type === 'base' && startX >= b.offsetX - 5 && startX <= b.offsetX + b.width + 5
        );
        if (!baseBox) return 'invalid';
        const kind = tool === 'sink' ? 'sink' : tool === 'gas' ? 'gas' : choices.applianceKind;
        width = tool === 'gas' ? choices.gasWidth : tool === 'sink' ? SINK_MODELS[choices.sinkModel].width : APPLIANCE_CONFIGS[kind].width;
        startX = Math.max(baseBox.offsetX, Math.min(baseBox.offsetX + baseBox.width - width, startX - width / 2));
        if (tool === 'gas' || tool === 'sink') {
          // Sit flush right on the countertop!
          height = tool === 'gas' ? 5 : 4;
          depth = tool === 'gas' ? 48 : 50;
          elev = baseBox.elevY + baseBox.height;
          forwardOffsetCm = Math.max(2, (baseBox.depth - depth) / 2) + depth / 2;
        } else {
          height = baseBox.height - baseBox.countertopCm - baseBox.plinth;
          depth = baseBox.depth + 2;
          elev = baseBox.plinth;
          forwardOffsetCm = depth / 2;
        }
      } else if (tool === 'opening') {
        const cfg = OPENING_DEFAULTS[choices.openingKind];
        width = cfg.width;
        height = cfg.height;
        depth = 14;
        elev = choices.openingKind === 'window' ? 90 : 0;
        // Centered cleanly in the wall thickness plane
        forwardOffsetCm = -6;
        startX = Math.max(0, Math.min(w.length - width, startX - width / 2));
      } else {
        return 'neutral';
      }
      if (width <= 0 || w.length < width) return 'invalid';

      const centreCm = startX + width / 2;
      const px = (w.x1Cm + centreCm * v.tx + forwardOffsetCm * v.nx) / 100;
      const pz = (w.y1Cm + centreCm * v.ty + forwardOffsetCm * v.ny) / 100;
      placement.position.set(
        al.x + al.scale * (px * c + pz * sn),
        (elev + height / 2) * 0.01 * al.scale,
        al.z + al.scale * (-px * sn + pz * c)
      );
      placement.rotation.y = -Math.atan2(v.ty, v.tx) + al.yaw;
      placement.scale.set(width * 0.01 * al.scale, height * 0.01 * al.scale, depth * 0.01 * al.scale);
      placement.visible = true;
      return 'valid';
    };

    const toggleDoorByRay = (ndc: THREE.Vector2, viewCamera: THREE.Camera): boolean => {
      if (!activeRef.current || !builtSceneRef.current) return false;
      builtSceneRef.current.root.updateWorldMatrix(true, true);
      raycaster.setFromCamera(ndc, viewCamera);
      const hits = raycaster.intersectObjects(builtSceneRef.current.interactables, false);
      const partId = hits[0] ? resolveHitDoorId(hits[0].object) : undefined;
      if (!partId) return false;
      const isOpenable = builtSceneRef.current.animatedDoors.some((h) => h.doorId === partId);
      if (!isOpenable) {
        onToast('تا روی این درب دستگیره قرار ندهید درب باز نمی‌شود');
        return false;
      }
      const states = doorStatesRef.current;
      const st = states.get(partId) || { cur: 0, target: 0 };
      states.set(partId, { cur: st.cur, target: st.target > 0.5 ? 0 : 1 });
      setDoorsOpen(Array.from(states.values()).some((s) => s.target > 0.5));
      requestPreviewRender();
      return true;
    };
    toggleXrDoorAtPointRef.current = (clientX, clientY) =>
      toggleDoorByRay(pointerNdc(clientX, clientY), pickingCamera());

    const dom = renderer.domElement;

    const onDblClick = (e: MouseEvent) => {
      if (!activeRef.current || xrSessionRef.current || !builtSceneRef.current) return;
      const rect = dom.getBoundingClientRect();
      ndcVec.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      toggleDoorByRay(ndcVec, camera);
    };

    // Native capture-phase pointerdown intercepts A/B handles & base/wall/tall cabinets BEFORE OrbitControls!
    const onPointerDownCapture = (e: PointerEvent) => {
      if (e.button !== 0 || !activeRef.current) return;
      if (xrSessionRef.current && !floorLockedRef.current) {
        onToast('اسکن کف هنوز در حال تثبیت است');
        return;
      }

      const toolNow = arToolRef.current;
      dragDownClientRef.current = { x: e.clientX, y: e.clientY };

      // 1) Direct A/B calibration handle grab (works in select AND calibrate-a/calibrate-b!)
      const calibHandle = pickCalibrationHandleRef.current(e.clientX, e.clientY);
      if (calibHandle && (toolNow === 'select' || toolNow === 'calibrate-a' || toolNow === 'calibrate-b')) {
        const floorPt = floorPointAtClientRef.current(e.clientX, e.clientY);
        if (floorPt) {
          e.stopPropagation();
          controls.enabled = false;
          try { dom.setPointerCapture(e.pointerId); } catch {}
          if (calibHandle === 'a') {
            arDragRef.current = { kind: 'drag-a', startWorld: { x: floorPt.x, z: floorPt.z }, moved: false };
          } else {
            const a = pointARef.current;
            const al = alignmentRef.current;
            const cos = Math.cos(al.yaw);
            const sin = Math.sin(al.yaw);
            arDragRef.current = {
              kind: 'drag-b',
              anchorA: {
                x: al.x + al.scale * (a.x * cos + a.z * sin),
                z: al.z + al.scale * (-a.x * sin + a.z * cos),
              },
              moved: false,
            };
          }
          return;
        }
      }

      if (toolNow === 'select') {
        const picked = detailedPickAtClientRef.current(e.clientX, e.clientY);
        const now = performance.now();
        const prev = lastSelectTapRef.current;
        const repeated = Boolean(
          prev && now - prev.time < 380 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 44
        );
        lastSelectTapRef.current = repeated ? null : { time: now, x: e.clientX, y: e.clientY };

        if (repeated && toggleXrDoorAtPointRef.current(e.clientX, e.clientY)) {
          e.preventDefault();
          e.stopPropagation();
          onToast('درب انتخاب‌شده باز یا بسته شد');
          return;
        }

        if (picked) {
          const data = picked.data;
          onUpdateProject((prevProject) => ({
            ...prevProject,
            activeWallId: data.wallId,
            activeBoxId: data.boxId || null,
            selectedDoorId: data.doorId || null,
            selectedApplianceId: data.appId || null,
            selectedOpeningId: data.openingId || null,
          }));

          const wall = projectRef.current.walls.find((x) => x.id === data.wallId);
          if (wall && data.appId) {
            const app = wall.appliances.find((a) => a.id === data.appId);
            const proj = projectArPointerOntoWallRef.current(data.wallId, e.clientX, e.clientY);
            if (app && proj) {
              e.stopPropagation();
              controls.enabled = false;
              try { dom.setPointerCapture(e.pointerId); } catch {}
              arDragRef.current = {
                kind: 'move-app',
                wallId: data.wallId,
                appId: app.id,
                origX: app.offsetX,
                startDot: proj.xCm,
                lastTargetX: app.offsetX,
                sessionId: `ar_app_${Date.now()}`,
                moved: false,
              };
              return;
            }
          }

          if (wall && data.boxId) {
            const box = wall.boxes.find((b) => b.id === data.boxId);
            const proj = projectArPointerOntoWallRef.current(data.wallId, e.clientX, e.clientY);
            if (box && proj) {
              e.stopPropagation();
              controls.enabled = false;
              try { dom.setPointerCapture(e.pointerId); } catch {}
              arDragRef.current = {
                kind: 'move-box',
                wallId: data.wallId,
                boxId: box.id,
                origX: box.offsetX,
                startDot: proj.xCm,
                lastTargetX: box.offsetX,
                sessionId: `ar_box_${Date.now()}`,
                moved: false,
              };
              return;
            }
          }
        }
        return;
      }

      lastSelectTapRef.current = null;
      if (toolNow === 'doors' || toolNow === 'handle' || toolNow === 'shelf' || toolNow === 'frame') {
        handleArDetailActionRef.current(e.clientX, e.clientY);
        return;
      }

      const local = floorPointAtClientRef.current(e.clientX, e.clientY);
      if (!local) {
        onToast('روی سطح کف یا کابینت معتبر لمس کنید');
        return;
      }
      if (reticleRef.current) reticleRef.current.position.set(local.x, 0.012, local.z);
      updateArGhostRef.current(local, e.clientX, e.clientY);
      applyFloorActionRef.current(local, e.clientX, e.clientY);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!activeRef.current) return;
      const dr = arDragRef.current;
      if (dr) {
        const dc = dragDownClientRef.current;
        const movedPx = dc ? Math.hypot(e.clientX - dc.x, e.clientY - dc.y) : 999;
        if (dr.kind === 'drag-a') {
          const floorPt = floorPointAtClientRef.current(e.clientX, e.clientY);
          if (!floorPt) return;
          if (!dr.moved && movedPx < 4) return;
          dr.moved = true;
          const a = pointARef.current;
          const al = alignmentRef.current;
          const cos = Math.cos(al.yaw);
          const sin = Math.sin(al.yaw);
          const nextX = floorPt.x - al.scale * (a.x * cos + a.z * sin);
          const nextZ = floorPt.z - al.scale * (-a.x * sin + a.z * cos);
          setAlignment((prev) => ({ ...prev, x: nextX, z: nextZ }));
          requestPreviewRender();
          return;
        }
        if (dr.kind === 'drag-b') {
          const floorPt = floorPointAtClientRef.current(e.clientX, e.clientY);
          if (!floorPt) return;
          if (!dr.moved && movedPx < 4) return;
          dr.moved = true;
          const a = pointARef.current;
          const b = pointBRef.current;
          const sol = fitCalibrationDragABWithScale(a, b, dr.anchorA, { x: floorPt.x, z: floorPt.z });
          if (sol) {
            setAlignment({ x: sol.x, z: sol.z, yaw: sol.yaw, scale: sol.scale });
            const distCm = Math.round(Math.hypot(b.x - a.x, b.z - a.z) * sol.scale * 100);
            setRealDistanceInput(String(distCm));
            requestPreviewRender();
          }
          return;
        }
        if (dr.kind === 'move-box') {
          const proj = projectArPointerOntoWallRef.current(dr.wallId, e.clientX, e.clientY);
          if (!proj) return;
          if (!dr.moved && movedPx < 5 && Math.abs(proj.xCm - dr.startDot) < 2.5) return;
          dr.moved = true;
          const dx = Math.round((proj.xCm - dr.startDot) / 5) * 5;
          const target = dr.origX + dx;
          if (target !== dr.lastTargetX) {
            dr.lastTargetX = target;
            propsRef.current.onMoveBox?.(dr.wallId, dr.boxId, target, false, dr.sessionId);
          }
          return;
        }
        if (dr.kind === 'move-app') {
          const proj = projectArPointerOntoWallRef.current(dr.wallId, e.clientX, e.clientY);
          if (!proj) return;
          if (!dr.moved && movedPx < 5 && Math.abs(proj.xCm - dr.startDot) < 2.5) return;
          dr.moved = true;
          const dx = Math.round((proj.xCm - dr.startDot) / 5) * 5;
          const target = dr.origX + dx;
          if (target !== dr.lastTargetX) {
            dr.lastTargetX = target;
            propsRef.current.onMoveAppliance?.(dr.wallId, dr.appId, target, false, dr.sessionId);
          }
          return;
        }
      }

      lastHoverCoordsRef.current = { x: e.clientX, y: e.clientY };
      const toolNow = arToolRef.current;
      if (toolNow === 'select' || toolNow.startsWith('calibrate-')) {
        setCursorPreview(null);
        return;
      }
      const floor = floorPointAtClientRef.current(e.clientX, e.clientY);
      if (!floor) {
        setCursorPreview({ x: e.clientX, y: e.clientY, status: 'invalid' });
        return;
      }
      lastPreviewTouchRef.current = performance.now();
      if (reticleRef.current) reticleRef.current.position.set(floor.x, 0.012, floor.z);
      const status = updateArGhostRef.current(floor, e.clientX, e.clientY);
      setCursorPreview({ x: e.clientX, y: e.clientY, status });
      renderOnceRef.current();
    };

    const onPointerUp = (e: PointerEvent) => {
      const dr = arDragRef.current;
      arDragRef.current = null;
      dragDownClientRef.current = null;
      if (!xrSessionRef.current) controls.enabled = true;
      try {
        if (dom.hasPointerCapture(e.pointerId)) dom.releasePointerCapture(e.pointerId);
      } catch {}

      if (dr?.kind === 'move-box' && dr.moved && dr.lastTargetX !== dr.origX) {
        propsRef.current.onMoveBox?.(dr.wallId, dr.boxId, dr.lastTargetX, true, dr.sessionId);
      } else if (dr?.kind === 'move-app' && dr.moved && dr.lastTargetX !== dr.origX) {
        propsRef.current.onMoveAppliance?.(dr.wallId, dr.appId, dr.lastTargetX, true, dr.sessionId);
      } else if (dr?.kind === 'drag-b' && dr.moved) {
        const a = pointARef.current;
        const b = pointBRef.current;
        const distCm = Math.round(Math.hypot(b.x - a.x, b.z - a.z) * alignmentRef.current.scale * 100);
        onUpdateProject((prev) => ({
          ...prev,
          arCalibration: { a, b, realDistanceCm: distCm },
        }));
      }
    };

    // Two-finger vertical drag anywhere in AR cycles models cleanly
    const stepToolOption = (dir: 1 | -1) => {
      const cur = propsRef.current;
      const toolNow = arToolRef.current;
      if (toolNow === 'handle') {
        const idx = Math.max(0, HANDLE_STYLE_ORDER.indexOf(cur.handleStyle));
        const nxt = HANDLE_STYLE_ORDER[(idx + (dir > 0 ? 1 : HANDLE_STYLE_ORDER.length - 1)) % HANDLE_STYLE_ORDER.length];
        cur.onHandleStyleChange?.(nxt);
        onToast(`دستگیره: ${nxt === 'knob' ? 'دکمه‌ای' : nxt === 'hidden' ? 'مخفی' : 'میله‌ای'}`);
      } else if (toolNow === 'fridge') {
        const idx = Math.max(0, FRIDGE_MODEL_ORDER.indexOf(cur.fridgeModel));
        const nxt = FRIDGE_MODEL_ORDER[(idx + (dir > 0 ? 1 : FRIDGE_MODEL_ORDER.length - 1)) % FRIDGE_MODEL_ORDER.length];
        cur.onFridgeModelChange?.(nxt);
        onToast(`یخچال: ${FRIDGE_MODELS[nxt].shortLabel}`);
      } else if (toolNow === 'sink') {
        const idx = Math.max(0, SINK_MODEL_ORDER.indexOf(cur.sinkModel));
        const nxt = SINK_MODEL_ORDER[(idx + (dir > 0 ? 1 : SINK_MODEL_ORDER.length - 1)) % SINK_MODEL_ORDER.length];
        cur.onSinkModelChange?.(nxt);
        onToast(`سینک: ${SINK_MODELS[nxt].shortLabel}`);
      } else if (toolNow === 'gas') {
        const widths = [...GAS_WIDTH_OPTIONS];
        const idx = Math.max(0, widths.indexOf(cur.gasWidth as (typeof GAS_WIDTH_OPTIONS)[number]));
        const nxt = widths[(idx + (dir > 0 ? 1 : widths.length - 1)) % widths.length];
        cur.onGasWidthChange?.(nxt);
        onToast(`گاز: ${nxt}cm`);
      } else if (toolNow === 'appliance') {
        const idx = Math.max(0, APPLIANCE_ORDER.indexOf(cur.applianceKind));
        const nxt = APPLIANCE_ORDER[(idx + (dir > 0 ? 1 : APPLIANCE_ORDER.length - 1)) % APPLIANCE_ORDER.length];
        cur.onApplianceKindChange?.(nxt);
        onToast(`تجهیز: ${APPLIANCE_CONFIGS[nxt].shortLabel}`);
      } else if (toolNow === 'opening') {
        const idx = Math.max(0, OPENING_ORDER.indexOf(cur.openingKind));
        const nxt = OPENING_ORDER[(idx + (dir > 0 ? 1 : OPENING_ORDER.length - 1)) % OPENING_ORDER.length];
        cur.onOpeningKindChange?.(nxt);
        onToast(`بازشو: ${OPENING_DEFAULTS[nxt].label}`);
      } else if (toolNow === 'cab-base' || toolNow === 'cab-wall' || toolNow === 'cab-tall') {
        const idx = Math.max(0, CAB_DRAW_KIND_ORDER.indexOf(cur.drawBoxKind));
        const nxt = CAB_DRAW_KIND_ORDER[(idx + (dir > 0 ? 1 : CAB_DRAW_KIND_ORDER.length - 1)) % CAB_DRAW_KIND_ORDER.length];
        cur.onSelectDrawBoxKind?.(nxt);
        setArTool(nxt === 'wall' ? 'cab-wall' : nxt === 'tall' ? 'cab-tall' : 'cab-base');
      }
    };

    let twoFingerMidY: number | null = null;
    const isArCyclableTool = (t: ArToolId): boolean =>
      t !== 'select' && t !== 'wall' && !t.startsWith('calibrate-');

    const updateTouchPreview = (midX: number, midY: number) => {
      lastHoverCoordsRef.current = { x: midX, y: midY };
      const floor = floorPointAtClientRef.current(midX, midY);
      const status = floor ? updateArGhostRef.current(floor, midX, midY) : 'invalid';
      setCursorPreview({ x: midX, y: midY, status });
      renderOnceRef.current();
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2 && arToolRef.current !== 'select' && !arToolRef.current.startsWith('calibrate-')) {
        controls.enabled = false;
        gestureStepperRef.current.resetTouch();
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        twoFingerMidY = midY;
        updateTouchPreview(midX, midY);
      } else {
        twoFingerMidY = null;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || twoFingerMidY === null) return;
      e.preventDefault();
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const deltaY = midY - twoFingerMidY;
      twoFingerMidY = midY;
      const pacedDir = gestureStepperRef.current.consumeTouchDelta(deltaY);
      if (pacedDir !== 0) {
        stepToolOption(pacedDir);
      }
      updateTouchPreview(midX, midY);
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        twoFingerMidY = null;
        gestureStepperRef.current.resetTouch();
        if (!arDragRef.current && !xrSessionRef.current) controls.enabled = true;
      }
    };
    const onWheelCapture = (e: WheelEvent) => {
      if (!activeRef.current || e.ctrlKey || !isArCyclableTool(arToolRef.current)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      lastHoverCoordsRef.current = { x: e.clientX, y: e.clientY };
      const pacedDir = gestureStepperRef.current.consumeWheelDelta(e.deltaY, e.deltaMode);
      if (pacedDir !== 0) {
        stepToolOption(pacedDir);
      }
      updateTouchPreview(e.clientX, e.clientY);
    };

    dom.addEventListener('pointerdown', onPointerDownCapture, { capture: true });
    dom.addEventListener('wheel', onWheelCapture as EventListener, { passive: false, capture: true });
    dom.addEventListener('dblclick', onDblClick);
    dom.addEventListener('touchstart', onTouchStart, { passive: true });
    dom.addEventListener('touchmove', onTouchMove, { passive: false });
    dom.addEventListener('touchend', onTouchEnd);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    const onResize = () => {
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 500;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestPreviewRender();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(container);
    requestPreviewRender();

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      dom.removeEventListener('pointerdown', onPointerDownCapture, { capture: true });
      dom.removeEventListener('wheel', onWheelCapture as EventListener, { capture: true });
      dom.removeEventListener('dblclick', onDblClick);
      dom.removeEventListener('touchstart', onTouchStart);
      dom.removeEventListener('touchmove', onTouchMove);
      dom.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      ro.disconnect();
      controls.dispose();
      occlusion.dispose();
      if (xrSessionRef.current) {
        xrSessionRef.current.end().catch(() => {});
        xrSessionRef.current = null;
      }
      if (kitchenMountRef.current) disposeObject3D(kitchenMountRef.current);
      builtSceneRef.current = null;
      envRT.dispose();
      pmrem.dispose();
      renderer.dispose();
    };
  }, []);

  // Keep CursorToolPreview updated immediately on tool or option switch (even without moving mouse)
  useEffect(() => {
    if (!active || arTool === 'select' || arTool.startsWith('calibrate-')) {
      setCursorPreview(null);
      return;
    }
    if (lastHoverCoordsRef.current) {
      const pt = lastHoverCoordsRef.current;
      const floor = floorPointAtClientRef.current(pt.x, pt.y);
      const status = floor ? updateArGhostRef.current(floor, pt.x, pt.y) : 'invalid';
      setCursorPreview({ x: pt.x, y: pt.y, status });
    }
  }, [active, arTool, fridgeModel, sinkModel, gasWidth, applianceKind, openingKind, handleStyle, handleOrient]);

  // Update 3D kitchen meshes inside AR floor group whenever project/alignment/doorsOpen updates
  useEffect(() => {
    const mount = kitchenMountRef.current;
    const floorGroup = floorGroupRef.current;
    if (!mount || !floorGroup) return;

    while (mount.children.length > 0) {
      const child = mount.children[0];
      mount.remove(child);
      disposeObject3D(child);
    }

    const built = buildKitchen3DScene(project, {
      doorOpenProgress: 0,
      hideFloor: false,
      floorOpacity: 0.72,
    });
    builtSceneRef.current = built;

    const validIds = new Set(built.animatedDoors.map((d) => d.doorId));
    for (const k of Array.from(doorStatesRef.current.keys())) {
      if (!validIds.has(k)) doorStatesRef.current.delete(k);
    }
    const defaultTarget = doorsOpenRef.current ? 1 : 0;
    for (const h of built.animatedDoors) {
      let st = doorStatesRef.current.get(h.doorId);
      if (!st) {
        st = { cur: defaultTarget, target: defaultTarget };
        doorStatesRef.current.set(h.doorId, st);
      }
      if (st.cur > 0) applyAnimatedDoorProgress(h, st.cur);
    }

    mount.add(built.root);
    mount.position.set(alignment.x, 0, alignment.z);
    mount.rotation.y = alignment.yaw;
    mount.scale.setScalar(alignment.scale);

    // Sync calibration A/B pins, connected lineAB, AND perpendicular ruler ticks
    if (pinARef.current && pinBRef.current && lineABRef.current && rulerTicksRef.current) {
      const toAligned = (p: XZPoint) => {
        const cos = Math.cos(alignment.yaw);
        const sin = Math.sin(alignment.yaw);
        return new THREE.Vector3(
          alignment.x + alignment.scale * (p.x * cos + p.z * sin),
          0.022,
          alignment.z + alignment.scale * (-p.x * sin + p.z * cos)
        );
      };
      const vA = toAligned(pointA);
      const vB = toAligned(pointB);
      pinARef.current.position.set(vA.x, 0, vA.z);
      pinBRef.current.position.set(vB.x, 0, vB.z);
      lineABRef.current.geometry.dispose();
      lineABRef.current.geometry = new THREE.BufferGeometry().setFromPoints([vA, vB]);
      const tickPts = buildAbRulerTickPoints(vA, vB);
      rulerTicksRef.current.geometry.dispose();
      rulerTicksRef.current.geometry = new THREE.BufferGeometry().setFromPoints(tickPts);
    }

    if (wallStartMarkerRef.current) {
      if (pendingWallStart) {
        const cos = Math.cos(alignment.yaw);
        const sin = Math.sin(alignment.yaw);
        wallStartMarkerRef.current.position.set(
          alignment.x + alignment.scale * (pendingWallStart.x * cos + pendingWallStart.z * sin),
          0.08,
          alignment.z + alignment.scale * (-pendingWallStart.x * sin + pendingWallStart.z * cos)
        );
        wallStartMarkerRef.current.visible = true;
      } else {
        wallStartMarkerRef.current.visible = false;
      }
    }

    if (floorNetMeshRef.current && floorNetUniformsRef.current) {
      floorNetMeshRef.current.visible = !floorLocked;
      floorNetUniformsRef.current.uOpacity.value = xrActive ? 0.95 : 0.45;
    }
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = !xrActive || !floorLocked;
    }
    if (reticleRef.current) {
      reticleRef.current.visible = reticleEnabled || (xrActive && !floorLocked);
    }
    if (wallGhostRef.current && !pendingWallStart) wallGhostRef.current.visible = false;
    if (placementGhostRef.current && (!active || (!floorLocked && xrActive))) placementGhostRef.current.visible = false;

    renderOnceRef.current();
  }, [project, alignment, pointA, pointB, pendingWallStart, xrActive, floorLocked, active, reticleEnabled]);

  const floorLocalToModelXZ = (localPt: THREE.Vector3): XZPoint => {
    const al = alignmentRef.current;
    const dx = (localPt.x - al.x) / al.scale;
    const dz = (localPt.z - al.z) / al.scale;
    const cos = Math.cos(al.yaw);
    const sin = Math.sin(al.yaw);
    return {
      x: +(dx * cos - dz * sin).toFixed(3),
      z: +(dx * sin + dz * cos).toFixed(3),
    };
  };

  const applyArFloorActionAt = (floorLocalPt: THREE.Vector3, _clientX?: number, _clientY?: number) => {
    const modelPt = floorLocalToModelXZ(floorLocalPt);
    const toolNow = arToolRef.current;
    const choices = propsRef.current;

    if (toolNow === 'select') return;

    if (toolNow === 'calibrate-a') {
      const curA = pointARef.current;
      const al = alignmentRef.current;
      const cos = Math.cos(al.yaw);
      const sin = Math.sin(al.yaw);
      const nextX = floorLocalPt.x - al.scale * (curA.x * cos + curA.z * sin);
      const nextZ = floorLocalPt.z - al.scale * (-curA.x * sin + curA.z * cos);
      setAlignment((prev) => ({ ...prev, x: nextX, z: nextZ }));
      onToast('کل صحنه بر اساس نقطه مرجع A جابجا شد');
      return;
    }

    if (toolNow === 'calibrate-b') {
      const a = pointARef.current;
      const b = pointBRef.current;
      const al = alignmentRef.current;
      const cos = Math.cos(al.yaw);
      const sin = Math.sin(al.yaw);
      const anchorA = {
        x: al.x + al.scale * (a.x * cos + a.z * sin),
        z: al.z + al.scale * (-a.x * sin + a.z * cos),
      };
      const sol = fitCalibrationDragABWithScale(a, b, anchorA, { x: floorLocalPt.x, z: floorLocalPt.z });
      if (!sol) {
        onToast('فاصله نقاط A و B باید حداقل ۱۰ سانتی‌متر باشد');
        return;
      }
      setAlignment({ x: sol.x, z: sol.z, yaw: sol.yaw, scale: sol.scale });
      const distCm = Math.round(Math.hypot(b.x - a.x, b.z - a.z) * sol.scale * 100);
      setRealDistanceInput(String(distCm));
      onUpdateProject((prev) => ({
        ...prev,
        arCalibration: { a, b, realDistanceCm: distCm },
      }));
      onToast(`چرخش و مقیاس کل صحنه روی ${distCm}cm تنظیم شد`);
      return;
    }

    if (toolNow === 'wall') {
      const start = pendingWallStartRef.current;
      if (!start) {
        setPendingWallStart(modelPt);
        onToast('نقطه شروع دیوار ثبت شد — نقطه بعدی را انتخاب یا تأیید کنید');
        return;
      }
      const distCm = Math.hypot(modelPt.x - start.x, modelPt.z - start.z) * 100;
      if (distCm < 40) {
        onToast('طول دیوار باید حداقل ۴۰ سانتی‌متر باشد');
        return;
      }
      onUpdateProject((prev) => {
        const wallH = prev.settings?.wallHeightCm || DEFAULT_PROJECT_SETTINGS.wallHeightCm;
        const newWall = buildArScannedWall(prev.walls, start, modelPt, wallH);
        return {
          ...prev,
          walls: [...prev.walls, newWall],
          activeWallId: newWall.id,
          activeBoxId: null,
          selectedDoorId: null,
        };
      }, 'دیوار جدید روی کف AR ثبت شد');
      setPendingWallStart(modelPt);
      return;
    }

    const proj = projectRef.current;
    const pendingSweep = pendingCabSweepRef.current;
    const fixedWall = pendingSweep && proj.walls.find(w => w.id === pendingSweep.wallId);
    const hitWall = fixedWall ? {
      wall: fixedWall,
      offsetCm: Math.max(0, Math.min(fixedWall.length,
        (modelPt.x * 100 - fixedWall.x1Cm) * getWallVectors(fixedWall).tx +
        (modelPt.z * 100 - fixedWall.y1Cm) * getWallVectors(fixedWall).ty)),
    } : projectArPointOntoWalls(modelPt, proj.walls);
    if (!hitWall) {
      onToast('ابتدا نشانگر را نزدیک یک دیوار قرار دهید');
      return;
    }

    if (toolNow === 'cab-base' || toolNow === 'cab-wall' || toolNow === 'cab-tall') {
      const kind: BoxKind =
        toolNow === 'cab-base' ? 'base' : toolNow === 'cab-wall' ? 'wall' : 'tall';
      if (!pendingSweep) {
        // Never create a single fixed-width box on first tap.
        setPendingCabSweep({ wallId: hitWall.wall.id, startCm: hitWall.offsetCm, kind });
        onToast('شروع باکس ثبت شد؛ نشانگر را روی دیوار حرکت دهید و برای پایان تأیید بزنید');
        return;
      }
      const travel = Math.abs(hitWall.offsetCm - pendingSweep.startCm);
      if (travel < 30) {
        onToast('برای رسم باکس، حداقل ۳۰ سانتی‌متر روی دیوار پیش بروید');
        return;
      }
      const range = computeCabinetSweepRange(
        pendingSweep.startCm, hitWall.offsetCm, hitWall.wall.length, 30
      );
      onUpdateProject((prev) => {
        const next: ProjectState = JSON.parse(JSON.stringify(prev));
        const w = next.walls.find((x) => x.id === pendingSweep.wallId);
        if (!w) return prev;
        // Only interaction changed: leave all intelligent CAD creation,
        // hierarchy, corner carving and door optimizers untouched.
        const box = createEmptyBox(pendingSweep.kind, range.offsetX, range.width, {
          settings: next.settings,
        });
        w.boxes.push(box);
        if (pendingSweep.kind === 'tall') carveBoxesForPlacedBox(w, box);
        next.activeWallId = w.id;
        next.activeBoxId = box.id;
        return next;
      }, `باکس ${Math.round(range.width)} سانتی‌متری رسم شد`);
      setPendingCabSweep(null);
      return;
    }

    if (toolNow === 'fridge') {
      onUpdateProject((prev) => {
        const next: ProjectState = JSON.parse(JSON.stringify(prev));
        const w = next.walls.find((x) => x.id === hitWall.wall.id);
        if (!w) return prev;
        const wCenter = hitWall.offsetCm - (FRIDGE_MODELS[choices.fridgeModel].width + 10) / 2;
        const res = placeFridgeOnWall(w, next.walls, choices.fridgeModel, wCenter, next.cornerOwners, true, next.settings);
        if (!res.ok) {
          onToast(res.message);
          return prev;
        }
        next.activeWallId = w.id;
        next.activeBoxId = res.fridgeId || null;
        return next;
      }, `یخچال ${FRIDGE_MODELS[choices.fridgeModel].shortLabel} در AR نصب شد`);
      return;
    }

    if (toolNow === 'opening') {
      onUpdateProject((prev) => {
        const next: ProjectState = JSON.parse(JSON.stringify(prev));
        const w = next.walls.find((x) => x.id === hitWall.wall.id);
        if (!w) return prev;
        const cfg = OPENING_DEFAULTS[choices.openingKind];
        const op = createWallOpening(
          choices.openingKind,
          Math.max(0, Math.min(w.length - cfg.width, hitWall.offsetCm - cfg.width / 2)),
          w
        );
        if (!w.openings) w.openings = [];
        w.openings.push(op);
        next.activeWallId = w.id;
        next.selectedOpeningId = op.id;
        return next;
      }, `${OPENING_DEFAULTS[choices.openingKind].label} روی دیوار ثبت شد`);
      return;
    }

    if (toolNow === 'sink' || toolNow === 'gas' || toolNow === 'appliance') {
      onUpdateProject((prev) => {
        const next: ProjectState = JSON.parse(JSON.stringify(prev));
        const w = next.walls.find((x) => x.id === hitWall.wall.id);
        if (!w) return prev;
        const baseBox = w.boxes.find(
          (b) =>
            b.type === 'base' &&
            hitWall.offsetCm >= b.offsetX - 5 &&
            hitWall.offsetCm <= b.offsetX + b.width + 5
        );
        if (!baseBox) {
          onToast('ابتدا در این قسمت باکس زمینی بکشید');
          return prev;
        }
        const kind: ApplianceKind =
          toolNow === 'sink' ? 'sink' : toolNow === 'gas' ? 'gas' : choices.applianceKind;
        const appW =
          kind === 'sink'
            ? SINK_MODELS[choices.sinkModel].width
            : kind === 'gas'
            ? choices.gasWidth
            : APPLIANCE_CONFIGS[kind].width;
        const res = placeApplianceWithCabinetRules(
          w,
          next.walls,
          kind,
          baseBox,
          hitWall.offsetCm - appW / 2,
          next.cornerOwners,
          choices.hoodKind,
          { sinkModel: choices.sinkModel, customWidth: kind === 'gas' ? choices.gasWidth : undefined }
        );
        if (!res.ok) {
          onToast(res.message);
          return prev;
        }
        next.activeWallId = w.id;
        next.activeBoxId = baseBox.id;
        next.selectedApplianceId = res.appliance?.id || null;
        return next;
      });
    }
  };
  applyFloorActionRef.current = applyArFloorActionAt;

  const handleArDetailAction = (clientX: number, clientY: number) => {
    const picked = detailedPickAtClientRef.current(clientX, clientY);
    const mount = kitchenMountRef.current;
    const built = builtSceneRef.current;
    const choices = propsRef.current;
    const toolNow = arToolRef.current;

    if (!picked?.data.boxId || !mount || !built) {
      if (toolNow === 'handle') {
        const nxt: Orientation = choices.handleOrient === 'vertical' ? 'horizontal' : 'vertical';
        choices.onHandleOrientChange?.(nxt);
        onToast(`جهت دستگیره: ${nxt === 'vertical' ? 'عمودی' : 'افقی'}`);
      } else {
        onToast('ابتدا روی قسمت معتبر یک کابینت لمس کنید');
      }
      return;
    }

    const transform = built.wallTransforms.get(picked.data.wallId);
    if (!transform) return;
    mount.updateWorldMatrix(true, true);
    const modelPt = mount.worldToLocal(picked.point.clone());
    const distance = modelPt.clone().sub(transform.origin);
    const xCm = distance.dot(transform.tangent) * 100;
    const yCm = modelPt.y * 100;

    let feedback = '';
    onUpdateProject((prev) => {
      const next: ProjectState = JSON.parse(JSON.stringify(prev));
      const w = next.walls.find((x) => x.id === picked.data.wallId);
      const box = w?.boxes.find((b) => b.id === picked.data.boxId);
      if (!w || !box) return prev;
      const localX = Math.max(0, Math.min(box.width, xCm - box.offsetX));
      const zones = getCornerBlockedZonesForWall(w, next.walls, next.cornerOwners);

      if (toolNow === 'handle') {
        const door =
          (picked.data.doorId ? box.doors.find((d) => d.id === picked.data.doorId) : undefined) ||
          box.doors.find((d) => localX >= d.startCm - 0.5 && localX <= d.startCm + d.widthCm + 0.5);
        if (!door || door.kind === 'fridge') {
          feedback = 'ابتدا روی یک درب کابینت لمس کنید';
          return prev;
        }
        autoUnitizeBoxForHandles(box, zones);
        const targetDoor = box.doors.find((d) => d.id === door.id);
        if (!targetDoor) return prev;

        const innerBot = box.elevY + box.plinth;
        const innerH = Math.max(10, box.height - box.plinth - box.countertopCm);
        const normY = Math.max(0, Math.min(1, 1 - (yCm - innerBot) / innerH));
        let rowIndex = 0;
        let yRatio = box.type === 'wall' || box.type === 'wall-deep' ? 0.82 : 0.18;
        if ((targetDoor.kind === 'drawer' || targetDoor.kind === 'lift') && targetDoor.drawerRatios.length > 0) {
          const pts = [0, ...targetDoor.drawerRatios, 1];
          for (let ri = 0; ri < pts.length - 1; ri++) {
            if (normY >= pts[ri] && normY <= pts[ri + 1]) {
              rowIndex = ri;
              yRatio = 0.5;
              break;
            }
          }
        } else if (targetDoor.kind === 'door' && targetDoor.doorStyle === 'pantry') {
          yRatio = 0.5;
        }

        let xRatio = 0.5;
        if (targetDoor.kind === 'door' && targetDoor.doorStyle !== 'pantry') {
          const isRightEdge = localX >= targetDoor.startCm + targetDoor.widthCm / 2;
          xRatio = isRightEdge ? 0.86 : 0.14;
          targetDoor.hingeSide = isRightEdge ? 'left' : 'right';
        }

        box.handles = box.handles.filter(
          (h) => !(h.doorId === targetDoor.id && (h.rowIndex ?? 0) === rowIndex)
        );
        const hId = uid('hnd');
        box.handles.push({
          id: hId,
          doorId: targetDoor.id,
          style: choices.handleStyle,
          orient: choices.handleOrient,
          lengthCm: 16,
          xRatio,
          yRatio,
          rowIndex,
        });
        next.activeWallId = w.id;
        next.activeBoxId = box.id;
        next.selectedDoorId = targetDoor.id;
        next.selectedHandleId = hId;
        feedback = 'دستگیره روی درب نصب شد و جهت بازشو مشخص گردید';
      } else if (toolNow === 'doors') {
        const preview = computeDoorBrushPreview(box, localX, 'vertical', 1, 1, 0, zones, 60);
        const res = applyDoorBrushPreview(box, localX, preview, zones);
        if (!res.ok) {
          feedback = res.message || 'امکان درج درب در این محل نیست';
          return prev;
        }
        next.selectedDoorId = res.selectedDoorId;
        next.activeBoxId = box.id;
        next.activeWallId = w.id;
        feedback = 'درب ثبت شد (برای تعیین جهت لولا دستگیره بگذارید)';
      } else if (toolNow === 'shelf') {
        const unit = getUnitsInBox(box, zones).find((u) => localX >= u.startCm && localX <= u.endCm);
        if (!unit || !unit.canHaveShelves) {
          feedback = unit?.blockedReason || 'این یونیت ظرفیت طبقه جدید ندارد';
          return prev;
        }
        const innerH = Math.max(1, box.height - box.plinth - box.countertopCm);
        const yRatio = Math.max(0, Math.min(1, 1 - (yCm - box.elevY - box.plinth) / innerH));
        const res = addShelvesWithMinGap(box, unit.startCm, unit.endCm, 1, yRatio);
        if (!res.ok) {
          feedback = res.message;
          return prev;
        }
        next.activeBoxId = box.id;
        next.activeWallId = w.id;
        feedback = 'طبقه با حداقل فاصله ۲۵cm اضافه شد';
      } else if (toolNow === 'frame') {
        const yLocal = yCm - box.elevY;
        const margin = 8;
        const side =
          localX <= margin
            ? 'left'
            : localX >= box.width - margin
            ? 'right'
            : yLocal >= box.height - margin
            ? 'top'
            : yLocal <= margin
            ? 'bottom'
            : null;
        if (!side) {
          feedback = 'برای نصب فریم روی لبه باکس لمس کنید';
          return prev;
        }
        const exposure = getBoxSideExposure(box, w, next.walls, next.cornerOwners, zones);
        const res = placeFrameOnBox(box, side, 5, undefined, exposure);
        if (!res.ok) {
          feedback = res.message;
          return prev;
        }
        next.activeBoxId = box.id;
        next.activeWallId = w.id;
        next.selectedFrameId = res.frame?.id || null;
        feedback = res.message;
      } else {
        return prev;
      }
      return next;
    });

    if (feedback) onToast(feedback);
  };
  handleArDetailActionRef.current = handleArDetailAction;

  // Triggered by floating Confirm (تأیید) button in AR
  const handleConfirmAction = () => {
    const renderer = rendererRef.current;
    if (xrActive && !floorLocked) {
      handleLockFloor();
      return;
    }
    if (arToolRef.current === 'wall' && pendingWallStartRef.current && renderer) {
      const rect = renderer.domElement.getBoundingClientRect();
      const centerLocal = floorPointAtClientRef.current(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2
      );
      if (centerLocal) {
        const pt = floorLocalToModelXZ(centerLocal);
        const distCm = Math.hypot(pt.x - pendingWallStartRef.current.x, pt.z - pendingWallStartRef.current.z) * 100;
        if (distCm >= 40) {
          applyFloorActionRef.current(centerLocal);
        }
      }
      // Preserve endpoint so the next wall continues from the same corner.
      // Cancelling or changing the tool ends the connected wall chain.
      onToast('دیوار تأیید شد؛ نشانگر را به گوشه بعدی ببرید و دوباره تأیید بزنید');
      return;
    }
    if (renderer) {
      const rect = renderer.domElement.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      if (
        arToolRef.current === 'doors' ||
        arToolRef.current === 'handle' ||
        arToolRef.current === 'shelf' ||
        arToolRef.current === 'frame'
      ) {
        handleArDetailAction(cx, cy);
        return;
      }
      const centerLocal = floorPointAtClientRef.current(cx, cy);
      if (centerLocal) {
        applyFloorActionRef.current(centerLocal, cx, cy);
      }
    }
  };

  // Triggered by floating Cancel (لغو) button in AR
  const handleCancelAction = () => {
    setPendingWallStart(null);
    setPendingCabSweep(null);
    arDragRef.current = null;
    if (wallGhostRef.current) wallGhostRef.current.visible = false;
    if (placementGhostRef.current) placementGhostRef.current.visible = false;
    if (arTool !== 'select') {
      setArTool('select');
      onToast('عملیات لغو شد و به حالت انتخاب برگشتید');
    } else {
      onToast('لغو شد');
    }
  };

  // Start / Resume WebXR session with full MaxLightner/kitchyar multi-ray + plane hit-test & anchors!
  const startWebXrSession = async (pendingSession?: Promise<XRSession> | null) => {
    const xr = (navigator as unknown as { xr?: XRSystem }).xr;
    const renderer = rendererRef.current;
    // A pre-requested session uses document.body as its persistent DOM overlay.
    const overlayRoot = overlayRootRef.current || document.body;
    if ((!xr && !pendingSession) || !renderer || !overlayRoot) {
      onToast('این مرورگر یا دستگاه از WebXR AR پشتیبانی نمی‌کند (پیش‌نمایش کالیبراسیون فعال است)');
      return;
    }

    if (xrSessionRef.current) {
      setXrActive(true);
      return;
    }

    try {
      const session = await (pendingSession || xr!.requestSession('immersive-ar', chidoSessionOptions(overlayRoot)));
      xrSessionRef.current = session;
      setXrActive(true);
      if (controlsRef.current) controlsRef.current.enabled = false;
      floorScannerRef.current.reset();
      anchorsRef.current = [];
      anchorCandidatesRef.current = [];
      anchorPendingRef.current = false;
      anchorGenerationRef.current++;
      anchorStabilizerRef.current = new AnchorStabilizer();
      anchorLastTimeRef.current = 0;
      pendingAnchorCreateRef.current = false;
      setFloorLocked(false);

      session.addEventListener('end', () => {
        renderer.setAnimationLoop(null);
        xrSessionRef.current = null;
        for (const s of hitTestSourcesRef.current) {
          try { s.cancel(); } catch {}
        }
        hitTestSourcesRef.current = [];
        try { lowerHitSourceRef.current?.cancel(); } catch {}
        lowerHitSourceRef.current = null;
        try { transientHitSourceRef.current?.cancel(); } catch {}
        transientHitSourceRef.current = null;
        setXrActive(false);
        setFloorLocked(false);
        setScanReady(false);
        setOcclusionStatus('idle');
        onSessionEnded?.();
        if (controlsRef.current) controlsRef.current.enabled = true;
        renderOnceRef.current();
      });

      // Exact Chido orientation: a local reference space and a true forward
      // viewer-space plane hit test. Additional rays ROTATE their direction,
      // rather than moving their origin sideways (the old Kitchyar bug).
      renderer.xr.setReferenceSpaceType('local');
      await renderer.xr.setSession(session);
      const viewerSpace = await session.requestReferenceSpace('viewer');
      const central = await session.requestHitTestSource({
        space: viewerSpace,
        entityTypes: ['plane'],
      });
      hitTestSourcesRef.current = [central];
      for (const [rx, ry] of CHIDO_SCAN_RAYS) {
        try {
          const direction = new THREE.Vector3(rx, ry, -1).normalize();
          const rotation = new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 0, -1), direction
          );
          const transformed = await session.requestReferenceSpace('viewer');
          const raySpace = transformed.getOffsetReferenceSpace(
            new XRRigidTransform({}, {
              x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w,
            })
          );
          const hit = await session.requestHitTestSource({
            space: raySpace,
            entityTypes: ['plane'],
          });
          if (xrSessionRef.current !== session) {
            hit.cancel();
            break;
          }
          hitTestSourcesRef.current.push(hit);
        } catch {
          // Chido keeps its central reticle if auxiliary rays are unsupported.
          break;
        }
      }
      if (!session.domOverlayState) {
        throw new DOMException('Chido needs WebXR DOM Overlay for floor confirmation', 'NotSupportedError');
      }
      if (floorNetMeshRef.current) floorNetMeshRef.current.visible = false;
      let lastXrFrameTime = 0;
      renderer.setAnimationLoop((time: number, frame?: XRFrame) => {
        if (!frame || !rendererRef.current || !sceneRef.current || !cameraRef.current) return;
        const space = rendererRef.current.xr.getReferenceSpace();
        if (!space) return;
        const pose = frame.getViewerPose(space);
        if (!pose) return;

        if (!activeRef.current) {
          occlusionRef.current?.update(frame, pose, rendererRef.current, session, {
            enabled: occlusionEnabledRef.current,
            ar: false,
          });
          return;
        }

        if (floorNetUniformsRef.current) {
          floorNetUniformsRef.current.uTime.value = time / 1000;
        }

        occlusionRef.current?.update(frame, pose, rendererRef.current, session, {
          enabled: occlusionEnabledRef.current,
          ar: true,
        });
        if (occlusionRef.current) setOcclusionStatus(occlusionRef.current.status);

        // Exact Chido Studio.updateAnchor strategy: sequential anchors (up to
        // five), 42-cm separation, 5.5-cm level filter, robust pose estimation.
        if (floorLockedRef.current) {
          if (pendingAnchorCreateRef.current) {
            pendingAnchorCreateRef.current = false;
            anchorCandidatesRef.current = [
              ...floorScannerRef.current.observations.map(p => p.clone()),
              ...(floorScannerRef.current.point ? [floorScannerRef.current.point.clone()] : []),
            ];
          }
          for (const cross of crossesPoolRef.current) cross.visible = false;
          const origin = basePoseRef.current;
          if (origin && typeof frame.createAnchor === 'function' && anchorsRef.current.length + Number(anchorPendingRef.current) < 5) {
            const centralSource = hitTestSourcesRef.current[0];
            if (centralSource) {
              for (const hit of frame.getHitTestResults(centralSource)) {
                const candidatePose = hit.getPose(space);
                if (!candidatePose) continue;
                const pt = new THREE.Vector3(
                  candidatePose.transform.position.x,
                  candidatePose.transform.position.y,
                  candidatePose.transform.position.z,
                );
                if (Math.abs(pt.y - origin.y) > 0.055) continue;
                if (anchorCandidatesRef.current.every(p => p.distanceTo(pt) > 0.42)) {
                  anchorCandidatesRef.current.push(pt);
                }
              }
            }
            if (!anchorPendingRef.current && anchorsRef.current.length < 5) {
              const next = anchorCandidatesRef.current.find(p =>
                anchorsRef.current.every(node => node.requested.distanceTo(p) > 0.42)
              );
              if (next) {
                const generation = anchorGenerationRef.current;
                anchorPendingRef.current = true;
                try {
                  void frame.createAnchor(new XRRigidTransform({
                    x: next.x, y: next.y, z: next.z,
                  }), space).then(anchor => {
                    if (generation !== anchorGenerationRef.current || xrSessionRef.current !== session) {
                      try { anchor.delete(); } catch {}
                      return;
                    }
                    anchorsRef.current.push({
                      id: String(anchorsRef.current.length + 1),
                      anchor,
                      requested: next.clone(),
                      reference: null,
                    });
                    anchorPendingRef.current = false;
                  }, () => {
                    if (generation === anchorGenerationRef.current) {
                      anchorPendingRef.current = false;
                      anchorCandidatesRef.current = anchorCandidatesRef.current.filter(p => p !== next);
                    }
                  });
                } catch {
                  anchorPendingRef.current = false;
                  anchorCandidatesRef.current = anchorCandidatesRef.current.filter(p => p !== next);
                }
              }
            }
          }
          const samples: AnchorSample[] = [];
          for (const node of anchorsRef.current) {
            let candidatePose: XRPose | null = null;
            try { candidatePose = frame.getPose(node.anchor.anchorSpace, space); } catch {}
            if (!candidatePose) continue;
            const pos = candidatePose.transform.position;
            const observed: ChidoVec3 = [pos.x, pos.y, pos.z];
            if (!node.reference) node.reference = [...observed];
            samples.push({ id: node.id, reference: node.reference, observed });
          }
          if (samples.length >= 3 && origin && floorGroupRef.current) {
            const elapsed = anchorLastTimeRef.current
              ? Math.max(0.001, (time - anchorLastTimeRef.current) / 1000) : 0.016;
            anchorLastTimeRef.current = time;
            const fitted = anchorStabilizerRef.current.update(samples, elapsed);
            if (fitted.status !== 'insufficient') {
              const floorPt = chidoTransformPoint([origin.x, origin.y, origin.z], fitted.pose);
              floorGroupRef.current.position.set(...floorPt);
              floorGroupRef.current.rotation.y = fitted.pose.yaw;
            }
          }
          if (anchorsRef.current.length >= 5) {
            const central = hitTestSourcesRef.current[0];
            if (central) {
              try { central.cancel(); } catch {}
              hitTestSourcesRef.current.shift();
            }
          }
        } else if (!floorLockedRef.current) {
          const allSources = hitTestSourcesRef.current;
          const centerResults = allSources[0] ? frame.getHitTestResults(allSources[0]) : [];
          const extraResults: XRHitTestResult[] = [];
          for (let i = 1; i < allSources.length; i++) {
            extraResults.push(...frame.getHitTestResults(allSources[i]));
          }
          if (lowerHitSourceRef.current) {
            extraResults.push(...frame.getHitTestResults(lowerHitSourceRef.current));
          }
          if (transientHitSourceRef.current) {
            for (const t of frame.getHitTestResultsForTransientInput(transientHitSourceRef.current)) {
              extraResults.push(...t.results);
            }
          }

          const viewPos = new THREE.Vector3(
            pose.views[0].transform.position.x,
            pose.views[0].transform.position.y,
            pose.views[0].transform.position.z
          );
          const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(
            new THREE.Quaternion(
              pose.views[0].transform.orientation.x,
              pose.views[0].transform.orientation.y,
              pose.views[0].transform.orientation.z,
              pose.views[0].transform.orientation.w
            )
          );
          const pt = floorScannerRef.current.update(
            centerResults,
            extraResults,
            space,
            viewPos,
            time,
            forward
          );
          setScanReady(floorScannerRef.current.ready);
          if (pt && reticleRef.current && floorGroupRef.current) {
            floorGroupRef.current.position.set(pt.x, pt.y, pt.z);
            reticleRef.current.position.set(0, 0.012, 0);
          }

          // Render FloorScanner diagnostic crosses (0x83ffe3 accepted vs 0xff6b61 rejected)
          const hits = floorScannerRef.current.currentHits;
          crossesPoolRef.current.forEach((c, idx) => {
            const h = hits[idx];
            if (!h) {
              c.visible = false;
              return;
            }
            c.visible = true;
            c.position.set(h.point.x, h.point.y + 0.006, h.point.z);
            const mat = c.userData.mat as THREE.MeshBasicMaterial | undefined;
            if (mat) mat.color.setHex(h.accepted ? 0x83ffe3 : 0xff6b61);
          });
        }

        if (
          floorLockedRef.current &&
          reticleEnabledRef.current &&
          performance.now() - lastPreviewTouchRef.current > 450
        ) {
          const rect = renderer.domElement.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const local = floorPointAtClientRef.current(cx, cy);
          if (local) {
            if (reticleRef.current) reticleRef.current.position.set(local.x, 0.012, local.z);
            updateArGhostRef.current(local, cx, cy);
          }
        }

        const built = builtSceneRef.current;
        const elapsed = lastXrFrameTime ? (time - lastXrFrameTime) / 1000 : 0.016;
        lastXrFrameTime = time;
        if (built && built.animatedDoors.length > 0) {
          const step = Math.min(0.05, Math.max(0.001, elapsed)) / DOOR_ANIM_DURATION_S;
          for (const h of built.animatedDoors) {
            const st = doorStatesRef.current.get(h.doorId);
            if (!st) continue;
            const diff = st.target - st.cur;
            if (Math.abs(diff) > 0.001) {
              st.cur = Math.abs(diff) <= step ? st.target : st.cur + Math.sign(diff) * step;
              applyAnimatedDoorProgress(h, st.cur);
            }
          }
        }

        const xrCam = rendererRef.current.xr.getCamera();
        rendererRef.current.render(sceneRef.current, xrCam);
        const wideRenderer = trackedWideRendererRef.current;
        const wideCamera = trackedWideCameraRef.current;
        if (wideRenderer && wideCamera && floorLockedRef.current) {
          const view = pose.views.find((v) => v.eye === 'none') || pose.views[0];
          const t = view.transform;
          wideCamera.position.set(t.position.x, t.position.y, t.position.z);
          wideCamera.quaternion.set(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w);
          const host = containerRef.current;
          const width = Math.max(1, Math.floor(host?.clientWidth || 800));
          const height = Math.max(1, Math.floor(host?.clientHeight || 500));
          if (wideRenderer.domElement.width !== Math.round(width * wideRenderer.getPixelRatio()) ||
              wideRenderer.domElement.height !== Math.round(height * wideRenderer.getPixelRatio())) {
            wideRenderer.setSize(width, height, false);
          }
          wideCamera.aspect = width / height;
          wideCamera.fov = wideViewVerticalFov(wideViewModeRef.current, wideCamera.aspect);
          wideCamera.updateProjectionMatrix();
          wideCamera.updateMatrixWorld(true);
          try {
            wideRenderer.render(sceneRef.current, wideCamera);
          } catch {
            // A tablet can lose its secondary WebGL context under memory pressure.
            // Return to the tracked physical camera rather than breaking the XR loop.
            trackedWideRendererRef.current = null;
            setWideViewMode('normal');
            onToast('نمای واید در این دستگاه پشتیبانی نشد؛ دوربین واقعی فعال ماند');
          }
        }
      });

      onToast('اسکن خودکار کف فعال شد — دوربین را رو به کف نگه دارید');
    } catch {
      const partialSession = xrSessionRef.current;
      xrSessionRef.current = null;
      if (partialSession) partialSession.end().catch(() => {});
      renderer.setAnimationLoop(null);
      hitTestSourcesRef.current = [];
      lowerHitSourceRef.current = null;
      transientHitSourceRef.current = null;
      setXrActive(false);
      setFloorLocked(false);
      setScanReady(false);
      if (controlsRef.current) controlsRef.current.enabled = true;
      renderOnceRef.current();
      onToast('شروع دوربین واقعی WebXR ناموفق بود؛ مجوز دوربین و پشتیبانی ARCore را بررسی کنید');
      if (embeddedIn3D) onSessionEnded?.();
    }
  };

  useEffect(() => {
    const parent = containerRef.current;
    if (!embeddedIn3D || !xrActive || !floorLocked || wideViewMode === 'normal' || !parent) return;
    const wideRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    wideRenderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    wideRenderer.setClearColor(0xf3f4f6, 1);
    wideRenderer.outputColorSpace = THREE.SRGBColorSpace;
    wideRenderer.toneMapping = THREE.ReinhardToneMapping;
    wideRenderer.toneMappingExposure = 1.12;
    wideRenderer.shadowMap.enabled = true;
    wideRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const canvas = wideRenderer.domElement;
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;';
    parent.appendChild(canvas);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.03, 80);
    trackedWideRendererRef.current = wideRenderer;
    trackedWideCameraRef.current = camera;
    return () => {
      if (trackedWideRendererRef.current === wideRenderer) {
        trackedWideRendererRef.current = null;
        trackedWideCameraRef.current = null;
      }
      wideRenderer.dispose();
      canvas.remove();
    };
  }, [embeddedIn3D, xrActive, floorLocked, wideViewMode]);

  const handleLockFloor = () => {
    if (xrActive && !floorScannerRef.current.ready) {
      onToast('در حال تکمیل تشخیص سطح کف؛ لحظه‌ای دوربین را روی کف ثابت نگه دارید');
      return;
    }
    const pt = floorScannerRef.current.point;
    if (xrActive && pt && floorGroupRef.current) {
      basePoseRef.current = { x: pt.x, y: pt.y, z: pt.z, yaw: 0 };
      floorGroupRef.current.position.set(pt.x, pt.y, pt.z);
      anchorsRef.current = [];
      pendingAnchorCreateRef.current = true;
    }
    for (const c of crossesPoolRef.current) c.visible = false;
    setFloorLocked(true);
    setArTool('wall');
    onFloorConfirmed?.();
    onToast('کف تأیید شد؛ ابزار دیوار در محیط سه‌بعدی آماده است');
  };

  const handleApplyRealDistance = () => {
    const cm = Number(realDistanceInput);
    const nextScale = computeScaleFromRealDistanceCm(pointA, pointB, cm);
    if (!nextScale) {
      onToast('فاصله واقعی باید حداقل ۲۰ سانتی‌متر باشد');
      return;
    }
    setAlignment((prev) => ({ ...prev, scale: nextScale }));
    onUpdateProject((prev) => ({
      ...prev,
      arCalibration: { a: pointA, b: pointB, realDistanceCm: cm },
    }));
    onToast(`مقیاس AR روی فاصله واقعی ${cm}cm تنظیم شد (ضریب ${nextScale})`);
  };

  const abDistanceCm = useMemo(
    () => Math.round(Math.hypot(pointB.x - pointA.x, pointB.z - pointA.z) * alignment.scale * 100),
    [pointA, pointB, alignment.scale]
  );

  // React effects run after the 3D canvas and WebXR renderer are mounted. The
  // actual requestSession() happened in the preceding real user click.
  useEffect(() => {
    if (initialSession) void startWebXrSession(initialSession);
    // Each launch promise has unique identity; do not restart for tool changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSession]);

  const previewToolId: ToolId = arTool.startsWith('cab-')
    ? 'cab-draw'
    : arTool === 'shelf'
    ? 'pencil'
    : (arTool as ToolId);
  const previewBoxKind: BoxKind =
    arTool === 'cab-wall' ? 'wall' : arTool === 'cab-tall' ? 'tall' : drawBoxKind;

  return (
    <section
      aria-label="محیط اسکن کف و طراحی AR"
      data-testid="ar-workspace"
      data-xr-active={xrActive ? '1' : '0'}
      data-floor-locked={floorLocked ? '1' : '0'}
      data-ab-distance-cm={String(abDistanceCm)}
      className={`absolute inset-0 z-10 flex flex-col transition-opacity ${
        active ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        ref={containerRef}
        onPointerLeave={() => {
          lastHoverCoordsRef.current = null;
          setCursorPreview(null);
        }}
        className={`flex-1 relative cursor-crosshair ${
          xrActive || embeddedIn3D ? 'bg-transparent' : 'bg-gradient-to-b from-slate-200 via-slate-100 to-slate-200'
        }`}
      />

      {/* Aiming Reticle overlay for precise AR aiming */}
      {reticleEnabled && (
        <div
          data-testid="ar-reticle-overlay"
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
        >
          <div className="relative w-12 h-12 flex items-center justify-center">
            <div className="w-10 h-10 rounded-full border-2 border-emerald-500/80 shadow-sm" />
            <div className="absolute w-2 h-2 rounded-full bg-emerald-600" />
            <div className="absolute inset-x-0 h-[1.5px] bg-emerald-500/45" />
            <div className="absolute inset-y-0 w-[1.5px] bg-emerald-500/45" />
          </div>
        </div>
      )}

      {/* The original Scene3DCanvas owns every 3D camera and wall-selector button.
          No duplicate scanner toolbar: XR provides only its camera and floor UI. */}
      {/* The scanned camera is only a layer of the existing 3D editor. */}
      {embeddedIn3D ? (
        <div className="absolute top-[58px] left-2.5 right-2.5 z-20 pointer-events-none flex justify-center">
          <div className="pointer-events-auto bg-white/95 border border-emerald-300 rounded-xl shadow-lg px-3 py-2 flex items-center gap-2 text-[13px] font-bold">
            {!xrActive ? (
              <button type="button" onClick={() => void startWebXrSession()} className="h-10 px-3 rounded-lg bg-emerald-600 text-white">
                شروع دوربین و اسکن کف
              </button>
            ) : !floorLocked ? (
              <>
                <span>{scanReady ? 'کف شناسایی شد' : 'دوربین را آرام روی کف حرکت دهید'}</span>
                <button type="button" disabled={!scanReady} onClick={handleLockFloor}
                  className="h-10 px-3 rounded-lg bg-indigo-600 text-white disabled:bg-slate-300 disabled:text-slate-600">
                  تأیید کف
                </button>
              </>
            ) : (
              <>
                <span className="text-emerald-800">کف تأیید شد • نمای سه‌بعدی با دوربین تبلت</span>
                <button type="button" onClick={() => {
                  floorScannerRef.current.reset();
                  anchorsRef.current = [];
                  setFloorLocked(false);
                  setScanReady(false);
                }} className="h-9 px-2 rounded-lg border border-emerald-300 text-emerald-700">اسکن مجدد</button>
              </>
            )}
          </div>
        </div>
      ) : (
        <>
      {/* Top Floating AR Status & Calibration Card */}
      <div className="absolute top-2.5 right-2.5 left-2.5 flex flex-wrap items-start justify-between gap-2 pointer-events-none z-20">
        <div className="pointer-events-auto bg-white/95 border border-slate-200 rounded-xl shadow-md px-3 py-2 flex flex-wrap items-center gap-2 text-[13px]">
          {xrSupported && !xrActive ? (
            <button
              type="button"
              onClick={() => void startWebXrSession()}
              className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black inline-flex items-center gap-1.5"
            >
              <Camera className="w-4 h-4" />
              <span>شروع دوربین AR (WebXR)</span>
            </button>
          ) : (
            <span className="h-8 px-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-extrabold inline-flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5" />
              <span>{xrActive ? 'سشن WebXR زنده' : 'پیش‌نمایش کالیبراسیون AR'}</span>
            </span>
          )}

          {xrActive && !floorLocked && (
            <button
              type="button"
              onClick={handleLockFloor}
              disabled={!scanReady}
              className={`h-8 px-3 rounded-lg font-black inline-flex items-center gap-1.5 ${
                scanReady
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  : 'bg-amber-100 text-amber-800 border border-amber-300'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{scanReady ? 'تأیید کف و شروع طراحی' : 'در حال تشخیص خودکار کف...'}</span>
            </button>
          )}

          {floorLocked && (
            <button
              type="button"
              onClick={() => {
                floorScannerRef.current.reset();
                anchorsRef.current = [];
                setFloorLocked(false);
                setScanReady(false);
              }}
              className="h-8 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold inline-flex items-center gap-1"
            >
              <LockOpen className="w-3.5 h-3.5" />
              <span>اسکن مجدد کف</span>
            </button>
          )}

          <button
            type="button"
            data-testid="ar-toggle-reticle-btn"
            onClick={() => setReticleEnabled((v) => !v)}
            aria-pressed={reticleEnabled}
            className={`h-8 px-2.5 rounded-lg border font-bold inline-flex items-center gap-1 ${
              reticleEnabled
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                : 'bg-white border-slate-300 text-slate-700'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>نشانگر</span>
          </button>

          <button
            type="button"
            data-testid="ar-toggle-doors-btn"
            onClick={() => {
              const nextOpen = !doorsOpen;
              const built = builtSceneRef.current;
              if (nextOpen && (!built || built.animatedDoors.length === 0)) {
                onToast('برای باز شدن درب‌ها ابتدا روی آن‌ها دستگیره قرار دهید');
                return;
              }
              setDoorsOpen(nextOpen);
              if (built) {
                for (const h of built.animatedDoors) {
                  const prev = doorStatesRef.current.get(h.doorId);
                  doorStatesRef.current.set(h.doorId, {
                    cur: prev?.cur ?? 0,
                    target: nextOpen ? 1 : 0,
                  });
                }
                renderOnceRef.current();
              }
            }}
            className="h-8 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold inline-flex items-center gap-1"
          >
            {doorsOpen ? <DoorOpen className="w-3.5 h-3.5 text-indigo-600" /> : <DoorClosed className="w-3.5 h-3.5" />}
            <span>{doorsOpen ? 'بستن درب‌ها' : 'بازکردن درب‌ها'}</span>
          </button>

          {xrActive && (
            <button
              type="button"
              onClick={() => setOcclusionEnabled((v) => !v)}
              title={OCCLUSION_STATUS_LABEL[occlusionStatus]}
              className={`h-8 px-2.5 rounded-lg border text-[13px] font-bold ${
                occlusionEnabled
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                  : 'bg-white border-slate-300 text-slate-600'
              }`}
            >
              {occlusionEnabled ? 'نمایش دست: روشن' : 'نمایش دست: خاموش'}
            </button>
          )}

          <button
            type="button"
            onClick={() => onSwitchViewMode('2d')}
            className="h-8 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold inline-flex items-center gap-1"
            title="انتقال مستقیم به 2D بدون بستن سشن AR"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>ادامه در 2D</span>
          </button>
        </div>

        {/* Collapsible A/B Scale & Orientation Calibration Box */}
        <div className="pointer-events-auto bg-white/95 border border-slate-200 rounded-xl shadow-md p-2.5 text-[13px] space-y-2 max-w-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-black text-slate-900 inline-flex items-center gap-1">
              <Ruler className="w-3.5 h-3.5 text-emerald-600" />
              <span>کالیبراسیون مرجع A / B</span>
            </span>
            <button
              type="button"
              onClick={() => setShowCalibPanel((v) => !v)}
              className="text-[13px] font-bold text-indigo-600 hover:underline"
            >
              {showCalibPanel ? 'بستن' : 'بازکردن'}
            </button>
          </div>

          {showCalibPanel && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setArTool('calibrate-a')}
                  aria-pressed={arTool === 'calibrate-a'}
                  className={`h-8 rounded-lg border font-bold inline-flex items-center justify-center gap-1 ${
                    arTool === 'calibrate-a'
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-slate-50 border-slate-300 text-slate-700'
                  }`}
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>جابجایی A</span>
                </button>
                <button
                  type="button"
                  onClick={() => setArTool('calibrate-b')}
                  aria-pressed={arTool === 'calibrate-b'}
                  className={`h-8 rounded-lg border font-bold inline-flex items-center justify-center gap-1 ${
                    arTool === 'calibrate-b'
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'bg-slate-50 border-slate-300 text-slate-700'
                  }`}
                >
                  <Crosshair className="w-3.5 h-3.5" />
                  <span>چرخش و مقیاس B</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <label className="text-[13px] font-bold text-slate-600 whitespace-nowrap" htmlFor="ar-real-dist">
                  فاصله A-B (cm):
                </label>
                <input
                  id="ar-real-dist"
                  type="number"
                  min={20}
                  max={2000}
                  value={realDistanceInput}
                  onChange={(e) => setRealDistanceInput(e.target.value)}
                  className="w-20 h-8 px-2 border border-slate-300 rounded-md font-bold tabular-nums text-center"
                />
                <button
                  type="button"
                  onClick={handleApplyRealDistance}
                  aria-label="اعمال مقیاس A-B"
                  className="h-8 px-2.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-bold inline-flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>مقیاس</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAlignment({ x: 0, z: 0, yaw: 0, scale: 1 });
                    setPointA({ x: -1.2, z: -0.9 });
                    setPointB({ x: 1.2, z: -0.9 });
                    setRealDistanceInput('240');
                    onToast('کالیبراسیون A/B ریست شد');
                  }}
                  aria-label="ریست کالیبراسیون"
                  title="ریست مقیاس و زاویه"
                  className="h-8 w-8 rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-slate-600 inline-flex items-center justify-center"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="text-[13px] text-slate-500">
                فاصله فعلی صحنه: <b className="tabular-nums">{abDistanceCm} cm</b> • نقطه A یا B و باکس‌ها قابل کشیدن هستند
              </div>
            </div>
          )}
        </div>
      </div>
        </>
      )}

      {/* Confirm (تأیید) and Cancel (لغو) floating AR editing actions */}
      {(arTool !== 'select' || pendingWallStart || (xrActive && !floorLocked)) && (
        <div className="absolute bottom-[118px] left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-white/95 border border-slate-200 rounded-xl shadow-lg px-2.5 py-1.5">
          <button
            type="button"
            data-testid="ar-confirm-btn"
            onClick={handleConfirmAction}
            className="h-9 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-black inline-flex items-center gap-1.5 transition active:scale-95"
          >
            <Check className="w-4 h-4" />
            <span>تأیید</span>
          </button>
          <button
            type="button"
            data-testid="ar-cancel-btn"
            onClick={handleCancelAction}
            className="h-9 px-3.5 rounded-lg border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[13px] font-black inline-flex items-center gap-1.5 transition active:scale-95"
          >
            <X className="w-4 h-4" />
            <span>لغو</span>
          </button>
        </div>
      )}

      {/* Only standalone legacy AR owns its toolbar; unified 3D uses BottomDock. */}
      {!embeddedIn3D && (
        <>
      {/* Two-level AR tool dock */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 max-w-[96vw] z-20 bg-white/95 border border-slate-200 rounded-xl shadow-lg px-2 py-1.5 flex flex-col items-stretch gap-1.5">
        {([
          [
            { id: 'wall', label: 'دیوار', icon: BrickWall },
            { id: 'cab-base', label: 'زمینی', icon: RectangleHorizontal },
            { id: 'cab-wall', label: 'هوایی', icon: RectangleHorizontal },
            { id: 'cab-tall', label: 'قدی', icon: RectangleHorizontal },
            { id: 'fridge', label: 'یخچال', icon: Refrigerator },
          ],
          [
            { id: 'select', label: 'انتخاب / جابجایی', icon: MousePointer2 },
            { id: 'sink', label: 'سینک', icon: Droplets },
            { id: 'gas', label: 'گاز', icon: Flame },
            { id: 'appliance', label: 'تجهیزات', icon: WashingMachine },
            { id: 'opening', label: 'بازشو / ستون', icon: AppWindow },
            { id: 'doors', label: 'درب', icon: DoorClosed },
            { id: 'handle', label: 'دستگیره', icon: GripHorizontal },
            { id: 'shelf', label: 'طبقه', icon: PanelTop },
            { id: 'frame', label: 'فریم', icon: Frame },
          ],
        ] as const).map((items, idx) => (
          <div
            key={idx}
            className="flex items-center justify-start gap-1.5 overflow-x-auto no-scrollbar w-full border-b last:border-b-0 border-slate-200 pb-1 last:pb-0"
          >
            {items.map((item) => {
              const Icon = item.icon;
              const isAct = arTool === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`ar-tool-${item.id}`}
                  onClick={() => {
                    setArTool(item.id);
                    if (item.id !== 'wall') setPendingWallStart(null);
                  }}
                  aria-pressed={isAct}
                  className={`h-11 px-2.5 rounded-lg border text-[13px] font-bold inline-flex items-center justify-center gap-1 whitespace-nowrap shrink-0 transition ${
                    isAct
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

        </>
      )}

      {/* Strictly image-only CursorToolPreview persisting across ALL active placement/edit tools */}
      {cursorPreview && (
        <CursorToolPreview
          visible={true}
          clientX={cursorPreview.x}
          clientY={cursorPreview.y}
          tool={previewToolId}
          drawBoxKind={previewBoxKind}
          targetStatus={cursorPreview.status}
          sinkModel={sinkModel}
          gasWidth={gasWidth}
          hoodKind={hoodKind}
          applianceKind={applianceKind}
          fridgeModel={fridgeModel}
          openingKind={openingKind}
          doorOrient="vertical"
          doorTargetWidth={60}
          doorVertCount={1}
          drawerPatIdx={1}
          liftPatIdx={0}
          doorStyleBrush="flat"
          cabinetFinishBrush="warm-white"
          backsplashBrush="calacatta-marble"
          countertopBrush="dark-quartz"
          frameWidthCm={5}
          shelfCount={1}
          handleStyle={handleStyle}
          handleOrient={handleOrient}
          testId="cursor-preview-ar"
        />
      )}
    </section>
  );
};
