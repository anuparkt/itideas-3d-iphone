import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {cad2d,loadCad2D} from './cad2d.js';
import {setupNestingUI} from './nesting-ui.js';
import {exportSvg,exportPrintPdf,exportReviewPdf,exportJpegReviewPdf,choosePreviewPixels} from './cad-export.js';

const $=id=>document.getElementById(id);
const viewer=$('viewer'), emptyState=$('emptyState'), loading=$('loading');
const scene=new THREE.Scene(); scene.background=new THREE.Color(0x0b1220);
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,alpha:false});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2)); renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.shadowMap.enabled=true; viewer.appendChild(renderer.domElement);
const persp=new THREE.PerspectiveCamera(45,1,.01,1000000);
const ortho=new THREE.OrthographicCamera(-100,100,100,-100,-100000,100000);
let camera=persp;
const controls=new OrbitControls(camera,renderer.domElement); controls.enableDamping=true; controls.dampingFactor=.08; controls.screenSpacePanning=true; controls.rotateSpeed=.75; controls.zoomSpeed=.9; controls.panSpeed=.75; controls.target.set(0,0,0);

scene.add(new THREE.HemisphereLight(0xffffff,0x334155,2.2));
const key=new THREE.DirectionalLight(0xffffff,2.4); key.position.set(100,160,120); scene.add(key);
const fill=new THREE.DirectionalLight(0x8ec5ff,1.2); fill.position.set(-120,80,-70); scene.add(fill);
const grid=new THREE.GridHelper(200,20,0x4b647f,0x24364d); scene.add(grid);
const axes=new THREE.AxesHelper(60); scene.add(axes);

let modelRoot=null, edgesGroup=null, bounds=null, measureMode=false, measurePts=[], measureObjects=[], last3DFile=null;
const raycaster=new THREE.Raycaster(), pointer=new THREE.Vector2();
const bgColors=[0x0b1220,0x171717,0x243041,0xf3f4f6]; let bgIndex=0;

function showToast(msg,ms=2200){const t=$('toast');t.textContent=msg;t.classList.remove('hidden');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>t.classList.add('hidden'),ms)}
function showFileError(file,e){$('fileErrorDetail').textContent=(file?.name||'ไม่ทราบชื่อไฟล์')+' — '+(e?.message||'Unknown error')+'\nถ้าไฟล์นี้เปิดใน AutoCAD ได้ โปรดส่งไฟล์ DXF ต้นฉบับหรือภาพ Error นี้ให้ตรวจ';$('fileError').classList.remove('hidden')}
$('dismissFileError').onclick=()=>$('fileError').classList.add('hidden');
function setLoading(on,title='กำลังเปิดไฟล์…',text='กำลังประมวลผลโมเดล'){loading.classList.toggle('hidden',!on);$('loadingTitle').textContent=title;$('loadingText').textContent=text}
function fmtBytes(n){if(!Number.isFinite(n))return '—';if(n<1024)return n+' B';if(n<1048576)return (n/1024).toFixed(1)+' KB';return (n/1048576).toFixed(1)+' MB'}
function fmt(v){if(!Number.isFinite(v))return '—';if(Math.abs(v)>=100)return v.toFixed(1)+' mm';return v.toFixed(2)+' mm'}
function resize(){const r=viewer.getBoundingClientRect();if(r.width<2||r.height<2)return;renderer.setSize(r.width,r.height,false);persp.aspect=r.width/r.height;persp.updateProjectionMatrix();if(bounds){const s=bounds.getSize(new THREE.Vector3());const max=Math.max(s.x,s.y,s.z)||100;ortho.left=-max*.75*r.width/r.height;ortho.right=max*.75*r.width/r.height;ortho.top=max*.75;ortho.bottom=-max*.75;ortho.updateProjectionMatrix()}}
new ResizeObserver(resize).observe(viewer);resize();

function setControlsCamera(newCam){const pos=camera.position.clone(), target=controls.target.clone();controls.dispose();camera=newCam;camera.position.copy(pos);const c=new OrbitControls(camera,renderer.domElement);Object.assign(controls,c);controls.target.copy(target)}

