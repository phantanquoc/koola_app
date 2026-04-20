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

