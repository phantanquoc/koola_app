# phone-otp-verification Specification

## Purpose
TBD - created by archiving change phone-otp-registration. Update Purpose after archive.
## Requirements
### Requirement: OTP Send for Registration
The system SHALL send a 6-digit OTP code via SMS to the provided Vietnam phone number (+84) using Plivo Verify API when a user initiates registration.

#### Scenario: Successful OTP send
- **WHEN** user submits valid phone number (+84, 9-10 digits), password (min 8 chars), and displayName via `POST /api/auth/register/init`
- **THEN** system stores pending registration in Redis (TTL 300s), sends OTP via Plivo, and returns HTTP 200 with `{ message: "OTP sent", expiresIn: 300 }`

#### Scenario: Phone number already registered
- **WHEN** user submits a phone number that already exists in the User collection
- **THEN** system returns HTTP 409 Conflict with message "Số điện thoại đã được sử dụng" and does NOT send OTP

#### Scenario: Invalid phone format
- **WHEN** user submits phone number that does not match +84 followed by 9-10 digits
- **THEN** system returns HTTP 400 Bad Request with validation error

#### Scenario: Rate limit exceeded
- **WHEN** user has already sent 3 OTP requests for the same phone number within 10 minutes
- **THEN** system returns HTTP 429 Too Many Requests with message "Vui lòng đợi trước khi gửi lại"

#### Scenario: Plivo API failure
- **WHEN** Plivo Verify API returns an error or times out
- **THEN** system returns HTTP 503 Service Unavailable with message "Không thể gửi mã xác thực. Vui lòng thử lại."

### Requirement: OTP Verification for Registration
The system SHALL verify the OTP code submitted by the user against Plivo Verify API and create the user account upon successful verification.

#### Scenario: Successful OTP verification
- **WHEN** user submits correct 6-digit OTP for a phone number with a valid pending registration via `POST /api/auth/register/verify`
- **THEN** system creates user in MongoDB with phone + passwordHash + displayName, cleans up Redis keys, and returns HTTP 201 with `{ message: "Registration successful" }`

#### Scenario: Incorrect OTP code
- **WHEN** user submits wrong OTP code and has fewer than 5 failed attempts
- **THEN** system returns HTTP 400 Bad Request with message "Mã xác thực không đúng. Còn X lần thử."

#### Scenario: OTP attempt limit exceeded
- **WHEN** user has submitted wrong OTP code 5 times for the same phone number
- **THEN** system returns HTTP 400 Bad Request with message "Quá số lần thử. Vui lòng gửi lại mã mới."

#### Scenario: OTP expired or no pending registration
- **WHEN** user submits OTP but no pending registration exists in Redis (expired or never initiated)
- **THEN** system returns HTTP 400 Bad Request with message "Không tìm thấy yêu cầu đăng ký hoặc mã đã hết hạn"

### Requirement: OTP Rate Limiting
The system SHALL enforce rate limits on OTP send requests to prevent abuse.

#### Scenario: Rate limit tracking
- **WHEN** user sends OTP request for a phone number
- **THEN** system increments a Redis counter `otp:rate:{phone}` with TTL 600 seconds (10 minutes) and allows the request if counter is <= 3

#### Scenario: Rate limit reset
- **WHEN** 10 minutes have elapsed since the first OTP request for a phone number
- **THEN** the rate limit counter expires automatically via Redis TTL and user can send OTP again

### Requirement: Phone Number Validation
The system SHALL validate that phone numbers conform to Vietnam (+84) format.

#### Scenario: Valid Vietnam phone number
- **WHEN** user submits phone number matching pattern `+84` followed by 9-10 digits (e.g., "+84912345678")
- **THEN** system accepts the phone number and proceeds with the request

#### Scenario: Invalid phone number format
- **WHEN** user submits phone number that does not start with `+84` or has fewer than 9 or more than 10 digits after the prefix
- **THEN** system returns HTTP 400 Bad Request with validation error

