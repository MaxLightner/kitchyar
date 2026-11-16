import type { CabinetBox, DoorUnit } from './types';

export type CabinetAlignDirection = 'left' | 'right' | 'center';
export type LayoutResult = { ok: boolean; message: string };

/** Align ONLY selected door fronts. Unselected fronts act as immovable
 * obstacles, and selected fronts retain their relative arrangement.
 * The available travel is the contiguous free space, never a teleport
 * across an unrelated door. All coordinates are in the box's local cm. */
export function alignSelectedDoorsInBox(
  box: CabinetBox,
  selectedIds: readonly string[],
  direction: CabinetAlignDirection
): LayoutResult {
  const ids = new Set(selectedIds);
  const moving = box.doors.filter(d => ids.has(d.id) && d.kind !== 'fridge' && d.kind !== 'open');
  if (!moving.length) return {ok:false, message:'ابتدا درب‌ها یا آیتم‌های موردنظر را انتخاب کنید'};
  const fixed = box.doors.filter(d => !ids.has(d.id) && d.kind !== 'open' && d.kind !== 'fridge');
  let minDelta = -Math.min(...moving.map(d=>d.startCm));
  let maxDelta = box.width - Math.max(...moving.map(d=>d.startCm + d.widthCm));
  const epsilon = 0.001;
  for (const d of moving) {
    for (const other of fixed) {
      const end = other.startCm + other.widthCm;
      if (end <= d.startCm + epsilon) minDelta = Math.max(minDelta, end - d.startCm);
      else if (other.startCm >= d.startCm + d.widthCm - epsilon)
        maxDelta = Math.min(maxDelta, other.startCm - d.startCm - d.widthCm);
      else return {ok:false,message:'یک درب انتخابی با درب ثابت هم‌پوشانی دارد'};
    }
  }
  if (minDelta > maxDelta + epsilon) return {ok:false,message:'فضای آزادی برای جابجایی این انتخاب وجود ندارد'};
  const lo = Math.min(...moving.map(d=>d.startCm));
  const hi = Math.max(...moving.map(d=>d.startCm+d.widthCm));
  const wanted = direction === 'left' ? minDelta : direction === 'right' ? maxDelta
    : (box.width - (hi-lo))/2-lo;
  const delta = Math.round(Math.max(minDelta,Math.min(maxDelta,wanted))*10)/10;
  if (Math.abs(delta) < .05) return {ok:false,message:'آیتم‌ها در نزدیک‌ترین موقعیت آزاد قرار دارند'};
  for (const d of moving) d.startCm=+(d.startCm+delta).toFixed(1);
  // Handles, door bands and CNC styles belong to door IDs and remain linked.
  box.doors.sort((a,b)=>a.startCm-b.startCm);
  return {ok:true,message:direction==='center'?'آیتم‌های انتخابی در مرکز باکس قرار گرفتند'
    : direction==='left'?'آیتم‌های انتخابی تا فضای آزاد سمت چپ منتقل شدند'
    :'آیتم‌های انتخابی تا فضای آزاد سمت راست منتقل شدند'};
}

/** The vertical-axis equal-size button equalizes *width* of the currently
 * selected upright doors. The group must be adjacent: no unrelated fronts
 * are changed, inserted or deleted. */
export function equalizeSelectedVerticalWidths(
  box: CabinetBox, selectedIds: readonly string[]
): LayoutResult {
  const selected = new Set(selectedIds);
  const doors = box.doors.filter(d=>selected.has(d.id) && d.kind==='door').sort((a,b)=>a.startCm-b.startCm);
  if(doors.length<2)return {ok:false,message:'حداقل دو درب عمودی را انتخاب کنید'};
  for(let i=1;i<doors.length;i++)
    if(Math.abs(doors[i].startCm-(doors[i-1].startCm+doors[i-1].widthCm))>1.5)
      return {ok:false,message:'درهای انتخابی برای یکسان‌سازی عرض باید پشت سر هم باشند'};
  const from=doors[0].startCm;
  const total=doors.reduce((n,d)=>n+d.widthCm,0);
  const eq=total/doors.length;
  if(eq<30||eq>60)return {ok:false,message:'عرض مساوی باید بین ۳۰ تا ۶۰ سانتی‌متر باشد'};
  let x=from;
  doors.forEach((d,i)=>{
    d.startCm=+x.toFixed(1);
    d.widthCm=i===doors.length-1?+(from+total-d.startCm).toFixed(1):+eq.toFixed(1);
    x=d.startCm+d.widthCm;
  });
  return {ok:true,message:`عرض ${doors.length} درب انتخابی برابر شد`};
}

/** Each DoorUnit of kind drawer models a vertical stack of drawer fronts.
 * Equalize the heights WITHIN selected stacks, without touching any
 * non-selected drawer, changing their count or their horizontal positions. */
export function equalizeSelectedDrawerHeights(
  box: CabinetBox, selectedIds: readonly string[]
): LayoutResult {
  const selected=new Set(selectedIds);
  const drawers=box.doors.filter(d=>selected.has(d.id) && d.kind==='drawer');
  if(drawers.length<2)return {ok:false,message:'حداقل دو مجموعه کشوی افقی را انتخاب کنید'};
  for(const d of drawers){
    const count=Math.max(2,d.drawerRatios.length+1);
    d.drawerRatios=Array.from({length:count-1},(_,i)=>+((i+1)/count).toFixed(4));
  }
  return {ok:true,message:`ارتفاع کشوهای ${drawers.length} مجموعه انتخابی برابر شد`};
}
