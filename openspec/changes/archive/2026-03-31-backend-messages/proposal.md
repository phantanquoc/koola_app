## Why

The chat application needs a messages layer — sending, listing, deleting, and real-time status tracking. Without messages, the conversations layer has no content. This module also handles typing indicators and message deletion within a 24h window.

## What Changes

- **MessagesModule**: REST API for sending, listing, and deleting messages
- **TypingService**: In-memory 5-second timeout for typing indicators
- **Message status flow**: sent → delivered → read tracking
- **Rate limiting**: 60 messages/minute enforced via NestJS Throttler
- **Cursor pagination**: efficient message history loading
- **Soft delete**: messages marked deleted within 24h, content replaced

## Capabilities

### New Capabilities

- `message-sending`: Send text and media messages within a conversation
- `message-listing`: Cursor-based pagination for message history
- `message-deletion`: Soft delete by sender within 24 hours
- `message-status`: Track and update sent/delivered/read status
- `typing-indicators`: Broadcast typing start/stop events with server-side 5s timeout

### Modified Capabilities

- `conversation-management` (ConversationsModule): MessagesModule updates `lastMessageAt` and `lastMessagePreview` when a message is sent
- `real-time-gateway` (future): Will subscribe to MessagesService emit methods for WebSocket broadcasting

## Impact

- **New API endpoints**: 3 REST endpoints under `/conversations/:conversationId/messages`
- **WebSocket events**: `new_message`, `mark_read`, `typing_start`, `typing_stop`, `message_deleted`, `message_read`
- **Dependency**: `MessagesModule` imports `ConversationsModule` (for membership check) and `UsersModule`
- **External**: No Firebase FCM now — `NotificationsModule` will handle push in future
- **Rate limiting**: Reuses existing `ThrottlerModule` (60 req/min)