function disposeModel(){clearMeasure();if(modelRoot){scene.remove(modelRoot);modelRoot.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose&&m.dispose())}});modelRoot=null}if(edgesGroup){scene.remove(edgesGroup);edgesGroup.traverse(o=>o.geometry&&o.geometry.dispose());edgesGroup=null}}
function standardMaterial(){return new THREE.MeshStandardMaterial({color:0xd9e5f3,metalness:.08,roughness:.62,side:THREE.DoubleSide})}
function normalizeMaterials(root){root.traverse(o=>{if(o.isMesh){if(!o.material)o.material=standardMaterial();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>{m.side=THREE.DoubleSide;m.transparent=false;m.opacity=1;m.depthWrite=true})}})}
function centerOnOrigin(root){bounds=new THREE.Box3().setFromObject(root);if(bounds.isEmpty())return;const center=bounds.getCenter(new THREE.Vector3());root.position.sub(center);bounds.setFromObject(root)}
function createEdges(){if(edgesGroup){scene.remove(edgesGroup);edgesGroup=null}edgesGroup=new THREE.Group();if(!modelRoot)return;modelRoot.traverse(o=>{if(o.isMesh&&o.geometry){const e=new THREE.EdgesGeometry(o.geometry,25);const l=new THREE.LineSegments(e,new THREE.LineBasicMaterial({color:0x26384f,transparent:true,opacity:.65}));l.matrixAutoUpdate=false;l.matrix.copy(o.matrixWorld);edgesGroup.add(l)}});scene.add(edgesGroup)}
function setRenderMode(){if(!modelRoot)return;const mode=$('renderMode').value;const opacity=parseFloat($('opacity').value);modelRoot.traverse(o=>{if(!o.isMesh)return;const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>{m.wireframe=mode==='wireframe';m.transparent=opacity<.999;m.opacity=opacity;m.depthWrite=opacity>.45})});if(!edgesGroup)createEdges();edgesGroup.visible=mode==='edges'}

function fitView(view='iso'){if(cad2d.active){cad2d.fit();return;}if(!bounds||!modelRoot)return;bounds.setFromObject(modelRoot);const size=bounds.getSize(new THREE.Vector3()), center=bounds.getCenter(new THREE.Vector3()), max=Math.max(size.x,size.y,size.z)||10;controls.target.copy(center);let dir=new THREE.Vector3(1,1,1);if(view==='front')dir.set(0,0,1);if(view==='back')dir.set(0,0,-1);if(view==='right')dir.set(1,0,0);if(view==='left')dir.set(-1,0,0);if(view==='top')dir.set(0,1,0);if(view==='bottom')dir.set(0,-1,0);const dist=max*2.3;camera.position.copy(center).add(dir.normalize().multiplyScalar(dist));camera.near=Math.max(max/10000,.001);camera.far=max*1000;camera.updateProjectionMatrix();if(camera.isOrthographicCamera){const r=viewer.clientWidth/Math.max(viewer.clientHeight,1);camera.left=-max*.75*r;camera.right=max*.75*r;camera.top=max*.75;camera.bottom=-max*.75;camera.updateProjectionMatrix()}controls.update();document.querySelectorAll('.view-pills [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view))}

function calcStats(root){let meshes=0,tris=0;root.traverse(o=>{if(o.isMesh&&o.geometry){meshes++;const g=o.geometry;tris+=g.index?g.index.count/3:(g.attributes.position?.count||0)/3}});return{meshes,triangles:Math.round(tris)}}
function updateInfo(file,format,root){bounds=new THREE.Box3().setFromObject(root);const s=bounds.getSize(new THREE.Vector3()), st=calcStats(root);$('fileName').textContent=file.name;$('fileSize').textContent=fmtBytes(file.size);$('formatBadge').textContent=format.toUpperCase();const unitless=(format==='obj'||format==='ply');
const displayNum=x=>unitless?(Number(x).toFixed(2)+' units'):fmt(x);
$('dimX').textContent=displayNum(s.x);$('dimY').textContent=displayNum(s.y);$('dimZ').textContent=displayNum(s.z);$('triCount').textContent=st.triangles.toLocaleString();$('geometryCountLabel').textContent='Triangles';$('fileName').title=file.name;$('hudName').textContent=file.name;$('hudDims').textContent=`X ${s.x.toFixed(2)} · Y ${s.y.toFixed(2)} · Z ${s.z.toFixed(2)} ${unitless?'model units':'mm'}`;emptyState.classList.add('hidden')}

async function readSTEP(file,buffer){setLoading(true,'กำลังเปิด STEP…','กำลังโหลด CAD engine ครั้งแรกอาจใช้เวลาสักครู่');const base='https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/';if(!window.occtimportjs){await new Promise((res,rej)=>{const s=document.createElement('script');s.src=base+'occt-import-js.js';s.onload=res;s.onerror=()=>rej(new Error('โหลด STEP engine ไม่สำเร็จ'));document.head.appendChild(s)})}const occt=await window.occtimportjs({locateFile:path=>base+path});const result=occt.ReadStepFile(new Uint8Array(buffer),null);if(!result||!result.meshes||!result.meshes.length)throw new Error('ไม่พบ mesh ในเฟล์ STEP');const group=new THREE.Group();for(const m of result.meshes){const g=new THREE.BufferGeometry();const p=m.attributes?.position?.array;if(!p)continue;g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));const n=m.attributes?.normal?.array;if(n)g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));else g.computeVertexNormals();if(m.index?.array)g.setIndex(Array.from(m.index.array));g.computeBoundingSphere();const mat=standardMaterial();group.add(new THREE.Mesh(g,mat))}return group}

