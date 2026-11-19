import React from 'react';
import {
  AppWindow,
  BrickWall,
  DoorClosed,
  Droplets,
  Lightbulb,
  Eye,
  EyeOff,
  Flame,
  Frame,
  GripVertical,
  LayoutGrid,
  Paintbrush,
  Palette,
  RectangleHorizontal,
  Refrigerator,
  WashingMachine,
  Utensils,
  Tv,
  PencilLine,
  Wrench,
} from 'lucide-react';
import { DiningSeats, FloorFurnitureKind, ToolId } from '../cad/types';

interface BottomDockProps {
  activeTool: ToolId;
  diningSeats: DiningSeats;
  diningShape: 'round' | 'rect';
  onDiningShape: (shape: 'round' | 'rect') => void;
  diningRotation: number;
  furnitureKind: FloorFurnitureKind;
  onChooseFurniture: (kind: FloorFurnitureKind) => void;
  onDiningSeats: (seats: DiningSeats) => void;
  onRotateDining: () => void;
  hasAnySelection?: boolean;
  doorsHidden?: boolean;
  onSelectTool: (tool: ToolId) => void;
  onToggleDoorsHidden?: () => void;
  onDeleteSelection?: () => void;
  canToggleUnderLight: boolean;
  lightsOn: boolean;
  onToggleUnderLight: () => void;
}

