const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=file=>fs.readFileSync(path.join(__dirname,'../apps/preview',file),'utf8');

test('wide camera has fixed horizontal 60, 84 and 100 degree perspectives',async()=>{
 const {WIDE_FOV,verticalFovFromHorizontal}=await import('../apps/preview/wide-view.js');
 assert.deepEqual(Object.values(WIDE_FOV),[60,84,100]);
 for(const aspect of [9/16,4/3,16/9])for(const h of Object.values(WIDE_FOV)){
  const v=verticalFovFromHorizontal(h,aspect);
  const recovered=Math.atan(Math.tan(v*Math.PI/360)*aspect)*360/Math.PI;
  assert.ok(Math.abs(recovered-h)<1e-9);
 }
 assert.throws(()=>verticalFovFromHorizontal(84,0),RangeError);
 assert.throws(()=>verticalFovFromHorizontal(180,1),RangeError);
});

test('tracked one-metre movement retains camera height, direction and scale',async()=>{
 const {copyTrackedView}=await import('../apps/preview/wide-view.js');
 const camera={
  position:{set(x,y,z){this.x=x;this.y=y;this.z=z;}},
  quaternion:{set(x,y,z,w){this.x=x;this.y=y;this.z=z;this.w=w;}},
  scale:{x:1,y:1,z:1},
  updateMatrixWorld(){this.updated=(this.updated||0)+1;}
 };
 const tracked=(x,y,z)=>({transform:{position:{x,y,z},
  orientation:{x:0,y:.382683432365,z:0,w:.923879532511}}});
 assert.equal(copyTrackedView(camera,tracked(1,1.51,-2)),true);
 const before={...camera.position};
 assert.equal(copyTrackedView(camera,tracked(2,1.51,-2)),true);
 assert.equal(Math.hypot(camera.position.x-before.x,camera.position.y-before.y,camera.position.z-before.z),1);
 assert.equal(camera.position.y,1.51);
 assert.equal(camera.quaternion.y,.382683432365);
 assert.deepEqual(camera.scale,{x:1,y:1,z:1});
 assert.equal(copyTrackedView(camera,null),false);
 assert.equal(camera.updated,2);
});

test('viewer pose takes priority over XR per-eye transform to prevent eye-height shift',async()=>{
 const {trackedViewTransform}=await import('../apps/preview/wide-view.js');
 const pose={transform:{position:{x:2,y:1.55,z:-1},orientation:{x:0,y:0,z:0,w:1}},
  views:[{eye:'left',transform:{position:{x:3,y:2.8,z:-1},orientation:{x:0,y:0,z:0,w:1}}}]};
 assert.equal(trackedViewTransform(pose).position.y,1.55);
 assert.equal(trackedViewTransform(null),null);
});

test('tracked 3D mode renders independently and reuses AR selection, editing and navigation',()=>{
 const floor=source('floor-ar.js'),app=source('app.js'),styles=source('styles.css');
 assert.match(floor,/this\.session\.domOverlayState\?\.type!=='screen'/);
 assert.match(floor,/copyTrackedView\(this\.wideCamera,pose\)/);
 assert.match(floor,/this\.wideRenderer\.render\(this\.scene,this\.wideCamera\)/);
 assert.match(floor,/this\.wideCamera\.fov=verticalFovFromHorizontal/);
 assert.match(floor,/screenRay\(pose,upper=false,x=0,y=null\)\{\s*if\(this\.wideActive/);
 assert.match(floor,/activeViewMatrices\(\)/);
 assert.match(floor,/this\.disableWideView\(\);this\.wideRenderer\?\.dispose\(\)/);
 assert.match(app,/const trackedView=\(\)=>mode==='ar'\|\|\(mode==='3d'&&!!floor\?\.wideActive\)/);
 assert.match(app,/if\(next==='3d'&&floor\?\.session\)floor\.setWideView\(wideLevel\)/);
 assert.match(app,/else if\(floor\?\.wideActive\)floor\.disableWideView\(\)/);
 assert.match(app,/trackedView\(\)&&!drawing\?floor\?\.pickObject/);
 assert.match(app,/trackedView\(\)\?floor\?\.pick\(\)/);
 assert.match(app,/if\(trackedView\(\)\)floor\?\.setEditPreview/);
 assert.match(app,/data-wide-mode="normal"/);
 assert.match(app,/data-wide-mode="ultra"/);
 assert.match(styles,/\.wide-view-canvas\{[^}]*pointer-events:none/);
});
