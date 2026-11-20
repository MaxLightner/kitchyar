import type { CabinetBox, DoorUnit, ProjectState, Wall } from './types';

export interface KitchenRepairResult {
  project: ProjectState;
  changed: boolean;
  fixedCount: number;
  summary: string[];
}

const MIN_DOOR_CM = 25;
const MAX_DOOR_CM = 60;
const FREESTANDING_KINDS = new Set(['fridge', 'washing', 'dishwasher']);

function isFloorTierBox(box: CabinetBox): boolean {
  return box.type === 'base' || box.type === 'tall' || box.type === 'closet';
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function cloneProject(project: ProjectState): ProjectState {
  if (typeof structuredClone === 'function') return structuredClone(project);
  return JSON.parse(JSON.stringify(project)) as ProjectState;
}

function makeLocalUid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Redistributes a width delta smoothly across a box's ordinary doors (and syncs dividers/shelves/handles)
 * without redesigning the cabinet layout from scratch.
 */
function syncBoxInternalsAfterResize(box: CabinetBox, oldWidth: number, newWidth: number): void {
  const delta = round1(newWidth - oldWidth);
  if (Math.abs(delta) < 0.1) return;

  const sortedDoors = [...box.doors].sort((a, b) => a.startCm - b.startCm);
  if (sortedDoors.length > 0) {
    // Distribute delta proportionally across doors so widths stay balanced
    const totalW = sortedDoors.reduce((s, d) => s + d.widthCm, 0) || oldWidth;
    let cursor = 0;
    for (let i = 0; i < sortedDoors.length; i++) {
      const door = sortedDoors[i];
      const isLast = i === sortedDoors.length - 1;
      const share = isLast ? round1(newWidth - cursor) : round1((door.widthCm / totalW) * newWidth);
      door.startCm = round1(cursor);
      door.widthCm = Math.max(MIN_DOOR_CM, share);
      cursor = round1(door.startCm + door.widthCm);
    }
    // Clamp last door to exact box width
    const last = sortedDoors[sortedDoors.length - 1];
    if (last && last.startCm + last.widthCm > newWidth) {
      last.widthCm = Math.max(19, round1(newWidth - last.startCm));
    }
    // If any ordinary door exceeded MAX_DOOR_CM after expansion, split it cleanly into two equal doors
    const nextDoors: DoorUnit[] = [];
    for (const d of sortedDoors) {
      if (d.kind === 'door' && d.widthCm > MAX_DOOR_CM + 2 && d.widthCm >= MIN_DOOR_CM * 2) {
        const half = round1(d.widthCm / 2);
        nextDoors.push({ ...d, widthCm: half });
        nextDoors.push({
          ...d,
          id: makeLocalUid('door'),
          startCm: round1(d.startCm + half),
          widthCm: round1(d.widthCm - half),
          hingeSide: d.hingeSide === 'left' ? 'right' : 'left',
        });
      } else {
        nextDoors.push(d);
      }
    }
    box.doors = nextDoors;
  }

  // Scale unit dividers proportionally and deduplicate
  const scale = oldWidth > 0 ? newWidth / oldWidth : 1;
  const scaledDivs: number[] = [];
  for (const u of box.unitDividers) {
    const nextU = round1(u * scale);
    if (nextU > 2 && nextU < newWidth - 2 && !scaledDivs.some((x) => Math.abs(x - nextU) < 1.5)) {
      scaledDivs.push(nextU);
    }
  }
  box.unitDividers = scaledDivs.sort((a, b) => a - b);

  // Scale shelves proportionally and clamp to box bounds
  box.shelves = box.shelves
    .map((sh) => ({
      ...sh,
      startCm: Math.max(0, round1(sh.startCm * scale)),
      endCm: Math.min(newWidth, round1(sh.endCm * scale)),
    }))
    .filter((sh) => sh.endCm - sh.startCm >= 12);
}

/**
 * Non-destructive localized repair engine:
 * Fixes overlaps (appliances & boxes), absorbs awkward gaps (3..42 cm) by widening neighboring
 * units/doors or tall cabinets with slight appliance shifts when needed, fixes overlapping doors,
 * removes orphan handles, and adds missing load-bearing shelves for built-in ovens/microwaves and tall cabinets.
 */
export function repairKitchenIssues(inputProject: ProjectState): KitchenRepairResult {
  const project = cloneProject(inputProject);
  const summary: string[] = [];
  let fixedCount = 0;

  for (const wall of project.walls) {
    // 1. Clamp boxes strictly inside wall bounds
    for (const box of wall.boxes) {
      const origOffset = box.offsetX;
      const origWidth = box.width;
      if (box.offsetX < 0) {
        box.width = Math.max(30, round1(box.width + box.offsetX));
        box.offsetX = 0;
      }
      if (box.offsetX + box.width > wall.length) {
        box.width = Math.max(30, round1(wall.length - box.offsetX));
        if (box.offsetX + box.width > wall.length) {
          box.offsetX = Math.max(0, round1(wall.length - box.width));
        }
      }
      if (box.offsetX !== origOffset || box.width !== origWidth) {
        syncBoxInternalsAfterResize(box, origWidth, box.width);
        fixedCount++;
        summary.push(`${box.name}: موقعیت و عرض داخل محدوده دیوار تنظیم شد.`);
      }
    }

    // 2. Resolve freestanding appliance overlaps with adjacent boxes (e.g. washing machine entering next unit)
    for (const app of wall.appliances) {
      if (!FREESTANDING_KINDS.has(app.kind)) continue;
      if (app.offsetX < 0) {
        app.offsetX = 0;
        fixedCount++;
      }
      if (app.offsetX + app.width > wall.length) {
        app.offsetX = Math.max(0, round1(wall.length - app.width));
        fixedCount++;
      }
      for (const box of wall.boxes) {
        if (!isFloorTierBox(box) || app.boxId === box.id) continue;
        const overlap = Math.min(app.offsetX + app.width, box.offsetX + box.width) - Math.max(app.offsetX, box.offsetX);
        if (overlap <= 2) continue;

        const oldW = box.width;
        if (box.offsetX < app.offsetX && box.width - overlap >= 30) {
          // Box is to the left of appliance -> trim box right edge
          box.width = round1(app.offsetX - box.offsetX);
          syncBoxInternalsAfterResize(box, oldW, box.width);
          fixedCount++;
          summary.push(`تداخل ${app.kind} با ${box.name} (${Math.round(overlap)} سم) با اصلاح عرض یونیت رفع شد.`);
        } else if (box.offsetX >= app.offsetX && box.width - overlap >= 30) {
          // Box is to the right of appliance -> shift box right and shrink
          const newStart = round1(app.offsetX + app.width);
          const shift = round1(newStart - box.offsetX);
          box.offsetX = newStart;
          box.width = round1(box.width - shift);
          syncBoxInternalsAfterResize(box, oldW, box.width);
          fixedCount++;
          summary.push(`تداخل ${app.kind} با ${box.name} (${Math.round(overlap)} سم) با جابه‌جایی لبه یونیت رفع شد.`);
        }
      }
    }

    // 3. Absorb awkward gaps (3..42 cm) without redesigning the kitchen
    const tierGroups: Array<(b: CabinetBox) => boolean> = [
      isFloorTierBox,
      (b) => b.type === 'wall',
      (b) => b.type === 'wall-deep',
    ];
    for (const filterFn of tierGroups) {
      const row = wall.boxes.filter(filterFn).sort((a, b) => a.offsetX - b.offsetX);
      for (let i = 1; i < row.length; i++) {
        const left = row[i - 1];
        const right = row[i];
        const gap = round1(right.offsetX - (left.offsetX + left.width));
        if (gap < 3 || gap > 42) continue;

        const gapBegin = left.offsetX + left.width;
        const occupiedByApp = wall.appliances.some(
          (a) => FREESTANDING_KINDS.has(a.kind) && a.offsetX < right.offsetX - 1 && a.offsetX + a.width > gapBegin + 1,
        );
        if (occupiedByApp) continue;

        const lowY = Math.min(left.elevY, right.elevY);
        const highY = Math.max(left.elevY + left.height, right.elevY + right.height);
        const crossesOpening = (wall.openings ?? []).some(
          (op) =>
            op.offsetX < right.offsetX &&
            op.offsetX + op.width > gapBegin &&
            op.elevY < highY &&
            op.elevY + op.height > lowY,
        );
        if (crossesOpening) continue;

        // Prefer expanding a neighboring tall/closet box up to +20cm if present, or split between left & right
        const leftCanTake = left.type === 'tall' || left.type === 'closet' ? Math.min(gap, 20) : round1(gap / 2);
        const rightTake = round1(gap - leftCanTake);

        if (leftCanTake > 0.5) {
          const oldW = left.width;
          left.width = round1(left.width + leftCanTake);
          syncBoxInternalsAfterResize(left, oldW, left.width);
          // Slightly center any gas/sink inside left box if gap was substantial
          for (const a of wall.appliances) {
            if ((a.kind === 'gas' || a.kind === 'sink') && a.boxId === left.id) {
              const maxAllowed = left.offsetX + left.width - a.width - 2;
              const target = Math.min(maxAllowed, round1(a.offsetX + leftCanTake * 0.5));
              if (target > a.offsetX) a.offsetX = target;
            }
          }
        }
        if (rightTake > 0.5) {
          const oldW = right.width;
          right.offsetX = round1(right.offsetX - rightTake);
          right.width = round1(right.width + rightTake);
          syncBoxInternalsAfterResize(right, oldW, right.width);
          for (const a of wall.appliances) {
            if ((a.kind === 'gas' || a.kind === 'sink') && a.boxId === right.id) {
              const minAllowed = right.offsetX + 2;
              const target = Math.max(minAllowed, round1(a.offsetX - rightTake * 0.5));
              if (target < a.offsetX) a.offsetX = target;
            }
          }
        }
        fixedCount++;
        summary.push(`فاصله خالی ${Math.round(gap)} سانتی‌متری بین ${left.name} و ${right.name} جذب و در عرض درب‌ها توزیع شد.`);
      }
    }

    // 4. Fix overlapping doors, orphan handles, duplicate dividers, and add missing tall/oven shelves
    for (const box of wall.boxes) {
      // 4a. Separate overlapping doors inside the same box
      const sortedDoors = [...box.doors].sort((a, b) => a.startCm - b.startCm);
      let doorsAdjusted = false;
      for (let i = 1; i < sortedDoors.length; i++) {
        const prev = sortedDoors[i - 1];
        const curr = sortedDoors[i];
        if (prev.startCm + prev.widthCm > curr.startCm + 0.5) {
          // If twin doors share identical startCm (e.g. gas resize bug), split their combined span evenly
          if (Math.abs(prev.startCm - curr.startCm) < 1) {
            const half = round1(Math.min(prev.widthCm, box.width - prev.startCm) / 2);
            prev.widthCm = Math.max(19, half);
            curr.startCm = round1(prev.startCm + prev.widthCm);
            curr.widthCm = Math.max(19, half);
          } else {
            curr.startCm = round1(prev.startCm + prev.widthCm);
            if (curr.startCm + curr.widthCm > box.width) {
              curr.widthCm = Math.max(19, round1(box.width - curr.startCm));
            }
          }
          doorsAdjusted = true;
        }
      }
      if (doorsAdjusted) {
        box.doors = sortedDoors;
        fixedCount++;
        summary.push(`${box.name}: هم‌پوشانی درب‌ها اصلاح شد.`);
      }

      // 4b. Clean up orphan or out-of-range handles
      const validDoorIds = new Set(box.doors.map((d) => d.id));
      const beforeHandles = box.handles.length;
      box.handles = box.handles
        .filter((h) => validDoorIds.has(h.doorId))
        .map((h) => ({
          ...h,
          xRatio: Number.isFinite(h.xRatio) ? Math.min(1, Math.max(0, h.xRatio)) : 0.5,
          yRatio: Number.isFinite(h.yRatio) ? Math.min(1, Math.max(0, h.yRatio)) : 0.5,
        }));
      if (box.handles.length !== beforeHandles) {
        fixedCount++;
        summary.push(`${box.name}: دستگیره‌های بدون درب حذف شدند.`);
      }

      // 4c. Deduplicate & clamp unitDividers
      const cleanDivs: number[] = [];
      for (const u of [...box.unitDividers].sort((a, b) => a - b)) {
        if (u > 2 && u < box.width - 2 && !cleanDivs.some((x) => Math.abs(x - u) < 1.5)) {
          cleanDivs.push(round1(u));
        }
      }
      if (cleanDivs.length !== box.unitDividers.length) {
        box.unitDividers = cleanDivs;
        fixedCount++;
      }

      // 4d. Ensure tall/closet cabinets with built-in oven/microwave have support shelves in box.shelves
      const bodyH = Math.max(20, box.height - (box.plinth ?? 0) - (box.countertopCm ?? 0));
      const bodyBottom = box.elevY + (box.plinth ?? 0);
      const boxBuiltIns = wall.appliances.filter(
        (a) =>
          (a.kind === 'builtin-oven' || a.kind === 'microwave') &&
          (a.boxId === box.id ||
            (a.offsetX >= box.offsetX - 2 && a.offsetX + a.width <= box.offsetX + box.width + 2)),
      );
      for (const app of boxBuiltIns) {
        const localStart = Math.max(0, round1(app.offsetX - box.offsetX));
        const localEnd = Math.min(box.width, round1(localStart + app.width));
        const machH = app.kind === 'microwave' ? 38 : 60;
        const baseY = app.elevY ?? (app.kind === 'microwave' ? 146 : 82);
        const targetRatios = [
          Math.min(0.95, Math.max(0.05, (baseY - bodyBottom) / bodyH)),
          Math.min(0.95, Math.max(0.05, (baseY + machH - bodyBottom) / bodyH)),
        ];
        for (const yr of targetRatios) {
          const exists = box.shelves.some(
            (s) =>
              s.orient !== 'vertical' &&
              Math.abs(s.yRatio - yr) < 0.04 &&
              s.startCm <= localStart + 3 &&
              s.endCm >= localEnd - 3,
          );
          if (!exists && localEnd - localStart >= 20) {
            box.shelves.push({
              id: makeLocalUid('shelf'),
              startCm: localStart,
              endCm: localEnd,
              yRatio: round1(yr * 100) / 100,
              orient: 'horizontal',
            });
            fixedCount++;
            summary.push(`${box.name}: صفحه باربر زیر/بالای ${app.kind} اضافه شد.`);
          }
        }
      }

      // 4e. Populate sensible shelves inside empty tall/closet cabinets without built-ins
      if ((box.type === 'tall' || box.type === 'closet') && boxBuiltIns.length === 0 && box.shelves.length === 0) {
        const ratios = [0.22, 0.42, 0.62, 0.80];
        for (const yr of ratios) {
          box.shelves.push({
            id: makeLocalUid('shelf'),
            startCm: 0,
            endCm: box.width,
            yRatio: yr,
            orient: 'horizontal',
          });
        }
        fixedCount++;
        summary.push(`${box.name}: طبقه‌بندی داخلی استاندارد (۴ طبقه) برای کابینت قدی اضافه شد.`);
      }
    }
  }

  return {
    project,
    changed: fixedCount > 0,
    fixedCount,
    summary,
  };
}
