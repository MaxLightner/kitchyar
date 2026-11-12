/* Dependency-free, offline .xlsx exporter (uncompressed OpenXML ZIP).
   All dimensions are typed numeric cells so installers can sort/filter them. */
const xml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const utf8=s=>new TextEncoder().encode(s);
const b16=(a,p,v)=>{a[p]=v&255;a[p+1]=v>>>8&255;};
const b32=(a,p,v)=>{a[p]=v&255;a[p+1]=v>>>8&255;a[p+2]=v>>>16&255;a[p+3]=v>>>24&255;};
const join=chunks=>{const out=new Uint8Array(chunks.reduce((sum,x)=>sum+x.length,0));let p=0;
 for(const x of chunks){out.set(x,p);p+=x.length;}return out;};
function crc32(bytes){let c=-1;for(const byte of bytes){c^=byte;
 for(let k=0;k<8;k++)c=c&1?c>>>1^0xedb88320:c>>>1;
 }return (c^-1)>>>0;}
export function zipStore(entries){
 const parts=[],central=[];let offset=0;
 for(const [name,contents] of entries){
  const filename=utf8(name),data=typeof contents==='string'?utf8(contents):contents,crc=crc32(data);
  const head=new Uint8Array(30+filename.length);b32(head,0,0x04034b50);
  b16(head,4,20);b16(head,6,0x800);b16(head,8,0);
  b32(head,14,crc);b32(head,18,data.length);b32(head,22,data.length);
  b16(head,26,filename.length);head.set(filename,30);parts.push(head,data);
  const dir=new Uint8Array(46+filename.length);b32(dir,0,0x02014b50);
  b16(dir,4,20);b16(dir,6,20);b16(dir,8,0x800);b16(dir,10,0);
  b32(dir,16,crc);b32(dir,20,data.length);b32(dir,24,data.length);
  b16(dir,28,filename.length);b32(dir,42,offset);dir.set(filename,46);central.push(dir);
  offset+=head.length+data.length;
 }
 const directory=join(central),end=new Uint8Array(22);
 b32(end,0,0x06054b50);b16(end,8,entries.length);b16(end,10,entries.length);
 b32(end,12,directory.length);b32(end,16,offset);
 return join([...parts,directory,end]);
}
const columnName=index=>{let result='';for(let i=index+1;i;i=Math.floor((i-1)/26))
 result=String.fromCharCode(65+(i-1)%26)+result;return result;};
function worksheet(headers,rows){
 const rowData=[headers,...rows],numColumns=headers.length;
 const columns=headers.map((title,j)=>{
  const max=Math.max(String(title).length,...rows.map(r=>String(r[j]??'').length));
  return '<col min="'+(j+1)+'" max="'+(j+1)+'" width="'+Math.min(44,Math.max(12,max*1.5+4))+'" customWidth="1"/>';
 }).join('');
 const lines=rowData.map((row,ri)=>'<row r="'+(ri+1)+'">'+row.map((value,ci)=>{
  const ref=columnName(ci)+(ri+1),style=ri===0?' s="1"':'';
  if(typeof value==='number'&&Number.isFinite(value))return '<c r="'+ref+'"'+style+'><v>'+value+'</v></c>';
  return '<c r="'+ref+'"'+style+' t="inlineStr"><is><t xml:space="preserve">'+xml(value)+'</t></is></c>';
 }).join('')+'</row>').join('');
 return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
  '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
  '<sheetViews><sheetView workbookViewId="0" rightToLeft="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'+
  '<sheetFormatPr defaultRowHeight="19"/><cols>'+columns+'</cols><sheetData>'+lines+'</sheetData>'+ 
  '<autoFilter ref="A1:'+columnName(numColumns-1)+rowData.length+'"/></worksheet>';
}

