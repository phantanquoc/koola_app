# message-outbox Specification

## Purpose

Provides a durable, SQLite-backed outbox table that is the single source-of-truth for client-initiated write intents on chat resources. The outbox decouples the UI send path from network availability: every write op is persisted locally first, then dispatched by a background worker with retry, coalesce, and ordering guarantees. This replaces the legacy AsyncStorage-based OfflineQueueService for all chat write operations.
## Requirements
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
- **AND** the serialized string SHALL be <= 500 characters
- **AND** the `code` SHALL be one of `NETWORK`, `TIMEOUT`, `4XX`, `5XX`, `401`, `403`, `404`, `429`, `PARSE`, `PARENT_FAILED`, `UNSUPPORTED_VERSION`, `WATCHDOG_TIMEOUT`
- **AND** the `hint` SHALL come from the closed allow-list mapped to `code`

#### Scenario: Server response body is never persisted

- **GIVEN** a server returns 4xx with body `{"email":"user@example.com","reason":"..."}`
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

### Requirement: AsyncStorage Queue Backfill (v->1)

On first launch after this change ships, the app SHALL detect any pending items in the legacy `AsyncStorage` `'offline-queue'` key and SHALL convert each into a corresponding outbox row. After backfill completes, the legacy key SHALL be deleted (already covered by Change A migration `outbox_migration_version` v→2). The `OfflineQueueService` module SHALL keep its public API but SHALL back its operations with `outboxRepository` queries.

#### Scenario: Backfill at v→1 converts pending AsyncStorage items

- **GIVEN** `outbox_migration_version` is `0` and AsyncStorage `'offline-queue'` contains N items
- **WHEN** the migration runner runs
- **THEN** for each pending item with valid shape (id, conversationId, content, type, createdAt), one outbox row SHALL be inserted with `op_type='send_message'`
- **AND** the migration SHALL set `outbox_migration_version=1` upon successful insert of all valid items
- **AND** the entire backfill SHALL run in a single transaction; on failure, no rows SHALL be inserted and the version SHALL NOT advance

#### Scenario: Legacy key deletion at v→2

- **GIVEN** `outbox_migration_version` is `1`
- **WHEN** the migration runner runs
- **THEN** the AsyncStorage `'offline-queue'` key SHALL be removed
- **AND** the version SHALL advance to `2`

#### Scenario: OfflineQueueService public API remains compatible

- **GIVEN** any caller still using the legacy `OfflineQueueService` exports (e.g., `getQueueLength`, `clearQueue`, `useOfflineQueue` hook)
- **WHEN** the caller invokes the legacy method
- **THEN** the method SHALL return the equivalent value from `outboxRepository` (e.g., `getQueueLength()` returns `countActive()`)
- **AND** no AsyncStorage access SHALL occur

#### Scenario: Skip-version forward compat

- **GIVEN** a user upgrades from a release where `outbox_migration_version=0` to a release where the target is `2`, skipping `1`
- **WHEN** the migration runner runs
- **THEN** v→1 SHALL run first (backfill), then v→2 (key deletion)
- **AND** both SHALL run in their own single transactions

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

The processor and repository SHALL emit structured logs at every state transition under the `[outbox.*]` namespace, and SHALL maintain a persistent `outbox_metrics(name TEXT PRIMARY KEY, value INTEGER, updated_at INTEGER)` counter table for aggregate observability. Counters SHALL include `enqueued_total`, `inflight_started_total`, `done_total`, `retry_total`, `dead_letter_total`, `watchdog_reset_total`, and the processor SHALL compute `dead_letter_rate` over a rolling 1h window.

#### Scenario: Counter increments are atomic with state transitions

- **GIVEN** a row transitions from `state='in_flight'` to `state='done'`
- **WHEN** the transition commits
- **THEN** `done_total` SHALL be incremented by 1 in the same transaction
- **AND** if the transition fails, the counter SHALL NOT be incremented

#### Scenario: All state transitions emit a log

- **WHEN** any of `enqueue`, `markInFlight`, `markDone`, `markRetryable`, `markDeadLetter`, `markPendingForRetry`, `cascadeDeadLetter`, `watchdogReset` is called
- **THEN** a structured log line SHALL be emitted under `[outbox.<event>]` with at minimum the row id, op_type, conversation_id, and (where applicable) error code
- **AND** the log SHALL NOT contain raw payload content beyond what the sanitized `last_error` schema permits

