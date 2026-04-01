# rn-chat — Proposal

## Summary
Full chat screen implementation using `GiftedChat`: message list with pagination, send/receive text messages via REST + WebSocket, optimistic updates, typing indicators, read receipts, message delete, and offline queue integration.

## Motivation
The chat screen is the core of the app. This module replaces the placeholder with a fully functional implementation using `GiftedChat`, the industry-standard library for this use case.

## Scope

### In scope
- `GiftedChat` wrapper with custom renderers (bubbles, system messages, send button)
- Message list: REST fetch with pagination (cursor-based, load earlier)
- Send: REST POST with optimistic UI (`status: sending` → `sent`)
- Receive: WebSocket `new_message` → prepend to list
- Read receipts: WebSocket `mark_read` when last message visible (debounced 500ms)
- Typing indicators: WebSocket `user_typing` display
- Message delete: REST DELETE with optimistic remove
- Offline queue: integrate `OfflineQueueContext` for queued messages

### Out of scope
- Media/image picker (deferred to `rn-media` module)
- Voice messages (deferred to Phase 2)
- Message reactions/replies (Phase 3)
- Search within chat (deferred to `rn-offline`)

## Deliverables
- `src/screens/chat/ChatScreen.tsx` — full GiftedChat implementation
- `src/screens/chat/hooks/` — useMessages, useTypingIndicator, useReadReceipts
- Replaces `src/screens/main/ChatScreen.tsx`
