import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync('index.html','utf8');
const ui=readFileSync('nesting-ui.js','utf8');
const app=readFileSync('app.js','utf8');
const build=readFileSync('scripts/build.mjs','utf8');

test('Nesting has a two-dimensional inspection tab and sheet/quote controls',()=>{
  assert.match(html,/data-tab="nesting"/);
  assert.match(html,/data-pane="nesting"/);
  for(const id of ['nestSheetW','nestSheetH','nestSheetPrice','nestGap','nestKerf','nestQuantity','nestCutRate','nestMarginPct','nestRunBtn','nestDemoBtn','nestExportSvgBtn','nestExportPdfBtn','nestExportCsvBtn','nestPreview','nestResults']) assert.ok(html.includes('id="'+id+'"'),id);
});
test('Nesting UI uses DXF model geometry or clearly-marked ABC example and exports inspection',()=>{
  assert.match(ui,/extractCutParts/);assert.match(ui,/packParts/);
  assert.match(ui,/estimateCncQuote/);assert.match(ui,/sampleABC/);
  assert.match(ui,/exportNestingSvg/);assert.match(ui,/exportJpegReviewPdf/);
  assert.match(ui,/NOT FOR CNC/);
  assert.match(ui,/saveFile/);assert.match(ui,/exportCutListCsv/);
});
test('3D loader accepts OBJ PLY GLB with standard Three.js loaders while preserving STL/3MF/STEP',()=>{
  for(const module of ['OBJLoader','PLYLoader','GLTFLoader','STLLoader','ThreeMFLoader'])assert.match(app,new RegExp(module));
  for(const extension of ["'obj'","'ply'","'glb'","'gltf'","'3mf'","'step'","'stl'"])assert.ok(app.includes(extension),extension);
  assert.match(html,/OBJ/);assert.match(html,/GLB/);assert.match(html,/PLY/);
});
test('Static build and service worker cache newly introduced Nesting modules',()=>{
  assert.match(build,/nesting-engine\.js/);assert.match(build,/nesting-ui\.js/);
  assert.match(build,/cad-export\.js/);
});

test('public market benchmark is distinctly labeled as one listing, not a market mean',()=>{
 const html=readFileSync('index.html','utf8');
 const src=readFileSync('nesting-ui.js','utf8');
 assert.match(html,/id="nestMarketText"/);
 assert.match(html,/ไม่ใช่ค่าเฉลี่ยตลาด/);
 assert.match(src,/320\*nest\.placements\.length/);
});
