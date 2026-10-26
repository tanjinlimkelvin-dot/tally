# Start here — Tally Cloud

This package runs one person's private, spending-only ledger on Cloudflare Workers + D1. No AI, Mini PC, or server infrastructure is required.

## Quickstart

1. **Deploy to your Cloudflare account**: Follow the steps in `README.md` to deploy your own Worker and D1 database in 5 minutes (`npm ci`, `npx wrangler d1 create <name>`, `npx wrangler deploy`).
2. **One-time Owner Setup**: Run `node scripts/bootstrap.mjs <YOUR_WORKER_URL>` to generate your private owner setup link, then set your secure password.
3. **Add to Home Screen**: Open your Worker URL in Safari on your iPhone, tap Share → **Add to Home Screen**.
4. **Configure Shortcuts Capture**: In Settings → Upload keys, create an upload key. Then open Settings → **Set up capture** (or read `docs/SHORTCUTS.md`) for the 3-step Apple Pay, Touch 'n Go, or bank SMS automation.

## What to read

- **`README.md`** — Deploy, database creation, backup, and local development.
- **`docs/SHORTCUTS.md`** or `/guide.html` — Beginner-friendly, 3-step illustrated iPhone setup with visual right-vs-wrong examples.
- **`TEST-REPORT.md`** — Executed test results and test coverage across authentication, ingestion, D1 ledger operations, and edge cases.
