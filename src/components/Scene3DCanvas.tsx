import { UnifiedARSession, initialARState } from '../ar/unifiedARSession';
import { ARControls } from './ARControls';
import { nextDiningSeats } from '../cad/diningLayout';
import { createKitchenReflections } from '../cad/kitchenReflections';
import type { CabinetBox } from '../cad/types';
import type { OfferSelection, PickCandidate } from './SelectionPicker';
import { findFrontCut } from '../cad/frontCut';
import type { FloorFurnitureKind } from '../cad/types';
import { buildDiningFootprint3D } from '../cad/dining3d';
import { snapDiningPosition } from '../cad/diningLayout';
import type { DiningSeats } from '../cad/types';
import { HANDLE_STYLES } from '../cad/handleGeometry';
import { DoorTapSequence } from '../utils/doorTapSequence';
import { previewCabinetRow, continueCabinetRow, startCabinetRow, type CabinetRowDraft } from '../cad/cabinetPlacement';
import { logDiagnostic } from '../utils/diagnostics';
import { hasWallSegment, snapWallDrawingPoint } from '../cad/wallSnap';
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { addKitchenLighting, configureKitchenRenderer } from '../cad/kitchenLighting';
import { DoorClosed, DoorOpen, ZoomIn } from 'lucide-react';
import {
  APPLIANCE_CONFIGS,
  APPLIANCE_PLACEABLE_ORDER,
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
  HARDWARE_KIND_META,
  HARDWARE_KIND_ORDER,
  LIFT_PATTERNS,
  OPENING_DEFAULTS,
  SINK_MODELS,
  SINK_MODEL_ORDER,
} from '../cad/constants';
import {
  getCornerBlockedZonesForWall,
  SweepSegment,
} from '../cad/cornerLogic';
import {
  addShelvesWithMinGap,
  addVerticalDividerWithCenterSnap,
  applyDoorBrushPreview,
  applyHandlesToBoxDoors,
  autoUnitizeBoxForHandles,
  clampBoxInternalsAfterResize,
  computeDoorBrushPreview,
  createWall,
  deleteApplianceHierarchically,
  deleteBoxHierarchically,
  eraseDoorWithRule,
  getBoxSideExposure,
  getMaxVerticalDoorCount,
  getUnitsInBox,
  placeFrameOnBox,
  removeUnitDividerWithSync,
  resizeDoorSeamCoupled,
  resizeDrawerUnitWidthCm,
  resizeUnitDividerWithDoorsSync,
} from '../cad/doorRules';
import { applyHandleAtSpot, canPlaceHandleInBay } from '../cad/handleSpots';
import { projectArPointOntoWalls } from '../ar/arCalibration';
import {
  applyAnimatedDoorProgress,
  attachHandleCandidateSpots,
  attachSelectedHandlePreviews,
  buildHandleMesh,
  buildKitchen3DScene,
  kitchenGeometryKey,
  kitchenStructuralKey,
  BuiltKitchenScene,
  CM,
  computeSelectionFocusTarget3D,
  detectSoftwareWebGL,
  disposeObject3D,
  HandleSpotOverlaySet,
  Scene3DHitData,
} from '../cad/scene3dBuilder';
import { kitchenOcclusionGeometryKey } from '../cad/kitchenOcclusion';
import { drainDeferredSceneJobs } from '../utils/deferredSceneSwap';
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
  RoomColumn,
  SelectionMode,
  SinkModel,
  ToolId,
  Wall,
} from '../cad/types';
import { CursorTargetStatus, CursorToolPreview } from './CursorToolPreview';
import { PacedGestureStepper } from '../utils/gesturePacing';
import { SurfaceCursor, createSurfaceCursorMarker, updateSurfaceCursorMarker } from '../utils/surfaceCursor';
import { wideViewVerticalFov, WideViewMode } from '../ar/wideView';

const APPLIANCE_ORDER: ApplianceKind[] = APPLIANCE_PLACEABLE_ORDER;
const OPENING_ORDER: OpeningKind[] = ['window', 'door', 'column'];
const CAB_DRAW_KIND_ORDER: BoxKind[] = ['base', 'wall', 'wall-deep', 'tall', 'closet'];
const HANDLE_STYLE_ORDER = HANDLE_STYLES.map(style => style.id);

interface Scene3DCanvasProps {
  hdrRotationDegrees?: number;
  offerSelection: OfferSelection;
  onResizeCabinet: (wallId: string, boxId: string, side: 'left'|'right'|'top'|'bottom', dx: number, dy: number, commit: boolean) => void;
  onMoveShelf: (wallId: string, boxId: string, shelfId: string, dx: number, dy: number, commit: boolean) => void;
  onBeginDrag: () => void;
  onCancelDrag: () => void;
  onFinishDrag: () => void;
  /** Keep the entire 3D editor mounted during scanning, without painting its
   * virtual WebGL canvas over the real camera passthrough. */
  arEnabled?: boolean;
  viewportActive?: boolean;
  initialSession?: Promise<XRSession> | null;
  sessionKillSignal?: number;
  onSessionEnded?: () => void;
  onFloorConfirmed?: () => void;
  dialogOpen?: boolean;
  onARCalibration?: (a: {x:number;z:number}, b:{x:number;z:number}, cm:number) => void;
  wideViewModeExternal?: WideViewMode;
  onWideViewModeChange?: (mode: WideViewMode) => void;
  zoomSelectedSeq?: number;
  onTriggerZoomSelected?: () => void;
  hasAnySelection?: boolean;
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
  doorStyleBrush: DoorStyle;
  hardwareBrush?: HardwareKind;
  cabinetFinishBrush: CabinetFinishId;
  backsplashBrush: BacksplashFinishId;
  countertopBrush: CountertopFinishId;
  shelfOrient?: Orientation;
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
  onSetHardwareBrush?: (h: HardwareKind) => void;
  onSetCabinetFinishBrush: (f: CabinetFinishId) => void;
  onSetBacksplashBrush: (f: BacksplashFinishId) => void;
  onSetCountertopBrush: (f: CountertopFinishId) => void;
  onSetShelfOrient?: (o: Orientation) => void;
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
  cameraToolbarHost?: HTMLDivElement | null;
  onSelectWallAndBox: (
    wallId: string,
    boxId: string | null,
    doorId?: string | null,
    preserveMulti?: boolean
  ) => void;
  onSetMultiSelection: (m?: MultiSelection) => void;
  onSelectUnit: (wallId: string, unit: { boxId: string; startCm: number; endCm: number } | null) => void;
  onSelectAppliance: (wallId: string, appId: string | null, subPart?: 'gas' | 'hood' | null) => void;
  onSelectSurface?: (surface: 'countertop' | 'backsplash' | null) => void;
  onSelectOpening: (wallId: string, openingId: string | null) => void;
  onSelectColumn?: (columnId: string | null) => void;
  frontCutOrient: Orientation;
  onToggleLightBoxes: (boxIds: string[]) => void;
  onFrontCutOrient: (orientation: Orientation) => void;
  onFrontCut: (wallId: string, boxId: string, x: number, y: number) => void;
  diningSeats: DiningSeats;
  diningShape: 'round' | 'rect';
  onSetDiningSeats: (seats: DiningSeats) => void;
  furnitureKind: FloorFurnitureKind;
  diningRotation: number;
  onPlaceDining: (x: number, y: number) => void;
  onMoveDining: (id: string, x: number, y: number, commit: boolean, angle?: number) => void;
  onSelectDining: (id: string | null) => void;
  onDeleteDining: (id: string) => void;
  onAddRoomColumn?: (xCm: number, yCm: number, commit?: boolean) => RoomColumn | void;
  onUpdateRoomColumn?: (
    colId: string,
    patch: Partial<Pick<RoomColumn, 'xCm' | 'yCm' | 'widthCm' | 'depthCm' | 'heightCm'>>,
    commit?: boolean
  ) => void;
  onDeleteRoomColumn?: (colId: string) => void;
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
  onApplyHardwareKind?: (boxId: string | null, doorIds: string[] | null, hardware: HardwareKind) => void;
  onApplyFinish: (
    target: 'box' | 'all-cabinets' | 'backsplash' | 'countertop',
    wallId?: string,
    boxId?: string,
    overrideId?: string,
    doorId?: string,
  ) => void;
  onPlaceAppliance: (wallId: string, boxId: string, desiredOffsetX: number, kindOverride?: ApplianceKind, desiredElevY?: number) => void;
  onPlaceFridge: (wallId: string, desiredOffsetX: number) => void;
  onPlaceOpening: (wallId: string, desiredOffsetX: number, desiredElevY?: number) => void;
  onMoveOpening?: (wallId: string, openingId: string, offsetX: number, commit: boolean) => void;
  onDeleteOpening: (wallId: string, openingId: string) => void;
  onCreateBoxesFromSweep: (
    segments: SweepSegment[],
    kind: BoxKind,
    suggestedOwners?: Record<string, string>,
    flipOverrides?: Record<string, 1 | -1>
  ) => boolean;
  onConfirmHiddenHandle?: (onConfirm: () => void) => void;
  onExitToSelect: () => void;
  onToast: (msg: string) => void;
}

