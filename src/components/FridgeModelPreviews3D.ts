import * as THREE from 'three';
import { makeFridge } from '../cad/applianceModels';
import { FRIDGE_MODEL_ORDER } from '../cad/constants';
import type { FridgeModel } from '../cad/types';

/**
 * Small 250x250 JPEG thumbnails rendered from the actual bundled refrigerator
 * source models. Lazy: no model is created until the picker is opened.
 * Render one at a time and release the auxiliary WebGL renderer afterward.
 */
type Listener = (model: FridgeModel, jpeg: string) => void;
const previews = new Map<FridgeModel, string>();
const listeners = new Set<Listener>();
let running = false;
const storageKey = (id: FridgeModel) => 'kitchyar-fridge-photo-v1:' + id;

function publish(id: FridgeModel, jpeg: string) {
  previews.set(id, jpeg);
  for (const cb of listeners) cb(id, jpeg);
}
function idle(): Promise<void> {
  return new Promise(resolve => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(() => resolve(), { timeout: 500 });
    else setTimeout(resolve, 32);
  });
}
async function generate(): Promise<void> {
  if (running || !listeners.size) return;
  running = true;
  let renderer: THREE.WebGLRenderer | null = null;
  try {
    for (const id of FRIDGE_MODEL_ORDER) {
      if (!listeners.size) break;
      if (previews.has(id)) continue;
      let cached: string | null = null;
      try { cached = window.localStorage.getItem(storageKey(id)); } catch { /* private mode */ }
      if (cached?.startsWith('data:image/jpeg;')) { publish(id, cached); continue; }
      await idle();
      if (!listeners.size) break;
      if (!renderer) {
        renderer = new THREE.WebGLRenderer({
          canvas: document.createElement('canvas'),
          alpha: false,
          antialias: true,
          preserveDrawingBuffer: true,
          powerPreference: 'low-power',
        });
        renderer.setPixelRatio(1);
        renderer.setSize(250, 250, false);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.35;
      }
      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#e9ecef');
      scene.add(new THREE.AmbientLight(0xffffff, 1.75));
      const key = new THREE.DirectionalLight(0xffffff, 2.5);
      key.position.set(-2.5, 4.0, 5.0);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xffffff, 1.2);
      fill.position.set(3, 3, -2);
      scene.add(fill);
      const model = makeFridge(id);
      scene.add(model);
      model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const viewSize = Math.max(size.y * 1.15, size.x * 1.6, size.z * 1.8, 1);
      const half = viewSize / 2;
      const camera = new THREE.OrthographicCamera(-half, half, half, -half, .01, 200);
      // A front three-quarter view keeps model-specific front doors/handles visible.
      camera.position.copy(center).add(new THREE.Vector3(size.x * .90, size.y * .43, size.z * 2.7));
      camera.lookAt(center);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      const jpeg = renderer.domElement.toDataURL('image/jpeg', .68);
      publish(id, jpeg);
      try { window.localStorage.setItem(storageKey(id), jpeg); } catch { /* quota */ }
      model.traverse(child => {
        if (child instanceof THREE.Mesh) child.geometry?.dispose();
      });
    }
  } catch {
    // No second context under WebXR or software GL: keep text fallback.
  } finally {
    renderer?.dispose();
    running = false;
  }
}
export function subscribeFridgePreviews(cb: Listener): () => void {
  listeners.add(cb);
  for (const [id, jpeg] of previews) cb(id, jpeg);
  void generate();
  return () => { listeners.delete(cb); };
}
