export const MAX_AUTO_LOWER_TIER=.60;
export const DEFAULT_CEILING_HEIGHT=3;
export const MAX_CEILING_HEIGHT=3.1;
export function checkCeilingHeight(height){
 if(!Number.isFinite(height)||height<2||height>MAX_CEILING_HEIGHT)throw Error('ارتفاع سقف باید بین ۲ تا ۳٫۱ متر باشد.');
 return height;
}
export function tierHeights(ceiling,elevation=1.5,lower=null){
 const total=Math.round((ceiling-elevation)*100)/100;
 if(!Number.isFinite(total)||total<.4)throw Error('برای هوایی دوطبقه حداقل ۴۰ سانتی‌متر فضای مفید لازم است.');
 const bottom=lower==null?Math.min(MAX_AUTO_LOWER_TIER,Math.round((total-Math.min(.9,total*2/3))*100)/100):Number(lower);
 if(!Number.isFinite(bottom)||bottom<.2||total-bottom<.2)throw Error('هر طبقه حداقل ۲۰ سانتی‌متر ارتفاع لازم دارد.');
 return {total,lower:bottom,upper:Math.round((total-bottom)*100)/100};
}
export function wallBounds(items,padding=0){
 const walls=items.filter(o=>o.kind==='wall');if(!walls.length)return null;
 const xs=walls.flatMap(w=>[w.x1,w.x2]),zs=walls.flatMap(w=>[w.z1,w.z2]);
 const minX=Math.min(...xs)-padding,maxX=Math.max(...xs)+padding,minZ=Math.min(...zs)-padding,maxZ=Math.max(...zs)+padding;
 return {x:(minX+maxX)/2,z:(minZ+maxZ)/2,width:Math.max(.4,maxX-minX),depth:Math.max(.4,maxZ-minZ)};
}
