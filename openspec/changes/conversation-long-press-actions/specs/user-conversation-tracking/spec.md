## MODIFIED Requirements

### Requirement: Per-User Conversation State Tracking
The system SHALL track per-user state for each conversation using a UserConversation document, including unread state and the user's private conversation preferences: `pinnedAt` (Date | null), `mutedUntil` (Date | null), `clearedAt` (Date | null) and `hiddenAt` (Date | null).

#### Scenario: User joins a conversation
- **WHEN** a user is added to a conversation (direct or group)
- **THEN** system creates a UserConversation document with `unreadCount: 0`, `lastReadMessageId: null`, `joinedAt: now()`, `pinnedAt: null`, `mutedUntil: null`, `clearedAt: null`, `hiddenAt: null`

#### Scenario: Existing documents without pref fields
- **WHEN** a UserConversation document created before this change is read
- **THEN** missing `pinnedAt`, `mutedUntil`, `clearedAt`, `hiddenAt` SHALL be treated as `null` (no data migration required)

#### Scenario: User leaves or is removed
- **WHEN** a user leaves or is removed from a conversation
- **THEN** system deletes the corresponding UserConversation document

#### Scenario: Conversation deleted
- **WHEN** a conversation is deleted
- **THEN** system deletes all UserConversation documents for that conversation

## ADDED Requirements

### Requirement: New message un-hides a cleared conversation
Whenever a message is persisted in a conversation, the system SHALL set `hiddenAt = null` on every UserConversation of that conversation in the same code path that increments unread counts, so a conversation cleared by a member reappears in that member's list.

#### Scenario: Hidden conversation receives a message
- **WHEN** user A has `hiddenAt` set on conversation C and any member sends a message to C
- **THEN** A's UserConversation for C has `hiddenAt = null` and C appears in A's next `GET /conversations` response, while `clearedAt` is unchanged

#### Scenario: Index supports prefs queries
- **WHEN** the UserConversation schema is loaded
- **THEN** it defines a compound index `{ userId: 1, pinnedAt: -1 }` for the pinned-group query, declared only via `schema.index()`
