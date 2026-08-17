## ADDED Requirements

### Requirement: Idle Maintenance Scheduler

The mobile app SHALL run a bounded storage maintenance pass during idle time that (1) applies the message retention policy defined by `message-store-sqlite`, (2) applies the outbox done-row retention defined by `message-outbox`, and (3) reclaims freed SQLite pages via bounded incremental vacuum. The pass SHALL run via `InteractionManager.runAfterInteractions`, only while `AppState === 'active'`, and SHALL NOT block first render of chat screens.

#### Scenario: Maintenance runs off the hot path

- **WHEN** the app triggers the maintenance pass (app foreground or post-login, after interactions settle)
- **THEN** the pass SHALL be dispatched through `InteractionManager.runAfterInteractions`
- **AND** SHALL abort or defer when `AppState` is not `active`
- **AND** the first chat-screen render SHALL NOT wait for the pass

#### Scenario: Maintenance is idempotent and safe to repeat

- **GIVEN** the maintenance pass has already run earlier in the same session
- **WHEN** it is triggered again
- **THEN** re-running SHALL be harmless (prune/reap re-evaluate current state; vacuum is gated by its daily marker)

### Requirement: Idle Incremental Vacuum

The maintenance pass SHALL reclaim freed SQLite pages via bounded `PRAGMA incremental_vacuum` at most once per 24 hours, tracked by an `account_state.last_vacuum_at` marker, so the database file shrinks after pruning and reaping instead of holding freed pages forever.

#### Scenario: Vacuum runs at most once per day

- **GIVEN** `account_state.last_vacuum_at` records a vacuum within the last 24 hours
- **WHEN** the maintenance pass runs
- **THEN** `incremental_vacuum` SHALL be skipped

#### Scenario: Vacuum reclaims a bounded number of pages

- **GIVEN** more than 24 hours have elapsed since the last vacuum
- **WHEN** the maintenance pass runs
- **THEN** `PRAGMA incremental_vacuum(N)` SHALL execute with N bounded to cap JS-thread block time under the synchronous op-sqlite shim
- **AND** `account_state.last_vacuum_at` SHALL be updated to the current time on completion

#### Scenario: Vacuum failure does not break maintenance

- **WHEN** `incremental_vacuum` throws
- **THEN** the error SHALL be logged and swallowed
- **AND** subsequent maintenance passes SHALL still run
