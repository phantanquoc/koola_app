## Context

APP_KOOLA has no platform-administration capability: no role field, no admin guard, no admin UI. The `business-account-switching` change (archived) added `verificationStatus` (default `pending`) and `isBanned` to the `User` model, but nothing transitions them. The Kết nối discovery surface only shows `verified` businesses, so without an approval path no business is ever discoverable.

Auth is JWT-based: `JwtAuthGuard` is global with `@Public()` on auth routes; `JwtStrategy.validate` returns `{ id, userId, email, actorId, accountType }` where `actorId = act ?? sub` (the human behind a business-switched session). The `RefreshToken` schema supports revocation. Media exposes a presigned `getDownloadUrl(mediaKey)`.

This change adds the authorization layer and a standalone admin web app, keeping admin powers entirely off the end-user mobile app.

## Goals / Non-Goals

**Goals:**
- A single, airtight source of admin authority (`isPlatformAdmin`) enforced by an `AdminGuard` on all `/admin/*` routes.
- Admin authority follows the human actor, never a business identity.
- Approve/reject business verification with license-image review; ban/unban with refresh-token revocation and a login block; dashboard stats.
- A self-contained `admin-web/` (Vite + React + TS) that never entangles with the RN build.
- Safe field projections (never leak `passwordHash`, `fcmTokens`, refresh tokens).

**Non-Goals:**
- Multi-level admin roles / granular permissions / audit log (scope C — future).
- Admin self-registration or a separate admin credential store.
- Changing the mobile app (no admin surface in ChatApp).
- SSR/SEO (hence Vite, not Next.js).
- Re-implementing business creation or the switch flow (owned by Change 1).

## Decisions

### D1: Admin-web stack & directory layout
**Decision:** New top-level `admin-web/` sibling of `ChatApp/` and `chat-backend/`. React + Vite + TypeScript, React Router for routing, axios for API. Its own `package.json`, `tsconfig.json`, ESLint config; no shared build with ChatApp.
**Why:** Internal admin tool needs no SSR/SEO; Vite is the simplest fast SPA toolchain and the team already knows React. Physical separation keeps admin code out of the user-facing bundle (security + clarity).
**Alternative considered:** Embed admin screens in ChatApp behind a flag — rejected: ships admin code to every user device, widens attack surface, conflates concerns.

### D2: AdminGuard authorizes the human actor, composed with JWT
**Decision:** `AdminGuard` runs after JWT auth and reads the request user's `actorId` (the human/root behind any business session), loads that user, and allows only if `isPlatformAdmin === true`. Admin endpoints therefore operate in personal/human context; a business-switched token still resolves admin authority via its `act` (root) claim, but admin actions are attributed to the human.
**Why:** Admin power must belong to a person, not to a business identity they switched into. Using `actorId` means an admin can be in any session and still be recognized, while a non-admin business identity can never gain admin powers.
**Alternative considered:** Require a strictly personal-context token (reject any token with `act`). Rejected as more brittle (forces a switch-back dance); actor-based check is both safe and ergonomic. The guard MUST load the user fresh (not trust a stale token claim) so a revoked admin loses access immediately.
**Airtightness:** Apply `@UseGuards(JwtAuthGuard, AdminGuard)` (or a controller-level guard) on the admin controller; never expose any `/admin/*` route as `@Public()`. A missing/invalid token fails at JWT; a valid non-admin fails at AdminGuard with 403.

### D3: First-admin bootstrap
**Decision:** No admin self-registration. The first admin is created by setting `isPlatformAdmin: true` directly in MongoDB on an existing user. Provide a documented one-off script (`chat-backend/scripts/grant-admin.ts` taking an email/phone/id) and a `mongosh` one-liner in AGENTS.md.
**Why:** Eliminates any privilege-escalation endpoint. Bootstrapping out-of-band is the standard safe pattern.

### D4: Ban = set flag + revoke refresh tokens + block login
**Decision:** `POST /admin/users/:id/ban` sets `isBanned: true` AND revokes all of that user's refresh tokens (reusing the existing `RefreshToken` revoke mechanism). `auth.service.login` is modified to reject a user with `isBanned === true` (e.g. 403 with a clear message). Change 1 already rejects switching into a banned account.
**Why:** Setting the flag alone leaves an active access/refresh token usable until expiry. Revoking refresh tokens stops session renewal; the login block stops re-entry; the switch block (Change 1) stops indirect entry. Together they fully cut off access at the next token boundary.
**Trade-off:** A live access token (short-lived) remains valid until it expires — acceptable given short access-token TTL; documented. Unban clears the flag; the user must log in again (tokens already revoked).

