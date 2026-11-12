/* Geometric ceramic layout: one clipped, batched mesh per backsplash span.
   Tile faces share the original lightweight texture; exposed grout is separate. */
export const TILE_PATTERNS=Object.freeze(['grid','brick','herringbone','diagonal','vertical','mixed']);
export const DEFAULT_TILE_LAYOUT=Object.freeze({
 pattern:'grid',width:.20,height:.10,grout:.003,groutColor:'#d8d4ca'
});
export function validateTileLayout(input={}){
 const v={...DEFAULT_TILE_LAYOUT,...input};
 v.width=Number(v.width);v.height=Number(v.height);v.grout=Number(v.grout);
 if(!TILE_PATTERNS.includes(v.pattern)||!Number.isFinite(v.width)||!Number.isFinite(v.height)||
  !Number.isFinite(v.grout)||v.width<.05||v.width>.60||v.height<.035||v.height>.45||
  v.grout<.001||v.grout>.015||!/^#[0-9a-fA-F]{6}$/.test(v.groutColor))
  throw Error('الگو، ابعاد کاشی یا بندکشی نامعتبر است.');
 return v;
}
function clip(poly,inside,intersect){
 const out=[];
 for(let i=0;i<poly.length;i++){
  const a=poly[i],b=poly[(i+1)%poly.length],ai=inside(a),bi=inside(b);
  if(ai&&bi)out.push(b);
  else if(ai&&!bi)out.push(intersect(a,b));
  else if(!ai&&bi)out.push(intersect(a,b),b);
 }
 return out;
}
const interpolate=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,
 u:a.u+(b.u-a.u)*t,v:a.v+(b.v-a.v)*t});
export function buildTileGeometry(width,height,options={}){
 const layout=validateTileLayout(options),positions=[],uvs=[],indices=[];
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)
  return {positions,uvs,indices,count:0};
 let count=0;
 const addTile=(x,y,w,h,angle=0)=>{
  if(count>=2600)return;
  const radius=Math.hypot(w,h)/2;
  if(x+radius<0||x-radius>width||y+radius<0||y-radius>height)return;
  const cos=Math.cos(angle),sin=Math.sin(angle);
  let poly=[[-.5,-.5,0,0],[.5,-.5,1,0],[.5,.5,1,1],[-.5,.5,0,1]]
   .map(([a,b,u,v])=>({x:x+a*w*cos-b*h*sin,y:y+a*w*sin+b*h*cos,u,v}));
  for(const [axis,edge,sign] of [['x',0,1],['x',width,-1],['y',0,1],['y',height,-1]]){
   const inside=p=>sign*(p[axis]-edge)>=-1e-8;
   poly=clip(poly,inside,(a,b)=>interpolate(a,b,(edge-a[axis])/(b[axis]-a[axis])));
   if(poly.length<3)return;
  }
  const start=positions.length/3;
  for(const p of poly){positions.push(p.x-width/2,p.y-height/2,0);uvs.push(p.u,p.v);}
  for(let i=1;i<poly.length-1;i++)indices.push(start,start+i,start+i+1);
  count++;
 };
 const {pattern,grout}=layout;
 if(pattern==='herringbone'){
  // Perfect 2:1 domino tiling: diagonal parity yields interlocking L/V rails.
  const unit=(layout.height+layout.width/2)/2+grout/2;
  const nx=Math.ceil(width/unit)+2,ny=Math.ceil(height/unit)+2;
  for(let j=-2;j<ny;j++)for(let i=-2;i<nx;i++){
   const parity=((i+j)%4+4)%4;
   if(parity===0)addTile((i+1)*unit,(j+.5)*unit,2*unit-grout,unit-grout);
   else if(parity===2)addTile((i+.5)*unit,(j+1)*unit,unit-grout,2*unit-grout);
  }
 }else if(pattern==='diagonal'){
  const w=layout.width,h=layout.height,px=w+grout,py=h+grout,a=Math.PI/4;
  // Rotate the visible wall bounds back into tile-grid coordinates. Separate
  // axis limits avoid a huge square search on long, narrow splashbacks.
  const extent=(width+height)*Math.SQRT1_2/2;
  const columns=Math.ceil(extent/px)+2,rows=Math.ceil(extent/py)+2;
  for(let j=-rows;j<=rows;j++)for(let i=-columns;i<=columns;i++)
   addTile(width/2+(i*px-j*py)*Math.SQRT1_2,height/2+(i*px+j*py)*Math.SQRT1_2,w,h,a);
 }else if(pattern==='mixed'){
  // Alternating vertical stack and running-bond bands, with no texture atlas.
  const band=layout.width+layout.height+grout;
  for(let x=0;x<width+band;x+=band){
   for(let y=0;y<height+layout.width;y+=layout.width+grout)
    addTile(x+layout.height/2,y+layout.width/2,layout.height,layout.width);
   for(let y=0,j=0;y<height+layout.height;y+=layout.height+grout,j++)
    addTile(x+layout.height+grout+layout.width/2,y+layout.height/2,
     layout.width,layout.height);
  }
 }else{
  const vertical=pattern==='vertical',w=vertical?layout.height:layout.width,h=vertical?layout.width:layout.height;
  const px=w+grout,py=h+grout;
  for(let j=0;j<Math.ceil(height/py)+1;j++)
   for(let i=-1;i<Math.ceil(width/px)+2;i++)
    addTile((i+.5+(pattern==='brick'&&j%2?.5:0))*px,(j+.5)*py,w,h);
 }
 return {positions,uvs,indices,count};
}
