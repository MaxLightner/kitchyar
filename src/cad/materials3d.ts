import type { CabinetBox, CabinetTextureId } from './types';
import * as THREE from 'three';
import { readSurfaceFinish } from './surfaceFinish';
import {
  BACKSPLASH_FINISHES,
  CABINET_FINISHES,
  COUNTERTOP_FINISHES,
} from './constants';
import {
  BacksplashFinishId,
  CabinetFinishId,
  CountertopFinishId,
  DoorStyle,
  ProjectState,
} from './types';

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function mixHex(hexA: string, hexB: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(hexA);
  const [r2, g2, b2] = hexToRgb(hexB);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r},${g},${b})`;
}

/**
 * Generates a soft studio gradient + subtle perimeter edge-darkening albedo CanvasTexture
 * so closed cabinet doors clearly separate along their edges even in light matte finishes.
 */
function createDoorGradientTexture(
  hexLight: string,
  hexDark: string,
  edgeHex: string,
  woodGrain: boolean,
  isClosed: boolean,
  isSelected: boolean
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const topCol = isSelected ? '#eef2ff' : hexLight;
  const botCol = isSelected ? '#c7d2fe' : hexDark;

  // Soft vertical studio falloff + subtle diagonal tonal depth
  const vGrad = ctx.createLinearGradient(0, 0, size * 0.25, size);
  vGrad.addColorStop(0, mixHex(topCol, '#ffffff', 0.08));
  vGrad.addColorStop(0.45, mixHex(topCol, botCol, 0.36));
  vGrad.addColorStop(1, mixHex(botCol, '#0f172a', 0.05));
  ctx.fillStyle = vGrad;
  ctx.fillRect(0, 0, size, size);

  // Subtle directional sheen gradient (kept restrained so 3D key/fill & HDRI drive real contrast)
  const hGrad = ctx.createRadialGradient(size * 0.38, size * 0.3, size * 0.06, size * 0.5, size * 0.5, size * 0.82);
  hGrad.addColorStop(0, 'rgba(255,255,255,0.06)');
  hGrad.addColorStop(0.65, 'rgba(255,255,255,0)');
  hGrad.addColorStop(1, 'rgba(15,23,42,0.15)');
  ctx.fillStyle = hGrad;
  ctx.fillRect(0, 0, size, size);

  // Architectural wood grain lines for oak & walnut
  if (woodGrain) {
    ctx.strokeStyle = 'rgba(42,24,10,0.16)';
    ctx.lineWidth = 1.4;
    for (let x = 4; x < size; x += 6) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      const wave = Math.sin(x * 0.19) * 3.5;
      ctx.bezierCurveTo(x + wave, size * 0.33, x - wave, size * 0.66, x + (x % 3) - 1, size);
      ctx.stroke();
    }
  }

  // Keep front panel bright & true to finish; add only a crisp hairline perimeter seam when closed so doors separate clearly
  ctx.globalAlpha = isClosed ? 0.72 : 0.22;
  ctx.strokeStyle = isSelected ? '#4338ca' : '#1e293b';
  ctx.lineWidth = isClosed ? 2.2 : 1.2;
  ctx.strokeRect(1, 1, size - 2, size - 2);
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Generates a subtle 4-sided perimeter chamfer / pillow bevel normal map
 * so studio key/fill lights catch crisp specular edge highlights on each door panel.
 */
function createDoorBevelNormalMap(insetBorderPx = 10): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const d = img.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let nx = 0;
      let ny = 0;
      let nz = 1;

      const distL = x;
      const distR = size - 1 - x;
      const distT = y;
      const distB = size - 1 - y;

      if (distL < insetBorderPx) nx -= (1 - distL / insetBorderPx) * 0.42;
      if (distR < insetBorderPx) nx += (1 - distR / insetBorderPx) * 0.42;
      if (distT < insetBorderPx) ny += (1 - distT / insetBorderPx) * 0.42;
      if (distB < insetBorderPx) ny -= (1 - distB / insetBorderPx) * 0.42;

      // Subtle micro pillow curvature across the middle
      const cx = (x / size - 0.5) * 0.08;
      const cy = (0.5 - y / size) * 0.08;
      nx += cx;
      ny += cy;

      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;

      const idx = (y * size + x) * 4;
      d[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      d[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      d[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  // Normal map stays linear (THREE.NoColorSpace)
  return tex;
}

function createBacksplashTextures(finishId: BacksplashFinishId): {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
} {
  const cfg = BACKSPLASH_FINISHES[finishId] || BACKSPLASH_FINISHES['calacatta-marble'];
  const size = 256;
  const colCanvas = document.createElement('canvas');
  colCanvas.width = size;
  colCanvas.height = size;
  const ctx = colCanvas.getContext('2d')!;

  const nrmCanvas = document.createElement('canvas');
  nrmCanvas.width = size;
  nrmCanvas.height = size;
  const nCtx = nrmCanvas.getContext('2d')!;
  nCtx.fillStyle = 'rgb(128,128,255)';
  nCtx.fillRect(0, 0, size, size);

  ctx.fillStyle = cfg.baseHex;
  ctx.fillRect(0, 0, size, size);

  if (cfg.pattern === 'marble') {
    // Organic Calacatta grey/taupe veining + 2x2 large-format tile grout grid
    ctx.strokeStyle = '#94a3b8';
    ctx.globalAlpha = 0.44;
    for (let i = 0; i < 8; i++) {
      ctx.lineWidth = 1.6 + (i % 3) * 1.1;
      ctx.beginPath();
      const y0 = (i * 34) % size;
      ctx.moveTo(0, y0);
      ctx.bezierCurveTo(size * 0.28, y0 + 28, size * 0.68, y0 - 26, size, (y0 + 38) % size);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = cfg.groutHex;
    ctx.lineWidth = 4;
    ctx.strokeRect(1.5, 1.5, size - 3, size - 3);
    ctx.beginPath();
    ctx.moveTo(size / 2, 0);
    ctx.lineTo(size / 2, size);
    ctx.moveTo(0, size / 2);
    ctx.lineTo(size, size / 2);
    ctx.stroke();

    nCtx.strokeStyle = 'rgb(96,96,190)';
    nCtx.lineWidth = 5;
    nCtx.strokeRect(2, 2, size - 4, size - 4);
    nCtx.beginPath();
    nCtx.moveTo(size / 2, 0);
    nCtx.lineTo(size / 2, size);
    nCtx.moveTo(0, size / 2);
    nCtx.lineTo(size, size / 2);
    nCtx.stroke();
  } else if (cfg.pattern === 'subway') {
    const rows = 4;
    const cols = 2;
    const rowH = size / rows;
    const tileW = size / cols;
    ctx.strokeStyle = cfg.groutHex;
    ctx.lineWidth = 3;
    nCtx.strokeStyle = 'rgb(100,100,205)';
    nCtx.lineWidth = 4;
    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      const offset = r % 2 === 1 ? tileW * 0.5 : 0;
      ctx.fillStyle = r % 2 === 0 ? cfg.baseHex : mixHex(cfg.baseHex, cfg.accentHex, 0.22);
      ctx.fillRect(0, y, size, rowH);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
      nCtx.beginPath();
      nCtx.moveTo(0, y);
      nCtx.lineTo(size, y);
      nCtx.stroke();
      for (let c = -1; c <= cols; c++) {
        const x = c * tileW + offset;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x, y + rowH);
        ctx.stroke();
        nCtx.beginPath();
        nCtx.moveTo(x, y);
        nCtx.lineTo(x, y + rowH);
        nCtx.stroke();
      }
    }
  } else if (cfg.pattern === 'travertine') {
    const rows = 3;
    const rowH = size / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      ctx.fillStyle = mixHex(cfg.baseHex, cfg.accentHex, (r % 2) * 0.35);
      ctx.fillRect(0, y, size, rowH);
      ctx.fillStyle = 'rgba(130,110,85,0.12)';
      for (let i = 0; i < 16; i++) {
        ctx.fillRect((i * 31 + r * 19) % size, y + ((i * 11) % (rowH - 4)), 14, 2);
      }
    }
    ctx.strokeStyle = cfg.groutHex;
    ctx.lineWidth = 3;
    for (let r = 0; r < rows; r++) {
      ctx.strokeRect(0, r * rowH, size, rowH);
      nCtx.strokeStyle = 'rgb(112,112,215)';
      nCtx.lineWidth = 3;
      nCtx.strokeRect(0, r * rowH, size, rowH);
    }
  } else if (cfg.pattern === 'hex') {
    const r = 24;
    const dx = r * 1.5;
    const dy = r * Math.sqrt(3);
    ctx.strokeStyle = cfg.groutHex;
    ctx.lineWidth = 2.6;
    nCtx.strokeStyle = 'rgb(104,104,205)';
    nCtx.lineWidth = 3;
    for (let col = -1; col < 10; col++) {
      for (let row = -1; row < 10; row++) {
        const cx = col * dx;
        const cy = row * dy + (col % 2 === 0 ? 0 : dy / 2);
        const shade = ((col + row) % 3) * 0.14;
        ctx.fillStyle = mixHex(cfg.baseHex, cfg.accentHex, shade);
        ctx.beginPath();
        nCtx.beginPath();
        for (let k = 0; k < 6; k++) {
          const ang = (Math.PI / 3) * k;
          const px = cx + (r - 1.2) * Math.cos(ang);
          const py = cy + (r - 1.2) * Math.sin(ang);
          if (k === 0) {
            ctx.moveTo(px, py);
            nCtx.moveTo(px, py);
          } else {
            ctx.lineTo(px, py);
            nCtx.lineTo(px, py);
          }
        }
        ctx.closePath();
        nCtx.closePath();
        ctx.fill();
        ctx.stroke();
        nCtx.stroke();
      }
    }
  } else if (cfg.pattern === 'terrazzo') {
    const chips = [cfg.accentHex, '#cbd5e1', '#94a3b8', '#ffffff', '#64748b'];
    for (let i = 0; i < 120; i++) {
      ctx.fillStyle = chips[i % chips.length];
      const cx = (i * 53 + 17) % size;
      const cy = (i * 97 + 29) % size;
      const rw = 4 + (i % 9);
      const rh = 3 + ((i * 3) % 7);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(i * 0.7);
      ctx.fillRect(-rw / 2, -rh / 2, rw, rh);
      ctx.restore();
    }
    ctx.strokeStyle = cfg.groutHex;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(1, 1, size - 2, size - 2);
  } else {
    // herringbone
    const step = 32;
    ctx.strokeStyle = cfg.groutHex;
    ctx.lineWidth = 2.5;
    nCtx.strokeStyle = 'rgb(100,100,205)';
    nCtx.lineWidth = 3;
    for (let y = -size; y < size * 2; y += step) {
      for (let x = -size; x < size * 2; x += step * 2) {
        ctx.fillStyle = ((x + y) / step) % 2 === 0 ? cfg.baseHex : cfg.accentHex;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + step, y + step);
        ctx.lineTo(x + step * 2, y);
        ctx.lineTo(x + step, y - step);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        nCtx.strokeRect(x, y, step, step);
      }
    }
  }

  // Fine relief on each tile face, preserving existing grout normals.
  const relief = nCtx.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    const nx = Math.sin(x * 1.19 + y * 0.31) * 9 + Math.sin(y * 2.13) * 6;
    const ny = Math.cos(y * 1.41 - x * 0.27) * 9 + Math.sin(x * 1.83) * 6;
    relief.data[i] = Math.max(0, Math.min(255, relief.data[i] + nx));
    relief.data[i + 1] = Math.max(0, Math.min(255, relief.data[i + 1] + ny));
  }
  nCtx.putImageData(relief, 0, 0);
  const map = new THREE.CanvasTexture(colCanvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;

  const normalMap = new THREE.CanvasTexture(nrmCanvas);
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;

  return { map, normalMap };
}

function createCountertopTexture(finishId: CountertopFinishId): THREE.CanvasTexture {
  const cfg = COUNTERTOP_FINISHES[finishId] || COUNTERTOP_FINISHES['dark-quartz'];
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = cfg.hex;
  ctx.fillRect(0, 0, size, size);

  if (finishId === 'oak-butcher') {
    ctx.strokeStyle = cfg.veinHex;
    ctx.globalAlpha = 0.28;
    ctx.lineWidth = 2;
    for (let y = 8; y < size; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = cfg.veinHex;
    ctx.globalAlpha = finishId === 'calacatta-top' ? 0.42 : 0.25;
    for (let i = 0; i < 8; i++) {
      ctx.lineWidth = 1 + (i % 3) * 0.8;
      ctx.beginPath();
      const y = (i * 34) % size;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(size * 0.35, y + 18, size * 0.7, y - 16, size, (y + 24) % size);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

type CabinetAppearance = Pick<CabinetBox, 'color' | 'texture' | 'reflection' | 'roughness'>;

const WOOD_MAP: Partial<Record<CabinetTextureId, string>> = {
  oak: 'cabinet-oak.jpg', walnut: 'cabinet-walnut.jpg',
};

function createSatinMap(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  const pixels = ctx.createImageData(96, 96);
  let seed = 109;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const v = 238 + (seed >>> 28);
    pixels.data.set([v, v, v, 255], i);
  }
  ctx.putImageData(pixels, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const finishSwatches = new Map<string, string>();
const backsplashTextures = new Map<BacksplashFinishId, ReturnType<typeof createBacksplashTextures>>();
const countertopTextures = new Map<CountertopFinishId, THREE.CanvasTexture>();
let doorBevelTexture: THREE.CanvasTexture | undefined;
let cabinetOcclusionTexture: THREE.CanvasTexture | undefined;
let equipmentEdgeNormalTexture: THREE.CanvasTexture | undefined;

export function isSharedKitchenTexture(texture: THREE.Texture) {
  return texture.userData.sharedKitchenTexture === true;
}

function shareKitchenTexture<T extends THREE.Texture>(texture: T): T {
  texture.userData.sharedKitchenTexture = true;
  return texture;
}

/** Clean edge bevel normal, like cabinet doors but stronger; no noisy or pixelated grain. */
export function getEquipmentEdgeNormalMap(): THREE.CanvasTexture {
  if (!equipmentEdgeNormalTexture) {
    equipmentEdgeNormalTexture = shareKitchenTexture(createDoorBevelNormalMap(12));
  }
  return equipmentEdgeNormalTexture;
}

function getCabinetOcclusionTexture() {
  if (cabinetOcclusionTexture) return cabinetOcclusionTexture;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const edge = Math.min(x, y, size - 1 - x, size - 1 - y);
      const shadow = Math.max(0, 1 - edge / 10);
      const value = Math.round(255 * (1 - 0.22 * shadow * shadow));
      image.data.set([value, value, value, 255], (y * size + x) * 4);
    }
  }
  ctx.putImageData(image, 0, 0);
  cabinetOcclusionTexture = shareKitchenTexture(new THREE.CanvasTexture(canvas));
  return cabinetOcclusionTexture;
}

export function getFinishSwatch(kind: 'cabinet' | 'countertop' | 'backsplash', id: string) {
  if (kind === 'cabinet') {
    const filename = id === 'natural-oak' ? WOOD_MAP.oak : id === 'walnut' ? WOOD_MAP.walnut : null;
    return filename ? import.meta.env.BASE_URL + 'assets/materials/' + filename : undefined;
  }
  const key = kind + ':' + id;
  const cached = finishSwatches.get(key);
  if (cached) return cached;
  const texture = kind === 'countertop' ? createCountertopTexture(id as CountertopFinishId) : null;
  const tile = kind === 'backsplash' ? createBacksplashTextures(id as BacksplashFinishId) : null;
  const map = texture ?? tile?.map;
  if (!map) return undefined;
  const result = (map.image as HTMLCanvasElement).toDataURL();
  map.dispose();
  tile?.normalMap.dispose();
  finishSwatches.set(key, result);
  return result;
}

export interface KitchenMaterialPack {
  matCarcass: THREE.MeshStandardMaterial;
  matCabinetBack: THREE.MeshStandardMaterial;
  matPlinth: THREE.MeshStandardMaterial;
  matCountertop: THREE.MeshStandardMaterial;
  matDoorRevealDark: THREE.MeshStandardMaterial;
  matBacksplashBase: THREE.MeshStandardMaterial;
  backsplashColorMap: THREE.CanvasTexture;
  backsplashNormalMap: THREE.CanvasTexture;
  createBacksplashSpanMaterial: (wCm: number, hCm: number) => THREE.MeshStandardMaterial;
  getCabinetBodyMaterial: (finishId: CabinetFinishId, appearance?: CabinetAppearance) => THREE.MeshStandardMaterial;
  getDoorMaterial: (
    finishId: CabinetFinishId,
    doorStyle: DoorStyle,
    isClosed: boolean,
    isSelected: boolean,
    appearance?: CabinetAppearance
  ) => THREE.MeshStandardMaterial;
  getDoorEdgeMaterial: (
    finishId: CabinetFinishId,
    isClosed: boolean,
    isSelected: boolean
  ) => THREE.MeshStandardMaterial;
  getDoorInnerCncMaterial: (finishId: CabinetFinishId, isSelected: boolean) => THREE.MeshStandardMaterial;
}

export function createKitchenMaterialPack(project: ProjectState, onTextureReady?: () => void): KitchenMaterialPack {
  const settings = project.settings;
  const textures = new Map<CabinetTextureId, THREE.Texture>();
  const getSurface = (finish: CabinetFinishId, appearance?: CabinetAppearance) => {
    const id = appearance?.texture ?? (finish === 'natural-oak' ? 'oak' : finish === 'walnut' ? 'walnut' : project.cabinetTexture ?? 'smooth');
    const cfg = CABINET_FINISHES[finish] ?? CABINET_FINISHES['warm-white'];
    if (id === 'smooth') return { color: appearance?.color ?? cfg.hex, map: null, id };
    let map = textures.get(id);
    if (!map) {
      const url = WOOD_MAP[id];
      const loader = new THREE.TextureLoader();
      map = url ? loader.load(import.meta.env.BASE_URL + 'assets/materials/' + url,
        () => onTextureReady?.(), undefined, () => {
          // Windows / local dev without the offline JPEG encoder still display
          // the original WebP rather than a missing/black cabinet texture.
          if (!url.endsWith('.jpg') || !map) return;
          loader.load(import.meta.env.BASE_URL + 'assets/materials/' + url.replace(/\.jpg$/, '.webp'),
            fallback => { if (!map) return; map.image = fallback.image; map.needsUpdate = true; onTextureReady?.(); });
        }) : createSatinMap();
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 4;
      textures.set(id, map);
    }
    return { color: appearance?.color ?? (WOOD_MAP[id] ? '#ffffff' : cfg.hex), map, id };
  };
  const defaultCabFinish: CabinetFinishId = project.cabinetFinish || 'warm-white';
  const defaultCabCfg = CABINET_FINISHES[defaultCabFinish] || CABINET_FINISHES['warm-white'];
  const bsFinish: BacksplashFinishId = project.backsplashFinish || 'calacatta-marble';
  const ctFinish: CountertopFinishId = project.countertopFinish || 'dark-quartz';

  // The legacy bevel normal map only remains in use for equipment.
  // Cabinet doors now use dimension-aware fragment normals without a texture.

  // The cavity texture darkens the base color even with direct lighting only.
  const insideAoMap = project.settings?.ambientOcclusion !== false ? getCabinetOcclusionTexture() : null;
  const matCarcass = new THREE.MeshStandardMaterial({ color: 0xd6dbe0, roughness: 0.68, map: insideAoMap });
  const matCabinetBack = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72, map: insideAoMap });

  const matPlinth = new THREE.MeshStandardMaterial({
    color: defaultCabCfg.id === 'charcoal' || defaultCabCfg.id === 'navy-matte' ? 0x1e293b : 0x334155,
    roughness: 0.55,
    metalness: 0.15,
  });

  let ctTex = countertopTextures.get(ctFinish);
  if (!ctTex) {
    ctTex = shareKitchenTexture(createCountertopTexture(ctFinish));
    ctTex.repeat.set(3, 1);
    countertopTextures.set(ctFinish, ctTex);
  }
  const matCountertop = new THREE.MeshPhysicalMaterial({
    map: ctTex,
    ...readSurfaceFinish(settings, 1, ctFinish === 'concrete-grey' ? 0.54 : ctFinish === 'oak-butcher' ? 0.44 : 0.21),
  });
  matCountertop.userData.sceneReflection = true;

  // Dark recessed reveal shadow liner visible in the 4mm seams between closed doors
  const matDoorRevealDark = new THREE.MeshStandardMaterial({
    color: 0x121214,
    roughness: 0.9,
    metalness: 0.02,
  });

  let bsTex = backsplashTextures.get(bsFinish);
  if (!bsTex) {
    bsTex = createBacksplashTextures(bsFinish);
    shareKitchenTexture(bsTex.map);
    shareKitchenTexture(bsTex.normalMap);
    backsplashTextures.set(bsFinish, bsTex);
  }
  const { map: backsplashMap, normalMap: backsplashNormal } = bsTex;
  const matBacksplashBase = new THREE.MeshPhysicalMaterial({
    map: bsTex.map,
    normalMap: bsTex.normalMap,
    normalScale: new THREE.Vector2(0.82, 0.82),
    ...readSurfaceFinish(settings, 2, bsFinish === 'subway-white' || bsFinish === 'calacatta-marble' ? 0.22 : 0.32),
  });
  matBacksplashBase.userData.sceneReflection = true;

  const bodyCache = new Map<string, THREE.MeshStandardMaterial>();
  const doorCache = new Map<string, THREE.MeshStandardMaterial>();
  const innerCncCache = new Map<string, THREE.MeshStandardMaterial>();

  const getCabinetBodyMaterial = (finishId: CabinetFinishId, appearance?: CabinetAppearance) => {
    const surface = getSurface(finishId, appearance);
    const key = `${finishId}|${surface.id}|${surface.color}|${appearance?.reflection ?? ""}|${appearance?.roughness ?? ""}`;
    const existing = bodyCache.get(key);
    if (existing) return existing;
    const cfg = CABINET_FINISHES[finishId] || defaultCabCfg;
    const mat = new THREE.MeshPhysicalMaterial({
      color: surface.color,
      map: surface.map,
      ...readSurfaceFinish(settings, 0, Math.max(0.25, cfg.roughness * 0.78), appearance),
    });
    mat.userData.sceneReflection = true;
    bodyCache.set(key, mat);
    return mat;
  };

  const getDoorMaterial = (
    finishId: CabinetFinishId,
    doorStyle: DoorStyle,
    isClosed: boolean,
    isSelected: boolean,
    appearance?: CabinetAppearance
  ) => {
    const surface = getSurface(finishId, appearance);
    const key = `${finishId}|${doorStyle}|${isClosed ? 1 : 0}|${isSelected ? 1 : 0}|${surface.id}|${surface.color}|${appearance?.color ?? ''}|${appearance?.reflection ?? ''}|${appearance?.roughness ?? ''}`;
    const existing = doorCache.get(key);
    if (existing) return existing;

    const cfg = CABINET_FINISHES[finishId] || defaultCabCfg;
    const tex = surface.map ?? createDoorGradientTexture(
      appearance?.color ?? cfg.hex,
      appearance?.color ?? cfg.hexDark,
      cfg.edgeHex,
      Boolean(cfg.woodGrain),
      isClosed,
      isSelected
    );
    const mat = new THREE.MeshPhysicalMaterial({
      map: tex,
      color: surface.map ? surface.color : '#ffffff',
      // No cabinet-door normal texture; the flat 18mm panel geometry is unchanged.
      ...readSurfaceFinish(settings, 0, Math.max(0.20, cfg.roughness * 0.68 + (doorStyle === 'cnc' ? 0.06 : 0)), appearance),
    });
    mat.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
        attribute vec2 cabinetDoorSize;
        varying vec2 vCabinetDoorSize;
        varying vec2 vCabinetDoorUv;
        varying float vCabinetDoorFace;
        varying vec3 vCabinetDoorAxisX;
        varying vec3 vCabinetDoorAxisY;`);
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vCabinetDoorSize = cabinetDoorSize;
        vCabinetDoorUv = uv;
        vCabinetDoorFace = normal.z;
        vCabinetDoorAxisX = normalize(normalMatrix * vec3(1.0, 0.0, 0.0));
        vCabinetDoorAxisY = normalize(normalMatrix * vec3(0.0, 1.0, 0.0));`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
        varying vec2 vCabinetDoorSize;
        varying vec2 vCabinetDoorUv;
        varying float vCabinetDoorFace;
        varying vec3 vCabinetDoorAxisX;
        varying vec3 vCabinetDoorAxisY;`);
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        if (vCabinetDoorSize.x > 0.01 && abs(vCabinetDoorFace) > 0.9) {
          // Only a 5mm edge band, half of the previous edge slope.
          vec2 borderDistance = min(vCabinetDoorUv, 1.0 - vCabinetDoorUv) * vCabinetDoorSize;
          vec2 borderSlope = 0.21 * (1.0 - smoothstep(vec2(0.0), vec2(0.005), borderDistance));
          vec2 broadSlope = 0.15 * (vCabinetDoorUv * 2.0 - vec2(1.0));
          vec2 slope = broadSlope + sign(vCabinetDoorUv - vec2(0.5)) * borderSlope;
          vec3 slopeView = slope.x * vCabinetDoorAxisX + slope.y * vCabinetDoorAxisY;
          // MeshPhysicalMaterial has TWO specular normals: the base normal
          // and a separate CLEARCOAT normal. Before this fix the clearcoat
          // reflection stayed flat and hid the 5mm/broad normal modulation.
          normal = normalize(normal + slopeView);
          #ifdef USE_CLEARCOAT
          clearcoatNormal = normalize(clearcoatNormal + slopeView);
          #endif
        }`);
    };
    mat.customProgramCacheKey = () => 'door-fragment-normal-5mm-clearcoat-v2';
    mat.userData.sceneReflection = true;
    doorCache.set(key, mat);
    return mat;
  };

  const getDoorInnerCncMaterial = (finishId: CabinetFinishId, isSelected: boolean) => {
    const key = `${finishId}|${isSelected ? 1 : 0}`;
    const existing = innerCncCache.get(key);
    if (existing) return existing;
    const cfg = CABINET_FINISHES[finishId] || defaultCabCfg;
    const mat = new THREE.MeshStandardMaterial({
      color: isSelected ? '#c7d2fe' : cfg.hexDark,
      roughness: cfg.roughness + 0.16,
      metalness: 0.03,
    });
    innerCncCache.set(key, mat);
    return mat;
  };

  const createBacksplashSpanMaterial = (wCm: number, hCm: number) => {
    const mapClone = backsplashMap.clone();
    delete mapClone.userData.sharedKitchenTexture;
    mapClone.needsUpdate = true;
    mapClone.repeat.set(Math.max(0.5, wCm / 60), Math.max(0.4, hCm / 60));
    const nrmClone = backsplashNormal.clone();
    delete nrmClone.userData.sharedKitchenTexture;
    nrmClone.needsUpdate = true;
    nrmClone.repeat.set(Math.max(0.5, wCm / 60), Math.max(0.4, hCm / 60));
    const tile = new THREE.MeshPhysicalMaterial({
      map: mapClone,
      normalMap: nrmClone,
      normalScale: new THREE.Vector2(0.84, 0.84),
      ...readSurfaceFinish(settings, 2, bsFinish === 'subway-white' || bsFinish === 'calacatta-marble' ? 0.22 : 0.32),
    });
    tile.userData.sceneReflection = true;
    return tile;
  };

  const doorEdgeCache = new Map<string, THREE.MeshStandardMaterial>();
  const getDoorEdgeMaterial = (
    finishId: CabinetFinishId,
    isClosed: boolean,
    isSelected: boolean
  ) => {
    const key = `${finishId}|${isClosed ? 1 : 0}|${isSelected ? 1 : 0}`;
    const existing = doorEdgeCache.get(key);
    if (existing) return existing;
    const cfg = CABINET_FINISHES[finishId] || defaultCabCfg;
    const edgeColor = isSelected
      ? '#4338ca'
      : isClosed
        ? mixHex(cfg.hexDark, '#0f172a', 0.78)
        : cfg.hexDark;
    const mat = new THREE.MeshStandardMaterial({
      color: edgeColor,
      roughness: 0.72,
      metalness: 0.04,
    });
    doorEdgeCache.set(key, mat);
    return mat;
  };

  return {
    matCarcass,
    matCabinetBack,
    matPlinth,
    matCountertop,
    matDoorRevealDark,
    matBacksplashBase,
    backsplashColorMap: bsTex.map,
    backsplashNormalMap: bsTex.normalMap,
    createBacksplashSpanMaterial,
    getCabinetBodyMaterial,
    getDoorMaterial,
    getDoorEdgeMaterial,
    getDoorInnerCncMaterial,
  };
}
