import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { ThreeMFLoader } from 'three/addons/loaders/3MFLoader.js';

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

let modelRoot=null, edgesGroup=null, bounds=null, measureMode=false, measurePts=[], measureObjects=[];
const raycaster=new THREE.Raycaster(), pointer=new THREE.Vector2();
const bgColors=[0x0b1220,0x171717,0x243041,0xf3f4f6]; let bgIndex=0;

function showToast(msg,ms=2200){const t=$('toast');t.textContent=msg;t.classList.remove('hidden');clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>t.classList.add('hidden'),ms)}
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

function fitView(view='iso'){if(!bounds||!modelRoot)return;bounds.setFromObject(modelRoot);const size=bounds.getSize(new THREE.Vector3()), center=bounds.getCenter(new THREE.Vector3()), max=Math.max(size.x,size.y,size.z)||10;controls.target.copy(center);let dir=new THREE.Vector3(1,1,1);if(view==='front')dir.set(0,0,1);if(view==='back')dir.set(0,0,-1);if(view==='right')dir.set(1,0,0);if(view==='left')dir.set(-1,0,0);if(view==='top')dir.set(0,1,0);if(view==='bottom')dir.set(0,-1,0);const dist=max*2.3;camera.position.copy(center).add(dir.normalize().multiplyScalar(dist));camera.near=Math.max(max/10000,.001);camera.far=max*1000;camera.updateProjectionMatrix();if(camera.isOrthographicCamera){const r=viewer.clientWidth/Math.max(viewer.clientHeight,1);camera.left=-max*.75*r;camera.right=max*.75*r;camera.top=max*.75;camera.bottom=-max*.75;camera.updateProjectionMatrix()}controls.update();document.querySelectorAll('.view-pills [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view))}

function calcStats(root){let meshes=0,tris=0;root.traverse(o=>{if(o.isMesh&&o.geometry){meshes++;const g=o.geometry;tris+=g.index?g.index.count/3:(g.attributes.position?.count||0)/3}});return{meshes,triangles:Math.round(tris)}}
function updateInfo(file,format,root){bounds=new THREE.Box3().setFromObject(root);const s=bounds.getSize(new THREE.Vector3()), st=calcStats(root);$('fileName').textContent=file.name;$('fileSize').textContent=fmtBytes(file.size);$('formatBadge').textContent=format.toUpperCase();$('dimX').textContent=fmt(s.x);$('dimY').textContent=fmt(s.y);$('dimZ').textContent=fmt(s.z);$('triCount').textContent=st.triangles.toLocaleString();$('hudName').textContent=file.name;$('hudDims').textContent=`X ${s.x.toFixed(2)} · Y ${s.y.toFixed(2)} · Z ${s.z.toFixed(2)} mm`;emptyState.classList.add('hidden')}

async function readSTEP(file,buffer){setLoading(true,'กำลังเปิด STEP…','กำลังโหลด CAD engine ครั้งแรกอาจใช้เวลาสักครู่');const base='https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/';if(!window.occtimportjs){await new Promise((res,rej)=>{const s=document.createElement('script');s.src=base+'occt-import-js.js';s.onload=res;s.onerror=()=>rej(new Error('โหลด STEP engine ไม่สำเร็จ'));document.head.appendChild(s)})}const occt=await window.occtimportjs({locateFile:path=>base+path});const result=occt.ReadStepFile(new Uint8Array(buffer),null);if(!result||!result.meshes||!result.meshes.length)throw new Error('ไม่พบ mesh ในเฟล์ STEP');const group=new THREE.Group();for(const m of result.meshes){const g=new THREE.BufferGeometry();const p=m.attributes?.position?.array;if(!p)continue;g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));const n=m.attributes?.normal?.array;if(n)g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));else g.computeVertexNormals();if(m.index?.array)g.setIndex(Array.from(m.index.array));g.computeBoundingSphere();const mat=standardMaterial();group.add(new THREE.Mesh(g,mat))}return group}

async function loadFile(file){const ext=file.name.split('.').pop().toLowerCase();if(!['stl','3mf','step','stp'].includes(ext)){showToast('รองรับ STL, 3MF, STEP และ STP');return}setLoading(true);disposeModel();try{const buffer=await file.arrayBuffer();let root;if(ext==='stl'){const g=new STLLoader().parse(buffer);g.computeVertexNormals();root=new THREE.Group();root.add(new THREE.Mesh(g,standardMaterial()))}else if(ext==='3mf'){root=new ThreeMFLoader().parse(buffer);normalizeMaterials(root)}else{root=await readSTEP(file,buffer)}modelRoot=root;scene.add(modelRoot);centerOnOrigin(modelRoot);modelRoot.updateMatrixWorld(true);createEdges();setRenderMode();updateInfo(file,ext,modelRoot);fitView('iso');showToast('เปิดไฟล์เรียบร้อย')}catch(e){console.error(e);disposeModel();emptyState.classList.remove('hidden');showToast('เปิดไฟล์ไม่สำเร็จ: '+(e.message||'Unknown error'),4200)}finally{setLoading(false)}}

