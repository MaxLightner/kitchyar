import type { ApplianceItem, CooktopModel, EquipmentFinish, FridgeModel, ProjectState } from './types';
import { DEFAULT_PROJECT_SETTINGS } from './constants';

export function fridgeModelFinish(model?: FridgeModel): EquipmentFinish {
  if (model === 'fridge-instaview-black') return 'black';
  if (model === 'fridge-combi-white' || model === 'single') return 'white';
  return 'silver';
}

export function finishLabel(finish: EquipmentFinish): string {
  return finish === 'black' ? 'مشکی' : finish === 'white' ? 'سفید' : 'نقره‌ای';
}

/** Preserve the burner count by changing only existing five-burner model families. */
export function cooktopForFinish(current: CooktopModel | undefined, finish: EquipmentFinish): CooktopModel | undefined {
  if (finish === 'black' && (!current || current === 'hob-steel-5-center' || current === 'hob-steel-5-right')) {
    return 'hob-glass-5';
  }
  if (finish === 'silver' && current === 'hob-glass-5') return 'hob-steel-5-center';
  return current;
}
export function hoodForFinish(current: ApplianceItem['hoodModel'], finish: EquipmentFinish): ApplianceItem['hoodModel'] {
  if (finish === 'black' && (current === 'curved-steel' || current === 'chimney' || !current)) return 'curved-black';
  if (finish !== 'black' && (!current || current === 'chimney' ||
    current === 'curved-black' || current === 'angled-dual-black' ||
    current === 'pyramid-black' || current === 'framed-rounded-black')) return 'curved-steel';
  return current;
}

/** One-shot user-approved synchronization, without locking future individual edits. */
export function syncEquipmentFinishes(project: ProjectState, finish: EquipmentFinish): ProjectState {
  const next: ProjectState = structuredClone(project);
  const metallicFinish: EquipmentFinish = finish === 'white' ? 'silver' : finish;
  next.settings = { ...DEFAULT_PROJECT_SETTINGS, ...next.settings, equipmentFinish: finish };
  for (const wall of next.walls) for (const app of wall.appliances) {
    if (app.kind === 'washing' || app.kind === 'dishwasher') app.finish = finish;
    if (app.kind === 'sink') app.sinkFinish = metallicFinish;
    if (app.kind === 'gas') {
      app.finish = metallicFinish;
      app.hoodFinish = metallicFinish;
      app.cooktopModel = cooktopForFinish(app.cooktopModel, metallicFinish);
      app.hoodModel = hoodForFinish(app.hoodModel, metallicFinish);
    }
  }
  return next;
}
