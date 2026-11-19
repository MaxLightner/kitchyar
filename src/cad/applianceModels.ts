import * as THREE from 'three';
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
import type { CooktopModelId, FridgeModelId, HoodModelId } from '../hoods/catalog';
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
  switch (model) {
    case 'hob-steel-5-right': return buildHobSteel5Right(mats);
    case 'hob-steel-5-center': return buildHobSteel5Center(mats);
    case 'hob-steel-3': return buildHobSteel3(mats);
    case 'hob-domino-2': return buildHobDomino2(mats);
    case 'hob-ceramic-4': return buildHobCeramic4(mats);
    case 'hob-induction-4': return buildHobInduction4(mats);
    default: return buildHobGlass5(mats);
  }
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
  const dimensions = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  // A flat front and original mesh positions, no "replacement" primitives.
  model.position.set(-center.x,
    align === 'floor' ? -bounds.min.y : -center.y,
    -bounds.max.z);
  const holder = new THREE.Group();
  holder.add(model);
  holder.scale.set(
    size.w / Math.max(0.01, dimensions.x),
    size.h / Math.max(0.01, dimensions.y),
    size.d / Math.max(0.01, dimensions.z));
  if (frontFacing < 0) holder.rotation.y = Math.PI;
  return holder;
}
