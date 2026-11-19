import { downloadDiagnostics } from '../utils/diagnostics';
import React, { useRef } from 'react';
import {
  AlignCenterHorizontal,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  Box,
  Bug,
  Camera,
  Columns3,
  Download,
  FilePlus2,
  FolderOpen,
  FlipHorizontal2,
  House,
  Maximize2,
  Minimize2,
  Layers,
  Redo2,
  Rows3,
  Settings,
  Sparkles,
  Undo2,
  Upload,
  Wand2,
} from 'lucide-react';
import { DesignStyle } from '../cad/types';

export type ViewMode = '2d' | '3d' | 'ar';

interface TopBarProps {
  arAvailable?: boolean;
  canUndo: boolean;
  canRedo: boolean;
  viewMode: ViewMode;
  designStyle?: DesignStyle;
  hasActiveBox?: boolean;
  hasSelectedUnit?: boolean;
  hasSelectedAppliance?: boolean;
  hasBaseAndWallBoxes?: boolean;
  selectedApplianceName?: string;
  canEqualizeVertical?: boolean;
  canEqualizeHorizontal?: boolean;
  activeBoxName?: string;
  projectName?: string;
  onOpenProjects?: () => void;
  onOpenWelcome?: () => void;
  onToggleFullscreen?: () => void;
  isFullscreen?: boolean;
  onOpenStyles?: () => void;
  onSmartDesign?: () => void;
  onSmartUnitize?: () => void;
  onNewProject: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSelectViewMode: (mode: ViewMode) => void;
  floorScanActive?: boolean;
  arViewActive?: boolean;
  onToggleFloorScan?: () => void;
  onOpenSettings: () => void;
  onAuditKitchen?: () => void;
  onExportProject?: () => void;
  onImportProject?: (jsonText: string) => void;
  onEqualizeVertical?: () => void;
  onEqualizeHorizontal?: () => void;
  onEqualizeDoorsAndFill?: () => void;
  onCompactDoorsAndAppliances?: () => void;
  onAlignWallAndBaseDoors?: () => void;
  onMirrorBox?: () => void;
  canMirrorFront?: boolean;
  onAlignBox?: (pos: 'left' | 'center' | 'right') => void;
  onMoveUnit?: (dir: 'left' | 'right') => void;
  cameraToolbarRef?: React.Ref<HTMLDivElement>;
}

const iconBtn =
  'h-8 w-8 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-35 disabled:cursor-not-allowed active:scale-95 text-slate-700 inline-flex items-center justify-center shrink-0 transition';

const subIconBtn =
  'h-7 w-7 rounded-md border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-35 disabled:cursor-not-allowed active:scale-95 text-slate-700 inline-flex items-center justify-center shrink-0 transition';

