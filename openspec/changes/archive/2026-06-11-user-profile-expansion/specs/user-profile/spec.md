## ADDED Requirements

### Requirement: Profile Field Schema

The system SHALL persist the following optional profile fields on the authenticated user resource alongside `email`, `displayName`, and `avatar`: `bio` (string, max 160 chars), `username` (string, unique sparse, lowercase, matching `^[a-z0-9_]{3,30}$`), `coverPhoto` (string mediaKey, max 2048 chars), `dateOfBirth` (ISO 8601 date), and `gender` (one of `male`, `female`, `other`, `prefer_not`).

#### Scenario: New user has empty profile fields
- **WHEN** a user is created via registration
- **THEN** `bio`, `username`, `coverPhoto`, `dateOfBirth`, and `gender` are absent or `null` in the persisted document and excluded from `GET /users/me` responses

#### Scenario: Existing users continue to function
- **WHEN** a pre-existing user document without any of the new fields is loaded via `GET /users/me` or `GET /users/:id`
- **THEN** the system returns the user successfully without those fields, and any read access of an unset field SHALL NOT throw

### Requirement: Read Authenticated Profile

The system SHALL return the full set of profile fields (including the new optional fields) on `GET /users/me` for the authenticated user, and SHALL return public profile fields on `GET /users/:userId` for any authenticated caller.

#### Scenario: Self read includes all fields
- **WHEN** authenticated user requests `GET /users/me`
- **THEN** response includes `_id`, `email`, `phone` (if set), `displayName`, `avatar`, `bio`, `username`, `coverPhoto`, `dateOfBirth`, `gender`, `isOnline`, `lastSeen`, `settings`

#### Scenario: Public read excludes sensitive fields
- **WHEN** authenticated user requests `GET /users/:userId` for another user
- **THEN** response includes `_id`, `displayName`, `avatar`, `bio`, `username`, `coverPhoto`, `gender`, `isOnline`, `lastSeen`, and SHALL NOT include `email`, `phone`, `dateOfBirth`, `passwordHash`, `fcmTokens`, `settings`

### Requirement: Update Display Name

The system SHALL accept `displayName` updates via `PUT /users/me` for the authenticated user, with a maximum length of 80 characters and a non-empty trimmed value.

#### Scenario: Successful display name update
- **WHEN** authenticated user submits `PUT /users/me` with `{ displayName: "Quoc Test v2" }`
- **THEN** response is HTTP 200 with the updated user, and subsequent `GET /users/me` reflects the change

#### Scenario: Empty display name rejected
- **WHEN** authenticated user submits `{ displayName: "" }` or `{ displayName: "   " }`
- **THEN** system returns HTTP 400 with a validation error

#### Scenario: Display name exceeds max length
- **WHEN** submitted `displayName` is longer than 80 characters
- **THEN** system returns HTTP 400 with a `MaxLength` validation error

### Requirement: Update Bio

The system SHALL accept `bio` updates via `PUT /users/me` with a maximum length of 160 characters; an empty string clears the bio.

#### Scenario: Set bio
- **WHEN** authenticated user submits `{ bio: "Hello world" }`
- **THEN** response is HTTP 200 and `GET /users/me` returns `bio: "Hello world"`

#### Scenario: Clear bio
- **WHEN** authenticated user submits `{ bio: "" }`
- **THEN** response is HTTP 200 and `bio` is absent or empty in subsequent reads

#### Scenario: Bio too long
- **WHEN** submitted `bio` is longer than 160 characters
- **THEN** system returns HTTP 400 with a `MaxLength` validation error

### Requirement: Update Username

The system SHALL accept `username` updates via `PUT /users/me` only when the value matches `^[a-z0-9_]{3,30}$`, is not already used by another user, and is not on the reserved-name list.

#### Scenario: Successful username set
- **WHEN** authenticated user submits `{ username: "quoc_dev" }` and no other user holds it
- **THEN** response is HTTP 200 and `GET /users/me` returns `username: "quoc_dev"`

