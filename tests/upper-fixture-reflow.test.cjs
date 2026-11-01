const test=require('node:test');
const assert=require('node:assert/strict');

test('moving a stove reflows only aligned upper fronts, preserving the other wall',async()=>{
 const Geo=await import('../apps/preview/geometry.js');
 const walls=[
  {id:'wall-a',kind:'wall',x1:0,z1:0,x2:4,z2:0,height:2.8,thickness:.15},
  {id:'wall-b',kind:'wall',x1:0,z1:4,x2:4,z2:4,height:2.8,thickness:.15}
 ];
 let items=walls;
 const add=(wall,kind)=>{
  const z=wall==='wall-a'?0:4;
  const placed=Geo.placeCabinet(items,{x:.3,z,hostId:wall,side:1},{x:3.7,z},{kind,side:1});
  items=placed.items;
  if(kind==='upper')items=Geo.placeFrontLayout(items,placed.selectedId,'smart').items;
  return placed.selectedId;
 };
 add('wall-a','base');const upperId=add('wall-a','upper');
 add('wall-b','base');const remoteId=add('wall-b','upper');
 const before=JSON.stringify(items.filter(x=>x.kind==='front'&&x.hostId===remoteId));
 let p=Geo.placeEquipment(items,{x:1.05,z:.2},'stove');items=p.items;
 const stoveId=p.selectedId;
 const first=items.filter(x=>x.kind==='front'&&x.hostId===upperId).map(x=>[x.startT,x.endT]);
 assert.ok(first.length>0);
 p=Geo.moveEquipment(items,stoveId,{x:2.85,z:.2});items=p.items;
 const second=items.filter(x=>x.kind==='front'&&x.hostId===upperId).map(x=>[x.startT,x.endT]);
 assert.notDeepEqual(second,first,'aligned upper doors should follow new stove location');
 assert.equal(JSON.stringify(items.filter(x=>x.kind==='front'&&x.hostId===remoteId)),before);
 assert.equal(items.filter(x=>x.kind==='equipment'&&x.subtype==='hood')[0].linkedStoveId,stoveId);
});
