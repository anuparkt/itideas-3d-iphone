import {extractCutParts,packParts,estimateCncQuote,sampleABC,exportNestingSvg} from './nesting-engine.js';
import {exportJpegReviewPdf} from './cad-export.js';

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
 let sourceMode='dxf',lastResult=null,fileName='CAD-DXF',layoutPage=0;
 const panel=$('nestResults'),preview=$('nestPreview');
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
 function showPage(index){
  const nest=lastResult.nest;layoutPage=Math.max(0,Math.min(nest.sheetCount-1,index));
  const svg=exportNestingSvg(nest,layoutPage);
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
   const nest=packParts(source.parts,{...options(),warnings:source.warnings});
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
   const notes=[...(source.warnings||[])];
   if(nest.isEstimate)notes.unshift('ตัวอย่าง ABC ใช้กรอบสี่เหลี่ยมสมมติ ไม่ใช่ทรงตัวอักษรจริง');
   notes.push('จัดเรียงแบบ Bounding Box ไม่ใช่ True-Shape Nesting; ต้องตรวจ CAM ก่อนตัดจริง');
   $('nestWarning').hidden=false;$('nestWarning').textContent=notes.join(' · ');
   panel.classList.remove('hidden');
   $('nestExportSvgBtn').disabled=false;$('nestExportPdfBtn').disabled=false;$('nestExportCsvBtn').disabled=false;
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
     details:'NEST '+(sheet+1)+'/'+nest.sheetCount+' '+nest.sheet.width+'x'+nest.sheet.height+' mm / THB '+fmt(quote.salePrice)+' / NOT FOR CNC'
    });
    saveFile(bytes,'application/pdf',prefix+'_A4_REVIEW.pdf');
   }
   showToast('ไฟล์ '+format.toUpperCase()+' พร้อมบันทึกใน Files');
  }catch(e){showFileError({name:lastResult.fileName},e);err(e);}
 }
 $('nestDemoBtn').onclick=()=>{sourceMode='demo';fileName='ABC_500mm_SAMPLE';sync();run();};
 $('nestUseDxfBtn').onclick=()=>{sourceMode='dxf';reset();sync();};
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
  reset();sync();
 };
 const inputs=['nestSheetW','nestSheetH','nestSheetPrice','nestThickness','nestGap','nestKerf','nestMargin',
   'nestQuantity','nestRotate','nestCutRate','nestSetup','nestTool','nestFinishing','nestMarginPct','nestVat'];
 for(const id of inputs)$(id).addEventListener('change',()=>{if(lastResult){reset();setSummary('ปรับข้อมูลแล้ว · กด “คำนวณ Nesting” อีกครั้ง');}});
 sync();reset();
 return {onFileLoaded(type){
  if(type==='dxf'){sourceMode='dxf';fileName=cad2d.originalFile?.name||'CAD-DXF';reset();sync();}
  else if(type!=='dxf'){reset();sourceMode='dxf';sync();}
 },get lastResult(){return lastResult;}};
}
