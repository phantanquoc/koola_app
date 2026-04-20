## Context

Koola Chat is a React Native 0.76 (New Architecture) app with NestJS backend, MongoDB, Redis, Socket.IO, and MinIO for media. The chat uses `react-native-gifted-chat` for message rendering. Currently messages support text, image, file, voice types with basic send/delete/read-receipts. No reactions, forwarding, pinning, or "delete for me" exists.

Key existing patterns:
- Socket events broadcast to `conversation:{id}` rooms
- Messages use optimistic UI with `clientMessageId` dedup
- GiftedChat `IMessage` extended with custom props (mediaKey, mediaType, etc.)
- Backend uses Mongoose schemas with NestJS decorators

## Goals / Non-Goals

**Goals:**
- Long press any message → bottom sheet context menu with: reaction row, Forward, Delete, Pin
- 6 fixed emoji reactions with toggle and real-time sync
- "Delete for me" (hide locally) + "Delete for everyone" (existing soft delete)
- Forward messages to 1+ conversations with indicator
- Pin/unpin messages with banner UI at top of chat
- File download directly to device Downloads folder

**Non-Goals:**
- Custom emoji reactions (emoji picker)
- Message editing
- Scheduled messages
- Pin message notification push
- Forward to external apps (Share Sheet)
- Pinch-to-zoom on pinned messages

## Decisions

**1. Context menu: Custom bottom sheet (Modal + Animated)**
- Rationale: Avoid adding @gorhom/bottom-sheet dependency. A simple Modal with Animated slide-up is sufficient for a menu with 4 actions + emoji row. GiftedChat's `onLongPress` provides the hook.
- Alternative: @gorhom/bottom-sheet — heavier, requires gesture handler setup, overkill for this use case.

**2. Reactions stored on Message document**
- `reactions: [{ userId: string, emoji: string }]` array on Message schema.
- Toggle: if user already reacted with same emoji, remove; otherwise add (replace if different emoji).
- One reaction per user per message.
- Socket event: `message_reaction` → `{ messageId, conversationId, userId, emoji, action: 'add'|'remove' }`.

**3. Delete for me: `deletedFor` array on Message**
- `deletedFor: string[]` — array of userIds who have hidden this message.
- Client filters messages where `deletedFor.includes(currentUserId)`.
- Backend endpoint: `PUT /conversations/:convId/messages/:msgId/delete-for-me`.
- No socket event needed (only affects the requesting user).

**4. Forward: copy message to target conversations**
- Frontend: Modal with conversation list + multi-select checkboxes.
- Backend: `POST /messages/forward` with `{ messageId, targetConversationIds: string[] }`.
- Creates new messages in each target with `content` prefixed by `[Chuyển tiếp]` and same mediaUrl/type.
- Each forwarded message is a new independent message (not linked to original).

**5. Pin: stored on Conversation document**
- `pinnedMessages: [{ messageId: string, pinnedBy: string, pinnedAt: Date }]` on Conversation schema.
- Any member can pin/unpin. No limit.
- Banner: shows latest pin. Tap cycles through pins (newest → oldest).
- Socket events: `message_pinned` / `message_unpinned`.
- Backend: `PUT /conversations/:convId/pin/:msgId` and `DELETE /conversations/:convId/pin/:msgId`.

**6. File download: react-native-blob-util (already installed)**
- `BlobUtil.config({ path: Downloads/filename }).fetch('GET', presignedUrl)`
- Android: `MediaCollection.copyToMediaStore` for visibility in file manager.
- Toast: "Đã tải về" on success, Alert on failure.

## Risks / Trade-offs

- **GiftedChat onLongPress override**: GiftedChat has its own long press behavior (copy text). Overriding it with custom context menu means losing the default copy. → Mitigation: Add "Copy" as an option in the context menu.
- **Reactions on large groups**: Many reactions per message could bloat the document. → Acceptable for MVP; can paginate later.
- **Forward to many conversations**: Forwarding to 20+ conversations creates 20+ messages in one request. → Add a reasonable limit (max 10 conversations per forward).
- **Pin banner re-renders**: Fetching pinned messages on every chat open. → Included in conversation details API response, no extra call needed.
