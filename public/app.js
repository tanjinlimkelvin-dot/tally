// Rendering note: views build HTML strings; every user/server string passes through V.esc(), and CSP forbids inline script.
import * as C from './core.js';
import * as V from './views.js';
import { icon } from './icons.js';
import { logout } from './auth.js';
import { cloudSettings, setupGuide, cloudActions, recoverArchive } from './cloud.js';

const $ = s => document.querySelector(s);
const view = $('#view');
const LS = { state: 'tally:state:v1', outbox: 'tally:outbox:v1' };
const S = { entries: [], server: [], categories: [], labels: {}, month: C.todayKey().slice(0, 7), filter: 'all', q: '',
  statsKind: 'expense', ingest: {}, quick: [], online: true, loaded: false, error: '', budgets: {},
  tokens: null, newToken: null };
let cached = read(LS.state, null);
let outbox = read(LS.outbox, []);
let draft = null, lastFocus = null, busy = false;

function read(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }
function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode / quota */ } }

class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
async function api(method, path, body) {
  let res;
  try {
    res = await fetch(path, { method, cache: 'no-store', credentials: 'same-origin',
      headers: { 'X-Tally-Request': '1', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined });
  } catch { throw new ApiError(0, 'Can’t reach Tally — check your internet connection'); }
  if (res.status === 401) { location.reload(); throw new ApiError(401, 'Please sign in again'); }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) throw new ApiError(res.status, data?.error || `Something went wrong (${res.status})`);
  return data;
}
const offlineish = e => e.status === 0 || e.status === 401 || e.status >= 500;
// ---------- state
function apply(st) {
  cached = st;
  S.server = st.entries; S.categories = st.categories; S.recurring = st.recurring || []; S.ignoredTaps = st.ignored_taps || []; S.ingest = st.ingest || {}; S.missed = st.missed || []; S.budgets = st.budgets || {};
  setCats(st.categories, st.removed_categories);
  recompute();
}
function setCats(cats, removed) {
  S.categories = cats; S.removedCats = removed || [];
  S.labels = Object.fromEntries(cats.map(c => [c.key, c.label]));
  S.catMap = Object.fromEntries(cats.map(c => [c.key, c]));
  S.excluded = new Set(cats.filter(c => c.excluded).map(c => c.key));
  if (cached) { cached.categories = cats; cached.removed_categories = S.removedCats; write(LS.state, cached); }
}
function recompute() {
  outbox = outbox.filter(p => !S.server.some(e => e.client_id === p.client_id));
  write(LS.outbox, outbox);
  S.entries = C.mergePending(S.server, outbox);
  S.quick = C.frequentMerchants(S.entries);
}
function upsert(entry) {
  if (S.trash) S.trash = null;   // reloaded next time Trash opens
  S.server = S.server.filter(e => e.id !== entry.id);
  if (!entry.deleted_at) S.server.push(entry);
  S.server.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.id - a.id);
  if (cached) { cached.entries = S.server; write(LS.state, cached); }
  recompute();
}
const toCreate = p => ({ client_id: p.client_id, amount: (p.amount_cents / 100).toFixed(2), kind: p.kind, category: p.category,
  merchant: p.merchant, note: p.note, occurred_at: p.occurred_at });

async function flush() {
  for (const p of [...outbox]) {
    try {
      const r = await api('POST', '/api/entries', toCreate(p));
      outbox = outbox.filter(x => x.client_id !== p.client_id); upsert(r.entry);
    } catch (e) {
      if (offlineish(e)) throw e;
      outbox = outbox.filter(x => x.client_id !== p.client_id); recompute();
      toast(`An offline entry couldn’t be saved: ${e.message}`);
    }
  }
}
async function refresh({ loud = false } = {}) {
  try {
    await flush();
    const st = await api('GET', '/api/state');
    write(LS.state, st); apply(st); S.online = true; S.error = '';
    if (loud) toast('Synced');
  } catch (e) {
    S.online = false; S.error = e.message;
    if (loud) toast(e.message);
  }
  if (!S.online && !cached && S.error.includes('401')) location.reload();
  S.loaded = S.loaded || !!cached;
  if (!draft) render();
  syncBadge();
}

