import type {DiningSeats,FloorFurnitureKind} from '../cad/types';
import { getFinishSwatch } from '../cad/materials3d';
import { HANDLE_STYLES } from '../cad/handleGeometry';
import React, { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import {
  APPLIANCE_CONFIGS,
  BACKSPLASH_FINISHES,
  BOX_PRESETS,
  CABINET_FINISHES,
  COUNTERTOP_FINISHES,
  DOOR_STYLE_META,
  DRAWER_PATTERNS,
  FRIDGE_MODELS,
  HARDWARE_KIND_META,
  LIFT_PATTERNS,
  OPENING_DEFAULTS,
  SINK_MODELS,
} from '../cad/constants';
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
  OpeningKind,
  Orientation,
  SinkModel,
  ToolId,
} from '../cad/types';

export type CursorTargetStatus = 'valid' | 'invalid' | 'neutral';

export const ToolGuideHost = createContext<HTMLDivElement | null>(null);

export interface CursorToolPreviewProps {
  visible: boolean;
  clientX: number;
  clientY: number;
  tool: ToolId;
  diningSeats?: DiningSeats;
  furnitureKind?: FloorFurnitureKind;
  hoverTarget?: 'cabinet' | 'backsplash' | 'countertop' | 'base' | 'wall' | 'door' | null;
  targetStatus?: CursorTargetStatus;
  sinkModel: SinkModel;
  gasWidth: number;
  hoodKind?: 'hidden' | 'chimney';
  applianceKind: ApplianceKind;
  fridgeModel: FridgeModel;
  openingKind: OpeningKind;
  windowOkbCm?: number;
  doorOrient: Orientation;
  doorTargetWidth: number;
  doorVertCount: number;
  previewDoorWidths?: number[];
  drawerPatIdx: number;
  liftPatIdx: number;
  doorStyleBrush: DoorStyle;
  hardwareBrush?: HardwareKind;
  cabinetFinishBrush: CabinetFinishId;
  backsplashBrush: BacksplashFinishId;
  countertopBrush: CountertopFinishId;
  frameWidthCm: number;
  shelfOrient?: Orientation;
  shelfCount: number;
  handleStyle?: HandleStyle;
  handleOrient?: Orientation;
  drawBoxKind?: BoxKind;
  activeCabWidthCm?: number;
  testId?: string;
}

const PREVIEW_TOOLS = new Set<ToolId>([
  'wall',
  'dining',
  'cab-draw',
  'sink',
  'gas',
  'appliance',
  'fridge',
  'opening',
  'doors',
  'hardware',
  'handle',
  'door-style',
  'finish',
  'frame',
  'pencil',
  'skeleton',
]);

