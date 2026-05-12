## Why

ChatScreen (the primary user surface of the app) has 5 latent bugs that corrupt UI state (delete rollback missing, `deletedFor` not honored on pagination, dual send path, fire-and-forget pin actions, missing video thumbnails) and 7 UX gaps that make it feel unfinished versus any modern chat app (no read receipts, no online presence in the chat header, no pending/failed indicators, no offline-queued bubbles, re-render-on-every-scroll performance hit, redundant conversation fetches, missing Reply). Fixing these together is cheaper than separate sprints because they share the same surface (`ChatScreen.tsx`, `useMessages.ts`, `renderBubble`) — splitting would create overlapping edits and duplicate verification. Reply is bundled because it is the single most visible missing feature against baseline (WhatsApp/Telegram/Messenger), and it touches the same bubble renderer + composer as the reliability work.

## What Changes

### P0 — Reliability bug fixes (mobile only)
- Apply `deletedFor` filter on `loadEarlier` (pagination) so locally-deleted messages do not reappear when scrolling up.
- Rollback optimistic delete on REST failure for both `deleteMessage` and `deleteForMe`; surface toast on error.
- Remove the unused `onSend` prop from GiftedChat (dead dual send path that could double-send).
- Wrap `handlePin`/`handleUnpin` in try/catch + toast; replace current fire-and-forget.
- Map `mediaThumbnailKey` inside `toGiftedMessage` so video messages render backend-generated thumbnails instead of falling back to blurhash.

### P1 — UX gap closures (mobile only)
- Add `message_read` socket listener; maintain per-message `readBy`; renderBubble shows pending/sent/read ticks.
- Subscribe to `presence_update` in ChatScreen for 1-1 chats; show online dot + "Đang hoạt động"/"Hoạt động X phút trước" under contact name.
- Render pending (clock) and failed (red exclamation, tap-to-retry) states for messages.
- Move `visibleMessageIds` from `useState` to `useRef`; stop full-screen re-render on every scroll tick.
- Consolidate the 4 separate `conversationsApi.getDetails` calls into a single mount fetch; cached result reused by header press + call start.
- Show an optimistic pending bubble when a message is queued offline via `OfflineQueueService`; replace with real message on success, mark failed after max retries.
- Hoist inline `{paddingTop: 20}` in `listViewProps.contentContainerStyle` to a `StyleSheet` constant.

### Reply feature (full-stack — NEW)
- **BREAKING (additive only, backward-compatible):** New optional `replyTo` + denormalized `replyToPreview` on messages.
- Backend: `Message` schema gets optional `replyTo: ObjectId` and `replyToPreview: { senderId, text?, mediaType? }`. `SendMessageDto` accepts `replyTo`. `MessagesService` validates source message (same conversation, not deleted-for-everyone, not in caller's `deletedFor`), builds preview, rejects invalid references with HTTP 400. Responses (REST list/sync/single + socket `new_message`) include `replyTo` + `replyToPreview`.
- Mobile: `Message` type and `IMessage` mapping get `replyTo` + `replyToPreview`. `apiService.messagesApi.sendMessage` accepts `replyTo`. Swipe-right gesture on message bubbles (WhatsApp convention, direction flipped for own vs other messages) sets reply state. Composer shows `ReplyPreview` banner with cancel (X). `QuoteBubble` renders inside bubble when message has `replyTo` — tap scrolls to original if loaded.

### Explicitly out of scope
Voice notes, in-conversation search, unread separator line, `/messages/sync` on reconnect, double-tap react, accessibility menu fixes, iOS share sheet, ChatScreen component split/refactor, encryption, mentions, polls, stickers, drafts persistence, wallpaper, font/theme settings, group calls, per-user read detail in group ticks.

## Capabilities

### New Capabilities
- `message-reply`: Ability to reply to a specific message within a conversation with quoted preview carried end-to-end (schema, API, socket broadcast, mobile UI).
- `chat-read-receipts`: Mobile rendering of pending/sent/read tick marks based on server-emitted `message_read` events and `readBy` server state (backend side already ships `message_read`; this capability adds the mobile contract).
- `chat-presence`: Online/last-seen indicator in the 1-1 chat header, driven by existing `presence_update` socket events (backend already emits; this capability wires the ChatScreen consumer).

### Modified Capabilities
- `messaging`: Add Reply requirement (send + receive reply messages, validate references, include `replyToPreview` in list/sync responses). Clarify video thumbnail field is surfaced to clients.
- `delete-for-me`: Add requirement that `deletedFor` filter SHALL apply to paginated loads as well as initial fetch; add rollback-on-error requirement.
- `pin-message`: Add requirement that pin/unpin failures SHALL surface an error to the user instead of being silently dropped.

## Impact

**Backend (chat-backend/):**
- `src/messages/schemas/message.schema.ts` — new optional fields
- `src/messages/dto/send-message.dto.ts` — new optional field
- `src/messages/messages.service.ts` — new validation branch + preview builder; populate flow on read
- `src/gateway/chat.gateway.ts` — verify broadcast payload shape (no code change expected unless filtering)
- Potential new index on `messages.replyTo` (documented as optional; not added unless query path requires)

**Mobile (ChatApp/):**
- `src/types/message.ts` — type additions
- `src/services/apiService.ts` — send body accepts `replyTo`
- `src/screens/chat/hooks/useMessages.ts` — `loadEarlier` filter, delete rollback, `mediaThumbnailKey` map, `message_read` listener, reply fields map, pending/failed states
- `src/screens/chat/ChatScreen.tsx` — consolidate conversation fetch, `visibleMessageIds` ref, `onSend` removal, pin/unpin error handling, `presence_update` subscription, StyleSheet hoist, reply state + gesture wiring, offline optimistic bubble
- `src/screens/chat/components/` (new dir): `ReplyPreview.tsx`, `QuoteBubble.tsx`, `SwipeableBubble.tsx`
- Possibly new small components: `MessageTicks`, `PresenceIndicator` (TBD at apply time — may be inline)

**Dependencies:** No new npm packages. `react-native-gesture-handler` already installed for swipe.

**Risk:** Medium — Reply adds server-enforced validation and a cross-stack field, and the `visibleMessageIds` refactor touches a hot render path. Mitigated by independent verify + full TypeScript/lint/build checks + manual smoke test.

**Backward compatibility:** Fully additive. Existing clients without reply support ignore the new fields. Existing REST/socket contracts unchanged for non-reply messages.