#### Scenario: dead_letter_rate computed over rolling 1h window

- **WHEN** any threshold check runs
- **THEN** the processor SHALL compute `dead_letter_rate = dead_letter_total_1h / (done_total_1h + dead_letter_total_1h)` using counter snapshots from at most 1h ago
- **AND** if `(done_total_1h + dead_letter_total_1h) < 10`, the rate SHALL be treated as 0 and no threshold log SHALL fire (insufficient sample)

#### Scenario: Threshold logs are emitted at 2%, 3%, and 5%

- **WHEN** `dead_letter_rate >= 0.02`
- **THEN** `[outbox.threshold:info]` SHALL be emitted
- **AND** if `dead_letter_rate >= 0.03`, `[outbox.threshold:error]` SHALL be emitted
- **AND** if `dead_letter_rate >= 0.05`, `[outbox.rollback]` SHALL be emitted AND the processor SHALL pause

### Requirement: Hook Integration Routes Mobile Writes Through Outbox

The `useMessagesFromDb` hook SHALL route all five mobile write operations through `outboxRepository.enqueue()` instead of calling REST APIs directly. The hook SHALL set the local `messages` row to `status='pending'` (via existing `insertOptimistic`) BEFORE calling `enqueue`, and SHALL handle enqueue failures by marking the local row `status='failed'` with a sanitized error.

#### Scenario: sendMessage enqueues send_message op

- **WHEN** the user taps Send and `useMessagesFromDb.sendMessage(content, type, replyTo?)` is called
- **THEN** the hook SHALL call `messageRepository.insertOptimistic` to create a local row with `status='pending'` and `clientMessageId`
- **AND** the hook SHALL call `outboxRepository.enqueue('send_message', payload)` where payload contains `{ content, type, clientMessageId, replyTo? }`
- **AND** the hook SHALL NOT call `messagesApi.send` directly

#### Scenario: sendMediaMessage uploads first, then enqueues

- **WHEN** the user attaches a media asset and `useMessagesFromDb.sendMediaMessage(...)` is called
- **THEN** the hook SHALL upload the media via the existing presigned-URL bypass path BEFORE calling `enqueue`
- **AND** after upload completes, the hook SHALL call `outboxRepository.enqueue('send_message', payload)` where payload contains `{ content, type='media', clientMessageId, mediaUrl, mediaMimeType, mediaSize, mediaDuration? }`
- **AND** the upload itself SHALL NOT pass through the outbox (only the `POST /messages` call is queued)

#### Scenario: reactToMessage enqueues react op with explicit emoji

- **WHEN** the user taps an emoji on a message
- **THEN** the hook SHALL call `outboxRepository.enqueue('react', { messageId, emoji })`
- **AND** if the user is removing their existing reaction, the hook SHALL call `enqueue('react', { messageId, emoji: null })`
- **AND** the hook SHALL NOT compute the toggle on the client; the explicit-set semantics rely on the backend

#### Scenario: deleteMessage enqueues delete op

- **WHEN** the user confirms message deletion
- **THEN** the hook SHALL call `outboxRepository.enqueue('delete', { messageId })`

#### Scenario: softDeleteForUser enqueues delete_for_me op

- **WHEN** the user selects "Delete for me"
- **THEN** the hook SHALL call `outboxRepository.enqueue('delete_for_me', { messageId })`

#### Scenario: markAsRead enqueues mark_read op with conversation dedup_key

- **WHEN** the user reads up to a timestamp in conversation C and `markAsRead(conversationId, upToTimestamp)` is called
- **THEN** the hook SHALL call `outboxRepository.enqueue('mark_read', { upToTimestamp })` for conversation C
- **AND** the resulting row SHALL have `dedup_key = conversationId`

#### Scenario: enqueue failure flips local row to failed

- **GIVEN** `insertOptimistic` has created the local row with `status='pending'`
- **WHEN** `enqueue` throws (DB full, malformed payload, unexpected SQLite error)
- **THEN** the hook SHALL call `messageRepository.markFailed(tempId, errorJson)` to flip the row to `status='failed'`
- **AND** the hook SHALL log `[outbox.enqueue:error]` with the error class
- **AND** the UI SHALL render the dead-letter bubble for that row

#### Scenario: enqueue does not call invalidationBroadcaster.notify

