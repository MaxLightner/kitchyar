import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {UnifiedARSession} from './unifiedARSession';
import {nextDiningSeats,diningLayout} from '../cad/diningLayout';

function fixture() {
  const previous=Object.getOwnPropertyDescriptor(globalThis,'document');
  Object.defineProperty(globalThis,'document',{configurable:true,value:{body:{},createElement:()=>({width:64,height:64,
    getContext:()=>({fillText(){},fillStyle:'',font:'',textAlign:''})})}});
  const scene=new THREE.Scene();scene.background=new THREE.Color('#eaeef3');
  const camera=new THREE.PerspectiveCamera(50,1.6,.12,48);camera.position.set(3,2,4);
  const xrCamera=new THREE.ArrayCamera([new THREE.PerspectiveCamera()]);
  const controls={target:new THREE.Vector3(0,1,0),enabled:true};
  const stats={sessions:0,ended:0,confirmed:0,frames:0,calibrations:[] as unknown[],loop:null as unknown};
  const renderer={domElement:{style:{},getBoundingClientRect:()=>({left:0,top:0,width:800,height:500})},
    setAnimationLoop:(callback:unknown)=>stats.loop=callback,
    xr:{enabled:false,cameraAutoUpdate:true,setReferenceSpaceType(){},setSession:async()=>{stats.sessions++;},
      getCamera:()=>xrCamera,getReferenceSpace:()=>({}),updateCamera(){}},getSize:(v:THREE.Vector2)=>v.set(800,500)};
  const driver=new UnifiedARSession(renderer as never,scene,camera,controls as never,{
    change(){},ended:()=>stats.ended++,confirmed:()=>stats.confirmed++,frame:()=>stats.frames++,render(){},toast(){},
    calibration:(a,b,cm)=>stats.calibrations.push({a,b,cm}),
  });
  const internal=driver as unknown as {
    origin:THREE.Object3D;alignment:THREE.Object3D;rig:THREE.Group;modelToXR:THREE.Matrix4;
    a:THREE.Vector3;b:THREE.Vector3;updateRig:()=>void;
    confirmation:{observe:(point:THREE.Vector3,observations:THREE.Vector3[],ready:boolean,time:number)=>void};lastPoseTime:number;
  };
  const session=new EventTarget() as EventTarget&{end:()=>Promise<void>;domOverlayState:object;requestReferenceSpace:()=>Promise<unknown>;requestHitTestSource:()=>Promise<unknown>};
  session.domOverlayState={type:'screen'};session.end=async()=>{session.dispatchEvent(new Event('end'));};
  session.requestReferenceSpace=async()=>({});session.requestHitTestSource=async()=>({cancel(){}});
  return {driver,internal,renderer,scene,camera,controls,stats,session,
    cleanup:()=>{driver.dispose();if(previous)Object.defineProperty(globalThis,'document',previous);else Reflect.deleteProperty(globalThis,'document');}};
}

test('AR reuses the existing renderer and scene, locks only fresh floor evidence, and restores the desktop camera',async()=>{
  const f=fixture();try{
    const originalSceneObjects=f.scene.children.length;
    await f.driver.start(Promise.resolve(f.session as never));
    assert.equal(f.stats.sessions,1);assert.equal(f.driver.active,true);
    f.driver.confirmFloor();assert.equal(f.driver.locked,false);
    const now=performance.now();f.internal.lastPoseTime=now;
    f.internal.confirmation.observe(new THREE.Vector3(2,-1,-3),[],true,now);
    f.driver.confirmFloor();assert.equal(f.driver.locked,true);assert.equal(f.stats.confirmed,1);
    assert.equal(f.driver.state.calibrating,true);
    assert.equal(f.scene.children.length,originalSceneObjects);
    await f.driver.start(Promise.resolve(f.session as never));assert.equal(f.stats.sessions,1);
    f.driver.stop();assert.equal(f.driver.active,false);assert.equal(f.camera.parent,null);
    assert.deepEqual(f.camera.position.toArray(),[3,2,4]);assert.equal(f.camera.near,.12);
    assert.equal(f.controls.enabled,true);
  }finally{f.cleanup();}
});

test('camera rig converts physical AR coordinates into the unchanged CAD coordinate system at arbitrary scale and rotation',()=>{
  const f=fixture();try{
    f.internal.origin.position.set(2,-1,3);f.internal.origin.rotation.y=.3;
    f.internal.alignment.position.set(.4,0,-.8);f.internal.alignment.rotation.y=-.6;f.internal.alignment.scale.setScalar(1.7);
    f.internal.updateRig();
    const modelPoint=new THREE.Vector3(1.2,.9,-2);
    const physical=modelPoint.clone().applyMatrix4(f.internal.modelToXR);
    const restored=physical.clone().applyMatrix4(f.internal.rig.matrix);
    assert.ok(restored.distanceTo(modelPoint)<1e-9);
    assert.deepEqual(modelPoint.toArray(),[1.2,.9,-2]);
  }finally{f.cleanup();}
});

test('real A/B distance keeps physical A and B fixed while changing only the AR camera alignment',()=>{
  const f=fixture();try{
    f.driver.state={...f.driver.state,floorLocked:true};
    f.internal.a.set(.2,0,-1);f.internal.b.set(.8,0,-1);
    f.internal.alignment.position.set(2,0,3);f.internal.alignment.rotation.y=.4;f.internal.alignment.scale.setScalar(1.5);
    f.internal.updateRig();
    const a=f.internal.a.clone().applyMatrix4(f.internal.modelToXR),b=f.internal.b.clone().applyMatrix4(f.internal.modelToXR);
    f.driver.applyDistance(120);
    assert.ok(f.internal.a.clone().applyMatrix4(f.internal.modelToXR).distanceTo(a)<1e-9);
    assert.ok(f.internal.b.clone().applyMatrix4(f.internal.modelToXR).distanceTo(b)<1e-9);
    assert.ok(Math.abs(f.internal.a.distanceTo(f.internal.b)-1.2)<1e-9);
    assert.equal(f.driver.state.calibrating,false);assert.equal(f.stats.calibrations.length,1);
    assert.equal(f.driver.state.distanceCm,120);
  }finally{f.cleanup();}
});

test('two-finger dining choices wrap across 2/4/6/8 and match plan chair counts',()=>{
  let seats=nextDiningSeats(4,1);assert.equal(seats,6);assert.equal(diningLayout(seats).chairs.length,6);
  seats=nextDiningSeats(8,1);assert.equal(seats,2);assert.equal(nextDiningSeats(2,-1),8);
});
