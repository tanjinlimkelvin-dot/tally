import * as V from './views.js';
import * as C from './core.js';
import {icon} from './icons.js';
const esc=V.esc;
const copybox=(value,label)=>`<div class="copy-box"><code>${esc(value)}</code><button type="button" data-action="copy" data-copy="${esc(value)}" aria-label="Copy ${esc(label)}">${icon('copy')}</button></div>`;
export function cloudSettings(S) {
  const ing=S.ingest||{};
  return `<div class="month"><h2>Settings</h2><span class="cloud-mark">Cloud edition</span></div>
  <section class="section"><div class="section-h"><h2>Automatic capture</h2></div><div class="panel group">
    <a class="set-row" href="#setup">${icon('tap')}<span>Set up iPhone Shortcuts<span class="sub">Apple Pay, supported TNG notifications and Alliance SMS</span></span>${icon('right')}</a>
    <div class="set-row">${icon('check')}<span>Last received<span class="sub">${ing.last_at?esc(ing.last_at.replace('T',' ').slice(0,19))+' MYT':'No upload received yet'}</span></span></div>
    ${(S.ignoredTaps||[]).map(t=>`<div class="set-row">${icon('close')}<span>Ignored: ${esc(t.label)}</span><button type="button" class="link" data-action="unignore" data-k="${esc(t.merchant_key)}">Log again</button></div>`).join('')}
  </div></section>
  <section class="section"><div class="section-h"><h2>Upload keys</h2></div><p class="note">One key per shortcut is best. Keys can submit events, but cannot read or edit your ledger. Never share a key publicly.</p>
  <div class="panel group">${S.tokens===null?'<p class="note pad-note">Loading keys…</p>':S.tokens.map(t=>`<div class="set-row"><span>${esc(t.label)}<span class="sub">${t.last_used_at?'Last used '+esc(t.last_used_at.slice(0,16).replace('T',' ')):'Not used yet'}</span></span><button type="button" class="link danger" data-action="token-revoke" data-id="${esc(t.id)}">Revoke</button></div>`).join('')}
  <div class="token-add"><label class="sr" for="token-label">Key label</label><input id="token-label" maxlength="40" placeholder="e.g. My iPhone — Apple Pay"><button class="btn primary sm" type="button" data-action="token-create">Create key</button></div></div>
  ${S.newToken?`<div class="secret-once" role="status"><h3>Save this key now</h3><p>Shown once. Paste the full Authorization value into Shortcuts. It is not saved in this browser.</p>${copybox('Bearer '+S.newToken,'Authorization value')}<button class="link" data-action="token-hide">I saved it — hide</button></div>`:''}</section>
  <section class="section" id="recurring"><div class="section-h"><h2>Recurring</h2></div><div class="panel group">${V.recurringRows(S)}</div><p class="note">Monthly or yearly. Due payments are posted from 09:00 Malaysia time. This records a planned expense; it does not check your bank.</p></section>
  <section class="section" id="categories"><div class="section-h"><h2>Categories</h2></div><div class="panel group">${V.categoryRows(S)}</div><p class="note">Rename, reorder, use your own emoji or turn off Count in totals.</p></section>
  <section class="section" id="budgets"><div class="section-h"><h2>Monthly budgets</h2></div><div class="panel group">${V.budgetInputs(S)}</div><p class="note">Leave empty for no budget. Progress and overspending are shown in Overview. No SMS or Telegram alerts are sent.</p></section>
  <section class="section"><div class="section-h"><h2>Data & recovery</h2></div><div class="panel group">
    <a class="set-row" href="#trash">${icon('trash')}<span>Trash<span class="sub">Deleted entries can be restored</span></span>${icon('right')}</a>
    <a class="set-row" href="/api/export.csv" download>${icon('download')}<span>Export CSV<span class="sub">All active spending, including excluded categories</span></span>${icon('right')}</a>
    <button class="set-row" data-action="recover" type="button">${icon('refresh')}<span>Recover shortcut archive<span class="sub">Select a .jsonl file from Files. Repeated event IDs do not create more entries.</span></span></button>
    <button class="set-row" data-action="skipped-load" type="button">${icon('list')}<span>Skipped notifications<span class="sub">Inspect what rules did not log. No AI review.</span></span>${icon('right')}</button>
  </div>${S.skipped?skippedHTML(S.skipped):''}<p class="note">Your ledger is stored in Cloudflare D1, not on a home PC. Export CSV regularly for an independent copy. Phone archives are capture logs, not a backup of edits or categories.</p></section>
  <section class="section"><div class="section-h"><h2>Account</h2></div><details class="panel account-change"><summary>Change password</summary><label>Current password<input id="old-password" type="password" autocomplete="current-password"></label><label>New password<input id="new-password" type="password" minlength="12" maxlength="128" autocomplete="new-password"></label><button class="btn ghost" data-action="password-change" type="button">Change password</button><p class="note">At least 12 characters. Other browser sessions will be signed out; upload keys remain until revoked.</p></details>
  <button class="btn ghost" type="button" data-action="logout">Sign out & clear this device</button></section>`;
}
function skippedHTML(rows) {
  return `<div class="skipped-list">${rows.length?rows.map(r=>`<article class="skipped-item"><b>${esc(r.title||'Message')}</b><p>${esc(r.body||r.text||'')}</p><small>${esc(r.occurred_at||r.at||'')}</small><div class="skipped-actions"><button class="btn ghost sm" type="button" data-action="skipped-add" data-id="${r.id}">Review as spending</button><button class="btn ghost sm" type="button" data-action="skipped-dismiss" data-id="${r.id}">Dismiss</button></div></article>`).join(''):'<p class="note">No skipped messages awaiting review.</p>'}</div>`;
}
export function setupGuide() {
  const url=location.origin+'/api/ingest?format=text';
  return `<div class="month"><h2>Set up capture</h2><a class="link" href="#settings">Back</a></div>
  <p class="guide-lead">Your phone sends a small event to your private ledger. No bank login. No Tailscale. No AI.</p>
  <div class="guide-choice"><button class="chip" data-action="guide-scroll" data-target="wallet-guide">Apple Pay</button><button class="chip" data-action="guide-scroll" data-target="tng-guide">TNG</button><button class="chip" data-action="guide-scroll" data-target="sms-guide">Bank SMS</button></div>
  <section class="guide-block"><h3>Before you start</h3><ol><li>In Safari, Share → <b>Add to Home Screen</b> for the app. Open it and sign in.</li><li>Go to <a href="#settings">Settings → Upload keys</a>. Create a key for this shortcut and save its <b>Bearer …</b> value in your password manager.</li><li>Open <b>Shortcuts</b> on your iPhone. Create a shortcut for one source below, then attach its automation. Labels and available triggers vary by iOS version.</li></ol><p class="callout">Variables are blue pills, not typed labels. Never paste “Amount” as the amount. Only field names, type values, URL and headers are literal text.</p></section>
  <section class="guide-block"><h3>Every shortcut: shared upload steps</h3><ol><li>Add <b>Generate UUID</b>. Keep this event ID unchanged for any retry.</li><li>Add <b>Current Date</b>; format it as <b>ISO 8601</b>, including time and timezone.</li><li>Add <b>Get Contents of URL</b>: Method <b>POST</b>; Request Body <b>JSON</b>. Add the fields shown for your source below. Field names are text; changing values must be actual variables. The JSON mode handles quotes and newlines safely.</li><li>Add both headers below. For the request values, insert the same UUID and date outputs generated above. <b>This basic setup needs internet and does not automatically retry.</b></li><li>Advanced optional archive: before upload, save the same event (with the same ID) as one JSON line per event in a private per-source file. Dictionary-to-text compact JSON serialization still needs checking on your actual iPhone; do not rely on a pasted JSON template or an untested archive. See the full guide for this limitation.</li><li>Optional: add <b>If</b> Contents of URL <b>begins with</b> <code>Logged</code> → <b>Show Notification</b> Contents of URL → End If. This hides skipped/duplicate replies without filtering unrelated error text by one letter. Upload errors may still appear as Shortcuts errors.</li></ol>
  <p>Upload URL</p>${copybox(url,'upload URL')}<p>Header name</p>${copybox('Authorization','Authorization header name')}<p>Header value: paste your full <b>Bearer …</b> key from Settings. Do not paste it into the URL.</p>${copybox('Content-Type','Content-Type header name')}${copybox('application/json','Content-Type value')}
  <p class="note">Use the supported JSON request-body fields for initial setup. Test the received entry before relying on background capture. The illustrated guide explains each variable and the optional archive limitations.</p></section>
  ${sourceGuide('wallet-guide','Apple Pay','applepay',[
    ['event_id','Generate UUID output'],['type','applepay (literal)'],['at','Current Date, ISO 8601'],['amount','Transaction → Amount'],['merchant','Transaction → Merchant'],['name','Transaction → Name'],['card','Transaction → Card or Pass']
  ],'Use a Wallet / Transaction automation: “When I tap a Wallet Card or Pass”. Select only payment cards; leave BYD/car keys and access passes unselected. Choose Run Immediately where available. New cards must be added to this selection later. In-app/online Apple Pay and Apple Watch taps may not trigger it. A bank may omit the amount — Tally will ask you to add it.')}
  ${sourceGuide('tng-guide','TNG notifications','notification',[
    ['event_id','Generate UUID output'],['type','notification (literal)'],['at','Current Date, ISO 8601'],['title','Notification trigger → Title'],['body','Notification trigger → Body']
  ],'Only if your iOS version exposes a Notification automation trigger: select Touch ’n Go eWallet and pass its Title and Body. If the trigger is absent, this capture path is not available on that phone; use manual entry. Payments matching supported text are logged. Cash-in, refunds, rewards and ads are skipped, not used to reverse earlier expenses.')}
  ${sourceGuide('sms-guide','Alliance bank SMS','sms',[
    ['event_id','Generate UUID output'],['type','sms (literal)'],['at','Current Date, ISO 8601'],['text','Shortcut Input → message body']
  ],'Create a Message automation with Message Contains “charged”, then run this shortcut and pass the Message as Shortcut Input. Do not type the phrase “Shortcut Input” into the Dictionary. Do not forward OTPs or every personal message. Alliance “charged for MYR … at …” texts are supported; this is not a universal parser for every bank. Other formats may be skipped.')}
  <section class="guide-block"><h3>Check it works</h3><ol><li>Do a connection-only test: a fresh UUID, type <code>notification</code>, a current <code>at</code>, title <code>Tally setup test</code>, body <code>Connection test only — no purchase</code>. The reply should begin with <b>Skipped</b>; the ledger total must not change.</li><li>Check Settings → Last received and Skipped notifications. This proves the URL/key worked, not that the real phone trigger is wired correctly.</li><li>Wait for your next real payment. Check merchant, amount, date and category before relying on the automation.</li></ol><h3>If an upload fails</h3><p>The event stays in your phone archive only if you added the archive step. <b>It does not retry itself.</b> Open Settings → Recover shortcut archive and choose the .jsonl file. Tally uploads it in bounded batches; already-received IDs are safe to resend. Keep the archive until recovery completes. Split/rotate large files after verifying a successful import. Separate source files reduce simultaneous-write conflicts but do not guarantee conflict-free iCloud writes.</p><h3>Important limits</h3><p>Expenses only, MYR and Malaysia time. No bank balance sync. Foreign-currency taps need manual MYR confirmation. Refunds do not automatically cancel a previous purchase. iOS system automation banners are separate from Tally’s Show Notification action.</p><a class="btn ghost" href="/guide.html">Open full illustrated guide</a></section>`;
}
function sourceGuide(id,title,type,fields,text) {
  return `<section class="guide-block" id="${id}"><h3>${title}</h3><p>${text}</p><div class="field-spec">${fields.map(([k,v])=>`<div><code>${k}</code><span>${esc(v)}</span></div>`).join('')}</div><p class="note">Keep type exactly <code>${type}</code>. Create the dictionary once per event, before both archive and upload.</p></section>`;
}
export function cloudActions(S,{api,toast,render,refresh,copy,logout}) {
  return {
    'guide-scroll':el=>document.getElementById(el.dataset.target)?.scrollIntoView({behavior:'smooth'}),
    logout:()=>logout().catch(e=>toast(e.message)),
    'token-create':async el=>{
      const label=document.querySelector('#token-label').value.trim(); if(!label) return toast('Give this key a label');
      el.disabled=true;
      try {const r=await api('POST','/api/tokens',{label}); S.newToken=r.token; S.tokens=(await api('GET','/api/tokens')).tokens; render();}
      catch(e) {toast(e.message);el.disabled=false;}
    },
    'token-revoke':async el=>{
      if(!confirm('Revoke this key? Its shortcut will stop uploading until you replace the key.')) return;
      try {await api('POST',`/api/tokens/${el.dataset.id}/revoke`,{}); S.newToken=null; S.tokens=(await api('GET','/api/tokens')).tokens; render();toast('Key revoked');} catch(e){toast(e.message);}
    },
    'token-hide':()=>{S.newToken=null;render();},
    recover:()=>document.querySelector('#recover-file').click(),
    'password-change':async el=>{
      const old_password=document.querySelector('#old-password').value,new_password=document.querySelector('#new-password').value;
      if(new_password.length<12) return toast('Use at least 12 characters'); el.disabled=true;
      try{await api('POST','/api/auth/password',{old_password,new_password});render();toast('Password changed');}catch(e){toast(e.message);el.disabled=false;}
    },
    'skipped-load':async()=>{try{const r=await api('GET','/api/skipped');S.skipped=r.entries||r.skipped||[];render();}catch(e){toast(e.message);}},
    'skipped-dismiss':async el=>{try{await api('POST',`/api/skipped/${el.dataset.id}/dismiss`,{});S.skipped=(S.skipped||[]).filter(x=>String(x.id)!==el.dataset.id);await refresh();}catch(e){toast(e.message);}},
    'skipped-add':async el=>{try{
      const row=[...(S.skipped||[]),...(S.missed||[])].find(x=>String(x.id)===el.dataset.id);if(!row)return;
      const amount=prompt('Confirm the actual spending amount in MYR',row.amount_cents?(row.amount_cents/100).toFixed(2):'');if(amount===null)return;
      const merchant=prompt('Merchant name (check the original message)',row.title||'');if(merchant===null)return;
      await api('POST',`/api/skipped/${el.dataset.id}/add`,{amount,merchant,category:'other'});S.skipped=(S.skipped||[]).filter(x=>String(x.id)!==el.dataset.id);await refresh();toast('Added for review — check category');
    }catch(e){toast(e.message);}}
  };
}
export async function recoverArchive(file,{toast,refresh}) {
  if(!file)return;
  if(file.size>5*1024*1024)return toast('Choose an archive under 5 MB; split larger files first');
  if(!confirm('Import this shortcut archive? Stored event IDs prevent repeated entries. This may add real spending.'))return;
  try{
    const lines=(await file.text()).split(/\r?\n/).filter(x=>x.trim());
    const events=lines.map((l,i)=>{try{const e=JSON.parse(l);if(!e.event_id)throw Error();return e;}catch{throw Error(`Line ${i+1} is not a JSON event with event_id. Nothing uploaded.`);}});
    let done=0, accepted=0, ignored=0;
    for(let i=0;i<events.length;) {
      const batch=[];let bytes=0;
      while(i<events.length&&batch.length<10) {const line=JSON.stringify(events[i]),n=new TextEncoder().encode(line+'\n').length;if(n>60000)throw Error(`Event ${i+1} is too large`);if(bytes+n>60000)break;batch.push(line);bytes+=n;i++;}
      const r=await fetch('/api/ingest',{method:'POST',headers:{'Content-Type':'application/x-ndjson','X-Tally-Request':'1'},body:batch.join('\n')});
      const d=await r.json();if(!r.ok)throw Error(`${done} processed before stop: ${d.error||r.status}. Keep your archive and retry.`);
      accepted+=d.accepted||0;ignored+=d.ignored||0;done+=batch.length;
      if(d.invalid)throw Error(`${done} processed, but ${d.invalid} events could not be read. Keep the archive and inspect it.`);
      toast(`Recovering ${done} / ${events.length}…`);
    }
    await refresh();toast(`Recovery complete: ${accepted} logged, ${ignored} skipped; others already received`);
  }catch(e){toast(e.message);}
}
