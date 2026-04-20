## Context

APP_KOOLA is a NestJS 11 + React Native 0.76.9 chat application. The backend uses MongoDB (Mongoose), Redis (ioredis), Socket.IO, and Firebase Cloud Messaging. A recent code analysis surfaced three issues requiring immediate attention before the next feature sprint:

1. `CallSessionService.hasExistingSession` runs `KEYS call:*` on every `call_initiate` WebSocket event. Redis `KEYS` is O(N) over all keys and blocks the event loop for the duration of the scan — a production blocker once key count grows.
2. `ConversationsService` (~500 lines) is imported by 5 services and 2 gateways. Five `forwardRef` circular dependency chains have been introduced to work around this coupling. Circular DI is fragile and breaks Nest's module graph introspection.
3. The `Message.status` field is a single enum. In group conversations, the first read marks the message as READ for all members, which is logically incorrect and breaks read-receipt UI for groups.

All three issues are backend-only. The mobile client is not modified in this sprint.

## Goals / Non-Goals

**Goals:**
- Eliminate the blocking Redis `KEYS` scan in `hasExistingSession` with an O(1) Set-based lookup.
- Introduce `MembershipService` and `UnreadService` as narrow-interface sub-services inside `ConversationsModule` to break at least 2 `forwardRef` circular dependency chains.
- Add `readBy: string[]` to the `Message` schema and update the read endpoint and socket event to support per-member read tracking in group conversations.
- Preserve full backward compatibility with the current mobile client build (no breaking REST or socket payload changes).

**Non-Goals:**
- Mobile client changes (read receipt UI for groups is a follow-up sprint).
- Full elimination of all 5 `forwardRef` cycles (2 are targeted; the remaining 3 may require further refactoring out of scope here).
- Backfilling `readBy` on historical messages (default empty array is acceptable).
- Any changes to the `ConversationsService` public REST API.

## Decisions

### P1: Redis Set index for active call sessions

**Decision**: Maintain two Redis Sets — `active_calls:{initiatorId}` and `active_calls:{targetId}` — storing `sessionId` values. `hasExistingSession` reads the user's Set (O(1) SMEMBERS + HGETALL per session) instead of scanning all keys.

**Why Set over Sorted Set**: A sorted set would allow TTL-based expiry queries but adds score-management complexity. Session TTL is already enforced by the hash key TTL; Set membership just needs to reflect live sessions. Set is simpler and sufficient.

**Why not SCAN**: `SCAN` is non-blocking but still O(N) over the full keyspace in aggregate. With per-user Sets the lookup is bounded to sessions belonging to that user (typically 0 or 1).

**TTL strategy**: On `createSession`, call `EXPIRE active_calls:{userId} <session_ttl>` after adding the member. On `endSession`/`cleanupSession`, call `SREM active_calls:{userId} <sessionId>` for both initiator and target. If the process crashes, the Set TTL matches the session TTL, so stale entries expire on their own without a cleanup job.

**Race condition on concurrent end**: Two concurrent `endSession` calls both call `SREM` — SREM is idempotent, so duplicate removals are safe.

**`hasExistingSession` algorithm**:
1. Read `SMEMBERS active_calls:{userId}`.
2. For each sessionId, `HGETALL call:{sessionId}`.
3. Return true if any hash has matching `conversationId` AND (`initiatorId` = targetId or `targetId` = targetId field).
4. Return false if Set is empty (common case — O(1) with no round-trips beyond the SMEMBERS).

### P2: MembershipService and UnreadService extraction

**Decision**: Place both services in `chat-backend/src/conversations/services/` and export them from `ConversationsModule`. Downstream modules import `ConversationsModule` (already do) and destructure `MembershipService` / `UnreadService` from it.

**What stays in ConversationsService**: Conversation CRUD (`create`, `findById`, `list`, `update`, `addMember`, `removeMember`, `delete`). All methods that mutate the Conversation document remain. The new services only read conversation membership data or mutate the `unreadCounts` subdocument.

**How forwardRef cycles break**:
- Before: `NotificationsModule` needs `ConversationsService` (to call `incrementUnreadCount`) AND `MessagesModule` needs `ConversationsService` (to call `verifyMember`). Both import each other creating the cycle.
- After: `UnreadService` is exported from `ConversationsModule`. `NotificationsModule` imports `ConversationsModule` and uses `UnreadService` directly. `MessagesModule` imports `ConversationsModule` and uses `MembershipService`. Neither needs to import the other for these concerns, breaking the MessagesModule↔NotificationsModule and NotificationsModule↔ConversationsModule cycles.

**What is NOT changed in ConversationsModule's outward interface**: The full `ConversationsService` remains and is still injectable by modules that need conversation CRUD. No public methods are removed.

**MembershipService contract**:
- `verifyMember(userId, conversationId): Promise<Conversation>` — identical behavior to current `ConversationsService.verifyMember`: throws `NotFoundException` (HTTP 404) with message "Conversation not found" if user is not a member. Returns populated Conversation document.
- `isMember(userId, conversationId): Promise<boolean>` — returns false instead of throwing.
- `getMemberIds(conversationId): Promise<string[]>` — returns array of userId strings for all members.
- `getSharedConversationIds(userAId, userBId): Promise<string[]>` — returns conversation IDs where both users are members (used by WebRTC to check call eligibility).

**UnreadService contract**:
- `incrementUnreadCount(conversationId, excludeUserIds: string[]): Promise<void>` — increments `unreadCounts.{userId}` for all members not in `excludeUserIds`.
- `resetUnreadCount(userId, conversationId): Promise<void>` — sets `unreadCounts.{userId}` to 0.
- `getUnreadCount(userId, conversationId): Promise<number>` — returns current count.

