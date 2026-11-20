import React, { useEffect, useId, useState } from 'react';
import { SINK_MODELS, SINK_MODEL_ORDER } from '../cad/constants';
import type { SinkModel } from '../cad/types';

/** A consistent 250x250 still preview. Uses vector-only layouts so opening
 * the model selector never creates a second WebGL renderer or loads 11 models. */
export function SinkModelThumb({ model }: {model: SinkModel}) {
  const id = useId().replace(/:/g,'');
  const corner = model.includes('corner');
  const dark = model.includes('black') || model.includes('gunmetal');
  const brown = model.includes('brown');
  const steel = brown ? '#806b56' : dark ? '#3e4852' : '#b6c3cb';
  const lip = brown ? '#a09279' : dark ? '#647585' : '#f4f7f9';
  const bowls: Array<[number,number,number,number]> = model.includes('double') || corner
    ? corner
      ? (model.includes('corner-l') ? [[43,96,65,72],[122,105,68,67]] : [[36,88,72,70],[136,89,72,70]])
      : [[28,75,70,96],[119,75,70,96]]
    : model.includes('workstation') ? [[32,75,171,95]]
    : model.includes('fan') ? [[28,75,93,92]]
    : [[36,75,165,95]];
  const cutDeck = corner
    ? model.includes('corner-v') ? 'M125 17 L213 87 L218 196 L32 196 L37 87 Z'
      : model.includes('corner-l') ? 'M22 47 L217 47 L217 196 L35 196 L35 113 Z'
        : 'M22 56 L217 56 L217 189 L34 189 L34 112 Z'
    : 'M20 58 Q20 43 37 43 L213 43 Q230 43 230 58 L230 191 Q230 206 213 206 L37 206 Q20 206 20 191 Z';
  return (
    <svg viewBox="0 0 250 250" width="250" height="250"
      className="block h-full w-full object-contain" role="img"
      aria-label={SINK_MODELS[model]?.label ?? 'سینک'}>
      <defs>
        <linearGradient id={id+'deck'} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={lip} />
          <stop offset=".5" stopColor={steel} />
          <stop offset="1" stopColor={dark?'#141a23':'#8a9aa6'} />
        </linearGradient>
        <linearGradient id={id+'bowl'} x1="0" y1="0" x2=".7" y2="1">
          <stop offset="0" stopColor={dark?'#111827':'#50616d'} />
          <stop offset=".58" stopColor={dark?'#232b38':'#9aabb5'} />
          <stop offset="1" stopColor={dark?'#0a111c':'#415360'} />
        </linearGradient>
        <filter id={id+'shadow'} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>
      <rect x="0" y="0" width="250" height="250" rx="14" fill="#e9edf0"/>
      <path d={cutDeck} fill="#111827" opacity=".18" transform="translate(2 8)" filter={`url(#${id}shadow)`} />
      <path d={cutDeck} fill={`url(#${id}deck)`} stroke={lip} strokeWidth="2.5"/>
      {bowls.map(([x,y,w,h],i) => (
        <g key={i}>
          <rect x={x-2} y={y-2} width={w+4} height={h+4} rx="12" fill={dark?'#10171f':'#eef2f5'}
            stroke={lip} strokeWidth="3"/>
          <rect x={x+4} y={y+4} width={w-8} height={h-8} rx="9" fill={`url(#${id}bowl)`}
            stroke={dark?'#536474':'#6c8593'} strokeWidth="2.5"/>
          <ellipse cx={x+w/2} cy={y+h*.68} rx="7" ry="5" fill="#17222b" stroke={lip}/>
        </g>
      ))}
      {(model.includes('flat') || model.includes('ribbed') || model.includes('fan') || model.includes('grid')) &&
        Array.from({length:7},(_,i)=><line key={i} x1="202" y1={79+i*15} x2="217" y2={79+i*15}
          stroke={dark?'#1b2531':'#647986'} strokeWidth="1.5" opacity=".65"/>)}
      <circle cx="127" cy="62" r="5" fill="#273442" stroke={lip} strokeWidth="2" />
      <path d="M127 61 Q121 19 146 30" stroke={lip} strokeWidth="6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function SinkModelChooser({value,onChange}:{value:SinkModel;onChange:(id:SinkModel)=>void}) {
  const [realJpegs, setRealJpegs] = useState<Record<string,string>>({});
  useEffect(() => {
    let disposed = false;
    let unsubscribe = () => {};
    // This module is loaded ONLY on opening the sink picker. Rendering 3D
    // thumbnails one by one at idle prevents adding 11 absent sink models to
    // the main 3D scene or starting a second 3D renderer at app startup.
    void import('./SinkModelPreviews3D').then(mod => {
      if (disposed) return;
      unsubscribe = mod.subscribeSinkPreviews((model,jpeg) => {
        if (!disposed) setRealJpegs(prev => ({ ...prev, [model]:jpeg }));
      });
    }).catch(() => { /* Keep deterministic SVG preview as WebGL fallback */ });
    return () => { disposed = true; unsubscribe(); };
  }, []);
  return (
    <div className="grid grid-cols-3 gap-2" data-testid="sink-model-chooser">
      {SINK_MODEL_ORDER.map(model => (
        <button key={model} type="button" title={SINK_MODELS[model].label}
          aria-label={SINK_MODELS[model].label} aria-pressed={value===model}
          onClick={()=>onChange(model)} className="min-w-0 overflow-hidden rounded-lg border-2 border-slate-200 bg-white
            aria-pressed:border-teal-600 aria-pressed:ring-1 aria-pressed:ring-teal-400">
          <div className="aspect-square w-full overflow-hidden">
            {realJpegs[model] ? (
              <img src={realJpegs[model]} alt={SINK_MODELS[model].label}
                width={250} height={250} decoding="async"
                className="h-full w-full object-contain" />
            ) : <SinkModelThumb model={model}/>}

          </div>
          <span className="block min-h-8 px-1 py-1 text-[10px] font-bold text-slate-700 leading-3">
            {SINK_MODELS[model].shortLabel}
          </span>
        </button>
      ))}
    </div>
  );
}
