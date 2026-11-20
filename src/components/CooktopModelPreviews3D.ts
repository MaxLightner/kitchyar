import * as THREE from 'three';
import { makeCooktop } from '../cad/applianceModels';
import type { CooktopModel } from '../cad/types';

/** 250px JPEG previews from the actual procedural gas/induction models.
 * Generated lazily, cached, and rendered one at a time after idle; the
 * main kitchen scene and its WebGL renderer are never replaced. */
type Listener = (model: CooktopModel, image: string) => void;
const ids: CooktopModel[] = [
  'hob-glass-5', 'hob-steel-5-right', 'hob-steel-5-center', 'hob-steel-3',
  'hob-domino-2', 'hob-ceramic-4', 'hob-induction-4',
];
const listeners = new Set<Listener>();
const previews = new Map<CooktopModel, string>();
let running = false;
const cacheKey = (id: CooktopModel) => 'kitchyar-cooktop-250-v1:' + id;
function pauseUntilIdle(): Promise<void> {
  return new Promise(resolve => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(() => resolve(), { timeout: 400 });
    else setTimeout(resolve, 25);
  });
}
function publish(id: CooktopModel, jpeg: string) {
  previews.set(id, jpeg);
  for (const listener of listeners) listener(id, jpeg);
}
async function generate() {
  if (running || !listeners.size) return;
  running = true;
  let renderer: THREE.WebGLRenderer | null = null;
  try {
    for (const id of ids) {
      if (!listeners.size) break;
      if (previews.has(id)) continue;
      let stored: string | null = null;
      try { stored = window.localStorage.getItem(cacheKey(id)); } catch { /* private mode */ }
      if (stored?.startsWith('data:image/jpeg;')) { publish(id, stored); continue; }
      await pauseUntilIdle();
      if (!listeners.size) break;
      if (!renderer) {
        renderer = new THREE.WebGLRenderer({
          canvas: document.createElement('canvas'), antialias: true,
          alpha: false, preserveDrawingBuffer: true, powerPreference: 'low-power',
        });
        renderer.setPixelRatio(1);
        renderer.setSize(250, 250, false);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.25;
      }
      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#e9edf1');
      scene.add(new THREE.AmbientLight(0xffffff, 1.8));
      const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
      keyLight.position.set(-2, 5, 4);
      scene.add(keyLight);
      const fillLight = new THREE.DirectionalLight(0xffffff, 1.1);
      fillLight.position.set(4, 3, -2);
      scene.add(fillLight);
      const result = makeCooktop(id);
      result.setLit(false);
      const mesh = result.group;
      scene.add(mesh);
      mesh.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(mesh);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const viewSize = Math.max(size.x * 1.25, size.z * 1.5, size.y * 2.5, 0.82);
      const half = viewSize * 0.67;
      const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, 100);
      camera.position.copy(center).add(new THREE.Vector3(viewSize * 0.32, viewSize * 1.4, viewSize * 0.62));
      camera.lookAt(center);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      const jpeg = renderer.domElement.toDataURL('image/jpeg', 0.76);
      publish(id, jpeg);
      try { window.localStorage.setItem(cacheKey(id), jpeg); } catch { /* quota */ }
      const geos = new Set<THREE.BufferGeometry>();
      mesh.traverse(child => { if (child instanceof THREE.Mesh) geos.add(child.geometry); });
      geos.forEach(geo => geo.dispose());
    }
  } catch {
    // WebXR or low-memory browser may block a second renderer; SVG fallback remains.
  } finally {
    renderer?.dispose();
    running = false;
  }
}
export function subscribeCooktopPreviews(listener: Listener): () => void {
  listeners.add(listener);
  for (const [id, preview] of previews) listener(id, preview);
  void generate();
  return () => { listeners.delete(listener); };
}
