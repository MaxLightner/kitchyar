const test=require('node:test'),assert=require('node:assert/strict');
test('subtle front shading changes only planar cap normals, retaining dimensions and bevels',async()=>{
 const {softenFrontNormals}=await import('../apps/preview/front-normals.js');
 const positions=[[-.25,-.4,.0095],[.25,-.4,.0095],[.25,.4,.0095],[-.25,.4,-.0095],[.25,.4,.008]],normals=[[0,0,1],[0,0,1],[0,0,1],[0,0,-1],[.707,0,.707]],before=structuredClone(positions),bevel=normals[4].slice();
 const attribute=array=>({count:array.length,getX:i=>array[i][0],getY:i=>array[i][1],getZ:i=>array[i][2],setXYZ(i,x,y,z){array[i]=[x,y,z];}});
 const attrs={position:attribute(positions),normal:attribute(normals)};softenFrontNormals({getAttribute:k=>attrs[k]},.5,.8);
 assert.deepEqual(positions,before);assert.deepEqual(normals[4],bevel);
 for(const n of normals.slice(0,4)){assert.ok(Math.abs(Math.hypot(...n)-1)<1e-10);assert.ok(Math.acos(Math.abs(n[2]))<1.5*Math.PI/180);}
 assert.ok(normals[0][0]<0&&normals[1][0]>0&&normals[2][1]>0);
});