export const CursorToolPreview: React.FC<CursorToolPreviewProps> = ({
  visible,
  clientX,
  clientY,
  tool,
  diningSeats=4, furnitureKind='dining',
  hoverTarget,
  targetStatus = 'neutral',
  sinkModel,
  gasWidth,
  hoodKind = 'hidden',
  applianceKind,
  fridgeModel,
  openingKind,
  windowOkbCm,
  doorOrient,
  doorTargetWidth,
  doorVertCount,
  previewDoorWidths,
  drawerPatIdx,
  liftPatIdx,
  doorStyleBrush,
  hardwareBrush = 'hinged',
  cabinetFinishBrush,
  backsplashBrush,
  countertopBrush,
  frameWidthCm,
  shelfOrient = 'horizontal',
  shelfCount,
  handleStyle = 'simple',
  handleOrient = 'vertical',
  drawBoxKind = 'base',
  activeCabWidthCm,
  testId = 'cursor-preview-2d',
}) => {
  const host = useContext(ToolGuideHost);
  if (!host || !visible || !PREVIEW_TOOLS.has(tool)) return null;

  let graphic: React.ReactNode = null;
  let badgeLabel = '';

  if (tool === 'dining') {
    badgeLabel=furnitureKind==='tv'?'ست تلویزیون':`میز ${diningSeats.toLocaleString('fa-IR')} نفره`;
    graphic=<span className="text-xl" aria-hidden="true">{furnitureKind==='tv'?'▣':'◉'}</span>;
  } else if (tool === 'wall') {
    badgeLabel = 'دیوار';
    graphic = (
      <svg width="42" height="32" viewBox="0 0 42 32" className="shrink-0">
        <line x1="6" y1="22" x2="36" y2="10" stroke="#334155" strokeWidth="6" strokeLinecap="round" />
        <line x1="6" y1="22" x2="36" y2="10" stroke="#e2e8f0" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="6" cy="22" r="3" fill="#4f46e5" />
        <circle cx="36" cy="10" r="3" fill="#16a34a" />
      </svg>
    );
  } else if (tool === 'cab-draw') {
    const preset = BOX_PRESETS[drawBoxKind] || BOX_PRESETS.base;
    badgeLabel = activeCabWidthCm
      ? `${Math.round(activeCabWidthCm)}×${preset.height}cm`
      : `${preset.name} ${preset.height}×${preset.depth}`;
    const isWall = drawBoxKind === 'wall' || drawBoxKind === 'wall-deep';
    const isTall = drawBoxKind === 'tall' || drawBoxKind === 'closet';
    graphic = (
      <svg width="40" height="32" viewBox="0 0 40 32" className="shrink-0">
        {isWall ? (
          <rect x="4" y="4" width="32" height="16" rx="2" fill="#e0e7ff" stroke="#4f46e5" strokeWidth="1.6" />
        ) : isTall ? (
          <rect x="8" y="2" width="24" height="28" rx="2" fill="#fef3c7" stroke="#d97706" strokeWidth="1.6" />
        ) : (
          <>
            <rect x="4" y="12" width="32" height="18" rx="2" fill="#f1f5f9" stroke="#334155" strokeWidth="1.6" />
            <rect x="3" y="9.5" width="34" height="3.2" rx="1" fill="#475569" />
          </>
        )}
      </svg>
    );
  } else if (tool === 'sink') {
    const sCfg = SINK_MODELS[sinkModel];
    badgeLabel = `${sCfg.shortLabel} ${sCfg.width}cm`;
    const isDouble = sinkModel === 'steel-2' || sinkModel === 'corner-sink';
    const trayR = sinkModel === 'steel-tray-right';
    const trayL = sinkModel === 'steel-tray-left';
    const apron = sinkModel === 'ceramic-apron';
    const isCorner = sinkModel === 'corner-sink';
    graphic = (
      <svg width="44" height="30" viewBox="0 0 46 32" className="shrink-0">
        {isCorner ? (
          <polygon points="4,6 42,6 34,26 12,26" fill="#ccfbf1" stroke="#0f766e" strokeWidth="1.6" />
        ) : (
          <rect
            x="2"
            y="4"
            width="42"
            height="24"
            rx={apron ? 2 : 4}
            fill={apron ? '#fafaf9' : '#e2e8f0'}
            stroke={apron ? '#94a3b8' : '#475569'}
            strokeWidth="1.5"
          />
        )}
        {isDouble ? (
          <>
            <rect x="8" y="9" width="13" height="13" rx="2" fill="#94a3b8" />
            <rect x="25" y="9" width="13" height="13" rx="2" fill="#94a3b8" />
          </>
        ) : trayR ? (
          <>
            <rect x="6" y="8" width="18" height="15" rx="2" fill="#94a3b8" />
            <line x1="28" y1="10" x2="40" y2="10" stroke="#64748b" strokeWidth="1.3" />
            <line x1="28" y1="15.5" x2="40" y2="15.5" stroke="#64748b" strokeWidth="1.3" />
            <line x1="28" y1="21" x2="40" y2="21" stroke="#64748b" strokeWidth="1.3" />
          </>
        ) : trayL ? (
          <>
            <rect x="22" y="8" width="18" height="15" rx="2" fill="#94a3b8" />
            <line x1="6" y1="10" x2="18" y2="10" stroke="#64748b" strokeWidth="1.3" />
            <line x1="6" y1="15.5" x2="18" y2="15.5" stroke="#64748b" strokeWidth="1.3" />
            <line x1="6" y1="21" x2="18" y2="21" stroke="#64748b" strokeWidth="1.3" />
          </>
        ) : (
          <rect x="7" y="8" width="32" height="15" rx="2.5" fill={apron ? '#cbd5e1' : '#94a3b8'} />
        )}
        <circle cx="23" cy="6.5" r="2.2" fill="#0f172a" />
      </svg>
    );
  } else if (tool === 'gas') {
    const isInduction2 = gasWidth <= 40;
    badgeLabel = isInduction2 ? `القائی ۲ شعله ${gasWidth}cm` : `گاز ${gasWidth}cm`;
    const burners = gasWidth >= 85 ? 5 : 4;
    graphic = (
      <svg width="44" height="30" viewBox="0 0 46 32" className="shrink-0">
        {hoodKind === 'chimney' && <path d="M16 1 L30 1 L34 4 L12 4 Z" fill="#94a3b8" />}
        <rect x="2" y="5" width="42" height="23" rx="3" fill="#0f172a" stroke="#475569" strokeWidth="1.4" />
        {isInduction2 ? (
          <>
            <circle cx="23" cy="11.5" r="4" fill="none" stroke="#38bdf8" strokeWidth="1.4" />
            <circle cx="23" cy="21.5" r="3.4" fill="none" stroke="#38bdf8" strokeWidth="1.4" />
          </>
        ) : (
          <>
            <circle cx="12" cy="12" r="3.5" fill="none" stroke="#cbd5e1" strokeWidth="1.3" />
            <circle cx="34" cy="12" r="3.5" fill="none" stroke="#cbd5e1" strokeWidth="1.3" />
            <circle cx="12" cy="21" r="3" fill="none" stroke="#cbd5e1" strokeWidth="1.3" />
            <circle cx="34" cy="21" r="3" fill="none" stroke="#cbd5e1" strokeWidth="1.3" />
            {burners === 5 && <circle cx="23" cy="16.5" r="4.2" fill="none" stroke="#f59e0b" strokeWidth="1.4" />}
          </>
        )}
      </svg>
    );
  } else if (tool === 'appliance') {
    const aCfg = APPLIANCE_CONFIGS[applianceKind];
    badgeLabel = `${aCfg.shortLabel} ${aCfg.width}cm`;
    graphic = (
      <svg width="34" height="32" viewBox="0 0 36 34" className="shrink-0">
        <rect x="3" y="2" width="30" height="30" rx="3" fill="#f1f5f9" stroke="#475569" strokeWidth="1.5" />
        <rect x="5" y="4.5" width="26" height="5" rx="1" fill="#334155" />
        {applianceKind === 'washing' ? (
          <circle cx="18" cy="20.5" r="7" fill="#bae6fd" stroke="#1e293b" strokeWidth="1.8" />
        ) : applianceKind === 'builtin-oven' || applianceKind === 'microwave' ? (
          <rect x="6" y="11" width="24" height="17" rx="2" fill="#0f172a" stroke="#f59e0b" strokeWidth="1.4" />
        ) : (
          <line x1="11" y1="14" x2="25" y2="14" stroke="#64748b" strokeWidth="2.2" strokeLinecap="round" />
        )}
      </svg>
    );
  } else if (tool === 'fridge') {
    const fCfg = FRIDGE_MODELS[fridgeModel];
    badgeLabel = `${fCfg.shortLabel} ${fCfg.width}cm`;
    graphic = (
      <svg width="36" height="32" viewBox="0 0 38 34" className="shrink-0">
        <rect x="5" y="2" width="28" height="30" rx="2.5" fill="#cbd5e1" stroke="#334155" strokeWidth="1.5" />
        {fridgeModel === 'single-door' ? (
          <line x1="10" y1="8" x2="10" y2="24" stroke="#475569" strokeWidth="1.8" strokeLinecap="round" />
        ) : fridgeModel === 'single' ? (
          <line x1="5" y1="22" x2="33" y2="22" stroke="#475569" strokeWidth="1.3" />
        ) : fridgeModel === 'twin' ? (
          <>
            <line x1="19" y1="2" x2="19" y2="21" stroke="#475569" strokeWidth="1.3" />
            <line x1="5" y1="21" x2="33" y2="21" stroke="#475569" strokeWidth="1.3" />
          </>
        ) : (
          <line x1="19" y1="2" x2="19" y2="32" stroke="#475569" strokeWidth="1.3" />
        )}
      </svg>
    );
  } else if (tool === 'opening') {
    const oDef = OPENING_DEFAULTS[openingKind];
    const shortName = openingKind === 'door' ? 'درب' : openingKind === 'column' ? 'ستون' : oDef.label;
    badgeLabel =
      openingKind === 'window' && windowOkbCm !== undefined
        ? `${shortName} · OKB:${Math.round(windowOkbCm)}cm`
        : `${shortName} ${oDef.width}×${oDef.height}`;
    graphic = (
      <svg width="38" height="32" viewBox="0 0 40 34" className="shrink-0">
        {openingKind === 'window' ? (
          <>
            <rect x="4" y="4" width="32" height="26" rx="1.5" fill="#e0f2fe" stroke="#0284c7" strokeWidth="1.6" />
            <line x1="20" y1="4" x2="20" y2="30" stroke="#0284c7" strokeWidth="1.2" />
            <line x1="4" y1="17" x2="36" y2="17" stroke="#0284c7" strokeWidth="1" />
          </>
        ) : openingKind === 'door' ? (
          <>
            <rect x="8" y="2" width="24" height="30" rx="1.5" fill="#e2e8f0" stroke="#475569" strokeWidth="1.6" />
            <circle cx="27" cy="18" r="2" fill="#0f172a" />
          </>
        ) : (
          <rect x="10" y="2" width="20" height="30" fill="#cbd5e1" stroke="#334155" strokeWidth="1.6" />
        )}
      </svg>
    );
  } else if (tool === 'doors') {
    const liveCount =
      doorOrient === 'vertical' && previewDoorWidths && previewDoorWidths.length > 0
        ? previewDoorWidths.length
        : null;
    const count = doorOrient === 'vertical' ? Math.max(1, liveCount ?? doorVertCount) : 1;
    const isWallTarget = hoverTarget === 'wall';
    const liftPat = LIFT_PATTERNS[liftPatIdx % LIFT_PATTERNS.length] || LIFT_PATTERNS[0];
    const drawPat = DRAWER_PATTERNS[drawerPatIdx % DRAWER_PATTERNS.length] || DRAWER_PATTERNS[0];
    const ratios = isWallTarget ? liftPat.ratios : drawPat.ratios;
    const band = !isWallTarget ? drawPat.drawerBand : undefined;

    if (doorOrient === 'vertical') {
      if (previewDoorWidths && previewDoorWidths.length > 0) {
        const firstW = previewDoorWidths[0];
        const allEqual = previewDoorWidths.every((w) => Math.abs(w - firstW) <= 1);
        badgeLabel =
          previewDoorWidths.length === 1
            ? `${firstW}cm`
            : allEqual
            ? `${previewDoorWidths.length} درب ${firstW}cm`
            : `${previewDoorWidths.join(' + ')}cm`;
      } else {
        badgeLabel = `${count > 1 ? `${count} درب ` : 'درب '}${doorTargetWidth}cm`;
      }
    } else if (isWallTarget) {
      const w = previewDoorWidths?.[0] ?? doorTargetWidth;
      badgeLabel = `${liftPat.shortLabel} ${w}cm`;
    } else {
      badgeLabel = previewDoorWidths?.[0]
        ? `${drawPat.shortLabel} ${previewDoorWidths[0]}cm`
        : drawPat.shortLabel;
    }

    graphic = (
      <svg width="42" height="30" viewBox="0 0 44 32" className="shrink-0">
        <rect x="2" y="2" width="40" height="28" rx="2" fill="#eef2ff" stroke="#4f46e5" strokeWidth="1.6" />
        {doorOrient === 'vertical' ? (
          <>
            {Array.from({ length: Math.max(0, count - 1) }).map((_, i) => (
              <line
                key={i}
                x1={2 + ((i + 1) * 40) / count}
                y1="2"
                x2={2 + ((i + 1) * 40) / count}
                y2="30"
                stroke="#4f46e5"
                strokeWidth="1.4"
              />
            ))}
          </>
        ) : band ? (
          band.position === 'top' ? (
            <>
              <rect x="2" y="2" width="40" height="8.5" rx="1" fill="#c7d2fe" stroke="#4f46e5" strokeWidth="1.3" />
              <line x1="15" y1="6.2" x2="29" y2="6.2" stroke="#312e81" strokeWidth="1.6" strokeLinecap="round" />
            </>
          ) : (
            <>
              <rect x="2" y="21.5" width="40" height="8.5" rx="1" fill="#c7d2fe" stroke="#4f46e5" strokeWidth="1.3" />
              <line x1="15" y1="25.7" x2="29" y2="25.7" stroke="#312e81" strokeWidth="1.6" strokeLinecap="round" />
            </>
          )
        ) : (
          ratios.map((r, i) => (
            <line key={i} x1="2" y1={2 + r * 28} x2="42" y2={2 + r * 28} stroke="#4f46e5" strokeWidth="1.4" />
          ))
        )}
      </svg>
    );
  } else if (tool === 'handle') {
    const hName = HANDLE_STYLES.find(style => style.id === handleStyle)?.label ?? 'دستگیره';
    const hDir = handleStyle === 'knob' || handleStyle === 'handleless' ? '' : handleOrient === 'horizontal' ? ' افقی' : ' عمودی';
    badgeLabel = `${hName}${hDir}`;
    graphic = (
      <svg width="36" height="32" viewBox="0 0 38 34" className="shrink-0">
        <rect x="4" y="2" width="30" height="30" rx="2.5" fill="#f8fafc" stroke="#64748b" strokeWidth="1.4" />
        {handleStyle === 'handleless' ? null : handleStyle === 'knob' ? (
          <circle cx="26" cy="17" r="4" fill="#0f172a" stroke="#475569" strokeWidth="1" />
        ) : handleStyle === 'hidden' || handleStyle === 'f-profile' ? (
          handleOrient === 'horizontal' ? (
            <rect x="5" y="3" width="28" height="4" rx="1" fill="#334155" />
          ) : (
            <rect x="28" y="3" width="4" height="28" rx="1" fill="#334155" />
          )
        ) : handleOrient === 'horizontal' ? (
          <g>
            <rect x="9" y="14.5" width="20" height="4" rx="1.5" fill="#0f172a" />
            <circle cx="13" cy="16.5" r="1.3" fill="#94a3b8" />
            <circle cx="25" cy="16.5" r="1.3" fill="#94a3b8" />
          </g>
        ) : (
          <g>
            <rect x="24" y="7" width="4" height="20" rx="1.5" fill="#0f172a" />
            <circle cx="26" cy="11" r="1.3" fill="#94a3b8" />
            <circle cx="26" cy="23" r="1.3" fill="#94a3b8" />
          </g>
        )}
      </svg>
    );
  } else if (tool === 'hardware') {
    badgeLabel = HARDWARE_KIND_META[hardwareBrush].shortLabel;
    graphic = (
      <svg width="36" height="32" viewBox="0 0 38 34" className="shrink-0">
        <rect x="5" y="2" width="28" height="30" rx="2" fill="#eef2ff" stroke="#4f46e5" strokeWidth="1.5" />
        {hardwareBrush === 'pantry-pullout' ? (
          <>
            <line x1="8" y1="10" x2="30" y2="10" stroke="#4f46e5" strokeWidth="1.4" />
            <line x1="8" y1="17" x2="30" y2="17" stroke="#4f46e5" strokeWidth="1.4" />
            <line x1="8" y1="24" x2="30" y2="24" stroke="#4f46e5" strokeWidth="1.4" />
          </>
        ) : hardwareBrush === 'lift-bifold' ? (
          <>
            <line x1="5" y1="17" x2="33" y2="17" stroke="#4f46e5" strokeWidth="1.5" />
            <path d="M15 11 L19 6 L23 11" fill="none" stroke="#4f46e5" strokeWidth="1.6" />
          </>
        ) : hardwareBrush === 'push-to-open' ? (
          <circle cx="19" cy="17" r="4" fill="none" stroke="#4f46e5" strokeWidth="1.8" />
        ) : (
          <path d="M27 7 L27 27 M27 17 L13 17" stroke="#4f46e5" strokeWidth="1.8" strokeLinecap="round" />
        )}
      </svg>
    );
  } else if (tool === 'door-style') {
    badgeLabel = DOOR_STYLE_META[doorStyleBrush].shortLabel;
    graphic = (
      <svg width="34" height="32" viewBox="0 0 36 34" className="shrink-0">
        <rect x="4" y="2" width="28" height="30" rx="2" fill="#f1f5f9" stroke="#475569" strokeWidth="1.5" />
        {doorStyleBrush === 'cnc' && <rect x="9" y="7" width="18" height="20" fill="none" stroke="#4f46e5" strokeWidth="1.5" />}
        {(doorStyleBrush === 'glass' || doorStyleBrush === 'glass-grid') && (
          <rect x="8" y="6" width="20" height="22" fill="#bae6fd" stroke="#334155" strokeWidth="1.2" />
        )}
        {doorStyleBrush === 'glass-grid' && (
          <>
            <line x1="18" y1="6" x2="18" y2="28" stroke="#334155" strokeWidth="1.1" />
            <line x1="8" y1="17" x2="28" y2="17" stroke="#334155" strokeWidth="1.1" />
          </>
        )}
      </svg>
    );
  } else if (tool === 'finish') {
    const kind = hoverTarget === 'backsplash' || hoverTarget === 'countertop' ? hoverTarget : 'cabinet';
    const id = kind === 'backsplash' ? backsplashBrush : kind === 'countertop' ? countertopBrush : cabinetFinishBrush;
    const cfg = kind === 'backsplash' ? BACKSPLASH_FINISHES[backsplashBrush]
      : kind === 'countertop' ? COUNTERTOP_FINISHES[countertopBrush] : CABINET_FINISHES[cabinetFinishBrush];
    badgeLabel = cfg.shortLabel;
    const texture = getFinishSwatch(kind, id);
    graphic = (
      <div data-testid="material-swatch" className="h-[72px] w-[120px] shrink-0 overflow-hidden rounded-lg border border-slate-800/30"
        style={{ backgroundColor: 'baseHex' in cfg ? cfg.baseHex : cfg.hex }}>
        {texture && <img src={texture} className="h-full w-full object-cover" alt="" />}
      </div>
    );
  } else if (tool === 'frame') {
    badgeLabel = `فریم ${frameWidthCm}cm`;
    graphic = (
      <svg width="34" height="32" viewBox="0 0 36 34" className="shrink-0">
        <rect x="5" y="3" width="26" height="28" fill="none" stroke="#d97706" strokeWidth="4.5" />
      </svg>
    );
  } else {
    if (shelfOrient === 'vertical') {
      badgeLabel = 'طبقه عمودی (۵۰٪)';
      graphic = (
        <svg width="34" height="32" viewBox="0 0 36 34" className="shrink-0">
          <rect x="4" y="3" width="28" height="28" rx="2" fill="#fef3c7" stroke="#d97706" strokeWidth="1.5" />
          <line x1="18" y1="4" x2="18" y2="30" stroke="#b45309" strokeWidth="2.2" />
        </svg>
      );
    } else {
      badgeLabel = `${shelfCount} طبقه`;
      graphic = (
        <svg width="34" height="32" viewBox="0 0 36 34" className="shrink-0">
          <rect x="4" y="3" width="28" height="28" rx="2" fill="#fef3c7" stroke="#d97706" strokeWidth="1.5" />
          {Array.from({ length: shelfCount }).map((_, i) => (
            <line
              key={i}
              x1="5"
              y1={3 + ((i + 1) * 28) / (shelfCount + 1)}
              x2="31"
              y2={3 + ((i + 1) * 28) / (shelfCount + 1)}
              stroke="#b45309"
              strokeWidth="1.7"
            />
          ))}
        </svg>
      );
    }
  }

  const statusToneClass =
    targetStatus === 'valid'
      ? 'border-2 border-emerald-500 ring-2 ring-emerald-400/55 bg-emerald-50/95 shadow-emerald-500/20'
      : targetStatus === 'invalid'
      ? 'border-2 border-rose-500 ring-2 ring-rose-400/45 bg-rose-50/95 shadow-rose-500/20'
      : 'border border-slate-300 bg-white/95';

  return createPortal(
    <div
      data-testid={testId}
      data-target-status={targetStatus}
      className={`pointer-events-none flex min-w-0 items-center gap-2 rounded-lg px-2 select-none ${statusToneClass}`}
    >
      {graphic}
      {badgeLabel && (
        <span
          data-testid={`${testId}-label`}
          className="text-[12px] font-extrabold leading-none text-slate-800 whitespace-nowrap tabular-nums"
        >
          {badgeLabel.split(/(\d+(?:×\d+)?(?:cm)?)/g).map((part, idx) =>
            /^\d+(?:×\d+)?(?:cm)?$/.test(part) ? (
              <bdi key={idx} dir="ltr">
                {part}
              </bdi>
            ) : (
              <React.Fragment key={idx}>{part}</React.Fragment>
            )
          )}
        </span>
      )}
    </div>, host,
  );
};

