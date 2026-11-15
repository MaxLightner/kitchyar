import React from 'react';
import {
  APPLIANCE_CONFIGS,
  BACKSPLASH_FINISHES,
  BOX_PRESETS,
  CABINET_FINISHES,
  COUNTERTOP_FINISHES,
  DOOR_STYLE_META,
  DRAWER_PATTERNS,
  FRIDGE_MODELS,
  LIFT_PATTERNS,
  SINK_MODELS,
} from '../cad/constants';
import { OPENING_LABELS } from '../cad/openingRules';
import {
  ApplianceKind,
  BacksplashFinishId,
  BoxKind,
  CabinetFinishId,
  CountertopFinishId,
  DoorStyle,
  FridgeModel,
  OpeningKind,
  Orientation,
  SinkModel,
  ToolId,
} from '../cad/types';

export interface CursorToolPreviewProps {
  visible: boolean;
  clientX: number;
  clientY: number;
  tool: ToolId;
  hoverTarget?: 'cabinet' | 'backsplash' | 'countertop' | 'base' | 'wall' | 'door' | null;
  sinkModel: SinkModel;
  gasWidth: number;
  hoodKind?: 'hidden' | 'chimney';
  applianceKind: ApplianceKind;
  fridgeModel: FridgeModel;
  openingKind: OpeningKind;
  doorOrient: Orientation;
  doorTargetWidth: number;
  doorVertCount: number;
  drawerPatIdx: number;
  liftPatIdx: number;
  doorStyleBrush: DoorStyle;
  cabinetFinishBrush: CabinetFinishId;
  backsplashBrush: BacksplashFinishId;
  countertopBrush: CountertopFinishId;
  frameWidthCm: number;
  shelfCount: number;
  doorBandPos?: 'top' | 'bottom';
  doorBandRatio?: number;
  drawBoxKind?: BoxKind;
  testId?: string;
}

