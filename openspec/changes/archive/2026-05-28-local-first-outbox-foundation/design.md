## Context

KOOLA's local-first SQLite read path shipped in `2026-05-25-local-first-sqlite-messages` (commits `cb5cc64`, `65856af`, `53df193`, `292605e`, `4cefab3`). Read-side is now SQLite-canonical when `LOCAL_FIRST_SQLITE` is on. The write path was deliberately out of scope (Decision 9 of that change's `design.md`):

> *"OfflineQueueService stays out of scope... `useMessages.sendMessage` calls `messagesApi.send` directly without going through the queue. Reworking this to share SQLite persistence would expose existing inconsistency and increase scope materially. The follow-up change `local-first-offline-queue-unification` (TBD) will collapse the two paths."*

The current state has three problems:

1. **Two parallel persistence layers**. `OfflineQueueService` persists to AsyncStorage (`'offline-queue'` key), is consumed only by `useOfflineQueue.sendViaQueue` (visible in the Compose flow), and only handles `send_message`. `useMessagesFromDb` (the local-first hook) bypasses this queue entirely and calls `messagesApi.send` directly with `markFailed` on error.
2. **No durable retry for non-message ops**. `react`, `delete`, `delete_for_me`, and read-receipt actions are all fire-and-forget in `useMessagesFromDb.ts:357-411`. A network drop = the action is lost; user sees the optimistic UI revert with no audit trail.
3. **No retry-on-restart for failed sends**. A row marked `status='failed'` in `messages` table has no background worker watching it. The user must re-open the conversation and tap retry manually.

Verified production status (`ChatApp/android/app/build.gradle`):

