const test=require('node:test');
const assert=require('node:assert/strict');

test('plan facade hit regions stay selectable above sinks and appliances, without blocking their centres',async()=>{
 const G=await import('../apps/preview/geometry.js');
 const P=await import('../apps/preview/plan-view.js');
 let r=G.placeWall([],{x:0,z:0},{x:4,z:0});
 r=G.placeCabinet(r.items,{x:.2,z:0},{x:3.8,z:0});
 const cabinet=r.items.find(c=>c.kind==='cabinet');
 r=G.placeFrontLayout(r.items,cabinet.id,'doors');
 const front=r.items.find(f=>f.kind==='front');
 r=G.placeEquipment(r.items,{x:1.6,z:.3},'sink');
 const sink=r.items.find(e=>e.kind==='equipment'&&e.subtype==='sink');
 assert.ok(sink&&front);
 const rendered=P.renderPlan(r.items,{showCalibration:false});
 const sinkPos=rendered.indexOf('<g data-item-id="'+sink.id+'"');
 const selectionPos=rendered.lastIndexOf('class="front-selection-hit" data-item-id="'+front.id+'"');
 assert.ok(sinkPos>=0&&selectionPos>sinkPos,'facade target must render after the appliance');
 assert.match(rendered.slice(selectionPos,selectionPos+400),/pointer-events="stroke"/);
 assert.doesNotMatch(P.renderPlan(r.items,{mini:true}),/front-selection-hit/);
 assert.doesNotMatch(P.renderPlan(r.items,{hideFronts:true}),/front-selection-hit/);
 assert.doesNotMatch(P.renderPlan(r.items,{drawing:{tool:'base',start:null}}),/front-selection-hit/);
});