type Drag3D =
  | { kind: 'resize-unit-divider'; wallId: string; boxId: string; seamCm: number;
      startSeamCm: number; startDot: number; moved?: boolean }
  | { kind: 'move-dining'; diningId: string; offsetXCm: number; offsetYCm: number;
      lastX: number; lastY: number; moved: boolean; rotation: number;
      primaryTouch?: { x: number; y: number };
      rotationTouch?: { id: number; point: { x: number; y: number }; startAngle: number; startRotation: number };
      rotated?: boolean }
  | { kind: 'move-shelf'; wallId: string; boxId: string; shelfId: string; startDot: number; startY: number; dx: number; dy: number }
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
      kind: 'move-opening';
      wallId: string;
      openingId: string;
      origX: number;
      lastTargetX: number;
      startDot: number;
      moved?: boolean;
    }
  | {
      kind: 'move-column';
      columnId: string;
      offsetXCm: number;
      offsetYCm: number;
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
      dx?: number;
      dy?: number;
      startDot: number;
      startY: number;
    }
  | {
      kind: 'resize-drawer';
      wallId: string;
      boxId: string;
      doorId: string;
      edge: 'left' | 'right';
      origW: number;
      startDot: number;
      moved?: boolean;
    }
  | {
      kind: 'resize-door-seam';
      wallId: string;
      boxId: string;
      leftDoorId: string;
      lastDot: number;
      moved?: boolean;
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
  const arSessionRef = useRef<UnifiedARSession | null>(null);
  const lastSessionKillSignal = useRef(props.sessionKillSignal);
  const [arState,setARState] = useState(initialARState);
  const arEditingBlocked = arState.starting || (arState.active && (!arState.floorLocked || arState.calibrating));
  const hostRef = useRef<HTMLDivElement | null>(null);
  const surfaceCursorRef = useRef(new SurfaceCursor());
  const commitPlacementRef = useRef<() => void>(()=>{});
  const cancelPlacementRef = useRef<() => void>(() => {});
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
    windowOkbCm?: number;
    previewDoorWidths?: number[];
  } | null>(null);

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const builtRef = useRef<BuiltKitchenScene | null>(null);
  const geometryKeyRef = useRef<string | null>(null);
  const structuralKeyRef = useRef<string | null>(null);
  const lightingStageRef = useRef(0);
  const progressiveTimersRef = useRef<number[]>([]);
  const lastAoGeometryRef = useRef<string | null>(null);
  const initReflectionsRef = useRef<() => void>(() => {});
  const handleSpotsRef = useRef<HandleSpotOverlaySet | null>(null);
  const ghostGroupRef = useRef<THREE.Group | null>(null);
  const requestRenderRef = useRef<() => void>(() => {});
  const focusAnimRef = useRef<{ target: THREE.Vector3; camPos: THREE.Vector3 } | null>(null);
  const triggerFocusZoomRef = useRef<() => void>(() => {});
  const drag3DRef = useRef<Drag3D | null>(null);
  const downClientRef = useRef<{ x: number; y: number } | null>(null);
  const rightDownClientRef = useRef<{ x: number; y: number } | null>(null);
  const lastHoverCheckRef = useRef<{ x: number; y: number; ts: number }>({ x: 0, y: 0, ts: 0 });
  const gestureStepperRef = useRef(new PacedGestureStepper());
  const camInitDoneRef = useRef(false);
  const doorStatesRef = useRef<Map<string, { cur: number; target: number }>>(new Map());
  const pendingWallStart3DRef = useRef<{ xCm: number; yCm: number } | null>(null);
  const pendingCabDraw3DRef = useRef<CabinetRowDraft | null>(null);
  const clearWallPreviewRef = useRef<() => void>(() => {});
  const updateWallPreviewRef = useRef<(clientX: number, clientY: number) => void>(() => {});
  const updateGhostAndHoverRef = useRef<(clientX: number, clientY: number) => void>(() => {});

  const propsRef = useRef(props);
  propsRef.current = props;

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
    if (!container) return;

    const w = Math.max(320, container.clientWidth);
    const h = Math.max(240, container.clientHeight);

    const touchScreen = window.matchMedia('(pointer: coarse)').matches;
    const renderer = new THREE.WebGLRenderer({
      antialias: !touchScreen,
      alpha: true,
      powerPreference: 'high-performance',
    });
    const isSoftwareGl = detectSoftwareWebGL(renderer.getContext());
    const maxPixelRatio = touchScreen ? 1.25 : 1.5;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, maxPixelRatio));
    renderer.setSize(w, h);
    configureKitchenRenderer(renderer, isSoftwareGl);
    renderer.domElement.setAttribute('data-testid', 'scene-3d-canvas');
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#eaeef3');
    sceneRef.current = scene;
    const lighting = addKitchenLighting(scene, renderer, () => requestRenderRef.current());

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

    const camera = new THREE.PerspectiveCamera(wideViewVerticalFov(wideViewModeRef.current, w / h), w / h, 0.12, 48);
    camera.position.set(3.2, 2.5, 3.8);
    cameraRef.current = camera;
    let reflections: ReturnType<typeof createKitchenReflections> | null = null;
    initReflectionsRef.current = () => {
      if (!reflections && propsRef.current.project.settings?.enableReflections !== false) {
        reflections = createKitchenReflections(renderer, scene, camera);
      }
    };

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.495;
    controls.minDistance = 0.9;
    controls.maxDistance = 18;
    controlsRef.current = controls;

    const surfaceMarker = createSurfaceCursorMarker();
    scene.add(surfaceMarker);

    const floorGrid = new THREE.GridHelper(12, 24, 0xcbd5e1, 0xe2e8f0);
    floorGrid.position.y = -0.02;
    (floorGrid.material as THREE.Material).transparent = true;
    (floorGrid.material as THREE.Material).opacity = 0.52;
    scene.add(floorGrid);

    const originAxes = new THREE.AxesHelper(0.6);
    originAxes.position.y = 0.005;
    scene.add(originAxes);

    let rafId: number | null = null;
    let needsRender = true;
    let lastAimTime = 0;
    let lastAnimTs = performance.now();
    const DOOR_ANIM_DURATION_S = 0.58;

    const renderLoop = (now = performance.now(), xrFrame = false) => {
      rafId = null;
      const dt = Math.min(0.05, Math.max(0.001, (now - lastAnimTs) / 1000));
      lastAnimTs = now;

      let anyDoorMoving = false;
      const built = builtRef.current;
      const ar = arSessionRef.current;
      if (!ar?.active && !renderer.xr.isPresenting) {
        const width=container.clientWidth,height=container.clientHeight;
        const size=renderer.getSize(new THREE.Vector2());
        if(width>0&&height>0&&(size.x!==width||size.y!==height)) {
          camera.aspect=width/height;camera.fov=wideViewVerticalFov(wideViewModeRef.current,camera.aspect);
          camera.updateProjectionMatrix();renderer.setSize(width,height);needsRender=true;
        }
      }
      if (built) built.root.visible = !ar?.active || (ar.locked && !ar.state.kitchenHidden);
      floorGrid.visible = !ar?.active;
      originAxes.visible = !ar?.active;
      if (ar?.active) {
        ar.configureView(wideViewModeRef.current);
        controls.enabled = false;
        if (ar.editingBlocked) { ghostGroup.visible = false; floorWallGroup.visible = false; surfaceMarker.visible = false; }
        else floorWallGroup.visible = true;
      } else floorWallGroup.visible = true;
      if (built && built.animatedDoors.length > 0) {
        const states = doorStatesRef.current;
        for (const h of built.animatedDoors) {
          let st = states.get(h.doorId);
          if (!st) {
            st = { cur: 0, target: 0 };
            states.set(h.doorId, st);
          }
          if (Math.abs(st.target - st.cur) > 0.001) {
            const step = dt / (h.kind === 'lift' || h.kind === 'bifold' ? 1.25 : DOOR_ANIM_DURATION_S);
            if (st.target > st.cur) st.cur = Math.min(st.target, st.cur + step);
            else st.cur = Math.max(st.target, st.cur - step);
            applyAnimatedDoorProgress(h, st.cur);
            needsRender = true;
            if (Math.abs(st.target - st.cur) > 0.001) anyDoorMoving = true;
          }
        }
      }

      let anyFocusMoving = false;
      const fa = focusAnimRef.current;
      if (fa && !ar?.active) {
        const alpha = 1 - Math.exp(-8 * dt);
        controls.target.lerp(fa.target, alpha);
        camera.position.lerp(fa.camPos, alpha);
        controls.update();
        needsRender = true;
        if (
          controls.target.distanceToSquared(fa.target) < 1e-4 &&
          camera.position.distanceToSquared(fa.camPos) < 1e-4
        ) {
          controls.target.copy(fa.target);
          camera.position.copy(fa.camPos);
          controls.update();
          focusAnimRef.current = null;
        } else {
          anyFocusMoving = true;
        }
      }

      if (!ar?.active && controls.enableDamping && !fa) {
        if (controls.update()) needsRender = true;
      }
      if (needsRender || xrFrame) {
        needsRender = false;
        if (!ar?.editingBlocked) updateSurfaceCursorMarker(surfaceMarker, surfaceCursorRef.current);
        else surfaceMarker.visible = false;
        built?.syncOcclusion?.();
        lighting.setIntensities(propsRef.current.project.settings);
        lighting.followCamera(camera);
        if ((!ar?.active || ar.locked) && reflections && propsRef.current.project.settings?.enableReflections !== false) reflections.render();
        else renderer.render(scene, camera);
      }
      if (!ar?.active && rafId === null && (anyDoorMoving || anyFocusMoving)) {
        rafId = requestAnimationFrame(renderLoop);
      }
    };
    const requestRender = () => {
      needsRender = true;
      if (!arSessionRef.current?.active && rafId === null) {
        lastAnimTs = performance.now();
        rafId = requestAnimationFrame(renderLoop);
      }
    };
    requestRenderRef.current = requestRender;
    const arSession = new UnifiedARSession(renderer,scene,camera,controls,{
      change: state => setARState(state),
      ended: () => propsRef.current.onSessionEnded?.(),
      confirmed: () => { cancelPlacementRef.current(); propsRef.current.onFloorConfirmed?.(); },
      frame: time => {
        if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
        // Device aiming updates the SAME placement preview and confirmation path.
        const cur=propsRef.current;
        if(cur.viewportActive!==false && time-lastAimTime>=33 && arSession.locked && !arSession.editingBlocked && !drag3DRef.current && cur.tool!=='select' && cur.tool!=='move') {
          const rect=renderer.domElement.getBoundingClientRect();
          if(rect.width>0&&rect.height>0)pinSurfaceCursor(rect.left+rect.width/2,rect.top+rect.height/2);
          lastAimTime=time;
        }
        renderLoop(time,true);
      },
      render: requestRender,
      toast: text => propsRef.current.onToast(text),
      calibration: (a,b,cm) => propsRef.current.onARCalibration?.(a,b,cm),
    });
    arSessionRef.current=arSession;

    triggerFocusZoomRef.current = () => {
      const built = builtRef.current;
      if (!built || arSession.active) return;
      const focus = computeSelectionFocusTarget3D(built, propsRef.current.project);
      if (!focus) return;
      const radius = Math.max(0.45, focus.size.length() * 0.5);
      const fovRad = THREE.MathUtils.degToRad(camera.fov);
      const dist = Math.max(1.2, Math.min(8.5, (radius / Math.sin(fovRad / 2)) * 1.18));
      const viewDir = camera.position.clone().sub(controls.target);
      if (viewDir.lengthSq() < 1e-4) viewDir.set(0.6, 0.45, 0.8);
      viewDir.normalize();
      const camPos = focus.center.clone().addScaledVector(viewDir, dist);
      camPos.y = Math.max(0.35, camPos.y);
      focusAnimRef.current = { target: focus.center.clone(), camPos };
      requestRender();
    };

    const cancelFocusAnim = () => {
      focusAnimRef.current = null;
    };
    controls.addEventListener('start', cancelFocusAnim);
    controls.addEventListener('change', requestRender);

    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr || cr.width < 10 || cr.height < 10) return;
      if (renderer.xr.isPresenting) return;
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

    const raycastFloorPointCm = (clientX: number, clientY: number, snapCorner = true) => {
      raycaster.setFromCamera(setNdc(clientX, clientY), camera);
      scratchPlane.set(upAxis, 0);
      if (!raycaster.ray.intersectPlane(scratchPlane, scratchHit)) return null;
      const xCm = Math.max(-3000, Math.min(3000, Math.round((scratchHit.x / CM) / 5) * 5));
      const yCm = Math.max(-3000, Math.min(3000, Math.round((scratchHit.z / CM) / 5) * 5));
      if (!snapCorner) return snapDiningPosition(xCm, yCm);
      const cur = propsRef.current;

      if (cur.tool !== 'wall') return { xCm, yCm };
      const start = pendingWallStart3DRef.current;
      const snapped = snapWallDrawingPoint({ x: scratchHit.x / CM, y: scratchHit.z / CM }, cur.project.walls,
        start ? { x: start.xCm, y: start.yCm } : null);
      return { xCm: snapped.x, yCm: snapped.y };
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

    const resolveCabSweepTarget = (
      clientX: number,
      clientY: number,
      fallbackWallId: string,
      boxKind: BoxKind
    ): { wallId: string; xCm: number } | null => {
      const built = builtRef.current;
      const cur = propsRef.current;
      if (!built) return null;
      raycaster.setFromCamera(setNdc(clientX, clientY), camera);
      const hits = raycaster.intersectObjects(built.interactables, false);
      if (hits.length > 0) {
        const hitData = resolveHitData(hits[0].object);
        if (hitData?.wallId) {
          const hitWall = cur.project.walls.find((w) => w.id === hitData.wallId);
          const hitTr = built.wallTransforms.get(hitData.wallId);
          if (hitWall && hitTr) {
            scratchRel.copy(hits[0].point).sub(hitTr.origin);
            const along = scratchRel.dot(hitTr.tangent) / CM;
            return { wallId: hitWall.id, xCm: Math.round(along / 5) * 5 };
          }
        }
      }
      const preset = BOX_PRESETS[boxKind] || BOX_PRESETS.base;
      scratchPlane.set(upAxis, -((preset.elevY + preset.height * 0.45) * CM));
      if (raycaster.ray.intersectPlane(scratchPlane, scratchHit)) {
        const nearWall = projectArPointOntoWalls(
          { x: scratchHit.x, z: scratchHit.z },
          cur.project.walls,
          true,
        );
        if (nearWall) {
          return { wallId: nearWall.wall.id, xCm: nearWall.offsetCm };
        }
      }
      const proj = projectPointerOntoWall(fallbackWallId, clientX, clientY);
      const fbWall = cur.project.walls.find((w) => w.id === fallbackWallId);
      if (proj && fbWall) {
        return {
          wallId: fbWall.id,
          xCm: Math.round(proj.xCm / 5) * 5,
        };
      }
      return null;
    };

    const raycastWithHandleSpots = (clientX: number, clientY: number) => {
      if (!builtRef.current) return { topData: null as Scene3DHitData | null, topPoint: null as THREE.Vector3 | null };
      raycaster.setFromCamera(setNdc(clientX, clientY), camera);
      if (
        propsRef.current.tool === 'handle' &&
        handleSpotsRef.current &&
        handleSpotsRef.current.spotInteractables.length > 0
      ) {
        const spotHits = raycaster.intersectObjects(handleSpotsRef.current.spotInteractables, false);
        if (spotHits.length > 0) {
          const sd = resolveHitData(spotHits[0].object);
          if (sd) return { topData: sd, topPoint: spotHits[0].point.clone() };
        }
      }
      const hits = raycaster.intersectObjects(builtRef.current.interactables, false);
      if (!hits.length) return { topData: null, topPoint: null };
      return { topData: resolveHitData(hits[0].object), topPoint: hits[0].point.clone() };
    };

    let furnitureGhostKey = '';
    const updateGhostAndHover = (clientX: number, clientY: number) => {
      const curTool = propsRef.current.tool;
      if (curTool === 'wall') {
        handleSpotsRef.current?.setHoveredSpot(null);
        clearGhost();
        setHoverPreview({ clientX, clientY, hoverTarget: null, targetStatus: 'valid' });
        updateWallFloorPreview(clientX, clientY);
        return;
      }
      clearWallFloorPreview();
      if (!builtRef.current) {
        handleSpotsRef.current?.setHoveredSpot(null);
        clearGhost();
        setHoverPreview({ clientX, clientY, hoverTarget: null, targetStatus: 'neutral' });
        return;
      }
      const cur = propsRef.current;

      if (curTool === 'dining') {
        const point = raycastFloorPointCm(clientX, clientY, false);
        if (!point) { clearGhost(); furnitureGhostKey = ''; return; }
        const key = cur.furnitureKind + ':' + cur.diningSeats + ':' + cur.diningShape;
        if (!ghostGroup.visible || furnitureGhostKey !== key) {
          disposeGhostChildren();
          ghostGroup.add(buildDiningFootprint3D(cur.diningSeats, cur.furnitureKind, cur.diningShape));
          furnitureGhostKey = key;
        }
        ghostGroup.position.set(point.xCm * CM, 0, point.yCm * CM);
        ghostGroup.rotation.set(0, -cur.diningRotation * Math.PI / 180, 0);
        ghostGroup.visible = true;
        requestRender();
        return;
      }
      furnitureGhostKey = '';

      // Active 2-click multi-wall cab-draw sweep tracks across connected walls around corners!
      const pendingSweep = pendingCabDraw3DRef.current;
      if (cur.tool === 'cab-draw' && pendingSweep) {
        const target = resolveCabSweepTarget(clientX, clientY, pendingSweep.starter.wallId, pendingSweep.kind);
        if (target) {
          const kindNow = pendingSweep.kind;
          const preset = BOX_PRESETS[kindNow] || BOX_PRESETS.base;
          const placement = previewCabinetRow(cur.project, pendingSweep, target.wallId, target.xCm);
          const totalWidthCm = placement.segments.reduce((sum, seg) => sum + seg.widthCm, 0);
          disposeGhostChildren();
          ghostGroup.position.set(0, 0, 0);
          ghostGroup.quaternion.identity();

          let renderedAny = false;
          for (const seg of placement.segments) {
            const segTr = builtRef.current.wallTransforms.get(seg.wallId);
            if (!segTr) continue;
            const segGrp = new THREE.Group();
            segGrp.position.copy(segTr.origin);
            basisMat.makeBasis(segTr.tangent, upAxis, segTr.rightVec);
            segGrp.quaternion.setFromRotationMatrix(basisMat);

            const boxH =
              kindNow === 'base'
                ? cur.project.settings?.baseHeightCm ?? preset.height
                : kindNow === 'wall'
                ? cur.project.settings?.wallCabHeightCm ?? preset.height
                : preset.height;
            const boxElev =
              kindNow === 'wall' ? cur.project.settings?.wallCabElevCm ?? preset.elevY : preset.elevY;

            const geo = new THREE.BoxGeometry(
              Math.max(0.02, seg.widthCm * CM),
              Math.max(0.02, boxH * CM),
              Math.max(0.015, preset.depth * CM)
            );
            const mesh = new THREE.Mesh(geo, placement.valid ? ghostMatIndigo : ghostMatDanger);
            mesh.position.set(
              (seg.startCm + seg.widthCm / 2) * CM,
              (boxElev + boxH / 2) * CM,
              segTr.normalSign * (preset.depth / 2) * CM
            );
            segGrp.add(mesh);
            const edges = new THREE.EdgesGeometry(geo);
            const line = new THREE.LineSegments(edges, ghostMatWire);
            line.position.copy(mesh.position);
            segGrp.add(line);

            if (seg.wallId === pendingSweep.starter.wallId) {
              const pinGeo = new THREE.BoxGeometry(0.028, Math.max(0.05, boxH * CM + 0.04), 0.028);
              const pinMesh = new THREE.Mesh(pinGeo, ghostMatTeal);
              pinMesh.position.set(
                pendingSweep.starter.startCm * CM,
                (boxElev + boxH / 2) * CM,
                segTr.normalSign * (preset.depth + 2) * CM
              );
              segGrp.add(pinMesh);
            }
            ghostGroup.add(segGrp);
            renderedAny = true;
          }

          ghostGroup.visible = renderedAny;
          setHoverPreview({
            clientX,
            clientY,
            hoverTarget: null,
            targetStatus: placement.valid ? 'valid' : 'invalid',
            sweepWidthCm: totalWidthCm,
          });
          requestRender();
          return;
        }
        clearGhost();
        setHoverPreview({ clientX, clientY, hoverTarget: null, targetStatus: 'invalid' });
        return;
      }

      const { topData: data, topPoint } = raycastWithHandleSpots(clientX, clientY);
      if (cur.tool === 'handle') {
        handleSpotsRef.current?.setHoveredSpot(data?.kind === 'handle-spot' ? data.spotId || null : null);
      } else {
        handleSpotsRef.current?.setHoveredSpot(null);
      }

      if (!data || !topPoint) {
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

      scratchRel.copy(topPoint).sub(tr.origin);
      const hitXCm = Math.max(0, Math.min(wall.length, scratchRel.dot(tr.tangent) / CM));
      const hitYCm = Math.max(0, Math.min(wall.height, topPoint.y / CM));

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
      let previewWindowOkbCm: number | undefined;
      let previewDoorWidths: number[] | undefined;

      if (cur.tool === 'front-cut') {
        const box = wall.boxes.find(item => item.id === data.boxId);
        const zones = getCornerBlockedZonesForWall(wall, cur.project.walls, cur.project.cornerOwners);
        const cut = box && findFrontCut(wall, box, cur.frontCutOrient, scratchRel.dot(tr.tangent) / CM, hitYCm, zones);
        targetStatus = cut ? 'valid' : 'neutral';
        if (box && cut) {
          const vertical = cut.orientation === 'vertical';
          addGhostBox(vertical ? cut.at - 0.25 : cut.x1, vertical ? cut.y1 : cut.at - 0.25, box.depth + 2,
            vertical ? 0.5 : cut.x2 - cut.x1, vertical ? cut.y2 - cut.y1 : 0.5, 0.5,
            cut.snapped ? ghostMatTeal : ghostMatIndigo);
          hasGhost = true;
        }
      } else if (cur.tool === 'cab-draw') {
        const kind = cur.drawBoxKind;
        const preset = BOX_PRESETS[kind] || BOX_PRESETS.base;
        const draft = startCabinetRow(cur.project, wall, hitXCm, kind);
        targetStatus = draft ? 'valid' : 'invalid';
        if (draft) {
          const { starter } = draft;
          const height = kind === 'base' ? cur.project.settings?.baseHeightCm ?? preset.height
            : kind === 'wall' ? cur.project.settings?.wallCabHeightCm ?? preset.height : preset.height;
          const elev = kind === 'wall' ? cur.project.settings?.wallCabElevCm ?? preset.elevY : preset.elevY;
          addGhostBox(starter.startCm, elev, 0, starter.widthCm, height, preset.depth, ghostMatIndigo);
          hasGhost = true;
          previewSweepWidth = starter.widthCm;
        }
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
        if (cur.openingKind === 'window') previewWindowOkbCm = elev;
      } else if (cur.tool === 'sink' || cur.tool === 'gas' || cur.tool === 'appliance') {
        const kind = cur.tool === 'sink' ? 'sink' : cur.tool === 'gas' ? 'gas' : cur.applianceKind;
        const allowTall = kind === 'builtin-oven' || kind === 'microwave';
        const matchBoxType = (b: CabinetBox) => b.type === 'base' || (allowTall && b.type === 'tall');
        const targetBox =
          (data.boxId ? wall.boxes.find((b) => b.id === data.boxId && matchBoxType(b)) : undefined) ||
          wall.boxes.find((b) => matchBoxType(b) && hitXCm >= b.offsetX - 5 && hitXCm <= b.offsetX + b.width + 5);
        if (targetBox) {
          const tw =
            kind === 'sink'
              ? SINK_MODELS[cur.sinkModel].width
              : kind === 'gas'
              ? cur.gasWidth
              : APPLIANCE_CONFIGS[kind].width;
          const startCm = Math.max(
            targetBox.offsetX,
            Math.min(targetBox.offsetX + targetBox.width - tw, Math.round((hitXCm - tw / 2) / 5) * 5)
          );
          const topY = targetBox.elevY + targetBox.height;
          if (kind === 'sink' || kind === 'gas') {
            const appDepthCm = kind === 'gas' ? 48 : 50;
            const appZStart = Math.max(2, (targetBox.depth - appDepthCm) / 2);
            const appH = kind === 'gas' ? 5 : 4;
            addGhostBox(startCm, topY, appZStart, tw, appH, appDepthCm, ghostMatTeal);
          } else if (allowTall && targetBox.type === 'tall') {
            const appH = APPLIANCE_CONFIGS[kind].heightCm ?? (kind === 'microwave' ? 38 : 60);
            const minE = targetBox.plinth + 15;
            const maxE = Math.max(minE, targetBox.height - appH - 12);
            const snapE = Math.round(Math.max(minE, Math.min(maxE, hitYCm - appH / 2)) / 5) * 5;
            addGhostBox(startCm, snapE, 0, tw, appH, targetBox.depth + 2, ghostMatIndigo);
          } else {
            addGhostBox(startCm, targetBox.plinth, 0, tw, topY - targetBox.countertopCm - targetBox.plinth, targetBox.depth + 2, ghostMatIndigo);
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
            previewDoorWidths = prev.items.map((it) => Math.round(it.widthCm));
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
          let rowCenterNorm = 0.5;
          let rowH = innerH;
          let xRatio = 0.5;

          if (
            data.kind === 'handle-spot' &&
            data.xRatio !== undefined &&
            data.yRatio !== undefined
          ) {
            if ((door.kind === 'drawer' || door.kind === 'lift') && door.drawerRatios.length > 0) {
              const pts = [0, ...door.drawerRatios, 1];
              const ri = Math.max(0, Math.min(pts.length - 2, data.rowIndex ?? 0));
              rowH = (pts[ri + 1] - pts[ri]) * innerH;
              rowCenterNorm = pts[ri] + data.yRatio * (pts[ri + 1] - pts[ri]);
            } else {
              rowCenterNorm = data.yRatio;
            }
            xRatio = data.xRatio;
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
              const midDoorCm = door.startCm + door.widthCm / 2;
              xRatio = localX >= midDoorCm ? 0.86 : 0.14;
            }
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
            tr.normalSign * (box.depth + 2.4) * CM
          );
          ghostGroup.add(hMesh);
          hasGhost = true;
          targetStatus = 'valid';
        }
      } else if (cur.tool === 'hardware' && data.boxId && data.doorId) {
        targetStatus = 'valid';
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
      } else if ((cur.tool === 'pencil' || cur.tool === 'skeleton') && data.boxId) {
        targetStatus = 'valid';
      } else if (cur.tool === 'frame' && data.boxId) {
        const box = wall.boxes.find((b) => b.id === data.boxId);
        if (box) {
          const clickCm = hitXCm - box.offsetX;
          const fw = cur.frameWidthCm || 5;
          const topEdge = box.elevY + box.height;
          const botEdge = box.elevY + box.plinth;
          if (Math.abs(clickCm) <= 10) {
            addGhostBox(box.offsetX, box.elevY, 0, fw, box.height, box.depth + 2, ghostMatTeal);
          } else if (Math.abs(box.width - clickCm) <= 10) {
            addGhostBox(box.offsetX + box.width - fw, box.elevY, 0, fw, box.height, box.depth + 2, ghostMatTeal);
          } else if (Math.abs(topEdge - hitYCm) <= 12) {
            addGhostBox(box.offsetX, box.elevY + box.height - fw, 0, box.width, fw, box.depth + 2, ghostMatTeal);
          } else if (Math.abs(hitYCm - botEdge) <= 12) {
            addGhostBox(box.offsetX, box.elevY + box.plinth, 0, box.width, fw, box.depth + 2, ghostMatTeal);
          } else {
            addGhostBox(hitXCm - fw / 2, box.elevY, 0, fw, box.height, box.depth + 2, ghostMatTeal);
          }
          hasGhost = true;
          targetStatus = 'valid';
        }
      }

      setHoverPreview({
        clientX,
        clientY,
        hoverTarget: finishTarget,
        targetStatus,
        ...(previewSweepWidth !== undefined ? { sweepWidthCm: previewSweepWidth } : {}),
        ...(previewWindowOkbCm !== undefined ? { windowOkbCm: previewWindowOkbCm } : {}),
        ...(previewDoorWidths !== undefined ? { previewDoorWidths } : {}),
      });
      ghostGroup.visible = hasGhost;
      requestRender();
    };

    updateGhostAndHoverRef.current = updateGhostAndHover;


    const pinSurfaceCursor = (clientX:number,clientY:number) => {
      raycaster.setFromCamera(setNdc(clientX,clientY),camera);
      builtRef.current?.root.updateWorldMatrix(true,true);
      const hit=builtRef.current ? raycaster.intersectObjects(builtRef.current.interactables,false)[0] : null;
      if(hit && propsRef.current.tool !== 'dining') {
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

    let dragPointerId: number | null = null;
    const beginModelDrag = (pointerId: number) => {
      dragPointerId = pointerId;
      propsRef.current.onBeginDrag();
    };
    const cancelModelDrag = () => {
      const pointerId = dragPointerId;
      if (pointerId === null) return;
      dragPointerId = null;
      drag3DRef.current = null;
      propsRef.current.onCancelDrag();
      if (dom.hasPointerCapture(pointerId)) dom.releasePointerCapture(pointerId);
    };

    const angleBetween = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.atan2(b.y - a.y, b.x - a.x);

    const onPointerDown = (e: PointerEvent) => {
      if(arSession.pointerDown(e)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (dragPointerId !== null) {
        const drag = drag3DRef.current;
        if (e.pointerType === 'touch' && drag?.kind === 'move-dining' && drag.primaryTouch && !drag.rotationTouch) {
          e.preventDefault();
          e.stopImmediatePropagation();
          const point = { x: e.clientX, y: e.clientY };
          drag.rotationTouch = { id: e.pointerId, point,
            startAngle: angleBetween(drag.primaryTouch, point), startRotation: drag.rotation };
        }
        return;
      }
      if (e.pointerType === 'touch' && propsRef.current.tool !== 'select' && propsRef.current.tool !== 'move' && propsRef.current.tool !== 'finish') {
        e.preventDefault();
        e.stopImmediatePropagation();
        controls.enabled = false;
        if (!surfaceCursorRef.current.begin(e.pointerId, e.clientX, e.clientY)) return;
        if (!surfaceCursorRef.current.point) pinSurfaceCursor(e.clientX, e.clientY);
        try {
          renderer.domElement.setPointerCapture(e.pointerId);
        } catch {}
        return;
      }
      if (e.button === 2) {
        rightDownClientRef.current = { x: e.clientX, y: e.clientY };
        return;
      }
      if (e.button !== 0 || !builtRef.current) return;
      downClientRef.current = { x: e.clientX, y: e.clientY };
      if (propsRef.current.tool === 'finish') { e.stopImmediatePropagation(); return; }
      if (propsRef.current.tool === 'wall' || propsRef.current.tool === 'dining' ||
        (propsRef.current.tool === 'select' && propsRef.current.selectionMode === 'single')) return;

      const cur = propsRef.current;

      raycaster.setFromCamera(setNdc(e.clientX, e.clientY), camera);
      const hits = raycaster.intersectObjects(builtRef.current.interactables, false);
      if (!hits.length) {
        if (cur.tool === 'select' && cur.project.selectedDiningId) cur.onSelectDining(null);
        return;
      }

      const topHit = hits[0];
      const data = resolveHitData(topHit.object);
      if (!data) return;
      const moveActive = cur.tool === 'move';
      if (cur.tool === 'select' || moveActive) {
        const item = data.kind === 'dining' ? cur.project.diningSets?.find(d => d.id === data.diningId) : null;
        if (item) {
          cur.onSelectDining(item.id);
          if (!moveActive) return;
          const floor = raycastFloorPointCm(e.clientX, e.clientY, false);
          if (floor) {
            controls.enabled = false;
            e.stopImmediatePropagation();
            try { dom.setPointerCapture(e.pointerId); } catch {}
            beginModelDrag(e.pointerId);
            drag3DRef.current = { kind: 'move-dining', diningId: item.id,
              offsetXCm: item.xCm - floor.xCm, offsetYCm: item.yCm - floor.yCm,
              lastX: item.xCm, lastY: item.yCm, moved: false, rotation: item.rotation,
              primaryTouch: e.pointerType === 'touch' ? { x: e.clientX, y: e.clientY } : undefined };
          }
          return;
        }
        if (cur.project.selectedDiningId) cur.onSelectDining(null);
      }

      if ((cur.tool === 'select' || moveActive) && data.kind === 'column' && data.columnId) {
        cur.onSelectColumn?.(data.columnId);
        if (!moveActive) return;
        const col = (cur.project.columns || []).find((c) => c.id === data.columnId);
        const floorPt = raycastFloorPointCm(e.clientX, e.clientY);
        if (col && floorPt) {
          controls.enabled = false;
          e.stopPropagation();
          try {
            dom.setPointerCapture(e.pointerId);
          } catch {}
          beginModelDrag(e.pointerId);
          drag3DRef.current = {
            kind: 'move-column',
            columnId: col.id,
            offsetXCm: col.xCm - floorPt.xCm,
            offsetYCm: col.yCm - floorPt.yCm,
            moved: false,
          };
        }
        return;
      }

      const wall = cur.project.walls.find((x) => x.id === data.wallId);
      if (!wall) return;

      const wallProj = projectPointerOntoWall(data.wallId, e.clientX, e.clientY);

      if (data.kind === 'appliance' && data.appId && (cur.tool === 'select' || moveActive)) {
        const app = wall.appliances.find((a) => a.id === data.appId);
        if (app) {
          cur.onSelectAppliance(wall.id, app.id, data.subPart ?? null);
          if (!moveActive || !wallProj) return;
          controls.enabled = false;
          e.stopPropagation();
          try {
            dom.setPointerCapture(e.pointerId);
          } catch {}
          beginModelDrag(e.pointerId);
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

      if (cur.tool === 'select' || moveActive) {
        if (moveActive && data.kind === 'drawer-resize-handle' && data.boxId && data.doorId && data.edge && wallProj) {
          const box = wall.boxes.find((b) => b.id === data.boxId);
          const door = box?.doors.find((d) => d.id === data.doorId);
          if (box && door && door.kind === 'drawer') {
            controls.enabled = false;
            e.stopPropagation();
            try {
              dom.setPointerCapture(e.pointerId);
            } catch {}
            beginModelDrag(e.pointerId);
            drag3DRef.current = {
              kind: 'resize-drawer',
              wallId: wall.id,
              boxId: box.id,
              doorId: door.id,
              edge: data.edge,
              origW: door.widthCm,
              startDot: wallProj.xCm,
              moved: false,
            };
          }
          return;
        }
        if (moveActive && data.kind === 'door-seam-handle' && data.boxId && data.leftDoorId && wallProj) {
          controls.enabled = false;
          e.stopPropagation();
          try {
            dom.setPointerCapture(e.pointerId);
          } catch {}
          beginModelDrag(e.pointerId);
          drag3DRef.current = {
            kind: 'resize-door-seam',
            wallId: wall.id,
            boxId: data.boxId,
            leftDoorId: data.leftDoorId,
            lastDot: wallProj.xCm,
            moved: false,
          };
          return;
        }
        if (moveActive && data.kind === 'box-handle' && data.boxId && data.handleSide && wallProj) {
          const box = wall.boxes.find((b) => b.id === data.boxId);
          if (box) {
            controls.enabled = false;
            e.stopPropagation();
            try {
              dom.setPointerCapture(e.pointerId);
            } catch {}
            beginModelDrag(e.pointerId);
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
          if (moveActive && wallProj) {
            controls.enabled = false;
            e.stopImmediatePropagation();
            try { dom.setPointerCapture(e.pointerId); } catch {}
            beginModelDrag(e.pointerId);
            drag3DRef.current = { kind: 'resize-unit-divider',
              wallId: wall.id, boxId: data.boxId, seamCm: data.seamCm,
              startSeamCm: data.seamCm, startDot: wallProj.xCm };
          }
          return;
        }
        if (data.kind === 'opening' && data.openingId) {
          cur.onSelectOpening(wall.id, data.openingId);
          const op = wall.openings?.find((o) => o.id === data.openingId);
          if (moveActive && op && wallProj) {
            controls.enabled = false;
            e.stopPropagation();
            try {
              dom.setPointerCapture(e.pointerId);
            } catch {}
            beginModelDrag(e.pointerId);
            drag3DRef.current = {
              kind: 'move-opening',
              wallId: wall.id,
              openingId: op.id,
              origX: op.offsetX,
              lastTargetX: op.offsetX,
              startDot: wallProj.xCm,
              moved: false,
            };
          }
          return;
        }
        if (cur.tool === 'select' && (data.kind === 'countertop' || data.kind === 'backsplash')) {
          cur.onSelectSurface?.(data.kind);
          return;
        }
        if (
          data.boxId &&
          (data.kind === 'box' ||
            data.kind === 'door' ||
            (moveActive && data.kind === 'countertop') ||
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
            if (moveActive && wallProj) {
              controls.enabled = false;
              e.stopPropagation();
              try { dom.setPointerCapture(e.pointerId); } catch {}
              beginModelDrag(e.pointerId);
              drag3DRef.current = { kind: 'move-shelf', wallId: wall.id, boxId: data.boxId, shelfId: data.shelfId,
                startDot: wallProj.xCm, startY: wallProj.yCm, dx: 0, dy: 0 };
            }
            return;
          } else if (data.kind === 'handle' && data.handleId) {
            cur.onSelectHandle(wall.id, data.boxId, data.handleId);
          } else {
            cur.onSelectWallAndBox(wall.id, data.boxId, data.doorId ?? null);
          }

          if (moveActive && box && wallProj) {
            controls.enabled = false;
            e.stopPropagation();
            try {
              dom.setPointerCapture(e.pointerId);
            } catch {}
            beginModelDrag(e.pointerId);
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
      if(propsRef.current.viewportActive===false)return;
      if(arSession.pointerMove(e) || arSession.editingBlocked) return;
      const diningDrag = drag3DRef.current;
      if (diningDrag?.kind === 'move-dining' && diningDrag.primaryTouch) {
        const point = { x: e.clientX, y: e.clientY };
        if (e.pointerId === dragPointerId) diningDrag.primaryTouch = point;
        const touch = diningDrag.rotationTouch;
        if (touch) {
          if (e.pointerId === touch.id) touch.point = point;
          if (e.pointerId === touch.id || e.pointerId === dragPointerId) {
            const radians = angleBetween(diningDrag.primaryTouch, touch.point) - touch.startAngle;
            diningDrag.rotation = touch.startRotation + radians * 180 / Math.PI;
            diningDrag.rotated = true;
            propsRef.current.onMoveDining(diningDrag.diningId, diningDrag.lastX, diningDrag.lastY, false, diningDrag.rotation);
          }
          return;
        }
      }
      if (dragPointerId !== null && e.pointerId !== dragPointerId) return;
      if(e.pointerType === 'touch' && surfaceCursorRef.current.dragging) {
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

      if (dr.kind === 'move-dining') {
        const floor = raycastFloorPointCm(e.clientX, e.clientY, false);
        if (floor) {
          const target = snapDiningPosition(floor.xCm + dr.offsetXCm, floor.yCm + dr.offsetYCm);
          if (target.xCm !== dr.lastX || target.yCm !== dr.lastY) {
            dr.lastX = target.xCm;
            dr.lastY = target.yCm;
            dr.moved = true;
            propsRef.current.onMoveDining(dr.diningId, target.xCm, target.yCm, false);
          }
        }
        return;
      }

      if (dr.kind === 'move-column') {
        const floorPt = raycastFloorPointCm(e.clientX, e.clientY);
        if (floorPt) {
          dr.moved = true;
          propsRef.current.onUpdateRoomColumn?.(
            dr.columnId,
            { xCm: floorPt.xCm + dr.offsetXCm, yCm: floorPt.yCm + dr.offsetYCm },
            false
          );
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
      } else if (dr.kind === 'move-opening') {
        if (!dr.moved && pointerMovedPx < 5 && Math.abs(proj.xCm - dr.startDot) < 2.5) return;
        dr.moved = true;
        const dx = Math.round((proj.xCm - dr.startDot) / 5) * 5;
        const target = Math.max(0, dr.origX + dx);
        if (target !== dr.lastTargetX) {
          dr.lastTargetX = target;
          cur.onMoveOpening?.(dr.wallId, dr.openingId, target, false);
        }
      } else if (dr.kind === 'resize-box' || dr.kind === 'move-shelf') {
        const dx = Math.round(proj.xCm - dr.startDot);
        const dy = Math.round(proj.yCm - dr.startY);
        if (dx === dr.dx && dy === dr.dy) return;
        dr.dx = dx;
        dr.dy = dy;
        if (dr.kind === 'resize-box') cur.onResizeCabinet(dr.wallId, dr.boxId, dr.side, dx, dy, false);
        else cur.onMoveShelf(dr.wallId, dr.boxId, dr.shelfId, dx, dy, false);
      } else if (dr.kind === 'resize-drawer') {
        const dxCm = Math.round(proj.xCm - dr.startDot);
        const desiredW = dr.edge === 'left' ? dr.origW - dxCm : dr.origW + dxCm;
        dr.moved = true;
        cur.onMutateWallById(
          dr.wallId,
          (w) => {
            const b = w.boxes.find((x) => x.id === dr.boxId);
            if (!b) return;
            const blocked = getCornerBlockedZonesForWall(w, cur.project.walls, cur.project.cornerOwners);
            resizeDrawerUnitWidthCm(b, dr.doorId, dr.edge, desiredW, blocked);
          },
          false
        );
      } else if (dr.kind === 'resize-unit-divider') {
        if (!dr.moved && pointerMovedPx < 5) return;
        const target = dr.startSeamCm + Math.round(proj.xCm - dr.startDot);
        if (Math.abs(target - dr.seamCm) < 1) return;
        let seamCm = dr.seamCm;
        cur.onMutateWallById(dr.wallId, w => {
          const box = w.boxes.find(item => item.id === dr.boxId);
          if (!box) return;
          const blocked = getCornerBlockedZonesForWall(w, cur.project.walls, cur.project.cornerOwners);
          const result = resizeUnitDividerWithDoorsSync(box, dr.seamCm, target, blocked);
          if (result?.ok) seamCm = result.seamCm;
        }, false);
        if (seamCm !== dr.seamCm) {
          dr.moved = true;
          dr.seamCm = seamCm;
          cur.onSelectUnitDivider(dr.wallId, { boxId: dr.boxId, seamCm });
        }
      } else if (dr.kind === 'resize-door-seam') {
        const deltaCm = Math.round(proj.xCm - dr.lastDot);
        if (Math.abs(deltaCm) >= 1) {
          dr.moved = true;
          let applied = 0;
          cur.onMutateWallById(
            dr.wallId,
            (w) => {
              const b = w.boxes.find((x) => x.id === dr.boxId);
              if (!b) return;
              applied = resizeDoorSeamCoupled(b, dr.leftDoorId, deltaCm);
            },
            false
          );
          if (applied !== 0) {
            dr.lastDot += applied;
          }
        }
      }
    };

    const doorTap = new DoorTapSequence();
    const hobTap = new DoorTapSequence();
    /** A hob requires two deliberate taps for BOTH on and off. Single tap
     * only selects it, and the state persists in the shared CAD project. */
    const onHobTap = (e: PointerEvent): boolean => {
      const built = builtRef.current;
      const cur = propsRef.current;
      if (!built || cur.selectionMode !== 'single') { hobTap.reset(); return false; }
      built.root.updateWorldMatrix(true, true);
      raycaster.setFromCamera(setNdc(e.clientX, e.clientY), camera);
      const hit = raycaster.intersectObjects(built.interactables, false)[0];
      const data = hit && resolveHitData(hit.object);
      if (data?.kind !== 'appliance' || data.subPart !== 'gas' || !data.appId) {
        hobTap.reset();
        return false;
      }
      const wall = cur.project.walls.find(w => w.id === data.wallId);
      const item = wall?.appliances.find(a => a.id === data.appId && a.kind === 'gas');
      if (!item) { hobTap.reset(); return false; }
      if (hobTap.next('hob:' + item.id, false, e.pointerType, e.timeStamp, e.clientX, e.clientY) !== 1) return false;
      const nextLit = !Boolean(item.flameOn);
      cur.onMutateWallById(data.wallId, w => {
        const gas = w.appliances.find(a => a.id === item.id && a.kind === 'gas');
        if (gas) gas.flameOn = nextLit;
      }, true, nextLit ? 'گاز روشن شد' : 'گاز خاموش شد');
      e.preventDefault();
      return true;
    };
    const onDoorTap = (e: PointerEvent) => {
      const built = builtRef.current;
      if (!built || propsRef.current.selectionMode !== 'single') return doorTap.reset();
      built.root.updateWorldMatrix(true, true);
      raycaster.setFromCamera(setNdc(e.clientX, e.clientY), camera);
      const hit = raycaster.intersectObjects(built.interactables, false)[0];
      const data = hit && resolveHitData(hit.object);
      if (!data?.doorId || (data.kind !== 'door' && data.kind !== 'handle')) return doorTap.reset();
      const partId = data.animationId || data.doorId;
      const states = doorStatesRef.current;
      const state = states.get(partId) ?? { cur: 0, target: 0 };
      const target = doorTap.next(partId, state.target > 0.5, e.pointerType, e.timeStamp, e.clientX, e.clientY);
      if (target === null) return;
      if (!built.animatedDoors.some(part => part.doorId === partId)) {
        propsRef.current.onToast('ابتدا روی همین در یا کشو دستگیره بگذارید');
        return;
      }
      states.set(partId, { cur: state.cur, target });
      setDoorsOpen([...states.values()].some(part => part.target > 0.5));
      requestRender();
      return true;
    };

    const select3DAt = (e: PointerEvent) => {
      const cur = propsRef.current;
      const built = builtRef.current!;
      raycaster.setFromCamera(setNdc(e.clientX, e.clientY), camera);
      const hits = raycaster.intersectObjects(built.interactables, false);
      const choices: PickCandidate[] = [];
      let wallFallback: PickCandidate | undefined;
      for (const hit of hits) {
        const d = resolveHitData(hit.object);
        if (!d) continue;
        const wall = cur.project.walls.find(w => w.id === d.wallId);
        const box = wall?.boxes.find(b => b.id === d.boxId);
        const app = wall?.appliances.find(a => a.id === d.appId);
        if (d.kind === 'dining' && d.diningId) {
          const item = cur.project.diningSets?.find(i => i.id === d.diningId);
          if (item) choices.push({ id: 'dining:' + item.id, label: item.kind === 'tv' ? 'ست تلویزیون' : 'میز ناهارخوری',
            icon: 'dining', select: () => cur.onSelectDining(item.id) });
        } else if (d.kind === 'column' && d.columnId && cur.onSelectColumn) {
          choices.push({ id: 'column:' + d.columnId, label: 'ستون', icon: 'box', select: () => cur.onSelectColumn!(d.columnId!) });
        } else if (!wall) continue;
        else if (d.kind === 'appliance' && app) {
          choices.push({ id: 'app:' + app.id + ':' + (d.subPart ?? ''), icon: d.subPart === 'hood' ? 'hood' : app.kind,
            label: d.subPart === 'hood' ? 'هود' : APPLIANCE_CONFIGS[app.kind].shortLabel,
            select: () => cur.onSelectAppliance(wall.id, app.id, d.subPart) });
        } else if (d.kind === 'opening' && d.openingId) {
          const opening = wall.openings?.find(o => o.id === d.openingId);
          choices.push({ id: 'opening:' + d.openingId, icon: 'opening', label: opening?.kind === 'window' ? 'پنجره' : 'بازشو',
            select: () => cur.onSelectOpening(wall.id, d.openingId!) });
        } else if ((d.kind === 'countertop' || d.kind === 'backsplash') && cur.onSelectSurface) {
          const surface = d.kind;
          choices.push({ id: 'surface:' + surface, icon: 'surface', label: surface === 'countertop' ? 'صفحهٔ کابینت' : 'بین کابینتی',
            select: () => cur.onSelectSurface!(surface) });
        } else if (d.kind === 'wall') {
          wallFallback ??= { id: 'wall:' + wall.id, icon: 'box', label: 'دیوار',
            select: () => cur.onSelectWallAndBox(wall.id, null, null) };
        } else if (box) {
          if (d.kind === 'box') choices.push({ id: 'box:' + box.id, icon: box.type === 'fridge' ? 'fridge' : 'box',
            label: box.name, select: () => cur.onSelectWallAndBox(wall.id, box.id, null) });
          else if (d.kind === 'door' && d.doorId && box.type !== 'fridge') {
            const door = box.doors.find(item => item.id === d.doorId);
            choices.push({ id: 'door:' + d.doorId, icon: 'door', label: door?.kind === 'drawer' ? 'کشو' : 'در کابینت',
              select: () => cur.onSelectWallAndBox(wall.id, box.id, d.doorId) });
          } else if (d.kind === 'handle' && d.handleId) {
            choices.push({ id: 'handle:' + d.handleId, icon: 'handle', label: 'دستگیره',
              select: () => cur.onSelectHandle(wall.id, box.id, d.handleId!) });
          } else if (d.kind === 'frame' && d.frameId) {
            choices.push({ id: 'frame:' + d.frameId, icon: 'detail', label: 'فریم',
              select: () => cur.onSelectFrame(wall.id, box.id, d.frameId!) });
          } else if (d.kind === 'shelf' && d.shelfId) {
            choices.push({ id: 'shelf:' + d.shelfId, icon: 'detail', label: 'طبقه',
              select: () => cur.onSelectShelf(wall.id, box.id, d.shelfId!) });
          } else if (d.kind === 'unit' && d.unitStart !== undefined && d.unitEnd !== undefined) {
            const unit = { boxId: box.id, startCm: d.unitStart, endCm: d.unitEnd };
            choices.push({ id: 'unit:' + box.id + ':' + unit.startCm, icon: 'detail', label: 'یونیت',
              select: () => cur.onSelectUnit(wall.id, unit) });
          } else if (d.kind === 'unit-div' && d.seamCm !== undefined) {
            const divider = { boxId: box.id, seamCm: d.seamCm };
            choices.push({ id: 'divider:' + box.id + ':' + divider.seamCm, icon: 'detail', label: 'جداکنندهٔ یونیت',
              select: () => cur.onSelectUnitDivider(wall.id, divider) });
          }
        }
      }
      const top = hits[0] && resolveHitData(hits[0].object);
      if (top?.kind === 'under-cabinet-light' && top.lightBoxIds) {
        cur.onToggleLightBoxes(top.lightBoxIds);
        return;
      }
      if (!choices.length && wallFallback) choices.push(wallFallback);
      if (!cur.offerSelection(e.clientX, e.clientY, choices)) {
        cur.onSelectDining(null);
        cur.onSelectWallAndBox(cur.project.activeWallId || '', null, null);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if(propsRef.current.viewportActive===false)return;
      if(arSession.pointerUp(e) || arSession.editingBlocked) return;
      const diningDrag = drag3DRef.current;
      if (diningDrag?.kind === 'move-dining' && diningDrag.rotationTouch?.id === e.pointerId) {
        diningDrag.rotationTouch = undefined;
        const finger = diningDrag.primaryTouch;
        const floor = finger && raycastFloorPointCm(finger.x, finger.y, false);
        if (floor) {
          diningDrag.offsetXCm = diningDrag.lastX - floor.xCm;
          diningDrag.offsetYCm = diningDrag.lastY - floor.yCm;
        }
        return;
      }
      if (dragPointerId !== null && e.pointerId !== dragPointerId) return;
      let actionX=e.clientX, actionY=e.clientY;
      if(e.pointerType==='touch' && ((propsRef.current.tool!=='select' && propsRef.current.tool!=='move' && propsRef.current.tool!=='finish') || surfaceCursorRef.current.dragging)) {
        const commit=surfaceCursorRef.current.end(e.pointerId);
        controls.enabled=propsRef.current.tool!=='wall'&&propsRef.current.tool!=='cab-draw';
        if (!commit || propsRef.current.tool === 'select') return;
        const pinned = surfaceCursorRef.current.screen(camera, dom);
        if (!pinned) return;
        actionX=pinned.x;actionY=pinned.y;
        downClientRef.current={x:actionX,y:actionY};
      }

      const dr = drag3DRef.current;
      const press = downClientRef.current;
      const isTap = e.button === 0 && !!press && Math.hypot(actionX - press.x, actionY - press.y) <= 8;
      drag3DRef.current = null;
      dragPointerId = null;
      controls.enabled = !arSession.active && propsRef.current.tool !== 'wall' && propsRef.current.tool !== 'cab-draw';
      try {
        if (dom.hasPointerCapture(e.pointerId)) dom.releasePointerCapture(e.pointerId);
      } catch {}

      const cur = propsRef.current;
      if (dr) {
        downClientRef.current = null;
        if (dr.kind === 'move-box' && !dr.moved && isTap && cur.tool === 'select') onDoorTap(e);
        else doorTap.reset();
        if (dr.kind === 'move-dining') {
          if (dr.moved || dr.rotated) cur.onMoveDining(dr.diningId, dr.lastX, dr.lastY, true, dr.rotated ? dr.rotation : undefined);
          cur.onFinishDrag();
          return;
        }
        if (dr.kind === 'move-column') {
          if (dr.moved) cur.onUpdateRoomColumn?.(dr.columnId, {}, true);
          cur.onFinishDrag();
          return;
        }
        if (dr.kind === 'move-box' && !dr.moved && isTap && cur.tool === 'select') onDoorTap(e);
        else doorTap.reset();
        if (dr.kind === 'move-box' && dr.moved && dr.lastTargetX !== dr.origX) {
          cur.onMoveBox(dr.wallId, dr.boxId, dr.lastTargetX, true, dr.sessionId);
        } else if (dr.kind === 'move-app' && dr.moved && dr.lastTargetX !== dr.origX) {
          cur.onMoveAppliance(dr.wallId, dr.appId, dr.lastTargetX, true, dr.sessionId);
        } else if (dr.kind === 'move-opening' && dr.moved && dr.lastTargetX !== dr.origX) {
          cur.onMoveOpening?.(dr.wallId, dr.openingId, dr.lastTargetX, true);
        } else if (dr.kind === 'resize-box') {
          if (dr.dx || dr.dy) cur.onResizeCabinet(dr.wallId, dr.boxId, dr.side, dr.dx ?? 0, dr.dy ?? 0, true);
        } else if (dr.kind === 'move-shelf') {
          if (dr.dx || dr.dy) cur.onMoveShelf(dr.wallId, dr.boxId, dr.shelfId, dr.dx, dr.dy, true);
        } else if (dr.kind === 'resize-drawer' || dr.kind === 'resize-door-seam' || dr.kind === 'resize-unit-divider') {
          if (dr.moved) {
            cur.onMutateWallById(dr.wallId, () => {}, true);
          }
        }
        cur.onFinishDrag();
        return;
      }

      const dc = downClientRef.current;
      downClientRef.current = null;
      if (!dc || !isTap || !builtRef.current) { doorTap.reset(); return; }
      if (cur.tool === 'select' && cur.selectionMode === 'single') {
        if (onHobTap(e)) return;
        if (!onDoorTap(e)) select3DAt(e);
        return;
      }
      hobTap.reset();
      doorTap.reset();

      if (cur.tool === 'dining') {
        const point = raycastFloorPointCm(actionX, actionY, false);
        if (point) cur.onPlaceDining(point.xCm, point.yCm);
        return;
      }

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
        if (hasWallSegment(cur.project.walls, newWall)) return cur.onToast('این دیوار از قبل رسم شده است');
        cur.onAddWall?.(newWall);
        pendingWallStart3DRef.current = pt;
        updateWallFloorPreview(actionX, actionY);
        cur.onToast(`دیوار (${lenCm}cm) رسم شد — نقطه بعدی یا راست‌کلیک برای پایان`);
        return;
      }

      const pendingRow = pendingCabDraw3DRef.current;
      if (cur.tool === 'cab-draw' && pendingRow) {
        const target = resolveCabSweepTarget(actionX, actionY, pendingRow.starter.wallId, pendingRow.kind);
        if (!target) return cur.onToast('انتهای ردیف را روی دیوار مشخص کنید');
        const row = previewCabinetRow(cur.project, pendingRow, target.wallId, target.xCm);
        if (!row.valid) return cur.onToast('انتهای ردیف را روی بخش آزاد همان دیوار یا دیوار متصل بگذارید');
        if (cur.onCreateBoxesFromSweep(row.requested, pendingRow.kind, row.suggestedOwners)) {
          pendingCabDraw3DRef.current = continueCabinetRow(pendingRow, target.wallId, target.xCm, row.segments);
          clearGhost();
        }
        return;
      }

      const { topData: data, topPoint } = raycastWithHandleSpots(actionX, actionY);
      if (cur.tool === 'front-cut') {
        const transform = data && builtRef.current.wallTransforms.get(data.wallId);
        if (data?.boxId && topPoint && transform) {
          const x = scratchRel.copy(topPoint).sub(transform.origin).dot(transform.tangent) / CM;
          cur.onFrontCut(data.wallId, data.boxId, x, topPoint.y / CM);
        } else cur.onFrontCutOrient(cur.frontCutOrient === 'vertical' ? 'horizontal' : 'vertical');
        return;
      }
      if (!data || !topPoint) {
        if (cur.tool === 'opening' && cur.openingKind === 'column') {
          const floorPt = raycastFloorPointCm(actionX, actionY);
          if (floorPt) {
            cur.onAddRoomColumn?.(floorPt.xCm, floorPt.yCm, true);
            return;
          }
        }
        if (cur.tool === 'doors') {
          const nextOrient: Orientation = cur.doorOrient === 'vertical' ? 'horizontal' : 'vertical';
          cur.onSetDoorOrient?.(nextOrient);
          cur.onToast(`جهت براش درب: ${nextOrient === 'vertical' ? 'عمودی (درب)' : 'افقی (کشو / جک‌دار)'}`);
        } else if (cur.tool === 'handle') {
          const nextOrient: Orientation = cur.handleOrient === 'vertical' ? 'horizontal' : 'vertical';
          cur.onSetHandleOrient?.(nextOrient);
          cur.onToast(`جهت دستگیره: ${nextOrient === 'vertical' ? 'عمودی' : 'افقی'}`);
        } else if (cur.tool === 'hardware') {
          const idx = Math.max(0, HARDWARE_KIND_ORDER.indexOf(cur.hardwareBrush ?? 'hinged'));
          const nxt = HARDWARE_KIND_ORDER[(idx + 1) % HARDWARE_KIND_ORDER.length];
          cur.onSetHardwareBrush?.(nxt);
          cur.onToast(`نوع یراق: ${HARDWARE_KIND_META[nxt].label}`);
        } else if (cur.tool === 'pencil' || cur.tool === 'skeleton') {
          const nextOrient: Orientation = (cur.shelfOrient ?? 'horizontal') === 'vertical' ? 'horizontal' : 'vertical';
          cur.onSetShelfOrient?.(nextOrient);
          cur.onToast(`جهت طبقه‌بندی: ${nextOrient === 'vertical' ? 'عمودی' : 'افقی'}`);
        } else if (cur.tool === 'select') {
          cur.onSelectWallAndBox(cur.project.activeWallId || '', null, null);
        }
        return;
      }

      if (data.kind === 'under-cabinet-light' && data.lightBoxIds && cur.tool === 'select') {
        cur.onToggleLightBoxes(data.lightBoxIds);
        return;
      }

      if (data.kind === 'dining' && data.diningId) {
        if (cur.tool === 'eraser') cur.onDeleteDining(data.diningId);
        return;
      }

      if (data.kind === 'column' && data.columnId) {
        if (cur.tool === 'eraser') {
          cur.onDeleteRoomColumn?.(data.columnId);
        } else if (cur.tool === 'select') {
          cur.onSelectColumn?.(data.columnId);
        }
        return;
      }

      const wall = cur.project.walls.find((x) => x.id === data.wallId);
      const tr = builtRef.current.wallTransforms.get(data.wallId);
      if (!wall || !tr) return;

      if (cur.tool === 'select' || cur.tool === 'move') {
        if (data.kind === 'wall') {
          cur.onSelectWallAndBox(wall.id, null, null);
        }
        return;
      }

      scratchRel.copy(topPoint).sub(tr.origin);
      const hitXCm = Math.max(0, Math.min(wall.length, scratchRel.dot(tr.tangent) / CM));
      const hitYCm = Math.max(0, Math.min(wall.height, topPoint.y / CM));

      if (cur.tool === 'cab-draw') {
        const draft = startCabinetRow(cur.project, wall, hitXCm, cur.drawBoxKind);
        if (!draft) return cur.onToast('برای شروع ردیف فضای آزاد کافی نیست');
        pendingCabDraw3DRef.current = draft;
        updateGhostAndHover(actionX, actionY);
        cur.onToast('شروع ردیف مشخص شد؛ انتها را انتخاب و ثبت کنید');
        return;
      }

      if (cur.tool === 'fridge') {
        const cfg = FRIDGE_MODELS[cur.fridgeModel];
        cur.onPlaceFridge(wall.id, hitXCm - (cfg.width + 2 * FRIDGE_FRAME_CM + 2) / 2);
        return;
      }

      if (cur.tool === 'opening') {
        const def = OPENING_DEFAULTS[cur.openingKind];
        const elev = cur.openingKind === 'window' ? Math.max(20, Math.round(hitYCm - def.height / 2)) : 0;
        cur.onPlaceOpening(wall.id, hitXCm - def.width / 2, elev);
        return;
      }

      if (cur.tool === 'sink' || cur.tool === 'gas' || cur.tool === 'appliance') {
        const k: ApplianceKind =
          cur.tool === 'sink' ? 'sink' : cur.tool === 'gas' ? 'gas' : cur.applianceKind;
        const allowTall = k === 'builtin-oven' || k === 'microwave';
        const matchBoxType = (b: CabinetBox) => b.type === 'base' || (allowTall && b.type === 'tall');
        let targetBox = data.boxId ? wall.boxes.find((b) => b.id === data.boxId && matchBoxType(b)) : undefined;
        if (!targetBox) {
          targetBox = wall.boxes.find(
            (b) => matchBoxType(b) && hitXCm >= b.offsetX - 5 && hitXCm <= b.offsetX + b.width + 5
          );
        }
        if (!targetBox) {
          cur.onToast(allowTall ? 'لطفاً روی یک باکس زمینی یا کمد قدی کلیک کنید' : 'لطفاً روی یک باکس زمینی کلیک کنید');
          return;
        }
        const tw =
          k === 'sink' ? SINK_MODELS[cur.sinkModel].width : k === 'gas' ? cur.gasWidth : APPLIANCE_CONFIGS[k].width;
        const appH = APPLIANCE_CONFIGS[k].heightCm ?? (k === 'microwave' ? 38 : 60);
        const desiredElevY = allowTall && targetBox.type === 'tall' ? hitYCm - appH / 2 : undefined;
        cur.onPlaceAppliance(wall.id, targetBox.id, hitXCm - tw / 2, k, desiredElevY);
        return;
      }

      if (cur.tool === 'doors') {
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

      if (cur.tool === 'hardware') {
        const hw = cur.hardwareBrush ?? 'hinged';
        if (!data.boxId) {
          const idx = Math.max(0, HARDWARE_KIND_ORDER.indexOf(hw));
          const nxt = HARDWARE_KIND_ORDER[(idx + 1) % HARDWARE_KIND_ORDER.length];
          cur.onSetHardwareBrush?.(nxt);
          cur.onToast(`نوع یراق: ${HARDWARE_KIND_META[nxt].label}`);
          return;
        }
        if (cur.selectionMode !== 'single' && data.doorId) {
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
          cur.onApplyHardwareKind?.(null, cur.project.multiSelection.doorIds, hw);
          return;
        }
        cur.onApplyHardwareKind?.(data.boxId, data.doorId ? [data.doorId] : null, hw);
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
          cur.onApplyFinish('box', wall.id, data.boxId, undefined, data.doorId);
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
          if ((cur.shelfOrient ?? 'horizontal') === 'vertical') {
            const rawXRatio = (clickCm - u.startCm) / Math.max(1, u.endCm - u.startCm);
            let vMsg = '';
            cur.onMutateWallById(
              wall.id,
              (w) => {
                const b = w.boxes.find((x) => x.id === box.id);
                if (!b) return;
                vMsg = addVerticalDividerWithCenterSnap(b, u.startCm, u.endCm, rawXRatio).message;
              },
              true
            );
            if (vMsg) cur.onToast(vMsg);
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

        // Batch handle placement when multiSelection has doors
        if (cur.project.multiSelection && cur.project.multiSelection.doorIds.length > 0) {
          const targetDoorIds = cur.project.multiSelection.doorIds;
          const hasCncTarget = cur.project.walls.some((wItem) =>
            wItem.boxes.some((bItem) =>
              bItem.doors.some((dItem) => targetDoorIds.includes(dItem.id) && dItem.doorStyle === 'cnc')
            )
          );
          const runBatch = () => {
            for (const wItem of cur.project.walls) {
              const bZones = getCornerBlockedZonesForWall(wItem, cur.project.walls, cur.project.cornerOwners);
              const matchingBoxes = wItem.boxes.filter((bItem) =>
                bItem.doors.some((dItem) => targetDoorIds.includes(dItem.id))
              );
              if (!matchingBoxes.length) continue;
              cur.onMutateWallById(
                wItem.id,
                (wMut) => {
                  for (const bMut of wMut.boxes) {
                    if (!bMut.doors.some((dMut) => targetDoorIds.includes(dMut.id))) continue;
                    autoUnitizeBoxForHandles(bMut, bZones);
                    applyHandlesToBoxDoors(
                      bMut,
                      targetDoorIds,
                      cur.handleStyle,
                      cur.handleOrient,
                      undefined,
                      bZones
                    );
                  }
                },
                true,
                'دستگیره روی درب‌های انتخابی نصب شد'
              );
            }
          };
          if (
            cur.handleStyle === 'hidden' &&
            cur.onConfirmHiddenHandle &&
            (cur.project.designStyle === 'neoclassic' || hasCncTarget)
          ) {
            cur.onConfirmHiddenHandle(runBatch);
          } else {
            runBatch();
          }
          return;
        }

        const { rowIndex, xRatio, yRatio } = data;
        if (data.kind !== 'handle-spot' || rowIndex === undefined || xRatio === undefined || yRatio === undefined) {
          cur.onToast('یکی از نقاط نصب روی در را انتخاب کنید');
          return;
        }

        const blockedZones = getCornerBlockedZonesForWall(wall, cur.project.walls, cur.project.cornerOwners);
        const bayCheck = canPlaceHandleInBay(box, door, blockedZones);
        if (!bayCheck.ok) {
          cur.onToast(bayCheck.reason || 'اول یونیت رو مشخص کن');
          return;
        }
        const runSingle = () => {
          let newHandleId: string | null = null;
          cur.onMutateWallById(
            wall.id,
            (w) => {
              const b = w.boxes.find((x) => x.id === box.id);
              if (!b) return;
              const spotRes = applyHandleAtSpot(
                b,
                door.id,
                rowIndex,
                xRatio,
                yRatio,
                cur.handleStyle,
                cur.handleOrient,
                blockedZones
              );
              newHandleId = spotRes.handleId ?? null;
            },
            true,
            'دستگیره نصب شد'
          );
          cur.onSelectWallAndBox(wall.id, box.id, door.id);
          if (newHandleId) cur.onSelectHandle(wall.id, box.id, newHandleId);
        };

        if (
          cur.handleStyle === 'hidden' &&
          cur.onConfirmHiddenHandle &&
          (cur.project.designStyle === 'neoclassic' || door.doorStyle === 'cnc')
        ) {
          cur.onConfirmHiddenHandle(runSingle);
        } else {
          runSingle();
        }
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

    cancelPlacementRef.current = () => {
      pendingCabDraw3DRef.current = null;
      pendingWallStart3DRef.current = null;
      surfaceCursorRef.current.clear();
      setHasPlacementCursor(false);
      setHoverPreview(null);
      clearGhost();
      clearWallFloorPreview();
      requestRender();
    };
    commitPlacementRef.current = () => {
      if(arSession.editingBlocked || propsRef.current.dialogOpen)return;
      if(propsRef.current.tool==='select')return;
      const pinned=surfaceCursorRef.current.screen(camera,renderer.domElement);
      if(!pinned)return;
      downClientRef.current={x:pinned.x,y:pinned.y};
      onPointerUp(new PointerEvent('pointerup',{clientX:pinned.x,clientY:pinned.y,pointerType:'mouse',button:0}));
    };

    const is3DCyclableTool = (t: ToolId): boolean =>
      t !== 'select' && t !== 'move' && t !== 'wall' && t !== 'eraser';

    const step3DToolOption = (dir: 1 | -1, clientX: number, clientY: number): boolean => {
      const cur = propsRef.current;
      if(cur.tool==='dining' && cur.furnitureKind==='dining') {
        cur.onSetDiningSeats(nextDiningSeats(cur.diningSeats,dir)); return true;
      }
      let contextBox: { type: string; width?: number } | null = null;
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
        cur.onToast(`مدل دستگیره: ${HANDLE_STYLES.find(style => style.id === nxt)?.label}`);
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
          const maxC = getMaxVerticalDoorCount(contextBox?.width ?? 280);
          cur.onSetDoorVertCount(Math.max(1, Math.min(maxC, cur.doorVertCount + dir)));
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
      if (cur.tool === 'hardware') {
        const idx = Math.max(0, HARDWARE_KIND_ORDER.indexOf(cur.hardwareBrush ?? 'hinged'));
        const nxt = HARDWARE_KIND_ORDER[(idx + (dir > 0 ? 1 : HARDWARE_KIND_ORDER.length - 1)) % HARDWARE_KIND_ORDER.length];
        cur.onSetHardwareBrush?.(nxt);
        cur.onToast(`نوع یراق: ${HARDWARE_KIND_META[nxt].label}`);
        return true;
      }
      if (cur.tool === 'pencil' || cur.tool === 'skeleton') {
        if ((cur.shelfOrient ?? 'horizontal') === 'vertical') {
          cur.onSetShelfOrient?.('horizontal');
          cur.onToast('جهت طبقه‌بندی: افقی');
        } else {
          cur.onSetShelfCount(Math.max(1, Math.min(4, cur.shelfCount + dir)));
        }
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
          const target=cursorScreen(e.clientX,e.clientY);
          step3DToolOption(pacedDir, target.x, target.y);
        }
        const target=cursorScreen(e.clientX,e.clientY);
        requestAnimationFrame(() => updateGhostAndHover(target.x,target.y));
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (!rightDownClientRef.current) return;
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
      if(arSession.editingBlocked)return;
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
      if(arSession.editingBlocked)return;
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
        if (!drag3DRef.current) controls.enabled = !arSession.active;
      }
    };

    const onPointerLeave = () => {
      if(surfaceCursorRef.current.point)return;
      clearGhost();
      clearWallFloorPreview();
      setHoverPreview(null);
    };

    const dom = renderer.domElement;
    dom.style.setProperty('-webkit-touch-callout', 'none');
    const onPlacementKey = (event:KeyboardEvent) => {
      if ((event.target as HTMLElement)?.closest('input, textarea, select, button, [contenteditable=true]') || event.repeat) {
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        commitPlacementRef.current();
      } else if (event.key === 'z' || event.key === 'Z') {
        event.preventDefault();
        if (propsRef.current.onTriggerZoomSelected) propsRef.current.onTriggerZoomSelected();
        else triggerFocusZoomRef.current();
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
    const onPointerCancel = (e: PointerEvent) => {
      const diningDrag = drag3DRef.current;
      if (diningDrag?.kind === 'move-dining' && diningDrag.rotationTouch?.id === e.pointerId) {
        onPointerUp(e);
        return;
      }
      if (dragPointerId !== null && e.pointerId !== dragPointerId) return;
      if (dragPointerId === null && !dom.hasPointerCapture(e.pointerId) && e.target !== dom && !downClientRef.current) return;
      cancelModelDrag();
      doorTap.reset();
      surfaceCursorRef.current.resetGesture(e.pointerId);
      downClientRef.current = null;
      rightDownClientRef.current = null;
      if (dom.hasPointerCapture(e.pointerId)) dom.releasePointerCapture(e.pointerId);
      const currentTool = propsRef.current.tool;
      controls.enabled = !arSession.active && currentTool !== 'wall' && currentTool !== 'cab-draw';
      requestRender();
    };
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('resize', onPointerLeave);
    window.addEventListener('blur', onPointerLeave);

    return () => {
      arSession.dispose();
      if (arSessionRef.current === arSession) arSessionRef.current = null;
      if (rafId !== null) cancelAnimationFrame(rafId);
      ro.disconnect();
      dom.removeEventListener('wheel', onWheelCapture, { capture: true });
      dom.removeEventListener('pointerdown', onPointerDown, { capture: true });
      window.removeEventListener('keydown',onPlacementKey);
      disposeObject3D(surfaceMarker);
      floorGrid.geometry.dispose();
      (floorGrid.material as THREE.Material).dispose();
      originAxes.geometry.dispose();
      (originAxes.material as THREE.Material).dispose();
      dom.removeEventListener('contextmenu', onContextMenu);
      dom.removeEventListener('touchstart', onTouchStart);
      dom.removeEventListener('touchmove', onTouchMove);
      dom.removeEventListener('touchend', onTouchEnd);
      dom.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      cancelModelDrag();
      window.removeEventListener('resize', onPointerLeave);
      window.removeEventListener('blur', onPointerLeave);
      controls.removeEventListener('start', cancelFocusAnim);
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
      for (const timer of progressiveTimersRef.current) window.clearTimeout(timer);
      progressiveTimersRef.current = [];
      initReflectionsRef.current = () => {};
      geometryKeyRef.current = null;
      structuralKeyRef.current = null;
      lastAoGeometryRef.current = null;
      lightingStageRef.current = 0;
      reflections?.dispose();
      lighting.dispose();
      renderer.dispose();
      if (dom.parentNode === container) container.removeChild(dom);
      if (rendererRef.current === renderer) rendererRef.current = null;
      if (sceneRef.current === scene) sceneRef.current = null;
      if (cameraRef.current === camera) cameraRef.current = null;
      if (controlsRef.current === controls) controlsRef.current = null;
      camInitDoneRef.current = false;
    };
  }, []);

  useEffect(() => {
    const ar=arSessionRef.current;
    if(props.arEnabled) { if(props.initialSession)void ar?.start(props.initialSession); }
    else if(ar?.active||ar?.state.starting)ar.stop();
  },[props.arEnabled,props.initialSession]);
  useEffect(() => {
    if(lastSessionKillSignal.current !== props.sessionKillSignal) arSessionRef.current?.stop();
    lastSessionKillSignal.current=props.sessionKillSignal;
  },[props.sessionKillSignal]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    scene.environmentRotation.y = THREE.MathUtils.degToRad(props.hdrRotationDegrees ?? 0);
    requestRenderRef.current();
  }, [props.hdrRotationDegrees, arEditingBlocked]);

  useEffect(() => {
    if (!props.zoomSelectedSeq || arEditingBlocked) return;
    triggerFocusZoomRef.current();
  }, [props.zoomSelectedSeq, arEditingBlocked]);

  useEffect(() => {
    // Mouse-only 3D mode: while a drawing tool is selected, clicking commits
    // segments, not a camera orbit. The pointer preview stays attached to the
    // cursor before the first click and while waiting for the second.
    if (controlsRef.current) {
      controlsRef.current.enabled = !arSessionRef.current?.active && !arEditingBlocked && tool !== 'wall' && tool !== 'cab-draw';
    }
    if (tool === 'select' || tool === 'move') {
      surfaceCursorRef.current.clear();
      setHasPlacementCursor(false);
    }
    if (tool !== 'cab-draw' || pendingCabDraw3DRef.current?.kind !== props.drawBoxKind) {
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
    if (!arEditingBlocked && tool !== 'select') {
      const last = lastHoverCheckRef.current;
      const rect = rendererRef.current?.domElement.getBoundingClientRect();
      if (rect && last.x >= rect.left && last.x <= rect.right &&
          last.y >= rect.top && last.y <= rect.bottom) {
        updateGhostAndHoverRef.current(last.x, last.y);
      }
    }
  }, [tool, props.drawBoxKind, arEditingBlocked, props.diningSeats, props.diningRotation, props.furnitureKind, props.frontCutOrient]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const geometryKey = kitchenGeometryKey(project) + '|' + tool;
    const structuralKey = kitchenStructuralKey(project) + '|' + tool;
    const previous = builtRef.current;
    if (previous && structuralKeyRef.current === structuralKey) {
      // A model or metal finish change should only touch the corresponding
      // procedural equipment holder. Do NOT reconstruct the kitchen scene.
      if (geometryKeyRef.current !== geometryKey) {
        previous.updateEquipment?.(project);
        geometryKeyRef.current = geometryKey;
      }
      previous.updateLighting(project, lightingStageRef.current);
      requestRenderRef.current();
      return;
    }

    // Cancel obsolete builds without touching the currently displayed scene.
    for (const timer of progressiveTimersRef.current) window.clearTimeout(timer);
    progressiveTimersRef.current = [];
    let cancelled = false;
    let pending: BuiltKitchenScene | null = null;
    const isCurrent = () => !cancelled && sceneRef.current === scene;
    const schedule = (task: () => void, delayMs: number) => {
      const timer = window.setTimeout(task, delayMs);
      progressiveTimersRef.current.push(timer);
    };
    const releasePending = () => {
      if (!pending) return;
      disposeObject3D(pending.root);
      pending = null;
    };

    schedule(() => {
      if (!isCurrent()) return;
      let built: BuiltKitchenScene;
      const replacingExistingScene = Boolean(builtRef.current);
      try {
        built = buildKitchen3DScene(project, {
          doorOpenProgress: 0, tool, deferOcclusion: true,
          // Lightweight source models do not need to be queued on edits.
          // Queue only the initial kitchen launch; replacements render in one pass.
          deferEquipment: !replacingExistingScene,
          onTextureReady: () => requestRenderRef.current(),
        });
      } catch (error) {
        logDiagnostic('scene-build-failed', error);
        props.onToast('خطای نمایش ثبت شد؛ صحن قبلی حفظ شد');
        return;
      }
      if (!isCurrent()) { disposeObject3D(built.root); return; }
      pending = built;
      const hadPrevious = Boolean(builtRef.current);

      const commitReadyScene = () => {
        if (!isCurrent() || pending !== built) return;
        const prior = builtRef.current;

        // Make the new scene fully lit BEFORE its first visible frame.
        // Lighting previously restarted at stage 0, causing an obvious flash.
        built.updateLighting(propsRef.current.project, 4);
        scene.add(built.root);
        builtRef.current = built;
        geometryKeyRef.current = geometryKey;
        structuralKeyRef.current = structuralKey;
        lightingStageRef.current = 4;
        pending = null;
        if (prior) {
          scene.remove(prior.root);
          disposeObject3D(prior.root);
        }

        const states = doorStatesRef.current;
        const activeParts = new Set(built.animatedDoors.map(part => part.doorId));
        for (const id of states.keys()) if (!activeParts.has(id)) states.delete(id);
        setDoorsOpen([...states.values()].some(part => part.target > 0.5));
        for (const h of built.animatedDoors) {
          const st = states.get(h.doorId) ?? { cur: 0, target: 0 };
          states.set(h.doorId, st);
          if (st.cur > 0.001) applyAnimatedDoorProgress(h, st.cur);
        }

        if (!camInitDoneRef.current && !arSessionRef.current?.active) {
          camInitDoneRef.current = true;
          applyCameraPreset('iso', built.bounds);
        }
        if (!arEditingBlocked && tool === 'cab-draw') {
          const bounds = rendererRef.current?.domElement.getBoundingClientRect();
          const hover = lastHoverCheckRef.current;
          if (bounds && hover.x >= bounds.left && hover.x <= bounds.right &&
              hover.y >= bounds.top && hover.y <= bounds.bottom) {
            updateGhostAndHoverRef.current(hover.x, hover.y);
          }
        }
        if (propsRef.current.project.settings?.enableReflections !== false) initReflectionsRef.current();
        requestRenderRef.current();
      };

      const activateReadyOcclusion = () => {
        if (!isCurrent() || builtRef.current !== built) return;
        if (propsRef.current.project.settings?.ambientOcclusion === false) return;
        const aoGeometry = kitchenOcclusionGeometryKey(project);
        if (lastAoGeometryRef.current === aoGeometry) {
          built.activateOcclusion?.();
          requestRenderRef.current();
        } else {
          // Keep the existing 5s quiet period for actual geometry edits.
          schedule(() => {
            if (!isCurrent() || builtRef.current !== built) return;
            built.activateOcclusion?.();
            lastAoGeometryRef.current = aoGeometry;
            requestRenderRef.current();
          }, 5000);
        }
      };

      // The first launch can progressively paint equipment to get the room
      // onscreen quickly. All later rebuilds keep the complete OLD room visible
      // until EVERY model in the new room is ready, then swap once atomically.
      if (hadPrevious && !built.deferredEquipmentJobs?.length) {
        // Single-frame replacement with complete equipment. No staged blink.
        commitReadyScene();
        activateReadyOcclusion();
      } else {
        if (!hadPrevious) commitReadyScene();
        drainDeferredSceneJobs(
          built.deferredEquipmentJobs ?? [],
          schedule,
          () => isCurrent() && (hadPrevious ? pending === built : builtRef.current === built),
          () => {
            if (hadPrevious) commitReadyScene();
            activateReadyOcclusion();
          },
          (error) => logDiagnostic('equipment-build-failed', error),
          () => { if (!hadPrevious) requestRenderRef.current(); },
        );
      }
    }, 0);

    return () => {
      cancelled = true;
      releasePending();
    };
  }, [project, tool]);

  // Choosing a handle now previews it on EVERY selected door AND shows interactive
  // handle candidate spot markers on 3D doors just like 2D FrontCanvas.
  useEffect(() => {
    const built = builtRef.current;
    if (!built || arEditingBlocked || tool !== 'handle') {
      if (handleSpotsRef.current) {
        handleSpotsRef.current.dispose();
        handleSpotsRef.current = null;
      }
      return;
    }
    const previews = attachSelectedHandlePreviews(built, project, props.handleStyle, props.handleOrient);
    const spotsSet = project.doorsHidden
      ? null
      : attachHandleCandidateSpots(built, project);
    handleSpotsRef.current = spotsSet;
    requestRenderRef.current();
    return () => {
      for (const preview of previews) {
        preview.parent?.remove(preview);
        disposeObject3D(preview);
      }
      if (spotsSet) {
        spotsSet.dispose();
        if (handleSpotsRef.current === spotsSet) handleSpotsRef.current = null;
      }
      requestRenderRef.current();
    };
  }, [project, arEditingBlocked, tool, props.handleStyle, props.handleOrient]);

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
    if (cameraRef.current && !arSessionRef.current?.active) {
      cameraRef.current.fov = wideViewVerticalFov(mode, cameraRef.current.aspect);
      cameraRef.current.updateProjectionMatrix();
      requestRenderRef.current();
    }
  };

  const handleSetCamPreset = (p: 'iso' | 'front' | 'top') => {
    setCamPreset(p);
    if (!arSessionRef.current?.active) applyCameraPreset(p);
  };

  return (
    <div
      data-testid="scene-3d-root"
      data-cursor-placed={hasPlacementCursor ? '1' : '0'}
      data-cursor-x={surfaceCursorRef.current.point?.x}
      data-cursor-y={surfaceCursorRef.current.point?.y}
      data-cursor-z={surfaceCursorRef.current.point?.z}
      data-active-wall-id={project.activeWallId || ''}
      className={`relative w-full h-full overflow-hidden select-none ${props.arEnabled ? 'bg-transparent' : 'bg-slate-100'}`}
      data-xr-active={arState.active ? '1' : '0'}
      data-floor-locked={arState.floorLocked ? '1' : '0'}
    >
      <div ref={hostRef} className="w-full h-full" />
      {props.arEnabled && <ARControls state={arState} session={arSessionRef.current}
        dialogOpen={props.dialogOpen} onRetry={()=>{arSessionRef.current?.stop();void arSessionRef.current?.start();}} />}

      {/* نوار شناور بالای نمای سه‌بعدی (دوربین، باز شدن درها، انتخاب دیوار) */}
      {props.cameraToolbarHost && createPortal(
        <div data-testid="scene-3d-floating-bar" className="flex items-center gap-1">
          <button
            type="button"
            disabled={arState.active}
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
            disabled={arState.active}
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
            disabled={arState.active}
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

          <button
            type="button"
            data-testid="scene3d-zoom-selected"
            disabled={arEditingBlocked || !props.hasAnySelection}
            onClick={() => props.onTriggerZoomSelected?.()}
            title="زوم روی مورد انتخابی (کلید Z)"
            className="h-7 px-2.5 rounded-lg text-[13px] font-bold inline-flex items-center gap-1 transition text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none"
          >
            <ZoomIn className="w-3.5 h-3.5" />
            <span>زوم روی انتخاب</span>
          </button>
        </div>,
        props.cameraToolbarHost,
      )}

      {/* راهنمای مختصر پایین سه‌بعدی */}
      <div className="pointer-events-none absolute bottom-2.5 left-3 bg-white/95 border border-slate-200 rounded-lg px-2.5 py-1 text-[13px] font-bold text-slate-600 shadow-xs">
        {tool === 'wall'
          ? 'نشانگر روی زمین را حرکت دهید و با کلیک نقطه‌ها دیوار بکشید (راست‌کلیک = انتخاب)'
          : tool === 'move'
          ? 'قطعه یا دستگیرهٔ تغییر اندازه را بکشید'
          : tool === 'select'
          ? 'دو کلیک روی در برای باز کردن · یک کلیک برای بستن'
          : 'موس روی دیوار = پیش‌نمایش و اسکرول تغییر مدل · راست‌کلیک = بازگشت به انتخاب'}
      </div>

      {!arEditingBlocked && ((hasPlacementCursor && tool !== 'select' && tool !== 'move' && tool !== 'finish') || tool === 'handle') && (
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 z-50 pointer-events-auto flex gap-2">
          {tool === 'handle' && (
            <button type="button" className="h-11 rounded-xl border border-slate-300 bg-white px-3 font-bold"
              data-testid="scene-handle-orientation"
              onClick={() => props.onSetHandleOrient?.(props.handleOrient === 'vertical' ? 'horizontal' : 'vertical')}>
              {props.handleOrient === 'vertical' ? 'دستگیره عمودی' : 'دستگیره افقی'}
            </button>
          )}
          {hasPlacementCursor && <button type="button" data-testid="scene-confirm-placement" onClick={()=>commitPlacementRef.current()}
            className="h-11 rounded-xl px-5 bg-emerald-700 text-white font-bold">
              {tool === 'cab-draw' ? (pendingCabDraw3DRef.current ? 'ثبت ردیف' : 'شروع ردیف') : 'تأیید'}
          </button>}
          {hasPlacementCursor && <button type="button" className="h-11 rounded-xl border border-slate-300 bg-white px-3 font-bold"
            onClick={() => cancelPlacementRef.current()}>لغو</button>}
        </div>
      )}
      {!arEditingBlocked && (hoverPreview || (tool !== 'select' && tool !== 'move')) && !drag3DRef.current && (
        <CursorToolPreview
          visible={true}
          clientX={hoverPreview?.clientX ?? 0}
          clientY={hoverPreview?.clientY ?? 0}
          tool={tool}
          diningSeats={props.diningSeats} furnitureKind={props.furnitureKind}
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
          windowOkbCm={hoverPreview?.windowOkbCm}
          doorOrient={props.doorOrient}
          doorTargetWidth={props.doorTargetWidth}
          doorVertCount={props.doorVertCount}
          drawerPatIdx={props.drawerPatIdx}
          liftPatIdx={props.liftPatIdx}
          doorStyleBrush={props.doorStyleBrush}
          hardwareBrush={props.hardwareBrush}
          cabinetFinishBrush={props.cabinetFinishBrush}
          backsplashBrush={props.backsplashBrush}
          countertopBrush={props.countertopBrush}
          frameWidthCm={props.frameWidthCm}
          shelfOrient={props.shelfOrient}
          shelfCount={props.shelfCount}
          handleStyle={props.handleStyle}
          handleOrient={props.handleOrient}
          previewDoorWidths={hoverPreview?.previewDoorWidths}
          testId="cursor-preview-3d"
        />
      )}
    </div>
  );
};
