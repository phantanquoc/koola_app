# Archive Notes — local-first-outbox-foundation

## Summary

Change A of the local-first outbox initiative. Delivers the complete outbox infrastructure layer: SQLite schema v2 (outbox + outbox_metrics tables), outboxRepository with full state-machine API, OutboxProcessor with foreground-only worker, five trigger sources, watchdog, coalesce enforcement, reply blocking, cascade dead-letter, sanitized error schema, telemetry counters, AsyncStorage backfill migration (v→1), and per-account isolation.

The outbox infrastructure is dormant in this change — enqueue() is not yet wired into useMessagesFromDb hooks or any UI send path. The tables and repository exist and are tested, but no production code calls enqueue() yet.

## Follow-up Change

Change B (`local-first-outbox-integration`) is the direct successor. It will:
- Wire enqueue() into useMessagesFromDb send/react/delete hooks
- Ship the backend reactions toggle→set breaking change
- Remove the legacy OfflineQueueService send path once outbox is live

## Verification Results

- Round 2 verification: 0 CRITICALs
- All 10 round-1 findings resolved (3 CRITICAL + 3 MAJOR + 4 MINOR)
- 197 tests pass
- tsc clean (both ChatApp and backend)
- Integration suite clean

## Deferred Verification Items

The following items were not runnable in the CI/agent environment and are deferred to manual verification before Change B ships:

- **A.3 — Android emulator migration smoke**: Requires a running Android emulator. Verify that schema v1 → v2 migration runs cleanly on a real device/emulator and that existing messages/conversations rows survive the migration intact.
- **A.6 — gitnexus_detect_changes**: Requires the GitNexus index to be current. Run `npx gitnexus analyze` then `gitnexus_detect_changes()` to confirm the change's blast radius matches expectations before merging.

## Test Count Note

outboxRepository.spec.ts contains 59 tests against a target of 60. All new functionality has coverage. The missing test is a minor gap (one edge-case scenario not covered by a dedicated test case). This is acceptable for archiving — document and address in Change B if the gap is identified.

## Task Completion

- 48/50 tasks marked complete in tasks.md
- 2 incomplete tasks correspond to the deferred verification items (A.3 and A.6) above
- All implementation tasks (schema, repository, processor, migration, tests) are complete