const PREVIEW_TOOLS = new Set<ToolId>([
  'cab-draw',
  'sink',
  'gas',
  'appliance',
  'fridge',
  'opening',
  'doors',
  'door-pencil',
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
  hoverTarget,
  sinkModel,
  gasWidth,
  hoodKind = 'hidden',
  applianceKind,
  fridgeModel,
  openingKind,
  doorOrient,
  doorTargetWidth,
  doorVertCount,
  drawerPatIdx,
  liftPatIdx,
  doorStyleBrush,
  cabinetFinishBrush,
  backsplashBrush,
  countertopBrush,
  frameWidthCm,
  shelfCount,
  doorBandPos = 'top',
  doorBandRatio = 0.26,
  drawBoxKind = 'base',
  testId = 'cursor-preview-2d',
}) => {
  if (!visible || !PREVIEW_TOOLS.has(tool)) return null;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;
  const cardW = 148;
  const cardH = 74;
  const left = Math.min(Math.max(8, clientX + 18), vw - cardW - 10);
  const top = Math.min(Math.max(8, clientY - cardH - 12 > 54 ? clientY - cardH - 12 : clientY + 18), vh - cardH - 10);

  let title = '';
  let sub = '';
  let graphic: React.ReactNode = null;

  if (tool === 'cab-draw') {
    const cfg = BOX_PRESETS[drawBoxKind] || BOX_PRESETS.base;
    title = cfg.name;
    sub = `${cfg.height}×${cfg.depth} cm`;
    const isWall = drawBoxKind === 'wall' || drawBoxKind === 'wall-deep';
    const isTall = drawBoxKind === 'tall' || drawBoxKind === 'closet';
    graphic = (
      <svg width="36" height="32" viewBox="0 0 36 32" className="shrink-0">
        {isWall ? (
          <rect x="4" y="3" width="28" height="14" rx="2" fill="#e0e7ff" stroke="#4f46e5" strokeWidth="1.5" />
        ) : isTall ? (
          <rect x="7" y="2" width="22" height="28" rx="2" fill="#fef3c7" stroke="#d97706" strokeWidth="1.5" />
        ) : (
          <>
            <rect x="4" y="13" width="28" height="17" rx="2" fill="#f1f5f9" stroke="#334155" strokeWidth="1.5" />
            <rect x="3" y="11" width="30" height="3" rx="1" fill="#475569" />
          </>
        )}
      </svg>
    );
  } else if (tool === 'sink') {
    const cfg = SINK_MODELS[sinkModel];
    title = cfg.shortLabel;
    sub = `${cfg.width} cm`;
    const isDouble = sinkModel === 'steel-2';
    const trayR = sinkModel === 'steel-tray-right';
    const trayL = sinkModel === 'steel-tray-left';
    const apron = sinkModel === 'ceramic-apron';
    graphic = (
      <svg width="46" height="30" viewBox="0 0 46 30" className="shrink-0">
        <rect
          x="2"
          y="4"
          width="42"
          height="22"
          rx={apron ? 2 : 4}
          fill={apron ? '#fafaf9' : '#e2e8f0'}
          stroke={apron ? '#94a3b8' : '#475569'}
          strokeWidth="1.5"
        />
        {isDouble ? (
          <>
            <rect x="6" y="8" width="15" height="14" rx="2" fill="#94a3b8" />
            <rect x="25" y="8" width="15" height="14" rx="2" fill="#94a3b8" />
          </>
        ) : trayR ? (
          <>
            <rect x="6" y="8" width="18" height="14" rx="2" fill="#94a3b8" />
            <line x1="28" y1="9" x2="40" y2="9" stroke="#64748b" strokeWidth="1.3" />
            <line x1="28" y1="15" x2="40" y2="15" stroke="#64748b" strokeWidth="1.3" />
            <line x1="28" y1="21" x2="40" y2="21" stroke="#64748b" strokeWidth="1.3" />
          </>
        ) : trayL ? (
          <>
            <rect x="22" y="8" width="18" height="14" rx="2" fill="#94a3b8" />
            <line x1="6" y1="9" x2="18" y2="9" stroke="#64748b" strokeWidth="1.3" />
            <line x1="6" y1="15" x2="18" y2="15" stroke="#64748b" strokeWidth="1.3" />
            <line x1="6" y1="21" x2="18" y2="21" stroke="#64748b" strokeWidth="1.3" />
          </>
        ) : (
          <rect x="7" y="8" width="32" height="14" rx="2.5" fill={apron ? '#cbd5e1' : '#94a3b8'} />
        )}
        <circle cx="23" cy="6" r="2" fill="#0f172a" />
      </svg>
    );
  } else if (tool === 'gas') {
    const burners = gasWidth >= 85 ? 5 : 4;
    title = `گاز ${burners} شعله`;
    sub = `${gasWidth}cm · ${hoodKind === 'chimney' ? 'هود شومینه' : 'هود مخفی'}`;
    graphic = (
      <svg width="46" height="30" viewBox="0 0 46 30" className="shrink-0">
        <rect x="2" y="4" width="42" height="22" rx="3" fill="#0f172a" stroke="#475569" strokeWidth="1.4" />
        <circle cx="12" cy="11" r="3.5" fill="none" stroke="#cbd5e1" strokeWidth="1.3" />
        <circle cx="34" cy="11" r="3.5" fill="none" stroke="#cbd5e1" strokeWidth="1.3" />
        <circle cx="12" cy="20" r="3" fill="none" stroke="#cbd5e1" strokeWidth="1.3" />
        <circle cx="34" cy="20" r="3" fill="none" stroke="#cbd5e1" strokeWidth="1.3" />
        {burners === 5 && <circle cx="23" cy="15.5" r="4.2" fill="none" stroke="#f59e0b" strokeWidth="1.4" />}
      </svg>
    );
  } else if (tool === 'appliance') {
    const cfg = APPLIANCE_CONFIGS[applianceKind];
    title = cfg.shortLabel;
    sub = `${cfg.width} cm`;
    graphic = (
      <svg width="36" height="32" viewBox="0 0 36 32" className="shrink-0">
        <rect x="3" y="2" width="30" height="28" rx="3" fill="#f1f5f9" stroke="#475569" strokeWidth="1.4" />
        <rect x="5" y="4" width="26" height="5" rx="1" fill="#334155" />
        {applianceKind === 'washing' ? (
          <circle cx="18" cy="19" r="7" fill="#bae6fd" stroke="#1e293b" strokeWidth="1.8" />
        ) : (
          <line x1="12" y1="13" x2="24" y2="13" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
        )}
      </svg>
    );
  } else if (tool === 'fridge') {
    const cfg = FRIDGE_MODELS[fridgeModel];
    title = `یخچال ${cfg.shortLabel}`;
    sub = `${cfg.width}×${cfg.height} cm`;
    graphic = (
      <svg width="36" height="34" viewBox="0 0 36 34" className="shrink-0">
        <rect x="4" y="2" width="28" height="30" rx="2.5" fill="#cbd5e1" stroke="#334155" strokeWidth="1.4" />
        {fridgeModel === 'single' ? (
          <line x1="4" y1="22" x2="32" y2="22" stroke="#475569" strokeWidth="1.2" />
        ) : (
          <line x1="18" y1="2" x2="18" y2="32" stroke="#475569" strokeWidth="1.3" />
        )}
      </svg>
    );
  } else if (tool === 'opening') {
    title = OPENING_LABELS[openingKind];
    sub = openingKind === 'window' ? '۱۲۰×۱۲۰' : openingKind === 'door' ? '۹۰×۲۱۰' : '۴۵cm';
    graphic = (
      <svg width="38" height="32" viewBox="0 0 38 32" className="shrink-0">
        {openingKind === 'window' ? (
          <>
            <rect x="4" y="4" width="30" height="24" rx="1.5" fill="#e0f2fe" stroke="#0284c7" strokeWidth="1.6" />
            <line x1="19" y1="4" x2="19" y2="28" stroke="#0284c7" strokeWidth="1.2" />
          </>
        ) : openingKind === 'door' ? (
          <>
            <rect x="7" y="2" width="24" height="28" rx="1.5" fill="#e2e8f0" stroke="#475569" strokeWidth="1.6" />
            <circle cx="26" cy="17" r="1.8" fill="#0f172a" />
          </>
        ) : (
          <rect x="9" y="2" width="20" height="28" fill="#cbd5e1" stroke="#334155" strokeWidth="1.6" />
        )}
      </svg>
    );
  } else if (tool === 'doors') {
    title = doorOrient === 'vertical' ? `${doorVertCount} درب عمودی` : 'درب افقی / کشو';
    sub =
      doorOrient === 'vertical'
        ? `عرض ${doorTargetWidth} cm`
        : DRAWER_PATTERNS[drawerPatIdx]?.shortLabel || LIFT_PATTERNS[liftPatIdx]?.shortLabel || '';
    const count = doorOrient === 'vertical' ? doorVertCount : Math.max(1, DRAWER_PATTERNS[drawerPatIdx]?.ratios.length + 1 || 2);
    graphic = (
      <svg width="42" height="30" viewBox="0 0 42 30" className="shrink-0">
        <rect x="2" y="2" width="38" height="26" rx="2" fill="#eef2ff" stroke="#4f46e5" strokeWidth="1.5" />
        {doorOrient === 'vertical'
          ? Array.from({ length: Math.max(0, count - 1) }).map((_, i) => (
              <line
                key={i}
                x1={2 + ((i + 1) * 38) / count}
                y1="2"
                x2={2 + ((i + 1) * 38) / count}
                y2="28"
                stroke="#4f46e5"
                strokeWidth="1.3"
              />
            ))
          : (DRAWER_PATTERNS[drawerPatIdx]?.ratios || [0.5]).map((r, i) => (
              <line key={i} x1="2" y1={2 + r * 26} x2="40" y2={2 + r * 26} stroke="#4f46e5" strokeWidth="1.3" />
            ))}
      </svg>
    );
  } else if (tool === 'door-pencil') {
    const pct = Math.round(doorBandRatio * 100);
    title = doorBandPos === 'top' ? 'مداد کشوی بالا' : 'مداد کشوی پایین';
    sub = `ارتفاع ${pct}٪ · کلیک یا درگ`;
    graphic = (
      <svg width="34" height="32" viewBox="0 0 34 32" className="shrink-0">
        <rect x="4" y="2" width="26" height="28" rx="2" fill="#f8fafc" stroke="#475569" strokeWidth="1.4" />
        {doorBandPos === 'top' ? (
          <>
            <rect x="4" y="2" width="26" height="8" rx="1.5" fill="#c7d2fe" stroke="#4f46e5" strokeWidth="1.4" />
            <line x1="12" y1="6" x2="22" y2="6" stroke="#312e81" strokeWidth="1.5" strokeLinecap="round" />
          </>
        ) : (
          <>
            <rect x="4" y="22" width="26" height="8" rx="1.5" fill="#c7d2fe" stroke="#4f46e5" strokeWidth="1.4" />
            <line x1="12" y1="26" x2="22" y2="26" stroke="#312e81" strokeWidth="1.5" strokeLinecap="round" />
          </>
        )}
      </svg>
    );
  } else if (tool === 'door-style') {
    const meta = DOOR_STYLE_META[doorStyleBrush];
    title = meta.shortLabel;
    sub = meta.desc;
    graphic = (
      <svg width="34" height="32" viewBox="0 0 34 32" className="shrink-0">
        <rect x="3" y="2" width="28" height="28" rx="2" fill="#f1f5f9" stroke="#475569" strokeWidth="1.4" />
        {doorStyleBrush === 'cnc' && <rect x="8" y="7" width="18" height="18" fill="none" stroke="#4f46e5" strokeWidth="1.4" />}
        {(doorStyleBrush === 'glass' || doorStyleBrush === 'glass-grid') && (
          <rect x="7" y="6" width="20" height="20" fill="#bae6fd" stroke="#334155" strokeWidth="1.2" />
        )}
        {doorStyleBrush === 'glass-grid' && (
          <>
            <line x1="17" y1="6" x2="17" y2="26" stroke="#334155" strokeWidth="1" />
            <line x1="7" y1="16" x2="27" y2="16" stroke="#334155" strokeWidth="1" />
          </>
        )}
      </svg>
    );
  } else if (tool === 'finish') {
    if (hoverTarget === 'backsplash') {
      const cfg = BACKSPLASH_FINISHES[backsplashBrush];
      title = `کاشی: ${cfg.shortLabel}`;
      sub = cfg.label;
      graphic = (
        <div
          className="w-8 h-8 rounded-lg border-2 border-slate-700 shrink-0 relative overflow-hidden"
          style={{ backgroundColor: cfg.baseHex }}
        >
          <div className="absolute inset-x-0 top-1/2 h-px" style={{ backgroundColor: cfg.groutHex }} />
          <div className="absolute inset-y-0 left-1/2 w-px" style={{ backgroundColor: cfg.groutHex }} />
        </div>
      );
    } else if (hoverTarget === 'countertop') {
      const cfg = COUNTERTOP_FINISHES[countertopBrush];
      title = `صفحه: ${cfg.shortLabel}`;
      sub = cfg.label;
      graphic = (
        <div
          className="w-8 h-8 rounded-lg border-2 border-slate-700 shrink-0"
          style={{ backgroundColor: cfg.hex }}
        />
      );
    } else {
      const cfg = CABINET_FINISHES[cabinetFinishBrush];
      title = `رنگ: ${cfg.shortLabel}`;
      sub = cfg.label;
      graphic = (
        <div
          className="w-8 h-8 rounded-lg border-2 border-slate-700 shrink-0"
          style={{
            background: `linear-gradient(180deg, ${cfg.hex} 0%, ${cfg.hexDark} 100%)`,
          }}
        />
      );
    }
  } else if (tool === 'frame') {
    title = `فریم ${frameWidthCm}cm`;
    sub = 'پاخور/دور باکس';
    graphic = (
      <svg width="34" height="32" viewBox="0 0 34 32" className="shrink-0">
        <rect x="4" y="3" width="26" height="26" fill="none" stroke="#d97706" strokeWidth="4" />
      </svg>
    );
  } else {
    title = `${shelfCount} طبقه`;
    sub = 'درز=دیواره · وسط=طبقه';
    graphic = (
      <svg width="34" height="32" viewBox="0 0 34 32" className="shrink-0">
        <rect x="4" y="3" width="26" height="26" rx="2" fill="#fef3c7" stroke="#d97706" strokeWidth="1.4" />
        {Array.from({ length: shelfCount }).map((_, i) => (
          <line
            key={i}
            x1="5"
            y1={3 + ((i + 1) * 26) / (shelfCount + 1)}
            x2="29"
            y2={3 + ((i + 1) * 26) / (shelfCount + 1)}
            stroke="#b45309"
            strokeWidth="1.6"
          />
        ))}
      </svg>
    );
  }

  return (
    <div
      data-testid={testId}
      className="fixed z-50 pointer-events-none flex items-center gap-2 bg-white/95 border border-slate-300 rounded-xl shadow-xl px-2.5 py-1.5 text-right select-none"
      style={{ left: `${left}px`, top: `${top}px`, maxWidth: '175px' }}
    >
      {graphic}
      <div className="min-w-0 leading-tight">
        <div className="text-[13px] font-extrabold text-slate-900 truncate">{title}</div>
        <div className="text-[13px] font-bold text-slate-500 truncate">{sub}</div>
        <div className="text-[13px] font-extrabold text-indigo-600 mt-0.5">⇕ اسکرول تغییر</div>
      </div>
    </div>
  );
};
