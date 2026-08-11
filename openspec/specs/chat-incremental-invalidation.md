## ADDED Requirements

### Requirement: Incremental message state updates
The system SHALL update message state incrementally by patching only affected messages, preserving object identity for unchanged messages.

#### Scenario: Single message reaction
- **WHEN** a reaction is added to one message while 300 messages are loaded
- **THEN** only that one message object is replaced; the other 299 message objects retain their identity

#### Scenario: Message status update
- **WHEN** a message status changes from 'sent' to 'delivered'
- **THEN** only that message object is replaced; all other loaded messages retain their identity

#### Scenario: Message deletion
- **WHEN** a message is deleted
- **THEN** the deleted message is removed from the list; all other loaded messages retain their identity

#### Scenario: New message insertion
- **WHEN** a new message arrives
- **THEN** the new message is inserted at the correct position; existing messages retain their identity

### Requirement: Batch delta sync
The system SHALL batch multi-page delta sync operations into a single UI update.

#### Scenario: Three-page sync
- **WHEN** delta sync fetches 300 messages across 3 pages of 100 items each
- **THEN** the UI updates once after all pages complete, not once per page

#### Scenario: Single-page sync
- **WHEN** delta sync fetches 50 messages in one page
- **THEN** the UI updates once after the page completes

### Requirement: Message order correctness
The system SHALL maintain correct message ordering after incremental updates.

#### Scenario: Insert at start
- **WHEN** a new message with the latest timestamp arrives
- **THEN** it appears at position 0 (top of the list)

#### Scenario: Insert in middle
- **WHEN** a delayed message arrives with a timestamp between two existing messages
- **THEN** it is inserted at the correct sorted position

#### Scenario: Insert at end
- **WHEN** an old message is backfilled from sync
- **THEN** it appears at the correct position based on createdAt

### Requirement: Optimistic send flow preserved
The system SHALL preserve the optimistic send + ACK flow when using incremental updates.

#### Scenario: Optimistic then ACK
- **WHEN** user sends a message (optimistic insert) then receives ACK from server
- **THEN** the optimistic message is replaced with the server-confirmed message at the same position; message list does not flicker or re-sort

#### Scenario: Optimistic then failure
- **WHEN** user sends a message (optimistic insert) then receives failure notification
- **THEN** the optimistic message is updated to failed state; message remains at the same position

### Requirement: No-op write suppression
The system SHALL suppress database notifications for writes that did not change data.

#### Scenario: Reaction already set
- **WHEN** a reaction event arrives for a reaction that already exists with the same emoji and userId
- **THEN** no database notification is emitted; no UI update occurs

#### Scenario: Update with identical values
- **WHEN** a message_updated event arrives with values identical to the current database state
- **THEN** no database notification is emitted; no UI update occurs

#### Scenario: Delete already deleted
- **WHEN** a delete event arrives for a message already marked deleted
- **THEN** no database notification is emitted; no UI update occurs

#### Scenario: Upsert with no conflict change
- **WHEN** upsertMany processes a message and ON CONFLICT results in no actual data change
- **THEN** that conversation is not added to affectedConvIds; no notification is emitted for that conversation
