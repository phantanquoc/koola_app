## MODIFIED Requirements

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
