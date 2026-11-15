import React from 'react';
import { ArrowLeft, Box, Camera, FolderOpen, Layers } from 'lucide-react';
import { PresetMode } from '../cad/presets';
import { SavedProjectRecord } from '../cad/projectStorage';

interface WelcomeScreenProps {
  projectsCount: number;
  latestProject: SavedProjectRecord | null;
  onStartMode: (mode: '2d' | '3d' | 'ar', preset?: PresetMode) => void;
  onContinueLatest: (mode: '2d' | '3d' | 'ar') => void;
  onOpenProjects: () => void;
  onOpenStyles: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  projectsCount,
  latestProject,
  onStartMode,
  onContinueLatest,
  onOpenProjects,
}) => {
  return (
    <div className="min-h-screen w-screen bg-slate-50 text-slate-900 flex flex-col overflow-y-auto">
      <header className="h-14 px-4 sm:px-8 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-slate-900 text-white font-black text-base flex items-center justify-center">
            K
          </div>
          <div>
            <div className="text-sm font-black text-slate-900 leading-tight">کیچی‌یار CAD</div>
            <div className="text-[11px] font-semibold text-slate-500">طراحی دقیق کابینت + اسکن کف AR</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenProjects}
            className="h-9 px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold inline-flex items-center gap-1.5"
          >
            <FolderOpen className="w-4 h-4" />
            <span>پروژه‌های من ({projectsCount})</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 flex flex-col items-center justify-center gap-5">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-[11px] font-bold">
            <Camera className="w-3.5 h-3.5 text-slate-500" />
            <span>مدل‌سازی متریک سر پروژه با WebXR و انتقال بی‌درنگ به 2D / 3D</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-slate-900 leading-tight">
            Kitchiyar
          </h1>

          <p className="text-base sm:text-lg font-semibold text-slate-600 leading-relaxed">
            طراحی هوشمند آشپزخانه
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => (latestProject ? onContinueLatest('2d') : onStartMode('2d', 'L'))}
              className="h-14 px-5 rounded-xl border border-indigo-200/70 bg-indigo-50/40 hover:bg-indigo-50/80 text-slate-800 text-sm font-black inline-flex items-center justify-center gap-2.5 transition active:scale-95"
            >
              <Layers className="w-4 h-4 text-indigo-500" />
              <span>ورود به طراحی 2D</span>
            </button>

            <button
              type="button"
              onClick={() => (latestProject ? onContinueLatest('3d') : onStartMode('3d', 'L'))}
              className="h-14 px-5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100/80 text-slate-800 text-sm font-black inline-flex items-center justify-center gap-2.5 transition active:scale-95"
            >
              <Box className="w-4 h-4 text-slate-500" />
              <span>نمای آزاد 3D</span>
            </button>

            <button
              type="button"
              onClick={() => (latestProject ? onContinueLatest('ar') : onStartMode('ar', 'L'))}
              className="h-14 px-5 rounded-xl border border-emerald-200/70 bg-emerald-50/40 hover:bg-emerald-50/80 text-slate-800 text-sm font-black inline-flex items-center justify-center gap-2.5 transition active:scale-95"
            >
              <Camera className="w-4 h-4 text-emerald-600" />
              <span>اسکن کف AR</span>
            </button>
          </div>

          {latestProject && (
            <div className="p-3.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold text-slate-400">آخرین پروژه باز</div>
                <div className="text-xs font-black text-slate-900 mt-0.5">{latestProject.name}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {latestProject.wallCount} دیوار • {latestProject.boxCount} باکس
                </div>
              </div>
              <button
                type="button"
                onClick={() => onContinueLatest(latestProject.preferredMode || '2d')}
                className="h-9 px-3.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-extrabold inline-flex items-center gap-1"
              >
                <span>ادامه پروژه</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
