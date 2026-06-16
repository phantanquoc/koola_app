## ADDED Requirements

### Requirement: OTP Send for Profile Phone Change

The system SHALL send a 6-digit OTP via SMS to a target Vietnam phone number (+84, 9-10 digits) when an authenticated user requests to set or change their phone via `POST /users/me/phone/request-otp`. The OTP delivery uses the same Plivo Verify integration and rate-limit/attempt rules used for registration; pending change state is held in Redis with a TTL of 300s under a key namespace distinct from registration (e.g. `phone-change:<userId>:<phone>`).

#### Scenario: Successful OTP send for phone change
- **WHEN** authenticated user submits `POST /users/me/phone/request-otp` with `{ phone: "+84901234567" }` and that phone is not already registered to another user
- **THEN** system stores pending change in Redis under the profile-change namespace (TTL 300s), sends OTP via Plivo, and returns HTTP 200 with `{ message: "OTP sent", expiresIn: 300 }`

#### Scenario: Phone already registered to another user
- **WHEN** authenticated user submits a phone that already belongs to a different user
- **THEN** system returns HTTP 409 Conflict with message "Số điện thoại đã được sử dụng" and does NOT send an OTP

#### Scenario: Phone matches caller's current phone
- **WHEN** authenticated user requests OTP for the phone they already have set
- **THEN** system returns HTTP 400 with message "Số điện thoại không thay đổi" and does NOT send an OTP

#### Scenario: Invalid phone format on profile change
- **WHEN** submitted phone does not match `+84` followed by 9-10 digits
- **THEN** system returns HTTP 400 Bad Request with a validation error

#### Scenario: Profile change rate limit exceeded
- **WHEN** authenticated user has already sent 3 OTP requests for the same phone in 10 minutes (counted within the profile-change namespace)
- **THEN** system returns HTTP 429 Too Many Requests with message "Vui lòng đợi trước khi gửi lại"

#### Scenario: Plivo failure during profile change
- **WHEN** Plivo Verify API returns an error or times out
- **THEN** system returns HTTP 503 Service Unavailable with message "Không thể gửi mã xác thực. Vui lòng thử lại."

### Requirement: OTP Verification for Profile Phone Change

The system SHALL verify the OTP code submitted via `POST /users/me/phone/verify-otp` against Plivo Verify and write the new phone onto the authenticated user upon success. Attempt limits and code expiry rules match the registration flow.

#### Scenario: Successful phone change
- **WHEN** authenticated user submits `POST /users/me/phone/verify-otp` with the correct 6-digit OTP for a pending profile change
- **THEN** system updates the user's `phone` field, clears the pending Redis state, and returns HTTP 200 with the updated user

#### Scenario: Incorrect OTP on profile change
- **WHEN** authenticated user submits an incorrect OTP and has fewer than 5 failed attempts on this pending change
- **THEN** system returns HTTP 400 with message "Mã xác thực không đúng. Còn X lần thử."

#### Scenario: Profile change attempt limit exceeded
- **WHEN** authenticated user has 5 failed verification attempts for a pending change
- **THEN** system invalidates the pending change, requires a new OTP request, and returns HTTP 429 with message "Vượt quá số lần thử. Vui lòng yêu cầu mã mới."

#### Scenario: Profile change OTP expired
- **WHEN** authenticated user submits OTP after the 300s pending-state TTL
- **THEN** system returns HTTP 410 Gone with message "Mã xác thực đã hết hạn. Vui lòng yêu cầu mã mới."

#### Scenario: No pending change
- **WHEN** authenticated user calls `verify-otp` without a pending change in Redis
- **THEN** system returns HTTP 404 Not Found with message "Không có yêu cầu thay đổi đang chờ"

### Requirement: Remove Phone From Profile

The system SHALL allow an authenticated user to remove their phone via `DELETE /users/me/phone` without OTP verification, since they already hold the credential being changed away from.

#### Scenario: Successful phone removal
- **WHEN** authenticated user with a phone set submits `DELETE /users/me/phone`
- **THEN** system clears the user's `phone` field and returns HTTP 200 with the updated user

#### Scenario: Removal when no phone set
- **WHEN** authenticated user with no phone calls `DELETE /users/me/phone`
- **THEN** system returns HTTP 200 with the user unchanged (idempotent)
