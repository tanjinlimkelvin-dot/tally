import {
  fail,
  now,
  when,
  text,
  cents,
  key,
  out,
  stmt,
  all,
  one,
  run,
  json,
} from "./common.js";
export async function clean(db, d, partial = false) {
  if (!d || typeof d !== "object" || Array.isArray(d))
    fail(422, "Invalid fields");
  const v = {};
  for (const k of Object.keys(d))
    if (
      ![
        "amount",
        "kind",
        "category",
        "merchant",
        "note",
        "card",
        "occurred_at",
        "client_id",
      ].includes(k)
    )
      fail(422, "Unsupported field");
  if (!partial || "amount" in d) v.amount_cents = cents(d.amount);
  if (d.kind && d.kind !== "expense") fail(422, "Expense only");
  if (!partial || "category" in d) {
    v.category = d.category || "other";
    if (!(await one(db, "SELECT key FROM categories WHERE key=?", v.category)))
      fail(422, "Invalid category");
  }
  for (const [k, n] of [
    ["merchant", 120],
    ["note", 500],
    ["card", 80],
  ])
    if (!partial || k in d) v[k] = text(d[k], n);
  if (!partial || "occurred_at" in d) v.occurred_at = when(d.occurred_at);
  return v;
}
export function insert(
  db,
  v,
  cid,
  source = "manual",
  review = 0,
  condition = "",
  params = [],
) {
  const t = now();
  return stmt(
    db,
    `INSERT OR IGNORE INTO entries(client_id,occurred_at,amount_cents,category,merchant,note,card,source,needs_review,raw_amount,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? ${condition}`,
    cid,
    v.occurred_at,
    v.amount_cents,
    v.category || "other",
    v.merchant || "",
    v.note || "",
    v.card || "",
    source,
    review,
    v.raw_amount || "",
    t,
    t,
    ...params,
  );
}
export async function create(db, d) {
  const v = await clean(db, d);
  const cid = d.client_id ? text(d.client_id, 100) : "m:" + crypto.randomUUID();
  const r = await insert(db, v, cid).run();
  return {
    entry: out(await one(db, "SELECT * FROM entries WHERE client_id=?", cid)),
    created: r.meta.changes > 0,
  };
}
export async function entry(db, id) {
  const r = await one(db, "SELECT * FROM entries WHERE id=?", id);
  if (!r) fail(404, "Entry not found");
  return r;
}
export async function edit(db, id, d, action = "confirm") {
  const r = await entry(db, id);
  if (String(r.version) !== String(d.version))
    fail(409, "Entry changed elsewhere");
  let v = {};
  if (["confirm", "edit"].includes(action)) {
    if (r.deleted_at) fail(409, "Entry deleted");
    v = await clean(db, d.changes || {}, true);
    if (!(v.amount_cents ?? r.amount_cents)) fail(422, "Add the amount first");
    v.needs_review = 0;
  } else if (["delete", "restore", "not-payment"].includes(action)) {
    v.deleted_at = action === "restore" ? null : now();
    v.merged_into = null;
  } else fail(404, "Unknown action");
  if (action === "not-payment" && (r.source !== "applepay" || r.amount_cents))
    fail(422, "Only amountless Apple Pay passes can be ignored");
  v.updated_at = now();
  const p = Object.values(v),
    sql = `UPDATE entries SET ${Object.keys(v)
      .map((k) => k + "=?")
      .join(",")},version=version+1 WHERE id=? AND version=? RETURNING *`;
  let result;
  if (action === "not-payment") {
    const batch = await db.batch([
      stmt(db, sql, ...p, id, r.version),
      stmt(
        db,
        "INSERT OR IGNORE INTO ignored_taps(merchant_key,label) SELECT ?,? WHERE EXISTS(SELECT 1 FROM entries WHERE id=? AND version=? AND deleted_at IS NOT NULL)",
        key(r.merchant),
        r.merchant,
        id,
        r.version + 1,
      ),
    ]);
    result = batch[0].results[0];
  } else result = await one(db, sql, ...p, id, r.version);
  if (!result) fail(409, "Entry changed elsewhere");
  return out(result);
}
export async function merge(db, id, d) {
  const a = await entry(db, id),
    b = await entry(db, d.other);
  if (
    a.id === b.id ||
    a.deleted_at ||
    b.deleted_at ||
    String(a.version) !== String(d.version) ||
    String(b.version) !== String(d.other_version)
  )
    fail(409, "Entries changed");
  const t = now();
  const result = await db.batch([
    stmt(
      db,
      "UPDATE entries SET deleted_at=?,merged_into=?,updated_at=?,version=version+1 WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM entries WHERE id=? AND version=? AND deleted_at IS NULL) RETURNING *",
      t,
      id,
      t,
      b.id,
      b.version,
      a.id,
      a.version,
    ),
    stmt(
      db,
      "UPDATE entries SET needs_review=0,updated_at=?,version=version+1 WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM entries WHERE id=? AND version=? AND merged_into=?) RETURNING *",
      t,
      a.id,
      a.version,
      b.id,
      b.version + 1,
      a.id,
    ),
  ]);
  if (!result[0].results.length || !result[1].results.length)
    fail(409, "Entries changed");
  return {
    entry: out(result[1].results[0]),
    merged: out(result[0].results[0]),
  };
}
export async function categories(db) {
  return (await all(db, "SELECT * FROM categories ORDER BY position,key")).map(
    (r) => ({
      ...r,
      kind: "expense",
      builtin: !r.key.startsWith("c"),
      excluded: !!r.excluded,
    }),
  );
}
export async function state(db) {
  const cats = await categories(db);
  const entries=(await all(db,"SELECT * FROM entries WHERE deleted_at IS NULL ORDER BY occurred_at DESC,id DESC")).map(out);
  const amounts=new Map();
  for(const e of entries) {const bucket=amounts.get(e.amount_cents)||[];bucket.push(e);amounts.set(e.amount_cents,bucket);}
  for(const e of entries) if(e.needs_review&&e.amount_cents) {
    const twin=amounts.get(e.amount_cents).find(o=>o.id!==e.id&&(o.source!==e.source||key(o.merchant)===key(e.merchant))&&Math.abs(Date.parse(o.occurred_at)-Date.parse(e.occurred_at))<=((o.source==='recurring'||e.source==='recurring')?4:1)*86400000);
    if(twin)e.twin=twin.id;
  }
  const meta=await one(db,"SELECT last_at,bytes,invalid FROM ingest_meta WHERE id=1");
  return {
    entries,
    categories: cats,
    removed_categories: await removed(db),
    budgets: Object.fromEntries(
      (await all(db, "SELECT * FROM budgets")).map((r) => [
        r.category,
        r.cents,
      ]),
    ),
    recurring: await recurringList(db),
    ignored_taps: await all(db, "SELECT * FROM ignored_taps ORDER BY label"),
    missed: await all(
      db,
      "SELECT * FROM skipped WHERE status='new' ORDER BY occurred_at DESC LIMIT 100",
    ),
    cards: (
      await all(
        db,
        "SELECT card FROM entries WHERE card!='' AND deleted_at IS NULL GROUP BY card ORDER BY max(occurred_at) DESC LIMIT 12",
      )
    ).map((r) => r.card),
    server_time: now(),
    ingest: meta || { last_at: null, bytes: 0, invalid: 0 },
  };
}
export const defaults = {
  food: "Food & drinks",
  groceries: "Groceries",
  transport: "Transport",
  shopping: "Shopping",
  bills: "Bills",
  health: "Health",
  entertainment: "Entertainment",
  travel: "Travel",
  education: "Education",
  other: "Other",
};
export async function removed(db) {
  const have = new Set((await categories(db)).map((r) => r.key));
  return Object.entries(defaults)
    .filter(([k]) => !have.has(k))
    .map(([key, label]) => ({ key, label }));
}
export async function categoryWrite(db, path, d) {
  let k = text(d.key, 60);
  const cats = await categories(db);
  if (path.endsWith("/delete")) {
    if (k === "other") fail(422, "Cannot delete Other");
    await db.batch([
      stmt(db, "DELETE FROM merchant_rules WHERE category=?", k),
      stmt(
        db,
        "UPDATE entries SET category='other',updated_at=?,version=version+1 WHERE category=?",
        now(),
        k,
      ),
      stmt(db, "UPDATE recurring SET category='other' WHERE category=?", k),
      stmt(db, "DELETE FROM budgets WHERE category=?", k),
      stmt(db, "DELETE FROM categories WHERE key=?", k),
    ]);
  } else if (path.endsWith("/move")) {
    const order = cats.map((c) => c.key),
      i = order.indexOf(k);
    if (i < 0) fail(404, "Category not found");
    const j = Math.max(
      0,
      Math.min(order.length - 1, i + (Number(d.delta) > 0 ? 1 : -1)),
    );
    [order[i], order[j]] = [order[j], order[i]];
    await db.batch(
      order.map((k, i) =>
        stmt(db, "UPDATE categories SET position=? WHERE key=?", i, k),
      ),
    );
  } else {
    let label = path.endsWith("/restore") ? defaults[k] : text(d.label, 24);
    if (!label) fail(422, "Category name required");
    const emoji = text(d.emoji, 16);
    if (!k) {
      if (cats.length >= 40) fail(422, "Maximum 40 categories");
      k = "c" + crypto.randomUUID().replaceAll("-", "").slice(0, 12);
    }
    try {
      await run(
        db,
        "INSERT INTO categories(key,label,emoji,position,excluded) VALUES(?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET label=excluded.label,emoji=excluded.emoji,excluded=excluded.excluded",
        k,
        label,
        emoji,
        cats.length - 1,
        d.excluded ? 1 : 0,
      );
    } catch {
      fail(409, "Category name already exists");
    }
  }
  return {
    key: k,
    categories: await categories(db),
    removed_categories: await removed(db),
  };
}
export function occurrence(rule, date) {
  const [y, m, day] = rule.start.split("-").map(Number),
    [yy, mm] = date.split("-").map(Number);
  if (
    date < rule.start ||
    date < rule.floor ||
    (rule.until && date.slice(0, 7) > rule.until.slice(0, 7)) ||
    rule.paused
  )
    return false;
  if (rule.every === "year" && mm !== m) return false;
  const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  return Number(date.slice(8, 10)) === Math.min(day, last);
}
export async function postRecurring(db, time = Date.now()) {
  const t = now(time),
    date = t.slice(0, 10);
  if (Number(t.slice(11, 13)) < 9) return [];
  const rules = await all(db, "SELECT * FROM recurring WHERE paused=0"),
    due = rules.filter((r) => occurrence(r, date));
  if (!due.length) return [];
  const statements = [];
  for (let i = 0; i < due.length; i += 40) {
    const group = due.slice(i, i + 40);
    statements.push(
      stmt(
        db,
        `INSERT OR IGNORE INTO entries(client_id,occurred_at,amount_cents,category,merchant,note,source,created_at,updated_at) SELECT 'rc:'||ckey||':'||?, ?,amount_cents,category,merchant,note,'recurring',?,? FROM recurring WHERE paused=0 AND (${group.map(() => "(id=? AND updated_at=?)").join(" OR ")}) RETURNING id`,
        date,
        date + "T09:00:00+08:00",
        t,
        t,
        ...group.flatMap((r) => [r.id, r.updated_at]),
      ),
    );
  }
  return db.batch(statements);
}
export async function recurringList(db) {
  const rules = await all(
    db,
    "SELECT * FROM recurring ORDER BY paused,merchant",
  );
  const counts = Object.fromEntries(
    (
      await all(
        db,
        "SELECT substr(client_id,4,36) AS ckey,count(*) AS n FROM entries WHERE source='recurring' AND deleted_at IS NULL GROUP BY substr(client_id,4,36)",
      )
    ).map((r) => [r.ckey, r.n]),
  );
  for (const r of rules) {
    r.next = null;
    const local = now(),
      today = local.slice(0, 10),
      [yy, mm] = today.split("-").map(Number),
      sd = Number(r.start.slice(8, 10));
    if (!r.paused)
      for (let i = 0; i < 36; i++) {
        const first = new Date(Date.UTC(yy, mm - 1 + i, 1)),
          y = first.getUTCFullYear(),
          m = first.getUTCMonth() + 1,
          last = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const d =
          String(y).padStart(4, "0") +
          "-" +
          String(m).padStart(2, "0") +
          "-" +
          String(Math.min(sd, last)).padStart(2, "0");
        if (d < today || (d === today && local.slice(11, 13) >= "09")) continue;
        if (occurrence(r, d)) {
          r.next = d;
          break;
        }
      }
    r.posted = counts[r.ckey] || 0;
  }
  return rules;
}
export async function recurringWrite(db, path, d) {
  const t = now(),
    today = t.slice(0, 10);
  if (path.endsWith("/delete"))
    await run(db, "DELETE FROM recurring WHERE id=?", d.id);
  else if (path.endsWith("/pause"))
    await run(
      db,
      "UPDATE recurring SET paused=?,floor=?,updated_at=? WHERE id=?",
      d.paused ? 1 : 0,
      now(Date.now() + 86400000).slice(0, 10),
      t,
      d.id,
    );
  else {
    const v = await clean(db, {
      amount: d.amount,
      merchant: d.merchant,
      category: d.category,
      note: d.note,
    });
    const start = text(d.start, 10),
      until = text(d.until, 10);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
      when(start + "T09:00:00").slice(0, 10) !== start ||
      !["month", "year"].includes(d.every) ||
      (until && !/^\d{4}-\d{2}(?:-\d{2})?$/.test(until))
    )
      fail(422, "Invalid recurrence");
    if (d.id)
      await run(
        db,
        "UPDATE recurring SET merchant=?,amount_cents=?,category=?,note=?,every=?,start=?,until=?,floor=?,updated_at=? WHERE id=?",
        v.merchant,
        v.amount_cents,
        v.category,
        v.note,
        d.every,
        start,
        until,
        today,
        t,
        d.id,
      );
    else {
      if ((await one(db, "SELECT count(*) AS n FROM recurring")).n >= 50)
        fail(422, "Maximum 50 rules");
      await run(
        db,
        "INSERT INTO recurring(ckey,merchant,amount_cents,category,note,every,start,until,floor,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        crypto.randomUUID(),
        v.merchant,
        v.amount_cents,
        v.category,
        v.note,
        d.every,
        start,
        until,
        today,
        t,
        t,
      );
    }
  }
  const posted = await postRecurring(db);
  return {
    recurring: await recurringList(db),
    posted: posted.reduce((n, r) => n + r.results.length, 0),
  };
}
