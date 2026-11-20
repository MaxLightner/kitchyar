import { getCabinetLighting, getKitchenCabinetLightMode } from './cad/cabinetLighting';
import { auditKitchen } from './cad/kitchenAudit';
import { repairKitchenIssues } from './cad/kitchenRepair';
import type { CabinetLighting } from './cad/types';
import { SelectionPicker, type OfferSelection, type PickCandidate, type SurfaceSelection } from './components/SelectionPicker';
import { applyFrontCut, findFrontCut } from './cad/frontCut';
import { hasWallSegment } from './cad/wallSnap';
import { NumberPadDialog } from './components/NumberPadDialog';
import type { CabinetTextureId, DiningSeats, FloorFurniture, FloorFurnitureKind } from './cad/types';
import { snapDiningPosition } from './cad/diningLayout';
import { useProjectHistory } from './hooks/useProjectHistory';
import { getStorageFailure, STORAGE_STATUS_EVENT } from './cad/projectStorage';
import { logDiagnostic, setDiagnosticContext } from './utils/diagnostics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  APPLIANCE_CONFIGS,
  BACKSPLASH_FINISHES,
  BACKSPLASH_FINISH_ORDER,
  BOX_PRESETS,
  CABINET_FINISHES,
  COUNTERTOP_FINISHES,
  COUNTERTOP_THICKNESS_OPTIONS,
  DEFAULT_PROJECT_SETTINGS,
  DOOR_STYLE_META,
  FRIDGE_FRAME_CM,
  FRIDGE_MODELS,
  HARDWARE_KIND_META,
  OPENING_DEFAULTS,
  SINK_MODELS,
} from './cad/constants';
import {
  addShelvesWithMinGap,
  alignApplianceOnBoxFront,
  alignWallAndBaseDoorSeams,
  applyDoorStyleToDoors,
  applyFullBoxFrame,
  applyHandlesToBoxDoors,
  applyHardwareKindToDoors,
  autoUnitizeBoxForHandles,
  carveBoxesForPlacedBox,
  clearHoodUnitForGas,
  clampBoxInternalsAfterResize,
  clampShelfRatioWithMinGap,
  getBoxFrameInsets,
  compactDisconnectedDoorsInBox,
  createEmptyBox,
  createWall,
  deleteApplianceHierarchically,
  deleteBoxHierarchically,
  equalizeDoorsAndFillGaps,
  equalizeHorizontalInBox,
  equalizeVerticalDoorsInBox,
  eraseDoorWithRule,
  findParentBoxForAppliance,
  getBoxSideExposure,
  getFreeMoveRangeForBox,
  getUnitsInBox,
  moveApplianceHierarchically,
  moveBoxHierarchically,
  moveUnitInBoxWithDoorsSync,
  optimizeBoxUnitsSmart,
  optimizeBoxWithAppliances,
  updateFridgeBoxModelAndSize,
  placeApplianceWithCabinetRules,
  placeFridgeOnWall,
  removeUnitDividerWithSync,
  resizeDrawerUnitWidthCm,
  isCabinetCrown,
  setCabinetCrownHeight,
  stripInvalidColumnAndCornerDividers,
  syncHoodUnitAboveGas,
  requiresIntegratedHood,
  effectiveHoodKind,
  BIFOLD_SPLIT,
  uid,
} from './cad/doorRules';
import {
  autoOrientWallsOnAdd,
  detectCornerJunctions,
  getCornerBlockedZonesForWall,
  moveConnectedWall,
  moveSmartWallNode,
  SweepSegment,
  toggleCornerOwner,
  WallNodeRef,
} from './cad/cornerLogic';
import { resolveCabinetPlacement } from './cad/cabinetPlacement';
import { autoPlaceHandlesForUnit } from './cad/handleSpots';
import {
  createRoomColumn,
  createWallOpening,
  findCollidingOpening,
  OPENING_LABELS,
  updateOpeningGeometry,
  updateRoomColumn,
} from './cad/openingRules';
import { buildPresetProject, PresetMode } from './cad/presets';
import {
  createProjectRecord,
  getActiveProjectId,
  loadProjectsList,
  SavedProjectRecord,
  saveProjectsList,
  setActiveProjectId as persistActiveProjectId,
  upsertProjectRecord,
} from './cad/projectStorage';
import { applyKitchenStylePreset, KitchenStylePreset } from './cad/stylePresets';
import { applySmartKitchenDesign } from './cad/smartKitchenSolver';
import {
  ApplianceKind,
  BacksplashFinishId,
  BoxKind,
  CabinetBox,
  CabinetFinishId,
  CountertopEdgeProfile,
  CountertopFinishId,
  DoorKind,
  DoorStyle,
  DoorSwing,
  EquipmentFinish,
  FridgeModel,
  HoodModel,
  CooktopModel,
  HandleStyle,
  HardwareKind,
  MultiSelection,
  OpeningKind,
  Orientation,
  ProjectSettings,
  ProjectState,
  RoomColumn,
  SelectionMode,
  SinkModel,
  ToolId,
  Wall,
} from './cad/types';
import { isHandheldARDevice, requestChidoSession } from './ar/chidoSession';
import { alignAboveFridge, fridgeFrontCm } from './cad/fridgePlacement';
import { fridgeModelFinish, finishLabel, syncEquipmentFinishes, cooktopForFinish, hoodForFinish } from './cad/equipmentFinishSync';
import { alignSelectedDoorsInBox, equalizeSelectedVerticalWidths, equalizeSelectedDrawerHeights } from './cad/selectionAlign';
import { copySelection } from './cad/copySelection';
import { BottomDock } from './components/BottomDock';
import { FrontCanvas } from './components/FrontCanvas';
import { PlanCanvas } from './components/PlanCanvas';
import { ProjectsScreen } from './components/ProjectsScreen';
import { Scene3DCanvas } from './components/Scene3DCanvas';
import { SettingsModal } from './components/SettingsModal';
import type { SurfaceFinishPatch } from './components/SurfaceFinishControls';
import { SideInspector } from './components/SideInspector';
import { StyleGalleryModal } from './components/StyleGalleryModal';
import { ToolGuideHost } from './components/CursorToolPreview';
import { TopBar, ViewMode } from './components/TopBar';
import { WelcomeScreen } from './components/WelcomeScreen';

const STORAGE_KEY = 'cabinet_cad_project_v2';

function cloneProject(p: ProjectState): ProjectState {
  return JSON.parse(JSON.stringify(p));
}

function keepStackedHoodsIntegrated(wall: Wall) {
  for (const gas of wall.appliances) {
    if (gas.kind !== 'gas' || !requiresIntegratedHood(wall, gas)) continue;
    const missingFront = wall.boxes.some(box => (box.type === 'wall' || box.type === 'wall-deep') && !box.linkedToBoxId &&
      box.offsetX < gas.offsetX + gas.width - 5 && box.offsetX + box.width > gas.offsetX + 5 &&
      !box.doors.some(door => door.kind !== 'open' && door.startCm + box.offsetX < gas.offsetX + gas.width - 2 &&
        door.startCm + door.widthCm + box.offsetX > gas.offsetX + 2));
    if (gas.hoodKind !== 'hidden' || missingFront) syncHoodUnitAboveGas(wall, gas);
  }
}

function normalizeProject(raw: ProjectState): ProjectState {
  const columns: RoomColumn[] = (raw.columns || []).map((c) => ({ ...c }));
  const rawWalls: Wall[] = raw.walls || [];

  const walls: Wall[] = rawWalls.map((w) => {
    const boxes = (w.boxes || []).map((b) => ({
      ...b,
      doors: (b.doors || []).map((d) => {
        const legacyStyle = d.doorStyle as string | undefined;
        const migratedStyle: DoorStyle | undefined =
          legacyStyle === 'pantry' ? 'flat' : (d.doorStyle as DoorStyle | undefined);
        const migratedHardware: HardwareKind | undefined =
          d.hardwareKind ?? (legacyStyle === 'pantry' ? 'pantry-pullout' : undefined);
        return {
          ...d,
          kind: ((d.kind as string) === 'oven' ? 'door' : d.kind) as DoorKind,
          doorStyle: migratedStyle,
          hardwareKind: migratedHardware,
          drawerRatios: migratedHardware === 'lift-bifold' ? [BIFOLD_SPLIT] : d.drawerRatios ?? [],
        };
      }),
      unitDividers: b.unitDividers || [],
      shelves: b.shelves || [],
      handles: b.handles || [],
      frames: b.frames || [],
    }));

    // Backfill linkedToBoxId for wall-deep boxes sitting directly above a fridge
    for (const b of boxes) {
      if (b.type === 'wall-deep' && !b.linkedToBoxId) {
        const fridge = boxes.find(
          (f) =>
            f.type === 'fridge' &&
            Math.abs(f.offsetX - b.offsetX) <= 2 &&
            Math.abs(f.width - b.width) <= 2
        );
        if (fridge) b.linkedToBoxId = fridge.id;
      }
    }

    const tempWall: Wall = {
      ...w,
      boxes,
      appliances: [],
      openings: w.openings || [],
    };
    // Repair legacy linked upper cabinets that float too high above the
    // actual refrigerator without changing independent upper cabinet rows.
    for (const fridge of boxes) {
      if (fridge.type === 'fridge') alignAboveFridge(tempWall, fridge);
    }

    const appliances = (w.appliances || []).map((a) => {
      const parent = findParentBoxForAppliance(tempWall, a);
      return {
        ...a,
        boxId: a.boxId || parent?.id,
        sinkModel: a.kind === 'sink' ? a.sinkModel || 'steel-2' : a.sinkModel,
      };
    });

    const normalizedWall: Wall = {
      ...tempWall,
      appliances,
    };

    const blockedZones = getCornerBlockedZonesForWall(
      normalizedWall,
      rawWalls,
      raw.cornerOwners || {}
    );
    for (const b of normalizedWall.boxes) {
      stripInvalidColumnAndCornerDividers(normalizedWall, b, blockedZones, columns);
      // Remove stale internal dividers strictly inside base gas/sink appliance openings
      if (b.type === 'base') {
        const ownedCutouts = appliances.filter(
          (a) =>
            (a.kind === 'gas' || a.kind === 'sink') &&
            a.offsetX >= b.offsetX - 2 &&
            a.offsetX + a.width <= b.offsetX + b.width + 2
        );
        for (const app of ownedCutouts) {
          const ls = +(app.offsetX - b.offsetX).toFixed(1);
          const le = +(ls + app.width).toFixed(1);
          b.unitDividers = b.unitDividers.filter((u) => u <= ls + 1.5 || u >= le - 1.5);
          if (b.frames?.length) {
            b.frames = b.frames.filter(
              (f) => f.side !== 'seam' || f.seamCm === undefined || f.seamCm <= ls + 1.5 || f.seamCm >= le - 1.5
            );
          }
        }
      }
    }

    keepStackedHoodsIntegrated(normalizedWall);
    return normalizedWall;
  });

  return {
    ...raw,
    columns,
    diningSets: (Array.isArray(raw.diningSets) ? raw.diningSets : []).filter(item => item && (item.kind === 'tv' || [2, 4, 6, 8].includes(item.seats)) &&
      Number.isFinite(item.xCm) && Number.isFinite(item.yCm)).map(item => ({ ...item, rotation: Number.isFinite(item.rotation) ? item.rotation : 0 })),
    selectedDiningId: raw.selectedDiningId ?? null,
    selectedOpeningId: raw.selectedOpeningId ?? null,
    selectedColumnId: raw.selectedColumnId ?? null,
    selectedApplianceId: raw.selectedApplianceId ?? null,
    selectedShelfId: raw.selectedShelfId ?? null,
    selectedHandleId: raw.selectedHandleId ?? null,
    selectedFrameId: raw.selectedFrameId ?? null,
    selectedUnitDivider: raw.selectedUnitDivider ?? null,
    selectedUnit: raw.selectedUnit ?? null,
    doorsLocked: false,
    doorsHidden: raw.doorsHidden ?? false,
    designStyle: raw.designStyle ?? 'modern',
    cabinetFinish: raw.cabinetFinish ?? 'warm-white',
    backsplashFinish: raw.backsplashFinish ?? 'calacatta-marble',
    countertopFinish: raw.countertopFinish ?? 'dark-quartz',
    skipStylePrompt: raw.skipStylePrompt ?? false,
    settings: {
      ...DEFAULT_PROJECT_SETTINGS,
      ...(raw.settings || {}),
    },
    walls,
  };
}

function loadInitialProject(): ProjectState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ProjectState;
      if (parsed && Array.isArray(parsed.walls)) {
        return normalizeProject(parsed);
      }
    }
  } catch {
    // fallback to preset
  }
  return buildPresetProject('L');
}

