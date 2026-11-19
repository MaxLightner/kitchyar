import { CABINET_FINISHES, DEFAULT_PROJECT_SETTINGS } from './constants';
import { applyHandlesToBoxDoors, clearHoodUnitForGas, createEmptyBox, syncHoodUnitAboveGas, uid } from './doorRules';
import {
  BacksplashFinishId,
  CabinetFinishId,
  CountertopFinishId,
  DesignStyle,
  DoorStyle,
  HandleStyle,
  ProjectState,
  Wall,
} from './types';

export interface KitchenStylePreset {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  designStyle: DesignStyle;
  cabinetFinish: CabinetFinishId;
  upperCabinetFinish?: CabinetFinishId;
  wallDeepCabinetFinish?: CabinetFinishId;
  backsplashFinish: BacksplashFinishId;
  countertopFinish: CountertopFinishId;
  doorStyle: DoorStyle;
  handleStyle: HandleStyle;
  defaultHoodKind: 'chimney' | 'hidden';
  roughness?: { cabinet: number; countertop: number; backsplash: number };
  reflection?: { cabinet: number; countertop: number; backsplash: number };
  twoTierWallCabinets?: boolean;
}

export const KITCHEN_STYLE_PRESETS: KitchenStylePreset[] = [
  {
    id: 'reference-cream',
    title: 'کرم مینیمال دو‌رنگ',
    subtitle: 'کابینت سفید گرم و بلوط طبیعی، صفحه چوب، مرمر سفید و هود مخفی',
    image: './assets/styles/reference-cream.webp',
    designStyle: 'modern',
    cabinetFinish: 'warm-white',
    upperCabinetFinish: 'natural-oak',
    wallDeepCabinetFinish: 'warm-white',
    twoTierWallCabinets: true,
    backsplashFinish: 'calacatta-marble',
    countertopFinish: 'oak-butcher',
    doorStyle: 'flat',
    handleStyle: 'f-profile',
    roughness: { cabinet: 0.36, countertop: 0.42, backsplash: 0.23 },
    defaultHoodKind: 'hidden',
  },
  {
    id: 'reference-classic',
    title: 'نئوکلاسیک گریژ',
    subtitle: 'درب ابزارخورده CNC گریژ، دستگیره خطی، مرمر کلکته و هود اکسپوز',
    image: './assets/styles/reference-classic.webp',
    designStyle: 'neoclassic',
    cabinetFinish: 'greige',
    backsplashFinish: 'calacatta-marble',
    countertopFinish: 'calacatta-top',
    doorStyle: 'cnc',
    handleStyle: 'simple',
    roughness: { cabinet: 0.47, countertop: 0.22, backsplash: 0.23 },
    defaultHoodKind: 'chimney',
  },
  {
    id: 'reference-green',
    title: 'سبز مریم‌گلی نئوکلاسیک',
    subtitle: 'نئوکلاسیک سبز ملایم بدون دستگیره، صفحه چوب بلوط و تراورتن گرم',
    image: './assets/styles/reference-green.webp',
    designStyle: 'neoclassic',
    cabinetFinish: 'sage-green',
    backsplashFinish: 'warm-travertine',
    countertopFinish: 'oak-butcher',
    doorStyle: 'cnc',
    handleStyle: 'f-profile',
    roughness: { cabinet: 0.52, countertop: 0.42, backsplash: 0.55 },
    defaultHoodKind: 'chimney',
  },
  {
    id: 'walnut-sage',
    title: 'گردویی و کاشی سبز',
    subtitle: 'چوب گردویی یکدست مدرن، بین‌کابینتی شش‌ضلعی سبز و صفحه سفید رگه‌دار',
    image: './assets/styles/walnut-sage.webp',
    designStyle: 'modern',
    cabinetFinish: 'walnut',
    backsplashFinish: 'hex-sage',
    countertopFinish: 'calacatta-top',
    doorStyle: 'flat',
    handleStyle: 'simple',
    roughness: { cabinet: 0.52, countertop: 0.24, backsplash: 0.42 },
    defaultHoodKind: 'chimney',
  },
  {
    id: 'modern-oak',
    title: 'بلوط طبیعی مدرن',
    subtitle: 'نما چوب بلوط طبیعی، دستگیره مخفی، کاشی تراورتن و صفحه مرمر سفید',
    image: './assets/styles/modern-oak.webp',
    designStyle: 'modern',
    cabinetFinish: 'natural-oak',
    backsplashFinish: 'warm-travertine',
    countertopFinish: 'calacatta-top',
    doorStyle: 'flat',
    handleStyle: 'f-profile',
    roughness: { cabinet: 0.56, countertop: 0.26, backsplash: 0.53 },
    defaultHoodKind: 'hidden',
  },
  {
    id: 'graphite',
    title: 'گرافیت آنتراسیت',
    subtitle: 'ذغالی مات یکدست، صفحه بتنی طوسی، کاشی ترازو و هود مخفی',
    image: './assets/styles/graphite.webp',
    designStyle: 'modern',
    cabinetFinish: 'charcoal',
    backsplashFinish: 'terrazzo-grey',
    countertopFinish: 'concrete-grey',
    doorStyle: 'flat',
    handleStyle: 'handleless',
    roughness: { cabinet: 0.57, countertop: 0.53, backsplash: 0.47 },
    defaultHoodKind: 'hidden',
  },
  {
    id: 'soft-cream',
    title: 'کرم قاب‌دار آرام',
    subtitle: 'درب CNC کشمیر، دستگیره خطی ظریف و مرمر سفید کلاسیک',
    image: './assets/styles/soft-cream.webp',
    designStyle: 'neoclassic',
    cabinetFinish: 'cashmere',
    backsplashFinish: 'calacatta-marble',
    countertopFinish: 'calacatta-top',
    doorStyle: 'cnc',
    handleStyle: 'simple',
    roughness: { cabinet: 0.25, countertop: 0.2, backsplash: 0.19 },
    defaultHoodKind: 'chimney',
  },
  {
    id: 'reference-grey',
    title: 'گریژ، چوب و سنگ تیره',
    subtitle: 'گریژ مات با هوایی بلوطی، کوارتز مشکی، کاشی جناغی تیره و هود مخفی',
    image: './assets/styles/reference-grey.webp',
    designStyle: 'modern',
    cabinetFinish: 'greige',
    upperCabinetFinish: 'natural-oak',
    wallDeepCabinetFinish: 'greige',
    twoTierWallCabinets: true,
    backsplashFinish: 'herringbone-charcoal',
    countertopFinish: 'dark-quartz',
    doorStyle: 'flat',
    handleStyle: 'f-profile',
    roughness: { cabinet: 0.42, countertop: 0.31, backsplash: 0.28 },
    defaultHoodKind: 'hidden',
  },
  {
    id: 'reference-white',
    title: 'سفید نئوکلاسیک روشن',
    subtitle: 'درب قاب‌دار سفید، دستگیره قارچی، کاشی تراورتن گرم و صفحه مرمر',
    image: './assets/styles/reference-white.webp',
    designStyle: 'neoclassic',
    cabinetFinish: 'warm-white',
    backsplashFinish: 'warm-travertine',
    countertopFinish: 'calacatta-top',
    doorStyle: 'cnc',
    handleStyle: 'knob',
    roughness: { cabinet: 0.48, countertop: 0.28, backsplash: 0.51 },
    defaultHoodKind: 'chimney',
  },
];

