import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

export function loadKitchenEnvironment(
  renderer: THREE.WebGLRenderer,
  apply: (target: THREE.WebGLRenderTarget) => void,
) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  let active: THREE.WebGLRenderTarget | null = null;
  let disposed = false;
  new HDRLoader().load(import.meta.env.BASE_URL + 'assets/materials/kitchen-studio.hdr', hdr => {
    try {
      if (disposed) return;
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      active = pmrem.fromEquirectangular(hdr);
      apply(active);
    } finally {
      hdr.dispose();
    }
  }, undefined, error => {
    if (!disposed) console.warn('[Kitchyar] Could not load the project HDRI', error);
  });
  return () => {
    disposed = true;
    active?.dispose();
    pmrem.dispose();
  };
}

/** Keep HDRI reflections while reducing its contribution to diffuse room lighting. */
export function limitKitchenHdrIrradiance(material: THREE.MeshStandardMaterial) {
  material.customProgramCacheKey = () => 'kitchen-hdr-irradiance';
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_maps>', `
      #include <lights_fragment_maps>
      #if defined( USE_ENVMAP ) && defined( RE_IndirectDiffuse )
        iblIrradiance *= 0.035;
      #endif
    `);
  };
}
