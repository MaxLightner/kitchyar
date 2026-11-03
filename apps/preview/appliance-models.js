import {GLTFLoader} from 'https://cdn.jsdelivr.net/gh/MaxLightner/tolica-ar@0abbab05c15eed4f3922d1e1dc74b5c17b82e8be/vendor/GLTFLoader.js';

// Visual-only library: appliance dimensions, placement, cutouts and solver data
// remain in geometry.js. Assets are loaded lazily and shared between instances.
const paths=Object.freeze({
 gas5:'gas5.glb',fridge:'fridge-side.glb',oven:'oven.glb',
 microwave:'microwave.glb',sink:'sink-double.glb',faucet:'faucet.glb'
});
const cache=new Map(),loading=new Map(),waiting=new Map(),failed=new Set();
const loader=new GLTFLoader();

export function getApplianceTemplate(key,onLoaded){
 if(cache.has(key))return cache.get(key);
 if(failed.has(key)||!paths[key])return null;
 if(onLoaded){
  if(!waiting.has(key))waiting.set(key,new Set());
  waiting.get(key).add(onLoaded);
 }
 if(!loading.has(key)){
  const url=new URL('./assets/models/appliances/'+paths[key],import.meta.url).href;
  loading.set(key,loader.loadAsync(url).then(({scene})=>{
   cache.set(key,scene);
   for(const callback of waiting.get(key)||[])callback();
   waiting.delete(key);
  }).catch(error=>{
   failed.add(key);waiting.delete(key);
   console.warn('Kitchyar appliance model unavailable; keeping procedural fallback:',key,error);
  }).finally(()=>loading.delete(key)));
 }
 return null;
}

export function fitApplianceModel(THREE,template,o,key){
 const group=template.clone(true);
 group.traverse(part=>{
  if(!part.isMesh)return;
  // Each visual has its own disposable mesh/material; texture bitmaps stay cached.
  part.geometry=part.geometry.clone();
  if(key==='gas5'&&part.geometry.index){
   // The source Gas mesh carries a small disconnected raised plate (~70 cm).
   // Keep the actual 5-burner cooktop instead of flattening that plate into it.
   const pos=part.geometry.getAttribute('position'),indices=part.geometry.index,kept=[];
   for(let i=0;i<indices.count;i+=3){
    const a=indices.getX(i),b=indices.getX(i+1),c=indices.getX(i+2);
    if(Math.max(pos.getY(a),pos.getY(b),pos.getY(c))<.08)kept.push(a,b,c);
   }
   if(kept.length>1000){part.geometry.setIndex(kept);part.geometry.computeBoundingBox();}
  }
  part.material=Array.isArray(part.material)?part.material.map(m=>m.clone()):part.material.clone();
  part.castShadow=true;part.receiveShadow=true;part.userData.objectId=o.id;
  for(const mat of Array.isArray(part.material)?part.material:[part.material]){
   if(!mat.isMeshStandardMaterial&&!mat.isMeshPhysicalMaterial)continue;
   mat.envMapIntensity=1.25;
   if(key==='fridge'){
    mat.metalness=Math.max(.85,mat.metalness??0);
    mat.roughness=.36;mat.ior=9;
   }else if(key==='gas5')mat.roughness=Math.max(.23,mat.roughness??0);
   else mat.roughness=Math.max(.19,mat.roughness??0);
  }
  if(key==='sink'){
   for(const mat of Array.isArray(part.material)?part.material:[part.material]){
    if(o.sinkFinish==='black'){mat.color.setHex(0x171c1d);mat.metalness=.45;mat.roughness=.18;}
    else if(o.sinkFinish==='ceramic'){mat.color.setHex(0xf4f1e8);mat.metalness=0;mat.roughness=.25;}
   }
  }
 });
 group.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(group);
 if(key==='faucet'||key==='gas5'){
  // Source geometry may retain unused sink vertices or disconnected stove parts.
  // Fit using indexed, actually rendered triangles.
  bounds.makeEmpty();
  const vertex=new THREE.Vector3();
  group.traverse(part=>{
   if(!part.isMesh||!part.geometry.index)return;
   const positions=part.geometry.getAttribute('position'),indices=part.geometry.index;
   for(let i=0;i<indices.count;i++){
    vertex.fromBufferAttribute(positions,indices.getX(i)).applyMatrix4(part.matrixWorld);
    bounds.expandByPoint(vertex);
   }
  });
 }
 const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
 if(key==='faucet'){
  const scale=Math.min(1.1,.34/Math.max(.001,size.y));
  group.scale.setScalar(scale);
  group.position.set(-center.x*scale,0,-o.depth*.39-center.z*scale);
 }else if(key==='sink'){
  // The source sink includes deep bowls and an elevated faucet. Deck at Y=0.
  const sx=o.width/Math.max(.001,size.x),sz=o.depth/Math.max(.001,size.z);
  group.scale.set(sx,Math.min(sx,sz),sz);
  group.position.set(-center.x*sx,0,-center.z*sz);
 }else if(key==='gas5'){
  const sx=Math.max(.1,o.width-.012)/Math.max(.001,size.x);
  const sz=Math.max(.1,o.depth-.012)/Math.max(.001,size.z);
  const sy=Math.min(sx,sz);
  group.scale.set(sx,sy,sz);
  group.position.set(-center.x*sx,-bounds.min.y*sy,-center.z*sz);
 }else{
  // Preserve the authored proportions: no independent X/Y/Z stretching.
  const scale=Math.min(
   Math.max(.1,o.width-.012)/Math.max(.001,size.x),
   Math.max(.1,o.height-.008)/Math.max(.001,size.y),
   Math.max(.1,o.depth-.012)/Math.max(.001,size.z)
  );
  group.scale.setScalar(scale);
  const bottom=key==='fridge'?0:(o.height-size.y*scale)/2;
  group.position.set(-center.x*scale,bottom-bounds.min.y*scale,o.depth/2-bounds.max.z*scale);
 }
 return group;
}
