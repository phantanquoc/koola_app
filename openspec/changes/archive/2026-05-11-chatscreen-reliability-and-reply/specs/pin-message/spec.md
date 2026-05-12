## MODIFIED Requirements

### Requirement: Pin and unpin messages
The system SHALL allow any conversation member to pin or unpin a message. There is no limit on the number of pinned messages per conversation. Pin/unpin actions are broadcast via `message_pinned` / `message_unpinned` socket events. Pin and unpin failures SHALL surface a user-visible error (toast) on the client; silent fire-and-forget is not permitted.

#### Scenario: Pin a message
- **WHEN** user selects "Ghim" from the context menu
- **THEN** the message is added to the conversation's pinnedMessages array, a socket event is broadcast, and the pin banner appears at the top of the chat

#### Scenario: Unpin a message
- **WHEN** user selects "Bỏ ghim" from the context menu on a pinned message
- **THEN** the message is removed from pinnedMessages, a socket event is broadcast, and the banner updates

#### Scenario: Pin REST failure surfaces error
- **WHEN** user taps "Ghim" and the POST /messages/:id/pin request fails (network error, HTTP 5xx)
- **THEN** the client shows a toast "Không thể ghim tin nhắn. Vui lòng thử lại."; the pin banner and local state are NOT updated

#### Scenario: Unpin REST failure surfaces error
- **WHEN** user taps "Bỏ ghim" and the unpin request fails
- **THEN** the client shows a toast "Không thể bỏ ghim. Vui lòng thử lại."; pin state stays as it was
