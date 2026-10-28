const CACHE='pfeilerl-__VERSION__';
const FONTS=['barlow-400','barlow-500','barlow-600','barlow-condensed-500','barlow-condensed-600','barlow-condensed-700'].map(f=>'./fonts/'+f+'.woff2');
const CORE=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-maskable.png','./apple-touch-icon.png',...FONTS];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE.map(u=>new Request(u,{cache:'reload'})))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET') return;
  const url=new URL(e.request.url);
  if(url.origin===location.origin){
    // Seite: zuerst Netz (für Updates), sonst Cache. no-cache fragt beim Server nach, statt
    // bis zu 10 Minuten eine alte Fassung aus dem Browser-Zwischenspeicher zu liefern
    e.respondWith(fetch(e.request,{cache:'no-cache'}).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));return r;}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
  }
});
