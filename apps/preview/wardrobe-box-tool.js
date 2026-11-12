/* Metric top-view construction surface, metres. */
const f=n=>Number(n).toFixed(3);
export function renderWardrobeTop(config,{drawing=false}={}){
 const cx=config.centerX??0,cz=config.centerZ??(.064+config.depth/2),x=cx-config.width/2,z=cz-config.depth/2;
 const outline=drawing?'':'<rect x="'+f(x)+'" y="'+f(z)+'" width="'+f(config.width)+'" height="'+f(config.depth)+'" fill="#c5d3c8" fill-opacity=".8" stroke="#2b7257" stroke-width=".025"/>'+
  '<text x="'+f(cx)+'" y="'+f(z-.12)+'" text-anchor="middle" font-size=".16" fill="#294536">'+Math.round(config.width*100)+' × '+Math.round(config.depth*100)+' cm</text>';
 return '<svg id="wardrobe-top-svg" viewBox="-3.5 -2.5 7 5" preserveAspectRatio="xMidYMid meet" role="img" aria-label="پلان کف کمد، برای رسم با موس کلیک کن و بکش">'+
  '<defs><pattern id="wardrobe-ground-grid" width=".1" height=".1" patternUnits="userSpaceOnUse"><path d="M.1 0 H0 V.1" stroke="#c9d6cf" fill="none" stroke-width=".006"/></pattern></defs>'+
  '<rect x="-3.5" y="-2.5" width="7" height="5" fill="#f0f5f0"/>'+
  '<rect x="-3.5" y="-2.5" width="7" height="5" fill="url(#wardrobe-ground-grid)"/>'+
  '<path d="M-3.5 0H3.5 M0 -2.5V2.5" stroke="#a5bbaa" stroke-width=".014" stroke-dasharray=".06,.06"/>'+
  outline+
  '<rect id="wardrobe-footprint-preview" x="0" y="0" width="0" height="0" fill="#5b9c7b" fill-opacity=".27" stroke="#207553" stroke-width=".03" stroke-dasharray=".075,.035" hidden pointer-events="none"/>'+
  '<rect x="-3.5" y="-2.5" width="7" height="5" fill="transparent" data-w-floor-target="1" style="cursor:'+(drawing?'crosshair':'default')+'"/></svg>';
}
export function topViewPoint(svg,event){
 const matrix=svg?.getScreenCTM?.();
 if(!matrix)return null;
 const p=svg.createSVGPoint();p.x=event.clientX;p.y=event.clientY;
 const at=p.matrixTransform(matrix.inverse());
 const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
 return {x:Math.round(clamp(at.x,-3.5,3.5)*100)/100,z:Math.round(clamp(at.y,-2.5,2.5)*100)/100};
}
export function previewFloorRect(element,a,b){
 if(!element||!a||!b)return;
 element.hidden=false;
 element.setAttribute('x',f(Math.min(a.x,b.x)));
 element.setAttribute('y',f(Math.min(a.z,b.z)));
 element.setAttribute('width',f(Math.abs(a.x-b.x)));
 element.setAttribute('height',f(Math.abs(a.z-b.z)));
}
