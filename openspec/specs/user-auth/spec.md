# user-auth Specification

## Purpose
TBD - created by archiving change phone-otp-registration. Update Purpose after archive.
## Requirements
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

### Requirement: JWT Token Payload
The system SHALL include the user's phone in the JWT access token payload, and SHALL additionally support an optional `act` (actor) claim and an `accountType` claim to support delegated business-account sessions. When a token represents a business-account session, `sub` is the business account id and `act` is the root human user id. JWT validation SHALL expose an `actorId` resolved as `act ?? sub`.

#### Scenario: Access token contains phone
- **WHEN** system generates a JWT access token for a personal login
- **THEN** the token payload SHALL contain `{ sub: userId, phone: userPhone }` and MAY include `accountType: 'personal'`

#### Scenario: Delegated business-account token
- **WHEN** the system issues a token for an account switch into a business account
- **THEN** the payload SHALL contain `{ sub: businessAccountId, act: rootUserId, accountType: 'business' }`

#### Scenario: JWT strategy validation
- **WHEN** system validates a JWT token
- **THEN** system SHALL extract the active identity from `sub` and SHALL expose `actorId = act ?? sub`

#### Scenario: Backward-compatible legacy token
- **WHEN** system validates a token that has no `act` claim
- **THEN** `actorId` SHALL equal `sub` and existing behavior SHALL be unchanged

### Requirement: User Resource Shape Includes Profile Fields

The `User` resource returned by `/users/me` and login/refresh flows SHALL include the optional profile fields `bio`, `username`, `coverPhoto`, `dateOfBirth`, and `gender` (omitted or null when unset), in addition to existing fields (`_id`, `email`, `phone`, `displayName`, `avatar`, `isOnline`, `lastSeen`, `settings`).

#### Scenario: Login response shape
- **WHEN** a user successfully logs in
- **THEN** the returned `user` object includes the optional profile fields when set, or omits/nulls them when unset

#### Scenario: Refresh response shape
- **WHEN** a user successfully refreshes their access token via `/auth/refresh`
- **THEN** the returned `user` object (if present) includes the optional profile fields with the same shape rule

### Requirement: Phone Mutability Post-Registration

The system SHALL permit an authenticated user to set, change, or remove their phone after registration via the profile phone-change flow defined in `phone-otp-verification`. Phone uniqueness is enforced across all users.

#### Scenario: Phone uniqueness enforced cross-user
- **WHEN** any flow (registration or profile change) attempts to assign a phone already held by a different user
- **THEN** the system returns HTTP 409 Conflict with message "So dien thoai da duoc su dung"

