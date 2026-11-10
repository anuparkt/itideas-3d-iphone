import test from 'node:test';
import assert from 'node:assert/strict';
import {drawingFromDxf} from '../cad-geometry.js';
import {exportSvg,exportPrintPdf,exportReviewPdf,exportJpegReviewPdf,choosePreviewPixels} from '../cad-export.js';

const model=drawingFromDxf({header:{$INSUNITS:4},entities:[
 {type:'LWPOLYLINE',layer:'CUT',shape:true,vertices:[{x:0,y:0},{x:100,y:0},{x:100,y:50},{x:0,y:50}]},
 {type:'CIRCLE',layer:'HOLE',center:{x:50,y:25},radius:10}
]});
const decode=bytes=>new TextDecoder('latin1').decode(bytes);

test('SVG exports exact millimeter size, viewBox and selected layers only',()=>{
 const svg=exportSvg(model,new Set(['CUT']));
 assert.match(svg,/width="100mm"/);
 assert.match(svg,/height="50mm"/);
 assert.match(svg,/viewBox="0 -50 100 50"/);
 assert.match(svg,/data-layer="CUT"/);
 assert.doesNotMatch(svg,/data-layer="HOLE"/);
});
test('full scale vector PDF reports correct media dimensions and vector strokes',()=>{
 const bytes=exportPrintPdf(model,new Set(['CUT','HOLE']));
 const pdf=decode(bytes);
 assert.ok(pdf.startsWith('%PDF-1.'));
 assert.match(pdf,/\/MediaBox \[0 0 [0-9.]+ [0-9.]+\]/);
 assert.match(pdf,/\sm\s/);
 assert.match(pdf,/\sl\s/);
 assert.match(pdf,/\/Producer \(ITIDEAS CAD Viewer\)/);
});
test('full scale print export rejects CAD drawings with unknown units',()=>{
 const unknown=drawingFromDxf({entities:[{type:'LINE',layer:'0',vertices:[{x:0,y:0},{x:30,y:25}]}]});
 assert.throws(()=>exportPrintPdf(unknown,new Set(['0'])),/หน่วย/);
});
test('review PDF is A4 and clearly marked as review, not for production',()=>{
 const pdf=decode(exportReviewPdf(model,new Set(['CUT']),{fileName:'sample.dxf'}));
 assert.match(pdf,/INSPECTION REVIEW/);
 assert.match(pdf,/NOT FOR PRODUCTION/);
 assert.match(pdf,/A4/);
 assert.match(pdf,/sample.dxf/);
});
test('3D JPEG review generates A4 PDF with embedded raster preview',()=>{
 const jpeg=Uint8Array.from([0xff,0xd8,0xff,0xd9]);
 const pdf=decode(exportJpegReviewPdf(jpeg,640,480,{fileName:'part.stl',details:'STL 100 x 50 x 25 mm'}));
 assert.match(pdf,/\/DCTDecode/);
 assert.match(pdf,/\/Subtype \/Image/);
 assert.match(pdf,/INSPECTION REVIEW/);
 assert.ok(pdf.startsWith('%PDF-1.'));
});
test('PNG preview size is capped for mobile memory safety',()=>{
 const pixels=choosePreviewPixels(1220,1220);
 assert.ok(pixels.width*pixels.height<=10_000_000);
 assert.ok(pixels.width<=4096 && pixels.height<=4096);
 assert.ok(pixels.width>=1000);
});

test('DXF TEXT labels on visible layers remain in SVG and PDF review',()=>{
 const labeled=drawingFromDxf({header:{$INSUNITS:4},entities:[
  {type:'LINE',layer:'CUT',vertices:[{x:0,y:0},{x:100,y:50}]},
  {type:'TEXT',layer:'MARKING',startPoint:{x:10,y:20},height:3,text:'P01'}
 ]});
 const svg=exportSvg(labeled,new Set(['CUT','MARKING']));
 assert.match(svg,/>P01<\/text>/);
 const pdf=new TextDecoder('latin1').decode(exportReviewPdf(labeled,new Set(['CUT','MARKING']),{fileName:'parts.dxf'}));
 assert.match(pdf,/P01/);
});
