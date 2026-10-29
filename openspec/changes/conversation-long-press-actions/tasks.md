## 1. Backend data model

- [x] 1.1 Add `pinnedAt`, `mutedUntil`, `clearedAt`, `hiddenAt` (`Date | null`, `default: null`) to `UserConversation` in `chat-backend/src/conversations/user-conversation.schema.ts`, plus `schema.index({ userId: 1, pinnedAt: -1 })` (no `index: true` on `@Prop`)
- [x] 1.2 `UnreadService.incrementUnreadCount`: also clear `hiddenAt` for every UC of the conversation (`updateMany({conversationId, hiddenAt: {$ne: null}}, {$set: {hiddenAt: null}})`), including the sender ← (verify: every persisted-message path in messages.service calls incrementUnreadCount, so un-hide is reached for send/forward/story-reply/bridge)

## 2. Backend prefs API

- [x] 2.1 Create `dto/update-conversation-prefs.dto.ts` (`pinned?: boolean` via `@IsBoolean`, `muteDuration?: '1h'|'8h'|'24h'|'forever'|'off'` via `@IsIn`, both `@IsOptional`)
- [x] 2.2 `ConversationsService.updatePrefs(conversationId, userId, dto)`: membership via UC (missing → 404), both fields absent → 400, pin limit 5 → `BadRequestException({ code: 'PIN_LIMIT_REACHED', message })` unless already pinned, mute duration → `mutedUntil` per design D3, returns `{ conversationId, pinned, mutedUntil, clearedAt }`
- [x] 2.3 `ConversationsService.clearForMe(conversationId, userId)`: sets `clearedAt = hiddenAt = now`, `unreadCount = 0`, `pinnedAt = null`; never touches messages, membership or other users' UC; same response shape
- [x] 2.4 Add `setPrefsEmitCallback` to ConversationsService, invoked after 2.2/2.3 succeed; wire it in `ChatGateway` constructor block to `io.to('user:<id>').emit('conversation_prefs_updated', payload)`
- [x] 2.5 Controller: `PATCH /conversations/:id/prefs` and `POST /conversations/:id/clear` (JWT-guarded, Swagger decorators matching existing endpoints) ← (verify: endpoints match spec scenarios — non-member 404, invalid body 400, limit 400 PIN_LIMIT_REACHED, emit only to caller's user room)

## 3. Backend reads honour prefs

- [x] 3.1 `getConversationList`: pinned group (≤5, `pinnedAt` desc) on page 1 + unpinned non-hidden window paginated by `joinedAt` per design D5; `total`/`hasMore` from the filtered counts; each item adds `pinned`, `mutedUntil`, `clearedAt`
- [x] 3.2 Add `getClearedAt(conversationId, userId)` and `getClearedMap(userId)` helpers to ConversationsService
- [x] 3.3 Apply `createdAt > clearedAt` in `MessagesService.listMessages`, `getMessagesAround` (target, before and after queries) and `ConversationsService.getConversationDetails` messages
- [x] 3.4 `MessagesService.syncMessages`: per-conversation `$or` with `createdAt > clearedAt` for cleared conversations, preserving the `updatedAt` / cursor conditions
- [x] 3.5 `CallLogsService.getCallHistory`: when `conversationId` is given and the caller has `clearedAt`, add `startedAt > clearedAt`; unscoped history unchanged
- [x] 3.6 Push mute: `ConversationsService.getMutedUserIds(conversationId, userIds)` (single query, `mutedUntil > now`), and `MessagesService.triggerPushNotifications` removes them from `recipientIds` before `sendPushNotification` ← (verify: no N+1; muted users still receive socket new_message; call pushes untouched)

## 4. Backend tests & build

- [x] 4.1 Jest `conversations` prefs spec: pin/unpin, limit 5 (6th rejected, re-pinning an already pinned one allowed), mute durations incl. forever sentinel and off, both-absent 400, non-member 404, clear sets fields and leaves other members' UC untouched, emit callback payload
- [x] 4.2 Jest list spec: pinned first on page 1 only, hidden omitted from page and total, un-hide on increment
- [x] 4.3 Jest messages spec: listMessages / around / sync exclude `createdAt <= clearedAt` for the clearer only; push recipients exclude muted users
- [x] 4.4 Run `npm run build` and the full backend jest suite in `chat-backend` — 0 errors, no regressions ← (verify: build + all suites green)

## 5. Mobile data layer

- [x] 5.1 SQLite migration 004 in `ChatApp/src/services/db/migrations/index.ts`: add `muted_until` and `cleared_at` INTEGER NOT NULL DEFAULT 0 to `conversations`
- [x] 5.2 `conversationRepository`: `DbConversation`/`ConversationInput`/`rowToInput`/`upsertMany` carry `mutedUntil`, `clearedAt`; add `updatePrefs(id, {pinned?, mutedUntil?})` and `clearForMe(id, clearedAtMs)` (single transaction deleting messages created at or before the cutoff, call_logs started at or before it, and the row; outbox untouched; notifies list + that conversation's message key)
- [x] 5.3 `Conversation` type + `normalizeConversation` carry `pinned`, `mutedUntil`, `clearedAt`; `conversationsApi.updatePrefs(id, body)` and `conversationsApi.clear(id)`
- [x] 5.4 `ConversationListScreen`: REST seed and `handleGroupCreated` pass real `pinned`/`mutedUntil`/`clearedAt` (remove hard-coded `pinned: false`); `loadFromDb` maps `pinned`/`mutedUntil`; `conversationFingerprint` includes them; flag-off path uses a pure `sortConversations` (pinned first) after optimistic updates and `new_message` bumps
- [x] 5.5 `socketEventRouter`: handle `conversation_prefs_updated` (newer `clearedAt` → `clearForMe`, else `updatePrefs`); also update in-memory list on the flag-off path ← (verify: second device converges without REST refetch; prefs survive a REST refresh)

## 6. Mobile UI (additive only)

- [x] 6.1 New `ChatApp/src/components/ConversationActionSheet.tsx`: in-tree absolute overlay (no native Modal), main view (Ghim/Bỏ ghim, Tắt/Bật thông báo, Xoá hội thoại destructive) + mute view (Trong 1 giờ / 8 giờ / 24 giờ / Cho đến khi tôi bật lại), theme tokens, hardware Back via `acquireBackIntercept`, backdrop dismiss, `accessibilityViewIsModal`, ≥48dp rows
- [x] 6.2 `useConversationQuickActions` hook: optimistic pin/mute with rollback + toasts ("Chỉ ghim tối đa 5 hội thoại", "Không thể cập nhật hội thoại. Thử lại."), clear via `koolaConfirm({ destructive: true })` → API → `clearForMe` (toast "Không thể xoá hội thoại. Thử lại." on failure); no offline queue
- [x] 6.3 `ConversationListItem`: optional `onLongPress` + `onQuickAction` props (stable parent handlers), `accessibilityActions` + `onAccessibilityAction`, pin and muted-bell 14px icons before the timestamp only when active; no existing style/structure changed
- [x] 6.4 `ConversationListScreen`: mount the sheet + hook, pass stable handlers to rows ← (verify: tap still navigates identically; rows with no prefs render the same tree as before; sheet appears above the glass header and tab bar)

## 7. Mobile tests & gates

- [x] 7.1 Jest: repository (seed keeps pinned/mutedUntil, `updatePrefs`, `clearForMe` deletes only ≤ cutoff and keeps outbox), migration 004 applies on existing DB
- [x] 7.2 Jest: `ConversationActionSheet` (labels per state, mute sub-view, Back/backdrop dismiss), `useConversationQuickActions` (rollback + toasts, limit toast, clear only after confirm), `conversationFingerprint` changes on pin/mute, `sortConversations`
- [x] 7.3 Run `npx tsc --noEmit`, `npx eslint` on touched files and full jest in `ChatApp` — 0 errors, no regressions ← (verify: all gates green; any pre-existing failures reported, not hidden)
