## 1. Backend — Schema and DTOs

- [x] 1.1 Extend `chat-backend/src/users/user.schema.ts` with optional fields: `bio`, `username`, `coverPhoto`, `dateOfBirth`, `gender`
- [x] 1.2 Add `username` unique sparse index, lowercase storage; keep `phone` unique sparse index intact
- [x] 1.3 Update `chat-backend/src/users/dto/update-profile.dto.ts` with `IsOptional`, `MaxLength`, `Matches`, `IsIn`, `IsISO8601` validators for all new fields and confirm existing `displayName` / `avatar` rules unchanged
- [x] 1.4 Create `chat-backend/src/users/dto/verify-profile-phone.dto.ts` with `RequestProfilePhoneOtpDto` (phone +84 regex) and `VerifyProfilePhoneOtpDto` (phone + 6-digit code)
- [x] 1.5 Add reserved-username constants list (`me`, `admin`, `support`, `system`, `koola`, `null`, `undefined`) accessible from service ← (verify: schema fields persist round-trip via `GET /users/me`, indexes created cleanly, validators reject all invalid scenarios in spec)

## 2. Backend — Service Layer

- [x] 2.1 Extend `users.service.updateProfile` to handle all new fields with lowercase coercion for `username` and date range validation for `dateOfBirth` (1900-01-01 ≤ date ≤ today UTC)
- [x] 2.2 Implement `users.service.checkUsernameAvailability(callerId, username)` returning `{ available, reason? }` with reason values `taken | invalid | reserved`; treat caller's own username as available
- [x] 2.3 Implement `users.service.requestPhoneChangeOtp(userId, phone)` reusing the existing OTP/Plivo provider used by registration, with Redis key namespace `phone-change:<userId>:<phone>` and TTL 300s
- [x] 2.4 Implement `users.service.verifyPhoneChangeOtp(userId, phone, code)` checking pending state, applying attempt limit (5), updating `phone` on success, and clearing Redis state
- [x] 2.5 Implement `users.service.removePhone(userId)` clearing the phone field idempotently
- [x] 2.6 Ensure cross-user phone uniqueness check runs before sending OTP and returns 409 when a different user holds the phone ← (verify: every scenario in `specs/phone-otp-verification/spec.md` reproduces against the service in unit tests, including rate-limit and attempt-limit paths)

## 3. Backend — Controller and Module

- [x] 3.1 Add 4 new endpoints in `users.controller.ts`: `GET /users/check-username`, `POST /users/me/phone/request-otp`, `POST /users/me/phone/verify-otp`, `DELETE /users/me/phone`
- [x] 3.2 Confirm `GET /users/check-username` route is registered before `GET /users/:userId` so the static path is not eaten by the param route
- [x] 3.3 Wire `users.module.ts` to import the OTP provider module from `auth` (or shared module exposing Plivo) without creating a circular dependency
- [x] 3.4 Confirm public `GET /users/:userId` projection excludes `email`, `phone`, `dateOfBirth`, `passwordHash`, `fcmTokens`, `settings` and includes new public fields (`bio`, `username`, `coverPhoto`, `gender`)
- [x] 3.5 Confirm `GET /users/me` returns the full set including the new fields ← (verify: hit each endpoint with supertest or unit test, confirm response shapes match `specs/user-profile` and `specs/user-auth` scenarios)

## 4. Backend — Tests

- [x] 4.1 Add/extend unit tests for `users.service` covering username uniqueness, reserved names, lowercase coercion, idempotent self-username, and `dateOfBirth` range
- [x] 4.2 Add unit tests for the phone-change OTP flow: success, wrong code, attempt limit, expiry, no-pending, rate limit, Plivo failure, cross-user collision
- [x] 4.3 Run `cd chat-backend && npm run lint && npm test` and resolve any failures ← (verify: all new scenarios in spec deltas have at least one corresponding test, lint and tests pass)

## 5. Mobile — Types and API Layer

- [x] 5.1 Extend `User` type in `ChatApp/src/types/` with optional `bio`, `username`, `coverPhoto`, `dateOfBirth` (ISO string), `gender` (`'male' | 'female' | 'other' | 'prefer_not'`)
- [x] 5.2 Extend `usersApi` in `ChatApp/src/services/api/apiService.ts` with: `checkUsername(u)`, `requestPhoneOtp(phone)`, `verifyPhoneOtp(phone, code)`, `removePhone()`
- [x] 5.3 Confirm `usersApi.updateMe` payload type accepts the new fields and that response shape is consumable by `AuthContext`
- [x] 5.4 Verify `AuthContext.refreshUser` propagates new fields end-to-end (read `/users/me`, write into `user` state); update the user mapper if any field is dropped ← (verify: log or step-debug shows new fields available on `useAuth().user` after refreshUser)

