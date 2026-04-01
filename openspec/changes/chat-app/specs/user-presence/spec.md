## ADDED Requirements

### Requirement: Presence Tracking
The system SHALL track each user's online/offline status in real time.

#### Scenario: User comes online
- **WHEN** authenticated user establishes WebSocket connection
- **THEN** system sets user `isOnline: true`, `lastSeen: now()` in database, broadcasts `presence_update` event to all connected contacts

#### Scenario: User goes offline
- **WHEN** authenticated user's WebSocket connection is closed or times out (no heartbeat for 30s)
- **THEN** system sets user `isOnline: false`, `lastSeen: now()` in database, broadcasts `presence_update` event to all connected contacts

#### Scenario: WebSocket heartbeat
- **WHEN** connected user sends a heartbeat ping every 15 seconds
- **THEN** system updates `lastSeen` timestamp; if heartbeat missed for 30s, connection is considered dead and user marked offline

#### Scenario: Query user presence
- **WHEN** API receives GET /users/:userId/presence
- **THEN** system returns `{ isOnline: boolean, lastSeen: ISO8601 }` for that user

#### Scenario: Query multiple users' presence
- **WHEN** API receives GET /users/presence?ids=id1,id2,id3
- **THEN** system returns array of `{ userId, isOnline, lastSeen }` for requested users

### Requirement: Last Seen Privacy
The system SHALL display last seen timestamp only to conversation participants.

#### Scenario: Non-participant cannot see last seen
- **WHEN** user who is not in any conversation with target user calls GET /users/:userId/presence
- **THEN** system returns HTTP 403 Forbidden

### Requirement: Presence Events via WebSocket
The system SHALL broadcast presence changes to all clients currently in a shared conversation.

#### Scenario: Broadcast on presence change
- **WHEN** user A's presence changes (online/offline)
- **THEN** system finds all conversations containing user A, broadcasts `presence_update` event to all other participants currently connected
