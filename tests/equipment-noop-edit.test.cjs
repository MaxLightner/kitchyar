const test=require('node:test');
const assert=require('node:assert/strict');

test('confirming unchanged equipment dimensions preserves every cabinet, front and device ID',async()=>{
 const G=await import('../apps/preview/geometry.js');
 for(const type of ['fridge','stove','sink','dishwasher']){
  let items=G.placeWall([],{x:0,z:0},{x:5.5,z:0}).items;
  items=G.placeCabinet(items,{x:.2,z:0,side:1},{x:5.3,z:0},{kind:'base',side:1}).items;
  const host=items.find(c=>c.kind==='cabinet');
  items=G.placeFrontLayout(items,host.id,'smart').items;
  const placed=G.placeEquipment(items,{x:2.7,z:.35},type);
  const e=placed.items.find(o=>o.id===placed.selectedId);
  const saved=structuredClone(placed.items);
  const confirmation=G.editEquipment(placed.items,e.id,{width:e.width,depth:e.depth,height:e.height});
  assert.deepEqual(confirmation.items,saved,type+' unchanged edit must preserve entire project');
  assert.equal(confirmation.selectedId,e.id);
  if(type==='fridge'){
   const changed=G.editEquipment(saved,e.id,{model:'side'});
   assert.equal(changed.items.find(o=>o.id===e.id).model,'side');
  }
  if(type==='stove'){
   const changed=G.editEquipment(saved,e.id,{induction:true});
   assert.equal(changed.items.find(o=>o.id===e.id).induction,true);
  }
 }
});
