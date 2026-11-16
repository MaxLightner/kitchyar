import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  APPLIANCE_CONFIGS,
  APRON_SINK_DEPTH_CM,
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
  SHEET_MM,
  SINK_MODELS,
  SINK_MODEL_ORDER,
} from '../cad/constants';
import {
  analyzeCornerJunction,
  detectCornerJunctions,
  getCornerBlockedZonesForWall,
} from '../cad/cornerLogic';
import {
  addShelvesWithMinGap,
  applyDoorBrushPreview,
  applyDoorDrawerBand,
  applyHandlesToBoxDoors,
  autoUnitizeBoxForHandles,
  clampBoxInternalsAfterResize,
  clampShelfRatioWithMinGap,
  computeDoorBrushPreview,
  computeWallBacksplashSpans,
  deleteApplianceHierarchically,
  deleteBoxHierarchically,
  doesFridgeTouchCabinet,
  eraseDoorWithRule,
  getBoxFrameInsets,
  getBoxSideExposure,
  getDoorsInHorizontalRange,
  getFreeMoveRangeForAppliance,
  getFreeMoveRangeForBox,
  getUnitsInBox,
  placeFrameOnBox,
  removeUnitDividerWithSync,
  resizeDoorSafely,
  resizeDoorSeamCoupled,
  resizeUnitDividerWithDoorsSync,
  uid,
} from '../cad/doorRules';
import { updateOpeningGeometry } from '../cad/openingRules';
import {
  ApplianceItem,
  ApplianceKind,
  BacksplashFinishId,
  BoxKind,
  CabinetBox,
  CabinetFinishId,
  CountertopFinishId,
  DesignStyle,
  DoorStyle,
  DoorUnit,
  FrameSide,
  FridgeModel,
  HandleItem,
  HandleStyle,
  MultiSelection,
  OpeningKind,
  Orientation,
  SelectionMode,
  SinkModel,
  ToolId,
  Wall,
  WallOpening,
} from '../cad/types';
import { CursorTargetStatus, CursorToolPreview } from './CursorToolPreview';
import { PacedGestureStepper } from '../utils/gesturePacing';

const APPLIANCE_ORDER: ApplianceKind[] = ['dishwasher', 'washing'];
const OPENING_ORDER: OpeningKind[] = ['window', 'door', 'column'];
const CAB_DRAW_KIND_ORDER: BoxKind[] = ['base', 'wall', 'wall-deep', 'tall', 'closet'];
const HANDLE_STYLE_ORDER: HandleStyle[] = ['simple', 'knob', 'hidden'];

interface FrontCanvasProps {
  wall: Wall | null;
  allWalls: Wall[];
  cornerOwners: Record<string, string>;
  activeBoxId: string | null;
  selectedDoorId: string | null;
  selectedOpeningId: string | null;
  selectedApplianceId?: string | null;
  selectedShelfId?: string | null;
  selectedHandleId?: string | null;
  selectedFrameId?: string | null;
  selectedUnitDivider?: { boxId: string; seamCm: number } | null;
  selectedUnit?: { boxId: string; startCm: number; endCm: number } | null;
  autoUnitHighlightBoxId?: string | null;
  designStyle?: DesignStyle;
  multiSelection?: MultiSelection;
  selectionMode: SelectionMode;
  tool: ToolId;
  drawBoxKind?: BoxKind;
  onDrawBoxKindChange?: (k: BoxKind) => void;
  doorsLocked: boolean;
  doorsHidden?: boolean;
  doorOrient: Orientation;
  onDoorOrientChange: (o: Orientation) => void;
  doorTargetWidth: number;
  doorVertCount: number;
  onDoorVertCountChange: (c: number) => void;
  drawerPatIdx: number;
  onDrawerPatIdxChange: (i: number) => void;
  liftPatIdx: number;
  onLiftPatIdxChange: (i: number) => void;
  doorBandPos?: 'top' | 'bottom';
  onDoorBandPosChange?: (p: 'top' | 'bottom') => void;
  doorBandRatio?: number;
  doorStyleBrush: DoorStyle;
  onDoorStyleBrushChange: (s: DoorStyle) => void;
  onApplyDoorStyle?: (
    boxId: string | null,
    doorIds: string[] | null,
    style: DoorStyle
  ) => void;
  cabinetFinishBrush: CabinetFinishId;
  onCabinetFinishBrushChange: (f: CabinetFinishId) => void;
  backsplashBrush: BacksplashFinishId;
  onBacksplashBrushChange: (f: BacksplashFinishId) => void;
  countertopBrush: CountertopFinishId;
  onCountertopBrushChange: (f: CountertopFinishId) => void;
  projectCabinetFinish: CabinetFinishId;
  projectBacksplashFinish: BacksplashFinishId;
  projectCountertopFinish: CountertopFinishId;
  onApplyFinish: (
    target: 'box' | 'all-cabinets' | 'backsplash' | 'countertop',
    wallId?: string,
    boxId?: string,
    overrideId?: string
  ) => void;
  hoodKind?: 'hidden' | 'chimney';
  onTriggerAutoUnitHighlight?: (boxId: string) => void;
  onConfirmHiddenHandle?: (action: () => void) => void;
  shelfCount: number;
  onShelfCountChange: (c: number) => void;
  frameWidthCm: number;
  onFrameWidthCmChange: (w: number) => void;
  handleStyle: HandleStyle;
  onHandleStyleChange?: (s: HandleStyle) => void;
  handleOrient: Orientation;
  onHandleOrientChange: (o: Orientation) => void;
  fridgeModel: FridgeModel;
  onFridgeModelChange: (m: FridgeModel) => void;
  sinkModel: SinkModel;
  onSinkModelChange: (m: SinkModel) => void;
  gasWidth: number;
  onGasWidthChange: (w: number) => void;
  applianceKind: ApplianceKind;
  onApplianceKindChange: (k: ApplianceKind) => void;
  openingKind: OpeningKind;
  onOpeningKindChange: (k: OpeningKind) => void;
  pxPerCm: number;
  pan: { x: number; y: number };
  onZoomAndPanChange: (nextScale: number, nextPan: { x: number; y: number }) => void;
  onPanChange: (next: { x: number; y: number }) => void;
  onSelectBoxAndDoor: (boxId: string | null, doorId: string | null) => void;
  onSelectOpening: (openingId: string | null) => void;
  onSelectAppliance?: (appId: string | null) => void;
  onSelectShelf?: (boxId: string, shelfId: string | null) => void;
  onSelectHandle?: (boxId: string, handleId: string | null) => void;
  onSelectFrame?: (boxId: string, frameId: string | null) => void;
  onSelectUnitDivider?: (div: { boxId: string; seamCm: number } | null) => void;
  onSelectUnit?: (unit: { boxId: string; startCm: number; endCm: number } | null) => void;
  onResizeWallBoxesSynced?: (
    sourceBoxId: string,
    nextElevY: number,
    nextHeight: number,
    commit: boolean
  ) => void;
  onExitToSelect: () => void;
  onMoveBox: (boxId: string, offsetX: number, commit: boolean, sessionId?: string) => void;
  onMoveAppliance: (appId: string, offsetX: number, commit: boolean, sessionId?: string) => void;
  onSetMultiSelection: (m?: MultiSelection) => void;
  onBulkDelete?: () => void;
  onMutateWall: (mutator: (wall: Wall) => void, commitHistory?: boolean, toastMsg?: string) => void;
  onPlaceAppliance: (boxId: string, desiredOffsetX: number, kindOverride?: ApplianceKind) => void;
  onPlaceFridge: (desiredOffsetX: number) => void;
  onPlaceOpening: (desiredOffsetX: number, desiredElevY?: number) => void;
  onToast: (msg: string) => void;
}

interface ComputedSpot {
  spotId: string;
  boxId: string;
  doorId: string;
  rowIndex: number;
  xRatio: number;
  yRatio: number;
  x: number;
  y: number;
}

type DragOp =
  | { mode: 'pan'; startX: number; startY: number; origX: number; origY: number }
  | {
      mode: 'marquee';
      startPt: { x: number; y: number };
      currPt: { x: number; y: number };
    }
  | {
      mode: 'resize-box';
      side: 'left' | 'right' | 'top' | 'bottom';
      boxId: string;
      startPt: { x: number; y: number };
      origX: number;
      origW: number;
      origElev: number;
      origH: number;
      lastElev?: number;
      lastH?: number;
    }
  | {
      mode: 'move-box';
      boxId: string;
      startPt: { x: number; y: number };
      origX: number;
      lastTargetX: number;
      sessionId: string;
    }
  | {
      mode: 'resize-door';
      boxId: string;
      doorId: string;
      startPt: { x: number; y: number };
      origW: number;
    }
  | {
      mode: 'resize-door-seam';
      boxId: string;
      leftDoorId: string;
      lastX: number;
    }
  | {
      mode: 'move-app';
      appId: string;
      startPt: { x: number; y: number };
      origX: number;
      lastTargetX: number;
      sessionId: string;
    }
  | {
      mode: 'stretch-handle';
      boxId: string;
      handleId: string;
      orient: Orientation;
      startPt: { x: number; y: number };
      origLen: number;
    }
  | {
      mode: 'move-opening';
      openingId: string;
      startPt: { x: number; y: number };
      origX: number;
      origElev: number;
    }
  | {
      mode: 'resize-opening';
      openingId: string;
      side: 'left' | 'right' | 'top' | 'bottom';
      startPt: { x: number; y: number };
      origX: number;
      origW: number;
      origElev: number;
      origH: number;
    }
  | {
      mode: 'frame-draw';
      boxId: string;
      bx: number;
      by: number;
      bw: number;
      bodyH: number;
    }
  | {
      mode: 'move-shelf';
      boxId: string;
      shelfId: string;
      innerTopPx: number;
      innerHeightPx: number;
    }
  | {
      mode: 'resize-unit-div';
      boxId: string;
      origSeamCm: number;
      currentSeamCm: number;
      startX: number;
      bx: number;
      insetsLeft: number;
      scaleX: number;
    }
  | {
      mode: 'door-pencil-drag';
      boxId: string;
      startCm: number;
      currCm: number;
      pos: 'top' | 'bottom';
      ratio: number;
    };