function applyTwoTierWallCabinets(wall: Wall) {
  const lowers = wall.boxes.filter(box => box.type === 'wall' && !box.linkedToBoxId);
  const uppers = wall.boxes.filter(box => box.type === 'wall-deep');
  for (const lower of lowers) {
    const overlapsWidth = (x: number, width: number) =>
      x < lower.offsetX + lower.width - 0.1 && x + width > lower.offsetX + 0.1;
    const matching = uppers.filter(box => overlapsWidth(box.offsetX, box.width) &&
      Math.abs(box.elevY - lower.elevY - lower.height) < 0.1);
    if (matching.length) {
      if (matching.some(box => box.linkedToBoxId || box.offsetX < lower.offsetX - 0.1 ||
          box.offsetX + box.width > lower.offsetX + lower.width + 0.1)) continue;
      const total = Math.min(...matching.map(box => lower.height + box.height));
      if (total < 75) continue;
      const height = Math.min(40, Math.floor(total / 3));
      const delta = lower.height - height;
      lower.height = height;
      for (const upper of matching) {
        upper.elevY -= delta;
        upper.height += delta;
      }
      continue;
    }
    const total = lower.height;
    if (total < 75 || !lower.doors.length || uppers.some(box => overlapsWidth(box.offsetX, box.width) &&
        box.elevY < lower.elevY + total && box.elevY + box.height > lower.elevY)) continue;
    const height = Math.min(40, Math.floor(total / 3));
    const upper = createEmptyBox('wall-deep', lower.offsetX, lower.width);
    upper.width = lower.width;
    upper.elevY = lower.elevY + height;
    upper.height = total - height;
    upper.unitDividers = [...lower.unitDividers];
    upper.doors = lower.doors.map(door => ({ ...door, id: uid('door'),
      kind: door.kind === 'lift' ? 'door' : door.kind,
      hardwareKind: door.kind === 'lift' ? 'hinged' : door.hardwareKind, drawerRatios: [],
    }));
    upper.handles = lower.handles.flatMap(handle => {
      const source = lower.doors.findIndex(door => door.id === handle.doorId);
      if (source < 0 || (handle.rowIndex ?? 0) > 0) return [];
      return [{ ...handle, id: uid('handle'), doorId: upper.doors[source].id, rowIndex: 0 }];
    });
    lower.height = height;
    wall.boxes.push(upper);
    uppers.push(upper);
  }
}

