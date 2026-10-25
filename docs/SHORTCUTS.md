# Tally Cloud · iPhone capture setup

This is a manual setup guide for one owner's Tally Cloud deployment. No AI, MiniPC, or Tailscale is involved. You need your deployed HTTPS app, an iPhone with Shortcuts, and an upload-only token generated in **App Settings**. Never use an administrator credential in a shortcut.

**Read the illustrated companion:** [guides/index.html](guides/index.html). All illustrations are authored diagrams, not OS screenshots. Labels and trigger availability can differ by iOS version.

## 1. Understand what you are building

A **shortcut** is a sequence of actions: collect fields → send JSON → display reply. An **automation** is the trigger that runs those actions, such as a Wallet transaction or an incoming message. Importing or creating a shortcut does not install its personal automation. You must select the trigger yourself on the iPhone.

Start in **Shortcuts → Automation → +** and look for the relevant trigger. On versions that expose automation creation inside the shortcut editor, use that equivalent entry point. Pick automatic/immediate execution only if your version offers it and you understand what it permits. Approve network and file permissions during setup; a permission prompt can interrupt unattended capture.

Build one source at a time. Do not add an AI/model action, amount filter, or guessed text parser before upload: failures there can discard the raw event.

## 2. Get the two private setup values

1. Open your own Tally Cloud app and sign in.
2. In **Settings**, generate an **upload-only token**. Store it privately; anyone holding it may submit events to this deployment. It is not a read/admin login.
3. Use the app's current origin, not a URL from a screenshot. For example, replace the example origin below with the actual HTTPS address in your address bar:
   `https://YOUR-APP.example/api/ingest?format=text`
4. Do not include the token in the URL, a shared shortcut link, source control, a screenshot, an archive, or a support message. If exposed, revoke it and generate another in Settings; update each source shortcut.

## 3. Magic variables are not pasted words

**Keys** (`amount`, `merchant`, `event_id`) and fixed values (`applepay`) are typed text. **Values that change** must be inserted using the variable picker. Typing `Amount`, `[Amount]`, or `Transaction Amount` does not read a payment amount.

Tap a value field → select a variable / Magic Variable → select **Transaction** → tap that variable and choose its **Amount** property. Repeat for Merchant, Name, and Card if those properties are exposed by your trigger. A genuine variable is a colored pill, not ordinary text. The diagrams use blue pills schematically; actual appearance varies.

For ID and date, insert the output of **Generate UUID** and **Format Date**, not their action names as text. A manually run Wallet shortcut normally has no Transaction input. Empty values on a manual run do not prove that the real trigger works.

## 4. Common sending actions: supported JSON route

Use **Get Contents of URL → POST → Request Body: JSON**. Apple documents JSON body fields with manually entered values or variables. This avoids hand-built JSON strings and correctly escapes quotes and newlines in SMS bodies.

1. Add **Generate UUID** once per captured event. Keep its output for every send/recovery attempt of that same event.
2. Add **Current Date**, then **Format Date**. Choose ISO 8601 if available; otherwise a custom ISO representation with a timezone, for example `yyyy-MM-dd'T'HH:mm:ssXXX`. Preview it: it must resemble `2026-01-01T12:00:00+08:00`, not a localized sentence. This is capture time, not necessarily the bank's original charge time.
3. Add **Get Contents of URL**, using your own full ingest URL. Expand its options, set Method to **POST**, and add these headers:

   | Header name (literal) | Header value |
   |---|---|
   | `Authorization` | `Bearer ` followed by your private upload-only token; keep the space |
   | `Content-Type` | `application/json` |

4. Choose **Request Body: JSON**. Add the fields below as named JSON fields. Insert the indicated variables. Do not paste the whole table as a text body.
5. Add **Show Notification** containing only the **Contents of URL** result. If its variable is typed as File or shows a filename, tap it and choose **Text**. Keep errors visible until setup is verified. A notification saying the shortcut ran is not proof that the server stored an event.

