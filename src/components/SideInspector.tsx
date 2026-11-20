import type { CabinetLighting, CabinetLightMode, ProjectSettings } from '../cad/types';
import { SurfaceFinishControls, type SurfaceFinishPatch } from './SurfaceFinishControls';
import { getCabinetLighting } from '../cad/cabinetLighting';
import { APPLIANCE_CATALOG } from '../hoods/catalog';
import { SinkModelChooser } from './SinkModelChooser';
import { FridgeModelChooser } from './FridgeModelChooser';
import { CooktopModelChooser } from './CooktopModelChooser';
import type { CabinetTextureId } from '../cad/types';
import { HANDLE_STYLES } from '../cad/handleGeometry';
import React, { useState } from 'react';
import type { SurfaceSelection } from './SelectionPicker';
import {
  AppWindow,
  ArrowLeft,
  ArrowRight,
  Box,
  Copy,
  DoorClosed,
  Droplets,
  Flame,
  Frame,
  GripVertical,
  Utensils,
  LayoutGrid,
  MousePointer2,
  MousePointerClick,
  Move,
  Paintbrush,
  Palette,
  Refrigerator,
  RotateCw,
  Rows3,
  Shirt,
  SlidersHorizontal,
  SquareDashed,
  Trash2,
  WashingMachine,
  Wrench,
  X,
  ZoomIn,
} from 'lucide-react';
import {
  APPLIANCE_CONFIGS,
  BACKSPLASH_FINISHES,
  BACKSPLASH_FINISH_ORDER,
  CABINET_FINISHES,
  CABINET_FINISH_ORDER,
  COUNTERTOP_FINISHES,
  COUNTERTOP_FINISH_ORDER,
  COUNTERTOP_THICKNESS_OPTIONS,
  DOOR_STYLE_META,
  DOOR_STYLE_ORDER,
  DRAWER_MAX_CM,
  DRAWER_MIN_CM,
  DRAWER_PATTERNS,
  FRAME_WIDTH_OPTIONS,
  FRIDGE_MODELS,
  FRIDGE_MODEL_ORDER,
  GAS_WIDTH_OPTIONS,
  HARDWARE_KIND_META,
  HARDWARE_KIND_ORDER,
  LIFT_PATTERNS,
  MAX_DOOR_CM,
  MAX_LIFT_DOOR_CM,
  MIN_DOOR_CM,
  MIN_LIFT_DOOR_CM,
  SINK_MODELS,
  SINK_MODEL_ORDER,
} from '../cad/constants';
import { getMaxVerticalDoorCount } from '../cad/doorRules';
import { OPENING_LABELS } from '../cad/openingRules';
import {
  ApplianceItem,
  ApplianceKind,
  BacksplashFinishId,
  BoxFrameItem,
  BoxKind,
  CabinetBox,
  CabinetFinishId,
  CountertopEdgeProfile,
  CountertopFinishId,
  DesignStyle,
  DoorKind,
  DoorStyle,
  DoorSwing,
  DoorUnit,
  EquipmentFinish,
  DiningSeats,
  FridgeModel,
  HoodModel,
  CooktopModel,
  HandleStyle,
  HardwareKind,
  MultiSelection,
  OpeningKind,
  Orientation,
  RoomColumn,
  SelectionMode,
  SinkModel,
  ToolId,
  Wall,
  WallOpening,
} from '../cad/types';

