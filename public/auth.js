import {esc} from './views.js';
const keys=['tally:state:v1','tally:outbox:v1'];
function clearLocal() { for(const k of keys) localStorage.removeItem(k); }
async function request(path,body) {
  const r=await fetch('/api/auth/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Tally-Request':'1'},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const d=await r.json(); if(!r.ok) throw new Error(d.error||'Please try again'); return d;
}
export async function logout() {
  if(localStorage.getItem('tally:outbox:v1') && JSON.parse(localStorage.getItem('tally:outbox:v1')).length && !confirm('There are unsynced entries on this device. Signing out will erase them. Continue?')) return;
  await request('logout',{}); clearLocal(); location.reload();
}
export async function requireAuth() {
  let st;
  try { st=await request('status'); }
  catch(e) {
    if(localStorage.getItem(keys[0])) return true; // known device can enter offline; no API bypass
    document.querySelector('#view').innerHTML='<div class="empty"><h3>Cannot connect</h3><p>Check your connection, then reload. No account data is available offline yet.</p><button class="btn primary" id="retry-auth">Retry</button></div>';
    document.querySelector('#retry-auth').onclick=()=>location.reload(); return false;
  }
  if(st.authenticated) return true;
  // A logged-out shell never paints a cached ledger. Keep pending items until login to avoid silently losing them.
  document.body.classList.add('locked');
  let setupToken=new URLSearchParams(location.hash.slice(1)).get('setup')||'';
  if(setupToken) history.replaceState(null,'',location.pathname);
  const setup=st.needs_setup;
  document.querySelector('#view').innerHTML=`<section class="auth-panel"><img class="auth-logo" src="/icon.svg" width="56" height="56" alt=""><h2>${setup?'Your own little ledger.':'Welcome back.'}</h2><p>${setup?'Create a password to claim this private Tally installation. Your setup key was provided separately.':'Sign in to your Tally. Spending only. No bank login. No AI.'}</p><form id="auth-form">
  ${setup?`<label>Setup key<input id="setup-key" type="password" autocomplete="off" value="${esc(setupToken)}" required></label>`:''}
  <label>${setup?'Choose a password':'Password'}<input id="owner-password" type="password" autocomplete="${setup?'new-password':'current-password'}" minlength="12" maxlength="128" required></label>
  ${setup?'<label>Confirm password<input id="confirm-password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><p class="note">At least 12 characters. Save it in your password manager. This is not your bank or Apple password.</p>':''}
  <p id="auth-error" class="auth-error" role="alert"></p><button class="btn primary" type="submit">${setup?'Create my ledger':'Sign in'}</button></form><p class="note">Cloudflare-hosted · MYR / Malaysia time<br>Each installation is for one person.</p><a href="/guide.html">How automatic capture works</a></section>`;
  document.querySelector('#auth-form').onsubmit=async e=>{
    e.preventDefault(); const b=e.target.querySelector('button'),err=document.querySelector('#auth-error'); err.textContent='';
    const password=document.querySelector('#owner-password').value;
    if(setup&&password!==document.querySelector('#confirm-password').value) {err.textContent='Passwords do not match.';return;}
    b.disabled=true;b.textContent='Please wait…';
    try {
      await request(setup?'setup':'login',{password,...(setup?{setup_token:document.querySelector('#setup-key').value}:{})});
      location.hash='home'; location.reload();
    } catch(ex) {err.textContent=ex.message;b.disabled=false;b.textContent=setup?'Create my ledger':'Sign in';}
  };
  return false;
}
