import { CABINET_FINISHES } from './constants';
import { clearHoodUnitForGas, syncHoodUnitAboveGas } from './doorRules';
import {
  BacksplashFinishId,
  CabinetFinishId,
  CountertopFinishId,
  DesignStyle,
  DoorStyle,
  HandleStyle,
  ProjectState,
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
    backsplashFinish: 'calacatta-marble',
    countertopFinish: 'oak-butcher',
    doorStyle: 'flat',
    handleStyle: 'hidden',
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
    handleStyle: 'hidden',
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
    handleStyle: 'hidden',
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
    handleStyle: 'simple',
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
    backsplashFinish: 'herringbone-charcoal',
    countertopFinish: 'dark-quartz',
    doorStyle: 'flat',
    handleStyle: 'hidden',
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
    defaultHoodKind: 'chimney',
  },
];

export function applyKitchenStylePreset(
  project: ProjectState,
  presetOrId: string | KitchenStylePreset
): { next: ProjectState; preset: KitchenStylePreset } | null {
  const preset =
    typeof presetOrId === 'string'
      ? KITCHEN_STYLE_PRESETS.find((p) => p.id === presetOrId)
      : presetOrId;
  if (!preset) return null;

  const next: ProjectState = JSON.parse(JSON.stringify(project));
  next.designStyle = preset.designStyle;
  next.cabinetFinish = preset.cabinetFinish;
  next.backsplashFinish = preset.backsplashFinish;
  next.countertopFinish = preset.countertopFinish;
  next.skipStylePrompt = true;
  if (next.settings) {
    next.settings.defaultHoodKind = preset.defaultHoodKind;
  }

  for (const wall of next.walls) {
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

      for (const door of box.doors) {
        if (door.kind === 'door' || door.kind === 'drawer' || door.kind === 'lift') {
          if (door.doorStyle !== 'glass' && door.doorStyle !== 'glass-grid' && door.hardwareKind !== 'pantry-pullout') {
            door.doorStyle = preset.doorStyle;
          }
        }
      }
      for (const handle of box.handles) {
        handle.style = preset.handleStyle;
      }
    }
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
