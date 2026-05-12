## ADDED Requirements

### Requirement: Render message delivery state ticks
The mobile client SHALL render a visual indicator on outbound (own) message bubbles reflecting the message's current delivery state.

#### Scenario: Pending optimistic message
- **WHEN** a message has `pending: true` (optimistically added before server acknowledgment)
- **THEN** the bubble shows a small clock icon next to the timestamp

#### Scenario: Sent message not yet read
- **WHEN** a message has server ACK (pending cleared, `sent: true`) and `readBy` contains only the sender's own userId (or is empty)
- **THEN** the bubble shows a single check mark ✓

#### Scenario: Read in 1-1 conversation
- **WHEN** in a direct conversation, the message's `readBy` includes at least one userId other than the sender
- **THEN** the bubble shows a double check mark ✓✓

#### Scenario: Read in group conversation
- **WHEN** in a group conversation with N members, the message's `readBy` includes all N-1 other members
- **THEN** the bubble shows a double check mark ✓✓

#### Scenario: Partially read in group
- **WHEN** in a group conversation, `readBy` includes some but not all other members
- **THEN** the bubble shows a single check mark ✓ (aggregate per-user detail is out of scope)

#### Scenario: Failed message
- **WHEN** a message has `sent: false` after a send attempt (REST error or max-retries exceeded)
- **THEN** the bubble shows a red exclamation icon; tapping the icon retries the send with a fresh clientMessageId and the same payload

#### Scenario: Inbound messages show no tick
- **WHEN** rendering a message whose sender is not the current user
- **THEN** the bubble does NOT show any tick or clock icon

### Requirement: Subscribe to message_read socket event
The mobile client SHALL subscribe to `message_read` socket events in the current conversation and update the `readBy` field of the matching local message.

#### Scenario: Receive message_read for own message
- **WHEN** the current user's client receives a `message_read` event referencing a message they sent
- **THEN** the client appends the reader's userId to the message's local `readBy` array (deduplicated) and re-renders the bubble so the tick state transitions appropriately

#### Scenario: readBy updates are idempotent
- **WHEN** the same `message_read` event is received twice (e.g., Redis fanout retry)
- **THEN** the local `readBy` array does not contain duplicates

### Requirement: Retry failed send
The mobile client SHALL allow the user to retry a failed message by tapping the failed-state indicator.

#### Scenario: Retry failed text send
- **WHEN** user taps the red exclamation on a failed text message
- **THEN** the client generates a new clientMessageId, re-invokes the send path (online REST or offline queue), clears the failed flag, and shows the pending clock icon

#### Scenario: Retry does not duplicate if original eventually persists
- **WHEN** the old request eventually reaches the server after the retry succeeded
- **THEN** backend deduplication by clientMessageId SHALL prevent a duplicate insert; retry uses a new clientMessageId as an acknowledged trade-off (documented risk)