## 6. Mobile — EditProfile Redesign

- [x] 6.1 Create reusable `EditProfileSheet` shell component under `ChatApp/src/screens/main/components/edit-profile/EditProfileSheet.tsx` with `Modal animationType="slide"`, header (title + close), content slot, and primary action bar
- [x] 6.2 Implement confirm-close behavior in the shell: when `dirty === true`, dismissing prompts "Bỏ thay đổi?" before close
- [x] 6.3 Replace `EditProfileScreen.tsx` body with new layout: cover photo band (160 dp, `koolaColors.primarySoft` fallback) + avatar overlapping (-32 dp, 112 dp) + 3 grouped `KoolaSurface` sections
- [x] 6.4 Wire cover photo Pressable to existing `pickImage` + `uploadMedia` flow and call `usersApi.updateMe({ coverPhoto: mediaKey })` then `refreshUser()`
- [x] 6.5 Render Email row read-only with `KoolaBadge tone="success"` "Đã xác thực" and a copy icon button using `Clipboard.setString`
- [x] 6.6 Add three section labels: "THÔNG TIN CƠ BẢN", "TÀI KHOẢN", "CÁ NHÂN" using `KoolaText variant="caption"` weight 700 tone muted with letterSpacing
- [x] 6.7 Ensure every row has a 44 dp minimum touch target and press feedback (opacity 0.82 + scale 0.99) ← (verify: layout matches the design described in `specs/user-profile/spec.md` "EditProfile Setting-Row UI" requirement; no raw `<Text>`, no hex literals)

## 7. Mobile — Six Edit Sheets

- [x] 7.1 `DisplayNameSheet.tsx` — `KoolaTextInput` + `${len}/80` counter + "Lưu" disabled when empty/unchanged; calls `updateMe({ displayName })` then `refreshUser()`
- [x] 7.2 `BioSheet.tsx` — multiline `KoolaTextInput` (4 rows) + `${len}/160` counter + "Lưu"; calls `updateMe({ bio })` then `refreshUser()`
- [x] 7.3 `UsernameSheet.tsx` — lowercase `KoolaTextInput` + `${len}/30` counter + 400 ms debounced live check via `usersApi.checkUsername`; show ✓/✗ with messages from spec; "Lưu" enabled only when format valid, changed, and `available: true`
- [x] 7.4 `PhoneSheet.tsx` — Step 1 (phone E.164 input + "Gửi mã" calling `requestPhoneOtp`), Step 2 (6-digit code input + "Xác thực" calling `verifyPhoneOtp`); also shows "Gỡ số điện thoại" (danger ghost) if phone already set, calling `removePhone`; surfaces 409/429/410/503 messages from backend
- [x] 7.5 `DateOfBirthSheet.tsx` — uses `@react-native-community/datetimepicker` (install if missing), `maximumDate=today`, `minimumDate=1900-01-01`, displays formatted via `date-fns/vi` `dd/MM/yyyy`; calls `updateMe({ dateOfBirth })` then `refreshUser()`
- [x] 7.6 `GenderSheet.tsx` — 4 `KoolaChip` radio options (Nam / Nữ / Khác / Không nêu) mapped to enum values; calls `updateMe({ gender })` then `refreshUser()`
- [x] 7.7 Wire all 6 sheets into `EditProfileScreen` row press handlers ← (verify: each sheet open/save/close cycle persists the field and reflects in `useAuth().user` after `refreshUser`; confirm-close prompt fires on dirty dismiss)

## 8. Mobile — Dependency and Polish

- [x] 8.1 Check `ChatApp/package.json` for `@react-native-community/datetimepicker`; if missing, add it with the version compatible with RN 0.76.9 and follow autolink (no manual native steps unless required by docs)
- [x] 8.2 Confirm there is no regression on the parent `SettingsScreen` (Personal tab home) — the navigate-to-EditProfile entry continues to work and existing rows (Notifications, Privacy Alert, About Alert, Storage) are untouched
- [x] 8.3 Run `cd ChatApp && npm run lint && npm test && npm run typecheck` and resolve any failures ← (verify: lint, tests, and typecheck pass; manual smoke test: open EditProfile, edit each field, force-close app, reopen, fields persist)

## 9. Final Verification

- [x] 9.1 Walk every scenario in `specs/user-profile/spec.md` and `specs/phone-otp-verification/spec.md` against the running app and backend (manual or automated)
- [x] 9.2 Confirm avatar rendering is unchanged when uploading a square image and that `UserAvatar` was not modified for this change
- [x] 9.3 Confirm `ProfileScreen.tsx` (other-user view) still renders correctly with the new public fields available (it can ignore them but must not crash) ← (verify: no CRITICAL gaps remain between specs and implementation; all "Out of scope" boundaries respected)