export const TopBar: React.FC<TopBarProps> = ({
  arAvailable = false,
  canUndo,
  canRedo,
  viewMode,
  designStyle = 'modern',
  hasActiveBox = false,
  hasSelectedUnit = false,
  hasSelectedAppliance = false,
  hasBaseAndWallBoxes = false,
  selectedApplianceName,
  canEqualizeVertical = false,
  canEqualizeHorizontal = false,
  activeBoxName,
  projectName,
  onOpenProjects,
  onOpenWelcome,
  onToggleFullscreen,
  isFullscreen = false,
  onOpenStyles,
  onSmartDesign,
  onSmartUnitize,
  onNewProject,
  onUndo,
  onRedo,
  onSelectViewMode,
  floorScanActive = false,
  arViewActive = false,
  onToggleFloorScan,
  onOpenSettings,
  onAuditKitchen,
  onExportProject,
  onImportProject,
  onEqualizeVertical,
  onEqualizeHorizontal,
  onEqualizeDoorsAndFill,
  onCompactDoorsAndAppliances,
  onAlignWallAndBaseDoors,
  onMirrorBox,
  canMirrorFront = false,
  onAlignBox,
  onMoveUnit,
  cameraToolbarRef,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <header className="bg-white border-b border-slate-200 flex flex-col shrink-0 z-30 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex min-h-10 flex-nowrap items-center justify-between gap-1 px-2 py-0.5">
        {/* Home and fullscreen remain first/visible on narrow tablet screens. */}
        <div className="flex min-w-0 flex-nowrap items-center gap-1 overflow-x-auto no-scrollbar [&>*]:shrink-0">
          {/* بخش ناوبری و فایل پروژه */}
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200/80 rounded-lg p-0.5 shrink-0">
            {onOpenWelcome && (
              <button
                type="button"
                data-testid="go-welcome"
                onClick={onOpenWelcome}
                aria-label="بازگشت به صفحه خوش‌آمدگویی"
                title="بازگشت به Welcome"
                className={iconBtn}
              >
                <House className="w-4 h-4" />
              </button>
            )}
            {onToggleFullscreen && (
              <button
                type="button"
                data-testid="toggle-fullscreen"
                onClick={onToggleFullscreen}
                aria-label={isFullscreen ? 'خروج از تمام‌صفحه' : 'ورود به تمام‌صفحه'}
                title={isFullscreen ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه'}
                aria-pressed={isFullscreen}
                className={iconBtn}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            )}
            {onOpenProjects ? (
              <button
                type="button"
                onClick={onOpenProjects}
                aria-label="بازگشت به پروژه‌های من"
                title={projectName ? `پروژه‌ها (${projectName})` : 'پروژه‌های من'}
                className="h-8 px-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[13px] font-black tracking-tight inline-flex items-center gap-1.5 shrink-0 transition active:scale-95"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span className="hidden lg:inline text-[13px] font-extrabold max-w-[120px] truncate">
                  {projectName || 'پروژه‌ها'}
                </span>
              </button>
            ) : (
              <div
                className="h-8 px-2.5 rounded-lg bg-slate-900 text-white text-[13px] font-black tracking-tight inline-flex items-center gap-1.5 shrink-0 select-none"
                title={`کیچی‌یار • سبک ${designStyle === 'neoclassic' ? 'نئوکلاسیک' : 'مدرن'}`}
              >
                <span>K</span>
                <span className="hidden md:inline text-[13px] font-extrabold">کیچی‌یار</span>
              </div>
            )}
            <button
              type="button"
              data-testid="new-project-btn"
              onClick={onNewProject}
              aria-label="پروژه جدید"
              title="پروژه جدید"
              className={iconBtn}
            >
              <FilePlus2 className="w-4 h-4" />
            </button>
          </div>

          <button type="button" onClick={downloadDiagnostics} title="دریافت گزارش خطا" aria-label="دریافت گزارش خطا" className={iconBtn}><Download className="w-4 h-4" /></button>
          {onAuditKitchen && (
            <button type="button" data-testid="kitchen-audit-button" onClick={onAuditKitchen}
              aria-label="بررسی خطاهای کابینت" title="بررسی خودکار هم‌پوشانی، فاصله، درب و دستگیره"
              className={iconBtn}><Bug className="w-4 h-4"/></button>
          )}
          {/* تاریخچه تغییرات */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              aria-label="بازگشت"
              title="بازگشت (Undo)"
              className={iconBtn}
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              aria-label="تکرار"
              title="تکرار (Redo)"
              className={iconBtn}
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          {/* استایل، طراحی هوشمند و تنظیمات */}
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200/80 rounded-lg p-0.5 shrink-0">
            {onOpenStyles && (
              <button
                type="button"
                data-testid="open-styles-btn"
                onClick={onOpenStyles}
                aria-label="انتخاب استایل از عکس"
                title="انتخاب استایل آشپزخانه از روی عکس"
                className="h-8 px-2.5 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[13px] font-extrabold inline-flex items-center gap-1 shrink-0 transition active:scale-95"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">استایل</span>
              </button>
            )}

            {onSmartDesign && (
              <button
                type="button"
                data-testid="smart-design-btn"
                onClick={onSmartDesign}
                aria-label="درب‌گذاری و طراحی هوشمند آشپزخانه"
                title="درب‌گذاری خودکار، تنظیم گاز/هود و سینک/آبچکان و چیدمان دستگیره‌ها"
                className="h-8 px-2.5 rounded-lg border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-[13px] font-extrabold inline-flex items-center gap-1 shrink-0 transition active:scale-95"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>طراحی هوشمند</span>
              </button>
            )}

            {onSmartUnitize && (
              <button
                type="button"
                data-testid="smart-unitize-btn"
                onClick={onSmartUnitize}
                aria-label="یونیت‌بندی هوشمند"
                title="تشخیص سوپری کنار گاز/یخچال، جفت‌سازی درب‌ها و تنظیم جهت لولا"
                className="h-8 px-2.5 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[13px] font-extrabold inline-flex items-center gap-1 shrink-0 transition active:scale-95"
              >
                <Columns3 className="w-3.5 h-3.5" />
                <span>یونیت‌بندی هوشمند</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenSettings}
              aria-label="تنظیمات استاندارد پروژه"
              title="تنظیمات استاندارد پروژه"
              className={iconBtn}
            >
              <Settings className="w-4 h-4" />
            </button>

            {onExportProject && (
              <button
                type="button"
                onClick={onExportProject}
                aria-label="خروجی JSON پروژه"
                title="خروجی JSON پروژه"
                className={iconBtn}
              >
                <Download className="w-4 h-4 text-indigo-600" />
              </button>
            )}

            {onImportProject && (
              <>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (evt) => {
                      const text = evt.target?.result as string;
                      if (text) onImportProject(text);
                    };
                    reader.readAsText(file);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="بارگذاری پروژه JSON"
                  title="بارگذاری پروژه JSON"
                  className={iconBtn}
                >
                  <Upload className="w-4 h-4 text-emerald-600" />
                </button>
              </>
            )}
          </div>
        </div>

        {/* بخش چپ: نمای دوبعدی و سه‌بعدی با اسکن کف در همان محیط */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div
            role="group"
            aria-label="حالت نمایش"
            className="h-8 p-0.5 rounded-lg bg-slate-100 border border-slate-200 inline-flex items-center gap-0.5 shrink-0"
          >
            <button
              type="button"
              onClick={() => onSelectViewMode('2d')}
              aria-pressed={viewMode === '2d'}
              aria-label="نمای دوبعدی"
              title="طراحی دقیق دوبعدی (2D)"
              className={`h-7 px-2 rounded-md text-[13px] font-black inline-flex items-center gap-1 transition ${
                viewMode === '2d'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-700 hover:bg-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>2D</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectViewMode('3d')}
              aria-pressed={viewMode === '3d' && !arViewActive}
              aria-label="نمای سه‌بعدی"
              title="نمایش و ویرایش سه‌بعدی (3D)"
              className={`h-7 px-2 rounded-md text-[13px] font-black inline-flex items-center gap-1 transition ${
                viewMode === '3d' && !arViewActive
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-700 hover:bg-white'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              <span>3D</span>
            </button>
            {onToggleFloorScan && (
              <button
                type="button"
                data-testid="toggle-floor-scan-3d"
                onClick={onToggleFloorScan}
                disabled={!arAvailable}
                aria-pressed={arViewActive}
                aria-label={floorScanActive ? 'نمای AR با ردیابی زنده' : 'اسکن کف با دوربین واقعی'}
                title={!arAvailable ? 'AR روی این دستگاه در دسترس نیست' : floorScanActive ? 'بازگشت به تصویر واقعی با حفظ ردیابی' : 'اسکن کف در همین محیط سه‌بعدی'}
                className={`h-7 px-2 rounded-md text-[13px] font-black inline-flex items-center gap-1 transition ${arViewActive
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-emerald-700 hover:bg-white'}`}
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{floorScanActive ? 'نمای AR' : 'اسکن کف'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {(viewMode === '3d' || (viewMode === '2d' && (hasActiveBox || hasSelectedUnit || hasSelectedAppliance))) && (
        <div className="h-9 bg-slate-50 border-t border-slate-200 flex items-center px-2 gap-2 overflow-x-auto no-scrollbar whitespace-nowrap">
        {(hasActiveBox || hasSelectedUnit || hasSelectedAppliance) && (
        <div
          data-testid="selection-align-toolbar"
          aria-label="تراز و هم‌اندازه‌سازی آیتم‌های انتخابی"
          className="flex shrink-0 items-center gap-1 [&>*]:shrink-0"
        >
          {(selectedApplianceName || activeBoxName) && (
            <span className="text-[13px] font-extrabold text-slate-600 px-1.5 shrink-0">
              {selectedApplianceName || activeBoxName}
            </span>
          )}
          <button type="button" data-testid="align-selected-left"
            onClick={() => onAlignBox?.('left')}
            aria-label="چپ‌چین آیتم‌های انتخابی تا نزدیک‌ترین فضای آزاد"
            title="چپ‌چین تا مانع یا انتهای فضای آزاد؛ سایر آیتم‌ها جابه‌جا نمی‌شوند"
            className={subIconBtn}>
            <AlignLeft className="w-4 h-4" />
          </button>
          <button type="button" data-testid="align-selected-right"
            onClick={() => onAlignBox?.('right')}
            aria-label="راست‌چین آیتم‌های انتخابی تا نزدیک‌ترین فضای آزاد"
            title="راست‌چین تا مانع یا انتهای فضای آزاد؛ سایر آیتم‌ها جابه‌جا نمی‌شوند"
            className={subIconBtn}>
            <AlignRight className="w-4 h-4" />
          </button>
          <button type="button" data-testid="align-selected-center"
            onClick={() => onAlignBox?.('center')}
            aria-label="وسط‌چین آیتم‌های انتخابی داخل باکس کابینت"
            title="وسط‌چین نسبت به مرکز باکس کابینت؛ مناسب گاز و سینک"
            className={subIconBtn}>
            <AlignCenterHorizontal className="w-4 h-4" />
          </button>
          <button type="button" data-testid="mirror-selected-front" onClick={onMirrorBox} disabled={!canMirrorFront}
            aria-label="میرور افقی در و دستگیره"
            title="عوض کردن سمت لولا و دستگیره"
            className={subIconBtn}>
            <FlipHorizontal2 className="w-4 h-4" />
          </button>
          <div className="h-5 w-px bg-slate-300 shrink-0" />
          <button type="button" data-testid="align-selected-vertical-widths"
            onClick={onEqualizeVertical} disabled={!canEqualizeVertical}
            aria-label="یکسان‌کردن عرض درب‌های عمودی انتخاب‌شده"
            title="فقط درب‌های عمودی انتخاب‌شده هم‌عرض می‌شوند"
            className={subIconBtn}>
            <Columns3 className="w-4 h-4" />
          </button>
          <button type="button" data-testid="align-selected-horizontal-heights"
            onClick={onEqualizeHorizontal} disabled={!canEqualizeHorizontal}
            aria-label="یکسان‌کردن ارتفاع کشوهای افقی انتخاب‌شده"
            title="فقط کشوهای افقی انتخاب‌شده هم‌ارتفاع می‌شوند"
            className={subIconBtn}>
            <Rows3 className="w-4 h-4" />
          </button>
        </div>
        )}
        {viewMode === '3d' && <div ref={cameraToolbarRef} className="ms-auto shrink-0" />}
        </div>
      )}
    </header>
  );
};
