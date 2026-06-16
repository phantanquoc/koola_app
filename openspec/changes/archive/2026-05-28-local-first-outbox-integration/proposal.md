## Why

Change A (`local-first-outbox-foundation`) shipped the outbox infrastructure but left it dormant — `outboxRepository.enqueue()` has zero callers in production code paths. `useMessagesFromDb` write methods still bypass the outbox: `sendMessage` calls `messagesApi.send` directly with a fire-and-forget retry, and `reactToMessage` / `deleteMessage` / `softDeleteForUser` / `markAsRead` have no retry at all. Until the hooks are wired, the silent message-loss bug that motivated the work is not actually fixed. Foundation without integration has zero user-visible value.

This change activates the outbox by routing all 5 mobile write paths through `enqueue()`, ships the **breaking** backend reactions toggle→set port that makes `react` retry-safe, surfaces dead-letter rows in the UI so users can recover failed sends, replaces the legacy `OfflineQueueService` AsyncStorage backing with the outbox, and turns on the threshold-driven soft-rollback telemetry locked in Change A's design.

## What Changes

### Hook integration
- `useMessagesFromDb.sendMessage` routes through `outboxRepository.enqueue('send_message', ...)`; messages row stays `status='pending'` until processor reaches `done` and runs `confirmSend`.
- `useMessagesFromDb.sendMediaMessage` enqueues only the `POST /messages` part; media upload still happens before enqueue (upload bypass per AGENTS.md).
- `useMessagesFromDb.reactToMessage` enqueues `react` op with `dedup_key=<messageId>:<userId>` (UPSERT last-write-wins).
- `useMessagesFromDb.deleteMessage` enqueues `delete` op (idempotent on backend).
- `useMessagesFromDb.softDeleteForUser` enqueues `delete_for_me` op.
- `useMessagesFromDb.markAsRead` enqueues `mark_read` op with `dedup_key=<conversationId>` (UPSERT MAX timestamp).

### Backend reactions BREAKING change
- **BREAKING** — `POST /messages/:id/reactions` body changes from `{emoji: string}` (toggle) to `{emoji: string | null}` (explicit set; null clears).
- Service: `if emoji===null → $pull existing else $set replace existing` — idempotent.
- DTO `ReactToMessageDto.emoji` becomes optional + nullable.
- Controller method renamed `toggleReaction` → `setReaction` (or kept name with new semantics, decided in design.md).
- No versioned endpoint — app has not shipped Play Store/TestFlight, break thẳng.

### Dead-letter UX
- `send_message` dead-letter rows render the message bubble with red border + "Failed to send" label + retry tap target.
- Tap retry → `outboxRepository.markPendingForRetry(id)` → state back to `pending`, `last_error` cleared, `retry_count` reset to 0.
- Long-press menu adds "Discard" → deletes the outbox row + the local `temp_*` messages row.
- Cascade reply chain: parent dead-letter → children inherit `code='PARENT_FAILED'`; parent retry does NOT auto-resume children (user must explicit retry each).
- Non-message ops (react, delete, delete_for_me, mark_read) are silent on dead-letter — only structured `[outbox]` log; no inline UI.
- Optional `__DEV__` panel lists dead-letter rows with retry/discard buttons.

### OfflineQueueService rewrite
- `OfflineQueueService.ts` keeps its public API for any remaining call sites; backing layer flips from `AsyncStorage` to `outboxRepository`.
- AsyncStorage `'offline-queue'` key removal already lands in Change A's `outbox_migration_version → 2` — no double work.
- `useOfflineQueue` hook (if still consumed by any screen) reads counts from outbox stats helper.

### Telemetry thresholds + soft rollback
- `outbox_metrics` derived rate `dead_letter_rate = dead_letter_total / (done_total + dead_letter_total)` computed on rolling 1h window.
- Threshold ≥2% → `[outbox.threshold:info]` log.
- Threshold ≥3% → `[outbox.threshold:error]` log.
- Threshold ≥5% → soft rollback: `outboxProcessor.pause()` (pending rows accumulate, no retry) + `[outbox.rollback]` log.
- Manual `resume()` via `__DEV__` panel or auth re-init.
- `__DEV__` panel surfaces all counters: `enqueued_total`, `inflight_started_total`, `done_total`, `dead_letter_total`, `retry_total`, `watchdog_reset_total`, `dead_letter_rate`.

## Capabilities

### New Capabilities
None. This change activates and refines existing capabilities; no new spec files.

### Modified Capabilities
- `message-outbox`: enqueue paths now active across 5 write methods; adds `markPendingForRetry` operation, threshold/rollback semantics, dead-letter UX requirements, retry/discard user actions.
- `message-reactions`: toggle semantics replaced by explicit-set semantics (BREAKING). Idempotent body shape `{emoji: string | null}`.
- `message-store-sqlite`: no schema changes; only documentation note that legacy AsyncStorage `'offline-queue'` key is removed (already covered by Change A migration v→2).

## Impact

### Affected code (mobile)
- `ChatApp/src/screens/chat/hooks/useMessagesFromDb.ts` — rewrite 6 write methods to call `enqueue()`.
- `ChatApp/src/services/OfflineQueueService.ts` — rewrite backing layer.
- `ChatApp/src/services/sync/outboxProcessor.ts` — add `markPendingForRetry` wiring, threshold computation, pause/resume.
- `ChatApp/src/services/db/outboxRepository.ts` — add `markPendingForRetry`, `getDeadLetterRate`, threshold helpers.
- `ChatApp/src/components/MessageBubble.tsx` (or actual file owning bubble render) — dead-letter visual + retry tap.
- `ChatApp/src/components/MessageActions.tsx` (or long-press sheet owner) — Discard option for dead-letter rows.
- `ChatApp/src/screens/dev/OutboxDevPanel.tsx` (NEW, `__DEV__` only) — counters + retry/discard list.
- Tests: `outboxRepository.spec.ts`, `outboxProcessor.spec.ts` extended; new `useMessagesFromDb.spec.ts`.

### Affected code (backend)
- `chat-backend/src/messages/messages.service.ts` — `toggleReaction` → `setReaction` (replace existing else clear).
- `chat-backend/src/messages/messages.controller.ts` — endpoint signature and method name.
- `chat-backend/src/messages/dto/react-to-message.dto.ts` — body shape.
- `chat-backend/src/messages/messages.service.spec.ts` — update expectations.
- `chat-backend/src/messages/messages.controller.spec.ts` if present — update expectations.

### APIs
- **BREAKING**: `POST /messages/:id/reactions` body shape and semantics. Pre-shipping (no production clients).

### Dependencies
- None added. Reuses Change A infrastructure (`outboxRepository`, `outboxProcessor`, `outbox_metrics`).

### Out of scope (separate changes)
- Background processing (foreground-only stays).
- Encryption (sqlcipher), FTS5 search, CRDT multi-device.
- Sentry / external observability wiring.
- Pre-logout "unsent messages" dialog.
- Edit / pin / forward outbox op_types.
