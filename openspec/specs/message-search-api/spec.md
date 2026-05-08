# message-search-api Specification

## Purpose
Defines the backend API and data model for full-text message search, allowing authenticated users to search across messages in their conversations.

## Requirements
### Requirement: Message Full-Text Search Endpoint
The backend SHALL expose `GET /messages/search?q=&limit=&cursor=` that returns messages matching the query, scoped to conversations the authenticated user is a member of.

#### Scenario: Valid search returns results
- **WHEN** an authenticated user calls `GET /messages/search?q=hello` where `q` is 2+ characters
- **THEN** server returns `{ items: MessageSearchItem[], nextCursor: string | null, total: number }` with HTTP 200
- **AND** all returned messages have `conversationId` values from conversations where the user is a member

#### Scenario: Query too short is rejected
- **WHEN** an authenticated user calls `GET /messages/search?q=h` (1 character)
- **THEN** server returns HTTP 400 with a validation error indicating minimum length of 2

#### Scenario: Query too long is rejected
- **WHEN** the `q` parameter exceeds 100 characters
- **THEN** server returns HTTP 400 with a validation error indicating maximum length of 100

#### Scenario: Deleted messages excluded
- **WHEN** a message matching the query has `deleted: true`
- **THEN** that message MUST NOT appear in search results

#### Scenario: Messages from non-member conversations excluded
- **WHEN** a message matches the query but belongs to a conversation where the requesting user is NOT a member
- **THEN** that message MUST NOT appear in search results

#### Scenario: Pagination via cursor
- **WHEN** the response contains `nextCursor` and the client calls `GET /messages/search?q=hello&cursor=<value>`
- **THEN** server returns the next page of results starting after the cursor position

#### Scenario: No results
- **WHEN** no messages match the query within the user's accessible conversations
- **THEN** server returns `{ items: [], nextCursor: null, total: 0 }` with HTTP 200

#### Scenario: Unauthenticated request rejected
- **WHEN** request is made without a valid JWT in the Authorization header
- **THEN** server returns HTTP 401

### Requirement: Message Text Index
The MongoDB `messages` collection SHALL have a text index on the `content` field to support efficient full-text search.

#### Scenario: Text index enables search queries
- **WHEN** `MessagesService.searchMessages()` performs a `$text` query on the messages collection
- **THEN** the query uses the text index and does NOT perform a collection scan

#### Scenario: Index uses default_language none for diacritic preservation
- **WHEN** the text index is defined
- **THEN** it is created with `{ default_language: 'none' }` to disable stemming and preserve Vietnamese characters as-is

### Requirement: Message Search Response Shape
Each item in the search results SHALL include sufficient context for the client to render a result row without additional API calls.

#### Scenario: Response item fields
- **WHEN** the endpoint returns a message search result
- **THEN** each item SHALL contain: `messageId`, `conversationId`, `conversationName`, `senderId`, `senderDisplayName`, `content` (full, max 500 chars stored), `createdAt` (ISO 8601)

#### Scenario: Content field is plain text only
- **WHEN** a matching message has `type` other than `text` (e.g., image, file)
- **THEN** that message MAY be excluded from results OR returned with an empty `content` snippet
- **AND** media-only messages SHALL NOT appear in results if `content` is empty string
