## Context

The current `User` schema (`chat-backend/src/users/user.schema.ts`) holds only `email`, `phone?`, `passwordHash`, `displayName`, `avatar`, `isOnline`, `lastSeen`, `fcmTokens`, and `settings.notificationsEnabled`. The `EditProfileScreen` mobile UI exposes just `displayName` and `avatar` for editing; email is rendered as a soft "input" but is read-only, and the rest of the screen is empty space below a single `Lưu thay đổi` button. There is no concept of bio, username, cover photo, date of birth, or gender. Phone exists in the schema (used by the registration OTP flow under `phone-otp-verification`) but has no profile-level read or update endpoint.

UI primitives are already standardized via `koolaColors`, `KoolaText`, `KoolaSurface`, `KoolaButton`, `KoolaTextInput`, `KoolaDivider`, `KoolaChip`, `KoolaBadge` (see `openspec/ui-dna.md`). Bottom sheets in this project are implemented with React Native's built-in `Modal animationType="slide"` — no `@gorhom/bottom-sheet` dependency. Plivo Verify integration with Redis-backed rate-limit/pending state already exists for registration; the same primitives can be reused for an authenticated phone-change flow. Avatar/media upload uses presigned MinIO URLs (`pickImage` + `uploadMedia` returning a `mediaKey`); `coverPhoto` will reuse this exact path.

## Goals / Non-Goals

**Goals:**
- Make the user identity model expressive enough to drive richer downstream UX (profile cards, chat headers, Connect/Moments surfaces) without future schema churn.
- Replace the single-form EditProfile with a setting-row + bottom-sheet pattern that scales to additional fields.
- Make Email's immutability obvious (verified badge + copy, no fake input).
- Treat phone as a verifiable post-registration field, reusing existing OTP infrastructure rather than inventing a parallel flow.
- Keep changes additive on backend so no migration script is required.

**Non-Goals:**
- E2E encryption of profile fields (the existing privacy Alert text on the parent settings screen is left untouched).
- Avatar cropping UI (still just `pickImage` → `uploadMedia`).
- Profile visibility/privacy controls (who can see which fields).
- Email mutability.
- `ProfileScreen.tsx` (the read-only profile of another user opened from chat) — outside this change.

## Decisions

### 1. New profile fields are stored on the existing `User` document, not a separate `UserProfile` collection.

**Chosen**: Extend `User` with optional fields directly.

**Why**: All new fields are 1-to-1 with the user, accessed on `/users/me` and `/users/:id`, and not large enough to warrant a separate collection. Keeping them on `User` avoids a join/populate per profile read and matches the existing `settings` embedded-object precedent.

**Alternative**: Separate `UserProfile` collection referenced by userId — rejected because it adds a read on every profile lookup and offers no benefit at this scale.

### 2. `username` uses `unique: true, sparse: true, lowercase: true` with regex validation at the DTO layer.

**Chosen**: Mongoose-level uniqueness via index; class-validator `@Matches(/^[a-z0-9_]{3,30}$/)` at DTO; lowercase coercion server-side.

**Why**: Sparse index allows existing users with no username to keep `null/undefined`. Lowercase storage avoids case-collision ambiguity. Regex matches typical handle conventions and rejects whitespace, unicode tricks, and reserved characters. The dedicated `GET /users/check-username` endpoint exists to give the UI live feedback before the user hits Save (avoid surfacing a 409 mid-stroke).

**Reserved names**: server rejects a small list of reserved handles (`me`, `admin`, `support`, `system`, `koola`, `null`, `undefined`) to keep room for future routing and avoid impersonation.

**Alternative**: Generate username from displayName — rejected because users want to choose handles; auto-generation conflicts with uniqueness and feels imposed.

### 3. Phone change reuses `phone-otp-verification` capability instead of duplicating Plivo logic.

**Chosen**: Extend `phone-otp-verification` capability with a "profile phone change" use case. The `users.module` imports the OTP provider module and the new `users.service` methods call into the same Plivo-backed primitive used by registration. Rate limits, attempt caps, and Redis pending-state TTL all match registration behavior.

**Why**: Plivo Verify, Redis pending state, attempt limit, and rate-limit semantics are already implemented and tested for registration. Re-implementing would risk drift and duplicate edge cases (rate limit, expired code, Plivo failure).

**Pending-state key namespacing**: pending phone-change state uses a different Redis key prefix (e.g. `phone-change:<userId>:<phone>`) so registration and profile-change flows do not collide.

**Alternative**: Inline a second Plivo client in `users.service` — rejected (drift, duplicate test surface).

### 4. EditProfile uses native `Modal animationType="slide"` for bottom sheets, not a new dependency.

**Chosen**: One reusable internal `EditProfileSheet` shell (header bar with title + close, content slot, primary action bar) wrapping React Native's `Modal`. Each of the 6 edit cases is a thin component using this shell.

**Why**: Already the project convention (`openspec/ui-dna.md` line 118). Avoids adding `@gorhom/bottom-sheet` and its reanimated/gesture-handler entanglement (the project has had reanimated-related teardown crashes documented in `MainNavigator.tsx`).

