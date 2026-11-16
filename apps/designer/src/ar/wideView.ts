/** Chido's rectilinear horizontal-FOV policy for virtual 3D views.
 * The physical WebXR camera projection is never modified. A tracked virtual
 * renderer can use the same XR pose with a separate wide-angle projection. */
export type WideViewMode = 'normal' | 'wide' | 'ultra';
export const HORIZONTAL_FOV: Readonly<Record<WideViewMode, number>> = {
  normal: 60, wide: 84, ultra: 100,
};
const VERTICAL_PORTRAIT_CAP: Readonly<Record<WideViewMode, number>> = {
  normal: 98, wide: 110, ultra: 120,
};
export function wideViewVerticalFov(mode: WideViewMode, aspect: number, natural = true): number {
  if (!(aspect > 0 && Number.isFinite(aspect))) throw new RangeError('Invalid camera aspect');
  const hRad = HORIZONTAL_FOV[mode] * Math.PI / 180;
  const requested = 2 * Math.atan(Math.tan(hRad / 2) / aspect) * 180 / Math.PI;
  return natural && aspect < 1 ? Math.min(requested, VERTICAL_PORTRAIT_CAP[mode]) : requested;
}
