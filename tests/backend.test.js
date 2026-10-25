import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { cents, when, csv } from "../src/common.js";
import { classify } from "../src/ingest.js";
import { occurrence, postRecurring } from "../src/ledger.js";
import { webcrypto } from "node:crypto";
const digest = async (s) =>
  Buffer.from(
    await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
  ).toString("hex");
test("strict MYR cents, fixed MYT, CSV", () => {
  assert.equal(cents("MYR 1,234.50"), 123450);
  for (const v of ["-2", "USD 2", "1.001", "1e3", 0])
    assert.throws(() => cents(v));
  assert.equal(when("2026-01-01T00:00:00Z"), "2026-01-01T08:00:00+08:00");
  assert.equal(csv(" =SUM(A1)"), `"' =SUM(A1)"`);
  assert.equal(
    classify({ type: "sms", body: "Refund MYR 12.00" }).status,
    "ignored",
  );
  assert.equal(
    classify({ type: "applepay", amount: "USD 12" }).v.amount_cents,
    0,
  );
  assert.equal(
    occurrence(
      {
        start: "2024-01-31",
        floor: "2024-01-31",
        every: "month",
        paused: 0,
        until: "",
      },
      "2024-02-29",
    ),
    true,
  );
});
test("real D1 authentication, tokens, ledger and ingest integration", async () => {
  const mf = new Miniflare({
    modules: true,
    modulesRules: [{ type: "ESModule", include: ["**/*.js"] }],
    scriptPath: "src/worker.js",
    compatibilityDate: "2026-08-06",
    d1Databases: { DB: "test-db" },
    bindings: { SETUP_TOKEN_HASH: await digest("test-setup") },
    modulesRoot: process.cwd(),
  });
  try {
    const db = await mf.getD1Database("DB");
    const sql =
      (await readFile("migrations/0001_initial.sql", "utf8")) +
      "\n" +
      (await readFile("migrations/0002_password_sessions.sql", "utf8")) +
      "\n" +
      (await readFile("migrations/0003_ingest_batch.sql", "utf8")) + '\n' +
      (await readFile("migrations/0004_capture_memory.sql", "utf8")); // preserve trigger bodies through prepare
    const triggers = sql.match(/CREATE TRIGGER[\s\S]*?\nEND;/g) || [];
    const statements = [
      ...sql
        .replace(/CREATE TRIGGER[\s\S]*?\nEND;/g, "")
        .split(";")
        .filter((s) => s.trim()),
      ...triggers,
    ];
    for (const s of statements) await db.prepare(s).run();
    let cookie = "";
    async function req(path, method = "GET", value, extra = {}) {
      const h = {
        "X-Tally-Request": "1",
        Origin: "https://tally.test",
        ...extra,
      };
      if (cookie && !("Cookie" in extra)) h.Cookie = cookie;
      if (value !== undefined) h["Content-Type"] = "application/json";
      const r = await mf.dispatchFetch("https://tally.test" + path, {
        method,
        headers: h,
        body: value === undefined ? undefined : JSON.stringify(value),
      });
      if (r.headers.get("set-cookie"))
        cookie = r.headers.get("set-cookie").split(";")[0];
      const t = await r.text();
      let d;
      try {
        d = JSON.parse(t);
      } catch {
        d = t;
      }
      return { status: r.status, d, headers: r.headers };
    }
    assert.equal((await req("/api/state")).status, 401);
    assert.deepEqual((await req("/api/auth/status")).d, {
      authenticated: false,
      needs_setup: true,
    });
    assert.equal(
      (
        await req("/api/auth/setup", "POST", {
          setup_token: "test-setup",
          password: "long-test-password",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await req("/api/auth/setup", "POST", {
          setup_token: "test-setup",
          password: "long-test-password",
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await req("/api/entries", "POST", {
          amount: "12.50",
          merchant: "Lunch",
        })
      ).status,
      201,
    );
    let s = (await req("/api/state")).d;
    assert.equal(s.entries.length, 1);
    let e = s.entries[0];
    assert.equal(
      (
        await req("/api/entries/" + e.id, "PATCH", {
          version: e.version,
          changes: { amount: "13" },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await req("/api/entries/" + e.id, "PATCH", {
          version: e.version,
          changes: { amount: "14" },
        })
      ).status,
      409,
    );
    e = (await req("/api/state")).d.entries[0];
    e = (
      await req(`/api/entries/${e.id}/delete`, "POST", { version: e.version })
    ).d.entry;
    assert.equal((await req("/api/trash")).d.entries.length, 1);
    assert.equal(
      (
        await req(`/api/entries/${e.id}/restore`, "POST", {
          version: e.version,
        })
      ).status,
      200,
    );
    assert.ok((await req(`/api/entries/${e.id}/history`)).d.events.length >= 4);
    const token = (await req("/api/tokens", "POST", { label: "Phone" })).d;
    assert.ok(token.token);
    cookie = "";
    assert.equal(
      (
        await req("/api/state", "GET", undefined, {
          Authorization: "Bearer " + token.token,
        })
      ).status,
      403,
    );
    const event = {
      event_id: crypto.randomUUID(),
      type: "applepay",
      amount: "RM 20.10",
      merchant: "Shop",
      at: "2026-10-25T10:00:00+08:00",
    };
    const headers = { Authorization: "Bearer " + token.token };
    assert.equal(
      (await req("/api/ingest", "POST", event, headers)).d.accepted,
      1,
    );
    assert.equal(
      (await req("/api/ingest", "POST", event, headers)).d.duplicates,
      1,
    );
    const ar = await db
      .prepare(
        "SELECT count(*) n FROM audit WHERE entry_id=(SELECT id FROM entries WHERE client_id=?)",
      )
      .bind("event:" + event.event_id)
      .first();
    assert.equal(ar.n, 1);
    assert.equal(
      (
        await req(
          "/api/ingest",
          "POST",
          { ...event, event_id: crypto.randomUUID(), amount: "USD 10" },
          headers,
        )
      ).d.accepted,
      1,
    );
    assert.equal(
      (
        await req(
          "/api/ingest",
          "POST",
          {
            event_id: crypto.randomUUID(),
            type: "notification",
            body: "Mystery RM 8.50",
          },
          headers,
        )
      ).d.skipped,
      1,
    );
    assert.equal(
      (await req("/api/auth/login", "POST", { password: "long-test-password" }))
        .status,
      200,
    );
    const sk = (await req("/api/skipped")).d.skipped[0];
    assert.equal(
      (await req(`/api/skipped/${sk.id}/add`, "POST", {})).status,
      200,
    );
    assert.equal((await req("/api/skipped")).d.skipped.length, 0);
    assert.equal(
      (await req("/api/categories", "POST", { label: "Test", excluded: true }))
        .status,
      200,
    );
    assert.equal(
      (await req("/api/budgets", "POST", { category: "_total", amount: "100" }))
        .d.budgets._total,
      10000,
    );
    assert.equal(
      (
        await req("/api/recurring", "POST", {
          amount: "5",
          merchant: "Rent",
          every: "month",
          start: "2026-01-25",
        })
      ).status,
      200,
    );
    const r = await db.prepare("SELECT * FROM recurring").first();
    await db
      .prepare("UPDATE recurring SET floor=? WHERE id=?")
      .bind("2026-01-01", r.id)
      .run();
    await postRecurring(db, Date.parse("2026-10-25T01:00:00Z"));
    await postRecurring(db, Date.parse("2026-10-25T01:00:00Z"));
    assert.equal(
      (
        await db
          .prepare("SELECT count(*) n FROM entries WHERE client_id LIKE ?")
          .bind("rc:" + r.ckey + ":2026-10-25")
          .first()
      ).n,
      1,
    );
    const oldCookie = cookie;
    assert.equal(
      (
        await req("/api/auth/password", "POST", {
          old_password: "long-test-password",
          new_password: "another-test-password",
        })
      ).status,
      200,
    );
    assert.notEqual(cookie, oldCookie);
    assert.equal(
      (await req("/api/auth/status", "GET", undefined, { Cookie: oldCookie })).d
        .authenticated,
      false,
    );
    assert.equal(
      (await db.prepare("SELECT count(*) n FROM sessions").first()).n,
      1,
    );
    assert.equal(
      (await req("/api/tokens/" + token.id + "/revoke", "POST", {})).status,
      200,
    );
    assert.equal(
      (await req("/api/ingest", "POST", event, headers)).status,
      401,
    );
    assert.equal(
      (await req("/api/export.csv")).headers.get("cache-control"),
      "no-store",
    );
  } finally {
    await mf.dispose();
  }
});
