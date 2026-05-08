# Phone OTP Registration — Breakdown

## Fog Points + Resolutions

| # | Fog Point | Resolution | Option Chosen |
|---|-----------|-----------|---------------|
| 1 | Registration method: email or phone? | Phone replaces email | A — Phone only |
| 2 | OTP channel | SMS | A — SMS |
| 3 | SMS provider | Plivo Verify (~$0.066/OTP VN) | A — Plivo |
| 4 | Registration flow | Enter info → Send OTP → Verify → Create account | B |
| 5 | Login method | Phone + Password | A |
| 6 | Country support | Vietnam only (+84) | A |
| 7 | OTP length | 6 digits | B |
| 8 | OTP TTL | 300 seconds (5 min) | C |
| 9 | OTP resend rate limit | Max 3 sends / phone / 10 min | A |
| 10 | Wrong OTP attempts | Max 5 attempts → must resend new OTP | B |
| 11 | Duplicate phone | Error immediately, do NOT send OTP | A |
| 12 | Phone validation | 9-10 digits after +84 | A |
| 13 | User schema strategy | Add phone field, keep email optional | B |
| 14 | Pending registration storage | Redis with TTL 300s | A |
| 15 | OTP screen UI states | Full: input→countdown→resend→loading→error→success | A |
| 16 | After verify success | Navigate to Login screen | B |
| 17 | Error handling | Inline error + retry button | A |

## Architecture Decisions (Locked)

- **User schema**: Add `phone` (unique, sparse index), keep `email` optional (sparse index)
- **JWT payload**: `{ sub: userId, phone: string }` — replaces `email` with `phone`
- **Pending registration**: Redis key `otp:pending:{phone}` → JSON `{phone, passwordHash, displayName}` TTL 300s
- **Rate limit**: Redis key `otp:rate:{phone}` → counter, TTL 600s (10 min)
- **Attempt tracking**: Redis key `otp:attempts:{phone}` → counter, TTL 300s
- **Plivo integration**: New `PlivoService` in auth module, backend-controlled OTP
- **Login**: `POST /api/auth/login` with `{phone, password}` instead of `{email, password}`
- **Register flow**: 2-step: `POST /api/auth/register/init` → `POST /api/auth/register/verify`

## Schema Changes

### User Schema (user.schema.ts)
```
+ phone: string (unique, sparse) — format: "+84XXXXXXXXX"
  email: string (unique → unique sparse, now optional)
  passwordHash: string
  displayName: string
  avatar: string
  isOnline: boolean
  lastSeen: Date
  fcmTokens: [...]
  settings: {...}
```

## Edge Cases Table

| Edge Case | Behavior |
|-----------|----------|
| Phone already registered | 409 "Số điện thoại đã được sử dụng" — no OTP sent |
| OTP expired (>300s) | 400 "Mã đã hết hạn" — allow resend |
| OTP wrong 5 times | 400 "Quá số lần thử" — must resend new OTP |
| Resend OTP >3 times in 10 min | 429 "Vui lòng đợi trước khi gửi lại" |
| Plivo API down/timeout | 503 "Không thể gửi mã. Thử lại." |
| Redis down during pending save | 500 — inline error + retry |
| User closes app mid-OTP | Pending data expires in 5 min, user restarts flow |
| Phone format invalid | 400 validation error before any API call |
| Verify with no pending registration | 400 "Không tìm thấy yêu cầu đăng ký" |
| Network error on frontend | Inline error + retry button |

## API Endpoints

### POST /api/auth/register/init
- Input: `{ phone: string, password: string, displayName: string }`
- Validate phone format (+84, 9-10 digits)
- Check phone not already in User collection
- Check rate limit (max 3 sends / 10 min)
- Hash password, save to Redis (TTL 300s)
- Call Plivo Verify to send OTP
- Response: `{ message: "OTP sent", expiresIn: 300 }`

### POST /api/auth/register/verify
- Input: `{ phone: string, otp: string }`
- Check attempt count (max 5)
- Verify OTP via Plivo Verify API
- Get pending registration from Redis
- Create User in MongoDB
- Cleanup Redis keys
- Response: `{ message: "Registration successful" }`

### POST /api/auth/login (modified)
- Input: `{ phone: string, password: string }` (was email)
- Find user by phone instead of email
- Response: `{ accessToken, refreshToken }`

## Files to Create

### Backend
- `chat-backend/src/auth/plivo.service.ts` — Plivo Verify API wrapper
- `chat-backend/src/auth/dto/register-init.dto.ts` — RegisterInitDto
- `chat-backend/src/auth/dto/verify-otp.dto.ts` — VerifyOtpDto

### Frontend (React Native)
- `ChatApp/src/screens/auth/OtpVerifyScreen.tsx` — OTP input screen

## Files to Modify

### Backend
- `chat-backend/src/users/user.schema.ts` — add phone field, email optional
- `chat-backend/src/auth/auth.service.ts` — new register flow, login by phone
- `chat-backend/src/auth/auth.controller.ts` — new endpoints
- `chat-backend/src/auth/auth.module.ts` — import RedisModule, PlivoService
- `chat-backend/src/auth/dto/login.dto.ts` — email → phone
- `chat-backend/src/auth/jwt.strategy.ts` — payload phone
- `chat-backend/src/users/users.service.ts` — searchUsers include phone

### Frontend (React Native)
- `ChatApp/src/screens/auth/RegisterScreen.tsx` — phone input, navigate to OTP
- `ChatApp/src/screens/auth/LoginScreen.tsx` — phone instead of email
- `ChatApp/src/contexts/AuthContext.tsx` — register flow 2-step
- `ChatApp/src/services/api/apiService.ts` — new auth API methods
- `ChatApp/src/navigation/types.ts` — OtpVerify route params
- `ChatApp/src/navigation/AuthNavigator.tsx` — add OtpVerify screen
- `ChatApp/src/types/index.ts` — update User type, add OTP types

## Dependencies
- `plivo` npm package (backend) — Plivo Node.js SDK