export const BottomDock: React.FC<BottomDockProps> = ({
  activeTool,
  diningSeats, diningRotation, furnitureKind, diningShape, onDiningShape, onChooseFurniture, onDiningSeats, onRotateDining,
  doorsHidden = false,
  onSelectTool,
  onToggleDoorsHidden,
  canToggleUnderLight, lightsOn, onToggleUnderLight,
}) => {
  const btnCls = (active: boolean) =>
    `h-11 px-2 sm:px-2.5 rounded-lg border text-[13px] sm:text-[13px] font-bold inline-flex items-center gap-1 sm:gap-1.5 whitespace-nowrap shrink-0 transition active:scale-95 ${
      active
        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
        : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'
    }`;

  const compactIconCls = (active: boolean, tone: 'default' | 'danger' | 'purple' | 'amber' = 'default') =>
    `h-11 w-11 rounded-lg border inline-flex items-center justify-center shrink-0 transition active:scale-95 disabled:opacity-35 disabled:cursor-not-allowed ${
      active
        ? tone === 'danger'
          ? 'bg-red-600 border-red-600 text-white shadow-sm'
          : tone === 'purple'
          ? 'bg-purple-600 border-purple-600 text-white shadow-sm'
          : tone === 'amber'
          ? 'bg-amber-50 border-amber-400 text-amber-700 shadow-xs'
          : 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
        : tone === 'danger'
        ? 'bg-red-50 border-red-200 text-red-600 hover:bg-red-100'
        : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
    }`;

  return (
    <div data-testid="bottom-dock" className="relative shrink-0 z-30 bg-white border-t border-slate-200">
      <nav
        aria-label="ابزارهای درج و طراحی"
        className="flex flex-col divide-y divide-slate-100"
      >
        {/* ردیف ۱: ابزارهای ساخت و چیدمان و تجهیزات */}
        <div className="h-12 flex items-center justify-start lg:justify-center px-2 sm:px-2.5 gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar">
          <span className="text-[13px] font-extrabold text-slate-400 pl-1 shrink-0 select-none">
            چیدمان
          </span>

          <button
            type="button"
            onClick={() => onSelectTool('wall')}
            aria-pressed={activeTool === 'wall'}
            className={btnCls(activeTool === 'wall')}
          >
            <BrickWall className="w-3.5 h-3.5" />
            <span>دیوار</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTool('cab-draw')}
            aria-pressed={activeTool === 'cab-draw'}
            className={btnCls(activeTool === 'cab-draw')}
          >
            <RectangleHorizontal className="w-3.5 h-3.5" />
            <span>باکس کابینت</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTool('fridge')}
            aria-pressed={activeTool === 'fridge'}
            className={btnCls(activeTool === 'fridge')}
          >
            <Refrigerator className="w-3.5 h-3.5" />
            <span>یخچال</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTool('sink')}
            aria-pressed={activeTool === 'sink'}
            className={btnCls(activeTool === 'sink')}
          >
            <Droplets className="w-3.5 h-3.5" />
            <span>سینک</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTool('gas')}
            aria-pressed={activeTool === 'gas'}
            className={btnCls(activeTool === 'gas')}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>گاز</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTool('appliance')}
            aria-pressed={activeTool === 'appliance'}
            className={btnCls(activeTool === 'appliance')}
          >
            <WashingMachine className="w-3.5 h-3.5" />
            <span>تجهیزات</span>
          </button>

          <button type="button" data-testid="dock-tool-dining"
            onClick={() => onChooseFurniture('dining')}
            aria-pressed={activeTool === 'dining' && furnitureKind === 'dining'}
            className={btnCls(activeTool === 'dining' && furnitureKind === 'dining')}>
            <Utensils className="w-3.5 h-3.5" />
            <span>میز ناهارخوری</span>
          </button>

          {activeTool === 'dining' && furnitureKind === 'dining' && diningSeats === 4 && (
            <button type="button" data-testid="dock-dining-round-4"
              aria-pressed={diningShape === 'round'}
              onClick={() => onDiningShape(diningShape === 'round' ? 'rect' : 'round')}
              className={btnCls(diningShape === 'round')}>
              {diningShape === 'round' ? '۴ نفره گرد' : '۴ نفره مستطیل'}
            </button>
          )}
          <button type="button" data-testid="dock-tool-tv" onClick={() => onChooseFurniture('tv')}
            aria-pressed={activeTool === 'dining' && furnitureKind === 'tv'}
            className={btnCls(activeTool === 'dining' && furnitureKind === 'tv')}>
            <Tv className="w-3.5 h-3.5" />
            <span>ست تلویزیون</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTool('opening')}
            aria-pressed={activeTool === 'opening'}
            className={btnCls(activeTool === 'opening')}
          >
            <AppWindow className="w-3.5 h-3.5" />
            <span>بازشو / ستون</span>
          </button>
        </div>

        {/* ردیف ۲: ابزارهای درب و دیتیل + پاک‌کن */}
        <div className="h-12 bg-slate-50/70 flex items-center justify-start lg:justify-center px-2 sm:px-2.5 gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar">
          <span className="text-[13px] font-extrabold text-indigo-500 pl-1 shrink-0 select-none">
            دیتیل
          </span>

          <button
            type="button"
            onClick={() => onSelectTool('doors')}
            aria-pressed={activeTool === 'doors'}
            className={btnCls(activeTool === 'doors')}
          >
            <DoorClosed className="w-3.5 h-3.5" />
            <span>درب‌گذاری</span>
          </button>

          <button type="button" data-testid="dock-tool-front-cut" onClick={() => onSelectTool('front-cut')}
            aria-pressed={activeTool === 'front-cut'} className={btnCls(activeTool === 'front-cut')}>
            <PencilLine className="w-3.5 h-3.5" />
            <span>مداد تقسیم</span>
          </button>

          <button
            type="button"
            data-testid="dock-tool-hardware"
            onClick={() => onSelectTool('hardware')}
            aria-pressed={activeTool === 'hardware'}
            title="نوع یراق و مکانیزم بازشو: سوپری، جک افقی، مگنتی، لولایی، کنج"
            className={btnCls(activeTool === 'hardware')}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>نوع یراق</span>
          </button>

          {onToggleDoorsHidden && (
            <button
              type="button"
              onClick={onToggleDoorsHidden}
              aria-pressed={doorsHidden}
              aria-label={doorsHidden ? 'نمایش درب‌ها' : 'مخفی کردن درب‌ها برای ویرایش یونیت‌ها'}
              title={doorsHidden ? 'نمایش درب‌ها' : 'مخفی کردن درب‌ها (ویرایش یونیت)'}
              className={compactIconCls(doorsHidden, 'purple')}
            >
              {doorsHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}

          <button
            type="button"
            onClick={() => onSelectTool('door-style')}
            aria-pressed={activeTool === 'door-style'}
            className={btnCls(activeTool === 'door-style')}
          >
            <Paintbrush className="w-3.5 h-3.5" />
            <span>مدل درب</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTool('finish')}
            aria-pressed={activeTool === 'finish'}
            className={btnCls(activeTool === 'finish')}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>رنگ و متریال</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTool('pencil')}
            aria-pressed={activeTool === 'pencil' || activeTool === 'skeleton'}
            className={btnCls(activeTool === 'pencil' || activeTool === 'skeleton')}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>یونیت و طبقه</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTool('frame')}
            aria-pressed={activeTool === 'frame'}
            className={btnCls(activeTool === 'frame')}
          >
            <Frame className="w-3.5 h-3.5" />
            <span>فریم</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTool('handle')}
            aria-pressed={activeTool === 'handle'}
            className={btnCls(activeTool === 'handle')}
          >
            <GripVertical className="w-3.5 h-3.5" />
            <span>دستگیره</span>
          </button>

          <div className="w-px h-5 bg-slate-200 mx-0.5 shrink-0" />

          <button
            type="button"
            onClick={onToggleUnderLight}
            disabled={!canToggleUnderLight}
            aria-pressed={lightsOn}
            aria-label="چراغ زیر کابینت"
            title="چراغ زیر کابینت"
            className={compactIconCls(lightsOn, 'amber')}
          >
            <Lightbulb className="w-4 h-4" />
          </button>
        </div>
      </nav>
    </div>
  );
};

