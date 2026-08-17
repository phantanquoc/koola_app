# admin-user-management Specification

## Purpose
TBD - created by archiving change admin-web-platform. Update Purpose after archive.
## Requirements
### Requirement: List And Search Users
The system SHALL expose `GET /admin/users` (JWT + AdminGuard) returning a paginated list of users, searchable by `displayName`, `email`, or `phone` (case-insensitive) and filterable by `accountType`. Responses SHALL use a safe projection that excludes `passwordHash` and `fcmTokens` and SHALL NOT include refresh-token data.

#### Scenario: Paginated list
- **WHEN** an admin calls `GET /admin/users` without filters
- **THEN** the system SHALL return a paginated list of users with safe fields only

#### Scenario: Search by term
- **WHEN** an admin searches by a substring of displayName, email, or phone
- **THEN** the system SHALL return matching users (case-insensitive)

#### Scenario: Filter by account type
- **WHEN** an admin filters by `accountType='business'`
- **THEN** the system SHALL return only business accounts

#### Scenario: Sensitive fields never leaked
- **WHEN** any user list item is returned
- **THEN** it SHALL NOT contain `passwordHash` or `fcmTokens`

### Requirement: User Detail
The system SHALL expose `GET /admin/users/:id` (JWT + AdminGuard) returning a single user with a safe projection. For business accounts the response SHALL include owner reference and verification info (`verificationStatus`, `rejectionReason`).

#### Scenario: Personal user detail
- **WHEN** an admin requests a personal user's detail
- **THEN** the system SHALL return the safe user fields without sensitive data

#### Scenario: Business user detail includes verification info
- **WHEN** an admin requests a business account's detail
- **THEN** the response SHALL include `ownerUserId`, `verificationStatus`, and `rejectionReason`

#### Scenario: Unknown user
- **WHEN** the id does not match any user
- **THEN** the system SHALL return HTTP 404 Not Found

### Requirement: Ban User
The system SHALL expose `POST /admin/users/:id/ban` (JWT + AdminGuard) that sets `isBanned: true` on the target and revokes all of that user's refresh tokens.

#### Scenario: Ban sets flag and revokes tokens
- **WHEN** an admin bans a user
- **THEN** the user's `isBanned` SHALL become `true` and all their refresh tokens SHALL be revoked

#### Scenario: Banned user cannot log in
- **WHEN** a banned user attempts `/auth/login` with correct credentials
- **THEN** the system SHALL reject the login

#### Scenario: Banned account cannot be switched into
- **WHEN** a switch targets a banned account
- **THEN** the switch SHALL be rejected (as enforced by the account-switching capability)

### Requirement: Unban User
The system SHALL expose `POST /admin/users/:id/unban` (JWT + AdminGuard) that sets `isBanned: false`.

#### Scenario: Unban clears flag
- **WHEN** an admin unbans a user
- **THEN** the user's `isBanned` SHALL become `false` and the user MAY log in again

### Requirement: Dashboard Statistics
The system SHALL expose `GET /admin/stats` (JWT + AdminGuard) returning platform counts: total users by `accountType`, total business accounts by `verificationStatus` (pending/verified/rejected), the pending count, and the banned count.

#### Scenario: Stats returned
- **WHEN** an admin calls `GET /admin/stats`
- **THEN** the system SHALL return counts of users by account type, businesses by verification status, the pending total, and the banned total

### Requirement: Safe search and unified pagination for user listing

`GET /admin/users` search input SHALL be escaped before `RegExp` construction, pagination SHALL use shared `PaginationDto` (`page` default 1, `limit` default 20, max 100), and ban operations SHALL accept optional `{ reason, durationDays }` in the body (reason stored in audit log, duration enforced as `bannedUntil` when provided).

#### Scenario: Special characters in search are escaped
- **WHEN** an admin searches for `.*+?`
- **THEN** the search SHALL match literally those characters and SHALL NOT throw or over-match

#### Scenario: Pagination bounds enforced
- **WHEN** `GET /admin/users?page=0&limit=200` is called
- **THEN** the system SHALL return 400 validation error

#### Scenario: Ban with reason is audited
- **WHEN** an admin bans with `{ reason: "spam" }`
- **THEN** `isBanned` SHALL become true and the audit entry payload SHALL contain the reason

