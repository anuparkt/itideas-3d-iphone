import {drawingFromDxf,isPdfCompatibleAI,decodeDxfBytes} from './cad-geometry.js';
const $=id=>document.getElementById(id);
const wrap=$('viewerWrap');
const stage=document.createElement('div');stage.id='cad2dStage';stage.className='cad2d-stage';
stage.innerHTML='<div class="cad2d-viewport"><div class="cad2d-surface"></div></div><div class="cad2d-tools"><button data-cad="fit">Fit</button><button data-cad="plus">+</button><button data-cad="minus">−</button><button data-cad="layers">Layers</button></div><div class="cad2d-layer-panel hidden"><strong>DXF LAYERS</strong><div class="cad2d-layer-list"></div></div><div class="cad2d-caption"></div>';
wrap.appendChild(stage);
const viewport=stage.querySelector('.cad2d-viewport');
const surface=stage.querySelector('.cad2d-surface');
const layerPanel=stage.querySelector('.cad2d-layer-panel');
const layersList=stage.querySelector('.cad2d-layer-list');
const caption=stage.querySelector('.cad2d-caption');
const SVG_NS='http://www.w3.org/2000/svg';
let active=false,drawing=null,svg=null,aiCanvas=null,measurePoints=[],measuring=false;
let naturalWidth=100,naturalHeight=100,fitZoom=1,zoom=1,tx=0,ty=0;
let pdfHandle=null;
const pointers=new Map();let pinchDistance=null,downPoint=null;
const $svg=(name)=>document.createElementNS(SVG_NS,name);
const pretty=(value)=>Number.isFinite(value)?value.toLocaleString('en-US',{maximumFractionDigits:2}):'—';
const size=(bytes)=>bytes>1024*1024?(bytes/1048576).toFixed(2)+' MB':(bytes/1024).toFixed(1)+' KB';
function setFileStats(file,format,w,h,unitText,count,note) {
 $('fileName').textContent=file.name;
 $('fileSize').textContent=size(file.size);
 $('formatBadge').textContent=format;
 $('dimX').textContent=pretty(w)+' '+unitText;
 $('dimY').textContent=pretty(h)+' '+unitText;
 $('dimZ').textContent=format==='DXF'?'2D':'—';
 $('triCount').textContent=count===null?'—':count.toLocaleString();
 $('hudName').textContent=file.name;
 $('hudDims').textContent='X '+pretty(w)+' · Y '+pretty(h)+' '+unitText;
 $('emptyState').classList.add('hidden');
 $('measureReadout').textContent='ระยะ: —';
 caption.textContent=note;
}
function updateTransform(){
 surface.style.transform='translate(-50%,-50%) translate('+tx+'px,'+ty+'px) scale('+(fitZoom*zoom)+')';
}
function fit(){
 if(!active)return;
 const w=viewport.clientWidth,h=viewport.clientHeight;
 if(!w||!h)return;
 fitZoom=Math.min((w-32)/Math.max(naturalWidth,1),(h-48)/Math.max(naturalHeight,1));
 zoom=1;tx=0;ty=0;updateTransform();
}
function changeZoom(factor){
 zoom=Math.min(40,Math.max(.12,zoom*factor));updateTransform();
}
const onResize=new ResizeObserver(()=>{if(active){const old=zoom;fit();zoom=old;updateTransform();}});
onResize.observe(viewport);
function clearMeasure(){
 measurePoints=[];measuring=false;
 if(svg)svg.querySelectorAll('.cad-measure-overlay').forEach(el=>el.remove());
 $('measureReadout').textContent='ระยะ: —';
 $('measureBtn').textContent='เริ่มวัด';
}
function beginMeasure(){
 if(!active)return false;
 if(!drawing){$('measureReadout').textContent='AI เป็นภาพพรีวิว ไม่รองรับการวัดระยะจาก Artwork';return false;}
 clearMeasure();measuring=true;$('measureBtn').textContent='แตะจุดที่ 1 และ 2';
 $('measureReadout').textContent='เลือกจุดบน DXF (Snap เฉพาะจุดที่ตรวจพบ)';
 return true;
}
function measureAt(clientX,clientY) {
 if(!measuring||!drawing||!svg)return;
 const rect=viewport.getBoundingClientRect();
 const scale=fitZoom*zoom;
 const localX=(clientX-(rect.left+rect.width/2)-tx)/scale;
 const localY=(clientY-(rect.top+rect.height/2)-ty)/scale;
 const p={x:drawing.bounds.minX+drawing.bounds.width/2+localX,
          y:drawing.bounds.minY+drawing.bounds.height/2-localY};
 const radius=12/scale;
 let best=null,bestD=radius;
 for(const s of drawing.snapPoints){
   const d=Math.hypot(s.x-p.x,s.y-p.y);
   if(d<bestD){best=s;bestD=d;}
 }
 const q=best||p;measurePoints.push(q);
 const dot=$svg('circle');dot.setAttribute('cx',q.x);dot.setAttribute('cy',-q.y);
 dot.setAttribute('r',Math.max(drawing.bounds.width,drawing.bounds.height)/150);
 dot.setAttribute('class','cad-measure-overlay');dot.setAttribute('fill','#f0be62');
 svg.appendChild(dot);
 if(measurePoints.length===2){
   const a=measurePoints[0],b=measurePoints[1];
   const l=$svg('line');l.setAttribute('x1',a.x);l.setAttribute('y1',-a.y);
   l.setAttribute('x2',b.x);l.setAttribute('y2',-b.y);
   l.setAttribute('stroke','#f0be62');l.setAttribute('stroke-width',Math.max(drawing.bounds.width,drawing.bounds.height)/600);
   l.setAttribute('class','cad-measure-overlay');svg.appendChild(l);
   const d=Math.hypot(a.x-b.x,a.y-b.y),unit=drawing.unit;
   $('measureReadout').textContent='ระยะ: '+pretty(unit.factor===null?d:d*unit.factor)+' '+(unit.factor===null?unit.label:'mm')+' (โดยประมาณ)';
   measuring=false;$('measureBtn').textContent='เริ่มวัด';
 }
}
stage.querySelector('[data-cad="fit"]').onclick=fit;
stage.querySelector('[data-cad="plus"]').onclick=()=>changeZoom(1.25);
stage.querySelector('[data-cad="minus"]').onclick=()=>changeZoom(.8);
stage.querySelector('[data-cad="layers"]').onclick=()=>layerPanel.classList.toggle('hidden');
stage.addEventListener('pointerdown',e=>{
 if(e.target.closest('button')||e.target.closest('.cad2d-layer-panel'))return;
 stage.setPointerCapture(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 downPoint={x:e.clientX,y:e.clientY,id:e.pointerId};
 if(pointers.size===2){const [a,b]=[...pointers.values()];pinchDistance=Math.hypot(a.x-b.x,a.y-b.y);}
});
stage.addEventListener('pointermove',e=>{
 if(!pointers.has(e.pointerId))return;
 const prev=pointers.get(e.pointerId);pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pointers.size===1){tx+=e.clientX-prev.x;ty+=e.clientY-prev.y;updateTransform();}
 else if(pointers.size===2){
   const [a,b]=[...pointers.values()],dist=Math.hypot(a.x-b.x,a.y-b.y);
   if(pinchDistance&&dist>0)changeZoom(dist/pinchDistance);pinchDistance=dist;
 }
});
stage.addEventListener('pointerup',e=>{
 const old=pointers.get(e.pointerId);pointers.delete(e.pointerId);
 if(pointers.size<2)pinchDistance=null;
 if(old&&downPoint?.id===e.pointerId&&Math.hypot(downPoint.x-e.clientX,downPoint.y-e.clientY)<7)measureAt(e.clientX,e.clientY);
 downPoint=null;
});
stage.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);pinchDistance=null;downPoint=null;});
stage.addEventListener('wheel',e=>{if(!active)return;e.preventDefault();changeZoom(e.deltaY>0?.86:1.16);},{passive:false});
function redrawDXF(model){
 surface.replaceChildren();svg=$svg('svg');aiCanvas=null;
 const b=model.bounds;svg.setAttribute('viewBox',b.minX+' '+(-b.maxY)+' '+b.width+' '+b.height);
 svg.setAttribute('width',String(b.width));svg.setAttribute('height',String(b.height));
 svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('xmlns',SVG_NS);
 svg.classList.add('cad-dxf-svg');
 const palette=['#e7edf4','#46d6ec','#f7c66b','#ee8e9b','#9edc9a','#ac9bf2'];
 const layerGroups=new Map();
 model.layers.forEach((l,i)=>{
   const g=$svg('g');g.dataset.layer=l.name;g.setAttribute('stroke',palette[i%palette.length]);
   g.setAttribute('fill','none');g.setAttribute('stroke-width',String(Math.max(b.width,b.height)/850));
   g.setAttribute('stroke-linecap','round');g.setAttribute('stroke-linejoin','round');
   svg.appendChild(g);layerGroups.set(l.name,g);
 });
 for(const path of model.paths){const g=layerGroups.get(path.layer);if(!g)continue;
   const el=$svg('path');el.setAttribute('d',path.d);g.appendChild(el);}
 for(const t of model.texts){const g=layerGroups.get(t.layer);if(!g)continue;
   const el=$svg('text');el.setAttribute('x',t.x);el.setAttribute('y',-t.y);
   // SVG Y is already inverted in the viewBox; text stays upright in screen coordinates.
   el.setAttribute('font-size',Math.max(t.size,.5));el.setAttribute('fill','#e1e8ef');
   el.setAttribute('stroke','none');el.textContent=t.value;g.appendChild(el);}
 surface.appendChild(svg);
 layersList.replaceChildren();layerPanel.classList.remove('hidden');
 for(const l of model.layers){const label=document.createElement('label');label.className='cad-layer-row';
   const cb=document.createElement('input');cb.type='checkbox';cb.checked=true;
   cb.onchange=()=>{layerGroups.get(l.name).style.display=cb.checked?'':'none';};
   const text=document.createElement('span');text.textContent=l.name+' ('+l.count+')';
   label.append(cb,text);layersList.appendChild(label);}
 naturalWidth=b.width;naturalHeight=b.height;
 surface.style.width=b.width+'px';surface.style.height=b.height+'px';
}
function show(){
 active=true;stage.style.display='block';wrap.classList.add('has-cad2d');
 $('viewer').style.visibility='hidden';
 document.body.classList.add('inspection-2d');
 fit();
}
function hide(){
 active=false;stage.style.display='none';wrap.classList.remove('has-cad2d');
 $('viewer').style.visibility='visible';document.body.classList.remove('inspection-2d');
 layerPanel.classList.add('hidden');clearMeasure();
 if(pdfHandle){pdfHandle.destroy().catch(()=>{});pdfHandle=null;}
}
function loadDxfParser(){
 return new Promise((resolve,reject)=>{
  if(typeof window.DxfParser==='function'){resolve(window.DxfParser);return;}
  const script=document.createElement('script');
  script.src='./dxf-parser.bundle.js';
  script.onload=()=>typeof window.DxfParser==='function'?resolve(window.DxfParser):reject(new Error('DXF parser ไม่พร้อมใช้งาน ตรวจว่าตั้งค่า Build output เป็น dist และ Deploy branch cloudflare-independent-cad-viewer'));
  script.onerror=()=>reject(new Error('เชื่อมต่อ DXF parser ไม่ได้ — ตรวจอินเทอร์เน็ต'));document.head.appendChild(script);
 });
}
async function loadDXF(file){
 const DxfParser=await loadDxfParser();
 const text=decodeDxfBytes(await file.arrayBuffer());
 let parsed;
 try{parsed=new DxfParser().parseSync(text);}catch(e){throw new Error('อ่านโครงสร้าง DXF ไม่สำเร็จ: '+(e?.message||'ไม่รู้จักรูปแบบ')+' — ลอง Export เป็น AutoCAD ASCII DXF');}
 if(!parsed?.entities)throw new Error('DXF ไม่มีส่วน ENTITIES หรือไฟล์อาจเสียหาย');
 const model=drawingFromDxf(parsed);
 drawing=model;clearMeasure();redrawDXF(model);show();
 const u=model.unit;const w=model.bounds.width*(u.factor??1),h=model.bounds.height*(u.factor??1);
 const displayUnit=u.factor===null?u.label:'mm';
 const warn=model.unsupported.length?' · ไม่แสดง: '+model.unsupported.join(', '):'';
 setFileStats(file,'DXF',w,h,displayUnit,model.entityCount,
 'DXF preview · '+model.layers.length+' layers'+warn+' · ตรวจแบบใน CAD ก่อน CNC');
}
async function loadAI(file){
 const buffer=await file.arrayBuffer();
 if(!isPdfCompatibleAI(new Uint8Array(buffer)))throw new Error('ไฟล์ AI นี้ไม่มีข้อมูล PDF-compatible ให้บันทึกใหม่ใน Illustrator โดยเปิด Create PDF Compatible File');
 const pdfjs=await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.min.mjs');
 pdfjs.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.9.155/pdf.worker.min.mjs';
 if(pdfHandle){await pdfHandle.destroy().catch(()=>{});pdfHandle=null;}
 const pdf=await pdfjs.getDocument({data:new Uint8Array(buffer),isEvalSupported:false}).promise;
 pdfHandle=pdf;const page=await pdf.getPage(1),natural=page.getViewport({scale:1});
 const scale=Math.min(3,2200/Math.max(natural.width,natural.height));
 const rendered=page.getViewport({scale});
 const canvas=document.createElement('canvas');canvas.width=Math.round(rendered.width);
 canvas.height=Math.round(rendered.height);
 const context=canvas.getContext('2d',{alpha:false});if(!context)throw new Error('Canvas ไม่พร้อมใช้งาน');
 await page.render({canvasContext:context,viewport:rendered}).promise;
 canvas.style.width=natural.width+'px';canvas.style.height=natural.height+'px';
 canvas.className='cad-ai-canvas';surface.replaceChildren(canvas);
 svg=null;aiCanvas=canvas;drawing=null;clearMeasure();
 naturalWidth=natural.width;naturalHeight=natural.height;
 surface.style.width=natural.width+'px';surface.style.height=natural.height+'px';
 layersList.replaceChildren();layerPanel.classList.add('hidden');show();
 const mm=25.4/72;
 setFileStats(file,'AI',natural.width*mm,natural.height*mm,'mm',null,
 'AI PDF-compatible · ขนาดที่แสดงคือขนาดหน้า PDF ไม่ใช่เส้นไดคัท · หน้า 1 / '+pdf.numPages);
}
export async function loadCad2D(file) {
 const ext=file.name.split('.').pop()?.toLowerCase();
 if(ext==='dxf')await loadDXF(file);
 else if(ext==='ai')await loadAI(file);
 else throw new Error('ชนิดไฟล์ 2D ไม่รองรับ');
}
export const cad2d={
 get active(){return active;},hide,fit,beginMeasure,clearMeasure,
 capture:async()=>{
   try {
    if(aiCanvas){const a=document.createElement('a');a.download='ITIDEAS-AI-'+Date.now()+'.png';a.href=aiCanvas.toDataURL('image/png');a.click();return;}
    if(!svg)return;
    const clone=svg.cloneNode(true);clone.setAttribute('xmlns',SVG_NS);
    const xml=new XMLSerializer().serializeToString(clone);
    const url=URL.createObjectURL(new Blob([xml],{type:'image/svg+xml'}));
    const im=new Image();
    await new Promise((res,rej)=>{im.onload=res;im.onerror=rej;im.src=url;});
    const w=Math.min(2200,Math.ceil(naturalWidth*fitZoom*3));
    const h=Math.max(1,Math.round(w*naturalHeight/naturalWidth));
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#101822';ctx.fillRect(0,0,w,h);ctx.drawImage(im,0,0,w,h);
    URL.revokeObjectURL(url);
    const a=document.createElement('a');a.download='ITIDEAS-DXF-'+Date.now()+'.png';a.href=canvas.toDataURL('image/png');a.click();
   } catch(e){alert('บันทึกภาพไม่สำเร็จ: '+e.message);}
 }
};
