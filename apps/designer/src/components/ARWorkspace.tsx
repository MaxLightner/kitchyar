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
  MousePointer2,
  Flame,
  Layers,
  Lock,
  LockOpen,
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
  fitCalibrationDragB,
  projectArPointOntoWalls,
  XZPoint,
} from '../ar/arCalibration';
import { AnchorSample, AnchorStabilizer, FloorScanner } from '../ar/floorScanner';
import {
  nearDepthSessionOptions,
  NearRealOcclusion,
  OCCLUSION_STATUS_LABEL,
  OcclusionStatus,
} from '../ar/nearOcclusion';
import { DEFAULT_PROJECT_SETTINGS, FRIDGE_MODELS, OPENING_DEFAULTS, SINK_MODELS } from '../cad/constants';
import {
  carveBoxesForPlacedBox,
  createEmptyBox,
  placeApplianceWithCabinetRules,
  placeFridgeOnWall,
} from '../cad/doorRules';
import { createWallOpening } from '../cad/openingRules';
import { CursorToolPreview } from './CursorToolPreview';
import {
  applyAnimatedDoorProgress,
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
  OpeningKind,
  ProjectState,
  SinkModel,
  Wall,
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
  | 'opening';

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
  onUpdateProject: (updater: (prev: ProjectState) => ProjectState, toastMsg?: string) => void;
  onSwitchViewMode: (mode: '2d' | '3d' | 'ar') => void;
  onToast: (msg: string) => void;
  sessionKillSignal?: number;
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
  reference: { x: number; y: number; z: number };
}

function makeCalibrationPin(colorHex: number, label: string): THREE.Group {
  const group = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.RingGeometry(0.06, 0.095, 28),
    new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide })
  );
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.008;

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.01, 0.01, 0.28, 12),
    new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.35 })
  );
  pole.position.y = 0.14;

  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = `#${colorHex.toString(16).padStart(6, '0')}`;
    ctx.beginPath();
    ctx.arc(48, 48, 42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 52px sans-serif';
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
  sprite.position.set(0, 0.34, 0);
  sprite.scale.set(0.16, 0.16, 1);

  group.add(disc, pole, sprite);
  return group;
}

const DOOR_ANIM_DURATION_S = 0.58;

