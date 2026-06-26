## MODIFIED Requirements

### Requirement: User Registration
The system SHALL allow new users to register with email, password, and display name, verified via email OTP. Account creation SHALL occur only after successful OTP verification; there SHALL be no endpoint that creates an account without OTP verification.

#### Scenario: Successful registration
- **WHEN** a user completes email OTP verification after submitting email, password (min 8 chars), and display name
- **THEN** the system creates a user record with lowercased email, hashed password, and display name, and returns an access token and refresh token (auto-login)

#### Scenario: Registration with duplicate email
- **WHEN** a user submits an email that already exists
- **THEN** the system returns HTTP 409 Conflict with message "Email đã được sử dụng" and does NOT send an OTP

#### Scenario: Registration with invalid email format
- **WHEN** a user submits an email that fails email validation
- **THEN** the system returns HTTP 400 Bad Request with a validation error

#### Scenario: Registration with weak password
- **WHEN** a user submits a password shorter than 8 characters
- **THEN** the system returns HTTP 400 Bad Request with validation error "Password must be at least 8 characters"

### Requirement: User Login
The system SHALL allow registered users to log in with email and password, and SHALL reject login for any user whose `isBanned` is `true`.

#### Scenario: Successful login
- **WHEN** a non-banned user submits a valid email and correct password
- **THEN** the system returns HTTP 200 with a JWT access token and a refresh token

#### Scenario: Login with wrong password
- **WHEN** a user submits a valid email but incorrect password
- **THEN** the system returns HTTP 401 Unauthorized with message "Invalid credentials"

#### Scenario: Login with non-existent email
- **WHEN** a user submits an email that does not exist
- **THEN** the system returns HTTP 401 Unauthorized with message "Invalid credentials"

#### Scenario: Banned user cannot log in
- **WHEN** a user whose `isBanned` is `true` submits correct credentials
- **THEN** the system SHALL reject the login (HTTP 403 Forbidden) and SHALL NOT issue tokens
