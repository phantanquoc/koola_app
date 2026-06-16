## ADDED Requirements

### Requirement: Outbox Table as Single Source of Truth for Write Intents

The mobile app SHALL maintain an `outbox` table in the on-device SQLite database (`koola.db`) that is the single durable source-of-truth for client-initiated write intents on chat resources. Every write op SHALL be represented as exactly one row in this table during its lifecycle (with op-specific coalesce semantics).

#### Scenario: Required columns exist after migration

- **WHEN** schema migration v2 has been applied
- **THEN** the `outbox` table SHALL contain at least the columns `id` (TEXT PK), `op_type` (TEXT), `payload_version` (INTEGER, default 1), `payload_json` (TEXT), `conversation_id` (TEXT), `message_id` (TEXT, nullable), `dedup_key` (TEXT, nullable), `state` (TEXT with `CHECK` constraint over `'pending' | 'in_flight' | 'done' | 'dead_letter'`), `retry_count` (INTEGER, default 0), `next_retry_at` (INTEGER, ms epoch, default 0), `in_flight_at` (INTEGER, nullable), `created_at` (INTEGER), `updated_at` (INTEGER), `last_error` (TEXT, nullable), and `last_error_at` (INTEGER, nullable)
- **AND** the `state` column's `CHECK` constraint SHALL reject inserts or updates with values outside the four allowed states

#### Scenario: Hot-path indexes exist

- **WHEN** schema migration v2 has been applied
- **THEN** index `idx_outbox_due` on `(state, next_retry_at, conversation_id, created_at)` SHALL exist for due-row selection
- **AND** a partial UNIQUE index `idx_outbox_dedup` on `(op_type, dedup_key)` WHERE `dedup_key IS NOT NULL AND state IN ('pending','in_flight')` SHALL exist for coalesce enforcement
- **AND** a partial index `idx_outbox_in_flight` on `(state, in_flight_at)` WHERE `state = 'in_flight'` SHALL exist for watchdog scans

#### Scenario: All outbox writes go through the repository

- **WHEN** any code path enqueues, transitions, or wipes outbox rows
- **THEN** the access SHALL be through `outboxRepository` exported functions
- **AND** UI code SHALL NOT write raw SQL against `outbox`

### Requirement: Five Op Types with Versioned Payloads

The outbox SHALL support exactly five op types in this change: `send_message`, `react`, `delete`, `delete_for_me`, and `mark_read`. Each op type SHALL carry a `payload_version` (default 1) and a JSON-serialized payload whose shape is op-specific.

#### Scenario: send_message payload shape (v1)

- **WHEN** a `send_message` row is enqueued
- **THEN** `payload_json` SHALL contain at minimum `{ content, type, clientMessageId }` and optionally `{ mediaUrl, mediaMimeType, mediaSize, mediaDuration, replyTo }`
- **AND** `dedup_key` SHALL be `NULL`
- **AND** `message_id` SHALL be `NULL`
- **AND** `conversation_id` SHALL be the target conversation id

#### Scenario: react payload shape (v1)

- **WHEN** a `react` row is enqueued
- **THEN** `payload_json` SHALL contain `{ messageId, emoji }` where `emoji` is a string or `null` (null indicates clear)
- **AND** `dedup_key` SHALL be the concatenation of `messageId + ':' + currentUserId`
- **AND** `message_id` SHALL be the target message id

#### Scenario: delete and delete_for_me payload shape (v1)

- **WHEN** a `delete` or `delete_for_me` row is enqueued
- **THEN** `payload_json` SHALL contain `{ messageId }`
- **AND** `dedup_key` SHALL be the message id
- **AND** `message_id` SHALL be the target message id

#### Scenario: mark_read payload shape (v1)

- **WHEN** a `mark_read` row is enqueued
- **THEN** `payload_json` SHALL contain `{ upToTimestamp: ISO_STRING }`
- **AND** `dedup_key` SHALL be the conversation id
- **AND** `message_id` SHALL be `NULL`

#### Scenario: Unknown payload_version is rejected at dispatch

- **GIVEN** a row with `payload_version = N` where `N` exceeds the dispatcher's supported maximum
- **WHEN** the worker picks the row
- **THEN** the row SHALL be moved to `state='dead_letter'` with `last_error.code = 'UNSUPPORTED_VERSION'`
- **AND** the worker SHALL NOT call any handler

### Requirement: State Machine

Every outbox row SHALL be in exactly one of four states: `pending`, `in_flight`, `done`, or `dead_letter`. Transitions SHALL follow the diagram: `pending → in_flight → (done | retryable→pending | terminal→dead_letter)`. `done` and `dead_letter` are terminal.

