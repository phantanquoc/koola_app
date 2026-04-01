## ADDED Requirements

### Requirement: Per-User Conversation State Tracking
The system SHALL track per-user state for each conversation using a UserConversation document.

#### Scenario: User joins a conversation
- **WHEN** a user is added to a conversation (direct or group)
- **THEN** system creates a UserConversation document with `unreadCount: 0`, `lastReadMessageId: null`, `joinedAt: now()`

#### Scenario: User leaves or is removed
- **WHEN** a user leaves or is removed from a conversation
- **THEN** system deletes the corresponding UserConversation document

#### Scenario: Conversation deleted
- **WHEN** a conversation is deleted
- **THEN** system deletes all UserConversation documents for that conversation

### Requirement: Unread Count Increment
The system SHALL increment a user's unread count when a new message arrives from another user.

#### Scenario: New message from other user
- **WHEN** a message with `senderId !== recipientId` is stored in a conversation
- **THEN** system increments `unreadCount` for all UserConversation documents in that conversation except the sender's own UserConversation

#### Scenario: New message from self
- **WHEN** a user sends a message to their own conversation (e.g. a note to self)
- **THEN** no unread count is incremented

### Requirement: Unread Count Reset on Read
The system SHALL reset the unread count when a user marks messages as read.

#### Scenario: Mark conversation as read
- **WHEN** user marks a conversation as read via mark_read WebSocket event or API
- **THEN** system sets `unreadCount: 0` and `lastReadMessageId: <messageId>` on the user's UserConversation document

#### Scenario: Partial read (mark last N messages read)
- **WHEN** user reads only the last 5 messages (not all unread)
- **THEN** system sets `lastReadMessageId` to the Nth latest message and `unreadCount` to the count of messages newer than that

### Requirement: Unread Count on Conversation List
The system SHALL return the correct `unreadCount` for the current user on the conversation list.

#### Scenario: Conversation list includes unread count
- **WHEN** GET /conversations is called
- **THEN** each conversation includes `unreadCount` from the user's UserConversation document
