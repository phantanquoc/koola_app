## Context

The chat app's NestJS backend uses JWT (access + rotating refresh tokens), bcrypt password hashing, MongoDB for users, and a `@Global` `RedisService` for ephemeral state. An archived change (`2026-04-03-phone-otp-registration`) built a phone+SMS-OTP registration flow via Plivo, and the stale `user-auth` spec still describes phone-based auth — but the **current running code** registers and logs in by **email + password** with no verification.

Critically, prior work scaffolded an email-OTP flow that is **disconnected**:
- Backend `EmailService` (nodemailer) with `generateOtp()` / `sendOtp()` exists but is NOT a provider in `auth.module.ts`.
- DTOs `RegisterInitDto` (currently requires both phone +84 AND email), `VerifyOtpDto`, `ResendOtpDto` exist, but the controller has no `/auth/register/init`, `/verify`, or `/resend-otp` endpoints.
- Mobile `OtpVerifyScreen` is fully built but not registered in `RootNavigator`; `RegisterScreen` calls the direct `register()` (no OTP).
- There is no forgot/reset-password capability at all.

This design connects the flow, adds password recovery, and closes the unverified-registration hole. SMS/phone is deferred (carrier unreliable); the schema's optional `phone` field and the `{sub,email}` JWT payload are preserved so phone login can be added later without rework.

## Goals / Non-Goals

**Goals:**
- Email-only registration gated by a 6-digit email OTP; user created only on successful verify; auto-login on verify (return token pair).
- Password recovery via email OTP using a two-step ticket exchange.
- Close the bypass: remove `POST /auth/register`, `AuthService.register()`, `RegisterDto`.
- Enumeration-safe forgot-password; full session revocation on password change.
- Reuse existing Redis primitives and the archived OTP key/rate-limit pattern.
- Wire mobile screens/navigation/context/api to the completed flow.

**Non-Goals:**
- Phone/SMS registration or login, Plivo integration.
- Changing the User schema or JWT payload structure.
- Passwordless / magic-link login.
- Touching the profile phone-change OTP (`phone-otp-verification` capability) or WebRTC/chat/moments.

## Decisions

### 1. Self-generated OTP stored in Redis (not a third-party Verify API)
**Decision**: Use the existing `EmailService.generateOtp()` (6-digit) and store the OTP inside the Redis pending/reset record; verify by comparing in `AuthService`.
**Rationale**: There is no email "Verify API" equivalent to Plivo Verify; nodemailer only sends. Redis already backs the archived OTP pattern. Keeps verification logic in the service layer (CLAUDE.md layer separation).
**Alternative**: A dedicated email-verification SaaS — rejected as unnecessary dependency for a 6-digit code.

### 2. OTP hashing at rest
**Decision**: Store the OTP as a fast hash (SHA-256) inside the Redis record rather than plaintext; compare hashes on verify. Pending registration also stores the already-bcrypt-hashed password (never plaintext).
**Rationale**: Defense-in-depth — a Redis dump never exposes a live code or password. SHA-256 (not bcrypt) for the OTP is sufficient given the 5-minute TTL + 5-attempt cap and keeps verify cheap.
**Trade-off**: Slightly more code than plaintext compare; negligible cost.

### 3. Redis key namespaces and limits (reuse archived pattern)
**Decision**:
- Registration: `reg:pending:{emailLower}` (TTL 300s, JSON `{emailLower, passwordHash, displayName, otpHash}`), `reg:rate:{emailLower}` (TTL 600s, max 3), `reg:attempts:{emailLower}` (TTL 300s, max 5).
- Reset: `reset:pending:{emailLower}` (TTL 300s, JSON `{userId, otpHash}`), `reset:rate:{emailLower}` (TTL 600s, max 3), `reset:attempts:{emailLower}` (TTL 300s, max 5), `reset:ticket:{token}` (TTL 600s → userId).
**Rationale**: Mirrors the proven archived phone-OTP rate-limit scheme (`incrementWithExpiry` is atomic). Distinct namespaces prevent registration and reset from colliding. Email is lowercased before keying to match the schema's lowercase unique index.

