import * as THREE from 'three';
import { makeSink } from '../cad/applianceModels';
import { SINK_MODEL_ORDER } from '../cad/constants';
import type { SinkModel } from '../cad/types';

/** 250x250 JPEGs of the ACTUAL source Three.js sink models, never invented
 * illustrated replacements. Generated only when the sink picker opens,
 * after first render, and cached locally. One temporary renderer for ALL
 * models; released immediately afterwards. The main 3D scene is untouched.
 */
type SinkPreviewListener = (id: SinkModel, jpeg: string) => void;
const previews = new Map<SinkModel,string>();
const listeners = new Set<SinkPreviewListener>();
let processing = false;

function notify(id: SinkModel, jpeg: string) {
  previews.set(id, jpeg);
  for (const listener of listeners) listener(id,jpeg);
}
function key(id: SinkModel):string { return 'kitchyar-sink-photo-v5:' + id; }
function localRead(id:SinkModel):string | null {
  try { const s=window.localStorage.getItem(key(id)); return s?.startsWith('data:image/jpeg;') ? s : null; }
  catch { return null; }
}
function localWrite(id:SinkModel,jpeg:string) {
  try { window.localStorage.setItem(key(id),jpeg); } catch { /* storage quota/private browsing */ }
}
function idlePause():Promise<void> {
  return new Promise(resolve => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(() => resolve(), {timeout:400});
    else setTimeout(resolve,24);
  });
}
async function generatePreviews() {
  if (processing) return;
  processing=true;
  let renderer:THREE.WebGLRenderer|null=null;
  try {
    for (const id of SINK_MODEL_ORDER) {
      if (!listeners.size) break;
      if (previews.has(id)) continue;
      const stored=localRead(id);
      if (stored) { notify(id,stored); continue; }
      await idlePause();
      if (!listeners.size) break;
      if (!renderer) {
        renderer=new THREE.WebGLRenderer({
          canvas:document.createElement('canvas'),
          alpha:false,antialias:true,preserveDrawingBuffer:true,powerPreference:'low-power',
        });
        renderer.setPixelRatio(1);
        renderer.setSize(250,250,false);
        renderer.outputColorSpace=THREE.SRGBColorSpace;
        renderer.toneMapping=THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure=1.3;
      }
      const scene=new THREE.Scene();
      scene.background=new THREE.Color('#e7eaed');
      scene.add(new THREE.AmbientLight(0xffffff,1.65));
      const key=new THREE.DirectionalLight(0xffffff,3);
      key.position.set(-1.5,3.5,2.8); scene.add(key);
      const fill=new THREE.DirectionalLight(0xddeaff,1.6);
      fill.position.set(3,1.8,-2); scene.add(fill);
      const mesh=makeSink(id);
      scene.add(mesh);
      mesh.updateMatrixWorld(true);
      const b=new THREE.Box3().setFromObject(mesh);
      const center=b.getCenter(new THREE.Vector3());
      const size=b.getSize(new THREE.Vector3());
      const extent=Math.max(size.x,size.z,size.y*2,.65);
      const half=extent*.75;
      const cam=new THREE.OrthographicCamera(-half,half,half,-half,.01,30);
      cam.position.copy(center).add(new THREE.Vector3(extent*.58,extent*1.13,extent*.82));
      cam.lookAt(center);
      cam.updateProjectionMatrix();
      renderer.render(scene,cam);
      const jpeg=renderer.domElement.toDataURL('image/jpeg',.78);
      notify(id,jpeg);
      localWrite(id,jpeg);
      // Dispose generated geometry only; the kitchen owns the shared materials.
      mesh.traverse(child=>{
        if (child instanceof THREE.Mesh) child.geometry?.dispose();
      });
    }
  } catch {
    // Software WebGL, context loss or AR compositing may prevent a secondary
    // renderer. Keep existing preview rather than compromising main scene.
  } finally {
    renderer?.dispose();
    processing=false;
  }
}
export function subscribeSinkPreviews(callback:SinkPreviewListener):()=>void {
  listeners.add(callback);
  for(const [id,jpeg] of previews) callback(id,jpeg);
  void generatePreviews();
  return () => { listeners.delete(callback); };
}