function resolveHitDoorId(obj: THREE.Object3D | null): string | undefined {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    const ud = cur.userData as Scene3DHitData | undefined;
    if (ud?.animationId || ud?.doorId) return ud.animationId || ud.doorId;
    cur = cur.parent;
  }
  return undefined;
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
  onUpdateProject,
  onSwitchViewMode,
  onToast,
  sessionKillSignal = 0,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [xrSupported, setXrSupported] = useState<boolean | null>(null);
  const [xrActive, setXrActive] = useState(false);
  const [floorLocked, setFloorLocked] = useState(false);
  const [scanReady, setScanReady] = useState(false);
  const [scanHitsCount, setScanHitsCount] = useState(0);
  const [occlusionEnabled, setOcclusionEnabled] = useState(true);
  const [occlusionStatus, setOcclusionStatus] = useState<OcclusionStatus>('idle');
  const [doorsOpen, setDoorsOpen] = useState(false);

  const [arTool, setArTool] = useState<ArToolId>('wall');
  const [cursorPreview, setCursorPreview] = useState<{ x: number; y: number; valid: boolean } | null>(null);
  const lastSelectTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const toggleXrDoorAtPointRef = useRef<(x: number, y: number) => boolean>(() => false);
  const pickAtClientRef = useRef<(x: number, y: number) => Scene3DHitData | null>(() => null);
  const floorPointAtClientRef = useRef<(x: number, y: number) => THREE.Vector3 | null>(() => null);
  const updateArGhostRef = useRef<(local: THREE.Vector3) => void>(() => {});
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

  const xrSessionRef = useRef<XRSession | null>(null);
  const floorScannerRef = useRef(new FloorScanner());
  const anchorStabilizerRef = useRef(new AnchorStabilizer());
  const anchorsRef = useRef<StoredAnchorEntry[]>([]);
  const basePoseRef = useRef<{ x: number; y: number; z: number; yaw: number } | null>(null);
  const hitTestSourceRef = useRef<XRHitTestSource | null>(null);
  const transientHitSourceRef = useRef<XRTransientInputHitTestSource | null>(null);

  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const floorGroupRef = useRef<THREE.Group | null>(null);
  const kitchenMountRef = useRef<THREE.Group | null>(null);
  const reticleRef = useRef<THREE.Mesh | null>(null);
  const wallGhostRef = useRef<THREE.Mesh | null>(null);
  const wallStartMarkerRef = useRef<THREE.Mesh | null>(null);
  const pinARef = useRef<THREE.Group | null>(null);
  const pinBRef = useRef<THREE.Group | null>(null);
  const lineABRef = useRef<THREE.Line | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const occlusionRef = useRef<NearRealOcclusion | null>(null);
  const builtSceneRef = useRef<BuiltKitchenScene | null>(null);
  const doorStatesRef = useRef<Map<string, { cur: number; target: number }>>(new Map());
  const renderOnceRef = useRef<() => void>(() => {});

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

  // End XR session if parent signals explicit exit (e.g., going back to Welcome/Projects)
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

    const grid = new THREE.GridHelper(10, 20, 0x10b981, 0x94a3b8);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.32;
    floorGroup.add(grid);
    gridHelperRef.current = grid;

    const kitchenMount = new THREE.Group();
    floorGroup.add(kitchenMount);
    kitchenMountRef.current = kitchenMount;

    const reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.08, 0.12, 32),
      new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide })
    );
    reticle.rotation.x = -Math.PI / 2;
    reticle.position.y = 0.01;
    reticle.visible = true;
    floorGroup.add(reticle);
    reticleRef.current = reticle;

    const wallGhost = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.28, depthWrite: false })
    );
    wallGhost.visible = false;
    wallGhost.renderOrder = 9;
    floorGroup.add(wallGhost);
    wallGhostRef.current = wallGhost;

    const wallStartMarker = new THREE.Mesh(
      new THREE.CylinderGeometry(0.045, 0.045, 0.14, 16),
      new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.3 })
    );
    wallStartMarker.visible = false;
    floorGroup.add(wallStartMarker);
    wallStartMarkerRef.current = wallStartMarker;

    const pinA = makeCalibrationPin(0x4f46e5, 'A');
    const pinB = makeCalibrationPin(0x059669, 'B');
    floorGroup.add(pinA, pinB);
    pinARef.current = pinA;
    pinBRef.current = pinB;

    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.02, 0),
      new THREE.Vector3(1, 0.02, 0),
    ]);
    const lineAB = new THREE.Line(
      lineGeo,
      new THREE.LineBasicMaterial({ color: 0x059669, transparent: true, opacity: 0.85 })
    );
    floorGroup.add(lineAB);
    lineABRef.current = lineAB;

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
          st.cur =
            Math.abs(diff) <= step
              ? st.target
              : st.cur + Math.sign(diff) * step;
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
    // Use the current XR eye camera for touch picking; the desktop camera does not
    // match the live device pose and the center-reticle ray does not match a finger.
    const pickingCamera = (): THREE.Camera => {
      if (!xrSessionRef.current) return camera;
      const xrCamera = renderer.xr.getCamera();
      return xrCamera.cameras[0] || xrCamera;
    };
    const getPointerRay = (clientX: number, clientY: number) => {
      raycaster.setFromCamera(pointerNdc(clientX, clientY), pickingCamera());
      return raycaster.ray;
    };
    pickAtClientRef.current = (clientX, clientY) => {
      if (!builtSceneRef.current) return null;
      builtSceneRef.current.root.updateWorldMatrix(true, true);
      getPointerRay(clientX, clientY);
      const hits = raycaster.intersectObjects(builtSceneRef.current.interactables, false);
      for (const hit of hits) {
        let obj: THREE.Object3D | null = hit.object;
        while (obj) {
          const hitData = obj.userData as Scene3DHitData | undefined;
          if (hitData?.kind && hitData.wallId) return hitData;
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
    updateArGhostRef.current = (localPt: THREE.Vector3) => {
      const ghost = wallGhostRef.current;
      if (!ghost) return;
      const start = pendingWallStartRef.current;
      if (arToolRef.current !== 'wall' || !start) {
        ghost.visible = false;
        return;
      }
      const al = alignmentRef.current;
      const c = Math.cos(al.yaw);
      const sn = Math.sin(al.yaw);
      const startX = al.x + al.scale * (start.x * c + start.z * sn);
      const startZ = al.z + al.scale * (-start.x * sn + start.z * c);
      const dx = localPt.x - startX;
      const dz = localPt.z - startZ;
      const len = Math.hypot(dx, dz);
      if (len < 0.03) { ghost.visible = false; return; }
      const h = (projectRef.current.settings?.wallHeightCm || DEFAULT_PROJECT_SETTINGS.wallHeightCm) / 100;
      ghost.position.set(startX + dx / 2, h / 2, startZ + dz / 2);
      ghost.rotation.y = -Math.atan2(dz, dx);
      ghost.scale.set(len, h, 0.1);
      ghost.visible = true;
    };
    const toggleDoorByRay = (ndc: THREE.Vector2, viewCamera: THREE.Camera): boolean => {
      if (!activeRef.current || !builtSceneRef.current) return false;
      builtSceneRef.current.root.updateWorldMatrix(true, true);
      raycaster.setFromCamera(ndc, viewCamera);
      const hits = raycaster.intersectObjects(builtSceneRef.current.interactables, false);
      // A door can be partly covered by its frame or handle; use the first interactive leaf hit.
      const partId = hits.map((hit) => resolveHitDoorId(hit.object)).find((id): id is string => Boolean(id));
      if (!partId) return false;
      const states = doorStatesRef.current;
      const st = states.get(partId) || { cur: 0, target: 0 };
      states.set(partId, { cur: st.cur, target: st.target > 0.5 ? 0 : 1 });
      setDoorsOpen(Array.from(states.values()).some((s) => s.target > 0.5));
      requestPreviewRender();
      return true;
    };
    toggleXrDoorAtPointRef.current = (clientX, clientY) =>
      toggleDoorByRay(pointerNdc(clientX, clientY), pickingCamera());
    const onDblClick = (e: MouseEvent) => {
      if (!activeRef.current || xrSessionRef.current || !builtSceneRef.current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      ndcVec.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      toggleDoorByRay(ndcVec, camera);
    };
    renderer.domElement.addEventListener('dblclick', onDblClick);

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
      renderer.domElement.removeEventListener('dblclick', onDblClick);
      toggleXrDoorAtPointRef.current = () => false;
      pickAtClientRef.current = () => null;
      floorPointAtClientRef.current = () => null;
      updateArGhostRef.current = () => {};
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
      hideFloor: true,
    });
    builtSceneRef.current = built;

    // Reapply soft-close per-door animation states across scene rebuilds
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

    // Sync calibration A/B pins & ruler line in aligned space
    if (pinARef.current && pinBRef.current && lineABRef.current) {
      const toAligned = (p: XZPoint) => {
        const c = Math.cos(alignment.yaw);
        const s = Math.sin(alignment.yaw);
        return new THREE.Vector3(
          alignment.x + alignment.scale * (p.x * c + p.z * s),
          0.015,
          alignment.z + alignment.scale * (-p.x * s + p.z * c)
        );
      };
      const vA = toAligned(pointA);
      const vB = toAligned(pointB);
      pinARef.current.position.set(vA.x, 0, vA.z);
      pinBRef.current.position.set(vB.x, 0, vB.z);
      lineABRef.current.geometry.setFromPoints([vA, vB]);
    }

    if (wallStartMarkerRef.current) {
      if (pendingWallStart) {
        const c = Math.cos(alignment.yaw);
        const s = Math.sin(alignment.yaw);
        wallStartMarkerRef.current.position.set(
          alignment.x + alignment.scale * (pendingWallStart.x * c + pendingWallStart.z * s),
          0.07,
          alignment.z + alignment.scale * (-pendingWallStart.x * s + pendingWallStart.z * c)
        );
        wallStartMarkerRef.current.visible = true;
      } else {
        wallStartMarkerRef.current.visible = false;
      }
    }

    if (gridHelperRef.current) {
      gridHelperRef.current.visible = !xrActive || !floorLocked;
    }
    if (wallGhostRef.current && !pendingWallStart) wallGhostRef.current.visible = false;

    renderOnceRef.current();
  }, [project, alignment, pointA, pointB, pendingWallStart, xrActive, floorLocked, active]);

  // Helper: convert a point in floorGroup-local coordinates into aligned CAD-space meters
  const floorLocalToModelXZ = (localPt: THREE.Vector3): XZPoint => {
    const al = alignmentRef.current;
    const dx = (localPt.x - al.x) / al.scale;
    const dz = (localPt.z - al.z) / al.scale;
    const c = Math.cos(al.yaw);
    const s = Math.sin(al.yaw);
    return {
      x: +(dx * c - dz * s).toFixed(3),
      z: +(dx * s + dz * c).toFixed(3),
    };
  };

  const applyArFloorActionAt = (floorLocalPt: THREE.Vector3) => {
    const modelPt = floorLocalToModelXZ(floorLocalPt);
    const toolNow = arToolRef.current;

    if (toolNow === 'select') return;

    if (toolNow === 'calibrate-a') {
      const curA = pointARef.current;
      const al = alignmentRef.current;
      const c = Math.cos(al.yaw);
      const s = Math.sin(al.yaw);
      const nextX = floorLocalPt.x - al.scale * (curA.x * c + curA.z * s);
      const nextZ = floorLocalPt.z - al.scale * (-curA.x * s + curA.z * c);
      setAlignment((prev) => ({ ...prev, x: nextX, z: nextZ }));
      onToast('نقطه مرجع A روی کف تنظیم شد');
      return;
    }

    if (toolNow === 'calibrate-b') {
      const a = pointARef.current;
      const b = pointBRef.current;
      const al = alignmentRef.current;
      const c = Math.cos(al.yaw);
      const s = Math.sin(al.yaw);
      const anchorA = {
        x: al.x + al.scale * (a.x * c + a.z * s),
        z: al.z + al.scale * (-a.x * s + a.z * c),
      };
      const sol = fitCalibrationDragB(a, b, anchorA, { x: floorLocalPt.x, z: floorLocalPt.z }, al.scale);
      if (!sol) {
        onToast('فاصله نقاط A و B باید حداقل ۱۰ سانتی‌متر باشد');
        return;
      }
      setPointB(sol.b);
      setAlignment((prev) => ({ ...prev, x: sol.x, z: sol.z, yaw: sol.yaw }));
      const distCm = Math.round(Math.hypot(sol.b.x - a.x, sol.b.z - a.z) * al.scale * 100);
      setRealDistanceInput(String(distCm));
      onUpdateProject((prev) => ({
        ...prev,
        arCalibration: { a, b: sol.b, realDistanceCm: distCm },
      }));
      onToast(`زاویه و مرجع B هم‌جهت شد (${distCm} cm)`);
      return;
    }

    if (toolNow === 'wall') {
      const start = pendingWallStartRef.current;
      if (!start) {
        setPendingWallStart(modelPt);
        onToast('نقطه شروع دیوار ثبت شد — نقطه انتها را روی کف بزنید');
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
        const walls = [...prev.walls, newWall];
        return {
          ...prev,
          walls,
          activeWallId: newWall.id,
          activeBoxId: null,
          selectedDoorId: null,
        };
      }, 'دیوار جدید روی کف AR ثبت شد');
      // Continue drawing a connected wall chain, exactly like the 2D and 3D editors.
      setPendingWallStart(modelPt);
      return;
    }

    // All cabinet / appliance / opening AR tools project cleanly onto nearest scanned wall!
    const proj = projectRef.current;
    const hitWall = projectArPointOntoWalls(modelPt, proj.walls);
    if (!hitWall) {
      onToast('ابتدا نزدیک یک دیوار کلیک کنید یا دیوار جدید بکشید');
      return;
    }

    if (toolNow === 'cab-base' || toolNow === 'cab-wall' || toolNow === 'cab-tall') {
      const kind: BoxKind =
        toolNow === 'cab-base' ? 'base' : toolNow === 'cab-wall' ? 'wall' : 'tall';
      onUpdateProject((prev) => {
        const next: ProjectState = JSON.parse(JSON.stringify(prev));
        const w = next.walls.find((x) => x.id === hitWall.wall.id);
        if (!w) return prev;
        const width = Math.min(120, Math.max(60, w.length - hitWall.offsetCm));
        const clampedX = Math.max(0, Math.min(w.length - width, hitWall.offsetCm));
        const box = createEmptyBox(kind, clampedX, width, { settings: next.settings });
        w.boxes.push(box);
        if (kind === 'tall') {
          carveBoxesForPlacedBox(w, box);
        }
        next.activeWallId = w.id;
        next.activeBoxId = box.id;
        return next;
      }, `باکس ${toolNow === 'cab-base' ? 'زمینی' : toolNow === 'cab-wall' ? 'هوایی' : 'قدی'} اضافه شد`);
      return;
    }

    if (toolNow === 'fridge') {
      onUpdateProject((prev) => {
        const next: ProjectState = JSON.parse(JSON.stringify(prev));
        const w = next.walls.find((x) => x.id === hitWall.wall.id);
        if (!w) return prev;
        const wCenter = hitWall.offsetCm - (FRIDGE_MODELS[fridgeModel].width + 10) / 2;
        const res = placeFridgeOnWall(w, next.walls, fridgeModel, wCenter, next.cornerOwners, true, next.settings);
        if (!res.ok) {
          onToast(res.message);
          return prev;
        }
        next.activeWallId = w.id;
        next.activeBoxId = res.fridgeId || null;
        return next;
      }, `یخچال ${FRIDGE_MODELS[fridgeModel].shortLabel} در AR نصب شد`);
      return;
    }

    if (toolNow === 'opening') {
      onUpdateProject((prev) => {
        const next: ProjectState = JSON.parse(JSON.stringify(prev));
        const w = next.walls.find((x) => x.id === hitWall.wall.id);
        if (!w) return prev;
        const cfg = OPENING_DEFAULTS[openingKind];
        const op = createWallOpening(
          openingKind,
          Math.max(0, Math.min(w.length - cfg.width, hitWall.offsetCm - cfg.width / 2)),
          w
        );
        if (!w.openings) w.openings = [];
        w.openings.push(op);
        next.activeWallId = w.id;
        next.selectedOpeningId = op.id;
        return next;
      }, `${OPENING_DEFAULTS[openingKind].label} روی دیوار ثبت شد`);
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
          toolNow === 'sink' ? 'sink' : toolNow === 'gas' ? 'gas' : applianceKind;
        const appW =
          kind === 'sink' ? SINK_MODELS[sinkModel].width : kind === 'gas' ? gasWidth : 60;
        const res = placeApplianceWithCabinetRules(
          w,
          next.walls,
          kind,
          baseBox,
          hitWall.offsetCm - appW / 2,
          next.cornerOwners,
          hoodKind,
          { sinkModel, customWidth: kind === 'gas' ? gasWidth : undefined }
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

  // Start / Resume WebXR session (NEVER auto-closes on viewMode switch!)
  const startWebXrSession = async () => {
    const xr = (navigator as unknown as { xr?: XRSystem }).xr;
    const renderer = rendererRef.current;
    const overlayRoot = overlayRootRef.current;
    if (!xr || !renderer || !overlayRoot) {
      onToast('این مرورگر یا دستگاه از WebXR AR پشتیبانی نمی‌کند (حالت شبیه‌سازی فعال است)');
      return;
    }

    if (xrSessionRef.current) {
      setXrActive(true);
      return;
    }

    try {
      const session = await xr.requestSession('immersive-ar', nearDepthSessionOptions(overlayRoot));
      xrSessionRef.current = session;
      setXrActive(true);
      if (controlsRef.current) controlsRef.current.enabled = false;
      floorScannerRef.current.reset();
      setFloorLocked(false);

      session.addEventListener('end', () => {
        // Release the XR animation loop before returning to the desktop preview.
        renderer.setAnimationLoop(null);
        xrSessionRef.current = null;
        hitTestSourceRef.current = null;
        transientHitSourceRef.current = null;
        setXrActive(false);
        setFloorLocked(false);
        setScanReady(false);
        setOcclusionStatus('idle');
        if (controlsRef.current) controlsRef.current.enabled = true;
        renderOnceRef.current();
      });

      let referenceSpaceType: 'local-floor' | 'local' = 'local-floor';
      try {
        await session.requestReferenceSpace('local-floor');
      } catch {
        referenceSpaceType = 'local';
        await session.requestReferenceSpace('local');
      }
      const viewerSpace = await session.requestReferenceSpace('viewer');
      hitTestSourceRef.current =
        (await session.requestHitTestSource?.({ space: viewerSpace })) || null;
      transientHitSourceRef.current =
        (await session.requestHitTestSourceForTransientInput?.({
          profile: 'generic-touchscreen',
        })) || null;

      renderer.xr.setReferenceSpaceType(referenceSpaceType);
      await renderer.xr.setSession(session);

      let lastXrFrameTime = 0;
      renderer.setAnimationLoop((time: number, frame?: XRFrame) => {
        if (!frame || !rendererRef.current || !sceneRef.current || !cameraRef.current) return;
        const space = rendererRef.current.xr.getReferenceSpace();
        if (!space) return;
        const pose = frame.getViewerPose(space);
        if (!pose) return;

        // If user switched to 2D/3D, keep XRSession alive passively without heavy depth copies!
        if (!activeRef.current) {
          occlusionRef.current?.update(frame, pose, rendererRef.current, session, {
            enabled: occlusionEnabledRef.current,
            ar: false,
          });
          return;
        }

        occlusionRef.current?.update(frame, pose, rendererRef.current, session, {
          enabled: occlusionEnabledRef.current,
          ar: true,
        });
        if (occlusionRef.current) setOcclusionStatus(occlusionRef.current.status);

        // Update XR anchor stabilizer when floor is locked
        if (floorLockedRef.current && anchorsRef.current.length > 0) {
          const samples: AnchorSample[] = [];
          for (const entry of anchorsRef.current) {
            const ap = frame.getPose(entry.anchor.anchorSpace, space);
            if (!ap) continue;
            samples.push({
              id: entry.id,
              reference: entry.reference,
              observed: {
                x: ap.transform.position.x,
                y: ap.transform.position.y,
                z: ap.transform.position.z,
              },
            });
          }
          if (samples.length >= 3) {
            const snap = anchorStabilizerRef.current.update(samples);
            if (floorGroupRef.current && basePoseRef.current) {
              floorGroupRef.current.position.set(snap.pose.x, snap.pose.y, snap.pose.z);
              floorGroupRef.current.rotation.y = snap.pose.yaw;
            }
          }
        } else if (!floorLockedRef.current) {
          const centerResults = hitTestSourceRef.current
            ? frame.getHitTestResults(hitTestSourceRef.current)
            : [];
          const transResults = transientHitSourceRef.current
            ? frame
                .getHitTestResultsForTransientInput(transientHitSourceRef.current)
                .flatMap((t) => [...t.results])
            : [];
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
            transResults,
            space,
            viewPos,
            time,
            forward
          );
          setScanReady(floorScannerRef.current.ready);
          setScanHitsCount(floorScannerRef.current.observations.length);
          if (pt && reticleRef.current && floorGroupRef.current) {
            floorGroupRef.current.position.set(pt.x, pt.y, pt.z);
            reticleRef.current.position.set(0, 0.01, 0);
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
      });

      onToast('سشن WebXR AR فعال شد — دوربین را آرام روی کف حرکت دهید');
    } catch {
      // A session may exist even if reference-space or hit-test initialization fails.
      // Roll back every partial allocation so the user can retry AR without reloading.
      const partialSession = xrSessionRef.current;
      xrSessionRef.current = null;
      if (partialSession) partialSession.end().catch(() => {});
      renderer.setAnimationLoop(null);
      hitTestSourceRef.current = null;
      transientHitSourceRef.current = null;
      setXrActive(false);
      setFloorLocked(false);
      setScanReady(false);
      if (controlsRef.current) controlsRef.current.enabled = true;
      renderOnceRef.current();
      onToast('امکان باز کردن دوربین AR در این مرورگر وجود نداشت؛ شبیه‌سازی کف فعال است');
    }
  };

  const handleLockFloor = () => {
    const pt = floorScannerRef.current.point;
    if (xrActive && pt && floorGroupRef.current) {
      basePoseRef.current = { x: pt.x, y: pt.y, z: pt.z, yaw: 0 };
      floorGroupRef.current.position.set(pt.x, pt.y, pt.z);
    }
    setFloorLocked(true);
    onToast('سطح کف قفل شد — اکنون با A/B جهت و مقیاس بگیرید یا دیوار رسم کنید');
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

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !containerRef.current || !cameraRef.current || !floorGroupRef.current) return;
    if (arToolRef.current === 'select') {
      // In immersive WebXR, desktop dblclick is not reliably emitted by mobile DOM overlays.
      // Handle a deliberate double-tap in selection mode without adding wall points.
      const now = performance.now();
      const prev = lastSelectTapRef.current;
      const repeated = prev && now - prev.time < 380 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 44;
      lastSelectTapRef.current = repeated ? null : { time: now, x: e.clientX, y: e.clientY };
      if (repeated && xrActive && toggleXrDoorAtCenterRef.current()) {
        e.preventDefault();
        onToast('درب انتخاب‌شده باز یا بسته شد');
      }
      return;
    }
    lastSelectTapRef.current = null;
    if (xrActive) {
      // In WebXR AR mode, use center reticle projection on locked floor plane
      const retPos = reticleRef.current?.position || new THREE.Vector3();
      applyArFloorActionAt(retPos);
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, cameraRef.current);
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hitWorld = new THREE.Vector3();
    if (!ray.ray.intersectPlane(floorPlane, hitWorld)) return;
    const hitLocal = floorGroupRef.current.worldToLocal(hitWorld.clone());
    if (reticleRef.current) {
      reticleRef.current.position.set(hitLocal.x, 0.01, hitLocal.z);
    }
    applyArFloorActionAt(hitLocal);
  };

  const abDistanceCm = useMemo(
    () => Math.round(Math.hypot(pointB.x - pointA.x, pointB.z - pointA.z) * alignment.scale * 100),
    [pointA, pointB, alignment.scale]
  );

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
      {/* Background gradient in preview/desktop mode; pure transparent in real WebXR AR */}
      <div
        ref={containerRef}
        onPointerDown={handleCanvasPointerDown}
        className={`flex-1 relative cursor-crosshair ${
          xrActive ? 'bg-transparent' : 'bg-gradient-to-b from-slate-200 via-slate-100 to-slate-200'
        }`}
      />

      {/* Top Floating AR Status & Calibration Card */}
      <div className="absolute top-2.5 right-2.5 left-2.5 flex flex-wrap items-start justify-between gap-2 pointer-events-none z-20">
        <div className="pointer-events-auto bg-white/95 border border-slate-200 rounded-xl shadow-md px-3 py-2 flex flex-wrap items-center gap-2 text-[13px]">
          {xrSupported && !xrActive ? (
            <button
              type="button"
              onClick={startWebXrSession}
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
              className={`h-8 px-3 rounded-lg font-black inline-flex items-center gap-1.5 ${
                scanReady
                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  : 'bg-amber-100 text-amber-800 border border-amber-300'
              }`}
            >
              <Lock className="w-3.5 h-3.5" />
              <span>{scanReady ? 'قفل کردن سطح کف' : `در حال اسکن کف (${scanHitsCount}/3)`}</span>
            </button>
          )}

          {floorLocked && (
            <button
              type="button"
              onClick={() => setFloorLocked(false)}
              className="h-8 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold inline-flex items-center gap-1"
            >
              <LockOpen className="w-3.5 h-3.5" />
              <span>بازکردن قفل کف</span>
            </button>
          )}

          <button
            type="button"
            data-testid="ar-toggle-doors-btn"
            onClick={() => {
              const nextOpen = !doorsOpen;
              setDoorsOpen(nextOpen);
              const built = builtSceneRef.current;
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
                  <span>تنظیم جهت B</span>
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
                فاصله فعلی در صحنه: <b className="tabular-nums">{abDistanceCm} cm</b> • برای رسم دیوار یا باکس روی کف کلیک کنید
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom AR Construction Bar (Walls, Boxes, Fridge, Appliances, Openings) */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 max-w-[96vw] z-20 bg-white/95 border border-slate-200 rounded-xl shadow-lg px-2 py-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {pendingWallStart && (
          <button
            type="button"
            onClick={() => setPendingWallStart(null)}
            className="h-8 px-2 rounded-lg bg-amber-100 text-amber-800 text-[13px] font-bold inline-flex items-center gap-1 shrink-0"
          >
            <X className="w-3.5 h-3.5" />
            <span>لغو نقطه شروع</span>
          </button>
        )}

        {(
          [
            { id: 'select', label: 'انتخاب / بازکردن درب', icon: MousePointer2 },
            { id: 'wall', label: 'رسم دیوار', icon: BrickWall },
            { id: 'cab-base', label: 'باکس زمینی', icon: RectangleHorizontal },
            { id: 'cab-wall', label: 'باکس هوایی', icon: RectangleHorizontal },
            { id: 'cab-tall', label: 'باکس قدی', icon: RectangleHorizontal },
            { id: 'fridge', label: 'یخچال', icon: Refrigerator },
            { id: 'sink', label: 'سینک', icon: Droplets },
            { id: 'gas', label: 'گاز', icon: Flame },
            { id: 'appliance', label: 'ظرفشویی', icon: WashingMachine },
            { id: 'opening', label: 'بازشو/ستون', icon: AppWindow },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const isAct = arTool === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setArTool(item.id)}
              aria-pressed={isAct}
              className={`h-8 px-2.5 rounded-lg border text-[13px] font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition ${
                isAct
                  ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
};
