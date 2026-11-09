import test from 'node:test';
import assert from 'node:assert/strict';
import {drawingFromDxf,dxfUnit,isPdfCompatibleAI,decodeDxfBytes} from '../cad-geometry.js';
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


test('DXF INSERT expands drawing geometry from a referenced BLOCK with scale and rotation',()=>{
 const doc={header:{$INSUNITS:4},
  blocks:{PANEL:{name:'PANEL',position:{x:0,y:0},entities:[
   {type:'LWPOLYLINE',layer:'0',shape:true,vertices:[{x:0,y:0},{x:100,y:0},{x:100,y:50},{x:0,y:50}]}
  ]}},
  entities:[{type:'INSERT',layer:'SIGN',name:'PANEL',position:{x:200,y:100},xScale:2,yScale:1,rotation:90}]
 };
 const d=drawingFromDxf(doc);
 assert.equal(d.paths.length,1);
 assert.ok(d.bounds.width>49.9&&d.bounds.width<50.1);
 assert.ok(d.bounds.height>199.9&&d.bounds.height<200.1);
 assert.ok(d.layers.some(x=>x.name==='SIGN'));
});

test('DXF SPLINE-only drawing displays sampled geometry without crashing',()=>{
 const model=drawingFromDxf({header:{$INSUNITS:4},entities:[{type:'SPLINE',layer:'CURVES',
    degreeOfSplineCurve:2,controlPoints:[{x:0,y:0},{x:50,y:100},{x:100,y:0}],
    knotValues:[0,0,0,1,1,1]}]});
 assert.equal(model.paths.length,1);
 assert.ok(model.bounds.width>99.9);
 assert.ok(model.bounds.height>40);
});


test('decodes UTF-8 BOM DXF before parsing',()=>{
 const input=new Uint8Array([239,187,191,...new TextEncoder().encode('0\nEOF\n')]);
 assert.equal(decodeDxfBytes(input),'0\nEOF\n');
});
test('gives clear error for Binary DXF',()=>{
 assert.throws(()=>decodeDxfBytes(new TextEncoder().encode('AutoCAD Binary DXF\r\n')),/Binary DXF/);
});
