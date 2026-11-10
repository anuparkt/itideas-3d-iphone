import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Exercise the actual browser function in isolation. This catches free variables
// that node --check and build-time minification do not diagnose.
const app=readFileSync('app.js','utf8');
const first=app.indexOf('function syncExportButtons(){');
const last=app.indexOf('\nasync function pngFromSvg',first);
assert.ok(first>=0&&last>first,'Must find export state handler');
const handler=app.slice(first,last);
function invokeState({active=false,drawing=null,aiCanvas=null,modelRoot=null}={}){
 const elements=Object.fromEntries(['exportReviewPdfBtn','exportPrintPdfBtn','exportSvgBtn','exportPngBtn','exportStlBtn','exportHint']
  .map(id=>[id,{disabled:true,textContent:''}]));
 const context={$:id=>{assert.ok(elements[id],id);return elements[id];},
  cad2d:{active,drawing,aiCanvas},modelRoot};
 vm.runInNewContext(handler+'\nsyncExportButtons();',context,{timeout:1000});
 return elements;
}
test('opening a 3MF 3D model updates export state without a ReferenceError',()=>{
 const e=invokeState({modelRoot:{children:[{}]},active:false});
 assert.equal(e.exportStlBtn.disabled,false);
 assert.equal(e.exportReviewPdfBtn.disabled,false);
 assert.equal(e.exportSvgBtn.disabled,true);
 assert.match(e.exportHint.textContent,/3D/);
});
test('opening DXF disables STL but enables vector/PDF export',()=>{
 const e=invokeState({active:true,drawing:{paths:[]},modelRoot:null});
 assert.equal(e.exportStlBtn.disabled,true);
 assert.equal(e.exportSvgBtn.disabled,false);
 assert.equal(e.exportPrintPdfBtn.disabled,false);
});
test('before a file is opened, export actions remain disabled and do not throw',()=>{
 const e=invokeState();
 for(const id of ['exportStlBtn','exportSvgBtn','exportPrintPdfBtn','exportReviewPdfBtn','exportPngBtn'])assert.equal(e[id].disabled,true,id);
});
