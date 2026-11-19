import React, {useState} from 'react';
import {NumberPadDialog} from './NumberPadDialog';
import type {ARSessionState, UnifiedARSession} from '../ar/unifiedARSession';
import {chidoScanReadiness} from '../ar/chidoScanReadiness';

/** Tracking controls inside the existing 3D editor; no scene or canvas of its own. */
export function ARControls({state,session,onRetry,dialogOpen=false}: {
  state:ARSessionState; session:UnifiedARSession|null; onRetry:()=>void; dialogOpen?:boolean;
}) {
  const [distanceOpen,setDistanceOpen]=useState(false);
  const scan=chidoScanReadiness({xrAvailable:typeof navigator.xr!=='undefined',starting:state.starting,
    sessionActive:state.active,tracking:state.tracking,rawHits:state.rawHits,validHits:state.validHits,
    ready:state.ready,error:state.error});
  const button='h-10 rounded-lg px-3 font-bold border border-slate-300 bg-white text-slate-800';
  return <div data-testid="ar-controls" data-xr-active={state.active?'1':'0'}
    data-floor-locked={state.floorLocked?'1':'0'}
    className="absolute inset-0 pointer-events-none z-40" dir="rtl">
    {!state.floorLocked ? <section data-testid="chido-floor-scan-readiness"
      className="pointer-events-auto absolute top-3 left-1/2 -translate-x-1/2 w-[min(465px,calc(100%-24px))] rounded-xl border border-[#e9dbc8] bg-[#f8efe7f5] p-3 shadow-lg text-[#2c5341]">
      <strong className="block text-center">دوربین را آرام به چپ و راست حرکت دهید</strong>
      <p className="text-sm mt-1">{scan.label}</p>
      <progress className="w-full h-2 accent-emerald-700" max={100} value={scan.progress}/>
      {state.error&&<p role="alert" className="mt-2 text-sm text-red-800">{state.error}</p>}
      <div className="mt-2 flex gap-2 justify-end">
        {state.active&&!state.error?<button data-testid="chido-confirm-floor" type="button"
          disabled={!state.ready} onClick={()=>session?.confirmFloor()}
          className="h-10 px-4 rounded-lg bg-emerald-700 text-white font-bold disabled:bg-slate-300 disabled:text-slate-600">تأیید کف</button>:
          <button data-testid="chido-start-camera" type="button" disabled={state.starting}
            onClick={onRetry} className={button}>{state.starting?'در حال راه‌اندازی…':'راه‌اندازی دوربین'}</button>}
      </div>
    </section>:<section data-testid="ar-scale-controls"
      className="pointer-events-auto absolute top-3 right-3 max-w-[calc(100%-24px)] rounded-xl bg-white/95 border border-slate-200 shadow-md p-2 text-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" data-testid="ar-calibrate-toggle" onClick={()=>session?.calibrate(!state.calibrating)}
          aria-pressed={state.calibrating} className={button}>مقیاس A / B</button>
        <button type="button" data-testid="ar-rescan" onClick={()=>session?.rescan()} className={button}>اسکن مجدد کف</button>
        <button type="button" data-testid="ar-toggle-kitchen" onClick={()=>session?.toggleKitchen()} className={button}>
          {state.kitchenHidden?'نمایش آشپزخانه':'مخفی کردن آشپزخانه'}
        </button>
        <button type="button" aria-pressed={state.occlusionEnabled} onClick={()=>session?.toggleOcclusion()} className={button}>
          پوشش نزدیک: {state.occlusionEnabled?'روشن':'خاموش'}
        </button>
      </div>
      {state.calibrating&&<div className="mt-2 space-y-2" data-testid="ar-calibration-panel">
        <p>نقطهٔ A را جابه‌جا کنید؛ با B جهت و اندازه را تنظیم کنید.</p>
        <div className="flex items-center gap-2 flex-wrap">
          {(['a','b'] as const).map(pin=><button type="button" key={pin} data-testid={'ar-calibrate-'+pin}
            aria-pressed={state.selectedPin===pin} onClick={()=>session?.selectPin(pin)}
            className={button+(state.selectedPin===pin?' !bg-indigo-600 !text-white':'')}>جانمایی {pin.toUpperCase()}</button>)}
          <button type="button" data-testid="ar-real-distance" onClick={()=>setDistanceOpen(true)} className={button}>
            فاصلهٔ واقعی: {state.distanceCm.toLocaleString('fa-IR')} سانتی‌متر
          </button>
          <button type="button" data-testid="ar-calibration-done" onClick={()=>session?.calibrate(false)}
            className={button+' !bg-emerald-700 !text-white'}>پایان تنظیم</button>
        </div>
      </div>}
      {state.error&&<p role="alert" className="mt-2 text-sm text-red-800">{state.error}</p>}
    </section>}
    {state.active&&(!state.floorLocked||state.selectedPin)&&<div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
      {!state.floorLocked ? <div className="flex flex-col items-center gap-1">
        <div className="w-[108px] h-[108px] rounded-full border-2 border-emerald-400 bg-slate-950/30 text-white flex flex-col items-center justify-center shadow-lg">
          <strong className="text-2xl tabular-nums" dir="ltr">{state.detectedFloorDistanceM===null?'—':state.detectedFloorDistanceM.toFixed(2)}</strong>
          <span className="text-[12px] font-bold">متر</span>
        </div>
        <span className="bg-slate-950/65 text-white rounded-full px-3 py-1 text-[12px] font-bold">
          فاصله کف تشخیص‌داده‌شده تا دوربین
        </span>
      </div>:<div className="w-9 h-9 rounded-full border-2 border-emerald-400 flex items-center justify-center shadow-md">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"/>
      </div>}
    </div>}
    {state.floorLocked&&state.calibrating&&state.selectedPin&&!dialogOpen&&<button type="button"
      data-testid="ar-confirm-pin" onClick={()=>session?.confirmPinAtAim()}
      className="pointer-events-auto absolute bottom-12 left-1/2 -translate-x-1/2 h-11 px-5 rounded-xl bg-emerald-700 text-white font-bold">
      تأیید نقطهٔ {state.selectedPin.toUpperCase()}
    </button>}
    {distanceOpen&&state.floorLocked&&!dialogOpen&&<NumberPadDialog label="فاصلهٔ واقعی A و B (سانتی‌متر)"
      initial={state.distanceCm} min={10} max={1000} onApply={cm=>{session?.applyDistance(cm);setDistanceOpen(false);}}
      onClose={()=>setDistanceOpen(false)}/>}
  </div>;
}
