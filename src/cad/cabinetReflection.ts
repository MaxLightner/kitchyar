import * as THREE from 'three';

/** Capture nearby virtual surfaces once per settled edit. The XR camera feed is not sampled. */
export function createCabinetReflectionProbe(renderer: THREE.WebGLRenderer, scene: THREE.Scene, onReady: () => void) {
  const target = new THREE.WebGLCubeRenderTarget(64, {
    type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter,
  });
  const camera = new THREE.CubeCamera(0.12, 28, target);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const materialsFor = (root: THREE.Object3D) => {
    const mats = new Set<THREE.MeshStandardMaterial>();
    root.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      for (const mat of Array.isArray(node.material) ? node.material : [node.material]) {
        if (mat.userData.cabinetReflection && mat.envMapIntensity > 0) mats.add(mat as THREE.MeshStandardMaterial);
      }
    });
    return mats;
  };

  return {
    schedule(root: THREE.Object3D, position: THREE.Vector3) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!root.parent || !root.visible || renderer.xr.isPresenting) return;
        const mats = materialsFor(root);
        if (!mats.size) return;
        const maps = new Map([...mats].map(mat => [mat, mat.envMap]));
        camera.position.copy(position);
        let captured = false;
        const oldTarget = renderer.getRenderTarget();
        const xrEnabled = renderer.xr.enabled;
        try {
          for (const mat of mats) { mat.envMap = null; mat.needsUpdate = true; }
          camera.update(renderer, scene);
          captured = true;
        } catch {
          // Drivers without a usable cubemap framebuffer retain the studio environment.
        } finally {
          renderer.setRenderTarget(oldTarget);
          renderer.xr.enabled = xrEnabled;
          for (const mat of mats) {
            mat.envMap = captured ? target.texture : maps.get(mat) ?? null;
            mat.needsUpdate = true;
          }
        }
        onReady();
      }, 320);
    },
    dispose() { clearTimeout(timer); target.dispose(); },
  };
}
