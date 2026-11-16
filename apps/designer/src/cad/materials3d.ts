import * as THREE from 'three';
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

  // Subtle ambient sheen spot
  const hGrad = ctx.createRadialGradient(size * 0.38, size * 0.3, size * 0.06, size * 0.5, size * 0.5, size * 0.82);
  hGrad.addColorStop(0, 'rgba(255,255,255,0.20)');
  hGrad.addColorStop(0.65, 'rgba(255,255,255,0)');
  hGrad.addColorStop(1, 'rgba(15,23,42,0.12)');
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

export interface KitchenMaterialPack {
  matCarcass: THREE.MeshStandardMaterial;
  matPlinth: THREE.MeshStandardMaterial;
  matCountertop: THREE.MeshStandardMaterial;
  matDoorRevealDark: THREE.MeshStandardMaterial;
  matBacksplashBase: THREE.MeshStandardMaterial;
  backsplashColorMap: THREE.CanvasTexture;
  backsplashNormalMap: THREE.CanvasTexture;
  createBacksplashSpanMaterial: (wCm: number, hCm: number) => THREE.MeshStandardMaterial;
  getCabinetBodyMaterial: (finishId: CabinetFinishId) => THREE.MeshStandardMaterial;
  getDoorMaterial: (
    finishId: CabinetFinishId,
    doorStyle: DoorStyle,
    isClosed: boolean,
    isSelected: boolean
  ) => THREE.MeshStandardMaterial;
  getDoorEdgeMaterial: (
    finishId: CabinetFinishId,
    isClosed: boolean,
    isSelected: boolean
  ) => THREE.MeshStandardMaterial;
  getDoorInnerCncMaterial: (finishId: CabinetFinishId, isSelected: boolean) => THREE.MeshStandardMaterial;
}

export function createKitchenMaterialPack(project: ProjectState): KitchenMaterialPack {
  const defaultCabFinish: CabinetFinishId = project.cabinetFinish || 'warm-white';
  const defaultCabCfg = CABINET_FINISHES[defaultCabFinish] || CABINET_FINISHES['warm-white'];
  const bsFinish: BacksplashFinishId = project.backsplashFinish || 'calacatta-marble';
  const ctFinish: CountertopFinishId = project.countertopFinish || 'dark-quartz';

  const bevelNormal = createDoorBevelNormalMap(10);

  const matCarcass = new THREE.MeshStandardMaterial({
    color: defaultCabCfg.id === 'warm-white' ? 0xe9e4dc : new THREE.Color(defaultCabCfg.hexDark).getHex(),
    roughness: 0.65,
    metalness: 0.04,
  });

  const matPlinth = new THREE.MeshStandardMaterial({
    color: defaultCabCfg.id === 'charcoal' || defaultCabCfg.id === 'navy-matte' ? 0x1e293b : 0x334155,
    roughness: 0.55,
    metalness: 0.15,
  });

  const ctTex = createCountertopTexture(ctFinish);
  ctTex.repeat.set(3, 1);
  const matCountertop = new THREE.MeshPhysicalMaterial({
    map: ctTex,
    roughness: ctFinish === 'concrete-grey' ? 0.55 : ctFinish === 'oak-butcher' ? 0.46 : 0.2,
    metalness: 0.04,
    clearcoat: ctFinish === 'oak-butcher' ? 0.23 : 0.55,
    clearcoatRoughness: 0.17,
    envMapIntensity: 1.3,
  });

  // Dark recessed reveal shadow liner visible in the 4mm seams between closed doors
  const matDoorRevealDark = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.9,
    metalness: 0.02,
  });

  const bsTex = createBacksplashTextures(bsFinish);
  const matBacksplashBase = new THREE.MeshPhysicalMaterial({
    map: bsTex.map,
    normalMap: bsTex.normalMap,
    normalScale: new THREE.Vector2(0.45, 0.45),
    roughness: bsFinish === 'subway-white' || bsFinish === 'calacatta-marble' ? 0.2 : 0.34,
    metalness: 0.025,
    clearcoat: 0.65,
    clearcoatRoughness: 0.16,
    envMapIntensity: 1.45,
  });

  const bodyCache = new Map<CabinetFinishId, THREE.MeshStandardMaterial>();
  const doorCache = new Map<string, THREE.MeshStandardMaterial>();
  const innerCncCache = new Map<string, THREE.MeshStandardMaterial>();

  const getCabinetBodyMaterial = (finishId: CabinetFinishId) => {
    const existing = bodyCache.get(finishId);
    if (existing) return existing;
    const cfg = CABINET_FINISHES[finishId] || defaultCabCfg;
    const mat = new THREE.MeshPhysicalMaterial({
      color: cfg.id === 'warm-white' ? 0xeae5dd : cfg.hexDark,
      roughness: Math.min(0.67, cfg.roughness + 0.04),
      metalness: 0.025,
      clearcoat: 0.25,
      clearcoatRoughness: 0.31,
      envMapIntensity: 1.25,
    });
    bodyCache.set(finishId, mat);
    return mat;
  };

  const getDoorMaterial = (
    finishId: CabinetFinishId,
    doorStyle: DoorStyle,
    isClosed: boolean,
    isSelected: boolean
  ) => {
    const key = `${finishId}|${doorStyle}|${isClosed ? 1 : 0}|${isSelected ? 1 : 0}`;
    const existing = doorCache.get(key);
    if (existing) return existing;

    const cfg = CABINET_FINISHES[finishId] || defaultCabCfg;
    const tex = createDoorGradientTexture(
      cfg.hex,
      cfg.hexDark,
      cfg.edgeHex,
      Boolean(cfg.woodGrain),
      isClosed,
      isSelected
    );
    const mat = new THREE.MeshPhysicalMaterial({
      map: tex,
      normalMap: bevelNormal,
      normalScale: new THREE.Vector2(isClosed ? 0.72 : 0.45, isClosed ? 0.72 : 0.45),
      roughness: doorStyle === 'cnc' ? Math.min(0.62, cfg.roughness + 0.09) : cfg.roughness,
      metalness: 0.025,
      clearcoat: doorStyle === 'glass' || doorStyle === 'glass-grid' ? 0.66 : 0.3,
      clearcoatRoughness: 0.24,
      envMapIntensity: 1.35,
    });
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
    const mapClone = bsTex.map.clone();
    mapClone.needsUpdate = true;
    mapClone.repeat.set(Math.max(0.5, wCm / 60), Math.max(0.4, hCm / 60));
    const nrmClone = bsTex.normalMap.clone();
    nrmClone.needsUpdate = true;
    nrmClone.repeat.set(Math.max(0.5, wCm / 60), Math.max(0.4, hCm / 60));
    return new THREE.MeshPhysicalMaterial({
      map: mapClone,
      normalMap: nrmClone,
      normalScale: new THREE.Vector2(0.48, 0.48),
      roughness: bsFinish === 'subway-white' || bsFinish === 'calacatta-marble' ? 0.2 : 0.34,
      metalness: 0.025,
      clearcoat: 0.65,
      clearcoatRoughness: 0.16,
      envMapIntensity: 1.45,
    });
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
