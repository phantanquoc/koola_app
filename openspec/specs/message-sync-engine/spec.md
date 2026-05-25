# message-sync-engine Specification

## Purpose

Provides the mobile-side orchestrator that drives delta sync between the local SQLite database and the backend. The sync engine maintains a global `lastSyncAt` cursor in SQLite `sync_state`, triggers incremental pulls at well-defined points (app foreground, socket reconnect, conversation open when stale), applies socket events idempotently to the local database, and reconciles optimistic outbound writes with backend acknowledgements.

This capability depends on `message-store-sqlite` for the repository layer and `message-sync-api` for the backend endpoint.

## Requirements

### Requirement: Global Sync Cursor

The mobile app SHALL maintain a single global `lastSyncAt` cursor (ISO timestamp) so that incremental sync only transfers messages that have changed since the last successful pull. This mirrors the existing `useMessageSync` hook's behaviour but stores the cursor in SQLite `sync_state` keyed `'global'` instead of in AsyncStorage.

#### Scenario: Cursor is persisted in the local database

- **GIVEN** the sync engine successfully pulls deltas up to backend timestamp T
- **WHEN** the pull transaction commits
- **THEN** the row in `sync_state` keyed `'global'` SHALL be updated with `last_synced_at = T`
- **AND** the cursor SHALL survive process restart and account-stable launches

#### Scenario: First sync after migration uses the legacy AsyncStorage cursor

- **GIVEN** the device has a prior `lastSyncAt` value in AsyncStorage from `useMessageSync`
- **AND** the SQLite `sync_state` row keyed `'global'` does not yet exist
- **WHEN** the sync engine starts for the first time after upgrade
- **THEN** the AsyncStorage value SHALL be migrated into the `sync_state` row
- **AND** the AsyncStorage key SHALL be deleted after a successful migration
- **AND** subsequent syncs SHALL read the cursor from SQLite only

#### Scenario: First-ever sync defaults to epoch zero

- **GIVEN** no `sync_state` row exists for `'global'` and no AsyncStorage value is present
- **WHEN** the sync engine pulls for the first time
- **THEN** the request SHALL use `since=1970-01-01T00:00:00Z`
- **AND** the cursor SHALL be initialised after the pull completes

### Requirement: Sync Triggers

The sync engine SHALL run delta sync at well-defined trigger points and SHALL NOT poll on a fixed timer.

#### Scenario: App foreground triggers sync

- **GIVEN** the app transitions from background to foreground
- **WHEN** `AppState` reports `'active'`
- **THEN** the sync engine SHALL pull deltas using the global cursor when it is older than a configurable freshness window (default 60 seconds)

#### Scenario: Socket reconnect triggers sync

- **GIVEN** the chat socket has just reconnected after a disconnect
- **WHEN** the `connect` event fires on `socketService`
- **THEN** the sync engine SHALL pull deltas using the global cursor as the `since` parameter
- **AND** the pull SHALL paginate via `nextCursor` until `hasMore = false`

#### Scenario: Conversation open triggers stale-only sync

- **GIVEN** the user opens conversation C
- **AND** the global cursor is older than the freshness window
- **WHEN** ChatScreen mounts
- **THEN** the sync engine SHALL pull a global delta in the background
- **AND** ChatScreen SHALL still paint from the local database first (no UI block)

#### Scenario: Fresh global cursor skips sync

- **GIVEN** the user opens conversation C and the global cursor is within the freshness window
- **WHEN** ChatScreen mounts
- **THEN** the sync engine SHALL NOT make a sync request
- **AND** the UI SHALL rely on socket events for real-time updates

### Requirement: Idempotent Socket Event Application

Socket events SHALL be applied to the local database in a way that is idempotent and that does not duplicate rows when both the socket event and a sync delta deliver the same message.

#### Scenario: Duplicate new_message events do not create duplicate rows

- **GIVEN** a `new_message` event for message M is delivered twice (e.g. once via socket, once via sync delta)
- **WHEN** the sync engine applies both events
- **THEN** the `messages` table SHALL contain exactly one row for M
- **AND** the second application SHALL be a no-op or a benign UPDATE

#### Scenario: Optimistic message reconciliation by clientMessageId

- **GIVEN** the local database contains an optimistic row with `id = "temp_X"` and `client_message_id = X`
- **WHEN** a `new_message` or `message_ack` event arrives carrying the real id Y and `client_message_id = X`
- **THEN** the temp row SHALL be UPDATEd in place to `id = Y` and `status = "sent"`
- **AND** no separate row for Y SHALL be created

#### Scenario: Out-of-order events are tolerated

