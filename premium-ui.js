/* My Timetable premium: the lock screen on premium tabs and the Account section in Settings.
   Classic script, runs after the app's own scripts. Talks to window.PremiumAPI (premium.bundle.js). */
(function(){
"use strict";
const gate=window.PremiumGate, P=window.PREMIUM_CONFIG||{};
if(!gate||!gate.enabled)return;
const $=id=>document.getElementById(id);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtDay=ms=>new Date(ms).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"});
const NAMES={tasks:"Assignments & tests",exams:"Exams",cgpa:"CGPA & results"};
const A=()=>window.PremiumAPI;

document.head.insertAdjacentHTML("beforeend",`<style>
#viewSeg button.plock::after{content:" 🔒";font-size:.8em}
.pw{display:grid;gap:14px;padding:18px 16px;border-radius:16px;background:var(--surface);border:1px solid var(--line);max-width:520px;margin:4px auto}
.pw h2{margin:0;font-family:var(--display);font-size:1.35rem}
.pw .price{font-family:var(--display);font-size:1.9rem;font-weight:700;color:var(--accent)}
.pw .price small{font-size:.9rem;color:var(--muted);font-weight:500}
.pw ul{margin:0;padding-left:1.2em;display:grid;gap:4px}
.pw .codein{display:flex;gap:8px}.pw .codein input{flex:1;min-width:0;font-family:var(--mono,monospace);text-transform:uppercase;letter-spacing:.06em}
.pw .who{font-size:.86rem;color:var(--muted)}
.pw .ok{color:var(--accent);font-weight:600}
.pacct{display:grid;gap:8px}
.linkbtn{all:unset;cursor:pointer;color:var(--accent);font-weight:600;text-decoration:underline}
</style>`);

/* lock badges on the tabs */
function badge(){$("viewSeg")&&$("viewSeg").querySelectorAll("button").forEach(b=>b.classList.toggle("plock",!gate.unlocked&&gate.views.includes(b.dataset.view)))}
badge();new MutationObserver(badge).observe($("viewSeg"),{childList:true});

/* lock screen in place of a premium tab */
$("week").insertAdjacentHTML("afterend",`<section class="xview" id="premiumView" hidden><div class="pw" id="pwBox"></div></section>`);
const orig=window.renderExtraView;
window.renderExtraView=function(now){
  const v=settings.view;
  if(!gate.unlocked&&gate.views.includes(v)){
    $("week").hidden=true;
    document.querySelectorAll("section.xview").forEach(s=>{if(s.id!=="premiumView")s.hidden=true});
    $("premiumView").hidden=false;$("viewSeg").hidden=false;
    $("viewSeg").querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed",v===b.dataset.view));
    paint($("pwBox"),v);return true;
  }
  $("premiumView").hidden=true;
  return orig?orig(now):false;
};

let msg="",msgOk=false;
// "Get a code on WhatsApp": one button per number in firebase-config.js, message already typed. Numbers aren't shown.
function waNums(){const l=Array.isArray(P.WHATSAPP_NUMBERS)?P.WHATSAPP_NUMBERS:P.WHATSAPP_NUMBER?[P.WHATSAPP_NUMBER]:[];return l.map(n=>String(n).replace(/\D/g,"")).filter(Boolean)}
function waLink(i){
  const num=waNums()[i||0];
  return num?"https://wa.me/"+num+"?text="+encodeURIComponent(P.whatsappText||"Hi, I want a My Timetable premium code"):"";
}
function waButtons(cls){
  const n=waNums().length;
  return waNums().map((_,i)=>`<button class="btn${cls||""}" type="button" data-p="wa" data-i="${i}">Get a code on WhatsApp${n>1?` (${i+1})`:""}</button>`).join("");
}
function openWa(i){
  const u=waLink(i);if(!u){toastP("WhatsApp number not set yet.");return}
  const b=window.AndroidBridge;
  if(b&&b.openUrl)try{b.openUrl(u);return}catch(e){}
  window.open(u,"_blank","noopener");
}
function toastP(m){if(typeof toast==="function")toast(m)}
function paint(box,view){
  if(!box)return;
  const a=A();
  const busy=a&&a.busy;
  box.innerHTML=`<h2>Enter access code</h2>
    <p>${esc(NAMES[view]||"This")} is part of <b>My Timetable Premium</b>: CGPA &amp; results, Exams and Assignments.</p>
    <div class="price">${esc(P.price||"₦2,500")}<small> ${esc(P.per||"a month")}</small></div>
    <label for="pwCode">Access code<div class="codein"><input id="pwCode" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-EFGH-JKMN"><button class="btn primary" type="button" data-p="redeem"${busy?" disabled":""}>${busy?"Checking…":"Unlock"}</button></div></label>
    <div class="actions">${waButtons()}</div>
    ${!a||!a.ready?`<p class="who">Checking your account…</p>`
      :!a.user?`<p class="who">You’ll sign in with Google when you unlock, so your premium and your data stay with your account.</p>`
      :`<p class="who">Signed in as ${esc(a.user.email)}${a.until&&!a.premium?` · premium ended ${esc(fmtDay(a.until))}`:""} · <button class="linkbtn" type="button" data-p="signout">switch account</button></p>`}
    ${a&&a.offline?`<p class="hint">You’re offline, so codes can’t be checked right now.</p>`:""}
    ${msg?`<p class="${msgOk?"ok":"err"}">${esc(msg)}</p>`:""}${a&&a.error?`<p class="err">${esc(a.error)}</p>`:""}`;
  wire(box);
}
function wire(box){
  box.querySelectorAll("[data-p]").forEach(b=>b.onclick=async()=>{
    const a=A();if(!a)return;msg="";
    const k=b.dataset.p;
    if(k==="wa")return openWa(+b.dataset.i||0);
    if(k==="signin")await a.signIn();
    else if(k==="signout")await a.signOut();
    else if(k==="sync"){await a.syncNow();msg=a.error?"":"Backed up.";msgOk=true}
    else if(k==="redeem"){
      const inp=box.querySelector("input"),code=inp?inp.value:"";
      if(!a.normalizeCode(code)){msg="Type the code first.";msgOk=false;return repaint()}
      if(!a.user){sessionStorage.setItem("mt-pending-code",code);if(!(await a.signIn()))return repaint()}
      await redeemNow(code);
    }
    repaint();
  });
  const inp=box.querySelector("input");
  if(inp){const pend=sessionStorage.getItem("mt-pending-code");if(pend&&!inp.value)inp.value=pend;
    inp.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();box.querySelector('[data-p="redeem"]').click()}}}
}
async function redeemNow(code){
  const a=A();
  try{const r=await a.redeem(code);sessionStorage.removeItem("mt-pending-code");msg=`Unlocked: ${r.days} days added. Premium until ${fmtDay(r.until)}.`;msgOk=true}
  catch(e){msg=e&&e.message||"That didn’t work.";msgOk=false}
}
// Code typed before a sign-in that had to leave the page (redirect): finish it when the user is back.
window.addEventListener("premium-change",()=>{const a=A(),c=sessionStorage.getItem("mt-pending-code");
  if(a&&a.user&&a.checked&&!a.premium&&!a.busy&&c&&!redeemNow.running){redeemNow.running=true;redeemNow(c).then(()=>{redeemNow.running=false;repaint()})}});

