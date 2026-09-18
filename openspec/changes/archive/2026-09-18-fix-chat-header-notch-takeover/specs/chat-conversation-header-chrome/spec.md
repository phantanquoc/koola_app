## ADDED Requirements

### Requirement: Chat conversation header takes over the shared notch band

The Chat conversation screen (`ChatScreen`) SHALL present its header — back action, other-party avatar, name, presence status, audio call action, video call action — by taking over the shared notch band rendered by `ChatTabStack`, rather than rendering a separate header element. `ChatScreen` SHALL NOT render its own fixed header view stacked in front of or behind the shared band.

#### Scenario: Chat screen gains focus

- **WHEN** `ChatScreen` becomes the focused screen in `ChatTabStack`
- **THEN** the shared notch band SHALL render the chat variant: back action, avatar (with an online indicator when the other party's status is "Đang hoạt động"), name, status line, audio call action, and video call action
- **AND** the band SHALL NOT render the KOOLA wordmark while this variant is active

#### Scenario: Chat screen loses focus

- **WHEN** the user navigates away from `ChatScreen` (back, or pushing to `GroupInfo`, `Profile`, `UniversalSearch`, or `MomentComposer`)
- **THEN** the shared notch band SHALL return to rendering the KOOLA wordmark
- **AND** no chat-specific header content SHALL remain visible in the band

#### Scenario: No overlapping chrome

- **WHEN** `ChatScreen` is focused
- **THEN** exactly one header element SHALL be visible at the top of the screen
- **AND** the back action, avatar, name, status text, audio call action, and video call action SHALL each be fully visible and not visually obscured by any other chrome element

### Requirement: Chat header content is not obscured, and does not obscure other content

Content below the chat header — the offline banner, the pinned-message banner, and the message list — SHALL render entirely below the shared notch band's occupied height while `ChatScreen` is focused.

#### Scenario: Offline banner while chat header is active

- **WHEN** the device has no network connection and `ChatScreen` is focused
- **THEN** the offline banner SHALL render fully visible below the notch band, with no part of it covered by the band

#### Scenario: Pinned message banner while chat header is active

- **WHEN** at least one message is pinned in the open conversation and `ChatScreen` is focused
- **THEN** the pinned-message banner SHALL render fully visible below the notch band

### Requirement: Chat header actions remain functional after the takeover

Tapping the header's interactive regions SHALL trigger the same behavior as before the takeover: opening conversation info, and initiating an audio or video call.

#### Scenario: User taps the avatar or name area

- **WHEN** the user taps the avatar, name, or status area of the chat header
- **THEN** the app SHALL navigate to or open the conversation/profile info view for the other party

#### Scenario: User taps the audio call action

- **WHEN** the user taps the audio call action in the chat header
- **THEN** the app SHALL initiate an audio call to the other party

#### Scenario: User taps the video call action

- **WHEN** the user taps the video call action in the chat header
- **THEN** the app SHALL initiate a video call to the other party

#### Scenario: Status arrives after initial render

- **WHEN** the other party's presence status is not yet known at the time the chat header first renders, and becomes known shortly after
- **THEN** the status line SHALL reserve its layout space before the status text arrives
- **AND** the arrival of the status text SHALL NOT shift the position of the name, avatar, or call actions
