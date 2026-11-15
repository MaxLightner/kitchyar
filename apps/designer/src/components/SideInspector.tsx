import React, { useEffect, useRef, useState } from 'react';
import {
  AppWindow,
  ArrowLeft,
  ArrowRight,
  Box,
  CheckSquare,
  DoorClosed,
  Droplets,
  Flame,
  Frame,
  GripVertical,
  Layers,
  LayoutGrid,
  Lock,
  LockOpen,
  MousePointer2,
  Paintbrush,
  Palette,
  PanelTop,
  Refrigerator,
  RotateCw,
  Rows3,
  Shirt,
  SlidersHorizontal,
  SquareDashed,
  Trash2,
  WashingMachine,
  X,
} from 'lucide-react';
import {
  APPLIANCE_CONFIGS,
  BACKSPLASH_FINISHES,
  BACKSPLASH_FINISH_ORDER,
  CABINET_FINISHES,
  CABINET_FINISH_ORDER,
  COUNTERTOP_FINISHES,
  COUNTERTOP_FINISH_ORDER,
  DOOR_STYLE_META,
  DOOR_STYLE_ORDER,
  DRAWER_PATTERNS,
  FRAME_WIDTH_OPTIONS,
  FRIDGE_MODELS,
  FRIDGE_MODEL_ORDER,
  GAS_WIDTH_OPTIONS,
  LIFT_PATTERNS,
  MAX_DOOR_CM,
  MAX_LIFT_DOOR_CM,
  MIN_DOOR_CM,
  MIN_LIFT_DOOR_CM,
  SINK_MODELS,
  SINK_MODEL_ORDER,
} from '../cad/constants';
import { OPENING_LABELS } from '../cad/openingRules';
import {
  ApplianceItem,
  ApplianceKind,
  BacksplashFinishId,
  BoxFrameItem,
  BoxKind,
  CabinetBox,
  CabinetFinishId,
  CountertopFinishId,
  DesignStyle,
  DoorKind,
  DoorStyle,
  DoorSwing,
  DoorUnit,
  FridgeModel,
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

type RailTab = 'tool' | 'box' | 'item' | 'multi';

interface SideInspectorProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  activeTool: ToolId;
  onSelectTool?: (t: ToolId) => void;
  activeWall: Wall | null;
  activeBox: CabinetBox | null;
  selectedDoor: DoorUnit | null;
  selectedOpening: WallOpening | null;
  selectedAppliance?: ApplianceItem | null;
  selectedShelfId?: string | null;
  selectedHandleId?: string | null;
  selectedFrame?: BoxFrameItem | null;
  selectedUnitDivider?: { boxId: string; seamCm: number } | null;
  selectedUnit?: { boxId: string; startCm: number; endCm: number } | null;
  multiSelection?: MultiSelection;
  selectionMode: SelectionMode;
  onSetSelectionMode: (m: SelectionMode) => void;
  onSelectAllBoxDoors: () => void;
  doorsLocked: boolean;
  designStyle?: DesignStyle;
  cabinetFinishBrush: CabinetFinishId;
  onSetCabinetFinishBrush: (f: CabinetFinishId) => void;
  backsplashBrush: BacksplashFinishId;
  onSetBacksplashBrush: (f: BacksplashFinishId) => void;
  countertopBrush: CountertopFinishId;
  onSetCountertopBrush: (f: CountertopFinishId) => void;
  projectCabinetFinish: CabinetFinishId;
  projectBacksplashFinish: BacksplashFinishId;
  projectCountertopFinish: CountertopFinishId;
  onApplyFinish: (
    target: 'box' | 'all-cabinets' | 'backsplash' | 'countertop',
    wallId?: string,
    boxId?: string,
    overrideId?: string
  ) => void;
  // Tool states
  drawBoxKind: BoxKind;
  onSelectDrawBoxKind: (k: BoxKind) => void;
  doorOrient: Orientation;
  onSetDoorOrient: (o: Orientation) => void;
  doorTargetWidth: number;
  onSetDoorTargetWidth: (w: number) => void;
  doorVertCount: number;
  onSetDoorVertCount: (c: number) => void;
  drawerPatIdx: number;
  onSetDrawerPatIdx: (i: number) => void;
  liftPatIdx: number;
  onSetLiftPatIdx: (i: number) => void;
  doorBandPos?: 'top' | 'bottom';
  onSetDoorBandPos?: (p: 'top' | 'bottom') => void;
  doorBandRatio?: number;
  onSetDoorBandRatio?: (r: number) => void;
  onClearSelectedDoorBands?: () => void;
  doorStyleBrush: DoorStyle;
  onSetDoorStyleBrush: (s: DoorStyle) => void;
  onApplyDoorStyleToSelected: () => void;
  onApplyDoorStyleToBox: () => void;
  shelfCount: number;
  onSetShelfCount: (c: number) => void;
  frameWidthCm: number;
  onSetFrameWidthCm: (w: number) => void;
  onApplyFullBoxFrame: () => void;
  handleStyle: HandleStyle;
  onSetHandleStyle: (s: HandleStyle) => void;
  handleOrient: Orientation;
  onSetHandleOrient: (o: Orientation) => void;
  onApplyHandlesToSelected: () => void;
  onApplyHandlesToBox: () => void;
  fridgeModel: FridgeModel;
  onSetFridgeModel: (m: FridgeModel) => void;
  fridgeHasFrame: boolean;
  onSetFridgeHasFrame: (v: boolean) => void;
  sinkModel: SinkModel;
  onSetSinkModel: (m: SinkModel) => void;
  gasWidth: number;
  onSetGasWidth: (w: number) => void;
  applianceKind: ApplianceKind;
  onSetApplianceKind: (k: ApplianceKind) => void;
  hoodKind: 'hidden' | 'chimney';
  onSetHoodKind: (h: 'hidden' | 'chimney') => void;
  openingKind: OpeningKind;
  onSetOpeningKind: (k: OpeningKind) => void;
  openingSwing: DoorSwing;
  onSetOpeningSwing: (s: DoorSwing) => void;
  onToggleLock: () => void;
  // Selection actions
  onSetDoorKind: (kind: DoorKind, drawerRatios?: number[]) => void;
  onDeleteSelectedBox: () => void;
  onUpdateOpeningNumeric: (
    field: 'offsetX' | 'width' | 'elevY' | 'height',
    val: number
  ) => void;
  onChangeOpeningSwing: (s: DoorSwing) => void;
  onDeleteSelectedOpening: () => void;
  onChangeSelectedApplianceSinkModel?: (m: SinkModel) => void;
  onChangeSelectedApplianceHood?: (h: 'hidden' | 'chimney') => void;
  onDeleteSelectedAppliance?: () => void;
  onDeleteSelectedShelf?: () => void;
  onDeleteSelectedHandle?: () => void;
  onDeleteSelectedFrame?: () => void;
  onDeleteSelectedUnitDivider?: () => void;
  onMoveUnit?: (dir: 'left' | 'right') => void;
  onOptimizeAppliances: () => void;
  onBulkDelete: () => void;
  onBulkSetDoorKind: (kind: DoorKind, ratios?: number[]) => void;
  onBulkEqualizeDoors: () => void;
  onClearMultiSelection: () => void;
  onDeleteCurrentSelection?: () => void;
  hasAnySelection?: boolean;
}