- **WHEN** the hook calls `outboxRepository.enqueue` after `insertOptimistic`
- **THEN** the enqueue path SHALL NOT call `invalidationBroadcaster.notify` (notification was already emitted by `insertOptimistic`)

### Requirement: User-Initiated Retry of Dead-Letter Rows

The outbox repository SHALL provide a `markPendingForRetry(id)` operation that resets a dead-letter row back to `pending` with cleared backoff history, enabling the user to retry a failed send via the UI.

#### Scenario: markPendingForRetry resets row to pending

- **GIVEN** an outbox row in `state='dead_letter'`
- **WHEN** `outboxRepository.markPendingForRetry(rowId)` is called
- **THEN** the row SHALL transition to `state='pending'`
- **AND** `last_error` SHALL be set to `NULL`
- **AND** `retry_count` SHALL be set to `0`
- **AND** `next_retry_at` SHALL be set to `now()` (or `0`)
- **AND** `in_flight_at` SHALL be set to `NULL`
- **AND** `updated_at` SHALL be set to `now()`

#### Scenario: Retry triggers next tick

- **WHEN** `markPendingForRetry` completes
- **THEN** the next `outboxProcessor.scheduleTick()` SHALL pick the row up

#### Scenario: User retry path does NOT auto-resume cascaded children

- **GIVEN** parent row P is `dead_letter` and child reply rows C1, C2 are `dead_letter` with `code='PARENT_FAILED'`
- **WHEN** the user retries P via `markPendingForRetry(P.id)`
- **THEN** C1 and C2 SHALL remain in `state='dead_letter'`
- **AND** the user SHALL retry each child explicitly via its own bubble action

### Requirement: Dead-Letter UX for send_message Bubble

The chat UI SHALL render dead-letter rows of `op_type='send_message'` with a visual failure indicator (red border + "Failed — tap to retry" label) and SHALL provide tap-to-retry and long-press-to-discard interactions. Other op types (`react`, `delete`, `delete_for_me`, `mark_read`) SHALL be silent on dead-letter and SHALL only emit structured logs.

#### Scenario: Failed bubble shows retry affordance

- **GIVEN** a `messages` row with `status='failed'` (mirrored from the outbox `dead_letter` row)
- **WHEN** the chat list renders that row
- **THEN** the bubble SHALL display a red 1px left border
- **AND** a small "Failed — tap to retry" label SHALL be shown below the content
- **AND** the bubble itself SHALL be tappable to trigger retry

#### Scenario: Tap retry calls markPendingForRetry

- **WHEN** the user taps the failed bubble
- **THEN** the UI SHALL resolve the corresponding outbox row id from the `clientMessageId`
- **AND** the UI SHALL call `outboxRepository.markPendingForRetry(rowId)`
- **AND** the UI SHALL flip the local `messages.status` from `'failed'` back to `'pending'`

#### Scenario: Long-press Discard removes both rows

- **WHEN** the user long-presses the failed bubble and selects "Discard"
- **THEN** the UI SHALL call `outboxRepository.delete(rowId)` for the dead-letter row
- **AND** the UI SHALL call `messageRepository.delete(tempId)` for the local `temp_*` row
- **AND** both deletions SHALL occur in a single transaction (or with rollback on partial failure)
- **AND** the row SHALL no longer appear in the chat list

#### Scenario: Non-message op dead-letter is silent

- **GIVEN** a `react`, `delete`, `delete_for_me`, or `mark_read` row that has reached `state='dead_letter'`
- **WHEN** the chat list renders the affected message
- **THEN** there SHALL NOT be any inline UI indication of the failure
- **AND** the dispatcher SHALL emit a structured `[outbox.dead_letter:<op_type>]` log with `code`, `status`, and a non-PII `hint`

#### Scenario: Cascade UX — child reply shows its own failed bubble

- **GIVEN** a parent `send_message` row P went to `dead_letter` and triggered cascade for children
- **WHEN** the chat list renders the child `dead_letter` rows
- **THEN** each child SHALL display its own "Failed — tap to retry" affordance
- **AND** retrying a child SHALL NOT auto-retry the parent

### Requirement: Threshold-Driven Soft Rollback

The processor SHALL compute the dead-letter rate as `dead_letter_total / (done_total + dead_letter_total)` over a rolling 1-hour window using the persistent `outbox_metrics` counters, and SHALL log warnings or pause itself when the rate crosses configured thresholds.

#### Scenario: Info log at 2% threshold

