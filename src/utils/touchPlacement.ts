import type { ToolId } from '../cad/types';

export type PlacementPoint = { clientX: number; clientY: number };
export type CanvasAction = Pick<PointerEvent, 'button' | 'clientX' | 'clientY' | 'pointerId' | 'pointerType' | 'shiftKey' | 'preventDefault'> & {
  target: EventTarget;
  currentTarget: SVGSVGElement;
};

export function placementAt(svg: SVGSVGElement | null, point: PlacementPoint): CanvasAction | null {
  if (!svg || !Number.isFinite(point.clientX) || !Number.isFinite(point.clientY)) return null;
  // Check the topmost element first so taps on open modals, menus, or toolbars
  // never bleed through to the underlying SVG canvas.
  const topEl = document.elementFromPoint(point.clientX, point.clientY);
  if (!topEl || !svg.contains(topEl)) return null;
  return {
    ...point,
    target: topEl,
    currentTarget: svg,
    button: 0,
    pointerId: 1,
    pointerType: 'touch',
    shiftKey: false,
    preventDefault() {},
  };
}

export function isPlanPlacement(tool: ToolId) {
  return tool === 'cab-draw' || tool === 'fridge' || tool === 'opening' ||
    tool === 'sink' || tool === 'gas' || tool === 'appliance' || tool === 'dining';
}

export function isFrontPlacement(tool: ToolId) {
  return tool === 'handle' || tool === 'doors' || tool === 'door-style' || tool === 'hardware' ||
    tool === 'pencil' || tool === 'skeleton' || tool === 'fridge' ||
    tool === 'sink' || tool === 'gas' || tool === 'appliance' || tool === 'opening';
}
