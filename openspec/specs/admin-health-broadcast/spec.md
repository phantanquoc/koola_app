# admin-health-broadcast Specification

## Purpose
TBD - created by archiving change admin-web-full-upgrade. Update Purpose after archive.
## Requirements
### Requirement: Health probes and operator broadcast

The system SHALL expose `GET /admin/health` (AdminGuard) returning liveness of `mongodb`, `redis`, `minio`, and `coturn` via the existing `HealthModule` checks with `freshness` timestamps, and `POST /admin/broadcast` (AdminGuard, audit-logged, body `{ title, body }` validated) that emits a socket system event to all connected clients (and FCM when configured) and returns delivery counts.

#### Scenario: Health reflects backing services
- **WHEN** an admin calls `GET /admin/health`
- **THEN** the response SHALL include each service status (`ok`|`degraded`|`down`) and freshness data

#### Scenario: Broadcast emits system event
- **WHEN** an admin calls `POST /admin/broadcast` with valid title/body
- **THEN** a `system_broadcast` socket event SHALL be emitted and an audit entry SHALL be written

#### Scenario: Broadcast validates input
- **WHEN** `POST /admin/broadcast` is called with missing title or body
- **THEN** the system SHALL return 400

#### Scenario: Broadcast is admin-only
- **WHEN** a non-admin calls `POST /admin/broadcast`
- **THEN** the system SHALL return 403

