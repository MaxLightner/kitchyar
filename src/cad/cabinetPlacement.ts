import { BOX_PRESETS, DEFAULT_PROJECT_SETTINGS } from './constants';
import { analyzeCornerJunction, computeMultiWallSweep, detectCornerJunctions, getBoxTier, type SweepSegment } from './cornerLogic';
import type { BoxKind, ProjectState, Wall } from './types';

function subtractBlockedIntervals(
  startCm: number,
  endCm: number,
  blocked: Array<{ start: number; end: number }>
): Array<{ start: number; end: number }> {
  let spans = [{ start: startCm, end: endCm }];
  for (const b of blocked) {
    const next: Array<{ start: number; end: number }> = [];
    for (const sp of spans) {
      if (b.end <= sp.start + 1 || b.start >= sp.end - 1) {
        next.push(sp);
      } else {
        if (b.start - sp.start >= 30) next.push({ start: sp.start, end: b.start });
        if (sp.end - b.end >= 30) next.push({ start: b.end, end: sp.end });
      }
    }
    spans = next;
  }
  return spans;
}

export function cabinetStarterSegment(wall: Wall, targetCm: number): SweepSegment {
  const widthCm = 60;
  const centered = Math.round((targetCm - widthCm / 2) / 5) * 5;
  const startCm = targetCm >= 0 && targetCm <= wall.length && wall.length >= widthCm
    ? Math.max(0, Math.min(wall.length - widthCm, centered)) : centered;
  return { wallId: wall.id, startCm, widthCm };
}

export function resolveCabinetPlacement(
  project: Pick<ProjectState, 'walls' | 'cornerOwners' | 'settings'>,
  requested: SweepSegment[],
  kind: BoxKind,
  suggestedOwners?: Record<string, string>,
  flipOverrides?: Record<string, 1 | -1>
) {
  const walls = flipOverrides
    ? project.walls.map(w => flipOverrides[w.id] ? { ...w, flipSide: flipOverrides[w.id] } : w)
    : project.walls;
  const owners = { ...project.cornerOwners };
  const settings = project.settings || DEFAULT_PROJECT_SETTINGS;
  const segments = requested.map(segment => ({ ...segment }));
  if (suggestedOwners) {
    for (const [key, ownerId] of Object.entries(suggestedOwners)) {
      if (!owners[key]) {
        owners[key] = ownerId;
      }
    }
  }

  if (segments.length === 1) {
    const seg = segments[0];
    const w = walls.find((x) => x.id === seg.wallId);
    if (w) {
      const tier = kind === 'wall' ? 'wall-lower' : kind === 'wall-deep' ? 'wall-upper' : 'lower';
      const depthSetback = kind === 'wall' ? 32 : kind === 'wall-deep' ? 58 : kind === 'fridge' ? 70 : 60;
      const junctions = detectCornerJunctions(walls, owners);
      for (const j of junctions) {
        const isA = j.wallAId === w.id;
        const isB = j.wallBId === w.id;
        if (!isA && !isB) continue;
        const myEnd = isA ? j.wallAEnd : j.wallBEnd;
        const otherId = isA ? j.wallBId : j.wallAId;
        const otherEnd = isA ? j.wallBEnd : j.wallAEnd;
        const otherWall = walls.find((x) => x.id === otherId);
        if (!otherWall) continue;
        const geom = analyzeCornerJunction(w, myEnd, otherWall, otherEnd);
        if (geom.kind !== 'inside-90') continue;

        const touchesCorner =
          (myEnd === 'start' && seg.startCm <= 5 && seg.startCm + seg.widthCm >= -5) ||
          (myEnd === 'end' && seg.startCm <= w.length + 5 && seg.startCm + seg.widthCm >= w.length - 5);
        if (!touchesCorner) continue;

        const otherHasCornerBox = otherWall.boxes.some((ob) => {
          if (getBoxTier(ob) !== tier) return false;
          return otherEnd === 'start' ? ob.offsetX <= 5 : ob.offsetX + ob.width >= otherWall.length - 5;
        });

        if (otherHasCornerBox) {
          owners[j.key] = otherWall.id;
          if (myEnd === 'start' && seg.startCm < depthSetback) {
            const delta = depthSetback - seg.startCm;
            seg.startCm = depthSetback;
            seg.widthCm = Math.max(0, seg.widthCm - delta);
          } else if (myEnd === 'end' && seg.startCm + seg.widthCm > w.length - depthSetback) {
            seg.widthCm = Math.max(0, w.length - depthSetback - seg.startCm);
          }
        } else if (!owners[j.key]) {
          owners[j.key] = w.id;
        }
      }
    }
  }

  const placements: SweepSegment[] = [];
  let blockedByOpening = false;

  const boxPreset = BOX_PRESETS[kind] || BOX_PRESETS.base;
  const candElevY = kind === 'wall' ? settings.wallCabElevCm : boxPreset.elevY;
  const candH =
    kind === 'base'
      ? settings.baseHeightCm
      : kind === 'wall'
      ? settings.wallCabHeightCm
      : boxPreset.height;

  segments.forEach((seg) => {
    if (seg.widthCm < 30) return;
    const w = walls.find((x) => x.id === seg.wallId);
    if (!w) return;

    const newTier = kind === 'wall' ? 'wall-lower' : kind === 'wall-deep' ? 'wall-upper' : 'lower';
    const blockedSpans: Array<{ start: number; end: number }> = [];

    for (const existing of w.boxes) {
      if (kind === 'tall') {
        if (existing.type === 'tall' || existing.type === 'fridge' || existing.type === 'closet') {
          blockedSpans.push({ start: existing.offsetX, end: existing.offsetX + existing.width });
        }
        continue;
      }
      if (getBoxTier(existing) !== newTier) continue;
      blockedSpans.push({ start: existing.offsetX, end: existing.offsetX + existing.width });
    }
    for (const op of w.openings || []) {
      const opTop = op.elevY + op.height;
      const boxTop = candElevY + candH;
      if (candElevY < opTop - 1 && boxTop > op.elevY + 1) {
        blockedSpans.push({ start: op.offsetX, end: op.offsetX + op.width });
        blockedByOpening = true;
      }
    }

    for (const placement of placements) {
      if (placement.wallId === w.id) blockedSpans.push({ start: placement.startCm, end: placement.startCm + placement.widthCm });
    }
    const start = seg.startCm;
    const end = seg.startCm + seg.widthCm;
    const validSpans = subtractBlockedIntervals(start, end, blockedSpans);
    validSpans.forEach((sp) => {
      const finalW = Math.round(sp.end - sp.start);
      if (finalW < 30) return;
      placements.push({ wallId: w.id, startCm: sp.start, widthCm: finalW });
    });
  });
  return { segments: placements, owners, blockedByOpening };
}