#### Scenario: Newly enqueued row starts in pending

- **WHEN** `outboxRepository.enqueue(opType, payload)` is called
- **THEN** the inserted row SHALL have `state='pending'`, `retry_count=0`, `next_retry_at=now`, `in_flight_at=NULL`, `last_error=NULL`

#### Scenario: Worker pickup transitions pending to in_flight

- **GIVEN** a row in `state='pending'` with `next_retry_at <= now`
- **WHEN** the worker picks the row via `markInFlight(rowId)`
- **THEN** `state` SHALL transition to `'in_flight'`
- **AND** `in_flight_at` SHALL be set to the current ms epoch
- **AND** `updated_at` SHALL be set to the current ms epoch

#### Scenario: Successful dispatch transitions in_flight to done

- **GIVEN** a row in `state='in_flight'`
- **WHEN** the dispatcher resolves successfully and `markDone(rowId)` is called
- **THEN** `state` SHALL transition to `'done'`
- **AND** `in_flight_at` SHALL be cleared (`NULL`)
- **AND** the row SHALL NOT be picked again by the worker

#### Scenario: Retryable failure transitions in_flight to pending with backoff

- **GIVEN** a row in `state='in_flight'`
- **WHEN** the dispatcher rejects with a retryable error class (NETWORK / TIMEOUT / 5XX / 429 / 401) and `markRetryable(rowId, error)` is called
- **THEN** `state` SHALL transition back to `'pending'`
- **AND** `retry_count` SHALL be incremented for non-401 errors (401 leaves the counter unchanged because the auth interceptor refresh is transparent)
- **AND** `next_retry_at` SHALL be set to `now + min(2^retry_count * 1000 + jitter_ms, 30000)`
- **AND** `last_error` SHALL be set to the sanitized error payload

#### Scenario: Terminal failure transitions to dead_letter

- **GIVEN** a row in `state='in_flight'` (or `'pending'` for cascade)
- **WHEN** the dispatcher rejects with a terminal error class (4XX excluding 401, 403, 409, 412, certain 404 cases) and `markDeadLetter(rowId, error)` is called
- **THEN** `state` SHALL transition to `'dead_letter'`
- **AND** `last_error` SHALL be set to the sanitized error payload
- **AND** the row SHALL NOT be picked again by the worker

#### Scenario: Max retries exhausted moves row to dead_letter

- **GIVEN** a row whose `retry_count` has reached the cap (8)
- **WHEN** another retryable failure occurs
- **THEN** `state` SHALL transition to `'dead_letter'` with `last_error.code` reflecting the last underlying error class

### Requirement: Coalesce Enforcement via Partial Unique Index

When a row is enqueued whose `(op_type, dedup_key)` matches an existing row in `state IN ('pending','in_flight')` (and `dedup_key IS NOT NULL`), the existing row SHALL be UPSERTed in place rather than producing a UNIQUE constraint violation or a duplicate row.

#### Scenario: react UPSERT with last-write-wins on emoji

- **GIVEN** a `react` row in `state='pending'` with `payload.emoji='👍'` and `dedup_key='msg1:userA'`
- **WHEN** `enqueue('react', { messageId: 'msg1', emoji: '❤️' })` is called by user A
- **THEN** the existing row SHALL be UPSERTed with `payload.emoji='❤️'`
- **AND** the row count for that `(op_type, dedup_key)` SHALL remain 1

#### Scenario: mark_read UPSERT takes max upToTimestamp

- **GIVEN** a `mark_read` row in `state='pending'` with `payload.upToTimestamp = T1` and `dedup_key=convA`
- **WHEN** `enqueue('mark_read', { upToTimestamp: T2 })` is called for convA where T2 > T1
- **THEN** the existing row SHALL be UPSERTed with `payload.upToTimestamp = T2`

#### Scenario: send_message never coalesces

- **GIVEN** any number of existing `send_message` rows for conversation C
- **WHEN** `enqueue('send_message', payload)` is called with another payload for conversation C
- **THEN** a new row SHALL be INSERTed
- **AND** the partial unique index SHALL NOT fire (because `dedup_key IS NULL` for send_message)

#### Scenario: Done rows do not block new enqueue

- **GIVEN** a `mark_read` row in `state='done'` with `dedup_key=convA`
- **WHEN** `enqueue('mark_read', { upToTimestamp: T3 })` is called for convA
- **THEN** a new row SHALL be INSERTed with `state='pending'`
- **AND** the partial unique index SHALL NOT fire (because the existing row is `state='done'`)

