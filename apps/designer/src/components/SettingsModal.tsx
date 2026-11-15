import React, { useState } from 'react';
import { X } from 'lucide-react';
import { DEFAULT_PROJECT_SETTINGS } from '../cad/constants';
import { ProjectSettings } from '../cad/types';

interface SettingsModalProps {
  settings: ProjectSettings;
  onSave: (next: ProjectSettings, applyToExisting: boolean) => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onSave,
  onClose,
}) => {
  const [form, setForm] = useState<ProjectSettings>({
    ...DEFAULT_PROJECT_SETTINGS,
    ...settings,
    defaultHoodKind: settings.defaultHoodKind || 'chimney',
  });
  const [applyToExisting, setApplyToExisting] = useState(true);

  const updateNum = (field: keyof ProjectSettings, raw: string) => {
    const v = Number(raw);
    if (!Number.isNaN(v)) {
      setForm((prev) => ({ ...prev, [field]: Math.max(0, Math.round(v)) }));
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/45 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="تنظیمات استاندارد پروژه"
    >
      <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h2 className="text-sm font-extrabold text-slate-900">تنظیمات ابعاد استاندارد کابینت</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن تنظیمات"
            className="h-8 w-8 rounded-lg hover:bg-slate-100 text-slate-500 inline-flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3 text-[13px]">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-slate-600 font-bold block mb-1">ارتفاع دیوار (cm)</span>
              <input
                type="number"
                min={200}
                max={400}
                value={form.wallHeightCm}
                onChange={(e) => updateNum('wallHeightCm', e.target.value)}
                className="w-full h-9 px-2.5 border border-slate-300 rounded-lg font-bold tabular-nums bg-slate-50"
              />
            </label>

            <label className="block">
              <span className="text-slate-600 font-bold block mb-1">ارتفاع کل زمینی (cm)</span>
              <input
                type="number"
                min={70}
                max={105}
                value={form.baseHeightCm}
                onChange={(e) => updateNum('baseHeightCm', e.target.value)}
                className="w-full h-9 px-2.5 border border-slate-300 rounded-lg font-bold tabular-nums bg-slate-50"
              />
            </label>

            <label className="block">
              <span className="text-slate-600 font-bold block mb-1">ارتفاع پاسنگ / پاخور (cm)</span>
              <input
                type="number"
                min={0}
                max={20}
                value={form.plinthCm}
                onChange={(e) => updateNum('plinthCm', e.target.value)}
                className="w-full h-9 px-2.5 border border-slate-300 rounded-lg font-bold tabular-nums bg-slate-50"
              />
            </label>

            <label className="block">
              <span className="text-slate-600 font-bold block mb-1">ضخامت صفحه تاپس (cm)</span>
              <input
                type="number"
                min={2}
                max={8}
                value={form.countertopCm}
                onChange={(e) => updateNum('countertopCm', e.target.value)}
                className="w-full h-9 px-2.5 border border-slate-300 rounded-lg font-bold tabular-nums bg-slate-50"
              />
            </label>

            <label className="block">
              <span className="text-slate-600 font-bold block mb-1">فاصله نصب هوایی از کف (cm)</span>
              <input
                type="number"
                min={120}
                max={180}
                value={form.wallCabElevCm}
                onChange={(e) => updateNum('wallCabElevCm', e.target.value)}
                className="w-full h-9 px-2.5 border border-slate-300 rounded-lg font-bold tabular-nums bg-slate-50"
              />
            </label>

            <label className="block">
              <span className="text-slate-600 font-bold block mb-1">ارتفاع استاندارد هوایی (cm)</span>
              <input
                type="number"
                min={40}
                max={120}
                value={form.wallCabHeightCm}
                onChange={(e) => updateNum('wallCabHeightCm', e.target.value)}
                className="w-full h-9 px-2.5 border border-slate-300 rounded-lg font-bold tabular-nums bg-slate-50"
              />
            </label>
          </div>

          <div className="pt-1">
            <span className="text-slate-600 font-bold block mb-1.5">نوع هود پیش‌فرض بالای گاز</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, defaultHoodKind: 'chimney' }))}
                aria-pressed={(form.defaultHoodKind || 'chimney') === 'chimney'}
                className={`h-9 rounded-lg border text-[13px] font-bold transition ${
                  (form.defaultHoodKind || 'chimney') === 'chimney'
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                    : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                اکسپوز (شومینه‌ای)
              </button>
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, defaultHoodKind: 'hidden' }))}
                aria-pressed={form.defaultHoodKind === 'hidden'}
                className={`h-9 rounded-lg border text-[13px] font-bold transition ${
                  form.defaultHoodKind === 'hidden'
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                    : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                پوشیده (مخفی داخل کابینت)
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={applyToExisting}
              onChange={(e) => setApplyToExisting(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600"
            />
            <span className="text-slate-700 font-semibold">
              اعمال ارتفاع، هود و صفحه روی دیوارها و باکس‌های فعلی
            </span>
          </label>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50 gap-2">
          <button
            type="button"
            onClick={() => setForm({ ...DEFAULT_PROJECT_SETTINGS })}
            className="h-9 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-[13px] font-bold"
          >
            بازگردانی پیش‌فرض
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-[13px] font-bold"
            >
              انصراف
            </button>
            <button
              type="button"
              onClick={() => onSave(form, applyToExisting)}
              className="h-9 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[13px] font-bold"
            >
              ذخیره و اعمال
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