function readGltfEmbedded(buffer){
 return new Promise((resolve,reject)=>{
  new GLTFLoader().parse(buffer,'',loaded=>{
   if(!loaded?.scene)reject(new Error('glTF ไม่มี Scene ที่แสดงผลได้'));else resolve(loaded.scene);
  },error=>reject(new Error('อ่าน glTF ไม่สำเร็จ: '+(error?.message||'ต้องใช้ .glb หรือ glTF ที่ฝัง textures และ buffers ไว้ในไฟล์เดียว'))));
 });
}
function readExtra3D(ext,buffer){
 if(ext==='obj'){
  const object=new OBJLoader().parse(new TextDecoder().decode(buffer));
  normalizeMaterials(object);return object;
 }
 if(ext==='ply'){
  const geometry=new PLYLoader().parse(buffer);
  if(!geometry.getAttribute('normal'))geometry.computeVertexNormals();
  const group=new THREE.Group();group.add(new THREE.Mesh(geometry,standardMaterial()));
  return group;
 }
 return readGltfEmbedded(buffer);
}
async function loadFile(file){const ext=file.name.split('.').pop().toLowerCase();if(!['stl','3mf','step','stp','dxf','ai','obj','ply','glb','gltf'].includes(ext)){showToast('รองรับ STL, 3MF, STEP, DXF, AI, OBJ, PLY และ GLB/glTF');return}$('fileError').classList.add('hidden');setLoading(true);try{if(ext==='dxf'||ext==='ai'){disposeModel();await loadCad2D(file);last3DFile=null;syncExportButtons();nestingUI.onFileLoaded(ext);showToast('เปิดไฟล์ 2D สำเร็จ');return;}cad2d.hide();const infoTab=document.querySelector('[data-tab="info"]');if(document.querySelector('.tabs [data-tab="layers"].active'))infoTab?.click();disposeModel();const buffer=await file.arrayBuffer();let root;if(ext==='stl'){const g=new STLLoader().parse(buffer);g.computeVertexNormals();root=new THREE.Group();root.add(new THREE.Mesh(g,standardMaterial()))}else if(ext==='3mf'){root=new ThreeMFLoader().parse(buffer);normalizeMaterials(root)}else if(ext==='step'||ext==='stp'){root=await readSTEP(file,buffer);}
else{root=await readExtra3D(ext,buffer);if(ext==='glb'||ext==='gltf')root.scale.multiplyScalar(1000);}
if(!root)throw Error('ไม่พบ Scene หรือ Geometry ในไฟล์ 3D');
modelRoot=root;scene.add(modelRoot);centerOnOrigin(modelRoot);modelRoot.updateMatrixWorld(true);createEdges();setRenderMode();updateInfo(file,ext,modelRoot);last3DFile=file;syncExportButtons();nestingUI.onFileLoaded(ext);fitView('iso');showToast('เปิดไฟล์เรียบร้อย')}catch(e){console.error(e);disposeModel();cad2d.hide();last3DFile=null;syncExportButtons();emptyState.classList.remove('hidden');showFileError(file,e);showToast('เปิดไฟล์ไม่สำเร็จ — ดูรายละเอียดบนหน้าจอ',4200)}finally{setLoading(false)}}

