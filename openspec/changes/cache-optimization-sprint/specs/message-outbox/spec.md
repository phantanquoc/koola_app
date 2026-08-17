## ADDED Requirements

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
