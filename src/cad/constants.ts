import {
  ApplianceKind,
  BacksplashFinishId,
  BoxKind,
  CabinetFinishId,
  CountertopFinishId,
  DoorStyle,
  DrawerPattern,
  EquipmentFinish,
  FridgeModel,
  HardwareKind,
  HoodModel,
  OpeningKind,
  ProjectSettings,
  SinkModel,
  WashingCapacityKg,
} from './types';

export interface CabinetFinishConfig {
  id: CabinetFinishId;
  label: string;
  shortLabel: string;
  hex: string;
  hexDark: string;
  edgeHex: string;
  woodGrain?: boolean;
  roughness: number;
}

export const CABINET_FINISH_ORDER: CabinetFinishId[] = [
  'warm-white',
  'cashmere',
  'greige',
  'sage-green',
  'navy-matte',
  'charcoal',
  'natural-oak',
  'walnut',
];

export const CABINET_FINISHES: Record<CabinetFinishId, CabinetFinishConfig> = {
  'warm-white': {
    id: 'warm-white',
    label: 'سفید صابونی مات',
    shortLabel: 'سفید',
    hex: '#f8f7f4',
    hexDark: '#e4e0d8',
    edgeHex: '#94a3b8',
    roughness: 0.36,
  },
  cashmere: {
    id: 'cashmere',
    label: 'کشمیر گرم',
    shortLabel: 'کشمیر',
    hex: '#e7ddd3',
    hexDark: '#cfc2b4',
    edgeHex: '#78716c',
    roughness: 0.42,
  },
  greige: {
    id: 'greige',
    label: 'طوسی بژ (گریژ)',
    shortLabel: 'گریژ',
    hex: '#c7c2ba',
    hexDark: '#a8a299',
    edgeHex: '#57534e',
    roughness: 0.4,
  },
  'sage-green': {
    id: 'sage-green',
    label: 'سبز مریم‌گلی',
    shortLabel: 'سبز مریم',
    hex: '#9fb19e',
    hexDark: '#7f947e',
    edgeHex: '#3f4f3f',
    roughness: 0.44,
  },
  'navy-matte': {
    id: 'navy-matte',
    label: 'سرمه‌ای مات',
    shortLabel: 'سرمه‌ای',
    hex: '#2b4059',
    hexDark: '#1c2b3d',
    edgeHex: '#0f172a',
    roughness: 0.44,
  },
  charcoal: {
    id: 'charcoal',
    label: 'ذغالی آنتراسیت',
    shortLabel: 'ذغالی',
    hex: '#363940',
    hexDark: '#23252a',
    edgeHex: '#090a0d',
    roughness: 0.42,
  },
  'natural-oak': {
    id: 'natural-oak',
    label: 'چوب بلوط طبیعی',
    shortLabel: 'بلوط',
    hex: '#c8a173',
    hexDark: '#9e7749',
    edgeHex: '#624322',
    woodGrain: true,
    roughness: 0.56,
  },
  walnut: {
    id: 'walnut',
    label: 'چوب گردویی تیره',
    shortLabel: 'گردویی',
    hex: '#7a5236',
    hexDark: '#553620',
    edgeHex: '#2f1c0e',
    woodGrain: true,
    roughness: 0.52,
  },
};

export interface BacksplashFinishConfig {
  id: BacksplashFinishId;
  label: string;
  shortLabel: string;
  baseHex: string;
  groutHex: string;
  accentHex: string;
  pattern: 'marble' | 'subway' | 'travertine' | 'hex' | 'terrazzo' | 'herringbone';
}

export const BACKSPLASH_FINISH_ORDER: BacksplashFinishId[] = [
  'calacatta-marble',
  'subway-white',
  'warm-travertine',
  'hex-sage',
  'terrazzo-grey',
  'herringbone-charcoal',
];

