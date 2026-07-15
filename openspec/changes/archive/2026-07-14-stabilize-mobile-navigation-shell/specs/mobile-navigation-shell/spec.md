## ADDED Requirements

### Requirement: Primary navigation does not obscure content
The mobile navigation shell SHALL allocate enough layout and safe-area space for the primary tab bar so interactive content remains visible and reachable.

#### Scenario: User reaches the final list item
- **WHEN** a user scrolls any primary-tab list to its end
- **THEN** the final item and its actions SHALL be fully visible above the tab bar
- **AND** no screen SHALL depend on a hard-coded approximation of the tab bar height

#### Scenario: Device has a bottom safe area
- **WHEN** the app runs on a device with a non-zero bottom inset
- **THEN** the tab bar SHALL remain inside the safe area
- **AND** content clearance SHALL include that inset exactly once

### Requirement: Navigation shell follows the active theme
All persistent navigation surfaces SHALL derive background, foreground, selected, and border colors from semantic theme tokens.

#### Scenario: User enables dark mode
- **WHEN** the active theme changes to dark
- **THEN** the primary dock, Chat destination row, headers, and route transition backgrounds SHALL render with dark semantic surfaces
- **AND** no white flash or forced white scene background SHALL appear

#### Scenario: Dock icon colors derive from theme tokens
- **WHEN** the primary dock renders destination icons
- **THEN** active and inactive icon colors SHALL be sourced from semantic theme tokens (e.g. `colors.primary`, `colors.textMuted`)
- **AND** no icon color SHALL use a static import from `koolaColors` or a hard-coded hex value

### Requirement: Chat destinations are understandable and reachable
The Chat destination row SHALL present visible labels and SHALL expose the core Calls destination.

#### Scenario: User scans Chat destinations
- **WHEN** the Chat home is visible
- **THEN** each destination SHALL show an icon and a short visible Vietnamese label
- **AND** the accessible name SHALL match the visible destination meaning

#### Scenario: User opens Calls
- **WHEN** the user selects the Calls destination
- **THEN** the app SHALL navigate to the existing call-history experience
- **AND** back navigation SHALL return to the expected Chat context

### Requirement: Chat entry behavior is deterministic
Selecting the primary Chat destination SHALL not unexpectedly reopen an unfinished nested destination.

#### Scenario: User returns to Chat from another primary destination
- **WHEN** the user selects Chat while Shopping, Connect, Services, or Personal is active
- **THEN** Messages SHALL be the visible Chat destination

#### Scenario: User reselects Chat
- **WHEN** Chat is already active and the user selects it again
- **THEN** the nested destination SHALL return to Messages without adding duplicate routes

#### Scenario: Reset propagates to nested Chat tab navigator
- **WHEN** a reselect or cross-tab return targets Messages
- **THEN** both `MainNavigator` and the child `ChatHomeScreen` top-tab navigator SHALL receive the reset signal
- **AND** a no-op guard on the outer navigator while already focused SHALL NOT prevent the inner navigator from resetting to the Messages tab

### Requirement: Pushed screens provide an in-app exit
Every pushed mobile screen that hides the native stack header SHALL provide a visible and accessible in-app back affordance.

#### Scenario: User opens account management
- **WHEN** AccountList is pushed from Personal or Settings
- **THEN** a visible back control SHALL return to the originating screen
- **AND** hardware or gesture back SHALL remain functional

### Requirement: Navigation transitions remain visually stable
Primary and nested navigation transitions SHALL not expose black masks, stale snapshots, or incomplete shell fragments.

#### Scenario: User rapidly changes tabs
- **WHEN** the user changes primary tabs repeatedly during normal rendering load
- **THEN** headers, destination rows, content, and dock SHALL remain coherently rendered
- **AND** the fix SHALL preserve existing chat `freezeOnBlur` behavior
