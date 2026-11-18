import type { HandleStyle, Orientation } from './types';

export const HANDLE_STYLES: { id: HandleStyle; label: string }[] = [
  { id: 'simple', label: 'میله‌ای ۱۸ سانت' },
  { id: 'long-bar', label: 'میله‌ای ۴۰ سانت' },
  { id: 'knob', label: 'قارچی' },
  { id: 'arch', label: 'قوسی' },
  { id: 'tab', label: 'لبه‌ای' },
  { id: 'hidden', label: 'مخفی توکار' },
  { id: 'f-profile', label: 'مخفی پروفیل F' },
  { id: 'handleless', label: 'بدون دستگیره (فشاری)' },
];

export function defaultHandleLengthCm(style: HandleStyle) {
  switch (style) {
    case 'long-bar': return 40;
    case 'knob': return 3.6;
    case 'tab': return 9;
    case 'hidden': return 14;
    case 'handleless': return 0;
    default: return 18;
  }
}

export function fitHandleLengthCm(
  style: HandleStyle, orient: Orientation, requested: number,
  leafWidth: number, leafHeight: number, xRatio = 0.5, yRatio = 0.5
): number {
  const span = orient === 'horizontal' ? leafWidth : leafHeight;
  const anchor = orient === 'horizontal' ? xRatio : yRatio;
  if (style === 'handleless') return 0;
  if (style === 'f-profile') return Math.max(0.5, span - 0.5);
  const defaultLength = defaultHandleLengthCm(style);
  const limit = style === 'knob' ? 4 : style === 'tab' ? 14 : style === 'hidden' ? 24 : 48;
  const available = Math.max(0.5, 2 * (span * Math.min(anchor, 1 - anchor) - 0.5));
  return Math.min(available, limit, style === 'knob' ? defaultLength : Math.max(4, Number.isFinite(requested) && requested > 0 ? requested : defaultLength));
}
