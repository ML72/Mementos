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

npm run lint --prefix src/client   # eslint (client only; no server lint configured)
```

The Vite dev server proxies `/api/*` to `http://localhost:3000`, so the client talks to the API with same-origin relative URLs in every environment.

## Backend architecture

Strict three-layer separation under `src/server`:

- **routes/** — Express routers, one per resource (`auth`, `users`, `notes`), mounted at `/api/*` in `index.ts`. Routes handle HTTP only: `express-validator` checks, calling a service, and shaping the response. They do **not** touch Mongoose directly.
- **service/internal/** — business logic in classes (`AuthService`, `UserService`, `NotesService`). Services **never throw to the caller**; they return result objects shaped `{ success: boolean, error?: string, ...data }`. Routes branch on `result.success` and pick the HTTP status. Public surface is re-exported through `service/index.ts`.
- **models/** — Mongoose schemas (`User`, `Note`).

When adding an endpoint, follow the chain: validate in the route → call/extend a service method returning a result object → return data or `sendError`. Don't put DB queries in routes or HTTP concerns in services.

### Conventions that matter

- **Errors:** always use `sendError(res, status, message, extra?)` from `util/http_responses.ts`. It normalizes to `{ errors: [{ msg }], is_token_invalid, ...extra }` — the client parses `errors[].msg`. `message` may be a string or string array (validation errors pass `errors.array().map(e => e.msg)`). There is no `sendSuccess` helper; success responses use `res.json(...)` directly.
- **Auth:** JWT is sent in the **`x-auth-token` header** (not `Authorization: Bearer`). The `privateAccess` middleware (`middleware/auth.ts`) verifies it and sets `req.user = { id }`. Protected routes list `privateAccess` first. Token-invalid responses set `is_token_invalid: true` so the client can force a logout.
- **Config:** all env/tunable values live in `settings.ts` (`JWT_SECRET`, `MONGO_URI`, `CONTENT_LIMITS`, `REQUEST_CONSTRAINTS`, etc.) with hardcoded dev defaults. Schemas and validators import limits from here rather than hardcoding numbers — change a limit in one place.
- **Models:** `User` nests `login` (email/password/verified) and `profile` (fullName/bio), plus `following`/`followers`/`likedNotes` ObjectId arrays. Passwords are bcrypt-hashed in `UserService.createUser`. Mutual follow/unfollow uses a `bulkWrite` to update both users atomically. `User` has a weighted **text index** on `profile.fullName` (weight 5) and `profile.bio` (weight 1); user search uses `$text` with `textScore` sorting, plus a direct `_id` lookup when the query looks like an ObjectId.
- **Reserved email schema:** `User` carries fields for an email feature that has **not** been built: `login.passwordChangedAt`, the `passwordReset` subtree, and `settings.email.*` (weekly-digest opt-out, unsubscribe token, delivery health, last-sent bookkeeping). Nothing reads or writes them today — they are landed early, with defaults, so every account created from here on has them and the feature never needs a "does this field exist?" check. Accounts predating the schema still need a one-time migration before that holds; there is no backfill script in the repo. `AuthService.getUserById` projects out `passwordReset` and `settings.email.unsubscribeToken` — keep any new raw-user read doing the same.
- **ObjectId comparison:** compare ObjectIds with `.equals()` (e.g. `arr.some(id => id.equals(other))`) or `.toString()` — never `Array.includes()` / `===`, which compare by reference and break for re-fetched documents.

## Frontend architecture

`src/client/src`:

- **State:** Redux Toolkit store (`store/store.ts`) with `auth` and `ui` slices. `redux-persist` persists **only the `auth` slice** to localStorage. `RootState` is exported from the store.
- **API calls:** `service/*.ts` modules wrap axios. An axios **request interceptor** (`service/auth.ts`) reads the token from the Redux store and attaches `x-auth-token` on every request. Service functions take `dispatch` as their first arg, return `null`/`false` on failure, and surface errors via alerts — components generally don't handle API errors themselves. Use the shared `setApiErrorAlert(dispatch, err, fallbackMsg)` helper (`service/alert.ts`) in catch blocks; it reads `err.response.data.errors[].msg` and raises one alert per message, falling back to `fallbackMsg`. Don't re-implement that parsing inline (and note each error element is an object `{ msg }`, not a string).
- **Routing/permissions:** `App.tsx` defines all routes. `PublicPage` and `AuthenticatedPage` (in `components/permissions/`) gate access; `AuthenticatedPage` takes `allowedRoles`. Private pages live in `pages/private`, public in `pages/public`.
- **UI:** MUI (`@mui/material`) + Emotion. Notes render Markdown with math via `react-markdown` + `remark-math` + `rehype-katex`. The people/graph view uses `reagraph`.

## Testing

- Integration tests (`test/integration/*.test.ts`) use Jest + ts-jest + Supertest against the real Express `app` and a **separate database** (`mementos_test`). Docker Mongo must be running.
- `index.ts` skips `connectDB()` and `app.listen()` when `NODE_ENV === 'test'`; each test file connects/disconnects Mongoose itself and clears collections in `beforeEach`.
- Jest runs with `maxWorkers: 1` and `forceExit: true` — tests share one DB connection and must run serially. Keep that in mind when adding tests.
- Cypress is configured (`cypress.config.ts`, baseUrl :5173) for e2e but specs may not yet exist.

## Production / deployment

In production (`NODE_ENV=production`) the Express server additionally serves the built client from `src/client/dist` and falls back to `index.html` for non-`/api` routes — the whole app deploys as one unit (Azure App Service). See `docs/DEPLOYMENT_OVERVIEW.md` and `docs/DEPLOYMENT_SETUP.md`. Required env vars: `NODE_ENV`, `MONGO_URI`, `JWT_SECRET`.

## Gotchas

- The root `package.json` lists `react-router` v5 in dependencies, but the client actually uses v7 (declared in `src/client/package.json`). Treat the client's manifest as authoritative for frontend deps.
- `tsc` (server build) only includes `src/server` and `src/types`; the client is built separately by Vite.
- The `@/*` → `src/*` path alias is configured for Jest only, not for the server runtime.
