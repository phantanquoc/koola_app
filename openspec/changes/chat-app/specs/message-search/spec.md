## ADDED Requirements

### Requirement: Search Messages in Conversation
The system SHALL allow users to search message content within a specific conversation.

#### Scenario: Search within conversation
- **WHEN** user calls `GET /conversations/:conversationId/messages/search?q=<query>&limit=20`
- **THEN** server returns messages where `conversationId` matches, `content` matches regex (case-insensitive) of query, `deleted: false`, ordered by `createdAt` descending

#### Scenario: Search with pagination
- **WHEN** user searches with cursor `GET /conversations/:conversationId/messages/search?q=hello&cursor=<messageId>&limit=20`
- **THEN** server returns messages older than cursor with matching query

#### Scenario: Search with special characters
- **WHEN** user searches for a query containing regex special characters (e.g., `hello?`, `foo*`)
- **THEN** server escapes special characters before building regex, returns results

### Requirement: Global Message Search
The system SHALL allow users to search messages across all their conversations.

#### Scenario: Global search
- **WHEN** user calls `GET /messages/search?q=<query>&limit=20`
- **THEN** server returns messages where user is a participant, content matches query, ordered by relevance (if available) or `createdAt` descending; each result includes `conversationId` and `conversationName`

#### Scenario: Global search pagination
- **WHEN** user calls `GET /messages/search?q=<query>&cursor=<messageId>&limit=20`
- **THEN** server returns results older than cursor

### Requirement: Search Result Preview
The system SHALL return message preview with surrounding context.

#### Scenario: Search result includes context
- **WHEN** server returns search results
- **THEN** each result includes `content` (highlighted with matching terms), `senderId`, `senderName`, `createdAt`, `conversationId`

### Requirement: Search Index
The system SHALL use MongoDB text index for efficient message content search.

#### Scenario: Text index on messages collection
- **WHEN** messages collection is created
- **THEN** a compound text index exists on `{ content: "text" }` for fast full-text search queries

#### Scenario: Search excludes deleted messages
- **WHEN** user searches for messages
- **THEN** server filters out messages where `deleted: true`
