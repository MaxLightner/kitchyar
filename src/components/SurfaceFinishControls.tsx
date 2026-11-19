import React, { useEffect, useState } from 'react';
import { SURFACES } from '../cad/surfaceFinish';

export type SurfaceFinishPatch = { reflection?: number; roughness?: number };

function FinishRange({ label, value, min, max, step, onCommit }: {
  label: string; value: number; min: number; max: number; step: number;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = (event: React.SyntheticEvent<HTMLInputElement>) => {
    const next = Number(event.currentTarget.value);
    if (next !== value) onCommit(next);
  };
  return (
    <label className="block min-w-0">
      <span className="flex justify-between gap-1">
        <span>{label}</span><output>{Math.round(draft * 100)}٪</output>
      </span>
      <input type="range" dir="ltr" min={min} max={max} step={step} value={draft}
        aria-label={label} onChange={event => setDraft(Number(event.target.value))}
        onPointerUp={commit} onKeyUp={commit} onBlur={commit}
        className="w-full accent-indigo-600" />
    </label>
  );
}

export function SurfaceFinishControls({ index, reflection, roughness, onChange }: {
  index: 0 | 1 | 2 | 3; reflection?: number; roughness?: number;
  onChange: (patch: SurfaceFinishPatch) => void;
}) {
  const surface = SURFACES[index];
  if (index === 0 || index === 1) {
    const glossy = (roughness ?? surface.spread) <= 0.10;
    return (
      <fieldset className="rounded border border-slate-200 px-2 py-1.5">
        <legend className="px-1 text-xs font-bold">پرداخت {surface.label}</legend>
        <div className="grid grid-cols-2 gap-2">
          {([
            { label: 'مات', roughness: 0.20, reflection: 0.15, active: !glossy },
            { label: 'براق', roughness: 0.05, reflection: 2.00, active: glossy },
          ] as const).map(option => (
            <button key={option.label} type="button"
              data-testid={`surface-finish-${index}-${option.label}`}
              aria-pressed={option.active}
              onClick={() => onChange({ roughness: option.roughness, reflection: option.reflection })}
              className="h-9 rounded border text-xs font-bold aria-pressed:border-indigo-600 aria-pressed:bg-indigo-50">
              {option.label}
            </button>
          ))}
        </div>
      </fieldset>
    );
  }
  return (
    <fieldset className="rounded border border-slate-200 px-2 py-1.5">
      <legend className="px-1 text-xs font-bold">بازتاب و ماتی {surface.label}</legend>
      <div className="grid grid-cols-2 gap-2 text-xs text-slate-700">
        <FinishRange label="بازتاب" value={reflection ?? surface.strength} min={0} max={2} step={0.05}
          onCommit={value => onChange({ reflection: value })} />
        <FinishRange label="ماتی" value={roughness ?? surface.spread} min={0.09} max={0.9} step={0.01}
          onCommit={value => onChange({ roughness: value })} />
      </div>
    </fieldset>
  );
}
