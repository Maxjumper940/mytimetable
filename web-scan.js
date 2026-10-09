/* My Timetable (web): timetable / results screenshot reading with Tesseract (runs on the phone, no upload),
   QR codes from pictures and the camera (jsQR), and files attached to courses (kept in IndexedDB). */
(function(){
"use strict";
var B=window.AndroidBridge;if(!B)return;
function send(fn,arg){try{if(window[fn])window[fn](arg)}catch(e){console.error(e)}}
function loadScript(src){return new Promise(function(ok,no){var s=document.createElement("script");s.src=src;s.onload=ok;s.onerror=function(){no(new Error("load "+src))};document.head.appendChild(s)})}
var qrReady=null;function needQR(){return qrReady||(qrReady=window.jsQR?Promise.resolve():loadScript("ocr/jsQR.js"))}
var tessReady=null;function needTess(){return tessReady||(tessReady=window.Tesseract?Promise.resolve():loadScript("ocr/tesseract.min.js").catch(function(e){tessReady=null;throw e}))}

/* ---------- picking a picture ---------- */
var input=document.createElement("input");input.type="file";input.accept="image/*";input.hidden=true;document.body.appendChild(input);
var onPick=null;
input.addEventListener("change",function(){var f=input.files&&input.files[0];input.value="";var cb=onPick;onPick=null;if(f&&cb)cb(f)});
function pick(camera,cb){
  if(camera)input.setAttribute("capture","environment");else input.removeAttribute("capture");
  onPick=cb;input.click();
}

function loadImage(file){
  return new Promise(function(ok,no){var url=URL.createObjectURL(file),img=new Image();
    img.onload=function(){ok(img)};img.onerror=function(){URL.revokeObjectURL(url);no(new Error("decode"))};img.src=url});
}
// Draws the picture at a size Tesseract reads well (small screenshots are enlarged), dark mode inverted.
function prepare(img){
  var w=img.naturalWidth,h=img.naturalHeight,s=1;
  if(Math.max(w,h)<1400)s=Math.min(2.5,1400/Math.max(w,h));
  if(Math.max(w,h)*s>3000)s=3000/Math.max(w,h);
  var c=document.createElement("canvas");c.width=Math.round(w*s);c.height=Math.round(h*s);
  var g=c.getContext("2d",{willReadFrequently:true});g.imageSmoothingQuality="high";g.drawImage(img,0,0,c.width,c.height);
  var d=g.getImageData(0,0,c.width,c.height),p=d.data,sum=0,n=0;
  for(var i=0;i<p.length;i+=16){sum+=.299*p[i]+.587*p[i+1]+.114*p[i+2];n++}
  if(sum/n<110){for(i=0;i<p.length;i+=4){p[i]=255-p[i];p[i+1]=255-p[i+1];p[i+2]=255-p[i+2]}}
  removeGrid(p,c.width,c.height);g.putImageData(d,0,0);
  return c;
}
// Table borders confuse the text reader: paint long straight lines (much longer than any letter) white.
function removeGrid(p,W,H){
  var dark=new Uint8Array(W*H),i,x,y,run;
  for(i=0;i<W*H;i++){var k=i*4;dark[i]=(.299*p[k]+.587*p[k+1]+.114*p[k+2])<150?1:0}
  var kill=new Uint8Array(W*H),hMin=Math.max(70,Math.round(W*.06)),vMin=Math.max(48,Math.round(H*.05));
  for(y=0;y<H;y++){run=0;for(x=0;x<=W;x++){if(x<W&&dark[y*W+x])run++;else{if(run>=hMin)for(var a=x-run;a<x;a++)kill[y*W+a]=1;run=0}}}
  for(x=0;x<W;x++){run=0;for(y=0;y<=H;y++){if(y<H&&dark[y*W+x])run++;else{if(run>=vMin)for(var b=y-run;b<y;b++)kill[b*W+x]=1;run=0}}}
  for(i=0;i<W*H;i++)if(kill[i]){var q=i*4;p[q]=p[q+1]=p[q+2]=255}
}
function qrFromCanvas(c){
  if(!window.jsQR)return null;
  var s=Math.min(1,1400/Math.max(c.width,c.height)),q=document.createElement("canvas");
  q.width=Math.round(c.width*s);q.height=Math.round(c.height*s);var g=q.getContext("2d",{willReadFrequently:true});g.drawImage(c,0,0,q.width,q.height);
  var d=g.getImageData(0,0,q.width,q.height),r=jsQR(d.data,d.width,d.height,{inversionAttempts:"attemptBoth"});
  return r&&r.data?r.data:null;
}

function abs(u){return new URL(u,location.href).href}
var worker=null,workerP=null;
function getWorker(){
  if(worker)return Promise.resolve(worker);
  if(workerP)return workerP;
  workerP=needTess().then(function(){
    return Tesseract.createWorker("eng",1,{workerPath:abs("ocr/worker.min.js"),corePath:abs("ocr/tesseract-core-lstm.js"),langPath:abs("ocr/lang"),gzip:true,workerBlobURL:false,
      logger:function(m){if(m&&m.status==="recognizing text"&&m.progress>0&&m.progress<1){var t=Math.round(m.progress*100);if(t%25===0)send("onScanError","Reading your picture… "+t+"%")}}});
  }).then(function(w){worker=w;workerP=null;return w},function(e){workerP=null;throw e});
  return workerP;
}
function box(b){return {x:Math.round(b.x0),y:Math.round(b.y0),w:Math.round(b.x1-b.x0),h:Math.round(b.y1-b.y0)}}
// Tesseract reads table borders as "|"; ML Kit (Android) doesn't, so drop them.
function clean(t){return String(t||"").replace(/(^|\s)[|¦‖]+(?=\s|$)/g," ").replace(/[|¦‖]/g," ").replace(/\s+/g," ").trim()}
function pass(w,canvas,psm){
  return w.setParameters({preserve_interword_spaces:"1",tessedit_pageseg_mode:String(psm)}).then(function(){return w.recognize(canvas)}).then(function(r){
    var out=[],lines=(r&&r.data&&r.data.lines)||[];
    lines.forEach(function(l){var t=clean(l.text);if(!t||(l.confidence!=null&&l.confidence<25))return;
      var ws=(l.words||[]).map(function(x){var b=box(x.bbox);b.text=clean(x.text);return b}).filter(function(x){return x.text});
      if(!ws.length)return;
      var o=box(l.bbox);o.text=t;o.words=ws;out.push(o)});
    return out;
  });
}
// How much the app's own readers get out of these lines (timetable classes or result rows).
function score(lines){var n=0;
  try{if(window.TimetableScan)n=Math.max(n,TimetableScan.scan(JSON.parse(JSON.stringify(lines))).length)}catch(e){}
  try{if(window.GradeScan){var g=GradeScan.scan(JSON.parse(JSON.stringify(lines)));n=Math.max(n,(g&&g.found)||0)}}catch(e){}
  return n}
// Two ways of reading the page: whole lines (like a list or a row), then separate blocks (like table cells). Keeps the better one.
function readText(canvas){
  return getWorker().then(function(w){
    return pass(w,canvas,3).then(function(a){var sa=score(a);
      if(sa>=3)return a;
      send("onScanError","Reading your picture another way…");
      return pass(w,canvas,11).then(function(b){return score(b)>sa?b:a});
    });
  });
}
var busy=false;
function scanPicture(camera){
  if(busy){send("onScanError","Still reading the last picture…");return}
  pick(camera,function(file){
    busy=true;send("onScanError","Reading your picture…");
    var canvas,image;
    loadImage(file).then(function(img){image=img;return needQR().catch(function(){})}).then(function(){
      var q=null;try{var raw=document.createElement("canvas");raw.width=image.naturalWidth;raw.height=image.naturalHeight;raw.getContext("2d").drawImage(image,0,0);q=qrFromCanvas(raw)}catch(e){}
      canvas=prepare(image);
      if(q&&q.indexOf("TT")>=0){busy=false;send("onQRResult",q);return}
      if(!navigator.onLine&&!worker)send("onScanError","Reading your picture… (the text reader is used offline once it has been downloaded)");
      return readText(canvas).then(function(lines){busy=false;send("onScanResult",JSON.stringify(lines))});
    }).catch(function(e){busy=false;console.error(e);
      send("onScanError",navigator.onLine?"Couldn’t read that picture. Try a sharper screenshot.":"The text reader needs the internet the first time. Connect and try again.")});
  });
}
B.pickAndScan=function(){scanPicture(false)};
B.takePhotoAndScan=function(){scanPicture(true)};

/* ---------- camera QR ---------- */
document.head.insertAdjacentHTML("beforeend",`<style>
#qrCam{padding:0;border:0;background:#000;color:#fff;width:min(480px,100%);max-width:100%;max-height:100%}
#qrCam .qv{position:relative;display:grid;place-items:center;background:#000;aspect-ratio:3/4;max-height:72vh}
#qrCam video{width:100%;height:100%;object-fit:cover}
#qrCam .qf{position:absolute;width:62%;aspect-ratio:1;border:3px solid #fff;border-radius:18px;box-shadow:0 0 0 999px rgba(0,0,0,.35)}
#qrCam .qb{display:flex;gap:8px;justify-content:space-between;align-items:center;padding:12px 14px calc(12px + env(safe-area-inset-bottom,0px))}
#qrCam .qb span{font-size:.9rem;opacity:.85}
</style>`);
document.body.insertAdjacentHTML("beforeend",`<dialog id="qrCam"><div class="qv"><video id="qrVideo" playsinline muted autoplay></video><div class="qf"></div></div>
  <div class="qb"><span id="qrMsg">Point the camera at a My Timetable QR code</span><button class="btn" type="button" id="qrClose">Cancel</button></div></dialog>`);
var stream=null,raf=0;
function stopCam(){cancelAnimationFrame(raf);raf=0;if(stream){stream.getTracks().forEach(function(t){t.stop()});stream=null}var d=document.getElementById("qrCam");if(d.open)d.close()}
document.getElementById("qrClose").onclick=stopCam;
document.getElementById("qrCam").addEventListener("close",function(){if(stream)stopCam()});
B.scanQR=function(){
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
    send("onScanError","This browser can’t use the camera here. Take a photo of the QR code instead.");scanPicture(true);return}
  var dlg=document.getElementById("qrCam"),v=document.getElementById("qrVideo");
  ["setDlg","dlg"].forEach(function(id){var d=document.getElementById(id);if(d&&d.open)d.close()});
  Promise.all([needQR(),navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false})]).then(function(r){
    stream=r[1];v.srcObject=stream;dlg.showModal();v.play().catch(function(){});
    var c=document.createElement("canvas"),g=c.getContext("2d",{willReadFrequently:true});
    (function tick(){
      if(!stream)return;
      if(v.readyState>=2&&v.videoWidth){var s=Math.min(1,720/Math.max(v.videoWidth,v.videoHeight));c.width=Math.round(v.videoWidth*s);c.height=Math.round(v.videoHeight*s);
        g.drawImage(v,0,0,c.width,c.height);var d=g.getImageData(0,0,c.width,c.height),q=jsQR(d.data,d.width,d.height,{inversionAttempts:"dontInvert"});
        if(q&&q.data){if(q.data.indexOf("TT")>=0){stopCam();send("onQRResult",q.data);return}document.getElementById("qrMsg").textContent="That isn’t a My Timetable code."}}
      raf=requestAnimationFrame(tick);
    })();
  }).catch(function(e){stopCam();
    send("onScanError",e&&e.name==="NotAllowedError"?"Camera access is off. Allow it in Settings → Safari → Camera (or your browser’s site settings), or take a photo of the code instead.":"Couldn’t open the camera. Take a photo of the QR code instead.")});
};