export const BACKSPLASH_FINISHES: Record<BacksplashFinishId, BacksplashFinishConfig> = {
  'calacatta-marble': {
    id: 'calacatta-marble',
    label: 'اسلب مرمر کلکته',
    shortLabel: 'مرمر',
    baseHex: '#f5f4f0',
    groutHex: '#d6d3cd',
    accentHex: '#a8a29e',
    pattern: 'marble',
  },
  'subway-white': {
    id: 'subway-white',
    label: 'کاشی مترویی سفید',
    shortLabel: 'مترویی',
    baseHex: '#fafaf9',
    groutHex: '#94a3b8',
    accentHex: '#e2e8f0',
    pattern: 'subway',
  },
  'warm-travertine': {
    id: 'warm-travertine',
    label: 'کاشی تراورتن کرم',
    shortLabel: 'تراورتن',
    baseHex: '#e7dfd3',
    groutHex: '#b8ad9d',
    accentHex: '#c7b8a3',
    pattern: 'travertine',
  },
  'hex-sage': {
    id: 'hex-sage',
    label: 'کاشی شش‌ضلعی سبز',
    shortLabel: 'شش‌ضلعی',
    baseHex: '#b8cab8',
    groutHex: '#7e917e',
    accentHex: '#9bb29b',
    pattern: 'hex',
  },
  'terrazzo-grey': {
    id: 'terrazzo-grey',
    label: 'ترازو طوسی روشن',
    shortLabel: 'ترازو',
    baseHex: '#e2e4e6',
    groutHex: '#adb3ba',
    accentHex: '#64748b',
    pattern: 'terrazzo',
  },
  'herringbone-charcoal': {
    id: 'herringbone-charcoal',
    label: 'جناغی دودی تیره',
    shortLabel: 'جناغی دودی',
    baseHex: '#475569',
    groutHex: '#1e293b',
    accentHex: '#64748b',
    pattern: 'herringbone',
  },
};

export interface CountertopFinishConfig {
  id: CountertopFinishId;
  label: string;
  shortLabel: string;
  hex: string;
  veinHex: string;
}

export const COUNTERTOP_FINISH_ORDER: CountertopFinishId[] = [
  'dark-quartz',
  'calacatta-top',
  'concrete-grey',
  'oak-butcher',
];

export const COUNTERTOP_FINISHES: Record<CountertopFinishId, CountertopFinishConfig> = {
  'dark-quartz': {
    id: 'dark-quartz',
    label: 'کوارتز مشکی',
    shortLabel: 'کوارتز تیره',
    hex: '#2b313b',
    veinHex: '#475569',
  },
  'calacatta-top': {
    id: 'calacatta-top',
    label: 'کورین مرمر سفید',
    shortLabel: 'مرمر سفید',
    hex: '#f1f0ec',
    veinHex: '#cbd5e1',
  },
  'concrete-grey': {
    id: 'concrete-grey',
    label: 'بتن طوسی',
    shortLabel: 'بتن',
    hex: '#94989e',
    veinHex: '#64748b',
  },
  'oak-butcher': {
    id: 'oak-butcher',
    label: 'صفحه چوب بلوط',
    shortLabel: 'چوبی',
    hex: '#b98c5b',
    veinHex: '#7d562d',
  },
};

export const DOOR_STYLE_ORDER: DoorStyle[] = [
  'flat',
  'cnc',
  'glass',
  'glass-frosted',
  'glass-grid',
];

export const DOOR_STYLE_META: Record<
  DoorStyle,
  { label: string; shortLabel: string; desc: string }
> = {
  flat: { label: 'ساده (مدرن فلت)', shortLabel: 'ساده', desc: 'درب صاف مدرن' },
  cnc: { label: 'سی‌ان‌سی / قاب‌دار', shortLabel: 'سی‌ان‌سی', desc: 'طرح نئوکلاسیک و کلاسیک' },
  glass: { label: 'شیشه یکپارچه شفاف', shortLabel: 'شفاف', desc: 'تمام در از شیشه شفاف، بدون قاب' },
  'glass-frosted': { label: 'شیشه یکپارچه مات', shortLabel: 'شیشه مات', desc: 'شیشه مات بدون قاب' },
  'glass-grid': { label: 'شیشه با فریم مشبک چوبی', shortLabel: 'مشبک چوبی', desc: 'قاب و شبکه چوبی کلاسیک/نئوکلاسیک با شیشه شفاف' },
};

export const HARDWARE_KIND_ORDER: HardwareKind[] = [
  'hinged',
  'pantry-pullout',
  'lift-bifold',
  'push-to-open',
  'corner',
];

export const HARDWARE_KIND_META: Record<
  HardwareKind,
  { label: string; shortLabel: string; desc: string }
