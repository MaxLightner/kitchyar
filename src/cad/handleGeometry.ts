import type { HandleStyle, Orientation } from './types';

export const HANDLE_STYLES: { id: HandleStyle; label: string }[] = [
  { id: 'simple', label: 'میله‌ای' },
  { id: 'knob', label: 'قارچی' },
  { id: 'arch', label: 'قوسی' },
  { id: 'tab', label: 'لبه‌ای' },
  { id: 'hidden', label: 'توکار' },
];

export function fitHandleLengthCm(
  style: HandleStyle, orient: Orientation, requested: number,
  leafWidth: number, leafHeight: number, xRatio = 0.5, yRatio = 0.5
): number {
  const span = orient === 'horizontal' ? leafWidth : leafHeight;
  const anchor = orient === 'horizontal' ? xRatio : yRatio;
  const defaultLength = style === 'knob' ? 3.6 : style === 'tab' ? 9 : style === 'hidden' ? 14 : 16;
  const limit = style === 'knob' ? 4 : style === 'tab' ? 14 : style === 'hidden' ? 24 : 32;
  const available = Math.max(0.5, 2 * (span * Math.min(anchor, 1 - anchor) - 0.5));
  return Math.min(available, limit, style === 'knob' ? defaultLength : Math.max(4, Number.isFinite(requested) && requested > 0 ? requested : defaultLength));
}
