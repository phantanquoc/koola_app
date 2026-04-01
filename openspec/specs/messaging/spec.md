# messaging Specification

## Purpose
TBD - created by archiving change backend-messages. Update Purpose after archive.
## Requirements
### Requirement: Send Text Message
The system SHALL allow authenticated users to send text messages within a conversation they are a member of.

#### Scenario: Send text message to direct conversation
- **WHEN** user calls POST /conversations/:conversationId/messages with `{ type: "text", content: "Hello!" }`
- **THEN** system stores message with `status: "sent"`, `senderId`, `createdAt`, emits `new_message` via WebSocket to all other online participants in the conversation, sends FCM push to offline participants

#### Scenario: Send text message to group conversation
- **WHEN** user sends a message to a group with 50 members
- **THEN** system stores message, broadcasts `new_message` to 49 other participants (online → WebSocket, offline → FCM push)

#### Scenario: Send message to non-conversation
- **WHEN** user sends a message to a conversation they are not a member of
- **THEN** system returns HTTP 403 Forbidden

#### Scenario: Send empty message
- **WHEN** user sends a message with empty or whitespace-only content
- **THEN** system returns HTTP 400 Bad Request with validation error

#### Scenario: Send message exceeding length
- **WHEN** user sends a message with content longer than 10,000 characters
- **THEN** system returns HTTP 400 Bad Request with validation error "Message exceeds 10,000 character limit"

### Requirement: Send Media Message
The system SHALL allow authenticated users to send image and file messages by referencing a pre-uploaded media URL.

#### Scenario: Send image message
- **WHEN** user calls POST /conversations/:conversationId/messages with `{ type: "image", content: "", mediaUrl: "https://minio...", mediaMimeType: "image/jpeg", mediaSize: 2048000 }`
- **THEN** system stores message with type "image", broadcasts `new_message` to other participants

#### Scenario: Send file message
- **WHEN** user calls POST /conversations/:conversationId/messages with `{ type: "file", content: "report.pdf", mediaUrl: "...", mediaMimeType: "application/pdf", mediaSize: 52428800 }`
- **THEN** system stores message with type "file", broadcasts `new_message` to other participants

#### Scenario: Send file exceeding 100MB
- **WHEN** user attempts to send a file message with mediaSize > 104857600 bytes
- **THEN** system returns HTTP 400 Bad Request with validation error "File exceeds 100MB limit"

#### Scenario: Send file with unsupported type
- **WHEN** user attempts to send a file with MIME type not in allowed list
- **THEN** system returns HTTP 400 Bad Request with validation error "File type not supported"

### Requirement: Message Status Flow
The system SHALL track message status as `sent → delivered → read`.

#### Scenario: Mark message as delivered
- **WHEN** recipient client receives `new_message` WebSocket event and the message `status` is "sent"
- **THEN** client sends `mark_read` WebSocket event; server updates message status to "delivered"

#### Scenario: Mark message as read
- **WHEN** recipient user opens the conversation and the message is visible in viewport
- **THEN** client sends `mark_read` WebSocket event with messageId; server updates message status to "read", emits `message_read` to original sender

#### Scenario: Read receipt event to sender
- **WHEN** user B reads user A's message
- **THEN** user A's client receives `message_read` WebSocket event containing `{ messageId, readBy: userId }`

### Requirement: Message Pagination
The system SHALL return messages in cursor-based pages, 20 messages per page, ordered by `createdAt` descending (newest first).

#### Scenario: Load first page
- **WHEN** user calls GET /conversations/:conversationId/messages?limit=20
- **THEN** system returns last 20 messages (newest at index 0), with `nextCursor: <messageId>` if more exist

#### Scenario: Load next page
- **WHEN** user calls GET /conversations/:conversationId/messages?cursor=<lastMessageId>&limit=20
- **THEN** system returns messages older than the cursor, ordered by createdAt descending

### Requirement: Delete Message
The system SHALL allow a message sender to delete their own message within 24 hours of sending.

#### Scenario: Delete own message
- **WHEN** sender calls DELETE /conversations/:conversationId/messages/:messageId within 24h
- **THEN** system marks message as `deleted: true`, replaces content with "This message was deleted", emits `message_deleted` event to all conversation participants

#### Scenario: Delete message after 24h
- **WHEN** sender attempts to delete a message older than 24 hours
- **THEN** system returns HTTP 403 Forbidden with message "Messages can only be deleted within 24 hours"

#### Scenario: Non-sender tries to delete
- **WHEN** a user who is not the sender attempts to delete a message
- **THEN** system returns HTTP 403 Forbidden

### Requirement: Rate Limiting
The system SHALL enforce a rate limit of 60 messages per minute per user.

#### Scenario: Rate limit exceeded
- **WHEN** user sends more than 60 messages within 1 minute
- **THEN** system returns HTTP 429 Too Many Requests with message "Rate limit exceeded: 60 messages per minute"

### Requirement: Typing Indicator
The system SHALL broadcast typing events when a user starts or stops typing in a conversation.

#### Scenario: Broadcast typing start
- **WHEN** client emits `typing_start` with `conversationId` via WebSocket
- **THEN** server broadcasts `user_typing` event to all other participants in that conversation

#### Scenario: Broadcast typing stop
- **WHEN** client emits `typing_stop` with `conversationId` via WebSocket
- **THEN** server stops broadcasting typing for that user in that conversation

#### Scenario: Typing timeout
- **WHEN** user sends `typing_start` but sends no message within 5 seconds
- **THEN** server automatically emits `typing_stop` for that user in that conversation

