# user-auth Specification

## Purpose
TBD - created by archiving change phone-otp-registration. Update Purpose after archive.
## Requirements
### Requirement: User Registration
The system SHALL allow new users to register with phone number (+84 Vietnam), password, and display name, verified via SMS OTP.

#### Scenario: Successful registration
- **WHEN** user completes OTP verification after submitting phone number, password (min 8 chars), and display name
- **THEN** system creates user record with phone, hashed password, and display name

#### Scenario: Registration with duplicate phone
- **WHEN** user submits phone number that already exists
- **THEN** system returns HTTP 409 Conflict with message "Số điện thoại đã được sử dụng"

#### Scenario: Registration with invalid phone format
- **WHEN** user submits phone number not matching +84 followed by 9-10 digits
- **THEN** system returns HTTP 400 Bad Request with validation error

#### Scenario: Registration with weak password
- **WHEN** user submits password shorter than 8 characters
- **THEN** system returns HTTP 400 Bad Request with validation error "Password must be at least 8 characters"

### Requirement: User Login
The system SHALL allow registered users to log in with phone number and password.

#### Scenario: Successful login
- **WHEN** user submits valid phone number and correct password
- **THEN** system returns HTTP 200 with JWT access token (1h expiry) and refresh token (30 days expiry)

#### Scenario: Login with wrong password
- **WHEN** user submits valid phone number but incorrect password
- **THEN** system returns HTTP 401 Unauthorized with message "Invalid credentials"

#### Scenario: Login with non-existent phone
- **WHEN** user submits phone number that does not exist
- **THEN** system returns HTTP 401 Unauthorized with message "Invalid credentials"

### Requirement: User Schema
The system SHALL store user records with phone as the primary identifier and email as optional.

#### Scenario: Phone field uniqueness
- **WHEN** a user record is created with a phone number
- **THEN** the phone field SHALL have a unique sparse index ensuring no duplicate phone numbers

#### Scenario: Email field optional
- **WHEN** a user registers with phone number only (no email)
- **THEN** the email field SHALL be null/undefined and the sparse unique index SHALL allow multiple null values

### Requirement: JWT Token Payload
The system SHALL include phone number in JWT access token payload instead of email.

#### Scenario: Access token contains phone
- **WHEN** system generates a JWT access token for a user
- **THEN** the token payload SHALL contain `{ sub: userId, phone: userPhone }`

#### Scenario: JWT strategy validation
- **WHEN** system validates a JWT token
- **THEN** system SHALL extract userId from `sub` claim and phone from `phone` claim

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

