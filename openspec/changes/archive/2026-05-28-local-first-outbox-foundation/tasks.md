## 0. Phase 0 — Pre-flight verifications

- [x] 0.1 Read `chat-backend/src/conversations/unread.service.ts` (or equivalent location); confirm `resetUnreadCount` is set-to-zero (not `$inc: -X`); record finding in design.md "Open Questions" section
- [x] 0.2 Read `chat-backend/src/app.module.ts` `ThrottlerModule.forRoot` config; confirm `limit / ttl` tolerates outbox bursts (≥30 req/min/user) or note required raise
- [x] 0.3 On Android emulator AND iOS simulator: temporarily wire `db.execute('SELECT sqlite_version()')` and `db.execute("SELECT json_extract('{\"a\":1}','$.a')")` into `dbInit`; confirm SQLite version ≥ 3.38 and `json_extract` returns `1` on both platforms; remove the temporary log after verification
- [x] 0.4 Read op-sqlite `cpp/sqlite3.c` header or run smoke test of `db.transaction(() => db.transaction(() => {}))`; confirm nested-transaction behavior (must throw or use SAVEPOINT, not silently corrupt); document outcome in design.md
- [x] 0.5 `grep -rn "offline-queue\|offlineQueue\|OFFLINE_QUEUE" ChatApp/src --include='*.ts' --include='*.tsx'`; confirm only `services/OfflineQueueService.ts` and `services/storage/asyncStorage.ts` accessor consume the key
- [x] 0.6 Device smoke test of schema critical paths (run AFTER Phase 1.3 lands): on Android emulator, exercise (a) duplicate INSERT into `outbox` with same `(op_type, dedup_key)` while both rows in `state='pending'` → expect UNIQUE violation; (b) `SELECT json_extract(payload_json, '$.replyTo')` on a row with replyTo set → expect non-null result; (c) INSERT with `state='garbage'` → expect CHECK constraint violation ← (verify: each scenario throws or returns expected value as documented in design.md)
- [x] 0.7 Read `chat-backend/src/messages/messages.controller.ts` `create` handler and `messages.service.ts` `createMessage` (or equivalent); confirm whether a dedup hit on `findByClientMessageId` returns the existing message or throws; record return shape in design.md so handler error path knows whether to treat as success or retryable

## 1. Phase 1 — Schema migration v2

- [x] 1.1 Add migration index 1 (= v2) to `MIGRATIONS[]` in `ChatApp/src/services/db/migrations/index.ts` with `CREATE TABLE IF NOT EXISTS outbox (...)` (13 columns + CHECK constraint per design.md Decision 1) and `CREATE TABLE IF NOT EXISTS outbox_metrics (...)`
- [x] 1.2 In the same migration, add `CREATE INDEX IF NOT EXISTS idx_outbox_due`, `CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_dedup` (partial), and `CREATE INDEX IF NOT EXISTS idx_outbox_in_flight` (partial)
- [x] 1.3 Extend `dbInit.wipeAllData` in `ChatApp/src/services/db/dbInit.ts` to `DELETE FROM outbox` and `DELETE FROM outbox_metrics` before clearing `account_state`
- [x] 1.4 Add migration unit test in `ChatApp/src/services/db/__tests__/migrations.spec.ts` (new file) covering: (a) v0→v2 fresh, (b) v1→v2 upgrade preserves existing `messages`/`conversations` rows, (c) running migration twice is idempotent ← (verify: schema matches design.md Decision 1, all three indexes exist via PRAGMA index_list, existing rows untouched)

## 2. Phase 2 — outboxRepository

