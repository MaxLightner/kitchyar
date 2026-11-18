import { canDoorOpenIn3D, getBoxFrameInsets, uid } from './doorRules';
import type { BlockedZone, CabinetBox, DoorUnit, Orientation, Wall } from './types';

const SNAP_CM = 4;
const MIN_WIDTH_CM = 22;
const MIN_HEIGHT_CM = 12;

export interface FrontCut {
  orientation: Orientation;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  at: number;
  snapped: boolean;
  doorId?: string;
  logicalStart: number;
  logicalEnd: number;
  row: number;
  ratio: number;
}

export function findFrontCut(
  wall: Wall, box: CabinetBox, orientation: Orientation, x: number, y: number,
  blocked: BlockedZone[] = [],
): FrontCut | null {
  if (box.type === 'fridge') return null;
  const inset = getBoxFrameInsets(box);
  const bottom = box.elevY + box.plinth + inset.bottom;
  const top = box.elevY + box.height - box.countertopCm - inset.top;
  const height = top - bottom;
  const width = box.width - inset.left - inset.right;
  const left = box.offsetX + inset.left;
  if (width <= 0 || height <= 0 || x < left || x > left + width || y < bottom || y > top) return null;
  const scale = width / box.width;
  const logicalX = (x - left) / scale;
  const door = box.doors.find(d => logicalX > d.startCm + 0.01 && logicalX < d.startCm + d.widthCm - 0.01);
  if (door?.hardwareKind === 'pantry-pullout' || door?.hardwareKind === 'lift-bifold' || door?.drawerBand || door?.kind === 'rail') return null;
  const logicalStart = door?.startCm ??
    Math.max(0, ...box.doors.map(d => d.startCm + d.widthCm).filter(end => end <= logicalX));
  const logicalEnd = door ? door.startCm + door.widthCm :
    Math.min(box.width, ...box.doors.map(d => d.startCm).filter(start => start >= logicalX));
  const x1 = left + logicalStart * scale;
  const x2 = left + logicalEnd * scale;
  const tier = box.type === 'wall' ? 'wall-lower' : box.type === 'wall-deep' ? 'wall-upper' : 'lower';
  if (blocked.some(zone => zone.tier === tier && zone.startCm < x2 - 1 && zone.endCm > x1 + 1)) return null;
  const rows = [0, ...(door?.drawerRatios ?? []), 1];
  const row = Math.max(0, rows.findIndex((ratio, i) => 1 - (y - bottom) / height >= ratio &&
    1 - (y - bottom) / height <= (rows[i + 1] ?? -1)));
  const y1 = top - rows[row + 1] * height;
  const y2 = top - rows[row] * height;
  const vertical = orientation === 'vertical';
  const lo = vertical ? x1 : y1, hi = vertical ? x2 : y2;
  const wanted = vertical ? x : y;
  const min = vertical ? MIN_WIDTH_CM : MIN_HEIGHT_CM;
  if (hi - lo < min * 2 || wanted < lo + min - SNAP_CM || wanted > hi - min + SNAP_CM) return null;
  const nearby = wall.boxes.filter(other => other.id !== box.id &&
    other.offsetX <= x2 + 65 && other.offsetX + other.width >= x1 - 65);
  const guides = vertical
    ? [...box.unitDividers.map(value => left + value * scale), ...nearby.flatMap(other => [other.offsetX, other.offsetX + other.width])]
    : nearby.flatMap(other => other.type === 'wall' || other.type === 'wall-deep' ? [other.elevY] :
        other.type === 'base' ? [other.elevY + other.height] : []);
  const thirds = [1 / 3, 1 / 2, 2 / 3].map(fraction => lo + (hi - lo) * fraction);
  const nearest = (values: number[]) => values
    .filter(value => value >= lo + min && value <= hi - min && Math.abs(value - wanted) <= SNAP_CM)
    .sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted))[0];
  const snap = nearest(guides) ?? nearest(thirds);
  const at = snap ?? Math.max(lo + min, Math.min(hi - min, Math.round(wanted)));
  return { orientation, x1, x2, y1: vertical ? bottom : y1, y2: vertical ? top : y2, at,
    snapped: snap !== undefined, doorId: door?.id, logicalStart, logicalEnd, row,
    ratio: vertical ? (at - left) / scale : (top - at) / height };
}

export function applyFrontCut(box: CabinetBox, cut: FrontCut) {
  const original = box.doors.find(door => door.id === cut.doorId);
  const source: DoorUnit = original ?? {
    id: uid('door'), startCm: cut.logicalStart, widthCm: cut.logicalEnd - cut.logicalStart,
    kind: 'door', drawerRatios: [],
  };
  const handles = box.handles.filter(handle => handle.doorId === source.id);
  const others = box.doors.filter(door => door.id !== source.id);
  if (cut.orientation === 'vertical') {
    const width = cut.ratio - cut.logicalStart;
    const split = { ...source, id: uid('door'), startCm: cut.ratio, widthCm: cut.logicalEnd - cut.ratio };
    box.doors = [...others, { ...source, widthCm: width }, split].sort((a, b) => a.startCm - b.startCm);
    box.handles.push(...handles.map(handle => ({ ...handle, id: uid('hand'), doorId: split.id })));
    if (!box.unitDividers.some(divider => Math.abs(divider - cut.ratio) < 0.2)) {
      box.unitDividers = [...box.unitDividers, cut.ratio].sort((a, b) => a - b);
    }
  } else {
    const stackingHinges = source.frontCutHinges || source.kind === 'door' || source.kind === 'open';
    const door: DoorUnit = { ...source, kind: source.kind === 'drawer' ? 'drawer' : 'lift',
      frontCutHinges: stackingHinges, drawerRatios: [...source.drawerRatios, cut.ratio].sort((a, b) => a - b) };
    box.doors = [...others, door].sort((a, b) => a.startCm - b.startCm);
    if (canDoorOpenIn3D(box, source, cut.row)) {
      box.handles = [...box.handles.map(handle => handle.doorId === source.id && handle.rowIndex > cut.row
        ? { ...handle, rowIndex: handle.rowIndex + 1 } : handle),
        ...handles.filter(handle => handle.rowIndex === cut.row && handle.style !== 'handleless')
          .map(handle => ({ ...handle, id: uid('hand'), rowIndex: cut.row + 1 }))];
    }
  }
  return source.id;
}
