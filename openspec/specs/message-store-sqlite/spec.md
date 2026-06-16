# message-store-sqlite Specification

## Purpose

Provides an on-device SQLite database (`koola.db`) that is the canonical local read source for chat UI on mobile. ChatScreen and ConversationListScreen read exclusively from this database on the hot path; the network layer is consulted only by the sync engine, never directly by UI code. The database holds messages, conversations, and sync state, with a typed repository API so UI code never writes raw SQL.

This capability replaces the MMKV `message-cache` as the primary local store once the `LOCAL_FIRST_SQLITE` flag is enabled and the one-time backfill from MMKV completes.

## Requirements

### Requirement: Local SQLite Database as Canonical Read Source

The mobile app SHALL maintain an on-device SQLite database (`koola.db`) that is the canonical source of message and conversation data for the chat UI. ChatScreen and ConversationListScreen SHALL read exclusively from this database on the hot path; the network layer is consulted only by the sync engine, never directly by UI code.

#### Scenario: ChatScreen reads from SQLite, not REST, on conversation open

- **GIVEN** conversation C has at least one message persisted in the local database
- **WHEN** the user navigates to ChatScreen for C
- **THEN** the first React render SHALL receive messages produced by a SQLite query
- **AND** no `messagesApi.list` call SHALL be made by the mount effect
- **AND** the loading indicator SHALL NOT be shown

#### Scenario: ConversationListScreen reads from SQLite at app launch

- **WHEN** the user opens the app and lands on the conversation list
- **THEN** the list SHALL be populated from a SQLite query before any REST fetch resolves
- **AND** the previously-known last message preview, unread count, and timestamp SHALL appear on the first frame

#### Scenario: First-ever launch with no local data falls back to network

- **GIVEN** the local database has been freshly created and contains no rows for the current account
- **WHEN** the user opens the conversation list or any conversation
- **THEN** an empty state or a one-time loading state SHALL be shown
- **AND** the sync engine SHALL populate SQLite from the backend before subsequent reads

### Requirement: Schema Versioning and Migrations

The database SHALL declare its schema version and apply forward-only migrations on app launch. Schema changes SHALL never destroy user data unless the migration explicitly opts in (with a UI confirmation for destructive migrations). Schema version 2 introduces the `outbox` and `outbox_metrics` tables alongside the existing `messages`, `conversations`, `sync_state`, `account_state`, and `schema_version` tables; the existing v1 tables and indexes are unchanged.

#### Scenario: First launch creates the schema at the current version

- **GIVEN** no `koola.db` exists on disk
- **WHEN** the app launches
- **THEN** the database SHALL be created with the current schema version
- **AND** a `schema_version` row SHALL record the version number
- **AND** the app SHALL boot without prompting the user

#### Scenario: Forward migrations run automatically and idempotently

- **GIVEN** `koola.db` exists at schema version N
- **AND** the bundled app code targets schema version N+k (k >= 1)
- **WHEN** the app launches
- **THEN** migrations N+1, N+2, ..., N+k SHALL execute in order inside a single transaction
- **AND** the `schema_version` row SHALL be updated to N+k on commit
- **AND** the migrations SHALL be idempotent (running twice produces the same final state)

#### Scenario: Migration failure leaves the database untouched

- **GIVEN** a migration step throws or fails
- **WHEN** the migration transaction is rolled back
- **THEN** `schema_version` SHALL remain at the pre-migration value
- **AND** the app SHALL surface a recoverable error rather than corrupt data

#### Scenario: Migration v2 adds outbox tables without altering existing data

- **GIVEN** `koola.db` exists at schema version 1 with rows in `messages`, `conversations`, and `sync_state`
- **WHEN** the app launches with build code targeting version 2
- **THEN** the migration SHALL create the `outbox` and `outbox_metrics` tables and their indexes via `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` statements
- **AND** the existing `messages`, `conversations`, `sync_state`, and `account_state` rows SHALL remain untouched
- **AND** `schema_version` SHALL be set to `2`

### Requirement: Messages Table Schema

The database SHALL contain a `messages` table whose columns mirror the canonical message shape used by the chat UI and the backend, with indexes that support the hot-path queries. Column types and semantics MUST match the backend Mongoose schema (`chat-backend/src/messages/message.schema.ts`) so sync is a direct row mirror, not a translation.

#### Scenario: Required columns exist and mirror backend shape