// ---------- render
const VIEWS = { home: V.home, list: V.list, stats: V.stats, settings: cloudSettings, setup: setupGuide, inbox: V.inbox, trash: V.trash };
const TABS = { home: ['home', 'Overview'], list: ['list', 'Activity'], stats: ['chart', 'Stats'], settings: ['settings', 'Settings'] };
const tab = () => { const t = location.hash.slice(1); return VIEWS[t] ? t : 'home'; };

function render() {
  const t = tab();
  const navT = t === 'setup' || t === 'trash' ? 'settings' : t === 'inbox' ? 'home' : t;
  document.querySelectorAll('.tabs a').forEach(a => a.dataset.tab === navT ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  if (!S.loaded) {
    view.innerHTML = S.error
      ? `<div class="empty">${icon('offline')}<h3>Can’t reach Tally</h3><p>${V.esc(S.error)}</p><button type="button" class="btn primary" data-action="sync">${icon('refresh')}Retry</button></div>`
      : `<div class="empty"><p>Loading…</p></div>`;
    return;
  }
  view.innerHTML = VIEWS[t](S);
  V.applyMetrics(view);
  if (t === 'settings') loadTokens();
  if (t === 'trash' && !S.trashLoading && !S.trash) loadTrash();

}
function renderListBody() {
  const b = $('#list-body');
  if (!b) return render();
  b.innerHTML = V.listBody(S); V.applyMetrics(b);
}
function syncBadge() {
  const el = $('#sync'), n = outbox.length;
  if (!S.online) {
    el.className = 'sync warn';
    el.innerHTML = `<span class="dot"></span>${n ? `Offline · ${n} pending` : 'Offline'}<button type="button" data-action="sync">Retry</button>`;
  } else if (n) {
    el.className = 'sync warn'; el.innerHTML = `<span class="dot"></span>${n} pending`;
  } else {
    el.className = 'sync'; el.innerHTML = S.loaded ? '<span class="dot"></span>Synced' : '';
  }
}

let toastTimer;
function toast(msg, opt = {}) {
  const t = $('#toast'); clearTimeout(toastTimer);
  t.innerHTML = `<span>${V.esc(msg)}</span>${opt.action ? `<button type="button">${icon('undo')}${V.esc(opt.action)}</button>` : ''}`;
  t.hidden = false;
  if (opt.action) t.querySelector('button').onclick = () => { t.hidden = true; opt.run(); };
  toastTimer = setTimeout(() => { t.hidden = true; }, opt.action ? 5000 : 2600);
}

// ---------- sheet
const newDraft = () => ({ mode: 'new', kind: 'expense', category: S.catMap.food ? 'food' : (S.categories[0] || {}).key || 'other', amount: '', merchant: '', note: '',
  when: C.nowLocalIso().slice(0, 16), catTouched: false });
const editDraft = e => ({ mode: 'edit', entry: e, kind: e.kind, category: e.category,
  amount: e.amount_cents ? C.centsToInput(e.amount_cents) : '', fresh: true, merchant: e.merchant,
  note: e.needs_review ? '' : e.note, when: e.occurred_at.slice(0, 16), catTouched: true });

function paintSheet() {
  const sh = $('#sheet');
  sh.innerHTML = V.sheet(S, draft); if (draft.mode !== 'cat' && draft.mode !== 'rec') paintAmount();
  const g = $('#cat-grid.paged'), on = g && g.querySelector('[aria-pressed="true"]');
  if (on) g.scrollLeft = on.closest('.cat-page').offsetLeft - g.offsetLeft;   // open on the selected category's page
}
function openSheet(d) {
  draft = d; busy = false; lastFocus = document.activeElement;
  clearTimeout(toastTimer); $('#toast').hidden = true; // a toast never sits over the sheet
  const sh = $('#sheet');
  paintSheet(); sh.classList.remove('closing'); sh.hidden = false; $('#scrim').hidden = false;
  document.body.style.overflow = 'hidden'; document.body.classList.add('sheet-open');
  if (d.mode === 'rec' && !d.id) $('#r-merchant').focus();
  else if (d.mode === 'cat' && !d.key) $('#c-label').focus(); else sh.querySelector('[data-action="close"]').focus({ preventScroll: true });
}
function closeSheet() {
  if (!draft) return;
  const sh = $('#sheet'); draft = null;
  sh.classList.add('closing'); $('#scrim').hidden = true; document.body.style.overflow = ''; document.body.classList.remove('sheet-open');
  setTimeout(() => { if (!draft) { sh.hidden = true; sh.innerHTML = ''; } }, 200);
  render();
  (lastFocus && document.contains(lastFocus) ? lastFocus : $('#fab')).focus({ preventScroll: true });
}
function paintAmount() {
  const out = $('#amt'); if (!out) return;
  const a = draft.amount, [i, f] = a.split('.');
  out.textContent = a ? Number(i || 0).toLocaleString('en-MY') + (f !== undefined ? '.' + f : '') : '0.00';
  out.classList.toggle('placeholder', !a);
  const save = $('#save'); if (save) save.disabled = busy || !C.toCents(a);
}
function readFields() {
  if (!draft) return;
  draft.merchant = $('#f-merchant')?.value.trim() ?? draft.merchant;
  draft.note = $('#f-note')?.value.trim() ?? draft.note;
  draft.when = $('#f-when')?.value || draft.when;
}
function pickCat(c) {
  draft.category = c;
  document.querySelectorAll('#cat-grid button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.c === c)));
}
function press(key) {
  if (!draft || draft.mode === 'cat' || draft.mode === 'rec') return;
  if (draft.fresh && /^[\d.]$|^00$/.test(key)) { draft.amount = ''; }
  draft.fresh = false;
  draft.amount = key === '00' ? C.keypad(C.keypad(draft.amount, '0'), '0') : C.keypad(draft.amount, key);
  if (draft.amount === '0' && key === '00') draft.amount = '0';
  paintAmount();
}

async function save() {
  if (!draft || busy) return;
  if (draft.mode === 'cat') return saveCat();
  if (draft.mode === 'rec') return saveRec();
  readFields();
  const cents = C.toCents(draft.amount);
  if (!cents) return toast('Enter an amount first');
  if (draft.when && draft.when > C.nowLocalIso().slice(0, 16) && draft.when.slice(0, 10) > C.todayKey()) return toast('The date can’t be in the future');
  const occurred_at = draft.when ? `${draft.when}:00+08:00` : C.nowLocalIso();
  const label = S.labels[draft.category] || '';
  if (draft.mode === 'new') {
    const p = { client_id: C.uid(), occurred_at, amount_cents: cents, kind: draft.kind, category: draft.category,
      merchant: draft.merchant, note: draft.note, card: '', source: 'manual', needs_review: 0, id: null };
    outbox.push(p); write(LS.outbox, outbox); recompute(); closeSheet();
    try {
      await flush(); S.online = true;
      const e = S.server.find(x => x.client_id === p.client_id);
      toast(`Logged ${C.fmt(cents)} · ${draft?.merchant || p.merchant || label}`, e ? { action: 'Undo', run: () => remove(e, { quiet: true }) } : {});
    } catch {
      S.online = false; toast('Saved on this phone — will sync when online');
    }
    render(); syncBadge();
    return;
  }
  const e = draft.entry, changes = {};
  if (cents !== e.amount_cents) changes.amount = (cents / 100).toFixed(2);
  if (draft.kind !== e.kind) changes.kind = draft.kind;
  if (draft.category !== e.category) changes.category = draft.category;
  if (draft.merchant !== e.merchant) changes.merchant = draft.merchant;
  if (e.needs_review || draft.note !== e.note) changes.note = draft.note;
  if (draft.when !== e.occurred_at.slice(0, 16)) changes.occurred_at = occurred_at;
  if (!Object.keys(changes).length && !e.needs_review && !draft.fromCard) return closeSheet();
  busy = true; paintAmount();
  try {
    const r = await api(e.needs_review ? 'POST' : 'PATCH', `/api/entries/${e.id}${e.needs_review ? '/confirm' : ''}`, { version: e.version, changes });
    upsert(r.entry);
    closeSheet(); toast(e.needs_review ? 'Confirmed' : 'Saved');
  } catch (err) {
    busy = false; paintAmount(); toast(err.message);
    if (err.status === 409) { closeSheet(); await refresh(); }
  }
}

async function remove(e, { quiet = false } = {}) {
  if (!e.id) { // never synced: just drop it locally
    outbox = outbox.filter(p => p.client_id !== e.client_id); write(LS.outbox, outbox); recompute();
    closeSheet(); syncBadge(); return toast('Deleted');
  }
  try {
    const r = await api('POST', `/api/entries/${e.id}/delete`, { version: e.version });
    upsert(r.entry); closeSheet();
    toast(quiet ? 'Undone' : 'Deleted', quiet ? {} : { action: 'Undo', run: () => restore(r.entry) });
  } catch (err) { toast(err.message); if (err.status === 409) refresh(); }
}
async function restore(e) {
  try { const r = await api('POST', `/api/entries/${e.id}/restore`, { version: e.version }); upsert(r.entry); render(); toast('Restored'); }
  catch (err) { toast(err.message); }
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); }
  catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text }); document.body.append(ta);
    ta.select(); document.execCommand('copy'); ta.remove(); toast('Copied');
  }
}

