## Context

ChatScreen is the primary user surface. It combines GiftedChat rendering, real-time socket events (typing, reads, pins, presence, new messages), optimistic media uploads, an offline queue, and a call initiator. The screen is 904 lines with 12 `useState`, 5 `useEffect`, and 4 `useRef` calls plus three supporting hooks (`useMessages`, `useTypingIndicator`, `useReadReceipts`). Recent audits surfaced 5 latent bugs, 7 UX gaps, and one obviously-missing feature (Reply) relative to baseline messaging apps.

The backend already emits the events needed for two of the UX gaps (`message_read`, `presence_update`) — the mobile side just never subscribed. `mediaThumbnailKey` is populated server-side but never mapped on the client. Reply requires new schema + DTO + service validation on the backend in addition to mobile UI.

Constraints from CLAUDE.md and AGENTS.md:
- Real-time events route through Redis adapter; any emit must be safe for multi-instance fanout.
- Layer separation: controllers → services → schemas; gateways never write to DB.
- Append-first data model: prefer additive fields over mutations.
- Socket payloads must be JSON-serializable and <10KB.
- Vietnamese IME requires the uncontrolled `TextInput` + ref pattern in the composer — must not regress.

## Goals / Non-Goals

**Goals:**
- Eliminate the 5 P0 bugs with clear rollback + error feedback semantics.
- Close the 7 P1 UX gaps so ChatScreen feels equivalent to baseline messaging apps on the visible-behavior axis.
- Ship Reply end-to-end with backend validation that prevents stale or illegal references.
- Preserve offline, IME, and fanout correctness.

**Non-Goals:**
- Voice notes, in-conversation search, unread separator, `/messages/sync` on reconnect, double-tap react, accessibility menu overhaul, iOS share sheet, ChatScreen component split refactor, encryption, @mentions, polls, stickers, drafts persistence, chat wallpaper, font/theme settings, group calls, per-user read detail in group ticks, message edit, scheduled messages, disappearing messages.

## Decisions

### 1. Single OpenSpec change vs split

