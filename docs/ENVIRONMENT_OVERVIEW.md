# Environment Variables

All server configuration is centralized in [`src/server/settings.ts`](../src/server/settings.ts).
Every value has a hardcoded development default, so the app runs with **no** environment
variables set. Variables are read from the process environment; a `.env` file at the repo
root is loaded automatically (via `dotenv`) when the server starts. See
[`.env.example`](../.env.example) for a starting template.

> These are **server-side** variables (the Express API at the repo root). The React client in
> `src/client` is configured separately and talks to the API over same-origin `/api/*` URLs.

For deployment-specific guidance (Azure App Service, custom domains), see
[DEPLOYMENT_OVERVIEW.md](./DEPLOYMENT_OVERVIEW.md).

---

## Core variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | No | `development` | `development` \| `production` \| `test`. In `production` the server also serves the built client; in `test` it skips the DB connect and the listener. |
| `PORT` | No | `3000` | Port the API listens on. |
| `MONGO_URI` | Prod | `mongodb://127.0.0.1:27017/dev` | MongoDB connection string. |
| `JWT_SECRET` | Prod | `im-so-secret!` | Secret used to sign JWTs. **Set a strong value in production.** |
| `SECURITY_CSP` | No | (sensible default) | Content-Security-Policy header value. |
| `SECURITY_CORS_WHITELIST` | No | dev: localhost; prod: empty | `;`-separated list of allowed origins. Empty ⇒ same-origin only. |
| `WWW_REDIRECT_HOST` | No | (empty) | Apex domain to 301-redirect to its `www` subdomain. See deployment doc. |

---

## Production notes

- **Set `JWT_SECRET`, `MONGO_URI`, and `NODE_ENV=production`** (see deployment doc).

---

## Email

The app sends a **password reset code** (transactional) and a **weekly digest** of each user's
feed (bulk, opt-out). Nothing below is required to run it: with no SMTP configured every message
is printed to the server console instead of delivered, which is how the flows are exercised
locally.

| Variable | Required | Default | Description |
|---|---|---|---|
| `APP_URL` | Prod | `http://localhost:5173` | Public origin used to build links inside emails (open the app, one-click unsubscribe). |
| `EMAIL_FROM` | Prod | `Mementos <no-reply@mementos.localhost>` | Sender shown on every message. Use a domain you control with SPF/DKIM configured. |
| `SMTP_URL` | Prod* | (empty) | Full SMTP connection URL, e.g. `smtps://user:pass@smtp.example.com:465`. |
| `SMTP_HOST` | Prod* | (empty) | SMTP host, when not using `SMTP_URL`. |
| `SMTP_PORT` | No | `587` | SMTP port. |
| `SMTP_SECURE` | No | `false` | `true` for implicit TLS (typically port 465); `false` for STARTTLS (587). |
| `SMTP_USER` / `SMTP_PASS` | No | (empty) | SMTP credentials, when not using `SMTP_URL`. |
| `EMAIL_TRANSPORT` | No | auto | Force `smtp`, `console` or `memory`. Auto picks `smtp` when `SMTP_URL`/`SMTP_HOST` is set, `memory` under `NODE_ENV=test`, otherwise `console`. |
| `PASSWORD_RESET_SECRET` | No | `JWT_SECRET` | HMAC secret for reset codes. Rotating it invalidates every in-flight code. |
| `PASSWORD_RESET_IP_MAX_REQUESTS` | No | `20` | Per-IP cap on `forgot-password` + `reset-password` calls per 15 minutes. |
| `DIGEST_ENABLED` | No | `true` | Whether the weekly digest job is scheduled at all. |
| `DIGEST_CRON` | No | `0 9 * * 1` | When the digest runs (cron expression; default Mondays 09:00). Validated at startup — an invalid value is logged loudly and the job is not scheduled. |
| `DIGEST_TIMEZONE` | No | `UTC` | IANA timezone the cron expression is evaluated in. |
| `DIGEST_THROTTLE_MS` | No | `200` | Pause between recipients, so a large user base is mailed over a window rather than in one burst. |

\* One of `SMTP_URL` or `SMTP_HOST` is needed for mail to actually be delivered.

### Production notes

- **Set `APP_URL`, `EMAIL_FROM` and SMTP credentials.** Without SMTP the server logs a warning at
  startup and prints every message to the console.
- The digest is safe to schedule on **every** instance of a multi-instance deployment: each
  recipient is claimed with an atomic compare-and-set before being mailed, so no one is mailed
  twice and no external lock is needed.
- **Databases that predate this feature:** email is now stored (and looked up) lowercased, so any
  account whose stored address has uppercase in it can no longer sign in until it is normalized.
  Check for addresses that would collide, then normalize once:

  ```js
  db.users.aggregate([{ $group: { _id: { $toLower: '$login.email' }, n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }])
  db.users.updateMany({}, [{ $set: { 'login.email': { $toLower: { $trim: { input: '$login.email' } } } } }])
  ```

  Nothing else needs backfilling: the email fields landed on `User` with defaults before this
  feature, and every query here treats a missing one as "not opted in" rather than failing.
