## ADDED Requirements

### Requirement: Bubble geometry is owned explicitly by the row
Chat bubble geometry SHALL be defined by the application's own row component rather than inherited implicitly from GiftedChat's `Bubble` stylesheet, because that component is no longer rendered.

The row SHALL reproduce the following geometry exactly, since losing any of it causes bubbles to span the full screen width or collapse below a legible height:

- Incoming rows align their content to the start of the writing direction; outgoing rows align to the end.
- Incoming bubbles reserve a 60-density-independent-pixel inset on their trailing side; outgoing bubbles reserve the same inset on their leading side.
- Every bubble has a minimum height of 20 density-independent pixels and aligns its content to the bottom.
- The metadata strip beneath the bubble lays out horizontally, justified to the start for incoming rows and to the end for outgoing rows.

#### Scenario: Incoming message is rendered
- **WHEN** an incoming message is rendered
- **THEN** the bubble SHALL align to the start of the writing direction
- **AND** a 60 dp inset SHALL remain on the trailing side so the bubble never spans the full width

#### Scenario: Outgoing message is rendered
- **WHEN** an outgoing message is rendered
- **THEN** the bubble SHALL align to the end of the writing direction
- **AND** a 60 dp inset SHALL remain on the leading side

#### Scenario: Very short message is rendered
- **WHEN** a message whose content is shorter than the minimum bubble height is rendered
- **THEN** the bubble SHALL still occupy at least 20 dp of height

#### Scenario: Consecutive messages from one sender
- **WHEN** a message is the last in a run from the same sender
- **THEN** its tail corner SHALL use the reduced radius that marks the end of the run
- **AND** non-final messages in the run SHALL use the uniform radius

### Requirement: Bubble content order is preserved
The row SHALL render bubble content in a fixed order so that a message carrying several content kinds always composes identically: leading custom view, image, video, audio, text, then trailing custom view. The audio slot SHALL be retained even though the application does not currently send audio messages.

#### Scenario: Message carries both media and text
- **WHEN** a message has both an image and a text caption
- **THEN** the image SHALL render above the text

#### Scenario: Message carries a custom view
- **WHEN** a message supplies a custom view and the bottom placement flag is not set
- **THEN** the custom view SHALL render before all media and text content

#### Scenario: Message carries a bottom-placed custom view
- **WHEN** a message supplies a custom view and the bottom placement flag is set
- **THEN** the custom view SHALL render after all media and text content

### Requirement: Text content retains link detection
Message text SHALL continue to be rendered by GiftedChat's `MessageText` component so that URL, phone-number, and email detection, scheme repair for schemeless addresses, and link-open failure handling are preserved rather than reimplemented.

#### Scenario: Message contains a URL
- **WHEN** a message body contains a web address
- **THEN** the address SHALL render as a tappable link
- **AND** tapping it SHALL open the address, including when the address omits its scheme

#### Scenario: Message contains a phone number
- **WHEN** a message body contains a phone number
- **THEN** the number SHALL render as a tappable link

## MODIFIED Requirements

### Requirement: Outbound delivery state has one visual owner
Each outbound message SHALL display no more than one delivery-state indicator derived from the existing message state. Because the row no longer renders GiftedChat's `Bubble`, the application's own indicator is the sole source and there is no library indicator left to suppress.

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