**Alternative**: `@gorhom/bottom-sheet` — rejected (new dependency, gesture-handler footprint, project history of reanimated crashes near teardown).

### 5. Each sheet saves independently rather than one global "Lưu" at the screen level.

**Chosen**: Per-sheet primary action commits via `usersApi.updateMe(...)` (or phone-specific endpoints) and triggers `refreshUser()` from `AuthContext`. The screen header has no "Lưu" button.

**Why**: Setting-row pattern semantics (iOS Settings, FB) — each row owns its own commit. Simplifies dirty tracking: there is no cross-field staged state. Reduces accidental loss on back-gesture (only the sheet you're inside has unsaved input, and the sheet itself owns its confirm-close).

**Confirm-close on sheet**: each sheet, if its local input differs from the server value, prompts "Bỏ thay đổi?" on close gesture / back press.

**Alternative**: Global stage + single Save — rejected (more state, worse UX for iOS-style row pattern, gives the misleading impression that field-level operations like "Verify phone" are tentative).

### 6. Username live-check uses 400ms debounce + `GET /users/check-username` endpoint.

**Chosen**: After 400ms of input idle, call `GET /users/check-username?u=<value>`; show ✓ if `available: true`, ✗ with error copy if false or invalid format. Save button enabled only when current input passes regex, has changed, and the latest check returned `available`.

**Why**: 400ms balances responsiveness vs API load. Live check prevents users from hitting Save and getting a 409 surprise.

**Self-username edge case**: server returns `available: true` if the queried name equals the caller's current username (no false negative when re-saving unchanged).

### 7. `dateOfBirth` uses `@react-native-community/datetimepicker` (add if missing).

**Chosen**: Native picker via this community package. Display formatted via `date-fns` (already a dependency) using `vi` locale.

**Why**: Native pickers feel correct on each platform; community package is the standard. `date-fns/vi` already used elsewhere (e.g. `ProfileScreen.tsx`).

**Validation**: server enforces `dateOfBirth` <= today and >= 1900-01-01 to reject obvious garbage; client mirrors with picker `maximumDate`/`minimumDate`.

### 8. `coverPhoto` reuses the existing media upload pipeline.

**Chosen**: Pressable cover region calls `pickImage` → `uploadMedia` → `usersApi.updateMe({ coverPhoto: mediaKey })` → `refreshUser()`. Same pattern as avatar.

**Why**: Pipeline is proven (presigned URL via MinIO, mediaCacheService for retrieval). No reason to introduce a parallel path.

**Display**: cover renders via the same media resolution as avatar (cached `mediaCacheService.getOrDownload`); fallback is a `koolaColors.primarySoft` band (matches the existing `heroBand` pattern in `ProfileScreen.tsx`).

### 9. Email row stays read-only with badge + copy, not an editable field.

**Chosen**: Email is rendered inside a `KoolaSurface variant="soft"` row with a `KoolaBadge tone="success"` "Đã xác thực" and a copy icon button (`Clipboard.setString`). No input affordance.

**Why**: Email is the credential anchor. Allowing change requires its own OTP-to-new-email flow, which is out of scope for this change. The current "soft input" looks editable and confuses users.

## Risks / Trade-offs

- **Username squatting** → Mitigation: reserved-name list server-side, plus a future moderation endpoint (out of scope here).
- **Phone change flow drift from registration OTP** → Mitigation: same Plivo service + same rate-limit/attempt rules; cross-tested at the service layer. Reuses `phone-otp-verification` capability.
- **Data sensitivity (DOB, gender)** → Mitigation: fields are optional, default to empty/undefined, never auto-populated. UI labels them "(tùy chọn)".
- **Sheet UX inconsistency with the rest of the app** → Mitigation: shared `EditProfileSheet` shell ensures every sheet has identical header/action layout; uses only existing UI primitives.
- **`@react-native-community/datetimepicker` install adds native autolink** → Mitigation: add it only if missing; verify pod/Gradle integration during apply; if it fails, fall back to a plain text input with strict regex (yyyy-mm-dd) and a documented follow-up.
- **AuthContext `refreshUser` may not propagate new fields if mapper is selective** → Mitigation: explicit verification step in tasks; expand the User mapper if needed.
- **Username uniqueness race**: two simultaneous clients could pass `check-username` then collide on Save → Mitigation: rely on Mongoose unique index (server returns 409 with "Tên người dùng vừa bị người khác sử dụng"). Live check is best-effort UX, not the source of truth.

## Migration Plan

- All new schema fields are optional; existing users continue to function with `undefined` values. No script needed.
- Username unique sparse index: Mongo will create on next start; existing docs without `username` are excluded from uniqueness, so no collisions.
- Mobile rollout: redesigned EditProfile is gated only by app version (no feature flag) — single shipping unit.
- Rollback: revert mobile commit (UI snaps back to old form, ignores new fields). Backend can keep the new fields/endpoints; they remain unused by the old client.