export function applyKitchenStylePreset(
  project: ProjectState,
  presetOrId: string | KitchenStylePreset,
  applyCabinetModel = true,
): { next: ProjectState; preset: KitchenStylePreset } | null {
  const preset =
    typeof presetOrId === 'string'
      ? KITCHEN_STYLE_PRESETS.find((p) => p.id === presetOrId)
      : presetOrId;
  if (!preset) return null;

  const next: ProjectState = JSON.parse(JSON.stringify(project));
  if (applyCabinetModel) next.designStyle = preset.designStyle;
  next.cabinetFinish = preset.cabinetFinish;
  next.cabinetTexture = preset.cabinetFinish === 'natural-oak' ? 'oak' : preset.cabinetFinish === 'walnut' ? 'walnut' : 'smooth';
  next.backsplashFinish = preset.backsplashFinish;
  next.countertopFinish = preset.countertopFinish;
  next.skipStylePrompt = true;
  next.settings = { ...DEFAULT_PROJECT_SETTINGS, ...next.settings };
  if (preset.roughness) {
    next.settings.cabinetRoughness = preset.roughness.cabinet;
    next.settings.countertopRoughness = preset.roughness.countertop;
    next.settings.backsplashRoughness = preset.roughness.backsplash;
    next.settings.cabinetReflection = preset.reflection?.cabinet ?? 1.55 - preset.roughness.cabinet * 1.2;
    next.settings.countertopReflection = preset.reflection?.countertop ?? 1.55 - preset.roughness.countertop * 1.2;
    next.settings.backsplashReflection = preset.reflection?.backsplash ?? 1.55 - preset.roughness.backsplash * 1.2;
  }
  if (applyCabinetModel) {
    next.settings.defaultHoodKind = preset.defaultHoodKind;
  }

  for (const wall of next.walls) {
    // Two-tier reshaping remains explicit; simple visual presets keep countertops and cabinet geometry.
    if (applyCabinetModel && preset.twoTierWallCabinets) applyTwoTierWallCabinets(wall);
    for (const box of wall.boxes) {
      if (box.type === 'fridge') continue;
      if (box.type === 'wall' && preset.upperCabinetFinish) {
        box.finish = preset.upperCabinetFinish;
      } else if (box.type === 'wall-deep') {
        if (preset.wallDeepCabinetFinish) {
          box.finish = preset.wallDeepCabinetFinish;
        } else if (preset.upperCabinetFinish) {
          box.finish = preset.upperCabinetFinish;
        } else {
          delete box.finish;
        }
      } else {
        delete box.finish;
      }

      delete box.color;
      delete box.texture;
      delete box.reflection;
      delete box.roughness;
      for (const door of box.doors) {
        delete door.finish;
        if (!applyCabinetModel) continue;
        if (door.kind === 'door' || door.kind === 'drawer' || door.kind === 'lift') {
          if (door.doorStyle !== 'glass' && door.doorStyle !== 'glass-grid' && door.hardwareKind !== 'pantry-pullout') {
            door.doorStyle = preset.doorStyle;
          }
        }
      }
      const profile = preset.handleStyle === 'f-profile' || preset.handleStyle === 'hidden';
      const horizontal = box.doors.filter(door => door.kind === 'drawer' || door.kind === 'lift' ||
        (profile && door.hardwareKind !== 'pantry-pullout' && box.type !== 'tall' && box.type !== 'closet'));
      const horizontalIds = new Set(horizontal.map(door => door.id));
      applyHandlesToBoxDoors(box, [...horizontalIds], preset.handleStyle, 'horizontal');
      applyHandlesToBoxDoors(box, box.doors.filter(door => !horizontalIds.has(door.id)).map(door => door.id),
        preset.handleStyle, 'vertical');

    }
    if (!applyCabinetModel) continue;
    for (const app of wall.appliances) {
      if (app.kind === 'gas') {
        clearHoodUnitForGas(wall, app.offsetX, app.offsetX + app.width, app.id);
        app.hoodKind = preset.defaultHoodKind;
        syncHoodUnitAboveGas(wall, app);
      }
    }
  }

  if (!CABINET_FINISHES[next.cabinetFinish]) {
    next.cabinetFinish = 'warm-white';
  }

  return { next, preset };
}
