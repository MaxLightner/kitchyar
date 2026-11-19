import * as THREE from 'three';
import type { FloorPoint } from './floorPolygon';
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
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.castShadow = true;
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
    followCamera(camera: THREE.Camera) {
      followPose(camera.getWorldPosition(cameraPosition), camera.getWorldQuaternion(cameraOrientation));
    },
    followXrPose(transform: XRRigidTransform) {
      cameraPosition.set(transform.position.x, transform.position.y, transform.position.z);
      cameraOrientation.set(transform.orientation.x, transform.orientation.y, transform.orientation.z, transform.orientation.w);
      followPose(cameraPosition, cameraOrientation);
    },
    dispose() {
      scene.remove(light, light.target);
      light.shadow.dispose();
      scene.environment = null;
      disposeEnvironment();
    },
  };
}

export function addKitchenSpot(
  parent: THREE.Group,
  origin: THREE.Vector3,
  target: THREE.Vector3,
  { color, intensity, range, angle }: {
    color: number; intensity: number; range: number; angle: number;
  },
) {
  const spot = new THREE.SpotLight(color, intensity, range, angle, 0.88, 2);
  spot.position.copy(origin);
  spot.target.position.copy(target);
  parent.add(spot, spot.target);
}

export function addCeilingFillLights(parent: THREE.Group, outline: FloorPoint[], heightM: number) {
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
    addKitchenSpot(parent, new THREE.Vector3(x, heightM - 0.05, z), new THREE.Vector3(x, 0, z),
      { color: 0xfff4e4, intensity: 0.35, range: 5, angle: 0.9 });
  }
}
