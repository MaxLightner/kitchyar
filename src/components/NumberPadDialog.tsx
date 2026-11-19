import React, { useEffect, useId, useState } from 'react';

export function NumberPadDialog({ label, initial, min, max, allowRow = false, other, onApply, onClose }: {
  label: string; initial: number; min: number; max: number;
  allowRow?: boolean;
  other?: { label: string; initial: number; min: number; max: number };
  onApply: (value: number, row: boolean, secondary?: number) => void; onClose: () => void;
}) {
  const id = useId();
  const [firstValue, setFirstValue] = useState(String(Math.round(initial * 10) / 10));
  const [secondValue, setSecondValue] = useState(String(Math.round((other?.initial ?? 0) * 10) / 10));
  const [second, setSecond] = useState(false);
  const value = second ? secondValue : firstValue;
  const setValue = second ? setSecondValue : setFirstValue;
  const lower = second && other ? other.min : min;
  const upper = second && other ? other.max : max;
  const [row, setRow] = useState(false);
  const [fresh, setFresh] = useState(true);
  const inRange = (text: string, low: number, high: number) => text.trim() !== '' &&
    Number.isFinite(Number(text)) && Number(text) >= low && Number(text) <= high;
  const valid = inRange(firstValue, min, max) && (!other || inRange(secondValue, other.min, other.max));
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); }
    };
    window.addEventListener('keydown', esc, true);
    return () => window.removeEventListener('keydown', esc, true);
  }, [onClose]);
  return (
    <div className="absolute inset-0 z-[95] flex items-end justify-start overflow-auto bg-slate-950/15 p-2 [direction:ltr] pointer-events-auto"
      onPointerDown={e => e.stopPropagation()}>
      <form role="dialog" aria-modal="true" aria-labelledby={id} dir="rtl"
        className="max-h-[calc(100dvh-1rem)] w-full max-w-[19rem] overflow-y-auto space-y-2 rounded-xl bg-white p-3 shadow-xl"
        onSubmit={e => { e.preventDefault(); e.stopPropagation(); if (valid) onApply(Number(firstValue), row, other ? Number(secondValue) : undefined); }}
        onKeyDown={e => e.stopPropagation()}>
        <label htmlFor={id+'-value'} id={id} className="block text-sm font-bold">{second && other ? other.label : label} (سانتی‌متر)</label>
        {other && <div className="flex gap-1">{[label, other.label].map((item, i) => (
          <button key={item} type="button" aria-pressed={second === (i === 1)} className="flex-1 rounded border px-1 text-xs aria-pressed:bg-indigo-100"
            onClick={() => { setSecond(i === 1); setFresh(true); }}>{item}</button>
        ))}</div>}
        <input id={id+'-value'} autoFocus inputMode="none" dir="ltr" value={value}
          onChange={e => { setFresh(false); setValue(e.target.value.replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/٫/g,'.')); }}
          className="h-10 w-full rounded-md border border-slate-300 px-3 text-center text-lg tabular-nums" />
        <div className="grid grid-cols-3 gap-1" dir="ltr">
          {['1','2','3','4','5','6','7','8','9',lower < 0 ? '±' : '.','0','⌫'].map(key => (
            <button key={key} type="button" className="h-9 rounded bg-slate-100 font-bold" onClick={() => {
              setValue(old => key === '⌫' ? old.slice(0,-1) : key === '±' ? (old.startsWith('-') ? old.slice(1) : '-'+old)
                : (fresh ? '' : old) + key);
              setFresh(false);
            }}>{key}</button>
          ))}
        </div>
        {allowRow && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={row}
          onChange={e => setRow(e.target.checked)} /> اعمال به کابینت‌های متصل همین دیوار</label>}
        {!valid && <p role="status" className="text-xs text-rose-700">بازهٔ مجاز: {lower} تا {upper}</p>}
        <div className="flex gap-2">
          <button type="submit" disabled={!valid} className="h-10 flex-1 rounded bg-emerald-700 font-bold text-white disabled:opacity-40">تأیید</button>
          <button type="button" onClick={onClose} className="h-10 rounded border px-3">لغو</button>
        </div>
      </form>
    </div>
  );
}