### 4. Reset ticket is a random opaque token (two-step reset)
**Decision**: On reset-OTP verify, generate `crypto.randomBytes(32).toString('hex')`, store `reset:ticket:{token} → userId` (TTL 600s), delete the OTP. `reset-password` consumes the ticket atomically (get → del), sets the new password, then revokes all refresh tokens.
**Rationale**: Separates "proved control of email" from "set new password," so the OTP is short-lived and the password step can't be brute-forced by guessing OTPs. Opaque random token avoids encoding user data; single-use via delete-on-consume.
**Alternative**: Single-call reset (email+otp+newPassword) — simpler but couples the two concerns and keeps the OTP alive during password entry; rejected per decision 3B.

### 5. Full refresh-token revocation on password reset
**Decision**: After updating the password, `refreshTokenModel.updateMany({ userId }, { $set: { revokedAt: new Date() } })`.
**Rationale**: A password reset implies possible compromise — every existing session (including an attacker's) must die. Matches the existing reuse-detection revoke-all pattern in `AuthService.refreshToken()`.

### 6. Enumeration-safe forgot-password
**Decision**: `POST /auth/forgot-password` always returns 200 with "Nếu email tồn tại, mã xác thực đã được gửi". Existence check, rate-limit, OTP generation, and send happen internally only when the user exists.
**Rationale**: Prevents attackers from probing which emails are registered. Registration intentionally does the opposite (409 on duplicate) because that is standard signup UX and the email owner is the one acting.

### 7. Remove the direct register endpoint (root-cause fix)
**Decision**: Delete `POST /auth/register`, `AuthService.register()`, `RegisterDto`. Update `auth.service.spec.ts` to drop the register test and add init/verify happy-path coverage. Remove the now-unused `register()` from mobile `apiService`/`AuthContext` after confirming no other callers.
**Rationale**: Leaving it would let clients bypass email verification — the very hole this change closes. This is the only way to make verification mandatory.

### 8. Auto-login on register verify, manual login after reset
**Decision**: `register/verify` returns `{accessToken, refreshToken}` and the mobile `verifyOtp` sets tokens + `getMe()` (RootNavigator auto-swaps to Main). `reset-password` returns only 200; mobile navigates back to Login.
**Rationale**: The user just proved email control and chose their password during signup — auto-login is good UX. After a reset, requiring one manual login confirms the new password is remembered and is the safer default (decision 3B / Bảo mật-3).

### 9. Mobile wiring via RootNavigator (the live navigator)
**Decision**: Add `OtpVerify`, `ForgotPassword`, `ResetPassword` to the unauthenticated group of `RootNavigator.tsx` and to `RootStackParamList`. `AuthNavigator.tsx` is dead code but updated for consistency. `OtpVerifyScreen` drops its manual "please login" Alert + `navigate('Login')` since auto-login swaps the navigator.
**Rationale**: `RootNavigator` is what actually renders (verified). Keeping types and the dead navigator consistent avoids future confusion.

## Risks / Trade-offs

- **SMTP not configured in some environments** → `EmailService` already logs a warning and `sendOtp` throws `ServiceUnavailableException` (503). Tests must mock `EmailService`; CI without SMTP still passes.
- **Redis unavailable during init/verify** → pending data can't be stored/read; user sees an error and retries. Acceptable for ephemeral 5-minute registration state (same stance as archived design).
- **Email enumeration via timing** (forgot-password does more work when the email exists) → Low risk for this app's threat model; mitigated by the neutral response and rate limiting. Not hardening to constant-time in this change.
- **Removing `/auth/register` is BREAKING** for any external caller → Verified no in-repo caller outside the auth module and the mobile app; mobile is updated in the same change.
- **OTP stored hashed but password hashed too** → larger Redis record; negligible.

## Migration Plan

- No DB migration. Existing users (created via the old register) keep working for login and password reset.
- Deploy backend (new endpoints + removed `/auth/register`) and mobile together, since mobile currently calls non-existent endpoints (already broken) and the old `register` will be gone.
- Rollback: revert the change; the old direct-register behavior returns. No data shape changed, so rollback is clean.
- Ensure `SMTP_HOST/PORT/USER/PASS/FROM` env vars are set in deployed environments before enabling the flow.

## Open Questions

None — decisions 1C/2B/3B/4B and the three security defaults were confirmed with the user during exploration.
