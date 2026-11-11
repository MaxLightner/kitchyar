// A very shallow crown in shading only (at most ~1.5 degrees). The measured
// panel remains planar; bevel normals and all vertex positions stay intact.
export function softenFrontNormals(geometry,width,height,strength=.018){
 const positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal');
 if(!positions||!normals||width<.1||height<.1)return geometry;
 for(let i=0;i<normals.count;i++){
  const nz=normals.getZ(i);if(Math.abs(nz)<.9999)continue;
  const x=Math.max(-1,Math.min(1,positions.getX(i)*2/width))*strength,
   y=Math.max(-1,Math.min(1,positions.getY(i)*2/height))*strength;
  const length=Math.hypot(x,y,nz);normals.setXYZ(i,x/length,y/length,nz/length);
 }
 normals.needsUpdate=true;return geometry;
}