- **GIVEN** a `message_reaction` event for message M arrives before the `new_message` event for M
- **WHEN** the reaction event is applied
- **THEN** it SHALL be either buffered until M is inserted OR applied as an UPSERT that creates a stub row
- **AND** the UI SHALL eventually converge to the correct state once M is delivered by sync or socket

### Requirement: Outbound Write Path Through Repository

Outbound message sends SHALL flow through the SQLite repository so that the local database always reflects in-flight optimistic state and reconciles with backend acks idempotently.

#### Scenario: Sending writes an optimistic row immediately

- **GIVEN** the user submits a new message in conversation C
- **WHEN** the send handler runs
- **THEN** an optimistic row SHALL be inserted via `messageRepository.insertOptimistic(...)` with `id = "temp_<clientMessageId>"`, `status = "pending"`, `created_at = Date.now()`
- **AND** ChatScreen SHALL re-render with the new message via the existing subscription

#### Scenario: Backend ack updates the optimistic row in place

- **GIVEN** an optimistic row with `client_message_id = X` exists
- **WHEN** the REST send completes successfully and returns the canonical message with id Y
- **THEN** the row SHALL be updated to `id = Y`, `status = "sent"`, with all server-supplied fields applied
- **AND** any duplicate row that may have been inserted from a racing socket event SHALL be removed in the same transaction

#### Scenario: Send failure marks the optimistic row as failed

- **GIVEN** the REST send for `client_message_id = X` throws or returns a non-success status
- **WHEN** the send handler catches the failure
- **THEN** the optimistic row SHALL be UPDATEd to `status = "failed"`
- **AND** the row SHALL remain in the database to support a manual retry path

### Requirement: Conflict Resolution

When the backend reports state that conflicts with an optimistic row or a previously synced row, the backend value SHALL win on durable fields (id, content, deleted, deleted_for, reactions) while client-only fields (e.g. local notification state) SHALL be preserved.

#### Scenario: Backend deletion overrides local copy

- **GIVEN** the local database contains a message row for M
- **AND** a sync delta or socket event reports M as deleted (`deleted: true` or per-user `deletedFor` containing the current user id)
- **WHEN** the event is applied
- **THEN** the row SHALL be UPDATEd with the backend `deleted` flag (or `deleted_for` array)
- **AND** the message SHALL no longer appear in default UI queries

#### Scenario: Backend reaction set replaces local optimistic reactions

- **GIVEN** the user toggled a reaction optimistically and the local row carries the optimistic reactions array
- **WHEN** a `message_reaction` event or sync delta arrives with a different reactions array for the same message
- **THEN** the row's `reactions` field SHALL be REPLACEd with the backend-provided array

### Requirement: Failure and Retry Semantics

The sync engine SHALL handle transient backend failures with bounded retry and SHALL NOT corrupt local state on partial failure.

#### Scenario: Transient sync failure retries with backoff

- **GIVEN** a sync request fails with a 5xx or network error
- **WHEN** the sync engine notices the failure
- **THEN** it SHALL retry with exponential backoff capped at 30 seconds
- **AND** it SHALL stop retrying when a foreground sync trigger supersedes the in-flight attempt

#### Scenario: Partial-batch sync commits the successful prefix

- **GIVEN** a sync response is successfully received but apply fails on row N of a batch
- **WHEN** the apply transaction is rolled back
- **THEN** the global cursor SHALL NOT be advanced
- **AND** the next sync attempt SHALL re-request from the same `since` cursor

#### Scenario: Sync failures are observable

- **WHEN** sync fails persistently
- **THEN** the failure SHALL be logged with reason and last attempted `since` value
- **AND** the conversation list MAY surface a stale indicator (UI-controlled)

### Requirement: Foreground Catch-Up Budget

The foreground sync SHALL meet a defined budget on typical accounts so the app feels responsive after returning from background.

#### Scenario: Typical foreground catch-up

- **GIVEN** an account with up to 100 conversations and up to 500 unsynced messages total since last sync
- **WHEN** the app returns to foreground on a 4G connection
- **THEN** the sync engine SHALL complete the catch-up in under 2 seconds
- **AND** the conversation list SHALL be visually updated by the time the foreground transition animation completes

### Requirement: Feature Flag for Incremental Rollout

The local-first read path SHALL be gated by a build/runtime feature flag so the team can disable it without shipping a new build.

#### Scenario: Flag disabled falls back to legacy path

- **GIVEN** the runtime flag `LOCAL_FIRST_SQLITE` is false
- **WHEN** ChatScreen mounts
- **THEN** the legacy MMKV + REST path SHALL be used unchanged
- **AND** no SQLite reads or writes SHALL occur on the hot path