| JSON key | Field value | Source |
|---|---|---|
| `event_id` | Generate UUID output | Every source; stable for retries |
| `type` | `applepay`, `notification`, or `sms` | Fixed literal for this shortcut |
| `at` | Formatted date output | Every source |
| `amount` | Transaction → Amount | Wallet; leave out if unavailable |
| `merchant` | Transaction → Merchant | Wallet; leave out if unavailable |
| `name` | Transaction → Name | Wallet; leave out if unavailable |
| `card` | Transaction → Card | Wallet; leave out if unavailable |
| `title` | Trigger → Title | Notification, only if exposed |
| `body` | Trigger → Body | Notification, only if exposed |
| `text` | Shortcut Input → message body | SMS |

Use a Number field for a numeric amount if available; do not invent zero for a missing amount. Do not send literal property labels for missing fields. The enum values are lowercase and exact. `?format=text` requests a readable reply; it does **not** change the JSON request body to plain text. This guide deliberately does not prescribe `/api/quick`: its separate JSON contract must be confirmed first.

## 5. Apple Pay / Wallet

1. Create a Wallet / Transaction automation where your iOS version offers it.
2. In **Card or Pass**, select your actual payment cards individually, **not Any**. Exclude car keys, door/access passes, and other non-payment passes. A key tap is not spending.
3. **New cards are not automatically included:** when you add a future card to Wallet, edit this selection and explicitly tick it.
4. Add the common actions above with `type` = `applepay`. Map Amount, Merchant, Name, and Card from the actual Transaction variable. If you use a separate reusable shortcut, explicitly pass Transaction into it; a shortcut with no input cannot read the automation's transaction by magic.
5. Enable the automation and verify the selected cards. A manual ▶ run can check permissions but cannot synthesize a real Wallet transaction.

Some versions expose an additional Wallet notification/Notify setting. Use only settings visible on your phone; this guide does not promise that every automation banner can be suppressed.

## 6. Touch 'n Go eWallet (TNG): only when supported

An ordinary app/PWA cannot read all iPhone notifications. First inspect the available automation triggers. **Only proceed if your installed iOS provides an app-notification trigger and exposes the notification Title and Body.** Do not assume a particular iOS version guarantees it.

1. Choose that notification trigger and select **Touch 'n Go eWallet**, not all apps.
2. Set `type` to `notification`; map `title` to the real trigger Title and `body` to the real Body.
3. Do not type `Title` or `Body` as values. Keep the full raw payment body, including punctuation.
4. If no such trigger or no body variable exists, automatic TNG notification capture is unavailable on this phone. Record spending manually in Tally; do not substitute an unrelated trigger or claim background capture works.

The reference lesson includes the supported example shape `You have paid RM 8.90 to Tealive.` This describes a parser example, not a guarantee that every TNG notification variant parses. Transfers, top-ups, marketing notices, reversals, and income are not automatically spending. Review uncertain events; do not manufacture an amount.

## 7. Alliance Bank SMS

1. Create a **Message** automation. Use **Message contains** with a narrowly useful keyword such as `charged`, rather than relying on a bank short-code being in Contacts. This may also match an ordinary chat; the server still needs to recognize the bank charge shape.
2. Set `type` to `sms` and `text` to **Shortcut Input**, selecting the message body/Text property if needed. Preserve the entire message.
3. If selecting Shortcut Input adds a receive-input block, inspect its input type; it is not itself a second trigger.
4. Reuse the POST and header settings. Do not copy the token to a message or online JSON editor.

**Known reference format family:** AllianceBank charge messages containing `charged for MYR <amount> at <merchant> on <DDMMYY>@<HH:MM>`. A synthetic example is:

```text
RM0 AllianceBank: Virtual Credit Card charged for MYR 1.00 at TEST SHOP on 010126@12:00. Call bank if not authorised.
```

