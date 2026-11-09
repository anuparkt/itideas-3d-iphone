import test from 'node:test';
import assert from 'node:assert/strict';
import {drawingFromDxf,dxfUnit,isPdfCompatibleAI} from '../cad-geometry.js';

test('DXF unit conversion is explicit and unknown units are not assumed mm',()=>{
 assert.equal(dxfUnit(4).factor,1);
 assert.equal(dxfUnit(1).factor,25.4);
 assert.equal(dxfUnit(0).factor,null);
});
test('closed polyline and circle produce geometry and layers',()=>{
 const doc={header:{$INSUNITS:4},entities:[
  {type:'LWPOLYLINE',layer:'CUT',shape:true,vertices:[{x:0,y:0},{x:100,y:0},{x:100,y:50},{x:0,y:50}]},
  {type:'CIRCLE',layer:'DRILL',center:{x:50,y:25},radius:10}
 ]};
 const d=drawingFromDxf(doc);
 assert.equal(d.paths.length,2);
 assert.equal(d.bounds.width,100);assert.equal(d.bounds.height,50);
 assert.equal(d.unit.factor,1);
 assert.deepEqual(d.layers.map(x=>x.name),['CUT','DRILL']);
});
test('arc bulge gets positive sampled extent',()=>{
 const d=drawingFromDxf({entities:[{type:'LWPOLYLINE',vertices:[{x:0,y:0,bulge:1},{x:20,y:0}]}]});
 assert.ok(d.bounds.height>9.9 && d.bounds.height<10.1);
});
test('AI compatibility detected via embedded PDF header',()=>{
 assert.equal(isPdfCompatibleAI(new TextEncoder().encode('%PDF-1.7 data')),true);
 assert.equal(isPdfCompatibleAI(new TextEncoder().encode('%!PS-Adobe-3.0')),false);
});