- `applicationId = "com.chatapp"`, `versionCode = 1`, `versionName = "1.0"`
- No Play Store / TestFlight signing infrastructure in the repo
- App is pre-launch — breaking client-server contract changes are free (relevant for Change B's reactions toggle→explicit-set)

Verified observability stack:

- Mobile: `@react-native-firebase/messaging` only; no Sentry, Datadog, Crashlytics
- Backend: Nest default Logger only; no Sentry, pino, winston, OpenTelemetry, prom-client

Telemetry strategy adapts to this baseline: structured `[outbox]` logs through Nest Logger / `console.*`, plus a SQLite counters table.

This change builds the durable foundation. Hook integration, backend reactions BREAKING change, and dead-letter UX are deferred to Change B (`local-first-outbox-integration`).

## Goals / Non-Goals

**Goals:**

- Single durable source-of-truth for client-initiated write intents on chat resources, persisted in SQLite alongside messages and conversations.
- State machine that survives app restart, crash, and background suspension, recovering automatically via watchdog reset on next foreground tick.
- Coalesce semantics that match each op's intent (e.g., one mark_read row per conversation, one react row per `(message, user)` pair, every send_message independent).
- Per-conversation order preservation for `send_message` while allowing parallel processing across up to three conversations.
- Reply-chain integrity: a reply whose parent is still optimistic (`temp_*`) is held; a reply whose parent dead-letters cascades to dead-letter as well.
- Foreground-only execution that costs nothing in background and self-heals on resume.
- Forward-compatible payload schema (`payload_version`) so future ops can extend without destructive migration.
- Three-tier test coverage: in-memory mock (fast), better-sqlite3 integration (schema semantics), device smoke (real op-sqlite).

**Non-Goals:**

- Wiring outbox into UI hooks (Change B).
- Backend `POST /messages/:id/reactions` toggle→explicit-set (Change B).
- Dead-letter inline bubble UX, ConversationListScreen red subtitle (Change B).
- Rewriting `OfflineQueueService` backing while preserving its public API (Change B).
- Background processing while app suspended (separate change `outbox-background-processing`).
- E2E encryption of `koola.db`, FTS5 search, CRDT, Sentry wiring (each their own change).
- Schema rollback / downgrade migration — forward-only matches existing migration runner pattern.
- Pre-logout "you have unsent messages" confirmation dialog (separate UX change).

## Decisions

### Decision 1: Outbox schema — 13 columns, 3 indexes, partial unique on `dedup_key`

```sql
CREATE TABLE outbox (
  id              TEXT    PRIMARY KEY NOT NULL,         -- UUID v7 (sortable)
  op_type         TEXT    NOT NULL,                     -- 'send_message' | 'react' | 'delete' | 'delete_for_me' | 'mark_read'
  payload_version INTEGER NOT NULL DEFAULT 1,
  payload_json    TEXT    NOT NULL,
  conversation_id TEXT    NOT NULL,                     -- required for ALL ops to enable per-conv ordering
  message_id      TEXT,                                 -- real or temp id for react/delete/delete_for_me; NULL for send_message and mark_read
  dedup_key       TEXT,                                 -- coalesce key (see Decision 3)
  state           TEXT    NOT NULL DEFAULT 'pending'
                  CHECK (state IN ('pending','in_flight','done','dead_letter')),
  retry_count     INTEGER NOT NULL DEFAULT 0,
  next_retry_at   INTEGER NOT NULL DEFAULT 0,           -- ms epoch
  in_flight_at    INTEGER,                              -- ms epoch when state moved to in_flight; NULL otherwise
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  last_error      TEXT,                                 -- JSON {code, status, hint}, ≤500 chars
  last_error_at   INTEGER
);

CREATE INDEX idx_outbox_due
  ON outbox (state, next_retry_at, conversation_id, created_at);

CREATE UNIQUE INDEX idx_outbox_dedup
  ON outbox (op_type, dedup_key)
  WHERE dedup_key IS NOT NULL AND state IN ('pending','in_flight');

CREATE INDEX idx_outbox_in_flight
  ON outbox (state, in_flight_at)
  WHERE state = 'in_flight';
```

**Rationale**: 

- `conversation_id` mandatory on every op (even `mark_read`) gives the worker a single column to group by for ordering. Costs ~30 bytes per row.
- `message_id` separate from `dedup_key` because `mark_read` has no message_id but does have a dedup_key (`conversationId`); `send_message` has no message_id and no dedup_key.
- `dedup_key` partial unique index restricted to `state IN ('pending','in_flight')` lets a `done` row coexist with a fresh `pending` row for the same key — necessary for repeated mark_read or repeated react-toggle by the same user on the same message.
- `in_flight_at` separate from `updated_at` to keep watchdog query a clean equality filter on `state` plus range on `in_flight_at`.

**Alternatives considered**:

- *Single `state_at` column instead of separate `next_retry_at` and `in_flight_at`*: rejected — watchdog and due-row queries have different access patterns; combining requires `CASE WHEN state=...` everywhere.
- *Store `payload` as separate columns per op_type*: rejected — five op shapes are too divergent (`send_message` has 9 fields, `mark_read` has 1) and the table would be 90% NULL.

### Decision 2: State machine — four states, no intermediate "settled"

`pending → in_flight → done | dead_letter` with `pending` reachable from `in_flight` via retryable error. A `done` row is terminal; `dead_letter` is terminal but user-actionable.

**Rationale**: Four states is the minimum that cleanly separates "worker should pick this up" (`pending`), "worker is working on this" (`in_flight`), "successfully shipped" (`done`), and "needs user attention or silent abandonment" (`dead_letter`). Adding `succeeded_pending_confirmation` or similar over-engineers the state diagram for no observable benefit — confirmSend is still a single transition.

### Decision 3: Coalesce keys per op_type

| op_type | dedup_key | UPSERT semantics |
|---|---|---|
| `send_message` | `NULL` | Always INSERT (each message intent independent) |
| `react` | `<messageId>+<userId>` | UPSERT, last-write-wins on `payload.emoji` (handles emoji change before flush) |
| `delete` | `<messageId>` | UPSERT, idempotent |
| `delete_for_me` | `<messageId>` | UPSERT, idempotent |
| `mark_read` | `<conversationId>` | UPSERT, take `MAX(payload.upToTimestamp)` |

`<userId>` in react's dedup_key is the current authenticated user (one row per user-message pair).

**Rationale**: This solves the throughput question for `mark_read` directly — a user opening 100 conversations and scrolling produces at most 100 rows even with 500 raw mark events. The partial unique index makes the UPSERT atomic.

**Alternatives considered**:

- *Pure generic dispatcher (no coalesce)*: rejected — mark_read storm during fast scroll = hundreds of rows.
- *Per-op handler with per-op tables*: rejected — five tables × five repository APIs × five test suites = duplication outweighs flexibility.
- *Coalesce window by time (e.g., merge if within 100 ms)*: rejected — dedup_key is exact and predictable; time-based coalesce is harder to reason about and not needed.

### Decision 4: Watchdog — 240 s for `send_message`, 30 s for other ops

`send_message` watchdog timeout is **240 s**, chosen to sit safely below the backend's 5-minute (`messages.service.ts:643-653`) `findByClientMessageId` dedup window. A 60 s buffer protects against the race where a Mongo insert lands at server-time `t=1s`, response packet is lost, and the watchdog reset+replay would otherwise race the dedup horizon.

Other ops (`react` after Change B's explicit-set, `delete`, `delete_for_me`, `mark_read`) all have natural backend idempotency (`$addToSet`, explicit set, soft-delete boolean), so a 30 s timeout (= 2× `apiService.timeout` of 15 s + buffer) is enough.

**Watchdog SQL**:

```sql
UPDATE outbox 
SET state='pending', 
    next_retry_at = (strftime('%s','now') * 1000),
    updated_at    = (strftime('%s','now') * 1000)
WHERE state = 'in_flight'
  AND (
    (op_type = 'send_message' AND in_flight_at < (strftime('%s','now') * 1000) - 240000)
    OR
    (op_type != 'send_message' AND in_flight_at < (strftime('%s','now') * 1000) - 30000)
  );
```

Plus a special case: `send_message` rows whose `in_flight_at` is older than 5 minutes (i.e. older than backend dedup window) are routed to `dead_letter` with `code='WATCHDOG_TIMEOUT'` rather than reset, to avoid the duplicate-creation race when backend has already lost dedup.

### Decision 5: Foreground-only execution

Outbox processor only runs while `AppState === 'active'`. Background suspension (iOS 30 s grace, Android Doze) leaves rows in `in_flight`; the watchdog resets them on next foreground tick. Every op is idempotent so replay is safe.

**Rationale**: Adding background processing requires a new native dependency (`react-native-background-fetch` or similar), changes the blast radius into native code review territory, and yields modest UX gain (user is aware of pending state via the optimistic bubble). Inbound is already covered by the existing FCM push pipeline.

User awareness: pending bubble icon and (Change B) dead-letter inline bubble UX are sufficient to communicate state.

### Decision 6: Five trigger sources, single-flight tick

`outboxProcessor.tick()` is single-flight via a JS-thread boolean lock. Five sources call `scheduleTick()` (which goes through `InteractionManager.runAfterInteractions` to yield to user gestures):

1. NetInfo `isConnected` transition `false → true`
2. Socket reconnect event (extend the existing pattern in `syncOrchestrator.ts:217`)
3. `AppState 'active'` transition (extend the existing pattern in `syncOrchestrator.ts:264`)
4. Any `enqueue()` call
5. Periodic 30 s backstop while at least one row is in `pending`/`in_flight`; auto-stop interval when count drops to zero (battery)

`enqueue()` from a user tap (`scheduleTick()` is debounced inside `InteractionManager`; the user already paid the gesture cost so processor latency is acceptable).

### Decision 7: Per-conversation serial, cross-conversation parallel cap 3, 50 ms inter-request pacing

Worker iteration:

```
SELECT conversation_id, MIN(created_at)
FROM outbox
WHERE state = 'pending' AND next_retry_at <= now
GROUP BY conversation_id
LIMIT 3
```

For each picked conversation, dispatch the row with `MIN(created_at)` for that conversation, await the dispatcher, sleep 50 ms, loop back.

**Rationale**:

- Sequential within conversation preserves backend timestamp order (Mongoose `timestamps: true` sets `createdAt` server-side; client-order on the wire = server-order in the document).
- Cap 3 keeps backend Throttler happy and avoids Socket.IO fanout storms when 1000 messages clear at once.
- 50 ms pacing = max ~60 req/s aggregate on the wire; a 1000-message backlog clears in ~17 s.
- Separate from per-handler concerns (each handler is unaware of pacing).

### Decision 8: Reply blocking + cascade dead-letter

A `send_message` row whose `payload.replyTo` starts with `temp_` is HELD (excluded from `getDue`) until a row with that `clientMessageId` reaches `done` AND its `messages` row has been promoted to a real id (the existing `confirmSend` and `upsertMany` reconciliation in `messageRepository.ts:225-280` already do this).

**SQL filter for getDue**:

```sql
... AND (
  json_extract(payload_json, '$.replyTo') IS NULL
  OR json_extract(payload_json, '$.replyTo') NOT LIKE 'temp_%'
)
```

When a `send_message` row enters `dead_letter`, the processor BFS-walks the outbox to mark every row whose `payload.replyTo` references the failing row's `clientMessageId` (or `tempId`) as `dead_letter` with `code='PARENT_FAILED'`. Cascade is recursive — replies of replies cascade too. User retry of the parent does NOT auto-revive cascaded children (context may be stale); user must explicitly retry each.

### Decision 9: `last_error` schema-fixed, no PII

```json
{
  "code": "NETWORK | TIMEOUT | 4XX | 5XX | 401 | 403 | 404 | 429 | PARSE | PARENT_FAILED | UNSUPPORTED_VERSION | WATCHDOG_TIMEOUT",
  "status": 404,
  "hint": "Resource not found"
}
```

`hint` is selected from a closed allow-list per `code`. Server response body, request URL with query params, headers, tokens, stack traces are NEVER persisted. Cap 500 chars at insert time.

**Rationale**: `last_error` is for UI hint, telemetry aggregation, and user-bug-report debugging — none of which need the raw payload. PII risk + DB bloat eliminate the case for raw bodies.

### Decision 10: Outbox is the intent source of truth; `messages` is a projection

Mapping:

| Outbox transition | `messages` effect |
|---|---|
| `pending → in_flight` | unchanged (still `'pending'`) |
| `in_flight → done` for `send_message` | `confirmSend(tempId, realId, clientMessageId, serverFields)` (existing API) |
| `in_flight → dead_letter` for `send_message` | `markFailed(tempId)` (existing API) |
| `pending → dead_letter` cascade | same as above |
| User retry from dead_letter | outbox row → `pending`; `messages.status` → `'pending'` |
| User delete from dead_letter | DELETE outbox row + DELETE messages row in one transaction |

Self-heal: if app crashes between `outbox.markDone` and `confirmSend`, the next `/messages/sync` pulls the message and `upsertMany`'s clientMessageId-promotion logic (`messageRepository.ts:321-380`) merges the temp row to the real id. Outbox row stays `done`; cleanup job (Change B) prunes it after 24 h.

### Decision 11: Migration counter `outbox_migration_version`, forward-compat skip-version

Stored in the existing `sync_state` table as a string. Logic in `dbInit`:

```ts
const v = parseInt(syncStateRepository.getValue('outbox_migration_version') ?? '0', 10);
if (v < 1) {
  await runAsyncStorageQueueBackfill();        // single SQLite transaction; AsyncStorage NOT deleted
  syncStateRepository.setValue('outbox_migration_version', '1');
}
// v < 2 step is reserved for Change B: AsyncStorage.removeItem('offline-queue')
```

**Rationale**: Counter (vs boolean) handles the skip-version case (release N-1 → N+1 user) — every step that hasn't run runs in order. Idempotent because the partial unique index plus `INSERT OR IGNORE` on existing message clientMessageIds prevent duplicates if the migration partially runs and re-runs.

### Decision 12: Single feature flag `LOCAL_FIRST_SQLITE`, no separate `OUTBOX_ENABLED`

Outbox is initialized only when `isLocalFirstEnabled()`. Adding a second flag would quadruple the test matrix without buying anything (legacy MMKV path has its own `OfflineQueueService`-via-`useOfflineQueue` queue that this change does not touch).

If a kill switch becomes necessary later, it can be added as a runtime pause (via `outboxProcessor.pause()`) plumbed through remote config — no schema or code surface change required.

### Decision 13: Logout = instant wipe, switch account = wipe (no flush)

Verified `AuthContext.logout` (`AuthContext.tsx:281-307`) has no spinner UI; it is a fire-and-forget async with two server roundtrips already (`pushNotificationService.unregisterToken` + `authApi.logout`). Adding 3 s of outbox flush on top = degraded UX with no clear signal for the user.

`unwireLocalFirst` is extended to call `outboxProcessor.pause()` BEFORE `wipeAllData()`. Pending outbox rows are wiped along with messages/conversations/sync_state. User-visible: any unsent messages disappear on logout. Mitigation = pre-logout dialog ("You have N unsent messages") in a separate UX change.

Switch account uses the existing cross-account guard in `dbInit.ts:50-58` — `wipeAllData` already runs before re-migration; outbox is included automatically.

### Decision 14: Three-tier test strategy

1. **Unit tests with op-sqlite mock** (existing pattern, `jest/mocks/op-sqlite.js`): repository logic, dispatcher, error classifier, backoff calculator, watchdog reset, cascade. Target: 60+ tests.
2. **Integration tests with `better-sqlite3`** (new): partial unique index UNIQUE violation, `json_extract` correctness, `CHECK` constraint enforcement, nested transaction behavior, migration v→1 idempotency. Target: 10–15 tests in a separate `*.integration.spec.ts` suite under a `npm run test:integration` script.
3. **Device smoke test** (manual checklist in Phase 0 task 0.6): three SQL snippets on Android emulator + iOS simulator confirming partial unique violation throws, `json_extract` returns expected value, and `CHECK` rejects out-of-domain `state` values.

**Rationale**: Mock-only would mask SQLite-specific semantics (partial index, json1, CHECK). better-sqlite3 in CI provides those without needing a device. Device smoke catches op-sqlite-specific quirks that even better-sqlite3 wouldn't.

### Decision 15: Telemetry — structured `[outbox]` logs + `outbox_metrics` counter table

No Sentry in either repo (verified). Telemetry adapts:

- **Logs**: `console.log/warn` with `[outbox]` prefix at every state transition. JSON-serialized payload sans PII. Mobile reads in Logcat / Xcode Console; backend (Change B) reads via Nest Logger.
- **Counters**: `outbox_metrics(key TEXT PRIMARY KEY, value INTEGER, updated_at INTEGER)` table. Increment on each event (`enqueued_total`, `done_total`, `dead_letter_total`, `retry_total`, `watchdog_reset_total`).
- **Dev helper**: `dbg.outboxStats()` returns aggregate JSON for a settings/dev screen.
- **Thresholds** (computed at read-time, not enforced in this change): info ≥2 % dead-letter rate over 1 h; error ≥3 %; soft rollback (`outboxProcessor.pause()`) ≥5 %. The pause action is added in this change but the threshold trigger is a follow-up (probably with Sentry wiring).

## Risks / Trade-offs

- **[Risk] Backend `findByClientMessageId` 5-minute window not designed for cross-session retry** → Mitigation: Decision 4's 240 s watchdog plus the 5-minute dead-letter ceiling. Documented in `WARNINGS.md` of this change as a backend-hardening follow-up: extend window to 24 h or rely on `(clientMessageId, conversationId)` UNIQUE.
- **[Risk] op-sqlite `transaction()` shim does not reentrant — nested transactions throw** → Mitigation: dispatcher and worker callers use explicit single-level transactions; Phase 0 task 0.4 verifies behavior; integration test exercises a deliberate nested-transaction case.
- **[Risk] `json_extract` requires SQLite ≥ 3.38** → Mitigation: Phase 0 task 0.3 verifies on both platforms before any code lands; modern op-sqlite (≥ 11.x) bundles a recent SQLite, so this is a sanity check rather than an expected blocker.
- **[Risk] AsyncStorage `'offline-queue'` consumed by code outside `OfflineQueueService`** → Mitigation: Phase 0 task 0.5 grep audit. Backfill is INSERT-OR-IGNORE so even if a race wrote concurrently, no duplicates.
- **[Risk] User has 1000+ pending rows after long offline period** → Mitigation: pacing (50 ms) plus parallel cap 3 means ~60 req/s aggregate; 1000 rows clear in ~17 s, observable through pending-count UI signal in Change B. No row eviction in Change A (rows are kept; cleanup of `done` rows comes in Change B).
- **[Risk] Race on concurrent `enqueue()` for same dedup_key** → Mitigation: `INSERT ... ON CONFLICT(op_type, dedup_key) WHERE dedup_key IS NOT NULL DO UPDATE` (atomic UPSERT in SQLite ≥ 3.24).
- **[Risk] Migration v→1 fails midway** → Mitigation: single transaction; AsyncStorage left intact on rollback; next launch retries; logged via `[outbox] migration_v1_failed` warn.
- **[Risk] InteractionManager unavailable or misbehaves on a platform** → Mitigation: assumption added (B5); Phase 0 device smoke covers; fallback in code is to call `tick()` directly with a `setTimeout(_, 0)` yield if `InteractionManager` is unexpectedly missing.
- **[Trade-off] Foreground-only means stuck `in_flight` rows don't retry until next app open** — accepted; mitigated by watchdog + idempotent ops + user-visible pending bubble.
- **[Trade-off] No cleanup of `done` rows in Change A** — acceptable in Change A (table size in MB even with hundreds of done rows); cleanup in Change B's `dbInit`.

## Migration Plan

1. **Phase 0 verifications** (gating; 7 checks). Any FAIL is a blocker — resolve before Phase 1.
2. **Phase 1 schema migration**: bump `koola.db` to v2, idempotent forward-only `CREATE TABLE IF NOT EXISTS` + `CREATE INDEX IF NOT EXISTS`. Existing v1 DB with messages/conversations data upgrades cleanly.
3. **Phase 2 outboxRepository** (depends on Phase 1).
4. **Phase 3 outboxProcessor** (depends on Phase 2).
5. **Phase 4 trigger wiring** (depends on Phase 3); `unwireLocalFirst` extension lands here.
6. **Phase 7 AsyncStorage backfill migration** (depends on Phase 2; can run in parallel with Phase 3): only the v→1 step in Change A. AsyncStorage payload remains intact on disk.
7. **Phase 9.1 telemetry log scaffolding** (independent; can run in parallel with all other phases).

**Rollback strategy**:

- **Soft**: `outboxProcessor.pause()` — rows accumulate but no retry; no data loss.
- **Hard**: flip `LOCAL_FIRST_SQLITE` flag off → legacy MMKV path resumes; outbox rows orphan in SQLite but are not deleted (kept for debug). Change B's hook integration is what would actually break; Change A's outbox table is dormant by design.
- **Schema rollback**: forward-only — emergency-only path is to ship a hotfix migration v3 that drops `outbox` and `outbox_metrics` and resets `outbox_migration_version` to 0. Used only if migration v→1 corrupts AsyncStorage payload (unlikely; backfill is read-only on AsyncStorage in Change A).

## Open Questions

- **Q-A**: Should `outboxRepository.subscribe` exist in Change A, or only in Change B when UI needs to watch state changes? Decision: Change B. Outbox state-change UI is part of dead-letter bubble work. Change A keeps subscribe API absent to minimize surface.
- **Q-B**: Final migration v=2 step (AsyncStorage `'offline-queue'` deletion) — Change A or Change B? Decision: Change B, after at least one release of telemetry has confirmed v→1 backfill is reliable in the wild.
- **Q-C**: Outbox row `id` generation — UUID v7 vs ULID vs UUID v4? Decision: UUID v7 (sortable, ms-precision, libraries available in `uuid` package which is already a dependency on the backend; verify mobile package.json before committing). Falls back to UUID v4 if v7 unavailable in the installed `uuid` version.

## Phase 0 Verification Report

Verified 2026-05-28 during Change A implementation.

### 0.1 UnreadService.resetUnreadCount — PASS

File: `chat-backend/src/conversations/services/unread.service.ts:52-58`

`resetUnreadCount` uses `{ $set: { unreadCount: 0 } }` — set-to-zero, not `$inc`. Mark-read replay is safe; replaying the same mark_read op will always converge to 0 regardless of how many times it runs.

### 0.2 ThrottlerModule rate config — PASS

File: `chat-backend/src/app.module.ts:32-41`

Config: `ttl: 60000, limit: 60` (default tier) and `ttl: 60000, limit: 1000` (second tier). The outbox worker caps at 3 conversations × serial dispatch = at most ~60 req/min aggregate under normal conditions. The 60 req/min limit is exactly at the boundary; the 1000 req/min second tier provides headroom for burst recovery after long offline periods. No config raise required for Change A. Note: if Change B enables bulk mark_read replay, the 60 req/min limit may need raising to 120 for the default tier.

### 0.3 SQLite version + json_extract — DEFERRED (device smoke required)

op-sqlite v11.x bundles a recent SQLite (≥ 3.45 per op-sqlite changelog). The `json_extract` function is available in SQLite ≥ 3.9.0 (2015). Version ≥ 3.38 is required for the partial unique index `WHERE` clause syntax (available since SQLite 3.8.9, 2015). Both requirements are well within the bundled version range.

**Deferred verification**: Cannot run device smoke in this environment. To verify on device:
```js
// Add temporarily to dbInit.ts after runMigrations():
const ver = db.execute("SELECT sqlite_version() as v");
const json = db.execute("SELECT json_extract('{\"a\":1}','$.a') as v");
console.log('[smoke] sqlite_version=', ver.rows._array[0].v);
console.log('[smoke] json_extract=', json.rows._array[0].v); // expect 1
```
Run on Android emulator (API 33+) and iOS simulator (iOS 16+). Expected: version ≥ 3.38, json_extract returns `1`. Remove after verification.

**Risk**: LOW — op-sqlite 11.x bundles SQLite 3.45+; this is a sanity check.

### 0.4 Nested transaction behavior — PASS (static analysis)

File: `ChatApp/src/services/db/connection.ts:76-89`

The `transaction(fn)` shim uses explicit `BEGIN / COMMIT / ROLLBACK` via `executeSync`. SQLite does not support nested `BEGIN` — a second `BEGIN` inside an active transaction throws `"cannot start a transaction within a transaction"`. The shim does not use SAVEPOINTs. Therefore nested `db.transaction(() => db.transaction(() => {}))` will throw at the inner `BEGIN`.

**Implication for outboxRepository**: All repository functions that call `db.transaction()` must NOT be called from within another `db.transaction()` call. The dispatcher and worker callers use single-level transactions only. Integration test in Phase 2.9 exercises this deliberately.

### 0.5 AsyncStorage 'offline-queue' key consumers — PASS (with note)

Grep result: The AsyncStorage key is `'offline_queue'` (underscore), defined in `asyncStorage.ts:7` as `KEYS.OFFLINE_QUEUE = 'offline_queue'`. The tasks.md and proposal.md reference `'offline-queue'` (hyphen) — this is a documentation inconsistency. The actual key in use is `'offline_queue'`.

Consumers of this key:
- `asyncStorage.getOfflineQueue()` / `setOfflineQueue()` / `clearOfflineQueue()` — the accessor layer
- `OfflineQueueService.restore()` and `persist()` — the sole business-logic consumer

No other file reads `KEYS.OFFLINE_QUEUE` directly. The backfill in Phase 7 must use `asyncStorage.getOfflineQueue()` (which reads `'offline_queue'`), not the string `'offline-queue'`.

### 0.6 Device smoke test — DEFERRED

Depends on Phase 1.3 landing (outbox table must exist). Cannot run on device in this environment.

**Checklist for manual verification after Phase 1 lands**:
1. Duplicate INSERT with same `(op_type, dedup_key)` while both rows `state='pending'` → expect UNIQUE violation (SQLite error code SQLITE_CONSTRAINT_UNIQUE).
2. `SELECT json_extract(payload_json, '$.replyTo')` on a row with replyTo set → expect non-null result matching the inserted value.
3. INSERT with `state='garbage'` → expect CHECK constraint violation (SQLite error code SQLITE_CONSTRAINT_CHECK).

**Risk**: LOW — partial unique index and CHECK constraints are standard SQLite features; better-sqlite3 integration tests in Phase 2.9 cover the same semantics.

### 0.7 Backend findByClientMessageId dedup return shape — PASS

File: `chat-backend/src/messages/messages.service.ts:643-653`

`findByClientMessageId(conversationId, clientMessageId)` returns `MessageDocument | null` — it returns the existing document (not throws) on a dedup hit, or `null` if not found or outside the 5-minute window.

The `sendMessage` handler in `messages.controller.ts` does NOT call `findByClientMessageId` before creating — it calls `messageModel.create()` directly. The dedup is enforced at the MongoDB schema level (unique index on `clientMessageId` per conversation). A duplicate `clientMessageId` within 5 minutes will cause a MongoDB duplicate key error (E11000), which NestJS surfaces as a 500 (unhandled) or 409 depending on the error filter.

**Implication for outbox send_message handler**: On a 5xx response to a send_message dispatch, the error classifier routes to `5XX` (retryable). If the backend has already persisted the message (dedup window), the retry will hit the unique index and return 500 again — the watchdog's 240s ceiling prevents infinite retry. The `/messages/sync` endpoint will reconcile the message on next foreground sync regardless. This is acceptable for Change A; Change B should add explicit dedup handling (check `findByClientMessageId` before retry or use idempotency key header).

### UUID v7 availability — PASS

`uuid` package version `^11.1.0` is installed in `ChatApp/package.json`. `uuid` v11 exports `v7` (confirmed in `node_modules/uuid/dist/cjs/index.js`). Use `import { v7 as uuidv7 } from 'uuid'` in outboxRepository.