The example is invented and contains no real financial data. Other wording, bank names, debit/reversal messages, and unknown banks must be treated as **unverified/needs review**, not silently assigned a merchant or trusted amount. This guide does not certify parser coverage in the current backend. Never broaden capture to OTPs or send verification codes to Tally. Sender labels are not proof that a message is genuine.

One purchase may produce both Wallet and SMS events. Stable `event_id` deduplicates retries of the **same event**, not necessarily two independently triggered sources. Check for cross-source duplicates and do not promise automatic reconciliation without backend tests.

## 8. Safe tests: no real charge needed

Use a separate temporary manual shortcut or a manual **Dictionary** fixture to supply synthetic values to the same JSON body fields. Do not attempt a real purchase just to test connectivity. The fixture should use a fresh Generate UUID, the current formatted date, `type: sms`, and the synthetic Alliance text above; a notification fixture can use title `TEST ONLY` and the example TNG body. A Dictionary is a convenient fixture source, not a verified archive serializer.

**Warning: there is no documented dry-run flag in this contract.** A valid synthetic payment can create a real ledger row. Prefer a disposable deployment. If you test your live deployment, explicitly expect the disposable `TEST SHOP` / test entry, inspect it, and delete it in the app afterward. Do not call the test harmless or assume ▶ is a dry run.

Check all of these:
- The server returns an intelligible reply, not an HTML login page.
- Tally shows the expected test event or a clear needs-review/error outcome; inspect source, amount, merchant, card, and timestamp.
- A literal variable-name mistake does not become a normal purchase.
- Retrying the **exact same event ID and payload** does not create a second entry. Running Generate UUID again is a new event, not a retry.
- Unknown bank text is flagged/not interpreted as a confirmed expense.
- Remove disposable test entries. Retain acknowledged IDs according to the backend's dedupe/tombstone policy; replaying an archive after deleting a test must not be assumed safe without testing.

These are acceptance checks, not claims that they have been exercised on your iPhone or deployment.

## 9. Offline truth and `.jsonl` recovery

**The basic direct POST does not automatically retry.** A failed Get Contents of URL may stop execution before a notification. No internet means no confirmed upload; iOS does not create a reliable retry queue for this guide.

For durable capture, a correctly tested archive step must happen **before** the network call:

1. Create one event Dictionary, including one UUID and capture timestamp.
2. Serialize that exact event as **compact, single-line JSON**; embedded newlines must be escaped as `\n`. Append one newline after the JSON object.
3. Append to a private per-source file such as `tally-applepay.jsonl`, `tally-notification.jsonl`, or `tally-sms.jsonl` in one explicitly selected folder. Confirm the file exists and can be read offline. iCloud-only files may be unavailable offline.
4. POST the same event using the same ID and original fields. Do not generate another ID for recovery.

**Serialization caveat:** Apple's dictionary documentation says Dictionary can create JSON and its results can be copied, but the official sources checked here do not establish that **Get Text from Input → Dictionary** always produces compact one-line JSON on every target iOS version. Pretty-printed JSON is not JSONL. Therefore this guide does **not** present that action sequence as a verified, beginner-ready archive recipe. Do not hand-concatenate unescaped message text into JSON. Until a helper is device-tested, use the direct JSON-body setup knowing its offline limitation, and keep the original SMS/notification information for manual recovery where available.

A helper shortcut, if later supplied, must be explicitly tested for quotes, backslashes, multiline text, Unicode, offline file access, stable IDs, and parallel triggers. No downloadable/signed helper is shipped with these docs. Prefer separate per-source archives to reduce concurrent append conflicts. A local append also can fail: no filesystem operation is magically durable.

### Recover a verified archive

When your app version exposes **Settings → Recover shortcut archive**, select the `.jsonl` file there. If the control is absent, the feature is not installed; retain the file and ask the deployment owner rather than posting the entire growing file yourself.

