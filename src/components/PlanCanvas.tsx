import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  APPLIANCE_CONFIGS,
  BOX_PRESETS,
  FRIDGE_FRAME_CM,
  FRIDGE_MODELS,
  FRIDGE_MODEL_ORDER,
  GAS_WIDTH_OPTIONS,
  OPENING_DEFAULTS,
  SINK_MODELS,
  SINK_MODEL_ORDER,
} from '../cad/constants';
import {
  analyzeCornerJunction,
  collectSmartWallNodes,
  computeMultiWallSweep,
  detectCornerJunctions,
  getOutsideCornerBridges,
  getPlanPolygonForBox,
  getWallVectors,
  orientEmptyConnectedWallsFromSeed,
  snapWallNodePosition,
  SweepSegment,
  WallNodeRef,
} from '../cad/cornerLogic';
import { createEmptyBox, createWall } from '../cad/doorRules';
import {
  ApplianceKind,
  BoxKind,
  CabinetBox,
  DoorSwing,
  FridgeModel,
  OpeningKind,
  RoomColumn,
  SinkModel,
  ToolId,
  Wall,
} from '../cad/types';
import { deriveFloorPolygon } from '../cad/floorPolygon';
import { CursorTargetStatus, CursorToolPreview } from './CursorToolPreview';
import { PacedGestureStepper } from '../utils/gesturePacing';

const APPLIANCE_ORDER: ApplianceKind[] = ['dishwasher', 'washing'];
const OPENING_ORDER: OpeningKind[] = ['window', 'door', 'column'];
const CAB_DRAW_KIND_ORDER: BoxKind[] = ['base', 'wall', 'wall-deep', 'tall', 'closet'];

interface PlanCanvasProps {
  walls: Wall[];
  columns?: RoomColumn[];
  cornerOwners: Record<string, string>;
  activeWallId: string | null;
  activeBoxId: string | null;
  selectedOpeningId: string | null;
  selectedColumnId?: string | null;
  selectedApplianceId?: string | null;
  tool: ToolId;
  drawBoxKind: BoxKind;
  onDrawBoxKindChange?: (k: BoxKind) => void;
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
  openingSwing: DoorSwing;
  hintText: string;
  onSelectWall: (wallId: string, boxId?: string | null) => void;
  onSelectOpening: (wallId: string, openingId: string) => void;
  onSelectColumn?: (columnId: string | null) => void;
  onSelectAppliance?: (wallId: string, appId: string) => void;
  onAddRoomColumn?: (xCm: number, yCm: number, commit?: boolean) => RoomColumn | void;
  onUpdateRoomColumn?: (
    colId: string,
    patch: Partial<Pick<RoomColumn, 'xCm' | 'yCm' | 'widthCm' | 'depthCm' | 'heightCm'>>,
    commit?: boolean
  ) => void;
  onDeleteRoomColumn?: (colId: string) => void;
  onExitToSelect: () => void;
  onFlipActiveWallSide: () => void;
  onToggleCornerOwner: (cornerKey: string) => void;
  onAddWall: (wall: Wall) => void;
  onMoveWallNode: (refs: WallNodeRef[], x: number, y: number, commit: boolean) => void;
  onMoveWall: (
    wallId: string,
    dxCm: number,
    dyCm: number,
    moveEntireComponent: boolean,
    commit: boolean,
    sessionId?: string
  ) => void;
  onMoveBoxFromPlan: (
    wallId: string,
    boxId: string,
    offsetX: number,
    commit: boolean,
    sessionId?: string
  ) => void;
  onMoveApplianceFromPlan: (
    wallId: string,
    appId: string,
    offsetX: number,
    commit: boolean,
    sessionId?: string
  ) => void;
  onDeleteWall: (wallId: string) => void;
  onDeleteBox: (wallId: string, boxId: string) => void;
  onDeleteAppliance: (wallId: string, appId: string) => void;
  onDeleteOpening: (wallId: string, openingId: string) => void;
  onMoveOpening: (wallId: string, openingId: string, offsetX: number, commit: boolean) => void;
  onCreateBoxesFromSweep: (
    segments: SweepSegment[],
    kind: BoxKind,
    suggestedOwners?: Record<string, string>,
    flipOverrides?: Record<string, 1 | -1>
  ) => void;
  onPlaceApplianceFromPlan: (
    wallId: string,
    boxId: string,
    offsetX: number,
    kindOverride?: ApplianceKind
  ) => void;
  onPlaceFridgeFromPlan: (wallId: string, offsetX: number) => void;
  onPlaceOpeningFromPlan: (wallId: string, offsetX: number) => void;
  onToast: (msg: string) => void;
}

