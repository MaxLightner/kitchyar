import {lengthOf} from './geometry.js?v=gallery2';
const escape=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmt=n=>(Math.round(n*100)/100).toFixed(2);
const skins={cream:'#d9d5c9',wood:'#b99b76',graphite:'#626c75'};
export function sideElevationOptions(items,activeId=null,side=1){
 const walls=items.filter(o=>o.kind==='wall'&&items.some(c=>c.kind==='cabinet'&&c.hostId===o.id));
 return walls.flatMap((w,i)=>[1,-1].filter(s=>items.some(c=>c.kind==='cabinet'&&c.hostId===w.id&&(c.side||1)===s)).map(s=>({
  id:w.id,side:s,title:'ضلع '+(i+1)+' · سمت '+(s>0?'اول':'دوم'),selected:w.id===activeId&&s===side
 })));
}
/* A single metric elevation for the selected physical wall side. All selectable
   rectangles are views of existing semantic objects, not a second design model. */
export function renderSideElevation(items,{wallId=null,side=1,selectedId=null,tool='select'}={}){
 const options=sideElevationOptions(items,wallId,side);
 if(!options.length)return '<div class="elevation-empty">ابتدا در پلان یا سه‌بعدی، دیوار و کابینت‌ها را بساز.</div>';
 const selected=options.find(o=>o.selected)||options[0];
 const wall=items.find(o=>o.id===selected.id),length=lengthOf(wall);
 const cabinets=items.filter(c=>c.kind==='cabinet'&&c.hostId===wall.id&&(c.side||1)===selected.side&&c.subtype!=='bridge');
 const scale=Math.max(100,Math.min(175,700/Math.max(length,1)));
 const left=40,bottom=Math.max(410,Math.round(wall.height*scale)+35),height=bottom+58,width=Math.max(500,Math.ceil(length*scale+80));
 const x=t=>left+(selected.side===1?t:1-t)*length*scale;
 const y=h=>bottom-h*scale;
 const tools=[['select','انتخاب'],['pencilV','✎ خط عمودی'],['pencilH','✎ خط افقی'],['eraseV','⌫ پاک کردن عمودی'],['eraseH','⌫ پاک کردن افقی']];
 let html='<div class="side-elevation-ui"><div class="side-elevation-top"><label>نمای روبه‌روی ضلع <select data-elevation-wall>'+
  options.map(o=>'<option value="'+escape(o.id)+'|'+o.side+'" '+(o.id===selected.id&&o.side===selected.side?'selected':'')+'>'+escape(o.title)+'</option>').join('')+
  '</select></label><button data-action="front-autofill">یونیت‌گذاری اولیه</button></div>'+
  '<div class="side-elevation-tools">'+tools.map(([id,label])=>'<button data-action="front-tool" data-tool="'+id+'" class="'+(tool===id?'selected':'')+'">'+label+'</button>').join('')+'</div>'+
  '<div class="side-elevation-tools"><button data-action="front-equalize" data-axis="width">توزیع مساوی عرض ↔</button><button data-action="front-equalize" data-axis="height">توزیع مساوی ارتفاع ↕</button></div>'+ 
  '<div class="side-elevation-scroll"><svg id="side-elevation-view" viewBox="0 0 '+width+' '+height+'" style="width:'+width+'px;height:'+height+'px" role="img" aria-label="نمای متریک و قابل انتخاب کابینت‌ها">'+
  '<rect x="'+left+'" y="'+y(wall.height)+'" width="'+(length*scale)+'" height="'+(wall.height*scale)+'" fill="#edf0ef" stroke="#d2d8db"/>';
 for(const c of cabinets){
  const a=x(c.startT),b=x(c.endT),xx=Math.min(a,b),w=Math.abs(a-b);
  const yy=y(c.elevation+c.height),h=c.height*scale;
  html+='<rect data-item-id="'+escape(c.id)+'" x="'+xx+'" y="'+yy+'" width="'+w+'" height="'+h+'" fill="#e2dfd8" stroke="'+(selectedId===c.id?'#2563eb':'#7e8a8b')+'" stroke-width="'+(selectedId===c.id?3:1.5)+'"/>';
  const panels=items.filter(f=>f.kind==='front'&&f.hostId===c.id);
  for(const f of panels){
   const f1=x(c.startT+(c.endT-c.startT)*f.startT),f2=x(c.startT+(c.endT-c.startT)*f.endT);
   const fx=Math.min(f1,f2),fw=Math.max(1,Math.abs(f2-f1)),fy=y(c.elevation+f.topT*c.height),fh=Math.max(1,(f.topT-f.bottomT)*c.height*scale);
   const isSelected=selectedId===f.id;
   let color=skins[f.finish]||skins.cream;
   if(f.mirror)color='#bddce9';
   if(f.style==='glass')color='#b8d5d6';
   if(f.style==='open')color='#f8f5ee';
   html+='<g class="side-elevation-panel"><rect data-elevation-front="true" data-side="'+selected.side+'" data-item-id="'+escape(f.id)+'" x="'+(fx+1)+'" y="'+(fy+1)+'" width="'+Math.max(1,fw-2)+'" height="'+Math.max(1,fh-2)+'" fill="'+color+'" stroke="'+(isSelected?'#2563eb':'#8c928c')+'" stroke-width="'+(isSelected?3:1.1)+'" style="cursor:crosshair"/>';
   if(f.style==='frame')html+='<rect x="'+(fx+7)+'" y="'+(fy+7)+'" width="'+Math.max(0,fw-14)+'" height="'+Math.max(0,fh-14)+'" fill="none" stroke="#9b8f79" pointer-events="none"/>';
   if(f.subtype==='drawer')html+='<line x1="'+(fx+fw*.33)+'" y1="'+(fy+Math.min(16,fh*.25))+'" x2="'+(fx+fw*.67)+'" y2="'+(fy+Math.min(16,fh*.25))+'" stroke="#687581" stroke-width="3" pointer-events="none"/>';
   if(f.style==='open'&&f.shelfCount)for(let j=1;j<=f.shelfCount;j++)html+='<line x1="'+(fx+3)+'" y1="'+(fy+fh*j/(f.shelfCount+1))+'" x2="'+(fx+fw-3)+'" y2="'+(fy+fh*j/(f.shelfCount+1))+'" stroke="#a88965" stroke-width="4" pointer-events="none"/>';
   if(fw>60&&fh>35)html+='<text x="'+(fx+fw/2)+'" y="'+(fy+fh/2)+'" text-anchor="middle" font-size="12" fill="#495963" pointer-events="none">'+escape(f.mirror?'آینه':f.style==='glass'?'شیشه':f.style==='open'?(f.shelfCount?'قفسه':'باز'):f.subtype==='drawer'?'کشو':f.hinge==='top'?'درب افقی':'درب')+'</text>';
   html+='</g>';
  }
  html+='<text x="'+(xx+w/2)+'" y="'+(yy+h+16)+'" fill="#53616e" font-size="11" text-anchor="middle">'+fmt(lengthOf(c))+'m</text>';
 }
 for(const e of items.filter(o=>o.kind==='equipment'&&['sink','dishwasher','washer','oven','stove'].includes(o.subtype))){
  const c=items.find(k=>k.id===e.hostId);
  if(!c||c.hostId!==wall.id||(c.side||1)!==selected.side)continue;
  const centre=c.startT+(c.endT-c.startT)*(e.offsetT??.5);
  const xx=x(centre),rw=e.width*scale;
  if(e.subtype==='sink'||e.subtype==='stove'){
   html+='<path d="M '+(xx-rw/2)+' '+(y(c.elevation+c.height)-7)+' h '+rw+'" stroke="#3f869a" stroke-width="5"/>';
  }else{
   html+='<rect data-item-id="'+escape(e.id)+'" x="'+(xx-rw/2)+'" y="'+y(c.elevation+c.height)+'" width="'+rw+'" height="'+Math.min(c.height,e.height)*scale+'" fill="#b9cbd1" fill-opacity=".85" stroke="#607988"/>';
  }
 }
 html+='<line x1="'+left+'" y1="'+(bottom+4)+'" x2="'+(left+length*scale)+'" y2="'+(bottom+4)+'" stroke="#768291"/>'+
  '<text x="'+(left+length*scale/2)+'" y="'+(bottom+42)+'" fill="#43556c" font-size="12" text-anchor="middle">طول ضلع '+fmt(length)+' متر</text></svg></div>'+
  '<div class="side-elevation-palette">'+[['door','درب'],['lift','افقی'],['drawer','کشو'],['glass','شیشه'],['mirror','آینه'],['open','فضای باز'],['shelf','قفسه'],['frame','قاب']].map(([id,label])=>
   '<button data-action="front-set-type" data-type="'+id+'">'+label+'</button>').join('')+'</div>'+
  '<small>مداد: روی خانه کلیک کن تا در همان محل تقسیم شود. پاک‌کن: با کلیک روی خانه، مرز مشترک آن در جهت انتخاب‌شده حذف می‌شود. هر تغییر مستقیماً در سه‌بعدی ثبت می‌شود.</small></div>';
 return html;
}
