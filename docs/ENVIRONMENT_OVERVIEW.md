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

## Not yet configured: email

The app sends no email today. The `User` schema already reserves the fields an email feature
will need (password-reset codes, digest preferences, unsubscribe tokens, delivery health), but
there is no mailer, no SMTP configuration, and no scheduled job. Add the SMTP and
digest-scheduling variables to the table above when that feature is built.
