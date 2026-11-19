import * as THREE from 'three';
import type { FloorPoint } from './floorPolygon';
import type { ProjectSettings } from './types';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { loadKitchenEnvironment } from './kitchenEnvironment';

export const KITCHEN_EXPOSURE = 0.96;

export function configureKitchenRenderer(renderer: THREE.WebGLRenderer, software: boolean) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = KITCHEN_EXPOSURE;
  renderer.shadowMap.enabled = !software;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

export function addKitchenLighting(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  requestRender: () => void,
) {
  scene.environmentIntensity = 1;
  const disposeEnvironment = loadKitchenEnvironment(renderer, target => {
    scene.environment = target.texture;
    requestRender();
  });
  // Subtle baseline fill, independent of directional lighting and environment reflections.
  const ambient = new THREE.AmbientLight(0xffffff, 0.06);
  scene.add(ambient);
  const light = new THREE.DirectionalLight(0xffffff, 0.35);
  // Camera-follow light is pure fill: never allocate or cast a shadow map.
  light.castShadow = false;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.bias = -0.00035;
  light.shadow.normalBias = 0.015;
  Object.assign(light.shadow.camera, {
    left: -6, right: 6, top: 6, bottom: -6, near: 0.5, far: 22,
  });
  light.shadow.camera.updateProjectionMatrix();
  scene.add(light, light.target);

  const forward = new THREE.Vector3();
  const cameraPosition = new THREE.Vector3();
  const cameraOrientation = new THREE.Quaternion();

  const followPose = (position: THREE.Vector3, orientation: THREE.Quaternion) => {
    forward.set(0, 0, -1).applyQuaternion(orientation);
    light.target.position.copy(position).addScaledVector(forward, 4);
    light.position.copy(light.target.position).addScaledVector(forward, -8);
  };

  return {
    setIntensities(settings?: ProjectSettings) {
      scene.environmentIntensity = settings?.hdrIntensity ?? 2;
      light.intensity = settings?.cameraLightIntensity ?? 1;
      ambient.intensity = settings?.enableAmbientLight === false ? 0 : Math.max(0, settings?.ambientLightIntensity ?? 0.06);
    },
    followCamera(camera: THREE.Camera) {
      followPose(camera.getWorldPosition(cameraPosition), camera.getWorldQuaternion(cameraOrientation));
    },
    followXrPose(transform: XRRigidTransform) {
      cameraPosition.set(transform.position.x, transform.position.y, transform.position.z);
      cameraOrientation.set(transform.orientation.x, transform.orientation.y, transform.orientation.z, transform.orientation.w);
      followPose(cameraPosition, cameraOrientation);
    },
    dispose() {
      scene.remove(ambient, light, light.target);
      light.shadow.dispose();
      scene.environment = null;
      disposeEnvironment();
    },
  };
}

// Reusable physically inspired conical alpha beam: narrow intense hot-spot at
// the lamp, soft widening footprint below, plus a faint wall bounce.
// Entirely emissive/additive; no SpotLight, geometry change or shadow calculation.
let kitchenLightAlphaTexture: THREE.CanvasTexture | null = null;
function getKitchenLightAlphaTexture(): THREE.CanvasTexture {
  if (kitchenLightAlphaTexture) return kitchenLightAlphaTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const pixels = ctx.createImageData(canvas.width, canvas.height);
  for (let py = 0; py < canvas.height; py++) {
    const y = py / (canvas.height - 1); // 0 is the lamp, 1 is the floor
    const widen = 0.045 + 0.42 * Math.pow(y, 0.87);
    const envelope = Math.pow(1 - y, 0.6);
    for (let px = 0; px < canvas.width; px++) {
      const x = Math.abs((px + 0.5 - canvas.width / 2) / (canvas.width / 2));
      const cone = Math.exp(-Math.pow(x / widen, 2) * 1.6);
      const hotspot = Math.exp(-(x * x / 0.005 + y * y / 0.004));
      const bounce = Math.exp(-Math.pow(x / (widen * 1.35), 2) * 1.4) * 0.12;
      const alpha = Math.min(1, (0.82 * cone + bounce) * envelope + 0.65 * hotspot);
      const offset = (py * canvas.width + px) * 4;
      pixels.data[offset] = pixels.data[offset + 1] = pixels.data[offset + 2] = 255;
      pixels.data[offset + 3] = Math.round(alpha * 255);
    }
  }
  ctx.putImageData(pixels, 0, 0);
  kitchenLightAlphaTexture = new THREE.CanvasTexture(canvas);
  kitchenLightAlphaTexture.userData.sharedKitchenTexture = true;
  return kitchenLightAlphaTexture;
}

