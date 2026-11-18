import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

function bakeFallbackEnvironment(pmrem: THREE.PMREMGenerator) {
  const room = new RoomEnvironment();
  const geometry = new THREE.PlaneGeometry(1.1, 3.4);
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setRGB(7, 6.6, 6.0),
    side: THREE.DoubleSide, toneMapped: false,
  });
  // Broad paired windows give coated cabinetry a recognizable highlight in both camera modes.
  for (const x of [-1.1, 0.25]) {
    const panel = new THREE.Mesh(geometry, material);
    panel.position.set(x, 2.25, 4.25);
    room.add(panel);
  }
  const sidePanel = new THREE.Mesh(geometry, material);
  sidePanel.position.set(-3.5, 2.1, -0.8);
  sidePanel.rotation.y = Math.PI / 2;
  room.add(sidePanel);
  const result = pmrem.fromScene(room, 0.025);
  room.dispose();
  return result;
}

export function loadKitchenEnvironment(
  renderer: THREE.WebGLRenderer,
  apply: (target: THREE.WebGLRenderTarget, source?: THREE.Texture) => void,
) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  let active: THREE.WebGLRenderTarget | null = bakeFallbackEnvironment(pmrem);
  let source: THREE.Texture | null = null;
  apply(active);
  new HDRLoader().load(import.meta.env.BASE_URL + 'assets/materials/kitchen-studio.hdr', hdr => {
    if (active) {
      const previous = active;
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      active = pmrem.fromEquirectangular(hdr);
      source = hdr;
      apply(active, source);
      previous.dispose();
    } else hdr.dispose();
  }, undefined, () => {
    // Keep the window-light fallback if the HDR image is unavailable.
  });
  return () => {
    active?.dispose();
    source?.dispose();
    active = null;
    pmrem.dispose();
  };
}
