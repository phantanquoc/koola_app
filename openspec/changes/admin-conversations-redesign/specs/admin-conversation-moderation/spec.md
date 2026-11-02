# Spec Delta

## MODIFIED Requirements

### Requirement: Admin can list and inspect conversations

The system SHALL expose admin-only `GET /admin/conversations` (paginated, optional `search` on name, optional `type` filter, optional `hasPendingReport` filter, optional `minMembers`/`maxMembers` filters, ordered by `lastMessageAt` desc) and `GET /admin/conversations/:id` (detail with members, createdAt, lastMessageAt, recent messages preview) using safe projections. List rows SHALL carry `memberCount` and SHALL NOT carry the raw `members` array; the detail response SHALL keep returning full member summaries.

#### Scenario: Paginated conversation list
- **WHEN** an admin calls `GET /admin/conversations?page=1&limit=20`
- **THEN** the system SHALL return paginated conversations ordered by `lastMessageAt` desc with nulls last

#### Scenario: Search filters conversations
- **WHEN** an admin calls `GET /admin/conversations?search=Koola`
- **THEN** results SHALL be filtered to conversations whose name contains the term (case-insensitive, escaped regex)

#### Scenario: Detail shows members
- **WHEN** an admin calls `GET /admin/conversations/:id`
- **THEN** the response SHALL include member summaries (displayName, avatar, accountType) and recent messages
- **AND** a non-existent id SHALL return 404

#### Scenario: Non-admin blocked
- **WHEN** a non-admin calls `GET /admin/conversations`
- **THEN** the system SHALL return 403

#### Scenario: List rows report a member count without shipping members
- **WHEN** an admin calls `GET /admin/conversations`
- **THEN** each row SHALL include a `memberCount` equal to the conversation's member total
- **AND** each row SHALL omit the raw `members` array
- **WHEN** an admin calls `GET /admin/conversations/:id`
- **THEN** the response SHALL still include the full member list

## ADDED Requirements

### Requirement: Conversation list filtering, sorting and date range

The conversation list SHALL accept `hasMedia`, `minReports`, `activeFrom`/`activeTo`, and `createdFrom`/`createdTo` filters, and SHALL accept only allow-listed `sort` values `recent`, `created`, `reported`, and `members`. Unknown `sort` values SHALL be rejected with 400. Stats and export SHALL apply the same filter set as the list.

#### Scenario: Media filter
- **WHEN** an admin calls `GET /admin/conversations?hasMedia=true`
- **THEN** only conversations containing at least one media message SHALL be returned

#### Scenario: Creation date range filter
- **WHEN** an admin calls `GET /admin/conversations?createdFrom=2026-10-01&createdTo=2026-10-31`
- **THEN** only conversations created within that inclusive range SHALL be returned

#### Scenario: Allow-listed sort applied
- **WHEN** an admin calls `GET /admin/conversations?sort=members`
- **THEN** results SHALL be ordered by member count descending and pagination SHALL remain stable across pages

#### Scenario: Unknown sort rejected
- **WHEN** an admin calls `GET /admin/conversations?sort=password`
- **THEN** the system SHALL return 400

### Requirement: Conversation rows expose pending-report count and age

Each conversation row SHALL include `pendingReportCount` and, when at least one report is pending, `oldestPendingReportAt` set to the `createdAt` of that conversation's oldest pending report.

#### Scenario: Row with a pending report
- **WHEN** a conversation has at least one pending report
- **THEN** its row SHALL report `pendingReportCount` >= 1 and an `oldestPendingReportAt` equal to the oldest such report's `createdAt`

#### Scenario: Row with no pending report
- **WHEN** a conversation has no pending report
- **THEN** its row SHALL report `pendingReportCount` of 0 and SHALL omit `oldestPendingReportAt`

### Requirement: Conversation list statistics endpoint

The system SHALL expose admin-only `GET /admin/conversations/stats` returning counts for the list's primary views (all, pending-report, group, direct, has-media, active within 24h) computed with the same filter semantics as the list.

#### Scenario: Counts match the list
- **WHEN** an admin calls `GET /admin/conversations/stats`
- **THEN** the `all` count SHALL equal `total` from `GET /admin/conversations` under identical filters

#### Scenario: Non-admin blocked
- **WHEN** a non-admin calls `GET /admin/conversations/stats`
- **THEN** the system SHALL return 403

### Requirement: Conversation CSV export

The system SHALL expose admin-only `GET /admin/conversations/export` applying the same filters as the list, capping the result set at 500 rows, and reporting `{ data, total, truncated }` so the caller can tell that more rows exist than were exported.

#### Scenario: Export caps at 500 rows
- **WHEN** an admin calls `GET /admin/conversations/export` for a filter matching 1200 conversations
- **THEN** the system SHALL return at most 500 rows, `total` of 1200, and `truncated: true`

#### Scenario: Export honors the active filter
- **WHEN** an admin calls `GET /admin/conversations/export?type=group`
- **THEN** every returned row SHALL be a group conversation

#### Scenario: Non-admin blocked
- **WHEN** a non-admin calls `GET /admin/conversations/export`
- **THEN** the system SHALL return 403