/* ---------- files attached to courses (kept on this phone in IndexedDB) ---------- */
function db(){return new Promise(function(ok,no){var r=indexedDB.open("mtt-web-files",1);r.onupgradeneeded=function(){r.result.createObjectStore("files")};r.onsuccess=function(){ok(r.result)};r.onerror=function(){no(r.error)}})}
function put(id,v){return db().then(function(d){return new Promise(function(ok,no){var t=d.transaction("files","readwrite");t.objectStore("files").put(v,id);t.oncomplete=ok;t.onerror=function(){no(t.error)}})})}
function get(id){return db().then(function(d){return new Promise(function(ok,no){var r=d.transaction("files").objectStore("files").get(id);r.onsuccess=function(){ok(r.result)};r.onerror=function(){no(r.error)}})})}
var fileIn=document.createElement("input");fileIn.type="file";fileIn.hidden=true;document.body.appendChild(fileIn);
var fileKey="";
fileIn.addEventListener("change",function(){var f=fileIn.files&&fileIn.files[0];fileIn.value="";if(!f)return;
  if(f.size>40*1024*1024){send("onBackupResult","That file is over 40 MB. Add a link to it instead.");return}
  var id="f"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  put(id,{blob:f,name:f.name,type:f.type}).then(function(){send("onFilePicked",JSON.stringify({uri:"idb:"+id,name:f.name,key:fileKey,mime:f.type||""}))})
    .catch(function(){send("onBackupResult","Couldn’t save that file on this phone.")});
});
B.pickFile=function(key){fileKey=key||"";fileIn.click()};
B.openFile=function(uri,mime){
  if(!/^idb:/.test(uri||"")){window.open(uri,"_blank","noopener");return}
  var w=null;try{w=window.open("","_blank")}catch(e){}
  get(uri.slice(4)).then(function(v){
    if(!v){if(w)w.close();send("onBackupResult","That file isn’t on this phone (files aren’t included in backups).");return}
    var url=URL.createObjectURL(v.blob);
    if(w)w.location.href=url;else{var a=document.createElement("a");a.href=url;a.download=v.name||"file";document.body.appendChild(a);a.click();a.remove()}
    setTimeout(function(){URL.revokeObjectURL(url)},60000);
  }).catch(function(){if(w)w.close();send("onBackupResult","Couldn’t open that file.")});
};
})();
