## 1. Backend — Admin Authorization Layer

- [x] 1.1 Run GitNexus impact analysis on `User` schema and `auth.service.login` before editing; report blast radius
- [x] 1.2 Add `isPlatformAdmin: boolean` (default `false`) to `chat-backend/src/users/user.schema.ts`; add an index via `schema.index()` if useful for admin queries
- [x] 1.3 Create `chat-backend/src/auth/guards/admin.guard.ts`: an `AdminGuard` that resolves the human actor (`actorId = act ?? sub` from the validated request user), loads that user fresh from the DB, and allows only if `isPlatformAdmin === true`; otherwise throws 403
- [x] 1.4 Modify `auth.service.login` to reject a user whose `isBanned === true` with a clear 403 (guarded early-return, no token issuance) ← (verify: admin-context token allowed (personal & business-root-admin), non-admin 403, revoked-admin loses access immediately because guard re-reads DB, banned user blocked at login)

## 2. Backend — Admin Module & Endpoints

- [x] 2.1 Create `chat-backend/src/admin/` module: `admin.module.ts`, `admin.controller.ts`, `admin.service.ts`; apply `@UseGuards(JwtAuthGuard, AdminGuard)` at controller level; wire into `AppModule`; import Users/RefreshToken/Media providers as needed (no circular deps)
- [x] 2.2 Implement `GET /admin/me` returning the authenticated admin's safe identity (no `passwordHash`/`fcmTokens`)
- [x] 2.3 Implement `GET /admin/businesses/pending`: paginated `accountType='business'` AND `verificationStatus='pending'`; enrich each with `licenseImageUrl` via media `getDownloadUrl(licenseImageKey)` (null when no key, do not call media)
- [x] 2.4 Implement `POST /admin/businesses/:id/approve`: set `verificationStatus='verified'`, clear `rejectionReason`; 404 if not a business account
- [x] 2.5 Create `RejectBusinessDto` (class-validator: required `rejectionReason`, bounded length); implement `POST /admin/businesses/:id/reject`: set `verificationStatus='rejected'` + store reason; 400 on missing reason; 404 if not a business account
- [x] 2.6 Implement `GET /admin/users`: paginated; search `displayName`/`email`/`phone` (case-insensitive) + `accountType` filter; safe projection excluding `passwordHash`/`fcmTokens`
- [x] 2.7 Implement `GET /admin/users/:id`: safe projection; business accounts include `ownerUserId`/`verificationStatus`/`rejectionReason`; 404 if unknown
- [x] 2.8 Implement `POST /admin/users/:id/ban`: set `isBanned=true` AND revoke all that user's refresh tokens (reuse RefreshToken revoke mechanism)
- [x] 2.9 Implement `POST /admin/users/:id/unban`: set `isBanned=false`
- [x] 2.10 Implement `GET /admin/stats`: counts of users by `accountType`, businesses by `verificationStatus`, pending count, banned count; add Swagger annotations consistent with existing controllers ← (verify: every scenario in `specs/admin-business-verification` and `specs/admin-user-management` is satisfied; safe projections never leak `passwordHash`/`fcmTokens`; ban revokes refresh tokens and blocks login)

## 3. Backend — Tests

- [x] 3.1 Add `admin.guard.spec.ts`: admin allowed (personal), admin allowed (business-context whose root is admin), non-admin 403, revoked-admin 403 (DB re-read)
- [x] 3.2 Add `admin.service.spec.ts`: pending list (verified/rejected excluded, licenseImageUrl mapping incl. null), approve (clears reason, 404 non-business), reject (stores reason, 400 missing, 404 non-business), users list/search/filter + safe projection, user detail 404, ban (flag + token revoke), unban, stats counts
- [x] 3.3 Add a login ban-block test in the auth spec (banned user → 403, non-banned unaffected) ← (verify: all admin scenarios covered by passing tests; guard and login-block behavior proven)

## 4. Backend — Checks

- [x] 4.1 Run GitNexus `detect_changes`; confirm only expected symbols/flows affected
- [x] 4.2 `cd chat-backend && npm run lint && npm test` — resolve failures in owned scope; report (don't fix) pre-existing unowned failures ← (verify: lint/tests pass for admin module, guard, and auth login change)

## 5. Admin Web — Scaffold

- [x] 5.1 Scaffold `admin-web/` (top-level sibling of `ChatApp/`, `chat-backend/`): Vite + React + TypeScript project with its own `package.json`, `tsconfig.json`, ESLint config; add React Router and axios
- [x] 5.2 Add `.env.example` with `VITE_API_URL` (backend base URL); read it in the app config; do NOT commit any real `.env`
- [x] 5.3 Create the axios API client: attach Bearer token from client storage; on 401/403 clear token and redirect to Login ← (verify: `npm run build` and `npm run lint` succeed in admin-web; app does not import from ChatApp)

## 6. Admin Web — Auth & Route Guard

- [x] 6.1 Implement token storage (localStorage/sessionStorage) + auth state; logout clears it
- [x] 6.2 Implement Login page: `POST /auth/login` → store token → `GET /admin/me`; on 200 go to dashboard; on 403 show "không có quyền quản trị" and clear token; on invalid creds show error
- [x] 6.3 Implement a route guard wrapping protected pages: no token → redirect to Login; admin API 401/403 → clear token + redirect ← (verify: unauthenticated redirect works; non-admin login blocked with cleared token; expired/revoked auth redirects to Login)

## 7. Admin Web — Dashboard

- [x] 7.1 Implement Dashboard page consuming `GET /admin/stats`; render cards for users-by-accountType, businesses-by-verificationStatus, pending count, banned count ← (verify: dashboard renders all stat counts for an authenticated admin)

## 8. Admin Web — Business Verification

- [x] 8.1 Implement Businesses-pending page: table from `GET /admin/businesses/pending` with pagination
- [x] 8.2 Render the license image from each item's `licenseImageUrl` (show "no image" when null)
- [x] 8.3 Approve action → `POST /admin/businesses/:id/approve`; remove from list on success
- [x] 8.4 Reject action → reason modal (required) → `POST /admin/businesses/:id/reject`; remove from list on success ← (verify: approve/reject update the list; license image renders; reject requires a reason)

## 9. Admin Web — User Management

- [x] 9.1 Implement Users page: list from `GET /admin/users` with search input and `accountType` filter + pagination
- [x] 9.2 Implement User detail view from `GET /admin/users/:id` (business shows owner + verification info)
- [x] 9.3 Ban/Unban actions with a confirmation step → `POST /admin/users/:id/ban` | `/unban`; reflect state on success ← (verify: search/filter work; detail loads; ban/unban reflect state after confirm)

## 10. Docs

- [x] 10.1 Update `AGENTS.md`: admin-web commands (`npm install`, `npm run dev`, `npm run build`, `npm run lint`) and the "create first admin" DB command/script (e.g. `chat-backend/scripts/grant-admin.ts` + a `mongosh` one-liner)
- [x] 10.2 Create `chat-backend/scripts/grant-admin.ts` (idempotent: set `isPlatformAdmin=true` by email/phone/id); update root README if it coordinates the monorepo ← (verify: docs describe how to run admin-web and bootstrap the first admin; grant-admin script works)