- **WHEN** the schema is inspected after migration
- **THEN** the `messages` table SHALL contain at least the columns `id` (TEXT PK), `conversation_id` (TEXT), `sender_id` (TEXT), `client_message_id` (TEXT, nullable), `type` (TEXT), `content` (TEXT), `media_key` (TEXT, nullable), `media_mime_type` (TEXT, nullable), `media_size` (INTEGER, nullable), `media_duration` (INTEGER, nullable), `media_thumbnail_key` (TEXT, nullable), `image_width` (INTEGER, nullable), `image_height` (INTEGER, nullable), `blurhash` (TEXT, nullable), `created_at` (INTEGER, ms epoch), `updated_at` (INTEGER, ms epoch), `status` (TEXT), `deleted` (INTEGER, 0/1, default 0), `deleted_for` (TEXT, JSON array of user ids, default '[]'), `read_by` (TEXT, JSON array of user ids, default '[]'), `reactions` (TEXT, JSON, default '[]'), `reply_to` (TEXT, nullable), `reply_to_preview` (TEXT, JSON, nullable)

#### Scenario: Hot-path indexes exist

- **WHEN** the schema is inspected after migration
- **THEN** an index on `(conversation_id, created_at DESC)` SHALL exist for paginated list queries
- **AND** a unique index on `client_message_id` SHALL exist (where non-null) for optimistic-message dedup
- **AND** an index on `(conversation_id, updated_at DESC)` SHALL exist for sync-driven upserts

#### Scenario: Optimistic messages are stored with temp ids

- **WHEN** an outgoing message is enqueued before backend acknowledgement
- **THEN** the row SHALL be inserted with `id = "temp_<clientMessageId>"` and `status = "pending"`
- **AND** the row SHALL be updated in place to the real `id` when the server ack arrives, preserving the same `client_message_id`

#### Scenario: Soft-delete uses backend boolean shape

- **WHEN** a sync delta or socket event reports a message as soft-deleted
- **THEN** the row SHALL be UPDATEd with `deleted = 1`
- **AND** any reasonable subsets of content fields MAY be cleared at the same time
- **AND** default UI queries SHALL filter out rows where `deleted = 1`

#### Scenario: Per-user delete uses deleted_for JSON array

- **WHEN** a sync delta or socket event reports the current user as added to `deletedFor[]`
- **THEN** the row's `deleted_for` JSON column SHALL be UPDATEd to include the user id
- **AND** default UI queries SHALL filter out rows where the current user id appears in `deleted_for`

### Requirement: Conversations Table Schema

The database SHALL contain a `conversations` table that holds the metadata required to render the conversation list without a network round-trip.

#### Scenario: Required columns exist

- **WHEN** the schema is inspected after migration
- **THEN** the `conversations` table SHALL contain at least the columns `id` (TEXT PK), `type` (TEXT, e.g. 'direct'/'group'), `name` (TEXT, nullable), `avatar_key` (TEXT, nullable), `members` (TEXT, JSON array of user ids), `last_message_id` (TEXT, nullable), `last_message_preview` (TEXT, nullable), `last_message_at` (INTEGER), `unread_count` (INTEGER), `pinned` (INTEGER, 0/1), `archived` (INTEGER, 0/1), `updated_at` (INTEGER)

#### Scenario: Index supports the default sort

- **WHEN** the schema is inspected after migration
- **THEN** an index on `(archived ASC, pinned DESC, last_message_at DESC)` SHALL exist
- **AND** the conversation list query SHALL use this index for the default ordering

### Requirement: Repository API for UI Consumption

The mobile app SHALL expose typed repository functions over the SQLite layer so UI code never writes raw SQL. The repository SHALL return plain JS objects shaped for the existing `IMessage` and conversation list view models.

#### Scenario: listMessages returns paginated messages newest-first

- **GIVEN** conversation C has at least 200 rows in `messages`
- **WHEN** UI calls `messageRepository.list({ conversationId: C, limit: 50 })`
- **THEN** the result SHALL be the 50 newest non-deleted (for current user) messages, ordered by `created_at DESC`
- **AND** the call SHALL complete in under 20 ms on a warm database

#### Scenario: listMessages with cursor returns next page

- **GIVEN** the previous call returned messages M50 ... M1 with `M50.created_at = T`
- **WHEN** UI calls `messageRepository.list({ conversationId: C, before: T, limit: 50 })`
- **THEN** the result SHALL be the next 50 messages older than T
- **AND** soft-deleted messages for the current user SHALL be excluded

