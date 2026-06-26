## ADDED Requirements

### Requirement: Email OTP Send for Registration
The system SHALL send a 6-digit OTP code via email to the provided email address when a user initiates registration via `POST /auth/register/init`, and SHALL hold the pending registration (email, hashed password, display name) in Redis with a 300-second TTL.

#### Scenario: Successful OTP send
- **WHEN** a user submits a valid email, password (min 8 chars), and display name via `POST /auth/register/init`
- **THEN** the system stores the pending registration in Redis (TTL 300s), sends a 6-digit OTP to the email, and returns HTTP 200 with `{ message, expiresIn: 300 }`

#### Scenario: Email already registered
- **WHEN** a user submits an email that already exists in the User collection
- **THEN** the system returns HTTP 409 Conflict with message "Email đã được sử dụng" and does NOT send an OTP

#### Scenario: Invalid email format
- **WHEN** a user submits an email that fails email validation
- **THEN** the system returns HTTP 400 Bad Request with a validation error

#### Scenario: Weak password
- **WHEN** a user submits a password shorter than 8 characters
- **THEN** the system returns HTTP 400 Bad Request with a validation error

#### Scenario: Registration rate limit exceeded
- **WHEN** a user has already requested 3 registration OTPs for the same email within 10 minutes
- **THEN** the system returns HTTP 429 Too Many Requests with message "Vui lòng đợi trước khi gửi lại"

#### Scenario: Email delivery failure
- **WHEN** the email transport fails to send the OTP
- **THEN** the system returns HTTP 503 Service Unavailable with message "Không thể gửi mã xác thực. Vui lòng thử lại."

### Requirement: Email OTP Verification for Registration
The system SHALL verify the OTP submitted by the user against the pending registration in Redis and, on success, create the user account and return an access token and refresh token so the client is logged in immediately.

#### Scenario: Successful verification and auto-login
- **WHEN** a user submits the correct 6-digit OTP for an email with a valid pending registration via `POST /auth/register/verify`
- **THEN** the system creates a user (lowercased email, hashed password, display name), deletes the pending Redis keys, and returns HTTP 201 with `{ accessToken, refreshToken }`

#### Scenario: Incorrect OTP code
- **WHEN** a user submits a wrong OTP and has fewer than 5 failed attempts
- **THEN** the system returns HTTP 400 Bad Request with message "Mã xác thực không đúng. Còn X lần thử."

#### Scenario: OTP attempt limit exceeded
- **WHEN** a user has submitted a wrong OTP 5 times for the same email
- **THEN** the system returns HTTP 400 Bad Request with message "Quá số lần thử. Vui lòng gửi lại mã mới."

#### Scenario: OTP expired or no pending registration
- **WHEN** a user submits an OTP but no pending registration exists in Redis (expired or never initiated)
- **THEN** the system returns HTTP 400 Bad Request with message "Không tìm thấy yêu cầu đăng ký hoặc mã đã hết hạn"

### Requirement: Registration OTP Resend
The system SHALL allow a user to request a new registration OTP for an email that has a pending registration via `POST /auth/register/resend-otp`, subject to the same send rate limit.

#### Scenario: Successful resend
- **WHEN** a user requests a resend for an email that still has a pending registration in Redis and is under the rate limit
- **THEN** the system generates a new OTP, refreshes the pending registration TTL, sends the OTP, and returns HTTP 200

#### Scenario: Resend with no pending registration
- **WHEN** a user requests a resend for an email with no pending registration
- **THEN** the system returns HTTP 400 Bad Request with message "Không tìm thấy yêu cầu đăng ký hoặc mã đã hết hạn"

#### Scenario: Resend rate limit exceeded
- **WHEN** a user has already requested 3 registration OTPs for the same email within 10 minutes
- **THEN** the system returns HTTP 429 Too Many Requests

### Requirement: Forgot Password OTP Request
The system SHALL accept a forgot-password request for an email via `POST /auth/forgot-password` and SHALL always respond with HTTP 200 and a neutral message, regardless of whether the email exists, to prevent account enumeration.

