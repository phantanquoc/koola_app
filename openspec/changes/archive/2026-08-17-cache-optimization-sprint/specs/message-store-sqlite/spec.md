## ADDED Requirements

### Requirement: Message Retention Policy

The local SQLite `messages` store SHALL enforce a retention policy during idle maintenance so the database does not grow without bound. The policy SHALL delete messages older than a configurable age (default 90 days) while never reducing any conversation below its most recent N messages (default 200). Deletion is local-only; the backend MongoDB remains canonical and is unaffected.

#### Scenario: Old messages pruned past the age threshold

- **GIVEN** a conversation has messages older than 90 days and more than 200 total messages
- **WHEN** the message repository's retention function runs
- **THEN** messages with `created_at` older than 90 days SHALL be deleted
- **AND** the conversation SHALL retain at least its 200 most recent messages regardless of age

#### Scenario: Small conversations keep all messages

- **GIVEN** a conversation has 150 messages, some older than 90 days
- **WHEN** the retention function runs
- **THEN** no message in that conversation SHALL be deleted (the 200-message floor exceeds the count)

#### Scenario: Retention is exposed through the repository

- **WHEN** the maintenance scheduler invokes pruning
- **THEN** it SHALL call a `messageRepository` function (not raw SQL from the scheduler)
- **AND** the deletion SHALL occur within the repository's transaction wrapper