// ---------- categories
const firstEmoji = v => { const seg = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(v.trim())]; return seg.length ? seg[0].segment : ''; };
const catDraft = c => ({ mode: 'cat', key: c ? c.key : '', label: c ? c.label : '', emoji: c ? c.emoji : '', excluded: !!(c && c.excluded) });
function readCat() { if (draft?.mode === 'cat') { draft.label = $('#c-label').value; draft.emoji = firstEmoji($('#c-emoji').value); } }
async function catCall(path, body, msg) {
  busy = true;
  try {
    const r = await api('POST', path, body);
    setCats(r.categories, r.removed_categories); toast(typeof msg === 'function' ? msg(r) : msg);
    return r;
  } catch (err) { toast(err.message); return null; }
  finally { busy = false; }
}
async function saveCat() {
  readCat();
  if (!draft.label.trim()) { $('#c-label').focus(); return toast('Give the category a name'); }
  const was = !!(S.catMap[draft.key] || {}).excluded, ex = !!draft.excluded;
  const msg = draft.key ? (was !== ex ? (ex ? `${draft.label.trim()} no longer counts in totals` : `${draft.label.trim()} counts in totals again`) : 'Category saved') : `Added ${draft.label.trim()}`;
  const r = await catCall('/api/categories', { key: draft.key || undefined, label: draft.label, emoji: draft.emoji, excluded: ex }, msg);
  if (r) closeSheet();
}
async function deleteCat() {
  const c = S.catMap[draft.key]; if (!c) return;
  const n = S.entries.filter(e => e.category === c.key).length;
  if (!confirm(`Delete ${c.label}?${n ? ` Its ${n} ${n === 1 ? 'entry moves' : 'entries move'} to Other.` : ''}${S.budgets[c.key] ? ' Its budget is removed.' : ''}`)) return;
  const r = await catCall('/api/categories/delete', { key: c.key }, `Deleted ${c.label}`);
  if (r) { closeSheet(); await refresh(); }
}
async function moveCat(delta) {
  readCat();
  if (await catCall('/api/categories/move', { key: draft.key, delta }, 'Moved')) { paintSheet(); render(); }
}