- **GIVEN** the current rolling 1h dead_letter_rate is computed
- **WHEN** the rate is greater than or equal to 2% AND less than 3%
- **THEN** the processor SHALL emit `[outbox.threshold:info]` with the rate and counter snapshot
- **AND** the processor SHALL continue running

#### Scenario: Error log at 3% threshold

- **WHEN** the rate is greater than or equal to 3% AND less than 5%
- **THEN** the processor SHALL emit `[outbox.threshold:error]` with the rate and counter snapshot
- **AND** the processor SHALL continue running

#### Scenario: Soft rollback at 5% threshold

- **WHEN** the rate is greater than or equal to 5%
- **THEN** the processor SHALL call `pause()` so that no rows transition out of `pending` until manually resumed
- **AND** the processor SHALL emit `[outbox.rollback]` with the rate
- **AND** new `enqueue()` calls SHALL still succeed (rows accumulate in `pending`)

#### Scenario: Manual resume restores tick

- **GIVEN** the processor is paused after a soft rollback
- **WHEN** an authorized caller (dev panel button or auth re-init) calls `outboxProcessor.resume()`
- **THEN** the processor SHALL resume tick scheduling
- **AND** pending rows SHALL be processed at the next tick

#### Scenario: Pause does not persist across app restart

- **GIVEN** the processor was paused via soft rollback
- **WHEN** the app is restarted
- **THEN** the processor SHALL start in the resumed state by default
- **AND** the watchdog SHALL still reset stuck `in_flight` rows on restart

### Requirement: __DEV__ Outbox Panel

The mobile app SHALL include a developer-only outbox inspection panel (gated by `__DEV__`) that exposes counters, the current dead-letter rate, the list of dead-letter rows, and retry / discard / pause / resume actions. The panel SHALL NOT be reachable in production builds.

#### Scenario: Panel hidden when __DEV__ is false

- **GIVEN** the app is built with `__DEV__ === false`
- **WHEN** the user navigates the app
- **THEN** there SHALL be no entry point to the outbox dev panel anywhere in the navigation tree

#### Scenario: Panel shows live counters

- **WHEN** the dev panel opens
- **THEN** the panel SHALL display the current values of `enqueued_total`, `inflight_started_total`, `done_total`, `dead_letter_total`, `retry_total`, `watchdog_reset_total`, and the computed `dead_letter_rate`
- **AND** the values SHALL refresh when the user taps a "Refresh" button (or every 5 s, implementation choice)

#### Scenario: Panel lists dead-letter rows with retry/discard

- **WHEN** the dev panel opens
- **THEN** the panel SHALL list all current `dead_letter` rows with `op_type`, `conversation_id`, abbreviated `last_error`, and per-row Retry / Discard buttons
- **AND** Retry SHALL call `markPendingForRetry`
- **AND** Discard SHALL call `outboxRepository.delete` for the row (and `messageRepository.delete` for `send_message`)

#### Scenario: Panel exposes pause/resume

- **WHEN** the dev panel opens
- **THEN** a Pause / Resume toggle SHALL be visible
- **AND** tapping it SHALL call `outboxProcessor.pause()` or `resume()` accordingly
- **AND** the toggle SHALL reflect the current paused state

### Requirement: Completed Outbox Rows Are Reaped

The outbox SHALL delete completed rows whose `state='done'` and `updated_at` is older than a configurable threshold (default 24 hours) during idle maintenance, so completed write intents do not accumulate forever. This addresses the unbounded growth of `done` rows carrying `payload_json`.

#### Scenario: Stale done rows are deleted

- **GIVEN** an outbox row has `state='done'` and `updated_at` more than 24 hours in the past
- **WHEN** the outbox repository's reaper function runs
- **THEN** the row SHALL be deleted from the `outbox` table

#### Scenario: Recent done rows are retained for diagnosis

- **GIVEN** an outbox row has `state='done'` and `updated_at` within the last 24 hours
- **WHEN** the reaper runs
- **THEN** the row SHALL NOT be deleted

#### Scenario: Non-done rows are never reaped by this rule

- **GIVEN** an outbox row with `state` in `pending`, `in_flight`, or `dead_letter`
- **WHEN** the reaper runs
- **THEN** the row SHALL NOT be deleted regardless of age

#### Scenario: Reaping is exposed through the repository

- **WHEN** the maintenance scheduler invokes reaping
- **THEN** it SHALL call an `outboxRepository` function (not raw SQL from the scheduler)