> = {
  hinged: { label: 'لولایی استاندارد', shortLabel: 'لولایی', desc: 'بازشو لولایی معمولی' },
  'pantry-pullout': { label: 'سوپری کشویی ریلی', shortLabel: 'سوپری', desc: 'درب به صورت کشویی بیرون می‌آید' },
  'lift-bifold': { label: 'جک افقی هم‌زمان (هوایی)', shortLabel: 'جک افقی', desc: 'درب‌های افقی هوایی با هم باز می‌شوند' },
  'push-to-open': { label: 'مگنتی فشاری (بدون دستگیره)', shortLabel: 'مگنتی', desc: 'باز شدن با فشار بدون نیاز به دستگیره' },
  corner: { label: 'لولای کنج (حداکثر ۸۰°)', shortLabel: 'کنج ۸۰°', desc: 'لولای مخصوص کنج با فاصله ۴cm از دیوار' },
};

export const SHEET_MM = 16;
export const UNIT_DOUBLE_MM = 32;
export const MIN_DOOR_CM = 30;
export const MIN_PANTRY_CM = 15;
export const MIN_DYNAMIC_DOOR_CM = 35;
export const MAX_DOOR_CM = 60;
export const DRAWER_MIN_CM = 40;
export const DRAWER_MAX_CM = 110;
export const MIN_LIFT_DOOR_CM = 50;
export const MAX_LIFT_DOOR_CM = 110;
export const MAX_LIFT_LEAF_HEIGHT_CM = 60;
export const CARCASS_STILE_CM = 5;
export const MIN_SHELF_GAP_CM = 25;
export const DEFAULT_DOOR_CM = 60;
export const DEFAULT_COLUMN_DEPTH_CM = 35;
export const COUNTERTOP_CM = 3;
export const PLINTH_CM = 10;
export const FRIDGE_FRAME_CM = 5; // 5cm architectural surround box frame
export const FRAME_WIDTH_OPTIONS = [3, 5, 7, 9, 11] as const;
export const APRON_SINK_DEPTH_CM = 20;
export const CORNER_FILLER_CM = 5; // 5cm clearance filler stile so adjacent corner doors never clash

export const WALL_LOWER_ELEV_CM = 145;
export const WALL_LOWER_HEIGHT_CM = 75; // Top = 220cm (matches tall & over-fridge top)
export const WALL_DOUBLE_LOWER_H_CM = 30;
export const WALL_DOUBLE_UPPER_ELEV_CM = WALL_LOWER_ELEV_CM + WALL_DOUBLE_LOWER_H_CM;

export const COUNTERTOP_THICKNESS_OPTIONS = [3, 5, 7] as const;

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  wallHeightCm: 265,
  baseHeightCm: 86,
  plinthCm: 10,
  countertopCm: 3,
  countertopTopEdge: 'square',
  countertopBottomEdge: 'square',
  wallCabElevCm: 145,
  wallCabHeightCm: 75,
  hdrIntensity: 2,
  cameraLightIntensity: 1,
  ambientLightIntensity: 0.06,
  linearLightIntensity: 5,
  halogenLightIntensity: 1,
  ceilingAreaIntensity: 12,
  facadeLightIntensity: 1,
  facadeLightEnabled: true,
  defaultHoodKind: 'chimney',
  ambientOcclusion: true,
  equipmentFinish: 'silver',
};

export interface FridgeModelConfig {
  id: FridgeModel;
  label: string;
  shortLabel: string;
  width: number;
  depth: number;
  height: number;
  sizeOptions: readonly number[];
}

export const FRIDGE_MODELS: Record<FridgeModel, FridgeModelConfig> = {
  'single-door': {
    id: 'single-door',
    label: 'تک‌در (۶۵cm)',
    shortLabel: 'تک‌در',
    width: 65,
    depth: 68,
    height: 185,
    sizeOptions: [60, 65, 70],
  },
  single: {
    id: 'single',
    label: 'یخچال فریزر پایین (۷۰cm)',
    shortLabel: 'فریزر پایین',
    width: 70,
    depth: 70,
    height: 185,
    sizeOptions: [70, 75, 80, 85],
  },
  'side-by-side': {
    id: 'side-by-side',
    label: 'ساید بای ساید (۹۲cm)',
    shortLabel: 'ساید',
    width: 92,
    depth: 75,
    height: 185,
    sizeOptions: [85, 90, 92, 95],
  },
  twin: {
    id: 'twin',
    label: 'دوقلو (۱۲۰cm)',
    shortLabel: 'دوقلو',
    width: 120,
    depth: 70,
    height: 185,
    sizeOptions: [115, 120, 125, 130],
  },
  'fridge-sbs-homebar': { id: 'fridge-sbs-homebar', label: 'ساید بای ساید هوم‌باردار استیل', shortLabel: 'ساید هوم‌بار', width: 95, depth: 70, height: 185, sizeOptions: [90,95,100] },
  'fridge-twin-steel': { id: 'fridge-twin-steel', label: 'یخچال فریزر دوقلو استیل', shortLabel: 'دوقلو استیل', width: 110, depth: 70, height: 185, sizeOptions: [110,115,120] },
  'fridge-combi-white': { id: 'fridge-combi-white', label: 'کمبی فریزر پایین سفید', shortLabel: 'کمبی سفید', width: 70, depth: 68, height: 185, sizeOptions: [65,70,75] },
  'fridge-instaview-black': { id: 'fridge-instaview-black', label: 'اینستاویو مشکی چهار در', shortLabel: 'اینستاویو', width: 95, depth: 74, height: 185, sizeOptions: [90,95,100] },
  'fridge-topfreezer-steel': { id: 'fridge-topfreezer-steel', label: 'فریزر بالا استیل', shortLabel: 'فریزر بالا', width: 85, depth: 70, height: 170, sizeOptions: [80,85,90] },
  'fridge-french-4drawer': { id: 'fridge-french-4drawer', label: 'فرنچ دور چهار تکه استیل', shortLabel: 'فرنچ چهاردر', width: 96, depth: 74, height: 185, sizeOptions: [90,96,100] },
};

