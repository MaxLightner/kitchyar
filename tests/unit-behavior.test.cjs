const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../apps/preview/floor-ar.js'),'utf8');
const unit={id:'c',kind:'cabinet',subtype:'base',x1:0,x2:.9,z1:0,z2:0,
 depth:.6,height:.85,elevation:.1,side:1,frontRules:{minDoorWidth:.2,maxDoorWidth:.55,gap:.003,
 alignRows:true,singleHinge:'left',pairHinge:'outer',handleStyle:'bar'}};
const f=(id,bay,subtype,startT,endT,bottomT,topT)=>({id,kind:'front',subtype,hostId:'c',bay,
 startT,endT,bottomT,topT,gap:.003,style:'flat',handleStyle:'bar'});
test('three taps select one complete cabinet unit, not the entire kitchen run',async()=>{
 const g=await import('../apps/preview/geometry.js');
 const items=[unit,f('left',0,'door',0,.25,0,1),f('right',0,'door',.25,.5,0,1),
  f('next',1,'drawer',.5,1,0,1)];
 const found=g.frontUnitFor(items,'left');
 assert.deepEqual(found.frontIds,['left','right']);
 assert.equal(found.hostId,'c');
 const changed=g.convertFrontUnit(items,'left','drawers3');
 assert.equal(changed.items.filter(x=>x.kind==='front'&&x.bay===0).length,3);
 assert.equal(changed.items.find(x=>x.id==='next').subtype,'drawer');
 assert.equal(items.length,4,'original items remain unchanged');
});
test('deleting top drawer stretches lower paired doors to worktop',async()=>{
 const g=await import('../apps/preview/geometry.js');
 const items=[unit,f('top',0,'drawer',0,1,.78,1),f('left',0,'door',0,.5,0,.78),
  f('right',0,'door',.5,1,0,.78)];
 const next=g.removeObject(items,'top').items;
 assert.equal(next.filter(x=>x.kind==='front').length,2);
 assert.ok(next.filter(x=>x.kind==='front').every(x=>x.topT===1));
 assert.equal(items.find(x=>x.id==='left').topT,.78);
});
test('opening animates transform-only and never performs a full scene remesh',()=>{
 const select=source.slice(source.indexOf(' syncFrontOpeningState(items){'),source.indexOf(' setMaterials(materials={}){'));
 assert.match(select,/animateFront\(f\.id,next\)/);
 assert.doesNotMatch(select,/rebuildObjects|applyRaycastAO|setLighting/);
 assert.match(source,/const eased=1-\(1-t\)\*\*3/);
 assert.match(source,/this\.frontControls\.set\(panel\.id,control\)/);
 assert.match(source,/const trayPanels=\[/);
 assert.match(source,/caster\.setFromCamera\(new THREE\.Vector2\(x,y\),this\.wideCamera\)/);
});
test('a 90-degree routed kitchen avoids intersecting 60cm cabinets in both drawing directions',async()=>{
 const g=await import('../apps/preview/geometry.js');
 const a={id:'a',kind:'wall',x1:0,z1:0,x2:2,z2:0,thickness:.12,height:2.8,startNodeId:'x',endNodeId:'n'},
  b={id:'b',kind:'wall',x1:2,z1:0,x2:2,z2:2,thickness:.12,height:2.8,startNodeId:'n',endNodeId:'y'};
 const paths=[[
  {x:.3,z:0,hostId:'a',side:1},{x:2,z:1.6,hostId:'b'}
 ],[
  {x:2,z:1.6,hostId:'b',side:1},{x:.3,z:0,hostId:'a'}
 ]];
 for(const [start,end] of paths){
  const result=g.placeCabinetRoute([a,b],start,end,{kind:'base',depth:.6,height:.85,elevation:.1});
  const cabinets=result.items.filter(c=>c.kind==='cabinet');assert.equal(cabinets.length,2);
  const one=cabinets.find(c=>c.hostId==='a'),two=cabinets.find(c=>c.hostId==='b');
  const xMax=Math.max(...g.cabinetFootprint(one,a).corners.map(p=>p.x));
  const xMin=Math.min(...g.cabinetFootprint(two,b).corners.map(p=>p.x));
  const zMax=Math.max(...g.cabinetFootprint(one,a).corners.map(p=>p.z));
  const zMin=Math.min(...g.cabinetFootprint(two,b).corners.map(p=>p.z));
  assert.ok(xMax<=xMin+.00001||zMax<=zMin+.00001,'corner cabinet runs must not overlap');
 }
});
test('near-snapped oblique wall corners have matching footprints and bounded miter extensions',async()=>{
 const g=await import('../apps/preview/geometry.js');
 const a={id:'wa',kind:'wall',x1:0,z1:0,x2:2,z2:0,thickness:.12,height:2.8},
  b={id:'wb',kind:'wall',x1:2.009,z1:.004,x2:3.1,z2:1.4,thickness:.12,height:2.8};
 const fa=g.wallFootprint(a,[a,b]),fb=g.wallFootprint(b,[a,b]);
 assert.ok(fa.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)));
 assert.ok(fb.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z)));
 assert.ok(Math.hypot(fa[1].x-fb[0].x,fa[1].z-fb[0].z)<.025);
 assert.ok(Math.hypot(fa[2].x-fb[3].x,fa[2].z-fb[3].z)<.025);
});
test('interaction hierarchy exposes single, double and triple taps without rebuilding scene',()=>{
 const ui=fs.readFileSync(path.join(__dirname,'../apps/preview/app.js'),'utf8');
 assert.match(ui,/function handleFrontTap\(hitId,event\)/);
 assert.match(ui,/if\(count===3\)/);
 assert.match(ui,/selectedUnit=Geo\.frontUnitFor\(currentItems\(\),front\.id\)/);
 assert.match(ui,/if\(count===2\|\|count===1&&front\.openFraction>\.01\)/);
 assert.match(ui,/commitFrontOpening\(front\.id,front\.openFraction>\.01\?0:1\)/);
 assert.match(ui,/data-action="convert-unit"/);
 const fast=ui.slice(ui.indexOf('function commitFrontOpening('),ui.indexOf('function undoChange('));
 assert.match(fast,/syncFrontOpeningState\(result\.items\)/);
 assert.doesNotMatch(fast,/alignFrontSeams|rebuildObjects|applyRaycastAO/);
});
