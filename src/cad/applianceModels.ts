import * as THREE from 'three';
import { buildSinkDoubleFlatChrome } from '../three/models/sinks/buildSinkDoubleFlatChrome';
import { buildSinkSingleGraniteBlack } from '../three/models/sinks/buildSinkSingleGraniteBlack';
import { buildSinkDoubleRibbedSteel } from '../three/models/sinks/buildSinkDoubleRibbedSteel';
import { buildSinkSingleDeepSteel } from '../three/models/sinks/buildSinkSingleDeepSteel';
import { buildSinkWorkstationDualTap } from '../three/models/sinks/buildSinkWorkstationDualTap';
import { buildSinkWorkstationGunmetal } from '../three/models/sinks/buildSinkWorkstationGunmetal';
import { buildSinkSingleFanSteel } from '../three/models/sinks/buildSinkSingleFanSteel';
import { buildSinkDoubleGridSteel } from '../three/models/sinks/buildSinkDoubleGridSteel';
import { buildSinkCornerVSteel } from '../three/models/sinks/buildSinkCornerVSteel';
import { buildSinkCornerLSteel } from '../three/models/sinks/buildSinkCornerLSteel';
import { buildSinkCornerGraniteBrown } from '../three/models/sinks/buildSinkCornerGraniteBrown';
import { buildWashingMachine } from '../three/models/laundry/buildWashingMachine';
import { buildDishwasher } from '../three/models/laundry/buildDishwasher';
import type { ApplianceFinish } from '../three/models/laundry/buildWashingMachine';
import { createHoodMaterialLibrary, type HoodMaterialLibrary } from '../three/materials';
import { buildCurvedBlackHood } from '../three/models/buildCurvedBlackHood';
import { buildCurvedSteelHood } from '../three/models/buildCurvedSteelHood';
import { buildTBoxSteelHood } from '../three/models/buildTBoxSteelHood';
import { buildAngledDualBlackHood } from '../three/models/buildAngledDualBlackHood';
import { buildPyramidBlackHood } from '../three/models/buildPyramidBlackHood';
import { buildFramedRoundedBlackHood } from '../three/models/buildFramedRoundedBlackHood';
import { buildFridgeSbsHomebar } from '../three/models/fridges/buildFridgeSbsHomebar';
import { buildFridgeTwinSteel } from '../three/models/fridges/buildFridgeTwinSteel';
import { buildFridgeCombiWhite } from '../three/models/fridges/buildFridgeCombiWhite';
import { buildFridgeInstaviewBlack } from '../three/models/fridges/buildFridgeInstaviewBlack';
import { buildFridgeTopFreezerSteel } from '../three/models/fridges/buildFridgeTopFreezerSteel';
import { buildFridgeFrench4Drawer } from '../three/models/fridges/buildFridgeFrench4Drawer';
import { buildHobGlass5 } from '../three/models/cooktops/buildHobGlass5';
import { buildHobSteel5Right } from '../three/models/cooktops/buildHobSteel5Right';
import { buildHobSteel5Center } from '../three/models/cooktops/buildHobSteel5Center';
import { buildHobSteel3 } from '../three/models/cooktops/buildHobSteel3';
import { buildHobDomino2 } from '../three/models/cooktops/buildHobDomino2';
import { buildHobCeramic4 } from '../three/models/cooktops/buildHobCeramic4';
import { buildHobInduction4 } from '../three/models/cooktops/buildHobInduction4';
import type { CooktopModelId, FridgeModelId, HoodModelId, SinkModelId } from '../hoods/catalog';
import type { FridgeModel, HoodModel } from './types';
import type { LitApplianceResult } from '../three/cooktopHelpers';

/** Share one texture/material library across scene rebuilds, so even dragging a
 * cabinet doesn't repeatedly generate the heavy brushed-steel CanvasTextures. */
