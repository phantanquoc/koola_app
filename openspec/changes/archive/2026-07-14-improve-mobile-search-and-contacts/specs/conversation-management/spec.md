## ADDED Requirements

### Requirement: Group member selection does not expose raw identifiers
The mobile group administration UI SHALL allow authorized admins to find and select users without manually entering database user IDs.

#### Scenario: Admin opens add-member flow
- **WHEN** a group admin activates add member
- **THEN** the UI SHALL present searchable user identity results with name and avatar
- **AND** raw user IDs SHALL not be requested as user input
- **AND** the search pattern SHALL reuse the existing `GroupCreateModal` search component/pattern where applicable

#### Scenario: Search returns existing members
- **WHEN** search results include the current user or an existing group member
- **THEN** those users SHALL be excluded or visibly non-selectable

#### Scenario: Admin confirms selected members
- **WHEN** one or more eligible users are selected and the admin confirms
- **THEN** the client SHALL submit their IDs through the existing authorized member API
- **AND** duplicate submissions SHALL be prevented while the request is pending

#### Scenario: Add-member request fails
- **WHEN** the API rejects or fails the request
- **THEN** selections SHALL remain recoverable
- **AND** a clear Vietnamese error and retry path SHALL be shown
