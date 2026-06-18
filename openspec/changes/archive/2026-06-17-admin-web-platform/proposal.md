## Why

The `business-account-switching` change introduced business accounts that are created in `verificationStatus: 'pending'` and an `isBanned` flag — but nothing in the system can transition a business to `verified`/`rejected` or ban an abusive account, because APP_KOOLA has no platform-administration capability at all (no roles, no admin guard, no admin surface). Verified businesses cannot appear in the Kết nối discovery surface until a human approves them. This change adds a proper, separate admin web application plus the backend authorization layer to manage users and businesses cleanly from day one.

## What Changes

- Add `isPlatformAdmin: boolean` (default `false`) to the `User` model — the single source of platform-admin authority.
- Add a NestJS `AdminGuard` that authorizes a request only when the resolved **human actor** (root user behind any business-switched session) has `isPlatformAdmin === true`. It composes with the existing global JWT auth and protects every route under `/admin/*`.
- Admins authenticate through the EXISTING `/auth/login`; there is no separate admin login and no admin self-registration. The first admin is created by setting `isPlatformAdmin` directly in the database (documented command/script).
- New `/admin` endpoints (JWT + AdminGuard, DTO-validated):
  - `GET /admin/me` — returns the admin's identity (used by the web app to detect admin authorization; non-admins get 403).
  - `GET /admin/businesses/pending` — paginated pending business accounts, each enriched with a temporary download URL for `licenseImageKey`.
  - `POST /admin/businesses/:id/approve` — set `verificationStatus: 'verified'`, clear `rejectionReason`.
  - `POST /admin/businesses/:id/reject` — set `verificationStatus: 'rejected'` with a required `rejectionReason`.
  - `GET /admin/users` — paginated list/search (by displayName/email/phone) + `accountType` filter, safe projection.
  - `GET /admin/users/:id` — user detail (safe projection; business includes owner + verification info).
  - `POST /admin/users/:id/ban` — set `isBanned: true` and revoke the user's refresh tokens.
  - `POST /admin/users/:id/unban` — set `isBanned: false`.
  - `GET /admin/stats` — dashboard counts (users by accountType, businesses by verificationStatus, pending count, banned count).
- **BREAKING (behavioral)**: `/auth/login` now rejects a user whose `isBanned === true`.
- New top-level `admin-web/` application — React + Vite + TypeScript (NOT Next.js). Screens: Login, Dashboard (stats), Businesses-pending (view license image + approve / reject-with-reason), Users (list/search/filter → detail → ban/unban). Axios with Bearer token, client-side token storage, client-side route guard via `GET /admin/me`.
- Docs: AGENTS.md updated with admin-web commands and the first-admin bootstrap command; an env example for the admin-web API base URL.

## Capabilities

### New Capabilities
- `admin-authorization`: `isPlatformAdmin` field, the `AdminGuard` (actor/human-based authorization composed with JWT), the `/admin/*` protection model, and the first-admin bootstrap rule.
- `admin-business-verification`: Listing pending business accounts with license-image viewing, and the approve / reject (with reason) transitions of `verificationStatus`.
- `admin-user-management`: User list/detail/search with safe projection, ban/unban (with refresh-token revocation), and dashboard statistics.
- `admin-web-app`: The standalone Vite + React + TypeScript admin UI (login, route guard, dashboard, business verification, user management).

### Modified Capabilities
- `user-auth`: Adds the `isPlatformAdmin` field to the user model and makes `/auth/login` reject banned users.

## Impact

**Backend (`chat-backend/`):**
- `src/users/user.schema.ts` — add `isPlatformAdmin` (+ optional index).
- `src/auth/auth.service.ts` — login rejects banned users.
- `src/auth/guards/admin.guard.ts` (new) — actor-based admin authorization.
- New `src/admin/` module — controller + service + DTOs + `*.spec.ts` for all `/admin/*` endpoints.
- Reuse: `RefreshToken` revoke mechanism (ban), media `getDownloadUrl` (license image), users + accounts data.

**New app (`admin-web/`):**
- Vite + React + TS project: pages (Login, Dashboard, BusinessesPending, Users, UserDetail), an axios API client with Bearer token + 401 handling, a route guard, and minimal lint/build config.

**Docs:**
- `AGENTS.md` — admin-web commands + first-admin bootstrap.
- Env example for admin-web API base URL. No `.env`/secret changes.

**Connection seam:** Reads `verificationStatus='pending'` and transitions to `verified`/`rejected`; toggles `isBanned` (Change 1 already blocks switching into banned accounts; this change adds the login block).
