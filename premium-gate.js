/* My Timetable premium gate (runs synchronously, before the tasks/exams/CGPA scripts load).
   It only decides what THIS device shows. Whether someone is premium is decided on the server
   (Firestore rules); premium.js fetches that answer and caches it here as `mt-premium-v1`.
   While locked, the premium parts of the app see no data and can't save any, so their tabs,
   reminders and home-screen alerts stay empty. Data on the phone is left alone (and backed up
   in the person's account), so nothing is lost if a month runs out. */
(function(){
  "use strict";
  var P=window.PREMIUM_CONFIG||{};
  var KEYS={"baze-timetable-tasks-v1":"tasks","baze-timetable-exams-v1":"exams","baze-timetable-grades-v1":"grades"};
  var VIEWS=["tasks","exams","cgpa"];
  var st=null;try{st=JSON.parse(localStorage.getItem("mt-premium-v1")||"null")}catch(e){}
  var enabled=!!(P.enabled&&window.FIREBASE_CONFIG&&window.FIREBASE_CONFIG.apiKey);
  // Premium on this device = the last answer from the server said so and that time hasn't passed.
  // (A clock wound back more than a day before the last check doesn't count.)
  var now=Date.now();
  var unlocked=!enabled||!!(st&&st.uid&&st.until>now&&now>(st.checkedAt||0)-864e5);
  var gate=window.PremiumGate={enabled:enabled,unlocked:unlocked,keys:KEYS,views:VIEWS,state:st,onWrite:null};
  var _read=window.read,_write=window.write;
  if(typeof _read!=="function"||typeof _write!=="function")return; // page layout changed: fail open, premium.js will warn
  window.read=function(k){if(!gate.unlocked&&KEYS[k])return null;return _read(k)};
  window.write=function(k,v){
    if(KEYS[k]&&!gate.unlocked)return;     // locked: never touch the premium data saved on the phone
    _write(k,v);
    // Everything the app saves is backed up to the person's account when they're signed in (premium.js).
    if(String(k).indexOf("baze-timetable-")===0){
      try{localStorage.setItem("mt-sync-dirty-"+k,String(Date.now()))}catch(e){}
      if(gate.onWrite)try{gate.onWrite(k)}catch(e){}
    }
  };
})();