export const FrontCanvas: React.FC<FrontCanvasProps> = ({
  wall,
  allWalls,
  cornerOwners,
  activeBoxId,
  selectedDoorId,
  selectedOpeningId,
  selectedApplianceId,
  selectedShelfId,
  selectedHandleId,
  selectedFrameId,
  selectedUnitDivider,
  selectedUnit,
  autoUnitHighlightBoxId,
  designStyle = 'modern',
  multiSelection,
  selectionMode,
  tool,
  drawBoxKind = 'base',
  onDrawBoxKindChange,
  doorsLocked,
  doorsHidden = false,
  doorOrient,
  onDoorOrientChange,
  doorTargetWidth,
  doorVertCount,
  onDoorVertCountChange,
  drawerPatIdx,
  onDrawerPatIdxChange,
  liftPatIdx,
  onLiftPatIdxChange,
  doorBandPos = 'top',
  onDoorBandPosChange,
  doorBandRatio = 0.26,
  doorStyleBrush,
  onDoorStyleBrushChange,
  onApplyDoorStyle,
  cabinetFinishBrush,
  onCabinetFinishBrushChange,
  backsplashBrush,
  onBacksplashBrushChange,
  countertopBrush,
  onCountertopBrushChange,
  projectCabinetFinish,
  projectBacksplashFinish,
  projectCountertopFinish,
  onApplyFinish,
  hoodKind = 'chimney',
  onTriggerAutoUnitHighlight,
  onConfirmHiddenHandle,
  shelfCount,
  onShelfCountChange,
  frameWidthCm,
  onFrameWidthCmChange,
  handleStyle,
  onHandleStyleChange,
  handleOrient,
  onHandleOrientChange,
  fridgeModel,
  onFridgeModelChange,
  sinkModel,
  onSinkModelChange,
  gasWidth,
  onGasWidthChange,
  applianceKind,
  onApplianceKindChange,
  openingKind,
  onOpeningKindChange,
  pxPerCm,
  pan,
  onZoomAndPanChange,
  onPanChange,
  onSelectBoxAndDoor,
  onSelectOpening,
  onSelectAppliance,
  onSelectShelf,
  onSelectHandle,
  onSelectFrame,
  onSelectUnitDivider,
  onSelectUnit,
  onResizeWallBoxesSynced,
  onExitToSelect,
  onMoveBox,
  onMoveAppliance,
  onSetMultiSelection,
  onBulkDelete,
  onMutateWall,
  onPlaceAppliance,
  onPlaceFridge,
  onPlaceOpening,
  onToast,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const paneRef = useRef<HTMLElement | null>(null);
  const gestureStepperRef = useRef(new PacedGestureStepper());

  const [cursorPt, setCursorPt] = useState<{ x: number; y: number } | null>(null);
  const [hoverClientPt, setHoverClientPt] = useState<{ x: number; y: number } | null>(null);
  const [hoverFinishTarget, setHoverFinishTarget] = useState<
    'cabinet' | 'backsplash' | 'countertop' | 'wall' | null
  >(null);
  const [frontHoverStatus, setFrontHoverStatus] = useState<CursorTargetStatus>('neutral');

  useEffect(() => {
    const clearHover = () => {
      setHoverClientPt(null);
      setHoverFinishTarget(null);
      setFrontHoverStatus('neutral');
    };
    window.addEventListener('resize', clearHover);
    window.addEventListener('blur', clearHover);
    return () => {
      window.removeEventListener('resize', clearHover);
      window.removeEventListener('blur', clearHover);
    };
  }, []);
  const [spaceDown, setSpaceDown] = useState(false);
  const [dragGuides, setDragGuides] = useState<{
    leftGap: number;
    rightGap: number;
    itemStart: number;
    itemEnd: number;
    yTopCm: number;
  } | null>(null);
  const [marquee, setMarquee] = useState<{
    startX: number;
    startY: number;
    currX: number;
    currY: number;
  } | null>(null);

  const [doorHover, setDoorHover] = useState<{
    boxId: string;
    cursorCmInBox: number;
  } | null>(null);

  const [pencilHover, setPencilHover] = useState<{
    boxId: string;
    kind: 'seam' | 'shelf' | 'blocked';
    seamCm?: number;
    hasExistingDivider?: boolean;
    startCm?: number;
    endCm?: number;
    yRatio?: number;
    cursorCm?: number;
    blockedReason?: string;
  } | null>(null);

  const [appHover, setAppHover] = useState<{
    kind: ApplianceKind;
    sinkModel?: SinkModel;
    offsetX: number;
    width: number;
    topElevCm: number;
    plinthCm: number;
    countertopCm: number;
    valid: boolean;
    reason?: string;
  } | null>(null);

  const [frameHover, setFrameHover] = useState<{
    boxId: string;
    side: FrameSide | 'invalid';
    seamCm?: number;
    reason?: string;
  } | null>(null);

  const [doorPencilHover, setDoorPencilHover] = useState<{
    boxId: string;
    doorIds: string[];
    pos: 'top' | 'bottom';
  } | null>(null);

  const dragOp = useRef<DragOp | null>(null);
  const activePointersRef = useRef<Set<number>>(new Set());
  const lastMultiTouchMsRef = useRef(0);
  const lastPlaceTapRef = useRef<{ ts: number; x: number; y: number; tool: ToolId } | null>(null);
  const touchPinch = useRef<{
    dist: number;
    midX: number;
    midY: number;
    lastStepY: number;
    origScale: number;
    origPan: { x: number; y: number };
    overContext: boolean;
    contextBox: CabinetBox | null;
    overWallArea: boolean;
  } | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) {
        setSpaceDown(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const blockedZones = useMemo(() => {
    if (!wall) return [];
    return getCornerBlockedZonesForWall(wall, allWalls, cornerOwners);
  }, [wall, allWalls, cornerOwners]);

  const pw = paneRef.current?.clientWidth || 900;
  const ph = paneRef.current?.clientHeight || 420;
  const viewBox = `${-pw / 2 - pan.x} ${-ph / 2 - pan.y} ${pw} ${ph}`;

  const s = pxPerCm;
  const wallW = (wall?.length || 300) * s;
  const wallH = (wall?.height || 265) * s;
  const originX = -wallW / 2;
  const floorY = wallH / 2 - 14;
  const tPx = (SHEET_MM / 10) * s;

  const clientToSvg = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    return pt.matrixTransform(ctm.inverse());
  };

  const hitTestBox = (pt: { x: number; y: number }): {
    box: CabinetBox;
    bx: number;
    by: number;
    bw: number;
    bodyH: number;
  } | null => {
    if (!wall) return null;
    for (let i = wall.boxes.length - 1; i >= 0; i--) {
      const b = wall.boxes[i];
      const bx = originX + b.offsetX * s;
      const bw = b.width * s;
      const bh = b.height * s;
      const by = floorY - b.elevY * s - bh;
      const bodyH = Math.max(14, bh - b.plinth * s);
      if (pt.x >= bx && pt.x <= bx + bw && pt.y >= by && pt.y <= by + bodyH) {
        return { box: b, bx, by, bw, bodyH };
      }
    }
    return null;
  };

  const getEffectiveBoxInsets = (box: CabinetBox) => {
    const baseInsets = getBoxFrameInsets(box);
    if (
      box.type === 'fridge' &&
      box.hasFridgeFrame &&
      baseInsets.left === 0 &&
      baseInsets.right === 0 &&
      baseInsets.top === 0
    ) {
      return { left: FRIDGE_FRAME_CM, right: FRIDGE_FRAME_CM, top: FRIDGE_FRAME_CM, bottom: 0 };
    }
    return baseInsets;
  };

  const getApronExtraTopCm = (box: CabinetBox, door: DoorUnit): number => {
    if (!wall || box.type !== 'base') return 0;
    const dStart = box.offsetX + door.startCm;
    const dEnd = dStart + door.widthCm;
    const hasApron = wall.appliances.some(
      (a) =>
        a.kind === 'sink' &&
        a.sinkModel === 'ceramic-apron' &&
        dStart < a.offsetX + a.width - 1 &&
        dEnd > a.offsetX + 1
    );
    return hasApron ? Math.max(0, APRON_SINK_DEPTH_CM - box.countertopCm) : 0;
  };

  const computedSpots = useMemo<ComputedSpot[]>(() => {
    if (!wall || tool !== 'handle') return [];
    const spots: ComputedSpot[] = [];

    wall.boxes.forEach((box) => {
      const bx = originX + box.offsetX * s;
      const bh = box.height * s;
      const by = floorY - box.elevY * s - bh;
      const bodyH = Math.max(14, bh - box.plinth * s);
      const topPad = box.countertopCm * s;
      const insets = getEffectiveBoxInsets(box);
      const scaleX = Math.max(0.2, (box.width - insets.left - insets.right) / Math.max(1, box.width));

      box.doors.forEach((door) => {
        if (door.kind === 'fridge' || door.kind === 'open') return;
        const apronExtraPx = getApronExtraTopCm(box, door) * s;
        const dx = bx + (insets.left + door.startCm * scaleX) * s + 1.5;
        const dw = Math.max(6, door.widthCm * scaleX * s - 3);
        const dy = by + topPad + insets.top * s + apronExtraPx + 1.5;
        const dh = Math.max(8, bodyH - topPad - (insets.top + insets.bottom) * s - apronExtraPx - 3);

        if (door.kind === 'drawer' || (door.kind === 'lift' && door.drawerRatios.length > 0)) {
          const pts = [0, ...door.drawerRatios, 1];
          for (let r = 0; r < pts.length - 1; r++) {
            const ry = dy + pts[r] * dh;
            const rh = (pts[r + 1] - pts[r]) * dh;
            const rowPts =
              handleOrient === 'horizontal'
                ? [
                    { xr: 0.18, yr: 0.5 },
                    { xr: 0.5, yr: 0.5 },
                    { xr: 0.82, yr: 0.5 },
                    { xr: 0.5, yr: 0.22 },
                  ]
                : [
                    { xr: 0.14, yr: 0.5 },
                    { xr: 0.86, yr: 0.5 },
                  ];
            rowPts.forEach((sp, i) => {
              spots.push({
                spotId: `${door.id}_r${r}_${i}`,
                boxId: box.id,
                doorId: door.id,
                rowIndex: r,
                xRatio: sp.xr,
                yRatio: sp.yr,
                x: dx + dw * sp.xr,
                y: ry + rh * sp.yr,
              });
            });
          }
        } else if (door.kind === 'lift') {
          const liftPts =
            handleOrient === 'horizontal'
              ? [
                  { xr: 0.18, yr: 0.86 },
                  { xr: 0.5, yr: 0.86 },
                  { xr: 0.82, yr: 0.86 },
                ]
              : [
                  { xr: 0.14, yr: 0.5 },
                  { xr: 0.86, yr: 0.5 },
                ];
          liftPts.forEach((sp, i) => {
            spots.push({
              spotId: `${door.id}_r0_${i}`,
              boxId: box.id,
              doorId: door.id,
              rowIndex: 0,
              xRatio: sp.xr,
              yRatio: sp.yr,
              x: dx + dw * sp.xr,
              y: dy + dh * sp.yr,
            });
          });
        } else {
          const doorPts =
            handleOrient === 'vertical'
              ? [
                  { xr: 0.14, yr: 0.18 },
                  { xr: 0.14, yr: 0.5 },
                  { xr: 0.14, yr: 0.82 },
                  { xr: 0.86, yr: 0.18 },
                  { xr: 0.86, yr: 0.5 },
                  { xr: 0.86, yr: 0.82 },
                ]
              : [
                  { xr: 0.18, yr: 0.14 },
                  { xr: 0.5, yr: 0.14 },
                  { xr: 0.82, yr: 0.14 },
                  { xr: 0.18, yr: 0.86 },
                  { xr: 0.5, yr: 0.86 },
                  { xr: 0.82, yr: 0.86 },
                ];
          doorPts.forEach((sp, i) => {
            spots.push({
              spotId: `${door.id}_r0_${i}`,
              boxId: box.id,
              doorId: door.id,
              rowIndex: 0,
              xRatio: sp.xr,
              yRatio: sp.yr,
              x: dx + dw * sp.xr,
              y: dy + dh * sp.yr,
            });
          });
        }
      });
    });
    return spots;
  }, [wall, tool, handleOrient, originX, floorY, s]);

  const doorPreview = useMemo(() => {
    if (!wall || tool !== 'doors' || doorsLocked || !doorHover) return null;
    const box = wall.boxes.find((b) => b.id === doorHover.boxId);
    if (!box) return null;
    return {
      box,
      result: computeDoorBrushPreview(
        box,
        doorHover.cursorCmInBox,
        doorOrient,
        doorVertCount,
        drawerPatIdx,
        liftPatIdx,
        blockedZones,
        doorTargetWidth
      ),
    };
  }, [
    wall,
    tool,
    doorsLocked,
    doorHover,
    doorOrient,
    doorVertCount,
    drawerPatIdx,
    liftPatIdx,
    blockedZones,
    doorTargetWidth,
  ]);

  const countertopSegments = useMemo(() => {
    if (!wall) return [];
    const baseBoxes = wall.boxes
      .filter((b) => b.countertopCm > 0)
      .sort((a, b) => a.offsetX - b.offsetX);
    const segs: Array<{ startCm: number; endCm: number; topElevCm: number; thicknessCm: number }> = [];
    for (const b of baseBoxes) {
      const topElev = b.elevY + b.height;
      const prev = segs[segs.length - 1];
      if (prev && Math.abs(prev.endCm - b.offsetX) <= 2 && prev.topElevCm === topElev) {
        prev.endCm = Math.max(prev.endCm, b.offsetX + b.width);
      } else {
        segs.push({
          startCm: b.offsetX,
          endCm: b.offsetX + b.width,
          topElevCm: topElev,
          thicknessCm: b.countertopCm,
        });
      }
    }
    return segs;
  }, [wall]);

  const backsplashSpans = useMemo(
    () => (wall ? computeWallBacksplashSpans(wall) : []),
    [wall]
  );

  const isPointOverCountertop = (pt: { x: number; y: number }) =>
    countertopSegments.some((seg) => {
      const cx = originX + seg.startCm * s;
      const cw = (seg.endCm - seg.startCm) * s;
      const ch = seg.thicknessCm * s;
      const cy = floorY - seg.topElevCm * s;
      return pt.x >= cx - 2 && pt.x <= cx + cw + 2 && pt.y >= cy - 4 && pt.y <= cy + ch + 4;
    });

  const isPointOverBacksplash = (pt: { x: number; y: number }) =>
    backsplashSpans.some((sp) => {
      const sx = originX + sp.startCm * s;
      const ex = originX + sp.endCm * s;
      const topPy = floorY - sp.topY * s;
      const botPy = floorY - sp.botY * s;
      return pt.x >= sx && pt.x <= ex && pt.y >= topPy && pt.y <= botPy;
    });

  const applySelectionDelta = (
    prev: MultiSelection | undefined,
    kind: 'door' | 'box',
    itemId: string
  ): MultiSelection | undefined => {
    const next: MultiSelection = prev
      ? {
          boxIds: [...prev.boxIds],
          doorIds: [...prev.doorIds],
          openingIds: [...prev.openingIds],
          applianceIds: [...prev.applianceIds],
        }
      : { boxIds: [], doorIds: [], openingIds: [], applianceIds: [] };
    const arr = kind === 'door' ? next.doorIds : next.boxIds;
    if (selectionMode === 'add') {
      if (!arr.includes(itemId)) arr.push(itemId);
    } else if (selectionMode === 'subtract') {
      const idx = arr.indexOf(itemId);
      if (idx !== -1) arr.splice(idx, 1);
    }
    const total =
      next.boxIds.length + next.doorIds.length + next.openingIds.length + next.applianceIds.length;
    return total > 0 ? next : undefined;
  };

  // Subtle architectural horizontal gap dimensions along base floor line
  const gapDimensions = useMemo(() => {
    if (!wall) return [];
    const intervals: Array<{ start: number; end: number }> = [];
    for (const b of wall.boxes) {
      if (b.type === 'wall' || b.type === 'wall-deep') continue;
      intervals.push({ start: b.offsetX, end: b.offsetX + b.width });
    }
    for (const op of wall.openings || []) {
      if (op.elevY < 90) intervals.push({ start: op.offsetX, end: op.offsetX + op.width });
    }
    for (const z of blockedZones) {
      if (z.tier === 'lower') intervals.push({ start: z.startCm, end: z.endCm });
    }
    if (!intervals.length) return [];
    intervals.sort((a, b) => a.start - b.start);
    const merged: Array<{ start: number; end: number }> = [];
    for (const iv of intervals) {
      if (!merged.length || iv.start > merged[merged.length - 1].end + 0.5) {
        merged.push({ ...iv });
      } else {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, iv.end);
      }
    }
    const gaps: Array<{ start: number; end: number; len: number }> = [];
    let cur = 0;
    for (const m of merged) {
      if (m.start - cur >= 8) {
        gaps.push({ start: cur, end: m.start, len: Math.round(m.start - cur) });
      }
      cur = Math.max(cur, m.end);
    }
    if (wall.length - cur >= 8) {
      gaps.push({ start: cur, end: wall.length, len: Math.round(wall.length - cur) });
    }
    return gaps;
  }, [wall, blockedZones]);

  const wheelHandlerRef = useRef<(e: WheelEvent) => void>(() => {});
  const touchMoveHandlerRef = useRef<(e: TouchEvent) => void>(() => {});

  const stepToolOption = (
    dir: number,
    contextBox: CabinetBox | null,
    overWallArea: boolean,
    overBacksplash = false,
    overCountertop = false,
    anywhere = false
  ): boolean => {
    if (tool === 'doors' && (anywhere || (contextBox && contextBox.type !== 'fridge'))) {
      if (doorOrient === 'vertical') {
        onDoorVertCountChange(Math.max(1, Math.min(4, doorVertCount + dir)));
      } else if (contextBox && (contextBox.type === 'wall' || contextBox.type === 'wall-deep')) {
        onLiftPatIdxChange((liftPatIdx + (dir > 0 ? 1 : LIFT_PATTERNS.length - 1)) % LIFT_PATTERNS.length);
      } else {
        onDrawerPatIdxChange(
          (drawerPatIdx + (dir > 0 ? 1 : DRAWER_PATTERNS.length - 1)) % DRAWER_PATTERNS.length
        );
      }
      return true;
    }
    if (tool === 'handle' && (anywhere || (contextBox && contextBox.type !== 'fridge')) && onHandleStyleChange) {
      const idx = Math.max(0, HANDLE_STYLE_ORDER.indexOf(handleStyle));
      const nxt = HANDLE_STYLE_ORDER[(idx + (dir > 0 ? 1 : HANDLE_STYLE_ORDER.length - 1)) % HANDLE_STYLE_ORDER.length];
      onHandleStyleChange(nxt);
      onToast(`مدل دستگیره: ${nxt === 'knob' ? 'دکمه‌ای' : nxt === 'hidden' ? 'مخفی' : 'میله‌ای'}`);
      return true;
    }
    if (tool === 'sink' && (anywhere || (contextBox && contextBox.type === 'base'))) {
      const idx = SINK_MODEL_ORDER.indexOf(sinkModel);
      onSinkModelChange(
        SINK_MODEL_ORDER[(idx + (dir > 0 ? 1 : SINK_MODEL_ORDER.length - 1)) % SINK_MODEL_ORDER.length]
      );
      return true;
    }
    if (tool === 'gas' && (anywhere || (contextBox && contextBox.type === 'base'))) {
      const widths = [...GAS_WIDTH_OPTIONS];
      const idx = Math.max(0, widths.indexOf(gasWidth as (typeof GAS_WIDTH_OPTIONS)[number]));
      onGasWidthChange(widths[(idx + (dir > 0 ? 1 : widths.length - 1)) % widths.length]);
      return true;
    }
    if (tool === 'appliance' && (anywhere || (contextBox && contextBox.type === 'base'))) {
      const idx = Math.max(0, APPLIANCE_ORDER.indexOf(applianceKind));
      onApplianceKindChange(
        APPLIANCE_ORDER[(idx + (dir > 0 ? 1 : APPLIANCE_ORDER.length - 1)) % APPLIANCE_ORDER.length]
      );
      return true;
    }
    if (tool === 'fridge' && (anywhere || overWallArea)) {
      const idx = FRIDGE_MODEL_ORDER.indexOf(fridgeModel);
      onFridgeModelChange(
        FRIDGE_MODEL_ORDER[(idx + (dir > 0 ? 1 : FRIDGE_MODEL_ORDER.length - 1)) % FRIDGE_MODEL_ORDER.length]
      );
      return true;
    }
    if (tool === 'opening' && (anywhere || overWallArea)) {
      const idx = OPENING_ORDER.indexOf(openingKind);
      onOpeningKindChange(
        OPENING_ORDER[(idx + (dir > 0 ? 1 : OPENING_ORDER.length - 1)) % OPENING_ORDER.length]
      );
      return true;
    }
    if (tool === 'door-style' && (anywhere || contextBox || overWallArea)) {
      const idx = Math.max(0, DOOR_STYLE_ORDER.indexOf(doorStyleBrush));
      const next = DOOR_STYLE_ORDER[(idx + (dir > 0 ? 1 : DOOR_STYLE_ORDER.length - 1)) % DOOR_STYLE_ORDER.length];
      onDoorStyleBrushChange(next);
      onToast(`مدل درب: ${DOOR_STYLE_META[next].label}`);
      return true;
    }
    if (tool === 'finish' && (anywhere || contextBox || overBacksplash || overCountertop || overWallArea)) {
      if (overCountertop) {
        const idx = Math.max(0, COUNTERTOP_FINISH_ORDER.indexOf(countertopBrush));
        const next = COUNTERTOP_FINISH_ORDER[(idx + (dir > 0 ? 1 : COUNTERTOP_FINISH_ORDER.length - 1)) % COUNTERTOP_FINISH_ORDER.length];
        onCountertopBrushChange(next);
        onToast(`صفحه: ${COUNTERTOP_FINISHES[next].label}`);
        return true;
      }
      if (overBacksplash && !contextBox) {
        const idx = Math.max(0, BACKSPLASH_FINISH_ORDER.indexOf(backsplashBrush));
        const next = BACKSPLASH_FINISH_ORDER[(idx + (dir > 0 ? 1 : BACKSPLASH_FINISH_ORDER.length - 1)) % BACKSPLASH_FINISH_ORDER.length];
        onBacksplashBrushChange(next);
        onToast(`کاشی بین‌کابینتی: ${BACKSPLASH_FINISHES[next].label}`);
        return true;
      }
      const idx = Math.max(0, CABINET_FINISH_ORDER.indexOf(cabinetFinishBrush));
      const next = CABINET_FINISH_ORDER[(idx + (dir > 0 ? 1 : CABINET_FINISH_ORDER.length - 1)) % CABINET_FINISH_ORDER.length];
      onCabinetFinishBrushChange(next);
      onToast(`رنگ کابینت: ${CABINET_FINISHES[next].label}`);
      return true;
    }
    if (tool === 'door-pencil' && (anywhere || (contextBox && contextBox.type !== 'fridge'))) {
      const nxt = doorBandPos === 'top' ? 'bottom' : 'top';
      onDoorBandPosChange?.(nxt);
      onToast(`موقعیت کشو: ${nxt === 'top' ? 'بالای درب' : 'پایین درب'}`);
      return true;
    }
    if ((tool === 'pencil' || tool === 'skeleton') && (anywhere || (contextBox && contextBox.type !== 'fridge'))) {
      onShelfCountChange(Math.max(1, Math.min(4, shelfCount + dir)));
      return true;
    }
    if (tool === 'cab-draw' && (anywhere || overWallArea) && onDrawBoxKindChange) {
      const idx = Math.max(0, CAB_DRAW_KIND_ORDER.indexOf(drawBoxKind));
      const next =
        CAB_DRAW_KIND_ORDER[
          (idx + (dir > 0 ? 1 : CAB_DRAW_KIND_ORDER.length - 1)) % CAB_DRAW_KIND_ORDER.length
        ];
      onDrawBoxKindChange(next);
      onToast(`مدل باکس: ${BOX_PRESETS[next].name}`);
      return true;
    }
    if (tool === 'frame' && (anywhere || contextBox || overWallArea)) {
      const idx = Math.max(0, FRAME_WIDTH_OPTIONS.indexOf(frameWidthCm as (typeof FRAME_WIDTH_OPTIONS)[number]));
      const nextIdx = Math.max(0, Math.min(FRAME_WIDTH_OPTIONS.length - 1, idx + dir));
      onFrameWidthCmChange(FRAME_WIDTH_OPTIONS[nextIdx]);
      return true;
    }
    return false;
  };

  wheelHandlerRef.current = (e: WheelEvent) => {
    e.preventDefault();
    const pt = clientToSvg(e.clientX, e.clientY);
    const boxHit = hitTestBox(pt);
    const overBacksplash = isPointOverBacksplash(pt);
    const overCountertop = isPointOverCountertop(pt);
    const overWallArea =
      !!wall && pt.x >= originX && pt.x <= originX + wallW && pt.y >= floorY - wallH && pt.y <= floorY;
    const isCyclableTool = tool !== 'select' && tool !== 'wall' && tool !== 'eraser';

    if (!e.ctrlKey && isCyclableTool) {
      setHoverClientPt({ x: e.clientX, y: e.clientY });
      const pacedDir = gestureStepperRef.current.consumeWheelDelta(e.deltaY, e.deltaMode);
      if (pacedDir !== 0) {
        if (e.shiftKey && tool === 'doors') {
          const isWallTarget = boxHit?.box.type === 'wall' || boxHit?.box.type === 'wall-deep';
          if (doorOrient === 'horizontal' && isWallTarget) {
            onLiftPatIdxChange((liftPatIdx + (pacedDir > 0 ? 1 : LIFT_PATTERNS.length - 1)) % LIFT_PATTERNS.length);
          } else {
            onDoorVertCountChange(Math.max(1, Math.min(4, doorVertCount + pacedDir)));
          }
        } else {
          stepToolOption(pacedDir, boxHit?.box || null, overWallArea, overBacksplash, overCountertop, true);
        }
      }
      return;
    }

    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const cx = e.clientX - rect.left - rect.width / 2;
    const cy = e.clientY - rect.top - rect.height / 2;
    const factor = e.deltaY < 0 ? 1.1 : 0.91;
    const nextS = +Math.max(0.6, Math.min(5.2, pxPerCm * factor)).toFixed(2);
    const ratio = nextS / pxPerCm;
    const nextPan = {
      x: Math.round(cx - (cx - pan.x) * ratio),
      y: Math.round(cy - (cy - pan.y) * ratio),
    };
    onZoomAndPanChange(nextS, nextPan);
  };

  const handleTouchStart = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length >= 2) {
      lastMultiTouchMsRef.current = performance.now();
      lastPlaceTapRef.current = null;
      dragOp.current = null;
      gestureStepperRef.current.resetTouch();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const pt = clientToSvg(midX, midY);
      const boxHit = hitTestBox(pt);
      const overWallArea =
        !!wall && pt.x >= originX && pt.x <= originX + wallW && pt.y >= floorY - wallH && pt.y <= floorY;

      touchPinch.current = {
        dist: Math.hypot(dx, dy),
        midX,
        midY,
        lastStepY: midY,
        origScale: pxPerCm,
        origPan: { ...pan },
        overContext: true,
        contextBox: boxHit?.box || null,
        overWallArea,
      };
    }
  };

  touchMoveHandlerRef.current = (e: TouchEvent) => {
    if (e.touches.length === 2 && touchPinch.current) {
      e.preventDefault();
      lastMultiTouchMsRef.current = performance.now();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

      const distDelta = Math.abs(dist - touchPinch.current.dist);
      if (distDelta > 22) {
        const ratio = dist / Math.max(10, touchPinch.current.dist);
        const nextS = +Math.max(0.6, Math.min(5.2, touchPinch.current.origScale * ratio)).toFixed(2);
        onZoomAndPanChange(nextS, {
          x: touchPinch.current.origPan.x + (midX - touchPinch.current.midX),
          y: touchPinch.current.origPan.y + (midY - touchPinch.current.midY),
        });
      } else {
        const isCyclableTool = tool !== 'select' && tool !== 'wall' && tool !== 'eraser';
        const stepDelta = midY - touchPinch.current.lastStepY;
        touchPinch.current.lastStepY = midY;
        if (isCyclableTool) {
          setHoverClientPt({ x: midX, y: midY });
          const pacedDir = gestureStepperRef.current.consumeTouchDelta(stepDelta);
          if (pacedDir !== 0) {
            stepToolOption(
              pacedDir,
              touchPinch.current.contextBox,
              touchPinch.current.overWallArea,
              false,
              false,
              true
            );
          }
          return;
        }
        onPanChange({
          x: touchPinch.current.origPan.x + (midX - touchPinch.current.midX),
          y: touchPinch.current.origPan.y + (midY - touchPinch.current.midY),
        });
      }
    }
  };

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => wheelHandlerRef.current(e);
    const onTouchMove = (e: TouchEvent) => touchMoveHandlerRef.current(e);
    svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      svg.removeEventListener('wheel', onWheel);
      svg.removeEventListener('touchmove', onTouchMove);
    };
  }, []);

  const resolveFrameTargetAtPoint = (pt: { x: number; y: number }): {
    box: CabinetBox;
    bx: number;
    by: number;
    bw: number;
    bodyH: number;
    side: FrameSide | 'invalid';
    seamCm?: number;
    reason?: string;
  } | null => {
    if (!wall) return null;
    const hit = hitTestBox(pt);
    if (!hit || hit.box.type === 'fridge') return null;
    const { box, bx, by, bw, bodyH } = hit;
    const edgeTol = Math.max(10, Math.min(22, frameWidthCm * s + 6));
    const topPad = box.countertopCm * s;
    const insets = getEffectiveBoxInsets(box);
    const scaleX = Math.max(0.2, (box.width - insets.left - insets.right) / Math.max(1, box.width));
    const dLeft = Math.abs(pt.x - bx);
    const dRight = Math.abs(bx + bw - pt.x);
    const dTop = Math.abs(pt.y - (by + topPad));
    const dBot = Math.abs(by + bodyH - pt.y);

    const clickCm = ((pt.x - bx) / s - insets.left) / scaleX;
    const exposure = getBoxSideExposure(box, wall, allWalls, cornerOwners, blockedZones);

    const minEdge = Math.min(dLeft, dRight, dTop, dBot);
    if (minEdge <= edgeTol) {
      if (minEdge === dLeft) {
        if (!exposure.leftExposed) {
          return { ...hit, side: 'invalid', reason: exposure.leftReason };
        }
        return { ...hit, side: 'left' };
      }
      if (minEdge === dRight) {
        if (!exposure.rightExposed) {
          return { ...hit, side: 'invalid', reason: exposure.rightReason };
        }
        return { ...hit, side: 'right' };
      }
      if (minEdge === dTop) return { ...hit, side: 'top' };
      if (box.plinth > 0) {
        return { ...hit, side: 'invalid', reason: 'زیر باکس پاخور دارد' };
      }
      return { ...hit, side: 'bottom' };
    }

    // Match either explicit unitDivider OR real door-to-door seam (e.g. on wall cabinets)
    const candidateSeams = new Set<number>(
      box.unitDividers.filter((u) => u > 2 && u < box.width - 2)
    );
    for (const d of box.doors) {
      if (d.startCm > 2 && d.startCm < box.width - 2) candidateSeams.add(+d.startCm.toFixed(1));
      const endCm = +(d.startCm + d.widthCm).toFixed(1);
      if (endCm > 2 && endCm < box.width - 2) candidateSeams.add(endCm);
    }
    const nearSeam = Array.from(candidateSeams).find((u) => Math.abs(u - clickCm) <= 7);
    if (nearSeam !== undefined) {
      return { ...hit, side: 'seam', seamCm: nearSeam };
    }

    return {
      ...hit,
      side: 'invalid',
      reason: 'فریم روی لبه‌های آزاد باکس یا درز بین درب‌ها نصب می‌شود',
    };
  };

  const resolveApplianceHover = (pt: { x: number; y: number }) => {
    if (!wall || (tool !== 'sink' && tool !== 'gas' && tool !== 'appliance')) return null;
    const clickXCm = (pt.x - originX) / s;
    const hit = hitTestBox(pt);
    let targetBase: CabinetBox | undefined = hit && hit.box.type === 'base' ? hit.box : undefined;
    if (!targetBase) {
      targetBase = wall.boxes.find((b) => {
        if (b.type !== 'base') return false;
        const bx = originX + b.offsetX * s;
        const bw = b.width * s;
        const bh = b.height * s;
        const by = floorY - b.elevY * s - bh;
        return pt.x >= bx && pt.x <= bx + bw && pt.y >= by - 36 * s && pt.y <= by + bh;
      });
    }
    if (!targetBase) return null;

    const kind: ApplianceKind =
      tool === 'sink' ? 'sink' : tool === 'gas' ? 'gas' : applianceKind;
    const sMod = kind === 'sink' ? sinkModel : undefined;
    const wCm =
      kind === 'sink' && sMod
        ? SINK_MODELS[sMod].width
        : kind === 'gas'
        ? gasWidth
        : APPLIANCE_CONFIGS[kind].width;

    let minX = targetBase.offsetX;
    let maxX = targetBase.offsetX + targetBase.width - wCm;
    let offsetX = Math.max(minX, Math.min(maxX, Math.round((clickXCm - wCm / 2) / 5) * 5));
    let valid = maxX >= minX;
    let reason: string | undefined = valid ? undefined : 'عرض باکس کافی نیست';

    if (kind === 'sink' && sMod === 'corner-sink') {
      const junctions = detectCornerJunctions(allWalls, cornerOwners);
      const validEnds: Array<'start' | 'end'> = [];
      for (const j of junctions) {
        const isA = j.wallAId === wall.id;
        const isB = j.wallBId === wall.id;
        if (!isA && !isB) continue;
        const myEnd = isA ? j.wallAEnd : j.wallBEnd;
        const otherW = allWalls.find((w) => w.id === (isA ? j.wallBId : j.wallAId));
        const otherEnd = isA ? j.wallBEnd : j.wallAEnd;
        if (!otherW) continue;
        if (analyzeCornerJunction(wall, myEnd, otherW, otherEnd).kind !== 'inside-90') continue;
        const covers =
          myEnd === 'start'
            ? targetBase.offsetX <= 5
            : targetBase.offsetX + targetBase.width >= wall.length - 5;
        if (covers && targetBase.width >= wCm - 1) validEnds.push(myEnd);
      }
      if (!validEnds.length) {
        valid = false;
        reason = 'فقط در کنج ۹۰ درجه قابل نصب است';
      } else {
        const nearStart = validEnds.includes('start') ? Math.abs(clickXCm) : Infinity;
        const nearEnd = validEnds.includes('end') ? Math.abs(wall.length - clickXCm) : Infinity;
        const bestDist = Math.min(nearStart, nearEnd);
        const snapStart = nearStart <= nearEnd;
        offsetX = snapStart ? 0 : Math.max(0, wall.length - wCm);
        if (bestDist > 110) {
          valid = false;
          reason = 'سینک کنج را نزدیک گوشه قرار دهید';
        }
      }
    }

    const alreadySameHere = wall.appliances.some(
      (other) =>
        other.kind === kind &&
        (!sMod || other.sinkModel === sMod) &&
        Math.abs(other.offsetX - offsetX) <= 3
    );
    if (alreadySameHere) return null;

    return {
      kind,
      sinkModel: sMod,
      offsetX,
      width: wCm,
      topElevCm: targetBase.elevY + targetBase.height,
      plinthCm: targetBase.plinth,
      countertopCm: targetBase.countertopCm,
      valid,
      reason,
    };
  };

  const isSpacedDoublePlacement = (e: React.PointerEvent<SVGSVGElement>, toolId: ToolId): boolean => {
    const now = performance.now();
    if (now - lastMultiTouchMsRef.current < 420 || activePointersRef.current.size > 1) {
      lastPlaceTapRef.current = null;
      return false;
    }
    // All mouse/pen design actions are ONE click: inserting door, handle,
    // appliance, frame and clicking empty space to switch orientation.
    // Keep existing deliberate double-tap semantics only on touch screens
    // to avoid accidental painting while zooming/panning.
    if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
      lastPlaceTapRef.current = null;
      return true;
    }
    const prev = lastPlaceTapRef.current;
    const minGap = e.pointerType === 'touch' ? 75 : 0;
    if (
      prev &&
      prev.tool === toolId &&
      now - prev.ts >= minGap &&
      now - prev.ts <= 750 &&
      Math.hypot(e.clientX - prev.x, e.clientY - prev.y) <= 38
    ) {
      lastPlaceTapRef.current = null;
      return true;
    }
    lastPlaceTapRef.current = { ts: now, x: e.clientX, y: e.clientY, tool: toolId };
    return false;
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button === 2 || !wall) return;
    activePointersRef.current.add(e.pointerId);
    if (
      (e.pointerType === 'touch' && activePointersRef.current.size >= 2) ||
      performance.now() - lastMultiTouchMsRef.current < 420
    ) {
      if (e.pointerType === 'touch' && activePointersRef.current.size >= 2) {
        lastMultiTouchMsRef.current = performance.now();
      }
      lastPlaceTapRef.current = null;
      dragOp.current = null;
      return;
    }

    // Middle-click or Space + Left-click always pans cleanly in ANY tool!
    if (e.button === 1 || spaceDown) {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragOp.current = {
        mode: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        origX: pan.x,
        origY: pan.y,
      };
      return;
    }

    const target = e.target as Element;
    const pt = clientToSvg(e.clientX, e.clientY);
    const hit = hitTestBox(pt);

    // 0. Unified Priority Eraser Tool (must run before any resize/select handle checks!)
    if (tool === 'eraser') {
      const frameEl = target.closest('[data-frame-id]');
      if (frameEl) {
        const fId = frameEl.getAttribute('data-frame-id');
        const bId = frameEl.getAttribute('data-box-id') || hit?.box.id;
        if (bId && fId) {
          onMutateWall((w) => {
            const b = w.boxes.find((x) => x.id === bId);
            if (b && b.frames) b.frames = b.frames.filter((f) => f.id !== fId);
          }, true, 'فریم حذف شد');
          onSelectFrame?.(bId, null);
          return;
        }
      }
      const handEl = target.closest('[data-handle-id]');
      if (handEl) {
        const hId = handEl.getAttribute('data-handle-id');
        const bId = handEl.getAttribute('data-box-id') || hit?.box.id;
        if (bId && hId) {
          onMutateWall((w) => {
            const b = w.boxes.find((x) => x.id === bId);
            if (b) {
              const removed = b.handles.find((h) => h.id === hId);
              b.handles = b.handles.filter((h) => h.id !== hId);
              if (removed && !b.handles.some((h) => h.doorId === removed.doorId)) {
                const affDoor = b.doors.find((d) => d.id === removed.doorId);
                if (affDoor) affDoor.hingeSide = undefined;
              }
            }
          }, true, 'دستگیره حذف شد');
          return;
        }
      }
      const shelfEl = target.closest('[data-shelf-id]');
      if (shelfEl) {
        const sId = shelfEl.getAttribute('data-shelf-id');
        const bId = shelfEl.getAttribute('data-box-id') || hit?.box.id;
        if (bId && sId) {
          onMutateWall((w) => {
            const b = w.boxes.find((x) => x.id === bId);
            if (b) b.shelves = b.shelves.filter((sh) => sh.id !== sId);
          }, true, 'طبقه حذف شد');
          return;
        }
      }
      const unitEl = target.closest('[data-unit-div]');
      if (unitEl) {
        const uCm = Number(unitEl.getAttribute('data-unit-div'));
        const bId = unitEl.getAttribute('data-box-id') || hit?.box.id;
        if (bId && !Number.isNaN(uCm)) {
          onMutateWall((w) => {
            const b = w.boxes.find((x) => x.id === bId);
            if (b) removeUnitDividerWithSync(b, uCm, blockedZones);
          }, true, 'دیواره یونیت و اتصالات داخلی حذف شد');
          onSelectUnitDivider?.(null);
          return;
        }
      }
      const openDel = target.closest('[data-opening-id]');
      if (openDel) {
        const oId = openDel.getAttribute('data-opening-id');
        onMutateWall((w) => {
          w.openings = (w.openings || []).filter((o) => o.id !== oId);
        }, true, 'پنجره / درب / ستون حذف شد');
        onSelectOpening(null);
        return;
      }
      const appDel = target.closest('[data-app-id]');
      if (appDel) {
        const aId = appDel.getAttribute('data-app-id');
        if (aId) {
          onMutateWall((w) => {
            deleteApplianceHierarchically(w, aId);
          }, true, 'تجهیز و متعلقات یونیت آن حذف شد');
          onSelectAppliance?.(null);
        }
        return;
      }
      const doorEl = target.closest('[data-door-id]');
      if (doorEl && hit && hit.box.type !== 'fridge') {
        const dId = doorEl.getAttribute('data-door-id')!;
        let msg = '';
        onMutateWall((w) => {
          const b = w.boxes.find((x) => x.id === hit.box.id);
          if (b) msg = eraseDoorWithRule(b, dId);
        }, true);
        if (msg) onToast(msg);
        return;
      }
      if (hit) {
        const bId = hit.box.id;
        onMutateWall((w) => {
          deleteBoxHierarchically(w, bId);
        }, true, 'باکس و متعلقات آن حذف شدند');
        onSelectBoxAndDoor(null, null);
        return;
      }
      return;
    }

    // 1. Interactive Opening Resize Handles
    const openHandleEl = target.closest('[data-opening-handle]');
    if (openHandleEl) {
      const oId = openHandleEl.getAttribute('data-opening-id');
      const side = openHandleEl.getAttribute('data-opening-handle') as 'left' | 'right' | 'top' | 'bottom';
      const op = wall.openings?.find((o) => o.id === oId);
      if (op) {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragOp.current = {
          mode: 'resize-opening',
          openingId: op.id,
          side,
          startPt: pt,
          origX: op.offsetX,
          origW: op.width,
          origElev: op.elevY,
          origH: op.height,
        };
        return;
      }
    }

    // 2. Box resize handles
    const boxHandleEl = target.closest('[data-box-handle]');
    if (boxHandleEl) {
      const bId = boxHandleEl.getAttribute('data-box-id');
      const side = boxHandleEl.getAttribute('data-box-handle') as 'left' | 'right' | 'top' | 'bottom';
      const box = wall.boxes.find((b) => b.id === bId);
      if (box) {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragOp.current = {
          mode: 'resize-box',
          side,
          boxId: box.id,
          startPt: pt,
          origX: box.offsetX,
          origW: box.width,
          origElev: box.elevY,
          origH: box.height,
          lastElev: box.elevY,
          lastH: box.height,
        };
        return;
      }
    }

    // 2b. Unit divider drag resize handle
    const unitDivResizeEl = target.closest('[data-unit-div-resize]');
    if (unitDivResizeEl) {
      const seamVal = Number(unitDivResizeEl.getAttribute('data-unit-div-resize'));
      const bId = unitDivResizeEl.getAttribute('data-box-id');
      const boxObj = wall.boxes.find((b) => b.id === bId);
      if (boxObj && !Number.isNaN(seamVal)) {
        const insets = getEffectiveBoxInsets(boxObj);
        const scaleX = Math.max(
          0.2,
          (boxObj.width - insets.left - insets.right) / Math.max(1, boxObj.width)
        );
        onSelectUnitDivider?.({ boxId: boxObj.id, seamCm: seamVal });
        e.currentTarget.setPointerCapture(e.pointerId);
        dragOp.current = {
          mode: 'resize-unit-div',
          boxId: boxObj.id,
          origSeamCm: seamVal,
          currentSeamCm: seamVal,
          startX: pt.x,
          bx: originX + boxObj.offsetX * s,
          insetsLeft: insets.left,
          scaleX,
        };
        return;
      }
    }

    // 3a. Coupled door seam resize handle (between touching doors)
    const doorSeamEl = target.closest('[data-door-seam]');
    if (doorSeamEl) {
      const dId = doorSeamEl.getAttribute('data-door-seam');
      const bId = doorSeamEl.getAttribute('data-box-id');
      if (dId && bId) {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragOp.current = {
          mode: 'resize-door-seam',
          boxId: bId,
          leftDoorId: dId,
          lastX: pt.x,
        };
        return;
      }
    }

    // 3b. Standalone door resize handle
    const doorResizeEl = target.closest('[data-door-resize]');
    if (doorResizeEl) {
      const dId = doorResizeEl.getAttribute('data-door-resize');
      const bId = doorResizeEl.getAttribute('data-box-id');
      const box = wall.boxes.find((b) => b.id === bId);
      const door = box?.doors.find((d) => d.id === dId);
      if (box && door) {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragOp.current = {
          mode: 'resize-door',
          boxId: box.id,
          doorId: door.id,
          startPt: pt,
          origW: door.widthCm,
        };
        return;
      }
    }

    // 4. Drag & Select appliance (works in Select mode OR when matching placement tool is active)
    const appEl = target.closest('[data-app-id]');
    if (appEl) {
      const appId = appEl.getAttribute('data-app-id');
      const app = wall.appliances.find((a) => a.id === appId);
      const canDragApp =
        app &&
        (tool === 'select' ||
          (tool === 'gas' && app.kind === 'gas') ||
          (tool === 'sink' && app.kind === 'sink') ||
          (tool === 'appliance' && (app.kind === 'dishwasher' || app.kind === 'washing')));
      if (canDragApp && app) {
        onSetMultiSelection(undefined);
        onSelectAppliance?.(app.id);
        e.currentTarget.setPointerCapture(e.pointerId);
        dragOp.current = {
          mode: 'move-app',
          appId: app.id,
          startPt: pt,
          origX: app.offsetX,
          lastTargetX: app.offsetX,
          sessionId: `fapp_${Date.now()}_${Math.random()}`,
        };
        return;
      }
    }

    // 4b. Click/Drag Opening in Select mode
    const openEl = target.closest('[data-opening-id]');
    if (openEl && (tool === 'select' || tool === 'opening')) {
      const oId = openEl.getAttribute('data-opening-id');
      const op = wall.openings?.find((o) => o.id === oId);
      if (op) {
        onSelectOpening(op.id);
        e.currentTarget.setPointerCapture(e.pointerId);
        dragOp.current = {
          mode: 'move-opening',
          openingId: op.id,
          startPt: pt,
          origX: op.offsetX,
          origElev: op.elevY,
        };
        return;
      }
    }

    // 5. Handle Tool
    if (tool === 'handle') {
      if (!hit) {
        if (!isSpacedDoublePlacement(e, 'handle')) return;
        onHandleOrientChange(handleOrient === 'vertical' ? 'horizontal' : 'vertical');
        onToast(`جهت دستگیره: ${handleOrient === 'vertical' ? 'افقی' : 'عمودی'}`);
        return;
      }

      const handEl = target.closest('[data-handle-id]');
      if (handEl) {
        const hId = handEl.getAttribute('data-handle-id');
        const hObj = hit.box.handles.find((h) => h.id === hId);
        if (hObj) {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragOp.current = {
            mode: 'stretch-handle',
            boxId: hit.box.id,
            handleId: hObj.id,
            orient: hObj.orient,
            startPt: pt,
            origLen: hObj.lengthCm || 16,
          };
          return;
        }
      }

      const spotEl = target.closest('[data-hand-spot]');
      if (spotEl) {
        if (!isSpacedDoublePlacement(e, 'handle')) return;
        const sp = computedSpots.find(
          (x) => x.spotId === spotEl.getAttribute('data-hand-spot')
        );
        if (sp) {
          const isBatch = Boolean(multiSelection && multiSelection.doorIds.length > 0);
          const executePlace = () => {
            if (isBatch && multiSelection) {
              const highlightedIds: string[] = [];
              onMutateWall(
                (w) => {
                  for (const b of w.boxes) {
                    const hasTarget = b.doors.some((d) => multiSelection.doorIds.includes(d.id));
                    if (!hasTarget) continue;
                    const au = autoUnitizeBoxForHandles(b, blockedZones);
                    if (au.addedDividers.length > 0) highlightedIds.push(b.id);
                    applyHandlesToBoxDoors(
                      b,
                      multiSelection.doorIds,
                      handleStyle,
                      handleOrient,
                      { xRatio: sp.xRatio, yRatio: sp.yRatio },
                      blockedZones
                    );
                  }
                },
                true,
                highlightedIds.length > 0
                  ? 'یونیت‌بندی خودکار و نصب دستگیره روی درب‌های انتخاب‌شده انجام شد'
                  : `دستگیره روی ${multiSelection.doorIds.length} درب انتخاب‌شده اعمال شد`
              );
              if (highlightedIds[0]) onTriggerAutoUnitHighlight?.(highlightedIds[0]);
              return;
            }

            let autoHighlighted = false;
            const newH: HandleItem = {
              id: uid('hand'),
              doorId: sp.doorId,
              rowIndex: sp.rowIndex,
              xRatio: sp.xRatio,
              yRatio: sp.yRatio,
              orient: handleOrient,
              style: handleStyle,
              lengthCm: 16,
            };
            onMutateWall((w) => {
              const b = w.boxes.find((x) => x.id === sp.boxId);
              if (!b) return;
              const au = autoUnitizeBoxForHandles(b, blockedZones);
              if (au.addedDividers.length > 0) autoHighlighted = true;
              const targetDoor = b.doors.find((d) => d.id === sp.doorId);
              if (targetDoor && targetDoor.kind === 'door' && targetDoor.doorStyle !== 'pantry') {
                if (sp.xRatio >= 0.7) targetDoor.hingeSide = 'left';
                else if (sp.xRatio <= 0.3) targetDoor.hingeSide = 'right';
              }
              b.handles = b.handles.filter(
                (h) => !(h.doorId === sp.doorId && h.rowIndex === sp.rowIndex)
              );
              b.handles.push(newH);
            }, true, autoHighlighted ? 'یونیت‌بندی خودکار انجام و دستگیره نصب شد' : undefined);
            if (autoHighlighted) onTriggerAutoUnitHighlight?.(sp.boxId);
          };

          const targetBox = wall.boxes.find((b) => b.id === sp.boxId);
          const targetDoor = targetBox?.doors.find((d) => d.id === sp.doorId);
          const hasCncTarget = isBatch
            ? wall.boxes.some((b) =>
                b.doors.some((d) => multiSelection?.doorIds.includes(d.id) && d.doorStyle === 'cnc')
              )
            : targetDoor?.doorStyle === 'cnc';

          if (handleStyle === 'hidden' && (designStyle === 'neoclassic' || hasCncTarget) && onConfirmHiddenHandle) {
            onConfirmHiddenHandle(executePlace);
            return;
          }

          executePlace();
          return;
        }
      }

      if (selectionMode !== 'single') {
        const doorEl = target.closest('[data-door-id]');
        const doorId = doorEl?.getAttribute('data-door-id');
        if (doorId) {
          const nextSel = applySelectionDelta(multiSelection, 'door', doorId);
          onSetMultiSelection(nextSel);
          onSelectBoxAndDoor(hit.box.id, selectionMode === 'subtract' ? null : doorId);
          return;
        }
      }
      return;
    }

    // 5a. Door Model Brush (`door-style`)
    if (tool === 'door-style') {
      if (!isSpacedDoublePlacement(e, 'door-style')) return;
      if (!hit || hit.box.type === 'fridge') {
        const idx = Math.max(0, DOOR_STYLE_ORDER.indexOf(doorStyleBrush));
        const next = DOOR_STYLE_ORDER[(idx + 1) % DOOR_STYLE_ORDER.length];
        onDoorStyleBrushChange(next);
        onToast(`مدل قلم درب: ${DOOR_STYLE_META[next].label}`);
        return;
      }

      if (selectionMode !== 'single') {
        const doorEl = target.closest('[data-door-id]');
        const doorId = doorEl?.getAttribute('data-door-id');
        if (doorId) {
          const nextSel = applySelectionDelta(multiSelection, 'door', doorId);
          onSetMultiSelection(nextSel);
          onSelectBoxAndDoor(hit.box.id, selectionMode === 'subtract' ? null : doorId);
          return;
        }
      }

      if (multiSelection && multiSelection.doorIds.length > 0) {
        onApplyDoorStyle?.(null, multiSelection.doorIds, doorStyleBrush);
        return;
      }

      const doorEl = target.closest('[data-door-id]');
      const doorId = doorEl?.getAttribute('data-door-id');
      if (doorId) {
        onApplyDoorStyle?.(hit.box.id, [doorId], doorStyleBrush);
      } else {
        onApplyDoorStyle?.(hit.box.id, null, doorStyleBrush);
      }
      return;
    }

    // 5a-2. Finish / Color Brush (`finish`)
    if (tool === 'finish') {
      if (!isSpacedDoublePlacement(e, 'finish')) return;
      if (isPointOverCountertop(pt) || target.closest('[data-countertop-zone]')) {
        onApplyFinish('countertop', wall.id);
        return;
      }
      if (hit) {
        onApplyFinish('box', wall.id, hit.box.id);
        onSelectBoxAndDoor(hit.box.id, null);
        return;
      }
      if (isPointOverBacksplash(pt) || target.closest('[data-backsplash-zone]')) {
        onApplyFinish('backsplash', wall.id);
        return;
      }
      const idx = Math.max(0, CABINET_FINISH_ORDER.indexOf(cabinetFinishBrush));
      const next = CABINET_FINISH_ORDER[(idx + 1) % CABINET_FINISH_ORDER.length];
      onCabinetFinishBrushChange(next);
      onToast(`رنگ قلم: ${CABINET_FINISHES[next].label}`);
      return;
    }

    // 5b. Frame Tool (`frame`) — spaced double-click edge or seam & drag
    if (tool === 'frame') {
      if (!isSpacedDoublePlacement(e, 'frame')) return;
      const fTarget = resolveFrameTargetAtPoint(pt);
      if (!fTarget) {
        onToast('برای فریم‌کشی روی لبه آزاد یا درز بین درب‌ها کلیک کنید');
        return;
      }
      if (fTarget.side === 'invalid') {
        onToast(fTarget.reason || 'فریم فقط روی لبه آزاد باکس یا درز بین درب‌ها نصب می‌شود');
        return;
      }
      const chosenSide = fTarget.side;
      const chosenSeam = fTarget.seamCm;
      const exposure = getBoxSideExposure(fTarget.box, wall, allWalls, cornerOwners, blockedZones);
      let resMsg = '';
      let createdId: string | null = null;
      onMutateWall((w) => {
        const b = w.boxes.find((x) => x.id === fTarget.box.id);
        if (!b) return;
        const r = placeFrameOnBox(b, chosenSide, frameWidthCm, chosenSeam, exposure);
        resMsg = r.message;
        if (r.ok && r.frame) createdId = r.frame.id;
      }, true);
      if (resMsg) onToast(resMsg);
      if (createdId) onSelectFrame?.(fTarget.box.id, createdId);
      e.currentTarget.setPointerCapture(e.pointerId);
      dragOp.current = {
        mode: 'frame-draw',
        boxId: fTarget.box.id,
        bx: fTarget.bx,
        by: fTarget.by,
        bw: fTarget.bw,
        bodyH: fTarget.bodyH,
      };
      return;
    }

    // 5c. Direct Unit Bay click when doorsHidden is active in doors tool
    if (doorsHidden && hit && tool === 'doors') {
      const unitBayEl = target.closest('[data-unit-bay]');
      if (unitBayEl) {
        const uStart = Number(unitBayEl.getAttribute('data-unit-start'));
        const uEnd = Number(unitBayEl.getAttribute('data-unit-end'));
        if (!Number.isNaN(uStart) && !Number.isNaN(uEnd)) {
          onSetMultiSelection(undefined);
          onSelectUnit?.({ boxId: hit.box.id, startCm: uStart, endCm: uEnd });
          return;
        }
      }
    }

    // 6. Select Mode (click frame/shelf/handle/unit-divider/box to select & drag hierarchically, empty background for Marquee)
    if (tool === 'select') {
      const frameSel = target.closest('[data-frame-id]');
      if (frameSel) {
        const fId = frameSel.getAttribute('data-frame-id');
        const bId = frameSel.getAttribute('data-box-id') || hit?.box.id;
        if (bId && fId) {
          onSetMultiSelection(undefined);
          onSelectFrame?.(bId, fId);
          return;
        }
      }
      const shelfSel = target.closest('[data-shelf-id]');
      if (shelfSel) {
        const sId = shelfSel.getAttribute('data-shelf-id');
        const bId = shelfSel.getAttribute('data-box-id') || hit?.box.id;
        const boxObj = wall.boxes.find((b) => b.id === bId);
        if (bId && sId && boxObj) {
          onSetMultiSelection(undefined);
          onSelectShelf?.(bId, sId);
          const insets = getEffectiveBoxInsets(boxObj);
          const bh = boxObj.height * s;
          const by = floorY - boxObj.elevY * s - bh;
          const bodyH = Math.max(14, bh - boxObj.plinth * s);
          const topPad = boxObj.countertopCm * s;
          const innerTopPx = by + topPad + insets.top * s;
          const innerHeightPx = Math.max(8, bodyH - topPad - (insets.top + insets.bottom) * s);
          e.currentTarget.setPointerCapture(e.pointerId);
          dragOp.current = {
            mode: 'move-shelf',
            boxId: bId,
            shelfId: sId,
            innerTopPx,
            innerHeightPx,
          };
          return;
        }
      }
      const unitDivSel = target.closest('[data-unit-div]');
      if (unitDivSel) {
        const uCm = Number(unitDivSel.getAttribute('data-unit-div'));
        const bId = unitDivSel.getAttribute('data-box-id') || hit?.box.id;
        const boxObj = wall.boxes.find((b) => b.id === bId);
        if (bId && boxObj && !Number.isNaN(uCm)) {
          onSetMultiSelection(undefined);
          onSelectUnitDivider?.({ boxId: bId, seamCm: uCm });
          const insets = getEffectiveBoxInsets(boxObj);
          const scaleX = Math.max(
            0.2,
            (boxObj.width - insets.left - insets.right) / Math.max(1, boxObj.width)
          );
          e.currentTarget.setPointerCapture(e.pointerId);
          dragOp.current = {
            mode: 'resize-unit-div',
            boxId: bId,
            origSeamCm: uCm,
            currentSeamCm: uCm,
            startX: pt.x,
            bx: originX + boxObj.offsetX * s,
            insetsLeft: insets.left,
            scaleX,
          };
          return;
        }
      }
      const handleSel = target.closest('[data-handle-id]');
      if (handleSel) {
        const hId = handleSel.getAttribute('data-handle-id');
        const bId = handleSel.getAttribute('data-box-id') || hit?.box.id;
        if (bId && hId) {
          onSetMultiSelection(undefined);
          onSelectHandle?.(bId, hId);
          return;
        }
      }

      if (hit) {
        if (doorsHidden) {
          const unitBayEl = target.closest('[data-unit-bay]');
          if (unitBayEl) {
            const uStart = Number(unitBayEl.getAttribute('data-unit-start'));
            const uEnd = Number(unitBayEl.getAttribute('data-unit-end'));
            if (!Number.isNaN(uStart) && !Number.isNaN(uEnd)) {
              onSetMultiSelection(undefined);
              onSelectUnit?.({ boxId: hit.box.id, startCm: uStart, endCm: uEnd });
              e.currentTarget.setPointerCapture(e.pointerId);
              dragOp.current = {
                mode: 'move-box',
                boxId: hit.box.id,
                startPt: pt,
                origX: hit.box.offsetX,
                lastTargetX: hit.box.offsetX,
                sessionId: `fbox_${Date.now()}_${Math.random()}`,
              };
              return;
            }
          }
        }

        const doorEl = target.closest('[data-door-id]');
        const doorId = doorEl?.getAttribute('data-door-id') || null;
        if (selectionMode !== 'single') {
          const nextSel = doorId
            ? applySelectionDelta(multiSelection, 'door', doorId)
            : applySelectionDelta(multiSelection, 'box', hit.box.id);
          onSetMultiSelection(nextSel);
          onSelectBoxAndDoor(hit.box.id, selectionMode === 'subtract' ? null : doorId);
          return;
        }

        onSetMultiSelection(undefined);
        onSelectBoxAndDoor(hit.box.id, doorId);
        e.currentTarget.setPointerCapture(e.pointerId);
        dragOp.current = {
          mode: 'move-box',
          boxId: hit.box.id,
          startPt: pt,
          origX: hit.box.offsetX,
          lastTargetX: hit.box.offsetX,
          sessionId: `fbox_${Date.now()}_${Math.random()}`,
        };
        return;
      }
      onSelectBoxAndDoor(null, null);
      onSelectOpening(null);
      onSelectAppliance?.(null);
      onSetMultiSelection(undefined);
      e.currentTarget.setPointerCapture(e.pointerId);
      setMarquee({ startX: pt.x, startY: pt.y, currX: pt.x, currY: pt.y });
      dragOp.current = {
        mode: 'marquee',
        startPt: pt,
        currPt: pt,
      };
      return;
    }

    // 7. Door Brush Mode (`doors`) — spaced double-click/tap required
    if (tool === 'doors') {
      if (doorsLocked) {
        onToast('درب‌ها قفل هستند؛ برای تغییر درب قفل را باز کنید');
        return;
      }
      if (!isSpacedDoublePlacement(e, 'doors')) return;
      if (!hit) {
        const next = doorOrient === 'vertical' ? 'horizontal' : 'vertical';
        onDoorOrientChange(next);
        onToast(`جهت براش درب: ${next === 'vertical' ? 'عمودی (درب)' : 'افقی (کشو / جک‌دار)'}`);
        return;
      }
      const cursorCm = (pt.x - hit.bx) / s;
      const prev = computeDoorBrushPreview(
        hit.box,
        cursorCm,
        doorOrient,
        doorVertCount,
        drawerPatIdx,
        liftPatIdx,
        blockedZones,
        doorTargetWidth
      );
      if (!prev.ok) {
        onToast(prev.reason || 'امکان درب‌گذاری در این بخش نیست');
        return;
      }
      let newSelDoorId: string | null = null;
      onMutateWall((w) => {
        const b = w.boxes.find((x) => x.id === hit.box.id);
        if (!b) return;
        const res = applyDoorBrushPreview(b, cursorCm, prev, blockedZones);
        newSelDoorId = res.selectedDoorId;
      }, true);
      onSelectBoxAndDoor(hit.box.id, newSelDoorId);
      return;
    }

    // 7b. Smart Door Drawer-Band Pencil (`door-pencil`) — horizontal drag across doors OR spaced double-click
    if (tool === 'door-pencil') {
      if (doorsLocked) {
        onToast('درب‌ها قفل هستند؛ ابتدا قفل را باز کنید');
        return;
      }
      if (!hit || hit.box.type === 'fridge') {
        if (!isSpacedDoublePlacement(e, 'door-pencil')) return;
        const nxt = doorBandPos === 'top' ? 'bottom' : 'top';
        onDoorBandPosChange?.(nxt);
        onToast(`موقعیت کشو: ${nxt === 'top' ? 'بالای درب' : 'پایین درب'}`);
        return;
      }
      const isDoubleTapSpot = isSpacedDoublePlacement(e, 'door-pencil');
      const insets = getEffectiveBoxInsets(hit.box);
      const scaleX = Math.max(
        0.2,
        (hit.box.width - insets.left - insets.right) / Math.max(1, hit.box.width)
      );
      const clickCm = Math.max(
        0,
        Math.min(hit.box.width, ((pt.x - hit.bx) / s - insets.left) / scaleX)
      );
      const bodyTop = hit.by + hit.box.countertopCm * s + insets.top * s;
      const bodyHInner = Math.max(
        10,
        hit.bodyH - hit.box.countertopCm * s - (insets.top + insets.bottom) * s
      );
      const clickPos: 'top' | 'bottom' =
        pt.y <= bodyTop + bodyHInner * 0.5 ? 'top' : 'bottom';
      onDoorBandPosChange?.(clickPos);
      const ids = getDoorsInHorizontalRange(hit.box, clickCm, clickCm).map((d) => d.id);
      setDoorPencilHover({ boxId: hit.box.id, doorIds: ids, pos: clickPos });
      e.currentTarget.setPointerCapture(e.pointerId);
      dragOp.current = {
        mode: 'door-pencil-drag',
        boxId: hit.box.id,
        startCm: clickCm,
        currCm: clickCm,
        pos: clickPos,
        ratio: doorBandRatio,
        allowSingleTapCommit: isDoubleTapSpot,
      } as DragOp;
      return;
    }

    // 8. Pencil / Skeleton Mode (spaced double-click/tap required)
    if (tool === 'pencil' || tool === 'skeleton') {
      if (!hit) return;
      if (!isSpacedDoublePlacement(e, tool)) return;
      onSelectBoxAndDoor(hit.box.id, null);
      const insets = getEffectiveBoxInsets(hit.box);
      const scaleX = Math.max(
        0.2,
        (hit.box.width - insets.left - insets.right) / Math.max(1, hit.box.width)
      );
      const clickCm = ((pt.x - hit.bx) / s - insets.left) / scaleX;

      let nearSeamCm: number | null = null;
      for (const d of hit.box.doors) {
        if (d.startCm > 2 && Math.abs(clickCm - d.startCm) < 8) nearSeamCm = d.startCm;
        const endCm = d.startCm + d.widthCm;
        if (endCm < hit.box.width - 2 && Math.abs(clickCm - endCm) < 8) nearSeamCm = endCm;
      }
      for (const u of hit.box.unitDividers) {
        if (Math.abs(clickCm - u) < 8) nearSeamCm = u;
      }

      if (nearSeamCm !== null) {
        const seam = +nearSeamCm.toFixed(1);
        const alreadyHasDivider = hit.box.unitDividers.some((u) => Math.abs(u - seam) < 1.5);
        if (alreadyHasDivider) {
          onMutateWall((w) => {
            const b = w.boxes.find((x) => x.id === hit.box.id);
            if (b) removeUnitDividerWithSync(b, seam, blockedZones);
          }, true, 'دیواره یونیت برداشته شد');
          return;
        }
        onMutateWall((w) => {
          const b = w.boxes.find((x) => x.id === hit.box.id);
          if (!b) return;
          b.unitDividers.push(seam);
          b.unitDividers.sort((a, c) => a - c);
        }, true, 'دیواره یونیت مستقل (32mm) ثبت شد');
      } else {
        const units = getUnitsInBox(hit.box, blockedZones);
        const targetUnit = units.find(
          (u) => clickCm >= u.startCm - 0.5 && clickCm <= u.endCm + 0.5
        );
        if (!targetUnit) {
          onToast('این بخش در محدوده کنج قرار دارد');
          return;
        }
        if (!targetUnit.canHaveShelves) {
          onToast(targetUnit.blockedReason || 'امکان طبقه‌گذاری در این بخش وجود ندارد');
          return;
        }
        const startCm = targetUnit.startCm;
        const endCm = targetUnit.endCm;

        const clickRatio = Math.max(
          0.08,
          Math.min(0.92, +((pt.y - hit.by) / hit.bodyH).toFixed(2))
        );
        const probeBox = {
          ...hit.box,
          shelves: hit.box.shelves.map((sItem) => ({ ...sItem })),
        };
        const check = addShelvesWithMinGap(probeBox, startCm, endCm, shelfCount, clickRatio);
        if (!check.ok) {
          onToast(check.message);
          return;
        }
        onMutateWall((w) => {
          const b = w.boxes.find((x) => x.id === hit.box.id);
          if (b) addShelvesWithMinGap(b, startCm, endCm, shelfCount, clickRatio);
        }, true, check.message);
      }
      return;
    }

    // 9. Sink / Gas / Appliance Tool (spaced double-click/tap required)
    if (tool === 'sink' || tool === 'gas' || tool === 'appliance') {
      if (!isSpacedDoublePlacement(e, tool)) return;
      const clickXCm = (pt.x - originX) / s;
      let targetBase: CabinetBox | undefined = hit && hit.box.type === 'base' ? hit.box : undefined;

      if (!targetBase) {
        const clickedAppEl = target.closest('[data-app-id]');
        const clickedAppId = clickedAppEl?.getAttribute('data-app-id');
        const clickedApp = clickedAppId
          ? wall.appliances.find((a) => a.id === clickedAppId)
          : undefined;
        if (clickedApp) {
          targetBase = wall.boxes.find(
            (b) =>
              b.type === 'base' &&
              clickedApp.offsetX >= b.offsetX - 5 &&
              clickedApp.offsetX + clickedApp.width <= b.offsetX + b.width + 5
          );
        }
      }

      if (!targetBase) {
        targetBase = wall.boxes.find((b) => {
          if (b.type !== 'base') return false;
          const bx = originX + b.offsetX * s;
          const bw = b.width * s;
          const bh = b.height * s;
          const by = floorY - b.elevY * s - bh;
          return pt.x >= bx && pt.x <= bx + bw && pt.y >= by - 36 * s && pt.y <= by + bh;
        });
      }

      if (targetBase) {
        const targetKind: ApplianceKind =
          tool === 'sink' ? 'sink' : tool === 'gas' ? 'gas' : applianceKind;
        const targetW =
          targetKind === 'sink'
            ? SINK_MODELS[sinkModel].width
            : targetKind === 'gas'
            ? gasWidth
            : APPLIANCE_CONFIGS[targetKind].width;
        const desiredOffset = clickXCm - targetW / 2;
        onPlaceAppliance(targetBase.id, desiredOffset, targetKind);
        setAppHover(null);
      } else {
        onToast('لطفاً روی یک باکس زمینی کلیک کنید');
      }
      return;
    }

    // 10. Fridge Placement directly in Front view (spaced double-click/tap required)
    if (tool === 'fridge') {
      if (!isSpacedDoublePlacement(e, 'fridge')) return;
      const cfg = FRIDGE_MODELS[fridgeModel];
      const desiredOffset = (pt.x - originX) / s - cfg.width / 2;
      onPlaceFridge(desiredOffset);
      return;
    }

    // 11. Opening Placement directly in Front view (spaced double-click/tap required)
    if (tool === 'opening') {
      if (!isSpacedDoublePlacement(e, 'opening')) return;
      const def = OPENING_DEFAULTS[openingKind];
      const desiredOffset = (pt.x - originX) / s - def.width / 2;
      const desiredElev =
        openingKind === 'window'
          ? Math.max(20, Math.round((floorY - pt.y) / s - def.height / 2))
          : 0;
      onPlaceOpening(desiredOffset, desiredElev);
      return;
    }

    // Fallback pan
    e.currentTarget.setPointerCapture(e.pointerId);
    dragOp.current = {
      mode: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      origX: pan.x,
      origY: pan.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    setHoverClientPt({ x: e.clientX, y: e.clientY });
    if (!wall) return;
    const pt = clientToSvg(e.clientX, e.clientY);
    setCursorPt(pt);

    if (!dragOp.current) {
      if (tool === 'finish') {
        const overCt = isPointOverCountertop(pt);
        const boxHit = overCt ? null : hitTestBox(pt);
        const overBs = !overCt && !boxHit && isPointOverBacksplash(pt);
        setHoverFinishTarget(overCt ? 'countertop' : boxHit ? 'cabinet' : overBs ? 'backsplash' : null);
        setFrontHoverStatus(overCt || boxHit || overBs ? 'valid' : 'neutral');
      } else if (tool === 'doors') {
        const hit = hitTestBox(pt);
        const isWallTarget = hit && (hit.box.type === 'wall' || hit.box.type === 'wall-deep');
        setHoverFinishTarget(isWallTarget ? 'wall' : null);
        if (!doorsLocked && hit && hit.box.type !== 'fridge') {
          const cursorCm = (pt.x - hit.bx) / s;
          setDoorHover({
            boxId: hit.box.id,
            cursorCmInBox: cursorCm,
          });
          const check = computeDoorBrushPreview(
            hit.box,
            cursorCm,
            doorOrient,
            doorVertCount,
            drawerPatIdx,
            liftPatIdx,
            blockedZones,
            doorTargetWidth
          );
          setFrontHoverStatus(check.ok ? 'valid' : 'invalid');
        } else {
          setDoorHover(null);
          setFrontHoverStatus(hit ? 'invalid' : 'neutral');
        }
        if (pencilHover) setPencilHover(null);
        if (appHover) setAppHover(null);
        if (frameHover) setFrameHover(null);
      } else if (tool === 'pencil' || tool === 'skeleton') {
        if (hoverFinishTarget !== null) setHoverFinishTarget(null);
        const hit = hitTestBox(pt);
        if (hit && hit.box.type !== 'fridge') {
          const insets = getEffectiveBoxInsets(hit.box);
          const scaleX = Math.max(
            0.2,
            (hit.box.width - insets.left - insets.right) / Math.max(1, hit.box.width)
          );
          const clickCm = ((pt.x - hit.bx) / s - insets.left) / scaleX;
          let nearSeamCm: number | null = null;
          for (const d of hit.box.doors) {
            if (d.startCm > 2 && Math.abs(clickCm - d.startCm) < 8) nearSeamCm = d.startCm;
            const endCm = d.startCm + d.widthCm;
            if (endCm < hit.box.width - 2 && Math.abs(clickCm - endCm) < 8) nearSeamCm = endCm;
          }
          for (const u of hit.box.unitDividers) {
            if (Math.abs(clickCm - u) < 8) nearSeamCm = u;
          }
          if (nearSeamCm !== null) {
            const seamVal = +nearSeamCm.toFixed(1);
            const hasExistingDivider = hit.box.unitDividers.some(
              (u) => Math.abs(u - seamVal) < 1.5
            );
            setPencilHover({
              boxId: hit.box.id,
              kind: 'seam',
              seamCm: seamVal,
              hasExistingDivider,
            });
            setFrontHoverStatus('valid');
          } else {
            const units = getUnitsInBox(hit.box, blockedZones);
            const targetUnit = units.find(
              (u) => clickCm >= u.startCm - 0.5 && clickCm <= u.endCm + 0.5
            );
            if (!targetUnit || !targetUnit.canHaveShelves) {
              setPencilHover({
                boxId: hit.box.id,
                kind: 'blocked',
                cursorCm: clickCm,
                blockedReason: targetUnit?.blockedReason || 'محدوده کنج',
              });
              setFrontHoverStatus('invalid');
            } else {
              const rawRatio = Math.max(
                0.08,
                Math.min(0.92, +((pt.y - hit.by) / hit.bodyH).toFixed(2))
              );
              if (shelfCount === 1) {
                const check = clampShelfRatioWithMinGap(
                  hit.box,
                  rawRatio,
                  targetUnit.startCm,
                  targetUnit.endCm
                );
                if (!check.ok) {
                  setPencilHover({
                    boxId: hit.box.id,
                    kind: 'blocked',
                    cursorCm: clickCm,
                    blockedReason: check.reason,
                  });
                  setFrontHoverStatus('invalid');
                } else {
                  setPencilHover({
                    boxId: hit.box.id,
                    kind: 'shelf',
                    startCm: targetUnit.startCm,
                    endCm: targetUnit.endCm,
                    yRatio: check.ratio,
                  });
                  setFrontHoverStatus('valid');
                }
              } else {
                const probeBox = {
                  ...hit.box,
                  shelves: hit.box.shelves.map((sItem) => ({ ...sItem })),
                };
                const multiCheck = addShelvesWithMinGap(
                  probeBox,
                  targetUnit.startCm,
                  targetUnit.endCm,
                  shelfCount,
                  rawRatio
                );
                if (!multiCheck.ok) {
                  setPencilHover({
                    boxId: hit.box.id,
                    kind: 'blocked',
                    cursorCm: clickCm,
                    blockedReason: multiCheck.message,
                  });
                  setFrontHoverStatus('invalid');
                } else {
                  setPencilHover({
                    boxId: hit.box.id,
                    kind: 'shelf',
                    startCm: targetUnit.startCm,
                    endCm: targetUnit.endCm,
                    yRatio: rawRatio,
                  });
                  setFrontHoverStatus('valid');
                }
              }
            }
          }
        } else {
          setPencilHover(null);
          setFrontHoverStatus('neutral');
        }
        if (doorHover) setDoorHover(null);
        if (appHover) setAppHover(null);
        if (frameHover) setFrameHover(null);
      } else if (tool === 'sink' || tool === 'gas' || tool === 'appliance') {
        if (hoverFinishTarget !== null) setHoverFinishTarget(null);
        const nextApp = resolveApplianceHover(pt);
        setAppHover(nextApp);
        setFrontHoverStatus(nextApp ? (nextApp.valid ? 'valid' : 'invalid') : 'neutral');
        if (doorHover) setDoorHover(null);
        if (pencilHover) setPencilHover(null);
        if (frameHover) setFrameHover(null);
      } else if (tool === 'frame') {
        if (hoverFinishTarget !== null) setHoverFinishTarget(null);
        const fT = resolveFrameTargetAtPoint(pt);
        setFrameHover(
          fT
            ? {
                boxId: fT.box.id,
                side: fT.side,
                seamCm: fT.seamCm,
                reason: fT.reason,
              }
            : null
        );
        setFrontHoverStatus(fT ? (fT.side !== 'invalid' ? 'valid' : 'invalid') : 'neutral');
        if (doorHover) setDoorHover(null);
        if (pencilHover) setPencilHover(null);
        if (appHover) setAppHover(null);
      } else if (tool === 'door-pencil' && !doorsLocked) {
        if (hoverFinishTarget !== null) setHoverFinishTarget(null);
        const hit = hitTestBox(pt);
        if (hit && hit.box.type !== 'fridge') {
          const insets = getEffectiveBoxInsets(hit.box);
          const scaleX = Math.max(
            0.2,
            (hit.box.width - insets.left - insets.right) / Math.max(1, hit.box.width)
          );
          const cm = Math.max(0, Math.min(hit.box.width, ((pt.x - hit.bx) / s - insets.left) / scaleX));
          const bodyTop = hit.by + hit.box.countertopCm * s + insets.top * s;
          const bodyHInner = Math.max(
            10,
            hit.bodyH - hit.box.countertopCm * s - (insets.top + insets.bottom) * s
          );
          const pos: 'top' | 'bottom' = pt.y <= bodyTop + bodyHInner * 0.5 ? 'top' : 'bottom';
          const ids = getDoorsInHorizontalRange(hit.box, cm, cm).map((d) => d.id);
          setDoorPencilHover(ids.length > 0 ? { boxId: hit.box.id, doorIds: ids, pos } : null);
          setFrontHoverStatus(ids.length > 0 ? 'valid' : 'neutral');
        } else {
          setDoorPencilHover(null);
          setFrontHoverStatus('neutral');
        }
        if (doorHover) setDoorHover(null);
        if (pencilHover) setPencilHover(null);
        if (appHover) setAppHover(null);
        if (frameHover) setFrameHover(null);
      } else {
        if (hoverFinishTarget !== null) setHoverFinishTarget(null);
        if (doorHover) setDoorHover(null);
        if (pencilHover) setPencilHover(null);
        if (appHover) setAppHover(null);
        if (frameHover) setFrameHover(null);
        if (doorPencilHover) setDoorPencilHover(null);

        if (tool === 'handle') {
          const domTarget = e.target as Element | null;
          const overSpot = Boolean(domTarget?.closest('[data-hand-spot]') || domTarget?.closest('[data-handle-id]'));
          const hit = hitTestBox(pt);
          setFrontHoverStatus(overSpot || (hit && hit.box.doors.length > 0) ? 'valid' : 'neutral');
        } else if (tool === 'door-style') {
          const domTarget = e.target as Element | null;
          const overDoor = Boolean(domTarget?.closest('[data-door-id]'));
          setFrontHoverStatus(overDoor ? 'valid' : 'neutral');
        } else if (tool === 'fridge' || tool === 'opening') {
          const overWallRect =
            pt.x >= originX - 8 &&
            pt.x <= originX + wall.length * s + 8 &&
            pt.y >= floorY - wall.height * s - 12 &&
            pt.y <= floorY + 12;
          setFrontHoverStatus(overWallRect ? 'valid' : 'neutral');
        } else {
          setFrontHoverStatus('neutral');
        }
      }
      return;
    }

    const op = dragOp.current;
    if (op.mode === 'pan') {
      onPanChange({
        x: op.origX + (e.clientX - op.startX),
        y: op.origY + (e.clientY - op.startY),
      });
    } else if (op.mode === 'marquee') {
      op.currPt = pt;
      setMarquee({ startX: op.startPt.x, startY: op.startPt.y, currX: pt.x, currY: pt.y });
    } else if (op.mode === 'resize-box') {
      const dxCm = Math.round((pt.x - op.startPt.x) / s);
      const dyCm = Math.round((pt.y - op.startPt.y) / s);
      const liveBox = wall.boxes.find((x) => x.id === op.boxId);
      const isWallCab = liveBox && (liveBox.type === 'wall' || liveBox.type === 'wall-deep');
      if (isWallCab && (op.side === 'top' || op.side === 'bottom') && onResizeWallBoxesSynced) {
        let nextElev = op.origElev;
        let nextH = op.origH;
        if (op.side === 'top') {
          nextH = Math.max(25, Math.min(wall.height - op.origElev, op.origH - dyCm));
        } else {
          const deltaElev = -dyCm;
          nextElev = Math.max(95, Math.min(op.origElev + op.origH - 25, op.origElev + deltaElev));
          nextH = op.origH + (op.origElev - nextElev);
        }
        op.lastElev = nextElev;
        op.lastH = nextH;
        onResizeWallBoxesSynced(op.boxId, nextElev, nextH, false);
        return;
      }

      onMutateWall((w) => {
        const b = w.boxes.find((x) => x.id === op.boxId);
        if (!b) return;
        if (op.side === 'right') {
          b.width = Math.max(40, Math.min(w.length - b.offsetX, op.origW + dxCm));
        } else if (op.side === 'left') {
          const newOff = Math.max(0, Math.min(op.origX + op.origW - 40, op.origX + dxCm));
          b.width = op.origW + (op.origX - newOff);
          b.offsetX = newOff;
        } else if (op.side === 'top') {
          b.height = Math.max(40, Math.min(w.height - b.elevY, op.origH - dyCm));
        } else if (op.side === 'bottom') {
          const newElev = Math.max(0, Math.min(op.origElev + op.origH - 25, op.origElev - dyCm));
          b.height = op.origH + (op.origElev - newElev);
          b.elevY = newElev;
        }
        clampBoxInternalsAfterResize(b);
      }, false);
    } else if (op.mode === 'resize-unit-div') {
      const targetCm = ((pt.x - op.bx) / s - op.insetsLeft) / op.scaleX;
      let nextSeam = op.currentSeamCm;
      onMutateWall((w) => {
        const b = w.boxes.find((x) => x.id === op.boxId);
        if (!b) return;
        const r = resizeUnitDividerWithDoorsSync(b, op.currentSeamCm, targetCm, blockedZones);
        if (r && r.ok) {
          nextSeam = r.seamCm;
        }
      }, false);
      if (nextSeam !== op.currentSeamCm) {
        op.currentSeamCm = nextSeam;
        onSelectUnitDivider?.({ boxId: op.boxId, seamCm: nextSeam });
      }
    } else if (op.mode === 'move-box') {
      const dxCm = Math.round(((pt.x - op.startPt.x) / s) / 5) * 5;
      const targetX = op.origX + dxCm;
      op.lastTargetX = targetX;
      onMoveBox(op.boxId, targetX, false, op.sessionId);
      const liveBox = wall.boxes.find((x) => x.id === op.boxId);
      if (liveBox) {
        const range = getFreeMoveRangeForBox(wall, allWalls, liveBox, cornerOwners);
        setDragGuides({
          leftGap: Math.max(0, Math.round(liveBox.offsetX - range.minX)),
          rightGap: Math.max(0, Math.round(range.maxX - liveBox.offsetX)),
          itemStart: liveBox.offsetX,
          itemEnd: liveBox.offsetX + liveBox.width,
          yTopCm: liveBox.elevY + liveBox.height,
        });
      }
    } else if (op.mode === 'resize-door-seam') {
      const deltaCm = Math.round((pt.x - op.lastX) / s);
      if (Math.abs(deltaCm) >= 1) {
        let applied = 0;
        onMutateWall((w) => {
          const b = w.boxes.find((x) => x.id === op.boxId);
          if (!b) return;
          applied = resizeDoorSeamCoupled(b, op.leftDoorId, deltaCm);
        }, false);
        if (applied !== 0) {
          op.lastX += applied * s;
        }
      }
    } else if (op.mode === 'resize-door') {
      const dxCm = Math.round((pt.x - op.startPt.x) / s);
      onMutateWall((w) => {
        const b = w.boxes.find((x) => x.id === op.boxId);
        if (!b) return;
        resizeDoorSafely(b, op.doorId, op.origW + dxCm, blockedZones);
      }, false);
    } else if (op.mode === 'move-app') {
      const dxCm = Math.round(((pt.x - op.startPt.x) / s) / 5) * 5;
      const targetX = op.origX + dxCm;
      op.lastTargetX = targetX;
      onMoveAppliance(op.appId, targetX, false, op.sessionId);
      const liveApp = wall.appliances.find((x) => x.id === op.appId);
      if (liveApp) {
        const range = getFreeMoveRangeForAppliance(wall, allWalls, liveApp, cornerOwners);
        setDragGuides({
          leftGap: Math.max(0, Math.round(liveApp.offsetX - range.minX)),
          rightGap: Math.max(0, Math.round(range.maxX - liveApp.offsetX)),
          itemStart: liveApp.offsetX,
          itemEnd: liveApp.offsetX + liveApp.width,
          yTopCm: 92,
        });
      }
    } else if (op.mode === 'stretch-handle') {
      onMutateWall((w) => {
        const b = w.boxes.find((x) => x.id === op.boxId);
        const h =
          b?.handles.find((x) => x.id === op.handleId) ||
          b?.handles.find((x) => x.doorId === op.handleId);
        if (!b || !h) return;
        const deltaCm =
          op.orient === 'vertical'
            ? ((pt.y - op.startPt.y) / s) * 2
            : ((pt.x - op.startPt.x) / s) * 2;
        const maxLen = op.orient === 'vertical' ? Math.max(16, b.height - 20) : 54;
        h.lengthCm = Math.round(Math.max(8, Math.min(maxLen, op.origLen + deltaCm)));
      }, false);
    } else if (op.mode === 'move-shelf') {
      const desiredRatio = Math.max(
        0.08,
        Math.min(0.92, +((pt.y - op.innerTopPx) / op.innerHeightPx).toFixed(2))
      );
      onMutateWall((w) => {
        const b = w.boxes.find((x) => x.id === op.boxId);
        const sh = b?.shelves.find((x) => x.id === op.shelfId);
        if (b && sh) {
          sh.yRatio = clampShelfRatioWithMinGap(b, desiredRatio, sh.startCm, sh.endCm, sh.id).ratio;
        }
      }, false);
    } else if (op.mode === 'move-opening') {
      const dxCm = Math.round(((pt.x - op.startPt.x) / s) / 5) * 5;
      const dyCm = Math.round(((op.startPt.y - pt.y) / s) / 5) * 5;
      onMutateWall((w) => {
        const opening = w.openings?.find((o) => o.id === op.openingId);
        if (!opening) return;
        updateOpeningGeometry(opening, w, {
          offsetX: op.origX + dxCm,
          elevY: opening.kind === 'window' ? op.origElev + dyCm : 0,
        });
      }, false);
    } else if (op.mode === 'resize-opening') {
      const dxCm = Math.round((pt.x - op.startPt.x) / s);
      const dyCm = Math.round((op.startPt.y - pt.y) / s);
      onMutateWall((w) => {
        const opening = w.openings?.find((o) => o.id === op.openingId);
        if (!opening) return;
        if (op.side === 'right') {
          updateOpeningGeometry(opening, w, { width: op.origW + dxCm });
        } else if (op.side === 'left') {
          const newX = Math.max(0, Math.min(op.origX + op.origW - 20, op.origX + dxCm));
          updateOpeningGeometry(opening, w, {
            offsetX: newX,
            width: op.origW + (op.origX - newX),
          });
        } else if (op.side === 'top') {
          updateOpeningGeometry(opening, w, { height: op.origH + dyCm });
        } else if (op.side === 'bottom' && opening.kind === 'window') {
          const newElev = Math.max(0, Math.min(op.origElev + op.origH - 40, op.origElev + dyCm));
          updateOpeningGeometry(opening, w, {
            elevY: newElev,
            height: op.origH + (op.origElev - newElev),
          });
        }
      }, false);
    } else if (op.mode === 'frame-draw') {
      const fT = resolveFrameTargetAtPoint(pt);
      if (fT && fT.box.id === op.boxId && fT.side !== 'invalid') {
        const dragSide = fT.side;
        const dragSeam = fT.seamCm;
        const exposure = getBoxSideExposure(fT.box, wall, allWalls, cornerOwners, blockedZones);
        onMutateWall((w) => {
          const b = w.boxes.find((x) => x.id === op.boxId);
          if (b) placeFrameOnBox(b, dragSide, frameWidthCm, dragSeam, exposure);
        }, false);
      }
    } else if (op.mode === 'door-pencil-drag') {
      const b = wall.boxes.find((x) => x.id === op.boxId);
      if (b) {
        const bx = originX + b.offsetX * s;
        const insets = getEffectiveBoxInsets(b);
        const scaleX = Math.max(
          0.2,
          (b.width - insets.left - insets.right) / Math.max(1, b.width)
        );
        const currCm = Math.max(0, Math.min(b.width, ((pt.x - bx) / s - insets.left) / scaleX));
        op.currCm = currCm;
        const ids = getDoorsInHorizontalRange(b, op.startCm, currCm).map((d) => d.id);
        setDoorPencilHover({ boxId: b.id, doorIds: ids, pos: op.pos });
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    activePointersRef.current.delete(e.pointerId);
    if (!dragOp.current) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const op = dragOp.current;
    dragOp.current = null;

    if (op.mode === 'marquee') {
      setMarquee(null);
      if (!wall) return;
      const rx1 = Math.min(op.startPt.x, op.currPt.x);
      const rx2 = Math.max(op.startPt.x, op.currPt.x);
      const ry1 = Math.min(op.startPt.y, op.currPt.y);
      const ry2 = Math.max(op.startPt.y, op.currPt.y);
      if (Math.hypot(rx2 - rx1, ry2 - ry1) < 8) {
        onSetMultiSelection(undefined);
        return;
      }

      const intersects = (x1: number, y1: number, x2: number, y2: number) =>
        x1 <= rx2 && x2 >= rx1 && y1 <= ry2 && y2 >= ry1;

      const boxIds: string[] = [];
      const doorIds: string[] = [];
      const openingIds: string[] = [];
      const applianceIds: string[] = [];

      for (const b of wall.boxes) {
        const bx = originX + b.offsetX * s;
        const bw = b.width * s;
        const bh = b.height * s;
        const by = floorY - b.elevY * s - bh;
        const bodyH = Math.max(14, bh - b.plinth * s);
        const topPad = b.countertopCm * s;

        if (intersects(bx, by, bx + bw, by + bh)) {
          const overlapW = Math.min(rx2, bx + bw) - Math.max(rx1, bx);
          if (overlapW >= bw * 0.72 || b.doors.length === 0) {
            boxIds.push(b.id);
          }
        }
        for (const d of b.doors) {
          const dx = bx + d.startCm * s;
          const dw = d.widthCm * s;
          const dy = by + topPad;
          const dh = Math.max(8, bodyH - topPad);
          if (intersects(dx, dy, dx + dw, dy + dh)) {
            doorIds.push(d.id);
          }
        }
      }

      for (const opItem of wall.openings || []) {
        const ox = originX + opItem.offsetX * s;
        const ow = opItem.width * s;
        const oh = opItem.height * s;
        const oy = floorY - opItem.elevY * s - oh;
        if (intersects(ox, oy, ox + ow, oy + oh)) {
          openingIds.push(opItem.id);
        }
      }

      for (const app of wall.appliances) {
        const ax = originX + app.offsetX * s;
        const aw = app.width * s;
        const ay = floorY - 92 * s;
        const ah = 86 * s;
        if (intersects(ax, ay, ax + aw, ay + ah)) {
          applianceIds.push(app.id);
        }
      }

      const total = boxIds.length + doorIds.length + openingIds.length + applianceIds.length;
      if (total > 0) {
        onSetMultiSelection({ boxIds, doorIds, openingIds, applianceIds });
      } else {
        onSetMultiSelection(undefined);
      }
      return;
    }

    setDragGuides(null);
    if (op.mode === 'resize-box') {
      const liveBox = wall?.boxes.find((x) => x.id === op.boxId);
      const isWallCab = liveBox && (liveBox.type === 'wall' || liveBox.type === 'wall-deep');
      if (isWallCab && (op.side === 'top' || op.side === 'bottom') && onResizeWallBoxesSynced) {
        onResizeWallBoxesSynced(
          op.boxId,
          op.lastElev ?? liveBox.elevY,
          op.lastH ?? liveBox.height,
          true
        );
        return;
      }
    }
    if (op.mode === 'move-box') {
      if (op.lastTargetX !== op.origX) {
        onMoveBox(op.boxId, op.lastTargetX, true, op.sessionId);
      }
      return;
    }
    if (op.mode === 'move-app') {
      if (op.lastTargetX !== op.origX) {
        onMoveAppliance(op.appId, op.lastTargetX, true, op.sessionId);
      }
      return;
    }
    if (op.mode === 'door-pencil-drag') {
      setDoorPencilHover(null);
      if (!wall) return;
      const liveBox = wall.boxes.find((x) => x.id === op.boxId);
      if (!liveBox) return;
      const wasDragged = Math.abs(op.currCm - op.startCm) >= 3;
      const allowCommit = wasDragged || Boolean((op as { allowSingleTapCommit?: boolean }).allowSingleTapCommit);
      if (!allowCommit) return;
      const targetIds = getDoorsInHorizontalRange(liveBox, op.startCm, op.currCm).map((d) => d.id);
      if (targetIds.length === 0) {
        onToast('روی درب‌های عمودی دابل‌کلیک یا درگ افقی کنید');
        return;
      }
      const isSingleClick = !wasDragged && targetIds.length === 1;
      const singleDoor = isSingleClick
        ? liveBox.doors.find((d) => d.id === targetIds[0])
        : undefined;
      const shouldRemove = Boolean(singleDoor && singleDoor.drawerBand?.position === op.pos);
      const bandPayload = shouldRemove ? null : { position: op.pos, ratio: op.ratio };
      const msg = shouldRemove
        ? 'کشوی درب برداشته شد'
        : `کشوی ${op.pos === 'top' ? 'بالا' : 'پایین'} روی ${targetIds.length} درب ثبت شد`;
      onMutateWall(
        (w) => {
          const b = w.boxes.find((x) => x.id === op.boxId);
          if (b) applyDoorDrawerBand(b, targetIds, bandPayload);
        },
        true,
        msg
      );
      if (targetIds.length === 1) onSelectBoxAndDoor(liveBox.id, targetIds[0]);
      return;
    }
    if (op.mode !== 'pan') {
      onMutateWall(() => {}, true);
    }
  };

  const renderDoorUnit = (box: CabinetBox, door: DoorUnit, bx: number, by: number, bodyH: number) => {
    const topPad = box.countertopCm * s;
    const insets = getEffectiveBoxInsets(box);
    const scaleX = Math.max(0.2, (box.width - insets.left - insets.right) / Math.max(1, box.width));
    const apronExtraPx = getApronExtraTopCm(box, door) * s;
    const dx = bx + (insets.left + door.startCm * scaleX) * s + 1.5;
    const dw = Math.max(6, door.widthCm * scaleX * s - 3);
    const dy = by + topPad + insets.top * s + apronExtraPx + 1.5;
    const dh = Math.max(8, bodyH - topPad - (insets.top + insets.bottom) * s - apronExtraPx - 3);
    const isDoorSel =
      door.id === selectedDoorId || Boolean(multiSelection?.doorIds.includes(door.id));
    const opacity = doorsLocked ? 0.42 : 0.96;
    const hasTouchingRightNeighbor = box.doors.some(
      (other) =>
        other.id !== door.id &&
        other.kind !== 'fridge' &&
        Math.abs(other.startCm - (door.startCm + door.widthCm)) <= 1.5
    );

    const effectiveW = +(door.widthCm * scaleX).toFixed(1);
    const widthText = Number.isInteger(effectiveW) ? String(effectiveW) : effectiveW.toFixed(1);
    const dStyle: DoorStyle = door.doorStyle || 'flat';

    // Determine architectural hinge edge ONLY AFTER at least one handle is installed on this door!
    const firstHand = box.handles.find((h) => h.doorId === door.id);
    const inferredHinge: 'left' | 'right' | null =
      !firstHand || door.kind !== 'door' || dStyle === 'pantry'
        ? null
        : door.hingeSide ||
          (firstHand.xRatio <= 0.35
            ? 'right'
            : firstHand.xRatio >= 0.65
            ? 'left'
            : null);

    const renderDoorStyleOverlay = (rx: number, ry: number, rw: number, rh: number) => {
      if (dStyle === 'cnc' && rw > 16 && rh > 16) {
        const pad = Math.min(8, Math.max(4, rw * 0.14));
        return (
          <g pointerEvents="none">
            <rect
              x={rx + pad}
              y={ry + pad}
              width={Math.max(4, rw - pad * 2)}
              height={Math.max(4, rh - pad * 2)}
              rx={1.5}
              fill="rgba(255,255,255,0.45)"
              stroke="#64748b"
              strokeWidth={1.1}
            />
            {rw > 24 && rh > 24 && (
              <rect
                x={rx + pad + 2.5}
                y={ry + pad + 2.5}
                width={Math.max(2, rw - (pad + 2.5) * 2)}
                height={Math.max(2, rh - (pad + 2.5) * 2)}
                rx={1}
                fill="none"
                stroke="#94a3b8"
                strokeWidth={0.8}
              />
            )}
          </g>
        );
      }
      if ((dStyle === 'glass' || dStyle === 'glass-grid') && rw > 14 && rh > 14) {
        const pad = Math.min(7, Math.max(4, rw * 0.12));
        const gx = rx + pad;
        const gy = ry + pad;
        const gw = Math.max(4, rw - pad * 2);
        const gh = Math.max(4, rh - pad * 2);
        return (
          <g pointerEvents="none">
            <rect
              x={gx}
              y={gy}
              width={gw}
              height={gh}
              rx={1.5}
              fill="#e0f2fe"
              fillOpacity={0.78}
              stroke="#475569"
              strokeWidth={1.1}
            />
            <line
              x1={gx + gw * 0.18}
              y1={gy + gh * 0.32}
              x2={gx + gw * 0.48}
              y2={gy + gh * 0.12}
              stroke="#ffffff"
              strokeWidth={1.6}
              opacity={0.8}
            />
            {dStyle === 'glass-grid' && (
              <>
                <line x1={gx + gw * 0.5} y1={gy} x2={gx + gw * 0.5} y2={gy + gh} stroke="#64748b" strokeWidth={1.1} />
                <line x1={gx} y1={gy + gh * 0.33} x2={gx + gw} y2={gy + gh * 0.33} stroke="#64748b" strokeWidth={1.1} />
                <line x1={gx} y1={gy + gh * 0.67} x2={gx + gw} y2={gy + gh * 0.67} stroke="#64748b" strokeWidth={1.1} />
              </>
            )}
          </g>
        );
      }
      if (dStyle === 'pantry' && rw > 14 && rh > 20) {
        return (
          <g pointerEvents="none" opacity={0.75}>
            <line x1={rx + 4} y1={ry + 6} x2={rx + 4} y2={ry + rh - 6} stroke="#0f766e" strokeWidth={1.3} strokeDasharray="3,2" />
            <line x1={rx + rw - 4} y1={ry + 6} x2={rx + rw - 4} y2={ry + rh - 6} stroke="#0f766e" strokeWidth={1.3} strokeDasharray="3,2" />
            <text x={rx + rw / 2} y={ry + 13} fontSize={13} fontWeight={800} fill="#0f766e" textAnchor="middle">
              سوپری ⇄
            </text>
          </g>
        );
      }
      return null;
    };

    const activeFinishId = box.finish || projectCabinetFinish;
    const finishCfg = CABINET_FINISHES[activeFinishId];
    const isDarkPanel =
      activeFinishId === 'navy-matte' || activeFinishId === 'charcoal' || activeFinishId === 'walnut';
    const panelFill =
      dStyle === 'pantry'
        ? '#ecfdf5'
        : dStyle === 'glass' || dStyle === 'glass-grid'
        ? '#cbd5e1'
        : finishCfg.hex;
    const labelColor =
      dStyle === 'pantry' || dStyle === 'glass' || dStyle === 'glass-grid'
        ? '#334155'
        : isDarkPanel
        ? '#f8fafc'
        : '#334155';

    return (
      <g key={door.id} opacity={opacity} data-door-id={door.id} data-box-id={box.id}>
        {door.kind === 'fridge' ? (
          (() => {
            const fm = box.fridgeModel || (door.widthCm >= 110 ? 'twin' : door.widthCm <= 78 ? 'single' : 'side-by-side');
            const selStroke = isDoorSel ? '#4f46e5' : '#334155';
            const grillH = Math.max(5, Math.min(11, dh * 0.055));
            const leafH = dh - grillH - 2;
            const renderVentSlots = (vx: number, vw: number, vy: number, vh: number) => (
              <g pointerEvents="none">
                <rect x={vx} y={vy} width={vw} height={vh} rx={1} fill="#1e293b" />
                {[0.25, 0.5, 0.75].map((r, i) => (
                  <line
                    key={i}
                    x1={vx + 4}
                    y1={vy + vh * r}
                    x2={vx + vw - 4}
                    y2={vy + vh * r}
                    stroke="#475569"
                    strokeWidth={0.9}
                  />
                ))}
              </g>
            );
            const renderHandleBar = (hx: number, hy1: number, hy2: number) => (
              <g pointerEvents="none">
                <line x1={hx} y1={hy1 + 3} x2={hx + 2} y2={hy1 + 3} stroke="#64748b" strokeWidth={1.6} />
                <line x1={hx} y1={hy2 - 3} x2={hx + 2} y2={hy2 - 3} stroke="#64748b" strokeWidth={1.6} />
                <line x1={hx} y1={hy1} x2={hx} y2={hy2} stroke="#f8fafc" strokeWidth={3.1} strokeLinecap="round" />
                <line x1={hx} y1={hy1} x2={hx} y2={hy2} stroke="#475569" strokeWidth={2.0} strokeLinecap="round" />
              </g>
            );
            const renderDispenser = (ax: number, ay: number, aw: number, ah: number) => (
              <g pointerEvents="none">
                <rect x={ax} y={ay} width={aw} height={ah} rx={2.5} fill="url(#fridge-glass-disp)" stroke="#1e293b" strokeWidth={1} />
                <rect x={ax + aw * 0.2} y={ay + ah * 0.14} width={aw * 0.6} height={Math.max(3, ah * 0.14)} rx={1} fill="#083344" />
                <circle cx={ax + aw * 0.35} cy={ay + ah * 0.21} r={1.2} fill="#22d3ee" />
                <circle cx={ax + aw * 0.52} cy={ay + ah * 0.21} r={1.2} fill="#22d3ee" />
                <line x1={ax + aw * 0.5} y1={ay + ah * 0.36} x2={ax + aw * 0.5} y2={ay + ah * 0.52} stroke="#94a3b8" strokeWidth={1.6} strokeLinecap="round" />
                <rect x={ax + aw * 0.16} y={ay + ah * 0.8} width={aw * 0.68} height={Math.max(2.5, ah * 0.12)} rx={0.8} fill="#64748b" />
              </g>
            );

            if (fm === 'single') {
              const splitY = dy + leafH * 0.66;
              return (
                <>
                  <rect x={dx} y={dy} width={dw} height={dh} rx={3} fill="#1e293b" stroke={selStroke} strokeWidth={isDoorSel ? 2 : 1.4} />
                  <rect x={dx + 1.5} y={dy + 1.5} width={dw - 3} height={leafH * 0.66 - 2.5} rx={2} fill="url(#fridge-metal-grad)" stroke="#94a3b8" strokeWidth={0.8} />
                  <rect x={dx + 1.5} y={splitY + 1} width={dw - 3} height={leafH * 0.34 - 1.5} rx={2} fill="url(#fridge-metal-grad)" stroke="#94a3b8" strokeWidth={0.8} />
                  <rect x={dx + 3} y={dy + 2} width={Math.max(4, dw * 0.14)} height={3} rx={1} fill="#475569" />
                  <rect x={dx + dw - Math.max(4, dw * 0.14) - 3} y={dy + 2} width={Math.max(4, dw * 0.14)} height={3} rx={1} fill="#475569" />
                  {renderHandleBar(dx + 8, dy + leafH * 0.22, dy + leafH * 0.56)}
                  {renderHandleBar(dx + 8, splitY + 8, dy + leafH - 8)}
                  {renderVentSlots(dx + 2, dw - 4, dy + dh - grillH, grillH - 1)}
                  <text x={dx + dw / 2} y={dy + leafH * 0.14} fontSize={13} fontWeight={800} fill="#334155" textAnchor="middle" pointerEvents="none">
                    یخچال ({widthText})
                  </text>
                </>
              );
            }
            if (fm === 'twin') {
              const halfW = (dw - 5) / 2;
              return (
                <>
                  <rect x={dx} y={dy} width={dw} height={dh} rx={3} fill="#1e293b" stroke={selStroke} strokeWidth={isDoorSel ? 2 : 1.4} />
                  <rect x={dx + 1.5} y={dy + 1.5} width={halfW} height={leafH - 1} rx={2} fill="url(#fridge-metal-grad)" stroke="#94a3b8" strokeWidth={0.8} />
                  <rect x={dx + 3.5 + halfW} y={dy + 1.5} width={halfW} height={leafH - 1} rx={2} fill="url(#fridge-metal-grad)" stroke="#94a3b8" strokeWidth={0.8} />
                  {renderHandleBar(dx + halfW - 6, dy + leafH * 0.24, dy + leafH * 0.64)}
                  {renderHandleBar(dx + 3.5 + halfW + 7, dy + leafH * 0.24, dy + leafH * 0.64)}
                  {renderDispenser(dx + halfW * 0.28, dy + leafH * 0.34, Math.max(10, halfW * 0.42), Math.max(18, leafH * 0.2))}
                  {renderVentSlots(dx + 2, dw - 4, dy + dh - grillH, grillH - 1)}
                  <text x={dx + dw / 2} y={dy + leafH * 0.13} fontSize={13} fontWeight={800} fill="#334155" textAnchor="middle" pointerEvents="none">
                    دوقلو ({widthText})
                  </text>
                </>
              );
            }
            // side-by-side
            const sbsSplit = dx + dw * 0.43;
            const leftW = Math.max(10, sbsSplit - dx - 2.5);
            const rightW = Math.max(10, dx + dw - sbsSplit - 2.5);
            return (
              <>
                <rect x={dx} y={dy} width={dw} height={dh} rx={3} fill="#1e293b" stroke={selStroke} strokeWidth={isDoorSel ? 2 : 1.4} />
                <rect x={dx + 1.5} y={dy + 1.5} width={leftW} height={leafH - 1} rx={2} fill="url(#fridge-metal-grad)" stroke="#94a3b8" strokeWidth={0.8} />
                <rect x={sbsSplit + 1} y={dy + 1.5} width={rightW} height={leafH - 1} rx={2} fill="url(#fridge-metal-grad)" stroke="#94a3b8" strokeWidth={0.8} />
                {renderDispenser(dx + leftW * 0.22, dy + leafH * 0.3, Math.max(10, leftW * 0.54), Math.max(20, leafH * 0.22))}
                {renderHandleBar(sbsSplit - 5, dy + leafH * 0.24, dy + leafH * 0.66)}
                {renderHandleBar(sbsSplit + 6, dy + leafH * 0.24, dy + leafH * 0.66)}
                {renderVentSlots(dx + 2, dw - 4, dy + dh - grillH, grillH - 1)}
                <text x={dx + dw / 2} y={dy + leafH * 0.13} fontSize={13} fontWeight={800} fill="#334155" textAnchor="middle" pointerEvents="none">
                  ساید ({widthText})
                </text>
              </>
            );
          })()
        ) : door.kind === 'open' ? (
          <>
            <rect
              x={dx}
              y={dy}
              width={dw}
              height={dh}
              rx={2}
              fill="rgba(241,245,249,0.55)"
              stroke={isDoorSel ? '#4f46e5' : '#94a3b8'}
              strokeDasharray="3,2"
            />
            <text
              x={dx + dw / 2}
              y={dy + dh / 2}
              fontSize={13}
              fontWeight={700}
              fill="#64748b"
              textAnchor="middle"
              pointerEvents="none"
            >
              بدون درب
            </text>
          </>
        ) : door.kind === 'rail' ? (
          <>
            <rect
              x={dx}
              y={dy}
              width={dw}
              height={dh}
              rx={2}
              fill="#e2e8f0"
              stroke={isDoorSel ? '#4f46e5' : '#64748b'}
              strokeWidth={isDoorSel ? 1.8 : 1.3}
            />
            <line x1={dx + 5} y1={dy + 22} x2={dx + dw - 5} y2={dy + 22} stroke="#334155" strokeWidth={2.6} />
            <path d={`M ${dx + dw / 2} ${dy + 22} v 6 l -7 6 h 14 l -7 -6`} fill="none" stroke="#475569" strokeWidth={1.4} />
          </>
        ) : door.kind === 'drawer' ? (
          (() => {
            const pts = [0, ...(door.drawerRatios.length ? door.drawerRatios : [0.333, 0.667]), 1];
            return (
              <>
                {pts.slice(0, -1).map((r, i) => {
                  const sy = dy + r * dh + 1;
                  const sh = Math.max(6, (pts[i + 1] - r) * dh - 2);
                  return (
                    <g key={i}>
                      <rect
                        x={dx}
                        y={sy}
                        width={dw}
                        height={sh}
                        rx={2}
                        fill={dStyle === 'cnc' ? '#f1f5f9' : '#dbe3ee'}
                        stroke={isDoorSel ? '#4f46e5' : '#64748b'}
                        strokeWidth={isDoorSel ? 1.8 : 1.3}
                      />
                      {dStyle === 'cnc' && sh > 14 && (
                        <rect
                          x={dx + 5}
                          y={sy + 4}
                          width={Math.max(4, dw - 10)}
                          height={Math.max(4, sh - 8)}
                          rx={1}
                          fill="rgba(255,255,255,0.45)"
                          stroke="#64748b"
                          strokeWidth={1}
                          pointerEvents="none"
                        />
                      )}
                    </g>
                  );
                })}
                <text
                  x={dx + dw / 2}
                  y={dy + dh - 5}
                  fontSize={13}
                  fontWeight={800}
                  fill="#475569"
                  textAnchor="middle"
                  pointerEvents="none"
                >
                  کشو ({widthText})
                </text>
              </>
            );
          })()
        ) : door.kind === 'lift' ? (
          (() => {
            const pts = [0, ...door.drawerRatios, 1];
            return (
              <>
                {pts.slice(0, -1).map((r, i) => {
                  const sy = dy + r * dh + 1;
                  const sh = Math.max(6, (pts[i + 1] - r) * dh - 2);
                  return (
                    <g key={i}>
                      <rect
                        x={dx}
                        y={sy}
                        width={dw}
                        height={sh}
                        rx={2}
                        fill={dStyle === 'cnc' ? '#eff6ff' : '#e0f2fe'}
                        stroke={isDoorSel ? '#4f46e5' : '#0284c7'}
                        strokeWidth={isDoorSel ? 1.8 : 1.3}
                      />
                      {renderDoorStyleOverlay(dx, sy, dw, sh)}
                      {firstHand && pts.length <= 2 && sh > 20 && (
                        <polyline
                          points={`${dx + 3},${sy + sh - 3} ${dx + dw / 2},${sy + 4} ${dx + dw - 3},${sy + sh - 3}`}
                          fill="none"
                          stroke="#0284c7"
                          strokeWidth={1}
                          strokeDasharray="4,3"
                          opacity={0.45}
                          pointerEvents="none"
                        />
                      )}
                      <line
                        x1={dx + dw * 0.35}
                        y1={sy + sh - 5}
                        x2={dx + dw * 0.65}
                        y2={sy + sh - 5}
                        stroke="#0369a1"
                        strokeWidth={1.6}
                      />
                    </g>
                  );
                })}
                <text
                  x={dx + dw / 2}
                  y={dy + 13}
                  fontSize={13}
                  fontWeight={800}
                  fill="#0369a1"
                  textAnchor="middle"
                  pointerEvents="none"
                >
                  افقی {widthText}
                </text>
              </>
            );
          })()
        ) : door.drawerBand ? (
          (() => {
            const bandH = Math.max(10, Math.round(dh * door.drawerBand.ratio));
            const gapPx = 2;
            const isTop = door.drawerBand.position === 'top';
            const bandY = isTop ? dy : dy + dh - bandH;
            const leafY = isTop ? dy + bandH + gapPx : dy;
            const leafH = Math.max(10, dh - bandH - gapPx);
            return (
              <>
                <rect
                  x={dx}
                  y={bandY}
                  width={dw}
                  height={bandH}
                  rx={2}
                  fill={dStyle === 'cnc' ? '#f1f5f9' : '#dbe3ee'}
                  stroke={isDoorSel ? '#4f46e5' : '#64748b'}
                  strokeWidth={isDoorSel ? 1.8 : 1.3}
                />
                {renderDoorStyleOverlay(dx, bandY, dw, bandH)}
                <line
                  x1={dx + dw * 0.34}
                  y1={bandY + bandH / 2}
                  x2={dx + dw * 0.66}
                  y2={bandY + bandH / 2}
                  stroke="#475569"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  pointerEvents="none"
                />
                <rect
                  x={dx}
                  y={leafY}
                  width={dw}
                  height={leafH}
                  rx={2.5}
                  fill={panelFill}
                  stroke={isDoorSel ? '#4f46e5' : dStyle === 'cnc' ? '#475569' : '#64748b'}
                  strokeWidth={isDoorSel ? 1.8 : 1.3}
                />
                {renderDoorStyleOverlay(dx, leafY, dw, leafH)}
                {inferredHinge && dw >= 14 && leafH >= 20 && (
                  <polyline
                    points={
                      inferredHinge === 'left'
                        ? `${dx + 2},${leafY + 2} ${dx + dw - 3},${leafY + leafH / 2} ${dx + 2},${leafY + leafH - 2}`
                        : `${dx + dw - 2},${leafY + 2} ${dx + 3},${leafY + leafH / 2} ${dx + dw - 2},${leafY + leafH - 2}`
                    }
                    fill="none"
                    stroke="#475569"
                    strokeWidth={1}
                    strokeDasharray="4,3"
                    opacity={0.48}
                    pointerEvents="none"
                  />
                )}
                <text
                  x={dx + dw / 2}
                  y={leafY + leafH / 2 + 3.5}
                  fontSize={13}
                  fontWeight={800}
                  fill={labelColor}
                  textAnchor="middle"
                  pointerEvents="none"
                >
                  {widthText} cm
                </text>
              </>
            );
          })()
        ) : (
          <>
            <rect
              x={dx}
              y={dy}
              width={dw}
              height={dh}
              rx={2.5}
              fill={panelFill}
              stroke={isDoorSel ? '#4f46e5' : dStyle === 'cnc' ? '#475569' : '#64748b'}
              strokeWidth={isDoorSel ? 1.8 : 1.3}
            />
            {renderDoorStyleOverlay(dx, dy, dw, dh)}
            {inferredHinge && dw >= 14 && dh >= 22 && (
              <polyline
                points={
                  inferredHinge === 'left'
                    ? `${dx + 2},${dy + 2} ${dx + dw - 3},${dy + dh / 2} ${dx + 2},${dy + dh - 2}`
                    : `${dx + dw - 2},${dy + 2} ${dx + 3},${dy + dh / 2} ${dx + dw - 2},${dy + dh - 2}`
                }
                fill="none"
                stroke="#475569"
                strokeWidth={1}
                strokeDasharray="4,3"
                opacity={0.48}
                pointerEvents="none"
              />
            )}
            <text
              x={dx + dw / 2}
              y={dy + dh / 2 + 3.5}
              fontSize={13}
              fontWeight={800}
              fill={labelColor}
              textAnchor="middle"
              pointerEvents="none"
            >
              {widthText} cm
            </text>
          </>
        )}

        {!doorsLocked &&
          tool === 'select' &&
          door.kind !== 'fridge' &&
          (hasTouchingRightNeighbor ? (
            <rect
              x={dx + dw - 3.5}
              y={dy + dh / 2 - 14}
              width={7}
              height={28}
              rx={3.5}
              fill="#059669"
              stroke="#ffffff"
              strokeWidth={1.3}
              style={{ cursor: 'col-resize' }}
              data-door-seam={door.id}
              data-box-id={box.id}
            />
          ) : (
            <rect
              x={dx + dw - 3.5}
              y={dy + dh / 2 - 12}
              width={7}
              height={24}
              rx={3.5}
              fill="#4f46e5"
              stroke="#ffffff"
              strokeWidth={1.2}
              style={{ cursor: 'ew-resize' }}
              data-door-resize={door.id}
              data-box-id={box.id}
            />
          ))}
      </g>
    );
  };

  return (
    <section
      ref={paneRef}
      className="relative flex-1 min-h-[200px] front-grid overflow-hidden select-none"
      aria-label="نمای روبرو"
    >
      {/* عنوان دیوار بدون شلوغی */}
      <div className="absolute top-2 right-2.5 z-15 bg-white/95 border border-slate-300 rounded-lg px-2.5 py-1 text-[13px] font-extrabold text-slate-800 tabular-nums pointer-events-none max-w-[calc(100%-20px)] truncate">
        {wall
          ? `${wall.name} — طول ${wall.length} cm · ارتفاع ${wall.height} cm · زوم ${Math.round(
              (pxPerCm / 2.1) * 100
            )}٪`
          : 'دیواری انتخاب نشده'}
      </div>

      {multiSelection &&
        multiSelection.boxIds.length +
          multiSelection.doorIds.length +
          multiSelection.openingIds.length +
          multiSelection.applianceIds.length >
          0 && (
          <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-slate-900/95 text-white px-3 py-1.5 rounded-xl shadow-lg text-[13px] font-bold">
            <span>
              انتخاب گروهی:{' '}
              {multiSelection.boxIds.length +
                multiSelection.doorIds.length +
                multiSelection.openingIds.length +
                multiSelection.applianceIds.length}{' '}
              مورد
            </span>
            {onBulkDelete && (
              <button
                type="button"
                onClick={onBulkDelete}
                className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white font-extrabold"
              >
                حذف یکجا
              </button>
            )}
            <button
              type="button"
              onClick={() => onSetMultiSelection(undefined)}
              className="px-2 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100"
            >
              لغو
            </button>
          </div>
        )}

      {wall && wall.boxes.length === 0 && (wall.openings || []).length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="bg-white/95 border border-dashed border-slate-400 rounded-xl px-5 py-3 text-center text-slate-600 text-[13px] font-bold">
            روی این دیوار باکسی نیست — از پایین ابزار <b>«باکس کابینت»</b> یا <b>«یخچال / پنجره»</b> را بزنید
          </div>
        </div>
      )}

      <svg
        ref={svgRef}
        data-testid="front-svg"
        viewBox={viewBox}
        className="w-full h-full block touch-none"
        style={{ cursor: spaceDown ? 'grab' : tool === 'eraser' ? 'not-allowed' : undefined }}
        onContextMenu={(e) => {
          e.preventDefault();
          dragOp.current = null;
          setMarquee(null);
          setDragGuides(null);
          if (tool !== 'select') {
            onExitToSelect();
          }
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={() => {
          touchPinch.current = null;
          gestureStepperRef.current.resetTouch();
          lastMultiTouchMsRef.current = performance.now();
        }}
        onPointerLeave={() => {
          setDoorHover(null);
          setPencilHover(null);
          setAppHover(null);
          setFrameHover(null);
          setCursorPt(null);
          setHoverClientPt(null);
          setHoverFinishTarget(null);
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={(e) => {
          activePointersRef.current.delete(e.pointerId);
          dragOp.current = null;
        }}
      >
        <defs>
          <linearGradient id="fridge-metal-grad" x1="0%" y1="0%" x2="100%" y2="15%">
            <stop offset="0%" stopColor="#e2e8f0" />
            <stop offset="35%" stopColor="#cbd5e1" />
            <stop offset="70%" stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#cbd5e1" />
          </linearGradient>
          <linearGradient id="fridge-glass-disp" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#0f172a" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
          <pattern
            id="corner-hatch"
            width="8"
            height="8"
            patternTransform="rotate(45 0 0)"
            patternUnits="userSpaceOnUse"
          >
            <line x1="0" y1="0" x2="0" y2="8" stroke="#dc2626" strokeWidth="1.4" opacity="0.45" />
          </pattern>
          <pattern
            id="column-hatch"
            width="8"
            height="8"
            patternTransform="rotate(45 0 0)"
            patternUnits="userSpaceOnUse"
          >
            <line x1="0" y1="0" x2="0" y2="8" stroke="#475569" strokeWidth="1.8" opacity="0.45" />
          </pattern>
          {(() => {
            const bsCfg = BACKSPLASH_FINISHES[projectBacksplashFinish];
            return (
              <pattern
                id="backsplash-tile-pattern"
                width="26"
                height="14"
                patternUnits="userSpaceOnUse"
              >
                <rect width="26" height="14" fill={bsCfg.baseHex} />
                {bsCfg.pattern === 'subway' ? (
                  <>
                    <line x1="0" y1="0" x2="26" y2="0" stroke={bsCfg.groutHex} strokeWidth="0.9" />
                    <line x1="0" y1="7" x2="26" y2="7" stroke={bsCfg.groutHex} strokeWidth="0.9" />
                    <line x1="0" y1="0" x2="0" y2="7" stroke={bsCfg.groutHex} strokeWidth="0.9" />
                    <line x1="13" y1="7" x2="13" y2="14" stroke={bsCfg.groutHex} strokeWidth="0.9" />
                  </>
                ) : bsCfg.pattern === 'herringbone' ? (
                  <path
                    d="M0 7 L13 0 L26 7 L13 14 Z"
                    fill="none"
                    stroke={bsCfg.groutHex}
                    strokeWidth="0.9"
                  />
                ) : bsCfg.pattern === 'hex' ? (
                  <polygon
                    points="6.5,1 19.5,1 24,7 19.5,13 6.5,13 2,7"
                    fill={bsCfg.accentHex}
                    fillOpacity="0.35"
                    stroke={bsCfg.groutHex}
                    strokeWidth="0.8"
                  />
                ) : bsCfg.pattern === 'terrazzo' ? (
                  <>
                    <circle cx="5" cy="4" r="1.2" fill={bsCfg.accentHex} opacity="0.55" />
                    <circle cx="17" cy="9" r="1.4" fill={bsCfg.groutHex} opacity="0.7" />
                    <circle cx="22" cy="3" r="0.9" fill={bsCfg.accentHex} opacity="0.5" />
                  </>
                ) : (
                  <>
                    <path
                      d="M0 10 Q10 4 26 9"
                      fill="none"
                      stroke={bsCfg.accentHex}
                      strokeWidth="0.8"
                      opacity="0.45"
                    />
                    <rect width="26" height="14" fill="none" stroke={bsCfg.groutHex} strokeWidth="0.45" />
                  </>
                )}
              </pattern>
            );
          })()}
        </defs>

        {wall && (
          <>
            {/* دیوار پس‌زمینه و خط کف */}
            <rect
              x={originX}
              y={floorY - wallH}
              width={wallW}
              height={wallH}
              fill="#ffffff"
              fillOpacity={0.78}
              stroke="#cbd5e1"
              strokeWidth={1.5}
              strokeDasharray="6,4"
            />
            <line
              x1={originX - 24}
              y1={floorY}
              x2={originX + wallW + 24}
              y2={floorY}
              stroke="#334155"
              strokeWidth={2.5}
            />

            {/* کاشی بین‌کابینتی در نمای روبرو */}
            {backsplashSpans.map((sp, idx) => {
              const bx = originX + sp.startCm * s;
              const bw = Math.max(4, (sp.endCm - sp.startCm) * s);
              const by = floorY - sp.topY * s;
              const bh = Math.max(6, (sp.topY - sp.botY) * s);
              return (
                <rect
                  key={`bs_${idx}`}
                  x={bx}
                  y={by}
                  width={bw}
                  height={bh}
                  fill="url(#backsplash-tile-pattern)"
                  stroke={tool === 'finish' && hoverFinishTarget === 'backsplash' ? '#4f46e5' : BACKSPLASH_FINISHES[projectBacksplashFinish].groutHex}
                  strokeWidth={tool === 'finish' && hoverFinishTarget === 'backsplash' ? 1.8 : 0.8}
                  data-backsplash-zone="true"
                  style={{ cursor: tool === 'finish' ? 'pointer' : undefined }}
                />
              );
            })}

            {/* پنجره‌ها، درب‌های اتاق و ستون‌ها در نمای روبرو */}
            {(wall.openings || []).map((op: WallOpening) => {
              const ox = originX + op.offsetX * s;
              const ow = op.width * s;
              const oh = op.height * s;
              const oy = floorY - op.elevY * s - oh;
              const isSel =
                op.id === selectedOpeningId || Boolean(multiSelection?.openingIds.includes(op.id));

              return (
                <g
                  key={op.id}
                  data-opening-id={op.id}
                  style={{ cursor: tool === 'eraser' ? 'not-allowed' : 'move' }}
                >
                  {op.kind === 'window' ? (
                    <>
                      <rect
                        x={ox}
                        y={oy}
                        width={ow}
                        height={oh}
                        fill="#e0f2fe"
                        fillOpacity={0.75}
                        stroke={isSel ? '#4f46e5' : '#0284c7'}
                        strokeWidth={isSel ? 2.4 : 1.8}
                      />
                      <rect
                        x={ox + 5}
                        y={oy + 5}
                        width={Math.max(4, ow - 10)}
                        height={Math.max(4, oh - 10)}
                        fill="none"
                        stroke="#7dd3fc"
                        strokeWidth={1.2}
                      />
                      <line
                        x1={ox + ow / 2}
                        y1={oy + 5}
                        x2={ox + ow / 2}
                        y2={oy + oh - 5}
                        stroke="#0284c7"
                        strokeWidth={1.3}
                      />
                      <text
                        x={ox + ow / 2}
                        y={oy + oh / 2 + 3}
                        fontSize={13}
                        fontWeight={800}
                        fill="#0369a1"
                        textAnchor="middle"
                        pointerEvents="none"
                      >
                        پنجره {op.width}×{op.height} (کف {op.elevY})
                      </text>
                    </>
                  ) : op.kind === 'column' ? (
                    <>
                      <rect
                        x={ox}
                        y={oy}
                        width={ow}
                        height={oh}
                        fill="url(#column-hatch)"
                        stroke={isSel ? '#4f46e5' : '#334155'}
                        strokeWidth={isSel ? 2.4 : 1.8}
                      />
                      <text
                        x={ox + ow / 2}
                        y={oy + oh / 2}
                        fontSize={13}
                        fontWeight={800}
                        fill="#0f172a"
                        textAnchor="middle"
                        pointerEvents="none"
                      >
                        ستون {op.width}
                      </text>
                    </>
                  ) : (
                    <>
                      <rect
                        x={ox}
                        y={oy}
                        width={ow}
                        height={oh}
                        fill="#f1f5f9"
                        stroke={isSel ? '#4f46e5' : '#475569'}
                        strokeWidth={isSel ? 2.4 : 1.8}
                      />
                      <rect
                        x={ox + 5}
                        y={oy + 5}
                        width={Math.max(6, ow - 10)}
                        height={Math.max(6, oh - 5)}
                        fill="#e2e8f0"
                        stroke="#94a3b8"
                        strokeWidth={1}
                      />
                      <circle
                        cx={op.swingDir?.startsWith('left') ? ox + ow - 12 : ox + 12}
                        cy={oy + oh * 0.54}
                        r={3}
                        fill="#334155"
                      />
                      <text
                        x={ox + ow / 2}
                        y={oy + 22}
                        fontSize={13}
                        fontWeight={800}
                        fill="#334155"
                        textAnchor="middle"
                        pointerEvents="none"
                      >
                        درب {op.width}×{op.height}
                      </text>
                    </>
                  )}

                  {/* دستگیره‌های تغییر اندازه تعاملی پنجره / درب / ستون */}
                  {(isSel || tool === 'select' || tool === 'opening') && (
                    <>
                      <rect
                        x={ox - 4}
                        y={oy + oh / 2 - 12}
                        width={8}
                        height={24}
                        rx={4}
                        fill="#0284c7"
                        stroke="#ffffff"
                        strokeWidth={1.3}
                        style={{ cursor: 'ew-resize' }}
                        data-opening-handle="left"
                        data-opening-id={op.id}
                      />
                      <rect
                        x={ox + ow - 4}
                        y={oy + oh / 2 - 12}
                        width={8}
                        height={24}
                        rx={4}
                        fill="#0284c7"
                        stroke="#ffffff"
                        strokeWidth={1.3}
                        style={{ cursor: 'ew-resize' }}
                        data-opening-handle="right"
                        data-opening-id={op.id}
                      />
                      {op.kind !== 'column' && (
                        <rect
                          x={ox + ow / 2 - 12}
                          y={oy - 4}
                          width={24}
                          height={8}
                          rx={4}
                          fill="#0284c7"
                          stroke="#ffffff"
                          strokeWidth={1.3}
                          style={{ cursor: 'ns-resize' }}
                          data-opening-handle="top"
                          data-opening-id={op.id}
                        />
                      )}
                      {op.kind === 'window' && (
                        <rect
                          x={ox + ow / 2 - 12}
                          y={oy + oh - 4}
                          width={24}
                          height={8}
                          rx={4}
                          fill="#0284c7"
                          stroke="#ffffff"
                          strokeWidth={1.3}
                          style={{ cursor: 'ns-resize' }}
                          data-opening-handle="bottom"
                          data-opening-id={op.id}
                        />
                      )}
                    </>
                  )}
                </g>
              );
            })}

            {/* باکس‌های کابینت */}
            {wall.boxes.map((box) => {
              const isAct =
                box.id === activeBoxId || Boolean(multiSelection?.boxIds.includes(box.id));
              const bx = originX + box.offsetX * s;
              const bw = box.width * s;
              const bh = box.height * s;
              const by = floorY - box.elevY * s - bh;
              const plinthPx = box.plinth * s;
              const bodyH = Math.max(14, bh - plinthPx);
              const topPad = box.countertopCm * s;
              const insets = getEffectiveBoxInsets(box);
              const scaleX = Math.max(
                0.2,
                (box.width - insets.left - insets.right) / Math.max(1, box.width)
              );
              const fridgeFrame =
                box.type === 'fridge' &&
                (box.hasFridgeFrame || doesFridgeTouchCabinet(wall, box)) &&
                !(box.frames && box.frames.length > 0);
              const ffPx = FRIDGE_FRAME_CM * s;

              // Plinth intervals cut out around floor-standing built-in dishwasher & washing machine
              const plinthSpans: Array<{ startX: number; endX: number }> = [];
              if (plinthPx > 0) {
                let pSpans: Array<{ startX: number; endX: number }> = [
                  { startX: box.offsetX, endX: box.offsetX + box.width },
                ];
                if (box.type === 'base') {
                  const floorApps = wall.appliances.filter(
                    (a) =>
                      (a.kind === 'dishwasher' || a.kind === 'washing') &&
                      a.offsetX < box.offsetX + box.width - 1 &&
                      a.offsetX + a.width > box.offsetX + 1
                  );
                  for (const fa of floorApps) {
                    const nextSpans: Array<{ startX: number; endX: number }> = [];
                    for (const sp of pSpans) {
                      if (fa.offsetX + fa.width <= sp.startX + 0.5 || fa.offsetX >= sp.endX - 0.5) {
                        nextSpans.push(sp);
                      } else {
                        if (fa.offsetX - sp.startX > 1) {
                          nextSpans.push({ startX: sp.startX, endX: fa.offsetX });
                        }
                        if (sp.endX - (fa.offsetX + fa.width) > 1) {
                          nextSpans.push({ startX: fa.offsetX + fa.width, endX: sp.endX });
                        }
                      }
                    }
                    pSpans = nextSpans;
                  }
                }
                plinthSpans.push(...pSpans);
              }

              return (
                <g key={box.id} data-box-id={box.id}>
                  <rect
                    x={bx}
                    y={by}
                    width={bw}
                    height={bodyH}
                    rx={2}
                    fill={CABINET_FINISHES[box.finish || projectCabinetFinish].hexDark}
                    fillOpacity={box.type === 'wall-deep' ? 0.85 : 0.96}
                    stroke={isAct ? '#4f46e5' : box.type === 'wall-deep' ? '#0284c7' : '#64748b'}
                    strokeWidth={isAct ? 2.2 : 1.5}
                  />
                  {/* چهارچوب بدنه واقعی یونیت (قید بالا، کف یونیت بالای پاخور، و دیواره‌های کناری) */}
                  {box.type !== 'fridge' && bodyH > 20 && (
                    <g pointerEvents="none" opacity={doorsHidden ? 0.92 : 0.45}>
                      <rect
                        x={bx + 1}
                        y={by + topPad}
                        width={Math.max(4, bw - 2)}
                        height={Math.max(2, tPx)}
                        fill="#e2e8f0"
                        stroke="#64748b"
                        strokeWidth={0.6}
                      />
                      <rect
                        x={bx + 1}
                        y={by + bodyH - Math.max(2, tPx)}
                        width={Math.max(4, bw - 2)}
                        height={Math.max(2, tPx)}
                        fill="#cbd5e1"
                        stroke="#64748b"
                        strokeWidth={0.6}
                      />
                      <rect
                        x={bx}
                        y={by + topPad}
                        width={Math.max(2, tPx)}
                        height={Math.max(8, bodyH - topPad)}
                        fill="#e2e8f0"
                        stroke="#64748b"
                        strokeWidth={0.6}
                      />
                      <rect
                        x={bx + bw - Math.max(2, tPx)}
                        y={by + topPad}
                        width={Math.max(2, tPx)}
                        height={Math.max(8, bodyH - topPad)}
                        fill="#e2e8f0"
                        stroke="#64748b"
                        strokeWidth={0.6}
                      />
                    </g>
                  )}
                  {box.id === autoUnitHighlightBoxId && (
                    <rect
                      x={bx - 3}
                      y={by - 3}
                      width={bw + 6}
                      height={bodyH + 6}
                      rx={4}
                      fill="rgba(16,185,129,0.12)"
                      stroke="#10b981"
                      strokeWidth={3}
                      className="animate-pulse"
                      pointerEvents="none"
                    />
                  )}

                  {fridgeFrame && (
                    <g data-fridge-frame="true">
                      <rect x={bx} y={by} width={ffPx} height={bodyH} fill="#64748b" />
                      <rect
                        x={bx + bw - ffPx}
                        y={by}
                        width={ffPx}
                        height={bodyH}
                        fill="#64748b"
                      />
                      <rect x={bx} y={by} width={bw} height={ffPx} fill="#475569" />
                    </g>
                  )}

                  {/* فریم‌های ۳ تا ۱۱ سانتی ثبت‌شده روی باکس */}
                  {(box.frames || []).map((fr) => {
                    const fW = fr.widthCm * s;
                    const isFSel = fr.id === selectedFrameId;
                    const fFill = isFSel ? '#4f46e5' : '#64748b';
                    const fStroke = isFSel ? '#312e81' : '#334155';
                    const cur =
                      tool === 'eraser' ? 'not-allowed' : tool === 'select' ? 'pointer' : undefined;

                    if (fr.side === 'left') {
                      return (
                        <rect
                          key={fr.id}
                          x={bx}
                          y={by + topPad}
                          width={fW}
                          height={Math.max(8, bodyH - topPad)}
                          fill={fFill}
                          stroke={fStroke}
                          strokeWidth={1.1}
                          data-frame-id={fr.id}
                          data-box-id={box.id}
                          style={{ cursor: cur }}
                        />
                      );
                    }
                    if (fr.side === 'right') {
                      return (
                        <rect
                          key={fr.id}
                          x={bx + bw - fW}
                          y={by + topPad}
                          width={fW}
                          height={Math.max(8, bodyH - topPad)}
                          fill={fFill}
                          stroke={fStroke}
                          strokeWidth={1.1}
                          data-frame-id={fr.id}
                          data-box-id={box.id}
                          style={{ cursor: cur }}
                        />
                      );
                    }
                    if (fr.side === 'top') {
                      return (
                        <rect
                          key={fr.id}
                          x={bx}
                          y={by + topPad}
                          width={bw}
                          height={fW}
                          fill={fFill}
                          stroke={fStroke}
                          strokeWidth={1.1}
                          data-frame-id={fr.id}
                          data-box-id={box.id}
                          style={{ cursor: cur }}
                        />
                      );
                    }
                    if (fr.side === 'bottom') {
                      return (
                        <rect
                          key={fr.id}
                          x={bx}
                          y={by + bodyH - fW}
                          width={bw}
                          height={fW}
                          fill={fFill}
                          stroke={fStroke}
                          strokeWidth={1.1}
                          data-frame-id={fr.id}
                          data-box-id={box.id}
                          style={{ cursor: cur }}
                        />
                      );
                    }
                    if (fr.side === 'seam' && fr.seamCm !== undefined) {
                      const sx = bx + (insets.left + fr.seamCm * scaleX) * s - fW / 2;
                      return (
                        <rect
                          key={fr.id}
                          x={sx}
                          y={by + topPad + insets.top * s}
                          width={fW}
                          height={Math.max(8, bodyH - topPad - (insets.top + insets.bottom) * s)}
                          fill={fFill}
                          stroke={fStroke}
                          strokeWidth={1.1}
                          data-frame-id={fr.id}
                          data-box-id={box.id}
                          style={{ cursor: cur }}
                        />
                      );
                    }
                    return null;
                  })}

                  {/* پاخور کف با برش خودکار در محل ظرفشویی و لباسشویی */}
                  {plinthSpans.map((sp, sIdx) => {
                    const sx = originX + sp.startX * s + 1;
                    const sw = Math.max(4, (sp.endX - sp.startX) * s - 2);
                    return (
                      <rect
                        key={sIdx}
                        x={sx}
                        y={by + bodyH}
                        width={sw}
                        height={plinthPx}
                        fill="#cbd5e1"
                        stroke="#94a3b8"
                        strokeWidth={1}
                      />
                    );
                  })}

                  {!doorsHidden && box.doors.map((door) => renderDoorUnit(box, door, bx, by, bodyH))}

                  {!doorsHidden &&
                    tool === 'door-pencil' &&
                    doorPencilHover?.boxId === box.id &&
                    doorPencilHover.doorIds.map((dId) => {
                      const d = box.doors.find((x) => x.id === dId);
                      if (!d || d.kind !== 'door') return null;
                      const dx = bx + (insets.left + d.startCm * scaleX) * s + 1.5;
                      const dw = Math.max(6, d.widthCm * scaleX * s - 3);
                      const dy = by + topPad + insets.top * s + 1.5;
                      const dh = Math.max(
                        8,
                        bodyH - topPad - (insets.top + insets.bottom) * s - 3
                      );
                      const bandH = Math.max(10, Math.round(dh * doorBandRatio));
                      const bandY =
                        doorPencilHover.pos === 'top' ? dy : dy + dh - bandH;
                      return (
                        <rect
                          key={`dp_${d.id}`}
                          x={dx}
                          y={bandY}
                          width={dw}
                          height={bandH}
                          rx={2}
                          fill="rgba(79,70,229,0.28)"
                          stroke="#4f46e5"
                          strokeWidth={1.8}
                          strokeDasharray="4,2"
                          pointerEvents="none"
                        />
                      );
                    })}

                  {doorsHidden &&
                    box.type !== 'fridge' &&
                    getUnitsInBox(box, blockedZones).map((unit) => {
                      if (unit.blockedReason === 'یخچال طبقه داخلی ندارد') return null;
                      const ux = bx + (insets.left + unit.startCm * scaleX) * s + 1.5;
                      const uw = Math.max(8, unit.widthCm * scaleX * s - 3);
                      const uy = by + topPad + insets.top * s + 1.5;
                      const uh = Math.max(10, bodyH - topPad - (insets.top + insets.bottom) * s - 3);
                      const isUnitSel =
                        selectedUnit?.boxId === box.id &&
                        Math.abs(selectedUnit.startCm - unit.startCm) <= 1.8 &&
                        Math.abs(selectedUnit.endCm - unit.endCm) <= 1.8;
                      const doorTag =
                        unit.doors.length === 0
                          ? 'خالی'
                          : unit.hasDrawer
                          ? `کشو ${unit.doors.reduce((acc, d) => acc + d.drawerRatios.length + 1, 0)}`
                          : unit.hasLift
                          ? 'جک افقی'
                          : `${unit.hingedCount} درب`;
                      return (
                        <g
                          key={`ubay_${unit.startCm}_${unit.endCm}`}
                          data-unit-bay="true"
                          data-box-id={box.id}
                          data-unit-start={unit.startCm}
                          data-unit-end={unit.endCm}
                          style={{
                            cursor:
                              tool === 'select' ||
                              (doorsHidden &&
                                (tool === 'doors' || tool === 'door-style' || tool === 'handle'))
                                ? 'pointer'
                                : undefined,
                          }}
                        >
                          <rect
                            x={ux}
                            y={uy}
                            width={uw}
                            height={uh}
                            rx={3}
                            fill={isUnitSel ? 'rgba(124,58,237,0.16)' : 'rgba(241,245,249,0.55)'}
                            stroke={isUnitSel ? '#7c3aed' : '#94a3b8'}
                            strokeWidth={isUnitSel ? 2.2 : 1.1}
                            strokeDasharray={isUnitSel ? undefined : '4,3'}
                          />
                          <text
                            x={ux + uw / 2}
                            y={uy + Math.min(20, uh * 0.35)}
                            fontSize={13}
                            fontWeight={800}
                            fill={isUnitSel ? '#5b21b6' : '#475569'}
                            textAnchor="middle"
                            pointerEvents="none"
                          >
                            {`یونیت ${Math.round(unit.widthCm)}cm`}
                          </text>
                          <text
                            x={ux + uw / 2}
                            y={uy + Math.min(33, uh * 0.35 + 13)}
                            fontSize={13}
                            fontWeight={700}
                            fill={isUnitSel ? '#6d28d9' : '#64748b'}
                            textAnchor="middle"
                            pointerEvents="none"
                          >
                            {doorTag}
                          </text>
                        </g>
                      );
                    })}

                  {(box.type === 'wall' || box.type === 'wall-deep') &&
                    !box.linkedToBoxId &&
                    wall.appliances
                      .filter(
                        (a) =>
                          a.kind === 'gas' &&
                          a.hoodKind !== 'hidden' &&
                          a.offsetX < box.offsetX + box.width - 5 &&
                          a.offsetX + a.width > box.offsetX + 5
                      )
                      .map((gApp) => {
                        const sCm = Math.max(0, gApp.offsetX - box.offsetX);
                        const eCm = Math.min(box.width, gApp.offsetX + gApp.width - box.offsetX);
                        if (eCm - sCm < 25) return null;
                        const hx = bx + (insets.left + sCm * scaleX) * s + 1.5;
                        const hw = Math.max(8, (eCm - sCm) * scaleX * s - 3);
                        const hy = by + topPad + insets.top * s + 1.5;
                        const hh = Math.max(10, bodyH - topPad - (insets.top + insets.bottom) * s - 3);
                        return (
                          <g key={`hoodbay_${gApp.id}`} pointerEvents="none">
                            <rect
                              x={hx}
                              y={hy}
                              width={hw}
                              height={hh}
                              rx={2}
                              fill="rgba(226,232,240,0.45)"
                              stroke="#64748b"
                              strokeWidth={1.1}
                              strokeDasharray="4,3"
                            />
                            <text
                              x={hx + hw / 2}
                              y={hy + 13}
                              fontSize={13}
                              fontWeight={800}
                              fill="#475569"
                              textAnchor="middle"
                            >
                              {`یونیت هود (${Math.round(eCm - sCm)})`}
                            </text>
                          </g>
                        );
                      })}

                  {box.unitDividers.map((uCm) => {
                    const ux = bx + (insets.left + uCm * scaleX) * s;
                    const innerTop = by + topPad + insets.top * s;
                    const innerH = Math.max(6, bodyH - topPad - (insets.top + insets.bottom) * s);
                    const isDivSel =
                      selectedUnitDivider?.boxId === box.id &&
                      Math.abs(selectedUnitDivider.seamCm - uCm) <= 1.2;
                    return (
                      <g
                        key={uCm}
                        data-unit-div={uCm}
                        data-box-id={box.id}
                        style={{
                          cursor:
                            tool === 'eraser'
                              ? 'not-allowed'
                              : tool === 'select' ||
                                (doorsHidden && tool !== 'pencil' && tool !== 'skeleton')
                              ? 'ew-resize'
                              : undefined,
                        }}
                      >
                        <rect
                          x={ux - 8}
                          y={innerTop}
                          width={16}
                          height={innerH}
                          fill="transparent"
                        />
                        <rect
                          x={ux - tPx}
                          y={innerTop}
                          width={tPx * 2}
                          height={innerH}
                          fill={isDivSel ? '#c4b5fd' : '#ede9fe'}
                          stroke={isDivSel ? '#4f46e5' : '#7c3aed'}
                          strokeWidth={isDivSel ? 2 : 1.4}
                        />
                        <line
                          x1={ux}
                          y1={innerTop}
                          x2={ux}
                          y2={by + bodyH - insets.bottom * s}
                          stroke={isDivSel ? '#4f46e5' : '#7c3aed'}
                          strokeWidth={isDivSel ? 1.8 : 1.2}
                        />
                        {((doorsHidden && tool !== 'eraser' && tool !== 'pencil' && tool !== 'skeleton') ||
                          (tool === 'select' && isDivSel)) && (
                          <rect
                            x={ux - 4}
                            y={innerTop + innerH / 2 - 12}
                            width={8}
                            height={24}
                            rx={4}
                            fill="#7c3aed"
                            stroke="#ffffff"
                            strokeWidth={1.3}
                            style={{ cursor: 'ew-resize' }}
                            data-unit-div-resize={uCm}
                            data-box-id={box.id}
                          />
                        )}
                      </g>
                    );
                  })}

                  {box.shelves.map((sh) => {
                    const sx = bx + (insets.left + sh.startCm * scaleX) * s + tPx;
                    const sw = Math.max(6, (sh.endCm - sh.startCm) * scaleX * s - tPx * 2);
                    const sy =
                      by +
                      topPad +
                      insets.top * s +
                      Math.max(8, bodyH - topPad - (insets.top + insets.bottom) * s) * sh.yRatio;
                    const isShSel = sh.id === selectedShelfId;
                    return (
                      <g
                        key={sh.id}
                        data-shelf-id={sh.id}
                        data-box-id={box.id}
                        style={{
                          cursor:
                            tool === 'eraser'
                              ? 'not-allowed'
                              : tool === 'select'
                              ? 'pointer'
                              : undefined,
                        }}
                      >
                        <rect
                          x={sx}
                          y={sy - 9}
                          width={sw}
                          height={18}
                          fill="transparent"
                        />
                        <rect
                          x={sx}
                          y={sy - Math.max(1.5, tPx / 2)}
                          width={sw}
                          height={Math.max(3, tPx)}
                          fill={isShSel ? '#fde68a' : '#fef3c7'}
                          stroke={isShSel ? '#4f46e5' : '#d97706'}
                          strokeWidth={isShSel ? 2 : 1.2}
                        />
                      </g>
                    );
                  })}

                  {!doorsHidden && box.handles.map((h) => {
                    const door = box.doors.find((d) => d.id === h.doorId);
                    if (!door) return null;
                    const apronExtraPx = getApronExtraTopCm(box, door) * s;
                    const dx = bx + (insets.left + door.startCm * scaleX) * s + 1.5;
                    const dw = Math.max(6, door.widthCm * scaleX * s - 3);
                    const dy = by + topPad + insets.top * s + apronExtraPx + 1.5;
                    const dh = Math.max(
                      8,
                      bodyH - topPad - (insets.top + insets.bottom) * s - apronExtraPx - 3
                    );

                    let rowY = dy;
                    let rowH = dh;
                    if (
                      door.kind === 'drawer' ||
                      (door.kind === 'lift' && door.drawerRatios.length > 0)
                    ) {
                      const pts = [0, ...door.drawerRatios, 1];
                      const r = Math.min(pts.length - 2, Math.max(0, h.rowIndex));
                      rowY = dy + pts[r] * dh;
                      rowH = (pts[r + 1] - pts[r]) * dh;
                    }

                    const cx = dx + dw * h.xRatio;
                    const cy = rowY + rowH * h.yRatio;
                    const lenPx = (h.lengthCm || 16) * s;
                    const isHSel = h.id === selectedHandleId;

                    return (
                      <g
                        key={h.id}
                        style={{ cursor: tool === 'eraser' ? 'not-allowed' : 'pointer' }}
                        data-handle-id={h.id}
                        data-box-id={box.id}
                      >
                        {h.orient === 'vertical' ? (
                          <rect
                            x={cx - 7}
                            y={cy - lenPx / 2 - 4}
                            width={14}
                            height={lenPx + 8}
                            fill="transparent"
                          />
                        ) : (
                          <rect
                            x={cx - lenPx / 2 - 4}
                            y={cy - 7}
                            width={lenPx + 8}
                            height={14}
                            fill="transparent"
                          />
                        )}
                        {h.style === 'knob' ? (
                          <circle
                            cx={cx}
                            cy={cy}
                            r={4.5}
                            fill={isHSel ? '#4f46e5' : '#0f172a'}
                            stroke="#ffffff"
                            strokeWidth={1.2}
                          />
                        ) : h.style === 'hidden' ? (
                          door.kind === 'drawer' ? (
                            <rect
                              x={dx + 1.5}
                              y={rowY + 1}
                              width={Math.max(4, dw - 3)}
                              height={4}
                              rx={1}
                              fill={isHSel ? '#4f46e5' : '#334155'}
                            />
                          ) : h.orient === 'vertical' ? (
                            <rect
                              x={h.xRatio >= 0.5 ? dx + dw - 5 : dx + 1}
                              y={rowY + 2}
                              width={4}
                              height={Math.max(10, rowH - 4)}
                              rx={1}
                              fill={isHSel ? '#4f46e5' : '#334155'}
                            />
                          ) : (
                            <rect
                              x={dx + 1.5}
                              y={box.type === 'wall' || box.type === 'wall-deep' ? rowY + rowH - 5 : rowY + 1}
                              width={Math.max(4, dw - 3)}
                              height={4}
                              rx={1}
                              fill={isHSel ? '#4f46e5' : '#334155'}
                            />
                          )
                        ) : h.orient === 'vertical' ? (
                          <rect
                            x={cx - 2}
                            y={cy - lenPx / 2}
                            width={4}
                            height={lenPx}
                            rx={2}
                            fill={isHSel ? '#4f46e5' : '#0f172a'}
                          />
                        ) : (
                          <rect
                            x={cx - lenPx / 2}
                            y={cy - 2}
                            width={lenPx}
                            height={4}
                            rx={2}
                            fill={isHSel ? '#4f46e5' : '#0f172a'}
                          />
                        )}
                      </g>
                    );
                  })}

                  {isAct && tool === 'select' && (
                    <>
                      <rect
                        x={bx - 5}
                        y={by + bodyH / 2 - 14}
                        width={8}
                        height={28}
                        rx={4}
                        fill="#4f46e5"
                        stroke="#ffffff"
                        strokeWidth={1.5}
                        style={{ cursor: 'ew-resize' }}
                        data-box-handle="left"
                        data-box-id={box.id}
                      />
                      <rect
                        x={bx + bw - 3}
                        y={by + bodyH / 2 - 14}
                        width={8}
                        height={28}
                        rx={4}
                        fill="#4f46e5"
                        stroke="#ffffff"
                        strokeWidth={1.5}
                        style={{ cursor: 'ew-resize' }}
                        data-box-handle="right"
                        data-box-id={box.id}
                      />
                      <rect
                        x={bx + bw / 2 - 14}
                        y={by - 5}
                        width={28}
                        height={8}
                        rx={4}
                        fill="#0284c7"
                        stroke="#ffffff"
                        strokeWidth={1.5}
                        style={{ cursor: 'ns-resize' }}
                        data-box-handle="top"
                        data-box-id={box.id}
                      />
                      {(box.type === 'wall' || box.type === 'wall-deep') && (
                        <rect
                          x={bx + bw / 2 - 14}
                          y={by + bodyH - 3}
                          width={28}
                          height={8}
                          rx={4}
                          fill="#0284c7"
                          stroke="#ffffff"
                          strokeWidth={1.5}
                          style={{ cursor: 'ns-resize' }}
                          data-box-handle="bottom"
                          data-box-id={box.id}
                        />
                      )}
                    </>
                  )}

                  {(() => {
                    const labelY =
                      box.type === 'base' || box.type === 'fridge'
                        ? floorY + 8
                        : box.type === 'wall'
                        ? by + bodyH + 4
                        : by - 22;
                    return (
                      <g pointerEvents="none">
                        <rect
                          x={bx + bw / 2 - 54}
                          y={labelY}
                          width={108}
                          height={16}
                          rx={4}
                          fill="#ffffff"
                          stroke={isAct ? '#4f46e5' : '#cbd5e1'}
                          strokeWidth={1}
                        />
                        <text
                          x={bx + bw / 2}
                          y={labelY + 11}
                          fontSize={13}
                          fontWeight={800}
                          fill="#1e293b"
                          textAnchor="middle"
                        >
                          {`${box.width}×${box.height} · عمق ${box.depth}`}
                        </text>
                      </g>
                    );
                  })()}
                </g>
              );
            })}

            {/* صفحه رو / تاپس پیوسته روی زمینی‌ها */}
            {countertopSegments.map((seg, idx) => {
              const cx = originX + seg.startCm * s;
              const cw = (seg.endCm - seg.startCm) * s;
              const ch = seg.thicknessCm * s;
              const cy = floorY - seg.topElevCm * s;
              const ctCfg = COUNTERTOP_FINISHES[projectCountertopFinish];
              return (
                <rect
                  key={idx}
                  x={cx - 1}
                  y={cy}
                  width={cw + 2}
                  height={ch}
                  rx={1.5}
                  fill={ctCfg.hex}
                  stroke={tool === 'finish' && hoverFinishTarget === 'countertop' ? '#4f46e5' : ctCfg.veinHex}
                  strokeWidth={tool === 'finish' && hoverFinishTarget === 'countertop' ? 1.8 : 1}
                  data-countertop-zone="true"
                  pointerEvents={tool === 'finish' ? 'auto' : 'none'}
                  style={{ cursor: tool === 'finish' ? 'pointer' : undefined }}
                />
              );
            })}

            {/* خط‌کش فواصل خالی روی دیوار */}
            {gapDimensions.map((g, idx) => {
              const gx1 = originX + g.start * s;
              const gx2 = originX + g.end * s;
              const gy = floorY - 12;
              return (
                <g key={idx} pointerEvents="none" opacity={0.7}>
                  <line x1={gx1 + 2} y1={gy} x2={gx2 - 2} y2={gy} stroke="#64748b" strokeWidth={1} strokeDasharray="3,2" />
                  <text x={(gx1 + gx2) / 2} y={gy - 4} fontSize={13} fontWeight={800} fill="#475569" textAnchor="middle">
                    {g.len < 45 ? `${g.len}cm` : `فضای خالی ${g.len}cm`}
                  </text>
                </g>
              );
            })}

            {/* نواحی کنج */}
            {blockedZones.map((z, idx) => {
              const zx = originX + z.startCm * s;
              const zw = (z.endCm - z.startCm) * s;
              const zElev =
                z.tier === 'lower' ? 0 : z.tier === 'wall-lower' ? 145 : 190;
              const zH = z.tier === 'lower' ? 86 : z.tier === 'wall-lower' ? 75 : 45;
              const zy = floorY - (zElev + zH) * s;
              const heightPx = zH * s;

              return (
                <g key={`${z.cornerKey}_${z.tier}_${idx}`} pointerEvents="none">
                  <rect
                    x={zx}
                    y={zy}
                    width={zw}
                    height={heightPx}
                    fill="url(#corner-hatch)"
                    stroke="#dc2626"
                    strokeWidth={1.4}
                    strokeDasharray="5,3"
                  />
                  <rect
                    x={zx + zw / 2 - 42}
                    y={zy + heightPx / 2 - 11}
                    width={84}
                    height={22}
                    rx={6}
                    fill="rgba(255,255,255,0.92)"
                    stroke="#fca5a5"
                  />
                  <text
                    x={zx + zw / 2}
                    y={zy + heightPx / 2 + 3.5}
                    fontSize={13}
                    fontWeight={800}
                    fill="#b91c1c"
                    textAnchor="middle"
                  >
                    {z.role === 'blind-behind'
                      ? `کنج کور ${z.depthCm}`
                      : `عمق کنج ${z.depthCm}`}
                  </text>
                </g>
              );
            })}

            {/* لوازم آشپزخانه: سینک، گاز، ظرفشویی، لباسشویی و هود */}
            {wall.appliances.map((app: ApplianceItem) => {
              const underBox =
                wall.boxes.find(
                  (b) =>
                    b.type === 'base' &&
                    app.offsetX >= b.offsetX - 5 &&
                    app.offsetX + app.width <= b.offsetX + b.width + 5
                ) || wall.boxes.find((b) => b.type === 'base');
              const topY = underBox
                ? floorY - (underBox.elevY + underBox.height) * s
                : floorY - 86 * s;
              const plinthPx = (underBox?.plinth ?? 10) * s;
              const topPad = (underBox?.countertopCm ?? 4) * s;
              const bodyBotY = floorY - plinthPx;
              const ax = originX + app.offsetX * s;
              const aw = app.width * s;

              const isAppMulti = Boolean(multiSelection?.applianceIds.includes(app.id));
              const isAppSel = app.id === selectedApplianceId || isAppMulti;
              const sModel: SinkModel = app.sinkModel || 'steel-2';
              const rimH = Math.max(1.5, 0.9 * s);
              const faucetH = Math.max(10, 9 * s);
              const apronH = Math.max(topPad + 6 * s, APRON_SINK_DEPTH_CM * s);

              return (
                <g
                  key={app.id}
                  style={{ cursor: tool === 'eraser' ? 'not-allowed' : 'grab' }}
                  data-app-id={app.id}
                  data-app-kind={app.kind}
                >
                  {isAppSel && (
                    <rect
                      x={ax - 2}
                      y={
                        app.kind === 'sink'
                          ? topY - faucetH - 3
                          : app.kind === 'gas'
                          ? topY - 9
                          : topY + topPad
                      }
                      width={aw + 4}
                      height={
                        app.kind === 'sink'
                          ? faucetH + 4 + (sModel === 'ceramic-apron' ? apronH : topPad)
                          : app.kind === 'gas'
                          ? 14
                          : Math.max(18, floorY - 2 - topY - topPad)
                      }
                      rx={4}
                      fill="rgba(79,70,229,0.08)"
                      stroke="#4f46e5"
                      strokeWidth={1.8}
                      strokeDasharray="4,2"
                      pointerEvents="none"
                    />
                  )}
                  {app.kind === 'sink' ? (
                    <>
                      {/* سطح کلیک وسیع و نامرئی روی سینک و شیر */}
                      <rect
                        x={ax}
                        y={topY - faucetH - 2}
                        width={aw}
                        height={faucetH + (sModel === 'ceramic-apron' ? apronH : topPad + 6)}
                        fill="transparent"
                      />
                      {/* پروفیل کم‌ارتفاع و ظریف سینک روی صفحه */}
                      {sModel === 'ceramic-apron' ? (
                        <>
                          <rect
                            x={ax}
                            y={topY - rimH}
                            width={aw}
                            height={rimH}
                            fill="#f8fafc"
                            stroke="#0284c7"
                            strokeWidth={1}
                          />
                          {/* پیش‌آمدگی سرامیکی ۲۰cm با برش درب زیر آن */}
                          <rect
                            x={ax + 1.5}
                            y={topY}
                            width={Math.max(8, aw - 3)}
                            height={apronH}
                            rx={2.5}
                            fill="#ffffff"
                            stroke="#0284c7"
                            strokeWidth={1.5}
                          />
                          <text
                            x={ax + aw / 2}
                            y={topY + apronH * 0.62}
                            fontSize={13}
                            fontWeight={800}
                            fill="#0369a1"
                            textAnchor="middle"
                            pointerEvents="none"
                          >
                            سینک سرامیکی
                          </text>
                        </>
                      ) : (
                        <rect
                          x={ax}
                          y={topY - rimH}
                          width={aw}
                          height={rimH}
                          fill="#0f766e"
                          rx={0.8}
                        />
                      )}
                      {/* شیر آب جمع‌وجور متناسب با ارتفاع */}
                      <path
                        d={`M ${ax + aw * 0.48} ${topY - rimH} L ${ax + aw * 0.48} ${
                          topY - rimH - faucetH * 0.72
                        } C ${ax + aw * 0.48} ${topY - rimH - faucetH}, ${ax + aw * 0.56} ${
                          topY - rimH - faucetH
                        }, ${ax + aw * 0.56} ${topY - rimH - faucetH * 0.58}`}
                        fill="none"
                        stroke={sModel === 'ceramic-apron' ? '#0284c7' : '#0f766e'}
                        strokeWidth={Math.max(1.6, 1.1 * s)}
                        strokeLinecap="round"
                      />
                      {sModel === 'corner-sink' && (
                        <text
                          x={ax + aw / 2}
                          y={topY - rimH - faucetH - 3}
                          fontSize={13}
                          fontWeight={800}
                          fill="#0f766e"
                          textAnchor="middle"
                          pointerEvents="none"
                        >
                          سینک کنج ۹۰°
                        </text>
                      )}
                    </>
                  ) : app.kind === 'gas' ? (
                    <>
                      {/* سطح کلیک وسیع و نامرئی روی گاز صفحه‌ای و هود متصل */}
                      <rect
                        x={ax}
                        y={topY - 18}
                        width={aw}
                        height={28}
                        fill="transparent"
                      />
                      <rect
                        x={ax + aw * 0.08}
                        y={app.hoodKind === 'chimney' ? floorY - 220 * s : floorY - 156 * s}
                        width={aw * 0.84}
                        height={app.hoodKind === 'chimney' ? 74 * s : 22}
                        fill="transparent"
                      />
                      {/* پروفیل بسیار ظریف و کم‌ارتفاع گاز صفحه‌ای */}
                      <rect
                        x={ax}
                        y={topY - Math.max(1.6, 1.1 * s)}
                        width={aw}
                        height={Math.max(1.6, 1.1 * s)}
                        fill="#0f172a"
                        rx={0.8}
                      />
                      <line
                        x1={ax + aw * 0.14}
                        y1={topY - Math.max(2.6, 1.7 * s)}
                        x2={ax + aw * 0.86}
                        y2={topY - Math.max(2.6, 1.7 * s)}
                        stroke="#475569"
                        strokeWidth={1.4}
                        strokeDasharray="6,7"
                      />
                      {isAppSel && (
                        <g pointerEvents="none">
                          <rect
                            x={ax + aw / 2 - 22}
                            y={topY - 20}
                            width={44}
                            height={13}
                            rx={3}
                            fill="#4f46e5"
                          />
                          <text
                            x={ax + aw / 2}
                            y={topY - 11}
                            fontSize={13}
                            fontWeight={800}
                            fill="#ffffff"
                            textAnchor="middle"
                          >
                            {`↔ ${app.width}cm`}
                          </text>
                        </g>
                      )}
                      {app.hoodKind === 'chimney' ? (
                        <path
                          d={`M ${ax + aw * 0.1} ${floorY - 150 * s} L ${ax + aw * 0.9} ${
                            floorY - 150 * s
                          } L ${ax + aw * 0.65} ${floorY - 180 * s} L ${ax + aw * 0.65} ${
                            floorY - 220 * s
                          } L ${ax + aw * 0.35} ${floorY - 220 * s} L ${ax + aw * 0.35} ${
                            floorY - 180 * s
                          } Z`}
                          fill="#cbd5e1"
                          stroke={isAppSel ? '#4f46e5' : '#475569'}
                          strokeWidth={isAppSel ? 1.8 : 1.4}
                        />
                      ) : (
                        <rect
                          x={ax + aw * 0.1}
                          y={floorY - 148 * s}
                          width={aw * 0.8}
                          height={4}
                          fill={isAppSel ? '#4f46e5' : '#475569'}
                          rx={1}
                        />
                      )}
                    </>
                  ) : (
                    // Built-in Dishwasher or Washing machine under continuous countertop flush down to floor (cutting plinth)
                    (() => {
                      const my = topY + topPad + 2;
                      const mh = Math.max(18, floorY - 2 - my);
                      return (
                        <>
                          <rect
                            x={ax + 2}
                            y={my}
                            width={aw - 4}
                            height={mh}
                            rx={3}
                            fill="#eef2ff"
                            stroke="#4338ca"
                            strokeWidth={1.4}
                          />
                          <line x1={ax + 4} y1={my + mh * 0.16} x2={ax + aw - 4} y2={my + mh * 0.16} stroke="#6366f1" strokeWidth={1.2} />
                          {app.kind === 'washing' && (
                            <circle
                              cx={ax + aw / 2}
                              cy={my + mh * 0.58}
                              r={Math.min(aw, mh) * 0.28}
                              fill="#ffffff"
                              stroke="#4338ca"
                              strokeWidth={2}
                            />
                          )}
                          <text
                            x={ax + aw / 2}
                            y={my + mh * (app.kind === 'washing' ? 0.12 : 0.55)}
                            fontSize={13}
                            fontWeight={800}
                            fill="#312e81"
                            textAnchor="middle"
                            pointerEvents="none"
                          >
                            {app.kind === 'dishwasher' ? 'ماشین ظرفشویی' : 'ماشین لباسشویی'}
                          </text>
                        </>
                      );
                    })()
                  )}
                </g>
              );
            })}

            {/* نشانگر زنده فاصله چپ/راست هنگام درگ باکس یا تجهیز */}
            {dragGuides && (
              <g pointerEvents="none">
                <g transform={`translate(${originX + ((dragGuides.itemStart + dragGuides.itemEnd) / 2) * s}, ${floorY - dragGuides.yTopCm * s - 18})`}>
                  <rect x={-64} y={-11} width={128} height={22} rx={6} fill="#0f172a" />
                  <text x={0} y={3.5} fontSize={13} fontWeight={800} fill="#ffffff" textAnchor="middle">
                    {`چپ ${dragGuides.leftGap}cm · راست ${dragGuides.rightGap}cm`}
                  </text>
                </g>
              </g>
            )}

            {/* نقاط داغ دستگیره */}
            {tool === 'handle' &&
              computedSpots.map((sp) => (
                <circle
                  key={sp.spotId}
                  cx={sp.x}
                  cy={sp.y}
                  r={5.5}
                  fill="rgba(79,70,229,0.22)"
                  stroke="#4f46e5"
                  strokeWidth={1.6}
                  style={{ cursor: 'pointer' }}
                  data-hand-spot={sp.spotId}
                />
              ))}

            {/* مستطیل شبح کم‌رنگ دنبال‌کننده موس برای براش درب */}
            {tool === 'doors' && !doorsLocked && cursorPt && !doorPreview && (
              <g pointerEvents="none" opacity={0.45}>
                {(() => {
                  const gw = doorTargetWidth * s;
                  const gh = (doorOrient === 'vertical' ? 72 : 42) * s;
                  const gx = cursorPt.x - gw / 2;
                  const gy = cursorPt.y - gh / 2;
                  const activeDrawerPat = DRAWER_PATTERNS[drawerPatIdx % DRAWER_PATTERNS.length];
                  return (
                    <>
                      <rect
                        x={gx}
                        y={gy}
                        width={gw}
                        height={gh}
                        rx={3}
                        fill="rgba(79,70,229,0.12)"
                        stroke="#4f46e5"
                        strokeWidth={1.4}
                        strokeDasharray="5,3"
                      />
                      {doorOrient === 'horizontal' &&
                        (activeDrawerPat?.drawerBand ? (
                          <line
                            x1={gx}
                            y1={
                              activeDrawerPat.drawerBand.position === 'top'
                                ? gy + gh * activeDrawerPat.drawerBand.ratio
                                : gy + gh * (1 - activeDrawerPat.drawerBand.ratio)
                            }
                            x2={gx + gw}
                            y2={
                              activeDrawerPat.drawerBand.position === 'top'
                                ? gy + gh * activeDrawerPat.drawerBand.ratio
                                : gy + gh * (1 - activeDrawerPat.drawerBand.ratio)
                            }
                            stroke="#4f46e5"
                            strokeWidth={1.3}
                            strokeDasharray="3,2"
                          />
                        ) : (
                          activeDrawerPat?.ratios || [0.33, 0.66]
                        ).map((r, ri) => (
                          <line
                            key={ri}
                            x1={gx}
                            y1={gy + gh * r}
                            x2={gx + gw}
                            y2={gy + gh * r}
                            stroke="#4f46e5"
                            strokeWidth={1}
                            strokeDasharray="3,2"
                          />
                        )))}
                      <text x={cursorPt.x} y={cursorPt.y + 3} fontSize={13} fontWeight={800} fill="#4338ca" textAnchor="middle">
                        {doorOrient === 'vertical'
                          ? `درب ${doorTargetWidth}cm`
                          : `${activeDrawerPat?.shortLabel || 'کشو/افقی'} ${doorTargetWidth}cm`}
                      </text>
                    </>
                  );
                })()}
              </g>
            )}

            {/* پیش‌نمایش شبح زنده تجهیزات در نمای روبرو */}
            {(tool === 'sink' || tool === 'gas' || tool === 'appliance') &&
              appHover &&
              (() => {
                const gx = originX + appHover.offsetX * s;
                const gw = appHover.width * s;
                const topY = floorY - appHover.topElevCm * s;
                const topPad = appHover.countertopCm * s;
                const validStroke = appHover.valid ? '#0f766e' : '#dc2626';
                const validFill = appHover.valid
                  ? 'rgba(15,118,110,0.16)'
                  : 'rgba(220,38,38,0.16)';

                return (
                  <g pointerEvents="none">
                    {appHover.kind === 'sink' ? (
                      <>
                        <rect
                          x={gx}
                          y={topY - 6}
                          width={gw}
                          height={appHover.sinkModel === 'ceramic-apron' ? APRON_SINK_DEPTH_CM * s + 6 : topPad + 6}
                          rx={3}
                          fill={validFill}
                          stroke={validStroke}
                          strokeWidth={1.8}
                          strokeDasharray="5,3"
                        />
                        <text x={gx + gw / 2} y={topY - 10} fontSize={13} fontWeight={800} fill={validStroke} textAnchor="middle">
                          {appHover.valid ? SINK_MODELS[appHover.sinkModel || 'steel-2'].shortLabel : appHover.reason}
                        </text>
                      </>
                    ) : appHover.kind === 'gas' ? (
                      <>
                        <rect
                          x={gx}
                          y={topY - 5}
                          width={gw}
                          height={topPad + 6}
                          rx={2}
                          fill={appHover.valid ? 'rgba(15,23,42,0.18)' : validFill}
                          stroke={appHover.valid ? '#0f172a' : '#dc2626'}
                          strokeWidth={1.8}
                          strokeDasharray="5,3"
                        />
                        <rect
                          x={gx + gw * 0.1}
                          y={floorY - 150 * s}
                          width={gw * 0.8}
                          height={6}
                          fill="rgba(79,70,229,0.25)"
                          stroke="#4f46e5"
                          strokeDasharray="4,2"
                        />
                      </>
                    ) : (
                      <>
                        <rect
                          x={gx + 2}
                          y={topY + topPad + 2}
                          width={gw - 4}
                          height={Math.max(16, floorY - 2 - (topY + topPad + 2))}
                          rx={3}
                          fill={appHover.valid ? 'rgba(67,56,202,0.16)' : validFill}
                          stroke={appHover.valid ? '#4338ca' : '#dc2626'}
                          strokeWidth={1.8}
                          strokeDasharray="5,3"
                        />
                        <text
                          x={gx + gw / 2}
                          y={topY + topPad + (floorY - topY - topPad) * 0.5}
                          fontSize={13}
                          fontWeight={800}
                          fill={appHover.valid ? '#312e81' : '#dc2626'}
                          textAnchor="middle"
                        >
                          {appHover.valid ? APPLIANCE_CONFIGS[appHover.kind].shortLabel : appHover.reason}
                        </text>
                      </>
                    )}
                  </g>
                );
              })()}

            {/* پیش‌نمایش شبح ابزار فریم ۳..۱۱cm */}
            {tool === 'frame' &&
              frameHover &&
              (() => {
                const b = wall.boxes.find((x) => x.id === frameHover.boxId);
                if (!b) return null;
                const bx = originX + b.offsetX * s;
                const bw = b.width * s;
                const bh = b.height * s;
                const by = floorY - b.elevY * s - bh;
                const bodyH = Math.max(14, bh - b.plinth * s);
                const topPad = b.countertopCm * s;
                const fW = frameWidthCm * s;
                const insets = getEffectiveBoxInsets(b);
                const scaleX = Math.max(0.2, (b.width - insets.left - insets.right) / Math.max(1, b.width));

                if (frameHover.side === 'invalid') {
                  return (
                    <g transform={`translate(${bx + bw / 2}, ${by + bodyH * 0.45})`} pointerEvents="none">
                      <rect x={-72} y={-11} width={144} height={22} rx={6} fill="#dc2626" />
                      <text x={0} y={3.5} fontSize={13} fontWeight={800} fill="#ffffff" textAnchor="middle">
                        {frameHover.reason || 'موقعیت غیرمجاز فریم'}
                      </text>
                    </g>
                  );
                }

                let rx = bx;
                let ry = by + topPad;
                let rw = fW;
                let rh = Math.max(8, bodyH - topPad);
                if (frameHover.side === 'right') {
                  rx = bx + bw - fW;
                } else if (frameHover.side === 'top') {
                  rw = bw;
                  rh = fW;
                } else if (frameHover.side === 'bottom') {
                  ry = by + bodyH - fW;
                  rw = bw;
                  rh = fW;
                } else if (frameHover.side === 'seam' && frameHover.seamCm !== undefined) {
                  rx = bx + (insets.left + frameHover.seamCm * scaleX) * s - fW / 2;
                  ry = by + topPad + insets.top * s;
                  rh = Math.max(8, bodyH - topPad - (insets.top + insets.bottom) * s);
                }

                return (
                  <g pointerEvents="none">
                    <rect
                      x={rx}
                      y={ry}
                      width={rw}
                      height={rh}
                      fill="rgba(79,70,229,0.28)"
                      stroke="#4f46e5"
                      strokeWidth={1.8}
                      strokeDasharray="4,2"
                    />
                    <text
                      x={rx + rw / 2}
                      y={ry + rh / 2 + 3}
                      fontSize={13}
                      fontWeight={800}
                      fill="#312e81"
                      textAnchor="middle"
                    >
                      {frameWidthCm}cm
                    </text>
                  </g>
                );
              })()}

            {/* شبح یخچال یا پنجره/درب هنگام حرکت موس در نمای روبرو */}
            {tool === 'fridge' && cursorPt && (
              <g pointerEvents="none" opacity={0.45}>
                {(() => {
                  const cfg = FRIDGE_MODELS[fridgeModel];
                  const fw = (cfg.width + FRIDGE_FRAME_CM * 2) * s;
                  const fh = (cfg.height + FRIDGE_FRAME_CM) * s;
                  return (
                    <rect
                      x={cursorPt.x - fw / 2}
                      y={floorY - fh}
                      width={fw}
                      height={fh}
                      rx={3}
                      fill="rgba(79,70,229,0.14)"
                      stroke="#4f46e5"
                      strokeWidth={1.6}
                      strokeDasharray="5,3"
                    />
                  );
                })()}
              </g>
            )}

            {tool === 'opening' && cursorPt && (
              <g pointerEvents="none" opacity={0.45}>
                {(() => {
                  const def = OPENING_DEFAULTS[openingKind];
                  const ow = def.width * s;
                  const oh = def.height * s;
                  const oy =
                    openingKind === 'window'
                      ? cursorPt.y - oh / 2
                      : floorY - oh;
                  return (
                    <rect
                      x={cursorPt.x - ow / 2}
                      y={oy}
                      width={ow}
                      height={oh}
                      fill="rgba(2,132,199,0.16)"
                      stroke="#0284c7"
                      strokeWidth={1.6}
                      strokeDasharray="5,3"
                    />
                  );
                })()}
              </g>
            )}

            {/* پیش‌نمایش زنده براش درب‌گذاری روی باکس */}
            {doorPreview && (
              <g pointerEvents="none">
                {doorPreview.result.ok ? (
                  doorPreview.result.items.map((it, idx) => {
                    const b = doorPreview.box;
                    const bx = originX + b.offsetX * s;
                    const bh = b.height * s;
                    const by = floorY - b.elevY * s - bh;
                    const bodyH = Math.max(14, bh - b.plinth * s);
                    const topPad = b.countertopCm * s;
                    const px = bx + it.startCm * s + 1.5;
                    const pwPx = Math.max(6, it.widthCm * s - 3);
                    const py = by + topPad + 1.5;
                    const phPx = Math.max(8, bodyH - topPad - 3);
                    const pts =
                      it.drawerRatios.length > 0 ? [0, ...it.drawerRatios, 1] : [0, 1];

                    return (
                      <g key={idx}>
                        <rect
                          x={px}
                          y={py}
                          width={pwPx}
                          height={phPx}
                          rx={3}
                          fill="rgba(79,70,229,0.14)"
                          stroke="#4f46e5"
                          strokeWidth={1.8}
                          strokeDasharray="6,3"
                        />
                        {pts.slice(1, -1).map((r, ri) => (
                          <line
                            key={ri}
                            x1={px}
                            y1={py + phPx * r}
                            x2={px + pwPx}
                            y2={py + phPx * r}
                            stroke="#4f46e5"
                            strokeWidth={1.6}
                            strokeDasharray="4,3"
                          />
                        ))}
                        {it.drawerBand && (
                          <line
                            x1={px}
                            y1={
                              it.drawerBand.position === 'top'
                                ? py + phPx * it.drawerBand.ratio
                                : py + phPx * (1 - it.drawerBand.ratio)
                            }
                            x2={px + pwPx}
                            y2={
                              it.drawerBand.position === 'top'
                                ? py + phPx * it.drawerBand.ratio
                                : py + phPx * (1 - it.drawerBand.ratio)
                            }
                            stroke="#0f766e"
                            strokeWidth={1.8}
                            strokeDasharray="4,3"
                          />
                        )}
                        <text
                          x={px + pwPx / 2}
                          y={py + phPx / 2 + 4}
                          fontSize={13}
                          fontWeight={800}
                          fill="#312e81"
                          textAnchor="middle"
                        >
                          {Math.round(it.widthCm)}cm
                        </text>
                      </g>
                    );
                  })
                ) : (
                  (() => {
                    const b = doorPreview.box;
                    const bx = originX + b.offsetX * s;
                    const bh = b.height * s;
                    const by = floorY - b.elevY * s - bh;
                    return (
                      <g transform={`translate(${bx + (doorHover?.cursorCmInBox || 0) * s}, ${by + 20})`}>
                        <rect x={-56} y={-11} width={112} height={22} rx={6} fill="#dc2626" />
                        <text x={0} y={3.5} fontSize={13} fontWeight={800} fill="#ffffff" textAnchor="middle">
                          غیرمجاز / خارج از بازه
                        </text>
                      </g>
                    );
                  })()
                )}
              </g>
            )}

            {/* پیش‌نمایش مداد یونیت‌بندی و طبقه‌بندی */}
            {(tool === 'pencil' || tool === 'skeleton') &&
              pencilHover &&
              (() => {
                const b = wall.boxes.find((x) => x.id === pencilHover.boxId);
                if (!b) return null;
                const bx = originX + b.offsetX * s;
                const bh = b.height * s;
                const by = floorY - b.elevY * s - bh;
                const bodyH = Math.max(14, bh - b.plinth * s);
                const topPad = b.countertopCm * s;

                if (pencilHover.kind === 'seam' && pencilHover.seamCm !== undefined) {
                  const insets = getEffectiveBoxInsets(b);
                  const scaleX = Math.max(
                    0.2,
                    (b.width - insets.left - insets.right) / Math.max(1, b.width)
                  );
                  const ux = bx + (insets.left + pencilHover.seamCm * scaleX) * s;
                  const rem = pencilHover.hasExistingDivider;
                  return (
                    <g pointerEvents="none">
                      <rect
                        x={ux - tPx}
                        y={by + topPad + insets.top * s}
                        width={tPx * 2}
                        height={Math.max(8, bodyH - topPad - (insets.top + insets.bottom) * s)}
                        fill={rem ? 'rgba(220,38,38,0.28)' : 'rgba(124,58,237,0.35)'}
                        stroke={rem ? '#dc2626' : '#7c3aed'}
                        strokeWidth={2}
                        strokeDasharray={rem ? '4,2' : undefined}
                      />
                    </g>
                  );
                }

                if (pencilHover.kind === 'blocked') {
                  const tx = bx + (pencilHover.cursorCm ?? b.width / 2) * s;
                  const msg =
                    pencilHover.blockedReason?.includes('۲۵') || pencilHover.blockedReason?.includes('25')
                      ? 'حداقل فاصله ۲۵ سانتی‌متر'
                      : pencilHover.blockedReason?.includes('کشو')
                      ? 'کشو طبقه ندارد'
                      : 'ابتدا مرز یونیت را تعیین کنید';
                  return (
                    <g transform={`translate(${tx}, ${by + bodyH * 0.45})`} pointerEvents="none">
                      <rect x={-72} y={-11} width={144} height={22} rx={6} fill="#b45309" />
                      <text x={0} y={3.5} fontSize={13} fontWeight={800} fill="#ffffff" textAnchor="middle">
                        {msg}
                      </text>
                    </g>
                  );
                }

                if (
                  pencilHover.kind === 'shelf' &&
                  pencilHover.startCm !== undefined &&
                  pencilHover.endCm !== undefined
                ) {
                  const sx = bx + pencilHover.startCm * s + tPx;
                  const sw = Math.max(8, (pencilHover.endCm - pencilHover.startCm) * s - tPx * 2);
                  const ratios =
                    shelfCount === 1
                      ? [pencilHover.yRatio ?? 0.5]
                      : Array.from({ length: shelfCount }, (_, i) => (i + 1) / (shelfCount + 1));

                  return (
                    <g pointerEvents="none">
                      {ratios.map((r, i) => (
                        <line
                          key={i}
                          x1={sx}
                          y1={by + topPad + (bodyH - topPad) * r}
                          x2={sx + sw}
                          y2={by + topPad + (bodyH - topPad) * r}
                          stroke="#d97706"
                          strokeWidth={2.5}
                          strokeDasharray="5,3"
                        />
                      ))}
                    </g>
                  );
                }
                return null;
              })()}

            {/* مستطیل انتخاب گروهی (Marquee Box Selection) */}
            {marquee && (
              <rect
                x={Math.min(marquee.startX, marquee.currX)}
                y={Math.min(marquee.startY, marquee.currY)}
                width={Math.abs(marquee.currX - marquee.startX)}
                height={Math.abs(marquee.currY - marquee.startY)}
                fill="rgba(79,70,229,0.12)"
                stroke="#4f46e5"
                strokeWidth={1.6}
                strokeDasharray="5,3"
                pointerEvents="none"
              />
            )}
          </>
        )}
      </svg>

      {hoverClientPt && !dragOp.current && (
        <CursorToolPreview
          visible={true}
          clientX={hoverClientPt.x}
          clientY={hoverClientPt.y}
          tool={tool}
          hoverTarget={hoverFinishTarget}
          targetStatus={frontHoverStatus}
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
          doorBandPos={doorBandPos}
          doorBandRatio={doorBandRatio}
          doorStyleBrush={doorStyleBrush}
          cabinetFinishBrush={cabinetFinishBrush}
          backsplashBrush={backsplashBrush}
          countertopBrush={countertopBrush}
          frameWidthCm={frameWidthCm}
          shelfCount={shelfCount}
          handleStyle={handleStyle}
          handleOrient={handleOrient}
          drawBoxKind={drawBoxKind}
          testId="cursor-preview-2d"
        />
      )}
    </section>
  );
};
