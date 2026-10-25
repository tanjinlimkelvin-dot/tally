import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./backend-helpers.js";
import { postRecurring } from "../src/ledger.js";
test("security bounds, CSRF, concurrent writes, scoped upload and SQL throttling", async () => {
  const { mf, db, request: q } = await fixture();
  try {
    assert.equal(
      (
        await q("/api/auth/setup", "POST", {
          setup_token: "wrong",
          password: "a-long-password",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await q(
          "/api/auth/setup",
          "POST",
          { setup_token: "setup-test", password: "a-long-password" },
          { Origin: "https://evil.test" },
        )
      ).status,
      403,
    );
    const setup = await Promise.all([
      q("/api/auth/setup", "POST", {
        setup_token: "setup-test",
        password: "a-long-password",
      }),
      q("/api/auth/setup", "POST", {
        setup_token: "setup-test",
        password: "a-long-password",
      }),
    ]);
    assert.deepEqual(setup.map((r) => r.status).sort(), [200, 409]);
    assert.equal(
      (
        await q(
          "/api/entries",
          "POST",
          { amount: "4" },
          { "X-Tally-Request": "" },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await q(
          "/api/entries",
          "POST",
          { amount: "4" },
          { Origin: "https://evil.test" },
        )
      ).status,
      403,
    );
    const a = (await q("/api/entries", "POST", { amount: "4", merchant: "A" }))
      .data.entry;
    const writes = await Promise.all([
      q(`/api/entries/${a.id}`, "PATCH", {
        version: a.version,
        changes: { amount: "5" },
      }),
      q(`/api/entries/${a.id}`, "PATCH", {
        version: a.version,
        changes: { amount: "6" },
      }),
    ]);
    assert.deepEqual(writes.map((r) => r.status).sort(), [200, 409]);
    assert.equal(
      (
        await db
          .prepare("SELECT count(*) n FROM audit WHERE entry_id=?")
          .bind(a.id)
          .first()
      ).n,
      2,
    );
    const fresh = (await q("/api/state")).data.entries.find(
        (e) => e.id === a.id,
      ),
      b = (await q("/api/entries", "POST", { amount: "4", merchant: "B" })).data
        .entry;
    const merged = await q(`/api/entries/${fresh.id}/merge`, "POST", {
      version: fresh.version,
      other: b.id,
      other_version: b.version,
    });
    assert.equal(merged.status, 200);
    assert.equal(merged.data.merged.merged_into, fresh.id);
    assert.equal(
      (
        await q(`/api/entries/${fresh.id}/merge`, "POST", {
          version: fresh.version,
          other: b.id,
          other_version: b.version,
        })
      ).status,
      409,
    );
    const c = (
      await q("/api/categories", "POST", { label: "Excluded", excluded: true })
    ).data.key;
    await q("/api/entries", "POST", {
      amount: "100",
      merchant: "X",
      category: c,
    });
    await q("/api/budgets", "POST", { category: "_total", amount: "20" });
    assert.equal(
      (await q("/api/budgets/alerts", "POST", {})).data.alerts.length,
      0,
    );
    assert.equal(
      (await q("/api/categories/delete", "POST", { key: c })).status,
      200,
    );
    assert.equal(
      (await q("/api/budgets/alerts", "POST", {})).data.alerts.length,
      2,
    );
    assert.equal(
      (await q("/api/budgets/alerts", "POST", {})).data.alerts.length,
      0,
    );
    assert.equal(
      (await q("/api/categories/delete", "POST", { key: "other" })).status,
      422,
    );
    const token = (await q("/api/tokens", "POST", { label: "Phone" })).data
        .token,
      h = { Authorization: "Bearer " + token };
    assert.equal(
      (
        await q(
          "/api/quick",
          "POST",
          { text: "12.50 kopi", client_id: "quick-fixed-id" },
          h,
        )
      ).status,
      201,
    );
    assert.equal(
      (
        await q(
          "/api/quick",
          "POST",
          { text: "12.50 kopi", client_id: "quick-fixed-id" },
          h,
        )
      ).data.created,
      false,
    );
    assert.equal((await q("/api/tokens", "POST", {}, h)).status, 403);
    const ev = {
      event_id: crypto.randomUUID(),
      type: "applepay",
      amount: "MYR 7",
      merchant: "Queue",
    };
    const duplicates = await Promise.all([
      q("/api/ingest", "POST", ev, h),
      q("/api/ingest", "POST", ev, h),
    ]);
    assert.equal(
      duplicates.reduce((n, r) => n + r.data.accepted, 0),
      1,
    );
    assert.equal(
      duplicates.reduce((n, r) => n + r.data.duplicates, 0),
      1,
    );
    const next = { ...ev, event_id: crypto.randomUUID() };
    const nd = await q(
      "/api/ingest",
      "POST",
      [JSON.stringify(next), JSON.stringify(next), "bad json"].join("\n"),
      { ...h, "Content-Type": "application/x-ndjson" },
    );
    assert.equal(nd.data.accepted, 1);
    assert.equal(nd.data.duplicates, 1);
    assert.equal(nd.data.invalid, 1);
    assert.equal(
      (
        await q(
          "/api/ingest",
          "POST",
          Array.from({ length: 101 }, () => ev),
          h,
        )
      ).status,
      422,
    );
    assert.equal(
      (
        await q("/api/ingest", "POST", "x".repeat(65537), {
          ...h,
          "Content-Type": "text/plain",
        })
      ).status,
      413,
    );
    const pass = {
      event_id: crypto.randomUUID(),
      type: "applepay",
      merchant: "Car key",
    };
    await q("/api/ingest", "POST", pass, h);
    let pe = (await q("/api/state")).data.entries.find(
      (e) => e.client_id === "event:" + pass.event_id,
    );
    assert.equal(
      (
        await q(`/api/entries/${pe.id}/confirm`, "POST", {
          version: pe.version,
        })
      ).status,
      422,
    );
    assert.equal(
      (
        await q(`/api/entries/${pe.id}/not-payment`, "POST", {
          version: pe.version,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await q(
          "/api/ingest",
          "POST",
          { ...pass, event_id: crypto.randomUUID() },
          h,
        )
      ).data.ignored,
      1,
    );
    await q("/api/ignored/remove", "POST", { key: "CAR KEY" });
    assert.equal(
      (
        await q(
          "/api/ingest",
          "POST",
          { ...pass, event_id: crypto.randomUUID() },
          h,
        )
      ).data.accepted,
      1,
    );
    const skipped = await q(
      "/api/ingest",
      "POST",
      { event_id: crypto.randomUUID(), type: "sms", body: "Refund MYR 10.00" },
      h,
    );
    assert.equal(skipped.data.ignored, 1);
    const tokenId = (await q("/api/tokens")).data.tokens[0].id;
    const minute = Math.floor(Math.floor(Date.now() / 1000) / 60);
    await db
      .prepare(
        "INSERT INTO limits(key,n,expires) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET n=excluded.n",
      )
      .bind(
        "token-minute:" + tokenId + ":" + minute,
        60,
        Math.floor(Date.now() / 1000) + 120,
      )
      .run();
    assert.equal((await q("/api/ingest", "POST", ev, h)).status, 429);
    assert.equal(
      (await q("/api/state", "GET", undefined, { Cookie: "" })).status,
      401,
    );
    const cookie = (
      await q("/api/auth/login", "POST", { password: "a-long-password" })
    ).headers.get("set-cookie");
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Strict/);
  } finally {
    await mf.dispose();
  }
});
test("recurring 9am, yearly clamp, no paused backfill, stable deleted IDs", async () => {
  const { mf, db, request: q } = await fixture();
  try {
    await q("/api/auth/setup", "POST", {
      setup_token: "setup-test",
      password: "a-long-password",
    });
    await q("/api/recurring", "POST", {
      merchant: "Leap",
      amount: "9",
      every: "year",
      start: "2024-02-29",
    });
    let r = await db.prepare("SELECT * FROM recurring").first();
    await db
      .prepare("UPDATE recurring SET floor=? WHERE id=?")
      .bind("2024-01-01", r.id)
      .run();
    await postRecurring(db, Date.parse("2027-02-28T00:59:00Z"));
    assert.equal(
      (await db.prepare("SELECT count(*) n FROM entries").first()).n,
      0,
    );
    await postRecurring(db, Date.parse("2027-02-28T01:00:00Z"));
    await postRecurring(db, Date.parse("2027-02-28T01:01:00Z"));
    assert.equal(
      (await db.prepare("SELECT count(*) n FROM entries").first()).n,
      1,
    );
    const e = await db.prepare("SELECT * FROM entries").first();
    await q(`/api/entries/${e.id}/delete`, "POST", {
      version: String(e.version),
    });
    await postRecurring(db, Date.parse("2027-02-28T02:00:00Z"));
    assert.equal(
      (await db.prepare("SELECT count(*) n FROM entries").first()).n,
      1,
    );
    await q("/api/recurring/pause", "POST", { id: r.id, paused: true });
    await postRecurring(db, Date.parse("2028-02-29T01:00:00Z"));
    assert.equal(
      (await db.prepare("SELECT count(*) n FROM entries").first()).n,
      1,
    );
    await q("/api/recurring/pause", "POST", { id: r.id, paused: false });
    await postRecurring(db, Date.parse("2028-03-01T01:00:00Z"));
    assert.equal(
      (await db.prepare("SELECT count(*) n FROM entries").first()).n,
      1,
    );
    await q("/api/recurring/delete", "POST", { id: r.id });
    await q("/api/recurring", "POST", {
      merchant: "New",
      amount: "8",
      every: "year",
      start: "2024-02-29",
    });
    const nr = await db.prepare("SELECT * FROM recurring").first();
    assert.notEqual(nr.ckey, r.ckey);
  } finally {
    await mf.dispose();
  }
});