interface SideInspectorProps {
  diningSelected?: boolean;
  selectedDiningSeats?: DiningSeats;
  selectedDiningShape?: 'round' | 'rect';
  onSetSelectedDiningShape?: (shape: 'round' | 'rect') => void;
  onSetDiningSeats?: (seats: DiningSeats) => void;
  kitchenLightMode?: CabinetLightMode;
  onSetOvenLight?: (enabled: boolean) => void;
  onRotateDining?: () => void;
  selectedSurface?: SurfaceSelection | null;
  selectedAppliancePart?: 'gas' | 'hood' | null;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  activeTool: ToolId;
  onSelectTool?: (t: ToolId) => void;
  selectionWheelEnabled?: boolean;
  onToggleSelectionWheel?: () => void;
  activeWall: Wall | null;
  activeBox: CabinetBox | null;
  selectedDoor: DoorUnit | null;
  selectedOpening: WallOpening | null;
  selectedColumn?: RoomColumn | null;
  selectedAppliance?: ApplianceItem | null;
  selectedShelfId?: string | null;
  selectedHandleId?: string | null;
  selectedFrame?: BoxFrameItem | null;
  onSetBoxAppearance?: (patch: { color?: string; texture?: CabinetTextureId } & SurfaceFinishPatch) => void;
  onSetCabinetDimension?: (field: 'height' | 'elevY' | 'plinth', value: number) => void;
  surfaceSettings?: ProjectSettings;
  onSetSelectedSurfaceFinish?: (surface: 'countertop' | 'backsplash', patch: SurfaceFinishPatch) => void;
  onSetFrameColor?: (color?: string) => void;
  onSetCabinetLighting?: (patch: Partial<CabinetLighting>) => void;
  onSetBoxFacadeLight?: (enabled: boolean) => void;
  selectedUnitDivider?: { boxId: string; seamCm: number } | null;
  selectedUnit?: { boxId: string; startCm: number; endCm: number } | null;
  multiSelection?: MultiSelection;
  selectionMode: SelectionMode;
  onSetSelectionMode: (m: SelectionMode) => void;
  onSelectAllBoxDoors: () => void;
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
    overrideId?: string,
    doorId?: string
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
  doorStyleBrush: DoorStyle;
  onSetDoorStyleBrush: (s: DoorStyle) => void;
  onApplyDoorStyleToSelected: () => void;
  onApplyDoorStyleToBox: () => void;
  hardwareBrush: HardwareKind;
  onSetHardwareBrush: (h: HardwareKind) => void;
  onApplyHardwareToSelected: () => void;
  onApplyHardwareToBox: () => void;
  onResizeSelectedDrawerDoor?: (desiredWidthCm: number, edge?: 'left' | 'right', commit?: boolean) => void;
  shelfOrient: Orientation;
  onSetShelfOrient: (o: Orientation) => void;
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
  onAutoPlaceHandlesForUnit?: () => void;
  onSmartUnitizeBox?: () => void;
  onSmartUnitizeAll?: () => void;
  allowThreeDoorPantryUnit?: boolean;
  onToggleAllowThreeDoorPantryUnit?: (v: boolean) => void;
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
  // Selection actions
  onSetDoorKind: (
    kind: DoorKind,
    drawerRatios?: number[],
    drawerBand?: { position: 'top' | 'bottom'; ratio: number } | null
  ) => void;
  onDeleteSelectedBox: () => void;
  onUpdateOpeningNumeric: (
    field: 'offsetX' | 'width' | 'elevY' | 'height' | 'depthCm',
    val: number
  ) => void;
  onUpdateRoomColumn?: (
    patch: Partial<Pick<RoomColumn, 'xCm' | 'yCm' | 'widthCm' | 'depthCm' | 'heightCm'>>
  ) => void;
  onDeleteSelectedColumn?: () => void;
  onChangeOpeningSwing: (s: DoorSwing) => void;
  onDeleteSelectedOpening: () => void;
  onChangeSelectedApplianceSinkModel?: (m: SinkModel) => void;
  onChangeSelectedApplianceHood?: (h: 'hidden' | 'chimney') => void;
  onSetSelectedCooktopModel?: (model: CooktopModel) => void;
  onSetSelectedHoodModel?: (model: HoodModel) => void;
  onSetSelectedFlame?: (enabled: boolean) => void;
  onChangeSelectedFridgeModel?: (model: FridgeModel) => void;
  onDeleteSelectedAppliance?: () => void;
  onDeleteSelectedShelf?: () => void;
  onQuickAddMiddleShelfForUnit?: () => void;
  onClearUnitShelves?: () => void;
  onClearBoxShelves?: () => void;
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
  onCopySelection?: () => void;
  onZoomToSelected?: () => void;
  hasAnySelection?: boolean;
  // Unified project-level & equipment settings
  equipmentFinish?: EquipmentFinish;
  onSetEquipmentFinish?: (f: EquipmentFinish) => void;
  onSetSelectedApplianceFinish?: (f: EquipmentFinish) => void;
  canSelectedGasUseChimney?: boolean;
  onToggleSelectedFridgeFrame?: (hasFrame: boolean) => void;
  fridgeHasOverCabinet?: boolean;
  onSetFridgeOverCabinet?: (enabled: boolean) => void;
  onSetFridgeOverDepth?: (mode: '60' | 'flush') => void;
  onSetFridgeFrameDepth?: (cm: 60 | 80) => void;
  onSetFridgeConcealed?: (enabled: boolean) => void;
  onAddUpperCrownAndUnderboard?: () => void;
  countertopCm?: number;
  countertopTopEdge?: CountertopEdgeProfile;
  countertopBottomEdge?: CountertopEdgeProfile;
  onUpdateCountertopSettings?: (patch: {
    countertopCm?: number;
    countertopTopEdge?: CountertopEdgeProfile;
    countertopBottomEdge?: CountertopEdgeProfile;
  }) => void;
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
    selectedColumn,
    selectedFrame,
    selectedUnit,
    multiSelection,
    selectionMode,
  } = props;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const toggleSettings = () => {
    setSettingsOpen((cur) => !cur);
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

  const maxVertDoors = Math.max(
    4,
    getMaxVerticalDoorCount(activeBox ? activeBox.width : 280)
  );
  const dynamicVertOptions = Array.from({ length: Math.min(8, maxVertDoors) }, (_, i) => i + 1);

  const hasSubItem = Boolean(
    props.selectedAppliance ||
      selectedOpening ||
      selectedColumn ||
      selectedFrame ||
      props.selectedShelfId ||
      props.selectedHandleId ||
      props.selectedUnitDivider
  );

  const cabinetLighting = activeBox && (activeBox.type === 'wall' || activeBox.type === 'wall-deep')
    ? getCabinetLighting(activeBox) : null;
  const toolSettings = activeTool !== 'select' && activeTool !== 'move';
  const objectSettings = !toolSettings && !props.selectedSurface && !props.diningSelected;
  const showFridge = objectSettings && !hasSubItem && activeBox?.type === 'fridge';
  // Selection updates only the context badge; inspector visibility is manual.

  const sharedEquipmentColor = showFridge || (objectSettings &&
    (props.selectedAppliance?.kind === 'washing' || props.selectedAppliance?.kind === 'dishwasher'));

  const renderToolIcon = () => {
    switch (activeTool) {
      case 'cab-draw':
        return <Box className="w-4 h-4" />;
      case 'doors':
        return <DoorClosed className="w-4 h-4" />;
      case 'hardware':
        return <Wrench className="w-4 h-4" />;
      case 'door-style':
        return <Paintbrush className="w-4 h-4" />;
      case 'finish':
        return <Palette className="w-4 h-4" />;
      case 'fridge':
        return <Refrigerator className="w-4 h-4" />;
      case 'dining':
        return <Utensils className="w-4 h-4" />;
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
    if (activeTool === 'hardware') return '⚙';
    if (activeTool === 'frame') return `${props.frameWidthCm}`;
    if (activeTool === 'gas') return `${props.gasWidth}`;
    if (activeTool === 'pencil' || activeTool === 'skeleton') {
      return props.shelfOrient === 'vertical' ? 'عمودی' : `${props.shelfCount}`;
    }
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
      aria-label="نوار ابزار فتوشاپی و تنظیمات"
      className="relative flex min-h-0 shrink-0 z-30 select-none"
    >
      <div className="flex w-12 shrink-0 flex-col items-center gap-2 overflow-y-auto bg-white py-2 border-l border-slate-200">
      {/* دکمه زوم روی انتخاب بالای ابزار انتخاب */}
      {props.onZoomToSelected && (
        <button
          type="button"
          data-testid="rail-zoom-selected"
          onClick={props.onZoomToSelected}
          disabled={!props.hasAnySelection}
          aria-label="زوم روی مورد انتخاب‌شده"
          title="زوم روی انتخاب (Z)"
          className={railBtnCls(false) + ' disabled:opacity-35 disabled:cursor-not-allowed'}
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      )}

      {/* ۰. دکمه انتخاب و جابجایی */}
      {props.onSelectTool && (
        <button
          type="button"
          onClick={() => props.onSelectTool!('select')}
          aria-pressed={activeTool === 'select'}
          data-testid="rail-select"
          aria-label="ابزار انتخاب"
          title="انتخاب"
          className={railBtnCls(activeTool === 'select')}
        >
          <MousePointer2 className="w-4 h-4" />
        </button>
      )}

      {props.onToggleSelectionWheel && (
        <button type="button" data-testid="rail-direct-selection"
          onClick={props.onToggleSelectionWheel}
          aria-pressed={props.selectionWheelEnabled === false}
          aria-label="انتخاب مستقیم بدون دایره گزینه‌ها"
          title={props.selectionWheelEnabled === false ? 'انتخاب مستقیم فعال؛ دابل‌کلیک برای باز کردن در' : 'انتخاب مستقیم؛ بدون نمایش دایره گزینه‌ها'}
          className={railBtnCls(props.selectionWheelEnabled === false)}>
          <MousePointerClick className="w-4 h-4" />
        </button>
      )}

      {props.onSelectTool && (
        <button type="button" data-testid="rail-move" onClick={() => props.onSelectTool!('move')}
          aria-pressed={activeTool === 'move'} aria-label="ابزار جابه‌جایی" title="جابه‌جایی و تغییر اندازه"
          className={railBtnCls(activeTool === 'move')}>
          <Move className="w-4 h-4" />
        </button>
      )}

      <button type="button" data-testid="rail-delete" onClick={props.onDeleteCurrentSelection}
        disabled={!props.hasAnySelection} aria-label="حذف مورد انتخاب‌شده" title="حذف (Delete)"
        className={railBtnCls(false) + ' text-red-600 disabled:opacity-35 disabled:cursor-not-allowed'}>
        <Trash2 className="w-4 h-4" />
      </button>
      <button type="button" data-testid="rail-copy" onClick={props.onCopySelection}
        disabled={!props.hasAnySelection} aria-label="کپی مورد انتخاب‌شده" title="کپی (Ctrl+D)"
        className={railBtnCls(false) + ' disabled:opacity-35 disabled:cursor-not-allowed'}>
        <Copy className="w-4 h-4" />
      </button>

      {props.diningSelected && (
        <button type="button" data-testid="rail-rotate-dining" onClick={props.onRotateDining}
          title="چرخاندن میز" aria-label="چرخاندن میز انتخاب‌شده" className={railBtnCls(false)}>
          <RotateCw className="w-4 h-4" />
        </button>
      )}

      {/* دکمه یکپارچه تنظیمات (زیر لامپ) */}
      <button
        type="button"
        data-testid="rail-settings"
        onClick={toggleSettings}
        aria-pressed={settingsOpen}
        aria-label="تنظیمات"
        title="تنظیمات ابزار، صفحه، تجهیزات، باکس و انتخاب"
        className={railBtnCls(settingsOpen)}
      >
        <SlidersHorizontal className="w-4 h-4" />
        {(getToolBadge() || multiCount > 0) ? (
          <span className="absolute -bottom-1 -left-1 px-1 min-w-[16px] h-4 rounded-full bg-slate-900 text-white text-[11px] font-black leading-4 text-center tabular-nums">
            {multiCount > 0 ? multiCount : getToolBadge()}
          </span>
        ) : (hasSubItem || activeBox || selectedUnit) ? (
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white" />
        ) : null}
      </button>

      {/* سوئیچ سه‌حالته مشکی برقی انتخاب (بالا: افزودن + / وسط: تکی ● / پایین: کم کردن −) */}
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
      </div>

      {/* پنل یکپارچه تنظیمات */}
      {settingsOpen && (
        <div
          role="dialog"
          aria-label="پنل تنظیمات"
          data-testid="unified-settings-panel"
          className="flex w-[min(284px,46vw)] min-h-0 shrink-0 flex-col overflow-hidden border-l border-slate-200 bg-white shadow-lg"
        >
          <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200 shrink-0">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-extrabold text-slate-800">
              {renderToolIcon()}
              <span>تنظیمات</span>
            </span>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              aria-label="بستن پنل"
              className="w-6 h-6 rounded-md hover:bg-slate-200/70 text-slate-500 inline-flex items-center justify-center"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-3 overflow-y-auto no-scrollbar space-y-3 text-[13px]">
            {toolSettings && (
              <div className="space-y-3 pb-2 border-b border-slate-200">
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
                        <div className="flex items-center justify-between">
                          <span className="text-[13px] font-bold text-slate-600">
                            تعداد درب (حداکثر ۳۵cm)
                          </span>
                          <span className="text-[13px] font-extrabold text-indigo-700 tabular-nums">
                            {props.doorVertCount}
                          </span>
                        </div>
                        <div className="grid grid-cols-4 gap-1">
                          {dynamicVertOptions.map((cnt) => (
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
                        {maxVertDoors > 8 && (
                          <div className="flex items-center justify-between gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => props.onSetDoorVertCount(Math.max(1, props.doorVertCount - 1))}
                              className="h-7 px-2.5 rounded border border-slate-300 bg-white font-bold"
                            >
                              -
                            </button>
                            <span className="text-[12px] text-slate-500">حداکثر مجاز: {maxVertDoors}</span>
                            <button
                              type="button"
                              onClick={() => props.onSetDoorVertCount(Math.min(maxVertDoors, props.doorVertCount + 1))}
                              className="h-7 px-2.5 rounded border border-slate-300 bg-white font-bold"
                            >
                              +
                            </button>
                          </div>
                        )}
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

                {activeTool === 'hardware' && (
                  <section className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-extrabold text-indigo-700">نوع یراق و بازشو</span>
                    </div>
                    <p className="text-[12px] leading-relaxed text-slate-500">
                      یراق موردنظر را انتخاب و روی هر درب کلیک کنید.
                    </p>
                    {HARDWARE_KIND_ORDER.map((hk) => {
                      const meta = HARDWARE_KIND_META[hk];
                      return (
                        <button
                          key={hk}
                          type="button"
                          onClick={() => props.onSetHardwareBrush(hk)}
                          className={`w-full px-2.5 py-2 rounded-lg border text-right transition ${
                            props.hardwareBrush === hk
                              ? 'bg-indigo-50 border-indigo-600 text-indigo-800'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="text-[13px] font-extrabold">{meta.label}</div>
                          <div className="text-[12px] opacity-75">{meta.desc}</div>
                        </button>
                      );
                    })}
                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={props.onApplyHardwareToSelected}
                        disabled={selectedDoorCount === 0 && !selectedDoor}
                        className="w-full h-8 rounded-lg border border-indigo-300 bg-indigo-50 disabled:opacity-40 text-indigo-800 text-[13px] font-bold"
                      >
                        اعمال روی انتخاب‌شده ({selectedDoorCount || (selectedDoor ? 1 : 0)})
                      </button>
                      <button
                        type="button"
                        onClick={props.onApplyHardwareToBox}
                        disabled={!activeBox || activeBox.doors.length === 0}
                        className="w-full h-8 rounded-lg border border-slate-300 bg-white disabled:opacity-40 text-slate-800 text-[13px] font-bold"
                      >
                        اعمال روی کل باکس
                      </button>
                    </div>
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
                  <section className="space-y-3" data-testid="unified-finish-thumbnails">
                    <div>
                      <h3 className="mb-1 text-[13px] font-bold text-indigo-700">رنگ و روکش کابینت</h3>
                      <div className="grid grid-cols-4 gap-1.5">
                        {CABINET_FINISH_ORDER.map(fid => {
                          const cfg=CABINET_FINISHES[fid];
                          const active=props.cabinetFinishBrush===fid;
                          return (
                            <button type="button" key={fid} title={cfg.label}
                              aria-label={`رنگ ${cfg.label}`} aria-pressed={active}
                              onClick={()=>props.onSetCabinetFinishBrush(fid)}
                              className={`min-w-0 overflow-hidden rounded border-2 bg-white
                                ${active?'border-indigo-600 ring-1 ring-indigo-200':'border-slate-200'}`}>
                              <span className="block w-full aspect-square"
                                style={{background:`linear-gradient(155deg,${cfg.hex},${cfg.hexDark})`}}/>
                              <span className="flex h-8 items-center justify-center px-0.5 text-[10px] font-bold leading-3 text-slate-700">
                                {cfg.shortLabel}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 mt-2">
                        <button type="button" disabled={!activeBox}
                          onClick={()=>props.onApplyFinish('box',activeWall?.id,activeBox?.id)}
                          className="h-8 rounded border border-indigo-300 bg-indigo-50 text-indigo-800 text-xs font-bold disabled:opacity-40">
                          رنگ باکس فعال
                        </button>
                        <button type="button" onClick={()=>props.onApplyFinish('all-cabinets')}
                          className="h-8 rounded bg-indigo-600 text-white text-xs font-bold">
                          کل آشپزخانه
                        </button>
                      </div>
                    </div>
                    <div className="border-t border-slate-100 pt-2">
                      <h3 className="mb-1 text-[13px] font-bold text-teal-700">کاشی بین کابینتی</h3>
                      <div className="grid grid-cols-4 gap-1.5">
                        {BACKSPLASH_FINISH_ORDER.map(bid=>{
                          const cfg=BACKSPLASH_FINISHES[bid];
                          const active=props.backsplashBrush===bid;
                          return (
                            <button type="button" key={bid} title={cfg.label}
                              aria-label={`بین‌کابینتی ${cfg.label}`} aria-pressed={active}
                              onClick={()=>{
                                props.onSetBacksplashBrush(bid);
                                props.onApplyFinish('backsplash',undefined,undefined,bid);
                              }}
                              className={`min-w-0 overflow-hidden rounded border-2 bg-white
                                ${active?'border-teal-600 ring-1 ring-teal-200':'border-slate-200'}`}>
                              <span className="block aspect-square w-full"
                                style={{backgroundColor:cfg.baseHex}}/>
                              <span className="flex h-8 items-center justify-center px-0.5 text-[10px] font-bold leading-3 text-slate-700">
                                {cfg.shortLabel}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="border-t border-slate-100 pt-2">
                      <h3 className="mb-1 text-[13px] font-bold text-slate-700">صفحه روی کابینت</h3>
                      <div className="grid grid-cols-4 gap-1.5">
                        {COUNTERTOP_FINISH_ORDER.map(cid=>{
                          const cfg=COUNTERTOP_FINISHES[cid];
                          const active=props.countertopBrush===cid;
                          return (
                            <button type="button" key={cid} title={cfg.label}
                              aria-label={`صفحه ${cfg.label}`} aria-pressed={active}
                              onClick={()=>{
                                props.onSetCountertopBrush(cid);
                                props.onApplyFinish('countertop',undefined,undefined,cid);
                              }}
                              className={`min-w-0 overflow-hidden rounded border-2 bg-white
                                ${active?'border-indigo-600 ring-1 ring-indigo-200':'border-slate-200'}`}>
                              <span className="block aspect-square w-full"
                                style={{backgroundColor:cfg.hex}}/>
                              <span className="flex h-8 items-center justify-center px-0.5 text-[10px] font-bold leading-3 text-slate-700">
                                {cfg.shortLabel}
                              </span>
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
                    <FridgeModelChooser value={props.fridgeModel} onChange={props.onSetFridgeModel} />
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
                    <h3 className="text-[13px] font-extrabold text-teal-700">انتخاب مدل سینک</h3>
                    <SinkModelChooser value={props.sinkModel} onChange={props.onSetSinkModel} />
                  </section>
                )}

                {activeTool === 'gas' && (
                  <section className="space-y-2.5">
                    <span className="text-[13px] font-bold text-slate-600 block">عرض گاز (cm)</span>
                    <div className="grid grid-cols-3 gap-1">
                      {GAS_WIDTH_OPTIONS.map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => props.onSetGasWidth(w)}
                          className={`h-8 rounded-lg border text-[12px] font-bold tabular-nums ${
                            props.gasWidth === w
                              ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          {w <= 40 ? `${w} القائی` : w}
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
                    <span className="text-[13px] font-bold text-slate-600 block">جهت تقسیم داخل یونیت</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => props.onSetShelfOrient('horizontal')}
                        className={`h-8 rounded-lg border text-[13px] font-bold ${
                          props.shelfOrient === 'horizontal'
                            ? 'bg-amber-600 border-amber-600 text-white'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        طبقه افقی
                      </button>
                      <button
                        type="button"
                        onClick={() => props.onSetShelfOrient('vertical')}
                        className={`h-8 rounded-lg border text-[13px] font-bold ${
                          props.shelfOrient === 'vertical'
                            ? 'bg-amber-600 border-amber-600 text-white'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        جداکننده عمودی
                      </button>
                    </div>

                    {props.shelfOrient === 'horizontal' ? (
                      <>
                        <div className="flex items-center justify-between pt-1">
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
                      </>
                    ) : (
                      <p className="text-[12px] leading-relaxed text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                        روی فضای خالی داخل باکس کلیک کنید تا تیغه عمودی (با اسنپ خودکار روی ۵۰٪ مرکز) نصب شود.
                      </p>
                    )}

                    {props.onAutoPlaceHandlesForUnit && activeBox && activeBox.doors.length > 0 && (
                      <button
                        type="button"
                        onClick={props.onAutoPlaceHandlesForUnit}
                        className="w-full h-9 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-[12px] font-bold"
                      >
                        چیدمان خودکار دستگیره روی یونیت
                      </button>
                    )}

                    {(props.onSmartUnitizeBox || props.onSmartUnitizeAll) && (
                      <div className="pt-2 border-t border-slate-200 space-y-2">
                        <span className="text-[13px] font-extrabold text-emerald-800 block">
                          یونیت‌بندی هوشمند
                        </span>
                        {props.onToggleAllowThreeDoorPantryUnit && (
                          <label className="flex items-center gap-2 text-[12px] font-bold text-slate-700 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              data-testid="toggle-three-door-unit"
                              checked={Boolean(props.allowThreeDoorPantryUnit)}
                              onChange={(e) => props.onToggleAllowThreeDoorPantryUnit?.(e.target.checked)}
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                            />
                            <span>اجازه یونیت ۳دربه (سوپری + جفت)</span>
                          </label>
                        )}
                        <div className="space-y-1.5">
                          {props.onSmartUnitizeBox && (
                            <button
                              type="button"
                              data-testid="side-smart-unitize-box"
                              disabled={!activeBox}
                              onClick={props.onSmartUnitizeBox}
                              className="w-full h-9 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-40 text-emerald-900 text-[12px] font-extrabold"
                            >
                              یونیت‌بندی هوشمند باکس فعال
                            </button>
                          )}
                          {props.onSmartUnitizeAll && (
                            <button
                              type="button"
                              data-testid="side-smart-unitize-all"
                              onClick={props.onSmartUnitizeAll}
                              className="w-full h-9 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-[12px] font-bold"
                            >
                              یونیت‌بندی هوشمند کل آشپزخانه
                            </button>
                          )}
                        </div>
                      </div>
                    )}
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
                        HANDLE_STYLES
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

                {(activeTool === 'wall' || activeTool === 'eraser') && (
                  <section className="space-y-2 text-slate-600">
                    <p className="leading-relaxed">
                      {activeTool === 'wall' && 'در نمای پلان خطوط دیوار را بکشید.'}
                      {activeTool === 'eraser' && 'روی هر باکس، درب، دستگیره، فریم یا تجهیز کلیک کنید تا حذف شود.'}
                    </p>
                  </section>
                )}
              </div>
            )}

            {/* بخش باکس، یونیت و درب انتخاب‌شده */}
            {objectSettings && !hasSubItem && !showFridge && (activeBox || selectedUnit) && (
              <div className="space-y-3 pb-2 border-b border-slate-200">
                {selectedUnit && (
                  <section className="p-2.5 rounded-xl bg-purple-50 border border-purple-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-purple-900">یونیت انتخاب‌شده</span>
                      <span className="font-bold text-purple-700 tabular-nums">
                        {Math.round(selectedUnit.endCm - selectedUnit.startCm)} cm
                      </span>
                    </div>
                    {props.onMoveUnit && (
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
                    )}
                    {props.onAutoPlaceHandlesForUnit && (
                      <button
                        type="button"
                        onClick={props.onAutoPlaceHandlesForUnit}
                        className="w-full h-8 rounded-lg border border-indigo-300 bg-white hover:bg-indigo-50 text-indigo-800 text-[12px] font-bold"
                      >
                        چیدمان خودکار دستگیره یونیت
                      </button>
                    )}
                    {activeBox && activeBox.type !== 'fridge' && (
                      <div className="grid grid-cols-2 gap-1.5">
                        {props.onQuickAddMiddleShelfForUnit && (
                          <button
                            type="button"
                            data-testid="unit-add-shelf-btn"
                            onClick={props.onQuickAddMiddleShelfForUnit}
                            className="h-8 rounded-lg border border-amber-300 bg-white hover:bg-amber-50 text-amber-800 text-[12px] font-bold whitespace-nowrap shrink-0"
                          >
                            افزودن طبقه وسط
                          </button>
                        )}
                        {props.onClearUnitShelves && (
                          <button
                            type="button"
                            data-testid="unit-clear-shelves-btn"
                            onClick={props.onClearUnitShelves}
                            className="h-8 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-700 text-[12px] font-bold whitespace-nowrap shrink-0"
                          >
                            حذف طبقات یونیت
                          </button>
                        )}
                      </div>
                    )}
                  </section>
                )}

                {activeBox && !selectedUnit && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-slate-800">باکس: {activeBox.name}</span>
                      <span className="font-bold text-slate-500 tabular-nums">
                        {activeBox.width}×{activeBox.height} · عمق {activeBox.depth}
                      </span>
                    </div>

                    {!selectedDoor && cabinetLighting && props.onSetCabinetLighting && (
                      <fieldset className="space-y-2 border-t border-slate-100 pt-2">
                        <legend className="text-xs font-bold">نور این باکس هوایی (فیک و بدون چراغ واقعی)</legend>
                        <div className="grid grid-cols-3 gap-1">
                          {([['off', 'خاموش'], ['linear', 'خطی زیر کابینت'], ['halogen', 'هالوژن بین‌کابینتی']] as const)
                            .map(([mode, label]) => (
                              <button key={mode} type="button" aria-pressed={cabinetLighting.mode === mode}
                                data-testid={`cabinet-light-${mode}`}
                                onClick={() => props.onSetCabinetLighting?.({ mode })}
                                className="rounded border border-slate-300 px-1 py-1.5 text-[11px] font-bold aria-pressed:border-indigo-600 aria-pressed:bg-indigo-50 aria-pressed:text-indigo-800">
                                {label}
                              </button>
                            ))}
                        </div>
                        {cabinetLighting.mode !== 'off' && (
                          <label className="block text-xs font-semibold">
                            شدت نور
                            <select aria-label="شدت نور کابینت" className="mt-1 h-8 w-full rounded border border-slate-300 px-1"
                              value={Math.round(cabinetLighting.intensity * 100)}
                              onChange={event => props.onSetCabinetLighting?.({ intensity: Number(event.target.value) / 100 })}>
                              {Array.from({ length: 10 }, (_, index) => (index + 1) * 10)
                                .map(percent => <option key={percent} value={percent}>{percent.toLocaleString('fa-IR')}٪</option>)}
                            </select>
                          </label>
                        )}
                        {props.onSetBoxFacadeLight && (
                          <label className="flex items-center gap-2 text-xs font-bold border-t border-slate-100 pt-2">
                            <input type="checkbox" data-testid="box-facade-fake-light"
                              checked={Boolean(activeBox.facadeLightEnabled)}
                              onChange={e => props.onSetBoxFacadeLight?.(e.target.checked)} />
                            هالوژن فیک روی درهای همین باکس
                          </label>
                        )}
                      </fieldset>
                    )}

                    {!selectedDoor && cabinetLighting && props.onAddUpperCrownAndUnderboard && (
                      <button type="button" data-testid="upper-add-crown-bottom-board"
                        onClick={props.onAddUpperCrownAndUnderboard}
                        className="w-full h-9 rounded-lg border border-indigo-300 bg-indigo-50 text-indigo-700 text-[12px] font-bold">
                        افزودن تاج و تخته زیر هوایی‌ها (فقط فریم‌های موجود بررسی می‌شوند)
                      </button>
                    )}
                    {!selectedDoor && props.onSetCabinetDimension && (
                      <div className="grid grid-cols-2 gap-2">
                        {([
                          ['height', 'ارتفاع باکس', activeBox.height],
                          ...(cabinetLighting ? [['elevY', 'ارتفاع نصب از کف', activeBox.elevY] as const] : []),
                          ...(activeBox.type === 'base' ? [['plinth', 'ارتفاع پاخور', activeBox.plinth] as const] : []),
                        ] as const).map(([field, label, value]) => (
                          <label key={field} className="block text-xs font-semibold">
                            {label} (cm)
                            <input key={activeBox.id + ':' + value} type="number" dir="ltr" step={0.5} defaultValue={value}
                              onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                              onBlur={event => {
                                const next = event.currentTarget.valueAsNumber;
                                if (Number.isFinite(next) && next !== value) props.onSetCabinetDimension?.(field, next);
                                event.currentTarget.value = String(value);
                              }}
                              className="mt-1 h-8 w-full rounded border border-slate-300 px-2 tabular-nums" />
                          </label>
                        ))}
                      </div>
                    )}
                    {!selectedDoor && props.onSetBoxAppearance && (
                      <SurfaceFinishControls key={activeBox.id} index={0}
                        reflection={activeBox.reflection ?? props.surfaceSettings?.cabinetReflection}
                        roughness={activeBox.roughness ?? props.surfaceSettings?.cabinetRoughness}
                        onChange={props.onSetBoxAppearance} />
                    )}

                    {selectedDoor && selectedDoor.kind !== 'fridge' && (
                      <div className="space-y-1.5 pt-2 border-t border-slate-100">
                        <span className="text-[13px] font-bold text-slate-500 block">
                          نوع درب انتخاب‌شده
                        </span>
                        <div className="grid grid-cols-3 gap-1">
                          <button
                            type="button"
                            onClick={() => props.onSetDoorKind('door', [], null)}
                            className={`h-8 rounded-lg border text-[13px] font-bold inline-flex items-center justify-center gap-1 ${
                              selectedDoor.kind === 'door' && !selectedDoor.drawerBand
                                ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            <DoorClosed className="w-3.5 h-3.5" />
                            <span>درب</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => props.onSetDoorKind('drawer', [0.333, 0.667], null)}
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
                            onClick={() => props.onSetDoorKind('drawer', [0.22, 0.54], null)}
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
                            onClick={() =>
                              props.onSetDoorKind('door', [], { position: 'top', ratio: 0.26 })
                            }
                            className={`h-8 rounded-lg border text-[13px] font-bold ${
                              selectedDoor.kind === 'door' && selectedDoor.drawerBand?.position === 'top'
                                ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            تک کشو بالا
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              props.onSetDoorKind('door', [], { position: 'bottom', ratio: 0.26 })
                            }
                            className={`h-8 rounded-lg border text-[13px] font-bold ${
                              selectedDoor.kind === 'door' && selectedDoor.drawerBand?.position === 'bottom'
                                ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                                : 'bg-white border-slate-200 text-slate-700'
                            }`}
                          >
                            تک کشو پایین
                          </button>
                          <button
                            type="button"
                            onClick={() => props.onSetDoorKind('lift', [], null)}
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
                            onClick={() => props.onSetDoorKind('open', [], null)}
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
                            onClick={() => props.onSetDoorKind('rail', [], null)}
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

                        {selectedDoor.kind === 'drawer' && props.onResizeSelectedDrawerDoor && (
                          <div className="space-y-1.5 pt-2 border-t border-slate-100">
                            <div className="flex items-center justify-between">
                              <span className="text-[13px] font-bold text-slate-600">عرض کشو (۴۰–۱۱۰cm)</span>
                              <span className="text-[13px] font-extrabold text-indigo-700 tabular-nums">
                                {Math.round(selectedDoor.widthCm)} cm
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  props.onResizeSelectedDrawerDoor!(Math.max(DRAWER_MIN_CM, Math.round(selectedDoor.widthCm) - 5), 'right', true)
                                }
                                className="h-7 w-7 rounded border border-slate-300 bg-white font-bold"
                              >
                                -
                              </button>
                              <input
                                type="range"
                                min={DRAWER_MIN_CM}
                                max={DRAWER_MAX_CM}
                                step={1}
                                value={Math.round(selectedDoor.widthCm)}
                                onChange={(e) =>
                                  props.onResizeSelectedDrawerDoor!(Number(e.target.value), 'right', true)
                                }
                                className="flex-1 accent-indigo-600"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  props.onResizeSelectedDrawerDoor!(Math.min(DRAWER_MAX_CM, Math.round(selectedDoor.widthCm) + 5), 'right', true)
                                }
                                className="h-7 w-7 rounded border border-slate-300 bg-white font-bold"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="pt-2 border-t border-slate-100 space-y-1.5">
                          <div className="flex items-center justify-between text-[12px]">
                            <span className="font-bold text-slate-500">نوع یراق فعلی:</span>
                            <span className="font-extrabold text-indigo-700">
                              {HARDWARE_KIND_META[selectedDoor.hardwareKind || 'hinged'].shortLabel}
                            </span>
                          </div>
                          {props.onSelectTool && (
                            <button
                              type="button"
                              onClick={() => {
                                props.onSelectTool!('hardware');
                                setSettingsOpen(true);
                              }}
                              className="w-full h-8 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-800 text-[12px] font-bold"
                            >
                              تغییر نوع یراق (سوپری / جک / مگنتی)
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {!selectedDoor && activeBox.type === 'base' &&
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
                      <span className="text-[13px] font-bold text-slate-500 block">{selectedDoor ? 'رنگ این در' : 'رنگ این باکس'}</span>
                      <div className="grid grid-cols-4 gap-1">
                        {CABINET_FINISH_ORDER.map((fid) => {
                          const cfg = CABINET_FINISHES[fid];
                          const eff = selectedDoor?.finish || activeBox.finish || props.projectCabinetFinish;
                          const isAct = eff === fid;
                          return (
                            <button
                              key={fid}
                              type="button"
                              title={cfg.label}
                              aria-label={`رنگ باکس ${cfg.label}`}
                              onClick={() =>
                                props.onApplyFinish('box', activeWall?.id, activeBox.id, fid, selectedDoor?.id)
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

                    {activeBox.type !== 'fridge' && (
                      <div className="space-y-1.5 pt-2 border-t border-slate-100">
                        <div className="flex items-center justify-between text-[12px]">
                          <span className="font-bold text-slate-600">طبقات داخلی باکس</span>
                          <span className="font-bold text-slate-500 tabular-nums">
                            {activeBox.shelves.length} طبقه
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {props.onQuickAddMiddleShelfForUnit && selectedDoor && selectedDoor.kind !== 'drawer' && (
                            <button
                              type="button"
                              data-testid="box-add-shelf-btn"
                              onClick={props.onQuickAddMiddleShelfForUnit}
                              className="h-8 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[12px] font-bold whitespace-nowrap shrink-0"
                            >
                              افزودن طبقه وسط
                            </button>
                          )}
                          {!selectedDoor && props.onClearBoxShelves && activeBox.shelves.length > 0 && (
                            <button
                              type="button"
                              data-testid="box-clear-shelves-btn"
                              onClick={props.onClearBoxShelves}
                              className={`h-8 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-[12px] font-bold whitespace-nowrap shrink-0 ${
                                props.onQuickAddMiddleShelfForUnit && selectedDoor
                                  ? ''
                                  : 'col-span-2'
                              }`}
                            >
                              حذف طبقات ({activeBox.shelves.length})
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {!selectedDoor && props.onSetBoxAppearance && (
                      <div className="grid grid-cols-2 items-center gap-1.5 pt-2 border-t border-slate-100">
                        <label className="text-xs font-bold">رنگ دستی باکس
                          <input aria-label="رنگ دستی کابینت" type="color" className="block h-8 w-full mt-1 rounded"
                            value={activeBox.color ?? (CABINET_FINISHES[activeBox.finish ?? props.projectCabinetFinish]?.hex ?? '#cccccc')}
                            onChange={e => props.onSetBoxAppearance?.({ color: e.target.value })} />
                        </label>
                        <label className="text-xs font-bold">تکسچر باکس
                          <select className="block h-8 w-full rounded border border-slate-300 mt-1" value={activeBox.texture ?? ''}
                            onChange={e => props.onSetBoxAppearance?.({ texture: (e.target.value || undefined) as CabinetTextureId | undefined })}>
                            <option value="">استایل</option>
                            <option value="smooth">صاف</option>
                            <option value="satin">ساتن</option>
                            <option value="oak">بلوط</option>
                            <option value="walnut">گردو</option>
                          </select>
                        </label>
                        {activeBox.color && (
                          <button type="button" className="col-span-2 text-xs text-indigo-700 font-bold text-right" onClick={() => props.onSetBoxAppearance?.({ color: undefined })}>
                            بازگشت به رنگ استایل
                          </button>
                        )}
                      </div>
                    )}

                    {!selectedDoor && <button
                      type="button"
                      onClick={props.onDeleteSelectedBox}
                      className="w-full h-8 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-[13px] font-bold inline-flex items-center justify-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>حذف باکس</span>
                    </button>}
                  </>
                )}
              </div>
            )}

            {/* بخش تنظیمات تجهیزات و بازشوهای انتخاب‌شده */}
            {objectSettings && (hasSubItem || showFridge) && (
              <div className="space-y-3 pt-1">
                {props.selectedAppliance && (
                  <section className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-teal-700">
                        {props.selectedAppliancePart === 'hood' ? 'هود' : APPLIANCE_CONFIGS[props.selectedAppliance.kind].shortLabel} ({props.selectedAppliance.width}cm)
                      </span>
                      <span className="text-slate-400 tabular-nums">
                        {Math.round(props.selectedAppliance.offsetX)}cm
                      </span>
                    </div>
                    {(props.selectedAppliance.kind === 'builtin-oven' || props.selectedAppliance.kind === 'microwave') && props.onSetOvenLight && (
                       <label className="flex items-center gap-2 font-bold">
                         <input type="checkbox" checked={Boolean(props.selectedAppliance.ovenLightOn)}
                           onChange={event => props.onSetOvenLight?.(event.target.checked)} />
                         چراغ داخل فر
                       </label>
                     )}
                    {(['sink', 'gas', 'washing', 'dishwasher'] as ApplianceKind[]).includes(props.selectedAppliance.kind) && props.onSetSelectedApplianceFinish && (
                      <div className="space-y-1" data-testid="selected-appliance-finish">
                        <span className="block text-xs font-bold text-slate-500">
                          {props.selectedAppliance.kind === 'gas' && props.selectedAppliancePart === 'hood' ? 'رنگ هود' : 'رنگ همین تجهیز'}
                        </span>
                        <div className="grid grid-cols-3 gap-1">
                          {([['silver', 'نقره‌ای'], ['white', 'سفید'], ['black', 'مشکی']] as const).map(([finish, label]) => {
                            const current = props.selectedAppliance?.kind === 'sink'
                              ? props.selectedAppliance.sinkFinish
                              : props.selectedAppliance?.kind === 'gas' && props.selectedAppliancePart === 'hood'
                                ? props.selectedAppliance.hoodFinish
                                : props.selectedAppliance?.finish;
                            return <button type="button" key={finish}
                              data-testid={`selected-appliance-finish-${finish}`}
                              onClick={() => props.onSetSelectedApplianceFinish?.(finish)}
                              aria-pressed={(current ?? props.equipmentFinish ?? 'silver') === finish}
                              className={`h-8 rounded border text-xs font-bold ${(current ?? props.equipmentFinish ?? 'silver') === finish ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-700'}`}>{label}</button>;
                          })}
                        </div>
                      </div>
                    )}
                    {props.selectedAppliance.kind === 'sink' &&
                      props.onChangeSelectedApplianceSinkModel && (
                        <section className="space-y-1.5">
                          <h4 className="text-xs font-bold">تعویض مدل سینک انتخاب‌شده</h4>
                          <SinkModelChooser
                            value={props.selectedAppliance.sinkModel ?? 'sink-double-flat-chrome'}
                            onChange={props.onChangeSelectedApplianceSinkModel} />
                        </section>
                      )}
                    {props.selectedAppliance.kind === 'gas' && props.selectedAppliancePart !== 'hood' &&
                      props.onSetSelectedCooktopModel && (
                      <div className="space-y-1">
                        <span className="text-[12px] font-bold">مدل صفحه گاز</span>
                        <CooktopModelChooser
                          value={props.selectedAppliance.cooktopModel ?? 'hob-glass-5'}
                          onChange={props.onSetSelectedCooktopModel} />
                        {props.onSetSelectedFlame && (
                          <label className="flex items-center gap-2 text-[12px] font-bold">
                            <input type="checkbox" data-testid="selected-gas-ignition"
                              checked={Boolean(props.selectedAppliance.flameOn)}
                              onChange={e=>props.onSetSelectedFlame?.(e.target.checked)} />
                            {props.selectedAppliance.flameOn ? 'روشن — دوبار لمس برای خاموش‌کردن' : 'خاموش — دوبار لمس برای روشن‌کردن'}
                          </label>
                        )}
                      </div>
                    )}
                    {props.selectedAppliance.kind === 'gas' && props.selectedAppliancePart !== 'gas' &&
                      props.onSetSelectedHoodModel && (
                      <div className="space-y-1">
                        <label htmlFor="selected-hood-model" className="text-[12px] font-bold">مدل هود</label>
                        <select id="selected-hood-model" data-testid="selected-hood-model"
                          className="w-full h-9 border rounded-lg px-2 text-xs"
                          value={props.selectedAppliance.hoodModel && APPLIANCE_CATALOG.some(x=>x.id===props.selectedAppliance?.hoodModel && x.category==='hood') ? props.selectedAppliance.hoodModel : 'curved-black'}
                          onChange={e=>props.onSetSelectedHoodModel?.(e.target.value as HoodModel)}>
                          {APPLIANCE_CATALOG.filter(x=>x.category==='hood').map(x=><option key={x.id} value={x.id}>{x.titleFa}</option>)}
                        </select>
                      </div>
                    )}
                    {props.selectedAppliance.kind === 'gas' && props.selectedAppliancePart !== 'gas' &&
                      props.onChangeSelectedApplianceHood && (
                        <div className="space-y-1">
                          <span className="text-[12px] font-bold text-slate-500 block">نوع هود بالای گاز</span>
                          <div className="grid grid-cols-2 gap-1">
                            <button
                              type="button"
                              onClick={() => props.onChangeSelectedApplianceHood!('hidden')}
                              className={`h-8 rounded border text-[13px] font-bold ${
                                props.selectedAppliance.hoodKind === 'hidden'
                                  ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                                  : 'bg-white border-slate-200 text-slate-700'
                              }`}
                            >
                              هود مخفی
                            </button>
                            <button
                              type="button"
                              disabled={props.canSelectedGasUseChimney === false}
                              onClick={() => props.onChangeSelectedApplianceHood!('chimney')}
                              className={`h-8 rounded border text-[13px] font-bold disabled:opacity-40 ${
                                (props.selectedAppliance.hoodKind || 'chimney') === 'chimney'
                                  ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                                  : 'bg-white border-slate-200 text-slate-700'
                              }`}
                            >
                              شومینه‌ای (اکسپوز)
                            </button>
                          </div>
                        </div>
                      )}
                    {props.onDeleteSelectedAppliance && props.selectedAppliancePart !== 'hood' && (
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

                {showFridge && activeBox && (
                  <section className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-indigo-700">تنظیمات یخچال انتخاب‌شده</span>
                      <span className="text-[12px] font-bold text-slate-500">
                        {FRIDGE_MODELS[activeBox.fridgeModel || 'fridge-sbs-homebar'].shortLabel}
                      </span>
                    </div>
                    {props.onChangeSelectedFridgeModel && (
                      <select data-testid="selected-fridge-model" aria-label="مدل یخچال"
                        value={FRIDGE_MODEL_ORDER.includes(activeBox.fridgeModel ?? 'fridge-sbs-homebar') ? activeBox.fridgeModel : 'fridge-sbs-homebar'}
                        onChange={e=>props.onChangeSelectedFridgeModel?.(e.target.value as FridgeModel)}
                        className="w-full h-9 rounded-lg border border-slate-300 px-2 text-xs">
                        {FRIDGE_MODEL_ORDER.map(m=><option key={m} value={m}>{FRIDGE_MODELS[m].label}</option>)}
                      </select>
                    )}
                    {props.onChangeSelectedFridgeModel && (
                      <FridgeModelChooser
                        value={activeBox.fridgeModel ?? 'fridge-sbs-homebar'}
                        onChange={props.onChangeSelectedFridgeModel} />
                    )}
                    {props.onToggleSelectedFridgeFrame && (
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={Boolean(activeBox.hasFridgeFrame)}
                          onChange={(e) => props.onToggleSelectedFridgeFrame!(e.target.checked)}
                          className="rounded border-slate-300 text-indigo-600"
                        />
                        <span className="text-slate-700 font-semibold text-[12px]">
                          باکس فریم ۵cm دور یخچال
                        </span>
                      </label>
                    )}
                    {props.onSetFridgeFrameDepth && Boolean(activeBox.hasFridgeFrame) && (
                      <label className="block text-xs font-semibold">
                        عمق فریم دور یخچال
                        <select value={activeBox.fridgeFrameDepthCm ?? 60}
                          data-testid="fridge-frame-depth"
                          disabled={Boolean(activeBox.fridgeConcealed)}
                          onChange={event => props.onSetFridgeFrameDepth?.(Number(event.target.value) as 60|80)}
                          className="mt-1 w-full h-9 rounded-lg border border-slate-300 px-2">
                          <option value={60}>۶۰ سانتی‌متر — یخچال حداقل ۱۵cm جلوتر</option>
                          <option value={80}>۸۰ سانتی‌متر — یخچال حداقل ۱۵cm جلوتر</option>
                        </select>
                        {activeBox.fridgeConcealed && <span className="block mt-1 text-slate-500">فریم یخچال مخفی با در MDF هم‌سطح می‌شود</span>}
                      </label>
                    )}
                    {props.onSetFridgeOverCabinet && (
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input type="checkbox" data-testid="fridge-overcabinet-toggle"
                          checked={props.fridgeHasOverCabinet === true}
                          onChange={event=>props.onSetFridgeOverCabinet?.(event.target.checked)} />
                        <span className="text-[12px] font-semibold">کابینت بالای یخچال</span>
                      </label>
                    )}
                    {props.fridgeHasOverCabinet && props.onSetFridgeOverDepth && (
                      <label className="block text-[12px] font-semibold">
                        عمق کابینت بالای یخچال
                        <select data-testid="fridge-over-depth" className="mt-1 w-full rounded border border-slate-300 p-1"
                          value={activeBox.overFridgeDepthMode ?? '60'}
                          onChange={event=>props.onSetFridgeOverDepth?.(event.target.value as '60'|'flush')}>
                          <option value="60">۶۰ سانتی‌متر</option>
                          <option value="flush">تا جلوی یخچال</option>
                        </select>
                      </label>
                    )}
                    {props.onSetFridgeConcealed && (
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input type="checkbox" data-testid="fridge-concealed"
                          checked={Boolean(activeBox.fridgeConcealed)}
                          disabled={!['fridge-sbs-homebar','fridge-instaview-black',
                            'fridge-french-4drawer','side-by-side'].includes(activeBox.fridgeModel ?? '')}
                          onChange={event=>props.onSetFridgeConcealed?.(event.target.checked)} />
                        <span className="text-[12px] font-semibold">یخچال مخفی با درب همرنگ کابینت</span>
                      </label>
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
                          <span className="text-[13px] text-slate-500 block">OKB (از کف)</span>
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
                      {selectedOpening.kind !== 'column' ? (
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
                      ) : (
                        <label className="block">
                          <span className="text-[13px] text-slate-500 block">عمق (گام ۱cm)</span>
                          <input
                            type="number"
                            min={10}
                            max={120}
                            step={1}
                            value={selectedOpening.depthCm ?? 35}
                            onChange={(e) => props.onUpdateOpeningNumeric('depthCm', Number(e.target.value))}
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

                {selectedColumn && props.onUpdateRoomColumn && (
                  <section className="space-y-2 pt-2 border-t border-slate-100 first:border-t-0 first:pt-0">
                    <span className="font-extrabold text-amber-800 block">ستون آزاد کف</span>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-[12px] text-slate-500 block">عرض (cm)</span>
                        <input
                          type="number"
                          min={15}
                          max={200}
                          step={1}
                          value={selectedColumn.widthCm}
                          onChange={(e) => props.onUpdateRoomColumn!({ widthCm: Number(e.target.value) })}
                          className="w-full h-8 px-2 border border-slate-300 rounded-md font-bold tabular-nums bg-slate-50"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[12px] text-slate-500 block">عمق (گام ۱cm)</span>
                        <input
                          type="number"
                          min={10}
                          max={120}
                          step={1}
                          value={selectedColumn.depthCm}
                          onChange={(e) => props.onUpdateRoomColumn!({ depthCm: Number(e.target.value) })}
                          className="w-full h-8 px-2 border border-slate-300 rounded-md font-bold tabular-nums bg-slate-50"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[12px] text-slate-500 block">مختصات X</span>
                        <input
                          type="number"
                          step={1}
                          value={selectedColumn.xCm}
                          onChange={(e) => props.onUpdateRoomColumn!({ xCm: Number(e.target.value) })}
                          className="w-full h-8 px-2 border border-slate-300 rounded-md font-bold tabular-nums bg-slate-50"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[12px] text-slate-500 block">مختصات Y</span>
                        <input
                          type="number"
                          step={1}
                          value={selectedColumn.yCm}
                          onChange={(e) => props.onUpdateRoomColumn!({ yCm: Number(e.target.value) })}
                          className="w-full h-8 px-2 border border-slate-300 rounded-md font-bold tabular-nums bg-slate-50"
                        />
                      </label>
                    </div>
                    {props.onDeleteSelectedColumn && (
                      <button
                        type="button"
                        onClick={props.onDeleteSelectedColumn}
                        className="w-full h-8 rounded-lg border border-red-200 bg-red-50 text-red-700 font-bold inline-flex items-center justify-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>حذف ستون آزاد</span>
                      </button>
                    )}
                  </section>
                )}

                {selectedFrame && props.onSetFrameColor && (
                  <label className="block border-t pt-2 text-xs font-bold">رنگ همین فریم
                    <input aria-label="رنگ فریم انتخاب‌شده" type="color" className="block h-8 w-full"
                      value={selectedFrame.color ?? '#64748b'} onChange={e => props.onSetFrameColor?.(e.target.value)} />
                  </label>
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
              </div>
            )}

            {!toolSettings && props.selectedSurface === 'backsplash' && (
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <span className="text-[13px] font-bold text-teal-700 block">متریال بین کابینتی</span>
                {props.onSetSelectedSurfaceFinish && (
                  <SurfaceFinishControls index={2} reflection={props.surfaceSettings?.backsplashReflection}
                    roughness={props.surfaceSettings?.backsplashRoughness}
                    onChange={patch => props.onSetSelectedSurfaceFinish?.('backsplash', patch)} />
                )}
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

            )}

            {!toolSettings && props.selectedSurface === 'countertop' && (
            <section data-testid="countertop-settings-section" className="space-y-2.5 pt-2 border-t border-slate-200">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-extrabold text-slate-800">صفحه روی کابینت</span>
                <span className="text-[12px] font-extrabold text-indigo-700 tabular-nums">
                  {props.countertopCm ?? 3} cm
                </span>
              </div>

              {props.onSetSelectedSurfaceFinish && (
                 <SurfaceFinishControls index={1} reflection={props.surfaceSettings?.countertopReflection}
                   roughness={props.surfaceSettings?.countertopRoughness}
                   onChange={patch => props.onSetSelectedSurfaceFinish?.('countertop', patch)} />
               )}
               {props.onUpdateCountertopSettings && (
                <>
                  <div className="space-y-1.5">
                    <span className="text-[12px] font-bold text-slate-500 block">ضخامت صفحه (سانتی‌متر)</span>
                    <div className="grid grid-cols-3 gap-1">
                      {COUNTERTOP_THICKNESS_OPTIONS.map((cm) => (
                        <button key={cm} type="button"
                          data-testid={`countertop-thickness-${cm}`}
                          aria-label={`ضخامت صفحه ${cm} سانتی‌متر`}
                          aria-pressed={props.countertopCm === cm}
                          onClick={() => props.onUpdateCountertopSettings?.({ countertopCm: cm })}
                          className={`h-9 rounded border text-[13px] font-bold tabular-nums ${
                            props.countertopCm === cm
                              ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                              : 'bg-white border-slate-200 text-slate-600'
                          }`}>
                          {cm} cm
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[12px] font-bold text-slate-500 block">لبه بالایی صفحه</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        data-testid="countertop-top-square"
                        onClick={() => props.onUpdateCountertopSettings!({ countertopTopEdge: 'square' })}
                        aria-pressed={(props.countertopTopEdge ?? 'square') === 'square'}
                        className={`h-8 rounded-lg border text-[12px] font-bold inline-flex items-center justify-center gap-1.5 ${
                          (props.countertopTopEdge ?? 'square') === 'square'
                            ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0">
                          <path d="M2 13V4H13V13" stroke="currentColor" strokeWidth="2" />
                        </svg>
                        <span>مربعی</span>
                      </button>
                      <button
                        type="button"
                        data-testid="countertop-top-round"
                        onClick={() => props.onUpdateCountertopSettings!({ countertopTopEdge: 'round' })}
                        aria-pressed={props.countertopTopEdge === 'round'}
                        className={`h-8 rounded-lg border text-[12px] font-bold inline-flex items-center justify-center gap-1.5 ${
                          props.countertopTopEdge === 'round'
                            ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0">
                          <path d="M2 13V4H8C11.3 4 13 5.7 13 9V13" stroke="currentColor" strokeWidth="2" />
                        </svg>
                        <span>گوشه گرد</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[12px] font-bold text-slate-500 block">لبه پایینی صفحه</span>
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        data-testid="countertop-bottom-square"
                        onClick={() => props.onUpdateCountertopSettings!({ countertopBottomEdge: 'square' })}
                        aria-pressed={(props.countertopBottomEdge ?? 'square') === 'square'}
                        className={`h-8 rounded-lg border text-[12px] font-bold inline-flex items-center justify-center gap-1.5 ${
                          (props.countertopBottomEdge ?? 'square') === 'square'
                            ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0">
                          <path d="M2 3V12H13V3" stroke="currentColor" strokeWidth="2" />
                        </svg>
                        <span>مربعی</span>
                      </button>
                      <button
                        type="button"
                        data-testid="countertop-bottom-round"
                        onClick={() => props.onUpdateCountertopSettings!({ countertopBottomEdge: 'round' })}
                        aria-pressed={props.countertopBottomEdge === 'round'}
                        className={`h-8 rounded-lg border text-[12px] font-bold inline-flex items-center justify-center gap-1.5 ${
                          props.countertopBottomEdge === 'round'
                            ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0">
                          <path d="M2 3V12H8C11.3 12 13 10.3 13 7V3" stroke="currentColor" strokeWidth="2" />
                        </svg>
                        <span>گوشه گرد</span>
                      </button>
                    </div>
                  </div>
                </>
              )}

              <div className="space-y-1">
                <span className="block text-xs font-bold text-slate-500">متریال صفحه</span>
                <div className="grid grid-cols-2 gap-1">
                  {COUNTERTOP_FINISH_ORDER.map(id => (
                    <button key={id} type="button" aria-pressed={id === props.projectCountertopFinish}
                      onClick={() => props.onApplyFinish('countertop', undefined, undefined, id)}
                      className="rounded border p-1 text-xs aria-pressed:border-indigo-600 aria-pressed:bg-indigo-50">
                      {COUNTERTOP_FINISHES[id].shortLabel}
                    </button>
                  ))}
                </div>
              </div>
            </section>
            )}

            {props.diningSelected && !toolSettings && (
              <div className="space-y-2 rounded-lg border border-slate-200 p-2">
                {props.selectedDiningSeats === 4 && props.onSetSelectedDiningShape && (
                  <label className="block text-xs font-bold">
                    شکل میز چهار نفره
                    <select data-testid="selected-dining-shape" className="mt-1 w-full h-9 rounded border border-slate-300"
                      value={props.selectedDiningShape ?? 'rect'}
                      onChange={event=>props.onSetSelectedDiningShape?.(event.target.value as 'rect'|'round')}>
                      <option value="rect">مستطیلی</option>
                      <option value="round">گرد</option>
                    </select>
                  </label>
                )}
                {props.selectedDiningSeats && props.onSetDiningSeats && (
                  <label className="block text-xs font-bold text-slate-700">
                    تعداد صندلی میز ناهارخوری
                    <select aria-label="تعداد صندلی میز ناهارخوری" dir="rtl"
                      className="mt-1 h-9 w-full rounded border border-slate-300 bg-white px-2"
                      value={props.selectedDiningSeats}
                      onChange={event => props.onSetDiningSeats?.(Number(event.target.value) as DiningSeats)}>
                      {([2, 4, 6, 8] as const).map(count =>
                        <option key={count} value={count}>{count.toLocaleString('fa-IR')} نفره</option>)}
                    </select>
                  </label>
                )}
                {props.onRotateDining && (
                  <button type="button" onClick={props.onRotateDining} className="w-full rounded border px-2 py-1.5 font-bold">
                    چرخش مبلمان انتخاب‌شده
                  </button>
                )}
              </div>
            )}

              {sharedEquipmentColor && props.onSetEquipmentFinish && (
                <div className="space-y-1 pt-1">
                  <span className="text-[12px] font-bold text-slate-500 block">رنگ بدنهٔ تجهیزات</span>
                  <div className="grid grid-cols-3 gap-1">
                    {([['silver', 'نقره‌ای'], ['white', 'سفید'], ['black', 'مشکی']] as const).map(([finish, label]) => (
                      <button
                        key={finish}
                        type="button"
                        data-testid={`equipment-finish-${finish}`}
                        onClick={() => props.onSetEquipmentFinish!(finish)}
                        aria-pressed={(props.equipmentFinish ?? 'silver') === finish}
                        className={`h-8 rounded-lg border text-[12px] font-bold ${
                          (props.equipmentFinish ?? 'silver') === finish
                            ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            {objectSettings && !activeBox && !hasSubItem && multiCount === 0 && selectionMode === 'single' && (
              <p className="text-slate-500">برای دیدن تنظیمات، یک آبجکت را انتخاب کنید.</p>
            )}

            {/* بخش عملیات چندتایی و گروهی */}
            {objectSettings && !hasSubItem && !showFridge && !selectedUnit &&
              (multiCount > 0 || selectionMode !== 'single' || (!selectedDoor && activeBox && activeBox.doors.length > 0)) && (
              <div className="space-y-2.5 pt-2 border-t border-slate-200">
                <span className="text-[13px] font-extrabold text-slate-700 block">انتخاب چندتایی</span>

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
                  <div className="space-y-2 pt-2 border-t border-slate-100">
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
