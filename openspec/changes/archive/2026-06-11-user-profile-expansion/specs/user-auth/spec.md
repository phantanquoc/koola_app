## ADDED Requirements

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
- **THEN** the system returns HTTP 409 Conflict with message "Số điện thoại đã được sử dụng"
