import { icon, hasIcon } from './icons.js';
import * as C from './core.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Heights/widths are data-* and applied through CSSOM so CSP can forbid inline styles. */
export function applyMetrics(root) {
  root.querySelectorAll('[data-h]').forEach(el => { el.style.height = el.dataset.h + '%'; });
  root.querySelectorAll('[data-w]').forEach(el => { el.style.width = el.dataset.w + '%'; });
  root.querySelectorAll('[data-l]').forEach(el => { el.style.left = el.dataset.l + '%'; });
}

export function relTime(iso, now = new Date()) {
  const mins = Math.round((now - new Date(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const today = C.todayKey(now), day = iso.slice(0, 10);
  const label = C.dayLabel(day, today);
  return (label === 'Today' || label === 'Yesterday') ? `${label} ${C.timeOf(iso)}` : label;
}

/** A category's mark: the user's emoji if he picked one, else the drawn icon (defaults) or a monogram (his own). */
export function catIc(S, key) {
  const c = (S.catMap || {})[key];
  if (c && c.emoji) return `<span class="emo" aria-hidden="true">${esc(c.emoji)}</span>`;
  if (!c || hasIcon(key)) return icon(key);
  return `<span class="mono-ic" aria-hidden="true">${esc(([...c.label][0] || '?').toUpperCase())}</span>`;
}

const signed = e => (C.fmt(-e.amount_cents));

export function rowHTML(e, S) {
  const label = S.labels[e.category] || 'Other';
  const bits = [`<span>${C.timeOf(e.occurred_at)}</span>`, `<span>${esc(label)}</span>`];
  if (e.pending) bits.push(`<span class="tag wait">${icon('clock')}Pending sync</span>`);
  if (e.needs_review) bits.push(`<span class="tag flag">${icon('alert')}Review</span>`);
  if (e.needs_review && e.suggestion) bits.push(`<span class="tag">→ ${esc(S.labels[e.suggestion.category] || '')}</span>`);
  else if (e.source === 'applepay') bits.push(`<span class="tag">${icon('tap')}Apple Pay</span>`);
  else if (e.source === 'tng') bits.push(`<span class="tag">${icon('tap')}TNG</span>`);
  else if (e.source === 'bank') bits.push(`<span class="tag">${icon('card')}Card</span>`);
  else if (e.source === 'statement') bits.push(`<span class="tag">${icon('card')}Statement</span>`);
  else if (e.source === 'recurring') bits.push(`<span class="tag">${icon('repeat')}Recurring</span>`);
  if (S.excluded && S.excluded.has(e.category)) bits.push(`<span class="tag">Not counted</span>`);
  if (e.note && !e.needs_review && !(e.source === 'statement' && /^Added from /.test(e.note))) bits.push(`<span class="nt">${esc(e.note)}</span>`);
  const amt = e.amount_cents === 0 ? '<span class="a missing">Add amount</span>'
    : `<span class="a${''}">${signed(e)}</span>`;
  return `<button type="button" class="row${e.pending ? ' pending' : ''}" data-action="open" data-id="${e.id ?? ''}">
    <span class="ic">${catIc(S, e.category)}</span>
    <span class="t"><span class="m">${esc(e.merchant || label)}</span><span class="s">${bits.join('')}</span></span>${amt}</button>`;
}

function daysHTML(entries, S, today) {
  return C.groupByDay(entries).map(g => `<section class="day">
    <div class="day-h"><b>${C.dayLabel(g.day, today)}</b><span class="num">${g.spend ? C.fmt(g.spend) : ''}</span></div>
    <div class="panel rows">${g.entries.map(e => rowHTML(e, S)).join('')}</div></section>`).join('');
}

function monthHead(S, today, title) {
  return `<div class="month"><h2>${title ?? C.monthLabel(S.month, today)}</h2><div class="nav">
    <button type="button" class="icon-btn" data-action="month" data-delta="-1" aria-label="Previous month">${icon('left')}</button>
    <button type="button" class="icon-btn" data-action="month" data-delta="1" aria-label="Next month"${S.month >= today.slice(0, 7) ? ' disabled' : ''}>${icon('right')}</button></div></div>`;
}

function catRow(c, S) {
  return `<a class="cat-row" href="#list" data-action="filter" data-f="${c.category}">
    <span class="ic">${catIc(S, c.category)}</span>
    <span class="name">${esc(S.labels[c.category] || c.category)} <span class="pct">${Math.round(c.share * 100)}%</span></span>
    <span class="amt">${C.fmt(c.cents)}</span><span class="meter"><i data-w="${(c.share * 100).toFixed(1)}"></i></span></a>`;
}

// categories switched off "Count in totals": still listed, never added to the totals
function notCounted(S, entries) {
  const ex = C.byCategory(entries.filter(e => S.excluded && S.excluded.has(e.category)));
  return ex.length ? `<p class="note not-counted">Not counted in totals: ${ex.map(c => `${esc(S.labels[c.category] || c.category)} <b class="num">${C.fmt(c.cents)}</b>`).join(' · ')}</p>` : '';
}

function reviewCard(S) {
  const g = C.inboxGroups(S.entries), n = g.total + (S.missed || []).length;
  if (!n) return '';
  const bits = [g.missing.length && `${g.missing.length} missing an amount`, g.twins.length && `${g.twins.length} possible duplicate${g.twins.length > 1 ? 's' : ''}`,
    g.suggested.length && `${g.suggested.length} with a suggestion`, g.check.length && `${g.check.length} to check`, (S.missed || []).length && `${S.missed.length} possibly missed`].filter(Boolean);
  return `<a class="review" href="#inbox">${icon('alert')}
    <span><strong>${n} need${n === 1 ? 's' : ''} attention</strong><span>${bits.join(' · ')}</span></span>${icon('right', 'go')}</a>`;
}

function budgetRow(label, mark, spent, cap, dayN, days) {
  const pct = spent / cap, pace = dayN / days;
  // over = past 100%; ahead = spending faster than the calendar (past today's pace mark); else on track
  const cls = pct >= 1 ? 'over' : pct > pace + 0.05 ? 'ahead' : 'ok';
  const left = cap - spent;
  const status = pct >= 1 ? `${C.fmt(-left)} over` : cls === 'ahead' ? `${C.fmt(left)} left · ahead of pace` : `${C.fmt(left)} left`;
  return `<div class="bud-row ${cls}"><span class="ic">${mark}</span>
    <span class="bud-t"><span class="bud-top"><span class="bud-name">${esc(label)}</span><span class="num">${C.fmt(spent)} <small>/ ${C.fmtShort(cap)}</small></span></span>
      <span class="bud-meter"><i data-w="${Math.min(100, pct * 100).toFixed(1)}"></i><b data-l="${Math.min(100, pace * 100).toFixed(1)}"></b></span>
      <small class="bud-status">${status}</small></span></div>`;
}

function budgetCard(S, month, dayN) {
  const b = S.budgets || {}, keys = Object.keys(b);
  if (!keys.length) return '';
  const spentBy = {}; for (const e of month) spentBy[e.category] = (spentBy[e.category] || 0) + e.amount_cents;
  const total = Object.entries(spentBy).reduce((a, [k, x]) => a + (S.excluded && S.excluded.has(k) ? 0 : x), 0), days = C.daysInMonth(S.month);
  const rows = [b._total ? budgetRow('Total', icon('chart'), total, b._total, dayN, days) : '',
    ...keys.filter(k => k !== '_total').sort((x, y) => (spentBy[y] || 0) / b[y] - (spentBy[x] || 0) / b[x])
      .map(k => budgetRow(S.labels[k] || k, catIc(S, k), spentBy[k] || 0, b[k], dayN, days))].join('');
  return `<section class="section"><div class="section-h"><h2>Budget</h2><a class="more" href="#settings">Edit${icon('right')}</a></div>
    <div class="panel budgets"><p class="bud-key"><b></b>Mark = where spending should be by today</p>${rows}</div></section>`;
}

function missedCard(S) {
  if (!S.missed || !S.missed.length) return '';
  const rows = S.missed.slice(0, 5).map(m => `<div class="missed-row">
      <div class="missed-t"><b>${C.fmt(m.amount_cents)}</b><span class="msg">${esc(m.body || m.title)}</span>
        <small>${C.dayLabel(m.occurred_at.slice(0, 10), C.todayKey())} ${C.timeOf(m.occurred_at)} · ${esc(m.title)}</small></div>
      <div class="missed-a"><button type="button" class="btn primary sm" data-action="missed-add" data-id="${m.id}">Add as spending</button>
        <button type="button" class="btn ghost sm" data-action="missed-dismiss" data-id="${m.id}">Not a payment</button></div></div>`).join('');
  return `<section class="section"><div class="section-h"><h2>Possibly missed</h2></div>
    <div class="panel missed"><p class="missed-lead">These notifications were not recognized automatically. Check the message before adding any spending.</p>${rows}</div></section>`;
}

export function home(S) {
  const today = C.todayKey(), cur = today.slice(0, 7), key = S.month;
  if (!S.entries.length) {
    return `<div class="empty">${icon('tap')}<h3>Start tracking</h3><p>Tap + to add your first expense. Once the Shortcut is set up, every Apple Pay tap is logged for you.</p>
      <div class="empty-actions"><button type="button" class="btn primary" data-action="add">${icon('plus')}Add expense</button>
      <a class="btn ghost" href="#settings">Set up Apple Pay logging</a></div></div>`;
  }
  const all = C.inMonth(S.entries, key), month = C.counted(all, S.excluded), t = C.totals(month), isCur = key === cur;
  const exCents = C.totals(all).spend - t.spend;
  const dayN = isCur ? +today.slice(8, 10) : C.daysInMonth(key);
  const series = C.dailySeries(month, key, dayN);
  const max = Math.max(1, ...series.map(d => d.cents));
  const prev = C.monthToDate(C.counted(S.entries, S.excluded), C.shiftMonth(key, -1), dayN);
  let delta = '';
  if (prev > 0 && t.spend > 0) {
    const p = Math.round((t.spend - prev) / prev * 100);
    delta = Math.abs(p) < 5 ? '<span class="delta">Same pace as last month</span>'
      : `<span class="delta ${p >= 15 ? 'up' : p <= -5 ? 'down' : ''}">${Math.abs(p)}% ${p > 0 ? 'more' : 'less'} than last month</span>`;
  }
  const bars = series.map(d => `<span class="${d.future ? 'future' : d.cents ? '' : 'zero'}${isCur && d.day === dayN ? ' today' : ''}" data-h="${d.future || !d.cents ? 3 : Math.max(5, d.cents / max * 100).toFixed(1)}"></span>`).join('');
  const cats = C.byCategory(month).slice(0, 5);
  const recent = [...all].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, 6);
  return `${monthHead(S, today)}
  <section class="panel hero" aria-label="${C.monthLabel(key, today)} overview">
    <div class="label">${exCents ? (isCur ? 'Day-to-day this month' : 'Day-to-day in ' + C.monthLabel(key, today)) : (isCur ? 'Spent this month' : 'Spent in ' + C.monthLabel(key, today))}</div>
    <div class="big"><small>RM</small>${C.fmt(t.spend, { symbol: false })}</div>
    <div class="facts"><span>Daily avg <b>${C.fmt(Math.round(t.spend / dayN))}</b></span>${delta}</div>
    ${exCents ? `<div class="split" aria-label="Totals"><span>Not counted <b>${C.fmt(exCents)}</b></span><span>All spending <b>${C.fmt(t.spend + exCents)}</b></span></div>` : ''}
    <div class="bars" aria-hidden="true">${bars}</div>
    <div class="bars-axis" aria-hidden="true">${series.map(d => `<span>${[1, 15, series.length].includes(d.day) ? String(d.day) : ''}</span>`).join('')}</div>
  </section>
  ${isCur ? budgetCard(S, month, dayN) : ''}
  ${reviewCard(S)}
  ${missedCard(S)}
  ${cats.length ? `<section class="section"><div class="section-h"><h2>Where it went</h2><a class="more" href="#stats">Stats${icon('right')}</a></div>
    <div class="panel cats">${cats.map(c => catRow(c, S)).join('')}</div>${notCounted(S, all)}</section>` : notCounted(S, all)}
  <section class="section"><div class="section-h"><h2>Recent</h2>${recent.length ? `<a class="more" href="#list">See all${icon('right')}</a>` : ''}</div>
    ${recent.length ? daysHTML(recent, S, today) : `<div class="panel empty"><p>${isCur ? 'Nothing logged this month yet' : 'Nothing logged this month'}</p></div>`}</section>`;
}

export function list(S) {
  return `<div class="searchbar"><label class="search">${icon('search')}<span class="sr">Search</span>
    <input id="q" type="search" enterkeyhint="search" placeholder="Search merchants, notes, amounts" value="${esc(S.q)}" autocomplete="off"></label></div>
    <div id="list-body">${listBody(S)}</div>`;
}

export function listBody(S) {
  const today = C.todayKey(), q = S.q.trim(), allTime = !!q || S.filter === 'review';
  let scope = allTime ? S.entries : C.inMonth(S.entries, S.month);
  if (S.filter === 'review') scope = scope.filter(e => e.needs_review);
  else if (S.filter !== 'all') scope = scope.filter(e => e.category === S.filter);
  const shown = scope.filter(e => C.matches(e, q, S.labels));
  const onlyEx = S.filter !== 'all' && S.filter !== 'review' && S.excluded && S.excluded.has(S.filter);
  const t = C.totals(onlyEx ? shown : C.counted(shown, S.excluded)), skipped = onlyEx ? 0 : shown.length - C.counted(shown, S.excluded).length;
  const reviewN = S.entries.filter(e => e.needs_review).length;
  const catKeys = C.byCategory(C.inMonth(S.entries, S.month)).map(c => c.category);
  if (!['all', 'review', ...catKeys].includes(S.filter)) catKeys.unshift(S.filter);
  const chip = (f, label, mark) => `<button type="button" class="chip" data-action="filter" data-f="${f}" aria-pressed="${S.filter === f}">${mark || ''}${label}</button>`;
  const chips = [chip('all', 'All'), reviewN ? chip('review', `Review ${reviewN}`, icon('alert')) : '', ...catKeys.map(c => chip(c, esc(S.labels[c] || c), catIc(S, c)))].join('');
  const head = allTime ? `<div class="month"><h2>${S.filter === 'review' ? 'To review' : 'Results'}</h2></div>` : monthHead(S, today);
  const body = shown.length ? daysHTML(shown, S, today)
    : `<div class="empty">${icon(q ? 'search' : S.filter === 'review' ? 'check' : 'list')}<h3>${q ? 'No matches' : S.filter === 'review' ? 'All caught up' : 'Nothing here'}</h3>
       <p>${q ? 'Try another word — amounts work too, e.g. 12.50' : S.filter === 'review' ? 'Apple Pay entries that need a look will show up here' : 'No entries in this category this month'}</p></div>`;
  return `${head}<div class="chips" role="group" aria-label="Filter">${chips}</div>
    <div class="list-sum"><span>${shown.length} ${shown.length === 1 ? 'entry' : 'entries'}</span><span class="num">${onlyEx ? 'Not counted · ' : ''}Spent ${C.fmt(t.spend)}${skipped ? `<small> excl. ${skipped} not counted</small>` : ''}</span></div>${body}`;
}

export function stats(S) {
  const today = C.todayKey(), kind = 'expense';
  const months = Array.from({ length: 6 }, (_, i) => C.shiftMonth(S.month, i - 5));
  const counted = C.counted(S.entries, S.excluded);
  const sums = months.map(m => C.inMonth(counted, m).filter(e => e.kind === kind).reduce((a, e) => a + e.amount_cents, 0));
  const max = Math.max(1, ...sums);
  const all = C.inMonth(S.entries, S.month).filter(e => e.kind === kind), month = C.counted(all, S.excluded);
  const dayN = S.month === today.slice(0, 7) ? +today.slice(8, 10) : C.daysInMonth(S.month);
  const total = sums[5], cats = C.byCategory(month, kind), merchants = kind === 'expense' ? C.topMerchants(month) : [];
  const word = kind === 'expense' ? 'spending' : 'income';
  const trend = months.map((m, i) => `<button type="button" data-action="pick-month" data-m="${m}" aria-pressed="${m === S.month}" aria-label="${C.monthLabel(m, today)} ${word} ${C.fmt(sums[i])}">
      <span class="v">${sums[i] ? C.fmtShort(sums[i]) : ''}</span><span class="track"><span class="bar" data-h="${sums[i] ? Math.max(4, sums[i] / max * 100).toFixed(1) : 2}"></span></span><span class="k">${C.monthShort(m)}</span></button>`).join('');
  return `${monthHead(S, today)}
  <section class="section panel trend"><div class="trend-bars">${trend}</div></section>
  <section class="section panel kv"><div><span>Total</span><b>${C.fmt(total)}</b></div><div><span>Daily avg</span><b>${C.fmt(Math.round(total / dayN))}</b></div><div><span>Entries</span><b>${month.length}</b></div></section>
  ${cats.length ? `<section class="section"><div class="section-h"><h2>By category</h2></div><div class="panel cats">${cats.map(c => catRow(c, S)).join('')}</div>${notCounted(S, all)}</section>`
    : all.length ? `<section class="section">${notCounted(S, all)}</section>` : `<div class="empty">${icon('chart')}<h3>No ${word} yet</h3><p>Nothing recorded for ${C.monthLabel(S.month, today)}.</p></div>`}
  ${merchants.length ? `<section class="section"><div class="section-h"><h2>Top merchants</h2></div><div class="panel merchants">${merchants.map((m, i) => `<div class="merchant">
      <span class="rank">${i + 1}</span><span class="nm">${esc(m.merchant)}<small>${m.count}×</small></span><span class="num">${C.fmt(m.cents)}</span></div>`).join('')}</div></section>` : ''}`;
}

// ---------- Review Inbox: everything waiting for a decision, grouped by what's needed
function inboxRow(e, S, extra = '') {
  return `<div class="ib-row">${rowHTML(e, S)}${extra}</div>`;
}
export function inbox(S) {
  const g = C.inboxGroups(S.entries), byId = Object.fromEntries(S.entries.map(e => [e.id, e]));
  const head = `<div class="month"><h2>Needs attention</h2></div>`;
  if (!g.total && !(S.missed || []).length) return head + `<div class="empty">${icon('check')}<h3>All caught up</h3><p>Anything logged automatically that needs a look shows up here.</p></div>`;
  const sec = (title, lead, body, bulk = '') => `<section class="section"><div class="section-h"><h2>${title}</h2>${bulk}</div>${lead ? `<p class="note ib-lead">${lead}</p>` : ''}<div class="panel rows ib">${body}</div></section>`;
  const twin = e => {
    const o = byId[e.twin]; if (!o) return '';
    return `<div class="twin">${icon('repeat')}<span>Same as <b>${esc(o.merchant || S.labels[o.category] || 'an entry')}</b> · <span class="nw">${C.fmt(o.amount_cents)} ·</span> <span class="nw">${C.dayLabel(o.occurred_at.slice(0, 10), C.todayKey())} ${C.timeOf(o.occurred_at)} ·</span> <span class="nw">${srcName(o)}</span></span></div>
      <div class="ib-a twin-a"><span class="lbl">Keep</span><button type="button" class="btn primary sm" data-action="merge" data-keep="${o.id}" data-drop="${e.id}">${esc(srcName(o))}</button>
      <button type="button" class="btn ghost sm" data-action="merge" data-keep="${e.id}" data-drop="${o.id}">${esc(srcName(e))}</button>
      <button type="button" class="btn ghost sm" data-action="ib-confirm" data-id="${e.id}">Both real</button></div>`;
  };
  return head + [
    g.missing.length && sec('Missing an amount', 'Your bank didn’t share it with Wallet. Tap to add it — or mark car keys and passes as “Not a payment”.', g.missing.map(e => inboxRow(e, S)).join('')),
    g.twins.length && sec('Possible duplicates', 'Same amount, close in time, from two places. Keep one — the other goes to Trash and can be restored.', g.twins.map(e => inboxRow(e, S, twin(e))).join('')),
    g.suggested.length && sec('Suggested category', '', g.suggested.map(e => inboxRow(e, S, `<div class="ib-a one"><button type="button" class="btn ghost sm" data-action="ib-accept" data-id="${e.id}">${catIc(S, e.suggestion.category)}Use ${esc(S.labels[e.suggestion.category] || e.suggestion.category)}</button></div>`)).join(''),
      g.suggested.length > 1 ? `<button type="button" class="more" data-action="ib-accept-all">Use all ${g.suggested.length}</button>` : ''),
    g.check.length && sec('Check and confirm', 'Logged automatically. Tap one to fix it, or confirm the lot if they look right.', g.check.map(e => inboxRow(e, S)).join(''),
      `<button type="button" class="more" data-action="ib-confirm-all">Confirm ${g.check.length > 1 ? `all ${g.check.length}` : ''}</button>`),
  ].filter(Boolean).join('') + missedCard(S);
}
const srcName = e => ({ applepay: 'Apple Pay', tng: 'TNG', bank: 'Card SMS', recurring: 'Recurring', statement: 'Statement' }[e.source] || 'Manual');

export function trash(S) {
  const T = S.trash;
  const head = `<div class="month"><h2>Trash</h2></div><p class="note recon-lead">Deleted entries are kept here and can be put back. They aren’t counted anywhere.</p>`;
  if (!T) return head + '<div class="empty"><p>Loading…</p></div>';
  if (!T.length) return head + `<div class="empty">${icon('trash')}<h3>Trash is empty</h3><p>Entries you delete show up here.</p></div>`;
  const today = C.todayKey();
  return head + `<div class="panel rows">${T.map(e => `<div class="tr-row">
      <span class="ic">${catIc(S, e.category)}</span>
      <span class="t"><span class="m">${esc(e.merchant || S.labels[e.category] || 'Entry')}</span>
        <span class="s"><span>${C.dayLabel(e.occurred_at.slice(0, 10), today)}</span><span>${srcName(e)}</span><span>deleted ${relTime(e.deleted_at)}</span></span>
        ${e.why ? `<span class="why">${esc(e.why)}</span>` : ''}</span>
      <span class="a">${e.amount_cents ? C.fmt(e.amount_cents) : '—'}</span>
      <button type="button" class="btn ghost sm" data-action="trash-restore" data-id="${e.id}">${icon('undo')}Restore</button></div>`).join('')}</div>`;
}

// ---------- edit history (inside the edit sheet)
export function historyHTML(H) {
  if (!H) return `<p class="note">Loading…</p>`;
  return `<ol class="hist">${H.events.map(ev => `<li><div class="h-top"><b>${esc(ev.label)}</b><span>${relTime(ev.at)}</span></div>
    ${ev.summary ? `<div class="h-sum">${esc(ev.summary)}</div>` : ''}
    ${ev.changes.map(c => `<div class="h-ch"><span>${esc(c.label)}</span><span class="v">${c.from === '—' ? '<i>empty</i>' : `<s>${esc(c.from)}</s>`}${icon('right')}${c.to === '—' ? '<i>empty</i>' : `<b>${esc(c.to)}</b>`}</span></div>`).join('')}
    ${ev.why ? `<div class="h-why">${esc(ev.why)}</div>` : ''}</li>`).join('')}</ol>`;
}

// ---------- recurring
const ORD = n => n + ({ 1: 'st', 2: 'nd', 3: 'rd', 21: 'st', 22: 'nd', 23: 'rd', 31: 'st' }[n] || 'th');
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = d => `${+d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]}${d.slice(0, 4) !== C.todayKey().slice(0, 4) ? ' ' + d.slice(0, 4) : ''}`;
export const repeatsLabel = r => r.every === 'year' ? `Yearly on ${shortDate(r.start).replace(/ \d{4}$/, '')}` : `Monthly on the ${ORD(+r.start.slice(8, 10))}`;
export function monthlyCommitted(S) {
  return (S.recurring || []).filter(r => !r.paused).reduce((t, r) => t + (r.every === 'year' ? Math.round(r.amount_cents / 12) : r.amount_cents), 0);
}
export function recurringRows(S) {
  const rows = (S.recurring || []).map(r => `<button type="button" class="set-row rec-row${r.paused ? ' paused' : ''}" data-action="rec-edit" data-id="${r.id}">
      <span class="ic">${catIc(S, r.category)}</span>
      <span>${esc(r.merchant)}<span class="sub">${r.paused ? 'Paused' : `${repeatsLabel(r)} · <span class="nw">next ${r.next ? shortDate(r.next) : '—'}</span>`}${r.until && !r.paused ? ` · ends ${MON[+r.until.slice(5, 7) - 1]} ${r.until.slice(0, 4)}` : ''}</span></span>
      <span class="end num">${C.fmt(r.amount_cents)}${icon('right')}</span></button>`).join('');
  return rows + `<button type="button" class="set-row cat-add" data-action="rec-new"><span class="ic add">${icon('plus')}</span><span>New recurring expense</span></button>`;
}
/** Dates that would be logged straight away when the first payment is in the past (mirrors server._occurrences). */
export function backfill(d, today = C.todayKey()) {
  if (!d.start || d.start > today || d.id) return [];
  const out = [], [y, m, day] = d.start.split('-').map(Number);
  for (let i = 0; i < 400; i++) {
    const yy = d.every === 'year' ? y + i : y + Math.floor((m - 1 + i) / 12), mm = d.every === 'year' ? m : (m - 1 + i) % 12 + 1;
    const dd = Math.min(day, new Date(yy, mm, 0).getDate());
    const iso = `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    if (iso > today || (d.until && iso.slice(0, 7) > d.until)) break;
    out.push(iso);
  }
  return out;
}
export function recSheet(S, d) {
  const isNew = !d.id, cents = C.toCents(d.amount);
  const seg = (v, l) => `<button type="button" data-action="rec-every" data-v="${v}" aria-pressed="${d.every === v}">${l}</button>`;
  const hint = !d.start ? '' : d.start < C.todayKey() ? 'Past payments are not backfilled. Logging starts with the next scheduled date.' : `First due date: ${shortDate(d.start)}. Posted from 09:00 Malaysia time.`;
  return `<div class="grab" aria-hidden="true"></div>
  <div class="sheet-h"><h2 id="sheet-title">${isNew ? 'New recurring expense' : 'Edit recurring'}</h2>
    ${isNew ? '' : `<button type="button" class="icon-btn danger" data-action="rec-delete" aria-label="Delete recurring expense">${icon('trash')}</button>`}
    <button type="button" class="icon-btn" data-action="close" aria-label="Close">${icon('close')}</button></div>
  <div class="fields">
    <label class="field">${icon('pencil')}<span class="sr">Name</span><input id="r-merchant" maxlength="120" placeholder="Name, e.g. Car loan" value="${esc(d.merchant)}" autocomplete="off" enterkeyhint="next"></label>
    <label class="field rec-amt"><small>RM</small><span class="sr">Amount</span><input id="r-amount" inputmode="decimal" placeholder="Amount each time" value="${esc(d.amount)}" autocomplete="off" enterkeyhint="next"></label>
  </div>
  <div class="cat-grid${S.categories.length > 10 ? ' paged' : ''}" id="cat-grid" role="group" aria-label="Category">${catButtons(S, S.categories, d.category)}</div>
  <div class="rec-line"><span>Repeats</span><div class="kind" role="group" aria-label="Repeats">${seg('month', 'Monthly')}${seg('year', 'Yearly')}</div></div>
  <div class="fields">
    <label class="field">${icon('clock')}<span class="lbl">${isNew ? 'First payment' : 'Due date'}</span><input id="r-start" type="date" value="${d.start}"></label>
    <label class="field">${icon('check')}<span class="lbl">Last payment</span><input id="r-until" type="month" value="${d.until}"${d.until ? '' : ' class="blank"'}>${d.until ? '' : '<span class="ph" id="r-until-ph">No end date</span>'}</label>
    <label class="field">${icon('list')}<span class="sr">Note</span><input id="r-note" maxlength="200" placeholder="Note (optional), e.g. Public Bank 7 years" value="${esc(d.note)}" autocomplete="off" enterkeyhint="done"></label>
  </div>
  <p class="note rec-hint" id="r-hint">${isNew ? hint : d.paused ? 'Paused — nothing is logged until you resume it. Months skipped while paused aren’t added later.' : 'Changes apply from the next payment; ones already logged stay as they are.'}${!d.until ? ' Leave Last payment empty if it has no end date.' : ''}</p>
  <div class="sheet-actions${isNew ? '' : ' two'}">${isNew ? '' : `<button type="button" class="btn ghost" data-action="rec-pause">${d.paused ? 'Resume' : 'Pause'}</button>`}
    <button type="button" class="btn primary" id="save" data-action="save">${isNew ? 'Add' : 'Save'}</button></div>`;
}

export function categoryRows(S) {
  const month = C.inMonth(S.entries, C.todayKey().slice(0, 7)), n = {};
  for (const e of month) n[e.category] = (n[e.category] || 0) + 1;
  const rows = S.categories.map(c => `<button type="button" class="set-row cat-set" data-action="cat-edit" data-c="${c.key}">
      <span class="ic">${catIc(S, c.key)}</span><span>${esc(c.label)}<span class="sub">${n[c.key] ? `${n[c.key]} this month` : 'None this month'}${c.excluded ? ' · not counted in totals' : ''}</span></span>
      <span class="end">${icon('right')}</span></button>`).join('');
  const back = (S.removedCats || []).length ? `<div class="set-row cat-back">${icon('undo')}<span>Add back a default<span class="sub">${S.removedCats.map(r => `<button type="button" class="link" data-action="cat-restore" data-c="${r.key}">${esc(r.label)}</button>`).join('')}</span></span></div>` : '';
  return rows + `<button type="button" class="set-row cat-add" data-action="cat-new"><span class="ic add">${icon('plus')}</span><span>New category</span></button>` + back;
}

// emoji that fit a spending tracker; any other emoji can be typed with the iOS emoji keyboard
const EMOJI = ['🍜', '☕', '🧋', '🍱', '🍺', '🛒', '🚗', '⛽', '🅿️', '🚇', '✈️', '🏨', '🛍️', '👕', '💄', '💊', '🏋️', '🏃', '🎬', '🎮',
  '🎁', '🐶', '👶', '📚', '🎓', '💻', '📱', '🏠', '💡', '🧾', '🛡️', '💳', '🔁', '❤️', '💐', '✂️', '🧺', '🔧', '🙏', '📦'];

export function catSheet(S, d) {
  const isNew = !d.key, i = S.categories.findIndex(c => c.key === d.key), last = S.categories.length - 1;
  const used = d.key ? S.entries.filter(e => e.category === d.key).length : 0;
  const pick = EMOJI.map(e => `<button type="button" data-action="emoji" data-e="${e}" aria-pressed="${e === d.emoji}" aria-label="${e}">${e}</button>`).join('');
  return `<div class="grab" aria-hidden="true"></div>
  <div class="sheet-h"><h2 id="sheet-title">${isNew ? 'New category' : 'Edit category'}</h2>
    ${!isNew && d.key !== 'other' ? `<button type="button" class="icon-btn danger" data-action="cat-delete" aria-label="Delete category">${icon('trash')}</button>` : ''}
    <button type="button" class="icon-btn" data-action="close" aria-label="Close">${icon('close')}</button></div>
  <div class="cat-preview"><span class="ic big" id="c-preview">${d.emoji ? `<span class="emo">${esc(d.emoji)}</span>` : catIc(S, d.key || '')}</span>
    <div class="fields"><label class="field"><span class="sr">Name</span><input id="c-label" maxlength="24" placeholder="Name, e.g. Coffee" value="${esc(d.label)}" autocomplete="off" enterkeyhint="done"></label>
    <label class="field emo-field"><span class="sr">Emoji</span><input id="c-emoji" placeholder="Emoji — pick or type" value="${esc(d.emoji)}" autocomplete="off" enterkeyhint="done">
      ${d.emoji ? `<button type="button" class="clear-emo" data-action="emoji" data-e="" aria-label="Remove emoji">${icon('close')}</button>` : ''}</label></div></div>
  <div class="emoji-grid" role="group" aria-label="Emoji">${pick}</div>
  ${isNew ? '' : `<div class="cat-move"><span>Position in the picker</span>
    <button type="button" class="icon-btn" data-action="cat-move" data-delta="-1" aria-label="Move up"${i <= 0 ? ' disabled' : ''}>${icon('left')}</button>
    <span class="num">${i + 1} / ${last + 1}</span>
    <button type="button" class="icon-btn" data-action="cat-move" data-delta="1" aria-label="Move down"${i >= last ? ' disabled' : ''}>${icon('right')}</button></div>`}
  <button type="button" class="switch-row" role="switch" data-action="cat-count" aria-checked="${!d.excluded}">
    <span>Count in totals<small>Turn off for things like a car loan or rent: still logged, but left out of monthly totals, daily average and the Total budget.</small></span><span class="switch" aria-hidden="true"></span></button>
  ${!isNew && d.key !== 'other' && used ? `<p class="note">Deleting moves its ${used} ${used === 1 ? 'entry' : 'entries'} to Other.</p>` : ''}
  ${d.key === 'other' ? '<p class="note">Other catches anything unsorted, so it can be renamed but not deleted.</p>' : ''}
  <div class="sheet-actions"><button type="button" class="btn primary" id="save" data-action="save">${isNew ? 'Add category' : 'Save'}</button></div>`;
}

export function budgetInputs(S) {
  const b = S.budgets || {};
  const row = (key, label, mark) => `<label class="set-row bud-in">${mark}<span>${esc(label)}</span>
    <span class="end"><small>RM</small><input type="text" inputmode="decimal" data-budget="${key}" value="${b[key] ? C.centsToInput(b[key]) : ''}" placeholder="—" aria-label="${esc(label)} budget"></span></label>`;
  return [row('_total', 'Total per month', icon('chart')), ...S.categories.map(c => row(c.key, c.label, catIc(S, c.key)))].join('');
}

const SHORT = { Subscriptions: 'Subs', 'Food & drinks': 'Food', Entertainment: 'Fun', Education: 'Study' };
export function catButtons(S, cats, selected) {
  const btns = cats.map(c => `<button type="button" data-action="cat" data-c="${c.key}" aria-pressed="${c.key === selected}" aria-label="${esc(c.label)}"><span class="ic">${catIc(S, c.key)}</span><span class="cl">${esc(SHORT[c.label] || c.label)}</span></button>`);
  if (btns.length <= 10) return `<div class="cat-page">${btns.join('')}</div>`;
  // more than two rows: swipeable pages of 5×2 so the keypad never gets pushed off screen
  const pages = []; for (let i = 0; i < btns.length; i += 10) pages.push(`<div class="cat-page">${btns.slice(i, i + 10).join('')}</div>`);
  return pages.join('');
}

const key = k => `<button type="button" data-key="${k}">${k}</button>`;

export function sheet(S, d) {
  if (d.mode === 'cat') return catSheet(S, d);
  if (d.mode === 'rec') return recSheet(S, d);
  const isEdit = d.mode === 'edit', e = d.entry || {};
  const review = isEdit && e.needs_review, card = false;
  const meta = isEdit ? `<div class="meta-line">${e.source === 'applepay' ? `<span>${icon('tap')}From Apple Pay</span>` : e.source === 'tng' ? `<span>${icon('tap')}From TNG notification</span>` : e.source === 'bank' ? `<span>${icon('card')}From bank SMS</span>` : e.source === 'recurring' ? `<span>${icon('repeat')}Logged by Recurring</span>` : `<span>${icon('pencil')}Added manually</span>`}
    ${e.card ? `<span>${icon('card')}${esc(e.card)}</span>` : ''}${e.source === 'applepay' && e.raw_amount ? `<span>Wallet: ${esc(e.raw_amount)}</span>` : ''}</div>` : '';
  const flag = review && e.note ? `<div class="flag-note">${icon('alert')}<span>${esc(e.note)}</span></div>` : '';
  const tapOnly = isEdit && e.source === 'applepay' && !e.amount_cents
    ? `<button type="button" class="not-pay" data-action="not-payment">${icon('close')}<span><b>Not a payment</b><small>A car key, transit or office pass — remove this and skip “${esc(e.merchant)}” taps from now on</small></span></button>` : '';
  const suggest = '';
  const hist = isEdit && e.id ? `<details class="hist-box" id="hist-box"${d.histOpen ? ' open' : ''}><summary>${icon('clock')}History</summary><div id="hist">${d.histOpen ? historyHTML(d.history) : ''}</div></details>` : '';
  const quick = !isEdit && !card && S.quick.length ? `<div class="quick" aria-label="Frequent merchants">${S.quick.map(q => `<button type="button" data-action="quick" data-m="${esc(q.merchant)}" data-c="${q.category}">${esc(q.merchant)}</button>`).join('')}</div>` : '';
  return `<div class="grab" aria-hidden="true"></div>
  <div class="sheet-h"><h2 id="sheet-title">${card ? 'Edit draft' : review ? 'Review' : isEdit ? 'Edit' : 'New entry'}</h2>
    ${isEdit ? `<button type="button" class="icon-btn danger" data-action="delete" aria-label="Delete entry">${icon('trash')}</button>` : ''}
    <button type="button" class="icon-btn" data-action="close" aria-label="Close">${icon('close')}</button></div>
  ${flag}${tapOnly}${tapOnly ? '' : suggest}${meta}
  <div class="amount-display${''}"><small>RM</small><output id="amt" aria-live="polite" aria-label="Amount"></output><span class="caret" aria-hidden="true"></span></div>
  <div class="cat-grid${S.categories.length > 10 ? ' paged' : ''}" id="cat-grid" role="group" aria-label="Category">${catButtons(S, S.categories, d.category)}</div>
  ${quick}
  <div class="fields">
    <label class="field">${icon('pencil')}<span class="sr">Merchant</span><input id="f-merchant" maxlength="120" placeholder="Merchant (optional)" value="${esc(d.merchant)}" autocomplete="off" enterkeyhint="next"></label>
    <label class="field">${icon('list')}<span class="sr">Note</span><input id="f-note" maxlength="500" placeholder="Note (optional)" value="${esc(d.note)}" autocomplete="off" enterkeyhint="done"></label>
    <label class="field">${icon('clock')}<span class="sr">Time</span><input id="f-when" type="datetime-local" value="${d.when}"></label>
  </div>
  ${hist}
  <div class="pad" id="pad">${[1, 2, 3].map(key).join('')}<button type="button" class="del" data-key="back" aria-label="Backspace">${icon('back')}</button>
    ${[4, 5, 6].map(key).join('')}<button type="button" class="side" data-key="clear">Clear</button>
    ${[7, 8, 9].map(key).join('')}<button type="button" class="save" id="save" data-action="save">${card ? 'Update' : review ? 'Confirm' : 'Save'}</button>
    ${key('.')}${key(0)}${key('00')}</div>
`;
}
