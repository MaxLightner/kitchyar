import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SSRPass } from 'three/examples/jsm/postprocessing/SSRPass.js';

export function createKitchenReflections(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
  const size = new THREE.Vector2();
  renderer.getSize(size);
  const composer = new EffectComposer(renderer);
  const receivers: THREE.Mesh[] = [];
  const ssr = new SSRPass({ renderer, scene, camera, width: size.x, height: size.y, selects: receivers, groundReflector: null });
  ssr.opacity = 0.48;
  ssr.maxDistance = 5;
  ssr.thickness = 0.035;
  ssr.resolutionScale = 0.5;
  ssr.blur = true;
  ssr.bouncing = false;
  const output = new OutputPass();
  composer.addPass(ssr);
  composer.addPass(output);
  let width = 0;
  let height = 0;
  let pixelRatio = 0;

  return {
    render() {
      renderer.getSize(size);
      const ratio = renderer.getPixelRatio();
      if (width !== size.x || height !== size.y || pixelRatio !== ratio) {
        width = size.x; height = size.y; pixelRatio = ratio;
        composer.setPixelRatio(ratio);
        composer.setSize(width, height);
        ssr.ssrMaterial.defines.MAX_STEP = 48;
        ssr.ssrMaterial.needsUpdate = true;
      }
      receivers.length = 0;
      scene.traverseVisible(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        if (materials.some(material => material instanceof THREE.MeshStandardMaterial &&
            !material.transparent && material.userData.sceneReflection && material.roughness <= 0.95)) {
          receivers.push(object);
        }
      });
      ssr.ssrMaterial.uniforms.cameraNear.value = camera.near;
      ssr.ssrMaterial.uniforms.cameraFar.value = camera.far;
      ssr.ssrMaterial.uniforms.cameraProjectionMatrix.value.copy(camera.projectionMatrix);
      ssr.ssrMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(camera.projectionMatrixInverse);
      composer.render();
    },
    dispose() {
      ssr.dispose();
      ssr.ssrMaterial.dispose();
      output.dispose();
      composer.dispose();
    },
  };
}
