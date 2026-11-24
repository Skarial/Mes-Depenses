const CACHE='mes-depenses-v30';
const ASSETS=['./','./index.html','./budget.js','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(path=>new Request(new URL(path,self.location.href),{cache:'reload'})))).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('mes-depenses-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
  if(request.mode==='navigate'){
    // Serve HTML and the calculation module from the same installed release, even during an update.
    event.respondWith(caches.open(CACHE).then(cache=>cache.match('./index.html')).then(response=>response||fetch(request)));
    return;
  }
  event.respondWith(caches.open(CACHE).then(cache=>cache.match(request)).then(response=>response||fetch(request)));
});
