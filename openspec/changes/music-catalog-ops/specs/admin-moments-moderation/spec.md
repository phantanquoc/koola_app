# Spec Delta

## MODIFIED Requirements

### Requirement: Admin moments moderation and catalog reads

The system SHALL expose `GET /admin/stories` (paginated, optional `authorId` filter) and `POST /admin/stories/:id/takedown` (soft-delete/hide, emit story event, audit-logged), plus read-only `GET /admin/audience-lists`. Music-catalog administration (listing with stats, presigned upload, create from uploaded audio, metadata update, deactivate/restore, provenance export) is specified by the `music-catalog-admin` capability; the legacy `GET|POST|PATCH|DELETE /admin/music-tracks` shape described previously no longer applies except where `music-catalog-admin` restates it.

#### Scenario: Story takedown hides content
- **WHEN** an admin calls `POST /admin/stories/:id/takedown`
- **THEN** the story SHALL be hidden from feed/ring (soft-deleted) and remain auditable

#### Scenario: Music track admin CRUD
- **WHEN** an admin creates/updates/deletes a music track via `/admin/music-tracks`
- **THEN** the catalog SHALL reflect the change and non-admin SHALL receive 403

#### Scenario: Music catalog admin endpoints live in one capability
- **WHEN** an admin creates, updates, deactivates, restores, exports, or uploads audio for music tracks
- **THEN** the behavior SHALL match `music-catalog-admin`, and non-admin callers of those endpoints SHALL receive 403

#### Scenario: Audience lists are read-only for admin
- **WHEN** an admin calls `GET /admin/audience-lists`
- **THEN** the system SHALL return paginated audience lists without exposing secrets