function clearMeasure(){measurePts=[];measureObjects.forEach(o=>{scene.remove(o);o.geometry&&o.geometry.dispose();o.material&&o.material.dispose()});measureObjects=[];$('measureReadout').textContent='ระยะ: —'}
function addMarker(p){const g=new THREE.SphereGeometry(Math.max((bounds?.getSize(new THREE.Vector3()).length()||100)*.006,.5),16,10);const m=new THREE.MeshBasicMaterial({color:0x67e8f9});const s=new THREE.Mesh(g,m);s.position.copy(p);scene.add(s);measureObjects.push(s)}
function drawMeasure(){if(measurePts.length!==2)return;const g=new THREE.BufferGeometry().setFromPoints(measurePts);const l=new THREE.Line(g,new THREE.LineBasicMaterial({color:0x67e8f9,depthTest:false}));scene.add(l);measureObjects.push(l);const d=measurePts[0].distanceTo(measurePts[1]);$('measureReadout').textContent=`ระยะ: ${d.toFixed(2)} mm`;measureMode=false;$('measureBtn').textContent='เริ่มวัด';showToast(`ระยะ ${d.toFixed(2)} mm`)}
let downPt=null;renderer.domElement.addEventListener('pointerdown',e=>{downPt={x:e.clientX,y:e.clientY}});renderer.domElement.addEventListener('pointerup',e=>{if(!measureMode||!modelRoot||!downPt)return;if(Math.hypot(e.clientX-downPt.x,e.clientY-downPt.y)>8)return;const r=renderer.domElement.getBoundingClientRect();pointer.x=((e.clientX-r.left)/r.width)*2-1;pointer.y=-((e.clientY-r.top)/r.height)*2+1;raycaster.setFromCamera(pointer,camera);const meshes=[];modelRoot.traverse(o=>{if(o.isMesh)meshes.push(o)});const hit=raycaster.intersectObjects(meshes,true)[0];if(hit){measurePts.push(hit.point.clone());addMarker(hit.point);if(measurePts.length===2)drawMeasure()}});

$('openBtn').onclick=()=>$('fileInput').click();$('fileInput').onchange=e=>{const f=e.target.files?.[0];if(f)loadFile(f);e.target.value=''};
document.querySelectorAll('.view-pills [data-view]').forEach(b=>b.onclick=()=>fitView(b.dataset.view));$('fitBtn').onclick=()=>fitView('iso');$('resetBtn').onclick=()=>fitView('iso');
$('renderMode').onchange=setRenderMode;$('opacity').oninput=setRenderMode;$('gridToggle').onchange=e=>grid.visible=e.target.checked;$('axesToggle').onchange=e=>axes.visible=e.target.checked;$('autoRotate').onchange=e=>controls.autoRotate=e.target.checked;
$('cameraMode').onchange=e=>{const old=camera,newCam=e.target.value==='orthographic'?ortho:persp;newCam.position.copy(old.position);camera=newCam;controls.object=camera;resize();fitView('iso')};
$('measureBtn').onclick=()=>{if(!modelRoot){showToast('เปิดไฟล์ก่อน');return}clearMeasure();measureMode=true;$('measureBtn').textContent='แตะจุดที่ 1 และ 2';showToast('แตะผิวโมเดล 2 จุด')};$('clearMeasureBtn').onclick=()=>{clearMeasure();measureMode=false;$('measureBtn').textContent='เริ่มวัด'};
$('bgBtn').onclick=()=>{bgIndex=(bgIndex+1)%bgColors.length;scene.background=new THREE.Color(bgColors[bgIndex])};
$('screenshotBtn').onclick=()=>{renderer.render(scene,camera);const a=document.createElement('a');a.download='ITIDEAS-3D-'+Date.now()+'.png';a.href=renderer.domElement.toDataURL('image/png');a.click();showToast('สร้างภาพ PNG แล้ว')};

document.querySelectorAll('.tabs button').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('active',b===btn));document.querySelectorAll('.tabpane').forEach(p=>p.classList.toggle('active',p.dataset.pane===btn.dataset.tab))});
const modal=$('installModal');const showInstall=()=>modal.classList.remove('hidden');$('installBtn').onclick=showInstall;$('helpInstallBtn').onclick=showInstall;$('closeInstall').onclick=()=>modal.classList.add('hidden');$('closeInstall2').onclick=()=>modal.classList.add('hidden');modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.add('hidden')});

window.addEventListener('dragover',e=>e.preventDefault());window.addEventListener('drop',e=>{e.preventDefault();const f=e.dataTransfer?.files?.[0];if(f)loadFile(f)});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera)}animate();
