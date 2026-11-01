/* Low-poly closed room outlines, independent of the WebGL renderer. */
const key=(x,z)=>`${Math.round(x*1000)},${Math.round(z*1000)}`;
const area=points=>points.reduce((sum,p,i)=>sum+p.x*points[(i+1)%points.length].z-p.z*points[(i+1)%points.length].x,0)/2;
export function roomOutline(items=[]){
 const walls=items.filter(w=>w.kind==='wall');
 if(!walls.length)return [];
 const nodes=new Map(),edges=[];
 const add=(x,z)=>{const id=key(x,z);if(!nodes.has(id))nodes.set(id,{x,z,edges:[]});return id;};
 for(const w of walls){
  const a=add(w.x1,w.z1),b=add(w.x2,w.z2),i=edges.length;
  edges.push({a,b});nodes.get(a).edges.push(i);nodes.get(b).edges.push(i);
 }
 const rings=[],seen=new Set();
 for(let first=0;first<edges.length;first++){
  if(seen.has(first))continue;
  const start=edges[first].a,ring=[],used=[],local=new Set();let node=start,previous=-1,complete=false;
  while(ring.length<=edges.length){
   const entry=nodes.get(node);if(!entry)break;
   ring.push({x:entry.x,z:entry.z});
   const possibilities=entry.edges.filter(i=>i!==previous&&!local.has(i));
   if(possibilities.length!==1)break;
   const edgeId=possibilities[0],e=edges[edgeId];local.add(edgeId);used.push(edgeId);
   node=e.a===node?e.b:e.a;previous=edgeId;
   if(node===start){complete=ring.length>=3;break;}
  }
  if(complete){rings.push(ring);used.forEach(i=>seen.add(i));}
 }
 if(rings.length)return rings.sort((a,b)=>Math.abs(area(b))-Math.abs(area(a)))[0];
 // During drawing, still provide a useful 1m-tiled sample floor. The roof is
 // only generated once the wall chain actually closes.
 const xs=walls.flatMap(w=>[w.x1,w.x2]),zs=walls.flatMap(w=>[w.z1,w.z2]);
 return [{x:Math.min(...xs)-.8,z:Math.min(...zs)-.8},
  {x:Math.max(...xs)+.8,z:Math.min(...zs)-.8},
  {x:Math.max(...xs)+.8,z:Math.max(...zs)+.8},
  {x:Math.min(...xs)-.8,z:Math.max(...zs)+.8}];
}
export function hasClosedRoom(items=[]){
 const walls=items.filter(w=>w.kind==='wall');if(walls.length<3)return false;
 const count=new Map();for(const w of walls)for(const point of [[w.x1,w.z1],[w.x2,w.z2]]){
  const id=key(...point);count.set(id,(count.get(id)||0)+1);
 }
 return [...count.values()].every(v=>v===2);
}
