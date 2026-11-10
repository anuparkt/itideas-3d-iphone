import {mkdir,copyFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {build as bundle} from 'esbuild';
const root=process.cwd(),dist=join(root,'dist');
await rm(dist,{recursive:true,force:true});
await mkdir(join(dist,'icons'),{recursive:true});
for(const file of ['index.html','style.css','app.js','cad2d.js','cad-geometry.js','cad-export.js','sw.js','manifest.webmanifest']){
  await copyFile(join(root,file),join(dist,file));
}
for(const icon of ['apple-touch-icon.png','icon-192.png','icon-512.png']){
  await copyFile(join(root,'icons',icon),join(dist,'icons',icon));
}
await bundle({entryPoints:[join(root,'scripts/dxf-entry.js')],bundle:true,minify:true,platform:'browser',format:'iife',target:['safari15','es2020'],outfile:join(dist,'dxf-parser.bundle.js')});
console.log('Cloudflare Pages output ready: dist/ (local DXF parser included)');
