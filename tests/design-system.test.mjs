import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync('index.html','utf8'),js=readFileSync('nesting-ui.js','utf8'),css=readFileSync('design.css','utf8');
test('inspection, polygon-aware mode and tool preview exist',()=>{
 for(const id of ['nestAlgorithm','nestPreflight','nestPreflightSummary','nestOffsetPreviewBtn','nestSafetyStatus'])assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(js,/packPolygonAware/);assert.match(js,/preflightDxf/);assert.match(js,/offsetToolpathPreview/);
});
test('responsive design uses 44px touch targets and respects reduced motion',()=>{
 assert.match(css,/@media\s*\(min-width:\s*768px\)/);assert.match(css,/min-height:\s*44px/);
 assert.match(css,/@media\s*\(prefers-reduced-motion:\s*reduce\)/);assert.match(css,/--ui-accent/);
});
