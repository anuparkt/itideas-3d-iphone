import {extractCutParts,packParts,estimateCncQuote,sampleABC,exportNestingSvg} from './nesting-engine.js';
import {exportJpegReviewPdf} from './cad-export.js';
import {loadNestingPreferences,saveNestingPreferences} from './nesting-preferences.js';
import {preflightDxf,packPolygonAware,offsetToolpathPreview} from './cnc-quality.js';

const $=id=>document.getElementById(id);
const money=v=>new Intl.NumberFormat('th-TH',{maximumFractionDigits:0}).format(v);
const fmt=v=>new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(v);
const n=id=>Number($(id).value);
const safeName=s=>String(s||'ITIDEAS-CNC').replace(/\.[^.]+$/,'').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,60);
function saveFile(bytes,mime,fileName){
 const blob=bytes instanceof Blob?bytes:new Blob([bytes],{type:mime});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=fileName;document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function csvCell(value){
 const s=String(value??'');
 const neutral=/^[=+\-@\t\r]/.test(s)?"'"+s:s;
 return '"'+neutral.replace(/"/g,'""')+'"';
}
export function exportCutListCsv(nest,{material='Plaswood PVC foam 10mm'}={}){
 const rows=[['ITIDEAS CNC INSPECTION CUT LIST (NOT CAM READY)'],
 ['Material',material],['Sheet width mm',nest.sheet.width],['Sheet height mm',nest.sheet.height],
 ['Sheet count',nest.sheetCount],['Total cut length mm',nest.cutLengthMm],
 ['Sheet','Part ID','Label','Instance','X mm','Y mm','BBox W mm','BBox H mm','Rotation degrees','Approx cut length mm','Status']];
 for(const p of nest.placements){
  rows.push([p.sheetIndex+1,p.id,p.label,p.instance,p.x,p.y,p.width,p.height,p.rotation,p.cutLengthMm,p.estimated?'ESTIMATE - NOT FOR CNC':'DXF PREVIEW - VERIFY BEFORE CNC']);
 }
 return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
}
async function svgToJpeg(svg){
 const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));
 try{
  const img=new Image();
  await new Promise((resolve,reject)=>{
   img.onload=resolve;img.onerror=()=>reject(new Error('สร้างภาพ Nesting สำหรับ PDF ไม่สำเร็จ'));img.src=url;
  });
  const canvas=document.createElement('canvas');
  const max=2000,ratio=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight));
  canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));
  canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas ไม่พร้อมใช้งาน');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  const raw=atob(canvas.toDataURL('image/jpeg',.92).split(',')[1]);
  return {bytes:Uint8Array.from(raw,c=>c.charCodeAt(0)),width:canvas.width,height:canvas.height};
 }finally{URL.revokeObjectURL(url);}
}
export function setupNestingUI({cad2d,showToast=()=>{},showFileError=()=>{}}){
 let sourceMode='dxf',lastResult=null,fileName='CAD-DXF',layoutPage=0,offsetMode=false,lastQA=null;
 const panel=$('nestResults'),preview=$('nestPreview');
 const preferenceIds=['nestMaterial','nestAlgorithm','nestSheetW','nestSheetH','nestSheetPrice','nestThickness',
  'nestGap','nestKerf','nestMargin','nestQuantity','nestRotate','nestCutRate','nestSetup','nestTool',
  'nestFinishing','nestMarginPct','nestVat'];
 function persistPreferences(){
  try{
   const values=Object.fromEntries(preferenceIds.map(id=>[id,id==='nestRotate'?$(id).checked:$(id).value]));
   saveNestingPreferences(window.localStorage,values);
  }catch{/* Private browsing storage can be unavailable; continue normally. */}
 }
 function restorePreferences(){
  try{
   const saved=loadNestingPreferences(window.localStorage);
   for(const [id,value] of Object.entries(saved)){
    const el=$(id);if(!el)continue;
    if(id==='nestRotate')el.checked=value;else el.value=String(value);
   }
  }catch{/* Storage is optional. */}
 }
 const setSummary=s=>{$('nestSourceStatus').textContent=s;};
 const err=(e)=>{
  $('nestWarning').textContent=e.message;
  $('nestWarning').hidden=false;
  showToast('Nesting: '+e.message);
 };
 function sync(){
  if(cad2d.active&&cad2d.drawing&&sourceMode!=='demo'){
   const m=cad2d.drawing;
   setSummary('DXF พร้อมตรวจ: '+m.paths.length+' paths · '+m.layers.length+' layers');
  }else if(sourceMode==='demo')setSummary('ABC สูง 500 มม. — ขนาดกรอบและแนวตัดเป็นสมมติฐาน');
  else setSummary('เปิด DXF ที่มี Closed Contours หรือกดตัวอย่าง ABC');
 }
 function reset(){
  lastResult=null;preview.replaceChildren();panel.classList.add('hidden');
  $('nestWarning').hidden=true;
  $('nestExportSvgBtn').disabled=true;$('nestExportPdfBtn').disabled=true;$('nestExportCsvBtn').disabled=true;
  offsetMode=false;$('nestOffsetPreviewBtn').disabled=true;
  $('nestOffsetPreviewBtn').setAttribute('aria-pressed','false');
  $('nestOffsetPreviewBtn').textContent='แสดง Tool Offset Preview (ไม่ใช่ CAM)';
  $('nestSafetyStatus').textContent='สถานะ: PREVIEW ONLY — ยังไม่ใช่ไฟล์สำหรับสั่ง CNC';
 }
 function renderQA(report){
  lastQA=report;
  const badge=$('nestPreflightSummary'),output=$('nestPreflight');
  if(!report){badge.textContent='ยังไม่ได้ตรวจ';badge.dataset.status='idle';output.textContent='ตรวจเส้นปิด เส้นซ้ำ เส้นตัดกัน และหน่วยไฟล์ก่อนจัดเรียง';return;}
  badge.textContent=report.errors.length+' errors · '+report.warnings.length+' warnings';
  badge.dataset.status=report.passed?'pass':'fail';
  const items=[...report.errors.map(e=>'ต้องแก้ ['+e.code+'] '+e.message),
   ...report.warnings.map(w=>'ตรวจเพิ่ม ['+w.code+'] '+w.message)];
  output.textContent=report.summary+'\n'+(items.length?items.join('\n'):'ตรวจเส้นปิดผ่านเบื้องต้น ไม่มีข้อผิดพลาดที่ตรวจพบ');
  $('nestSafetyStatus').textContent=report.passed
   ? 'Preflight ผ่านเบื้องต้น · ยังต้องตรวจ Toolpath, Dogbone, Tabs และจุดจับยึดใน CAM'
   : 'CAM NOT READY — มีข้อผิดพลาด Geometry '+report.errors.length+' รายการ ห้ามใช้เป็นไฟล์สั่งตัด';
 }
 function checkQA(){
  try{
   if(sourceMode==='demo'){renderQA(null);$('nestPreflight').textContent='ABC เป็นกรอบสมมติ ใช้ประเมินราคาเท่านั้น ไม่มีเส้นตัวอักษรจริง';return null;}
   if(!cad2d.active||!cad2d.drawing)throw Error('กรุณาเปิดไฟล์ DXF ก่อนตรวจ');
   const qa=preflightDxf(cad2d.drawing,cad2d.visibleLayers,{toolDiameter:n('nestKerf')});
   renderQA(qa);return qa;
  }catch(e){renderQA(null);err(e);return null;}
 }
 function options(){
  return {
   width:n('nestSheetW'),height:n('nestSheetH'),margin:n('nestMargin'),
   gap:n('nestGap'),kerf:n('nestKerf'),quantity:n('nestQuantity'),
   allowRotate:$('nestRotate').checked,maxSheets:30
  };
 }
 function quoteOptions(){
  return {sheetPrice:n('nestSheetPrice'),cutRatePerM:n('nestCutRate'),setup:n('nestSetup'),tool:n('nestTool'),
   finishing:n('nestFinishing'),profitMargin:n('nestMarginPct'),vat:n('nestVat')};
 }
 function readParts(){
  if(sourceMode==='demo')return sampleABC();
  const model=cad2d.drawing;
  if(!cad2d.active||!model)throw Error('ยังไม่ได้เปิด DXF — โปรดเลือกไฟล์ DXF หรือกด “ตัวอย่าง ABC”');
  fileName=cad2d.originalFile?.name||'CAD-DXF';
  const data=extractCutParts(model,cad2d.visibleLayers);
  if(!data.parts.length)throw Error('ไม่พบเส้น Closed Contour ที่ใช้ Nesting ได้ ตรวจ Layer CUT_OUTER / CUT_INNER หรือเส้นแบบต้นฉบับ');
  return data;
 }
 function offsetSvgLayer(nest,index,diameter){
  if(!(diameter>0))return '';
  let rendered='',offsets=0,skipped=0;
  for(const p of nest.placements.filter(p=>p.sheetIndex===index)){
   if(p.estimated){skipped++;continue;}
   for(const contour of p.contours||[]){
    let polygons=[];
    try{polygons=offsetToolpathPreview(contour.points,diameter,contour.isHole?'inside':'outside');}
    catch{skipped++;continue;}
    for(const polygon of polygons){
     const coords=polygon.map(q=>{
      const pt=p.rotation===90?{x:p.sourceHeight-q.y,y:q.x}:q;
      return {x:p.x+pt.x,y:p.y+pt.y};
     });
     rendered+='<path d="'+coords.map((q,i)=>(i?'L':'M')+Number(q.x.toFixed(3))+' '+Number(q.y.toFixed(3))).join(' ')+' Z" fill="none" stroke="#D55D4A" stroke-width="1.2" stroke-dasharray="6 4"/>';
     offsets++;
    }
   }
  }
  if(skipped)$('nestWarning').textContent+=' · Tool Offset ไม่สมบูรณ์ '+skipped+' Contour ตรวจรูและขนาดดอกตัดใน CAM';
  if(!offsets)return '<text x="15" y="30" font-size="12" fill="#B91C1C">OFFSET UNAVAILABLE / NOT FOR CNC</text>';
  return '<g data-preview="tool-offset" aria-label="Tool radius compensation preview">'+rendered+
    '<text x="15" y="30" font-size="12" font-family="monospace" fill="#B91C1C">TOOL CENTRE PREVIEW ONLY · NOT FOR CNC</text></g>';
 }
 function showPage(index){
  const nest=lastResult.nest;layoutPage=Math.max(0,Math.min(nest.sheetCount-1,index));
  let svg=exportNestingSvg(nest,layoutPage);
  if(offsetMode&&sourceMode!=='demo')svg=svg.replace('</svg>',offsetSvgLayer(nest,layoutPage,n('nestKerf'))+'</svg>');
  preview.innerHTML=svg;
  $('nestPageIndex').textContent='แผ่น '+(layoutPage+1)+' / '+nest.sheetCount;
  $('nestPrevPage').disabled=layoutPage<=0;
  $('nestNextPage').disabled=layoutPage>=nest.sheetCount-1;
 }
 function setText(id,val){$(id).textContent=val;}
 function run(){
  reset();
  try{
   const source=readParts();
   const qa=sourceMode==='demo'?null:checkQA();
   if(sourceMode!=='demo'&&!qa)throw Error('ยังตรวจ Geometry ไม่สำเร็จ');
   if(qa?.errors?.length)throw Error('พบปัญหา Geometry '+qa.errors.length+' รายการ กรุณาแก้ DXF ก่อน Nesting');
   const algorithm=$('nestAlgorithm').value;
   const nest=algorithm==='polygon'
     ?packPolygonAware(source.parts,{...options(),warnings:source.warnings})
     :packParts(source.parts,{...options(),warnings:source.warnings});
   if(!nest.placements.length)throw Error('ไม่มีชิ้นงานสำหรับจัดเรียง');
   const quote=estimateCncQuote(nest,quoteOptions());
   lastResult={nest,quote,source,material:$('nestMaterial').value,thickness:n('nestThickness'),fileName};
   setText('nestSheetCount',fmt(nest.sheetCount)+' แผ่น');
   setText('nestPieces',fmt(nest.placements.length)+' ชิ้น');
   setText('nestUtilization',fmt(nest.utilization)+' %');
   setText('nestCutLength',fmt(quote.cutLengthM)+' m');
   setText('nestCutCost',money(quote.cutCost)+' ฿');
   setText('nestMaterialCost',money(quote.materialCost)+' ฿');
   setText('nestTotalCost',money(quote.totalCost)+' ฿');
   setText('nestSale',money(quote.salePrice)+' ฿');
   setText('nestSaleSuggested',money(Math.ceil(quote.salePrice/50)*50)+' ฿');
   setText('nestCutOnlySale',money(quote.cutOnlySalePrice)+' ฿');
   setText('nestSaleVat',money(quote.saleInclVat)+' ฿');
   if(sourceMode==='demo'){
    const market=320*nest.placements.length;
    const suggest=Math.ceil(quote.salePrice/50)*50;
    setText('nestMarketText','ราคาอักษร A B C ที่พบจากผู้ขาย 1 ราย: '+money(market)+' ฿ ('+nest.placements.length+' ตัว × 320 ฿)');
    setText('nestMarketDiff','ราคาที่ระบบเสนอ '+(suggest>=market?'สูงกว่า':'ต่ำกว่า')+'ตัวอย่างตลาด '+money(Math.abs(suggest-market))+' ฿ · ปรับต้นทุนหรือ Margin เพื่อแข่งขันได้');
   }else{
    setText('nestMarketText','ไม่มีราคาเฉลี่ยตลาดที่เทียบได้ตรงกับ DXF ไฟล์นี้');
    setText('nestMarketDiff','ประเมินราคาจากวัสดุ ความยาวตัด และต้นทุนที่กรอก ไม่ใช้ราคาตัวอักษรแทนราคางานอื่น');
   }
   const notes=[...(source.warnings||[])];
   if(nest.isEstimate)notes.unshift('ตัวอย่าง ABC ใช้กรอบสี่เหลี่ยมสมมติ ไม่ใช่ทรงตัวอักษรจริง');
   notes.push(algorithm==='polygon'
     ?'Polygon-aware Beta: คำนวณการชนตามขอบ Polygon และเผื่อช่องไฟ แต่ไม่ใช่ CAM/True-NFP ที่ปรับเหมาะสมที่สุด'
     :'จัดเรียงแบบ Bounding Box เป็นการจัดวางแบบอนุรักษนิยม ไม่ใช่ True-Shape Nesting');
   notes.push('ตรวจ Toolpath, Dogbone, Tabs, จุดจับยึด และดอกตัดจริงใน CAM ก่อนผลิต');
   $('nestWarning').hidden=false;$('nestWarning').textContent=notes.join(' · ');
   panel.classList.remove('hidden');
   $('nestExportSvgBtn').disabled=false;$('nestExportPdfBtn').disabled=false;$('nestExportCsvBtn').disabled=false;
   $('nestOffsetPreviewBtn').disabled=nest.isEstimate;
   $('nestSafetyStatus').textContent='INSPECTION ONLY · '+(qa?.passed?'Preflight เบื้องต้นผ่าน':'ไฟล์ตัวอย่าง')+' · NOT CAM-READY';
   showPage(0);
   showToast('จัดเรียงและคำนวณราคาแล้ว');
  }catch(e){err(e);}
 }
 async function exportResult(format){
  if(!lastResult){err(new Error('ต้องจัดเรียงชิ้นงานก่อนส่งออก'));return;}
  const {nest,quote}=lastResult;
  const sheet=layoutPage;
  const prefix=safeName(lastResult.fileName)+'_NEST_S'+(sheet+1);
  try{
   if(format==='svg'){
    saveFile(exportNestingSvg(nest,sheet),'image/svg+xml',prefix+'_REVIEW.svg');
   }else if(format==='csv'){
    saveFile(exportCutListCsv(nest,{material:lastResult.material+' '+lastResult.thickness+'mm'}),'text/csv;charset=utf-8',safeName(lastResult.fileName)+'_CUTLIST_REVIEW.csv');
   }else if(format==='pdf'){
    const jpeg=await svgToJpeg(exportNestingSvg(nest,sheet));
    const bytes=exportJpegReviewPdf(jpeg.bytes,jpeg.width,jpeg.height,{
     fileName:lastResult.fileName,
     details:'SHEET '+(sheet+1)+'/'+nest.sheetCount+' '+nest.sheet.width+'x'+nest.sheet.height+'mm / CUT THB '+money(quote.cutCost)+' / MATERIAL THB '+money(quote.materialCost)+' / COST THB '+money(quote.totalCost)+' / SELL THB '+money(Math.ceil(quote.salePrice/50)*50)
    });
    saveFile(bytes,'application/pdf',prefix+'_A4_REVIEW.pdf');
   }
   showToast('ไฟล์ '+format.toUpperCase()+' พร้อมบันทึกใน Files');
  }catch(e){showFileError({name:lastResult.fileName},e);err(e);}
 }
 $('nestDemoBtn').onclick=()=>{sourceMode='demo';fileName='ABC_500mm_SAMPLE';$('nestAlgorithm').value='bbox';persistPreferences();renderQA(null);sync();run();};
 $('nestUseDxfBtn').onclick=()=>{sourceMode='dxf';reset();renderQA(null);sync();};
 $('nestPreflightBtn').onclick=checkQA;
 $('nestAlgorithm').addEventListener('change',()=>{
  reset();sync();
  if(sourceMode==='demo'&&$('nestAlgorithm').value==='polygon'){
    $('nestPreflight').textContent='ตัวอย่าง ABC ไม่มีเส้นตัวอักษร — ใช้ Bounding Box หรือเปิดไฟล์ DXF ที่ Outline แล้ว';
  }
 });
 $('nestOffsetPreviewBtn').onclick=()=>{
  if(!lastResult||lastResult.nest.isEstimate)return;
  offsetMode=!offsetMode;
  const button=$('nestOffsetPreviewBtn');
  button.setAttribute('aria-pressed',String(offsetMode));
  button.textContent=offsetMode?'ซ่อน Tool Offset Preview':'แสดง Tool Offset Preview (ไม่ใช่ CAM)';
  showPage(layoutPage);
 };
 $('nestRunBtn').onclick=run;
 $('nestPrevPage').onclick=()=>showPage(layoutPage-1);
 $('nestNextPage').onclick=()=>showPage(layoutPage+1);
 $('nestExportSvgBtn').onclick=()=>exportResult('svg');
 $('nestExportPdfBtn').onclick=()=>exportResult('pdf');
 $('nestExportCsvBtn').onclick=()=>exportResult('csv');
 $('nestMaterial').onchange=()=>{
  const type=$('nestMaterial').value;
  if(type==='plaswood10-half'){
   $('nestSheetW').value=1220;$('nestSheetH').value=1220;
   $('nestSheetPrice').value=388;$('nestThickness').value=10;
  }else if(type==='plaswood10-full'){
   $('nestSheetW').value=1220;$('nestSheetH').value=2440;
   $('nestSheetPrice').value=776;$('nestThickness').value=10;
  }
  reset();sync();persistPreferences();
 };
 const inputs=['nestAlgorithm','nestSheetW','nestSheetH','nestSheetPrice','nestThickness','nestGap','nestKerf','nestMargin',
   'nestQuantity','nestRotate','nestCutRate','nestSetup','nestTool','nestFinishing','nestMarginPct','nestVat'];
 for(const id of inputs)$(id).addEventListener('change',()=>{persistPreferences();if(lastResult){reset();setSummary('ปรับข้อมูลแล้ว · กด “คำนวณ Nesting” อีกครั้ง');}});
 restorePreferences();sync();reset();renderQA(null);
 return {onFileLoaded(type){
  if(type==='dxf'){sourceMode='dxf';fileName=cad2d.originalFile?.name||'CAD-DXF';reset();renderQA(null);sync();}
  else if(type!=='dxf'){reset();sourceMode='dxf';renderQA(null);sync();}
 },get lastResult(){return lastResult;}};
}
