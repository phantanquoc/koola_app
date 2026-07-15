# chat-message-presentation Specification

## Purpose
Defines the visual presentation rules for chat message bubbles: bubble distinguishability across themes, single delivery-state indicator ownership, read-state visual differentiation, media metadata legibility, and layout stability of message metadata.

## Requirements
### Requirement: Message bubbles remain distinguishable
The chat presentation SHALL visually separate incoming and outgoing messages from the conversation canvas in every supported theme.

#### Scenario: Incoming message in dark mode
- **WHEN** an incoming message is rendered with the dark theme
- **THEN** its bubble boundary SHALL remain visually distinguishable from the canvas
- **AND** its text and metadata SHALL meet the applicable contrast target

#### Scenario: Consecutive speakers are shown
- **WHEN** adjacent messages belong to different senders
- **THEN** alignment, bubble treatment, and metadata SHALL make the speaker change clear without relying only on color

### Requirement: Outbound delivery state has one visual owner
Each outbound message SHALL display no more than one delivery-state indicator derived from the existing message state.

#### Scenario: Sent message is not yet read
- **WHEN** an outbound message resolves to the sent state
- **THEN** exactly one sent indicator SHALL be visible

#### Scenario: Message state changes
- **WHEN** an outbound message transitions from pending to sent to read
- **THEN** the existing indicator SHALL update in place
- **AND** a second GiftedChat or custom indicator SHALL NOT appear

#### Scenario: Incoming message is rendered
- **WHEN** a message was sent by another user
- **THEN** no outbound delivery indicator SHALL be visible

### Requirement: Read state has a distinct visual
Outbound messages whose read receipt has been received SHALL display a visually distinct indicator differentiating them from merely-sent messages.

#### Scenario: Message transitions from sent to read
- **WHEN** the app receives an incoming read event for an outbound message (via `useReadReceipts`)
- **THEN** the delivery indicator SHALL change to a distinct read visual (e.g. double-check or filled icon)
- **AND** the sent visual SHALL no longer appear for that message

#### Scenario: Read visual is distinguishable from sent
- **WHEN** a user scans a conversation with mixed sent and read messages
- **THEN** the difference between sent and read indicators SHALL be visually clear without relying only on color

### Requirement: Media message metadata is legible
GiftedChat's built-in time and tick renderers SHALL be suppressed or replaced so that media-message metadata remains legible against the media treatment.

#### Scenario: Media bubble renders metadata
- **WHEN** an outbound media message (image/video) is displayed
- **THEN** timestamp and delivery indicator SHALL be rendered on an opaque or semi-opaque surface
- **AND** text SHALL NOT float directly over transparent image content without a readable backdrop

#### Scenario: GiftedChat default renderers are suppressed
- **WHEN** GiftedChat processes a media message
- **THEN** the built-in `renderTime` and tick renderers SHALL be overridden by the Koola custom renderer
- **AND** no duplicate or unstyled time/tick text SHALL appear

### Requirement: Failure and retry feedback preserves existing semantics
Presentation changes SHALL reuse the existing outbox failure and retry flow.

#### Scenario: Send fails
- **WHEN** the existing message state resolves to failed
- **THEN** one accessible failed-state action SHALL be shown
- **AND** activating it SHALL invoke the existing retry path

#### Scenario: Retry is in progress
- **WHEN** a failed message is retried
- **THEN** the indicator SHALL return to pending according to the existing state model
- **AND** presentation code SHALL NOT create a parallel message-state store

### Requirement: Message metadata remains attached and stable
Timestamp and delivery feedback SHALL be visually associated with their owning message and SHALL not cause material layout shifts during state changes.

#### Scenario: Long text wraps
- **WHEN** an outbound message wraps across multiple lines
- **THEN** timestamp and delivery state SHALL remain readable without overlapping message text

#### Scenario: Media message is shown
- **WHEN** an outbound media message has delivery metadata
- **THEN** the metadata SHALL remain legible against the media treatment and belong to that message only