let shared: HoodMaterialLibrary | null = null;
export function applianceMaterials(): HoodMaterialLibrary {
  if (!shared) {
    shared = createHoodMaterialLibrary(4, false);
    for (const value of Object.values(shared)) {
      if (!(value instanceof THREE.Material)) continue;
      value.userData.sharedApplianceMaterial = true;
      for (const prop of ['map','normalMap','bumpMap','roughnessMap','emissiveMap','metalnessMap','alphaMap'] as const) {
        const texture = (value as THREE.MeshStandardMaterial)[prop] as THREE.Texture | undefined;
        if (texture instanceof THREE.Texture) texture.userData.sharedKitchenTexture = true;
      }
    }
  }
  return shared;
}
export function resolveFridgeModel(model?: FridgeModel): FridgeModelId {
  switch (model) {
    case 'single-door': return 'fridge-topfreezer-steel';
    case 'single': return 'fridge-combi-white';
    case 'twin': return 'fridge-twin-steel';
    case 'side-by-side': return 'fridge-sbs-homebar';
    default: return model ?? 'fridge-sbs-homebar';
  }
}
export function resolveHoodModel(model?: HoodModel): HoodModelId {
  switch (model) {
    case 'angled': return 'angled-dual-black';
    case 'box': return 'tbox-steel';
    case 'cylinder': return 'framed-rounded-black';
    case 'chimney': return 'curved-black';
    default: return model ?? 'curved-black';
  }
}
export function makeHood(model: HoodModel | undefined, mats = applianceMaterials()): THREE.Group {
  switch (resolveHoodModel(model)) {
    case 'curved-steel': return buildCurvedSteelHood(mats);
    case 'tbox-steel': return buildTBoxSteelHood(mats);
    case 'angled-dual-black': return buildAngledDualBlackHood(mats);
    case 'pyramid-black': return buildPyramidBlackHood(mats);
    case 'framed-rounded-black': return buildFramedRoundedBlackHood(mats);
    default: return buildCurvedBlackHood(mats);
  }
}
export function makeFridge(model: FridgeModel | undefined, mats = applianceMaterials()): THREE.Group {
  switch (resolveFridgeModel(model)) {
    case 'fridge-twin-steel': return buildFridgeTwinSteel(mats);
    case 'fridge-combi-white': return buildFridgeCombiWhite(mats);
    case 'fridge-instaview-black': return buildFridgeInstaviewBlack(mats);
    case 'fridge-topfreezer-steel': return buildFridgeTopFreezerSteel(mats);
    case 'fridge-french-4drawer': return buildFridgeFrench4Drawer(mats);
    default: return buildFridgeSbsHomebar(mats);
  }
}
export function makeCooktop(model: CooktopModelId | undefined, mats = applianceMaterials()): LitApplianceResult {
  let hob: LitApplianceResult;
  switch (model) {
    case 'hob-steel-5-right': hob = buildHobSteel5Right(mats); break;
    case 'hob-steel-5-center': hob = buildHobSteel5Center(mats); break;
    case 'hob-steel-3': hob = buildHobSteel3(mats); break;
    case 'hob-domino-2': hob = buildHobDomino2(mats); break;
    case 'hob-ceramic-4': hob = buildHobCeramic4(mats); break;
    case 'hob-induction-4': hob = buildHobInduction4(mats); break;
    default: hob = buildHobGlass5(mats); break;
  }

  // All seven procedural cooktops have a recessed dark chassis below their
  // black/steel deck. These are surface-mounted appliances, so remove that
  // underbody entirely. The deck, burner grates, knobs and flame toggles stay.
  const underbodies: THREE.Mesh[] = [];
  hob.group.traverse(part => {
    if (part instanceof THREE.Mesh && part.material === mats.darkChassis && part.position.y < -0.01) {
      underbodies.push(part);
    }
  });
  for (const underbody of underbodies) underbody.removeFromParent();
  return hob;
}
export function makeSink(model?: SinkModelId | string, mats = applianceMaterials()): THREE.Group {
  switch (model) {
    case 'sink-double-flat-chrome': return buildSinkDoubleFlatChrome(mats);
    case 'sink-single-granite-black': return buildSinkSingleGraniteBlack(mats);
    case 'sink-double-ribbed-steel': return buildSinkDoubleRibbedSteel(mats);
    case 'sink-single-deep-steel': return buildSinkSingleDeepSteel(mats);
    case 'sink-workstation-dual-tap': return buildSinkWorkstationDualTap(mats);
    case 'sink-workstation-gunmetal': return buildSinkWorkstationGunmetal(mats);
    case 'sink-single-fan-steel': return buildSinkSingleFanSteel(mats);
    case 'sink-double-grid-steel': return buildSinkDoubleGridSteel(mats);
    case 'sink-corner-v-steel': return buildSinkCornerVSteel(mats);
    case 'sink-corner-l-steel': return buildSinkCornerLSteel(mats);
    case 'sink-corner-granite-brown': return buildSinkCornerGraniteBrown(mats);
    default: return buildSinkDoubleFlatChrome(mats);
  }
}
/**
 * Tone only metallic meshes belonging to one generated appliance instance.
 * Do not mutate the shared material library or touch glass/induction surfaces.
 */