### Requirement: Foreground-Only Worker

The outbox processor SHALL only execute while the app's `AppState` is `'active'`. Pending and in_flight rows SHALL persist across foreground/background transitions and resume on the next `AppState='active'` event.

#### Scenario: Tick is a no-op when AppState is background

- **GIVEN** `AppState === 'background'`
- **WHEN** any trigger source attempts to fire the worker
- **THEN** `tick()` SHALL exit immediately without selecting any rows
- **AND** `state='in_flight'` rows SHALL remain `'in_flight'`

#### Scenario: Resume from background runs watchdog before first tick

- **GIVEN** `AppState` transitions from `'background'` (or `'inactive'`) to `'active'` after at least 30 s
- **WHEN** the AppState listener fires
- **THEN** the worker SHALL invoke `watchdogReset()` BEFORE selecting any due rows
- **AND** any rows whose `in_flight_at` is older than the per-op timeout SHALL be reset to `'pending'`

### Requirement: Watchdog with Per-Op Timeouts

The processor SHALL implement a watchdog that resets stuck `in_flight` rows back to `'pending'` (or to `'dead_letter'` for `send_message` rows older than the backend dedup window). Timeouts are op-specific.

#### Scenario: Generic ops reset after 30 s

- **GIVEN** an `in_flight` row whose `op_type != 'send_message'` and `in_flight_at < now - 30000`
- **WHEN** `watchdogReset()` runs
- **THEN** the row SHALL transition to `state='pending'` with `next_retry_at=now`
- **AND** `retry_count` SHALL NOT be incremented (watchdog is recovery, not failure)

#### Scenario: send_message resets after 240 s

- **GIVEN** an `in_flight` row whose `op_type='send_message'` and `in_flight_at < now - 240000` and `in_flight_at >= now - 300000`
- **WHEN** `watchdogReset()` runs
- **THEN** the row SHALL transition to `state='pending'` with `next_retry_at=now`

#### Scenario: send_message past dedup window goes to dead_letter

- **GIVEN** an `in_flight` row whose `op_type='send_message'` and `in_flight_at < now - 300000`
- **WHEN** `watchdogReset()` runs
- **THEN** the row SHALL transition to `state='dead_letter'`
- **AND** `last_error.code` SHALL be `'WATCHDOG_TIMEOUT'`

### Requirement: Per-Conversation Order, Cross-Conversation Parallelism

The worker SHALL preserve `created_at` ASC ordering within a conversation while allowing up to three conversations to be processed in parallel. After each successful in-flight cycle within the same conversation, the worker SHALL pause 50 ms before picking the next row in that conversation.

#### Scenario: Two send_message rows in the same conversation dispatch sequentially

- **GIVEN** rows R1 (`created_at=T`) and R2 (`created_at=T+100`) both `state='pending'` for conversation C
- **WHEN** the worker selects rows for conversation C
- **THEN** R1 SHALL move to `in_flight` first
- **AND** R2 SHALL NOT move to `in_flight` until R1 reaches `done` or `dead_letter`

#### Scenario: Rows in distinct conversations dispatch in parallel up to cap

- **GIVEN** rows in three distinct conversations, each `state='pending'` and due
- **WHEN** the worker selects rows
- **THEN** up to three conversations SHALL be in-flight concurrently
- **AND** a fourth conversation SHALL wait until one of the three completes

#### Scenario: 50 ms inter-request pacing within a conversation

- **GIVEN** R1 just transitioned to `done` for conversation C
- **WHEN** the worker considers picking the next row for C
- **THEN** the worker SHALL wait at least 50 ms before transitioning the next row to `in_flight`

### Requirement: Reply Blocking and Cascade Dead-Letter

A `send_message` row whose `payload.replyTo` references an unresolved temp id (i.e. starts with `'temp_'`) SHALL NOT be selected by the worker until the parent reaches `done` and the corresponding `messages` row has been promoted to a real id. When a `send_message` row enters `dead_letter`, every dependent reply row in the outbox SHALL be cascade-marked `dead_letter` with `last_error.code = 'PARENT_FAILED'`.

#### Scenario: Reply with temp_ replyTo is held

- **GIVEN** parent row P with `payload.clientMessageId='cmidA'` `state='in_flight'`
- **AND** child row C with `payload.replyTo='temp_cmidA'` `state='pending'`
- **WHEN** the worker queries due rows
- **THEN** C SHALL NOT be returned
- **AND** P SHALL be returned

#### Scenario: Reply unblocks when parent reaches done

