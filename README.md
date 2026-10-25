# Tally Cloud

A small **spending-only** PWA for one person, hosted on **Cloudflare Workers + D1**. The interface and bookkeeping flows are adapted from an existing private Tally application. This is a separate installation with an empty database, not a migration of anyone's personal ledger.

No Mini PC, Tailscale, Hermes, bank login, AI service or Apple developer membership is needed at runtime. The website and cloud database must be reachable for sync; manual entries can queue on a previously signed-in browser. Shortcuts automations must be created on the phone by the owner.

## Included

- Manual expense entry, custom numeric keypad, merchant/category memory, search and monthly statistics.
- Custom categories and emoji, reorder, “Count in totals” switch, total/category budgets.
- Apple Pay tap capture, supported TNG notification capture, supported Alliance debit/credit charge SMS parsing.
- Missing amount/foreign currency review, possible duplicates with explicit merge, ignored non-payment passes.
- Monthly/yearly recurring expenses, pause/resume, end month, day-of-month clamping, stable posting IDs.
- Trash and restore, per-entry change history, CSV export.
- Password login, one-time owner setup, separate revocable upload-only shortcut keys.
- Built-in setup guide with copyable URL/header literals, detailed illustrated guide and archive recovery.

No AI assistant/review, broker or credit-ledger integration, direct bank connection, income tracking, automatic refund reversal, Telegram bot or shared multi-user tenancy. MYR and Asia/Kuala_Lumpur are intentional constraints, not a currency conversion engine. A recurring entry records a planned outgoing payment, not proof the bank debited it.

## Deploy on a friend's account

Prefer one independent Cloudflare account/deployment/database per person. A copy of the URL alone is **not** a separate ledger. Do not put several people's records into one single-owner installation.

Prerequisites: Node.js 22+, a free Cloudflare account, terminal access once for deployment. The friend only needs Safari + Shortcuts afterwards.

1. Unzip the source into a new folder. Run `npm ci` and `npx wrangler login`; sign into the **friend's own Cloudflare account** in the browser. No API token is needed in chat.
2. Open `wrangler.jsonc`. Give `name` a unique name (for example `tally-anna`). Create a fresh database with `npx wrangler d1 create tally-anna-db`.
3. In `d1_databases`, keep `binding` exactly `DB`, replace `database_name` and `database_id` with the values just returned. Never reuse the reference database ID for a different person.
4. Run `npx wrangler d1 migrations apply DB --remote` to create empty tables and default categories. These migrations do not contain personal data.
5. Run `npx wrangler deploy`. Save the HTTPS `workers.dev` URL. Static assets and API are served by the same worker.
6. Run `node scripts/bootstrap.mjs https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev`. This creates a random one-time owner setup key, stores only its hash as a Worker secret, and writes the private setup link into `Private/SETUP.md`. The raw key is not printed or published. Treat that file as private.
7. Open the link in Safari, choose a password of at least 12 characters and save it in a password manager. There is no public signup. After the owner exists, the setup key cannot create another owner.
8. Add the app to the Home Screen. In Settings → Upload keys, make a separate key for each shortcut. Follow Settings → Set up capture or [the complete guide](docs/SHORTCUTS.md).
9. Confirm a connection-only test appears in Skipped notifications without changing totals. Then inspect the next real purchase before relying on automatic capture.

Workers' first deployment may ask you to create your free `workers.dev` subdomain. This is not a requirement to buy a domain. Do not enable a paid plan or enter payment details merely to run this app.

## Data and security

- Each deployment has one owner. A password proves ownership; signed-in access is carried by an HttpOnly session cookie. Shortcut keys are separate bearer credentials, with ingestion-only permissions. Revoke lost keys in Settings.
- No financial API is public. A public app shell/guide is expected; it contains no ledger data. A secret URL is not authentication. A login must still be used.
- The shortcut sends transaction/message data to Cloudflare. There is **no AI model**. A notification trigger should be restricted to the chosen app; SMS capture should use a narrow keyword instead of forwarding all personal messages/OTPs.
- D1 stores the authoritative ledger. Phone archives are capture logs; they cannot restore edits, history, categories or recurring rules.
- Export CSV periodically for a separate copy. For a complete administrative database export: `npx wrangler d1 export DB --remote --output=backup.sql`. Keep that file outside `public/`, encrypted/private. To restore, use a **new empty database**, import with `npx wrangler d1 execute NEW_DB --remote --file=backup.sql`, test it, then repoint the binding. Do not blindly import over live data.
- Cloudflare D1's recovery/retention features depend on the current plan. This app does not promise 90-day snapshots or iCloud backups; those were properties of the original private installation, not this cloud version.
- Browser offline cache contains ledger data on that device. Sign out clears the local ledger cache and warns before discarding unsynced manual entries. Do not use a shared browser profile for private finance.
- Keep Cloudflare account recovery and the owner password in your password manager. There is no email password-reset service. Account administrators can recover an installation with DB access; that is a privileged operation, not a public endpoint.

## Capture and offline recovery

A shortcut generates a UUID **once per event**, assembles a dictionary, optionally saves that event as one JSON line to a per-source phone archive, and POSTs **only that event**, not the entire growing history.

`POST /api/ingest?format=text` with `Authorization: Bearer YOUR_UPLOAD_KEY` and `Content-Type: application/json`.

Example synthetic non-spending connection test (replace UUID and timestamp, not real personal data):

    {"event_id":"a701ccdb-672b-4646-90ec-056c09abde21","type":"notification","at":"2026-10-25T12:00:00+08:00","title":"Tally setup test","body":"Connection test only — no purchase"}

The response should start with `Skipped`. It must not create an expense. Do not regenerate event IDs when replaying a failed upload. Repeated IDs are deduplicated at the database boundary.

Shortcuts does not magically retry a failed action. If you enabled the archive step, select the archive with Settings → Recover shortcut archive. The browser validates JSON and sends bounded chunks. Keep the archive until recovery succeeds. Rotating source files and checking conflict copies may still be necessary; iCloud appends are not a transactional message queue.

## Local development and tests

- `npm ci`
- `npx wrangler d1 migrations apply DB --local`
- Add only a **test** `SETUP_TOKEN_HASH` to `.dev.vars` (SHA256 hex of a known test bootstrap token).
- `npx wrangler dev --port 8788`
- `npm test` for backend/pure logic tests.
- `node --test tests/core.test.mjs` for the reused UI accounting/keypad/date tests.
- `QA_URL=http://127.0.0.1:8788 QA_SETUP_TOKEN=local-qa-bootstrap-not-production /path/to/python-with-playwright tests/qa_browser.py` against a **fresh local test DB**. The script claims it and writes synthetic QA records. Never point it at a real friend's ledger.

No test proves that a real iPhone Wallet or notification trigger fired. That must be checked on the actual phone; notification triggers and property names vary by iOS version and bank.

## Limits and maintenance

Cloudflare Free quotas are shared at account level. Efficient personal use is the target; this is not a no-limits service or a guarantee of permanent free hosting. Observe Workers CPU/query quotas and D1 usage in the dashboard. Ingest bodies and batch sizes are bounded in code. Big archives are imported in chunks rather than scanned on every payment. Indexes and event IDs keep retry costs bounded.

Apply future schema migrations before deploying the matching code; export a backup before significant upgrades. Never commit `.dev.vars`, `Private/`, a database export, actual tokens, passwords or personal transaction files.
