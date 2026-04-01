## Why

The chat application needs a conversations layer — the organizational unit for messages. Without this, messages have no context, group chats cannot exist, and the messaging system cannot function.

## What Changes

- **Conversation entity**: MongoDB document representing a chat (1-on-1 or group)
- **UserConversation tracking**: per-user unread count and last-read position
- **Direct conversation logic**: auto-create or reuse existing 1-on-1 conversations
- **Group management**: create, add members, remove members, leave, update metadata
- **System messages**: auto-insert messages when members are added/removed from groups
- **Message schema shared**: created here to avoid circular dependency with MessagesModule

## Capabilities

### New Capabilities

- `conversation-entity`: Conversation document with type (direct/group), members with roles, last message tracking, and timestamps
- `user-conversation-tracking`: UserConversation document per user/conversation pair for unread count and last-read tracking
- `direct-conversation-logic`: Find or create direct conversations between two users; prevent duplicate direct conversations
- `group-management`: Create groups, add/remove members, leave groups, update group name/avatar; admin role enforcement
- `system-messages`: Insert type="system" messages into conversations when members join or leave

### Modified Capabilities

_(None — conversations is a new module)_

## Impact

- **New schemas**: `Conversation`, `UserConversation`, `Message` (shared)
- **New API endpoints**: 8 REST endpoints under `/api/conversations`
- **Dependency**: `ConversationsModule` imports `UsersModule` (to verify users exist when adding members)
- **Shared schema**: `Message` schema created here, imported by `MessagesModule` when that module is implemented
- **Message module**: Will create messages referencing the `Message` schema created here