export const FRIDGE_MODEL_ORDER: FridgeModel[] = [
  'fridge-sbs-homebar', 'fridge-twin-steel','fridge-combi-white',
  'fridge-instaview-black','fridge-topfreezer-steel','fridge-french-4drawer',
];

export interface SinkModelConfig {
  id: SinkModel;
  label: string;
  shortLabel: string;
  width: number;
  depth: number;
}

export const SINK_MODELS: Record<SinkModel, SinkModelConfig> = {
  'sink-double-flat-chrome': { id: 'sink-double-flat-chrome', label: 'دولگن استیل با سینی صاف', shortLabel: 'دولگن استیل با سینی صاف', width: 110, depth: 56 },
  'sink-single-granite-black': { id: 'sink-single-granite-black', label: 'تک‌لگن گرانیتی مشکی', shortLabel: 'تک‌لگن گرانیتی مشکی', width: 80, depth: 56 },
  'sink-double-ribbed-steel': { id: 'sink-double-ribbed-steel', label: 'دولگن استیل آجدار', shortLabel: 'دولگن استیل آجدار', width: 110, depth: 56 },
  'sink-single-deep-steel': { id: 'sink-single-deep-steel', label: 'تک‌لگن استیل عمیق', shortLabel: 'تک‌لگن استیل عمیق', width: 75, depth: 56 },
  'sink-workstation-dual-tap': { id: 'sink-workstation-dual-tap', label: 'ورک‌استیشن دوشیر', shortLabel: 'ورک‌استیشن دوشیر', width: 105, depth: 56 },
  'sink-workstation-gunmetal': { id: 'sink-workstation-gunmetal', label: 'ورک‌استیشن گان‌متال', shortLabel: 'ورک‌استیشن گان‌متال', width: 105, depth: 56 },
  'sink-single-fan-steel': { id: 'sink-single-fan-steel', label: 'تک‌لگن سینی بادبزنی', shortLabel: 'تک‌لگن سینی بادبزنی', width: 95, depth: 58 },
  'sink-double-grid-steel': { id: 'sink-double-grid-steel', label: 'دولگن استیل مشبک', shortLabel: 'دولگن استیل مشبک', width: 110, depth: 56 },
  'sink-corner-v-steel': { id: 'sink-corner-v-steel', label: 'کنج V استیل دولگن', shortLabel: 'کنج V استیل دولگن', width: 100, depth: 60 },
  'sink-corner-l-steel': { id: 'sink-corner-l-steel', label: 'کنج L استیل', shortLabel: 'کنج L استیل', width: 100, depth: 60 },
  'sink-corner-granite-brown': { id: 'sink-corner-granite-brown', label: 'کنج گرانیتی قهوه‌ای', shortLabel: 'کنج گرانیتی قهوه‌ای', width: 100, depth: 60 },
  'steel-1': {
    id: 'steel-1',
    label: 'استیل تک‌لگن (۶۰cm)',
    shortLabel: 'تک‌لگن',
    width: 60,
    depth: 50,
  },
  'steel-2': {
    id: 'steel-2',
    label: 'استیل دولگن (۹۰cm)',
    shortLabel: 'دولگن',
    width: 90,
    depth: 50,
  },
  'steel-tray-right': {
    id: 'steel-tray-right',
    label: 'استیل لگن + سینی راست (۱۰۰cm)',
    shortLabel: 'سینی راست',
    width: 100,
    depth: 50,
  },
  'steel-tray-left': {
    id: 'steel-tray-left',
    label: 'استیل لگن + سینی چپ (۱۰۰cm)',
    shortLabel: 'سینی چپ',
    width: 100,
    depth: 50,
  },
  'ceramic-apron': {
    id: 'ceramic-apron',
    label: 'سرامیکی پیش‌آمده (۸۰cm)',
    shortLabel: 'سرامیکی',
    width: 80,
    depth: 54,
  },
  'corner-sink': {
    id: 'corner-sink',
    label: 'سینک کنج (۹۰cm)',
    shortLabel: 'سینک کنج',
    width: 90,
    depth: 54,
  },
};

