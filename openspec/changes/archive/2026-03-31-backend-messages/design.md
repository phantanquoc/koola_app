## Context

NestJS backend at `src/messages/`. The messages module handles sending, listing, deleting messages, and typing indicators. `message.schema.ts` already exists (created by conversations module). WebSocket gateway (`real-time-gateway`) is a future module — MessagesModule provides emit interfaces that gateway will consume.

## Goals / Non-Goals

**Goals:**
- Send text and media messages with validation (length, file size, MIME type)
- List messages with cursor-based pagination (20 per page)
- Soft delete messages within 24 hours
- Message status tracking (sent → delivered → read)
- Typing indicators with 5-second server-side timeout
- Rate limiting (60 messages/minute per user)

**Non-Goals:**
- Actual WebSocket socket handling (deferred to `gateway` module)
- FCM push notifications (deferred to `notifications` module)
- Message search (future)
- Message editing (future)

## Decisions

### D1: Defer WebSocket to Gateway Module

**Decision**: MessagesModule does NOT create a Socket.io gateway. Instead, `MessagesService` provides typed emit methods that return payload objects. The future `real-time-gateway` module will handle actual socket I/O.

**Rationale**: Gateway module (#9) will own all WebSocket connections. If MessagesModule creates its own gateway, there would be two Socket.io servers. Keeping WS out of MessagesModule avoids duplication and ensures gateway can aggregate all events cleanly.

**Risk**: WS events won't work until gateway is implemented. Acceptable for MVP.

### D2: TypingService In-Memory

**Decision**: TypingService uses a `Map<string, NodeJS.Timeout>` keyed by `conversationId:userId` for the 5-second timeout.

**Rationale**: NestJS doesn't have built-in inactivity timers. In-memory is fine for single-instance dev. Production (Redis-backed) will need Redis TTL.

### D3: Cursor = `createdAt` Timestamp

**Decision**: Cursor is the ISO `createdAt` timestamp of the last message on the current page. Query: `{ createdAt: { $lt: cursor } }`.

**Rationale**: `conversationId + createdAt` compound index already exists on Message schema. ObjectId would also work (sortable) but `createdAt` is more explicit and human-readable for debugging.

### D4: Rate Limiting via NestJS Throttler

**Decision**: Reuse the existing `ThrottlerModule` with `short: 60/60s`. Apply `@Throttle(60, 60)` decorator on the send-message endpoint.

**Rationale**: Throttler is already configured in `app.module.ts`. No extra dependencies needed.

### D5: File MIME Type Allowlist

**Decision**: Hardcode allowlist: `image/jpeg, image/png, image/gif, image/webp, image/svg+xml, application/pdf, application/zip, application/x-rar-compressed`.

**Rationale**: Common, safe types. Config-driven allowlist is a future improvement.

## Risks / Trade-offs

| Risk | Impact | Mitigation |
|------|--------|------------|
| Typing timers leak memory | Low | `clearTimeout` on send, on `typing_stop`, on gateway disconnect |
| WS not working until gateway | Medium | REST works fully; WS is enhancement |
| FCM not working until notifications | Low | Messages stored; users see on next app open |
| Rate limit per-throttle vs per-user | Low | Throttler tracks by IP+userId by default |

## Migration Plan

Greenfield module — no migration needed. First deploy creates no new collections (reuses `messages` collection from conversations).

If rollback needed: remove the module import from AppModule.
