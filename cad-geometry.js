// DXF geometry for INSPECTION ONLY. Sampling arcs is not CAM-grade toolpath data.
export const mmFactors = { 1:25.4, 2:304.8, 4:1, 5:10, 6:1000, 14:100 };
export function dxfUnit(code) {
  const names={0:'drawing units',1:'in',2:'ft',4:'mm',5:'cm',6:'m',14:'dm'};
  return {label:names[code]||'drawing units',factor:mmFactors[code]??null};
}
export function isPdfCompatibleAI(bytes){
  let header='';
  for(let i=0;i<Math.min(64,bytes.length);i++) header+=String.fromCharCode(bytes[i]);
  return header.includes('%PDF-');
}
export function drawingFromDxf(doc) {
  const paths=[], texts=[], layers=new Map(), unsupported=new Set(), snapPoints=[];
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  const point=p=>{if(!p||!Number.isFinite(p.x)||!Number.isFinite(p.y))return;
    minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);};
  const add=(pts,layer,closed=false)=>{
    if(pts.length<2)return;
    pts.forEach(point);snapPoints.push(...pts.filter((_,i)=>i===0||i===pts.length-1));
    paths.push({layer, d:pts.map((p,i)=>(i?'L':'M')+p.x+' '+(-p.y)).join(' ')+(closed?' Z':'')});};
  const arc=(c,r,from,sweep)=>{
    const n=Math.max(24,Math.ceil(Math.abs(sweep)/(Math.PI*2)*192));
    return Array.from({length:n+1},(_,i)=>({x:c.x+r*Math.cos(from+sweep*i/n),y:c.y+r*Math.sin(from+sweep*i/n)}));};
  const poly=(e,layer)=>{
    const v=e.vertices||[];if(v.length<2)return;let pts=[];const closed=!!(e.shape||e.closed);
    for(let i=0;i<(closed?v.length:v.length-1);i++){
      const a=v[i],b=v[(i+1)%v.length];if(!pts.length)pts.push({x:a.x,y:a.y});
      const bulge=Number(a.bulge||0),dx=b.x-a.x,dy=b.y-a.y, chord=Math.hypot(dx,dy);
      if(Math.abs(bulge)<1e-9||chord<1e-9){pts.push({x:b.x,y:b.y});continue;}
      const offset=chord*(1-bulge*bulge)/(4*bulge);
      const c={x:(a.x+b.x)/2-dy/chord*offset,y:(a.y+b.y)/2+dx/chord*offset};
      pts.push(...arc(c,Math.hypot(a.x-c.x,a.y-c.y),Math.atan2(a.y-c.y,a.x-c.x),4*Math.atan(bulge)).slice(1));
    }
    add(pts,layer,closed);
  };
  for(const e of doc.entities||[]) {
    const layer=e.layer||'0';layers.set(layer,(layers.get(layer)||0)+1);
    switch(e.type) {
      case 'LINE': add(e.vertices||[],layer);break;
      case 'LWPOLYLINE':case 'POLYLINE':poly(e,layer);break;
      case 'CIRCLE':if(e.center&&e.radius>0)add(arc(e.center,e.radius,0,Math.PI*2),layer,true);break;
      case 'ARC':if(e.center&&e.radius>0){
        const start=e.startAngle||0,end=e.endAngle||0;
        const sweep=((end-start+Math.PI*2)%(Math.PI*2))||Math.PI*2;
        add(arc(e.center,e.radius,start,sweep),layer);}break;
      case 'ELLIPSE':{
        const major=e.majorAxisEndPoint||e.majorAxis;
        const c=e.center,ratio=e.axisRatio;
        if(!major||!c||!Number.isFinite(ratio)){unsupported.add('ELLIPSE');break;}
        const start=e.startAngle??e.startParameter??0;
        const end=e.endAngle??e.endParameter??(Math.PI*2);
        const sweep=((end-start+Math.PI*2)%(Math.PI*2))||Math.PI*2;
        const n=Math.max(32,Math.ceil(sweep/(Math.PI*2)*192));
        add(Array.from({length:n+1},(_,i)=>{
          const a=start+sweep*i/n;
          return {x:c.x+major.x*Math.cos(a)-major.y*ratio*Math.sin(a),
                  y:c.y+major.y*Math.cos(a)+major.x*ratio*Math.sin(a)};}),layer,sweep>6.28);
        break;}
      case 'TEXT':case 'MTEXT':{
        const p=e.startPoint||e.position||e.insertionPoint;
        const val=String(e.text||e.string||'').replace(/\\P/g,' ').replace(/[{}]/g,'').trim();
        if(p&&val){const size=Math.max(Number(e.textHeight||e.height||2.5),.5);
          texts.push({layer,x:p.x,y:p.y,size,value:val});
          point(p);point({x:p.x+val.length*size*.6,y:p.y+size});}
        break;}
      case 'POINT': if(e.position){const p=e.position;const q=.5;add([{x:p.x-q,y:p.y},{x:p.x+q,y:p.y}],layer);
        add([{x:p.x,y:p.y-q},{x:p.x,y:p.y+q}],layer);}break;
      default:unsupported.add(e.type||'unknown');
    }
  }
  if(!Number.isFinite(minX)||!Number.isFinite(maxX)) throw new Error('ไม่พบ geometry 2D ที่พรีวิวได้ในไฟล์ DXF');
  const unit=dxfUnit(Number(doc.header?.$INSUNITS??0));
  return {paths,texts,layers:[...layers].map(([name,count])=>({name,count})),unsupported:[...unsupported],
    bounds:{minX,minY,maxX,maxY,width:Math.max(maxX-minX,.0001),height:Math.max(maxY-minY,.0001)},
    unit, entityCount:(doc.entities||[]).length,snapPoints};
}
