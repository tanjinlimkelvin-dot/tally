import * as V from './views.js';
import * as C from './core.js';
import {icon} from './icons.js';
const esc=V.esc;
const copybox=(value,label)=>`<div class="copy-box"><code>${esc(value)}</code><button type="button" data-action="copy" data-copy="${esc(value)}" aria-label="Copy ${esc(label)}">${icon('copy')}</button></div>`;
export function cloudSettings(S) {
  const ing=S.ingest||{};
  return `<div class="month"><h2>Settings</h2><span class="cloud-mark">Cloud edition</span></div>
  <section class="section"><div class="section-h"><h2>Automatic capture</h2></div><div class="panel group">
    <a class="set-row" href="#setup">${icon('tap')}<span>Set up iPhone Shortcuts<span class="sub">Apple Pay and Touch 'n Go notifications</span></span>${icon('right')}</a>
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
  <p class="guide-lead">Automatically record expenses when you tap Apple Pay or receive Touch 'n Go notifications.</p>
  
  <div class="guide-choice">
    <button class="chip" data-action="guide-scroll" data-target="wallet-guide">💳 Apple Pay (3 Steps)</button>
    <button class="chip" data-action="guide-scroll" data-target="tng-guide">📱 Touch 'n Go</button>
  </div>

  <section class="guide-block" id="wallet-guide">
    <h3>⚡ Apple Pay 3-Step Setup</h3>
    
    <div class="panel group pad-note">
      <h4>Step 1: Create Automation in Shortcuts</h4>
      <img class="guide-img" src="/illustrations/step1-trigger.svg" alt="Step 1: Set up trigger" style="width:100%;height:auto;border-radius:12px;border:1px solid var(--line);margin:12px 0;">
      <ol>
        <li>Open <b>Shortcuts</b> app on iPhone → Tap <b>Automation</b> tab at bottom.</li>
        <li>Tap <b>＋</b> in top right → Select <b>Transaction</b> (credit card icon).</li>
        <li>Select your payment cards (untick car keys/passes) → Set <b>Run Immediately</b> → Tap Next → Choose <b>New Blank Automation</b>.</li>
      </ol>
    </div>

    <div class="panel group pad-note" style="margin-top:20px;">
      <h4>Step 2: Add Action — Get Contents of URL (POST)</h4>
      <img class="guide-img" src="/illustrations/step2-variables.svg" alt="Step 2: Right vs Wrong variables" style="width:100%;height:auto;border-radius:12px;border:1px solid var(--line);margin:12px 0;">
      <p class="callout" style="border-left:4px solid var(--yellow);background:var(--card);padding:10px 14px;border-radius:8px;font-size:14px;margin:12px 0;"><b>Crucial Tip:</b> Never manually type "Amount"! Tap the field and pick the <b>blue variable pill</b>: <code>Transaction ➔ Amount</code>.</p>
      
      <p><b>1. Copy your Ingest URL:</b></p>
      ${copybox(url,'upload URL')}
      
      <p><b>2. Set Method to POST &amp; add Headers:</b></p>
      ${copybox('Authorization','Authorization header name')}
      <p class="note">Value: paste your <b>Bearer &lt;token&gt;</b> key from Settings (keep a space after Bearer).</p>
      ${copybox('Content-Type','Content-Type header name')}
      ${copybox('application/json','Content-Type value')}

      <p><b>3. Set Request Body to JSON:</b></p>
      <div class="field-spec">
        <div><code>type</code><span><code>applepay</code> (typed text)</span></div>
        <div><code>amount</code><span><b>Transaction ➔ Amount</b> (blue pill)</span></div>
        <div><code>merchant</code><span><b>Transaction ➔ Merchant</b> (blue pill)</span></div>
      </div>
    </div>

    <div class="panel group pad-note" style="margin-top:20px;">
      <h4>Step 3: Add Action — Show Notification</h4>
      <img class="guide-img" src="/illustrations/step3-post-json.svg" alt="Step 3: Actions setup" style="width:100%;height:auto;border-radius:12px;border:1px solid var(--line);margin:12px 0;">
      <ol>
        <li>Search &amp; add <b>Show Notification</b> action.</li>
        <li>Set its message to <b>Contents of URL</b> (as Text).</li>
        <li>Done! Every tap pops up an instant confirmation banner: <code>Logged RM 12.50 · Tealive</code>.</li>
      </ol>
    </div>
  </section>

  <section class="guide-block" id="tng-guide">
    <h3>📱 Touch 'n Go eWallet (Notifications)</h3>
    <div class="panel group pad-note">
      <p>If your iOS version supports the <b>App / Notification</b> trigger:</p>
      <ol>
        <li>Create Automation → Choose <b>App / Notification</b> → Select <b>Touch 'n Go eWallet</b>.</li>
        <li>Add <b>Get Contents of URL</b> (POST) with the same URL &amp; Headers.</li>
        <li>JSON Fields:
          <div class="field-spec">
            <div><code>type</code><span><code>notification</code></span></div>
            <div><code>title</code><span><b>Notification ➔ Title</b> (variable)</span></div>
            <div><code>body</code><span><b>Notification ➔ Body</b> (variable)</span></div>
          </div>
        </li>
      </ol>
      <p class="note">Tally automatically extracts the merchant &amp; amount, and filters out top-ups (Cash-In) and ads.</p>
    </div>
    <div class="panel group pad-note" style="margin-top:16px;">
      <p class="note" style="margin:0;"><b>Want custom bank SMS or other apps?</b> Tally's ingest API accepts standard JSON. Ask your AI agent (ChatGPT, Claude, etc.) to configure a custom Shortcuts action for any notification format you want.</p>
    </div>
  </section>

  <section class="guide-block">
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center;">
      <a class="btn primary" href="/guide.html" target="_blank">Open Full Visual Guide Page ↗</a>
      <a class="link" href="#settings">Back to Settings</a>
    </div>
  </section>`;
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
