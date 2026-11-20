import { useEffect, useState } from 'react';
import { APPLIANCE_CATALOG } from '../hoods/catalog';
import type { CooktopModel } from '../cad/types';

const choices = APPLIANCE_CATALOG
  .filter(item => item.category === 'cooktop')
  .map(item => ({ id: item.id as CooktopModel, label: item.titleFa }));

function Placeholder({ id }: { id: CooktopModel }) {
  const n = id.includes('domino') ? 2 : id.includes('steel-3') ? 3 : id.includes('4') ? 4 : 5;
  const metal = id.includes('steel') || id.includes('domino');
  const coords: Array<[number, number]> = n === 2
    ? [[87, 95], [163, 150]]
    : n === 3 ? [[80, 92], [170, 92], [125, 160]]
    : n === 4 ? [[83, 88], [167, 88], [83, 164], [167, 164]]
    : [[75, 83], [172, 83], [125, 127], [75, 172], [172, 172]];
  return (
    <svg viewBox="0 0 250 250" className="h-full w-full" aria-hidden="true">
      <rect width="250" height="250" fill="#e8edf1" rx="12"/>
      <rect x="18" y="40" width="214" height="177" rx="12"
        fill={metal ? '#9ca7ae' : '#171d25'} stroke={metal ? '#c7d1d7' : '#535e68'} strokeWidth="5"/>
      {coords.map(([x,y],i) => <g key={i}>
        <circle cx={x} cy={y} r={n === 5 && i === 2 ? 14 : 24}
          fill={metal ? '#434b53' : '#29323c'} stroke={metal ? '#e3e7e9' : '#a0acb4'} strokeWidth="4"/>
        <circle cx={x} cy={y} r={n === 5 && i === 2 ? 7 : 12} fill="#12181e" stroke="#737f89" strokeWidth="2"/>
      </g>)}
      <g fill={metal ? '#333b42' : '#9da8b1'}>
        <circle cx="94" cy="203" r="4"/><circle cx="124" cy="203" r="4"/><circle cx="154" cy="203" r="4"/>
      </g>
    </svg>
  );
}

/** Actual 3D-source JPEG cards (250x250), same pattern as fridge/sink pickers. */
export function CooktopModelChooser({ value, onChange }: {
  value: CooktopModel;
  onChange: (model: CooktopModel) => void;
}) {
  const [images, setImages] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};
    void import('./CooktopModelPreviews3D').then(mod => {
      if (!active) return;
      unsubscribe = mod.subscribeCooktopPreviews((id, jpeg) => {
        if (active) setImages(prev => ({ ...prev, [id]: jpeg }));
      });
    }).catch(() => { /* Show stable fallback on unsupported WebGL */ });
    return () => { active = false; unsubscribe(); };
  }, []);
  return (
    <div className="grid grid-cols-3 gap-2" data-testid="cooktop-model-chooser">
      {choices.map(({ id, label }) => <button key={id} type="button" title={label}
        aria-label={label} aria-pressed={value === id} onClick={() => onChange(id)}
        className="min-w-0 overflow-hidden rounded-lg border-2 border-slate-200 bg-white aria-pressed:border-indigo-600 aria-pressed:ring-1 aria-pressed:ring-indigo-400">
        <div className="aspect-square w-full overflow-hidden bg-slate-100">
          {images[id]
            ? <img src={images[id]} alt={label} width={250} height={250} loading="lazy"
                decoding="async" className="h-full w-full object-contain"/>
            : <Placeholder id={id}/>}
        </div>
        <span className="block min-h-8 px-1 py-1 text-[10px] font-bold leading-3 text-slate-700">{label}</span>
      </button>)}
    </div>
  );
}
