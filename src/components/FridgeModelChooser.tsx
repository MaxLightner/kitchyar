import { useEffect, useState } from 'react';
import { FRIDGE_MODELS, FRIDGE_MODEL_ORDER } from '../cad/constants';
import type { FridgeModel } from '../cad/types';

/** Compact actual-model JPEG picker; previews are computed only while mounted. */
export function FridgeModelChooser({
  value, onChange,
}: {
  value: FridgeModel;
  onChange: (model: FridgeModel) => void;
}) {
  const [images, setImages] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    void import('./FridgeModelPreviews3D').then(mod => {
      if (!active) return;
      unsubscribe = mod.subscribeFridgePreviews((id, jpeg) => {
        if (active) setImages(prev => ({ ...prev, [id]: jpeg }));
      });
    }).catch(() => { /* Keep selectable text labels when WebGL is blocked. */ });
    return () => { active = false; unsubscribe(); };
  }, []);

  return (
    <div className="grid grid-cols-3 gap-2" data-testid="fridge-model-chooser">
      {FRIDGE_MODEL_ORDER.map(id => {
        const cfg = FRIDGE_MODELS[id];
        return (
          <button key={id} type="button"
            title={cfg.label}
            aria-label={cfg.label}
            aria-pressed={value === id}
            onClick={() => onChange(id)}
            className="min-w-0 overflow-hidden rounded-lg border-2 border-slate-200 bg-white aria-pressed:border-indigo-600 aria-pressed:ring-1 aria-pressed:ring-indigo-400">
            <div className="aspect-square w-full overflow-hidden bg-slate-100 flex items-center justify-center">
              {images[id]
                ? <img src={images[id]} alt={cfg.label} width={250} height={250}
                    decoding="async" loading="lazy" className="h-full w-full object-contain" />
                : <span className="text-[10px] text-slate-400">نمای مدل</span>}
            </div>
            <span className="block min-h-8 px-1 py-1 text-[10px] font-bold text-slate-700 leading-3">{cfg.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
