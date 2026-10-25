# Start here — Tally Cloud

This source package runs one person's private, spending-only ledger on Cloudflare Workers + D1. No AI or Mini PC is required.

## Try the prepared installation

Public app: https://tally-cloud-friends.tanjinlimkelvin.workers.dev/

Illustrated instructions: https://tally-cloud-friends.tanjinlimkelvin.workers.dev/guide.html

This trial is on Jin's Cloudflare account. The owner setup link is in a **separate private file**, not this package. Use that file to claim the fresh installation and choose your own password. Whoever claims it first becomes the sole owner. Do not have multiple friends share one installation.

After creating the password:
1. Open the URL in Safari → Share → Add to Home Screen.
2. In Settings → Upload keys, create an upload-only key for each shortcut. Copy it at that point; it cannot be displayed again after reload.
3. Open Settings → Set up capture and follow one source at a time: Apple Pay, supported TNG notification trigger, or Alliance SMS.
4. Inspect the next actual transaction before trusting background capture. Bank and iOS variations are not universally supported.

## Deploy a completely separate copy

Follow README.md. The package's wrangler.jsonc deliberately contains a placeholder database ID. Create a new D1 database on the friend's own account and replace it; do not reuse the trial database or another person's installation. Keep all data and credentials independent.

## What to read

- README.md — deploy, backup, safety and local development.
- docs/SHORTCUTS.md or docs/guides/index.html — complete illustrated iPhone setup.
- TEST-REPORT.md — executed test results and what has not been verified on a real iPhone.

## Important offline distinction

Manual entries in a previously signed-in PWA can queue locally and sync later. The basic Shortcuts direct-upload guide requires internet and does not auto-retry. A valid JSONL capture archive can be replayed in Settings, but creating that archive on a particular iPhone still needs device verification. Do not assume the PWA's offline outbox also queues system-triggered Shortcuts events.
