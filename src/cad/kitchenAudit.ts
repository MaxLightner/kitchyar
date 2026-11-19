import type { ProjectState, CabinetBox } from './types';

/** A non-destructive structural audit: every finding refers to a real project object. */
export interface KitchenAuditIssue {
  severity: 'error' | 'warning';
  kind: 'dimensions' | 'overlap' | 'gap' | 'doors' | 'handles' | 'frames';
  wallId: string;
  boxId?: string;
  message: string;
}

export function auditKitchen(project: ProjectState): KitchenAuditIssue[] {
  const issues: KitchenAuditIssue[] = [];
  const add = (severity: KitchenAuditIssue['severity'], kind: KitchenAuditIssue['kind'],
    wallId: string, message: string, boxId?: string) => issues.push({severity, kind, wallId, boxId, message});

  for (const wall of project.walls) {
    for (const box of wall.boxes) {
      if (box.width <= 0 || box.height <= 0 || box.depth < 15 || box.depth > 120 ||
          box.offsetX < -0.5 || box.offsetX + box.width > wall.length + 1) {
        add('error','dimensions',wall.id,
          `${box.name}: ابعاد یا محل باکس از محدوده مجاز دیوار خارج است`,box.id);
      }
      const doorIDs = new Set(box.doors.map(d => d.id));
      const sorted = [...box.doors].sort((a,b)=>a.startCm-b.startCm);
      for (const door of sorted) {
        if (door.startCm < -0.5 || door.startCm + door.widthCm > box.width + 1 ||
            door.widthCm < 19 || (door.kind === 'door' && door.widthCm > 65)) {
          add('error','doors',wall.id,`${box.name}: عرض یا موقعیت درب خارج از محدوده منطقی است`,box.id);
        }
        if ((box.type === 'tall' || box.type === 'closet') && door.kind === 'door' &&
            box.height > 185 && !door.tallDoorSplit && !door.drawerBand) {
          add('warning','doors',wall.id,`${box.name}: درب یکپارچه از قد ۱۸۵ سانتی‌متر بلندتر است`,box.id);
        }
      }
      if (sorted.length > 1) {
        const ordinary=sorted.filter(d=>d.kind==='door' && !d.tallDoorSplit);
        const widths=ordinary.map(d=>d.widthCm);
        if (widths.length>1 && Math.max(...widths)-Math.min(...widths)>10 &&
            Math.max(...widths)/Math.min(...widths)>1.25) {
          add('warning','doors',wall.id,`${box.name}: عرض درب‌های هم‌ردیف نامتوازن است`,box.id);
        }
      }
      for (const handle of box.handles) {
        if (!doorIDs.has(handle.doorId) || !Number.isFinite(handle.xRatio) ||
            !Number.isFinite(handle.yRatio) || handle.xRatio < 0 || handle.xRatio > 1 ||
            handle.yRatio < 0 || handle.yRatio > 1) {
          add('error','handles',wall.id,`${box.name}: دستگیره بدون درب یا خارج از سطح درب`,box.id);
        }
      }
      const frames = box.frames ?? [];
      for (const side of ['left','right','top','bottom'] as const) {
        if (frames.filter(f=>f.side===side).length>1) {
          add('warning','frames',wall.id,`${box.name}: فریم تکراری در ضلع ${side}`,box.id);
        }
      }
    }
    const boxes=wall.boxes;
    for (let i=0;i<boxes.length;i++) for (let j=i+1;j<boxes.length;j++) {
      const a=boxes[i],b=boxes[j];
      if (a.linkedToBoxId===b.id || b.linkedToBoxId===a.id) continue;
      const horiz=Math.min(a.offsetX+a.width,b.offsetX+b.width)-Math.max(a.offsetX,b.offsetX);
      const vert=Math.min(a.elevY+a.height,b.elevY+b.height)-Math.max(a.elevY,b.elevY);
      if (horiz>2 && vert>2) {
        add('error','overlap',wall.id,`${a.name} و ${b.name}: هم‌پوشانی غیرمنتظره (حدود ${Math.round(horiz)} × ${Math.round(vert)} سانتی‌متر)`,a.id);
      }
    }
    const tiers: Array<CabinetBox['type']> = ['base','wall','wall-deep'];
    for (const tier of tiers) {
      const row=boxes.filter(box=>box.type===tier).sort((a,b)=>a.offsetX-b.offsetX);
      for (let i=1;i<row.length;i++) {
        const left=row[i-1],right=row[i];
        const gap=right.offsetX-left.offsetX-left.width;
        if (gap<3 || gap>29 || Math.abs(left.elevY-right.elevY)>2) continue;
        const gapBegin=left.offsetX+left.width;
        const crossesOpening=(wall.openings??[]).some(op=>op.offsetX<right.offsetX &&
          op.offsetX+op.width>gapBegin && op.elevY<left.elevY+left.height &&
          op.elevY+op.height>left.elevY);
        if (!crossesOpening) add('warning','gap',wall.id,
          `فاصله خالی ${Math.round(gap)} سانتی‌متری بین ${left.name} و ${right.name}`,left.id);
      }
    }
  }
  return issues.sort((a,b)=>Number(a.severity==='warning')-Number(b.severity==='warning'));
}
