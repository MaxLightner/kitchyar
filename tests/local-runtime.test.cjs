const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'../apps/preview');
test('startup and optional SSR import closures are same-origin and complete',()=>{
 const seen=new Set();
 function visit(file){
  if(seen.has(file))return;seen.add(file);
  const source=fs.readFileSync(file,'utf8');
  const refs=[...source.matchAll(/^import[\s\S]*?from\s*['"]([^'"]+)['"]/gm),...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)];
  for(const match of refs){
   const ref=match[1];assert.ok(ref==='three'||ref.startsWith('.'),`external runtime import: ${ref}`);
   const target=ref==='three'?path.join(root,'vendor/chido/vendor/three.module.js'):path.resolve(path.dirname(file),ref.split('?')[0]);
   assert.ok(target.startsWith(root+path.sep),`escaped site root: ${ref}`);visit(target);
  }
 }
 visit(path.join(root,'bootstrap.js'));
 for(const name of ['EffectComposer','RenderPass','SSRPass','OutputPass'])visit(path.join(root,'vendor/three-addons/postprocessing',name+'.js'));
 assert.ok(seen.has(path.join(root,'vendor/chido/vendor/three.core.js')));
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.equal(JSON.parse(html.match(/<script type="importmap">(.*?)<\/script>/)[1]).imports.three,'./vendor/chido/vendor/three.module.js');
 assert.doesNotMatch(fs.readFileSync(path.join(root,'floor-ar.js'),'utf8'),/https:\/\/cdn\./);
});
test('vendored scanner and graphics runtime retain the original pinned Git blobs',()=>{
 const blobs={
  'surfaces.js':'a46ba605171bd1a9afd1c6a9986112e18ae47095',
  'xr.js':'ec14dd66d92034a66bd6f1ec151232ec0873d84a',
  'anchor-rig.js':'dcc22c05b9f269bfca194a827ca172e5063a8f3f',
  'vendor/three.module.js':'477ca4dafa7af919a2b9818e01b5ae25198d4aa4',
  'vendor/three.core.js':'7dcd0fbcbc04b8d9a20ecb96c1ce344cb55150d5',
  'vendor/GLTFLoader.js':'d82db2b57d02c7de1d479b6f53e11d6d5501b5e9',
  'vendor/BufferGeometryUtils.js':'0f0c0583091c11181390c01710f20a03060ce3a4',
  'vendor/THREE-LICENSE.txt':'cf781430404b0ae0ba7d8dea3457a3515dd7c9b9'
 };
 for(const [file,sha] of Object.entries(blobs)){
  const bytes=fs.readFileSync(path.join(root,'vendor/chido',file));
  assert.equal(crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),sha,file);
 }
});
