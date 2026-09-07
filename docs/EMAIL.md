# Email

Mementos sends two kinds of email:

- **Password reset codes** — transactional, user-initiated, one at a time.
- **Weekly digest** — bulk, opt-out, a read-only snapshot of each user's feed.

This document covers how the feature is built, how to operate it, and the one-time migration
older databases need. The data design it implements (field meanings, the alternatives that were
rejected) is in the original design issue; the schema itself is documented inline in
[`src/server/models/User.ts`](../src/server/models/User.ts).

---

## Where things live

| Concern | Location |
|---|---|
| Config (transport, limits, schedule) | `src/server/settings.ts` → `EMAIL` |
| Mailer (SMTP / console / memory transports) | `src/server/mail/mailer.ts` |
| Templates (escaping renderer, reset + digest emails, unsubscribe pages) | `src/server/mail/templates.ts` |
| Forgot / reset password | `AuthService.requestPasswordReset`, `AuthService.resetPassword` |
| Session invalidation after a reset | `middleware/auth.ts` (`passwordChangedAt` vs. token `iat`) |
| Preferences + one-click unsubscribe | `UserService.getSettings/updateSettings/unsubscribeByToken` |
| Delivery health (bounces, complaints) | `EmailService.recordDeliveryEvent` |
| Digest job | `DigestService.run`, scheduled by `jobs/digest_scheduler.ts` |
| Read-only feed for the digest | `FeedService.previewFeed` |
| Migration for pre-existing accounts | `src/server/scripts/migrate_email_schema.ts` |

Endpoints:

```
POST /api/auth/forgot-password        { email }                       public, rate-limited
POST /api/auth/reset-password         { email, code, password }       public, rate-limited
GET  /api/users/settings              -> { weeklyDigest }             private
PUT  /api/users/settings              { weeklyDigest }                private
GET  /api/email/unsubscribe?token=    confirmation page               public
POST /api/email/unsubscribe?token=    perform unsubscribe             public (RFC 8058 one-click)
POST /api/email/events                { email, event }                shared secret
```

Client: `/forgot-password` (two steps: request a code, then redeem it) linked from the sign-in
form, and an "Email" card on `/settings` with the weekly-digest switch.

---

## Local development

No configuration is needed. With no SMTP settings the mailer is the **console transport**: every
message is printed to the server's stdout, reset code and unsubscribe link included, so the
whole flow can be walked through against `npm run dev`. Tests use the **memory transport**,
which captures messages so assertions can read the code back out of them.

To exercise real SMTP locally, point `SMTP_URL` at any SMTP server (a Mailpit/MailHog container
works well) — see `.env.example`.

---

## Password reset

1. `POST /api/auth/forgot-password` with the address. The response is **identical** whether or
   not the address is registered, and it is sent *before* any work happens, so neither the body
   nor the timing reveals which addresses exist.
2. If the address is registered and not rate-limited, a 6-digit code (`crypto.randomInt`, so no
   modulo bias) is generated, its **HMAC-SHA256** stored (bcrypt would be offline-crackable for
   a 10⁶ search space), and the code emailed. It expires in 30 minutes.
3. `POST /api/auth/reset-password` with the address, code and new password. The attempt counter
   is incremented in the same write that fetches the code, so concurrent guesses cannot both
   observe the same count; after 5 wrong guesses the code is cleared. A correct code sets the
   password, stamps `login.passwordChangedAt`, and clears the code in one conditional write, so
   a code redeems exactly once.
4. Every existing JWT for the account is now rejected: `privateAccess` compares the token's
   `iat` with `passwordChangedAt` on every authenticated request (one `_id` point lookup with a
   two-field projection). The client's response interceptor already signs the user out on the
   `is_token_invalid` flag.

Rate limits, all in `EMAIL.PASSWORD_RESET`:

| Layer | Limit | Enforced by |
|---|---|---|
| Resend cooldown | 60 s between codes | `passwordReset.lastSentAt` |
| Sends per window | 5 per 60 min per account | `passwordReset.sendCount` / `sendWindowStartedAt` |
| Guesses per code | 5 | `passwordReset.attempts` |
| Per IP | 20 requests per 15 min across both endpoints | `express-rate-limit` |

The per-account counters are written with conditional updates (the filter repeats the check), so
two concurrent requests cannot both slip past a cap.

Email is compared **case-insensitively**: the schema lowercases and trims on write and on query
filters, and the routes normalize input as well. This is what makes "reset the password for the
address I typed" find the account it was created with.

---

## Weekly digest

`DigestService.run` is scheduled by `node-cron` from `index.ts` (`DIGEST_CRON` in
`DIGEST_TIMEZONE`, never under `NODE_ENV=test`). For each recipient it:

