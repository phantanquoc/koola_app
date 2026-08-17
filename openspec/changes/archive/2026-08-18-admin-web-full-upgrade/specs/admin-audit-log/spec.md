## ADDED Requirements

### Requirement: Admin audit log records every admin mutation

The system SHALL record an `AdminAuditLog` entry for every admin-mutating operation (business approve/reject, user ban/unban, message soft-delete, story takedown, report resolve/dismiss, commerce CRUD, broadcast). Each entry SHALL include `actorId`, `action` enum, `targetType`, `targetId`, `createdAt`, and redacted `payload`.

#### Scenario: Mutation creates audit entry
- **WHEN** an admin successfully calls a mutating admin endpoint
- **THEN** a new `AdminAuditLog` document SHALL exist with the actor, action, target, and timestamp

#### Scenario: Audit list is admin-only and paginated
- **WHEN** an admin calls `GET /admin/audit-logs`
- **THEN** the system SHALL return a paginated list (page/limit) ordered by `createdAt` desc
- **AND** a non-admin SHALL receive 403

#### Scenario: Read-only operations do not create audit entries
- **WHEN** an admin calls a read-only admin endpoint (`GET /admin/*` list/detail/stats/analytics/health)
- **THEN** no audit entry SHALL be created
