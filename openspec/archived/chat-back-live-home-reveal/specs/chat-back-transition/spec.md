## ADDED Requirements

### Requirement: Back reveal shows the live Chat Home

While a conversation is on top of the Chat stack, the Chat Home screen below it SHALL
remain attached to the window, so the surface revealed by the back transition is the live
Chat Home (conversation list, header chrome, sub-tab bar) and never a captured frame of it.

#### Scenario: Card shrink reveals live content

- **WHEN** the user starts a back gesture or a back press from a conversation on Android
- **THEN** the area revealed around the shrinking conversation card SHALL show the current
  Chat Home content
- **AND** no processed bitmap of a previous Chat Home frame SHALL be used as the reveal
  background

#### Scenario: Revealed list reflects updates made during the conversation

- **WHEN** the conversation list changed while the conversation was open (a message arrived,
  an unread badge changed, a row was added or removed)
- **THEN** the revealed Chat Home SHALL show the updated list
- **AND** it SHALL NOT show the list as it looked when the conversation was opened

#### Scenario: No snapshot capture runs

- **WHEN** a conversation is opened
- **THEN** no window pixel capture SHALL be performed for back-reveal purposes
- **AND** no diagnostics log line reporting a captured back snapshot SHALL be emitted

### Requirement: Chat presentation keeps the screen below attached

The conversation route SHALL be presented with a translucent stack presentation so the
native stack retains the screen beneath it, and the app SHALL still receive the full
conversation viewport, correct safe-area insets and keyboard-driven resize.

#### Scenario: Chat fills the viewport while translucent

- **WHEN** a conversation is open
- **THEN** the conversation UI SHALL cover the full window, including behind the status bar
  and navigation bar
- **AND** the header SHALL respect the top safe-area inset
- **AND** the composer SHALL be pushed above the software keyboard when it opens

#### Scenario: Pop completes with the previous screen restored

- **WHEN** the user leaves the conversation
- **THEN** the Chat Home screen SHALL be fully interactive once the pop transition ends
- **AND** the native stack SHALL contain exactly the Chat Home screen

### Requirement: Bottom dock return is synchronised with the pop transition

When the floating bottom dock is suppressed by a fullscreen route, its return on pop SHALL
be driven by the route's own transition-end signal rather than a fixed delay, and its
appearance SHALL NOT include vertical travel.

#### Scenario: Dock appears as the conversation card finishes leaving

- **WHEN** a conversation pop transition ends
- **THEN** the bottom dock SHALL begin becoming visible in that same frame
- **AND** it SHALL fade in over approximately 80 ms
- **AND** it SHALL NOT translate vertically while appearing

#### Scenario: Dock stays hidden for the whole pop

- **WHEN** a conversation pop transition is in progress
- **THEN** the bottom dock SHALL remain fully hidden
- **AND** it SHALL NOT paint over the conversation card

#### Scenario: Transition-end signal never arrives

- **WHEN** a conversation pop is initiated but no transition-end signal is delivered
- **THEN** the dock SHALL still return within 350 ms of the pop being committed
- **AND** the dock SHALL NOT remain permanently hidden

#### Scenario: Route leaves without a pop

- **WHEN** the conversation screen is removed without a pop transition (for example the
  navigation tree is reset or the user logs out)
- **THEN** the dock suppression SHALL be released immediately

#### Scenario: Other fullscreen routes match the dock behaviour

- **WHEN** the user returns from any other fullscreen route that suppresses the dock
- **THEN** the dock SHALL fade in without vertical travel, using the same reveal rule

### Requirement: Back-transition state is not carried across sessions

The native back machinery SHALL hold no per-conversation reveal state, so no bitmap or
cached frame can leak, be recycled late, or be shown for the wrong conversation.

#### Scenario: Repeated open and close cycles

- **WHEN** the user opens and closes several conversations in a row
- **THEN** each back transition SHALL reveal the current Chat Home content
- **AND** memory held for back reveal SHALL NOT grow with the number of opened
  conversations

#### Scenario: Rapid back immediately after opening

- **WHEN** the user opens a conversation and backs out before the push transition finishes
- **THEN** the back transition SHALL still reveal live Chat Home content
- **AND** it SHALL NOT reveal an empty or stale surface

#### Scenario: Gesture cancelled mid-way

- **WHEN** the user starts a back gesture and releases it without committing the pop
- **THEN** the conversation card SHALL return to its resting size
- **AND** the bottom dock SHALL remain hidden
- **AND** the Chat Home content visible around the card SHALL be live
