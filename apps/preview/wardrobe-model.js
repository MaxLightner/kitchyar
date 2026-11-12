import {chooseFacadeBayCount} from './optimization-rules.js';

// Metres. Wardrobe rules are independent of kitchen fixture/upper-unit rules.
export const WARDROBE_RULES=Object.freeze({board:.018,back:.008,gap:.003,base:0,
 minWidth:.6,maxWidth:6,minHeight:1.8,maxHeight:3.2,minDepth:.45,maxDepth:.8,
 minBay:.35,maxBay:1.2,minLeaf:.35,maxLeaf:.65,drawerClearance:.045,drawerSetback:.08,
 deskHeight:.75,minKnee:.70,minDeskClearWidth:.70,minDeskDepth:.55,hingeAngle:Math.PI/2,hingeOffset:.022});
export const WARDROBE_ROLES=Object.freeze({'long-hang':'آویز بلند','double-hang':'آویز دوطبقه',shelves:'طبقات',
 'drawers-hang':'کشوی داخلی و آویز',desk:'میز و طبقهٔ بالا'});
const copy=x=>structuredClone(x),uid=()=>crypto.randomUUID();
const R=WARDROBE_RULES;
const leafCount=width=>Math.min(2,Math.max(1,Math.ceil(width/R.maxLeaf)));
const finite=(n,min,max)=>Number.isFinite(n)&&n>=min-1e-7&&n<=max+1e-7;
export function defaultWardrobe(width=2.4){
 const leaves=chooseFacadeBayCount(width,{minimum:R.minLeaf,maximum:R.maxLeaf}),leaf=width/leaves,bays=[];
 for(let i=0;i<leaves;i+=2)bays.push({key:'bay-'+bays.length,width:leaf*Math.min(2,leaves-i),
  role:['long-hang','drawers-hang','shelves'][bays.length%3],shelves:4,drawers:3,mirrors:[]});
 return {version:1,width,height:2.4,depth:.6,finish:'ivory-matte',bays};
}
export function validateWardrobe(config){
 const {width,height,depth,bays}=config;
 if(!finite(width,R.minWidth,R.maxWidth)||!finite(height,R.minHeight,R.maxHeight)||!finite(depth,R.minDepth,R.maxDepth))
  throw Error('عرض ۶۰ تا ۶۰۰، ارتفاع ۱۸۰ تا ۳۲۰ و عمق ۴۵ تا ۸۰ سانتی‌متر مجاز است.');
 if(!Array.isArray(bays)||!bays.length||bays.length>16||Math.abs(bays.reduce((s,b)=>s+b.width,0)-width)>1e-6)
  throw Error('جمع عرض بخش‌ها باید با عرض کمد برابر باشد.');
 if(new Set(bays.map(b=>b.key)).size!==bays.length)throw Error('شناسهٔ بخش‌های کمد تکراری است.');
 for(const b of bays){
  if(!finite(b.width,R.minBay,R.maxBay)||!Object.hasOwn(WARDROBE_ROLES,b.role))throw Error('عرض یا کاربری بخش معتبر نیست؛ عرض بخش بین ۳۵ تا ۱۲۰ سانتی‌متر باشد.');
  if(!Number.isInteger(b.shelves)||b.shelves<0||b.shelves>8||!Number.isInteger(b.drawers)||b.drawers<1||b.drawers>5)
   throw Error('تعداد طبقه بین صفر تا ۸ و تعداد کشو بین ۱ تا ۵ باشد.');
  if(['long-hang','double-hang','drawers-hang'].includes(b.role)&&depth<.55)throw Error('برای آویز لباس، عمق کمد حداقل ۵۵ سانتی‌متر باشد.');
  if(b.role==='desk'&&(b.width-2*R.board<R.minDeskClearWidth||depth<R.minDeskDepth))
   throw Error('بخش میز به عرض خالص حداقل ۷۰ و عمق حداقل ۵۵ سانتی‌متر نیاز دارد؛ عرض بخش را افزایش بده.');
  if(b.role==='drawers-hang'&&height-.41-(.04+b.drawers*.19+.035)<.75)
   throw Error('بالای کشوها فضای آویز کافی نمی‌ماند؛ تعداد کشو را کم کن یا ارتفاع کمد را بیشتر کن.');
  const count=leafCount(b.width);
  if(b.role!=='desk'&&!finite(b.width/count,R.minLeaf,R.maxLeaf))throw Error('عرض بخش برای تقسیم درها مناسب نیست؛ عرض یا تعداد بخش‌ها را اصلاح کن.');
 }
 return config;
}
export function resizeWardrobe(config,{width=config.width,height=config.height,depth=config.depth}={}){
 const next=copy(config),ratio=width/next.width;
 next.width=width;next.height=height;next.depth=depth;
 next.bays=next.bays.map(b=>({...b,width:b.width*ratio}));
 return validateWardrobe(next);
}
export function editWardrobeBay(config,key,patch){
 const next=copy(config),index=next.bays.findIndex(b=>b.key===key);if(index<0)throw Error('بخش انتخاب‌شده وجود ندارد.');
 const bay=next.bays[index],delta=(patch.width??bay.width)-bay.width;
 if(Math.abs(delta)>1e-7){
  const neighbor=next.bays[index+1]||next.bays[index-1];
  if(!neighbor)throw Error('برای تغییر عرض تک‌بخش، عرض کل کمد را تغییر بده.');
  neighbor.width-=delta;
 }
 Object.assign(bay,patch);return validateWardrobe(next);
}
export function splitWardrobeBay(config,key,ratio=.5){
 const next=copy(config),index=next.bays.findIndex(b=>b.key===key),b=next.bays[index];
 if(!b||b.width<2*R.minBay)throw Error('برای دو بخش، عرض این بخش حداقل ۷۰ سانتی‌متر باشد.');
 const left=Math.round(b.width*Number(ratio)*100)/100,right=b.width-left;
 if(!finite(left,R.minBay,R.maxBay)||!finite(right,R.minBay,R.maxBay))
  throw Error('مرز جدید باید حداقل ۳۵ سانتی‌متر از دو طرف فاصله داشته باشد.');
 next.bays.splice(index,1,{...b,width:left,mirrors:[]},{...copy(b),key:uid(),width:right,mirrors:[]});
 return validateWardrobe(next);
}
/* Pencil/eraser shelves belong to the semantic wardrobe model, not SVG decoration. */
export function addWardrobeShelf(config,key,heightRatio){
 const next=copy(config),b=next.bays.find(b=>b.key===key),at=Math.round(Number(heightRatio)*100)/100;
 if(!b||!finite(at,.08,.92))throw Error('محل طبقه باید داخل محدوده باکس باشد.');
 if(b.role==='desk'&&at*next.height<.84)throw Error('طبقه نمی‌تواند فضای زانوی میز را مسدود کند.');
 if(b.role==='drawers-hang'&&at*next.height<.04+b.drawers*.19+.09)
  throw Error('طبقه نباید با کشوهای داخلی تداخل داشته باشد.');
 const prior=b.extraShelves||[];
 if(prior.some(v=>Math.abs(v-at)<.075)||(b.role==='shelves'&&Array.from({length:b.shelves},(_,i)=>(i+1)/(b.shelves+1)).some(v=>Math.abs(v-at)<.055)))
  throw Error('فاصله طبقات کافی نیست.');
 b.extraShelves=[...prior,at].sort((a,b)=>a-b);return validateWardrobe(next);
}
export function eraseWardrobeShelf(config,key,heightRatio){
 const next=copy(config),b=next.bays.find(b=>b.key===key),at=Number(heightRatio);
 if(!b||!b.extraShelves?.length)throw Error('در این بخش طبقه دستی قابل پاک‌کردن وجود ندارد.');
 const distances=b.extraShelves.map((v,i)=>({v,i,d:Math.abs(v-at)})).sort((a,b)=>a.d-b.d);
 if(distances[0].d>.12)throw Error('نزدیک‌تر به خط طبقه کلیک کن.');
 b.extraShelves.splice(distances[0].i,1);return validateWardrobe(next);
}
export function joinWardrobeBay(config,key){
 const next=copy(config),index=next.bays.findIndex(b=>b.key===key);
 if(index<0||!next.bays[index+1])throw Error('بخش بعدی برای ادغام وجود ندارد.');
 next.bays[index].width+=next.bays[index+1].width;next.bays.splice(index+1,1);
 return validateWardrobe(next);
}
export function wardrobeSections(c){
 let cursor=0;const {width}=c.wardrobe;
 return c.wardrobe.bays.map((b,i)=>{
  const start=cursor;cursor+=b.width;const end=i===c.wardrobe.bays.length-1?width:cursor;
  const left=start-width/2+(i===0?R.board:R.board/2),right=end-width/2-(i===c.wardrobe.bays.length-1?R.board:R.board/2);
  return {...b,index:i,start,end,left,right,clear:right-left};
 });
}
export function wardrobeItems(config,previous=[]){
 validateWardrobe(config);const old=previous.find(c=>c.kind==='cabinet'&&c.wardrobe),id=old?.id||uid(),wallId=old?.hostId||uid();
 const {width:w,height:h,depth:d}=config;
 const wall={id:wallId,kind:'wall',name:'دیوار کمد',x1:-w/2-.15,z1:0,x2:w/2+.15,z2:0,thickness:.12,height:h+R.base+.1};
 const c={id,hostId:wallId,kind:'cabinet',subtype:'tall',name:'کمد',x1:-w/2,x2:w/2,z1:.064+d/2,z2:.064+d/2,
  startT:.15/(w+.3),endT:(w+.15)/(w+.3),side:1,elevation:R.base,height:h,depth:d,
  tallFrontsEnabled:false,tallShelves:0,frontPreset:'wardrobe',wardrobe:copy(config),decor:{endPanel:'none'}};
 const oldById=new Map(previous.map(o=>[o.id,o])),fronts=[];
 const front=(b,subtype,index,start,end,bottom,top,extra={})=>{
  const fid=id+'-'+b.key+'-'+subtype+'-'+index,prior=oldById.get(fid);
  return {id:fid,kind:'front',subtype,name:subtype==='door'?'درب کمد':'کشوی داخلی',hostId:id,preset:'wardrobe',bay:b.index,
   wardrobeBay:b.key,part:index,startT:start/w,endT:end/w,bottomT:bottom/h,topT:top/h,
   gap:R.gap,hinge:subtype==='door'?(index%2?'right':'left'):'none',finish:'cream',style:'flat',handleStyle:'bar',handleFinish:'steel',materialId:config.finish,
   openFraction:prior?.openFraction||0,...extra};
 };
 for(const b of wardrobeSections(c)){
  if(b.role!=='desk'){
   const n=leafCount(b.width);
   for(let j=0;j<n;j++)fronts.push(front(b,'door',j,b.start+b.width*j/n,j===n-1?b.end:b.start+b.width*(j+1)/n,0,h,{mirror:!!b.mirrors?.[j]}));
  }
  if(b.role==='drawers-hang'){
   const start=b.left+w/2+R.drawerClearance,end=b.right+w/2-R.drawerClearance;
   for(let j=0;j<b.drawers;j++)fronts.push(front(b,'drawer',j,start,end,.04+j*.19,.04+(j+1)*.19,{wardrobeInternal:true}));
  }
 }
 // A structural edit closes drawers that are no longer behind open doors.
 for(const f of fronts.filter(f=>f.wardrobeInternal))if(fronts.some(d=>d.subtype==='door'&&d.wardrobeBay===f.wardrobeBay&&d.openFraction<.99))f.openFraction=0;
 return [wall,c,...fronts];
}
const board=(part,x,y,z,width,height,depth,bay=null)=>({part,x,y,z,width,height,depth,bay});
export function wardrobePanels(c){
 const {width:w,height:h,depth:d}=c.wardrobe,t=R.board,bt=R.back,y=c.elevation||0;
 const panels=[board('left-side',-w/2+t/2,y+h/2,0,t,h,d),board('right-side',w/2-t/2,y+h/2,0,t,h,d),
  board('top',0,y+h-t/2,bt/2,w-2*t,t,d-bt),board('back',0,y+h/2,-d/2+bt/2,w-2*t,h,bt)];
 const shelf=(part,b,at)=>panels.push(board(part,(b.left+b.right)/2,y+at,(bt-.045)/2,b.clear,t,d-bt-.045,b.key));
 for(const b of wardrobeSections(c)){
  if(b.index)panels.push(board('divider',b.start-w/2,y+h/2,bt/2,t,h-2*t,d-bt,b.key));
  if(b.role!=='desk')shelf('bottom',b,t/2);
  if(['long-hang','double-hang','drawers-hang'].includes(b.role))shelf('top-shelf',b,h-.30);
  if(b.role==='shelves')for(let j=1;j<=b.shelves;j++)shelf('shelf',b,t+(h-2*t)*j/(b.shelves+1));
  for(const position of b.extraShelves||[])shelf('custom-shelf',b,t+(h-2*t)*position);
  if(b.role==='drawers-hang')shelf('drawer-cap',b,.04+b.drawers*.19+.035);
  if(b.role==='desk'){
   shelf('desk-top',b,R.deskHeight-y-t/2);
   shelf('desk-upper-shelf',b,Math.max(1.50,h-.65));
  }
 }
 return panels;
}
export function wardrobeRods(c){
 const h=c.height,y=c.elevation||0;
 return wardrobeSections(c).flatMap(b=>{
  if(!['long-hang','double-hang','drawers-hang'].includes(b.role))return [];
  return (b.role==='double-hang'?[h-.41,(h-.30)/2]:[h-.41]).map(at=>({bay:b.key,x:(b.left+b.right)/2,y:y+at,z:0,length:b.clear-.02,radius:.0125}));
 });
}
// Shared tray dimensions for the actual 3D mesh and the parts list.
export function drawerTrayPanels(pose,host){
 const depth=Math.min(host.depth*.75,.48),width=Math.max(.10,pose.width-.036),
  wall=.012,low=-pose.height/2+.025,rail=Math.max(.045,Math.min(.14,pose.height*.52));
 const z=-pose.side*(depth/2+.017),back=-pose.side*(depth+.011);
 return [board('drawer-bottom',0,low,z,width,.014,depth),
  board('drawer-side',-width/2+wall/2,low+rail/2,z,wall,rail,depth),
  board('drawer-side',width/2-wall/2,low+rail/2,z,wall,rail,depth),
  board('drawer-back',0,low+rail/2,back,width,rail,wall)];
}
export function setWardrobeOpening(items,id,open){
 const next=copy(items),f=next.find(o=>o.id===id&&o.kind==='front');if(!f)throw Error('در یا کشو انتخاب نشده است.');
 if(f.wardrobeInternal&&open&&next.some(d=>d.kind==='front'&&d.subtype==='door'&&d.wardrobeBay===f.wardrobeBay&&d.openFraction<.99))
  throw Error('ابتدا همهٔ درهای همین بخش را کامل باز کن؛ سپس کشوی داخلی را باز کن.');
 if(f.subtype==='door'&&!open&&next.some(d=>d.wardrobeInternal&&d.wardrobeBay===f.wardrobeBay&&d.openFraction>.01))
  throw Error('پیش از بستن در، کشوهای داخلی همین بخش را ببند.');
 f.openFraction=open?1:0;return next;
}
export function openWardrobeDoors(items,open){
 return items.map(o=>o.kind!=='front'?copy(o):{...copy(o),openFraction:o.subtype==='door'&&open?1:0});
}
