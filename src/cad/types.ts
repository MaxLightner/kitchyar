import type { CooktopModelId, FridgeModelId, HoodModelId, SinkModelId } from '../hoods/catalog';

export type BoxKind = 'base' | 'wall' | 'wall-deep' | 'tall' | 'fridge' | 'closet';

export type FridgeModel = FridgeModelId | 'single-door' | 'single' | 'side-by-side' | 'twin'; // legacy saved projects remain readable

export type DoorKind =
  | 'door'
  | 'drawer'
  | 'lift'
  | 'open'
  | 'rail'
  | 'fridge';

export type DoorStyle = 'flat' | 'cnc' | 'glass' | 'glass-frosted' | 'glass-grid';
export type HardwareKind =
  | 'hinged'
  | 'pantry-pullout'
  | 'lift-bifold'
  | 'push-to-open'
  | 'corner';
export type DesignStyle = 'modern' | 'neoclassic';

export type CabinetTextureId = 'smooth' | 'oak' | 'walnut' | 'satin';

export type CabinetFinishId =
  | 'warm-white'
  | 'cashmere'
  | 'greige'
  | 'sage-green'
  | 'navy-matte'
  | 'charcoal'
  | 'natural-oak'
  | 'walnut';

export type BacksplashFinishId =
  | 'calacatta-marble'
  | 'subway-white'
  | 'warm-travertine'
  | 'hex-sage'
  | 'terrazzo-grey'
  | 'herringbone-charcoal';

export type CountertopFinishId =
  | 'dark-quartz'
  | 'calacatta-top'
  | 'concrete-grey'
  | 'oak-butcher';

export type SelectionMode = 'single' | 'add' | 'subtract';

export type HandleStyle = 'simple' | 'long-bar' | 'knob' | 'hidden' | 'f-profile' | 'handleless' | 'arch' | 'tab';
export type Orientation = 'vertical' | 'horizontal';

export type ApplianceKind = 'sink' | 'gas' | 'dishwasher' | 'washing' | 'builtin-oven' | 'microwave';
export type HoodModel = HoodModelId | 'chimney' | 'angled' | 'box' | 'cylinder';
export type CooktopModel = CooktopModelId;
export type WashingCapacityKg = 6 | 8 | 9;
export type SinkModel = SinkModelId
  | 'steel-1'
  | 'steel-2'
  | 'steel-tray-right'
  | 'steel-tray-left'
  | 'ceramic-apron'
  | 'corner-sink';

export type OpeningKind = 'window' | 'door' | 'column';
export type DoorSwing = 'left-in' | 'right-in' | 'left-out' | 'right-out';

export type ToolId =
  | 'select'
  | 'move'
  | 'wall'
  | 'cab-draw'
  | 'fridge'
  | 'sink'
  | 'gas'
  | 'appliance'
  | 'dining'
  | 'opening'
  | 'doors'
  | 'front-cut'
  | 'hardware'
  | 'door-style'
  | 'finish'
  | 'pencil'
  | 'skeleton'
  | 'frame'
  | 'handle'
  | 'eraser';

export type FrameSide = 'left' | 'right' | 'top' | 'bottom' | 'seam';

export interface BoxFrameItem {
  id: string;
  side: FrameSide;
  widthCm: number;
  color?: string;
  /** Offset in cm from box left when side === 'seam' */
  seamCm?: number;
}

export interface DoorUnit {
  id: string;
  startCm: number;
  widthCm: number;
  kind: DoorKind;
  /** Vertical split ratios (0..1) for drawers or stacked horizontal lift doors */
  drawerRatios: number[];
  /** Stacked facade panels from the division pencil swing sideways instead of lifting. */
  frontCutHinges?: boolean;
  /** Visual panel style: flat, CNC routed, glass, glass-grid */
  doorStyle?: DoorStyle;
  finish?: CabinetFinishId;
  /** Hardware / opening mechanism decoupled from panel style */
  hardwareKind?: HardwareKind;
  /** Hinge attachment edge for architectural swing direction & paired handles */
  hingeSide?: 'left' | 'right';
  /** Optional integrated top or bottom drawer band */
  drawerBand?: { position: 'top' | 'bottom'; ratio: number };
  /** Auto two hinged leaves in tall/closet cabinets, not a drawer band. */
  tallDoorSplit?: boolean;
}