export interface CabinetRowDraft {
  kind: BoxKind;
  starter: SweepSegment;
  offsetCm: number;
  flipOverrides?: Record<string, 1 | -1>;
  continued?: boolean;
}

type CabinetProject = Pick<ProjectState, 'walls' | 'cornerOwners' | 'settings'>;

export function startCabinetRow(
  project: CabinetProject, wall: Wall, offsetCm: number, kind: BoxKind,
  flipOverrides?: Record<string, 1 | -1>
): CabinetRowDraft | null {
  const { segments } = resolveCabinetPlacement(project, [cabinetStarterSegment(wall, offsetCm)], kind, undefined, flipOverrides);
  const starter = segments.find(segment => offsetCm >= segment.startCm && offsetCm <= segment.startCm + segment.widthCm)
    ?? segments[0];
  return starter ? { kind, starter, offsetCm, flipOverrides } : null;
}

export function continueCabinetRow(
  draft: CabinetRowDraft, wallId: string, targetCm: number, pieces: SweepSegment[],
): CabinetRowDraft | null {
  let nearest: { edge: number; distance: number } | undefined;
  for (const piece of pieces) {
    if (piece.wallId !== wallId) continue;
    const choices = draft.starter.wallId === wallId
      ? [targetCm >= draft.offsetCm ? piece.startCm + piece.widthCm : piece.startCm]
      : [piece.startCm, piece.startCm + piece.widthCm];
    for (const edge of choices) {
      const distance = Math.abs(targetCm - edge);
      if (!nearest || distance < nearest.distance) nearest = { edge, distance };
    }
  }
  if (!nearest) return null;
  return {
    kind: draft.kind, offsetCm: nearest.edge, continued: true,
    starter: { wallId, startCm: nearest.edge, widthCm: 0 },
  };
}

export function previewCabinetRow(project: CabinetProject, draft: CabinetRowDraft, targetWallId: string, targetCm: number) {
  const { kind, starter, offsetCm, flipOverrides } = draft;
  const walls = flipOverrides
    ? project.walls.map(wall => flipOverrides[wall.id] ? { ...wall, flipSide: flipOverrides[wall.id] } : wall)
    : project.walls;
  const { segments: requested, suggestedOwners } = computeMultiWallSweep(
    walls, starter.wallId, offsetCm, targetWallId, targetCm, kind, project.cornerOwners, true, starter
  );
  const resolved = resolveCabinetPlacement(project, requested, kind, suggestedOwners, flipOverrides);
  if (draft.continued) {
    const sameWall = targetWallId === starter.wallId;
    const direction = Math.sign(targetCm - offsetCm);
    const segments = sameWall
      ? resolved.segments.filter(segment => direction > 0
        ? Math.abs(segment.startCm - offsetCm) <= 1.1
        : direction < 0 && Math.abs(segment.startCm + segment.widthCm - offsetCm) <= 1.1)
      : resolved.segments;
    const valid = (!sameWall || Math.abs(targetCm - offsetCm) >= 15) &&
      segments.some(segment => segment.wallId === targetWallId);
    return { requested: valid ? segments : [], suggestedOwners, segments: valid ? segments : [], valid };
  }
  const keepsStarter = resolved.segments.some(segment =>
    segment.wallId === starter.wallId &&
    segment.startCm <= starter.startCm + 0.5 &&
    segment.startCm + segment.widthCm >= starter.startCm + starter.widthCm - 0.5
  );
  const valid = keepsStarter && resolved.segments.some(segment => segment.wallId === targetWallId);
  return { requested, suggestedOwners, segments: valid ? resolved.segments : [starter], valid };
}