export const PlanCanvas: React.FC<PlanCanvasProps> = ({
  walls,
  columns = [],
  cornerOwners,
  activeWallId,
  activeBoxId,
  selectedOpeningId,
  selectedColumnId = null,
  selectedApplianceId,
  tool,
  drawBoxKind,
  onDrawBoxKindChange,
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
  openingSwing,
  hintText,
  onSelectWall,
  onSelectOpening,
  onSelectColumn,
  onSelectAppliance,
  onAddRoomColumn,
  onUpdateRoomColumn,
  onDeleteRoomColumn,
  onExitToSelect,
  onFlipActiveWallSide,
  onToggleCornerOwner,
  onAddWall,
  onMoveWallNode,
  onMoveWall,
  onMoveBoxFromPlan,
  onMoveApplianceFromPlan,
  onDeleteWall,
  onDeleteBox,
  onDeleteAppliance,
  onDeleteOpening,
  onMoveOpening,
  onCreateBoxesFromSweep,
  onPlaceApplianceFromPlan,
  onPlaceFridgeFromPlan,
  onPlaceOpeningFromPlan,
  onToast,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const paneRef = useRef<HTMLElement | null>(null);

  const [planScale, setPlanScale] = useState(0.6);
  const [pan, setPan] = useState({ x: 0, y: 26 });
  const [wallDraw, setWallDraw] = useState<{
    startPt: { x: number; y: number } | null;
    currPt: { x: number; y: number } | null;
    lengthCm: number;
    snappedCorner: boolean;
  }>({ startPt: null, currPt: null, lengthCm: 0, snappedCorner: false });

  const [cabSweep, setCabSweep] = useState<{
    active: boolean;
    startWallId: string | null;
    startOffsetCm: number;
    hasDragged: boolean;
    flipOverrides: Record<string, 1 | -1>;
    segments: SweepSegment[];
    suggestedOwners: Record<string, string>;
  }>({
    active: false,
    startWallId: null,
    startOffsetCm: 0,
    hasDragged: false,
    flipOverrides: {},
    segments: [],
    suggestedOwners: {},
  });

  const [planHoverWall, setPlanHoverWall] = useState<{
    wallId: string;
    offsetCm: number;
    boxId: string | null;
  } | null>(null);
  const [planHoverClientPt, setPlanHoverClientPt] = useState<{ x: number; y: number } | null>(null);
  const [planHoverFloorCm, setPlanHoverFloorCm] = useState<{ x: number; y: number } | null>(null);
  const [planHoverStatus, setPlanHoverStatus] = useState<CursorTargetStatus>('neutral');
  const gestureStepperRef = useRef(new PacedGestureStepper());

  const dragOp = useRef<
    | { mode: 'pan'; startX: number; startY: number; origX: number; origY: number }
    | {
        mode: 'move-column';
        columnId: string;
        startPtCm: { x: number; y: number };
        origX: number;
        origY: number;
        lastX: number;
        lastY: number;
      }
    | {
        mode: 'move-opening';
        wallId: string;
        openingId: string;
        startPtCm: { x: number; y: number };
        origOffsetX: number;
      }
    | {
        mode: 'move-node';
        refs: WallNodeRef[];
        lastX: number;
        lastY: number;
      }
    | {
        mode: 'move-wall';
        wallId: string;
        startPtCm: { x: number; y: number };
        lastDx: number;
        lastDy: number;
        moveEntireComponent: boolean;
        sessionId: string;
      }
    | {
        mode: 'move-plan-box';
        wallId: string;
        boxId: string;
        angle: number;
        startPtCm: { x: number; y: number };
        origOffsetX: number;
        lastOffsetX: number;
        sessionId: string;
      }
    | {
        mode: 'move-plan-app';
        wallId: string;
        appId: string;
        angle: number;
        startPtCm: { x: number; y: number };
        origOffsetX: number;
        lastOffsetX: number;
        sessionId: string;
      }
    | null
  >(null);

  const activePointersRef = useRef<Set<number>>(new Set());
  const lastMultiTouchMsRef = useRef(0);
  const lastPlaceTapRef = useRef<{ ts: number; x: number; y: number; tool: ToolId } | null>(null);

  const touchPinch = useRef<{
    dist: number;
    midX: number;
    midY: number;
    lastStepY: number;
    overWall: boolean;
    origScale: number;
    origPan: { x: number; y: number };
  } | null>(null);

  const displayWalls = useMemo(() => {
    if (!cabSweep.active || Object.keys(cabSweep.flipOverrides).length === 0) {
      return walls;
    }
    return walls.map((w) =>
      cabSweep.flipOverrides[w.id] ? { ...w, flipSide: cabSweep.flipOverrides[w.id] } : w
    );
  }, [walls, cabSweep.active, cabSweep.flipOverrides]);

  const smartNodes = useMemo(() => collectSmartWallNodes(displayWalls), [displayWalls]);

  const junctions = useMemo(
    () => detectCornerJunctions(displayWalls, cornerOwners),
    [displayWalls, cornerOwners]
  );

  const inside90Junctions = useMemo(() => {
    return junctions
      .map((j) => {
        const wA = displayWalls.find((w) => w.id === j.wallAId);
        const wB = displayWalls.find((w) => w.id === j.wallBId);
        if (!wA || !wB) return null;
        if (analyzeCornerJunction(wA, j.wallAEnd, wB, j.wallBEnd).kind !== 'inside-90') return null;
        const vA = getWallVectors(wA);
        const vB = getWallVectors(wB);
        const bx = vA.nx + vB.nx;
        const by = vA.ny + vB.ny;
        const blen = Math.hypot(bx, by) || 1;
        return {
          ...j,
          btnXCm: j.xCm + (bx / blen) * 28,
          btnYCm: j.yCm + (by / blen) * 28,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [junctions, displayWalls]);

  const outsideBridges = useMemo(
    () => getOutsideCornerBridges(displayWalls, cornerOwners),
    [displayWalls, cornerOwners]
  );

  const clientToCm = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x / planScale, y: svgPt.y / planScale };
  };

  const snapWallPoint = (
    raw: { x: number; y: number },
    startPt: { x: number; y: number } | null
  ) => {
    for (const w of walls) {
      if (Math.hypot(raw.x - w.x1Cm, raw.y - w.y1Cm) < 18) {
        return { x: w.x1Cm, y: w.y1Cm, corner: true };
      }
      if (Math.hypot(raw.x - w.x2Cm, raw.y - w.y2Cm) < 18) {
        return { x: w.x2Cm, y: w.y2Cm, corner: true };
      }
    }
    let sx = Math.round(raw.x / 10) * 10;
    let sy = Math.round(raw.y / 10) * 10;
    if (startPt) {
      const dx = sx - startPt.x;
      const dy = sy - startPt.y;
      if (Math.hypot(dx, dy) > 15) {
        const deg = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
        if (deg < 12 || deg > 168) sy = startPt.y;
        else if (Math.abs(deg - 90) < 12) sx = startPt.x;
      }
    }
    return { x: sx, y: sy, corner: false };
  };

  const projectPointToWalls = (ptCm: { x: number; y: number }, wallList: Wall[] = walls) => {
    let best: { wall: Wall; offsetCm: number; perp: number; signedPerp: number; score: number } | null = null;
    for (const w of wallList) {
      const rad = (w.angle * Math.PI) / 180;
      const ux = Math.cos(rad);
      const uy = Math.sin(rad);
      const vx = ptCm.x - w.x1Cm;
      const vy = ptCm.y - w.y1Cm;
      const proj = vx * ux + vy * uy;
      const signedPerp = -vx * uy + vy * ux;
      const perp = Math.abs(signedPerp);
      if (proj >= -30 && proj <= w.length + 30 && perp < 85) {
        const clamped = Math.max(0, Math.min(w.length, Math.round(proj / 5) * 5));
        const outOfSpanPenalty = proj < 0 ? -proj : proj > w.length ? proj - w.length : 0;
        const score = perp + outOfSpanPenalty * 1.4;
        if (!best || score < best.score) {
          best = { wall: w, offsetCm: clamped, perp, signedPerp, score };
        }
      }
    }
    return best;
  };

  const isSpacedDoublePlacement = (e: React.PointerEvent<SVGSVGElement>, toolId: ToolId): boolean => {
    const now = performance.now();
    if (now - lastMultiTouchMsRef.current < 420 || activePointersRef.current.size > 1) {
      lastPlaceTapRef.current = null;
      return false;
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
    if (e.button === 2) return;
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
      if (cabSweep.active) {
        setCabSweep({
          active: false,
          startWallId: null,
          startOffsetCm: 0,
          hasDragged: false,
          flipOverrides: {},
          segments: [],
          suggestedOwners: {},
        });
      }
      return;
    }
    if (e.button === 1) {
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

    const targetEl = e.target as Element;

    const cornerEl = targetEl.closest('[data-corner-key]');
    if (cornerEl) {
      const key = cornerEl.getAttribute('data-corner-key');
      if (key) {
        onToggleCornerOwner(key);
        return;
      }
    }

    const nodeEl = targetEl.closest('[data-wall-node]');
    if (nodeEl && (tool === 'select' || tool === 'wall') && !wallDraw.startPt) {
      const key = nodeEl.getAttribute('data-wall-node');
      const node = smartNodes.find((n) => n.key === key);
      if (node) {
        e.currentTarget.setPointerCapture(e.pointerId);
        dragOp.current = {
          mode: 'move-node',
          refs: node.refs,
          lastX: node.xCm,
          lastY: node.yCm,
        };
        return;
      }
    }

    const ptCm = clientToCm(e.clientX, e.clientY);

    if (tool === 'wall') {
      const snapped = snapWallPoint(ptCm, wallDraw.startPt);
      if (!wallDraw.startPt) {
        setWallDraw({
          startPt: { x: snapped.x, y: snapped.y },
          currPt: { x: snapped.x, y: snapped.y },
          lengthCm: 0,
          snappedCorner: snapped.corner,
        });
      } else {
        const len = Math.round(
          Math.hypot(snapped.x - wallDraw.startPt.x, snapped.y - wallDraw.startPt.y)
        );
        if (len >= 40) {
          const newW = createWall(
            `دیوار ${walls.length + 1} (${len})`,
            wallDraw.startPt.x,
            wallDraw.startPt.y,
            snapped.x,
            snapped.y,
            1
          );
          onAddWall(newW);
          setWallDraw({
            startPt: { x: snapped.x, y: snapped.y },
            currPt: { x: snapped.x, y: snapped.y },
            lengthCm: 0,
            snappedCorner: false,
          });
        }
      }
      return;
    }

    // Unified priority Eraser in Plan view!
    if (tool === 'eraser') {
      const colEl = targetEl.closest('[data-plan-room-col-id]');
      if (colEl) {
        const colId = colEl.getAttribute('data-plan-room-col-id');
        if (colId) {
          onDeleteRoomColumn?.(colId);
          return;
        }
      }
      const appEl = targetEl.closest('[data-plan-app-id]');
      if (appEl) {
        const aId = appEl.getAttribute('data-plan-app-id');
        const wId = appEl.getAttribute('data-plan-wall-id');
        if (aId && wId) {
          onDeleteAppliance(wId, aId);
          return;
        }
      }
      const openEl = targetEl.closest('[data-plan-opening-id]');
      if (openEl) {
        const oId = openEl.getAttribute('data-plan-opening-id');
        const wId = openEl.getAttribute('data-plan-wall-id');
        if (oId && wId) {
          onDeleteOpening(wId, oId);
          return;
        }
      }
      const boxEl = targetEl.closest('[data-plan-box-id]');
      if (boxEl) {
        const bId = boxEl.getAttribute('data-plan-box-id');
        const wId = boxEl.getAttribute('data-plan-wall-id');
        if (bId && wId) {
          onDeleteBox(wId, bId);
          return;
        }
      }
      const wEl = targetEl.closest('[data-wall-click]');
      if (wEl) {
        const wId = wEl.getAttribute('data-wall-click');
        if (wId) onDeleteWall(wId);
        return;
      }
    }

    // Place Fridge directly in Plan view (spaced double-click/tap required)!
    if (tool === 'fridge') {
      const hit = projectPointToWalls(ptCm, walls);
      if (hit) {
        if (!isSpacedDoublePlacement(e, 'fridge')) return;
        const cfg = FRIDGE_MODELS[fridgeModel];
        onPlaceFridgeFromPlan(hit.wall.id, hit.offsetCm - cfg.width / 2);
        return;
      }
    }

    // Place Sink / Gas / Dishwasher / Washing directly in Plan view (spaced double-click/tap required)!
    if (tool === 'sink' || tool === 'gas' || tool === 'appliance') {
      const hit = projectPointToWalls(ptCm, walls);
      if (hit) {
        if (!isSpacedDoublePlacement(e, tool)) return;
        const targetKind: ApplianceKind =
          tool === 'sink' ? 'sink' : tool === 'gas' ? 'gas' : applianceKind;
        const targetWidth =
          targetKind === 'sink'
            ? SINK_MODELS[sinkModel].width
            : targetKind === 'gas'
            ? gasWidth
            : APPLIANCE_CONFIGS[targetKind].width;
        const baseBox = hit.wall.boxes.find(
          (b) =>
            b.type === 'base' &&
            hit.offsetCm >= b.offsetX - 5 &&
            hit.offsetCm <= b.offsetX + b.width + 5
        );
        if (baseBox) {
          onPlaceApplianceFromPlan(
            hit.wall.id,
            baseBox.id,
            hit.offsetCm - targetWidth / 2,
            targetKind
          );
        } else {
          onToast('روی یک باکس زمینی در پلان دابل‌کلیک کنید');
        }
        return;
      }
    }

    // Check freestanding RoomColumn interaction first before adding a new opening/column
    const preColEl = targetEl.closest('[data-plan-room-col-id]');
    if (preColEl) {
      const colId = preColEl.getAttribute('data-plan-room-col-id');
      const col = columns.find((c) => c.id === colId);
      if (col) {
        onSelectColumn?.(col.id);
        if (tool === 'select' || tool === 'opening') {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragOp.current = {
            mode: 'move-column',
            columnId: col.id,
            startPtCm: ptCm,
            origX: col.xCm,
            origY: col.yCm,
            lastX: col.xCm,
            lastY: col.yCm,
          };
        }
        return;
      }
    }

    // Place Window / Room Door / Column directly in Plan view (or freestanding column on floor)!
    if (tool === 'opening') {
      const hit = projectPointToWalls(ptCm, walls);
      if (hit) {
        if (!isSpacedDoublePlacement(e, 'opening')) return;
        const def = OPENING_DEFAULTS[openingKind];
        onPlaceOpeningFromPlan(hit.wall.id, hit.offsetCm - def.width / 2);
        return;
      }
      if (openingKind === 'column' && onAddRoomColumn) {
        const sx = Math.round(ptCm.x / 5) * 5;
        const sy = Math.round(ptCm.y / 5) * 5;
        onAddRoomColumn(sx, sy, true);
        onToast('ستون آزاد روی کف ثبت شد — برای خروج «تأیید» را بزنید');
        return;
      }
    }

    if (tool === 'cab-draw') {
      const hit = projectPointToWalls(ptCm, walls);
      if (hit) {
        e.currentTarget.setPointerCapture(e.pointerId);

        const flipOverrides: Record<string, 1 | -1> = {};
        let workingWalls = walls;
        if (hit.wall.boxes.length === 0 && Math.abs(hit.signedPerp) >= 3) {
          const desiredFlip: 1 | -1 = hit.signedPerp >= 0 ? 1 : -1;
          if (desiredFlip !== hit.wall.flipSide) {
            const cloned: Wall[] = walls.map((w) => ({ ...w }));
            orientEmptyConnectedWallsFromSeed(cloned, hit.wall.id, desiredFlip);
            cloned.forEach((cw, idx) => {
              if (cw.flipSide !== walls[idx].flipSide) {
                flipOverrides[cw.id] = cw.flipSide;
              }
            });
            workingWalls = cloned;
          }
        }

        const initial = computeMultiWallSweep(
          workingWalls,
          hit.wall.id,
          hit.offsetCm,
          hit.wall.id,
          hit.offsetCm,
          drawBoxKind,
          cornerOwners,
          false
        );

        setCabSweep({
          active: true,
          startWallId: hit.wall.id,
          startOffsetCm: hit.offsetCm,
          hasDragged: false,
          flipOverrides,
          segments: initial.segments,
          suggestedOwners: initial.suggestedOwners,
        });
        return;
      }
    }

    // Select & drag appliance in Plan view
    const appSel = targetEl.closest('[data-plan-app-id]');
    if (appSel) {
      const aId = appSel.getAttribute('data-plan-app-id');
      const wId = appSel.getAttribute('data-plan-wall-id');
      const w = walls.find((x) => x.id === wId);
      const app = w?.appliances.find((a) => a.id === aId);
      if (w && app) {
        onSelectAppliance?.(w.id, app.id);
        if (tool === 'select') {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragOp.current = {
            mode: 'move-plan-app',
            wallId: w.id,
            appId: app.id,
            angle: w.angle,
            startPtCm: ptCm,
            origOffsetX: app.offsetX,
            lastOffsetX: app.offsetX,
            sessionId: `papp_${Date.now()}_${Math.random()}`,
          };
        }
        return;
      }
    }

    // Select & drag opening in Plan view
    const openSel = targetEl.closest('[data-plan-opening-id]');
    if (openSel) {
      const oId = openSel.getAttribute('data-plan-opening-id');
      const wId = openSel.getAttribute('data-plan-wall-id');
      const w = walls.find((x) => x.id === wId);
      const op = w?.openings?.find((o) => o.id === oId);
      if (w && op) {
        onSelectOpening(w.id, op.id);
        if (tool === 'select') {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragOp.current = {
            mode: 'move-opening',
            wallId: w.id,
            openingId: op.id,
            startPtCm: ptCm,
            origOffsetX: op.offsetX,
          };
        }
        return;
      }
    }

    const boxSel = targetEl.closest('[data-plan-box-id]');
    if (boxSel) {
      const bId = boxSel.getAttribute('data-plan-box-id');
      const wId = boxSel.getAttribute('data-plan-wall-id');
      const w = walls.find((x) => x.id === wId);
      const box = w?.boxes.find((b) => b.id === bId);
      if (w && box) {
        onSelectWall(w.id, box.id);
        if (tool === 'select') {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragOp.current = {
            mode: 'move-plan-box',
            wallId: w.id,
            boxId: box.id,
            angle: w.angle,
            startPtCm: ptCm,
            origOffsetX: box.offsetX,
            lastOffsetX: box.offsetX,
            sessionId: `pbox_${Date.now()}_${Math.random()}`,
          };
        }
        return;
      }
    }

    const wEl = targetEl.closest('[data-wall-click]');
    if (wEl) {
      const wId = wEl.getAttribute('data-wall-click');
      if (wId) {
        const w = walls.find((x) => x.id === wId);
        onSelectWall(wId, w?.boxes[0]?.id ?? null);
        if (tool === 'select' && w) {
          e.currentTarget.setPointerCapture(e.pointerId);
          dragOp.current = {
            mode: 'move-wall',
            wallId: w.id,
            startPtCm: ptCm,
            lastDx: 0,
            lastDy: 0,
            moveEntireComponent: e.shiftKey,
            sessionId: `pwall_${Date.now()}_${Math.random()}`,
          };
        }
        return;
      }
    }

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
    setPlanHoverClientPt({ x: e.clientX, y: e.clientY });
    const ptCm = clientToCm(e.clientX, e.clientY);

    if (tool === 'wall' && wallDraw.startPt) {
      const snapped = snapWallPoint(ptCm, wallDraw.startPt);
      setWallDraw((prev) => ({
        ...prev,
        currPt: { x: snapped.x, y: snapped.y },
        snappedCorner: snapped.corner,
        lengthCm: prev.startPt
          ? Math.round(Math.hypot(snapped.x - prev.startPt.x, snapped.y - prev.startPt.y))
          : 0,
      }));
      return;
    }

    if (cabSweep.active && cabSweep.startWallId) {
      const hit = projectPointToWalls(ptCm, displayWalls);
      if (hit) {
        const moved =
          cabSweep.hasDragged ||
          hit.wall.id !== cabSweep.startWallId ||
          Math.abs(hit.offsetCm - cabSweep.startOffsetCm) >= 8;

        const computed = computeMultiWallSweep(
          displayWalls,
          cabSweep.startWallId,
          cabSweep.startOffsetCm,
          hit.wall.id,
          hit.offsetCm,
          drawBoxKind,
          cornerOwners,
          moved
        );
        setCabSweep((prev) => ({
          ...prev,
          hasDragged: moved,
          segments: computed.segments,
          suggestedOwners: computed.suggestedOwners,
        }));
      }
      return;
    }

    const op = dragOp.current;
    if (op) {
      if (op.mode === 'pan') {
        setPan({
          x: op.origX + (e.clientX - op.startX),
          y: op.origY + (e.clientY - op.startY),
        });
      } else if (op.mode === 'move-column') {
        const nx = Math.round((op.origX + (ptCm.x - op.startPtCm.x)) / 5) * 5;
        const ny = Math.round((op.origY + (ptCm.y - op.startPtCm.y)) / 5) * 5;
        if (nx !== op.lastX || ny !== op.lastY) {
          op.lastX = nx;
          op.lastY = ny;
          onUpdateRoomColumn?.(op.columnId, { xCm: nx, yCm: ny }, false);
        }
      } else if (op.mode === 'move-opening') {
        const w = walls.find((x) => x.id === op.wallId);
        if (w) {
          const rad = (w.angle * Math.PI) / 180;
          const deltaProj =
            (ptCm.x - op.startPtCm.x) * Math.cos(rad) +
            (ptCm.y - op.startPtCm.y) * Math.sin(rad);
          onMoveOpening(
            op.wallId,
            op.openingId,
            Math.round((op.origOffsetX + deltaProj) / 5) * 5,
            false
          );
        }
      } else if (op.mode === 'move-node') {
        const snapped = snapWallNodePosition(walls, op.refs, ptCm.x, ptCm.y);
        op.lastX = snapped.x;
        op.lastY = snapped.y;
        onMoveWallNode(op.refs, snapped.x, snapped.y, false);
      } else if (op.mode === 'move-wall') {
        const totalDx = Math.round((ptCm.x - op.startPtCm.x) / 5) * 5;
        const totalDy = Math.round((ptCm.y - op.startPtCm.y) / 5) * 5;
        if (totalDx !== op.lastDx || totalDy !== op.lastDy) {
          op.lastDx = totalDx;
          op.lastDy = totalDy;
          onMoveWall(op.wallId, totalDx, totalDy, op.moveEntireComponent, false, op.sessionId);
        }
      } else if (op.mode === 'move-plan-box') {
        const rad = (op.angle * Math.PI) / 180;
        const deltaProj =
          (ptCm.x - op.startPtCm.x) * Math.cos(rad) +
          (ptCm.y - op.startPtCm.y) * Math.sin(rad);
        const target = Math.round((op.origOffsetX + deltaProj) / 5) * 5;
        op.lastOffsetX = target;
        onMoveBoxFromPlan(op.wallId, op.boxId, target, false, op.sessionId);
      } else if (op.mode === 'move-plan-app') {
        const rad = (op.angle * Math.PI) / 180;
        const deltaProj =
          (ptCm.x - op.startPtCm.x) * Math.cos(rad) +
          (ptCm.y - op.startPtCm.y) * Math.sin(rad);
        const target = Math.round((op.origOffsetX + deltaProj) / 5) * 5;
        op.lastOffsetX = target;
        onMoveApplianceFromPlan(op.wallId, op.appId, target, false, op.sessionId);
      }
      return;
    }

    // Hover ghost previews and valid-target detection in Plan view
    if (
      tool === 'fridge' ||
      tool === 'sink' ||
      tool === 'gas' ||
      tool === 'appliance' ||
      tool === 'opening' ||
      tool === 'cab-draw' ||
      tool === 'wall'
    ) {
      const hit = projectPointToWalls(ptCm, walls);
      if (hit) {
        setPlanHoverFloorCm(null);
        const box = hit.wall.boxes.find(
          (b) =>
            b.type === 'base' &&
            hit.offsetCm >= b.offsetX - 5 &&
            hit.offsetCm <= b.offsetX + b.width + 5
        );
        setPlanHoverWall({
          wallId: hit.wall.id,
          offsetCm: hit.offsetCm,
          boxId: box?.id ?? null,
        });
        if (tool === 'sink' || tool === 'gas' || tool === 'appliance') {
          setPlanHoverStatus(box ? 'valid' : 'invalid');
        } else {
          setPlanHoverStatus('valid');
        }
      } else {
        setPlanHoverWall(null);
        if (tool === 'opening' && openingKind === 'column') {
          setPlanHoverFloorCm({
            x: Math.round(ptCm.x / 5) * 5,
            y: Math.round(ptCm.y / 5) * 5,
          });
          setPlanHoverStatus('valid');
        } else {
          setPlanHoverFloorCm(null);
          setPlanHoverStatus(tool === 'wall' ? 'valid' : 'neutral');
        }
      }
    } else {
      if (planHoverWall) setPlanHoverWall(null);
      if (planHoverFloorCm) setPlanHoverFloorCm(null);
      setPlanHoverStatus('neutral');
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    activePointersRef.current.delete(e.pointerId);
    if (cabSweep.active) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      const valid = cabSweep.hasDragged ? cabSweep.segments.filter((seg) => seg.widthCm >= 30) : [];
      const owners = cabSweep.suggestedOwners;
      const flips = cabSweep.flipOverrides;
      setCabSweep({
        active: false,
        startWallId: null,
        startOffsetCm: 0,
        hasDragged: false,
        flipOverrides: {},
        segments: [],
        suggestedOwners: {},
      });
      if (valid.length) {
        onCreateBoxesFromSweep(valid, drawBoxKind, owners, flips);
      }
      return;
    }

    if (dragOp.current) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      const op = dragOp.current;
      dragOp.current = null;
      if (op.mode === 'move-column') {
        if (op.lastX !== op.origX || op.lastY !== op.origY) {
          onUpdateRoomColumn?.(op.columnId, { xCm: op.lastX, yCm: op.lastY }, true);
        }
      } else if (op.mode === 'move-opening') {
        onMoveOpening(op.wallId, op.openingId, -1, true);
      } else if (op.mode === 'move-node') {
        onMoveWallNode(op.refs, op.lastX, op.lastY, true);
      } else if (op.mode === 'move-wall') {
        if (op.lastDx !== 0 || op.lastDy !== 0) {
          onMoveWall(op.wallId, op.lastDx, op.lastDy, op.moveEntireComponent, true, op.sessionId);
        }
      } else if (op.mode === 'move-plan-box') {
        if (op.lastOffsetX !== op.origOffsetX) {
          onMoveBoxFromPlan(op.wallId, op.boxId, op.lastOffsetX, true, op.sessionId);
        }
      } else if (op.mode === 'move-plan-app') {
        if (op.lastOffsetX !== op.origOffsetX) {
          onMoveApplianceFromPlan(op.wallId, op.appId, op.lastOffsetX, true, op.sessionId);
        }
      }
    }
  };

  const handleTouchStart = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length >= 2) {
      lastMultiTouchMsRef.current = performance.now();
      lastPlaceTapRef.current = null;
      dragOp.current = null;
      gestureStepperRef.current.resetTouch();
      if (cabSweep.active) {
        setCabSweep({
          active: false,
          startWallId: null,
          startOffsetCm: 0,
          hasDragged: false,
          flipOverrides: {},
          segments: [],
          suggestedOwners: {},
        });
      }
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const hit = projectPointToWalls(clientToCm(midX, midY), walls);
      touchPinch.current = {
        dist: Math.hypot(dx, dy),
        midX,
        midY,
        lastStepY: midY,
        overWall: Boolean(hit),
        origScale: planScale,
        origPan: { ...pan },
      };
    }
  };

  const wheelHandlerRef = useRef<(e: WheelEvent) => void>(() => {});
  const touchMoveHandlerRef = useRef<(e: TouchEvent) => void>(() => {});

  const stepPlanToolOption = (dir: number): boolean => {
    if (tool === 'cab-draw' && onDrawBoxKindChange) {
      const idx = Math.max(0, CAB_DRAW_KIND_ORDER.indexOf(drawBoxKind));
      const next =
        CAB_DRAW_KIND_ORDER[
          (idx + (dir > 0 ? 1 : CAB_DRAW_KIND_ORDER.length - 1)) % CAB_DRAW_KIND_ORDER.length
        ];
      onDrawBoxKindChange(next);
      onToast(`مدل باکس: ${BOX_PRESETS[next].name}`);
      return true;
    }
    if (tool === 'fridge') {
      const idx = FRIDGE_MODEL_ORDER.indexOf(fridgeModel);
      const next = FRIDGE_MODEL_ORDER[(idx + (dir > 0 ? 1 : FRIDGE_MODEL_ORDER.length - 1)) % FRIDGE_MODEL_ORDER.length];
      onFridgeModelChange(next);
      return true;
    }
    if (tool === 'sink') {
      const idx = SINK_MODEL_ORDER.indexOf(sinkModel);
      const next = SINK_MODEL_ORDER[(idx + (dir > 0 ? 1 : SINK_MODEL_ORDER.length - 1)) % SINK_MODEL_ORDER.length];
      onSinkModelChange(next);
      return true;
    }
    if (tool === 'gas') {
      const widths = [...GAS_WIDTH_OPTIONS];
      const idx = Math.max(0, widths.indexOf(gasWidth as (typeof GAS_WIDTH_OPTIONS)[number]));
      const next = widths[(idx + (dir > 0 ? 1 : widths.length - 1)) % widths.length];
      onGasWidthChange(next);
      return true;
    }
    if (tool === 'appliance') {
      const idx = Math.max(0, APPLIANCE_ORDER.indexOf(applianceKind));
      const next = APPLIANCE_ORDER[(idx + (dir > 0 ? 1 : APPLIANCE_ORDER.length - 1)) % APPLIANCE_ORDER.length];
      onApplianceKindChange(next);
      return true;
    }
    if (tool === 'opening') {
      const idx = OPENING_ORDER.indexOf(openingKind);
      const next = OPENING_ORDER[(idx + (dir > 0 ? 1 : OPENING_ORDER.length - 1)) % OPENING_ORDER.length];
      onOpeningKindChange(next);
      return true;
    }
    return false;
  };

  wheelHandlerRef.current = (e: WheelEvent) => {
    e.preventDefault();
    const isPlanCyclableTool =
      tool === 'cab-draw' ||
      tool === 'fridge' ||
      tool === 'sink' ||
      tool === 'gas' ||
      tool === 'appliance' ||
      tool === 'opening';

    if (!e.ctrlKey && isPlanCyclableTool) {
      setPlanHoverClientPt({ x: e.clientX, y: e.clientY });
      const pacedDir = gestureStepperRef.current.consumeWheelDelta(e.deltaY, e.deltaMode);
      if (pacedDir !== 0) {
        stepPlanToolOption(pacedDir);
      }
      return;
    }

    setPlanScale((v) =>
      +Math.max(0.3, Math.min(1.8, v + (e.deltaY < 0 ? 0.06 : -0.06))).toFixed(2)
    );
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
      const isPlanCyclableTool =
        tool === 'cab-draw' ||
        tool === 'fridge' ||
        tool === 'sink' ||
        tool === 'gas' ||
        tool === 'appliance' ||
        tool === 'opening';
      if (distDelta <= 22 && isPlanCyclableTool) {
        setPlanHoverClientPt({ x: midX, y: midY });
        const stepDelta = midY - touchPinch.current.lastStepY;
        touchPinch.current.lastStepY = midY;
        const pacedDir = gestureStepperRef.current.consumeTouchDelta(stepDelta);
        if (pacedDir !== 0) {
          stepPlanToolOption(pacedDir);
        }
        return;
      }
      const ratio = dist / Math.max(10, touchPinch.current.dist);
      setPlanScale(
        +Math.max(0.3, Math.min(1.8, touchPinch.current.origScale * ratio)).toFixed(2)
      );
      setPan({
        x: touchPinch.current.origPan.x + (midX - touchPinch.current.midX),
        y: touchPinch.current.origPan.y + (midY - touchPinch.current.midY),
      });
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

  const pw = paneRef.current?.clientWidth || 900;
  const ph = paneRef.current?.clientHeight || 240;
  const viewBox = `${-pw / 2 - pan.x} ${-ph / 2 - pan.y} ${pw} ${ph}`;
  const s = planScale;

  const sweepPreviewData = useMemo(() => {
    if (!cabSweep.active || !cabSweep.segments.length) return null;
    const dummyMap = new Map<string, CabinetBox>();
    const tempWalls: Wall[] = displayWalls.map((w) => {
      const segs = cabSweep.segments.filter((seg) => seg.wallId === w.id);
      if (!segs.length) return w;
      const added = segs.map((seg, i) => {
        const d = createEmptyBox(drawBoxKind, seg.startCm, seg.widthCm);
        d.id = `preview_${w.id}_${i}`;
        dummyMap.set(d.id, d);
        return d;
      });
      return { ...w, boxes: [...w.boxes, ...added] };
    });

    const mergedOwners = { ...cornerOwners, ...cabSweep.suggestedOwners };
    const polys: Array<{ key: string; points: Array<{ x: number; y: number }> }> = [];
    for (const tw of tempWalls) {
      for (const b of tw.boxes) {
        if (!dummyMap.has(b.id)) continue;
        const pts = getPlanPolygonForBox(b, tw, tempWalls, mergedOwners);
        if (pts.length >= 3) polys.push({ key: b.id, points: pts });
      }
    }

    const previewBridges = getOutsideCornerBridges(tempWalls, mergedOwners);
    return { polys, previewBridges };
  }, [cabSweep.active, cabSweep.segments, cabSweep.suggestedOwners, displayWalls, drawBoxKind, cornerOwners]);

  return (
    <section
      ref={paneRef}
      className="relative h-full w-full plan-grid overflow-hidden select-none"
      aria-label="نمای پلان دو‌بعدی"
    >
      <div className="absolute top-2 inset-x-2.5 z-15 flex flex-wrap items-center justify-between gap-1.5 pointer-events-none">
        <div className="pointer-events-auto bg-white/95 border border-slate-300 rounded-lg px-2.5 py-1 text-[13px] font-bold text-slate-700 max-w-full sm:max-w-[58%] truncate">
          {hintText}
        </div>

        <div className="pointer-events-auto flex items-center gap-1 mr-auto">
          {tool === 'wall' && wallDraw.startPt && (
            <button
              type="button"
              onClick={() => {
                setWallDraw({ startPt: null, currPt: null, lengthCm: 0, snappedCorner: false });
                onToast('رسم دیوار متوقف شد');
              }}
              className="h-7 px-2.5 rounded-md bg-amber-100 border border-amber-400 text-amber-900 text-[13px] font-bold"
            >
              پایان دیوار
            </button>
          )}
          <button
            type="button"
            onClick={onFlipActiveWallSide}
            className="h-7 px-2 rounded-md bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-[13px] font-bold"
          >
            ⇄ چرخش نما
          </button>
          <button
            type="button"
            onClick={() => setPlanScale((v) => +Math.max(0.3, v - 0.1).toFixed(2))}
            aria-label="کوچک‌نمایی پلان"
            className="h-7 w-7 rounded-md bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-[13px] font-bold"
          >
            -
          </button>
          <button
            type="button"
            onClick={() => {
              setPan({ x: 0, y: 26 });
              setPlanScale(0.6);
            }}
            className="h-7 px-2 rounded-md bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-[13px] font-bold"
          >
            مرکز
          </button>
          <button
            type="button"
            onClick={() => setPlanScale((v) => +Math.min(1.8, v + 0.1).toFixed(2))}
            aria-label="بزرگ‌نمایی پلان"
            className="h-7 w-7 rounded-md bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-[13px] font-bold"
          >
            +
          </button>
        </div>
      </div>

      {walls.length === 0 && !wallDraw.startPt && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="bg-white/95 border border-dashed border-slate-400 rounded-xl px-5 py-3 text-center text-slate-600 text-[13px] font-bold leading-relaxed">
            صفحه خالی است — ابزار <b>«دیوار»</b> را بزنید یا از بخش پروژه‌ها یک طرح آماده باز کنید
          </div>
        </div>
      )}

      <svg
        ref={svgRef}
        data-testid="plan-svg"
        viewBox={viewBox}
        className="w-full h-full block touch-none"
        onContextMenu={(e) => {
          e.preventDefault();
          dragOp.current = null;
          if (wallDraw.startPt) {
            setWallDraw({ startPt: null, currPt: null, lengthCm: 0, snappedCorner: false });
          }
          if (cabSweep.active) {
            setCabSweep({
              active: false,
              startWallId: null,
              startOffsetCm: 0,
              hasDragged: false,
              flipOverrides: {},
              segments: [],
              suggestedOwners: {},
            });
          }
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
          setPlanHoverWall(null);
          setPlanHoverFloorCm(null);
          setPlanHoverClientPt(null);
          setPlanHoverStatus('neutral');
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
          <pattern id="plan-room-tiles" x={0} y={0} width={100 * s} height={100 * s} patternUnits="userSpaceOnUse">
            <rect width={100 * s} height={100 * s} fill="#ffffff" stroke="#d9dddf" strokeWidth={Math.max(0.7, s * 0.4)} />
          </pattern>
        </defs>
        {deriveFloorPolygon(displayWalls).length >= 3 && (
          <polygon
            data-testid="plan-room-floor"
            pointerEvents="none"
            points={deriveFloorPolygon(displayWalls).map(pt => `${pt.x * s},${pt.y * s}`).join(' ')}
            fill="url(#plan-room-tiles)"
            stroke="#cbd5e1"
            strokeWidth={1}
          />
        )}
        {outsideBridges
          .filter((br) => !br.isWallCab)
          .map((br) => (
            <polygon
              key={br.key}
              points={br.points.map((p) => `${p.x * s},${p.y * s}`).join(' ')}
              fill="rgba(99,102,241,0.12)"
              stroke="#64748b"
              strokeWidth={1.1}
            />
          ))}

        {/* باکس‌های زمینی/قدی/یخچال */}
        {displayWalls.map((w) => {
          const isAct = w.id === activeWallId;
          return w.boxes
            .filter((b) => b.type !== 'wall' && b.type !== 'wall-deep')
            .map((b) => {
              const pts = getPlanPolygonForBox(b, w, displayWalls, cornerOwners);
              if (pts.length < 3) return null;
              const isBoxAct = isAct && b.id === activeBoxId;
              return (
                <polygon
                  key={b.id}
                  data-plan-box-id={b.id}
                  data-plan-wall-id={w.id}
                  style={{ cursor: tool === 'eraser' ? 'not-allowed' : 'pointer' }}
                  points={pts.map((p) => `${p.x * s},${p.y * s}`).join(' ')}
                  fill={
                    b.type === 'fridge'
                      ? 'rgba(100,116,139,0.22)'
                      : isBoxAct
                      ? 'rgba(79,70,229,0.22)'
                      : 'rgba(99,102,241,0.12)'
                  }
                  stroke={isBoxAct ? '#4f46e5' : '#64748b'}
                  strokeWidth={isBoxAct ? 1.8 : 1.2}
                />
              );
            });
        })}

        {/* باکس‌های هوایی */}
        {displayWalls.map((w) => {
          const isAct = w.id === activeWallId;
          return w.boxes
            .filter((b) => b.type === 'wall' || b.type === 'wall-deep')
            .map((b) => {
              const pts = getPlanPolygonForBox(b, w, displayWalls, cornerOwners);
              if (pts.length < 3) return null;
              const isBoxAct = isAct && b.id === activeBoxId;
              return (
                <polygon
                  key={b.id}
                  data-plan-box-id={b.id}
                  data-plan-wall-id={w.id}
                  style={{ cursor: tool === 'eraser' ? 'not-allowed' : 'pointer' }}
                  points={pts.map((p) => `${p.x * s},${p.y * s}`).join(' ')}
                  fill="rgba(14,165,233,0.12)"
                  stroke="#0284c7"
                  strokeWidth={isBoxAct ? 1.8 : 1.2}
                  strokeDasharray="4,3"
                />
              );
            });
        })}

        {/* دیوارها، بازشوها (پنجره، درب، ستون)، لوازم و برچسب‌ها */}
        {displayWalls.map((w) => {
          const isAct = w.id === activeWallId;
          const wLen = w.length * s;
          const wallThick = 11;
          const flip = w.flipSide || 1;
          const wallY = flip === 1 ? -wallThick : 0;
          const midX = wLen / 2;
          const openings = w.openings || [];

          return (
            <g key={w.id} transform={`translate(${w.x1Cm * s}, ${w.y1Cm * s}) rotate(${w.angle})`}>
              <g
                style={{
                  cursor:
                    tool === 'select' ? 'move' : tool === 'eraser' ? 'not-allowed' : 'pointer',
                }}
                data-wall-click={w.id}
              >
                <rect
                  x={-5}
                  y={wallY - 7}
                  width={wLen + 10}
                  height={wallThick + 14}
                  fill="transparent"
                />
                <rect
                  x={-5}
                  y={wallY}
                  width={wLen + 10}
                  height={wallThick}
                  fill={isAct ? '#1e293b' : '#94a3b8'}
                  rx={3}
                />
              </g>

              {/* پنجره‌ها، درب‌های اتاق و ستون‌ها روی دیوار */}
              {openings.map((op) => {
                const ox = op.offsetX * s;
                const ow = op.width * s;
                const isOpSel = op.id === selectedOpeningId;

                if (op.kind === 'window') {
                  return (
                    <g
                      key={op.id}
                      data-plan-opening-id={op.id}
                      data-plan-wall-id={w.id}
                      style={{ cursor: tool === 'eraser' ? 'not-allowed' : 'move' }}
                    >
                      <rect
                        x={ox}
                        y={wallY - 1}
                        width={ow}
                        height={wallThick + 2}
                        fill="#e0f2fe"
                        stroke={isOpSel ? '#4f46e5' : '#0284c7'}
                        strokeWidth={isOpSel ? 2 : 1.4}
                      />
                      <line
                        x1={ox + 2}
                        y1={wallY + wallThick / 2}
                        x2={ox + ow - 2}
                        y2={wallY + wallThick / 2}
                        stroke="#0369a1"
                        strokeWidth={1.3}
                      />
                    </g>
                  );
                }

                if (op.kind === 'column') {
                  const cd = (op.depthCm ?? 35) * s;
                  const cy = flip === 1 ? 0 : -cd;
                  return (
                    <g
                      key={op.id}
                      data-plan-opening-id={op.id}
                      data-plan-wall-id={w.id}
                      style={{ cursor: tool === 'eraser' ? 'not-allowed' : 'move' }}
                    >
                      <rect
                        x={ox}
                        y={cy}
                        width={ow}
                        height={cd}
                        fill="#475569"
                        stroke={isOpSel ? '#4f46e5' : '#0f172a'}
                        strokeWidth={isOpSel ? 2 : 1.4}
                      />
                      <line x1={ox} y1={cy} x2={ox + ow} y2={cy + cd} stroke="#cbd5e1" strokeWidth={1} />
                      <line x1={ox + ow} y1={cy} x2={ox} y2={cy + cd} stroke="#cbd5e1" strokeWidth={1} />
                    </g>
                  );
                }

                // Doorway with architectural 90° swing arc
                const swing = op.swingDir || 'left-in';
                const inwardSign = flip === 1 ? 1 : -1;
                const swingsOut = swing.endsWith('-out');
                const dirSign = swingsOut ? -inwardSign : inwardSign;
                const hingeLeft = swing.startsWith('left');
                const hx = hingeLeft ? ox : ox + ow;
                const hy = dirSign > 0 ? 0 : wallY;
                const lx = hx;
                const ly = hy + dirSign * ow;
                const ex = hingeLeft ? ox + ow : ox;
                const ey = hy;
                const sweepFlag =
                  (hingeLeft && dirSign > 0) || (!hingeLeft && dirSign < 0) ? 0 : 1;

                return (
                  <g
                    key={op.id}
                    data-plan-opening-id={op.id}
                    data-plan-wall-id={w.id}
                    style={{ cursor: tool === 'eraser' ? 'not-allowed' : 'move' }}
                  >
                    <rect
                      x={ox}
                      y={wallY - 1}
                      width={ow}
                      height={wallThick + 2}
                      fill="#ffffff"
                      stroke={isOpSel ? '#4f46e5' : '#94a3b8'}
                      strokeWidth={isOpSel ? 1.8 : 1}
                    />
                    <line
                      x1={hx}
                      y1={hy}
                      x2={lx}
                      y2={ly}
                      stroke={isOpSel ? '#4f46e5' : '#0f172a'}
                      strokeWidth={2}
                    />
                    <path
                      d={`M ${lx} ${ly} A ${ow} ${ow} 0 0 ${sweepFlag} ${ex} ${ey}`}
                      fill="none"
                      stroke={isOpSel ? '#4f46e5' : '#64748b'}
                      strokeWidth={1.2}
                      strokeDasharray="3,2"
                    />
                  </g>
                );
              })}

              {/* فریم‌های یخچال (۵cm) و فریم‌های جانبی باکس در پلان */}
              {w.boxes.map((b) => {
                const bx = b.offsetX * s;
                const bw = b.width * s;
                const bd = b.depth * s;
                const byBox = flip === 1 ? 0 : -bd;
                const leftF =
                  b.type === 'fridge' && b.hasFridgeFrame
                    ? FRIDGE_FRAME_CM
                    : b.frames?.find((f) => f.side === 'left')?.widthCm || 0;
                const rightF =
                  b.type === 'fridge' && b.hasFridgeFrame
                    ? FRIDGE_FRAME_CM
                    : b.frames?.find((f) => f.side === 'right')?.widthCm || 0;
                if (leftF <= 0 && rightF <= 0) return null;
                return (
                  <g key={`pfr_${b.id}`} pointerEvents="none">
                    {leftF > 0 && (
                      <rect
                        x={bx}
                        y={byBox}
                        width={leftF * s}
                        height={bd}
                        fill="rgba(71,85,105,0.55)"
                      />
                    )}
                    {rightF > 0 && (
                      <rect
                        x={bx + bw - rightF * s}
                        y={byBox}
                        width={rightF * s}
                        height={bd}
                        fill="rgba(71,85,105,0.55)"
                      />
                    )}
                  </g>
                );
              })}

              {/* لوازم آشپزخانه روی پلان با جزئیات مدل‌های سینک، گاز و هود */}
              {w.appliances.map((app) => {
                const ax = app.offsetX * s;
                const aw = app.width * s;
                const ad = (app.kind === 'dishwasher' || app.kind === 'washing' ? 54 : 46) * s;
                const isCeramic = app.kind === 'sink' && app.sinkModel === 'ceramic-apron';
                const ceramicExtra = isCeramic ? 5 * s : 0;
                const ay = flip === 1 ? 6 * s : -(ad + 6 * s + ceramicExtra);
                const isAppSel = app.id === selectedApplianceId;
                const sModel: SinkModel = app.sinkModel || 'steel-2';
                const cRight = app.cornerSide === 'right';
                const cornerPolyPts =
                  flip === 1
                    ? cRight
                      ? `${ax},${ay} ${ax + aw},${ay} ${ax + aw},${ay + ad * 1.15} ${ax + aw * 0.45},${ay + ad * 1.15} ${ax},${ay + ad * 0.55}`
                      : `${ax},${ay} ${ax + aw},${ay} ${ax + aw},${ay + ad * 0.55} ${ax + aw * 0.55},${ay + ad * 1.15} ${ax},${ay + ad * 1.15}`
                    : cRight
                    ? `${ax},${ay + ad} ${ax + aw},${ay + ad} ${ax + aw},${ay - ad * 0.15} ${ax + aw * 0.45},${ay - ad * 0.15} ${ax},${ay + ad * 0.45}`
                    : `${ax},${ay + ad} ${ax + aw},${ay + ad} ${ax + aw},${ay + ad * 0.45} ${ax + aw * 0.55},${ay - ad * 0.15} ${ax},${ay - ad * 0.15}`;

                return (
                  <g
                    key={app.id}
                    data-plan-app-id={app.id}
                    data-plan-wall-id={w.id}
                    style={{
                      cursor:
                        tool === 'eraser' ? 'not-allowed' : tool === 'select' ? 'grab' : 'pointer',
                    }}
                  >
                    {app.kind === 'sink' ? (
                      <>
                        {sModel === 'corner-sink' ? (
                          <polygon
                            points={cornerPolyPts}
                            fill="#ccfbf1"
                            stroke={isAppSel ? '#4f46e5' : '#0f766e'}
                            strokeWidth={isAppSel ? 2.2 : 1.4}
                          />
                        ) : (
                          <rect
                            x={ax}
                            y={ay}
                            width={aw}
                            height={ad + ceramicExtra}
                            rx={isCeramic ? 2 : 3}
                            fill={isCeramic ? '#ffffff' : '#ccfbf1'}
                            stroke={isAppSel ? '#4f46e5' : isCeramic ? '#0284c7' : '#0f766e'}
                            strokeWidth={isAppSel ? 2.2 : 1.4}
                          />
                        )}

                        {/* لگن‌ها و سینی مدل‌های مختلف سینک */}
                        {sModel === 'steel-1' && (
                          <rect
                            x={ax + aw * 0.14}
                            y={ay + ad * 0.16}
                            width={aw * 0.72}
                            height={ad * 0.68}
                            rx={2}
                            fill="#99f6e4"
                            stroke="#0f766e"
                            strokeWidth={0.9}
                          />
                        )}
                        {(sModel === 'steel-2' || sModel === 'corner-sink') && (
                          <>
                            <rect
                              x={ax + aw * 0.08}
                              y={ay + ad * 0.16}
                              width={aw * 0.39}
                              height={ad * 0.68}
                              rx={2}
                              fill="#99f6e4"
                              stroke="#0f766e"
                              strokeWidth={0.9}
                            />
                            <rect
                              x={ax + aw * 0.53}
                              y={ay + ad * 0.16}
                              width={aw * 0.39}
                              height={ad * 0.68}
                              rx={2}
                              fill="#99f6e4"
                              stroke="#0f766e"
                              strokeWidth={0.9}
                            />
                          </>
                        )}
                        {sModel === 'steel-tray-right' && (
                          <>
                            <rect
                              x={ax + aw * 0.07}
                              y={ay + ad * 0.16}
                              width={aw * 0.42}
                              height={ad * 0.68}
                              rx={2}
                              fill="#99f6e4"
                              stroke="#0f766e"
                              strokeWidth={0.9}
                            />
                            {[0.28, 0.44, 0.6, 0.76].map((ry) => (
                              <line
                                key={ry}
                                x1={ax + aw * 0.54}
                                y1={ay + ad * ry}
                                x2={ax + aw * 0.92}
                                y2={ay + ad * ry}
                                stroke="#0f766e"
                                strokeWidth={0.8}
                              />
                            ))}
                          </>
                        )}
                        {sModel === 'steel-tray-left' && (
                          <>
                            <rect
                              x={ax + aw * 0.51}
                              y={ay + ad * 0.16}
                              width={aw * 0.42}
                              height={ad * 0.68}
                              rx={2}
                              fill="#99f6e4"
                              stroke="#0f766e"
                              strokeWidth={0.9}
                            />
                            {[0.28, 0.44, 0.6, 0.76].map((ry) => (
                              <line
                                key={ry}
                                x1={ax + aw * 0.08}
                                y1={ay + ad * ry}
                                x2={ax + aw * 0.46}
                                y2={ay + ad * ry}
                                stroke="#0f766e"
                                strokeWidth={0.8}
                              />
                            ))}
                          </>
                        )}
                        {isCeramic && (
                          <>
                            <rect
                              x={ax + aw * 0.1}
                              y={ay + ad * 0.14}
                              width={aw * 0.8}
                              height={ad * 0.74}
                              rx={2}
                              fill="#f1f5f9"
                              stroke="#0284c7"
                              strokeWidth={1}
                            />
                            <line
                              x1={ax + 2}
                              y1={flip === 1 ? ay + ad + ceramicExtra - 1.5 : ay + 1.5}
                              x2={ax + aw - 2}
                              y2={flip === 1 ? ay + ad + ceramicExtra - 1.5 : ay + 1.5}
                              stroke="#0369a1"
                              strokeWidth={2}
                            />
                          </>
                        )}
                        {/* شیر آب */}
                        <circle
                          cx={ax + aw / 2}
                          cy={flip === 1 ? ay + 4 * s : ay + ad + ceramicExtra - 4 * s}
                          r={2.4 * s}
                          fill="#0f766e"
                        />
                      </>
                    ) : app.kind === 'gas' ? (
                      <>
                        <rect
                          x={ax}
                          y={ay}
                          width={aw}
                          height={ad}
                          rx={3}
                          fill="#1e293b"
                          stroke={isAppSel ? '#4f46e5' : '#0f172a'}
                          strokeWidth={isAppSel ? 2.2 : 1.3}
                        />
                        {/* خط‌چین محدوده هود متصل */}
                        <rect
                          x={ax - 2}
                          y={ay - 2}
                          width={aw + 4}
                          height={ad + 4}
                          rx={4}
                          fill="none"
                          stroke="#94a3b8"
                          strokeWidth={0.9}
                          strokeDasharray="3,2"
                        />
                        {/* شعله‌های گاز یا القائی ۲ شعله */}
                        {app.width <= 40 ? (
                          <>
                            {[0.3, 0.72].map((ry, idx) => (
                              <circle
                                key={idx}
                                cx={ax + aw * 0.5}
                                cy={ay + ad * ry}
                                r={Math.min(aw * 0.28, 5.2 * s)}
                                fill="none"
                                stroke="#38bdf8"
                                strokeWidth={1.3}
                              />
                            ))}
                          </>
                        ) : (
                          <>
                            {[
                              [0.24, 0.3],
                              [0.24, 0.72],
                              [0.76, 0.3],
                              [0.76, 0.72],
                            ].map(([rx, ry], idx) => (
                              <circle
                                key={idx}
                                cx={ax + aw * rx}
                                cy={ay + ad * ry}
                                r={4.5 * s}
                                fill="none"
                                stroke="#94a3b8"
                                strokeWidth={1}
                              />
                            ))}
                            <circle
                              cx={ax + aw * 0.5}
                              cy={ay + ad * 0.5}
                              r={5.8 * s}
                              fill="none"
                              stroke="#f97316"
                              strokeWidth={1.1}
                            />
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        <rect
                          x={ax}
                          y={ay}
                          width={aw}
                          height={ad}
                          rx={3}
                          fill="#e0e7ff"
                          stroke={isAppSel ? '#4f46e5' : '#4338ca'}
                          strokeWidth={isAppSel ? 2.2 : 1.3}
                        />
                        <text
                          x={ax + aw / 2}
                          y={ay + ad / 2 + 3}
                          fontSize={13}
                          fontWeight={800}
                          fill="#312e81"
                          textAnchor="middle"
                          pointerEvents="none"
                        >
                          {app.kind === 'dishwasher' ? 'ظرفشویی' : 'لباسشویی'}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}

              {/* پیش‌نمایش شبح درج تجهیز/یخچال/پنجره روی این دیوار در پلان */}
              {planHoverWall &&
                planHoverWall.wallId === w.id &&
                (() => {
                  if (tool === 'fridge') {
                    const cfg = FRIDGE_MODELS[fridgeModel];
                    const totalW = cfg.width + FRIDGE_FRAME_CM * 2;
                    const fx = Math.max(
                      0,
                      Math.min(w.length - totalW, planHoverWall.offsetCm - totalW / 2)
                    );
                    const fw = totalW * s;
                    const fd = cfg.depth * s;
                    const fy = flip === 1 ? 0 : -fd;
                    return (
                      <rect
                        x={fx * s}
                        y={fy}
                        width={fw}
                        height={fd}
                        fill="rgba(79,70,229,0.22)"
                        stroke="#4f46e5"
                        strokeWidth={1.8}
                        strokeDasharray="4,3"
                        pointerEvents="none"
                      />
                    );
                  }
                  if (tool === 'sink' || tool === 'gas' || tool === 'appliance') {
                    const wCm =
                      tool === 'sink'
                        ? SINK_MODELS[sinkModel].width
                        : tool === 'gas'
                        ? gasWidth
                        : APPLIANCE_CONFIGS[applianceKind].width;
                    const isCeramicGhost = tool === 'sink' && sinkModel === 'ceramic-apron';
                    const isCornerGhost = tool === 'sink' && sinkModel === 'corner-sink';
                    const dCm =
                      (tool === 'sink'
                        ? SINK_MODELS[sinkModel].depth
                        : tool === 'gas'
                        ? APPLIANCE_CONFIGS.gas.depth
                        : APPLIANCE_CONFIGS[applianceKind].depth) + (isCeramicGhost ? 5 : 0);
                    let axCm = Math.max(
                      0,
                      Math.min(w.length - wCm, planHoverWall.offsetCm - wCm / 2)
                    );
                    let isValid = Boolean(planHoverWall.boxId);
                    if (isCornerGhost) {
                      const validCornerEnds = junctions
                        .filter((j) => j.wallAId === w.id || j.wallBId === w.id)
                        .map((j) => {
                          const isA = j.wallAId === w.id;
                          const myEnd = isA ? j.wallAEnd : j.wallBEnd;
                          const otherW = displayWalls.find(
                            (ow) => ow.id === (isA ? j.wallBId : j.wallAId)
                          );
                          const otherEnd = isA ? j.wallBEnd : j.wallAEnd;
                          if (!otherW) return null;
                          return analyzeCornerJunction(w, myEnd, otherW, otherEnd).kind === 'inside-90'
                            ? myEnd
                            : null;
                        })
                        .filter((x): x is 'start' | 'end' => x !== null);
                      const nearDist = Math.min(
                        validCornerEnds.includes('start') ? Math.abs(planHoverWall.offsetCm) : Infinity,
                        validCornerEnds.includes('end')
                          ? Math.abs(w.length - planHoverWall.offsetCm)
                          : Infinity
                      );
                      if (validCornerEnds.length && nearDist <= 110) {
                        const nearStart =
                          validCornerEnds.includes('start') &&
                          (!validCornerEnds.includes('end') ||
                            planHoverWall.offsetCm <= w.length / 2);
                        axCm = nearStart ? 0 : Math.max(0, w.length - wCm);
                      } else {
                        isValid = false;
                      }
                    }
                    const aw = wCm * s;
                    const ad = dCm * s;
                    const ay = flip === 1 ? 4 * s : -(ad + 4 * s);
                    return (
                      <rect
                        x={axCm * s}
                        y={ay}
                        width={aw}
                        height={ad}
                        rx={3}
                        fill={isValid ? 'rgba(15,118,110,0.22)' : 'rgba(220,38,38,0.18)'}
                        stroke={isValid ? '#0f766e' : '#dc2626'}
                        strokeWidth={1.8}
                        strokeDasharray="4,3"
                        pointerEvents="none"
                      />
                    );
                  }
                  if (tool === 'opening') {
                    const def = OPENING_DEFAULTS[openingKind];
                    const ox = Math.max(
                      0,
                      Math.min(w.length - def.width, planHoverWall.offsetCm - def.width / 2)
                    );
                    return (
                      <rect
                        x={ox * s}
                        y={wallY - 2}
                        width={def.width * s}
                        height={wallThick + 4}
                        fill="rgba(2,132,199,0.28)"
                        stroke="#0284c7"
                        strokeWidth={1.8}
                        strokeDasharray="4,2"
                        pointerEvents="none"
                      />
                    );
                  }
                  return null;
                })()}

              {/* فلش و برچسب دیوار بیرون محیط دیوار */}
              <g style={{ cursor: 'pointer' }} data-wall-click={w.id}>
                {(() => {
                  const outSign = flip === 1 ? -1 : 1;
                  const wallOuterEdge = flip === 1 ? -wallThick : wallThick;
                  const isVerticalWall = Math.abs(Math.sin((w.angle * Math.PI) / 180)) > 0.5;
                  const aTipY = wallOuterEdge + outSign * 6;
                  const aBaseY = wallOuterEdge + outSign * 22;
                  const pillY = wallOuterEdge + outSign * (isVerticalWall ? 66 : 34);
                  const arrowHead =
                    outSign === -1
                      ? `-5,${aTipY - 7} 5,${aTipY - 7} 0,${aTipY}`
                      : `-5,${aTipY + 7} 5,${aTipY + 7} 0,${aTipY}`;
                  return (
                    <>
                      <line
                        x1={midX}
                        y1={aBaseY}
                        x2={midX}
                        y2={aTipY}
                        stroke={isAct ? '#ea580c' : '#94a3b8'}
                        strokeWidth={2.2}
                      />
                      <polygon
                        points={arrowHead}
                        transform={`translate(${midX}, 0)`}
                        fill={isAct ? '#ea580c' : '#94a3b8'}
                      />
                      <g transform={`translate(${midX}, ${pillY}) rotate(${-w.angle})`}>
                        <rect
                          x={-54}
                          y={-10}
                          width={108}
                          height={20}
                          rx={6}
                          fill={isAct ? '#4f46e5' : '#ffffff'}
                          stroke={isAct ? '#4f46e5' : '#cbd5e1'}
                          strokeWidth={1.3}
                        />
                        <text
                          x={0}
                          y={3.5}
                          fontSize={13}
                          fontWeight={800}
                          fill={isAct ? '#ffffff' : '#334155'}
                          textAnchor="middle"
                        >
                          {w.name}
                        </text>
                      </g>
                    </>
                  );
                })()}
              </g>

              <circle
                cx={0}
                cy={wallY + wallThick / 2}
                r={4.2}
                fill="#ffffff"
                stroke="#1e293b"
                strokeWidth={2}
              />
              <circle
                cx={wLen}
                cy={wallY + wallThick / 2}
                r={4.2}
                fill="#ffffff"
                stroke="#1e293b"
                strokeWidth={2}
              />
            </g>
          );
        })}

        {/* دکمه‌های تعاملی کنج */}
        {inside90Junctions.map((j) => (
          <g
            key={j.key}
            transform={`translate(${j.btnXCm * s}, ${j.btnYCm * s})`}
            data-corner-key={j.key}
            style={{ cursor: 'pointer' }}
          >
            <circle r={10} fill="#fff7ed" stroke="#ea580c" strokeWidth={1.6} />
            <text
              x={0}
              y={3.5}
              fontSize={13}
              fontWeight={800}
              fill="#c2410c"
              textAnchor="middle"
            >
              ⇄
            </text>
          </g>
        ))}

        {/* گره‌های هوشمند دیوار (درگ برای تغییر ابعاد و زاویه دیوارها پس از رسم) */}
        {(tool === 'select' || tool === 'wall') &&
          !wallDraw.startPt &&
          smartNodes.map((node) => (
            <g
              key={node.key}
              transform={`translate(${node.xCm * s}, ${node.yCm * s})`}
              data-wall-node={node.key}
              style={{ cursor: 'grab' }}
            >
              <circle r={11} fill="transparent" />
              <circle
                r={5.5}
                fill="#ffffff"
                stroke="#4f46e5"
                strokeWidth={2.2}
              />
              <circle r={2} fill="#4f46e5" />
            </g>
          ))}

        {/* پیش‌نمایش رسم دیوار */}
        {tool === 'wall' && wallDraw.startPt && wallDraw.currPt && (
          <g pointerEvents="none">
            <line
              x1={wallDraw.startPt.x * s}
              y1={wallDraw.startPt.y * s}
              x2={wallDraw.currPt.x * s}
              y2={wallDraw.currPt.y * s}
              stroke="#4f46e5"
              strokeWidth={7}
              strokeLinecap="round"
              opacity={0.7}
            />
            <circle cx={wallDraw.startPt.x * s} cy={wallDraw.startPt.y * s} r={6} fill="#4f46e5" />
            <circle
              cx={wallDraw.currPt.x * s}
              cy={wallDraw.currPt.y * s}
              r={6}
              fill={wallDraw.snappedCorner ? '#16a34a' : '#ea580c'}
            />
            <g
              transform={`translate(${
                ((wallDraw.startPt.x + wallDraw.currPt.x) / 2) * s
              }, ${((wallDraw.startPt.y + wallDraw.currPt.y) / 2) * s - 18})`}
            >
              <rect x={-40} y={-10} width={80} height={20} rx={6} fill="#0f172a" />
              <text
                x={0}
                y={3.5}
                fontSize={13}
                fontWeight={800}
                fill="#ffffff"
                textAnchor="middle"
              >
                {wallDraw.lengthCm} cm
              </text>
            </g>
          </g>
        )}

        {/* ستون‌های آزاد داخل کف آشپزخانه */}
        {columns.map((col) => {
          const isSel = col.id === selectedColumnId;
          const cw = col.widthCm * s;
          const cd = col.depthCm * s;
          const cx = col.xCm * s - cw / 2;
          const cy = col.yCm * s - cd / 2;
          return (
            <g
              key={col.id}
              data-plan-room-col-id={col.id}
              style={{ cursor: tool === 'eraser' ? 'not-allowed' : 'move' }}
            >
              <rect
                x={cx}
                y={cy}
                width={cw}
                height={cd}
                fill="#475569"
                stroke={isSel ? '#4f46e5' : '#0f172a'}
                strokeWidth={isSel ? 2.4 : 1.4}
              />
              <line x1={cx} y1={cy} x2={cx + cw} y2={cy + cd} stroke="#cbd5e1" strokeWidth={1} />
              <line x1={cx + cw} y1={cy} x2={cx} y2={cy + cd} stroke="#cbd5e1" strokeWidth={1} />
              <text
                x={col.xCm * s}
                y={cy - 5}
                fontSize={12}
                fontWeight={800}
                fill={isSel ? '#4f46e5' : '#334155'}
                textAnchor="middle"
                pointerEvents="none"
              >
                ستون {col.widthCm}×{col.depthCm}
              </text>
            </g>
          );
        })}

        {/* پیش‌نمایش شبح ستون آزاد روی کف */}
        {tool === 'opening' && openingKind === 'column' && !planHoverWall && planHoverFloorCm && (
          <g pointerEvents="none">
            <rect
              x={(planHoverFloorCm.x - OPENING_DEFAULTS.column.width / 2) * s}
              y={(planHoverFloorCm.y - (OPENING_DEFAULTS.column.depthCm ?? 35) / 2) * s}
              width={OPENING_DEFAULTS.column.width * s}
              height={(OPENING_DEFAULTS.column.depthCm ?? 35) * s}
              fill="rgba(79,70,229,0.2)"
              stroke="#4f46e5"
              strokeWidth={1.8}
              strokeDasharray="4,2"
            />
          </g>
        )}

        {/* پیش‌نمایش زنده کشیدن کابینت */}
        {sweepPreviewData && (
          <g pointerEvents="none">
            {sweepPreviewData.polys.map((poly) => (
              <polygon
                key={poly.key}
                points={poly.points.map((p) => `${p.x * s},${p.y * s}`).join(' ')}
                fill="rgba(79,70,229,0.28)"
                stroke="#4f46e5"
                strokeWidth={2}
                strokeDasharray="5,3"
              />
            ))}
          </g>
        )}
      </svg>

      {selectedColumnId && (
        <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-white/95 border border-indigo-200 rounded-xl px-3 py-1.5 shadow-sm">
          <span className="text-[12px] font-bold text-slate-700">ستون آزاد انتخاب شد</span>
          <button
            type="button"
            data-testid="plan-column-confirm"
            onClick={onExitToSelect}
            className="h-7 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-extrabold"
          >
            تأیید
          </button>
        </div>
      )}

      {planHoverClientPt && !dragOp.current && (
        <CursorToolPreview
          visible={true}
          clientX={planHoverClientPt.x}
          clientY={planHoverClientPt.y}
          tool={tool}
          targetStatus={planHoverStatus}
          sinkModel={sinkModel}
          gasWidth={gasWidth}
          applianceKind={applianceKind}
          fridgeModel={fridgeModel}
          openingKind={openingKind}
          windowOkbCm={openingKind === 'window' ? OPENING_DEFAULTS.window.elevY : undefined}
          doorOrient="vertical"
          doorTargetWidth={45}
          doorVertCount={2}
          drawerPatIdx={0}
          liftPatIdx={0}
          doorStyleBrush="flat"
          cabinetFinishBrush="warm-white"
          backsplashBrush="subway-white"
          countertopBrush="calacatta-top"
          frameWidthCm={5}
          shelfCount={1}
          drawBoxKind={drawBoxKind}
          testId="cursor-preview-plan"
        />
      )}
    </section>
  );
};
