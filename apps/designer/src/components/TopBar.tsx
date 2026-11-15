import React, { useRef } from 'react';
import {
  AlignCenterHorizontal,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  ArrowRight,
  Box,
  Camera,
  Columns3,
  Download,
  FilePlus2,
  FlipHorizontal2,
  FolderOpen,
  Layers,
  Redo2,
  Rows3,
  Settings,
  Sparkles,
  Undo2,
  Upload,
} from 'lucide-react';
import { DesignStyle } from '../cad/types';

export type ViewMode = '2d' | '3d' | 'ar';

interface TopBarProps {
  canUndo: boolean;
  canRedo: boolean;
  viewMode: ViewMode;
  designStyle?: DesignStyle;
  hasActiveBox?: boolean;
  hasSelectedUnit?: boolean;
  hasSelectedAppliance?: boolean;
  selectedApplianceName?: string;
  canEqualizeVertical?: boolean;
  canEqualizeHorizontal?: boolean;
  activeBoxName?: string;
  projectName?: string;
  onOpenProjects?: () => void;
  onOpenStyles?: () => void;
  onNewProject: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSelectViewMode: (mode: ViewMode) => void;
  onOpenSettings: () => void;
  onExportProject?: () => void;
  onImportProject?: (jsonText: string) => void;
  onEqualizeVertical?: () => void;
  onEqualizeHorizontal?: () => void;
  onMirrorBox?: () => void;
  onAlignBox?: (pos: 'left' | 'center' | 'right') => void;
  onMoveUnit?: (dir: 'left' | 'right') => void;
}

const iconBtn =
  'h-8 w-8 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-35 disabled:cursor-not-allowed active:scale-95 text-slate-700 inline-flex items-center justify-center shrink-0 transition';

const subIconBtn =
  'h-7 w-7 rounded-md border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-35 disabled:cursor-not-allowed active:scale-95 text-slate-700 inline-flex items-center justify-center shrink-0 transition';

