## ADDED Requirements

### Requirement: Shared Frosted Header Box Exists As Single Source

A shared component `FrostedHeaderBox` SHALL render the frosted header chrome used by multiple tabs. It SHALL compose `ChromeEdgeScrim` (scrim fading to 0 at the bottom of the status bar), the KOOLA wordmark image at exactly 87x15 positioned at `insets.top + 1` centered horizontally, and a dock slot at `insets.top + 22` containing a `HeaderSearchDock` pill at fixed height 36. The box height SHALL be `insets.top + 58` (`TOP 1 + WORDMARK 15 + GAP 6 + DOCK 36`). The box SHALL be absolutely positioned at `top: 0, left: 0, right: 0` with `zIndex: 20` and `overflow: hidden`.

#### Scenario: Geometry matches Chat original

- **WHEN** `FrostedHeaderBox` renders on any tab
- **THEN** the wordmark top equals `insets.top + 1`, the wordmark size is 87x15, the dock top equals `insets.top + 22`, and the box height equals `insets.top + 58`

#### Scenario: No double wordmark

- **WHEN** a tab that uses `FrostedHeaderBox` is the focused route in its stack
- **THEN** the stack-level `NotchHeader` wordmark SHALL be hidden so only one KOOLA wordmark is visible

### Requirement: Dock Is Configurable Via Right Actions

`FrostedHeaderBox` SHALL accept an optional `rightActions` React node rendered to the right of the search action inside the same `HeaderSearchDock` pill. `HeaderSearchDock` SHALL accept optional `rightActions` and an optional `hiddenProgress` shared value that fades the pill fill via smoothstep. When `rightActions` is absent, the pill SHALL render only the search pressable stretching to full width. `ConnectHome` SHALL pass no `rightActions`, yielding a search-only pill.

#### Scenario: Connect shows search-only pill

- **WHEN** the user opens the Ket noi tab
- **THEN** the header pill contains only the "Tim kiem" search action with no icon buttons on the right

#### Scenario: Chat shows search plus right actions

- **WHEN** the user opens the Tro chuyen tab
- **THEN** the header pill contains the search action plus QR and add icon buttons on the right

#### Scenario: Search pill remains accessible when search-only

- **WHEN** the pill renders without right actions
- **THEN** the search pressable SHALL have `accessibilityRole="button"`, `accessibilityLabel="Tim kiem"`, and a hittable area of at least 44dp

### Requirement: List Content Starts Below the Shared Box

Lists below `FrostedHeaderBox` SHALL offset their content so the first row is fully visible at scroll position 0. Chat SHALL use `paddingTop` equal to `blockH` plus its sub-tab bar; Connect SHALL use `paddingTop` equal to `blockH` plus its filter row reserve.

#### Scenario: First row not obscured at top

- **WHEN** the user opens either tab at scroll position 0
- **THEN** the first list item is fully visible below the frosted box with no part hidden underneath

### Requirement: Content-Ready Fallback

When `contentReady` is false, `FrostedHeaderBox` SHALL render a solid fallback fill (`isDark ? CHROME_FALLBACK_DARK : CHROME_FALLBACK_LIGHT`) instead of `ChromeEdgeScrim` so the header is not transparent over skeleton content.

#### Scenario: Skeleton not visible through glass

- **WHEN** the tab is in its initial skeleton state
- **THEN** the header shows a solid fallback, not a translucent scrim
