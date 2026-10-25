import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./backend-helpers.js";
test("100-event atomic ingest and 200-item conditional bulk on real D1", async () => {
  const { mf, db, request: q } = await fixture();
  try {
    await q("/api/auth/setup", "POST", {
      setup_token: "setup-test",
      password: "a-long-password",
    });
    const batch = () =>
      Array.from({ length: 100 }, (_, i) => ({
        event_id: crypto.randomUUID(),
        type: "applepay",
        amount: "1.01",
        merchant: "Shop " + i,
      }));
    const first = batch(),
      second = batch();
    const a = await q("/api/ingest", "POST", first);
    assert.equal(a.status, 200);
    assert.equal(a.data.accepted, 100);
    const b = await q("/api/ingest", "POST", second);
    assert.equal(b.data.accepted, 100);
    assert.equal((await q("/api/ingest", "POST", first)).data.duplicates, 100);
    assert.equal(
      (await db.prepare("SELECT count(*) n FROM audit").first()).n,
      200,
    );
    assert.equal(
      (
        await db
          .prepare(
            "SELECT count(*) n FROM ingest_events WHERE payload IS NOT NULL",
          )
          .first()
      ).n,
      0,
    );
    const entries = (await q("/api/state")).data.entries;
    assert.equal(entries.length, 200);
    const bulk = await q("/api/inbox/bulk", "POST", {
      action: "confirm",
      items: entries.map((e) => ({ id: e.id, version: e.version })),
    });
    assert.equal(bulk.status, 200);
    assert.equal(bulk.data.entries.length, 200);
    assert.equal(bulk.data.errors.length, 0);
    const stale = await q("/api/inbox/bulk", "POST", {
      action: "confirm",
      items: entries.map((e) => ({ id: e.id, version: e.version })),
    });
    assert.equal(stale.data.errors.length, 200);
    assert.equal(stale.data.entries.length, 0);
    assert.equal(
      (await db.prepare("SELECT count(*) n FROM audit").first()).n,
      400,
    );
  } finally {
    await mf.dispose();
  }
});