// ---------- recurring
const recDraft = r => r
  ? { mode: 'rec', id: r.id, merchant: r.merchant, amount: C.centsToInput(r.amount_cents), category: S.catMap[r.category] ? r.category : 'other',
      every: r.every, start: r.start, until: r.until, note: r.note, paused: !!r.paused }
  : { mode: 'rec', id: 0, merchant: '', amount: '', category: S.catMap.bills ? 'bills' : 'other', every: 'month', start: C.todayKey(), until: '', note: '', paused: false };
function readRec() {
  if (draft?.mode !== 'rec') return;
  for (const f of ['merchant', 'amount', 'start', 'until', 'note']) { const el = $(`#r-${f}`); if (el) draft[f] = el.value.trim(); }
}
async function recCall(path, body) {
  busy = true;
  try {
    const r = await api('POST', path, body);
    S.recurring = r.recurring; if (cached) { cached.recurring = r.recurring; write(LS.state, cached); }
    if (r.posted) await refresh();
    return r;
  } catch (err) { toast(err.message); return null; }
  finally { busy = false; }
}
async function saveRec() {
  readRec();
  if (!draft.merchant) { $('#r-merchant').focus(); return toast('Give it a name, e.g. Car loan'); }
  if (!C.toCents(draft.amount)) { $('#r-amount').focus(); return toast('Enter the amount you pay each time'); }
  const d = draft, r = await recCall('/api/recurring', { id: d.id || undefined, merchant: d.merchant, amount: d.amount, category: d.category,
    every: d.every, start: d.start, until: d.until, note: d.note });
  if (!r) return;
  closeSheet();
  toast(r.posted ? `Added ${d.merchant} · logged ${r.posted} payment${r.posted > 1 ? 's' : ''}` : d.id ? 'Saved' : `Added ${d.merchant}`);
}

