## 1. Phase 1 — P1: Redis Active-Call Index

- [x] 1.1 Add `createActiveCallIndex(initiatorId: string, targetId: string, sessionId: string, ttlSeconds: number)` helper to `CallSessionService` that pipelines `SADD active_calls:{initiatorId} {sessionId}`, `EXPIRE active_calls:{initiatorId} {ttl}`, `SADD active_calls:{targetId} {sessionId}`, `EXPIRE active_calls:{targetId} {ttl}`
- [x] 1.2 Add `removeActiveCallIndex(initiatorId: string, targetId: string, sessionId: string)` helper that calls `SREM active_calls:{initiatorId} {sessionId}` and `SREM active_calls:{targetId} {sessionId}`
- [x] 1.3 Rewrite `hasExistingSession(userId, targetId, conversationId)` to read `SMEMBERS active_calls:{userId}`, then `HGETALL call:{sessionId}` for each member, and return true if any matching conversationId+targetId pair is found — zero use of `KEYS` or `SCAN`
- [x] 1.4 Update `createSession` to call `createActiveCallIndex` immediately after writing the hash, using the same TTL as the session ← (verify: `active_calls:{userId}` Set exists in Redis after creation, has correct TTL, sessionId is present)
- [x] 1.5 Update `endSession` and `cleanupSession` to call `removeActiveCallIndex` for both initiator and target
- [x] 1.6 Write unit tests for `hasExistingSession` covering: empty Set (returns false), matching session (returns true), non-matching session same user (returns false), stale hash key missing (gracefully returns false) ← (verify: no Redis KEYS/SCAN calls appear in any test path; test coverage for all 4 cases passes)

## 2. Phase 2 — P2: Extract MembershipService

- [x] 2.1 Create `chat-backend/src/conversations/services/membership.service.ts` with `@Injectable()` class `MembershipService`; inject `ConversationModel` from Mongoose
- [x] 2.2 Implement `verifyMember(userId, conversationId): Promise<Conversation>` — copy existing logic from `ConversationsService.verifyMember` exactly (same populate, same `NotFoundException` message)
- [x] 2.3 Implement `isMember(userId, conversationId): Promise<boolean>` — query without throwing
- [x] 2.4 Implement `getMemberIds(conversationId): Promise<string[]>` — return array of userId strings for all active members
- [x] 2.5 Implement `getSharedConversationIds(userAId, userBId): Promise<string[]>` — return IDs of conversations where both are members
- [x] 2.6 Register `MembershipService` in `ConversationsModule` providers and add to exports ← (verify: `MembershipService` is injectable in `MessagesModule` test without forwardRef; no circular dependency error on Nest bootstrap)

## 3. Phase 3 — P2: Extract UnreadService

- [x] 3.1 Create `chat-backend/src/conversations/services/unread.service.ts` with `@Injectable()` class `UnreadService`; inject `ConversationModel`
- [x] 3.2 Implement `incrementUnreadCount(conversationId, excludeUserIds: string[]): Promise<void>` — copy existing logic from `ConversationsService` exactly
- [x] 3.3 Implement `resetUnreadCount(userId, conversationId): Promise<void>` — copy existing logic
- [x] 3.4 Implement `getUnreadCount(userId, conversationId): Promise<number>` — return current count for user
- [x] 3.5 Register `UnreadService` in `ConversationsModule` providers and add to exports ← (verify: `UnreadService` is injectable in `NotificationsModule` without forwardRef)
- [x] 3.6 Refactor `MessagesService` to import `MembershipService` (for `verifyMember`) and `UnreadService` (for `incrementUnreadCount`, `resetUnreadCount`) instead of the full `ConversationsService` for these concerns; retain `ConversationsService` only for conversation CRUD calls if any
- [x] 3.7 Refactor `ChatGateway` to import `MembershipService` for membership checks instead of `ConversationsService`
- [x] 3.8 Refactor `WebrtcGateway` to import `MembershipService.getSharedConversationIds` instead of `ConversationsService`
- [x] 3.9 Refactor `MediaService` to import `MembershipService.verifyMember` instead of `ConversationsService`
- [x] 3.10 Refactor `NotificationsService` to import `UnreadService` for unread operations; remove the `forwardRef` import of `ConversationsModule` if it was introduced solely to call `incrementUnreadCount` ← (verify: `forwardRef` is removed from at least MessagesModule↔NotificationsModule and NotificationsModule↔ConversationsModule; `npx nest info` bootstrap completes without circular dependency warnings)

## 4. Phase 4 — P3: Per-Member Read Tracking

- [x] 4.1 Add `readBy: [{ type: String, ref: 'User' }]` field to `message.schema.ts` with default `[]` and a MongoDB multikey index (`{ readBy: 1 }`)
- [x] 4.2 Update `MessageStatus` enum or DTOs if needed so `READ` status continues to exist for direct-conversation backward compat; document that `status = READ` is only set by the read endpoint for direct conversations
- [x] 4.3 Update `POST /conversations/:id/messages/read` handler in `messages.controller.ts`:
  - Accept optional `upToTimestamp` in request body
  - Use `$addToSet: { readBy: currentUserId }` on qualifying messages (senderId !== callerId AND createdAt <= upToTimestamp)
  - For direct conversations only: also set `status = "read"` on the same documents
  - Return `{ updated: number }` or HTTP 204
- [x] 4.4 Update `GET /conversations/:id/messages` response: include `readBy: string[]` on each message object in the serialized response ← (verify: response JSON includes `readBy` field on each message; existing fields unchanged; direct conversation read also sets `status = "read"`)
- [x] 4.5 Update the `message_read` WebSocket event emitted by the gateway to include `{ messageId, conversationId, readBy: string[], readAt: Date }` — `readBy` is the full array at time of emission
- [x] 4.6 Update `list-messages.dto.ts` or response serializer to expose `readBy` field ← (verify: socket `message_read` event payload matches `{ messageId, conversationId, readBy: string[], readAt: Date }` shape; no existing fields removed)

## 5. Phase 5 — Verification and Regression Testing

- [x] 5.1 Run `npm test` (or equivalent) in `chat-backend` — all existing tests must pass; fix any test breakage caused by refactoring (do not suppress failures)
- [ ] 5.2 Manually test P1: initiate two calls from the same user in the same conversation — second `call_initiate` must receive `call_error: SESSION_EXISTS`; verify no Redis `KEYS` call appears in backend logs
- [x] 5.3 Manually test P2: restart the Nest application and confirm no `Circular dependency detected` warnings in bootstrap logs ← (verify: zero circular dependency warnings in Nest bootstrap output; all existing REST endpoints respond correctly)
- [ ] 5.4 Manually test P3 — group conversation: create group, send 3 messages as user A, read endpoint called as user B; verify `readBy` contains user B's id, `status` is NOT changed to "read"; verify `message_read` socket event is received by user A with `readBy` array
- [ ] 5.5 Manually test P3 — direct conversation: send message as user A, read endpoint called as user B; verify `readBy` contains user B AND `status = "read"` on the message ← (verify: group read does NOT set status=read; direct read DOES set status=read; backward-compat mobile client receives status field unchanged in both flows)
- [ ] 5.6 Confirm existing mobile client (current build) connects and sends/receives messages without errors after all three phases are deployed