- [x] 2.1 Create `ChatApp/src/services/db/outboxRepository.ts` with type definitions: `OutboxOpType`, `OutboxState`, `OutboxRow`, per-op payload interfaces (`SendMessagePayloadV1`, `ReactPayloadV1`, etc.)
- [x] 2.2 Implement `enqueue(opType, payload, options?)` with payload-size guard (≤10 KB), `clientMessageId` requirement check for `send_message`, dedup_key derivation per op_type, `INSERT ... ON CONFLICT(op_type, dedup_key) WHERE dedup_key IS NOT NULL DO UPDATE` for coalesce, last-write-wins for react/delete/delete_for_me, MAX(upToTimestamp) merge for mark_read
- [x] 2.3 Implement `getDue({ now, conversationLimit = 3 })` returning at most one due row per conversation, sorted by `(state='pending') AND next_retry_at <= now`, excluding `send_message` rows whose `payload.replyTo` starts with `'temp_'` AND no parent in `state='done'` exists
- [x] 2.4 Implement state transitions: `markInFlight(id)`, `markDone(id)`, `markRetryable(id, errorPayload)` (computes backoff `min(2^retry_count*1000 + jitter, 30000)`, increments `retry_count` for non-401), `markDeadLetter(id, errorPayload)`
- [x] 2.5 Implement `watchdogReset({ now })` — single `UPDATE` issuing both timeout buckets in one statement (240s for send_message else 30s); `send_message` rows older than 300s SHALL be moved to `dead_letter` with `code='WATCHDOG_TIMEOUT'`
- [x] 2.6 Implement `cascadeDeadLetter(parentClientMessageId)` — BFS over `outbox` finding rows whose `payload.replyTo === parentClientMessageId`, marking them `dead_letter` with `code='PARENT_FAILED'`, then recursing
- [x] 2.7 Implement `wipeAll()` — `DELETE FROM outbox; DELETE FROM outbox_metrics`; counter helpers `incrementMetric(key)` and `getMetrics()`
- [x] 2.8 Add unit tests in `ChatApp/src/services/db/__tests__/outboxRepository.spec.ts` covering: enqueue happy path per op_type, coalesce behavior per op_type, payload-size guard, missing clientMessageId guard, getDue ordering and reply-blocking filter, all four state transitions including backoff math, watchdog (both buckets, including send_message dead_letter at 5min), cascade dead_letter (single + recursive), wipeAll, counter increments. Target ≥ 60 tests
- [x] 2.9 Add integration suite under `ChatApp/src/services/db/__tests__/outboxRepository.integration.spec.ts` using `better-sqlite3` (add devDep + new `npm run test:integration` script in `ChatApp/package.json`); cover partial unique violation, `json_extract` on payload, CHECK constraint rejection, nested-transaction error handling, ON CONFLICT UPSERT atomicity ← (verify: integration tests must run against real SQLite, not the op-sqlite mock; partial unique violation throws with a recognizable message; CHECK constraint rejection throws)

## 3. Phase 3 — outboxProcessor

- [x] 3.1 Create `ChatApp/src/services/sync/outboxProcessor.ts` with module-level state (lock flag `_isTicking`, periodic interval handle, paused flag) and exported `tick()`, `scheduleTick()`, `start()`, `stop()`, `pause()`, `resume()`
- [x] 3.2 Implement dispatcher map keyed on `(op_type, payload_version)` returning a handler function; provide a typed `Handler` signature `(payload) => Promise<void | { code, status }>`
- [x] 3.3 Implement `send_message` handler: calls `messagesApi.send` with payload (substituting `replyTo` from `temp_*` → real id by reading the parent row from `messages` table), invokes `messageRepository.confirmSend` on success, returns; throws on failure for the dispatcher to classify
- [x] 3.4 Implement `react` handler: calls `messagesApi.toggleReaction` (Change A keeps the existing API; Change B will switch to explicit set after backend lands)
- [x] 3.5 Implement `delete` handler: calls `messagesApi.deleteMessage`; on 403 with code `MESSAGE_TOO_OLD` route to terminal dead_letter
- [x] 3.6 Implement `delete_for_me` handler: calls `messagesApi.deleteForMe`
- [x] 3.7 Implement `mark_read` handler: calls `messagesApi.markMessagesRead` with `payload.upToTimestamp`
- [x] 3.8 Implement error classifier `classifyError(err) → { code, status, hint }`; map fetch network errors to `NETWORK`, AbortError to `TIMEOUT`, 5xx to `5XX`, 401 to `401` (retryable, no counter), 403/409/412 to terminal, 4xx else to terminal `4XX`, 429 to retryable with `Retry-After` honored, JSON parse failure to `PARSE`; produce `hint` from closed allow-list
- [x] 3.9 Implement backoff calculator + jitter (already inside `markRetryable` per Phase 2.4 — 3.9 is the worker side: invoke `markRetryable`/`markDeadLetter` based on classifier output and current `retry_count` against MAX_RETRIES = 8)
- [x] 3.10 Wrap `tick()` entry through `InteractionManager.runAfterInteractions`; implement single-flight lock; on tick start invoke `watchdogReset` then loop pick-due-rows-process with 50 ms inter-request pacing per conversation; on tick end clear interval if no pending/in_flight rows remain ← (verify: tick is single-flight; concurrent triggers do not double-process; cap 3 conversations parallel; pacing observed via mocked timers)
- [x] 3.11 Add unit + mocked integration tests in `ChatApp/src/services/sync/__tests__/outboxProcessor.spec.ts` mocking `messagesApi`, NetInfo, AppState; cover handler routing, error classifier, backoff math, watchdog, cascade on send_message dead_letter, tick single-flight, foreground-only gate. Target ≥ 30 tests

## 4. Phase 4 — Trigger wiring + lifecycle

