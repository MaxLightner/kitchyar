// Re-anchor the A/B reference without changing the project's metre scale.
// Three.js Y rotation maps (x,z) to (x*cos+z*sin, -x*sin+z*cos).
export function fitCalibrationDragB(a,b,anchorA,targetB,scale=1){
 const values=[a?.x,a?.z,b?.x,b?.z,anchorA?.x,anchorA?.z,targetB?.x,targetB?.z,scale];
 if(!values.every(Number.isFinite)||scale<=0)return null;
 const dx=b.x-a.x,dz=b.z-a.z,wx=targetB.x-anchorA.x,wz=targetB.z-anchorA.z;
 const oldLength=Math.hypot(dx,dz),physicalLength=Math.hypot(wx,wz);
 if(oldLength<.10||physicalLength<Math.max(.10,.10*scale))return null;
 const lengthFactor=physicalLength/(scale*oldLength);
 const yaw=Math.atan2(dz,dx)-Math.atan2(wz,wx);
 const cosine=Math.cos(yaw),sine=Math.sin(yaw);
 return {
  b:{x:a.x+dx*lengthFactor,z:a.z+dz*lengthFactor},
  yaw,
  x:anchorA.x-scale*(a.x*cosine+a.z*sine),
  z:anchorA.z-scale*(-a.x*sine+a.z*cosine)
 };
}
