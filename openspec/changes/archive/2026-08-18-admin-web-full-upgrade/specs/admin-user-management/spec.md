## ADDED Requirements

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
