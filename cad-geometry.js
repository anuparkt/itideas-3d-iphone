// DXF preview geometry. Sampled curves are for inspection only, NOT CNC toolpaths.
export const mmFactors={1:25.4,2:304.8,4:1,5:10,6:1000,14:100};
export function dxfUnit(code){
 const names={0:'drawing units',1:'in',2:'ft',4:'mm',5:'cm',6:'m',14:'dm'};
 return {label:names[code]||'drawing units',factor:mmFactors[code]??null};
}
export function isPdfCompatibleAI(bytes){
 let header='';
 for(let i=0;i<Math.min(bytes.length,64);i++)header+=String.fromCharCode(bytes[i]);
 return header.includes('%PDF-');
}
const id=p=>({x:Number(p.x),y:Number(p.y)});
function sampleArc(c,r,start,sweep){
 const count=Math.max(20,Math.min(768,Math.ceil(Math.abs(sweep)/(Math.PI*2)*192)));
 return Array.from({length:count+1},(_,i)=>({x:c.x+r*Math.cos(start+sweep*i/count),y:c.y+r*Math.sin(start+sweep*i/count)}));
}
function sampleSpline(e){
 const pts=e.controlPoints?.length>=2?e.controlPoints:e.fitPoints;
 if(!pts||pts.length<2)return [];
 const degree=Math.max(1,Math.min(5,Math.floor(e.degreeOfSplineCurve||3),pts.length-1));
 const knots=e.knotValues;
 if(e.controlPoints?.length>=2&&Array.isArray(knots)&&knots.length===pts.length+degree+1){
   const low=knots[degree],high=knots[pts.length];
   if(!Number.isFinite(low)||!Number.isFinite(high)||high<=low)return pts.map(id);
   const n=Math.min(768,Math.max(48,pts.length*18)),sample=[];
   for(let k=0;k<=n;k++){
     const u=k===n?high-1e-10:(low+(high-low)*k/n);
     let span=degree;
     for(let i=degree;i<pts.length;i++){if(u>=knots[i]&&u<knots[i+1]){span=i;break;}}
     if(k===n)span=pts.length-1;
     const d=Array.from({length:degree+1},(_,j)=>({...pts[span-degree+j]}));
     for(let r=1;r<=degree;r++){
       for(let j=degree;j>=r;j--){
         const i=span-degree+j,den=knots[i+degree-r+1]-knots[i];
         const alpha=den?(u-knots[i])/den:0;
         d[j]={x:(1-alpha)*d[j-1].x+alpha*d[j].x,y:(1-alpha)*d[j-1].y+alpha*d[j].y};
       }
     }
     sample.push({x:d[degree].x,y:d[degree].y});
   }
   return sample;
 }
 // Fit-point fallback: chordal polyline. Not intended for manufacturing.
 return pts.map(id);
}
export function drawingFromDxf(doc){
 const paths=[],texts=[],layers=new Map(),unsupported=new Set(),snapPoints=[];
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity,entityCount=0;
 const point=p=>{
   if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return;
   minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);
 };
 const plot=(pts,layer,closed=false,transform=id)=>{
   const clean=pts.map(transform).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
   if(clean.length<2)return;
   clean.forEach(point);
   snapPoints.push(clean[0],clean.at(-1));
   paths.push({layer,d:clean.map((p,i)=>(i?'L':'M')+p.x+' '+(-p.y)).join(' ')+(closed?' Z':'')});
 };
 const poly=(e,layer,transform)=>{
   const v=e.vertices||[],closed=!!(e.shape||e.closed);
   if(v.length<2)return;
   const output=[id(v[0])];
   const edgeCount=closed?v.length:v.length-1;
   for(let i=0;i<edgeCount;i++){
     const a=v[i],b=v[(i+1)%v.length],dx=b.x-a.x,dy=b.y-a.y,chord=Math.hypot(dx,dy);
     const bulge=Number(a.bulge||0);
     if(Math.abs(bulge)<1e-10||chord<1e-10){output.push(id(b));continue;}
     const offset=chord*(1-bulge*bulge)/(4*bulge);
     const c={x:(a.x+b.x)/2-dy/chord*offset,y:(a.y+b.y)/2+dx/chord*offset};
     output.push(...sampleArc(c,Math.hypot(a.x-c.x,a.y-c.y),Math.atan2(a.y-c.y,a.x-c.x),4*Math.atan(bulge)).slice(1));
   }
   plot(output,layer,closed,transform);
 };
 function expand(e,transform=id,parentLayer='0',depth=0,stack=[]){
   if(depth>12){unsupported.add('nested INSERT (>12)');return;}
   const layer=(!e.layer||e.layer==='0')?parentLayer:e.layer;
   if(e.type==='INSERT'){
     const block=doc.blocks?.[e.name];
     if(!block||stack.includes(e.name)){unsupported.add('INSERT:'+String(e.name||'missing'));return;}
     const base=block.position||{x:0,y:0},offset=e.position||{x:0,y:0};
     const sx=Number(e.xScale??1),sy=Number(e.yScale??1);
     const rad=Number(e.rotation||0)*Math.PI/180,co=Math.cos(rad),si=Math.sin(rad);
     const rows=Math.min(100,Math.max(1,Math.floor(e.rowCount||1)));
     const cols=Math.min(100,Math.max(1,Math.floor(e.columnCount||1)));
     for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
       const ox=col*Number(e.columnSpacing||0),oy=row*Number(e.rowSpacing||0);
       const child=p=>{
         const x=(p.x-base.x+ox)*sx,y=(p.y-base.y+oy)*sy;
         return transform({x:offset.x+x*co-y*si,y:offset.y+x*si+y*co});
       };
       for(const nested of block.entities||[])expand(nested,child,layer,depth+1,[...stack,e.name]);
     }
     return;
   }
   entityCount++;
   layers.set(layer,(layers.get(layer)||0)+1);
   switch(e.type){
     case 'LINE':{
       const pts=e.vertices||[e.startPoint,e.endPoint].filter(Boolean);
       plot(pts,layer,false,transform);break;}
     case 'LWPOLYLINE':case 'POLYLINE':poly(e,layer,transform);break;
     case 'CIRCLE':if(e.center&&e.radius>0)plot(sampleArc(e.center,e.radius,0,Math.PI*2),layer,true,transform);break;
     case 'ARC':if(e.center&&e.radius>0){
       const a=e.startAngle||0,b=e.endAngle||0;
       const sweep=(b-a+Math.PI*2)%(Math.PI*2)||Math.PI*2;
       plot(sampleArc(e.center,e.radius,a,sweep),layer,false,transform);
       }break;
     case 'ELLIPSE':{
       const c=e.center,major=e.majorAxisEndPoint||e.majorAxis,ratio=e.axisRatio;
       if(!c||!major||!Number.isFinite(ratio)){unsupported.add('ELLIPSE');break;}
       const start=e.startAngle??e.startParameter??0,end=e.endAngle??e.endParameter??Math.PI*2;
       const sweep=(end-start+Math.PI*2)%(Math.PI*2)||Math.PI*2;
       const n=Math.max(32,Math.ceil(sweep/(Math.PI*2)*192)),samples=[];
       for(let j=0;j<=n;j++){const t=start+sweep*j/n;
         samples.push({x:c.x+major.x*Math.cos(t)-major.y*ratio*Math.sin(t),
                       y:c.y+major.y*Math.cos(t)+major.x*ratio*Math.sin(t)});}
       plot(samples,layer,sweep>6.28,transform);break;}
     case 'SPLINE':{
       const s=sampleSpline(e);
       if(s.length){plot(s,layer,!!e.closed,transform);unsupported.add('SPLINE approximate');}
       else unsupported.add('SPLINE');
       break;}
     case 'TEXT':case 'MTEXT':{
       const p=e.startPoint||e.position||e.insertionPoint;
       const str=String(e.text||e.string||'').replace(/\\P/g,' ').replace(/[{}]/g,'').trim();
       if(!p||!str)break;
       const q=transform(p),size=Math.max(Number(e.textHeight||e.height||2.5),.5);
       texts.push({layer,x:q.x,y:q.y,size,value:str});
       point(q);point({x:q.x+str.length*size*.6,y:q.y+size});break;
     }
     case 'POINT':if(e.position){const p=e.position;
       plot([{x:p.x-.5,y:p.y},{x:p.x+.5,y:p.y}],layer,false,transform);
       plot([{x:p.x,y:p.y-.5},{x:p.x,y:p.y+.5}],layer,false,transform);}break;
     default:unsupported.add(e.type||'unknown');
   }
 }
 for(const e of doc.entities||[])expand(e);
 if(!Number.isFinite(minX)||!Number.isFinite(maxX)){
   const types=[...unsupported].join(', ');
   throw new Error('DXF ไม่มีเส้น 2D ที่รองรับ'+(types?' (พบ: '+types+')':'')+' — ลอง Export เป็น ASCII DXF พร้อม Explode BLOCK และแปลง Spline เป็น Polyline');
 }
 const unit=dxfUnit(Number(doc.header?.$INSUNITS??0));
 return {paths,texts,layers:[...layers].map(([name,count])=>({name,count})),unsupported:[...unsupported],
   bounds:{minX,minY,maxX,maxY,width:Math.max(maxX-minX,.0001),height:Math.max(maxY-minY,.0001)},
   unit,entityCount,snapPoints};
}
