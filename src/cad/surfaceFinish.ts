import type { ProjectSettings } from './types';

export const SURFACES = [
  { label: 'کابینت', reflection: 'cabinetReflection', roughness: 'cabinetRoughness', strength: 1, spread: 0.30 },
  { label: 'صفحهٔ کابینت', reflection: 'countertopReflection', roughness: 'countertopRoughness', strength: 1, spread: 0.24 },
  { label: 'کاشی بین‌کابینتی', reflection: 'backsplashReflection', roughness: 'backsplashRoughness', strength: 1, spread: 0.26 },
  { label: 'کف', reflection: 'floorReflection', roughness: 'floorRoughness', strength: 0.28, spread: 0.36 },
] as const;

export function readSurfaceFinish(
  settings: ProjectSettings | undefined, index: number, defaultSpread?: number,
  override?: { reflection?: number; roughness?: number },
) {
  const cfg = SURFACES[index];
  const value = override?.reflection ?? settings?.[cfg.reflection];
  const roughness = override?.roughness ?? settings?.[cfg.roughness];
  const strength = Math.min(2, Math.max(0, typeof value === 'number' && Number.isFinite(value) ? value : cfg.strength));
  const spread = Math.min(0.9, Math.max(0.05, typeof roughness === 'number' && Number.isFinite(roughness) ? roughness : defaultSpread ?? cfg.spread));
  return {
    roughness: spread,
    ior: index === 1 ? 1.72 : 1.65,
    specularIntensity: Math.min(1, 0.15 + strength * 0.42),
    clearcoat: Math.min(0.8, 0.08 + strength * 0.34),
    clearcoatRoughness: Math.max(0.12, spread * 0.95),
    envMapIntensity: 0.8 + strength * 0.85,
  };
}
