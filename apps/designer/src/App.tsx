import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  APPLIANCE_CONFIGS,
  BACKSPLASH_FINISHES,
  BACKSPLASH_FINISH_ORDER,
  BOX_PRESETS,
  CABINET_FINISHES,
  COUNTERTOP_FINISHES,
  DEFAULT_PROJECT_SETTINGS,
  DOOR_STYLE_META,
  OPENING_DEFAULTS,
  SINK_MODELS,
} from './cad/constants';
import {
  alignApplianceOnBoxFront,
  alignWallAndBaseDoorSeams,
  applyDoorDrawerBand,
  applyDoorStyleToDoors,
  applyFullBoxFrame,
  applyHandlesToBoxDoors,
  autoUnitizeBoxForHandles,
  carveBoxesForPlacedBox,
  clearHoodUnitForGas,
  compactDisconnectedDoorsInBox,
  createEmptyBox,
  deleteApplianceHierarchically,
  deleteBoxHierarchically,
  ensurePairedDoorUnitDividers,
  equalizeDoorsAndFillGaps,
  equalizeHorizontalInBox,
  equalizeVerticalDoorsInBox,
  eraseDoorWithRule,
  findParentBoxForAppliance,
  getBoxSideExposure,
  getFreeMoveRangeForBox,
  mirrorBoxLayout,
  moveApplianceHierarchically,
  moveBoxHierarchically,
  moveUnitInBoxWithDoorsSync,
  optimizeBoxWithAppliances,
  placeApplianceWithCabinetRules,
  placeFridgeOnWall,
  removeUnitDividerWithSync,
  resizeWallCabinetsSynchronized,
  syncHoodUnitAboveGas,
} from './cad/doorRules';
import {
  analyzeCornerJunction,
  autoOrientWallsOnAdd,
  detectCornerJunctions,
  getBoxTier,
  getCornerBlockedZonesForWall,
  moveConnectedWall,
  moveSmartWallNode,
  SweepSegment,
  toggleCornerOwner,
  WallNodeRef,
} from './cad/cornerLogic';
import {
  createWallOpening,
  findCollidingOpening,
  OPENING_LABELS,
  updateOpeningGeometry,
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
import {
  ApplianceKind,
  BacksplashFinishId,
  BoxKind,
  CabinetFinishId,
  CountertopFinishId,
  DoorKind,
  DoorStyle,
  DoorSwing,
  FridgeModel,
  HandleStyle,
  MultiSelection,
  OpeningKind,
  Orientation,
  ProjectSettings,
  ProjectState,
  SelectionMode,
  SinkModel,
  ToolId,
  Wall,
} from './cad/types';
import { ARWorkspace } from './components/ARWorkspace';
import { isHandheldARDevice, requestChidoSession } from './ar/chidoSession';
import { alignSelectedDoorsInBox, equalizeSelectedVerticalWidths, equalizeSelectedDrawerHeights } from './cad/selectionAlign';
import { BottomDock } from './components/BottomDock';
import { FrontCanvas } from './components/FrontCanvas';
import { PlanCanvas } from './components/PlanCanvas';
import { ProjectsScreen } from './components/ProjectsScreen';
import { Scene3DCanvas } from './components/Scene3DCanvas';
import { SettingsModal } from './components/SettingsModal';
import { SideInspector } from './components/SideInspector';
import { StyleGalleryModal } from './components/StyleGalleryModal';
import { TopBar, ViewMode } from './components/TopBar';
import { WelcomeScreen } from './components/WelcomeScreen';

const STORAGE_KEY = 'cabinet_cad_project_v2';

function cloneProject(p: ProjectState): ProjectState {
  return JSON.parse(JSON.stringify(p));
}

function normalizeProject(raw: ProjectState): ProjectState {
  const walls: Wall[] = (raw.walls || []).map((w) => {
    const boxes = (w.boxes || []).map((b) => ({
      ...b,
      doors: (b.doors || []).map((d) => ({
        ...d,
        kind: ((d.kind as string) === 'oven' ? 'door' : d.kind) as DoorKind,
      })),
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

    const appliances = (w.appliances || []).map((a) => {
      const parent = findParentBoxForAppliance(tempWall, a);
      return {
        ...a,
        boxId: a.boxId || parent?.id,
        sinkModel: a.kind === 'sink' ? a.sinkModel || 'steel-2' : a.sinkModel,
      };
    });

    return {
      ...tempWall,
      appliances,
    };
  });

  return {
    ...raw,
    selectedOpeningId: raw.selectedOpeningId ?? null,
    selectedApplianceId: raw.selectedApplianceId ?? null,
    selectedShelfId: raw.selectedShelfId ?? null,
    selectedHandleId: raw.selectedHandleId ?? null,
    selectedFrameId: raw.selectedFrameId ?? null,
    selectedUnitDivider: raw.selectedUnitDivider ?? null,
    selectedUnit: raw.selectedUnit ?? null,
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

function subtractBlockedIntervals(
  startCm: number,
  endCm: number,
  blocked: Array<{ start: number; end: number }>
): Array<{ start: number; end: number }> {
  let spans = [{ start: startCm, end: endCm }];
  for (const b of blocked) {
    const next: Array<{ start: number; end: number }> = [];
    for (const sp of spans) {
      if (b.end <= sp.start + 1 || b.start >= sp.end - 1) {
        next.push(sp);
      } else {
        if (b.start - sp.start >= 30) next.push({ start: sp.start, end: b.start });
        if (sp.end - b.end >= 30) next.push({ start: b.end, end: sp.end });
      }
    }
    spans = next;
  }
  return spans;
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

  const [project, setProject] = useState<ProjectState>(initialProject);
  const [history, setHistory] = useState<string[]>(() => [JSON.stringify(initialProject)]);
  const [historyIdx, setHistoryIdx] = useState<number>(0);

  const [tool, setTool] = useState<ToolId>('doors');
  const [viewMode, setViewMode] = useState<ViewMode>('2d');
  const [floorScanActive, setFloorScanActive] = useState(false);
  const [trackedFloorConfirmed, setTrackedFloorConfirmed] = useState(false);
  const [arAvailable, setArAvailable] = useState(false);
  useEffect(() => {
    let disposed = false;
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (isHandheldARDevice() && window.isSecureContext && xr?.isSessionSupported) {
      void xr.isSessionSupported('immersive-ar').then(ok => {
        if (!disposed) setArAvailable(Boolean(ok));
      }).catch(() => { if (!disposed) setArAvailable(false); });
    }
    return () => { disposed = true; };
  }, []);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sharedWideMode, setSharedWideMode] = useState<'normal' | 'wide' | 'ultra'>('normal');
  const [initialXrSession, setInitialXrSession] = useState<Promise<XRSession> | null>(null);
  const [arSessionKillSignal, setArSessionKillSignal] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Tool options live cleanly in state and are controlled from SideInspector
  const [drawBoxKind, setDrawBoxKind] = useState<BoxKind>('base');
  const [doorOrient, setDoorOrient] = useState<Orientation>('vertical');
  const [doorTargetWidth, setDoorTargetWidth] = useState<number>(60);
  const [doorVertCount, setDoorVertCount] = useState<number>(1);
  const [drawerPatIdx, setDrawerPatIdx] = useState<number>(1);
  const [liftPatIdx, setLiftPatIdx] = useState<number>(0);
  const [doorBandPos, setDoorBandPos] = useState<'top' | 'bottom'>('top');
  const [doorBandRatio, setDoorBandRatio] = useState<number>(0.26);
  const [doorStyleBrush, setDoorStyleBrush] = useState<DoorStyle>('flat');
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
  const [shelfCount, setShelfCount] = useState<number>(1);
  const [frameWidthCm, setFrameWidthCm] = useState<number>(5);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>('single');
  const [cabinetFinishBrush, setCabinetFinishBrush] = useState<CabinetFinishId>('cashmere');
  const [backsplashBrush, setBacksplashBrush] = useState<BacksplashFinishId>('calacatta-marble');
  const [countertopBrush, setCountertopBrush] = useState<CountertopFinishId>('dark-quartz');
  const [handleStyle, setHandleStyle] = useState<HandleStyle>('simple');
  const [handleOrient, setHandleOrient] = useState<Orientation>('vertical');
  const [fridgeModel, setFridgeModel] = useState<FridgeModel>('side-by-side');
  const [fridgeHasFrame, setFridgeHasFrame] = useState<boolean>(true);
  const [sinkModel, setSinkModel] = useState<SinkModel>('steel-2');
  const [gasWidth, setGasWidth] = useState<number>(80);
  const [applianceKind, setApplianceKind] = useState<ApplianceKind>('dishwasher');
  const [hoodKind, setHoodKind] = useState<'hidden' | 'chimney'>(
    () => initialProject.settings?.defaultHoodKind || 'chimney'
  );
  const [openingKind, setOpeningKind] = useState<OpeningKind>('window');
  const [openingSwing, setOpeningSwing] = useState<DoorSwing>('left-in');

  const [pxPerCm, setPxPerCm] = useState(2.1);
  const [frontPan, setFrontPan] = useState({ x: 0, y: 0 });
  const [topHeightPct, setTopHeightPct] = useState(34);
  const [toast, setToast] = useState<string | null>(null);

  const toastTimer = useRef<number | null>(null);
  const autoUnitTimerRef = useRef<number | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const editorOverlayRef = useRef<HTMLDivElement | null>(null);
  const splitDragging = useRef(false);
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
    document.documentElement.classList.toggle('kitchiyar-xr-passthrough', floorScanActive);
    return () => document.documentElement.classList.remove('kitchiyar-xr-passthrough');
  }, [floorScanActive]);

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
    const recName = activeProjectRecord?.name || 'آشپزخانه من';
    setProjects((prev) => upsertProjectRecord(prev, activeProjectId, recName, project, viewMode));
    persistActiveProjectId(activeProjectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, activeProjectId, viewMode]);

  const commitState = useCallback(
    (next: ProjectState, pushHist = true) => {
      setProject(next);
      if (pushHist) {
        const snap = JSON.stringify(next);
        setHistory((prev) => {
          const sliced = prev.slice(0, historyIdx + 1);
          if (sliced[sliced.length - 1] === snap) return sliced;
          const appended = [...sliced, snap];
          if (appended.length > 50) appended.shift();
          setHistoryIdx(appended.length - 1);
          return appended;
        });
      }
    },
    [historyIdx]
  );

  const handleUndo = useCallback(() => {
    if (historyIdx <= 0) return;
    const prevIdx = historyIdx - 1;
    const restored = normalizeProject(JSON.parse(history[prevIdx]) as ProjectState);
    dragBaseRef.current = null;
    setProject(restored);
    setHistoryIdx(prevIdx);
    showToast('آخرین عملیات لغو شد');
  }, [history, historyIdx, showToast]);

  const handleRedo = useCallback(() => {
    if (historyIdx >= history.length - 1) return;
    const nextIdx = historyIdx + 1;
    const restored = normalizeProject(JSON.parse(history[nextIdx]) as ProjectState);
    dragBaseRef.current = null;
    setProject(restored);
    setHistoryIdx(nextIdx);
    showToast('عملیات تکرار شد');
  }, [history, historyIdx, showToast]);

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
      const sx = (pw * 0.78) / Math.max(w.length, 100);
      const sy = (ph * 0.74) / Math.max(w.height, 100);
      setPxPerCm(+Math.max(0.75, Math.min(3.5, Math.min(sx, sy))).toFixed(2));
      setFrontPan({ x: 0, y: 0 });
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
      setTool(nextTool);

      if ((nextTool === 'pencil' || nextTool === 'skeleton') && !project.doorsLocked) {
        const next = cloneProject(project);
        next.doorsLocked = true;
        commitState(next, true);
        showToast('درب‌ها قفل شدند: روی درز دو درب = دیواره یونیت | وسط درب = طبقه');
      } else if (nextTool === 'doors' && project.doorsLocked) {
        const next = cloneProject(project);
        next.doorsLocked = false;
        commitState(next, true);
      }
    },
    [project, commitState, showToast]
  );

  const handleExitToSelect = useCallback(() => {
    if (tool !== 'select') {
      setTool('select');
      showToast('ابزار انتخاب و جابجایی فعال شد');
    }
  }, [tool, showToast]);

  const handleToggleLock = () => {
    const next = cloneProject(project);
    next.doorsLocked = !next.doorsLocked;
    commitState(next, true);
    if (next.doorsLocked) {
      setTool('pencil');
      showToast('درب‌ها قفل شدند برای یونیت‌بندی و طبقه‌بندی');
    } else {
      setTool('doors');
      showToast('درب‌ها باز شدند');
    }
  };

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

  const handleNewProject = () => {
    const empty: ProjectState = {
      walls: [],
      cornerOwners: {},
      activeWallId: null,
      activeBoxId: null,
      selectedDoorId: null,
      selectedOpeningId: null,
      selectedApplianceId: null,
      selectedShelfId: null,
      selectedHandleId: null,
      selectedFrameId: null,
      selectedUnitDivider: null,
      selectedUnit: null,
      doorsLocked: false,
      doorsHidden: false,
      designStyle: 'modern',
      cabinetFinish: 'warm-white',
      backsplashFinish: 'calacatta-marble',
      countertopFinish: 'dark-quartz',
      skipStylePrompt: false,
      settings: project.settings || { ...DEFAULT_PROJECT_SETTINGS },
    };
    const snap = JSON.stringify(empty);
    dragBaseRef.current = null;
    setProject(empty);
    setHistory([snap]);
    setHistoryIdx(0);
    setTool('wall');
    showToast('صفحه خالی شد؛ ابزار رسم دیوار فعال است');
  };

  const mutateWallById = useCallback(
    (wallId: string, mutator: (wall: Wall) => void, commitHistory = true, toastMsg?: string) => {
      setProject((prev) => {
        const next = cloneProject(prev);
        const w = next.walls.find((x) => x.id === wallId);
        if (!w) return prev;
        if (!w.openings) w.openings = [];
        mutator(w);
        if (commitHistory) {
          const snap = JSON.stringify(next);
          setHistory((h) => {
            const sliced = h.slice(0, historyIdx + 1);
            if (sliced[sliced.length - 1] === snap) return sliced;
            const appended = [...sliced, snap];
            if (appended.length > 50) appended.shift();
            setHistoryIdx(appended.length - 1);
            return appended;
          });
        }
        return next;
      });
      if (toastMsg) showToast(toastMsg);
    },
    [historyIdx, showToast]
  );

  const mutateActiveWall = useCallback(
    (mutator: (wall: Wall) => void, commitHistory = true, toastMsg?: string) => {
      setProject((prev) => {
        const next = cloneProject(prev);
        const w = next.walls.find((x) => x.id === next.activeWallId) || next.walls[0];
        if (!w) return prev;
        if (!w.openings) w.openings = [];
        mutator(w);
        if (commitHistory) {
          const snap = JSON.stringify(next);
          setHistory((h) => {
            const sliced = h.slice(0, historyIdx + 1);
            if (sliced[sliced.length - 1] === snap) return sliced;
            const appended = [...sliced, snap];
            if (appended.length > 50) appended.shift();
            setHistoryIdx(appended.length - 1);
            return appended;
          });
        }
        return next;
      });
      if (toastMsg) showToast(toastMsg);
    },
    [historyIdx, showToast]
  );

  const handleResizeWallCabinetsSynced = useCallback(
    (
      wallId: string,
      boxId: string,
      nextElevY: number,
      nextHeight: number,
      commit: boolean,
      sessionId?: string
    ) => {
      const sid = sessionId || `sync_wall_${boxId}`;
      let baseProject = project;
      if (!dragBaseRef.current || dragBaseRef.current.id !== sid) {
        dragBaseRef.current = { id: sid, project: cloneProject(project) };
      }
      baseProject = dragBaseRef.current.project;
      const next = cloneProject(baseProject);
      const ok = resizeWallCabinetsSynchronized(next.walls, wallId, boxId, nextElevY, nextHeight);
      if (!ok) {
        if (commit) dragBaseRef.current = null;
        return;
      }
      if (commit) dragBaseRef.current = null;
      commitState(next, commit);
      if (commit) {
        showToast('ارتفاع کابینت‌های هوایی، باکس یخچال و کمدهای قدی متصل یکپارچه شد');
      }
    },
    [project, commitState, showToast]
  );

  const handleMoveUnit = useCallback(
    (dir: 'left' | 'right') => {
      if (!activeWall || !project.selectedUnit) return;
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
    [activeWall, project, commitState, showToast]
  );

  const handleCreateBoxesFromSweep = (
    segments: SweepSegment[],
    kind: BoxKind,
    suggestedOwners?: Record<string, string>,
    flipOverrides?: Record<string, 1 | -1>
  ) => {
    const next = cloneProject(project);
    const settings = next.settings || DEFAULT_PROJECT_SETTINGS;

    if (flipOverrides) {
      for (const w of next.walls) {
        if (flipOverrides[w.id]) {
          w.flipSide = flipOverrides[w.id];
        }
      }
    }

    if (suggestedOwners) {
      for (const [key, ownerId] of Object.entries(suggestedOwners)) {
        if (!next.cornerOwners[key]) {
          next.cornerOwners[key] = ownerId;
        }
      }
    }

    if (segments.length === 1) {
      const seg = segments[0];
      const w = next.walls.find((x) => x.id === seg.wallId);
      if (w) {
        const tier = kind === 'wall' ? 'wall-lower' : kind === 'wall-deep' ? 'wall-upper' : 'lower';
        const depthSetback = kind === 'wall' ? 32 : kind === 'wall-deep' ? 58 : kind === 'fridge' ? 70 : 60;
        const junctions = detectCornerJunctions(next.walls, next.cornerOwners);
        for (const j of junctions) {
          const isA = j.wallAId === w.id;
          const isB = j.wallBId === w.id;
          if (!isA && !isB) continue;
          const myEnd = isA ? j.wallAEnd : j.wallBEnd;
          const otherId = isA ? j.wallBId : j.wallAId;
          const otherEnd = isA ? j.wallBEnd : j.wallAEnd;
          const otherWall = next.walls.find((x) => x.id === otherId);
          if (!otherWall) continue;
          const geom = analyzeCornerJunction(w, myEnd, otherWall, otherEnd);
          if (geom.kind !== 'inside-90') continue;

          const touchesCorner =
            (myEnd === 'start' && seg.startCm <= 5) ||
            (myEnd === 'end' && seg.startCm + seg.widthCm >= w.length - 5);
          if (!touchesCorner) continue;

          const otherHasCornerBox = otherWall.boxes.some((ob) => {
            if (getBoxTier(ob) !== tier) return false;
            return otherEnd === 'start' ? ob.offsetX <= 5 : ob.offsetX + ob.width >= otherWall.length - 5;
          });

          if (otherHasCornerBox) {
            next.cornerOwners[j.key] = otherWall.id;
            if (myEnd === 'start' && seg.startCm < depthSetback) {
              const delta = depthSetback - seg.startCm;
              seg.startCm = depthSetback;
              seg.widthCm = Math.max(0, seg.widthCm - delta);
            } else if (myEnd === 'end' && seg.startCm + seg.widthCm > w.length - depthSetback) {
              seg.widthCm = Math.max(0, w.length - depthSetback - seg.startCm);
            }
          } else if (!next.cornerOwners[j.key]) {
            next.cornerOwners[j.key] = w.id;
          }
        }
      }
    }

    let firstBoxId: string | null = null;
    let firstWallId: string | null = null;
    let blockedByOpening = false;

    const boxPreset = BOX_PRESETS[kind] || BOX_PRESETS.base;
    const candElevY = kind === 'wall' ? settings.wallCabElevCm : boxPreset.elevY;
    const candH =
      kind === 'base'
        ? settings.baseHeightCm
        : kind === 'wall'
        ? settings.wallCabHeightCm
        : boxPreset.height;

    segments.forEach((seg) => {
      if (seg.widthCm < 30) return;
      const w = next.walls.find((x) => x.id === seg.wallId);
      if (!w) return;

      const newTier = kind === 'wall' ? 'wall-lower' : kind === 'wall-deep' ? 'wall-upper' : 'lower';
      const blockedSpans: Array<{ start: number; end: number }> = [];

      for (const existing of w.boxes) {
        if (kind === 'tall') {
          if (existing.type === 'tall' || existing.type === 'fridge' || existing.type === 'closet') {
            blockedSpans.push({ start: existing.offsetX, end: existing.offsetX + existing.width });
          }
          continue;
        }
        if (getBoxTier(existing) !== newTier) continue;
        blockedSpans.push({ start: existing.offsetX, end: existing.offsetX + existing.width });
      }
      for (const op of w.openings || []) {
        const opTop = op.elevY + op.height;
        const boxTop = candElevY + candH;
        if (candElevY < opTop - 1 && boxTop > op.elevY + 1) {
          blockedSpans.push({ start: op.offsetX, end: op.offsetX + op.width });
          blockedByOpening = true;
        }
      }

      const validSpans = subtractBlockedIntervals(seg.startCm, seg.startCm + seg.widthCm, blockedSpans);
      validSpans.forEach((sp) => {
        const finalW = Math.round(sp.end - sp.start);
        if (finalW < 30) return;
        const box = createEmptyBox(kind, sp.start, finalW, { settings });
        w.boxes.push(box);
        if (kind === 'tall') {
          carveBoxesForPlacedBox(w, box);
        }
        if (!firstBoxId) {
          firstBoxId = box.id;
          firstWallId = w.id;
        }
      });
    });

    if (firstBoxId && firstWallId) {
      next.activeWallId = firstWallId;
      next.activeBoxId = firstBoxId;
      next.selectedDoorId = null;
      next.selectedOpeningId = null;
      next.selectedApplianceId = null;
      next.selectedShelfId = null;
      next.selectedHandleId = null;
      commitState(next, true);
      const w = next.walls.find((x) => x.id === firstWallId) || null;
      fitWallToView(w);
      setTool('doors');
      showToast(segments.length > 1 ? 'کابینت پیوسته در کنج ساخته شد' : 'باکس جدید اضافه شد');
    } else if (blockedByOpening) {
      showToast('این بخش با پنجره، درب ورودی یا ستون دیوار تداخل دارد');
    }
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

    const overlap = findCollidingOpening(w, op.offsetX, op.offsetX + op.width, op.elevY, op.height);
    if (overlap) {
      showToast('در این محدوده قبلاً پنجره، درب یا ستون قرار گرفته است');
      return;
    }

    w.openings.push(op);
    const wallChanged = next.activeWallId !== w.id;
    next.activeWallId = w.id;
    next.selectedOpeningId = op.id;
    next.activeBoxId = null;
    next.selectedDoorId = null;
    next.selectedApplianceId = null;
    next.selectedShelfId = null;
    next.selectedHandleId = null;
    commitState(next, true);
    if (wallChanged) fitWallToView(w);
    showToast(`${OPENING_LABELS[openingKind]} ثبت شد؛ لبه‌ها را بکشید تا اندازه دقیق شود`);
  };

  const handleMoveOpening = (
    wallId: string,
    openingId: string,
    offsetX: number,
    commit: boolean
  ) => {
    if (commit && offsetX < 0) {
      commitState(cloneProject(project), true);
      return;
    }
    const next = cloneProject(project);
    const w = next.walls.find((x) => x.id === wallId);
    const op = w?.openings?.find((o) => o.id === openingId);
    if (!w || !op) return;
    if (offsetX >= 0) {
      updateOpeningGeometry(op, w, { offsetX });
    }
    commitState(next, commit);
  };

  const handleUpdateOpeningNumeric = (
    field: 'offsetX' | 'width' | 'elevY' | 'height',
    val: number
  ) => {
    if (!selectedOpening || Number.isNaN(val)) return;
    mutateActiveWall((w) => {
      const op = w.openings?.find((o) => o.id === selectedOpening.id);
      if (op) updateOpeningGeometry(op, w, { [field]: val });
    }, true);
  };

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

  const handleChangeSelectedApplianceHood = (nextHood: 'hidden' | 'chimney') => {
    if (!selectedAppliance || selectedAppliance.kind !== 'gas') return;
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
    const blockedZones = getCornerBlockedZonesForWall(activeWall, project.walls, project.cornerOwners);
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
      if (kind === 'door') {
        ensurePairedDoorUnitDividers(b, blockedZones);
      }
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

  const handleClearSelectedDoorBands = () => {
    const ids =
      project.multiSelection?.doorIds.length
        ? project.multiSelection.doorIds
        : project.selectedDoorId
        ? [project.selectedDoorId]
        : null;
    if (!activeWall && !ids) return;
    const next = cloneProject(project);
    let updated = 0;
    if (ids && ids.length > 0) {
      for (const w of next.walls) {
        for (const b of w.boxes) {
          updated += applyDoorDrawerBand(b, ids, null);
        }
      }
    } else if (activeWall && activeBox) {
      const w = next.walls.find((x) => x.id === activeWall.id);
      const b = w?.boxes.find((x) => x.id === activeBox.id);
      if (b) {
        updated += applyDoorDrawerBand(b, null, null);
      }
    }
    if (updated === 0) {
      showToast('درب دارای کشو برای حذف یافت نشد');
      return;
    }
    commitState(next, true);
    showToast(`کشوی ${updated} درب حذف شد`);
  };

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

  const handleMirrorBox = () => {
    if (!activeWall || !activeBox) return;
    const next = cloneProject(project);
    const w = next.walls.find((x) => x.id === activeWall.id);
    const b = w?.boxes.find((x) => x.id === activeBox.id);
    if (!w || !b) return;
    mirrorBoxLayout(b, w, next.walls, next.cornerOwners);
    commitState(next, true);
    showToast('چیدمان باکس در فضای رویه قرینه شد');
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
      const target = pos === 'left' ? range.minX : pos === 'right' ? range.maxX
        : +((range.minX + range.maxX) / 2).toFixed(1);
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

  const handleMoveWallNode = (
    refs: WallNodeRef[],
    x: number,
    y: number,
    commit: boolean
  ) => {
    const next = cloneProject(project);
    const ok = moveSmartWallNode(next.walls, refs, x, y);
    if (!ok) {
      if (commit) showToast('حداقل طول مجاز دیوار ۴۰ سانتی‌متر است');
      return;
    }
    commitState(next, commit);
  };

  const handleMoveWall = useCallback(
    (
      wallId: string,
      dxCm: number,
      dyCm: number,
      moveEntireComponent: boolean,
      commit: boolean,
      sessionId?: string
    ) => {
      let baseProject = project;
      if (sessionId) {
        if (!dragBaseRef.current || dragBaseRef.current.id !== sessionId) {
          dragBaseRef.current = { id: sessionId, project: cloneProject(project) };
        }
        baseProject = dragBaseRef.current.project;
      }

      const next = cloneProject(baseProject);
      const ok = moveConnectedWall(next.walls, wallId, dxCm, dyCm, moveEntireComponent);
      if (!ok) {
        if (commit) {
          dragBaseRef.current = null;
          setProject(cloneProject(baseProject));
          showToast('طول دیوارهای متصل نباید از ۴۰ سانتی‌متر کمتر شود');
        }
        return;
      }
      if (commit) dragBaseRef.current = null;
      commitState(next, commit);
    },
    [project, commitState, showToast]
  );

  const handleMoveBox = useCallback(
    (
      wallId: string,
      boxId: string,
      desiredOffsetX: number,
      commit: boolean,
      sessionId?: string
    ) => {
      let baseProject = project;
      if (sessionId) {
        if (!dragBaseRef.current || dragBaseRef.current.id !== sessionId) {
          dragBaseRef.current = { id: sessionId, project: cloneProject(project) };
        }
        baseProject = dragBaseRef.current.project;
      }
      const next = cloneProject(baseProject);
      const w = next.walls.find((x) => x.id === wallId);
      if (!w) return;
      moveBoxHierarchically(w, next.walls, boxId, desiredOffsetX, next.cornerOwners);
      if (commit) dragBaseRef.current = null;
      commitState(next, commit);
    },
    [project, commitState]
  );

  const handleMoveAppliance = useCallback(
    (
      wallId: string,
      appId: string,
      desiredOffsetX: number,
      commit: boolean,
      sessionId?: string
    ) => {
      let baseProject = project;
      if (sessionId) {
        if (!dragBaseRef.current || dragBaseRef.current.id !== sessionId) {
          dragBaseRef.current = { id: sessionId, project: cloneProject(project) };
        }
        baseProject = dragBaseRef.current.project;
      }
      const next = cloneProject(baseProject);
      const w = next.walls.find((x) => x.id === wallId);
      if (!w) return;
      moveApplianceHierarchically(w, next.walls, appId, desiredOffsetX, next.cornerOwners, {
        refitAdjacentDoors: true,
      });
      if (commit) dragBaseRef.current = null;
      commitState(next, commit);
    },
    [project, commitState]
  );

  const handleDeleteWall = useCallback(
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
      }
      commitState(next, true);
      showToast('دیوار حذف شد');
    },
    [project, commitState, showToast]
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
      overrideId?: string
    ) => {
      const next = cloneProject(project);
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
      if (!box) return;
      box.finish = cabId;
      next.activeWallId = targetWall.id;
      commitState(next, true);
      showToast(`رنگ باکس «${box.name}»: ${CABINET_FINISHES[cabId].label}`);
    },
    [project, cabinetFinishBrush, backsplashBrush, countertopBrush, commitState, showToast]
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

  const hasAnySelection = Boolean(
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
      selectedAppliance ||
      selectedOpening ||
      selectedDoor ||
      activeBox ||
      activeWall
  );

  const handleDeleteCurrentSelection = useCallback(() => {
    const ms = project.multiSelection;
    const hasMulti =
      ms &&
      ms.boxIds.length + ms.doorIds.length + ms.openingIds.length + ms.applianceIds.length > 0;

    if (hasMulti) {
      handleBulkDelete();
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
    activeWall,
    activeBox,
    selectedDoor,
    selectedAppliance,
    handleBulkDelete,
    handleDeleteSelectedUnitDivider,
    handleDeleteSelectedFrame,
    handleDeleteSelectedShelf,
    handleDeleteSelectedHandle,
    handleDeleteSelectedAppliance,
    handleDeleteOpening,
    handleDeleteSelectedBox,
    handleDeleteWall,
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
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (handleDeleteCurrentSelection()) {
          e.preventDefault();
        }
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && activeWall && selectedAppliance) {
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
    handleExitToSelect,
    handleMoveAppliance,
    activeWall,
    selectedAppliance,
    tool,
  ]);

  const handleSaveSettings = (nextSettings: ProjectSettings, applyToExisting: boolean) => {
    const next = cloneProject(project);
    const resolvedHood = nextSettings.defaultHoodKind || 'chimney';
    next.settings = { ...nextSettings, defaultHoodKind: resolvedHood };
    setHoodKind(resolvedHood);
    if (applyToExisting) {
      next.walls.forEach((w) => {
        w.height = nextSettings.wallHeightCm;
        w.boxes.forEach((b) => {
          if (b.type === 'base') {
            b.height = nextSettings.baseHeightCm;
            b.plinth = nextSettings.plinthCm;
            b.countertopCm = nextSettings.countertopCm;
          } else if (b.type === 'wall') {
            b.elevY = nextSettings.wallCabElevCm;
            b.height = nextSettings.wallCabHeightCm;
          }
        });
        w.appliances.forEach((app) => {
          if (app.kind === 'gas') {
            clearHoodUnitForGas(w, app.offsetX, app.offsetX + app.width, app.id);
            app.hoodKind = resolvedHood;
            syncHoodUnitAboveGas(w, app);
          }
        });
        (w.openings || []).forEach((op) => {
          if (op.kind === 'column') op.height = nextSettings.wallHeightCm;
          else updateOpeningGeometry(op, w, {});
        });
      });
      const firstWallCab = next.walls
        .flatMap((w) => w.boxes.map((b) => ({ wallId: w.id, box: b })))
        .find((x) => x.box.type === 'wall');
      if (firstWallCab) {
        resizeWallCabinetsSynchronized(
          next.walls,
          firstWallCab.wallId,
          firstWallCab.box.id,
          nextSettings.wallCabElevCm,
          nextSettings.wallCabHeightCm
        );
      }
    }
    commitState(next, true);
    setSettingsOpen(false);
    fitWallToView(next.walls.find((w) => w.id === next.activeWallId) || next.walls[0] || null);
    showToast('تنظیمات استاندارد پروژه ذخیره شد');
  };

  const hintText = useMemo(() => {
    const map: Record<ToolId, string> = {
      select:
        'انتخاب و جابجایی: درگ دیوار = جابجایی با اتصال | درگ باکس/طبقه/کمد = جابجایی آزاد | کلیک روی خط یونیت = انتخاب | Del = حذف',
      wall: 'رسم دیوار: کلیک و ادامه دهید (راست‌کلیک = لغو و بازگشت به انتخاب)',
      'cab-draw': 'کشیدن کابینت: نوع باکس را انتخاب کرده و روی دیوار بکشید (راست‌کلیک = انتخاب)',
      fridge: 'درج یخچال (+ فریم ۵cm): اسکرول روی دیوار = تغییر مدل | کلیک روی کابینت = برش خودکار فضا',
      sink: `درج ${SINK_MODELS[sinkModel].shortLabel}: اسکرول روی باکس زمینی = تغییر مدل سینک`,
      gas: `درج گاز ${gasWidth}cm (متصل به هود و کشو): اسکرول = تغییر عرض گاز`,
      appliance: `درج ${APPLIANCE_CONFIGS[applianceKind].shortLabel}: اسکرول = ظرفشویی / لباسشویی`,
      opening: `درج ${OPENING_LABELS[openingKind]}: اسکرول روی دیوار = تغییر نوع | کلیک = ثبت`,
      doors: `درب‌گذاری (${doorTargetWidth}cm): اسکرول روی باکس = الگو / تعداد | کلیک بیرون = چرخش`,
      'door-pencil': `مداد کشو (${doorBandPos === 'top' ? 'بالای درب' : 'پایین درب'}): کلیک یا درگ افقی روی درب‌ها | اسکرول = بالا/پایین`,
      'door-style': `مدل درب (${DOOR_STYLE_META[doorStyleBrush].label}): اسکرول = تغییر مدل | کلیک روی درب = اعمال`,
      finish: `رنگ و متریال (${CABINET_FINISHES[cabinetFinishBrush].shortLabel}): اسکرول روی کابینت/کاشی/صفحه = تغییر | کلیک = اعمال`,
      pencil: 'یونیت و طبقه: درز دو درب = افزودن/حذف دیواره یونیت | وسط دهانه = طبقه | اسکرول = تعداد طبقه',
      skeleton: 'قفل نما: اسکرول روی باکس = تعداد طبقه | مرز دو درب = دیواره یونیت',
      frame: `فریم (${frameWidthCm}cm): اسکرول = عرض ۳ تا ۱۱cm | کلیک یا درگ روی لبه‌های آزاد و درز درب‌ها`,
      handle: 'دستگیره: کلیک بیرون باکس = چرخش ۹۰° | انتخاب چند درب = نصب گروهی دستگیره',
      eraser: 'پاک‌کن: حذف فریم، دستگیره، طبقه، یونیت، پنجره/درب، تجهیز، درب، باکس یا دیوار خالی',
    };
    return map[tool];
  }, [tool, sinkModel, gasWidth, applianceKind, openingKind, doorTargetWidth, frameWidthCm, doorStyleBrush, doorBandPos]);

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
        const snap = JSON.stringify(normalized);
        dragBaseRef.current = null;
        setProject(normalized);
        setHistory([snap]);
        setHistoryIdx(0);
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
    setTool('wall');
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
        if (!trackedFloorConfirmed) {
          showToast('ابتدا کف را تأیید کنید؛ دوربین در حال ردیابی است.');
          return;
        }
        setSharedWideMode('wide');
      }
      if (nextMode === '2d') {
        setFloorScanActive(false);
        setInitialXrSession(null);
        const w = project.walls.find((x) => x.id === project.activeWallId) || project.walls[0] || null;
        window.setTimeout(() => fitWallToView(w), 60);
      }
      // 3D remains the same workspace; entering 3D never silently starts OrbitControls
      // while the live tracked WebXR floor scan is active.
      setViewMode(nextMode);
    },
    [project.walls, project.activeWallId, fitWallToView, beginTrackedFloorScan, floorScanActive, trackedFloorConfirmed, showToast]
  );

  const handleLoadRecordIntoEditor = useCallback(
    (rec: SavedProjectRecord, mode: ViewMode) => {
      const normalized = normalizeProject(rec.state);
      const snap = JSON.stringify(normalized);
      dragBaseRef.current = null;
      setActiveProjectId(rec.id);
      persistActiveProjectId(rec.id);
      setProject(normalized);
      setHistory([snap]);
      setHistoryIdx(0);
      setHoodKind(normalized.settings?.defaultHoodKind || 'chimney');
      if (mode === 'ar') beginTrackedFloorScan();
      else { setFloorScanActive(false); setInitialXrSession(null); }
      setViewMode(mode === 'ar' ? '3d' : mode);
      setScreen('editor');
      setTool(normalized.walls.length === 0 ? 'wall' : 'doors');
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
    (preset: KitchenStylePreset) => {
      const applied = applyKitchenStylePreset(project, preset);
      if (!applied) return;
      commitState(applied.next, true);
      setHoodKind(preset.defaultHoodKind);
      setStyleGalleryOpen(false);
      showToast(`استایل «${preset.title}» روی پروژه اعمال شد`);
    },
    [project, commitState, showToast]
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

  return (
    <div
      ref={editorOverlayRef}
      data-testid="editor-shell"
      className={`kichiyar-safe-root kitchiyar-editor-shell w-full flex flex-col overflow-hidden relative text-slate-900 ${
        floorScanActive || viewMode === 'ar' ? 'bg-transparent' : 'bg-slate-50'
      }`}
    >
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
        onNewProject={handleNewProject}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onSelectViewMode={handleSwitchViewMode}
        arAvailable={arAvailable}
        floorScanActive={floorScanActive}
        onToggleFloorScan={() => {
          beginTrackedFloorScan();
        }}
        onOpenSettings={() => setSettingsOpen(true)}
        onExportProject={handleExportProject}
        onImportProject={handleImportProject}
        onEqualizeVertical={handleEqualizeVertical}
        onEqualizeHorizontal={handleEqualizeHorizontal}
        onEqualizeDoorsAndFill={handleEqualizeAndFill}
        onCompactDoorsAndAppliances={handleCompactDoorsAndAppliances}
        onAlignWallAndBaseDoors={handleAlignWallAndBaseDoors}
        onMirrorBox={handleMirrorBox}
        onAlignBox={handleAlignBox}
        onMoveUnit={handleMoveUnit}
      />

      <div className="kitchiyar-editor-main flex flex-1 min-h-0 min-w-0 overflow-hidden relative">
        {viewMode !== 'ar' && (
          <div className={`flex-1 min-h-0 min-w-0 flex overflow-hidden relative z-20 ${floorScanActive ? 'bg-transparent' : 'bg-slate-50'}`}>
            <SideInspector
              activeTool={tool}
              onSelectTool={handleSelectTool}
              activeWall={activeWall}
              activeBox={activeBox}
              selectedDoor={selectedDoor}
              selectedOpening={selectedOpening}
              selectedAppliance={selectedAppliance}
              selectedShelfId={project.selectedShelfId}
              selectedHandleId={project.selectedHandleId}
              selectedFrame={selectedFrame}
              selectedUnitDivider={project.selectedUnitDivider}
              selectedUnit={project.selectedUnit ?? null}
              multiSelection={project.multiSelection}
              selectionMode={selectionMode}
              onSetSelectionMode={handleSetSelectionMode}
              onSelectAllBoxDoors={handleSelectAllBoxDoors}
              doorsLocked={project.doorsLocked}
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
              doorBandPos={doorBandPos}
              onSetDoorBandPos={setDoorBandPos}
              doorBandRatio={doorBandRatio}
              onSetDoorBandRatio={setDoorBandRatio}
              onClearSelectedDoorBands={handleClearSelectedDoorBands}
              doorStyleBrush={doorStyleBrush}
              onSetDoorStyleBrush={setDoorStyleBrush}
              onApplyDoorStyleToSelected={handleApplyDoorStyleToSelected}
              onApplyDoorStyleToBox={handleApplyDoorStyleToBox}
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
              onToggleLock={handleToggleLock}
              onSetDoorKind={handleSetDoorKind}
              onDeleteSelectedBox={handleDeleteSelectedBox}
              onUpdateOpeningNumeric={handleUpdateOpeningNumeric}
              onChangeOpeningSwing={handleChangeOpeningSwing}
              onDeleteSelectedOpening={() => {
                if (activeWall && selectedOpening) {
                  handleDeleteOpening(activeWall.id, selectedOpening.id);
                }
              }}
              onChangeSelectedApplianceSinkModel={handleChangeSelectedApplianceSinkModel}
              onChangeSelectedApplianceHood={handleChangeSelectedApplianceHood}
              onDeleteSelectedAppliance={handleDeleteSelectedAppliance}
              onDeleteSelectedShelf={handleDeleteSelectedShelf}
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
              hasAnySelection={hasAnySelection}
            />

            <main
              ref={workspaceRef}
              className="flex-1 min-h-0 min-w-0 flex flex-col overflow-hidden relative"
              onPointerMove={(e) => {
                if (!splitDragging.current || !workspaceRef.current) return;
                const rect = workspaceRef.current.getBoundingClientRect();
                const pct = ((e.clientY - rect.top) / rect.height) * 100;
                setTopHeightPct(Math.max(18, Math.min(72, pct)));
              }}
              onPointerUp={() => {
                splitDragging.current = false;
              }}
            >
              {viewMode === '3d' ? (
                <div className="relative flex-1 min-h-0 w-full overflow-hidden">
                <Scene3DCanvas
              scanMode={floorScanActive}
              wideViewModeExternal={sharedWideMode}
              onWideViewModeChange={setSharedWideMode}
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
              doorBandPos={doorBandPos}
              doorBandRatio={doorBandRatio}
              onSetDoorBandPos={setDoorBandPos}
              doorStyleBrush={doorStyleBrush}
              cabinetFinishBrush={cabinetFinishBrush}
              backsplashBrush={backsplashBrush}
              countertopBrush={countertopBrush}
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
              onSetCabinetFinishBrush={setCabinetFinishBrush}
              onSetBacksplashBrush={setBacksplashBrush}
              onSetCountertopBrush={setCountertopBrush}
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
                  selectedApplianceId: null,
                  selectedShelfId: null,
                  selectedHandleId: null,
                  selectedFrameId: null,
                  selectedUnitDivider: null,
                }))
              }
              onSelectAppliance={(wallId, appId) => {
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
                  selectedDoorId: null,
                  selectedApplianceId: null,
                  selectedShelfId: null,
                  selectedHandleId: null,
                  selectedFrameId: null,
                  selectedUnitDivider: null,
                  selectedUnit: null,
                }))
              }
              onSelectShelf={(wallId, boxId, shelfId) =>
                setProject((p) => ({
                  ...p,
                  activeWallId: wallId,
                  activeBoxId: boxId,
                  selectedShelfId: shelfId,
                  selectedDoorId: null,
                  selectedOpeningId: null,
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
              onApplyFinish={handleApplyFinish}
              onPlaceAppliance={handlePlaceAppliance}
              onPlaceFridge={handlePlaceFridge}
              onPlaceOpening={handlePlaceOpening}
              onDeleteOpening={handleDeleteOpening}
              onExitToSelect={handleExitToSelect}
              onToast={showToast}
            />
                  {floorScanActive && (
                  <ARWorkspace
            active={true}
            embeddedIn3D={true}
            sharedTool={tool}
            initialSession={initialXrSession}
            onSessionEnded={() => { setFloorScanActive(false); setTrackedFloorConfirmed(false); setInitialXrSession(null); setSharedWideMode('normal'); }}
            onFloorConfirmed={() => { setTrackedFloorConfirmed(true); setTool('wall'); }}
            wideViewModeExternal={sharedWideMode}
            onWideViewModeChange={setSharedWideMode}
            overlayRootRef={editorOverlayRef}
            project={project}
            fridgeModel={fridgeModel}
            sinkModel={sinkModel}
            gasWidth={gasWidth}
            applianceKind={applianceKind}
            hoodKind={hoodKind}
            openingKind={openingKind}
            handleStyle={handleStyle}
            handleOrient={handleOrient}
            drawBoxKind={drawBoxKind}
            onSelectDrawBoxKind={setDrawBoxKind}
            onHandleStyleChange={setHandleStyle}
            onHandleOrientChange={setHandleOrient}
            onFridgeModelChange={setFridgeModel}
            onSinkModelChange={setSinkModel}
            onGasWidthChange={setGasWidth}
            onApplianceKindChange={setApplianceKind}
            onOpeningKindChange={setOpeningKind}
            onMoveBox={handleMoveBox}
            onMoveAppliance={handleMoveAppliance}
            sessionKillSignal={arSessionKillSignal}
            onSwitchViewMode={handleSwitchViewMode}
            onToast={showToast}
            onUpdateProject={(updater, toastMsg) => {
              const next = updater(project);
              if (next !== project) {
                commitState(next, true);
              }
              if (toastMsg) showToast(toastMsg);
            }}
          />
                  )}
                </div>
              ) : (
            <>
              <div style={{ height: `${topHeightPct}%` }} className="min-h-[110px] shrink-0">
                <PlanCanvas
                  walls={project.walls}
                  cornerOwners={project.cornerOwners}
                  activeWallId={activeWall?.id ?? null}
                  activeBoxId={activeBox?.id ?? null}
                  selectedOpeningId={project.selectedOpeningId ?? null}
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
                  onSelectAppliance={(wallId, appId) => {
                    const w = project.walls.find((x) => x.id === wallId) || null;
                    const app = w?.appliances.find((a) => a.id === appId);
                    const parentBox = w && app ? findParentBoxForAppliance(w, app) : null;
                    setProject((p) => ({
                      ...p,
                      activeWallId: wallId,
                      activeBoxId: parentBox?.id ?? null,
                      selectedDoorId: null,
                      selectedOpeningId: null,
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
                  onMoveWallNode={handleMoveWallNode}
                  onMoveWall={handleMoveWall}
                  onMoveBoxFromPlan={handleMoveBox}
                  onMoveApplianceFromPlan={handleMoveAppliance}
                  onDeleteWall={handleDeleteWall}
                  onDeleteBox={handleDeleteBoxFromPlan}
                  onDeleteAppliance={handleDeleteApplianceFromPlan}
                  onDeleteOpening={handleDeleteOpening}
                  onMoveOpening={handleMoveOpening}
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
                onPointerDown={(e) => {
                  e.preventDefault();
                  splitDragging.current = true;
                }}
                className="h-2 bg-slate-100 border-y border-slate-300 cursor-row-resize flex items-center justify-center shrink-0 z-20"
              >
                <div className="w-11 h-1 rounded-full bg-slate-400" />
              </div>

              <FrontCanvas
                wall={activeWall}
                allWalls={project.walls}
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
                doorsLocked={project.doorsLocked}
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
                doorBandPos={doorBandPos}
                onDoorBandPosChange={setDoorBandPos}
                doorBandRatio={doorBandRatio}
                doorStyleBrush={doorStyleBrush}
                onDoorStyleBrushChange={setDoorStyleBrush}
                onApplyDoorStyle={handleApplyDoorStyle}
                cabinetFinishBrush={cabinetFinishBrush}
                onCabinetFinishBrushChange={setCabinetFinishBrush}
                backsplashBrush={backsplashBrush}
                onBacksplashBrushChange={setBacksplashBrush}
                countertopBrush={countertopBrush}
                onCountertopBrushChange={setCountertopBrush}
                projectCabinetFinish={project.cabinetFinish || 'warm-white'}
                projectBacksplashFinish={project.backsplashFinish || 'calacatta-marble'}
                projectCountertopFinish={project.countertopFinish || 'dark-quartz'}
                onApplyFinish={handleApplyFinish}
                hoodKind={hoodKind}
                onTriggerAutoUnitHighlight={triggerAutoUnitHighlight}
                onConfirmHiddenHandle={(action) => setHiddenHandleWarnModal({ onConfirm: action })}
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
                    selectedApplianceId: null,
                    selectedShelfId: null,
                    selectedHandleId: null,
                    selectedFrameId: null,
                    selectedUnitDivider: null,
                    selectedUnit: null,
                  }))
                }
                onSelectAppliance={(appId) => {
                  const app = activeWall?.appliances.find((a) => a.id === appId);
                  const parent = activeWall && app ? findParentBoxForAppliance(activeWall, app) : null;
                  setProject((p) => ({
                    ...p,
                    activeBoxId: parent?.id ?? p.activeBoxId,
                    selectedDoorId: null,
                    selectedOpeningId: null,
                    selectedApplianceId: appId,
                    selectedShelfId: null,
                    selectedHandleId: null,
                    selectedFrameId: null,
                    selectedUnitDivider: null,
                    selectedUnit: null,
                  }));
                }}
                onSelectShelf={(boxId, shelfId) =>
                  setProject((p) => ({
                    ...p,
                    activeBoxId: boxId,
                    selectedDoorId: null,
                    selectedOpeningId: null,
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

      {viewMode !== 'ar' && (
        <BottomDock
          activeTool={tool}
          hasAnySelection={hasAnySelection}
          doorsHidden={Boolean(project.doorsHidden)}
          doorsLocked={project.doorsLocked}
          onSelectTool={handleSelectTool}
          onToggleDoorsHidden={handleToggleDoorsHidden}
          onToggleLock={handleToggleLock}
          onDeleteSelection={handleDeleteCurrentSelection}
        />
      )}

      {styleGalleryOpen && (
        <StyleGalleryModal
          onApplyStyle={handleApplyStylePreset}
          onClose={() => setStyleGalleryOpen(false)}
        />
      )}

      {settingsOpen && (
        <SettingsModal
          settings={project.settings || DEFAULT_PROJECT_SETTINGS}
          onSave={handleSaveSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {stylePromptModal?.open && (
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

      {hiddenHandleWarnModal && (
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

      {toast && (
        <div
          role="status"
          className="fixed top-[92px] left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-1.5 rounded-full text-[13px] font-bold shadow-lg z-50 pointer-events-none"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
