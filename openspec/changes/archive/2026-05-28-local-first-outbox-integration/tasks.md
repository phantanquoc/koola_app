## 0. Pre-Flight Verification

- [x] 0.1 Re-grep mobile codebase for `useOfflineQueue` and `OfflineQueueService` callers; record found call sites in a verification note
- [x] 0.2 Re-grep backend codebase for `toggleReaction` callers (Service, Gateway, internal jobs); confirm only `MessagesController` and tests reference it
- [x] 0.3 Inspect `MessageBubble` (or actual bubble owner) for existing `status='failed'` rendering; record whether new visual hooks are needed
- [x] 0.4 Inspect `MainNavigator` for existing `__DEV__` debug section; decide where to register `OutboxDevPanel` ← (verify: scope of UI changes confirmed before Phase 8)

## 1. Backend Reactions Toggle → Set (BREAKING) — Phase 6

- [x] 1.1 Update `chat-backend/src/messages/dto/react-to-message.dto.ts` body shape to `{ emoji: string | null }` (validator allows null + the 6 fixed emoji whitelist)
- [x] 1.2 Rename `MessagesService.toggleReaction` → `setReaction`; replace toggle logic with explicit set / clear (`if emoji===null → $pull` else `$set` to replace existing)
- [x] 1.3 Update `MessagesController` route handler method name and DTO usage to call `setReaction`
- [x] 1.4 Update `chat-backend/src/messages/messages.service.spec.ts` to cover: set new, replace existing, clear with null, idempotent set, idempotent clear
- [x] 1.5 Update `chat-backend/src/messages/messages.controller.spec.ts` (if exists) for the new endpoint contract; verify no other internal callers from Pre-Flight 0.2 are broken ← (verify: `npm test` in chat-backend passes; Phase 1 must merge before Phase 2 mobile work)

## 2. Outbox Repository Extensions — for User Retry & Threshold

- [x] 2.1 Add `markPendingForRetry(id)` to `outboxRepository.ts`: sets `state='pending'`, `last_error=NULL`, `retry_count=0`, `next_retry_at=now()`, `in_flight_at=NULL`, `updated_at=now()`
- [x] 2.2 Add `getDeadLetterRate(windowMs=3600000)` helper that returns `{ rate, doneCount, deadLetterCount, sample }` reading `outbox_metrics` snapshots over the rolling window (treat `sample < 10` as rate=0)
- [x] 2.3 Add `getDeadLetterRows()` returning all rows in `state='dead_letter'` with op_type, conversation_id, message_id, last_error
- [x] 2.4 Extend `outboxRepository.spec.ts` with tests for `markPendingForRetry` (counter unchanged, all fields reset, transitions from dead_letter → pending), `getDeadLetterRate` (sample threshold, rate computation), `getDeadLetterRows` (returns expected rows) ← (verify: tests pass; counter increments not affected)

## 3. Outbox Processor: Threshold + Pause/Resume — Phase 9

- [x] 3.1 Add `pause()` and `resume()` methods to `outboxProcessor.ts` (sets a `_paused` flag; `tick()` early-returns when paused)
- [x] 3.2 Add a threshold check that runs at end of every successful tick: call `getDeadLetterRate`; emit logs at 2% / 3% / 5%; auto-`pause()` at 5%
- [x] 3.3 Wire `[outbox.threshold:info]`, `[outbox.threshold:error]`, `[outbox.rollback]` structured logs with rate + counter snapshot
- [x] 3.4 Ensure `pause()` does NOT prevent `enqueue()` (rows accumulate) and watchdog still runs at next resume
- [x] 3.5 Extend `outboxProcessor.spec.ts` with tests: tick is no-op when paused, threshold log fires at 2/3, pause fires at 5, resume restores tick, sample threshold (<10) suppresses logs ← (verify: tests pass; manual confirm pause cycle survives multiple ticks)

## 4. Hook Integration in useMessagesFromDb — Phase 5

- [x] 4.1 Replace `sendMessage` body to call `outboxRepository.enqueue('send_message', { content, type, clientMessageId, replyTo? })` after `insertOptimistic`; remove direct `messagesApi.send` call
- [x] 4.2 Replace `sendMediaMessage` body to enqueue `send_message` with media payload AFTER upload completes; do not enqueue the upload itself
- [x] 4.3 Replace `reactToMessage` body to call `enqueue('react', { messageId, emoji })` (or `emoji: null` to clear); remove client-side toggle math
- [x] 4.4 Replace `deleteMessage` body to call `enqueue('delete', { messageId })`
- [x] 4.5 Replace `softDeleteForUser` body to call `enqueue('delete_for_me', { messageId })`
- [x] 4.6 Replace `markAsRead` body to call `enqueue('mark_read', { upToTimestamp })` (dedup_key derived from conversationId by repo)
- [x] 4.7 Wrap each enqueue call in try/catch: on error, call `messageRepository.markFailed(tempId, errorJson)` and emit `[outbox.enqueue:error]` log
- [x] 4.8 Confirm enqueue path does NOT call `invalidationBroadcaster.notify` (insertOptimistic already does)
- [x] 4.9 Add `ChatApp/src/screens/chat/hooks/__tests__/useMessagesFromDb.spec.ts` with mocked `outboxRepository`: each write method enqueues correct op_type + payload; enqueue throw flips status to failed; reactToMessage forwards `emoji: null` for clear ← (verify: hooks test pass; no direct messagesApi.* call from hook write paths)

