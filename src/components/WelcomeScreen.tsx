import React from 'react';
import { ArrowLeft, Camera, FolderOpen, Layers, Palette } from 'lucide-react';
import { PresetMode } from '../cad/presets';
import { SavedProjectRecord } from '../cad/projectStorage';

interface WelcomeScreenProps {
  arAvailable?: boolean;
  projectsCount: number;
  latestProject: SavedProjectRecord | null;
  onStartMode: (mode: '2d' | '3d' | 'ar', preset?: PresetMode) => void;
  onContinueLatest: (mode: '2d' | '3d' | 'ar') => void;
  onOpenProjects: () => void;
  onOpenStyles: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  arAvailable = false,
  projectsCount,
  latestProject,
  onStartMode,
  onContinueLatest,
  onOpenProjects,
  onOpenStyles,
}) => {
  return (
    <div className="kichiyar-safe-root min-h-screen w-screen bg-slate-50 text-slate-900 flex flex-col overflow-y-auto">
      <header className="h-14 px-4 sm:px-8 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-slate-900 text-white font-black text-base flex items-center justify-center">
            K
          </div>
          <div>
            <div className="text-sm font-black text-slate-900 leading-tight">کیچی‌یار CAD</div>
            <div className="text-[13px] font-semibold text-slate-500">طراحی دقیق کابینت و آشپزخانه</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenProjects}
            className="h-10 px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[13px] font-bold inline-flex items-center gap-1.5"
          >
            <FolderOpen className="w-4 h-4" />
            <span>پروژه‌های من ({projectsCount})</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 flex flex-col items-center justify-center gap-5">
        <div className="text-center space-y-1.5">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900 leading-tight">
            Kitchiyar
          </h1>

          <p className="text-base sm:text-lg font-semibold text-slate-600 leading-relaxed">
            طراحی هوشمند و مهندسی آشپزخانه
          </p>
        </div>

        <div className="w-full max-w-3xl rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm">
          <img
            src="./assets/styles/reference-cream.webp"
            alt="نمونه آشپزخانه طراحی‌شده در کیچی‌یار"
            className="w-full h-56 sm:h-72 object-cover"
          />
        </div>

        <div className="w-full max-w-3xl space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <button
              type="button"
              data-testid="welcome-primary-start"
              onClick={() => (latestProject ? onContinueLatest('2d') : onStartMode('2d'))}
              className="h-14 px-4 rounded-xl border border-indigo-600 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black inline-flex items-center justify-center gap-2 shadow-sm transition active:scale-95"
            >
              <Layers className="w-4 h-4" />
              <span>{latestProject ? 'ادامه آخرین پروژه' : 'شروع طراحی جدید'}</span>
            </button>

            <button
              type="button"
              data-testid="welcome-projects-btn"
              onClick={onOpenProjects}
              className="h-14 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-100/80 text-slate-800 text-sm font-black inline-flex items-center justify-center gap-2 transition active:scale-95"
            >
              <FolderOpen className="w-4 h-4 text-slate-600" />
              <span>مدیریت پروژه‌ها ({projectsCount})</span>
            </button>

            <button
              type="button"
              data-testid="welcome-styles-btn"
              onClick={onOpenStyles}
              className="h-14 px-4 rounded-xl border border-amber-200 bg-amber-50/60 hover:bg-amber-100/70 text-slate-800 text-sm font-black inline-flex items-center justify-center gap-2 transition active:scale-95"
            >
              <Palette className="w-4 h-4 text-amber-600" />
              <span>گالری سبک‌ها و متریال</span>
            </button>

            <button
              type="button"
              data-testid="welcome-ar-btn"
              onClick={() => onStartMode('ar')}
              disabled={!arAvailable}
              title={!arAvailable ? 'AR روی این دستگاه در دسترس نیست' : 'اسکن کف با دوربین'}
              className="h-14 px-4 rounded-xl border border-emerald-200/80 bg-emerald-50/50 hover:bg-emerald-50 text-slate-800 text-sm font-black inline-flex items-center justify-center gap-2 transition active:scale-95 disabled:opacity-50"
            >
              <Camera className="w-4 h-4 text-emerald-600" />
              <span>اسکن کف AR</span>
            </button>
          </div>

          {latestProject && (
            <div className="p-3.5 rounded-xl bg-white border border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[13px] font-bold text-slate-400">آخرین پروژه ذخیره‌شده</div>
                <div className="text-[14px] font-black text-slate-900 mt-0.5">{latestProject.name}</div>
                <div className="text-[13px] text-slate-500 mt-0.5">
                  {latestProject.wallCount} دیوار • {latestProject.boxCount} باکس
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onContinueLatest('3d')}
                  className="h-11 px-3.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-[13px] font-extrabold inline-flex items-center gap-1"
                >
                  <span>باز کردن در 3D</span>
                </button>
                <button
                  type="button"
                  onClick={() => onContinueLatest('2d')}
                  className="h-11 px-3.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[13px] font-extrabold inline-flex items-center gap-1"
                >
                  <span>ادامه طراحی 2D</span>
                  <ArrowLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