export function xlsxBytes(report){
 const sheets=[
  {name:'خلاصه',head:['شاخص','مقدار','واحد'],rows:[
   ['نام پروژه',report.name,''],['ویرایش',report.revision,''],
   ['تعداد درب',report.totals.doors,'عدد'],['تعداد کشو',report.totals.drawers,'عدد'],
   ['تعداد ورق MDF نما',report.nesting.totalSheets,'ورق'],
   ['قطعات جا نشده',report.nesting.unplaced.length,'قطعه'],
   ['طول ورق MDF',report.nesting.options.widthMm,'میلی‌متر'],
   ['عرض ورق MDF',report.nesting.options.heightMm,'میلی‌متر'],
   ['فاصله تیغ برش',report.nesting.options.kerfMm,'میلی‌متر'],
   ['حاشیه ورق',report.nesting.options.marginMm,'میلی‌متر'],
   ['مساحت نما',report.totals.frontAreaSqm,'مترمربع'],
   ['تعداد امتداد صفحه',report.totals.slabs,'عدد'],['طول تقریبی صفحات',report.totals.counterLengthM,'متر'],
   ['مساحت تقریبی صفحه',report.totals.counterAreaSqm,'مترمربع'],
   ['برش سینک و گاز',report.totals.cutouts,'عدد'],
   ['توضیح','چیدمان MDF برآورد مستطیلی است؛ ضخامت ورق، لبه‌چسبانی و CNC نیاز به تأیید دارد.','']]},
  {name:'درب و کشو',head:['کد','کابینت','نوع','عرض mm','ارتفاع mm','تعداد','متریال','طرح','جهت رگه','لولای درب','درز mm'],
   rows:report.fronts.map(f=>[f.code,f.cabinet,f.type,f.widthMm,f.heightMm,f.quantity,f.material,f.style,f.grain,f.hinge,f.gapMm])},
  {name:'ورق MDF',head:['کد ورق','متریال','طول mm','عرض mm','تعداد قطعه','مصرف m²','بهره‌وری %'],
   rows:report.nesting.sheets.map(s=>[s.code,s.material,s.widthMm,s.heightMm,s.placements.length,
    s.usedAreaSqm,s.utilizationPct])},
  {name:'برش MDF',head:['ورق','قطعه','کابینت','نوع','متریال','عرض قطعه mm','ارتفاع قطعه mm','X از چپ mm',
   'Y از بالا mm','عرض روی ورق mm','ارتفاع روی ورق mm','چرخش درجه','جهت رگه'],
   rows:report.nesting.sheets.flatMap(s=>s.placements.map(p=>[s.code,p.code,p.cabinet,p.type,s.material,
    p.widthMm,p.heightMm,p.xMm,p.yMm,p.cutWidthMm,p.cutHeightMm,p.rotated?90:0,p.grain]))},
  {name:'جا نشده',head:['کد قطعه','متریال','عرض mm','ارتفاع mm','جهت رگه','علت'],
   rows:report.nesting.unplaced.map(p=>[p.code,p.material,p.widthMm,p.heightMm,p.grain,p.reason])},
  {name:'صفحه کابینت',head:['کد','طول mm','عمق تقریبی mm','متریال','لبه','آبشاری','پیش‌آمدگی mm','ارتفاع اضافه mm','گوشه گرد mm','انحنا mm','تعداد برش','مساحت تقریبی m²'],
   rows:report.countertop.map(p=>[p.code,p.lengthMm,p.depthMm,p.material,p.edge,p.waterfall,p.overhangMm,p.raisedMm,p.cornerRadiusMm,p.curveMm,p.holes.length,
    Math.round(p.estimatedAreaSqm*1000)/1000])},
  {name:'برش تجهیزات',head:['کد','صفحه','نوع','عرض mm','عمق mm','فاصله از ابتدای صفحه mm','مدل'],
   rows:report.cutouts.map(h=>[h.code,h.slab,h.type,h.widthMm,h.depthMm,h.leftMm,h.model])},
  {name:'متریال نما',head:['متریال','تعداد','مساحت m²'],
   rows:report.materials.map(m=>[m.material,m.quantity,m.areaSqm])},
  {name:'توضیحات',head:['شماره','نکات پیش از ساخت'],rows:report.warnings.map((w,i)=>[i+1,w])}
 ];
 const types='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
  '<Default Extension="xml" ContentType="application/xml"/>'+
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+
  '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+
  sheets.map((s,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('')+'</Types>';
 const rootRels='<?xml version="1.0" encoding="UTF-8"?>'+
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
 const wb='<?xml version="1.0" encoding="UTF-8"?>'+
  '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+
  '<bookViews><workbookView/></bookViews><sheets>'+sheets.map((s,i)=>
   '<sheet name="'+xml(s.name)+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join('')+'</sheets></workbook>';
 const rels='<?xml version="1.0" encoding="UTF-8"?>'+
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((s,i)=>
   '<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join('')+
  '<Relationship Id="rId'+(sheets.length+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
 const styles='<?xml version="1.0" encoding="UTF-8"?>'+
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2">'+
  '<font><sz val="11"/><name val="Tahoma"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Tahoma"/></font></fonts>'+
  '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'+
  '<fill><patternFill patternType="solid"><fgColor rgb="FF365845"/><bgColor indexed="64"/></patternFill></fill></fills>'+
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'+ 
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'+ 
  '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'+ 
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>';
 const entries=[['[Content_Types].xml',types],['_rels/.rels',rootRels],
  ['xl/workbook.xml',wb],['xl/_rels/workbook.xml.rels',rels],['xl/styles.xml',styles],
  ...sheets.map((s,i)=>['xl/worksheets/sheet'+(i+1)+'.xml',worksheet(s.head,s.rows)])];
 return zipStore(entries);
}
export function downloadCutReportXlsx(report){
 const blob=new Blob([xlsxBytes(report)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
 const href=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=href;link.download='Kitchyar-'+(report.name.replace(/[\\/:*?"<>|]/g,'-').slice(0,48)||'project')+'-cut-report.xlsx';
 document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(href),1500);
}
