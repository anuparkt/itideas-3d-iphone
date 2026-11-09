import test from 'node:test';
import assert from 'node:assert/strict';
import {drawingFromDxf,dxfUnit,isPdfCompatibleAI} from '../cad-geometry.js';
import DxfParser from 'dxf-parser';

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


test('real ASCII DXF parser creates inspection geometry with correct units and layers',()=>{
 const sample=[
  '0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC',
  '0','SECTION','2','ENTITIES',
  '0','LWPOLYLINE','8','CUT','90','4','70','1',
  '10','0','20','0','10','100','20','0','10','100','20','50','10','0','20','50',
  '0','CIRCLE','8','HOLES','10','50','20','25','40','10',
  '0','ENDSEC','0','EOF'
 ].join('\n');
 const parsed=new DxfParser().parseSync(sample);
 const model=drawingFromDxf(parsed);
 assert.equal(model.entityCount,2);
 assert.equal(model.paths.length,2);
 assert.equal(model.unit.factor,1);
 assert.equal(model.bounds.width,100);
 assert.equal(model.bounds.height,50);
 assert.deepEqual(model.layers.map(x=>x.name),['CUT','HOLES']);
});
