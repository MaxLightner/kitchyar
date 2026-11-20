import type {
  CabinetBox,
  DoorUnit,
  ProjectState,
  Wall,
} from './types';

export type CutPartCategory =
  | 'UNIT_SIDE'
  | 'UNIT_TOP'
  | 'UNIT_BOTTOM'
  | 'UNIT_DIVIDER'
  | 'UNIT_BACK'
  | 'DOOR'
  | 'DRAWER_FRONT'
  | 'SHELF'
  | 'OVEN_SHELF'
  | 'FILLER'
  | 'PLINTH';

export interface CutMasterPart {
  /** Globally unique deterministic part ID for CutMaster & BOM tracking */
  id: string;
  category: CutPartCategory;
  wallId: string;
  boxId: string;
  sourceItemId?: string;
  /** Material + color + texture key so CutMaster groups sheets accurately */
  materialSig: string;
  widthMm: number;
  heightMm: number;
  thicknessMm: number;
  grain: 'vertical' | 'horizontal' | 'none';
  label: string;
}

function sanitizeToken(raw?: string | null): string {
  if (!raw) return 'default';
  return raw
    .trim()
    .toLowerCase()
    .replace(/^#/, 'hex-')
    .replace(/[^a-z0-9_-]+/g, '-');
}

/**
 * Builds a deterministic material signature including finish, texture, and custom hex color.
 * Changing finish, texture, or color automatically produces a distinct signature for CutMaster.
 */
export function buildMaterialSignature(
  project: ProjectState,
  box: CabinetBox,
  door?: DoorUnit,
  isBackPanel = false,
): string {
  if (isBackPanel) {
    return 'back-hdf-3mm_white';
  }
  const finish = sanitizeToken(door?.finish ?? box.finish ?? project.cabinetFinish ?? 'warm-white');
  const texture = sanitizeToken(box.texture ?? project.cabinetTexture ?? 'smooth');
  const color = box.color ? `_${sanitizeToken(box.color)}` : '';
  return `${finish}_${texture}${color}`;
}

/**
 * Generates a distinct, structured part ID separating doors, unit carcasses, back panels,
 * shelves, dividers, and fillers, while encoding the active material/color/texture signature.
 */
export function makeCutPartId(params: {
  category: CutPartCategory;
  wallId: string;
  boxId: string;
  subId: string | number;
  materialSig: string;
}): string {
  const w = sanitizeToken(params.wallId);
  const b = sanitizeToken(params.boxId);
  const s = sanitizeToken(String(params.subId));
  return `${params.category}__${w}__${b}__${s}__${params.materialSig}`;
}

/**
 * Extracts a complete, CutMaster-ready list of physical panels from the project.
 * Doors, carcass sides/tops/bottoms, back panels (skipping sink plumbing cutout),
 * dividers, interior shelves, and full-depth oven/microwave support shelves each get unique IDs.
 */
export function collectCutMasterParts(project: ProjectState): CutMasterPart[] {
  const parts: CutMasterPart[] = [];
  const boardMm = 16;

  for (const wall of project.walls) {
    for (const box of wall.boxes) {
      const boxMat = buildMaterialSignature(project, box);
      const backMat = buildMaterialSignature(project, box, undefined, true);
      const bodyHeightCm = Math.max(14, box.height - (box.plinth ?? 0) - (box.countertopCm ?? 0));
      const bodyH = Math.round(bodyHeightCm * 10);
      const bodyW = Math.round(box.width * 10);
      const bodyD = Math.round(box.depth * 10);

      // 1. Carcass Left & Right Side Panels
      for (const side of ['L', 'R'] as const) {
        parts.push({
          id: makeCutPartId({ category: 'UNIT_SIDE', wallId: wall.id, boxId: box.id, subId: side, materialSig: boxMat }),
          category: 'UNIT_SIDE',
          wallId: wall.id,
          boxId: box.id,
          materialSig: boxMat,
          widthMm: bodyD,
          heightMm: bodyH,
          thicknessMm: boardMm,
          grain: 'vertical',
          label: `${box.name} - Side ${side}`,
        });
      }

      // 2. Carcass Bottom & Top Panels
      const innerW = Math.max(60, bodyW - boardMm * 2);
      parts.push({
        id: makeCutPartId({ category: 'UNIT_BOTTOM', wallId: wall.id, boxId: box.id, subId: 'bot', materialSig: boxMat }),
        category: 'UNIT_BOTTOM',
        wallId: wall.id,
        boxId: box.id,
        materialSig: boxMat,
        widthMm: innerW,
        heightMm: bodyD,
        thicknessMm: boardMm,
        grain: 'horizontal',
        label: `${box.name} - Bottom`,
      });
      parts.push({
        id: makeCutPartId({ category: 'UNIT_TOP', wallId: wall.id, boxId: box.id, subId: 'top', materialSig: boxMat }),
        category: 'UNIT_TOP',
        wallId: wall.id,
        boxId: box.id,
        materialSig: boxMat,
        widthMm: innerW,
        heightMm: bodyD,
        thicknessMm: boardMm,
        grain: 'horizontal',
        label: `${box.name} - Top`,
      });

      // 3. Back Panel (distinct ID; omit full back for sink units to leave plumbing clearance)
      const hasSink = wall.appliances.some(
        (a) =>
          a.kind === 'sink' &&
          (a.boxId === box.id ||
            (a.offsetX >= box.offsetX - 2 && a.offsetX + a.width <= box.offsetX + box.width + 2)),
      );
      if (!hasSink) {
        parts.push({
          id: makeCutPartId({ category: 'UNIT_BACK', wallId: wall.id, boxId: box.id, subId: 'back', materialSig: backMat }),
          category: 'UNIT_BACK',
          wallId: wall.id,
          boxId: box.id,
          materialSig: backMat,
          widthMm: Math.max(60, bodyW - 4),
          heightMm: Math.max(60, bodyH - 4),
          thicknessMm: 3,
          grain: 'none',
          label: `${box.name} - Back Panel`,
        });
      }

      // 4. Unit Dividers
      box.unitDividers.forEach((seamCm, idx) => {
        parts.push({
          id: makeCutPartId({
            category: 'UNIT_DIVIDER',
            wallId: wall.id,
            boxId: box.id,
            subId: `${idx}_${Math.round(seamCm)}`,
            materialSig: boxMat,
          }),
          category: 'UNIT_DIVIDER',
          wallId: wall.id,
          boxId: box.id,
          materialSig: boxMat,
          widthMm: Math.max(80, bodyD - 20),
          heightMm: Math.max(60, bodyH - boardMm * 2),
          thicknessMm: boardMm,
          grain: 'vertical',
          label: `${box.name} - Divider #${idx + 1}`,
        });
      });

      // 5. Interior Shelves
      box.shelves.forEach((sh) => {
        const spanMm = Math.max(60, Math.round((sh.endCm - sh.startCm) * 10) - boardMm);
        const isVert = sh.orient === 'vertical';
        parts.push({
          id: makeCutPartId({ category: 'SHELF', wallId: wall.id, boxId: box.id, subId: sh.id, materialSig: boxMat }),
          category: 'SHELF',
          wallId: wall.id,
          boxId: box.id,
          sourceItemId: sh.id,
          materialSig: boxMat,
          widthMm: isVert ? Math.max(80, bodyD - 20) : spanMm,
          heightMm: isVert ? Math.max(60, bodyH - boardMm * 2) : Math.max(80, bodyD - 20),
          thicknessMm: boardMm,
          grain: isVert ? 'vertical' : 'horizontal',
          label: `${box.name} - Shelf ${sh.id}`,
        });
      });

      // 6. Full-Depth Load-Bearing Shelves below & above Built-in Oven / Microwave
      const boxBuiltIns = wall.appliances.filter(
        (a) =>
          (a.kind === 'builtin-oven' || a.kind === 'microwave') &&
          (a.boxId === box.id ||
            (a.offsetX >= box.offsetX - 2 && a.offsetX + a.width <= box.offsetX + box.width + 2)),
      );
      for (const app of boxBuiltIns) {
        const shelfW = Math.max(100, Math.round(app.width * 10) - boardMm);
        const shelfD = Math.max(200, bodyD - 20);
        for (const pos of ['bottom', 'top'] as const) {
          parts.push({
            id: makeCutPartId({
              category: 'OVEN_SHELF',
              wallId: wall.id,
              boxId: box.id,
              subId: `${app.id}_${pos}`,
              materialSig: boxMat,
            }),
            category: 'OVEN_SHELF',
            wallId: wall.id,
            boxId: box.id,
            sourceItemId: app.id,
            materialSig: boxMat,
            widthMm: shelfW,
            heightMm: shelfD,
            thicknessMm: 18,
            grain: 'horizontal',
            label: `${box.name} - ${app.kind} ${pos} support shelf`,
          });
        }
      }

      // 7. Doors & Drawer Fronts (each carries its own door finish + box texture/color signature)
      for (const door of box.doors) {
        const doorMat = buildMaterialSignature(project, box, door);
        const doorW = Math.max(60, Math.round(door.widthCm * 10) - 4);
        if (door.kind === 'drawer' && door.drawerRatios.length > 0) {
          const ratios = door.drawerRatios;
          const total = ratios.reduce((s, r) => s + r, 0) || 1;
          ratios.forEach((ratio, rIdx) => {
            const hMm = Math.max(60, Math.round((bodyH * ratio) / total) - 4);
            parts.push({
              id: makeCutPartId({
                category: 'DRAWER_FRONT',
                wallId: wall.id,
                boxId: box.id,
                subId: `${door.id}_r${rIdx}`,
                materialSig: doorMat,
              }),
              category: 'DRAWER_FRONT',
              wallId: wall.id,
              boxId: box.id,
              sourceItemId: door.id,
              materialSig: doorMat,
              widthMm: doorW,
              heightMm: hMm,
              thicknessMm: 18,
              grain: 'horizontal',
              label: `${box.name} - Drawer ${door.id}#${rIdx + 1}`,
            });
          });
        } else {
          parts.push({
            id: makeCutPartId({
              category: 'DOOR',
              wallId: wall.id,
              boxId: box.id,
              subId: door.id,
              materialSig: doorMat,
            }),
            category: 'DOOR',
            wallId: wall.id,
            boxId: box.id,
            sourceItemId: door.id,
            materialSig: doorMat,
            widthMm: doorW,
            heightMm: Math.max(100, bodyH - 4),
            thicknessMm: 18,
            grain: 'vertical',
            label: `${box.name} - Door ${door.id}`,
          });
        }
      }
    }
  }

  return parts;
}