### D5: License-image viewing via presigned URL
**Decision:** `GET /admin/businesses/pending` enriches each item with a temporary download URL produced by the media service's `getDownloadUrl(licenseImageKey)`. The admin web renders the image from that URL.
**Why:** Reuses the existing secure presigned-URL flow; no new media exposure, no proxying through the backend.
**Edge:** If `licenseImageKey` is missing/empty, return `licenseImageUrl: null` (do not call media); the UI shows "no image".

### D6: Pagination, search, safe projection
**Decision:** List endpoints use cursor or page/limit pagination consistent with existing list endpoints in the codebase (follow the prevailing pattern; default page size e.g. 20). `GET /admin/users` searches `displayName`/`email`/`phone` (case-insensitive) and filters by `accountType`. All user-returning endpoints use an explicit safe projection that EXCLUDES `passwordHash`, `fcmTokens`, and never joins refresh tokens.
**Why:** Predictable performance and zero sensitive-field leakage. Service-layer projection is the single chokepoint.

### D7: Admin-web auth & route guard
**Decision:** Login posts to `/auth/login`, stores the access (and refresh) token client-side, then calls `GET /admin/me`; a 200 confirms admin and routes to the dashboard, a 403 shows "không có quyền quản trị" and clears the token. A route guard wraps protected pages: no token → redirect to login; on any admin call returning 403/401 → clear token and redirect to login. The axios client attaches the Bearer token and handles 401 by redirecting to login (admin-web does not implement the mobile switch ladder — it is always personal/human context).
**Why:** `GET /admin/me` is the authoritative admin check (server-side), avoiding trusting any client-decoded claim. Simple, correct guard.
**Token storage:** Use `localStorage`/`sessionStorage` for the admin SPA (documented trade-off: internal tool; mitigate with short token TTL and logout). This differs from the mobile rule (in-memory only) because there is no RN secure-storage equivalent here; called out explicitly.

### D8: Env / config
**Decision:** Admin-web reads the backend base URL from a Vite env var (e.g. `VITE_API_URL`) with a committed `.env.example` (no secrets). No changes to backend `.env`. AGENTS.md documents `npm install` / `npm run dev` / `npm run build` / `npm run lint` for `admin-web/` and the first-admin command.

## Risks / Trade-offs

- **AdminGuard bypass risk** → Mitigation: never mark any `/admin/*` route `@Public()`; guard at the controller level; AdminGuard loads the user fresh from DB by `actorId` and checks the flag (revoked admin loses access immediately, not at token expiry).
- **Sensitive field leakage in admin lists** → Mitigation: explicit safe projection at the service layer; a test asserts `passwordHash`/`fcmTokens` are absent from responses.
- **Banned user retains a live access token until TTL** → Mitigation: revoke refresh tokens on ban + block login + (Change 1) block switch; short access-token TTL bounds the window. Documented.
- **Admin-web token in localStorage (XSS exposure)** → Mitigation: internal-only tool, short token TTL, explicit logout, no third-party scripts; documented as a conscious trade-off vs. the mobile in-memory rule.
- **Editing existing high-touch symbols (`auth.service.login`, `User` schema)** → Mitigation: additive edits, run GitNexus impact analysis before editing, `detect_changes` before done; the login ban-check is a single guarded early-return.
- **Actor resolution wrong (business token granted admin)** → Mitigation: AdminGuard checks the human (`actorId`) user's flag, never the business `sub`; a test covers a business-context token whose root is an admin (allowed) and whose root is not (403).

## Migration Plan

1. Backend additive: add `isPlatformAdmin` to `User` (default false) + optional index. Backward-compatible (existing users default false).
2. Add `AdminGuard`; add the login ban-block in `auth.service` (guarded early-return).
3. Build the `admin` module (controller/service/DTOs) + endpoints, reusing RefreshToken revoke and media getDownloadUrl.
4. Backend tests: `admin.service.spec.ts` + AdminGuard test (admin pass / non-admin 403 / business-root-admin pass / banned-login block).
5. Scaffold `admin-web/` (Vite React TS), API client, route guard, pages.
6. Docs: AGENTS.md (commands + first-admin), `.env.example`.
7. Checks: backend `npm run lint` + `npm test`; admin-web `npm run build` + `npm run lint`.
**Rollback:** All backend changes are additive except the login ban-check (a guarded early-return that is a no-op when no user is banned). `admin-web/` is a separate app; not deploying it is a complete rollback of the UI.

## Open Questions

- None blocking. First-admin bootstrap is intentionally manual (D3). Multi-level roles/audit log are explicitly deferred (Non-Goals).