// ---------- events
async function loadTrash() {
  S.trashLoading = true;
  try { S.trash = (await api('GET', '/api/trash')).entries; } catch (err) { toast(err.message); S.trash = S.trash || []; }
  S.trashLoading = false; if (tab() === 'trash') render();
}
async function loadHistory() {
  const d = draft; if (!d || !d.entry || !d.entry.id) return;
  try { d.history = await api('GET', `/api/entries/${d.entry.id}/history`); }
  catch (err) { d.history = { events: [] }; toast(err.message); }
  if (draft === d && d.histOpen) { const h = $('#hist'); if (h) h.innerHTML = V.historyHTML(d.history); }
}
const findE = id => S.entries.find(e => String(e.id) === String(id));
async function merge(keepId, dropId) {
  const a = findE(keepId), b = findE(dropId); if (!a || !b) return refresh();
  try {
    const r = await api('POST', `/api/entries/${a.id}/merge`, { version: a.version, other: b.id, other_version: b.version });
    upsert(r.entry); upsert(r.merged); S.trash = null; render();
    toast('Kept one — the other is in Trash', { action: 'Undo', run: async () => {
      try { const x = await api('POST', `/api/entries/${b.id}/restore`, { version: r.merged.version }); upsert(x.entry); S.trash = null; render(); toast('Restored'); }
      catch (err) { toast(err.message); refresh(); } } });
  } catch (err) { toast(err.message); refresh(); }
}
async function bulk(action, list, msg) {
  if (!list.length) return;
  try {
    const r = await api('POST', '/api/inbox/bulk', { action, items: list.map(e => ({ id: e.id, version: e.version })) });
    r.entries.forEach(upsert); render();
    toast(r.errors.length ? `${r.entries.length} done · ${r.errors.length} skipped: ${r.errors[0].error}` : msg(r.entries.length));
    if (r.errors.length) refresh();
  } catch (err) { toast(err.message); refresh(); }
}

let budgetTimer;
async function saveBudget(input) {
  try {
    const r = await api('POST', '/api/budgets', { category: input.dataset.budget, amount: input.value.trim() });
    S.budgets = r.budgets; input.value = S.budgets[input.dataset.budget] ? C.centsToInput(S.budgets[input.dataset.budget]) : '';
    toast('Budget saved');
  } catch (err) { toast(err.message); }
}