- **GIVEN** parent row P transitioned to `state='done'`
- **AND** the corresponding `messages` row was promoted from `temp_cmidA` to a real id `mongoIdX`
- **WHEN** the worker queries due rows
- **THEN** child row C SHALL become eligible
- **AND** the dispatcher SHALL substitute `payload.replyTo` from `'temp_cmidA'` to `'mongoIdX'` before sending the request

#### Scenario: Cascade dead_letter on parent failure

- **GIVEN** parent send_message row P enters `state='dead_letter'`
- **WHEN** `cascadeDeadLetter(parentClientMessageId)` runs
- **THEN** every other `send_message` row whose `payload.replyTo` references P's `clientMessageId` SHALL be set to `state='dead_letter'` with `last_error.code='PARENT_FAILED'`
- **AND** the cascade SHALL recurse — replies of replies SHALL also be marked

#### Scenario: User retry of parent does not auto-revive cascaded children

- **GIVEN** parent P in `state='dead_letter'` with cascaded children C1 in `state='dead_letter'` (code `PARENT_FAILED`)
- **WHEN** the user retries P (transitioning P to `'pending'`)
- **THEN** C1 SHALL remain in `state='dead_letter'`
- **AND** the user SHALL retry C1 explicitly to revive it

### Requirement: Sanitized last_error Schema

The `last_error` column SHALL contain only structured, PII-free error metadata. Raw response bodies, request URLs with query parameters, headers, tokens, and stack traces SHALL NEVER be persisted.

#### Scenario: last_error JSON shape

- **WHEN** `last_error` is set on any state transition
- **THEN** the value SHALL parse as JSON with shape `{ code: <known code>, status: number | null, hint: <known hint string> }`
- **AND** the serialized string SHALL be ≤ 500 characters
- **AND** the `code` SHALL be one of `NETWORK`, `TIMEOUT`, `4XX`, `5XX`, `401`, `403`, `404`, `429`, `PARSE`, `PARENT_FAILED`, `UNSUPPORTED_VERSION`, `WATCHDOG_TIMEOUT`
- **AND** the `hint` SHALL come from the closed allow-list mapped to `code`

#### Scenario: Server response body is never persisted

- **GIVEN** a server returns 4xx with body `{"email":"user@example.com","reason":"...""}`
- **WHEN** the error classifier produces `last_error`
- **THEN** the persisted `last_error.hint` SHALL be the allow-listed string for the matched code (e.g. "Client error" for generic 4XX)
- **AND** the `email` value SHALL NOT appear in `last_error`

### Requirement: Five Trigger Sources, Single-Flight Tick

The outbox processor SHALL be invokable from five trigger sources and SHALL guarantee that at most one `tick()` runs at any moment via a JS-thread lock. All trigger sources SHALL route through `scheduleTick()`, which yields to user gestures via `InteractionManager.runAfterInteractions`.

#### Scenario: Concurrent triggers do not double-tick

- **GIVEN** `AppState` transitions to `'active'` and the socket reconnect event fires within the same JS frame
- **WHEN** both call `scheduleTick()`
- **THEN** at most one `tick()` SHALL be running
- **AND** the second invocation SHALL no-op while the first is in progress

#### Scenario: Periodic backstop auto-stops when no rows remain

- **GIVEN** the periodic 30 s interval has been started by an enqueue
- **WHEN** a tick completes and `count(state IN ('pending','in_flight')) === 0`
- **THEN** the periodic interval SHALL be cleared
- **AND** the next enqueue SHALL restart it

### Requirement: Idempotent enqueue, getDue, and Repository APIs

`outboxRepository` SHALL expose typed functions that return plain JS objects to callers; raw SQL SHALL not appear at consumer call sites.

#### Scenario: Required public functions exist

- **WHEN** the repository module is imported
- **THEN** the module SHALL export `enqueue`, `getDue`, `markInFlight`, `markDone`, `markRetryable`, `markDeadLetter`, `watchdogReset`, `cascadeDeadLetter`, and `wipeAll`

#### Scenario: enqueue rejects payload over 10 KB

- **WHEN** `enqueue(opType, payload)` is called and `JSON.stringify(payload).length > 10240`
- **THEN** the call SHALL throw a typed error and SHALL NOT insert any row

#### Scenario: enqueue refuses send_message without clientMessageId

- **WHEN** `enqueue('send_message', payload)` is called and `payload.clientMessageId` is missing or empty
- **THEN** the call SHALL throw a typed error and SHALL NOT insert any row

### Requirement: AsyncStorage Queue Backfill (v→1)

