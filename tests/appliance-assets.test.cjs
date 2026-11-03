const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'../apps/preview/assets/models/appliances');
const assets={
 'gas5.glb':['Gas'],
 'fridge-side.glb':['Samsung'],
 'oven.glb':['Oven 1','Oven 1.001'],
 'microwave.glb':['Macro'],
 'sink-double.glb':['Sink1'],
 'faucet.glb':['Sink1']
};
function inspectGLB(name){
 const bytes=fs.readFileSync(path.join(root,name));
 assert.equal(bytes.toString('ascii',0,4),'glTF');
 assert.equal(bytes.readUInt32LE(4),2);
 assert.equal(bytes.readUInt32LE(8),bytes.length);
 const jsonSize=bytes.readUInt32LE(12);
 assert.equal(bytes.toString('ascii',16,20),'JSON');
 const doc=JSON.parse(bytes.toString('utf8',20,20+jsonSize));
 const offset=20+jsonSize;
 assert.equal(bytes.toString('ascii',offset+4,offset+7),'BIN');
 assert.equal(bytes.readUInt32LE(offset),bytes.length-offset-8);
 assert.equal(doc.buffers.length,1);
 assert.equal(doc.buffers[0].byteLength,bytes.length-offset-8);
 assert.ok(bytes.length<1_600_000,'mobile asset size should stay bounded');
 for(const image of doc.images||[]){
  assert.ok(Number.isInteger(image.bufferView),'images must be embedded');
  assert.ok(['image/jpeg','image/png'].includes(image.mimeType));
 }
 for(const mesh of doc.meshes){
  for(const p of mesh.primitives){
   const vertexCount=doc.accessors[p.attributes.POSITION].count;
   assert.ok(vertexCount>0);
   if(p.indices!==undefined){
    const indexAccessor=doc.accessors[p.indices];
    assert.equal(indexAccessor.count%3,0);
   }
  }
 }
 return doc;
}
test('user-provided appliance meshes are separated into valid compact GLBs',()=>{
 for(const [file,expected] of Object.entries(assets)){
  const doc=inspectGLB(file);
  assert.deepEqual(doc.meshes.map(m=>m.name),expected);
 }
});
test('the faucet extraction retains fewer indexed faces than the full sink',()=>{
 const sink=inspectGLB('sink-double.glb'),faucet=inspectGLB('faucet.glb');
 const count=doc=>doc.meshes[0].primitives.reduce((sum,p)=>sum+doc.accessors[p.indices].count,0);
 assert.ok(count(faucet)>0&&count(faucet)<count(sink));
});