#### Scenario: Username uppercase coerced
- **WHEN** authenticated user submits `{ username: "Quoc_Dev" }`
- **THEN** system either coerces to lowercase (`quoc_dev`) before persisting OR returns HTTP 400 with a format error — the implementation MUST pick one and apply it consistently

#### Scenario: Username invalid characters
- **WHEN** submitted username contains spaces, dots, hyphens, or non-ASCII characters
- **THEN** system returns HTTP 400 with a format validation error

#### Scenario: Username too short or too long
- **WHEN** submitted username is shorter than 3 or longer than 30 characters
- **THEN** system returns HTTP 400 with a length validation error

#### Scenario: Username already taken
- **WHEN** authenticated user submits a username that another user already holds
- **THEN** system returns HTTP 409 Conflict with message "Tên người dùng đã được sử dụng"

#### Scenario: Username reserved
- **WHEN** authenticated user submits a username from the reserved-name list (`me`, `admin`, `support`, `system`, `koola`, `null`, `undefined`)
- **THEN** system returns HTTP 400 with message "Tên người dùng không được phép"

#### Scenario: Username unchanged save
- **WHEN** authenticated user submits the username they already hold
- **THEN** system returns HTTP 200 successfully (idempotent)

### Requirement: Check Username Availability

The system SHALL provide `GET /users/check-username?u=<value>` for authenticated users to check if a username is available before submitting it.

#### Scenario: Username available
- **WHEN** authenticated user calls `GET /users/check-username?u=quoc_dev` and no other user holds `quoc_dev`
- **THEN** response is HTTP 200 with `{ available: true }`

#### Scenario: Username taken by another user
- **WHEN** authenticated user calls `GET /users/check-username?u=quoc_dev` and another user holds `quoc_dev`
- **THEN** response is HTTP 200 with `{ available: false, reason: "taken" }`

#### Scenario: Username is caller's current username
- **WHEN** authenticated user with `username: "quoc_dev"` calls `GET /users/check-username?u=quoc_dev`
- **THEN** response is HTTP 200 with `{ available: true }` (treated as "still yours")

#### Scenario: Username invalid format
- **WHEN** authenticated user calls `GET /users/check-username?u=Quoc Dev`
- **THEN** response is HTTP 200 with `{ available: false, reason: "invalid" }`

#### Scenario: Username reserved
- **WHEN** authenticated user calls `GET /users/check-username?u=admin`
- **THEN** response is HTTP 200 with `{ available: false, reason: "reserved" }`

### Requirement: Update Cover Photo

The system SHALL accept `coverPhoto` updates via `PUT /users/me` with a maximum length of 2048 characters; an empty string clears the cover photo.

#### Scenario: Set cover photo
- **WHEN** authenticated user submits `{ coverPhoto: "media/abc123" }`
- **THEN** response is HTTP 200 and `GET /users/me` returns the new `coverPhoto` mediaKey

#### Scenario: Clear cover photo
- **WHEN** authenticated user submits `{ coverPhoto: "" }`
- **THEN** response is HTTP 200 and `coverPhoto` is absent or empty in subsequent reads

#### Scenario: Cover photo too long
- **WHEN** submitted `coverPhoto` exceeds 2048 characters
- **THEN** system returns HTTP 400 with a `MaxLength` validation error

### Requirement: Update Date of Birth

The system SHALL accept `dateOfBirth` updates via `PUT /users/me` as ISO 8601 date strings, validated to be no earlier than 1900-01-01 and no later than today (UTC).

#### Scenario: Successful date of birth set
- **WHEN** authenticated user submits `{ dateOfBirth: "1995-08-12" }`
- **THEN** response is HTTP 200 and `GET /users/me` returns the date

#### Scenario: Future date rejected
- **WHEN** submitted `dateOfBirth` is later than today
- **THEN** system returns HTTP 400 with a validation error

#### Scenario: Pre-1900 date rejected
- **WHEN** submitted `dateOfBirth` is earlier than 1900-01-01
- **THEN** system returns HTTP 400 with a validation error

