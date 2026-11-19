import { createKitchenReflections } from '../cad/kitchenReflections';
import { findFrontCut } from '../cad/frontCut';
import type { FloorFurnitureKind } from '../cad/types';
import { HANDLE_STYLES } from '../cad/handleGeometry';
import { NumberPadDialog } from './NumberPadDialog';
import { DoorTapSequence } from '../utils/doorTapSequence';
import { previewCabinetRow, continueCabinetRow, startCabinetRow, type CabinetRowDraft } from '../cad/cabinetPlacement';
import { AimTap, aimCenter, calibrationPinsAtView } from '../ar/centerAim';
import { snapArWallEndpointsCm } from '../ar/arCalibration';
import { logDiagnostic } from '../utils/diagnostics';
import { hasWallSegment, snapWallDrawingPoint } from '../cad/wallSnap';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildDiningFootprint3D } from '../cad/dining3d';
import { snapDiningPosition } from '../cad/diningLayout';
import type { DiningSeats } from '../cad/types';
import { addKitchenLighting, configureKitchenRenderer } from '../cad/kitchenLighting';
import { loadKitchenEnvironment } from '../cad/kitchenEnvironment';
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
  Move,
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
import { FloorConfirmation } from '../ar/floorConfirmation';
import { SurfaceCursor, createSurfaceCursorMarker, updateSurfaceCursorMarker } from '../utils/surfaceCursor';
import { ChidoFloorTracking } from '../ar/chidoFloorTracking';
import { AnchorSample, AnchorStabilizer, ChidoVec3, transformPoint as chidoTransformPoint } from '../ar/chidoAnchorRig';
import { CHIDO_REFERENCE_SPACE, requestChidoSession, xrLaunchError } from '../ar/chidoSession';
import { chidoScanReadiness } from '../ar/chidoScanReadiness';
import {
  NearRealOcclusion,
  OCCLUSION_STATUS_LABEL,
  OcclusionStatus,
} from '../ar/nearOcclusion';
import {
  APPLIANCE_CONFIGS,
  BACKSPLASH_FINISHES,
  BACKSPLASH_FINISH_ORDER,
  BOX_PRESETS,
  CABINET_FINISHES,
  CABINET_FINISH_ORDER,
  COUNTERTOP_FINISHES,
  COUNTERTOP_FINISH_ORDER,
  DEFAULT_PROJECT_SETTINGS,
  DOOR_STYLE_META,
  DOOR_STYLE_ORDER,
  DRAWER_PATTERNS,
  FRAME_WIDTH_OPTIONS,
  FRIDGE_FRAME_CM,
  FRIDGE_MODELS,
  FRIDGE_MODEL_ORDER,
  GAS_WIDTH_OPTIONS,
  HARDWARE_KIND_META,
  HARDWARE_KIND_ORDER,
  LIFT_PATTERNS,
  OPENING_DEFAULTS,
  SINK_MODELS,
  SINK_MODEL_ORDER,
} from '../cad/constants';

const CAB_DRAW_KIND_ORDER: BoxKind[] = ['base', 'wall', 'wall-deep', 'tall', 'closet'];
const HANDLE_STYLE_ORDER = HANDLE_STYLES.map(style => style.id);
const APPLIANCE_ORDER: ApplianceKind[] = ['dishwasher', 'washing'];
const OPENING_ORDER: OpeningKind[] = ['window', 'door', 'column'];
import {
  getCornerBlockedZonesForWall,
  getWallVectors,
  SweepSegment,
} from '../cad/cornerLogic';
import {
  addShelvesWithMinGap,
  addVerticalDividerWithCenterSnap,
  applyDoorBrushPreview,
  applyHandlesToBoxDoors,
  autoUnitizeBoxForHandles,
  computeDoorBrushPreview,
  deleteApplianceHierarchically,
  deleteBoxHierarchically,
  eraseDoorWithRule,
  getBoxSideExposure,
  getMaxVerticalDoorCount,
  getUnitsInBox,
  placeFrameOnBox,
  removeUnitDividerWithSync,
} from '../cad/doorRules';
import { applyHandleAtSpot, canPlaceHandleInBay } from '../cad/handleSpots';
import { createWallOpening } from '../cad/openingRules';
import { CursorTargetStatus, CursorToolPreview } from './CursorToolPreview';
import { PacedGestureStepper } from '../utils/gesturePacing';
import { wideViewVerticalFov, WideViewMode } from '../ar/wideView';
import {
  applyAnimatedDoorProgress,
  attachHandleCandidateSpots,
  attachSelectedHandlePreviews,
  buildHandleMesh,
  buildKitchen3DScene,
  kitchenGeometryKey,
  BuiltKitchenScene,
  CM,
  detectSoftwareWebGL,
  disposeObject3D,
  HandleSpotOverlaySet,
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
  HandleStyle,
  HardwareKind,
  MultiSelection,
  OpeningKind,
  Orientation,
  ProjectState,
  SelectionMode,
  SinkModel,
  ToolId,
} from '../cad/types';

export type ArToolId =
  | 'select'
  | 'move'
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
  | 'dining'
  | 'opening'
  | 'doors'
  | 'front-cut'
  | 'hardware'
  | 'door-style'
  | 'finish'
  | 'handle'
  | 'pencil'
  | 'skeleton'
  | 'shelf'
  | 'frame'
  | 'eraser';

function isArDetailTool(t: ArToolId): boolean {
  return (
    t === 'doors' ||
    t === 'front-cut' ||
    t === 'hardware' ||
    t === 'door-style' ||
    t === 'finish' ||
    t === 'handle' ||
    t === 'pencil' ||
    t === 'skeleton' ||
    t === 'shelf' ||
    t === 'frame' ||
    t === 'eraser'
  );
}

interface ARWorkspaceProps {
  hdrRotationDegrees?: number;
  diningSeats: DiningSeats;
  furnitureKind: FloorFurnitureKind;
  frontCutOrient: Orientation;
  onFrontCutOrient: (orientation: Orientation) => void;
  onFrontCut: (wallId: string, boxId: string, x: number, y: number) => void;
  diningRotation: number;
  onPlaceDining: (x: number, y: number) => void;
  onSelectDining: (id: string | null) => void;
  onDeleteDining: (id: string) => void;
  active: boolean;
  overlayRootRef: React.RefObject<HTMLDivElement | null>;
  project: ProjectState;
  selectionMode?: SelectionMode;
  fridgeModel: FridgeModel;
  sinkModel: SinkModel;
  gasWidth: number;
  applianceKind: ApplianceKind;
  hoodKind: 'hidden' | 'chimney';
  openingKind: OpeningKind;
  doorOrient?: Orientation;
  doorTargetWidth?: number;
  doorVertCount?: number;
  drawerPatIdx?: number;
  liftPatIdx?: number;
  doorStyleBrush?: DoorStyle;
  hardwareBrush?: HardwareKind;
  cabinetFinishBrush?: CabinetFinishId;
  backsplashBrush?: BacksplashFinishId;
  countertopBrush?: CountertopFinishId;
  shelfOrient?: Orientation;
  shelfCount?: number;
  frameWidthCm?: number;
  handleStyle?: HandleStyle;
  handleOrient?: Orientation;
  drawBoxKind?: BoxKind;
  onSelectDrawBoxKind?: (kind: BoxKind) => void;
  onSetDoorOrient?: (o: Orientation) => void;
  onSetDoorVertCount?: (c: number) => void;
  onSetDrawerPatIdx?: (i: number) => void;
  onSetLiftPatIdx?: (i: number) => void;
  onSetDoorStyleBrush?: (s: DoorStyle) => void;
  onSetHardwareBrush?: (h: HardwareKind) => void;
  onSetCabinetFinishBrush?: (f: CabinetFinishId) => void;
  onSetBacksplashBrush?: (f: BacksplashFinishId) => void;
  onSetCountertopBrush?: (f: CountertopFinishId) => void;
  onSetShelfOrient?: (o: Orientation) => void;
  onSetShelfCount?: (c: number) => void;
  onSetFrameWidthCm?: (w: number) => void;
  onApplyDoorStyle?: (boxId: string | null, doorIds: string[] | null, style: DoorStyle) => void;
  onApplyHardwareKind?: (boxId: string | null, doorIds: string[] | null, hardware: HardwareKind) => void;
  onApplyFinish?: (
    target: 'box' | 'all-cabinets' | 'backsplash' | 'countertop',
    wallId?: string,
    boxId?: string,
    overrideId?: string,
    doorId?: string,
  ) => void;
  onHandleStyleChange?: (style: HandleStyle) => void;
  onHandleOrientChange?: (orient: Orientation) => void;
  onPlaceFridge: (wallId: string, offsetX: number) => void;
  onPlaceAppliance: (wallId: string, boxId: string, offsetX: number, kind: ApplianceKind) => void;
  onFridgeModelChange?: (model: FridgeModel) => void;
  onSinkModelChange?: (model: SinkModel) => void;
  onGasWidthChange?: (w: number) => void;
  onApplianceKindChange?: (k: ApplianceKind) => void;
  onOpeningKindChange?: (k: OpeningKind) => void;
  onMoveBox?: (wallId: string, boxId: string, desiredOffsetX: number, commit: boolean, sessionId?: string) => void;
  onMoveAppliance?: (wallId: string, appId: string, desiredOffsetX: number, commit: boolean, sessionId?: string) => void;
  onMoveOpening?: (wallId: string, openingId: string, offsetX: number, commit: boolean) => void;
  onDeleteOpening?: (wallId: string, openingId: string) => void;
  onCreateBoxesFromSweep: (
    segments: SweepSegment[],
    kind: BoxKind,
    suggestedOwners?: Record<string, string>,
    flipOverrides?: Record<string, 1 | -1>
  ) => boolean;
  onConfirmHiddenHandle?: (onConfirm: () => void) => void;
  onMoveShelf: (wallId: string, boxId: string, shelfId: string, dx: number, dy: number, commit: boolean) => void;
  onResizeCabinet: (wallId: string, boxId: string, side: 'left' | 'right' | 'top' | 'bottom', dxCm: number, dyCm: number, commit: boolean) => void;
  onBeginDrag: () => void;
  onCancelDrag: () => void;
  onFinishDrag: () => void;
  onUpdateProject: (updater: (prev: ProjectState) => ProjectState, toastMsg?: string, pushHistory?: boolean) => void;
  dialogOpen?: boolean;
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
  | { kind: 'move-shelf'; wallId: string; boxId: string; shelfId: string; startX: number; startY: number; dx: number; dy: number; moved: boolean }
  | { kind: 'resize-box'; wallId: string; boxId: string; side: 'left' | 'right' | 'top' | 'bottom';
      startX: number; startY: number; dx: number; dy: number; moved: boolean }
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
    }
  | {
      kind: 'move-opening';
      wallId: string;
      openingId: string;
      origX: number;
      startDot: number;
      lastTargetX: number;
      moved: boolean;
    };

// Chido's central viewer ray plus eight rotated peripheral rays.

const MAX_SCAN_CROSSES = 20;

/** Pending ARCore and hit-test promises cannot stall the scan indefinitely. */
async function withXRStartupTimeout<T>(promise: Promise<T>, stage: string, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`مهلت راه‌اندازی ${stage} تمام شد؛ اسکن را دوباره شروع کنید`);
          error.name = 'TimeoutError';
          reject(error);
        }, ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

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

// Direct geometry/shader port of Chido Studio.floorNet (2026-11-16).
// The grid is a 6m square with 24 cells; radius/pulse are expanded on confirm.
function createFloorNetMesh(): {
  mesh: THREE.Mesh;
  uniforms: {
    uTime: { value: number };
    uCenter: { value: THREE.Vector2 };
    uOpacity: { value: number };
    uReveal: { value: number };
    uPulse: { value: number };
  };
} {
  const uniforms = {
    uTime: { value: 0 },
    uCenter: { value: new THREE.Vector2() },
    uOpacity: { value: 0.85 },
    uReveal: { value: 0.65 },
    uPulse: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `varying vec2 gridUv;
      void main() {
        gridUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }`,
    fragmentShader: `precision highp float;
      varying vec2 gridUv;
      uniform float uOpacity;
      uniform float uReveal;
      uniform float uPulse;
      void main() {
        vec2 cells = gridUv * 24.0;
        vec2 dx = max(fwidth(cells), vec2(0.0001));
        vec2 line = abs(fract(cells + 0.5) - 0.5) / dx;
        float px = min(line.x, line.y);
        float core = 1.0 - smoothstep(0.7, 1.65, px);
        float glow = 1.0 - smoothstep(1.2, 5.2, px);
        float radius = length((gridUv - 0.5) * 6.0);
        float edge = 1.0 - smoothstep(uReveal - 0.06, uReveal + 0.06, radius);
        float rim = (1.0 - smoothstep(0.025, 0.11, abs(radius - uReveal))) *
          (1.0 - step(2.95, uReveal));
        float alpha = clamp((0.72 * core + 0.32 * glow) * uOpacity * edge +
          rim * 0.65 * uPulse, 0.0, 0.95);
        gl_FragColor = vec4(
          mix(vec3(0.20,0.57,0.52), vec3(0.55,0.97,0.83), max(core,rim)), alpha);
      }`,
  });
  const geometry = new THREE.PlaneGeometry(6, 6);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.004;
  mesh.visible = false;
  return {mesh, uniforms};
}

