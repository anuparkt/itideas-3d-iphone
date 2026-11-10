import test from 'node:test';
import assert from 'node:assert/strict';
import {drawingFromDxf} from '../cad-geometry.js';
import {extractCutParts,packParts,estimateCncQuote,sampleABC,exportNestingSvg} from '../nesting-engine.js';

test('extract closed parts from DXF, keep inner holes grouped and ignore open contour',()=>{
 const model=drawingFromDxf({header:{$INSUNITS:4},entities:[
 {type:'LWPOLYLINE',layer:'CUT_OUTER',shape:true,vertices:[{x:0,y:0},{x:150,y:0},{x:150,y:120},{x:0,y:120}]},
 {type:'CIRCLE',layer:'CUT_INNER',center:{x:70,y:60},radius:15},
 {type:'LINE',layer:'SAW_GUIDE',vertices:[{x:0,y:150},{x:250,y:150}]}
 ]});
 const result=extractCutParts(model,new Set(['CUT_OUTER','CUT_INNER','SAW_GUIDE']));
 assert.equal(result.parts.length,1);
 assert.equal(result.parts[0].contours.length,2);
 assert.ok(result.parts[0].cutLengthMm>2*(150+120));
 assert.ok(result.warnings.some(x=>x.includes('เส้นเปิด')));
});
test('nesting is deterministic, bounds-safe with spacing and multiple pieces',()=>{
 const {parts}=sampleABC();
 const options={width:1220,height:1220,margin:15,gap:12,kerf:3,quantity:2,allowRotate:true};
 const a=packParts(parts,options),b=packParts(parts,options);
 assert.deepEqual(a.placements,b.placements);
 assert.equal(a.placements.length,6);
 for(const item of a.placements){
   assert.ok(item.x>=options.margin);
   assert.ok(item.y>=options.margin);
   assert.ok(item.x+item.width<=options.width-options.margin+0.0001);
   assert.ok(item.y+item.height<=options.height-options.margin+0.0001);
 }
 for(const i of a.placements)for(const j of a.placements){
   if(i===j||i.sheetIndex!==j.sheetIndex)continue;
   const overlapX=i.x<j.x+j.width+options.gap&&j.x<i.x+i.width+options.gap;
   const overlapY=i.y<j.y+j.height+options.gap&&j.y<i.y+i.height+options.gap;
   assert.ok(!(overlapX&&overlapY),'No overlap or inadequate spacing permitted');
 }
});
test('ABC three characters fit a 1220x1220 half-sheet as a rough BBox quote',()=>{
 const {parts}=sampleABC();
 const n=packParts(parts,{width:1220,height:1220,margin:15,gap:12,kerf:3,quantity:1,allowRotate:true});
 assert.equal(n.sheetCount,1);
 assert.equal(n.cutLengthMm,7200);
 assert.equal(n.isEstimate,true);
});
test('reject oversized single part and unknown input units for real CAD nesting',()=>{
 assert.throws(()=>packParts([{id:'a',width:800,height:500,cutLengthMm:1000,contours:[]}],{width:600,height:600,margin:10,gap:10,kerf:3,quantity:1}),/ไม่พอ/);
 const model=drawingFromDxf({entities:[{type:'LWPOLYLINE',shape:true,vertices:[{x:0,y:0},{x:50,y:0},{x:50,y:50},{x:0,y:50}]}]});
 assert.throws(()=>extractCutParts(model,new Set(['0'])),/หน่วย/);
});
test('costing separates CNC expense, material and profit margin',()=>{
 const layout=packParts(sampleABC().parts,{width:1220,height:1220,margin:15,gap:12,kerf:3,quantity:1});
 const q=estimateCncQuote(layout,{sheetPrice:388,cutRatePerM:35,setup:150,tool:80,finishing:120,profitMargin:35,vat:0});
 assert.equal(q.cutLengthM,7.2);
 assert.equal(q.cutCost,482);
 assert.equal(q.materialCost,388);
 assert.equal(q.totalCost,990);
 assert.equal(Math.round(q.salePrice),1523);
 assert.equal(q.cutOnlySalePrice.toFixed(2),'741.54');
});
test('SVG nest document includes sheet size and sample is clearly marked NOT FOR CNC',()=>{
 const n=packParts(sampleABC().parts,{width:1220,height:1220,margin:15,gap:12,kerf:3,quantity:1});
 const svg=exportNestingSvg(n,0);
 assert.match(svg,/width="1220mm"/);
 assert.match(svg,/height="1220mm"/);
 assert.match(svg,/NOT FOR CNC/);
 assert.match(svg,/A/);
});
