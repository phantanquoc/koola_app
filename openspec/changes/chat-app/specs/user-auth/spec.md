## ADDED Requirements

### Requirement: User Registration
The system SHALL allow new users to register with email and password.

#### Scenario: Successful registration
- **WHEN** user submits email and password (password min 8 chars, email valid format)
- **THEN** system creates user record with hashed password, returns JWT access token and refresh token

#### Scenario: Registration with duplicate email
- **WHEN** user submits email that already exists
- **THEN** system returns HTTP 409 Conflict with message "Email already in use"

#### Scenario: Registration with invalid email
- **WHEN** user submits email in invalid format
- **THEN** system returns HTTP 400 Bad Request with validation error

#### Scenario: Registration with weak password
- **WHEN** user submits password shorter than 8 characters
- **THEN** system returns HTTP 400 Bad Request with validation error "Password must be at least 8 characters"

### Requirement: User Login
The system SHALL allow registered users to log in with email and password.

#### Scenario: Successful login
- **WHEN** user submits valid email and correct password
- **THEN** system returns HTTP 200 with JWT access token (1h expiry) and refresh token (30 days expiry)

#### Scenario: Login with wrong password
- **WHEN** user submits valid email but incorrect password
- **THEN** system returns HTTP 401 Unauthorized with message "Invalid credentials"

#### Scenario: Login with non-existent email
- **WHEN** user submits email that does not exist
- **THEN** system returns HTTP 401 Unauthorized with message "Invalid credentials"

### Requirement: Token Refresh
The system SHALL allow users to obtain a new access token using a valid refresh token.

#### Scenario: Successful token refresh
- **WHEN** user submits valid refresh token via POST /auth/refresh
- **THEN** system invalidates old refresh token, issues new access token and new refresh token, returns both

#### Scenario: Refresh with expired token
- **WHEN** user submits an expired refresh token (>30 days old)
- **THEN** system returns HTTP 401 Unauthorized with message "Refresh token expired"

#### Scenario: Refresh with revoked token
- **WHEN** user submits a refresh token that has already been used (token rotation)
- **THEN** system returns HTTP 401 Unauthorized with message "Token has been revoked"

### Requirement: Token Validation
The system SHALL validate JWT access tokens on every protected API request.

#### Scenario: Valid access token
- **WHEN** API receives request with valid Authorization: Bearer <access_token>
- **THEN** request proceeds to the handler; user context attached to request

#### Scenario: Missing access token
- **WHEN** API receives request without Authorization header
- **THEN** system returns HTTP 401 Unauthorized with message "No token provided"

#### Scenario: Expired access token
- **WHEN** API receives request with expired access token
- **THEN** system returns HTTP 401 Unauthorized with message "Token expired"

### Requirement: User Logout
The system SHALL allow users to log out by invalidating their refresh token.

#### Scenario: Successful logout
- **WHEN** authenticated user calls POST /auth/logout with refresh token
- **THEN** system marks refresh token as revoked in database, returns HTTP 200

### Requirement: Password Hashing
The system SHALL store passwords using bcrypt with salt rounds of 12.

#### Scenario: Password never stored in plain text
- **WHEN** user registers with password "MySecret123"
- **THEN** database stores bcrypt hash only; plain text password is never persisted
