import type { ProjectSettings } from './types';

export const SURFACES = [
  { label: 'کابینت', reflection: 'cabinetReflection', roughness: 'cabinetRoughness', strength: 1, spread: 0.30 },
  { label: 'صفحهٔ کابینت', reflection: 'countertopReflection', roughness: 'countertopRoughness', strength: 1, spread: 0.24 },
  { label: 'کاشی بین‌کابینتی', reflection: 'backsplashReflection', roughness: 'backsplashRoughness', strength: 1, spread: 0.26 },
  { label: 'کف', reflection: 'floorReflection', roughness: 'floorRoughness', strength: 0.28, spread: 0.36 },
] as const;

export function readSurfaceFinish(settings: ProjectSettings | undefined, index: number, defaultSpread?: number) {
  const cfg = SURFACES[index];
  const value = settings?.[cfg.reflection];
  const roughness = settings?.[cfg.roughness];
  const strength = Math.min(2, Math.max(0, typeof value === 'number' && Number.isFinite(value) ? value : cfg.strength));
  const spread = Math.min(0.9, Math.max(0.09, typeof roughness === 'number' && Number.isFinite(roughness) ? roughness : defaultSpread ?? cfg.spread));
  return {
    roughness: spread,
    ior: 1.65,
    specularIntensity: Math.min(1, strength * 0.95),
    clearcoat: Math.min(1, strength * 0.78),
    clearcoatRoughness: spread,
    envMapIntensity: 1.45 + strength * 0.95,
  };
}
