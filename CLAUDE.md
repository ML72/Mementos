# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Mementos is a social note-taking app: users write notes, tag them, set an importance (1–10), follow other users, and like notes. It's a single-repo full-stack TypeScript app — an Express/MongoDB API at the root and a React/Vite SPA in `src/client`.

## Repository layout

This is **two npm packages**, each with its own `package.json` and `node_modules`:
- Root — the Express backend (`src/server`), tests, Docker, and deployment config.
- `src/client` — the React frontend (separate dependency tree, separate `tsconfig`).

`npm run install:all` installs both. Running `npm install` at the root alone will not install client deps.

## Commands

Run from the repo root unless noted:

```bash
npm run install:all     # install root + client deps
npm run docker:up       # start MongoDB (+ seed) — required before dev or tests
npm run dev             # run server (:3000) and client (:5173) concurrently
npm run docker:down     # stop MongoDB

npm run build           # build client then compile server -> dist/
npm start               # run compiled server (needs NODE_ENV=production to serve the client)

npm test                # jest integration tests (Docker Mongo must be running)
npx jest test/integration/notes.test.ts            # single test file
npx jest -t "should register a new user"           # single test by name

npm run lint            # eslint over both packages
npm run lint:server     # root package only (src/server, src/types, test/, root configs)
npm run lint:client     # client package only

npm run migrate:email   # one-time backfill of email-feature fields on pre-existing accounts (--dry-run to report)
```

The Vite dev server proxies `/api/*` to `http://localhost:3000`, so the client talks to the API with same-origin relative URLs in every environment.

## Backend architecture

Strict three-layer separation under `src/server`:

- **routes/** — Express routers, one per resource (`auth`, `users`, `notes`, `email`), mounted at `/api/*` in `index.ts`. Routes handle HTTP only: `express-validator` checks, calling a service, and shaping the response. They do **not** touch Mongoose directly.
- **service/internal/** — business logic in classes (`AuthService`, `UserService`, `NotesService`, `FeedService`, `EmailService`, `DigestService`). Services **never throw to the caller**; they return result objects shaped `{ success: boolean, error?: string, ...data }`. Routes branch on `result.success` and pick the HTTP status. Public surface is re-exported through `service/index.ts`.
- **models/** — Mongoose schemas (`User`, `Note`).
- **mail/** — infrastructure, not business logic: the `Mailer` interface with SMTP/console/memory transports (`getMailer()`; tests inject a `MemoryMailer` via `setMailer`) and the templates. Templates render through the escaping `html` tagged template in `mail/templates.ts` — never build HTML from user content by concatenation.
- **jobs/** — the `node-cron` digest scheduler, started from `index.ts` (skipped under `NODE_ENV=test`).
- **scripts/** — operational scripts compiled alongside the server (`dist/scripts/*`), currently the email-schema migration.

When adding an endpoint, follow the chain: validate in the route → call/extend a service method returning a result object → return data or `sendError`. Don't put DB queries in routes or HTTP concerns in services.

### Conventions that matter

- **Errors:** always use `sendError(res, status, message, extra?)` from `util/http_responses.ts`. It normalizes to `{ errors: [{ msg }], is_token_invalid, ...extra }` — the client parses `errors[].msg`. `message` may be a string or string array (validation errors pass `errors.array().map(e => e.msg)`). There is no `sendSuccess` helper; success responses use `res.json(...)` directly.
- **Auth:** JWT is sent in the **`x-auth-token` header** (not `Authorization: Bearer`). The `privateAccess` middleware (`middleware/auth.ts`) verifies it, then does one `_id` lookup to reject tokens issued before `login.passwordChangedAt` (this is what signs other sessions out after a password reset) and sets `req.user = { id }`. Protected routes list `privateAccess` first. Token-invalid responses set `is_token_invalid: true` so the client can force a logout.
- **Config:** all env/tunable values live in `settings.ts` (`JWT_SECRET`, `MONGO_URI`, `CONTENT_LIMITS`, `REQUEST_CONSTRAINTS`, `EMAIL`, etc.) with hardcoded dev defaults. Schemas and validators import limits from here rather than hardcoding numbers — change a limit in one place.
- **Models:** `User` nests `login` (email/password/verified/passwordChangedAt) and `profile` (fullName/bio), plus `following`/`followers`/`likedNotes` ObjectId arrays. `login.email` is stored **lowercased and trimmed** (schema `lowercase`/`trim`, which Mongoose also applies to query filters) and routes normalize it too — email is the identity key for login and password reset, so never compare it case-sensitively. Passwords are bcrypt-hashed in `UserService.createUser`. Mutual follow/unfollow uses a `bulkWrite` to update both users atomically. `User` has a weighted **text index** on `profile.fullName` (weight 5) and `profile.bio` (weight 1); user search uses `$text` with `textScore` sorting, plus a direct `_id` lookup when the query looks like an ObjectId.
- **Email feature:** see `docs/EMAIL.md`. Password reset (`AuthService.requestPasswordReset/resetPassword`: HMAC-hashed 6-digit codes, per-account cooldown/window/attempt counters written as conditional updates, plus a per-IP limiter), the weekly digest (`DigestService.run`: cursor over opted-in + deliverable users, `FeedService.previewFeed` for a side-effect-free page, atomic claim on `settings.email.lastDigestSentAt` *before* sending), one-click unsubscribe by token, and delivery health (`EmailService.recordDeliveryEvent`). The forgot-password route responds **before** doing the work so timing reveals nothing. `AuthService.getUserById` projects out `login.password`, `passwordReset` and `settings.email.unsubscribeToken` — keep any new raw-user read doing the same, and keep `GET/PUT /api/users/settings` an explicit whitelist. Accounts predating the schema need the one-time `npm run migrate:email`.
- **ObjectId comparison:** compare ObjectIds with `.equals()` (e.g. `arr.some(id => id.equals(other))`) or `.toString()` — never `Array.includes()` / `===`, which compare by reference and break for re-fetched documents.

## Frontend architecture

`src/client/src`:

- **State:** Redux Toolkit store (`store/store.ts`) with `auth` and `ui` slices. `redux-persist` persists **only the `auth` slice** to localStorage. `RootState` is exported from the store.
- **API calls:** `service/*.ts` modules wrap axios. Both axios **interceptors** live in `service/interceptors.ts` and are installed once from `main.tsx` via `setupAxiosInterceptors`, which takes `getToken`/`onTokenInvalid` as injected deps so the module imports neither the store nor the auth service: the request interceptor attaches `x-auth-token` to every request, and the response interceptor signs the user out (`handleTokenInvalid`) as soon as any response carries `is_token_invalid: true`, then re-rejects so per-call error handling still runs. Service functions take `dispatch` as their first arg, return `null`/`false` on failure, and surface errors via alerts — components generally don't handle API errors themselves. Use the shared `setApiErrorAlert(dispatch, err, fallbackMsg)` helper (`service/alert.ts`) in catch blocks; it reads `err.response.data.errors[].msg` and raises one alert per message, falling back to `fallbackMsg`. Don't re-implement that parsing inline (and note each error element is an object `{ msg }`, not a string).
- **Routing/permissions:** `App.tsx` defines all routes. `PublicPage` and `AuthenticatedPage` (in `components/permissions/`) gate access; `AuthenticatedPage` takes `allowedRoles`. Private pages live in `pages/private`, public in `pages/public`.
- **UI:** MUI (`@mui/material`) + Emotion. Notes render Markdown with math via `react-markdown` + `remark-math` + `rehype-katex`. The people/graph view uses `reagraph`.

## Testing

- Integration tests (`test/integration/*.test.ts`) use Jest + ts-jest + Supertest against the real Express `app` and **separate databases** (`mementos_test*`). Docker Mongo must be running. Email tests inject a `MemoryMailer` and read reset codes back out of captured messages; `forgot-password` answers before it sends, so they poll for the mail rather than assuming it is there on response.
- `index.ts` skips `connectDB()` and `app.listen()` when `NODE_ENV === 'test'`; each test file connects/disconnects Mongoose itself and clears collections in `beforeEach`.
- Jest runs with `maxWorkers: 1` and `forceExit: true` — tests share one DB connection and must run serially. Keep that in mind when adding tests.
- Cypress is configured (`cypress.config.ts`, baseUrl :5173) for e2e but specs may not yet exist.

## Production / deployment

In production (`NODE_ENV=production`) the Express server additionally serves the built client from `src/client/dist` and falls back to `index.html` for non-`/api` routes — the whole app deploys as one unit (Azure App Service). See `docs/DEPLOYMENT_OVERVIEW.md` and `docs/DEPLOYMENT_SETUP.md`. Required env vars: `NODE_ENV`, `MONGO_URI`, `JWT_SECRET`; for email to actually be delivered also `APP_URL`, `EMAIL_FROM` and `SMTP_URL`/`SMTP_HOST` (see `docs/ENVIRONMENT_OVERVIEW.md`).

## Gotchas

- The root `package.json` lists `react-router` v5 in dependencies, but the client actually uses v7 (declared in `src/client/package.json`). Treat the client's manifest as authoritative for frontend deps.
- `tsc` (server build) only includes `src/server` and `src/types`; the client is built separately by Vite.
- The `@/*` → `src/*` path alias is configured for Jest only, not for the server runtime.
- **ESLint stays on the 9.x line.** Each package has its own flat config (`eslint.config.js` at the
  root, `src/client/eslint.config.js`) matching the two-package split. ESLint 10 needs Node
  `^20.19 || ^22.13 || >=24`, but `engines` and both GitHub workflows pin Node 20.11.0, and
  `eslint-plugin-react` (7.37.5) declares no ESLint 10 peer support — so moving to 10 means
  bumping the Node runtime first. `@typescript-eslint/no-explicit-any` is off on purpose: `any`
  is idiomatic here (`dispatch: any`, `err: any`, `noImplicitAny: false`).