export const TopBar: React.FC<TopBarProps> = ({
  canUndo,
  canRedo,
  viewMode,
  designStyle = 'modern',
  hasActiveBox = false,
  hasSelectedUnit = false,
  hasSelectedAppliance = false,
  selectedApplianceName,
  canEqualizeVertical = false,
  canEqualizeHorizontal = false,
  activeBoxName,
  projectName,
  onOpenProjects,
  onOpenStyles,
  onNewProject,
  onUndo,
  onRedo,
  onSelectViewMode,
  onOpenSettings,
  onExportProject,
  onImportProject,
  onEqualizeVertical,
  onEqualizeHorizontal,
  onMirrorBox,
  onAlignBox,
  onMoveUnit,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <header className="bg-white border-b border-slate-200 flex flex-col shrink-0 z-30">
      <div className="h-11 flex flex-nowrap items-center justify-between px-2 sm:px-3 gap-1.5 overflow-x-auto no-scrollbar whitespace-nowrap">
        {/* بخش راست: پروژه‌ها، تاریخچه و ابزارهای پروژه */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {onOpenProjects ? (
            <button
              type="button"
              onClick={onOpenProjects}
              aria-label="بازگشت به پروژه‌های من"
              title={projectName ? `پروژه‌ها (${projectName})` : 'پروژه‌های من'}
              className="h-8 px-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-black tracking-tight inline-flex items-center gap-1.5 shrink-0 transition active:scale-95"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span className="hidden lg:inline text-[11px] font-extrabold max-w-[120px] truncate">
                {projectName || 'پروژه‌ها'}
              </span>
            </button>
          ) : (
            <div
              className="h-8 px-2 rounded-lg bg-slate-900 text-white text-xs font-black tracking-tight inline-flex items-center gap-1.5 shrink-0 select-none"
              title={`کیچی‌یار • سبک ${designStyle === 'neoclassic' ? 'نئوکلاسیک' : 'مدرن'}`}
            >
              <span>K</span>
              <span className="hidden md:inline text-[11px] font-extrabold">کیچی‌یار</span>
            </div>
          )}

          <button
            type="button"
            onClick={onNewProject}
            aria-label="پروژه جدید"
            title="پروژه جدید"
            className={iconBtn}
          >
            <FilePlus2 className="w-4 h-4" />
          </button>

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

          <div className="w-px h-5 bg-slate-200 mx-0.5 shrink-0" />

          {onOpenStyles && (
            <button
              type="button"
              onClick={onOpenStyles}
              aria-label="انتخاب استایل از عکس"
              title="انتخاب استایل آشپزخانه از روی عکس"
              className="h-8 px-2 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-extrabold inline-flex items-center gap-1 shrink-0 transition active:scale-95"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">استایل</span>
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

        {/* بخش چپ: سوئیچ سه‌گانه 2D | 3D | AR */}
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
              className={`h-7 px-2 rounded-md text-[11px] font-black inline-flex items-center gap-1 transition ${
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
              aria-pressed={viewMode === '3d'}
              aria-label="نمای سه‌بعدی"
              title="نمایش و ویرایش سه‌بعدی (3D)"
              className={`h-7 px-2 rounded-md text-[11px] font-black inline-flex items-center gap-1 transition ${
                viewMode === '3d'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-700 hover:bg-white'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              <span>3D</span>
            </button>
            <button
              type="button"
              onClick={() => onSelectViewMode('ar')}
              aria-pressed={viewMode === 'ar'}
              aria-label="حالت واقعیت افزوده AR"
              title="اسکن کف و کالیبراسیون AR (بدون بسته شدن سشن)"
              className={`h-7 px-2 rounded-md text-[11px] font-black inline-flex items-center gap-1 transition ${
                viewMode === 'ar'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-emerald-700 hover:bg-white'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>AR</span>
            </button>
          </div>
        </div>
      </div>

      {/* نوار آیکونی تراز فرانت باکس، هم‌اندازه‌سازی هوشمند درب‌های هم‌ردیف، قرینه‌سازی و جابجایی یونیت */}
      {viewMode !== 'ar' && (hasActiveBox || hasSelectedUnit || hasSelectedAppliance) && (
        <div
          aria-label="تراز و ویرایش باکس، تجهیز و یونیت فعال"
          className="h-9 bg-slate-50 border-t border-slate-200 flex items-center justify-center px-2 gap-1.5 overflow-x-auto no-scrollbar whitespace-nowrap"
        >
          {(selectedApplianceName || activeBoxName) && (
            <span className="text-[11px] font-extrabold text-slate-600 px-1.5 whitespace-nowrap shrink-0">
              {selectedApplianceName ? `${selectedApplianceName}` : activeBoxName}
            </span>
          )}

          {(hasActiveBox || hasSelectedAppliance) && (
            <>
              {hasActiveBox && (
                <>
                  <button
                    type="button"
                    onClick={onEqualizeVertical}
                    disabled={!canEqualizeVertical}
                    aria-label="هم‌اندازه‌سازی درب‌های عمودی هم‌ردیف"
                    title="هم‌اندازه‌سازی هوشمند تمام درب‌های عمودی هم‌راستا (با جابجایی خودکار گاز/تجهیز در صورت نیاز)"
                    className={subIconBtn}
                  >
                    <Columns3 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={onEqualizeHorizontal}
                    disabled={!canEqualizeHorizontal}
                    aria-label="مساوی‌سازی کشو و درب افقی"
                    title="مساوی‌سازی ارتفاع کشوها و درب‌های افقی هم‌ردیف"
                    className={subIconBtn}
                  >
                    <Rows3 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={onMirrorBox}
                    aria-label="قرینه‌سازی چیدمان باکس"
                    title="قرینه‌سازی چیدمان باکس"
                    className={subIconBtn}
                  >
                    <FlipHorizontal2 className="w-3.5 h-3.5" />
                  </button>

                  <div className="w-px h-4 bg-slate-200 mx-0.5 shrink-0" />
                </>
              )}

              <button
                type="button"
                onClick={() => onAlignBox?.('right')}
                aria-label={
                  hasSelectedAppliance
                    ? 'تراز تجهیز در راست فرانت باکس'
                    : 'چسباندن باکس به راست فضای آزاد'
                }
                title={
                  hasSelectedAppliance
                    ? 'چسباندن تجهیز به راست فرانت قابل‌دید باکس (با جابجایی هود)'
                    : 'چسباندن باکس به راست فضای آزاد'
                }
                className={
                  hasSelectedAppliance
                    ? 'h-7 w-7 rounded-md border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 inline-flex items-center justify-center shrink-0 transition active:scale-95'
                    : subIconBtn
                }
              >
                <AlignRight className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => onAlignBox?.('center')}
                aria-label={
                  hasSelectedAppliance
                    ? 'مرکز کردن تجهیز در فرانت باکس'
                    : 'وسط قرار دادن باکس در فضای آزاد'
                }
                title={
                  hasSelectedAppliance
                    ? 'مرکز فرانت باکس (بدون محاسبه کنج کور، همراه با هود و تنظیم درب‌های طرفین)'
                    : 'مرکز فضای آزاد دیوار'
                }
                className={
                  hasSelectedAppliance
                    ? 'h-7 w-7 rounded-md border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 inline-flex items-center justify-center shrink-0 transition active:scale-95'
                    : subIconBtn
                }
              >
                <AlignCenterHorizontal className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => onAlignBox?.('left')}
                aria-label={
                  hasSelectedAppliance
                    ? 'تراز تجهیز در چپ فرانت باکس'
                    : 'چسباندن باکس به چپ فضای آزاد'
                }
                title={
                  hasSelectedAppliance
                    ? 'چسباندن تجهیز به چپ فرانت قابل‌دید باکس (با جابجایی هود)'
                    : 'چسباندن باکس به چپ فضای آزاد'
                }
                className={
                  hasSelectedAppliance
                    ? 'h-7 w-7 rounded-md border border-indigo-300 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 inline-flex items-center justify-center shrink-0 transition active:scale-95'
                    : subIconBtn
                }
              >
                <AlignLeft className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          {hasSelectedUnit && onMoveUnit && (
            <>
              <div className="w-px h-4 bg-slate-200 mx-0.5 shrink-0" />
              <button
                type="button"
                onClick={() => onMoveUnit('right')}
                aria-label="جابجایی یونیت به راست"
                title="جابجایی یونیت به راست (با حفظ درب‌ها)"
                className="h-7 px-2 rounded-md border border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-700 inline-flex items-center justify-center shrink-0 transition"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onMoveUnit('left')}
                aria-label="جابجایی یونیت به چپ"
                title="جابجایی یونیت به چپ (با حفظ درب‌ها)"
                className="h-7 px-2 rounded-md border border-purple-300 bg-purple-50 hover:bg-purple-100 text-purple-700 inline-flex items-center justify-center shrink-0 transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      )}
    </header>
  );
};
