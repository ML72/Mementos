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

The app emails a **verification code** when an account is created; the account cannot sign in
until the code is entered. Mail is sent over SMTP, so any provider that offers SMTP works.
Nothing below is required to run it locally: without `SMTP_HOST`, every message is printed to the
server console instead of delivered, so the code can be read from the terminal.

| Variable | Required | Default | Description |
|---|---|---|---|
| `APP_URL` | Prod | `http://localhost:5173` | Public origin used to build links inside emails. |
| `EMAIL_FROM` | Prod | `Mementos <no-reply@mementos.localhost>` | Sender shown on every message. Must be on a domain verified with the mail provider. |
| `SMTP_HOST` | Prod | (empty) | SMTP server. Mail is delivered only when this is set. |
| `SMTP_PORT` | No | `587` | SMTP port. |
| `SMTP_SECURE` | No | `true` if `SMTP_PORT` is `465`, else `false` | `true` for implicit TLS (typically port 465); `false` for STARTTLS (587). |
| `SMTP_USER` / `SMTP_PASS` | Prod | (empty) | SMTP credentials from the provider. |
| `EMAIL_VERIFICATION_REQUIRED` | No | `true` | `false` lets accounts sign in without verifying — an escape hatch if mail delivery is down. |
| `EMAIL_CODE_SECRET` | No | `JWT_SECRET` | HMAC secret for emailed codes. Rotating it invalidates every in-flight code. |
| `EMAIL_CODE_IP_MAX_REQUESTS` | No | `20` | Per-IP cap on the public code endpoints (`verify-email`, `resend-verification`) per 15 minutes. |

### SMTP provider

Any provider with SMTP works (Resend, Amazon SES, Postmark, SendGrid, Mailgun, ...): verify the
sending domain with it (it lists the DNS records to add), then copy its SMTP settings. This
project uses [Resend](https://resend.com), where the password is an API key:

```
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=resend
SMTP_PASS=<Resend API key>
EMAIL_FROM="Mementos <no-reply@your-verified-domain>"
```

The server checks the SMTP connection at startup and logs `EMAIL: SMTP connection verified`, or
the reason it failed. Until a domain is verified, Resend only delivers from
`onboarding@resend.dev` to the account owner's own address, to test the flow.

### Testing locally

The automated tests never deliver mail: under `NODE_ENV=test` every message is kept in memory,
even with SMTP configured.
To check email by hand, there are three levels, cheapest first:

1. **Preview the templates.** `npm run email:preview` renders every template with sample data and
   prints `file://` links to its HTML and plain-text versions. It needs neither the server nor
   MongoDB; re-run it after editing `src/server/config/mail_templates.ts` and refresh the browser tab.
2. **Run the flow without delivery.** With no `SMTP_HOST` set, `npm run dev` prints each email's
   plain-text part in the server terminal: sign up, then copy the code from there.
3. **Send real email.** Put the [SMTP settings](#smtp-provider) in `.env`. With Resend and no
   verified domain yet, set `EMAIL_FROM="Mementos <onboarding@resend.dev>"` and send only to the
   address your Resend account belongs to. `npm run email:send -- <address>` checks the SMTP
   login and sends every template there; `npm run dev` then logs `EMAIL: SMTP connection verified`
   and sign-ups get real codes. Remove the variables afterwards, or every local sign-up sends real
   mail.

A new template shows up in `email:preview` and `email:send` once it has a sample in
[`scripts/email.ts`](../scripts/email.ts).

### Production notes

- **Set `APP_URL`, `EMAIL_FROM` and the SMTP variables.** Without `SMTP_HOST` the server warns at
  startup (`EMAIL: SMTP_HOST is not set, ...`) and prints every message to the console.
- **Existing accounts** were all created with `login.verified: false`, so each is asked to verify
  the next time it signs in (sessions already open are untouched). To exempt them instead:
  `db.users.updateMany({}, { $set: { 'login.verified': true } })` before deploying.
- **Email is now stored and looked up lowercased.** An account whose stored address has uppercase
  in it cannot sign in until it is normalized. Check for addresses that would collide, then
  normalize once:

  ```js
  db.users.aggregate([{ $group: { _id: { $toLower: '$login.email' }, n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }])
  db.users.updateMany({}, [{ $set: { 'login.email': { $toLower: { $trim: { input: '$login.email' } } } } }])
  ```
