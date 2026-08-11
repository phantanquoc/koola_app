## ADDED Requirements

### Requirement: Scroll-while-realtime does not reload the entire loaded message window
The system SHALL NOT reload the entire loaded message window when a socket event (reaction, ACK, incoming message, status update) or sync operation occurs during scrolling. Only affected messages SHALL be updated, preserving object identity for unchanged messages.

This requirement addresses the realtime/sync jank component of chat scroll, distinct from the pure scroll jank addressed by view tree reduction.

#### Scenario: Reaction during scroll
- **WHEN** user is scrolling through 300 loaded messages and a reaction event arrives for one message
- **THEN** only that one message object SHALL be replaced with its updated version
- **AND** the other 299 message objects SHALL retain their original identity
- **AND** the scroll SHALL NOT stutter or freeze

#### Scenario: ACK during scroll
- **WHEN** user is scrolling and receives ACK for an optimistically-sent message
- **THEN** only that message object SHALL be replaced
- **AND** the scroll SHALL remain smooth

#### Scenario: Incoming message during scroll
- **WHEN** user is scrolling through history and a new message arrives at the top
- **THEN** the new message SHALL be inserted at position 0
- **AND** existing messages SHALL retain their identity
- **AND** the scroll position SHALL NOT jump (if user is not at top)

#### Scenario: Delta sync during scroll
- **WHEN** user returns from offline and delta sync fetches 300 messages across 3 pages while user is scrolling
- **THEN** the UI SHALL update once after all pages complete, not once per page
- **AND** the scroll SHALL remain smooth during the batch operation
