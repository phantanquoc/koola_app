## 1. User Schema Changes

- [x] 1.1 Add `phone` field to User schema (`user.schema.ts`): `@Prop({ unique: true, sparse: true })`, format `+84XXXXXXXXX`
- [x] 1.2 Change `email` field from `required: true, unique: true` to `required: false, unique: true, sparse: true`
- [x] 1.3 Add index on `phone` field: `UserSchema.index({ phone: 1 }, { unique: true, sparse: true })`
- [x] 1.4 Update `types/index.ts` (frontend): add `phone` to `User` interface, make `email` optional ← (verify: schema matches design.md, both backend and frontend types aligned)

## 2. Plivo Service

- [x] 2.1 Install `plivo` npm package in `chat-backend`
- [x] 2.2 Create `auth/plivo.service.ts`: Injectable service wrapping Plivo Verify API with `sendOtp(phone)` and `verifyOtp(phone, code)` methods
- [x] 2.3 Add env vars `PLIVO_AUTH_ID`, `PLIVO_AUTH_TOKEN`, `PLIVO_VERIFY_SERVICE_ID` to service config ← (verify: Plivo service instantiates correctly, methods call Plivo Verify API)

## 3. Registration DTOs

- [x] 3.1 Create `auth/dto/register-init.dto.ts`: `RegisterInitDto` with phone (Matches +84 regex, 9-10 digits), password (MinLength 8), displayName (IsNotEmpty)
- [x] 3.2 Create `auth/dto/verify-otp.dto.ts`: `VerifyOtpDto` with phone (Matches +84 regex) and otp (IsString, Length 6)
- [x] 3.3 Update `auth/dto/login.dto.ts`: replace `email` field with `phone` field (Matches +84 regex) ← (verify: all DTOs validate correctly with class-validator)

## 4. Auth Service — Registration Flow

- [x] 4.1 Add `registerInit(dto: RegisterInitDto)` method: check phone unique → check rate limit → hash password → save to Redis → call Plivo sendOtp
- [x] 4.2 Add `verifyOtp(dto: VerifyOtpDto)` method: check attempts → call Plivo verifyOtp → get pending from Redis → create User → cleanup Redis
- [x] 4.3 Add Redis key helpers: `otp:pending:{phone}` (TTL 300s), `otp:rate:{phone}` (TTL 600s, max 3), `otp:attempts:{phone}` (TTL 300s, max 5)
- [x] 4.4 Update `login()` method: find user by `phone` instead of `email`
- [x] 4.5 Update `generateTokenPair()`: JWT payload `{ sub: userId, phone }` instead of `{ sub: userId, email }` ← (verify: full registration flow init→verify works, login by phone works, JWT contains phone)

## 5. Auth Controller — New Endpoints

- [x] 5.1 Add `POST /auth/register/init` endpoint: `@Public()`, `@UseGuards(ThrottlerGuard)`, calls `authService.registerInit()`
- [x] 5.2 Add `POST /auth/register/verify` endpoint: `@Public()`, `@UseGuards(ThrottlerGuard)`, calls `authService.verifyOtp()`
- [x] 5.3 Update or remove old `POST /auth/register` endpoint
- [x] 5.4 Update Swagger decorators for new endpoints ← (verify: all endpoints accessible, correct HTTP status codes, Swagger docs updated)

## 6. Auth Module + JWT Strategy Updates

- [x] 6.1 Update `auth.module.ts`: add `PlivoService` to providers, ensure `RedisModule` is available (already @Global)
- [x] 6.2 Update `jwt.strategy.ts`: change `JwtPayload` interface to `{ sub: string; phone: string }`, update `validate()` return type ← (verify: JWT validation works with new payload, existing token refresh still works)

## 7. Users Service Updates

- [x] 7.1 Update `searchUsers()` in `users.service.ts`: search by phone in addition to displayName (replace email search)
- [x] 7.2 Update any `populate()` calls that select `email` to also select `phone` ← (verify: user search works with phone, populated user data includes phone)

## 8. Frontend — API Service

- [x] 8.1 Update `authApi.login()` in `apiService.ts`: send `{ phone, password }` instead of `{ email, password }`
- [x] 8.2 Add `authApi.registerInit(phone, password, displayName)`: POST to `/auth/register/init`
- [x] 8.3 Add `authApi.registerVerify(phone, otp)`: POST to `/auth/register/verify`
- [x] 8.4 Remove or update old `authApi.register()` method ← (verify: all API methods typed correctly, endpoints match backend)

## 9. Frontend — Auth Context

- [x] 9.1 Update `login()` in `AuthContext.tsx`: accept `phone` instead of `email`
- [x] 9.2 Update `register()` to `registerInit()`: calls `authApi.registerInit()`, returns result (no auto-login)
- [x] 9.3 Add `verifyOtp()` method: calls `authApi.registerVerify()`, on success navigates to Login ← (verify: AuthContext exposes correct methods, register flow does NOT auto-login)

## 10. Frontend — Navigation

- [x] 10.1 Update `AuthStackParamList` in `navigation/types.ts`: add `OtpVerify: { phone: string }`
- [x] 10.2 Add `OtpVerifyScreen` to `AuthNavigator.tsx` ← (verify: navigation types correct, OtpVerify screen registered in navigator)

## 11. Frontend — Screens

- [x] 11.1 Update `RegisterScreen.tsx`: replace email input with phone input (+84 prefix), on submit call `registerInit()` then navigate to OtpVerify
- [x] 11.2 Create `OtpVerifyScreen.tsx`: 6-digit OTP input, countdown timer (300s), resend button (after countdown), loading/error/success states, max 5 attempts tracking
- [x] 11.3 Update `LoginScreen.tsx`: replace email input with phone input (+84 prefix), call login with phone ← (verify: full UI flow works — register screen → OTP screen → countdown → verify → navigate to Login → login with phone)

## 12. TypeScript Check

- [x] 12.1 Run `npx tsc --noEmit` in `chat-backend` and fix any type errors ← (verify: zero TypeScript errors in both backend and frontend)