- [x] 4.1 In `outboxProcessor.start()`, register NetInfo listener (`@react-native-community/netinfo`) for `isConnected` true transitions → `scheduleTick()`
- [x] 4.2 Hook socket reconnect: extend the existing `socketService` 'connect' subscriber pattern in `syncOrchestrator.ts:217` to also call `outboxProcessor.scheduleTick()`
- [x] 4.3 Hook AppState 'active' transitions: extend the existing `AppState.addEventListener` pattern in `syncOrchestrator.ts:264` to also call `outboxProcessor.scheduleTick()` (after `watchdogReset` runs at tick start)
- [x] 4.4 Wire `enqueue()` (in `outboxRepository`) to call `outboxProcessor.scheduleTick()` after a successful insert/upsert
- [x] 4.5 Implement periodic 30 s backstop in `outboxProcessor.start()`: when at least one row is `pending`/`in_flight`, ensure interval is running; auto-clear it when count drops to 0; restart on next enqueue
- [x] 4.6 Update `unwireLocalFirst` in `AuthContext.tsx` (the existing teardown chain) to call `outboxProcessor.pause()` BEFORE the existing `wipeAllData()`; ensure no flush happens before pause ← (verify: logout teardown ordering — pause first, wipe second; no race with in-flight tick; pause is idempotent if called twice)

## 7. Phase 7 — AsyncStorage queue migration v→1

- [x] 7.1 Create `ChatApp/src/services/db/asyncStorageQueueBackfill.ts` — read AsyncStorage `'offline-queue'` key, JSON.parse defensively (skip invalid items, log warn `[outbox] backfill_skip_item`), map each `QueuedMessage` to `send_message` outbox row payload (preserve `clientMessageId`, set `state='dead_letter'` for items whose legacy `status='failed'`, else `state='pending'`)
- [x] 7.2 In `dbInit.ts`, after schema migrations and before backfill-from-MMKV, read `outbox_migration_version` from `sync_state`; if `< 1`, run `asyncStorageQueueBackfill()` inside a single transaction; on success, set `outbox_migration_version='1'`; on failure, log warn `[outbox] migration_v1_failed` and continue boot
- [x] 7.3 Verify AsyncStorage `'offline-queue'` key is NOT deleted in this change (deletion is reserved for `outbox_migration_version=2` in Change B); add a comment in `asyncStorageQueueBackfill.ts` linking to Change B
- [x] 7.4 Add unit tests `ChatApp/src/services/db/__tests__/asyncStorageQueueBackfill.spec.ts` covering: empty queue → no-op + version=1, well-formed items → correct rows + version=1, items with status='failed' → outbox state='dead_letter', invalid JSON → skip + warn + version=1, partial item missing required field → skip
- [x] 7.5 Add a migration counter test verifying skip-version: simulate `outbox_migration_version='0'`, run `dbInit` twice, expect first run sets `'1'` and second run no-ops; simulate `'1'`, run `dbInit`, expect no backfill attempted ← (verify: counter advances exactly once per migration boundary; AsyncStorage stays intact in Change A)

## 9. Phase 9.1 — Telemetry log scaffolding

- [x] 9.1 Add a small helper `ChatApp/src/services/sync/outboxLog.ts` exporting `logOutbox(event, fields)` that emits `console.log('[outbox]', event, sanitized_fields)` and increments the corresponding counter via `outboxRepository.incrementMetric`; call it from every state transition in Phase 2 functions and from Phase 3 watchdog/cascade/dispatcher; ensure no `payload_json`, no URLs, no headers, no tokens are passed to fields ← (verify: grep `logOutbox(` finds emissions at every state transition; sample log lines contain only allow-listed fields)

## Final acceptance gate (Change A definition of done)

- [x] A.1 Run `npx jest` in `ChatApp/`; existing 48 tests still pass; new tests from Phases 2.8, 3.11, 7.4, 7.5 all pass
- [x] A.2 Run `npm run test:integration` in `ChatApp/`; better-sqlite3 integration suite from Phase 2.9 passes
- [ ] A.3 Migration v0→v2 and v1→v2 verified on Android emulator; existing `messages` and `conversations` rows preserved
- [x] A.4 No new ESLint or TypeScript errors introduced (`npm run lint`, `npx tsc --noEmit`)
- [x] A.5 Phase 0 verification report appended to `openspec/changes/local-first-outbox-foundation/design.md` "Open Questions" section with PASS/FAIL per item; any FAIL resolved before merge
- [ ] A.6 `gitnexus_detect_changes()` confirms only expected symbols/processes are affected
- [x] A.7 No production behavior change visible to users yet (Change A is dormant infrastructure; outbox is initialized but no hook enqueues into it) ← (verify: legacy MMKV path still works; local-first path still works exactly as before; outbox table exists but rows count = 0 after a normal session unless AsyncStorage backfill produced rows)
