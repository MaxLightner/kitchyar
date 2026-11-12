/* Deterministic rectangular MaxRects heuristic for a schematic MDF front plan.
   Dimensions are millimetres. This is NOT a CNC cutting or kerf-compensation file. */
export const DEFAULT_SHEET=Object.freeze({widthMm:2800,heightMm:2070,kerfMm:3,marginMm:10});

export function validateSheetOptions(input={}){
 const o={...DEFAULT_SHEET,...input};
 for(const name of ['widthMm','heightMm','kerfMm','marginMm'])
  if(!Number.isFinite(Number(o[name])))throw RangeError('ابعاد ورق یا فاصله برش معتبر نیست.');
 const widthMm=Math.round(Number(o.widthMm)),heightMm=Math.round(Number(o.heightMm)),
  kerfMm=Number(o.kerfMm),marginMm=Number(o.marginMm);
 if(widthMm<1000||widthMm>5000||heightMm<800||heightMm>4000||
  kerfMm<0||kerfMm>12||marginMm<0||marginMm>80||
  widthMm<=2*marginMm||heightMm<=2*marginMm)
  throw RangeError('ابعاد ورق، حاشیه یا فاصله تیغ خارج از محدوده مجاز است.');
 return {widthMm,heightMm,kerfMm,marginMm};
}

const intersects=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const contains=(a,b)=>a.x<=b.x&&a.y<=b.y&&a.x+a.w>=b.x+b.w&&a.y+a.h>=b.y+b.h;

function occupy(free,used){
 const split=[];
 for(const f of free){
  if(!intersects(f,used)){split.push(f);continue;}
  if(used.x>f.x)split.push({x:f.x,y:f.y,w:used.x-f.x,h:f.h});
  if(used.x+used.w<f.x+f.w)split.push({x:used.x+used.w,y:f.y,w:f.x+f.w-used.x-used.w,h:f.h});
  if(used.y>f.y)split.push({x:f.x,y:f.y,w:f.w,h:used.y-f.y});
  if(used.y+used.h<f.y+f.h)split.push({x:f.x,y:used.y+used.h,w:f.w,h:f.y+f.h-used.y-used.h});
 }
 return split.filter((a,i)=>a.w>0&&a.h>0&&!split.some((b,j)=>i!==j&&contains(b,a)&&
  (!contains(a,b)||j<i)));
}

function rotations(piece){
 const w=piece.widthMm,h=piece.heightMm;
 if(piece.wood){
  // MDF grain runs along the 2800 mm sheet axis (x). A vertical door must
  // have its HEIGHT along x; a horizontal drawer has its WIDTH along x.
  return [piece.grain==='عمودی'?{w:h,h:w,rotated:true}:{w,h,rotated:false}];
 }
 return w===h?[{w,h,rotated:false}]:
  [{w,h,rotated:false},{w:h,h:w,rotated:true}];
}
function placementFor(sheet,piece,options){
 let best=null;
 for(const choice of rotations(piece))for(const free of sheet.free){
  const w=choice.w+options.kerfMm,h=choice.h+options.kerfMm;
  if(w>free.w+.0001||h>free.h+.0001)continue;
  const short=Math.min(free.w-w,free.h-h),area=free.w*free.h-w*h;
  if(!best||short<best.short||short===best.short&&area<best.area)
   best={x:free.x,y:free.y,w,h,cutWidthMm:choice.w,cutHeightMm:choice.h,
    rotated:choice.rotated,short,area};
 }
 return best;
}

export function nestFronts(fronts,optionsInput={}){
 const options=validateSheetOptions(optionsInput);
 const groups=new Map(),unplaced=[];
 for(const f of fronts){
  const key=f.materialId||f.material||'نامشخص';
  if(!groups.has(key))groups.set(key,{materialId:key,material:f.material||key,pieces:[]});
  const qty=Math.max(1,Math.min(999,Math.round(f.quantity||1)));
  for(let i=0;i<qty;i++)groups.get(key).pieces.push({
   code:qty>1?f.code+'-'+(i+1):f.code,widthMm:f.widthMm,heightMm:f.heightMm,
   grain:f.grain,wood:!!f.wood,type:f.type,cabinet:f.cabinet,style:f.style});
 }
 const sheets=[],materials=[];
 for(const group of groups.values()){
  group.pieces.sort((a,b)=>Math.max(b.widthMm,b.heightMm)-Math.max(a.widthMm,a.heightMm)||
   b.widthMm*b.heightMm-a.widthMm*a.heightMm||a.code.localeCompare(b.code));
  const local=[];
  const newSheet=()=>({code:'V'+String(sheets.length+local.length+1).padStart(2,'0'),
   materialId:group.materialId,material:group.material,wood:group.pieces.some(p=>p.wood),
   widthMm:options.widthMm,heightMm:options.heightMm,
   free:[{x:options.marginMm,y:options.marginMm,
    w:options.widthMm-2*options.marginMm,h:options.heightMm-2*options.marginMm}],
   placements:[],usedAreaSqm:0});
  for(const piece of group.pieces){
   if(!(piece.widthMm>0&&piece.heightMm>0)){
    unplaced.push({...piece,material:group.material,reason:'ابعاد نامعتبر'});continue;
   }
   let best=null,target=null;
   for(const sheet of local){
    const fit=placementFor(sheet,piece,options);
    if(fit&&(!best||fit.short<best.short||fit.short===best.short&&fit.area<best.area)){
     best=fit;target=sheet;
    }
   }
   if(!best){
    const sheet=newSheet(),fit=placementFor(sheet,piece,options);
    if(!fit){unplaced.push({...piece,material:group.material,reason:'بزرگ‌تر از فضای قابل برش ورق'});continue;}
    local.push(sheet);best=fit;target=sheet;
   }
   target.free=occupy(target.free,best);
   target.placements.push({...piece,xMm:best.x,yMm:best.y,
    cutWidthMm:best.cutWidthMm,cutHeightMm:best.cutHeightMm,rotated:best.rotated});
   target.usedAreaSqm+=piece.widthMm*piece.heightMm/1e6;
  }
  for(const sheet of local){
   sheet.usedAreaSqm=Math.round(sheet.usedAreaSqm*1000)/1000;
   sheet.utilizationPct=Math.round(1000*sheet.usedAreaSqm/(sheet.widthMm*sheet.heightMm/1e6))/10;
   delete sheet.free;
   sheets.push(sheet);
  }
  materials.push({materialId:group.materialId,material:group.material,
   pieces:group.pieces.length,placed:local.reduce((n,s)=>n+s.placements.length,0),
   sheetCount:local.length,areaSqm:Math.round(group.pieces.reduce((n,p)=>n+p.widthMm*p.heightMm/1e6,0)*1000)/1000});
 }
 return {options,sheets,materials,unplaced,totalSheets:sheets.length,
  placedPieces:sheets.reduce((n,s)=>n+s.placements.length,0)};
}