### P3: Per-member read tracking — keep `status` AND add `readBy`

**Decision**: Add `readBy: string[]` as an additive field. Do not remove `status`.

**Why keep `status`**: Existing mobile clients read `status` to render delivery indicators for direct conversations. Removing it would break the current build. `status` continues to represent the aggregate state and remains authoritative for direct (1:1) conversations and for `sending`/`sent`/`delivered` states.

**Why `readBy` instead of a separate `ReadReceipt` collection**: A subdocument array on the message is simpler to query and avoids an extra collection join when loading messages. Group conversations are limited to 100 members, so the array stays small.

**Schema change**:
```
readBy: [{ type: String }]  // default: [], indexed as multikey
```
MongoDB multikey index on `readBy` enables efficient queries like "messages where userId is NOT in readBy".

**Read endpoint behavior** (`POST /conversations/:id/messages/read`):
- Accepts optional `upToTimestamp` in body.
- Pushes `currentUserId` into `readBy` using `$addToSet` (idempotent) on all messages in the conversation where:
  - `senderId !== currentUserId`
  - `readBy` does not already contain `currentUserId` (enforced by `$addToSet`)
  - `createdAt <= upToTimestamp` (or all if not provided)
- For direct conversations ONLY: also sets `status = "read"` where `senderId !== currentUserId` for backward compat.
- Does NOT change `status` for group conversations.

**Socket event shape** (additive extension of existing `message_read`):
```json
{
  "messageId": "string",
  "conversationId": "string",
  "readBy": ["userId1", "userId2"],
  "readAt": "2026-04-20T00:00:00.000Z"
}
```
The field `readBy` (array) replaces the legacy `readBy: userId` (string) from the existing spec — this is handled in the spec delta as a MODIFIED requirement. Existing clients that only read `messageId` and `conversationId` are unaffected.

**`GET /conversations/:id/messages` response**: Each message object now includes `readBy: string[]`. This is an additive field; existing clients ignore unknown fields.

**Migration**: None required. `readBy` defaults to `[]`. Historical messages are not backfilled — clients treat absence of a userId in `readBy` as "not read", which is correct for historical messages.

**Follow-up mobile sprint**: The mobile client needs to be updated to display per-member read avatars in group conversations. This is explicitly out of scope for this backend sprint.

## Risks / Trade-offs

- **[Risk] P1 — Set TTL drift**: If session creation succeeds but the `EXPIRE` on the Set fails (network blip), the Set entry persists beyond session TTL. → Mitigation: Wrap `SADD` + `EXPIRE` in a Lua script or pipeline to make them atomic. Alternatively, accept that the stale entry will be cleaned up next time `endSession` is called for that user.

- **[Risk] P2 — Partial refactor leaves some forwardRef cycles**: Only 2 of 5 cycles are targeted. The remaining cycles (`AuthModule↔UsersModule`, `GatewayModule↔MessagesModule`, `NotificationsModule↔UsersModule`) may still cause issues in edge cases. → Mitigation: Document remaining cycles in a follow-up task. They do not affect runtime correctness today but should be addressed in a subsequent refactor sprint.

- **[Risk] P3 — Large `readBy` arrays in high-traffic groups**: At 100 members max and ~20B per userId string, the maximum `readBy` overhead per message is ~2KB — acceptable for MongoDB document limits. Multikey index adds index overhead proportional to array cardinality. → Mitigation: Accept as a known trade-off given the 100-member group cap.

- **[Trade-off] P3 — `status` field ambiguity in groups**: After this change, `status` may show `"delivered"` for a group message even when some members have read it (because only direct conversations update `status` to `"read"`). → This is acceptable because the mobile client will use `readBy` for group read state in the follow-up sprint. Until then, the `status` field is not shown per-member in groups anyway.

## Migration Plan

### P1 (isolated deploy — no data migration)
1. Deploy updated `CallSessionService`.
2. Existing call sessions in Redis have no Set entries; they expire by hash TTL (no orphan risk).
3. New sessions immediately use the Set index.
4. Rollback: redeploy previous version; old code ignores Set keys (no schema conflict).

### P2 (refactor deploy — no data migration)
1. Create `MembershipService` and `UnreadService` files.
2. Update `ConversationsModule` exports.
3. Refactor consumers one module at a time, running tests after each.
4. Deploy as a single release (no phased rollout needed — no schema changes).
5. Rollback: redeploy previous version; no data state was changed.

### P3 (additive schema — no migration required)
1. Deploy schema change with `readBy: []` default — MongoDB adds the field on next document write; existing documents are unaffected.
2. Deploy updated read endpoint and socket event.
3. Existing clients ignore the new `readBy` field on message objects; they continue reading `status` for direct conversations.
4. Rollback: redeploy previous version; `readBy` arrays remain in the database but are not read. Safe to leave in place; can be dropped with a one-off migration at any time.

## Open Questions

- Should `SADD` + `EXPIRE active_calls:{userId}` be wrapped in a Lua script for atomicity, or is a pipeline sufficient? (Recommendation: pipeline is sufficient given session creation is already idempotent.)
- Should the remaining 3 `forwardRef` cycles be tracked as a formal follow-up change, or handled ad hoc? (Recommendation: create a follow-up `chore` change after this sprint ships.)
- For the `message_read` socket event, should the full `readBy` array (all readers so far) be emitted, or just the delta (new reader)? (Decision above sends the full array for simplicity; clients replace their local state. This is acceptable given group size cap.)
