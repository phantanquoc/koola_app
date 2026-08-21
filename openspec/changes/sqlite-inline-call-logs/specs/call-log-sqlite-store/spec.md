## ADDED Requirements

### Requirement: Call log SQLite store as canonical read source

The mobile app SHALL maintain a `call_logs` SQLite table that is the canonical local read source for inline call history. ChatScreen's inline timeline SHALL read exclusively from this table on the hot path; network fetches SHALL run only off the critical path via the sync layer, never directly in the render path.

#### Scenario: ChatScreen inline history reads from SQLite on open

- **GIVEN** conversation C has call logs already persisted in the local `call_logs` table
- **WHEN** the user navigates to ChatScreen for C
- **THEN** the first React render SHALL receive call logs produced by a SQLite query
- **AND** no `callLogsApi.getHistory` call SHALL be made by the mount effect before the first paint
- **AND** `displayedMessages` SHALL contain the merged message+call items on the first frame

#### Scenario: First-ever open with empty local table triggers background sync

- **GIVEN** the local `call_logs` table has no rows for conversation C
- **WHEN** the user opens ChatScreen for C
- **THEN** an empty inline history may be shown on the first frame
- **AND** a background sync SHALL populate `call_logs` from the backend before subsequent opens
- **AND** the subsequent sync completion SHALL cause the inline cards to appear via subscription, not a manual refetch

#### Scenario: Repository is the only writer to the table

- **WHEN** any write to `call_logs` occurs (sync upsert, socket event, wipe)
- **THEN** the write SHALL go through `callLogRepository` (never raw SQL from UI or sync orchestrator)

### Requirement: Call logs table schema and indexes

The database SHALL contain a `call_logs` table whose columns mirror the backend `CallLog` shape with indexes that support the hot-path queries.

#### Scenario: Required columns exist

- **WHEN** the schema is inspected after migration
- **THEN** the `call_logs` table SHALL contain at least columns `id` (TEXT PK, backend `_id`), `session_id` (TEXT), `conversation_id` (TEXT), `initiator_id` (TEXT), `target_user_id` (TEXT), `call_type` (TEXT, audio|video), `status` (TEXT), `started_at` (INTEGER ms epoch), `answered_at` (INTEGER nullable ms epoch), `ended_at` (INTEGER nullable ms epoch), `duration` (INTEGER, seconds, default 0), `created_at` (INTEGER nullable ms epoch), `updated_at` (INTEGER nullable ms epoch)

#### Scenario: Hot-path indexes exist

- **WHEN** the schema is inspected after migration
- **THEN** an index on `(conversation_id, started_at DESC)` SHALL exist for paginated list queries
- **AND** queries that list inline history SHALL use this index for ordering

#### Scenario: Cursor pagination uses started_at

- **GIVEN** the previous list returned item with `startedAt = T`
- **WHEN** the repository lists the next page with `before = T`
- **THEN** the result SHALL be call logs with `started_at < T` ordered by `started_at DESC`

### Requirement: Schema versioning and forward-only migration

The database SHALL declare its schema version and apply the `call_logs` migration forward-only on launch, idempotently and inside a transaction.

#### Scenario: Fresh install creates schema at current version including call_logs

- **GIVEN** no `koola.db` exists
- **WHEN** the app launches
- **THEN** the database SHALL be created at the current schema version including the `call_logs` table and its indexes
- **AND** `schema_version` SHALL record the new version

#### Scenario: Existing installs migrate forward without data loss

- **GIVEN** `koola.db` exists at schema version N (pre-call-logs)
- **WHEN** the app launches with code targeting version N+1
- **THEN** the `call_logs` table and indexes SHALL be created via `IF NOT EXISTS`
- **AND** existing `messages`, `conversations`, `sync_state`, and `outbox` rows SHALL remain untouched
- **AND** `schema_version` SHALL be updated to N+1 on commit

#### Scenario: Migration failure rolls back

- **GIVEN** the `call_logs` migration throws
- **WHEN** the migration transaction is rolled back
- **THEN** `schema_version` SHALL remain at the pre-migration value
- **AND** the app SHALL surface a recoverable error rather than corrupt data

### Requirement: Repository API for UI consumption

The app SHALL expose typed `callLogRepository` functions so UI code never writes raw SQL and receives plain JS objects shaped for `CallLogEntry`.

#### Scenario: list returns newest-first page

- **GIVEN** conversation C has at least 80 rows in `call_logs`
- **WHEN** UI calls `callLogRepository.list({ conversationId: C, limit: 50 })`
- **THEN** the result SHALL be the 50 newest call logs for C ordered by `started_at DESC`
- **AND** the call SHALL complete synchronously and in under 20 ms on a warm database for 50 rows

#### Scenario: listBefore returns next older page

- **GIVEN** the previous call returned items ending at `startedAt = T`
- **WHEN** UI calls `callLogRepository.listBefore({ conversationId: C, before: T, limit: 50 })`
- **THEN** the result SHALL be the next older page with `started_at < T`

#### Scenario: upsertMany writes server data idempotently

- **GIVEN** the sync layer produces an array of canonical call log objects mapped from `GET /call-logs`
- **WHEN** `callLogRepository.upsertMany(logs)` is called
- **THEN** new rows SHALL be INSERTed
- **AND** existing rows (matched by `id`) SHALL be UPDATEd in place
- **AND** the operation SHALL run inside a single transaction and be safe to retry

#### Scenario: wipeAll clears call logs on logout

- **WHEN** the user logs out
- **THEN** all rows in `call_logs` SHALL be deleted before auth context returns to unauthenticated state
- **AND** the operation SHALL complete via `callLogRepository.wipeAll()` (not raw SQL from the caller)

### Requirement: Reactive subscriptions for UI

The repository SHALL expose a subscription API so UI components react to `call_logs` mutations without polling, scoped per conversation.

#### Scenario: ChatScreen receives a new inline card via subscription

- **GIVEN** ChatScreen for conversation C is mounted and subscribed via `callLogRepository.subscribe(C, cb)`
- **WHEN** the sync layer or socket router upserts a call log row for C
- **THEN** the subscription callback SHALL fire within one frame
- **AND** the hook layer SHALL re-query and update React state

#### Scenario: Subscription is scoped to the conversation

- **GIVEN** ChatScreen for C1 is mounted
- **WHEN** a call log row for unrelated conversation C2 is upserted
- **THEN** the C1 subscription callback SHALL NOT fire

#### Scenario: Unmount unsubscribes cleanly

- **WHEN** the subscriber component unmounts
- **THEN** the subscription SHALL be released
- **AND** subsequent writes SHALL NOT invoke the released callback

### Requirement: Performance budget

The `call_logs` hot-path operations SHALL meet budgets on a mid-range Android device with a warm database.

#### Scenario: List budgets

- **WHEN** `callLogRepository.list({ limit: 50 })` or `listBefore({ limit: 50 })` is called on a warm database
- **THEN** each call SHALL complete in under 20 ms

#### Scenario: Upsert budgets

- **WHEN** `callLogRepository.upsertMany(N)` is called with N <= 50
- **THEN** the transaction SHALL complete in under 100 ms

#### Scenario: Apply via socket budgets

- **WHEN** a single call-log socket event is applied via the router into the repository
- **THEN** the write + notify SHALL complete in under 5 ms