- Each line must be one complete JSON event object with its original `event_id` and `at`.
- Recovery requests are NDJSON batches of **at most 100 events AND at most 64 KiB per request**, including UTF-8 bytes and newline separators. Whichever limit is reached first wins. A single oversized event cannot fit and requires explicit handling.
- The recovery importer must split the file, preserve IDs, show rejected lines and acknowledgments, and be restart-safe. The direct per-event request still uses `Content-Type: application/json`; do not relabel a whole JSONL file as one JSON object.
- Keep the original archive until **every intended event has a successful acknowledgment**. A selected file, a started upload, or a generic HTTP success is not per-event confirmation. Never clear the archive merely because the newest event uploaded.
- The archive is a resend buffer, not the authoritative ledger or a full ledger backup. It contains sensitive merchant/message information; secure it, and apply a retention policy after verified recovery.

## 10. Troubleshooting

| Symptom | Check / next action |
|---|---|
| Nothing happens | Automation enabled? Right source/card? Immediate execution allowed? Permissions approved? New card selected? |
| Car-key tap starts capture | Change Any to selected payment cards; untick keys/passes. |
| `Amount` or `Body` arrives literally | Delete the typed word and insert the actual variable pill/property. |
| Empty transaction during ▶ | Expected without a real trigger; use the synthetic fixture, not a real charge. |
| Unauthorized / 401 | Exact `Authorization` header, `Bearer ` space, correct upload token, revoked token? Never share it for debugging. |
| HTML/login page | Wrong origin/path, redirect, or deployment access policy blocking machine uploads; ask owner to inspect the route without weakening auth. |
| Bad JSON / 400 / 422 | JSON body mode, exact lowercase type, UUID variable, ISO date; inspect the readable error. Don't blindly repeat a rejected event. |
| Too large / 413 | Recovery must obey both batch limits; never send the entire archive in one request. |
| Throttled / 429 or server/network error | Retain event; retry later with the same ID. Direct POST alone has no automatic retry. |
| Notification shows a filename | Set Contents of URL variable to Text in Show Notification. |
| Two entries for one purchase | Wallet plus SMS may both fire. Inspect cross-source duplicates; do not assume ID dedupe matches two different IDs. |
| TNG trigger missing | Unsupported on this phone/version. Use manual entry; no universal notification access exists. |
| Unknown SMS bank/format | Review manually and send only a redacted sample to the owner; never include OTPs, full card/account numbers, or token. |
| Duplicate files or missing archive events | Verify every writer uses the same intended folder/path for that source; don't mistake the previous action's File output for a folder. |

## Privacy checklist

Use HTTPS; keep upload credentials private; select only intended apps/cards/messages; never upload OTPs, security codes, passwords, full card numbers, or entire message histories. Use a card label/limited identifier only when actually supplied. Raw messages and archives contain personal financial data even without a full card number. A single-owner deployment is not a multi-user sharing system: friends should use their own owner/deployment or an explicitly designed account boundary. Do not publish your archive or signed shortcut containing a token.

## Sources and verification boundary

- [Apple: Request your first API](https://support.apple.com/guide/shortcuts/request-your-first-api-apd58d46713f/ios): POST exposes JSON/Form/File Request Body and supports variables.
- [Apple: Using Dictionaries](https://support.apple.com/guide/shortcuts/dictionaries-apd43b69f337/ios): structured values and creation of JSON dictionaries; not a compact JSONL guarantee.
- [Apple: Intro to JSON](https://support.apple.com/guide/shortcuts/intro-to-using-json-apd0f2e057df/ios): dictionary/list structure.
- Project setup lessons adapted from `private-tailnet-pwa/references/shortcut-setup-guides.md`: literal-only copy, real variable pills, message body input, selected-card exclusion, readable replies, file-folder consistency. Old T2 queue formats, Tailscale auth, exact legacy reply prefixes, and unverified iOS-version claims are deliberately not carried over.

No real iPhone trigger, bank message, payment, archive serializer, or deployed backend was exercised while authoring this documentation. Follow the acceptance checks above before relying on capture.
