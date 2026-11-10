/**
 * ITIDEAS CNC inspection / quoting. This produces a CONSERVATIVE bounding-box nest,
 * never a guaranteed CAM toolpath. Polylines/arcs from the preview can be approximated.
 * Dimension contract: all physical values returned from this module use millimeters.
 */
const precision=x=>Math.round(x*1e5)/1e5;
const requirePositive=(value,label)=>{const n=Number(value);if(!Number.isFinite(n)||n<=0)throw Error(label+' ต้องมากกว่า 0');return n;};
const requireNonnegative=(value,label)=>{const n=Number(value);if(!Number.isFinite(n)||n<0)throw Error(label+' ต้องไม่ติดลบ');return n;};

function pointsFromD(d){
 const tokens=String(d).match(/[MLZ]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi)||[];
 const points=[];let closed=false;
 for(let i=0;i<tokens.length;){
  const type=tokens[i++].toUpperCase();
  if(type==='Z'){closed=true;continue;}
  if(type!=='L'&&type!=='M')return {closed:false,points:[]};
  const x=Number(tokens[i++]),y=Number(tokens[i++]);
  if(!Number.isFinite(x)||!Number.isFinite(y))return {closed:false,points:[]};
  points.push({x,y});
 }
 return {points,closed};
}
function bounds(points){
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
 const x=Math.min(...xs),y=Math.min(...ys);
 return {x,y,w:Math.max(...xs)-x,h:Math.max(...ys)-y};
}
function signedArea(p){
 let a=0;for(let i=0;i<p.length;i++){const q=p[(i+1)%p.length];a+=p[i].x*q.y-q.x*p[i].y;}
 return a/2;
}
function perimeter(p,closed=true){
 let len=0;for(let i=1;i<p.length;i++)len+=Math.hypot(p[i].x-p[i-1].x,p[i].y-p[i-1].y);
 if(closed&&p.length>1)len+=Math.hypot(p[0].x-p.at(-1).x,p[0].y-p.at(-1).y);
 return len;
}
function containsPt(poly,p){
 let inside=false;
 for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const a=poly[i],b=poly[j];
  if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }
 return inside;
}
const includedLayer=name=>!/(^|[_\-\s])(REFERENCE|NO.?CUT|SAW.?GUIDE|GUIDE|DIM|ANNOTATION|DRILL|MARKING|GRID|FRAME)([_\-\s]|$)/i.test(name);
/**
 * Convert a DXF preview with explicit known units into parts.
 * Separate closed contours can be assigned as holes when contained by an outer contour.
 * Open curves and non-cutting/reference layers never become parts automatically.
 */
