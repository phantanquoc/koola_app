## Context

The chat app currently supports email+password registration and login. The NestJS backend uses JWT (access+refresh tokens), bcrypt password hashing, and MongoDB for user storage. Redis is already available globally via `RedisService` (`@Global()` module). The React Native frontend has `AuthContext`, `RegisterScreen`, `LoginScreen`, and API service layer.

This change replaces email-based auth with phone-based auth (+84 Vietnam) and adds SMS OTP verification via Plivo Verify API during registration.

## Goals / Non-Goals

**Goals:**
- Replace email registration with phone number (+84) registration
- Add OTP verification step during registration via Plivo Verify SMS
- Modify login to use phone+password instead of email+password
- Keep email field optional in User schema for future flexibility
- Use Redis for temporary pending registration data (TTL 300s)
- Rate limit OTP sends (3/phone/10min) and verify attempts (5/OTP)

**Non-Goals:**
- Multi-country phone support (only +84 Vietnam)
- OTP-based login (passwordless) — login remains phone+password
- Email OTP verification
- Phone number change/update after registration
- Two-factor authentication (2FA) for existing accounts

## Decisions

### 1. Two-step registration API
**Decision**: Split registration into `POST /auth/register/init` and `POST /auth/register/verify`
**Rationale**: Separating init (collect data + send OTP) from verify (confirm OTP + create user) keeps each endpoint focused. The alternative — single endpoint that returns a session token — adds complexity with no benefit.

### 2. Plivo Verify API for OTP management
**Decision**: Use Plivo Verify API which handles OTP generation, delivery, and verification server-side.
**Rationale**: Plivo Verify manages code generation, SMS delivery, and code checking. We do NOT generate OTP codes ourselves — Plivo does. We only call `create verification` (send) and `check verification` (verify). This reduces our code and eliminates OTP storage concerns. Cost: ~$0.066/OTP for Vietnam.
**Alternative considered**: Twilio Verify (~$0.236/OTP) — better docs but 3.5x more expensive. AWS SNS (DIY OTP) — cheapest but requires building full OTP logic.

### 3. Redis for pending registration data
**Decision**: Store `{phone, passwordHash, displayName}` in Redis with key `otp:pending:{phone}` and TTL 300s.
**Rationale**: Pending data is ephemeral (5 min max). Redis TTL auto-cleans expired registrations. If Redis restarts, user simply retries — acceptable for registration flow. MongoDB `pending_registrations` collection would be more durable but overkill for 5-minute ephemeral data.

### 4. Rate limiting with Redis counters
**Decision**: Use Redis INCR + EXPIRE for rate limiting OTP sends (key: `otp:rate:{phone}`, TTL 600s, max 3) and verify attempts (key: `otp:attempts:{phone}`, TTL 300s, max 5).
**Rationale**: Simple, atomic Redis operations. No additional dependencies. Consistent with existing Redis usage patterns in the project (e.g., call sessions, notification dedup).

### 5. User schema: add phone, keep email optional
**Decision**: Add `phone` field (unique, sparse index). Change `email` from required to optional (sparse index).
**Rationale**: Backward compatible — existing users with email still work. Enables future multi-method auth. Sparse indexes allow multiple null values while enforcing uniqueness on non-null values.

### 6. JWT payload: phone replaces email
**Decision**: JWT payload becomes `{ sub: userId, phone: string }`.
**Rationale**: Phone is the primary identifier now. The `JwtStrategy.validate()` method only uses `sub` (userId) to look up the user, so the payload field name change has minimal impact on downstream code.

### 7. Phone validation: simple length check
**Decision**: Validate phone as `+84` prefix + 9-10 digits. No carrier prefix validation.
**Rationale**: Vietnamese mobile numbers are 9-10 digits after country code. Carrier prefixes change over time (MNP — mobile number portability). Simple length check is sufficient; Plivo will reject truly invalid numbers at SMS delivery.

## Risks / Trade-offs

- **[Plivo outage]** → SMS cannot be sent → User cannot register. Mitigation: inline error + retry button. No fallback channel (email OTP is out of scope).
- **[Redis restart]** → Pending registrations lost. Mitigation: TTL is only 5 min, user retries. Acceptable for MVP.
- **[SMS delivery delay]** → OTP may arrive after 300s timeout. Mitigation: 300s is generous. Plivo typical delivery <10s for Vietnam.
- **[Breaking changes]** → Existing email-only users cannot login with phone. Mitigation: This is a fresh app (no production users yet). If deployed, would need migration to add phone numbers to existing accounts.
- **[Vietnam SMS regulations]** → Sender ID registration required since Aug 2025. Mitigation: Must register with Plivo before production deployment. OK for development/testing with Plivo sandbox.
- **[Cost]** → ~$0.066/registration × 1000/month = ~$86/month. Acceptable.
