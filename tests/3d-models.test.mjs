import test from 'node:test';
import assert from 'node:assert/strict';
import {OBJLoader} from 'three/addons/loaders/OBJLoader.js';
import {PLYLoader} from 'three/addons/loaders/PLYLoader.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

test('OBJ loader parses real triangle mesh into 3D scene',()=>{
 const obj=['o TEST_TRIANGLE','v 0 0 0','v 30 0 0','v 0 40 0','f 1 2 3'].join('\n');
 const group=new OBJLoader().parse(obj);
 let count=0;group.traverse(x=>{if(x.isMesh)count+=x.geometry.attributes.position.count;});
 assert.ok(count>=3);
});
test('PLY loader parses ASCII mesh faces and vertices',()=>{
 const ply=['ply','format ascii 1.0','element vertex 3','property float x','property float y','property float z',
  'element face 1','property list uchar int vertex_indices','end_header','0 0 0','30 0 0','0 40 0','3 0 1 2',''].join('\n');
 const bytes=new TextEncoder().encode(ply);
 const geom=new PLYLoader().parse(bytes.buffer);
 assert.equal(geom.getAttribute('position').count,3);
 assert.equal(geom.index.count,3);
});
test('GLTF loader parses actual embedded glTF 2.0 mesh scene',async()=>{
 const triangle=Float32Array.from([0,0,0,1,0,0,0,1,0]);
 const bin=Buffer.from(triangle.buffer);
 const gltf={
  asset:{version:'2.0'},buffers:[{uri:'data:application/octet-stream;base64,'+bin.toString('base64'),byteLength:bin.length}],
  bufferViews:[{buffer:0,byteOffset:0,byteLength:bin.length}],
  accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]}],
  meshes:[{primitives:[{attributes:{POSITION:0}}]}],nodes:[{mesh:0}],scenes:[{nodes:[0]}],scene:0
 };
 const scene=await new Promise((res,rej)=>new GLTFLoader().parse(JSON.stringify(gltf),'',x=>res(x.scene),rej));
 let meshes=0;scene.traverse(o=>{if(o.isMesh)meshes++});
 assert.equal(meshes,1);
});