const ACTIONS = {
  ...cloudActions(S, {api, toast, render, refresh, copy, logout}),
  'missed-add':el=>ACTIONS['skipped-add'](el),
  'missed-dismiss':el=>ACTIONS['skipped-dismiss'](el),
  add: () => openSheet(newDraft()),
  open: el => {
    const e = S.entries.find(x => String(x.id) === el.dataset.id && x.id != null);
    if (e) openSheet(editDraft(e)); else toast('Still syncing — you can edit it once it’s synced');
  },
  month: el => {
    const next = C.shiftMonth(S.month, +el.dataset.delta);
    if (next > C.todayKey().slice(0, 7)) return;
    S.month = next; tab() === 'list' ? renderListBody() : render();
  },
  'pick-month': el => { S.month = el.dataset.m; render(); },
  filter: el => { S.filter = el.dataset.f; S.q = ''; if (el.tagName !== 'A') renderListBody(); },
  'stats-kind': el => { S.statsKind = el.dataset.k; render(); },
  sync: () => refresh({ loud: true }),
  copy: el => copy(el.dataset.copy),
  close: () => closeSheet(),
  cat: el => { draft.catTouched = true; pickCat(el.dataset.c); },
  quick: el => { $('#f-merchant').value = el.dataset.m; draft.merchant = el.dataset.m; pickCat(el.dataset.c); },
  save: () => save(),
  merge: el => merge(el.dataset.keep, el.dataset.drop),
  'ib-confirm': el => { const e = findE(el.dataset.id); if (e) bulk('confirm', [e], () => 'Kept both'); },
  'ib-confirm-all': () => bulk('confirm', C.inboxGroups(S.entries).check, n => `${n} confirmed`),
  'trash-restore': async el => {
    const e = (S.trash || []).find(x => String(x.id) === el.dataset.id); if (!e) return;
    try { const r = await api('POST', `/api/entries/${e.id}/restore`, { version: e.version }); upsert(r.entry); await loadTrash(); toast(`Restored ${e.merchant || 'entry'}`); }
    catch (err) { toast(err.message); loadTrash(); }
  },
  'cat-new': () => openSheet(catDraft(null)),
  'rec-new': () => openSheet(recDraft(null)),
  'rec-edit': el => { const r = (S.recurring || []).find(x => String(x.id) === el.dataset.id); if (r) openSheet(recDraft(r)); },
  'rec-every': el => { readRec(); draft.every = el.dataset.v; paintSheet(); },
  'rec-pause': async () => {
    if (busy) return; const d = draft;
    if (await recCall('/api/recurring/pause', { id: d.id, paused: !d.paused })) { closeSheet(); toast(d.paused ? `${d.merchant} resumed` : `${d.merchant} paused`); }
  },
  'rec-delete': async () => {
    if (busy) return; const d = draft;
    if (!confirm(`Stop ${d.merchant}? Nothing more will be logged. Payments already logged stay in Tally.`)) return;
    if (await recCall('/api/recurring/delete', { id: d.id })) { closeSheet(); toast(`Stopped ${d.merchant}`); }
  },
  'cat-edit': el => { const c = S.catMap[el.dataset.c]; if (c) openSheet(catDraft(c)); },
  'cat-restore': el => catCall('/api/categories/restore', { key: el.dataset.c }, r => `${S.labels[el.dataset.c] || 'Category'} is back`).then(() => render()),
  'cat-delete': () => !busy && deleteCat(),
  'cat-move': el => !busy && moveCat(+el.dataset.delta),
  emoji: el => { readCat(); draft.emoji = el.dataset.e; paintSheet(); },
  'cat-count': el => { draft.excluded = !draft.excluded; el.setAttribute('aria-checked', String(!draft.excluded)); },
  delete: () => draft && draft.entry && remove(draft.entry),
  'not-payment': async () => {
    const e = draft && draft.entry; if (!e || busy) return;
    try {
      const r = await api('POST', `/api/entries/${e.id}/not-payment`, { version: e.version });
      upsert(r.entry); closeSheet(); toast(`Removed · ${e.merchant} taps won’t be logged`); refresh();
    } catch (err) { toast(err.message); if (err.status === 409) refresh(); }
  },
  unignore: async el => {
    try { const r = await api('POST', '/api/ignored/remove', { key: el.dataset.k }); S.ignoredTaps = r.ignored_taps; render(); toast('Will be logged again'); }
    catch (err) { toast(err.message); }
  },
};