#### Scenario: Request for an existing account
- **WHEN** a user submits an email that belongs to an existing account and is under the rate limit
- **THEN** the system generates a 6-digit OTP, stores it in Redis (TTL 300s), sends it to the email, and returns HTTP 200 with message "Nếu email tồn tại, mã xác thực đã được gửi"

#### Scenario: Request for a non-existent account
- **WHEN** a user submits an email that does NOT belong to any account
- **THEN** the system does NOT send an email and returns HTTP 200 with the same message "Nếu email tồn tại, mã xác thực đã được gửi"

#### Scenario: Forgot-password rate limit exceeded
- **WHEN** a user has already requested 3 password-reset OTPs for the same email within 10 minutes
- **THEN** the system returns HTTP 200 with the same neutral message and does NOT send an additional email

### Requirement: Password Reset OTP Verification and Ticket Issuance
The system SHALL verify the password-reset OTP via `POST /auth/reset-password/verify` and, on success, issue a single-use cryptographically random reset ticket stored in Redis with a 600-second TTL mapping to the user id.

#### Scenario: Successful reset OTP verification
- **WHEN** a user submits the correct OTP for an email with a valid pending reset
- **THEN** the system issues a random reset ticket (TTL 600s) mapped to the user id, deletes the reset OTP key, and returns HTTP 200 with `{ resetToken }`

#### Scenario: Incorrect reset OTP
- **WHEN** a user submits a wrong reset OTP and has fewer than 5 failed attempts
- **THEN** the system returns HTTP 400 Bad Request with message "Mã xác thực không đúng. Còn X lần thử."

#### Scenario: Reset OTP attempt limit exceeded
- **WHEN** a user has submitted a wrong reset OTP 5 times for the same email
- **THEN** the system returns HTTP 400 Bad Request with message "Quá số lần thử. Vui lòng gửi lại mã mới."

#### Scenario: Reset OTP expired or never requested
- **WHEN** a user submits a reset OTP but no pending reset exists in Redis
- **THEN** the system returns HTTP 400 Bad Request with message "Không tìm thấy yêu cầu hoặc mã đã hết hạn"

### Requirement: Password Reset Completion
The system SHALL set a new password via `POST /auth/reset-password` only when presented with a valid reset ticket, and SHALL revoke all of the user's refresh tokens upon success so every existing session is invalidated.

#### Scenario: Successful password reset
- **WHEN** a user submits a valid reset ticket and a new password (min 8 chars)
- **THEN** the system updates the user's password hash (bcrypt cost 12), revokes ALL of that user's refresh tokens, deletes the reset ticket, and returns HTTP 200

#### Scenario: Invalid or expired reset ticket
- **WHEN** a user submits a reset ticket that does not exist or has expired
- **THEN** the system returns HTTP 400 Bad Request with message "Vé đặt lại không hợp lệ hoặc đã hết hạn"

#### Scenario: Weak new password
- **WHEN** a user submits a new password shorter than 8 characters
- **THEN** the system returns HTTP 400 Bad Request with a validation error

#### Scenario: All sessions invalidated after reset
- **WHEN** a password reset completes successfully
- **THEN** any subsequent `POST /auth/refresh` using a refresh token issued before the reset SHALL be rejected with HTTP 401

### Requirement: OTP Rate Limiting and Attempt Counting
The system SHALL enforce send rate limits and verification attempt limits using atomic Redis counters, independently for the registration and password-reset flows.

#### Scenario: Send rate limit tracking
- **WHEN** an OTP send is requested for an email
- **THEN** the system atomically increments a Redis counter for that email with a 600-second TTL and allows the request only while the counter is at most 3

#### Scenario: Verify attempt tracking
- **WHEN** an OTP verification is attempted for an email
- **THEN** the system atomically increments an attempts counter with a 300-second TTL and blocks further attempts once it exceeds 5

#### Scenario: Counters expire automatically
- **WHEN** the rate-limit or attempt window elapses
- **THEN** the corresponding Redis counter expires via TTL and the user may request or verify again
