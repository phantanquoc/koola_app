## ADDED Requirements

### Requirement: Admin story takedown

Moments stories SHALL support an admin takedown `POST /admin/stories/:id/takedown` (AdminGuard) that soft-deletes/hides the story from feed/ring views while retaining the record for audit, and emits a story takedown event.

#### Scenario: Takedown hides from feed
- **WHEN** an admin calls `POST /admin/stories/:id/takedown`
- **THEN** subsequent `GET /moments/feed` SHALL not include the taken-down story

#### Scenario: Unknown story
- **WHEN** an admin takedowns a nonexistent story id
- **THEN** the system SHALL return 404
