/** One immersive session owns the camera, floor tracking and DOM tools. */
export const CHIDO_REFERENCE_SPACE = 'local';

export function isHandheldARDevice(nav: Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> = navigator): boolean {
  // iPadOS may identify as a Mac. A touchscreen Windows laptop remains desktop.
  return /Android|iPhone|iPad|iPod/i.test(nav.userAgent) ||
    (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
}

export function chidoSessionOptions(root: HTMLElement): XRSessionInit {
  return {
    requiredFeatures: ['hit-test', 'dom-overlay'],
    optionalFeatures: ['anchors', 'plane-detection'],
    domOverlay: { root },
  };
}

export function createChidoSessionOwner() {
  let pending: Promise<XRSession> | null = null;
  return (xr: XRSystem, root: HTMLElement): Promise<XRSession> => {
    if (pending) return pending;
    // Keep requestSession synchronous inside the original tap (user activation).
    const request = xr.requestSession('immersive-ar', chidoSessionOptions(root));
    pending = request;
    void request.then(session => {
      session.addEventListener('end', () => { if (pending === request) pending = null; }, { once: true });
    }, () => { if (pending === request) pending = null; });
    return request;
  };
}

export const requestChidoSession = createChidoSessionOwner();

export function xrLaunchError(error: unknown, stage: string): string {
  const err = error as { name?: string; message?: string } | null;
  const name = err?.name || 'Error';
  const detail = err?.message || String(error);
  const prefix = name === 'InvalidStateError'
    ? 'نشست AR دیگری هنوز باز است؛ ابتدا آن را ببندید'
    : name === 'NotAllowedError' || name === 'SecurityError'
    ? 'مجوز AR یا دوربین داده نشد؛ مجوز مرورگر را بررسی کنید'
    : name === 'NotSupportedError'
    ? 'قابلیت موردنیاز در این مرحله پشتیبانی نشد'
    : 'راه‌اندازی اسکن متوقف شد';
  return `${prefix} — ${stage}: ${name} — ${detail}`;
}