On the first launch after upgrading to a build that contains the outbox foundation, the app SHALL backfill any items currently stored under the legacy `'offline-queue'` AsyncStorage key into the outbox as `send_message` rows. The AsyncStorage payload SHALL NOT be deleted in this change (deletion is reserved for a follow-up `outbox_migration_version=2`).

#### Scenario: Migration counter advances after successful backfill

- **GIVEN** `outbox_migration_version` is `'0'` (or absent) and the AsyncStorage key holds a non-empty queue
- **WHEN** `dbInit` runs after schema migrations
- **THEN** every well-formed item in the queue SHALL be UPSERTed as a `send_message` outbox row in `state='pending'` (or `state='dead_letter'` for items whose legacy `status='failed'`)
- **AND** `outbox_migration_version` SHALL be set to `'1'`
- **AND** the AsyncStorage `'offline-queue'` key SHALL remain on disk

#### Scenario: Backfill is idempotent across re-runs

- **GIVEN** `outbox_migration_version` is `'0'` and a partial backfill ran before crashing
- **WHEN** `dbInit` runs again
- **THEN** the backfill SHALL re-run inside a single transaction
- **AND** existing outbox rows for the same `clientMessageId` SHALL NOT be duplicated (`INSERT OR IGNORE` semantics on the existing message-table client id index plus partial dedup index)

#### Scenario: Backfill failure does not block app launch

- **WHEN** the backfill throws or the underlying transaction fails
- **THEN** the migration counter SHALL NOT advance (stays at `'0'`)
- **AND** the app SHALL continue booting
- **AND** a warning SHALL be logged with prefix `[outbox] migration_v1_failed`
- **AND** the AsyncStorage payload SHALL remain intact

#### Scenario: Skip-version users are not stranded

- **GIVEN** a user upgrades from a release that does not contain this change directly to a future release that contains both v→1 and v→2 migrations
- **WHEN** `dbInit` runs
- **THEN** the v→1 step SHALL run first because `outbox_migration_version < 1`
- **AND** the v→2 step SHALL run after, because `outbox_migration_version < 2`
- **AND** counters SHALL be persisted between steps so a crash between them resumes from the correct point

### Requirement: Per-Account Isolation

The outbox SHALL contain rows only for the currently authenticated account. Logout and account switch SHALL leave no readable outbox rows on disk.

#### Scenario: Logout wipes outbox rows synchronously with messages

- **WHEN** `wipeAllData` runs (including from `AuthContext.logout`)
- **THEN** every row in `outbox` and `outbox_metrics` SHALL be deleted
- **AND** the wipe SHALL complete before the auth context returns to the unauthenticated state
- **AND** there SHALL NOT be any outbox flush attempt prior to the wipe

#### Scenario: Cross-account guard wipes outbox

- **GIVEN** account A's outbox contains pending rows
- **WHEN** account B logs in on the same device and `dbInit` detects the account mismatch
- **THEN** the existing cross-account `wipeAllData` SHALL also clear the outbox tables
- **AND** account B SHALL see an empty outbox

### Requirement: Telemetry Logs and Counter Table

The outbox layer SHALL emit structured `[outbox]` logs at every state transition and SHALL maintain a counter table that aggregates outcomes for in-app debug inspection. Telemetry SHALL be PII-free.

#### Scenario: outbox_metrics table exists

- **WHEN** schema migration v2 has been applied
- **THEN** the `outbox_metrics` table SHALL exist with columns `key TEXT PRIMARY KEY`, `value INTEGER NOT NULL DEFAULT 0`, `updated_at INTEGER NOT NULL`

#### Scenario: Counters increment on transitions

- **WHEN** a row enters `state='in_flight'` from `state='pending'`
- **THEN** the `enqueued_total` counter SHALL increment by 1 OR an `inflight_started_total` counter SHALL increment by 1 (implementation MAY pick either, but at least one counter SHALL track the event)
- **AND** entering `'done'` SHALL increment `done_total`
- **AND** entering `'dead_letter'` SHALL increment `dead_letter_total`
- **AND** a retryable transition (in_flight→pending) SHALL increment `retry_total`
- **AND** a watchdog reset SHALL increment `watchdog_reset_total`

#### Scenario: Logs use [outbox] prefix and contain no PII

- **WHEN** any state transition occurs
- **THEN** a structured log entry SHALL be emitted with the prefix `[outbox]`
- **AND** the entry SHALL include `op_type`, `state` from/to, and (where relevant) `code` from `last_error`
- **AND** the entry SHALL NOT contain raw `payload_json`, request URLs with query strings, headers, or tokens
