declare const __BUILD_VERSION__: string;
const BUILD_VERSION = typeof __BUILD_VERSION__ === 'string' ? __BUILD_VERSION__ : 'development';
const KEY = 'kitchyar_diagnostics_v1';
const LIMIT = 100;
type Entry = { time: string; event: string; detail: string; context: Record<string, unknown> };
let context: Record<string, unknown> = {};
let entries: Entry[] = [];
try { const saved = JSON.parse(localStorage.getItem(KEY) || '[]'); if (Array.isArray(saved)) entries = saved.slice(-LIMIT); } catch { /* unavailable storage */ }
export function setDiagnosticContext(next: Record<string, unknown>) { context = next; }
export function logDiagnostic(event: string, detail: unknown = '') {
  const message = detail instanceof Error ? `${detail.message}\n${detail.stack || ''}` : String(detail);
  entries.push({ time: new Date().toISOString(), event, detail: message.slice(0, 1600), context: { ...context, version: BUILD_VERSION } });
  entries = entries.slice(-LIMIT);
  try { localStorage.setItem(KEY, JSON.stringify(entries)); } catch { /* logging must never interrupt editing */ }
}
export function downloadDiagnostics() {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ version: BUILD_VERSION, userAgent: navigator.userAgent, entries }, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'kitchyar-error-log.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function installDiagnostics() {
  window.addEventListener('error', e => logDiagnostic('error', e.error || e.message));
  window.addEventListener('unhandledrejection', e => logDiagnostic('unhandledrejection', e.reason));
  document.addEventListener('webglcontextlost', () => logDiagnostic('webglcontextlost'), true);
  document.addEventListener('webglcontextrestored', () => logDiagnostic('webglcontextrestored'), true);
  document.addEventListener('pointerdown', e => {
    const target = e.target instanceof Element ? e.target.closest('button,canvas,svg') : null;
    logDiagnostic('pointerdown', target?.getAttribute('aria-label') || target?.getAttribute('title') || target?.tagName || 'surface');
  }, true);
  logDiagnostic('session-start');
}