export function toneApplianceMetal(root: THREE.Object3D, finish: ApplianceFinish, includeNonMetal = false): void {
  const target = new THREE.Color(
    finish === 'black' ? 0x171b21 : finish === 'white' ? 0xdce0e3 : 0x969da6,
  );
  const copies = new Map<THREE.Material, THREE.Material>();
  // Original model glass is intentionally preserved, even when an opaque
  // glass shader reports metallic reflectance and has no material.name.
  const protectedGlass = new Set<THREE.Material>(
    Object.entries(applianceMaterials())
      .filter(([key]) => /glass|glaze|screen|display|ceramic/i.test(key))
      .map(([, material]) => material as THREE.Material),
  );
  const convert = (material: THREE.Material): THREE.Material => {
    if (!(material instanceof THREE.MeshStandardMaterial) ||
        protectedGlass.has(material) ||
        material.transparent || material.opacity < 0.96 ||
        (!includeNonMetal && material.metalness < 0.25) || /glass|screen|display/i.test(material.name)) return material;
    const previous = copies.get(material);
    if (previous) return previous;
    const copy = material.clone();
    const metalBlend = finish === 'black' ? 0.85 : 0.7;
    copy.color.lerp(target, metalBlend);
    copy.roughness = Math.max(copy.roughness, finish === 'black' ? 0.44 : 0.38);
    copy.metalness = Math.max(0.35, Math.min(0.84, copy.metalness));
    copy.envMapIntensity = Math.min(copy.envMapIntensity, 1.15);
    copy.userData.applianceInstanceMaterial = true;
    copies.set(material, copy);
    return copy;
  };
  root.traverse(item => {
    if (!(item instanceof THREE.Mesh)) return;
    item.material = Array.isArray(item.material)
      ? item.material.map(convert)
      : convert(item.material);
  });
}

export function makeWashingMachine(finish: ApplianceFinish = 'silver'): THREE.Group {
  return buildWashingMachine(applianceMaterials(), finish).group;
}
export function makeDishwasher(finish: ApplianceFinish = 'silver'): THREE.Group {
  return buildDishwasher(applianceMaterials(), finish).group;
}
/** Fit original CAD units to a physical width/height/depth, preserving the
 * source model's geometry/materials and orienting the front toward the room.
 * The resulting group origin is the center at floor/front depending on align. */
export function fitAppliance(
  model: THREE.Group, size: { w: number; h: number; d: number },
  frontFacing: number, align: 'floor' | 'center' = 'floor',
): THREE.Group {
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const dims = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const xScale = size.w / Math.max(0.01, dims.x);
  const yScale = size.h / Math.max(0.01, dims.y);
  const zScale = size.d / Math.max(0.01, dims.z);
  // Never distort the user's original models! One uniform scale preserves
  // proportions of handles, burner circles and refrigerator details.
  const scale = Math.min(xScale, yScale, zScale);
  model.position.set(-center.x, align === 'floor' ? -bounds.min.y : -center.y, -center.z);
  const holder = new THREE.Group();
  holder.add(model);
  // Reflect along Z rather than rotating 180° around Y: the right-hand side
  // of a refrigerator must stay on the user's chosen right side.
  holder.scale.set(scale, scale, frontFacing >= 0 ? scale : -scale);
  return holder;
}
