## 1. Backend — DTOs

- [x] 1.1 Edit `chat-backend/src/auth/dto/register-init.dto.ts`: remove the `phone` field and its `@Matches` validator; keep `email` (IsEmail), `password` (IsString, MinLength 8), `displayName` (IsString, IsNotEmpty)
- [x] 1.2 Confirm `dto/verify-otp.dto.ts` (`email` + `otp` Length 6) and `dto/resend-otp.dto.ts` (`email`) match the spec; adjust messages if needed
- [x] 1.3 Create `dto/forgot-password.dto.ts`: `ForgotPasswordDto` with `email` (IsEmail, IsNotEmpty)
- [x] 1.4 Create `dto/reset-password-verify.dto.ts`: `ResetPasswordVerifyDto` with `email` (IsEmail) + `otp` (IsString, Length 6)
- [x] 1.5 Create `dto/reset-password.dto.ts`: `ResetPasswordDto` with `resetToken` (IsString, IsNotEmpty) + `newPassword` (IsString, MinLength 8)
- [x] 1.6 Delete `dto/register.dto.ts` ← (verify: no remaining imports of RegisterDto anywhere in chat-backend/src)

## 2. Backend — Auth Service (registration OTP)

- [x] 2.1 Inject `RedisService` and `EmailService` into `AuthService` constructor
- [x] 2.2 Add private Redis key helpers + constants for reg namespace: `reg:pending:{email}` (TTL 300), `reg:rate:{email}` (TTL 600, max 3), `reg:attempts:{email}` (TTL 300, max 5); add SHA-256 OTP hash helper
- [x] 2.3 Implement `registerInit(dto)`: lowercase email → check User unique (409 "Email đã được sử dụng") → rate-limit via `incrementWithExpiry` (429) → `generateOtp()` → bcrypt-hash password (cost 12) → store `{emailLower, passwordHash, displayName, otpHash}` in Redis (TTL 300) → `emailService.sendOtp` → return `{message, expiresIn:300}`
- [x] 2.4 Implement `registerVerify(dto)`: load pending (400 if none) → attempts guard (400 "Quá số lần thử" / "Còn X lần thử") → compare otpHash → on success create User (lowercased email, passwordHash, displayName) → delete reg Redis keys → `generateTokenPair(user._id, user.email!)` and return token pair
- [x] 2.5 Implement `registerResendOtp(dto)`: require existing pending (400 if none) → rate-limit (429) → new OTP, update pending otpHash + refresh TTL → `sendOtp` → return `{message, expiresIn:300}`
- [x] 2.6 Remove `register(dto: RegisterDto)` method and its `RegisterDto` import ← (verify: registration creates a user ONLY via verify; no code path creates a user without OTP)

## 3. Backend — Auth Service (forgot/reset password)

- [x] 3.1 Add reset namespace key helpers + constants: `reset:pending:{email}` (TTL 300, `{userId, otpHash}`), `reset:rate:{email}` (TTL 600, max 3), `reset:attempts:{email}` (TTL 300, max 5), `reset:ticket:{token}` (TTL 600 → userId)
- [x] 3.2 Implement `forgotPassword(dto)`: lowercase email → lookup user → if user exists AND under rate limit: `generateOtp()`, store `{userId, otpHash}` in Redis (TTL 300), `sendOtp` → ALWAYS return 200 `{message:"Nếu email tồn tại, mã xác thực đã được gửi"}` regardless of existence
- [x] 3.3 Implement `resetPasswordVerify(dto)`: load reset pending (400 if none) → attempts guard (400 messages) → compare otpHash → on success `crypto.randomBytes(32).toString('hex')`, store `reset:ticket:{token} → userId` (TTL 600), delete reset OTP key → return `{resetToken}`
- [x] 3.4 Implement `resetPassword(dto)`: get-then-del `reset:ticket:{token}` (400 "Vé đặt lại không hợp lệ hoặc đã hết hạn" if missing) → bcrypt-hash newPassword (cost 12) → update user passwordHash → `refreshTokenModel.updateMany({userId},{revokedAt:new Date()})` → return `{message}` ← (verify: all refresh tokens revoked; a pre-reset refresh token is rejected with 401)

