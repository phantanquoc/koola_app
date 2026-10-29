## MODIFIED Requirements

### Requirement: Conversation List
The system SHALL return a paginated list of the authenticated user's visible conversations. Pinned conversations SHALL all be returned on page 1, before unpinned ones, ordered by `pinnedAt` descending; unpinned conversations SHALL be paginated after them. Conversations the user cleared and that have received no newer message (`hiddenAt` set) SHALL be omitted. Each conversation SHALL carry the caller's private prefs.

#### Scenario: Get conversation list
- **WHEN** authenticated user calls GET /conversations?page=1&limit=20
- **THEN** system returns `{ conversations: [...], hasMore: boolean, total: number }` where each conversation includes `id`, `type`, `name` (group only), `members` (summary: id, displayName, avatar), `lastMessagePreview`, `lastMessageAt`, `unreadCount`, `pinned` (boolean), `mutedUntil` (ISO string | null) and `clearedAt` (ISO string | null)

#### Scenario: Pinned conversations on page 1
- **WHEN** the user has P pinned conversations (P ≤ 5) and requests page 1 with limit L
- **THEN** the response starts with all P pinned conversations ordered by `pinnedAt` descending, followed by up to L unpinned conversations; page N ≥ 2 contains only unpinned conversations and never repeats a pinned one

#### Scenario: Hidden conversations omitted
- **WHEN** the user cleared conversation C and no message has been persisted in C since
- **THEN** C is not in any page and is not counted in `total`

#### Scenario: Pagination
- **WHEN** user requests page 2 with limit 20
- **THEN** system returns the next 20 unpinned, non-hidden conversations after page 1's unpinned window

## ADDED Requirements

### Requirement: Cleared history excluded from conversation reads
For a caller with `clearedAt` set on a conversation, the conversation details endpoint, the message list endpoint and the around-message endpoint SHALL only return messages with `createdAt > clearedAt`.

#### Scenario: Details after clear
- **WHEN** the clearer calls GET /conversations/:id after a new message arrived
- **THEN** the embedded last messages contain only messages created after `clearedAt`

#### Scenario: Load earlier stops at clear point
- **WHEN** the clearer pages older messages via the message list endpoint
- **THEN** no message with `createdAt <= clearedAt` is returned and `nextCursor` becomes null once the boundary is reached

#### Scenario: Around a pre-clear message
- **WHEN** the clearer requests the around-window for a message created at or before `clearedAt`
- **THEN** the server responds 404 as for a deleted-for-me message
