/**
 * Polygon-aware CNC preflight and approximate tool-centre offsets.
 * Requires clipper-lib for deterministic integer polygon operations (0.001mm grid).
 * Inspection only. DOES NOT OUTPUT CAM/G-CODE and never authorizes machining.
 */
import Clipper from 'clipper-lib';
const SCALE=1000;
const point=x=>({x:Number(x.x),y:Number(x.y)});
const toInt=p=>({X:Math.round(p.x*SCALE),Y:Math.round(p.y*SCALE)});
const fromInt=p=>({x:p.X/SCALE,y:p.Y/SCALE});
const same=(a,b,e=1e-8)=>Math.hypot(a.x-b.x,a.y-b.y)<=e;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const EPS=1e-7;
function normalizePath(points){
 const p=points.filter(x=>Number.isFinite(x.x)&&Number.isFinite(x.y)).map(point);
 if(p.length>1&&same(p[0],p[p.length-1]))p.pop();
 return p.filter((x,i)=>i===0||!same(x,p[i-1]));
}
function parsePath(d){
 const tokens=(String(d).match(/[MLZ]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi)||[]);
 const p=[];let closed=false;
 for(let i=0;i<tokens.length;){
  const c=tokens[i++].toUpperCase();
  if(c==='Z'){closed=true;continue;}
  if(c!=='M'&&c!=='L')return {points:[],closed:false};
  const x=Number(tokens[i++]),y=Number(tokens[i++]);
  if(!Number.isFinite(x)||!Number.isFinite(y))return {points:[],closed:false};
  p.push({x,y});
 }
 return {points:normalizePath(p),closed};
}
function orient(a,b,c){return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
function onSeg(a,p,b){
 return Math.abs(orient(a,p,b))<EPS&&p.x>=Math.min(a.x,b.x)-EPS&&p.x<=Math.max(a.x,b.x)+EPS&&p.y>=Math.min(a.y,b.y)-EPS&&p.y<=Math.max(a.y,b.y)+EPS;
}
function crosses(a,b,c,d){
 const o1=orient(a,b,c),o2=orient(a,b,d),o3=orient(c,d,a),o4=orient(c,d,b);
 if(o1*o2<-EPS&&o3*o4<-EPS)return true;
 return onSeg(a,c,b)||onSeg(a,d,b)||onSeg(c,a,d)||onSeg(c,b,d);
}
function intersectsSelf(points){
 const p=normalizePath(points);
 if(p.length>1200)return true;
 for(let i=0;i<p.length;i++){
  const a=p[i],b=p[(i+1)%p.length];
  for(let j=i+1;j<p.length;j++){
   if(j===i||j===(i+1)%p.length||(j+1)%p.length===i)continue;
   if(crosses(a,b,p[j],p[(j+1)%p.length]))return true;
  }
 }
 return false;
}
function canonicalEdges(points){
 const p=normalizePath(points);
 const q=x=>Math.round(x*100)/100;
 return p.map((a,i)=>{
  const b=p[(i+1)%p.length];
  const x=q(a.x)+','+q(a.y),y=q(b.x)+','+q(b.y);
  return x<y?x+'-'+y:y+'-'+x;
 }).sort().join('|');
}
function layerIsCut(layer){
 return !/(?:^|[_\-\s])(REFERENCE|NO.?CUT|SAW.?GUIDE|GUIDE|DIM|ANNOTATION|DRILL|MARKING|GRID|FRAME)(?:[_\-\s]|$)/i.test(layer||'');
}
export function preflightDxf(model,visible,{toolDiameter=3}={}){
 const selected=visible instanceof Set?visible:new Set((model.layers||[]).map(l=>l.name));
 const f=model?.unit?.factor;
 const errors=[],warnings=[],seen=new Map();
 const put=(list,code,message,layer='')=>list.push({code,message,layer});
 if(!(f>0))put(errors,'UNKNOWN_UNITS','ไฟล์ DXF ไม่ได้กำหนดหน่วยจริง ($INSUNITS) — ตั้งหน่วยใน CAD ก่อนคำนวณ Kerf');
 let closedCount=0,openCount=0,ignored=0;
 for(const path of model?.paths||[]){
  if(!selected.has(path.layer))continue;
  if(!layerIsCut(path.layer)){ignored++;continue;}
  const entry=parsePath(path.d);
  if(!entry.closed||entry.points.length<3){openCount++;put(errors,'OPEN_CONTOUR','พบเส้นเปิดบน Layer ตัด — Join/Close ใน CAD ก่อนทำ Nesting',path.layer);continue;}
  closedCount++;
  const p=entry.points.map(pt=>({x:pt.x*(f||1),y:pt.y*(f||1)}));
  const key=canonicalEdges(p);
  if(seen.has(key))put(errors,'DUPLICATE_CONTOUR','พบเส้นปิดซ้ำตำแหน่งเดียวกัน — ลบ Duplicate ก่อนตัด',path.layer);
  else seen.set(key,true);
  if(intersectsSelf(p))put(errors,'SELF_INTERSECTION','พบเส้นตัดตัวเองหรือซ้อนข้าม — แก้ Polyline ก่อนส่ง CAM',path.layer);
  if(p.some((q,i)=>dist(q,p[(i+1)%p.length])<.05))
   put(warnings,'SHORT_SEGMENT','พบช่วงเส้นสั้นกว่า 0.05 mm — ตรวจที่มาของ DXF',path.layer);
  const minX=Math.min(...p.map(x=>x.x)),maxX=Math.max(...p.map(x=>x.x)),minY=Math.min(...p.map(x=>x.y)),maxY=Math.max(...p.map(x=>x.y));
  if(toolDiameter>0&&(maxX-minX<toolDiameter-EPS||maxY-minY<toolDiameter-EPS))
   put(warnings,'DETAIL_UNDER_TOOL','มีรายละเอียดที่แคบกว่าขนาดดอกตัด — ตรวจรัศมีและ Inner Contour',path.layer);
 }
 if(!closedCount)put(errors,'NO_CLOSED_CUTS','ไม่มีเส้นปิดสำหรับทำชิ้นงาน — ตรวจ Layer หรือแปลงตัวอักษรเป็น Outline');
 if(model?.texts?.length)put(warnings,'TEXT_NOT_OUTLINED','DXF มีข้อความ TEXT/MTEXT — ต้อง Convert to Outline ก่อนใช้ตัด');
 const unsupported=(model?.unsupported||[]);
 if(unsupported.length)put(warnings,'APPROX_OR_UNSUPPORTED','มี Entity ที่แปลงโดยประมาณหรือยังไม่รองรับ: '+unsupported.join(', '));
 if(ignored)put(warnings,'GUIDE_SKIPPED','ข้าม Layer อ้างอิง '+ignored+' รายการ');
 const passed=errors.length===0;
 return {passed,camReady:false,errors,warnings,closedCount,openCount,ignoredCount:ignored,
   summary:passed?'Preflight เบื้องต้นผ่าน — ยังต้องตรวจ CAM':'พบปัญหาที่ต้องแก้ก่อนส่ง CAM'};
}
function clipPath(points){
 const arr=normalizePath(points).map(toInt);
 if(arr.length<3)throw Error('Polygon ต้องมีอย่างน้อย 3 จุด');
 return arr;
}
function offsetInt(points,delta){
 const co=new Clipper.ClipperOffset(2,.25*SCALE);
 co.AddPath(clipPath(points),Clipper.JoinType.jtRound,Clipper.EndType.etClosedPolygon);
 const out=new Clipper.Paths();
 co.Execute(out,delta*SCALE);
 return out;
}
export function offsetToolpathPreview(points,toolDiameter,side){
 const d=Number(toolDiameter);
 if(!Number.isFinite(d)||d<=0||d>100)throw Error('ขนาดดอกตัดต้องอยู่ในช่วงมากกว่า 0 ถึง 100 mm');
 if(side!=='inside'&&side!=='outside')throw Error('ต้องระบุ inside หรือ outside');
 const result=offsetInt(points,(side==='outside'?1:-1)*d/2);
 if(!result.length)throw Error('Offset หายไป — ขนาดช่อง/รูเล็กกว่าดอกตัด');
 return result.map(poly=>poly.map(fromInt));
}
function intersectInt(a,b){
 const clip=new Clipper.Clipper();
 clip.AddPath(a,Clipper.PolyType.ptSubject,true);
 clip.AddPath(b,Clipper.PolyType.ptClip,true);
 const result=new Clipper.Paths();
 clip.Execute(Clipper.ClipType.ctIntersection,result,Clipper.PolyFillType.pftNonZero,Clipper.PolyFillType.pftNonZero);
 return result.reduce((sum,p)=>sum+Math.abs(Clipper.Clipper.Area(p)),0)/(SCALE*SCALE);
}
export function polygonIntersectionArea(a,b){
 return intersectInt(clipPath(a),clipPath(b));
}
function rotatePoint(p,w,h,rotation){
 return rotation===90?{x:h-p.y,y:p.x}:{x:p.x,y:p.y};
}
function partOutline(part,rotation=0){
 const outer=(part.contours||[]).find(c=>!c.isHole);
 if(!outer||outer.points.length<3)throw Error('ชิ้นงาน '+part.label+' ไม่มีเส้นปิดด้านนอก');
 return outer.points.map(p=>rotatePoint(p,part.width,part.height,rotation));
}
function bb(poly){
 return {x:Math.min(...poly.map(p=>p.x)),y:Math.min(...poly.map(p=>p.y)),
  maxX:Math.max(...poly.map(p=>p.x)),maxY:Math.max(...poly.map(p=>p.y))};
}
function translated(path,x,y){return path.map(p=>({x:p.x+x,y:p.y+y}));}
function intersectBB(a,b){
 return a.x<b.maxX-1e-6&&a.maxX>b.x+1e-6&&a.y<b.maxY-1e-6&&a.maxY>b.y+1e-6;
}
/** Grid + placement-edge candidate search. Tests actual polygons, not just bounding rectangles.
 * Holes may contain toolpaths but are deliberately not available as nesting cavities.
 * Limited to small cutting layouts: NOT an industrial best-fit optimizer.
 */
export function packPolygonAware(parts,options){
 const sw=Number(options.width),sh=Number(options.height),margin=Number(options.margin??15);
 const gap=Number(options.gap??12),kerf=Number(options.kerf??3),quantity=Number(options.quantity??1);
 if(![sw,sh,margin,gap,kerf,quantity].every(Number.isFinite)||sw<=0||sh<=0||margin<0||gap<0||kerf<0||quantity<1||quantity>20)throw Error('ข้อมูลวัสดุ / ช่องไฟ / จำนวนชุด ไม่ถูกต้อง');
 const requested=[];
 for(const p of parts)for(let i=0;i<quantity*(p.quantity||1);i++){
  if(p.estimated)throw Error('โหมด Polygon-aware ไม่รับตัวอย่าง BBox ให้ใช้โหมดกรอบสี่เหลี่ยม');
  requested.push({...p,instance:i+1});
 }
 if(!requested.length)throw Error('ไม่มีชิ้นงาน Closed Contour');
 if(requested.length>24)throw Error('Polygon-aware สำหรับการตรวจเบื้องต้นรองรับไม่เกิน 24 ชิ้นต่อครั้ง');
 requested.sort((a,b)=>b.width*b.height-a.width*a.height||a.id.localeCompare(b.id));
 const pad=(kerf+gap)/2;
 const maxSheets=Math.min(30,options.maxSheets||30);
 const sheets=[],placements=[];
 const step=Math.max(2,Math.min(12,Math.floor(Math.min(sw,sh)/65)||2));
 function trySheet(p,sheetIdx){
  const shapes=[{angle:0,w:p.width,h:p.height},...(options.allowRotate&&p.width!==p.height?[{angle:90,w:p.height,h:p.width}]:[])];
  for(const shape of shapes){
   const local=partOutline(p,shape.angle);
   let expanded;
   if(pad>0){
    const pp=offsetInt(local,pad);
    if(pp.length!==1)throw Error('Offset geometry ก่อให้เกิดหลาย Polygon โปรดตรวจชิ้นงานใน CAD');
    expanded=pp[0].map(fromInt);
   }else expanded=local;
   const localBB=bb(expanded);
   const xMin=margin-localBB.x,xMax=sw-margin-localBB.maxX;
   const yMin=margin-localBB.y,yMax=sh-margin-localBB.maxY;
   if(xMax<xMin-1e-7||yMax<yMin-1e-7)continue;
   const anchorsX=[xMin,...placements.filter(q=>q.sheetIndex===sheetIdx).flatMap(q=>[q.x+q.width+pad*2,q.x-shape.w-pad*2])];
   const anchorsY=[yMin,...placements.filter(q=>q.sheetIndex===sheetIdx).flatMap(q=>[q.y+q.height+pad*2,q.y-shape.h-pad*2])];
   const positions=[];
   for(const y of anchorsY)for(const x of anchorsX)positions.push({x,y});
   for(let y=yMin;y<=yMax+1e-7;y+=step)for(let x=xMin;x<=xMax+1e-7;x+=step)positions.push({x,y});
   // Deduplicate. Row first/left first heuristic yields reproducible results.
   positions.sort((a,b)=>a.y-b.y||a.x-b.x);
   const seen=new Set();
   let checks=0;
   for(const pos of positions){
    const {x,y}=pos,k=Math.round(x*10)+':'+Math.round(y*10);
    if(seen.has(k)||x<xMin-1e-7||x>xMax+1e-7||y<yMin-1e-7||y>yMax+1e-7)continue;
    seen.add(k);
    if(++checks>24000)throw Error('เกินขีดจำกัดการค้นหาตำแหน่ง Polygon — ลองลดจำนวนชิ้น/เพิ่มขนาดแผ่น');
    const polygon=translated(expanded,x,y),bbox=bb(polygon);
    let collides=false;
    for(const other of sheets[sheetIdx].polygons){
     if(intersectBB(bbox,other.bounds)&&polygonIntersectionArea(polygon,other.polygon)>0.000001){collides=true;break;}
    }
    if(!collides){
     sheets[sheetIdx].polygons.push({polygon,bounds:bbox});
     const placement={id:p.id,instance:p.instance,label:p.label,sheetIndex:sheetIdx,
      x:Math.round(x*1000)/1000,y:Math.round(y*1000)/1000,
      width:shape.w,height:shape.h,rotation:shape.angle,cutLengthMm:p.cutLengthMm,
      sourceWidth:p.width,sourceHeight:p.height,contours:p.contours,estimated:false};
     placements.push(placement);
     return true;
    }
   }
  }
  return false;
 }
 for(const part of requested){
  let placed=false;
  for(let i=0;i<sheets.length;i++){if(trySheet(part,i)){placed=true;break;}}
  if(!placed){
   if(sheets.length>=maxSheets)throw Error('จำนวนแผ่นเกินที่อนุญาต');
   sheets.push({polygons:[]});
   if(!trySheet(part,sheets.length-1))throw Error('พื้นที่วัสดุไม่พอสำหรับชิ้นงาน '+part.label);
  }
 }
 const used=placements.reduce((v,p)=>v+p.width*p.height,0);
 return {placements,sheetCount:sheets.length,sheet:{width:sw,height:sh,margin,gap,kerf},
  cutLengthMm:placements.reduce((v,p)=>v+(p.cutLengthMm||0),0),
  utilization:Math.round(used/(sheets.length*sw*sh)*1000)/10,isEstimate:false,
  algorithm:'polygon-aware',warnings:['Polygon-aware ทดสอบระยะชน Polygon แต่ยังไม่ใช่ CAM / NFP ที่พิสูจน์ความเหมาะสมสูงสุด',
   'รูภายใน (Holes) ไม่ถูกใช้เป็นพื้นที่วางชิ้นอื่น']};
}
