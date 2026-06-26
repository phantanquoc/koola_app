## Why

Registration currently creates a user account immediately from `POST /auth/register` with no email verification — anyone can register with a fabricated email, and there is no way to recover a forgotten password. The backend already has a `nodemailer`-based `EmailService` plus OTP DTOs and a mobile `OtpVerifyScreen`, but none of it is wired up: the mobile app calls `/auth/register/init`, `/auth/register/verify`, and `/auth/register/resend-otp` endpoints that do not exist (404). This change connects and completes the email-OTP flow, adds password recovery, and closes the unverified-registration hole.

Phone registration is deferred: the carrier (Plivo SMS) integration is unreliable right now, so this change ships email-only auth while preserving the schema and JWT shape needed to add phone login later without rework.

## What Changes

- **BREAKING**: Remove `POST /auth/register` (direct, unverified account creation), `AuthService.register()`, and `RegisterDto`. Account creation now requires email OTP verification.
- Add two-step email registration: `POST /auth/register/init` (send 6-digit OTP to email, hold pending registration in Redis) and `POST /auth/register/verify` (validate OTP, create user, return token pair → auto-login). Add `POST /auth/register/resend-otp`.
- Remove the mandatory `phone` field from `RegisterInitDto` — registration is email + password (≥8) + display name only. The User schema keeps its optional `phone` field for future phone login.
- Add password recovery: `POST /auth/forgot-password` (always returns 200, no email enumeration), `POST /auth/reset-password/verify` (validate OTP → issue a short-lived random reset ticket), `POST /auth/reset-password` (consume ticket + set new password → revoke ALL refresh tokens for the user).
- Wire `EmailService` into the auth module providers.
- Mobile: route `OtpVerify`, `ForgotPassword`, `ResetPassword` into the unauthenticated navigation group; make `RegisterScreen` call the OTP init flow (password ≥8); fix `OtpVerifyScreen` to rely on auto-login; add a "Forgot password?" link on `LoginScreen`; add `ForgotPasswordScreen` and `ResetPasswordScreen`; add `forgotPassword`/`verifyResetOtp`/`resetPassword` to `AuthContext` and `apiService`.
- Rate-limit OTP sends (3 per email per 10 min) and verify attempts (5 per OTP) using Redis counters.

## Capabilities

### New Capabilities
- `email-otp-verification`: Email-based OTP issuance, verification, and rate limiting for both registration and password reset, including the password-reset ticket exchange and full-session revocation on password change.

### Modified Capabilities
- `user-auth`: Registration changes from phone+SMS-OTP to email+email-OTP (email + password + display name; auto-login on verify). Login is by email + password. The direct unverified `POST /auth/register` endpoint is removed.

## Impact

- **Backend** (`chat-backend/src/auth/`): `auth.controller.ts`, `auth.service.ts`, `auth.module.ts` (add `EmailService` provider), `dto/register-init.dto.ts` (drop `phone`), new DTOs (`forgot-password`, `reset-password-verify`, `reset-password`), remove `dto/register.dto.ts`, `auth.service.spec.ts`. `email.service.ts` is wired (no logic change). `refresh-token.schema.ts` used for revocation (no change).
- **Mobile** (`ChatApp/src/`): `navigation/types.ts`, `navigation/RootNavigator.tsx`, `navigation/AuthNavigator.tsx`, `screens/auth/{Login,Register,OtpVerify}Screen.tsx`, new `screens/auth/{ForgotPassword,ResetPassword}Screen.tsx`, `contexts/AuthContext.tsx`, `services/api/apiService.ts`.
- **Infra**: Reuses Redis (`RedisService`, `@Global`) for pending registration, rate-limit/attempt counters, and reset tickets. Requires `SMTP_*` env vars for `EmailService`. No schema migration — existing users still log in and recover passwords.
- **Out of scope**: phone/SMS registration & login, Plivo, User-schema changes, JWT payload structure changes, WebRTC/chat/moments, and the existing profile phone-change OTP (`phone-otp-verification` spec — untouched).
