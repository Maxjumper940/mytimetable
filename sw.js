/* My Timetable service worker: keeps the whole app on the phone so it opens offline.
   Change VERSION when you publish an update. */
const VERSION="mtt-web-1.9.2-4";
const ASSETS=["./","index.html","config.js","web-bridge.js","web-scan.js","ocr/jsQR.js","manifest.json","fonts/fonts.css",  "fonts/BricolageGrotesque-latin-ext.woff2",  "fonts/BricolageGrotesque-latin.woff2",  "fonts/Figtree-latin-ext.woff2",  "fonts/Figtree-latin.woff2",  "fonts/JetBrainsMono-latin-ext.woff2",  "fonts/JetBrainsMono-latin.woff2",
  "icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","icons/apple-touch-icon.png","icons/favicon-32.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(VERSION).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))});
// The text reader (about 6 MB, in ocr/) is cached the first time someone scans a picture, so later scans work offline.
self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const req=e.request;if(req.method!=="GET")return;
  const url=new URL(req.url);if(url.origin!==location.origin)return;
  if(req.mode==="navigate"){
    // App page: the newest version when online (gives up after 3 s), the saved copy when offline.
    e.respondWith(caches.open(VERSION).then(async c=>{
      const net=fetch(req,{cache:"no-cache"}).then(r=>{if(r&&r.ok)c.put("index.html",r.clone());return r}).catch(()=>null);
      const quick=await Promise.race([net,new Promise(ok=>setTimeout(()=>ok(null),3000))]);
      return quick||(await c.match("index.html"))||(await net)||new Response("Offline",{status:503});
    }));return;
  }
  e.respondWith(caches.open(VERSION).then(async c=>{
    const hit=await c.match(req,{ignoreSearch:true});
    const net=fetch(req).then(r=>{if(r&&r.ok&&r.type==="basic")c.put(req,r.clone());return r}).catch(()=>null);
    return hit||(await net)||new Response("",{status:504});
  }));
});
self.addEventListener("notificationclick",e=>{
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(ws=>{for(const w of ws){if("focus" in w)return w.focus()}return self.clients.openWindow("./")}));
});
