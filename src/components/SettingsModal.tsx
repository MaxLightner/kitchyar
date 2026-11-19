import React, { useState } from 'react';
import { X } from 'lucide-react';
import { DEFAULT_PROJECT_SETTINGS } from '../cad/constants';
import type { ProjectSettings } from '../cad/types';
import { SurfaceFinishControls } from './SurfaceFinishControls';

interface SettingsModalProps {
  settings: ProjectSettings;
  onSave: (next: ProjectSettings, applyToExisting: boolean) => void;
  onPreviewHdrRotation: (degrees: number) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings, onSave, onPreviewHdrRotation, onClose,
}) => {
  const [form, setForm] = useState(settings);
  const [applyToExisting, setApplyToExisting] = useState(true);
  const degrees = Number.isFinite(form.hdrRotationDegrees) ? form.hdrRotationDegrees! : 0;

  const updateRotation = (hdrRotationDegrees: number) => {
    const angle = Math.max(0, Math.min(360, hdrRotationDegrees));
    setForm(prev => ({ ...prev, hdrRotationDegrees: angle }));
    onPreviewHdrRotation(angle);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 p-2 sm:p-3"
      role="dialog" aria-modal="true" aria-label="تنظیمات صحنه و رندر">
      <div dir="rtl" className="flex max-h-[min(85dvh,36rem)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 px-3 py-1.5">
          <h2 className="text-sm font-extrabold text-slate-900">تنظیمات صحنه و رندر</h2>
          <button type="button" onClick={onClose} aria-label="بستن تنظیمات"
            className="inline-flex size-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 space-y-2.5 overflow-y-auto overscroll-contain px-3 py-2.5 text-xs" data-testid="scene-settings-scroll">
          <label className="flex items-center justify-between gap-2">
            <span className="font-bold text-slate-700">ارتفاع دیوار (cm)</span>
            <input type="number" min={200} max={400} value={form.wallHeightCm}
              onChange={e => setForm(prev => ({ ...prev, wallHeightCm: Number(e.target.value) }))}
              className="h-8 w-20 rounded border border-slate-300 px-2 tabular-nums" />
          </label>
          {form.wallHeightCm !== settings.wallHeightCm && (
            <label className="flex items-center gap-2 text-slate-600">
              <input type="checkbox" checked={applyToExisting} onChange={e => setApplyToExisting(e.target.checked)} />
              اعمال ارتفاع روی دیوارهای فعلی
            </label>
          )}

          <label className="block rounded-lg border border-slate-200 px-2.5 py-1.5">
            <span className="flex items-center justify-between font-bold">
              <span>چرخش HDRI</span>
              <output dir="ltr" className="tabular-nums">{degrees}°</output>
            </span>
            <input type="range" dir="ltr" min={0} max={360} step={1} value={degrees}
              aria-label="چرخش HDRI" data-testid="settings-hdr-rotation"
              onChange={e => updateRotation(Number(e.target.value))}
              className="mt-1 w-full accent-indigo-600" />
          </label>

          <label className="flex items-center gap-2 py-0.5 font-bold text-slate-700">
            <input type="checkbox" className="size-4 accent-indigo-600" data-testid="settings-ambient-occlusion"
              checked={form.ambientOcclusion !== false}
              onChange={e => setForm(prev => ({ ...prev, ambientOcclusion: e.target.checked }))} />
            سایهٔ تماس کل صحنه (AO)
          </label>

          <SurfaceFinishControls index={3} reflection={form.floorReflection} roughness={form.floorRoughness}
            onChange={patch => setForm(prev => ({ ...prev,
              floorReflection: patch.reflection ?? prev.floorReflection,
              floorRoughness: patch.roughness ?? prev.floorRoughness,
            }))} />
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-1.5 border-t border-slate-200 bg-slate-50 px-3 py-2">
          <button type="button" onClick={() => {
            setForm(prev => ({ ...prev, wallHeightCm: DEFAULT_PROJECT_SETTINGS.wallHeightCm,
              hdrRotationDegrees: 0, floorReflection: undefined, floorRoughness: undefined,
              ambientOcclusion: DEFAULT_PROJECT_SETTINGS.ambientOcclusion }));
            onPreviewHdrRotation(0);
          }} className="h-8 rounded border border-slate-300 bg-white px-2 text-xs font-bold text-slate-700">
            پیش‌فرض
          </button>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={onClose} className="h-8 rounded border border-slate-300 bg-white px-2 text-xs font-bold">
              انصراف
            </button>
            <button type="button" onClick={() => onSave({ ...form,
              wallHeightCm: Math.max(200, Math.min(400, Math.round(form.wallHeightCm || settings.wallHeightCm))) }, applyToExisting)}
              className="h-8 rounded bg-indigo-600 px-3 text-xs font-bold text-white hover:bg-indigo-700">
              ذخیره و اعمال
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
