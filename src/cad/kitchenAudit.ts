import type { ProjectState, CabinetBox, ApplianceItem } from './types';

/** A non-destructive structural audit: every finding refers to a real project object. */
export interface KitchenAuditIssue {
  severity: 'error' | 'warning';
  kind: 'dimensions' | 'overlap' | 'gap' | 'doors' | 'handles' | 'frames' | 'appliance' | 'shelves';
  wallId: string;
  boxId?: string;
  applianceId?: string;
  message: string;
}

const FREESTANDING_APPLIANCE_KINDS = new Set<ApplianceItem['kind']>(['washing', 'dishwasher']);

function isFloorTierBox(box: CabinetBox): boolean {
  return box.type === 'base' || box.type === 'tall' || box.type === 'closet';
}

export function auditKitchen(project: ProjectState): KitchenAuditIssue[] {
  const issues: KitchenAuditIssue[] = [];
  const add = (
    severity: KitchenAuditIssue['severity'],
    kind: KitchenAuditIssue['kind'],
    wallId: string,
    message: string,
    boxId?: string,
    applianceId?: string,
  ) => issues.push({ severity, kind, wallId, boxId, applianceId, message });

  for (const wall of project.walls) {
    for (const box of wall.boxes) {
      if (
        box.width <= 0 ||
        box.height <= 0 ||
        box.depth < 15 ||
        box.depth > 120 ||
        box.offsetX < -0.5 ||
        box.offsetX + box.width > wall.length + 1
      ) {
        add('error', 'dimensions', wall.id, `${box.name}: ابعاد یا موقعیت باکس خارج از محدوده دیوار است.`, box.id);
      }

      const doorIDs = new Set(box.doors.map(d => d.id));
      const sorted = [...box.doors].sort((a, b) => a.startCm - b.startCm);
      for (let i = 0; i < sorted.length; i++) {
        const door = sorted[i];
        if (
          door.startCm < -0.5 ||
          door.startCm + door.widthCm > box.width + 1 ||
          door.widthCm < 19 ||
          (door.kind === 'door' && door.widthCm > 65)
        ) {
          add('error', 'doors', wall.id, `${box.name}: عرض یا موقعیت درب (${Math.round(door.widthCm)} سم) خارج از محدوده مجاز است.`, box.id);
        }
        // Detect overlapping doors inside the same box
        if (i > 0) {
          const prev = sorted[i - 1];
          const doorOverlap = prev.startCm + prev.widthCm - door.startCm;
          if (doorOverlap > 1) {
            add('error', 'doors', wall.id, `${box.name}: دو درب به اندازه ${Math.round(doorOverlap)} سانتی‌متر روی هم افتاده‌اند.`, box.id);
          }
        }
        if (
          (box.type === 'tall' || box.type === 'closet') &&
          door.kind === 'door' &&
          box.height > 185 &&
          !door.tallDoorSplit &&
          !door.drawerBand
        ) {
          add('warning', 'doors', wall.id, `${box.name}: درب یک‌تکه قدی بالای ۱۸۵ سانتی‌متر بهتر است دوتکه یا کشودار شود.`, box.id);
        }
      }

      if (sorted.length > 1) {
        const ordinary = sorted.filter(d => d.kind === 'door' && !d.tallDoorSplit);
        const widths = ordinary.map(d => d.widthCm);
        if (
          widths.length > 1 &&
          Math.max(...widths) - Math.min(...widths) > 10 &&
          Math.max(...widths) / Math.min(...widths) > 1.25
        ) {
          add('warning', 'doors', wall.id, `${box.name}: اختلاف عرض درب‌ها زیاد است و بهتر است همسان‌سازی شوند.`, box.id);
        }
      }

      for (const handle of box.handles) {
        if (
          !doorIDs.has(handle.doorId) ||
          !Number.isFinite(handle.xRatio) ||
          !Number.isFinite(handle.yRatio) ||
          handle.xRatio < 0 ||
          handle.xRatio > 1 ||
          handle.yRatio < 0 ||
          handle.yRatio > 1
        ) {
          add('error', 'handles', wall.id, `${box.name}: دستگیره نامعتبر یا بدون درب متصل وجود دارد.`, box.id);
        }
      }

      // Check shelves & unit dividers bounds
      for (const sh of box.shelves) {
        if (sh.startCm < -0.5 || sh.endCm > box.width + 1 || sh.endCm - sh.startCm < 10) {
          add('warning', 'shelves', wall.id, `${box.name}: طبقه داخلی از محدوده باکس بیرون زده یا عرض نامعتبر دارد.`, box.id);
        }
      }
      const sortedDivs = [...box.unitDividers].sort((a, b) => a - b);
      for (let i = 0; i < sortedDivs.length; i++) {
        const u = sortedDivs[i];
        if (u <= 2 || u >= box.width - 2) {
          add('warning', 'shelves', wall.id, `${box.name}: جداکننده یونیت در موقعیت نامعتبر (${Math.round(u)} سم) قرار دارد.`, box.id);
        } else if (i > 0 && Math.abs(u - sortedDivs[i - 1]) < 1.5) {
          add('warning', 'shelves', wall.id, `${box.name}: جداکننده یونیت تکراری وجود دارد.`, box.id);
        }
      }

      const frames = box.frames ?? [];
      for (const side of ['left', 'right', 'top', 'bottom'] as const) {
        if (frames.filter(f => f.side === side).length > 1) {
          add('warning', 'frames', wall.id, `${box.name}: قاب تکراری در ضلع ${side} وجود دارد.`, box.id);
        }
      }
    }

    // Check box-to-box overlaps
    const boxes = wall.boxes;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.linkedToBoxId === b.id || b.linkedToBoxId === a.id) continue;
        const horiz = Math.min(a.offsetX + a.width, b.offsetX + b.width) - Math.max(a.offsetX, b.offsetX);
        const vert = Math.min(a.elevY + a.height, b.elevY + b.height) - Math.max(a.elevY, b.elevY);
        if (horiz > 2 && vert > 2) {
          add(
            'error',
            'overlap',
            wall.id,
            `تداخل بین ${a.name} و ${b.name} (${Math.round(horiz)} × ${Math.round(vert)} سانتی‌متر).`,
            a.id,
          );
        }
      }
    }

    // Check appliance bounds & appliance-to-unit overlaps (e.g. washing machine / dishwasher / fridge entering adjacent box)
    for (const app of wall.appliances) {
      if (app.offsetX < -0.5 || app.offsetX + app.width > wall.length + 1) {
        add('error', 'appliance', wall.id, `تجهیز (${app.kind}) از محدوده دیوار بیرون زده است.`, app.boxId, app.id);
      }
      if (FREESTANDING_APPLIANCE_KINDS.has(app.kind)) {
        for (const box of boxes) {
          if (!isFloorTierBox(box)) continue;
          if (app.boxId && app.boxId === box.id) continue;
          const horiz = Math.min(app.offsetX + app.width, box.offsetX + box.width) - Math.max(app.offsetX, box.offsetX);
          if (horiz > 2) {
            add(
              'error',
              'appliance',
              wall.id,
              `تداخل ${app.kind} با ${box.name} به اندازه ${Math.round(horiz)} سانتی‌متر.`,
              box.id,
              app.id,
            );
          }
        }
      } else {
        // Built-in appliances (gas, sink, builtin-oven, microwave) should stay within their parent box
        const parent = boxes.find(b => b.id === app.boxId);
        if (parent && (app.offsetX < parent.offsetX - 1 || app.offsetX + app.width > parent.offsetX + parent.width + 1)) {
          add(
            'error',
            'appliance',
            wall.id,
            `تجهیز ${app.kind} از مرز کابینت والد (${parent.name}) بیرون زده است.`,
            parent.id,
            app.id,
          );
        }
      }
    }

    // Check awkward gaps (3..42 cm, including 35cm dead space) across unified floor tier (base + tall + closet) and wall tiers
    const tierGroups: Array<{ label: string; filter: (b: CabinetBox) => boolean }> = [
      { label: 'ردیف پایین', filter: isFloorTierBox },
      { label: 'ردیف دیواری', filter: (b) => b.type === 'wall' },
      { label: 'ردیف دیواری عمیق', filter: (b) => b.type === 'wall-deep' },
    ];

    for (const group of tierGroups) {
      const row = boxes.filter(group.filter).sort((a, b) => a.offsetX - b.offsetX);
      for (let i = 1; i < row.length; i++) {
        const left = row[i - 1], right = row[i];
        const gap = right.offsetX - left.offsetX - left.width;
        if (gap < 3 || gap > 42) continue;
        // Skip if a freestanding appliance (washing/dishwasher/fridge) legitimately occupies this gap
        const gapBegin = left.offsetX + left.width;
        const occupiedByAppliance = wall.appliances.some(
          (a) =>
            FREESTANDING_APPLIANCE_KINDS.has(a.kind) &&
            a.offsetX < right.offsetX - 1 &&
            a.offsetX + a.width > gapBegin + 1,
        );
        if (occupiedByAppliance) continue;

        const lowY = Math.min(left.elevY, right.elevY);
        const highY = Math.max(left.elevY + left.height, right.elevY + right.height);
        const crossesOpening = (wall.openings ?? []).some(
          op =>
            op.offsetX < right.offsetX &&
            op.offsetX + op.width > gapBegin &&
            op.elevY < highY &&
            op.elevY + op.height > lowY,
        );
        if (!crossesOpening) {
          add(
            'warning',
            'gap',
            wall.id,
            `فاصله خالی ${Math.round(gap)} سانتی‌متری بین ${left.name} و ${right.name} (${group.label}).`,
            left.id,
          );
        }
      }
    }
  }

  return issues.sort((a, b) => Number(a.severity === 'warning') - Number(b.severity === 'warning'));
}
