## ADDED Requirements

### Requirement: Call log record creation
The system SHALL create a call log record in MongoDB when a call session is initiated. The record SHALL capture: sessionId, initiatorId, targetUserId, conversationId, callType (audio|video), status, startedAt, answeredAt (nullable), endedAt (nullable), duration (seconds, 0 if unanswered).

#### Scenario: Call log created on session initiation
- **WHEN** the gateway creates a new call session
- **THEN** a call log document is inserted with status 'initiated' and startedAt set to the current timestamp

### Requirement: Call log status update on terminal event
The system SHALL update the call log status when a session reaches a terminal state. Status values: ended (answered and completed), missed (timeout), declined (callee declined), busy (callee busy or double-call), failed (ICE failure after retries). When the call was answered, answeredAt and endedAt SHALL be set and duration computed.

#### Scenario: Call ends normally after being answered
- **WHEN** a call session transitions to 'ended' and answeredAt is set
- **THEN** the log is updated with status 'ended', endedAt = now, duration = (endedAt - answeredAt) in seconds

#### Scenario: Call is missed (timeout)
- **WHEN** the server timeout fires and marks the session 'missed'
- **THEN** the log is updated with status 'missed', endedAt = now, duration = 0

#### Scenario: Call is declined
- **WHEN** the callee emits 'call_decline'
- **THEN** the log is updated with status 'declined', endedAt = now, duration = 0

#### Scenario: Call is busy
- **WHEN** the callee busy check fires or double-call is detected
- **THEN** the log is updated with status 'busy', endedAt = now, duration = 0

### Requirement: Call history REST endpoint
The system SHALL expose GET /call-logs (JWT-protected) that returns a paginated list of call log records where the authenticated user is either the initiator or the target. The endpoint SHALL accept query parameters page (default 1) and limit (default 20, max 50).

#### Scenario: User retrieves their call history
- **WHEN** an authenticated user calls GET /call-logs?page=1&limit=20
- **THEN** the response contains an array of call log records and pagination metadata (total, page, limit)

#### Scenario: Unauthenticated request rejected
- **WHEN** GET /call-logs is called without a valid JWT
- **THEN** the server responds with 401 Unauthorized

#### Scenario: Pagination beyond available records
- **WHEN** the user requests a page beyond the total number of records
- **THEN** the response returns an empty array with correct pagination metadata

### Requirement: Call log indexes
The call-logs collection SHALL have indexes on: sessionId (unique), initiatorId, targetUserId, startedAt (descending) to support efficient history queries.

#### Scenario: History query executes efficiently
- **WHEN** a user with many call records queries GET /call-logs
- **THEN** the query uses the initiatorId/targetUserId index and returns within acceptable latency
