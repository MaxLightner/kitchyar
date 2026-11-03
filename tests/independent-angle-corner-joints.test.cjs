const test=require('node:test'),assert=require('node:assert/strict');
const G=()=>import('../apps/preview/geometry.js');

for(const angle of [20,45,90,135])for(const kind of ['base','upper'])for(const reverse of [false,true]){
 test('separate '+kind+' runs form one joint at '+angle+'° '+(reverse?'B → A':'A → B'),async()=>{
  const geo=await G(),rad=angle*Math.PI/180;
  let r=geo.placeWall([],{x:0,z:0},{x:4,z:0});
  r=geo.placeWall(r.items,{x:4,z:0},{x:4+4*Math.cos(rad),z:4*Math.sin(rad)});
  const [a,b]=r.items.filter(w=>w.kind==='wall');
  const firstStart={x:.2,z:0,hostId:a.id,side:1},firstEnd={x:3.8,z:0,hostId:a.id,side:1};
  const secondStart={x:4+.18*Math.cos(rad),z:.18*Math.sin(rad),hostId:b.id,side:1};
  const secondEnd={x:4+3.8*Math.cos(rad),z:3.8*Math.sin(rad),hostId:b.id,side:1};
  const routes=reverse?[[secondStart,secondEnd],[firstStart,firstEnd]]:
   [[firstStart,firstEnd],[secondStart,secondEnd]];
  for(const [start,end] of routes)r=geo.placeCabinetRoute(r.items,start,end,{kind,depth:kind==='upper'?.35:.6});
  assert.equal(r.items.filter(o=>o.kind==='cabinet'&&o.subtype===kind).length,2);
  const joins=r.items.filter(o=>o.kind==='corner'),cabinetIds=new Set(r.items.filter(o=>o.kind==='cabinet'&&o.subtype===kind).map(o=>o.id));
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
