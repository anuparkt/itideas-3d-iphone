/** ITIDEAS CAD exports are previews, never CNC toolpaths. */
const PT=72/25.4;
const COLORS=['#e7edf4','#46d6ec','#f7c66b','#ee8e9b','#9edc9a','#ac9bf2'];
const ENCODER=new TextEncoder();
const fmt=v=>String(Number(Number(v).toFixed(5)));
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function layers(model,visible){const selected=visible instanceof Set?visible:new Set(model.layers.map(l=>l.name));return model.layers.filter(l=>selected.has(l.name));}
function paths(model,visible){const shown=new Set(layers(model,visible).map(l=>l.name));return model.paths.filter(p=>shown.has(p.layer));}
function mmFactor(model){const factor=model.unit?.factor;if(!Number.isFinite(factor)||factor<=0)throw Error('ไม่ทราบหน่วย DXF กรุณากำหนด $INSUNITS ก่อนส่งออก PDF ขนาดจริง 1:1');return factor;}
export function exportSvg(model,visible){
 const b=model.bounds,f=model.unit?.factor;
 const size=f?('width="'+fmt(b.width*f)+'mm" height="'+fmt(b.height*f)+'mm"'):('width="'+fmt(b.width)+'" height="'+fmt(b.height)+'"');
 const output=[];
 const selectedPaths=paths(model,visible);
 const lineWidth=f?0.18/f:Math.max(b.width,b.height)/1200;
 for(const l of layers(model,visible)){
   const index=model.layers.findIndex(x=>x.name===l.name);
   let group='<g data-layer="'+esc(l.name)+'" fill="none" stroke="'+COLORS[index%COLORS.length]+'" stroke-width="'+fmt(lineWidth)+'" stroke-linejoin="round">';
   for(const p of selectedPaths.filter(p=>p.layer===l.name))group+='<path d="'+esc(p.d)+'"/>';
   for(const t of (model.texts||[]).filter(t=>t.layer===l.name)){
     group+='<text x="'+fmt(t.x)+'" y="'+fmt(-t.y)+'" font-size="'+fmt(Math.max(t.size,.5))+'" font-family="Arial, sans-serif" fill="#d7e0e9" stroke="none">'+esc(t.value)+'</text>';
   }
   output.push(group+'</g>');
 }
 return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" '+size+' viewBox="'+fmt(b.minX)+' '+fmt(-b.maxY)+' '+fmt(b.width)+' '+fmt(b.height)+'" preserveAspectRatio="xMidYMid meet"><title>ITIDEAS CAD - DXF vector preview</title>'+output.join('')+'</svg>';
}
function parsePath(d){
 const tok=d.match(/[MLZ]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi)||[],out=[];
 for(let i=0;i<tok.length;){
   const cmd=tok[i++].toUpperCase();
   if(cmd==='Z'){out.push({cmd});continue;}
   if(cmd!=='M'&&cmd!=='L')throw Error('Unsupported geometry path');
   const x=Number(tok[i++]),y=Number(tok[i++]);
   if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Invalid CAD geometry coordinates');
   out.push({cmd,x,y});
 }return out;
}
function textEscape(value){return String(value).replace(/[^\x20-\x7e]/g,'?').replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');}
const bytes=s=>ENCODER.encode(s);
function makePdf({widthPt,heightPt,commands,jpeg=null,title='ITIDEAS CAD'}){
 if(widthPt<=0||heightPt<=0||widthPt>14400||heightPt>14400)throw Error('ขนาดหน้า PDF เกินขีดจำกัด โปรดแบ่งชิ้นงาน');
 const stream=bytes(commands),objs=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+fmt(widthPt)+' '+fmt(heightPt)+'] /Resources << /Font << /F1 5 0 R >>'+(jpeg?' /XObject << /Im1 6 0 R >>':'')+' >> /Contents 4 0 R >>',
  {head:'<< /Length '+stream.length+' >>\nstream\n',data:stream,tail:'\nendstream'},
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
 ];
 if(jpeg)objs.push({head:'<< /Type /XObject /Subtype /Image /Width '+jpeg.width+' /Height '+jpeg.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpeg.data.length+' >>\nstream\n',data:jpeg.data,tail:'\nendstream'});
 const info=objs.length+1;
 objs.push('<< /Producer (ITIDEAS CAD Viewer) /Title ('+textEscape(title)+') >>');
 let length=0;const chunks=[],offsets=[0];
 const write=v=>{const b=typeof v==='string'?bytes(v):v;chunks.push(b);length+=b.length;};
 write('%PDF-1.4\n');
 for(let i=0;i<objs.length;i++){
  offsets.push(length);write((i+1)+' 0 obj\n');
  const o=objs[i];
  if(typeof o==='string')write(o);else{write(o.head);write(o.data);write(o.tail);}
  write('\nendobj\n');
 }
 const xref=length;write('xref\n0 '+(objs.length+1)+'\n0000000000 65535 f \n');
 for(let i=1;i<offsets.length;i++)write(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
 write('trailer\n<< /Size '+(objs.length+1)+' /Root 1 0 R /Info '+info+' 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
 const result=new Uint8Array(length);let idx=0;for(const chunk of chunks){result.set(chunk,idx);idx+=chunk.length;}return result;
}
function vectors(model,visible,{scale,originX,originY,strokePt}){
 const b=model.bounds,colors=new Map(model.layers.map((l,i)=>[l.name,COLORS[i%COLORS.length]]));
 let content='';
 for(const p of paths(model,visible)){
  const hex=colors.get(p.layer)||'#e7edf4';
  const col=[1,3,5].map(k=>parseInt(hex.slice(k,k+2),16)/255);
  content+=fmt(col[0])+' '+fmt(col[1])+' '+fmt(col[2])+' RG '+fmt(strokePt)+' w\n';
  for(const step of parsePath(p.d)){
   if(step.cmd==='Z'){content+='h\n';continue;}
   const x=originX+(step.x-b.minX)*scale,y=originY+(-step.y-b.minY)*scale;
   content+=fmt(x)+' '+fmt(y)+' '+(step.cmd==='M'?'m':'l')+'\n';
  }content+='S\n';
 }
 const enabled=new Set(layers(model,visible).map(l=>l.name));
 for(const t of model.texts||[]){
  if(!enabled.has(t.layer))continue;
  const px=originX+(t.x-b.minX)*scale,py=originY+(t.y-b.minY)*scale;
  const fontSize=Math.max(3,Math.min(72,Math.max(t.size,.5)*scale));
  content+='0 0 0 rg\nBT /F1 '+fmt(fontSize)+' Tf '+fmt(px)+' '+fmt(py)+' Td ('+textEscape(t.value)+') Tj ET\n';
 }
 return content;
}
function text(line,x,y,size=9){return 'BT /F1 '+fmt(size)+' Tf '+fmt(x)+' '+fmt(y)+' Td ('+textEscape(line)+') Tj ET\n';}
export function exportPrintPdf(model,visible){
 const f=mmFactor(model),b=model.bounds,margin=5;
 const widthMm=b.width*f,heightMm=b.height*f;
 if(widthMm<=0||heightMm<=0)throw Error('ขนาดงาน DXF ไม่ถูกต้อง');
 const content=vectors(model,visible,{scale:f*PT,originX:margin*PT,originY:margin*PT,strokePt:.12*PT});
 return makePdf({widthPt:(widthMm+10)*PT,heightPt:(heightMm+10)*PT,commands:content,title:'ITIDEAS CAD DXF 1:1 VECTOR'});
}
export function exportReviewPdf(model,visible,{fileName='drawing.dxf'}={}){
 const width=297*PT,height=210*PT,b=model.bounds,usableW=267*PT,usableH=137*PT;
 const scale=Math.min(usableW/b.width,usableH/b.height);
 const ox=(width-b.width*scale)/2,oy=22*PT+(usableH-b.height*scale)/2;
 const dimension=model.unit?.factor?(fmt(b.width*model.unit.factor)+' x '+fmt(b.height*model.unit.factor)+' mm'):(fmt(b.width)+' x '+fmt(b.height)+' drawing units');
 let content='0 0 0 rg\n'+text('ITIDEAS CAD  |  INSPECTION REVIEW',15*PT,193*PT,14);
 content+=text('A4  |  NOT FOR PRODUCTION  |  NOT A TOOLPATH',15*PT,184*PT,9);
 content+=text('Source: '+fileName,15*PT,177*PT,8);
 content+=text('Geometry: '+dimension+'    Visible layers: '+layers(model,visible).length,15*PT,171*PT,8);
 content+=vectors(model,visible,{scale,originX:ox,originY:oy,strokePt:.34});
 content+='0 0 0 rg\n'+text('Preview geometry only. Confirm scale and curves against original CAD.',15*PT,10*PT,8);
 return makePdf({widthPt:width,heightPt:height,commands:content,title:'ITIDEAS CAD INSPECTION REVIEW'});
}
export function exportJpegReviewPdf(jpegBytes,widthPx,heightPx,{fileName='drawing',details=''}={}){
 if(!jpegBytes?.length||widthPx<=0||heightPx<=0)throw Error('ภาพพรีวิวไม่พร้อมใช้งาน');
 const width=297*PT,height=210*PT,maxW=267*PT,maxH=144*PT,scale=Math.min(maxW/widthPx,maxH/heightPx);
 const w=widthPx*scale,h=heightPx*scale,x=(width-w)/2,y=26*PT+(maxH-h)/2;
 let content='0 0 0 rg\n'+text('ITIDEAS CAD  |  INSPECTION REVIEW',15*PT,193*PT,14);
 content+=text('A4  |  NOT FOR PRODUCTION',15*PT,184*PT,9);
 content+=text('Source: '+fileName,15*PT,177*PT,8);
 content+=text('Preview: '+details,15*PT,171*PT,8);
 content+='q '+fmt(w)+' 0 0 '+fmt(h)+' '+fmt(x)+' '+fmt(y)+' cm /Im1 Do Q\n';
 content+='0 0 0 rg\n'+text('Preview only. Verify source dimensions and materials before production.',15*PT,10*PT,8);
 return makePdf({widthPt:width,heightPt:height,commands:content,jpeg:{width:widthPx,height:heightPx,data:jpegBytes},title:'ITIDEAS CAD IMAGE REVIEW'});
}
export function choosePreviewPixels(width,height,{maxEdge=4096,maxPixels=10_000_000}={}){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('ขนาดภาพไม่ถูกต้อง');
 const f=Math.min(maxEdge/width,maxEdge/height,Math.sqrt(maxPixels/(width*height)));
 return {width:Math.max(1,Math.floor(width*f)),height:Math.max(1,Math.floor(height*f))};
}