function clearMeasure(){measurePts=[];measureObjects.forEach(o=>{scene.remove(o);o.geometry&&o.geometry.dispose();o.material&&o.material.dispose()});measureObjects=[];$('measureReadout').textContent='ระยะ: —'}
function addMarker(p){const g=new THREE.SphereGeometry(Math.max((bounds?.getSize(new THREE.Vector3()).length()||100)*.006,.5),16,10);const m=new THREE.MeshBasicMaterial({color:0x67e8f9});const s=new THREE.Mesh(g,m);s.position.copy(p);scene.add(s);measureObjects.push(s)}
function drawMeasure(){if(measurePts.length!==2)return;const g=new THREE.BufferGeometry().setFromPoints(measurePts);const l=new THREE.Line(g,new THREE.LineBasicMaterial({color:0x67e8f9,depthTest:false}));scene.add(l);measureObjects.push(l);const d=measurePts[0].distanceTo(measurePts[1]);$('measureReadout').textContent=`ระยะ: ${d.toFixed(2)} mm`;measureMode=false;$('measureBtn').textContent='เริ่มวัด';showToast(`ระยะ ${d.toFixed(2)} mm`)}
let downPt=null;renderer.domElement.addEventListener('pointerdown',e=>{downPt={x:e.clientX,y:e.clientY}});renderer.domElement.addEventListener('pointerup',e=>{if(!measureMode||!modelRoot||!downPt)return;if(Math.hypot(e.clientX-downPt.x,e.clientY-downPt.y)>8)return;const r=renderer.domElement.getBoundingClientRect();pointer.x=((e.clientX-r.left)/r.width)*2-1;pointer.y=-((e.clientY-r.top)/r.height)*2+1;raycaster.setFromCamera(pointer,camera);const meshes=[];modelRoot.traverse(o=>{if(o.isMesh)meshes.push(o)});const hit=raycaster.intersectObjects(meshes,true)[0];if(hit){measurePts.push(hit.point.clone());addMarker(hit.point);if(measurePts.length===2)drawMeasure()}});

const nestingUI=setupNestingUI({cad2d,showToast,showFileError});
$('demoDxfBtn').onclick=()=>{
 const sample=['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
 '0','SECTION','2','ENTITIES','0','LWPOLYLINE','8','CUT','90','4','70','1',
 '10','0','20','0','10','100','20','0','10','100','20','50','10','0','20','50',
 '0','CIRCLE','8','DRILL','10','50','20','25','40','10',
 '0','ENDSEC','0','EOF'].join('\n');
 loadFile(new File([sample],'DEMO_100x50_mm.dxf',{type:'application/dxf'}));
};
$('openBtn').onclick=()=>$('fileInput').click();$('fileInput').onchange=e=>{const f=e.target.files?.[0];if(f)loadFile(f);e.target.value=''};
document.querySelectorAll('.view-pills [data-view]').forEach(b=>b.onclick=()=>fitView(b.dataset.view));$('fitBtn').onclick=()=>fitView('iso');$('resetBtn').onclick=()=>fitView('iso');
$('renderMode').onchange=setRenderMode;$('opacity').oninput=setRenderMode;$('gridToggle').onchange=e=>grid.visible=e.target.checked;$('axesToggle').onchange=e=>axes.visible=e.target.checked;$('autoRotate').onchange=e=>controls.autoRotate=e.target.checked;
$('cameraMode').onchange=e=>{const old=camera,newCam=e.target.value==='orthographic'?ortho:persp;newCam.position.copy(old.position);camera=newCam;controls.object=camera;resize();fitView('iso')};
$('measureBtn').onclick=()=>{if(cad2d.active){cad2d.beginMeasure();return;}if(!modelRoot){showToast('เปิดไฟล์ก่อน');return}clearMeasure();measureMode=true;$('measureBtn').textContent='แตะจุดที่ 1 และ 2';showToast('แตะผิวโมเดล 2 จุด')};$('clearMeasureBtn').onclick=()=>{if(cad2d.active){cad2d.clearMeasure();return;}clearMeasure();measureMode=false;$('measureBtn').textContent='เริ่มวัด'};
$('bgBtn').onclick=()=>{bgIndex=(bgIndex+1)%bgColors.length;scene.background=new THREE.Color(bgColors[bgIndex])};
$('screenshotBtn').onclick=()=>{if(cad2d.active){cad2d.capture();return;}renderer.render(scene,camera);const a=document.createElement('a');a.download='ITIDEAS-3D-'+Date.now()+'.png';a.href=renderer.domElement.toDataURL('image/png');a.click();showToast('สร้างภาพ PNG แล้ว')};