// Chido Studio.scanCrosses: 32mm crossed line segments, not filled quads.
function createCrossMarker(): THREE.Group {
  const group = new THREE.Group();
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.016, 0, -0.016),
    new THREE.Vector3(0.016, 0, 0.016),
    new THREE.Vector3(-0.016, 0, 0.016),
    new THREE.Vector3(0.016, 0, -0.016),
  ]);
  const material = new THREE.LineBasicMaterial({
    color: 0x83ffe3, transparent: true, opacity: 0.94, depthTest: false,
  });
  const cross = new THREE.LineSegments(geometry, material);
  cross.renderOrder = 10;
  group.add(cross);
  group.userData.mat = material;
  group.visible = false;
  return group;
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
  hdrRotationDegrees = 0,
  active,
  overlayRootRef,
  project,
  selectionMode = 'single',
  fridgeModel,
  sinkModel,
  gasWidth,
  applianceKind,
  hoodKind,
  openingKind,
  doorOrient = 'vertical',
  doorTargetWidth = 60,
  doorVertCount = 1,
  drawerPatIdx = 1,
  liftPatIdx = 0,
  doorStyleBrush = 'flat',
  hardwareBrush = 'hinged',
  cabinetFinishBrush = 'cashmere',
  backsplashBrush = 'calacatta-marble',
  countertopBrush = 'dark-quartz',
  shelfOrient = 'horizontal',
  shelfCount = 1,
  frameWidthCm = 5,
  handleStyle = 'simple',
  handleOrient = 'vertical',
  drawBoxKind = 'base',
  onSelectDrawBoxKind,
  onSetDoorOrient,
  onSetDoorVertCount,
  onSetDrawerPatIdx,
  onSetLiftPatIdx,
  onSetDoorStyleBrush,
  onSetHardwareBrush,
  onSetCabinetFinishBrush,
  onSetBacksplashBrush,
  onSetCountertopBrush,
  onSetShelfOrient,
  onSetShelfCount,
  onSetFrameWidthCm,
  onApplyDoorStyle,
  onApplyHardwareKind,
  onApplyFinish,
  onHandleStyleChange,
  onHandleOrientChange,
  onPlaceFridge,
  onPlaceAppliance,
  onFridgeModelChange,
  onSinkModelChange,
  onGasWidthChange,
  onApplianceKindChange,
  onOpeningKindChange,
  onMoveBox,
  onMoveAppliance,
  onMoveOpening,
  onDeleteOpening,
  onCreateBoxesFromSweep,
  onConfirmHiddenHandle,
  onUpdateProject,
  onBeginDrag,
  onResizeCabinet,
  onMoveShelf,
  onCancelDrag,
  onFinishDrag,
  onSwitchViewMode,
  onToast,
  sessionKillSignal = 0,
  initialSession = null,
  embeddedIn3D = false,
  sharedTool,
  onSessionEnded,
  dialogOpen = false,
  diningSeats, diningRotation, furnitureKind, frontCutOrient, onFrontCutOrient, onFrontCut, onPlaceDining, onSelectDining, onDeleteDining,
  onFloorConfirmed,
  wideViewModeExternal,
  onWideViewModeChange,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // API presence only: an async support probe is not permission to start AR.
  // Report the real requestSession result and keep explicit retry available.
  const [xrSupported] = useState(() => Boolean(
    (navigator as Navigator & { xr?: XRSystem }).xr?.requestSession
  ));
  const [xrActive, setXrActive] = useState(false);
  const [floorLocked, setFloorLocked] = useState(false);
  const [scanReady, setScanReady] = useState(false);
  const [xrStarting, setXrStarting] = useState(false);
  const startupPendingRef = useRef(false);
  const [xrStartError, setXrStartError] = useState<string | null>(null);
  const [scanDiagnostics, setScanDiagnostics] = useState({
    tracking: false,
    rawHits: 0,
    validHits: 0,
  });
  const lastScanReportMsRef = useRef(0);
  const [occlusionEnabled, setOcclusionEnabled] = useState(true);
  const [occlusionStatus, setOcclusionStatus] = useState<OcclusionStatus>('idle');
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [kitchenHidden, setKitchenHidden] = useState(false);
  const [scaleConfirmed, setScaleConfirmed] = useState(false);
  const rescanOriginRef = useRef<{ x: number; z: number; yaw: number } | null>(null);
  const hideKitchen = kitchenHidden || ((xrActive || embeddedIn3D) && (!floorLocked || !scaleConfirmed));
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
  const [cursorPreview, setCursorPreview] = useState<{
    x: number;
    y: number;
    status: CursorTargetStatus;
    sweepWidthCm?: number;
    previewDoorWidths?: number[];
  } | null>(null);
  const lastPreviewTouchRef = useRef(0);
  const lastHoverCoordsRef = useRef<{ x: number; y: number } | null>(null);

  const propsRef = useRef({
    diningSeats, diningRotation, furnitureKind, frontCutOrient, onFrontCutOrient, onFrontCut, onPlaceDining, onSelectDining, onDeleteDining,
    onUpdateProject,
    onBeginDrag,
    onResizeCabinet,
    onMoveShelf,
    onCancelDrag,
    onFinishDrag,
    selectionMode,
    fridgeModel,
    sinkModel,
    gasWidth,
    applianceKind,
    hoodKind,
    openingKind,
    doorOrient,
    doorTargetWidth,
    doorVertCount,
    drawerPatIdx,
    liftPatIdx,
    doorStyleBrush,
    hardwareBrush,
    cabinetFinishBrush,
    backsplashBrush,
    countertopBrush,
    shelfOrient,
    shelfCount,
    frameWidthCm,
    handleStyle,
    handleOrient,
    drawBoxKind,
    onSelectDrawBoxKind,
    onSetDoorOrient,
    onSetDoorVertCount,
    onSetDrawerPatIdx,
    onSetLiftPatIdx,
    onSetDoorStyleBrush,
    onSetHardwareBrush,
    onSetCabinetFinishBrush,
    onSetBacksplashBrush,
    onSetCountertopBrush,
    onSetShelfOrient,
    onSetShelfCount,
    onSetFrameWidthCm,
    onApplyDoorStyle,
    onApplyHardwareKind,
    onApplyFinish,
    onHandleStyleChange,
    onHandleOrientChange,
    onPlaceFridge,
    onPlaceAppliance,
    onFridgeModelChange,
    onSinkModelChange,
    onGasWidthChange,
    onApplianceKindChange,
    onOpeningKindChange,
    onMoveBox,
    onMoveAppliance,
    onMoveOpening,
    onDeleteOpening,
    onCreateBoxesFromSweep,
    onConfirmHiddenHandle,
  });
  propsRef.current = {
    diningSeats, diningRotation, furnitureKind, frontCutOrient, onFrontCutOrient, onFrontCut, onPlaceDining, onSelectDining, onDeleteDining,
    onUpdateProject,
    onBeginDrag,
    onResizeCabinet,
    onMoveShelf,
    onCancelDrag,
    onFinishDrag,
    selectionMode,
    fridgeModel,
    sinkModel,
    gasWidth,
    applianceKind,
    hoodKind,
    openingKind,
    doorOrient,
    doorTargetWidth,
    doorVertCount,
    drawerPatIdx,
    liftPatIdx,
    doorStyleBrush,
    hardwareBrush,
    cabinetFinishBrush,
    backsplashBrush,
    countertopBrush,
    shelfOrient,
    shelfCount,
    frameWidthCm,
    handleStyle,
    handleOrient,
    drawBoxKind,
    onSelectDrawBoxKind,
    onSetDoorOrient,
    onSetDoorVertCount,
    onSetDrawerPatIdx,
    onSetLiftPatIdx,
    onSetDoorStyleBrush,
    onSetHardwareBrush,
    onSetCabinetFinishBrush,
    onSetBacksplashBrush,
    onSetCountertopBrush,
    onSetShelfOrient,
    onSetShelfCount,
    onSetFrameWidthCm,
    onApplyDoorStyle,
    onApplyHardwareKind,
    onApplyFinish,
    onHandleStyleChange,
    onHandleOrientChange,
    onPlaceFridge,
    onPlaceAppliance,
    onFridgeModelChange,
    onSinkModelChange,
    onGasWidthChange,
    onApplianceKindChange,
    onOpeningKindChange,
    onMoveBox,
    onMoveAppliance,
    onMoveOpening,
    onDeleteOpening,
    onCreateBoxesFromSweep,
    onConfirmHiddenHandle,
  };

  const detailedPickAtClientRef = useRef<
    (x: number, y: number) => { data: Scene3DHitData; point: THREE.Vector3 } | null
  >(() => null);
  const floorPointAtClientRef = useRef<(x: number, y: number) => THREE.Vector3 | null>(() => null);
  const updateArGhostRef = useRef<
    (
      local: THREE.Vector3,
      clientX?: number,
      clientY?: number
    ) => { status: CursorTargetStatus; sweepWidthCm?: number; previewDoorWidths?: number[] }
  >(() => ({ status: 'neutral' }));
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
  const [showCalibPanel, setShowCalibPanel] = useState(false);
  const [showScaleDialog, setShowScaleDialog] = useState(false);
  const [aimStatus, setAimStatus] = useState<CursorTargetStatus>('neutral');
  const aimTapRef = useRef(new AimTap());
  const updateAimSurfaceRef = useRef<(x:number,y:number)=>void>(()=>{});
  const placementPointAtClientRef = useRef<(x: number, y: number) => THREE.Vector3 | null>(() => null);

  const activeRef = useRef(active);
  const dialogOpenRef = useRef(false);
  dialogOpenRef.current = dialogOpen || showScaleDialog;
  activeRef.current = active;
  const projectRef = useRef(project);
  projectRef.current = project;
  const arToolRef = useRef(arTool);
  arToolRef.current = arTool;
  // The tool selection comes from the same 3D SideInspector and BottomDock — with full 2D/3D parity!
  useEffect(() => {
    if (!embeddedIn3D || !sharedTool) return;
    if (sharedTool !== 'wall') setPendingWallStart(null);
    setPendingCabSweep(pending => pending && sharedTool === 'cab-draw' && pending.kind === drawBoxKind ? pending : null);
    if (sharedTool === 'select' || sharedTool === 'move') {
      surfaceCursorRef.current.clear();
      setSurfaceCursorActive(false);
    }
    const mapped: ArToolId =
      sharedTool === 'cab-draw'
        ? drawBoxKind === 'wall' || drawBoxKind === 'wall-deep'
          ? 'cab-wall'
          : drawBoxKind === 'tall' || drawBoxKind === 'closet'
          ? 'cab-tall'
          : 'cab-base'
        : sharedTool;
    setArTool(mapped);
  }, [embeddedIn3D, sharedTool, drawBoxKind]);
  const [pendingCabSweep, setPendingCabSweep] = useState<CabinetRowDraft | null>(null);
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
  const reticleEnabledRef = useRef(reticleEnabled);
  reticleEnabledRef.current = reticleEnabled;

  const xrSessionRef = useRef<XRSession | null>(null);
  const skipEndNotificationRef = useRef(false);
  const floorScannerRef = useRef(new FloorScanner());
  const floorConfirmationRef = useRef(new FloorConfirmation());
  const surfaceCursorRef = useRef(new SurfaceCursor());
  const surfaceMarkerRef = useRef<THREE.Group | null>(null);
  const [surfaceCursorActive, setSurfaceCursorActive] = useState(false);
  const confirmActionRef = useRef<() => void>(()=>{});
  const floorTrackingRef = useRef(new ChidoFloorTracking(floorScannerRef.current));
  const fallbackLocalSpaceRef = useRef<XRReferenceSpace | null>(null);
  const xrFrameCountRef = useRef(0);
  const xrStartTimeRef = useRef(0);
  const xrLastFrameTimeRef = useRef(0);
  const xrLastPoseTimeRef = useRef(0);
  const xrTrackingWarningRef = useRef(false);

  const anchorStabilizerRef = useRef(new AnchorStabilizer());
  const anchorsRef = useRef<StoredAnchorEntry[]>([]);
  const anchorCandidatesRef = useRef<THREE.Vector3[]>([]);
  const anchorPendingRef = useRef(false);
  const anchorGenerationRef = useRef(0);
  const anchorLastTimeRef = useRef(0);
  const pendingAnchorCreateRef = useRef(false);
  const floorRevealStartRef = useRef<number | null>(null);
  const basePoseRef = useRef<{ x: number; y: number; z: number; yaw: number } | null>(null);


  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  // Chido Wide View: virtual scene uses XR tracking, but a separate perspective
  // from the physical camera; no OrbitControls are enabled during a live scan.
  const trackedWideReflectionsRef = useRef<ReturnType<typeof createKitchenReflections> | null>(null);
  const trackedWideRendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const trackedWideEnvironmentRef = useRef<THREE.Texture | null>(null);
  const diningGhostRef = useRef<THREE.Group | null>(null);
  const trackedWideCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const lightingRef = useRef<ReturnType<typeof addKitchenLighting> | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const floorGroupRef = useRef<THREE.Group | null>(null);
  const kitchenMountRef = useRef<THREE.Group | null>(null);
  const floorNetUniformsRef = useRef<ReturnType<typeof createFloorNetMesh>['uniforms'] | null>(null);
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
  const arGeometryKeyRef = useRef<string | null>(null);
  const arViewKeyRef = useRef<string | null>(null);
  const handleSpotsRef = useRef<HandleSpotOverlaySet | null>(null);
  const sweepGhostGroupRef = useRef<THREE.Group | null>(null);
  const doorStatesRef = useRef<Map<string, { cur: number; target: number }>>(new Map());
  const renderOnceRef = useRef<() => void>(() => {});
  const arDragRef = useRef<ArDragState | null>(null);
  const dragPointerIdRef = useRef<number | null>(null);
  const dragAlignmentRef = useRef(alignment);
  const dragDownClientRef = useRef<{ x: number; y: number } | null>(null);
  const gestureStepperRef = useRef(new PacedGestureStepper());

  // Latest action callbacks stored in refs so native DOM listeners always invoke fresh state
  const applyFloorActionRef = useRef<(pt: THREE.Vector3, clientX?: number, clientY?: number) => void>(() => {});
  const handleArDetailActionRef = useRef<(x: number, y: number) => void>(() => {});

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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSoftware ? 1 : 1.25));
    renderer.setSize(width, height);
    configureKitchenRenderer(renderer, isSoftware);
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
    const lighting = addKitchenLighting(scene, renderer, () => renderOnceRef.current());
    lightingRef.current = lighting;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.04, 50);
    camera.position.set(2.4, 2.2, 3.6);
    cameraRef.current = camera;
    let reflections: ReturnType<typeof createKitchenReflections> | null = null;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0.75, -0.5);
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 0.9;
    controls.maxDistance = 14;
    controlsRef.current = controls;

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
    kitchenMount.visible = !embeddedIn3D;
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
    const diningGhost = new THREE.Group();
    diningGhost.visible = false;
    floorGroup.add(diningGhost);
    diningGhostRef.current = diningGhost;
    let lastFurnitureKey = '';

    const handleGhostGroup = new THREE.Group();
    handleGhostGroup.renderOrder = 14;
    floorGroup.add(handleGhostGroup);
    handleGhostGroupRef.current = handleGhostGroup;

    const sweepGhostGroup = new THREE.Group();
    sweepGhostGroup.renderOrder = 9;
    floorGroup.add(sweepGhostGroup);
    sweepGhostGroupRef.current = sweepGhostGroup;

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

    const surfaceMarker = createSurfaceCursorMarker();
    scene.add(surfaceMarker);
    surfaceMarkerRef.current=surfaceMarker;
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
      updateSurfaceCursorMarker(surfaceMarker,surfaceCursorRef.current);
      builtSceneRef.current?.syncOcclusion?.();
      lighting.setIntensities(projectRef.current.settings);
      lighting.followCamera(camera);
      if (projectRef.current.settings?.enableReflections === false) renderer.render(scene, camera);
      else {
        if (!reflections) reflections = createKitchenReflections(renderer, scene, camera);
        reflections.render();
      }
      if (rafId === null && (doorsMoving || ctrlChanged)) {
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
      if(trackedWideCameraRef.current && wideViewModeRef.current !== 'normal')return trackedWideCameraRef.current;
      if (!xrSessionRef.current) return camera;
      const xrCamera = renderer.xr.getCamera();
      return xrCamera.cameras[0] || xrCamera;
    };
    const getPointerRay = (clientX: number, clientY: number) => {
      raycaster.setFromCamera(pointerNdc(clientX, clientY), pickingCamera());
      return raycaster.ray;
    };

    detailedPickAtClientRef.current = (clientX, clientY) => {
      if (!builtSceneRef.current || !kitchenMount.visible) return null;
      builtSceneRef.current.root.updateWorldMatrix(true, true);
      getPointerRay(clientX, clientY);
      if (
        arToolRef.current === 'handle' &&
        handleSpotsRef.current &&
        handleSpotsRef.current.spotInteractables.length > 0
      ) {
        const spotHits = raycaster.intersectObjects(handleSpotsRef.current.spotInteractables, false);
        for (const hit of spotHits) {
          let obj: THREE.Object3D | null = hit.object;
          while (obj) {
            const data = obj.userData as Scene3DHitData | undefined;
            if (data?.kind && (data.wallId || data.kind === 'dining')) return { data, point: hit.point.clone() };
            obj = obj.parent;
          }
        }
      }
      const hits = raycaster.intersectObjects(builtSceneRef.current.interactables, false);
      for (const hit of hits) {
        let obj: THREE.Object3D | null = hit.object;
        while (obj) {
          const data = obj.userData as Scene3DHitData | undefined;
          if (data?.kind && (data.wallId || data.kind === 'dining')) return { data, point: hit.point.clone() };
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

    updateAimSurfaceRef.current = (x, y) => {
      getPointerRay(x, y);
      const built = builtSceneRef.current;
      const hit = kitchenMount.visible && arToolRef.current !== 'wall' && built ? raycaster.intersectObjects(built.interactables, false)[0] : null;
      if (hit) {
        const normal = hit.face ? hit.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld)).normalize() : new THREE.Vector3(0,1,0);
        surfaceCursorRef.current.pin(hit.point, normal);
      } else {
        const local = floorPointAtClientRef.current(x,y);
        if (local && floorGroupRef.current) surfaceCursorRef.current.pin(floorGroupRef.current.localToWorld(local.clone()));
        else surfaceCursorRef.current.clear();
      }
    };
    placementPointAtClientRef.current = (x, y) => {
      if (arToolRef.current !== 'wall' && arToolRef.current !== 'dining' && !arToolRef.current.startsWith('calibrate-')) {
        const hit = detailedPickAtClientRef.current(x, y);
        const group = floorGroupRef.current;
        if (hit && group) {
          const local = group.worldToLocal(hit.point.clone()); local.y = 0; return local;
        }
      }
      return floorPointAtClientRef.current(x, y);
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
      if (hGrp) {
        while (hGrp.children.length > 0) {
          const ch = hGrp.children[0];
          hGrp.remove(ch);
          disposeObject3D(ch);
        }
      }
      const swGrp = sweepGhostGroupRef.current;
      if (swGrp) {
        while (swGrp.children.length > 0) {
          const ch = swGrp.children[0];
          swGrp.remove(ch);
          disposeObject3D(ch);
        }
      }
    };

    updateArGhostRef.current = (localPt: THREE.Vector3, clientX?: number, clientY?: number) => {
      const wallGhost = wallGhostRef.current;
      const placement = placementGhostRef.current;
      if (!wallGhost || !placement) return { status: 'neutral' };
      wallGhost.visible = false;
      placement.visible = false;
      diningGhost.visible = false;
      clearHandleGhost();

      const tool = arToolRef.current;
      if (tool !== 'handle') handleSpotsRef.current?.setHoveredSpot(null);
      if (!kitchenMount.visible || tool === 'select' || tool === 'move' || tool.startsWith('calibrate-')) return { status: 'neutral' };

      const al = alignmentRef.current;
      const c = Math.cos(al.yaw);
      const sn = Math.sin(al.yaw);

      if (tool === 'wall') {
        const start = pendingWallStartRef.current;
        if (!start) return { status: 'neutral' };
        const modelEnd = floorLocalToModelXZ(localPt);
        const snapped = snapArWallEndpointsCm(start, modelEnd, projectRef.current.walls);
        const endX = snapped.x2Cm / 100, endZ = snapped.y2Cm / 100;
        const sx = al.x + al.scale * (start.x * c + start.z * sn);
        const sz = al.z + al.scale * (-start.x * sn + start.z * c);
        const dx = al.x + al.scale * (endX * c + endZ * sn) - sx;
        const dz = al.z + al.scale * (-endX * sn + endZ * c) - sz;
        const len = Math.hypot(dx, dz);
        if (len < 0.03) return { status: 'invalid' };
        const h = (projectRef.current.settings?.wallHeightCm || DEFAULT_PROJECT_SETTINGS.wallHeightCm) / 100;
        wallGhost.position.set(sx + dx / 2, (h * al.scale) / 2, sz + dz / 2);
        wallGhost.rotation.y = -Math.atan2(dz, dx);
        wallGhost.scale.set(len, h * al.scale, 0.1 * al.scale);
        wallGhost.visible = true;
        return { status: len >= 0.4 * al.scale ? 'valid' : 'invalid' };
      }

      const choices = propsRef.current;
      if (tool === 'dining') {
        const furnitureKey = choices.furnitureKind + ':' + choices.diningSeats;
        if (lastFurnitureKey !== furnitureKey) {
          for (const child of [...diningGhost.children]) {
            diningGhost.remove(child);
            disposeObject3D(child);
          }
          diningGhost.add(buildDiningFootprint3D(choices.diningSeats, choices.furnitureKind));
          lastFurnitureKey = furnitureKey;
        }
        const model = floorLocalToModelXZ(localPt);
        const { xCm, yCm } = snapDiningPosition(model.x * 100, model.z * 100);
        diningGhost.position.set(al.x + al.scale * (xCm * c + yCm * sn) / 100, 0,
          al.z + al.scale * (-xCm * sn + yCm * c) / 100);
        diningGhost.rotation.y = al.yaw - choices.diningRotation * Math.PI / 180;
        diningGhost.scale.setScalar(al.scale);
        diningGhost.visible = true;
        return { status: 'valid' };
      }

      // Cabinet-front & eraser/finish detail tools raycast cabinet/scene meshes directly
      if (isArDetailTool(tool) && clientX !== undefined && clientY !== undefined) {
        const picked = detailedPickAtClientRef.current(clientX, clientY);
        const mount = kitchenMountRef.current;
        const built = builtSceneRef.current;
        if (tool === 'handle') {
          handleSpotsRef.current?.setHoveredSpot(picked?.data.kind === 'handle-spot' ? picked.data.spotId || null : null);
        }
        if (!picked) return { status: 'invalid' };
        if (tool === 'eraser') return { status: 'valid' };
        if (tool === 'finish') {
          if (picked.data.kind === 'countertop' || picked.data.kind === 'backsplash' || picked.data.boxId) {
            return { status: 'valid' };
          }
          return { status: 'invalid' };
        }
        if (!picked.data.boxId || !mount || !built) return { status: 'invalid' };
        const wall = projectRef.current.walls.find((x) => x.id === picked.data.wallId);
        const box = wall?.boxes.find((b) => b.id === picked.data.boxId);
        const tr = built.wallTransforms.get(picked.data.wallId);
        if (!wall || !box || !tr || box.type === 'fridge') return { status: 'invalid' };

        mount.updateWorldMatrix(true, true);
        const modelPt = mount.worldToLocal(picked.point.clone());
        const rel = modelPt.clone().sub(tr.origin);
        const hitXCm = rel.dot(tr.tangent) * 100;
        const hitYCm = modelPt.y * 100;
        const localX = Math.max(0, Math.min(box.width, hitXCm - box.offsetX));
        const v = getWallVectors(wall);

        if (tool === 'front-cut') {
          const zones = getCornerBlockedZonesForWall(wall, projectRef.current.walls, projectRef.current.cornerOwners);
          const cut = findFrontCut(wall, box, choices.frontCutOrient, hitXCm, hitYCm, zones);
          if (!cut) return { status: 'invalid' };
          const vertical = cut.orientation === 'vertical';
          const x = vertical ? cut.at : (cut.x1 + cut.x2) / 2;
          const y = vertical ? (cut.y1 + cut.y2) / 2 : cut.at;
          const p = mount.localToWorld(tr.origin.clone().addScaledVector(tr.tangent, x / 100)
            .addScaledVector(tr.normal, (box.depth + 2) / 100).setY(y / 100));
          placement.position.copy(floorGroup.worldToLocal(p));
          placement.rotation.y = -Math.atan2(v.ty, v.tx) + al.yaw;
          placement.scale.set((vertical ? 0.005 : (cut.x2 - cut.x1) / 100) * al.scale,
            (vertical ? (cut.y2 - cut.y1) / 100 : 0.005) * al.scale, 0.012 * al.scale);
          placement.visible = true;
          return { status: 'valid' };
        }

        if (tool === 'handle') {
          const door =
            (picked.data.doorId ? box.doors.find((d) => d.id === picked.data.doorId) : undefined) ||
            box.doors.find((d) => localX >= d.startCm - 0.5 && localX <= d.startCm + d.widthCm + 0.5);
          if (!door || door.kind === 'fridge') return { status: 'invalid' };

          const innerBot = box.elevY + box.plinth;
          const innerH = Math.max(10, box.height - box.plinth - box.countertopCm);
          let rowCenterNorm = 0.5;
          let rowH = innerH;
          let xRatio = 0.5;

          if (picked.data.kind === 'handle-spot' && picked.data.xRatio !== undefined && picked.data.yRatio !== undefined) {
            if ((door.kind === 'drawer' || door.kind === 'lift') && door.drawerRatios.length > 0) {
              const pts = [0, ...door.drawerRatios, 1];
              const ri = Math.max(0, Math.min(pts.length - 2, picked.data.rowIndex ?? 0));
              rowH = (pts[ri + 1] - pts[ri]) * innerH;
              rowCenterNorm = pts[ri] + picked.data.yRatio * (pts[ri + 1] - pts[ri]);
            } else {
              rowCenterNorm = picked.data.yRatio;
            }
            xRatio = picked.data.xRatio;
          } else {
            const normY = Math.max(0, Math.min(1, 1 - (hitYCm - innerBot) / innerH));
            if ((door.kind === 'drawer' || door.kind === 'lift') && door.drawerRatios.length > 0) {
              const pts = [0, ...door.drawerRatios, 1];
              for (let ri = 0; ri < pts.length - 1; ri++) {
                if (normY >= pts[ri] && normY <= pts[ri + 1]) {
                  rowCenterNorm = (pts[ri] + pts[ri + 1]) / 2;
                  rowH = (pts[ri + 1] - pts[ri]) * innerH;
                  break;
                }
              }
            } else if (door.kind === 'door' && door.hardwareKind !== 'pantry-pullout') {
              rowCenterNorm = box.type === 'wall' || box.type === 'wall-deep' ? 0.82 : 0.18;
            }
            if (door.kind === 'door' && door.hardwareKind !== 'pantry-pullout') {
              xRatio = localX >= door.startCm + door.widthCm / 2 ? 0.86 : 0.14;
            }
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
          return { status: 'valid' };
        }

        if (tool === 'doors') {
          const zones = getCornerBlockedZonesForWall(wall, projectRef.current.walls, projectRef.current.cornerOwners);
          const prev = computeDoorBrushPreview(
            box,
            localX,
            choices.doorOrient,
            choices.doorVertCount,
            choices.drawerPatIdx,
            choices.liftPatIdx,
            zones,
            choices.doorTargetWidth
          );
          if (!prev.ok) return { status: 'invalid' };
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
          return {
            status: 'valid',
            previewDoorWidths: prev.items.map((it) => Math.round(it.widthCm)),
          };
        }

        return { status: 'valid' };
      }

      const dx = (localPt.x - al.x) / al.scale;
      const dz = (localPt.z - al.z) / al.scale;
      const modelX = dx * c - dz * sn;
      const modelZ = dx * sn + dz * c;
      const pendingSweep = pendingCabSweepRef.current;
      // Allow multi-wall sweeps across corners when drawing boxes!
      const extend = tool === 'fridge' || tool === 'cab-base' || tool === 'cab-wall' || tool === 'cab-tall';
      const result = projectArPointOntoWalls({ x: modelX, z: modelZ }, projectRef.current.walls, extend);
      if (!result) return { status: 'invalid' };
      const w = result.wall;
      const v = getWallVectors(w);
      let width = 0;
      let height = 0;
      let depth = 0;
      let elev = 0;
      let forwardOffsetCm = 0;
      let startX = result.offsetCm;

      if (tool === 'cab-base' || tool === 'cab-wall' || tool === 'cab-tall') {
        const toolKind = tool === 'cab-base' ? 'base'
          : tool === 'cab-wall' ? (choices.drawBoxKind === 'wall-deep' ? 'wall-deep' : 'wall')
          : (choices.drawBoxKind === 'closet' ? 'closet' : 'tall');
        const kind = pendingSweep?.kind ?? toolKind;
        const cfg = BOX_PRESETS[kind] || BOX_PRESETS.base;
        const boxH =
          kind === 'base'
            ? projectRef.current.settings?.baseHeightCm ?? cfg.height
            : kind === 'wall'
            ? projectRef.current.settings?.wallCabHeightCm ?? cfg.height
            : cfg.height;
        const boxElev =
          kind === 'wall' ? projectRef.current.settings?.wallCabElevCm ?? cfg.elevY : cfg.elevY;

        const row = pendingSweep ? previewCabinetRow(projectRef.current, pendingSweep, w.id, result.offsetCm) : null;
        const draft = pendingSweep ?? startCabinetRow(projectRef.current, w, result.offsetCm, kind);
        if (!draft) return { status: 'invalid' };
        const segments = row?.segments ?? [draft.starter];
        const totalW = segments.reduce((sum, seg) => sum + seg.widthCm, 0);
        const swGrp = sweepGhostGroupRef.current;
        if (swGrp && segments.length) {
          const ghostMat = new THREE.MeshBasicMaterial({
            color: row?.valid === false ? 0xdc2626 : 0x4f46e5,
            transparent: true,
            opacity: 0.34,
            depthWrite: false,
          });
          for (const seg of segments) {
            const sw = projectRef.current.walls.find((x) => x.id === seg.wallId);
            if (!sw) continue;
            const sv = getWallVectors(sw);
            const segM = new THREE.Mesh(
              new THREE.BoxGeometry(seg.widthCm * CM, boxH * CM, cfg.depth * CM),
              ghostMat
            );
            const cx = seg.startCm + seg.widthCm / 2;
            const px = (sw.x1Cm + cx * sv.tx + (cfg.depth / 2) * sv.nx) / 100;
            const pz = (sw.y1Cm + cx * sv.ty + (cfg.depth / 2) * sv.ny) / 100;
            segM.position.set(
              al.x + al.scale * (px * c + pz * sn),
              (boxElev + boxH / 2) * CM * al.scale,
              al.z + al.scale * (-px * sn + pz * c)
            );
            segM.rotation.y = -Math.atan2(sv.ty, sv.tx) + al.yaw;
            segM.scale.setScalar(al.scale);
            swGrp.add(segM);
          }
        }
        return { status: row?.valid === false ? 'invalid' : 'valid', sweepWidthCm: totalW };
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
        if (!baseBox) return { status: 'invalid' };
        const kind = tool === 'sink' ? 'sink' : tool === 'gas' ? 'gas' : choices.applianceKind;
        width = tool === 'gas' ? choices.gasWidth : tool === 'sink' ? SINK_MODELS[choices.sinkModel].width : APPLIANCE_CONFIGS[kind].width;
        startX = Math.max(baseBox.offsetX, Math.min(baseBox.offsetX + baseBox.width - width, startX - width / 2));
        if (tool === 'gas' || tool === 'sink') {
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
        forwardOffsetCm = -6;
        startX = Math.max(0, Math.min(w.length - width, startX - width / 2));
      } else {
        return { status: 'neutral' };
      }
      if (width <= 0 || w.length < width) return { status: 'invalid' };

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
      return { status: 'valid', sweepWidthCm: width > 0 ? Math.round(width) : undefined };
    };

    const doorTap = new DoorTapSequence();
    let doorPress: { pointerId: number; x: number; y: number; partId: string } | null = null;

    const handleDoorRelease = (e: PointerEvent) => {
      if (doorPress?.pointerId !== e.pointerId) return;
      const press = doorPress;
      doorPress = null;
      if (!kitchenMount.visible || arToolRef.current !== 'select' || e.button !== 0 ||
          Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) return doorTap.reset();
      const picked = detailedPickAtClientRef.current(e.clientX, e.clientY)?.data;
      const partId = picked?.animationId || picked?.doorId;
      if (partId !== press.partId || (picked?.kind !== 'door' && picked?.kind !== 'handle')) return doorTap.reset();
      const state = doorStatesRef.current.get(partId) ?? { cur: 0, target: 0 };
      const target = doorTap.next(partId, state.target > 0.5, e.pointerType, e.timeStamp, e.clientX, e.clientY);
      if (target === null) return;
      if (!builtSceneRef.current?.animatedDoors.some(part => part.doorId === partId)) {
        onToast('ابتدا روی همین در یا کشو دستگیره بگذارید');
        return;
      }
      doorStatesRef.current.set(partId, { cur: state.cur, target });
      setDoorsOpen([...doorStatesRef.current.values()].some(part => part.target > 0.5));
      requestPreviewRender();
    };

    const dom = renderer.domElement;
    dom.style.setProperty('-webkit-touch-callout', 'none');
    const suppressContextMenu = (event: MouseEvent) => event.preventDefault();
    dom.addEventListener('contextmenu', suppressContextMenu);

    // Native capture-phase pointerdown intercepts A/B handles & base/wall/tall cabinets BEFORE OrbitControls!

    const pinSurfaceCursor = (clientX:number,clientY:number) => {
      getPointerRay(clientX,clientY);
      builtSceneRef.current?.root.updateWorldMatrix(true,true);
      const hit=builtSceneRef.current ? raycaster.intersectObjects(builtSceneRef.current.interactables,false)[0] : null;
      if(hit) {
        const normal=hit.face?.normal.clone().transformDirection(hit.object.matrixWorld)||new THREE.Vector3(0,1,0);
        if(normal.dot(raycaster.ray.direction)>0)normal.negate();
        surfaceCursorRef.current.pin(hit.point,normal);
      } else {
        const floor=floorPointAtClientRef.current(clientX,clientY);
        if(!floor||!floorGroupRef.current)return;
        surfaceCursorRef.current.pin(floorGroupRef.current.localToWorld(floor.clone()));
      }
      setSurfaceCursorActive(true);
      updateSurfaceCursorMarker(surfaceMarker,surfaceCursorRef.current);
      const floor=floorPointAtClientRef.current(clientX,clientY);
      const ghostRes=floor?updateArGhostRef.current(floor,clientX,clientY):{status:'invalid' as const};
      lastHoverCoordsRef.current={x:clientX,y:clientY};
      setCursorPreview({x:clientX,y:clientY,status:ghostRes.status,sweepWidthCm:ghostRes.sweepWidthCm,previewDoorWidths:ghostRes.previewDoorWidths});
      requestPreviewRender();
    };
    const cursorScreen = (x:number,y:number)=>xrSessionRef.current ? aimCenter(dom.getBoundingClientRect()) : surfaceCursorRef.current.screen(pickingCamera(),dom)||{x,y};

    const onPointerDownCapture = (e: PointerEvent) => {
      if (e.button !== 0 || !activeRef.current || arDragRef.current || dialogOpenRef.current) return;
      if (xrSessionRef.current && !floorLockedRef.current) {
        onToast('اسکن کف هنوز در حال تثبیت است');
        return;
      }

      doorPress = null;
      const toolNow = arToolRef.current;
      dragDownClientRef.current = { x: e.clientX, y: e.clientY };

      // 1) Direct A/B calibration handle grab (works in select AND calibrate-a/calibrate-b!)
      const calibHandle = pickCalibrationHandleRef.current(e.clientX, e.clientY);
      if (calibHandle && (!xrSessionRef.current || floorLockedRef.current)) {
        const floorPt = floorPointAtClientRef.current(e.clientX, e.clientY);
        if (floorPt) {
          e.stopPropagation();
          controls.enabled = false;
          try { dom.setPointerCapture(e.pointerId); } catch {}
          propsRef.current.onBeginDrag();
          dragPointerIdRef.current = e.pointerId;
          dragAlignmentRef.current = { ...alignmentRef.current };
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

      if (!kitchenMount.visible && !toolNow.startsWith('calibrate-')) return;
      if (toolNow === 'finish') { e.stopImmediatePropagation(); return; }
      if (xrSessionRef.current && toolNow !== 'select' && toolNow !== 'move' && !toolNow.startsWith('calibrate-')) {
        e.preventDefault(); e.stopImmediatePropagation(); controls.enabled = false;
        aimTapRef.current.begin(e.pointerId, e.clientX, e.clientY);
        try { dom.setPointerCapture(e.pointerId); } catch {}
        return;
      }
      // Only activate placement surface cursor on non-select, non-calibrate tools
      if(!xrSessionRef.current && e.pointerType==='touch' && toolNow !== 'select' && toolNow !== 'move' && !toolNow.startsWith('calibrate-')) {
        e.preventDefault();e.stopImmediatePropagation();controls.enabled=false;
        if (!surfaceCursorRef.current.begin(e.pointerId, e.clientX, e.clientY)) return;
        if (!surfaceCursorRef.current.point) pinSurfaceCursor(e.clientX, e.clientY);
        try{dom.setPointerCapture(e.pointerId);}catch{}
        return;
      }

      if (toolNow === 'select' || toolNow === 'move') {
        const picked = detailedPickAtClientRef.current(e.clientX, e.clientY);
        if (picked?.data.kind === 'dining' && picked.data.diningId) {
          propsRef.current.onSelectDining(picked.data.diningId);
          doorTap.reset();
          e.stopImmediatePropagation();
          return;
        }
        if (projectRef.current.selectedDiningId) propsRef.current.onSelectDining(null);
        const partId = picked?.data.animationId || picked?.data.doorId;
        if (partId && (picked?.data.kind === 'door' || picked?.data.kind === 'handle') &&
            (propsRef.current.selectionMode ?? 'single') === 'single') {
          doorPress = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, partId };
        } else doorTap.reset();
        if (picked) {
          const data = picked.data;
          if (toolNow === 'move' && data.kind === 'box-handle' && data.boxId && data.handleSide) {
            const point = projectArPointerOntoWallRef.current(data.wallId, e.clientX, e.clientY);
            if (!point) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            controls.enabled = false;
            try { dom.setPointerCapture(e.pointerId); } catch {}
            propsRef.current.onBeginDrag();
            dragPointerIdRef.current = e.pointerId;
            arDragRef.current = {
              kind: 'resize-box', wallId: data.wallId, boxId: data.boxId, side: data.handleSide,
              startX: point.xCm, startY: point.yCm, dx: 0, dy: 0, moved: false,
            };
            return;
          }
          const selMode = propsRef.current.selectionMode || 'single';
          if (selMode !== 'single' && data.boxId) {
            propsRef.current.onUpdateProject((prevProject) => {
              const curMs: MultiSelection = prevProject.multiSelection
                ? {
                    boxIds: [...prevProject.multiSelection.boxIds],
                    doorIds: [...prevProject.multiSelection.doorIds],
                    openingIds: [...prevProject.multiSelection.openingIds],
                    applianceIds: [...prevProject.multiSelection.applianceIds],
                  }
                : { boxIds: [], doorIds: [], openingIds: [], applianceIds: [] };
              const targetArr = data.doorId ? curMs.doorIds : curMs.boxIds;
              const targetId = data.doorId || data.boxId!;
              if (selMode === 'add') {
                if (!targetArr.includes(targetId)) targetArr.push(targetId);
              } else {
                const idx = targetArr.indexOf(targetId);
                if (idx !== -1) targetArr.splice(idx, 1);
              }
              const total = curMs.boxIds.length + curMs.doorIds.length + curMs.openingIds.length + curMs.applianceIds.length;
              return {
                ...prevProject,
                activeWallId: data.wallId,
                activeBoxId: data.boxId || null,
                selectedDoorId: selMode === 'subtract' ? null : (data.doorId || null),
                multiSelection: total > 0 ? curMs : undefined,
              };
            }, undefined, false);
            return;
          }

          propsRef.current.onUpdateProject((prevProject) => ({
            ...prevProject,
            activeWallId: data.wallId,
            activeBoxId: data.boxId || null,
            selectedDoorId: data.kind === 'door' ? (data.doorId || null) : null,
            selectedApplianceId: data.appId || null,
            selectedOpeningId: data.openingId || null,
            selectedUnit: data.kind === 'unit' && data.boxId && data.unitStart !== undefined && data.unitEnd !== undefined
              ? { boxId: data.boxId, startCm: data.unitStart, endCm: data.unitEnd }
              : null,
            selectedUnitDivider: data.kind === 'unit-div' && data.boxId && data.seamCm !== undefined
              ? { boxId: data.boxId, seamCm: data.seamCm }
              : null,
            selectedFrameId: data.kind === 'frame' ? (data.frameId || null) : null,
            selectedShelfId: data.kind === 'shelf' ? (data.shelfId || null) : null,
            selectedHandleId: data.kind === 'handle' ? (data.handleId || null) : null,
            multiSelection: undefined,
          }), undefined, false);

          if (toolNow !== 'move') return;
          const wall = projectRef.current.walls.find((x) => x.id === data.wallId);
          if (wall && data.kind === 'shelf' && data.boxId && data.shelfId) {
            const point = projectArPointerOntoWallRef.current(wall.id, e.clientX, e.clientY);
            if (point) {
              e.stopPropagation();
              controls.enabled = false;
              try { dom.setPointerCapture(e.pointerId); } catch {}
              propsRef.current.onBeginDrag();
              dragPointerIdRef.current = e.pointerId;
              arDragRef.current = { kind: 'move-shelf', wallId: wall.id, boxId: data.boxId, shelfId: data.shelfId,
                startX: point.xCm, startY: point.yCm, dx: 0, dy: 0, moved: false };
            }
            return;
          }
          if (wall && data.openingId) {
            const op = wall.openings?.find((o) => o.id === data.openingId);
            const proj = projectArPointerOntoWallRef.current(data.wallId, e.clientX, e.clientY);
            if (op && proj) {
              e.stopPropagation();
              controls.enabled = false;
              try { dom.setPointerCapture(e.pointerId); } catch {}
              propsRef.current.onBeginDrag();
              dragPointerIdRef.current = e.pointerId;
              arDragRef.current = {
                kind: 'move-opening',
                wallId: data.wallId,
                openingId: op.id,
                origX: op.offsetX,
                startDot: proj.xCm,
                lastTargetX: op.offsetX,
                moved: false,
              };
              return;
            }
          }

          if (wall && data.appId) {
            const app = wall.appliances.find((a) => a.id === data.appId);
            const proj = projectArPointerOntoWallRef.current(data.wallId, e.clientX, e.clientY);
            if (app && proj) {
              e.stopPropagation();
              controls.enabled = false;
              try { dom.setPointerCapture(e.pointerId); } catch {}
              propsRef.current.onBeginDrag();
              dragPointerIdRef.current = e.pointerId;
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
              propsRef.current.onBeginDrag();
              dragPointerIdRef.current = e.pointerId;
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

      if (isArDetailTool(toolNow)) {
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
      if (arDragRef.current && e.pointerId !== dragPointerIdRef.current) return;
      if (xrSessionRef.current && !arDragRef.current) { aimTapRef.current.move(e.pointerId, e.clientX, e.clientY); return; }
      if(e.pointerType==='touch' && surfaceCursorRef.current.dragging) {
        if(surfaceCursorRef.current.moving(e.pointerId,e.clientX,e.clientY))pinSurfaceCursor(e.clientX,e.clientY);
        return;
      }
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
            alignmentRef.current = { x: sol.x, z: sol.z, yaw: sol.yaw, scale: sol.scale };
            setAlignment(alignmentRef.current);
            const distCm = Math.round(Math.hypot(b.x - a.x, b.z - a.z) * sol.scale * 100);
            setRealDistanceInput(String(distCm));
            requestPreviewRender();
          }
          return;
        }
        if (dr.kind === 'resize-box' || dr.kind === 'move-shelf') {
          const point = projectArPointerOntoWallRef.current(dr.wallId, e.clientX, e.clientY);
          if (!point) return;
          const dx = Math.round(point.xCm - dr.startX);
          const dy = Math.round(point.yCm - dr.startY);
          if (dx !== dr.dx || dy !== dr.dy) {
            dr.dx = dx;
            dr.dy = dy;
            dr.moved = true;
            if (dr.kind === 'resize-box') propsRef.current.onResizeCabinet(dr.wallId, dr.boxId, dr.side, dx, dy, false);
            else propsRef.current.onMoveShelf(dr.wallId, dr.boxId, dr.shelfId, dx, dy, false);
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
        if (dr.kind === 'move-opening') {
          const proj = projectArPointerOntoWallRef.current(dr.wallId, e.clientX, e.clientY);
          if (!proj) return;
          if (!dr.moved && movedPx < 5 && Math.abs(proj.xCm - dr.startDot) < 2.5) return;
          dr.moved = true;
          const dx = Math.round((proj.xCm - dr.startDot) / 5) * 5;
          const target = Math.max(0, dr.origX + dx);
          if (target !== dr.lastTargetX) {
            dr.lastTargetX = target;
            propsRef.current.onMoveOpening?.(dr.wallId, dr.openingId, target, false);
          }
          return;
        }
      }

      lastHoverCoordsRef.current = { x: e.clientX, y: e.clientY };
      const toolNow = arToolRef.current;
      if (toolNow === 'select' || toolNow === 'move' || toolNow.startsWith('calibrate-')) {
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
      const ghostRes = updateArGhostRef.current(floor, e.clientX, e.clientY);
      setCursorPreview({ x: e.clientX, y: e.clientY, status: ghostRes.status, sweepWidthCm: ghostRes.sweepWidthCm, previewDoorWidths: ghostRes.previewDoorWidths });
      renderOnceRef.current();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (arDragRef.current && e.pointerId !== dragPointerIdRef.current) return;
      if(!activeRef.current)return;
      if (arToolRef.current === 'finish') {
        const press = dragDownClientRef.current;
        dragDownClientRef.current = null;
        if (kitchenMount.visible && press && Math.hypot(e.clientX - press.x, e.clientY - press.y) <= 8)
          handleArDetailActionRef.current(e.clientX, e.clientY);
        return;
      }
      if (xrSessionRef.current && !arDragRef.current && arToolRef.current !== 'select' && arToolRef.current !== 'move' && !arToolRef.current.startsWith('calibrate-')) {
        const confirm = aimTapRef.current.end(e.pointerId);
        try { if (dom.hasPointerCapture(e.pointerId)) dom.releasePointerCapture(e.pointerId); } catch {}
        if (confirm) confirmActionRef.current();
        return;
      }
      if(!arDragRef.current && e.pointerType==='touch' && arToolRef.current !== 'select' && arToolRef.current !== 'move' && !arToolRef.current.startsWith('calibrate-')) {
        if (surfaceCursorRef.current.end(e.pointerId) && surfaceCursorRef.current.point) confirmActionRef.current();
        return;
      }
      const dr = arDragRef.current;
      arDragRef.current = null;
      dragPointerIdRef.current = null;
      dragDownClientRef.current = null;
      if (!xrSessionRef.current) controls.enabled = true;
      try {
        if (dom.hasPointerCapture(e.pointerId)) dom.releasePointerCapture(e.pointerId);
      } catch {}

      if (!dr || (dr.kind === 'move-box' && !dr.moved)) handleDoorRelease(e);
      else { doorPress = null; doorTap.reset(); }
      if (dr?.kind === 'move-shelf' && dr.moved) {
        propsRef.current.onMoveShelf(dr.wallId, dr.boxId, dr.shelfId, dr.dx, dr.dy, true);
      } else if (dr?.kind === 'resize-box' && dr.moved) {
        propsRef.current.onResizeCabinet(dr.wallId, dr.boxId, dr.side, dr.dx, dr.dy, true);
      } else if (dr?.kind === 'move-box' && dr.moved && dr.lastTargetX !== dr.origX) {
        propsRef.current.onMoveBox?.(dr.wallId, dr.boxId, dr.lastTargetX, true, dr.sessionId);
      } else if (dr?.kind === 'move-app' && dr.moved && dr.lastTargetX !== dr.origX) {
        propsRef.current.onMoveAppliance?.(dr.wallId, dr.appId, dr.lastTargetX, true, dr.sessionId);
      } else if (dr?.kind === 'move-opening' && dr.moved && dr.lastTargetX !== dr.origX) {
        propsRef.current.onMoveOpening?.(dr.wallId, dr.openingId, dr.lastTargetX, true);
      } else if (dr?.kind === 'drag-b' && dr.moved) {
        setShowScaleDialog(true);
        setShowCalibPanel(true);
        const a = pointARef.current;
        const b = pointBRef.current;
        const distCm = Math.round(Math.hypot(b.x - a.x, b.z - a.z) * alignmentRef.current.scale * 100);
        propsRef.current.onUpdateProject((prev) => ({
          ...prev,
          arCalibration: { a, b, realDistanceCm: distCm },
        }));
      }
      if (dr) propsRef.current.onFinishDrag();
    };

    // Two-finger vertical drag anywhere in AR cycles models cleanly
    const stepToolOption = (dir: 1 | -1) => {
      const cur = propsRef.current;
      const toolNow = arToolRef.current;
      if (toolNow === 'handle') {
        const idx = Math.max(0, HANDLE_STYLE_ORDER.indexOf(cur.handleStyle));
        const nxt = HANDLE_STYLE_ORDER[(idx + (dir > 0 ? 1 : HANDLE_STYLE_ORDER.length - 1)) % HANDLE_STYLE_ORDER.length];
        cur.onHandleStyleChange?.(nxt);
        onToast(`دستگیره: ${HANDLE_STYLES.find(style => style.id === nxt)?.label}`);
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
      } else if (toolNow === 'doors') {
        if (cur.doorOrient === 'vertical') {
          const maxVert = getMaxVerticalDoorCount(280);
          cur.onSetDoorVertCount?.(Math.max(1, Math.min(maxVert, cur.doorVertCount + dir)));
        } else {
          cur.onSetDrawerPatIdx?.(
            (cur.drawerPatIdx + (dir > 0 ? 1 : DRAWER_PATTERNS.length - 1)) % DRAWER_PATTERNS.length
          );
        }
      } else if (toolNow === 'hardware') {
        const idx = Math.max(0, HARDWARE_KIND_ORDER.indexOf(cur.hardwareBrush));
        const nxt = HARDWARE_KIND_ORDER[(idx + (dir > 0 ? 1 : HARDWARE_KIND_ORDER.length - 1)) % HARDWARE_KIND_ORDER.length];
        cur.onSetHardwareBrush?.(nxt);
        onToast(`یراق: ${HARDWARE_KIND_META[nxt].label}`);
      } else if (toolNow === 'door-style') {
        const idx = Math.max(0, DOOR_STYLE_ORDER.indexOf(cur.doorStyleBrush));
        const nxt = DOOR_STYLE_ORDER[(idx + (dir > 0 ? 1 : DOOR_STYLE_ORDER.length - 1)) % DOOR_STYLE_ORDER.length];
        cur.onSetDoorStyleBrush?.(nxt);
        onToast(`مدل درب: ${DOOR_STYLE_META[nxt].label}`);
      } else if (toolNow === 'finish') {
        const idx = Math.max(0, CABINET_FINISH_ORDER.indexOf(cur.cabinetFinishBrush));
        const nxt = CABINET_FINISH_ORDER[(idx + (dir > 0 ? 1 : CABINET_FINISH_ORDER.length - 1)) % CABINET_FINISH_ORDER.length];
        cur.onSetCabinetFinishBrush?.(nxt);
        onToast(`رنگ کابینت: ${CABINET_FINISHES[nxt].label}`);
      } else if (toolNow === 'pencil' || toolNow === 'skeleton' || toolNow === 'shelf') {
        cur.onSetShelfCount?.(Math.max(1, Math.min(6, cur.shelfCount + dir)));
      } else if (toolNow === 'frame') {
        const idx = Math.max(0, FRAME_WIDTH_OPTIONS.indexOf(cur.frameWidthCm as (typeof FRAME_WIDTH_OPTIONS)[number]));
        const nextIdx = Math.max(0, Math.min(FRAME_WIDTH_OPTIONS.length - 1, idx + dir));
        cur.onSetFrameWidthCm?.(FRAME_WIDTH_OPTIONS[nextIdx]);
      } else if (toolNow === 'cab-base' || toolNow === 'cab-wall' || toolNow === 'cab-tall') {
        const idx = Math.max(0, CAB_DRAW_KIND_ORDER.indexOf(cur.drawBoxKind));
        const nxt = CAB_DRAW_KIND_ORDER[(idx + (dir > 0 ? 1 : CAB_DRAW_KIND_ORDER.length - 1)) % CAB_DRAW_KIND_ORDER.length];
        cur.onSelectDrawBoxKind?.(nxt);
        setArTool(nxt === 'wall' || nxt === 'wall-deep' ? 'cab-wall' : nxt === 'tall' || nxt === 'closet' ? 'cab-tall' : 'cab-base');
      }
    };

    let twoFingerMidY: number | null = null;
    const isArCyclableTool = (t: ArToolId): boolean =>
      t !== 'select' && t !== 'wall' && t !== 'eraser' && !t.startsWith('calibrate-');

    const updateTouchPreview = (midX: number, midY: number) => {
      const target=cursorScreen(midX,midY);
      midX=target.x;midY=target.y;
      lastHoverCoordsRef.current = { x: midX, y: midY };
      const floor = placementPointAtClientRef.current(midX, midY);
      const ghostRes = floor ? updateArGhostRef.current(floor, midX, midY) : { status: 'invalid' as const };
      setCursorPreview({ x: midX, y: midY, status: ghostRes.status, sweepWidthCm: ghostRes.sweepWidthCm, previewDoorWidths: ghostRes.previewDoorWidths });
      renderOnceRef.current();
    };

    const onTouchStart = (e: TouchEvent) => {
      if (arDragRef.current) return;
      if (e.touches.length === 2 && arToolRef.current !== 'select' && arToolRef.current !== 'move' && !arToolRef.current.startsWith('calibrate-')) {
        aimTapRef.current.cancel();
        surfaceCursorRef.current.cancelGesture();
        controls.enabled = false;
        gestureStepperRef.current.resetTouch();
        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        twoFingerMidY = midY;
        if(!xrSessionRef.current && !surfaceCursorRef.current.point)pinSurfaceCursor(midX,midY);
        updateTouchPreview(midX, midY);
      } else {
        twoFingerMidY = null;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (arDragRef.current) return;
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

    const onPlacementKey=(event:KeyboardEvent)=>{
      if (activeRef.current && !dialogOpenRef.current && event.key === 'Enter' && !event.repeat && !(event.target as HTMLElement)?.closest('input, textarea, select, button, [contenteditable=true]')) {
        event.preventDefault();confirmActionRef.current();
      }
    };
    window.addEventListener('keydown',onPlacementKey);
    dom.addEventListener('pointerdown', onPointerDownCapture, { capture: true });
    dom.addEventListener('wheel', onWheelCapture as EventListener, { passive: false, capture: true });
    dom.addEventListener('touchstart', onTouchStart, { passive: true });
    dom.addEventListener('touchmove', onTouchMove, { passive: false });
    dom.addEventListener('touchend', onTouchEnd);
    window.addEventListener('pointermove', onPointerMove);
    const onPointerCancel = (e: PointerEvent) => {
      if (arDragRef.current && e.pointerId !== dragPointerIdRef.current) return;
      if (doorPress?.pointerId === e.pointerId) { doorPress = null; doorTap.reset(); }
      aimTapRef.current.reset(e.pointerId);
      surfaceCursorRef.current.resetGesture(e.pointerId);
      const dr = arDragRef.current;
      arDragRef.current = null;
      dragPointerIdRef.current = null;
      dragDownClientRef.current = null;
      if (dr) {
        if (dr.kind === 'drag-a' || dr.kind === 'drag-b') {
          alignmentRef.current = { ...dragAlignmentRef.current };
          setAlignment(alignmentRef.current);
          const a = pointARef.current, b = pointBRef.current;
          setRealDistanceInput(String(Math.round(Math.hypot(b.x - a.x, b.z - a.z) * alignmentRef.current.scale * 100)));
        }
        propsRef.current.onCancelDrag();
      }
      if (!xrSessionRef.current) controls.enabled = true;
      try { if (dom.hasPointerCapture(e.pointerId)) dom.releasePointerCapture(e.pointerId); } catch {}
      requestPreviewRender();
    };
    window.addEventListener('pointercancel', onPointerCancel);
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
      dom.removeEventListener('contextmenu', suppressContextMenu);
      dom.removeEventListener('pointerdown', onPointerDownCapture, { capture: true });
      window.removeEventListener('keydown',onPlacementKey);
      disposeObject3D(surfaceMarker);
      surfaceMarkerRef.current=null;
      dom.removeEventListener('wheel', onWheelCapture as EventListener, { capture: true });
      dom.removeEventListener('touchstart', onTouchStart);
      dom.removeEventListener('touchmove', onTouchMove);
      dom.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('pointerup', onPointerUp);
      ro.disconnect();
      controls.dispose();
      floorTrackingRef.current.dispose();
      occlusion.dispose();
      if (xrSessionRef.current) {
        xrSessionRef.current.end().catch(() => {});
        xrSessionRef.current = null;
      }
      if (kitchenMountRef.current) disposeObject3D(kitchenMountRef.current);
      builtSceneRef.current = null;
      disposeObject3D(diningGhost);
      if (diningGhostRef.current === diningGhost) diningGhostRef.current = null;
      reflections?.dispose();
      lighting.dispose();
      if (lightingRef.current === lighting) lightingRef.current = null;
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.environmentRotation.y = THREE.MathUtils.degToRad(hdrRotationDegrees);
    renderOnceRef.current();
  }, [hdrRotationDegrees]);

  // Keep CursorToolPreview updated immediately on tool or option switch (even without moving mouse)
  useEffect(() => {
    if (!active || arTool === 'select' || arTool === 'move' || arTool.startsWith('calibrate-')) {
      setCursorPreview(null);
      return;
    }
    if (lastHoverCoordsRef.current) {
      const pt = lastHoverCoordsRef.current;
      const floor = floorPointAtClientRef.current(pt.x, pt.y);
      const ghostRes = floor ? updateArGhostRef.current(floor, pt.x, pt.y) : { status: 'invalid' as const };
      setCursorPreview({ x: pt.x, y: pt.y, status: ghostRes.status, sweepWidthCm: ghostRes.sweepWidthCm, previewDoorWidths: ghostRes.previewDoorWidths });
    }
  }, [active, arTool, fridgeModel, sinkModel, gasWidth, applianceKind, openingKind, handleStyle, handleOrient, doorOrient, doorVertCount, drawerPatIdx, liftPatIdx, hardwareBrush, doorStyleBrush, cabinetFinishBrush, frameWidthCm, shelfOrient, shelfCount, diningSeats, diningRotation, furnitureKind, frontCutOrient]);

  useEffect(() => {
    if (kitchenMountRef.current) kitchenMountRef.current.visible = !hideKitchen;
    if (hideKitchen) {
      if (diningGhostRef.current) diningGhostRef.current.visible = false;
      if (wallGhostRef.current) wallGhostRef.current.visible = false;
      if (placementGhostRef.current) placementGhostRef.current.visible = false;
      if (sweepGhostGroupRef.current) sweepGhostGroupRef.current.visible = false;
      if (handleGhostGroupRef.current) handleGhostGroupRef.current.visible = false;
      if (wallStartMarkerRef.current) wallStartMarkerRef.current.visible = false;
    } else {
      if (sweepGhostGroupRef.current) sweepGhostGroupRef.current.visible = true;
      if (handleGhostGroupRef.current) handleGhostGroupRef.current.visible = true;
      if (wallStartMarkerRef.current) wallStartMarkerRef.current.visible = Boolean(pendingWallStart);
    }
    renderOnceRef.current();
  }, [hideKitchen, pendingWallStart]);

  // Update 3D kitchen meshes inside AR floor group whenever project/alignment/doorsOpen updates
  useEffect(() => {
    const mount = kitchenMountRef.current;
    const floorGroup = floorGroupRef.current;
    if (!mount || !floorGroup) return;

    // A light-only change is applied directly, with no geometry, shader or AO rebuild.
    const geometryKey = kitchenGeometryKey(project) + '|' + (arTool === 'move' ? 'move' : 'select');
    const viewKey = JSON.stringify([alignment, pointA, pointB, pendingWallStart,
      xrActive, floorLocked, scaleConfirmed, active, reticleEnabled]);
    if (builtSceneRef.current && geometryKey === arGeometryKeyRef.current && viewKey === arViewKeyRef.current) {
      builtSceneRef.current.updateLighting(project, 3);
      renderOnceRef.current();
      return;
    }

    let built: BuiltKitchenScene;
    try {
      built = buildKitchen3DScene(project, { doorOpenProgress: 0, hideFloor: false, floorOpacity: 0.72,
        deferOcclusion: true, onTextureReady: () => renderOnceRef.current(),
        tool: arTool === 'move' ? 'move' : 'select' });
      built.updateLighting(project, 0);
    } catch (error) {
      logDiagnostic('ar-scene-build-failed', error);
      onToast('خطای نمایش ثبت شد؛ صحنه قبلی حفظ شد');
      return;
    }
    const oldChildren = [...mount.children];
    if (floorLocked) built.root.traverse(obj => {
      if (obj.userData.kind !== 'floor' || !(obj instanceof THREE.Mesh)) return;
      const pos = obj.geometry.getAttribute('position'), uv = obj.geometry.getAttribute('uv');
      if (!pos || !uv) return;
      const angle = Math.atan2(pointB.z - pointA.z, pointB.x - pointA.x), c = Math.cos(angle), sn = Math.sin(angle);
      for (let i = 0; i < pos.count; i++) { const x = pos.getX(i) - pointA.x, z = pos.getZ(i) - pointA.z; uv.setXY(i, x*c+z*sn, -x*sn+z*c); }
      uv.needsUpdate = true;
    });
    builtSceneRef.current = built;
    arGeometryKeyRef.current = geometryKey;
    arViewKeyRef.current = viewKey;

    const validIds = new Set(built.animatedDoors.map((d) => d.doorId));
    for (const k of Array.from(doorStatesRef.current.keys())) {
      if (!validIds.has(k)) doorStatesRef.current.delete(k);
    }
    setDoorsOpen([...doorStatesRef.current.values()].some(part => part.target > 0.5));
    const defaultTarget = 0;
    for (const h of built.animatedDoors) {
      let st = doorStatesRef.current.get(h.doorId);
      if (!st) {
        st = { cur: defaultTarget, target: defaultTarget };
        doorStatesRef.current.set(h.doorId, st);
      }
      if (st.cur > 0) applyAnimatedDoorProgress(h, st.cur);
    }

    mount.add(built.root);
    // Commit the new scene before releasing the previous one, avoiding a blank viewport.
    for (const old of oldChildren) { mount.remove(old); disposeObject3D(old); }
    mount.position.set(alignment.x, 0, alignment.z);
    mount.rotation.y = alignment.yaw;
    mount.scale.setScalar(alignment.scale);

    for (const obj of [pinARef.current, pinBRef.current, lineABRef.current, rulerTicksRef.current]) {
      if (obj) obj.visible = floorLocked && !scaleConfirmed;
    }
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
        wallStartMarkerRef.current.visible = mount.visible;
      } else {
        wallStartMarkerRef.current.visible = false;
      }
    }

    if (floorNetMeshRef.current && floorNetUniformsRef.current) {
      floorNetMeshRef.current.visible = xrActive &&
        (floorRevealStartRef.current !== null || (!floorLocked && Boolean(floorScannerRef.current.point)));
      floorNetUniformsRef.current.uOpacity.value = 0.85;
      const net = floorNetMeshRef.current;
      if (floorLocked) {
        const yaw = alignment.yaw - Math.atan2(pointB.z-pointA.z, pointB.x-pointA.x);
        net.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0), yaw).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), -Math.PI/2));
        net.position.set(alignment.x + alignment.scale*(pointA.x*Math.cos(alignment.yaw)+pointA.z*Math.sin(alignment.yaw)), .004, alignment.z + alignment.scale*(-pointA.x*Math.sin(alignment.yaw)+pointA.z*Math.cos(alignment.yaw)));
      } else { net.rotation.set(-Math.PI/2,0,0); net.position.set(0,.004,0); }
    }
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = !xrActive || !floorLocked;
      gridHelperRef.current.rotation.y = alignment.yaw - Math.atan2(pointB.z - pointA.z, pointB.x - pointA.x);
      gridHelperRef.current.position.set(alignment.x + alignment.scale * (pointA.x * Math.cos(alignment.yaw) + pointA.z * Math.sin(alignment.yaw)), .005, alignment.z + alignment.scale * (-pointA.x * Math.sin(alignment.yaw) + pointA.z * Math.cos(alignment.yaw)));
    }
    if (reticleRef.current) {
      reticleRef.current.visible = !xrActive && reticleEnabled;
    }
    if (wallGhostRef.current && !pendingWallStart) wallGhostRef.current.visible = false;
    if (placementGhostRef.current && (!active || (!floorLocked && xrActive))) placementGhostRef.current.visible = false;

    renderOnceRef.current();
    // Stage computational work over separate frames, after the base kitchen is visible.
    requestAnimationFrame(() => {
      window.setTimeout(() => {
        if (builtSceneRef.current !== built) return;
        built.updateLighting(projectRef.current, 1);
        renderOnceRef.current();
        requestAnimationFrame(() => {
          window.setTimeout(() => {
            if (builtSceneRef.current !== built) return;
            built.updateLighting(projectRef.current, 3);
            renderOnceRef.current();
            requestAnimationFrame(() => window.setTimeout(() => {
              if (builtSceneRef.current !== built || projectRef.current.settings?.ambientOcclusion === false) return;
              built.activateOcclusion?.();
              renderOnceRef.current();
            }, 40));
          }, 40);
        });
      }, 40);
    });
  }, [project, alignment, pointA, pointB, pendingWallStart, xrActive, floorLocked, scaleConfirmed, active, reticleEnabled]);

  // Show the exact handle placement + interactive candidate spot markers on 3D doors in AR.
  useEffect(() => {
    const built = builtSceneRef.current;
    if (!built || arTool !== 'handle') {
      if (handleSpotsRef.current) {
        handleSpotsRef.current.dispose();
        handleSpotsRef.current = null;
      }
      return;
    }
    const previews = attachSelectedHandlePreviews(built, project, handleStyle, handleOrient);
    const spotsSet = project.doorsHidden
      ? null
      : attachHandleCandidateSpots(built, project);
    handleSpotsRef.current = spotsSet;
    renderOnceRef.current();
    return () => {
      for (const preview of previews) {
        preview.parent?.remove(preview);
        disposeObject3D(preview);
      }
      if (spotsSet) {
        spotsSet.dispose();
        if (handleSpotsRef.current === spotsSet) handleSpotsRef.current = null;
      }
      renderOnceRef.current();
    };
  }, [project, alignment, pointA, pointB, pendingWallStart, xrActive, floorLocked, active, reticleEnabled, arTool, handleStyle, handleOrient]);

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

    if (toolNow === 'select' || toolNow === 'move') return;
    if (toolNow === 'dining') {
      choices.onPlaceDining(modelPt.x * 100, modelPt.z * 100);
      return;
    }

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
      propsRef.current.onUpdateProject((prev) => ({
        ...prev,
        arCalibration: { a, b, realDistanceCm: distCm },
      }));
      onToast(`چرخش و مقیاس کل صحنه روی ${distCm}cm تنظیم شد`);
      return;
    }

    if (toolNow === 'wall') {
      const start = pendingWallStartRef.current;
      const snapped = snapWallDrawingPoint({ x: modelPt.x * 100, y: modelPt.z * 100 }, projectRef.current.walls,
        start ? { x: start.x * 100, y: start.z * 100 } : null);
      if (!start) {
        const point = { x: snapped.x / 100, z: snapped.y / 100 };
        pendingWallStartRef.current = point;
        setPendingWallStart(point);
        onToast('نقطه شروع دیوار ثبت شد — نقطه بعدی را انتخاب یا تأیید کنید');
        return;
      }
      const endPoint = { x: snapped.x / 100, z: snapped.y / 100 };
      const distCm = Math.hypot(endPoint.x - start.x, endPoint.z - start.z) * 100;
      if (distCm < 40) {
        onToast('طول دیوار باید حداقل ۴۰ سانتی‌متر باشد');
        return;
      }
      const wallH = projectRef.current.settings?.wallHeightCm || DEFAULT_PROJECT_SETTINGS.wallHeightCm;
      const newWall = buildArScannedWall(projectRef.current.walls.map(w => ({ ...w })), start, endPoint, wallH);
      if (hasWallSegment(projectRef.current.walls, newWall)) return onToast('این دیوار از قبل رسم شده است');
      // Keep the exact welded endpoint, never the unsnapped hit-test point.
      const end = { x: newWall.x2Cm / 100, z: newWall.y2Cm / 100 };
      pendingWallStartRef.current = end;
      setPendingWallStart(end);
      propsRef.current.onUpdateProject((prev) => {
        const walls = prev.walls.map(w => ({ ...w }));
        const committedWall = buildArScannedWall(walls, start, end, wallH);
        committedWall.id = newWall.id;
        return {
          ...prev,
          walls: [...walls, committedWall],
          activeWallId: committedWall.id,
          activeBoxId: null,
          selectedDoorId: null,
        };
      }, 'دیوار جدید روی کف AR ثبت شد');
      logDiagnostic('wall-added', newWall.id);
      return;
    }

    const proj = projectRef.current;
    const pendingSweep = pendingCabSweepRef.current;
    // Allow cross-wall sweeping in cab-draw so corner connections work like 2D!
    const extend = toolNow === 'fridge' || toolNow === 'cab-base' || toolNow === 'cab-wall' || toolNow === 'cab-tall';
    const hitWall = projectArPointOntoWalls(modelPt, proj.walls, extend);
    if (!hitWall) {
      onToast('ابتدا نشانگر را نزدیک یک دیوار قرار دهید');
      return;
    }

    if (toolNow === 'cab-base' || toolNow === 'cab-wall' || toolNow === 'cab-tall') {
      const kind: BoxKind =
        toolNow === 'cab-base'
          ? 'base'
          : toolNow === 'cab-wall'
          ? choices.drawBoxKind === 'wall-deep'
            ? 'wall-deep'
            : 'wall'
          : choices.drawBoxKind === 'closet'
          ? 'closet'
          : 'tall';
      if (!pendingSweep) {
        const draft = startCabinetRow(proj, hitWall.wall, hitWall.offsetCm, kind);
        if (!draft) return onToast('برای شروع ردیف فضای آزاد کافی نیست');
        setPendingCabSweep(draft);
        onToast('شروع ردیف مشخص شد؛ انتها را انتخاب و ثبت کنید');
        return;
      }
      const row = previewCabinetRow(proj, pendingSweep, hitWall.wall.id, hitWall.offsetCm);
      if (!row.valid) return onToast('انتهای ردیف را روی بخش آزاد همان دیوار یا دیوار متصل بگذارید');
      if (choices.onCreateBoxesFromSweep(row.requested, pendingSweep.kind, row.suggestedOwners)) {
        setPendingCabSweep(continueCabinetRow(pendingSweep, hitWall.wall.id, hitWall.offsetCm, row.segments));
      }
      return;
    }

    if (toolNow === 'fridge') {
      const width = FRIDGE_MODELS[choices.fridgeModel].width + 2 * FRIDGE_FRAME_CM;
      choices.onPlaceFridge(hitWall.wall.id, hitWall.offsetCm - width / 2);
      return;
    }

    if (toolNow === 'opening') {
      propsRef.current.onUpdateProject((prev) => {
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
      const base = hitWall.wall.boxes.find(b => b.type === 'base' && hitWall.offsetCm >= b.offsetX - 5 && hitWall.offsetCm <= b.offsetX + b.width + 5);
      if (!base) return onToast('ابتدا در این قسمت باکس زمینی بکشید');
      const kind = toolNow === 'appliance' ? choices.applianceKind : toolNow;
      const width = kind === 'sink' ? SINK_MODELS[choices.sinkModel].width : kind === 'gas' ? choices.gasWidth : APPLIANCE_CONFIGS[kind].width;
      choices.onPlaceAppliance(hitWall.wall.id, base.id, hitWall.offsetCm - width / 2, kind);
    }
  };
  applyFloorActionRef.current = applyArFloorActionAt;

  const handleArDetailAction = (clientX: number, clientY: number) => {
    const picked = detailedPickAtClientRef.current(clientX, clientY);
    const mount = kitchenMountRef.current;
    const built = builtSceneRef.current;
    const choices = propsRef.current;
    const toolNow = arToolRef.current;

    if (toolNow === 'front-cut') {
      const transform = picked && built?.wallTransforms.get(picked.data.wallId);
      if (picked?.data.boxId && transform && mount) {
        const pt = mount.worldToLocal(picked.point.clone());
        const x = pt.clone().sub(transform.origin).dot(transform.tangent) * 100;
        choices.onFrontCut(picked.data.wallId, picked.data.boxId, x, pt.y * 100);
      } else choices.onFrontCutOrient(choices.frontCutOrient === 'vertical' ? 'horizontal' : 'vertical');
      return;
    }

    if (!picked || !mount || !built) {
      if (toolNow === 'handle') {
        const nxt: Orientation = choices.handleOrient === 'vertical' ? 'horizontal' : 'vertical';
        choices.onHandleOrientChange?.(nxt);
        onToast(`جهت دستگیره: ${nxt === 'vertical' ? 'عمودی' : 'افقی'}`);
      } else if (toolNow === 'doors') {
        const nxt: Orientation = choices.doorOrient === 'vertical' ? 'horizontal' : 'vertical';
        choices.onSetDoorOrient?.(nxt);
        onToast(`جهت براش درب: ${nxt === 'vertical' ? 'عمودی' : 'افقی'}`);
      } else if (toolNow === 'hardware') {
        const idx = Math.max(0, HARDWARE_KIND_ORDER.indexOf(choices.hardwareBrush));
        const nxt = HARDWARE_KIND_ORDER[(idx + 1) % HARDWARE_KIND_ORDER.length];
        choices.onSetHardwareBrush?.(nxt);
        onToast(`نوع یراق: ${HARDWARE_KIND_META[nxt].label}`);
      } else if (toolNow === 'door-style') {
        const idx = Math.max(0, DOOR_STYLE_ORDER.indexOf(choices.doorStyleBrush));
        const nxt = DOOR_STYLE_ORDER[(idx + 1) % DOOR_STYLE_ORDER.length];
        choices.onSetDoorStyleBrush?.(nxt);
        onToast(`مدل قلم: ${DOOR_STYLE_META[nxt].label}`);
      } else if (toolNow === 'finish') {
        const idx = Math.max(0, CABINET_FINISH_ORDER.indexOf(choices.cabinetFinishBrush));
        const nxt = CABINET_FINISH_ORDER[(idx + 1) % CABINET_FINISH_ORDER.length];
        choices.onSetCabinetFinishBrush?.(nxt);
        onToast(`رنگ قلم: ${CABINET_FINISHES[nxt].label}`);
      } else if (toolNow === 'pencil' || toolNow === 'skeleton' || toolNow === 'shelf') {
        const nxtOrient: Orientation = choices.shelfOrient === 'vertical' ? 'horizontal' : 'vertical';
        choices.onSetShelfOrient?.(nxtOrient);
        onToast(`جهت طبقه: ${nxtOrient === 'vertical' ? 'عمودی' : 'افقی'}`);
      } else {
        onToast('ابتدا روی قسمت معتبر یک کابینت لمس کنید');
      }
      return;
    }

    if (picked.data.kind === 'dining' && picked.data.diningId) {
      if (toolNow === 'eraser') choices.onDeleteDining(picked.data.diningId);
      return;
    }

    if (toolNow === 'finish') {
      if (picked.data.kind === 'countertop') {
        choices.onApplyFinish?.('countertop', picked.data.wallId);
        return;
      }
      if (picked.data.kind === 'backsplash') {
        choices.onApplyFinish?.('backsplash', picked.data.wallId);
        return;
      }
      if (picked.data.boxId) {
        choices.onApplyFinish?.('box', picked.data.wallId, picked.data.boxId, undefined, picked.data.doorId);
        propsRef.current.onUpdateProject((prev) => ({
          ...prev,
          activeWallId: picked.data.wallId,
          activeBoxId: picked.data.boxId || null,
        }));
        return;
      }
      return;
    }

    if (toolNow === 'hardware') {
      if (picked.data.boxId && picked.data.doorId) {
        choices.onApplyHardwareKind?.(picked.data.boxId, [picked.data.doorId], choices.hardwareBrush);
      } else if (picked.data.boxId) {
        choices.onApplyHardwareKind?.(picked.data.boxId, null, choices.hardwareBrush);
      }
      return;
    }

    if (toolNow === 'door-style') {
      if (picked.data.boxId && picked.data.doorId) {
        choices.onApplyDoorStyle?.(picked.data.boxId, [picked.data.doorId], choices.doorStyleBrush);
      } else if (picked.data.boxId) {
        choices.onApplyDoorStyle?.(picked.data.boxId, null, choices.doorStyleBrush);
      }
      return;
    }

    if (toolNow === 'eraser') {
      if (picked.data.kind === 'opening' && picked.data.openingId) {
        if (choices.onDeleteOpening) {
          choices.onDeleteOpening(picked.data.wallId, picked.data.openingId);
        } else {
          propsRef.current.onUpdateProject((prev) => {
            const next: ProjectState = JSON.parse(JSON.stringify(prev));
            const w = next.walls.find((x) => x.id === picked.data.wallId);
            if (w) w.openings = (w.openings || []).filter((o) => o.id !== picked.data.openingId);
            return next;
          }, 'پنجره / درب / ستون حذف شد');
        }
        return;
      }
      let toastMsg = '';
      propsRef.current.onUpdateProject((prev) => {
        const next: ProjectState = JSON.parse(JSON.stringify(prev));
        const w = next.walls.find((x) => x.id === picked.data.wallId);
        if (!w) return prev;
        if (picked.data.kind === 'appliance' && picked.data.appId) {
          deleteApplianceHierarchically(w, picked.data.appId);
          toastMsg = 'تجهیز حذف شد';
          return next;
        }
        const b = picked.data.boxId ? w.boxes.find((x) => x.id === picked.data.boxId) : undefined;
        if (!b) return prev;
        if (picked.data.kind === 'handle' && picked.data.handleId) {
          const removed = b.handles.find((h) => h.id === picked.data.handleId);
          b.handles = b.handles.filter((h) => h.id !== picked.data.handleId);
          if (removed && !b.handles.some((h) => h.doorId === removed.doorId)) {
            const affDoor = b.doors.find((d) => d.id === removed.doorId);
            if (affDoor) affDoor.hingeSide = undefined;
          }
          toastMsg = 'دستگیره حذف شد';
        } else if (picked.data.kind === 'frame' && picked.data.frameId) {
          b.frames = (b.frames || []).filter((f) => f.id !== picked.data.frameId);
          toastMsg = 'فریم حذف شد';
        } else if (picked.data.kind === 'shelf' && picked.data.shelfId) {
          b.shelves = b.shelves.filter((s) => s.id !== picked.data.shelfId);
          toastMsg = 'طبقه حذف شد';
        } else if (picked.data.kind === 'unit-div' && picked.data.seamCm !== undefined) {
          const zones = getCornerBlockedZonesForWall(w, next.walls, next.cornerOwners);
          removeUnitDividerWithSync(b, picked.data.seamCm, zones);
          toastMsg = 'دیواره یونیت حذف شد';
        } else if (picked.data.kind === 'door' && picked.data.doorId) {
          eraseDoorWithRule(b, picked.data.doorId);
          toastMsg = 'درب حذف شد';
        } else if (picked.data.kind === 'box') {
          deleteBoxHierarchically(w, b.id);
          toastMsg = 'باکس حذف شد';
        } else {
          return prev;
        }
        return next;
      });
      if (toastMsg) onToast(toastMsg);
      return;
    }

    if (!picked.data.boxId) {
      onToast('ابتدا روی قسمت معتبر یک کابینت لمس کنید');
      return;
    }

    const transform = built.wallTransforms.get(picked.data.wallId);
    if (!transform) return;
    mount.updateWorldMatrix(true, true);
    const modelPt = mount.worldToLocal(picked.point.clone());
    const distance = modelPt.clone().sub(transform.origin);
    const xCm = distance.dot(transform.tangent) * 100;
    const yCm = modelPt.y * 100;

    if (toolNow === 'handle') {
      const projNow = projectRef.current;
      const wallNow = projNow.walls.find((x) => x.id === picked.data.wallId);
      const boxNow = wallNow?.boxes.find((b) => b.id === picked.data.boxId);
      const localXNow = boxNow ? Math.max(0, Math.min(boxNow.width, xCm - boxNow.offsetX)) : 0;
      const doorNow =
        (picked.data.doorId ? boxNow?.doors.find((d) => d.id === picked.data.doorId) : undefined) ||
        boxNow?.doors.find((d) => localXNow >= d.startCm - 0.5 && localXNow <= d.startCm + d.widthCm + 0.5);

      if (!wallNow || !boxNow || !doorNow || doorNow.kind === 'fridge') {
        onToast('ابتدا روی یک درب کابینت لمس کنید');
        return;
      }

      if (projNow.multiSelection && projNow.multiSelection.doorIds.length > 0) {
        const targetDoorIds = projNow.multiSelection.doorIds;
        const hasCnc = projNow.walls.some((wItem) =>
          wItem.boxes.some((bItem) =>
            bItem.doors.some((dItem) => targetDoorIds.includes(dItem.id) && dItem.doorStyle === 'cnc')
          )
        );
        const runBatch = () => {
          propsRef.current.onUpdateProject((prev) => {
            const next: ProjectState = JSON.parse(JSON.stringify(prev));
            for (const wMut of next.walls) {
              const bZones = getCornerBlockedZonesForWall(wMut, next.walls, next.cornerOwners);
              for (const bMut of wMut.boxes) {
                if (!bMut.doors.some((dMut) => targetDoorIds.includes(dMut.id))) continue;
                autoUnitizeBoxForHandles(bMut, bZones);
                applyHandlesToBoxDoors(bMut, targetDoorIds, choices.handleStyle, choices.handleOrient, undefined, bZones);
              }
            }
            return next;
          }, 'دستگیره روی درب‌های انتخابی نصب شد');
        };
        if (choices.handleStyle === 'hidden' && choices.onConfirmHiddenHandle && (projNow.designStyle === 'neoclassic' || hasCnc)) {
          choices.onConfirmHiddenHandle(runBatch);
        } else {
          runBatch();
        }
        return;
      }

      const { rowIndex, xRatio, yRatio } = picked.data;
      if (picked.data.kind !== 'handle-spot' || rowIndex === undefined || xRatio === undefined || yRatio === undefined) {
        onToast('یکی از نقاط نصب روی در را انتخاب کنید');
        return;
      }

      const runSingle = () => {
        let feedback = '';
        propsRef.current.onUpdateProject((prev) => {
          const next: ProjectState = JSON.parse(JSON.stringify(prev));
          const w = next.walls.find((x) => x.id === wallNow.id);
          const box = w?.boxes.find((b) => b.id === boxNow.id);
          const targetDoor = box?.doors.find((d) => d.id === doorNow.id);
          if (!w || !box || !targetDoor) return prev;
          const zones = getCornerBlockedZonesForWall(w, next.walls, next.cornerOwners);

          const bayCheck = canPlaceHandleInBay(box, targetDoor, zones);
          if (!bayCheck.ok) {
            feedback = bayCheck.reason || 'اول یونیت رو مشخص کن';
            return prev;
          }

          const spotRes = applyHandleAtSpot(
            box,
            targetDoor.id,
            rowIndex,
            xRatio,
            yRatio,
            choices.handleStyle,
            choices.handleOrient,
            zones
          );
          next.activeWallId = w.id;
          next.activeBoxId = box.id;
          next.selectedDoorId = targetDoor.id;
          next.selectedHandleId = spotRes.handleId ?? null;
          feedback = 'دستگیره روی درب نصب شد و جهت بازشو مشخص گردید';
          return next;
        });
        if (feedback) onToast(feedback);
      };

      if (choices.handleStyle === 'hidden' && choices.onConfirmHiddenHandle && (projNow.designStyle === 'neoclassic' || doorNow.doorStyle === 'cnc')) {
        choices.onConfirmHiddenHandle(runSingle);
      } else {
        runSingle();
      }
      return;
    }

    let feedback = '';
    propsRef.current.onUpdateProject((prev) => {
      const next: ProjectState = JSON.parse(JSON.stringify(prev));
      const w = next.walls.find((x) => x.id === picked.data.wallId);
      const box = w?.boxes.find((b) => b.id === picked.data.boxId);
      if (!w || !box) return prev;
      const localX = Math.max(0, Math.min(box.width, xCm - box.offsetX));
      const zones = getCornerBlockedZonesForWall(w, next.walls, next.cornerOwners);

      if (toolNow === 'doors') {
        const preview = computeDoorBrushPreview(
          box,
          localX,
          choices.doorOrient,
          choices.doorVertCount,
          choices.drawerPatIdx,
          choices.liftPatIdx,
          zones,
          choices.doorTargetWidth
        );
        const res = applyDoorBrushPreview(box, localX, preview, zones);
        if (!res.ok) {
          feedback = res.message || 'امکان درج درب در این محل نیست';
          return prev;
        }
        next.selectedDoorId = res.selectedDoorId;
        next.activeBoxId = box.id;
        next.activeWallId = w.id;
        feedback = 'درب ثبت شد (برای تعیین جهت لولا دستگیره بگذارید)';
      } else if (toolNow === 'pencil' || toolNow === 'skeleton' || toolNow === 'shelf') {
        let seam: number | null = null;
        for (const d of box.doors) {
          if (d.startCm > 2 && Math.abs(localX - d.startCm) < 8) seam = d.startCm;
          const endCm = d.startCm + d.widthCm;
          if (endCm < box.width - 2 && Math.abs(localX - endCm) < 8) seam = endCm;
        }
        for (const u of box.unitDividers) {
          if (Math.abs(localX - u) < 8) seam = u;
        }
        if (seam !== null && toolNow !== 'shelf') {
          const sv = +seam.toFixed(1);
          const hasDiv = box.unitDividers.some((u) => Math.abs(u - sv) < 1.5);
          if (hasDiv) {
            removeUnitDividerWithSync(box, sv, zones);
            feedback = 'دیواره یونیت برداشته شد';
          } else {
            box.unitDividers.push(sv);
            box.unitDividers.sort((a, c) => a - c);
            feedback = 'دیواره یونیت (32mm) ثبت شد';
          }
          next.activeBoxId = box.id;
          next.activeWallId = w.id;
          return next;
        }
        const unit = getUnitsInBox(box, zones).find((u) => localX >= u.startCm - 0.5 && localX <= u.endCm + 0.5);
        if (!unit || !unit.canHaveShelves) {
          feedback = unit?.blockedReason || 'این یونیت ظرفیت طبقه جدید ندارد';
          return prev;
        }
        if (choices.shelfOrient === 'vertical') {
          const rawXRatio = (localX - unit.startCm) / Math.max(1, unit.endCm - unit.startCm);
          const vRes = addVerticalDividerWithCenterSnap(box, unit.startCm, unit.endCm, rawXRatio);
          if (!vRes.ok) {
            feedback = vRes.message;
            return prev;
          }
          next.activeBoxId = box.id;
          next.activeWallId = w.id;
          feedback = vRes.message;
          return next;
        }
        const innerH = Math.max(1, box.height - box.plinth - box.countertopCm);
        const yRatio = Math.max(0.12, Math.min(0.88, 1 - (yCm - box.elevY - box.plinth) / innerH));
        const res = addShelvesWithMinGap(box, unit.startCm, unit.endCm, choices.shelfCount, yRatio);
        if (!res.ok) {
          feedback = res.message;
          return prev;
        }
        next.activeBoxId = box.id;
        next.activeWallId = w.id;
        feedback = res.message || 'طبقه اضافه شد';
      } else if (toolNow === 'frame') {
        const yLocal = yCm - box.elevY;
        const margin = 10;
        let side: 'left' | 'right' | 'top' | 'bottom' | 'seam' = 'seam';
        let seamCm: number | undefined;
        if (localX <= margin) side = 'left';
        else if (localX >= box.width - margin) side = 'right';
        else if (yLocal >= box.height - margin) side = 'top';
        else if (yLocal <= box.plinth + margin) side = 'bottom';
        else seamCm = localX;
        const exposure = getBoxSideExposure(box, w, next.walls, next.cornerOwners, zones);
        const res = placeFrameOnBox(box, side, choices.frameWidthCm || 5, seamCm, exposure);
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
    const cam = trackedWideCameraRef.current || (renderer?.xr.isPresenting ? (renderer.xr.getCamera().cameras[0] || renderer.xr.getCamera()) : cameraRef.current);
    const pinned = !xrActive && renderer && cam ? surfaceCursorRef.current.screen(cam, renderer.domElement) : null;
    if (xrActive && !floorLocked) {
      handleLockFloor();
      return;
    }
    if (hideKitchen && !arToolRef.current.startsWith('calibrate-')) return;
    if (arToolRef.current === 'wall' && pendingWallStartRef.current && renderer) {
      const rect = renderer.domElement.getBoundingClientRect();
      const centerLocal = floorPointAtClientRef.current(
        pinned?.x ?? rect.left + rect.width / 2,
        pinned?.y ?? rect.top + rect.height / 2
      );
      if (!centerLocal) {
        onToast('نشانگر روی کف نیست؛ دوربین را به سمت کف بگیرید');
        return;
      }
      applyFloorActionRef.current(centerLocal);
      return;
    }
    if (renderer) {
      const rect = renderer.domElement.getBoundingClientRect();
      const cx = pinned?.x ?? rect.left + rect.width / 2;
      const cy = pinned?.y ?? rect.top + rect.height / 2;
      if (isArDetailTool(arToolRef.current)) {
        handleArDetailAction(cx, cy);
        return;
      }
      const centerLocal = placementPointAtClientRef.current(cx, cy);
      if (centerLocal) {
        applyFloorActionRef.current(centerLocal, cx, cy);
      }
    }
  };

  confirmActionRef.current = handleConfirmAction;

  // Triggered by floating Cancel (لغو) button in AR
  const handleCancelAction = () => {
    setPendingWallStart(null);
    setPendingCabSweep(null);
    if (diningGhostRef.current) diningGhostRef.current.visible = false;
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
    if (startupPendingRef.current || xrSessionRef.current) return;
    startupPendingRef.current = true;
    let startupStage = 'درخواست نشست AR';
    let sessionRequest: Promise<XRSession> | null = null;
    setXrStarting(true);
    setXrStartError(null);
    setScanDiagnostics({ tracking: false, rawHits: 0, validHits: 0 });
    const xr = (navigator as unknown as { xr?: XRSystem }).xr;
    const renderer = rendererRef.current;
    // A pre-requested session uses document.body as its persistent DOM overlay.
    const overlayRoot = overlayRootRef.current || document.body;
    if ((!xr && !pendingSession) || !renderer || !overlayRoot) {
      const message = !xr && !pendingSession
        ? 'WebXR در این مرورگر فعال نیست. اسکن واقعی کف به Chrome اندروید و ARCore نیاز دارد.'
        : 'موتور اسکن هنوز آماده نشده است؛ دوباره شروع دوربین را بزنید.';
      setXrStartError(message);
      setXrStarting(false);
      startupPendingRef.current = false;
      onToast(message);
      return;
    }

    try {
      sessionRequest = pendingSession || requestChidoSession(xr!, overlayRoot);
      const session = await withXRStartupTimeout(
        sessionRequest,
        'دوربین WebXR', 30000
      );
      if (rendererRef.current !== renderer) {
        await session.end().catch(() => {});
        return;
      }
      skipEndNotificationRef.current = false;
      xrSessionRef.current = session;
      setXrActive(true);
      if (controlsRef.current) controlsRef.current.enabled = false;
      floorScannerRef.current.reset();
      floorConfirmationRef.current.reset();
      fallbackLocalSpaceRef.current = null;
      xrFrameCountRef.current = 0;
      xrStartTimeRef.current = performance.now();
      xrLastFrameTimeRef.current = 0;
      xrLastPoseTimeRef.current = 0;
      xrTrackingWarningRef.current = false;
      floorRevealStartRef.current = null;
      anchorsRef.current = [];
      anchorCandidatesRef.current = [];
      anchorPendingRef.current = false;
      anchorGenerationRef.current++;
      anchorStabilizerRef.current = new AnchorStabilizer();
      anchorLastTimeRef.current = 0;
      pendingAnchorCreateRef.current = false;
      rescanOriginRef.current = null;
      setScaleConfirmed(false);
      setFloorLocked(false);

      session.addEventListener('end', () => {
        renderer.setAnimationLoop(null);
        xrSessionRef.current = null;
        floorTrackingRef.current.dispose();
        setXrActive(false);
        rescanOriginRef.current = null;
        setScaleConfirmed(false);
        setFloorLocked(false);
        setScanReady(false);
        fallbackLocalSpaceRef.current = null;
        xrFrameCountRef.current = 0;
        xrStartTimeRef.current = 0;
        xrTrackingWarningRef.current = false;
        setOcclusionStatus('idle');
        if (skipEndNotificationRef.current) {
          skipEndNotificationRef.current = false;
        } else {
          onSessionEnded?.();
        }
        if (controlsRef.current) controlsRef.current.enabled = true;
        renderOnceRef.current();
      });

      // Exact Chido orientation: a local reference space and a true forward
      // viewer-space plane hit test. Additional rays ROTATE their direction,
      // rather than moving their origin sideways (the old Kitchyar bug).
      startupStage = 'اتصال موتور به فضای ردیابی local';
      renderer.xr.setReferenceSpaceType(CHIDO_REFERENCE_SPACE);
      await withXRStartupTimeout(renderer.xr.setSession(session), 'موتور WebXR', 15000);
      // Install the REAL Chido-style tracking loop as soon as setSession
      // succeeds, not after each optional hit-test provider responds.
      // It stays alive for both scanning and the confirmed-floor state.
      void session.requestReferenceSpace(CHIDO_REFERENCE_SPACE).then(local => {
        if (xrSessionRef.current === session) fallbackLocalSpaceRef.current = local;
      }).catch(error => console.warn('[Kitchyar XR] local reference space unavailable', error));
      let lastXrFrameTime = 0;
      renderer.setAnimationLoop((time: number, frame?: XRFrame) => {
        if (!frame || rendererRef.current !== renderer || !sceneRef.current || !cameraRef.current) return;
        lightingRef.current?.setIntensities(projectRef.current.settings);
        builtSceneRef.current?.syncOcclusion?.();
        xrFrameCountRef.current += 1;
        xrLastFrameTimeRef.current = performance.now();
        // Chido's runtime calls getViewerPose every XRFrame using its local
        // reference space. Three's XRManager may briefly expose null before
        // the first frame, so also retain the session's own local space.
        const space = renderer.xr.getReferenceSpace() || fallbackLocalSpaceRef.current;
        if (!space) {
          if (time - lastScanReportMsRef.current > 300) {
            lastScanReportMsRef.current = time;
            setScanDiagnostics({ tracking: false, rawHits: 0, validHits: 0 });
          }
          renderer.render(sceneRef.current, renderer.xr.getCamera());
          return;
        }
        let pose: XRViewerPose | undefined;
        try { pose = frame.getViewerPose(space); }
        catch (error) { console.warn('[Kitchyar XR] viewer pose rejected', error); }
        if (!pose) {
          floorConfirmationRef.current.reset();
          setScanReady(false);
          if (time - lastScanReportMsRef.current > 300) {
            lastScanReportMsRef.current = time;
            setScanDiagnostics({ tracking: false, rawHits: 0, validHits: 0 });
          }
          // Keep the immersive camera rendering even when ARCore momentarily
          // loses its 6DoF pose; do not freeze the camera on the last frame.
          renderer.render(sceneRef.current, renderer.xr.getCamera());
          return;
        }
        lightingRef.current?.followXrPose(pose.transform);
        xrLastPoseTimeRef.current = performance.now();
        if (xrTrackingWarningRef.current) {
          xrTrackingWarningRef.current = false;
          setXrStartError(null);
        }
        if (time - lastScanReportMsRef.current > 300) {
          lastScanReportMsRef.current = time;
          setScanDiagnostics(prev => prev.tracking ? prev : {...prev, tracking: true});
        }

        if (!activeRef.current) {
          // 2D covers the camera with its DOM view while this same session and
          // reference space keep tracking. No end/unmount or fresh floor scan.
          renderer.render(sceneRef.current, renderer.xr.getCamera());
          return;
        }

        if (floorNetUniformsRef.current) {
          floorNetUniformsRef.current.uTime.value = time / 1000;
        }

        // Exact Chido Studio.updateAnchor strategy: sequential anchors (up to
        // five), 42-cm separation, 5.5-cm level filter, robust pose estimation.
        if (floorLockedRef.current) {
          if (pendingAnchorCreateRef.current) {
            pendingAnchorCreateRef.current = false;
            if(!anchorCandidatesRef.current.length)anchorCandidatesRef.current = [
              ...floorScannerRef.current.observations.map(p => p.clone()),
              ...(floorScannerRef.current.point ? [floorScannerRef.current.point.clone()] : []),
            ];
          }
          for (const cross of crossesPoolRef.current) cross.visible = false;
          const revealStarted = floorRevealStartRef.current;
          if (revealStarted !== null && floorNetUniformsRef.current) {
            const t = Math.min(1, (performance.now() - revealStarted) / 750);
            const eased = 1 - Math.pow(1 - t, 3);
            floorNetUniformsRef.current.uReveal.value = 0.65 + 3.6 * eased;
            floorNetUniformsRef.current.uPulse.value = 1 - eased;
            floorNetUniformsRef.current.uOpacity.value = 0.85 - 0.46 * eased;
            if (floorNetMeshRef.current) floorNetMeshRef.current.visible = t < 1;
            if (t >= 1) floorRevealStartRef.current = null;
          }
          const origin = basePoseRef.current;
          if (origin && typeof frame.createAnchor === 'function' && anchorsRef.current.length + Number(anchorPendingRef.current) < 5) {
            const centralSource = floorTrackingRef.current.hitSource;
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
            let candidatePose: XRPose | undefined;
            try { candidatePose = frame.getPose(node.anchor.anchorSpace, space) || undefined; } catch {}
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
              floorGroupRef.current.rotation.y = origin.yaw + fitted.pose.yaw;
            }
          }
          // Keep the central hit-test source active: a user can press
          // "Rescan floor" without restarting the immersive XR session.
          // Canceling and shifting it here makes an angled ray the new
          // central source and can stall subsequent floor detection.
        } else if (!floorLockedRef.current) {
          const viewPos = new THREE.Vector3(
            pose.transform.position.x, pose.transform.position.y, pose.transform.position.z
          );
          let pt: THREE.Vector3 | null = null;
          try {
            pt = floorTrackingRef.current.update(frame, space, pose, time);
          } catch (error) {
            // A required central-provider failure is a real error, not an
            // endless "camera ready" instruction. Optional rays are isolated
            // inside the copied Chido tracking path.
            setXrStartError(xrLaunchError(error, 'دریافت برخورد مرکزی کف'));
          }
          floorConfirmationRef.current.observe(pt, floorScannerRef.current.observations, floorScannerRef.current.ready, performance.now());
          setScanReady(Boolean(floorConfirmationRef.current.current(performance.now())));
          if (time - lastScanReportMsRef.current > 250 || floorScannerRef.current.ready) {
            lastScanReportMsRef.current = time;
            setScanDiagnostics({
              tracking: true,
              rawHits: floorScannerRef.current.rawHits,
              validHits: floorScannerRef.current.validHits,
            });
          }
          if (pt && reticleRef.current && floorGroupRef.current) {
            floorGroupRef.current.position.set(pt.x, pt.y, pt.z);
            reticleRef.current.position.set(0, 0.012, 0);
            const viewDistance = viewPos.distanceTo(pt);
            const radius = THREE.MathUtils.clamp(
              viewDistance * Math.tan(THREE.MathUtils.degToRad(48 / 2)) / 3,
              0.28, 0.95
            );
            if (floorNetUniformsRef.current) {
              floorNetUniformsRef.current.uReveal.value = radius;
              floorNetUniformsRef.current.uPulse.value = 1;
              floorNetUniformsRef.current.uOpacity.value = 0.85;
            }
            if (floorNetMeshRef.current) floorNetMeshRef.current.visible = true;
          } else if (floorNetMeshRef.current) {
            floorNetMeshRef.current.visible = false;
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

        // Chido samples the floor before optional visual/depth effects.
        // A missing depth API must not interrupt the scan frame.
        try {
          occlusionRef.current?.update(frame, pose, renderer, session, {
            enabled: occlusionEnabledRef.current, ar: true,
          });
          if (occlusionRef.current) setOcclusionStatus(occlusionRef.current.status);
        } catch {
          occlusionRef.current?.hide('unsupported');
        }

        if (floorLockedRef.current && !arDragRef.current) {
          const { x: cx, y: cy } = aimCenter(renderer.domElement.getBoundingClientRect());
          updateAimSurfaceRef.current(cx, cy);
          const local = placementPointAtClientRef.current(cx, cy);
          const result = local ? updateArGhostRef.current(local, cx, cy) : { status: 'invalid' as const };
          setAimStatus(previous => previous === result.status ? previous : result.status);
          if (!local) {
            if (wallGhostRef.current) wallGhostRef.current.visible = false;
            if (placementGhostRef.current) placementGhostRef.current.visible = false;
            if (diningGhostRef.current) diningGhostRef.current.visible = false;
          }
          if (reticleRef.current) reticleRef.current.visible = false;
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

        if(surfaceMarkerRef.current)updateSurfaceCursorMarker(surfaceMarkerRef.current,surfaceCursorRef.current);
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
          const aspect = width / height;
          const fov = wideViewVerticalFov(wideViewModeRef.current, aspect);
          if (wideCamera.aspect !== aspect || wideCamera.fov !== fov) {
            wideCamera.aspect = aspect;
            wideCamera.fov = fov;
            wideCamera.updateProjectionMatrix();
          }
          wideCamera.updateMatrixWorld(true);
          try {
            const scene = sceneRef.current;
            const xrEnvironment = scene.environment;
            scene.environment = trackedWideEnvironmentRef.current;
            try {
              if (projectRef.current.settings?.enableReflections === false) {
                wideRenderer.render(scene, wideCamera);
              } else {
                if (!trackedWideReflectionsRef.current) {
                  trackedWideReflectionsRef.current = createKitchenReflections(wideRenderer, scene, wideCamera);
                }
                trackedWideReflectionsRef.current.render();
              }
            }
            finally { scene.environment = xrEnvironment; }
          } catch {
            // A tablet can lose its secondary WebGL context under memory pressure.
            // Return to the tracked physical camera rather than breaking the XR loop.
            trackedWideRendererRef.current = null;
            setWideViewMode('normal');
            onToast('نمای واید در این دستگاه پشتیبانی نشد؛ دوربین واقعی فعال ماند');
          }
        }
      });
      setXrStarting(false);
      startupStage = 'تشخیص کف (hit-test)';
      await withXRStartupTimeout(floorTrackingRef.current.start(session), 'تشخیص سطح مرکزی', 15000);
      startupStage = 'نمایش ابزارها (DOM Overlay)';
      if (!session.domOverlayState) {
        throw new DOMException('Chido needs WebXR DOM Overlay for floor confirmation', 'NotSupportedError');
      }
      if (floorNetMeshRef.current) floorNetMeshRef.current.visible = false;


      setXrStarting(false);
      onToast('اسکن کف چیدو فعال شد؛ دوربین را آرام به چپ و راست حرکت دهید');
    } catch (error) {
      const err = error as { name?: string; message?: string } | null;
      const name = err?.name || 'Error';
      const details = err?.message || String(error);
      console.error('[Kitchyar Chido Floor Scan] WebXR launch failed', { name, details, error });
      const message = xrLaunchError(error, startupStage);
      skipEndNotificationRef.current = true;
      setXrStartError(message);
      setXrStarting(false);
      const partialSession = xrSessionRef.current;
      xrSessionRef.current = null;
      if (partialSession) partialSession.end().catch(() => {});
      // A permission dialog can resolve after our timeout. Release that late
      // session too, so retry never competes with a camera we no longer own.
      else if (sessionRequest) void sessionRequest.then(session => session.end()).catch(() => {});
      renderer.setAnimationLoop(null);
      floorTrackingRef.current.dispose();
      setXrActive(false);
      setFloorLocked(false);
      setScanReady(false);
      if (controlsRef.current) controlsRef.current.enabled = true;
      renderOnceRef.current();
      onToast(message);
      // Keep the Chido scanner visible with its error and retry button.
      // The previous implementation silently hid this entire screen.
    } finally {
      startupPendingRef.current = false;
      setXrStarting(false);
    }
  };

  useEffect(() => {
    const parent = containerRef.current;
    if (!embeddedIn3D || !xrActive || !floorLocked || wideViewMode === 'normal' || !parent) return;
    const wideRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    wideRenderer.setPixelRatio(Math.min(1.25, window.devicePixelRatio || 1));
    wideRenderer.setClearColor(0xf3f4f6, 1);
    configureKitchenRenderer(wideRenderer, detectSoftwareWebGL(wideRenderer.getContext()));
    const disposeEnvironment = loadKitchenEnvironment(wideRenderer, target => {
      trackedWideEnvironmentRef.current = target.texture;
    });
    const canvas = wideRenderer.domElement;
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;';
    parent.appendChild(canvas);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.03, 80);
    trackedWideRendererRef.current = wideRenderer;
    trackedWideCameraRef.current = camera;
    // Initialize SSR on demand only after the wide camera has rendered its first frame.
    return () => {
      if (trackedWideRendererRef.current === wideRenderer) {
        trackedWideRendererRef.current = null;
        trackedWideCameraRef.current = null;
      }
      trackedWideReflectionsRef.current?.dispose();
      trackedWideReflectionsRef.current = null;
      trackedWideEnvironmentRef.current = null;
      disposeEnvironment();
      wideRenderer.dispose();
      canvas.remove();
    };
  }, [embeddedIn3D, xrActive, floorLocked, wideViewMode]);

  const handleLockFloor = () => {
    const evidence = floorConfirmationRef.current.current(performance.now());
    if (!xrActive || !evidence || performance.now()-xrLastPoseTimeRef.current>600) {
      onToast('چیدو هنوز سه نقطه مستقل هم‌ارتفاع روی کف پیدا نکرده؛ دوربین را آرام روی کف حرکت دهید');
      return;
    }
    const pt = evidence?.point || floorScannerRef.current.point;
    if (xrActive && pt && floorGroupRef.current) {
      const origin = rescanOriginRef.current ?? pt;
      basePoseRef.current = { x: origin.x, y: pt.y, z: origin.z, yaw: rescanOriginRef.current?.yaw ?? 0 };
      floorGroupRef.current.position.set(origin.x, pt.y, origin.z);
      floorGroupRef.current.rotation.y = basePoseRef.current.yaw;
      for (const entry of anchorsRef.current) {
        try { entry.anchor.delete(); } catch {}
      }
      anchorsRef.current = [];
      anchorCandidatesRef.current = [];
      anchorGenerationRef.current++;
      anchorPendingRef.current = false;
      anchorStabilizerRef.current = new AnchorStabilizer();
      anchorLastTimeRef.current = 0;
      anchorCandidatesRef.current = evidence?.observations.map(p=>p.clone()) || [];
      pendingAnchorCreateRef.current = true;
      floorRevealStartRef.current = performance.now();
    }
    const renderer = rendererRef.current;
    const group = floorGroupRef.current;
    if (renderer && group && !rescanOriginRef.current) {
      const cam = renderer.xr.getCamera().cameras[0] || renderer.xr.getCamera();
      const pins = calibrationPinsAtView(cam, group);
      const a = floorLocalToModelXZ(pins.a), b = floorLocalToModelXZ(pins.b);
      pointARef.current = a; pointBRef.current = b;
      setPointA(a); setPointB(b);
      setRealDistanceInput(String(Math.round(pins.a.distanceTo(pins.b) * 100)));
    }
    surfaceCursorRef.current.clear(); setSurfaceCursorActive(false);
    rescanOriginRef.current = null;
    setScaleConfirmed(false);
    setShowScaleDialog(false); setShowCalibPanel(true);
    for (const c of crossesPoolRef.current) c.visible = false;
    floorLockedRef.current = true;
    setFloorLocked(true);
    setArTool('select');
    onFloorConfirmed?.();
    onToast('کف تثبیت شد. نقاط A و B و فاصلهٔ واقعی را تأیید کنید');
  };

  const handleApplyRealDistance = (cm: number) => {
    if (!Number.isFinite(cm) || cm < 10 || cm > 1000) {
      onToast('فاصله باید بین ۱۰ و ۱۰۰۰ سانتی‌متر باشد'); return;
    }
    const prev = alignmentRef.current;
    const dx = pointB.x - pointA.x, dz = pointB.z - pointA.z;
    const modelLength = Math.hypot(dx, dz);
    if (modelLength < .001) { onToast('نقطه‌های A و B باید از هم فاصله داشته باشند'); return; }
    // The physical A/B pins are measurements, not a request to enlarge them.
    const physicalLength = modelLength * prev.scale;
    const nextScale = physicalLength / (cm / 100);
    const calibratedB = { x: pointA.x + dx / modelLength * cm / 100, z: pointA.z + dz / modelLength * cm / 100 };
    const c = Math.cos(prev.yaw), sn = Math.sin(prev.yaw);
    const ax = pointA.x * c + pointA.z * sn, az = -pointA.x * sn + pointA.z * c;
    const next = { ...prev, scale: nextScale, x: prev.x + (prev.scale - nextScale) * ax, z: prev.z + (prev.scale - nextScale) * az };
    alignmentRef.current = next; setAlignment(next);
    pointBRef.current = calibratedB; setPointB(calibratedB);
    setRealDistanceInput(String(cm));
    setShowScaleDialog(false);
    setShowCalibPanel(false);
    setScaleConfirmed(true);
    setKitchenHidden(false);
    setArTool('select');
    propsRef.current.onUpdateProject(prevProject => ({ ...prevProject, arCalibration: { a: pointA, b: calibratedB, realDistanceCm: cm } }));
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

  // Chido's tracking report is based on real XRFrame / getViewerPose data.
  // Don't display an endless "starting tracking" stage when the hardware or
  // reference-space pipeline has stalled: expose which stage failed.
  useEffect(() => {
    if (!xrActive || floorLocked) return;
    const check = () => {
      const started = xrStartTimeRef.current;
      if (!started || !xrSessionRef.current || xrLastPoseTimeRef.current) return;
      const elapsed = performance.now() - started;
      if (elapsed < 9000 || xrTrackingWarningRef.current) return;
      const spaceAvailable = Boolean(rendererRef.current?.xr.getReferenceSpace() || fallbackLocalSpaceRef.current);
      const message = xrFrameCountRef.current === 0
        ? 'جلسه WebXR باز است اما هیچ فریم دوربینی دریافت نشده؛ وضعیت ARCore و مجوز دوربین را بررسی کنید'
        : !spaceAvailable
        ? 'فریم دوربین دریافت شد ولی فضای ردیابی محلی آماده نشده؛ اسکن را دوباره راه‌اندازی کنید'
        : 'فریم WebXR دریافت می‌شود ولی موقعیت مکانی دوربین (getViewerPose) در دسترس نیست؛ گوشی را به سطح دارای جزئیات بگیرید یا اسکن را دوباره شروع کنید';
      xrTrackingWarningRef.current = true;
      setXrStartError(message);
      console.warn('[Kitchyar XR] tracking stall', {
        elapsedMs: Math.round(elapsed),
        frameCount: xrFrameCountRef.current,
        localSpace: spaceAvailable,
        sessionVisibility: xrSessionRef.current.visibilityState,
      });
    };
    const timer = window.setInterval(check, 1500);
    return () => window.clearInterval(timer);
  }, [xrActive, floorLocked]);

  const chidoScanUi = chidoScanReadiness({
    xrAvailable: xrSupported,
    starting: xrStarting,
    sessionActive: xrActive,
    tracking: scanDiagnostics.tracking,
    rawHits: scanDiagnostics.rawHits,
    validHits: scanDiagnostics.validHits,
    ready: scanReady,
    error: xrStartError,
  });

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
      className={`absolute inset-0 flex flex-col transition-opacity ${
        active ? (embeddedIn3D
          ? 'opacity-100 z-40 pointer-events-none'
          : 'opacity-100 z-40 pointer-events-auto')
        : 'opacity-0 z-0 pointer-events-none'
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
        } ${active ? 'pointer-events-auto' : 'pointer-events-none'}`}
      />

      {/* Aiming Reticle overlay for precise AR aiming */}
      {((xrActive && (!floorLocked || aimStatus === 'invalid')) || (!xrActive && reticleEnabled && !surfaceCursorActive)) && (
        <div
          data-testid="ar-reticle-overlay"
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
        >
          <div className="relative w-12 h-12" style={{ color: aimStatus === 'valid' ? '#34d399' : aimStatus === 'invalid' ? '#fbbf24' : '#ffffff', filter: 'drop-shadow(0 1px 3px #000)' }}>
            <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <path d="M16 7H10a3 3 0 0 0-3 3v6m25-9h6a3 3 0 0 1 3 3v6M7 32v6a3 3 0 0 0 3 3h6m25-9v6a3 3 0 0 1-3 3h-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="24" cy="24" r="8" stroke="currentColor" strokeWidth="1.5" opacity=".8" />
              <circle cx="24" cy="24" r="2.5" fill="currentColor" />
            </svg>
          </div>
        </div>
      )}

      {/* The original Scene3DCanvas owns every 3D camera and wall-selector button.
          No duplicate scanner toolbar: XR provides only its camera and floor UI. */}
      {/* The scanned camera is only a layer of the existing 3D editor. */}
      {/* Post-scan overlay banner removed once floorLocked is true so nothing crowds the viewport */}
      {embeddedIn3D && !floorLocked ? (
          <div className="absolute top-[58px] left-3 right-3 z-20 pointer-events-none flex justify-center" dir="rtl">
            <section
              data-testid="chido-floor-scan-readiness"
              data-scan-stage={String(chidoScanUi.progress)}
              data-camera-active={xrActive ? '1' : '0'}
              data-tracking={scanDiagnostics.tracking ? '1' : '0'}
              className="pointer-events-auto w-full max-w-[465px] rounded-[14px] border border-[#e9dbc8] bg-[#f8efe7ef] shadow-lg px-3 py-3 text-[#3b4c44]"
              aria-label="اسکن کف چیدو"
            >
              <div className="flex items-center justify-between gap-2 text-center">
                <span aria-hidden="true" className="text-[32px] font-bold leading-none text-[#357e63]">→</span>
                <div className="flex-1 flex flex-col items-center gap-0.5">
                  <strong className="text-[15px] text-[#2c5341]">دستگاه را آرام به چپ و راست حرکت بده</strong>
                  <small className="text-[13px] text-[#576d61]">دوربین را به سمت کف نگه دار</small>
                </div>
                <span aria-hidden="true" className="text-[32px] font-bold leading-none text-[#357e63]">←</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-[13px]">
                <strong data-testid="chido-scan-stage" className="flex-1">{chidoScanUi.label}</strong>
                <span data-testid="chido-scan-percent" className="font-bold tabular-nums">
                  {chidoScanUi.progress.toLocaleString('fa-IR')}٪
                </span>
              </div>
              <progress
                data-testid="chido-scan-progress"
                className="block mt-2 h-2 w-full rounded-full overflow-hidden accent-[#4c9481]"
                value={chidoScanUi.progress}
                max={100}
                aria-label="آمادگی اسکن کف"
              />
              {xrActive && (
                <small data-testid="xr-frame-diagnostics"
                  className="block mt-1 text-[11px] text-[#635f55] text-center tabular-nums">
                  فریم WebXR: {xrFrameCountRef.current.toLocaleString('fa-IR')} •
                  ردیابی: {scanDiagnostics.tracking ? 'فعال' : 'دریافت نشده'} •
                  نقاط معتبر: {scanDiagnostics.validHits.toLocaleString('fa-IR')}
                </small>
              )}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <small className="text-[12px] text-[#887969]">
                  {xrActive
                    ? 'این درصد از ردیابی و برخوردهای معتبر محاسبه می‌شود، نه درصد پیشرفت ARCore'
                    : xrStartError || xrSupported === false
                    ? 'دوربین واقعی فقط با WebXR / Chrome اندروید و ARCore فعال می‌شود'
                    : 'در حال راه‌اندازی دوربین و شناسایی سطح کف'}
                </small>
                {xrActive && xrStartError ? (
                  <button
                    data-testid="chido-reset-tracking"
                    type="button"
                    onClick={() => {
                      skipEndNotificationRef.current = true;
                      const session = xrSessionRef.current;
                      if (session) {
                        void session.end().catch(error =>
                          console.warn('[Kitchyar XR] failed to end stalled session', error));
                      }
                    }}
                    className="h-10 px-4 rounded-lg bg-amber-700 text-white font-bold text-[14px]"
                  >
                    پایان جلسه و تلاش مجدد
                  </button>
                ) : xrActive ? (
                  <button
                    data-testid="chido-confirm-floor"
                    type="button"
                    disabled={!scanReady}
                    onClick={handleLockFloor}
                    className="h-10 px-4 rounded-lg bg-[#3d735c] text-white font-bold text-[14px] disabled:bg-slate-300 disabled:text-slate-600"
                  >
                    {scanReady ? 'تثبیت این کف' : 'در حال شناسایی کف…'}
                  </button>
                ) : (
                  <button
                    data-testid="chido-start-camera"
                    type="button"
                    disabled={xrStarting}
                    onClick={() => void startWebXrSession()}
                    className="h-10 px-4 rounded-lg bg-[#3d735c] text-white font-bold text-[14px] disabled:bg-slate-300 disabled:text-slate-600"
                  >
                    {xrStarting ? 'در حال شروع دوربین…' : 'شروع مجدد دوربین'}
                  </button>
                )}
              </div>
            </section>
          </div>
      ) : (
        <>
      {/* Top Floating AR Status & Calibration Card */}
      <div
        data-testid="ar-floating-bar"
        style={dialogOpenRef.current ? { display: 'none' } : undefined}
        className="absolute top-2 inset-x-2 z-20 flex flex-wrap items-start justify-between gap-1 pointer-events-none"
      >
        <div className="pointer-events-auto flex min-w-0 items-center gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white/95 p-1 text-[13px] whitespace-nowrap [&>*]:shrink-0">
          {!embeddedIn3D && (xrSupported && !xrActive ? (
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
          ))}

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
                const origin = floorGroupRef.current;
                rescanOriginRef.current = xrSessionRef.current && origin
                  ? { x: origin.position.x, z: origin.position.z, yaw: origin.rotation.y } : null;
                floorScannerRef.current.reset();
                floorConfirmationRef.current.reset();
                floorLockedRef.current = false;
                setScaleConfirmed(false);
                setKitchenHidden(false);
                setShowScaleDialog(false);
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
              disabled={scaleConfirmed}
              className="text-[13px] font-bold text-indigo-600 hover:underline"
            >
              {showCalibPanel ? 'بستن' : 'بازکردن'}
            </button>
          </div>

          {floorLocked && (
            <button type="button" data-testid="ar-toggle-kitchen" aria-pressed={kitchenHidden}
              className="h-8 w-full rounded-lg border border-slate-300 px-2.5 font-bold text-slate-700"
              onClick={() => {
                if (!kitchenHidden) setShowCalibPanel(true);
                setKitchenHidden(value => !value);
              }}>
              {kitchenHidden ? 'نمایش آشپزخانه' : 'مخفی کردن آشپزخانه'}
            </button>
          )}
          {showCalibPanel && !scaleConfirmed && (
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
                  type="text"
                  readOnly
                  inputMode="none"
                  onClick={() => setShowScaleDialog(true)}
                  value={realDistanceInput}
                  onChange={(e) => setRealDistanceInput(e.target.value)}
                  className="w-20 h-8 px-2 border border-slate-300 rounded-md font-bold tabular-nums text-center"
                />
                <button
                  type="button"
                  onClick={() => setShowScaleDialog(true)}
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

      {showScaleDialog && floorLocked && !dialogOpen && (
        <NumberPadDialog label="فاصلهٔ واقعی A و B" initial={Number(realDistanceInput)} min={10} max={1000}
          onApply={handleApplyRealDistance} onClose={() => setShowScaleDialog(false)} />
      )}
      {/* Confirm (تأیید) and Cancel (لغو) floating AR editing actions */}
      {!dialogOpen && !showScaleDialog && !(embeddedIn3D && !floorLocked) &&
        (arTool.startsWith('calibrate-') || (!hideKitchen && arTool !== 'finish' && ((arTool !== 'select' && arTool !== 'move') || pendingWallStart || surfaceCursorActive))) && (
        <div className="pointer-events-auto absolute bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-white/95 border border-slate-200 rounded-xl shadow-lg px-2.5 py-1.5">
          <button
            type="button"
            data-testid="ar-confirm-btn"
            onClick={handleConfirmAction}
            disabled={xrActive && !floorLocked && !scanReady}
            className="h-11 px-3.5 rounded-lg disabled:opacity-40 bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-black inline-flex items-center gap-1.5 transition active:scale-95"
          >
            <Check className="w-4 h-4" />
            <span>{arTool === 'cab-base' || arTool === 'cab-wall' || arTool === 'cab-tall'
              ? (pendingCabSweep ? 'ثبت ردیف' : 'شروع ردیف') : 'تأیید'}</span>
          </button>
          {arTool === 'handle' && (
            <button type="button" className="h-10 whitespace-nowrap rounded-lg border border-slate-300 px-3 font-bold"
              data-testid="ar-handle-orientation"
              onClick={() => onHandleOrientChange?.(handleOrient === 'vertical' ? 'horizontal' : 'vertical')}>
              {handleOrient === 'vertical' ? 'دستگیره عمودی' : 'دستگیره افقی'}
            </button>
          )}
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
            { id: 'select', label: 'انتخاب', icon: MousePointer2 },
            { id: 'move', label: 'جابه‌جایی', icon: Move },
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
      {active && (cursorPreview || previewToolId !== 'select') && (
        <CursorToolPreview
          visible={true}
          clientX={cursorPreview?.x ?? 0}
          clientY={cursorPreview?.y ?? 0}
          tool={previewToolId}
          drawBoxKind={previewBoxKind}
          activeCabWidthCm={cursorPreview?.sweepWidthCm}
          targetStatus={cursorPreview?.status}
          sinkModel={sinkModel}
          gasWidth={gasWidth}
          hoodKind={hoodKind}
          applianceKind={applianceKind}
          fridgeModel={fridgeModel}
          openingKind={openingKind}
          doorOrient={doorOrient}
          doorTargetWidth={doorTargetWidth}
          doorVertCount={doorVertCount}
          drawerPatIdx={drawerPatIdx}
          liftPatIdx={liftPatIdx}
          doorStyleBrush={doorStyleBrush}
          hardwareBrush={hardwareBrush}
          cabinetFinishBrush={cabinetFinishBrush}
          backsplashBrush={backsplashBrush}
          countertopBrush={countertopBrush}
          frameWidthCm={frameWidthCm}
          shelfOrient={shelfOrient}
          shelfCount={shelfCount}
          handleStyle={handleStyle}
          handleOrient={handleOrient}
          previewDoorWidths={cursorPreview?.previewDoorWidths}
          testId="cursor-preview-ar"
        />
      )}
    </section>
  );
};
