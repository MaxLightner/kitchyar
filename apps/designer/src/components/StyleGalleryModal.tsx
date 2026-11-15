import React, { useState } from 'react';
import { Check, Sparkles, X } from 'lucide-react';
import { DOOR_STYLE_META } from '../cad/constants';
import { KITCHEN_STYLE_PRESETS, KitchenStylePreset } from '../cad/stylePresets';

interface StyleGalleryModalProps {
  onApplyStyle: (preset: KitchenStylePreset) => void;
  onClose: () => void;
}

export const StyleGalleryModal: React.FC<StyleGalleryModalProps> = ({
  onApplyStyle,
  onClose,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const selectedPreset =
    KITCHEN_STYLE_PRESETS.find((p) => p.id === selectedId) || null;

  const handleConfirmApply = async () => {
    if (!selectedPreset || applying) return;
    setApplying(true);
    let resolved: KitchenStylePreset = selectedPreset;
    try {
      const resp = await fetch(`./assets/styles/${selectedPreset.id}.json`, {
        cache: 'no-store',
      });
      if (resp.ok) {
        const parsed = (await resp.json()) as Partial<KitchenStylePreset>;
        if (parsed && parsed.cabinetFinish && parsed.doorStyle) {
          resolved = { ...selectedPreset, ...parsed };
        }
      }
    } catch {
      // Fallback safely to embedded preset metadata
    } finally {
      setApplying(false);
    }
    onApplyStyle(resolved);
    onClose();
  };

  return (
    <div
      data-testid="style-gallery-modal"
      className="fixed inset-0 z-50 bg-slate-900/55 flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="انتخاب استایل آشپزخانه از روی عکس"
    >
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <div>
              <h2 className="text-sm font-black text-slate-900">استخراج استایل و رنگ از عکس نمونه</h2>
              <p className="text-[13px] text-slate-500">
                ابتدا یک عکس را انتخاب کنید، سپس دکمه «اعمال» پایین پنجره را بزنید تا متریال، سبک درب، دستگیره و هود اعمال شود
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="بستن گالری استایل"
            className="h-8 w-8 rounded-lg hover:bg-slate-100 text-slate-500 inline-flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {KITCHEN_STYLE_PRESETS.map((preset) => {
            const isSelected = preset.id === selectedId;
            return (
              <button
                key={preset.id}
                type="button"
                data-testid={`style-card-${preset.id}`}
                aria-pressed={isSelected}
                onClick={() => setSelectedId(preset.id)}
                className={`text-right rounded-xl border bg-white overflow-hidden flex flex-col justify-between transition ${
                  isSelected
                    ? 'border-indigo-600 ring-2 ring-indigo-500/40 shadow-lg bg-indigo-50/20'
                    : 'border-slate-200 hover:border-indigo-400 hover:shadow-md'
                }`}
              >
                <div className="w-full">
                  <div className="aspect-[16/10] bg-slate-100 overflow-hidden relative">
                    <img
                      src={preset.image}
                      alt={preset.title}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-slate-900/80 text-white text-[13px] font-bold">
                      {preset.designStyle === 'neoclassic' ? 'نئوکلاسیک' : 'مدرن'}
                    </span>
                    {isSelected && (
                      <span className="absolute top-2 left-2 w-6 h-6 rounded-full bg-indigo-600 text-white inline-flex items-center justify-center shadow">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>

                  <div className="p-3 space-y-1.5">
                    <div className="text-[13px] font-black text-slate-900">{preset.title}</div>
                    <p className="text-[13px] text-slate-500 leading-5">{preset.subtitle}</p>
                    <div className="flex flex-wrap gap-1 pt-0.5 text-[13px] font-bold text-slate-600">
                      <span className="px-1.5 py-0.5 rounded bg-slate-100">
                        درب: {DOOR_STYLE_META[preset.doorStyle].shortLabel}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-100">
                        دستگیره:{' '}
                        {preset.handleStyle === 'hidden'
                          ? 'مخفی'
                          : preset.handleStyle === 'knob'
                          ? 'قارچی'
                          : 'ساده'}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-100">
                        هود: {preset.defaultHoodKind === 'chimney' ? 'اکسپوز' : 'مخفی'}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
          <div className="text-[13px] font-bold text-slate-600 truncate">
            {selectedPreset
              ? `انتخاب‌شده: ${selectedPreset.title}`
              : 'یک تصویر از گالری بالا انتخاب کنید'}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-[13px] font-bold transition"
            >
              انصراف
            </button>
            <button
              type="button"
              data-testid="apply-selected-style-btn"
              disabled={!selectedPreset || applying}
              onClick={handleConfirmApply}
              className="h-9 px-5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 text-white text-[13px] font-extrabold inline-flex items-center justify-center gap-1.5 transition active:scale-95"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{applying ? 'در حال اعمال...' : 'اعمال استایل'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
