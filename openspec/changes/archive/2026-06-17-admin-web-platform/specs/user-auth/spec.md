## MODIFIED Requirements

### Requirement: User Login
The system SHALL allow registered users to log in with phone number and password, and SHALL reject login for any user whose `isBanned` is `true`.

#### Scenario: Successful login
- **WHEN** a non-banned user submits a valid phone number and correct password
- **THEN** the system returns HTTP 200 with a JWT access token and a refresh token

#### Scenario: Login with wrong password
- **WHEN** a user submits a valid phone number but incorrect password
- **THEN** the system returns HTTP 401 Unauthorized with message "Invalid credentials"

#### Scenario: Login with non-existent phone
- **WHEN** a user submits a phone number that does not exist
- **THEN** the system returns HTTP 401 Unauthorized with message "Invalid credentials"

#### Scenario: Banned user cannot log in
- **WHEN** a user whose `isBanned` is `true` submits correct credentials
- **THEN** the system SHALL reject the login (HTTP 403 Forbidden) and SHALL NOT issue tokens

### Requirement: User Schema
The system SHALL store user records with phone as the primary identifier and email as optional, SHALL support the `accountType` discriminator (`personal` | `business`), and SHALL include an `isPlatformAdmin` boolean field (default `false`) that designates platform-administration authority.

#### Scenario: Phone field uniqueness
- **WHEN** a user record is created with a phone number
- **THEN** the phone field SHALL have a unique sparse index ensuring no duplicate phone numbers

#### Scenario: Email field optional
- **WHEN** a user registers with phone number only (no email)
- **THEN** the email field SHALL be null/undefined and the sparse unique index SHALL allow multiple null values

#### Scenario: Admin flag defaults false
- **WHEN** a user is created
- **THEN** `isPlatformAdmin` SHALL default to `false`

#### Scenario: Admin flag governs admin access
- **WHEN** a user's `isPlatformAdmin` is `true`
- **THEN** that user (as a human actor) SHALL be authorized by the AdminGuard for `/admin/*` routes
