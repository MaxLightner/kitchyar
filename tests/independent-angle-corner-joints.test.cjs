const test=require('node:test'),assert=require('node:assert/strict');
const G=()=>import('../apps/preview/geometry.js');

for(const angle of [20,45,90,135]){
 test('two independently placed base runs make one valid corner joint at '+angle+' degrees',async()=>{
  const geo=await G(),rad=angle*Math.PI/180;
  let r=geo.placeWall([],{x:0,z:0},{x:4,z:0});
  r=geo.placeWall(r.items,{x:4,z:0},{x:4+4*Math.cos(rad),z:4*Math.sin(rad)});
  const [a,b]=r.items.filter(w=>w.kind==='wall');
  r=geo.placeCabinetRoute(r.items,{x:.2,z:0,hostId:a.id,side:1},
   {x:3.8,z:0,hostId:a.id,side:1},{kind:'base',depth:.6});
  assert.equal(r.items.filter(o=>o.kind==='cabinet').length,1);
  const starting={x:4+.18*Math.cos(rad),z:.18*Math.sin(rad),hostId:b.id,side:1};
  const ending={x:4+3.8*Math.cos(rad),z:3.8*Math.sin(rad),hostId:b.id,side:1};
  r=geo.placeCabinetRoute(r.items,starting,ending,{kind:'base',depth:.6});
  const joins=r.items.filter(o=>o.kind==='corner'),cabinetIds=new Set(r.items.filter(o=>o.kind==='cabinet'&&o.subtype==='base').map(o=>o.id));
  assert.equal(joins.length,1,'separate compatible runs must snap into one connected corner');
  assert.ok(cabinetIds.has(joins[0].aCabinetId)&&cabinetIds.has(joins[0].bCabinetId));
  const footprint=geo.cornerFillFootprint(r.items,joins[0]);
  assert.ok(footprint&&footprint.corners.length>=4);
  assert.ok(footprint.corners.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)));
  const area=Math.abs(footprint.corners.reduce((total,p,i)=>{
   const q=footprint.corners[(i+1)%footprint.corners.length];
   return total+p.x*q.z-q.x*p.z;
  },0))/2;
  assert.ok(area>.0005,'corner join must have a real countertop footprint');
 });
}
