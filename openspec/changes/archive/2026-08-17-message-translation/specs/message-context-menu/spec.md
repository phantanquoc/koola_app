# message-context-menu Specification Delta

## MODIFIED Requirements

### Requirement: Long press message shows context menu
The system SHALL show a bottom sheet context menu when the user long-presses any message. The menu SHALL contain: a row of 6 emoji reactions (👍❤️😆😮😢😠), "Dịch" (Translate), "Chuyển tiếp" (Forward), "Ghim" / "Bỏ ghim" (Pin/Unpin), "Sao chép" (Copy), "Xóa" (Delete), each as a tappable option. The "Dịch" action SHALL only appear when the message has non-empty textual content; it SHALL NOT appear for media-only, file, or system messages.

The long-press gesture SHALL be hosted by the application's own row wrapper. It was previously triggered by a touchable inside GiftedChat's `Bubble` component, which the row no longer renders; the gesture therefore has an explicit owner rather than an inherited one. The long-press region SHALL cover the bubble so that pressing anywhere on a message opens the menu, matching the previous hit area.

#### Scenario: Long press text message
- **WHEN** user long-presses a text message
- **THEN** a bottom sheet slides up showing emoji row + Dịch + Forward + Pin + Copy + Delete options

#### Scenario: Long press image message
- **WHEN** user long-presses an image message
- **THEN** the context menu appears with Forward + Pin + Delete (Copy copies the media key/URL; Dịch is absent because there is no textual content)

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

## ADDED Requirements

### Requirement: Translate action visible only for text messages
The context menu SHALL display the "Dịch" (Translate) action only when the long-pressed message has non-empty textual content. The action SHALL be hidden for messages without text.

#### Scenario: Translate action on text message
- **WHEN** user long-presses a message that has non-empty text content
- **THEN** the "Dịch" action is present and tappable in the menu

#### Scenario: Translate action hidden for media-only message
- **WHEN** user long-presses an image, video, or file message with no text caption
- **THEN** the "Dịch" action is not shown in the menu