/* Account section at the top of Settings */
const panel=$("setDlg")&&$("setDlg").querySelector(".panel");
if(panel){
  const h=panel.querySelector("h3");
  h.insertAdjacentHTML("afterend",`<h4>Account, backup &amp; Premium</h4><div class="pacct" id="pAcct"></div>`);
}
function paintAcct(){
  const box=$("pAcct"),a=A();if(!box)return;
  if(!a||!a.ready){box.innerHTML=`<p class="hint">Checking your account…</p>`;return}
  if(!a.user){box.innerHTML=`<p class="hint">Sign in with Google to back up your timetable and everything else to your account, get it back on a new phone, and use Premium.</p><div class="actions"><button class="btn" type="button" data-p="signin">Continue with Google</button></div>`;wire(box);return}
  box.innerHTML=`<p class="hint">Signed in as <b>${esc(a.user.email)}</b></p>
    <p class="${a.premium?"ok":"hint"}">${a.premium?`Premium until ${esc(fmtDay(a.until))}`:a.until?`Premium ended ${esc(fmtDay(a.until))}`:"No premium yet"}${a.offline?" (offline)":""}</p>
    <label for="pCode2">${a.premium?"Add another code to extend":"Have an access code?"}<div class="codein" style="display:flex;gap:8px"><input id="pCode2" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-EFGH-JKMN" style="flex:1;min-width:0"><button class="btn" type="button" data-p="redeem">Redeem</button></div></label>
    ${msg?`<p class="${msgOk?"ok":"err"}">${esc(msg)}</p>`:""}${a.error?`<p class="err">${esc(a.error)}</p>`:""}
    <p class="hint">Backup: ${a.syncing?"backing up…":a.lastSync?"last backed up "+esc(new Date(a.lastSync).toLocaleString(undefined,{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})):"not yet"}${a.premium?"":" (timetable &amp; settings; Premium data is backed up while Premium is active)"}</p>
    <div class="actions"><button class="btn small" type="button" data-p="sync">Back up now</button>${a.premium?"":waButtons(" small")}<button class="btn small" type="button" data-p="signout">Sign out</button></div>`;
  wire(box);
}
function repaint(){badge();paintAcct();if(!$("premiumView").hidden)paint($("pwBox"),settings.view)}
window.addEventListener("premium-change",repaint);
paintAcct();
if(!gate.unlocked&&gate.views.includes(settings.view))render();
})();
