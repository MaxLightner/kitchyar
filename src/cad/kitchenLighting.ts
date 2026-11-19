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
  const light = new THREE.DirectionalLight(0xffffff, 0.35);
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
    setIntensities(settings?: ProjectSettings) {
      scene.environmentIntensity = settings?.hdrIntensity ?? 1;
      light.intensity = settings?.cameraLightIntensity ?? 0.35;
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
  { color, intensity, range, angle, ceilingFixture = false }: {
    color: number; intensity: number; range: number; angle: number; ceilingFixture?: boolean;
  },
) {
  const spot = new THREE.SpotLight(color, intensity, range, angle, 0.88, 2);
  spot.position.copy(origin);
  spot.target.position.copy(target);
  parent.add(spot, spot.target);

  if (ceilingFixture) {
    const fixture = new THREE.Group();
    fixture.position.copy(origin);
    fixture.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), target.clone().sub(origin).normalize());
    const trim = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.058, 0.04, 16),
      new THREE.MeshStandardMaterial({ color: 0x333436, roughness: 0.48, metalness: 0.25 }));
    const diffuser = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.003, 16),
      new THREE.MeshBasicMaterial({ color }));
    diffuser.position.y = -0.022;
    fixture.add(trim, diffuser);
    parent.add(fixture);
  }
}

export function addCeilingFillLights(parent: THREE.Group, outline: FloorPoint[], heightM: number, intensity = 0.7) {
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
    light.position.set(x, heightM - 0.05, z);
    light.lookAt(x, 0, z);
    const diffuser = new THREE.Mesh(new THREE.PlaneGeometry(light.width, light.height),
      new THREE.MeshBasicMaterial({ color: 0xfff4e4, side: THREE.DoubleSide }));
    diffuser.position.copy(light.position);
    diffuser.quaternion.copy(light.quaternion);
    parent.add(light, diffuser);
  }
}