#### Scenario: upsertMessages writes server data idempotently

- **GIVEN** the sync engine produces an array of canonical message objects
- **WHEN** `messageRepository.upsertMany(messages)` is called
- **THEN** new rows SHALL be INSERTed
- **AND** existing rows (matched by `id`) SHALL be UPDATEd in place
- **AND** the operation SHALL run inside a single transaction
- **AND** the operation SHALL be safe to retry without duplicating rows

#### Scenario: applySocketEvent translates events into row mutations

- **GIVEN** a socket event of one of the supported kinds (`new_message`, `message_ack`, `message_deleted`, `message_reaction`, `message_updated`)
- **WHEN** the sync engine forwards the event to `messageRepository.applySocketEvent(event)`
- **THEN** the corresponding INSERT/UPDATE/DELETE SHALL be applied
- **AND** the change SHALL be observable to subscribed UI within one frame

### Requirement: Reactive Subscriptions for UI

The repository SHALL expose a subscription API that lets UI components react to SQLite mutations without polling. ChatScreen SHALL receive an updated message list when a relevant write occurs in the database.

#### Scenario: ChatScreen receives a new message via subscription

- **GIVEN** ChatScreen for conversation C is mounted and subscribed via `messageRepository.subscribe({ conversationId: C })`
- **WHEN** the sync engine inserts a new message row for C
- **THEN** the subscription callback SHALL fire with the updated list within one render frame
- **AND** the React state SHALL be updated by the hook layer

#### Scenario: Subscription is scoped to the conversation

- **GIVEN** ChatScreen for conversation C1 is mounted
- **WHEN** a message row for an unrelated conversation C2 is inserted
- **THEN** the C1 subscription callback SHALL NOT fire

#### Scenario: Unmount unsubscribes cleanly

- **WHEN** the subscriber component unmounts
- **THEN** the subscription SHALL be released
- **AND** subsequent writes SHALL NOT invoke the released callback

### Requirement: Per-Account Isolation

The database SHALL contain data only for the currently authenticated account. Logout SHALL leave no readable message data on disk.

#### Scenario: Logout wipes all chat data

- **WHEN** the user logs out
- **THEN** all rows in `messages`, `conversations`, `sync_state`, `outbox`, and `outbox_metrics` tables SHALL be deleted
- **AND** the operation SHALL complete before the auth context returns to the unauthenticated state
- **AND** any pending repository subscriptions SHALL be released

#### Scenario: Login by a different user starts from an empty database

- **GIVEN** user A logged out, leaving an empty schema
- **WHEN** user B logs in on the same device
- **THEN** user B SHALL see no messages from user A
- **AND** user B SHALL see no outbox rows from user A
- **AND** the sync engine SHALL populate the database from the backend for user B

### Requirement: Backfill From Legacy MMKV Cache

On the first launch after upgrading to a build that contains the local database, the app SHALL backfill any messages currently stored in the legacy MMKV `message-cache` instance into SQLite so that previously-cached conversations remain instantly readable.

#### Scenario: Backfill runs once and is idempotent

- **GIVEN** the device contains a populated MMKV `message-cache` from a prior release
- **AND** the local database has just been created at the current schema version
- **WHEN** the app boots and the backfill task runs
- **THEN** every cached message in MMKV SHALL be upserted into the SQLite `messages` table
- **AND** a `backfill_done` marker SHALL be written so the task does not run again
- **AND** the MMKV `message-cache` payload SHALL be deleted after a successful backfill

#### Scenario: Backfill failure does not block app launch

- **WHEN** the backfill task throws or fails midway
- **THEN** the app SHALL continue to boot
- **AND** the failure SHALL be logged
- **AND** any partially backfilled rows SHALL still be valid (no half-written entries left in an unusable state)

### Requirement: Performance Budget

The repository hot-path operations SHALL meet the following budgets on a mid-range Android device with a warm database:

- `messageRepository.list({ limit: 50 })`: <= 20 ms
- `conversationRepository.list({ limit: 50 })`: <= 20 ms
- `messageRepository.upsertMany(N)` for N <= 500: <= 200 ms
- `messageRepository.applySocketEvent(event)`: <= 5 ms

#### Scenario: Cold-start ChatScreen first paint

- **GIVEN** the app has just been launched and the database is cold
- **WHEN** the user taps a conversation that contains cached data
- **THEN** the first paint of ChatScreen SHALL show messages within 50 ms after navigation completes