export interface ShelfItem {
  id: string;
  startCm: number;
  endCm: number;
  yRatio: number;
  /** Shelf orientation inside unit bay: horizontal shelf (default) or vertical divider */
  orient?: Orientation;
  /** Normalized horizontal ratio (0..1) inside [startCm..endCm] when orient === 'vertical' */
  xRatio?: number;
}

export interface HandleItem {
  id: string;
  doorId: string;
  /** Which drawer/lift row index (0..N) if door has horizontal splits; 0 for full door */
  rowIndex: number;
  xRatio: number;
  yRatio: number;
  orient: Orientation;
  style: HandleStyle;
  lengthCm: number;
}

export type CabinetLightMode = 'off' | 'linear' | 'halogen';
export interface CabinetLighting {
  mode: CabinetLightMode;
  intensity: number;
}

export interface CabinetBox {
  id: string;
  name: string;
  type: BoxKind;
  offsetX: number;
  elevY: number;
  width: number;
  height: number;
  depth: number;
  plinth: number;
  countertopCm: number;
  hasFridgeFrame?: boolean;
  fridgeModel?: FridgeModel;
  fridgeConcealed?: boolean;
  overFridgeDepthMode?: '60' | 'flush';
  /** Per-box cabinet door/body finish override */
  finish?: CabinetFinishId;
  color?: string;
  texture?: CabinetTextureId;
  underCabinetLight?: boolean;
  lighting?: CabinetLighting;
  /** Per upper box: fake beam on front doors (off by default). */
  facadeLightEnabled?: boolean;
  /** Depth of regular fridge surround: 60 or 80cm. Concealed fridge is flush. */
  fridgeFrameDepthCm?: 60 | 80;
  reflection?: number;
  roughness?: number;
  /** Links e.g. over-fridge upper cabinet to its parent fridge box */
  linkedToBoxId?: string;
  doors: DoorUnit[];
  unitDividers: number[];
  shelves: ShelfItem[];
  handles: HandleItem[];
  frames?: BoxFrameItem[];
}

export interface ApplianceItem {
  id: string;
  kind: ApplianceKind;
  /** Hierarchical parent base or tall cabinet box ID */
  boxId?: string;
  offsetX: number;
  width: number;
  sinkModel?: SinkModel;
  sinkFinish?: EquipmentFinish;
  /** Per-item body finish override; never changes unrelated appliances. */
  finish?: EquipmentFinish;
  cornerSide?: 'left' | 'right';
  hoodKind?: 'hidden' | 'chimney';
  hoodModel?: HoodModel;
  cooktopModel?: CooktopModel;
  /** Persisted flame/zone illumination; double tap toggles this on the 3D hob. */
  flameOn?: boolean;
  hoodFinish?: EquipmentFinish;
  washingCapacityKg?: WashingCapacityKg;
  ovenLightOn?: boolean;
  /** Optional vertical elevation in cm when mounted inside tall cabinets */
  elevY?: number;
}

export interface WallOpening {
  id: string;
  kind: OpeningKind;
  offsetX: number;
  width: number;
  elevY: number;
  height: number;
  /** Depth protruding into the room in cm (especially columns/ducts, 1cm increments) */
  depthCm?: number;
  swingDir?: DoorSwing;
}

export type DiningSeats = 2 | 4 | 6 | 8;

interface FloorFurniturePosition {
  id: string;
  xCm: number;
  yCm: number;
  rotation: number;
}

export interface DiningSet extends FloorFurniturePosition {
  kind?: 'dining';
  seats: DiningSeats;
  shape?: 'round' | 'rect';
}

export interface TelevisionSet extends FloorFurniturePosition {
  kind: 'tv';
}

export type FloorFurniture = DiningSet | TelevisionSet;
export type FloorFurnitureKind = 'dining' | 'tv';

export interface RoomColumn {
  id: string;
  xCm: number;
  yCm: number;
  widthCm: number;
  depthCm: number;
  heightCm: number;
}