**Decision:** Single change (`chatscreen-reliability-and-reply`).
**Alternatives considered:**
- `chatscreen-bugfixes` + `message-reply-feature` as two changes.
**Rationale:** All three groups touch `ChatScreen.tsx`, `useMessages.ts`, and `renderBubble`. Splitting creates overlapping edits (renderBubble is touched by P1 tick-marks, P1 pending/failed icons, AND Reply's quote bubble). Merging would require coordinated rebases. Verification of the combined surface is strictly simpler than two passes.
**Trade-off:** Slightly larger review surface per commit. Mitigated by grouping tasks into clear sections in `tasks.md`.

### 2. Reply schema: denormalized `replyToPreview`

**Decision:** Store `{ senderId, text?, mediaType? }` as an embedded sub-document on the reply message itself.
**Alternatives considered:**
- **(a) Pure reference** — only `replyTo: ObjectId`, populate on read. Cost: extra lookup on every list fetch (hot path — `GET /conversations/:id/messages` is the most-used endpoint). A conversation with 20 messages each replying to another = 20 extra document fetches.
- **(b) Full populated copy** — store entire source message. Cost: storage bloat, stale on edit/delete.
- **(c) Client-side join** — client resolves preview from its local message cache. Cost: breaks when original is out of the pagination window; backend must still send an ID, client shows "Message" placeholder until scroll loads it.
**Rationale:** Denormalized preview is O(1) per message on read, small payload (~150 bytes max), and the snapshot is immutable by design (the reply was sent based on that moment). If the original is later edited (out of scope for this change) or deleted-for-everyone, the preview stays — this is WhatsApp/Telegram behavior.
**Trade-off:** Preview will not reflect edits. Acceptable because edit is out of scope. If edit ships later, a nightly job could patch previews; not planned.

### 3. Reply validation: reject stale or forbidden sources

**Decision:** Backend `MessagesService.create` validates `replyTo` before inserting:
1. Exists.
2. Same `conversationId` as the outgoing message.
3. `deletedAt` is falsy (not deleted-for-everyone).
4. Caller's userId not in source's `deletedFor` array.

Invalid → HTTP 400 with specific error code.
**Rationale:** Prevents cross-conversation reply leaks (security), replying to tombstones (confusing UX), and replying to messages the user "deleted for themselves" (inconsistent local state). Client enforces the same rules in the UI but backend is the source of truth.
**Trade-off:** One extra findById query per reply send. Acceptable — replies are a small fraction of messages.

### 4. Tick marks: ✓/✓✓ semantics and group behavior

**Decision:**
- **Clock icon** — message has `pending: true` (optimistic, not yet ACKed by server).
- **Red exclamation** — `sent: false` (REST/queue error path). Tappable → retry with new `clientMessageId`.
- **✓ (single check)** — server ACK received, not yet read by any other member.
- **✓✓ (double check)** — in 1-1: the other member has read (`readBy` contains their userId). In group: ALL other members have read.

**Alternatives considered:**
- Individual per-user read state (Telegram-style "seen by 3/5"). Not in this scope.
- Color differentiation (blue for read) — keep monochrome for now to avoid theme churn; can add later.

**Rationale:** Matches the backend's existing `readBy: ObjectId[]` field and `message_read` event. Group "all must read" rule prevents the ✓✓ from triggering too aggressively in large groups — matches WhatsApp.
**Trade-off:** Large groups will rarely see ✓✓. Acceptable; can revisit for group-specific UX later.

### 5. Presence: 1-1 only, skip for groups

**Decision:** In ChatScreen, subscribe to `presence_update` only when `conversation.type === 'direct'`. Read the other member's userId from conversation members. Show online dot + text. For groups, show member count only.
**Rationale:** Group presence is a design problem (show dot on every avatar? aggregate "N online"?). Out of scope. Existing `ConversationListScreen` already handles presence per-conversation at the list level.

### 6. Swipe direction for reply

**Decision:** WhatsApp convention:
- Right-to-left swipe on **own** messages (aligned right).
- Left-to-right swipe on **other**'s messages (aligned left).

Threshold ~60px with visual feedback (translate + arrow fade-in).
**Alternatives considered:** Uniform right swipe everywhere — simpler but doesn't feel natural on right-aligned bubbles.
**Rationale:** Users muscle-memory from WhatsApp/Telegram. Mirror-directionality keeps the gesture pointing "toward" the bubble owner's side.

### 7. `visibleMessageIds` state → ref

**Problem:** `onViewableItemsChanged` on every scroll tick calls `setVisibleMessageIds(new Set(...))`, which triggers full ChatScreen re-render. With 200 messages + videos this causes visible jank.

**Decision:** Store visibility in `useRef<Set<string>>()`. Each `VideoMessage` receives a `getIsVisible` callback prop (stable via `useCallback`) that reads the ref. When visibility changes for a specific message, imperatively notify that component via a small event-emitter pattern or `Animated.Value` per message.

**Alternatives considered:**
- Keep state but memoize harder — still triggers setState on scroll.
- Use Zustand/Jotai store for visibility — more machinery than needed for one refactor.
- Pass `isVisible` as boolean prop computed outside — same setState problem one layer up.

**Rationale:** Ref + imperative notify avoids all React re-renders during scroll. The trade-off is imperative code, contained to the VideoMessage ↔ ChatScreen boundary. Pattern is well-known for autoplay gating.

### 8. Offline queued bubbles

**Decision:** When `sendViaQueue` is called, ChatScreen inserts an optimistic message identical to the online path — same `clientMessageId`, same `pending: true`. `OfflineQueueService` gains a lightweight event (observer callback) that ChatScreen subscribes to:
- `processed(clientMessageId, serverMessage)` → replace optimistic with server copy.
- `failed(clientMessageId, error)` → mark `sent: false`, stop pending.

**Alternatives considered:**
- Polling queue state from ChatScreen — wasteful and laggy.
- No optimistic bubble offline — current behavior; user confusion confirmed by audit.

**Rationale:** Queue service already tracks `clientMessageId`; adding an event emitter is a minor extension. Keeps the optimistic UX consistent online vs offline.

### 9. Conversation fetch consolidation

**Decision:** Single `useEffect` on mount fires `conversationsApi.getDetails` and stores in `conversation` state. `handleHeaderPress` and `handleStartCall` check `if (conversation)` before calling; if not yet loaded, they refetch (same call, acts as cache-miss). Remove the separate refetch inside each handler that was causing 4 parallel requests.

### 10. Removing `onSend` without regression risk

**Decision:** Audit GiftedChat configuration — verify no code path triggers `onSend` (keyboard submit, send-on-enter). If any exists, reroute to `handleSend`. Safe to remove once both paths unified.
**Mitigation:** Manual smoke test: send via button, send via keyboard Return, send from multi-line input.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Reply validation query adds latency to send path | One additional `findById` — negligible (<5ms). Monitor in logs. |
| `visibleMessageIds` refactor introduces stale video autoplay state | Manual test: scroll fast, verify autoplay gates activate/deactivate correctly. |
| `presence_update` listener leaks on screen unmount | Centralized `off` in cleanup; verified by existing `socketService` listener lifecycle. |
| Reply preview stale after edit (future feature) | Documented; no action this cycle. Future edit feature must include a preview update job. |
| Swipe gesture conflicts with horizontal FlatList scroll (carousels inside messages) | None currently — no horizontal scroll children. If added later, use `simultaneousHandlers`. |
| Tick marks on legacy messages without `readBy` | Treat empty/undefined as not-read-by-anyone; default to ✓. |
| `message_read` event fanout amplification in large groups | Backend already emits to room, not per-user; Redis adapter handles fanout. No change. |
| Offline queue event emitter introduces coupling | Keep surface small (2 events); document contract in queue service. |
| Retrying a failed send with new `clientMessageId` could cause duplicate on server if old one eventually persists | Backend dedup is by `clientMessageId` alone — a new ID bypasses dedup. Accept small risk: manual testing shows original typically fails fast; if duplicate occurs, rare and user-recoverable. Alternative (same ID + server-side idempotency on retry) is more work. |

## Migration Plan

**Deployment order:** Backend first (additive schema; existing clients ignore new fields), then mobile. No database migration needed — Mongoose accepts new optional fields on existing documents.

**Rollback:** Revert mobile to previous version; backend schema additions are harmless if unused. If backend validation regresses send performance, revert backend service change (schema can remain — fields are optional).

**No user-facing breaking change.** Existing clients continue to work; reply and new indicators simply don't appear on older app versions.

## Open Questions

None. All ambiguities were resolved during the autopilot exploration phase. Listed here for verifier reference:
- ~~How to scope presence?~~ → 1-1 only, decision 5.
- ~~How to render ticks in groups?~~ → all-must-read rule, decision 4.
- ~~Single change or split?~~ → single, decision 1.
- ~~Swipe direction?~~ → WhatsApp convention, decision 6.
- ~~Retry with same or new clientMessageId?~~ → new ID, documented risk in table.
