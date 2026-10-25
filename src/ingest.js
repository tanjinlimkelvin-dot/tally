import {
  fail,
  now,
  when,
  text,
  cents,
  key,
  stmt,
  all,
  one,
  run,
  json,
  body,
  hash,
} from "./common.js";
import { insert, clean } from "./ledger.js";
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function classify(o) {
  const raw = [o.title, o.body, o.text].filter(Boolean).join(" ");
  // Status words in a merchant name (e.g. Income Cafe) are not transaction direction.
  const negative=/\b(refund(?:ed)?|reversal|income|received|credited|salary|otp|tac|declined|failed|unsuccessful|pending|reload|top[ -]?up|cash[ -]?in|self[ -]?transfer|own account|transfer between)\b/i;
  const positive=/\b(paid|spent|charged|debited|deducted|purchase|payment to)\b/i;
  const statusText=raw.split(/\b(?:at|to)\s+/i)[0];
  if(negative.test(statusText)) return {status:positive.test(raw)?'skipped':'ignored',raw};
  if(positive.test(raw)&&/[.!]\s+.*\b(refund(?:ed)?|credited|reversal|received)\b/i.test(raw)) return {status:'skipped',raw};
  let amount = o.amount,
    merchant = o.merchant || o.name || "";
  if (o.type !== "applepay") {
    if (
      !/\b(paid|spent|charged|debited|deducted|purchase|payment to)\b/i.test(
        raw,
      )
    )
      return { status: "skipped", raw };
    if (amount == null) {
      const m = raw.match(
        /\b(?:charged\s+for|paid|spent|debited|deducted|purchase(?:d)?)\s*(?:for\s+)?(?:MYR|RM|USD|SGD|EUR|GBP|AUD|JPY|CNY)\s*\d[\d,.]*/i,
      ) || raw.match(/\b(?:MYR|RM|USD|SGD|EUR|GBP|AUD|JPY|CNY)\s*(?!0(?:\D|$))\d[\d,.]*/i);
      amount = m ? m[0].replace(/^.*?(?=\b(?:MYR|RM|USD|SGD|EUR|GBP|AUD|JPY|CNY)\s*\d)/i, '') : null;
    }
    merchant =
      merchant ||
      raw.match(
        /\b(?:at|to)\s+(.+?)(?:\s+(?:on|via|using|with)\b|[.!]|$)/i,
      )?.[1] ||
      "Card payment";
  }
  let n = 0,
    note = "";
  if (amount != null && String(amount).trim()) {
    const marker = String(amount)
      .replace(/[\d.,\s]/g, "")
      .toUpperCase();
    if (marker && !["RM", "MYR"].includes(marker)) {
      note = "Foreign currency — enter the MYR amount manually";
    } else {
      try { n = cents(amount); }
      catch(e) { if(o.type!=='applepay')return {status:'skipped',raw}; throw e; }
    }
  }
  if (!n && !note) note = "Missing amount — enter manually";
  return {
    status: "accepted",
    v: {
      amount_cents: n,
      merchant: text(merchant, 120),
      card: text(o.card, 80),
      note,
      occurred_at: when(o.at),
      category: "other",
      raw_amount: text(String(amount ?? ""), 200),
    },
  };
}
export async function ingest(req, db) {
  const raw = await body(req);
  let objects;
  try {
    if (req.headers.get("Content-Type")?.includes("application/json")) {
      const d = JSON.parse(raw);
      objects = Array.isArray(d) ? d : [d];
    } else
      objects = raw
        .split(/\r?\n/)
        .filter((x) => x.trim())
        .map((x) => {
          try {
            return JSON.parse(x);
          } catch {
            return null;
          }
        });
  } catch {
    fail(422, "Invalid JSON");
  }
  if (!objects.length || objects.length > 100)
    fail(422, "Batch must contain 1–100 events");
  const count = {
    accepted: 0,
    duplicates: 0,
    ignored: 0,
    invalid: 0,
    skipped: 0,
  };
  const eventIds = [
    ...new Set(
      objects
        .filter((o) => o && uuid.test(o.event_id))
        .map((o) => o.event_id.toLowerCase()),
    ),
  ];
  const existing = new Set(
    eventIds.length
      ? (
          await all(
            db,
            `SELECT event_id FROM ingest_events WHERE event_id IN (${eventIds.map(() => "?").join(",")})`,
            ...eventIds,
          )
        ).map((r) => r.event_id)
      : [],
  );
  const ignored = new Set(
    (await all(db, "SELECT merchant_key FROM ignored_taps")).map(
      (r) => r.merchant_key,
    ),
  );
  const rules = new Map((await all(db, "SELECT merchant_key,category FROM merchant_rules")).map(r=>[r.merchant_key,r.category]));
  const categoryKeys = new Set((await all(db, "SELECT key FROM categories")).map(r=>r.key));
  const pending = [];
  for (const o of objects) {
    try {
      if (!o || !uuid.test(o.event_id)) fail(422, "Invalid event");
      const id = o.event_id.toLowerCase();
      if (existing.has(id)) {
        count.duplicates++;
        continue;
      }
      if (!["applepay", "notification", "sms"].includes(o.type))
        fail(422, "Invalid event");
      for (const f of ["title", "body", "text"])
        if (o[f] != null && (typeof o[f] !== "string" || o[f].length > 2000))
          fail(422, "Invalid event text");
      const c = classify(o);
      if (c.status === "accepted" && o.type === 'applepay' && !c.v.amount_cents && ignored.has(key(c.v.merchant)))
        c.status = "ignored";
      if (c.status === 'accepted') {
        const learned=rules.get(c.v.merchant.trim().toUpperCase());
        const guesses=[['food',/TEALIVE|COFFEE|ZUS|KFC|MCDONALD|RESTORAN|CAFE|NASI|FOODPANDA|GRABFOOD/i],['groceries',/GROCER|SPEEDMART|LOTUS|MYDIN|AEON|KK MART|FAMILY MART/i],['transport',/PETRON|SHELL|CALTEX|PARKING|TOLL|MRT|LRT/i],['shopping',/SHOPEE|LAZADA|DECATHLON|UNIQLO/i]];
        c.v.category=learned || guesses.find(([k,re])=>categoryKeys.has(k)&&re.test(c.v.merchant))?.[0] || 'other';
      }
      let payload = null;
      if (c.status === "accepted")
        payload = {
          ...c.v,
          source:
            o.type === "notification"
              ? "tng"
              : o.type === "sms"
                ? "bank"
                : "applepay",
          created_at: now(),
        };
      if (c.status === "skipped") {
        let amount = 0;
        try {
          const m = c.raw.match(/(?:MYR|RM)\s*(\d[\d,.]*)/i);
          if (m) amount = cents(m[1]);
        } catch {}
        payload = {
          occurred_at: when(o.at),
          title: String(o.title || "").slice(0, 200),
          body: String(o.body || o.text || "").slice(0, 2000),
          amount_cents: amount,
        };
      }
      pending.push([id, c.status, payload ? JSON.stringify(payload) : null]);
      existing.add(id);
    } catch (e) {
      if (e.status === 422) count.invalid++;
      else throw e;
    }
  }
  if (pending.length) {
    // <=90 bindings per SQL statement; one atomic D1 batch for all claims + trigger writes.
    const statements = [];
    for (let i = 0; i < pending.length; i += 30) {
      const group = pending.slice(i, i + 30);
      statements.push(
        stmt(
          db,
          `INSERT OR IGNORE INTO ingest_events(event_id,status,payload) VALUES ${group.map(() => "(?,?,?)").join(",")} RETURNING event_id,status`,
          ...group.flat(),
        ),
      );
    }
    const results = await db.batch(statements);
    let claimed = 0;
    for (const r of results)
      for (const row of r.results) {
        count[row.status]++;
        claimed++;
      }
    count.duplicates += pending.length - claimed;
  }
  const ids = eventIds.length
    ? (
        await all(
          db,
          `SELECT id FROM entries WHERE client_id IN (${eventIds.map(() => "?").join(",")})`,
          ...eventIds.map((id) => "event:" + id),
        )
      ).map((r) => r.id)
    : [];
  await run(db, "INSERT INTO ingest_meta(id,last_at,bytes,invalid) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET last_at=excluded.last_at,bytes=excluded.bytes,invalid=excluded.invalid", now(), new TextEncoder().encode(raw).length, count.invalid);
  const single=pending.length===1&&pending[0][1]==='accepted'?JSON.parse(pending[0][2]):null;
  const message=count.invalid ? `Could not read ${count.invalid} event(s) — check the shortcut fields. ${count.accepted} logged.`
    : count.accepted ? (count.accepted===1&&single ? (single.amount_cents?`Logged RM${(single.amount_cents/100).toFixed(2)} · ${single.merchant}`:`Logged ${single.merchant||'Wallet tap'} without an amount — open Tally to review`) : `Logged ${count.accepted} expenses — open Tally to review`)
    : count.skipped ? 'Skipped — unrecognized message; open Tally to review'
    : count.ignored ? (objects.at(-1)?.type==='applepay'?'Skipped — not a payment (ignored pass)':'Skipped — not a spending notification')
    : 'Synced — nothing new';
  const result = {
    ok: true,
    status: "saved",
    ...count,
    ids,
    message,
  };
  return new URL(req.url).searchParams.get("format") === "text"
    ? new Response(result.message, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      })
    : json(result);
}
export async function skipped(db, id, action, d) {
  const r = await one(
    db,
    "SELECT * FROM skipped WHERE id=? AND status='new'",
    id,
  );
  if (!r) fail(404, "Already handled");
  if (action === "dismiss") {
    await run(
      db,
      "UPDATE skipped SET status='dismissed' WHERE id=? AND status='new'",
      id,
    );
    return { entry: null };
  }
  const v = await clean(db, {
    amount: d.amount ?? (r.amount_cents / 100).toFixed(2),
    merchant: d.merchant ?? r.title.slice(0, 120),
    category: d.category || "other",
    occurred_at: r.occurred_at,
    note: d.note || "Added from skipped notification",
  });
  const cid = "sk-add:" + id;
  await db.batch([
    insert(
      db,
      v,
      cid,
      "manual",
      0,
      "WHERE EXISTS(SELECT 1 FROM skipped WHERE id=? AND status='new')",
      [id],
    ),
    stmt(
      db,
      "UPDATE skipped SET status='added' WHERE id=? AND EXISTS(SELECT 1 FROM entries WHERE client_id=?)",
      id,
      cid,
    ),
  ]);
  const row = await one(db, "SELECT * FROM entries WHERE client_id=?", cid);
  return {
    entry: {
      ...row,
      amount: row.amount_cents / 100,
      version: String(row.version),
    },
  };
}
