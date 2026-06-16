# Archive Notes — local-first-outbox-integration

Archived: 2026-05-28

## Summary

Change B of the local-first initiative. Integrates the outbox foundation (Change A,
archived 2026-05-28-local-first-outbox-foundation) into all active mobile write paths
and ships the full reliability surface: dead-letter UX, threshold rollback, and the
dev inspection panel.

## What Shipped

### Outbox Integration (Phase 5)
- `useMessagesFromDb` hook now routes all five write operations (sendMessage,
  sendMediaMessage, reactToMessage, deleteMessage, softDeleteForUser, markAsRead)
  through `outboxRepository.enqueue()` instead of calling REST APIs directly.
- `insertOptimistic` still runs first; enqueue failure flips the local row to
  `status='failed'` and emits `[outbox.enqueue:error]`.

### Backend Reactions BREAKING Change (Phase 6)
- `MessagesService.toggleReaction` renamed to `setReaction`.
- Endpoint body changed from `{ emoji: string }` (toggle) to `{ emoji: string | null }`
  (explicit set / clear).
- Sending the same emoji twice no longer toggles off — it is idempotent.
- Sending `{ emoji: null }` clears the user's reaction.
- Pre-launch break; no production clients to coordinate.

### Dead-Letter UX (Phase 8a)
- Failed `send_message` outbox rows render with a red 1px left border and
  "Failed — tap to retry" label in the chat bubble.
- Tap triggers `outboxRepository.markPendingForRetry(rowId)` and flips local
  `messages.status` back to `'pending'`.
- Long-press action sheet includes "Discard" for failed rows; Discard deletes both
  the outbox row and the local `temp_*` messages row in a single transaction.
- Non-message op types (`react`, `delete`, `delete_for_me`, `mark_read`) are silent
  on dead-letter — structured log only.
- Cascade UX: child reply rows in `dead_letter` (code `PARENT_FAILED`) each show
  their own retry affordance independently.

### __DEV__ Outbox Panel (Phase 8b)
- `OutboxDevPanel.tsx` registered in `MainNavigator` under `__DEV__` guard only.
- Sections: Counters (all 6 + dead_letter_rate), Dead-Letter list with per-row
  Retry/Discard, Pause/Resume toggle.
- Panel is unreachable in production builds (confirmed by jest test mocking
  `__DEV__ = false`).

### Threshold Soft Rollback (Phase 9)
- `outboxProcessor` computes dead-letter rate over a rolling 1h window using
  `outbox_metrics` snapshots.
- 2% threshold: `[outbox.threshold:info]` log, processor continues.
- 3% threshold: `[outbox.threshold:error]` log, processor continues.
- 5% threshold: `[outbox.rollback]` log + `pause()` — no rows dispatched until
  `resume()` is called.
- Sample-size suppression: rate treated as 0 when `(done + dead_letter) < 10`.
- `pause()` does not block `enqueue()` — rows accumulate in `pending`.
- Pause state does not persist across app restart.

### OfflineQueueService Rewrite (Phase 7)
- Backing layer flipped from AsyncStorage to `outboxRepository`.
- `getQueueLength()` now returns `outboxRepository.countActive()`.
- `clearQueue()` is a safe no-op (wipe is handled by `wipeAllData` on logout).
- All AsyncStorage reads/writes for the `'offline-queue'` key removed.
- Legacy public API preserved for any remaining callers.

### AsyncStorage Migration v->2
- Migration v->1 (backfill) was shipped in Change A.
- Migration v->2 (key deletion) ships in this change: removes the
  `'offline-queue'` AsyncStorage key after backfill is confirmed complete.

### Outbox Repository Extensions
- `markPendingForRetry(id)`: resets dead-letter row to pending with cleared
  backoff (retry_count=0, last_error=NULL, next_retry_at=now, in_flight_at=NULL).
- `getDeadLetterRate(windowMs)`: rolling rate computation with sample suppression.
- `getDeadLetterRows()`: returns all dead_letter rows for dev panel display.

## Verification Results

- Round 1: 3 MAJOR + 5 MINOR + 2 CV findings.
- Round 2: 0 CRITICAL + 0 MAJOR + 0 MINOR — all findings resolved.
- 255 mobile tests pass (jest), tsc clean (npx tsc --noEmit).
- 66 backend tests pass (npm test in chat-backend).
- 224 pre-existing backend lint errors in chat.gateway.ts, webrtc.gateway.ts, and
  other unowned files — NOT introduced by this change, documented as deferred.

## Deferred Items

- Phase 10 (manual smoke tests): requires physical device or emulator with network
  simulation. Not available in this environment. Items deferred:
  - 10.1 Offline send -> reconnect -> DB status='sent' verification
  - 10.2 Idempotent reaction (double-tap same emoji)
  - 10.3 4xx dead-letter bubble -> retry flow
  - 10.4 __DEV__ panel counter increment + pause/resume cycle
  - 10.5 `gitnexus_detect_changes()` symbol/process scope confirmation

## Spec Promotions Applied

- `openspec/specs/message-reactions/spec.md`: replaced toggle-semantics requirement
  with explicit-set semantics; removed "Toggle off reaction" and "Change reaction"
  as standalone scenarios (folded into updated main requirement); added null-clear
  display scenario to "Reactions displayed under message bubble".
- `openspec/specs/message-outbox/spec.md`: updated "Telemetry Logs and Counter Table"
  with threshold scenarios; updated "AsyncStorage Queue Backfill" to include v->2
  key deletion and OfflineQueueService API compat; appended five new requirements:
  Hook Integration, User-Initiated Retry, Dead-Letter UX, Threshold-Driven Soft
  Rollback, __DEV__ Outbox Panel.
