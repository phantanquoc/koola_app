# admin-moments-moderation Specification

## Purpose
TBD - created by archiving change admin-web-full-upgrade. Update Purpose after archive.
## Requirements
### Requirement: Admin moments moderation and catalog reads

The system SHALL expose `GET /admin/stories` (paginated, optional `authorId` filter) and `POST /admin/stories/:id/takedown` (soft-delete/hide, emit story event, audit-logged), plus `GET /admin/music-tracks` with admin CRUD `POST|PATCH|DELETE /admin/music-tracks` and read-only `GET /admin/audience-lists`.

#### Scenario: Story takedown hides content
- **WHEN** an admin calls `POST /admin/stories/:id/takedown`
- **THEN** the story SHALL be hidden from feed/ring (soft-deleted) and remain auditable

#### Scenario: Music track admin CRUD
- **WHEN** an admin creates/updates/deletes a music track via `/admin/music-tracks`
- **THEN** the catalog SHALL reflect the change and non-admin SHALL receive 403

#### Scenario: Audience lists are read-only for admin
- **WHEN** an admin calls `GET /admin/audience-lists`
- **THEN** the system SHALL return paginated audience lists without exposing secrets

