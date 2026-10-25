# Verification — Tally Cloud v1

## Executed, not simulated

- `npm test`: **9 test groups passed**. Includes Miniflare/workerd backed by real local D1, concurrent owner setup, optimistic edit conflicts, rate bounds, token scope, CSRF, stable event retries/deletion tombstones, 100-event atomic ingest, 200-item bulk confirmation, category memory, missing/foreign amount handling, recurring 09:00/yearly/month-end/pause rules, merge/restore and audit history.
- `node --test tests/core.test.mjs`: **12 UI-core tests passed** for integer-cent totals, dates, keypad, exclusions, search, offline merge and review grouping.
- `tests/qa_browser.py`: **passed on both local Wrangler and the deployed HTTPS Worker with real remote D1**. Chromium at 390×844 and 1280×900; no JavaScript page errors or horizontal overflow on the tested routes. The live run also exercised manual offline entry and reconnect (exactly one server row), login/bootstrap, keypad add/edit, Trash restore, token create/hide/upload scope, guide and sign-out clearing device cache. Nine page screenshots captured using explicitly synthetic QA data.
- Static illustrated guide: rendered at 390px/1280px, two authored SVG diagrams; strict-CSP external stylesheet, no page overflow. Diagrams intentionally scroll sideways on small screens and have full-size links.
- `npm audit`: **0 known vulnerabilities** after patched development dependency overrides. Production Worker code has no npm runtime dependency.
- Wrangler deploy succeeded against the new independent Worker + D1. `/health` and `/api/auth/status` read back successfully. Unauthorized financial reads return 401. Cloudflare runtime performed real password derivation successfully during live setup/login; this is functional evidence, not an exhaustive CPU-load benchmark.

## Review fixes verified by regression tests

1. Alliance's informational `RM0` prefix must not override the actual `charged for MYR 88.00` amount.
2. Upload-only quick submissions cannot retrieve owner entries by colliding with their client IDs. Per-token namespaces and acknowledgements-only responses enforce this.
3. Quick text supports full grouped MYR amounts; foreign markers and malformed precision are rejected, not partially parsed.
4. Merchant names such as `Income Cafe` do not erase successful payments. Ambiguous mixed refund/payment wording goes to manual review.
5. Over-precision notification amounts retain the original text for review instead of silently truncating cents.
6. Ignored passes suppress only amountless Wallet events, never a genuine positive-amount payment with the same merchant label.

## Deployment state at handoff

The new installation was exercised with disposable records, then its QA records, sessions, owner and upload keys were removed. Read-back confirmed an empty ledger and no owner/tokens/recurring rules. A new private one-time setup key was generated afterwards; the recipient chooses their own password. No original Tally data was copied or altered.

## Not claimed / still requires the actual phone

- No real iPhone Wallet tap, TNG notification trigger or SMS automation was fired by these tests. Trigger availability and supplied fields depend on iOS, bank and device.
- Dictionary → compact JSONL serialization and concurrent iCloud archive appends have not been device-tested. The primary documented shortcut uses Apple's JSON request-body fields. It requires internet and does not magically retry. The browser importer is available for an already-valid JSONL archive.
- Payment parsing supports tested text families, not every bank, language or notification format. Verify the next real transaction and inspect Needs attention/Skipped. Refunds do not automatically reverse an existing expense.
- Cloudflare cron was configured for every 30 minutes, posting due records only from 09:00 MYT with idempotent IDs. The scheduler entrypoint was tested with real local D1; we did not wait for a future real cloud cron firing.
- No load/SLA guarantee, unlimited free-service promise, independent automatic off-site backup, or shared multi-user isolation is asserted. Export CSV/full administrative SQL backups as documented. A full-day service interruption can miss that day's recurring posting; this version deliberately does not backfill past days.