const BOX_KINDS: Array<{ id: BoxKind; label: string }> = [
  { id: 'base', label: 'زمینی (۸۶×۶۰)' },
  { id: 'wall', label: 'هوایی (۷۵×۳۲)' },
  { id: 'wall-deep', label: 'هوایی عمق‌دار (۴۵×۵۸)' },
  { id: 'tall', label: 'قدی (۲۲۰×۶۰)' },
  { id: 'closet', label: 'کمد دیواری (۲۳۵×۶۰)' },
];

const SWING_LABELS: Array<{ id: DoorSwing; label: string }> = [
  { id: 'left-in', label: 'چپ ← داخل' },
  { id: 'right-in', label: 'راست ← داخل' },
  { id: 'left-out', label: 'چپ ← بیرون' },
  { id: 'right-out', label: 'راست ← بیرون' },
];

export const SideInspector: React.FC<SideInspectorProps> = (props) => {
  const {
    activeTool,
    activeWall,
    activeBox,
    selectedDoor,
    selectedOpening,
    selectedFrame,
    selectedUnit,
    multiSelection,
    selectionMode,
    doorsLocked,
  } = props;

  const [openTab, setOpenTab] = useState<RailTab | null>(null);
  const railRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!openTab) return;
    const onPointerDown = (e: PointerEvent) => {
      if (railRef.current && !railRef.current.contains(e.target as Node)) {
        setOpenTab(null);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [openTab]);

  const toggleTab = (tab: RailTab) => {
    setOpenTab((cur) => (cur === tab ? null : tab));
  };

  const isWallBox = activeBox?.type === 'wall' || activeBox?.type === 'wall-deep';
  const isHorizWallMode = props.doorOrient === 'horizontal' && isWallBox;
  const widthSliderMin = isHorizWallMode ? MIN_LIFT_DOOR_CM : MIN_DOOR_CM;
  const widthSliderMax = isHorizWallMode ? MAX_LIFT_DOOR_CM : MAX_DOOR_CM;
  const widthPresets = isHorizWallMode ? [50, 65, 80, 95, 110] : [30, 40, 45, 50, 60];
  const clampedTargetWidth = Math.max(widthSliderMin, Math.min(widthSliderMax, props.doorTargetWidth));

  const isStepDrawer =
    selectedDoor?.kind === 'drawer' &&
    selectedDoor.drawerRatios.length === 2 &&
    selectedDoor.drawerRatios[0] < 0.28;
  const isEq3Drawer =
    selectedDoor?.kind === 'drawer' &&
    selectedDoor.drawerRatios.length === 2 &&
    selectedDoor.drawerRatios[0] >= 0.28;

  const multiCount =
    (multiSelection?.boxIds.length ?? 0) +
    (multiSelection?.doorIds.length ?? 0) +
    (multiSelection?.openingIds.length ?? 0) +
    (multiSelection?.applianceIds.length ?? 0);

  const selectedDoorCount = multiSelection?.doorIds.length ?? 0;

  const hasSubItem = Boolean(
    props.selectedAppliance ||
      selectedOpening ||
      selectedFrame ||
      props.selectedShelfId ||
      props.selectedHandleId ||
      props.selectedUnitDivider
  );

  const renderToolIcon = () => {
    switch (activeTool) {
      case 'cab-draw':
        return <Box className="w-4 h-4" />;
      case 'doors':
        return <DoorClosed className="w-4 h-4" />;
      case 'door-pencil':
        return <PanelTop className="w-4 h-4" />;
      case 'door-style':
        return <Paintbrush className="w-4 h-4" />;
      case 'finish':
        return <Palette className="w-4 h-4" />;
      case 'fridge':
        return <Refrigerator className="w-4 h-4" />;
      case 'sink':
        return <Droplets className="w-4 h-4" />;
      case 'gas':
        return <Flame className="w-4 h-4" />;
      case 'appliance':
        return <WashingMachine className="w-4 h-4" />;
      case 'opening':
        return <AppWindow className="w-4 h-4" />;
      case 'pencil':
      case 'skeleton':
        return <LayoutGrid className="w-4 h-4" />;
      case 'frame':
        return <Frame className="w-4 h-4" />;
      case 'handle':
        return <GripVertical className="w-4 h-4" />;
      default:
        return <SlidersHorizontal className="w-4 h-4" />;
    }
  };

  const getToolBadge = (): string | null => {
    if (activeTool === 'doors') return `${clampedTargetWidth}`;
    if (activeTool === 'door-pencil') return `${Math.round((props.doorBandRatio ?? 0.26) * 100)}٪`;
    if (activeTool === 'frame') return `${props.frameWidthCm}`;
    if (activeTool === 'gas') return `${props.gasWidth}`;
    if (activeTool === 'pencil' || activeTool === 'skeleton') return `${props.shelfCount}`;
    return null;
  };

  const railBtnCls = (active: boolean) =>
    `relative w-9 h-9 rounded-lg border inline-flex items-center justify-center transition active:scale-95 shrink-0 ${
      active
        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
    }`;

  return (
    <aside
      ref={railRef}
      aria-label="نوار ابزار فتوشاپی و تنظیمات"
      className="relative w-12 bg-white border-l border-slate-200 flex flex-col items-center py-2 gap-2 shrink-0 z-30 select-none"
    >
      {/* ۰. دکمه انتخاب و جابجایی (منتقل‌شده از نوار پایین به پنل سمت راست) */}
      {props.onSelectTool && (
        <button
          type="button"
          onClick={() => props.onSelectTool!('select')}
          aria-pressed={activeTool === 'select'}
          aria-label="ابزار انتخاب و جابجایی"
          title="انتخاب و جابجایی (Select)"
          className={railBtnCls(activeTool === 'select')}
        >
          <MousePointer2 className="w-4 h-4" />
        </button>
      )}

      {/* ۱. آیکون تنظیمات ابزار فعال */}
      <button
        type="button"
        onClick={() => toggleTab('tool')}
        aria-pressed={openTab === 'tool'}
        aria-label="تنظیمات ابزار فعال"
        title="تنظیمات ابزار فعال"
        className={railBtnCls(openTab === 'tool')}
      >
        {renderToolIcon()}
        {getToolBadge() && (
          <span className="absolute -bottom-1 -left-1 px-1 min-w-[16px] h-4 rounded-full bg-slate-900 text-white text-[13px] font-black leading-4 text-center tabular-nums">
            {getToolBadge()}
          </span>
        )}
      </button>

      {/* ۲. آیکون بازرس باکس، یونیت و درب */}
      <button
        type="button"
        onClick={() => toggleTab('box')}
        aria-pressed={openTab === 'box'}
        aria-label="مشخصات باکس و یونیت و درب"
        title="مشخصات باکس و یونیت و درب"
        className={railBtnCls(openTab === 'box')}
      >
        <Layers className="w-4 h-4" />
        {(activeBox || selectedUnit) && (
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />
        )}
      </button>

      {/* ۳. آیکون بازرس بازشو / تجهیز / فریم / طبقه */}
      <button
        type="button"
        onClick={() => toggleTab('item')}
        aria-pressed={openTab === 'item'}
        aria-label="جزئیات تجهیز، بازشو یا فریم"
        title="جزئیات تجهیز، بازشو یا فریم"
        className={railBtnCls(openTab === 'item')}
      >
        <SlidersHorizontal className="w-4 h-4" />
        {hasSubItem && (
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white" />
        )}
      </button>

      {/* ۴. آیکون انتخاب چندتایی (تبلت/گروهی) */}
      <button
        type="button"
        onClick={() => toggleTab('multi')}
        aria-pressed={openTab === 'multi' || selectionMode !== 'single'}
        aria-label="انتخاب چندتایی و عملیات گروهی"
        title="انتخاب چندتایی و عملیات گروهی"
        className={railBtnCls(openTab === 'multi' || selectionMode !== 'single')}
      >
        <CheckSquare className="w-4 h-4" />
        {multiCount > 0 && (
          <span className="absolute -bottom-1 -left-1 px-1 min-w-[16px] h-4 rounded-full bg-emerald-600 text-white text-[13px] font-black leading-4 text-center tabular-nums">
            {multiCount}
          </span>
        )}
      </button>

      {/* ۵. سوئیچ سه‌حالته مشکی برقی انتخاب (بالا: افزودن + / وسط: تکی ● / پایین: کم کردن −) */}
      <div
        role="group"
        aria-label="سوئیچ حالت انتخاب"
        data-testid="selection-mode-switch"
        className="w-9 rounded-xl bg-slate-900 border-2 border-slate-700 p-0.5 flex flex-col gap-0.5 shadow-inner shrink-0"
      >
        <button
          type="button"
          onClick={() => props.onSetSelectionMode('add')}
          aria-pressed={selectionMode === 'add'}
          aria-label="افزودن به انتخاب (جمع +)"
          title="بالا: افزودن به انتخاب (+)"
          data-testid="sel-mode-add"
          className={`h-6 w-full rounded-t-lg text-[13px] font-black flex items-center justify-center transition ${
            selectionMode === 'add'
              ? 'bg-emerald-500 text-white shadow-sm ring-1 ring-emerald-300'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          +
        </button>
        <button
          type="button"
          onClick={() => props.onSetSelectionMode('single')}
          aria-pressed={selectionMode === 'single'}
          aria-label="انتخاب تکی (وسط ●)"
          title="وسط: انتخاب تکی"
          data-testid="sel-mode-single"
          className={`h-5 w-full text-[13px] font-black flex items-center justify-center transition ${
            selectionMode === 'single'
              ? 'bg-slate-200 text-slate-950 shadow-sm'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
          }`}
        >
          ●
        </button>
        <button
          type="button"
          onClick={() => props.onSetSelectionMode('subtract')}
          aria-pressed={selectionMode === 'subtract'}
          aria-label="کم کردن از انتخاب (منها −)"
          title="پایین: کم کردن از انتخاب (−)"
          data-testid="sel-mode-subtract"
          className={`h-6 w-full rounded-b-lg text-[13px] font-black flex items-center justify-center transition ${
            selectionMode === 'subtract'
              ? 'bg-rose-500 text-white shadow-sm ring-1 ring-rose-300'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          −
        </button>
      </div>

      <div className="flex-1" />

      {/* ۵. دکمه حذف سریع انتخاب‌شده روی ریل */}
      {props.hasAnySelection && props.onDeleteCurrentSelection && (
        <button
          type="button"
          onClick={props.onDeleteCurrentSelection}
          aria-label="حذف مورد انتخاب‌شده"
          title="حذف مورد انتخاب‌شده"
          className="w-9 h-9 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 inline-flex items-center justify-center shrink-0 transition active:scale-95"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}

      {/* پنجره شناور بازشونده کنار ریل (مشابه پنل‌های فتوشاپ) */}
      {openTab && (
        <div
          role="dialog"
          aria-label="پنل تنظیمات ابزار"
          className="absolute top-1.5 right-full mr-1.5 w-[256px] max-h-[calc(100vh-140px)] bg-white border border-slate-200 rounded-xl shadow-2xl flex flex-col overflow-hidden z-40"
        >
          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200 shrink-0">
            <span className="text-[13px] font-extrabold text-slate-800">
              {openTab === 'tool' && 'تنظیمات ابزار فعال'}
              {openTab === 'box' && 'باکس، یونیت و درب'}
              {openTab === 'item' && 'تجهیز، بازشو و جزئیات'}
              {openTab === 'multi' && 'انتخاب چندتایی'}
            </span>
            <button
              type="button"
              onClick={() => setOpenTab(null)}
              aria-label="بستن پنل"
              className="w-6 h-6 rounded-md hover:bg-slate-200/70 text-slate-500 inline-flex items-center justify-center"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-3 overflow-y-auto no-scrollbar space-y-3 text-[13px]">
            {openTab === 'tool' && (
              <>
                {activeTool === 'cab-draw' && (
                  <section className="space-y-1.5">
                    <h3 className="text-[13px] font-extrabold text-slate-500">نوع باکس</h3>
                    {BOX_KINDS.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => props.onSelectDrawBoxKind(item.id)}
                        className={`w-full h-9 px-2.5 rounded-lg border text-right text-[13px] font-bold transition ${
                          props.drawBoxKind === item.id
                            ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </section>
                )}

                {activeTool === 'doors' && (
                  <section className="space-y-3">
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => props.onSetDoorOrient('vertical')}
                        className={`h-8 rounded-lg border text-[13px] font-bold ${
                          props.doorOrient === 'vertical'
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        عمودی (درب)
                      </button>
                      <button
                        type="button"
                        onClick={() => props.onSetDoorOrient('horizontal')}
                        className={`h-8 rounded-lg border text-[13px] font-bold ${
                          props.doorOrient === 'horizontal'
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        افقی (کشو/جک)
                      </button>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-bold text-slate-600">
                          {isHorizWallMode ? 'عرض درب افقی هوایی' : 'عرض درب هدف'}
                        </span>
                        <span className="text-[13px] font-extrabold text-indigo-700 tabular-nums">
                          {clampedTargetWidth} cm
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            props.onSetDoorTargetWidth(Math.max(widthSliderMin, clampedTargetWidth - 5))
                          }
                          aria-label="کاهش عرض درب"
                          className="h-7 w-7 rounded-lg border border-slate-300 bg-white font-bold"
                        >
                          -
                        </button>
                        <input
                          type="range"
                          min={widthSliderMin}
                          max={widthSliderMax}
                          step={5}
                          aria-label="عرض درب هدف"
                          value={clampedTargetWidth}
                          onChange={(e) => props.onSetDoorTargetWidth(Number(e.target.value))}
                          className="flex-1 accent-indigo-600"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            props.onSetDoorTargetWidth(Math.min(widthSliderMax, clampedTargetWidth + 5))
                          }
                          aria-label="افزایش عرض درب"
                          className="h-7 w-7 rounded-lg border border-slate-300 bg-white font-bold"
                        >
                          +
                        </button>
                      </div>
                      <div className="grid grid-cols-5 gap-1">
                        {widthPresets.map((w) => (
                          <button
                            key={w}
                            type="button"
                            onClick={() => props.onSetDoorTargetWidth(w)}
                            className={`h-7 rounded border text-[13px] font-bold tabular-nums ${
                              clampedTargetWidth === w
                                ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                                : 'bg-white border-slate-200 text-slate-600'
                            }`}
                          >
                            {w}
                          </button>
                        ))}
                      </div>
                    </div>

                    {props.doorOrient === 'vertical' ? (
                      <div className="space-y-1.5 pt-2 border-t border-slate-100">
                        <span className="text-[13px] font-bold text-slate-600 block">
                          تعداد درب در هر کلیک
                        </span>
                        <div className="grid grid-cols-4 gap-1">
                          {[1, 2, 3, 4].map((cnt) => (
                            <button
                              key={cnt}
                              type="button"
                              onClick={() => props.onSetDoorVertCount(cnt)}
                              className={`h-8 rounded-lg border text-[13px] font-bold tabular-nums ${
                                props.doorVertCount === cnt
                                  ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                                  : 'bg-white border-slate-200 text-slate-700'
                              }`}
                            >
                              {cnt}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5 pt-2 border-t border-slate-100">
                        <span className="text-[13px] font-bold text-slate-600 block">
                          {isWallBox ? 'ردیف افقی هوایی' : 'الگوی کشو'}
                        </span>
                        {(isWallBox ? LIFT_PATTERNS : DRAWER_PATTERNS).map((pat, idx) => {
                          const active = isWallBox ? props.liftPatIdx === idx : props.drawerPatIdx === idx;
                          return (
                            <button
                              key={pat.id}
                              type="button"
                              onClick={() =>
                                isWallBox ? props.onSetLiftPatIdx(idx) : props.onSetDrawerPatIdx(idx)
                              }
                              className={`w-full h-8 px-2 rounded-lg border text-right text-[13px] font-bold ${
                                active
                                  ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                                  : 'bg-white border-slate-200 text-slate-700'
                              }`}
                            >
                              {pat.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </section>
                )}

                {activeTool === 'door-pencil' && (
                  <section className="space-y-2.5">
                    <h3 className="text-[13px] font-extrabold text-indigo-700">
                      مداد هوشمند کشوی درب
                    </h3>
                    <p className="text-[13px] leading-relaxed text-slate-500">
                      روی یک درب کلیک کنید یا روی چند درب پشت‌سرهم درگ افقی بکشید تا بالای همه کشو بخورد.
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => props.onSetDoorBandPos?.('top')}
                        className={`h-8 rounded-lg border text-[13px] font-bold ${
                          (props.doorBandPos ?? 'top') === 'top'
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        کشوی بالا
                      </button>
                      <button
                        type="button"
                        onClick={() => props.onSetDoorBandPos?.('bottom')}
                        className={`h-8 rounded-lg border text-[13px] font-bold ${
                          props.doorBandPos === 'bottom'
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        کشوی پایین
                      </button>
                    </div>
                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-bold text-slate-600">سهم ارتفاع کشو</span>
                        <span className="text-[13px] font-extrabold text-indigo-700 tabular-nums">
                          {Math.round((props.doorBandRatio ?? 0.26) * 100)}٪
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {[0.2, 0.26, 0.33, 0.38].map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => props.onSetDoorBandRatio?.(r)}
                            className={`h-7 rounded border text-[13px] font-bold tabular-nums ${
                              Math.abs((props.doorBandRatio ?? 0.26) - r) < 0.02
                                ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                                : 'bg-white border-slate-200 text-slate-600'
                            }`}
                          >
                            {Math.round(r * 100)}٪
                          </button>
                        ))}
                      </div>
                    </div>
                    {props.onClearSelectedDoorBands && (
                      <button
                        type="button"
                        onClick={props.onClearSelectedDoorBands}
                        className="w-full h-8 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-[13px] font-bold"
                      >
                        حذف کشوی درب(های) انتخاب‌شده
                      </button>
                    )}
                  </section>
                )}

                {activeTool === 'door-style' && (
                  <section className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-extrabold text-indigo-700">قلم مدل درب</span>
                      <span className="text-[13px] font-bold text-slate-500">
                        {props.designStyle === 'neoclassic' ? 'نئوکلاسیک' : 'مدرن'}
                      </span>
                    </div>
                    {DOOR_STYLE_ORDER.map((st) => {
                      const meta = DOOR_STYLE_META[st];
                      return (
                        <button
                          key={st}
                          type="button"
                          onClick={() => props.onSetDoorStyleBrush(st)}
                          className={`w-full px-2.5 py-2 rounded-lg border text-right transition ${
                            props.doorStyleBrush === st
                              ? 'bg-indigo-50 border-indigo-600 text-indigo-800'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="text-[13px] font-extrabold">{meta.label}</div>
                          <div className="text-[13px] opacity-75">{meta.desc}</div>
                        </button>
                      );
                    })}
                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={props.onApplyDoorStyleToSelected}
                        disabled={selectedDoorCount === 0}
                        className="w-full h-8 rounded-lg border border-indigo-300 bg-indigo-50 disabled:opacity-40 text-indigo-800 text-[13px] font-bold"
                      >
                        اعمال روی انتخاب‌شده ({selectedDoorCount})
                      </button>
                      <button
                        type="button"
                        onClick={props.onApplyDoorStyleToBox}
                        disabled={!activeBox || activeBox.doors.length === 0}
                        className="w-full h-8 rounded-lg border border-slate-300 bg-white disabled:opacity-40 text-slate-800 text-[13px] font-bold"
                      >
                        اعمال روی کل باکس
                      </button>
                    </div>
                  </section>
                )}

                {activeTool === 'finish' && (
                  <section className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[13px] font-extrabold text-indigo-700">رنگ و روکش کابینت</span>
                        <span className="text-[13px] font-bold text-slate-500">
                          {CABINET_FINISHES[props.cabinetFinishBrush].shortLabel}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {CABINET_FINISH_ORDER.map((fid) => {
                          const cfg = CABINET_FINISHES[fid];
                          const active = props.cabinetFinishBrush === fid;
                          return (
                            <button
                              key={fid}
                              type="button"
                              onClick={() => props.onSetCabinetFinishBrush(fid)}
                              title={cfg.label}
                              aria-label={`رنگ ${cfg.label}`}
                              aria-pressed={active}
                              className={`h-8 rounded-lg border-2 flex items-center justify-center transition ${
                                active ? 'border-indigo-600 ring-2 ring-indigo-200 scale-105' : 'border-slate-300'
                              }`}
                              style={{
                                background: `linear-gradient(180deg, ${cfg.hex} 0%, ${cfg.hexDark} 100%)`,
                              }}
                            >
                              {active && (
                                <span className="w-2 h-2 rounded-full bg-indigo-600 ring-2 ring-white" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 mt-2">
                        <button
                          type="button"
                          onClick={() => props.onApplyFinish('box', activeWall?.id, activeBox?.id)}
                          disabled={!activeBox}
                          className="h-8 rounded-lg border border-indigo-300 bg-indigo-50 disabled:opacity-40 text-indigo-800 text-[13px] font-bold"
                        >
                          رنگ باکس فعال
                        </button>
                        <button
                          type="button"
                          onClick={() => props.onApplyFinish('all-cabinets')}
                          className="h-8 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-bold"
                        >
                          کل آشپزخانه
                        </button>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[13px] font-extrabold text-teal-700">کاشی بین کابینتی</span>
                        <span className="text-[13px] font-bold text-slate-500">
                          {BACKSPLASH_FINISHES[props.backsplashBrush].shortLabel}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-1">
                        {BACKSPLASH_FINISH_ORDER.map((bid) => {
                          const cfg = BACKSPLASH_FINISHES[bid];
                          const active = props.backsplashBrush === bid;
                          return (
                            <button
                              key={bid}
                              type="button"
                              onClick={() => {
                                props.onSetBacksplashBrush(bid);
                                props.onApplyFinish('backsplash', undefined, undefined, bid);
                              }}
                              className={`h-8 px-1.5 rounded-lg border text-[13px] font-bold flex items-center gap-1 ${
                                active
                                  ? 'border-teal-600 bg-teal-50 text-teal-900'
                                  : 'border-slate-200 bg-white text-slate-700'
                              }`}
                            >
                              <span
                                className="w-3.5 h-3.5 rounded border border-slate-400 shrink-0"
                                style={{ backgroundColor: cfg.baseHex }}
                              />
                              <span className="truncate">{cfg.shortLabel}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[13px] font-extrabold text-slate-700">صفحه روی کابینت</span>
                        <span className="text-[13px] font-bold text-slate-500">
                          {COUNTERTOP_FINISHES[props.countertopBrush].shortLabel}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        {COUNTERTOP_FINISH_ORDER.map((cid) => {
                          const cfg = COUNTERTOP_FINISHES[cid];
                          const active = props.countertopBrush === cid;
                          return (
                            <button
                              key={cid}
                              type="button"
                              onClick={() => {
                                props.onSetCountertopBrush(cid);
                                props.onApplyFinish('countertop', undefined, undefined, cid);
                              }}
                              className={`h-8 px-2 rounded-lg border text-[13px] font-bold flex items-center gap-1.5 ${
                                active
                                  ? 'border-indigo-600 bg-indigo-50 text-indigo-800'
                                  : 'border-slate-200 bg-white text-slate-700'
                              }`}
                            >
                              <span
                                className="w-3.5 h-3.5 rounded border border-slate-400 shrink-0"
                                style={{ backgroundColor: cfg.hex }}
                              />
                              <span className="truncate">{cfg.shortLabel}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </section>
                )}

                {activeTool === 'fridge' && (
                  <section className="space-y-2">
                    <h3 className="text-[13px] font-extrabold text-slate-500">مدل یخچال</h3>
                    {FRIDGE_MODEL_ORDER.map((m) => {
                      const cfg = FRIDGE_MODELS[m];
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => props.onSetFridgeModel(m)}
                          className={`w-full h-9 px-2.5 rounded-lg border text-right text-[13px] font-bold flex items-center justify-between ${
                            props.fridgeModel === m
                              ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          <span>{cfg.shortLabel}</span>
                          <span className="text-[13px] tabular-nums opacity-80">
                            {cfg.width}×{cfg.depth}
                          </span>
                        </button>
                      );
                    })}
                    <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={props.fridgeHasFrame}
                        onChange={(e) => props.onSetFridgeHasFrame(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600"
                      />
                      <span className="text-slate-700 font-semibold">باکس فریم ۵cm دور یخچال</span>
                    </label>
                  </section>
                )}

                {activeTool === 'sink' && (
                  <section className="space-y-1.5">
                    <h3 className="text-[13px] font-extrabold text-teal-700">مدل سینک</h3>
                    {SINK_MODEL_ORDER.map((m) => {
                      const cfg = SINK_MODELS[m];
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => props.onSetSinkModel(m)}
                          className={`w-full h-9 px-2.5 rounded-lg border text-right text-[13px] font-bold flex items-center justify-between ${
                            props.sinkModel === m
                              ? 'bg-teal-50 border-teal-600 text-teal-800'
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          <span>{cfg.shortLabel}</span>
                          <span className="text-[13px] tabular-nums opacity-80">{cfg.width} cm</span>
                        </button>
                      );
                    })}
                  </section>
                )}

                {activeTool === 'gas' && (
                  <section className="space-y-2.5">
                    <span className="text-[13px] font-bold text-slate-600 block">عرض گاز (cm)</span>
                    <div className="grid grid-cols-4 gap-1">
                      {GAS_WIDTH_OPTIONS.map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => props.onSetGasWidth(w)}
                          className={`h-8 rounded-lg border text-[13px] font-bold tabular-nums ${
                            props.gasWidth === w
                              ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                    <span className="text-[13px] font-bold text-slate-600 block">هود متصل</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => props.onSetHoodKind('hidden')}
                        className={`h-8 rounded-lg border text-[13px] font-bold ${
                          props.hoodKind === 'hidden'
                            ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        هود مخفی
                      </button>
                      <button
                        type="button"
                        onClick={() => props.onSetHoodKind('chimney')}
                        className={`h-8 rounded-lg border text-[13px] font-bold ${
                          props.hoodKind === 'chimney'
                            ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        شومینه‌ای
                      </button>
                    </div>
                  </section>
                )}

                {activeTool === 'appliance' && (
                  <section className="space-y-1.5">
                    <h3 className="text-[13px] font-extrabold text-slate-500">تجهیزات زیر صفحه</h3>
                    {(['dishwasher', 'washing'] as ApplianceKind[]).map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => props.onSetApplianceKind(k)}
                        className={`w-full h-9 px-2.5 rounded-lg border text-right text-[13px] font-bold ${
                          props.applianceKind === k
                            ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        {APPLIANCE_CONFIGS[k].label}
                      </button>
                    ))}
                  </section>
                )}

                {activeTool === 'opening' && (
                  <section className="space-y-2">
                    <h3 className="text-[13px] font-extrabold text-slate-500">بازشو و ستون</h3>
                    {(['window', 'door', 'column'] as OpeningKind[]).map((ok) => (
                      <button
                        key={ok}
                        type="button"
                        onClick={() => props.onSetOpeningKind(ok)}
                        className={`w-full h-9 px-2.5 rounded-lg border text-right text-[13px] font-bold ${
                          props.openingKind === ok
                            ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        {OPENING_LABELS[ok]}
                      </button>
                    ))}
                    {props.openingKind === 'door' && (
                      <div className="grid grid-cols-2 gap-1 pt-1">
                        {SWING_LABELS.map((sw) => (
                          <button
                            key={sw.id}
                            type="button"
                            onClick={() => props.onSetOpeningSwing(sw.id)}
                            className={`h-8 rounded border text-[13px] font-bold ${
                              props.openingSwing === sw.id
                                ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            {sw.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                )}

                {(activeTool === 'pencil' || activeTool === 'skeleton') && (
                  <section className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 font-bold">تعداد طبقه در کلیک</span>
                      <span className="text-amber-700 font-extrabold tabular-nums">
                        {props.shelfCount}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1">
                      {[1, 2, 3, 4].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => props.onSetShelfCount(c)}
                          className={`h-8 rounded-lg border text-[13px] font-bold tabular-nums ${
                            props.shelfCount === c
                              ? 'bg-amber-50 border-amber-600 text-amber-800'
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={props.onToggleLock}
                      className="w-full h-9 rounded-lg border border-slate-300 bg-slate-50 text-slate-800 font-bold inline-flex items-center justify-center gap-1.5"
                    >
                      {doorsLocked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
                      <span>{doorsLocked ? 'باز کردن قفل درب‌ها' : 'قفل کردن درب‌ها'}</span>
                    </button>
                  </section>
                )}

                {activeTool === 'frame' && (
                  <section className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600 font-bold">ضخامت فریم</span>
                      <span className="text-amber-700 font-extrabold tabular-nums">
                        {props.frameWidthCm} cm
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1">
                      {FRAME_WIDTH_OPTIONS.map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => props.onSetFrameWidthCm(w)}
                          className={`h-8 rounded-lg border text-[13px] font-bold tabular-nums ${
                            props.frameWidthCm === w
                              ? 'bg-amber-50 border-amber-600 text-amber-900'
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={props.onApplyFullBoxFrame}
                      disabled={!activeBox}
                      className="w-full h-9 rounded-lg border border-amber-300 bg-amber-50 disabled:opacity-40 text-amber-900 font-bold inline-flex items-center justify-center gap-1.5"
                    >
                      <Frame className="w-3.5 h-3.5" />
                      <span>قاب کامل دور باکس ({props.frameWidthCm}cm)</span>
                    </button>
                  </section>
                )}

                {activeTool === 'handle' && (
                  <section className="space-y-2.5">
                    <div className="grid grid-cols-3 gap-1">
                      {(
                        [
                          { id: 'simple', label: 'ساده' },
                          { id: 'knob', label: 'قارچی' },
                          { id: 'hidden', label: 'مخفی' },
                        ] as Array<{ id: HandleStyle; label: string }>
                      ).map((st) => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => props.onSetHandleStyle(st.id)}
                          className={`h-8 rounded-lg border text-[13px] font-bold ${
                            props.handleStyle === st.id
                              ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        props.onSetHandleOrient(props.handleOrient === 'vertical' ? 'horizontal' : 'vertical')
                      }
                      className="w-full h-8 rounded-lg border border-slate-300 bg-white text-slate-800 font-bold inline-flex items-center justify-center gap-1.5"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>جهت: {props.handleOrient === 'vertical' ? 'عمودی' : 'افقی'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={props.onApplyHandlesToSelected}
                      disabled={selectedDoorCount === 0}
                      className="w-full h-8 rounded-lg border border-indigo-300 bg-indigo-50 disabled:opacity-40 text-indigo-800 text-[13px] font-bold"
                    >
                      اعمال روی انتخاب‌شده ({selectedDoorCount})
                    </button>
                    <button
                      type="button"
                      onClick={props.onApplyHandlesToBox}
                      disabled={!activeBox || activeBox.doors.length === 0}
                      className="w-full h-8 rounded-lg border border-slate-300 bg-white disabled:opacity-40 text-slate-800 text-[13px] font-bold"
                    >
                      اعمال روی کل باکس
                    </button>
                  </section>
                )}

                {(activeTool === 'select' || activeTool === 'wall' || activeTool === 'eraser') && (
                  <section className="space-y-2 text-slate-600">
                    <p className="leading-relaxed">
                      {activeTool === 'select' &&
                        'برای جابجایی و تغییر اندازه روی باکس‌ها، درز یونیت‌ها (با مخفی کردن درب‌ها) یا بازشوها کلیک و درگ کنید.'}
                      {activeTool === 'wall' && 'در نمای پلان خطوط دیوار را بکشید.'}
                      {activeTool === 'eraser' && 'روی هر باکس، درب، دستگیره، فریم یا تجهیز کلیک کنید تا حذف شود.'}
                    </p>
                  </section>
                )}
              </>
            )}

            {openTab === 'box' && (
              <div className="space-y-3">
                {selectedUnit && props.onMoveUnit && (
                  <section className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-purple-900">یونیت انتخاب‌شده</span>
                      <span className="font-bold text-purple-700 tabular-nums">
                        {Math.round(selectedUnit.endCm - selectedUnit.startCm)} cm
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => props.onMoveUnit!('right')}
                        className="h-8 rounded-lg border border-purple-300 bg-white hover:bg-purple-100 text-purple-800 font-bold inline-flex items-center justify-center gap-1"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        <span>انتقال راست</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => props.onMoveUnit!('left')}
                        className="h-8 rounded-lg border border-purple-300 bg-white hover:bg-purple-100 text-purple-800 font-bold inline-flex items-center justify-center gap-1"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                        <span>انتقال چپ</span>
                      </button>
                    </div>
                  </section>
                )}

                {activeBox ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-slate-800">باکس: {activeBox.name}</span>
                      <span className="font-bold text-slate-500 tabular-nums">
                        {activeBox.width}×{activeBox.height} · عمق {activeBox.depth}
                      </span>
                    </div>

                    {selectedDoor && selectedDoor.kind !== 'fridge' && (
                      <div className="space-y-1.5 pt-2 border-t border-slate-100">
                        <span className="text-[13px] font-bold text-slate-500 block">
                          نوع درب انتخاب‌شده
                        </span>
                        <div className="grid grid-cols-3 gap-1">
                          <button
                            type="button"
                            onClick={() => props.onSetDoorKind('door', [])}
                            className={`h-8 rounded-lg border text-[13px] font-bold inline-flex items-center justify-center gap-1 ${
                              selectedDoor.kind === 'door'
                                ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            <DoorClosed className="w-3.5 h-3.5" />
                            <span>درب</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => props.onSetDoorKind('drawer', [0.333, 0.667])}
                            className={`h-8 rounded-lg border text-[13px] font-bold inline-flex items-center justify-center gap-1 ${
                              isEq3Drawer
                                ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            <Rows3 className="w-3.5 h-3.5" />
                            <span>۳ کشو</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => props.onSetDoorKind('drawer', [0.22, 0.54])}
                            className={`h-8 rounded-lg border text-[13px] font-bold ${
                              isStepDrawer
                                ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            پلکانی
                          </button>
                          <button
                            type="button"
                            onClick={() => props.onSetDoorKind('lift', [])}
                            className={`h-8 rounded-lg border text-[13px] font-bold ${
                              selectedDoor.kind === 'lift'
                                ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            افقی
                          </button>
                          <button
                            type="button"
                            onClick={() => props.onSetDoorKind('open', [])}
                            className={`h-8 rounded-lg border text-[13px] font-bold inline-flex items-center justify-center gap-1 ${
                              selectedDoor.kind === 'open'
                                ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            <SquareDashed className="w-3.5 h-3.5" />
                            <span>بدون درب</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => props.onSetDoorKind('rail', [])}
                            className={`h-8 rounded-lg border text-[13px] font-bold inline-flex items-center justify-center gap-1 ${
                              selectedDoor.kind === 'rail'
                                ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            <Shirt className="w-3.5 h-3.5" />
                            <span>رگال</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {activeBox.type === 'base' &&
                      activeWall?.appliances.some(
                        (a) =>
                          (a.kind === 'dishwasher' || a.kind === 'washing') &&
                          a.offsetX >= activeBox.offsetX - 1 &&
                          a.offsetX + a.width <= activeBox.offsetX + activeBox.width + 1
                      ) && (
                        <button
                          type="button"
                          onClick={props.onOptimizeAppliances}
                          className="w-full h-8 rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-800 text-[13px] font-bold"
                        >
                          بهینه‌سازی جای تجهیزات
                        </button>
                      )}

                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                      <span className="text-[13px] font-bold text-slate-500 block">رنگ این باکس</span>
                      <div className="grid grid-cols-4 gap-1">
                        {CABINET_FINISH_ORDER.map((fid) => {
                          const cfg = CABINET_FINISHES[fid];
                          const eff = activeBox.finish || props.projectCabinetFinish;
                          const isAct = eff === fid;
                          return (
                            <button
                              key={fid}
                              type="button"
                              title={cfg.label}
                              aria-label={`رنگ باکس ${cfg.label}`}
                              onClick={() =>
                                props.onApplyFinish('box', activeWall?.id, activeBox.id, fid)
                              }
                              className={`h-6 rounded border transition ${
                                isAct ? 'border-indigo-600 ring-1 ring-indigo-400' : 'border-slate-300'
                              }`}
                              style={{
                                background: `linear-gradient(180deg, ${cfg.hex} 0%, ${cfg.hexDark} 100%)`,
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                      <span className="text-[13px] font-bold text-teal-700 block">متریال بین کابینتی</span>
                      <div className="grid grid-cols-3 gap-1">
                        {BACKSPLASH_FINISH_ORDER.map((bid) => {
                          const cfg = BACKSPLASH_FINISHES[bid];
                          const isAct = props.projectBacksplashFinish === bid;
                          return (
                            <button
                              key={bid}
                              type="button"
                              aria-label={`بین‌کابینتی ${cfg.label}`}
                              onClick={() => {
                                props.onSetBacksplashBrush(bid);
                                props.onApplyFinish('backsplash', undefined, undefined, bid);
                              }}
                              className={`h-7 px-1.5 rounded border text-[13px] font-bold flex items-center gap-1 ${
                                isAct
                                  ? 'border-teal-600 bg-teal-50 text-teal-900'
                                  : 'border-slate-200 bg-white text-slate-700'
                              }`}
                            >
                              <span
                                className="w-3 h-3 rounded border border-slate-400 shrink-0"
                                style={{ backgroundColor: cfg.baseHex }}
                              />
                              <span className="truncate">{cfg.shortLabel}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={props.onDeleteSelectedBox}
                      className="w-full h-8 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-[13px] font-bold inline-flex items-center justify-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف باکس</span>
                    </button>
                  </>
                ) : (
                  !selectedUnit && (
                    <p className="text-slate-400 text-center py-4">باکسی انتخاب نشده است</p>
                  )
                )}
              </div>
            )}

            {openTab === 'item' && (
              <div className="space-y-3">
                {props.selectedAppliance && (
                  <section className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-teal-700">
                        {APPLIANCE_CONFIGS[props.selectedAppliance.kind].shortLabel} ({props.selectedAppliance.width}cm)
                      </span>
                      <span className="text-slate-400 tabular-nums">
                        {Math.round(props.selectedAppliance.offsetX)}cm
                      </span>
                    </div>
                    {props.selectedAppliance.kind === 'sink' &&
                      props.onChangeSelectedApplianceSinkModel && (
                        <div className="grid grid-cols-2 gap-1">
                          {SINK_MODEL_ORDER.map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => props.onChangeSelectedApplianceSinkModel!(m)}
                              className={`h-7 px-1.5 rounded border text-[13px] font-bold truncate ${
                                (props.selectedAppliance?.sinkModel || 'steel-2') === m
                                  ? 'bg-teal-50 border-teal-600 text-teal-800'
                                  : 'bg-white border-slate-200 text-slate-700'
                              }`}
                            >
                              {SINK_MODELS[m].shortLabel}
                            </button>
                          ))}
                        </div>
                      )}
                    {props.selectedAppliance.kind === 'gas' &&
                      props.onChangeSelectedApplianceHood && (
                        <div className="grid grid-cols-2 gap-1">
                          <button
                            type="button"
                            onClick={() => props.onChangeSelectedApplianceHood!('hidden')}
                            className={`h-7 rounded border text-[13px] font-bold ${
                              props.selectedAppliance.hoodKind === 'hidden'
                                ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            هود مخفی
                          </button>
                          <button
                            type="button"
                            onClick={() => props.onChangeSelectedApplianceHood!('chimney')}
                            className={`h-7 rounded border text-[13px] font-bold ${
                              (props.selectedAppliance.hoodKind || 'chimney') === 'chimney'
                                ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            شومینه‌ای (اکسپوز)
                          </button>
                        </div>
                      )}
                    {props.onDeleteSelectedAppliance && (
                      <button
                        type="button"
                        onClick={props.onDeleteSelectedAppliance}
                        className="w-full h-8 rounded-lg border border-red-200 bg-red-50 text-red-700 font-bold inline-flex items-center justify-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف تجهیز</span>
                      </button>
                    )}
                  </section>
                )}

                {selectedOpening && (
                  <section className="space-y-2 pt-2 border-t border-slate-100 first:border-t-0 first:pt-0">
                    <span className="font-extrabold text-sky-700 block">
                      {OPENING_LABELS[selectedOpening.kind]}
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-[13px] text-slate-500 block">فاصله</span>
                        <input
                          type="number"
                          min={0}
                          max={activeWall?.length || 500}
                          value={selectedOpening.offsetX}
                          onChange={(e) => props.onUpdateOpeningNumeric('offsetX', Number(e.target.value))}
                          className="w-full h-8 px-2 border border-slate-300 rounded-md font-bold tabular-nums bg-slate-50"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[13px] text-slate-500 block">عرض</span>
                        <input
                          type="number"
                          min={20}
                          max={activeWall?.length || 500}
                          value={selectedOpening.width}
                          onChange={(e) => props.onUpdateOpeningNumeric('width', Number(e.target.value))}
                          className="w-full h-8 px-2 border border-slate-300 rounded-md font-bold tabular-nums bg-slate-50"
                        />
                      </label>
                      {selectedOpening.kind === 'window' && (
                        <label className="block">
                          <span className="text-[13px] text-slate-500 block">ارتفاع کف</span>
                          <input
                            type="number"
                            min={0}
                            max={activeWall?.height || 265}
                            value={selectedOpening.elevY}
                            onChange={(e) => props.onUpdateOpeningNumeric('elevY', Number(e.target.value))}
                            className="w-full h-8 px-2 border border-slate-300 rounded-md font-bold tabular-nums bg-slate-50"
                          />
                        </label>
                      )}
                      {selectedOpening.kind !== 'column' && (
                        <label className="block">
                          <span className="text-[13px] text-slate-500 block">ارتفاع</span>
                          <input
                            type="number"
                            min={40}
                            max={activeWall?.height || 265}
                            value={selectedOpening.height}
                            onChange={(e) => props.onUpdateOpeningNumeric('height', Number(e.target.value))}
                            className="w-full h-8 px-2 border border-slate-300 rounded-md font-bold tabular-nums bg-slate-50"
                          />
                        </label>
                      )}
                    </div>
                    {selectedOpening.kind === 'door' && (
                      <div className="grid grid-cols-2 gap-1">
                        {SWING_LABELS.map((sw) => (
                          <button
                            key={sw.id}
                            type="button"
                            onClick={() => props.onChangeOpeningSwing(sw.id)}
                            className={`h-7 rounded border text-[13px] font-bold ${
                              selectedOpening.swingDir === sw.id
                                ? 'bg-sky-50 border-sky-600 text-sky-700'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            {sw.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={props.onDeleteSelectedOpening}
                      className="w-full h-8 rounded-lg border border-red-200 bg-red-50 text-red-700 font-bold inline-flex items-center justify-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف {OPENING_LABELS[selectedOpening.kind]}</span>
                    </button>
                  </section>
                )}

                {selectedFrame && props.onDeleteSelectedFrame && (
                  <button
                    type="button"
                    onClick={props.onDeleteSelectedFrame}
                    className="w-full h-8 rounded-lg bg-red-600 text-white font-bold inline-flex items-center justify-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف فریم ({selectedFrame.widthCm}cm)</span>
                  </button>
                )}

                {props.selectedShelfId && props.onDeleteSelectedShelf && (
                  <button
                    type="button"
                    onClick={props.onDeleteSelectedShelf}
                    className="w-full h-8 rounded-lg bg-red-600 text-white font-bold inline-flex items-center justify-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف طبقه انتخاب‌شده</span>
                  </button>
                )}

                {props.selectedHandleId && props.onDeleteSelectedHandle && (
                  <button
                    type="button"
                    onClick={props.onDeleteSelectedHandle}
                    className="w-full h-8 rounded-lg bg-red-600 text-white font-bold inline-flex items-center justify-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف دستگیره انتخاب‌شده</span>
                  </button>
                )}

                {props.selectedUnitDivider && props.onDeleteSelectedUnitDivider && (
                  <button
                    type="button"
                    onClick={props.onDeleteSelectedUnitDivider}
                    className="w-full h-8 rounded-lg bg-red-600 text-white font-bold inline-flex items-center justify-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف دیواره یونیت ({props.selectedUnitDivider.seamCm}cm)</span>
                  </button>
                )}

                {!hasSubItem && (
                  <p className="text-slate-400 text-center py-4">تجهیز یا بازشویی انتخاب نشده</p>
                )}
              </div>
            )}

            {openTab === 'multi' && (
              <div className="space-y-2.5">
                <div className="space-y-1">
                  <span className="text-[13px] font-bold text-slate-600 block">
                    حالت انتخاب سه‌وضعته (تبلت)
                  </span>
                  <div className="grid grid-cols-3 gap-1 bg-slate-900 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => props.onSetSelectionMode('add')}
                      aria-pressed={selectionMode === 'add'}
                      className={`h-8 rounded-lg text-[13px] font-extrabold ${
                        selectionMode === 'add'
                          ? 'bg-emerald-500 text-white'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      + جمعی
                    </button>
                    <button
                      type="button"
                      onClick={() => props.onSetSelectionMode('single')}
                      aria-pressed={selectionMode === 'single'}
                      className={`h-8 rounded-lg text-[13px] font-extrabold ${
                        selectionMode === 'single'
                          ? 'bg-white text-slate-900'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      ● تکی
                    </button>
                    <button
                      type="button"
                      onClick={() => props.onSetSelectionMode('subtract')}
                      aria-pressed={selectionMode === 'subtract'}
                      className={`h-8 rounded-lg text-[13px] font-extrabold ${
                        selectionMode === 'subtract'
                          ? 'bg-rose-500 text-white'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      − کم‌کردن
                    </button>
                  </div>
                </div>

                {activeBox && activeBox.doors.length > 0 && (
                  <button
                    type="button"
                    onClick={props.onSelectAllBoxDoors}
                    className="w-full h-8 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 text-[13px] font-bold"
                  >
                    انتخاب همه درب‌های باکس فعال
                  </button>
                )}

                {multiCount > 0 && multiSelection && (
                  <div className="space-y-2 pt-2 border-t border-slate-200">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-indigo-800">{multiCount} مورد</span>
                      <button
                        type="button"
                        onClick={props.onClearMultiSelection}
                        className="text-slate-500 hover:text-slate-800 font-bold"
                      >
                        لغو
                      </button>
                    </div>
                    {multiSelection.doorIds.length > 0 && (
                      <>
                        <div className="grid grid-cols-3 gap-1">
                          <button
                            type="button"
                            onClick={() => props.onBulkSetDoorKind('door', [])}
                            className="h-8 rounded-lg border border-indigo-200 bg-white text-[13px] font-bold"
                          >
                            درب
                          </button>
                          <button
                            type="button"
                            onClick={() => props.onBulkSetDoorKind('drawer', [0.333, 0.667])}
                            className="h-8 rounded-lg border border-indigo-200 bg-white text-[13px] font-bold"
                          >
                            کشو
                          </button>
                          <button
                            type="button"
                            onClick={props.onBulkEqualizeDoors}
                            className="h-8 rounded-lg border border-indigo-200 bg-white text-[13px] font-bold"
                          >
                            مساوی
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={props.onApplyHandlesToSelected}
                          className="w-full h-8 rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-700 text-[13px] font-bold"
                        >
                          نصب دستگیره ({multiSelection.doorIds.length})
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={props.onBulkDelete}
                      className="w-full h-8 rounded-lg bg-red-600 text-white font-bold inline-flex items-center justify-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف گروهی</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
};
