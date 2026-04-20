## ADDED Requirements

### Requirement: WebSocket Connection
The system SHALL maintain a persistent WebSocket connection for authenticated users.

#### Scenario: Authenticated connection
- **WHEN** user connects to WebSocket with valid JWT as query param `?token=<access_token>`
- **THEN** server authenticates user, registers socket in namespace `/chat`, joins user to their personal room `user:<userId>`, marks user online

#### Scenario: Connection with invalid token
- **WHEN** user connects with expired or invalid JWT
- **THEN** server closes connection with code 4001 and message "Authentication failed"

#### Scenario: Connection heartbeat
- **WHEN** connected client sends a `ping` event every 15 seconds
- **THEN** server responds with `pong` event and updates user's `lastSeen`

#### Scenario: Heartbeat timeout
- **WHEN** server does not receive a `ping` from client for 30 seconds
- **THEN** server closes the connection, marks user offline, broadcasts `presence_update`

### Requirement: Join Conversation Room
The system SHALL subscribe a connected user to real-time events for a specific conversation.

#### Scenario: Join conversation room
- **WHEN** client emits `join_conversation` with `conversationId`
- **THEN** server verifies user is a member, joins socket to room `conversation:<conversationId>`, sends `joined` acknowledgment

#### Scenario: Join non-member conversation
- **WHEN** client emits `join_conversation` for a conversation they are not a member of
- **THEN** server emits `error` event with code 403 and message "Not a member of this conversation"

#### Scenario: Leave conversation room
- **WHEN** client emits `leave_conversation` with `conversationId`
- **THEN** server removes socket from room `conversation:<conversationId>`

### Requirement: Send Message Event
The system SHALL handle the `send_message` WebSocket event.

#### Scenario: Send message via WebSocket
- **WHEN** client emits `send_message` with `{ conversationId, content, type: "text" }`
- **THEN** server validates, saves message to MongoDB, emits `message_ack` to sender with full message object, broadcasts `new_message` to all other participants in conversation room, queues FCM for offline participants

#### Scenario: Send message with invalid conversationId
- **WHEN** client emits `send_message` with a non-existent `conversationId`
- **THEN** server emits `error` event with code 404

#### Scenario: Message deduplication
- **WHEN** client sends a message with `clientMessageId` and the same `clientMessageId` was already processed within the last 5 minutes
- **THEN** server returns the original message via `message_ack` without duplicating

### Requirement: Mark Read Event
The system SHALL handle the `mark_read` WebSocket event.

#### Scenario: Mark message as read
- **WHEN** client emits `mark_read` with `{ conversationId, messageId }`
- **THEN** server updates message status to "read", emits `message_read` to original sender's personal room `user:<senderId>`

### Requirement: Presence Update Event
The system SHALL handle presence update events from clients.

#### Scenario: User updates custom status
- **WHEN** client emits `presence_update` with `{ status: "away" | "online" }`
- **THEN** server updates user status in database, broadcasts `presence_update` to all relevant conversations

### Requirement: Conversation Events
The system SHALL emit events when a conversation is modified.

#### Scenario: Member added
- **WHEN** admin adds a member to a group conversation
- **THEN** server broadcasts `conversation_updated` event to all conversation members with updated member list

#### Scenario: New conversation created for direct message
- **WHEN** first message is sent between two users creating a new conversation
- **THEN** server broadcasts `conversation_created` event to `user:<recipientId>` with the new conversation object

### Requirement: Socket Adapter (Redis)
The system SHALL use Redis as the Socket.io adapter for horizontal scaling.

#### Scenario: Multiple server instances
- **WHEN** two NestJS server instances are running
- **THEN** a message sent via WebSocket on server 1 is broadcast to clients connected to server 2 via Redis pub/sub

### Requirement: Server-to-Client Events Summary
The system SHALL emit the following server-to-client WebSocket events:

| Event Name | Payload | Trigger |
|-----------|---------|---------|
| `new_message` | `{ message }` | New message stored |
| `message_ack` | `{ messageId, status }` | Message saved, confirmed to sender |
| `message_delivered` | `{ messageId }` | Recipient received message |
| `message_read` | `{ messageId, readBy }` | Recipient read message |
| `message_deleted` | `{ messageId, conversationId }` | Message deleted |
| `user_typing` | `{ conversationId, userId, isTyping }` | User typing start/stop |
| `presence_update` | `{ userId, isOnline, lastSeen }` | User online/offline change |
| `conversation_updated` | `{ conversation }` | Conversation metadata changed |
| `conversation_created` | `{ conversation }` | New conversation created |
| `pong` | `{}` | Response to ping |
| `error` | `{ code, message }` | Error occurred |
