/* Printable, standalone cutting schedule. All text is derived from the same
   semantic project data used by AR, rather than rasterized scene images. */
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const n=value=>Math.round(Number(value)||0).toLocaleString('fa-IR');
const dec=value=>Number(value||0).toLocaleString('fa-IR',{maximumFractionDigits:3});
const table=(headings,rows,empty='موردی ثبت نشده است.')=>
 '<div class="report-table-wrap"><table class="report-table"><thead><tr>'+headings.map(h=>'<th>'+esc(h)+'</th>').join('')+
 '</tr></thead><tbody>'+(rows.length?rows.map(cells=>'<tr>'+cells.map(cell=>'<td>'+esc(cell)+'</td>').join('')+'</tr>').join(''):
 '<tr><td colspan="'+headings.length+'">'+esc(empty)+'</td></tr>')+'</tbody></table></div>';

function facadeSketch(c){
 const w=900,h=205,x0=50,y0=30;
 let svg='<svg class="report-svg" viewBox="0 0 1000 290" role="img" aria-label="نمای شماتیک '+esc(c.code)+'">'+
  '<rect x="'+x0+'" y="'+y0+'" width="'+w+'" height="'+h+'" rx="2" fill="#f3f0e8" stroke="#819388" stroke-width="2"/>';
 for(const f of c.fronts){
  const x=x0+f.startT*w+2,y=y0+(1-f.topT)*h+2;
  const width=Math.max(5,(f.endT-f.startT)*w-4),height=Math.max(5,(f.topT-f.bottomT)*h-4);
  svg+='<rect x="'+x+'" y="'+y+'" width="'+width+'" height="'+height+'" rx="2" fill="'+
   (f.type==='کشو'?'#d3e2dc':'#eadac2')+'" stroke="#65776b" stroke-width="1.3"/>';
  if(f.style==='قاب‌دار'&&width>40&&height>30)svg+='<rect x="'+(x+7)+'" y="'+(y+7)+'" width="'+(width-14)+'" height="'+(height-14)+'" fill="none" stroke="#9f967c"/>';
  if(width>38&&height>24)svg+='<text x="'+(x+width/2)+'" y="'+(y+height/2-3)+'" text-anchor="middle" class="report-svg-code">'+f.code+'</text>';
  if(width>60&&height>44)svg+='<text x="'+(x+width/2)+'" y="'+(y+height/2+16)+'" text-anchor="middle" class="report-svg-dim">'+n(f.widthMm)+' × '+n(f.heightMm)+'</text>';
 }
 svg+='<line x1="'+x0+'" y1="253" x2="'+(x0+w)+'" y2="253" stroke="#74887b" stroke-width="1.5"/>'+
  '<path d="M'+x0+' 246v14 M'+(x0+w)+' 246v14" stroke="#74887b" stroke-width="1.5"/>'+
  '<text x="500" y="277" text-anchor="middle" class="report-svg-dim">طول '+n(c.lengthMm)+' میلی‌متر · ارتفاع '+n(c.heightMm)+' میلی‌متر</text></svg>';
 return svg;
}

function countertopSketch(c){
 const x=50,y=34,w=900,h=160;
 let svg='<svg class="report-svg" viewBox="0 0 1000 265" role="img" aria-label="پلان صفحه '+esc(c.code)+'">'+
  '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="#ece5dc" stroke="#85786a" stroke-width="2"/>';
 for(const hole of c.holes){
  const left=x+hole.leftMm/c.lengthMm*w,wide=hole.widthMm/c.lengthMm*w;
  const tall=hole.depthMm/c.depthMm*h,top=y+(h-tall)/2;
  svg+='<rect x="'+left+'" y="'+top+'" width="'+wide+'" height="'+tall+'" rx="2" fill="#f8faf7" stroke="#b3694e" stroke-width="2" stroke-dasharray="5 3"/>'+
   '<text x="'+(left+wide/2)+'" y="'+(top+tall/2+4)+'" text-anchor="middle" class="report-svg-code">'+hole.code+'</text>';
 }
 svg+='<path d="M'+x+' 210v12 M'+(x+w)+' 210v12 M'+x+' 216H'+(x+w)+'" stroke="#84796e" fill="none" stroke-width="1.5"/>'+
  '<text x="500" y="236" text-anchor="middle" class="report-svg-dim">طول '+n(c.lengthMm)+' میلی‌متر</text>'+
  '<text x="500" y="255" text-anchor="middle" class="report-svg-dim">عمق تقریبی '+n(c.depthMm)+' میلی‌متر</text></svg>';
 return svg;
}

