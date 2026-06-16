## ADDED Requirements

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

## MODIFIED Requirements

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
