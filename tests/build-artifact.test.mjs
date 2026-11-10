import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,statSync} from 'node:fs';

test('production HTML uses bundled local Three.js viewer with no external importmap',()=>{
 const html=readFileSync('dist/index.html','utf8');
 assert.match(html,/src=".\/app.bundle.js"/);
 assert.doesNotMatch(html,/type="importmap"/);
});
test('all app modules needed at startup exist in static output',()=>{
 for(const f of ['app.bundle.js','cnc-quality.js','dxf-parser.bundle.js','design.css','sw.js']){
   assert.equal(existsSync('dist/'+f),true, f);
   assert.ok(statSync('dist/'+f).size>100,f);
 }
});
test('local bundle includes 3MF/GLTF logic rather than three CDN module imports',()=>{
 const src=readFileSync('dist/app.bundle.js','utf8');
 assert.doesNotMatch(src,/import[^;]*from\s*["']https:\/\/cdn\.jsdelivr\.net\/npm\/three/);
 assert.ok(src.length>100000);
});
