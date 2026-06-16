## Why

KOOLA mobile currently has two parallel write-path persistence layers that do not talk to each other: (1) `OfflineQueueService` (AsyncStorage-backed) only used by the legacy `useOfflineQueue.sendViaQueue` flow, and (2) the local-first SQLite path in `useMessagesFromDb` that calls `messagesApi` directly with no durable retry state — failed sends are marked `status='failed'` in `messages` and stay invisible until the user re-opens the conversation and taps retry. Reactions, deletes, delete-for-me, and mark-read are all fire-and-forget in `useMessagesFromDb` (see `useMessagesFromDb.ts:175-411`); a network drop loses the action permanently with no audit trail.

This duplication is documented as deliberate technical debt in `openspec/changes/archive/2026-05-25-local-first-sqlite-messages/design.md` Decision 9, which named the follow-up work `local-first-offline-queue-unification` and deferred it to keep the SQLite read-path change in scope. This change picks up that follow-up. Without it, every new write feature (edit message, pin, forward — all have specs) will copy the same fire-and-forget pattern, multiplying the data-loss surface.

## What Changes

- **NEW** SQLite `outbox` table as the single durable source-of-truth for write intents. Five op types: `send_message`, `react`, `delete`, `delete_for_me`, `mark_read`. Each row carries `op_type`, `payload_json` (versioned), `dedup_key`, state machine, retry counter, and a sanitized `last_error` projection.
- **NEW** `outboxRepository` (TypeScript, repository pattern matching `messageRepository`) exposing `enqueue / getDue / markInFlight / markDone / markRetryable / markDeadLetter / watchdogReset / cascadeDeadLetter / wipeAll`. Coalesce semantics enforced via partial unique index on `(op_type, dedup_key) WHERE state IN ('pending','in_flight')`.
- **NEW** `outboxProcessor` service (single-flight worker) with: dispatcher map keyed on `(op_type, payload_version)`, five op handlers, error classifier (`NETWORK / TIMEOUT / 4XX / 5XX / 401 / 403 / 404 / 429 / PARSE / PARENT_FAILED / UNSUPPORTED_VERSION`), exponential backoff `min(2^retry + jitter, 30s)` with 8-retry cap, watchdog (240s for `send_message`, 30s for other ops), and `InteractionManager.runAfterInteractions` yield to keep UI smooth.
- **NEW** five trigger sources wired into `outboxProcessor.tick()`: NetInfo `isConnected` false→true, socket reconnect event, AppState `background→active`, `enqueue()` calls, and a periodic 30s backstop that auto-stops when no rows remain.
- **NEW** structured `[outbox]` log scaffolding at every state transition + a `outbox_metrics` SQLite counter table (key/value/updated_at) plus a `dbg.outboxStats()` helper.
- **NEW** AsyncStorage queue migration counter `outbox_migration_version` in `sync_state`. v=0→1 backfills the existing `'offline-queue'` AsyncStorage payload into outbox rows; v=2 is reserved for the deletion step (Change B).
- **MODIFIED** `koola.db` schema bumps to v2 with the new `outbox` and `outbox_metrics` tables and three indexes (`idx_outbox_due`, `idx_outbox_dedup` partial unique, `idx_outbox_in_flight`). `dbInit.wipeAllData` extends to wipe both tables.
- **OUT OF SCOPE (Change B `local-first-outbox-integration`)**: wiring `useMessagesFromDb` send/react/delete/delete-for-me/mark-read to enqueue instead of calling REST directly; rewriting `OfflineQueueService` backing while preserving its public API; backend `POST /messages/:id/reactions` toggle→explicit-set BREAKING change; dead-letter inline bubble UX in `ChatScreen`; conversation list red subtitle; AsyncStorage `'offline-queue'` deletion (migration v→2); cleanup job for `done` rows older than 24 h.
- **OUT OF SCOPE (deferred)**: background processing (FCM-driven outbox flush while app suspended), end-to-end encryption of `koola.db`, FTS5 search, CRDT multi-device, Sentry/Datadog wiring, pre-logout "unsent messages" dialog.

## Capabilities

### New Capabilities

- `message-outbox`: durable SQLite-backed intent queue for all client-initiated write operations against chat resources, with state machine, retry policy, coalesce semantics, foreground-only worker, and reactive subscriptions for future UX integration.

