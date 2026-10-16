# SECURITY.md — APP_KOOLA

Repo-level security rules. Imperative. Applies to `chat-backend`, `ChatApp` (mobile), `admin-web`.

## 1. Secret management

- Never hardcode secrets (API keys, JWT secrets, SMTP/Plivo creds, Firebase private key, TURN static secret) in source, tests, or docs.
- Read secrets from env only: `process.env.*` / `ConfigService.getOrThrow()`. Follow `.env.example` in `chat-backend/` as the canonical variable list (JWT, TURN_STATIC_SECRET, MinIO, Firebase, SMTP, Plivo, translation keys).
- Fail fast on missing secrets: use `getOrThrow` or throw at startup for production-critical values. Precedents: `jwt-shared.module.ts` (`getOrThrow('JWT_SECRET')`), `turn.service.ts` (throws if `TURN_STATIC_SECRET` empty outside test), `cors.ts` (throws if `FRONTEND_URL` missing in production).
- Never commit `.env*` files. They are gitignored at repo root (`.env`, `.env.*.local`, `.env.perf`). Commit only `.env.example` with placeholder values.
- `change-me-*` placeholders in `.env.example` must never be used in production.
- Do not log secrets. `LoggingInterceptor` has no redaction — never `console.log` tokens, passwords, OTPs, or full request bodies containing them. `AdminAuditService.redact()` strips `password|token|secret` keys before persisting audit payloads — extend that pattern, do not weaken it.

## 2. Auth rules

- `JwtAuthGuard` and `ThrottlerGuard` are global `APP_GUARD`s (`app.module.ts`). Every route is authenticated by default.
- Do not bypass guards. To open a route, add `@Public()` from `common/decorators/public.decorator.ts` AND write a one-line comment stating why (allowed reasons: auth handshake like login/OTP/refresh, health check, public catalog). No comment = reviewer must reject.
- Never mark any `/admin/*` route `@Public()`. Admin routes require `@UseGuards(JwtAuthGuard, AdminGuard)`.
- `AdminGuard` (`auth/guards/admin.guard.ts`) runs after JWT and re-reads `isPlatformAdmin` fresh from Mongo on every request. Never decide admin access from a token claim — a demoted admin must lose access immediately, not at token expiry.
- `JwtStrategy.validate()` re-reads the user from DB (`findById(payload.sub)`); unknown users get 401. Socket gateways (`WsAuthGuard`, webrtc gateway) verify JWT independently — socket auth never trusts the HTTP session.
- Refresh tokens are opaque, stored hashed in Mongo (`refresh-token.schema.ts`), rotated on use. Never accept a refresh token as an access token.

## 3. Token storage (clients)

- Mobile (`ChatApp`): access token lives in module memory only (`apiService.ts` — `setAccessTokenInMemory`). Only the refresh token persists via `asyncStorage`. Never persist the access token to AsyncStorage.
- `admin-web`: token sits in `localStorage` (`tokenStorage.ts`) — acceptable for an internal tool, but never store refresh tokens or other users' tokens there. Clear on logout.
- Send access token as `Authorization: Bearer` header (REST) or handshake `query.token` (socket). Never put tokens in URLs, query params of GET endpoints, or logs.

## 4. Input validation at boundaries

- Backend: global `ValidationPipe` (`main.ts`) with `whitelist: true, forbidNonWhitelisted: true, transform: true`. Every controller input must have a DTO with `class-validator` decorators. Never read raw `req.body` to skip validation.
- Mobile/web: validate untrusted external data (deep-link params, push payloads, API responses consumed as state) with zod before use. Malformed input redirects or shows an error — never crashes the screen.
- Sanitize regex-derived queries (`escape-regexp.ts`) — never interpolate raw user input into Mongo `$regex`.

## 5. CORS

- HTTP CORS allow-list comes from `FRONTEND_URL` (comma-separated), shared via `common/cors.ts`. Production boot fails without it.
- Socket.IO uses `socketCorsOrigin()`: non-browser clients (no/`null`/`file://` origin, i.e. React Native) are allowed; real browser `http(s)` origins must match the allow-list. Do not loosen this to `*` — socket auth is JWT, CORS is defense-in-depth for browsers.
- `credentials: true` is set — never add `origin: '*'` alongside it.

## 6. Rate limiting

- `ThrottlerModule` with Redis-backed storage (`RedisThrottlerStorage`) — quota is global across instances: 30 req/min (`short`), 200 req/min (`long`). Do not switch back to in-memory storage (it multiplies quota by instance count).
- Auth/OTP endpoints are brute-force targets: keep them under the `short` throttler and do not add `@SkipThrottle()` without documenting why. OTP codes must have short TTL and limited attempts server-side.

## 7. PII in admin

- Admin screens and audit logs must mask PII: phone numbers, emails, OTP codes, tokens. Follow the `AdminAuditService.redact()` precedent (`password|token|secret` → `[REDACTED]`); extend the key list when new sensitive fields appear.
- Never expose password hashes, refresh-token hashes, or Firebase/Plivo secrets through any admin endpoint or log line.
- Helmet defaults are on (`main.ts`); Swagger at `/api/docs` must not be exposed publicly in production.

## 8. Secret-leak response protocol

1. STOP. Do not continue the current task.
2. Rotate the exposed secret immediately (JWT secrets, TURN secret, MinIO keys, SMTP/Plivo, Firebase key, translation keys).
3. Purge the secret from git history if committed; treat any committed secret as compromised even after deletion.
4. Search the whole repo for the same pattern (`grep` the key name and value fragment) — fix every occurrence, not just the reported one.
5. Check audit logs / access logs for misuse during the exposure window.

## 9. Pre-commit checklist

- [ ] No secrets, tokens, OTPs, or private keys in the diff (`git diff` review).
- [ ] No new `@Public()` without a why-comment; no `@Public()` on `/admin/*`.
- [ ] No `console.log` of tokens, passwords, PII, or full request/response bodies.
- [ ] New controller inputs have DTOs with validators; new query patterns have Mongoose indexes.
- [ ] No `origin: '*'`, no disabled throttler, no weakened `redact()`.
- [ ] `.env` files untouched by the commit.
