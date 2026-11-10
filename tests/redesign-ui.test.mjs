import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const html=readFileSync("index.html","utf8");
const js=readFileSync("cad2d.js","utf8");
const app=readFileSync("app.js","utf8");
const css=readFileSync("style.css","utf8");

test("DXF layer controls live in inspector tab rather than blocking the CAD drawing",()=>{
  assert.match(html, /data-tab="layers"/);
  assert.match(html, /data-pane="layers"/);
  assert.match(html, /id="cadLayerList"/);
  assert.doesNotMatch(js, /cad2d-layer-panel/);
  assert.match(js, /querySelector\('\[data-tab="layers"\]'\)/);
  assert.match(js, /cadLayerList/);
});
test("two-dimensional inspection names entity counts correctly without changing 3D triangle counts",()=>{
  assert.match(html,/id="geometryCountLabel"/);
  assert.match(js,/geometryCountLabel/);
  assert.match(js,/Entities/);
  assert.match(js,/Pages/);
  assert.match(app,/Triangles/);
});
test("focus mode can hide inspector and be exited using a keyboard-accessible button",()=>{
  assert.match(js,/data-cad="focus"/);
  assert.match(js,/inspection-focus/);
  assert.match(js,/aria-pressed/);
  assert.match(css,/\.inspection-focus\s+main/);
  assert.match(css,/\.inspection-focus\s+\.tabs/);
});
test("DXF layers default to non-obscuring panel and do not open automatically",()=>{
  assert.doesNotMatch(js,/layerPanel\.classList\.remove\('hidden'\)/);
  assert.match(css,/\.cad-layer-row/);
  assert.match(html,/id="cadLayerSummary"/);
});

test("export buttons are connected to a runtime export handler",()=>{
 assert.match(html,/id="exportReviewPdfBtn"/);
 assert.match(html,/id="exportPrintPdfBtn"/);
 assert.match(html,/id="exportSvgBtn"/);
 assert.match(html,/id="exportPngBtn"/);
 assert.match(app,/exportFile\('review'\)/);
 assert.match(app,/exportFile\('print'\)/);
 assert.match(app,/exportFile\('svg'\)/);
 assert.match(app,/exportFile\('png'\)/);
});

test("3D print export uses three.js STLExporter and warns about unitless STL",()=>{
 assert.match(html,/id="exportStlBtn"/);
 assert.match(app,/STLExporter/);
 assert.match(app,/exportFile\('stl'\)/);
 assert.match(app,/STL ไม่มีข้อมูลหน่วย/);
});