document.addEventListener('click', ev => {
  const key = ev.target.closest('[data-key]');
  if (key) return press(key.dataset.key);
  const el = ev.target.closest('[data-action]');
  if (el && ACTIONS[el.dataset.action]) {
    if (el.tagName === 'BUTTON') ev.preventDefault();
    ACTIONS[el.dataset.action](el);
  }
  const tabLink = ev.target.closest('.tabs a');
  if (tabLink && tabLink.dataset.tab === 'list' && tab() !== 'list') { S.filter = 'all'; S.q = ''; }
});
$('#fab').addEventListener('click', () => ACTIONS.add());
$('#scrim').addEventListener('click', closeSheet);
view.addEventListener('input', ev => { if (ev.target.id === 'q') { S.q = ev.target.value; renderListBody(); } });
view.addEventListener('change', ev => { if (ev.target.dataset.budget !== undefined) saveBudget(ev.target); });
$('#sheet').addEventListener('toggle', ev => {
  if (ev.target.id !== 'hist-box' || !draft) return;
  draft.histOpen = ev.target.open;
  if (draft.histOpen) { if (draft.history) $('#hist').innerHTML = V.historyHTML(draft.history); else { $('#hist').innerHTML = V.historyHTML(null); loadHistory(); } }
}, true);
$('#sheet').addEventListener('input', ev => {
  if (draft?.mode === 'rec' && ['r-start', 'r-until', 'r-amount'].includes(ev.target.id)) {   // live "logs N past payments" hint
    readRec();
    if (ev.target.id === 'r-until') { ev.target.classList.toggle('blank', !ev.target.value); $('#r-until-ph')?.toggleAttribute('hidden', !!ev.target.value); }
    const h = $('#r-hint'), fresh = document.createElement('div'); fresh.innerHTML = V.recSheet(S, draft);
    const nh = fresh.querySelector('#r-hint'); if (h && nh) h.innerHTML = nh.innerHTML;
    return;
  }
  if (ev.target.id === 'c-emoji') {                       // live preview of a typed emoji
    const e = firstEmoji(ev.target.value), pv = $('#c-preview');
    if (pv && e) pv.innerHTML = `<span class="emo">${V.esc(e)}</span>`;
    return;
  }
  if (ev.target.id !== 'f-merchant' || draft?.catTouched) return;
  const k = ev.target.value.trim().toUpperCase();
  const hit = k && S.entries.find(e => e.kind === draft.kind && (e.merchant || '').trim().toUpperCase() === k);
  if (hit) pickCat(hit.category);
});
document.addEventListener('keydown', ev => {
  if (!draft) return;
  if (ev.key === 'Escape') return closeSheet();
  const typing = ev.target.matches('input, textarea');
  if (ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); return save(); }
  if (typing) return;
  if (/^[\d.]$/.test(ev.key)) { ev.preventDefault(); press(ev.key); }
  else if (ev.key === 'Backspace') { ev.preventDefault(); press('back'); }
  else if (ev.key === 'Tab') { // keep focus inside the dialog
    const f = [...$('#sheet').querySelectorAll('button:not(:disabled), input')];
    const i = f.indexOf(document.activeElement);
    if (ev.shiftKey && i <= 0) { ev.preventDefault(); f.at(-1).focus(); }
    else if (!ev.shiftKey && i === f.length - 1) { ev.preventDefault(); f[0].focus(); }
  }
});
window.addEventListener('hashchange', () => { if (draft) closeSheet(); clearTimeout(toastTimer); $('#toast').hidden = true; render(); window.scrollTo(0, 0); view.focus({ preventScroll: true }); });
window.addEventListener('online', () => refresh());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });

let tokenLoad = false;
async function loadTokens() {
  if (S.tokens !== null || tokenLoad) return; tokenLoad = true;
  try { S.tokens = (await api('GET','/api/tokens')).tokens; } catch(e) { S.tokens=[]; toast(e.message); }
  tokenLoad=false; if(tab()==='settings') render();
}
document.getElementById('recover-file').addEventListener('change', e => recoverArchive(e.target.files[0], {toast,refresh}).finally(()=>e.target.value=''));

// ---------- boot
for (const a of document.querySelectorAll('.tabs a')) { const [ic, label] = TABS[a.dataset.tab]; a.innerHTML = `${icon(ic)}<span>${label}</span>`; }
$('#fab').innerHTML = icon('plus');
if (cached) { apply(cached); S.loaded = true; }
render(); syncBadge(); refresh();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
