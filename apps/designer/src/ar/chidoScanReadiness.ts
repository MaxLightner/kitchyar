/**
 * Chido's scanReadiness progress (from chidoset/app.js).
 * These five stages are observations, not a measurement of ARCore completion.
 */
export interface ChidoScanReadinessInput {
  xrAvailable: boolean | null;
  starting: boolean;
  sessionActive: boolean;
  tracking: boolean;
  rawHits: number;
  validHits: number;
  ready: boolean;
  error?: string | null;
}
export function chidoScanReadiness(input: ChidoScanReadinessInput): {progress: number; label: string} {
  if (input.error) return {progress: 0, label: input.error};
  if (input.xrAvailable === false) return {
    progress: 0,
    label: 'WebXR در این مرورگر پشتیبانی نمی‌شود؛ برای اسکن واقعی از Chrome اندروید و ARCore استفاده کنید',
  };
  if (!input.sessionActive) return {
    progress: input.starting ? 12 : 0,
    label: input.starting ? 'در حال بارگذاری موتور و درخواست دسترسی دوربین…' : 'دوربین AR هنوز فعال نشده است',
  };
  let progress = 12, label = 'راه‌اندازی ردیابی…';
  if (input.tracking) { progress = 35; label = 'دوربین آماده است؛ آرام به سمت کف حرکت بده'; }
  if (input.rawHits > 0) { progress = 60; label = 'برخورد با سطح ثبت شد؛ بررسی نقاط کف'; }
  if (input.validHits > 0) { progress = 78; label = 'نقاط افقی دریافت شدند'; }
  if (input.ready) { progress = 100; label = 'کف پیشنهادی آماده است؛ تثبیت را بزن'; }
  return {progress, label};
}
