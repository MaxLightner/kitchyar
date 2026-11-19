import * as THREE from 'three';

export const KITCHEN_EXPOSURE = 0.96;

export function configureKitchenRenderer(renderer: THREE.WebGLRenderer, software: boolean) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = KITCHEN_EXPOSURE;
  renderer.shadowMap.enabled = !software;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}

export function addKitchenLighting(scene: THREE.Scene) {
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
    },
  };
}
