## ADDED Requirements

### Requirement: Per-Member Read Tracking
The system SHALL track which individual users have read each message, enabling accurate per-member read receipts in group conversations.

#### Scenario: Message schema includes readBy array
- **WHEN** any message is created
- **THEN** the message document contains `readBy: []` (empty array by default), stored with a MongoDB multikey index

#### Scenario: Mark messages as read in group conversation
- **WHEN** an authenticated user calls `POST /conversations/:conversationId/messages/read` in a group conversation (optionally with `{ upToTimestamp }` in body)
- **THEN** the server pushes the caller's userId into `readBy` (using `$addToSet` — idempotent) on all messages where `senderId !== callerUserId` AND `createdAt <= upToTimestamp` (or all messages if `upToTimestamp` is omitted); the `status` field is NOT modified for group conversations

#### Scenario: Mark messages as read in direct conversation
- **WHEN** an authenticated user calls `POST /conversations/:conversationId/messages/read` in a direct (1:1) conversation
- **THEN** the server pushes the caller's userId into `readBy` on qualifying messages AND also sets `status = "read"` on those messages (for backward compatibility with clients that read the single `status` field)

#### Scenario: Read operation is idempotent
- **WHEN** a user calls the read endpoint twice for the same conversation
- **THEN** the second call produces no change (userId is already in `readBy`); no error is returned

#### Scenario: Message list includes readBy
- **WHEN** authenticated participant calls `GET /conversations/:conversationId/messages`
- **THEN** each message object in the response includes `readBy: string[]` (array of userIds who have read the message); this field is additive and does not affect other fields

#### Scenario: Historical messages have empty readBy
- **WHEN** a client fetches messages created before this feature was deployed
- **THEN** those messages include `readBy: []` (empty array); clients MUST treat an empty array as "not yet read by anyone" — no backfill is performed on historical data

## MODIFIED Requirements

### Requirement: Message Status Flow
The system SHALL track message status as `sent → delivered → read` for direct conversations, and SHALL track per-member read state via the `readBy` array for group conversations.

#### Scenario: Mark message as delivered
- **WHEN** recipient client receives `new_message` WebSocket event and the message `status` is "sent"
- **THEN** client sends `mark_read` WebSocket event; server updates message status to "delivered"

#### Scenario: Mark message as read
- **WHEN** recipient user opens the conversation and the message is visible in viewport
- **THEN** client calls `POST /conversations/:conversationId/messages/read`; server adds the user's id to `readBy` on qualifying messages; for direct conversations, server also updates `status` to "read" and emits `message_read` to the original sender

#### Scenario: Read receipt event to sender
- **WHEN** user B reads user A's message (in either a direct or group conversation)
- **THEN** user A's client receives `message_read` WebSocket event containing `{ messageId: string, conversationId: string, readBy: string[], readAt: Date }` where `readBy` is the full array of userIds who have read the message at time of emission
