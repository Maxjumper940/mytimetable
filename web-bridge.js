/* My Timetable (web / iPhone version): stands in for the Android app's AndroidBridge.
   Everything stays on this device (localStorage). Reminders are local notifications shown
   while the app is open or was used recently; there is no server and no push. */
(function(){
"use strict";
var RKEY="mtt-web-reminders", FKEY="mtt-web-fired", LKEY="mtt-web-lastcheck";
var hasN=("Notification" in window);
var standalone=(window.navigator.standalone===true)||(window.matchMedia&&matchMedia("(display-mode: standalone)").matches);
var isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
window.WEB_ENV={standalone:standalone,isIOS:isIOS,notifications:hasN};

function load(k,d){try{var s=localStorage.getItem(k);return s?JSON.parse(s):d}catch(e){return d}}
function store(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
function pad(n){return String(n).padStart(2,"0")}
function isoOf(d){return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())}
function at(iso,hhmm){var p=iso.split("-").map(Number),t=(hhmm||"00:00").split(":").map(Number);return new Date(p[0],p[1]-1,p[2],t[0],t[1],0,0).getTime()}
function addDays(iso,n){var p=iso.split("-").map(Number);return isoOf(new Date(p[0],p[1]-1,p[2]+n,12))}
function dow(iso){var p=iso.split("-").map(Number);return (new Date(p[0],p[1]-1,p[2],12).getDay()+6)%7} // 0 = Monday
function fmt(t){var a=t.split(":").map(Number),ap=a[0]>=12?"PM":"AM",h=a[0]%12||12;return h+(a[1]?":"+pad(a[1]):"")+" "+ap}
function off(c,iso){
  if(c&&Array.isArray(c.cancel)&&c.cancel.indexOf(iso)>=0)return true;
  try{if(window.offReason)return !!window.offReason(c,iso)}catch(e){}
  return false;
}
function lbl(m){var h=Math.floor(m/60),mi=m%60;return [h?h+" hr":"",mi?mi+" min":""].filter(Boolean).join(" ")}

/* Every reminder due between `from` and `to` (ms). */
function due(p,from,to){
  var out=[];if(!p)return out;
  var d0=isoOf(new Date(from-864e5)),d1=isoOf(new Date(to+2*864e5));
  for(var iso=d0;iso<=d1;iso=addDays(iso,1)){
    var wd=dow(iso),todays=(p.classes||[]).filter(function(c){return c.day===wd&&!off(c,iso)});
    todays.forEach(function(c){
      var s=at(iso,c.start),nm=(c.code?c.code+" · ":"")+c.name;
      if(p.enabled&&!c.mute)(p.offsets||[]).forEach(function(m){out.push({id:"c:"+c.id+":"+iso+":"+m,t:s-m*6e4,title:nm+" in "+lbl(m),body:fmt(c.start)+(c.venue?" · "+c.venue:"")})});
      if(p.silent&&!c.mute)out.push({id:"s:"+c.id+":"+iso,t:s,title:"Class starting: "+nm,body:"Put your phone on silent."});
    });
    if(p.nowNext){
      var srt=todays.slice().sort(function(a,b){return a.start<b.start?-1:1});
      srt.forEach(function(c,i){var nx=srt[i+1];
        out.push({id:"n:"+c.id+":"+iso,t:at(iso,c.start)+1000,title:"Now: "+(c.code||c.name)+" until "+fmt(c.end),
          body:(c.venue?c.venue+" · ":"")+(nx?"Next: "+(nx.code||nx.name)+" at "+fmt(nx.start)+(nx.venue?" ("+nx.venue+")":""):"Last class today")})});
    }
    if(p.summary&&p.summary.enabled&&todays.length){
      var list=todays.slice().sort(function(a,b){return a.start<b.start?-1:1});
      out.push({id:"m:"+iso,t:at(iso,p.summary.time||"07:00"),title:"Today: "+list.length+" class"+(list.length>1?"es":""),body:list.map(function(c){return fmt(c.start)+" "+(c.code||c.name)}).join(", ")});
    }
  }
  if(p.deadlines!==false){
    (p.tasks||[]).forEach(function(t){if(!t.date)return;
      out.push({id:"t:"+t.id+":"+t.date,t:at(addDays(t.date,-1),"18:00"),title:"Due tomorrow: "+t.title,body:[t.code,t.kind,"by "+fmt(t.time||"23:59")].filter(Boolean).join(" · ")})});
    (p.exams||[]).forEach(function(x){if(!x.date||!x.start)return;var nm="Exam: "+(x.code?x.code+" · ":"")+(x.name||"");
      var b=[fmt(x.start),x.venue,x.seat?"Seat "+x.seat:""].filter(Boolean).join(" · ");
      out.push({id:"e1:"+x.id+":"+x.date,t:at(addDays(x.date,-1),"18:00"),title:nm+" tomorrow",body:b});
      out.push({id:"e2:"+x.id+":"+x.date,t:at(x.date,x.start)-2*36e5,title:nm+" in 2 hr",body:b})});
  }
  if(p.focusEnd&&p.focusTitle)out.push({id:"f:"+p.focusEnd,t:p.focusEnd,title:"My Timetable",body:p.focusTitle});
  return out.filter(function(r){return r.t>from&&r.t<=to});
}

function show(title,body,tag){
  if(!hasN||Notification.permission!=="granted"){if(window.toast)try{toast(title+(body?" · "+body:""))}catch(e){}return}
  var o={body:body||"",tag:tag||"",icon:"icons/icon-192.png",badge:"icons/icon-192.png"};
  if(navigator.serviceWorker&&navigator.serviceWorker.ready){
    navigator.serviceWorker.ready.then(function(r){return r.showNotification(title,o)}).catch(function(){try{new Notification(title,o)}catch(e){}});
  }else{try{new Notification(title,o)}catch(e){}}
}

var timers=[];
function check(){
  var p=load(RKEY,null),now=Date.now(),last=load(LKEY,0);
  // Catch up on anything missed in the last 15 minutes (app was in the background), never older.
  var from=Math.max(last||0,now-15*6e4),fired=load(FKEY,{});
  due(p,from,now).forEach(function(r){if(fired[r.id])return;fired[r.id]=now;show(r.title,r.body,r.id)});
  for(var k in fired)if(now-fired[k]>3*864e5)delete fired[k];
  store(FKEY,fired);store(LKEY,now);
  // Exact timers for the next 6 hours while the page stays open.
  timers.forEach(clearTimeout);timers=[];
  due(p,now,now+6*36e5).forEach(function(r){timers.push(setTimeout(check,Math.max(0,r.t-Date.now())+200))});
}
setInterval(check,30000);
document.addEventListener("visibilitychange",function(){if(!document.hidden)check()});
window.addEventListener("focus",check);

var bridge={
  isWeb:true,
  setReminders:function(json){var p=null;try{p=JSON.parse(json)}catch(e){}if(!p)return;
    var had=load(RKEY,null);store(RKEY,p);if(!had)store(LKEY,Date.now());setTimeout(check,50)},
  status:function(){
    return JSON.stringify({notifications:!hasN?false:Notification.permission==="denied"?false:Notification.permission==="granted"?true:null,
      supported:hasN,permission:hasN?Notification.permission:"unsupported",exact:true,web:true,standalone:standalone,ios:isIOS});
  },
  requestPermission:function(){
    if(!hasN||Notification.permission!=="default")return;
    try{var r=Notification.requestPermission(function(){if(window.onReminderStatus)onReminderStatus()});
      if(r&&r.then)r.then(function(){if(window.onReminderStatus)onReminderStatus()})}catch(e){}
  },
  testNotification:function(){
    var fire=function(){show("Test reminder","This is how class reminders will look.","test")};
    if(hasN&&Notification.permission==="default"){try{var r=Notification.requestPermission();if(r&&r.then)r.then(function(){fire();if(window.onReminderStatus)onReminderStatus()})}catch(e){fire()}}
    else fire();
  },
  setBarColor:function(color,dark){
    var m=document.querySelector('meta[name="theme-color"]:not([media])');
    if(!m){m=document.createElement("meta");m.name="theme-color";document.head.appendChild(m)}
    var mix=function(a,b,t){return "#"+[1,3,5].map(function(i){return Math.round(parseInt(a.substr(i,2),16)*(1-t)+parseInt(b.substr(i,2),16)*t).toString(16).padStart(2,"0")}).join("")};
    try{m.content=dark?"#0f1420":mix("#f3f5f8",String(color||"#1f5fd1"),.16)}catch(e){m.content="#f3f5f8"}
  }
};
if(navigator.share)bridge.share=function(text){navigator.share({text:text}).catch(function(){})};
window.AndroidBridge=bridge;
setTimeout(check,1500);

if("serviceWorker" in navigator&&location.protocol!=="file:"){
  window.addEventListener("load",function(){navigator.serviceWorker.register("sw.js",{updateViaCache:"none"}).then(function(r){try{r.update()}catch(e){}}).catch(function(){})});
  // A new version took over: reload once so the whole app comes from the same version.
  var hadSW=!!navigator.serviceWorker.controller,reloaded=false;
  navigator.serviceWorker.addEventListener("controllerchange",function(){if(!hadSW||reloaded)return;reloaded=true;
    var busy=document.querySelector("dialog[open]");if(busy)return;location.reload()});
}
})();