function exportFilename(file,suffix,extension){
 const base=(file?.name||'ITIDEAS-CAD').replace(/\.[^.]+$/,'').replace(/[<>:"/\\|?*\x00-\x1f]+/g,'_').slice(0,75);
 return base+'_'+suffix+'.'+extension;
}
function dataURLtoBytes(dataUrl){
 const str=atob(dataUrl.slice(dataUrl.indexOf(',')+1));
 const out=new Uint8Array(str.length);
 for(let i=0;i<str.length;i++)out[i]=str.charCodeAt(i);
 return out;
}
function downloadBytes(data,mime,name){
 const blob=data instanceof Blob?data:new Blob([data],{type:mime});
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download=name;link.style.display='none';
 document.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),45000);
}
function syncExportButtons(){
 const isDxf=cad2d.active&&!!cad2d.drawing;
 const isAi=cad2d.active&&!cad2d.drawing&&!!cad2d.aiCanvas;
 const canExport=isDxf||isAi||!!modelRoot;
 $('exportReviewPdfBtn').disabled=!canExport;
 $('exportPrintPdfBtn').disabled=!(isDxf||isAi);
 $('exportSvgBtn').disabled=!isDxf;
 $('exportPngBtn').disabled=!canExport;
 $('exportStlBtn').disabled=!modelRoot||mode2d;
 $('exportHint').textContent=isDxf
  ?'DXF: PDF 1:1 คงขนาดเส้นตามหน่วยในไฟล์, SVG เวกเตอร์; PNG เป็นภาพพรีวิวจำกัดความละเอียด · ตรวจเส้นโค้งและข้อความใน CAD ก่อนผลิต'
  :isAi?'AI: PDF 1:1 คัดลอกหน้าต้นฉบับแบบ PDF-compatible; PDF A4 เป็นภาพส่งตรวจ ส่วน PNG เป็นภาพพรีวิว'
  :modelRoot?'3D: ส่งออก STL สำหรับ Slicer, PDF A4 ส่งตรวจ และ PNG มุมมองปัจจุบัน · STL ไม่มีหน่วย ต้องตรวจสเกลก่อนพิมพ์ 3D'
  :'เปิดไฟล์ CAD ก่อนส่งออก · PDF 1:1 และ SVG ใช้ได้เมื่อมีข้อมูลแบบ 2D';
}
async function pngFromSvg(svg,model){
 const dims=choosePreviewPixels(model.bounds.width,model.bounds.height);
 const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));
 try{
  const img=new Image();img.src=url;
  await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('เรนเดอร์ SVG เป็น PNG ไม่สำเร็จ'));});
  const canvas=document.createElement('canvas');canvas.width=dims.width;canvas.height=dims.height;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('iPhone ไม่สามารถสร้างภาพขนาดนี้ได้');
  ctx.clearRect(0,0,dims.width,dims.height);ctx.drawImage(img,0,0,dims.width,dims.height);
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('เข้ารหัส PNG ไม่สำเร็จ')),'image/png'));
  return {blob,dims};
 }finally{URL.revokeObjectURL(url);}
}
async function exportFile(kind){
 const mode2d=cad2d.active, model=mode2d?cad2d.drawing:null;
 const file=mode2d?cad2d.originalFile:last3DFile;
 if(!file){showToast('เปิดไฟล์ CAD ก่อนส่งออก');return;}
 const visible=mode2d?cad2d.visibleLayers:new Set();
 $('fileError').classList.add('hidden');
 setLoading(true,'กำลังส่งออกไฟล์…','ตรวจขนาดและสร้างเอกสาร');
 try{
  if(kind==='stl'){
   if(!modelRoot||mode2d)throw Error('STL สำหรับพิมพ์ 3D ต้องเปิดโมเดล 3D ก่อน');
   modelRoot.updateMatrixWorld(true);
   const data=new STLExporter().parse(modelRoot,{binary:true});
   downloadBytes(data,'model/stl',exportFilename(file,'3D_PRINT','stl'));
   $('exportHint').textContent='STL ไม่มีข้อมูลหน่วย: เปิดใน Slicer เพื่อตรวจ X/Y/Z, ความหนาผนังและ Scale ก่อนพิมพ์จริง';
  }else if(kind==='svg'){
   if(!model)throw Error('SVG เวกเตอร์รองรับไฟล์ DXF เท่านั้น');
   downloadBytes(exportSvg(model,visible),'image/svg+xml',exportFilename(file,'VECTOR','svg'));
  }else if(kind==='print'){
   if(model){
    downloadBytes(exportPrintPdf(model,visible),'application/pdf',exportFilename(file,'PRINT_1to1','pdf'));
   }else if(mode2d && cad2d.aiCanvas){
    downloadBytes(new Blob([await file.arrayBuffer()],{type:'application/pdf'}),'application/pdf',exportFilename(file,'ORIGINAL_ARTBOARD','pdf'));
   }else throw Error('PDF ขนาดจริงรองรับเฉพาะ DXF หรือ AI แบบ PDF-compatible');
  }else if(kind==='review'){
   if(model){
    downloadBytes(exportReviewPdf(model,visible,{fileName:file.name}),'application/pdf',exportFilename(file,'REVIEW_A4','pdf'));
   }else{
    const canvas=mode2d?cad2d.aiCanvas:renderer.domElement;
    if(!canvas)throw Error('ไม่มีภาพสำหรับส่งตรวจ');
    if(!mode2d)renderer.render(scene,camera);
    const jpeg=dataURLtoBytes(canvas.toDataURL('image/jpeg',.88));
    const details=mode2d?'AI artboard preview':('3D '+$('dimX').textContent+' / '+$('dimY').textContent+' / '+$('dimZ').textContent);
    downloadBytes(exportJpegReviewPdf(jpeg,canvas.width,canvas.height,{fileName:file.name,details}),'application/pdf',exportFilename(file,'REVIEW_A4','pdf'));
   }
  }else if(kind==='png'){
   if(model){
    const result=await pngFromSvg(exportSvg(model,visible),model);
    downloadBytes(result.blob,'image/png',exportFilename(file,'PREVIEW','png'));
    if(model.unit?.factor){
     const dpi=25.4*result.dims.width/(model.bounds.width*model.unit.factor);
     $('exportHint').textContent='PNG '+result.dims.width+' × '+result.dims.height+' px (ประมาณ '+dpi.toFixed(0)+' DPI ที่ขนาดจริง) · สำหรับพรีวิว หากต้องการเส้นคมที่ขนาดจริง ใช้ PDF 1:1';
    }
   }else{
    const canvas=mode2d?cad2d.aiCanvas:renderer.domElement;
    if(!canvas)throw Error('ไม่มีภาพสำหรับส่งออก');
    if(!mode2d)renderer.render(scene,camera);
    const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('สร้างภาพ PNG ไม่สำเร็จ')),'image/png'));
    downloadBytes(blob,'image/png',exportFilename(file,'PREVIEW','png'));
   }
  }else throw Error('ไม่รองรับรูปแบบส่งออก');
  if(kind!=='png'||!model)$('exportHint').textContent='สร้างไฟล์ '+kind.toUpperCase()+' แล้ว · หาก Safari เปิดไฟล์ขึ้นมา ให้ใช้ Share → Save to Files';
  showToast('สร้างไฟล์ส่งออกแล้ว');
 }catch(e){
  console.error(e);showFileError(file,e);
 }finally{setLoading(false);}
}
$('exportReviewPdfBtn').onclick=()=>exportFile('review');
$('exportPrintPdfBtn').onclick=()=>exportFile('print');
$('exportSvgBtn').onclick=()=>exportFile('svg');
$('exportPngBtn').onclick=()=>exportFile('png');
$('exportStlBtn').onclick=()=>exportFile('stl');
syncExportButtons();

document.querySelectorAll('.tabs button').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b===btn));document.querySelectorAll('.tabpane').forEach(p=>p.classList.toggle('active',p.dataset.pane===btn.dataset.tab));document.body.classList.toggle('inspection-nesting',btn.dataset.tab==='nesting');});
const modal=$('installModal');const showInstall=()=>modal.classList.remove('hidden');$('installBtn').onclick=showInstall;$('helpInstallBtn').onclick=showInstall;$('closeInstall').onclick=()=>modal.classList.add('hidden');$('closeInstall2').onclick=()=>modal.classList.add('hidden');modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.add('hidden')});

window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>{e.preventDefault();const f=e.dataTransfer?.files?.[0];if(f)loadFile(f)});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera)}animate();
