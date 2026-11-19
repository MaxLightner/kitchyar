import * as THREE from 'three';
import type { ProjectState } from './types';

export function kitchenReflectionKey(project: ProjectState) {
  return JSON.stringify([project.walls, project.columns, project.diningSets, project.doorsHidden,
    project.cabinetFinish, project.cabinetTexture, project.countertopFinish, project.backsplashFinish, project.settings]);
}

/** Capture virtual objects at rest. Camera motion and selection do not rebuild the environment. */
export function createCabinetReflectionProbe(renderer: THREE.WebGLRenderer, scene: THREE.Scene, onReady: () => void) {
  const target = new THREE.WebGLCubeRenderTarget(128, {
    type: THREE.HalfFloatType,
    depthBuffer: true,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  const camera = new THREE.CubeCamera(0.12, 24, target);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let current: { root: THREE.Object3D; position: THREE.Vector3; key: string } | undefined;
  let sky: THREE.Texture | undefined;
  let capturedKey: string | undefined;

  const apply = (root: THREE.Object3D, map: THREE.Texture | null) => {
    root.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (!(material instanceof THREE.MeshStandardMaterial) || !material.userData.sceneReflection ||
            material.envMap === map) continue;
        material.envMap = map;
        material.needsUpdate = true;
      }
    });
  };

  const queue = () => {
    clearTimeout(timer);
    if (!current || current.key === capturedKey) return;
    timer = setTimeout(() => {
      if (!current || renderer.xr.isPresenting || !current.root.parent) return;
      const { root, position, key } = current;
      const objects = new Set<THREE.Object3D>();
      root.traverse(node => objects.add(node));
      const hidden: THREE.Object3D[] = [];
      scene.traverseVisible(node => {
        if ((node instanceof THREE.Mesh && !objects.has(node)) || node instanceof THREE.Line || node instanceof THREE.Sprite) {
          hidden.push(node);
          node.visible = false;
        }
      });
      const background = scene.background;
      const fog = scene.fog;
      const previousTarget = renderer.getRenderTarget();
      const xrEnabled = renderer.xr.enabled;
      const shadowRefresh = renderer.shadowMap.needsUpdate;
      try {
        // Keep the HDR highlights behind objects in the probe. Avoid sampling the probe during capture.
        scene.background = sky ?? background;
        scene.fog = null;
        renderer.shadowMap.needsUpdate = false;
        apply(root, null);
        camera.position.copy(position);
        camera.update(renderer, scene);
        capturedKey = key;
      } catch {
        // Keep the studio environment on devices without a renderable cubemap.
        capturedKey = undefined;
      } finally {
        scene.background = background;
        scene.fog = fog;
        renderer.setRenderTarget(previousTarget);
        renderer.xr.enabled = xrEnabled;
        renderer.shadowMap.needsUpdate = shadowRefresh;
        for (const node of hidden) node.visible = true;
        apply(root, capturedKey === undefined ? null : target.texture);
      }
      onReady();
    }, 420);
  };

  return {
    schedule(root: THREE.Object3D, position: THREE.Vector3, key: string) {
      current = { root, position, key };
      if (capturedKey !== undefined) apply(root, target.texture);
      queue();
    },
    setSky(source: THREE.Texture) {
      sky = source;
      capturedKey = undefined;
      queue();
    },
    dispose() { clearTimeout(timer); target.dispose(); },
  };
}
