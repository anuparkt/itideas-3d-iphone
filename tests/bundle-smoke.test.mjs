import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('production DXF bundle exposes working browser constructor',()=>{
 const js=readFileSync('dist/dxf-parser.bundle.js','utf8');
 const context={};context.globalThis=context;
 runInNewContext(js,context,{timeout:10000});
 assert.equal(typeof context.DxfParser,'function','Browser DXF Parser must be a constructor');
 const ascii=['0','SECTION','2','ENTITIES','0','LINE','8','CUT','10','0','20','0','11','100','21','50','0','ENDSEC','0','EOF'].join('\n');
 const result=new context.DxfParser().parseSync(ascii);
 assert.equal(result.entities.length,1);
});
