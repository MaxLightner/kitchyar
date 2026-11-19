import React, { useState } from 'react';
import { X } from 'lucide-react';
import { DEFAULT_PROJECT_SETTINGS } from '../cad/constants';
import { getCabinetLighting } from '../cad/cabinetLighting';
import type { ApplianceItem, CabinetBox, CabinetLighting, CabinetLightMode, ProjectSettings } from '../cad/types';
import { SurfaceFinishControls } from './SurfaceFinishControls';

interface SettingsModalProps {
  settings: ProjectSettings;
  cabinetLights: CabinetBox[];
  kitchenLightMode: CabinetLightMode;
  ovens: ApplianceItem[];
  onSave: (next: ProjectSettings, applyToExisting: boolean, lights: Record<string, CabinetLighting>, ovens: Record<string, boolean>) => void;
  onPreviewHdrRotation: (degrees: number) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings, cabinetLights, kitchenLightMode, ovens, onSave, onPreviewHdrRotation, onClose,
}) => {
  const [form, setForm] = useState({ ...settings, underCabinetLightMode: kitchenLightMode });
  const [ovenLights, setOvenLights] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(ovens.map(app => [app.id, Boolean(app.ovenLightOn)])));
  const [lights, setLights] = useState<Record<string, CabinetLighting>>(() =>
    Object.fromEntries(cabinetLights.map(box => [box.id, getCabinetLighting(box)])));
  const intensityControls: Array<{ key: 'hdrIntensity' | 'cameraLightIntensity' | 'linearLightIntensity' | 'halogenLightIntensity' | 'ambientLightIntensity'; label: string; fallback: number }> = [
    { key: 'hdrIntensity', label: 'HDRI', fallback: 2 },
    { key: 'cameraLightIntensity', label: 'نور دوربین', fallback: 1 },
    { key: 'linearLightIntensity', label: 'نور خطی زیر کابینت', fallback: 5 },
    { key: 'halogenLightIntensity', label: 'هالوژن بین‌کابینتی', fallback: 1 },
    { key: 'ambientLightIntensity', label: 'نور آمبیانس', fallback: 0.06 },
  ];
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

          <fieldset className="space-y-1 rounded border border-slate-200 p-2">
            <legend className="px-1 font-bold">گزینه‌های عملکرد روی گوشی‌های ضعیف</legend>
            <label className="flex items-center gap-2 font-bold text-slate-700">
              <input type="checkbox" aria-label="فعال بودن بازتاب SSR" data-testid="settings-reflections"
                checked={form.enableReflections !== false}
                onChange={e => setForm(prev => ({ ...prev, enableReflections: e.target.checked }))} />
              بازتاب‌های صفحه (SSR)
            </label>
            <label className="flex items-center gap-2 font-bold text-slate-700">
              <input type="checkbox" aria-label="فعال بودن نور آمبیانس" data-testid="settings-ambient-light"
                checked={form.enableAmbientLight !== false}
                onChange={e => setForm(prev => ({ ...prev, enableAmbientLight: e.target.checked }))} />
              نور آمبیانس
            </label>
          </fieldset>
          <fieldset className="space-y-2 rounded border border-slate-200 p-2">
            <legend className="px-1 font-bold">شدت نورهای صحنه</legend>
            <div className="grid grid-cols-2 gap-2">
              {intensityControls.map(({ key, label, fallback }) => (
                <label key={key} className="block">
                  {label}
                  <input aria-label={label} type="number" dir="ltr" min={0} max={100} step={0.05}
                    value={form[key] ?? fallback}
                    onChange={e => setForm(prev => ({ ...prev, [key]: Math.max(0, Math.min(100, Number(e.target.value))) }))}
                    className="mt-1 h-8 w-full rounded border border-slate-300 px-2" />
                </label>
              ))}
              <label className="block">
                شدت مشترک سه نور مستطیلی سقف
                <input aria-label="نور مستطیلی سقف" type="number" dir="ltr" min={0} max={100} step={0.05}
                  value={form.ceilingAreaIntensity ?? form.ceilingLightIntensities?.[0] ?? 12}
                  onChange={event => setForm(prev => ({ ...prev,
                    ceilingAreaIntensity: Math.max(0, Math.min(100, Number(event.target.value))) }))}
                  className="mt-1 h-8 w-full rounded border border-slate-300 px-2" />
              </label>
            </div>
          </fieldset>
          {ovens.length > 0 && (
            <fieldset className="space-y-2 rounded border border-slate-200 p-2">
              <legend className="px-1 font-bold">چراغ داخل فر</legend>
              {ovens.map((app, index) => (
                <label key={app.id} className="flex items-center gap-2">
                  <input type="checkbox" checked={ovenLights[app.id]}
                    onChange={event => setOvenLights(prev => ({ ...prev, [app.id]: event.target.checked }))} />
                  {app.kind === 'microwave' ? 'مایکروویو' : 'فر'} {index + 1}
                </label>
              ))}
            </fieldset>
          )}
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
              ambientOcclusion: DEFAULT_PROJECT_SETTINGS.ambientOcclusion,
              enableAmbientLight: true, enableReflections: true }));
            onPreviewHdrRotation(0);
          }} className="h-8 rounded border border-slate-300 bg-white px-2 text-xs font-bold text-slate-700">
            پیش‌فرض
          </button>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={onClose} className="h-8 rounded border border-slate-300 bg-white px-2 text-xs font-bold">
              انصراف
            </button>
            <button type="button" onClick={() => onSave({ ...form,
              wallHeightCm: Math.max(200, Math.min(400, Math.round(form.wallHeightCm || settings.wallHeightCm))) }, applyToExisting, lights, ovenLights)}
              className="h-8 rounded bg-indigo-600 px-3 text-xs font-bold text-white hover:bg-indigo-700">
              ذخیره و اعمال
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
