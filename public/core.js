// Tally core: pure functions, no DOM. Shared by the app and tests (node --test).
export const MYT_OFFSET = '+08:00';
const pad = n => String(n).padStart(2, '0');

/** Date -> 'YYYY-MM-DD' / 'YYYY-MM' in Malaysia time regardless of device zone. */
export function mytParts(date) {
  const d = new Date(date.getTime() + 8 * 3600e3);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes() };
}
export const dayKey = iso => iso.slice(0, 10);
export const monthKey = iso => iso.slice(0, 7);
export function todayKey(now = new Date()) { const p = mytParts(now); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; }
export function nowLocalIso(now = new Date()) {
  const p = mytParts(now); return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.hh)}:${pad(p.mm)}:00${MYT_OFFSET}`;
}
export function shiftMonth(key, delta) {
  let [y, m] = key.split('-').map(Number); m += delta;
  while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; }
  return `${y}-${pad(m)}`;
}
export function daysInMonth(key) { const [y, m] = key.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

/** Money: integer cents everywhere. */
export function fmt(cents, { sign = false, symbol = true } = {}) {
  const neg = cents < 0, abs = Math.abs(cents);
  const s = `${Math.floor(abs / 100).toLocaleString('en-MY')}.${pad(abs % 100)}`;
  return `${neg ? '−' : sign && cents > 0 ? '+' : ''}${symbol ? 'RM' : ''}${s}`;
}
export function fmtShort(cents) {
  const v = Math.abs(cents) / 100;
  if (v >= 10000) return `${(v / 1000).toFixed(v >= 100000 ? 0 : 1)}k`;
  return v >= 100 ? Math.round(v).toLocaleString('en-MY') : v.toFixed(v % 1 ? 2 : 0);
}

/** Keypad: append a key to the amount string; returns the new string (max 2 decimals, RM 9,999,999.99). */
export function keypad(cur, key) {
  if (key === 'back') return cur.slice(0, -1);
  if (key === 'clear') return '';
  if (key === '.') return cur.includes('.') ? cur : (cur || '0') + '.';
  if (!/^\d$/.test(key)) return cur;
  if (cur === '0') return key;
  const [i, f] = cur.split('.');
  if (f !== undefined && f.length >= 2) return cur;
  if (f === undefined && i.length >= 7) return cur;
  return cur + key;
}
export const toCents = s => (s && !isNaN(+s) ? Math.round(+s * 100) : 0);
export const centsToInput = c => (c % 100 ? (c / 100).toFixed(2) : String(c / 100));

/** Totals for a set of entries. */
export function totals(entries) {
  let spend = 0, income = 0;
  for (const e of entries) e.kind === 'income' ? (income += e.amount_cents) : (spend += e.amount_cents);
  return { spend, income, net: income - spend };
}

/** Drop entries in categories the user marked "not counted in totals". */
export function counted(entries, excluded) { return excluded && excluded.size ? entries.filter(e => !excluded.has(e.category)) : entries; }

/** Review Inbox groups. Each entry lands in exactly one group, in this order of urgency. */
export function inboxGroups(entries) {
  const g = { missing: [], twins: [], suggested: [], check: [], total: 0 };
  const seen = new Set();
  for (const e of entries) {
    if (!e.needs_review || e.id == null) continue;
    if (!e.amount_cents) g.missing.push(e);
    else if (e.twin) { const pair = [e.id, e.twin].sort().join(':'); if (seen.has(pair)) continue; seen.add(pair); g.twins.push(e); }
    else if (e.suggestion) g.suggested.push(e);
    else g.check.push(e);
    g.total++;
  }
  return g;
}

export function inMonth(entries, key) { return entries.filter(e => monthKey(e.occurred_at) === key); }

/** Daily spend series for a month: [{day, cents}] incl. zero days, up to `uptoDay`. */
export function dailySeries(entries, key, uptoDay = daysInMonth(key)) {
  const out = Array.from({ length: daysInMonth(key) }, (_, i) => ({ day: i + 1, cents: 0, future: i + 1 > uptoDay }));
  for (const e of entries) if (e.kind === 'expense' && monthKey(e.occurred_at) === key) out[+e.occurred_at.slice(8, 10) - 1].cents += e.amount_cents;
  return out;
}

/** Category breakdown (expense only), sorted desc, with share of total. */
export function byCategory(entries, kind = 'expense') {
  const m = new Map();
  for (const e of entries) if (e.kind === kind) m.set(e.category, (m.get(e.category) || 0) + e.amount_cents);
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  return [...m.entries()].map(([category, cents]) => ({ category, cents, share: total ? cents / total : 0 })).sort((a, b) => b.cents - a.cents);
}

export function topMerchants(entries, n = 5) {
  const m = new Map();
  for (const e of entries) {
    if (e.kind !== 'expense' || !e.merchant) continue;
    const k = e.merchant.trim().toUpperCase();
    const cur = m.get(k) || { merchant: e.merchant.trim(), cents: 0, count: 0 };
    cur.cents += e.amount_cents; cur.count++; m.set(k, cur);
  }
  return [...m.values()].sort((a, b) => b.cents - a.cents).slice(0, n);
}

/** Same point in previous month: spend from day 1..dayN (fair month-to-date comparison). */
export function monthToDate(entries, key, dayN) {
  return entries.filter(e => e.kind === 'expense' && monthKey(e.occurred_at) === key && +e.occurred_at.slice(8, 10) <= dayN)
    .reduce((a, e) => a + e.amount_cents, 0);
}

/** Group entries by day, newest first: [{day, entries, spend, income}]. */
export function groupByDay(entries) {
  const m = new Map();
  for (const e of [...entries].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at) || b.id - a.id)) {
    const k = dayKey(e.occurred_at);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(e);
  }
  return [...m.entries()].map(([day, list]) => ({ day, entries: list, ...totals(list) }));
}

const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function dayLabel(day, today) {
  if (day === today) return 'Today';
  const t = Date.UTC(...today.split('-').map((v, i) => (i === 1 ? v - 1 : +v)));
  const d = Date.UTC(...day.split('-').map((v, i) => (i === 1 ? v - 1 : +v)));
  const diff = Math.round((t - d) / 864e5);
  if (diff === 1) return 'Yesterday';
  const [, m, dd] = day.split('-').map(Number);
  const wd = WEEK[new Date(d).getUTCDay()];
  return day.slice(0, 4) === today.slice(0, 4) ? `${wd}, ${dd} ${MON[m - 1]}` : `${dd} ${MON[m - 1]} ${day.slice(0, 4)}`;
}
export const timeOf = iso => iso.slice(11, 16);
export function monthLabel(key, today) {
  const [y, m] = key.split('-').map(Number);
  return key.slice(0, 4) === today.slice(0, 4) ? MONTH[m - 1] : `${MONTH[m - 1]} ${y}`;
}
export const monthShort = key => MON[+key.slice(5, 7) - 1];

/** Search across merchant/note/category label/amount. */
export function matches(e, q, labels) {
  if (!q) return true;
  const s = q.trim().toLowerCase();
  const amt = (e.amount_cents / 100).toFixed(2);
  return [e.merchant, e.note, labels[e.category] || '', e.card, amt].some(v => (v || '').toLowerCase().includes(s));
}

/** Offline outbox: merge pending local creates into server state (dedup by client_id). */
export function mergePending(serverEntries, pending) {
  const have = new Set(serverEntries.map(e => e.client_id));
  return [...pending.filter(p => !have.has(p.client_id)).map(p => ({ ...p, pending: true })), ...serverEntries];
}

/** Recent merchants for quick-pick chips: most frequent in last 60 days, with their usual category. */
export function frequentMerchants(entries, now = new Date(), n = 8) {
  const cutoff = new Date(now.getTime() - 60 * 864e5).toISOString().slice(0, 10);
  const m = new Map();
  for (const e of entries) {
    if (e.kind !== 'expense' || !e.merchant || e.occurred_at.slice(0, 10) < cutoff) continue;
    const k = e.merchant.trim().toUpperCase();
    const cur = m.get(k) || { merchant: e.merchant.trim(), count: 0, cats: {} };
    cur.count++; cur.cats[e.category] = (cur.cats[e.category] || 0) + 1; m.set(k, cur);
  }
  return [...m.values()].sort((a, b) => b.count - a.count).slice(0, n)
    .map(x => ({ merchant: x.merchant, category: Object.entries(x.cats).sort((a, b) => b[1] - a[1])[0][0] }));
}

export function uid() {
  const a = new Uint8Array(12); (globalThis.crypto || require('crypto').webcrypto).getRandomValues(a);
  return 'c-' + [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}