/** A cheap alpha spotlight decal in an XY plane, never an actual GPU light. */
export function addKitchenLightDecal(
  parent: THREE.Group, x: number, y: number, z: number,
  width: number, height: number, color = 0xffdfb6,
): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const material = new THREE.MeshBasicMaterial({
    map: getKitchenLightAlphaTexture(),
    color, transparent: true, opacity: 0,
    depthTest: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.position.set(x, y, z);
  mesh.frustumCulled = true;
  mesh.renderOrder = 1;
  parent.add(mesh);
  return mesh;
}

export function addKitchenSpot(
  parent: THREE.Group,
  origin: THREE.Vector3,
  target: THREE.Vector3,
  { color, intensity, range, angle }: {
    color: number; intensity: number; range: number; angle: number; ceilingFixture?: boolean;
  },
): THREE.SpotLight {
  // No emissive bulb, fixture geometry, shadow map, or per-light soft-shadow samples.
  // Regular Three.js SpotLights have no separate sample-count setting.
  const spot = new THREE.SpotLight(color, intensity, range, angle, 0.9, 2);
  spot.castShadow = false;
  spot.position.copy(origin);
  spot.target.position.copy(target);
  parent.add(spot, spot.target);
  return spot;
}

export function addCeilingFillLights(parent: THREE.Group, outline: FloorPoint[], heightM: number, intensity = 12): THREE.RectAreaLight[] {
  const lights: THREE.RectAreaLight[] = [];
  RectAreaLightUniformsLib.init();
  const floor = outline.length >= 3 ? outline : [
    { x: -200, y: -200 }, { x: 200, y: -200 }, { x: 200, y: 200 }, { x: -200, y: 200 },
  ];
  const xs = floor.map(p => p.x);
  const zs = floor.map(p => p.y);
  const alongX = Math.max(...xs) - Math.min(...xs) >= Math.max(...zs) - Math.min(...zs);
  const axis = alongX ? xs : zs;
  const other = alongX ? zs : xs;
  const min = Math.min(...axis);
  const max = Math.max(...axis);
  for (const fraction of [0.2, 0.5, 0.8]) {
    const across = min + (max - min) * fraction;
    const crossings: number[] = [];
    for (let i = 0; i < axis.length; i++) {
      const j = (i + 1) % axis.length;
      if ((axis[i] > across) === (axis[j] > across)) continue;
      crossings.push(other[i] + (other[j] - other[i]) * (across - axis[i]) / (axis[j] - axis[i]));
    }
    crossings.sort((a, b) => a - b);
    let middle = (Math.min(...other) + Math.max(...other)) / 2;
    let widest = 0;
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const width = crossings[i + 1] - crossings[i];
      if (width <= widest) continue;
      widest = width;
      middle = (crossings[i + 1] + crossings[i]) / 2;
    }
    const x = (alongX ? across : middle) * 0.01;
    const z = (alongX ? middle : across) * 0.01;
    const longSide = Math.max(0.30, Math.min(1.4, (max - min) * 0.01 * 0.19));
    const shortSide = Math.max(0.20, Math.min(0.8, widest * 0.01 * 0.26));
    const light = new THREE.RectAreaLight(0xfff4e4, intensity,
      alongX ? longSide : shortSide, alongX ? shortSide : longSide);
    // Position the ceiling fill a full meter above the project ceiling.
    light.position.set(x, heightM + 1, z);
    light.lookAt(x, 0, z);
    const diffuser = new THREE.Mesh(new THREE.PlaneGeometry(light.width, light.height),
      new THREE.MeshBasicMaterial({ color: 0xfff4e4, side: THREE.DoubleSide }));
    diffuser.position.copy(light.position);
    diffuser.quaternion.copy(light.quaternion);
    parent.add(light, diffuser);
    lights.push(light);
  }
  return lights;
}