export const SINK_MODEL_ORDER: SinkModel[] = [
  'sink-double-flat-chrome',
  'sink-single-granite-black',
  'sink-double-ribbed-steel',
  'sink-single-deep-steel',
  'sink-workstation-dual-tap',
  'sink-workstation-gunmetal',
  'sink-single-fan-steel',
  'sink-double-grid-steel',
  'sink-corner-v-steel',
  'sink-corner-l-steel',
  'sink-corner-granite-brown',
];

export const GAS_WIDTH_OPTIONS = [30, 35, 60, 75, 80, 90] as const;

export const HOOD_MODELS: Record<HoodModel, { id: HoodModel; label: string; shortLabel: string }> = {
  chimney: { id: 'chimney', label: 'هود شومینه‌ای (تی‌شکل)', shortLabel: 'شومینه‌ای' },
  angled: { id: 'angled', label: 'هود مورب شیشه‌ای', shortLabel: 'مورب' },
  box: { id: 'box', label: 'هود باکس اکسپوز', shortLabel: 'اکسپوز' },
  cylinder: { id: 'cylinder', label: 'هود استوانه‌ای', shortLabel: 'استوانه‌ای' },
  'curved-black': { id:'curved-black',label:'شومینه‌ای شیشه خم مشکی',shortLabel:'شیشه خم مشکی' },
  'curved-steel': { id:'curved-steel',label:'شومینه‌ای شیشه خم استیل',shortLabel:'شیشه خم استیل' },
  'tbox-steel': { id:'tbox-steel',label:'هود تی‌باکس استیل',shortLabel:'تی‌باکس استیل' },
  'angled-dual-black': { id:'angled-dual-black',label:'هود مورب مشکی دوپله',shortLabel:'مورب مشکی' },
  'pyramid-black': { id:'pyramid-black',label:'هود هرمی مشکی',shortLabel:'هرمی مشکی' },
  'framed-rounded-black': { id:'framed-rounded-black',label:'هود مورب قاب‌دار گوشه‌گرد',shortLabel:'قاب‌دار مشکی' },
};

export const HOOD_MODEL_ORDER: HoodModel[] = [
  'curved-black','curved-steel','tbox-steel','angled-dual-black',
  'pyramid-black','framed-rounded-black',
];

export const WASHING_CAPACITIES: Record<WashingCapacityKg, { kg: WashingCapacityKg; width: number; label: string; shortLabel: string }> = {
  6: { kg: 6, width: 55, label: '۶ کیلویی (۵۵cm)', shortLabel: '۶ کیلویی' },
  8: { kg: 8, width: 60, label: '۸ کیلویی (۶۰cm)', shortLabel: '۸ کیلویی' },
  9: { kg: 9, width: 62, label: '۹ کیلویی (۶۲cm)', shortLabel: '۹ کیلویی' },
};

export const WASHING_CAPACITY_ORDER: WashingCapacityKg[] = [6, 8, 9];

export const EQUIPMENT_FINISH_META: Record<EquipmentFinish, { id: EquipmentFinish; label: string; shortLabel: string; hex: string }> = {
  silver: { id: 'silver', label: 'نقره‌ای (استیل)', shortLabel: 'نقره‌ای', hex: '#94a3b8' },
  white: { id: 'white', label: 'سفید', shortLabel: 'سفید', hex: '#f8fafc' },
  black: { id: 'black', label: 'مشکی', shortLabel: 'مشکی', hex: '#1e293b' },
};

export const APPLIANCE_CONFIGS: Record<
  ApplianceKind,
  { label: string; shortLabel: string; width: number; depth: number; heightCm?: number }
