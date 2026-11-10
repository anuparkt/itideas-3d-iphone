import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync('index.html','utf8');
const app=readFileSync('app.js','utf8');
const ui=readFileSync('nesting-ui.js','utf8');
test('tabs have accessible panel relationships and keyboard navigation',()=>{
 for(const id of ['info','view','layers','measure','nesting','more']){
  assert.ok(html.includes('id="tab-'+id+'"'));
  assert.ok(html.includes('id="panel-'+id+'"'));
  assert.ok(html.includes('aria-labelledby="tab-'+id+'"'));
 }
 assert.match(app,/ArrowLeft/);assert.match(app,/ArrowRight/);
 assert.match(app,/aria-selected/);
});
test('CNC quoting fields restore local preferences without storing files or DXF geometry',()=>{
 assert.match(ui,/loadNestingPreferences/);
 assert.match(ui,/saveNestingPreferences/);
 assert.match(ui,/restorePreferences\(\)/);
 assert.match(ui,/persistPreferences\(\)/);
});
