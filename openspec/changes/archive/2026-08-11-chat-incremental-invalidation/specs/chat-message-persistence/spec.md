## ADDED Requirements

### Requirement: Database write operations only notify when data actually changed
The system SHALL only emit invalidation notifications when a database write operation results in actual data changes, verified by checking rowsAffected or comparing values before and after the operation.

#### Scenario: Reaction already exists with same emoji
- **WHEN** a message_reaction event arrives with a userId and emoji that already exist on that message
- **THEN** the database write SHALL detect the no-op condition
- **AND** no invalidation notification SHALL be emitted

#### Scenario: Message update with identical values
- **WHEN** a message_updated event arrives with content, status, or other fields identical to the current database state
- **THEN** the database write SHALL compare the values
- **AND** no invalidation notification SHALL be emitted when all values are identical

#### Scenario: Delete message already deleted
- **WHEN** a message_deleted event arrives for a message already marked as deleted
- **THEN** the database write SHALL detect the message is already deleted
- **AND** no invalidation notification SHALL be emitted

#### Scenario: Soft delete for user already deleted
- **WHEN** softDeleteForUser is called for a user already in the deletedFor array
- **THEN** the database write SHALL detect the user is already present
- **AND** no invalidation notification SHALL be emitted

#### Scenario: Upsert with ON CONFLICT no-change
- **WHEN** upsertMany processes a batch of messages and ON CONFLICT results in no actual data change for some messages
- **THEN** only conversations with actual changes SHALL be added to affectedConvIds
- **AND** conversations with no-op upserts SHALL NOT trigger invalidation notifications

#### Scenario: Actual data change triggers notification
- **WHEN** any database write results in actual data modification (verified by rowsAffected > 0 or value comparison shows difference)
- **THEN** the invalidation notification SHALL be emitted normally