export interface Wall {
  id: string;
  name: string;
  x1Cm: number;
  y1Cm: number;
  x2Cm: number;
  y2Cm: number;
  length: number;
  height: number;
  angle: number;
  flipSide: 1 | -1;
  boxes: CabinetBox[];
  appliances: ApplianceItem[];
  openings?: WallOpening[];
}

export interface CornerJunction {
  key: string;
  xCm: number;
  yCm: number;
  wallAId: string;
  wallAEnd: 'start' | 'end';
  wallBId: string;
  wallBEnd: 'start' | 'end';
  /** Which wall's cabinet extends all the way into the corner square */
  ownerWallId: string;
}

export interface BlockedZone {
  startCm: number;
  endCm: number;
  depthCm: number;
  tier: 'lower' | 'wall-lower' | 'wall-upper';
  role: 'blind-behind' | 'side-profile';
  otherWallName: string;
  cornerKey: string;
}

export interface DrawerPattern {
  id: string;
  label: string;
  shortLabel: string;
  ratios: number[];
  kind?: 'door' | 'drawer';
  drawerBand?: { position: 'top' | 'bottom'; ratio: number };
}

export type EquipmentFinish = 'silver' | 'white' | 'black';

export type CountertopEdgeProfile = 'square' | 'round';

export interface ProjectSettings {
  wallHeightCm: number;
  baseHeightCm: number;
  plinthCm: number;
  countertopCm: number;
  countertopTopEdge?: CountertopEdgeProfile;
  countertopBottomEdge?: CountertopEdgeProfile;
  wallCabElevCm: number;
  wallCabHeightCm: number;
  hdrRotationDegrees?: number;
  hdrIntensity?: number;
  cameraLightIntensity?: number;
  ambientLightIntensity?: number;
  enableAmbientLight?: boolean;
  enableReflections?: boolean;
  ceilingLightIntensities?: number[];
  ceilingAreaIntensity?: number;
  facadeLightIntensity?: number;
  facadeLightEnabled?: boolean;
  underCabinetLightMode?: CabinetLightMode;
  linearLightIntensity?: number;
  halogenLightIntensity?: number;
  cabinetReflection?: number;
  cabinetRoughness?: number;
  countertopReflection?: number;
  countertopRoughness?: number;
  backsplashReflection?: number;
  backsplashRoughness?: number;
  floorReflection?: number;
  floorRoughness?: number;
  ambientOcclusion?: boolean;
  equipmentFinish?: EquipmentFinish;
  defaultHoodKind?: 'chimney' | 'hidden';
  defaultHoodModel?: HoodModel;
}

export interface MultiSelection {
  boxIds: string[];
  doorIds: string[];
  openingIds: string[];
  applianceIds: string[];
}

export interface ArCalibrationState {
  a: { x: number; z: number };
  b: { x: number; z: number };
  realDistanceCm?: number;
}

export interface ProjectState {
  walls: Wall[];
  columns?: RoomColumn[];
  diningSets?: FloorFurniture[];
  selectedDiningId?: string | null;
  cornerOwners: Record<string, string>;
  activeWallId: string | null;
  activeBoxId: string | null;
  selectedDoorId: string | null;
  selectedOpeningId?: string | null;
  selectedColumnId?: string | null;
  selectedApplianceId?: string | null;
  selectedApplianceSubPart?: 'gas' | 'hood' | null;
  selectedSurface?: 'countertop' | 'backsplash' | null;
  selectedShelfId?: string | null;
  selectedHandleId?: string | null;
  selectedFrameId?: string | null;
  selectedUnitDivider?: { boxId: string; seamCm: number } | null;
  selectedUnit?: { boxId: string; startCm: number; endCm: number } | null;
  multiSelection?: MultiSelection;
  doorsLocked: boolean;
  doorsHidden?: boolean;
  designStyle?: DesignStyle;
  cabinetFinish?: CabinetFinishId;
  cabinetTexture?: CabinetTextureId;
  backsplashFinish?: BacksplashFinishId;
  countertopFinish?: CountertopFinishId;
  skipStylePrompt?: boolean;
  settings?: ProjectSettings;
  arCalibration?: ArCalibrationState;
}