1. Selects users with `weeklyDigest: true` **and** `deliveryStatus: 'active'` **and** a
   `lastDigestSentAt` older than `PERIOD_HOURS` (144 h — slightly under a week, so a cron that
   fires a few minutes early does not skip everyone). The query runs through a cursor, so memory
   is flat regardless of user count.
2. Builds the page with `FeedService.previewFeed`, which ranks exactly as the app's feed does
   but records nothing — no impressions on `feed.recentlySeen`, no spaced-repetition advance.
   A user whose feed is empty is skipped without being claimed, so they are retried next run.
3. **Claims** the user by setting `lastDigestSentAt` with a filter that repeats the freshness
   condition — an atomic compare-and-set. Two instances running the job concurrently cannot
   both claim one user, and a crashed run resumes without re-mailing anyone.
4. Sends, then pauses `THROTTLE_MS` before the next recipient.

Because the claim happens before the send, a send that fails after it costs that user one
week's digest. That is the intended direction: a missed digest is invisible; a duplicate is a
spam-complaint risk for the whole sending domain.

Every digest carries `List-Unsubscribe` / `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
headers pointing at `POST /api/email/unsubscribe?token=…`. The `GET` form of the same URL shows
a confirmation page with a button (so link prefetchers cannot unsubscribe anyone); the `POST`
performs it and answers 200 with the same page whether or not the token matched. Unsubscribing
withdraws consent only; it never touches `deliveryStatus`.

All user content in templates goes through the escaping `html` tag in `templates.ts` — never
string concatenation. Note content is reduced to a short plain-text snippet.

---

## Delivery health

`settings.email.deliveryStatus` (`active | bounced | complained | suppressed`) is the one field
the digest filters on. It is written by `EmailService.recordDeliveryEvent`:

| Event | Effect |
|---|---|
| `hard_bounce` | `deliveryStatus: 'bounced'` (unless already `complained`), `lastBounceAt` |
| `complaint` | `deliveryStatus: 'complained'`, `lastBounceAt` — sticky; requires explicit re-consent |
| `soft_bounce` | `bounceCount += 1`, `lastBounceAt`; `suppressed` once the count reaches 5 while `active` |
| `delivered` | `bounceCount = 0` (soft bounces only matter consecutively) |

Two sources feed it:

- **Synchronous SMTP rejections.** The SMTP mailer classifies nodemailer errors (5xx on the
  recipient → hard, 4xx → soft, connection/auth problems → transient, which writes nothing) and
  both the reset and digest paths record the result.
- **`POST /api/email/events`**, for providers that report asynchronously. It takes the normalized
  shape `{ email, event }` with the `x-email-webhook-secret` header equal to
  `EMAIL_WEBHOOK_SECRET`, and is disabled while that is unset. Provider-specific payloads
  (SES, Postmark, SendGrid…) need a small adapter that maps them onto this endpoint; none is
  included, since the provider is not chosen yet.

Password-reset mail is **exempt** from the bulk filter: it is attempted even for a `bounced`
address, because it is user-initiated and expected.

---

## Migration

Mongoose defaults only apply to documents Mongoose writes, so accounts created before the email
fields were added to the schema do not have them. The feature assumes every field is *present*
(it checks values, never presence), so those accounts need the defaults written once.

Check whether anything is owed (both should be `0` on a database with no older accounts):

```js
db.users.countDocuments({ 'settings.email.unsubscribeToken': { $exists: false } })
db.users.countDocuments({ 'login.passwordChangedAt':        { $exists: false } })
```

Then run the script, once per environment:

```bash
npm run migrate:email -- --dry-run      # report only
npm run migrate:email                   # write
# or, from a production build:
node dist/scripts/migrate_email_schema.js
```

It is idempotent and safe to re-run. Three things it does deliberately:

- `login.passwordChangedAt` is set from each account's own `dateCreated`, **never** from now —
  stamping now would make every JWT in circulation look older than the password and sign the
  entire user base out at once.
- `settings.email.unsubscribeToken` is issued per document in a loop, since it must be unique;
  the unique index is the safety net.
- `login.email` is lowercased — **unless** two accounts differ only in case. Then the script
  lists them and leaves every email untouched until a human decides which account survives
  (the other fields are still backfilled). Resolve the collision (merge or delete the duplicate)
  and run again.

The script exits non-zero while anything remains, and prints "Migration complete" when every
account carries every field.

---

## Operational checklist

- [ ] `APP_URL`, `EMAIL_FROM`, `SMTP_*` set in each environment (the server warns at startup if
      mail would only be logged).
- [ ] SPF and DKIM configured for the `EMAIL_FROM` domain.
- [ ] `npm run migrate:email` run once per environment; both counts above are `0`.
- [ ] `DIGEST_CRON` / `DIGEST_TIMEZONE` reviewed; the startup log shows `Digest scheduled: …`.
- [ ] If a provider reports bounces asynchronously: `EMAIL_WEBHOOK_SECRET` set and an adapter
      posting to `/api/email/events`.
