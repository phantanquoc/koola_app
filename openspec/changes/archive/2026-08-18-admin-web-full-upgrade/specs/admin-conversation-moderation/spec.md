## ADDED Requirements

### Requirement: Admin can list and inspect conversations

The system SHALL expose admin-only `GET /admin/conversations` (paginated, optional `search` on name/topic, optional `type` filter) and `GET /admin/conversations/:id` (detail with members, createdAt, lastMessageAt, recent messages preview) using safe projections.

#### Scenario: Paginated conversation list
- **WHEN** an admin calls `GET /admin/conversations?page=1&limit=20`
- **THEN** the system SHALL return paginated conversations ordered by `updatedAt` desc

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
