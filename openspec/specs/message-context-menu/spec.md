# message-context-menu Specification

## Purpose
TBD - created by archiving change chat-message-actions. Update Purpose after archive.
## Requirements
### Requirement: Long press message shows context menu
The system SHALL show a bottom sheet context menu when the user long-presses any message. The menu SHALL contain: a row of 6 emoji reactions (👍❤️😆😮😢😠), "Chuyển tiếp" (Forward), "Ghim" / "Bỏ ghim" (Pin/Unpin), "Sao chép" (Copy), "Xóa" (Delete), each as a tappable option.

#### Scenario: Long press text message
- **WHEN** user long-presses a text message
- **THEN** a bottom sheet slides up showing emoji row + Forward + Pin + Copy + Delete options

#### Scenario: Long press image message
- **WHEN** user long-presses an image message
- **THEN** the same context menu appears (Copy copies the media key/URL)

#### Scenario: Dismiss context menu
- **WHEN** user taps outside the bottom sheet or presses back
- **THEN** the context menu dismisses without any action

### Requirement: Copy text from context menu
The system SHALL copy the message text content to the clipboard when user taps "Sao chép".

#### Scenario: Copy text message
- **WHEN** user taps "Sao chép" on a text message
- **THEN** the message content is copied to clipboard and a Toast shows "Đã sao chép"

