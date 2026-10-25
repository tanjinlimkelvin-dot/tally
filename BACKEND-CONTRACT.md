# Backend contract

Worker entry: `src/worker.js`; bindings: `DB` (D1), `ASSETS` (Workers assets), secret `SETUP_TOKEN_HASH` (hex SHA-256 of a high-entropy, out-of-band setup token). No owner or personal records are seeded. Config uses the parent-created D1 ID `a2eaebcd-ca56-4336-a389-c1a36a1fdd0c`. Apply all four migrations before deployment.

## Authentication

- `GET /api/auth/status`: `{authenticated,needs_setup}`.
- POST setup `{setup_token,password}`, login `{password}`, logout `{}`, password `{old_password,new_password}` return status. Passwords: 12–256 characters; salted PBKDF2-SHA256, 100,000 iterations (Workers WebCrypto limit). Cookie `__Host-tally`: Secure, HttpOnly, SameSite=Strict, Path=/, 30 days. Only session hashes are stored. Password changes revoke previous sessions.
- Every cookie-authenticated write **including setup/login/logout** requires `X-Tally-Request: 1`; when Origin exists it must exactly equal the request URL origin.
- GET tokens returns `{tokens:[{id,label,created_at,last_used_at}]}`; POST `{label}` returns `{id,token}` once. POST `/api/tokens/:id/revoke` removes it. Upload bearer authorization is valid ONLY for POST ingest/quick, never reads, token management or other writes. Bearer uploads do not require the browser CSRF header.
- Auth attempts: 15 per IP per 15-minute SQL bucket before password hashing. Bearer attempts have a prelookup IP limit; valid tokens have 60/minute and 1000/day SQL limits. Fixed windows, not sliding windows.

## Ledger/UI

Original endpoint shapes are retained: state, `{entry,created}` create, `{entry}` edit/confirm/delete/restore/not-payment, `{entry,merged}` merge, `{entries}` trash, `{entry,events}` history, `{entries,errors}` bulk confirm. **Versions are opaque decimal strings**, not original hashes. PATCH entry `{version,changes}`; POST action `{version}`. Merge `{version,other,other_version}`. Soft-deleted records retain stable IDs; duplicate event retry does not restore deleted rows or add audits. Audit records are generated transactionally by SQLite triggers.

Categories endpoints and budgets use the original payloads. Categories support exclusion from totals, move, delete-to-Other and default restoration. CSV includes every active expense and explicit `excluded_from_totals`; formula-like cells are prefixed with `'`. Recurring uses `{id?,merchant,amount,category,note,every:'month'|'year',start:'YYYY-MM-DD',until:'YYYY-MM'}`. Edits change the rule only, never existing entries. Cron every 30 minutes posts today's due expenses from 09:00 MYT using `rc:<stable-uuid>:<date>` IDs, clamps month ends, never backfills previous days. Resume begins tomorrow to avoid replaying paused dues. No notifications or external messaging are sent.

`POST /api/quick` supports normal manual entry fields or `{text:'12.50 kopi',client_id?}`. JSON is required. Cookie-authenticated calls return `{entry,created,message}`; upload-only calls namespace client IDs per key and return only `{ok,created,message}`, never ledger contents. Give client_id for idempotent manual retries. Explicit RM/MYR amounts are preferred over merchant digits; foreign markers and malformed numeric tokens are rejected.

## Ingest/review

POST `/api/ingest` JSON object, JSON array, or `application/x-ndjson` lines. At most 100 events and 65,536 UTF-8 bytes per request. Event: `{event_id:UUID,type:'applepay'|'notification'|'sms',amount?,merchant?,name?,card?,at?,title?,body?,text?}`. Preserve UUID across queue retries. All valid claims in a request are committed in one atomic D1 batch, including trigger-generated expenses/skipped records and audits; invalid records are counted and excluded before the transaction. Invalid records do not reserve the UUID. Response `{ok,status,accepted,duplicates,ignored,invalid,skipped,ids,message}`; `?format=text` returns message. Legacy T2/N1/S1 queue strings are intentionally unsupported: migrate shortcuts to JSON UUID events.

Conservative, non-AI notification/SMS parsing: explicit spending verbs and amount are required. Income/refunds/OTP/failed/reloads/self-transfers are ignored. Unrecognized wording is queued for manual review. Non-MYR amounts are stored as **zero cents**, with needs_review and an explanation; confirmation requires a positive MYR amount. Apple Pay events missing an amount similarly require manual review and can be marked not-payment to ignore future pass taps.

GET `/api/skipped` returns `{skipped:[...]}`; state also exposes these as `missed` for the existing UI. POST `/api/skipped/:id/add` accepts optional `{amount,merchant,category,note}`, using stored defaults where possible, returns `{entry}`. Missing amount requires manual input. POST dismiss returns `{entry:null}`. `/api/missed/:id/add|dismiss` aliases work too. No AI suggestion endpoints, reconciliation, statement imports, assistant, or private-machine integrations exist. Bulk `accept` is intentionally unavailable; use `confirm`.

API responses are no-store. `/health` and `/api/health` expose only `{ok:true}`. Static files are public but contain no personal data. CSP rejects inline scripts **and inline styles**; frontend must use external files or explicitly coordinate a style policy adjustment.

## Verification

`npm install --package-lock=false && npm test` runs Node unit checks and Miniflare/workerd integration with a real isolated D1 database. Local installed workerd currently supports dates only through 2026-08-06, so tests pin that date while deployment config retains requested 2026-10-01. No remote calls/writes are performed by tests. Full 100-event ingest and 200-item bulk confirmation are exercised on real D1. Ingest uses at most ten application SQL statements plus authentication (not per-event queries); each INSERT uses at most 90 bound parameters. Batches of 10 are still recommended for low-CPU Free Worker use. Production 10 ms CPU enforcement has not been measured; local tests do not establish that budget. `npm run dev` requires local migrations applied via `npx wrangler d1 migrations apply tally-cloud-friends --local` and local setup hash binding. Parent owns deployment and browser/frontend QA.

Scope reductions: no legacy text queue formats, AI, statement reconciliation, automatic cross-source suppression or monthly narrative endpoint. Confirmed merchant categories are learned via audited-entry triggers; conservative keywords cover common local merchants. Ingested expenses initially require review. State exposes persistent last-ingest metadata and possible duplicate twins. History humanizes monetary/category changes. See TEST-REPORT.md for the final executed test evidence; dependency overrides resolve the originally reported development-package advisories.
