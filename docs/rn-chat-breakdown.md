# rn-chat — Breakdown

## Fog Points & Resolutions

### Fog 1: Message list — use `GiftedChat` or build from scratch?
**Spec**: "Message bubbles" with sender/receiver differentiation. `react-native-gifted-chat` is already in package.json.
- **Resolution (A)**: Use `GiftedChat`. ✅ Recommended — battle-tested, handles input toolbar, load earlier messages, reply UI built-in.
- **Resolution (B)**: Build from FlatList — more control but significantly more code.
- **Resolution (A) chosen** — leverage existing dependency, focus dev time on app-specific logic.

### Fog 2: Offline queue — full implementation here or separate module?
**Spec**: `rn-offline` is a separate module (#18). This module focuses on chat screen UI.
- **Resolution**: Implement `OfflineQueueContext` integration in this module, but full persistence + retry logic is handled by `rn-offline`. Chat screen sends via queue service that abstracts the details.

### Fog 3: Send message — REST vs WebSocket?
**Spec**: Backend supports both `send_message` WebSocket event AND REST POST. The design decision (D1) is hybrid: REST for message send with reliable delivery, WebSocket for real-time events.
- **Resolution**: Use **REST POST** for send (more reliable). WebSocket for receiving events. This matches the backend architecture (D1 in design.md).

### Fog 4: Image/file send — media upload flow
**Spec**: Media files use presigned URL flow (Phase 1 media spec).
- **Resolution**: For MVP chat, image/file messages can be sent via REST with `mediaUrl` already uploaded. Image picker + upload UI goes in `rn-media` module. ChatScreen will display existing image messages but sending images is out of scope for this module.

### Fog 5: Message deduplication — client-side
**Spec**: Server returns `message_ack` with full message object. Client dedup by `clientMessageId`.
- **Resolution**: Generate `clientMessageId` (UUID) before send. On `message_ack`, match by `clientMessageId` and update local state.

### Fog 6: Read receipts — when to mark read
**Spec**: When message is visible in viewport, send `mark_read`.
- **Resolution**: Track the last visible message in FlatList. Debounce 500ms. Send `mark_read` via WebSocket. On `message_read` from server, update message status.

### Fog 7: Typing indicator display
**Spec**: Server emits `user_typing` with `{ conversationId, userId, isTyping }`.
- **Resolution**: Display "X is typing..." in a small view above the input bar. Auto-dismiss after 3s if no further typing event.

## Architecture Decisions (locked)

- **Message list**: `GiftedChat` component — handles scroll, load earlier, input toolbar
- **Send flow**: REST POST → optimistic add to list (status: `sending`) → `message_ack` → update status
- **Read receipts**: `mark_read` via WebSocket when last message visible (debounced 500ms)
- **Typing**: WebSocket `typing_start` on input change (debounced 500ms client-side), display from `user_typing`
- **Socket listeners**: `new_message`, `message_ack`, `message_read`, `user_typing`, `message_deleted`
- **Message bubbles**: `GiftedChat` default bubbles, custom render for system messages
- **Delete**: Long-press message → confirmation dialog → REST DELETE → optimistic remove

## Message Status Flow

```
optimistic → sending (local only, no server ack yet)
     ↓ message_ack received → sent
     ↓ message delivered event → delivered
     ↓ mark_read sent + received → read
```

## Files to Create

```
src/screens/chat/
  ChatScreen.tsx           ← GiftedChat wrapper with full logic
  hooks/
    useMessages.ts        ← message list state, send, pagination
    useTypingIndicator.ts  ← typing state management
    useReadReceipts.ts    ← mark_read logic
```

## Files to Modify

```
src/screens/main/ChatScreen.tsx  ← replaced with full GiftedChat implementation
```

## Components (within ChatScreen)

| Component | Purpose |
|-----------|---------|
| `renderBubble` | Custom bubble — sender blue, receiver gray |
| `renderSystemMessage` | System message: centered, gray text |
| `renderActions` | Attachment button (placeholder) |
| `renderSend` | Send button |
| `TypingIndicator` | "X is typing..." above input |
| `renderMessageImage` | Display image messages |

## Edge Cases Table

| Scenario | Handling |
|----------|----------|
| Send while offline | Queue message locally (via OfflineQueueContext), show "sending..." then "queued" |
| No messages yet | GiftedChat empty state |
| Long message text | GiftedChat bubble wraps text |
| System message | Gray centered text, no bubble |
| Image message (received) | Show image thumbnail |
| Message deleted by sender | Remove from list optimistically |
| `message_ack` timeout | Show "Failed to send" with retry |
| Duplicate message (server dedup) | Match by `clientMessageId`, ignore server dup |
| Typing while sending | Don't emit `typing_start` if message is being sent |

## Dependencies

- `react-native-gifted-chat`: already in package.json ✅
- `@react-native-community/netinfo`: already in package.json ✅
- All other dependencies present ✅
