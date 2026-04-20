## Why

Three independently discovered issues in the NestJS chat backend pose a production risk and block future feature work: a blocking Redis `KEYS` scan called on every WebRTC call initiation degrades the entire cache tier under load; a 500-line `ConversationsService` coupled to five services and two gateways through five circular `forwardRef` chains makes the module graph unsafe to extend; and a single `status` enum field on messages makes group read receipts logically incorrect. Addressing these together as a hardening sprint eliminates P1 production risk and unblocks clean module growth before the next feature wave.

## What Changes

- **P1 — Redis call-session index**: Replace the blocking `KEYS call:*` scan in `CallSessionService.hasExistingSession` with an O(1) Redis Set lookup. A per-user `active_calls:{userId}` Set is maintained on session create/end, eliminating the full-keyspace scan on every `call_initiate` event.

- **P2 — MembershipService extraction**: Extract `verifyMember`, `isMember`, `getMemberIds`, and `getSharedConversationIds` from `ConversationsService` into a new `MembershipService` at `chat-backend/src/conversations/services/membership.service.ts`. Downstream consumers (`MessagesService`, `ChatGateway`, `WebrtcGateway`, `MediaService`, `NotificationsService`) are refactored to depend on `MembershipService` for membership checks.

- **P2 — UnreadService extraction**: Extract `incrementUnreadCount`, `resetUnreadCount`, and `getUnreadCount` from `ConversationsService` into a new `UnreadService` at `chat-backend/src/conversations/services/unread.service.ts`. Both new services are exported from `ConversationsModule`. This eliminates at least two `forwardRef` circular dependency chains (MessagesModule↔NotificationsModule and NotificationsModule↔ConversationsModule).

- **P3 — Per-member read tracking**: Add `readBy: string[]` field (MongoDB multikey index, default `[]`) to the `Message` schema. The existing `POST /conversations/:id/messages/read` endpoint pushes the caller's userId into `readBy` on qualifying messages instead of updating the global `status` field for group conversations. For direct conversations, `status = READ` is also set for backward compatibility. The `message_read` WebSocket event payload is extended additively with `readBy: string[]` and `readAt: Date`. `GET /conversations/:id/messages` returns `readBy` on each message. The `status` field is not removed.

## Capabilities

### New Capabilities

- `webrtc-call-signaling`: WebRTC call session lifecycle — initiation, active-session deduplication, termination, and the Redis-backed indexing strategy that enforces O(1) duplicate-session detection.

### Modified Capabilities

- `messaging`: Per-member read tracking requirement — `readBy` array field on messages, updated read endpoint behavior for groups vs. direct conversations, extended `message_read` socket event payload, and `readBy` in message list responses.

## Impact

- **chat-backend/src/webrtc/services/call-session.service.ts**: `hasExistingSession`, `createSession`, `endSession`, `cleanupSession` all change.
- **chat-backend/src/conversations/**: New `services/membership.service.ts` and `services/unread.service.ts`; `ConversationsModule` exports updated; `ConversationsService` retains conversation CRUD only.
- **chat-backend/src/messages/**: `MessagesService`, `messages.controller.ts`, `messages-sync.controller.ts`, `message.schema.ts` all change.
- **chat-backend/src/gateway/chat.gateway.ts**, **webrtc/webrtc.gateway.ts**: Import `MembershipService` / `UnreadService` instead of `ConversationsService` for the relevant concerns.
- **chat-backend/src/notifications/**: `NotificationsService` refactored to use `MembershipService` and `UnreadService`.
- **No breaking REST or WebSocket payload changes**: all modifications are additive. Existing mobile clients continue to work without update.
- **No data migration required**: `readBy` field defaults to empty array; no backfill of historical messages is needed.
