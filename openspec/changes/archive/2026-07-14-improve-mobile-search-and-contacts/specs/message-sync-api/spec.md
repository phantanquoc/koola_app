## ADDED Requirements

### Requirement: Bidirectional message context retrieval around a target message
The backend SHALL support loading a bounded window of messages centered on a specified target message within a conversation, so clients can scroll to an arbitrary message without unbounded backward pagination.

#### Scenario: Client requests context around a known message
- **WHEN** the client calls `GET /conversations/:id/messages?around=<messageId>&limit=N`
- **AND** the caller is an authorized member of the conversation
- **THEN** the response SHALL return up to N/2 messages before and N/2 messages after the target, plus the target itself
- **AND** messages SHALL be ordered by `createdAt` ascending

#### Scenario: Target message is near the beginning of the conversation
- **WHEN** fewer than N/2 messages exist before the target
- **THEN** the response SHALL return all available prior messages and fill the remainder from messages after the target (up to the total limit)

#### Scenario: Target message does not exist or caller lacks access
- **WHEN** the `around` messageId is not found in the conversation or the caller is not a member
- **THEN** the endpoint SHALL return a 404 or appropriate error
- **AND** no message data SHALL be leaked

#### Scenario: Around parameter coexists with existing pagination
- **WHEN** `around` is provided
- **THEN** the backward-only `before`/`after` cursor parameters SHALL be ignored for that request
- **AND** the response SHALL include `hasBefore` and `hasAfter` booleans indicating whether more messages exist in each direction
