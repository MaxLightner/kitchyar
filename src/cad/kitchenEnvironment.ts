import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export function bakeKitchenEnvironment(pmrem: THREE.PMREMGenerator) {
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