export function extractCutParts(model,visibleLayers,{includeAuxiliary=false}={}){
 const factor=model?.unit?.factor;
 if(!Number.isFinite(factor)||factor<=0)throw Error('ไม่ทราบหน่วย DXF ต้องกำหนด $INSUNITS ก่อน Nesting ขนาดจริง');
 const selected=visibleLayers instanceof Set?visibleLayers:new Set(model.layers.map(x=>x.name));
 const warnings=[];const contours=[];let open=0,filtered=0;
 for(const path of model.paths||[]){
  if(!selected.has(path.layer))continue;
  if(!includeAuxiliary&&!includedLayer(path.layer)){filtered++;continue;}
  const parsed=pointsFromD(path.d);
  if(!parsed.closed||parsed.points.length<3){open++;continue;}
  const pts=parsed.points.map(p=>({x:p.x*factor,y:p.y*factor}));
  const bb=bounds(pts),area=Math.abs(signedArea(pts));
  if(bb.w<.01||bb.h<.01||area<.001){open++;continue;}
  contours.push({points:pts,bb,area,layer:path.layer,length:perimeter(pts)});
  if(contours.length>600)throw Error('มีชิ้นงานเกิน 600 Contours กรุณาแยกไฟล์/Layer เพื่อวิเคราะห์');
 }
 if(open)warnings.push('ข้ามเส้นเปิด '+open+' รายการ (ต้องปิด Contour ก่อนส่งตัด)');
 if(filtered)warnings.push('ข้าม Reference / Guide / Drill หรือ Layer ที่ไม่ใช่แนวตัด '+filtered+' รายการ');
 if(model.texts?.length)warnings.push('ข้อความ TEXT/MTEXT ไม่ถูกแปลงเป็นโครงร่างอักษรสำหรับ CNC');
 const nodes=contours.sort((a,b)=>b.area-a.area).map((c,i)=>({...c,i,parent:-1}));
 for(let i=1;i<nodes.length;i++){
  let target=-1,area=Infinity;
  for(let j=0;j<i;j++){
   const outer=nodes[j],inner=nodes[i];
   if(outer.area<=inner.area)continue;
   if(inner.bb.x<outer.bb.x-.01||inner.bb.y<outer.bb.y-.01||inner.bb.x+inner.bb.w>outer.bb.x+outer.bb.w+.01||inner.bb.y+inner.bb.h>outer.bb.y+outer.bb.h+.01)continue;
   if(!containsPt(outer.points,inner.points[0]))continue;
   if(outer.area<area){target=j;area=outer.area;}
  }
  nodes[i].parent=target;
 }
 const groups=new Map();
 nodes.forEach((node,i)=>{
  let root=i,safety=0;
  while(nodes[root].parent>=0&&safety++<nodes.length)root=nodes[root].parent;
  if(!groups.has(root))groups.set(root,[]);
  groups.get(root).push(node);
 });
 const parts=[...groups].map(([root,cs],index)=>{
  const bb=nodes[root].bb;
  const members=cs.map(c=>({
   layer:c.layer,isHole:c!==nodes[root],points:c.points.map(p=>({x:precision(p.x-bb.x),y:precision(p.y-bb.y)}))
  }));
  const layers=[...new Set(cs.map(c=>c.layer))];
  return {id:'CUT-'+String(index+1).padStart(3,'0'),label:layers[0]+' '+(index+1),
   width:precision(bb.w),height:precision(bb.h),
   cutLengthMm:precision(cs.reduce((sum,c)=>sum+c.length,0)),contours:members,estimated:false,quantity:1};
 });
 if(!parts.length)warnings.push('ไม่พบ Contour ปิดที่ใช้ตัด — เลือก Layer แนวตัดและตรวจว่าเส้นเป็น Closed Polyline');
 return {parts,warnings,filteredCount:filtered,openCount:open,closedCount:contours.length};
}
const rectIntersects=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const encloses=(a,b)=>b.x>=a.x-.0001&&b.y>=a.y-.0001&&b.x+b.w<=a.x+a.w+.0001&&b.y+b.h<=a.y+a.h+.0001;
function subtractFreeRects(free,used){
 const next=[];
 for(const fr of free){
  if(!rectIntersects(fr,used)){next.push(fr);continue;}
  if(used.x>fr.x)next.push({x:fr.x,y:fr.y,w:used.x-fr.x,h:fr.h});
  if(used.x+used.w<fr.x+fr.w)next.push({x:used.x+used.w,y:fr.y,w:fr.x+fr.w-(used.x+used.w),h:fr.h});
  if(used.y>fr.y)next.push({x:fr.x,y:fr.y,w:fr.w,h:used.y-fr.y});
  if(used.y+used.h<fr.y+fr.h)next.push({x:fr.x,y:used.y+used.h,w:fr.w,h:fr.y+fr.h-(used.y+used.h)});
 }
 return next.filter((a,i)=>a.w>1e-5&&a.h>1e-5&&!next.some((b,j)=>i!==j&&encloses(b,a)&&(!encloses(a,b)||j<i)));
}
function bestPlacement(sheet,part,clearance,allowRotate){
 let best=null;
 const variants=[{rotation:0,w:part.width+clearance,h:part.height+clearance}];
 if(allowRotate&&Math.abs(part.width-part.height)>1e-6)variants.push({rotation:90,w:part.height+clearance,h:part.width+clearance});
 for(const orient of variants){
  for(const fr of sheet.free){
   if(orient.w>fr.w+1e-8||orient.h>fr.h+1e-8)continue;
   const dx=fr.w-orient.w,dy=fr.h-orient.h;
   const score=Math.min(dx,dy)*10000+Math.max(dx,dy);
   if(!best||score<best.score)best={score,x:fr.x,y:fr.y,w:orient.w,h:orient.h,rotation:orient.rotation};
  }
 }
 return best;
}
/** Bounding-box MaxRects (no irregular polygon interlocking). */
export function packParts(parts,options){
 const width=requirePositive(options.width,'ความกว้างวัสดุ'),height=requirePositive(options.height,'ความสูงวัสดุ');
 const margin=requireNonnegative(options.margin??15,'ระยะขอบ');
 const gap=requireNonnegative(options.gap??12,'ระยะห่าง');
 const kerf=requireNonnegative(options.kerf??3,'ความกว้างดอกตัด');
 const quantity=Math.round(requirePositive(options.quantity??1,'จำนวนชุด'));
 const maxSheets=Math.round(requirePositive(options.maxSheets??30,'จำนวนแผ่นสูงสุด'));
 if(quantity>100||maxSheets>100)throw Error('จำกัดจำนวนชุด/แผ่นเพื่อป้องกัน iPhone หน่วยความจำเต็ม');
 if(width-2*margin<=0||height-2*margin<=0)throw Error('ระยะขอบเกินขนาดแผ่นวัสดุ');
 const clearance=gap+kerf;
 const expanded=[];
 for(const part of parts){
  const pw=requirePositive(part.width,'ความกว้างชิ้นงาน'),ph=requirePositive(part.height,'ความสูงชิ้นงาน');
  for(let i=0;i<quantity*(part.quantity??1);i++)expanded.push({...part,width:pw,height:ph,instance:i+1});
 }
 if(expanded.length>350)throw Error('จำกัดการจัดเรียงที่ 350 ชิ้นต่อครั้ง');
 expanded.sort((a,b)=>Math.max(b.width,b.height)-Math.max(a.width,a.height)||b.width*b.height-a.width*a.height||a.id.localeCompare(b.id));
 const sheets=[],placements=[];
 const newSheet=()=>({free:[{x:margin,y:margin,w:width-2*margin,h:height-2*margin}]});
 const pad=clearance/2;
 for(const part of expanded){
  let chosen=null,idx=-1;
  for(let i=0;i<sheets.length;i++){
   const trial=bestPlacement(sheets[i],part,clearance,!!options.allowRotate);
   if(trial){chosen=trial;idx=i;break;}
  }
  if(!chosen){
   const sheet=newSheet();chosen=bestPlacement(sheet,part,clearance,!!options.allowRotate);
   if(!chosen)throw Error('พื้นที่วัสดุไม่พอสำหรับชิ้นงาน '+part.label+' ('+part.width+'×'+part.height+' มม.)');
   if(sheets.length>=maxSheets)throw Error('เกินจำนวนแผ่นสูงสุด '+maxSheets+' แผ่น');
   sheets.push(sheet);idx=sheets.length-1;
  }
  sheets[idx].free=subtractFreeRects(sheets[idx].free,chosen);
  placements.push({id:part.id,instance:part.instance,label:part.label,sheetIndex:idx,
   x:precision(chosen.x+pad),y:precision(chosen.y+pad),
   width:precision(chosen.rotation?part.height:part.width),
   height:precision(chosen.rotation?part.width:part.height),
   rotation:chosen.rotation,cutLengthMm:part.cutLengthMm,estimated:!!part.estimated,
   sourceWidth:part.width,sourceHeight:part.height,contours:part.contours||[]});
 }
 const areaUsed=placements.reduce((sum,p)=>sum+p.width*p.height,0);
 return {placements,sheetCount:sheets.length,sheet:{width,height,margin,gap,kerf},
  cutLengthMm:precision(placements.reduce((sum,p)=>sum+Number(p.cutLengthMm||0),0)),
  utilization:placements.length?precision(areaUsed/(sheets.length*width*height)*100):0,
  isEstimate:placements.some(p=>p.estimated),
  warnings:options.warnings||[]};
}
export function estimateCncQuote(nest,settings){
 const sheetPrice=requireNonnegative(settings.sheetPrice,'ราคาแผ่นวัสดุ');
 const cutRate=requireNonnegative(settings.cutRatePerM,'อัตราตัดต่อเมตร');
 const setup=requireNonnegative(settings.setup??0,'ค่าตั้งเครื่อง');
 const tool=requireNonnegative(settings.tool??0,'ค่าเครื่องมือ');
 const finishing=requireNonnegative(settings.finishing??0,'ค่าเก็บงาน');
 const margin=requireNonnegative(settings.profitMargin??35,'กำไรขั้นต้น');
 const vat=requireNonnegative(settings.vat??0,'VAT');
 if(margin>=90||vat>30)throw Error('เปอร์เซ็นต์ Margin/VAT ไม่อยู่ในช่วงที่รองรับ');
 const cutLengthM=precision(nest.cutLengthMm/1000);
 const cutCost=precision(cutLengthM*cutRate+setup+tool);
 const materialCost=precision(nest.sheetCount*sheetPrice);
 const totalCost=precision(materialCost+cutCost+finishing);
 const salePrice=precision(totalCost/(1-margin/100));
 const cutOnlySalePrice=precision(cutCost/(1-margin/100));
 return {cutLengthM,cutCost,materialCost,finishingCost:finishing,totalCost,profitMargin:margin,
   salePrice,cutOnlySalePrice,vatAmount:precision(salePrice*vat/100),saleInclVat:precision(salePrice*(1+vat/100)),
   grossProfit:precision(salePrice-totalCost)};
}
/** Price-only placeholders; not true A/B/C cutting geometry. */
export function sampleABC(){
 const specs=[{label:'A',width:360,cutLengthMm:2200},{label:'B',width:340,cutLengthMm:2800},{label:'C',width:360,cutLengthMm:2200}];
 return {parts:specs.map(({label,width,cutLengthMm})=>({
  id:label,label,width,height:500,cutLengthMm,estimated:true,quantity:1,
  contours:[{layer:'ESTIMATE',isHole:false,points:[{x:0,y:0},{x:width,y:0},{x:width,y:500},{x:0,y:500}]}]
 })),warnings:['ตัวอย่าง ABC เป็นเพียงกรอบขนาดสมมติ ยังไม่มีเส้นเวกเตอร์ตัวอักษรจริง ห้ามส่ง CAM']};
}
function xmlEscape(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
export function exportNestingSvg(nest,index=0){
 if(index<0||index>=nest.sheetCount)throw Error('ไม่พบแผ่นงาน Nesting');
 const {width,height,margin}=nest.sheet;
 const cells=nest.placements.filter(p=>p.sheetIndex===index);
 let parts='<rect width="'+width+'" height="'+height+'" fill="#fff" stroke="#333" stroke-width=".8"/>';
 parts+='<rect x="'+margin+'" y="'+margin+'" width="'+(width-2*margin)+'" height="'+(height-2*margin)+'" fill="none" stroke="#9ca3af" stroke-width="1" stroke-dasharray="8 6"/>';
 for(const [i,p] of cells.entries()){
  const col=['#005f8f','#ae5300','#1b8a69','#9b3361','#6652aa'][i%5];
  for(const outline of p.contours){
   const coords=outline.points.map(pt=>{
    const x=p.rotation===90?p.sourceHeight-pt.y:pt.x;
    const y=p.rotation===90?pt.x:pt.y;
    return {x:p.x+x,y:p.y+y};
   });
   if(coords.length>=2){
    const d=coords.map((pt,j)=>(j?'L':'M')+precision(pt.x)+' '+precision(pt.y)).join(' ')+' Z';
    parts+='<path d="'+d+'" fill="none" stroke="'+col+'" stroke-width="1.2"/>';
   }
  }
  parts+='<text x="'+precision(p.x+5)+'" y="'+precision(p.y+17)+'" font-family="Arial" font-size="14" fill="#111827">'+xmlEscape(p.label)+' #'+p.instance+'</text>';
  if(p.estimated)parts+='<rect x="'+p.x+'" y="'+p.y+'" width="'+p.width+'" height="'+p.height+'" fill="none" stroke="#c2410c" stroke-dasharray="8 5"/>';
 }
 const warning=nest.isEstimate?'NOT FOR CNC - PLACEHOLDER LETTER BOUNDING BOXES':'PREVIEW ONLY - VERIFY GEOMETRY IN CAD BEFORE CNC';
 parts+='<text x="'+margin+'" y="'+(height-5)+'" font-size="12" font-family="Arial" fill="#b91c1c">'+xmlEscape(warning)+'</text>';
 return '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="'+width+'mm" height="'+height+'mm" viewBox="0 0 '+width+' '+height+'">'+parts+'</svg>';
}
