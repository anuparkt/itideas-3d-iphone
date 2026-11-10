import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('iPhone Files picker does not disable unrecognized CAD extensions',()=>{
 const html=readFileSync('index.html','utf8');
 const input=html.match(/<input\b[^>]*\bid=["']fileInput["'][^>]*>/i);
 assert.ok(input,'Expected a single CAD file input');
 assert.match(input[0],/\btype=["']file["']/i);
 assert.doesNotMatch(input[0],/\baccept\s*=/i,'Safari/iOS may gray out DXF when accept uses an unrecognized document UTI');
});
test('app still validates file extensions after choosing any file',()=>{
 const js=readFileSync('app.js','utf8');
 assert.match(js,/['"]dxf['"]/);
 assert.match(js,/['"]stl['"]/);
 assert.match(js,/['"]ai['"]/);
 assert.match(js,/\.includes\(ext\)/);
});