export default function App() {
  const [projects, setProjects] = useState<SavedProjectRecord[]>(() => loadProjectsList());
  const [activeProjectId, setActiveProjectId] = useState<string>(() => {
    const list = loadProjectsList();
    const savedId = getActiveProjectId();
    const found = list.find((p) => p.id === savedId) || list[0];
    return found.id;
  });

  const [initialProject] = useState<ProjectState>(() => {
    const list = loadProjectsList();
    const savedId = getActiveProjectId();
    const found = list.find((p) => p.id === savedId) || list[0];
    return found ? normalizeProject(found.state) : loadInitialProject();
  });

  const [screen, setScreen] = useState<'welcome' | 'projects' | 'editor'>(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get('autostart') === '1') return 'editor';
    }
    return 'welcome';
  });
  const [styleGalleryOpen, setStyleGalleryOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [cameraToolbarHost, setCameraToolbarHost] = useState<HTMLDivElement | null>(null);
  const [toolGuideHost, setToolGuideHost] = useState<HTMLDivElement | null>(null);
  const [measurement, setMeasurement] = useState<{
    label: string; initial: number; min: number; max: number; allowRow?: boolean;
    other?: { label: string; initial: number; min: number; max: number };
    base: ProjectState; resolve: (value: number, row: boolean, secondary?: number) => ProjectState | null;
    onApplied?: (next: ProjectState) => void;
  } | null>(null);

  const { project, setProject, history, historyIdx, commitState, resetHistory, travelHistory, getProject } = useProjectHistory(initialProject);
  const auditIssues = useMemo(() => auditKitchen(project), [project]);
  const [storageFailure, setStorageFailure] = useState(getStorageFailure);
  useEffect(() => {
    const update = () => setStorageFailure(getStorageFailure());
    window.addEventListener(STORAGE_STATUS_EVENT, update);
    update();
    return () => window.removeEventListener(STORAGE_STATUS_EVENT, update);
  }, []);

  const [tool, setTool] = useState<ToolId>('select');
  const [selectionWheelEnabled, setSelectionWheelEnabled] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('2d');
  const [overlap, setOverlap] = useState<{ x: number; y: number; candidates: PickCandidate[] } | null>(null);
  const [selectedSurface, setSelectedSurface] = useState<SurfaceSelection | null>(null);
  const [selectedAppliancePart, setSelectedAppliancePart] = useState<'gas' | 'hood' | null>(null);
  const closeOverlap = useCallback(() => setOverlap(null), []);
  const chooseOverlap = useCallback((candidate: PickCandidate) => {
    closeOverlap();
    setSelectedSurface(null);
    setSelectedAppliancePart(null);
    setProject(p => (p.selectedDiningId || p.multiSelection)
      ? { ...p, selectedDiningId: null, multiSelection: undefined } : p);
    candidate.select();
  }, [closeOverlap, setProject]);
  const offerSelection: OfferSelection = useCallback((x, y, hits) => {
    const candidates = [...new Map(hits.map(hit => [hit.id, hit])).values()];
    if (candidates.length && !selectionWheelEnabled) {
      // Direct selection never opens a radial overlay; successive pointer
      // taps reach the same canvas and double-tap door/oven controls work.
      const direct = candidates.find(candidate => candidate.icon === 'door')
        ?? candidates.find(candidate => candidate.icon === 'handle')
        ?? candidates[0];
      chooseOverlap(direct);
    } else if (candidates.length > 1) setOverlap({ x, y, candidates });
    else if (candidates.length === 1) chooseOverlap(candidates[0]);
    else {
      closeOverlap();
      setSelectedSurface(null);
      setSelectedAppliancePart(null);
    }
    return candidates.length > 0;
  }, [chooseOverlap, closeOverlap, selectionWheelEnabled]);
  useEffect(() => {
    closeOverlap();
    setSelectedSurface(null);
  }, [activeProjectId, screen, tool, viewMode, closeOverlap]);

  const [floorScanActive, setFloorScanActive] = useState(false);
  const [trackedFloorConfirmed, setTrackedFloorConfirmed] = useState(false);
  // Eligibility controls the entry button; only requestSession in the tap can
  // determine actual AR availability. A false/hanging preflight must not lock it.
  const [arAvailable] = useState(() => isHandheldARDevice());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sharedWideMode, setSharedWideMode] = useState<'normal' | 'wide' | 'ultra'>('normal');
  const [initialXrSession, setInitialXrSession] = useState<Promise<XRSession> | null>(null);
  const [arSessionKillSignal, setArSessionKillSignal] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewHdrRotation, setPreviewHdrRotation] = useState<number | null>(null);
  const savedHdrRotation = project.settings?.hdrRotationDegrees;
  const hdrRotationDegrees = previewHdrRotation ?? (Number.isFinite(savedHdrRotation) ? savedHdrRotation! : 0);

  // Tool options live cleanly in state and are controlled from SideInspector
  const [drawBoxKind, setDrawBoxKind] = useState<BoxKind>('base');
  const [doorOrient, setDoorOrient] = useState<Orientation>('vertical');
  const [frontCutOrient, setFrontCutOrient] = useState<Orientation>('vertical');
  const [doorTargetWidth, setDoorTargetWidth] = useState<number>(60);
  const [doorVertCount, setDoorVertCount] = useState<number>(1);
  const [drawerPatIdx, setDrawerPatIdx] = useState<number>(1);
  const [liftPatIdx, setLiftPatIdx] = useState<number>(0);
  const [doorBandPos, setDoorBandPos] = useState<'top' | 'bottom'>('top');
  const [doorBandRatio, setDoorBandRatio] = useState<number>(0.26);
  const [doorStyleBrush, setDoorStyleBrush] = useState<DoorStyle>('flat');
  const [allowThreeDoorPantryUnit, setAllowThreeDoorPantryUnit] = useState(false);
  const [hardwareBrush, setHardwareBrush] = useState<HardwareKind>('hinged');
  const [shelfOrient, setShelfOrient] = useState<Orientation>('horizontal');
  const [zoomSelectedSeq, setZoomSelectedSeq] = useState<number>(0);
  const [autoUnitHighlightBoxId, setAutoUnitHighlightBoxId] = useState<string | null>(null);
  const [stylePromptModal, setStylePromptModal] = useState<{
    open: boolean;
    targetBoxId: string | null;
    targetDoorIds: string[] | null;
    requestedStyle: DoorStyle;
    remember: boolean;
  } | null>(null);
  const [hiddenHandleWarnModal, setHiddenHandleWarnModal] = useState<{
    onConfirm: () => void;
  } | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);
  const [shelfCount, setShelfCount] = useState<number>(1);
  const [frameWidthCm, setFrameWidthCm] = useState<number>(5);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('single');
  const [cabinetFinishBrush, setCabinetFinishBrush] = useState<CabinetFinishId>('cashmere');
  const [backsplashBrush, setBacksplashBrush] = useState<BacksplashFinishId>('calacatta-marble');
  const [countertopBrush, setCountertopBrush] = useState<CountertopFinishId>('dark-quartz');
  const [handleStyle, setHandleStyle] = useState<HandleStyle>('simple');
  const [handleOrient, setHandleOrient] = useState<Orientation>('vertical');
  const [fridgeModel, setFridgeModel] = useState<FridgeModel>('fridge-sbs-homebar');
  const [fridgeHasFrame, setFridgeHasFrame] = useState<boolean>(true);
  const [sinkModel, setSinkModel] = useState<SinkModel>('sink-double-flat-chrome');
  const [gasWidth, setGasWidth] = useState<number>(90);
  const [diningSeats, setDiningSeats] = useState<DiningSeats>(4);
  const [diningShape, setDiningShape] = useState<'round' | 'rect'>('rect');
  const [furnitureKind, setFurnitureKind] = useState<FloorFurnitureKind>('dining');
  const [diningRotation, setDiningRotation] = useState(0);
  const [applianceKind, setApplianceKind] = useState<ApplianceKind>('dishwasher');
  const [hoodKind, setHoodKind] = useState<'hidden' | 'chimney'>(
    () => initialProject.settings?.defaultHoodKind || 'chimney'
  );
  const [openingKind, setOpeningKind] = useState<OpeningKind>('window');
  const [openingSwing, setOpeningSwing] = useState<DoorSwing>('left-in');

  const [pxPerCm, setPxPerCm] = useState(2.1);
  const [frontPan, setFrontPan] = useState({ x: 0, y: 0 });
  const [topHeightPct, setTopHeightPct] = useState(50);
  const [toast, setToast] = useState<string | null>(null);
  const [finishSyncPrompt, setFinishSyncPrompt] = useState<{ finish: EquipmentFinish } | null>(null);

  const toastTimer = useRef<number | null>(null);
  const autoUnitTimerRef = useRef<number | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const editorOverlayRef = useRef<HTMLDivElement | null>(null);
  const splitDrag = useRef<{ pointerId: number; startY: number; startPercent: number; height: number } | null>(null);
  const dragBaseRef = useRef<{ id: string; project: ProjectState } | null>(null);

  const activeProjectRecord = useMemo(
    () => projects.find((p) => p.id === activeProjectId) || projects[0] || null,
    [projects, activeProjectId]
  );

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  // Preserve transparent WebXR DOM overlay all the way to the page root.
  useEffect(() => {
    document.documentElement.classList.toggle('kitchiyar-xr-passthrough', floorScanActive && viewMode === '3d');
    return () => document.documentElement.classList.remove('kitchiyar-xr-passthrough');
  }, [floorScanActive, viewMode]);

  // The visible page height changes with Android Chrome's address/navigation
  // bars, orientation, split-screen and fullscreen transitions. 100vh is the
  // *layout* viewport and can clip the two rows of tools at the bottom.
  useEffect(() => {
    if (screen !== 'editor') return;
    const shell = editorOverlayRef.current;
    if (!shell) return;
    const updateViewport = () => {
      const height = window.visualViewport?.height || window.innerHeight;
      if (height > 0) shell.style.setProperty('--kitchiyar-visual-height', `${Math.round(height)}px`);
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.addEventListener('orientationchange', updateViewport);
    window.visualViewport?.addEventListener('resize', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.removeEventListener('orientationchange', updateViewport);
      window.visualViewport?.removeEventListener('resize', updateViewport);
    };
  }, [screen]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    onChange();
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => showToast('خروج از تمام‌صفحه انجام نشد'));
      return;
    }
    const root = editorOverlayRef.current;
    if (!root?.requestFullscreen) {
      showToast('تمام‌صفحه در این مرورگر در دسترس نیست؛ ابزارها در حالت معمولی هم باید دیده شوند');
      return;
    }
    void root.requestFullscreen().catch(() => showToast('مرورگر اجازه تمام‌صفحه را نداد'));
  }, [showToast]);

  const triggerAutoUnitHighlight = useCallback((boxId: string) => {
    setAutoUnitHighlightBoxId(boxId);
    if (autoUnitTimerRef.current) window.clearTimeout(autoUnitTimerRef.current);
    autoUnitTimerRef.current = window.setTimeout(() => {
      setAutoUnitHighlightBoxId(null);
    }, 950);
  }, []);

  useEffect(() => {
    setDiagnosticContext({ projectId: activeProjectId, viewMode, tool, walls: project.walls.length, boxes: project.walls.reduce((n,w)=>n+w.boxes.length,0) });
    logDiagnostic('editor-context');
  }, [project, activeProjectId, viewMode, tool]);

  useEffect(() => {
    const recName = activeProjectRecord?.name || 'آشپزخانه من';
    setProjects(upsertProjectRecord(projects, activeProjectId, recName, project, viewMode));
    persistActiveProjectId(activeProjectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, activeProjectId, viewMode]);

  const handleUndo = useCallback(() => {
    if (!travelHistory(-1, normalizeProject)) return;
    dragBaseRef.current = null;
    showToast('آخرین عملیات لغو شد');
  }, [travelHistory, showToast]);

  const handleRedo = useCallback(() => {
    if (!travelHistory(1, normalizeProject)) return;
    dragBaseRef.current = null;
    showToast('عملیات تکرار شد');
  }, [travelHistory, showToast]);

  const dragCheckpointRef = useRef<ProjectState | null>(null);
  const handleBeginDrag = useCallback(() => {
    dragCheckpointRef.current = cloneProject(getProject());
  }, [getProject]);
  const handleFinishDrag = useCallback(() => {
    dragCheckpointRef.current = null;
    dragBaseRef.current = null;
  }, []);
  const handleCancelDrag = useCallback(() => {
    if (dragCheckpointRef.current) setProject(dragCheckpointRef.current);
    dragCheckpointRef.current = null;
    dragBaseRef.current = null;
    logDiagnostic('drag-cancelled');
  }, [setProject]);

  const activeWall = useMemo(
    () => project.walls.find((w) => w.id === project.activeWallId) || project.walls[0] || null,
    [project.walls, project.activeWallId]
  );

  const activeBox = useMemo(() => {
    if (!activeWall || !activeWall.boxes.length || !project.activeBoxId) return null;
    return activeWall.boxes.find((b) => b.id === project.activeBoxId) || null;
  }, [activeWall, project.activeBoxId]);

  const selectedDoor = useMemo(() => {
    if (!activeBox || !activeBox.doors.length || !project.selectedDoorId) return null;
    return activeBox.doors.find((d) => d.id === project.selectedDoorId) || null;
  }, [activeBox, project.selectedDoorId]);

  const selectedOpening = useMemo(() => {
    if (!activeWall || !project.selectedOpeningId) return null;
    return (activeWall.openings || []).find((o) => o.id === project.selectedOpeningId) || null;
  }, [activeWall, project.selectedOpeningId]);

  const selectedColumn = useMemo(() => {
    if (!project.selectedColumnId || !project.columns?.length) return null;
    return project.columns.find((c) => c.id === project.selectedColumnId) || null;
  }, [project.columns, project.selectedColumnId]);

  const selectedAppliance = useMemo(() => {
    if (!activeWall || !project.selectedApplianceId) return null;
    return activeWall.appliances.find((a) => a.id === project.selectedApplianceId) || null;
  }, [activeWall, project.selectedApplianceId]);

  const selectedFrame = useMemo(() => {
    if (!activeWall || !project.selectedFrameId) return null;
    for (const b of activeWall.boxes) {
      const f = (b.frames || []).find((x) => x.id === project.selectedFrameId);
      if (f) return f;
    }
    return null;
  }, [activeWall, project.selectedFrameId]);

  const fitWallToView = useCallback(
    (w: Wall | null) => {
      if (!w) return;
      const ws = workspaceRef.current;
      const pw = ws?.clientWidth || 900;
      const ph = (ws?.clientHeight || 600) * ((100 - topHeightPct) / 100);
      const start = Math.min(0, ...w.boxes.map(box => box.offsetX));
      const end = Math.max(w.length, ...w.boxes.map(box => box.offsetX + box.width));
      const sx = (pw * 0.78) / Math.max(end - start, 100);
      const sy = (ph * 0.74) / Math.max(w.height, 100);
      const scale = +Math.max(0.75, Math.min(3.5, sx, sy)).toFixed(2);
      setPxPerCm(scale);
      setFrontPan({ x: (w.length - end - start) * scale / 2, y: 0 });
    },
    [topHeightPct]
  );

  useEffect(() => {
    fitWallToView(activeWall);
    // Initial fit on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectTool = useCallback(
    (nextTool: ToolId) => {
      if (nextTool === 'move') setSelectionMode('single');
      setTool(nextTool);
    },
    []
  );

  const cutFront = (wallId: string, boxId: string, x: number, y: number) => {
    const next = cloneProject(getProject());
    const wall = next.walls.find(item => item.id === wallId);
    const box = wall?.boxes.find(item => item.id === boxId);
    if (!wall || !box) return;
    const zones = getCornerBlockedZonesForWall(wall, next.walls, next.cornerOwners);
    const cut = findFrontCut(wall, box, frontCutOrient, x, y, zones);
    if (!cut) return showToast('روی بخش قابل تقسیم نما کلیک کنید');
    next.selectedDoorId = applyFrontCut(box, cut);
    next.activeWallId = wallId;
    next.activeBoxId = boxId;
    next.selectedHandleId = null;
    next.selectedUnit = null;
    next.doorsHidden = false;
    commitState(next, true);
  };

  const handleExitToSelect = useCallback(() => {
    if (tool !== 'select') {
      setTool('select');
      showToast('ابزار انتخاب فعال شد');
    }
  }, [tool, showToast]);

  const handleToggleDoorsHidden = useCallback(() => {
    const next = cloneProject(project);
    next.doorsHidden = !next.doorsHidden;
    if (next.doorsHidden) {
      next.selectedDoorId = null;
      next.selectedHandleId = null;
    } else {
      next.selectedUnit = null;
    }
    commitState(next, true);
    showToast(
      next.doorsHidden
        ? 'درب‌ها مخفی شدند: روی یونیت کلیک کنید یا جداکننده آن را بکشید'
        : 'درب‌ها نمایش داده شدند'
    );
  }, [project, commitState, showToast]);

  const mutateWallById = useCallback(
    (wallId: string, mutator: (wall: Wall) => void, commitHistory = true, toastMsg?: string) => {
      commitState((prev) => {
        const next = cloneProject(prev);
        const w = next.walls.find((x) => x.id === wallId);
        if (!w) return prev;
        if (!w.openings) w.openings = [];
        mutator(w);
        return next;
      }, commitHistory);
      if (toastMsg) showToast(toastMsg);
    },
    [commitState, showToast]
  );

  const mutateActiveWall = useCallback(
    (mutator: (wall: Wall) => void, commitHistory = true, toastMsg?: string) => {
      commitState((prev) => {
        const next = cloneProject(prev);
        const w = next.walls.find((x) => x.id === next.activeWallId) || next.walls[0];
        if (!w) return prev;
        if (!w.openings) w.openings = [];
        mutator(w);
        return next;
      }, commitHistory);
      if (toastMsg) showToast(toastMsg);
    },
    [commitState, showToast]
  );

  const editCabinetDimension = useCallback((
    wallId: string, boxId: string, field: 'width' | 'height' | 'elevY', requested: number,
    commit: boolean, keepTop = false, keepRight = false
  ) => {
    const current = getProject();
    const base = dragCheckpointRef.current || current;
    const wall = base.walls.find(w => w.id === wallId);
    const box = wall?.boxes.find(b => b.id === boxId);
    if (!wall || !box || box.type === 'fridge') return;
    const upper = box.type === 'wall' || box.type === 'wall-deep';
    const min = field === 'elevY' ? Math.min(95, box.elevY) : field === 'width' ? Math.min(40, box.width) : 25;
    const max = field === 'width'
      ? 10000
      : field === 'elevY' ? (keepTop ? box.elevY + box.height - 25 : wall.height - box.height)
      : wall.height - box.elevY;
    if (max < min) return;
    const resolve = (value: number, row: boolean): ProjectState | null => {
      const next = cloneProject(base);
      const w = next.walls.find(w => w.id === wallId)!;
      const selected = w.boxes.find(b => b.id === boxId)!;
      if (field === 'height' && isCabinetCrown(w, selected) && next.walls.some(wall => wall.boxes.some(box => box.type === 'wall' || box.type === 'wall-deep'))) {
        return setCabinetCrownHeight(next.walls, selected.elevY + Math.round(value * 10) / 10) ? next : null;
      }
      const peers = [selected];
      if (row && upper && field !== 'width') {
        for (let i = 0; i < peers.length; i++) {
          const a = peers[i];
          for (const b of w.boxes) {
            if (b.type !== selected.type || peers.includes(b)) continue;
            const gap = Math.max(a.offsetX, b.offsetX) - Math.min(a.offsetX + a.width, b.offsetX + b.width);
            if (gap <= 1 && Math.abs(a.elevY - b.elevY) <= 1) peers.push(b);
          }
        }
      }
      for (const b of peers) {
        const before = { offsetX: b.offsetX, width: b.width, elevY: b.elevY, height: b.height };
        b[field] = Math.round(value * 10) / 10;
        if (field === 'width' && keepRight) b.offsetX = before.offsetX + before.width - b.width;
        if (field === 'elevY' && keepTop) b.height = before.elevY + before.height - b.elevY;
        if (b.height < 25 || b.elevY + b.height > w.height) return null;
        if (w.openings?.some(op => b.offsetX < op.offsetX + op.width - 0.1 &&
          b.offsetX + b.width > op.offsetX + 0.1 && b.elevY < op.elevY + op.height - 0.1 &&
          b.elevY + b.height > op.elevY + 0.1)) return null;
        const overlaps = (v: typeof before, other: typeof b) =>
          v.offsetX < other.offsetX + other.width - 0.1 && v.offsetX + v.width > other.offsetX + 0.1 &&
          v.elevY < other.elevY + other.height - 0.1 && v.elevY + v.height > other.elevY + 0.1;
        if (w.boxes.some(other => !peers.includes(other) && overlaps(b, other) && !overlaps(before, other))) return null;
        clampBoxInternalsAfterResize(b);
      }
      return next;
    };
    const draft = Math.max(min, Math.min(max, requested));
    const next = resolve(draft, false);
    if (!commit) {
      if (next) commitState(next, false);
      return;
    }
    const shown = current.walls.find(w => w.id === wallId)?.boxes.find(b => b.id === boxId)?.[field] ?? box[field];
    if (dragCheckpointRef.current && (Math.abs(shown - box[field]) > 0.05 || Math.abs(draft - box[field]) > 0.05)) {
      setMeasurement({
        label: field === 'height' ? 'ارتفاع کابینت' : field === 'width' ? 'عرض کابینت' : 'ارتفاع پایین کابینت از کف',
        initial: next ? draft : shown, min, max, allowRow: upper && field !== 'width', base, resolve,
      });
      return;
    }
    if (next && Math.abs(draft - box[field]) > 0.05) commitState(next, true);
  }, [commitState, getProject]);

  const handleResizeWallCabinetsSynced = useCallback((
    wallId: string, boxId: string, elev: number, height: number, commit: boolean
  ) => {
    const box = (dragCheckpointRef.current || getProject()).walls.find(w => w.id === wallId)?.boxes.find(b => b.id === boxId);
    if (!box) return;
    if (Math.abs(elev - box.elevY) > 0.05) editCabinetDimension(wallId, boxId, 'elevY', elev, commit, true);
    else editCabinetDimension(wallId, boxId, 'height', height, commit);
  }, [editCabinetDimension, getProject]);

  const resizeCabinetFromHandle = useCallback((
    wallId: string, boxId: string, side: 'left' | 'right' | 'top' | 'bottom',
    dx: number, dy: number, commit: boolean
  ) => {
    const box = (dragCheckpointRef.current || getProject()).walls.find(w => w.id === wallId)?.boxes.find(b => b.id === boxId);
    if (!box) return;
    if (side === 'left' || side === 'right') editCabinetDimension(wallId, boxId, 'width', box.width + (side === 'left' ? -dx : dx), commit, false, side === 'left');
    else if (side === 'bottom') editCabinetDimension(wallId, boxId, 'elevY', box.elevY + dy, commit, true);
    else editCabinetDimension(wallId, boxId, 'height', box.height + dy, commit);
  }, [editCabinetDimension, getProject]);

  const moveShelfPrecisely = useCallback((
    wallId: string, boxId: string, shelfId: string, dx: number, dy: number, commit: boolean
  ) => {
    const base = dragCheckpointRef.current || getProject();
    const box = base.walls.find(w => w.id === wallId)?.boxes.find(b => b.id === boxId);
    const shelf = box?.shelves.find(sh => sh.id === shelfId);
    if (!box || !shelf) return;
    const horizontal = shelf.orient !== 'vertical';
    const inset = getBoxFrameInsets(box);
    const span = horizontal ? Math.max(1, box.height - box.countertopCm - box.plinth - inset.top - inset.bottom)
      : Math.max(1, shelf.endCm - shelf.startCm);
    const before = horizontal ? (1 - shelf.yRatio) * span : (shelf.xRatio ?? 0.5) * span;
    const min = span * (horizontal ? 0.08 : 0.15);
    const max = span - min;
    const requested = Math.max(min, Math.min(max, before + (horizontal ? dy : dx)));
    const resolve = (n: number) => {
      const next = cloneProject(base);
      const b = next.walls.find(w => w.id === wallId)!.boxes.find(b => b.id === boxId)!;
      const sh = b.shelves.find(sh => sh.id === shelfId)!;
      if (horizontal) sh.yRatio = clampShelfRatioWithMinGap(b, 1 - n / span, sh.startCm, sh.endCm, sh.id).ratio;
      else sh.xRatio = n / span;
      return next;
    };
    commitState(resolve(requested), commit);
  }, [commitState, getProject]);

  const handleMoveUnit = useCallback(
    (dir: 'left' | 'right') => {
      if (tool !== 'move' || !activeWall || !project.selectedUnit) return;
      const next = cloneProject(project);
      const w = next.walls.find((x) => x.id === activeWall.id);
      const b = w?.boxes.find((x) => x.id === project.selectedUnit!.boxId);
      if (!w || !b) return;
      const blocked = getCornerBlockedZonesForWall(w, next.walls, next.cornerOwners);
      const res = moveUnitInBoxWithDoorsSync(
        w,
        b,
        project.selectedUnit.startCm,
        project.selectedUnit.endCm,
        dir,
        blocked
      );
      if (!res.ok) {
        showToast(res.message);
        return;
      }
      if (res.movedUnit) {
        next.selectedUnit = {
          boxId: b.id,
          startCm: res.movedUnit.startCm,
          endCm: res.movedUnit.endCm,
        };
      }
      commitState(next, true);
      showToast(res.message);
    },
    [activeWall, project, commitState, showToast, tool]
  );

  const handleCreateBoxesFromSweep = (
    segments: SweepSegment[],
    kind: BoxKind,
    suggestedOwners?: Record<string, string>,
    flipOverrides?: Record<string, 1 | -1>
  ): boolean => {
    const current = getProject();
    const placement = resolveCabinetPlacement(current, segments, kind, suggestedOwners, flipOverrides);
    if (!placement.segments.length) {
      showToast(placement.blockedByOpening
        ? 'این قسمت با بازشوی دیوار تداخل دارد'
        : 'برای این کابینت دست‌کم ۳۰ سانتی‌متر فضای آزاد لازم است');
      return false;
    }
    const next = cloneProject(current);
    next.cornerOwners = placement.owners;
    for (const wall of next.walls) {
      if (flipOverrides?.[wall.id]) wall.flipSide = flipOverrides[wall.id];
    }
    let firstBoxId: string | null = null;
    for (const segment of placement.segments) {
      const wall = next.walls.find(w => w.id === segment.wallId)!;
      const box = createEmptyBox(kind, segment.startCm, segment.widthCm, { settings: next.settings });
      wall.boxes.push(box);
      if (kind === 'tall') carveBoxesForPlacedBox(wall, box);
      firstBoxId ??= box.id;
    }
    for (const wallId of new Set(placement.segments.map(segment => segment.wallId))) {
      const wall = next.walls.find(w => w.id === wallId);
      if (wall) keepStackedHoodsIntegrated(wall);
    }
    next.activeWallId = placement.segments[0].wallId;
    next.activeBoxId = firstBoxId;
    next.selectedDoorId = null;
    next.selectedOpeningId = null;
    next.selectedApplianceId = null;
    next.selectedShelfId = null;
    next.selectedHandleId = null;
    commitState(next, true);
    if (viewMode === '2d') fitWallToView(next.walls.find(w => w.id === next.activeWallId) || null);
    showToast(placement.segments.length > 1 ? 'کابینت‌ها اضافه شدند' : 'باکس جدید اضافه شد');
    return true;
  };

  const handleToggleCornerOwner = (cornerKey: string) => {
    const next = cloneProject(project);
    next.cornerOwners = toggleCornerOwner(next.walls, next.cornerOwners, cornerKey);
    commitState(next, true);
    showToast('جهت و اولویت کنج دیوارها جابجا شد');
  };

  const handlePlaceAppliance = (
    wallId: string,
    boxId: string,
    desiredOffsetX: number,
    kindOverride?: ApplianceKind
  ) => {
    const next = cloneProject(project);
    const w = next.walls.find((x) => x.id === wallId);
    const box = w?.boxes.find((b) => b.id === boxId);
    if (!w || !box) return;

    const kind = kindOverride ?? applianceKind;
    const res = placeApplianceWithCabinetRules(
      w,
      next.walls,
      kind,
      box,
      desiredOffsetX,
      next.cornerOwners,
      hoodKind,
      {
        sinkModel: kind === 'sink' ? sinkModel : undefined,
        customWidth: kind === 'gas' ? gasWidth : undefined,
      }
    );
    if (!res.ok) {
      showToast(res.message);
      return;
    }
    const wallChanged = next.activeWallId !== w.id;
    next.activeWallId = w.id;
    next.activeBoxId = box.id;
    next.selectedDoorId = null;
    next.selectedOpeningId = null;
    next.selectedApplianceId = res.appliance?.id ?? null;
    next.selectedShelfId = null;
    next.selectedHandleId = null;
    commitState(next, true);
    if (wallChanged) fitWallToView(w);
    setTool('select');
    showToast(res.message);
  };

  const handlePlaceFridge = (wallId: string, desiredOffsetX: number) => {
    const next = cloneProject(project);
    const w = next.walls.find((x) => x.id === wallId);
    if (!w) return;

    const res = placeFridgeOnWall(
      w,
      next.walls,
      fridgeModel,
      desiredOffsetX,
      next.cornerOwners,
      fridgeHasFrame,
      next.settings || DEFAULT_PROJECT_SETTINGS
    );
    if (!res.ok) {
      showToast(res.message);
      return;
    }

    const wallChanged = next.activeWallId !== w.id;
    next.activeWallId = w.id;
    next.activeBoxId = res.fridgeId ?? null;
    next.selectedDoorId = null;
    next.selectedOpeningId = null;
    next.selectedApplianceId = null;
    next.selectedShelfId = null;
    next.selectedHandleId = null;
    commitState(next, true);
    if (wallChanged) fitWallToView(w);
    setTool('select');
    showToast(res.message);
  };

  const handlePlaceOpening = (wallId: string, desiredOffsetX: number, desiredElevY?: number) => {
    const next = cloneProject(project);
    const w = next.walls.find((x) => x.id === wallId);
    if (!w) return;
    if (!w.openings) w.openings = [];

    const op = createWallOpening(openingKind, desiredOffsetX, w, {
      elevY: desiredElevY ?? OPENING_DEFAULTS[openingKind].elevY,
      swingDir: openingSwing,
    });

    const overlap = findCollidingOpening(
      w,
      op.offsetX,
      op.offsetX + op.width,
      op.elevY,
      op.height,
      next.columns || []
    );
    if (overlap) {
      showToast('در این محدوده قبلاً پنجره، درب یا ستون قرار گرفته است');
      return;
    }

    w.openings.push(op);
    const wallChanged = next.activeWallId !== w.id;
    next.activeWallId = w.id;
    next.selectedOpeningId = op.id;
    next.selectedColumnId = null;
    next.activeBoxId = null;
    next.selectedDoorId = null;
    next.selectedApplianceId = null;
    next.selectedShelfId = null;
    next.selectedHandleId = null;
    commitState(next, true);
    if (wallChanged) fitWallToView(w);
    showToast(`${OPENING_LABELS[openingKind]} ثبت شد؛ لبه‌ها را بکشید تا اندازه دقیق شود`);
  };

  const handleMoveOpening = (wallId: string, openingId: string, offsetX: number, commit: boolean) => {
    const current = getProject();
    const base = dragCheckpointRef.current || current;
    const before = base.walls.find(w => w.id === wallId)?.openings?.find(o => o.id === openingId);
    const live = current.walls.find(w => w.id === wallId)?.openings?.find(o => o.id === openingId);
    if (!before || !live) return;
    const resolve = (value: number) => {
      const next = cloneProject(current);
      const wall = next.walls.find(w => w.id === wallId)!;
      updateOpeningGeometry(wall.openings!.find(o => o.id === openingId)!, wall, { offsetX: value });
      return next;
    };
    const value = offsetX < 0 ? live.offsetX : offsetX;
    commitState(resolve(value), commit);
  };

  const handleUpdateOpeningNumeric = (
    field: 'offsetX' | 'width' | 'elevY' | 'height' | 'depthCm',
    val: number
  ) => {
    if (!selectedOpening || Number.isNaN(val)) return;
    mutateActiveWall((w) => {
      const op = w.openings?.find((o) => o.id === selectedOpening.id);
      if (op) updateOpeningGeometry(op, w, { [field]: val });
    }, true);
  };

  const selectSurface = (surface: SurfaceSelection | null) => {
    setSelectedSurface(surface);
    if (!surface) return;
    setProject(p => ({
      ...p, activeBoxId: null, selectedDiningId: null, selectedDoorId: null,
      selectedOpeningId: null, selectedColumnId: null, selectedApplianceId: null,
      selectedShelfId: null, selectedHandleId: null, selectedFrameId: null,
      selectedUnit: null, selectedUnitDivider: null, multiSelection: undefined,
    }));
  };

  const selectDining = useCallback((id: string | null) => {
    setProject(prev => {
      if (id === prev.selectedDiningId || (!id && !prev.selectedDiningId)) return prev;
      if (!id) return { ...prev, selectedDiningId: null };
      return { ...prev, selectedDiningId: id, activeBoxId: null, selectedDoorId: null,
        selectedOpeningId: null, selectedColumnId: null, selectedApplianceId: null,
        selectedShelfId: null, selectedHandleId: null, selectedFrameId: null,
        selectedUnitDivider: null, selectedUnit: null, multiSelection: undefined };
    });
  }, [setProject]);

  const placeDining = useCallback((x: number, y: number) => {
    const position = { id: uid(furnitureKind), ...snapDiningPosition(x, y), rotation: diningRotation };
    const item: FloorFurniture = furnitureKind === 'tv' ? { ...position, kind: 'tv' } : { ...position, seats: diningSeats, ...(diningSeats === 4 ? { shape: diningShape } : {}) };
    commitState(prev => ({ ...prev, selectedDiningId: null, diningSets: [...(prev.diningSets ?? []), item] }), true);
    showToast(furnitureKind === 'tv' ? 'ست تلویزیون درج شد' : `میز ناهارخوری ${diningSeats.toLocaleString('fa-IR')} نفره درج شد`);
  }, [commitState, diningSeats, diningShape, diningRotation, furnitureKind, showToast]);

  const moveDining = useCallback((id: string, x: number, y: number, commit: boolean, angle?: number) => {
    const current = getProject();
    const item = current.diningSets?.find(d => d.id === id);
    if (!item) return;
    const { xCm, yCm } = snapDiningPosition(x, y);
    const rotation = angle === undefined ? item.rotation : (Math.round(angle) % 360 + 360) % 360;
    if (!commit && xCm === item.xCm && yCm === item.yCm && rotation === item.rotation) return;
    const before = dragCheckpointRef.current?.diningSets?.find(d => d.id === id);
    if (commit && before && xCm === before.xCm && yCm === before.yCm && rotation === before.rotation) return;
    commitState({
      ...current,
      diningSets: current.diningSets?.map(d => d.id === id ? { ...d, xCm, yCm, rotation } : d),
    }, commit);
  }, [commitState, getProject]);

  const deleteDining = useCallback((id: string) => {
    commitState(prev => ({ ...prev, selectedDiningId: null, diningSets: prev.diningSets?.filter(d => d.id !== id) }), true);
  }, [commitState]);

  const rotateDining = useCallback(() => {
    if (tool === 'dining') {
      setDiningRotation(value => (value + 90) % 360);
      return;
    }
    const id = project.selectedDiningId;
    if (id) commitState(prev => ({
      ...prev, diningSets: prev.diningSets?.map(d => d.id === id ? { ...d, rotation: (d.rotation + 90) % 360 } : d),
    }), true);
  }, [tool, project.selectedDiningId, commitState]);

  const handleAddRoomColumn = useCallback(
    (xCm: number, yCm: number) => {
      const next = cloneProject(project);
      if (!next.columns) next.columns = [];
      const col = createRoomColumn(xCm, yCm, next.settings?.wallHeightCm || 265);
      next.columns.push(col);
      next.selectedColumnId = col.id;
      next.selectedOpeningId = null;
      next.activeBoxId = null;
      next.selectedDoorId = null;
      next.selectedApplianceId = null;
      next.selectedShelfId = null;
      next.selectedHandleId = null;
      next.selectedFrameId = null;
      next.selectedUnitDivider = null;
      next.selectedUnit = null;
      commitState(next, true);
      showToast(`ستون آزاد ${col.widthCm}×${col.depthCm}cm ثبت شد`);
    },
    [project, commitState, showToast]
  );

  const handleUpdateRoomColumn = useCallback((
    id: string, patch: Partial<Pick<RoomColumn, 'xCm' | 'yCm' | 'widthCm' | 'depthCm' | 'heightCm'>>,
    commit = true, _sessionId?: string
  ) => {
    const current = getProject();
    const next = cloneProject(current);
    const col = next.columns?.find(c => c.id === id);
    if (!col) return;
    updateRoomColumn(col, patch);
    const base = dragCheckpointRef.current;
    const before = base?.columns?.find(c => c.id === id);
    if (commit && base && before && (before.xCm !== col.xCm || before.yCm !== col.yCm)) {
      setMeasurement({ label: 'مختصات X ستون', initial: col.xCm, min: -10000, max: 10000,
        other: { label: 'مختصات Y ستون', initial: col.yCm, min: -10000, max: 10000 }, base,
        resolve: (x, _row, y) => {
          const final = cloneProject(next);
          updateRoomColumn(final.columns!.find(c => c.id === id)!, { xCm: x, yCm: y });
          return final;
        } });
      return;
    }
    commitState(next, commit);
  }, [commitState, getProject]);

  const handleDeleteSelectedColumn = useCallback(() => {
    if (!project.selectedColumnId) return;
    const targetId = project.selectedColumnId;
    const next = cloneProject(project);
    next.columns = (next.columns || []).filter((c) => c.id !== targetId);
    next.selectedColumnId = null;
    commitState(next, true);
    showToast('ستون آزاد حذف شد');
  }, [project, commitState, showToast]);

  const handleChangeOpeningSwing = (swing: DoorSwing) => {
    if (!selectedOpening) return;
    mutateActiveWall(
      (w) => {
        const op = w.openings?.find((o) => o.id === selectedOpening.id);
        if (op) updateOpeningGeometry(op, w, { swingDir: swing });
      },
      true,
      'جهت بازشوی درب تغییر یافت'
    );
  };

  const handleDeleteOpening = useCallback(
    (wallId: string, openingId: string) => {
      const next = cloneProject(project);
      const w = next.walls.find((x) => x.id === wallId);
      if (!w) return;
      w.openings = (w.openings || []).filter((o) => o.id !== openingId);
      if (next.selectedOpeningId === openingId) next.selectedOpeningId = null;
      commitState(next, true);
      showToast('پنجره / درب / ستون حذف شد');
    },
    [project, commitState, showToast]
  );

  const handleDeleteBoxFromPlan = (wallId: string, boxId: string) => {
    const next = cloneProject(project);
    const w = next.walls.find((x) => x.id === wallId);
    if (!w) return;
    deleteBoxHierarchically(w, boxId);
    if (next.activeBoxId === boxId || !w.boxes.some((b) => b.id === next.activeBoxId)) {
      next.activeBoxId = null;
      next.selectedDoorId = null;
      next.selectedShelfId = null;
      next.selectedHandleId = null;
    }
    if (
      next.selectedApplianceId &&
      !w.appliances.some((a) => a.id === next.selectedApplianceId)
    ) {
      next.selectedApplianceId = null;
    }
    commitState(next, true);
    showToast('باکس و زیرمجموعه‌های متصل حذف شدند');
  };

  const handleDeleteApplianceFromPlan = (wallId: string, appId: string) => {
    const next = cloneProject(project);
    const w = next.walls.find((x) => x.id === wallId);
    if (!w) return;
    deleteApplianceHierarchically(w, appId);
    if (next.selectedApplianceId === appId) {
      next.selectedApplianceId = null;
    }
    commitState(next, true);
    showToast('تجهیز حذف شد');
  };

  const handleDeleteSelectedAppliance = useCallback(() => {
    if (!activeWall || !selectedAppliance) return;
    const next = cloneProject(project);
    const w = next.walls.find((x) => x.id === activeWall.id);
    if (!w) return;
    deleteApplianceHierarchically(w, selectedAppliance.id);
    next.selectedApplianceId = null;
    commitState(next, true);
    showToast('تجهیز حذف شد');
  }, [activeWall, selectedAppliance, project, commitState, showToast]);

  const handleChangeSelectedApplianceSinkModel = (nextModel: SinkModel) => {
    if (!activeWall || !selectedAppliance || selectedAppliance.kind !== 'sink') return;
    const parentBox = findParentBoxForAppliance(activeWall, selectedAppliance);
    if (!parentBox) {
      mutateActiveWall(
        (w) => {
          const a = w.appliances.find((x) => x.id === selectedAppliance.id);
          if (a) {
            a.sinkModel = nextModel;
            a.width = SINK_MODELS[nextModel].width;
          }
        },
        true,
        `مدل سینک به ${SINK_MODELS[nextModel].shortLabel} تغییر یافت`
      );
      return;
    }
    const next = cloneProject(project);
    const w = next.walls.find((x) => x.id === activeWall.id);
    const b = w?.boxes.find((x) => x.id === parentBox.id);
    if (!w || !b) return;
    const res = placeApplianceWithCabinetRules(
      w,
      next.walls,
      'sink',
      b,
      selectedAppliance.offsetX,
      next.cornerOwners,
      hoodKind,
      { sinkModel: nextModel }
    );
    if (!res.ok) {
      showToast(res.message);
      return;
    }
    next.selectedApplianceId = res.appliance?.id ?? null;
    commitState(next, true);
    showToast(`مدل سینک به ${SINK_MODELS[nextModel].shortLabel} تغییر یافت`);
  };

  const handleSelectedApplianceFinish = (finish: EquipmentFinish) => {
    if (!selectedAppliance) return;
    mutateActiveWall(w => {
      const item = w.appliances.find(a => a.id === selectedAppliance.id);
      if (!item) return;
      if (item.kind === 'sink') item.sinkFinish = finish;
      else if (item.kind === 'gas' && selectedAppliancePart === 'hood') {
        item.hoodFinish = finish;
        item.hoodModel = hoodForFinish(item.hoodModel, finish);
      } else {
        item.finish = finish;
        if (item.kind === 'gas') item.cooktopModel = cooktopForFinish(item.cooktopModel, finish);
      }
    }, true);
  };
  const handleEquipmentFinish = (equipmentFinish: EquipmentFinish) => {
    commitState(prev => ({ ...prev, settings: { ...(prev.settings ?? DEFAULT_PROJECT_SETTINGS), equipmentFinish } }), true);
  };

  const handleUpdateCountertopSettings = (patch: {
    countertopCm?: number;
    countertopTopEdge?: CountertopEdgeProfile;
    countertopBottomEdge?: CountertopEdgeProfile;
  }) => {
    const next = cloneProject(project);
    const curSettings = next.settings ?? { ...DEFAULT_PROJECT_SETTINGS };
    next.settings = { ...curSettings, ...patch };
    if (typeof patch.countertopCm === 'number') {
      const clampedCm = COUNTERTOP_THICKNESS_OPTIONS.reduce<number>((closest, option) =>
        Math.abs(option - patch.countertopCm!) < Math.abs(closest - patch.countertopCm!) ? option : closest,
        COUNTERTOP_THICKNESS_OPTIONS[0]);
      next.settings.countertopCm = clampedCm;
      next.walls.forEach((w) => {
        w.boxes.forEach((b) => {
          if (b.type === 'base') {
            b.countertopCm = clampedCm;
          }
        });
      });
    }
    commitState(next, true);
  };

  const handleToggleSelectedFridgeFrame = (hasFrame: boolean) => {
    if (!activeWall || !activeBox || activeBox.type !== 'fridge') return;
    mutateActiveWall(
      (w) => {
        const b = w.boxes.find((x) => x.id === activeBox.id && x.type === 'fridge');
        if (!b) return;
        const cfg = FRIDGE_MODELS[b.fridgeModel || 'side-by-side'];
        b.hasFridgeFrame = hasFrame;
        if (!hasFrame) b.frames = (b.frames ?? []).filter(frame => !['left','right','top'].includes(frame.side));
        else if (!(b.frames ?? []).some(frame => frame.side === 'left'))
          b.frames = [...(b.frames ?? []), ...(['left','right','top'] as const).map(side => ({
            id: uid('fr'), side, widthCm: FRIDGE_FRAME_CM,
          }))];
        b.height = cfg.height + (hasFrame ? FRIDGE_FRAME_CM : 0);

        const targetW = cfg.width + (hasFrame ? FRIDGE_FRAME_CM * 2 + 2 : 0);
        // Frame toggle must resize the surround unconditionally. A neighbor
        // is not allowed to silently prevent the chosen frame from fitting.
        const preferredOffset = b.offsetX + (b.width - targetW) / 2;
        b.offsetX = Math.max(0, Math.round(
          Math.min(Math.max(0, w.length - targetW), preferredOffset)
        ));
        b.width = targetW;
        if (b.doors.length) {
          b.doors[0].startCm = 0;
          b.doors[0].widthCm = targetW;
        }

        const over = w.boxes.find((other) => other.linkedToBoxId === b.id);
        if (over) {
          const prevTop = over.elevY + over.height;
          over.elevY = b.height;
          over.height = Math.max(30, prevTop - b.height);
          over.offsetX = b.offsetX;
          over.width = b.width;
          if (over.doors.length === 1) {
            over.doors[0].startCm = 0;
            over.doors[0].widthCm = over.width;
          }
          alignAboveFridge(w, b);
        }
      },
      true,
      hasFrame ? 'فریم ۵cm دور یخچال فعال شد' : 'فریم دور یخچال غیرفعال شد'
    );
  };

  const handleResizeUpperDepth = (wallId: string, boxId: string, depthCm: number, commit: boolean) => {
    if (!Number.isFinite(depthCm)) return;
    const rounded = Math.max(25, Math.min(90, Math.round(depthCm / 5) * 5));
    commitState(prev => {
      const next = cloneProject(prev);
      const wall = next.walls.find(w => w.id === wallId);
      const box = wall?.boxes.find(b => b.id === boxId);
      if (!box || (box.type !== 'wall' && box.type !== 'wall-deep')) return prev;
      box.depth = rounded;
      if (box.linkedToBoxId) {
        const fridge = wall?.boxes.find(b => b.id === box.linkedToBoxId);
        if (fridge) fridge.overFridgeDepthMode = rounded === fridge.depth ? 'flush' : '60';
      }
      return next;
    }, commit);
  };

  const fridgeFrontDepth = (fridge: CabinetBox) =>
    fridge.fridgeConcealed ? fridge.depth
      : fridgeFrontCm(fridge.fridgeModel, fridge.fridgeFrameDepthCm === 80 ? 80 : 60);

  const handleSetFridgeConcealed = (enabled: boolean) => {
    if (!activeWall || !activeBox || activeBox.type !== 'fridge') return;
    mutateActiveWall(w => {
      const fridge = w.boxes.find(box => box.id === activeBox.id && box.type === 'fridge');
      if (fridge) {
        const sideBySide = ['fridge-sbs-homebar', 'fridge-instaview-black',
          'fridge-french-4drawer', 'side-by-side'].includes(fridge.fridgeModel ?? '');
        // Only side-by-side models may use the MDF concealed surround.
        fridge.fridgeConcealed = enabled && sideBySide;
        if (fridge.overFridgeDepthMode === 'flush') {
          const linked = w.boxes.find(b => b.linkedToBoxId === fridge.id);
          if (linked) linked.depth = fridgeFrontDepth(fridge);
        }
      }
    }, true);
  };

  const handleSetFridgeFrameDepth = (cm: 60 | 80) => {
    if (!activeBox || activeBox.type !== 'fridge') return;
    mutateActiveWall(w => {
      const fridge = w.boxes.find(b => b.id === activeBox.id && b.type === 'fridge');
      if (fridge) {
        fridge.fridgeFrameDepthCm = cm;
        if (fridge.overFridgeDepthMode === 'flush') {
          const linked = w.boxes.find(b => b.linkedToBoxId === fridge.id);
          if (linked) linked.depth = fridgeFrontDepth(fridge);
        }
      }
    }, true);
  };
  const handleSetFridgeOverDepth = (mode: '60' | 'flush') => {
    if (!activeWall || !activeBox || activeBox.type !== 'fridge') return;
    mutateActiveWall(w => {
      const fridge = w.boxes.find(box => box.id === activeBox.id && box.type === 'fridge');
      if (!fridge) return;
      fridge.overFridgeDepthMode = mode;
      const above = w.boxes.find(box => box.linkedToBoxId === fridge.id);
      if (above) above.depth = mode === '60' ? 60 : fridgeFrontDepth(fridge);
    }, true);
  };

  const handleSetFridgeOverCabinet = (enabled: boolean) => {
    if (!activeWall || !activeBox || activeBox.type !== 'fridge') return;
    mutateActiveWall(w => {
      const fridge = w.boxes.find(box => box.id === activeBox.id && box.type === 'fridge');
      if (!fridge) return;
      const existing = w.boxes.find(box => box.linkedToBoxId === fridge.id);
      if (!enabled) { w.boxes = w.boxes.filter(box => box.linkedToBoxId !== fridge.id); return; }
      if (existing) { alignAboveFridge(w, fridge); return; }
      const top = Math.min(w.height, Math.max(fridge.height + 30,
        (project.settings?.wallCabElevCm ?? 145) + (project.settings?.wallCabHeightCm ?? 75)));
      const over = createEmptyBox('wall-deep', fridge.offsetX, fridge.width, { settings: project.settings });
      over.name = 'بالای یخچال';
      over.elevY = fridge.height;
      over.height = Math.max(30, top - fridge.height);
      over.depth = fridge.overFridgeDepthMode === 'flush' ? fridgeFrontDepth(fridge) : 60;
      over.linkedToBoxId = fridge.id;
      over.doors = [{ id: uid('door'), startCm: 0, widthCm: over.width, kind: 'lift', drawerRatios: [] }];
      w.boxes.push(over);
      alignAboveFridge(w, fridge);
    }, true);
  };

  const handleAddUpperCrownAndUnderboard = () => {
    const next = cloneProject(project);
    let added = 0;
    for (const wall of next.walls) {
      const uppers = wall.boxes.filter(box => box.type === 'wall' || box.type === 'wall-deep');
      for (const box of uppers) {
        const adjacent = (other: typeof box) => other.id !== box.id &&
          other.offsetX < box.offsetX + box.width - 1 && other.offsetX + other.width > box.offsetX + 1;
        const above = uppers.some(other => adjacent(other) && Math.abs(other.elevY - box.elevY - box.height) <= 2);
        const below = uppers.some(other => adjacent(other) && Math.abs(other.elevY + other.height - box.elevY) <= 2);
        const frames = box.frames ?? (box.frames = []);
        for (const side of [!above ? 'top' : null, !below ? 'bottom' : null] as const) {
          if (!side || frames.some(frame => frame.side === side)) continue;
          frames.push({ id: uid('fr'), side, widthCm: 2 }); added++;
        }
      }
    }
    if (added) commitState(next, true);
    showToast(added ? `${added} قطعه تاج و تخته زیر بدون تکرار افزوده شد` : 'تمام تاج‌ها و تخته‌های زیر موجودند');
  };

  const handleSetSelectedFridgeModel = (model: FridgeModel) => {
    if (!activeWall || !activeBox || activeBox.type !== 'fridge') return;
    const next = cloneProject(project);
    const w = next.walls.find(wall => wall.id === activeWall.id);
    if (!w) return;
    const change = updateFridgeBoxModelAndSize(w, next.walls, next.cornerOwners ?? {},
      activeBox.id, model);
    if (!change.ok) return showToast(change.message);
    const updated = w.boxes.find(box => box.id === activeBox.id && box.type === 'fridge');
    if (updated && !['fridge-sbs-homebar','fridge-instaview-black',
        'fridge-french-4drawer','side-by-side'].includes(model)) {
      updated.fridgeConcealed = false;
    }
    if (updated?.overFridgeDepthMode === 'flush') {
      const linked = w.boxes.find(box => box.linkedToBoxId === updated.id);
      if (linked) linked.depth = fridgeFrontDepth(updated);
    }
    if (updated) alignAboveFridge(w, updated);
    const beforeFinish = fridgeModelFinish(activeBox.fridgeModel);
    const afterFinish = fridgeModelFinish(model);
    commitState(next, true);
    setFinishSyncPrompt(beforeFinish !== afterFinish ? { finish: afterFinish } : null);
    showToast('مدل یخچال انتخاب‌شده تغییر کرد');
  };
  const handleSetSelectedCooktopModel = (model: CooktopModel) => {
    if (!selectedAppliance || selectedAppliance.kind !== 'gas') return;
    mutateActiveWall(w => {
      const app = w.appliances.find(a => a.id === selectedAppliance.id && a.kind === 'gas');
      if (app) app.cooktopModel = model;
    }, true);
  };
  const handleSetSelectedHoodModel = (model: HoodModel) => {
    if (!selectedAppliance || selectedAppliance.kind !== 'gas') return;
    mutateActiveWall(w => {
      const app = w.appliances.find(a => a.id === selectedAppliance.id && a.kind === 'gas');
      if (app) app.hoodModel = model;
    }, true);
  };
  const handleSetSelectedFlame = (enabled: boolean) => {
    if (!selectedAppliance || selectedAppliance.kind !== 'gas') return;
    mutateActiveWall(w => {
      const app = w.appliances.find(a => a.id === selectedAppliance.id && a.kind === 'gas');
      if (app) app.flameOn = enabled;
    }, true);
  };

  const handleChangeSelectedApplianceHood = (nextHood: 'hidden' | 'chimney') => {
    if (!activeWall || !selectedAppliance || selectedAppliance.kind !== 'gas') return;
    if (nextHood === 'chimney' && requiresIntegratedHood(activeWall, selectedAppliance)) {
      showToast('در کابینت هوایی دوطبقه، هود به‌صورت مخفی نصب می‌شود');
      return;
    }
    mutateActiveWall(
      (w) => {
        const a = w.appliances.find((x) => x.id === selectedAppliance.id);
        if (!a) return;
        clearHoodUnitForGas(w, a.offsetX, a.offsetX + a.width, a.id);
        a.hoodKind = nextHood;
        syncHoodUnitAboveGas(w, a);
      },
      true,
      `نوع هود به ${nextHood === 'hidden' ? 'مخفی' : 'شومینه‌ای'} تغییر یافت و یونیت هود به‌روزرسانی شد`
    );
  };

  const handleDeleteSelectedShelf = useCallback(() => {
    if (!activeWall || !project.selectedShelfId) return;
    const shelfId = project.selectedShelfId;
    const next = cloneProject(project);
    const w = next.walls.find((x) => x.id === activeWall.id);
    if (!w) return;
    let deleted = false;
    for (const b of w.boxes) {
      const before = b.shelves.length;
      b.shelves = b.shelves.filter((sh) => sh.id !== shelfId);
      if (b.shelves.length !== before) deleted = true;
    }
    if (deleted) {
      next.selectedShelfId = null;
      commitState(next, true);
      showToast('طبقه حذف شد');
    }
  }, [activeWall, project, commitState, showToast]);

  const resolveActiveUnitSpanForShelves = useCallback(
    (w: (typeof project.walls)[number], b: (typeof w.boxes)[number]): { startCm: number; endCm: number } | null => {
      if (project.selectedUnit && project.selectedUnit.boxId === b.id) {
        return { startCm: project.selectedUnit.startCm, endCm: project.selectedUnit.endCm };
      }
      const blocked = getCornerBlockedZonesForWall(w, project.walls, project.cornerOwners);
      const units = getUnitsInBox(b, blocked);
      if (selectedDoor && b.doors.some((d) => d.id === selectedDoor.id)) {
        const mid = selectedDoor.startCm + selectedDoor.widthCm / 2;
        const found = units.find((u) => mid >= u.startCm - 1 && mid <= u.endCm + 1);
        if (found) return { startCm: found.startCm, endCm: found.endCm };
      }
      if (units.length === 1) {
        return { startCm: units[0].startCm, endCm: units[0].endCm };
      }
      return null;
    },
    [project.selectedUnit, project.walls, project.cornerOwners, selectedDoor]
  );

  const handleQuickAddMiddleShelfForUnit = useCallback(() => {
    if (!activeWall || !activeBox || activeBox.type === 'fridge') return;
    const next = cloneProject(project);
    const w = next.walls.find((x) => x.id === activeWall.id);
    const b = w?.boxes.find((x) => x.id === activeBox.id);
    if (!w || !b) return;
    const span = resolveActiveUnitSpanForShelves(w, b);
    const sCm = span ? span.startCm : 0;
    const eCm = span ? span.endCm : b.width;
    const res = addShelvesWithMinGap(b, sCm, eCm, 1, 0.5);
    if (!res.ok) {
      showToast(res.message);
      return;
    }
    commitState(next, true);
    showToast('طبقه وسط به یونیت اضافه شد');
  }, [activeWall, activeBox, project, resolveActiveUnitSpanForShelves, commitState, showToast]);

  const handleClearUnitShelves = useCallback(() => {
    if (!activeWall || !activeBox) return;
    const next = cloneProject(project);
    const w = next.walls.find((x) => x.id === activeWall.id);
    const b = w?.boxes.find((x) => x.id === activeBox.id);
    if (!w || !b) return;
    const span = resolveActiveUnitSpanForShelves(w, b);
    if (!span) return;
    const before = b.shelves.length;
    b.shelves = b.shelves.filter(
      (sh) => sh.endCm <= span.startCm + 2 || sh.startCm >= span.endCm - 2
    );
    if (b.shelves.length === before) {
      showToast('طبقه‌ای در این یونیت وجود ندارد');
      return;
    }
    next.selectedShelfId = null;
    commitState(next, true);
    showToast('طبقات یونیت حذف شد');
  }, [activeWall, activeBox, project, resolveActiveUnitSpanForShelves, commitState, showToast]);

  const handleClearBoxShelves = useCallback(() => {
    if (!activeWall || !activeBox) return;
    const next = cloneProject(project);
    const w = next.walls.find((x) => x.id === activeWall.id);
    const b = w?.boxes.find((x) => x.id === activeBox.id);
    if (!w || !b || b.shelves.length === 0) return;
    b.shelves = [];
    next.selectedShelfId = null;
    commitState(next, true);
    showToast('همه طبقات باکس حذف شد');
  }, [activeWall, activeBox, project, commitState, showToast]);

  const handleDeleteSelectedHandle = useCallback(() => {
    if (!activeWall || !project.selectedHandleId) return;
    const handleId = project.selectedHandleId;
    const next = cloneProject(project);
    const w = next.walls.find((x) => x.id === activeWall.id);
    if (!w) return;
    let deleted = false;
    for (const b of w.boxes) {
      const before = b.handles.length;
      b.handles = b.handles.filter((h) => h.id !== handleId);
      if (b.handles.length !== before) deleted = true;
    }
    if (deleted) {
      next.selectedHandleId = null;
      commitState(next, true);
      showToast('دستگیره حذف شد');
    }
  }, [activeWall, project, commitState, showToast]);

  const handleDeleteSelectedFrame = useCallback(() => {
    if (!activeWall || !project.selectedFrameId) return;
    const frameId = project.selectedFrameId;
    const next = cloneProject(project);
    const w = next.walls.find((x) => x.id === activeWall.id);
    if (!w) return;
    let deleted = false;
    for (const b of w.boxes) {
      if (!b.frames?.length) continue;
      const before = b.frames.length;
      b.frames = b.frames.filter((f) => f.id !== frameId);
      if (b.frames.length !== before) deleted = true;
    }
    if (deleted) {
      next.selectedFrameId = null;
      commitState(next, true);
      showToast('فریم حذف شد');
    }
  }, [activeWall, project, commitState, showToast]);

  const handleDeleteSelectedUnitDivider = useCallback(() => {
    if (!activeWall || !project.selectedUnitDivider) return;
    const { boxId, seamCm } = project.selectedUnitDivider;
    const next = cloneProject(project);
    const w = next.walls.find((x) => x.id === activeWall.id);
    const b = w?.boxes.find((x) => x.id === boxId);
    if (!w || !b) return;
    const blocked = getCornerBlockedZonesForWall(w, next.walls, next.cornerOwners);
    const res = removeUnitDividerWithSync(b, seamCm, blocked);
    if (!res.ok) {
      showToast(res.message);
      return;
    }
    next.selectedUnitDivider = null;
    commitState(next, true);
    showToast(res.message);
  }, [activeWall, project, commitState, showToast]);

  const handleSetDoorOrientWithClamp = useCallback(
    (nextOrient: Orientation) => {
      setDoorOrient(nextOrient);
      const isWall = activeBox?.type === 'wall' || activeBox?.type === 'wall-deep';
      if (nextOrient === 'horizontal' && isWall) {
        if (doorTargetWidth < 50) setDoorTargetWidth(80);
      } else if (nextOrient === 'vertical' && doorTargetWidth > 60) {
        setDoorTargetWidth(60);
      }
    },
    [activeBox, doorTargetWidth]
  );

  const handleSetDoorKind = (
    kind: DoorKind,
    drawerRatios: number[] = [],
    drawerBand?: { position: 'top' | 'bottom'; ratio: number } | null
  ) => {
    if (!selectedDoor || !activeBox || !activeWall) return;
    mutateActiveWall((w) => {
      const b = w.boxes.find((x) => x.id === activeBox.id);
      const d = b?.doors.find((x) => x.id === selectedDoor.id);
      if (!d || !b) return;
      d.kind = kind;
      d.drawerRatios = [...drawerRatios];
      if (drawerBand) {
        d.drawerBand = { ...drawerBand };
      } else {
        delete d.drawerBand;
      }
      b.handles = b.handles.filter((h) => h.doorId !== d.id);
      d.hingeSide = undefined;
    }, true);
  };

  const executeDoorStyle = useCallback(
    (
      boxId: string | null,
      doorIds: string[] | null,
      style: DoorStyle,
      scope: 'target' | 'all-neoclassic',
      persistSkip?: boolean
    ) => {
      if (!activeWall) return;
      const next = cloneProject(project);
      if (persistSkip) next.skipStylePrompt = true;

      let applied = 0;
      if (scope === 'all-neoclassic') {
        next.designStyle = 'neoclassic';
        for (const w of next.walls) {
          for (const b of w.boxes) {
            applied += applyDoorStyleToDoors(b, null, style);
          }
        }
      } else {
        if (boxId) {
          for (const w of next.walls) {
            const b = w.boxes.find((x) => x.id === boxId);
            if (b) {
              applied += applyDoorStyleToDoors(b, doorIds, style);
              next.activeWallId = w.id;
              break;
            }
          }
        } else if (doorIds && doorIds.length > 0) {
          for (const w of next.walls) {
            for (const b of w.boxes) {
              applied += applyDoorStyleToDoors(b, doorIds, style);
            }
          }
        }
      }

      if (applied === 0 && scope !== 'all-neoclassic') {
        showToast('دربی برای تغییر مدل یافت نشد');
        return;
      }

      commitState(next, true);
      const metaLabel = DOOR_STYLE_META[style].label;
      showToast(
        scope === 'all-neoclassic'
          ? `تمام درب‌های پروژه به سبک نئوکلاسیک (${metaLabel}) تغییر یافت`
          : `${applied} درب به مدل ${metaLabel} تغییر یافت`
      );
    },
    [activeWall, project, commitState, showToast]
  );

  const handleApplyDoorStyle = useCallback(
    (boxId: string | null, doorIds: string[] | null, style: DoorStyle) => {
      if (
        style === 'cnc' &&
        (project.designStyle || 'modern') === 'modern' &&
        !project.skipStylePrompt
      ) {
        setStylePromptModal({
          open: true,
          targetBoxId: boxId,
          targetDoorIds: doorIds,
          requestedStyle: style,
          remember: false,
        });
        return;
      }
      executeDoorStyle(boxId, doorIds, style, 'target');
    },
    [project.designStyle, project.skipStylePrompt, executeDoorStyle]
  );

  const handleApplyDoorStyleToSelected = () => {
    const ids =
      project.multiSelection?.doorIds.length
        ? project.multiSelection.doorIds
        : project.selectedDoorId
        ? [project.selectedDoorId]
        : [];
    if (!ids.length) {
      showToast('ابتدا یک یا چند درب را انتخاب کنید');
      return;
    }
    handleApplyDoorStyle(null, ids, doorStyleBrush);
  };

  const handleApplyDoorStyleToBox = () => {
    if (!activeBox) {
      showToast('ابتدا یک باکس را انتخاب کنید');
      return;
    }
    handleApplyDoorStyle(activeBox.id, null, doorStyleBrush);
  };

  const handleApplyHardwareKind = useCallback(
    (boxId: string | null, doorIds: string[] | null, hardware: HardwareKind) => {
      const next = cloneProject(project);
      let applied = 0;
      if (boxId) {
        for (const w of next.walls) {
          const b = w.boxes.find((x) => x.id === boxId);
          if (b) {
            applied += applyHardwareKindToDoors(b, doorIds, hardware);
            next.activeWallId = w.id;
            break;
          }
        }
      } else if (doorIds && doorIds.length > 0) {
        for (const w of next.walls) {
          for (const b of w.boxes) {
            applied += applyHardwareKindToDoors(b, doorIds, hardware);
          }
        }
      }
      if (applied === 0) {
        showToast('دربی برای تغییر نوع یراق یافت نشد');
        return;
      }
      commitState(next, true);
      showToast(`${applied} درب به یراق «${HARDWARE_KIND_META[hardware].label}» تغییر یافت`);
    },
    [project, commitState, showToast]
  );

  const handleApplyHardwareToSelected = () => {
    const ids =
      project.multiSelection?.doorIds.length
        ? project.multiSelection.doorIds
        : project.selectedDoorId
        ? [project.selectedDoorId]
        : [];
    if (!ids.length) {
      showToast('ابتدا یک یا چند درب را انتخاب کنید');
      return;
    }
    handleApplyHardwareKind(null, ids, hardwareBrush);
  };

  const handleApplyHardwareToBox = () => {
    if (!activeBox) {
      showToast('ابتدا یک باکس را انتخاب کنید');
      return;
    }
    handleApplyHardwareKind(activeBox.id, null, hardwareBrush);
  };

  const handleResizeSelectedDrawerDoor = useCallback(
    (desiredWidthCm: number, edge: 'left' | 'right' = 'right', commit = true) => {
      if (!activeWall || !activeBox || !selectedDoor || selectedDoor.kind !== 'drawer') return;
      const next = cloneProject(project);
      const w = next.walls.find((x) => x.id === activeWall.id);
      const b = w?.boxes.find((x) => x.id === activeBox.id);
      if (!w || !b) return;
      const blocked = getCornerBlockedZonesForWall(w, next.walls, next.cornerOwners);
      const res = resizeDrawerUnitWidthCm(b, selectedDoor.id, edge, desiredWidthCm, blocked);
      if (!res.ok) return;
      commitState(next, commit);
    },
    [activeWall, activeBox, selectedDoor, project, commitState]
  );

  const handleAutoPlaceHandlesForUnit = useCallback(() => {
    if (!activeWall || !activeBox) {
      showToast('ابتدا یک باکس یا یونیت را انتخاب کنید');
      return;
    }
    const run = () => {
      const next = cloneProject(project);
      const w = next.walls.find((x) => x.id === activeWall.id);
      const b = w?.boxes.find((x) => x.id === activeBox.id);
      if (!w || !b) return;
      const blocked = getCornerBlockedZonesForWall(w, next.walls, next.cornerOwners);
      const startCm = project.selectedUnit ? project.selectedUnit.startCm : 0;
      const endCm = project.selectedUnit ? project.selectedUnit.endCm : b.width;
      const placed = autoPlaceHandlesForUnit(b, startCm, endCm, handleStyle, handleOrient, blocked);
      if (!placed) {
        showToast('دربی در این محدوده برای نصب خودکار دستگیره یافت نشد');
        return;
      }
      commitState(next, true);
      showToast(`${placed} دستگیره مطابق جهت لولا به‌صورت خودکار نصب شد`);
    };
    if (handleStyle === 'hidden' && project.designStyle === 'neoclassic') {
      setHiddenHandleWarnModal({ onConfirm: run });
      return;
    }
    run();
  }, [activeWall, activeBox, project, handleStyle, handleOrient, commitState, showToast]);

  const handleEqualizeSelected = (axis: 'vertical' | 'horizontal') => {
    const ids = project.multiSelection?.doorIds.length
      ? project.multiSelection.doorIds
      : project.selectedDoorId ? [project.selectedDoorId] : [];
    if (ids.length < 2) {
      showToast(axis === 'vertical' ? 'حداقل دو درب عمودی انتخاب کنید' : 'حداقل دو مجموعه کشو انتخاب کنید');
      return;
    }
    const next = cloneProject(project);
    let changed = 0;
    let error = '';
    for (const wall of next.walls) for (const box of wall.boxes) {
      const selectedInBox = ids.filter(id => box.doors.some(d => d.id === id));
      if (selectedInBox.length < 2) continue;
      const res = axis === 'vertical'
        ? equalizeSelectedVerticalWidths(box, selectedInBox)
        : equalizeSelectedDrawerHeights(box, selectedInBox);
      if (res.ok) changed++;
      else error = res.message;
    }
    if (!changed) {
      showToast(error || 'حداقل دو آیتم هم‌نوع از یک باکس را انتخاب کنید');
      return;
    }
    commitState(next, true);
    showToast(axis === 'vertical' ? 'فقط عرض درب‌های انتخاب‌شده برابر شد'
      : 'فقط ارتفاع کشوهای انتخاب‌شده برابر شد');
  };
  const handleEqualizeVertical = () => handleEqualizeSelected('vertical');
  const handleEqualizeHorizontal = () => handleEqualizeSelected('horizontal');

  const handleEqualizeAndFill = () => {
    if (!activeWall || !activeBox) return;
    const next = cloneProject(project);
    const w = next.walls.find((x) => x.id === activeWall.id);
    const b = w?.boxes.find((x) => x.id === activeBox.id);
    if (!w || !b) return;
    const blocked = getCornerBlockedZonesForWall(w, next.walls, next.cornerOwners);
    const res = equalizeDoorsAndFillGaps(
      b,
      blocked,
      w,
      next.walls,
      next.cornerOwners,
      next.selectedDoorId
    );
    if (!res.ok) {
      showToast(res.message);
      return;
    }
    commitState(next, true);
    showToast(res.message);
  };

  const handleCompactDoorsAndAppliances = () => {
    if (!activeWall || !activeBox) return;
    const next = cloneProject(project);
    const w = next.walls.find((x) => x.id === activeWall.id);
    const b = w?.boxes.find((x) => x.id === activeBox.id);
    if (!w || !b) return;
    const blocked = getCornerBlockedZonesForWall(w, next.walls, next.cornerOwners);
    const res = compactDisconnectedDoorsInBox(b, blocked, w, next.walls, next.cornerOwners);
    if (!res.ok) {
      showToast(res.message);
      return;
    }
    commitState(next, true);
    showToast(res.message);
  };

  const handleAlignWallAndBaseDoors = () => {
    if (!activeWall) return;
    const next = cloneProject(project);
    const w = next.walls.find((x) => x.id === activeWall.id);
    if (!w) return;
    const res = alignWallAndBaseDoorSeams(w, next.walls, next.cornerOwners);
    if (!res.ok) {
      showToast(res.message);
      return;
    }
    commitState(next, true);
    showToast(res.message);
  };

  const handleApplyFullBoxFrame = () => {
    if (!activeWall || !activeBox) {
      showToast('ابتدا یک باکس را انتخاب کنید');
      return;
    }
    const next = cloneProject(project);
    const w = next.walls.find((x) => x.id === activeWall.id);
    const b = w?.boxes.find((x) => x.id === activeBox.id);
    if (!w || !b) return;
    const blocked = getCornerBlockedZonesForWall(w, next.walls, next.cornerOwners);
    const exposure = getBoxSideExposure(b, w, next.walls, next.cornerOwners, blocked);
    const res = applyFullBoxFrame(b, frameWidthCm, exposure);
    if (!res.ok) {
      showToast(res.message);
      return;
    }
    commitState(next, true);
    showToast(res.message);
  };

  const handleSelectAllBoxDoors = () => {
    if (!activeBox) {
      showToast('ابتدا یک باکس را انتخاب کنید');
      return;
    }
    const ids = activeBox.doors
      .filter((d) => d.kind !== 'fridge' && d.kind !== 'open')
      .map((d) => d.id);
    if (!ids.length) {
      showToast('دربی در باکس فعال وجود ندارد');
      return;
    }
    handleSetMultiSelection({
      boxIds: [],
      doorIds: ids,
      openingIds: [],
      applianceIds: [],
    });
    showToast(`${ids.length} درب باکس فعال انتخاب شدند`);
  };

  const handleApplyHandlesToDoors = (mode: 'selected' | 'box') => {
    if (!activeWall) return;
    const targetIds =
      mode === 'selected'
        ? project.multiSelection?.doorIds.length
          ? project.multiSelection.doorIds
          : project.selectedDoorId
          ? [project.selectedDoorId]
          : []
        : null;

    if (mode === 'selected' && (!targetIds || !targetIds.length)) {
      showToast('ابتدا یک یا چند درب را انتخاب کنید');
      return;
    }
    if (mode === 'box' && !activeBox) {
      showToast('ابتدا یک باکس را انتخاب کنید');
      return;
    }

    const targetBoxes =
      mode === 'box' && activeBox
        ? [activeBox]
        : project.walls.flatMap((w) =>
            w.boxes.filter((b) => b.doors.some((d) => targetIds?.includes(d.id)))
          );
    const hasCncTarget = targetBoxes.some((b) =>
      b.doors.some(
        (d) => (!targetIds || targetIds.includes(d.id)) && d.doorStyle === 'cnc'
      )
    );

    const run = () => {
      const next = cloneProject(project);
      let applied = 0;
      let highlighted = false;

      if (mode === 'selected' && targetIds) {
        for (const w of next.walls) {
          const blocked = getCornerBlockedZonesForWall(w, next.walls, next.cornerOwners);
          for (const b of w.boxes) {
            if (!b.doors.some((d) => targetIds.includes(d.id))) continue;
            const autoRes = autoUnitizeBoxForHandles(b, blocked);
            if (autoRes.addedDividers.length > 0 && !highlighted) {
              triggerAutoUnitHighlight(b.id);
              highlighted = true;
            }
            applied += applyHandlesToBoxDoors(b, targetIds, handleStyle, handleOrient, undefined, blocked);
          }
        }
      } else {
        const w = next.walls.find((x) => x.id === activeWall.id);
        const b = w?.boxes.find((x) => x.id === activeBox?.id);
        if (!w || !b) return;
        const blocked = getCornerBlockedZonesForWall(w, next.walls, next.cornerOwners);
        const autoRes = autoUnitizeBoxForHandles(b, blocked);
        if (autoRes.addedDividers.length > 0) {
          triggerAutoUnitHighlight(b.id);
        }
        applied = applyHandlesToBoxDoors(b, null, handleStyle, handleOrient, undefined, blocked);
      }

      if (applied === 0) {
        showToast('درب فعالی برای نصب دستگیره یافت نشد');
        return;
      }
      commitState(next, true);
      showToast(`${applied} دستگیره روی درب‌ها نصب شد`);
    };

    if (handleStyle === 'hidden' && (project.designStyle === 'neoclassic' || hasCncTarget)) {
      setHiddenHandleWarnModal({ onConfirm: run });
      return;
    }
    run();
  };

  const canMirrorFront = Boolean(
    project.selectedHandleId || project.selectedDoorId || project.multiSelection?.doorIds.length ||
    project.multiSelection?.boxIds.length || (!project.selectedApplianceId && activeBox?.doors.length)
  );

  const handleMirrorBox = () => {
    const current = getProject();
    const next = cloneProject(current);
    const selected = current.multiSelection;
    const doorIds = new Set(selected?.doorIds ?? []);
    const boxIds = new Set(selected?.boxIds ?? []);
    if (current.selectedDoorId) doorIds.add(current.selectedDoorId);
    if (!doorIds.size && !boxIds.size && !current.selectedHandleId && current.activeBoxId) {
      boxIds.add(current.activeBoxId);
    }
    let changed = false;
    for (const wall of next.walls) for (const box of wall.boxes) {
      const selectedHandle = box.handles.find(handle => handle.id === current.selectedHandleId);
      for (const door of box.doors) {
        if (!doorIds.has(door.id) && !boxIds.has(box.id) && selectedHandle?.doorId !== door.id) continue;
        const handles = box.handles.filter(handle => handle.doorId === door.id);
        if (door.kind === 'door' && door.hardwareKind !== 'pantry-pullout') {
          const fallback = handles[0] && handles[0].xRatio <= 0.35 ? 'right' : 'left';
          door.hingeSide = (door.hingeSide ?? fallback) === 'left' ? 'right' : 'left';
          changed = true;
        }
        for (const handle of handles) {
          handle.xRatio = +(1 - handle.xRatio).toFixed(4);
          changed = true;
        }
      }
    }
    if (!changed) return;
    commitState(next, true);
    showToast('سمت لولا و دستگیره قرینه شد');
  };

  const handleAlignBox = (pos: 'left' | 'center' | 'right') => {
    const next = cloneProject(project);
    const ids = project.multiSelection?.doorIds.length
      ? project.multiSelection.doorIds
      : project.selectedDoorId ? [project.selectedDoorId] : [];
    // Door selection comes first: do NOT move the whole box when a door
    // within it is selected. Unselected doors remain in their original place.
    if (ids.length > 0) {
      let changed = 0;
      let message = '';
      for (const wall of next.walls) for (const box of wall.boxes) {
        const inBox = ids.filter(id => box.doors.some(door => door.id === id));
        if (!inBox.length) continue;
        const result = alignSelectedDoorsInBox(box, inBox, pos);
        if (result.ok) changed++;
        message = result.message;
      }
      if (changed) commitState(next, true);
      showToast(message || 'درب انتخاب‌شده پیدا نشد');
      return;
    }

    // Keep existing gas/sink/hood/corner solver: position of the selection
    // is measured against its parent cabinet front, not the wall midpoint.
    const appIds = project.multiSelection?.applianceIds.length
      ? project.multiSelection.applianceIds
      : project.selectedApplianceId ? [project.selectedApplianceId] : [];
    if (appIds.length) {
      let count = 0;
      let message = '';
      for (const appId of appIds) {
        const wall = next.walls.find(w => w.appliances.some(a => a.id === appId));
        if (!wall) continue;
        const result = alignApplianceOnBoxFront(wall, next.walls, appId, pos, next.cornerOwners);
        if (result.ok) count++;
        message = result.message;
      }
      if (count) commitState(next, true);
      showToast(message || 'تجهیز انتخاب‌شده پیدا نشد');
      return;
    }

    // Structural unit boundaries are not a free-moving door/appliance.
    // Do not accidentally move the entire parent cabinet when a unit is
    // selected. This protects the cabinetry/dividers until a safe unit
    // translation rule is explicitly requested.
    if (project.selectedUnit && !project.multiSelection?.boxIds.length) {
      showToast('یونیت ساختاری انتخاب شده است؛ برای تراز، درب، کشو، تجهیز یا باکس را انتخاب کنید');
      return;
    }
    const boxes = project.multiSelection?.boxIds.length
      ? project.multiSelection.boxIds
      : project.activeBoxId ? [project.activeBoxId] : [];
    let count = 0;
    for (const id of boxes) {
      const wall = next.walls.find(w => w.boxes.some(b => b.id === id));
      const box = wall?.boxes.find(b => b.id === id);
      if (!wall || !box) continue;
      const range = getFreeMoveRangeForBox(wall, next.walls, box, next.cornerOwners);
      const clamp = (x: number) => Math.max(range.minX, Math.min(range.maxX, x));
      const left = clamp(Number.isFinite(range.minX) ? range.minX : 0);
      const right = clamp(Number.isFinite(range.maxX) ? range.maxX : wall.length - box.width);
      const target = pos === 'left' ? left : pos === 'right' ? right : (left + right) / 2;
      if (Math.abs(box.offsetX - target) < .1) continue;
      moveBoxHierarchically(wall, next.walls, box.id, target, next.cornerOwners);
      count++;
    }
    if (count) commitState(next, true);
    showToast(count ? 'آیتم‌های انتخابی تا محدوده آزاد جابه‌جا شدند'
      : 'آیتمی انتخاب نشده یا فضای آزاد دیگری وجود ندارد');
  };

  const handleDeleteSelectedBox = useCallback(() => {
    if (!activeBox) return;
    const deletedId = activeBox.id;
    const next = cloneProject(project);
    const w = next.walls.find((x) => x.id === next.activeWallId) || next.walls[0];
    if (!w) return;
    deleteBoxHierarchically(w, deletedId);
    if (next.activeBoxId === deletedId || !w.boxes.some((b) => b.id === next.activeBoxId)) {
      next.activeBoxId = null;
      next.selectedDoorId = null;
      next.selectedShelfId = null;
      next.selectedHandleId = null;
    }
    if (
      next.selectedApplianceId &&
      !w.appliances.some((a) => a.id === next.selectedApplianceId)
    ) {
      next.selectedApplianceId = null;
    }
    commitState(next, true);
    showToast('باکس و زیرمجموعه‌های متصل حذف شدند');
  }, [activeBox, project, commitState, showToast]);

  const handleMoveWallNode = (refs: WallNodeRef[], x: number, y: number, commit: boolean) => {
    const base = dragCheckpointRef.current || getProject();
    const resolvePoint = (px: number, _row: boolean, py = y) => {
      const next = cloneProject(base);
      return moveSmartWallNode(next.walls, refs, px, py, true) ? next : null;
    };
    const next = resolvePoint(x, false);
    if (!next) {
      if (commit) { setProject(base); showToast('این اندازه برای دیوار یا متعلقاتش جا نمی‌گذارد'); }
      return;
    }
    commitState(next, commit);
  };

  const handleMoveWall = useCallback((
    wallId: string, dx: number, dy: number, component: boolean, commit: boolean, _sessionId?: string
  ) => {
    const base = dragCheckpointRef.current || getProject();
    const resolveWall = (x: number, _row: boolean, y = dy) => {
      const next = cloneProject(base);
      return moveConnectedWall(next.walls, wallId, x, y, component, true) ? next : null;
    };
    const next = resolveWall(dx, false);
    if (!next) {
      if (commit) { setProject(base); showToast('جابه‌جایی برای دیوار متصل یا متعلقاتش جا نمی‌گذارد'); }
      return;
    }
    commitState(next, commit);
  }, [commitState, getProject, setProject, showToast]);

  const handleMoveBox = useCallback((
    wallId: string, boxId: string, desiredOffsetX: number, commit: boolean, _sessionId?: string
  ) => {
    const next = cloneProject(dragCheckpointRef.current || getProject());
    const wall = next.walls.find(w => w.id === wallId);
    if (wall && moveBoxHierarchically(wall, next.walls, boxId, desiredOffsetX, next.cornerOwners)) commitState(next, commit);
  }, [getProject, commitState]);

  const handleMoveAppliance = useCallback((
    wallId: string, appId: string, desiredOffsetX: number, commit: boolean, _sessionId?: string
  ) => {
    const next = cloneProject(dragCheckpointRef.current || getProject());
    const wall = next.walls.find(w => w.id === wallId);
    if (wall && moveApplianceHierarchically(wall, next.walls, appId, desiredOffsetX, next.cornerOwners, { refitAdjacentDoors: true })) {
      commitState(next, commit);
    }
  }, [getProject, commitState]);

  const executeDeleteWall = useCallback(
    (wallId: string) => {
      const next = cloneProject(project);
      next.walls = next.walls.filter((w) => w.id !== wallId);
      if (next.activeWallId === wallId) {
        next.activeWallId = next.walls[0]?.id ?? null;
        next.activeBoxId = next.walls[0]?.boxes[0]?.id ?? null;
        next.selectedDoorId = null;
        next.selectedOpeningId = null;
        next.selectedApplianceId = null;
        next.selectedShelfId = null;
        next.selectedHandleId = null;
        next.selectedFrameId = null;
        next.selectedUnitDivider = null;
        next.selectedUnit = null;
      }
      commitState(next, true);
      showToast('دیوار حذف شد');
    },
    [project, commitState, showToast]
  );

  const handleDeleteWall = useCallback(
    (wallId: string) => {
      const w = project.walls.find((x) => x.id === wallId);
      if (!w) return;
      const hasContent =
        w.boxes.length > 0 || w.appliances.length > 0 || (w.openings?.length || 0) > 0;
      if (hasContent) {
        setConfirmModal({
          title: `حذف دیوار «${w.name}»؟`,
          message: `این دیوار دارای ${w.boxes.length} باکس${
            w.appliances.length ? ` و ${w.appliances.length} تجهیز` : ''
          } است. برای جلوگیری از پاک‌شدن ناخواسته، حذف دیوار را تأیید کنید.`,
          confirmLabel: 'بله، دیوار و باکس‌ها حذف شوند',
          danger: true,
          onConfirm: () => executeDeleteWall(wallId),
        });
        return;
      }
      executeDeleteWall(wallId);
    },
    [project.walls, executeDeleteWall]
  );

  const handleOptimizeAppliances = () => {
    if (!activeWall || !activeBox) return;
    const next = cloneProject(project);
    const w = next.walls.find((x) => x.id === activeWall.id);
    const b = w?.boxes.find((x) => x.id === activeBox.id);
    if (!w || !b) return;
    const res = optimizeBoxWithAppliances(w, next.walls, b, next.cornerOwners);
    if (!res.ok) {
      showToast(res.message);
      return;
    }
    commitState(next, true);
    showToast(res.message);
  };

  const handleSetMultiSelection = useCallback((m?: MultiSelection) => {
    setProject((p) => ({ ...p, multiSelection: m }));
  }, []);

  const handleSetSelectionMode = useCallback(
    (mode: SelectionMode) => {
      setSelectionMode(mode);
      if (mode === 'add') {
        if (tool !== 'select' && tool !== 'handle' && tool !== 'door-style') {
          setTool('select');
        }
        setProject((prev) => {
          const existing = prev.multiSelection;
          const hasMulti =
            existing &&
            existing.boxIds.length +
              existing.doorIds.length +
              existing.openingIds.length +
              existing.applianceIds.length >
              0;
          if (hasMulti) return prev;
          const seed: MultiSelection = {
            boxIds: !prev.selectedDoorId && prev.activeBoxId ? [prev.activeBoxId] : [],
            doorIds: prev.selectedDoorId ? [prev.selectedDoorId] : [],
            openingIds: prev.selectedOpeningId ? [prev.selectedOpeningId] : [],
            applianceIds: prev.selectedApplianceId ? [prev.selectedApplianceId] : [],
          };
          const total =
            seed.boxIds.length + seed.doorIds.length + seed.openingIds.length + seed.applianceIds.length;
          return total > 0 ? { ...prev, multiSelection: seed } : prev;
        });
        showToast('حالت انتخاب جمعی (+): با کلیک به انتخاب‌ها اضافه می‌شود');
      } else if (mode === 'subtract') {
        if (tool !== 'select' && tool !== 'handle' && tool !== 'door-style') {
          setTool('select');
        }
        showToast('حالت کم کردن (−): با کلیک از انتخاب‌ها کم می‌شود');
      } else {
        showToast('حالت انتخاب تکی (●)');
      }
    },
    [tool, showToast]
  );

  const handleApplyFinish = useCallback(
    (
      target: 'box' | 'all-cabinets' | 'backsplash' | 'countertop',
      wallId?: string,
      boxId?: string,
      overrideId?: string,
      doorId?: string,
    ) => {
      const next = cloneProject(getProject());
      if (target === 'backsplash') {
        let bsId = (overrideId as BacksplashFinishId) || backsplashBrush;
        if (!overrideId && (next.backsplashFinish || 'calacatta-marble') === bsId) {
          const curIdx = Math.max(0, BACKSPLASH_FINISH_ORDER.indexOf(bsId));
          bsId = BACKSPLASH_FINISH_ORDER[(curIdx + 1) % BACKSPLASH_FINISH_ORDER.length];
          setBacksplashBrush(bsId);
        }
        next.backsplashFinish = bsId;
        commitState(next, true);
        showToast(`کاشی بین‌کابینتی: ${BACKSPLASH_FINISHES[bsId].label}`);
        return;
      }
      if (target === 'countertop') {
        const ctId = (overrideId as CountertopFinishId) || countertopBrush;
        next.countertopFinish = ctId;
        commitState(next, true);
        showToast(`صفحه کابینت: ${COUNTERTOP_FINISHES[ctId].label}`);
        return;
      }
      const cabId = (overrideId as CabinetFinishId) || cabinetFinishBrush;
      if (target === 'all-cabinets') {
        next.cabinetFinish = cabId;
        for (const w of next.walls) {
          for (const b of w.boxes) {
            delete b.finish;
            for (const door of b.doors) delete door.finish;
          }
        }
        commitState(next, true);
        showToast(`رنگ کل کابینت‌ها به ${CABINET_FINISHES[cabId].label} تغییر یافت`);
        return;
      }
      const targetWall =
        (wallId ? next.walls.find((w) => w.id === wallId) : undefined) ||
        next.walls.find((w) => w.id === next.activeWallId) ||
        next.walls[0];
      const targetBoxId = boxId || next.activeBoxId;
      if (!targetWall || !targetBoxId) {
        next.cabinetFinish = cabId;
        commitState(next, true);
        showToast(`رنگ پیش‌فرض کابینت‌ها: ${CABINET_FINISHES[cabId].label}`);
        return;
      }
      const box = targetWall.boxes.find((b) => b.id === targetBoxId);
      if (!box || box.type === 'fridge') return;
      if (doorId) {
        const door = box.doors.find(item => item.id === doorId);
        if (!door || door.kind === 'fridge' || door.finish === cabId) return;
        door.finish = cabId;
      } else {
        box.finish = cabId;
        delete box.color;
        delete box.texture;
        for (const door of box.doors) delete door.finish;
      }
      next.activeWallId = targetWall.id;
      commitState(next, true);
      showToast(`رنگ باکس «${box.name}»: ${CABINET_FINISHES[cabId].label}`);
    },
    [getProject, cabinetFinishBrush, backsplashBrush, countertopBrush, commitState, showToast]
  );

  const handleBulkDelete = useCallback(() => {
    const ms = project.multiSelection;
    if (!ms) return;
    const total = ms.boxIds.length + ms.doorIds.length + ms.openingIds.length + ms.applianceIds.length;
    if (total === 0) return;

    const next = cloneProject(project);
    const boxSet = new Set(ms.boxIds);
    const doorSet = new Set(ms.doorIds);
    const opSet = new Set(ms.openingIds);
    const appSet = new Set(ms.applianceIds);

    for (const w of next.walls) {
      for (const bid of ms.boxIds) {
        if (w.boxes.some((b) => b.id === bid)) deleteBoxHierarchically(w, bid);
      }
      for (const b of w.boxes) {
        for (const dId of ms.doorIds) {
          if (b.doors.some((d) => d.id === dId)) {
            eraseDoorWithRule(b, dId);
          }
        }
        b.doors = b.doors.filter((d) => !doorSet.has(d.id));
      }
      w.openings = (w.openings || []).filter((o) => !opSet.has(o.id));
      for (const aId of ms.applianceIds) {
        if (w.appliances.some((a) => a.id === aId)) deleteApplianceHierarchically(w, aId);
      }
    }

    if (next.activeBoxId && boxSet.has(next.activeBoxId)) {
      next.activeBoxId = null;
      next.selectedDoorId = null;
      next.selectedShelfId = null;
      next.selectedHandleId = null;
      next.selectedFrameId = null;
    }
    if (next.selectedOpeningId && opSet.has(next.selectedOpeningId)) {
      next.selectedOpeningId = null;
    }
    if (next.selectedApplianceId && appSet.has(next.selectedApplianceId)) {
      next.selectedApplianceId = null;
    }
    next.multiSelection = undefined;
    commitState(next, true);
    showToast('موارد انتخاب‌شده با هم حذف شدند');
  }, [project, commitState, showToast]);

  const handleBulkSetDoorKind = (kind: DoorKind, ratios: number[] = []) => {
    const ms = project.multiSelection;
    if (!ms || !ms.doorIds.length) return;
    const doorSet = new Set(ms.doorIds);
    const next = cloneProject(project);
    for (const w of next.walls) {
      for (const b of w.boxes) {
        for (const d of b.doors) {
          if (doorSet.has(d.id) && d.kind !== 'fridge') {
            d.kind = kind;
            d.drawerRatios = [...ratios];
            b.handles = b.handles.filter((h) => h.doorId !== d.id);
          }
        }
      }
    }
    commitState(next, true);
    showToast('نوع درب‌های انتخاب‌شده به‌صورت گروهی تغییر یافت');
  };

  const handleBulkEqualizeDoors = () => {
    const ms = project.multiSelection;
    if (!ms) return;
    const next = cloneProject(project);
    const doorSet = new Set(ms.doorIds);
    const boxSet = new Set(ms.boxIds);
    let count = 0;
    for (const w of next.walls) {
      const blocked = getCornerBlockedZonesForWall(w, next.walls, next.cornerOwners);
      for (const b of w.boxes) {
        if (boxSet.has(b.id) || b.doors.some((d) => doorSet.has(d.id))) {
          const res = equalizeVerticalDoorsInBox(b, blocked, w, next.walls, next.cornerOwners);
          if (res.ok) count++;
        }
      }
    }
    if (count > 0) {
      commitState(next, true);
      showToast('درب‌های باکس‌های انتخاب‌شده مساوی‌سازی شدند');
    }
  };

  const canEqualizeVertical = useMemo(() => {
    const ids = project.multiSelection?.doorIds || [];
    return project.walls.some(w => w.boxes.some(b =>
      b.doors.filter(d => ids.includes(d.id) && d.kind === 'door').length >= 2
    ));
  }, [project.multiSelection, project.walls]);
  const canEqualizeHorizontal = useMemo(() => {
    const ids = project.multiSelection?.doorIds || [];
    return project.walls.some(w => w.boxes.some(b =>
      b.doors.filter(d => ids.includes(d.id) && d.kind === 'drawer').length >= 2
    ));
  }, [project.multiSelection, project.walls]);

  const selectedDiningItem = project.diningSets?.find(item => item.id === project.selectedDiningId);
  const selectedDiningSeats = selectedDiningItem && selectedDiningItem.kind !== 'tv' ? selectedDiningItem.seats : undefined;
  const upperLightBoxes = project.walls.flatMap(w => w.boxes).filter(b => b.type === 'wall' || b.type === 'wall-deep');
  const selectedUppers = upperLightBoxes.filter(b => b.id === project.activeBoxId || project.multiSelection?.boxIds.includes(b.id));
  const selectedLightBoxes = selectedUppers;
  const lightsOn = getKitchenCabinetLightMode(project) !== 'off';
  const toggleLightBoxes = (boxIds: string[]) => {
    const ids = new Set(boxIds);
    if (!ids.size) return;
    const mode = getKitchenCabinetLightMode(project) === 'off' ? 'linear' : 'off';
    commitState(prev => ({ ...prev,
      settings: { ...(prev.settings ?? DEFAULT_PROJECT_SETTINGS), underCabinetLightMode: mode },
      walls: prev.walls.map(wall => ({ ...wall, boxes: wall.boxes.map(box =>
        (box.type === 'wall' || box.type === 'wall-deep')
          ? { ...box, lighting: { ...getCabinetLighting(box), mode }, underCabinetLight: mode === 'linear' } : box) })),
    }), true);
  };
  const toggleUnderCabinetLight = () => toggleLightBoxes(upperLightBoxes.map(box => box.id));

  const hasAnySelection = Boolean(
    project.selectedDiningId ||
    (project.multiSelection &&
      project.multiSelection.boxIds.length +
        project.multiSelection.doorIds.length +
        project.multiSelection.openingIds.length +
        project.multiSelection.applianceIds.length >
        0) ||
      project.selectedUnitDivider ||
      project.selectedFrameId ||
      project.selectedShelfId ||
      project.selectedHandleId ||
      selectedColumn ||
      selectedAppliance ||
      selectedOpening ||
      selectedDoor ||
      activeBox ||
      activeWall
  );

  const handleZoomToSelected = useCallback(() => {
    if (!hasAnySelection) {
      showToast('ابتدا یک باکس، درب، تجهیز یا ستون را انتخاب کنید');
      return;
    }
    if (viewMode === '2d') {
      fitWallToView(activeWall);
      return;
    }
    setZoomSelectedSeq((n) => n + 1);
  }, [hasAnySelection, viewMode, fitWallToView, activeWall, showToast]);

  const handleCopySelection = useCallback(() => {
    const dining = project.diningSets?.find(d => d.id === project.selectedDiningId);
    if (dining) {
      const copy = { ...dining, id: uid('dining'), xCm: dining.xCm + 25, yCm: dining.yCm + 25 };
      commitState(prev => ({ ...prev, diningSets: [...(prev.diningSets ?? []), copy], selectedDiningId: copy.id }), true);
      return;
    }
    const result=copySelection(project);
    if(result.next)commitState(result.next,true);
    showToast(result.message);
  },[project,commitState,showToast]);

  const handleDeleteCurrentSelection = useCallback(() => {
    if (project.selectedDiningId) {
      deleteDining(project.selectedDiningId);
      return true;
    }
    const ms = project.multiSelection;
    const hasMulti =
      ms &&
      ms.boxIds.length + ms.doorIds.length + ms.openingIds.length + ms.applianceIds.length > 0;

    if (hasMulti) {
      handleBulkDelete();
      return true;
    }
    if (selectedColumn) {
      handleDeleteSelectedColumn();
      return true;
    }
    if (project.selectedUnitDivider) {
      handleDeleteSelectedUnitDivider();
      return true;
    }
    if (project.selectedFrameId) {
      handleDeleteSelectedFrame();
      return true;
    }
    if (project.selectedShelfId) {
      handleDeleteSelectedShelf();
      return true;
    }
    if (project.selectedHandleId) {
      handleDeleteSelectedHandle();
      return true;
    }
    if (activeWall && selectedAppliance) {
      handleDeleteSelectedAppliance();
      return true;
    }
    if (activeWall && project.selectedOpeningId) {
      handleDeleteOpening(activeWall.id, project.selectedOpeningId);
      return true;
    }
    if (activeWall && activeBox && selectedDoor) {
      const next = cloneProject(project);
      const w = next.walls.find((x) => x.id === activeWall.id);
      const b = w?.boxes.find((x) => x.id === activeBox.id);
      if (w && b) {
        const msg = eraseDoorWithRule(b, selectedDoor.id);
        next.selectedDoorId = null;
        commitState(next, true);
        showToast(msg || 'درب حذف شد');
        return true;
      }
    }
    if (activeBox) {
      handleDeleteSelectedBox();
      return true;
    }
    if (activeWall) {
      handleDeleteWall(activeWall.id);
      return true;
    }
    return false;
  }, [
    project,
    selectedColumn,
    activeWall,
    activeBox,
    selectedDoor,
    selectedAppliance,
    handleBulkDelete,
    handleDeleteSelectedColumn,
    handleDeleteSelectedUnitDivider,
    handleDeleteSelectedFrame,
    handleDeleteSelectedShelf,
    handleDeleteSelectedHandle,
    handleDeleteSelectedAppliance,
    handleDeleteOpening,
    handleDeleteSelectedBox,
    handleDeleteWall,
    deleteDining,
    commitState,
    showToast,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        handleCopySelection();
      } else if (e.key.toLowerCase() === 'z' && !e.ctrlKey && !e.metaKey && viewMode === '3d') {
        e.preventDefault();
        handleZoomToSelected();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (handleDeleteCurrentSelection()) {
          e.preventDefault();
        }
      } else if (tool === 'move' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && activeWall && selectedAppliance) {
        e.preventDefault();
        const step = e.key === 'ArrowRight' ? 5 : -5;
        handleMoveAppliance(activeWall.id, selectedAppliance.id, selectedAppliance.offsetX + step, true);
      } else if (e.key === 'Escape' && tool !== 'select') {
        e.preventDefault();
        handleExitToSelect();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    handleDeleteCurrentSelection,
    handleCopySelection,
    handleZoomToSelected,
    handleExitToSelect,
    handleMoveAppliance,
    activeWall,
    selectedAppliance,
    tool,
    viewMode,
  ]);

  const closeSceneSettings = () => {
    setPreviewHdrRotation(null);
    setSettingsOpen(false);
  };

  const handleSaveSettings = (nextSettings: ProjectSettings, applyToExisting: boolean, lights: Record<string, CabinetLighting>, ovens: Record<string, boolean>) => {
    const next = cloneProject(project);
    next.settings = nextSettings;
    next.walls.forEach(wall => wall.appliances.forEach(app => {
      if (ovens[app.id] !== undefined) app.ovenLightOn = ovens[app.id];
    }));
    next.walls.forEach(wall => wall.boxes.forEach(box => {
      if (lights[box.id]) {
        box.lighting = { ...lights[box.id] };
        box.underCabinetLight = box.lighting.mode === 'linear';
      }
    }));
    const previous = project.settings ?? DEFAULT_PROJECT_SETTINGS;
    const resizeWalls = applyToExisting && nextSettings.wallHeightCm !== previous.wallHeightCm;
    if (resizeWalls) {
      next.walls.forEach(wall => {
        const cabinetTop = wall.boxes.reduce((top, box) => Math.max(top, box.elevY + box.height), 0);
        wall.height = Math.max(cabinetTop, nextSettings.wallHeightCm);
        (wall.openings || []).forEach(opening => {
          if (opening.kind === 'column') opening.height = wall.height;
          else updateOpeningGeometry(opening, wall, {});
        });
      });
    }
    commitState(next, true);
    closeSceneSettings();
    if (resizeWalls) fitWallToView(next.walls.find(wall => wall.id === next.activeWallId) || next.walls[0] || null);
    showToast('تنظیمات صحنه ذخیره شد');
  };

  const hintText = useMemo(() => {
    const map: Record<ToolId, string> = {
      select: 'برای انتخاب روی قطعه کلیک کنید',
      move: 'قطعه یا دستگیرهٔ تغییر اندازه را بکشید. Shift هنگام کشیدن دیوار، کل مجموعهٔ متصل را حرکت می‌دهد.',
      wall: 'رسم دیوار: کلیک و ادامه دهید (راست‌کلیک = لغو و بازگشت به انتخاب)',
      'cab-draw': 'کشیدن کابینت: نوع باکس را انتخاب کرده و روی دیوار بکشید (راست‌کلیک = انتخاب)',
      fridge: 'درج یخچال (+ فریم ۵cm): اسکرول روی دیوار = تغییر مدل | کلیک روی کابینت = برش خودکار فضا',
      sink: `درج ${SINK_MODELS[sinkModel].shortLabel}: اسکرول روی باکس زمینی = تغییر مدل سینک`,
      gas: `درج گاز ${gasWidth}cm (متصل به هود و کشو): اسکرول = تغییر عرض گاز`,
      appliance: `درج ${APPLIANCE_CONFIGS[applianceKind].shortLabel}: اسکرول = ظرفشویی / لباسشویی`,
      dining: furnitureKind === 'tv' ? 'ست تلویزیون: محل قرارگیری روی کف را انتخاب کنید'
        : 'میز ناهارخوری: ظرفیت را انتخاب کنید و میز را روی کف قرار دهید',
      opening: `درج ${OPENING_LABELS[openingKind]}: اسکرول روی دیوار = تغییر نوع | کلیک = ثبت`,
      'front-cut': `مداد تقسیم ${frontCutOrient === 'vertical' ? 'عمودی' : 'افقی'}: روی نما تقسیم کنید، در فضای خالی جهت را عوض کنید`,
      doors: `درب‌گذاری (${doorTargetWidth}cm): اسکرول روی باکس = الگو / تعداد | کلیک بیرون = چرخش`,
      hardware: `نوع یراق (${HARDWARE_KIND_META[hardwareBrush].label}): اسکرول = تغییر یراق | کلیک روی درب = اعمال`,
      'door-style': `مدل درب (${DOOR_STYLE_META[doorStyleBrush].label}): اسکرول = تغییر مدل | کلیک روی درب = اعمال`,
      finish: `رنگ و متریال (${CABINET_FINISHES[cabinetFinishBrush].shortLabel}): اسکرول روی کابینت/کاشی/صفحه = تغییر | کلیک = اعمال`,
      pencil: `یونیت و طبقه (${shelfOrient === 'vertical' ? 'جداکننده عمودی (اسنپ مرکز ۵۰٪)' : 'طبقه افقی'}): درز دو درب = دیواره یونیت | فضای خالی = طبقه`,
      skeleton: 'یونیت‌بندی و طبقه: اسکرول روی باکس = تعداد طبقه | مرز دو درب = دیواره یونیت',
      frame: `فریم (${frameWidthCm}cm): اسکرول = عرض ۳ تا ۱۱cm | کلیک یا درگ روی لبه‌های آزاد و درز درب‌ها`,
      handle: 'دستگیره: کلیک بیرون باکس = چرخش ۹۰° | انتخاب چند درب = نصب گروهی دستگیره',
      eraser: 'پاک‌کن: حذف فریم، دستگیره، طبقه، یونیت، پنجره/درب/ستون، تجهیز، درب، باکس یا دیوار خالی',
    };
    return map[tool];
  }, [tool, sinkModel, gasWidth, applianceKind, openingKind, doorTargetWidth, frameWidthCm, doorStyleBrush, hardwareBrush, shelfOrient, furnitureKind, frontCutOrient]);

  const handleExportProject = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(project, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "cabinet_design_project.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('فایل پروژه با موفقیت خروجی گرفته شد');
  };

  const handleImportProject = (jsonText: string) => {
    try {
      const parsed = JSON.parse(jsonText) as ProjectState;
      if (parsed && Array.isArray(parsed.walls)) {
        const normalized = normalizeProject(parsed);
        dragBaseRef.current = null;
        resetHistory(normalized);
        fitWallToView(normalized.walls[0] || null);
        showToast('پروژه با موفقیت بارگذاری شد');
      } else {
        showToast('فرمت فایل پروژه نامعتبر است');
      }
    } catch {
      showToast('خطا در خواندن فایل پروژه');
    }
  };

  /** Start immersive AR in the SAME user click, before React rerenders the 3D editor.
   * WebXR requires transient user activation: requesting it from an effect or after
   * opening an intermediate page would be rejected by tablet browsers. */
  const beginTrackedFloorScan = useCallback(() => {
    if (!arAvailable) {
      showToast('AR فقط روی گوشی یا تبلت با مرورگر سازگار فعال است؛ نمای سه‌بعدی در دسترس است.');
      return;
    }
    if (floorScanActive) {
      setViewMode('3d');
      setSharedWideMode('normal');
      return;
    }
    setTrackedFloorConfirmed(false);
    setSharedWideMode('normal');
    // Chido's scan UI must appear IMMEDIATELY, including when WebXR cannot
    // start. It is the scan screen itself that reports the actual XR failure.
    // A failed permission request must never silently replace scanning with
    // the ordinary 3D editor (regression from the earlier implementation).
    setViewMode('3d');
    setTool('select');
    setFloorScanActive(true);
    setInitialXrSession(null);
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!xr || typeof xr.requestSession !== 'function') {
      showToast('اسکن کف باز شد؛ این مرورگر WebXR ندارد. برای دوربین واقعی از Chrome اندروید با ARCore استفاده کنید.');
      return;
    }
    try {
      // Call requestSession synchronously within the Welcome/Projects tap:
      // waiting for a React mount loses the user activation needed by WebXR.
      const requested = requestChidoSession(xr, document.body);
      void requested.catch(() => {}); // The scanner displays the actual error.
      setInitialXrSession(requested);
    } catch (error) {
      console.warn('[Kitchyar XR] synchronous session request failed:', error);
      showToast('اسکن کف باز شد، ولی شروع دوربین رد شد. دلیل دقیق داخل پنل اسکن نمایش داده می‌شود.');
    }
  }, [showToast, arAvailable, floorScanActive]);

  const handleSwitchViewMode = useCallback(
    (nextMode: ViewMode) => {
      if (nextMode === 'ar') {
        beginTrackedFloorScan();
        return;
      }
      if (nextMode === '3d' && floorScanActive) {
        setViewMode('3d');
        if (trackedFloorConfirmed) setSharedWideMode('wide');
        return;
      }
      if (nextMode === '2d') {
        const w = project.walls.find((x) => x.id === project.activeWallId) || project.walls[0] || null;
        window.setTimeout(() => fitWallToView(w), 60);
      }
      setViewMode(nextMode);
    },
    [project.walls, project.activeWallId, fitWallToView, beginTrackedFloorScan, floorScanActive, trackedFloorConfirmed]
  );

  const handleLoadRecordIntoEditor = useCallback(
    (rec: SavedProjectRecord, mode: ViewMode) => {
      const normalized = normalizeProject(rec.state);
      dragBaseRef.current = null;
      setActiveProjectId(rec.id);
      persistActiveProjectId(rec.id);
      resetHistory(normalized);
      setHoodKind(normalized.settings?.defaultHoodKind || 'chimney');
      if (mode === 'ar') beginTrackedFloorScan();
      else { setFloorScanActive(false); setInitialXrSession(null); }
      setViewMode(mode === 'ar' ? '3d' : mode);
      setScreen('editor');
      setTool('select');
      window.setTimeout(() => fitWallToView(normalized.walls[0] || null), 80);
    },
    [fitWallToView, beginTrackedFloorScan]
  );

  const handleCreateAndOpenProject = useCallback(
    (mode: ViewMode, preset?: PresetMode) => {
      const labelMap: Record<PresetMode, string> = {
        single: 'آشپزخانه تک‌دیوار',
        L: 'آشپزخانه L-شکل',
        U: 'آشپزخانه U-شکل',
        closet: 'کمد دیواری',
      };
      const name = preset
        ? `${labelMap[preset]} #${projects.length + 1}`
        : mode === 'ar'
        ? `پروژه AR #${projects.length + 1}`
        : `پروژه جدید #${projects.length + 1}`;
      const rec = createProjectRecord(name, mode, preset);
      const updated = [rec, ...projects];
      setProjects(updated);
      saveProjectsList(updated);
      handleLoadRecordIntoEditor(rec, mode);
    },
    [projects, handleLoadRecordIntoEditor]
  );

  const handleApplyStylePreset = useCallback(
    (preset: KitchenStylePreset, applyCabinetModel: boolean) => {
      const applied = applyKitchenStylePreset(project, preset, applyCabinetModel);
      if (!applied) return;
      commitState(applied.next, true);
      if (applyCabinetModel) setHoodKind(preset.defaultHoodKind);
      setStyleGalleryOpen(false);
      showToast(`استایل «${preset.title}» روی پروژه اعمال شد`);
    },
    [project, commitState, showToast]
  );

  const handleSmartDesign = useCallback(() => {
    if (project.walls.length === 0) {
      showToast('ابتدا حداقل یک دیوار یا کابینت رسم کنید');
      return;
    }
    const res = applySmartKitchenDesign(project);
    if (!res.changed) {
      showToast(res.summary);
      return;
    }
    if (res.firstWallId) res.next.activeWallId = res.firstWallId;
    if (res.firstBoxId) res.next.activeBoxId = res.firstBoxId;
    commitState(res.next, true);
    showToast(res.summary);
  }, [project, commitState, showToast]);

  const handleSmartUnitize = useCallback(
    (scope: 'box' | 'all' = activeBox ? 'box' : 'all') => {
      if (project.walls.length === 0) {
        showToast('ابتدا حداقل یک دیوار یا کابینت رسم کنید');
        return;
      }
      const next = cloneProject(project);
      let totalDivs = 0;
      let totalPantries = 0;
      let totalPairs = 0;
      let totalThree = 0;
      let touchedBoxes = 0;
      let firstHighlightBoxId: string | null = null;

      for (const w of next.walls) {
        const blocked = getCornerBlockedZonesForWall(w, next.walls, next.cornerOwners);
        for (const b of w.boxes) {
          if (scope === 'box' && activeBox && b.id !== activeBox.id) continue;
          if (b.type === 'fridge' || b.doors.length === 0) continue;
          const res = optimizeBoxUnitsSmart(b, w, next.walls, blocked, {
            allowThreeDoorUnit: allowThreeDoorPantryUnit,
          });
          touchedBoxes++;
          totalDivs += res.addedDividers;
          totalPantries += res.pantryCount;
          totalPairs += res.pairedUnits;
          totalThree += res.threeDoorUnits;
          if (!firstHighlightBoxId) firstHighlightBoxId = b.id;
        }
      }

      if (touchedBoxes === 0) {
        showToast('باکس دارای درب برای یونیت‌بندی یافت نشد');
        return;
      }
      commitState(next, true);
      if (firstHighlightBoxId) triggerAutoUnitHighlight(firstHighlightBoxId);
      const parts: string[] = [];
      if (totalPairs > 0) parts.push(`${totalPairs} یونیت جفت`);
      if (totalPantries > 0) parts.push(`${totalPantries} سوپری کشویی`);
      if (totalThree > 0) parts.push(`${totalThree} یونیت ۳دربه`);
      if (totalDivs > 0) parts.push(`${totalDivs} جداکننده`);
      showToast(
        parts.length > 0
          ? `یونیت‌بندی هوشمند انجام شد: ${parts.join(' · ')}`
          : 'یونیت‌بندی و جهت لولای درب‌ها به‌روزرسانی شد'
      );
    },
    [project, activeBox, allowThreeDoorPantryUnit, commitState, showToast, triggerAutoUnitHighlight]
  );

  const handleExitEditorTo = useCallback((target: 'welcome' | 'projects') => {
    setArSessionKillSignal((n) => n + 1);
    setFloorScanActive(false);
    setInitialXrSession(null);
    // Leaving the editor must also release fullscreen and its viewport insets.
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    setScreen(target);
  }, []);

  if (screen === 'welcome') {
    return (
      <>
        <WelcomeScreen
          onNewProject={() => handleCreateAndOpenProject('2d')}
          arAvailable={arAvailable}
          projectsCount={projects.length}
          latestProject={activeProjectRecord}
          onStartMode={(mode, preset) => handleCreateAndOpenProject(mode, preset)}
          onContinueLatest={(mode) => {
            if (activeProjectRecord) handleLoadRecordIntoEditor(activeProjectRecord, mode);
            else handleCreateAndOpenProject(mode, 'L');
          }}
          onOpenProjects={() => setScreen('projects')}
          onOpenStyles={() => {
            if (activeProjectRecord) handleLoadRecordIntoEditor(activeProjectRecord, '3d');
            setStyleGalleryOpen(true);
          }}
        />
        {styleGalleryOpen && (
          <StyleGalleryModal
            onApplyStyle={handleApplyStylePreset}
            onClose={() => setStyleGalleryOpen(false)}
          />
        )}
      </>
    );
  }

  if (screen === 'projects') {
    return (
      <ProjectsScreen
        arAvailable={arAvailable}
        projects={projects}
        activeProjectId={activeProjectId}
        onBackToWelcome={() => setScreen('welcome')}
        onOpenProject={(id, mode) => {
          const found = projects.find((p) => p.id === id);
          if (found) handleLoadRecordIntoEditor(found, mode);
        }}
        onCreateProject={(mode, preset) => handleCreateAndOpenProject(mode, preset)}
        onDuplicateProject={(id) => {
          const src = projects.find((p) => p.id === id);
          if (!src) return;
          const copy: SavedProjectRecord = {
            ...JSON.parse(JSON.stringify(src)),
            id: `proj_${Math.random().toString(36).slice(2, 9)}`,
            name: `${src.name} (کپی)`,
            updatedAt: Date.now(),
          };
          const next = [copy, ...projects];
          setProjects(next);
          saveProjectsList(next);
        }}
        onRenameProject={(id, name) => {
          const next = projects.map((p) => (p.id === id ? { ...p, name, updatedAt: Date.now() } : p));
          setProjects(next);
          saveProjectsList(next);
        }}
        onDeleteProject={(id) => {
          if (projects.length <= 1) return;
          const next = projects.filter((p) => p.id !== id);
          setProjects(next);
          saveProjectsList(next);
          if (activeProjectId === id && next[0]) {
            setActiveProjectId(next[0].id);
            persistActiveProjectId(next[0].id);
          }
        }}
        onExportProjectRecord={(rec) => {
          const dataStr =
            'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(rec.state, null, 2));
          const a = document.createElement('a');
          a.setAttribute('href', dataStr);
          a.setAttribute('download', `${rec.name || 'kichiyar_project'}.json`);
          document.body.appendChild(a);
          a.click();
          a.remove();
        }}
        onImportProjectFile={(jsonText) => {
          try {
            const parsed = JSON.parse(jsonText) as ProjectState;
            if (!parsed || !Array.isArray(parsed.walls)) {
              showToast('فرمت فایل JSON معتبر نیست');
              return;
            }
            const rec = createProjectRecord(`پروژه واردشده #${projects.length + 1}`, '2d');
            rec.state = normalizeProject(parsed);
            rec.wallCount = rec.state.walls.length;
            rec.boxCount = rec.state.walls.reduce((s, w) => s + w.boxes.length, 0);
            const next = [rec, ...projects];
            setProjects(next);
            saveProjectsList(next);
            handleLoadRecordIntoEditor(rec, '2d');
          } catch {
            showToast('خطا در خواندن فایل JSON');
          }
        }}
      />
    );
  }

  const dialogOpen = Boolean(measurement || confirmModal || hiddenHandleWarnModal || stylePromptModal?.open || settingsOpen || styleGalleryOpen || auditOpen);
  const setBoxAppearance = (patch: { color?: string; texture?: CabinetTextureId } & SurfaceFinishPatch) => {
    if (!activeBox || activeBox.type === 'fridge') return;
    mutateActiveWall(w => {
      const box = w.boxes.find(b => b.id === activeBox.id);
      if (box) Object.assign(box, patch);
    }, true);
  };
  const setSelectedCabinetDimension = (field: 'height' | 'elevY' | 'plinth', value: number) => {
    if (!activeWall || !activeBox || !Number.isFinite(value)) return;
    if (field !== 'plinth') {
      editCabinetDimension(activeWall.id, activeBox.id, field, value, true);
      return;
    }
    if (activeBox.type !== 'base') return;
    mutateActiveWall(wall => {
      const box = wall.boxes.find(item => item.id === activeBox.id);
      if (!box) return;
      box.plinth = Math.max(0, Math.min(20, box.height - box.countertopCm - 25, value));
      clampBoxInternalsAfterResize(box);
    }, true);
  };
  const setSelectedSurfaceFinish = (surface: 'countertop' | 'backsplash', patch: SurfaceFinishPatch) => {
    commitState(prev => {
      const settings = { ...(prev.settings ?? DEFAULT_PROJECT_SETTINGS) };
      const reflectionKey = surface === 'countertop' ? 'countertopReflection' : 'backsplashReflection';
      const roughnessKey = surface === 'countertop' ? 'countertopRoughness' : 'backsplashRoughness';
      if (patch.reflection !== undefined) settings[reflectionKey] = patch.reflection;
      if (patch.roughness !== undefined) settings[roughnessKey] = patch.roughness;
      return { ...prev, settings };
    }, true);
  };
  const setCabinetLighting = (patch: Partial<CabinetLighting>) => {
    if (!activeBox || (activeBox.type !== 'wall' && activeBox.type !== 'wall-deep')) return;
    commitState(prev => ({
      ...prev,
      walls: prev.walls.map(wall => ({ ...wall, boxes: wall.boxes.map(box => {
        if (box.id !== activeBox.id) return box;
        const lighting = { ...getCabinetLighting(box), ...patch };
        return { ...box, lighting, underCabinetLight: lighting.mode === 'linear' };
      }) })),
    }), true);
  };
  const setBoxFacadeLight = (enabled: boolean) => {
    if (!activeBox || (activeBox.type !== 'wall' && activeBox.type !== 'wall-deep')) return;
    mutateActiveWall(w => {
      const box = w.boxes.find(box => box.id === activeBox.id);
      if (box) box.facadeLightEnabled = enabled;
    }, true);
  };
  const setFrameColor = (color?: string) => {
    if (!selectedFrame || !activeBox) return;
    mutateActiveWall(w => {
      const frame = w.boxes.find(b => b.id === activeBox.id)?.frames?.find(f => f.id === selectedFrame.id);
      if (frame) frame.color = color;
    }, true);
  };

  return (
    <ToolGuideHost.Provider value={toolGuideHost}>
    <div
      ref={editorOverlayRef}
      data-testid="editor-shell"
        data-active-tool={tool}
      className={`kichiyar-safe-root kitchiyar-editor-shell w-full flex flex-col overflow-hidden relative text-slate-900 ${
        floorScanActive || viewMode === 'ar' ? 'bg-transparent' : 'bg-slate-50'
      }`}
    >
      <div className="flex shrink-0 flex-col z-30" inert={dialogOpen}>
      <TopBar
        canUndo={historyIdx > 0}
        canRedo={historyIdx < history.length - 1}
        viewMode={viewMode}
        designStyle={project.designStyle}
        hasActiveBox={Boolean(activeBox)}
        hasSelectedUnit={Boolean(project.selectedUnit)}
        hasSelectedAppliance={Boolean(selectedAppliance)}
        hasBaseAndWallBoxes={Boolean(
          activeWall &&
            activeWall.boxes.some((b) => b.type === 'base') &&
            activeWall.boxes.some((b) => b.type === 'wall' || b.type === 'wall-deep')
        )}
        selectedApplianceName={
          selectedAppliance
            ? selectedAppliance.kind === 'gas'
              ? 'گاز و هود'
              : selectedAppliance.kind === 'sink'
              ? 'سینک'
              : APPLIANCE_CONFIGS[selectedAppliance.kind].shortLabel
            : undefined
        }
        canEqualizeVertical={canEqualizeVertical}
        canEqualizeHorizontal={canEqualizeHorizontal}
        activeBoxName={activeBox?.name}
        projectName={activeProjectRecord?.name}
        onOpenProjects={() => handleExitEditorTo('projects')}
        onOpenWelcome={() => handleExitEditorTo('welcome')}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
        onOpenStyles={() => setStyleGalleryOpen(true)}
        onSmartDesign={handleSmartDesign}
        onSmartUnitize={() => handleSmartUnitize(activeBox ? 'box' : 'all')}
        onNewProject={() => handleCreateAndOpenProject('2d')}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSelectViewMode={handleSwitchViewMode}
        arAvailable={arAvailable}
        floorScanActive={floorScanActive}
        arViewActive={floorScanActive && viewMode === '3d' && sharedWideMode === 'normal'}
        onToggleFloorScan={() => {
          beginTrackedFloorScan();
        }}
        onOpenSettings={() => setSettingsOpen(true)}
        onAuditKitchen={() => setAuditOpen(true)}
        onExportProject={handleExportProject}
        onImportProject={handleImportProject}
        onEqualizeVertical={handleEqualizeVertical}
        onEqualizeHorizontal={handleEqualizeHorizontal}
        onEqualizeDoorsAndFill={handleEqualizeAndFill}
        onCompactDoorsAndAppliances={handleCompactDoorsAndAppliances}
        onAlignWallAndBaseDoors={handleAlignWallAndBaseDoors}
        onMirrorBox={handleMirrorBox}
        canMirrorFront={canMirrorFront}
        onAlignBox={handleAlignBox}
        onMoveUnit={handleMoveUnit}
        cameraToolbarRef={setCameraToolbarHost}
      />
      </div>

      <div hidden={dialogOpen || ((tool === 'select' || tool === 'move') && !toast)} className="shrink-0 border-b border-slate-200 bg-slate-50">
        <div className="flex h-10 items-center justify-center gap-2 overflow-hidden px-2">
          <div ref={setToolGuideHost} className="kitchyar-tool-guides flex min-w-0 items-center" />
          {toast && <div role="status" title={toast} className="min-w-0 truncate rounded-lg bg-slate-900 px-3 py-1 text-[13px] font-bold text-white">{toast}</div>}
        </div>
      </div>

      <div inert={dialogOpen} className="kitchiyar-editor-main flex flex-1 min-h-0 min-w-0 overflow-hidden relative">
        {viewMode !== 'ar' && (
          <div className={`flex-1 min-h-0 min-w-0 flex overflow-hidden relative z-20 ${floorScanActive ? 'bg-transparent' : 'bg-slate-50'}`}>
            <SideInspector
              activeTool={tool}
              diningSelected={Boolean(project.selectedDiningId)}
              selectedDiningSeats={selectedDiningSeats}
              selectedDiningShape={selectedDiningItem?.kind === 'tv' ? undefined : selectedDiningItem?.shape}
              onSetSelectedDiningShape={shape => commitState(prev => ({
                ...prev, diningSets: prev.diningSets?.map(item =>
                  item.id === prev.selectedDiningId && item.kind !== 'tv' ? { ...item, shape } : item),
              }), true)}
              onSetDiningSeats={seats => commitState(prev => ({
                ...prev, diningSets: prev.diningSets?.map(item =>
                  item.id === prev.selectedDiningId && item.kind !== 'tv' ? { ...item, seats } : item),
              }), true)}
              onRotateDining={rotateDining}
              onSelectTool={handleSelectTool}
              selectionWheelEnabled={selectionWheelEnabled}
              onToggleSelectionWheel={() => {
                setSelectionWheelEnabled(v => !v);
                closeOverlap();
                setTool('select');
              }}
              activeWall={activeWall}
              activeBox={activeBox}
              selectedDoor={selectedDoor}
              selectedOpening={selectedOpening}
              selectedColumn={selectedColumn}
              selectedAppliance={selectedAppliance}
              selectedAppliancePart={selectedAppliancePart}
              selectedSurface={selectedSurface}
              selectedShelfId={project.selectedShelfId}
              selectedHandleId={project.selectedHandleId}
              selectedFrame={selectedFrame}
              onSetBoxAppearance={setBoxAppearance}
              onSetCabinetLighting={setCabinetLighting}
              onSetBoxFacadeLight={setBoxFacadeLight}
              kitchenLightMode={getKitchenCabinetLightMode(project)}
              onSetOvenLight={enabled => {
                if (!activeWall || !selectedAppliance) return;
                mutateActiveWall(wall => {
                  const app = wall.appliances.find(app => app.id === selectedAppliance.id);
                  if (app) app.ovenLightOn = enabled;
                }, true);
              }}
              onSetCabinetDimension={setSelectedCabinetDimension}
              surfaceSettings={project.settings}
              onSetSelectedSurfaceFinish={setSelectedSurfaceFinish}
              onSetFrameColor={setFrameColor}
              selectedUnitDivider={project.selectedUnitDivider}
              selectedUnit={project.selectedUnit ?? null}
              multiSelection={project.multiSelection}
              selectionMode={selectionMode}
              onSetSelectionMode={handleSetSelectionMode}
              onSelectAllBoxDoors={handleSelectAllBoxDoors}
              designStyle={project.designStyle}
              cabinetFinishBrush={cabinetFinishBrush}
              onSetCabinetFinishBrush={setCabinetFinishBrush}
              backsplashBrush={backsplashBrush}
              onSetBacksplashBrush={setBacksplashBrush}
              countertopBrush={countertopBrush}
              onSetCountertopBrush={setCountertopBrush}
              projectCabinetFinish={project.cabinetFinish || 'warm-white'}
              projectBacksplashFinish={project.backsplashFinish || 'calacatta-marble'}
              projectCountertopFinish={project.countertopFinish || 'dark-quartz'}
              onApplyFinish={handleApplyFinish}
              drawBoxKind={drawBoxKind}
              onSelectDrawBoxKind={setDrawBoxKind}
              doorOrient={doorOrient}
              onSetDoorOrient={handleSetDoorOrientWithClamp}
              doorTargetWidth={doorTargetWidth}
              onSetDoorTargetWidth={setDoorTargetWidth}
              doorVertCount={doorVertCount}
              onSetDoorVertCount={setDoorVertCount}
              drawerPatIdx={drawerPatIdx}
              onSetDrawerPatIdx={setDrawerPatIdx}
              liftPatIdx={liftPatIdx}
              onSetLiftPatIdx={setLiftPatIdx}
              doorStyleBrush={doorStyleBrush}
              onSetDoorStyleBrush={setDoorStyleBrush}
              onApplyDoorStyleToSelected={handleApplyDoorStyleToSelected}
              onApplyDoorStyleToBox={handleApplyDoorStyleToBox}
              hardwareBrush={hardwareBrush}
              onSetHardwareBrush={setHardwareBrush}
              onApplyHardwareToSelected={handleApplyHardwareToSelected}
              onApplyHardwareToBox={handleApplyHardwareToBox}
              onResizeSelectedDrawerDoor={handleResizeSelectedDrawerDoor}
              shelfOrient={shelfOrient}
              onSetShelfOrient={setShelfOrient}
              shelfCount={shelfCount}
              onSetShelfCount={setShelfCount}
              frameWidthCm={frameWidthCm}
              onSetFrameWidthCm={setFrameWidthCm}
              onApplyFullBoxFrame={handleApplyFullBoxFrame}
              handleStyle={handleStyle}
              onSetHandleStyle={(s) => {
                setHandleStyle(s);
                showToast(`نوع دستگیره: ${s === 'simple' ? 'ساده' : s === 'knob' ? 'قارچی' : 'مخفی'}`);
              }}
              handleOrient={handleOrient}
              onSetHandleOrient={setHandleOrient}
              onApplyHandlesToSelected={() => handleApplyHandlesToDoors('selected')}
              onApplyHandlesToBox={() => handleApplyHandlesToDoors('box')}
              onAutoPlaceHandlesForUnit={handleAutoPlaceHandlesForUnit}
              onSmartUnitizeBox={() => handleSmartUnitize('box')}
              onSmartUnitizeAll={() => handleSmartUnitize('all')}
              allowThreeDoorPantryUnit={allowThreeDoorPantryUnit}
              onToggleAllowThreeDoorPantryUnit={setAllowThreeDoorPantryUnit}
              fridgeModel={fridgeModel}
              onSetFridgeModel={setFridgeModel}
              fridgeHasFrame={fridgeHasFrame}
              onSetFridgeHasFrame={setFridgeHasFrame}
              sinkModel={sinkModel}
              onSetSinkModel={setSinkModel}
              gasWidth={gasWidth}
              onSetGasWidth={setGasWidth}
              applianceKind={applianceKind}
              onSetApplianceKind={setApplianceKind}
              hoodKind={hoodKind}
              onSetHoodKind={setHoodKind}
              openingKind={openingKind}
              onSetOpeningKind={setOpeningKind}
              openingSwing={openingSwing}
              onSetOpeningSwing={setOpeningSwing}
              onSetDoorKind={handleSetDoorKind}
              onDeleteSelectedBox={handleDeleteSelectedBox}
              onUpdateOpeningNumeric={handleUpdateOpeningNumeric}
              onUpdateRoomColumn={(patch) => {
                if (selectedColumn) handleUpdateRoomColumn(selectedColumn.id, patch, true);
              }}
              onDeleteSelectedColumn={handleDeleteSelectedColumn}
              onChangeOpeningSwing={handleChangeOpeningSwing}
              onDeleteSelectedOpening={() => {
                if (activeWall && selectedOpening) {
                  handleDeleteOpening(activeWall.id, selectedOpening.id);
                }
              }}
              onChangeSelectedApplianceSinkModel={handleChangeSelectedApplianceSinkModel}
              onChangeSelectedApplianceHood={handleChangeSelectedApplianceHood}
              onSetSelectedCooktopModel={handleSetSelectedCooktopModel}
              onSetSelectedHoodModel={handleSetSelectedHoodModel}
              onSetSelectedFlame={handleSetSelectedFlame}
              onChangeSelectedFridgeModel={handleSetSelectedFridgeModel}
              canSelectedGasUseChimney={
                !(activeWall && selectedAppliance?.kind === 'gas' && requiresIntegratedHood(activeWall, selectedAppliance))
              }
              onDeleteSelectedAppliance={handleDeleteSelectedAppliance}
              equipmentFinish={project.settings?.equipmentFinish ?? 'silver'}
              onSetEquipmentFinish={handleEquipmentFinish}
              onSetSelectedApplianceFinish={handleSelectedApplianceFinish}
              onToggleSelectedFridgeFrame={handleToggleSelectedFridgeFrame}
              fridgeHasOverCabinet={Boolean(activeBox?.type === 'fridge' && activeWall?.boxes.some(box => box.linkedToBoxId === activeBox.id))}
              onSetFridgeOverCabinet={handleSetFridgeOverCabinet}
              onSetFridgeOverDepth={handleSetFridgeOverDepth}
              onSetFridgeFrameDepth={handleSetFridgeFrameDepth}
              onSetFridgeConcealed={handleSetFridgeConcealed}
              onAddUpperCrownAndUnderboard={handleAddUpperCrownAndUnderboard}
              countertopCm={project.settings?.countertopCm ?? 3}
              countertopTopEdge={project.settings?.countertopTopEdge ?? 'square'}
              countertopBottomEdge={project.settings?.countertopBottomEdge ?? 'square'}
              onUpdateCountertopSettings={handleUpdateCountertopSettings}
              onDeleteSelectedShelf={handleDeleteSelectedShelf}
              onQuickAddMiddleShelfForUnit={handleQuickAddMiddleShelfForUnit}
              onClearUnitShelves={handleClearUnitShelves}
              onClearBoxShelves={handleClearBoxShelves}
              onDeleteSelectedHandle={handleDeleteSelectedHandle}
              onDeleteSelectedFrame={handleDeleteSelectedFrame}
              onDeleteSelectedUnitDivider={handleDeleteSelectedUnitDivider}
              onMoveUnit={handleMoveUnit}
              onOptimizeAppliances={handleOptimizeAppliances}
              onBulkDelete={handleBulkDelete}
              onBulkSetDoorKind={handleBulkSetDoorKind}
              onBulkEqualizeDoors={handleBulkEqualizeDoors}
              onClearMultiSelection={() => handleSetMultiSelection(undefined)}
              onDeleteCurrentSelection={handleDeleteCurrentSelection}
              onCopySelection={handleCopySelection}
              onZoomToSelected={handleZoomToSelected}
              hasAnySelection={hasAnySelection}
            />

            <main
              ref={workspaceRef}
              className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden relative"
            >
              {(viewMode === '3d' || floorScanActive) && (
                <div data-testid="tracked-viewport" style={{ display: viewMode === '3d' ? undefined : 'none' }} className="relative flex-1 min-h-0 w-full overflow-hidden">
                <Scene3DCanvas
                    onSetDiningSeats={setDiningSeats}
              diningShape={diningShape}
                 hdrRotationDegrees={hdrRotationDegrees}
              offerSelection={offerSelection}
              onSelectSurface={selectSurface}
                onToggleLightBoxes={toggleLightBoxes}
                frontCutOrient={frontCutOrient}
                onFrontCutOrient={setFrontCutOrient}
                onFrontCut={cutFront}
              cameraToolbarHost={viewMode === '3d' ? cameraToolbarHost : null}
              diningSeats={diningSeats} diningRotation={diningRotation} furnitureKind={furnitureKind}
              onPlaceDining={placeDining} onMoveDining={moveDining}
              onSelectDining={selectDining} onDeleteDining={deleteDining}
              onResizeCabinet={resizeCabinetFromHandle}
              onMoveShelf={moveShelfPrecisely}
              onBeginDrag={handleBeginDrag}
              onCancelDrag={handleCancelDrag}
              onFinishDrag={handleFinishDrag}
              arEnabled={floorScanActive}
              viewportActive={viewMode === '3d'}
              initialSession={initialXrSession}
              sessionKillSignal={arSessionKillSignal}
              dialogOpen={dialogOpen}
              onSessionEnded={() => {setFloorScanActive(false);setTrackedFloorConfirmed(false);setInitialXrSession(null);setSharedWideMode('normal');}}
              onFloorConfirmed={() => {setTrackedFloorConfirmed(true);setTool('select');setSharedWideMode('normal');}}
              onARCalibration={(a,b,realDistanceCm)=>commitState(prev=>({...prev,arCalibration:{a,b,realDistanceCm}}),true)}
              wideViewModeExternal={sharedWideMode}
              onWideViewModeChange={setSharedWideMode}
              zoomSelectedSeq={zoomSelectedSeq}
              onTriggerZoomSelected={handleZoomToSelected}
              hasAnySelection={hasAnySelection}
              project={project}
              tool={tool}
              selectionMode={selectionMode}
              drawBoxKind={drawBoxKind}
              onSelectDrawBoxKind={setDrawBoxKind}
              onAddWall={(wall) => {
                const next = cloneProject(project);
                const st = next.settings || DEFAULT_PROJECT_SETTINGS;
                wall.height = st.wallHeightCm;
                const oriented = autoOrientWallsOnAdd(next.walls, wall);
                next.walls.push(oriented);
                next.activeWallId = oriented.id;
                commitState(next, true);
                fitWallToView(oriented);
              }}
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
              shelfOrient={shelfOrient}
              shelfCount={shelfCount}
              frameWidthCm={frameWidthCm}
              handleStyle={handleStyle}
              handleOrient={handleOrient}
              fridgeModel={fridgeModel}
              sinkModel={sinkModel}
              gasWidth={gasWidth}
              applianceKind={applianceKind}
              hoodKind={hoodKind}
              openingKind={openingKind}
              onSetDoorVertCount={setDoorVertCount}
              onSetDrawerPatIdx={setDrawerPatIdx}
              onSetLiftPatIdx={setLiftPatIdx}
              onSetDoorStyleBrush={setDoorStyleBrush}
              onSetHardwareBrush={setHardwareBrush}
              onSetCabinetFinishBrush={setCabinetFinishBrush}
              onSetBacksplashBrush={setBacksplashBrush}
              onSetCountertopBrush={setCountertopBrush}
              onSetShelfOrient={setShelfOrient}
              onSetShelfCount={setShelfCount}
              onSetFrameWidthCm={setFrameWidthCm}
              onSetFridgeModel={setFridgeModel}
              onSetSinkModel={setSinkModel}
              onSetGasWidth={setGasWidth}
              onSetApplianceKind={setApplianceKind}
              onSetOpeningKind={setOpeningKind}
              onSetDoorOrient={handleSetDoorOrientWithClamp}
              onSetHandleOrient={setHandleOrient}
              onSelectWallAndBox={(wallId, boxId, doorId = null, preserveMulti = false) =>
                setProject((p) => ({
                  ...p,
                  activeWallId: wallId,
                  activeBoxId: boxId,
                  selectedDoorId: doorId,
                  selectedOpeningId: null,
                  selectedColumnId: null,
                  selectedApplianceId: null,
                  selectedShelfId: null,
                  selectedHandleId: null,
                  selectedFrameId: null,
                  selectedUnitDivider: null,
                  selectedUnit: null,
                  multiSelection: preserveMulti ? p.multiSelection : undefined,
                }))
              }
              onSetMultiSelection={handleSetMultiSelection}
              onSelectUnit={(wallId, unit) =>
                setProject((p) => ({
                  ...p,
                  activeWallId: wallId,
                  activeBoxId: unit?.boxId ?? p.activeBoxId,
                  selectedUnit: unit,
                  selectedDoorId: null,
                  selectedOpeningId: null,
                  selectedColumnId: null,
                  selectedApplianceId: null,
                  selectedShelfId: null,
                  selectedHandleId: null,
                  selectedFrameId: null,
                  selectedUnitDivider: null,
                }))
              }
              onSelectAppliance={(wallId, appId, subPart) => {
                setSelectedAppliancePart(subPart ?? null);
                const w = project.walls.find((x) => x.id === wallId);
                const app = w?.appliances.find((a) => a.id === appId);
                const parent = w && app ? findParentBoxForAppliance(w, app) : null;
                setProject((p) => ({
                  ...p,
                  activeWallId: wallId,
                  activeBoxId: parent?.id ?? p.activeBoxId,
                  selectedApplianceId: appId,
                  selectedDoorId: null,
                  selectedOpeningId: null,
                  selectedColumnId: null,
                  selectedShelfId: null,
                  selectedHandleId: null,
                  selectedFrameId: null,
                  selectedUnitDivider: null,
                  selectedUnit: null,
                }));
              }}
              onSelectOpening={(wallId, openingId) =>
                setProject((p) => ({
                  ...p,
                  activeWallId: wallId,
                  activeBoxId: openingId ? null : p.activeBoxId,
                  selectedOpeningId: openingId,
                  selectedColumnId: null,
                  selectedDoorId: null,
                  selectedApplianceId: null,
                  selectedShelfId: null,
                  selectedHandleId: null,
                  selectedFrameId: null,
                  selectedUnitDivider: null,
                  selectedUnit: null,
                }))
              }
              onSelectColumn={(columnId) =>
                setProject((p) => ({
                  ...p,
                  selectedColumnId: columnId,
                  activeBoxId: columnId ? null : p.activeBoxId,
                  selectedOpeningId: null,
                  selectedDoorId: null,
                  selectedApplianceId: null,
                  selectedShelfId: null,
                  selectedHandleId: null,
                  selectedFrameId: null,
                  selectedUnitDivider: null,
                  selectedUnit: null,
                }))
              }
              onAddRoomColumn={handleAddRoomColumn}
              onUpdateRoomColumn={handleUpdateRoomColumn}
              onDeleteRoomColumn={handleDeleteSelectedColumn}
              onSelectShelf={(wallId, boxId, shelfId) =>
                setProject((p) => ({
                  ...p,
                  activeWallId: wallId,
                  activeBoxId: boxId,
                  selectedShelfId: shelfId,
                  selectedDoorId: null,
                  selectedOpeningId: null,
                  selectedColumnId: null,
                  selectedApplianceId: null,
                  selectedHandleId: null,
                  selectedFrameId: null,
                  selectedUnitDivider: null,
                  selectedUnit: null,
                }))
              }
              onSelectHandle={(wallId, boxId, handleId) =>
                setProject((p) => ({
                  ...p,
                  activeWallId: wallId,
                  activeBoxId: boxId,
                  selectedHandleId: handleId,
                  selectedDoorId: null,
                  selectedOpeningId: null,
                  selectedColumnId: null,
                  selectedApplianceId: null,
                  selectedShelfId: null,
                  selectedFrameId: null,
                  selectedUnitDivider: null,
                  selectedUnit: null,
                }))
              }
              onSelectFrame={(wallId, boxId, frameId) =>
                setProject((p) => ({
                  ...p,
                  activeWallId: wallId,
                  activeBoxId: boxId,
                  selectedFrameId: frameId,
                  selectedDoorId: null,
                  selectedOpeningId: null,
                  selectedColumnId: null,
                  selectedApplianceId: null,
                  selectedShelfId: null,
                  selectedHandleId: null,
                  selectedUnitDivider: null,
                  selectedUnit: null,
                }))
              }
              onSelectUnitDivider={(wallId, div) =>
                setProject((p) => ({
                  ...p,
                  activeWallId: wallId,
                  activeBoxId: div?.boxId ?? p.activeBoxId,
                  selectedUnitDivider: div,
                  selectedDoorId: null,
                  selectedOpeningId: null,
                  selectedColumnId: null,
                  selectedApplianceId: null,
                  selectedShelfId: null,
                  selectedHandleId: null,
                  selectedFrameId: null,
                  selectedUnit: null,
                }))
              }
              onMoveBox={handleMoveBox}
              onMoveAppliance={handleMoveAppliance}
              onResizeWallBoxesSynced={handleResizeWallCabinetsSynced}
              onMutateWallById={mutateWallById}
              onApplyDoorStyle={handleApplyDoorStyle}
              onApplyHardwareKind={handleApplyHardwareKind}
              onApplyFinish={handleApplyFinish}
              onPlaceAppliance={handlePlaceAppliance}
              onPlaceFridge={handlePlaceFridge}
              onPlaceOpening={handlePlaceOpening}
              onMoveOpening={handleMoveOpening}
              onDeleteOpening={handleDeleteOpening}
              onCreateBoxesFromSweep={handleCreateBoxesFromSweep}
              onConfirmHiddenHandle={(action) => setHiddenHandleWarnModal({ onConfirm: action })}
              onExitToSelect={handleExitToSelect}
              onToast={showToast}
            />

                </div>
              )}
              {viewMode !== '3d' && (
            <>
              <div style={{ height: `${topHeightPct}%` }} className="min-h-[110px] shrink-0">
                <PlanCanvas
                  onDiningSeatsChange={setDiningSeats}
                  diningShape={diningShape}
                  offerSelection={offerSelection}
                  diningSets={project.diningSets ?? []} selectedDiningId={project.selectedDiningId}
                  diningSeats={diningSeats} diningRotation={diningRotation} furnitureKind={furnitureKind}
                  onPlaceDining={placeDining} onMoveDining={moveDining}
                  onSelectDining={selectDining} onDeleteDining={deleteDining}
                  onResizeCabinet={resizeCabinetFromHandle}
                  onResizeUpperDepth={handleResizeUpperDepth}
                  settings={project.settings}
                  onFinishDrag={handleFinishDrag}
                  onBeginDrag={handleBeginDrag}
                  onCancelDrag={handleCancelDrag}
                  walls={project.walls}
                  columns={project.columns || []}
                  cornerOwners={project.cornerOwners}
                  activeWallId={activeWall?.id ?? null}
                  activeBoxId={activeBox?.id ?? null}
                  selectedOpeningId={project.selectedOpeningId ?? null}
                  selectedColumnId={project.selectedColumnId ?? null}
                  selectedApplianceId={project.selectedApplianceId ?? null}
                  tool={tool}
                  drawBoxKind={drawBoxKind}
                  onDrawBoxKindChange={setDrawBoxKind}
                  fridgeModel={fridgeModel}
                  onFridgeModelChange={setFridgeModel}
                  sinkModel={sinkModel}
                  onSinkModelChange={setSinkModel}
                  gasWidth={gasWidth}
                  onGasWidthChange={setGasWidth}
                  applianceKind={applianceKind}
                  onApplianceKindChange={setApplianceKind}
                  openingKind={openingKind}
                  onOpeningKindChange={setOpeningKind}
                  openingSwing={openingSwing}
                  hintText={hintText}
                  onSelectWall={(wallId, boxId) => {
                    const w = project.walls.find((x) => x.id === wallId) || null;
                    setProject((p) => ({
                      ...p,
                      activeWallId: wallId,
                      activeBoxId: boxId ?? null,
                      selectedDoorId: null,
                      selectedOpeningId: null,
                      selectedColumnId: null,
                      selectedApplianceId: null,
                      selectedShelfId: null,
                      selectedHandleId: null,
                      selectedFrameId: null,
                      selectedUnitDivider: null,
                      selectedUnit: null,
                      multiSelection: undefined,
                    }));
                    if (!w || w.id !== activeWall?.id) fitWallToView(w);
                  }}
                  onSelectOpening={(wallId, openingId) => {
                    const w = project.walls.find((x) => x.id === wallId) || null;
                    setProject((p) => ({
                      ...p,
                      activeWallId: wallId,
                      activeBoxId: null,
                      selectedDoorId: null,
                      selectedOpeningId: openingId,
                      selectedColumnId: null,
                      selectedApplianceId: null,
                      selectedShelfId: null,
                      selectedHandleId: null,
                      selectedFrameId: null,
                      selectedUnitDivider: null,
                      selectedUnit: null,
                      multiSelection: undefined,
                    }));
                    if (w && w.id !== activeWall?.id) fitWallToView(w);
                  }}
                  onSelectColumn={(columnId) =>
                    setProject((p) => ({
                      ...p,
                      selectedColumnId: columnId,
                      activeBoxId: columnId ? null : p.activeBoxId,
                      selectedDoorId: null,
                      selectedOpeningId: null,
                      selectedApplianceId: null,
                      selectedShelfId: null,
                      selectedHandleId: null,
                      selectedFrameId: null,
                      selectedUnitDivider: null,
                      selectedUnit: null,
                      multiSelection: undefined,
                    }))
                  }
                  onSelectAppliance={(wallId, appId, subPart) => {
                    setSelectedAppliancePart(subPart ?? null);
                    const w = project.walls.find((x) => x.id === wallId) || null;
                    const app = w?.appliances.find((a) => a.id === appId);
                    const parent = w && app ? findParentBoxForAppliance(w, app) : null;
                    setProject((p) => ({
                      ...p,
                      activeWallId: wallId,
                      activeBoxId: parent?.id ?? null,
                      selectedDoorId: null,
                      selectedOpeningId: null,
                      selectedColumnId: null,
                      selectedApplianceId: appId,
                      selectedShelfId: null,
                      selectedHandleId: null,
                      selectedFrameId: null,
                      selectedUnitDivider: null,
                      selectedUnit: null,
                      multiSelection: undefined,
                    }));
                    if (w && w.id !== activeWall?.id) fitWallToView(w);
                  }}
                  onExitToSelect={handleExitToSelect}
                  onFlipActiveWallSide={() =>
                    mutateActiveWall((w) => {
                      w.flipSide = w.flipSide === 1 ? -1 : 1;
                    }, true)
                  }
                  onToggleCornerOwner={handleToggleCornerOwner}
                  onAddWall={(wall, onPlaced) => {
                    const base = getProject();
                    const dx = wall.x2Cm - wall.x1Cm, dy = wall.y2Cm - wall.y1Cm;
                    const drawn = Math.hypot(dx, dy);
                    setMeasurement({ label: 'طول دیوار', initial: Math.round(drawn),
                      min: 40, max: Math.max(10000, Math.ceil(drawn)), base,
                      resolve: length => {
                        const next = cloneProject(base);
                        const ratio = length === Math.round(drawn) ? 1 : length / drawn;
                        const placed = createWall(wall.name.replace(/\(\d+\)$/, "(" + length + ")"),
                          wall.x1Cm, wall.y1Cm, wall.x1Cm + dx * ratio,
                          wall.y1Cm + dy * ratio, wall.flipSide,
                          (next.settings || DEFAULT_PROJECT_SETTINGS).wallHeightCm);
                        if (hasWallSegment(next.walls, placed)) return null;
                        const oriented = autoOrientWallsOnAdd(next.walls, placed);
                        next.walls.push(oriented);
                        next.activeWallId = oriented.id;
                        return next;
                      },
                      onApplied: next => {
                        const placed = next.walls[next.walls.length - 1];
                        onPlaced(placed);
                        fitWallToView(placed);
                      },
                    });
                  }}
                  onMoveWallNode={handleMoveWallNode}
                  onMoveWall={handleMoveWall}
                  onMoveBoxFromPlan={handleMoveBox}
                  onMoveApplianceFromPlan={handleMoveAppliance}
                  onDeleteWall={handleDeleteWall}
                  onDeleteBox={handleDeleteBoxFromPlan}
                  onDeleteAppliance={handleDeleteApplianceFromPlan}
                  onDeleteOpening={handleDeleteOpening}
                  onMoveOpening={handleMoveOpening}
                  onAddRoomColumn={handleAddRoomColumn}
                  onUpdateRoomColumn={handleUpdateRoomColumn}
                  onDeleteRoomColumn={(colId) => {
                    const next = cloneProject(project);
                    next.columns = (next.columns || []).filter((c) => c.id !== colId);
                    if (next.selectedColumnId === colId) next.selectedColumnId = null;
                    commitState(next, true);
                    showToast('ستون آزاد حذف شد');
                  }}
                  onCreateBoxesFromSweep={handleCreateBoxesFromSweep}
                  onPlaceApplianceFromPlan={handlePlaceAppliance}
                  onPlaceFridgeFromPlan={handlePlaceFridge}
                  onPlaceOpeningFromPlan={(wallId, offsetX) => handlePlaceOpening(wallId, offsetX)}
                  onToast={showToast}
                />
              </div>

              <div
                role="separator"
                aria-label="تغییر ارتفاع پلان و روبرو"
                aria-orientation="horizontal" aria-valuemin={32} aria-valuemax={68}
                aria-valuenow={Math.round(topHeightPct)} tabIndex={0}
                onPointerDown={(e) => {
                  const height = workspaceRef.current?.clientHeight ?? 0;
                  if (e.button !== 0 || !height || splitDrag.current) return;
                  e.preventDefault();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  splitDrag.current = { pointerId: e.pointerId, startY: e.clientY, startPercent: topHeightPct, height };
                }}
                onPointerMove={(e) => {
                  const drag = splitDrag.current;
                  if (!drag || drag.pointerId !== e.pointerId) return;
                  const percent = drag.startPercent + ((e.clientY - drag.startY) / drag.height) * 100;
                  setTopHeightPct(Math.max(32, Math.min(68, percent)));
                }}
                onLostPointerCapture={() => { splitDrag.current = null; }}
                onDoubleClick={() => setTopHeightPct(50)}
                onKeyDown={(e) => {
                  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Home') return;
                  e.preventDefault();
                  e.stopPropagation();
                  setTopHeightPct(percent => e.key === 'Home' ? 50 : Math.max(32, Math.min(68, percent + (e.key === 'ArrowUp' ? -4 : 4))));
                }}
                className="h-4 touch-none bg-slate-100 border-y border-slate-300 cursor-row-resize flex items-center justify-center shrink-0 z-20 hover:bg-slate-200 focus-visible:outline-indigo-500"
              >
                <div className="w-11 h-1 rounded-full bg-slate-400" />
              </div>

              <FrontCanvas
                offerSelection={offerSelection}
                onSelectSurface={selectSurface}
                frontCutOrient={frontCutOrient}
                onFrontCutOrient={setFrontCutOrient}
                onFrontCut={cutFront}
                onConfirmOpeningMove={openingId => activeWall && handleMoveOpening(activeWall.id, openingId, -1, true)}
                onResizeCabinet={(boxId, side, dx, dy, commit) => activeWall && resizeCabinetFromHandle(activeWall.id, boxId, side, dx, dy, commit)}
                onMoveShelf={(boxId, shelfId, dx, dy, commit) => activeWall && moveShelfPrecisely(activeWall.id, boxId, shelfId, dx, dy, commit)}
                onBeginDrag={handleBeginDrag}
                onCancelDrag={handleCancelDrag}
                onFinishDrag={handleFinishDrag}
                wall={activeWall}
                allWalls={project.walls}
                columns={project.columns || []}
                cornerOwners={project.cornerOwners}
                activeBoxId={activeBox?.id ?? null}
                selectedDoorId={project.selectedDoorId}
                selectedOpeningId={project.selectedOpeningId ?? null}
                selectedApplianceId={project.selectedApplianceId ?? null}
                selectedShelfId={project.selectedShelfId ?? null}
                selectedHandleId={project.selectedHandleId ?? null}
                selectedFrameId={project.selectedFrameId ?? null}
                selectedUnitDivider={project.selectedUnitDivider ?? null}
                selectedUnit={project.selectedUnit ?? null}
                autoUnitHighlightBoxId={autoUnitHighlightBoxId}
                designStyle={project.designStyle}
                multiSelection={project.multiSelection}
                selectionMode={selectionMode}
                tool={tool}
                drawBoxKind={drawBoxKind}
                onDrawBoxKindChange={setDrawBoxKind}
                doorsHidden={Boolean(project.doorsHidden)}
                doorOrient={doorOrient}
                onDoorOrientChange={handleSetDoorOrientWithClamp}
                doorTargetWidth={doorTargetWidth}
                doorVertCount={doorVertCount}
                onDoorVertCountChange={setDoorVertCount}
                drawerPatIdx={drawerPatIdx}
                onDrawerPatIdxChange={setDrawerPatIdx}
                liftPatIdx={liftPatIdx}
                onLiftPatIdxChange={setLiftPatIdx}
                doorStyleBrush={doorStyleBrush}
                onDoorStyleBrushChange={setDoorStyleBrush}
                onApplyDoorStyle={handleApplyDoorStyle}
                hardwareBrush={hardwareBrush}
                onHardwareBrushChange={setHardwareBrush}
                onApplyHardwareKind={handleApplyHardwareKind}
                cabinetFinishBrush={cabinetFinishBrush}
                onCabinetFinishBrushChange={setCabinetFinishBrush}
                backsplashBrush={backsplashBrush}
                onBacksplashBrushChange={setBacksplashBrush}
                countertopBrush={countertopBrush}
                onCountertopBrushChange={setCountertopBrush}
                projectCabinetFinish={project.cabinetFinish || 'warm-white'}
                projectBacksplashFinish={project.backsplashFinish || 'calacatta-marble'}
                projectCountertopFinish={project.countertopFinish || 'dark-quartz'}
                countertopTopEdge={project.settings?.countertopTopEdge ?? 'square'}
                countertopBottomEdge={project.settings?.countertopBottomEdge ?? 'square'}
                onApplyFinish={handleApplyFinish}
                hoodKind={hoodKind}
                onTriggerAutoUnitHighlight={triggerAutoUnitHighlight}
                onConfirmHiddenHandle={(action) => setHiddenHandleWarnModal({ onConfirm: action })}
                shelfOrient={shelfOrient}
                onShelfOrientChange={setShelfOrient}
                shelfCount={shelfCount}
                onShelfCountChange={setShelfCount}
                frameWidthCm={frameWidthCm}
                onFrameWidthCmChange={setFrameWidthCm}
                handleStyle={handleStyle}
                onHandleStyleChange={setHandleStyle}
                handleOrient={handleOrient}
                onHandleOrientChange={setHandleOrient}
                fridgeModel={fridgeModel}
                onFridgeModelChange={setFridgeModel}
                sinkModel={sinkModel}
                onSinkModelChange={setSinkModel}
                gasWidth={gasWidth}
                onGasWidthChange={setGasWidth}
                applianceKind={applianceKind}
                onApplianceKindChange={setApplianceKind}
                openingKind={openingKind}
                onOpeningKindChange={setOpeningKind}
                pxPerCm={pxPerCm}
                pan={frontPan}
                onZoomAndPanChange={(nextS, nextPan) => {
                  setPxPerCm(nextS);
                  setFrontPan(nextPan);
                }}
                onPanChange={setFrontPan}
                onSelectBoxAndDoor={(boxId, doorId) =>
                  setProject((p) => ({
                    ...p,
                    activeBoxId: boxId,
                    selectedDoorId: doorId,
                    selectedOpeningId: null,
                    selectedColumnId: null,
                    selectedApplianceId: null,
                    selectedShelfId: null,
                    selectedHandleId: null,
                    selectedFrameId: null,
                    selectedUnitDivider: null,
                    selectedUnit: null,
                  }))
                }
                onSelectOpening={(openingId) =>
                  setProject((p) => ({
                    ...p,
                    activeBoxId: openingId ? null : p.activeBoxId,
                    selectedDoorId: openingId ? null : p.selectedDoorId,
                    selectedOpeningId: openingId,
                    selectedColumnId: null,
                    selectedApplianceId: null,
                    selectedShelfId: null,
                    selectedHandleId: null,
                    selectedFrameId: null,
                    selectedUnitDivider: null,
                    selectedUnit: null,
                  }))
                }
                onSelectAppliance={(appId, subPart) => {
                  setSelectedAppliancePart(subPart ?? null);
                  const app = activeWall?.appliances.find((a) => a.id === appId);
                  const parent = activeWall && app ? findParentBoxForAppliance(activeWall, app) : null;
                  setProject((p) => ({
                    ...p,
                    activeBoxId: parent?.id ?? p.activeBoxId,
                    selectedDoorId: null,
                    selectedOpeningId: null,
                    selectedColumnId: null,
                    selectedApplianceId: appId,
                    selectedShelfId: null,
                    selectedHandleId: null,
                    selectedFrameId: null,
                    selectedUnitDivider: null,
                    selectedUnit: null,
                  }))
                }}
                onSelectShelf={(boxId, shelfId) =>
                  setProject((p) => ({
                    ...p,
                    activeBoxId: boxId,
                    selectedDoorId: null,
                    selectedOpeningId: null,
                    selectedColumnId: null,
                    selectedApplianceId: null,
                    selectedShelfId: shelfId,
                    selectedHandleId: null,
                    selectedFrameId: null,
                    selectedUnitDivider: null,
                    selectedUnit: null,
                  }))
                }
                onSelectHandle={(boxId, handleId) =>
                  setProject((p) => ({
                    ...p,
                    activeBoxId: boxId,
                    selectedDoorId: null,
                    selectedOpeningId: null,
                    selectedColumnId: null,
                    selectedApplianceId: null,
                    selectedShelfId: null,
                    selectedHandleId: handleId,
                    selectedFrameId: null,
                    selectedUnitDivider: null,
                    selectedUnit: null,
                  }))
                }
                onSelectFrame={(boxId, frameId) =>
                  setProject((p) => ({
                    ...p,
                    activeBoxId: boxId,
                    selectedDoorId: null,
                    selectedOpeningId: null,
                    selectedColumnId: null,
                    selectedApplianceId: null,
                    selectedShelfId: null,
                    selectedHandleId: null,
                    selectedFrameId: frameId,
                    selectedUnitDivider: null,
                    selectedUnit: null,
                  }))
                }
                onSelectUnitDivider={(div) =>
                  setProject((p) => ({
                    ...p,
                    activeBoxId: div?.boxId ?? p.activeBoxId,
                    selectedDoorId: null,
                    selectedOpeningId: null,
                    selectedColumnId: null,
                    selectedApplianceId: null,
                    selectedShelfId: null,
                    selectedHandleId: null,
                    selectedFrameId: null,
                    selectedUnitDivider: div,
                    selectedUnit: null,
                  }))
                }
                onSelectUnit={(unit) =>
                  setProject((p) => ({
                    ...p,
                    activeBoxId: unit?.boxId ?? p.activeBoxId,
                    selectedDoorId: null,
                    selectedOpeningId: null,
                    selectedColumnId: null,
                    selectedApplianceId: null,
                    selectedShelfId: null,
                    selectedHandleId: null,
                    selectedFrameId: null,
                    selectedUnitDivider: null,
                    selectedUnit: unit,
                  }))
                }
                onResizeWallBoxesSynced={(boxId, nextElevY, nextHeight, commit) => {
                  if (activeWall) {
                    handleResizeWallCabinetsSynced(activeWall.id, boxId, nextElevY, nextHeight, commit);
                  }
                }}
                onExitToSelect={handleExitToSelect}
                onMoveBox={(boxId, offsetX, commit, sessionId) => {
                  if (activeWall) handleMoveBox(activeWall.id, boxId, offsetX, commit, sessionId);
                }}
                onMoveAppliance={(appId, offsetX, commit, sessionId) => {
                  if (activeWall) handleMoveAppliance(activeWall.id, appId, offsetX, commit, sessionId);
                }}
                onSetMultiSelection={handleSetMultiSelection}
                onBulkDelete={handleBulkDelete}
                onMutateWall={mutateActiveWall}
                onPlaceAppliance={(boxId, desiredOffsetX, kindOverride) => {
                  if (activeWall) handlePlaceAppliance(activeWall.id, boxId, desiredOffsetX, kindOverride);
                }}
                onPlaceFridge={(desiredOffsetX) => {
                  if (activeWall) handlePlaceFridge(activeWall.id, desiredOffsetX);
                }}
                onPlaceOpening={(desiredOffsetX, desiredElevY) => {
                  if (activeWall) handlePlaceOpening(activeWall.id, desiredOffsetX, desiredElevY);
                }}
                onToast={showToast}
              />
            </>
          )}
            </main>
          </div>
        )}
      </div>

      {viewMode !== 'ar' && !dialogOpen && (
        <BottomDock
          activeTool={tool}
          diningSeats={diningSeats} diningRotation={diningRotation} furnitureKind={furnitureKind}
          onDiningSeats={setDiningSeats} onRotateDining={rotateDining}
          diningShape={diningShape} onDiningShape={setDiningShape}
          onChooseFurniture={kind => {
            if (tool === 'dining' && furnitureKind === kind) setTool('select');
            else { setFurnitureKind(kind); setTool('dining'); }
          }}
          hasAnySelection={hasAnySelection}
          doorsHidden={Boolean(project.doorsHidden)}
          onSelectTool={handleSelectTool}
          onToggleDoorsHidden={handleToggleDoorsHidden}
          onDeleteSelection={handleDeleteCurrentSelection}
          canToggleUnderLight={upperLightBoxes.length > 0}
          lightsOn={lightsOn}
          onToggleUnderLight={toggleUnderCabinetLight}
        />
      )}

      {auditOpen && (
        <div role="dialog" aria-modal="true" aria-label="بررسی سلامت کابینت‌ها"
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-3" dir="rtl">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl max-h-[85dvh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-3 p-4 border-b border-slate-200">
              <div>
                <h2 className="font-extrabold text-lg">گزارش بررسی آشپزخانه</h2>
                <p className="text-sm text-slate-500">{auditIssues.length} مورد قابل بررسی — پیش از اصلاح خودکار پروژه را ذخیره کنید</p>
              </div>
              <div className="flex items-center gap-2">
                {auditIssues.length > 0 && (
                  <button type="button" data-testid="audit-auto-repair"
                    onClick={() => {
                      const res = repairKitchenIssues(project);
                      if (res.changed) commitState(res.project, true);
                      setAuditOpen(false);
                    }}
                    className="bg-emerald-600 text-white rounded-lg px-3 h-9 font-bold hover:bg-emerald-700">
                    رفع خودکار ({auditIssues.length})
                  </button>
                )}
                <button type="button" data-testid="audit-close" onClick={()=>setAuditOpen(false)}
                  className="border border-slate-300 rounded-lg px-3 h-9 font-bold">بستن</button>
              </div>
            </div>
            <div className="overflow-y-auto p-3 space-y-2">
              {!auditIssues.length && <p className="p-4 text-emerald-700 font-bold">در بررسی هندسه، درب‌ها و دستگیره‌ها مشکل مشخصی پیدا نشد.</p>}
              {auditIssues.slice(0,100).map((issue,index)=> (
                <button key={index} type="button" onClick={()=>{
                  setAuditOpen(false);
                  setProject(prev=>({...prev,activeWallId:issue.wallId,activeBoxId:issue.boxId??prev.activeBoxId}));
                  setViewMode('3d');
                }} className="w-full text-right p-3 rounded-lg border border-slate-200 hover:bg-slate-50">
                  <span className={`font-extrabold text-xs ${issue.severity==='error'?'text-red-700':'text-amber-700'}`}>
                    {issue.severity==='error'?'اشکال':'نیازمند بررسی'}
                  </span>
                  <p className="mt-1 text-sm text-slate-700">{issue.message}</p>
                  <span className="text-[11px] text-slate-400">برای دیدن محل کلیک کنید</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {overlap && tool === 'select' && !dialogOpen && (
        <SelectionPicker {...overlap} onChoose={chooseOverlap} onClose={closeOverlap} />
      )}
      {measurement && (
        <NumberPadDialog label={measurement.label} initial={measurement.initial} min={measurement.min}
          max={measurement.max} allowRow={measurement.allowRow} other={measurement.other}
          onClose={() => { setProject(measurement.base); setMeasurement(null); }}
          onApply={(value, row, secondary) => {
            const next = measurement.resolve(value, row, secondary);
            if (!next) { showToast('این اندازه با فضای موجود یا کابینت مجاور تداخل دارد'); return; }
            commitState(next, true);
            measurement.onApplied?.(next);
            setMeasurement(null);
          }} />
      )}
      {styleGalleryOpen && !measurement && !confirmModal && !hiddenHandleWarnModal && !stylePromptModal?.open && !settingsOpen && (
        <StyleGalleryModal
          onApplyStyle={handleApplyStylePreset}
          onClose={() => setStyleGalleryOpen(false)}
        />
      )}

      {settingsOpen && !measurement && !confirmModal && !hiddenHandleWarnModal && !stylePromptModal?.open && (
        <SettingsModal
          settings={project.settings || DEFAULT_PROJECT_SETTINGS}
          cabinetLights={upperLightBoxes}
          kitchenLightMode={getKitchenCabinetLightMode(project)}
          ovens={project.walls.flatMap(wall => wall.appliances).filter(app => app.kind === 'builtin-oven' || app.kind === 'microwave')}
          onSave={handleSaveSettings}
          onPreviewHdrRotation={setPreviewHdrRotation}
           onClose={closeSceneSettings}
        />
      )}

      {stylePromptModal?.open && !measurement && !confirmModal && !hiddenHandleWarnModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="یکپارچگی سبک درب‌های آشپزخانه"
          className="fixed inset-0 bg-slate-900/45 flex items-center justify-center p-4 z-50"
        >
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="space-y-1.5">
              <h2 className="text-sm font-extrabold text-slate-900">
                تغییر سبک آشپزخانه به نئوکلاسیک (CNC)؟
              </h2>
              <p className="text-[13px] leading-6 text-slate-600">
                طرح سی‌ان‌سی مخصوص سبک نئوکلاسیک است و ترکیب آن با درب‌های مدرن ساده در کنار هم
                توصیه نمی‌شود. روی تمام درب‌های پروژه اعمال شود یا فقط همین درب انتخاب‌شده؟
              </p>
            </div>

            <label className="flex items-center gap-2 text-[13px] text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={stylePromptModal.remember}
                onChange={(e) =>
                  setStylePromptModal((prev) =>
                    prev ? { ...prev, remember: e.target.checked } : null
                  )
                }
                className="w-4 h-4 accent-indigo-600 rounded"
              />
              <span>دیگر نپرس (همین تصمیم برای ادامه طراحی ثابت بماند)</span>
            </label>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setStylePromptModal(null)}
                className="h-9 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[13px] font-bold text-slate-700"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => {
                  const m = stylePromptModal;
                  setStylePromptModal(null);
                  executeDoorStyle(m.targetBoxId, m.targetDoorIds, m.requestedStyle, 'target', m.remember);
                }}
                className="h-9 px-3 rounded-lg border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-[13px] font-bold text-indigo-800"
              >
                فقط همین درب
              </button>
              <button
                type="button"
                onClick={() => {
                  const m = stylePromptModal;
                  setStylePromptModal(null);
                  executeDoorStyle(
                    m.targetBoxId,
                    m.targetDoorIds,
                    m.requestedStyle,
                    'all-neoclassic',
                    m.remember
                  );
                }}
                className="h-9 px-3.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-[13px] font-bold text-white shadow-sm"
              >
                اعمال روی همه درب‌ها
              </button>
            </div>
          </div>
        </div>
      )}

      {hiddenHandleWarnModal && !measurement && !confirmModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="هشدار دستگیره مخفی در سبک نئوکلاسیک"
          className="fixed inset-0 bg-slate-900/45 flex items-center justify-center p-4 z-50"
        >
          <div className="bg-white rounded-xl border border-amber-300 shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="space-y-1.5">
              <h2 className="text-sm font-extrabold text-amber-900">
                هشدار سبک: دستگیره مخفی روی درب کلاسیک / CNC
              </h2>
              <p className="text-[13px] leading-6 text-slate-700">
                در سبک نئوکلاسیک یا درب‌های سی‌ان‌سی معمولاً از دستگیره روکار (ساده یا قارچی) استفاده
                می‌شود و پروفیل دستگیره مخفی مرسوم نیست. آیا مطمئن هستید که دستگیره مخفی نصب شود؟
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setHiddenHandleWarnModal(null)}
                className="h-9 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[13px] font-bold text-slate-700"
              >
                انصراف
              </button>
              <button
                type="button"
                onClick={() => {
                  const confirmAction = hiddenHandleWarnModal.onConfirm;
                  setHiddenHandleWarnModal(null);
                  confirmAction();
                }}
                className="h-9 px-3.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-[13px] font-bold text-white shadow-sm"
              >
                بله، دستگیره مخفی بزن
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmModal && !measurement && (
        <div
          data-testid="confirm-modal"
          role="dialog"
          aria-modal="true"
          aria-label={confirmModal.title}
          className="fixed inset-0 bg-slate-900/45 flex items-center justify-center p-4 z-[90]"
        >
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="space-y-1.5">
              <h2 className="text-sm font-extrabold text-slate-900">
                {confirmModal.title}
              </h2>
              <p className="text-[13px] leading-6 text-slate-700">
                {confirmModal.message}
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                data-testid="confirm-modal-cancel"
                onClick={() => setConfirmModal(null)}
                className="h-9 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[13px] font-bold text-slate-700"
              >
                انصراف
              </button>
              <button
                type="button"
                data-testid="confirm-modal-ok"
                onClick={() => {
                  const action = confirmModal.onConfirm;
                  setConfirmModal(null);
                  action();
                }}
                className={`h-9 px-3.5 rounded-lg text-[13px] font-bold text-white shadow-sm ${
                  confirmModal.danger
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {finishSyncPrompt && screen === 'editor' && (
        <div data-testid="equipment-sync-prompt" role="status" dir="rtl"
          className="fixed bottom-20 left-3 z-[85] w-[min(340px,calc(100vw-24px))] rounded-xl border border-slate-200 bg-white p-3 shadow-2xl">
          <p className="text-[13px] font-extrabold text-slate-900">
            یخچال {finishLabel(finishSyncPrompt.finish)} شد
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            رنگ بقیه تجهیزات هم هماهنگ شود؟ بعداً می‌توانی هر تجهیز را جدا تغییر بدهی.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <button type="button" data-testid="equipment-sync-accept"
              onClick={() => {
                const choice = finishSyncPrompt.finish;
                setFinishSyncPrompt(null);
                commitState(prev => syncEquipmentFinishes(prev, choice), true);
              }}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white">هماهنگ کن</button>
            <button type="button" data-testid="equipment-sync-decline"
              onClick={() => setFinishSyncPrompt(null)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700">نه، جدا بمانند</button>
          </div>
        </div>
      )}
      {storageFailure && (
        <div role="alert" className="fixed bottom-24 left-3 right-3 z-[100] mx-auto max-w-xl rounded-xl border border-red-400 bg-red-950 p-3 text-sm text-white shadow-lg" dir="rtl">
          <p>{storageFailure}</p>
          <button type="button" onClick={handleExportProject} className="mt-2 rounded-lg bg-white px-3 py-2 font-bold text-red-950">دریافت فایل پروژه</button>
        </div>
      )}
    </div>
    </ToolGuideHost.Provider>
  );
}
