# message-context-menu Specification

## Purpose
TBD - created by archiving change chat-message-actions. Update Purpose after archive.
## Requirements
### Requirement: Long press message shows context menu
The system SHALL show a bottom sheet context menu when the user long-presses any message. The menu SHALL contain: a row of 6 emoji reactions (👍❤️😆😮😢😠), "Chuyển tiếp" (Forward), "Ghim" / "Bỏ ghim" (Pin/Unpin), "Sao chép" (Copy), "Xóa" (Delete), each as a tappable option.

The long-press gesture SHALL be hosted by the application's own row wrapper. It was previously triggered by a touchable inside GiftedChat's `Bubble` component, which the row no longer renders; the gesture therefore has an explicit owner rather than an inherited one. The long-press region SHALL cover the bubble so that pressing anywhere on a message opens the menu, matching the previous hit area.

#### Scenario: Long press text message
- **WHEN** user long-presses a text message
- **THEN** a bottom sheet slides up showing emoji row + Forward + Pin + Copy + Delete options

#### Scenario: Long press image message
- **WHEN** user long-presses an image message
- **THEN** the same context menu appears (Copy copies the media key/URL)

#### Scenario: Dismiss context menu
- **WHEN** user taps outside the bottom sheet or presses back
- **THEN** the context menu dismisses without any action

#### Scenario: Long press a failed message
- **WHEN** user long-presses a message in the failed state
- **THEN** the context menu SHALL still appear
- **AND** a single tap on that message SHALL still trigger retry rather than opening the menu

#### Scenario: Long press a system message
- **WHEN** user long-presses a system message
- **THEN** no context menu SHALL appear

#### Scenario: Tapping a link inside a message
- **WHEN** user taps a detected URL, phone number, or email inside a message body
- **THEN** the link action SHALL run
- **AND** the context menu SHALL NOT open

### Requirement: Copy text from context menu
The system SHALL copy the message text content to the clipboard when user taps "Sao chép".

#### Scenario: Copy text message
- **WHEN** user taps "Sao chép" on a text message
- **THEN** the message content is copied to clipboard and a Toast shows "Đã sao chép"

