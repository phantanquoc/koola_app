## Why

The current registration system only supports email + password. Users in Vietnam prefer registering with phone numbers (similar to Zalo, Grab). Adding phone-based registration with SMS OTP verification provides identity verification and aligns with local user expectations. This also enables future features like phone-based contact discovery.

## What Changes

- **BREAKING**: Registration endpoint changes from single-step (`POST /auth/register`) to two-step (`POST /auth/register/init` + `POST /auth/register/verify`)
- **BREAKING**: Login endpoint changes from `{email, password}` to `{phone, password}`
- **BREAKING**: JWT payload changes from `{sub, email}` to `{sub, phone}`
- Add `phone` field to User schema (unique, sparse index)
- Make `email` field optional in User schema (sparse index)
- Integrate Plivo Verify API for SMS OTP delivery
- Add OTP verification screen in React Native app
- Add pending registration storage in Redis (TTL 300s)
- Add rate limiting for OTP sends (max 3/phone/10min)
- Add attempt limiting for OTP verification (max 5 attempts)
- Country support: Vietnam only (+84), phone format validation (9-10 digits after +84)

## Capabilities

### New Capabilities
- `phone-otp-verification`: Phone number OTP verification via Plivo Verify SMS — covers OTP send, verify, rate limiting, attempt tracking, and pending registration management

### Modified Capabilities
- `user-auth`: Registration changes from email-based to phone-based with OTP verification. Login changes from email+password to phone+password. JWT payload includes phone instead of email.

## Impact

- **Backend (NestJS)**:
  - `auth` module: new service (PlivoService), modified controller/service/DTOs, new endpoints
  - `users` module: schema change (add phone, email optional), service update (search by phone)
  - `auth/jwt.strategy.ts`: payload change (email → phone)
  - New dependency: `plivo` npm package
  - Redis: new key patterns for pending registration, rate limiting, attempt tracking
- **Frontend (React Native)**:
  - New screen: `OtpVerifyScreen.tsx`
  - Modified screens: `RegisterScreen.tsx`, `LoginScreen.tsx`
  - Modified: `AuthContext.tsx`, `apiService.ts`, navigation types
- **Infrastructure**: No changes (Redis already in docker-compose)
- **Environment**: New env vars: `PLIVO_AUTH_ID`, `PLIVO_AUTH_TOKEN`, `PLIVO_VERIFY_SERVICE_ID`
