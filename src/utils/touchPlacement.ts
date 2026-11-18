import type { ToolId } from '../cad/types';

export type PlacementPoint = { clientX: number; clientY: number };
export type CanvasAction = Pick<PointerEvent, 'button' | 'clientX' | 'clientY' | 'pointerId' | 'pointerType' | 'shiftKey' | 'preventDefault'> & {
  target: EventTarget;
  currentTarget: SVGSVGElement;
};

export function placementAt(svg: SVGSVGElement | null, point: PlacementPoint): CanvasAction | null {
  if (!svg) return null;
  const target = document.elementsFromPoint(point.clientX, point.clientY).find(node => svg.contains(node));
  if (!target) return null;
  return {
    ...point, target, currentTarget: svg, button: 0, pointerId: -1,
    pointerType: 'touch', shiftKey: false, preventDefault() {},
  };
}

export function isPlanPlacement(tool: ToolId) {
  return tool === 'wall' || tool === 'cab-draw' || tool === 'fridge' || tool === 'opening' ||
    tool === 'sink' || tool === 'gas' || tool === 'appliance';
}

export function isFrontPlacement(tool: ToolId) {
  return tool === 'handle' || tool === 'doors' || tool === 'door-style' || tool === 'hardware' ||
    tool === 'finish' || tool === 'pencil' || tool === 'skeleton' || tool === 'fridge' ||
    tool === 'sink' || tool === 'gas' || tool === 'appliance' || tool === 'opening';
}
