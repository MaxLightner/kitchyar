// Stabilize a single horizontal floor from several independent WebXR anchor poses.
// All samples are expressed in the same XRReferenceSpace, in metres.
// The estimated transform maps points at acquisition time to their current poses.
export const wrapAngle = value => Math.atan2(Math.sin(value), Math.cos(value));
const median = values => {
 const v=[...values].sort((a,b)=>a-b);
 return v.length%2?v[(v.length-1)/2]:(v[v.length/2-1]+v[v.length/2])/2;
};
const finite = point => Array.isArray(point)&&point.length===3&&point.every(Number.isFinite);
function fit(points){
 const n=points.length;
 const a=[0,0,0],b=[0,0,0];
 for(const p of points)for(let k=0;k<3;k++){a[k]+=p.reference[k]/n;b[k]+=p.observed[k]/n;}
 let dot=0,cross=0;
 for(const p of points){
  const ux=p.reference[0]-a[0],uz=p.reference[2]-a[2];
  const vx=p.observed[0]-b[0],vz=p.observed[2]-b[2];
  dot+=ux*vx+uz*vz;
  cross+=uz*vx-ux*vz;
 }
 const yaw=Math.atan2(cross,dot),c=Math.cos(yaw),s=Math.sin(yaw);
 return {x:b[0]-c*a[0]-s*a[2],y:median(points.map(p=>p.observed[1]-p.reference[1])),z:b[2]+s*a[0]-c*a[2],yaw};
}
export function transformPoint(point,pose){
 const c=Math.cos(pose.yaw),s=Math.sin(pose.yaw);
 return [c*point[0]+s*point[2]+pose.x,point[1]+pose.y,-s*point[0]+c*point[2]+pose.z];
}
export function inversePoint(point,pose){
 const c=Math.cos(pose.yaw),s=Math.sin(pose.yaw),x=point[0]-pose.x,z=point[2]-pose.z;
 return [c*x-s*z,point[1]-pose.y,s*x+c*z];
}
const distance=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1],p[2]-q[2]);
const spread=points=>{
 if(points.length<3)return false;
 const [a,b,c]=points.map(p=>p.reference);
 // Avoid accepting three clustered/near-collinear anchors.
 const area=Math.abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]));
 return area>=.09;
};
export function estimateFloorPose(samples,threshold=.09,preferred=[]){
 const points=samples.filter(p=>finite(p.reference)&&finite(p.observed));
 if(points.length<3)return null;
 let best=null;
 for(let i=0;i<points.length-2;i++)for(let j=i+1;j<points.length-1;j++)for(let k=j+1;k<points.length;k++){
  const trio=[points[i],points[j],points[k]];
  if(!spread(trio))continue;
  const proposed=fit(trio);
  const inliers=points.filter(p=>distance(transformPoint(p.reference,proposed),p.observed)<=threshold);
  if(inliers.length<3||!inliers.some(p=>p.id===trio[0].id))continue;
  const refined=fit(inliers);
  const finalInliers=points.filter(p=>distance(transformPoint(p.reference,refined),p.observed)<=threshold);
  if(finalInliers.length<3)continue;
  const corrected=fit(finalInliers);
  const error=finalInliers.reduce((total,p)=>total+Math.pow(distance(transformPoint(p.reference,corrected),p.observed),2),0)/finalInliers.length;
  // Mild preference for keeping the previous active set avoids tie-churn.
  const continuity=finalInliers.filter(p=>preferred.includes(p.id)).length;
  const candidate={pose:corrected,inliers:finalInliers.map(p=>p.id),outliers:points.filter(p=>!finalInliers.includes(p)).map(p=>p.id),error};
  if(!best||candidate.inliers.length>best.inliers.length||(candidate.inliers.length===best.inliers.length&&(error-.00002*continuity<best.error-.00002*best.inliers.filter(id=>preferred.includes(id)).length)))best=candidate;
 }
 return best;
}
export class AnchorStabilizer{
 constructor(){this.pose={x:0,y:0,z:0,yaw:0};this.inliers=[];this.outliers=[];this.status='waiting';this.pending=null;this.pendingFrames=0;}
 toReference(point){return inversePoint(point,this.pose);}
 update(samples,dt=.016){
  const fit=estimateFloorPose(samples,.09,this.inliers);
  if(!fit){this.status='insufficient';return this.snapshot();}
  const requested=fit.pose;
  const offset=Math.hypot(requested.x-this.pose.x,requested.y-this.pose.y,requested.z-this.pose.z);
  const yawDiff=wrapAngle(requested.yaw-this.pose.yaw);
  const sudden=offset>.15||Math.abs(yawDiff)>.10;
  if(sudden){
   const key=fit.inliers.slice().sort().join(',');
   if(this.pending===key)this.pendingFrames++;else{this.pending=key;this.pendingFrames=1;}
   if(this.pendingFrames<6){this.status='verifying';return this.snapshot();}
  }else{this.pending=null;this.pendingFrames=0;}
  const seconds=Math.max(.001,Math.min(dt,.1));
  const alpha=1-Math.exp(-seconds/.26);
  const limit=Math.min(1,.32*seconds/Math.max(offset,1e-9));
  const amount=Math.min(alpha,limit);
  this.pose.x+=(requested.x-this.pose.x)*amount;
  this.pose.y+=(requested.y-this.pose.y)*amount;
  this.pose.z+=(requested.z-this.pose.z)*amount;
  this.pose.yaw=wrapAngle(this.pose.yaw+Math.sign(yawDiff)*Math.min(Math.abs(yawDiff)*alpha,.35*seconds));
  this.inliers=fit.inliers;
  this.outliers=fit.outliers;
  this.status=fit.outliers.length?'filtered':'stable';
  return this.snapshot();
 }
 snapshot(){return {pose:{...this.pose},inliers:[...this.inliers],outliers:[...this.outliers],status:this.status};}
}
