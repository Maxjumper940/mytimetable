/* Old My Timetable service worker, replaced: the app moved to https://my-timetable-511022.web.app.
   This version clears the old offline copy, unregisters itself and sends open pages to the new address. */
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",e=>{e.waitUntil((async()=>{
  for(const k of await caches.keys())await caches.delete(k);
  await self.registration.unregister();
  for(const c of await self.clients.matchAll({type:"window"}))c.navigate("https://my-timetable-511022.web.app/");
})())});
self.addEventListener("fetch",e=>{if(e.request.mode==="navigate")e.respondWith(Response.redirect("https://my-timetable-511022.web.app/",302))});
