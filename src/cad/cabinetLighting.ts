import type { CabinetBox, CabinetLighting } from './types';

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
