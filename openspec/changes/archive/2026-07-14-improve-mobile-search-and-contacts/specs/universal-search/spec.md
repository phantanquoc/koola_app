## MODIFIED Requirements

### Requirement: Message Result Item
The "Tin nhan" section SHALL display messages returned by `GET /messages/search?q=` and SHALL retain enough message identity to open the selected result in conversation context.

#### Scenario: Message result shows context
- **WHEN** a message result is rendered
- **THEN** the item shows: sender display name, a content snippet (max 80 chars), conversation name, and relative timestamp

#### Scenario: Tap message result navigates to exact message
- **WHEN** user taps a message result item
- **THEN** client navigates to `ChatScreen` with the message's `conversationId` and `targetMessageId`
- **AND** Chat loads and scrolls to the selected message
- **AND** the selected message receives a temporary non-blocking highlight

#### Scenario: Target message is unavailable
- **WHEN** the selected message was deleted, is no longer authorized, or cannot be loaded
- **THEN** Chat opens the conversation at its normal position
- **AND** a non-blocking Vietnamese notice explains that the selected message is unavailable

#### Scenario: Chat route accepts targetMessageId parameter
- **WHEN** a navigation action passes `targetMessageId` to the Chat route
- **THEN** the `Chat` route type definition (in `types.ts`) SHALL include an optional `targetMessageId` field
- **AND** `ChatScreen` SHALL consume the parameter to trigger context loading and scroll behavior

## ADDED Requirements

### Requirement: Search source failures remain distinguishable from empty results
Universal Search SHALL maintain independent loading, result, empty, and error state for each search source.

#### Scenario: One source fails
- **WHEN** message search fails while conversation and people search succeed
- **THEN** successful sections SHALL keep their results
- **AND** the message section SHALL show an error with a retry action instead of "Khong tim thay ket qua"

#### Scenario: User retries a failed section
- **WHEN** the user activates retry for a failed section
- **THEN** only that source SHALL rerun for the current query
- **AND** other section results SHALL remain visible

### Requirement: Per-section error state is independent
Each search section SHALL own its own `loading`, `error`, `empty`, and `results` state without sharing a single `error` field.

#### Scenario: Contacts search clears error while messages error is active
- **WHEN** the contacts effect runs `setError(null)` for its own section
- **THEN** an active message-section error SHALL NOT be cleared
- **AND** each section's error lifecycle SHALL be isolated (defect: `useUniversalSearch.ts` shares one `error` state across sections)
