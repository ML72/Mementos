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
npm run lint:server     # root package only (src/server, src/types, test/, scripts/, root configs)
npm run lint:client     # client package only

npm run email:preview                    # render every email template to HTML (prints file:// links)
npm run email:send -- you@example.com    # send every template through the SMTP settings in .env
```

The Vite dev server proxies `/api/*` to `http://localhost:3000`, so the client talks to the API with same-origin relative URLs in every environment.

## Backend architecture

Strict three-layer separation under `src/server`:

- **routes/** — Express routers, one per resource (`auth`, `users`, `notes`, `email`), mounted at `/api/*` in `index.ts`. Routes handle HTTP only: `express-validator` checks, calling a service, and shaping the response. They do **not** touch Mongoose directly. `email` is the one router that answers with HTML pages (it serves links clicked from emails); every other endpoint is JSON.
- **service/internal/** — our own services: business logic in classes (`AuthService`, `UserService`, `NotesService`, `FeedService`, `CodeService`, `DigestService`). Services **never throw to the caller**; they return result objects shaped `{ success: boolean, error?: string, ...data }`. Routes branch on `result.success` and pick the HTTP status. Public surface of `internal/` and `external/` is re-exported through `service/index.ts`.
- **service/external/** — connections to services outside the app, no business logic: `mailer.ts` sends email over SMTP (`getMailer()`). Without `SMTP_HOST` it prints each message to the console instead, and under test it keeps them in a `MemoryMailer` (tests inject their own via `setMailer`). These can throw (`send` rejects with a `SendFailure`); the internal services catch it.
- **models/** — Mongoose schemas (`User`, `Note`).
- **config/** — app setup (`connectDB`, CSP/CORS, the www redirect) and the email templates in `mail_templates.ts`. Templates render through its escaping `html` tagged template — never build HTML from user content by concatenation. Give each new template a sample in `scripts/email.ts` (local preview/send tooling, outside the server build).

When adding an endpoint, follow the chain: validate in the route → call/extend a service method returning a result object → return data or `sendError`. Don't put DB queries in routes or HTTP concerns in services.

### Conventions that matter

- **Errors:** always use `sendError(res, status, message, extra?)` from `util/http_responses.ts`. It normalizes to `{ errors: [{ msg }], is_token_invalid, ...extra }` — the client parses `errors[].msg`. `message` may be a string or string array (validation errors pass `errors.array().map(e => e.msg)`). There is no `sendSuccess` helper; success responses use `res.json(...)` directly. The client shows validation messages to users as they are, so say what is wrong and the limit (`Tag "…" is too long: tags can be at most 30 characters`), and validate every field the schema constrains: a bad value that reaches a failed save can only be answered with "Server error". Count lengths with `String#length`, as Mongoose's `maxlength` does (`isLength` counts code points, so emoji would pass it and then fail the save).
- **Auth:** JWT is sent in the **`x-auth-token` header** (not `Authorization: Bearer`). The `privateAccess` middleware (`middleware/auth.ts`) checks it through `AuthService.verifyToken` and sets `req.user = { id }`. Protected routes list `privateAccess` first. Token-invalid responses set `is_token_invalid: true` so the client can force a logout; a failed check on our side (DB down) answers 500 without it, so it never signs anyone out.
- **Sessions are bound to the password:** `signToken(userId, passwordChangedAt)` puts the account's `login.passwordChangedAt` (ms) in the token, and `verifyToken` (one `_id` point lookup per authenticated request) refuses a token whose value no longer matches — moving `passwordChangedAt` is how a password reset or change signs every other session out. Exact match, not an `iat` comparison (whole seconds would let a token issued in the reset's second survive). Sign-ins sign from a **lean** read (with `dateCreated`) via `ensurePasswordChangedAt(user)`, which gives an account that predates the field its creation date in a conditional write — a token bound to a missing value could never verify; a token without the claim is refused. Any number of sessions (tabs, devices) can be open at once; signing in never revokes another. A refused token's 401 says why (`SESSION_EXPIRED`, or `SESSION_REVOKED` after a password change), and the client shows that message.
- **Config:** all env/tunable values live in `settings.ts` (`JWT_SECRET`, `MONGO_URI`, `CONTENT_LIMITS`, `REQUEST_CONSTRAINTS`, `EMAIL`, etc.) with hardcoded dev defaults. Schemas and validators import limits from here rather than hardcoding numbers — change a limit in one place.
- **Startup status lines:** each service the server connects to logs one line at boot, prefixed with its name: `DATABASE:` from `connectDB` (which also logs each later drop and reconnect), `EMAIL:` from `checkMailer`, and `DIGEST:` from `startDigestScheduler` (which also logs a count after each run that did something). Give a new service the same, so one that is down or misconfigured shows in the server log.
- **Models:** `User` nests `login` (email/password/verified) and `profile` (fullName/bio), plus `following`/`followers`/`likedNotes` ObjectId arrays. `login.email` is stored **lowercased and trimmed** (schema `lowercase`/`trim`, which Mongoose also applies to query filters) and routes normalize it too — never compare it case-sensitively. Passwords are bcrypt-hashed in `UserService.createUser`. Mutual follow/unfollow uses a `bulkWrite` to update both users atomically. `User` has a weighted **text index** on `profile.fullName` (weight 5) and `profile.bio` (weight 1); user search uses `$text` with `textScore` sorting, plus a direct `_id` lookup when the query looks like an ObjectId.
- **Email verification:** registration returns `{ verificationRequired: true }` and **no token**; a 6-digit code is emailed and `POST /api/auth/verify-email { email, code }` verifies the account and returns the token. Signing in to an unverified account with the right password gets a 403 carrying `email_unverified: true` (and a fresh code); the client routes both cases to `/verify-email`. `EMAIL.VERIFICATION.REQUIRED=false` turns the gate off. Emailed codes go through `CodeService` (`issue`/`redeem`, keyed by the User subtree holding the state): HMAC-hashed, attempt counter incremented in the same write that fetches the code, issuance limits written as compare-and-set updates, plus the per-IP `emailCodeLimiter`. Endpoints that take an address from the public answer identically whatever the outcome, and respond before doing the work.
- **Password reset/change:** `POST /api/auth/forgot-password { email }` mails a code (the `passwordReset` subtree, same `CodeService` rules, unverified accounts included); `POST /api/auth/reset-password { email, code, password }` sets the password, moves `passwordChangedAt`, marks the address verified (the code proved it) and returns a token. That is also the answer to **squatters** — someone who registered an address that isn't theirs: the owner resets, which hands them the account and revokes the squatter's sessions. `POST /api/auth/change-password { currentPassword, newPassword }` (private) does the same for a signed-in user, conditional on the password hash it checked, so a reset landing meanwhile wins. Both return a fresh token for the caller. Every new password, at sign-up too, goes through `newPasswordCheck` (`util/validators.ts`, against `CONTENT_LIMITS.USER`); signing in checks no length.
- **Weekly digest:** `DigestService.run(now)` (`service/internal/digest.ts`) mails each opted-in, verified, deliverable user at **12AM UTC on `settings.email.digestDay`** (default: the weekday the account was created, UTC) the top `EMAIL.DIGEST.NOTE_COUNT` notes from `FeedService.previewFeed` — the feed algorithm without recording impressions — under a write-a-note reminder. `settings.email.nextDigestAt` is the denormalized next slot (`nextDigestAt(day, after, lastSentAt)`), never within `MIN_GAP_HOURS` (6 days) of the last digest; a send claims it together with `lastDigestSentAt` in one conditional write, so overlapping runs and several app instances never double-send. Users whose slot passed but who can't be mailed are moved to their next slot, never caught up later. `startDigestScheduler` runs the job at boot and at the top of every hour (UTC), in-process. Settings are `GET/PUT /api/users/settings` (explicit `{ weeklyDigest, digestDay, nextDigestAt }` whitelist). Every digest has `List-Unsubscribe` + one-click `List-Unsubscribe-Post`; `GET /api/email/unsubscribe?token=` only renders a confirmation page (prefetchers follow GETs), its form's `POST` (also what mail clients send) turns the digest off — consent only, `deliveryStatus` untouched.
- **Email schema:** `settings.email.deliveryStatus`/`bounceCount`/`lastBounceAt` are read by the digest but **not written yet** — reserved for a bounce/complaint handler. `AuthService.getUserById` projects out `login.password`, `emailVerification`, `passwordReset` and `settings.email.unsubscribeToken` — keep any new raw-user read doing the same. Mongoose **persists defaults applied on load** at the next `save()`, so a default for a field that existing accounts lack must be right for them too. The Docker seed (`docker/mongo_seed`) is inserted raw, bypassing Mongoose, so give it every new field.
- **Email addresses stay private:** an address goes only to its owner, so populate another user with `profile.fullName` at most. The Privacy Policy promises this, and `test/integration/privacy.test.ts` checks every read that returns another user: add new ones to it.
- **ObjectId comparison:** compare ObjectIds with `.equals()` (e.g. `arr.some(id => id.equals(other))`) or `.toString()` — never `Array.includes()` / `===`, which compare by reference and break for re-fetched documents.

## Frontend architecture

`src/client/src`:

- **State:** Redux Toolkit store (`store/store.ts`) with `auth` and `ui` slices. `redux-persist` persists **only the `auth` slice** to localStorage. `RootState` is exported from the store.
- **One session across tabs:** every tab shares that saved `auth` slice but runs its own store, so `service/session_sync.ts` (installed from `main.tsx`, injected deps like the interceptors) has each tab adopt it whenever another tab changes it — `storage` events, plus `pageshow` after the back/forward cache — and signing in, signing out or a new token reaches every tab. Before a tab signs out over a refused token, `adoptNewerSession` takes over a newer token another tab saved instead, since signing out would erase it for all of them. The store is the only copy of the token: there is no `axios.defaults` header to keep in step.
- **API calls:** `service/*.ts` modules wrap axios. Both axios **interceptors** live in `service/interceptors.ts` and are installed once from `main.tsx` via `setupAxiosInterceptors`, which takes `getToken`/`onTokenInvalid` as injected deps so the module imports neither the store nor the auth service: the request interceptor attaches `x-auth-token` to every request — the **store's** token, overriding any header passed per call, so put a new token in the store (`updateToken`) before using it — and the response interceptor signs the user out (`handleTokenInvalid`, with the API's reason) when a response carries `is_token_invalid: true` for the token the tab still holds — a refusal of an older one (swapped mid-flight by a password change, or since signed out and in again) is ignored — then re-rejects so per-call error handling still runs. Service functions take `dispatch` as their first arg, return `null`/`false` on failure, and surface errors via alerts — components generally don't handle API errors themselves. Use the shared `setApiErrorAlert(dispatch, err, fallbackMsg)` helper (`service/alert.ts`) in catch blocks; it reads `err.response.data.errors[].msg` and raises one alert per message, falling back to `fallbackMsg`. Don't re-implement that parsing inline (and note each error element is an object `{ msg }`, not a string).
- **Routing/permissions:** `App.tsx` defines all routes. `PublicPage` and `AuthenticatedPage` (in `components/permissions/`) gate access; `AuthenticatedPage` takes `allowedRoles`. Private pages live in `pages/private`, public in `pages/public`.
- **Code splitting:** every page except `Landing` is a `lazyPage` (`service/lazy_page.ts`) with its own chunk, so the landing page doesn't ship the signed-in app or the Markdown/KaTeX stack (over a third of the old single bundle). Import new pages the same way, and keep heavy libraries out of anything `Landing`, `main.tsx` or the layout imports. Pages download in the background once the current one has loaded (`preloadWhenIdle`); the signed-in ones wait until a signed-out visitor leaves the landing page. Navigations are transitions, so the current page stays up while the next downloads; `PageLoading` shows on a first load and during the permission redirects. A page that fails to download (a tab opened before a deploy, whose chunks are gone) reloads the tab once a minute at most; `PageErrorBoundary` shows anything that still fails.
- **UI:** MUI (`@mui/material`) + Emotion. Notes render Markdown with math via `react-markdown` + `remark-math` + `rehype-katex`.
- **Page titles:** every page names itself through `CustomPage`'s required `title` prop, which becomes `Mementos | <title>`, so a new page can't be left out. `index.html` carries the landing page's title for the moment before the app loads. Titles go to Google Analytics with every hit, so keep people's names, note subjects and other user content out of them: `ProfilePage` is just `Profile`.
- **Analytics:** Google Tag Manager (container `GTM-TJ7HT245`, carrying the GA4 stream) is loaded by `startAnalytics` (`service/analytics.ts`), in production builds only so `npm run dev` doesn't count as traffic. `CustomPage` calls it after setting the first page's title, because Google's first hit reports `document.title` as it stands: a tag in `index.html` beats the page there and files every direct visit under the landing page's title. Later page views come from Google's history listener, which waits a second after the address changes before reading the title, so a page that takes longer than that to download goes in under the previous page's title. What the container does is configured in Tag Manager, not here. `SECURITY_CSP` (`settings.ts`) allows the hosts Google lists for its own tags, so a tag added in Tag Manager that loads from anywhere else, or a Custom HTML tag with an inline script, stays blocked. That only shows in production, as the Vite dev server sends no CSP. `?email=` URLs (`/verify-email`, `/reset-password`, `/forgot-password`) reach GA as `?email=(redacted)` only through the GA4 stream's email redaction setting, so keep it on and keep other personal data out of URLs.
- **Terms and privacy:** `pages/public/TermsOfService.tsx` (`/terms`, with the policy at `/terms#privacy`, linked from sign-up) describes what the app really does, down to who can see what and what Google Analytics receives. Update it, and its date, when that changes: a new field, provider or tag, a note visibility setting, an account deletion feature.
- **Crawlers:** `public/robots.txt` and `public/sitemap.xml` are static files. Add a page that should appear in search to the sitemap, and a signed-in page or a step of signing in to `robots.txt`. It blocks `/api/`, so a public page has to render without calling the API, or crawlers see it broken.

## Testing

- Integration tests (`test/integration/*.test.ts`) use Jest + ts-jest + Supertest against the real Express `app` and **separate databases** (`mementos_test*`). Docker Mongo must be running. Suites that just need a logged-in user call `registerVerified` from `test/helpers/auth.ts`; mail tests inject a `MemoryMailer` and read codes back out of captured messages. `NODE_ENV=test` always selects the memory transport, so no `.env` setting can make the suite send real mail.
- `index.ts` skips `connectDB()`, `checkMailer()`, `startDigestScheduler()` and `app.listen()` when `NODE_ENV === 'test'`; each test file connects/disconnects Mongoose itself and clears collections in `beforeEach`. Digest tests call `DigestService.run(now)` directly with `EMAIL.DIGEST.THROTTLE_MS = 0`.
- Jest runs with `maxWorkers: 1` and `forceExit: true` — tests share one DB connection and must run serially. Keep that in mind when adding tests.
- Cypress is configured (`cypress.config.ts`, baseUrl :5173) for e2e but specs may not yet exist.

## Production / deployment

In production (`NODE_ENV=production`) the Express server additionally serves the built client from `src/client/dist` and falls back to `index.html` for non-`/api` routes — the whole app deploys as one unit (Azure App Service). Azure passes responses through as the app sends them, so the `compression` middleware compresses them (Brotli, or gzip, for text over 1 KB); a streamed response such as server-sent events must call `res.flush()` after each write, or the compressor holds it back. See `docs/DEPLOYMENT_OVERVIEW.md` and `docs/DEPLOYMENT_SETUP.md`. Required env vars: `NODE_ENV`, `MONGO_URI`, `JWT_SECRET`; for email to be delivered also `EMAIL_FROM` and the `SMTP_*` variables (any SMTP provider; the project uses Resend — see `docs/ENVIRONMENT_OVERVIEW.md`). Links in emails go to `EMAIL.APP_URL`: `APP_URL` if set, else `https://www.<WWW_REDIRECT_HOST>`, else Azure's `WEBSITE_HOSTNAME`. The digest job is a timer inside the server process, so it only runs while the process is up (production uses Always On).

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
