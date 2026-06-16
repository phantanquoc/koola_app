## Why

The current user profile only stores `displayName`, `avatar`, and `email`, leaving the `Chỉnh sửa hồ sơ` screen visually empty (mostly blank space below two inputs) and giving users nothing meaningful to express identity in chat headers, contact cards, or future social surfaces. Email is also presented as a soft input even though it is immutable, which confuses users. Expanding the profile model and redesigning the edit flow into an iOS-style setting-row + bottom-sheet pattern brings the screen up to product quality and unblocks richer downstream UX (Moments, Connect, ProfileScreen).

## What Changes

- Extend `User` schema with five optional fields: `bio` (max 160), `username` (unique sparse, lowercase `^[a-z0-9_]{3,30}$`, max 30), `coverPhoto` (mediaKey, max 2048), `dateOfBirth` (Date), `gender` (`male|female|other|prefer_not`).
- Expose existing `phone` field through profile read/write surfaces and require OTP verification on change.
- Extend `UpdateProfileDto` with class-validator rules covering all new fields.
- Add backend endpoints:
  - `GET /users/check-username?u=<value>` — returns `{ available: boolean }` for live username uniqueness.
  - `POST /users/me/phone/request-otp` — sends OTP to a target phone via existing Plivo Verify service.
  - `POST /users/me/phone/verify-otp` — verifies OTP and writes phone onto current user.
  - `DELETE /users/me/phone` — removes phone from current user.
- Reuse `phone-otp-verification` infrastructure (Plivo Verify, Redis pending state, rate limits) for profile phone change.
- Mobile: redesign `EditProfileScreen` from single-form layout to setting-row layout with cover photo, avatar overlap, and three grouped sections (Thông tin cơ bản / Tài khoản / Cá nhân).
- Mobile: add 6 bottom-sheet edit components (DisplayName, Username, Bio, Phone, DateOfBirth, Gender) under `screens/main/components/edit-profile/`.
- Mobile: extend `User` type and `usersApi` with new fields and 4 new methods (`checkUsername`, `requestPhoneOtp`, `verifyPhoneOtp`, `removePhone`).
- Mobile: add dirty/confirm-exit guard on EditProfile and live username availability feedback (debounce 400ms).
- Email row stays read-only with a "Đã xác thực" badge and copy-to-clipboard action; existing privacy/about Alerts on the parent settings screen are untouched.
- No data migration script: all new fields are optional and default to empty/undefined; existing users continue to function.

## Capabilities

### New Capabilities

- `user-profile`: Authenticated user profile fields (display name, avatar, bio, username, cover photo, date of birth, gender) and the rules governing how they are read and updated through `/users/me*` endpoints.

### Modified Capabilities

- `phone-otp-verification`: Adds a "profile phone change" use case alongside registration — same OTP/Plivo/rate-limit rules, scoped to authenticated users updating their own phone.
- `user-auth`: `User` resource shape returned by login/refresh and `/users/me` now includes the new optional profile fields; phone becomes user-mutable post-registration via OTP.

## Impact

**Backend (`chat-backend/`):**
- `src/users/user.schema.ts` — new optional fields, additional indexes (`username` unique sparse).
- `src/users/dto/update-profile.dto.ts` — extended validators.
- `src/users/dto/verify-profile-phone.dto.ts` (new) — request/verify OTP DTOs.
- `src/users/users.controller.ts` — 4 new endpoints.
- `src/users/users.service.ts` — username uniqueness check, phone OTP flow integration.
- `src/users/users.module.ts` — import existing OTP/Plivo provider module.
- `src/users/__tests__/users.service.spec.ts` (new) or extension — coverage for username + phone change.

**Mobile (`ChatApp/`):**
- `src/types/index.ts` — extend `User` type.
- `src/services/api/apiService.ts` — 4 new `usersApi` methods.
- `src/screens/main/EditProfileScreen.tsx` — full redesign.
- `src/screens/main/components/edit-profile/` (new folder) — 6 sheet components.
- `src/contexts/AuthContext.tsx` — verify `refreshUser` propagates new fields (likely no change needed).
- Possible new dependency: `@react-native-community/datetimepicker` if not present.

**No impact:**
- E2E encryption messaging, avatar crop UI, profile visibility/privacy controls, email mutability, and `ProfileScreen.tsx` (other-user view) are explicitly out of scope.
