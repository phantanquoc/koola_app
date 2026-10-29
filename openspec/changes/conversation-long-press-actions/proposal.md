## Why

The Chat tab conversation list has no per-conversation actions: users cannot pin important chats, silence noisy ones, or remove a chat from their own list — table-stakes behaviour in WhatsApp/Telegram/Zalo (long-press a chat → pin / mute / delete). The mobile SQLite layer already has a `pinned` column and a pinned-first index, but every write path hard-codes `pinned: false` and the backend stores no per-user conversation preferences, so the feature cannot be delivered client-side only.

## What Changes

- Long-pressing a conversation row in the Chat tab opens an in-tree overlay action sheet (no native `<Modal>`, per the RN 0.76 Fabric 0×0 bug) with three actions: **Ghim / Bỏ ghim**, **Tắt thông báo / Bật thông báo** (1 giờ / 8 giờ / 24 giờ / Cho đến khi bật lại), **Xoá hội thoại**.
- **Pin**: per-user, max 5 pinned conversations; pinned conversations sort first in the list (by most recent `pinnedAt` order defined in design).
- **Mute**: per-user `mutedUntil`; while muted the user still receives messages in real time but receives no FCM push (message and mention pushes). Expired mutes behave as unmuted automatically.
- **Clear-for-me ("Xoá hội thoại")**: after a destructive confirm, history older than the caller's `clearedAt` is hidden for that user only (REST list, details, around, `/messages/sync`), the conversation disappears from the caller's list until a newer message arrives, and the local SQLite rows are deleted. Other members are unaffected; group membership is NOT changed. The existing hard `deleteConversation` is NOT used.
- New REST endpoints: `PATCH /conversations/:id/prefs`, `POST /conversations/:id/clear`; new user-scoped socket event `conversation_prefs_updated` so the user's other devices converge.
- `GET /conversations` returns per-user `pinned`, `mutedUntil`, `clearedAt`, puts all pinned conversations on page 1 and omits hidden (cleared, no newer message) conversations.
- Rows show a small pin icon and muted-bell icon next to the timestamp only when active. **Existing UI/UX is preserved**: no layout, size, colour, spacing or tap-behaviour change to the row, list, tabs, header or dock — changes are additive only.

## Capabilities

### New Capabilities
- `conversation-quick-actions`: long-press action sheet on the conversation list, per-user pin (limit 5) / mute (durations) / clear-for-me semantics, REST endpoints, cross-device sync event, mobile local-first persistence and row indicators.

### Modified Capabilities
- `user-conversation-tracking`: UserConversation gains `pinnedAt`, `mutedUntil`, `clearedAt`, `hiddenAt`; a new persisted message un-hides the conversation for every member.
- `conversation-management`: conversation list returns per-user prefs, places pinned conversations first on page 1 and omits hidden conversations.
- `message-sync-api`: `/messages/sync` excludes messages created at or before the caller's `clearedAt` for that conversation.

## Impact

- **Backend** (`chat-backend/src`): `conversations/user-conversation.schema.ts`, `conversations/conversations.service.ts` + controller + new DTO, `conversations/services/unread.service.ts`, `messages/messages.service.ts` (list / around / sync / details filters), `notifications/notifications.service.ts` (mute filter), `gateway/chat.gateway.ts` (new user-scoped emit).
- **Mobile** (`ChatApp/src`): SQLite migration 004, `services/db/conversationRepository.ts`, `services/db/messageRepository.ts` (delete-by-conversation-before), `services/api/apiService.ts`, `services/sync/socketEventRouter.ts`, `types/index.ts`, `screens/main/ConversationListScreen.tsx`, `components/ConversationListItem.tsx`, new `components/ConversationActionSheet.tsx`.
- No new dependencies. No breaking API change (new fields are additive; old clients ignore them).
