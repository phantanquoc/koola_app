# backend-messages — Plan Breakdown

## Module: `backend-messages`

**Spec source:** `openspec/changes/chat-app/specs/messaging/spec.md`
**Existing code:**
- `chat-backend/src/messages/message.schema.ts` ← shared, created by conversations module
- `chat-backend/src/conversations/conversations.service.ts` ← already creates system messages via Message model

---

## Fog Points (Questions / Unresolved Issues)

### Fog 1: WebSocket Gateway — Exists or Needs Creating?

**Spec says:** Messages emit `new_message`, receive `mark_read`, handle `typing_start/stop`. But `real-time-gateway` module (#9) hasn't been implemented yet.

**Fog:** Should MessagesModule implement its own Socket.io gateway, or defer to the future `gateway` module?

| Option | Description |
|--------|-------------|
| **A — MessagesModule own gateway** | Create `src/messages/messages.gateway.ts` in this module. Keeps messages self-contained. Later, `gateway` module can import it or events can be forwarded. |
| **B — Defer all WebSocket to gateway module** | Only implement REST endpoints here. WebSocket events (`new_message`, `typing_*`) are stubs that will be wired by gateway module. MessagesService has `emitToConversation()` placeholder. |
| **C — Shared event bus** | MessagesModule emits via an `EventEmitter2`, gateway module subscribes. Cleanest decoupling. Requires adding EventEmitterModule. |

**Decision needed: B** — `real-time-gateway` is a future module. Implementing WS now would duplicate gateway work. Use approach B: MessagesService has interface-ready methods that return data structures, gateway module will handle actual socket broadcasting later. Keep messages logic in REST for now.

**Action:** Add `emitNewMessage()`, `emitMessageDeleted()`, `emitTyping()` methods to MessagesService that return payload objects (not socket calls). Comment as "TODO: wire to gateway module".

---

### Fog 2: FCM Push — How Are Offline Notifications Sent?

**Spec says:** "sends FCM push to offline participants" when a message is sent.

**Fog:** FCM/Push module (#8: `backend-notifications`) doesn't exist yet. No Firebase Admin SDK is configured.

**Resolution:** Don't send FCM now. MessagesService records message + updates conversation metadata. The `backend-notifications` module will handle FCM delivery by subscribing to message events. Add a comment in code: "TODO: FCM push to be handled by NotificationsModule".

---

### Fog 3: Typing Indicator Timeout — Server-Side or Client-Side?

**Spec says:** "server automatically emits `typing_stop` for that user if no message within 5 seconds".

**Fog:** NestJS/Socket.io doesn't have a built-in "inactivity timeout" per user per room.

| Option | Description |
|--------|-------------|
| **A — Server-side timer** | Store `{ userId, conversationId, timeoutId }` in an in-memory Map. On `typing_start`: clear old timer, set new 5s timer → emit `typing_stop`. |
| **B — Client-side** | Don't implement server timeout. Client is responsible for sending `typing_stop` or re-sending `typing_start`. |
| **C — Debounce client** | Client sends `typing_start` every 3s; server broadcasts. No explicit stop needed — gateway's "presence" module handles it. |

**Decision: A** — Spec explicitly requires server-side 5s timeout. Implement with in-memory Map. Note: In production (Redis-backed gateway), this needs Redis TTL. For now, use in-memory.

**Action:** Create `src/common/services/typing.service.ts` (shared) or `src/messages/typing.service.ts`. Store `Map<conversationId:userId, NodeJS.Timeout>`.

---

### Fog 4: Cursor-Based Pagination — What Cursor Value?

**Spec says:** "cursor = last message ID", "return messages older than cursor".

**Fog:** `createdAt` timestamps could collide for same-millisecond messages. Using message `_id` (ObjectId) is more reliable because ObjectIds encode timestamp and are sortable.

**Resolution:** Use `createdAt` for simplicity since `conversationId + createdAt` compound index already exists. Cursor value is the `createdAt` timestamp of the last message in the current page. Use `$lt: new Date(cursor)` query.

**Action:** `GET /messages?cursor=<ISO timestamp>&limit=20` — parse cursor as Date, query `{ conversationId, createdAt: { $lt: cursorDate }, deleted: false }`.

---

### Fog 5: Read Receipt — WebSocket Only or REST Too?

**Spec says:** "client sends `mark_read` WebSocket event". But should REST `mark as read` be supported for clients that prefer polling?

**Resolution:** Only WebSocket for `mark_read`. REST endpoint not needed. MessagesService has `markAsRead(messageId, userId)` method called by gateway's socket handler.

---

### Fog 6: File Type Allowlist — What Types Are Supported?

**Spec says:** "unsupported MIME type → 400". No specific list given.

**Resolution:** Use a common allowlist for security:
```
Images: image/jpeg, image/png, image/gif, image/webp, image/svg+xml
Documents: application/pdf
Archives: application/zip, application/x-rar-compressed
```

**Action:** Hardcode allowlist in DTO validator. Future: config-driven.

---

## Architecture Decisions (Locked)

### Architecture 1: MessagesModule Depends on ConversationsModule

Messages must verify user is a member of the conversation before sending. This means injecting `ConversationsService` (which in turn imports `UsersModule`). This creates a dependency chain: `MessagesModule → ConversationsModule → UsersModule`. No circular dependency if MessagesModule does NOT re-export Conversation schemas.

### Architecture 2: Message Schema Is Already in `src/messages/`

`message.schema.ts` was created by `backend-conversations`. MessagesModule imports from there directly.

### Architecture 3: Throttler Already Configured

`app.module.ts` has `ThrottlerModule` with `short: 60 req/60s`. Use `@Throttle(1, 1)` (1 request per second) applied via controller method decorator to enforce the 60/min rate.

### Architecture 4: TypingService In-Memory

```typescript
// Map<conversationId:userId, NodeJS.Timeout>
private typingTimers = new Map<string, NodeJS.Timeout>();

private getTypingKey(convId: string, userId: string) {
  return `${convId}:${userId}`;
}
```

---

## API Endpoints (from spec)

```
POST   /conversations/:conversationId/messages            Send message (text/media)
GET    /conversations/:conversationId/messages             List messages (cursor paginated)
DELETE /conversations/:conversationId/messages/:messageId  Delete own message (within 24h)
```

WebSocket events (handled by gateway, but MessagesService has emit methods):
- `new_message` → broadcast by gateway
- `mark_read` → handled by gateway → calls MessagesService.markAsRead()
- `typing_start` → gateway → calls MessagesService.emitTyping()
- `typing_stop` → gateway → calls MessagesService.emitTypingStop()
- `message_deleted` → broadcast by gateway

---

## Files to Create

```
src/
├── messages/
│   ├── messages.module.ts
│   ├── messages.service.ts        ← send, list, delete, markAsRead, emit methods
│   ├── messages.controller.ts     ← REST endpoints
│   ├── dto/
│   │   ├── send-message.dto.ts    ← type, content, mediaUrl, mediaMimeType, mediaSize
│   │   └── list-messages.dto.ts   ← cursor, limit query params
│   └── typing.service.ts          ← in-memory typing timeout (5s)
```

---

## Edge Cases (compiled from spec)

| Case | Expected Behavior |
|------|-------------------|
| Send to non-member | 403 Forbidden |
| Empty content | 400 "content is required" |
| Content > 10,000 chars | 400 "Message exceeds 10,000 character limit" |
| File > 100MB | 400 "File exceeds 100MB limit" |
| Unsupported MIME type | 400 "File type not supported" |
| Delete after 24h | 403 "Messages can only be deleted within 24 hours" |
| Delete others' message | 403 Forbidden |
| Delete already-deleted | 200 OK (idempotent — mark deleted: true, content already replaced) |
| Rate limit exceeded | 429 "Rate limit exceeded: 60 messages per minute" |
| Typing start > 5s | Auto `typing_stop` emitted by server |

---

## Status

- [ ] Specs reviewed — ✅
- [ ] Fog 1 resolved — ✅ (B: defer WS to gateway module, MessagesService has emit interfaces)
- [ ] Fog 2 resolved — ✅ (no FCM now, handled by NotificationsModule)
- [ ] Fog 3 resolved — ✅ (A: server-side 5s timeout via in-memory Map)
- [ ] Fog 4 resolved — ✅ (cursor = createdAt timestamp)
- [ ] Fog 5 resolved — ✅ (WS only for mark_read)
- [ ] Fog 6 resolved — ✅ (hardcoded allowlist)
- [ ] Zero-fog checklist — PASSED
