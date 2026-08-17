# admin-report-inbox Specification

## Purpose
TBD - created by archiving change admin-web-full-upgrade. Update Purpose after archive.
## Requirements
### Requirement: Admin report inbox lifecycle

The system SHALL maintain a `Report` collection (`reporterId`, `targetType` in `message|story|user|conversation`, `targetId`, `reason`, `status` in `pending|resolved|dismissed`, `createdAt`, `resolvedAt`, `resolvedBy`). The system SHALL expose `GET /admin/reports` (paginated, filterable by `status` and `targetType`) and `POST /admin/reports/:id/resolve` and `POST /admin/reports/:id/dismiss` (AdminGuard, idempotent, write audit log).

#### Scenario: List pending reports
- **WHEN** an admin calls `GET /admin/reports?status=pending`
- **THEN** only pending reports SHALL be returned ordered by `createdAt` desc

#### Scenario: Resolve transitions status
- **WHEN** an admin calls `POST /admin/reports/:id/resolve`
- **THEN** the report `status` SHALL become `resolved`, `resolvedAt` and `resolvedBy` SHALL be set, and an audit entry SHALL be written

#### Scenario: Dismiss transitions status
- **WHEN** an admin calls `POST /admin/reports/:id/dismiss`
- **THEN** the report `status` SHALL become `dismissed` and an audit entry SHALL be written

#### Scenario: Seed provides initial data
- **WHEN** `scripts/seed-admin-reports.ts` is run
- **THEN** at least 20 mock reports SHALL exist covering multiple targetTypes

