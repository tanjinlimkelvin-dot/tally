# Guide integration handoff

## Artifacts
- `SHORTCUTS.md`: canonical comprehensive English content.
- `guides/index.html`: self-contained illustrated HTML, generated from the canonical text; inline CSS/SVG, no external assets or JS. It can be opened as a local file.
- `illustrations/variables.svg`: wrong typed labels versus blue Transaction property pills.
- `illustrations/post-json.svg`: POST, bearer header, JSON content type, SMS JSON body mapping.
- `build-guide.py`: dependency-free renderer; run `python docs/build-guide.py` after text/diagram edits. Numbered steps intentionally remain explicit numbered paragraphs.

All graphics are authored diagrams, clearly labeled **not OS screenshots**. No deployment or frontend/backend edits were made for these docs.

## Parent integration requirements
- Embed guide sections in Settings or link a protected/static guide route as appropriate. Do not copy this standalone page's inline CSS into a strict-CSP app without adapting it.
- Substitute the actual current app origin at runtime, not a hard-coded owner/deployment address. Only offer Copy for literal URL/header names/fixed values; never for a template containing live variable labels. Token display/copy must remain owner-only.
- Confirm exact backend responses, parser variants, unknown-bank flagging, dedupe, and deletion/tombstone behavior before promising their acceptance checks pass. Docs distinguish source reference format knowledge from verified current implementation.
- `/api/ingest?format=text`, bearer upload-only token, and direct JSON request contract are specified. `/api/quick` is intentionally not prescribed pending exact backend agreement.
- **Settings → Recover shortcut archive** is conditional in docs: do not present it as implemented until the actual importer exists. Importer must enforce both <=100 events and <=64 KiB UTF-8 bytes per request, preserve IDs, show per-line outcomes, support partial/restarted recovery, reject one oversized event clearly, and retain original archive until acknowledged. Confirm queue endpoint and NDJSON content type in the backend contract; these are deliberately not guessed here.
- Direct POST is the ready documented path; it has no automatic offline retry. Durable archive creation remains blocked on a device-tested compact JSONL serializer/helper. Apple's official Dictionary documentation does not prove the specific Get Text from Input coercion/compactness claim. Do not silently convert that caveat into a claimed working recipe. No signed/helper shortcut is included.
- Notification automation availability is feature-detected, not universally tied to an iOS release. Do not carry over an unverified iOS 27 promise from the legacy source skill.
- Apple Pay selection excludes keys/access passes and explicitly warns users to select future cards. Unknown banks/notification variants require review; stable event UUID does not by itself reconcile Wallet versus SMS duplicates.
- Tests can create real entries: no dry-run API is documented. Use disposable deployment or explicitly delete disposable live test rows. No real charge required.

## Evidence / boundary
Apple official pages retrieved during authorship: Request your first API (JSON request-body fields and variables), Using Dictionaries, Intro to JSON. URLs are in SHORTCUTS.md. The source skill reference supplied field-selection and UX pitfalls; legacy T2 formats, local services, Tailscale headers, private data, and assumed reply prefixes were excluded.

No on-device iOS trigger, archive serializer, actual payment, deployed API, or real bank message was exercised. Artifact checks do not substitute for those acceptance tests.
