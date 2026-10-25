import {
  Problem,
  fail,
  now,
  cents,
  out,
  stmt,
  all,
  one,
  run,
  json,
  data,
  csv,
  hash,
  text,
} from "./common.js";
import { auth, authorize, tokens } from "./auth.js";
import {
  create,
  entry,
  edit,
  merge,
  state,
  categories,
  categoryWrite,
  recurringWrite,
  postRecurring,
} from "./ledger.js";
import { ingest, skipped } from "./ingest.js";
async function route(req, env) {
  const u = new URL(req.url),
    p = u.pathname,
    db = env.DB;
  if (p === "/health" || p === "/api/health") return json({ ok: true });
  if (!p.startsWith("/api/"))
    return env.ASSETS
      ? env.ASSETS.fetch(req)
      : new Response("Not found", { status: 404 });
  if (p.startsWith("/api/auth/")) return auth(req, env, p);
  const principal = await authorize(req, env, p);
  if (p.startsWith("/api/tokens")) {
    if (!["GET", "POST"].includes(req.method)) fail(405, "Method not allowed");
    return tokens(req, db, p);
  }
  if (p === "/api/ingest" && req.method === "POST") return ingest(req, db);
  if (req.method === "GET") {
    if (p === "/api/state") return json(await state(db));
    if (p === "/api/trash")
      return json({
        entries: (
          await all(
            db,
            "SELECT * FROM entries WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 300",
          )
        ).map(out),
      });
    if (p === "/api/skipped")
      return json({
        skipped: await all(
          db,
          "SELECT * FROM skipped WHERE status='new' ORDER BY occurred_at DESC LIMIT 100",
        ),
      });
    let m = p.match(/^\/api\/entries\/(\d+)\/history$/);
    if (m) {
      const r = await entry(db, Number(m[1]));
      const labels=Object.fromEntries((await categories(db)).map(c=>[c.key,c.label]));
      const fields={amount_cents:'Amount',category:'Category',merchant:'Merchant',note:'Note',occurred_at:'Date'};
      const display=(k,v)=>v==null||v===''?'—':k==='amount_cents'?`RM${(v/100).toFixed(2)}`:k==='category'?(labels[v]||v):String(v);
      const events = (
        await all(
          db,
          "SELECT * FROM audit WHERE entry_id=? ORDER BY id DESC",
          r.id,
        )
      ).map((e) => {
        const b = JSON.parse(e.before_json || "null"),
          a = JSON.parse(e.after_json || "null");
        return {
          action: e.action,
          label:
            {
              create: "Added",
              edit: "Edited",
              delete: "Deleted",
              restore: "Restored from Trash",
              merge: "Merged as duplicate",
            }[e.action] || "Logged",
          at: e.at,
          why: e.why,
          summary: "",
          changes:
            b && a
              ? Object.keys(a)
                  .filter((k) => a[k] !== b[k])
                  .map((k) => ({
                    field: k,
                    label: fields[k] || k,
                    from: display(k,b[k]),
                    to: display(k,a[k]),
                  }))
              : [],
        };
      });
      return json({ entry: out(r), events });
    }
    if (p === "/api/export.csv") {
      const rows = await all(
        db,
        "SELECT e.*,c.label,c.excluded FROM entries e LEFT JOIN categories c ON c.key=e.category WHERE deleted_at IS NULL ORDER BY occurred_at",
      );
      const lines = [
        [
          "date",
          "amount_myr",
          "kind",
          "category",
          "merchant",
          "note",
          "card",
          "source",
          "excluded_from_totals",
        ],
        ...rows.map((r) => [
          r.occurred_at,
          (r.amount_cents / 100).toFixed(2),
          r.kind,
          r.label,
          r.merchant,
          r.note,
          r.card,
          r.source,
          r.excluded ? "yes" : "no",
        ]),
      ];
      return new Response(
        "\uFEFF" + lines.map((r) => r.map(csv).join(",")).join("\r\n"),
        {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="tally.csv"',
          },
        },
      );
    }
    fail(404, "Endpoint not found");
  }
  if (!["POST", "PATCH"].includes(req.method)) fail(405, "Method not allowed");
  const d = await data(req);
  if (p === "/api/entries" || p === "/api/quick") {
    let fields = d;
    if (p === "/api/quick" && typeof d.text === "string") {
      if (d.text.length > 500) fail(422, "Quick text too long");
      const m = d.text.match(/\b(?:RM|MYR)\s*(\d[\d,.]*)(?=\s|$)/i) || d.text.match(/^\s*(\d[\d,.]*)(?=\s|$)/);
      if (!m || /\b(?:USD|SGD|EUR|GBP|AUD|JPY|CNY|CAD|NZD|HKD|refund|income|received|transfer)\b|[$€£¥]/i.test(d.text))
        fail(422, "Use a MYR spending amount, e.g. RM12.50 kopi");
      cents(m[1]); // validate the entire token; never truncate precision or reinterpret grouping as decimals
      fields = {
        amount: m[1],
        merchant: (
          d.text.slice(0, m.index) +
          " " +
          d.text.slice(m.index + m[0].length)
        )
          .trim()
          .slice(0, 120),
        client_id: d.client_id,
      };
    }
    if (principal.token_id) {
      const clientKey=d.client_id==null?crypto.randomUUID():text(d.client_id,100);
      fields={...fields,client_id:'q:'+principal.token_id+':'+(await hash(clientKey)).slice(0,48)};
    }
    const result = await create(db, fields);
    if (principal.token_id) return json({ok:true,created:result.created,message:result.created?'Logged expense':'Synced — nothing new'},result.created?201:200);
    return json(
      {
        ...result,
        ...(p === "/api/quick" ? { message: "Expense added" } : {}),
      },
      result.created ? 201 : 200,
    );
  }
  if (
    [
      "/api/categories",
      "/api/categories/move",
      "/api/categories/delete",
      "/api/categories/restore",
    ].includes(p)
  )
    return json(await categoryWrite(db, p, d));
  if (
    [
      "/api/recurring",
      "/api/recurring/pause",
      "/api/recurring/delete",
    ].includes(p)
  )
    return json(await recurringWrite(db, p, d));
  if (p === "/api/budgets") {
    if (
      d.category !== "_total" &&
      !(await one(db, "SELECT key FROM categories WHERE key=?", d.category))
    )
      fail(422, "Invalid category");
    if (d.amount == null || d.amount === "" || Number(d.amount) === 0)
      await run(db, "DELETE FROM budgets WHERE category=?", d.category);
    else
      await run(
        db,
        "INSERT INTO budgets(category,cents) VALUES(?,?) ON CONFLICT(category) DO UPDATE SET cents=excluded.cents",
        d.category,
        cents(d.amount),
      );
    return json({
      budgets: Object.fromEntries(
        (await all(db, "SELECT * FROM budgets")).map((r) => [
          r.category,
          r.cents,
        ]),
      ),
    });
  }
  if (p === "/api/budgets/alerts") {
    const month = d.month || now().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail(422, "Invalid month");
    const spent = await all(
      db,
      "SELECT e.category,sum(e.amount_cents) AS n,c.excluded FROM entries e JOIN categories c ON c.key=e.category WHERE e.deleted_at IS NULL AND substr(e.occurred_at,1,7)=? GROUP BY e.category",
      month,
    );
    const sums = Object.fromEntries(spent.map((r) => [r.category, r.n]));
    sums._total = spent.reduce((n, r) => n + (r.excluded ? 0 : r.n), 0);
    const candidates = [];
    for (const b of await all(db, "SELECT * FROM budgets"))
      for (const level of [100, 80])
        if ((sums[b.category] || 0) * 100 >= b.cents * level)
          candidates.push({
            category: b.category,
            level,
            spent: sums[b.category],
            budget: b.cents,
          });
    const statements = [];
    for (let i = 0; i < candidates.length; i += 30) {
      const group = candidates.slice(i, i + 30);
      statements.push(
        stmt(
          db,
          `INSERT OR IGNORE INTO alerts(month,category,level) VALUES ${group.map(() => "(?,?,?)").join(",")} RETURNING category,level`,
          ...group.flatMap((b) => [month, b.category, b.level]),
        ),
      );
    }
    const created = new Set(
      statements.length
        ? (await db.batch(statements)).flatMap((r) =>
            r.results.map((a) => a.category + ":" + a.level),
          )
        : [],
    );
    const alerts = candidates.filter((a) =>
      created.has(a.category + ":" + a.level),
    );
    return json({ alerts });
  }
  if (p === "/api/inbox/bulk") {
    if (
      d.action !== "confirm" ||
      !Array.isArray(d.items) ||
      !d.items.length ||
      d.items.length > 200
    )
      fail(422, "Invalid bulk request");
    const valid = [],
      errors = [],
      seen = new Set();
    for (const it of d.items) {
      if (
        !it ||
        !Number.isSafeInteger(it.id) ||
        !/^\d+$/.test(String(it.version)) ||
        seen.has(it.id)
      ) {
        errors.push({ id: it?.id ?? null, error: "Invalid or duplicate item" });
        continue;
      }
      seen.add(it.id);
      valid.push(it);
    }
    const statements = [];
    for (let i = 0; i < valid.length; i += 45) {
      const group = valid.slice(i, i + 45);
      statements.push(
        stmt(
          db,
          `UPDATE entries SET needs_review=0,updated_at=?,version=version+1 WHERE deleted_at IS NULL AND amount_cents>0 AND (${group.map(() => "(id=? AND version=?)").join(" OR ")}) RETURNING *`,
          now(),
          ...group.flatMap((it) => [it.id, Number(it.version)]),
        ),
      );
    }
    const entries = statements.length
        ? (await db.batch(statements)).flatMap((r) => r.results.map(out))
        : [],
      done = new Set(entries.map((r) => r.id));
    for (const it of valid)
      if (!done.has(it.id))
        errors.push({
          id: it.id,
          error: "Entry changed, deleted or has no MYR amount",
        });
    return json({ entries, errors });
  }
  if (p === "/api/ignored/remove") {
    await run(db, "DELETE FROM ignored_taps WHERE merchant_key=?", d.key);
    return json({ ignored_taps: await all(db, "SELECT * FROM ignored_taps") });
  }
  let m = p.match(/^\/api\/(?:skipped|missed)\/(\d+)\/(add|dismiss)$/);
  if (m) return json(await skipped(db, Number(m[1]), m[2], d));
  m = p.match(
    /^\/api\/entries\/(\d+)(?:\/(confirm|delete|restore|not-payment|merge))?$/,
  );
  if (m) {
    if (m[2] === "merge") return json(await merge(db, Number(m[1]), d));
    return json({ entry: await edit(db, Number(m[1]), d, m[2] || "edit") });
  }
  fail(404, "Endpoint not found");
}
export default {
  async fetch(req, env) {
    let res;
    try {
      res = await route(req, env);
    } catch (e) {
      res = json(
        { error: e instanceof Problem ? e.message : "Server error" },
        e.status || 500,
      );
    }
    const h = new Headers(res.headers);
    if (
      new URL(req.url).pathname.startsWith("/api/") ||
      new URL(req.url).pathname === "/health"
    )
      h.set("Cache-Control", "no-store");
    h.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    );
    h.set("X-Content-Type-Options", "nosniff");
    h.set("Referrer-Policy", "no-referrer");
    return new Response(res.body, { status: res.status, headers: h });
  },
  async scheduled(controller, env) {
    await postRecurring(env.DB, controller.scheduledTime);
    await env.DB.batch([
      stmt(
        env.DB,
        "DELETE FROM limits WHERE expires<?",
        Math.floor(Date.now() / 1000),
      ),
      stmt(env.DB, "DELETE FROM sessions WHERE expires<?", Date.now()),
    ]);
  },
};