## 5. OfflineQueueService Rewrite — Phase 7

- [x] 5.1 Refactor `OfflineQueueService.ts`: backing layer flips from AsyncStorage to outboxRepository; `getQueueLength()` → `outboxRepository.countActive()`; `clearQueue()` → safe no-op or `wipeAll()` (preserve any existing semantics from grep at 0.1)
- [x] 5.2 If `useOfflineQueue` hook still has callers (per Pre-Flight 0.1), keep its API; if zero callers, mark for follow-up deletion (do NOT delete in this change)
- [x] 5.3 Remove all `AsyncStorage` reads/writes for the `'offline-queue'` key from `OfflineQueueService.ts` (key removal is already handled by Change A migration v→2)
- [x] 5.4 Update or add tests in `OfflineQueueService` test file (if exists) to verify the new backing; remove stale AsyncStorage assertions ← (verify: no AsyncStorage calls remain in OfflineQueueService; jest passes)

## 6. Dead-Letter UX in Chat Bubble — Phase 8 (a)

- [x] 6.1 Extend `MessageBubble` (or actual file from Pre-Flight 0.3) to accept `status='failed'` and render red 1px left border + "Failed — tap to retry" sub-label
- [x] 6.2 Implement tap handler on failed bubble: resolve outbox row id from `clientMessageId`, call `outboxRepository.markPendingForRetry(rowId)`, flip `messages.status` to `'pending'`
- [x] 6.3 Extend message long-press action sheet to include "Discard" option for failed rows
- [x] 6.4 Implement Discard handler: in a single transaction, call `outboxRepository.delete(rowId)` and `messageRepository.delete(tempId)`; emit `[outbox.discard]` log
- [x] 6.5 Cascade UX: ensure each child row in `dead_letter` (with `code='PARENT_FAILED'`) renders the same retry affordance independently
- [x] 6.6 Add UI tests for: failed bubble visual; tap → retry calls correct repo function; long-press → Discard removes both rows; non-message ops do not render any failure UI ← (verify: visual smoke + jest tests; long-press menu shows Discard only for failed rows)

## 7. __DEV__ Outbox Dev Panel — Phase 8 (b)

- [x] 7.1 Create `ChatApp/src/screens/dev/OutboxDevPanel.tsx` with sections: Counters, Rate, Dead-Letter list, Pause/Resume toggle
- [x] 7.2 Counters section reads `outbox_metrics` via a small repo helper and displays all 6 counters + `dead_letter_rate`
- [x] 7.3 Dead-Letter section uses `getDeadLetterRows()` and renders each with op_type, conversation_id, last_error code/hint, Retry button, Discard button
- [x] 7.4 Pause/Resume toggle reflects `outboxProcessor.isPaused()` and calls `pause()` / `resume()`
- [x] 7.5 Register the panel in `MainNavigator` ONLY when `__DEV__ === true`; navigation entry per Pre-Flight 0.4 (existing __DEV__ section if any, else add a guarded screen)
- [x] 7.6 Add a test confirming the panel screen is NOT registered when `__DEV__` is false (mock `__DEV__` to false in jest setup) ← (verify: panel hidden in production builds; counters render correctly; retry/discard work end-to-end)

## 8. Telemetry Integration

- [x] 8.1 Confirm every state-transition path emits `[outbox.<event>]` log per Modified Telemetry requirement; add any missing calls
- [x] 8.2 Add tests verifying log namespaces for: enqueue, markInFlight, markDone, markRetryable, markDeadLetter, markPendingForRetry, watchdogReset, cascadeDeadLetter, threshold, rollback, discard
- [x] 8.3 Verify `dead_letter_rate` computation suppresses output when sample < 10 ← (verify: log spy in tests catches all event names; threshold suppression test passes)

## 9. Quality Gates

- [x] 9.1 `cd ChatApp && npx jest` — all existing + new tests pass (target ≥220 tests)
- [x] 9.2 `cd ChatApp && npx tsc --noEmit` — clean
- [x] 9.3 `cd ChatApp && npm run test:integration` — passes (if invoked previously by Change A)
- [x] 9.4 `cd chat-backend && npm test` — backend tests pass (covers reactions changes)
- [x] 9.5 `cd chat-backend && npm run lint` (if config present) — 224 pre-existing lint errors in chat.gateway.ts and other unowned files; none introduced by this change

## 10. Acceptance Gates (Manual / Deferred)

- [ ] 10.1 Manual smoke: gửi tin offline → bật mạng → tin landed; verify in DB `status='sent'` and outbox row `state='done'`
- [ ] 10.2 Manual smoke: tap reaction twice quickly with same emoji → confirm no flip (idempotent), end state matches first tap
- [ ] 10.3 Manual smoke: simulate 4xx fail (e.g., delete a non-existent message, or block backend) → see `dead_letter` bubble → tap retry → eventually success or stable failure
- [ ] 10.4 Manual smoke: open `__DEV__` panel → counters increment as ops flow → pause toggle stops new dispatches → resume continues
- [ ] 10.5 `gitnexus_detect_changes()` confirms only expected symbols/processes are affected ← (verify: device dogfooding clean before archive)
