## ADDED Requirements

### Requirement: Bulk verification operations

`POST /admin/businesses/bulk-approve` and `POST /admin/businesses/bulk-reject` SHALL accept `{ ids: string[], rejectionReason?: string }` and apply approve/reject to each business account atomically per-item (partial success permitted with per-item result), each item SHALL write an audit entry.

#### Scenario: Bulk approve
- **WHEN** an admin posts `{ ids: ["id1","id2"] }` to `POST /admin/businesses/bulk-approve`
- **THEN** each valid business SHALL become `verified` and the response SHALL contain per-item status

#### Scenario: Bulk reject requires reason
- **WHEN** an admin posts to `POST /admin/businesses/bulk-reject` without `rejectionReason`
- **THEN** the system SHALL return 400 and SHALL NOT change any account
