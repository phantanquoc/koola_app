# message-sync-api Specification

## Purpose

Formalises the backend `GET /messages/sync` endpoint that returns messages changed at or after a caller-supplied `since` ISO timestamp across every conversation the caller is a member of. The endpoint existed prior to this capability; this spec adds tombstone projection for soft-deleted messages and a supporting Mongoose compound index, while preserving all existing semantics and backwards compatibility with the legacy `useMessageSync` mobile hook.

## Requirements

### Requirement: Global-Since Delta Sync Endpoint

The backend SHALL expose `GET /messages/sync` that returns messages changed at or after a caller-supplied `since` ISO timestamp across every conversation the caller is a member of, ordered ascending by `updatedAt`. The endpoint already exists with this shape; this requirement formalises it.

#### Scenario: Caller pulls deltas across all their conversations in one call

- **WHEN** the client calls `GET /messages/sync?since=<iso>`
- **AND** the caller is authenticated
- **THEN** the response SHALL contain every message in any conversation the caller is a member of with `updatedAt >= since`
- **AND** results SHALL be ordered by `updatedAt` ascending
- **AND** results SHALL be paginated when the result exceeds a backend-defined batch size

#### Scenario: Empty since defaults to epoch zero

- **WHEN** the client omits the `since` query parameter
- **THEN** the endpoint SHALL behave as if `since=1970-01-01T00:00:00Z`
- **AND** the response SHALL still page via `nextCursor` / `hasMore`

#### Scenario: Membership is enforced server-side

- **WHEN** the response is built
- **THEN** only messages from conversations the caller is a current member of SHALL be returned
- **AND** no metadata about non-member conversations SHALL leak into the response

#### Scenario: Cursor pagination is opaque and idempotent

- **WHEN** the result is paginated
- **THEN** the response SHALL include `nextCursor` and `hasMore`
- **AND** the cursor SHALL be opaque to clients
- **AND** repeating a request with the same `since` and `cursor` SHALL produce the same page

### Requirement: Tombstones for Soft-Deleted Messages

The endpoint SHALL include records for messages that have been soft-deleted (`deleted = true` on the canonical schema) so that local copies on clients can be removed.

#### Scenario: Soft-deleted messages are included with deleted flag set

- **GIVEN** message M was soft-deleted in conversation C
- **AND** M's `updatedAt` is at or after the caller's `since`
- **AND** the caller is a member of C
- **WHEN** the caller calls `/messages/sync`
- **THEN** the response SHALL include M with at minimum `id`, `conversationId`, `updatedAt`, and `deleted: true`
- **AND** content fields MAY be omitted to reduce payload size

#### Scenario: Per-user soft-delete (deletedFor[]) tombstones are also surfaced

- **GIVEN** message M had the caller's id appended to `deletedFor[]`
- **AND** M's `updatedAt` is at or after the caller's `since`
- **WHEN** the caller calls `/messages/sync`
- **THEN** the response SHALL include M with `deletedFor` containing the caller's id
- **AND** the client SHALL treat M as locally deleted for that user

### Requirement: Index for Delta Queries

The MongoDB `messages` collection SHALL have a compound index that supports the delta query without colliding with the existing `(conversationId, createdAt DESC)` list-earlier index.

#### Scenario: (conversationId, updatedAt) compound index exists

- **GIVEN** the messages collection in MongoDB
- **WHEN** the application starts and Mongoose synchronises indexes
- **THEN** a compound index on `(conversationId, updatedAt)` SHALL exist alongside the existing indexes
- **AND** the delta query SHALL use this index according to `explain()`

### Requirement: Existing List Endpoint Preserved for Load-Earlier

The existing `GET /conversations/:id/messages` cursor-paginated endpoint SHALL remain available unchanged for the "load earlier" path, so clients can fetch history older than their oldest local message without using the sync endpoint.

#### Scenario: Load-earlier flow uses listMessages

- **WHEN** the client needs messages older than its oldest local message in conversation C
- **THEN** the client SHALL call `GET /conversations/C/messages?cursor=<oldestLocalCursor>&limit=<n>`
- **AND** the endpoint SHALL behave identically to today

### Requirement: Bidirectional Message Context Retrieval Around a Target Message

The backend SHALL support loading a bounded window of messages centered on a specified target message within a conversation, so clients can scroll to an arbitrary message without unbounded backward pagination.

#### Scenario: Client requests context around a known message

- **WHEN** the client calls `GET /conversations/:id/messages?around=<messageId>&limit=N`
- **AND** the caller is an authorized member of the conversation
- **THEN** the response SHALL return up to N/2 messages before and N/2 messages after the target, plus the target itself
- **AND** messages SHALL be ordered by `createdAt` ascending

#### Scenario: Target message is near the beginning of the conversation

- **WHEN** fewer than N/2 messages exist before the target
- **THEN** the response SHALL return all available prior messages and fill the remainder from messages after the target (up to the total limit)

#### Scenario: Target message does not exist or caller lacks access

- **WHEN** the `around` messageId is not found in the conversation or the caller is not a member
- **THEN** the endpoint SHALL return a 404 or appropriate error
- **AND** no message data SHALL be leaked

#### Scenario: Around parameter coexists with existing pagination

- **WHEN** `around` is provided
- **THEN** the backward-only `before`/`after` cursor parameters SHALL be ignored for that request (no 400 error)
- **AND** the response SHALL include `hasBefore` and `hasAfter` booleans indicating whether more messages exist in each direction

### Requirement: Backwards Compatibility With Existing Mobile Hook

The endpoint changes SHALL NOT break the existing `useMessageSync` mobile hook, which already consumes `GET /messages/sync` with `{ since, cursor, limit }` and stores `lastSyncAt` in AsyncStorage.

#### Scenario: Existing client continues to work without modification

- **GIVEN** a build of the mobile client that pre-dates this change
- **WHEN** the user runs that build against an updated backend
- **THEN** `useMessageSync.sync()` SHALL continue to return paginated message lists
- **AND** the additional tombstone rows in the response SHALL be tolerated by the existing client (extra fields are non-breaking)
