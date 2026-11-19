import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AppWindow, Box, CookingPot, DoorClosed, Droplets, Flame, GripVertical, Layers, PanelTop, Refrigerator, Utensils, WashingMachine } from 'lucide-react';

const icons = {
  box: Box, fridge: Refrigerator, door: DoorClosed, handle: GripVertical,
  sink: Droplets, gas: Flame, hood: PanelTop, washing: WashingMachine, dishwasher: WashingMachine,
  'builtin-oven': CookingPot, microwave: CookingPot, opening: AppWindow, dining: Utensils,
  surface: Layers, detail: PanelTop,
};

export interface PickCandidate {
  id: string;
  label: string;
  icon: keyof typeof icons;
  select: () => void;
}

export type OfferSelection = (x: number, y: number, candidates: PickCandidate[]) => boolean;
export type SurfaceSelection = 'countertop' | 'backsplash';

export function svgPickTargets(svg: SVGSVGElement, x: number, y: number, selector: string) {
  const targets = document.elementsFromPoint(x, y)
    .map(element => element.closest(selector))
    .filter((element): element is Element => element !== null && svg.contains(element));
  return [...new Set(targets)];
}

export function SelectionPicker({ x, y, candidates, onChoose, onClose }: {
  x: number; y: number; candidates: PickCandidate[];
  onChoose: (candidate: PickCandidate) => void; onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dismissOutside = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node)) onClose();
    };
    const dismissWithEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        onClose();
      }
    };
    panel.current?.querySelector('button')?.focus({ preventScroll: true });
    window.addEventListener('pointerdown', dismissOutside, true);
    window.addEventListener('keydown', dismissWithEscape, true);
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', dismissOutside, true);
      window.removeEventListener('keydown', dismissWithEscape, true);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  const buttonSize = 40;
  const rings = Math.ceil(candidates.length / 8);
  const radius = 52 * rings;
  const padding = buttonSize / 2 + 6;
  const maxRadius = Math.min(radius, Math.min(window.innerWidth, window.innerHeight) / 2 - padding);
  const margin = maxRadius + padding;
  const cx = Math.max(margin, Math.min(window.innerWidth - margin, x));
  const cy = Math.max(margin, Math.min(window.innerHeight - margin, y));

  return createPortal(
    <div ref={panel} role="group" aria-label="انتخاب از بین آبجکت‌های روی هم"
      className="pointer-events-none fixed inset-0 z-[90]">
      {candidates.map((candidate, index) => {
        const ring = Math.floor(index / 8);
        const count = Math.min(8, candidates.length - ring * 8);
        const angle = -Math.PI / 2 + 2 * Math.PI * (index % 8) / count;
        const distance = maxRadius * (ring + 1) / rings;
        const Icon = icons[candidate.icon];
        const matches = candidates.filter(item => item.label === candidate.label);
        const label = matches.length === 1 ? candidate.label : `${candidate.label} ${matches.indexOf(candidate) + 1}`;
        return (
          <button key={candidate.id} type="button" title={label} aria-label={label}
            data-testid="overlap-pick-option"
            onClick={() => onChoose(candidate)}
            className="group pointer-events-auto absolute grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-indigo-300 bg-white text-indigo-800 shadow-md hover:bg-indigo-100 focus-visible:outline-2 focus-visible:outline-indigo-600"
            style={{ left: cx + distance * Math.cos(angle), top: cy + distance * Math.sin(angle) }}>
            <Icon className="size-5" />
            {matches.length > 1 &&
              <span aria-hidden className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-indigo-700 text-[10px] text-white">{matches.indexOf(candidate) + 1}</span>}
            <span aria-hidden className="pointer-events-none absolute top-full mt-1 hidden whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-xs text-white group-hover:block group-focus-visible:block">{label}</span>
          </button>
        );
      })}
    </div>, document.fullscreenElement ?? document.body,
  );
}
