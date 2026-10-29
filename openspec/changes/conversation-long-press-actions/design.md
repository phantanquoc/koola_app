## Context

- Backend already keeps per-user conversation state in `UserConversation` (`unreadCount`, `lastReadMessageId`, `joinedAt`), indexed `{userId, conversationId}` unique, `{conversationId}`, `{userId, joinedAt:-1}`. `getConversationList` paginates UC rows by `joinedAt` then loads conversations.
- Every persisted message path calls `UnreadService.incrementUnreadCount` (messages.service: send, forward, story reply, system/bridge paths) — the single hook point for "a new message landed".
- Push for chat messages goes `MessagesService.triggerPushNotifications → NotificationsService.sendPushNotification(recipientIds)`. Mention pushes (`sendMentionPush`, `sendPostMentionPush`) are Moments-scoped, not conversation-scoped.
- Gateway already has the user room `user:<id>` and a callback pattern (`setPinEmitCallback`, `setMembershipRevokedCallback`) so services never touch sockets directly.
- Mobile local-first: `conversations` SQLite table already has `pinned` + index `(archived, pinned DESC, last_message_at DESC)`, but REST seed (`ConversationListScreen.tsx` `fetchConversations` and `handleGroupCreated`) hard-codes `pinned:false`, `loadFromDb` drops `pinned`, and `conversationFingerprint` omits it. Migrations are an append-only string array in `services/db/migrations/index.ts` (3 entries).
- RN 0.76 Fabric native `<Modal>` collapses to 0×0 (upstream #50704) — app uses in-tree absolute overlays (`MessageContextMenu`, `KoolaConfirmHost`) instead.
- Hard user constraint: existing UI/UX untouched; additions only.

## Goals / Non-Goals

**Goals:** per-user pin (≤5) / mute (1h/8h/24h/forever) / clear-for-me, durable on server, synced across the user's devices, honoured by push, list ordering and history reads; long-press sheet + a11y actions; local-first SQLite stays the list's source of truth.

**Non-Goals:** archive, leave group from the sheet, mark unread, swipe actions, muting calls, muting Moments mention pushes, fixing the pre-existing `joinedAt` pagination ordering, any change to existing row/list/header/tab/dock visuals.

## Decisions

### D1. Store prefs on `UserConversation`, not on `ConversationDoc`
Fields `pinnedAt: Date|null`, `mutedUntil: Date|null`, `clearedAt: Date|null`, `hiddenAt: Date|null`, all `default: null`. Old docs lacking the fields read as null — no migration. New index `{ userId: 1, pinnedAt: -1 }` via `schema.index()` only.
*Alternative:* arrays on the conversation (`pinnedBy[]`, `mutedBy[]`) — rejected: conversation doc is shared/hot, arrays grow with members, and prefs are private.

### D2. `pinnedAt` timestamp instead of boolean
Gives stable ordering inside the pinned group (newest pin first) and `pinned` is derived as `pinnedAt != null`. Limit check: `countDocuments({ userId, pinnedAt: { $ne: null } })` ≥ 5 and the target is not already pinned → `BadRequestException({ code: 'PIN_LIMIT_REACHED' })`. Race of two concurrent pins can momentarily exceed 5 by one; accepted (UI-only constraint, self-corrects on unpin) — documented in Risks.

### D3. `mutedUntil` with a far-future sentinel for "forever"
`1h|8h|24h` → `now + d`; `forever` → `9999-12-31T23:59:59.999Z`; `off` → null. "Muted" is always `mutedUntil > now`, evaluated at read time, so expiry needs no cron. Mobile derives `isMuted` the same way at render.

### D4. Clear-for-me = `clearedAt` cutoff + `hiddenAt` visibility flag
`POST /:id/clear` sets `clearedAt = hiddenAt = now`, `unreadCount = 0`, `pinnedAt = null`. Messages are never mutated (append-first). Reads filter `createdAt > clearedAt` for that caller. `hiddenAt` exists separately because the list must hide the row only until the next message, while `clearedAt` must persist forever as the history cutoff. `UnreadService.incrementUnreadCount` additionally runs `updateMany({conversationId, hiddenAt: {$ne: null}}, {$set: {hiddenAt: null}})` (covers the sender too, e.g. clearer sends from search).
*Alternative:* compare `conversation.lastMessageAt > clearedAt` at list time — rejected: requires joining/filtering after pagination, breaking `total`/`hasMore`.
*Alternative:* reuse `deleteConversation` / `deletedFor[]` on every message — rejected: destructive for others / O(messages) writes.

### D5. Conversation list query shape
- Page 1: `pinned = find({userId, pinnedAt: {$ne:null}}).sort({pinnedAt:-1}).limit(5)` (index D1).
- Unpinned window (all pages): `find({userId, pinnedAt: null, hiddenAt: null}).sort({joinedAt:-1}).skip((page-1)*limit).limit(limit)`; `total = pinnedCount + countDocuments(unpinned filter)`; `hasMore = skip + limit < unpinnedCount`.
- Conversations loaded with one `$in` query; response order = pinned (by `pinnedAt` desc) then unpinned (existing `lastMessageAt` desc sort within the window). Each item adds `pinned`, `mutedUntil`, `clearedAt` (ISO or null).
- Pinned conversations are never hidden (clear unpins).

### D6. History filters (single helper)
`ConversationsService.getClearedAt(conversationId, userId): Promise<Date|null>` (one `findOne` with projection, reused by verifyMember callers) and `getClearedMap(userId): Promise<Map<convId, Date>>` (one `find({userId, clearedAt: {$ne:null}})`). Applied in:
- `listMessages`, `getMessagesAround` (target + before/after), `getConversationDetails` messages: add `createdAt: { $gt: clearedAt }` (merged with cursor `$lt`).
- `syncMessages`: replace `conversationId: {$in: ids}` with `$or: [{conversationId: {$in: uncleared}}, ...cleared.map(c => ({conversationId: c.id, createdAt: {$gt: c.clearedAt}}))]`, preserving the `updatedAt` and cursor conditions as an outer `$and`. Typical cleared count is small.
- `CallLogsService.getCallHistory` **only when `conversationId` is passed** (in-chat call cards): add `startedAt: {$gt: clearedAt}` so cleared call cards do not resurface in the chat. The global Calls tab history is unaffected.

### D7. Mute filter for pushes lives in MessagesService
`triggerPushNotifications` already loads the conversation; it calls `ConversationsService.getMutedUserIds(conversationId, recipientIds)` — one `find({conversationId, userId: {$in}, mutedUntil: {$gt: now}}, {userId:1})` — and removes them before calling `NotificationsService.sendPushNotification`. Keeps NotificationsService free of a ConversationsService dependency (it already uses forwardRef for Users). Mention pushes are Moments-scoped → not affected (Non-Goal). Call pushes not affected.

### D8. Endpoints & DTO
- `PATCH /conversations/:id/prefs` body `UpdateConversationPrefsDto { @IsOptional @IsBoolean pinned?; @IsOptional @IsIn(['1h','8h','24h','forever','off']) muteDuration? }`; service rejects when both absent (400). Returns `{ conversationId, pinned, mutedUntil, clearedAt }`.
- `POST /conversations/:id/clear` → same response shape.
- Membership via the existing UC lookup; missing UC → `NotFoundException` (matches details endpoint privacy).
- Both emit through a new `setPrefsEmitCallback` wired in `ChatGateway` to `io.to('user:<id>').emit('conversation_prefs_updated', payload)`.

### D9. Mobile data layer
- Migration 004: `ALTER TABLE conversations ADD COLUMN muted_until INTEGER NOT NULL DEFAULT 0; ADD COLUMN cleared_at INTEGER NOT NULL DEFAULT 0` (0 = null). `pinned` stays 0/1.
- `ConversationInput` gains `mutedUntil?: number|string|null`, `clearedAt?: number|string|null`; `upsertMany` writes them; `rowToInput` reads them.
- New repo fns: `updatePrefs(id, {pinned?, mutedUntil?})` (UPDATE + notify), `clearForMe(id, clearedAtMs)` (transaction: delete `messages` where `conversation_id=? AND created_at<=?`, delete `call_logs` where `conversation_id=? AND started_at<=?`, delete conversation row; notify conversations + messages key for that conversation). Pending outbox rows are untouched.
- `Conversation` type + `normalizeConversation` carry `pinned`, `mutedUntil`, `clearedAt`.
- REST seed + `handleGroupCreated` pass real values instead of literal `false`.
- `loadFromDb` maps `pinned`, `mutedUntil`; `conversationFingerprint` appends `pinned|mutedUntil`.
- Flag-off path: pure `sortConversations(list)` (pinned by pinnedAt-order preserved from server, then `lastMessageAt` desc) applied after optimistic updates and after `new_message` bumps so a bumped unpinned row cannot jump above pinned ones.
- `socketEventRouter` adds `conversation_prefs_updated`: if `clearedAt` newer than local `cleared_at` → `clearForMe`; else `updatePrefs`.

### D10. Mobile UI (additive)
- `ConversationListItem` gains optional `onLongPress?: (c) => void` (stable parent handler, same pattern as `onPress`), `delayLongPress` default, `accessibilityActions` [`pin`/`unpin`, `mute`/`unmute`, `clear`] + `onAccessibilityAction` routed to an optional `onQuickAction?: (c, action) => void`. Pin/bell `Icon` (size 14, `text.muted`) rendered inside the existing `topRow` before the timestamp **only when active**; no style of existing elements changes.
- New `components/ConversationActionSheet.tsx`: in-tree absolute overlay (backdrop + bottom sheet) modelled on `MessageContextMenu`, theme tokens via `useTheme()`, two views (main / mute durations), `acquireBackIntercept` for hardware Back, `accessibilityViewIsModal`, 48dp min touch targets.
- `ConversationListScreen` owns `sheetTarget` state + a `useConversationQuickActions` hook (pin/mute optimistic + rollback, clear via `koolaConfirm({destructive:true})` then API then `clearForMe`), toasts via `react-native-toast-message` (already used).
- Mute is evaluated with `Date.now()`; no timer re-render on expiry (next re-render shows correct state) — accepted.

## Risks / Trade-offs

- [Concurrent pins exceed 5 by one] → Accepted; limit is UX, not integrity. Next pin attempt is rejected.
- [Cleared conversation receiving a message while the app is open does not reappear until the next list fetch, because `bumpFromMessage` is a no-op on missing rows] → Same as today's behaviour for brand-new conversations; focus refetch/pull-to-refresh/sync restore it.
- [`$or` per cleared conversation in sync grows with the number of cleared conversations] → Bounded by user behaviour; each clause is index-backed `(conversationId, updatedAt)`.
- [Expired mute icon lingers until next row re-render] → Acceptable; server is authoritative for push.
- [Old mobile clients] → Ignore new fields; their lists simply don't show prefs; server-side filters still apply (cleared history hidden) — consistent.

## Migration Plan

Backend fields are additive with null defaults; the new index builds online. Mobile migration 004 is additive `ALTER TABLE`. Rollback = redeploy previous build; extra fields/columns are ignored.

## Open Questions

None — decisions locked with the user (clear-for-me C, groups keep membership, 1h/8h/24h/forever, pin limit 5).