## 4. Backend — Controller + Module

- [x] 4.1 Add `EmailService` to `auth.module.ts` providers
- [x] 4.2 In `auth.controller.ts` add endpoints, each `@Public()` + `@UseGuards(ThrottlerGuard)` + Swagger decorators: `POST register/init` (201/200), `POST register/verify` (201, returns tokens), `POST register/resend-otp` (200)
- [x] 4.3 Add `POST forgot-password` (200), `POST reset-password/verify` (200, returns resetToken), `POST reset-password` (200) with DTOs + Swagger decorators
- [x] 4.4 Remove the `register` controller handler and `RegisterDto` import; keep `login`, `refresh`, `logout` unchanged ← (verify: `POST /auth/register` no longer routed; all new endpoints respond per spec status codes)

## 5. Backend — Tests

- [x] 5.1 Update `auth.service.spec.ts`: remove the old `register()` test; mock `RedisService` + `EmailService`
- [x] 5.2 Add happy-path tests: registerInit stores pending + sends OTP; registerVerify creates user + returns tokens; forgotPassword neutral response for existing vs non-existent email; reset verify → ticket → resetPassword revokes all refresh tokens ← (verify: `npm test` passes for auth specs)
- [x] 5.3 Run `npm run lint` and `npm test` in `chat-backend` ← (verify: lint clean, full suite green)

## 6. Mobile — API + Context

- [x] 6.1 In `services/api/apiService.ts` `authApi`: ensure `registerInit({email,password,displayName})`, `verifyOtp(email,otp)`, `resendOtp(email)` match backend (drop `phone` from registerInit body); add `forgotPassword(email)`, `verifyResetOtp(email,otp)→{resetToken}`, `resetPassword(resetToken,newPassword)`
- [x] 6.2 Remove the old `authApi.register()` and its `AuthContext.register()` after confirming no remaining callers (RegisterScreen will use registerInit) ← (verify: no references to authApi.register / context register remain)
- [x] 6.3 In `contexts/AuthContext.tsx`: keep `registerInit`/`verifyOtp` (auto-login already correct); add `forgotPassword`, `verifyResetOtp`, `resetPassword`; update the context type + provider value

## 7. Mobile — Navigation

- [x] 7.1 In `navigation/types.ts`: add `ForgotPassword: undefined`, `ResetPassword: { email: string }` (and `OtpVerify: { email: string }` if missing) to both `AuthStackParamList` and the unauthenticated portion of `RootStackParamList`
- [x] 7.2 In `navigation/RootNavigator.tsx`: register `OtpVerify`, `ForgotPassword`, `ResetPassword` screens inside the unauthenticated (`!isAuthenticated`) group
- [x] 7.3 Update `navigation/AuthNavigator.tsx` (dead code) for consistency with the new routes

## 8. Mobile — Screens

- [x] 8.1 `screens/auth/RegisterScreen.tsx`: change submit to call `registerInit({email,password,displayName})` then `navigation.navigate('OtpVerify',{email})`; raise client-side password validation to ≥ 8 chars
- [x] 8.2 `screens/auth/OtpVerifyScreen.tsx`: remove the success Alert + `navigation.navigate('Login')`; rely on `verifyOtp` auto-login (RootNavigator swaps to Main); keep countdown + attempts UI
- [x] 8.3 `screens/auth/LoginScreen.tsx`: add a "Quên mật khẩu?" link navigating to `ForgotPassword`
- [x] 8.4 Create `screens/auth/ForgotPasswordScreen.tsx`: email input → `forgotPassword(email)` → show neutral confirmation → navigate to reset OTP entry
- [x] 8.5 Create `screens/auth/ResetPasswordScreen.tsx`: OTP entry → `verifyResetOtp(email,otp)` → on resetToken, new password (≥8) + confirm → `resetPassword(resetToken,newPassword)` → navigate back to Login ← (verify: full reset flow reachable from Login; no auto-login after reset)
- [x] 8.6 Run `npm run lint` and `npx tsc --noEmit` in `ChatApp` ← (verify: lint clean, type-check passes, no unresolved references to removed register API)
