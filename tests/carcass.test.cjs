const test=require('node:test');
const assert=require('node:assert/strict');

const cabinet={id:'base1',kind:'cabinet',subtype:'base',x1:0,z1:0,x2:1.8,z2:0,
 elevation:.10,height:.90,depth:.60,side:1};
const front=(id,bay,startT,endT,subtype='door')=>({id,kind:'front',hostId:'base1',bay,startT,endT,subtype});

test('carcass boards are hollow, white-ready, 18mm and independent of closed facades',async()=>{
 const {cabinetCarcassPanels,CARCASS_THICKNESS}=await import('../apps/preview/carcass.js');
 const parts=cabinetCarcassPanels(cabinet);
 assert.equal(CARCASS_THICKNESS,.018);
 assert.equal(parts.filter(p=>p.part==='left-side'||p.part==='right-side').length,2);
 assert.equal(parts.filter(p=>p.part==='back').length,1);
 assert.equal(parts.filter(p=>p.part==='top').length,0,'base uses a separate solid countertop');
 assert.ok(parts.some(p=>p.part==='bottom'));
 assert.equal(parts.filter(p=>p.part==='divider').length,0,'blank run has no internal units before facades');
 assert.ok(parts.every(p=>p.width>0&&p.depth>0&&p.height>0));
 assert.ok(!parts.some(p=>p.width>1&&p.height>.5&&p.depth>.5),'no full cabinet filler');
 assert.deepEqual(cabinetCarcassPanels(cabinet,[front('a',0,0,.5),front('b',1,.5,1)]).length,
  parts.length+1,'facade design generates internal bay dividers');
});

test('paired doors and stacked drawers do not create duplicate unit dividers',async()=>{
 const {cabinetCarcassPanels}=await import('../apps/preview/carcass.js');
 const fronts=[front('left',0,0,.25),front('right',0,.25,.50),
  front('drawer1',1,.5,1,'drawer'),front('drawer2',1,.5,1,'drawer')];
 const parts=cabinetCarcassPanels(cabinet,fronts);
 assert.deepEqual(parts.filter(p=>p.part==='divider').map(p=>Number(p.x.toFixed(4))),[0]);
});

test('floor-standing washer/dishwasher receive an open floor bay without boolean cuts',async()=>{
 const {cabinetCarcassPanels}=await import('../apps/preview/carcass.js');
 const washer={id:'washer',kind:'equipment',hostId:'base1',subtype:'washer',width:.6,
  offsetT:.5,elevation:.10,height:.83};
 const parts=cabinetCarcassPanels(cabinet,[],[washer]);
 const floors=parts.filter(p=>p.part==='bottom'),dividers=parts.filter(p=>p.part==='divider');
 assert.ok(floors.length>=2);
 for(const b of floors){
  assert.ok(b.x+b.width/2<=-.30||b.x-b.width/2>=.30,'no board under appliance');
 }
 assert.ok(dividers.some(p=>Math.abs(p.x+.312)<.02));
 assert.ok(dividers.some(p=>Math.abs(p.x-.312)<.02));
});

test('every board uses 12 triangles and one indexed batched mesh with correct normals',async()=>{
 const {cabinetCarcassPanels,buildCarcassPanelGeometry}=await import('../apps/preview/carcass.js');
 const parts=cabinetCarcassPanels({...cabinet,subtype:'upper'});
 const batch=buildCarcassPanelGeometry(parts);
 assert.equal(batch.triangles,parts.length*12);
 assert.equal(batch.positions.length,parts.length*24*3);
 assert.equal(batch.normals.length,batch.positions.length);
 assert.equal(batch.uvs.length,parts.length*24*2);
 assert.equal(batch.indices.length,parts.length*36);
 assert.ok(batch.positions.every(Number.isFinite));
 assert.ok(batch.normals.every(Number.isFinite));
 assert.ok(parts.some(p=>p.part==='top'));
 for(let i=0;i<batch.indices.length;i+=3){
  const a=batch.indices[i]*3,b=batch.indices[i+1]*3,c=batch.indices[i+2]*3;
  const u=[0,1,2].map(j=>batch.positions[b+j]-batch.positions[a+j]);
  const v=[0,1,2].map(j=>batch.positions[c+j]-batch.positions[a+j]);
  const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  const dot=cross.reduce((sum,n,j)=>sum+n*batch.normals[a+j],0);
  assert.ok(dot>0,'outward normal matches triangle winding');
 }
});

test('bridge units retain lightweight open shelves without a blocking back',async()=>{
 const {cabinetCarcassPanels}=await import('../apps/preview/carcass.js');
 const panels=cabinetCarcassPanels({...cabinet,subtype:'bridge'});
 assert.equal(panels.filter(p=>p.part==='open-shelf').length,4);
 assert.equal(panels.filter(p=>p.part==='back').length,0);
});