function mdfSheetSketch(sheet){
 const scale=860/sheet.widthMm,x0=65,y0=48,height=sheet.heightMm*scale;
 let svg='<svg class="report-svg report-sheet-svg" viewBox="0 0 990 '+Math.ceil(height+112)+'" role="img" aria-label="چیدمان قطعات ورق '+esc(sheet.code)+'">'+
  '<rect x="'+x0+'" y="'+y0+'" width="860" height="'+height+'" fill="#f7f4ea" stroke="#607e6e" stroke-width="2.5"/>';
 for(const p of sheet.placements){
  const x=x0+p.xMm*scale,y=y0+p.yMm*scale,w=p.cutWidthMm*scale,h=p.cutHeightMm*scale;
  const color=p.type==='کشو'?'#cce2db':'#ead8be';
  svg+='<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="'+color+'" stroke="#476956" stroke-width="1.3"/>';
  if(w>38&&h>18)svg+='<text x="'+(x+w/2)+'" y="'+(y+h/2-1)+'" text-anchor="middle" class="report-svg-code">'+esc(p.code)+'</text>';
  if(w>80&&h>40)svg+='<text x="'+(x+w/2)+'" y="'+(y+h/2+16)+'" text-anchor="middle" class="report-svg-dim">'+n(p.widthMm)+'×'+n(p.heightMm)+'</text>';
  if(p.wood&&w>65&&h>20){
   const yy=y+h-11,x1=x+12,x2=x+w-12;
   svg+='<path d="M'+x1+' '+yy+' H'+x2+' m-5 -4 l5 4 -5 4 M'+x1+' '+yy+' l5 -4 M'+x1+' '+yy+' l5 4" fill="none" stroke="#7e5b37" stroke-width="1.4"/>';
  }
 }
 svg+='<text x="495" y="'+(height+y0+29)+'" text-anchor="middle" class="report-svg-dim">طول ورق '+n(sheet.widthMm)+' میلی‌متر · جهت رگه ↔</text>'+
  '<text x="495" y="'+(height+y0+51)+'" text-anchor="middle" class="report-svg-dim">عرض ورق '+n(sheet.heightMm)+' میلی‌متر · مبدا مختصات گوشه بالا-چپ</text></svg>';
 return svg;
}

