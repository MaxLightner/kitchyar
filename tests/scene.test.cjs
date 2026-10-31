const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../apps/preview/core.js');
global.addEventListener=()=>{};
require('../apps/preview/scene.js');

function canvas(width=800,height=600){
  const events={};
  const context=new Proxy({}, {get(target,key){
    if(key==='createLinearGradient')return ()=>({addColorStop(){}});
    return key in target?target[key]:()=>{};
  },set(target,key,value){target[key]=value;return true;}});
  return {
    width:0,height:0,clientWidth:width,clientHeight:height,events,
    getContext(){return context;},
    getBoundingClientRect(){return {left:0,top:0,width,height};},
    addEventListener(name,cb){events[name]=cb;},
    setPointerCapture(){},
  };
}
const pointer=(x,y)=>({button:0,pointerId:1,clientX:x,clientY:y});
test('renderer draws semantic walls/openings/cabinet runs in both views',()=>{
  const main=canvas(),map=canvas(220,130),actions=[];
  const scene=global.KitchyarScene.createScene(main,map,{
    onSelect:id=>actions.push(id),onCreate:()=>{},onHint:()=>{},onManipulate:()=>{},onCommit:()=>{},onCancel:()=>{}
  });
  const wall=core.createWall({x:0,z:0},{x:4,z:0}),win=core.createOpening(wall,'window',2);
  const run=core.createCabinetRun({x:0,z:1},{x:3,z:1},'base');
  assert.doesNotThrow(()=>scene.render([wall,win,run],'2d',win.id));
  assert.doesNotThrow(()=>scene.render([wall,win,run],'3d',win.id));
  assert.ok(main.width>0);
  assert.ok(map.height>0);
});
test('wall and cabinet draw tools emit correct metric start and end points',()=>{
  const main=canvas(),map=canvas(220,130),commands=[];
  const scene=global.KitchyarScene.createScene(main,map,{
    onSelect:()=>{},onCreate:(...args)=>commands.push(args),onCreateOpening:()=>{},
    onHint:()=>{},onManipulate:()=>{},onCommit:()=>{},onCancel:()=>{}
  });
  scene.render([],'2d',null);
  scene.setTool('wall');
  main.events.pointerdown(pointer(400,300));main.events.pointermove(pointer(580,300));main.events.pointerup(pointer(580,300));
  assert.equal(commands.length,1);
  assert.equal(commands[0][0],'wall');
  assert.ok(commands[0][2].x-commands[0][1].x>2);
  scene.setTool('base');
  main.events.pointerdown(pointer(400,300));main.events.pointermove(pointer(600,300));main.events.pointerup(pointer(600,300));
  assert.equal(commands[1][0],'base');
});
