## ADDED Requirements

### Requirement: Call history REST endpoint
The system SHALL expose GET /call-logs (JWT-protected) that returns a paginated list of call log records where the authenticated user is either the initiator or the target. The endpoint SHALL accept query parameters page (default 1), limit (default 20, max 50), and optional conversationId (MongoId). When conversationId is provided, results SHALL be additionally filtered to that conversationId.

#### Scenario: User retrieves their call history
- **WHEN** an authenticated user calls GET /call-logs?page=1&limit=20
- **THEN** the response contains an array of call log records and pagination metadata (total, page, limit)

#### Scenario: User retrieves per-conversation history
- **WHEN** an authenticated user calls GET /call-logs?conversationId=<id>&page=1&limit=20
- **THEN** the response contains only records where conversationId equals the provided id and where the user is initiator or target, with correct total

#### Scenario: Invalid conversationId rejected
- **WHEN** GET /call-logs is called with conversationId that is not a valid MongoId
- **THEN** the server responds with 400 Bad Request (validation error)

#### Scenario: Unauthenticated request rejected
- **WHEN** GET /call-logs is called without a valid JWT
- **THEN** the server responds with 401 Unauthorized

#### Scenario: Pagination beyond available records
- **WHEN** the user requests a page beyond the total number of records
- **THEN** the response returns an empty array with correct pagination metadata