export function renderCutReport(report){
 const summary=[['درب',n(report.totals.doors)],['کشو',n(report.totals.drawers)],
  ['ورق MDF نما',n(report.totals.mdfSheets)],['صفحه',n(report.totals.slabs)],['برش سینک/گاز',n(report.totals.cutouts)],
  ['متراژ نما',dec(report.totals.frontAreaSqm)+' مترمربع'],
  ['طول تقریبی صفحه',dec(report.totals.counterLengthM)+' متر']];
 const fronts=table(['کد','کابینت','نوع','عرض mm','ارتفاع mm','تعداد','متریال','طرح','جهت رگه','لولا','درز mm'],
  report.fronts.map(f=>[f.code,f.cabinet,f.type,n(f.widthMm),n(f.heightMm),n(f.quantity),f.material,f.style,f.grain,f.hinge,n(f.gapMm)]));
 const slabs=table(['کد','طول mm','عمق mm','متریال','لبه','آبشاری','ارتفاع اضافه mm','گوشه گرد mm','انحنای جلو mm','تعداد برش'],
  report.countertop.map(c=>[c.code,n(c.lengthMm),n(c.depthMm),c.material,c.edge,c.waterfall,
   n(c.raisedMm),n(c.cornerRadiusMm),n(c.curveMm),n(c.holes.length)]));
 const holes=table(['کد','صفحه','نوع','عرض mm','عمق mm','فاصله از ابتدا mm','مدل'],
  report.cutouts.map(h=>[h.code,h.slab,h.type,n(h.widthMm),n(h.depthMm),n(h.leftMm),h.model]));
 const materials=table(['متریال نما','تعداد قطعه','مساحت تقریبی m²'],
  report.materials.map(m=>[m.material,n(m.quantity),dec(m.areaSqm)]));
 const nesting=report.nesting;
 const sheetMaterials=table(['متریال','تعداد قطعه','قطعات چیده‌شده','تعداد ورق','مساحت قطعات m²'],
  nesting.materials.map(m=>[m.material,n(m.pieces),n(m.placed),n(m.sheetCount),dec(m.areaSqm)]));
 const sheetSketches=nesting.sheets.map((s,index)=>'<div class="report-sheet-page" data-report-sheet-page="'+index+'" '+(index?'hidden':'')+'>'+ 
  '<article class="report-drawing report-mdf-sheet">'+
  '<div class="report-drawing-head"><strong>'+esc(s.code)+' · ورق '+esc(s.material)+'</strong>'+
  '<span>'+n(s.widthMm)+' × '+n(s.heightMm)+' mm · '+n(s.placements.length)+' قطعه · بهره‌وری '+dec(s.utilizationPct)+'٪</span></div>'+
  mdfSheetSketch(s)+'</article><div class="report-sheet-placements">'+
  table(['کد قطعه','عرض واقعی mm','ارتفاع واقعی mm','X از چپ mm','Y از بالا mm','چرخش روی ورق'],
   s.placements.map(p=>[p.code,n(p.widthMm),n(p.heightMm),n(p.xMm),n(p.yMm),p.rotated?'۹۰°':'۰°']))+
  '</div></div>').join('');
 const sheetPager=nesting.sheets.length>1?'<nav class="report-sheet-pager" aria-label="جابجایی بین ورق‌های MDF">'+
  '<button data-action="report-sheet-prev" disabled>→ ورق قبلی</button>'+
  '<span id="report-sheet-indicator" role="status" aria-live="polite">ورق ۱ از '+n(nesting.sheets.length)+
  ' · '+esc(nesting.sheets[0].code)+' · '+esc(nesting.sheets[0].material)+'</span>'+
  '<button data-action="report-sheet-next">ورق بعدی ←</button></nav>':'';
 const unplaced=nesting.unplaced.length?'<div class="report-warning"><strong>قطعات خارج از ورق</strong>'+
  table(['قطعه','متریال','عرض mm','ارتفاع mm','علت'],
   nesting.unplaced.map(p=>[p.code,p.material,n(p.widthMm),n(p.heightMm),p.reason]))+'</div>':'';
 const sketches=report.cabinetViews.filter(c=>c.fronts.length).map(c=>
  '<article class="report-drawing"><div class="report-drawing-head"><strong>'+c.code+' · نمای درب‌ها و کشوها</strong><span>'+n(c.lengthMm)+' × '+n(c.heightMm)+' mm</span></div>'+facadeSketch(c)+'</article>').join('');
 const topSketches=report.countertop.map(c=>
  '<article class="report-drawing"><div class="report-drawing-head"><strong>'+c.code+' · صفحه رویه</strong><span>'+n(c.lengthMm)+' × '+n(c.depthMm)+' mm</span></div>'+countertopSketch(c)+'</article>').join('');
 return '<main class="report-page" dir="rtl"><header class="report-toolbar"><button data-action="projects">← پروژه‌ها</button>'+
  '<div class="report-toolbar-title"><strong>گزارش ساخت</strong><span>'+esc(report.name)+'</span></div>'+
  '<div class="report-toolbar-actions"><button data-action="return-editor" data-id="'+esc(report.projectId)+'">بازگشت به طراحی</button>'+
  '<button class="report-download" data-action="report-xlsx">دریافت Excel</button>'+
  '<button class="primary" data-action="report-print">چاپ / PDF</button></div></header>'+
  '<div class="report-document"><div class="report-title"><span>KITCHYAR · CUTTING REPORT</span><h1>گزارش ابعاد و نقشه‌های شماتیک</h1>'+
  '<p>'+esc(report.name)+' · نسخه '+n(report.revision)+' · آخرین ویرایش '+
  (report.updatedAt?esc(new Date(report.updatedAt).toLocaleDateString('fa-IR')):'—')+'</p></div>'+
  '<div class="report-summary">'+summary.map(([label,value])=>'<div class="report-stat"><small>'+label+'</small><strong>'+value+'</strong></div>').join('')+'</div>'+
  '<div class="report-warning"><strong>توجه پیش از ساخت</strong><p>ابعاد بر اساس طراحی ثبت‌شده و به میلی‌متر هستند. نقشه حاضر شماتیک است و فایل آماده CNC یا تأیید نهایی تولید نیست.</p></div>'+
  '<nav class="report-nav"><button data-action="report-scroll" data-target="report-fronts">نماها</button><button data-action="report-scroll" data-target="report-nesting">ورق‌های MDF</button><button data-action="report-scroll" data-target="report-tops">صفحه‌ها</button><button data-action="report-scroll" data-target="report-materials">متریال‌ها</button><button data-action="report-scroll" data-target="report-notes">یادداشت تولید</button></nav>'+
  '<section id="report-fronts" class="report-section"><div class="report-section-heading"><h2>۱. درب‌ها و کشوها</h2><span>'+n(report.totals.fronts)+' قطعه</span></div>'+
  (sketches||'<p class="report-empty">در طراحی فعلی هنوز درب یا کشویی ثبت نشده است.</p>')+fronts+'</section>'+
  '<section id="report-nesting" class="report-section"><div class="report-section-heading"><h2>۲. برآورد ورق MDF و نقشه برش نماها</h2><span>'+n(nesting.totalSheets)+' ورق</span></div>'+
  '<p class="report-nesting-intro">فقط درب‌ها و پیشانی کشوها محاسبه شده‌اند؛ بدنه یونیت‌ها فعلاً وارد نشده‌اند. چیدمان پیشنهادی مستطیلی است، نه دستور نهایی دستگاه CNC.</p>'+
  '<div class="report-sheet-config"><label>طول ورق (mm)<input type="number" min="1000" max="5000" step="10" data-report-sheet="widthMm" value="'+nesting.options.widthMm+'"></label>'+
  '<label>عرض ورق (mm)<input type="number" min="800" max="4000" step="10" data-report-sheet="heightMm" value="'+nesting.options.heightMm+'"></label>'+
  '<label>فاصله تیغ (mm)<input type="number" min="0" max="12" step=".5" data-report-sheet="kerfMm" value="'+nesting.options.kerfMm+'"></label>'+
  '<label>حاشیه ورق (mm)<input type="number" min="0" max="80" step="1" data-report-sheet="marginMm" value="'+nesting.options.marginMm+'"></label>'+
  '<button class="primary" data-action="report-recalculate">محاسبه مجدد چیدمان</button></div>'+
  '<p class="report-sheet-assumption">مبنای محاسبه: ورق '+n(nesting.options.widthMm)+' × '+n(nesting.options.heightMm)+
  ' میلی‌متر، فاصله تیغ '+dec(nesting.options.kerfMm)+' میلی‌متر، حاشیه '+n(nesting.options.marginMm)+' میلی‌متر. جهت رگه در چوب رعایت شده است.</p>'+
  sheetMaterials+unplaced+sheetPager+
  (sheetSketches||'<p class="report-empty">هنوز قطعه‌ای برای چیدمان روی MDF وجود ندارد.</p>')+'</section>'+
  '<section id="report-tops" class="report-section"><div class="report-section-heading"><h2>۳. صفحات رویه و محل برش‌ها</h2><span>'+n(report.totals.slabs)+' امتداد صفحه</span></div>'+
  (topSketches||'<p class="report-empty">هنوز کابینت زمینی برای محاسبه صفحه وجود ندارد.</p>')+slabs+
  '<h3>محل بازشوهای سینک و گاز</h3>'+holes+'</section>'+
  '<section id="report-materials" class="report-section"><div class="report-section-heading"><h2>۴. خلاصه متریال نماها</h2><span>برآورد اولیه</span></div>'+materials+'</section>'+
  '<section id="report-notes" class="report-section"><div class="report-section-heading"><h2>۵. کنترل‌های قبل از تولید</h2></div><ul class="report-notes">'+
  report.warnings.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul></section>'+
  '<footer class="report-footer"><span>KITCHYAR · گزارش خودکار از مدل پروژه</span><span>تمام ابعاد به میلی‌متر</span></footer></div></main>';
}
