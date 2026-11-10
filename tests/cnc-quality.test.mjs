import test from 'node:test';
import assert from 'node:assert/strict';
import {drawingFromDxf} from '../cad-geometry.js';
import {preflightDxf,offsetToolpathPreview,packPolygonAware,polygonIntersectionArea} from '../src/cnc-quality.src.js';
const makeModel=entities=>drawingFromDxf({header:{$INSUNITS:4},entities});

test('open cutting geometry blocks CAM readiness',()=>{
 const m=makeModel([{type:'LINE',layer:'CUT',vertices:[{x:0,y:0},{x:100,y:0}]}]);
 const q=preflightDxf(m,new Set(['CUT']),{toolDiameter:3});
 assert.equal(q.passed,false);assert.ok(q.errors.some(x=>x.code==='OPEN_CONTOUR'));
});
test('duplicate closed contours with opposite winding are detected',()=>{
 const r=[{x:0,y:0},{x:60,y:0},{x:60,y:30},{x:0,y:30}];
 const m=makeModel([{type:'LWPOLYLINE',layer:'CUT',shape:true,vertices:r},{type:'LWPOLYLINE',layer:'CUT',shape:true,vertices:[...r].reverse()}]);
 assert.ok(preflightDxf(m,new Set(['CUT'])).errors.some(x=>x.code==='DUPLICATE_CONTOUR'));
});
test('bow-tie contour is marked as self intersecting',()=>{
 const m=makeModel([{type:'LWPOLYLINE',layer:'CUT',shape:true,vertices:[{x:0,y:0},{x:100,y:100},{x:0,y:100},{x:100,y:0}]}]);
 assert.ok(preflightDxf(m,new Set(['CUT'])).errors.some(x=>x.code==='SELF_INTERSECTION'));
});
test('tool compensation outside increases physical geometry bounds',()=>{
 const pts=[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}];
 const o=offsetToolpathPreview(pts,6,'outside');assert.ok(Math.min(...o[0].map(p=>p.x))<-2.9);
 const inside=offsetToolpathPreview(pts,6,'inside');assert.ok(Math.min(...inside[0].map(p=>p.x))>2.9);
});
test('polygon-aware pack fits complementary triangular contours sharing a bounding box',()=>{
 const a={id:'A',label:'A',width:100,height:100,cutLengthMm:340,contours:[{isHole:false,layer:'CUT',points:[{x:0,y:0},{x:100,y:0},{x:0,y:100}]}]};
 const b={id:'B',label:'B',width:100,height:100,cutLengthMm:340,contours:[{isHole:false,layer:'CUT',points:[{x:100,y:0},{x:100,y:100},{x:0,y:100}]}]};
 assert.equal(polygonIntersectionArea(a.contours[0].points,b.contours[0].points),0);
 const result=packPolygonAware([a,b],{width:100,height:100,margin:0,gap:0,kerf:0,quantity:1,allowRotate:false});
 assert.equal(result.sheetCount,1);assert.equal(result.placements.length,2);assert.equal(result.algorithm,'polygon-aware');
});
