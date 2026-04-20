## ADDED Requirements

### Requirement: Pin and unpin messages
The system SHALL allow any conversation member to pin or unpin a message. There is no limit on the number of pinned messages per conversation. Pin/unpin actions are broadcast via `message_pinned` / `message_unpinned` socket events.

#### Scenario: Pin a message
- **WHEN** user selects "Ghim" from the context menu
- **THEN** the message is added to the conversation's pinnedMessages array, a socket event is broadcast, and the pin banner appears at the top of the chat

#### Scenario: Unpin a message
- **WHEN** user selects "Bỏ ghim" from the context menu on a pinned message
- **THEN** the message is removed from pinnedMessages, a socket event is broadcast, and the banner updates

### Requirement: Pin banner at top of chat
The system SHALL display a banner at the top of the chat showing the most recently pinned message content (truncated). Tapping the banner scrolls to that pinned message. If multiple messages are pinned, tapping cycles through them from newest to oldest.

#### Scenario: Single pinned message
- **WHEN** one message is pinned
- **THEN** the banner shows "📌 {truncated content}" and tap scrolls to that message

#### Scenario: Multiple pinned messages
- **WHEN** 3 messages are pinned and user taps the banner
- **THEN** first tap scrolls to the most recent pin, second tap scrolls to the next, third tap scrolls to the oldest, fourth tap cycles back to the most recent

#### Scenario: No pinned messages
- **WHEN** no messages are pinned in the conversation
- **THEN** no pin banner is displayed