> = {
  sink: { label: 'سینک (۹۰cm)', shortLabel: 'سینک', width: 90, depth: 50 },
  gas: { label: 'گاز صفحه‌ای پنج‌شعله (۹۰cm)', shortLabel: 'گاز', width: 90, depth: 55 },
  dishwasher: { label: 'ماشین ظرفشویی (۶۰cm)', shortLabel: 'ظرفشویی', width: 60, depth: 58 },
  washing: { label: 'ماشین لباسشویی (۶۰cm)', shortLabel: 'لباسشویی', width: 60, depth: 58 },
  'builtin-oven': { label: 'فر توکار (۶۰cm)', shortLabel: 'فر توکار', width: 60, depth: 56, heightCm: 60 },
  microwave: { label: 'ماکروفر توکار (۶۰cm)', shortLabel: 'ماکروفر', width: 60, depth: 42, heightCm: 38 },
};

export const APPLIANCE_PLACEABLE_ORDER: ApplianceKind[] = [
  'dishwasher',
  'washing',
  'builtin-oven',
  'microwave',
];

export const OPENING_DEFAULTS: Record<
  OpeningKind,
  { label: string; width: number; elevY: number; height: number; depthCm?: number }
> = {
  window: { label: 'پنجره', width: 120, elevY: 105, height: 120 },
  door: { label: 'درب ورودی / اتاق', width: 90, elevY: 0, height: 210 },
  column: { label: 'ستون / داکت', width: 45, elevY: 0, height: 265, depthCm: DEFAULT_COLUMN_DEPTH_CM },
};

export const DRAWER_PATTERNS: DrawerPattern[] = [
  { id: '2eq', label: '۲ کشو مساوی', shortLabel: '۲ کشو', ratios: [0.5] },
  { id: '3eq', label: '۳ کشو مساوی', shortLabel: '۳ کشو', ratios: [0.333, 0.667] },
  { id: '3step', label: '۳ کشو پلکانی', shortLabel: 'پلکانی', ratios: [0.22, 0.54] },
  { id: '4eq', label: '۴ کشو مساوی', shortLabel: '۴ کشو', ratios: [0.25, 0.5, 0.75] },
  {
    id: '1top',
    label: 'تک کشو بالا (درب + کشو)',
    shortLabel: 'تک کشو بالا',
    ratios: [],
    kind: 'door',
    drawerBand: { position: 'top', ratio: 0.26 },
  },
  {
    id: '1bot',
    label: 'تک کشو پایین (درب + کشو)',
    shortLabel: 'تک کشو پایین',
    ratios: [],
    kind: 'door',
    drawerBand: { position: 'bottom', ratio: 0.26 },
  },
];

export const LIFT_PATTERNS: DrawerPattern[] = [
  { id: '1lift', label: '۱ درب افقی (ارتفاع کم / بالای یخچال)', shortLabel: '۱ افقی', ratios: [] },
  { id: '2lift', label: '۲ درب افقی (استاندارد)', shortLabel: '۲ افقی', ratios: [0.5] },
];

export interface BoxPresetConfig {
  name: string;
  height: number;
  depth: number;
  elevY: number;
  plinth: number;
  countertopCm: number;
}

export const BOX_PRESETS: Record<BoxKind, BoxPresetConfig> = {
  base: {
    name: 'زمینی',
    height: 86, // 10 plinth + 72 carcass + 4 countertop
    depth: 60,
    elevY: 0,
    plinth: PLINTH_CM,
    countertopCm: COUNTERTOP_CM,
  },
  wall: {
    name: 'هوایی',
    height: WALL_LOWER_HEIGHT_CM,
    depth: 32,
    elevY: WALL_LOWER_ELEV_CM,
    plinth: 0,
    countertopCm: 0,
  },
  'wall-deep': {
    name: 'هوایی عمق‌دار (ردیف بالا)',
    height: 60,
    depth: 58,
    elevY: WALL_DOUBLE_UPPER_ELEV_CM,
    plinth: 0,
    countertopCm: 0,
  },
  tall: {
    name: 'قدی',
    height: 220, // Matches 145 + 75 wall top!
    depth: 60,
    elevY: 0,
    plinth: PLINTH_CM,
    countertopCm: 0,
  },
  fridge: {
    name: 'یخچال',
    height: 185,
    depth: 70,
    elevY: 0,
    plinth: 0,
    countertopCm: 0,
  },
  closet: {
    name: 'کمد دیواری',
    height: 235,
    depth: 60,
    elevY: 0,
    plinth: 8,
    countertopCm: 0,
  },
};
