import * as THREE from './vendor/three.module.js';

// Spatial neighbourhood for floor evidence; the scan is not limited by camera height.
export const SCAN_RADIUS_METERS=2;
export const MAX_FLOOR_TILT_DEGREES=5;
export const FLOOR_HEIGHT_TOLERANCE=.03;
const MIN_SEPARATION=.14;
const MAX_HISTORY_AGE=2400;
const cosLimit=Math.cos(THREE.MathUtils.degToRad(MAX_FLOOR_TILT_DEGREES));
const horizontalDistance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const median=values=>{const a=[...values].sort((x,y)=>x-y);const n=a.length;return n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2;};

export function floorCandidates(results,space,viewerPosition=null,includeSloped=false){
 const found=[];
 for(const result of results){
  const pose=result.getPose(space);if(!pose)continue;
  const values=pose.transform.matrix;
  if(!values||values.length!==16||!Array.from(values).every(Number.isFinite))continue;
  const matrix=new THREE.Matrix4().fromArray(values);
  const normal=new THREE.Vector3(0,1,0).transformDirection(matrix);
  const point=new THREE.Vector3().setFromMatrixPosition(matrix);
  const level=Math.abs(normal.y)>=cosLimit;
  if(!level&&!includeSloped)continue;
  if(viewerPosition&&point.y>=viewerPosition.y)continue;
  found.push({matrix,point,result,level,normal});
 }
 return found.sort((a,b)=>a.point.y-b.point.y);
}
export function horizontalHit(results,space){return floorCandidates(results,space)[0]?.matrix||null;}

function uniqueInHeight(items,target){
 const members=[];
 for(const item of items){
  if(Math.abs(item.point.y-target)>FLOOR_HEIGHT_TOLERANCE)continue;
  if(members.every(other=>horizontalDistance(other.point,item.point)>MIN_SEPARATION))members.push(item);
 }
 return members;
}

export class FloorScanner{
 constructor(){this.reset();}
 reset(){
  this.point=null;this.candidate=null;this.ready=false;this.height=null;
  this.observations=[];this.history=[];this.currentHits=[];
  this.rawHits=0;this.validHits=0;this.inlierHits=0;
 }
 update(centerResults,additionalResults,space,viewer,time,forward=null){
  const rawCenter=floorCandidates(centerResults,space,viewer,true);
  const center=rawCenter[0]?.point||null;
  const all=[...centerResults,...additionalResults];
  this.rawHits=all.length;
  const allHits=floorCandidates(all,space,viewer,true);
  this.currentHits=[];
  this.inlierHits=0;this.validHits=0;this.ready=false;
  if(!center){
   this.point=null;
   this.history=[];
   return null;
  }
  const withinRadius=allHits.filter(item=>horizontalDistance(center,item.point)<=SCAN_RADIUS_METERS);
  const valid=withinRadius.filter(item=>item.level);
  this.currentHits=withinRadius;
  this.validHits=valid.length;
  this.history=this.history.filter(item=>time-item.seen<=MAX_HISTORY_AGE&&horizontalDistance(center,item.point)<=SCAN_RADIUS_METERS);
  // Preserve distinct spatial observations rather than counting the same hit in every frame.
  for(const hit of valid){
   const prev=this.history.find(item=>horizontalDistance(item.point,hit.point)<MIN_SEPARATION&&Math.abs(item.point.y-hit.point.y)<=FLOOR_HEIGHT_TOLERANCE);
   if(prev){prev.seen=time;prev.point.copy(hit.point);}
   else this.history.push({point:hit.point.clone(),seen:time});
  }
  if(this.history.length>90)this.history.splice(0,this.history.length-90);
  // Find the densest HEIGHT cluster; never average readings from different heights.
  const combined=[...valid,...this.history];
  let best=null,bestScore=-Infinity;
  for(const seed of valid){
   const group=uniqueInHeight(combined,seed.point.y);
   if(!group.length)continue;
   const groupHeight=median(group.map(item=>item.point.y));
   const distinctCurrent=uniqueInHeight(valid,groupHeight);
   const proximity=this.height===null?0:Math.max(0,1-Math.abs(groupHeight-this.height)/.10);
   const score=group.length+distinctCurrent.length*.5+proximity*.35;
   if(score>bestScore){bestScore=score;best={group,height:groupHeight};}
  }
  if(!best){
   this.point=null;this.candidate=null;
   return null;
  }
  this.height=best.height;
  const matching=valid.filter(item=>Math.abs(item.point.y-best.height)<=FLOOR_HEIGHT_TOLERANCE);
  this.inlierHits=matching.length;
  this.currentHits=withinRadius.map(item=>({...item,accepted:item.level&&Math.abs(item.point.y-best.height)<=FLOOR_HEIGHT_TOLERANCE}));
  this.observations=best.group.map(item=>new THREE.Vector3(item.point.x,best.height,item.point.z)).slice(0,15);
  const origin=center.clone();
  // Intersect the central viewer ray with the chosen LEVEL, keeping the reticle centred.
  if(forward&&Math.abs(forward.y)>.02){
   const t=(best.height-viewer.y)/forward.y;
   if(t>0&&Number.isFinite(t)){
    const projected=viewer.clone().addScaledVector(forward,t);
    if(horizontalDistance(projected,center)<=SCAN_RADIUS_METERS)origin.copy(projected);
   }
  }
  origin.y=best.height;
  this.point=origin;
  this.candidate=matching[0]||null;
  // No timer: require a few independent positions across the 2m neighbourhood.
  this.ready=best.group.length>=3;
  return this.point.clone();
 }
}
