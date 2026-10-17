## ADDED Requirements

### Requirement: Sync respects per-user clear point
`GET /messages/sync` SHALL exclude, per conversation, messages whose `createdAt` is at or before the caller's `clearedAt` for that conversation, including tombstones and edits of such messages. Conversations the caller never cleared SHALL behave exactly as before.

#### Scenario: Pre-clear message edited after clear
- **WHEN** the caller cleared conversation C at T, and a message in C created before T is edited or reacted to after T
- **THEN** that message is NOT returned by `/messages/sync` to the caller

#### Scenario: Post-clear messages still sync
- **WHEN** a message is created in C after T
- **THEN** it is returned by `/messages/sync` with the usual ordering, cursor and tombstone semantics

#### Scenario: Other members unaffected
- **WHEN** another member of C calls `/messages/sync`
- **THEN** their results are identical to the behaviour before this change
