import type { CabinetBox, CabinetLighting, CabinetLightMode, ProjectState } from './types';

export function getCabinetLighting(box: CabinetBox): CabinetLighting {
  const mode = box.lighting?.mode;
  const intensity = box.lighting?.intensity;
  return {
    mode: mode === 'linear' || mode === 'halogen' || mode === 'off'
      ? mode : box.underCabinetLight ? 'linear' : 'off',
    intensity: typeof intensity === 'number' && Number.isFinite(intensity)
      ? Math.max(0.1, Math.min(1, intensity)) : 1,
  };
}

export function getKitchenCabinetLightMode(project: ProjectState): CabinetLightMode {
  const saved = project.settings?.underCabinetLightMode;
  if (saved === 'off' || saved === 'linear' || saved === 'halogen') return saved;
  const modes = project.walls.flatMap(wall => wall.boxes)
    .filter(box => box.type === 'wall' || box.type === 'wall-deep')
    .map(box => getCabinetLighting(box).mode);
  if (modes.includes('linear')) return 'linear';
  if (modes.includes('halogen')) return 'halogen';
  return 'off';
}