### Modified Capabilities

- `message-store-sqlite`: schema-version bump to v2 introducing the `outbox` and `outbox_metrics` tables alongside the existing `messages`/`conversations`/`sync_state`/`account_state`/`schema_version` tables; `wipeAllData` extends to clear them. No requirement changes to the existing read-path semantics.

## Impact

- **Mobile (`ChatApp/`):**
  - New module: `src/services/db/outboxRepository.ts` (repository following `messageRepository.ts` patterns).
  - New module: `src/services/sync/outboxProcessor.ts` (worker, dispatcher, handlers, error classifier, watchdog).
  - Modified: `src/services/db/migrations/index.ts` (add migration v2 with new tables + indexes).
  - Modified: `src/services/db/dbInit.ts` (extend `wipeAllData`; run AsyncStorage→outbox migration v→1 inside `initDb` after schema migrations).
  - New: `src/services/db/asyncStorageQueueBackfill.ts` (one-shot reader of legacy `'offline-queue'` AsyncStorage key, idempotent INSERT-OR-IGNORE into outbox).
  - Modified: `App.tsx` (start `outboxProcessor` after `initDb` in the existing local-first wire-up; pause it in the existing `unwireLocalFirst` chain).
  - Modified: `src/contexts/AuthContext.tsx` — pause `outboxProcessor` in `unwireLocalFirst` before `wipeAllData`. No flush on logout per the agreed instant-wipe UX (current logout has no spinner).
  - Test infra: extend `jest/mocks/op-sqlite.js` if needed and add an integration suite using `better-sqlite3` for partial unique index, `json_extract`, `CHECK` constraint, and nested-transaction behavior.
- **Backend:** no changes in this change. Backend reactions toggle→explicit-set lives in Change B.
- **High-risk areas touched (per `CLAUDE.md`):**
  - `AuthContext.tsx` — additive: only adds `outboxProcessor.pause()` to existing `unwireLocalFirst` chain; no logout-flow shape change.
  - `OfflineQueueService.ts` — UNTOUCHED in this change. Its rewrite is in Change B.
  - SQLite schema — additive new tables only; no changes to existing `messages`/`conversations` schema.
- **Feature flag:** outbox infrastructure is created but enqueueing still doesn't happen (no hook integration in this change). Effective gating is the existing `LOCAL_FIRST_SQLITE` flag — outbox is only initialized when local-first is on. No new flag introduced (per the locked decision: a single feature flag avoids quadrupling the test matrix).
- **Migration risk:** AsyncStorage `'offline-queue'` payload is read but NOT deleted in Change A. If migration v→1 fails midway, the transaction rolls back, AsyncStorage stays intact, and the app boots normally. Re-run on next launch is idempotent because the partial unique index plus `INSERT OR IGNORE` on `clientMessageId` (used as `dedup_key=null` rows tied to the existing UNIQUE index in the `messages` table) prevent duplicates.
- **Performance targets:**
  - `outboxRepository.enqueue` (single op, including coalesce check): ≤ 5 ms warm.
  - `outboxRepository.getDue(limit=N)`: ≤ 10 ms for N≤100, warm.
  - Migration v→1 backfill: ≤ 200 ms for ≤500 legacy queue items.
  - Worker tick scheduling overhead (no due rows): ≤ 1 ms.
- **Pre-flight verifications (Phase 0)** that gate the rest of the change:
  1. `UnreadService.resetUnreadCount` is set-to-zero, not decrement (so mark_read replay is safe).
  2. `@nestjs/throttler` rate config tolerates outbox bursts (≥30 req/min/user).
  3. op-sqlite v11.x runtime SQLite version ≥ 3.38 with `json_extract` available on Android emulator and iOS simulator.
  4. `transaction()` shim in `connection.ts:76-89` does not allow nested transactions silently (must throw or use SAVEPOINT).
  5. `'offline-queue'` AsyncStorage key has only `OfflineQueueService` and `asyncStorage` accessor as consumers.
  6. Device smoke: partial unique index, `json_extract`, and `CHECK` constraint behave as expected on a real op-sqlite engine.
  7. Backend `findByClientMessageId` dedup-hit return shape (existing message vs throw) — informs handler error path for `send_message`.
