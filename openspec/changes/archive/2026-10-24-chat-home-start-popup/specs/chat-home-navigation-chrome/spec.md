## MODIFIED Requirements

### Requirement: Search-first Chat home header

The Chat home header SHALL present universal search and the add action in one shared command dock with visually separated touch targets. The header's frosted chrome (wordmark 87x15 at TOP 1, dock pill 36, gap 6, box height insets.top + 58, ChromeEdgeScrim background) SHALL be rendered by the shared `FrostedHeaderBox` component. Chat SHALL render the QR scanner action as a standalone dock icon next to add; pressing `+` SHALL open the two-action start popup.

#### Scenario: User opens universal search

- **WHEN** the user presses the search portion of the header
- **THEN** the app SHALL navigate to the existing Universal Search screen

#### Scenario: User opens QR scanning

- **WHEN** the user presses the QR dock icon on the Chat home header
- **THEN** the app SHALL open the existing QR scanner without first triggering universal search

### Requirement: Accessible header actions

Search and add actions SHALL expose descriptive accessibility labels and SHALL have non-overlapping touch targets of at least 48dp.

The add action SHALL use a glyph from the icon family, size, and semantic primary color established by the dock's other actions. The command dock SHALL use spacing rather than visible divider lines between its actions and SHALL be inset from the header content edges.

The command dock SHALL default to a static neutral perimeter without a persistent semantic-primary outline or border animation. When a caller opts in via the animated dock border affordance, the dock MAY render a resting brand-gradient stroke plus a one-shot semantic-primary light trace that sweeps the perimeter once on first mount and does not repeat during the session. All other callers SHALL receive the static neutral default.

The header SHALL NOT render a separator rule between the command dock area and the Chat sub-tab bar.

#### Scenario: User activates add

- **WHEN** the user presses the add action
- **THEN** the "Bắt đầu mới" start popup SHALL open, offering "Tạo nhóm" and "Nhắn tin mới"

#### Scenario: Screen reader announces add

- **WHEN** a screen reader focuses the add action
- **THEN** it SHALL announce "Tạo trò chuyện mới" as the label and a hint naming the two available actions
