import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../public/core.js';

const E = (id, at, cents, extra = {}) => ({ id, occurred_at: at, amount_cents: cents, kind: 'expense', category: 'food', merchant: 'M', ...extra });

test('Malaysia-time keys independent of device zone', () => {
  const d = new Date('2026-10-21T17:30:00Z'); // 01:30 on the 22nd in KL
  assert.equal(C.todayKey(d), '2026-10-22');
  assert.equal(C.nowLocalIso(d), '2026-10-22T01:30:00+08:00');
});

test('month arithmetic', () => {
  assert.equal(C.shiftMonth('2026-01', -1), '2025-12');
  assert.equal(C.shiftMonth('2026-12', 1), '2027-01');
  assert.equal(C.daysInMonth('2028-02'), 29);
});

test('money formatting is exact on integer cents', () => {
  assert.equal(C.fmt(123450), 'RM1,234.50');
  assert.equal(C.fmt(-1205), '−RM12.05');
  assert.equal(C.fmt(5, { sign: true }), '+RM0.05');
  assert.equal(C.toCents('0.1') + C.toCents('0.2'), 30);
  assert.equal(C.toCents('19.99'), 1999);
});

test('keypad caps decimals and length, handles leading zero and dot', () => {
  let s = '';
  for (const k of ['0', '5']) s = C.keypad(s, k);
  assert.equal(s, '5');
  for (const k of ['.', '9', '9', '9']) s = C.keypad(s, k);
  assert.equal(s, '5.99');
  assert.equal(C.keypad('', '.'), '0.');
  assert.equal(C.keypad('1.5', '.'), '1.5');
  assert.equal(C.keypad('1234567', '8'), '1234567');
  assert.equal(C.keypad('12', 'back'), '1');
});

test('totals, daily series and category shares reconcile', () => {
  const es = [E(1, '2026-10-01T09:00:00+08:00', 1000), E(2, '2026-10-01T12:00:00+08:00', 2550, { category: 'transport' }),
    E(3, '2026-10-03T12:00:00+08:00', 450), E(4, '2026-10-05T12:00:00+08:00', 500000, { kind: 'income', category: 'salary' }),
    E(5, '2026-09-30T23:59:00+08:00', 999)];
  const oct = C.inMonth(es, '2026-10');
  assert.deepEqual(C.totals(oct), { spend: 4000, income: 500000, net: 496000 });
  const series = C.dailySeries(oct, '2026-10', 3);
  assert.equal(series.length, 31);
  assert.equal(series[0].cents, 3550); assert.equal(series[2].cents, 450); assert.equal(series[3].future, true);
  assert.equal(series.reduce((a, d) => a + d.cents, 0), 4000);
  const cats = C.byCategory(oct);
  assert.deepEqual(cats.map(c => [c.category, c.cents]), [['transport', 2550], ['food', 1450]]);
  assert.ok(Math.abs(cats.reduce((a, c) => a + c.share, 0) - 1) < 1e-9);
});

test('month-to-date compares like with like', () => {
  const es = [E(1, '2026-09-05T10:00:00+08:00', 1000), E(2, '2026-09-25T10:00:00+08:00', 9000)];
  assert.equal(C.monthToDate(es, '2026-09', 22), 1000);
});

test('groupByDay sorts newest first and labels relative days', () => {
  const es = [E(1, '2026-10-20T09:00:00+08:00', 100), E(2, '2026-10-22T08:00:00+08:00', 200), E(3, '2026-10-22T21:00:00+08:00', 300)];
  const g = C.groupByDay(es);
  assert.deepEqual(g.map(x => x.day), ['2026-10-22', '2026-10-20']);
  assert.deepEqual(g[0].entries.map(e => e.id), [3, 2]);
  assert.equal(C.dayLabel('2026-10-22', '2026-10-22'), 'Today');
  assert.equal(C.dayLabel('2026-10-21', '2026-10-22'), 'Yesterday');
  assert.equal(C.dayLabel('2026-10-20', '2026-10-22'), 'Tue, 20 Oct');
  assert.equal(C.dayLabel('2025-12-31', '2026-01-02'), '31 Dec 2025');
});

test('search hits merchant, note, category label and amount', () => {
  const e = E(1, '2026-10-22T08:00:00+08:00', 1250, { merchant: 'ZUS Coffee', note: 'with jade', category: 'food' });
  const labels = { food: 'Food' };
  for (const q of ['zus', 'jade', 'food', '12.50']) assert.ok(C.matches(e, q, labels), q);
  assert.ok(!C.matches(e, 'tealive', labels));
});

test('offline outbox merge never shows a synced entry twice', () => {
  const server = [{ id: 1, client_id: 'c-a' }];
  const pending = [{ client_id: 'c-a' }, { client_id: 'c-b' }];
  const merged = C.mergePending(server, pending);
  assert.deepEqual(merged.map(e => e.client_id), ['c-b', 'c-a']);
  assert.equal(merged[0].pending, true);
});

test('frequent merchants carry their usual category', () => {
  const now = new Date('2026-10-22T04:00:00Z');
  const es = [E(1, '2026-10-20T09:00:00+08:00', 100, { merchant: 'Tealive' }), E(2, '2026-10-21T09:00:00+08:00', 100, { merchant: 'tealive ' }),
    E(3, '2026-10-21T10:00:00+08:00', 100, { merchant: 'Shell', category: 'transport' }), E(4, '2026-06-01T10:00:00+08:00', 100, { merchant: 'Old' })];
  const f = C.frequentMerchants(es, now);
  assert.deepEqual(f.map(x => x.merchant), ['Tealive', 'Shell']);
  assert.equal(f[1].category, 'transport');
});

test('counted() drops excluded categories only', () => {
  const es = [{ category: 'food', amount_cents: 100 }, { category: 'car', amount_cents: 5000 }];
  assert.deepEqual(C.counted(es, new Set(['car'])).map(e => e.category), ['food']);
  assert.equal(C.counted(es, new Set()).length, 2);
  assert.equal(C.counted(es, undefined).length, 2);
});

test('inboxGroups: one group per entry, a duplicate pair counted once', () => {
  const es = [
    { id: 1, needs_review: 1, amount_cents: 0 },
    { id: 2, needs_review: 1, amount_cents: 500, twin: 3 }, { id: 3, needs_review: 1, amount_cents: 500, twin: 2 },
    { id: 4, needs_review: 1, amount_cents: 900, suggestion: { category: 'food' } },
    { id: 5, needs_review: 1, amount_cents: 100 }, { id: 6, needs_review: 0, amount_cents: 100 }, { id: null, needs_review: 1, amount_cents: 1 },
  ];
  const g = C.inboxGroups(es);
  assert.deepEqual([g.missing, g.twins, g.suggested, g.check].map(a => a.map(e => e.id)), [[1], [2], [4], [5]]);
  assert.equal(g.total, 4);
});
