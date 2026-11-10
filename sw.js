const CACHE='itideas-cad-cloudflare-v2.3.1';
const CORE=['./','./index.html','./style.css','./design.css','./app.js','./app.bundle.js','./cad2d.js','./cad-geometry.js','./cad-export.js','./nesting-engine.js','./nesting-ui.js','./cnc-quality.js','./dxf-parser.bundle.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const isNavigation=e.request.mode==='navigate';
  const sameOrigin=new URL(e.request.url).origin===self.location.origin;
  // Fresh script/style after each Git deploy; offline uses last working cached version.
  const isCode=sameOrigin&&/\.(?:js|css|html)(?:\?.*)?$/.test(new URL(e.request.url).pathname);
  if(isNavigation||isCode){
    e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});return r}).catch(()=>caches.match(e.request).then(hit=>hit||caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{});return r})))
});