#### Scenario: Clear date of birth
- **WHEN** authenticated user submits `{ dateOfBirth: null }`
- **THEN** response is HTTP 200 and `dateOfBirth` is absent in subsequent reads

### Requirement: Update Gender

The system SHALL accept `gender` updates via `PUT /users/me` with one of the values `male`, `female`, `other`, `prefer_not`, or `null` to clear.

#### Scenario: Successful gender set
- **WHEN** authenticated user submits `{ gender: "female" }`
- **THEN** response is HTTP 200 and `GET /users/me` returns `gender: "female"`

#### Scenario: Invalid gender value
- **WHEN** submitted `gender` is not in the allowed enum
- **THEN** system returns HTTP 400 with a validation error

#### Scenario: Clear gender
- **WHEN** authenticated user submits `{ gender: null }`
- **THEN** response is HTTP 200 and `gender` is absent in subsequent reads

### Requirement: EditProfile Setting-Row UI

The mobile client SHALL render the `Chỉnh sửa hồ sơ` screen as a setting-row layout with three grouped sections (Thông tin cơ bản / Tài khoản / Cá nhân), where each row opens a dedicated bottom sheet to edit its field.

#### Scenario: Cover photo and avatar layout
- **WHEN** EditProfile is opened
- **THEN** the screen shows a cover photo band (160 dp tall, fallback `koolaColors.primarySoft`) with the avatar (112 dp circle) overlapping the band by 32 dp

#### Scenario: Sections and rows
- **WHEN** EditProfile is opened
- **THEN** the screen shows:
  - Section "Thông tin cơ bản" with rows: Tên hiển thị, Tên người dùng, Giới thiệu
  - Section "Tài khoản" with rows: Email (read-only), Số điện thoại
  - Section "Cá nhân" with rows: Ngày sinh, Giới tính

#### Scenario: Row tap opens sheet
- **WHEN** the user taps any editable row
- **THEN** a bottom sheet opens with `Modal animationType="slide"` containing the relevant editor and a primary "Lưu" action

#### Scenario: Email row read-only
- **WHEN** the user taps the Email row
- **THEN** no editor opens; the row displays a "Đã xác thực" badge and a copy-to-clipboard icon

#### Scenario: Confirm-close on dirty sheet
- **WHEN** the user attempts to dismiss a sheet whose local input differs from the saved value
- **THEN** the system displays a confirmation Alert "Bỏ thay đổi?" before dismissing

### Requirement: Username Sheet Live Availability Feedback

The Username sheet SHALL debounce input by 400 ms and call `GET /users/check-username` to display live availability feedback before save.

#### Scenario: Available username feedback
- **WHEN** the user types a valid username and stops for 400 ms, and the server responds `{ available: true }`
- **THEN** the sheet shows a success indicator (✓) and enables the Save action

#### Scenario: Taken username feedback
- **WHEN** the server responds `{ available: false, reason: "taken" }`
- **THEN** the sheet shows an error indicator (✗) with message "Tên người dùng đã được sử dụng" and disables the Save action

#### Scenario: Invalid format feedback
- **WHEN** input does not match `^[a-z0-9_]{3,30}$`
- **THEN** the sheet shows a format hint and does not call the API

### Requirement: UI Token Compliance

The redesigned EditProfile and all 6 sheets SHALL use only `koolaColors.*`, `KoolaText`, `KoolaSurface`, `KoolaButton`, `KoolaTextInput`, `KoolaDivider`, `KoolaChip`, `KoolaBadge`, and `KoolaState` primitives, with `Modal animationType="slide"` for sheets and a minimum 44 dp touch target on every interactive row.

#### Scenario: No raw Text or hex
- **WHEN** the implementation is reviewed
- **THEN** EditProfile and its sheets contain no raw `<Text>` elements, no hardcoded hex color literals (`#xxxxxx`), and no `TouchableOpacity` (use `Pressable`)

#### Scenario: Press feedback present
- **WHEN** any row or button is pressed
- **THEN** the element shows a visible press response (opacity ≤ 0.85 or a scale ≤ 0.99)
